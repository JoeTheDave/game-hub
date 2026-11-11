/**
 * Klask table physics: pure, deterministic, fixed step (1/120 s), plain JSON state.
 *
 * Units are millimetres in table space, origin at the table's centre, +x right, +y up.
 * - 2 players: a rectangle (seat 0 = left half, seat 1 = right half), goals near each short end.
 * - 3 / 4 players: a round table cut into equal sectors; zone k is centred on angle
 *   ZONE0_ANGLE + k * 2π / n, with its goal hole near the rim on that centreline.
 *
 * The TV runs this live (it is the authority); the phone only uses the geometry helpers to clamp
 * its target. Strikers are confined to their zone (the magnet sits under a divided board); the ball
 * and biscuits roam freely. One point per play: after a detection the world pauses ('scored') until
 * `resetRound`.
 */

export const STEP = 1 / 120

// Piece sizes (mm). About 25% smaller than the first cut (Joe, 2026-11-10: "the game components
// are too big"), so the board feels roomier. The goal stays comfortably wider than the ball.
export const BALL_R = 6
export const STRIKER_R = 12
export const BISCUIT_R = 5
export const GOAL_R = 14

const BALL_DRAG = 0.8 // fraction of speed lost per second (felt friction)
// Hits were far too explosive (Joe, 2026-11-10): a soft striker-ball bounce, a cap on how much of
// the striker's speed reaches the ball, smoothed striker velocity (finger input arrives in
// jumps, so raw per-step velocity spikes), and a lower top speed.
// Iteration 3 (still explosive, strikers too fast): much lower caps, measured with bot play.
const BALL_MAX = 1100 // mm/s
const WALL_E = 0.7 // ball restitution with walls
const HIT_E = 0.6 // ball restitution with strikers
/** At most this much striker speed counts in a hit (mm/s); a flick still moves the striker fast. */
const HIT_STRIKER_CAP = 650
/** Smoothing for the striker velocity used in hits (fraction of the new reading per step). */
const HIT_VEL_SMOOTH = 0.35
const STRIKER_MAX = 1400 // mm/s (a quick but controllable hand)
const STRIKER_ACCEL = 40000 // mm/s² (scaled with the top speed; position still follows immediately)
const BISCUIT_DRAG = 3.2
const MAGNET_RANGE = 22 // beyond contact, where the pull starts (mm)
const MAGNET_PULL = 22000 // mm/s² at contact, falling off with distance
/** After a reset, magnets ignore biscuits briefly so pieces settle and players can pull back. */
export const MAGNET_GRACE_STEPS = 120
const DEAD_ZONE_DRIFT = 140
/** Faster than this, a ball skips over a hole instead of dropping in (mm/s). */
export const GOAL_CAPTURE_SPEED = 2600 // mm/s² push toward the centre in an eliminated player's zone

/** Zone 0's centreline angle on round tables (radians; straight down = the bottom of the TV). */
export const ZONE0_ANGLE = -Math.PI / 2

export type Shape = 'rect' | 'circle'
export type Vec = { x: number; y: number }

export interface Goal {
  seat: number
  x: number
  y: number
  r: number
}

export interface BoardGeometry {
  players: number
  shape: Shape
  /** rect: half extents. */
  halfW: number
  halfH: number
  /** circle: radius (0 for rect). */
  radius: number
  goals: Goal[]
  /** Where the ball is placed when that seat serves. */
  serveSpots: Vec[]
  /** Where each biscuit starts every round (players + 1 of them). */
  biscuitSpawns: Vec[]
  /** Where each striker starts. */
  homeSpots: Vec[]
  /** Zone dividers as line segments, for rendering. */
  dividers: { a: Vec; b: Vec }[]
  /** Round tables: each zone's centreline angle. */
  zoneAngles: number[]
}

const geoCache = new Map<number, BoardGeometry>()

/** The board for a player count (2, 3 or 4). */
export function boardGeometry(players: number): BoardGeometry {
  const n = players
  const cached = geoCache.get(n)
  if (cached) return cached
  let g: BoardGeometry
  if (n === 2) {
    const halfW = 200
    const halfH = 150
    g = {
      players: 2,
      shape: 'rect',
      halfW,
      halfH,
      radius: 0,
      goals: [
        { seat: 0, x: -halfW + 40, y: 0, r: GOAL_R },
        { seat: 1, x: halfW - 40, y: 0, r: GOAL_R },
      ],
      // Real Klask serves from the conceding player's corner.
      serveSpots: [
        { x: -halfW + 30, y: halfH - 30 },
        { x: halfW - 30, y: -halfH + 30 },
      ],
      biscuitSpawns: [
        { x: 0, y: -60 },
        { x: 0, y: 0 },
        { x: 0, y: 60 },
      ],
      homeSpots: [
        { x: -halfW + 90, y: 0 },
        { x: halfW - 90, y: 0 },
      ],
      dividers: [{ a: { x: 0, y: -halfH }, b: { x: 0, y: halfH } }],
      zoneAngles: [Math.PI, 0],
    }
  } else if (n === 3 || n === 4) {
    const radius = n === 3 ? 230 : 250
    const zoneAngles = Array.from({ length: n }, (_, k) => ZONE0_ANGLE + (k * 2 * Math.PI) / n)
    const at = (ang: number, r: number): Vec => ({ x: Math.cos(ang) * r, y: Math.sin(ang) * r })
    const half = Math.PI / n
    g = {
      players: n,
      shape: 'circle',
      halfW: radius,
      halfH: radius,
      radius,
      goals: zoneAngles.map((a, seat) => ({ seat, ...at(a, radius * 0.78), r: GOAL_R })),
      // Serve off the centreline (like a corner), between the goal and the centre.
      serveSpots: zoneAngles.map((a) => at(a + half * 0.55, radius * 0.62)),
      biscuitSpawns: Array.from({ length: n + 1 }, (_, i) => at(ZONE0_ANGLE + Math.PI / (n + 1) + (i * 2 * Math.PI) / (n + 1), 34)),
      homeSpots: zoneAngles.map((a) => at(a, radius * 0.5)),
      dividers: zoneAngles.map((a) => ({ a: { x: 0, y: 0 }, b: at(a + half, radius) })),
      zoneAngles,
    }
  } else {
    throw new Error(`Klask needs 2-4 players (got ${players})`)
  }
  geoCache.set(n, g)
  return g
}

/** Which zone (seat) a point lies in. */
export function zoneOf(geo: BoardGeometry, x: number, y: number): number {
  if (geo.shape === 'rect') return x < 0 ? 0 : 1
  const ang = Math.atan2(y, x)
  const step = (2 * Math.PI) / geo.players
  const rel = wrap(ang - ZONE0_ANGLE + step / 2)
  return Math.min(geo.players - 1, Math.floor(rel / step))
}

/** Axis-aligned bounds of the area a seat's striker can reach (for the phone's trackpad mapping). */
export function zoneBounds(geo: BoardGeometry, seat: number): { minX: number; maxX: number; minY: number; maxY: number } {
  if (geo.shape === 'rect') {
    const r = STRIKER_R
    return seat === 0
      ? { minX: -geo.halfW + r, maxX: -r, minY: -geo.halfH + r, maxY: geo.halfH - r }
      : { minX: r, maxX: geo.halfW - r, minY: -geo.halfH + r, maxY: geo.halfH - r }
  }
  const pts: Vec[] = [{ x: 0, y: 0 }]
  const a = geo.zoneAngles[seat]
  const half = Math.PI / geo.players
  for (let i = 0; i <= 16; i++) {
    const t = a - half + (2 * half * i) / 16
    pts.push({ x: Math.cos(t) * (geo.radius - STRIKER_R), y: Math.sin(t) * (geo.radius - STRIKER_R) })
  }
  const c = pts.map((p) => clampToZone(geo, seat, p.x, p.y))
  return {
    minX: Math.min(...c.map((p) => p.x)),
    maxX: Math.max(...c.map((p) => p.x)),
    minY: Math.min(...c.map((p) => p.y)),
    maxY: Math.max(...c.map((p) => p.y)),
  }
}

/** The nearest point a seat's striker may occupy (inside the walls, inside its zone, clear of dividers). */
export function clampToZone(geo: BoardGeometry, seat: number, x: number, y: number): Vec {
  const r = STRIKER_R
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...geo.homeSpots[seat] }
  if (geo.shape === 'rect') {
    const minX = seat === 0 ? -geo.halfW + r : r
    const maxX = seat === 0 ? -r : geo.halfW - r
    return { x: clamp(x, minX, maxX), y: clamp(y, -geo.halfH + r, geo.halfH - r) }
  }
  // Work in the zone's local frame: centreline along +x, boundaries at ±half.
  const a = geo.zoneAngles[seat]
  const half = Math.PI / geo.players
  const ca = Math.cos(-a)
  const sa = Math.sin(-a)
  let lx = x * ca - y * sa
  let ly = x * sa + y * ca
  // Boundary rays' inward normals (pointing into the zone).
  const n1 = { x: Math.sin(half), y: Math.cos(half) } // for the ray at -half
  const n2 = { x: Math.sin(half), y: -Math.cos(half) } // for the ray at +half
  const maxR = geo.radius - r
  for (let it = 0; it < 4; it++) {
    const d1 = lx * n1.x + ly * n1.y
    if (d1 < r) {
      lx += (r - d1) * n1.x
      ly += (r - d1) * n1.y
    }
    const d2 = lx * n2.x + ly * n2.y
    if (d2 < r) {
      lx += (r - d2) * n2.x
      ly += (r - d2) * n2.y
    }
    const len = Math.hypot(lx, ly)
    if (len > maxR) {
      lx *= maxR / len
      ly *= maxR / len
    }
  }
  const cb = Math.cos(a)
  const sb = Math.sin(a)
  return { x: lx * cb - ly * sb, y: lx * sb + ly * cb }
}

// ——— World ———

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

export interface Striker {
  seat: number
  x: number
  y: number
  vx: number
  vy: number
  /** Smoothed velocity used for hits (optional for worlds saved before it existed). */
  hvx?: number
  hvy?: number
  /** Biscuit indexes stuck to this striker, with their offset from its centre. */
  attached: { b: number; ox: number; oy: number }[]
}

export interface Biscuit {
  x: number
  y: number
  vx: number
  vy: number
  /** Seat of the striker it's stuck to, or null. */
  on: number | null
}

export type PointReason = 'goal' | 'klask' | 'biscuits'

export interface World {
  players: number
  /** Per seat: still in the game. Eliminated seats have no striker and their goal is closed. */
  alive: boolean[]
  ball: Ball
  /** Indexed by seat; null for an eliminated seat. */
  strikers: (Striker | null)[]
  biscuits: Biscuit[]
  phase: 'play' | 'scored'
  tick: number
  /** Set on the step that detected a point (kept until resetRound). */
  point: { against: number; reason: PointReason } | null
  serveSeat: number
  /** Tick before which magnets don't act on biscuits (set by resetRound). */
  graceUntil: number
}

export type PhysicsEvent =
  | { type: 'hit'; seat: number; speed: number }
  | { type: 'wall'; speed: number }
  | { type: 'biscuit'; seat: number; count: number }
  | { type: 'point'; against: number; reason: PointReason }

/** A fresh world with the ball at `serveSeat`'s serve spot. */
export function createWorld(players: number, alive?: boolean[], serveSeat = 0): World {
  const geo = boardGeometry(players)
  const al = alive && alive.length === players ? alive.slice() : Array.from({ length: players }, () => true)
  const strikers = al.map((a, seat) => (a ? { seat, ...geo.homeSpots[seat], vx: 0, vy: 0, attached: [] } : null))
  const world: World = {
    players,
    alive: al,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    strikers,
    biscuits: [],
    phase: 'play',
    tick: 0,
    point: null,
    serveSeat,
    graceUntil: 0,
  }
  return resetRound(world, serveSeat, al)
}

/**
 * Start a new play: ball at the server's serve spot, biscuits back on their spawns, nothing stuck,
 * strikers back on their home spots (the TV tells phones to re-centre), and a short magnet grace
 * period so no striker grabs the freshly placed biscuits. `alive` updates eliminations.
 */
export function resetRound(world: World, serveSeat: number, alive: boolean[] = world.alive): World {
  const geo = boardGeometry(world.players)
  const seat = alive[serveSeat] ? serveSeat : alive.findIndex(Boolean)
  const strikers = alive.map((a, i) => {
    if (!a) return null
    return { seat: i, ...geo.homeSpots[i], vx: 0, vy: 0, attached: [] }
  })
  return {
    ...world,
    alive: alive.slice(),
    ball: { ...geo.serveSpots[Math.max(0, seat)], vx: 0, vy: 0 },
    strikers,
    biscuits: geo.biscuitSpawns.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0, on: null })),
    phase: 'play',
    point: null,
    serveSeat: Math.max(0, seat),
    graceUntil: world.tick + MAGNET_GRACE_STEPS,
  }
}

/** Per seat: where that player's finger puts their striker (table coordinates); missing = hold still. */
export type Inputs = Partial<Record<number, Vec | undefined>>

/** Advance one fixed step. Pure: returns a new world. */
export function step(world: World, inputs: Inputs): { world: World; events: PhysicsEvent[] } {
  const geo = boardGeometry(world.players)
  const dt = STEP
  const events: PhysicsEvent[] = []
  const strikers = world.strikers.map((s) => (s ? { ...s, attached: s.attached.map((a) => ({ ...a })) } : null))
  const biscuits = world.biscuits.map((b) => ({ ...b }))
  const ball = { ...world.ball }

  // 1. Strikers chase their targets (fast, capped), confined to their zones.
  for (const s of strikers) {
    if (!s) continue
    const raw = inputs[s.seat]
    const target = raw ? clampToZone(geo, s.seat, raw.x, raw.y) : { x: s.x, y: s.y }
    let dvx = (target.x - s.x) / dt
    let dvy = (target.y - s.y) / dt
    const want = Math.hypot(dvx, dvy)
    if (want > STRIKER_MAX) {
      dvx *= STRIKER_MAX / want
      dvy *= STRIKER_MAX / want
    }
    let ax = (dvx - s.vx) / dt
    let ay = (dvy - s.vy) / dt
    const acc = Math.hypot(ax, ay)
    if (acc > STRIKER_ACCEL) {
      ax *= STRIKER_ACCEL / acc
      ay *= STRIKER_ACCEL / acc
    }
    const ox = s.x
    const oy = s.y
    s.vx += ax * dt
    s.vy += ay * dt
    const p = clampToZone(geo, s.seat, s.x + s.vx * dt, s.y + s.vy * dt)
    s.x = p.x
    s.y = p.y
    s.vx = (s.x - ox) / dt
    s.vy = (s.y - oy) / dt
    s.hvx = (s.hvx ?? 0) + (s.vx - (s.hvx ?? 0)) * HIT_VEL_SMOOTH
    s.hvy = (s.hvy ?? 0) + (s.vy - (s.hvy ?? 0)) * HIT_VEL_SMOOTH
    for (const a of s.attached) {
      const b = biscuits[a.b]
      b.x = s.x + a.ox
      b.y = s.y + a.oy
      b.vx = s.vx
      b.vy = s.vy
      // A biscuit stuck on the far side of a striker against a wall still stays on the table.
      wall(geo, b, BISCUIT_R, 0)
    }
  }

  const scored = world.phase === 'scored'

  if (!scored) {
    // 2. Ball: drag, dead-zone drift, move, walls.
    const drag = Math.max(0, 1 - BALL_DRAG * dt)
    ball.vx *= drag
    ball.vy *= drag
    const zone = zoneOf(geo, ball.x, ball.y)
    if (!world.alive[zone]) {
      const d = Math.hypot(ball.x, ball.y) || 1
      ball.vx -= (ball.x / d) * DEAD_ZONE_DRIFT * dt
      ball.vy -= (ball.y / d) * DEAD_ZONE_DRIFT * dt
    }
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt
    const wallSpeed = wall(geo, ball, BALL_R, WALL_E)
    if (wallSpeed > 120) events.push({ type: 'wall', speed: wallSpeed })

    // 3. Ball vs strikers (kinematic) and their stuck biscuits.
    for (const s of strikers) {
      if (!s) continue
      const hv = hitVelocity(s)
      const sp = bounceOffMover(ball, s.x, s.y, hv.x, hv.y, BALL_R + STRIKER_R)
      if (sp > 0) events.push({ type: 'hit', seat: s.seat, speed: sp })
      for (const a of s.attached) {
        const b = biscuits[a.b]
        bounceOffMover(ball, b.x, b.y, hv.x, hv.y, BALL_R + BISCUIT_R)
      }
    }

    // 4. Free biscuits: magnet pull, drag, ball collisions, walls, sticking.
    const magnets = world.tick >= world.graceUntil
    for (let i = 0; i < biscuits.length; i++) {
      const b = biscuits[i]
      if (b.on !== null) continue
      for (const s of strikers) {
        if (!s || !magnets) continue
        const dx = s.x - b.x
        const dy = s.y - b.y
        const d = Math.hypot(dx, dy)
        const contact = STRIKER_R + BISCUIT_R
        if (d < contact + MAGNET_RANGE && d > 0) {
          const f = MAGNET_PULL * Math.pow(1 - Math.max(0, d - contact) / MAGNET_RANGE, 2)
          b.vx += (dx / d) * f * dt
          b.vy += (dy / d) * f * dt
        }
      }
      const bd = Math.max(0, 1 - BISCUIT_DRAG * dt)
      b.vx *= bd
      b.vy *= bd
      b.x += b.vx * dt
      b.y += b.vy * dt
      // Ball and a free biscuit: a light biscuit gets knocked, the ball barely slows.
      collideFree(ball, 1, BALL_R, b, 0.35, BISCUIT_R)
      wall(geo, b, BISCUIT_R, 0.3)
      for (const s of strikers) {
        if (!s) continue
        if (!magnets) {
          // Not magnetic yet: just get shoved aside.
          collideFree({ x: s.x, y: s.y, vx: s.vx, vy: s.vy }, 1e6, STRIKER_R, b, 0.35, BISCUIT_R)
          continue
        }
        const dx = b.x - s.x
        const dy = b.y - s.y
        const d = Math.hypot(dx, dy)
        if (d <= STRIKER_R + BISCUIT_R + 0.5) {
          const k = (STRIKER_R + BISCUIT_R) / (d || 1)
          b.on = s.seat
          s.attached.push({ b: i, ox: dx * k, oy: dy * k })
          b.x = s.x + dx * k
          b.y = s.y + dy * k
          b.vx = s.vx
          b.vy = s.vy
          events.push({ type: 'biscuit', seat: s.seat, count: s.attached.length })
          break
        }
      }
      // Shoves and sticking can push a biscuit into a wall; keep it on the table.
      wall(geo, b, BISCUIT_R, 0.3)
    }
    // Collisions can shove the ball into a wall; keep it on the table.
    wall(geo, ball, BALL_R, WALL_E)
    const v = Math.hypot(ball.vx, ball.vy)
    if (v > BALL_MAX) {
      ball.vx *= BALL_MAX / v
      ball.vy *= BALL_MAX / v
    }
  }

  let point = world.point
  let phase = world.phase
  if (!scored) {
    // 5. Detection, one point per play: biscuits, then Klask, then a goal.
    let found: { against: number; reason: PointReason } | null = null
    for (const s of strikers) if (!found && s && s.attached.length >= 2) found = { against: s.seat, reason: 'biscuits' }
    // No Klask (own goal) during the post-reset grace window: a striker dragged back over its
    // goal by a stale input must never lose a point before its player can react (Joe, 2026-11-10).
    const klaskLive = world.tick >= world.graceUntil
    for (const s of strikers) {
      if (found || !s || !klaskLive) continue
      const g = geo.goals[s.seat]
      if (Math.hypot(s.x - g.x, s.y - g.y) < g.r) found = { against: s.seat, reason: 'klask' }
    }
    if (!found) {
      for (const g of geo.goals) {
        if (!world.alive[g.seat]) continue
        // The ball drops in when its centre is well over the hole and it isn't flying across it.
        if (Math.hypot(ball.x - g.x, ball.y - g.y) < g.r - BALL_R * 0.25 && Math.hypot(ball.vx, ball.vy) < GOAL_CAPTURE_SPEED) {
          found = { against: g.seat, reason: 'goal' }
          break
        }
      }
    }
    if (found) {
      point = found
      phase = 'scored'
      events.push({ type: 'point', ...found })
    }
  }

  return { world: { ...world, ball, strikers, biscuits, phase, point, tick: world.tick + 1 }, events }
}

// ——— helpers ———

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function wrap(a: number) {
  const t = 2 * Math.PI
  return ((a % t) + t) % t
}

/** Keep a moving disc inside the table; returns the impact speed (0 if none). */
function wall(geo: BoardGeometry, p: { x: number; y: number; vx: number; vy: number }, r: number, e: number): number {
  let impact = 0
  if (geo.shape === 'rect') {
    if (p.x < -geo.halfW + r) {
      p.x = -geo.halfW + r
      if (p.vx < 0) {
        impact = Math.max(impact, -p.vx)
        p.vx = -p.vx * e
      }
    }
    if (p.x > geo.halfW - r) {
      p.x = geo.halfW - r
      if (p.vx > 0) {
        impact = Math.max(impact, p.vx)
        p.vx = -p.vx * e
      }
    }
    if (p.y < -geo.halfH + r) {
      p.y = -geo.halfH + r
      if (p.vy < 0) {
        impact = Math.max(impact, -p.vy)
        p.vy = -p.vy * e
      }
    }
    if (p.y > geo.halfH - r) {
      p.y = geo.halfH - r
      if (p.vy > 0) {
        impact = Math.max(impact, p.vy)
        p.vy = -p.vy * e
      }
    }
    return impact
  }
  const d = Math.hypot(p.x, p.y)
  const max = geo.radius - r
  if (d > max && d > 0) {
    const nx = p.x / d
    const ny = p.y / d
    p.x = nx * max
    p.y = ny * max
    const vn = p.vx * nx + p.vy * ny
    if (vn > 0) {
      impact = vn
      p.vx -= (1 + e) * vn * nx
      p.vy -= (1 + e) * vn * ny
    }
  }
  return impact
}

/** Ball off an infinitely heavy moving disc at (x, y) with velocity (vx, vy); returns impact speed. */
/** The striker velocity a hit uses: smoothed, then capped, so a jittery flick can't launch the ball. */
export function hitVelocity(s: Pick<Striker, 'vx' | 'vy' | 'hvx' | 'hvy'>): Vec {
  let x = s.hvx ?? s.vx
  let y = s.hvy ?? s.vy
  const v = Math.hypot(x, y)
  if (v > HIT_STRIKER_CAP) {
    x *= HIT_STRIKER_CAP / v
    y *= HIT_STRIKER_CAP / v
  }
  return { x, y }
}

function bounceOffMover(ball: Ball, x: number, y: number, vx: number, vy: number, minDist: number): number {
  const dx = ball.x - x
  const dy = ball.y - y
  const d = Math.hypot(dx, dy)
  if (d >= minDist) return 0
  const nx = d > 0 ? dx / d : 1
  const ny = d > 0 ? dy / d : 0
  ball.x = x + nx * minDist
  ball.y = y + ny * minDist
  const rvx = ball.vx - vx
  const rvy = ball.vy - vy
  const vn = rvx * nx + rvy * ny
  if (vn >= 0) return 0
  ball.vx -= (1 + HIT_E) * vn * nx
  ball.vy -= (1 + HIT_E) * vn * ny
  return -vn
}

/** Elastic-ish collision between two free discs with masses. */
function collideFree(
  a: { x: number; y: number; vx: number; vy: number },
  ma: number,
  ra: number,
  b: { x: number; y: number; vx: number; vy: number },
  mb: number,
  rb: number
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  const min = ra + rb
  if (d >= min) return
  const nx = d > 0 ? dx / d : 1
  const ny = d > 0 ? dy / d : 0
  const overlap = min - d
  const tm = ma + mb
  a.x -= nx * overlap * (mb / tm)
  a.y -= ny * overlap * (mb / tm)
  b.x += nx * overlap * (ma / tm)
  b.y += ny * overlap * (ma / tm)
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (vn >= 0) return
  const j = (-(1 + 0.8) * vn) / (1 / ma + 1 / mb)
  a.vx -= (j / ma) * nx
  a.vy -= (j / ma) * ny
  b.vx += (j / mb) * nx
  b.vy += (j / mb) * ny
}
