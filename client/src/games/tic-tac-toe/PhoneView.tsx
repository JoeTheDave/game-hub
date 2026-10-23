import type { PhoneViewProps } from '../types'
import { MARK_TEXT_CLASSES, type TicTacToeAction, type TicTacToePlayerView } from './types'

/** Phone controller. Portrait: info top, board below; landscape: info left, board right. Never scrolls. */
export function PhoneView({ instance, view, playerOrder, players, sendAction, pending }: PhoneViewProps<TicTacToePlayerView, TicTacToeAction>) {
  const colorOf = (seat: number) => {
    const color = players.find((p) => p.playerOrder === seat)?.color
    return color ? MARK_TEXT_CLASSES[color] ?? 'text-white' : 'text-white'
  }
  const cellColorClass = (cell: string) => (cell === 'X' ? colorOf(0) : cell === 'O' ? colorOf(1) : 'text-white')

  return (
    <div className="flex-1 min-h-0 p-3 flex flex-col [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:p-4 [@media(orientation:landscape)]:items-center [@media(orientation:landscape)]:gap-4">
      <div className="flex flex-col justify-center shrink-0 text-center [@media(orientation:landscape)]:text-left [@media(orientation:landscape)]:w-1/2 [@media(orientation:landscape)]:min-w-0">
        <h1 className="text-lg font-bold text-white mb-0.5 [@media(orientation:landscape)]:text-base">{instance.game.name}</h1>
        <p className="text-slate-300 text-lg [@media(orientation:landscape)]:text-base">
          You are{' '}
          <span className={`font-bold ${colorOf(playerOrder)} text-2xl [@media(orientation:landscape)]:text-xl`}>{view.myMark}</span>
          {view.status === 'won' ? (
            <span className={`block mt-0.5 font-semibold ${view.winner === playerOrder ? 'text-green-400' : 'text-slate-400'}`}>
              {view.winner === playerOrder ? 'You win!' : 'You lost.'}
            </span>
          ) : view.status === 'draw' ? (
            <span className="block text-slate-400 mt-0.5">Draw!</span>
          ) : view.isMyTurn ? (
            <span className="block text-green-400 mt-0.5">Your turn</span>
          ) : (
            <span className="block text-slate-500 mt-0.5">Waiting for opponent</span>
          )}
        </p>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center [@media(orientation:landscape)]:w-1/2 [@media(orientation:landscape)]:min-w-0 py-2">
        <div className="w-[min(92vw,24rem,calc(100dvh-11rem))] [@media(orientation:landscape)]:w-[min(46vw,calc(100dvh-2rem))] aspect-square grid grid-cols-3 gap-1 sm:gap-2">
          {view.board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                disabled={cell !== '' || !view.isMyTurn || pending}
                onClick={() => void sendAction({ type: 'place', row: r, col: c })}
                className="aspect-square rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-4xl min-[400px]:text-5xl sm:text-6xl font-bold disabled:opacity-50 disabled:cursor-default cursor-pointer hover:bg-white/20 transition-colors active:scale-95"
              >
                <span className={cellColorClass(cell)}>{cell}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
