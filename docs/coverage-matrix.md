# Coverage matrix

This document records, per metric and source, what actually exists: first and
last year, time resolution, geographic level, geography count, evidence type
and licence status.

> **Status: Phase 0 baseline.** The rows below are the planned coverage
> derived from the source register. Once the pipeline exists, this table is
> **generated** by `build-coverage-report` from real normalized data
> (`public/data/coverage.json`) and the generated table replaces the manual
> one. Counts marked `~` are source-published figures not yet verified by the
> pipeline; `TBD` means not yet measured.

## Temporal coverage matrix

| Metric                          | Source ID                     | First year | Last year | Time resolution        | Geographic level | Geography count | Evidence type | Licence status | Updated |
| ------------------------------- | ----------------------------- | ---------- | --------- | ---------------------- | ---------------- | --------------- | ------------- | -------------- | ------- |
| Population (gridded, urban/rural) | `hyde`                      | 1700 (earlier exists) | ~2023 | 10-year (hist.), finer modern | grid / country | global grid | reconstructed | pending | —       |
| Global primary energy by source | `owid-global-energy`          | 1800       | ~2024     | 10-year → annual       | world only       | 1               | reconstructed | pending        | —       |
| Primary energy consumption      | `owid-energy`                 | ~1965      | ~2024     | annual                 | country          | ~190            | observed      | pending        | —       |
| Electricity generation          | `owid-electricity-generation` | 1985       | 2025      | annual                 | country          | ~190+           | observed      | pending        | —       |
| Electricity generation by source | `owid-energy` / `owid-electricity-by-source` | ~1985 | ~2024 | annual        | country          | ~190            | observed      | pending        | —       |
| Electricity demand              | `owid-electricity-demand`     | 1990       | ~2024     | annual                 | country          | ~190            | observed      | pending        | —       |
| National electricity balance (NL) | `cbs-nl`                    | 1919       | 2018 (+successor) | annual         | country (NLD)    | 1               | observed      | pending        | —       |
| Historical electricity (UK)     | `uk-historical-electricity`   | 1920       | ~2024     | annual                 | country (GBR)    | 1               | observed      | pending        | —       |
| State electricity (US)          | `eia`                         | ~1990 (verify) | ~2024 | annual                | admin1 (US states) | 51            | observed      | pending        | —       |
| Power plants (location/capacity/status) | `gem-gipt`            | 1880s (commissioning years) | 2026 release | release snapshot | plant   | ~182,400        | observed      | pending        | —       |
| Urban centres (extent, population, built-up) | `ghsl`           | 1975       | ~2025     | 5-year epochs          | urban-centre     | ~10,000+        | observed/proxy | pending       | —       |
| Nighttime lights (DMSP)         | `dmsp-ols`                    | 1992       | 2013      | annual composites      | grid-cell        | global grid     | proxy         | pending        | —       |
| Nighttime lights (VIIRS)        | `viirs-black-marble`          | 2012       | ~2025     | annual (also monthly/daily) | grid-cell   | global grid     | proxy         | pending        | —       |
| Allocated demand (cities/grid)  | derived (`allocated-demand`)  | 1992       | latest    | annual                 | urban-centre / grid-cell | TBD     | allocated     | n/a (derived)  | —       |

## Geometry coverage

| Layer          | Source ID               | Levels        | Version convention        | Licence status |
| -------------- | ----------------------- | ------------- | ------------------------- | -------------- |
| Countries      | `natural-earth`         | ADM0          | NE release (e.g. 5.1.x)   | verified (public domain) |
| Admin-1/2      | `geoboundaries-gbopen`  | ADM1, ADM2    | gbOpen release tag        | pending        |
| European NUTS  | `gisco-nuts`            | NUTS 0–3      | NUTS 2024                 | pending        |
| Urban centres  | `ghsl` (UCDB)           | urban-centre  | UCDB 2024 / R2025A        | pending        |
| Plants         | `gem-gipt`              | plant points  | GEM release month         | pending        |

## Mode availability by period (UI contract)

| Period      | Population/activity | Primary energy      | Electricity                      | Infrastructure        | Allocation          |
| ----------- | ------------------- | ------------------- | -------------------------------- | --------------------- | ------------------- |
| 1700–1799   | ✓ (reconstructed)   | —                   | —                                | —                     | —                   |
| 1800–1879   | ✓                   | ✓ world total only  | —                                | —                     | —                   |
| 1880–1918   | ✓                   | ✓ world total only  | selected early systems/plants    | early plants          | —                   |
| 1919–1949   | ✓                   | ✓ world total only  | selected national series (NL, UK) | plants by commissioning | —                 |
| 1950–1984   | ✓                   | ✓ (countries ~1965+) | growing coverage                | plants                | —                   |
| 1985–1991   | ✓                   | ✓                   | ✓ broad generation               | plants                | experimental (GHSL) |
| 1992–2011   | ✓                   | ✓                   | ✓ generation + demand (1990+)    | plants                | ✓ DMSP-supported    |
| 2012–latest | ✓                   | ✓                   | ✓                                | ✓ plants              | ✓ VIIRS-supported   |

A metric outside its coverage window is **disabled**, with the reason shown —
never rendered as zero or interpolated.

## Verification plan

- `build-coverage-report` emits `public/data/coverage.json` with
  `CoverageRecord` entries (metric, geographyType, firstYear, lastYear,
  observationCount, geographyCount, evidenceTypes).
- CI asserts that every metric exposed by the frontend has a coverage record
  and that no observation lies outside its declared window.
- This document is then regenerated from `coverage.json`; manual edits are
  limited to prose.
