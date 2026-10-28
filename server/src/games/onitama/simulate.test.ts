import { describe, expect, it } from 'vitest'
import { replay, simulate } from '../simulate.js'
import { seededRng, type SeatInfo } from '../types.js'
import { onitamaModule, type OnitamaState } from './engine.js'

const seats: SeatInfo[] = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))

function checkInvariants(s: OnitamaState) {
  // 5 cards, all distinct, exactly the dealt ones.
  const cards = [...s.hands[0], ...s.hands[1], s.side]
  expect(cards).toHaveLength(5)
  expect(new Set(cards).size).toBe(5)
  expect(cards.slice().sort()).toEqual(s.dealt.slice().sort())
  expect(s.hands[0]).toHaveLength(2)
  expect(s.hands[1]).toHaveLength(2)
  // 10 pieces total; at most 5 per side on the board; never two on one square.
  expect(s.pieces).toHaveLength(10)
  const onBoard = s.pieces.filter((p) => p.capturedBy === undefined)
  for (const c of ['red', 'blue'] as const) expect(onBoard.filter((p) => p.color === c).length).toBeLessThanOrEqual(5)
  expect(new Set(onBoard.map((p) => `${p.x},${p.y}`)).size).toBe(onBoard.length)
  for (const p of onBoard) expect(p.x >= 0 && p.x < 5 && p.y >= 0 && p.y < 5).toBe(true)
  // Each side keeps exactly one master until it is captured, which ends the game.
  for (const c of ['red', 'blue'] as const) {
    const masters = onBoard.filter((p) => p.color === c && p.master).length
    if (!s.result) expect(masters).toBe(1)
    else expect(masters).toBeLessThanOrEqual(1)
  }
  // A captured piece is credited to the other colour's seat.
  for (const p of s.pieces) if (p.capturedBy !== undefined) expect(s.colors[p.capturedBy]).not.toBe(p.color)
}

describe('onitama headless simulation', () => {
  it('plays 300 random games with every invariant checked after every action', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seededRng(seed)
      let { state } = onitamaModule.setup(seats, rng, { senseisPath: seed % 2 === 0 })
      checkInvariants(state)
      while (!onitamaModule.isFinished(state)) {
        const seat = onitamaModule.activeSeats(state)[0]
        const legal = onitamaModule.legalActions(state, seat)
        expect(legal.length).toBeGreaterThan(0)
        const res = onitamaModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)], rng)
        if (!res.ok) throw new Error(res.error)
        state = res.state
        checkInvariants(state)
      }
      const s = onitamaModule.summary!(state)!
      expect(s.scores.reduce((a, b) => a + b, 0)).toBe(state.result!.way === 'draw' ? 0 : 1)
    }
  })

  it('runs 1,000 games via simulate(), deterministically replayable and JSON round-trippable', () => {
    const t0 = performance.now()
    const ways = { stone: 0, stream: 0, draw: 0 }
    for (let seed = 1; seed <= 1000; seed++) {
      const r = simulate(onitamaModule, { players: 2, seed })
      expect(r.stalled).toBe(false)
      ways[r.finalState.result!.way]++
      if (seed % 100 === 0) {
        expect(replay(onitamaModule, 2, seed, r.log)).toEqual(r.finalState)
        expect(JSON.parse(JSON.stringify(r.finalState))).toEqual(r.finalState)
      }
    }
    const perSec = Math.round(1000 / ((performance.now() - t0) / 1000))
    console.log(`onitama simulate(): ${perSec} games/sec; endings`, ways)
    expect(ways.stone + ways.stream).toBeGreaterThan(900)
  })
})
