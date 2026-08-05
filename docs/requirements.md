# Requirements

Energy Map is an interactive historical atlas showing how energy and electricity
production, consumption, infrastructure, and related human activity shifted
geographically from 1700 to the latest complete source year.

Deployment target: <https://mihaibobeica.github.io/energy-map/>

## 1. Product principle

> Show the finest defensible data available, not the finest geography that can
> be drawn.

The application must never imply that equivalent electricity data exists across
the whole 1700–present period. Available modes and metrics change with the
selected period, and every displayed observation carries exactly one evidence
classification (see [methodology.md](methodology.md#evidence-classifications)).

## 2. SMART objective

At completion of version 1.0, the repository provides a deployed, fully static
client-side application that:

1. Supports a timeline beginning in 1700 and ending at the latest complete
   source year.
2. Uses only the actual time points available for each metric instead of
   assuming annual coverage.
3. Provides country-level electricity generation for at least 190 geographies
   for the broad modern period (1985 onward).
4. Provides country-level electricity demand for all geographies supported by
   the selected source (1990 onward).
5. Provides globally harmonized urban-centre coverage using at least 10,000
   GHSL urban centres.
6. Provides a plant infrastructure layer using the latest legally
   distributable Global Energy Monitor data available to the project.
7. Provides at least one directly observed subnational electricity dataset as
   an initial reference implementation (US EIA state data).
8. Provides global city-level or grid-level allocated estimates from 1992
   onward where sufficient parent totals and proxy variables exist.
9. Clearly distinguishes observed, reconstructed, allocated and proxy data.
10. Preserves parent totals when allocating values to child regions within a
    tolerance of 0.1% (relative absolute error ≤ 0.001).
11. Loads the initial usable interface with no more than 5 MB of required
    transferred application and data assets.
12. Updates country-level map values within 300 ms after the required data is
    loaded.
13. Updates city and regional layers within one second after the required data
    is loaded.
14. Keeps the complete published GitHub Pages site below 1 GB.
15. Passes TypeScript, lint, formatting, unit, pipeline, build and end-to-end
    smoke checks.
16. Works on recent stable versions of Chrome, Firefox, Safari and Edge.
17. Provides usable desktop and mobile layouts.
18. Is accessible through the expected GitHub Pages repository path
    (`/energy-map/`).

GitHub Pages constraints designed around: published sites are limited to 1 GB
and have a soft bandwidth limit of 100 GB per month.

## 3. MoSCoW requirements

### 3.1 Must have

#### Product and interface

- Interactive world map with zoom and pan
- Timeline beginning in 1700 with non-uniform time steps based on real source
  coverage
- Play/pause animation; previous/next available time-point controls; explicit
  selected year
- Mode selector: Electricity · Primary energy · Infrastructure · Historical
  population and activity
- Metric selector, energy-source selector
- Geographic-resolution indicator and evidence-type indicator
- Option to hide allocated and proxy values
- Dynamic legend with a missing-data legend state
- Country and region hover tooltips; clickable geography detail panel
- Source and methodology links; visible attribution
- Responsive mobile layout; loading and failure states

#### Electricity metrics (where source coverage permits)

- Electricity generation; electricity demand/consumption; net imports/exports
- Generation per capita; demand per capita
- Share of global generation; share of global demand
- Generation by source: coal, gas, oil/other fossil, nuclear, hydro, wind,
  solar, bioenergy, other renewables

#### Primary-energy metrics (where source coverage permits)

- Total primary-energy consumption; primary energy by source
- Primary energy per capita; share of global primary energy
- For early periods with global totals but insufficient spatial breakdown,
  show the world total and explicitly state that geographic allocation is
  unavailable.

#### Infrastructure metrics

- Plant location, technology, capacity, status, commissioning year/period,
  retirement year where available, owner where available, source record
- Plant points clustered at low zoom; individual plant selection at high zoom
- Capacity must not be presented as actual annual generation.

#### Geographic hierarchy

- Country boundaries; admin-1 boundaries where available; urban-centre
  polygons or points; plant points
- Stable identifiers for every geographic feature
- Parent–child relationships between geography levels
- Finest-available-data fallback with an explicit statement when the visible
  geometry is finer than the available measured data

#### Country and geography panel

Geography name, type, parent geography, selected metric, selected time, value
and unit, evidence classification, confidence, historical line chart, source,
methodology, coverage period, comparison with parent geography, share of
parent total, missing-data explanation where applicable.

#### Data provenance

Every observation identifies: source ID, dataset version, retrieval date,
original source URL, licence, processing version, methodology ID, evidence
classification, geographic resolution, temporal resolution.

#### Deployment

- React, TypeScript strict mode, Vite, GitHub Actions, GitHub Pages
- `base: "/energy-map/"`
- No runtime backend, no database server, no runtime secret API keys, no
  dependency on paid map services, no Git LFS pointers in deployed assets

### 3.2 Should have

Baseline-year comparison · absolute and percentage change · side-by-side year
comparison · country and city search · URL state (year, metric, source,
evidence filter, geography) · shareable URLs · ranked geography table ·
download visible data as CSV · download observation metadata · data-coverage
map · confidence visualization · data-quality timeline · global totals chart ·
resolution-dependent automatic layer switching · measured-only mode ·
best-estimate mode · colour-blind-safe palettes · logarithmic scaling for
highly skewed positive values · diverging scales for imports, exports and
changes · several directly observed subnational data adapters · historical
boundary support where open and reliable data exists · country comparison ·
playback-speed control · full-screen map · dataset version indicator

### 3.3 Could have

Transmission lines · cross-border electricity flows · electricity prices ·
carbon intensity · power-sector emissions · electricity access · historical
electrification dates · grid expansion · historical mines, dams and
industrial sites · fossil-fuel production · user-selectable estimation
models · model residual and uncertainty maps · screenshot export · embeddable
map · PWA support · dark mode · historical political entities · geographic
centre of global electricity demand over time

### 3.4 Won't have initially

Real-time grid data · household-level data · user accounts · authentication ·
user-submitted data · editable maps · forecasting · AI-generated historical
values · exact global city electricity consumption for 1700 · claims that
nighttime light directly measures total electricity · automatic
redistribution of data whose licence has not been verified · a server-side
API · a PostGIS database · a conventional tile server

## 4. Non-negotiable interpretation rules

1. **Electricity before electrification.** Do not display electricity
   production or consumption for periods where no defensible electricity
   statistics exist. Mode/metric availability follows the temporal model in
   [methodology.md](methodology.md#temporal-resolution-model).
2. **Evidence classification.** Every displayed observation carries exactly
   one of `observed | reconstructed | allocated | proxy | missing`. Every
   tooltip and detail panel shows evidence classification, source, year, unit
   and geographic resolution.
3. **No false precision.**
   - Never silently convert missing data to zero.
   - Never interpolate sparse historical values and present them as
     observations.
   - Never imply that a city estimate is measured unless directly reported.
   - Never map national totals identically onto every region.
   - Never compare DMSP and VIIRS nighttime-light values directly without a
     documented calibration method.
   - Never apply modern administrative borders to historical data without
     labelling the boundary convention.
   - Do not invent historical city boundaries or electricity values.
   - Disable unavailable metrics instead of fabricating values.

## 5. Definition of done (v1.0)

1. The application is deployed at the expected GitHub Pages URL.
2. The timeline begins in 1700.
3. Historical modes do not imply nonexistent electricity observations.
4. Broad modern country electricity data is available.
5. At least one observed subnational implementation works.
6. GHSL urban centres are integrated.
7. Plant infrastructure is integrated if legally obtained.
8. Allocated values preserve parent totals.
9. Every value exposes evidence, source and methodology.
10. Users can hide estimates and proxies.
11. Missing data remains distinct from zero.
12. The map supports country, region, city and plant interaction.
13. The application passes all automated tests.
14. The published site remains below GitHub Pages limits.
15. The README and methodology documentation are complete.
16. All required attribution is visible.
17. No source licence is unresolved.
18. No runtime secret is exposed.

## 6. Implementation phases

| Phase | Scope                                                                                  |
| ----- | -------------------------------------------------------------------------------------- |
| 0     | Requirements, architecture, source register, coverage matrices, risk register (this docs set) |
| 1     | Repository foundation: React/Vite/TS, testing, CI, Pages deployment, empty map shell, manifest loading, error boundaries, attribution |
| 2     | Country electricity vertical slice: Natural Earth geometry, OWID generation/demand, timeline, choropleth, tooltip, country panel, line chart |
| 3     | Historical time model: 1700 start, HYDE population context, global primary energy from 1800, UK 1920 / NL 1919 series, sparse timeline |
| 4     | Plants: manual GEM import, normalization, PMTiles, clusters, filters, plant panel, GEM attribution |
| 5     | Regions: geoBoundaries admin-1, US EIA state adapter, zoom-based transitions, parent–child comparison |
| 6     | Cities: GHSL urban centres, population/built-up features, city search and panel |
| 7     | Allocation model: population/built-up baselines, DMSP + VIIRS features, calibration, cross-validation, reconciliation |
| 8     | Optimization and release: PMTiles optimization, lazy-loading, mobile polish, accessibility, e2e, docs, licence review |

## 7. Risk register

| ID  | Risk                                                                | Likelihood | Impact | Mitigation                                                                                   |
| --- | ------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------- |
| R1  | Source licence forbids redistribution of processed output           | Medium     | High   | Verify licence before redistribution; exclude source on failure; machine-readable licence manifest |
| R2  | Source schema drift breaks pipeline                                 | High       | Medium | Adapters fail loudly on schema drift; pinned dataset versions; checksums                     |
| R3  | Site size exceeds GitHub Pages 1 GB limit                           | Medium     | High   | `check-site-size.sh` in CI; PMTiles simplification; data chunking budget per layer           |
| R4  | Initial load exceeds 5 MB budget                                    | Medium     | Medium | Manifest + selected-year loading only; lazy layers; CI bundle-size check                     |
| R5  | Allocated values misread as measurements                            | Medium     | High   | Mandatory evidence badges; "hide estimates" toggle; labelling rules in methodology           |
| R6  | DMSP→VIIRS discontinuity produces spurious trends                   | High       | Medium | Documented inter-calibration before any cross-sensor series; separate model versions per sensor era |
| R7  | GEM download requires manual form; automation not permitted         | High       | Low    | Manual import command from local ignored directory; documented in pipeline README            |
| R8  | Historical boundaries anachronistic for pre-1900 data               | High       | Medium | Boundary convention labelled on every historical view; historical boundary support tracked as Should-have |
| R9  | GitHub Pages bandwidth soft limit (100 GB/month) exceeded           | Low        | Medium | Immutable versioned files with long cache lifetimes; small default payloads                  |
| R10 | Pipeline dependencies (geopandas/rasterio) fail on CI runners       | Medium     | Low    | Wheels-only installs; geo dependencies isolated in an optional extra until needed            |

## 8. Working rules

- Keep `main` deployable; work through focused feature branches; prefer
  small, reviewable commits.
- Do not suppress validation errors; do not add unverified data merely to
  increase coverage.
- Do not replace missing values with model output unless the output is
  explicitly classified as allocated.
- Preserve reproducibility; record every transformation; use deterministic
  exports.
- Do not commit large raw data; do not add a backend; do not introduce paid
  services; do not use Mapbox tokens.
- Use hash-safe routing only (no history routing that breaks GitHub Pages).
- Do not continue after a licence failure without excluding the affected
  source.
- When a source changes schema, fail with a clear diagnostic.
- Build the simplest valid vertical slice before optimizing.
