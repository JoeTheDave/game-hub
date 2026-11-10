import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import prisma from './prisma.js'
import { getGame } from '../games/registry.js'

let io: Server | null = null

const tableRoom = (id: string) => `game:${id}:table`
const seatRoom = (id: string, playerOrder: number) => `game:${id}:seat:${playerOrder}`

type Ack = (res: { ok: boolean; error?: string }) => void

/**
 * Whether an instance's game is real-time (GameModule.realtime). Looked up once per instance and
 * cached: only real-time instances relay WebRTC signalling and input (rt-signal / rt-input).
 */
const realtimeCache = new Map<string, boolean>()
async function isRealtimeInstance(id: string): Promise<boolean> {
  const cached = realtimeCache.get(id)
  if (cached !== undefined) return cached
  let rt = false
  try {
    const inst = await prisma.gameInstance.findUnique({ where: { id }, select: { game: { select: { slug: true } } } })
    rt = !!(inst && getGame(inst.game.slug)?.realtime)
  } catch {
    // malformed id etc.
  }
  realtimeCache.set(id, rt)
  return rt
}

/** Seats this socket has proven (via subscribe-seat with the joinToken), as `${id}:${seat}`. */
const verifiedSeats = (socket: { data: Record<string, unknown> }): Set<string> =>
  ((socket.data.rtSeats as Set<string> | undefined) ?? (socket.data.rtSeats = new Set<string>())) as Set<string>

/**
 * Per-viewer rooms: the TV joins the table room (public info only); a phone joins its seat
 * room only after proving its joinToken, so private player views never reach anyone else.
 */
export function initSocket(httpServer: HttpServer, clientOrigin: string | true | undefined) {
  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin === true ? true : clientOrigin || '*',
      credentials: true,
    },
    path: '/socket.io',
  })
  io.on('connection', (socket) => {
    socket.on('subscribe-table', (payload: { id?: string } | undefined, ack?: Ack) => {
      const id = payload?.id
      if (typeof id !== 'string') return ack?.({ ok: false, error: 'id required' })
      socket.join(tableRoom(id))
      ack?.({ ok: true })
    })
    socket.on('unsubscribe-table', (payload: { id?: string } | undefined) => {
      if (typeof payload?.id === 'string') socket.leave(tableRoom(payload.id))
    })
    socket.on(
      'subscribe-seat',
      async (payload: { id?: string; playerOrder?: number; joinToken?: string } | undefined, ack?: Ack) => {
        try {
          const { id, playerOrder, joinToken } = payload ?? {}
          if (typeof id !== 'string' || typeof playerOrder !== 'number' || typeof joinToken !== 'string') {
            return ack?.({ ok: false, error: 'id, playerOrder and joinToken required' })
          }
          const seat = await prisma.gameInstancePlayer.findUnique({
            where: { gameInstanceId_playerOrder: { gameInstanceId: id, playerOrder } },
            select: { joinToken: true },
          })
          if (!seat?.joinToken || seat.joinToken !== joinToken) return ack?.({ ok: false, error: 'Invalid seat token' })
          socket.join(seatRoom(id, playerOrder))
          verifiedSeats(socket).add(`${id}:${playerOrder}`)
          ack?.({ ok: true })
        } catch {
          ack?.({ ok: false, error: 'Subscribe failed' })
        }
      }
    )
    socket.on('unsubscribe-seat', (payload: { id?: string; playerOrder?: number } | undefined) => {
      if (typeof payload?.id === 'string' && typeof payload.playerOrder === 'number') {
        socket.leave(seatRoom(payload.id, payload.playerOrder))
        verifiedSeats(socket).delete(`${payload.id}:${payload.playerOrder}`)
      }
    })

    // ——— Real-time games only (GameModule.realtime): WebRTC signalling + input relay ———
    // rt-signal: a verified seat → the table ({to:'table', from: seat}); the table → one seat
    // ({to: seat}). Anything else, or a turn-based instance, is ignored.
    socket.on(
      'rt-signal',
      async (msg: { id?: unknown; to?: unknown; from?: unknown; payload?: unknown } | undefined) => {
        const id = msg?.id
        if (typeof id !== 'string' || !(await isRealtimeInstance(id))) return
        if (msg?.to === 'table') {
          const from = msg.from
          if (typeof from !== 'number' || !verifiedSeats(socket).has(`${id}:${from}`)) return
          io?.to(tableRoom(id)).emit('rt-signal', { from, payload: msg.payload })
        } else if (typeof msg?.to === 'number' && Number.isInteger(msg.to) && socket.rooms.has(tableRoom(id))) {
          io?.to(seatRoom(id, msg.to)).emit('rt-signal', { from: 'table', payload: msg.payload })
        }
      }
    )
    // rt-input: the relay fallback when the peer-to-peer channel isn't open. Volatile: a late
    // input is useless (the next one supersedes it), so never queue or retry.
    socket.on('rt-input', async (msg: { id?: unknown; from?: unknown; input?: unknown } | undefined) => {
      const id = msg?.id
      const from = msg?.from
      if (typeof id !== 'string' || typeof from !== 'number') return
      if (!verifiedSeats(socket).has(`${id}:${from}`) || !(await isRealtimeInstance(id))) return
      io?.to(tableRoom(id)).volatile.emit('rt-input', { from, input: msg?.input })
    })
  })
  return io
}

export function getIO(): Server | null {
  return io
}

export function emitToTable(id: string, event: string, payload: unknown) {
  io?.to(tableRoom(id)).emit(event, payload)
}

export function emitToSeat(id: string, playerOrder: number, event: string, payload: unknown) {
  io?.to(seatRoom(id, playerOrder)).emit(event, payload)
}
