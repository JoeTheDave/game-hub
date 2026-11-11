import { clampToZone, type BoardGeometry, type PointReason, type Vec } from '@games/klask/physics'

/** Lobby colour names → hex, plus a fallback palette for seats without a colour. */
const COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#facc15',
  orange: '#f97316',
  purple: '#a855f7',
}
const FALLBACK = ['#ef4444', '#3b82f6', '#22c55e', '#facc15']
export function seatHex(color: string | null | undefined, seat: number): string {
  return (color && COLOR_HEX[color]) || FALLBACK[seat % FALLBACK.length]
}

/**
 * How finger movement maps onto the table:
 * - 'tv' (default): match the TV. Finger right moves the striker right on screen and finger up
 *   moves it up, which is what you expect when you're watching the TV, not the phone.
 * - 'side': relative to your own side of the table. Finger "away from you" moves toward the centre.
 */
export type Mapping = 'tv' | 'side'

// Calmer default (Joe, 2026-11-10: strikers far too fast): 0.6 mm per CSS px.
export const SENSITIVITY = { min: 0.3, max: 1.5, default: 0.6, step: 0.05 } // table mm per CSS px
/** Fast flicks travel further: gain grows past this finger speed (px/ms), capped. */
const ACCEL_FROM = 0.6
const ACCEL_PER = 0.9
const ACCEL_MAX = 1.5

/** Turn a finger movement on the phone (screen px, y down) into a table-space delta (mm, y up). */
export function deltaToTable(dxPx: number, dyPx: number, seat: number, geo: BoardGeometry, mapping: Mapping): Vec {
  if (mapping === 'tv') return { x: dxPx, y: -dyPx }
  // Standing at the zone, facing the centre: forward points from the zone toward the centre.
  const a = geo.zoneAngles[seat]
  const fwd = { x: -Math.cos(a), y: -Math.sin(a) }
  const right = { x: fwd.y, y: -fwd.x }
  return { x: right.x * dxPx + fwd.x * -dyPx, y: right.y * dxPx + fwd.y * -dyPx }
}

/** Speed-based gain for one movement sample. */
export function flickGain(distPx: number, dtMs: number): number {
  if (dtMs <= 0) return 1
  const v = distPx / dtMs
  return Math.min(ACCEL_MAX, 1 + Math.max(0, v - ACCEL_FROM) * ACCEL_PER)
}

/**
 * One trackpad sample: the striker's new target (table mm), clamped to the player's zone.
 * Relative: where the finger sits on the glass never matters, so lifting and replacing it
 * never makes the striker jump.
 */
export function trackpadStep(
  target: Vec,
  move: { dx: number; dy: number; dtMs: number },
  opts: { seat: number; geo: BoardGeometry; mapping: Mapping; sensitivity: number }
): Vec {
  const gain = flickGain(Math.hypot(move.dx, move.dy), move.dtMs)
  const d = deltaToTable(move.dx, move.dy, opts.seat, opts.geo, opts.mapping)
  const k = opts.sensitivity * gain
  return clampToZone(opts.geo, opts.seat, target.x + d.x * k, target.y + d.y * k)
}

export function clampSensitivity(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return SENSITIVITY.default
  return Math.min(SENSITIVITY.max, Math.max(SENSITIVITY.min, n))
}

const REASON_TEXT: Record<PointReason, string> = { goal: 'Goal!', klask: 'Klask!', biscuits: 'Biscuits!' }
/** The TV banner for a point: what happened and who conceded. */
export function bannerText(reason: PointReason, concederName: string): { title: string; sub: string } {
  const sub =
    reason === 'goal' ? `into ${concederName}’s goal` : reason === 'klask' ? `${concederName} fell in` : `${concederName} picked up two`
  return { title: REASON_TEXT[reason], sub }
}

/** Sound for a point. */
export function pointSound(reason: PointReason): string {
  return reason === 'goal' ? 'goal' : 'klask'
}

export const RESET_DELAY_MS = 1500

/**
 * After the TV reports a point, the next play starts once the platform has applied it (the next
 * view's round is past the one that was scored) and the banner has had its moment.
 */
export function shouldReset(p: { pointRound: number; pointAt: number; now: number; viewRound: number; finished: boolean }): boolean {
  return !p.finished && p.viewRound > p.pointRound && p.now - p.pointAt >= RESET_DELAY_MS
}

/** A new match on the same instance (Rematch): the previous view was finished and this one isn't. */
export function isFreshMatch(prevFinished: boolean | null, nowFinished: boolean, round: number): boolean {
  return prevFinished === true && !nowFinished && round === 0
}

/** Running match wins across rematches (summary scores are 1 for the winner). */
export interface SeriesSummary {
  games: { scores: number[]; winners: number[] }[]
  totals: number[]
  leaders: number[]
  line: string
}
export function seriesSummary(history: { scores: number[]; winners: number[] }[] | undefined, players: { seat: number; name: string }[]): SeriesSummary | null {
  if (!history || history.length < 2) return null
  const seats = players.map((p) => p.seat)
  const totals: number[] = []
  for (const seat of seats) totals[seat] = history.reduce((sum, g) => sum + (g.scores[seat] ?? 0), 0)
  const best = Math.max(...seats.map((s) => totals[s]))
  const leaders = seats.filter((s) => totals[s] === best)
  const ordered = seats.slice().sort((a, b) => totals[b] - totals[a])
  const score = ordered.map((s) => totals[s]).join(' to ')
  const name = (seat: number) => players.find((p) => p.seat === seat)?.name ?? `Player ${seat + 1}`
  const line = leaders.length === 1 ? `${name(leaders[0])} leads the series · ${score} wins` : `Series tied · ${score} wins`
  return { games: history, totals, leaders, line }
}

/** Throttle per key: true when at least `ms` has passed since the last allowed call. */
export function makeThrottle(ms: number) {
  const last = new Map<string, number>()
  return (key: string, now: number) => {
    const t = last.get(key)
    if (t !== undefined && now - t < ms) return false
    last.set(key, now)
    return true
  }
}

/** Final standings: winners first, then by lives left (or score, for 2 players). */
export function standingsRows(
  view: { playerCount: number; players: { seat: number; name: string; color: string | null; lives: number; alive: boolean; score: number }[]; result: { winners: number[] } | null },
  me?: number
) {
  const winners = view.result?.winners ?? []
  const two = view.playerCount === 2
  return view.players
    .map((p) => ({
      seat: p.seat,
      name: p.name,
      hex: seatHex(p.color, p.seat),
      winner: winners.includes(p.seat),
      value: two ? String(p.score) : p.alive ? `${p.lives} ♥` : 'Out',
      me: me === p.seat,
      sort: two ? p.score : p.lives,
    }))
    .sort((a, b) => Number(b.winner) - Number(a.winner) || b.sort - a.sort)
    .map(({ sort: _sort, ...r }) => r)
}

/**
 * A phone's answer to the table's "center" message. A new epoch (a reset or rematch) moves the
 * target back to the player's home spot and adopts the epoch. A repeat of the current epoch
 * (the table hasn't heard from us yet, e.g. a lost packet) keeps the target where it is, so a
 * mid-play nudge never yanks the striker home.
 */
export function recenter(
  state: { epoch: number; target: { x: number; y: number } },
  incoming: number | undefined,
  home: { x: number; y: number }
): { epoch: number; target: { x: number; y: number } } {
  if (incoming === undefined || incoming !== state.epoch) return { epoch: incoming ?? state.epoch, target: { ...home } }
  return { epoch: state.epoch, target: state.target }
}
