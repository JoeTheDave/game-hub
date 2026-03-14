import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import type { GameInstance } from '../types/game'

/** Full viewport, no header. Auto-joins with "Player N" and redirects to controller. */
const viewportClass = 'h-dvh max-h-dvh w-full overflow-hidden flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900'

export function JoinGamePage() {
  const { joinCode } = useParams<{ joinCode: string }>()
  const navigate = useNavigate()
  const [instance, setInstance] = useState<GameInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

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

  const triedJoinForInstanceId = React.useRef<string | null>(null)
  useEffect(() => {
    if (!instance || joining || error || triedJoinForInstanceId.current === instance.id) return
    const status = (instance.gameState as { status?: string } | null)?.status
    const requiredPlayerCount = (instance.gameState as { requiredPlayerCount?: number } | null)?.requiredPlayerCount ?? 2
    if (status !== 'lobby') return
    if (instance.players.length >= requiredPlayerCount) return

    const stored = (() => {
      try {
        const v = sessionStorage.getItem(`game:${instance.id}:playerOrder`)
        return v != null ? parseInt(v, 10) : undefined
      } catch {
        return undefined
      }
    })()
    if (stored !== undefined && stored >= 0 && instance.players.some((p) => p.playerOrder === stored)) {
      const gameSlug = instance.game?.slug ?? 'tic-tac-toe'
      navigate(`/play/${gameSlug}/${instance.id}`, { state: { playerOrder: stored } })
      return
    }

    triedJoinForInstanceId.current = instance.id
    setJoining(true)
    fetchApi(`/api/games/instances/${instance.id}/join`, {
      method: 'POST',
      body: JSON.stringify({ screenName: '' }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Failed to join')))
        return res.json()
      })
      .then(({ player }: { player: { playerOrder: number; joinToken?: string } }) => {
        try {
          sessionStorage.setItem(`game:${instance.id}:playerOrder`, String(player.playerOrder))
          if (player.joinToken) {
            sessionStorage.setItem(`game:${instance.id}:joinToken`, player.joinToken)
          }
        } catch {
          // ignore
        }
        const gameSlug = instance.game?.slug ?? 'tic-tac-toe'
        navigate(`/play/${gameSlug}/${instance.id}`, {
          state: { playerOrder: player.playerOrder, joinToken: player.joinToken },
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to join'))
      .finally(() => setJoining(false))
  }, [instance, joining, error, navigate])

  if (loading) {
    return (
      <div className={`${viewportClass} items-center justify-center text-slate-400`}>
        Loading…
      </div>
    )
  }
  if (!instance) {
    return (
      <div className={`${viewportClass} items-center justify-center px-4 text-center`}>
        {error && <p className="text-red-400 mb-3 text-sm">{error}</p>}
        <Link to="/" className="text-amber-400 hover:text-amber-300 text-sm">Back home</Link>
      </div>
    )
  }
  const status = (instance.gameState as { status?: string } | null)?.status
  const requiredPlayerCount = (instance.gameState as { requiredPlayerCount?: number } | null)?.requiredPlayerCount ?? 2
  if (status !== 'lobby') {
    return (
      <div className={`${viewportClass} items-center justify-center px-4 text-center`}>
        <p className="text-slate-300 mb-3 text-sm">This game has already started.</p>
        <Link to="/" className="text-amber-400 hover:text-amber-300 text-sm">Back home</Link>
      </div>
    )
  }
  if (instance.players.length >= requiredPlayerCount) {
    return (
      <div className={`${viewportClass} items-center justify-center px-4 text-center`}>
        <p className="text-slate-300 mb-3 text-sm">This game is full.</p>
        <Link to="/" className="text-amber-400 hover:text-amber-300 text-sm">Back home</Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${viewportClass} items-center justify-center px-4 text-center`}>
        <p className="text-red-400 mb-3 text-sm">{error}</p>
        <Link to="/" className="text-amber-400 hover:text-amber-300 text-sm">Back home</Link>
      </div>
    )
  }

  return (
    <div className={`${viewportClass} items-center justify-center text-slate-400`}>
      {joining ? 'Joining…' : 'Redirecting…'}
    </div>
  )
}
