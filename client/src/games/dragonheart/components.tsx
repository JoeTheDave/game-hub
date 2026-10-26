import type { CSSProperties } from 'react'
import { CARD_BY_ID, KIND_NAMES, type DeckColor, type Kind } from '@games/dragonheart/data'
import { BACK_IMG, CARD_IMG, FIGURE_IMG } from './assets'

/**
 * Composed Dragonheart components. Card art is one generated illustration per kind; the frame,
 * corner squares, numerals and the dragon motif are drawn in code, so the same component renders
 * on the TV and the phone at any size. Components size themselves from `size` (card width, px)
 * and lay out their internals in em units (1em = size / 10).
 */

export const CARD_RATIO = 88 / 63

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

/** A silver serpentine dragon running down the card's right edge (the real cards' frame motif). */
function DragonEdge() {
  return (
    <svg
      viewBox="0 0 10 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', right: '0.05em', top: '1.4em', bottom: '1.4em', width: '0.9em', height: 'calc(100% - 2.8em)', zIndex: 1 }}
    >
      <defs>
        <linearGradient id="dh-silver" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d9298" />
          <stop offset="0.5" stopColor="#f3f4f6" />
          <stop offset="1" stopColor="#7c8188" />
        </linearGradient>
      </defs>
      <path d="M5 0 C 9 10, 1 18, 5 28 S 9 46, 5 56 S 1 74, 5 84 S 8 96, 5 100" stroke="url(#dh-silver)" strokeWidth="2.4" fill="none" />
      {[8, 22, 36, 50, 64, 78, 92].map((y) => (
        <path key={y} d={`M5 ${y} l 3 -2 M5 ${y} l -3 -2`} stroke="#c7cbd0" strokeWidth="0.9" />
      ))}
    </svg>
  )
}

/** A face-up Dragonheart card: grey border, silver filigree frame, painted art, corner values. */
export function Card({ id, size, style }: { id: string; size: number; style?: CSSProperties }) {
  const def = CARD_BY_ID[id]
  const kind = def?.kind ?? 'treasure'
  return (
    <div
      className="dh-card"
      title={KIND_NAMES[kind]}
      style={{
        position: 'relative',
        width: size,
        height: size * CARD_RATIO,
        fontSize: size / 10,
        borderRadius: '0.6em',
        background: 'linear-gradient(160deg, #d9d6d0, #bfbab2)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* silver filigree frame */}
      <div
        style={{
          position: 'absolute',
          inset: '0.42em',
          borderRadius: '0.3em',
          border: '0.14em solid #8e9399',
          boxShadow: 'inset 0 0 0 0.08em #eef0f2, 0 0 0 0.06em #5b5f64',
          background: '#2a2622',
          overflow: 'hidden',
        }}
      >
        <img
          src={CARD_IMG[kind]}
          alt=""
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <DragonEdge />
      <Corner points={def?.points ?? 0} kind={kind} pos={{ left: '0.62em', top: '0.62em' }} />
      <Corner points={def?.points ?? 0} kind={kind} pos={{ right: '0.62em', top: '0.62em' }} />
      <Corner points={def?.points ?? 0} kind={kind} flip pos={{ left: '0.62em', bottom: '0.62em' }} />
      <Corner points={def?.points ?? 0} kind={kind} flip pos={{ right: '0.62em', bottom: '0.62em' }} />
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
        borderRadius: '0.6em',
        background: 'linear-gradient(160deg, #d9d6d0, #bfbab2)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '0.42em',
          borderRadius: '0.3em',
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

/** The red plastic Great Dragon figure. */
export function GreatDragon({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <img
      src={FIGURE_IMG}
      alt="The Great Dragon"
      draggable={false}
      style={{ width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 0.4em 0.5em rgba(0,0,0,.55))', fontSize: size / 10, ...style }}
    />
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
