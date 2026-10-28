/**
 * Material factories, kept separate so their choices are unit-tested.
 *
 * Cards are UNLIT: a MeshBasicMaterial with tone mapping off renders the card art at its true
 * colour whatever the lights or turn glow do. Lit, tone-mapped cards were blown out by the key
 * light and the additive glow (Joe's screenshot, 2026-10-28: the near Crab card washed out).
 */
import * as THREE from 'three'

/** Draw order: board overlays, then the turn glow, then cards on top. */
export const RENDER_ORDER = { grid: 1, glow: 2, card: 10 } as const

export function makeCardMaterial(map: THREE.Texture | null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: true, alphaTest: 0.02 })
}

/** The warm turn glow: normal blending (additive turns a light board white), never over cards. */
export function makeGlowMaterial(map: THREE.Texture | null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, color: 0xffb04a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false })
}

/** Maximum opacity of the turn glow on the light board. */
export const GLOW_OPACITY = 0.42

/** A transparent floor that only shows the slab's soft shadow on the light paper behind the canvas. */
export function makeShadowCatcher(): THREE.ShadowMaterial {
  return new THREE.ShadowMaterial({ opacity: 0.22 })
}
