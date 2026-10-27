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
