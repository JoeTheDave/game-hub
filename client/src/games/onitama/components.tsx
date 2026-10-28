import type { CSSProperties } from 'react'
import { CARD_BY_ID, type Color } from '@games/onitama/data'
import { KANJI_IMG, PARCHMENT_IMG, STAMP_IMG, TEMPLE_IMG } from './assets'
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
 * A move card: parchment, the card's kanji calligraphy, its name in a brush font, the 5×5 move
 * diagram (centre = the moving piece, move squares in the card's stamp tint) drawn for the screen
 * direction its holder faces, the first-player hanko stamp, and a line of its quote.
 */
export function Card({ id, w, facing = 'up', style, quote = true }: { id: string; w: number; facing?: Facing; style?: CSSProperties; quote?: boolean }) {
  const def = CARD_BY_ID[id]
  const h = w * 1.4
  const grid = w * 0.6
  const cell = grid / 5
  const tint = def ? INK_SOFT[def.stamp] : 'rgba(0,0,0,.5)'
  const moves = new Set((def?.moves ?? []).map((m) => diagramCell(m, facing).join(',')))
  const showQuote = quote && w >= 150 && !!def
  return (
    <div
      className="oni-card"
      title={def?.name}
      data-card={id}
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: w * 0.06,
        overflow: 'hidden',
        backgroundColor: '#efe3c6',
        backgroundImage: `url(${PARCHMENT_IMG})`,
        backgroundSize: 'cover',
        boxShadow: `0 ${w * 0.02}px ${w * 0.06}px rgba(0,0,0,.5), inset 0 0 0 ${Math.max(1, w * 0.012)}px rgba(60,40,20,.45), inset 0 0 ${w * 0.08}px rgba(120,80,30,.25)`,
        color: '#2a1d12',
        ...style,
      }}
    >
      {def && (
        <img
          src={KANJI_IMG[id]}
          alt=""
          draggable={false}
          decoding="sync"
          style={{ position: 'absolute', left: '50%', top: h * 0.035, height: h * 0.24, width: 'auto', transform: 'translateX(-50%)', opacity: 0.88 }}
        />
      )}
      {def && (
        <img
          src={STAMP_IMG[def.stamp]}
          alt=""
          draggable={false}
          decoding="sync"
          title={`${def.stamp === 'red' ? 'Red' : 'Blue'} starts`}
          style={{ position: 'absolute', right: w * 0.05, top: w * 0.05, width: w * 0.2, height: w * 0.2, opacity: 0.9 }}
        />
      )}
      <div
        className="oni-brush"
        style={{ position: 'absolute', left: 0, right: 0, top: h * 0.285, textAlign: 'center', fontSize: w * 0.125, lineHeight: 1.1 }}
      >
        {def?.name ?? ''}
      </div>
      <svg
        data-diagram=""
        width={grid}
        height={grid}
        viewBox={`0 0 ${grid} ${grid}`}
        style={{ position: 'absolute', left: (w - grid) / 2, top: h * 0.4 }}
      >
        {Array.from({ length: 25 }, (_, i) => {
          const col = i % 5
          const row = Math.floor(i / 5)
          const centre = col === 2 && row === 2
          const move = moves.has(`${col},${row}`)
          return (
            <rect
              key={i}
              data-move={move ? '' : undefined}
              x={col * cell + 1}
              y={row * cell + 1}
              width={cell - 2}
              height={cell - 2}
              rx={cell * 0.12}
              fill={centre ? '#2a1d12' : move ? tint : 'rgba(255,255,255,.35)'}
              stroke="rgba(60,40,20,.35)"
              strokeWidth={0.8}
            />
          )
        })}
      </svg>
      {showQuote && (
        <div
          className="oni-serif"
          style={{
            position: 'absolute',
            left: w * 0.08,
            right: w * 0.08,
            bottom: h * 0.035,
            fontSize: w * 0.052,
            lineHeight: 1.2,
            fontStyle: 'italic',
            textAlign: 'center',
            opacity: 0.72,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {def!.text.replace(/\n/g, ' ')}
        </div>
      )}
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
