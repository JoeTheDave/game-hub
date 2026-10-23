import { describe, expect, it } from 'vitest'
import { shouldAdvance } from './tableQueue'

describe('shouldAdvance', () => {
  const animated = { seq: 5, events: [{ type: 'gemsTaken' }] }

  it('waits while there is nothing newer queued', () => {
    expect(shouldAdvance(animated, 1, 5)).toBe(false)
    expect(shouldAdvance(null, 0, -1)).toBe(false)
  })

  it('advances immediately past an update with no events', () => {
    expect(shouldAdvance({ seq: 2, events: [] }, 2, -1)).toBe(true)
  })

  it('advances immediately when the animation finished before the next update arrived', () => {
    expect(shouldAdvance(animated, 2, 5)).toBe(true)
  })

  it('keeps waiting while the current animation is still running', () => {
    expect(shouldAdvance(animated, 2, 4)).toBe(false)
  })
})
