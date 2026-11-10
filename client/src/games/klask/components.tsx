import type { CSSProperties } from 'react'
import type { SeriesSummary } from './logic'

/** Remaining lives as pips (filled = left). */
export function LivesPips({ lives, total, color, size = 12 }: { lives: number; total: number; color: string; size?: number }) {
  return (
    <span data-pips={lives} style={{ display: 'inline-flex', gap: size * 0.35 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: i < lives ? color : 'transparent',
            border: `2px solid ${color}`,
            opacity: i < lives ? 1 : 0.35,
            boxSizing: 'border-box',
          }}
        />
      ))}
    </span>
  )
}

/** Match wins across rematches: one column per match, a Total with a trophy for the leader. */
export function SeriesTable({
  series,
  players,
  variant,
}: {
  series: SeriesSummary
  players: { seat: number; name: string; hex: string }[]
  variant: 'tv' | 'phone'
}) {
  const tv = variant === 'tv'
  const shown = tv ? series.games.slice(-10) : series.games
  const offset = series.games.length - shown.length
  const cell: CSSProperties = { padding: tv ? '6px 12px' : '5px 8px', textAlign: 'center', whiteSpace: 'nowrap' }
  return (
    <div data-series="" className="kl-text" style={{ width: '100%', marginTop: tv ? 18 : 6 }}>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: tv ? 20 : 13, letterSpacing: '0.08em', opacity: 0.85, marginBottom: 6 }}>
        SERIES · {series.games.length} MATCHES
      </div>
      <div style={{ overflowX: tv ? 'visible' : 'auto', borderRadius: 10, background: 'rgba(255,255,255,.08)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: tv ? 22 : 14, width: tv ? '100%' : 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ opacity: 0.7, fontSize: tv ? 15 : 11 }}>
              <th style={{ ...cell, textAlign: 'left' }} />
              {shown.map((_, i) => (
                <th key={i} style={cell}>
                  M{i + 1 + offset}
                </th>
              ))}
              <th style={{ ...cell, background: 'rgba(255,255,255,.08)' }}>Wins</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const leads = series.leaders.length === 1 && series.leaders[0] === p.seat
              return (
                <tr key={p.seat}>
                  <td style={{ ...cell, textAlign: 'left' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: tv ? 14 : 10, height: tv ? 14 : 10, borderRadius: '50%', background: p.hex }} />
                      {p.name}
                    </span>
                  </td>
                  {shown.map((g, i) => (
                    <td key={i} data-match-won={g.winners.includes(p.seat) ? '' : undefined} style={{ ...cell, color: g.winners.includes(p.seat) ? '#fde047' : 'rgba(255,255,255,.35)', fontWeight: 800 }}>
                      {g.winners.includes(p.seat) ? '●' : '·'}
                    </td>
                  ))}
                  <td data-total="" style={{ ...cell, fontWeight: 800, fontSize: tv ? 28 : 17, background: 'rgba(255,255,255,.08)', color: leads ? '#fde047' : '#fff' }}>
                    {series.totals[p.seat] ?? 0}
                    {leads ? ' 🏆' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div data-series-line="" style={{ textAlign: 'center', fontStyle: 'italic', fontSize: tv ? 18 : 12, marginTop: 6, opacity: 0.85 }}>
        {series.line}
      </div>
    </div>
  )
}

/** The final standings rows (crown column left of the colour dot). */
export function Standings({
  rows,
  variant,
}: {
  rows: { seat: number; name: string; hex: string; winner: boolean; value: string; me?: boolean }[]
  variant: 'tv' | 'phone'
}) {
  const tv = variant === 'tv'
  return (
    <div className="kl-text" style={{ display: 'flex', flexDirection: 'column', gap: tv ? 10 : 6, width: '100%' }}>
      {rows.map((r) => (
        <div
          key={r.seat}
          data-standing={r.seat}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tv ? 14 : 10,
            padding: tv ? '10px 16px' : '8px 12px',
            borderRadius: 12,
            background: r.me ? 'rgba(253,224,71,.16)' : 'rgba(255,255,255,.06)',
            fontSize: tv ? 30 : 17,
            fontWeight: 800,
          }}
        >
          <span data-crown-col="" style={{ width: tv ? 40 : 24, textAlign: 'center', flexShrink: 0 }}>
            {r.winner ? '👑' : ''}
          </span>
          <span style={{ width: tv ? 18 : 12, height: tv ? 18 : 12, borderRadius: '50%', background: r.hex, flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  )
}
