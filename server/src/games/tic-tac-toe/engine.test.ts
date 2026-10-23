import { describe, expect, it } from 'vitest'
import { ticTacToe, type TicTacToeState } from './engine.js'
import { seededRng } from '../types.js'
import { replay, simulate } from '../simulate.js'

const seats = [
  { playerOrder: 0, screenName: 'A', color: 'red' },
  { playerOrder: 1, screenName: 'B', color: 'blue' },
]
const rng = seededRng(1)

function play(moves: [number, number][]): TicTacToeState {
  let { state } = ticTacToe.setup(seats, rng)
  for (const [row, col] of moves) {
    const res = ticTacToe.applyAction(state, state.turn, { type: 'place', row, col }, rng)
    if (!res.ok) throw new Error(res.error)
    state = res.state
  }
  return state
}

describe('tic-tac-toe engine', () => {
  it('starts empty with seat 0 to move', () => {
    const { state, events } = ticTacToe.setup(seats, rng)
    expect(state.board.flat().every((c) => c === '')).toBe(true)
    expect(state.turn).toBe(0)
    expect(ticTacToe.activeSeats(state)).toEqual([0])
    expect(events[0].type).toBe('started')
  })

  it('alternates turns and places marks without mutating the input', () => {
    const { state } = ticTacToe.setup(seats, rng)
    const res = ticTacToe.applyAction(state, 0, { type: 'place', row: 1, col: 1 }, rng)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.state.board[1][1]).toBe('X')
    expect(res.state.turn).toBe(1)
    expect(state.board[1][1]).toBe('')
    expect(res.events).toEqual([{ type: 'placed', seat: 0, row: 1, col: 1, mark: 'X' }])
  })

  it('rejects moving out of turn, taken squares and out-of-range squares', () => {
    const s = play([[0, 0]])
    expect(ticTacToe.applyAction(s, 0, { type: 'place', row: 1, col: 1 }, rng)).toEqual({ ok: false, error: 'Not your turn' })
    expect(ticTacToe.applyAction(s, 1, { type: 'place', row: 0, col: 0 }, rng).ok).toBe(false)
    expect(ticTacToe.applyAction(s, 1, { type: 'place', row: 3, col: 0 }, rng).ok).toBe(false)
    expect(ticTacToe.applyAction(s, 1, { type: 'place', row: 0.5, col: 0 }, rng).ok).toBe(false)
  })

  it.each([
    ['row', [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]],
    ['column', [[0, 1], [0, 0], [1, 1], [0, 2], [2, 1]]],
    ['diagonal', [[0, 0], [0, 1], [1, 1], [0, 2], [2, 2]]],
    ['anti-diagonal', [[0, 2], [0, 0], [1, 1], [0, 1], [2, 0]]],
  ] as [string, [number, number][]][])('detects a %s win', (_name, moves) => {
    const s = play(moves)
    expect(s.status).toBe('won')
    expect(ticTacToe.winners(s)).toEqual([0])
    expect(ticTacToe.isFinished(s)).toBe(true)
    expect(ticTacToe.activeSeats(s)).toEqual([])
  })

  it('detects a draw', () => {
    const s = play([[0, 0], [0, 1], [0, 2], [1, 1], [1, 0], [1, 2], [2, 1], [2, 0], [2, 2]])
    expect(s.status).toBe('draw')
    expect(ticTacToe.winners(s)).toEqual([])
  })

  it('allows no moves after the game ends', () => {
    const s = play([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]])
    expect(ticTacToe.applyAction(s, 1, { type: 'place', row: 2, col: 2 }, rng).ok).toBe(false)
    expect(ticTacToe.legalActions(s, 1)).toEqual([])
  })

  it('lists exactly the empty squares as legal, and only for the seat to move', () => {
    const s = play([[0, 0], [1, 1]])
    expect(ticTacToe.legalActions(s, 0)).toHaveLength(7)
    expect(ticTacToe.legalActions(s, 1)).toEqual([])
  })

  it('gives each phone its own mark and turn flag', () => {
    const s = play([[0, 0]])
    expect(ticTacToe.playerView(s, 1, seats)).toMatchObject({ myMark: 'O', isMyTurn: true })
    expect(ticTacToe.playerView(s, 0, seats)).toMatchObject({ myMark: 'X', isMyTurn: false })
  })
})

describe('tic-tac-toe headless simulation', () => {
  it('plays 500 random games to completion, legally and deterministically', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const sim = simulate(ticTacToe, { players: 2, seed })
      expect(sim.stalled).toBe(false)
      expect(ticTacToe.isFinished(sim.finalState)).toBe(true)
      // Every applied action was in the legal list at the time it was played.
      let { state } = ticTacToe.setup(seats, seededRng(seed))
      for (const { seat, action } of sim.log) {
        expect(ticTacToe.legalActions(state, seat)).toContainEqual(action)
        const res = ticTacToe.applyAction(state, seat, action, rng)
        if (!res.ok) throw new Error(res.error)
        state = res.state
      }
      expect(replay(ticTacToe, 2, seed, sim.log)).toEqual(sim.finalState)
    }
  })
})
