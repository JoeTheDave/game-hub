import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import prisma from './prisma.js'

let io: Server | null = null

const tableRoom = (id: string) => `game:${id}:table`
const seatRoom = (id: string, playerOrder: number) => `game:${id}:seat:${playerOrder}`

type Ack = (res: { ok: boolean; error?: string }) => void

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
          ack?.({ ok: true })
        } catch {
          ack?.({ ok: false, error: 'Subscribe failed' })
        }
      }
    )
    socket.on('unsubscribe-seat', (payload: { id?: string; playerOrder?: number } | undefined) => {
      if (typeof payload?.id === 'string' && typeof payload.playerOrder === 'number') {
        socket.leave(seatRoom(payload.id, payload.playerOrder))
      }
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
