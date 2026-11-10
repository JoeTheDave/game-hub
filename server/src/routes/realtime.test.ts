import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgresql://postgres:localdev123@localhost:5432/game_hub_test'
  process.env.NODE_ENV = 'test'
})

import request from 'supertest'
import type { Express } from 'express'
import prisma from '../lib/prisma.js'
import { createApp } from '../app.js'
import { syncGameCatalog } from '../lib/gameInstances.js'
import { createInstanceDirect } from '../test/instances.js'
import { registerRtTestGame, unregisterRtTestGame } from '../test/realtimeGame.js'

let app: Express
let host: ReturnType<typeof request.agent>
let hostId: string

async function startedRealtime(slug = 'rt-test') {
  const inst = await createInstanceDirect(slug, hostId)
  const a = (await request(app).post(`/api/games/instances/${inst.id}/join`).send({})).body.player
  const b = (await request(app).post(`/api/games/instances/${inst.id}/join`).send({})).body.player
  const start = await host.post(`/api/games/instances/${inst.id}/start`).send({})
  expect(start.status).toBe(200)
  return { id: inst.id, a, b }
}

beforeAll(async () => {
  app = createApp()
  await syncGameCatalog()
  await registerRtTestGame()
  host = request.agent(app)
  const email = `rt-host-${Date.now()}@example.com`
  const reg = await host.post('/api/auth/register').send({ email, password: 'password123', passwordConfirmation: 'password123' })
  expect(reg.status).toBe(201)
  hostId = reg.body.id
})

afterAll(async () => {
  unregisterRtTestGame()
  await prisma.$disconnect()
})

describe('authority actions (real-time games only)', () => {
  it('lets the host table report outcomes, and records history once on the finishing action', async () => {
    const g = await startedRealtime()
    const r1 = await host.post(`/api/games/instances/${g.id}/authority-action`).send({ action: { type: 'point', against: 1 } })
    expect(r1.status).toBe(200)
    expect(r1.body.tableView.lives).toEqual([2, 1])
    expect(JSON.stringify(r1.body)).not.toContain('joinToken')
    const r2 = await host.post(`/api/games/instances/${g.id}/authority-action`).send({ action: { type: 'point', against: 1 } })
    expect(r2.body.phase).toBe('finished')
    expect(r2.body.history).toEqual([{ scores: [1, 0], winners: [0] }])
    // a further report after the end is refused and doesn't append again
    const r3 = await host.post(`/api/games/instances/${g.id}/authority-action`).send({ action: { type: 'point', against: 0 } })
    expect(r3.status).toBe(400)
    const after = await request(app).get(`/api/games/instances/${g.id}`)
    expect(after.body.history).toHaveLength(1)
  })

  it('refuses anyone but the host session, and refuses seat actions on the engine', async () => {
    const g = await startedRealtime()
    expect((await request(app).post(`/api/games/instances/${g.id}/authority-action`).send({ action: { type: 'point', against: 1 } })).status).toBe(403)
    // a seat can't use the normal action route to score either (the engine only trusts AUTHORITY_SEAT)
    const seatTry = await request(app)
      .post(`/api/games/instances/${g.id}/action`)
      .send({ playerOrder: 0, joinToken: g.a.joinToken, action: { type: 'point', against: 1 } })
    expect(seatTry.status).toBe(400)
  })

  it('is refused for turn-based games', async () => {
    const inst = await createInstanceDirect('tic-tac-toe', hostId)
    await request(app).post(`/api/games/instances/${inst.id}/join`).send({})
    await request(app).post(`/api/games/instances/${inst.id}/join`).send({})
    await host.post(`/api/games/instances/${inst.id}/start`).send({})
    const r = await host.post(`/api/games/instances/${inst.id}/authority-action`).send({ action: { type: 'place', row: 0, col: 0 } })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/real-time/)
  })

  it('returns 404 for unknown or malformed ids', async () => {
    expect((await host.post('/api/games/instances/not-a-uuid/authority-action').send({})).status).toBe(404)
  })
})
