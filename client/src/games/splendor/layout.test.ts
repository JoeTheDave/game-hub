import { describe, expect, it } from 'vitest'
import { BANK_CHIP, BANK_Y, BLOCK_W, MARKET_BOTTOM, MARKET_X, planAnimation, zonesFor } from './TableView'
import { TOKEN_COUNT_SCALE } from './components'
import type { SplendorTableView } from '@games/splendor/engine'

describe('tabletop layout', () => {
  it('lays the bank row beneath the market, with room for the tallest stack and its count', () => {
    const tallestStackTop = BANK_Y - BANK_CHIP * 0.07 * 7 - BANK_CHIP * TOKEN_COUNT_SCALE * 1.3
    expect(tallestStackTop).toBeGreaterThan(MARKET_BOTTOM)
    expect(BANK_Y + BANK_CHIP).toBeLessThanOrEqual(1080)
  })

  it('gives every seat an open-table zone on the canvas that never overlaps the market', () => {
    for (const n of [2, 3, 4]) {
      const zones = zonesFor(n)
      expect(zones).toHaveLength(n)
      for (const z of zones) {
        expect(z.x).toBeGreaterThanOrEqual(0)
        expect(z.y).toBeGreaterThanOrEqual(0)
        expect(z.x + z.w).toBeLessThanOrEqual(1920)
        expect(z.y + z.h).toBeLessThanOrEqual(1080)
        const overlapsMarket = z.x < MARKET_X + BLOCK_W && z.x + z.w > MARKET_X
        expect(overlapsMarket).toBe(false)
      }
    }
  })
})

describe('refill flight', () => {
  it('flies from the deck straight into its own slot and flips in the same motion', () => {
    const deck = { x: 400, y: 200, w: 184, h: 257, r: 0 }
    const slot2 = { x: 400 + 2 * 200, y: 200, w: 184, h: 257, r: 0 }
    const slot1 = { x: 400 + 1 * 200, y: 200, w: 184, h: 257, r: 0 }
    const from = new Map([['deck-1', deck], ['slot-1-1', slot1], ['slot-1-2', slot2]])
    const to = new Map(from)
    const view = { board: { 1: [null, null, 't1-01', null], 2: [], 3: [] }, players: [] } as unknown as SplendorTableView
    const plan = planAnimation([{ type: 'slotRefilled', tier: 1, slot: 2, cardId: 't1-01' }], view, view, from, to, false)
    expect(plan.flyers).toHaveLength(1)
    const f = plan.flyers[0]
    expect(f.to).toEqual(slot2)
    expect(f.from).toEqual(deck)
    expect(f.flip).toBe(true)
    expect(plan.hidden).toEqual(['slot-1-2'])
    expect(f.duration).toBeGreaterThanOrEqual(500)
    expect(f.duration).toBeLessThanOrEqual(900)
  })
})
