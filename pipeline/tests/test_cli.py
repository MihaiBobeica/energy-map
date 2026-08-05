import json

import pytest

from energy_map_pipeline.cli import IMPLEMENTED_STAGES, PLANNED_STAGES, main, verify_output


class TestCli:
    def test_unimplemented_stage_fails_loudly(self, capsys):
        assert main(["normalize"]) == 2
        captured = capsys.readouterr()
        assert "not implemented" in captured.err
        assert "phase" in captured.err

    def test_every_stage_is_registered(self):
        expected = {
            "download",
            "normalize",
            "validate-raw",
            "build-geographies",
            "build-country-series",
            "build-regional-series",
            "build-city-features",
            "fit-allocation-model",
            "allocate",
            "validate-allocations",
            "build-tiles",
            "export-static",
            "build-coverage-report",
            "verify-licenses",
            "verify-output",
        }
        assert set(PLANNED_STAGES) | set(IMPLEMENTED_STAGES) == expected

    def test_version_flag(self, capsys):
        with pytest.raises(SystemExit) as excinfo:
            main(["--version"])
        assert excinfo.value.code == 0


class TestVerifyOutput:
    def test_passes_on_valid_manifest(self, tmp_path, capsys):
        (tmp_path / "manifest.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "1.0.0",
                    "generatedAt": "2026-08-05T00:00:00Z",
                    "datasets": [],
                }
            ),
            encoding="utf-8",
        )
        assert verify_output(tmp_path) == 0

    def test_fails_when_manifest_missing(self, tmp_path):
        assert verify_output(tmp_path) == 1

    def test_fails_when_referenced_path_missing(self, tmp_path):
        (tmp_path / "manifest.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "1.0.0",
                    "generatedAt": "2026-08-05T00:00:00Z",
                    "datasets": [
                        {
                            "id": "electricity-generation",
                            "path": "years/electricity-generation",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        assert verify_output(tmp_path) == 1

    def test_rejects_escaping_paths(self, tmp_path):
        (tmp_path / "manifest.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "1.0.0",
                    "generatedAt": "2026-08-05T00:00:00Z",
                    "datasets": [{"id": "bad", "path": "../outside"}],
                }
            ),
            encoding="utf-8",
        )
        assert verify_output(tmp_path) == 1
