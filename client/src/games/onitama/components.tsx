import type { CSSProperties } from 'react'
import { CARD_BY_ID, type Color } from '@games/onitama/data'
import { KANJI_IMG, TEMPLE_IMG } from './assets'
import { BAND_COLOR, MOVE_COLOR, REPO, REPO_IMG, REPO_SVG, STAMP_COLOR, alignmentOf } from './cardStyle'
import { diagramCell, type Facing, type SeriesSummary } from './logic'

/** Team inks, matched to the poster: lacquer red and indigo blue. */
export const INK: Record<Color, string> = { red: '#a3241c', blue: '#22457a' }
export const INK_SOFT: Record<Color, string> = { red: 'rgba(163,36,28,.78)', blue: 'rgba(34,69,122,.78)' }

export const SEAT_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#facc15',
  orange: '#f97316',
  purple: '#a855f7',
}
export const seatHex = (color: string | null | undefined) => (color && SEAT_HEX[color]) || '#e5e7eb'

/** Deterministic small jitter (rotation/offset) seeded by a key, so pieces lie naturally but never twitch. */
export function jitter(key: string, maxDeg: number, maxPx: number) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  const r = (n: number) => (((h >>> (n * 5)) & 1023) / 1023) * 2 - 1
  return { rot: r(0) * maxDeg, dx: r(1) * maxPx, dy: r(2) * maxPx }
}

/**
 * A move card in the original repo's design (Joe's github.com/JoeTheDave/onitama), stood upright
 * for the phone: card texture with a card-tan panel, the swish stroke and the card's animal art,
 * its NAME (IM Fell English SC), the 5×5 attack-pattern grid (white squares, dark centre, moves
 * in the card's alignment colour) drawn for the screen direction its holder faces, and the wisdom
 * band (alignment tint) with the quote and the first-player box. A faint kanji sits in the corner.
 * The TV paints the landscape version onto the 3D table (`cardArt.ts`).
 */
export function Card({ id, w, facing = 'up', style, quote = true }: { id: string; w: number; facing?: Facing; style?: CSSProperties; quote?: boolean }) {
  const def = CARD_BY_ID[id]
  const h = w * 1.4
  const align = alignmentOf(id)
  const pad = w * 0.035
  const inner = w - pad * 2
  const grid = w * 0.58
  const cell = grid / 5
  const moves = new Set((def?.moves ?? []).map((m) => diagramCell(m, facing).join(',')))
  const showQuote = quote && w >= 150 && !!def
  const bandH = h * (showQuote ? 0.2 : 0.11)
  const iconW = w * 0.16
  return (
    <div
      className="oni-card"
      title={def?.name}
      data-card={id}
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: w * 0.05,
        overflow: 'hidden',
        backgroundColor: '#d8d2b4',
        backgroundImage: `url(${REPO_IMG.cardTexture})`,
        backgroundSize: 'cover',
        boxShadow: `0 ${w * 0.02}px ${w * 0.06}px rgba(0,0,0,.5)`,
        border: `1px solid ${REPO.darkGray}`,
        boxSizing: 'border-box',
        color: REPO.darkGray,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: pad, borderRadius: w * 0.045, background: REPO.cardTan }} />
      {REPO_SVG.swish && (
        <img
          src={REPO_SVG.swish}
          alt=""
          draggable={false}
          decoding="sync"
          style={{ position: 'absolute', left: pad, top: pad, width: inner * 0.7, height: inner * 0.7, transform: 'rotate(-160deg)', pointerEvents: 'none' }}
        />
      )}
      {def && KANJI_IMG[id] && (
        <img
          src={KANJI_IMG[id]}
          alt=""
          draggable={false}
          decoding="sync"
          style={{ position: 'absolute', left: pad * 2, top: pad * 1.6, height: h * 0.085, width: 'auto', opacity: 0.45 }}
        />
      )}
      {def && REPO_SVG[id] && (
        <img
          src={REPO_SVG[id]}
          alt=""
          draggable={false}
          decoding="sync"
          style={{ position: 'absolute', left: pad, right: pad, top: h * 0.035, margin: '0 auto', height: h * 0.22, maxWidth: inner * 0.9, objectFit: 'contain' }}
        />
      )}
      <div
        className="oni-repo-name"
        style={{ position: 'absolute', left: 0, right: 0, top: h * 0.27, textAlign: 'center', fontSize: Math.min(w * 0.12, (inner * 1.6) / Math.max(4, (def?.name ?? '').length)), lineHeight: 1.1 }}
      >
        {(def?.name ?? '').toUpperCase()}
      </div>
      <svg
        data-diagram=""
        width={grid}
        height={grid}
        viewBox={`0 0 ${grid} ${grid}`}
        style={{ position: 'absolute', left: (w - grid) / 2, top: h * 0.375, borderRadius: cell * 0.27, overflow: 'hidden' }}
      >
        {Array.from({ length: 25 }, (_, i) => {
          const col = i % 5
          const row = Math.floor(i / 5)
          const centre = col === 2 && row === 2
          const move = moves.has(`${col},${row}`)
          const g = Math.max(0.6, cell * 0.035)
          return (
            <rect
              key={i}
              data-move={move ? '' : undefined}
              x={col * cell + g}
              y={row * cell + g}
              width={cell - g * 2}
              height={cell - g * 2}
              fill={centre ? REPO.darkGray : move ? MOVE_COLOR[align] : '#ffffff'}
            />
          )
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: pad * 2,
          right: pad * 2,
          bottom: pad * 2,
          height: bandH,
          borderRadius: w * 0.025,
          background: BAND_COLOR[align],
          display: 'flex',
          alignItems: 'center',
          gap: w * 0.03,
          padding: `0 ${w * 0.03}px`,
          boxSizing: 'border-box',
        }}
      >
        <div
          className="oni-repo-wisdom"
          style={{
            flex: 1,
            fontSize: w * 0.05,
            lineHeight: 1.2,
            textAlign: 'center',
            color: '#444',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {showQuote ? def!.text.replace(/\n/g, ' ') : ''}
        </div>
        {def && (
          <div
            data-stamp={def.stamp}
            title={`${def.stamp === 'red' ? 'Red' : 'Blue'} starts`}
            style={{
              width: iconW,
              height: iconW * 0.75,
              flexShrink: 0,
              background: STAMP_COLOR[def.stamp],
              border: `${Math.max(1, w * 0.01)}px solid ${REPO.opaqueWhite}`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {REPO_SVG['master-icon'] && <img src={REPO_SVG['master-icon']} alt="" draggable={false} decoding="sync" style={{ width: '82%', height: '82%' }} />}
          </div>
        )}
      </div>
    </div>
  )
}

/** A wobbly, uneven brush ring as one filled path (outer edge out, inner edge back). */
function brushRing(seed: string, cx: number, cy: number, r: number, width: number): string {
  const j = jitter(seed, 1, 1)
  const ph = (j.rot + 1) * Math.PI
  const n = 72
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const wob = 1 + 0.025 * Math.sin(3 * t + ph) + 0.015 * Math.sin(7 * t + ph * 2)
    // The stroke swells and thins like a brush, tapering where the stroke starts and ends.
    const taper = Math.min(1, Math.min(i, n - i) / 9)
    const sw = width * (0.55 + 0.45 * Math.abs(Math.sin(t * 1.5 + ph))) * (0.35 + 0.65 * taper)
    const ro = r * wob
    const ri = ro - sw
    outer.push(`${(cx + ro * Math.cos(t)).toFixed(2)},${(cy + ro * Math.sin(t)).toFixed(2)}`)
    inner.push(`${(cx + ri * Math.cos(t)).toFixed(2)},${(cy + ri * Math.sin(t)).toFixed(2)}`)
  }
  return `M${outer.join(' L')} L${inner.reverse().join(' L')} Z`
}

/**
 * A piece: a flat parchment disc with a hand-brushed ink ring in the team colour and a brushed
 * kanji (師 master, 弟 student). Drawn in code — no realistic 3D tokens (Joe's rule).
 */
export function Piece({ color, master, size, id = 'p', style }: { color: Color; master: boolean; size: number; id?: string; style?: CSSProperties }) {
  const ink = INK[color]
  return (
    <svg
      data-piece={id}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.45))', ...style }}
    >
      <defs>
        <radialGradient id={`oni-disc-${color}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fbf3df" />
          <stop offset="100%" stopColor="#e0cda2" />
        </radialGradient>
      </defs>
      <circle cx={50} cy={50} r={46} fill={`url(#oni-disc-${color})`} />
      <path d={brushRing(`${id}-ring`, 50, 50, 47, master ? 11 : 8)} fill={ink} />
      {master && <path d={brushRing(`${id}-inner`, 50, 50, 35, 2.6)} fill={ink} opacity={0.75} />}
      <text
        x={50}
        y={52}
        textAnchor="middle"
        dominantBaseline="central"
        className="oni-brush"
        fontSize={master ? 40 : 38}
        fill={ink}
      >
        {master ? '師' : '弟'}
      </text>
    </svg>
  )
}

/** The brushed shrine glyph marking a temple arch square. */
export function TempleMark({ color, size, style }: { color: Color; size: number; style?: CSSProperties }) {
  return <img src={TEMPLE_IMG[color]} alt="" draggable={false} decoding="sync" style={{ width: size, height: size, opacity: 0.5, ...style }} />
}

/** A small gold laurel for the series leader. */
export function Laurel({ size = 28, title = 'Series leader' }: { size?: number; title?: string }) {
  const leaves = [0, 1, 2, 3, 4]
  return (
    <svg data-laurel="" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title} style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>
      <title>{title}</title>
      <g fill="#c9971f" stroke="#7a5a12" strokeWidth={0.8}>
        {[-1, 1].map((side) => (
          <g key={side} transform={side < 0 ? undefined : 'translate(40 0) scale(-1 1)'}>
            <path d="M20 35 C 9 31, 5 21, 9 8" fill="none" stroke="#9a7317" strokeWidth={1.8} />
            {leaves.map((i) => {
              const t = i / 4
              const x = 20 - 11 * Math.sin(t * 1.9) - 2
              const y = 33 - t * 25
              return <ellipse key={i} cx={x - 2.5} cy={y} rx={4.2} ry={2} transform={`rotate(${-55 + t * 40} ${x - 2.5} ${y})`} />
            })}
          </g>
        ))}
        <circle cx={20} cy={34.5} r={2} fill="#a32020" stroke="#5c1010" />
      </g>
    </svg>
  )
}

const GOLD = '#a8780e'

/** Wins per game across rematches, plus a Total with a laurel on the leader (Dragonheart's table, in ink). */
export function SeriesTable({ series, players, variant }: { series: SeriesSummary; players: { seat: number; name: string; seatColor: string | null }[]; variant: 'tv' | 'phone' }) {
  const tv = variant === 'tv'
  const MAX_TV_GAMES = 10
  const all = series.games.map((g, i) => ({ label: `G${i + 1}`, scores: g.scores, winners: g.winners }))
  let cols = all
  if (tv && all.length > MAX_TV_GAMES) {
    const older = all.slice(0, all.length - MAX_TV_GAMES + 1)
    const sums: number[] = []
    for (const p of players) sums[p.seat] = older.reduce((sum, g) => sum + (g.scores[p.seat] ?? 0), 0)
    cols = [{ label: `G1–${older.length}`, scores: sums, winners: [] as number[] }, ...all.slice(older.length)]
  }
  const cell: CSSProperties = { padding: tv ? '6px 12px' : '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }
  const pin = (side: 'left' | 'right'): CSSProperties => (tv ? {} : { position: 'sticky', [side]: 0, zIndex: 1, background: '#efe3c6' })
  return (
    <div data-series="" style={{ marginTop: tv ? 22 : 4, color: '#2a1d12', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: tv ? '0 0 8px' : '0 0 4px' }}>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #7a5a3a)' }} />
        <span className="oni-brush" style={{ fontSize: tv ? 24 : 14 }}>
          Series · {series.games.length} games
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #7a5a3a, transparent)' }} />
      </div>
      <div style={{ overflowX: tv ? 'visible' : 'auto', borderRadius: 8, background: tv ? 'rgba(255,255,255,.3)' : '#efe3c6', boxShadow: 'inset 0 0 0 1px rgba(90,60,30,.35)' }}>
        <table className="oni-serif" style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: tv ? 24 : 15, width: tv ? '100%' : 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ fontSize: tv ? 17 : 11, color: '#6b4a26' }}>
              <th style={{ ...cell, ...pin('left'), textAlign: 'left' }} />
              {cols.map((c) => (
                <th key={c.label} style={cell}>
                  {c.label}
                </th>
              ))}
              <th style={{ ...cell, ...pin('right'), background: tv ? 'rgba(90,60,30,.14)' : '#e3d3ac', borderLeft: '1px solid rgba(90,60,30,.35)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const leads = series.leaders.length === 1 && series.leaders[0] === p.seat
              return (
                <tr key={p.seat}>
                  <td style={{ ...cell, ...pin('left'), textAlign: 'left' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: tv ? 10 : 6, maxWidth: tv ? 260 : 96 }}>
                      <span style={{ width: tv ? 14 : 9, height: tv ? 14 : 9, borderRadius: '50%', flexShrink: 0, background: seatHex(p.seatColor) }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    </span>
                  </td>
                  {cols.map((c) => {
                    const won = c.winners.includes(p.seat)
                    return (
                      <td key={c.label} data-game-won={won ? '' : undefined} style={{ ...cell, color: won ? GOLD : 'rgba(42,29,18,.7)', fontWeight: won ? 800 : 600 }}>
                        {c.scores[p.seat] ?? 0}
                      </td>
                    )
                  })}
                  <td data-total="" style={{ ...cell, ...pin('right'), fontSize: tv ? 30 : 18, fontWeight: 800, background: tv ? 'rgba(90,60,30,.14)' : '#e3d3ac', borderLeft: '1px solid rgba(90,60,30,.35)', color: leads ? GOLD : '#2a1d12' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {series.totals[p.seat] ?? 0}
                      {leads && <Laurel size={tv ? 30 : 18} />}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div data-series-line="" className="oni-serif" style={{ textAlign: 'center', fontStyle: 'italic', fontSize: tv ? 20 : 12, marginTop: tv ? 10 : 6, color: '#5a3a1c' }}>
        {series.line}
      </div>
    </div>
  )
}
