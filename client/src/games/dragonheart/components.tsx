import type { CSSProperties } from 'react'
import { CARD_BY_ID, KIND_NAMES, type DeckColor, type Kind } from '@games/dragonheart/data'
import { BACK_IMG, CARD_IMG, FRAME_IMG, TOKEN_IMG } from './assets'
import frameMeta from './assets/frame/frame.json'

/**
 * Composed Dragonheart components. A card face is the original game's artistic border (grey edge,
 * silver filigree, the silver dragon down the edges; derived from the scanned cards by
 * tools/dragonheart-art/make_frame.py) over the region of Joe's board inside that space's outline
 * (clipped by clip_cards.py). The point values sit in the frame's corner cartouches.
 * Components size themselves from `size` (card width, px) and lay out internals in em units
 * (1em = size / 10), so the same component renders on the TV and the phone at any size.
 */

/** Cards are exactly the board's outline shape (≈220×336 on the source board), everywhere. */
export const CARD_RATIO = 336 / 220
/** Rounded corners matching the frame's outer edge. */
const CARD_RADIUS = `${(frameMeta.cornerRadius * 10).toFixed(3)}em`

interface Frac {
  x: number
  y: number
  w: number
  h: number
}
const CARTOUCHES = frameMeta.cartouches as Record<'tl' | 'tr' | 'bl' | 'br', Frac>
const pct = (v: number) => `${(v * 100).toFixed(3)}%`

export const DECK_FIELD: Record<DeckColor, { base: string; light: string }> = {
  green: { base: '#1f5a2a', light: '#3f8a3c' },
  red: { base: '#6b1414', light: '#a32020' },
}

export const SEAT_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#facc15',
  orange: '#f97316',
  purple: '#a855f7',
}
export const seatHex = (color: string | null | undefined) => (color && SEAT_HEX[color]) || '#e5e7eb'

/** Deterministic small offsets so pieces lie slightly askew without twitching between renders. */
export function jitter(key: string, maxDeg: number, maxPx: number) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const r = (shift: number) => (((h >>> shift) & 0xff) / 255) * 2 - 1
  return { rot: r(0) * maxDeg, dx: r(8) * maxPx, dy: r(16) * maxPx }
}

/** The Ship's bow-and-sword glyph (it reminds players that Ships collect Knights and Huntresses). */
function BowAndSword({ size }: { size: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round">
      {/* bow */}
      <path d="M7 3 C 15 7, 15 17, 7 21" />
      <path d="M7 3 L 7 21" strokeWidth={0.9} />
      {/* sword */}
      <path d="M17 3 L 17 17" />
      <path d="M14 15 L 20 15" />
      <path d="M17 17 L 17 21" strokeWidth={2.4} />
    </svg>
  )
}

/** A point value woven into one of the frame's corner cartouches (Ship: the bow-and-sword glyph). */
function Cartouche({ points, kind, at }: { points: number; kind: Kind; at: 'tl' | 'tr' | 'bl' | 'br' }) {
  const c = CARTOUCHES[at]
  const flip = at === 'bl' || at === 'br'
  return (
    <div
      style={{
        position: 'absolute',
        left: pct(c.x),
        top: pct(c.y),
        width: pct(c.w),
        height: pct(c.h),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: flip ? 'rotate(180deg)' : undefined,
        zIndex: 3,
      }}
    >
      {kind === 'ship' ? (
        <BowAndSword size="1.45em" />
      ) : (
        <span className="dh-numeral dh-cartouche-numeral" style={{ fontSize: '1.42em' }}>
          {points}
        </span>
      )}
    </div>
  )
}

/** A face-up Dragonheart card: board-clipped art inside the original card's frame, values in the cartouches. */
/**
 * `height` defaults to the card shape; on the board pass the outline's exact height so the art
 * (the outline's own board region, stretched to fill) lines up pixel-for-pixel with the board.
 */
export function Card({ id, size, height, style }: { id: string; size: number; height?: number; style?: CSSProperties }) {
  const def = CARD_BY_ID[id]
  const kind = def?.kind ?? 'treasure'
  const pts = def?.points ?? 0
  return (
    <div
      className="dh-card"
      title={KIND_NAMES[kind]}
      style={{
        position: 'relative',
        width: size,
        height: height ?? size * CARD_RATIO,
        fontSize: size / 10,
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* The art is the board region of the outline itself, filling the whole card with no zoom or
          offset, so on its outline every point of the card shows the board pixel it covers. */}
      <img
        src={CARD_IMG[kind]}
        alt=""
        draggable={false}
        decoding="sync"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
      />
      <img src={FRAME_IMG} alt="" draggable={false} decoding="sync" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2 }} />
      <Cartouche points={pts} kind={kind} at="tl" />
      <Cartouche points={pts} kind={kind} at="tr" />
      <Cartouche points={pts} kind={kind} at="bl" />
      <Cartouche points={pts} kind={kind} at="br" />
    </div>
  )
}

/** A card back: the repainted green or red back art inside the grey border and silver frame. */
export function CardBack({ deck, size, height, style }: { deck: DeckColor; size: number; height?: number; style?: CSSProperties }) {
  return (
    <div
      className="dh-card"
      style={{
        position: 'relative',
        width: size,
        height: height ?? size * CARD_RATIO,
        fontSize: size / 10,
        borderRadius: CARD_RADIUS,
        background: 'linear-gradient(160deg, #d9d6d0, #bfbab2)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '0.32em',
          borderRadius: '0.28em',
          border: '0.1em solid #8e9399',
          overflow: 'hidden',
          background: DECK_FIELD[deck].base,
        }}
      >
        <img
          src={BACK_IMG[deck]}
          alt=""
          draggable={false}
          decoding="sync"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </div>
  )
}

/** The Great Dragon token: Joe's silver dragon-head coin, passed around the table. */
export function GreatDragon({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <img
      src={TOKEN_IMG}
      alt="The Great Dragon"
      draggable={false}
      width={size}
      height={size}
      style={{ display: 'block', width: size, height: size, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.55))', ...style }}
    />
  )
}

/** Silver card edges under a stack's top card: thickness hints at size, never a number. */
export function StackEdges({ count, size, face }: { count: number; size: number; face: 'up' | 'down' }) {
  const layers = Math.min(5, Math.ceil(count / (face === 'up' ? 3 : 6)))
  const w = size
  const h = size * CARD_RATIO
  return (
    <>
      {Array.from({ length: layers }, (_, i) => {
        const off = (layers - i) * 2.2
        // Visible region of a layer offset by `off` under the card: a thin L along its right and
        // bottom edges. Clipping to it means bare edges never show as a full gray card box.
        const clip = `polygon(${w - off}px 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 ${h - off}px, ${w - off}px ${h - off}px)`
        return (
          <div
            key={i}
            data-edge-layer=""
            style={{
              position: 'absolute',
              left: off,
              top: off,
              width: w,
              height: h,
              borderRadius: size * 0.06,
              background: 'linear-gradient(160deg, #cfcbc4, #a9a49b)',
              boxShadow: '0 1px 2px rgba(0,0,0,.45)',
              clipPath: clip,
            }}
          />
        )
      })}
    </>
  )
}

/** An empty card outline, as printed on the board (thin silver rounded rectangle with corner flourishes). */
export function Outline({ size, style }: { size: number; style?: CSSProperties }) {
  const h = size * CARD_RATIO
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ position: 'absolute', overflow: 'visible', ...style }}>
      <rect x={1.5} y={1.5} width={size - 3} height={h - 3} rx={size * 0.06} fill="rgba(255,255,255,.05)" stroke="#e5e7eb" strokeOpacity={0.75} strokeWidth={2} />
      {[
        [8, 8, 1, 1],
        [size - 8, 8, -1, 1],
        [8, h - 8, 1, -1],
        [size - 8, h - 8, -1, -1],
      ].map(([x, y, sx, sy], i) => (
        <path
          key={i}
          d={`M${x} ${y + sy * 12} q 0 ${-sy * 12} ${sx * 12} ${-sy * 12}`}
          stroke="#f3f4f6"
          strokeOpacity={0.8}
          strokeWidth={1.6}
          fill="none"
        />
      ))}
    </svg>
  )
}

export function kindOf(id: string): Kind {
  return CARD_BY_ID[id]?.kind ?? 'treasure'
}

export function deckOf(id: string): DeckColor {
  return CARD_BY_ID[id]?.deck ?? 'green'
}
