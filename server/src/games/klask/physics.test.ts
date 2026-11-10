import { describe, expect, it } from 'vitest'
import { seededRng } from '../types.js'
import {
  BALL_R,
  BISCUIT_R,
  MAGNET_GRACE_STEPS,
  STRIKER_R,
  boardGeometry,
  clampToZone,
  createWorld,
  resetRound,
  step,
  zoneBounds,
  zoneOf,
  type BoardGeometry,
  type Inputs,
  type World,
} from './physics.js'
import { botTarget } from './simulate.js'

const insideBoard = (g: BoardGeometry, x: number, y: number, r: number) =>
  g.shape === 'rect' ? Math.abs(x) <= g.halfW - r + 1e-6 && Math.abs(y) <= g.halfH - r + 1e-6 : Math.hypot(x, y) <= g.radius - r + 1e-6

function run(world: World, n: number, inputs: (w: World, i: number) => Inputs) {
  let w = world
  const events: ReturnType<typeof step>['events'] = []
  for (let i = 0; i < n; i++) {
    const r = step(w, inputs(w, i))
    w = r.world
    events.push(...r.events)
  }
  return { w, events }
}

describe('klask board geometry', () => {
  it.each([2, 3, 4])('%i players: zones, goals, serves, spawns and homes are consistent', (n) => {
    const g = boardGeometry(n)
    expect(g.shape).toBe(n === 2 ? 'rect' : 'circle')
    expect(g.goals).toHaveLength(n)
    expect(g.biscuitSpawns).toHaveLength(n + 1)
    for (let seat = 0; seat < n; seat++) {
      const goal = g.goals[seat]
      expect(goal.seat).toBe(seat)
      expect(zoneOf(g, goal.x, goal.y)).toBe(seat)
      expect(insideBoard(g, goal.x, goal.y, goal.r)).toBe(true)
      expect(zoneOf(g, g.serveSpots[seat].x, g.serveSpots[seat].y)).toBe(seat)
      expect(zoneOf(g, g.homeSpots[seat].x, g.homeSpots[seat].y)).toBe(seat)
      // a home spot is a legal striker position, and not over its own goal
      const h = clampToZone(g, seat, g.homeSpots[seat].x, g.homeSpots[seat].y)
      expect(Math.hypot(h.x - g.homeSpots[seat].x, h.y - g.homeSpots[seat].y)).toBeLessThan(1e-6)
      expect(Math.hypot(h.x - goal.x, h.y - goal.y)).toBeGreaterThan(goal.r)
    }
    for (const s of g.biscuitSpawns) expect(insideBoard(g, s.x, s.y, BISCUIT_R)).toBe(true)
  })

  it.each([2, 3, 4])('%i players: zones partition the table', (n) => {
    const g = boardGeometry(n)
    const rng = seededRng(n)
    const counts = Array.from({ length: n }, () => 0)
    for (let i = 0; i < 4000; i++) {
      const x = (rng() * 2 - 1) * g.halfW
      const y = (rng() * 2 - 1) * g.halfH
      if (!insideBoard(g, x, y, 0)) continue
      const z = zoneOf(g, x, y)
      expect(z).toBeGreaterThanOrEqual(0)
      expect(z).toBeLessThan(n)
      counts[z]++
    }
    const avg = counts.reduce((a, b) => a + b, 0) / n
    for (const c of counts) expect(Math.abs(c - avg) / avg).toBeLessThan(0.15)
  })

  it.each([2, 3, 4])('%i players: clampToZone keeps strikers in their own zone and on the table', (n) => {
    const g = boardGeometry(n)
    const rng = seededRng(10 + n)
    for (let seat = 0; seat < n; seat++) {
      const b = zoneBounds(g, seat)
      expect(b.maxX).toBeGreaterThan(b.minX)
      expect(b.maxY).toBeGreaterThan(b.minY)
      for (let i = 0; i < 500; i++) {
        const p = clampToZone(g, seat, (rng() * 2 - 1) * 400, (rng() * 2 - 1) * 400)
        expect(insideBoard(g, p.x, p.y, STRIKER_R)).toBe(true)
        expect(zoneOf(g, p.x, p.y)).toBe(seat)
        expect(p.x).toBeGreaterThanOrEqual(b.minX - 1e-6)
        expect(p.x).toBeLessThanOrEqual(b.maxX + 1e-6)
      }
    }
    expect(clampToZone(g, 0, NaN, 3)).toEqual(g.homeSpots[0])
  })
})

describe('klask physics', () => {
  it.each([2, 3, 4])('%i players: invariants hold through bot play, and the ball crosses zones', (n) => {
    const g = boardGeometry(n)
    const rng = seededRng(100 + n)
    let w = createWorld(n, undefined, 0)
    const zonesVisited = new Set<number>()
    for (let i = 0; i < 6000; i++) {
      const inputs: Inputs = {}
      w.alive.forEach((a, seat) => {
        if (a) inputs[seat] = botTarget(w, seat, rng)
      })
      const r = step(w, inputs)
      w = r.world
      expect(w.biscuits).toHaveLength(n + 1)
      expect(insideBoard(g, w.ball.x, w.ball.y, BALL_R)).toBe(true)
      for (const b of w.biscuits) expect(insideBoard(g, b.x, b.y, BISCUIT_R)).toBe(true)
      for (const s of w.strikers) {
        if (!s) continue
        expect(insideBoard(g, s.x, s.y, STRIKER_R)).toBe(true)
        expect(zoneOf(g, s.x, s.y)).toBe(s.seat)
      }
      zonesVisited.add(zoneOf(g, w.ball.x, w.ball.y))
      const pt = r.events.find((e) => e.type === 'point')
      if (pt && pt.type === 'point') w = resetRound(w, pt.against)
    }
    expect(zonesVisited.size).toBeGreaterThanOrEqual(2)
  })

  it('is deterministic: the same inputs give the same world', () => {
    const play = () => {
      const rng = seededRng(7)
      return run(createWorld(4, undefined, 1), 1500, (w) => {
        const inp: Inputs = {}
        w.alive.forEach((a, s) => {
          if (a) inp[s] = botTarget(w, s, rng)
        })
        return inp
      }).w
    }
    expect(play()).toEqual(play())
    const w = play()
    expect(JSON.parse(JSON.stringify(w))).toEqual(w)
  })

  it('a ball sitting in a goal concedes for that goal’s owner, once', () => {
    const w0 = createWorld(2, undefined, 0)
    const g = boardGeometry(2)
    const w = { ...w0, ball: { x: g.goals[1].x, y: g.goals[1].y, vx: 0, vy: 0 } }
    const r = step(w, {})
    expect(r.events).toContainEqual({ type: 'point', against: 1, reason: 'goal' })
    expect(r.world.phase).toBe('scored')
    // one point per play: nothing more until reset
    const r2 = step(r.world, {})
    expect(r2.events.filter((e) => e.type === 'point')).toHaveLength(0)
    expect(resetRound(r2.world, 1).phase).toBe('play')
  })

  it('a ball flying fast over a hole skips it', () => {
    const w0 = createWorld(2, undefined, 0)
    const g = boardGeometry(2)
    const w = { ...w0, ball: { x: g.goals[1].x, y: g.goals[1].y - 12, vx: 0, vy: 4000 } }
    expect(step(w, {}).events.filter((e) => e.type === 'point')).toHaveLength(0)
  })

  it('a striker driven over its own hole is a Klask', () => {
    const g = boardGeometry(3)
    const w = createWorld(3, undefined, 1)
    const { events } = run(w, 60, () => ({ 0: { x: g.goals[0].x, y: g.goals[0].y } }))
    expect(events).toContainEqual({ type: 'point', against: 0, reason: 'klask' })
  })

  it('two biscuits stuck to a striker concede a point; magnets wait out the grace period', () => {
    const g = boardGeometry(2)
    let w = createWorld(2, undefined, 0)
    const s = w.strikers[0]!
    const near = (dy: number) => ({ x: s.x + STRIKER_R + BISCUIT_R + 4, y: s.y + dy, vx: 0, vy: 0, on: null })
    w = { ...w, biscuits: [near(-10), near(10), { ...g.biscuitSpawns[2], vx: 0, vy: 0, on: null }] }
    // during the grace period the magnet does nothing
    const early = run(w, MAGNET_GRACE_STEPS - 5, () => ({}))
    expect(early.w.strikers[0]!.attached).toHaveLength(0)
    const later = run(early.w, 60, () => ({}))
    expect(later.events).toContainEqual({ type: 'point', against: 0, reason: 'biscuits' })
  })

  it('eliminated players have no striker and their goal is closed', () => {
    const g = boardGeometry(4)
    const w0 = createWorld(4, [true, false, true, true], 0)
    expect(w0.strikers[1]).toBeNull()
    const w = { ...w0, ball: { x: g.goals[1].x, y: g.goals[1].y, vx: 0, vy: 0 } }
    expect(step(w, {}).events.filter((e) => e.type === 'point')).toHaveLength(0)
  })

  it('reports performance (steps per second)', () => {
    const rng = seededRng(3)
    let w = createWorld(4, undefined, 0)
    const t = performance.now()
    const N = 20000
    for (let i = 0; i < N; i++) {
      const inp: Inputs = {}
      w.alive.forEach((a, s) => {
        if (a) inp[s] = botTarget(w, s, rng)
      })
      const r = step(w, inp)
      w = r.world.phase === 'scored' ? resetRound(r.world, r.world.point!.against) : r.world
    }
    const sps = N / ((performance.now() - t) / 1000)
    console.log(`klask physics: ${Math.round(sps)} steps/sec (4 players, with bots)`)
    expect(sps).toBeGreaterThan(5000) // the TV needs 120
  })
})
