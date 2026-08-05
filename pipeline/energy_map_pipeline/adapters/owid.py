"""Adapter for Our World in Data grapher CSV exports.

Two independent limits decide which rows reach published output, and they are
deliberately kept separate so provenance stays honest:

* ``first_licensed_year`` — a LICENCE gate. The OWID electricity series mix
  Ember data (CC BY 4.0, verified) with Energy Institute data whose
  redistribution terms could not be verified, so the EI-covered span is
  excluded. Ember covers 2000 onward for generation and the by-source split
  (1990+ for Europe, but the CSV carries no row-level provenance, so the
  conservative global cut is year >= 2000); demand is Ember throughout.
* ``PUBLISH_FROM_YEAR`` — a PRODUCT scope decision: the atlas currently shows
  2000 onward so every metric shares one span. It is not a legal constraint.

The effective cut is the later of the two; ``exclusion_reason()`` reports
which one applied, and that reason is carried into coverage and sources.json.
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

# Product scope: the atlas shows 2000 onward for every metric.
PUBLISH_FROM_YEAR = 2000


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
    # Which raw CSV this column comes from (several datasets share one file).
    raw_name: str
    # First year the SOURCE itself provides, used to describe what we dropped.
    source_first_year: int
    # None for a whole-system total; otherwise the generation source id.
    energy_source: str | None = None
    # Metric this dataset measures; per-source datasets share one metric.
    metric: str = ""

    @property
    def first_published_year(self) -> int:
        return max(self.first_licensed_year, PUBLISH_FROM_YEAR)

    def exclusion_reasons(self) -> list[str]:
        """Why earlier source years are absent — licence and scope, separately."""
        reasons: list[str] = []
        if self.first_licensed_year > self.source_first_year:
            reasons.append(
                f"{self.source_first_year}-{self.first_licensed_year - 1} excluded for LICENCE "
                "reasons: those years derive from the Energy Institute Statistical Review, whose "
                "redistribution terms could not be verified (docs/data-source-register.md). "
                "Ember data, which covers the published span, is CC BY 4.0."
            )
        scope_from = max(self.source_first_year, self.first_licensed_year)
        if PUBLISH_FROM_YEAR > scope_from:
            reasons.append(
                f"{scope_from}-{PUBLISH_FROM_YEAR - 1} omitted as a PRODUCT SCOPE decision: this "
                f"atlas publishes {PUBLISH_FROM_YEAR} onward so every metric shares one span. "
                "No licence restriction applies to those years."
            )
        return reasons


BY_SOURCE_CSV_URL = (
    "https://ourworldindata.org/grapher/electricity-production-by-source.csv"
    "?v=1&csvType=full&useColumnShortNames=false"
)
BY_SOURCE_METADATA_URL = (
    "https://ourworldindata.org/grapher/electricity-production-by-source.metadata.json"
    "?v=1&csvType=full&useColumnShortNames=false"
)

# The by-source CSV's column order, pinned exactly for the schema gate. This
# is the SOURCE's order and is deliberately separate from our display order
# below — reordering the display must never weaken the drift check.
BY_SOURCE_CSV_COLUMNS = [
    "Coal",
    "Gas",
    "Nuclear",
    "Hydropower",
    "Solar",
    "Oil",
    "Wind",
    "Bioenergy",
    "Other renewables",
]

# CSV column -> (source id, display title, first year the source provides).
# Order here is the DISPLAY order: fossil, nuclear, then renewables.
BY_SOURCE_COLUMNS: list[tuple[str, str, str, int]] = [
    ("Coal", "coal", "Coal", 1985),
    ("Gas", "gas", "Gas", 1985),
    ("Oil", "oil", "Oil", 1985),
    ("Nuclear", "nuclear", "Nuclear", 1965),
    ("Hydropower", "hydro", "Hydropower", 1965),
    ("Wind", "wind", "Wind", 1965),
    ("Solar", "solar", "Solar", 1965),
    ("Bioenergy", "bioenergy", "Bioenergy", 1990),
    ("Other renewables", "other-renewables", "Other renewables", 1990),
]


def assert_by_source_header(fieldnames: list[str]) -> None:
    """The sum-vs-total identity assumes exactly these nine source columns.

    A tenth column, a rename or a reorder would silently break it, so the
    header is pinned rather than probed column by column.
    """
    expected = ["Entity", "Code", "Year"] + BY_SOURCE_CSV_COLUMNS
    if fieldnames != expected:
        raise SchemaDriftError(
            "electricity-production-by-source: unexpected header.\n"
            f"  expected: {expected}\n"
            f"  actual:   {fieldnames}"
        )


def _by_source_specs() -> dict[str, OwidDatasetSpec]:
    known = set(BY_SOURCE_CSV_COLUMNS)
    unknown = [c for c, _, _, _ in BY_SOURCE_COLUMNS if c not in known]
    if unknown or len(BY_SOURCE_COLUMNS) != len(BY_SOURCE_CSV_COLUMNS):
        raise SchemaDriftError(
            f"display columns disagree with the pinned CSV columns: {unknown or 'count mismatch'}"
        )
    specs: dict[str, OwidDatasetSpec] = {}
    for column, source_id, title, source_first_year in BY_SOURCE_COLUMNS:
        dataset_id = f"electricity-generation-{source_id}"
        specs[dataset_id] = OwidDatasetSpec(
            dataset_id=dataset_id,
            source_id="owid-electricity-by-source",
            csv_url=BY_SOURCE_CSV_URL,
            metadata_url=BY_SOURCE_METADATA_URL,
            value_column=column,
            unit="TWh",
            title=title,
            # Ember covers 2000 onward; earlier years mix in Energy Institute
            # data whose redistribution terms are unverified.
            first_licensed_year=2000,
            raw_name="electricity-production-by-source",
            source_first_year=source_first_year,
            energy_source=source_id,
            metric="electricity-generation",
        )
    return specs


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
        title="All sources",
        first_licensed_year=2000,
        raw_name="electricity-generation",
        source_first_year=1985,
        energy_source=None,
        metric="electricity-generation",
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
        raw_name="electricity-demand",
        source_first_year=1990,
        energy_source=None,
        metric="electricity-demand",
    ),
    **_by_source_specs(),
}

# Metric id -> human label, for grouping datasets in the manifest and the UI.
METRIC_TITLES = {
    "electricity-generation": "Electricity generation",
    "electricity-demand": "Electricity demand",
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
    # Exact match first: several by-source columns are short words and a
    # prefix match could silently bind to the wrong one after a schema change.
    if spec.value_column in fieldnames:
        value_column = spec.value_column
    else:
        candidates = [c for c in fieldnames if c.startswith(spec.value_column)]
        if len(candidates) != 1:
            raise SchemaDriftError(
                f"{spec.dataset_id}: expected exactly one column matching "
                f"{spec.value_column!r}, found {candidates or 'none'} in {fieldnames}"
            )
        value_column = candidates[0]

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
            if year >= spec.first_published_year:
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
        if year < spec.first_published_year:
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
