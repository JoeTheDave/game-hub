import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Flying-clone animation layer for the TV. Flyers live in the stage's design coordinates
 * (1920×1080) and are animated with the Web Animations API from a source rect to a dest rect.
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
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

function transform(r: Rect, to: Rect, rot: number, lift = 0) {
  const s = r.w / to.w
  return `translate(${r.x}px, ${r.y - lift}px) scale(${s}) perspective(1400px) rotateY(${rot}deg)`
}

export function FlyerView({ flyer, reduced }: { flyer: Flyer; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { from, to, delay, duration, flip, lift = 0 } = flyer
    const mid: Rect = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, w: (from.w + to.w) / 2, h: (from.h + to.h) / 2 }
    const anim = reduced
      ? el.animate(
          [
            { transform: transform(to, to, flip ? 180 : 0), opacity: 0 },
            { transform: transform(to, to, flip ? 180 : 0), opacity: 1 },
          ],
          { duration: 150, delay: Math.min(delay, 150), fill: 'both' }
        )
      : el.animate(
          [
            { transform: transform(from, to, 0), offset: 0 },
            { transform: transform(mid, to, flip ? 90 : 0, lift), offset: 0.5 },
            { transform: transform(to, to, flip ? 180 : 0), offset: 1 },
          ],
          { duration, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }
        )
    return () => anim.cancel()
  }, [flyer, reduced])
  return (
    <div
      ref={ref}
      className="spl-flyer"
      style={{ width: flyer.to.w, height: flyer.to.h, transformOrigin: '0 0', transform: transform(flyer.from, flyer.to, 0) }}
    >
      {flyer.node}
    </div>
  )
}
