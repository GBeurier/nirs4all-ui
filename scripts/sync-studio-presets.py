#!/usr/bin/env python3
"""Snapshot the authoritative Studio preset YAML files for shared UI consumers."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import yaml


def snapshot(studio: Path) -> dict:
    presets = []
    hashes = {}
    for source in sorted((studio / "api" / "presets").glob("*.yaml")):
        data = yaml.safe_load(source.read_text(encoding="utf-8"))
        hashes[source.name] = hashlib.sha256(source.read_bytes()).hexdigest()
        default = data["default_variant"]
        data.update(available_variants=list(data["variants"]), steps_count=len(data["variants"][default]["pipeline"]))
        presets.append(data)
    if not presets:
        raise ValueError(f"No Studio presets found in {studio}")
    return {
        "source": "nirs4all-studio/api/presets",
        "commit": subprocess.check_output(["git", "-C", str(studio), "rev-parse", "HEAD"], text=True).strip(),
        "files_sha256": hashes,
        "presets": sorted(presets, key=lambda preset: preset["complexity"]),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "src" / "pipelines" / "studio-presets.json"
    content = json.dumps(snapshot(args.studio.resolve()), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if output.read_text(encoding="utf-8") != content:
            raise SystemExit("Shared Studio presets are stale; regenerate the snapshot.")
    else:
        output.write_text(content, encoding="utf-8")
