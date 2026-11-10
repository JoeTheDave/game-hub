import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createWorld, boardGeometry, step } from '@games/klask/physics'
import { klaskModule, AUTHORITY_SEAT, type KlaskState, type KlaskTableView, type KlaskPlayerView } from '@games/klask/engine'
import { seededRng, type SeatInfo } from '@games/types'
import { createRenderer } from './render'
import { TableDirector, type DirectorDeps } from './director'
import { TableView } from './TableView'
import { PhoneView } from './PhoneView'
import type { GameInstance } from '../../types/game'

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const g = globalThis as unknown as Record<string, unknown>
  g.window ??= { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, setInterval, clearInterval, matchMedia: () => ({ matches: false }) }
})

/** A 2D context stand-in: every method is a recorded no-op; gradients accept colour stops. */
function fakeCtx() {
  const calls: string[] = []
  const grad = { addColorStop: () => {} }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad
      if (prop === 'createPattern') return () => null
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`non-finite arg to ${prop}`)
        calls.push(prop)
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const seatsFor = (n: number): SeatInfo[] => Array.from({ length: n }, (_, i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: ['red', 'blue', 'green', 'yellow'][i] }))
function views(n: number, stylized = false) {
  const seats = seatsFor(n)
  const { state } = klaskModule.setup(seats, seededRng(n), { stylized })
  return { seats, state, table: klaskModule.tableView(state, seats) as KlaskTableView }
}

describe('canvas renderers', () => {
  for (const n of [2, 3, 4]) {
    for (const stylized of [false, true]) {
      it(`draw ${n} players, ${stylized ? 'stylized' : 'realistic'}, through play and a point burst`, () => {
        const geo = boardGeometry(n)
        let world = createWorld(n, undefined, 0)
        const r = createRenderer(stylized)
        const { ctx, calls } = fakeCtx()
        const colors = ['#f00', '#00f', '#0f0', '#ff0']
        for (let i = 0; i < 30; i++) {
          world = step(world, Object.fromEntries(geo.homeSpots.map((h, s) => [s, { x: h.x * 0.5, y: h.y * 0.5 + i }]))).world
          const v = r.draw(ctx, 1920, 1080, world, geo, { colors, dt: 1 / 60 })
          expect(v.scale).toBeGreaterThan(0)
          if (i === 10) r.burst(geo.goals[0].x, geo.goals[0].y, colors[0])
        }
        expect(calls.filter((c) => c === 'arc').length).toBeGreaterThan(n + 3)
        // an eliminated player's zone still draws (closed goal, no striker)
        const out = createWorld(n, Array.from({ length: n }, (_, i) => i !== 0), 1)
        expect(() => r.draw(ctx, 800, 600, out, geo, { colors, dt: 0.016 })).not.toThrow()
      })
    }
  }
})

describe('TV director: a point is reported once, then the next play starts', () => {
  function setup(postResult: { ok: boolean; status?: number; error?: string } = { ok: true }) {
    const v = views(2)
    const posted: unknown[] = []
    const sent: { seat: number; data: unknown }[] = []
    const errors: string[] = []
    const deps: DirectorDeps = {
      post: async (a) => {
        posted.push(a)
        return postResult
      },
      play: () => {},
      send: (seat, data) => sent.push({ seat, data }),
      onPoint: () => {},
      onAuthError: (m) => errors.push(m),
    }
    const d = new TableDirector(v.table, deps)
    return { ...v, d, posted, sent, errors }
  }

  it('posts {point, against} as the authority exactly once and resets after the platform applies it', async () => {
    const t = setup()
    const goal = t.d.geo.goals[0]
    t.d.world = { ...t.d.world, ball: { x: goal.x, y: goal.y, vx: 0, vy: 0 } }
    t.d.tick(1 / 60, {}, 1000)
    t.d.tick(1 / 60, {}, 1016)
    await Promise.resolve()
    expect(t.posted).toEqual([{ type: 'point', against: 0, reason: 'goal' }])
    expect(t.d.pending).not.toBeNull()
    // the platform applies it (as the server would) → the next view
    const res = klaskModule.applyAction(t.state as KlaskState, AUTHORITY_SEAT, { type: 'point', against: 0, reason: 'goal' }, seededRng(1))
    if (!res.ok) throw new Error(res.error)
    const next = klaskModule.tableView(res.state, t.seats) as KlaskTableView
    t.d.setView(next, 1200) // too soon: banner still showing
    expect(t.d.pending).not.toBeNull()
    t.d.tick(1 / 60, {}, 2600)
    expect(t.d.pending).toBeNull()
    expect(t.d.world.phase).toBe('play')
    expect(t.sent.filter((s) => (s.data as { re?: string }).re === 'center').map((s) => s.seat).sort()).toEqual([0, 1])
  })

  it('tells the TV to open from the host’s browser when the server refuses (403)', async () => {
    const t = setup({ ok: false, status: 403, error: 'Only the host' })
    const goal = t.d.geo.goals[1]
    t.d.world = { ...t.d.world, ball: { x: goal.x, y: goal.y, vx: 0, vy: 0 } }
    t.d.tick(1 / 60, {}, 1000)
    await new Promise((r) => setTimeout(r, 0))
    expect(t.errors[0]).toMatch(/host’s signed-in browser/)
  })

  it('clamps phone targets into the right zone (a phone can’t reach across)', () => {
    const t = setup()
    for (let i = 0; i < 120; i++) t.d.tick(1 / 60, { 0: { x: 180, y: 0 } }, i * 16)
    expect(t.d.world.strikers[0]!.x).toBeLessThan(0)
  })

  it('a rematch (finished → fresh) rebuilds the world', () => {
    const t = setup()
    const fin = { ...t.table, finished: true, result: { winners: [1] } }
    t.d.setView(fin, 0)
    t.d.world = { ...t.d.world, tick: 999 }
    t.d.setView({ ...t.table, round: 0, finished: false }, 10)
    expect(t.d.world.tick).toBe(0)
  })
})

const instance = (history?: { scores: number[]; winners: number[] }[]) =>
  ({ id: 'x', joinCode: 'X', phase: 'playing', version: 1, hostUserId: 'h', game: { id: 'g', slug: 'klask', name: 'Klask', minPlayers: 2, maxPlayers: 4 }, players: [], tableView: null, history }) as GameInstance
const noop = () => {}
const sound = { play: noop, registerFiles: noop, registerSynth: noop } as never

describe('views render', () => {
  it('TV: canvas, one HUD per player, and the Final Score with crown column + series when finished', () => {
    const v = views(3, true)
    const html = renderToString(createElement(TableView, { instance: instance(), view: v.table, players: [], events: [], seq: 1, onEventsDone: noop, sound } as never))
    expect(html).toContain('data-klask-canvas')
    expect(html.match(/data-hud=/g)).toHaveLength(3)
    const fin = { ...v.table, finished: true, result: { winners: [2] } }
    const hist = [
      { scores: [0, 0, 1], winners: [2] },
      { scores: [1, 0, 0], winners: [0] },
    ]
    const done = renderToString(createElement(TableView, { instance: instance(hist), view: fin, players: [], events: [], seq: 2, onEventsDone: noop, sound } as never))
    expect(done).toContain('Final Score')
    expect(done.match(/data-crown-col/g)).toHaveLength(3)
    expect(done).toContain('data-series')
  })

  it('phone: a full-screen trackpad while live; "You’re out" when eliminated; Rematch for the admin at the end', () => {
    const v = views(4)
    const pv = klaskModule.playerView(v.state, 1, v.seats) as KlaskPlayerView
    const base = { instance: instance(), playerOrder: 1, me: undefined, players: [], sendAction: async () => true, pending: false, error: null, clearError: noop }
    const live = renderToString(createElement(PhoneView, { ...base, view: pv } as never))
    expect(live).toContain('data-trackpad')
    expect(live).toContain('touch-action:none')
    const out = renderToString(createElement(PhoneView, { ...base, view: { ...pv, alive: false } } as never))
    expect(out).toContain('You’re out')
    expect(out).not.toContain('data-trackpad')
    const fin = renderToString(createElement(PhoneView, { ...base, view: { ...pv, finished: true, result: { winners: [1] } }, rematch: async () => true } as never))
    expect(fin).toContain('Rematch')
    expect(fin).toContain('data-crown-col')
  })
})
