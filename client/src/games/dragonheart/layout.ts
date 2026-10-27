import { CAPACITY, type Space } from '@games/dragonheart/data'
import { CARD_RATIO, jitter } from './components'
import type { Rect } from './flyers'
import geometry from './boardGeometry.json'

/**
 * Pure TV geometry on the 1920×1080 design canvas. Every piece's resting rect comes from here,
 * so the table renders from it AND animations plan flights from it — flights land exactly where
 * the piece is drawn, with no DOM measuring.
 *
 * The board is Joe's own board image; its spaces come from `boardGeometry.json`, outline rects
 * measured on that image (spec 1793038854620, iteration 2). The outlines and arrows are painted
 * into the art. A card is exactly the outline's size, so a card on the board fills its outline.
 */
export const W = 1920
export const H = 1080

interface NRect {
  x: number
  y: number
  w: number
  h: number
}
interface SpaceGeometry {
  orientation: 'portrait' | 'landscape'
  outlines: NRect[]
}
const GEO = geometry as unknown as {
  aspect: number
  spaces: Record<Space | 'belowShip', SpaceGeometry>
  greatDragonStart: { center: [number, number] }
}

// ——— The board: the panorama across the top of the table ———
const BOARD_W = 1840
export const BOARD = { x: (W - BOARD_W) / 2, y: 14, w: BOARD_W, h: BOARD_W / GEO.aspect }

/** A measured outline, in canvas pixels. */
function outlinePx(o: NRect): NRect {
  return { x: BOARD.x + o.x * BOARD.w, y: BOARD.y + o.y * BOARD.h, w: o.w * BOARD.w, h: o.h * BOARD.h }
}

/**
 * The card rect that fills an outline exactly. Portrait outlines hold an upright card; landscape
 * outlines (Petrified Dragon, the pile below the Ship) hold a card turned 90°, so the Rect is the
 * card's own (portrait) box centred on the outline, rotated by `r`. No jitter: a card on the
 * board sits squarely in its painted outline.
 */
function cardInOutline(o: NRect, orientation: 'portrait' | 'landscape'): Rect {
  const w = orientation === 'portrait' ? o.w : o.h
  const h = orientation === 'portrait' ? o.h : o.w
  const cx = o.x + o.w / 2
  const cy = o.y + o.h / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h, r: orientation === 'landscape' ? 90 : 0 }
}

/** The outline rect for outline `i` of a space, in canvas pixels. */
export function outlineRect(space: Space | 'belowShip', i = 0): NRect {
  const outlines = GEO.spaces[space].outlines
  return outlinePx(outlines[Math.min(i, outlines.length - 1)])
}

/**
 * Which outline the `i`-th card on a space (in play order, 0 = first played) lies in. Capacity
 * spaces fill from the UPPER-LEFT outline (index 0 in boardGeometry.json) and stagger down and to
 * the right; each later card lies on top of the earlier ones (Joe, iteration 3), so the newest card
 * is always on top. Stack spaces have a single outline.
 */
export function outlineIndexFor(space: Space, i: number): number {
  const cap = CAPACITY[space]
  if (cap <= 0) return 0
  return Math.max(0, Math.min(i, cap - 1))
}

/** The card rect for the `i`-th card (play order) on a space; it fills its outline exactly. */
export function slotRect(space: Space, i = 0): Rect {
  return cardInOutline(outlineRect(space, outlineIndexFor(space, i)), GEO.spaces[space].orientation)
}

/** Stacking order of the `i`-th card on a space: later cards lie on top of earlier ones. */
export function slotZ(i: number): number {
  return 2 + i
}

/** On-screen bounding box of a (possibly 90°-turned) rect. */
export function boundsOf(r: Rect): NRect {
  const turned = Math.abs(Math.abs(((r.r ?? 0) % 180)) - 90) < 45
  if (!turned) return { x: r.x, y: r.y, w: r.w, h: r.h }
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return { x: cx - r.h / 2, y: cy - r.w / 2, w: r.h, h: r.w }
}

export const DRAGON_BOARD_SIZE = 120
/** The Great Dragon's starting spot: the open ground under the tree, right of the Petrified Dragon. */
export function boardDragonRect(): Rect {
  const [nx, ny] = GEO.greatDragonStart.center
  const cx = BOARD.x + nx * BOARD.w
  const cy = BOARD.y + ny * BOARD.h
  return { x: cx - DRAGON_BOARD_SIZE / 2, y: cy - DRAGON_BOARD_SIZE / 2, w: DRAGON_BOARD_SIZE, h: DRAGON_BOARD_SIZE }
}

// ——— Below the board: the Knight/Huntress pile (under the Ship) and the ship stacks ———
/** The Knight/Huntress pile lies in the landscape outline the board's curved arrows point to. */
export function belowShipRect(): Rect {
  return cardInOutline(outlineRect('belowShip'), GEO.spaces.belowShip.orientation)
}

export const OFF_CARD = 110
export const OFF_CARD_H = OFF_CARD * CARD_RATIO
const STACK_GAP = 22
export function shipStackRect(i: number): Rect {
  const pile = boundsOf(belowShipRect())
  const y = BOARD.y + BOARD.h + 24
  return { x: pile.x + pile.w + 30 + i * (OFF_CARD + STACK_GAP), y, w: OFF_CARD, h: OFF_CARD_H, r: jitter(`shipstack-${i}`, 2.5, 0).rot }
}

// ——— Players: bottom-left (seat 0, green) and bottom-right (seat 1, red), mirrored geometry ———
/**
 * Each seat owns the open table from the screen edge to the pile below the Ship (left) or the
 * ship stacks (right): the same width on both sides, so margins match.
 */
export const ZONE_W = 520
export interface Zone {
  x: number
  y: number
  w: number
  h: number
}
export function zoneFor(seat: number): Zone {
  const y = BOARD.y + BOARD.h + 10
  return { x: seat === 0 ? 0 : W - ZONE_W, y, w: ZONE_W, h: H - y - 8 }
}

/** Hand backs: as big as the zone allows (Joe: use the free table, don't shrink anything else). */
export const P_CARD = 190
export const P_CARD_H = P_CARD * CARD_RATIO
/** Draw deck and score pile (stacked at the outer side of the zone). */
export const PILE_CARD = 104
export const PILE_CARD_H = PILE_CARD * CARD_RATIO
const PILE_GAP = 12
const COL_GAP = 24
export const FAN_STEP = 30
const FAN_W = P_CARD + 5 * FAN_STEP
const NAME_ROW = 58
const NAME_GAP = 12
export const DRAGON_SEAT_SIZE = 120
const DRAGON_GAP = 24

/**
 * Inside a zone: the name card across the top; below it the piles column (draw deck over score
 * pile) on the OUTER side and the hand fan on the inner side. The group is centred, so the table
 * between it and the screen edge equals the table between it and the central area.
 */
export function spotLayout(zone: Zone, seat = 0) {
  const pilesH = PILE_CARD_H * 2 + PILE_GAP
  const cardsH = Math.max(pilesH, P_CARD_H)
  const contentW = PILE_CARD + COL_GAP + FAN_W
  const contentH = NAME_ROW + NAME_GAP + cardsH
  const left = zone.x + (zone.w - contentW) / 2
  const top = zone.y + (zone.h - contentH) / 2
  const cardsY = top + NAME_ROW + NAME_GAP
  const outerRight = seat === 1
  const pilesX = outerRight ? left + contentW - PILE_CARD : left
  const fanX = outerRight ? left : left + PILE_CARD + COL_GAP
  const innerRight = !outerRight
  return {
    contentW,
    contentH,
    left,
    top,
    cardsY,
    fanX,
    deck: { x: pilesX, y: cardsY, w: PILE_CARD, h: PILE_CARD_H } as Rect,
    score: { x: pilesX, y: cardsY + PILE_CARD_H + PILE_GAP, w: PILE_CARD, h: PILE_CARD_H } as Rect,
    /**
     * A held Great Dragon lies low on the table on the inner side of the hand: right of seat 0's
     * hand, left of seat 1's (Joe, iteration 3), bottom-aligned with the hand.
     */
    dragon: {
      x: innerRight ? fanX + FAN_W + DRAGON_GAP : fanX - DRAGON_GAP - DRAGON_SEAT_SIZE,
      y: cardsY + P_CARD_H - DRAGON_SEAT_SIZE,
      w: DRAGON_SEAT_SIZE,
      h: DRAGON_SEAT_SIZE,
    } as Rect,
  }
}

const seatSpot = (seat: number) => spotLayout(zoneFor(seat), seat)

export function deckRect(seat: number): Rect {
  return { ...seatSpot(seat).deck, r: jitter(`deck-${seat}`, 2, 0).rot }
}
export function scoreRect(seat: number): Rect {
  return { ...seatSpot(seat).score, r: jitter(`score-${seat}`, 2.5, 0).rot }
}
/** Card `i` of a hand fan of `n` backs (fanned slightly, like cards held face-down on the table). */
export function handRect(seat: number, i: number, n: number): Rect {
  const s = seatSpot(seat)
  const spread = Math.max(0, n - 1)
  const offset = ((5 - spread) * FAN_STEP) / 2 // centre the fan in its 6-card space
  const mid = spread / 2
  return {
    x: s.fanX + offset + i * FAN_STEP,
    y: s.cardsY + Math.abs(i - mid) * 4,
    w: P_CARD,
    h: P_CARD_H,
    r: (i - mid) * 3,
  }
}
export function seatDragonRect(seat: number): Rect {
  return seatSpot(seat).dragon
}
export function dragonRect(at: 'board' | number): Rect {
  return at === 'board' ? boardDragonRect() : seatDragonRect(at)
}

/** The warm light pool under a seat's pieces (bounded to its own zone). */
export function glowRect(seat: number) {
  const z = zoneFor(seat)
  const s = spotLayout(z, seat)
  return { x: s.left - 40, y: s.top - 30, w: s.contentW + 80, h: Math.min(z.h + 20, s.contentH + 60) }
}

// ——— Stack notes: a subtle "N pts" under the top card, only for 2+ cards ———
/**
 * Where a space's note sits: centred just inside the bottom edge of its top (newest) card, between
 * the corner value squares. `count` is the number of cards on the space.
 */
/** Font size of the "N pts" note (doubled in iteration 13 so it reads from the couch). */
export const NOTE_FONT_PX = 26
/** The note's top sits this far above the card's bottom edge, so the whole line stays on the card. */
const NOTE_INSET = NOTE_FONT_PX + 14

export function noteAnchor(space: Space | 'belowShip', count: number): { x: number; y: number; w: number } {
  if (space === 'belowShip') {
    const o = outlineRect('belowShip')
    return { x: o.x + o.w / 2, y: o.y + o.h - NOTE_INSET, w: o.w }
  }
  const o = outlineRect(space, outlineIndexFor(space, Math.max(0, count - 1)))
  return { x: o.x + o.w / 2, y: o.y + o.h - NOTE_INSET, w: o.w }
}

export const TURN_LIGHT = { rgb: [255, 196, 112] as const, alpha: 0.5 }
