import type { FeatureCollection } from "geojson"
import { useCallback, useEffect, useMemo, useState } from "react"

import { ControlCard } from "./components/ControlCard.tsx"
import { CountryPanel } from "./components/CountryPanel.tsx"
import { Legend } from "./components/Legend.tsx"
import {
  loadCountriesGeojson,
  loadCountrySeries,
  loadGeographyIndex,
  loadYearFile,
  type CountrySeries,
  type GeographyIndex,
  type YearFile,
} from "./data/loaders.ts"
import type { DataManifest } from "./data/manifest.ts"
import { useManifest } from "./hooks/useManifest.ts"
import { MapView, type HoverInfo } from "./map/MapView.tsx"
import { buildSearch, parseUrlState, resolveState } from "./state/urlState.ts"
import { formatValue } from "./utils/format.ts"

const ATTRIBUTION =
  'Electricity data: <a href="https://ember-energy.org/">Ember</a> (CC BY 4.0) via ' +
  '<a href="https://ourworldindata.org/energy">Our World in Data</a> · Boundaries: ' +
  '<a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain, 1:50m)'

const PLAYBACK_MS = 700

export default function App() {
  const manifest = useManifest()

  if (manifest.status === "loading") {
    return (
      <div className="app-message" role="status">
        Loading Energy Map…
      </div>
    )
  }
  if (manifest.status === "error") {
    return (
      <div className="app-message" role="alert">
        <p>Energy Map could not load its data manifest: {manifest.message}</p>
        <button type="button" onClick={manifest.retry}>
          Retry
        </button>
      </div>
    )
  }
  if (manifest.manifest.datasets.length === 0) {
    // A deployed manifest always lists datasets; an empty one means a stale
    // cached copy. Offer a revalidating retry instead of a dead end.
    return (
      <div className="app-message" role="alert">
        <p>No datasets are listed in the data manifest — this is usually a stale cached copy.</p>
        <button type="button" onClick={manifest.retry}>
          Reload data
        </button>
      </div>
    )
  }
  return <Atlas manifest={manifest.manifest} />
}

type YearState = { key: string; file: YearFile | null }
type SeriesState = { key: string; data: CountrySeries | null }

function Atlas({ manifest }: { manifest: DataManifest }) {
  const datasets = manifest.datasets
  const initial = useMemo(
    () => resolveState(datasets, parseUrlState(window.location.search)),
    [datasets],
  )

  const [metricId, setMetricId] = useState(initial?.dataset.id ?? "")
  const [year, setYear] = useState(initial?.year ?? 0)
  const [selectedIso3, setSelectedIso3] = useState<string | null>(initial?.country ?? null)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const dataset = useMemo(
    () => datasets.find((candidate) => candidate.id === metricId) ?? datasets[0] ?? null,
    [datasets, metricId],
  )

  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const [geoIndex, setGeoIndex] = useState<GeographyIndex | null>(null)
  const [yearState, setYearState] = useState<YearState>({ key: "", file: null })
  const [seriesState, setSeriesState] = useState<SeriesState>({ key: "", data: null })
  // One slot per loader. A shared slot let a successful year load erase an
  // unrelated geometry failure, leaving an empty map with no explanation.
  const [errors, setErrors] = useState<{ geometry: string | null; year: string | null }>({
    geometry: null,
    year: null,
  })
  const dataError = errors.geometry ?? errors.year

  const yearKey = dataset ? `${dataset.path}/${year}` : ""
  // Stale-while-loading: keep painting the previous year until the new file
  // arrives, and surface a loading indicator via the key mismatch.
  const yearFile = yearState.file
  const yearLoading = yearKey !== "" && yearState.key !== yearKey

  // --- static geometry -------------------------------------------------
  useEffect(() => {
    if (!manifest.countriesGeojsonPath || !manifest.geographyIndexPath) return
    let cancelled = false
    Promise.all([
      loadCountriesGeojson(manifest.countriesGeojsonPath),
      loadGeographyIndex(manifest.geographyIndexPath),
    ])
      .then(([featureCollection, index]) => {
        if (cancelled) return
        setGeojson(featureCollection)
        setGeoIndex(index)
        setErrors((current) => ({ ...current, geometry: null }))
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setErrors((current) => ({ ...current, geometry: message }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [manifest.countriesGeojsonPath, manifest.geographyIndexPath])

  // --- per-year values -------------------------------------------------
  useEffect(() => {
    if (!dataset) return
    const key = `${dataset.path}/${year}`
    let cancelled = false
    loadYearFile(dataset.path, year)
      .then((file) => {
        if (cancelled) return
        setYearState({ key, file })
        setErrors((current) => ({ ...current, year: null }))
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setErrors((current) => ({ ...current, year: message }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [dataset, year])

  // --- selected-country history ---------------------------------------
  useEffect(() => {
    if (!selectedIso3 || !manifest.countrySeriesPathTemplate) return
    const key = selectedIso3
    let cancelled = false
    loadCountrySeries(manifest.countrySeriesPathTemplate, selectedIso3)
      .then((result) => {
        if (!cancelled) setSeriesState({ key, data: result })
      })
      .catch(() => {
        if (!cancelled) setSeriesState({ key, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [selectedIso3, manifest.countrySeriesPathTemplate])

  const series: CountrySeries | null | "loading" = selectedIso3
    ? seriesState.key === selectedIso3
      ? seriesState.data
      : "loading"
    : null

  // --- URL sync --------------------------------------------------------
  useEffect(() => {
    if (!dataset) return
    const search = buildSearch({ metric: dataset.id, year, country: selectedIso3 })
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${search}`)
    }
  }, [dataset, year, selectedIso3])

  // --- playback --------------------------------------------------------
  useEffect(() => {
    if (!playing || !dataset) return
    const timer = window.setInterval(() => {
      setYear((current) => {
        const index = dataset.years.indexOf(current)
        const next = dataset.years[index + 1]
        if (next === undefined) {
          setPlaying(false)
          return current
        }
        return next
      })
    }, PLAYBACK_MS)
    return () => window.clearInterval(timer)
  }, [playing, dataset])

  const valuesById = useMemo(() => {
    if (!yearFile || !geoIndex) return null
    const map = new Map<number, number>()
    for (const [iso3, value] of Object.entries(yearFile.values)) {
      const entry = geoIndex.byIso3.get(iso3)
      if (entry) map.set(entry.id, value)
    }
    return map
  }, [yearFile, geoIndex])

  const handleMetricChange = useCallback(
    (nextMetricId: string) => {
      const next = datasets.find((candidate) => candidate.id === nextMetricId)
      if (!next) return
      setMetricId(next.id)
      setYear((current) => (next.years.includes(current) ? current : next.defaultYear))
    },
    [datasets],
  )

  const handleHover = useCallback((info: HoverInfo | null) => setHover(info), [])
  const handleSelect = useCallback((iso3: string | null) => setSelectedIso3(iso3), [])

  if (!dataset || !initial) {
    return (
      <div className="app-message" role="alert">
        No datasets are available in the data manifest.
      </div>
    )
  }

  const hoverValue = hover && yearFile ? (yearFile.values[hover.iso3] ?? null) : null
  const selectedName =
    selectedIso3 && geoIndex ? (geoIndex.byIso3.get(selectedIso3)?.name ?? selectedIso3) : null
  const announcement = `${dataset.title}, ${year}${selectedName ? `, ${selectedName}` : ""}`

  return (
    <div className="atlas">
      <MapView
        geojson={geojson}
        valuesById={valuesById}
        selectedIso3={selectedIso3}
        attribution={ATTRIBUTION}
        onHover={handleHover}
        onSelect={handleSelect}
      />

      <ControlCard
        datasets={datasets}
        dataset={dataset}
        year={year}
        playing={playing}
        loading={yearLoading}
        onMetricChange={handleMetricChange}
        onYearChange={setYear}
        onTogglePlay={() => setPlaying((current) => !current)}
      />

      <Legend unit={dataset.unit} />

      {dataError && (
        <div className="data-error" role="alert">
          Data failed to load: {dataError}
        </div>
      )}

      {hover && (
        <div
          className="map-tooltip"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
          role="presentation"
        >
          <strong>{hover.name}</strong>
          <br />
          {dataset.title}, {year}: {formatValue(hoverValue, dataset.unit)}
          <br />
          <span className="tooltip-meta">
            {hoverValue === null ? "No reported value" : "Observed · Ember via OWID"} · country
            resolution
          </span>
        </div>
      )}

      {selectedIso3 && selectedName && (
        <CountryPanel
          iso3={selectedIso3}
          name={selectedName}
          dataset={dataset}
          datasets={datasets}
          year={year}
          value={yearFile ? (yearFile.values[selectedIso3] ?? null) : null}
          worldTotal={yearFile?.worldTotal ?? null}
          series={series}
          onClose={() => setSelectedIso3(null)}
        />
      )}

      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
