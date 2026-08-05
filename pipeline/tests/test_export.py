import json

import pytest

from energy_map_pipeline.adapters import natural_earth, owid
from energy_map_pipeline.cli import verify_output
from energy_map_pipeline.export.static_site import export_static

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
        "United States,USA,1990,3000.0\n"
        "United States,USA,2020,4000.0\n"
        "World,OWID_WRL,2020,25000.0\n",
        encoding="utf-8",
    )
    metadata = {"columns": {"x": {"lastUpdated": "2026-04-24"}}}
    (raw / "owid/electricity-generation.metadata.json").write_text(json.dumps(metadata))
    (raw / "owid/electricity-demand.metadata.json").write_text(json.dumps(metadata))

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
            [1990, 3000.0],
            [2020, 4000.0],
        ]

        # ZRV has data but no geometry: absent from year file, reported in join report
        assert "ZRV" not in year_file["values"]
        join = json.loads((out / "join-report.json").read_text(encoding="utf-8"))
        assert "ZRV" in join["datasets"]["electricity-generation"]["dataWithoutGeometry"]

        # verify-output accepts the export, including checksums
        assert verify_output(out) == 0

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
