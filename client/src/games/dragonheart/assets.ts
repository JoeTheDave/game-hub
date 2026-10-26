/** URLs for the generated art and synthesized sounds (see assets/README.md). */
const urls = (glob: Record<string, string>) =>
  Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]))

export const CARD_IMG = urls(import.meta.glob('./assets/cards/*.webp', { eager: true, query: '?url', import: 'default' }))
export const SOUNDS = urls(import.meta.glob('./assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' }))

export { default as BOARD_IMG } from './assets/board/panorama.webp'
export { default as BACK_DRAGON_IMG } from './assets/back/dragon.webp'
export { default as FIGURE_IMG } from './assets/figure/great-dragon.webp'
export { default as TABLE_IMG } from './assets/table/surface.webp'
