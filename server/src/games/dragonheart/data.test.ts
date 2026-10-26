import { describe, expect, it } from 'vitest'
import { CAPACITY, CARDS, CARD_BY_ID, GREEN_DECK, KINDS, RED_DECK, type Kind } from './data.js'

const expected: Record<Kind, number[]> = {
  treasure: [4, 3, 3, 2, 2, 1, 1],
  fireDragon: [4, 3, 3, 2],
  petrified: [2, 2, 2, 2, 2],
  sorceress: [2, 2, 1, 1],
  troll: [3, 2, 1],
  dwarf: [3, 2, 2, 2, 1, 1, 1, 1, 1, 1],
  knight: [2, 1, 1, 1, 1],
  huntress: [2, 2, 1, 1, 1, 1],
  ship: [0, 0, 0, 0, 0, 0],
}

describe('Dragonheart card data', () => {
  it('has two identical 50-card decks worth 79 points each', () => {
    expect(GREEN_DECK).toHaveLength(50)
    expect(RED_DECK).toHaveLength(50)
    expect(CARDS).toHaveLength(100)
    for (const deck of [GREEN_DECK, RED_DECK]) {
      expect(deck.reduce((a, c) => a + c.points, 0)).toBe(79)
    }
    expect(GREEN_DECK.map((c) => [c.kind, c.points])).toEqual(RED_DECK.map((c) => [c.kind, c.points]))
  })

  it('matches the counted card list for every kind', () => {
    for (const kind of KINDS) {
      const values = GREEN_DECK.filter((c) => c.kind === kind).map((c) => c.points).sort((a, b) => b - a)
      expect(values).toEqual(expected[kind])
    }
  })

  it('uses unique ids prefixed by deck colour', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(100)
    expect(GREEN_DECK.every((c) => c.id.startsWith('g-') && c.deck === 'green')).toBe(true)
    expect(RED_DECK.every((c) => c.id.startsWith('r-') && c.deck === 'red')).toBe(true)
    expect(CARD_BY_ID['g-01'].kind).toBe('treasure')
  })

  it('has the board capacities from the printed outlines', () => {
    expect(CAPACITY).toMatchObject({ knight: 2, huntress: 3, ship: 3, dwarf: 4, treasure: 0, fireDragon: 0, petrified: 0, sorceress: 0, troll: 0 })
  })
})
