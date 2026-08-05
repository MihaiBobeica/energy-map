"""Download stage: fetch permitted automated sources into data/raw/.

Every retrieved file is recorded in data/raw/download-manifest.json with its
URL, SHA-256 and retrieval timestamp. Raw files are never committed and never
deployed; they are inputs to export-static.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

from energy_map_pipeline.adapters.natural_earth import NE_50M_COUNTRIES_URL
from energy_map_pipeline.adapters.owid import DATASETS

USER_AGENT = "energy-map-pipeline/0.1 (+https://github.com/MihaiBobeica/energy-map)"

DOWNLOADS: dict[str, str] = {
    "owid/electricity-generation.csv": DATASETS["electricity-generation"].csv_url,
    "owid/electricity-generation.metadata.json": DATASETS["electricity-generation"].metadata_url,
    "owid/electricity-demand.csv": DATASETS["electricity-demand"].csv_url,
    "owid/electricity-demand.metadata.json": DATASETS["electricity-demand"].metadata_url,
    "natural-earth/ne_50m_admin_0_countries.geojson": NE_50M_COUNTRIES_URL,
}


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_all(raw_root: Path) -> int:
    raw_root.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, str | int]] = {}
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    for relative, url in sorted(DOWNLOADS.items()):
        target = raw_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        print(f"download: {url}")
        response = session.get(url, timeout=300)
        response.raise_for_status()
        target.write_bytes(response.content)
        manifest[relative] = {
            "url": url,
            "sha256": sha256_of(target),
            "bytes": target.stat().st_size,
            "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        print(f"  -> {relative} ({manifest[relative]['bytes']} bytes)")

    manifest_path = raw_root / "download-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"download: wrote {manifest_path}")
    return 0
