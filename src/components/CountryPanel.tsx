import { LineChart, type ChartSeries } from "../charts/LineChart.tsx"
import type { CountrySeries } from "../data/loaders.ts"
import { findDataset, type ManifestDataset } from "../data/manifest.ts"
import { EVIDENCE_LABELS } from "../domain/evidence.ts"
import { perCapita } from "../domain/perCapita.ts"
import { formatValue } from "../utils/format.ts"
import type { ScaleDefinition } from "../utils/scale.ts"
import { SourceMix } from "./SourceMix.tsx"

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path
      d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
)

type CountryPanelProps = {
  name: string
  dataset: ManifestDataset
  datasets: ManifestDataset[]
  basis: "total" | "per-capita"
  scale: ScaleDefinition
  availableYears: number[]
  populationIsProjected: boolean
  year: number
  value: number | null
  worldTotal: number | null
  population: number | null
  series: CountrySeries | null | "loading"
  onSelectSource: (energySource: string | null) => void
  onClose: () => void
}

export function CountryPanel({
  name,
  dataset,
  datasets,
  basis,
  scale,
  availableYears,
  populationIsProjected,
  year,
  value,
  worldTotal,
  population,
  series,
  onSelectSource,
  onClose,
}: CountryPanelProps) {
  const share =
    value !== null && worldTotal !== null && worldTotal > 0 ? (value / worldTotal) * 100 : null

  // The chart shows the selected series, plus its metric total as a muted
  // reference when a single source is selected. Plotting all eleven series
  // at once would be unreadable at this width.
  // In per-capita mode the chart must follow the basis too, otherwise the
  // headline reads kWh per person above a TWh history.
  const convert = (points: [number, number][]): [number, number][] => {
    if (basis !== "per-capita") return points
    if (population === null) return []
    return points.map(([pointYear, pointValue]) => {
      const derived = perCapita(pointValue, population)
      return [pointYear, derived ?? 0] as [number, number]
    })
  }

  const chartSeries: ChartSeries[] = []
  if (series && series !== "loading") {
    const selected = series.series[dataset.id]
    if (selected) {
      chartSeries.push({
        id: dataset.id,
        label: dataset.title,
        points: convert(selected.points),
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
          points: convert(totalEntry.points),
          emphasized: false,
        })
      }
    }
  }

  const heading =
    dataset.energySource === null
      ? dataset.metricTitle
      : `${dataset.metricTitle} · ${dataset.title}`
  // In per-capita mode the usable span is the shorter one: a value only exists
  // where a population denominator does.
  const coverage = availableYears.length > 0 ? availableYears : dataset.years

  return (
    <aside className="card country-panel" aria-label={`Details for ${name}`}>
      <header className="panel-header">
        <h2>{name}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
          <CloseIcon />
        </button>
      </header>

      <p className="panel-kind">Country · part of World</p>

      {/* One headline: what is measured, the number, and what kind of fact it
          is. Everything below is reference material and is set quieter. */}
      <div className="panel-headline">
        <p className="panel-metric">{heading}</p>
        <p className="panel-value">
          {formatValue(value, scale.unit)} <span className="panel-year">in {year}</span>
        </p>
        {/* A short tag, not an explanation: enough that a projected or derived
            number is never mistaken for a measured one. The Methodology link
            in the rail carries the reasoning. */}
        <p className="panel-evidence">
          {basis === "per-capita" ? (
            <span className="evidence-badge evidence-derived">
              {populationIsProjected ? "Per person · projected population" : "Per person"}
            </span>
          ) : (
            <span className="evidence-badge evidence-observed">
              {EVIDENCE_LABELS[dataset.evidenceTypes[0] ?? "observed"]}
            </span>
          )}
        </p>
      </div>

      <dl className="panel-facts">
        {basis === "per-capita" && population !== null && (
          <>
            <dt>Population</dt>
            <dd>
              {population.toLocaleString("en-US")}
              {populationIsProjected && <span className="fact-qualifier"> · projected</span>}
            </dd>
          </>
        )}
        {share !== null && (
          <>
            <dt>World share</dt>
            <dd>{share < 0.1 ? "< 0.1" : share.toFixed(1)}%</dd>
          </>
        )}
        <dt>Coverage</dt>
        <dd>
          {coverage[0]}–{coverage[coverage.length - 1]}, annual
        </dd>
        <dt>Source</dt>
        <dd>
          Ember (CC BY 4.0) via <a href="https://ourworldindata.org/energy">Our World in Data</a>
          {` · v${dataset.datasetVersion}`}
          {basis === "per-capita" && (
            <>
              <br />
              Population: UN WPP 2024 (CC BY 3.0 IGO)
            </>
          )}
        </dd>
      </dl>

      {value === null && <p className="panel-missing">Not reported for {year}.</p>}

      {series === "loading" && <p className="panel-loading">Loading history…</p>}
      {chartSeries.length > 0 && (
        <div className="panel-chart">
          <LineChart series={chartSeries} unit={scale.unit} />
          {chartSeries.length > 1 && (
            <p className="panel-chart-caption">Blue: {dataset.title} · Grey: all sources</p>
          )}
        </div>
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
