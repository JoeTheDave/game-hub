import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchApi } from '../../lib/api'
import { useSubscribeGame } from '../../hooks/useSocket'
import { playStampSound } from '../../lib/stampSound'
import type { GameInstance, TicTacToeState } from '../../types/game'

const MARK_TEXT_CLASSES: Record<string, string> = {
  red: 'text-red-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-400',
  orange: 'text-orange-500',
  purple: 'text-purple-500',
}

export function TicTacToeGamePage() {
  const { id } = useParams<{ id: string }>()
  const [instance, setInstance] = useState<GameInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [stampedCell, setStampedCell] = useState<{ r: number; c: number } | null>(null)
  const prevBoardRef = useRef<string | null>(null)
  const gameInstanceId = id ?? null

  const fetchInstance = async () => {
    if (!gameInstanceId) return
    const res = await fetchApi(`/api/games/instances/${gameInstanceId}`)
    if (res.ok) {
      const data = await res.json()
      setInstance(data)
    }
  }

  useEffect(() => {
    fetchInstance().finally(() => setLoading(false))
  }, [gameInstanceId])

  useSubscribeGame(gameInstanceId, (payload) => {
    setInstance(payload as GameInstance)
  })

  // Board derived from instance (can be null) — used for stamp effect so hook runs unconditionally
  const stateForBoard = instance?.gameState as TicTacToeState | null | undefined
  const boardForEffect =
    stateForBoard?.board && Array.isArray(stateForBoard.board) && stateForBoard.board.length === 3
      ? (stateForBoard.board as string[][])
      : null

  // Detect new move and trigger stamp effect + sound (main view only). Must run unconditionally for hooks order.
  useEffect(() => {
    if (!boardForEffect) return
    const boardKey = boardForEffect.flat().join('')
    const prev = prevBoardRef.current
    prevBoardRef.current = boardKey
    if (prev == null) return
    let prevCount = 0
    let currCount = 0
    let newCell: { r: number; c: number } | null = null
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c
        const prevChar = prev[idx]
        const currChar = boardForEffect[r][c]
        if (prevChar === 'X' || prevChar === 'O') prevCount++
        if (currChar === 'X' || currChar === 'O') currCount++
        if ((!prevChar || prevChar === '') && (currChar === 'X' || currChar === 'O')) {
          newCell = { r, c }
        }
      }
    }
    if (currCount === prevCount + 1 && newCell) {
      setStampedCell(newCell)
      playStampSound()
      const t = setTimeout(() => setStampedCell(null), 700)
      return () => clearTimeout(t)
    }
  }, [boardForEffect])

  if (loading && !instance) {
    return <div className="py-12 text-center text-slate-400">Loading…</div>
  }
  if (!instance) {
    return <div className="py-12 text-center text-slate-400">Game not found.</div>
  }
  const instanceStatus = (instance.gameState as { status?: string } | null)?.status
  if (instanceStatus === 'lobby') {
    return (
      <div className="py-12 text-center text-slate-400">
        Game has not started. <Link to={`/lobby/tic-tac-toe/${instance.id}`} className="text-amber-400">Go to lobby</Link>.
      </div>
    )
  }
  if (instance.game.slug !== 'tic-tac-toe') {
    return <div className="py-12 text-center text-slate-400">This is not a Tic-Tac-Toe game.</div>
  }

  const state = instance.gameState as TicTacToeState | null
  if (!state || !state.board) {
    return <div className="py-12 text-center text-slate-400">Loading game state…</div>
  }

  const board = state.board as string[][]
  const player0 = instance.players.find((p) => p.playerOrder === 0)
  const player1 = instance.players.find((p) => p.playerOrder === 1)
  const xColorClass = player0?.color ? MARK_TEXT_CLASSES[player0.color] ?? 'text-white' : 'text-white'
  const oColorClass = player1?.color ? MARK_TEXT_CLASSES[player1.color] ?? 'text-white' : 'text-white'
  const cellColorClass = (cell: string) => (cell === 'X' ? xColorClass : cell === 'O' ? oColorClass : 'text-white')

  const winnerPlayer = state.status === 'won' && state.winner != null
    ? (state.winner === 0 ? player0 : player1)
    : null
  const winnerName = winnerPlayer?.screenName ?? (state.winner != null ? `Player ${state.winner + 1}` : '')
  const winnerColorClass =
    state.status === 'won' && state.winner != null
      ? state.winner === 0
        ? xColorClass
        : oColorClass
      : 'text-amber-400'
  const turnPlayer = state.currentTurnPlayerOrder === 0 ? player0 : player1
  const turnPlayerName = turnPlayer?.screenName ?? `Player ${(state.currentTurnPlayerOrder ?? 0) + 1}`
  const turnColorClass = state.currentTurnPlayerOrder === 0 ? xColorClass : oColorClass

  const statusLine =
    state.status === 'won' && state.winner != null
      ? `${winnerName} wins!`
      : state.status === 'draw'
        ? 'Draw!'
        : `${turnPlayerName}'s turn`
  const statusColorClass =
    state.status === 'won' ? winnerColorClass : state.status === 'draw' ? 'text-slate-400' : turnColorClass

  return (
    <div className="py-12 max-w-4xl mx-auto px-4">
      <style>{`
        @keyframes stamp-in {
          0% { transform: scale(1.5); opacity: 0.5; }
          60% { transform: scale(0.95); opacity: 1; }
          80% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes particle-out {
          to { transform: translate(calc(var(--dx) * 1px), calc(var(--dy) * 1px)); opacity: 0; }
        }
        .stamp-mark { animation: stamp-in 0.4s ease-out; }
        .stamp-particle { animation: particle-out 0.5s ease-out forwards; }
      `}</style>
      <h1 className="text-2xl font-bold text-white text-center mb-8">{instance.game.name}</h1>
      <div className="aspect-square w-full max-w-[48rem] min-w-0 mx-auto grid grid-cols-3 gap-3 sm:gap-4">
        {board.flatMap((row, r) =>
          row.map((cell, c) => {
            const isStamped = stampedCell?.r === r && stampedCell?.c === c
            const particleCount = 10
            return (
              <div
                key={`${r}-${c}`}
                className="relative aspect-square rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-6xl sm:text-7xl md:text-8xl font-bold overflow-visible"
              >
                {isStamped && cell && (
                  <>
                    {Array.from({ length: particleCount }, (_, i) => {
                      const angle = (i / particleCount) * 360
                      const rad = (angle * Math.PI) / 180
                      const dist = 36
                      const dx = Math.cos(rad) * dist
                      const dy = Math.sin(rad) * dist
                      return (
                        <span
                          key={i}
                          className="absolute w-2 h-2 rounded-full bg-white/80 pointer-events-none stamp-particle"
                          style={{ '--dx': dx, '--dy': dy } as React.CSSProperties}
                        />
                      )
                    })}
                  </>
                )}
                <span className={`inline-block leading-none ${isStamped && cell ? 'stamp-mark' : ''} ${cell ? cellColorClass(cell) : 'text-white'}`}>
                  {cell || ''}
                </span>
              </div>
            )
          })
        )}
      </div>
      <p className={`text-center text-lg font-semibold mt-6 ${statusColorClass}`}>{statusLine}</p>
    </div>
  )
}
