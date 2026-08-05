# Energy Map data pipeline

Offline Python pipeline that produces every static data file the frontend
serves (`public/data/`). It never runs in the browser and never requires a
runtime secret.

## Setup

```bash
cd pipeline
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .[dev]
pytest
```

Heavy geospatial dependencies (geopandas, rasterio, …) are isolated in the
`geo` extra and only needed from the tile/raster phases onward:

```bash
pip install -e .[dev,geo]
```

## Usage

```bash
energy-map-pipeline --help
energy-map-pipeline verify-output --data-root ../public/data
```

Stages (`download`, `normalize`, `build-tiles`, …) are registered up front
and fail with a clear diagnostic until their implementation phase arrives;
see `docs/requirements.md` §6 for the phase plan.

## Data directories

| Directory       | Purpose                                   | In Git? |
| --------------- | ----------------------------------------- | ------- |
| `data/raw/`     | Original downloads, exactly as retrieved  | no      |
| `data/interim/` | Intermediate transforms                   | no      |
| `data/manual/`  | Manually downloaded restricted-form files (e.g. GEM) | no |
| `public/data/`  | Deployable, generated, deterministic output | yes   |

Raw GHSL/HYDE/nighttime-light rasters, GEM spreadsheets and MBTiles
intermediates are never committed. Manually downloaded files are validated
by expected filename and checksum before use.

## Rules

- Verify a source's licence in `docs/data-source-register.md` **before**
  downloading or redistributing it.
- Fail loudly on schema drift; never silently coerce.
- Missing stays `None`; zero stays zero; allocated is never relabelled
  observed (enforced by `models.py`).
- Exports are deterministic (stable ordering and formatting) so diffs are
  reviewable.
