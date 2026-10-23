import React, { useEffect, useState } from 'react'
import type { TableViewProps } from '../types'
import { MARK_TEXT_CLASSES, type TicTacToeTableView } from './types'

/** Shared-screen board. A `placed` event stamps the new mark in with a thud. */
export function TableView({ instance, view, players, events, seq, onEventsDone, sound }: TableViewProps<TicTacToeTableView>) {
  const [stampedCell, setStampedCell] = useState<{ r: number; c: number } | null>(null)

  useEffect(() => {
    const placed = events.find((e) => e.type === 'placed') as { row: number; col: number } | undefined
    if (!placed) {
      onEventsDone()
      return
    }
    setStampedCell({ r: placed.row, c: placed.col })
    sound.play('stamp')
    const t = window.setTimeout(() => {
      setStampedCell(null)
      onEventsDone()
    }, 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  const colorOf = (seat: number) => {
    const color = players.find((p) => p.playerOrder === seat)?.color
    return color ? MARK_TEXT_CLASSES[color] ?? 'text-white' : 'text-white'
  }
  const nameOf = (seat: number) => players.find((p) => p.playerOrder === seat)?.screenName ?? `Player ${seat + 1}`
  const cellColorClass = (cell: string) => (cell === 'X' ? colorOf(0) : cell === 'O' ? colorOf(1) : 'text-white')

  const statusLine =
    view.status === 'won' && view.winner != null
      ? `${nameOf(view.winner)} wins!`
      : view.status === 'draw'
        ? 'Draw!'
        : `${nameOf(view.turn)}'s turn`
  const statusColorClass =
    view.status === 'won' && view.winner != null
      ? colorOf(view.winner)
      : view.status === 'draw'
        ? 'text-slate-400'
        : colorOf(view.turn)

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center px-4 py-8">
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
      <div className="aspect-square w-[min(90vw,calc(100vh-14rem),48rem)] grid grid-cols-3 gap-3 sm:gap-4">
        {view.board.flatMap((row, r) =>
          row.map((cell, c) => {
            const isStamped = stampedCell?.r === r && stampedCell?.c === c
            return (
              <div
                key={`${r}-${c}`}
                className="relative aspect-square rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-6xl sm:text-7xl md:text-8xl font-bold overflow-visible"
              >
                {isStamped &&
                  cell &&
                  Array.from({ length: 10 }, (_, i) => {
                    const rad = ((i / 10) * 360 * Math.PI) / 180
                    return (
                      <span
                        key={i}
                        className="absolute w-2 h-2 rounded-full bg-white/80 pointer-events-none stamp-particle"
                        style={{ '--dx': Math.cos(rad) * 36, '--dy': Math.sin(rad) * 36 } as React.CSSProperties}
                      />
                    )
                  })}
                <span className={`inline-block leading-none ${isStamped && cell ? 'stamp-mark' : ''} ${cellColorClass(cell)}`}>
                  {cell}
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
