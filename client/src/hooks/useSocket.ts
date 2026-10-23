import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { fetchApi } from '../lib/api'

const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : ''

/** How often to poll for the instance while the socket is disconnected. */
const DISCONNECTED_POLL_MS = 4000

let sharedSocket: Socket | null = null

function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  if (!sharedSocket) {
    sharedSocket = io(socketUrl, { path: '/socket.io', withCredentials: true })
  }
  return sharedSocket
}

/**
 * Subscribe to live updates for a game instance.
 *
 * Phones drop the socket whenever the screen locks or the browser is backgrounded, and the
 * server forgets room membership on disconnect. So this re-subscribes on every (re)connect,
 * and refetches the instance on reconnect, when the tab becomes visible again, and on a slow
 * poll while disconnected, so no device misses a join or a game start.
 */
export function useSubscribeGame(gameInstanceId: string | null, onUpdate: (payload: unknown) => void) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (gameInstanceId == null) return
    const socket = getSocket()
    if (!socket) return

    let cancelled = false
    const resync = async () => {
      try {
        const res = await fetchApi(`/api/games/instances/${gameInstanceId}`)
        if (res.ok && !cancelled) onUpdateRef.current(await res.json())
      } catch {
        // offline; the next reconnect/visibility/poll tick retries
      }
    }

    let hasConnected = socket.connected
    const subscribe = () => {
      socket.emit('subscribe-game', gameInstanceId)
      // A reconnect means updates may have been missed while we were away.
      if (hasConnected) resync()
      hasConnected = true
    }
    const handler = (payload: unknown) => {
      onUpdateRef.current(payload)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync()
    }

    if (socket.connected) socket.emit('subscribe-game', gameInstanceId)
    socket.on('connect', subscribe)
    socket.on('instance-updated', handler)
    document.addEventListener('visibilitychange', onVisible)
    const poll = window.setInterval(() => {
      if (!socket.connected) resync()
    }, DISCONNECTED_POLL_MS)

    return () => {
      cancelled = true
      socket.off('connect', subscribe)
      socket.off('instance-updated', handler)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(poll)
      socket.emit('unsubscribe-game', gameInstanceId)
    }
  }, [gameInstanceId])
}
