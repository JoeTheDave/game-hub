import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { fetchApi } from '../../lib/api'
import { useSubscribeGame } from '../../hooks/useSocket'
import type { GameInstance, TicTacToeState } from '../../types/game'

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

/** Controller view for Tic-Tac-Toe (player device). No header. Portrait: info top, board below; landscape: info left, board right. No scroll. */
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
    } catch {
      // could show error
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

  const viewportClass = 'h-dvh max-h-dvh w-full overflow-hidden flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900'

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

  // ——— Lobby: name, color, and (if first player) Start ———
  if (instanceStatus === 'lobby') {
    const gs = instance.gameState as { requiredPlayerCount?: number } | null
    const requiredPlayerCount = gs?.requiredPlayerCount ?? 2
    const canStart = instance.players.length >= requiredPlayerCount && playerOrder === 0
    const usedColors = new Set(instance.players.map((p) => p.color).filter(Boolean))

    return (
      <div className={`${viewportClass} p-3 [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:p-4`}>
        <div className="flex flex-col min-h-0 flex-1 [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:min-w-0">
          {/* Info block: left (landscape) or top (portrait) */}
          <div className="flex flex-col justify-center min-h-0 shrink-0 [@media(orientation:landscape)]:w-1/2 [@media(orientation:landscape)]:pr-4 [@media(orientation:landscape)]:justify-center">
            <h1 className="text-lg font-bold text-white mb-2 [@media(orientation:landscape)]:text-base">
              {instance.game.name}
            </h1>
            <div className="space-y-2 mb-3 [@media(orientation:landscape)]:mb-4">
              <label className="block text-xs font-medium text-slate-300">Name</label>
              <input
                type="text"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                onBlur={() => {
                  const t = pendingName.trim().slice(0, 50)
                  if (t && t !== me?.screenName) updatePlayer({ screenName: t })
                }}
                aria-label="Name"
                className="w-full max-w-xs px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="space-y-2 mb-3 [@media(orientation:landscape)]:mb-4">
              <span className="block text-xs font-medium text-slate-300">Color</span>
              <div className="flex flex-wrap gap-2">
                {PLAYER_COLORS.map((c) => {
                  const taken = usedColors.has(c) && instance.players.find((p) => p.playerOrder === playerOrder)?.color !== c
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={taken}
                      onClick={() => {
                        setPendingColor(c)
                        updatePlayer({ color: c })
                      }}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${COLOR_CLASSES[c] ?? 'bg-gray-500'} ${
                        pendingColor === c ? 'border-white ring-2 ring-white/50' : 'border-transparent'
                      } ${taken ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110'}`}
                      title={c}
                    />
                  )
                })}
              </div>
            </div>
            {canStart && (
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="mt-2 w-full max-w-xs py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold disabled:opacity-50 text-sm"
              >
                {starting ? 'Starting…' : 'Start game'}
              </button>
            )}
            {playerOrder !== 0 && (
              <p className="text-xs text-slate-500 mt-2">Waiting for first player to start…</p>
            )}
          </div>
          {/* Spacer / board area in lobby is just the join code or placeholder in landscape */}
          <div className="hidden [@media(orientation:landscape)]:flex [@media(orientation:landscape)]:w-1/2 [@media(orientation:landscape)]:items-center [@media(orientation:landscape)]:justify-center">
            <p className="text-slate-500 text-sm">Game will begin when host or first player starts.</p>
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
      className={`${viewportClass} p-3 flex flex-col [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:p-4`}
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
          <div className="w-full max-w-[min(100%,theme(maxWidth.sm))] aspect-square grid grid-cols-3 gap-1 sm:gap-2">
            {board.map((row, r) =>
              row.map((cell, c) => (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  disabled={cell !== '' || !isMyTurn || makingMove}
                  onClick={() => handleMove(r, c)}
                  className="aspect-square rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-4xl min-[400px]:text-5xl sm:text-6xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20 transition-colors active:scale-95"
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
