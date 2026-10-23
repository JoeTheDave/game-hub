import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { TableViewProps } from '../types'
import type { PublicPlayer, SplendorTableView } from '@games/splendor/engine'
import { GEMS, TOKENS, type Tier, type Token as TokenKind } from '@games/splendor/data'
import { CARD_BY_ID } from '@games/splendor/data'
import { CARD_RATIO, Card, CardBack, NobleTile, TABLEAU_PEEK, Token, TokenPile, jitter, seatHex } from './components'
import { FlyerView, type Flyer, type Rect } from './flyers'
import { TABLE_IMG } from './assets'
import './splendor.css'

// ——— Design canvas (scaled to fit any TV) ———
const W = 1920
const H = 1080

// Central market: big, straight cards so a couch can read them (and flights land exactly).
const CARD = 184
const CARD_H = CARD * CARD_RATIO
const GAP = 16
const NOBLE = 128
const BANK_CHIP = 76
const BANK_PITCH = 134
const MARKET_W = CARD * 5 + GAP * 4
export const BLOCK_W = MARKET_W + 28 + 100 // market + gap + bank column
export const MARKET_X = (W - BLOCK_W) / 2
const NOBLES_Y = 22
const TIERS_Y = NOBLES_Y + NOBLE + 22
const BANK_X = MARKET_X + MARKET_W + 40
const SIDE_W = MARKET_X - 16 // open table on each side of the market

/** How big each player's pieces are, by how many players share the table. */
interface Profile {
  mini: number
  tableauCap: number
  tok: number
  res: number
  noble: number
  name: number
  disc: number
}
const PROFILE_TALL: Profile = { mini: 70, tableauCap: 430, tok: 52, res: 72, noble: 78, name: 30, disc: 62 }
const PROFILE_CORNER: Profile = { mini: 62, tableauCap: 205, tok: 44, res: 56, noble: 60, name: 25, disc: 52 }

type Zone = { x: number; y: number; w: number; h: number; profile: Profile }
/**
 * Open-table zones in front of each seat: 2 players face each other across the market;
 * 3 players take two corners and one long side; 4 players take the four corners.
 */
export function zonesFor(n: number): Zone[] {
  const L = 14
  const R = W - SIDE_W - 14
  const tall = (x: number): Zone => ({ x, y: 20, w: SIDE_W, h: H - 40, profile: PROFILE_TALL })
  const corner = (x: number, top: boolean): Zone => ({ x, y: top ? 14 : H / 2 + 6, w: SIDE_W, h: H / 2 - 20, profile: PROFILE_CORNER })
  if (n <= 2) return [tall(L), tall(R)]
  if (n === 3) return [corner(L, false), corner(L, true), tall(R)]
  return [corner(L, false), corner(L, true), corner(R, true), corner(R, false)]
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

  // Anchors are unrotated boxes; a piece's resting tilt rides along in data-rot.
  const measure = useCallback(() => {
    const stage = stageRef.current
    const map = new Map<string, Rect>()
    if (!stage) return map
    const s = stage.getBoundingClientRect()
    const k = s.width / W
    stage.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
      const r = el.getBoundingClientRect()
      map.set(el.dataset.anchor!, {
        x: (r.left - s.left) / k,
        y: (r.top - s.top) / k,
        w: r.width / k,
        h: r.height / k,
        r: Number(el.dataset.rot ?? 0),
      })
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
        for (const s of plan.sounds) sound.play(s.name, { delayMs: s.at, volume: (s.volume ?? 1) * SOUND_GAIN })
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
        }, plan.total + 60)
      }
    }
    rectsRef.current = now
  })

  const hideCss = hidden.map((a) => `[data-anchor="${a}"]{visibility:hidden}`).join('')
  const zones = zonesFor(view.players.length)

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
        {/* warm overhead light, falling off toward the edges of the table */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(255,214,150,.13) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,.5) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Each player's light pool sits under their pieces */}
        {view.players.map((p, i) => (
          <TurnGlow key={`glow-${p.seat}`} zone={zones[i]} hex={seatHex(p.color)} on={!view.finished && glowTurn === p.seat} />
        ))}

        {/* Nobles */}
        <div style={{ position: 'absolute', left: MARKET_X, top: NOBLES_Y, width: MARKET_W, display: 'flex', justifyContent: 'center', gap: 22 }}>
          {view.nobles.map((id) => {
            const j = jitter(`noble-${id}`, 2, 3)
            return (
              <div key={id} data-anchor={`noble-${id}`} data-rot={j.rot} style={{ width: NOBLE, height: NOBLE }}>
                <NobleTile id={id} size={NOBLE} style={{ transform: `translate(${j.dx}px, ${j.dy}px) rotate(${j.rot}deg)` }} />
              </div>
            )
          })}
        </div>

        {view.endTriggered && !view.finished && <FinalRoundSeal />}

        {/* Tiers 3 / 2 / 1: deck + four face-up cards */}
        {([3, 2, 1] as Tier[]).map((tier, row) => (
          <div key={tier} style={{ position: 'absolute', left: MARKET_X, top: TIERS_Y + row * (CARD_H + GAP), display: 'flex', gap: GAP }}>
            <div data-anchor={`deck-${tier}`} style={{ position: 'relative', width: CARD, height: CARD_H }}>
              {view.decks[tier] > 0 ? <DeckStack tier={tier} count={view.decks[tier]} size={CARD} /> : <EmptySlot size={CARD} />}
            </div>
            {view.board[tier].map((id, slot) => (
              <div key={slot} data-anchor={`slot-${tier}-${slot}`} style={{ width: CARD, height: CARD_H }}>
                {id ? <Card id={id} size={CARD} /> : <EmptySlot size={CARD} />}
              </div>
            ))}
          </div>
        ))}

        {/* Bank: real chip stacks beside the market */}
        {TOKENS.map((t, i) => (
          <div key={t} data-anchor={`bank-${t}`} style={{ position: 'absolute', left: BANK_X, top: TIERS_Y + 40 + i * BANK_PITCH, width: BANK_CHIP, height: BANK_CHIP }}>
            <TokenPile gem={t} count={view.bank[t]} size={BANK_CHIP} />
          </div>
        ))}

        {/* Players: their pieces lie loose on the table in front of them */}
        {view.players.map((p, i) => (
          <PlayerSpot key={p.seat} p={p} zone={zones[i]} first={view.firstPlayer === p.seat} pending={view.pending?.seat === p.seat ? view.pending.kind : null} />
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

/** Sounds play well below full level; the files themselves are already soft. */
const SOUND_GAIN = 0.5

// ——— Pieces ———
function EmptySlot({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size * CARD_RATIO,
        borderRadius: size * 0.07,
        boxShadow: 'inset 0 0 0 2px rgba(255,235,200,.10), inset 0 0 24px rgba(0,0,0,.25)',
      }}
    />
  )
}

/** A face-down deck; its thickness hints at what's left (no numbers on the table). */
function DeckStack({ tier, count, size }: { tier: Tier; count: number; size: number }) {
  const layers = Math.min(5, Math.ceil(count / 5))
  return (
    <div style={{ position: 'relative', width: size, height: size * CARD_RATIO }}>
      {Array.from({ length: layers }, (_, i) => {
        const off = (layers - 1 - i) * 2.5
        return <CardBack key={i} tier={tier} size={size} style={{ position: 'absolute', left: -off, top: -off }} />
      })}
    </div>
  )
}

function FinalRoundSeal() {
  return (
    <div
      className="spl-pop spl-serif"
      style={{
        position: 'absolute',
        left: MARKET_X - 30,
        top: NOBLES_Y + 18,
        width: 104,
        height: 104,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 32%, #b91c1c, #7f1d1d 70%, #5b1414)',
        boxShadow: '0 4px 10px rgba(0,0,0,.5), inset 0 0 0 4px rgba(255,255,255,.08)',
        color: '#fde68a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: 22,
        lineHeight: 1.05,
        transform: 'rotate(-8deg)',
      }}
    >
      Final
      <br />
      round
    </div>
  )
}

function TurnGlow({ zone, hex, on }: { zone: Zone; hex: string; on: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: zone.x - 40,
        top: zone.y - 30,
        width: zone.w + 80,
        height: zone.h + 60,
        background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${hex}55 0%, ${hex}22 45%, rgba(0,0,0,0) 75%)`,
        opacity: on ? 1 : 0,
        transition: 'opacity 700ms ease',
        pointerEvents: 'none',
      }}
    />
  )
}

/** Wraps a piece in an unrotated anchor box and lays the piece down slightly askew. */
function Loose({
  anchor,
  seed,
  w,
  h,
  deg = 2.5,
  px = 4,
  tilt = 0,
  style,
  children,
}: {
  anchor?: string
  seed: string
  w: number
  h: number
  deg?: number
  px?: number
  /** A deliberate extra rotation (e.g. fanning reserved cards), on top of the jitter. */
  tilt?: number
  style?: CSSProperties
  children: ReactNode
}) {
  const j = jitter(seed, deg, px)
  const rot = j.rot + tilt
  return (
    <div data-anchor={anchor} data-rot={anchor ? rot : undefined} style={{ position: 'absolute', width: w, height: h, ...style }}>
      <div style={{ width: w, height: h, transform: `translate(${j.dx}px, ${j.dy}px) rotate(${rot}deg)` }}>{children}</div>
    </div>
  )
}

function PlayerSpot({ p, zone, first, pending }: { p: PublicPlayer; zone: Zone; first: boolean; pending: 'discard' | 'noble' | null }) {
  const pr = zone.profile
  const miniH = pr.mini * CARD_RATIO
  const colGap = Math.floor((zone.w - pr.mini * 5) / 4)
  const columns = GEMS.map((g) => ({ gem: g, cards: p.cards.filter((id) => CARD_BY_ID[id]?.bonus === g) }))
  const tallest = Math.max(1, ...columns.map((c) => c.cards.length))
  const peek = Math.min(miniH * TABLEAU_PEEK, tallest > 1 ? (pr.tableauCap - miniH) / (tallest - 1) : miniH)
  const tableauH = Math.min(pr.tableauCap, miniH + (tallest - 1) * peek)

  // Vertical flow: place card → tableau → tokens → reserved + nobles. Tall zones centre it.
  const placeH = pr.disc + 6
  const tokRise = pr.tok * 0.07 * 6
  const contentH = placeH + 18 + pr.tableauCap + 26 + tokRise + pr.tok + 26 + pr.res * CARD_RATIO
  const top = zone.y + Math.max(0, (zone.h - contentH) / 2)
  const tableauY = top + placeH + 18
  const tokY = tableauY + pr.tableauCap + 26 + tokRise
  const lowY = tokY + pr.tok + 26
  const tokGap = Math.floor((zone.w - pr.tok * 6) / 5)
  const resStep = pr.res * 0.62

  return (
    <>
      <PlaceCard p={p} x={zone.x} y={top} pr={pr} first={first} pending={pending} />

      {/* Tableau: one column per colour; covered cards show only their top band */}
      {columns.map(({ gem, cards }, ci) => {
        const j = jitter(`p${p.seat}-col-${gem}`, 1.2, 3)
        return (
          <div
            key={gem}
            data-anchor={`p${p.seat}-col-${gem}`}
            style={{
              position: 'absolute',
              left: zone.x + ci * (pr.mini + colGap) + j.dx,
              top: tableauY + j.dy,
              width: pr.mini,
              height: cards.length ? tableauH : miniH,
              transform: `rotate(${j.rot}deg)`,
              transformOrigin: '50% 0',
            }}
          >
            {cards.map((id, i) => (
              <div key={id} data-anchor={`card-${id}`} data-rot={j.rot} style={{ position: 'absolute', left: 0, top: i * peek }}>
                <Card id={id} size={pr.mini} />
              </div>
            ))}
          </div>
        )
      })}

      {/* Token stacks (an empty colour leaves bare table, but keeps its spot for flights) */}
      {TOKENS.map((t, i) => (
        <Loose key={t} anchor={`p${p.seat}-tok-${t}`} seed={`p${p.seat}-tok-${t}`} w={pr.tok} h={pr.tok} deg={0} px={5} style={{ left: zone.x + i * (pr.tok + tokGap), top: tokY }}>
          <TokenPile gem={t} count={p.tokens[t]} size={pr.tok} ghost={false} />
        </Loose>
      ))}

      {/* Reserved cards: always face-down, fanned a little */}
      {[0, 1, 2].map((i) => (
        <Loose
          key={`res-${i}`}
          anchor={`p${p.seat}-res-${i}`}
          seed={`p${p.seat}-res-${i}`}
          w={pr.res}
          h={pr.res * CARD_RATIO}
          deg={3}
          px={2}
          tilt={(i - 1) * 5}
          style={{ left: zone.x + i * resStep, top: lowY }}
        >
          {p.reserved[i] ? <CardBack tier={p.reserved[i].tier} size={pr.res} /> : null}
        </Loose>
      ))}

      {/* Nobles won */}
      {p.nobles.map((id, i) => (
        <Loose
          key={id}
          anchor={`p${p.seat}-noble-${id}`}
          seed={`p${p.seat}-noble-${id}`}
          w={pr.noble}
          h={pr.noble}
          deg={4}
          px={3}
          style={{ left: zone.x + pr.res + 2 * resStep + 28 + i * (pr.noble * 0.7), top: lowY + 4 }}
        >
          <NobleTile id={id} size={pr.noble} />
        </Loose>
      ))}
    </>
  )
}

/** A parchment tent card with the player's name, beside a wooden score disc. */
function PlaceCard({ p, x, y, pr, first, pending }: { p: PublicPlayer; x: number; y: number; pr: Profile; first: boolean; pending: 'discard' | 'noble' | null }) {
  const hex = seatHex(p.color)
  const j = jitter(`place-${p.seat}`, 2, 2)
  return (
    <div style={{ position: 'absolute', left: x + j.dx, top: y + j.dy, display: 'flex', alignItems: 'center', gap: 10, transform: `rotate(${j.rot}deg)` }}>
      <div
        style={{
          position: 'relative',
          width: pr.disc,
          height: pr.disc,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #a0703f, #6b4423 65%, #4a2e17)',
          boxShadow: `0 3px 8px rgba(0,0,0,.5), inset 0 0 0 3px ${hex}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="spl-numeral" style={{ fontSize: pr.disc * 0.56 }}>
          {p.points}
        </span>
      </div>
      <div
        className="spl-serif"
        style={{
          padding: `${pr.name * 0.2}px ${pr.name * 0.6}px`,
          borderRadius: 4,
          background: 'linear-gradient(180deg, #f3e9d2 0%, #e6d6b2 55%, #d6c29a 100%)',
          boxShadow: '0 3px 6px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6)',
          color: '#3b2412',
          fontSize: pr.name,
          lineHeight: 1.1,
          maxWidth: SIDE_W - pr.disc - 70,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          borderLeft: `5px solid ${hex}`,
        }}
      >
        {p.name}
        {pending && (
          <div style={{ fontSize: pr.name * 0.55, fontStyle: 'italic', opacity: 0.75 }}>
            {pending === 'noble' ? 'choosing a noble…' : 'returning tokens…'}
          </div>
        )}
      </div>
      {first && (
        <div
          title="First player"
          className="spl-serif"
          style={{
            width: pr.disc * 0.55,
            height: pr.disc * 0.55,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #fde68a, #d4a017 70%, #9a7410)',
            boxShadow: '0 2px 5px rgba(0,0,0,.45)',
            color: '#4a3208',
            fontSize: pr.disc * 0.3,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          1
        </div>
      )}
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
          borderRadius: 10,
          background: 'linear-gradient(180deg, #f8f0dc, #e4d3ac)',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          color: '#3b2412',
          transform: 'rotate(-1deg)',
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

// Motion timings (play-test: slower than before, gentle ease, whole turn ≤ ~2.5 s).
const CHIP_FLY = 640
const CARD_FLY = 780
const REFILL_FLY = 760
const NOBLE_FLY = 880
const STAGGER = 90
export const MAX_TURN_MS = 2500

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
    return { from: src, to: dst, node: <Token gem={gem} size={size} />, delay, duration: CHIP_FLY, lift: 36 }
  }
  const expand = (gems: Partial<Record<TokenKind, number>>) =>
    TOKENS.flatMap((g) => Array.from({ length: gems[g] ?? 0 }, () => g))

  for (const e of events) {
    switch (e.type) {
      case 'gemsTaken': {
        const seat = e.seat as number
        const list = expand(e.gems as Partial<Record<TokenKind, number>>)
        list.forEach((g, i) => add(chip(g, `bank-${g}`, `p${seat}-tok-${g}`, t + i * STAGGER)))
        sounds.push({ name: list.length > 1 ? 'chip-multi' : 'chip-single', at: t + CHIP_FLY - 120 })
        t = end
        break
      }
      case 'gemsReturned': {
        const seat = e.seat as number
        const list = expand(e.gems as Partial<Record<TokenKind, number>>)
        list.forEach((g, i) => add(chip(g, `p${seat}-tok-${g}`, `bank-${g}`, t + i * STAGGER)))
        sounds.push({ name: list.length > 1 ? 'chip-multi' : 'chip-single', at: t + CHIP_FLY - 120 })
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
            duration: CARD_FLY,
            flip: fromReserve,
            lift: 60,
          })
          sounds.push({ name: 'card-slide', at: t })
          if (fromReserve) sounds.push({ name: 'card-flip', at: t + CARD_FLY / 2 })
        }
        const paid = expand(e.paid as Partial<Record<TokenKind, number>>)
        paid.forEach((g, i) => add(chip(g, `p${seat}-tok-${g}`, `bank-${g}`, t + 220 + i * STAGGER)))
        if (paid.length) sounds.push({ name: paid.length > 1 ? 'chip-multi' : 'chip-single', at: t + 220 + CHIP_FLY - 120, volume: 0.8 })
        t = t + 420
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
                duration: CARD_FLY,
                flip: true,
                lift: 60,
              })
              sounds.push({ name: 'card-slide', at: t }, { name: 'card-flip', at: t + CARD_FLY / 2 })
            }
          } else {
            const a = rect(from, `deck-${tier}`)
            if (a) {
              add({ from: a, to: b, node: <CardBack tier={tier} size={b.w} />, delay: t, duration: CARD_FLY, lift: 50 })
              sounds.push({ name: 'card-slide', at: t })
            }
          }
        }
        t = t + 420
        break
      }
      case 'goldGained': {
        const seat = e.seat as number
        add(chip('gold', 'bank-gold', `p${seat}-tok-gold`, t))
        sounds.push({ name: 'chip-single', at: t + CHIP_FLY - 120 })
        break
      }
      case 'slotRefilled': {
        const tier = e.tier as Tier
        const slotA = `slot-${tier}-${e.slot}`
        const a = rect(from, `deck-${tier}`) ?? rect(to, `deck-${tier}`)
        const b = rect(to, slotA)
        if (a && b) {
          hidden.push(slotA)
          // The deck deals once the taken card has cleared the slot: one fluid slide + flip,
          // landing exactly in that slot (the slot box keeps its size while it's empty).
          const at = Math.max(t, 360)
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
            duration: REFILL_FLY,
            flip: true,
            lift: 28,
          })
          sounds.push({ name: 'deck-deal', at })
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
          add({ from: a, to: b, node: <NobleTile id={id} size={b.w} />, delay: at, duration: NOBLE_FLY, lift: 90 })
          sounds.push({ name: 'noble-chime', at })
        }
        break
      }
      case 'turnChanged':
        sounds.push({ name: 'turn-tick', at: Math.max(end, t), volume: 0.5 })
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
  return { flyers, hidden, sounds, total: Math.min(Math.max(end, 150), MAX_TURN_MS) }
}
