import type { Color } from '@games/onitama/data'
import type { Rect } from './flyers'
import { tvCell } from './logic'

/**
 * Pure TV geometry on the fixed 1920×1080 canvas. The board is the centrepiece; red's zone is on
 * the left and blue's on the right (each player's home row faces them), and each zone's content is
 * centred so its gap to the screen edge equals its gap to the board.
 */
export const W = 1920
export const H = 1080
export const BOARD_SIZE = 820
export const BOARD = { x: (W - BOARD_SIZE) / 2, y: (H - BOARD_SIZE) / 2, w: BOARD_SIZE, h: BOARD_SIZE }
export const CELL = BOARD_SIZE / 5
export const CARD_W = 200
export const CARD_RATIO = 1.4
export const CARD_H = CARD_W * CARD_RATIO
export const CARD_GAP = 28
export const ZONE_W = BOARD.x
export const PIECE = { student: 112, master: 134 }
export const TRAY_PIECE = 52

/** The zone a colour sits in (red left, blue right). */
export function zoneFor(color: Color): Rect {
  return { x: color === 'red' ? 0 : BOARD.x + BOARD.w, y: 0, w: ZONE_W, h: H }
}

/** Width of a zone's content (two cards side by side). */
export const CONTENT_W = CARD_W * 2 + CARD_GAP

export function contentLeft(color: Color): number {
  const z = zoneFor(color)
  return z.x + (z.w - CONTENT_W) / 2
}

export const NAME_Y = 96
export const HAND_Y = 186
export const TRAY_Y = HAND_Y + CARD_H + 34
export const SIDE_Y = TRAY_Y + TRAY_PIECE + 40

/** A player's hand card slot (0 or 1). */
export function handRect(color: Color, index: number): Rect {
  return { x: contentLeft(color) + index * (CARD_W + CARD_GAP), y: HAND_Y, w: CARD_W, h: CARD_H }
}

/** The side card's spot, in the zone of the player who will take it. */
export function sideRect(color: Color): Rect {
  const z = zoneFor(color)
  return { x: z.x + (z.w - CARD_W) / 2, y: SIDE_Y, w: CARD_W, h: CARD_H }
}

/** The i-th captured piece in a player's tray (enemy pieces they took). */
export function trayRect(color: Color, i: number): Rect {
  const left = contentLeft(color)
  return { x: left + i * (TRAY_PIECE + 12), y: TRAY_Y, w: TRAY_PIECE, h: TRAY_PIECE }
}

/** The board cell for a board square. */
export function cellRect(sq: readonly [number, number]): Rect {
  const [col, row] = tvCell(sq)
  return { x: BOARD.x + col * CELL, y: BOARD.y + row * CELL, w: CELL, h: CELL }
}

/** A piece's token on a board square, centred in the cell. */
export function pieceRect(sq: readonly [number, number], master: boolean): Rect {
  const c = cellRect(sq)
  const s = master ? PIECE.master : PIECE.student
  return { x: c.x + (c.w - s) / 2, y: c.y + (c.h - s) / 2, w: s, h: s }
}

/** The warm turn-light pool, bounded to the player's own zone. */
export function glowRect(color: Color): Rect {
  const z = zoneFor(color)
  return { x: z.x + 18, y: 60, w: z.w - 36, h: H - 120 }
}

/** The bounding box of everything in a zone (for layout tests). */
export function zoneContent(color: Color): Rect {
  const a = handRect(color, 0)
  const b = handRect(color, 1)
  const s = sideRect(color)
  return { x: a.x, y: NAME_Y, w: b.x + b.w - a.x, h: s.y + s.h - NAME_Y }
}
