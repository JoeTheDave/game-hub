import type { BoardGeometry, World } from '@games/klask/physics'

/** Just the parts of CanvasRenderingContext2D the renderers use (so tests can pass a fake). */
export type Ctx = CanvasRenderingContext2D

/** Table (mm, +y up, origin centre) → canvas (px, +y down). */
export interface View {
  cx: number
  cy: number
  scale: number
}

/** Wooden frame width (mm) around the playfield. */
export const FRAME_MM = 26

/** Breathing room around the table, as a fraction of the screen's short side (the board fills the rest). */
export const BOARD_MARGIN_FRAC = 0.015

/** The board as large as the screen allows: a round table fills almost the full height. */
export function boardView(geo: BoardGeometry, w: number, h: number): View {
  return fitView(geo, w, h, Math.min(w, h) * BOARD_MARGIN_FRAC)
}

/**
 * Where a player's tag goes. Scores live in the free space beside the board (16:9 leaves wide
 * side gutters), on the side of that player's zone and at its height. If the gutters are too
 * narrow (squarer screens), the tag sits on the board just inside the rim of the player's zone.
 */
export function hudAnchor(geo: BoardGeometry, seat: number, v: View, w: number, h: number, minGutter = 170): { x: number; y: number; inside: boolean } {
  const hw = (geo.halfW + FRAME_MM) * v.scale
  const hh = (geo.halfH + FRAME_MM) * v.scale
  const gutter = v.cx - hw
  const a = geo.zoneAngles[seat]
  let cos = Math.cos(a)
  const sin = Math.sin(a)
  if (Math.abs(cos) < 0.2) cos = sin < 0 ? -1 : 1 // bottom zone → left gutter, top zone → right gutter
  if (gutter >= minGutter) {
    const x = cos < 0 ? gutter / 2 : w - gutter / 2
    const y = Math.min(h - 70, Math.max(70, v.cy - sin * hh * 0.7))
    return { x, y, inside: false }
  }
  const r = geo.shape === 'circle' ? geo.radius * 0.78 : geo.halfW * 0.78
  const along = geo.shape === 'circle' ? { x: Math.cos(a) * r, y: Math.sin(a) * r } : { x: Math.sign(Math.cos(a)) * r, y: geo.halfH * 0.72 }
  const p = toPx(v, along.x, along.y)
  return { x: p.x, y: p.y, inside: true }
}

/** Fit the whole table (playfield + frame) into a w×h canvas, leaving `margin` px for the HUD. */
export function fitView(geo: BoardGeometry, w: number, h: number, margin = 0): View {
  const hw = geo.halfW + FRAME_MM
  const hh = geo.halfH + FRAME_MM
  const scale = Math.max(0.01, Math.min((w - margin * 2) / (hw * 2), (h - margin * 2) / (hh * 2)))
  return { cx: w / 2, cy: h / 2, scale }
}

export const toPx = (v: View, x: number, y: number) => ({ x: v.cx + x * v.scale, y: v.cy - y * v.scale })

export interface DrawInfo {
  /** Hex colour per seat. */
  colors: string[]
  /** Seconds since the last frame (for trails/particles). */
  dt: number
}

export interface Renderer {
  draw(ctx: Ctx, w: number, h: number, world: World, geo: BoardGeometry, info: DrawInfo): View
  /** A celebratory burst at a table position (stylized only; realistic ignores it). */
  burst(x: number, y: number, color: string): void
}

/** Trace the playfield outline (rounded rect or circle) as the current path. */
export function playfieldPath(ctx: Ctx, v: View, geo: BoardGeometry, growMm = 0) {
  ctx.beginPath()
  if (geo.shape === 'rect') {
    const x0 = v.cx - (geo.halfW + growMm) * v.scale
    const y0 = v.cy - (geo.halfH + growMm) * v.scale
    const w = (geo.halfW + growMm) * 2 * v.scale
    const h = (geo.halfH + growMm) * 2 * v.scale
    const r = (14 + growMm * 0.6) * v.scale
    ctx.moveTo(x0 + r, y0)
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r)
    ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r)
    ctx.arcTo(x0, y0 + h, x0, y0, r)
    ctx.arcTo(x0, y0, x0 + w, y0, r)
    ctx.closePath()
  } else {
    ctx.arc(v.cx, v.cy, (geo.radius + growMm) * v.scale, 0, Math.PI * 2)
  }
}

/** Zone dividers as canvas segments. */
export function dividerSegments(v: View, geo: BoardGeometry) {
  return geo.dividers.map((d) => ({ a: toPx(v, d.a.x, d.a.y), b: toPx(v, d.b.x, d.b.y) }))
}
