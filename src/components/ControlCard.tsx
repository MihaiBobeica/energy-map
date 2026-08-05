import { datasetsForMetric, metricsOf, type ManifestDataset } from "../data/manifest.ts"

const REPO_URL = "https://github.com/MihaiBobeica/energy-map"

type ControlCardProps = {
  datasets: ManifestDataset[]
  dataset: ManifestDataset
  year: number
  playing: boolean
  loading: boolean
  onSelectDataset: (metric: string, energySource: string | null) => void
  onYearChange: (year: number) => void
  onTogglePlay: () => void
}

export function ControlCard({
  datasets,
  dataset,
  year,
  playing,
  loading,
  onSelectDataset,
  onYearChange,
  onTogglePlay,
}: ControlCardProps) {
  const metrics = metricsOf(datasets)
  const siblings = datasetsForMetric(datasets, dataset.metric)
  // Only offer the source selector where the metric actually splits by source.
  const hasSources = siblings.some((candidate) => candidate.energySource !== null)

  const yearIndex = dataset.years.indexOf(year)
  const lastIndex = dataset.years.length - 1
  const singleTimePoint = dataset.years.length <= 1

  const coverageNote = (() => {
    if (!dataset.yearGeographyCounts || yearIndex < 0) return null
    const count = dataset.yearGeographyCounts[yearIndex]
    const max = Math.max(...dataset.yearGeographyCounts)
    if (count === undefined || count >= 0.8 * max) return null
    return `Partial coverage: ${count} countries reported so far for ${year}.`
  })()

  const step = (delta: number) => {
    const next = dataset.years[yearIndex + delta]
    if (next !== undefined) onYearChange(next)
  }

  return (
    <section className="control-card" aria-label="Map controls">
      <h1 className="control-title">Energy Map</h1>

      <label className="control-field">
        <span className="control-label">Metric</span>
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
        <label className="control-field">
          <span className="control-label">Energy source</span>
          <select
            value={dataset.energySource ?? ""}
            onChange={(event) =>
              onSelectDataset(dataset.metric, event.target.value === "" ? null : event.target.value)
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

      <div className="control-field">
        <span className="control-label">
          Year: <strong>{year}</strong>
          {loading && <span className="control-loading"> · loading…</span>}
        </span>
        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={Math.max(yearIndex, 0)}
          onChange={(event) => {
            const next = dataset.years[Number(event.target.value)]
            if (next !== undefined) onYearChange(next)
          }}
          aria-label="Year"
          aria-valuetext={String(year)}
        />
        <div className="control-buttons">
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
      </div>

      {coverageNote && <p className="control-note">{coverageNote}</p>}

      <p className="control-meta">
        Observed data · country resolution ·{" "}
        <a href={`${REPO_URL}/blob/main/docs/data-source-register.md`}>Sources</a> ·{" "}
        <a href={`${REPO_URL}/blob/main/docs/methodology.md`}>Methodology</a>
      </p>
    </section>
  )
}
