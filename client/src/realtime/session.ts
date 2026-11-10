import {
  CHANNEL_OPTIONS,
  P2P_TIMEOUT_MS,
  PING_INTERVAL_MS,
  RttTracker,
  chooseTransport,
  decode,
  encode,
  isNewer,
  toWire,
  type RtInput,
  type RtMessage,
  type Transport,
} from './protocol'

/**
 * Real-time sessions (phone ⇄ TV) as plain classes with injected dependencies, so the logic is
 * unit-testable with fakes (jsdom/node have no WebRTC). The React hooks in hooks.ts wire them to
 * the real socket and RTCPeerConnection.
 *
 * Signalling rides the platform socket ('rt-signal', relayed by the server only for real-time
 * instances): payloads are {type:'offer'|'answer', sdp} | {type:'ice', candidate} | {type:'msg', m}
 * where `m` is a wire message sent table → seat over the relay (pings, feedback). Inputs fall
 * back to 'rt-input' (volatile) while the peer-to-peer channel isn't open.
 */

export interface SocketLike {
  emit(event: string, payload: unknown): void
  on(event: string, fn: (payload: never) => void): void
  off(event: string, fn: (payload: never) => void): void
  volatile?: { emit(event: string, payload: unknown): void }
}

export interface ChannelLike {
  readyState: string
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onclose: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}

export interface PeerLike {
  connectionState?: string
  onicecandidate: ((ev: { candidate: unknown }) => void) | null
  ondatachannel: ((ev: { channel: ChannelLike }) => void) | null
  onconnectionstatechange: (() => void) | null
  createDataChannel(label: string, init?: RTCDataChannelInit): ChannelLike
  createOffer(): Promise<{ type: string; sdp?: string }>
  createAnswer(): Promise<{ type: string; sdp?: string }>
  setLocalDescription(d: { type: string; sdp?: string }): Promise<void>
  setRemoteDescription(d: { type: string; sdp?: string }): Promise<void>
  addIceCandidate(c: unknown): Promise<void>
  close(): void
}

export interface Deps {
  socket: SocketLike
  createPeer: () => PeerLike
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (h: unknown) => void
}

type Signal =
  | { type: 'offer' | 'answer'; sdp?: string }
  | { type: 'ice'; candidate: unknown }
  | { type: 'msg'; m: unknown }

export interface SeatStatus {
  mode: Transport
  rttMs: number | null
}

const sameStatus = (a: SeatStatus | undefined, b: SeatStatus) => !!a && a.mode === b.mode && a.rttMs === b.rttMs

// ——— TV side ———

interface HostSeat {
  peer: PeerLike | null
  channel: ChannelLike | null
  rtt: RttTracker
  lastRelayAt: number
}

/**
 * The TV: answers each phone's offer, keeps the latest input per seat (newest seq wins), and
 * measures each seat's round trip with pings over whichever path is live.
 */
export class HostSession {
  readonly inputs: Record<number, RtInput> = {}
  readonly status: Record<number, SeatStatus> = {}
  private seats = new Map<number, HostSeat>()
  private timer: unknown
  private disposed = false

  private id: string
  private deps: Deps
  private onStatus: (status: Record<number, SeatStatus>) => void

  constructor(id: string, deps: Deps, onStatus: (status: Record<number, SeatStatus>) => void = () => {}) {
    this.id = id
    this.deps = deps
    this.onStatus = onStatus
    deps.socket.on('rt-signal', this.onSignal as never)
    deps.socket.on('rt-input', this.onRelayInput as never)
    this.timer = deps.setInterval(() => this.tick(), PING_INTERVAL_MS)
  }

  /** Feedback to one phone (e.g. haptics): over its channel if open, else via the relay. */
  send(seat: number, data: unknown) {
    this.deliver(seat, { t: 'feedback', data })
  }

  dispose() {
    this.disposed = true
    this.deps.socket.off('rt-signal', this.onSignal as never)
    this.deps.socket.off('rt-input', this.onRelayInput as never)
    this.deps.clearInterval(this.timer)
    for (const s of this.seats.values()) {
      s.channel?.close()
      s.peer?.close()
    }
    this.seats.clear()
  }

  private seat(n: number): HostSeat {
    let s = this.seats.get(n)
    if (!s) {
      s = { peer: null, channel: null, rtt: new RttTracker(), lastRelayAt: -Infinity }
      this.seats.set(n, s)
    }
    return s
  }

  private onSignal = async (msg: { from?: unknown; payload?: Signal }) => {
    if (this.disposed || typeof msg?.from !== 'number' || !msg.payload) return
    const n = msg.from
    const p = msg.payload
    const s = this.seat(n)
    try {
      if (p.type === 'offer') {
        // A fresh offer replaces any earlier connection from that seat (e.g. a phone reconnect).
        s.channel?.close()
        s.peer?.close()
        s.channel = null
        const peer = this.deps.createPeer()
        s.peer = peer
        peer.onicecandidate = (ev) => {
          if (ev.candidate) this.signal(n, { type: 'ice', candidate: ev.candidate })
        }
        peer.ondatachannel = (ev) => this.attachChannel(n, ev.channel)
        await peer.setRemoteDescription({ type: 'offer', sdp: p.sdp })
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        this.signal(n, { type: 'answer', sdp: answer.sdp })
      } else if (p.type === 'ice' && s.peer) {
        await s.peer.addIceCandidate(p.candidate)
      }
    } catch {
      // A bad or stale negotiation: the phone falls back to the relay and retries later.
    }
  }

  private attachChannel(n: number, ch: ChannelLike) {
    const s = this.seat(n)
    s.channel = ch
    ch.onopen = () => this.refresh()
    ch.onclose = () => {
      if (s.channel === ch) s.channel = null
      this.refresh()
    }
    ch.onmessage = (ev) => this.handle(n, decode(ev.data))
    if (ch.readyState === 'open') this.refresh()
  }

  private onRelayInput = (msg: { from?: unknown; input?: unknown }) => {
    if (this.disposed || typeof msg?.from !== 'number') return
    const s = this.seat(msg.from)
    s.lastRelayAt = this.deps.now()
    this.handle(msg.from, decode(msg.input))
    // Surface the switch to relay at once (cheap check; inputs arrive ~60×/s).
    if (s.channel?.readyState !== 'open' && this.status[msg.from]?.mode !== 'relay') this.refresh()
  }

  private handle(n: number, m: RtMessage | null) {
    if (!m) return
    if (m.t === 'input') {
      const next = { x: m.x, y: m.y, seq: m.seq }
      if (isNewer(this.inputs[n], next)) this.inputs[n] = next
    } else if (m.t === 'pong') {
      this.seat(n).rtt.pong(m.n, this.deps.now())
      this.refresh()
    }
  }

  private deliver(n: number, m: RtMessage) {
    const s = this.seats.get(n)
    if (s?.channel?.readyState === 'open') s.channel.send(encode(m))
    else this.signal(n, { type: 'msg', m: toWire(m) })
  }

  private signal(n: number, payload: Signal) {
    this.deps.socket.emit('rt-signal', { id: this.id, to: n, payload })
  }

  private tick() {
    const now = this.deps.now()
    for (const [n, s] of this.seats) this.deliver(n, { t: 'ping', n: s.rtt.ping(now) })
    this.refresh()
  }

  private refresh() {
    const now = this.deps.now()
    let changed = false
    for (const [n, s] of this.seats) {
      const mode: Transport =
        s.channel?.readyState === 'open' ? 'p2p' : now - s.lastRelayAt < P2P_TIMEOUT_MS ? 'relay' : 'connecting'
      const next = { mode, rttMs: s.rtt.rttMs }
      if (!sameStatus(this.status[n], next)) {
        this.status[n] = next
        changed = true
      }
    }
    if (changed) this.onStatus({ ...this.status })
  }
}

// ——— Phone side ———

/**
 * The phone: offers a peer-to-peer data channel to the TV and sends its target position on
 * every move — over the channel once it's open, otherwise (and while connecting) via the relay.
 */
export class ControllerSession {
  status: SeatStatus = { mode: 'connecting', rttMs: null }
  private peer: PeerLike | null = null
  private channel: ChannelLike | null = null
  private startedAt = 0
  private failed = false
  private seq = 0
  private timer: unknown
  private disposed = false

  private id: string
  private seatNo: number
  private deps: Deps
  private onStatus: (s: SeatStatus) => void
  private onFeedback: (data: unknown) => void

  constructor(
    id: string,
    seatNo: number,
    deps: Deps,
    onStatus: (s: SeatStatus) => void = () => {},
    onFeedback: (data: unknown) => void = () => {}
  ) {
    this.id = id
    this.seatNo = seatNo
    this.deps = deps
    this.onStatus = onStatus
    this.onFeedback = onFeedback
    deps.socket.on('rt-signal', this.onSignal as never)
    this.timer = deps.setInterval(() => this.refresh(), 500)
    void this.connect()
  }

  /** Send the striker's target position (table coordinates). */
  send(x: number, y: number) {
    const m: RtMessage = { t: 'input', x, y, seq: ++this.seq }
    this.transmit(m)
  }

  /** Reconnect if the channel isn't open (e.g. when the phone wakes or the tab returns). */
  reconnectIfNeeded() {
    if (this.channel?.readyState !== 'open') void this.connect()
  }

  dispose() {
    this.disposed = true
    this.deps.socket.off('rt-signal', this.onSignal as never)
    this.deps.clearInterval(this.timer)
    this.channel?.close()
    this.peer?.close()
  }

  private async connect() {
    if (this.disposed) return
    this.channel?.close()
    this.peer?.close()
    this.failed = false
    this.startedAt = this.deps.now()
    const peer = this.deps.createPeer()
    this.peer = peer
    const ch = peer.createDataChannel('rt', CHANNEL_OPTIONS)
    this.channel = ch
    ch.onopen = () => this.refresh()
    ch.onclose = () => this.refresh()
    ch.onmessage = (ev) => this.handle(decode(ev.data), 'p2p')
    peer.onicecandidate = (ev) => {
      if (ev.candidate) this.signal({ type: 'ice', candidate: ev.candidate })
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') this.failed = true
      this.refresh()
    }
    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      this.signal({ type: 'offer', sdp: offer.sdp })
    } catch {
      this.failed = true
    }
    this.refresh()
  }

  private onSignal = async (msg: { from?: unknown; payload?: Signal }) => {
    if (this.disposed || msg?.from !== 'table' || !msg.payload) return
    const p = msg.payload
    try {
      if (p.type === 'answer' && this.peer) await this.peer.setRemoteDescription({ type: 'answer', sdp: p.sdp })
      else if (p.type === 'ice' && this.peer) await this.peer.addIceCandidate(p.candidate)
      else if (p.type === 'msg') this.handle(decode(p.m), 'relay')
    } catch {
      // Stale answer/candidate after a reconnect: ignore.
    }
  }

  private handle(m: RtMessage | null, via: 'p2p' | 'relay') {
    if (!m) return
    if (m.t === 'ping') {
      // Answer on the path the ping came in on, so the TV measures that path.
      if (via === 'p2p' && this.channel?.readyState === 'open') this.channel.send(encode({ t: 'pong', n: m.n }))
      else this.relay({ t: 'pong', n: m.n })
    } else if (m.t === 'feedback') {
      this.onFeedback(m.data)
    }
  }

  private transmit(m: RtMessage) {
    if (this.channel?.readyState === 'open') this.channel.send(encode(m))
    else this.relay(m)
  }

  private relay(m: RtMessage) {
    const payload = { id: this.id, from: this.seatNo, input: toWire(m) }
    if (this.deps.socket.volatile) this.deps.socket.volatile.emit('rt-input', payload)
    else this.deps.socket.emit('rt-input', payload)
  }

  private signal(payload: Signal) {
    this.deps.socket.emit('rt-signal', { id: this.id, to: 'table', from: this.seatNo, payload })
  }

  private refresh() {
    const mode = chooseTransport({
      channelOpen: this.channel?.readyState === 'open',
      failed: this.failed,
      elapsedMs: this.deps.now() - this.startedAt,
      timeoutMs: P2P_TIMEOUT_MS,
    })
    const next = { mode, rttMs: this.status.rttMs }
    if (!sameStatus(this.status, next)) {
      this.status = next
      this.onStatus(next)
    }
  }
}
