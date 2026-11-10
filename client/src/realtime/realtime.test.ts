import { describe, expect, it } from 'vitest'
import { RttTracker, chooseTransport, decode, encode, isNewer, toWire } from './protocol'
import { ControllerSession, HostSession, type ChannelLike, type Deps, type PeerLike } from './session'

describe('real-time protocol', () => {
  it('round-trips every message type, compactly', () => {
    for (const m of [
      { t: 'input', x: 0.12345678, y: -3, seq: 7 },
      { t: 'ping', n: 3 },
      { t: 'pong', n: 3 },
      { t: 'feedback', data: { kind: 'hit' } },
    ] as const) {
      const back = decode(encode(m))
      if (m.t === 'input') expect(back).toEqual({ t: 'input', x: 0.1235, y: -3, seq: 7 })
      else expect(back).toEqual(m)
      expect(decode(toWire(m))).toEqual(back) // the relay carries the array form
    }
    expect(encode({ t: 'input', x: 1, y: 2, seq: 9 })).toBe('["i",1,2,9]')
  })

  it('rejects malformed messages', () => {
    for (const raw of ['nope', '{}', '["i",1]', '["i","1",2,3]', '["z",1]', 42, null, ['p', 'x'], ['i', 1, Infinity, 2]]) {
      expect(decode(raw)).toBeNull()
    }
  })

  it('chooses the path: p2p when open, relay after timeout or failure, else connecting', () => {
    expect(chooseTransport({ channelOpen: true, failed: true, elapsedMs: 9999, timeoutMs: 3000 })).toBe('p2p')
    expect(chooseTransport({ channelOpen: false, failed: false, elapsedMs: 100, timeoutMs: 3000 })).toBe('connecting')
    expect(chooseTransport({ channelOpen: false, failed: false, elapsedMs: 3000, timeoutMs: 3000 })).toBe('relay')
    expect(chooseTransport({ channelOpen: false, failed: true, elapsedMs: 10, timeoutMs: 3000 })).toBe('relay')
  })

  it('keeps only newer inputs and smooths RTT', () => {
    expect(isNewer(null, { x: 0, y: 0, seq: 1 })).toBe(true)
    expect(isNewer({ x: 0, y: 0, seq: 5 }, { x: 1, y: 1, seq: 4 })).toBe(false)
    const r = new RttTracker()
    const a = r.ping(0)
    expect(r.pong(a, 40)).toBe(40)
    const b = r.ping(100)
    expect(r.pong(b, 120)).toBe(34) // 40*0.7 + 20*0.3
    expect(r.pong(999, 200)).toBe(34) // unknown pong ignored
  })
})

// ——— Fakes ———

function fakeSocket() {
  const handlers: Record<string, Set<(p: never) => void>> = {}
  const sent: { event: string; payload: unknown }[] = []
  const socket = {
    emit: (event: string, payload: unknown) => sent.push({ event, payload }),
    on: (e: string, f: (p: never) => void) => (handlers[e] ??= new Set()).add(f),
    off: (e: string, f: (p: never) => void) => handlers[e]?.delete(f),
    volatile: { emit: (event: string, payload: unknown) => sent.push({ event: `volatile:${event}`, payload }) },
  }
  const deliver = async (event: string, payload: unknown) => {
    for (const f of handlers[event] ?? []) await (f as (p: unknown) => unknown)(payload)
  }
  return { socket, sent, deliver, handlers }
}

function fakeChannel(): ChannelLike & { sent: string[]; open(): void } {
  const ch = {
    readyState: 'connecting',
    sent: [] as string[],
    send(d: string) {
      ch.sent.push(d)
    },
    close() {
      ch.readyState = 'closed'
      ch.onclose?.()
    },
    onopen: null as (() => void) | null,
    onclose: null as (() => void) | null,
    onmessage: null as ((ev: { data: unknown }) => void) | null,
    open() {
      ch.readyState = 'open'
      ch.onopen?.()
    },
  }
  return ch
}

function fakePeer(): PeerLike & { channel: ReturnType<typeof fakeChannel> | null; remote: unknown[]; ice: unknown[]; closed: boolean } {
  const p = {
    connectionState: 'new',
    channel: null as ReturnType<typeof fakeChannel> | null,
    remote: [] as unknown[],
    ice: [] as unknown[],
    closed: false,
    onicecandidate: null as ((ev: { candidate: unknown }) => void) | null,
    ondatachannel: null as ((ev: { channel: ChannelLike }) => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    createDataChannel() {
      p.channel = fakeChannel()
      return p.channel
    },
    createOffer: async () => ({ type: 'offer', sdp: 'OFFER' }),
    createAnswer: async () => ({ type: 'answer', sdp: 'ANSWER' }),
    setLocalDescription: async () => {},
    setRemoteDescription: async (d: unknown) => {
      p.remote.push(d)
    },
    addIceCandidate: async (c: unknown) => {
      p.ice.push(c)
    },
    close() {
      p.closed = true
    },
  }
  return p
}

function deps(socket: ReturnType<typeof fakeSocket>['socket'], peers: ReturnType<typeof fakePeer>[]) {
  let t = 0
  const intervals: (() => void)[] = []
  const d: Deps = {
    socket,
    createPeer: () => {
      const p = fakePeer()
      peers.push(p)
      return p
    },
    now: () => t,
    setInterval: (fn) => intervals.push(fn),
    clearInterval: () => {},
  }
  return { d, advance: (ms: number) => (t += ms), tick: () => intervals.forEach((f) => f()) }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('ControllerSession (phone)', () => {
  it('offers a channel, relays inputs until it opens, then sends peer-to-peer', async () => {
    const s = fakeSocket()
    const peers: ReturnType<typeof fakePeer>[] = []
    const { d, advance } = deps(s.socket, peers)
    const statuses: string[] = []
    const c = new ControllerSession('inst', 1, d, (st) => statuses.push(st.mode))
    await flush()
    expect(s.sent[0]).toEqual({ event: 'rt-signal', payload: { id: 'inst', to: 'table', from: 1, payload: { type: 'offer', sdp: 'OFFER' } } })

    c.send(0.5, 0.25) // still connecting → relay
    expect(s.sent.at(-1)).toEqual({ event: 'volatile:rt-input', payload: { id: 'inst', from: 1, input: ['i', 0.5, 0.25, 1] } })

    // the TV's answer and ICE arrive via signalling
    await s.deliver('rt-signal', { from: 'table', payload: { type: 'answer', sdp: 'ANSWER' } })
    await s.deliver('rt-signal', { from: 'table', payload: { type: 'ice', candidate: { c: 1 } } })
    expect(peers[0].remote).toEqual([{ type: 'answer', sdp: 'ANSWER' }])
    expect(peers[0].ice).toEqual([{ c: 1 }])

    peers[0].channel!.open()
    expect(c.status.mode).toBe('p2p')
    c.send(0.6, 0.3)
    expect(peers[0].channel!.sent).toEqual(['["i",0.6,0.3,2]'])

    // pings over the channel are answered over the channel; feedback is surfaced
    peers[0].channel!.onmessage!({ data: '["p",4]' })
    expect(peers[0].channel!.sent.at(-1)).toBe('["o",4]')
    advance(10)
    expect(statuses).toContain('p2p')
    c.dispose()
    expect(peers[0].closed).toBe(true)
  })

  it('falls back to relay after the timeout and answers relayed pings over the relay', async () => {
    const s = fakeSocket()
    const peers: ReturnType<typeof fakePeer>[] = []
    const { d, advance, tick } = deps(s.socket, peers)
    const feedback: unknown[] = []
    const c = new ControllerSession('inst', 0, d, () => {}, (x) => feedback.push(x))
    await flush()
    advance(3000)
    tick()
    expect(c.status.mode).toBe('relay')
    await s.deliver('rt-signal', { from: 'table', payload: { type: 'msg', m: ['p', 9] } })
    expect(s.sent.at(-1)).toEqual({ event: 'volatile:rt-input', payload: { id: 'inst', from: 0, input: ['o', 9] } })
    await s.deliver('rt-signal', { from: 'table', payload: { type: 'msg', m: ['f', { kind: 'hit' }] } })
    expect(feedback).toEqual([{ kind: 'hit' }])
    // signals not from the table are ignored
    await s.deliver('rt-signal', { from: 3, payload: { type: 'msg', m: ['f', 'x'] } })
    expect(feedback).toHaveLength(1)
    // reconnect starts a fresh negotiation when the channel isn't open
    c.reconnectIfNeeded()
    await flush()
    expect(peers).toHaveLength(2)
    c.dispose()
  })
})

describe('HostSession (TV)', () => {
  it('answers offers, takes the newest input per seat from either path, and tracks mode + RTT', async () => {
    const s = fakeSocket()
    const peers: ReturnType<typeof fakePeer>[] = []
    const { d, advance, tick } = deps(s.socket, peers)
    const h = new HostSession('inst', d)

    await s.deliver('rt-signal', { from: 2, payload: { type: 'offer', sdp: 'OFFER' } })
    expect(peers[0].remote).toEqual([{ type: 'offer', sdp: 'OFFER' }])
    expect(s.sent.at(-1)).toEqual({ event: 'rt-signal', payload: { id: 'inst', to: 2, payload: { type: 'answer', sdp: 'ANSWER' } } })
    peers[0].onicecandidate!({ candidate: { c: 2 } })
    expect(s.sent.at(-1)).toEqual({ event: 'rt-signal', payload: { id: 'inst', to: 2, payload: { type: 'ice', candidate: { c: 2 } } } })

    // relay input before the channel opens
    await s.deliver('rt-input', { from: 2, input: ['i', 0.1, 0.2, 1] })
    expect(h.inputs[2]).toEqual({ x: 0.1, y: 0.2, seq: 1 })
    expect(h.status[2]?.mode).toBe('relay')

    // the phone's channel opens → p2p; older (out-of-order) inputs are dropped
    const ch = fakeChannel()
    peers[0].ondatachannel!({ channel: ch })
    ch.open()
    expect(h.status[2].mode).toBe('p2p')
    ch.onmessage!({ data: '["i",0.3,0.4,5]' })
    ch.onmessage!({ data: '["i",0.9,0.9,3]' })
    expect(h.inputs[2]).toEqual({ x: 0.3, y: 0.4, seq: 5 })

    // pings go over the open channel; the pong yields an RTT
    tick()
    expect(ch.sent.at(-1)).toBe('["p",1]')
    advance(25)
    ch.onmessage!({ data: '["o",1]' })
    expect(h.status[2].rttMs).toBe(25)

    // feedback over the channel, or via signalling when the channel is closed
    h.send(2, { kind: 'goal' })
    expect(ch.sent.at(-1)).toBe('["f",{"kind":"goal"}]')
    ch.close()
    h.send(2, { kind: 'goal' })
    expect(s.sent.at(-1)).toEqual({ event: 'rt-signal', payload: { id: 'inst', to: 2, payload: { type: 'msg', m: ['f', { kind: 'goal' }] } } })

    // a re-offer from the same seat replaces the old connection
    await s.deliver('rt-signal', { from: 2, payload: { type: 'offer', sdp: 'OFFER2' } })
    expect(peers[0].closed).toBe(true)
    expect(peers).toHaveLength(2)

    // malformed traffic is ignored
    await s.deliver('rt-input', { from: 'x', input: ['i', 1, 1, 99] })
    await s.deliver('rt-input', { from: 2, input: 'garbage' })
    expect(h.inputs[2].seq).toBe(5)
    h.dispose()
    expect(s.handlers['rt-input'].size).toBe(0)
  })
})
