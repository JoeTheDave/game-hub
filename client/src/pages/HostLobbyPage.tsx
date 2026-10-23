import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { fetchApi } from '../lib/api'
import { soundBoard } from '../lib/soundBoard'
import { COLOR_BG_CLASSES } from '../lib/playerColors'
import { useTableFeed } from '../hooks/useTableFeed'

/** The host's lobby screen (usually the TV): QR code to join, roster, and Start. Game-agnostic. */
export function HostLobbyPage() {
  const { gameSlug, id } = useParams<{ gameSlug: string; id: string }>()
  const navigate = useNavigate()
  const { latest: instance, error: feedError, loading } = useTableFeed(id ?? null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Once the game starts (from here or from the first player's phone), switch to the table.
  useEffect(() => {
    if (instance && instance.phase !== 'lobby') navigate(`/game/${gameSlug}/${id}`, { replace: true })
  }, [instance, gameSlug, id, navigate])

  const joinUrl = instance ? `${window.location.origin}/join/${instance.joinCode}` : ''

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(joinUrl).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => {}
    )
  }, [joinUrl])

  const handleStart = async () => {
    setError('')
    setStarting(true)
    try {
      const res = await fetchApi(`/api/games/instances/${id}/start`, { method: 'POST', body: '{}' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to start')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  if (loading && !instance) return <div className="py-12 text-center text-slate-400">Loading…</div>
  if (!instance) return <div className="py-12 text-center text-slate-400">{feedError ?? 'Game not found.'}</div>

  const { minPlayers, maxPlayers } = instance.game
  const canStart = instance.players.length >= minPlayers

  return (
    // Any tap here also unlocks audio for the table screen that follows.
    <div className="py-10 px-4 max-w-3xl mx-auto" onClickCapture={() => void soundBoard.unlock()}>
      <div className="rounded-3xl p-[3px] bg-gradient-to-br from-amber-300 via-amber-600 to-amber-900 shadow-2xl shadow-black/50">
        <div className="rounded-[1.4rem] bg-[radial-gradient(ellipse_at_top,_#1f5135,_#0d2a1b_70%)] p-6 sm:p-8">
          <div className="flex items-baseline justify-between gap-4 mb-6">
            <h1 className="text-3xl font-black text-amber-100 tracking-tight drop-shadow">{instance.game.name}</h1>
            <span className="font-mono text-3xl font-black tracking-[0.2em] text-amber-300 drop-shadow">{instance.joinCode}</span>
          </div>
          <div className="flex flex-wrap gap-8 items-start">
            <div>
              <p className="text-sm font-semibold text-amber-100/80 mb-2">Scan to join</p>
              <div className="inline-block p-4 bg-white rounded-2xl shadow-lg rotate-[-1deg]">
                <QRCodeSVG value={joinUrl} size={220} level="M" />
              </div>
              <div className="mt-2 flex items-center gap-1.5 max-w-[252px]">
                <p className="text-xs text-amber-100/60 break-all flex-1 min-w-0">{joinUrl}</p>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="shrink-0 px-2 py-1 rounded-md text-xs text-amber-100/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                  title="Copy link"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="flex-1 min-w-[14rem]">
              <p className="text-sm font-semibold text-amber-100/80 mb-3">
                Players {instance.players.length}/{maxPlayers}
                {minPlayers < maxPlayers && <span className="text-amber-100/50"> · {minPlayers} needed to start</span>}
              </p>
              <ul className="space-y-2">
                {instance.players.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2 text-lg text-white">
                    <span className={`w-5 h-5 rounded-full shrink-0 ring-2 ring-white/30 ${p.color ? COLOR_BG_CLASSES[p.color] : 'bg-white/20'}`} />
                    <span className="truncate">{p.screenName}</span>
                  </li>
                ))}
                {instance.players.length === 0 && <li className="text-amber-100/50 italic">Waiting for players…</li>}
              </ul>
            </div>
          </div>
          {error && <div className="mt-6 p-3 rounded-lg bg-red-500/20 text-red-200 text-sm">{error}</div>}
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart || starting}
            className="mt-8 w-full py-3 rounded-2xl bg-amber-400 text-emerald-950 text-lg font-black shadow-lg shadow-black/30 cursor-pointer hover:bg-amber-300 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-default disabled:hover:bg-amber-400"
          >
            {starting ? 'Starting…' : canStart ? 'Start Game' : `Waiting for players…`}
          </button>
        </div>
      </div>
    </div>
  )
}
