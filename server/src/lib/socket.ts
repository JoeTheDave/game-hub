import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'

let io: Server | null = null

export function initSocket(httpServer: HttpServer, clientOrigin: string | true | undefined) {
  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin === true ? true : clientOrigin || '*',
      credentials: true,
    },
    path: '/socket.io',
  })
  io.on('connection', (socket) => {
    socket.on('subscribe-game', (gameInstanceId: string) => {
      socket.join(`game:${gameInstanceId}`)
    })
    socket.on('unsubscribe-game', (gameInstanceId: string) => {
      socket.leave(`game:${gameInstanceId}`)
    })
  })
  return io
}

export function getIO(): Server | null {
  return io
}

export function emitGameInstanceUpdate(gameInstanceId: string, payload: unknown) {
  io?.to(`game:${gameInstanceId}`).emit('instance-updated', payload)
}
