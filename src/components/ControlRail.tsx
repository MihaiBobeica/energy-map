import { datasetsForMetric, metricsOf, type ManifestDataset } from "../data/manifest.ts"
import type { ScaleDefinition } from "../utils/scale.ts"
import { ScaleKey } from "./ScaleKey.tsx"

const REPO_URL = "https://github.com/MihaiBobeica/energy-map"

export type Basis = "total" | "per-capita"

type ControlRailProps = {
  datasets: ManifestDataset[]
  dataset: ManifestDataset
  basis: Basis
  scale: ScaleDefinition
  year: number
  years: number[]
  playing: boolean
  loading: boolean
  evidenceLine: string
  perCapitaAvailable: boolean
  perCapitaLastYear: number | null
  onSelectDataset: (metric: string, energySource: string | null) => void
  onBasisChange: (basis: Basis) => void
  onYearChange: (year: number) => void
  onTogglePlay: () => void
}

/**
 * One rail, not three cards. Reads top-to-bottom as "what am I looking at"
 * (VIEW) → "when" (TIME) → "what do the colours mean" (SCALE). The scale key is
 * pinned outside the scrolling body so a short window can never hide it.
 */
export function ControlRail({
  datasets,
  dataset,
  basis,
  scale,
  year,
  years,
  playing,
  loading,
  evidenceLine,
  perCapitaAvailable,
  perCapitaLastYear,
  onSelectDataset,
  onBasisChange,
  onYearChange,
  onTogglePlay,
}: ControlRailProps) {
  const metrics = metricsOf(datasets)
  const siblings = datasetsForMetric(datasets, dataset.metric)
  const hasSources = siblings.some((candidate) => candidate.energySource !== null)

  const yearIndex = years.indexOf(year)
  const lastIndex = years.length - 1
  const singleTimePoint = years.length <= 1

  const coverageNote = (() => {
    if (!dataset.yearGeographyCounts) return null
    const datasetIndex = dataset.years.indexOf(year)
    if (datasetIndex < 0) return null
    const count = dataset.yearGeographyCounts[datasetIndex]
    const max = Math.max(...dataset.yearGeographyCounts)
    if (count === undefined || count >= 0.8 * max) return null
    return `Partial coverage: ${count} countries reported so far for ${year}.`
  })()

  const step = (delta: number) => {
    const next = years[yearIndex + delta]
    if (next !== undefined) onYearChange(next)
  }

  return (
    <section className="card rail" aria-label="Map controls">
      <header className="rail-head">
        <h1>Energy Map</h1>
        <p className="rail-subtitle">{evidenceLine}</p>
      </header>

      <div className="rail-body">
        <section className="rail-section">
          <label className="field">
            <span className="field-label">Metric</span>
            <select
              value={dataset.metric}
              onChange={(event) => onSelectDataset(event.target.value, null)}
              aria-label="Metric"
            >
              {metrics.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.title}
                </option>
              ))}
            </select>
          </label>

          {hasSources && (
            <label className="field">
              <span className="field-label">Energy source</span>
              <select
                value={dataset.energySource ?? ""}
                onChange={(event) =>
                  onSelectDataset(
                    dataset.metric,
                    event.target.value === "" ? null : event.target.value,
                  )
                }
                aria-label="Energy source"
              >
                {siblings.map((candidate) => (
                  <option key={candidate.id} value={candidate.energySource ?? ""}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="field">
            <span className="field-label" id="basis-label">
              Values
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="basis-label">
              <label className="segment">
                <input
                  type="radio"
                  name="basis"
                  value="total"
                  checked={basis === "total"}
                  onChange={() => onBasisChange("total")}
                />
                <span className="segment-face">Total</span>
              </label>
              <label className="segment">
                <input
                  type="radio"
                  name="basis"
                  value="per-capita"
                  checked={basis === "per-capita"}
                  onChange={() => onBasisChange("per-capita")}
                  disabled={!perCapitaAvailable}
                />
                <span className="segment-face">Per capita</span>
              </label>
            </div>
          </div>

          {!perCapitaAvailable && perCapitaLastYear !== null && (
            <p className="rail-note">
              Per capita is unavailable: population estimates end in {perCapitaLastYear}.{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => onBasisChange("per-capita")}
              >
                Show {perCapitaLastYear} per person
              </button>
            </p>
          )}
        </section>

        <section className="rail-section">
          <div className="time-head">
            <span className="field-label">Year</span>
            <strong className="time-value" data-testid="year-value">
              {year}
            </strong>
            {loading && <span className="time-loading">loading…</span>}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(lastIndex, 0)}
            step={1}
            value={Math.max(yearIndex, 0)}
            onChange={(event) => {
              const next = years[Number(event.target.value)]
              if (next !== undefined) onYearChange(next)
            }}
            aria-label="Year"
            aria-valuetext={String(year)}
          />
          <div className="time-range" aria-hidden="true">
            <span>{years[0]}</span>
            <span>{years[lastIndex]}</span>
          </div>
          <div className="transport">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={yearIndex <= 0}
              aria-label="Previous year"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={singleTimePoint}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={yearIndex >= lastIndex}
              aria-label="Next year"
            >
              ▶
            </button>
          </div>
          {basis === "per-capita" && perCapitaLastYear !== null && (
            <p className="rail-note">
              Timeline ends at {perCapitaLastYear} in this view: population estimates go no further,
              and they are not extrapolated.
            </p>
          )}
          {coverageNote && <p className="rail-note">{coverageNote}</p>}
        </section>
      </div>

      <ScaleKey scale={scale} />

      <footer className="rail-foot">
        <a href={`${REPO_URL}/blob/main/docs/data-source-register.md`}>Sources</a>
        <a href={`${REPO_URL}/blob/main/docs/methodology.md`}>Methodology</a>
      </footer>
    </section>
  )
}
