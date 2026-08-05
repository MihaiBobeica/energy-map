import { LineChart, type ChartSeries } from "../charts/LineChart.tsx"
import type { CountrySeries } from "../data/loaders.ts"
import type { ManifestDataset } from "../data/manifest.ts"
import { EVIDENCE_LABELS } from "../domain/evidence.ts"
import { formatValue } from "../utils/format.ts"

type CountryPanelProps = {
  iso3: string
  name: string
  dataset: ManifestDataset
  datasets: ManifestDataset[]
  year: number
  value: number | null
  worldTotal: number | null
  series: CountrySeries | null | "loading"
  onClose: () => void
}

export function CountryPanel({
  iso3,
  name,
  dataset,
  datasets,
  year,
  value,
  worldTotal,
  series,
  onClose,
}: CountryPanelProps) {
  const share =
    value !== null && worldTotal !== null && worldTotal > 0 ? (value / worldTotal) * 100 : null

  const chartSeries: ChartSeries[] =
    series && series !== "loading"
      ? datasets
          .map((candidate): ChartSeries | null => {
            const entry = series.series[candidate.id]
            if (!entry) return null
            return {
              id: candidate.id,
              label: candidate.title,
              points: entry.points,
              emphasized: candidate.id === dataset.id,
            }
          })
          .filter((entry): entry is ChartSeries => entry !== null)
      : []

  return (
    <aside className="country-panel" aria-label={`Details for ${name}`}>
      <header className="panel-header">
        <h2>{name}</h2>
        <button type="button" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </header>

      <p className="panel-kind">Country · parent geography: World</p>

      <dl className="panel-facts">
        <dt>{dataset.title}</dt>
        <dd>
          <strong>{formatValue(value, dataset.unit)}</strong> in {year}
        </dd>
        {share !== null && (
          <>
            <dt>Share of world total</dt>
            <dd>{share < 0.1 ? "< 0.1" : share.toFixed(1)}%</dd>
          </>
        )}
        <dt>Evidence</dt>
        <dd>
          <span className="evidence-badge evidence-observed">
            {EVIDENCE_LABELS[dataset.evidenceTypes[0] ?? "observed"]}
          </span>
        </dd>
        <dt>Source</dt>
        <dd>
          Ember (CC BY 4.0) via <a href="https://ourworldindata.org/energy">Our World in Data</a> ·
          version {dataset.datasetVersion}
        </dd>
        <dt>Coverage</dt>
        <dd>
          {dataset.years[0]}–{dataset.years[dataset.years.length - 1]}, annual
        </dd>
      </dl>

      {value === null && (
        <p className="panel-missing">
          No reported value for {name} ({iso3}) in {year}. Missing data is shown as missing — never
          as zero.
        </p>
      )}

      {series === "loading" && <p className="panel-loading">Loading history…</p>}
      {series === null && (
        <p className="panel-missing">No historical series is available for this geography.</p>
      )}
      {chartSeries.length > 0 && <LineChart series={chartSeries} unit={dataset.unit} />}
      {chartSeries.length > 1 && (
        <p className="panel-chart-caption">
          Emphasized line: {dataset.title}. Muted: other available metrics.
        </p>
      )}
    </aside>
  )
}
