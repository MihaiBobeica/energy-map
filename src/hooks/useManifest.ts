import { useCallback, useEffect, useState } from "react"

import { loadManifest, type DataManifest } from "../data/manifest.ts"

type InternalState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; manifest: DataManifest }

export type ManifestState = InternalState & { retry: () => void }

export function useManifest(): ManifestState {
  const [state, setState] = useState<InternalState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setState({ status: "loading" })
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then((manifest) => {
        if (!cancelled) setState({ status: "ready", manifest })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return { ...state, retry }
}
