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
    for directory in ("application", "inference"):
        base = ROOT / "infra/kubernetes" / directory
        data = yaml.safe_load((base / "kustomization.yaml").read_text())
        for resource in data["resources"]:
            assert (base / resource).is_file(), f"Missing Kubernetes resource: {resource}"
    print(f"Validated {count} YAML files, Maven POMs, and OpenCode invariants.")


if __name__ == "__main__":
    main()
