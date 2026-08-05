# Data source register

Every source used by the project is registered here **before** it is
downloaded or redistributed. A source may not be processed, published, or
redistributed until its row records a verified licence. If a licence check
fails, the source is excluded and the failure is recorded in the notes.

Licence status values:

- `verified` — licence text reviewed and recorded; redistribution terms understood
- `pending` — registered but licence not yet verified; **must not be redistributed**
- `restricted` — usable as pipeline input only; outputs need case-by-case review
- `excluded` — licence check failed; source must not be used

Retrieval dates are filled in when a source is first downloaded by the
pipeline; `—` means not yet retrieved.

## 1. Modern country electricity

### OWID-ENERGY — Our World in Data complete energy dataset

- **ID:** `owid-energy`
- **Publisher:** Our World in Data
- **URL:** <https://github.com/owid/energy-data>
- **CSV:** <https://owid-public.owid.io/data/energy/owid-energy-data.csv>
- **Codebook:** <https://github.com/owid/energy-data/blob/master/owid-energy-codebook.csv>
- **Licence:** Creative Commons BY 4.0 for OWID's own work; underlying
  third-party data (Energy Institute, Ember, …) subject to original terms —
  each underlying series must be checked before redistribution.
- **Licence status:** `pending`
- **Temporal coverage:** country-year; electricity ~1985–latest, primary
  energy ~1965–latest for broad coverage, longer for selected countries
- **Geographic coverage:** countries plus aggregate entities (World,
  continents, income groups) — aggregates must be filtered out of country
  layers
- **Evidence classification of output:** `observed` (modern statistics as
  compiled by OWID)
- **Update frequency:** roughly annual
- **Notes:** primary initial source; normalized country-year layout with a
  codebook and documented source chain avoids runtime API keys.

### OWID-GEN — Electricity generation (grapher)

- **ID:** `owid-electricity-generation`
- **Page:** <https://ourworldindata.org/grapher/electricity-generation>
- **CSV:** <https://ourworldindata.org/grapher/electricity-generation.csv?v=1&csvType=full&useColumnShortNames=false>
- **Metadata:** <https://ourworldindata.org/grapher/electricity-generation.metadata.json?v=1&csvType=full&useColumnShortNames=false>
- **Licence status:** `verified` **for the Ember-covered span (year ≥ 2000) only**
- **Licence detail (verified 2026-08-05 via indicator metadata
  `api.ourworldindata.org/v1/indicators/1228028.metadata.json`):** Ember data
  (2000 onward; 1990 onward for Europe) is CC BY 4.0
  (<https://ember-energy.org/creative-commons/>). Pre-2000 values derive from
  the Energy Institute Statistical Review — see the EI entry below;
  **`excluded` from published output**. The CSV has no row-level provenance,
  so the conservative global cut is year ≥ 2000.
- **Retrieved:** 2026-08-05 (dataset version 2026-04-24)
- **Temporal coverage:** source 1985–2025; **published 2000–2025**
- **Evidence classification:** `observed`

### EI — Energy Institute Statistical Review of World Energy

- **ID:** `energy-institute`
- **Terms:** <https://www.energyinst.org/terms>
- **Licence status:** `excluded`
- **Verification (2026-08-05):** the terms page returns HTTP 403 to a default
  user agent but HTTP 200 with ordinary browser headers, so it **was** read.
  Its copyright clause reserves all rights, permits copies only for
  information purposes and users' private use, grants no licence beyond
  viewing on the site, and states that any other use or reproduction is
  expressly forbidden without the EI's written permission.
- **Consequence:** this is an **affirmative prohibition on redistribution**,
  not merely an unverifiable licence. No EI-derived value may be published.
  Every OWID electricity series that blends EI data is therefore cut at the
  first fully-Ember year (2000). The EI is deliberately **not** credited in
  the application, because crediting a source we do not publish would
  misstate provenance.

### OWID-DEM — Electricity demand (grapher)

- **ID:** `owid-electricity-demand`
- **Page:** <https://ourworldindata.org/grapher/electricity-demand>
- **CSV:** <https://ourworldindata.org/grapher/electricity-demand.csv?v=1&csvType=full&useColumnShortNames=false>
- **Metadata:** <https://ourworldindata.org/grapher/electricity-demand.metadata.json?v=1&csvType=full&useColumnShortNames=false>
- **Licence status:** `verified` — Ember throughout, CC BY 4.0
  (<https://ember-energy.org/creative-commons/>), confirmed 2026-08-05 via
  indicator metadata `api.ourworldindata.org/v1/indicators/1228025.metadata.json`
- **Retrieved:** 2026-08-05 (dataset version 2026-04-24)
- **Temporal coverage:** source 1990–2025; **published 2000–2025**
- **Publication cut:** 2000 is a **product scope** decision (one shared span
  across all metrics), not a licence restriction — 1990–1999 is fully
  CC BY 4.0 and could be published if the product scope changed.
- **Evidence classification:** `observed`

### OWID-MIX — Electricity production by source

- **ID:** `owid-electricity-by-source`
- **Page:** <https://ourworldindata.org/grapher/electricity-production-by-source>
- **CSV:** <https://ourworldindata.org/grapher/electricity-production-by-source.csv?v=1&csvType=full&useColumnShortNames=false>
- **Metadata:** <https://ourworldindata.org/grapher/electricity-production-by-source.metadata.json?v=1&csvType=full&useColumnShortNames=false>
- **Licence status:** `verified` **for the Ember-covered span (year ≥ 2000) only**
- **Retrieved:** 2026-08-05 (dataset version 2026-04-24)
- **Temporal coverage:** source 1965–2025; **published 2000–2025**
- **Columns published:** Coal, Gas, Oil, Nuclear, Hydropower, Wind, Solar,
  Bioenergy, Other renewables — all in TWh.
- **Evidence classification:** `observed`

#### Per-column licence verification (2026-08-05)

Each column's indicator was fetched individually from
`https://api.ourworldindata.org/v1/indicators/<id>.metadata.json` and its
`origins[].license` read directly. Names and URLs are reproduced as published.

| Column             | Indicator | Producers                  | Licence(s)                                                                           |
| ------------------ | --------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `Coal`             | 1227968   | Ember ×2, Energy Institute | `CC BY 4.0` <https://ember-energy.org/creative-commons/> · `© Energy Institute 2025` |
| `Gas`              | 1227972   | Ember ×2, Energy Institute | as above                                                                             |
| `Nuclear`          | 1227995   | Ember ×2, Energy Institute | as above                                                                             |
| `Hydropower`       | 1227989   | Ember ×2, Energy Institute | as above                                                                             |
| `Solar`            | 1228023   | Ember ×2, Energy Institute | as above                                                                             |
| `Oil`              | 1227996   | Ember ×2, Energy Institute | as above                                                                             |
| `Wind`             | 1228030   | Ember ×2, Energy Institute | as above                                                                             |
| `Bioenergy`        | 1227964   | Ember ×2 **only**          | `CC BY 4.0` <https://ember-energy.org/creative-commons/>                             |
| `Other renewables` | 1227999   | Ember ×2 **only**          | `CC BY 4.0` <https://ember-energy.org/creative-commons/>                             |

All nine carry `nonRedistributable: false` and `processingLevel: "major"`.

`Bioenergy` and `Other renewables` are Ember-only and would be publishable
from 1990. The 2000 cut is forced by the other seven, where 1990–1999 mixes
Ember (Europe plus Turkey) with the excluded Energy Institute and the CSV
carries no per-cell provenance. One uniform 2000–2025 span is therefore both
licence-safe for all nine and consistent with the product-wide scope.

**Residual risk:** the claim that year ≥ 2000 is entirely Ember rests on
OWID's own processing note; there is no per-cell provenance field to verify
it independently. Re-run this verification whenever the dataset version
changes (currently 2026-04-24).

**Ember logo:** Ember's CC BY grant excludes its logo. The application credits
Ember by name only and must never render an Ember logo.

### EMBER-API — Ember yearly/monthly electricity API

- **ID:** `ember-api`
- **Docs:** <https://api.ember-energy.org/docs> · versioned:
  <https://api.ember-energy.org/v1/docs>
- **Registration:** <https://ember-energy.org/data/api/>
- **Yearly data:** <https://ember-energy.org/data/yearly-electricity-data/>
- **Licence status:** `pending` (Ember data generally CC BY 4.0 — verify per dataset)
- **Constraint:** requires an API key. **Offline pipeline use only**, key
  stored as a GitHub Actions secret, never exposed in the browser. Not used
  in the first release; OWID exports preferred because they avoid a runtime
  key.

## 2. Historical primary energy

### OWID-GES — Global energy substitution / long-run energy

- **ID:** `owid-global-energy`
- **Research page:** <https://ourworldindata.org/energy-production-consumption>
- **Series:** <https://ourworldindata.org/grapher/global-energy-substitution> ·
  <https://ourworldindata.org/grapher/global-primary-energy> ·
  <https://ourworldindata.org/grapher/primary-energy-cons>
- **Licence status:** `pending`
- **Temporal coverage:** global source-by-source reconstruction from 1800;
  modern country primary energy from ~1965
- **Evidence classification:** `reconstructed` for the pre-modern global
  series; `observed` for modern statistical-agency-era values as compiled
- **Notes:** the 1800+ global reconstruction must **never** be presented as
  country-level or city-level data.

## 3. Historical population and land use

### HYDE — History Database of the Global Environment

- **ID:** `hyde`
- **Overview:** <https://www.pbl.nl/en/hyde-history-database-of-the-global-environment>
- **Dataset listing:** <https://landuse.sites.uu.nl/datasets/>
- **HYDE 3.2 publication:** <https://www.pbl.nl/en/publications/new-anthropogenic-land-use-estimates-for-the-holocene-hyde-32>
- **OWID population methodology:** <https://ourworldindata.org/population-sources>
- **Licence status:** `pending`
- **Temporal coverage:** long-run gridded reconstructions extending far
  earlier than 1700; 10-year (or coarser) time steps historically
- **Evidence classification:** `reconstructed`
- **Notes:** raw rasters are **never committed to Git**; downloaded during
  preprocessing, reduced derived outputs only are published.

## 4. Modern cities and built-up areas

### GHSL — Global Human Settlement Layer

- **ID:** `ghsl`
- **Portal:** <https://human-settlement.emergency.copernicus.eu/datasets.php>
- **Download wizard:** <https://human-settlement.emergency.copernicus.eu/downloadWizard.php>
- **Urban Centre Database:** <https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php>
- **Long-range urban centres:** <https://human-settlement.emergency.copernicus.eu/ghs_wup_mtuc_r2025a.php>
- **Licence status:** `pending` (GHSL products generally free reuse with
  European Commission attribution — verify per product)
- **Temporal coverage:** multi-temporal population/built-up products from
  1975 onward; UCDB 2024 describes 10,000+ harmonized urban centres
- **Evidence classification:** `proxy` (when used as electricity context) /
  `observed` (as population/built-up measurements in the population mode)
- **Notes:** GHSL urban centres are used instead of municipality boundaries
  for globally comparable city analysis. Raw packages not committed.

## 5. Nighttime lights

### DMSP-OLS — Defense Meteorological Satellite Program

- **ID:** `dmsp-ols`
- **Product page:** <https://eogdata.mines.edu/products/dmsp/>
- **Licence status:** `pending`
- **Temporal coverage:** annual composites 1992–2013, 30 arc-second resolution
- **Evidence classification:** `proxy`
- **Notes:** sensor saturation in bright cores; no on-board calibration;
  must be inter-calibrated before combination with VIIRS
  (see [methodology.md](methodology.md#nighttime-light-treatment)).

### VIIRS-BM — NASA Black Marble / VIIRS

- **ID:** `viirs-black-marble`
- **Overview:** <https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/science-domain/nighttime-lights/>
- **Product details:** <https://viirsland.gsfc.nasa.gov/Products/NASA/BlackMarble.html>
- **Project:** <https://science.gsfc.nasa.gov/earth/projects/586/>
- **Licence status:** `pending` (NASA data generally free with attribution;
  Earthdata login may be required for download — a pipeline credential, never
  a runtime key)
- **Temporal coverage:** 2012 onward; daily/monthly/yearly at ~500 m
- **Evidence classification:** `proxy`
- **Notes:** gas flares, fires and other non-settlement light must be removed
  or accounted for; raw radiance always kept distinct from any estimated
  electricity variable.

## 6. Power plants

### GEM — Global Energy Monitor, Global Integrated Power Tracker

- **ID:** `gem-gipt`
- **Tracker:** <https://globalenergymonitor.org/projects/global-integrated-power-tracker>
- **Download portal:** <https://globalenergymonitor.org/download-data>
- **Licence:** <https://globalenergymonitor.org/creative-commons-public-license/>
  — generally CC BY 4.0 unless a dataset states otherwise
- **Licence status:** `pending`
- **Coverage:** ~182,400 power facilities across 200 countries and areas
  (March 2026 release)
- **Evidence classification:** `observed` (facility records)
- **Notes:** the download may require manual form completion. **Access
  controls are never bypassed**; the pipeline provides an import command that
  accepts the downloaded file from a local ignored directory
  (`data/manual/`). Required attribution and notices preserved.

## 7. Boundaries

### NE — Natural Earth

- **ID:** `natural-earth`
- **Countries:** <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/>
- **Terms:** <https://www.naturalearthdata.com/about/terms-of-use/>
- **Licence:** public domain
- **Licence status:** `verified` (public domain per published terms of use)
- **Retrieved:** 2026-08-05 — `ne_50m_admin_0_countries.geojson` from the
  official `nvkelso/natural-earth-vector` repository (1:50m so microstates
  are present; 1:110m drops them)
- **Evidence classification:** n/a (geometry)
- **Notes:** used for lightweight global country geometry; attribution
  included although optional. Kosovo has no ISO 3166-1 code; Natural Earth's
  `KOS` is used and OWID's `OWID_KOS` is mapped onto it.

### GB — geoBoundaries (gbOpen)

- **ID:** `geoboundaries-gbopen`
- **Site:** <https://www.geoboundaries.org/> · API:
  <https://www.geoboundaries.org/api.html> · simplified:
  <https://www.geoboundaries.org/simplifiedDownloads.html>
- **Licence:** CC BY 4.0 (gbOpen product); attribution required
- **Licence status:** `pending` (verify per-release)
- **Coverage:** ADM0 through available lower levels
- **Notes:** only `gbOpen` is used. `gbAuthoritative` and `gbHumanitarian`
  are **not** used without independent licence checks.

### NUTS — European NUTS boundaries (GISCO)

- **ID:** `gisco-nuts`
- **Files:** <https://gisco-services.ec.europa.eu/distribution/v2/nuts/nuts-2024-files.html>
- **Licence status:** `pending` (Eurostat/GISCO reuse conditions to record;
  download licence requires acknowledgement of EuroGeographics for
  administrative boundaries)
- **Coverage:** NUTS 0–3, GeoJSON/TopoJSON/PBF formats

## 8. Directly observed subnational and long-run national series

### EIA — US Energy Information Administration

- **ID:** `eia`
- **Open data:** <https://www.eia.gov/opendata/>
- **State profiles browser:** <https://www.eia.gov/opendata/browser/electricity/state-electricity-profiles>
- **Electricity data:** <https://www.eia.gov/electricity/data.php>
- **Licence status:** `pending` (US federal data generally public domain —
  verify and record)
- **Coverage:** state-level annual electricity data; plant-level generation
- **Evidence classification:** `observed`
- **Notes:** first observed subnational adapter (admin-1 reference
  implementation). API key, if used, is a pipeline secret only.

### CBS — Netherlands national electricity balance

- **ID:** `cbs-nl`
- **Historical 1919–2018:** <https://www.cbs.nl/en-gb/figures/detail/00377eng>
- **Current balance sheet:** <https://www.cbs.nl/nl-nl/cijfers/detail/84575ENG>
- **Licence status:** `pending` (CBS open data generally CC BY 4.0 — verify)
- **Coverage:** national annual electricity balance from 1919
- **Evidence classification:** `observed`

### UK-BEIS — United Kingdom historical electricity data

- **ID:** `uk-historical-electricity`
- **Dataset:** <https://www.gov.uk/government/statistical-data-sets/historical-electricity-data>
- **Catalogue:** <https://www.data.gov.uk/dataset/93c3228c-0ad6-4e87-98c2-6a2b965d53b7/historical-electricity-data>
- **Licence status:** `pending` (Open Government Licence v3.0 expected — verify)
- **Coverage:** annual historical electricity data from 1920
- **Evidence classification:** `observed`
- **Notes:** long-run national series extend the timeline for selected
  countries only; they do **not** justify equivalent coverage elsewhere.

## 9. Register maintenance rules

1. New sources are added here before any download occurs.
2. `retrievedAt`, dataset version and checksum are recorded by the pipeline
   in `public/data/sources.json` at export time; this document records the
   human-verified licence decision.
3. A licence status change to `excluded` requires removing the source's
   outputs from `public/data/` in the same change.
4. An accessible download is **not** assumed to be legally redistributable.
5. The machine-readable counterpart of this register is
   `public/data/sources.json`, generated by the pipeline and validated in CI
   against this document's source IDs.
