/** URLs for the generated art and synthesized sounds (see assets/README.md). */
const urls = (glob: Record<string, string>) =>
  Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]))

export const GEM_IMG = urls(import.meta.glob('./assets/gems/*.webp', { eager: true, query: '?url', import: 'default' }))
export const SCENE_IMG = urls(import.meta.glob('./assets/scenes/*.webp', { eager: true, query: '?url', import: 'default' }))
export const NOBLE_IMG = urls(import.meta.glob('./assets/nobles/*.webp', { eager: true, query: '?url', import: 'default' }))
export const SOUNDS = urls(import.meta.glob('./assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' }))

export { default as BACK_IMG } from './assets/backs/engraving.webp'
export { default as NOBLE_BACK_IMG } from './assets/backs/noble-engraving.webp'
export { default as PARCHMENT_IMG } from './assets/token/parchment.webp'
export { default as TABLE_IMG } from './assets/table/surface.webp'
