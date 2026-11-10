import { describe, expect, it } from 'vitest'
import { seededRng, type SeatInfo } from '../types.js'
import { AUTHORITY_SEAT, START_LIVES, klaskModule, type KlaskAction, type KlaskState } from './engine.js'
import { simulateMatch } from './simulate.js'

const seats = (n: number): SeatInfo[] => Array.from({ length: n }, (_, i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))
const rng = seededRng(5)
const start = (n: number, options?: unknown) => klaskModule.setup(seats(n), seededRng(n), options).state
const point = (s: KlaskState, against: number, reason: 'goal' | 'klask' | 'biscuits' = 'goal') => {
  const r = klaskModule.applyAction(s, AUTHORITY_SEAT, { type: 'point', against, reason }, rng)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('klask engine', () => {
  it('sets up 6 lives each for 2-4 players, with the stylized option', () => {
    for (const n of [2, 3, 4]) {
      const s = start(n)
      expect(s.lives).toEqual(Array.from({ length: n }, () => START_LIVES))
      expect(s.alive.every(Boolean)).toBe(true)
      expect(s.serveSeat).toBeGreaterThanOrEqual(0)
      expect(s.serveSeat).toBeLessThan(n)
      expect(s.stylized).toBe(false)
    }
    expect(start(2, { stylized: true }).stylized).toBe(true)
    expect(() => klaskModule.setup(seats(5), rng)).toThrow()
    expect(klaskModule.realtime).toBe(true)
    expect(klaskModule.options).toEqual([{ key: 'stylized', label: 'Stylized table', type: 'boolean', default: false }])
  })

  it('only the table (authority) can report results; phones get nothing', () => {
    const s = start(2)
    for (const seat of [0, 1]) {
      const r = klaskModule.applyAction(s, seat, { type: 'point', against: 1 - seat, reason: 'goal' }, rng)
      expect(r.ok).toBe(false)
      expect(klaskModule.legalActions(s, seat)).toEqual([])
    }
    expect(klaskModule.activeSeats(s)).toEqual([AUTHORITY_SEAT])
    expect(klaskModule.legalActions(s, AUTHORITY_SEAT).length).toBe(2 * 3 + 1)
  })

  it('rejects junk without throwing', () => {
    const s = start(3)
    const junk = [null, 5, {}, { type: 'point' }, { type: 'point', against: 9, reason: 'goal' }, { type: 'point', against: 1.5, reason: 'goal' }, { type: 'point', against: 0, reason: 'nope' }, { type: 'x' }]
    for (const a of junk) expect(klaskModule.applyAction(s, AUTHORITY_SEAT, a as unknown as KlaskAction, rng).ok).toBe(false)
  })

  it('2 players: first to 6 wins (six points against the loser)', () => {
    let s = start(2)
    for (let i = 0; i < 5; i++) s = point(s, 1).state
    expect(s.result).toBeNull()
    expect(klaskModule.tableView(s, seats(2)).players[0].score).toBe(5)
    const r = point(s, 1, 'biscuits')
    expect(r.state.result).toEqual({ winners: [0] })
    expect(r.events.map((e) => e.type)).toEqual(['pointScored', 'eliminated', 'gameOver'])
    expect(klaskModule.summary!(r.state)).toEqual({ scores: [1, 0], winners: [0] })
    expect(klaskModule.applyAction(r.state, AUTHORITY_SEAT, { type: 'serve' }, rng).ok).toBe(false)
  })

  it('3-4 players: eliminated players are out, the next live player serves, last one standing wins', () => {
    let s = start(4)
    for (let i = 0; i < 6; i++) s = point(s, 2).state
    expect(s.alive).toEqual([true, true, false, true])
    expect(s.serveSeat).toBe(3)
    expect(klaskModule.applyAction(s, AUTHORITY_SEAT, { type: 'point', against: 2, reason: 'goal' }, rng).ok).toBe(false)
    expect(klaskModule.legalActions(s, AUTHORITY_SEAT).filter((a) => a.type === 'point' && a.against === 2)).toEqual([])
    for (let i = 0; i < 6; i++) s = point(s, 0, 'klask').state
    for (let i = 0; i < 5; i++) s = point(s, 3).state
    expect(s.result).toBeNull()
    s = point(s, 3).state
    expect(s.result).toEqual({ winners: [1] })
    expect(klaskModule.winners(s)).toEqual([1])
    expect(klaskModule.summary!(s)).toEqual({ scores: [0, 1, 0, 0], winners: [1] })
    expect(klaskModule.isFinished(s)).toBe(true)
    expect(klaskModule.activeSeats(s)).toEqual([])
  })

  it('views are public and identical apart from the player fields', () => {
    const s = point(start(3), 0, 'klask').state
    const tv = klaskModule.tableView(s, seats(3))
    expect(tv.players.map((p) => p.lives)).toEqual([5, 6, 6])
    expect(tv.lastPoint).toEqual({ against: 0, reason: 'klask', eliminated: false })
    const pv = klaskModule.playerView(s, 1, seats(3))
    expect(pv).toEqual({ ...tv, me: 1, alive: true })
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  it.each([2, 3, 4])('%i players: bot matches with real physics finish, lives never go negative', (n) => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = simulateMatch({ players: n, seed })
      expect(r.stalled).toBe(false)
      expect(r.minLives).toBeGreaterThanOrEqual(0)
      expect(r.state.result!.winners).toHaveLength(1)
      expect(r.points).toBeGreaterThanOrEqual(6)
    }
    expect(simulateMatch({ players: n, seed: 3 })).toEqual(simulateMatch({ players: n, seed: 3 }))
  })
})
