import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { fetchApi } from '../../lib/api'
import { useSubscribeGame } from '../../hooks/useSocket'
import type { GameInstance } from '../../types/game'

const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

export function TicTacToeLobbyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [instance, setInstance] = useState<GameInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const gameInstanceId = id ?? null

  const fetchInstance = useCallback(async () => {
    if (!gameInstanceId) return
    const res = await fetchApi(`/api/games/instances/${gameInstanceId}`)
    if (!res.ok) {
      if (res.status === 404) setError('Game not found')
      return
    }
    const data = await res.json()
    setInstance(data)
  }, [gameInstanceId])

  useEffect(() => {
    fetchInstance().finally(() => setLoading(false))
  }, [fetchInstance])

  useSubscribeGame(gameInstanceId, (payload) => {
    const next = payload as GameInstance
    setInstance(next)
    const status = (next.gameState as { status?: string } | null)?.status
    if (status === 'in_progress' || status === 'playing') {
      navigate(`/game/tic-tac-toe/${gameInstanceId}`, { replace: true })
    }
  })

  const handleCopyUrl = useCallback(() => {
    if (!instance) return
    const url = `${baseUrl}/join/${instance.joinCode}`
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => {}
    )
  }, [instance])

  const handleStart = async () => {
    if (!gameInstanceId || !instance) return
    setError('')
    setStarting(true)
    try {
      const res = await fetchApi(`/api/games/instances/${gameInstanceId}/start`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to start')
      }
      navigate(`/game/tic-tac-toe/${gameInstanceId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  if (loading && !instance) {
    return <div className="py-12 text-center text-slate-400">Loading…</div>
  }
  if (!instance) {
    return (
      <div className="py-12 text-center">
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <p className="text-slate-400">Game not found.</p>
      </div>
    )
  }
  if (instance.game.slug !== 'tic-tac-toe') {
    return <div className="py-12 text-center text-slate-400">This is not a Tic-Tac-Toe game.</div>
  }

  const joinUrl = `${baseUrl}/join/${instance.joinCode}`
  const gs = instance.gameState as { status?: string; requiredPlayerCount?: number } | null
  const requiredPlayerCount = gs?.requiredPlayerCount ?? 2
  const canStart =
    gs?.status === 'lobby' &&
    instance.players.length >= requiredPlayerCount

  const colorBullet = (color: string | null) => {
    if (!color) return <span className="inline-block w-3 h-3 rounded-full bg-white/10 shrink-0" title="No color" />
    const map: Record<string, string> = {
      red: 'bg-red-500',
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-400',
      orange: 'bg-orange-500',
      purple: 'bg-purple-500',
    }
    return (
      <span
        className={`inline-block w-3 h-3 rounded-full shrink-0 ${map[color] ?? 'bg-gray-500'}`}
        title={color}
      />
    )
  }

  return (
    <div className="py-12 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Tic-Tac-Toe</h1>
        <span className="text-2xl font-bold text-white">{instance.joinCode}</span>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-6">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Scan to join</p>
            <div className="inline-block p-4 bg-white rounded-lg">
              <QRCodeSVG value={joinUrl} size={200} level="M" />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <p className="text-xs text-slate-400 break-all flex-1 min-w-0">{joinUrl}</p>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 focus:outline-none transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16V4a2 2 0 0 1 2-2h12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">
              Players ({instance.players.length}/{requiredPlayerCount})
            </p>
            <ul className="space-y-1">
            {instance.players.map((p) => (
              <li key={p.id} className="text-white flex items-center">
                {colorBullet(p.color)}
                <span className={p.color ? 'ml-2' : ''}>{p.screenName}</span>
                {p.userId ? <span className="text-slate-400 text-sm ml-2">(signed in)</span> : null}
              </li>
            ))}
              {instance.players.length === 0 && (
                <li className="text-slate-500">Waiting for players…</li>
              )}
            </ul>
          </div>
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-red-500/20 text-red-200 text-sm">{error}</div>
        )}
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart || starting}
          className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  )
}
