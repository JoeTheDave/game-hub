import { describe, expect, it } from 'vitest'
import { CARDS, GEMS, NOBLES } from './data.js'

describe('splendor data', () => {
  it('has 40/30/20 cards per tier with unique ids', () => {
    expect(CARDS.filter((c) => c.tier === 1)).toHaveLength(40)
    expect(CARDS.filter((c) => c.tier === 2)).toHaveLength(30)
    expect(CARDS.filter((c) => c.tier === 3)).toHaveLength(20)
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(90)
  })

  it('has 8/6/4 cards of each bonus per tier', () => {
    for (const [tier, n] of [[1, 8], [2, 6], [3, 4]] as const) {
      for (const g of GEMS) {
        expect(CARDS.filter((c) => c.tier === tier && c.bonus === g)).toHaveLength(n)
      }
    }
  })

  it('matches the point distributions', () => {
    const dist = (tier: number) => {
      const out: Record<number, number> = {}
      for (const c of CARDS.filter((x) => x.tier === tier)) out[c.points] = (out[c.points] ?? 0) + 1
      return out
    }
    expect(dist(1)).toEqual({ 0: 35, 1: 5 })
    expect(dist(2)).toEqual({ 1: 10, 2: 15, 3: 5 })
    expect(dist(3)).toEqual({ 3: 5, 4: 10, 5: 5 })
  })

  it('has 10 nobles worth 3 with 9 or 8 required bonuses', () => {
    expect(NOBLES).toHaveLength(10)
    for (const n of NOBLES) {
      expect(n.points).toBe(3)
      const total = Object.values(n.requires).reduce((a, b) => a + (b ?? 0), 0)
      expect([8, 9]).toContain(total)
    }
  })

  it('every card has a cost and a scene key', () => {
    for (const c of CARDS) {
      expect(Object.values(c.cost).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0)
      expect(c.scene).toBe(`t${c.tier}-${c.bonus}`)
    }
  })
})
