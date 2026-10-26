import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchApi } from '../lib/api'
import { useLiveSubscription } from './useSocket'
import type { SeatCredentials } from '../lib/seat'
import type { GameInstance } from '../types/game'

/**
 * A phone's feed: the lobby-safe instance plus this seat's private playerView, kept current
 * over the seat's socket room (which the server only lets this seat's joinToken into).
 */
export function useSeatFeed(id: string | null, seat: SeatCredentials | null) {
  const [instance, setInstance] = useState<GameInstance | null>(null)
  const [playerView, setPlayerView] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const instanceVersion = useRef(-1)
  const viewVersion = useRef(-1)

  const acceptInstance = useCallback((next: GameInstance) => {
    if (next.version < instanceVersion.current) return
    instanceVersion.current = next.version
    setInstance(next)
  }, [])

  /** Apply a playerView from any source (socket, /me, or an /action response). */
  const acceptView = useCallback((view: unknown, version: number) => {
    if (version < viewVersion.current) return
    viewVersion.current = version
    setPlayerView(view)
  }, [])

  const resync = useCallback(async () => {
    if (!id || !seat) return
    try {
      const qs = new URLSearchParams({ playerOrder: String(seat.playerOrder), joinToken: seat.joinToken })
      const res = await fetchApi(`/api/games/instances/${id}/me?${qs}`)
      if (!res.ok) {
        // Only "not your seat" and "no such game" are lasting; anything else (e.g. a 502 during a
        // deploy) is transient and the next reconnect/visibility/poll retries.
        if (res.status === 403) setError('not-seated')
        else if (res.status === 404) setError('Game not found')
        return
      }
      const data = (await res.json()) as { instance: GameInstance; playerView: unknown; version: number }
      setError(null)
      acceptInstance(data.instance)
      acceptView(data.playerView, data.version)
    } catch {
      // offline; retried on reconnect/visibility/poll
    } finally {
      setLoading(false)
    }
  }, [id, seat, acceptInstance, acceptView])

  useEffect(() => {
    void resync()
  }, [resync])

  useLiveSubscription(id && seat ? `${id}:${seat.playerOrder}` : null, {
    subscribe: ['subscribe-seat', { id, playerOrder: seat?.playerOrder, joinToken: seat?.joinToken }],
    unsubscribe: ['unsubscribe-seat', { id, playerOrder: seat?.playerOrder }],
    handlers: {
      'table-updated': (payload) => acceptInstance((payload as { instance: GameInstance }).instance),
      'seat-updated': (payload) => {
        const { playerView: view, version } = payload as { playerView: unknown; version: number }
        acceptView(view, version)
      },
    },
    resync: () => void resync(),
  })

  return { instance, playerView, error, loading, acceptInstance, acceptView, resync }
}
