// Mirrors server/src/games/tic-tac-toe/engine.ts views.
export type Mark = 'X' | 'O'
export type Cell = Mark | ''

export interface TicTacToeTableView {
  board: Cell[][]
  turn: number
  winner: number | null
  status: 'playing' | 'won' | 'draw'
  marks: Mark[]
}

export interface TicTacToePlayerView extends TicTacToeTableView {
  myMark: Mark
  isMyTurn: boolean
}

export type TicTacToeAction = { type: 'place'; row: number; col: number }

export const MARK_TEXT_CLASSES: Record<string, string> = {
  red: 'text-red-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-400',
  orange: 'text-orange-500',
  purple: 'text-purple-500',
}
