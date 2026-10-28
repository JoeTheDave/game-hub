import { describe, expect, it } from 'vitest'
import { flightBox, type Rect } from './flyers'
import { BOARD, H, W, cellRect, glowRect, handRect, pieceRect, sideRect, trayRect, zoneContent, zoneFor } from './layout'

const inside = (r: Rect, box: Rect) => r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('TV layout', () => {
  it('centres the board and keeps everything on the canvas', () => {
    expect(BOARD.x + BOARD.w / 2).toBe(W / 2)
    expect(BOARD.y + BOARD.h / 2).toBe(H / 2)
    const canvas = { x: 0, y: 0, w: W, h: H }
    for (const c of ['red', 'blue'] as const) {
      expect(inside(zoneContent(c), canvas)).toBe(true)
      expect(inside(glowRect(c), zoneFor(c))).toBe(true)
    }
  })

  it("centres each zone's content so its gap to the screen edge equals its gap to the board", () => {
    for (const c of ['red', 'blue'] as const) {
      const z = zoneFor(c)
      const r = zoneContent(c)
      const left = r.x - z.x
      const right = z.x + z.w - (r.x + r.w)
      expect(Math.abs(left - right)).toBeLessThan(1)
      expect(overlaps(r, BOARD)).toBe(false)
    }
  })

  it('never overlaps hand cards, the side card, or tray pieces', () => {
    for (const c of ['red', 'blue'] as const) {
      const rects = [handRect(c, 0), handRect(c, 1), sideRect(c), trayRect(c, 0), trayRect(c, 4)]
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
      expect(inside(trayRect(c, 4), zoneFor(c))).toBe(true)
    }
  })

  it('puts red home row on the left and blue home row on the right, pieces centred in cells', () => {
    expect(cellRect([2, 0]).x).toBe(BOARD.x)
    expect(cellRect([2, 4]).x + cellRect([2, 4]).w).toBe(BOARD.x + BOARD.w)
    const c = cellRect([1, 3])
    const p = pieceRect([1, 3], true)
    expect(p.x + p.w / 2).toBeCloseTo(c.x + c.w / 2)
    expect(p.y + p.h / 2).toBeCloseTo(c.y + c.h / 2)
  })
})

describe('flight geometry', () => {
  it('starts at the source, lands exactly on the destination, and never leaves their envelope (beyond the lift)', () => {
    const from = handRect('red', 0)
    const to = sideRect('blue')
    expect(flightBox(from, to, 0)).toMatchObject({ x: from.x, y: from.y, w: from.w })
    expect(flightBox(from, to, 1)).toMatchObject({ x: to.x, y: to.y, w: to.w })
    const mid = flightBox(from, to, 0.5, 0)
    expect(mid.x).toBeGreaterThanOrEqual(Math.min(from.x, to.x))
    expect(mid.x + mid.w).toBeLessThanOrEqual(Math.max(from.x + from.w, to.x + to.w))
    expect(mid.y + mid.h).toBeLessThanOrEqual(Math.max(from.y + from.h, to.y + to.h))
  })
})
