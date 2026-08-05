import pytest
from pydantic import ValidationError

from energy_map_pipeline.models import CoverageRecord, EnergyObservation


def make_observation(**overrides):
    base = {
        "geography_id": "NLD",
        "year": 2020,
        "metric": "electricity-generation",
        "energy_source": None,
        "value": 120.5,
        "unit": "TWh",
        "evidence_type": "observed",
        "confidence": "high",
        "lower_bound": None,
        "upper_bound": None,
        "source_id": "owid-electricity-generation",
        "methodology_id": None,
        "dataset_version": "2026-01",
        "processing_version": "0.1.0",
    }
    base.update(overrides)
    return EnergyObservation(**base)


class TestEnergyObservation:
    def test_valid_observation_roundtrip(self):
        observation = make_observation()
        assert observation.value == 120.5
        assert observation.evidence_type == "observed"

    def test_missing_stays_none_and_zero_stays_zero(self):
        missing = make_observation(value=None, evidence_type="missing", confidence=None)
        zero = make_observation(value=0.0)
        assert missing.value is None
        assert zero.value == 0.0

    def test_missing_evidence_forbids_a_value(self):
        with pytest.raises(ValidationError, match="missing"):
            make_observation(value=1.0, evidence_type="missing")

    def test_unknown_evidence_type_rejected(self):
        with pytest.raises(ValidationError):
            make_observation(evidence_type="estimated")

    def test_allocated_requires_methodology_and_confidence(self):
        with pytest.raises(ValidationError, match="methodology_id"):
            make_observation(evidence_type="allocated", methodology_id=None)
        with pytest.raises(ValidationError, match="confidence"):
            make_observation(
                evidence_type="allocated", methodology_id="m-pop-v1", confidence=None
            )
        observation = make_observation(
            evidence_type="allocated", methodology_id="m-pop-v1", confidence="low"
        )
        assert observation.evidence_type == "allocated"

    def test_year_bounds_follow_timeline(self):
        with pytest.raises(ValidationError):
            make_observation(year=1699)
        assert make_observation(year=1700).year == 1700

    def test_bounds_must_be_ordered(self):
        with pytest.raises(ValidationError, match="lower_bound"):
            make_observation(lower_bound=10.0, upper_bound=5.0)


class TestCoverageRecord:
    def test_valid_record(self):
        record = CoverageRecord(
            metric="electricity-generation",
            geography_type="country",
            first_year=1985,
            last_year=2025,
            observation_count=8000,
            geography_count=195,
            evidence_types=["observed"],
        )
        assert record.first_year == 1985

    def test_year_order_enforced(self):
        with pytest.raises(ValidationError, match="first_year"):
            CoverageRecord(
                metric="electricity-generation",
                geography_type="country",
                first_year=2025,
                last_year=1985,
                observation_count=1,
                geography_count=1,
                evidence_types=["observed"],
            )
