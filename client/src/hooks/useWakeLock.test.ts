import { describe, expect, it } from 'vitest'
import { startWakeLock } from './useWakeLock'

function fakes() {
  const listeners: Record<string, Set<() => void>> = {}
  const target = {
    addEventListener: (t: string, f: () => void) => (listeners[t] ??= new Set()).add(f),
    removeEventListener: (t: string, f: () => void) => listeners[t]?.delete(f),
  }
  const doc = { visibilityState: 'visible', ...target }
  const fire = (t: string) => listeners[t]?.forEach((f) => f())
  const sentinels: { released: boolean; release(): Promise<void>; addEventListener(t: 'release', f: () => void): void; drop(): void }[] = []
  const wakeLock = {
    request: async () => {
      let onRelease = () => {}
      const s = {
        released: false,
        release: async () => {
          s.released = true
          onRelease()
        },
        addEventListener: (_t: 'release', f: () => void) => {
          onRelease = f
        },
        // The browser dropping the lock when the page is hidden.
        drop: () => {
          s.released = true
          onRelease()
        },
      }
      sentinels.push(s)
      return s
    },
  }
  return { doc, win: target, wakeLock, fire, sentinels, listeners }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('startWakeLock', () => {
  it('acquires a screen wake lock when started on a visible page', async () => {
    const f = fakes()
    startWakeLock(f)
    await tick()
    expect(f.sentinels).toHaveLength(1)
    expect(f.sentinels[0].released).toBe(false)
  })

  it('re-acquires when the page becomes visible again after the browser dropped it', async () => {
    const f = fakes()
    startWakeLock(f)
    await tick()
    f.sentinels[0].drop()
    f.doc.visibilityState = 'hidden'
    f.fire('visibilitychange')
    await tick()
    expect(f.sentinels).toHaveLength(1) // not while hidden
    f.doc.visibilityState = 'visible'
    f.fire('visibilitychange')
    await tick()
    expect(f.sentinels).toHaveLength(2)
    expect(f.sentinels[1].released).toBe(false)
  })

  it('does not stack locks while one is held, and releases it on stop', async () => {
    const f = fakes()
    const stop = startWakeLock(f)
    await tick()
    f.fire('focus')
    await tick()
    expect(f.sentinels).toHaveLength(1)
    stop()
    expect(f.sentinels[0].released).toBe(true)
    expect(f.listeners.visibilitychange?.size ?? 0).toBe(0)
    expect(f.listeners.focus?.size ?? 0).toBe(0)
  })

  it('is a no-op where the Wake Lock API is unsupported', () => {
    const f = fakes()
    const stop = startWakeLock({ doc: f.doc, win: f.win })
    expect(() => stop()).not.toThrow()
  })
})
