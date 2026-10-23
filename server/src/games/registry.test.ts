import { describe, expect, it } from 'vitest'
import { GAMES, getGame } from './registry.js'

describe('game registry contract', () => {
  it.each(Object.entries(GAMES))('%s implements the GameModule contract', (slug, mod) => {
    expect(mod.slug).toBe(slug)
    expect(mod.name.length).toBeGreaterThan(0)
    expect(mod.minPlayers).toBeGreaterThanOrEqual(1)
    expect(mod.minPlayers).toBeLessThanOrEqual(mod.maxPlayers)
    for (const fn of ['setup', 'applyAction', 'tableView', 'playerView', 'isFinished', 'activeSeats', 'legalActions', 'winners'] as const) {
      expect(typeof mod[fn]).toBe('function')
    }
  })

  it.each(Object.entries(GAMES))('%s state is plain JSON after setup', (_slug, mod) => {
    let n = 0
    const rng = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
    const seats = Array.from({ length: mod.minPlayers }, (_, i) => ({ playerOrder: i, screenName: `P${i}`, color: null }))
    const { state } = mod.setup(seats, rng)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('does not resolve prototype keys as games', () => {
    expect(getGame('toString')).toBeUndefined()
    expect(getGame('__proto__')).toBeUndefined()
  })
})
