import GREEN_BACK from './assets/back/green.webp'
import RED_BACK from './assets/back/red.webp'

/** URLs for the generated art and synthesized sounds (see assets/README.md). */
const urls = (glob: Record<string, string>) =>
  Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]))

export const CARD_IMG = urls(import.meta.glob('./assets/cards/*.webp', { eager: true, query: '?url', import: 'default' }))
export const SOUNDS = urls(import.meta.glob('./assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' }))

/** The repainted card backs, one per deck colour. */
export const BACK_IMG = { green: GREEN_BACK, red: RED_BACK } as const

export { default as FRAME_IMG } from './assets/frame/frame.webp'
export { default as TOKEN_IMG } from './assets/token/great-dragon.webp'
export { default as BOARD_IMG } from './assets/board/panorama.webp'
export { default as TABLE_IMG } from './assets/table/surface.webp'

import FRAME_URL from './assets/frame/frame.webp'
import TOKEN_URL from './assets/token/great-dragon.webp'

/**
 * Decode every card, back, frame and token image up front and keep the decoded images alive.
 * Flights render brand-new copies of cards. If a copy's image weren't decoded yet, the TV would
 * paint the card's empty box (gray) for a few frames first, which was visible on slower TV
 * browsers. Idempotent.
 */
const decoded: HTMLImageElement[] = []
export function preloadImages(): Promise<void> {
  if (decoded.length || typeof Image === 'undefined') return Promise.resolve()
  const all = [...Object.values(CARD_IMG), BACK_IMG.green, BACK_IMG.red, FRAME_URL, TOKEN_URL]
  return Promise.all(
    all.map((src) => {
      const img = new Image()
      img.decoding = 'sync'
      img.src = src
      decoded.push(img)
      return img.decode ? img.decode().catch(() => {}) : Promise.resolve()
    })
  ).then(() => {})
}
