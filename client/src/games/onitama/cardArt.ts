/**
 * Paints a move card onto a 2D canvas in the original repo's landscape design (400×260 there,
 * drawn here at 2× = 800×520) for use as a texture on the 3D table:
 * - card-texture border with a card-tan panel
 * - left: the swish brush stroke, the card's animal art and its NAME (IM Fell English SC)
 * - right: the 5×5 attack-pattern grid (white squares, dark centre, move squares in the
 *   alignment colour)
 * - bottom: a wisdom band in the alignment tint, with the quote (Caudex) and the first-player box
 *   (stamp colour) holding the master icon
 * The diagram is drawn upright for the card's holder (forward = up on the card).
 */
import { CARD_BY_ID } from '@games/onitama/data'
import { BAND_COLOR, MOVE_COLOR, REPO, REPO_IMG, REPO_SVG, STAMP_COLOR, alignmentOf } from './cardStyle'
import { KANJI_IMG } from './assets'

export const CARD_TEX_W = 800
export const CARD_TEX_H = 520
const S = 2

export const NAME_FONT = '"IM Fell English SC", Georgia, serif'
export const WISDOM_FONT = 'Caudex, Georgia, serif'

export interface CardArtImages {
  texture?: CanvasImageSource
  swish?: CanvasImageSource
  master?: CanvasImageSource
  animal?: CanvasImageSource
  kanji?: CanvasImageSource
}

/** Diagram cell (col,row) for a move [right, forward], upright for the holder. Pure. */
export const gridCell = ([dx, dy]: readonly [number, number]): [number, number] => [2 + dx, 2 - dy]

/** Word-wrap `text` into lines no wider than `maxW` (measured with `measure`). Pure. */
export function wrapLines(text: string, maxW: number, measure: (s: string) => number, maxLines = 3): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (measure(next) <= maxW || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last.length > 1 && measure(`${last}…`) > maxW) last = last.slice(0, -1)
    kept[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`
    return kept
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const sizeOf = (img: CanvasImageSource): { w: number; h: number } => {
  const anyImg = img as { naturalWidth?: number; naturalHeight?: number; width?: number | { baseVal?: { value: number } }; height?: number | { baseVal?: { value: number } } }
  const w = anyImg.naturalWidth || (typeof anyImg.width === 'number' ? anyImg.width : 1) || 1
  const h = anyImg.naturalHeight || (typeof anyImg.height === 'number' ? anyImg.height : 1) || 1
  return { w, h }
}

/** Paint card `id` into a CARD_TEX_W×CARD_TEX_H context. Missing images are simply skipped. */
export function paintCard(ctx: CanvasRenderingContext2D, id: string, img: CardArtImages) {
  const def = CARD_BY_ID[id]
  const W = CARD_TEX_W
  const H = CARD_TEX_H
  const align = alignmentOf(id)
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  roundRect(ctx, 0, 0, W, H, 10 * S)
  ctx.clip()
  // Card texture border, then the tan panel (repo: 10px padding, radius 10).
  ctx.fillStyle = '#d8d2b4'
  ctx.fillRect(0, 0, W, H)
  if (img.texture) ctx.drawImage(img.texture, 0, 0, W, H)
  roundRect(ctx, 10 * S, 10 * S, W - 20 * S, H - 20 * S, 10 * S)
  ctx.fillStyle = REPO.cardTan
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = REPO.darkGray
  ctx.lineWidth = 2
  roundRect(ctx, 1, 1, W - 2, H - 2, 10 * S)
  ctx.stroke()

  const cx = 20 * S // content origin (border 10 + padding 10)
  const cy = 20 * S
  const cw = W - 40 * S
  const ch = H - 40 * S
  const leftW = cw * 0.55

  // Swish (200×200, rotated −160°) behind the character.
  if (img.swish) {
    ctx.save()
    ctx.translate(cx + 100 * S, cy + 100 * S)
    ctx.rotate((-160 * Math.PI) / 180)
    ctx.drawImage(img.swish, -100 * S, -100 * S, 200 * S, 200 * S)
    ctx.restore()
  }
  // A faint kanji in the top-left corner (Joe's calligraphy).
  if (img.kanji) {
    const k = sizeOf(img.kanji)
    const kh = 46 * S
    ctx.globalAlpha = 0.45
    ctx.drawImage(img.kanji, cx, cy, (k.w / k.h) * kh, kh)
    ctx.globalAlpha = 1
  }
  // The animal (repo: 130px tall, centred, top 5).
  if (img.animal) {
    const a = sizeOf(img.animal)
    const ah = 130 * S
    const aw = Math.min(leftW, (a.w / a.h) * ah)
    const drawH = (aw / (a.w / a.h))
    ctx.drawImage(img.animal, cx + (leftW - aw) / 2, cy + 5 * S + (ah - drawH) / 2, aw, drawH)
  }
  // NAME (repo: 36px IM Fell English SC, bold, dark grey, top 120).
  ctx.fillStyle = REPO.darkGray
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let nameSize = 36 * S
  ctx.font = `bold ${nameSize}px ${NAME_FONT}`
  const name = (def?.name ?? id).toUpperCase()
  while (ctx.measureText(name).width > leftW - 8 * S && nameSize > 18 * S) {
    nameSize -= 2
    ctx.font = `bold ${nameSize}px ${NAME_FONT}`
  }
  ctx.fillText(name, cx + leftW / 2, cy + 120 * S + (36 * S - nameSize) / 2)

  // Attack-pattern grid (repo: 30px squares, 1px margin, radius 8), top-right of the content.
  const cell = 30 * S
  const gap = 1 * S
  const gridW = (cell + gap * 2) * 5
  const gx = cx + cw - gridW
  const gy = cy
  ctx.save()
  roundRect(ctx, gx, gy, gridW, gridW, 8 * S)
  ctx.clip()
  const moves = new Set((def?.moves ?? []).map((m) => gridCell(m).join(',')))
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const centre = row === 2 && col === 2
      ctx.fillStyle = centre ? REPO.darkGray : moves.has(`${col},${row}`) ? MOVE_COLOR[align] : '#ffffff'
      ctx.fillRect(gx + col * (cell + gap * 2) + gap, gy + row * (cell + gap * 2) + gap, cell, cell)
    }
  }
  ctx.restore()

  // Wisdom band (repo: 70px tall, radius 5, alignment tint) with the first-player box.
  const bandH = 70 * S
  const by = cy + ch - bandH
  roundRect(ctx, cx, by, cw, bandH, 5 * S)
  ctx.fillStyle = BAND_COLOR[align]
  ctx.fill()
  const boxW = 40 * S
  const boxH = 30 * S
  const boxX = cx + cw - boxW - 8 * S
  const boxY = by + (bandH - boxH) / 2
  if (def) {
    ctx.fillStyle = STAMP_COLOR[def.stamp]
    ctx.fillRect(boxX, boxY, boxW, boxH)
    ctx.strokeStyle = REPO.opaqueWhite
    ctx.lineWidth = 2 * S
    ctx.strokeRect(boxX, boxY, boxW, boxH)
    if (img.master) ctx.drawImage(img.master, boxX + 4 * S, boxY + 2 * S, boxW - 8 * S, boxH - 4 * S)
  }
  if (def) {
    ctx.fillStyle = '#444'
    ctx.font = `${12 * S}px ${WISDOM_FONT}`
    ctx.textBaseline = 'middle'
    const textW = cw - boxW - 30 * S
    const lines = wrapLines(def.text, textW, (s) => ctx.measureText(s).width, 3)
    const lh = 14 * S
    const midX = cx + 10 * S + textW / 2
    lines.forEach((l, i) => ctx.fillText(l, midX, by + bandH / 2 + (i - (lines.length - 1) / 2) * lh))
  }
}

// ——— Image loading (browser only) ———
const cache = new Map<string, Promise<HTMLImageElement | undefined>>()
function load(src: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!src || typeof Image === 'undefined') return Promise.resolve(undefined)
  let p = cache.get(src)
  if (!p) {
    p = new Promise((resolve) => {
      const im = new Image()
      im.decoding = 'async'
      im.onload = () => resolve(im)
      im.onerror = () => resolve(undefined)
      im.src = src
    })
    cache.set(src, p)
  }
  return p
}

/** Wait for the card fonts so the first texture paint isn't in a fallback face. */
export async function loadCardFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  await Promise.all([document.fonts.load(`bold 72px ${NAME_FONT}`), document.fonts.load(`24px ${WISDOM_FONT}`)]).catch(() => undefined)
}

/** Every image a card's texture needs. */
export async function loadCardImages(id: string): Promise<CardArtImages> {
  const [texture, swish, master, animal, kanji] = await Promise.all([
    load(REPO_IMG.cardTexture),
    load(REPO_SVG.swish),
    load(REPO_SVG['master-icon']),
    load(REPO_SVG[id]),
    load(KANJI_IMG[id]),
  ])
  return { texture, swish, master, animal, kanji }
}
