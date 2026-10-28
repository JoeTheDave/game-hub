import { describe, expect, it } from 'vitest'
import { BASE_CARDS, CARDS, CARD_BY_ID } from './data.js'

describe('onitama card data', () => {
  it('has 32 cards with unique ids, 16 of them in the base game', () => {
    expect(CARDS).toHaveLength(32)
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(32)
    expect(BASE_CARDS.map((c) => c.name).sort()).toEqual(
      ['Boar', 'Cobra', 'Crab', 'Crane', 'Dragon', 'Eel', 'Elephant', 'Frog', 'Goose', 'Horse', 'Mantis', 'Monkey', 'Ox', 'Rabbit', 'Rooster', 'Tiger'].sort()
    )
  })

  it('matches the official base cards (moves as [right, forward] and stamps)', () => {
    const official: Record<string, { stamp: string; moves: [number, number][] }> = {
      tiger: { stamp: 'blue', moves: [[0, 2], [0, -1]] },
      crab: { stamp: 'blue', moves: [[-2, 0], [0, 1], [2, 0]] },
      monkey: { stamp: 'blue', moves: [[-1, 1], [-1, -1], [1, 1], [1, -1]] },
      crane: { stamp: 'blue', moves: [[-1, -1], [0, 1], [1, -1]] },
      dragon: { stamp: 'red', moves: [[-2, 1], [2, 1], [-1, -1], [1, -1]] },
      elephant: { stamp: 'red', moves: [[-1, 1], [-1, 0], [1, 1], [1, 0]] },
      mantis: { stamp: 'red', moves: [[-1, 1], [0, -1], [1, 1]] },
      boar: { stamp: 'red', moves: [[-1, 0], [0, 1], [1, 0]] },
      frog: { stamp: 'red', moves: [[-2, 0], [-1, 1], [1, -1]] },
      goose: { stamp: 'blue', moves: [[-1, 1], [-1, 0], [1, 0], [1, -1]] },
      horse: { stamp: 'red', moves: [[-1, 0], [0, 1], [0, -1]] },
      ox: { stamp: 'blue', moves: [[0, 1], [1, 0], [0, -1]] },
      rabbit: { stamp: 'blue', moves: [[-1, -1], [1, 1], [2, 0]] },
      rooster: { stamp: 'red', moves: [[-1, 0], [-1, -1], [1, 1], [1, 0]] },
      eel: { stamp: 'blue', moves: [[-1, 1], [-1, -1], [1, 0]] },
      cobra: { stamp: 'red', moves: [[-1, 0], [1, 1], [1, -1]] },
    }
    const key = (m: [number, number][]) => m.map(([x, y]) => `${x},${y}`).sort().join(' ')
    for (const [id, o] of Object.entries(official)) {
      expect(CARD_BY_ID[id].stamp, id).toBe(o.stamp)
      expect(key(CARD_BY_ID[id].moves), id).toBe(key(o.moves))
    }
  })

  it('gives every card a quote, a kanji key and in-range moves that never stay put', () => {
    for (const c of CARDS) {
      expect(c.text.length).toBeGreaterThan(10)
      expect(c.kanjiKey).toMatch(/^[a-z]+$/)
      expect(c.moves.length).toBeGreaterThanOrEqual(2)
      for (const [x, y] of c.moves) {
        expect(Math.abs(x)).toBeLessThanOrEqual(2)
        expect(Math.abs(y)).toBeLessThanOrEqual(2)
        expect(x !== 0 || y !== 0).toBe(true)
      }
    }
    // stamps are split evenly in each set
    expect(BASE_CARDS.filter((c) => c.stamp === 'red')).toHaveLength(8)
    expect(CARDS.filter((c) => c.stamp === 'red')).toHaveLength(16)
  })
})
