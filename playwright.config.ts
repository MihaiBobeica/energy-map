import { defineConfig } from "@playwright/test"

const PORT = 4173
const BASE_URL = `http://localhost:${PORT}/energy-map/`

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    // NOT `vite preview`: its SPA fallback answers every unmatched path with
    // index.html and HTTP 200, so a missing build asset can never 404 locally
    // the way it does on GitHub Pages. serve-dist.mjs returns real 404s.
    command: `node scripts/serve-dist.mjs --port ${PORT} --dist dist --base /energy-map/`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
})
