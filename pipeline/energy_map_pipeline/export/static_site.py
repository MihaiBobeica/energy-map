"""export-static: transform raw source files into the deployable public/data
tree. Output is deterministic for a given raw input set: stable ordering,
stable rounding, and a generatedAt taken from the download manifest rather
than the wall clock.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from energy_map_pipeline.adapters import natural_earth, owid

SCHEMA_VERSION = "1.0.0"
PROCESSING_VERSION = "0.2.0"
VALUE_DECIMALS = 3

GENERATION_EXCLUSION_NOTE = (
    "Years before 2000 are excluded: they derive from the Energy Institute "
    "Statistical Review, whose redistribution terms are not verified "
    "(docs/data-source-register.md). Ember data (CC BY 4.0) covers 2000 onward."
)


def _round_value(value: float) -> float:
    return round(value, VALUE_DECIMALS)


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n" keeps output byte-identical across platforms — Windows'
    # default text-mode translation would break checksums against a Linux CI.
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _load_retrieved_at(raw_root: Path) -> str:
    manifest_path = raw_root / "download-manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(
            f"{manifest_path} missing — run `energy-map-pipeline download` first"
        )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    timestamps = sorted(str(entry["retrievedAt"]) for entry in manifest.values())
    return timestamps[-1]


def export_static(raw_root: Path, out_root: Path) -> int:
    retrieved_at = _load_retrieved_at(raw_root)

    countries = natural_earth.parse_countries(
        raw_root / "natural-earth/ne_50m_admin_0_countries.geojson"
    )
    iso3_to_country = {c.iso3: c for c in countries}

    datasets: list[owid.OwidDataset] = []
    for dataset_id, spec in owid.DATASETS.items():
        csv_path = raw_root / f"owid/{dataset_id}.csv"
        metadata_path = raw_root / f"owid/{dataset_id}.metadata.json"
        version = owid.dataset_version_from_metadata(metadata_path)
        datasets.append(
            owid.parse_owid_csv(spec, csv_path.read_text(encoding="utf-8"), version)
        )

    # ---- join report ---------------------------------------------------
    join_report: dict[str, Any] = {"retrievedAt": retrieved_at, "datasets": {}}
    for dataset in datasets:
        matched = sorted(set(dataset.values) & set(iso3_to_country))
        without_geometry = sorted(set(dataset.values) - set(iso3_to_country))
        without_data = sorted(set(iso3_to_country) - set(dataset.values))
        join_report["datasets"][dataset.spec.dataset_id] = {
            "matchedCountries": len(matched),
            "dataWithoutGeometry": without_geometry,
            "geometryWithoutData": without_data,
            "excludedEntities": dataset.excluded_entities,
            "excludedRowCount": dataset.excluded_row_count,
        }
        if without_geometry:
            print(
                f"join: {dataset.spec.dataset_id}: no geometry for {without_geometry} "
                "(values kept in country series, absent from the map)"
            )

    # ---- geometry ------------------------------------------------------
    features = [
        {
            "type": "Feature",
            "id": country.numeric_id,
            "properties": {"iso3": country.iso3, "name": country.name},
            "geometry": country.geometry,
        }
        for country in countries
    ]
    _write_json(
        out_root / "geographies/countries.geojson",
        {"type": "FeatureCollection", "features": features},
    )
    _write_json(
        out_root / "geography-index.json",
        {
            "schemaVersion": SCHEMA_VERSION,
            "geometrySource": "natural-earth",
            "geometryVersion": natural_earth.NE_VERSION,
            "countries": [
                {"id": c.numeric_id, "iso3": c.iso3, "name": c.name} for c in countries
            ],
        },
    )

    # ---- per-metric year files ----------------------------------------
    manifest_datasets = []
    coverage_records = []
    for dataset in datasets:
        years = sorted({year for values in dataset.values.values() for year in values})
        year_counts = {
            year: sum(
                1
                for iso3, by_year in dataset.values.items()
                if year in by_year and iso3 in iso3_to_country
            )
            for year in years
        }
        # Default view year: the latest year with broad coverage. Early-release
        # partial years stay on the timeline but are not the landing view.
        max_count = max(year_counts.values())
        default_year = max(
            year for year, count in year_counts.items() if count >= 0.8 * max_count
        )
        for year in years:
            values = {
                iso3: _round_value(by_year[year])
                for iso3, by_year in dataset.values.items()
                if year in by_year and iso3 in iso3_to_country
            }
            payload: dict[str, Any] = {
                "datasetVersion": dataset.dataset_version,
                "evidenceType": "observed",
                "metric": dataset.spec.dataset_id,
                "processingVersion": PROCESSING_VERSION,
                "sourceId": dataset.spec.source_id,
                "unit": dataset.spec.unit,
                "values": dict(sorted(values.items())),
                "year": year,
            }
            if year in dataset.world:
                payload["worldTotal"] = _round_value(dataset.world[year])
            _write_json(out_root / f"years/{dataset.spec.dataset_id}/{year}.json", payload)

        geography_count = len(set(dataset.values) & set(iso3_to_country))
        observation_count = sum(
            len(by_year)
            for iso3, by_year in dataset.values.items()
            if iso3 in iso3_to_country
        )
        manifest_datasets.append(
            {
                "datasetVersion": dataset.dataset_version,
                "defaultYear": default_year,
                "evidenceTypes": ["observed"],
                "id": dataset.spec.dataset_id,
                "metric": dataset.spec.dataset_id,
                "path": f"years/{dataset.spec.dataset_id}",
                "sourceId": dataset.spec.source_id,
                "title": dataset.spec.title,
                "unit": dataset.spec.unit,
                "yearGeographyCounts": [year_counts[year] for year in years],
                "years": years,
            }
        )
        coverage_records.append(
            {
                "evidenceTypes": ["observed"],
                "firstYear": years[0],
                "geographyCount": geography_count,
                "geographyType": "country",
                "lastYear": years[-1],
                "metric": dataset.spec.dataset_id,
                "notes": (
                    [GENERATION_EXCLUSION_NOTE]
                    if dataset.spec.dataset_id == "electricity-generation"
                    else []
                ),
                "observationCount": observation_count,
            }
        )

    # ---- per-country series -------------------------------------------
    for country in countries:
        series: dict[str, Any] = {}
        for dataset in datasets:
            by_year = dataset.values.get(country.iso3)
            if not by_year:
                continue
            series[dataset.spec.dataset_id] = {
                "datasetVersion": dataset.dataset_version,
                "evidenceType": "observed",
                "points": [[year, _round_value(by_year[year])] for year in sorted(by_year)],
                "sourceId": dataset.spec.source_id,
                "unit": dataset.spec.unit,
            }
        if not series:
            continue
        _write_json(
            out_root / f"country-series/{country.iso3}.json",
            {"iso3": country.iso3, "name": country.name, "series": series},
        )

    # ---- world series (for share-of-global) ---------------------------
    world_series = {
        dataset.spec.dataset_id: {
            "points": [
                [year, _round_value(dataset.world[year])] for year in sorted(dataset.world)
            ],
            "sourceId": dataset.spec.source_id,
            "unit": dataset.spec.unit,
        }
        for dataset in datasets
        if dataset.world
    }
    _write_json(out_root / "world-series.json", world_series)

    # ---- sources, coverage, manifest ----------------------------------
    _write_json(
        out_root / "sources.json",
        {
            "schemaVersion": SCHEMA_VERSION,
            "sources": [
                {
                    "attribution": "Ember (CC BY 4.0) via Our World in Data",
                    "id": "owid-electricity-generation",
                    "licence": "CC BY 4.0 (Ember-covered span, 2000 onward)",
                    "licenceUrl": "https://ember-energy.org/creative-commons/",
                    "name": "Electricity generation",
                    "notes": [GENERATION_EXCLUSION_NOTE],
                    "publisher": "Our World in Data",
                    "retrievedAt": retrieved_at,
                    "url": "https://ourworldindata.org/grapher/electricity-generation",
                },
                {
                    "attribution": "Ember (CC BY 4.0) via Our World in Data",
                    "id": "owid-electricity-demand",
                    "licence": "CC BY 4.0",
                    "licenceUrl": "https://ember-energy.org/creative-commons/",
                    "name": "Electricity demand",
                    "notes": [],
                    "publisher": "Our World in Data",
                    "retrievedAt": retrieved_at,
                    "url": "https://ourworldindata.org/grapher/electricity-demand",
                },
                {
                    "attribution": "Natural Earth (public domain)",
                    "id": "natural-earth",
                    "licence": "Public domain",
                    "licenceUrl": "https://www.naturalearthdata.com/about/terms-of-use/",
                    "name": "Admin-0 country boundaries (1:50m)",
                    "notes": [],
                    "publisher": "Natural Earth",
                    "retrievedAt": retrieved_at,
                    "url": "https://www.naturalearthdata.com/",
                },
            ],
        },
    )
    _write_json(
        out_root / "coverage.json",
        {"records": coverage_records, "schemaVersion": SCHEMA_VERSION},
    )
    _write_json(out_root / "join-report.json", join_report)
    _write_json(
        out_root / "manifest.json",
        {
            "countriesGeojsonPath": "geographies/countries.geojson",
            "countrySeriesPathTemplate": "country-series/{iso3}.json",
            "datasets": manifest_datasets,
            "generatedAt": retrieved_at,
            "geographyIndexPath": "geography-index.json",
            "schemaVersion": SCHEMA_VERSION,
            "worldSeriesPath": "world-series.json",
        },
    )

    # ---- checksums (must be last) -------------------------------------
    checksums = {}
    for path in sorted(out_root.rglob("*")):
        if path.is_file() and path.name != "checksums.json":
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            checksums[path.relative_to(out_root).as_posix()] = digest
    _write_json(out_root / "checksums.json", checksums)

    total_bytes = sum(p.stat().st_size for p in out_root.rglob("*") if p.is_file())
    print(
        f"export-static: wrote {len(checksums) + 1} files, "
        f"{total_bytes / 1_000_000:.2f} MB total, to {out_root}"
    )
    return 0
