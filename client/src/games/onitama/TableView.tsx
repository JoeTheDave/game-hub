import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TableViewProps } from '../types'
import type { OnitamaTableView, PublicPlayer } from '@games/onitama/engine'
import type { Color } from '@games/onitama/data'
import type { GameSummary } from '../../types/game'
import { Card, Piece, SeriesTable, TempleMark, jitter, seatHex, INK } from './components'
import { FlipCard, FlyerView, type Flyer, type Rect } from './flyers'
import { BOARD, CARD_W, H, NAME_Y, W, cellRect, contentLeft, glowRect, handRect, pieceRect, sideRect, trayRect, TRAY_PIECE } from './layout'
import { TV_FACING, seriesSummary, wayLine } from './logic'
import { MAT_IMG, TABLE_IMG, preloadImages } from './assets'
import './onitama.css'

function useStageScale() {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return scale
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Sounds play well below full level; the files themselves are already soft. */
const SOUND_GAIN = 0.5

/** The single uniform warm candlelight for the current turn (never the seat colour). */
export const TURN_LIGHT = 'rgba(255,196,112,0.5)'

const placed = (r: Rect, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
  transform: r.r ? `rotate(${r.r}deg)` : undefined,
  ...extra,
})

/** Hand cards lie slightly askew (deterministic, so they never twitch). */
export const tiltedHand = (color: Color, i: number): Rect => ({ ...handRect(color, i), r: jitter(`hand-${color}-${i}`, 1.8, 0).rot })
export const tiltedSide = (color: Color): Rect => ({ ...sideRect(color), r: jitter(`side-${color}`, 2.5, 0).rot })

const colorOf = (view: OnitamaTableView, seat: number): Color => view.players.find((p) => p.seat === seat)?.side ?? 'red'

// ——— The table ———
export function TableView({ instance, view, events, seq, onEventsDone, sound }: TableViewProps<OnitamaTableView>) {
  const scale = useStageScale()
  const prevViewRef = useRef<OnitamaTableView | null>(null)
  const lastSeqRef = useRef<number | null>(null)
  const [flyers, setFlyers] = useState<Flyer[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [glowTurn, setGlowTurn] = useState(view.turn)
  const [settled, setSettled] = useState(true)
  const reduced = useMemo(prefersReducedMotion, [])
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    void preloadImages()
  }, [])
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    []
  )

  // A new update: plan its flights from the previous view to this one (pure geometry).
  useLayoutEffect(() => {
    if (lastSeqRef.current === seq) return
    const firstRender = lastSeqRef.current === null
    lastSeqRef.current = seq
    const prev = prevViewRef.current
    prevViewRef.current = view
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    if (firstRender || events.length === 0 || !prev) {
      setFlyers([])
      setHidden([])
      setGlowTurn(view.turn)
      setSettled(true)
      onEventsDone()
      return
    }
    const plan = planAnimation(events, prev, view, reduced)
    for (const s of plan.sounds) sound.play(s.name, { delayMs: s.at, volume: (s.volume ?? 1) * SOUND_GAIN })
    setFlyers(plan.flyers)
    setHidden(plan.hidden)
    setSettled(false)
    const turn = view.turn
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setFlyers([])
      setHidden([])
      setGlowTurn(turn)
      setSettled(true)
      onEventsDone()
    }, plan.total + 60)
  })

  const hideCss = hidden.map((a) => `[data-anchor="${a}"]{visibility:hidden}`).join('')
  const sideColor = colorOf(view, view.sideFor)

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#140e09' }}>
      <div
        style={{
          position: 'absolute',
          width: W,
          height: H,
          left: (window.innerWidth - W * scale) / 2,
          top: (window.innerHeight - H * scale) / 2,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          backgroundImage: `url(${TABLE_IMG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          overflow: 'hidden',
        }}
      >
        <style>{hideCss}</style>
        {/* soft overhead light falling off toward the table's edges */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 48%, rgba(255,230,190,.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)', pointerEvents: 'none' }} />

        {/* The warm turn light, under the current player's zone */}
        {!view.finished &&
          view.players.map((p) => {
            const g = glowRect(p.side)
            const on = glowTurn === p.seat
            return (
              <div
                key={`glow-${p.seat}`}
                data-glow={on ? 'on' : 'off'}
                style={{
                  ...placed(g),
                  background: `radial-gradient(ellipse at 50% 45%, ${TURN_LIGHT} 0%, rgba(255,196,112,0.16) 45%, rgba(255,196,112,0) 72%)`,
                  mixBlendMode: 'screen',
                  opacity: on ? 1 : 0,
                  transition: 'opacity 700ms ease',
                  pointerEvents: 'none',
                }}
              />
            )
          })}

        <Board view={view} />

        {view.players.map((p) => (
          <PlayerZone key={p.seat} p={p} />
        ))}

        {/* The side card, beside the board in the zone of the player who takes it next */}
        <div data-anchor={`card-${view.side}`} style={placed(tiltedSide(sideColor), { zIndex: 3 })}>
          <Card id={view.side} w={CARD_W} facing={TV_FACING[sideColor]} />
        </div>

        {flyers.map((f) => (
          <FlyerView key={f.key} flyer={f} reduced={reduced} />
        ))}

        {view.finished && settled && view.result && <Standings view={view} history={instance?.history} />}
      </div>
    </div>
  )
}

function Board({ view }: { view: OnitamaTableView }) {
  const temples: [Color, readonly [number, number]][] = [
    ['red', view.temples.red],
    ['blue', view.temples.blue],
  ]
  return (
    <>
      {/* The ink-wash mat under the board */}
      <div
        style={{
          ...placed({ x: BOARD.x - 26, y: BOARD.y - 26, w: BOARD.w + 52, h: BOARD.h + 52 }),
          borderRadius: 10,
          backgroundImage: `url(${MAT_IMG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: '0 18px 40px rgba(0,0,0,.6), inset 0 0 0 2px rgba(60,40,20,.35)',
        }}
      />
      {/* An ink-brushed 5×5 grid */}
      <svg width={BOARD.w} height={BOARD.h} viewBox={`0 0 ${BOARD.w} ${BOARD.h}`} style={{ position: 'absolute', left: BOARD.x, top: BOARD.y }}>
        {Array.from({ length: 25 }, (_, i) => {
          const c = i % 5
          const r = Math.floor(i / 5)
          const s = BOARD.w / 5
          return <rect key={i} x={c * s + 4} y={r * s + 4} width={s - 8} height={s - 8} rx={8} fill="rgba(250,240,215,.38)" stroke="rgba(40,26,14,.72)" strokeWidth={3} />
        })}
      </svg>
      {temples.map(([color, sq]) => {
        const c = cellRect(sq)
        return <TempleMark key={color} color={color} size={c.w * 0.78} style={{ position: 'absolute', left: c.x + c.w * 0.11, top: c.y + c.w * 0.11 }} />
      })}
      {view.board.map((p) => {
        const r = pieceRect([p.x, p.y], p.master)
        return (
          <div key={p.id} data-anchor={`piece-${p.id}`} style={placed(r, { zIndex: 4 })}>
            <Piece id={p.id} color={p.color} master={p.master} size={r.w} />
          </div>
        )
      })}
    </>
  )
}

function PlayerZone({ p }: { p: PublicPlayer }) {
  return (
    <>
      <NameCard p={p} />
      {p.hand.map((id, i) => (
        <div key={id} data-anchor={`card-${id}`} style={placed(tiltedHand(p.side, i), { zIndex: 3 })}>
          <Card id={id} w={CARD_W} facing={TV_FACING[p.side]} />
        </div>
      ))}
      {p.captured.map((c, i) => {
        const r = trayRect(p.side, i)
        return (
          <div key={c.id} data-anchor={`cap-${c.id}`} style={placed(r, { zIndex: 3 })}>
            <Piece id={c.id} color={c.color} master={c.master} size={TRAY_PIECE} />
          </div>
        )
      })}
    </>
  )
}

/** A parchment tent card with the player's name, inked in their colour this game. */
function NameCard({ p }: { p: PublicPlayer }) {
  const j = jitter(`name-${p.side}`, 1.5, 2)
  return (
    <div
      className="oni-brush"
      style={{
        position: 'absolute',
        left: contentLeft(p.side) + j.dx,
        top: NAME_Y + j.dy,
        maxWidth: 2 * CARD_W + 28,
        padding: '6px 18px',
        borderRadius: 4,
        background: 'linear-gradient(180deg, #f6ecd4 0%, #e6d6b2 60%, #d6c29a 100%)',
        boxShadow: '0 3px 6px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6)',
        color: '#2a1d12',
        fontSize: 30,
        lineHeight: 1.15,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderLeft: `7px solid ${INK[p.side]}`,
        borderRight: `3px solid ${seatHex(p.seatColor)}`,
        transform: `rotate(${j.rot}deg)`,
      }}
    >
      {p.name}
    </div>
  )
}

/** The end-of-game headline (Joe: always "Final Score"). */
export const FINAL_HEADLINE = 'Final Score'

function Standings({ view, history }: { view: OnitamaTableView; history?: GameSummary[] }) {
  const r = view.result!
  const series = seriesSummary(history, view.players)
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,6,2,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div
        className="oni-pop"
        style={{
          minWidth: 720,
          padding: '34px 48px',
          borderRadius: 10,
          backgroundColor: '#f3e8cf',
          backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.5), rgba(255,255,255,0) 60%)',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          color: '#2a1d12',
        }}
      >
        <div className="oni-title" style={{ fontSize: 60, textAlign: 'center', lineHeight: 1.1 }}>
          Onitama
        </div>
        <div className="oni-brush" style={{ fontSize: 30, textAlign: 'center', margin: '4px 0 6px' }}>
          {FINAL_HEADLINE}
        </div>
        <div data-way="" className="oni-serif" style={{ fontSize: 22, textAlign: 'center', fontStyle: 'italic', marginBottom: 16, color: '#5a3a1c' }}>
          {wayLine(r.way)}
        </div>
        {view.players.map((p) => {
          const won = r.winners.includes(p.seat)
          return (
            <div key={p.seat} className="oni-brush" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, padding: '6px 0' }}>
              {/* The winner's crown has its own column, so every row's colour mark lines up. */}
              <span data-crown-cell="" style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                {won ? '👑' : ''}
              </span>
              <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: '50%', background: INK[p.side] }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span className="oni-serif" style={{ fontSize: 26, fontWeight: 700 }}>
                {won ? 'Victory' : r.way === 'draw' ? 'Draw' : ''}
              </span>
            </div>
          )
        })}
        {series && <SeriesTable series={series} players={view.players} variant="tv" />}
      </div>
    </div>
  )
}

// ——— Animation planning (pure: geometry comes from layout.ts) ———
type Sound = { name: string; at: number; volume?: number }
type Ev = { type: string; [k: string]: unknown }

const PIECE_FLY = 720
const CAPTURE_FLY = 700
const CARD_FLY = 780
const STAGGER_MS = 90
export const MAX_TURN_MS = 2500

export function planAnimation(events: Ev[], prev: OnitamaTableView, next: OnitamaTableView, reduced: boolean): { flyers: Flyer[]; hidden: string[]; sounds: Sound[]; total: number } {
  const flyers: Flyer[] = []
  const hidden: string[] = []
  const sounds: Sound[] = []
  let k = 0
  let end = 0
  const add = (f: Omit<Flyer, 'key'>) => {
    flyers.push({ ...f, key: `f${k++}` })
    end = Math.max(end, f.delay + f.duration)
  }
  let t = 0
  let moverLands = 0
  for (const e of events) {
    switch (e.type) {
      case 'pieceMoved': {
        const id = e.piece as string
        const from = e.from as [number, number]
        const to = e.to as [number, number]
        const piece = prev.board.find((p) => p.id === id)
        if (!piece) break
        const a = pieceRect(from, piece.master)
        const b = pieceRect(to, piece.master)
        add({ from: a, to: b, node: <Piece id={id} color={piece.color} master={piece.master} size={b.w} />, delay: t, duration: PIECE_FLY, lift: 46, z: 30 })
        hidden.push(`piece-${id}`)
        sounds.push({ name: 'slide', at: t, volume: 0.8 }, { name: 'wood-clack', at: t + PIECE_FLY - 70 })
        moverLands = t + PIECE_FLY
        break
      }
      case 'pieceCaptured': {
        const id = e.piece as string
        const by = e.by as number
        const victim = prev.board.find((p) => p.id === id)
        if (!victim) break
        const capturer = next.players.find((p) => p.seat === by)
        if (!capturer) break
        const idx = Math.max(0, capturer.captured.findIndex((c) => c.id === id))
        const from = pieceRect([victim.x, victim.y], victim.master)
        const to = trayRect(capturer.side, idx)
        // Knocked off just as the attacker arrives; it waits on its square until then.
        const start = Math.max(0, moverLands - 160)
        add({ from, to, node: <Piece id={id} color={victim.color} master={victim.master} size={to.w} />, delay: start, duration: CAPTURE_FLY, lift: 110, z: 20 })
        hidden.push(`cap-${id}`)
        sounds.push({ name: 'capture', at: start })
        break
      }
      case 'cardRotated': {
        // The used card slides to the side and turns to face the opponent (who takes it next).
        const seat = e.seat as number
        const id = e.card as string
        const mover = prev.players.find((p) => p.seat === seat)
        const receiver = next.players.find((p) => p.seat !== seat)
        if (!mover || !receiver) break
        const idx = Math.max(0, mover.hand.indexOf(id))
        t = Math.max(moverLands - 120, 0)
        const from = tiltedHand(mover.side, idx)
        const to = tiltedSide(receiver.side)
        add({
          from,
          to,
          node: <FlipCard w={to.w} h={to.h} first={<Card id={id} w={to.w} facing={TV_FACING[mover.side]} />} second={<Card id={id} w={to.w} facing={TV_FACING[receiver.side]} />} />,
          delay: t,
          duration: CARD_FLY,
          flip: true,
          lift: 40,
          z: 40,
        })
        hidden.push(`card-${id}`)
        sounds.push({ name: 'card-swish', at: t })
        break
      }
      case 'cardTaken': {
        // The old side card slides into the mover's hand where the used card was.
        const seat = e.seat as number
        const id = e.card as string
        const mover = next.players.find((p) => p.seat === seat)
        if (!mover) break
        const idx = Math.max(0, mover.hand.indexOf(id))
        const from = tiltedSide(mover.side)
        const to = tiltedHand(mover.side, idx)
        add({ from, to, node: <Card id={id} w={to.w} facing={TV_FACING[mover.side]} />, delay: t + STAGGER_MS, duration: CARD_FLY, lift: 30, z: 41 })
        hidden.push(`card-${id}`)
        sounds.push({ name: 'card-swish', at: t + STAGGER_MS, volume: 0.7 })
        break
      }
      case 'gameOver':
        sounds.push({ name: 'bell', at: Math.max(end - 100, 0) })
        break
      case 'turnChanged':
        sounds.push({ name: 'turn-tick', at: Math.max(end - 60, 0), volume: 0.6 })
        break
    }
  }
  if (reduced) return { flyers, hidden, sounds, total: Math.min(Math.max(end, 200), 400) }
  return { flyers, hidden, sounds, total: Math.min(Math.max(end, 150), MAX_TURN_MS) }
}
