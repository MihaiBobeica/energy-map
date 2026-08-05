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

# Validation rule (docs/methodology.md): energy-source components are checked
# against the separately-published total.
#
# WHAT THIS PROVES AND WHAT IT DOES NOT. Measured over all 5,413 published
# country-years, the nine sources sum to the total EXACTLY (deviation 0 with
# decimal arithmetic) — because OWID's "Total electricity" is itself derived as
# the sum of the nine, treating an unreported source as zero. So this is a
# tight schema-drift tripwire (it fires if a column binds to the wrong series,
# a tenth source appears, or units change) and NOT a completeness check: it can
# never reveal that a country's "Other renewables" was never reported, and the
# published total understates such countries. Completeness is tracked
# separately by the missing-cell census below.
SOURCE_SUM_ABS_TOLERANCE = 0.005  # TWh; source values carry at most 2 decimals
SOURCE_SUM_REL_TOLERANCE = 1e-9

# A country-year this large with an unreported source materially understates
# its total, so the census reports it prominently.
MATERIAL_GENERATION_TWH = 100.0


def _round_value(value: float) -> float:
    return round(value, VALUE_DECIMALS)


# Paths written by the current export, so _prune_stale_files can delete
# anything left over from a previous run with a different year range.
_WRITTEN: set[Path] = set()


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n" keeps output byte-identical across platforms — Windows'
    # default text-mode translation would break checksums against a Linux CI.
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    _WRITTEN.add(path)


def _load_retrieved_at(raw_root: Path) -> str:
    manifest_path = raw_root / "download-manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(
            f"{manifest_path} missing — run `energy-map-pipeline download` first"
        )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    timestamps = sorted(str(entry["retrievedAt"]) for entry in manifest.values())
    return timestamps[-1]


class ValidationError(RuntimeError):
    """Raised when generated data violates a documented validation rule."""


def _check_source_sums(
    datasets: list[owid.OwidDataset], iso3_to_country: dict[str, Any]
) -> dict[str, Any]:
    """Compare the nine per-source series against the separate total.

    Both come from Ember but are published as different indicators, so exact
    equality is not expected. A structural break (wrong column bound, unit
    change) shows up as a large share of country-years outside tolerance.
    """
    total = next((d for d in datasets if d.spec.dataset_id == "electricity-generation"), None)
    per_source = [d for d in datasets if d.spec.energy_source is not None]
    if total is None or not per_source:
        return {"checked": 0, "outliers": 0, "outlierShare": 0.0, "worst": []}

    checked = 0
    without_breakdown = 0
    mismatches: list[dict[str, Any]] = []
    missing_cells: dict[str, int] = {d.spec.energy_source or "?": 0 for d in per_source}
    zero_cells: dict[str, int] = {d.spec.energy_source or "?": 0 for d in per_source}
    material_gaps: list[dict[str, Any]] = []
    always_missing: dict[str, set[str]] = {d.spec.energy_source or "?": set() for d in per_source}
    reported_any: dict[str, set[str]] = {d.spec.energy_source or "?": set() for d in per_source}

    for iso3, by_year in total.values.items():
        if iso3 not in iso3_to_country:
            continue
        for year, total_value in by_year.items():
            parts: list[float] = []
            absent: list[str] = []
            for dataset in per_source:
                source_id = dataset.spec.energy_source or "?"
                value = dataset.values.get(iso3, {}).get(year)
                if value is None:
                    absent.append(source_id)
                    continue
                reported_any[source_id].add(iso3)
                parts.append(value)
                if value < 0:
                    raise ValidationError(
                        f"negative generation for {iso3} {year} {source_id}: {value}"
                    )
                if value > total_value + SOURCE_SUM_ABS_TOLERANCE:
                    raise ValidationError(
                        f"{source_id} exceeds total generation for {iso3} {year}: "
                        f"{value} > {total_value}"
                    )
                if value == 0.0:
                    zero_cells[source_id] += 1
            # A country-year absent from the by-source data entirely is not
            # "nine unreported sources" — it is one country-year with no
            # breakdown, counted separately so the census is not inflated.
            if not parts:
                without_breakdown += 1
                continue
            for source_id in absent:
                missing_cells[source_id] += 1
            checked += 1
            summed = sum(parts)
            allowed = max(SOURCE_SUM_ABS_TOLERANCE, SOURCE_SUM_REL_TOLERANCE * abs(total_value))
            if abs(summed - total_value) > allowed:
                mismatches.append(
                    {
                        "iso3": iso3,
                        "year": year,
                        "total": round(total_value, 3),
                        "sumOfSources": round(summed, 3),
                        "difference": round(summed - total_value, 6),
                    }
                )
            if absent and total_value >= MATERIAL_GENERATION_TWH:
                material_gaps.append({"iso3": iso3, "year": year, "unreported": sorted(absent)})

    for source_id, seen in reported_any.items():
        always_missing[source_id] = {
            iso3 for iso3 in total.values if iso3 in iso3_to_country and iso3 not in seen
        }

    if checked == 0:
        raise ValidationError(
            "source-sum check compared nothing — per-source and total datasets do not overlap"
        )
    if mismatches:
        raise ValidationError(
            f"generation by source does not reconcile with the published total in "
            f"{len(mismatches)} of {checked} country-years (tolerance "
            f"{SOURCE_SUM_ABS_TOLERANCE} TWh). First: {mismatches[:3]}"
        )

    print(
        f"source-sum check: {checked} country-years reconcile exactly; "
        f"{sum(missing_cells.values())} unreported source cells, "
        f"{len(material_gaps)} of them in country-years above "
        f"{MATERIAL_GENERATION_TWH:.0f} TWh"
    )
    return {
        "checked": checked,
        "countryYearsWithoutBreakdown": without_breakdown,
        "mismatches": mismatches,
        "toleranceTWh": SOURCE_SUM_ABS_TOLERANCE,
        # The census is the completeness signal the tolerance check cannot give.
        "unreportedCells": dict(sorted(missing_cells.items())),
        "reportedZeroCells": dict(sorted(zero_cells.items())),
        "countriesNeverReporting": {
            source_id: sorted(codes)
            for source_id, codes in sorted(always_missing.items())
            if codes
        },
        "materialUnreported": sorted(
            material_gaps, key=lambda gap: (gap["iso3"], gap["year"])
        )[:200],
        "materialUnreportedCount": len(material_gaps),
        "note": (
            "OWID's published total is the sum of the nine sources with unreported sources "
            "treated as zero, so this reconciliation proves arithmetic consistency, not "
            "completeness: where a source is unreported the total understates real generation."
        ),
    }


def _prune_stale_files(out_root: Path, written: set[Path]) -> list[str]:
    """Delete previously exported files this run did not write.

    Without this a narrowed year range (or a renamed dataset) leaves orphan
    files on disk that checksums.json would happily re-bless, so the site
    would keep serving data the manifest no longer advertises.
    """
    removed: list[str] = []
    for path in sorted(out_root.rglob("*")):
        if path.is_file() and path not in written and path.name != "checksums.json":
            removed.append(path.relative_to(out_root).as_posix())
            path.unlink()
    for directory in sorted(out_root.rglob("*"), reverse=True):
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    return removed


def export_static(raw_root: Path, out_root: Path) -> int:
    _WRITTEN.clear()
    retrieved_at = _load_retrieved_at(raw_root)

    countries = natural_earth.parse_countries(
        raw_root / "natural-earth/ne_50m_admin_0_countries.geojson"
    )
    iso3_to_country = {c.iso3: c for c in countries}

    # Several datasets share one raw CSV (the by-source file holds nine
    # columns); read and version each file once.
    csv_cache: dict[str, str] = {}
    version_cache: dict[str, str] = {}
    datasets: list[owid.OwidDataset] = []
    for spec in owid.DATASETS.values():
        if spec.raw_name not in csv_cache:
            text = (raw_root / f"owid/{spec.raw_name}.csv").read_text(encoding="utf-8")
            if spec.raw_name == "electricity-production-by-source":
                header = text.splitlines()[0].split(",")
                owid.assert_by_source_header(header)
            csv_cache[spec.raw_name] = text
            version_cache[spec.raw_name] = owid.dataset_version_from_metadata(
                raw_root / f"owid/{spec.raw_name}.metadata.json"
            )
        datasets.append(
            owid.parse_owid_csv(spec, csv_cache[spec.raw_name], version_cache[spec.raw_name])
        )

    source_sum_report = _check_source_sums(datasets, iso3_to_country)

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
                "energySource": dataset.spec.energy_source,
                "evidenceType": "observed",
                "metric": dataset.spec.metric,
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
                "energySource": dataset.spec.energy_source,
                "evidenceTypes": ["observed"],
                "id": dataset.spec.dataset_id,
                "metric": dataset.spec.metric,
                "metricTitle": owid.METRIC_TITLES[dataset.spec.metric],
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
                "energySource": dataset.spec.energy_source,
                "evidenceTypes": ["observed"],
                "firstYear": years[0],
                "geographyCount": geography_count,
                "geographyType": "country",
                "lastYear": years[-1],
                "metric": dataset.spec.metric,
                "notes": dataset.spec.exclusion_reasons(),
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
    notes_by_source: dict[str, list[str]] = {}
    for dataset in datasets:
        for reason in dataset.spec.exclusion_reasons():
            bucket = notes_by_source.setdefault(dataset.spec.source_id, [])
            if reason not in bucket:
                bucket.append(reason)

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
                    "notes": notes_by_source.get("owid-electricity-generation", []),
                    "publisher": "Our World in Data",
                    "retrievedAt": retrieved_at,
                    "url": "https://ourworldindata.org/grapher/electricity-generation",
                },
                {
                    "attribution": "Ember (CC BY 4.0) via Our World in Data",
                    "id": "owid-electricity-by-source",
                    "licence": "CC BY 4.0 (Ember-covered span, 2000 onward)",
                    "licenceUrl": "https://ember-energy.org/creative-commons/",
                    "name": "Electricity generation by source",
                    "notes": notes_by_source.get("owid-electricity-by-source", []),
                    "publisher": "Our World in Data",
                    "retrievedAt": retrieved_at,
                    "url": "https://ourworldindata.org/grapher/electricity-production-by-source",
                },
                {
                    "attribution": "Ember (CC BY 4.0) via Our World in Data",
                    "id": "owid-electricity-demand",
                    "licence": "CC BY 4.0",
                    "licenceUrl": "https://ember-energy.org/creative-commons/",
                    "name": "Electricity demand",
                    "notes": notes_by_source.get("owid-electricity-demand", []),
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
        {
            "records": coverage_records,
            "schemaVersion": SCHEMA_VERSION,
            # Completeness is reported next to coverage so a reader can see
            # not just which years exist but where a source went unreported.
            "sourceCompleteness": {
                key: source_sum_report[key]
                for key in (
                    "unreportedCells",
                    "reportedZeroCells",
                    "countriesNeverReporting",
                    "materialUnreportedCount",
                    "note",
                )
                if key in source_sum_report
            },
        },
    )
    join_report["sourceSumCheck"] = source_sum_report
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

    # ---- prune, then checksum (must be last) --------------------------
    removed = _prune_stale_files(out_root, set(_WRITTEN))
    if removed:
        print(f"export-static: removed {len(removed)} stale file(s), e.g. {removed[:5]}")

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
