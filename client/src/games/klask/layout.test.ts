import { describe, expect, it } from 'vitest'
import { boardGeometry } from '@games/klask/physics'
import { boardView, hudAnchor } from './render'
import { FRAME_MM } from './render/common'

const extent = (n: number, w: number, h: number) => {
  const geo = boardGeometry(n)
  const v = boardView(geo, w, h)
  return { geo, v, hw: (geo.halfW + FRAME_MM) * v.scale, hh: (geo.halfH + FRAME_MM) * v.scale }
}

describe('klask TV layout: the board fills the screen', () => {
  it.each([3, 4])('%i players: the round table fills almost the full height of a 16:9 TV', (n) => {
    const { hh } = extent(n, 1920, 1080)
    expect(hh * 2).toBeGreaterThanOrEqual(1080 * 0.96)
    expect(hh * 2).toBeLessThanOrEqual(1080)
  })

  it('2 players: the table fills the height too', () => {
    const { hh, hw } = extent(2, 1920, 1080)
    expect(hh * 2).toBeGreaterThanOrEqual(1080 * 0.96)
    expect(hw * 2).toBeLessThan(1920)
  })

  it.each([2, 3, 4])('%i players: score tags sit in the side gutters, clear of the board, on 16:9', (n) => {
    const { geo, v, hw } = extent(n, 1920, 1080)
    const anchors = Array.from({ length: n }, (_, s) => hudAnchor(geo, s, v, 1920, 1080))
    for (const a of anchors) {
      expect(a.inside).toBe(false)
      expect(Math.abs(a.x - v.cx)).toBeGreaterThan(hw + 60) // outside the table, with room for the tag
      expect(a.y).toBeGreaterThanOrEqual(70)
      expect(a.y).toBeLessThanOrEqual(1010)
    }
    // tags don't stack on top of each other
    for (let i = 0; i < anchors.length; i++)
      for (let j = i + 1; j < anchors.length; j++)
        expect(Math.hypot(anchors[i].x - anchors[j].x, anchors[i].y - anchors[j].y)).toBeGreaterThan(120)
  })

  it('squarer screens fall back to tags inside the rim of each zone', () => {
    const { geo, v } = extent(4, 1024, 768)
    for (let s = 0; s < 4; s++) expect(hudAnchor(geo, s, v, 1024, 768).inside).toBe(true)
  })
})
