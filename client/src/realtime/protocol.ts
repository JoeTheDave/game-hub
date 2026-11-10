/**
 * Real-time wire protocol (phone ⇄ TV), shared by the WebRTC data channel and the socket relay
 * fallback. Messages are tiny JSON arrays:
 *
 *   ['i', x, y, seq]   input: the phone's TARGET position in table coordinates (send positions,
 *                      never deltas, so a lost packet is harmless — the next one supersedes it)
 *   ['p', n]           ping (TV → phone)
 *   ['o', n]           pong (phone → TV), echoing n
 *   ['f', data]        feedback (TV → phone), e.g. { kind: 'hit' } for haptics
 *
 * Pure: no DOM, no WebRTC, unit-tested.
 */

export type Transport = 'p2p' | 'relay' | 'connecting'

export interface RtInput {
  x: number
  y: number
  seq: number
}

export type RtMessage =
  | { t: 'input'; x: number; y: number; seq: number }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }
  | { t: 'feedback'; data: unknown }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function encode(m: RtMessage): string {
  switch (m.t) {
    case 'input':
      return JSON.stringify(['i', round(m.x), round(m.y), m.seq])
    case 'ping':
      return JSON.stringify(['p', m.n])
    case 'pong':
      return JSON.stringify(['o', m.n])
    case 'feedback':
      return JSON.stringify(['f', m.data])
  }
}

/** The relay carries the array itself (not a string) inside rt-input / rt-signal. */
export function toWire(m: RtMessage): unknown[] {
  return JSON.parse(encode(m)) as unknown[]
}

/** Decode a string (data channel) or an already-parsed array (relay). Null for anything malformed. */
export function decode(raw: unknown): RtMessage | null {
  let a: unknown = raw
  if (typeof raw === 'string') {
    try {
      a = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(a) || typeof a[0] !== 'string') return null
  switch (a[0]) {
    case 'i':
      return finite(a[1]) && finite(a[2]) && finite(a[3]) ? { t: 'input', x: a[1], y: a[2], seq: a[3] } : null
    case 'p':
      return finite(a[1]) ? { t: 'ping', n: a[1] } : null
    case 'o':
      return finite(a[1]) ? { t: 'pong', n: a[1] } : null
    case 'f':
      return { t: 'feedback', data: a[1] }
    default:
      return null
  }
}

/** 4 decimal places is far finer than any screen pixel and keeps packets small. */
function round(v: number) {
  return Math.round(v * 10000) / 10000
}

/**
 * Which path inputs travel right now: the peer-to-peer channel once it's open; the relay once
 * the connection attempt has run past the timeout (or failed); otherwise still connecting (inputs
 * go via the relay meanwhile so play never waits).
 */
export function chooseTransport(s: { channelOpen: boolean; failed: boolean; elapsedMs: number; timeoutMs: number }): Transport {
  if (s.channelOpen) return 'p2p'
  if (s.failed || s.elapsedMs >= s.timeoutMs) return 'relay'
  return 'connecting'
}

/** Accept an input only if it's newer than the last one applied (data channels are unordered). */
export function isNewer(prev: RtInput | null | undefined, next: RtInput): boolean {
  return !prev || next.seq > prev.seq
}

/** Round-trip tracking for pings: smoothed RTT in ms. */
export class RttTracker {
  private sent = new Map<number, number>()
  private n = 0
  rttMs: number | null = null

  ping(now: number): number {
    const n = ++this.n
    this.sent.set(n, now)
    // keep the map small if pongs go missing
    if (this.sent.size > 20) this.sent.delete(Math.min(...this.sent.keys()))
    return n
  }

  pong(n: number, now: number): number | null {
    const t0 = this.sent.get(n)
    if (t0 === undefined) return this.rttMs
    this.sent.delete(n)
    const sample = Math.max(0, now - t0)
    this.rttMs = this.rttMs === null ? sample : Math.round(this.rttMs * 0.7 + sample * 0.3)
    return this.rttMs
  }
}

/** ICE: host candidates work on a LAN; a public STUN server is a harmless extra. */
export const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

/** Unordered, no retransmits: a late input is useless, so never wait for one. */
export const CHANNEL_OPTIONS: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 }

export const P2P_TIMEOUT_MS = 3000
export const PING_INTERVAL_MS = 1000
