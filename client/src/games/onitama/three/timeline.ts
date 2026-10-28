/**
 * Plans one update's animation on the 3D table from the engine's events: pure (no three.js), so
 * the choreography is unit-tested. The scene samples the tracks every frame.
 *
 * - pieceMoved: the piece hops along an arc from its square to the destination
 * - pieceCaptured: as the attacker lands, the taken piece is knocked off in a high arc, tumbling
 *   into the capturer's tray
 * - cardRotated + cardTaken: the used card slides to the side slot, turning to face the next
 *   player, while the old side card slides into the mover's hand
 * - turnChanged: the camera swings 180° to look from behind the next player (alongside the
 *   cards). The whole update stays within MAX_TURN_MS.
 */
import type { Color } from '@games/onitama/data'
import type { OnitamaTableView, PieceView } from '@games/onitama/engine'
import { cameraYaw, handPose, piecePose, sidePose, trayPose, type Pose } from './geometry'

export const MAX_TURN_MS = 2500
export const MOVE_MS = 650
export const CAPTURE_MS = 760
export const CARD_MS = 760
export const CAMERA_MS = 1200

export interface Track {
  kind: 'piece' | 'card'
  id: string
  from: Pose
  to: Pose
  start: number
  duration: number
  /** Peak height of the hop above the straight line. */
  arc: number
  /** Extra tumble (radians about a horizontal axis) for knocked-off pieces. */
  tumble?: number
}

export interface Sound {
  name: string
  at: number
  volume?: number
}

export interface Timeline {
  tracks: Track[]
  camera: { fromYaw: number; toYaw: number; start: number; duration: number } | null
  sounds: Sound[]
  total: number
}

type Ev = { type: string; [k: string]: unknown }

/** Events name pieces by id (tolerate a piece object too). */
const pieceId = (p: unknown): string => (p && typeof p === 'object' ? (p as PieceView).id : String(p))

const colorOfSeat = (view: OnitamaTableView, seat: number): Color => view.players.find((p) => p.seat === seat)?.side ?? 'red'

/** Every card's resting pose in a view: each hand in its two slots, the side card by the board. */
export function cardPoses(view: OnitamaTableView): Map<string, Pose> {
  const out = new Map<string, Pose>()
  for (const p of view.players) p.hand.forEach((id, i) => out.set(id, handPose(p.side, i)))
  if (view.side) out.set(view.side, sidePose(colorOfSeat(view, view.sideFor)))
  return out
}

/** Every piece's resting pose: on the board, or in its capturer's tray. */
export function piecePoses(view: OnitamaTableView): Map<string, Pose> {
  const out = new Map<string, Pose>()
  for (const p of view.board) out.set(p.id, piecePose([p.x, p.y], p.color))
  for (const pl of view.players) pl.captured.forEach((p, i) => out.set(p.id, trayPose(pl.side, i)))
  return out
}

/** Which colour the camera should be behind for a view: the player to move (or the last one, at the end). */
export function viewerColor(view: OnitamaTableView): Color {
  return colorOfSeat(view, view.turn)
}

/** Ease-in-out cubic. */
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Shortest-way angle interpolation target (keeps half-turns going the same way, counter-clockwise). */
export function yawTarget(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  if (Math.abs(Math.abs(d) - Math.PI) < 1e-6) d = Math.PI
  return from + d
}

/** A track's pose at time `ms` (clamped to its ends). Pure. */
export function sampleTrack(t: Track, ms: number): Pose & { tumble: number } {
  const u = Math.max(0, Math.min(1, (ms - t.start) / t.duration))
  const k = ease(u)
  const lift = t.arc * 4 * u * (1 - u)
  const yawTo = yawTarget(t.from.yaw, t.to.yaw)
  return {
    x: t.from.x + (t.to.x - t.from.x) * k,
    y: t.from.y + (t.to.y - t.from.y) * k + lift,
    z: t.from.z + (t.to.z - t.from.z) * k,
    yaw: t.from.yaw + (yawTo - t.from.yaw) * k,
    tumble: (t.tumble ?? 0) * k,
  }
}

/** The camera yaw at time `ms` for a timeline (null camera = stays put). */
export function sampleCamera(tl: Timeline, ms: number, current: number): number {
  if (!tl.camera) return current
  const u = Math.max(0, Math.min(1, (ms - tl.camera.start) / tl.camera.duration))
  return tl.camera.fromYaw + (tl.camera.toYaw - tl.camera.fromYaw) * ease(u)
}

export function planTimeline(events: Ev[], prev: OnitamaTableView, next: OnitamaTableView, currentYaw: number, reduced = false): Timeline {
  const tracks: Track[] = []
  const sounds: Sound[] = []
  const prevPieces = piecePoses(prev)
  const nextPieces = piecePoses(next)
  const prevCards = cardPoses(prev)
  const nextCards = cardPoses(next)
  let landing = 0
  let cardsEnd = 0

  for (const e of events) {
    switch (e.type) {
      case 'pieceMoved': {
        const id = pieceId(e.piece)
        const from = prevPieces.get(id)
        const to = nextPieces.get(id)
        if (from && to) {
          tracks.push({ kind: 'piece', id, from, to, start: 0, duration: MOVE_MS, arc: 1.4 })
          landing = MOVE_MS
          sounds.push({ name: 'slide', at: 0, volume: 0.7 }, { name: 'wood-clack', at: MOVE_MS - 40 })
        }
        break
      }
      case 'pieceCaptured': {
        const id = pieceId(e.piece)
        const from = prevPieces.get(id)
        const to = nextPieces.get(id)
        if (from && to) {
          const start = Math.max(0, MOVE_MS - 120)
          tracks.push({ kind: 'piece', id, from, to, start, duration: CAPTURE_MS, arc: 3.2, tumble: Math.PI * 1.5 })
          sounds.push({ name: 'capture', at: start })
          landing = Math.max(landing, start + CAPTURE_MS)
        }
        break
      }
      case 'cardRotated':
      case 'cardTaken': {
        const id = e.card as string
        const from = prevCards.get(id)
        const to = nextCards.get(id)
        if (from && to && (from.x !== to.x || from.z !== to.z || from.yaw !== to.yaw)) {
          const start = e.type === 'cardRotated' ? 520 : 640
          if (!tracks.some((t) => t.kind === 'card' && t.id === id)) {
            tracks.push({ kind: 'card', id, from, to, start, duration: CARD_MS, arc: 0.6 })
            cardsEnd = Math.max(cardsEnd, start + CARD_MS)
            if (e.type === 'cardRotated') sounds.push({ name: 'card-swish', at: start })
          }
        }
        break
      }
      case 'gameOver':
        sounds.push({ name: 'bell', at: Math.max(landing, 300) })
        break
      default:
        break
    }
  }

  // The camera swings to the next player alongside the cards.
  const toColor = viewerColor(next)
  const targetYaw = yawTarget(currentYaw, cameraYaw(toColor))
  const camera = !next.finished && Math.abs(targetYaw - currentYaw) > 1e-3 ? { fromYaw: currentYaw, toYaw: targetYaw, start: 700, duration: CAMERA_MS } : null
  if (camera) sounds.push({ name: 'turn-tick', at: camera.start + camera.duration - 200, volume: 0.6 })

  let total = Math.max(landing, cardsEnd, camera ? camera.start + camera.duration : 0, 150)
  if (reduced) {
    for (const t of tracks) {
      t.start = 0
      t.duration = 200
      t.arc = 0
      t.tumble = 0
    }
    if (camera) {
      camera.start = 0
      camera.duration = 250
    }
    total = Math.min(Math.max(total, 200), 400)
  } else if (total > MAX_TURN_MS) {
    const f = MAX_TURN_MS / total
    for (const t of tracks) {
      t.start *= f
      t.duration *= f
    }
    for (const s of sounds) s.at *= f
    if (camera) {
      camera.start *= f
      camera.duration *= f
    }
    total = MAX_TURN_MS
  }
  return { tracks, camera, sounds, total }
}
