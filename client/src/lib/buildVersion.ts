/**
 * Auto-reload after a deploy. Game pages stay open for hours (the TV especially), and a deploy
 * restarts the server, so their sockets reconnect. On reconnect, or when the tab comes back, they
 * ask the server which build it's serving, and reload once if it's newer than the one they're
 * running. Game state lives on the server, so a reload just resyncs. (Joe, 2026-11-10: a TV left
 * open across a deploy kept running old Klask physics.)
 */

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

/** sessionStorage key remembering the build we last reloaded for, so we never reload in a loop. */
export const RELOAD_GUARD_KEY = 'gamehub:reloadedFor'

/**
 * Pure decision: reload only when the server reports a real, different build that we haven't
 * already reloaded for. Development ('dev') never reloads.
 */
export function shouldReload(current: string, server: string | null | undefined, reloadedFor: string | null): boolean {
  if (!server || server === 'dev' || current === 'dev') return false
  if (server === current) return false
  return reloadedFor !== server
}

interface Env {
  fetchBuildId: () => Promise<string | null>
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null
  reload: () => void
}

/** Fetch the server's build id and reload once if it changed. Returns whether it reloaded. */
export async function checkForNewBuild(env: Env = browserEnv(), current = BUILD_ID): Promise<boolean> {
  let server: string | null = null
  try {
    server = await env.fetchBuildId()
  } catch {
    return false // offline or mid-restart: the next reconnect checks again
  }
  const guard = env.storage?.getItem(RELOAD_GUARD_KEY) ?? null
  if (!shouldReload(current, server, guard)) return false
  env.storage?.setItem(RELOAD_GUARD_KEY, server!)
  env.reload()
  return true
}

function browserEnv(): Env {
  return {
    fetchBuildId: async () => {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) return null
      const body = (await res.json()) as { buildId?: unknown }
      return typeof body.buildId === 'string' ? body.buildId : null
    },
    storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    reload: () => window.location.reload(),
  }
}
