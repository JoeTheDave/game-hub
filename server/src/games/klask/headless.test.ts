import { describe, expect, it } from 'vitest'
import { getGame } from '../registry.js'
import { simulate } from '../simulate.js'

describe('headless simulation of a real-time game', () => {
  it('the registered Klask module runs whole matches through simulateHeadless (what `npm run simulate -- klask` uses)', () => {
    const game = getGame('klask')!
    expect(game.realtime).toBe(true)
    expect(typeof game.simulateHeadless).toBe('function')
    for (const players of [2, 3, 4]) {
      const r = game.simulateHeadless!({ players, seed: players })
      expect(r.stalled).toBe(false)
      expect(r.winners).toHaveLength(1)
      // at least 6 points end a match (2p first to 6; 3-4p everyone else loses 6 lives)
      expect(r.turns).toBeGreaterThanOrEqual(6 * (players - 1))
    }
  })

  it('the generic simulate() no longer crashes on a seat with no agent (the table authority, seat −1)', () => {
    const game = getGame('klask')!
    const r = simulate(game, { players: 2, seed: 3, maxSteps: 200 })
    expect(r.turns).toBeGreaterThan(0)
  })
})
