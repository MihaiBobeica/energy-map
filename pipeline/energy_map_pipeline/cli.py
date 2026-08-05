"""Command-line entry point for the Energy Map data pipeline.

Stages are introduced by implementation phase; a stage that is not yet
implemented exits with a clear diagnostic instead of pretending to run.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from energy_map_pipeline import __version__

# Stage name -> implementation phase in docs/requirements.md §6.
PLANNED_STAGES: dict[str, int] = {
    "download": 2,
    "normalize": 2,
    "validate-raw": 2,
    "build-geographies": 2,
    "build-country-series": 2,
    "build-regional-series": 5,
    "build-city-features": 6,
    "fit-allocation-model": 7,
    "allocate": 7,
    "validate-allocations": 7,
    "build-tiles": 4,
    "export-static": 2,
    "build-coverage-report": 2,
    "verify-licenses": 2,
}


def verify_output(data_root: Path) -> int:
    """Verify the deployable data directory (implemented from Phase 1).

    Checks that the manifest exists, parses, and that every dataset path it
    references exists. Mirrors ``scripts/verify-data.mjs``.
    """
    errors: list[str] = []
    manifest_path = data_root / "manifest.json"
    if not manifest_path.is_file():
        print(f"verify-output: manifest not found at {manifest_path}", file=sys.stderr)
        return 1
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print(f"verify-output: manifest is not valid JSON: {error}", file=sys.stderr)
        return 1

    if not isinstance(manifest.get("schemaVersion"), str) or not manifest["schemaVersion"]:
        errors.append("manifest.schemaVersion must be a non-empty string")
    if not isinstance(manifest.get("generatedAt"), str) or not manifest["generatedAt"]:
        errors.append("manifest.generatedAt must be a non-empty string")
    datasets = manifest.get("datasets")
    if not isinstance(datasets, list):
        errors.append("manifest.datasets must be an array")
        datasets = []

    for dataset in datasets:
        dataset_id = dataset.get("id", "<no id>") if isinstance(dataset, dict) else "<no id>"
        path_value = dataset.get("path") if isinstance(dataset, dict) else None
        if not isinstance(path_value, str) or not path_value:
            errors.append(f"dataset {dataset_id}: missing path")
            continue
        if path_value.startswith("/") or ".." in path_value:
            errors.append(f"dataset {dataset_id}: path must stay inside the data root")
            continue
        if not (data_root / path_value).exists():
            errors.append(f"dataset {dataset_id}: referenced path {path_value} does not exist")

    if errors:
        print(f"verify-output FAILED for {data_root}:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"verify-output passed for {data_root}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="energy-map-pipeline",
        description="Offline data pipeline for the Energy Map static site.",
    )
    parser.add_argument("--version", action="version", version=__version__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    verify_parser = subparsers.add_parser(
        "verify-output", help="Verify the deployable static data directory"
    )
    verify_parser.add_argument(
        "--data-root",
        type=Path,
        default=Path("public/data"),
        help="Path to the deployable data directory (default: public/data)",
    )

    for stage, phase in PLANNED_STAGES.items():
        subparsers.add_parser(stage, help=f"Planned for implementation phase {phase}")

    args = parser.parse_args(argv)

    if args.command == "verify-output":
        return verify_output(args.data_root)

    phase = PLANNED_STAGES[args.command]
    print(
        f"energy-map-pipeline {args.command}: not implemented yet — "
        f"scheduled for implementation phase {phase} (see docs/requirements.md §6).",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
