import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Flying-clone animation layer for the TV. Flyers live in the stage's design coordinates
 * (1920×1080) and are animated with the Web Animations API from a source rect to a dest rect.
 *
 * Two layers, one motion: the outer element translates/scales (origin top-left, so the rect maths
 * stays simple), and the inner element flips (rotateY) and turns (rotateZ) around its own CENTRE.
 * Rotating the outer element instead would pivot on the card's left edge and swing the card into
 * the neighbouring slot — the bug this structure exists to prevent.
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
  /** The piece's resting rotation in degrees (pieces on a table lie slightly askew). */
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
  /** Lift height in px at mid-flight (an arc reads as "picked up"). */
  lift?: number
}

/** Gentle ease-out: quick to leave, soft to land. */
export const FLY_EASING = 'cubic-bezier(.22,.8,.3,1)'

/**
 * The flyer's on-screen box at progress `t` (0 = source, 0.5 = mid-flight peak, 1 = destination):
 * a straight-line interpolation, raised by `lift` at mid-flight. Pure, so the path is testable.
 */
export function flightBox(from: Rect, to: Rect, t: 0 | 0.5 | 1, lift = 0): Rect {
  const k = t
  const w = from.w + (to.w - from.w) * k
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k - (t === 0.5 ? lift : 0),
    w,
    // The flyer is drawn at the destination size and scaled uniformly, so its height follows w.
    h: w * (to.h / to.w),
  }
}

function place(r: Rect, to: Rect) {
  const s = r.w / to.w
  return `translate(${r.x}px, ${r.y}px) scale(${s})`
}

/**
 * A two-faced card for flights: `first` shows at 0°, `second` at 180°. Each face sits in its own
 * absolutely-positioned box, because Card/CardBack set an inline `position: relative`. That used
 * to override a `.spl-flip > *` rule, so the faces stacked in normal flow and the second face
 * flew one card-height BELOW its slot (and earlier, beside it).
 */
export function FlipCard({ first, second, w, h }: { first: ReactNode; second: ReactNode; w: number; h: number }) {
  return (
    <div className="spl-flip" style={{ width: w, height: h }}>
      <div className="spl-face">{first}</div>
      <div className="spl-face spl-face-back">{second}</div>
    </div>
  )
}

function turn(flipDeg: number, z: number) {
  return `rotateZ(${z}deg) rotateY(${flipDeg}deg)`
}

export function FlyerView({ flyer, reduced }: { flyer: Flyer; reduced: boolean }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const { from, to, delay, duration, flip, lift = 0 } = flyer
    const endFlip = flip ? 180 : 0
    const r0 = from.r ?? 0
    const r1 = to.r ?? 0
    if (reduced) {
      const opts: KeyframeAnimationOptions = { duration: 180, delay: Math.min(delay, 150), fill: 'both' }
      const a = o.animate([{ transform: place(to, to), opacity: 0 }, { transform: place(to, to), opacity: 1 }], opts)
      const b = i.animate([{ transform: turn(endFlip, r1) }, { transform: turn(endFlip, r1) }], opts)
      return () => {
        a.cancel()
        b.cancel()
      }
    }
    const opts: KeyframeAnimationOptions = { duration, delay, easing: FLY_EASING, fill: 'both' }
    const a = o.animate(
      [
        { transform: place(flightBox(from, to, 0), to), offset: 0 },
        { transform: place(flightBox(from, to, 0.5, lift), to), offset: 0.5 },
        { transform: place(flightBox(from, to, 1), to), offset: 1 },
      ],
      opts
    )
    const b = i.animate([{ transform: turn(0, r0) }, { transform: turn(endFlip, r1) }], opts)
    return () => {
      a.cancel()
      b.cancel()
    }
  }, [flyer, reduced])
  return (
    <div
      ref={outer}
      className="spl-flyer"
      style={{ width: flyer.to.w, height: flyer.to.h, transformOrigin: '0 0', transform: place(flyer.from, flyer.to), perspective: 1600 }}
    >
      <div ref={inner} style={{ width: '100%', height: '100%', transformOrigin: '50% 50%', transformStyle: 'preserve-3d' }}>
        {flyer.node}
      </div>
    </div>
  )
}
