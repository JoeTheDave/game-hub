/**
 * Where everything sits on the 3D table. Pure: no three.js imports, so it's unit-tested.
 *
 * The table copies the original repo's board (Joe's github.com/JoeTheDave/onitama), a single
 * 1600×1600 slab in CSS pixels:
 * - the 5×5 grid at (580,330), 188 px pitch
 * - red's two cards along the top (y 40) and blue's along the bottom (y 1300), at x 600 / 1100
 * - the side card at (140,670); the capture trays at x 40 + i·130, y 365 (red) / 1117 (blue)
 * - yin-yangs: the centre one (300 px) and the two temple homes (100 px)
 * World units: 1 = 100 px. The slab is centred on the origin, its top face at y = BOARD_TOP.
 * World X = px/100 − 8, world Z = py/100 − 8. Red sits at −Z (top), blue at +Z (bottom).
 */
import type { Color } from '@games/onitama/data'

export const BOARD_PX = 1600
export const BOARD_SIZE = BOARD_PX / 100 // 16 world units
export const BOARD_THICK = 0.3
export const BOARD_TOP = BOARD_THICK
export const CARD_W = 4 // 400 px
export const CARD_D = 2.6 // 260 px
export const CELL = 1.88 // 188 px pitch
export const CELL_INNER = 1.84
export const GRID = { x: 580, y: 330, size: 940 } as const

export interface Pose {
  x: number
  y: number
  z: number
  /** Rotation about the vertical axis, radians (0 = card text reads from +Z, i.e. blue's side). */
  yaw: number
}

const wx = (px: number) => px / 100 - BOARD_SIZE / 2
const wz = (py: number) => py / 100 - BOARD_SIZE / 2

/** Centre of board square [x,y] in world space (on the board top). Red's home row 0 is at −Z. */
export function squareWorld([x, y]: readonly [number, number]): { x: number; z: number } {
  return { x: wx(GRID.x + 94 + x * 188), z: wz(GRID.y + 94 + y * 188) }
}

/** Which way a colour's cards face: text upright for that player. */
export const facingYaw = (color: Color): number => (color === 'red' ? Math.PI : 0)

/** Heights above the board top: grid overlay < turn glow < cards, so the glow never covers a card. */
export const GRID_LIFT = 0.005
export const GLOW_LIFT = 0.007
export const CARD_LIFT = 0.012

/** A player's hand slot (index 0 or 1) — the repo's two card positions on their side of the board. */
export function handPose(color: Color, index: number): Pose {
  const px = [600, 1100][index === 1 ? 1 : 0] + 200
  const py = color === 'red' ? 40 + 130 : 1300 + 130
  return { x: wx(px), y: BOARD_TOP + CARD_LIFT, z: wz(py), yaw: facingYaw(color) }
}

/** The side card's slot, rotated toward whoever takes it next. */
export function sidePose(receiver: Color): Pose {
  return { x: wx(140 + 200), y: BOARD_TOP + CARD_LIFT, z: wz(670 + 130), yaw: facingYaw(receiver) }
}

/** The capture tray: pieces a colour has taken sit in a row on that colour's side (repo layout). */
export function trayPose(capturer: Color, index: number): Pose {
  const px = 40 + 60 + (index % 4) * 130
  const py = (capturer === 'red' ? 365 : 1117) + 60 + Math.floor(index / 4) * 130
  return { x: wx(px), y: BOARD_TOP, z: wz(py), yaw: 0 }
}

/** A piece standing on a board square. */
export function piecePose(sq: readonly [number, number], color: Color): Pose {
  const c = squareWorld(sq)
  return { x: c.x, y: BOARD_TOP, z: c.z, yaw: facingYaw(color) }
}

/** Yin-yang decorations: the slowly turning centre one and the two temple homes. */
export const YIN_YANG = {
  centre: { x: wx(1050), z: wz(800), size: 3 },
  red: { x: wx(1050), z: wz(420), size: 1 },
  blue: { x: wx(1050), z: wz(1175), size: 1 },
} as const

/** The rectangle (px) of each card slot on the board, for the deep-red slot frames. */
export const CARD_SLOTS_PX = [
  { x: 600, y: 1300 },
  { x: 1100, y: 1300 },
  { x: 140, y: 670 },
  { x: 600, y: 40 },
  { x: 1100, y: 40 },
] as const

/**
 * The camera looks at the grid from behind the player to move. Yaw 0 puts the camera on the +Z
 * (blue) side; π on the −Z (red) side. Elevation keeps an isometric-ish three-quarter view.
 */
export const CAMERA = { distance: 25, elevation: (56 * Math.PI) / 180, fov: 38 } as const
export const cameraYaw = (color: Color): number => (color === 'red' ? Math.PI : 0)
/**
 * The point the camera orbits: the middle of the slab, so it sits centred with equal room on both
 * sides for the flanking ink drawings. At 16:9 the corners stay within ±0.93 of the viewport.
 */
export const CAMERA_TARGET = { x: 0, y: 0, z: 0 } as const

export function cameraPosition(yaw: number): { x: number; y: number; z: number } {
  const flat = CAMERA.distance * Math.cos(CAMERA.elevation)
  return {
    x: CAMERA_TARGET.x + flat * Math.sin(yaw),
    y: CAMERA.distance * Math.sin(CAMERA.elevation),
    z: CAMERA_TARGET.z + flat * Math.cos(yaw),
  }
}

/** Glow pool under the active player's edge of the board (their card row). */
export function glowPose(color: Color): { x: number; z: number; w: number; d: number } {
  return { x: wx(850), z: wz(color === 'red' ? 170 : 1430), w: 12, d: 4.5 }
}
