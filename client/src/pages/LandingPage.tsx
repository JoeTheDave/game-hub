import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchApi } from '../lib/api'
import { gameCover } from '../games/registry'
import type { Game } from '../types/game'

/**
 * GameHub's home: a gallery of large game cards (each just the game's cover art). Clicking one
 * creates a new game of that type and goes straight to its lobby.
 */
export function LandingPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchApi('/api/games')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load games'))))
      .then((data: Game[]) => {
        if (!cancelled) setGames(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the games. Try refreshing.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const open = async (game: Game) => {
    if (creating) return
    // Not signed in: log in first (the login page returns here).
    if (!user) {
      navigate('/login')
      return
    }
    setError('')
    setCreating(game.slug)
    try {
      const res = await fetchApi('/api/games/instances', { method: 'POST', body: JSON.stringify({ gameId: game.id }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create game')
      navigate(`/lobby/${game.slug}/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
      setCreating(null)
    }
  }

  return (
    <div className="w-full py-10">
      {error && <div className="max-w-4xl mx-auto mb-6 p-3 rounded-lg bg-red-500/20 text-red-200 text-sm text-center">{error}</div>}
      {loading || authLoading ? (
        <div className="py-24 text-center text-slate-400">Loading games…</div>
      ) : (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 sm:grid-cols-2 sm:gap-10">
          {games.map((g) => (
            <GameCard key={g.slug} game={g} busy={creating === g.slug} disabled={creating != null} onOpen={() => void open(g)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function GameCard({ game, busy, disabled, onOpen }: { game: Game; busy: boolean; disabled: boolean; onOpen: () => void }) {
  const cover = gameCover(game.slug)
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={`Play ${game.name}`}
      className={`group relative mx-auto block w-full max-w-md overflow-hidden rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10 transition duration-300 ${
        disabled && !busy ? 'cursor-default opacity-60' : 'cursor-pointer hover:-translate-y-2 hover:shadow-amber-500/20 hover:ring-amber-300/40'
      }`}
      style={{ aspectRatio: '3 / 4' }}
    >
      {cover ? (
        <img
          src={cover}
          alt={game.name}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-3xl font-bold text-white">
          {game.name}
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">Setting up…</div>
      )}
    </button>
  )
}
