# Licences and attribution

## 1. Code licence

Original source code in this repository is licensed under the **MIT
License** (see [LICENSE](../LICENSE)). The code licence does **not** apply to
data: data licences are tracked separately, per source, and travel with the
published data files.

## 2. Data licensing rules

1. No source is downloaded or redistributed before its licence is verified
   and recorded in [data-source-register.md](data-source-register.md).
2. An accessible download is not assumed to be legally redistributable.
3. If a licence check fails, the source is excluded and its outputs removed;
   the build does not continue with the affected source included.
4. A machine-readable source and licence manifest is published at
   `public/data/sources.json` and validated in CI.
5. Third-party notices required by a licence (e.g. CC BY attribution
   statements) are preserved verbatim in this file and in the application's
   attribution UI.

## 3. Required attribution (as sources are integrated)

The application shows visible attribution in the map attribution control and
a dedicated "Sources & licences" view. Planned statements:

| Source                         | Attribution statement                                                                                           | Licence                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Our World in Data              | "Data: Our World in Data (ourworldindata.org), CC BY 4.0, with underlying sources as documented per series"     | CC BY 4.0 (OWID work); underlying terms vary     |
| Ember                          | "Electricity data: Ember (ember-energy.org), CC BY 4.0" — where Ember data is used directly or via OWID         | CC BY 4.0 (verify per dataset)                   |
| Energy Institute               | Attribution required where the Statistical Review underlies OWID series — exact terms to verify                 | To verify                                        |
| Global Energy Monitor          | "Power plant data: Global Energy Monitor, Global Integrated Power Tracker, CC BY 4.0" + required notices        | CC BY 4.0 (per GEM public licence page)          |
| geoBoundaries                  | "Administrative boundaries: geoBoundaries (gbOpen), CC BY 4.0 — Runfola et al."                                 | CC BY 4.0                                        |
| GHSL / European Commission     | "Urban centres & built-up data: European Commission, Joint Research Centre — Global Human Settlement Layer"     | Free reuse with attribution (verify per product) |
| HYDE / PBL & Utrecht Univ.     | "Historical population & land use: HYDE (PBL Netherlands Environmental Assessment Agency / Utrecht University)" | To verify                                        |
| EOG / Colorado School of Mines | "DMSP nighttime lights: Earth Observation Group, Colorado School of Mines"                                      | To verify                                        |
| NASA Black Marble              | "VIIRS nighttime lights: NASA Black Marble (VNP46 series)"                                                      | NASA data policy (attribution)                   |
| US EIA                         | "US state electricity data: U.S. Energy Information Administration"                                             | Public domain (verify)                           |
| CBS Netherlands                | "Netherlands electricity balance: Statistics Netherlands (CBS)"                                                 | CC BY 4.0 (verify)                               |
| UK Government                  | "UK historical electricity data: Department for Energy Security and Net Zero, Open Government Licence v3.0"     | OGL v3.0 (verify)                                |
| Natural Earth                  | "Boundaries: Natural Earth (public domain)" — included although optional                                        | Public domain (verified)                         |
| GISCO / Eurostat               | "NUTS boundaries: © EuroGeographics for the administrative boundaries" (required wording to verify)             | To verify                                        |
| MapLibre GL JS                 | Library licence notice shipped in bundle metadata                                                               | BSD-3-Clause                                     |
| PMTiles / Protomaps            | Library licence notice shipped in bundle metadata                                                               | BSD-3-Clause                                     |

"To verify" entries must reach `verified` status in the source register
before the corresponding data ships.

## 4. UI requirements

- The map shows a persistent attribution control listing the geometry source
  and the active data sources for the current view.
- Every tooltip/panel links to the source record (`sources.json` entry) for
  the displayed observation.
- The boundary source and version are displayed so territorial-dispute
  presentation is traceable to the chosen boundary provider's conventions.
- The footer links to this document and to the source register.

## 5. Redistribution notes

- Processed OWID-derived files retain OWID's attribution and the underlying
  source chain from the codebook in `sources.json`.
- GEM data ships only after the licence terms on the downloaded release are
  confirmed; GEM's required notices are reproduced verbatim.
- HYDE, GHSL and nighttime-light rasters are **inputs only**; only reduced
  derived products are published, each carrying its source attribution.
- If any source requires a non-commercial or share-alike condition
  incompatible with this repository's publication model, it is excluded
  rather than partially complied with.
