const REPO_URL = "https://github.com/MihaiBobeica/energy-map"

export function AttributionBar() {
  return (
    <footer className="attribution-bar">
      <span>
        No data layers are loaded yet — every future layer will attribute its sources here and on
        the map.
      </span>
      <a href={`${REPO_URL}/blob/main/docs/data-source-register.md`}>Data sources</a>
      <a href={`${REPO_URL}/blob/main/docs/methodology.md`}>Methodology</a>
      <a href={`${REPO_URL}/blob/main/docs/licenses-and-attribution.md`}>Licences</a>
      <a href={REPO_URL}>GitHub</a>
    </footer>
  )
}
