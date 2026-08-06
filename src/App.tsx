import type { FeatureCollection } from "geojson"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ControlRail, type Basis } from "./components/ControlRail.tsx"
import { CountryPanel } from "./components/CountryPanel.tsx"
import {
  loadCountriesGeojson,
  loadCountrySeries,
  loadGeographyIndex,
  loadPopulation,
  loadYearFile,
  type CountrySeries,
  type GeographyIndex,
  type PopulationData,
  type YearFile,
} from "./data/loaders.ts"
import { findDataset, type DataManifest } from "./data/manifest.ts"
import { perCapita, perCapitaYears } from "./domain/perCapita.ts"
import { useManifest } from "./hooks/useManifest.ts"
import { MapView, type HoverInfo } from "./map/MapView.tsx"
import { buildSearch, parseUrlState, resolveState } from "./state/urlState.ts"
import { formatValue } from "./utils/format.ts"
import { colorForValue, PER_CAPITA_SCALE, TOTAL_SCALE } from "./utils/scale.ts"
import { placeTooltip, TOOLTIP_MAX_WIDTH } from "./utils/tooltip.ts"

const ATTRIBUTION =
  'Electricity data: <a href="https://ember-energy.org/">Ember</a> (CC BY 4.0) via ' +
  '<a href="https://ourworldindata.org/energy">Our World in Data</a> · Population: ' +
  '<a href="https://population.un.org/wpp/">UN WPP</a> (CC BY 3.0 IGO) · Boundaries: ' +
  '<a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain, 1:50m)'

const PLAYBACK_MS = 700

/**
 * The sheet breakpoint from index.css, kept in step by hand. Below it the rail
 * is a sheet pinned across the top of the screen rather than a floating card.
 */
const MOBILE_QUERY = "(max-width: 640px)"

/** True for a pointer that can rest over a target — a mouse, not a finger. */
const HOVER_QUERY = "(hover: hover)"

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

  const [datasetId, setDatasetId] = useState(initial?.dataset.id ?? "")
  const [basis, setBasis] = useState<Basis>(initial?.basis ?? "total")
  const [year, setYear] = useState(initial?.year ?? 0)
  const [selectedIso3, setSelectedIso3] = useState<string | null>(initial?.country ?? null)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  // A phone has one screen, and the rail sheet claims 42% of it before anyone
  // has asked for a control. Start collapsed there so the map — the thing
  // being looked at — opens with the whole display, and the restore button
  // still captions what is on it. Read once, at mount: a rail slamming shut
  // mid-interaction on a rotate would be worse than the default it replaces.
  const [railOpen, setRailOpen] = useState(() => !window.matchMedia(MOBILE_QUERY).matches)
  // A tooltip is a hover affordance, and a touch screen has no hover. Browsers
  // synthesise one mousemove from a tap, so the tooltip appeared at the tap
  // point and then sat there — over the country panel that had just opened and
  // already says everything the tooltip does, with nothing to dismiss it.
  const [hoverCapable] = useState(() => window.matchMedia(HOVER_QUERY).matches)
  // Bumped by the error banner's Retry. Every fetch below is keyed on it, so
  // one button re-runs whichever loader is currently broken.
  const [reloadToken, setReloadToken] = useState(0)

  const dataset = useMemo(
    () => datasets.find((candidate) => candidate.id === datasetId) ?? datasets[0] ?? null,
    [datasets, datasetId],
  )

  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const [geoIndex, setGeoIndex] = useState<GeographyIndex | null>(null)
  const [population, setPopulation] = useState<PopulationData | null>(null)
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
  const yearFile = yearState.file
  const yearLoading = yearKey !== "" && yearState.key !== yearKey

  // Per-capita exists only where a denominator does. Population now covers the
  // full electricity span, but the last years are UN medium-variant
  // PROJECTIONS rather than estimates, so those values are labelled apart.
  const populationYears = useMemo(
    () => new Set(manifest.population?.years ?? []),
    [manifest.population],
  )
  const availableYears = useMemo(() => {
    if (!dataset) return []
    return basis === "per-capita" ? perCapitaYears(dataset.years, populationYears) : dataset.years
  }, [dataset, basis, populationYears])
  const perCapitaSupportedForYear = populationYears.has(year)
  const perCapitaOffered = manifest.population !== null && populationYears.size > 0
  const projectedFromYear = manifest.population?.projectedFromYear ?? null
  const populationIsProjected =
    basis === "per-capita" && projectedFromYear !== null && year >= projectedFromYear

  // --- static geometry + population ------------------------------------
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
  }, [manifest.countriesGeojsonPath, manifest.geographyIndexPath, reloadToken])

  useEffect(() => {
    const path = manifest.population?.path
    if (!path) return
    let cancelled = false
    loadPopulation(path)
      .then((data) => {
        if (!cancelled) setPopulation(data)
      })
      .catch(() => {
        // Per-capita simply stays unavailable; the absolute map is unaffected.
        if (!cancelled) setPopulation(null)
      })
    return () => {
      cancelled = true
    }
  }, [manifest.population?.path])

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
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        // Drop the previous year's values rather than leaving them painted
        // under the new year's label: an unloadable year has no data, and
        // showing 2023's map captioned 2024 states something false. Claiming
        // the key also releases the permanent "loading…" chip.
        setYearState({ key, file: null })
        setErrors((current) => ({ ...current, year: message }))
      })
    return () => {
      cancelled = true
    }
  }, [dataset, year, reloadToken])

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
    const search = buildSearch({
      metric: dataset.metric,
      source: dataset.energySource,
      basis,
      year,
      country: selectedIso3,
    })
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${search}`)
    }
  }, [dataset, basis, year, selectedIso3])

  // --- playback --------------------------------------------------------
  useEffect(() => {
    if (!playing || availableYears.length === 0) return
    const timer = window.setInterval(() => {
      setYear((current) => {
        const index = availableYears.indexOf(current)
        const next = availableYears[index + 1]
        if (next === undefined) {
          setPlaying(false)
          return current
        }
        return next
      })
    }, PLAYBACK_MS)
    return () => window.clearInterval(timer)
  }, [playing, availableYears])

  // Escape dismisses the country panel. It is the standard way out of an
  // overlay, and until now the only way to close it was to hit one 26px
  // button — or to know that clicking the ocean deselects.
  useEffect(() => {
    if (!selectedIso3) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIso3(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedIso3])

  // Collapsing the rail unmounts the button that was focused, which dropped
  // keyboard focus to the document body. Hand it to whichever control took
  // its place — but never on first paint, which nobody asked for.
  const hideButtonRef = useRef<HTMLButtonElement>(null)
  const restoreButtonRef = useRef<HTMLButtonElement>(null)
  const railToggled = useRef(false)
  useEffect(() => {
    if (!railToggled.current) return
    const target = railOpen ? hideButtonRef.current : restoreButtonRef.current
    target?.focus()
  }, [railOpen])
  const toggleRail = useCallback((open: boolean) => {
    railToggled.current = true
    setRailOpen(open)
  }, [])

  const populationFor = useCallback(
    (iso3: string) => population?.values.get(iso3)?.get(year) ?? null,
    [population, year],
  )

  const valuesById = useMemo(() => {
    if (!yearFile || !geoIndex) return null
    const map = new Map<number, number>()
    for (const [iso3, value] of Object.entries(yearFile.values)) {
      const entry = geoIndex.byIso3.get(iso3)
      if (!entry) continue
      if (basis === "per-capita") {
        const derived = perCapita(value, population?.values.get(iso3)?.get(year) ?? null)
        // No denominator means no value — the country reads as not reported
        // rather than being silently dropped to zero.
        if (derived !== null) map.set(entry.id, derived)
      } else {
        map.set(entry.id, value)
      }
    }
    return map
  }, [yearFile, geoIndex, basis, population, year])

  const handleSelectDataset = useCallback(
    (metric: string, energySource: string | null) => {
      const next =
        findDataset(datasets, metric, energySource) ?? findDataset(datasets, metric, null)
      if (!next) return
      setDatasetId(next.id)
      setYear((current) => (next.years.includes(current) ? current : next.defaultYear))
    },
    [datasets],
  )

  const handleBasisChange = useCallback(
    (nextBasis: Basis) => {
      setBasis(nextBasis)
      if (nextBasis === "per-capita") {
        // Clamp rather than blank the map: moving to the newest year that has
        // a denominator is visible and reversible, an empty map is neither.
        setYear((current) => {
          if (populationYears.has(current)) return current
          const usable = dataset ? perCapitaYears(dataset.years, populationYears) : []
          return usable.at(-1) ?? current
        })
      }
    },
    [dataset, populationYears],
  )

  // Play at the end of the span used to be a no-op: the timer fired once,
  // found no next year and stopped again. Restart the span instead, so the
  // button always does the thing it depicts.
  const handleTogglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    const first = availableYears[0]
    if (first !== undefined && year === availableYears[availableYears.length - 1]) {
      setYear(first)
    }
    setPlaying(true)
  }, [playing, year, availableYears])

  const handleHover = useCallback((info: HoverInfo | null) => setHover(info), [])
  const handleSelect = useCallback((iso3: string | null) => setSelectedIso3(iso3), [])

  if (!dataset || !initial) {
    return (
      <div className="app-message" role="alert">
        No datasets are available in the data manifest.
      </div>
    )
  }

  const scale = basis === "per-capita" ? PER_CAPITA_SCALE : TOTAL_SCALE
  const rawHoverValue = hover && yearFile ? (yearFile.values[hover.iso3] ?? null) : null
  const hoverValue =
    basis === "per-capita"
      ? perCapita(rawHoverValue, hover ? populationFor(hover.iso3) : null)
      : rawHoverValue
  const rawSelectedValue = selectedIso3 && yearFile ? (yearFile.values[selectedIso3] ?? null) : null
  const selectedValue =
    basis === "per-capita"
      ? perCapita(rawSelectedValue, selectedIso3 ? populationFor(selectedIso3) : null)
      : rawSelectedValue
  const selectedName =
    selectedIso3 && geoIndex ? (geoIndex.byIso3.get(selectedIso3)?.name ?? selectedIso3) : null

  const datasetLabel =
    dataset.energySource === null
      ? dataset.metricTitle
      : `${dataset.metricTitle} from ${dataset.title}`
  const announcement = `${datasetLabel}, ${basis === "per-capita" ? "per capita" : "total"}, ${year}${
    selectedName ? `, ${selectedName}` : ""
  }`
  const tooltipAt = hover
    ? placeTooltip(hover.x, hover.y, window.innerWidth, window.innerHeight)
    : null

  return (
    <div className="atlas">
      <MapView
        geojson={geojson}
        valuesById={valuesById}
        selectedIso3={selectedIso3}
        scale={scale}
        attribution={ATTRIBUTION}
        onHover={handleHover}
        onSelect={handleSelect}
      />

      {railOpen ? (
        <ControlRail
          datasets={datasets}
          dataset={dataset}
          basis={basis}
          scale={scale}
          year={year}
          years={availableYears}
          playing={playing}
          loading={yearLoading}
          perCapitaAvailable={perCapitaOffered && perCapitaSupportedForYear}
          onSelectDataset={handleSelectDataset}
          onBasisChange={handleBasisChange}
          onYearChange={setYear}
          onTogglePlay={handleTogglePlay}
          onHide={() => toggleRail(false)}
          hideButtonRef={hideButtonRef}
        />
      ) : (
        /* Collapsed: one labelled affordance, not a bare icon, so it is
           obvious what comes back. Playback keeps running underneath. */
        <button
          type="button"
          className="card rail-restore"
          ref={restoreButtonRef}
          onClick={() => toggleRail(true)}
          aria-label="Show controls"
          aria-expanded={false}
          aria-controls="map-controls"
        >
          <span className="rail-restore-title">Energy Map</span>
          <span className="rail-restore-state">
            {datasetLabel}
            {basis === "per-capita" ? " per person" : ""} · {year}
          </span>
        </button>
      )}

      {dataError && (
        /* A dead end used to be the whole story here: the failed fetch was
           cached, so nothing short of a page reload could recover. */
        <div className="data-error" role="alert">
          <span>Data failed to load: {dataError}</span>
          <button type="button" onClick={() => setReloadToken((current) => current + 1)}>
            Retry
          </button>
        </div>
      )}

      {hover && tooltipAt && hoverCapable && (
        <div
          className="map-tooltip"
          style={{
            left: tooltipAt.left,
            top: tooltipAt.top,
            // Set here rather than in CSS so the width the placement assumes
            // and the width the element actually takes cannot drift apart.
            maxWidth: TOOLTIP_MAX_WIDTH,
          }}
          role="presentation"
        >
          <span className="tooltip-head">
            {/* The same colour the country is painted, so the tooltip and the
                legend are visibly the same statement. */}
            <span
              className="tooltip-swatch"
              style={{ background: colorForValue(hoverValue, scale) }}
              aria-hidden="true"
            />
            <strong>{hover.name}</strong>
          </span>
          <span className="tooltip-value">{formatValue(hoverValue, scale.unit)}</span>
          <span className="tooltip-meta">
            {hoverValue === null ? "Not reported" : `${datasetLabel} · ${year}`}
          </span>
        </div>
      )}

      {selectedIso3 && selectedName && (
        <CountryPanel
          name={selectedName}
          dataset={dataset}
          datasets={datasets}
          basis={basis}
          scale={scale}
          availableYears={availableYears}
          populationIsProjected={populationIsProjected}
          year={year}
          value={selectedValue}
          worldTotal={basis === "per-capita" ? null : (yearFile?.worldTotal ?? null)}
          population={populationFor(selectedIso3)}
          populationByYear={population?.values.get(selectedIso3) ?? null}
          series={series}
          onSelectSource={(energySource) => handleSelectDataset(dataset.metric, energySource)}
          onClose={() => setSelectedIso3(null)}
        />
      )}

      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
