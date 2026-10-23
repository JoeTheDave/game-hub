import { describe, expect, it } from 'vitest'
import { adjustDiscard, findReserve, gemSelectable, selectionAction, toggleGem } from './logic'
import type { SplendorAction } from '@games/splendor/engine'

const allTake3: SplendorAction[] = [
  { type: 'take3', gems: ['white', 'blue', 'green'] },
  { type: 'take3', gems: ['white', 'blue', 'red'] },
  { type: 'take3', gems: ['white', 'green', 'red'] },
  { type: 'take3', gems: ['blue', 'green', 'red'] },
  { type: 'take2', gem: 'red' },
]

describe('gem selection', () => {
  it('builds a take-3 pick from distinct gems', () => {
    let sel = toggleGem([], 'white', allTake3)
    sel = toggleGem(sel, 'blue', allTake3)
    expect(selectionAction(sel, allTake3)).toBeNull()
    sel = toggleGem(sel, 'green', allTake3)
    expect(selectionAction(sel, allTake3)).toEqual({ type: 'take3', gems: ['white', 'blue', 'green'] })
  })

  it('does not allow a 4th distinct gem or a colour outside any legal set', () => {
    const sel = toggleGem(['white', 'blue', 'green'], 'red', allTake3)
    // red can't extend the pick, so it starts a fresh pick
    expect(sel).toEqual(['red'])
    expect(toggleGem([], 'black', allTake3)).toEqual([])
    expect(gemSelectable('black', allTake3)).toBe(false)
  })

  it('doubles a lone gem into take-2 only when legal', () => {
    expect(toggleGem(['red'], 'red', allTake3)).toEqual(['red', 'red'])
    expect(selectionAction(['red', 'red'], allTake3)).toEqual({ type: 'take2', gem: 'red' })
    // blue has no take2: tapping it again deselects
    expect(toggleGem(['blue'], 'blue', allTake3)).toEqual([])
    // tapping the doubled gem clears it
    expect(toggleGem(['red', 'red'], 'red', allTake3)).toEqual([])
  })

  it('removes a gem from a multi-gem pick', () => {
    expect(toggleGem(['white', 'blue'], 'white', allTake3)).toEqual(['blue'])
  })

  it('accepts a 2-gem take3 when the engine lists one (fewer colours left)', () => {
    const legal: SplendorAction[] = [{ type: 'take3', gems: ['white', 'blue'] }]
    const sel = toggleGem(toggleGem([], 'white', legal), 'blue', legal)
    expect(selectionAction(sel, legal)).toEqual(legal[0])
  })
})

describe('reserve lookup', () => {
  it('distinguishes board slots from the deck', () => {
    const legal: SplendorAction[] = [
      { type: 'reserve', tier: 1, slot: 2 },
      { type: 'reserve', tier: 1, fromDeck: true },
    ]
    expect(findReserve(legal, 1, 2)).toEqual(legal[0])
    expect(findReserve(legal, 1, 'deck')).toEqual(legal[1])
    expect(findReserve(legal, 2, 'deck')).toBeNull()
  })
})

describe('discard picker', () => {
  const held = { white: 3, blue: 0, green: 2, red: 4, black: 1, gold: 1 }
  it('never exceeds holdings or the amount owed', () => {
    let pick = adjustDiscard({}, 'white', 1, held, 2)
    pick = adjustDiscard(pick, 'white', 1, held, 2)
    expect(pick).toEqual({ white: 2 })
    expect(adjustDiscard(pick, 'red', 1, held, 2)).toEqual({ white: 2 })
    expect(adjustDiscard({}, 'blue', 1, held, 2)).toEqual({})
    expect(adjustDiscard({ white: 1 }, 'white', -1, held, 2)).toEqual({})
  })
})
