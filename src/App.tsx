import { AttributionBar } from "./components/AttributionBar.tsx"
import { useManifest } from "./hooks/useManifest.ts"
import { MapShell } from "./map/MapShell.tsx"

export default function App() {
  const manifest = useManifest()

  return (
    <div className="app">
      <header className="app-header">
        <h1>Energy Map</h1>
        <p className="app-tagline">
          A historical atlas of energy and electricity, 1700 to the latest complete year
        </p>
        <p className="app-status" role="status">
          {manifest.status === "loading" && "Loading data manifest…"}
          {manifest.status === "error" && (
            <span className="app-status-error">
              Data manifest failed to load: {manifest.message}{" "}
              <button type="button" onClick={manifest.retry}>
                Retry
              </button>
            </span>
          )}
          {manifest.status === "ready" &&
            (manifest.manifest.datasets.length === 0
              ? "Application shell deployed — data layers arrive in the next phase."
              : `${manifest.manifest.datasets.length} dataset(s) available.`)}
        </p>
      </header>
      <main className="app-map" aria-label="World map">
        <MapShell />
      </main>
      <AttributionBar />
    </div>
  )
}
