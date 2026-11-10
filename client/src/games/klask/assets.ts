import WOOD_URL from './assets/wood.webp'
import PLAYFIELD_URL from './assets/playfield.webp'
import FELT_URL from './assets/felt-noise.webp'

/** URLs for the generated table textures and synthesized sounds (see assets/README.md). */
const urls = (glob: Record<string, string>) =>
  Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]))

export const SOUNDS = urls(import.meta.glob('./assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' }))
export { WOOD_URL, PLAYFIELD_URL, FELT_URL }

/** Decoded texture images for the canvas renderers (null until loaded). Idempotent. */
export const TEXTURES: { wood: HTMLImageElement | null; playfield: HTMLImageElement | null; felt: HTMLImageElement | null } = {
  wood: null,
  playfield: null,
  felt: null,
}
let started = false
export function preloadImages(): Promise<void> {
  if (started || typeof Image === 'undefined') return Promise.resolve()
  started = true
  const load = (src: string, key: keyof typeof TEXTURES) => {
    const img = new Image()
    img.decoding = 'sync'
    img.src = src
    return (img.decode ? img.decode() : Promise.resolve())
      .then(() => {
        TEXTURES[key] = img
      })
      .catch(() => {})
  }
  return Promise.all([load(WOOD_URL, 'wood'), load(PLAYFIELD_URL, 'playfield'), load(FELT_URL, 'felt')]).then(() => {})
}
