import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchApi } from '../lib/api'
import { useLiveSubscription } from './useSocket'
import type { GameEvent, GameInstance, TableUpdate } from '../types/game'
import { isFreshStart, shouldAdvance } from '../lib/tableQueue'

/** If a view never reports its animation finished, move on anyway after this long. */
const MAX_ANIMATION_MS = 4000

/**
 * The TV's feed. Updates are queued so a TableView can animate each action's events in order:
 * `current` stays put until the view calls `done()` (or immediately when it has no events).
 * A resync (after a reconnect) replaces the queue with the fresh state and no events, so it
 * renders without animation.
 */
export function useTableFeed(id: string | null) {
  const [queue, setQueue] = useState<TableUpdate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const versionRef = useRef(-1)
  const seqRef = useRef(0)
  /** seq of the update whose animation already finished (done() may arrive before the next update). */
  const finishedSeqRef = useRef(-1)
  /** Phase of the newest known state, to spot a rematch (finished → fresh game). */
  const phaseRef = useRef<string | null>(null)

  const resync = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetchApi(`/api/games/instances/${id}`)
      if (!res.ok) {
        if (res.status === 404) setError('Game not found')
        return
      }
      const instance = (await res.json()) as GameInstance
      if (instance.version <= versionRef.current) return
      versionRef.current = instance.version
      phaseRef.current = instance.phase
      setQueue([{ instance, events: [], seq: ++seqRef.current }])
    } catch {
      // offline; the next reconnect/visibility/poll tick retries
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void resync()
  }, [resync])

  useLiveSubscription(id, {
    subscribe: ['subscribe-table', { id }],
    unsubscribe: ['unsubscribe-table', { id }],
    handlers: {
      'table-updated': (payload) => {
        const { instance, events, version } = payload as { instance: GameInstance; events: GameEvent[]; version: number }
        if (version <= versionRef.current) return
        versionRef.current = version
        const fresh = isFreshStart(phaseRef.current, instance.phase)
        phaseRef.current = instance.phase
        // A rematch replaces the table outright: no flights from the old game's pieces.
        if (fresh) setQueue([{ instance, events: [], seq: ++seqRef.current }])
        else setQueue((q) => [...q, { instance, events: events ?? [], seq: ++seqRef.current }])
      },
    },
    resync: () => void resync(),
  })

  const current = queue[0] ?? null
  const done = useCallback(() => {
    setQueue((q) => {
      if (q.length > 1) return q.slice(1)
      // Nothing newer yet: remember this one finished so the next update shows immediately.
      if (q[0]) finishedSeqRef.current = q[0].seq
      return q
    })
  }, [])

  // Finished (or nothing to animate): advance as soon as a newer update is queued.
  useEffect(() => {
    if (!current || queue.length < 2) return
    if (shouldAdvance(current, queue.length, finishedSeqRef.current)) {
      setQueue((q) => (q.length > 1 ? q.slice(1) : q))
      return
    }
    const t = window.setTimeout(done, MAX_ANIMATION_MS)
    return () => window.clearTimeout(t)
  }, [current, queue.length, done])

  return {
    /** The update the view should show/animate right now. */
    current,
    /** The newest known state (use for non-animated UI such as the lobby). */
    latest: queue[queue.length - 1]?.instance ?? null,
    /** Call when the current update's animation has finished. */
    done,
    error,
    loading,
  }
}
