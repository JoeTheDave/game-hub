import { BALL_R, BISCUIT_R, STRIKER_R, type BoardGeometry, type World } from '@games/klask/physics'
import { dividerSegments, fitView, playfieldPath, toPx, type Ctx, type DrawInfo, type Renderer } from './common'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

const TRAIL = 14

/**
 * Neon arcade table: a dark field, glowing zone outlines in each player's colour, glowing goals,
 * light trails behind the strikers and ball, and a particle burst on every point.
 */
export function createStylizedRenderer(): Renderer {
  const trails = new Map<string, { x: number; y: number }[]>()
  let particles: Particle[] = []
  const pushTrail = (key: string, x: number, y: number) => {
    const t = trails.get(key) ?? []
    t.push({ x, y })
    if (t.length > TRAIL) t.shift()
    trails.set(key, t)
  }
  return {
    burst(x, y, color) {
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + Math.random() * 0.2
        const s = 120 + Math.random() * 380
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.6, color })
      }
    },
    draw(ctx: Ctx, w: number, h: number, world: World, geo: BoardGeometry, info: DrawInfo) {
      const v = fitView(geo, w, h, Math.min(w, h) * 0.09)
      const px = (mm: number) => mm * v.scale
      ctx.fillStyle = '#05050b'
      ctx.fillRect(0, 0, w, h)

      // Field.
      ctx.save()
      playfieldPath(ctx, v, geo)
      const fg = ctx.createRadialGradient(v.cx, v.cy, px(10), v.cx, v.cy, px(Math.max(geo.halfW, geo.halfH)))
      fg.addColorStop(0, '#11163a')
      fg.addColorStop(1, '#070818')
      ctx.fillStyle = fg
      ctx.fill()
      ctx.restore()

      const glow = (color: string, blur: number) => {
        ctx.shadowColor = color
        ctx.shadowBlur = blur
      }

      // Rim and dividers glow.
      ctx.save()
      glow('#7dd3fc', px(14))
      ctx.strokeStyle = '#7dd3fc'
      ctx.lineWidth = Math.max(2, px(3))
      playfieldPath(ctx, v, geo)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(125,211,252,.55)'
      ctx.lineWidth = Math.max(1.5, px(2))
      for (const s of dividerSegments(v, geo)) {
        ctx.beginPath()
        ctx.moveTo(s.a.x, s.a.y)
        ctx.lineTo(s.b.x, s.b.y)
        ctx.stroke()
      }
      ctx.restore()

      // Each player's zone: a coloured inner glow along the rim.
      if (geo.shape === 'circle') {
        const step = (2 * Math.PI) / geo.players
        geo.zoneAngles.forEach((a, seat) => {
          if (!world.alive[seat]) return
          ctx.save()
          glow(info.colors[seat], px(18))
          ctx.strokeStyle = info.colors[seat]
          ctx.lineWidth = Math.max(2, px(4))
          ctx.beginPath()
          // canvas y is flipped, so the angle is negated
          ctx.arc(v.cx, v.cy, px(geo.radius - 6), -(a + step / 2) + 0.04, -(a - step / 2) - 0.04)
          ctx.stroke()
          ctx.restore()
        })
      } else {
        ;[0, 1].forEach((seat) => {
          if (!world.alive[seat]) return
          const x0 = seat === 0 ? -geo.halfW + 6 : 6
          const a = toPx(v, x0, geo.halfH - 6)
          const b = toPx(v, x0 + geo.halfW - 12, -geo.halfH + 6)
          ctx.save()
          glow(info.colors[seat], px(18))
          ctx.strokeStyle = info.colors[seat]
          ctx.lineWidth = Math.max(2, px(3))
          ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
          ctx.restore()
        })
      }

      // Goals.
      for (const g of geo.goals) {
        const c = toPx(v, g.x, g.y)
        const open = world.alive[g.seat]
        ctx.save()
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(g.r), 0, Math.PI * 2)
        ctx.fillStyle = '#000'
        ctx.fill()
        if (open) glow(info.colors[g.seat], px(16))
        ctx.strokeStyle = open ? info.colors[g.seat] : 'rgba(255,255,255,.2)'
        ctx.lineWidth = Math.max(2, px(2.6))
        ctx.stroke()
        ctx.restore()
      }

      // Trails.
      const drawTrail = (key: string, color: string, r: number) => {
        const t = trails.get(key)
        if (!t) return
        t.forEach((p, i) => {
          const c = toPx(v, p.x, p.y)
          ctx.globalAlpha = ((i + 1) / t.length) * 0.35
          ctx.beginPath()
          ctx.arc(c.x, c.y, px(r) * ((i + 1) / t.length), 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        })
        ctx.globalAlpha = 1
      }
      for (const s of world.strikers) {
        if (!s) continue
        pushTrail(`s${s.seat}`, s.x, s.y)
        drawTrail(`s${s.seat}`, info.colors[s.seat], STRIKER_R)
      }
      pushTrail('ball', world.ball.x, world.ball.y)
      drawTrail('ball', '#fde047', BALL_R)

      // Biscuits.
      for (const b of world.biscuits) {
        const c = toPx(v, b.x, b.y)
        ctx.save()
        glow('#ffffff', px(10))
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(BISCUIT_R), 0, Math.PI * 2)
        ctx.fillStyle = '#f8fafc'
        ctx.fill()
        ctx.restore()
      }
      // Strikers: glowing rings in the seat colour.
      for (const s of world.strikers) {
        if (!s) continue
        const c = toPx(v, s.x, s.y)
        ctx.save()
        glow(info.colors[s.seat], px(20))
        ctx.beginPath()
        ctx.arc(c.x, c.y, px(STRIKER_R), 0, Math.PI * 2)
        ctx.fillStyle = '#0b0b16'
        ctx.fill()
        ctx.lineWidth = Math.max(3, px(4))
        ctx.strokeStyle = info.colors[s.seat]
        ctx.stroke()
        ctx.restore()
      }
      // Ball.
      const bc = toPx(v, world.ball.x, world.ball.y)
      ctx.save()
      glow('#fde047', px(18))
      ctx.beginPath()
      ctx.arc(bc.x, bc.y, px(BALL_R), 0, Math.PI * 2)
      ctx.fillStyle = '#fde047'
      ctx.fill()
      ctx.restore()

      // Particles (in table mm, gravity-free, fading).
      if (particles.length) {
        particles = particles.filter((p) => (p.life -= info.dt) > 0)
        for (const p of particles) {
          p.x += p.vx * info.dt
          p.y += p.vy * info.dt
          p.vx *= 0.94
          p.vy *= 0.94
          const c = toPx(v, p.x, p.y)
          ctx.globalAlpha = Math.min(1, p.life)
          ctx.fillStyle = p.color
          ctx.fillRect(c.x - 2, c.y - 2, 4, 4)
        }
        ctx.globalAlpha = 1
      }
      return v
    },
  }
}

