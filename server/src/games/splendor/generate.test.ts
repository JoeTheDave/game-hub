import { describe, expect, it } from 'vitest'
import { seededRng } from '../types.js'
import { CARDS, GEMS, TIERS } from './data.js'
import { MAX_COLOUR_SPREAD, generateDeck, validateDeck } from './generate.js'

const shape = (cost: Record<string, number | undefined>) =>
  Object.values(cost)
    .filter((n): n is number => !!n)
    .sort((a, b) => b - a)
    .join('-')

describe('randomized card generator', () => {
  it('produces valid, balanced decks with the real set’s structure across many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const deck = generateDeck(seededRng(seed))
      expect(validateDeck(deck), `seed ${seed}`).toBeNull()
      expect(deck).toHaveLength(90)
      for (const tier of TIERS) {
        const mine = deck.filter((c) => c.tier === tier)
        const ref = CARDS.filter((c) => c.tier === tier)
        // each generated card keeps its template's bonus, points, cost shape and own-colour amount
        mine.forEach((c, i) => {
          const t = ref[i]
          expect(c.bonus).toBe(t.bonus)
          expect(c.points).toBe(t.points)
          expect(shape(c.cost)).toBe(shape(t.cost))
          expect(c.cost[c.bonus] ?? 0).toBe(t.cost[t.bonus] ?? 0)
          expect(c.scene).toBe(`t${tier}-${c.bonus}`)
        })
        const totals = GEMS.map((g) => mine.reduce((a, c) => a + (c.cost[g] ?? 0), 0))
        expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(MAX_COLOUR_SPREAD[tier])
      }
    }
  })

  it('is deterministic for a seed, differs between seeds, and tags ids per deck', () => {
    const a = generateDeck(seededRng(42))
    const b = generateDeck(seededRng(42))
    const c = generateDeck(seededRng(43))
    expect(a).toEqual(b)
    expect(a.map((x) => x.cost)).not.toEqual(c.map((x) => x.cost))
    expect(new Set(a.map((x) => x.id)).size).toBe(90)
    expect(a.every((x) => /^x[0-9a-z]{4}-[123]-\d\d$/.test(x.id))).toBe(true)
    expect(a[0].id.slice(0, 5)).not.toBe(c[0].id.slice(0, 5))
  })

  it('rejects broken decks', () => {
    const deck = generateDeck(seededRng(5))
    expect(validateDeck(deck.slice(1))).toMatch(/tier 1/)
    const dup = deck.map((c, i) => (i === 1 ? { ...c, bonus: deck[0].bonus, points: deck[0].points, cost: deck[0].cost } : c))
    expect(validateDeck(dup)).toMatch(/tier 1/)
  })
})
