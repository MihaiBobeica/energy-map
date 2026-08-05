"""Adapter for Natural Earth admin-0 country geometry (public domain).

Uses the official Natural Earth GeoJSON from the nvkelso/natural-earth-vector
repository at 1:50m scale so that microstates are present (the 1:110m file
drops them). Properties are stripped to a stable id + name and coordinates
are rounded: at 1:50m nominal accuracy, three decimals (~110 m) is far finer
than the source geometry itself.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

NE_VERSION = "5.1.2 (nvkelso/natural-earth-vector master)"
NE_50M_COUNTRIES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_admin_0_countries.geojson"
)

COORD_DECIMALS = 3


class GeometryError(RuntimeError):
    pass


@dataclass(frozen=True)
class CountryFeature:
    numeric_id: int
    iso3: str
    name: str
    geometry: dict[str, Any]


def _direct_code(properties: dict[str, Any]) -> str | None:
    code = properties.get("ISO_A3")
    if isinstance(code, str) and len(code) == 3 and code != "-99":
        return code
    return None


# Feature types allowed to claim a code via the ISO_A3_EH/ADM0_A3 fallback.
# Dependencies are excluded: e.g. "Ashmore and Cartier Is." carries
# ISO_A3_EH = AUS and must not shadow Australia.
_FALLBACK_TYPES = {"Sovereign country", "Country", "Disputed", "Indeterminate"}


def _fallback_code(properties: dict[str, Any]) -> str | None:
    """Resolve Natural Earth's ISO_A3 = "-99" quirk (France, Norway, Kosovo…)."""
    if properties.get("TYPE") not in _FALLBACK_TYPES:
        return None
    for key in ("ISO_A3_EH", "ADM0_A3"):
        code = properties.get(key)
        if isinstance(code, str) and len(code) == 3 and code != "-99":
            return code
    return None


def _round_coords(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, COORD_DECIMALS)
    if isinstance(value, (list, tuple)):
        return [_round_coords(item) for item in value]
    return value


def parse_countries(geojson_path: Path) -> list[CountryFeature]:
    data = json.loads(geojson_path.read_text(encoding="utf-8"))
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise GeometryError(f"{geojson_path.name}: not a FeatureCollection")

    by_code: dict[str, CountryFeature] = {}
    skipped: list[str] = []

    def add(code: str, properties: dict[str, Any], geometry: dict[str, Any]) -> None:
        name = properties.get("NAME_EN") or properties.get("NAME")
        if not name:
            skipped.append("<unnamed>")
            return
        by_code[code] = CountryFeature(
            numeric_id=0,  # assigned after sorting for stability
            iso3=code,
            name=str(name),
            geometry={
                "type": geometry["type"],
                "coordinates": _round_coords(geometry["coordinates"]),
            },
        )

    # Pass 1: features with an authoritative ISO_A3. Duplicates here are a
    # genuine source problem and must fail loudly.
    for feature in data["features"]:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry")
        code = _direct_code(properties)
        if code is None or geometry is None:
            continue
        if code in by_code:
            raise GeometryError(f"duplicate country code {code} in {geojson_path.name}")
        add(code, properties, geometry)

    # Pass 2: "-99" quirk features (France, Norway, Kosovo…). A fallback may
    # never shadow an authoritative code; collisions are skipped and logged.
    for feature in data["features"]:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry")
        if _direct_code(properties) is not None or geometry is None:
            continue
        code = _fallback_code(properties)
        if code is None:
            skipped.append(str(properties.get("NAME", "<unnamed>")))
            continue
        if code in by_code:
            skipped.append(f"{properties.get('NAME', '<unnamed>')} (fallback {code} taken)")
            continue
        add(code, properties, geometry)
    if len(by_code) < 190:
        raise GeometryError(
            f"{geojson_path.name}: only {len(by_code)} countries parsed; expected >= 190"
        )
    if skipped:
        # Antarctica-like entries without codes are fine to skip, but keep it visible.
        print(f"natural-earth: skipped {len(skipped)} feature(s) without code/name: {skipped}")

    ordered = []
    for index, code in enumerate(sorted(by_code), start=1):
        entry = by_code[code]
        ordered.append(
            CountryFeature(
                numeric_id=index, iso3=entry.iso3, name=entry.name, geometry=entry.geometry
            )
        )
    return ordered
