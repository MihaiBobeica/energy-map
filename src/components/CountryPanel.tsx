import { LineChart, type ChartSeries } from "../charts/LineChart.tsx"
import type { CountrySeries } from "../data/loaders.ts"
import { findDataset, type ManifestDataset } from "../data/manifest.ts"
import { EVIDENCE_LABELS } from "../domain/evidence.ts"
import { perCapita } from "../domain/perCapita.ts"
import { formatValue } from "../utils/format.ts"
import type { ScaleDefinition } from "../utils/scale.ts"
import { SourceMix } from "./SourceMix.tsx"

type CountryPanelProps = {
  iso3: string
  name: string
  dataset: ManifestDataset
  datasets: ManifestDataset[]
  basis: "total" | "per-capita"
  scale: ScaleDefinition
  availableYears: number[]
  year: number
  value: number | null
  worldTotal: number | null
  population: number | null
  series: CountrySeries | null | "loading"
  onSelectSource: (energySource: string | null) => void
  onClose: () => void
}

export function CountryPanel({
  iso3,
  name,
  dataset,
  datasets,
  basis,
  scale,
  availableYears,
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
      : `${dataset.metricTitle} — ${dataset.title}`
  // In per-capita mode the usable span is the shorter one: a value only exists
  // where a population denominator does.
  const coverage = availableYears.length > 0 ? availableYears : dataset.years

  return (
    <aside className="card country-panel" aria-label={`Details for ${name}`}>
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
          <strong>{formatValue(value, scale.unit)}</strong> in {year}
        </dd>
        {basis === "per-capita" && population !== null && (
          <>
            <dt>Population</dt>
            <dd>{population.toLocaleString("en-US")}</dd>
          </>
        )}
        {share !== null && (
          <>
            <dt>Share of world total</dt>
            <dd>{share < 0.1 ? "< 0.1" : share.toFixed(1)}%</dd>
          </>
        )}
        <dt>Evidence</dt>
        <dd>
          {basis === "per-capita" ? (
            <span className="evidence-badge evidence-derived">
              Observed electricity ÷ reconstructed population
            </span>
          ) : (
            <span className="evidence-badge evidence-observed">
              {EVIDENCE_LABELS[dataset.evidenceTypes[0] ?? "observed"]}
            </span>
          )}
        </dd>
        <dt>Source</dt>
        <dd>
          Ember (CC BY 4.0) via <a href="https://ourworldindata.org/energy">Our World in Data</a> ·
          version {dataset.datasetVersion}
          {basis === "per-capita" && (
            <>
              <br />
              Population: UN World Population Prospects 2024 (CC BY 3.0 IGO)
            </>
          )}
        </dd>
        <dt>Coverage</dt>
        <dd>
          {coverage[0]}–{coverage[coverage.length - 1]}, annual
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
      {chartSeries.length > 0 && <LineChart series={chartSeries} unit={scale.unit} />}
      {basis === "per-capita" && population !== null && (
        <p className="panel-chart-caption">
          History uses the {year} population throughout, so it shows how generation changed, not how
          population did.
        </p>
      )}
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
