import { useEffect, useState } from 'react'
import { loadGame } from '../games/registry'
import type { ClientGameModule } from '../games/types'

/** Loads a game's client module by slug: undefined while loading, null if unknown. */
export function useGameModule(slug: string | undefined) {
  const [mod, setMod] = useState<ClientGameModule | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setMod(undefined)
    if (!slug) {
      setMod(null)
      return
    }
    loadGame(slug)
      .then((m) => !cancelled && setMod(m))
      .catch(() => !cancelled && setMod(null))
    return () => {
      cancelled = true
    }
  }, [slug])
  return mod
}
