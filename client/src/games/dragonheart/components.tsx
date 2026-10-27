import type { CSSProperties } from 'react'
import { CARD_BY_ID, KIND_NAMES, type DeckColor, type Kind } from '@games/dragonheart/data'
import { BACK_IMG, CARD_IMG } from './assets'

/**
 * Composed Dragonheart components. A card face is the region of Joe's board inside that space's
 * front outline (frame included), clipped by tools/dragonheart-art/clip_cards.py, so a card on the
 * board looks exactly like the board beneath it; only the corner value squares are drawn in code.
 * Components size themselves from `size` (card width, px) and lay out internals in em units
 * (1em = size / 10), so the same component renders on the TV and the phone at any size.
 */

/** Cards are exactly the board's outline shape (≈220×336 on the source board), everywhere. */
export const CARD_RATIO = 336 / 220
/** Rounded corners matching the painted outline frame. */
const CARD_RADIUS = '0.42em'

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

function Corner({ points, kind, flip, pos }: { points: number; kind: Kind; flip?: boolean; pos: CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        width: '2.05em',
        height: '2.05em',
        background: 'linear-gradient(180deg, #3a3a3a, #1f1f1f)',
        border: '0.09em solid #cfd2d6',
        borderRadius: '0.18em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: flip ? 'rotate(180deg)' : undefined,
        boxShadow: '0 0.05em 0.12em rgba(0,0,0,.5)',
        zIndex: 2,
        ...pos,
      }}
    >
      {kind === 'ship' ? (
        <BowAndSword size="1.55em" />
      ) : (
        <span className="dh-numeral" style={{ fontSize: '1.45em' }}>
          {points}
        </span>
      )}
    </div>
  )
}

/** A face-up Dragonheart card: the clipped board art (frame included) plus corner value squares. */
export function Card({ id, size, style }: { id: string; size: number; style?: CSSProperties }) {
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
        height: size * CARD_RATIO,
        fontSize: size / 10,
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
        background: '#2a2622',
        ...style,
      }}
    >
      <img
        src={CARD_IMG[kind]}
        alt=""
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
      />
      <Corner points={pts} kind={kind} pos={{ left: '0.7em', top: '0.7em' }} />
      <Corner points={pts} kind={kind} pos={{ right: '0.7em', top: '0.7em' }} />
      <Corner points={pts} kind={kind} flip pos={{ left: '0.7em', bottom: '0.7em' }} />
      <Corner points={pts} kind={kind} flip pos={{ right: '0.7em', bottom: '0.7em' }} />
    </div>
  )
}

/** A card back: the repainted green or red back art inside the grey border and silver frame. */
export function CardBack({ deck, size, style }: { deck: DeckColor; size: number; style?: CSSProperties }) {
  return (
    <div
      className="dh-card"
      style={{
        position: 'relative',
        width: size,
        height: size * CARD_RATIO,
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </div>
  )
}

/**
 * The Great Dragon token: a flat painted medallion (gold rim, deep red enamel, a gold dragon
 * curled around the ruby Dragonheart), not a realistic figure, so it matches the board's art.
 */
export function GreatDragon({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="The Great Dragon"
      style={{ display: 'block', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.55))', ...style }}
    >
      <defs>
        <radialGradient id="dh-gd-rim" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.45" stopColor="#e2b23c" />
          <stop offset="1" stopColor="#8a5a12" />
        </radialGradient>
        <radialGradient id="dh-gd-enamel" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#b3221e" />
          <stop offset="0.7" stopColor="#7a1010" />
          <stop offset="1" stopColor="#4a0808" />
        </radialGradient>
        <linearGradient id="dh-gd-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a1" />
          <stop offset="0.5" stopColor="#d9a63a" />
          <stop offset="1" stopColor="#a8741c" />
        </linearGradient>
        <radialGradient id="dh-gd-ruby" cx="40%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ffd0d0" />
          <stop offset="0.35" stopColor="#ff3b3b" />
          <stop offset="1" stopColor="#7d0000" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#dh-gd-rim)" />
      <circle cx="60" cy="60" r="58" fill="none" stroke="#5c3a08" strokeWidth="2" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2
        return <circle key={i} cx={60 + Math.cos(a) * 52.5} cy={60 + Math.sin(a) * 52.5} r="1.6" fill="#fff4c4" opacity="0.8" />
      })}
      <circle cx="60" cy="60" r="47" fill="url(#dh-gd-enamel)" stroke="#5c3a08" strokeWidth="1.5" />
      {/* the dragon: a gold serpent curling around the heart, head at top-left, wing on the right */}
      <path
        d="M36 40 C 30 30, 44 22, 52 30 C 58 36, 54 44, 48 46 C 34 52, 30 72, 44 84 C 58 96, 82 90, 88 74 C 92 62, 84 52, 76 54"
        fill="none"
        stroke="url(#dh-gd-gold)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path d="M33 37 l-7 -3 l5 6 z M40 30 l-2 -8 l5 6 z" fill="url(#dh-gd-gold)" />
      <circle cx="44" cy="33" r="1.6" fill="#4a0808" />
      <path d="M78 34 C 88 26, 98 30, 100 40 C 94 38, 90 42, 92 48 C 86 44, 82 46, 80 52 C 78 46, 74 42, 78 34 Z" fill="url(#dh-gd-gold)" opacity="0.95" />
      {/* the Dragonheart */}
      <path d="M60 52 l11 11 l-11 15 l-11 -15 z" fill="url(#dh-gd-ruby)" stroke="#fde68a" strokeWidth="1.6" />
      <path d="M60 52 l-11 11 h22 z" fill="#ffffff" opacity="0.22" />
    </svg>
  )
}

/** Silver card edges under a stack's top card: thickness hints at size, never a number. */
export function StackEdges({ count, size, face }: { count: number; size: number; face: 'up' | 'down' }) {
  const layers = Math.min(5, Math.ceil(count / (face === 'up' ? 3 : 6)))
  return (
    <>
      {Array.from({ length: layers }, (_, i) => {
        const off = (layers - i) * 2.2
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: off,
              top: off,
              width: size,
              height: size * CARD_RATIO,
              borderRadius: size * 0.06,
              background: 'linear-gradient(160deg, #cfcbc4, #a9a49b)',
              boxShadow: '0 1px 2px rgba(0,0,0,.45)',
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
