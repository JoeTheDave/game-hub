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
  /** Rotate 180° around Y in flight (node must be a two-faced .spl-flip element). */
  flip?: boolean
  /** Lift height in px at mid-flight (an arc reads as "picked up"). */
  lift?: number
}

/** Gentle ease-out: quick to leave, soft to land. */
export const FLY_EASING = 'cubic-bezier(.22,.8,.3,1)'

function place(r: Rect, to: Rect, lift = 0) {
  const s = r.w / to.w
  return `translate(${r.x}px, ${r.y - lift}px) scale(${s})`
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
    const mid: Rect = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, w: (from.w + to.w) / 2, h: (from.h + to.h) / 2 }
    const opts: KeyframeAnimationOptions = { duration, delay, easing: FLY_EASING, fill: 'both' }
    const a = o.animate(
      [
        { transform: place(from, to), offset: 0 },
        { transform: place(mid, to, lift), offset: 0.5 },
        { transform: place(to, to), offset: 1 },
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
