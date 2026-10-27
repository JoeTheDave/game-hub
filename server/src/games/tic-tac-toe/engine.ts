import type { ActionResult, GameEvent, GameModule, SeatInfo } from '../types.js'

export type Mark = 'X' | 'O'
export type Cell = Mark | ''

export interface TicTacToeState {
  board: Cell[][]
  /** Seat whose turn it is. */
  turn: number
  /** Winning seat, or null. */
  winner: number | null
  status: 'playing' | 'won' | 'draw'
  /** Number of marks placed so far. */
  moves: number
}

export interface TicTacToeAction {
  type: 'place'
  row: number
  col: number
}

export interface TicTacToeTableView {
  board: Cell[][]
  turn: number
  winner: number | null
  status: TicTacToeState['status']
  /** Seat order → mark. */
  marks: Mark[]
}

export interface TicTacToePlayerView extends TicTacToeTableView {
  myMark: Mark
  isMyTurn: boolean
}

const MARKS: Mark[] = ['X', 'O']

const LINES: [number, number][][] = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
]

function emptyBoard(): Cell[][] {
  return [
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ]
}

function hasLine(board: Cell[][], mark: Mark): boolean {
  return LINES.some((line) => line.every(([r, c]) => board[r][c] === mark))
}

function tableView(state: TicTacToeState): TicTacToeTableView {
  return { board: state.board, turn: state.turn, winner: state.winner, status: state.status, marks: MARKS }
}

export const ticTacToe: GameModule<TicTacToeState, TicTacToeAction> = {
  slug: 'tic-tac-toe',
  name: 'Tic-Tac-Toe',
  minPlayers: 2,
  maxPlayers: 2,

  setup(_players: SeatInfo[]) {
    return {
      state: { board: emptyBoard(), turn: 0, winner: null, status: 'playing', moves: 0 },
      events: [{ type: 'started' }],
    }
  },

  applyAction(state, playerOrder, action): ActionResult<TicTacToeState> {
    if (state.status !== 'playing') return { ok: false, error: 'The game is over' }
    if (playerOrder !== state.turn) return { ok: false, error: 'Not your turn' }
    if (!action || action.type !== 'place') return { ok: false, error: 'Unknown action' }
    const { row, col } = action
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 2 || col < 0 || col > 2) {
      return { ok: false, error: 'Invalid move' }
    }
    if (state.board[row][col] !== '') return { ok: false, error: 'That square is taken' }
    const mark = MARKS[playerOrder]
    const board = state.board.map((r, ri) => r.map((cell, ci) => (ri === row && ci === col ? mark : cell)))
    const moves = state.moves + 1
    let status: TicTacToeState['status'] = 'playing'
    let winner: number | null = null
    if (hasLine(board, mark)) {
      status = 'won'
      winner = playerOrder
    } else if (moves === 9) {
      status = 'draw'
    }
    const next: TicTacToeState = {
      board,
      moves,
      status,
      winner,
      turn: status === 'playing' ? (state.turn + 1) % 2 : state.turn,
    }
    const events: GameEvent[] = [{ type: 'placed', seat: playerOrder, row, col, mark }]
    if (status !== 'playing') events.push({ type: 'gameOver', winner })
    return { ok: true, state: next, events }
  },

  tableView: (state) => tableView(state),

  playerView(state, playerOrder): TicTacToePlayerView {
    return {
      ...tableView(state),
      myMark: MARKS[playerOrder] ?? 'X',
      isMyTurn: state.status === 'playing' && state.turn === playerOrder,
    }
  },

  isFinished: (state) => state.status !== 'playing',

  activeSeats: (state) => (state.status === 'playing' ? [state.turn] : []),

  legalActions(state, playerOrder) {
    if (state.status !== 'playing' || playerOrder !== state.turn) return []
    const out: TicTacToeAction[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (state.board[row][col] === '') out.push({ type: 'place', row, col })
      }
    }
    return out
  },

  winners: (state) => (state.winner != null ? [state.winner] : []),

  // A series of tic-tac-toe games is scored as wins: 1 for the winner, 0 otherwise (a draw is 0–0).
  summary: (state) =>
    state.status === 'playing'
      ? null
      : { scores: [0, 1].map((seat) => (state.winner === seat ? 1 : 0)), winners: state.winner != null ? [state.winner] : [] },
}
