import { describe, expect, it } from 'vitest'
import { RELOAD_GUARD_KEY, checkForNewBuild, shouldReload } from './buildVersion'

describe('shouldReload', () => {
  it('reloads only for a real, different build not already reloaded for', () => {
    expect(shouldReload('a1', 'b2', null)).toBe(true)
    expect(shouldReload('a1', 'a1', null)).toBe(false)
    expect(shouldReload('a1', 'b2', 'b2')).toBe(false) // already reloaded once for b2: never loop
    expect(shouldReload('a1', null, null)).toBe(false)
    expect(shouldReload('dev', 'b2', null)).toBe(false)
    expect(shouldReload('a1', 'dev', null)).toBe(false)
  })
})

describe('checkForNewBuild', () => {
  function env(server: string | null | Error) {
    const store = new Map<string, string>()
    let reloads = 0
    return {
      e: {
        fetchBuildId: async () => {
          if (server instanceof Error) throw server
          return server
        },
        storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
        reload: () => void reloads++,
      },
      store,
      reloads: () => reloads,
    }
  }

  it('reloads once when a new build is live, and records the guard', async () => {
    const t = env('new')
    expect(await checkForNewBuild(t.e, 'old')).toBe(true)
    expect(t.reloads()).toBe(1)
    expect(t.store.get(RELOAD_GUARD_KEY)).toBe('new')
    // the reloaded page somehow still runs the old bundle (e.g. a stale cache): no loop
    expect(await checkForNewBuild(t.e, 'old')).toBe(false)
    expect(t.reloads()).toBe(1)
  })

  it('does nothing when nothing changed or the server is unreachable', async () => {
    const same = env('v1')
    expect(await checkForNewBuild(same.e, 'v1')).toBe(false)
    const down = env(new Error('offline'))
    expect(await checkForNewBuild(down.e, 'v1')).toBe(false)
    expect(same.reloads() + down.reloads()).toBe(0)
  })
})
