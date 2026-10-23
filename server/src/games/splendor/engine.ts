import type { ActionResult, GameEvent, GameModule, Rng, SeatInfo } from '../types.js'
import { shuffle } from '../types.js'
import {
  CARDS,
  CARD_BY_ID,
  GEMS,
  NOBLES,
  NOBLE_BY_ID,
  TIERS,
  TOKENS,
  type Gem,
  type GemCounts,
  type Tier,
  type Token,
} from './data.js'

/**
 * Splendor rules engine. Pure and immutable: every function returns new data and never mutates
 * its input. State is plain JSON, randomness comes only from the injected rng, so a game can be
 * replayed from (seed, action log) and simulated headlessly.
 *
 * Names: the engine knows seats, not names. `lastAction` stores structured data; the views turn
 * it into a human summary using the SeatInfo names the platform passes in.
 */

export type TokenCounts = Record<Token, number>
export type TokenDelta = Partial<Record<Token, number>>

export interface ReservedCard {
  id: string
  fromDeck: boolean
}

export interface PlayerState {
  tokens: TokenCounts
  /** Purchased cards, in purchase order. */
  cards: string[]
  reserved: ReservedCard[]
  nobles: string[]
}

export type Pending = null | { kind: 'discard'; over: number } | { kind: 'noble'; options: string[] }

export interface LastAction {
  seat: number
  type: 'take3' | 'take2' | 'reserve' | 'buy' | 'discard' | 'chooseNoble' | 'pass'
  gems?: TokenDelta
  tier?: Tier
  fromDeck?: boolean
  /** Only set for buys (a bought card is public). Never set for reserves. */
  cardId?: string
  goldGained?: boolean
  /** Set when a noble visited at the end of this action. */
  nobleId?: string
}

export interface SplendorResult {
  /** Seats ordered best to worst (points desc, then fewest purchased cards). */
  ranking: number[]
  winners: number[]
}

export interface SplendorState {
  /** Hidden: never sent to any client, only counts are. */
  decks: Record<Tier, string[]>
  /** Four slots per tier; null when the deck ran out. */
  board: Record<Tier, (string | null)[]>
  /** Face-up, unclaimed nobles. */
  nobles: string[]
  bank: TokenCounts
  players: PlayerState[]
  /** Seat whose move it is. */
  turn: number
  firstPlayer: number
  pending: Pending
  endTriggered: boolean
  lastAction: LastAction | null
  result: SplendorResult | null
  /** Completed turns, for stats. */
  turnCount: number
}

export type SplendorAction =
  | { type: 'take3'; gems: Gem[] }
  | { type: 'take2'; gem: Gem }
  | { type: 'reserve'; tier: Tier; slot: number }
  | { type: 'reserve'; tier: Tier; fromDeck: true }
  | { type: 'buy'; source: 'board'; tier: Tier; slot: number }
  | { type: 'buy'; source: 'reserved'; cardId: string }
  | { type: 'discard'; tokens: TokenDelta }
  | { type: 'chooseNoble'; nobleId: string }
  | { type: 'pass' }

// ——— Views ———

export interface PublicPlayer {
  seat: number
  name: string
  color: string | null
  tokens: TokenCounts
  tokenCount: number
  bonuses: Record<Gem, number>
  points: number
  /** Purchased card ids (public — they sit face-up in the tableau). */
  cards: string[]
  cardCount: number
  nobles: string[]
  /** Reserved cards are face-down backs to everyone but the owner: tier only. */
  reserved: { tier: Tier }[]
}

export interface SplendorTableView {
  decks: Record<Tier, number>
  board: Record<Tier, (string | null)[]>
  nobles: string[]
  bank: TokenCounts
  players: PublicPlayer[]
  turn: number
  firstPlayer: number
  /** Kind only (the discard amount / noble options are private to the active seat). */
  pending: null | { kind: 'discard' | 'noble'; seat: number }
  endTriggered: boolean
  lastAction: (LastAction & { summary: string }) | null
  result: SplendorResult | null
  finished: boolean
}

export interface Payment {
  /** Tokens actually spent, by type (gold covers the shortfall). */
  tokens: TokenDelta
  /** Gold needed beyond what the player holds; 0 when affordable. */
  goldShort: number
}

export interface SplendorPlayerView extends SplendorTableView {
  me: number
  isMyTurn: boolean
  /** This seat's reserved cards, face-up. */
  myReserved: { id: string; tier: Tier; fromDeck: boolean }[]
  /** Full pending detail when it's this seat's to resolve. */
  myPending: Pending
  legal: { take3: boolean; take2: boolean; reserve: boolean; buy: boolean; pass: boolean }
  /** Per card on the board and in my reserve: affordable now, and what it would cost me. */
  affordable: Record<string, boolean>
  payments: Record<string, Payment>
  legalActions: SplendorAction[]
}

// ——— Helpers ———

const MAX_TOKENS = 10
const MAX_RESERVED = 3
const WIN_POINTS = 15
const BOARD_SLOTS = 4

function emptyTokens(): TokenCounts {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
}

function cloneState(s: SplendorState): SplendorState {
  return {
    decks: { 1: s.decks[1].slice(), 2: s.decks[2].slice(), 3: s.decks[3].slice() },
    board: { 1: s.board[1].slice(), 2: s.board[2].slice(), 3: s.board[3].slice() },
    nobles: s.nobles.slice(),
    bank: { ...s.bank },
    players: s.players.map((p) => ({
      tokens: { ...p.tokens },
      cards: p.cards.slice(),
      reserved: p.reserved.map((r) => ({ ...r })),
      nobles: p.nobles.slice(),
    })),
    turn: s.turn,
    firstPlayer: s.firstPlayer,
    pending: s.pending
      ? s.pending.kind === 'discard'
        ? { ...s.pending }
        : { kind: 'noble', options: s.pending.options.slice() }
      : null,
    endTriggered: s.endTriggered,
    lastAction: s.lastAction ? { ...s.lastAction, gems: s.lastAction.gems ? { ...s.lastAction.gems } : undefined } : null,
    result: s.result ? { ranking: s.result.ranking.slice(), winners: s.result.winners.slice() } : null,
    turnCount: s.turnCount,
  }
}

export function tokenTotal(t: TokenCounts): number {
  return t.white + t.blue + t.green + t.red + t.black + t.gold
}

export function bonuses(p: PlayerState): Record<Gem, number> {
  const b: Record<Gem, number> = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  for (const id of p.cards) b[CARD_BY_ID[id].bonus]++
  return b
}

export function points(p: PlayerState): number {
  let pts = 0
  for (const id of p.cards) pts += CARD_BY_ID[id].points
  for (const id of p.nobles) pts += NOBLE_BY_ID[id].points
  return pts
}

/** Automatic payment: per color pay max(0, cost - bonus) with that color first, gold covers the rest. */
export function computePayment(p: PlayerState, cardId: string, b: Record<Gem, number> = bonuses(p)): Payment {
  const card = CARD_BY_ID[cardId]
  const tokens: TokenDelta = {}
  let gold = 0
  for (const g of GEMS) {
    const need = Math.max(0, (card.cost[g] ?? 0) - b[g])
    if (need === 0) continue
    const fromColor = Math.min(need, p.tokens[g])
    if (fromColor > 0) tokens[g] = fromColor
    gold += need - fromColor
  }
  const goldUsed = Math.min(gold, p.tokens.gold)
  if (goldUsed > 0) tokens.gold = goldUsed
  return { tokens, goldShort: gold - goldUsed }
}

function meetsNoble(p: PlayerState, nobleId: string): boolean {
  const b = bonuses(p)
  const req = NOBLE_BY_ID[nobleId].requires
  return GEMS.every((g) => b[g] >= (req[g] ?? 0))
}

function isTier(t: unknown): t is Tier {
  return t === 1 || t === 2 || t === 3
}

function isGem(g: unknown): g is Gem {
  return typeof g === 'string' && (GEMS as readonly string[]).includes(g)
}

function availableGemColors(bank: TokenCounts): Gem[] {
  return GEMS.filter((g) => bank[g] > 0)
}

/** Draw the top card of a tier's deck into a board slot (in place on a cloned state). */
function refill(s: SplendorState, tier: Tier, slot: number, events: GameEvent[]): void {
  const next = s.decks[tier].shift()
  s.board[tier][slot] = next ?? null
  if (next) events.push({ type: 'slotRefilled', tier, slot, cardId: next })
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = []
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice())
      return
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i])
      pick(i + 1, acc)
      acc.pop()
    }
  }
  pick(0, [])
  return out
}

/** Every multiset of tokens (bounded by holdings) totalling exactly `over`. */
function discardCombos(held: TokenCounts, over: number): TokenDelta[] {
  const out: TokenDelta[] = []
  const types = TOKENS.filter((t) => held[t] > 0)
  const walk = (i: number, left: number, acc: TokenDelta) => {
    if (left === 0) {
      out.push({ ...acc })
      return
    }
    if (i >= types.length) return
    const t = types[i]
    for (let n = Math.min(left, held[t]); n >= 0; n--) {
      if (n > 0) acc[t] = n
      else delete acc[t]
      walk(i + 1, left - n, acc)
    }
    delete acc[t]
  }
  walk(0, over, {})
  return out
}

function ranking(s: SplendorState): SplendorResult {
  const seats = s.players.map((_, i) => i)
  const score = (i: number) => points(s.players[i])
  const cards = (i: number) => s.players[i].cards.length
  seats.sort((a, b) => score(b) - score(a) || cards(a) - cards(b) || a - b)
  const best = seats[0]
  const winners = seats.filter((i) => score(i) === score(best) && cards(i) === cards(best))
  return { ranking: seats, winners: winners.slice().sort((a, b) => a - b) }
}

// ——— Turn flow ———

/** After the main action (or a discard): token limit, then nobles, then end of turn. */
function continueTurn(s: SplendorState, seat: number, events: GameEvent[]): void {
  const p = s.players[seat]
  const total = tokenTotal(p.tokens)
  if (total > MAX_TOKENS) {
    s.pending = { kind: 'discard', over: total - MAX_TOKENS }
    return
  }
  const eligible = s.nobles.filter((n) => meetsNoble(p, n))
  if (eligible.length > 1) {
    s.pending = { kind: 'noble', options: eligible }
    return
  }
  if (eligible.length === 1) awardNoble(s, seat, eligible[0], events)
  endTurn(s, seat, events)
}

function awardNoble(s: SplendorState, seat: number, nobleId: string, events: GameEvent[]): void {
  s.nobles = s.nobles.filter((n) => n !== nobleId)
  s.players[seat].nobles.push(nobleId)
  if (s.lastAction) s.lastAction.nobleId = nobleId
  events.push({ type: 'nobleVisited', seat, nobleId })
}

function endTurn(s: SplendorState, seat: number, events: GameEvent[]): void {
  s.pending = null
  s.turnCount++
  if (!s.endTriggered && points(s.players[seat]) >= WIN_POINTS) {
    s.endTriggered = true
    events.push({ type: 'endTriggered', seat })
  }
  const next = (seat + 1) % s.players.length
  if (s.endTriggered && next === s.firstPlayer) {
    s.result = ranking(s)
    events.push({ type: 'gameOver', winners: s.result.winners, ranking: s.result.ranking })
    return
  }
  s.turn = next
  events.push({ type: 'turnChanged', seat: next })
}

// ——— Legal actions ———

function mainActions(s: SplendorState, seat: number): SplendorAction[] {
  const p = s.players[seat]
  const b = bonuses(p)
  const out: SplendorAction[] = []
  const avail = availableGemColors(s.bank)
  const k = Math.min(3, avail.length)
  if (k > 0) for (const gems of combinations(avail, k)) out.push({ type: 'take3', gems })
  for (const g of GEMS) if (s.bank[g] >= 4) out.push({ type: 'take2', gem: g })
  if (p.reserved.length < MAX_RESERVED) {
    for (const tier of TIERS) {
      s.board[tier].forEach((id, slot) => {
        if (id) out.push({ type: 'reserve', tier, slot })
      })
      if (s.decks[tier].length > 0) out.push({ type: 'reserve', tier, fromDeck: true })
    }
  }
  for (const tier of TIERS) {
    s.board[tier].forEach((id, slot) => {
      if (id && computePayment(p, id, b).goldShort === 0) out.push({ type: 'buy', source: 'board', tier, slot })
    })
  }
  for (const r of p.reserved) {
    if (computePayment(p, r.id, b).goldShort === 0) out.push({ type: 'buy', source: 'reserved', cardId: r.id })
  }
  return out
}

export function legalActions(s: SplendorState, seat: number): SplendorAction[] {
  if (s.result || seat !== s.turn) return []
  if (s.pending?.kind === 'discard') {
    return discardCombos(s.players[seat].tokens, s.pending.over).map((tokens) => ({ type: 'discard', tokens }))
  }
  if (s.pending?.kind === 'noble') return s.pending.options.map((nobleId) => ({ type: 'chooseNoble', nobleId }))
  const main = mainActions(s, seat)
  return main.length > 0 ? main : [{ type: 'pass' }]
}

// ——— Setup ———

export function setup(players: SeatInfo[], rng: Rng): { state: SplendorState; events: GameEvent[] } {
  const n = players.length
  if (n < 2 || n > 4) throw new Error('Splendor needs 2–4 players')
  const perGem = n === 2 ? 4 : n === 3 ? 5 : 7
  const decks = {
    1: shuffle(CARDS.filter((c) => c.tier === 1).map((c) => c.id), rng),
    2: shuffle(CARDS.filter((c) => c.tier === 2).map((c) => c.id), rng),
    3: shuffle(CARDS.filter((c) => c.tier === 3).map((c) => c.id), rng),
  } as Record<Tier, string[]>
  const board = {
    1: decks[1].splice(0, BOARD_SLOTS),
    2: decks[2].splice(0, BOARD_SLOTS),
    3: decks[3].splice(0, BOARD_SLOTS),
  } as Record<Tier, (string | null)[]>
  const nobles = shuffle(NOBLES.map((x) => x.id), rng).slice(0, n + 1)
  const firstPlayer = Math.floor(rng() * n)
  const state: SplendorState = {
    decks,
    board,
    nobles,
    bank: { white: perGem, blue: perGem, green: perGem, red: perGem, black: perGem, gold: 5 },
    players: Array.from({ length: n }, () => ({ tokens: emptyTokens(), cards: [], reserved: [], nobles: [] })),
    turn: firstPlayer,
    firstPlayer,
    pending: null,
    endTriggered: false,
    lastAction: null,
    result: null,
    turnCount: 0,
  }
  return { state, events: [{ type: 'gameStarted', firstPlayer }] }
}

// ——— Apply ———

function fail(error: string): ActionResult<SplendorState> {
  return { ok: false, error }
}

export function applyAction(
  state: SplendorState,
  seat: number,
  action: SplendorAction,
  _rng: Rng
): ActionResult<SplendorState> {
  if (state.result) return fail('The game is over')
  if (seat !== state.turn) return fail("It's not your turn")
  if (!action || typeof action !== 'object') return fail('Invalid action')
  const s = cloneState(state)
  const p = s.players[seat]
  const events: GameEvent[] = []

  // Pending steps must be resolved before anything else.
  if (s.pending?.kind === 'discard') {
    if (action.type !== 'discard') return fail('Return tokens down to 10 first')
    const give = action.tokens ?? {}
    let total = 0
    for (const [t, n] of Object.entries(give)) {
      if (!(TOKENS as readonly string[]).includes(t) || !Number.isInteger(n) || (n as number) < 0) return fail('Invalid tokens')
      if ((n as number) > p.tokens[t as Token]) return fail("You don't have those tokens")
      total += n as number
    }
    if (total !== s.pending.over) return fail(`Return exactly ${s.pending.over} token${s.pending.over === 1 ? '' : 's'}`)
    const returned: TokenDelta = {}
    for (const [t, n] of Object.entries(give)) {
      if (!n) continue
      p.tokens[t as Token] -= n
      s.bank[t as Token] += n
      returned[t as Token] = n
    }
    s.pending = null
    events.push({ type: 'gemsReturned', seat, gems: returned })
    continueTurn(s, seat, events)
    return { ok: true, state: s, events }
  }
  if (s.pending?.kind === 'noble') {
    if (action.type !== 'chooseNoble') return fail('Choose which noble visits you first')
    if (!s.pending.options.includes(action.nobleId)) return fail("That noble can't visit you")
    awardNoble(s, seat, action.nobleId, events)
    endTurn(s, seat, events)
    return { ok: true, state: s, events }
  }

  switch (action.type) {
    case 'take3': {
      const gems = action.gems
      if (!Array.isArray(gems) || !gems.every(isGem)) return fail('Invalid gems')
      if (new Set(gems).size !== gems.length) return fail('Gems must be different colors')
      if (gems.some((g) => s.bank[g] < 1)) return fail('That pile is empty')
      const need = Math.min(3, availableGemColors(s.bank).length)
      if (gems.length !== need || need === 0) {
        return fail(need === 3 ? 'Take 3 different gems' : `Take ${need} different gems (only ${need} colors left)`)
      }
      const taken: TokenDelta = {}
      for (const g of gems) {
        s.bank[g]--
        p.tokens[g]++
        taken[g] = 1
      }
      s.lastAction = { seat, type: 'take3', gems: taken }
      events.push({ type: 'gemsTaken', seat, gems: taken })
      break
    }
    case 'take2': {
      if (!isGem(action.gem)) return fail('Invalid gem')
      if (s.bank[action.gem] < 4) return fail('You can only take 2 when at least 4 are left')
      s.bank[action.gem] -= 2
      p.tokens[action.gem] += 2
      const taken: TokenDelta = { [action.gem]: 2 }
      s.lastAction = { seat, type: 'take2', gems: taken }
      events.push({ type: 'gemsTaken', seat, gems: taken })
      break
    }
    case 'reserve': {
      if (!isTier(action.tier)) return fail('Invalid tier')
      if (p.reserved.length >= MAX_RESERVED) return fail('You already have 3 reserved cards')
      const tier = action.tier
      if ('fromDeck' in action && action.fromDeck) {
        const id = s.decks[tier].shift()
        if (!id) return fail('That deck is empty')
        p.reserved.push({ id, fromDeck: true })
        events.push({ type: 'cardReserved', seat, from: 'deck', tier })
      } else {
        const slot = (action as { slot: number }).slot
        if (!Number.isInteger(slot) || slot < 0 || slot >= BOARD_SLOTS) return fail('Invalid slot')
        const id = s.board[tier][slot]
        if (!id) return fail('That slot is empty')
        p.reserved.push({ id, fromDeck: false })
        events.push({ type: 'cardReserved', seat, from: 'board', tier, slot })
        refill(s, tier, slot, events)
      }
      const gotGold = s.bank.gold > 0
      if (gotGold) {
        s.bank.gold--
        p.tokens.gold++
        events.push({ type: 'goldGained', seat })
      }
      s.lastAction = { seat, type: 'reserve', tier, fromDeck: 'fromDeck' in action && !!action.fromDeck, goldGained: gotGold }
      break
    }
    case 'buy': {
      let cardId: string
      let tier: Tier
      let slot: number | undefined
      if (action.source === 'board') {
        if (!isTier(action.tier)) return fail('Invalid tier')
        if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= BOARD_SLOTS) return fail('Invalid slot')
        const id = s.board[action.tier][action.slot]
        if (!id) return fail('That slot is empty')
        cardId = id
        tier = action.tier
        slot = action.slot
      } else if (action.source === 'reserved') {
        const r = p.reserved.find((x) => x.id === action.cardId)
        if (!r) return fail("That card isn't in your reserve")
        cardId = r.id
        tier = CARD_BY_ID[cardId].tier
      } else {
        return fail('Invalid card source')
      }
      const pay = computePayment(p, cardId)
      if (pay.goldShort > 0) return fail("You can't afford that card")
      for (const [t, n] of Object.entries(pay.tokens)) {
        p.tokens[t as Token] -= n as number
        s.bank[t as Token] += n as number
      }
      p.cards.push(cardId)
      if (action.source === 'board') {
        events.push({ type: 'cardBought', seat, from: 'board', tier, slot, cardId, paid: pay.tokens })
        refill(s, tier, slot!, events)
      } else {
        p.reserved = p.reserved.filter((x) => x.id !== cardId)
        events.push({ type: 'cardBought', seat, from: 'reserved', tier, cardId, paid: pay.tokens })
      }
      s.lastAction = { seat, type: 'buy', tier, cardId, gems: pay.tokens }
      break
    }
    case 'pass': {
      if (mainActions(s, seat).length > 0) return fail('You can only pass when no other action is possible')
      s.lastAction = { seat, type: 'pass' }
      events.push({ type: 'passed', seat })
      break
    }
    case 'discard':
      return fail('You have nothing to return')
    case 'chooseNoble':
      return fail('No noble is choosing you right now')
    default:
      return fail('Unknown action')
  }

  continueTurn(s, seat, events)
  return { ok: true, state: s, events }
}

// ——— Views ———

function seatName(players: SeatInfo[], seat: number): string {
  return players.find((p) => p.playerOrder === seat)?.screenName ?? `Player ${seat + 1}`
}

const GEM_NAMES: Record<Token, string> = {
  white: 'diamond',
  blue: 'sapphire',
  green: 'emerald',
  red: 'ruby',
  black: 'onyx',
  gold: 'gold',
}

function describeTokens(t: TokenDelta | undefined): string {
  if (!t) return ''
  return Object.entries(t)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${GEM_NAMES[k as Token]}`)
    .join(', ')
}

export function summarize(a: LastAction, players: SeatInfo[]): string {
  const who = seatName(players, a.seat)
  let text: string
  switch (a.type) {
    case 'take3':
    case 'take2':
      text = `${who} took ${describeTokens(a.gems)}`
      break
    case 'reserve':
      text = `${who} reserved a tier ${a.tier} card${a.fromDeck ? ' from the deck' : ''}${a.goldGained ? ' and took a gold' : ''}`
      break
    case 'buy': {
      const c = a.cardId ? CARD_BY_ID[a.cardId] : null
      text = c ? `${who} bought a ${GEM_NAMES[c.bonus]} card${c.points ? ` (+${c.points})` : ''}` : `${who} bought a card`
      break
    }
    case 'discard':
      text = `${who} returned ${describeTokens(a.gems)}`
      break
    case 'chooseNoble':
      text = `${who} chose a noble`
      break
    default:
      text = `${who} passed`
  }
  if (a.nobleId) text += ' — a noble visits!'
  return text
}

export function tableView(s: SplendorState, players: SeatInfo[]): SplendorTableView {
  return {
    decks: { 1: s.decks[1].length, 2: s.decks[2].length, 3: s.decks[3].length },
    board: { 1: s.board[1].slice(), 2: s.board[2].slice(), 3: s.board[3].slice() },
    nobles: s.nobles.slice(),
    bank: { ...s.bank },
    players: s.players.map((p, seat) => {
      const info = players.find((x) => x.playerOrder === seat)
      return {
        seat,
        name: info?.screenName ?? `Player ${seat + 1}`,
        color: info?.color ?? null,
        tokens: { ...p.tokens },
        tokenCount: tokenTotal(p.tokens),
        bonuses: bonuses(p),
        points: points(p),
        cards: p.cards.slice(),
        cardCount: p.cards.length,
        nobles: p.nobles.slice(),
        reserved: p.reserved.map((r) => ({ tier: CARD_BY_ID[r.id].tier })),
      }
    }),
    turn: s.turn,
    firstPlayer: s.firstPlayer,
    pending: s.pending ? { kind: s.pending.kind, seat: s.turn } : null,
    endTriggered: s.endTriggered,
    lastAction: s.lastAction ? { ...s.lastAction, summary: summarize(s.lastAction, players) } : null,
    result: s.result ? { ranking: s.result.ranking.slice(), winners: s.result.winners.slice() } : null,
    finished: !!s.result,
  }
}

export function playerView(s: SplendorState, seat: number, players: SeatInfo[]): SplendorPlayerView {
  const base = tableView(s, players)
  const p = s.players[seat]
  const isMyTurn = !s.result && s.turn === seat
  const legal = isMyTurn ? legalActions(s, seat) : []
  const affordable: Record<string, boolean> = {}
  const payments: Record<string, Payment> = {}
  if (p) {
    const b = bonuses(p)
    const ids = [...TIERS.flatMap((t) => s.board[t]), ...p.reserved.map((r) => r.id)]
    for (const id of ids) {
      if (!id) continue
      const pay = computePayment(p, id, b)
      payments[id] = pay
      affordable[id] = pay.goldShort === 0
    }
  }
  const has = (t: SplendorAction['type']) => legal.some((a) => a.type === t)
  return {
    ...base,
    me: seat,
    isMyTurn,
    myReserved: p ? p.reserved.map((r) => ({ id: r.id, tier: CARD_BY_ID[r.id].tier, fromDeck: r.fromDeck })) : [],
    myPending: isMyTurn ? s.pending : null,
    legal: { take3: has('take3'), take2: has('take2'), reserve: has('reserve'), buy: has('buy'), pass: has('pass') },
    affordable,
    payments,
    legalActions: legal,
  }
}

export const splendorModule: GameModule<SplendorState, SplendorAction> = {
  slug: 'splendor',
  name: 'Splendor',
  minPlayers: 2,
  maxPlayers: 4,
  setup: (players, rng) => setup(players, rng),
  applyAction,
  tableView,
  playerView,
  isFinished: (s) => !!s.result,
  activeSeats: (s) => (s.result ? [] : [s.turn]),
  legalActions,
  winners: (s) => (s.result ? s.result.winners.slice() : []),
}
