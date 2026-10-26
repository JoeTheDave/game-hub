import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FlipCard, flightBox, type Rect } from './flyers'

const bottom = (r: Rect) => r.y + r.h

describe('flight path', () => {
  // A refill: deck at the left of a row, slot further along the same row.
  const deck: Rect = { x: 532, y: 148, w: 160, h: 223 }
  const slot: Rect = { x: 880, y: 148, w: 160, h: 223 }

  it('starts on the source and lands exactly on the destination', () => {
    expect(flightBox(deck, slot, 0)).toMatchObject({ x: deck.x, y: deck.y, w: deck.w })
    expect(flightBox(deck, slot, 1)).toMatchObject({ x: slot.x, y: slot.y, w: slot.w, h: slot.h })
  })

  it('never dips below the source or destination (a refill must not cover the row beneath)', () => {
    for (const lift of [0, 28, 90]) {
      const mid = flightBox(deck, slot, 0.5, lift)
      expect(bottom(mid)).toBeLessThanOrEqual(Math.max(bottom(deck), bottom(slot)))
      expect(mid.x).toBeGreaterThanOrEqual(Math.min(deck.x, slot.x))
      expect(mid.x + mid.w).toBeLessThanOrEqual(Math.max(deck.x + deck.w, slot.x + slot.w))
    }
  })

  it('keeps the destination aspect ratio when scaling between differently sized pieces', () => {
    const small: Rect = { x: 40, y: 600, w: 78, h: 109 }
    const mid = flightBox(slot, small, 0.5)
    expect(mid.h / mid.w).toBeCloseTo(small.h / small.w, 5)
  })
})

describe('FlipCard', () => {
  it('puts each face in its own absolutely-positioned box, so the faces overlap instead of stacking', () => {
    const face = (label: string) => createElement('div', { style: { position: 'relative', width: 10, height: 14 } }, label)
    const html = renderToString(createElement(FlipCard, { first: face('back'), second: face('front'), w: 10, h: 14 }))
    expect(html.match(/class="spl-face( spl-face-back)?"/g)).toEqual(['class="spl-face"', 'class="spl-face spl-face-back"'])
  })
})
