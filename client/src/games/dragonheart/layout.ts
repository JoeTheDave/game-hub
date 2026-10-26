import { CAPACITY, type Space } from '@games/dragonheart/data'
import { CARD_RATIO, jitter } from './components'
import type { Rect } from './flyers'
import geometry from './boardGeometry.json'

/**
 * Pure TV geometry on the 1920×1080 design canvas. Every piece's resting rect comes from here,
 * so the table renders from it AND animations plan flights from it — flights land exactly where
 * the piece is drawn, with no DOM measuring.
 *
 * The board's spaces come from `boardGeometry.json`: outline rects measured from the scan of
 * Joe's real board, normalized to the repainted panorama (spec 1793038854620, iteration 1). The
 * outlines and arrows are painted into the art, so cards simply sit inside those rects.
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

/** How much of the printed outline a card fills (the outline's flourishes sit just outside the card). */
const FILL = 0.96

/**
 * The card rect that sits inside an outline. Portrait outlines hold an upright card; landscape
 * outlines (Petrified Dragon, the pile below the Ship) hold a card turned 90°, so the Rect is the
 * card's own (portrait) box centred on the outline, rotated by `r`.
 */
function cardInOutline(o: NRect, orientation: 'portrait' | 'landscape', key: string): Rect {
  const long = orientation === 'portrait' ? o.h : o.w
  const short = orientation === 'portrait' ? o.w : o.h
  const w = Math.min(short, long / CARD_RATIO) * FILL
  const h = w * CARD_RATIO
  const cx = o.x + o.w / 2
  const cy = o.y + o.h / 2
  const r = (orientation === 'landscape' ? 90 : 0) + jitter(key, 1, 0).rot
  return { x: cx - w / 2, y: cy - h / 2, w, h, r }
}

/** The outline rect for outline `i` of a space, in canvas pixels. */
export function outlineRect(space: Space | 'belowShip', i = 0): NRect {
  const outlines = GEO.spaces[space].outlines
  return outlinePx(outlines[Math.min(i, outlines.length - 1)])
}

/** The card rect for outline `i` of a space (a stack space has only outline 0). */
export function slotRect(space: Space, i = 0): Rect {
  const k = CAPACITY[space] > 0 ? i : 0
  return cardInOutline(outlineRect(space, k), GEO.spaces[space].orientation, `slot-${space}-${k}`)
}

/** On-screen bounding box of a (possibly 90°-turned) rect. */
export function boundsOf(r: Rect): NRect {
  const turned = Math.abs(Math.abs(((r.r ?? 0) % 180)) - 90) < 45
  if (!turned) return { x: r.x, y: r.y, w: r.w, h: r.h }
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return { x: cx - r.h / 2, y: cy - r.w / 2, w: r.h, h: r.w }
}

export const DRAGON_BOARD_SIZE = 130
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
  return cardInOutline(outlineRect('belowShip'), GEO.spaces.belowShip.orientation, 'belowShip')
}

export const OFF_CARD = 110
export const OFF_CARD_H = OFF_CARD * CARD_RATIO
const STACK_GAP = 22
export function shipStackRect(i: number): Rect {
  const pile = boundsOf(belowShipRect())
  const y = BOARD.y + BOARD.h + 24
  return { x: pile.x + pile.w + 30 + i * (OFF_CARD + STACK_GAP), y, w: OFF_CARD, h: OFF_CARD_H, r: jitter(`shipstack-${i}`, 2.5, 0).rot }
}

// ——— Players: bottom-left (seat 0, green) and bottom-right (seat 1, red), identical geometry ———
/** Each seat owns the open table from the screen edge to the pile/ship stacks in the middle. */
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

export const P_CARD = 96
export const P_CARD_H = P_CARD * CARD_RATIO
const P_GAP = 20
export const FAN_STEP = 28
const FAN_W = P_CARD + 5 * FAN_STEP
const NAME_ROW = 58
export const DRAGON_SEAT_SIZE = 92

/**
 * Inside a zone: [deck] [hand fan] [score pile] across, with the name card (and the Great Dragon
 * when held) above. The whole group is centred, so the table between the group and the screen
 * edge equals the table between the group and the central area.
 */
export function spotLayout(zone: Zone) {
  const contentW = P_CARD + P_GAP + FAN_W + P_GAP + P_CARD
  const left = zone.x + (zone.w - contentW) / 2
  const contentH = NAME_ROW + 14 + P_CARD_H + 10
  const top = zone.y + (zone.h - contentH) / 2
  const cardsY = top + NAME_ROW + 14
  return {
    contentW,
    contentH,
    left,
    top,
    cardsY,
    deck: { x: left, y: cardsY, w: P_CARD, h: P_CARD_H } as Rect,
    fanX: left + P_CARD + P_GAP,
    score: { x: left + P_CARD + P_GAP + FAN_W + P_GAP, y: cardsY, w: P_CARD, h: P_CARD_H } as Rect,
    dragon: { x: left + contentW - DRAGON_SEAT_SIZE, y: top + NAME_ROW - DRAGON_SEAT_SIZE + 6, w: DRAGON_SEAT_SIZE, h: DRAGON_SEAT_SIZE } as Rect,
  }
}

export function deckRect(seat: number): Rect {
  return { ...spotLayout(zoneFor(seat)).deck, r: jitter(`deck-${seat}`, 2, 0).rot }
}
export function scoreRect(seat: number): Rect {
  return { ...spotLayout(zoneFor(seat)).score, r: jitter(`score-${seat}`, 2.5, 0).rot }
}
/** Card `i` of a hand fan of `n` backs (fanned slightly, like cards held face-down on the table). */
export function handRect(seat: number, i: number, n: number): Rect {
  const s = spotLayout(zoneFor(seat))
  const spread = Math.max(0, n - 1)
  const offset = ((5 - spread) * FAN_STEP) / 2 // centre the fan in its 6-card space
  const mid = spread / 2
  return {
    x: s.fanX + offset + i * FAN_STEP,
    y: s.cardsY + Math.abs(i - mid) * 3,
    w: P_CARD,
    h: P_CARD_H,
    r: (i - mid) * 4,
  }
}
export function seatDragonRect(seat: number): Rect {
  return spotLayout(zoneFor(seat)).dragon
}
export function dragonRect(at: 'board' | number): Rect {
  return at === 'board' ? boardDragonRect() : seatDragonRect(at)
}

/** The warm light pool under a seat's pieces (bounded to its own zone). */
export function glowRect(seat: number) {
  const z = zoneFor(seat)
  const s = spotLayout(z)
  return { x: s.left - 50, y: s.top - 40, w: s.contentW + 100, h: Math.min(z.h, s.contentH + 80) }
}

// ——— Stack tags: count + total points, pinned at a space's corner ———
export const TAG = { w: 88, h: 58 }
/**
 * Where a space's tag sits: pinned over the bottom-right corner of its last outline (the
 * front-most card's corner value stays clear at the top-left). The pile below the Ship takes its
 * tag on its right end.
 */
export function tagRect(space: Space | 'belowShip'): NRect {
  const n = space === 'belowShip' ? 1 : Math.max(1, CAPACITY[space])
  const o = outlineRect(space, n - 1)
  return { x: o.x + o.w - TAG.w * 0.55, y: o.y + o.h - TAG.h * 0.75, w: TAG.w, h: TAG.h }
}

export const TURN_LIGHT = { rgb: [255, 196, 112] as const, alpha: 0.5 }
