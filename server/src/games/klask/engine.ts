import type { ActionResult, GameEvent, GameModule, GameOption, GameSummary, Rng, SeatInfo } from '../types.js'
import type { PointReason } from './physics.js'

/**
 * Klask: a real-time game. Live play (the physics) runs on the TV, which is the authority; this
 * engine only keeps the score. The TV reports discrete results as AUTHORITY_SEAT actions through
 * the platform's authority route (host session); phones can't send any action.
 *
 * Scoring: every player starts with 6 lives and loses one per point conceded (ball in their goal,
 * their striker falling into their own goal = "Klask", or 2+ biscuits stuck to their striker).
 * At 0 a player is out; the last player standing wins. With 2 players this is exactly "first to 6".
 */

export const AUTHORITY_SEAT = -1
export const START_LIVES = 6
export const REASONS: readonly PointReason[] = ['goal', 'klask', 'biscuits']

export const OPTIONS: GameOption[] = [{ key: 'stylized', label: 'Stylized table', type: 'boolean', default: false }]

export interface KlaskState {
  players: number
  lives: number[]
  alive: boolean[]
  stylized: boolean
  /** The seat that serves the next play (the last player to concede, while still in). */
  serveSeat: number
  /** Plays completed so far. */
  round: number
  lastPoint: { against: number; reason: PointReason; eliminated: boolean } | null
  result: { winners: number[] } | null
}

export type KlaskAction = { type: 'point'; against: number; reason: PointReason } | { type: 'serve' }

export interface KlaskPlayer {
  seat: number
  name: string
  color: string | null
  lives: number
  alive: boolean
  /** Points scored against the others (2 players: the familiar "first to 6" score). */
  score: number
}

export interface KlaskTableView {
  players: KlaskPlayer[]
  playerCount: number
  stylized: boolean
  serveSeat: number
  round: number
  lastPoint: KlaskState['lastPoint']
  result: KlaskState['result']
  finished: boolean
  startLives: number
}

export interface KlaskPlayerView extends KlaskTableView {
  me: number
  alive: boolean
}

function setup(players: SeatInfo[], rng: Rng, options?: unknown): { state: KlaskState; events: GameEvent[] } {
  const n = players.length
  if (n < 2 || n > 4) throw new Error('Klask needs 2-4 players')
  const opts = (options && typeof options === 'object' ? options : {}) as Record<string, unknown>
  const serveSeat = Math.floor(rng() * n)
  const state: KlaskState = {
    players: n,
    lives: Array.from({ length: n }, () => START_LIVES),
    alive: Array.from({ length: n }, () => true),
    stylized: opts.stylized === true,
    serveSeat,
    round: 0,
    lastPoint: null,
    result: null,
  }
  return { state, events: [{ type: 'gameStarted', players: n, serveSeat }] }
}

function nextAlive(alive: boolean[], from: number): number {
  for (let i = 1; i <= alive.length; i++) {
    const s = (from + i) % alive.length
    if (alive[s]) return s
  }
  return -1
}

function applyAction(state: KlaskState, playerOrder: number, action: KlaskAction, _rng: Rng): ActionResult<KlaskState> {
  if (playerOrder !== AUTHORITY_SEAT) return { ok: false, error: 'Only the table reports Klask results' }
  if (!action || typeof action !== 'object') return { ok: false, error: 'Invalid action' }
  if (state.result) return { ok: false, error: 'The game is over' }
  if (action.type === 'serve') {
    return { ok: true, state, events: [{ type: 'serve', seat: state.serveSeat }] }
  }
  if (action.type !== 'point') return { ok: false, error: 'Unknown action' }
  const against = action.against
  if (typeof against !== 'number' || !Number.isInteger(against) || against < 0 || against >= state.players) {
    return { ok: false, error: 'Invalid player' }
  }
  if (!REASONS.includes(action.reason)) return { ok: false, error: 'Invalid reason' }
  if (!state.alive[against]) return { ok: false, error: 'That player is already out' }

  const lives = state.lives.slice()
  const alive = state.alive.slice()
  lives[against] = Math.max(0, lives[against] - 1)
  const eliminated = lives[against] === 0
  if (eliminated) alive[against] = false
  const events: GameEvent[] = [{ type: 'pointScored', against, reason: action.reason, lives: lives[against] }]
  if (eliminated) events.push({ type: 'eliminated', seat: against })
  const remaining = alive.flatMap((a, s) => (a ? [s] : []))
  const result = remaining.length <= 1 ? { winners: remaining } : null
  if (result) events.push({ type: 'gameOver', winners: result.winners })
  const serveSeat = alive[against] ? against : nextAlive(alive, against)
  return {
    ok: true,
    state: {
      ...state,
      lives,
      alive,
      serveSeat: serveSeat < 0 ? state.serveSeat : serveSeat,
      round: state.round + 1,
      lastPoint: { against, reason: action.reason, eliminated },
      result,
    },
    events,
  }
}

function legalActions(state: KlaskState, playerOrder: number): KlaskAction[] {
  if (playerOrder !== AUTHORITY_SEAT || state.result) return []
  const out: KlaskAction[] = []
  state.alive.forEach((a, against) => {
    if (a) for (const reason of REASONS) out.push({ type: 'point', against, reason })
  })
  out.push({ type: 'serve' })
  return out
}

function tableView(state: KlaskState, players: SeatInfo[]): KlaskTableView {
  const scored = (seat: number) =>
    state.players === 2 ? START_LIVES - state.lives[1 - seat] : state.lives.reduce((t, l, s) => (s === seat ? t : t + (START_LIVES - l)), 0)
  return {
    players: state.lives.map((lives, seat) => {
      const info = players.find((p) => p.playerOrder === seat)
      return { seat, name: info?.screenName ?? `Player ${seat + 1}`, color: info?.color ?? null, lives, alive: state.alive[seat], score: scored(seat) }
    }),
    playerCount: state.players,
    stylized: state.stylized,
    serveSeat: state.serveSeat,
    round: state.round,
    lastPoint: state.lastPoint,
    result: state.result,
    finished: !!state.result,
    startLives: START_LIVES,
  }
}

function playerView(state: KlaskState, playerOrder: number, players: SeatInfo[]): KlaskPlayerView {
  return { ...tableView(state, players), me: playerOrder, alive: !!state.alive[playerOrder] }
}

function summary(state: KlaskState): GameSummary | null {
  if (!state.result) return null
  return { scores: state.alive.map((_, s) => (state.result!.winners.includes(s) ? 1 : 0)), winners: state.result.winners.slice() }
}

export const klaskModule: GameModule<KlaskState, KlaskAction> & { realtime: true } = {
  slug: 'klask',
  name: 'Klask',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: true,
  options: OPTIONS,
  setup,
  applyAction,
  tableView,
  playerView,
  isFinished: (s) => !!s.result,
  // The table (authority) is the only "seat" that ever acts; returning it keeps the generic
  // headless simulator working (it then reports random points).
  activeSeats: (s) => (s.result ? [] : [AUTHORITY_SEAT]),
  legalActions,
  winners: (s) => s.result?.winners.slice() ?? [],
  summary,
}
