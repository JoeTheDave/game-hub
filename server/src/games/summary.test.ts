import { describe, expect, it } from 'vitest'
import { simulate } from './simulate.js'
import dragonheart from './dragonheart/index.js'
import { splendor } from './splendor/index.js'
import { points } from './splendor/engine.js'
import { ticTacToe } from './tic-tac-toe/index.js'
import type { GameModule } from './types.js'

/** Every game's `summary` (the match-history record) agrees with its own result. */
describe('game summaries for match history', () => {
  it('Dragonheart: final scores (dragon +3 included) and winners', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { finalState, winners } = simulate(dragonheart, { players: 2, seed })
      const s = dragonheart.summary!(finalState)!
      expect(s.scores).toEqual(finalState.result!.scores)
      expect(s.winners).toEqual(winners)
      const top = Math.max(...s.scores)
      for (const w of s.winners) expect(s.scores[w]).toBe(top)
    }
  })

  it('Splendor: each seat\'s points and the winners', () => {
    for (const players of [2, 3, 4]) {
      const { finalState, winners } = simulate(splendor, { players, seed: players * 11 })
      const s = splendor.summary!(finalState)!
      expect(s.scores).toEqual(finalState.players.map((p) => points(p)))
      expect(s.winners).toEqual(winners)
    }
  })

  it('Tic-tac-toe: a win scores 1, a draw scores 0–0', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { finalState, winners } = simulate(ticTacToe as GameModule<unknown, unknown>, { players: 2, seed })
      const s = ticTacToe.summary!(finalState as never)!
      expect(s.winners).toEqual(winners)
      expect(s.scores).toEqual([0, 1].map((seat) => (winners.includes(seat) ? 1 : 0)))
    }
  })

  it('is null while a game is still in progress', () => {
    const seats = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i}`, color: null }))
    expect(dragonheart.summary!(dragonheart.setup(seats, () => 0.5).state)).toBeNull()
    expect(splendor.summary!(splendor.setup(seats, () => 0.5).state)).toBeNull()
  })
})
