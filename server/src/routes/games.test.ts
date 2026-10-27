import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Point Prisma + the session store at the test database before anything imports them.
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

let app: Express
let host: ReturnType<typeof request.agent>
let gameId: string

async function createInstance() {
  const res = await host.post('/api/games/instances').send({ gameId })
  expect(res.status).toBe(201)
  return res.body as { id: string; joinCode: string }
}

async function join(id: string) {
  const res = await request(app).post(`/api/games/instances/${id}/join`).send({})
  return res
}

async function startedGame() {
  const inst = await createInstance()
  const a = (await join(inst.id)).body.player
  const b = (await join(inst.id)).body.player
  const start = await request(app).post(`/api/games/instances/${inst.id}/start`).send({ joinToken: a.joinToken })
  expect(start.status).toBe(200)
  return { id: inst.id, a, b }
}

beforeAll(async () => {
  app = createApp()
  await syncGameCatalog()
  gameId = (await prisma.game.findUniqueOrThrow({ where: { slug: 'tic-tac-toe' } })).id
  host = request.agent(app)
  const email = `host-${Date.now()}@example.com`
  const reg = await host.post('/api/auth/register').send({ email, password: 'password123', passwordConfirmation: 'password123' })
  expect(reg.status).toBe(201)
})

beforeEach(async () => {
  await prisma.gameInstance.deleteMany({})
})

afterAll(async () => {
  await prisma.gameInstance.deleteMany({})
  await prisma.$disconnect()
})

describe('game catalog', () => {
  it('lists registry games with player counts', async () => {
    const res = await request(app).get('/api/games')
    expect(res.status).toBe(200)
    expect(res.body).toContainEqual(expect.objectContaining({ slug: 'tic-tac-toe', minPlayers: 2, maxPlayers: 2 }))
  })

  it('requires a session to create an instance', async () => {
    const res = await request(app).post('/api/games/instances').send({ gameId })
    expect(res.status).toBe(401)
  })

  it('no longer exposes the template /api/users endpoints', async () => {
    expect((await request(app).get('/api/users')).status).toBe(404)
    expect((await request(app).post('/api/users').send({ email: 'x@y.z' })).status).toBe(404)
  })
})

describe('joining', () => {
  it('returns the joinToken only to the joiner, never in shared responses', async () => {
    const inst = await createInstance()
    const joined = await join(inst.id)
    expect(joined.status).toBe(201)
    expect(joined.body.player.joinToken).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(joined.body.instance)).not.toContain('joinToken')
    for (const path of [`/api/games/instances/${inst.id}`, `/api/games/instances/by-code/${inst.joinCode}`]) {
      const res = await request(app).get(path)
      expect(res.status).toBe(200)
      expect(JSON.stringify(res.body)).not.toContain('joinToken')
      expect(JSON.stringify(res.body)).not.toContain(joined.body.player.joinToken)
    }
  })

  it('enforces maxPlayers', async () => {
    const inst = await createInstance()
    expect((await join(inst.id)).status).toBe(201)
    expect((await join(inst.id)).status).toBe(201)
    const third = await join(inst.id)
    expect(third.status).toBe(400)
    expect(third.body.error).toMatch(/full/i)
  })
})

describe('lobby edits', () => {
  it('requires the seat joinToken to rename or recolor', async () => {
    const inst = await createInstance()
    const a = (await join(inst.id)).body.player
    const b = (await join(inst.id)).body.player
    const forged = await request(app)
      .patch(`/api/games/instances/${inst.id}/players`)
      .send({ playerOrder: 0, joinToken: b.joinToken, screenName: 'Hacked' })
    expect(forged.status).toBe(403)
    const missing = await request(app).patch(`/api/games/instances/${inst.id}/players`).send({ playerOrder: 0, screenName: 'Hacked' })
    expect(missing.status).toBe(403)
    const ok = await request(app)
      .patch(`/api/games/instances/${inst.id}/players`)
      .send({ playerOrder: 0, joinToken: a.joinToken, screenName: 'Alice', color: 'purple' })
    expect(ok.status).toBe(200)
    expect(ok.body.instance.players[0]).toMatchObject({ screenName: 'Alice', color: 'purple' })
  })
})

describe('starting', () => {
  it('needs minPlayers', async () => {
    const inst = await createInstance()
    const a = (await join(inst.id)).body.player
    const res = await request(app).post(`/api/games/instances/${inst.id}/start`).send({ joinToken: a.joinToken })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not enough/i)
  })

  it('allows only the host or seat 0', async () => {
    const inst = await createInstance()
    await join(inst.id)
    const b = (await join(inst.id)).body.player
    expect((await request(app).post(`/api/games/instances/${inst.id}/start`).send({ joinToken: b.joinToken })).status).toBe(403)
    expect((await request(app).post(`/api/games/instances/${inst.id}/start`).send({})).status).toBe(403)
    const res = await host.post(`/api/games/instances/${inst.id}/start`).send({})
    expect(res.status).toBe(200)
    expect(res.body.phase).toBe('playing')
    expect(res.body.tableView.board).toHaveLength(3)
  })
})

describe('actions', () => {
  it('applies a legal action authenticated by joinToken', async () => {
    const { id, a } = await startedGame()
    const res = await request(app)
      .post(`/api/games/instances/${id}/action`)
      .send({ playerOrder: 0, joinToken: a.joinToken, action: { type: 'place', row: 0, col: 0 } })
    expect(res.status).toBe(200)
    expect(res.body.playerView.board[0][0]).toBe('X')
    expect(res.body.playerView.myMark).toBe('X')
  })

  it('rejects a forged playerOrder', async () => {
    const { id, b } = await startedGame()
    const res = await request(app)
      .post(`/api/games/instances/${id}/action`)
      .send({ playerOrder: 0, joinToken: b.joinToken, action: { type: 'place', row: 0, col: 0 } })
    expect(res.status).toBe(403)
  })

  it('surfaces engine errors', async () => {
    const { id, b } = await startedGame()
    const res = await request(app)
      .post(`/api/games/instances/${id}/action`)
      .send({ playerOrder: 1, joinToken: b.joinToken, action: { type: 'place', row: 0, col: 0 } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Not your turn')
  })

  it('returns 409 with a fresh view when the version is stale', async () => {
    const { id, a } = await startedGame()
    const current = (await request(app).get(`/api/games/instances/${id}`)).body.version as number
    const res = await request(app)
      .post(`/api/games/instances/${id}/action`)
      .send({ playerOrder: 0, joinToken: a.joinToken, version: current - 1, action: { type: 'place', row: 0, col: 0 } })
    expect(res.status).toBe(409)
    expect(res.body.version).toBe(current)
    expect(res.body.playerView.board[0][0]).toBe('')
  })

  it('lets only one of two simultaneous actions apply', async () => {
    const { id, a } = await startedGame()
    const send = (col: number) =>
      request(app)
        .post(`/api/games/instances/${id}/action`)
        .send({ playerOrder: 0, joinToken: a.joinToken, action: { type: 'place', row: 0, col } })
    const results = await Promise.all([send(0), send(1)])
    const statuses = results.map((r) => r.status).sort()
    // One wins; the other either loses the versioned write (409) or sees it is no longer its turn (400).
    expect(statuses[0]).toBe(200)
    expect([400, 409]).toContain(statuses[1])
    const view = (await request(app).get(`/api/games/instances/${id}`)).body.tableView
    expect(view.board[0].filter((c: string) => c === 'X')).toHaveLength(1)
  })
})

describe('seat view', () => {
  it('requires the seat token and returns the private view', async () => {
    const { id, a, b } = await startedGame()
    expect((await request(app).get(`/api/games/instances/${id}/me`).query({ playerOrder: 0, joinToken: b.joinToken })).status).toBe(403)
    const res = await request(app).get(`/api/games/instances/${id}/me`).query({ playerOrder: 0, joinToken: a.joinToken })
    expect(res.status).toBe(200)
    expect(res.body.playerView).toMatchObject({ myMark: 'X', isMyTurn: true })
    expect(JSON.stringify(res.body)).not.toContain('joinToken')
  })
})

describe('lobby races and malformed ids', () => {
  it('never lets a join land in a game a concurrent start set up without it', async () => {
    const splendorId = (await prisma.game.findUniqueOrThrow({ where: { slug: 'splendor' } })).id
    for (let round = 0; round < 10; round++) {
      const created = await host.post('/api/games/instances').send({ gameId: splendorId })
      const id = created.body.id as string
      const a = (await join(id)).body.player
      await join(id)
      const [start, late] = await Promise.all([
        request(app).post(`/api/games/instances/${id}/start`).send({ joinToken: a.joinToken }),
        join(id),
      ])
      expect(start.status).toBe(200)
      const seated = await prisma.gameInstancePlayer.count({ where: { gameInstanceId: id } })
      const inst = await prisma.gameInstance.findUniqueOrThrow({ where: { id } })
      const enginePlayers = ((inst.gameState as { state: { players: unknown[] } }).state.players).length
      expect(enginePlayers).toBe(seated)
      // The late joiner either made it in before the start, or was turned away.
      expect([201, 400]).toContain(late.status)
    }
  })

  it('treats a malformed game id as not found', async () => {
    expect((await request(app).get('/api/games/instances/not-a-uuid')).status).toBe(404)
    expect((await request(app).post('/api/games/instances/not-a-uuid/join').send({})).status).toBe(404)
  })
})

describe('rematch', () => {
  async function finishedGame() {
    const g = await startedGame()
    const moves: [number, number, number][] = [
      [0, 0, 0],
      [1, 1, 0],
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 2], // X wins on the top row
    ]
    for (const [seat, row, col] of moves) {
      const tok = seat === 0 ? g.a.joinToken : g.b.joinToken
      const r = await request(app).post(`/api/games/instances/${g.id}/action`).send({ playerOrder: seat, joinToken: tok, action: { type: 'place', row, col } })
      expect(r.status).toBe(200)
    }
    const inst = await request(app).get(`/api/games/instances/${g.id}`)
    expect(inst.body.phase).toBe('finished')
    return g
  }

  it('lets seat 0 start a brand-new game with the same players, without the lobby', async () => {
    const { id, a, b } = await finishedGame()
    const before = await prisma.gameInstance.findUniqueOrThrow({ where: { id } })
    const res = await request(app).post(`/api/games/instances/${id}/rematch`).send({ joinToken: a.joinToken })
    expect(res.status).toBe(200)
    expect(res.body.phase).toBe('playing')
    expect(JSON.stringify(res.body)).not.toContain(a.joinToken)
    expect(JSON.stringify(res.body)).not.toContain(b.joinToken)
    const after = await prisma.gameInstance.findUniqueOrThrow({ where: { id }, include: { players: true } })
    expect(after.version).toBeGreaterThan(before.version)
    // Same seats and tokens carry over: both phones can act in the new game straight away.
    expect(after.players.map((p) => p.joinToken).sort()).toEqual([a.joinToken, b.joinToken].sort())
    const board = (after.gameState as { state: { board: string[][] } }).state.board
    expect(board.flat().every((c) => c === '')).toBe(true)
    const move = await request(app).post(`/api/games/instances/${id}/action`).send({ playerOrder: 0, joinToken: a.joinToken, action: { type: 'place', row: 2, col: 2 } })
    expect(move.status).toBe(200)
  })

  it('refuses anyone but seat 0 (or the host)', async () => {
    const { id, b } = await finishedGame()
    const res = await request(app).post(`/api/games/instances/${id}/rematch`).send({ joinToken: b.joinToken })
    expect(res.status).toBe(403)
  })

  it('refuses a game that is not over yet', async () => {
    const { id, a } = await startedGame()
    const res = await request(app).post(`/api/games/instances/${id}/rematch`).send({ joinToken: a.joinToken })
    expect(res.status).toBe(400)
  })
})
