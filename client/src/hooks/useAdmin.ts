import { useCallback } from 'react'
import { fetchApi } from '../lib/api'
import type { SeatCredentials } from '../lib/seat'
import type { GameInstance } from '../types/game'

/**
 * The admin role for this phone: whether it holds it, and the admin-only requests (lobby options,
 * handing the role on). The server re-checks every request against the admin seat's joinToken.
 */
export function useAdmin(instance: GameInstance | null, seat: SeatCredentials | null, onInstance: (i: GameInstance) => void) {
  const isAdmin = !!instance && !!seat && (instance.adminSeat ?? 0) === seat.playerOrder

  const post = useCallback(
    async (path: string, method: string, body: Record<string, unknown>) => {
      if (!instance || !seat) return false
      const res = await fetchApi(`/api/games/instances/${instance.id}/${path}`, {
        method,
        body: JSON.stringify({ playerOrder: seat.playerOrder, joinToken: seat.joinToken, ...body }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.id) onInstance(data as GameInstance)
      return res.ok
    },
    [instance, seat, onInstance]
  )

  const setOption = useCallback((key: string, value: boolean) => post('options', 'PATCH', { options: { [key]: value } }), [post])
  const promote = useCallback((newAdmin: number) => post('admin', 'POST', { newAdmin }), [post])

  return { isAdmin, setOption, promote }
}
