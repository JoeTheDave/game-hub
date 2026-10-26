import { BOARD_LAYOUT, CAPACITY, GREAT_DRAGON_START, type Space } from '@games/dragonheart/data'
import { CARD_RATIO, jitter } from './components'
import type { Rect } from './flyers'

/**
 * Pure TV geometry on the 1920×1080 design canvas. Every piece's resting rect comes from here,
 * so the table renders from it AND animations plan flights from it — flights land exactly where
 * the piece is drawn, with no DOM measuring.
 */
export const W = 1920
export const H = 1080

// ——— The board: a large panorama in the upper-middle of the table ———
export const BOARD = { x: 80, y: 22, w: 1760, h: 640 }
const COLS = 5
export const COL_W = BOARD.w / COLS
export const CARD_W = 150
export const CARD_H = CARD_W * CARD_RATIO
const ROW_Y = [BOARD.y + 34, BOARD.y + 346]
/** Offsets between a capacity space's staggered outlines (later cards lie lower-left, on top). */
export const STAGGER = { dx: -16, dy: 24 }

/** The card rect for outline `i` of a space (a stack space has only outline 0). */
export function slotRect(space: Space, i = 0): Rect {
  const { row, col } = BOARD_LAYOUT[space]
  const cap = CAPACITY[space]
  const n = Math.max(1, cap)
  // Centre the whole staggered fan in its column.
  const x0 = BOARD.x + col * COL_W + (COL_W - CARD_W) / 2 - ((n - 1) * STAGGER.dx) / 2
  const k = cap > 0 ? i : 0
  return { x: x0 + k * STAGGER.dx, y: ROW_Y[row] + k * STAGGER.dy, w: CARD_W, h: CARD_H, r: jitter(`slot-${space}-${k}`, 1.2, 0).rot }
}

export const DRAGON_BOARD_SIZE = 170
/** The Great Dragon's starting spot: the open ground under the tree, right of the Petrified Dragon. */
export function boardDragonRect(): Rect {
  const x = BOARD.x + GREAT_DRAGON_START.col * COL_W + (COL_W - DRAGON_BOARD_SIZE) / 2
  return { x, y: ROW_Y[GREAT_DRAGON_START.row] + 20, w: DRAGON_BOARD_SIZE, h: DRAGON_BOARD_SIZE }
}

// ——— Below the board: the Knight/Huntress pile (under the Ship) and the ship stacks ———
export const OFF_CARD = 120
export const OFF_CARD_H = OFF_CARD * CARD_RATIO
const OFF_Y = BOARD.y + BOARD.h + 24
export function belowShipRect(): Rect {
  const ship = slotRect('ship', 1)
  return { x: Math.max(ZONE_W + 18, ship.x + (ship.w - OFF_CARD) / 2), y: OFF_Y, w: OFF_CARD, h: OFF_CARD_H, r: -1.5 }
}
export function shipStackRect(i: number): Rect {
  const b = belowShipRect()
  return { x: b.x + 168 + i * 148, y: OFF_Y + 10, w: OFF_CARD, h: OFF_CARD_H, r: jitter(`shipstack-${i}`, 2.5, 0).rot }
}

// ——— Players: bottom-left (seat 0, green) and bottom-right (seat 1, red), identical geometry ———
export const ZONE_W = 530
export interface Zone {
  x: number
  y: number
  w: number
  h: number
}
export function zoneFor(seat: number): Zone {
  const y = BOARD.y + BOARD.h + 14
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

export const TURN_LIGHT = { rgb: [255, 196, 112] as const, alpha: 0.5 }
