import type { CountrySeries } from "../data/loaders.ts"
import { datasetsForMetric, type ManifestDataset } from "../data/manifest.ts"
import { formatValue } from "../utils/format.ts"

type SourceMixProps = {
  datasets: ManifestDataset[]
  metric: string
  selectedDatasetId: string
  year: number
  series: CountrySeries
  onSelectSource: (energySource: string | null) => void
}

function valueAt(series: CountrySeries, datasetId: string, year: number): number | null {
  const entry = series.series[datasetId]
  if (!entry) return null
  const point = entry.points.find(([pointYear]) => pointYear === year)
  return point ? point[1] : null
}

/**
 * A country's generation mix for one year. Reported zero and unreported are
 * shown differently on purpose: a country that genuinely generates no nuclear
 * must not look like one that never reported nuclear.
 */
export function SourceMix({
  datasets,
  metric,
  selectedDatasetId,
  year,
  series,
  onSelectSource,
}: SourceMixProps) {
  const siblings = datasetsForMetric(datasets, metric)
  const sources = siblings.filter((dataset) => dataset.energySource !== null)
  if (sources.length === 0) return null

  const total = siblings.find((dataset) => dataset.energySource === null)
  const totalValue = total ? valueAt(series, total.id, year) : null

  const rows = sources
    .map((dataset) => ({ dataset, value: valueAt(series, dataset.id, year) }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))

  const reported = rows.filter((row) => row.value !== null)
  const unreported = rows.filter((row) => row.value === null)
  if (reported.length === 0) {
    return <p className="panel-missing">No generation-by-source figures reported for {year}.</p>
  }
  const unit = sources[0]?.unit ?? "TWh"
  const scaleMax = Math.max(...reported.map((row) => row.value ?? 0), 0)

  return (
    <section className="source-mix" aria-label={`Generation by source in ${year}`}>
      <h3>Generation by source, {year}</h3>
      <ul>
        {rows.map(({ dataset, value }) => {
          const share = value !== null && totalValue ? (value / totalValue) * 100 : null
          const isSelected = dataset.id === selectedDatasetId
          return (
            <li key={dataset.id} className={isSelected ? "source-row selected" : "source-row"}>
              <button
                type="button"
                onClick={() => onSelectSource(dataset.energySource)}
                aria-pressed={isSelected}
                title={`Show ${dataset.title} on the map`}
              >
                <span className="source-name">{dataset.title}</span>
                <span className="source-bar" aria-hidden="true">
                  <span
                    style={{
                      width: value !== null && scaleMax > 0 ? `${(value / scaleMax) * 100}%` : "0%",
                    }}
                  />
                </span>
                <span className="source-value">
                  {value === null ? (
                    <em>not reported</em>
                  ) : (
                    <>
                      {formatValue(value, unit)}
                      {share !== null && (
                        <span className="source-share"> · {share.toFixed(1)}%</span>
                      )}
                    </>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {totalValue !== null && (
        <p className="source-total">
          <span>Total</span>
          <strong>{formatValue(totalValue, unit)}</strong>
        </p>
      )}
      {unreported.length > 0 && (
        <p className="source-incomplete">
          {unreported.length === 1
            ? `${unreported[0]?.dataset.title} was not reported in ${year}.`
            : `${unreported.length} sources were not reported in ${year}.`}{" "}
          The total sums only the reported sources, so it understates actual generation, and the
          shares are of what was reported — not of all electricity generated.
        </p>
      )}
    </section>
  )
}
