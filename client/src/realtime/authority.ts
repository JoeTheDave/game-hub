import { fetchApi } from '../lib/api'
import type { GameInstance } from '../types/game'

/**
 * Real-time games: the TV (the logged-in host's browser) reports an outcome, e.g.
 * postAuthorityAction(id, { type: 'point', against: 2 }). The server applies it with the game's
 * engine as AUTHORITY_SEAT and broadcasts as usual. Returns the updated lobby-safe instance.
 */
export async function postAuthorityAction(
  id: string,
  action: unknown,
  version?: number
): Promise<{ ok: true; instance: GameInstance } | { ok: false; status: number; error: string }> {
  const res = await fetchApi(`/api/games/instances/${id}/authority-action`, {
    method: 'POST',
    body: JSON.stringify(version == null ? { action } : { action, version }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, status: res.status, error: (body as { error?: string }).error ?? 'Failed' }
  return { ok: true, instance: body as GameInstance }
}
