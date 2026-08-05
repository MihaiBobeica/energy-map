"""Adapter for Our World in Data grapher CSV exports.

Licence gate (docs/data-source-register.md): the OWID electricity series mix
Ember data (CC BY 4.0, verified) with Energy Institute data whose
redistribution terms could not be verified. Rows in the EI-covered span are
therefore EXCLUDED from published output:

* electricity-generation: Ember covers 2000 onward (1990+ for Europe, but the
  CSV carries no row-level provenance, so the conservative global cut is
  year >= 2000).
* electricity-demand: Ember throughout (1990 onward) — no exclusion.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path

ISO3_RE = re.compile(r"^[A-Z]{3}$")

# OWID special codes that map onto geometry codes we publish.
OWID_CODE_REMAP = {
    "OWID_KOS": "KOS",  # Kosovo: no official ISO 3166-1 alpha-3; Natural Earth uses KOS
}

WORLD_CODE = "OWID_WRL"


@dataclass(frozen=True)
class OwidDatasetSpec:
    dataset_id: str
    source_id: str
    csv_url: str
    metadata_url: str
    value_column: str
    unit: str
    title: str
    # First year whose licence chain is fully verified (rows before this are
    # excluded; the reason is recorded in the coverage notes).
    first_licensed_year: int


DATASETS: dict[str, OwidDatasetSpec] = {
    "electricity-generation": OwidDatasetSpec(
        dataset_id="electricity-generation",
        source_id="owid-electricity-generation",
        csv_url=(
            "https://ourworldindata.org/grapher/electricity-generation.csv"
            "?v=1&csvType=full&useColumnShortNames=false"
        ),
        metadata_url=(
            "https://ourworldindata.org/grapher/electricity-generation.metadata.json"
            "?v=1&csvType=full&useColumnShortNames=false"
        ),
        value_column="Total electricity",
        unit="TWh",
        title="Electricity generation",
        first_licensed_year=2000,
    ),
    "electricity-demand": OwidDatasetSpec(
        dataset_id="electricity-demand",
        source_id="owid-electricity-demand",
        csv_url=(
            "https://ourworldindata.org/grapher/electricity-demand.csv"
            "?v=1&csvType=full&useColumnShortNames=false"
        ),
        metadata_url=(
            "https://ourworldindata.org/grapher/electricity-demand.metadata.json"
            "?v=1&csvType=full&useColumnShortNames=false"
        ),
        value_column="Electricity demand",
        unit="TWh",
        title="Electricity demand",
        first_licensed_year=1990,
    ),
}


class SchemaDriftError(RuntimeError):
    """Raised when a source file does not look like what the adapter expects."""


@dataclass(frozen=True)
class OwidDataset:
    spec: OwidDatasetSpec
    dataset_version: str
    # {iso3: {year: value}} — absent year means missing; 0.0 stays 0.0.
    values: dict[str, dict[int, float]]
    # {year: value} for the OWID world aggregate.
    world: dict[int, float]
    # Entities excluded (aggregates, unlicensed span), for the join report.
    excluded_entities: list[str]
    excluded_row_count: int


def parse_owid_csv(spec: OwidDatasetSpec, csv_text: str, dataset_version: str) -> OwidDataset:
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    expected = ["Entity", "Code", "Year"]
    if fieldnames[:3] != expected:
        raise SchemaDriftError(
            f"{spec.dataset_id}: expected leading columns {expected}, got {fieldnames[:3]}"
        )
    value_column = next((c for c in fieldnames if c.startswith(spec.value_column)), None)
    if value_column is None:
        raise SchemaDriftError(
            f"{spec.dataset_id}: no column starting with {spec.value_column!r} in {fieldnames}"
        )

    values: dict[str, dict[int, float]] = {}
    world: dict[int, float] = {}
    excluded_entities: set[str] = set()
    excluded_rows = 0

    for row in reader:
        raw_code = (row.get("Code") or "").strip()
        code = OWID_CODE_REMAP.get(raw_code, raw_code)
        year_text = (row.get("Year") or "").strip()
        value_text = (row.get(value_column) or "").strip()
        if not year_text:
            raise SchemaDriftError(f"{spec.dataset_id}: row without Year: {row!r}")
        year = int(year_text)
        if value_text == "":
            continue  # missing stays missing — never coerced to zero
        value = float(value_text)

        if raw_code == WORLD_CODE:
            if year >= spec.first_licensed_year:
                world[year] = value
            else:
                excluded_rows += 1
            continue
        if not ISO3_RE.match(code):
            # Continents, income groups and other aggregates are never
            # treated as countries.
            excluded_entities.add(row.get("Entity") or raw_code or "<unknown>")
            excluded_rows += 1
            continue
        if year < spec.first_licensed_year:
            excluded_rows += 1
            continue
        values.setdefault(code, {})[year] = value

    if not values:
        raise SchemaDriftError(f"{spec.dataset_id}: no country rows parsed")
    return OwidDataset(
        spec=spec,
        dataset_version=dataset_version,
        values=values,
        world=world,
        excluded_entities=sorted(excluded_entities),
        excluded_row_count=excluded_rows,
    )


def dataset_version_from_metadata(metadata_path: Path) -> str:
    """Extract a stable dataset version (the source's last-update date)."""
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    columns = metadata.get("columns")
    if isinstance(columns, dict):
        for column in columns.values():
            last_updated = column.get("lastUpdated")
            if isinstance(last_updated, str) and last_updated:
                return last_updated
    date_downloaded = metadata.get("dateDownloaded")
    if isinstance(date_downloaded, str) and date_downloaded:
        return date_downloaded
    raise SchemaDriftError(f"{metadata_path.name}: no lastUpdated/dateDownloaded in metadata")
