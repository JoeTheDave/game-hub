import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TableViewProps } from '../types'
import type { DragonheartTableView, PublicPlayer } from '@games/dragonheart/engine'
import { CAPACITY, SPACES, type DeckColor, type Space } from '@games/dragonheart/data'
import { Card, CardBack, GreatDragon, Outline, StackEdges, deckOf, jitter, seatHex } from './components'
import { FlipCard, FlyerView, type Flyer, type Rect } from './flyers'
import {
  BOARD,
  H,
  OFF_CARD,
  P_CARD,
  noteAnchor,
  slotZ,
  TURN_LIGHT,
  W,
  belowShipRect,
  boardDragonRect,
  deckRect,
  dragonRect,
  glowRect,
  handRect,
  scoreRect,
  shipStackRect,
  outlineRect,
  slotRect,
  spotLayout,
  zoneFor,
} from './layout'
import { BOARD_IMG, TABLE_IMG } from './assets'
import './dragonheart.css'

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

/** Sounds play well below full level; the files themselves are already soft. */
const SOUND_GAIN = 0.5

const placed = (r: Rect, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
  transform: r.r ? `rotate(${r.r}deg)` : undefined,
  ...extra,
})

// ——— The table ———
export function TableView({ view, events, seq, onEventsDone, sound }: TableViewProps<DragonheartTableView>) {
  const scale = useStageScale()
  const prevViewRef = useRef<DragonheartTableView | null>(null)
  const lastSeqRef = useRef<number | null>(null)
  const [flyers, setFlyers] = useState<Flyer[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [glowTurn, setGlowTurn] = useState(view.turn)
  const reduced = useMemo(prefersReducedMotion, [])
  const timerRef = useRef<number | null>(null)
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
      onEventsDone()
      return
    }
    const plan = planAnimation(events, prev, view, reduced)
    for (const s of plan.sounds) sound.play(s.name, { delayMs: s.at, volume: (s.volume ?? 1) * SOUND_GAIN })
    setFlyers(plan.flyers)
    setHidden(plan.hidden)
    const turn = view.turn
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setFlyers([])
      setHidden([])
      setGlowTurn(turn)
      onEventsDone()
    }, plan.total + 60)
  })

  const hideCss = hidden.map((a) => `[data-anchor="${a}"]{visibility:hidden}`).join('')

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
          backgroundSize: '640px 640px',
          overflow: 'hidden',
        }}
      >
        <style>{hideCss}</style>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 75% 70% at 50% 45%, rgba(255,214,150,.12) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,.5) 100%)',
            pointerEvents: 'none',
          }}
        />

        {view.players.map((p) => (
          <TurnGlow key={`glow-${p.seat}`} rect={glowRect(p.seat)} on={!view.finished && glowTurn === p.seat} />
        ))}

        <Board view={view} />

        {/* The Knight/Huntress pile, lying below the Ship */}
        <PileBelowShip view={view} />

        {/* A subtle "N pts" under each space holding 2+ cards */}
        <StackNotes view={view} />

        {/* Ship stacks beside it (the third one ends the game) */}
        {view.shipStacks.map((stack, i) => {
          const r = shipStackRect(i)
          return (
            <div key={i} data-anchor={`shipstack-${i}`} style={placed(r)}>
              <StackEdges count={stack.length * 2} size={OFF_CARD} face="up" />
              <Card id={stack[stack.length - 1]} size={OFF_CARD} style={{ position: 'absolute', inset: 0 }} />
            </div>
          )
        })}

        {view.endAfterSeat != null && !view.finished && <FinalTurnSeal />}

        {view.players.map((p) => (
          <PlayerSpot key={p.seat} p={p} first={view.firstPlayer === p.seat} finalTurn={view.finalTurn && view.turn === p.seat} />
        ))}

        {flyers.map((f) => (
          <FlyerView key={f.key} flyer={f} reduced={reduced} />
        ))}

        {view.finished && view.result && flyers.length === 0 && <Standings view={view} />}
      </div>
    </div>
  )
}

// ——— The board ———
function Board({ view }: { view: DragonheartTableView }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: BOARD.x,
        top: BOARD.y,
        width: BOARD.w,
        height: BOARD.h,
        borderRadius: 14,
        backgroundImage: `url(${BOARD_IMG})`,
        backgroundSize: '100% 100%',
        boxShadow: '0 14px 30px rgba(0,0,0,.6), inset 0 0 0 3px rgba(20,12,6,.55), inset 0 0 60px rgba(0,0,0,.35)',
      }}
    >
      {/* A light milky shade over the painted board: cards (above it) read clearer, so placed cards stand out. */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: BOARD_SHADE, pointerEvents: 'none', zIndex: 1 }} />
      {/* The outlines and arrows are painted into the board art; cards sit inside the measured outlines. */}
      {SPACES.map((space) => (
        <SpaceCards key={space} space={space} view={view} />
      ))}
      {view.greatDragon === 'board' && (
        <div data-anchor="dragon" style={placed(local(boardDragonRect()), { zIndex: 3 })}>
          <GreatDragon size={boardDragonRect().w} />
        </div>
      )}
    </div>
  )
}

/** The milky overshade on the board image (cards render above it, unshaded). */
export const BOARD_SHADE = 'rgba(255, 250, 240, 0.26)'

/** Board-local copy of a canvas rect (pieces on the board render inside the board element). */
const local = (r: Rect): Rect => ({ ...r, x: r.x - BOARD.x, y: r.y - BOARD.y })

function SpaceCards({ space, view }: { space: Space; view: DragonheartTableView }) {
  const cap = CAPACITY[space]
  const sv = view.spaces[space]
  if (cap > 0) {
    // Capacity spaces fill from the upper-left outline down-right; each later card lies on top.
    return (
      <>
        {sv.visible.map((id, i) => {
          const r = slotRect(space, i)
          return (
            <div key={id} data-anchor={`slot-${space}-${i}`} style={placed(local(r), { zIndex: slotZ(i) })}>
              <Card id={id} size={r.w} height={r.h} />
            </div>
          )
        })}
      </>
    )
  }
  const r = slotRect(space, 0)
  const top = sv.visible[sv.visible.length - 1]
  if (sv.count === 0) return null
  return (
    <div style={placed(local(r), { zIndex: 2 })}>
      <StackEdges count={sv.count - 1} size={r.w} face="up" />
      {top && (
        <div data-anchor={`top-${space}`} style={{ position: 'absolute', inset: 0 }}>
          <Card id={top} size={r.w} height={r.h} />
        </div>
      )}
    </div>
  )
}

function PileBelowShip({ view }: { view: DragonheartTableView }) {
  const r = belowShipRect()
  const o = outlineRect('belowShip')
  const top = view.belowShip.visible[view.belowShip.visible.length - 1]
  return (
    <>
      {/* The pile's outline continues off the board onto the table (the board paints only its top). */}
      <div
        style={{
          position: 'absolute',
          left: o.x,
          top: o.y,
          width: o.w,
          height: o.h,
          borderRadius: 12,
          border: '2px solid rgba(229,231,235,.35)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.25)',
          pointerEvents: 'none',
        }}
      />
      {view.belowShip.count > 0 && (
        <div style={placed(r, { zIndex: 2 })}>
          <StackEdges count={view.belowShip.count - 1} size={r.w} face="up" />
          {top && (
            <div data-anchor="belowShip" style={{ position: 'absolute', inset: 0 }}>
              <Card id={top} size={r.w} height={r.h} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** The subtle note for a space: its total points ("7 pts"), only when it holds 2 or more cards. */
export function noteText(count: number, points: number): string | null {
  if (count < 2) return null
  return `${points} pts`
}

function StackNotes({ view }: { view: DragonheartTableView }) {
  const entries: [Space | 'belowShip', { count: number; points: number }][] = [
    ...SPACES.map((sp) => [sp, view.spaces[sp]] as [Space, { count: number; points: number }]),
    ['belowShip', view.belowShip],
  ]
  return (
    <>
      {entries.map(([space, sv]) => {
        const t = noteText(sv.count, sv.points)
        if (!t) return null
        const a = noteAnchor(space, sv.count)
        return (
          <div
            key={space}
            className="dh-numeral dh-stacknote"
            title={`${sv.count} cards, ${sv.points} points`}
            style={{ position: 'absolute', left: a.x - a.w / 2, top: a.y, width: a.w, zIndex: 20 }}
          >
            {t}
          </div>
        )
      })}
    </>
  )
}

function FinalTurnSeal() {
  const r = shipStackRect(2)
  return (
    <div
      className="dh-pop dh-serif"
      style={{
        position: 'absolute',
        left: r.x + r.w + 40,
        top: r.y + 20,
        width: 112,
        height: 112,
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
      turn
    </div>
  )
}

function TurnGlow({ rect, on }: { rect: { x: number; y: number; w: number; h: number }; on: boolean }) {
  const { rgb, alpha } = TURN_LIGHT
  const c = (a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${c(alpha)} 0%, ${c(alpha * 0.55)} 40%, ${c(alpha * 0.18)} 70%, rgba(0,0,0,0) 100%)`,
        mixBlendMode: 'screen',
        opacity: on ? 1 : 0,
        transition: 'opacity 700ms ease',
        pointerEvents: 'none',
      }}
    />
  )
}

/** A face-down pile (draw deck or score pile): thickness hints at its size, never a number. */
function FaceDownPile({ anchor, rect, count, deck }: { anchor: string; rect: Rect; count: number; deck: DeckColor }) {
  if (count <= 0) {
    return <Outline size={rect.w} style={{ left: rect.x, top: rect.y, opacity: 0.4 }} />
  }
  const layers = Math.min(6, Math.ceil(count / 6))
  return (
    <div data-anchor={anchor} style={placed(rect)}>
      {Array.from({ length: layers }, (_, i) => {
        const off = (layers - 1 - i) * 2.2
        return <CardBack key={i} deck={deck} size={rect.w} style={{ position: 'absolute', left: off, top: off }} />
      })}
    </div>
  )
}

/** A player's score pile: face-up (Joe, iteration 3); its top card shows, thickness hints at its size. */
function ScorePile({ seat, rect, count, top }: { seat: number; rect: Rect; count: number; top: string | null }) {
  if (count <= 0 || !top) {
    return <Outline size={rect.w} style={{ left: rect.x, top: rect.y, opacity: 0.4 }} />
  }
  return (
    <div data-anchor={`score-${seat}`} style={placed(rect)}>
      <StackEdges count={count - 1} size={rect.w} face="up" />
      <Card id={top} size={rect.w} height={rect.h} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}

function PlayerSpot({ p, first, finalTurn }: { p: PublicPlayer; first: boolean; finalTurn: boolean }) {
  const s = spotLayout(zoneFor(p.seat), p.seat)
  return (
    <>
      <PlaceCard p={p} x={s.left} y={s.top} first={first} finalTurn={finalTurn} maxW={s.contentW} />
      <FaceDownPile anchor={`deck-${p.seat}`} rect={deckRect(p.seat)} count={p.deckCount} deck={p.deck} />
      {Array.from({ length: p.handCount }, (_, i) => (
        <div key={i} data-anchor={`hand-${p.seat}-${i}`} style={placed(handRect(p.seat, i, p.handCount), { zIndex: 2 })}>
          <CardBack deck={p.deck} size={P_CARD} />
        </div>
      ))}
      <ScorePile seat={p.seat} rect={scoreRect(p.seat)} count={p.scoreCount} top={p.scoreTop} />
      {p.hasDragon && (
        <div data-anchor="dragon" style={placed(dragonRect(p.seat), { zIndex: 3 })}>
          <GreatDragon size={dragonRect(p.seat).w} />
        </div>
      )}
    </>
  )
}

/** A parchment tent card with the player's name and deck colour. */
function PlaceCard({ p, x, y, first, finalTurn, maxW }: { p: PublicPlayer; x: number; y: number; first: boolean; finalTurn: boolean; maxW: number }) {
  const j = jitter(`place-${p.seat}`, 2, 2)
  const deckHex = p.deck === 'green' ? '#2f8a3a' : '#a32020'
  return (
    <div style={{ position: 'absolute', left: x + j.dx, top: y + j.dy, height: 52, display: 'flex', alignItems: 'center', gap: 10, transform: `rotate(${j.rot}deg)` }}>
      <div
        className="dh-serif"
        style={{
          padding: '5px 16px',
          borderRadius: 4,
          background: 'linear-gradient(180deg, #f3e9d2 0%, #e6d6b2 55%, #d6c29a 100%)',
          boxShadow: '0 3px 6px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6)',
          color: '#3b2412',
          fontSize: 26,
          lineHeight: 1.1,
          maxWidth: maxW - (first ? 46 : 0),
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          borderLeft: `6px solid ${deckHex}`,
          borderRight: `3px solid ${seatHex(p.color)}`,
        }}
      >
        {p.name}
        {finalTurn && <div style={{ fontSize: 14, fontStyle: 'italic', opacity: 0.75 }}>final turn</div>}
      </div>
      {first && (
        <div
          title="First player"
          className="dh-serif"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #fde68a, #d4a017 70%, #9a7410)',
            boxShadow: '0 2px 5px rgba(0,0,0,.45)',
            color: '#4a3208',
            fontSize: 17,
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

/** The headline for the end of the game, by who won. */
export function verdict(view: DragonheartTableView): string {
  const w = view.result?.winners ?? []
  if (w.length !== 1) return 'Neither side prevails — the Great Dragon stirs, and sleeps'
  const winner = view.players.find((p) => p.seat === w[0])
  return winner?.deck === 'green' ? 'The Great Dragon is free!' : 'The Great Dragon sleeps forever'
}

function Standings({ view }: { view: DragonheartTableView }) {
  const r = view.result!
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,6,2,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
      <div
        className="dh-pop"
        style={{
          minWidth: 720,
          padding: '34px 48px',
          borderRadius: 10,
          background: 'linear-gradient(180deg, #f8f0dc, #e4d3ac)',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          color: '#3b2412',
          transform: 'rotate(-1deg)',
        }}
      >
        <div className="dh-title" style={{ fontSize: 52, textAlign: 'center' }}>
          Dragonheart
        </div>
        <div className="dh-serif" style={{ fontSize: 26, textAlign: 'center', margin: '6px 0 20px' }}>
          {verdict(view)}
        </div>
        {view.players.map((p) => {
          const won = r.winners.includes(p.seat)
          const pile = r.scorePiles[p.seat] ?? []
          return (
            <div key={p.seat} className="dh-serif" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, padding: '6px 0' }}>
              <span style={{ width: 18, height: 18, borderRadius: 3, background: p.deck === 'green' ? '#2f8a3a' : '#a32020' }} />
              <span style={{ flex: 1 }}>
                {won ? '👑 ' : ''}
                {p.name}
              </span>
              {p.hasDragon && <GreatDragon size={44} />}
              <span>{r.scores[p.seat]} pts</span>
              <span style={{ fontSize: 20, opacity: 0.7, width: 120, textAlign: 'right' }}>{pile.length} cards</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ——— Animation planning (pure: geometry comes from layout.ts) ———
type Sound = { name: string; at: number; volume?: number }

const CARD_FLY = 760
const COLLECT_FLY = 820
const DRAGON_FLY = 880
const DRAW_FLY = 640
const STAGGER_MS = 90
/** Phases overlap a little so a turn flows instead of stopping between steps. */
const OVERLAP = 140
export const MAX_TURN_MS = 2500
/** Flyer z for the card at stack position 0 on a space; position i flies at STACK_Z + i. */
const STACK_Z = 10

type Ev = { type: string; [k: string]: unknown }

export function planAnimation(
  events: Ev[],
  prev: DragonheartTableView,
  next: DragonheartTableView,
  reduced: boolean
): { flyers: Flyer[]; hidden: string[]; sounds: Sound[]; total: number } {
  const flyers: Flyer[] = []
  const hidden: string[] = []
  const sounds: Sound[] = []
  /** Where a card currently is within this plan (if it already flew), so its next move chains. */
  const at = new Map<string, { rect: Rect; arrive: number; flyer: number; z?: number }>()
  let k = 0
  let t = 0
  let end = 0
  const add = (f: Omit<Flyer, 'key'>, ids: string[] = []) => {
    flyers.push({ ...f, key: `f${k++}` })
    end = Math.max(end, f.delay + f.duration)
    for (const id of ids) at.set(id, { rect: f.to, arrive: f.delay + f.duration, flyer: flyers.length - 1, z: f.z })
  }
  /** Start a card's next move from where it currently is; chain if it arrived earlier in this plan. */
  const source = (id: string, fallback: Rect, earliest: number) => {
    const cur = at.get(id)
    if (!cur) return { rect: fallback, delay: earliest, appear: true, z: undefined as number | undefined }
    const delay = Math.max(earliest, cur.arrive)
    flyers[cur.flyer].vanishAt = delay
    // A card that moves again keeps its stacking order (the newest card stays on top).
    return { rect: cur.rect, delay, appear: false, z: cur.z }
  }
  const phase = () => {
    t = Math.max(t, end - OVERLAP)
  }

  for (const e of events) {
    switch (e.type) {
      case 'cardsPlayed': {
        const seat = e.seat as number
        const space = e.space as Space
        const ids = e.cardIds as string[]
        const n0 = prev.players.find((p) => p.seat === seat)?.handCount ?? ids.length
        const before = prev.spaces[space].count
        const cap = CAPACITY[space]
        // A stack shows only its top card, which this play replaces: keep the previous top in view
        // (under the incoming card) until the new one lands on it.
        const prevTop = cap > 0 ? undefined : prev.spaces[space].visible[prev.spaces[space].visible.length - 1]
        if (prevTop) {
          const r = slotRect(space, 0)
          const lands = t + (ids.length - 1) * STAGGER_MS + CARD_FLY
          add({ from: r, to: r, node: <Card id={prevTop} size={r.w} height={r.h} />, delay: 0, duration: lands, vanishAt: lands, z: STACK_Z + before - 1 })
        }
        ids.forEach((id, j) => {
          const from = handRect(seat, Math.max(0, n0 - ids.length + j), n0)
          const to = slotRect(space, cap > 0 ? before + j : 0)
          const deck = deckOf(id)
          add(
            {
              from,
              to,
              node: <FlipCard w={to.w} h={to.h} first={<CardBack deck={deck} size={to.w} height={to.h} />} second={<Card id={id} size={to.w} height={to.h} />} />,
              delay: t + j * STAGGER_MS,
              duration: CARD_FLY,
              flip: true,
              lift: 70,
              // Its stack position: always above every card already on the space.
              z: STACK_Z + before + j,
            },
            [id]
          )
          hidden.push(cap > 0 ? `slot-${space}-${before + j}` : `top-${space}`)
        })
        sounds.push({ name: 'card-slide', at: t }, { name: 'card-place', at: t + CARD_FLY - 90 })
        phase()
        break
      }
      case 'cardsCollected': {
        const seat = e.seat as number
        const from = e.from as Space | 'belowShip'
        const visible = (e.visibleIds as string[]) ?? []
        const to = scoreRect(seat)
        const fromCap = from === 'belowShip' ? 0 : CAPACITY[from]
        const pieces =
          fromCap > 0
            ? visible.map((id, i) => ({ id, rect: slotRect(from as Space, i) }))
            : [{ id: visible[visible.length - 1] ?? '', rect: from === 'belowShip' ? belowShipRect() : slotRect(from as Space, 0) }]
        // Score piles lie face-up: collected cards keep their faces and land on the pile, the stack's
        // top card last (it becomes the pile's new top). Until then the old top stays in view.
        const prevSeat = prev.players.find((p) => p.seat === seat)
        const lands = t + (pieces.length - 1) * STAGGER_MS + COLLECT_FLY
        if (prevSeat?.scoreTop) {
          add({ from: to, to, node: <Card id={prevSeat.scoreTop} size={to.w} height={to.h} />, delay: 0, duration: lands, vanishAt: lands, z: 5 })
        }
        pieces.forEach((pc, i) => {
          const src = pc.id ? source(pc.id, pc.rect, t + i * STAGGER_MS) : { rect: pc.rect, delay: t + i * STAGGER_MS, appear: true, z: undefined }
          const face = pc.id ? <Card id={pc.id} size={to.w} height={to.h} /> : <CardBack deck={prev.players[seat]?.deck ?? 'green'} size={to.w} />
          add(
            {
              from: src.rect,
              to,
              node: face,
              delay: src.delay,
              duration: COLLECT_FLY,
              lift: 80,
              appear: src.appear,
              z: src.z ?? STACK_Z + i,
            },
            pc.id ? [pc.id] : []
          )
        })
        hidden.push(`score-${seat}`)
        sounds.push({ name: 'collect', at: t })
        phase()
        break
      }
      case 'greatDragonMoved': {
        const from = dragonRect(e.from as 'board' | number)
        const to = dragonRect(e.to as 'board' | number)
        add({ from, to, node: <GreatDragon size={to.w} />, delay: t, duration: DRAGON_FLY, lift: 120, z: 90 })
        hidden.push('dragon')
        sounds.push({ name: 'dragon-rumble', at: t })
        phase()
        break
      }
      case 'cardReturnedToDeck': {
        const seat = e.seat as number
        const n0 = prev.players.find((p) => p.seat === seat)?.handCount ?? 1
        const deck = prev.players.find((p) => p.seat === seat)?.deck ?? 'green'
        const to = deckRect(seat)
        add({ from: handRect(seat, Math.max(0, n0 - 1), n0), to, node: <CardBack deck={deck} size={to.w} />, delay: t, duration: CARD_FLY, lift: 50, z: 80 })
        sounds.push({ name: 'card-slide', at: t, volume: 0.8 })
        phase()
        break
      }
      case 'movedBelowShip': {
        const from = e.from as Space
        const ids = e.cardIds as string[]
        const to = belowShipRect()
        ids.forEach((id, i) => {
          const src = source(id, slotRect(from, i), t + i * STAGGER_MS)
          add({ from: src.rect, to, node: <Card id={id} size={to.w} height={to.h} />, delay: src.delay, duration: CARD_FLY, lift: 50, appear: src.appear, z: src.z ?? STACK_Z + i }, [id])
        })
        hidden.push('belowShip')
        sounds.push({ name: 'card-slide', at: t })
        phase()
        break
      }
      case 'shipStackFormed': {
        const index = e.index as number
        const ids = e.cardIds as string[]
        const to = shipStackRect(index)
        ids.forEach((id, i) => {
          const src = source(id, slotRect('ship', i), t + i * STAGGER_MS)
          add({ from: src.rect, to, node: <Card id={id} size={to.w} height={to.h} />, delay: src.delay, duration: CARD_FLY, lift: 50, appear: src.appear, z: src.z ?? STACK_Z + i }, [id])
        })
        hidden.push(`shipstack-${index}`)
        sounds.push({ name: 'ship-bell', at: t })
        phase()
        break
      }
      case 'cardsDrawn': {
        const seat = e.seat as number
        const count = e.count as number
        const p = next.players.find((x) => x.seat === seat)
        const n1 = p?.handCount ?? count
        const deck = p?.deck ?? 'green'
        for (let i = 0; i < count; i++) {
          const idx = n1 - count + i
          const to = handRect(seat, idx, n1)
          add({ from: deckRect(seat), to, node: <CardBack deck={deck} size={to.w} />, delay: t + i * STAGGER_MS, duration: DRAW_FLY, lift: 30, z: 80 + i })
          hidden.push(`hand-${seat}-${idx}`)
        }
        if (count > 0) sounds.push({ name: 'card-slide', at: t, volume: 0.6 })
        phase()
        break
      }
      case 'turnChanged':
        sounds.push({ name: 'turn-tick', at: Math.max(end, t), volume: 0.5 })
        break
      case 'gameOver':
        sounds.push({ name: 'fanfare', at: Math.max(end, t) })
        break
      default:
        break
    }
  }

  // Keep a busy turn within the cap by compressing the whole timeline evenly.
  if (end > MAX_TURN_MS) {
    const f = MAX_TURN_MS / end
    for (const fl of flyers) {
      fl.delay *= f
      fl.duration *= f
      if (fl.vanishAt != null) fl.vanishAt *= f
    }
    for (const s of sounds) s.at *= f
    end = MAX_TURN_MS
  }
  if (reduced) return { flyers, hidden, sounds, total: Math.min(Math.max(end, 200), 400) }
  return { flyers, hidden, sounds, total: Math.min(Math.max(end, 150), MAX_TURN_MS) }
}

