import type { CSSProperties, ReactNode } from 'react'
import { GEMS, NOBLE_BY_ID, type Gem, type GemCounts, type Tier, type Token } from '@games/splendor/data'
import { BACK_IMG, GEM_IMG, NOBLE_IMG, PARCHMENT_IMG, SCENE_IMG } from './assets'
import { useCardDef, useNoblePortrait } from './defs'

/**
 * Composed Splendor components. Every gem everywhere is the single image for that gem; cards,
 * tokens and nobles are assembled from shared art + CSS. Components size themselves from one
 * `size` prop (px) and lay out internals in em units, so the same component renders on the TV
 * and the phone at any scale.
 */

export const GEM_COLOR: Record<Token, string> = {
  white: '#f1f5f9',
  blue: '#1d4ed8',
  green: '#15803d',
  red: '#b91c1c',
  black: '#292524',
  gold: '#d97706',
}
export const GEM_NAME: Record<Token, string> = {
  white: 'Diamond',
  blue: 'Sapphire',
  green: 'Emerald',
  red: 'Ruby',
  black: 'Onyx',
  gold: 'Gold',
}
export const TIER_TINT: Record<Tier, string> = { 1: '#2f7d32', 2: '#b7791f', 3: '#1f6fae' }

export const SEAT_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#facc15',
  orange: '#f97316',
  purple: '#a855f7',
}
export const seatHex = (color: string | null | undefined) => (color && SEAT_HEX[color]) || '#e5e7eb'

export const CARD_RATIO = 88 / 63

export function GemImg({ gem, size, style }: { gem: Token; size: number | string; style?: CSSProperties }) {
  return (
    <img
      src={GEM_IMG[gem]}
      alt={GEM_NAME[gem]}
      draggable={false}
      style={{ width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 0.06em 0.08em rgba(0,0,0,.55))', ...style }}
    />
  )
}

/** Ordered cost entries, matching the real cards (white, blue, green, red, black). */
export const costEntries = (cost: GemCounts) => GEMS.filter((g) => (cost[g] ?? 0) > 0).map((g) => [g, cost[g]!] as const)

/** A cost pip: coloured circle with its number (no gem glyph; the colour says which gem). */
function CostPip({ gem, n }: { gem: Gem; n: number }) {
  return (
    <div style={{ position: 'relative', width: '2.2em', height: '2.2em' }}>
      <div
        style={{
          width: '2.2em',
          height: '2.2em',
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${GEM_COLOR[gem]}, ${GEM_COLOR[gem]} 60%, rgba(0,0,0,.35) 140%)`,
          border: '0.12em solid rgba(255,255,255,.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0.08em 0.2em rgba(0,0,0,.5)',
        }}
      >
        <span className="spl-numeral" style={{ fontSize: '1.35em' }}>
          {n}
        </span>
      </div>
    </div>
  )
}

/** A face-up development card. */
export function Card({ id, size, dim, style }: { id: string; size: number; dim?: boolean; style?: CSSProperties }) {
  const card = useCardDef(id)
  if (!card) return null
  return (
    <div
      className="spl-card"
      style={{
        position: 'relative',
        width: size,
        height: size * CARD_RATIO,
        fontSize: size / 10,
        borderRadius: '0.7em',
        overflow: 'hidden',
        backgroundImage: `url(${SCENE_IMG[card.scene]})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#444',
        opacity: dim ? 0.55 : 1,
        ...style,
      }}
    >
      {/* translucent top band: points + bonus gem */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '2.6em',
          background: 'linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55))',
          borderBottom: '0.05em solid rgba(255,255,255,.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0.45em 0 0.55em',
        }}
      >
        <span className="spl-numeral" style={{ fontSize: '2.3em' }}>
          {card.points > 0 ? card.points : ''}
        </span>
        <GemImg gem={card.bonus} size="2.2em" />
      </div>
      {/* cost pips, bottom-left */}
      <div style={{ position: 'absolute', left: '0.45em', bottom: '0.45em', display: 'flex', flexDirection: 'column', gap: '0.25em' }}>
        {costEntries(card.cost).map(([g, n]) => (
          <CostPip key={g} gem={g} n={n} />
        ))}
      </div>
    </div>
  )
}

/** Face-down card: the engraving tinted per tier, gold title, tier dots. */
export function CardBack({ tier, size, style, children }: { tier: Tier; size: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      className="spl-card"
      style={{
        position: 'relative',
        width: size,
        height: size * CARD_RATIO,
        fontSize: size / 10,
        borderRadius: '0.7em',
        overflow: 'hidden',
        background: TIER_TINT[tier],
        border: '0.35em solid #f5f0e6',
        ...style,
      }}
    >
      <img
        src={BACK_IMG}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          mixBlendMode: 'multiply',
          opacity: 0.85,
          // Soften only the engraving (the title stays crisp); the slight scale hides the blur's soft edge.
          filter: `blur(${Math.max(0.6, size * 0.009)}px)`,
          transform: 'scale(1.06)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: TIER_TINT[tier], mixBlendMode: 'color', opacity: 0.9 }} />
      <div
        className="spl-title"
        style={{ position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', fontSize: '1.45em' }}
      >
        Splendor
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '0.7em', display: 'flex', justifyContent: 'center', gap: '0.35em' }}>
        {Array.from({ length: tier }, (_, i) => (
          <span key={i} style={{ width: '0.75em', height: '0.75em', borderRadius: '50%', background: '#fff' }} />
        ))}
      </div>
      {children}
    </div>
  )
}

/** A noble tile: portrait, pale left strip with "3" and requirement chips. */
export function NobleTile({ id, size, style }: { id: string; size: number; style?: CSSProperties }) {
  const noble = NOBLE_BY_ID[id]
  // The portrait paired with this noble for this game (from a pool of 42).
  const portrait = useNoblePortrait(id) ?? noble?.portrait
  if (!noble) return null
  return (
    <div
      className="spl-card"
      style={{
        position: 'relative',
        width: size,
        height: size,
        fontSize: size / 10,
        borderRadius: '0.6em',
        overflow: 'hidden',
        backgroundImage: `url(${NOBLE_IMG[portrait ?? noble.portrait] ?? NOBLE_IMG[noble.portrait]})`,
        backgroundSize: 'cover',
        backgroundPosition: '65% 20%',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '3.1em',
          background: 'linear-gradient(90deg, rgba(245,240,230,.95), rgba(235,228,214,.85))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0.3em 0',
          gap: '0.3em',
        }}
      >
        <span className="spl-numeral" style={{ fontSize: '2.2em' }}>
          {noble.points}
        </span>
        {costEntries(noble.requires).map(([g, n]) => (
          <div
            key={g}
            style={{
              position: 'relative',
              width: '2.2em',
              height: '2em',
              borderRadius: '0.35em',
              background: GEM_COLOR[g],
              border: '0.1em solid rgba(255,255,255,.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0.06em 0.15em rgba(0,0,0,.45)',
            }}
          >
            <span className="spl-numeral" style={{ fontSize: '1.3em' }}>
              {n}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A single gem token: a coloured rim around a soft, barely-textured disc, with the gem filling it. */
export function Token({ gem, size, style }: { gem: Token; size: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        fontSize: size / 10,
        borderRadius: '50%',
        border: `0.55em solid ${GEM_COLOR[gem]}`,
        boxShadow: `0 0.12em 0.28em rgba(0,0,0,.5), inset 0 0 0 0.1em rgba(0,0,0,.15), 0 0 0 0.06em rgba(0,0,0,.3)`,
        background: 'radial-gradient(circle at 40% 35%, #f3ede3 0%, #ebe4d8 75%, #e2d9ca 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* parchment texture, kept very faint so the gem dominates */}
      <img
        src={PARCHMENT_IMG}
        alt=""
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.1, filter: 'blur(2px)' }}
      />
      {/* inner disc is 8.9em across; gem images are normalised to a 95% circle, so 7.56em ≈ 81% fill */}
      <GemImg gem={gem} size="7.56em" style={{ position: 'relative' }} />
    </div>
  )
}

/** Count numerals on token stacks, as a fraction of the chip size (big enough to read from the couch). */
export const TOKEN_COUNT_SCALE = 0.42

/**
 * A physical pile of tokens: chips stacked with a slight natural wobble, height tracking the
 * count. The box is one chip (the base), so animations land on the pile itself; the stack rises
 * above it. An empty pile shows nothing unless `ghost` (a faint ring marks the bank spot).
 */
export function TokenPile({
  gem,
  count,
  size,
  ghost = true,
  label = true,
}: {
  gem: Token
  count: number
  size: number
  ghost?: boolean
  label?: boolean
}) {
  const layers = Math.min(count, 7)
  const step = size * 0.07
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {count === 0 && ghost && (
        <div style={{ position: 'absolute', inset: size * 0.06, borderRadius: '50%', border: `2px solid ${GEM_COLOR[gem]}`, opacity: 0.25 }} />
      )}
      {Array.from({ length: layers }, (_, i) => {
        const j = jitter(`${gem}-${i}`, 1, size * 0.03)
        return (
          <div key={i} style={{ position: 'absolute', left: j.dx, top: -i * step + j.dy }}>
            <Token gem={gem} size={size} />
          </div>
        )
      })}
      {label && count > 0 && (
        <CountBadge
          n={count}
          style={{
            position: 'absolute',
            left: '50%',
            top: -layers * step - size * TOKEN_COUNT_SCALE * 1.3,
            transform: 'translateX(-50%)',
            fontSize: size * TOKEN_COUNT_SCALE,
          }}
        />
      )}
    </div>
  )
}

/** A small, soft count marker (no hard border) so numbers read without looking like UI chrome. */
export function CountBadge({ n, style }: { n: number; style?: CSSProperties }) {
  return (
    <span
      className="spl-serif"
      style={{
        minWidth: '1.5em',
        height: '1.5em',
        padding: '0 0.3em',
        borderRadius: '0.75em',
        background: 'rgba(20,12,6,.55)',
        color: '#fbecc4',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        boxShadow: '0 0.05em 0.15em rgba(0,0,0,.35)',
        ...style,
      }}
    >
      {n}
    </span>
  )
}

/**
 * Deterministic "lying on a table" imperfection: a small rotation (±maxDeg) and offset (±maxPx)
 * derived from a stable key, so pieces never jitter between renders.
 */
export function jitter(key: string, maxDeg: number, maxPx: number) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const r = (shift: number) => (((h >>> shift) & 0xff) / 255) * 2 - 1
  return { rot: r(0) * maxDeg, dx: r(8) * maxPx, dy: r(16) * maxPx }
}

/** Tableau column overlap: how much of each covered card shows (its top band). */
export const TABLEAU_PEEK = 0.27
