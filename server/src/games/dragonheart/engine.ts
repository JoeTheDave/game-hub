import type { ActionResult, GameEvent, GameModule, Rng, SeatInfo } from '../types.js'
import { shuffle } from '../types.js'
import {
  ARROWS,
  CAPACITY,
  CARD_BY_ID,
  DECK_COLORS,
  GREAT_DRAGON_POINTS,
  GREEN_DECK,
  HAND_SIZE,
  HAND_SIZE_WITH_DRAGON,
  KIND_NAMES,
  RED_DECK,
  SHIP_STACKS_TO_END,
  SPACES,
  type DeckColor,
  type Kind,
  type Space,
} from './data.js'

/**
 * Dragonheart rules engine (2 players). Pure: JSON-only state, randomness only from the
 * injected Rng, never mutates its input. Card arrays are ordered bottom → top, so the last
 * element of a space/pile is its visible top card; a draw deck's top card is index 0.
 */

export type CardId = string
export type Seat = 0 | 1

export interface PlayerState {
  /** Draw deck, top card first. Hidden from everyone. */
  deck: CardId[]
  /** Hand. Visible only to its owner. */
  hand: CardId[]
  /** Face-down score pile. Visible only to its owner (until the game ends). */
  score: CardId[]
}

/** Where a collection came from: a board space or the Knight/Huntress pile below the Ship. */
export type CollectSource = Space | 'belowShip'

export interface LastPlay {
  seat: Seat
  type: 'play' | 'pass'
  space?: Space
  /** The played cards (public: they're revealed as they're played). */
  cardIds?: CardId[]
  collected?: { from: CollectSource; count: number }[]
  tookDragon?: boolean
}

export interface DragonheartState {
  players: PlayerState[]
  /** Cards on each board space, bottom → top. */
  spaces: Record<Space, CardId[]>
  /** Knights and Huntresses waiting below the Ship space (a face-up stack). */
  belowShip: CardId[]
  /** Completed stacks of three Ships beside the board (face-up; they score for no one). */
  shipStacks: CardId[][]
  /** Who holds the Great Dragon figure ('board' until someone takes a Petrified Dragon card). */
  greatDragon: 'board' | Seat
  turn: Seat
  firstPlayer: Seat
  /** When set, the game ends once this seat's turn is over (the opponent's final turn). */
  endAfterSeat: Seat | null
  lastPlay: LastPlay | null
  result: { scores: number[]; winners: number[] } | null
  turnCount: number
}

export type DragonheartAction =
  | { type: 'play'; cardIds: CardId[]; collect?: Space }
  | { type: 'pass' }

// ─── helpers ──────────────────────────────────────────────────────────────────────────────

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0)

export function handMax(s: DragonheartState, seat: Seat): number {
  return s.greatDragon === seat ? HAND_SIZE_WITH_DRAGON : HAND_SIZE
}

export function pileValue(cards: readonly CardId[]): number {
  return cards.reduce((a, id) => a + (CARD_BY_ID[id]?.points ?? 0), 0)
}

export function scoreFor(s: DragonheartState, seat: Seat): number {
  return pileValue(s.players[seat].score) + (s.greatDragon === seat ? GREAT_DRAGON_POINTS : 0)
}

/** Room left on a capacity space (Infinity for an unlimited stack space). */
export function roomOn(s: DragonheartState, space: Space): number {
  const cap = CAPACITY[space]
  return cap === 0 ? Infinity : cap - s.spaces[space].length
}

function cloneState(s: DragonheartState): DragonheartState {
  return {
    ...s,
    players: s.players.map((p) => ({ deck: p.deck.slice(), hand: p.hand.slice(), score: p.score.slice() })),
    spaces: Object.fromEntries(SPACES.map((sp) => [sp, s.spaces[sp].slice()])) as Record<Space, CardId[]>,
    belowShip: s.belowShip.slice(),
    shipStacks: s.shipStacks.map((st) => st.slice()),
    lastPlay: s.lastPlay ? { ...s.lastPlay } : null,
    result: s.result ? { scores: s.result.scores.slice(), winners: s.result.winners.slice() } : null,
  }
}

/** The collection targets an activated space may choose between, and which of them have cards. */
function collectTargets(s: DragonheartState, space: Space): Space[] {
  return (ARROWS[space] ?? []).filter((t) => s.spaces[t].length > 0)
}

/** Whether playing `n` cards to `space` activates its effect. */
function activates(s: DragonheartState, space: Space, n: number): boolean {
  const cap = CAPACITY[space]
  if (cap === 0) return space === 'fireDragon' || space === 'sorceress' || space === 'troll'
  // Capacity spaces fire when this play fills the last outline.
  return s.spaces[space].length + n === cap
}

// ─── setup ────────────────────────────────────────────────────────────────────────────────

function setup(players: SeatInfo[], rng: Rng): { state: DragonheartState; events: GameEvent[] } {
  if (players.length !== 2) throw new Error('Dragonheart is for exactly 2 players')
  const decks = [shuffle(GREEN_DECK.map((c) => c.id), rng), shuffle(RED_DECK.map((c) => c.id), rng)]
  const ps: PlayerState[] = decks.map((d) => ({ deck: d.slice(HAND_SIZE), hand: d.slice(0, HAND_SIZE), score: [] }))
  const firstPlayer: Seat = rng() < 0.5 ? 0 : 1
  const state: DragonheartState = {
    players: ps,
    spaces: Object.fromEntries(SPACES.map((sp) => [sp, []])) as unknown as Record<Space, CardId[]>,
    belowShip: [],
    shipStacks: [],
    greatDragon: 'board',
    turn: firstPlayer,
    firstPlayer,
    endAfterSeat: null,
    lastPlay: null,
    result: null,
    turnCount: 0,
  }
  return { state, events: [{ type: 'gameStarted', firstPlayer }] }
}

// ─── action validation ────────────────────────────────────────────────────────────────────

type Parsed = { ok: true; action: DragonheartAction } | { ok: false; error: string }

function parseAction(raw: unknown): Parsed {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid action' }
  const a = raw as Record<string, unknown>
  if (a.type === 'pass') return { ok: true, action: { type: 'pass' } }
  if (a.type !== 'play') return { ok: false, error: 'Unknown action' }
  if (!Array.isArray(a.cardIds) || a.cardIds.length === 0) return { ok: false, error: 'Play at least one card' }
  if (!a.cardIds.every((x) => typeof x === 'string')) return { ok: false, error: 'Invalid cards' }
  const cardIds = a.cardIds as string[]
  if (new Set(cardIds).size !== cardIds.length) return { ok: false, error: 'Each card can only be played once' }
  if (a.collect !== undefined && (typeof a.collect !== 'string' || !(SPACES as readonly string[]).includes(a.collect))) {
    return { ok: false, error: 'Invalid collect choice' }
  }
  return { ok: true, action: { type: 'play', cardIds: cardIds.slice(), collect: a.collect as Space | undefined } }
}

// ─── applying a play ──────────────────────────────────────────────────────────────────────

interface PlayOutcome {
  state: DragonheartState
  events: GameEvent[]
  collected: { from: CollectSource; count: number }[]
  tookDragon: boolean
}

/** Validate and resolve one play (Play + Collect steps), without the Draw step or turn change. */
function resolvePlay(
  s0: DragonheartState,
  seat: Seat,
  action: { cardIds: CardId[]; collect?: Space },
  rng: Rng
): { ok: true; out: PlayOutcome } | { ok: false; error: string } {
  const me = s0.players[seat]
  for (const id of action.cardIds) if (!me.hand.includes(id)) return { ok: false, error: "That card isn't in your hand" }
  const kinds = new Set(action.cardIds.map((id) => CARD_BY_ID[id].kind))
  if (kinds.size !== 1) return { ok: false, error: 'All played cards must have the same picture' }
  const space = [...kinds][0] as Kind as Space
  const n = action.cardIds.length
  if (n > roomOn(s0, space)) return { ok: false, error: `There isn't room for that many cards on the ${KIND_NAMES[space]}` }

  const fires = activates(s0, space, n)
  const targets = fires ? collectTargets(s0, space) : []
  const choosing = space === 'sorceress' || space === 'knight'
  let target: Space | null = null
  if (fires && choosing) {
    if (targets.length === 2) {
      if (!action.collect || !targets.includes(action.collect)) {
        return { ok: false, error: `Choose which space to collect from: ${targets.map((t) => KIND_NAMES[t]).join(' or ')}` }
      }
      target = action.collect
    } else if (targets.length === 1) {
      if (action.collect !== undefined && action.collect !== targets[0]) return { ok: false, error: 'There are no cards to collect there' }
      target = targets[0]
    } else if (action.collect !== undefined) {
      return { ok: false, error: 'There are no cards to collect' }
    }
  } else if (action.collect !== undefined) {
    return { ok: false, error: "This play doesn't let you choose where to collect from" }
  }

  const s = cloneState(s0)
  const p = s.players[seat]
  const events: GameEvent[] = []
  const collected: { from: CollectSource; count: number }[] = []
  let tookDragon = false

  // 1. Play Cards
  p.hand = p.hand.filter((id) => !action.cardIds.includes(id))
  s.spaces[space].push(...action.cardIds)
  events.push({ type: 'cardsPlayed', seat, space, cardIds: action.cardIds.slice() })

  // 2. Collect Cards
  const take = (from: CollectSource) => {
    const pile = from === 'belowShip' ? s.belowShip : s.spaces[from]
    if (pile.length === 0) return
    // Only what was face-up and visible may be named: every card on a capacity space, the top of a stack.
    const visibleIds = from !== 'belowShip' && CAPACITY[from] > 0 ? pile.slice() : [pile[pile.length - 1]]
    p.score.push(...pile)
    collected.push({ from, count: pile.length })
    events.push({ type: 'cardsCollected', seat, from, count: pile.length, visibleIds })
    if (from === 'belowShip') s.belowShip = []
    else s.spaces[from] = []
  }

  if (fires) {
    switch (space) {
      case 'fireDragon':
        take('treasure')
        break
      case 'troll':
        take('sorceress')
        break
      case 'sorceress':
        if (target) {
          const hadPetrified = target === 'petrified' && s.spaces.petrified.length > 0
          take(target)
          if (hadPetrified && s.greatDragon !== seat) {
            const from = s.greatDragon
            s.greatDragon = seat
            tookDragon = true
            events.push({ type: 'greatDragonMoved', from, to: seat })
            if (from !== 'board') {
              // The opponent's hand size drops back to five: a random card goes on top of their deck.
              const opp = s.players[from]
              if (opp.hand.length > HAND_SIZE) {
                const i = Math.floor(rng() * opp.hand.length)
                const [card] = opp.hand.splice(i, 1)
                opp.deck.unshift(card)
                events.push({ type: 'cardReturnedToDeck', seat: from })
              }
            }
          }
        }
        break
      case 'knight':
        if (target) take(target)
        s.belowShip.push(...s.spaces.knight)
        events.push({ type: 'movedBelowShip', from: 'knight', cardIds: s.spaces.knight.slice() })
        s.spaces.knight = []
        break
      case 'huntress':
        take('fireDragon')
        s.belowShip.push(...s.spaces.huntress)
        events.push({ type: 'movedBelowShip', from: 'huntress', cardIds: s.spaces.huntress.slice() })
        s.spaces.huntress = []
        break
      case 'dwarf':
        take('dwarf')
        break
      case 'ship': {
        take('belowShip')
        const stack = s.spaces.ship.slice()
        s.spaces.ship = []
        s.shipStacks.push(stack)
        events.push({ type: 'shipStackFormed', index: s.shipStacks.length - 1, cardIds: stack })
        break
      }
      default:
        break
    }
  }

  return { ok: true, out: { state: s, events, collected, tookDragon } }
}

/** Draw step, end triggers and turn change. Mutates `s` (a fresh clone owned by the caller). */
function finishTurn(s: DragonheartState, seat: Seat, events: GameEvent[]) {
  const p = s.players[seat]
  const need = Math.max(0, handMax(s, seat) - p.hand.length)
  let triggered = false
  if (need > 0) {
    if (p.deck.length === 0) {
      triggered = true // unable to draw any cards: this is the player's final turn
    } else {
      const drawn = p.deck.splice(0, need)
      p.hand.push(...drawn)
      events.push({ type: 'cardsDrawn', seat, count: drawn.length })
    }
  }
  if (s.shipStacks.length >= SHIP_STACKS_TO_END) triggered = true

  s.turnCount += 1
  if (s.endAfterSeat === seat) {
    finishGame(s, events)
    return
  }
  if (triggered && s.endAfterSeat === null) {
    s.endAfterSeat = other(seat)
    events.push({ type: 'finalTurn', seat: other(seat) })
  }
  s.turn = other(seat)
  events.push({ type: 'turnChanged', seat: s.turn })
}

function finishGame(s: DragonheartState, events: GameEvent[]) {
  const scores = [scoreFor(s, 0), scoreFor(s, 1)]
  const best = Math.max(...scores)
  let winners = [0, 1].filter((i) => scores[i] === best)
  if (winners.length > 1 && s.greatDragon !== 'board') winners = [s.greatDragon]
  s.result = { scores, winners }
  events.push({ type: 'gameOver', scores, winners })
}

function applyAction(s0: DragonheartState, seat: number, raw: DragonheartAction, rng: Rng): ActionResult<DragonheartState> {
  if (s0.result) return { ok: false, error: 'The game is over' }
  if (seat !== s0.turn) return { ok: false, error: "It isn't your turn" }
  const parsed = parseAction(raw)
  if (!parsed.ok) return parsed
  const action = parsed.action
  const me = seat as Seat

  if (action.type === 'pass') {
    if (s0.players[me].hand.length > 0) return { ok: false, error: 'You must play at least one card' }
    const s = cloneState(s0)
    const events: GameEvent[] = [{ type: 'passed', seat: me }]
    s.lastPlay = { seat: me, type: 'pass' }
    finishTurn(s, me, events)
    return { ok: true, state: s, events }
  }

  const res = resolvePlay(s0, me, action, rng)
  if (!res.ok) return res
  const { state: s, events, collected, tookDragon } = res.out
  s.lastPlay = {
    seat: me,
    type: 'play',
    space: CARD_BY_ID[action.cardIds[0]].kind,
    cardIds: action.cardIds.slice(),
    collected,
    tookDragon,
  }
  finishTurn(s, me, events)
  return { ok: true, state: s, events }
}

// ─── legal actions + previews ─────────────────────────────────────────────────────────────

export interface PlayPreview {
  space: Space
  count: number
  /** What the play collects into the score pile. */
  collects: { from: CollectSource; count: number }[]
  takesDragon: boolean
  /** Knights/Huntresses move below the Ship. */
  movesBelowShip: boolean
  /** Three Ships leave the board as a stack (and how many stacks that makes). */
  shipStack: number | null
}

export interface PlayOption {
  action: DragonheartAction
  preview: PlayPreview | null
}

/** Every distinct play: per kind, every value multiset that fits, × each collect choice. */
export function legalActions(s: DragonheartState, seat: number): DragonheartAction[] {
  if (s.result || seat !== s.turn) return []
  const hand = s.players[seat].hand
  if (hand.length === 0) return [{ type: 'pass' }]
  const out: DragonheartAction[] = []
  const byKind = new Map<Kind, CardId[]>()
  for (const id of hand) {
    const k = CARD_BY_ID[id].kind
    byKind.set(k, [...(byKind.get(k) ?? []), id])
  }
  for (const [kind, ids] of byKind) {
    const space = kind as Space
    const room = Math.min(ids.length, roomOn(s, space))
    if (room <= 0) continue
    // group by value; choose how many of each value to play
    const byValue = new Map<number, CardId[]>()
    for (const id of ids) {
      const v = CARD_BY_ID[id].points
      byValue.set(v, [...(byValue.get(v) ?? []), id])
    }
    const groups = [...byValue.values()]
    const picks: CardId[][] = []
    const walk = (gi: number, acc: CardId[]) => {
      if (gi === groups.length) {
        if (acc.length >= 1 && acc.length <= room) picks.push(acc)
        return
      }
      for (let k = 0; k <= groups[gi].length && acc.length + k <= room; k++) walk(gi + 1, [...acc, ...groups[gi].slice(0, k)])
    }
    walk(0, [])
    for (const cardIds of picks) {
      const fires = activates(s, space, cardIds.length)
      const targets = fires ? collectTargets(s, space) : []
      if (fires && (space === 'sorceress' || space === 'knight') && targets.length === 2) {
        for (const t of targets) out.push({ type: 'play', cardIds, collect: t })
      } else {
        out.push({ type: 'play', cardIds })
      }
    }
  }
  return out
}

/** What a legal play would do (no randomness matters here: a steal only moves a hidden card). */
export function previewPlay(s: DragonheartState, seat: Seat, action: DragonheartAction): PlayPreview | null {
  if (action.type !== 'play') return null
  const res = resolvePlay(s, seat, action, () => 0)
  if (!res.ok) return null
  const space = CARD_BY_ID[action.cardIds[0]].kind as Space
  const evs = res.out.events
  const ship = evs.find((e) => e.type === 'shipStackFormed') as { index: number } | undefined
  return {
    space,
    count: action.cardIds.length,
    collects: res.out.collected,
    takesDragon: res.out.tookDragon,
    movesBelowShip: evs.some((e) => e.type === 'movedBelowShip'),
    shipStack: ship ? ship.index + 1 : null,
  }
}

// ─── views ────────────────────────────────────────────────────────────────────────────────

export interface SpaceView {
  /** How many cards are there (shown on the TV's stack tag, and drives stack thickness). */
  count: number
  /**
   * Total points of the cards there. Every card's value is announced when it is played, so this
   * is a public memory aid (spec 1793038854620, iteration 1) — not a peek at hidden cards.
   */
  points: number
  /** Cards that are face-up and visible: all of them on a capacity space, only the top of a stack. */
  visible: CardId[]
}

export interface PublicPlayer {
  seat: Seat
  name: string
  color: string | null
  deck: DeckColor
  handCount: number
  deckCount: number
  scoreCount: number
  handMax: number
  hasDragon: boolean
}

export interface DragonheartTableView {
  spaces: Record<Space, SpaceView>
  belowShip: SpaceView
  shipStacks: CardId[][]
  greatDragon: 'board' | Seat
  players: PublicPlayer[]
  turn: Seat
  firstPlayer: Seat
  /** The seat whose turn is the last one, once the end has been triggered. */
  endAfterSeat: Seat | null
  /** True while the current turn is the game's final turn. */
  finalTurn: boolean
  lastPlay: (LastPlay & { summary: string }) | null
  /** On finish: scores, winners and both score piles (now revealed). */
  result: { scores: number[]; winners: number[]; scorePiles: CardId[][] } | null
  finished: boolean
}

export interface DragonheartPlayerView extends DragonheartTableView {
  me: Seat
  isMyTurn: boolean
  hand: CardId[]
  handMax: number
  scorePile: CardId[]
  /** Points in my score pile (excluding the Great Dragon's +3). */
  scorePileValue: number
  legalActions: DragonheartAction[]
  /** One per legal action, with a preview of what it would do. */
  options: PlayOption[]
}

const nameOf = (players: SeatInfo[], seat: number) =>
  players.find((p) => p.playerOrder === seat)?.screenName ?? `Player ${seat + 1}`

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function summarize(lp: LastPlay, players: SeatInfo[]): string {
  const who = nameOf(players, lp.seat)
  if (lp.type === 'pass') return `${who} passed`
  const kind = lp.space ? KIND_NAMES[lp.space] : 'card'
  let text = `${who} played ${plural(lp.cardIds?.length ?? 0, kind)}`
  const got = (lp.collected ?? []).reduce((a, c) => a + c.count, 0)
  if (got > 0) text += ` and collected ${plural(got, 'card')}`
  if (lp.tookDragon) text += ', taking the Great Dragon'
  return text
}

function spaceView(cards: CardId[], capacity: number): SpaceView {
  return {
    count: cards.length,
    points: pileValue(cards),
    visible: capacity > 0 ? cards.slice() : cards.length ? [cards[cards.length - 1]] : [],
  }
}

export function tableView(s: DragonheartState, players: SeatInfo[]): DragonheartTableView {
  const seatInfo = (seat: number) => players.find((p) => p.playerOrder === seat)
  return {
    spaces: Object.fromEntries(SPACES.map((sp) => [sp, spaceView(s.spaces[sp], CAPACITY[sp])])) as Record<Space, SpaceView>,
    belowShip: spaceView(s.belowShip, 0),
    shipStacks: s.shipStacks.map((st) => st.slice()),
    greatDragon: s.greatDragon,
    players: s.players.map((p, i) => ({
      seat: i as Seat,
      name: nameOf(players, i),
      color: seatInfo(i)?.color ?? null,
      deck: DECK_COLORS[i],
      handCount: p.hand.length,
      deckCount: p.deck.length,
      scoreCount: p.score.length,
      handMax: handMax(s, i as Seat),
      hasDragon: s.greatDragon === i,
    })),
    turn: s.turn,
    firstPlayer: s.firstPlayer,
    endAfterSeat: s.endAfterSeat,
    finalTurn: !s.result && s.endAfterSeat === s.turn,
    lastPlay: s.lastPlay ? { ...s.lastPlay, summary: summarize(s.lastPlay, players) } : null,
    result: s.result
      ? { scores: s.result.scores.slice(), winners: s.result.winners.slice(), scorePiles: s.players.map((p) => p.score.slice()) }
      : null,
    finished: !!s.result,
  }
}

export function playerView(s: DragonheartState, seat: number, players: SeatInfo[]): DragonheartPlayerView {
  const base = tableView(s, players)
  const me = (seat === 1 ? 1 : 0) as Seat
  const p = s.players[me]
  const legal = legalActions(s, seat)
  return {
    ...base,
    me,
    isMyTurn: !s.result && s.turn === seat,
    hand: p.hand.slice(),
    handMax: handMax(s, me),
    scorePile: p.score.slice(),
    scorePileValue: pileValue(p.score),
    legalActions: legal,
    options: legal.map((action) => ({ action, preview: previewPlay(s, me, action) })),
  }
}

export const dragonheartModule: GameModule<DragonheartState, DragonheartAction> = {
  slug: 'dragonheart',
  name: 'Dragonheart',
  minPlayers: 2,
  maxPlayers: 2,
  setup: (players, rng) => setup(players, rng),
  applyAction,
  tableView,
  playerView,
  isFinished: (s) => !!s.result,
  activeSeats: (s) => (s.result ? [] : [s.turn]),
  legalActions,
  winners: (s) => (s.result ? s.result.winners.slice() : []),
}
