import { STEP, boardGeometry, clampToZone, createWorld, resetRound, step, type BoardGeometry, type Inputs, type PointReason, type World } from '@games/klask/physics'
import type { KlaskTableView } from '@games/klask/engine'
import { isFreshMatch, makeThrottle, pointSound, shouldReset } from './logic'

export interface DirectorDeps {
  /** POST the outcome as the table authority (host session). */
  post: (action: { type: 'point'; against: number; reason: PointReason }) => Promise<{ ok: boolean; status?: number; error?: string }>
  play: (name: string, volume?: number) => void
  /** Feedback to one phone (haptics, re-centre). */
  send: (seat: number, data: unknown) => void
  onPoint: (p: { against: number; reason: PointReason }) => void
  onAuthError: (message: string) => void
}

/** At most this many physics steps per frame (a long hitch never spirals). */
const MAX_STEPS_PER_FRAME = 12
/** How often to re-send "center" to a phone whose input isn't for the current epoch yet (ms). */
export const CENTER_RESEND_MS = 400

/** A phone's latest target, tagged with the input epoch it was made for. */
export interface Target {
  x: number
  y: number
  epoch?: number
}

/**
 * The TV's game loop, without React or the DOM: runs the physics at a fixed 120 Hz from the
 * phones' latest targets, turns physics events into sounds/haptics, reports each point once as
 * the authority, and starts the next play once the platform has applied it.
 */
export class TableDirector {
  world: World
  geo: BoardGeometry
  private acc = 0
  private view: KlaskTableView
  private prevFinished: boolean | null = null
  /** The point awaiting the platform: the round it was scored in and when. */
  pending: { round: number; at: number } | null = null
  private throttle = makeThrottle(70)
  /**
   * The input epoch. It is bumped on every reset and rematch, and a phone's target counts only
   * when it was made for the current epoch. Stale targets (e.g. a finger last seen over the
   * player's own goal) can never drag a freshly reset striker back into its goal (Joe, 2026-11-10:
   * player 2 looped into its own goal after a rematch). Until a phone catches up, its striker
   * holds at home and the TV keeps re-sending "center".
   */
  epoch = 1
  private centerSentAt: Record<number, number> = {}

  private deps: DirectorDeps

  constructor(view: KlaskTableView, deps: DirectorDeps) {
    this.deps = deps
    this.view = view
    this.geo = boardGeometry(view.playerCount)
    this.world = createWorld(view.playerCount, this.alive(view), view.serveSeat)
    this.prevFinished = view.finished
  }

  private alive(view: KlaskTableView) {
    return view.players.slice().sort((a, b) => a.seat - b.seat).map((p) => p.alive)
  }

  /** A new view from the platform (a point applied, a rematch, a resync). */
  setView(view: KlaskTableView, now: number) {
    const fresh = isFreshMatch(this.prevFinished, view.finished, view.round) || view.playerCount !== this.world.players
    this.view = view
    this.prevFinished = view.finished
    if (fresh) {
      this.geo = boardGeometry(view.playerCount)
      this.world = createWorld(view.playerCount, this.alive(view), view.serveSeat)
      this.pending = null
      this.recentre(now)
      return
    }
    this.maybeReset(now)
  }

  /** New epoch: every phone re-centres its target to its home spot and sends a fresh one. */
  private recentre(now: number) {
    this.epoch++
    this.centerSentAt = {}
    this.world.alive.forEach((a, seat) => {
      if (a) this.sendCenter(seat, now)
    })
  }

  private sendCenter(seat: number, now: number) {
    this.centerSentAt[seat] = now
    this.deps.send(seat, { re: 'center', epoch: this.epoch })
  }

  private maybeReset(now: number) {
    if (!this.pending) return
    if (shouldReset({ pointRound: this.pending.round, pointAt: this.pending.at, now, viewRound: this.view.round, finished: this.view.finished })) {
      this.world = resetRound(this.world, this.view.serveSeat, this.alive(this.view))
      this.pending = null
      this.deps.play('serve', 0.6)
      this.recentre(now)
    }
  }

  /** Advance by `dt` seconds of wall time with the phones' latest targets (table mm). */
  tick(dt: number, targets: Record<number, Target | undefined>, now: number) {
    this.maybeReset(now)
    if (this.view.finished) return
    const inputs: Inputs = {}
    this.world.strikers.forEach((s, seat) => {
      if (!s) return
      const t = targets[seat]
      if (t && (t.epoch ?? 0) === this.epoch) {
        inputs[seat] = clampToZone(this.geo, seat, t.x, t.y)
        return
      }
      // No target for this epoch yet: hold at home, and nudge the phone again in case the
      // "center" message was lost (feedback rides an unreliable channel).
      inputs[seat] = { ...this.geo.homeSpots[seat] }
      if (now - (this.centerSentAt[seat] ?? -Infinity) >= CENTER_RESEND_MS) this.sendCenter(seat, now)
    })
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS_PER_FRAME)
    while (this.acc >= STEP) {
      this.acc -= STEP
      const r = step(this.world, inputs)
      this.world = r.world
      for (const e of r.events) this.handle(e, now)
    }
  }

  private handle(e: ReturnType<typeof step>['events'][number], now: number) {
    switch (e.type) {
      case 'hit':
        if (this.throttle(`hit${e.seat}`, now)) {
          this.deps.play('ball-hit', Math.min(1, 0.35 + e.speed / 3000))
          this.deps.send(e.seat, { kind: 'hit' })
        }
        break
      case 'wall':
        if (this.throttle('wall', now)) this.deps.play('wall', Math.min(1, 0.25 + e.speed / 4000))
        break
      case 'biscuit':
        this.deps.play('biscuit', 0.8)
        this.deps.send(e.seat, { kind: 'snap' })
        break
      case 'point':
        this.point(e.against, e.reason, now)
        break
    }
  }

  private point(against: number, reason: PointReason, now: number) {
    if (this.pending) return // one point per play
    this.pending = { round: this.view.round, at: now }
    this.deps.play(pointSound(reason))
    this.deps.send(against, { kind: 'point' })
    this.deps.onPoint({ against, reason })
    void this.deps.post({ type: 'point', against, reason }).then((r) => {
      if (r.ok) return
      if (r.status === 403 || r.status === 401) this.deps.onAuthError('Open this table from the host’s signed-in browser to keep score.')
      else this.deps.onAuthError(r.error ?? 'The point could not be recorded.')
    })
  }
}
