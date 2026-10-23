import type { ClientGameModule } from './types'

/**
 * Every game's client module, lazy-loaded so each game ships in its own chunk.
 * Adding a game = one line here (plus its server registry entry).
 */
const GAMES: Record<string, () => Promise<{ default: ClientGameModule }>> = {
  'tic-tac-toe': () => import('./tic-tac-toe'),
  splendor: () => import('./splendor'),
}

export function hasGame(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(GAMES, slug)
}

export async function loadGame(slug: string): Promise<ClientGameModule | null> {
  if (!hasGame(slug)) return null
  return (await GAMES[slug]()).default
}
