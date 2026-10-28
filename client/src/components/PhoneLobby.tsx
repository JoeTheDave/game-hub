import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '../lib/api'
import { PLAYER_COLORS, COLOR_BG_CLASSES } from '../lib/playerColors'
import type { SeatCredentials } from '../lib/seat'
import type { GameInstance } from '../types/game'
import { useAdmin } from '../hooks/useAdmin'
import { GameOptions } from './GameOptions'
import { AdminMenu } from './AdminMenu'

interface Props {
  instance: GameInstance
  seat: SeatCredentials
  onInstance: (instance: GameInstance) => void
}

/**
 * Game-agnostic phone lobby: name, color, roster, the game's options. The admin seat (the first
 * to join, unless the role was handed on) gets the Start Game button once at least minPlayers have
 * joined, can edit the options, and has the Players menu to hand the role on. There's no "admin" label.
 */
export function PhoneLobby({ instance, seat, onInstance }: Props) {
  const { playerOrder, joinToken } = seat
  const [pendingName, setPendingName] = useState('')
  const [pendingColor, setPendingColor] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const me = instance.players.find((p) => p.playerOrder === playerOrder)
  const { isAdmin, setOption, promote } = useAdmin(instance, seat, onInstance)
  useEffect(() => {
    if (me && pendingName === '') setPendingName(me.screenName)
    if (me && pendingColor === null) setPendingColor(me.color ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.screenName, me?.color])

  const updatePlayer = useCallback(
    async (updates: { screenName?: string; color?: string | null }) => {
      const res = await fetchApi(`/api/games/instances/${instance.id}/players`, {
        method: 'PATCH',
        body: JSON.stringify({ playerOrder, joinToken, ...updates }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data?.instance) onInstance(data.instance)
      }
    },
    [instance.id, playerOrder, joinToken, onInstance]
  )

  // Debounced save of name so the lobby updates as the player types
  useEffect(() => {
    const t = pendingName.trim().slice(0, 50)
    if (!t || t === me?.screenName) return
    const id = window.setTimeout(() => void updatePlayer({ screenName: t }), 400)
    return () => window.clearTimeout(id)
  }, [pendingName, me?.screenName, updatePlayer])

  const { minPlayers, maxPlayers } = instance.game
  const canStart = instance.players.length >= minPlayers
  const missing = Math.max(0, minPlayers - instance.players.length)
  const usedColors = new Set(instance.players.filter((p) => p.playerOrder !== playerOrder).map((p) => p.color).filter(Boolean))
  // Show every joined seat, plus empty placeholders up to the minimum needed to start.
  const seatRows = Math.max(instance.players.length, minPlayers)

  const handleStart = async () => {
    setStartError('')
    setStarting(true)
    try {
      const res = await fetchApi(`/api/games/instances/${instance.id}/start`, {
        method: 'POST',
        body: JSON.stringify({ joinToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to start')
      onInstance(data)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 w-full max-w-sm mx-auto px-5 py-4 flex flex-col justify-center gap-5 [@media(orientation:landscape)]:max-w-2xl [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:items-center [@media(orientation:landscape)]:gap-8">
      {/* You: name + color */}
      <div className="flex flex-col gap-4 [@media(orientation:landscape)]:flex-1">
        <div className="text-center [@media(orientation:landscape)]:text-left">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">{instance.game.name}</h1>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="player-name" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Your name
          </label>
          <input
            id="player-name"
            type="text"
            value={pendingName}
            maxLength={50}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            onBlur={() => {
              const t = pendingName.trim().slice(0, 50)
              if (t && t !== me?.screenName) void updatePlayer({ screenName: t })
            }}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-base select-text focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your color</span>
          <div className="flex justify-between gap-2">
            {PLAYER_COLORS.map((c) => {
              const taken = usedColors.has(c)
              const selected = pendingColor === c
              return (
                <button
                  key={c}
                  type="button"
                  disabled={taken}
                  aria-label={c}
                  aria-pressed={selected}
                  onClick={() => {
                    setPendingColor(c)
                    void updatePlayer({ color: c })
                  }}
                  className={`w-11 h-11 rounded-full border-4 transition-transform ${COLOR_BG_CLASSES[c] ?? 'bg-gray-500'} ${
                    selected ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                  } ${taken ? 'opacity-25 cursor-default' : 'cursor-pointer active:scale-95'}`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Table: roster + start */}
      <div className="flex flex-col gap-3 [@media(orientation:landscape)]:flex-1">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Players</span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                {instance.players.length}/{maxPlayers}
              </span>
              <AdminMenu isAdmin={isAdmin} playerOrder={playerOrder} players={instance.players} promote={promote} />
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {Array.from({ length: seatRows }, (_, s) => {
              const p = instance.players.find((pl) => pl.playerOrder === s)
              return (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span
                    className={`w-4 h-4 rounded-full shrink-0 ${p?.color ? COLOR_BG_CLASSES[p.color] : 'border-2 border-dashed border-white/25'}`}
                  />
                  {p ? (
                    <span className="text-white truncate">
                      {p.screenName}
                      {p.playerOrder === playerOrder && <span className="text-slate-400"> (you)</span>}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Waiting to join…</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <GameOptions instance={instance} editable={isAdmin} onChange={(k, v) => void setOption(k, v)} />
        {isAdmin && canStart ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="w-full py-4 rounded-2xl bg-amber-500 text-slate-900 text-lg font-extrabold shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-default"
          >
            {starting ? 'Starting…' : 'Start Game'}
          </button>
        ) : (
          <p className="text-center text-sm text-slate-400">
            {missing > 0 ? `Waiting for ${missing} more player${missing === 1 ? '' : 's'}…` : 'Waiting for the game to start…'}
          </p>
        )}
        {startError && <p className="text-center text-sm text-red-400">{startError}</p>}
      </div>
    </div>
  )
}
