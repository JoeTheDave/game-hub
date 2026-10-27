import { describe, expect, it } from 'vitest'
import { CAPACITY, SPACES } from '@games/dragonheart/data'
import { flightBox, type Rect } from './flyers'
import {
  BOARD,
  H,
  W,
  ZONE_W,
  belowShipRect,
  boardDragonRect,
  boundsOf,
  noteAnchor,
  outlineIndexFor,
  outlineRect,
  slotZ,
  deckRect,
  glowRect,
  handRect,
  scoreRect,
  seatDragonRect,
  shipStackRect,
  slotRect,
  spotLayout,
  zoneFor,
} from './layout'

const inside = (r: Rect, box: { x: number; y: number; w: number; h: number }, slack = 0) =>
  r.x >= box.x - slack && r.y >= box.y - slack && r.x + r.w <= box.x + box.w + slack && r.y + r.h <= box.y + box.h + slack
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('board layout (measured from the real board)', () => {
  it('makes every card on the board exactly fill its painted outline, without overlapping other spaces or the dragon start', () => {
    const rects: { space: string; r: Rect }[] = []
    for (const s of SPACES) for (let i = 0; i < Math.max(1, CAPACITY[s]); i++) rects.push({ space: s, r: boundsOf(slotRect(s, i)) })
    for (const { r } of rects) expect(inside(r, BOARD)).toBe(true)
    for (const s of SPACES)
      for (let i = 0; i < Math.max(1, CAPACITY[s]); i++) {
        const b = boundsOf(slotRect(s, i))
        const o = outlineRect(s, outlineIndexFor(s, i))
        for (const k of ['x', 'y', 'w', 'h'] as const) expect(b[k]).toBeCloseTo(o[k], 5)
      }
    expect(inside(boardDragonRect(), BOARD)).toBe(true)
    for (const a of rects) for (const b of rects) if (a.space !== b.space) expect(overlaps(a.r, b.r)).toBe(false)
    for (const a of rects) expect(overlaps(a.r, boardDragonRect())).toBe(false)
  })

  it('turns cards 90° on the landscape outlines (Petrified Dragon, the pile below the Ship)', () => {
    for (const r of [slotRect('petrified'), belowShipRect()]) {
      const b = boundsOf(r)
      expect(b.w).toBeGreaterThan(b.h)
    }
    expect(boundsOf(slotRect('treasure')).h).toBeGreaterThan(boundsOf(slotRect('treasure')).w)
  })

  it('keeps every stack note inside the canvas, on the top card', () => {
    for (const s of [...SPACES, 'belowShip' as const])
      for (const n of [2, 3, 4]) {
        const a = noteAnchor(s, n)
        expect(a.x - a.w / 2).toBeGreaterThanOrEqual(0)
        expect(a.x + a.w / 2).toBeLessThanOrEqual(W)
        expect(a.y).toBeLessThanOrEqual(H - 20)
      }
  })

  it('fills capacity spaces back to front, so the newest card is the frontmost and on top', () => {
    for (const s of SPACES) {
      const cap = CAPACITY[s]
      if (cap === 0) continue
      // first card in the back-most (lower-right) outline, the last in the front (top-left) one
      expect(outlineIndexFor(s, 0)).toBe(cap - 1)
      expect(outlineIndexFor(s, cap - 1)).toBe(0)
      for (let i = 1; i < cap; i++) {
        expect(slotZ(i)).toBeGreaterThan(slotZ(i - 1))
        const newer = slotRect(s, i)
        const older = slotRect(s, i - 1)
        expect(newer.x).toBeLessThan(older.x)
        expect(newer.y).toBeLessThan(older.y)
      }
    }
  })

  it('puts the Knight/Huntress pile under the Ship and the ship stacks beside it, between the player zones', () => {
    const b = boundsOf(belowShipRect())
    const ship = slotRect('ship', 0)
    expect(b.y + b.h / 2).toBeGreaterThan(BOARD.y + BOARD.h)
    expect(Math.abs(b.x + b.w / 2 - (ship.x + ship.w / 2))).toBeLessThan(80)
    for (const r of [b, shipStackRect(0), shipStackRect(1), shipStackRect(2)]) {
      expect(r.x).toBeGreaterThan(ZONE_W)
      expect(r.x + r.w).toBeLessThan(W - ZONE_W)
      expect(r.y + r.h).toBeLessThanOrEqual(H)
    }
  })
})

describe('player zones', () => {
  it('gives both seats identical geometry, mirrored to the bottom corners', () => {
    const a = spotLayout(zoneFor(0), 0)
    const b = spotLayout(zoneFor(1), 1)
    expect(a.contentW).toBe(b.contentW)
    expect(a.top).toBe(b.top)
    expect(b.left - a.left).toBe(W - ZONE_W)
  })

  it('leaves equal table between each seat and the screen edge and between it and the central area (±4px)', () => {
    for (const seat of [0, 1]) {
      const z = zoneFor(seat)
      const s = spotLayout(z, seat)
      const right = s.left + s.contentW
      const toEdge = seat === 0 ? s.left : W - right
      const toCentre = seat === 0 ? ZONE_W - right : s.left - (W - ZONE_W)
      expect(toEdge).toBeGreaterThan(8)
      expect(Math.abs(toEdge - toCentre)).toBeLessThanOrEqual(4)
    }
  })

  it('uses big hand cards and keeps the draw deck and score pile at least their old size', () => {
    expect(handRect(0, 0, 5).w).toBeGreaterThanOrEqual(180)
    expect(deckRect(0).w).toBeGreaterThanOrEqual(96)
    expect(scoreRect(0).w).toBeGreaterThanOrEqual(96)
  })

  it('fits every piece in its zone without overlapping the board or each other', () => {
    for (const seat of [0, 1]) {
      const z = zoneFor(seat)
      const pieces = [deckRect(seat), scoreRect(seat), seatDragonRect(seat), ...Array.from({ length: 6 }, (_, i) => handRect(seat, i, 6))]
      for (const r of pieces) {
        expect(inside(r, z, 6)).toBe(true)
        expect(r.y).toBeGreaterThan(BOARD.y + BOARD.h)
      }
      const fan = Array.from({ length: 6 }, (_, i) => handRect(seat, i, 6))
      const fanBox = { x: Math.min(...fan.map((r) => r.x)), y: fan[0].y, w: Math.max(...fan.map((r) => r.x + r.w)) - Math.min(...fan.map((r) => r.x)), h: fan[0].h }
      expect(overlaps(deckRect(seat), fanBox)).toBe(false)
      expect(overlaps(scoreRect(seat), fanBox)).toBe(false)
      const g = glowRect(seat)
      expect(g.x).toBeGreaterThanOrEqual(z.x - 60)
      expect(g.x + g.w).toBeLessThanOrEqual(z.x + z.w + 60)
    }
  })
})

describe('flight geometry', () => {
  it('flies on a straight path from the source to exactly the destination, never dipping below either', () => {
    const pairs: [Rect, Rect][] = [
      [handRect(0, 4, 5), slotRect('dwarf', 3)],
      [slotRect('treasure'), scoreRect(1)],
      [slotRect('knight', 1), belowShipRect()],
      [slotRect('ship', 2), shipStackRect(2)],
      [deckRect(1), handRect(1, 5, 6)],
      [boardDragonRect(), seatDragonRect(0)],
    ]
    for (const [from, to] of pairs) {
      const start = flightBox(from, to, 0)
      const end = flightBox(from, to, 1)
      expect(start.x).toBeCloseTo(from.x)
      expect(start.y).toBeCloseTo(from.y)
      expect(end.x).toBeCloseTo(to.x)
      expect(end.y).toBeCloseTo(to.y)
      expect(end.w).toBeCloseTo(to.w)
      expect(end.h).toBeCloseTo(to.h)
      const mid = flightBox(from, to, 0.5, 60)
      const lowest = Math.max(from.y + from.h, to.y + to.h)
      expect(mid.y + mid.h).toBeLessThanOrEqual(lowest + 1)
    }
  })
})
