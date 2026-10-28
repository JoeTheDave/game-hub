import { describe, expect, it } from 'vitest'
import { seededRng, type SeatInfo } from '../types.js'
import { BASE_CARDS, CARD_BY_ID, PLY_CAP } from './data.js'
import {
  applyAction,
  boardDelta,
  legalActions,
  onitamaModule,
  playerView,
  setup,
  summary,
  tableView,
  type OnitamaAction,
  type OnitamaState,
  type Piece,
} from './engine.js'

const seats: SeatInfo[] = [
  { playerOrder: 0, screenName: 'Ann', color: 'red' },
  { playerOrder: 1, screenName: 'Bo', color: 'blue' },
]

/** A fixed position: seat 0 is red (home row 0), seat 1 blue (home row 4). */
function fixture(over: Partial<OnitamaState> = {}, pieces?: Piece[]): OnitamaState {
  const base = setup(seats, seededRng(1)).state
  return {
    ...base,
    colors: ['red', 'blue'],
    pieces: pieces ?? base.pieces.map((p) => ({ ...p })),
    hands: [['tiger', 'crab'], ['monkey', 'crane']],
    side: 'boar',
    dealt: ['tiger', 'crab', 'monkey', 'crane', 'boar'],
    turn: 0,
    firstSeat: 0,
    ply: 0,
    lastMove: null,
    result: null,
    ...over,
  }
}

const piece = (id: string, color: 'red' | 'blue', x: number, y: number, master = false): Piece => ({ id, color, master, x, y })
const ok = (s: OnitamaState, seat: number, a: OnitamaAction) => {
  const r = applyAction(s, seat, a)
  if (!r.ok) throw new Error(r.error)
  return r
}
const err = (s: OnitamaState, seat: number, a: unknown) => {
  const r = applyAction(s, seat, a)
  if (r.ok) throw new Error('expected rejection')
  return r.error
}

describe('onitama setup', () => {
  it('places 1 master and 4 students per side on the home rows, with the masters on their temples', () => {
    const { state } = setup(seats, seededRng(3))
    expect(state.pieces).toHaveLength(10)
    for (const color of ['red', 'blue'] as const) {
      const mine = state.pieces.filter((p) => p.color === color)
      const row = color === 'red' ? 0 : 4
      expect(mine.every((p) => p.y === row)).toBe(true)
      expect(mine.filter((p) => p.master)).toEqual([expect.objectContaining({ x: 2, y: row })])
    }
  })

  it('deals 5 distinct cards (2, 2, side); the side card stamp picks the first player', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state, events } = setup(seats, seededRng(seed))
      const all = [...state.hands[0], ...state.hands[1], state.side]
      expect(new Set(all).size).toBe(5)
      expect(all.sort()).toEqual(state.dealt.slice().sort())
      expect(state.colors[state.turn]).toBe(CARD_BY_ID[state.side].stamp)
      expect(state.firstSeat).toBe(state.turn)
      expect(events[0]).toMatchObject({ type: 'gameStarted', firstSeat: state.turn })
    }
  })

  it('randomizes which seat plays red (so a Rematch re-draws colours)', () => {
    const reds = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) reds.add(setup(seats, seededRng(seed)).state.colors.indexOf('red'))
    expect([...reds].sort()).toEqual([0, 1])
  })

  it('uses only base cards when Sensei’s Path is off, and can draw expansion cards when on (default)', () => {
    const base = new Set(BASE_CARDS.map((c) => c.id))
    let sawExpansion = false
    for (let seed = 1; seed <= 60; seed++) {
      expect(setup(seats, seededRng(seed), { senseisPath: false }).state.dealt.every((c) => base.has(c))).toBe(true)
      if (setup(seats, seededRng(seed)).state.dealt.some((c) => !base.has(c))) sawExpansion = true
    }
    expect(sawExpansion).toBe(true)
    expect(onitamaModule.options).toEqual([{ key: 'senseisPath', label: "Include Sensei's Path cards", type: 'boolean', default: true }])
  })

  it('is deterministic for a seed and rejects other player counts', () => {
    expect(setup(seats, seededRng(9)).state).toEqual(setup(seats, seededRng(9)).state)
    expect(() => setup(seats.slice(0, 1), seededRng(1))).toThrow()
  })
})

describe('onitama movement', () => {
  it('mirrors card offsets per side: forward is +y for red, -y for blue; right is -x for red, +x for blue', () => {
    expect(boardDelta('red', [0, 2])).toEqual([0, 2])
    expect(boardDelta('blue', [0, 2])).toEqual([0, -2])
    expect(boardDelta('red', [1, 0])).toEqual([-1, 0])
    expect(boardDelta('blue', [1, 0])).toEqual([1, 0])
  })

  it('moves a piece by a card offset, stays on the board, and never lands on its own piece', () => {
    const s = fixture()
    const moves = legalActions(s, 0).filter((a) => a.type === 'move')
    // Tiger: forward 2 / back 1 (back is off-board from the home row). Crab: forward 1, sideways 2.
    expect(moves.some((m) => m.type === 'move' && m.card === 'tiger' && m.from[0] === 0 && m.to[1] === 2)).toBe(true)
    for (const m of moves) {
      if (m.type !== 'move') continue
      expect(m.to.every((n) => n >= 0 && n <= 4)).toBe(true)
      expect(s.pieces.some((p) => p.color === 'red' && p.x === m.to[0] && p.y === m.to[1])).toBe(false)
    }
    // Crab sideways by 2 from the home row would land on a friend → excluded.
    expect(moves.some((m) => m.type === 'move' && m.card === 'crab' && m.to[1] === 0)).toBe(false)
  })

  it('rotates the used card to the side and gives the mover the old side card; then it is the opponent’s turn', () => {
    const s = fixture()
    const r = ok(s, 0, { type: 'move', card: 'tiger', from: [0, 0], to: [0, 2] })
    expect(r.state.hands[0].sort()).toEqual(['boar', 'crab'])
    expect(r.state.side).toBe('tiger')
    expect(r.state.turn).toBe(1)
    expect(r.state.ply).toBe(1)
    expect(r.events.map((e) => e.type)).toEqual(['pieceMoved', 'cardRotated', 'cardTaken', 'turnChanged'])
    expect(r.events[0]).toMatchObject({ seat: 0, piece: 'red-1', from: [0, 0], to: [0, 2], card: 'tiger' })
    expect(r.events[1]).toMatchObject({ seat: 0, card: 'tiger', toSide: true })
    expect(r.events[2]).toMatchObject({ seat: 0, card: 'boar' })
    // the input state is untouched
    expect(s.side).toBe('boar')
    expect(s.pieces.find((p) => p.id === 'red-1')).toMatchObject({ x: 0, y: 0 })
  })

  it('captures an enemy piece by landing on it', () => {
    const pieces = [piece('red-m', 'red', 2, 0, true), piece('red-1', 'red', 0, 1), piece('blue-m', 'blue', 2, 4, true), piece('blue-1', 'blue', 0, 3)]
    const s = fixture({}, pieces)
    const r = ok(s, 0, { type: 'move', card: 'tiger', from: [0, 1], to: [0, 3] })
    expect(r.state.pieces.find((p) => p.id === 'blue-1')?.capturedBy).toBe(0)
    expect(r.events).toContainEqual({ type: 'pieceCaptured', piece: 'blue-1', by: 0 })
    expect(tableView(r.state, seats).players[0].captured.map((p) => p.id)).toEqual(['blue-1'])
    expect(tableView(r.state, seats).board.some((p) => p.id === 'blue-1')).toBe(false)
  })

  it('rejects junk: wrong turn, card not held, illegal destinations, malformed squares and types (never throws)', () => {
    const s = fixture()
    expect(err(s, 1, { type: 'move', card: 'monkey', from: [1, 4], to: [0, 3] })).toMatch(/turn/i)
    expect(err(s, 0, { type: 'move', card: 'monkey', from: [0, 0], to: [1, 1] })).toMatch(/hand/i)
    expect(err(s, 0, { type: 'move', card: 'tiger', from: [0, 0], to: [0, 1] })).toMatch(/not allowed/i)
    expect(err(s, 0, { type: 'move', card: 'tiger', from: [0, 0], to: [0, 9] })).toMatch(/invalid/i)
    for (const junk of [null, 5, 'x', {}, { type: 'move' }, { type: 'move', card: 'tiger', from: 'a', to: [0, 2] }, { type: 'move', card: 'tiger', from: [NaN, 0], to: [0, 2] }, { type: 'jump', card: 'tiger' }, { type: 'move', card: '__proto__', from: [0, 0], to: [0, 2] }]) {
      expect(() => applyAction(s, 0, junk)).not.toThrow()
      expect(applyAction(s, 0, junk).ok).toBe(false)
    }
  })
})

describe('onitama winning, passing and the ply cap', () => {
  it('Way of the Stone: capturing the enemy master wins', () => {
    const pieces = [piece('red-m', 'red', 2, 0, true), piece('red-1', 'red', 2, 2), piece('blue-m', 'blue', 2, 4, true), piece('blue-1', 'blue', 0, 4)]
    const s = fixture({}, pieces)
    const r = ok(s, 0, { type: 'move', card: 'tiger', from: [2, 2], to: [2, 4] })
    expect(r.state.result).toEqual({ winners: [0], way: 'stone' })
    expect(r.events.at(-1)).toEqual({ type: 'gameOver', winners: [0], way: 'stone' })
    expect(onitamaModule.isFinished(r.state)).toBe(true)
    expect(onitamaModule.activeSeats(r.state)).toEqual([])
    expect(legalActions(r.state, 1)).toEqual([])
    expect(summary(r.state)).toEqual({ scores: [1, 0], winners: [0] })
  })

  it('Way of the Stream: the master reaching the enemy temple arch wins (only the master)', () => {
    const pieces = [piece('red-m', 'red', 2, 2, true), piece('red-1', 'red', 1, 2), piece('blue-m', 'blue', 4, 4, true)]
    const s = fixture({}, pieces)
    const r = ok(s, 0, { type: 'move', card: 'tiger', from: [2, 2], to: [2, 4] })
    expect(r.state.result).toEqual({ winners: [0], way: 'stream' })
    // a student on the temple does not win
    const s2 = fixture({}, [piece('red-m', 'red', 0, 0, true), piece('red-1', 'red', 2, 2), piece('blue-m', 'blue', 4, 4, true)])
    expect(ok(s2, 0, { type: 'move', card: 'tiger', from: [2, 2], to: [2, 4] }).state.result).toBeNull()
  })

  it('a master may move onto an attacked square (official rule); the phone gets a danger warning instead', () => {
    // Blue's monkey (diagonals) from (1,3) attacks (2,2); red's master moves there with tiger.
    const pieces = [piece('red-m', 'red', 2, 0, true), piece('blue-m', 'blue', 4, 4, true), piece('blue-1', 'blue', 1, 3)]
    const s = fixture({}, pieces)
    const view = playerView(s, 0, seats)
    const opt = view.options.find((o) => o.action.type === 'move' && o.action.from[0] === 2 && o.action.to[1] === 2)!
    expect(opt).toBeDefined()
    expect(opt.danger).toBe(true)
    expect(applyAction(s, 0, opt.action).ok).toBe(true)
    expect(view.danger).toContainEqual([2, 2])
  })

  it('with no legal move a player must pass a card (and only then)', () => {
    // With moves available, passing is refused.
    expect(err(fixture(), 0, { type: 'pass', card: 'tiger' })).toMatch(/cannot pass/i)
    // Red's whole army on blue's home row (y=4), holding Boar (left/forward/right) and Crab
    // (forward, 2 sideways): forward leaves the board and every sideways step hits a friend.
    const row = [0, 1, 2, 3, 4].map((x) => piece(x === 0 ? 'red-m' : `red-${x}`, 'red', x, 4, x === 0))
    const stuck: OnitamaState | null = fixture({ hands: [['boar', 'crab'], ['monkey', 'ox']], side: 'tiger' }, [...row, piece('blue-m', 'blue', 2, 0, true)])
    expect(stuck).not.toBeNull()
    const t = stuck!
    expect(legalActions(t, 0)).toEqual(t.hands[0].map((card) => ({ type: 'pass', card })))
    const card = t.hands[0][0]
    const r = ok(t, 0, { type: 'pass', card })
    expect(r.state.side).toBe(card)
    expect(r.state.hands[0]).toContain('tiger')
    expect(r.state.turn).toBe(1)
    expect(r.events[0]).toEqual({ type: 'passed', seat: 0, card })
    expect(err(t, 0, { type: 'move', card, from: [0, 4], to: [0, 3] })).toMatch(/not allowed/i)
  })

  it('ends in a draw at the ply cap', () => {
    const s = fixture({ ply: PLY_CAP - 1 })
    const r = ok(s, 0, { type: 'move', card: 'tiger', from: [0, 0], to: [0, 2] })
    expect(r.state.result).toEqual({ winners: [], way: 'draw' })
    expect(summary(r.state)).toEqual({ scores: [0, 0], winners: [] })
  })
})

describe('onitama views', () => {
  it('are public and identical for both phones apart from the per-seat helpers', () => {
    const { state } = setup(seats, seededRng(5))
    const tv = tableView(state, seats)
    expect(tv.board).toHaveLength(10)
    expect(tv.players.map((p) => p.side).sort()).toEqual(['blue', 'red'])
    expect(tv.sideFor).toBe(state.turn)
    for (const seat of [0, 1]) {
      const v = playerView(state, seat, seats)
      const { me, isMyTurn, myColor, legalActions: la, options, danger, ...rest } = v
      expect(rest).toEqual(tv)
      expect(me).toBe(seat)
      expect(isMyTurn).toBe(seat === state.turn)
      expect(myColor).toBe(state.colors[seat])
      expect(options.map((o) => o.action)).toEqual(la)
      expect(Array.isArray(danger)).toBe(true)
      if (seat !== state.turn) expect(la).toEqual([])
    }
    expect(JSON.parse(JSON.stringify(tv))).toEqual(tv)
  })
})
