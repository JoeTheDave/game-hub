import type { GameModule } from './types.js'
import ticTacToe from './tic-tac-toe/index.js'
import splendor from './splendor/index.js'

/**
 * Every playable game. Adding a game = one line here (plus its client registry entry).
 * The server upserts a Game row for each entry on boot, so no migration is needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<string, GameModule<any, any>> = {
  [ticTacToe.slug]: ticTacToe,
  [splendor.slug]: splendor,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGame(slug: string): GameModule<any, any> | undefined {
  return Object.prototype.hasOwnProperty.call(GAMES, slug) ? GAMES[slug] : undefined
}
