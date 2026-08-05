/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// GitHub Pages serves project sites under the repository path.
export default defineConfig({
  base: "/energy-map/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
