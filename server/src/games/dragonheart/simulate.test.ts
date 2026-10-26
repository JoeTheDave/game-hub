import { describe, expect, it } from 'vitest'
import { replay, simulate } from '../simulate.js'
import { seededRng, type SeatInfo } from '../types.js'
import { CAPACITY, CARDS, SPACES } from './data.js'
import { dragonheartModule as game, handMax, type DragonheartAction, type DragonheartState } from './engine.js'

const seats: SeatInfo[] = [
  { playerOrder: 0, screenName: 'P1', color: null },
  { playerOrder: 1, screenName: 'P2', color: null },
]

function allCards(s: DragonheartState): string[] {
  return [
    ...s.players.flatMap((p) => [...p.deck, ...p.hand, ...p.score]),
    ...SPACES.flatMap((sp) => s.spaces[sp]),
    ...s.belowShip,
    ...s.shipStacks.flat(),
  ]
}

function checkInvariants(s: DragonheartState) {
  // every card is in exactly one place
  const all = allCards(s)
  expect(all.length).toBe(CARDS.length)
  expect(new Set(all).size).toBe(CARDS.length)
  for (const sp of SPACES) if (CAPACITY[sp] > 0) expect(s.spaces[sp].length).toBeLessThan(CAPACITY[sp])
  expect(s.shipStacks.length).toBeLessThanOrEqual(4)
  for (const st of s.shipStacks) expect(st).toHaveLength(3)
  // the Great Dragon is in exactly one place
  expect(['board', 0, 1]).toContain(s.greatDragon)
  // after a turn's draw, no hand is over its maximum
  for (const seat of [0, 1] as const) expect(s.players[seat].hand.length).toBeLessThanOrEqual(handMax(s, seat))
}

/** Same loop as simulate(), checking invariants after every action. */
function playChecked(seed: number) {
  const rng = seededRng(seed)
  const agentRng = seededRng(seed ^ 0x9e3779b9)
  let { state } = game.setup(seats, rng)
  checkInvariants(state)
  let steps = 0
  while (!game.isFinished(state)) {
    const seat = game.activeSeats(state)[0]
    const legal = game.legalActions(state, seat)
    expect(legal.length).toBeGreaterThan(0)
    const action = legal[Math.floor(agentRng() * legal.length)]
    const r = game.applyAction(state, seat, action, rng)
    if (!r.ok) throw new Error(`legal action rejected: ${r.error}`)
    state = r.state
    checkInvariants(state)
    if (++steps > 500) throw new Error('game did not finish')
  }
  return { state, steps }
}

describe('Dragonheart headless simulation', () => {
  it('plays 300 invariant-checked random games to completion', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { state } = playChecked(seed)
      expect(state.result).not.toBeNull()
      expect(state.result!.winners.length).toBeGreaterThan(0)
      // capacity spaces never hold a full set once a play has resolved
      for (const sp of SPACES) if (CAPACITY[sp] > 0) expect(state.spaces[sp].length).toBeLessThan(CAPACITY[sp])
    }
  })

  it('runs 1,000 games via simulate() without errors and reports speed', () => {
    const start = performance.now()
    let stalled = 0
    let actions = 0
    for (let seed = 1; seed <= 1000; seed++) {
      const r = simulate(game, { players: 2, seed })
      if (r.stalled) stalled++
      actions += r.turns
    }
    const secs = (performance.now() - start) / 1000
    const rate = 1000 / secs
    console.log(`dragonheart: ${rate.toFixed(0)} games/sec, avg ${(actions / 1000).toFixed(1)} actions/game, stalled ${stalled}`)
    expect(stalled).toBe(0)
    expect(rate).toBeGreaterThan(50)
  })

  it('replays deterministically from seed + log and round-trips through JSON', () => {
    for (const seed of [3, 42, 999]) {
      const r = simulate<DragonheartState, DragonheartAction>(game, { players: 2, seed })
      expect(replay(game, 2, seed, r.log)).toEqual(r.finalState)
      expect(JSON.parse(JSON.stringify(r.finalState))).toEqual(r.finalState)
    }
  })
})
