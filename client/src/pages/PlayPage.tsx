import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { loadSeat } from '../lib/seat'
import { PHONE_SCREEN_CLASS } from '../lib/phoneScreen'
import { useSeatFeed } from '../hooks/useSeatFeed'
import { useGameModule } from '../hooks/useGameModule'
import { useWakeLock } from '../hooks/useWakeLock'
import { PhoneLobby } from '../components/PhoneLobby'
import type { GameInstance } from '../types/game'

function Message({ children }: { children: React.ReactNode }) {
  return <div className={`${PHONE_SCREEN_CLASS} items-center justify-center px-6 text-center text-slate-400`}>{children}</div>
}

/** A player's phone: the shared lobby, then the game's PhoneView. Never scrolls. */
export function PlayPage() {
  // A phone in a game stays awake while it's open and visible.
  useWakeLock()
  const { gameSlug, id } = useParams<{ gameSlug: string; id: string }>()
  const navigate = useNavigate()
  const seat = useMemo(() => (id ? loadSeat(id) : null), [id])
  const { instance, playerView, error, loading, acceptInstance, acceptView, resync } = useSeatFeed(id ?? null, seat)
  const mod = useGameModule(gameSlug)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // No seat on this device: send them through the join page while the lobby is open.
  const notSeated = !seat || error === 'not-seated'
  useEffect(() => {
    if (!notSeated || !id) return
    fetchApi(`/api/games/instances/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((inst: GameInstance | null) => {
        if (inst?.phase === 'lobby') navigate(`/join/${inst.joinCode}`, { replace: true })
      })
      .catch(() => {})
  }, [notSeated, id, navigate])

  const sendAction = useCallback(
    async (action: unknown) => {
      if (!id || !seat) return false
      setPending(true)
      setActionError(null)
      try {
        const res = await fetchApi(`/api/games/instances/${id}/action`, {
          method: 'POST',
          body: JSON.stringify({ playerOrder: seat.playerOrder, joinToken: seat.joinToken, action }),
        })
        const data = await res.json().catch(() => ({}))
        if (data.playerView !== undefined && typeof data.version === 'number') acceptView(data.playerView, data.version)
        if (!res.ok) {
          setActionError(data.error || 'That move failed')
          return false
        }
        return true
      } catch {
        setActionError('Connection problem — try again')
        return false
      } finally {
        setPending(false)
      }
    },
    [id, seat, acceptView]
  )

  // Rematch (seat 0 only, once the game is over): the same instance restarts, so every screen
  // follows along over its socket with no navigation.
  const rematch = useCallback(async () => {
    if (!id || !seat) return false
    setActionError(null)
    try {
      const res = await fetchApi(`/api/games/instances/${id}/rematch`, {
        method: 'POST',
        body: JSON.stringify({ joinToken: seat.joinToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data.error || 'Could not start a rematch')
        return false
      }
      acceptInstance(data as GameInstance)
      void resync() // this seat's fresh playerView (the socket also pushes it)
      return true
    } catch {
      setActionError('Connection problem — try again')
      return false
    }
  }, [id, seat, acceptInstance, resync])

  if (notSeated) {
    return (
      <Message>
        <p className="mb-3">You&apos;re not seated in this game on this device.</p>
        <Link to="/" className="text-amber-400 text-sm">
          Back home
        </Link>
      </Message>
    )
  }
  if (error) return <Message>{error}</Message>
  if (loading || !instance) return <Message>Loading…</Message>
  if (mod === null) return <Message>Game type &quot;{gameSlug}&quot; not found.</Message>

  if (instance.phase === 'lobby') {
    return (
      <div className={PHONE_SCREEN_CLASS}>
        <PhoneLobby instance={instance} seat={seat!} onInstance={acceptInstance} />
      </div>
    )
  }
  if (mod === undefined || playerView == null) return <Message>Loading…</Message>

  const { PhoneView } = mod
  return (
    <div className={PHONE_SCREEN_CLASS}>
      <PhoneView
        instance={instance}
        view={playerView}
        playerOrder={seat!.playerOrder}
        me={instance.players.find((p) => p.playerOrder === seat!.playerOrder)}
        players={instance.players}
        sendAction={sendAction}
        pending={pending}
        error={actionError}
        clearError={() => setActionError(null)}
        rematch={instance.phase === 'finished' && seat!.playerOrder === 0 ? rematch : undefined}
      />
    </div>
  )
}
