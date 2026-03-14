import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : ''

let sharedSocket: Socket | null = null

function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  if (!sharedSocket) {
    sharedSocket = io(socketUrl, { path: '/socket.io', withCredentials: true })
  }
  return sharedSocket
}

export function useSubscribeGame(gameInstanceId: string | null, onUpdate: (payload: unknown) => void) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (gameInstanceId == null) return
    const socket = getSocket()
    if (!socket) return
    socket.emit('subscribe-game', gameInstanceId)
    const handler = (payload: unknown) => {
      onUpdateRef.current(payload)
    }
    socket.on('instance-updated', handler)
    return () => {
      socket.off('instance-updated', handler)
      socket.emit('unsubscribe-game', gameInstanceId)
    }
  }, [gameInstanceId])
}
