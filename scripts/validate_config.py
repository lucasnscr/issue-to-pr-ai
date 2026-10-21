"""Validate source configuration without a cluster, credentials, or model calls."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import yaml

ROOT = Path(__file__).resolve().parents[1]


def main():
    count = 0
    for pattern in ("*.yml", "*.yaml"):
        for file in ROOT.rglob(pattern):
            if any(part in {".git", ".tools", ".venv", "target"} for part in file.parts):
                continue
            with file.open() as stream:
                list(yaml.safe_load_all(stream))
            count += 1
    for file in (ROOT / "pom.xml", ROOT / "apps/catalog-api/pom.xml"):
        ET.parse(file)
    config = json.loads((ROOT / "opencode.json").read_text())
    assert config["share"] == "disabled", "OpenCode sessions must remain private"
    assert config["agent"]["reviewer"]["permission"] == {"*": "deny"}
    # OpenCode 1.19.3 appends an assistant prefill at the agent step boundary;
    # Claude 4.6 rejects that request. The external review policy enforces 1 step.
    assert "steps" not in config["agent"]["reviewer"], "Limit review steps in the supervisor, not with CLI assistant prefill"
    policy = json.loads((ROOT / "config/ai-policy.json").read_text())
    loop = json.loads((ROOT / "config/engineering-loop.json").read_text())
    assert loop["version"] == 1 and loop["maxAttempts"] == 2
    assert policy["profiles"]["correction"]["maxEstimatedCostUsd"] == loop["maxCorrectionEstimatedUsd"]
    assert policy["profiles"]["review"]["maxEstimatedCostUsd"] == loop["maxReviewEstimatedUsd"]
    evaluation = json.loads((ROOT / "config/review-evaluation.json").read_text())
    assert evaluation["version"] == 1 and evaluation["maxLiveCases"] == 6
    assert policy["profiles"]["review"]["maxEstimatedCostUsd"] <= evaluation["maxEstimatedBudgetUsd"] <= 2
    evaluation_workflow = (ROOT / ".github/workflows/ai-review-evaluation.yml").read_text()
    assert f'opencode-ai@{evaluation["opencodeVersion"]}' in evaluation_workflow
    assert loop["maxEstimatedBudgetUsd"] == loop["maxReviewEstimatedUsd"] + loop["maxAttempts"] * (
        loop["maxCorrectionEstimatedUsd"] + loop["maxReviewEstimatedUsd"]
    )
    correction_jobs = yaml.safe_load((ROOT / ".github/workflows/ai-correct.yml").read_text())["jobs"]
    for job in ("prepare", "report"):
        assert correction_jobs[job]["permissions"]["pull-requests"] == "write", "PR conversation comments require PR write access"
    assert correction_jobs["correct"]["permissions"]["contents"] == "read"
    assert correction_jobs["correct"]["permissions"]["pull-requests"] == "read"
    protection = json.loads((ROOT / "config/branch-protection.json").read_text())
    assert "AI review gate" in protection["required_status_checks"]["contexts"]
    review_jobs = yaml.safe_load((ROOT / ".github/workflows/ai-review.yml").read_text())["jobs"]
    assert "github.event_name == 'workflow_dispatch'" in review_jobs["review"]["if"]
    assert "github.ref_name == github.event.repository.default_branch" in review_jobs["review"]["if"]
    activation = next(step for step in review_jobs["review"]["steps"] if step.get("name") == "Persist review requirement before inference")
    assert activation["if"].startswith("always()"), "Failed patch preparation must still persist review authorization"
    for file in ("ai-review-gate.yml", "ai-review-gate-events.yml"):
        text = (ROOT / ".github/workflows" / file).read_text()
        workflow = yaml.safe_load(text)
        assert "secrets." not in text and "download-artifact" not in text
        for job in workflow["jobs"].values():
            for step in job["steps"]:
                assert "run" not in step, "Metadata-only gate must not execute candidate shell commands"
                if step.get("uses", "").startswith("actions/checkout@"):
                    assert step["with"]["ref"] == "${{ github.event.repository.default_branch }}"
                    assert step["with"]["persist-credentials"] is False
    gate = yaml.safe_load((ROOT / ".github/workflows/ai-review-gate.yml").read_text())
    assert gate["jobs"]["reconcile"]["permissions"]["checks"] == "write"
    assert gate["concurrency"]["cancel-in-progress"] is False
    for directory in ("application", "inference"):
        base = ROOT / "infra/kubernetes" / directory
        data = yaml.safe_load((base / "kustomization.yaml").read_text())
        for resource in data["resources"]:
            assert (base / resource).is_file(), f"Missing Kubernetes resource: {resource}"
    print(f"Validated {count} YAML files, Maven POMs, and OpenCode invariants.")


if __name__ == "__main__":
    main()
