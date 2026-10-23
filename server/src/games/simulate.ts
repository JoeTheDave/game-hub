import type { GameModule, Rng, SeatInfo } from './types.js'
import { seededRng } from './types.js'

/**
 * An agent sees exactly what that seat's phone would see, plus the legal actions. Building the
 * view costs time, so agents that ignore it (like randomAgent) set `needsView = false`.
 */
export type Agent<A> = ((view: unknown, legal: A[], rng: Rng) => A) & { needsView?: boolean }

export const randomAgent: Agent<unknown> = Object.assign(
  (_view: unknown, legal: unknown[], rng: Rng) => legal[Math.floor(rng() * legal.length)],
  { needsView: false }
)

export interface SimulationResult<S, A> {
  seed: number
  finalState: S
  winners: number[]
  turns: number
  /** True when the game hit maxSteps before finishing (a stalemate), rather than crashing. */
  stalled: boolean
  log: { seat: number; action: A }[]
}

export function simulate<S, A>(
  game: GameModule<S, A>,
  opts: { players: number; seed: number; agents?: Agent<A>[]; maxSteps?: number; options?: unknown }
): SimulationResult<S, A> {
  const rng = seededRng(opts.seed)
  // Agents get their own stream so replay (which has no agents) consumes the engine rng identically.
  const agentRng = seededRng(opts.seed ^ 0x9e3779b9)
  const seats: SeatInfo[] = Array.from({ length: opts.players }, (_, i) => ({
    playerOrder: i,
    screenName: `P${i + 1}`,
    color: null,
  }))
  const agents = opts.agents ?? seats.map(() => randomAgent as Agent<A>)
  let { state } = game.setup(seats, rng, opts.options)
  const log: { seat: number; action: A }[] = []
  const maxSteps = opts.maxSteps ?? 5000
  let steps = 0
  while (!game.isFinished(state) && steps < maxSteps) {
    const seat = game.activeSeats(state)[0]
    if (seat == null) throw new Error('Engine is waiting on no seat but is not finished')
    const legal = game.legalActions(state, seat)
    if (legal.length === 0) throw new Error(`Seat ${seat} has no legal actions`)
    const agent = agents[seat]
    const view = agent.needsView === false ? undefined : game.playerView(state, seat, seats)
    const action = agent(view, legal, agentRng)
    const res = game.applyAction(state, seat, action, rng)
    if (!res.ok) throw new Error(`Legal action rejected: ${res.error} ${JSON.stringify(action)}`)
    state = res.state
    log.push({ seat, action })
    steps++
  }
  return {
    seed: opts.seed,
    finalState: state,
    winners: game.winners(state),
    turns: steps,
    stalled: !game.isFinished(state),
    log,
  }
}

/** Re-applies a logged game from its seed. Used to prove determinism. */
export function replay<S, A>(game: GameModule<S, A>, players: number, seed: number, log: { seat: number; action: A }[], options?: unknown): S {
  const rng = seededRng(seed)
  const seats: SeatInfo[] = Array.from({ length: players }, (_, i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))
  let { state } = game.setup(seats, rng, options)
  for (const { seat, action } of log) {
    const res = game.applyAction(state, seat, action, rng)
    if (!res.ok) throw new Error(`Replay diverged: ${res.error}`)
    state = res.state
  }
  return state
}
