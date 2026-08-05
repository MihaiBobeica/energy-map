"""Adapter for OWID population, used only as the denominator for per-capita.

Population is NOT an energy metric and is never displayed on the map on its
own. It exists so the frontend can derive kWh per person from an observed
electricity total. That derivation is only as sound as this denominator, so:

* the series is published exactly as retrieved, with its own source id and
  licence, never merged into an electricity dataset;
* years the source does not cover are simply absent — the per-capita option
  is disabled for those years rather than extrapolated. Population statistics
  lag electricity statistics, so the most recent year or two typically has no
  denominator at all.
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
    "https://ourworldindata.org/grapher/population.csv"
    "?v=1&csvType=full&useColumnShortNames=false"
)
POPULATION_METADATA_URL = (
    "https://ourworldindata.org/grapher/population.metadata.json"
    "?v=1&csvType=full&useColumnShortNames=false"
)

RAW_NAME = "population"
SOURCE_ID = "owid-population"
VALUE_COLUMN = "Population"


@dataclass(frozen=True)
class PopulationDataset:
    dataset_version: str
    # {iso3: {year: people}} — absent year means no denominator exists.
    values: dict[str, dict[int, int]]
    years: list[int]


def parse_population_csv(csv_text: str, dataset_version: str) -> PopulationDataset:
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    expected = ["Entity", "Code", "Year", VALUE_COLUMN]
    if fieldnames[:4] != expected:
        raise SchemaDriftError(
            f"population: expected leading columns {expected}, got {fieldnames[:4]}"
        )

    values: dict[str, dict[int, int]] = {}
    for row in reader:
        raw_code = (row.get("Code") or "").strip()
        code = OWID_CODE_REMAP.get(raw_code, raw_code)
        if not ISO3_RE.match(code):
            continue  # aggregates and regions are never treated as countries
        year_text = (row.get("Year") or "").strip()
        value_text = (row.get(VALUE_COLUMN) or "").strip()
        if not year_text or value_text == "":
            continue
        year = int(year_text)
        if year < PUBLISH_FROM_YEAR:
            continue
        population = int(float(value_text))
        if population <= 0:
            raise SchemaDriftError(f"population: non-positive value for {code} {year}")
        values.setdefault(code, {})[year] = population

    if not values:
        raise SchemaDriftError("population: no country rows parsed")
    years = sorted({year for by_year in values.values() for year in by_year})
    return PopulationDataset(dataset_version=dataset_version, values=values, years=years)
