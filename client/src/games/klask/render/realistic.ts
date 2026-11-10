import { BALL_R, BISCUIT_R, STRIKER_R, type BoardGeometry, type World } from '@games/klask/physics'
import { TEXTURES } from '../assets'
import { FRAME_MM, dividerSegments, fitView, playfieldPath, toPx, type Ctx, type DrawInfo, type Renderer } from './common'

/**
 * The real table: a wooden frame, a dark blue painted playfield with white lines, goal holes
 * with depth, black magnetic strikers (a thin seat-colour ring so players find theirs on the
 * TV), white biscuits and a yellow ball, all with soft shadows.
 */
export function createRealisticRenderer(): Renderer {
  return {
    burst() {},
    draw(ctx: Ctx, w: number, h: number, world: World, geo: BoardGeometry, info: DrawInfo) {
      const v = fitView(geo, w, h, Math.min(w, h) * 0.09)
      const px = (mm: number) => mm * v.scale

      // Room: warm, dim background so the table pops.
      const bg = ctx.createRadialGradient(v.cx, v.cy, 10, v.cx, v.cy, Math.max(w, h) * 0.75)
      bg.addColorStop(0, '#3a2d22')
      bg.addColorStop(1, '#120d0a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Table shadow, then the wooden frame.
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,.6)'
      ctx.shadowBlur = px(30)
      ctx.shadowOffsetY = px(10)
      playfieldPath(ctx, v, geo, FRAME_MM)
      ctx.fillStyle = '#7a4a26'
      ctx.fill()
      ctx.restore()
      playfieldPath(ctx, v, geo, FRAME_MM)
      const wood = TEXTURES.wood ? ctx.createPattern(TEXTURES.wood, 'repeat') : null
      ctx.fillStyle = wood ?? '#8a5a30'
      ctx.fill()
      // A bevel on the frame's inner edge.
      playfieldPath(ctx, v, geo, 3)
      ctx.lineWidth = px(5)
      ctx.strokeStyle = 'rgba(40,22,10,.55)'
      ctx.stroke()

      // Playfield.
      ctx.save()
      playfieldPath(ctx, v, geo)
      ctx.clip()
      const field = TEXTURES.playfield ? ctx.createPattern(TEXTURES.playfield, 'repeat') : null
      ctx.fillStyle = field ?? '#13305f'
      ctx.fillRect(0, 0, w, h)
      // Soft vignette so the centre reads lit.
      const vg = ctx.createRadialGradient(v.cx, v.cy, px(40), v.cx, v.cy, px(Math.max(geo.halfW, geo.halfH) * 1.2))
      vg.addColorStop(0, 'rgba(255,255,255,.05)')
      vg.addColorStop(1, 'rgba(0,0,0,.28)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, w, h)

      // Painted lines: zone dividers, the centre circle, and a ring around each goal.
      ctx.strokeStyle = 'rgba(240,244,255,.85)'
      ctx.lineWidth = Math.max(1.5, px(2.2))
      for (const s of dividerSegments(v, geo)) {
        ctx.beginPath()
        ctx.moveTo(s.a.x, s.a.y)
        ctx.lineTo(s.b.x, s.b.y)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(v.cx, v.cy, px(46), 0, Math.PI * 2)
      ctx.stroke()
      for (const g of geo.goals) {
        const c = toPx(v, g.x, g.y)
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(g.r * 2.6), 0, Math.PI * 2)
        ctx.setLineDash([px(6), px(5)])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Goal holes (closed for eliminated players).
      for (const g of geo.goals) {
        const c = toPx(v, g.x, g.y)
        const open = world.alive[g.seat]
        const hole = ctx.createRadialGradient(c.x, c.y - px(3), px(2), c.x, c.y, px(g.r))
        hole.addColorStop(0, open ? '#000' : '#222')
        hole.addColorStop(0.8, open ? '#05070c' : '#2b2f38')
        hole.addColorStop(1, open ? '#1c2a44' : '#3a404c')
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(g.r), 0, Math.PI * 2)
        ctx.fillStyle = hole
        ctx.fill()
        ctx.lineWidth = Math.max(1, px(1.6))
        ctx.strokeStyle = open ? info.colors[g.seat] : 'rgba(200,200,200,.4)'
        ctx.stroke()
      }

      const shadow = (x: number, y: number, r: number) => {
        const c = toPx(v, x + 3, y - 4)
        ctx.beginPath()
        ctx.ellipse(c.x, c.y, px(r * 1.05), px(r * 0.9), 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,.35)'
        ctx.fill()
      }

      // Biscuits.
      for (const b of world.biscuits) {
        shadow(b.x, b.y, BISCUIT_R)
        const c = toPx(v, b.x, b.y)
        const gr = ctx.createRadialGradient(c.x - px(2), c.y - px(2), px(1), c.x, c.y, px(BISCUIT_R))
        gr.addColorStop(0, '#ffffff')
        gr.addColorStop(1, '#c9ced8')
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(BISCUIT_R), 0, Math.PI * 2)
        ctx.fillStyle = gr
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(80,90,110,.6)'
        ctx.stroke()
      }

      // Strikers.
      for (const s of world.strikers) {
        if (!s) continue
        shadow(s.x, s.y, STRIKER_R)
        const c = toPx(v, s.x, s.y)
        const gr = ctx.createRadialGradient(c.x - px(5), c.y - px(6), px(2), c.x, c.y, px(STRIKER_R))
        gr.addColorStop(0, '#5a5f68')
        gr.addColorStop(0.45, '#1b1d22')
        gr.addColorStop(1, '#050506')
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(STRIKER_R), 0, Math.PI * 2)
        ctx.fillStyle = gr
        ctx.fill()
        ctx.lineWidth = Math.max(2, px(2.4))
        ctx.strokeStyle = info.colors[s.seat]
        ctx.stroke()
        // the knob on top
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(STRIKER_R * 0.42), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,.08)'
        ctx.fill()
      }

      // Ball.
      shadow(world.ball.x, world.ball.y, BALL_R)
      const bc = toPx(v, world.ball.x, world.ball.y)
      const bg2 = ctx.createRadialGradient(bc.x - px(2.5), bc.y - px(3), px(1), bc.x, bc.y, px(BALL_R))
      bg2.addColorStop(0, '#fff9c4')
      bg2.addColorStop(0.5, '#ffd51f')
      bg2.addColorStop(1, '#c79a00')
      ctx.beginPath()
      ctx.arc(bc.x, bc.y, px(BALL_R), 0, Math.PI * 2)
      ctx.fillStyle = bg2
      ctx.fill()
      ctx.restore()
      return v
    },
  }
}
