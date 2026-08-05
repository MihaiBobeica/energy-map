# Architecture

Energy Map is a fully static client-side web application. There is no runtime
backend, no database server, no tile server and no runtime secret. Everything
served to the browser is a static file built ahead of time and published to
GitHub Pages under `/energy-map/`.

## 1. System overview

```text
┌────────────────────────────┐      ┌──────────────────────────────┐
│ Python data pipeline       │      │ React + Vite frontend        │
│ (offline, CI or local)     │      │ (browser, GitHub Pages)      │
│                            │      │                              │
│ download → normalize →     │      │ MapLibre GL JS + PMTiles     │
│ validate → allocate →      │ ───▶ │ manifest-driven data loading │
│ build tiles → export       │      │ URL-state, panels, charts    │
└────────────────────────────┘      └──────────────────────────────┘
        writes public/data/                reads /energy-map/data/
```

The pipeline runs offline (locally or in a manually dispatched GitHub Actions
workflow), never in the browser. Its only interface to the frontend is the
set of static files in `public/data/`.

## 2. Frontend stack

| Concern      | Choice                                    | Rationale (ADR)                                   |
| ------------ | ----------------------------------------- | ------------------------------------------------- |
| UI framework | React 19 + TypeScript strict              | ADR-1                                             |
| Build        | Vite, `base: "/energy-map/"`              | project-page deployment requires the repo path    |
| Map          | MapLibre GL JS                            | ADR-2: WebGL vector maps, no token, no paid tiles |
| Tiles        | PMTiles (static single-file archives)     | ADR-3: no tile backend on Pages                   |
| Charts       | Recharts (+ d3-scale/d3-format utilities) | lightweight, declarative React charts             |
| State        | Focused React contexts + URLSearchParams  | ADR-4: no Redux until a concrete need appears     |
| Unit tests   | Vitest + React Testing Library            |                                                   |
| E2E          | Playwright                                | smoke suite against `vite preview`                |
| Lint/format  | ESLint (typescript-eslint) + Prettier     |                                                   |

Routing: query-parameter state on a single page (`?mode=…&metric=…&year=…`).
No history-based router — deep links must work on GitHub Pages without a
server rewrite layer. Invalid parameters fall back safely to defaults.

## 3. Frontend source layout

```text
src/
├── components/   # panels, legend, attribution, error boundaries
├── map/          # MapLibre wrapper, layers, feature-state updates
├── charts/       # historical line charts, totals charts
├── controls/     # mode/metric/source/time/evidence controls
├── data/         # manifest + observation loading, caching, checksums
├── domain/       # types (EvidenceType, Geography, EnergyObservation…), pure logic
├── hooks/        # useManifest, useYearData, useUrlState…
├── state/        # contexts and reducers for app state
├── utils/        # formatting, scales, assertions
├── App.tsx
└── main.tsx
```

Domain logic (metric availability by year/mode, resolution fallback, unit
formatting, share/per-capita calculations) lives in `src/domain/` as pure
functions so it is unit-testable without the DOM or the map.

## 4. Data contracts

Geometry and observations are kept separate. Yearly values are never
duplicated into geometry features; the map joins them at runtime via stable
feature IDs and MapLibre feature state.

```text
public/data/
├── manifest.json            # entry point: schema version, datasets, files
├── sources.json             # machine-readable source + licence register
├── methodologies.json       # model versions, assumptions, validation metrics
├── coverage.json            # generated coverage records per metric/level
├── geography-index.json     # id, name, type, parentId, iso3 for search/panels
├── country-series/          # per-country full history (lazy-loaded on select)
│   └── {ISO3}.json
├── years/                   # per-metric, per-year compact id→value records
│   ├── electricity-generation/{year}.json
│   ├── electricity-demand/{year}.json
│   ├── primary-energy/{year}.json
│   └── allocated-demand/{year}.json
├── tiles/
│   ├── countries.pmtiles
│   ├── admin1.pmtiles
│   ├── urban-centres.pmtiles
│   └── plants.pmtiles
└── checksums.json
```

Year files contain compact ID–value records plus only the metadata needed to
render that view (unit, evidenceType per record where mixed, sourceId,
datasetVersion). Full provenance lives in `sources.json` /
`methodologies.json` and is joined client-side.

All files under `public/data/` are generated deterministically by the
pipeline (stable key order, stable float formatting) so diffs are reviewable.

## 5. Data pipeline

Python ≥3.12 package in `pipeline/` (`energy_map_pipeline`), with `pandas`,
`pydantic`, `requests`, `pyarrow` as core dependencies and heavy geo
dependencies (`geopandas`, `shapely`, `pyogrio`, `rasterio`, `xarray`)
isolated in a `geo` extra until the phases that need them.

Stages (CLI subcommands):

```text
download → normalize → validate-raw → build-geographies →
build-country-series → build-regional-series → build-city-features →
fit-allocation-model → allocate → validate-allocations →
build-tiles → export-static → build-coverage-report →
verify-licenses → verify-output
```

Adapter contract — every adapter must:

1. Download or accept source data.
2. Preserve the original source file outside deployed assets
   (`data/raw/`, `data/manual/` — both git-ignored).
3. Parse source-specific fields.
4. Convert units once, centrally.
5. Standardize geography IDs.
6. Record provenance (source ID, dataset version, retrieval date, licence).
7. Validate expected coverage.
8. Produce normalized records.
9. Fail loudly on schema drift.

Raw/interim directories (`data/raw/`, `data/interim/`, `data/manual/`) are
git-ignored. Only `public/data/` outputs are deployable. Raw GHSL/HYDE/
nighttime-light rasters, GEM spreadsheets and MBTiles intermediates are never
committed. Manually downloaded files are validated by expected filename and
checksum.

## 6. Performance strategy

- Load only `manifest.json`, initial country geometry and the selected year
  at startup (< 5 MB initial transfer budget).
- Lazy-load country histories on selection; lazy-load admin/city/plant
  layers only when the user reaches them.
- PMTiles archives with simplified low-zoom geometry; detail only at high
  zoom.
- Never recreate the MapLibre map on state change; update via feature state
  or source data updates (country recolour < 300 ms; city/region < 1 s).
- Debounce expensive timeline interaction; prefetch adjacent time points
  during playback.
- Cache-friendly immutable versioned data files.
- No thousands of React DOM nodes over the map; overlays render through
  MapLibre layers.
- Web Workers for heavy parsing only when profiling proves the need.

## 7. CI and deployment

Workflows:

- **ci.yml** — pull requests and pushes: `npm ci`, format check, lint,
  typecheck, unit tests, build, Playwright smoke tests, pipeline install,
  `pytest`, output validation, site-size validation.
- **deploy-pages.yml** — push to `main`: run the full check suite, build
  `dist`, then `actions/configure-pages` → `actions/upload-pages-artifact` →
  `actions/deploy-pages` with `permissions: contents: read, pages: write,
id-token: write` and the `github-pages` environment. Deploys only after
  all checks pass.
- **build-data.yml** — manual `workflow_dispatch`: fetch permitted automated
  sources, validate versions, accept manual restricted-form sources, build
  normalized data and tiles, run validation, produce coverage and licence
  reports, show generated-file sizes. Does not auto-commit data unless
  explicitly configured later.

Constraints enforced in CI: `dist` < 1 GB, no secrets in bundles, no LFS
pointers, manifest-referenced files exist, checksums match.

## 8. Architecture decision records

### ADR-1 — React + TypeScript strict + Vite

**Decision.** React 19 with TypeScript `strict: true`, built by Vite with
`base: "/energy-map/"`.
**Why.** Mandated stack; Vite's static output maps directly to GitHub Pages;
the base path is required for project pages.
**Consequences.** All asset URLs go through `import.meta.env.BASE_URL`; no
server-side routing.

### ADR-2 — MapLibre GL JS, no external basemap dependency

**Decision.** MapLibre GL JS with a neutral self-hosted style (own vector
layers over a plain background), no Mapbox tokens, no paid services.
**Why.** WebGL performance for choropleths and tens of thousands of points;
open licence; works offline from static files.
**Consequences.** We author our own style JSON; boundary/attribution strings
are our responsibility and are displayed in the map's attribution control.

### ADR-3 — PMTiles for geometry and large point layers

**Decision.** All large geometry ships as PMTiles archives read via HTTP
range requests; small metadata ships as versioned JSON.
**Why.** Single static file per layer, no tile server, fits the Pages 1 GB
budget with internal compression and zoom-dependent simplification.
**Consequences.** Build step needs tippecanoe (or equivalent) in the data
workflow; feature IDs must be stable across rebuilds for feature-state joins.

### ADR-4 — Focused contexts + URL state instead of Redux

**Decision.** Small React contexts (selection, time, data cache) plus
`URLSearchParams` as the canonical shareable state.
**Why.** The state surface is small and serializable; the URL is a product
requirement (shareable views), so it is the source of truth rather than a
mirror.
**Consequences.** Reducers/parsers for URL state live in `src/state/` with
exhaustive unit tests; invalid parameters fall back safely.

### ADR-5 — Static observation files split by metric-year and by geography

**Decision.** Two projections of the same normalized data: per-metric-year
files for map painting; per-geography series files for panels/charts.
**Why.** Map repaint needs one year for all geographies (< 300 ms budget);
panels need all years for one geography. Serving both projections avoids
loading everything for either interaction.
**Consequences.** Storage duplication is accepted (bounded, compressed);
determinism and checksums guard against projection drift.

### ADR-6 — Python pipeline with pinned, locked dependencies

**Decision.** `pipeline/` is a `pyproject.toml` package with a committed
lockfile; geo dependencies isolated in an optional extra until needed.
**Why.** Reproducibility of published data is a product requirement;
geopandas/rasterio are heavy and unneeded in early phases.
**Consequences.** CI installs from the lockfile; lockfile updates are
explicit commits.
