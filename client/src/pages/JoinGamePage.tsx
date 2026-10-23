import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { PHONE_SCREEN_CLASS } from '../lib/phoneScreen'
import { loadSeat, saveSeat } from '../lib/seat'
import type { GameInstance } from '../types/game'

/** Full viewport, no header. Auto-joins with "Player N" and redirects to the phone screen. */
export function JoinGamePage() {
  const { joinCode } = useParams<{ joinCode: string }>()
  const navigate = useNavigate()
  const [instance, setInstance] = useState<GameInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const triedJoin = useRef<string | null>(null)

  useEffect(() => {
    if (!joinCode) {
      setLoading(false)
      return
    }
    fetchApi(`/api/games/instances/by-code/${joinCode.toUpperCase()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Game not found')
        return res.json()
      })
      .then(setInstance)
      .catch(() => setError('Game not found'))
      .finally(() => setLoading(false))
  }, [joinCode])

  useEffect(() => {
    if (!instance || joining || error || triedJoin.current === instance.id) return
    const playPath = `/play/${instance.game.slug}/${instance.id}`

    triedJoin.current = instance.id
    setJoining(true)
    ;(async () => {
      // Already seated on this device (e.g. re-scanned the QR) with a seat the server still accepts: go straight back.
      const seat = loadSeat(instance.id)
      if (seat) {
        const qs = new URLSearchParams({ playerOrder: String(seat.playerOrder), joinToken: seat.joinToken })
        const me = await fetchApi(`/api/games/instances/${instance.id}/me?${qs}`).catch(() => null)
        if (me?.ok) return { seated: true as const }
      }
      if (instance.phase !== 'lobby' || instance.players.length >= instance.game.maxPlayers) return { seated: false as const }
      const res = await fetchApi(`/api/games/instances/${instance.id}/join`, { method: 'POST', body: JSON.stringify({ screenName: '' }) })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to join')
      }
      const { player } = (await res.json()) as { player: { playerOrder: number; joinToken: string } }
      saveSeat(instance.id, { playerOrder: player.playerOrder, joinToken: player.joinToken })
      return { seated: true as const }
    })()
      .then(({ seated }) => {
        if (seated) navigate(playPath, { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to join'))
      .finally(() => setJoining(false))
  }, [instance, joining, error, navigate])

  const message = (text: string, tone = 'text-slate-300') => (
    <div className={`${PHONE_SCREEN_CLASS} items-center justify-center px-4 text-center`}>
      <p className={`${tone} mb-3 text-sm`}>{text}</p>
      <Link to="/" className="text-amber-400 hover:text-amber-300 text-sm">
        Back home
      </Link>
    </div>
  )

  if (loading) return <div className={`${PHONE_SCREEN_CLASS} items-center justify-center text-slate-400`}>Loading…</div>
  if (!instance) return message(error || 'Game not found', 'text-red-400')
  if (error) return message(error, 'text-red-400')
  if (!joining && instance.phase !== 'lobby') return message('This game has already started.')
  if (!joining && instance.players.length >= instance.game.maxPlayers) return message('This game is full.')

  return <div className={`${PHONE_SCREEN_CLASS} items-center justify-center text-slate-400`}>{joining ? 'Joining…' : 'Redirecting…'}</div>
}
