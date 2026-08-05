# Methodology

This document defines how Energy Map classifies, transforms, allocates and
labels every value it displays. It is the authority for interpretation rules;
the UI must never contradict it.

## Evidence classifications

Every displayed observation has exactly one evidence classification:

```ts
type EvidenceType = "observed" | "reconstructed" | "allocated" | "proxy" | "missing"
```

| Type            | Definition                                                                        | Examples                                                       |
| --------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `observed`      | Directly reported by a statistical authority, grid operator or documented dataset | OWID/Ember country generation; EIA state data; UK 1920+ series |
| `reconstructed` | Produced from historical records through a documented reconstruction              | Global primary energy 1800+; HYDE population grids             |
| `allocated`     | A measured parent total distributed across smaller areas through a model          | City demand estimated from national demand + weights           |
| `proxy`         | A related indicator, not the metric itself                                        | Nighttime-light radiance; built-up surface; population density |
| `missing`       | No defensible value exists                                                        | City electricity in 1700; demand for unreported country-years  |

Rules:

- Every tooltip and detail panel shows: evidence classification, source,
  year, unit and geographic resolution.
- `missing` is never rendered as zero, and zero is never rendered as missing.
- Allocated values are never reclassified as observed, at any pipeline stage.
- Proxies are always named as what they are ("nighttime-light radiance"),
  never as electricity.

## Temporal-resolution model

The timeline is an **index over available time points per metric**, not a
numeric assumption that every year exists. Default granularity by period:

| Period      | Default granularity                      | Main available information                                |
| ----------- | ---------------------------------------- | --------------------------------------------------------- |
| 1700–1799   | 10 years                                 | Population, land use, settlement and activity proxies     |
| 1800–1879   | 10 years                                 | Global primary energy plus historical proxies             |
| 1880–1918   | 5 years or source years                  | Early plants and sparse electricity records               |
| 1919–1949   | Annual where observed, otherwise 5 years | Selected national electricity series (NL 1919, UK 1920)   |
| 1950–1984   | Annual where supported                   | Growing energy and electricity coverage                   |
| 1985–1991   | Annual                                   | Broad country generation                                  |
| 1992–2011   | Annual                                   | Generation, demand and DMSP-supported allocation          |
| 2012–latest | Annual                                   | Modern electricity, VIIRS-supported allocation and plants |

**Currently published span: 2000–2025.** Every metric shares one span so that
switching metric or energy source never silently changes the timeline. The cut
has two distinct causes, kept separate in the data and in
[coverage-matrix.md](coverage-matrix.md): for generation and the by-source
split it is a **licence** limit (the pre-2000 span is Energy Institute data,
whose terms forbid redistribution); for demand it is a **product scope**
decision (1990–1999 is fully CC BY 4.0 and could be republished). Earlier
periods return when the historical modes in the table above are implemented.

Mode availability by period:

- **1700 onward:** historical population, land use, settlement and activity
  proxies only.
- **1800 onward:** reconstructed global primary-energy consumption (world
  total only; geographic allocation explicitly unavailable).
- **Late 19th century onward:** selected early electricity systems and plants.
- **1919 onward:** selected long-running national electricity series.
- **1965 onward:** broader national energy coverage.
- **~1985 onward:** broad country-level electricity generation.
- **1990 onward:** broad country-level electricity demand.
- **1992 onward:** DMSP-supported spatial allocation.
- **2012 onward:** VIIRS-supported allocation.

The UI disables metrics outside their coverage; it never fabricates values to
fill a period. Playback steps through actual time points only and never
animates through fabricated intermediate years.

## Spatial-resolution model

Hierarchy: `world → country → admin1 → admin2 → urban-centre / grid-cell →
plant` (urban centres and grid cells attach to their containing admin
geography; plants attach to the finest containing geography available).

Resolution selection rules, in order:

1. Prefer directly observed child-level data.
2. Otherwise use a documented child-level allocation of an observed parent
   total.
3. Otherwise display the parent-level value at its actual geographic
   resolution.
4. Otherwise display a clearly named proxy.
5. Otherwise display missing data.

Never colour every child polygon with a parent value in a way that suggests
measured local variation. When visible geometry is finer than the measured
data, the UI states this explicitly.

## Derived metrics

All derived metrics inherit the **weakest** evidence classification of their
inputs and record a methodology ID.

| Metric                  | Formula                                           | Notes                                                                |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Generation per capita   | generation ÷ population                           | population source and vintage recorded; null if either input missing |
| Demand per capita       | demand ÷ population                               | same                                                                 |
| Share of global total   | value ÷ world total for same metric/year          | world total must come from the same source family                    |
| Net imports             | demand − generation (or source-reported net flow) | one documented sign convention: **positive = net importer**          |
| Absolute/percent change | value(t) − value(t₀); ÷ value(t₀)                 | only between real time points; never across interpolations           |

Unit conventions: electricity in TWh (display auto-scales to GWh/MWh);
capacity in MW; primary energy in TWh (with source-original units recorded);
population in persons. Conversions are performed once, in the pipeline, and
recorded per observation (`unit`, `processingVersion`).

## Spatial allocation methodology

The project may allocate observed parent totals to smaller regions, cities or
grid cells only through a versioned and validated methodology.

### General constraint

For parent geography p, child geographies i, metric m, year t:

```text
estimated_child_value(i, m, t) = parent_total(p, m, t) × normalized_weight(i, m, t)
sum(child estimates) = parent observed total
absolute allocation error / parent total ≤ 0.001
```

Reconciliation runs after prediction: raw model outputs are scaled so child
totals match the parent exactly, and the scale factor is recorded as a
validation metric. Missing parent totals produce **no** allocation. No
negative allocations.

### Candidate allocation features

Population, urban population, built-up surface, non-residential built-up
surface or volume, nighttime-light radiance, power-plant capacity,
industrial-facility presence, land use, electricity access, sector
composition, climate-related demand variables where openly available.

### Model strategy

Fixed arbitrary weights are prohibited. The model ladder is:

1. **M-POP** — population-only baseline.
2. **M-POP-BU** — population + built-up-area baseline.
3. **M-FULL** — population, non-residential built environment,
   nighttime lights and industrial/plant features.
4. Calibration against countries/regions with directly observed subnational
   electricity data (initially US states via EIA).
5. Non-negative or otherwise interpretable coefficients (constrained
   regression before any more complex model).
6. Out-of-sample validation by holding out measured regions.
7. Model-version metadata on every output.
8. Residual and uncertainty reporting (exported with validation metrics).
9. Parent-total reconciliation after prediction.

Training and evaluation regions are strictly separated; validation metrics
(held-out MAPE/R², reconciliation scale factors, residual summaries) are
exported to `public/data/methodologies.json`.

### Output labelling

Allocated outputs are labelled:

```text
Estimated spatial allocation of an observed parent total
```

Never simply "Observed electricity consumption". Confidence
(`high | medium | low`) is required on every allocated observation.

### Historical allocation windows

| Period    | Permitted basis                                                                          |
| --------- | ---------------------------------------------------------------------------------------- |
| 1700–1799 | Population and land-use context only, unless a defensible energy reconstruction is found |
| 1800–1879 | Global energy totals plus historical activity context                                    |
| 1880–1974 | Selected national electricity records, plants and population-based context               |
| 1975–1991 | GHSL population and built-up indicators may support experimental allocation              |
| 1992–2011 | DMSP plus population and built-up indicators                                             |
| 2012–     | VIIRS plus GHSL and infrastructure indicators                                            |

## Nighttime-light treatment

- Nighttime lights are always a **proxy input**, never electricity.
- Gas flares, fires and other non-settlement sources are removed or masked
  using published flare/fire masks; the masking method is versioned.
- DMSP limitations documented per composite: sensor saturation in bright
  urban cores, no on-board calibration, inter-satellite drift, blooming.
- VIIRS limitations documented: low-light detection limits, airglow,
  seasonal/angular effects.
- **DMSP and VIIRS values are never compared directly.** Any cross-sensor
  series requires a documented inter-calibration (published coefficients or
  a fitted harmonization on overlapping years 2012–2013), stored as its own
  methodology version. Until such a calibration is implemented and
  validated, DMSP-era and VIIRS-era models are separate and their outputs
  are not shown as one continuous series.
- Raw radiance variables are kept distinct from estimated electricity in
  all schemas and exports.

## Historical-boundary treatment

- Modern boundaries (Natural Earth, geoBoundaries) are labelled with their
  geometry source and version on every view.
- Applying modern administrative borders to historical data is always
  labelled with the boundary convention ("2024 boundaries shown; entities
  did not exist in this form in <year>").
- Historical political entities and boundary sets are a Should-have; until
  integrated, pre-1900 views state the anachronism explicitly.
- Historical city boundaries are never invented; GHSL urban-centre extents
  are dated products and are labelled with their epoch.

## Uncertainty and confidence

- `confidence` (`high | medium | low | null`) is set per observation:
  observed data defaults to `high` unless the source flags issues;
  reconstructed data per the source's own uncertainty statements; allocated
  data from model validation quantiles; proxies carry `null` (confidence is
  not meaningful for an indicator that is not the metric).
- Where a source provides bounds, `lowerBound`/`upperBound` are preserved.
- City-level estimates are the least certain product of this project. Their
  known limitations — allocation-model error, proxy saturation, boundary
  mismatch, informal consumption, industrial loads outside urban extents —
  are listed in the city panel's methodology link.

## Validation

Pipeline validation rules (enforced in `pipeline/energy_map_pipeline/validation/`):

**Observations:** geography ID exists; metric registered; unit registered;
year valid; country-year-metric-source unique unless explicitly versioned;
non-negative where logically required; population positive where provided;
zero stays zero; missing stays null; aggregate entities never treated as
countries; energy-source components checked against totals; net imports
follow the single documented sign convention.

### Energy-source components vs totals — what the check proves

The nine generation-by-source series are reconciled against the separately
published total for every country-year, with a tight tolerance (0.005 TWh —
values carry at most two decimals). Measured over the published span, all
5,292 country-years reconcile exactly.

**This proves arithmetic consistency, not completeness.** OWID's published
total is itself derived as the sum of the nine sources, treating an
unreported source as zero. Two consequences are load-bearing:

1. The check is a schema-drift tripwire — it fires if a column binds to the
   wrong series, a tenth source appears, or units change — but it can never
   reveal that a source was never reported.
2. Where a source is unreported, **the published total understates actual
   generation**. This is not rare: 612 country-years lack "other renewables"
   and 22 countries never report it at all, including several of the largest
   generators.

Completeness is therefore tracked separately by a missing-cell census
(`coverage.json` → `sourceCompleteness`, and `join-report.json`), which
records per-source unreported counts, reported-zero counts, countries that
never report a source, and how many country-years above 100 TWh have a gap.
The country panel states explicitly when a country's mix is incomplete, so a
share of "100%" is never read as "all electricity generated".

### Reported zero vs unreported

Just over half of all published source cells are exactly zero, so the
distinction carries most of the dataset's signal. Both directions are errors:
collapsing unreported to zero fabricates data, and hiding zero loses the
strongest true statement in the data ("this country generates no nuclear at
all"). The map therefore paints three visually distinct states — not
reported, zero, and bucketed positive values — and the panel writes
"not reported" rather than a number.

**Geographies:** feature IDs unique; parent IDs exist; geometry valid; ISO
codes follow ISO 3166-1 alpha-3; geometry-source version recorded; join
coverage reported; unmatched records reported.

**Allocations:** child totals reconcile to parent (≤ 0.1%); no negatives; no
allocation without a parent total; confidence present; methodology ID
present; train/eval separation; validation metrics exported; never
reclassified as observed.

**Site:** published `dist` < 1 GB; initial required transfer < 5 MB; every
manifest-referenced file exists; checksums match; no API keys in built JS;
no absolute local paths; no Git LFS pointers.
