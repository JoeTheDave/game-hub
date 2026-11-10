import type { GameModule } from '../games/types.js'
import { AUTHORITY_SEAT } from '../games/types.js'
import { GAMES } from '../games/registry.js'
import { syncGameCatalog } from '../lib/gameInstances.js'

/**
 * Test-only real-time game: two seats with 2 lives each; only the table (AUTHORITY_SEAT) may
 * report a point against a seat. Unlisted, so it never shows in the catalog.
 */
interface S {
  lives: number[]
}
type A = { type: 'point'; against: number }

export const rtTestGame: GameModule<S, A> = {
  slug: 'rt-test',
  name: 'Realtime Test',
  minPlayers: 2,
  maxPlayers: 2,
  listed: false,
  realtime: true,
  setup: (players) => ({ state: { lives: players.map(() => 2) }, events: [] }),
  applyAction(state, actor, action) {
    if (actor !== AUTHORITY_SEAT) return { ok: false, error: 'Only the table reports points' }
    if (!action || action.type !== 'point' || typeof action.against !== 'number' || !(action.against in state.lives)) {
      return { ok: false, error: 'Bad action' }
    }
    if (this.isFinished(state)) return { ok: false, error: 'Game over' }
    const lives = state.lives.map((l, i) => (i === action.against ? l - 1 : l))
    return { ok: true, state: { lives }, events: [{ type: 'point', against: action.against }] }
  },
  tableView: (s) => s,
  playerView: (s) => s,
  isFinished: (s) => s.lives.some((l) => l <= 0),
  activeSeats: () => [],
  legalActions: () => [],
  winners: (s) => (s.lives.some((l) => l <= 0) ? s.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0) : []),
  summary(s) {
    if (!this.isFinished(s)) return null
    return { scores: s.lives.map((l) => (l > 0 ? 1 : 0)), winners: this.winners(s) }
  },
}

/** Register the test game (and its catalog row) for the duration of a test file. */
export async function registerRtTestGame() {
  ;(GAMES as Record<string, unknown>)[rtTestGame.slug] = rtTestGame
  await syncGameCatalog()
}

export function unregisterRtTestGame() {
  delete (GAMES as Record<string, unknown>)[rtTestGame.slug]
}
