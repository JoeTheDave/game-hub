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
import { registerRtTestGame, unregisterRtTestGame } from '../test/realtimeGame.js'
import prisma from './prisma.js'
import { createApp } from '../app.js'
import { initSocket, getIO } from './socket.js'
import { syncGameCatalog } from './gameInstances.js'

let server: http.Server
let url: string
let app: ReturnType<typeof createApp>
let hostId: string
/** The host's session cookie: the TV is the host's signed-in browser. */
let hostCookie: string
const sockets: Socket[] = []

function connect(cookie?: string): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioClient(url, { path: '/socket.io', transports: ['websocket'], extraHeaders: cookie ? { cookie } : undefined })
    sockets.push(s)
    s.on('connect', () => resolve(s))
  })
}
const emitAck = (s: Socket, event: string, payload: unknown): Promise<{ ok: boolean }> => new Promise((r) => s.emit(event, payload, r))
const settle = () => new Promise((r) => setTimeout(r, 150))

async function table(slug: string) {
  const inst = await createInstanceDirect(slug, hostId)
  const a = (await request(app).post(`/api/games/instances/${inst.id}/join`).send({})).body.player
  const b = (await request(app).post(`/api/games/instances/${inst.id}/join`).send({})).body.player
  const tv = await connect(hostCookie)
  const p0 = await connect()
  const p1 = await connect()
  const stranger = await connect()
  await emitAck(tv, 'subscribe-table', { id: inst.id })
  await emitAck(p0, 'subscribe-seat', { id: inst.id, playerOrder: 0, joinToken: a.joinToken })
  await emitAck(p1, 'subscribe-seat', { id: inst.id, playerOrder: 1, joinToken: b.joinToken })
  const got: Record<string, { event: string; payload: unknown }[]> = { tv: [], p0: [], p1: [], stranger: [] }
  for (const [k, s] of Object.entries({ tv, p0, p1, stranger })) s.onAny((event, payload) => got[k].push({ event, payload }))
  return { id: inst.id, tv, p0, p1, stranger, got }
}

beforeAll(async () => {
  app = createApp()
  server = http.createServer(app)
  initSocket(server, true)
  await new Promise<void>((r) => server.listen(0, r))
  url = `http://localhost:${(server.address() as AddressInfo).port}`
  await syncGameCatalog()
  await registerRtTestGame()
  const agent = request.agent(app)
  const reg = await agent.post('/api/auth/register').send({ email: `rts-${Date.now()}@example.com`, password: 'password123', passwordConfirmation: 'password123' })
  hostId = reg.body.id
  hostCookie = ([] as string[]).concat(reg.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ')
})

afterAll(async () => {
  unregisterRtTestGame()
  sockets.forEach((s) => s.disconnect())
  getIO()?.close()
  await new Promise((r) => server.close(r))
  await prisma.$disconnect()
})

describe('real-time signalling and input relay', () => {
  it('relays seat → table and table → one seat, only for verified seats', async () => {
    const t = await table('rt-test')
    t.p0.emit('rt-signal', { id: t.id, to: 'table', from: 0, payload: { sdp: 'offer-0' } })
    // p1 can't impersonate seat 0, and a stranger can't signal at all
    t.p1.emit('rt-signal', { id: t.id, to: 'table', from: 0, payload: { sdp: 'forged' } })
    t.stranger.emit('rt-signal', { id: t.id, to: 'table', from: 1, payload: { sdp: 'stranger' } })
    // the table answers seat 0 only; a non-table socket can't address a seat
    t.tv.emit('rt-signal', { id: t.id, to: 0, payload: { sdp: 'answer-0' } })
    t.p1.emit('rt-signal', { id: t.id, to: 0, payload: { sdp: 'p1-to-p0' } })
    await settle()
    expect(t.got.tv.filter((e) => e.event === 'rt-signal').map((e) => e.payload)).toEqual([{ from: 0, payload: { sdp: 'offer-0' } }])
    expect(t.got.p0.filter((e) => e.event === 'rt-signal').map((e) => e.payload)).toEqual([{ from: 'table', payload: { sdp: 'answer-0' } }])
    expect(t.got.p1.filter((e) => e.event === 'rt-signal')).toHaveLength(0)
    expect(t.got.stranger).toHaveLength(0)
  })

  it('lets only the host’s signed-in TV answer a phone (a table watcher cannot)', async () => {
    const t = await table('rt-test')
    const watcher = await connect()
    await emitAck(watcher, 'subscribe-table', { id: t.id })
    watcher.emit('rt-signal', { id: t.id, to: 0, payload: { sdp: 'watcher-answer' } })
    t.tv.emit('rt-signal', { id: t.id, to: 0, payload: { sdp: 'host-answer' } })
    await settle()
    expect(t.got.p0.filter((e) => e.event === 'rt-signal').map((e) => e.payload)).toEqual([{ from: 'table', payload: { sdp: 'host-answer' } }])
  })

  it('relays inputs from verified seats to the table only', async () => {
    const t = await table('rt-test')
    t.p0.emit('rt-input', { id: t.id, from: 0, input: [1, 0.5, 0.25] })
    t.p1.emit('rt-input', { id: t.id, from: 0, input: [9, 9, 9] })
    t.stranger.emit('rt-input', { id: t.id, from: 1, input: [7, 7, 7] })
    await settle()
    expect(t.got.tv.filter((e) => e.event === 'rt-input').map((e) => e.payload)).toEqual([{ from: 0, input: [1, 0.5, 0.25] }])
    expect(t.got.p0.filter((e) => e.event === 'rt-input')).toHaveLength(0)
  })

  it('ignores signalling and input for turn-based games', async () => {
    const t = await table('tic-tac-toe')
    t.p0.emit('rt-signal', { id: t.id, to: 'table', from: 0, payload: { sdp: 'x' } })
    t.tv.emit('rt-signal', { id: t.id, to: 0, payload: { sdp: 'y' } })
    t.p0.emit('rt-input', { id: t.id, from: 0, input: [1, 2] })
    await settle()
    expect(t.got.tv.filter((e) => e.event.startsWith('rt-'))).toHaveLength(0)
    expect(t.got.p0.filter((e) => e.event.startsWith('rt-'))).toHaveLength(0)
  })
})
