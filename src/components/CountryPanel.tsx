import { LineChart, type ChartSeries } from "../charts/LineChart.tsx"
import type { CountrySeries } from "../data/loaders.ts"
import { findDataset, type ManifestDataset } from "../data/manifest.ts"
import { EVIDENCE_LABELS } from "../domain/evidence.ts"
import { formatValue } from "../utils/format.ts"
import { SourceMix } from "./SourceMix.tsx"

type CountryPanelProps = {
  iso3: string
  name: string
  dataset: ManifestDataset
  datasets: ManifestDataset[]
  year: number
  value: number | null
  worldTotal: number | null
  series: CountrySeries | null | "loading"
  onSelectSource: (energySource: string | null) => void
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
  onSelectSource,
  onClose,
}: CountryPanelProps) {
  const share =
    value !== null && worldTotal !== null && worldTotal > 0 ? (value / worldTotal) * 100 : null

  // The chart shows the selected series, plus its metric total as a muted
  // reference when a single source is selected. Plotting all eleven series
  // at once would be unreadable at this width.
  const chartSeries: ChartSeries[] = []
  if (series && series !== "loading") {
    const selected = series.series[dataset.id]
    if (selected) {
      chartSeries.push({
        id: dataset.id,
        label: dataset.title,
        points: selected.points,
        emphasized: true,
      })
    }
    if (dataset.energySource !== null) {
      const total = findDataset(datasets, dataset.metric, null)
      const totalEntry = total ? series.series[total.id] : undefined
      if (total && totalEntry) {
        chartSeries.push({
          id: total.id,
          label: `${total.metricTitle}, all sources`,
          points: totalEntry.points,
          emphasized: false,
        })
      }
    }
  }

  const heading =
    dataset.energySource === null
      ? dataset.metricTitle
      : `${dataset.metricTitle} — ${dataset.title}`

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
        <dt>{heading}</dt>
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
          Emphasized: {dataset.title}. Muted: all sources combined.
        </p>
      )}

      {series && series !== "loading" && (
        <SourceMix
          datasets={datasets}
          metric={dataset.metric}
          selectedDatasetId={dataset.id}
          year={year}
          series={series}
          onSelectSource={onSelectSource}
        />
      )}
    </aside>
  )
}
