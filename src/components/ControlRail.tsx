import type { CSSProperties } from "react"

import { datasetsForMetric, metricsOf, type ManifestDataset } from "../data/manifest.ts"
import type { ScaleDefinition } from "../utils/scale.ts"
import { ScaleKey } from "./ScaleKey.tsx"

const REPO_URL = "https://github.com/MihaiBobeica/energy-map"

export type Basis = "total" | "per-capita"

/** 12px icons, currentColor, so the buttons need no chrome of their own. */
const StepBackIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M2.6 1.8h1.4v8.4H2.6zM9.6 1.8 4.6 6l5 4.2z" />
  </svg>
)

const StepForwardIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M8 1.8h1.4v8.4H8zM2.4 1.8 7.4 6l-5 4.2z" />
  </svg>
)

const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M3.4 1.6 10 6l-6.6 4.4z" />
  </svg>
)

const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M3 2h2.2v8H3zM6.8 2H9v8H6.8z" />
  </svg>
)

type ControlRailProps = {
  datasets: ManifestDataset[]
  dataset: ManifestDataset
  basis: Basis
  scale: ScaleDefinition
  year: number
  years: number[]
  playing: boolean
  loading: boolean
  perCapitaAvailable: boolean
  onSelectDataset: (metric: string, energySource: string | null) => void
  onBasisChange: (basis: Basis) => void
  onYearChange: (year: number) => void
  onTogglePlay: () => void
}

/**
 * One rail, not three cards. Reads top-to-bottom as "what am I looking at"
 * (VIEW) → "when" (TIME) → "what do the colours mean" (SCALE). The scale key is
 * pinned outside the scrolling body so a short window can never hide it.
 *
 * Every control is transparent at rest and grows its affordance on hover or
 * focus. The rail is a caption on the map until you reach for it.
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
  perCapitaAvailable,
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
  const fillPercent = lastIndex > 0 ? (Math.max(yearIndex, 0) / lastIndex) * 100 : 100

  // One word, not a sentence: without it a year most countries have not
  // reported yet reads as a collapse in generation rather than a gap.
  const partialYear = (() => {
    if (!dataset.yearGeographyCounts) return false
    const index = dataset.years.indexOf(year)
    if (index < 0) return false
    const count = dataset.yearGeographyCounts[index]
    const max = Math.max(...dataset.yearGeographyCounts)
    return count !== undefined && count < 0.8 * max
  })()

  const step = (delta: number) => {
    const next = years[yearIndex + delta]
    if (next !== undefined) onYearChange(next)
  }

  return (
    <section className="card rail" aria-label="Map controls">
      <header className="rail-head">
        <h1>Energy Map</h1>
      </header>

      <div className="rail-body">
        <section className="rail-section rail-view">
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

          <div className="field field-basis">
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
        </section>

        <section className="rail-section rail-time">
          <div className="time-head">
            <span className="field-label">Year</span>
            {loading && <span className="time-loading">loading…</span>}
            {partialYear && <span className="time-partial">partial</span>}
            <strong className="time-value" data-testid="year-value">
              {year}
            </strong>
          </div>
          <input
            className="year-range"
            type="range"
            min={0}
            max={Math.max(lastIndex, 0)}
            step={1}
            value={Math.max(yearIndex, 0)}
            style={{ "--range-fill": `${fillPercent}%` } as CSSProperties}
            onChange={(event) => {
              const next = years[Number(event.target.value)]
              if (next !== undefined) onYearChange(next)
            }}
            aria-label="Year"
            aria-valuetext={String(year)}
          />
          {/* The span endpoints label the track they sit under; the transport
              centres on it. One row instead of two. */}
          <div className="time-foot">
            <span className="time-bound" aria-hidden="true">
              {years[0]}
            </span>
            <div className="transport">
              <button
                type="button"
                className="icon-button"
                onClick={() => step(-1)}
                disabled={yearIndex <= 0}
                aria-label="Previous year"
                title="Previous year"
              >
                <StepBackIcon />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={onTogglePlay}
                disabled={singleTimePoint}
                aria-label={playing ? "Pause" : "Play"}
                title={playing ? "Pause" : "Play"}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => step(1)}
                disabled={yearIndex >= lastIndex}
                aria-label="Next year"
                title="Next year"
              >
                <StepForwardIcon />
              </button>
            </div>
            <span className="time-bound" aria-hidden="true">
              {years[lastIndex]}
            </span>
          </div>
          {/* The denominator changes kind partway along the timeline, and that
              is a difference in what the number means — not a footnote. */}
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
