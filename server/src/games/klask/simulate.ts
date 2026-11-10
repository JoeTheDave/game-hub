import { seededRng, type Rng, type SeatInfo } from '../types.js'
import { AUTHORITY_SEAT, klaskModule, type KlaskState } from './engine.js'
import { STEP, STRIKER_R, boardGeometry, createWorld, resetRound, step, type Inputs, type World } from './physics.js'

/**
 * A simple bot: shadow the ball from the goal side and push it away from its own goal, with a
 * little noise so games vary. Good enough to exercise the physics and the scoring headlessly.
 */
export function botTarget(world: World, seat: number, rng: Rng): { x: number; y: number } {
  const geo = boardGeometry(world.players)
  const goal = geo.goals[seat]
  const b = world.ball
  const dx = b.x - goal.x
  const dy = b.y - goal.y
  const d = Math.hypot(dx, dy) || 1
  // Sit just behind the ball (on the goal side), so moving through it sends it away from the goal.
  const back = STRIKER_R + 6
  let x = b.x - (dx / d) * back + (rng() - 0.5) * 24
  let y = b.y - (dy / d) * back + (rng() - 0.5) * 24
  // Never park over your own hole (that's a Klask): keep a margin around it.
  const gx = x - goal.x
  const gy = y - goal.y
  const gd = Math.hypot(gx, gy)
  const keep = goal.r + STRIKER_R * 0.6
  if (gd < keep) {
    x = goal.x + ((gd ? gx / gd : 1) * keep)
    y = goal.y + ((gd ? gy / gd : 0) * keep)
  }
  // Stay off the biscuits on the centre: hold back a little from the middle of the table.
  const cd = Math.hypot(x, y)
  if (cd < 70 && Math.hypot(b.x, b.y) > 70) {
    x *= 70 / (cd || 1)
    y *= 70 / (cd || 1)
  }
  return { x, y }
}

export interface KlaskSimResult {
  state: KlaskState
  steps: number
  points: number
  /** True when the step cap was hit before the match ended. */
  stalled: boolean
  /** Lowest life total seen (must never go below 0). */
  minLives: number
}

/** Play one whole match with bots: physics on the "TV", points through the engine (as the authority). */
export function simulateMatch(opts: { players: number; seed: number; maxSteps?: number; stallSteps?: number }): KlaskSimResult {
  const rng = seededRng(opts.seed)
  const seats: SeatInfo[] = Array.from({ length: opts.players }, (_, i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))
  let { state } = klaskModule.setup(seats, rng)
  let world = createWorld(opts.players, state.alive, state.serveSeat)
  const maxSteps = opts.maxSteps ?? 400_000
  // A play with no point for this long counts as stuck; the table re-serves (as players would).
  const stallSteps = opts.stallSteps ?? Math.round(40 / STEP)
  let steps = 0
  let points = 0
  let sincePoint = 0
  let minLives = Math.min(...state.lives)
  while (!state.result && steps < maxSteps) {
    const inputs: Inputs = {}
    world.alive.forEach((a, seat) => {
      if (a) inputs[seat] = botTarget(world, seat, rng)
    })
    const r = step(world, inputs)
    world = r.world
    steps++
    sincePoint++
    const pt = r.events.find((e) => e.type === 'point')
    if (pt && pt.type === 'point') {
      const res = klaskModule.applyAction(state, AUTHORITY_SEAT, { type: 'point', against: pt.against, reason: pt.reason }, rng)
      if (!res.ok) throw new Error(`Point rejected: ${res.error}`)
      state = res.state
      points++
      sincePoint = 0
      minLives = Math.min(minLives, ...state.lives)
      if (!state.result) world = resetRound(world, state.serveSeat, state.alive)
    } else if (sincePoint >= stallSteps) {
      world = resetRound(world, state.serveSeat, state.alive)
      sincePoint = 0
    }
  }
  return { state, steps, points, stalled: !state.result, minLives }
}
