import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : ''

/** How often to resync while the socket is disconnected. */
const DISCONNECTED_POLL_MS = 4000

let sharedSocket: Socket | null = null

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  if (!sharedSocket) {
    sharedSocket = io(socketUrl, { path: '/socket.io', withCredentials: true })
  }
  return sharedSocket
}

interface LiveSubscription {
  /** Socket event + payload that joins the right room, e.g. ['subscribe-table', { id }]. */
  subscribe: [string, unknown]
  unsubscribe: [string, unknown]
  /** Server events to listen for. */
  handlers: Record<string, (payload: unknown) => void>
  /** Refetch the full current state over HTTP (after missed updates). */
  resync: () => void
}

/**
 * Join a socket room and keep it joined. Phones drop the socket whenever the screen locks or
 * the browser is backgrounded, and the server forgets room membership on disconnect. So this
 * re-subscribes on every (re)connect, and resyncs after each room join, when the tab becomes visible
 * again, and on a slow poll while disconnected — no device misses an update.
 *
 * `key` identifies the subscription; it re-runs only when the key changes.
 */
export function useLiveSubscription(key: string | null, sub: LiveSubscription) {
  const subRef = useRef(sub)
  subRef.current = sub

  useEffect(() => {
    if (key == null) return
    const socket = getSocket()
    if (!socket) return

    const resync = () => subRef.current.resync()
    // Resync once the server confirms the room join, every time, so an update broadcast between
    // the initial HTTP load and the join is never lost (version guards make duplicates harmless).
    const subscribe = () => {
      const [event, payload] = subRef.current.subscribe
      socket.emit(event, payload, () => resync())
    }
    const handlerEntries = Object.keys(subRef.current.handlers).map((event) => {
      const fn = (payload: unknown) => subRef.current.handlers[event]?.(payload)
      socket.on(event, fn)
      return [event, fn] as const
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync()
    }

    if (socket.connected) subscribe()
    socket.on('connect', subscribe)
    document.addEventListener('visibilitychange', onVisible)
    const poll = window.setInterval(() => {
      if (!socket.connected) resync()
    }, DISCONNECTED_POLL_MS)

    return () => {
      socket.off('connect', subscribe)
      for (const [event, fn] of handlerEntries) socket.off(event, fn)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(poll)
      const [event, payload] = subRef.current.unsubscribe
      socket.emit(event, payload)
    }
  }, [key])
}
