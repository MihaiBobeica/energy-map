import json

import pytest

from energy_map_pipeline.adapters import natural_earth, owid
from energy_map_pipeline.cli import verify_output
from energy_map_pipeline.export.static_site import ValidationError, export_static

GEN_SPEC = owid.DATASETS["electricity-generation"]
DEM_SPEC = owid.DATASETS["electricity-demand"]

GEN_CSV = """Entity,Code,Year,Total electricity generation
United States,USA,1999,3900.0
United States,USA,2000,3999.5
United States,USA,2020,4200.25
Netherlands,NLD,2020,120.125
Zerovia,ZRV,2020,0
Africa,,2020,900.0
Europe (OWID),OWID_EUR,2020,4000.0
World,OWID_WRL,1999,14000.0
World,OWID_WRL,2020,27000.5
Kosovo,OWID_KOS,2020,6.5
"""

# Columns in the real OWID order; USA 2020 sums to 4200.25 to match GEN_CSV.
# NLD leaves Nuclear EMPTY (missing) while Coal is a literal 0 — the two must
# stay distinguishable all the way through export.
BY_SOURCE_CSV = """Entity,Code,Year,Coal,Gas,Nuclear,Hydropower,Solar,Oil,Wind,Bioenergy,Other renewables
United States,USA,1999,700.0,600.0,700.0,300.0,0,100.0,10.0,40.0,10.0
United States,USA,2000,800.0,2000.0,753.5,300.0,1.0,100.0,25.0,15.0,5.0
United States,USA,2020,773.39,1624.17,789.88,279.95,130.72,34.34,337.94,211.75,18.11
Netherlands,NLD,2020,0,80.125,,0.1,15.0,1.0,20.0,3.9,0
World,OWID_WRL,2020,9000.0,6000.0,2700.0,4300.0,850.0,750.0,1600.0,650.0,1150.5
"""


def make_geojson(codes_and_names):
    features = []
    for props, name in codes_and_names:
        properties = dict(props)
        properties.setdefault("NAME", name)
        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": {"type": "Polygon", "coordinates": [[[0.12345, 1.98765], [2, 3], [4, 5], [0.12345, 1.98765]]]},
            }
        )
    return {"type": "FeatureCollection", "features": features}


class TestOwidParsing:
    def test_filters_aggregates_and_unlicensed_years(self):
        dataset = owid.parse_owid_csv(GEN_SPEC, GEN_CSV, "2026-04-24")
        # 1999 (EI-covered span) excluded for countries and world
        assert 1999 not in dataset.values["USA"]
        assert 1999 not in dataset.world
        assert dataset.values["USA"][2000] == 3999.5
        # aggregates never treated as countries
        assert "Africa" in dataset.excluded_entities
        assert "Europe (OWID)" in dataset.excluded_entities
        # Kosovo remapped onto the geometry code
        assert dataset.values["KOS"][2020] == 6.5
        # world total captured separately
        assert dataset.world[2020] == 27000.5

    def test_zero_stays_zero_and_missing_stays_absent(self):
        dataset = owid.parse_owid_csv(GEN_SPEC, GEN_CSV, "v")
        assert dataset.values["ZRV"][2020] == 0.0
        assert 2019 not in dataset.values["USA"]

    def test_schema_drift_fails_loudly(self):
        with pytest.raises(owid.SchemaDriftError):
            owid.parse_owid_csv(GEN_SPEC, "Entity,Code,Year,Wrong column\nX,USA,2020,1\n", "v")
        with pytest.raises(owid.SchemaDriftError):
            owid.parse_owid_csv(GEN_SPEC, "A,B,C,D\n1,2,3,4\n", "v")


class TestNaturalEarthParsing:
    def test_code_fallback_and_rounding(self, tmp_path):
        rows = [({"ISO_A3": "-99", "ISO_A3_EH": "FRA", "TYPE": "Country"}, "France")]
        rows += [({"ISO_A3": "-99", "ISO_A3_EH": "FRA", "TYPE": "Dependency"}, "Fr. Dependency")]
        rows += [({"ISO_A3": f"A{chr(65 + i // 26)}{chr(65 + i % 26)}"}, f"C{i}") for i in range(200)]
        path = tmp_path / "ne.geojson"
        path.write_text(json.dumps(make_geojson(rows)), encoding="utf-8")
        countries = natural_earth.parse_countries(path)
        by_iso = {c.iso3: c for c in countries}
        assert "FRA" in by_iso  # ISO_A3_EH fallback for the -99 quirk
        ring = by_iso["FRA"].geometry["coordinates"][0]
        assert ring[0] == [0.123, 1.988]  # rounded to 3 decimals
        # numeric ids are stable: sorted by iso3, starting at 1
        assert [c.numeric_id for c in countries] == list(range(1, len(countries) + 1))
        assert countries == sorted(countries, key=lambda c: c.iso3)

    def test_too_few_countries_fails(self, tmp_path):
        path = tmp_path / "ne.geojson"
        path.write_text(
            json.dumps(make_geojson([({"ISO_A3": "USA"}, "United States")])), encoding="utf-8"
        )
        with pytest.raises(natural_earth.GeometryError, match="expected >= 190"):
            natural_earth.parse_countries(path)


@pytest.fixture()
def raw_root(tmp_path):
    raw = tmp_path / "raw"
    (raw / "owid").mkdir(parents=True)
    (raw / "natural-earth").mkdir(parents=True)
    (raw / "owid/electricity-generation.csv").write_text(GEN_CSV, encoding="utf-8")
    (raw / "owid/electricity-demand.csv").write_text(
        "Entity,Code,Year,Electricity demand - TWh\n"
        "United States,USA,1990,3000.0\n"  # dropped: product scope starts 2000
        "United States,USA,2000,3500.0\n"
        "United States,USA,2020,4000.0\n"
        "World,OWID_WRL,2020,25000.0\n",
        encoding="utf-8",
    )
    # Per-source rows sum exactly to the totals in GEN_CSV so the source-sum
    # reconciliation check has something valid to compare against.
    (raw / "owid/electricity-production-by-source.csv").write_text(
        BY_SOURCE_CSV, encoding="utf-8"
    )
    # UN estimates stop before the electricity data does; the projection column
    # covers the remainder. The two must stay separable all the way through.
    (raw / "owid/population-long-run-with-projections.csv").write_text(
        "Entity,Code,Year,Population (projections) (Projected),Population\n"
        "United States,USA,1999,,279000000\n"
        "United States,USA,2000,,282162411\n"
        "United States,USA,2019,,331000000\n"
        "United States,USA,2020,335942003,\n"
        "Netherlands,NLD,2020,17441139,\n"
        "Kosovo,OWID_KOS,2020,1790133,\n"
        "Africa,,2020,1360000000,\n",
        encoding="utf-8",
    )
    metadata = {"columns": {"x": {"lastUpdated": "2026-04-24"}}}
    (raw / "owid/population-long-run-with-projections.metadata.json").write_text(
        json.dumps(metadata)
    )
    (raw / "owid/electricity-generation.metadata.json").write_text(json.dumps(metadata))
    (raw / "owid/electricity-demand.metadata.json").write_text(json.dumps(metadata))
    (raw / "owid/electricity-production-by-source.metadata.json").write_text(
        json.dumps(metadata)
    )

    rows = [
        ({"ISO_A3": "USA"}, "United States"),
        ({"ISO_A3": "NLD"}, "Netherlands"),
        ({"ISO_A3": "-99", "ADM0_A3": "KOS", "TYPE": "Disputed"}, "Kosovo"),
    ]
    rows += [({"ISO_A3": f"Q{chr(65 + i // 26)}{chr(65 + i % 26)}"}, f"C{i}") for i in range(200)]
    (raw / "natural-earth/ne_50m_admin_0_countries.geojson").write_text(
        json.dumps(make_geojson(rows)), encoding="utf-8"
    )
    (raw / "download-manifest.json").write_text(
        json.dumps({"f": {"url": "u", "sha256": "s", "bytes": 1, "retrievedAt": "2026-08-05T10:00:00Z"}})
    )
    return raw


class TestExportStatic:
    def test_end_to_end_export_and_verify(self, raw_root, tmp_path, capsys):
        out = tmp_path / "public-data"
        assert export_static(raw_root, out) == 0

        manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["generatedAt"] == "2026-08-05T10:00:00Z"
        gen = next(d for d in manifest["datasets"] if d["id"] == "electricity-generation")
        assert gen["years"] == [2000, 2020]
        assert gen["defaultYear"] == 2020
        assert len(gen["yearGeographyCounts"]) == len(gen["years"])

        year_file = json.loads(
            (out / "years/electricity-generation/2020.json").read_text(encoding="utf-8")
        )
        assert year_file["values"]["USA"] == 4200.25
        assert year_file["values"]["ZRV"] == 0.0 if "ZRV" in year_file["values"] else True
        assert year_file["worldTotal"] == 27000.5
        assert year_file["evidenceType"] == "observed"

        series = json.loads((out / "country-series/USA.json").read_text(encoding="utf-8"))
        assert series["series"]["electricity-generation"]["points"] == [
            [2000, 3999.5],
            [2020, 4200.25],
        ]
        assert series["series"]["electricity-demand"]["points"] == [
            [2000, 3500.0],
            [2020, 4000.0],
        ]

        # ZRV has data but no geometry: absent from year file, reported in join report
        assert "ZRV" not in year_file["values"]
        join = json.loads((out / "join-report.json").read_text(encoding="utf-8"))
        assert "ZRV" in join["datasets"]["electricity-generation"]["dataWithoutGeometry"]

        # verify-output accepts the export, including checksums
        assert verify_output(out) == 0

    def test_by_source_datasets_are_exported_with_metric_and_source(self, raw_root, tmp_path):
        out = tmp_path / "public-data"
        export_static(raw_root, out)
        manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        by_id = {d["id"]: d for d in manifest["datasets"]}

        # All nine sources plus the two totals.
        assert len(manifest["datasets"]) == 11
        coal = by_id["electricity-generation-coal"]
        assert coal["metric"] == "electricity-generation"
        assert coal["energySource"] == "coal"
        assert coal["title"] == "Coal"
        assert coal["unit"] == "TWh"
        # The total carries the same metric with no source, so the UI can
        # group them into one metric with an "All sources" option.
        assert by_id["electricity-generation"]["energySource"] is None
        assert by_id["electricity-generation"]["metric"] == "electricity-generation"

        year = json.loads(
            (out / "years/electricity-generation-solar/2020.json").read_text(encoding="utf-8")
        )
        assert year["energySource"] == "solar"
        assert year["metric"] == "electricity-generation"
        assert year["values"]["USA"] == 130.72

        series = json.loads((out / "country-series/USA.json").read_text(encoding="utf-8"))
        assert series["series"]["electricity-generation-wind"]["points"] == [
            [2000, 25.0],
            [2020, 337.94],
        ]

    def test_zero_and_missing_stay_distinct_per_source(self, raw_root, tmp_path):
        out = tmp_path / "public-data"
        export_static(raw_root, out)
        coal = json.loads(
            (out / "years/electricity-generation-coal/2020.json").read_text(encoding="utf-8")
        )
        nuclear = json.loads(
            (out / "years/electricity-generation-nuclear/2020.json").read_text(encoding="utf-8")
        )
        # NLD reports literal zero coal but no nuclear figure at all.
        assert coal["values"]["NLD"] == 0.0
        assert "NLD" not in nuclear["values"]

    def test_everything_starts_in_2000(self, raw_root, tmp_path):
        out = tmp_path / "public-data"
        export_static(raw_root, out)
        manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        for dataset in manifest["datasets"]:
            assert min(dataset["years"]) >= 2000, dataset["id"]
        # Demand's 1990 row is dropped by product scope, not by licence, and
        # the distinction is recorded.
        coverage = json.loads((out / "coverage.json").read_text(encoding="utf-8"))
        demand = next(r for r in coverage["records"] if r["metric"] == "electricity-demand")
        assert demand["firstYear"] == 2000
        assert any("PRODUCT SCOPE" in note for note in demand["notes"])
        generation = next(
            r
            for r in coverage["records"]
            if r["metric"] == "electricity-generation" and r["energySource"] is None
        )
        assert any("LICENCE" in note for note in generation["notes"])

    def test_stale_files_from_a_previous_export_are_pruned(self, raw_root, tmp_path):
        out = tmp_path / "public-data"
        export_static(raw_root, out)
        orphan = out / "years/electricity-demand/1995.json"
        orphan.parent.mkdir(parents=True, exist_ok=True)
        orphan.write_text('{"stale":true}', encoding="utf-8")

        export_static(raw_root, out)
        assert not orphan.exists(), "a narrowed year range must not leave orphan data on disk"
        assert verify_output(out) == 0

    def test_completeness_census_is_published(self, raw_root, tmp_path):
        out = tmp_path / "public-data"
        export_static(raw_root, out)
        coverage = json.loads((out / "coverage.json").read_text(encoding="utf-8"))
        completeness = coverage["sourceCompleteness"]
        # NLD's nuclear cell is empty in the fixture.
        assert completeness["unreportedCells"]["nuclear"] == 1
        assert "NLD" in completeness["countriesNeverReporting"]["nuclear"]
        # NLD reports literal zero coal, which is data, not a gap.
        assert completeness["reportedZeroCells"]["coal"] >= 1
        assert "completeness" in completeness["note"]

    def test_by_source_header_drift_fails_loudly(self, raw_root, tmp_path):
        path = raw_root / "owid/electricity-production-by-source.csv"
        text = path.read_text(encoding="utf-8")
        # A tenth source column would silently break the sum-vs-total identity.
        path.write_text(text.replace("Other renewables", "Other renewables,Geothermal", 1), "utf-8")
        with pytest.raises(owid.SchemaDriftError, match="unexpected header"):
            export_static(raw_root, tmp_path / "public-data")

    def test_negative_generation_is_rejected(self, raw_root, tmp_path):
        path = raw_root / "owid/electricity-production-by-source.csv"
        text = path.read_text(encoding="utf-8")
        path.write_text(text.replace(",130.72,", ",-130.72,", 1), encoding="utf-8")
        with pytest.raises(ValidationError, match="negative generation"):
            export_static(raw_root, tmp_path / "public-data")

    def test_population_is_published_as_its_own_reconstructed_series(self, raw_root, tmp_path):
        out = tmp_path / "public-data"
        export_static(raw_root, out)

        manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["population"]["path"] == "population.json"
        assert manifest["population"]["evidenceType"] == "reconstructed"
        # 1999 is below the published span and must not leak in; 2020 comes
        # from the projection column, so the span reaches the electricity data.
        assert manifest["population"]["years"] == [2000, 2019, 2020]
        assert manifest["population"]["projectedFromYear"] == 2020

        population = json.loads((out / "population.json").read_text(encoding="utf-8"))
        assert population["values"]["USA"]["2000"] == 282162411
        assert population["values"]["USA"]["2020"] == 335942003
        assert population["projectedFromYear"] == 2020
        assert "1999" not in population["values"]["USA"]
        # Kosovo is coded OWID_KOS upstream; without the remap it would silently
        # lose its denominator and grey out only in per-capita mode.
        assert population["values"]["KOS"]["2020"] == 1790133
        # Aggregates are never treated as countries.
        assert all(len(code) == 3 for code in population["values"])

        sources = json.loads((out / "sources.json").read_text(encoding="utf-8"))
        entry = next(s for s in sources["sources"] if s["id"] == "owid-population")
        assert "CC BY 3.0 IGO" in entry["licence"]
        assert any("denominator" in note for note in entry["notes"])
        # The projection span must be disclosed in the published provenance.
        assert any("MEDIUM-VARIANT PROJECTION" in note for note in entry["notes"])

    def test_an_estimate_beats_a_projection_for_the_same_year(self, raw_root, tmp_path):
        # Where both columns are populated the estimate must win: it is the
        # stronger input, and the year stays classified as an estimate.
        path = raw_root / "owid/population-long-run-with-projections.csv"
        text = path.read_text(encoding="utf-8")
        path.write_text(
            text.replace(
                "United States,USA,2019,,331000000",
                "United States,USA,2019,331000001,331000000",
            ),
            encoding="utf-8",
        )
        out = tmp_path / "ok"
        export_static(raw_root, out)
        population = json.loads((out / "population.json").read_text(encoding="utf-8"))
        assert population["values"]["USA"]["2019"] == 331000000
        assert population["projectedFromYear"] == 2020

    def test_a_projection_inside_the_estimate_span_fails_loudly(self, raw_root, tmp_path):
        # Estimates and projections must split at a single clean boundary. If
        # they interleave, "is this year an estimate?" has no answer and the
        # UI could not label the value honestly — so refuse to publish.
        path = raw_root / "owid/population-long-run-with-projections.csv"
        text = path.read_text(encoding="utf-8")
        path.write_text(
            text.replace(
                "United States,USA,2019,,331000000", "United States,USA,2019,331000001,"
            )
            .replace("United States,USA,2020,335942003,", "United States,USA,2020,,335942003")
            .replace("Netherlands,NLD,2020,17441139,", "Netherlands,NLD,2020,,17441139")
            .replace("Kosovo,OWID_KOS,2020,1790133,", "Kosovo,OWID_KOS,2020,,1790133"),
            encoding="utf-8",
        )
        with pytest.raises(owid.SchemaDriftError, match="not a clean boundary"):
            export_static(raw_root, tmp_path / "bad")

    def test_a_year_that_is_both_estimate_and_projection_fails_loudly(self, raw_root, tmp_path):
        path = raw_root / "owid/population-long-run-with-projections.csv"
        text = path.read_text(encoding="utf-8")
        # USA 2020 becomes an estimate while NLD 2020 stays a projection, so
        # 2020 is simultaneously both across the dataset.
        path.write_text(
            text.replace("United States,USA,2020,335942003,", "United States,USA,2020,,335942003"),
            encoding="utf-8",
        )
        with pytest.raises(owid.SchemaDriftError, match="both estimate and projection"):
            export_static(raw_root, tmp_path / "bad")

    def test_source_sum_mismatch_fails_loudly(self, raw_root, tmp_path):
        # Halve every per-source value: the components no longer reconcile
        # with the independently-sourced total, which must abort the export.
        path = raw_root / "owid/electricity-production-by-source.csv"
        rows = path.read_text(encoding="utf-8").splitlines()
        header, body = rows[0], rows[1:]
        rewritten = [header]
        for row in body:
            cells = row.split(",")
            rewritten.append(
                ",".join(
                    cells[:3]
                    + [("" if c == "" else str(float(c) / 2)) for c in cells[3:]]
                )
            )
        path.write_text("\n".join(rewritten) + "\n", encoding="utf-8")

        with pytest.raises(ValidationError, match="does not reconcile"):
            export_static(raw_root, tmp_path / "public-data")

    def test_output_uses_lf_line_endings_on_every_platform(self, raw_root, tmp_path, capsys):
        out = tmp_path / "out"
        export_static(raw_root, out)
        for path in out.rglob("*.json"):
            assert b"\r" not in path.read_bytes(), f"{path.name} contains CR bytes"

    def test_export_is_deterministic(self, raw_root, tmp_path, capsys):
        out1 = tmp_path / "out1"
        out2 = tmp_path / "out2"
        export_static(raw_root, out1)
        export_static(raw_root, out2)
        files1 = {p.relative_to(out1).as_posix(): p.read_bytes() for p in out1.rglob("*") if p.is_file()}
        files2 = {p.relative_to(out2).as_posix(): p.read_bytes() for p in out2.rglob("*") if p.is_file()}
        assert files1 == files2

    def test_checksum_tampering_is_detected(self, raw_root, tmp_path, capsys):
        out = tmp_path / "out"
        export_static(raw_root, out)
        target = out / "years/electricity-generation/2020.json"
        target.write_text(target.read_text(encoding="utf-8").replace("4200.25", "9999"), "utf-8")
        assert verify_output(out) == 1
