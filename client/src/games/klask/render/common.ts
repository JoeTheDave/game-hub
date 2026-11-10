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
