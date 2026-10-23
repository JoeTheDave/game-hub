import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TableViewProps } from '../types'
import type { PublicPlayer, SplendorTableView } from '@games/splendor/engine'
import { GEMS, TOKENS, type Gem, type Tier, type Token as TokenKind } from '@games/splendor/data'
import { CARD_BY_ID } from '@games/splendor/data'
import {
  CARD_RATIO,
  Card,
  CardBack,
  CountBadge,
  GemImg,
  NobleTile,
  TABLEAU_PEEK,
  Token,
  TokenPile,
  seatHex,
} from './components'
import { FlyerView, type Flyer, type Rect } from './flyers'
import { TABLE_IMG } from './assets'
import './splendor.css'

// ——— Design canvas (scaled to fit any TV) ———
const W = 1920
const H = 1080
const BOARD_CARD = 118
const NOBLE = 100
const PILE = 70
const MINI = 78
const RES = 52
const PTOKEN = 44

type Area = { x: number; y: number; w: number; h: number }
function areasFor(n: number): Area[] {
  const L = 20
  const R = W - 20 - 530
  if (n <= 2) return [
    { x: L, y: 20, w: 530, h: H - 40 },
    { x: R, y: 20, w: 530, h: H - 40 },
  ]
  const top = { y: 20, h: 510 }
  const bot = { y: 550, h: 510 }
  const all = [
    { x: L, ...top },
    { x: R, ...top },
    { x: R, ...bot },
    { x: L, ...bot },
  ]
  return all.slice(0, n).map((a) => ({ ...a, w: 530 }))
}

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

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ——— The table ———
export function TableView({ view, events, seq, onEventsDone, sound }: TableViewProps<SplendorTableView>) {
  const scale = useStageScale()
  const stageRef = useRef<HTMLDivElement>(null)
  const rectsRef = useRef<Map<string, Rect>>(new Map())
  const prevViewRef = useRef<SplendorTableView | null>(null)
  const lastSeqRef = useRef<number | null>(null)
  const [flyers, setFlyers] = useState<Flyer[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [glowTurn, setGlowTurn] = useState(view.turn)
  const reduced = useMemo(prefersReducedMotion, [])
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  const measure = useCallback(() => {
    const stage = stageRef.current
    const map = new Map<string, Rect>()
    if (!stage) return map
    const s = stage.getBoundingClientRect()
    const k = s.width / W
    stage.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
      const r = el.getBoundingClientRect()
      map.set(el.dataset.anchor!, { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k })
    })
    return map
  }, [])

  // On every commit: if this is a new update, plan its animation from the PREVIOUS commit's
  // rects (sources) and this commit's rects (destinations); then remember this commit's rects.
  useLayoutEffect(() => {
    const now = measure()
    if (lastSeqRef.current !== seq) {
      const firstRender = lastSeqRef.current === null
      lastSeqRef.current = seq
      const prev = prevViewRef.current
      prevViewRef.current = view
      if (firstRender || events.length === 0 || !prev) {
        if (timerRef.current != null) window.clearTimeout(timerRef.current)
        timerRef.current = null
        setFlyers([])
        setHidden([])
        setGlowTurn(view.turn)
        onEventsDone()
      } else {
        const plan = planAnimation(events, prev, view, rectsRef.current, now, reduced)
        for (const s of plan.sounds) sound.play(s.name, { delayMs: s.at, volume: s.volume })
        setFlyers(plan.flyers)
        setHidden(plan.hidden)
        if (timerRef.current != null) window.clearTimeout(timerRef.current)
        const turn = view.turn
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          setFlyers([])
          setHidden([])
          setGlowTurn(turn)
          onEventsDone()
        }, plan.total + 40)
      }
    }
    rectsRef.current = now
  })

  const hideCss = hidden.map((a) => `[data-anchor="${a}"]{visibility:hidden}`).join('')
  const areas = areasFor(view.players.length)
  const boardX = 573
  const pilesX = boardX + BOARD_CARD * 5 + 16 * 4 + 34

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#1a120b' }}>
      <div
        ref={stageRef}
        style={{
          position: 'absolute',
          width: W,
          height: H,
          left: (window.innerWidth - W * scale) / 2,
          top: (window.innerHeight - H * scale) / 2,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          backgroundImage: `url(${TABLE_IMG})`,
          backgroundSize: '640px 640px',
          overflow: 'hidden',
        }}
      >
        <style>{hideCss}</style>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 45%, rgba(255,220,160,.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,.6) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Last action / status banner */}
        <Banner view={view} seq={seq} />

        {/* Nobles */}
        <div style={{ position: 'absolute', left: boardX, top: 82, width: BOARD_CARD * 5 + 64, display: 'flex', justifyContent: 'center', gap: 16 }}>
          {view.nobles.map((id) => (
            <div key={id} data-anchor={`noble-${id}`}>
              <NobleTile id={id} size={NOBLE} />
            </div>
          ))}
        </div>

        {/* Tiers 3 / 2 / 1 */}
        {([3, 2, 1] as Tier[]).map((tier, row) => (
          <div key={tier} style={{ position: 'absolute', left: boardX, top: 205 + row * (BOARD_CARD * CARD_RATIO + 16), display: 'flex', gap: 16 }}>
            <div data-anchor={`deck-${tier}`} style={{ position: 'relative' }}>
              {view.decks[tier] > 0 ? (
                <DeckStack tier={tier} count={view.decks[tier]} size={BOARD_CARD} />
              ) : (
                <EmptySlot size={BOARD_CARD} />
              )}
            </div>
            {view.board[tier].map((id, slot) => (
              <div key={slot} data-anchor={`slot-${tier}-${slot}`}>
                {id ? <Card id={id} size={BOARD_CARD} /> : <EmptySlot size={BOARD_CARD} />}
              </div>
            ))}
          </div>
        ))}

        {/* Bank */}
        <div style={{ position: 'absolute', left: pilesX, top: 205, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {TOKENS.map((t) => (
            <div key={t} data-anchor={`bank-${t}`}>
              <TokenPile gem={t} count={view.bank[t]} size={PILE} />
            </div>
          ))}
        </div>

        {/* Players */}
        {view.players.map((p, i) => (
          <PlayerArea key={p.seat} p={p} area={areas[i]} active={!view.finished && glowTurn === p.seat} first={view.firstPlayer === p.seat} />
        ))}

        {/* In-flight components */}
        {flyers.map((f) => (
          <FlyerView key={f.key} flyer={f} reduced={reduced} />
        ))}

        {view.finished && view.result && flyers.length === 0 && <Standings view={view} />}
      </div>
    </div>
  )
}

// ——— Pieces ———
function EmptySlot({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size * CARD_RATIO,
        borderRadius: size * 0.07,
        border: '2px dashed rgba(255,235,200,.25)',
        background: 'rgba(0,0,0,.12)',
      }}
    />
  )
}

function DeckStack({ tier, count, size }: { tier: Tier; count: number; size: number }) {
  const layers = Math.min(4, Math.ceil(count / 6))
  return (
    <div style={{ position: 'relative', width: size, height: size * CARD_RATIO }}>
      {Array.from({ length: layers }, (_, i) => (
        <CardBack key={i} tier={tier} size={size} style={{ position: 'absolute', left: -(layers - 1 - i) * 2, top: -(layers - 1 - i) * 2 }} />
      ))}
      <CountBadge n={count} style={{ position: 'absolute', right: -8, bottom: -8, fontSize: 18 }} />
    </div>
  )
}

function Banner({ view, seq }: { view: SplendorTableView; seq: number }) {
  const turnName = view.players.find((p) => p.seat === view.turn)?.name ?? ''
  let text: ReactNode = view.lastAction?.summary ?? `${turnName} goes first`
  if (view.pending?.kind === 'discard') text = `${nameOf(view, view.pending.seat)} is returning tokens…`
  if (view.pending?.kind === 'noble') text = `${nameOf(view, view.pending.seat)} is choosing a noble…`
  return (
    <div style={{ position: 'absolute', left: 560, width: 800, top: 18, display: 'flex', justifyContent: 'center', gap: 12 }}>
      <div
        key={`${seq}-${String(text)}`}
        className="spl-banner spl-serif"
        style={{
          padding: '8px 26px',
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(250,240,215,.95), rgba(225,205,165,.95))',
          color: '#3b2412',
          fontSize: 26,
          boxShadow: '0 4px 14px rgba(0,0,0,.45)',
          whiteSpace: 'nowrap',
          maxWidth: 800,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
      {view.endTriggered && !view.finished && (
        <div className="spl-banner spl-serif" style={{ padding: '8px 18px', borderRadius: 999, background: '#7f1d1d', color: '#fde68a', fontSize: 24, boxShadow: '0 4px 14px rgba(0,0,0,.45)' }}>
          Final round!
        </div>
      )}
    </div>
  )
}

const nameOf = (view: SplendorTableView, seat: number) => view.players.find((p) => p.seat === seat)?.name ?? `Player ${seat + 1}`

function PlayerArea({ p, area, active, first }: { p: PublicPlayer; area: Area; active: boolean; first: boolean }) {
  const hex = seatHex(p.color)
  const columns = GEMS.map((g) => ({ gem: g, cards: p.cards.filter((id) => CARD_BY_ID[id]?.bonus === g) }))
  return (
    <div
      className="spl-glow"
      style={{
        position: 'absolute',
        left: area.x,
        top: area.y,
        width: area.w,
        height: area.h,
        borderRadius: 18,
        padding: 14,
        background: 'rgba(20,12,6,.35)',
        outline: `3px solid ${active ? hex : 'rgba(255,255,255,.08)'}`,
        boxShadow: active ? `0 0 28px 6px ${hex}aa, inset 0 0 22px ${hex}55` : '0 0 0 rgba(0,0,0,0)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: hex, boxShadow: '0 0 0 2px rgba(0,0,0,.4)' }} />
        <span className="spl-serif" style={{ fontSize: 30, color: '#fef3c7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
          {first && <span title="First player" style={{ fontSize: 18, marginLeft: 10, color: '#fcd34d' }}>① first</span>}
        </span>
        <span className="spl-numeral" style={{ fontSize: 44 }}>
          {p.points}
        </span>
        <span style={{ color: '#fcd34d', fontSize: 22 }}>pts</span>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {/* Tableau: one column per colour; covered cards show only their top band */}
        <div style={{ display: 'flex', gap: 8 }}>
          {columns.map(({ gem, cards }) => (
            <TableauColumn key={gem} seat={p.seat} gem={gem} cards={cards} />
          ))}
        </div>

        {/* Reserved (always face-down on the table) + nobles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'rgba(254,243,199,.7)', letterSpacing: 1 }}>RESERVED</span>
          {[0, 1, 2].map((i) => (
            <div key={i} data-anchor={`p${p.seat}-res-${i}`}>
              {p.reserved[i] ? (
                <CardBack tier={p.reserved[i].tier} size={RES} />
              ) : (
                <div style={{ width: RES, height: RES * CARD_RATIO, borderRadius: 5, border: '1.5px dashed rgba(255,235,200,.18)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tokens */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'center' }}>
        {TOKENS.map((t) => (
          <div key={t} data-anchor={`p${p.seat}-tok-${t}`} style={{ position: 'relative', opacity: p.tokens[t] > 0 ? 1 : 0.22 }}>
            <Token gem={t} size={PTOKEN} />
            <CountBadge n={p.tokens[t]} style={{ position: 'absolute', right: -8, top: -6, fontSize: 13 }} />
          </div>
        ))}
        <span style={{ color: 'rgba(254,243,199,.75)', fontSize: 16, marginLeft: 4 }}>{p.tokenCount}/10</span>
      </div>

      {/* Nobles won */}
      <div data-anchor={`p${p.seat}-nobles`} style={{ display: 'flex', gap: 8, marginTop: 10, minHeight: 64 }}>
        {p.nobles.map((id) => (
          <div key={id} data-anchor={`p${p.seat}-noble-${id}`}>
            <NobleTile id={id} size={64} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TableauColumn({ seat, gem, cards }: { seat: number; gem: Gem; cards: string[] }) {
  const h = MINI * CARD_RATIO
  const peek = h * TABLEAU_PEEK
  return (
    <div style={{ width: MINI, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, opacity: cards.length ? 1 : 0.35 }}>
        <GemImg gem={gem} size={22} />
        <span className="spl-numeral" style={{ fontSize: 22 }}>
          {cards.length}
        </span>
      </div>
      <div data-anchor={`p${seat}-col-${gem}`} style={{ position: 'relative', width: MINI, height: cards.length ? h + (cards.length - 1) * peek : h }}>
        {cards.length === 0 && (
          <div style={{ width: MINI, height: h, borderRadius: 6, border: '1.5px dashed rgba(255,235,200,.15)' }} />
        )}
        {cards.map((id, i) => (
          <div key={id} data-anchor={`card-${id}`} style={{ position: 'absolute', left: 0, top: i * peek }}>
            <Card id={id} size={MINI} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Standings({ view }: { view: SplendorTableView }) {
  const r = view.result!
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,6,2,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
      <div
        className="spl-pop"
        style={{
          minWidth: 640,
          padding: '34px 48px',
          borderRadius: 24,
          background: 'linear-gradient(180deg, #f8f0dc, #e4d3ac)',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          color: '#3b2412',
        }}
      >
        <div className="spl-title" style={{ fontSize: 56, textAlign: 'center', marginBottom: 18 }}>
          Splendor
        </div>
        {r.ranking.map((seat, i) => {
          const p = view.players.find((x) => x.seat === seat)!
          const won = r.winners.includes(seat)
          return (
            <div key={seat} className="spl-serif" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, padding: '6px 0' }}>
              <span style={{ width: 40 }}>{i + 1}.</span>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: seatHex(p.color) }} />
              <span style={{ flex: 1 }}>
                {won ? '👑 ' : ''}
                {p.name}
              </span>
              <span>{p.points} pts</span>
              <span style={{ fontSize: 22, opacity: 0.7, width: 110, textAlign: 'right' }}>{p.cardCount} cards</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ——— Animation planning ———
type Sound = { name: string; at: number; volume?: number }

const FLY = 520
const STAGGER = 60

export function planAnimation(
  events: { type: string; [k: string]: unknown }[],
  prev: SplendorTableView,
  next: SplendorTableView,
  from: Map<string, Rect>,
  to: Map<string, Rect>,
  reduced: boolean
): { flyers: Flyer[]; hidden: string[]; sounds: Sound[]; total: number } {
  const flyers: Flyer[] = []
  const hidden: string[] = []
  const sounds: Sound[] = []
  let k = 0
  let t = 0 // time cursor for the main action
  let end = 0
  const add = (f: Omit<Flyer, 'key'> | null) => {
    if (!f) return
    flyers.push({ ...f, key: `f${k++}` })
    end = Math.max(end, f.delay + f.duration)
  }
  const rect = (map: Map<string, Rect>, a: string) => map.get(a)
  const chip = (gem: TokenKind, fromA: string, toA: string, delay: number, fromMap = from, toMap = to): Omit<Flyer, 'key'> | null => {
    const a = rect(fromMap, fromA) ?? rect(to, fromA)
    const b = rect(toMap, toA) ?? rect(from, toA)
    if (!a || !b) return null
    // Fly a chip sized to the destination's chip.
    const size = Math.min(b.w, b.h)
    const src = { x: a.x + (a.w - Math.min(a.w, a.h)) / 2, y: a.y, w: Math.min(a.w, a.h), h: Math.min(a.w, a.h) }
    const dst = { x: b.x + (b.w - size) / 2, y: b.y + (b.h - size) / 2, w: size, h: size }
    return { from: src, to: dst, node: <Token gem={gem} size={size} />, delay, duration: 430, lift: 30 }
  }
  const expand = (gems: Partial<Record<TokenKind, number>>) =>
    TOKENS.flatMap((g) => Array.from({ length: gems[g] ?? 0 }, () => g))

  for (const e of events) {
    switch (e.type) {
      case 'gemsTaken': {
        const seat = e.seat as number
        const list = expand(e.gems as Partial<Record<TokenKind, number>>)
        list.forEach((g, i) => add(chip(g, `bank-${g}`, `p${seat}-tok-${g}`, t + i * STAGGER)))
        sounds.push({ name: list.length > 1 ? 'chip-multi' : 'chip-single', at: t + 330 })
        t = end
        break
      }
      case 'gemsReturned': {
        const seat = e.seat as number
        const list = expand(e.gems as Partial<Record<TokenKind, number>>)
        list.forEach((g, i) => add(chip(g, `p${seat}-tok-${g}`, `bank-${g}`, t + i * STAGGER)))
        sounds.push({ name: list.length > 1 ? 'chip-multi' : 'chip-single', at: t + 330 })
        t = end
        break
      }
      case 'cardBought': {
        const seat = e.seat as number
        const cardId = e.cardId as string
        const prevPlayer = prev.players.find((p) => p.seat === seat)
        const srcA =
          e.from === 'board' ? `slot-${e.tier}-${e.slot}` : `p${seat}-res-${Math.max(0, (prevPlayer?.reserved.length ?? 1) - 1)}`
        const a = rect(from, srcA)
        const b = rect(to, `card-${cardId}`)
        if (a && b) {
          hidden.push(`card-${cardId}`)
          const fromReserve = e.from !== 'board'
          add({
            from: a,
            to: b,
            node: fromReserve ? (
              <div className="spl-flip" style={{ width: b.w, height: b.h }}>
                <CardBack tier={CARD_BY_ID[cardId].tier} size={b.w} />
                <Card id={cardId} size={b.w} />
              </div>
            ) : (
              <Card id={cardId} size={b.w} />
            ),
            delay: t,
            duration: FLY + 120,
            flip: fromReserve,
            lift: 60,
          })
          sounds.push({ name: 'card-slide', at: t })
          if (fromReserve) sounds.push({ name: 'card-flip', at: t + 300 })
        }
        const paid = expand(e.paid as Partial<Record<TokenKind, number>>)
        paid.forEach((g, i) => add(chip(g, `p${seat}-tok-${g}`, `bank-${g}`, t + 160 + i * STAGGER)))
        if (paid.length) sounds.push({ name: 'chip-multi', at: t + 160 + 330, volume: 0.8 })
        t = t + 380
        break
      }
      case 'cardReserved': {
        const seat = e.seat as number
        const nextPlayer = next.players.find((p) => p.seat === seat)
        const destA = `p${seat}-res-${Math.max(0, (nextPlayer?.reserved.length ?? 1) - 1)}`
        const b = rect(to, destA)
        const tier = e.tier as Tier
        if (b) {
          hidden.push(destA)
          if (e.from === 'board') {
            const prevId = prev.board[tier][e.slot as number]
            const a = rect(from, `slot-${tier}-${e.slot}`)
            if (a && prevId) {
              add({
                from: a,
                to: b,
                node: (
                  <div className="spl-flip" style={{ width: b.w, height: b.h }}>
                    <Card id={prevId} size={b.w} />
                    <CardBack tier={tier} size={b.w} />
                  </div>
                ),
                delay: t,
                duration: FLY + 120,
                flip: true,
                lift: 60,
              })
              sounds.push({ name: 'card-slide', at: t }, { name: 'card-flip', at: t + 280 })
            }
          } else {
            const a = rect(from, `deck-${tier}`)
            if (a) {
              add({ from: a, to: b, node: <CardBack tier={tier} size={b.w} />, delay: t, duration: FLY, lift: 50 })
              sounds.push({ name: 'card-slide', at: t })
            }
          }
        }
        t = t + 360
        break
      }
      case 'goldGained': {
        const seat = e.seat as number
        add(chip('gold', 'bank-gold', `p${seat}-tok-gold`, t))
        sounds.push({ name: 'chip-single', at: t + 330 })
        break
      }
      case 'slotRefilled': {
        const tier = e.tier as Tier
        const slotA = `slot-${tier}-${e.slot}`
        const a = rect(from, `deck-${tier}`) ?? rect(to, `deck-${tier}`)
        const b = rect(to, slotA)
        if (a && b) {
          hidden.push(slotA)
          const at = Math.max(t, 280)
          add({
            from: a,
            to: b,
            node: (
              <div className="spl-flip" style={{ width: b.w, height: b.h }}>
                <CardBack tier={tier} size={b.w} />
                <Card id={e.cardId as string} size={b.w} />
              </div>
            ),
            delay: at,
            duration: FLY + 80,
            flip: true,
            lift: 24,
          })
          sounds.push({ name: 'deck-deal', at }, { name: 'card-flip', at: at + 320 })
        }
        break
      }
      case 'nobleVisited': {
        const seat = e.seat as number
        const id = e.nobleId as string
        const a = rect(from, `noble-${id}`)
        const b = rect(to, `p${seat}-noble-${id}`)
        if (a && b) {
          hidden.push(`p${seat}-noble-${id}`)
          const at = Math.max(end, t)
          add({ from: a, to: b, node: <NobleTile id={id} size={b.w} />, delay: at, duration: FLY + 180, lift: 90 })
          sounds.push({ name: 'noble-chime', at })
        }
        break
      }
      case 'turnChanged':
        sounds.push({ name: 'turn-tick', at: Math.max(end, t), volume: 0.7 })
        break
      case 'gameOver':
        sounds.push({ name: 'fanfare', at: Math.max(end, t) })
        break
      case 'gameStarted':
        sounds.push({ name: 'deck-deal', at: 0 })
        break
      default:
        break
    }
  }
  if (reduced) {
    return { flyers, hidden, sounds, total: Math.min(Math.max(end, 200), 400) }
  }
  // Keep a whole turn comfortably under ~2s.
  return { flyers, hidden, sounds, total: Math.min(Math.max(end, 150), 2000) }
}
