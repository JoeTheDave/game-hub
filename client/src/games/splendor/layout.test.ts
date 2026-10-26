import { describe, expect, it } from 'vitest'
import { stableSlots, BANK_CHIP, BANK_Y, BLOCK_W, MARKET_BOTTOM, MARKET_X, TURN_LIGHT, glowRect, nobleRow, planAnimation, spotLayout, zonesFor } from './TableView'
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

  it('sizes and lays out every seat as a 4-player corner, whatever the player count', () => {
    const four = zonesFor(4)
    for (const n of [2, 3]) {
      const zones = zonesFor(n)
      // 2 players sit across the top (top-left, top-right); 3 take the first three.
      const expected = n === 2 ? [four[1], four[2]] : four.slice(0, n)
      zones.forEach((z, i) => {
        expect(z).toEqual(expected[i])
        expect(spotLayout(z)).toMatchObject({ left: spotLayout(expected[i]).left, top: spotLayout(expected[i]).top })
      })
    }
    for (const z of four) {
      expect(z.w).toBe(four[0].w)
      expect(z.h).toBe(four[0].h)
    }
    // clockwise as seen on screen: bottom-left → top-left → top-right → bottom-right
    const [bl, tl, tr, br] = four
    expect(bl.x).toBe(tl.x)
    expect(bl.y).toBeGreaterThan(tl.y)
    expect(tr.x).toBeGreaterThan(tl.x)
    expect(tr.y).toBe(tl.y)
    expect(br.x).toBe(tr.x)
    expect(br.y).toBeGreaterThan(tr.y)
  })

  it('fits earned nobles in a row beside the name card, overlapping once there are several', () => {
    const { pr, slotsW } = spotLayout(zonesFor(4)[0])
    expect(nobleRow(0, pr, slotsW).width).toBe(0)
    expect(nobleRow(1, pr, slotsW).width).toBe(pr.noble)
    for (const n of [2, 3, 4, 5]) {
      const row = nobleRow(n, pr, slotsW)
      expect(row.width).toBeLessThanOrEqual(slotsW * 0.42 + 0.01)
      expect(row.step).toBeGreaterThan(pr.noble * 0.3)
    }
  })

  it("keeps each seat's pieces (place card and nobles, tokens, tableau, reserved pile) inside its zone", () => {
    for (const n of [2, 3, 4]) {
      for (const z of zonesFor(n)) {
        const { top, contentH, placeH, pr } = spotLayout(z)
        expect(top).toBeGreaterThanOrEqual(z.y)
        expect(top + contentH).toBeLessThanOrEqual(z.y + z.h + 1)
        expect(placeH).toBeGreaterThanOrEqual(pr.noble)
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

  it('uses one warm candlelight for every seat', () => {
    const [r, g, b] = TURN_LIGHT.rgb
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    expect(TURN_LIGHT.alpha).toBeGreaterThan(0.3)
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

describe('stableSlots', () => {
  it('leaves a claimed noble\'s space empty instead of shifting the rest', () => {
    const first = stableSlots(null, ['n-01', 'n-02', 'n-03'])
    expect(stableSlots(first, ['n-01', 'n-03'])).toEqual(['n-01', null, 'n-03'])
  })

  it('starts fresh when an unknown item appears', () => {
    expect(stableSlots(['n-01', null], ['n-05', 'n-06'])).toEqual(['n-05', 'n-06'])
  })
})
