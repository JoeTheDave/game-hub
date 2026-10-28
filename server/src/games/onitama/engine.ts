import type { GameEvent, GameModule, GameOption, GameSummary, Rng, SeatInfo, ActionResult } from '../types.js'
import { resolveOptions, shuffle } from '../types.js'
import { BASE_CARDS, CARDS, CARD_BY_ID, HOME_ROW, PLY_CAP, SIZE, TEMPLE, type CardDef, type Color } from './data.js'

/**
 * Onitama (2 players), per the official rules (spec 1793169325398):
 * - 5×5 board; each side has a master (centre of its home row, on its temple arch) and 4 students.
 * - 5 cards dealt: 2 per player, 1 side card. The side card's stamp colour moves first.
 * - A turn: pick one of your 2 cards, move one of your pieces by one of its offsets (seen from your
 *   side), never onto your own piece; landing on an enemy captures it. The used card goes to the
 *   side; you take the previous side card.
 * - No legal move: you must still pass one of your cards to the side (and take the side card).
 * - Win: capture the enemy master (Way of the Stone) or move your master onto the enemy's temple
 *   arch (Way of the Stream). A safety cap of PLY_CAP plies ends in a draw.
 * Pure: JSON-only state, randomness only from the injected rng, never mutates its input.
 */

export type Square = [number, number]

export interface Piece {
  /** e.g. 'red-m' (master) or 'blue-2' (student). */
  id: string
  color: Color
  master: boolean
  x: number
  y: number
  /** Seat that captured it (absent while on the board). */
  capturedBy?: number
}

export type Way = 'stone' | 'stream' | 'draw'

export interface LastMove {
  seat: number
  type: 'move' | 'pass'
  card: string
  pieceId?: string
  from?: Square
  to?: Square
  capturedId?: string
}

export interface OnitamaState {
  /** Colour per seat (index = playerOrder). */
  colors: [Color, Color]
  pieces: Piece[]
  /** Each seat's two cards (index = playerOrder). */
  hands: [string[], string[]]
  /** The side card (taken by whoever moves next). */
  side: string
  /** The 5 cards dealt this game. */
  dealt: string[]
  turn: number
  firstSeat: number
  ply: number
  lastMove: LastMove | null
  result: { winners: number[]; way: Way } | null
}

export type OnitamaAction =
  | { type: 'move'; card: string; from: Square; to: Square }
  | { type: 'pass'; card: string }

export const OPTIONS: GameOption[] = [
  { key: 'senseisPath', label: "Include Sensei's Path cards", type: 'boolean', default: true },
]

// ——— Geometry ———

/** A card offset (mover-relative: right, forward) as a board delta for this colour. */
export function boardDelta(color: Color, [dx, dy]: readonly [number, number]): Square {
  // Red's home is row 0, so its forward is +y and its right is -x (it faces "down" the board).
  // Blue's home is row 4, so its forward is -y and its right is +x.
  // `|| 0` avoids -0, which would make otherwise-equal squares compare unequal.
  return color === 'red' ? [-dx || 0, dy] : [dx, -dy || 0]
}

const onBoard = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE
const other = (seat: number) => 1 - seat
const alive = (p: Piece) => p.capturedBy === undefined
const pieceAt = (s: Pick<OnitamaState, 'pieces'>, x: number, y: number) => s.pieces.find((p) => alive(p) && p.x === x && p.y === y)

/** Every legal move for a seat with one card (ignores whose turn it is). */
function movesWith(s: OnitamaState, seat: number, cardId: string): Extract<OnitamaAction, { type: 'move' }>[] {
  const color = s.colors[seat]
  const card = CARD_BY_ID[cardId]
  if (!card) return []
  const out: Extract<OnitamaAction, { type: 'move' }>[] = []
  for (const p of s.pieces) {
    if (!alive(p) || p.color !== color) continue
    for (const m of card.moves) {
      const [ddx, ddy] = boardDelta(color, m)
      const x = p.x + ddx
      const y = p.y + ddy
      if (!onBoard(x, y)) continue
      const target = pieceAt(s, x, y)
      if (target && target.color === color) continue
      out.push({ type: 'move', card: cardId, from: [p.x, p.y], to: [x, y] })
    }
  }
  return out
}

/** Squares a seat's pieces can reach with that seat's current two cards (its threats). */
export function attackedBy(s: OnitamaState, seat: number): Square[] {
  const seen = new Set<string>()
  const out: Square[] = []
  for (const c of s.hands[seat]) {
    for (const mv of movesWith(s, seat, c)) {
      const k = `${mv.to[0]},${mv.to[1]}`
      if (!seen.has(k)) {
        seen.add(k)
        out.push(mv.to)
      }
    }
  }
  return out
}

export function legalActions(s: OnitamaState, seat: number): OnitamaAction[] {
  if (s.result || seat !== s.turn) return []
  const moves = s.hands[seat].flatMap((c) => movesWith(s, seat, c))
  if (moves.length) return moves
  return s.hands[seat].map((card) => ({ type: 'pass', card }) as OnitamaAction)
}

// ——— Setup ———

export function setup(players: SeatInfo[], rng: Rng, options?: unknown): { state: OnitamaState; events: GameEvent[] } {
  if (players.length !== 2) throw new Error('Onitama needs exactly 2 players')
  const opts = resolveOptions(OPTIONS, options)
  // Colours are random per game (a Rematch re-runs setup, so it re-draws who plays red).
  const colors: [Color, Color] = rng() < 0.5 ? ['red', 'blue'] : ['blue', 'red']
  const pool: readonly CardDef[] = opts.senseisPath ? CARDS : BASE_CARDS
  const dealt = shuffle(pool.map((c) => c.id), rng).slice(0, 5)
  const pieces: Piece[] = []
  for (const color of ['red', 'blue'] as const) {
    const y = HOME_ROW[color]
    let n = 1
    for (let x = 0; x < SIZE; x++) {
      const master = x === 2
      pieces.push({ id: master ? `${color}-m` : `${color}-${n++}`, color, master, x, y })
    }
  }
  const side = dealt[4]
  const firstSeat = colors.indexOf(CARD_BY_ID[side].stamp)
  const state: OnitamaState = {
    colors,
    pieces,
    hands: [dealt.slice(0, 2), dealt.slice(2, 4)],
    side,
    dealt,
    turn: firstSeat,
    firstSeat,
    ply: 0,
    lastMove: null,
    result: null,
  }
  return { state, events: [{ type: 'gameStarted', firstSeat, colors: colors.slice() }] }
}

// ——— Actions ———

const isSquare = (v: unknown): v is Square =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < SIZE)

function clone(s: OnitamaState): OnitamaState {
  return {
    ...s,
    colors: [s.colors[0], s.colors[1]],
    pieces: s.pieces.map((p) => ({ ...p })),
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    dealt: s.dealt.slice(),
    lastMove: s.lastMove ? { ...s.lastMove } : null,
    result: s.result ? { winners: s.result.winners.slice(), way: s.result.way } : null,
  }
}

export function applyAction(s: OnitamaState, seat: number, raw: unknown): ActionResult<OnitamaState> {
  if (s.result) return { ok: false, error: 'The game is over' }
  if (seat !== s.turn) return { ok: false, error: 'Not your turn' }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid action' }
  const a = raw as Record<string, unknown>
  const card = a.card
  if (typeof card !== 'string' || !s.hands[seat].includes(card)) return { ok: false, error: 'That card is not in your hand' }
  const legal = legalActions(s, seat)
  const events: GameEvent[] = []
  const next = clone(s)

  if (a.type === 'pass') {
    if (legal.some((l) => l.type === 'move')) return { ok: false, error: 'You have a legal move, so you cannot pass' }
    events.push({ type: 'passed', seat, card })
    next.lastMove = { seat, type: 'pass', card }
  } else if (a.type === 'move') {
    if (!isSquare(a.from) || !isSquare(a.to)) return { ok: false, error: 'Invalid squares' }
    const from = a.from
    const to = a.to
    const ok = legal.some((l) => l.type === 'move' && l.card === card && l.from[0] === from[0] && l.from[1] === from[1] && l.to[0] === to[0] && l.to[1] === to[1])
    if (!ok) return { ok: false, error: 'That move is not allowed with this card' }
    const mover = next.pieces.find((p) => alive(p) && p.x === from[0] && p.y === from[1])!
    const victim = next.pieces.find((p) => alive(p) && p.x === to[0] && p.y === to[1])
    mover.x = to[0]
    mover.y = to[1]
    events.push({ type: 'pieceMoved', seat, piece: mover.id, from: [from[0], from[1]], to: [to[0], to[1]], card })
    if (victim) {
      victim.capturedBy = seat
      events.push({ type: 'pieceCaptured', piece: victim.id, by: seat })
    }
    next.lastMove = { seat, type: 'move', card, pieceId: mover.id, from: [from[0], from[1]], to: [to[0], to[1]], capturedId: victim?.id }
    // Way of the Stone: the enemy master is captured.
    if (victim?.master) next.result = { winners: [seat], way: 'stone' }
    // Way of the Stream: your master stands on the enemy's temple arch.
    const enemyTemple = TEMPLE[next.colors[other(seat)]]
    if (!next.result && mover.master && mover.x === enemyTemple[0] && mover.y === enemyTemple[1]) next.result = { winners: [seat], way: 'stream' }
  } else {
    return { ok: false, error: 'Invalid action' }
  }

  // The used card goes to the side (turned toward the opponent); the old side card joins the hand.
  const taken = next.side
  next.hands[seat] = next.hands[seat].map((c) => (c === card ? taken : c))
  next.side = card
  events.push({ type: 'cardRotated', seat, card, toSide: true }, { type: 'cardTaken', seat, card: taken })
  next.ply = s.ply + 1
  if (!next.result && next.ply >= PLY_CAP) next.result = { winners: [], way: 'draw' }
  if (next.result) {
    events.push({ type: 'gameOver', winners: next.result.winners.slice(), way: next.result.way })
  } else {
    next.turn = other(seat)
    events.push({ type: 'turnChanged', seat: next.turn })
  }
  return { ok: true, state: next, events }
}

// ——— Views (everything is public in Onitama) ———

export interface PieceView {
  id: string
  color: Color
  master: boolean
  x: number
  y: number
}

export interface PublicPlayer {
  seat: number
  name: string
  /** Lobby (seat) colour, for the name card. */
  seatColor: string | null
  /** Red or blue side this game. */
  side: Color
  /** Their two cards. */
  hand: string[]
  /** Enemy pieces this seat has captured (for the capturer's tray). */
  captured: PieceView[]
}

export interface OnitamaTableView {
  board: PieceView[]
  players: PublicPlayer[]
  side: string
  /** The seat that will take the side card (whoever moves next). */
  sideFor: number
  turn: number
  firstSeat: number
  ply: number
  dealt: string[]
  temples: Record<Color, Square>
  lastMove: LastMove | null
  result: { winners: number[]; way: Way } | null
  finished: boolean
}

export interface MoveOption {
  action: OnitamaAction
  /** A master move ending on a square the opponent could then attack (a warning, not a rule). */
  danger: boolean
  /** The move wins at once (captures the master or reaches the temple). */
  wins: boolean
}

export interface OnitamaPlayerView extends OnitamaTableView {
  me: number
  isMyTurn: boolean
  myColor: Color
  legalActions: OnitamaAction[]
  options: MoveOption[]
  /** Squares the opponent's pieces can currently reach with the opponent's two cards. */
  danger: Square[]
}

const pv = (p: Piece): PieceView => ({ id: p.id, color: p.color, master: p.master, x: p.x, y: p.y })

export function tableView(s: OnitamaState, players: SeatInfo[]): OnitamaTableView {
  return {
    board: s.pieces.filter(alive).map(pv),
    players: [0, 1].map((seat) => {
      const info = players.find((p) => p.playerOrder === seat)
      return {
        seat,
        name: info?.screenName ?? `Player ${seat + 1}`,
        seatColor: info?.color ?? null,
        side: s.colors[seat],
        hand: s.hands[seat].slice(),
        captured: s.pieces.filter((p) => p.capturedBy === seat).map(pv),
      }
    }),
    side: s.side,
    sideFor: s.turn,
    turn: s.turn,
    firstSeat: s.firstSeat,
    ply: s.ply,
    dealt: s.dealt.slice(),
    temples: { red: [TEMPLE.red[0], TEMPLE.red[1]], blue: [TEMPLE.blue[0], TEMPLE.blue[1]] },
    lastMove: s.lastMove ? { ...s.lastMove } : null,
    result: s.result ? { winners: s.result.winners.slice(), way: s.result.way } : null,
    finished: !!s.result,
  }
}

function moveOption(s: OnitamaState, seat: number, action: OnitamaAction): MoveOption {
  if (action.type !== 'move') return { action, danger: false, wins: false }
  const res = applyAction(s, seat, action)
  if (!res.ok) return { action, danger: false, wins: false }
  const wins = !!res.state.result && res.state.result.winners.includes(seat)
  const mover = s.pieces.find((p) => alive(p) && p.x === action.from[0] && p.y === action.from[1])
  if (wins || !mover?.master) return { action, danger: false, wins }
  // After the move it's the opponent's turn with their two cards: could they reach the master?
  const threats = attackedBy(res.state, other(seat))
  return { action, danger: threats.some(([x, y]) => x === action.to[0] && y === action.to[1]), wins }
}

export function playerView(s: OnitamaState, seat: number, players: SeatInfo[]): OnitamaPlayerView {
  const base = tableView(s, players)
  const legal = legalActions(s, seat)
  return {
    ...base,
    me: seat,
    isMyTurn: !s.result && s.turn === seat,
    myColor: s.colors[seat] ?? 'red',
    legalActions: legal,
    options: legal.map((a) => moveOption(s, seat, a)),
    danger: s.colors[seat] ? attackedBy(s, other(seat)) : [],
  }
}

export function summary(s: OnitamaState): GameSummary | null {
  if (!s.result) return null
  return { scores: [0, 1].map((seat) => (s.result!.winners.includes(seat) ? 1 : 0)), winners: s.result.winners.slice() }
}

export const onitamaModule: GameModule<OnitamaState, OnitamaAction> = {
  slug: 'onitama',
  name: 'Onitama',
  minPlayers: 2,
  maxPlayers: 2,
  options: OPTIONS,
  setup,
  applyAction: (s, seat, action) => applyAction(s, seat, action),
  tableView,
  playerView,
  isFinished: (s) => !!s.result,
  activeSeats: (s) => (s.result ? [] : [s.turn]),
  legalActions,
  winners: (s) => (s.result ? s.result.winners.slice() : []),
  summary,
}
