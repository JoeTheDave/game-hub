import type { ClientGameModule } from './types'

/**
 * Every game's client module, lazy-loaded so each game ships in its own chunk.
 * Adding a game = one line here (plus its server registry entry).
 */
const GAMES: Record<string, () => Promise<{ default: ClientGameModule }>> = {
  'tic-tac-toe': () => import('./tic-tac-toe'),
  splendor: () => import('./splendor'),
  dragonheart: () => import('./dragonheart'),
  onitama: () => import('./onitama'),
}

export function hasGame(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(GAMES, slug)
}

export async function loadGame(slug: string): Promise<ClientGameModule | null> {
  if (!hasGame(slug)) return null
  return (await GAMES[slug]()).default
}

/**
 * Each game's cover art (client/src/games/<slug>/cover.webp), loaded eagerly as plain URLs so the
 * home page can show every game without loading any game module.
 */
const COVERS = Object.fromEntries(
  Object.entries(
    import.meta.glob('./*/cover.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
  ).map(([path, url]) => [path.split('/')[1], url])
)

export function gameCover(slug: string): string | null {
  return COVERS[slug] ?? null
}
