import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { fetchApi } from '../../lib/api'
import { useSubscribeGame } from '../../hooks/useSocket'
import type { GameInstance, TicTacToeState } from '../../types/game'
import { PHONE_SCREEN_CLASS } from '../../lib/phoneScreen'

const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'] as const
const COLOR_CLASSES: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
}
const MARK_TEXT_CLASSES: Record<string, string> = {
  red: 'text-red-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-400',
  orange: 'text-orange-500',
  purple: 'text-purple-500',
}

/**
 * Controller view for Tic-Tac-Toe (player device). No header, never scrolls.
 * Lobby: name/color + roster; seat 0 (first to join) silently gets Start Game once the lobby is full.
 * In game: portrait = info top, board below; landscape = info left, board right.
 */
export function TicTacToeControllerPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const gameInstanceId = id ?? null
  const playerOrderFromState = (location.state as { playerOrder?: number })?.playerOrder
  const joinTokenFromState = (location.state as { joinToken?: string })?.joinToken
  const playerOrderFromStorage =
    gameInstanceId != null
      ? (() => {
          try {
            const v = sessionStorage.getItem(`game:${gameInstanceId}:playerOrder`)
            return v != null ? parseInt(v, 10) : undefined
          } catch {
            return undefined
          }
        })()
      : undefined
  const joinTokenFromStorage =
    gameInstanceId != null
      ? (() => {
          try {
            return sessionStorage.getItem(`game:${gameInstanceId}:joinToken`)
          } catch {
            return null
          }
        })()
      : null
  const playerOrder = playerOrderFromState ?? playerOrderFromStorage ?? -1
  const joinToken = joinTokenFromState ?? joinTokenFromStorage ?? undefined
  const [instance, setInstance] = useState<GameInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [makingMove, setMakingMove] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [pendingName, setPendingName] = useState('')
  const [pendingColor, setPendingColor] = useState<string | null>(null)

  const fetchInstance = useCallback(async () => {
    if (!gameInstanceId) return
    const res = await fetchApi(`/api/games/instances/${gameInstanceId}`)
    if (res.ok) {
      const data = await res.json()
      setInstance(data)
    }
  }, [gameInstanceId])

  useEffect(() => {
    fetchInstance().finally(() => setLoading(false))
  }, [fetchInstance])

  useSubscribeGame(gameInstanceId, (payload) => {
    setInstance(payload as GameInstance)
  })

  const me = instance?.players.find((p) => p.playerOrder === playerOrder)
  useEffect(() => {
    if (me && pendingName === '') setPendingName(me.screenName)
    if (me && pendingColor === null) setPendingColor(me.color ?? null)
  }, [me?.screenName, me?.color])

  const updatePlayer = useCallback(
    async (updates: { screenName?: string; color?: string | null }) => {
      if (!gameInstanceId || playerOrder < 0) return
      const res = await fetchApi(`/api/games/instances/${gameInstanceId}/players`, {
        method: 'PATCH',
        body: JSON.stringify({ playerOrder, ...updates }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data?.instance) setInstance(data.instance)
        else fetchInstance()
      }
    },
    [gameInstanceId, playerOrder, fetchInstance]
  )

  // Debounced save of name so lobby updates as the user types
  useEffect(() => {
    const t = pendingName.trim().slice(0, 50)
    if (!t || t === me?.screenName) return
    const id = window.setTimeout(() => {
      updatePlayer({ screenName: t })
    }, 400)
    return () => window.clearTimeout(id)
  }, [pendingName, me?.screenName, updatePlayer])

  const handleStart = async () => {
    if (!gameInstanceId || !instance) return
    const gs = instance.gameState as { status?: string; requiredPlayerCount?: number } | null
    if (gs?.status !== 'lobby') return
    const required = gs?.requiredPlayerCount ?? 2
    if (instance.players.length < required) return
    setStartError('')
    setStarting(true)
    try {
      const res = await fetchApi(`/api/games/instances/${gameInstanceId}/start`, {
        method: 'POST',
        body: JSON.stringify(joinToken ? { joinToken } : {}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to start')
      }
      const updated = await res.json()
      setInstance(updated)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const handleMove = async (row: number, col: number) => {
    if (!gameInstanceId || !instance) return
    const state = instance.gameState as TicTacToeState | null
    const canMove = state?.status === 'playing' || state?.status === 'in_progress'
    if (!state || !canMove || state.currentTurnPlayerOrder !== playerOrder) return
    if (state.board![row][col] !== '') return
    setMakingMove(true)
    try {
      const res = await fetchApi(`/api/games/instances/${gameInstanceId}/move`, {
        method: 'POST',
        body: JSON.stringify({ playerOrder, row, col }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Move failed')
      }
    } catch {
      // Error could be shown in UI
    } finally {
      setMakingMove(false)
    }
  }

  const viewportClass = PHONE_SCREEN_CLASS

  if (loading && !instance) {
    return (
      <div className={`${viewportClass} items-center justify-center text-slate-400`}>
        Loading…
      </div>
    )
  }
  if (!instance) {
    return (
      <div className={`${viewportClass} items-center justify-center text-slate-400`}>
        Game not found.
      </div>
    )
  }
  if (instance.game.slug !== 'tic-tac-toe') {
    return (
      <div className={`${viewportClass} items-center justify-center text-slate-400`}>
        Unknown game type.
      </div>
    )
  }

  const instanceStatus = (instance.gameState as { status?: string } | null)?.status

  // ——— Lobby: name, color, roster, and (admin = first player) Start ———
  if (instanceStatus === 'lobby') {
    const gs = instance.gameState as { requiredPlayerCount?: number } | null
    const requiredPlayerCount = gs?.requiredPlayerCount ?? 2
    const isAdmin = playerOrder === 0
    const lobbyFull = instance.players.length >= requiredPlayerCount
    const usedColors = new Set(
      instance.players.filter((p) => p.playerOrder !== playerOrder).map((p) => p.color).filter(Boolean)
    )
    const missing = requiredPlayerCount - instance.players.length

    return (
      <div className={viewportClass}>
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
                  if (t && t !== me?.screenName) updatePlayer({ screenName: t })
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
                        updatePlayer({ color: c })
                      }}
                      className={`w-11 h-11 rounded-full border-4 transition-transform ${COLOR_CLASSES[c] ?? 'bg-gray-500'} ${
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
                <span className="text-xs font-semibold text-slate-300">
                  {instance.players.length}/{requiredPlayerCount}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {Array.from({ length: requiredPlayerCount }, (_, seat) => {
                  const p = instance.players.find((pl) => pl.playerOrder === seat)
                  return (
                    <li key={seat} className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-4 h-4 rounded-full shrink-0 ${
                          p?.color ? COLOR_CLASSES[p.color] : 'border-2 border-dashed border-white/25'
                        }`}
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
            {isAdmin && lobbyFull ? (
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
                {!lobbyFull
                  ? `Waiting for ${missing} more player${missing === 1 ? '' : 's'}…`
                  : 'Waiting for the game to start…'}
              </p>
            )}
            {startError && <p className="text-center text-sm text-red-400">{startError}</p>}
          </div>
        </div>
      </div>
    )
  }

  // ——— In-game: board + status ———
  const state = instance.gameState as TicTacToeState | null
  if (!state || !state.board) {
    return (
      <div className={`${viewportClass} items-center justify-center text-slate-400`}>
        Loading game state…
      </div>
    )
  }

  const board = state.board as string[][]
  const isMyTurn =
    (state.status === 'playing' || state.status === 'in_progress') && state.currentTurnPlayerOrder === playerOrder
  const marks = ['X', 'O']
  const myMark = marks[playerOrder] ?? '?'
  const myColorClass = me?.color ? MARK_TEXT_CLASSES[me.color] ?? 'text-white' : 'text-white'
  const player0 = instance.players.find((p) => p.playerOrder === 0)
  const player1 = instance.players.find((p) => p.playerOrder === 1)
  const xColorClass = player0?.color ? MARK_TEXT_CLASSES[player0.color] ?? 'text-white' : 'text-white'
  const oColorClass = player1?.color ? MARK_TEXT_CLASSES[player1.color] ?? 'text-white' : 'text-white'
  const cellColorClass = (cell: string) => (cell === 'X' ? xColorClass : cell === 'O' ? oColorClass : 'text-white')

  return (
    <div
      className={`${viewportClass} p-3 [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:p-4`}
    >
      <div className="flex flex-col min-h-0 flex-1 [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:min-w-0 [@media(orientation:landscape)]:items-center [@media(orientation:landscape)]:gap-4">
        {/* Info: top (portrait) or left (landscape) */}
        <div className="flex flex-col justify-center shrink-0 text-center [@media(orientation:landscape)]:text-left [@media(orientation:landscape)]:w-1/2 [@media(orientation:landscape)]:min-w-0">
          <h1 className="text-lg font-bold text-white mb-0.5 [@media(orientation:landscape)]:text-base">
            {instance.game.name}
          </h1>
          <p className="text-slate-300 text-lg [@media(orientation:landscape)]:text-base">
            You are <span className={`font-bold ${myColorClass} text-2xl [@media(orientation:landscape)]:text-xl`}>{myMark}</span>
            {state.status === 'won' ? (
              <span className={`block mt-0.5 font-semibold ${state.winner === playerOrder ? 'text-green-400' : 'text-slate-400'}`}>
                {state.winner === playerOrder ? 'You win!' : 'You lost.'}
              </span>
            ) : state.status === 'draw' ? (
              <span className="block text-slate-400 mt-0.5">Draw!</span>
            ) : isMyTurn ? (
              <span className="block text-green-400 mt-0.5">Your turn</span>
            ) : (
              <span className="block text-slate-500 mt-0.5">Waiting for opponent</span>
            )}
          </p>
        </div>
        {/* Board: fills remaining space, no scroll */}
        <div className="flex-1 min-h-0 flex items-center justify-center [@media(orientation:landscape)]:w-1/2 [@media(orientation:landscape)]:min-w-0 py-2">
          <div className="w-[min(92vw,24rem,calc(100dvh-11rem))] [@media(orientation:landscape)]:w-[min(46vw,calc(100dvh-2rem))] aspect-square grid grid-cols-3 gap-1 sm:gap-2">
            {board.map((row, r) =>
              row.map((cell, c) => (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  disabled={cell !== '' || !isMyTurn || makingMove}
                  onClick={() => handleMove(r, c)}
                  className="aspect-square rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-4xl min-[400px]:text-5xl sm:text-6xl font-bold disabled:opacity-50 disabled:cursor-default cursor-pointer hover:bg-white/20 transition-colors active:scale-95"
                >
                  <span className={cell ? cellColorClass(cell) : 'text-white'}>{cell || ''}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
