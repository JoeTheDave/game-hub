/**
 * The contract every game implements. Engines are pure TypeScript: no Express, Prisma,
 * sockets, React, clock or global randomness. State and actions are plain JSON data, so a
 * game can be driven headlessly (see simulate.ts) as easily as through the UI.
 */

export interface SeatInfo {
  playerOrder: number
  screenName: string
  color: string | null
}

/** Describes what visibly happened, so the TV can animate it and play sounds. Must contain no hidden info. */
export interface GameEvent {
  type: string
  [k: string]: unknown
}

export type ActionResult<S> = { ok: true; state: S; events: GameEvent[] } | { ok: false; error: string }

export type Rng = () => number

export interface GameModule<S, A> {
  slug: string
  name: string
  minPlayers: number
  maxPlayers: number
  /**
   * Shown in the game catalog (home page, Create Game). Default true. An unlisted game keeps its
   * code, tests and existing instances, but no new instance can be created through the API.
   */
  listed?: boolean
  /**
   * Optional per-game settings chosen in the lobby (by the host or the admin player) and passed
   * to `setup` as `options` (a `Record<key, boolean>` with defaults filled in). Rematches keep them.
   */
  options?: GameOption[]
  /** Called on Start with the seated players (ordered by playerOrder). Deterministic given rng. */
  setup(players: SeatInfo[], rng: Rng, options?: unknown): { state: S; events: GameEvent[] }
  /** Validate + apply one action from a seat. Pure: never mutates the input state. */
  applyAction(state: S, playerOrder: number, action: A, rng: Rng): ActionResult<S>
  /** Everything the shared table screen may see (no hidden info). */
  tableView(state: S, players: SeatInfo[]): unknown
  /** Everything one phone may see: public info + that seat's private info. */
  playerView(state: S, playerOrder: number, players: SeatInfo[]): unknown
  isFinished(state: S): boolean
  /** Seat(s) the engine is waiting on (usually one; empty when finished). */
  activeSeats(state: S): number[]
  /** Every concrete legal action for a seat right now (empty if it isn't their move). */
  legalActions(state: S, playerOrder: number): A[]
  /** Winning seats once finished (empty otherwise). */
  winners(state: S): number[]
  /**
   * Optional: a finished game's final scores per seat (index = playerOrder) and winners. The
   * platform records one per completed game, so a series of rematches can show a history table
   * and cumulative totals. Null while the game is unfinished.
   */
  summary?(state: S): GameSummary | null
}

/** A lobby setting a game offers. Only boolean (checkbox) options for now. */
export interface GameOption {
  key: string
  label: string
  type: 'boolean'
  default: boolean
}

export type GameOptionValues = Record<string, boolean>

/** The schema's defaults overlaid with any stored values whose key/type match the schema. */
export function resolveOptions(schema: GameOption[] | undefined, values: unknown): GameOptionValues {
  const out: GameOptionValues = {}
  const v = values && typeof values === 'object' ? (values as Record<string, unknown>) : {}
  for (const o of schema ?? []) out[o.key] = typeof v[o.key] === 'boolean' ? (v[o.key] as boolean) : o.default
  return out
}

/** One completed game's result, as recorded in an instance's match history. */
export interface GameSummary {
  scores: number[]
  winners: number[]
}

/** Deterministic seedable PRNG (mulberry32). Use for tests and simulation. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
