import { describe, expect, it } from 'vitest'
import { replay, simulate } from '../simulate.js'
import { seededRng, type SeatInfo } from '../types.js'
import { CARDS } from './data.js'
import { splendorModule as game, points, tokenTotal, type SplendorAction, type SplendorState } from './engine.js'

const seats = (n: number): SeatInfo[] =>
  Array.from({ length: n }, (_, i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))

function checkInvariants(s: SplendorState, n: number) {
  const supply = n === 2 ? 4 : n === 3 ? 5 : 7
  for (const t of ['white', 'blue', 'green', 'red', 'black', 'gold'] as const) {
    const held = s.players.reduce((a, p) => a + p.tokens[t], 0)
    expect(s.bank[t] + held).toBe(t === 'gold' ? 5 : supply)
    expect(s.bank[t]).toBeGreaterThanOrEqual(0)
  }
  for (const p of s.players) {
    if (s.pending === null) expect(tokenTotal(p.tokens)).toBeLessThanOrEqual(10)
    expect(p.reserved.length).toBeLessThanOrEqual(3)
  }
  for (const tier of [1, 2, 3] as const) {
    const faceUp = s.board[tier].filter(Boolean).length
    if (s.decks[tier].length > 0) expect(faceUp).toBe(4)
  }
  // every card is in exactly one place
  const all = [
    ...s.decks[1], ...s.decks[2], ...s.decks[3],
    ...[1, 2, 3].flatMap((t) => s.board[t as 1 | 2 | 3].filter((x): x is string => !!x)),
    ...s.players.flatMap((p) => [...p.cards, ...p.reserved.map((r) => r.id)]),
  ]
  expect(all.length).toBe(CARDS.length)
  expect(new Set(all).size).toBe(CARDS.length)
}

/** Same loop as simulate(), but checking invariants after every action. */
function playChecked(n: number, seed: number) {
  const rng = seededRng(seed)
  const agentRng = seededRng(seed ^ 0x9e3779b9)
  let { state } = game.setup(seats(n), rng)
  checkInvariants(state, n)
  let steps = 0
  while (!game.isFinished(state) && steps < 2000) {
    const seat = game.activeSeats(state)[0]
    const legal = game.legalActions(state, seat)
    expect(legal.length).toBeGreaterThan(0)
    const action = legal[Math.floor(agentRng() * legal.length)]
    const res = game.applyAction(state, seat, action, rng)
    if (!res.ok) throw new Error(`legal action rejected: ${res.error}`)
    state = res.state
    checkInvariants(state, n)
    for (const p of state.players) expect(points(p)).toBe(
      p.cards.reduce((a, id) => a + CARDS.find((c) => c.id === id)!.points, 0) + p.nobles.length * 3
    )
    steps++
  }
  return { finished: game.isFinished(state), steps }
}

describe('headless simulation', () => {
  it('plays 300 checked random games across 2/3/4 players with all invariants holding', () => {
    let finished = 0
    for (let i = 0; i < 300; i++) {
      const r = playChecked(2 + (i % 3), i)
      if (r.finished) finished++
    }
    console.log(`checked games finished: ${finished}/300`)
    expect(finished).toBeGreaterThan(0)
  }, 120_000)

  it('runs 1,000 random games via simulate() without errors and reports speed', () => {
    const counts = { 2: 0, 3: 0, 4: 0 } as Record<number, number>
    let stalled = 0
    let turns = 0
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) {
      const players = 2 + (i % 3)
      const r = simulate<SplendorState, SplendorAction>(game, { players, seed: 10_000 + i, maxSteps: 2000 })
      counts[players]++
      turns += r.turns
      if (r.stalled) stalled++
      else expect(r.winners.length).toBeGreaterThan(0)
    }
    const secs = (performance.now() - t0) / 1000
    console.log(
      `1000 games (2p/3p/4p = ${counts[2]}/${counts[3]}/${counts[4]}) in ${secs.toFixed(2)}s = ${(1000 / secs).toFixed(0)} games/s, avg ${(turns / 1000).toFixed(0)} actions/game, stalled ${stalled}`
    )
    expect(stalled).toBeLessThan(1000)
  }, 300_000)

  it('measures 2-player throughput', () => {
    const n = 500
    const t0 = performance.now()
    for (let i = 0; i < n; i++) simulate<SplendorState, SplendorAction>(game, { players: 2, seed: 50_000 + i, maxSteps: 2000 })
    const rate = n / ((performance.now() - t0) / 1000)
    console.log(`2-player throughput: ${rate.toFixed(0)} games/s`)
    expect(rate).toBeGreaterThan(50)
  }, 300_000)

  it('replays a game exactly from its seed and log', () => {
    for (const players of [2, 3, 4]) {
      const r = simulate<SplendorState, SplendorAction>(game, { players, seed: 777 + players, maxSteps: 2000 })
      const final = replay<SplendorState, SplendorAction>(game, players, r.seed, r.log)
      expect(final).toEqual(r.finalState)
      const again = simulate<SplendorState, SplendorAction>(game, { players, seed: 777 + players, maxSteps: 2000 })
      expect(again.log).toEqual(r.log)
    }
  })

  it('state round-trips through JSON unchanged', () => {
    const r = simulate<SplendorState, SplendorAction>(game, { players: 3, seed: 5, maxSteps: 200 })
    expect(JSON.parse(JSON.stringify(r.finalState))).toEqual(r.finalState)
  })
})
