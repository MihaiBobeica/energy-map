"""Adapter for OWID population, used only as the denominator for per-capita.

Population is NOT an energy metric and is never displayed on the map on its
own. It exists so the frontend can derive kWh per person from an observed
electricity total.

The source splits into two columns that this adapter keeps strictly apart:

* ``Population`` — UN WPP **estimates**, through 2023.
* ``Population (projections) (Projected)`` — UN WPP 2024 **medium-variant
  projections**, 2024 onward.

Electricity statistics run ahead of population estimates, so without the
projection column per-capita simply stops two years early. Publishing the
projection extends it, but a projected denominator is a materially weaker
input than an estimated one, so every year is tagged with which column it
came from and the UI labels projection-backed values differently. The one
thing never done is silently concatenating the two, which is exactly what the
``population`` column of owid-energy-data.csv does.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from energy_map_pipeline.adapters.owid import (
    ISO3_RE,
    OWID_CODE_REMAP,
    PUBLISH_FROM_YEAR,
    SchemaDriftError,
)

POPULATION_CSV_URL = (
    "https://ourworldindata.org/grapher/population-long-run-with-projections.csv"
    "?v=1&csvType=full&useColumnShortNames=false"
)
POPULATION_METADATA_URL = (
    "https://ourworldindata.org/grapher/population-long-run-with-projections.metadata.json"
    "?v=1&csvType=full&useColumnShortNames=false"
)

RAW_NAME = "population-long-run-with-projections"
SOURCE_ID = "owid-population"
ESTIMATE_COLUMN = "Population"
PROJECTION_COLUMN = "Population (projections) (Projected)"


@dataclass(frozen=True)
class PopulationDataset:
    dataset_version: str
    # {iso3: {year: people}} — absent year means no denominator exists.
    values: dict[str, dict[int, int]]
    years: list[int]
    # First year backed by a projection rather than an estimate, if any.
    projected_from_year: int | None


def parse_population_csv(
    csv_text: str, dataset_version: str, max_year: int
) -> PopulationDataset:
    """Parse both population columns, capped at ``max_year``.

    ``max_year`` is the last year any electricity dataset covers: the source
    projects to 2100, and shipping decades of unusable denominators would
    bloat the payload and invite per-capita views of years with no numerator.
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    for required in ("Entity", "Code", "Year", ESTIMATE_COLUMN, PROJECTION_COLUMN):
        if required not in fieldnames:
            raise SchemaDriftError(
                f"population: column {required!r} missing; got {fieldnames}"
            )

    values: dict[str, dict[int, int]] = {}
    estimate_years: set[int] = set()
    projection_years: set[int] = set()

    for row in reader:
        raw_code = (row.get("Code") or "").strip()
        code = OWID_CODE_REMAP.get(raw_code, raw_code)
        if not ISO3_RE.match(code):
            continue  # aggregates and regions are never treated as countries
        year_text = (row.get("Year") or "").strip()
        if not year_text:
            continue
        year = int(year_text)
        if year < PUBLISH_FROM_YEAR or year > max_year:
            continue

        estimate = (row.get(ESTIMATE_COLUMN) or "").strip()
        projection = (row.get(PROJECTION_COLUMN) or "").strip()
        # An estimate always wins where both exist: it is the stronger input.
        if estimate != "":
            population = int(float(estimate))
            estimate_years.add(year)
        elif projection != "":
            population = int(float(projection))
            projection_years.add(year)
        else:
            continue

        if population <= 0:
            raise SchemaDriftError(f"population: non-positive value for {code} {year}")
        values.setdefault(code, {})[year] = population

    if not values:
        raise SchemaDriftError("population: no country rows parsed")

    overlap = estimate_years & projection_years
    if overlap:
        raise SchemaDriftError(
            f"population: years {sorted(overlap)} appear as both estimate and projection; "
            "the two must stay separable so the UI can label them differently"
        )

    years = sorted({year for by_year in values.values() for year in by_year})
    projected_from = min(projection_years) if projection_years else None
    if projected_from is not None and estimate_years:
        if projected_from <= max(estimate_years):
            raise SchemaDriftError(
                f"population: projections start at {projected_from}, at or before the last "
                f"estimate {max(estimate_years)} — the split is not a clean boundary"
            )
    return PopulationDataset(
        dataset_version=dataset_version,
        values=values,
        years=years,
        projected_from_year=projected_from,
    )
