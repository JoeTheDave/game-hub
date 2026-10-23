import type { CSSProperties, ReactNode } from 'react'
import { CARD_BY_ID, GEMS, NOBLE_BY_ID, type Gem, type GemCounts, type Tier, type Token } from '@games/splendor/data'
import { BACK_IMG, GEM_IMG, NOBLE_IMG, PARCHMENT_IMG, SCENE_IMG } from './assets'

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

/** A cost pip: coloured circle, white italic numeral, tiny gem glyph. */
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
        <span className="spl-numeral" style={{ fontSize: '1.5em', color: gem === 'white' ? '#f8fafc' : '#fff' }}>
          {n}
        </span>
      </div>
      <GemImg gem={gem} size="1.05em" style={{ position: 'absolute', right: '-0.55em', bottom: '0.05em' }} />
    </div>
  )
}

/** A face-up development card. */
export function Card({ id, size, dim, style }: { id: string; size: number; dim?: boolean; style?: CSSProperties }) {
  const card = CARD_BY_ID[id]
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
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.85 }}
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
        backgroundImage: `url(${NOBLE_IMG[noble.portrait]})`,
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
            <span className="spl-numeral" style={{ fontSize: '1.4em' }}>
              {n}
            </span>
            <GemImg gem={g} size="0.95em" style={{ position: 'absolute', right: '-0.4em', bottom: '-0.1em' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A single gem token: parchment disc, coloured rim, the gem. */
export function Token({ gem, size, style }: { gem: Token; size: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        fontSize: size / 10,
        borderRadius: '50%',
        border: `0.9em solid ${GEM_COLOR[gem]}`,
        boxShadow: `0 0.15em 0.3em rgba(0,0,0,.55), inset 0 0 0 0.15em rgba(0,0,0,.18), 0 0 0 0.08em rgba(0,0,0,.35)`,
        backgroundImage: `url(${PARCHMENT_IMG})`,
        backgroundSize: 'cover',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <GemImg gem={gem} size="5.4em" />
    </div>
  )
}

/** A pile of tokens: a short stack (height tracks count) with the count on top. */
export function TokenPile({ gem, count, size, showZero = true }: { gem: Token; count: number; size: number; showZero?: boolean }) {
  const layers = Math.min(count, 7)
  const step = size * 0.06
  return (
    <div style={{ position: 'relative', width: size, height: size + step * 6, opacity: count === 0 && showZero ? 0.35 : 1 }}>
      {Array.from({ length: Math.max(layers, 1) }, (_, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: 0, bottom: i * step, opacity: count === 0 ? 0.5 : 1 }}
        >
          {count === 0 ? (
            <div style={{ width: size, height: size, borderRadius: '50%', border: `2px dashed ${GEM_COLOR[gem]}` }} />
          ) : (
            <Token gem={gem} size={size} />
          )}
        </div>
      ))}
      <CountBadge n={count} style={{ position: 'absolute', right: -size * 0.12, top: -size * 0.05, fontSize: size * 0.26 }} />
    </div>
  )
}

export function CountBadge({ n, style }: { n: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        minWidth: '1.6em',
        height: '1.6em',
        padding: '0 0.35em',
        borderRadius: '0.8em',
        background: 'rgba(15,10,5,.85)',
        border: '0.08em solid rgba(253,230,138,.7)',
        color: '#fde68a',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        boxShadow: '0 0.08em 0.2em rgba(0,0,0,.5)',
        ...style,
      }}
    >
      {n}
    </span>
  )
}

/** Tableau column overlap: how much of each covered card shows (its top band). */
export const TABLEAU_PEEK = 0.27
