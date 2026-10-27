import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Flying-clone animation layer for the TV (copied from Splendor's, plus chaining). Flyers live in
 * the stage's design coordinates (1920×1080) and are animated with the Web Animations API from a
 * source rect to a destination rect.
 *
 * Two layers, one motion: the outer element translates/scales (origin top-left), and the inner
 * element flips (rotateY) and turns (rotateZ) around its own CENTRE — rotating the outer element
 * would pivot on the card's edge and swing it into the neighbouring slot.
 *
 * Chaining: a card that lands and then moves again (a Knight played, then sent below the Ship)
 * is two flyers. The first sets `vanishAt` to the second's start (it rests where it landed until
 * then) and the second sets `appear: false` (invisible until its own start), so exactly one copy
 * is ever visible.
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
  /** Resting rotation in degrees (pieces on a table lie slightly askew). */
  r?: number
}

export interface Flyer {
  key: string
  from: Rect
  to: Rect
  /** Rendered at the destination size. */
  node: ReactNode
  delay: number
  duration: number
  /** Rotate 180° around Y in flight (node must be a <FlipCard>). */
  flip?: boolean
  /** Lift height in px at mid-flight. */
  lift?: number
  /** Visible at its source while waiting for its delay (default true). */
  appear?: boolean
  /** When set, the flyer disappears at this time (ms) — when the same card's next flight starts. */
  vanishAt?: number
  /**
   * Stacking order among flyers (higher = in front). Cards on a space use their stack position, so
   * a newly played card always flies in ON TOP of the cards already there (and, when the set is
   * then collected, stays on top of them on the way out).
   */
  z?: number
}

/** Flyers sit above everything on the table; their own `z` orders them among themselves. */
export const FLYER_Z_BASE = 30
export const flyerZ = (f: Pick<Flyer, 'z'>) => FLYER_Z_BASE + (f.z ?? 20)

/** Gentle ease-out: quick to leave, soft to land. */
export const FLY_EASING = 'cubic-bezier(.22,.8,.3,1)'

/**
 * The flyer's on-screen box at progress t (0 = source, 0.5 = mid-flight, 1 = destination): a
 * straight line, raised by `lift` at mid-flight. Pure, so the path is unit-tested.
 */
export function flightBox(from: Rect, to: Rect, t: 0 | 0.5 | 1, lift = 0): Rect {
  const w = from.w + (to.w - from.w) * t
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t - (t === 0.5 ? lift : 0),
    w,
    h: w * (to.h / to.w),
  }
}

function place(r: Rect, to: Rect) {
  return `translate(${r.x}px, ${r.y}px) scale(${r.w / to.w})`
}

/** A two-faced card: `first` shows at 0°, `second` at 180°; each face absolutely positioned. */
export function FlipCard({ first, second, w, h }: { first: ReactNode; second: ReactNode; w: number; h: number }) {
  return (
    <div className="dh-flip" style={{ width: w, height: h }}>
      <div className="dh-face">{first}</div>
      <div className="dh-face dh-face-back">{second}</div>
    </div>
  )
}

const turn = (flipDeg: number, z: number) => `rotateZ(${z}deg) rotateY(${flipDeg}deg)`

export function FlyerView({ flyer, reduced }: { flyer: Flyer; reduced: boolean }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const { from, to, delay, duration, flip, lift = 0, appear = true, vanishAt } = flyer
    const endFlip = flip ? 180 : 0
    const r0 = from.r ?? 0
    const r1 = to.r ?? 0
    const anims: Animation[] = []
    if (reduced) {
      const opts: KeyframeAnimationOptions = { duration: 180, delay: Math.min(delay, 150), fill: 'both' }
      anims.push(o.animate([{ transform: place(to, to), opacity: 0 }, { transform: place(to, to), opacity: vanishAt == null ? 1 : 0 }], opts))
      anims.push(i.animate([{ transform: turn(endFlip, r1) }, { transform: turn(endFlip, r1) }], opts))
    } else {
      const opts: KeyframeAnimationOptions = { duration, delay, easing: FLY_EASING, fill: 'both' }
      anims.push(
        o.animate(
          [
            { transform: place(flightBox(from, to, 0), to), offset: 0 },
            { transform: place(flightBox(from, to, 0.5, lift), to), offset: 0.5 },
            { transform: place(flightBox(from, to, 1), to), offset: 1 },
          ],
          opts
        )
      )
      anims.push(i.animate([{ transform: turn(0, r0) }, { transform: turn(endFlip, r1) }], opts))
      // Visibility: hidden before the start when chained; hidden after landing when it moves on.
      const total = delay + duration
      const frames: Keyframe[] = [
        { opacity: appear ? 1 : 0, offset: 0 },
        { opacity: appear ? 1 : 0, offset: total ? delay / total : 0 },
        { opacity: 1, offset: total ? Math.min(1, (delay + 1) / total) : 0 },
        { opacity: 1, offset: 1 },
      ]
      anims.push(o.animate(frames, { duration: total || 1, fill: 'forwards' }))
      if (vanishAt != null) anims.push(o.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, delay: Math.max(total, vanishAt), fill: 'forwards' }))
    }
    return () => anims.forEach((a) => a.cancel())
  }, [flyer, reduced])
  return (
    <div
      ref={outer}
      className="dh-flyer"
      style={{
        width: flyer.to.w,
        height: flyer.to.h,
        transformOrigin: '0 0',
        transform: place(flyer.from, flyer.to),
        opacity: flyer.appear === false ? 0 : 1,
        perspective: 1600,
        zIndex: flyerZ(flyer),
      }}
    >
      <div ref={inner} style={{ width: '100%', height: '100%', transformOrigin: '50% 50%', transformStyle: 'preserve-3d' }}>
        {flyer.node}
      </div>
    </div>
  )
}
