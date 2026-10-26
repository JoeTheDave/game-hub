import { describe, expect, it } from 'vitest'
import { BANK_CHIP, BANK_Y, BLOCK_W, MARKET_BOTTOM, MARKET_X, glowRect, glowTone, planAnimation, spotLayout, zonesFor } from './TableView'
import { SEAT_HEX, TOKEN_COUNT_SCALE } from './components'
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

describe('player zones', () => {
  it('leaves the same table between a seat and the screen edge as between it and the market (±4px)', () => {
    for (const n of [2, 3, 4]) {
      for (const z of zonesFor(n)) {
        const { left, slotsW } = spotLayout(z)
        const right = left + slotsW
        const onLeft = z.x < MARKET_X
        const toEdge = onLeft ? left : 1920 - right
        const toMarket = onLeft ? MARKET_X - right : left - (MARKET_X + BLOCK_W)
        expect(toEdge).toBeGreaterThan(8)
        expect(Math.abs(toEdge - toMarket)).toBeLessThanOrEqual(4)
      }
    }
  })

  it("keeps each seat's pieces (tokens, tableau, reserved pile, nobles) inside its zone", () => {
    for (const n of [2, 3, 4]) {
      for (const z of zonesFor(n)) {
        const { top, contentH, lowY, pr } = spotLayout(z)
        expect(top).toBeGreaterThanOrEqual(z.y)
        expect(top + contentH).toBeLessThanOrEqual(z.y + z.h + 1)
        expect(lowY + pr.noble).toBeLessThanOrEqual(z.y + z.h + 1)
        // the reserved pile (three backs, stepped) fits in the tableau's vertical budget
        const miniH = pr.mini * (88 / 63)
        expect(miniH + 2 * miniH * 0.22).toBeLessThanOrEqual(pr.tableauCap)
      }
    }
  })

  it("bounds each seat's light pool to about a quarter of the table, even for the lone side seat", () => {
    for (const n of [2, 3, 4]) {
      for (const z of zonesFor(n)) {
        const g = glowRect(z)
        expect(g.h).toBeLessThanOrEqual(1080 / 2 + 60)
        const { left, slotsW } = spotLayout(z)
        expect(g.x).toBeLessThan(left)
        expect(g.x + g.w).toBeGreaterThan(left + slotsW)
      }
    }
  })

  it('makes every seat colour add about the same light to the table', () => {
    const added = Object.values(SEAT_HEX).map((hex) => glowTone(hex).added)
    const mean = added.reduce((a, b) => a + b, 0) / added.length
    for (const a of added) expect(Math.abs(a - mean) / mean).toBeLessThan(0.25)
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
