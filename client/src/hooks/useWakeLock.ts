import { useEffect } from 'react'

interface Sentinel {
  released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', fn: () => void): void
}
interface WakeLockEnv {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> }
  doc: { visibilityState: string; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void }
  win: { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void }
}

/**
 * Hold a screen wake lock while the page is visible: acquire now, re-acquire whenever the page
 * becomes visible again or regains focus (browsers drop the lock when hidden), and release it on
 * stop. Mirrors the on-screen project. Returns the stop function. Pure enough to unit-test with
 * fakes; unsupported browsers get a no-op.
 */
export function startWakeLock(env: WakeLockEnv): () => void {
  const wl = env.wakeLock
  if (!wl) return () => {}
  let sentinel: Sentinel | null = null
  let disposed = false
  // One request at a time: visibilitychange and focus often fire together, and two overlapping
  // requests would each get a lock, with only the last one ever released.
  let pending: Promise<void> | null = null
  const acquire = (): Promise<void> => {
    if (disposed || env.doc.visibilityState !== 'visible') return Promise.resolve()
    if (sentinel && !sentinel.released) return Promise.resolve()
    if (pending) return pending
    pending = (async () => {
      try {
        const s = await wl.request('screen')
        if (disposed) {
          void s.release()
          return
        }
        sentinel = s
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null
        })
      } catch {
        // Denied (e.g. battery saver) or not allowed right now: retried on the next visibility/focus.
      } finally {
        pending = null
      }
    })()
    return pending
  }
  const onVisible = () => {
    if (env.doc.visibilityState === 'visible') void acquire()
  }
  void acquire()
  env.doc.addEventListener('visibilitychange', onVisible)
  env.win.addEventListener('focus', onVisible)
  return () => {
    disposed = true
    env.doc.removeEventListener('visibilitychange', onVisible)
    env.win.removeEventListener('focus', onVisible)
    if (sentinel && !sentinel.released) void sentinel.release()
    sentinel = null
  }
}

/** Keep the screen (and so the computer) awake while a game screen is open and visible. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || typeof document === 'undefined') return
    const wakeLock = 'wakeLock' in navigator ? (navigator.wakeLock as unknown as WakeLockEnv['wakeLock']) : undefined
    return startWakeLock({ wakeLock, doc: document, win: window })
  }, [active])
}
