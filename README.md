# Energy Map

An interactive historical atlas of energy and electricity: how production,
consumption, infrastructure and related human activity shifted geographically
from 1700 to the latest complete year.

**Live:** <https://mihaibobeica.github.io/energy-map/>

> **Read this first — what the map does *not* claim.**
> Equivalent electricity data does **not** exist across the whole
> 1700–present period. The timeline starts in 1700, but early periods show
> population, land-use and activity **proxies**, not electricity. Broad
> country-level electricity generation exists from ~1985, demand from 1990.
> Every value carries an evidence classification, and estimates can be
> hidden entirely.

## Product principle

> Show the finest defensible data available, not the finest geography that
> can be drawn.

## Evidence classifications

| Class           | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `observed`      | Directly reported by a statistical authority, grid operator or documented dataset |
| `reconstructed` | Produced from historical records through a documented reconstruction       |
| `allocated`     | A measured parent total distributed across smaller areas through a model   |
| `proxy`         | A related indicator (population, nighttime light, built-up area)           |
| `missing`       | No defensible value exists — never rendered as zero                        |

**Estimation warning:** allocated city/regional values are *"estimated
spatial allocations of an observed parent total"*, produced by a versioned,
validated model — they are not measurements, and the UI labels them
accordingly. Nighttime lights are a proxy input and never presented as
electricity itself.

## Status

Phase 1 — repository foundation. The deployed site is an application shell
(map canvas, manifest loading, attribution); data slices land in subsequent
phases. See [docs/requirements.md](docs/requirements.md) for the phase plan.

## Screenshots

*Screenshots will be added once the first data slice is deployed.*

## Local setup

Prerequisites: Node.js ≥ 22, npm ≥ 10, Python ≥ 3.12 (pipeline only).

```bash
npm ci                 # install frontend dependencies
npm run dev            # dev server at http://localhost:5173/energy-map/
```

## Build

```bash
npm run build          # typecheck + production build into dist/
npm run preview        # serve the production build locally
```

Quality gates:

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run test           # Vitest unit + component tests
npm run test:e2e       # Playwright smoke tests (requires browsers installed)
npm run verify:data    # manifest/data integrity checks
```

## Data pipeline

The pipeline is a Python package in [pipeline/](pipeline/README.md). It runs
offline (locally or via the manual `build-data` workflow), never in the
browser. Raw downloads live in git-ignored `data/raw/`, `data/interim/`,
`data/manual/`; only generated static files in `public/data/` are deployed.

```bash
cd pipeline
python -m venv .venv && .venv/Scripts/activate    # or source .venv/bin/activate
pip install -e .[dev]
pytest
python -m energy_map_pipeline --help
```

## Deployment

Pushes to `main` run the full check suite and deploy `dist/` to GitHub Pages
via `actions/configure-pages` → `actions/upload-pages-artifact` →
`actions/deploy-pages` (see
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)).
Vite is configured with `base: "/energy-map/"` because project Pages sites
are served under the repository path.

## Architecture

Fully static client-side app: React 19 + TypeScript (strict) + Vite,
MapLibre GL JS with PMTiles for geometry, versioned JSON for observations,
URL query parameters for shareable state. No backend, no database, no tile
server, no runtime API keys, no paid map services. Details and ADRs:
[docs/architecture.md](docs/architecture.md).

## Data sources

All sources, licences and verification status:
[docs/data-source-register.md](docs/data-source-register.md). Planned core
sources include Our World in Data (energy/electricity), HYDE (historical
population), GHSL (urban centres), DMSP & VIIRS nighttime lights (proxy
inputs), Global Energy Monitor (plants), Natural Earth and geoBoundaries
(geometry), US EIA / CBS / UK DESNZ (observed national & subnational
series). Coverage by metric and period:
[docs/coverage-matrix.md](docs/coverage-matrix.md).

## Licence and attribution

Code is MIT ([LICENSE](LICENSE)). Data licences are separate and tracked per
source; required attribution is listed in
[docs/licenses-and-attribution.md](docs/licenses-and-attribution.md) and
shown in the application.

## Known limitations

- Modern administrative boundaries are shown for historical periods until
  historical boundary support lands; views are labelled with the boundary
  convention.
- City-level estimates are model allocations with documented error, not
  measurements.
- DMSP and VIIRS nighttime-light eras are not directly comparable and are
  not shown as one continuous series without documented calibration.
- Coverage varies drastically by period and geography; the coverage matrix
  is the authority on what exists.

## Roadmap

Phases 2–8: country electricity slice → historical time model → plants →
regions (US states) → cities (GHSL) → allocation model → optimization and
v1.0 release. Full definitions: [docs/requirements.md](docs/requirements.md).
