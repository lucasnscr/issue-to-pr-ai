"""Prepare bounded Graphify AST context without executing repository code or an LLM."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def digest(value):
    return hashlib.sha256(value).hexdigest()


def summarize(graph, *, commit, file_hash, files, version, limit=4000, focus=()):
    nodes, edges = graph.get("nodes", []), graph.get("edges", graph.get("links", []))
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("Unsupported Graphify graph format")
    labels = {n["id"]: str(n.get("label", n["id"]))[:100] for n in nodes if isinstance(n, dict) and "id" in n}
    allowed = set(files)
    ordered = sorted(edges, key=lambda e: (e.get("source_file") not in focus, e.get("source_file", ""), e.get("source_location", "")))
    result = {"version": 1, "tool": "graphify", "toolVersion": version, "backend": "none", "mode": "code-only",
              "sourceCommit": commit, "sourceFilesHash": file_hash,
              "graphHash": digest(json.dumps(graph, sort_keys=True).encode()), "filesScanned": len(files),
              "nodeCount": len(nodes), "edgeCount": len(edges), "relations": [], "omittedEdges": len(edges)}
    for edge in ordered:
        if edge.get("source_file") not in allowed:
            continue
        relation = {"from": labels.get(edge.get("source"), str(edge.get("source")))[:100],
                    "to": labels.get(edge.get("target"), str(edge.get("target")))[:100],
                    "relation": str(edge.get("relation", "related"))[:80],
                    "confidence": edge.get("confidence") if edge.get("confidence") in ("EXTRACTED", "INFERRED") else "UNKNOWN",
                    "file": edge["source_file"], "location": str(edge.get("source_location", ""))[:40]}
        candidate = {**result, "relations": result["relations"] + [relation], "omittedEdges": len(edges) - len(result["relations"]) - 1}
        if len(json.dumps(candidate, ensure_ascii=False, separators=(",", ":")).encode()) > limit:
            continue
        result = candidate
    return result


def prepare(root, command, output, *, focus=()):
    root = Path(root).resolve()
    config = json.loads((root / "config/skills-catalog.json").read_text())["graphify"]
    def git(*args):
        return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.DEVNULL)
    commit = git("rev-parse", "HEAD").decode().strip()
    roots = ["apps/catalog-api/src", "scripts", ".github/scripts"]
    if git("status", "--porcelain", "--untracked-files=no", "--", *roots).strip():
        raise ValueError("Graphify requires clean tracked source from the trusted checkout")
    files = sorted(p for p in git("ls-files", "-z", "--", *roots).decode().split("\0")
                   if p and Path(p).suffix in (".java", ".js", ".mjs", ".cjs", ".py"))
    if not files or len(files) > config["maxFiles"]:
        raise ValueError("Graphify corpus is empty or exceeds its file limit")
    records = []
    with tempfile.TemporaryDirectory(prefix="issue-skills-graph-") as workspace:
        workspace = Path(workspace)
        scan = workspace / "scan"
        scan.mkdir()
        for relative in files:
            source = root / relative
            if source.is_symlink() or source.resolve() != source or not source.is_file():
                raise ValueError("Graphify corpus contains an unsupported path")
            content = source.read_bytes()
            if len(content) > 300000:
                raise ValueError("Graphify source file exceeds its size limit")
            records.append([relative, digest(content)])
            dest = scan / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)
        home = workspace / "home"
        home.mkdir()
        # No provider keys, GitHub tokens, cloud credentials, user configs, or
        # assistant fallback. No install/guard/hook/semantic command is invoked.
        env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "LANG", "LC_ALL") if key in os.environ}
        env.update(HOME=str(home), USERPROFILE=str(home), GRAPHIFY_BACKEND="none", PYTHONNOUSERSITE="1")
        executable = shutil.which(command) if not os.path.isabs(command) else command
        if not executable:
            raise ValueError("Pinned Graphify CLI is missing")
        version = subprocess.check_output([executable, "--version"], env=env, stderr=subprocess.DEVNULL, timeout=10).decode().strip()
        if config["version"] not in version.split():
            raise ValueError("Graphify CLI version does not match the approved catalog")
        subprocess.run([executable, "extract", ".", "--code-only", "--no-cluster", "--no-viz"],
                       cwd=scan, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       check=True, timeout=config["timeoutSeconds"])
        graph_file = scan / "graphify-out/graph.json"
        if not graph_file.is_file() or graph_file.stat().st_size > 25000000:
            raise ValueError("Graphify did not produce a bounded graph")
        graph = json.loads(graph_file.read_text())
        # AST-only extraction must not report any model consumption.
        if graph.get("input_tokens", 0) != 0 or graph.get("output_tokens", 0) != 0:
            raise ValueError("Unexpected semantic/model extraction")
        result = summarize(graph, commit=commit, file_hash=digest(json.dumps(records).encode()), files=files,
                           version=config["version"], limit=config["maxContextBytes"], focus=focus)
        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--command", default="graphify")
    parser.add_argument("--output", required=True)
    parser.add_argument("--focus", action="append", default=[])
    args = parser.parse_args()
    try:
        result = prepare(args.root, args.command, args.output, focus=args.focus)
        print(json.dumps({key: result[key] for key in ("toolVersion", "filesScanned", "nodeCount", "edgeCount", "omittedEdges", "sourceCommit")}))
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError):
        raise SystemExit("Graphify context preparation failed; no model call is authorized.")
