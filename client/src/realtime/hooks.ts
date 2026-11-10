import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { getSocket } from '../hooks/useSocket'
import { RTC_CONFIG, type RtInput } from './protocol'
import { ControllerSession, HostSession, type Deps, type PeerLike, type SeatStatus, type SocketLike } from './session'

function realDeps(): Deps | null {
  const socket = getSocket()
  if (!socket || typeof RTCPeerConnection === 'undefined') return null
  return {
    socket: socket as unknown as SocketLike,
    createPeer: () => new RTCPeerConnection(RTC_CONFIG) as unknown as PeerLike,
    now: () => performance.now(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (h) => window.clearInterval(h as number),
  }
}

export interface RealtimeHost {
  /** Latest input per seat. Read it in the render/physics loop; it never triggers a re-render. */
  inputs: MutableRefObject<Record<number, RtInput>>
  /** Per-seat connection mode and RTT (re-renders only when these change). */
  status: Record<number, SeatStatus>
  /** Feedback to one phone, e.g. send(0, { kind: 'hit' }) for haptics. */
  send: (seat: number, data: unknown) => void
}

/**
 * The TV side of a real-time game: answers each phone's WebRTC offer and merges relay inputs.
 * `instanceId` null = inactive. The TV must already be subscribed to the table room (TablePage
 * does this through useTableFeed).
 */
export function useRealtimeHost(instanceId: string | null): RealtimeHost {
  const inputs = useRef<Record<number, RtInput>>({})
  const [status, setStatus] = useState<Record<number, SeatStatus>>({})
  const session = useRef<HostSession | null>(null)
  useEffect(() => {
    if (!instanceId) return
    const deps = realDeps()
    if (!deps) return
    const s = new HostSession(instanceId, deps, setStatus)
    session.current = s
    inputs.current = s.inputs
    return () => {
      s.dispose()
      if (session.current === s) session.current = null
    }
  }, [instanceId])
  const send = useMemo(() => (seat: number, data: unknown) => session.current?.send(seat, data), [])
  return { inputs, status, send }
}

export interface RealtimeController {
  /** Send the striker's target position in table coordinates (call on every pointer move). */
  send: (x: number, y: number) => void
  status: SeatStatus
}

/**
 * The phone side: opens a peer-to-peer channel to the TV (falling back to the relay after 3 s or
 * on failure) and reconnects when the page becomes visible again. `seat` null = inactive (e.g.
 * not seated yet). The phone must already be subscribed to its seat room (PlayPage does this).
 */
export function useRealtimeController(
  instanceId: string | null,
  seat: number | null,
  onFeedback?: (data: unknown) => void
): RealtimeController {
  const [status, setStatus] = useState<SeatStatus>({ mode: 'connecting', rttMs: null })
  const session = useRef<ControllerSession | null>(null)
  const feedback = useRef(onFeedback)
  feedback.current = onFeedback
  useEffect(() => {
    if (!instanceId || seat == null) return
    const deps = realDeps()
    if (!deps) return
    const s = new ControllerSession(instanceId, seat, deps, setStatus, (d) => feedback.current?.(d))
    session.current = s
    const onVisible = () => {
      if (document.visibilityState === 'visible') s.reconnectIfNeeded()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      s.dispose()
      if (session.current === s) session.current = null
    }
  }, [instanceId, seat])
  const send = useMemo(() => (x: number, y: number) => session.current?.send(x, y), [])
  return { send, status }
}
