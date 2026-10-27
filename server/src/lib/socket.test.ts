import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgresql://postgres:localdev123@localhost:5432/game_hub_test'
  process.env.NODE_ENV = 'test'
})

import http from 'http'
import type { AddressInfo } from 'net'
import request from 'supertest'
import { io as ioClient, type Socket } from 'socket.io-client'
import { createInstanceDirect } from '../test/instances.js'
import prisma from './prisma.js'
import { createApp } from '../app.js'
import { initSocket, getIO } from './socket.js'
import { syncGameCatalog } from './gameInstances.js'

let server: http.Server
let url: string
let app: ReturnType<typeof createApp>
const sockets: Socket[] = []

function connect(): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioClient(url, { path: '/socket.io', transports: ['websocket'] })
    sockets.push(s)
    s.on('connect', () => resolve(s))
  })
}

function emitAck(s: Socket, event: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s.emit(event, payload, resolve))
}

beforeAll(async () => {
  app = createApp()
  server = http.createServer(app)
  initSocket(server, true)
  await new Promise<void>((r) => server.listen(0, r))
  url = `http://localhost:${(server.address() as AddressInfo).port}`
  await syncGameCatalog()
})

afterAll(async () => {
  sockets.forEach((s) => s.disconnect())
  getIO()?.close()
  await new Promise((r) => server.close(r))
  await prisma.$disconnect()
})

describe('per-viewer sockets', () => {
  it('only admits a seat with its token, and never broadcasts joinTokens', async () => {
    const hostAgent = request.agent(app)
    const email = `sock-${Date.now()}@example.com`
    const reg = await hostAgent.post('/api/auth/register').send({ email, password: 'password123', passwordConfirmation: 'password123' })
    // Tic-Tac-Toe is unlisted, so the test creates it directly (see server/src/test/instances.ts).
    const inst = await createInstanceDirect('tic-tac-toe', reg.body.id)
    const a = (await request(app).post(`/api/games/instances/${inst.id}/join`).send({})).body.player
    const b = (await request(app).post(`/api/games/instances/${inst.id}/join`).send({})).body.player

    const tv = await connect()
    const phoneA = await connect()
    const spy = await connect()
    expect((await emitAck(tv, 'subscribe-table', { id: inst.id })).ok).toBe(true)
    expect((await emitAck(phoneA, 'subscribe-seat', { id: inst.id, playerOrder: 0, joinToken: a.joinToken })).ok).toBe(true)
    // A phone holding seat 1's token cannot listen in on seat 0.
    expect((await emitAck(spy, 'subscribe-seat', { id: inst.id, playerOrder: 0, joinToken: b.joinToken })).ok).toBe(false)

    const received: { who: string; event: string; payload: unknown }[] = []
    for (const [who, s] of [['tv', tv], ['phoneA', phoneA], ['spy', spy]] as const) {
      s.onAny((event, payload) => received.push({ who, event, payload }))
    }

    await request(app).post(`/api/games/instances/${inst.id}/start`).send({ joinToken: a.joinToken })
    await request(app)
      .post(`/api/games/instances/${inst.id}/action`)
      .send({ playerOrder: 0, joinToken: a.joinToken, action: { type: 'place', row: 1, col: 1 } })
    await new Promise((r) => setTimeout(r, 200))

    const tvEvents = received.filter((r) => r.who === 'tv')
    expect(tvEvents.map((r) => r.event)).toEqual(['table-updated', 'table-updated'])
    const last = tvEvents[1].payload as { events: { type: string }[]; instance: { tableView: { board: string[][] } } }
    expect(last.events[0]).toMatchObject({ type: 'placed', row: 1, col: 1 })
    expect(last.instance.tableView.board[1][1]).toBe('X')

    const seatUpdates = received.filter((r) => r.who === 'phoneA' && r.event === 'seat-updated')
    expect(seatUpdates).toHaveLength(2)
    expect(seatUpdates[1].payload).toMatchObject({ playerOrder: 0, playerView: { myMark: 'X' } })

    expect(received.filter((r) => r.who === 'spy')).toHaveLength(0)
    const all = JSON.stringify(received)
    expect(all).not.toContain('joinToken')
    expect(all).not.toContain(a.joinToken)
    expect(all).not.toContain(b.joinToken)
  })
})
