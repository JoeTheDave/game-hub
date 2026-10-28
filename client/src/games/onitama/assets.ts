/**
 * URLs for Onitama's art and sounds (see assets/README.md). The TV's pieces are procedural 3D
 * models; the phone's are drawn in code (ink-brush SVG). The original repo's art lives in
 * assets/repo (see cardStyle.ts).
 */
const urls = (glob: Record<string, string>) =>
  Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]))

export const KANJI_IMG = urls(import.meta.glob('./assets/kanji/*.webp', { eager: true, query: '?url', import: 'default' }))
export const SOUNDS = urls(import.meta.glob('./assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' }))

import STAMP_RED from './assets/stamp-red.webp'
import STAMP_BLUE from './assets/stamp-blue.webp'
import TEMPLE_RED from './assets/temple-red.webp'
import TEMPLE_BLUE from './assets/temple-blue.webp'
import PARCHMENT from './assets/parchment.webp'
import MAT from './assets/mat.webp'
import TABLE from './assets/table.webp'

export const STAMP_IMG = { red: STAMP_RED, blue: STAMP_BLUE } as const
export const TEMPLE_IMG = { red: TEMPLE_RED, blue: TEMPLE_BLUE } as const
export const PARCHMENT_IMG = PARCHMENT
export const MAT_IMG = MAT
export const TABLE_IMG = TABLE

import { REPO_IMG, REPO_SVG } from './cardStyle'

/**
 * Decode every card/board image up front and keep the decoded images alive, so freshly rendered
 * flight copies paint immediately (never an empty box). Idempotent.
 */
const decoded: HTMLImageElement[] = []
export function preloadImages(): Promise<void> {
  if (decoded.length || typeof Image === 'undefined') return Promise.resolve()
  const all = [...Object.values(KANJI_IMG), ...Object.values(REPO_SVG), ...Object.values(REPO_IMG), STAMP_RED, STAMP_BLUE, TEMPLE_RED, TEMPLE_BLUE, PARCHMENT, MAT]
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
