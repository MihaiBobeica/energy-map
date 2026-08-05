import { setWorkerUrl } from "maplibre-gl"
// Vite bundles the MapLibre worker entry — together with the
// `maplibre-gl-shared.mjs` chunk it imports — into one self-contained,
// content-hashed asset, and gives us its final base-prefixed URL.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"

/**
 * MapLibre GL JS v6 parses vector geometry in a web worker that ships as a
 * separate file. Left alone, it derives that file's URL at runtime from
 * `import.meta.url`, which after bundling points at `<base>/assets/index-<hash>.js`
 * — so it asks for `<base>/assets/maplibre-gl-worker.mjs`, a file no bundler
 * emits (the name is picked by a runtime ternary, so it is invisible to static
 * analysis). The request 404s, the worker never starts, GeoJSON is never tiled,
 * and the map paints nothing but its background layer — with no console error.
 *
 * Pointing MapLibre at the worker asset we bundle ourselves removes the guess.
 * Everything stays self-hosted: no CDN, no request outside the site's origin.
 */
export function configureMaplibreWorker(): void {
  // The URL already carries import.meta.env.BASE_URL; resolving it against the
  // document base keeps it correct if the base is ever made relative.
  setWorkerUrl(new URL(maplibreWorkerUrl, document.baseURI).href)
}
