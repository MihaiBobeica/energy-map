"""Normalized data models shared by every pipeline stage.

These mirror the TypeScript domain types in ``src/domain/`` and are the
single Python definition of what a valid record looks like. Validation
rules here enforce the non-negotiable interpretation rules:

* missing stays ``None`` — it is never coerced to zero
* zero stays zero — it is never coerced to missing
* allocated values are never reclassified as observed
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EvidenceType = Literal["observed", "reconstructed", "allocated", "proxy", "missing"]

GeographyType = Literal[
    "world",
    "country",
    "admin1",
    "admin2",
    "urban-centre",
    "grid-cell",
    "plant",
]

ConfidenceLevel = Literal["high", "medium", "low"] | None

FIRST_TIMELINE_YEAR = 1700
LAST_PLAUSIBLE_YEAR = 2100


class Geography(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: GeographyType
    parent_id: str | None
    iso3: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    source_geometry_id: str = Field(min_length=1)
    geometry_version: str = Field(min_length=1)
    valid_from: int | None = None
    valid_to: int | None = None


class EnergyObservation(BaseModel):
    model_config = ConfigDict(frozen=True)

    geography_id: str = Field(min_length=1)
    year: int = Field(ge=FIRST_TIMELINE_YEAR, le=LAST_PLAUSIBLE_YEAR)
    metric: str = Field(min_length=1)
    energy_source: str | None = None
    value: float | None = None
    unit: str = Field(min_length=1)
    evidence_type: EvidenceType
    confidence: ConfidenceLevel = None
    lower_bound: float | None = None
    upper_bound: float | None = None
    source_id: str = Field(min_length=1)
    methodology_id: str | None = None
    dataset_version: str = Field(min_length=1)
    processing_version: str = Field(min_length=1)

    @model_validator(mode="after")
    def check_consistency(self) -> "EnergyObservation":
        if self.evidence_type == "missing" and self.value is not None:
            raise ValueError("evidence_type 'missing' requires value to be None")
        if self.evidence_type == "allocated" and self.methodology_id is None:
            raise ValueError("allocated observations require a methodology_id")
        if self.evidence_type == "allocated" and self.confidence is None:
            raise ValueError("allocated observations require a confidence level")
        if (
            self.lower_bound is not None
            and self.upper_bound is not None
            and self.lower_bound > self.upper_bound
        ):
            raise ValueError("lower_bound must not exceed upper_bound")
        return self


class DataSource(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    publisher: str = Field(min_length=1)
    url: str = Field(min_length=1)
    licence: str = Field(min_length=1)
    licence_url: str | None = None
    retrieved_at: str = Field(min_length=1)
    temporal_coverage: str = Field(min_length=1)
    geographic_coverage: str = Field(min_length=1)
    update_frequency: str | None = None
    notes: list[str] = Field(default_factory=list)


class Methodology(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    description: str = Field(min_length=1)
    inputs: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    validation_metrics: dict[str, float | str] = Field(default_factory=dict)


class CoverageRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    metric: str = Field(min_length=1)
    geography_type: GeographyType
    first_year: int = Field(ge=FIRST_TIMELINE_YEAR, le=LAST_PLAUSIBLE_YEAR)
    last_year: int = Field(ge=FIRST_TIMELINE_YEAR, le=LAST_PLAUSIBLE_YEAR)
    observation_count: int = Field(ge=0)
    geography_count: int = Field(ge=0)
    evidence_types: list[EvidenceType] = Field(min_length=1)

    @model_validator(mode="after")
    def check_year_order(self) -> "CoverageRecord":
        if self.first_year > self.last_year:
            raise ValueError("first_year must not exceed last_year")
        return self
