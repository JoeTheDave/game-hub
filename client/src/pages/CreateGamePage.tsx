import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import type { Game } from '../types/game'

export function CreateGamePage() {
  const [games, setGames] = useState<Game[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    fetchApi('/api/games')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setGames(data)
          if (data.length > 0 && !selectedGameId) setSelectedGameId(data[0].id)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load games')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleCreate = async () => {
    if (selectedGameId == null) return
    setError('')
    setCreating(true)
    try {
      const res = await fetchApi('/api/games/instances', {
        method: 'POST',
        body: JSON.stringify({ gameId: selectedGameId, options: {} }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create game')
      }
      const data = await res.json()
      const gameSlug = data.game?.slug ?? 'tic-tac-toe'
      navigate(`/lobby/${gameSlug}/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400">Loading games…</div>
    )
  }

  return (
    <div className="py-12 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Create Game</h1>
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Game type</label>
          <select
            value={selectedGameId ?? ''}
            onChange={(e) => setSelectedGameId(e.target.value || null)}
            className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-red-500/20 text-red-200 text-sm">{error}</div>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || selectedGameId == null}
          className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}
