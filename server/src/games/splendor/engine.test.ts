import { describe, expect, it } from 'vitest'
import { seededRng, type SeatInfo } from '../types.js'
import { CARD_BY_ID, NOBLES, type Gem } from './data.js'
import {
  applyAction,
  legalActions,
  playerView,
  points,
  setup,
  tableView,
  type SplendorAction,
  type SplendorState,
} from './engine.js'

const seats = (n: number): SeatInfo[] =>
  Array.from({ length: n }, (_, i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))
const rng = seededRng(42)

function fresh(n = 2, seed = 1): SplendorState {
  const { state } = setup(seats(n), seededRng(seed))
  return { ...state, turn: 0, firstPlayer: 0, turnOrder: Array.from({ length: n }, (_, i) => i) }
}

function act(s: SplendorState, a: SplendorAction, seat = s.turn) {
  const r = applyAction(s, seat, a, rng)
  if (!r.ok) throw new Error(r.error)
  return r
}

function err(s: SplendorState, a: SplendorAction, seat = s.turn) {
  const r = applyAction(s, seat, a, rng)
  expect(r.ok).toBe(false)
  return r.ok ? '' : r.error
}

/** Place a specific card on the board at tier/slot (test helper). */
function withBoardCard(s: SplendorState, cardId: string, slot = 0): SplendorState {
  const tier = CARD_BY_ID[cardId].tier
  const t = structuredClone(s)
  t.decks[tier] = t.decks[tier].filter((id) => id !== cardId)
  t.board[tier] = t.board[tier].map((id) => (id === cardId ? t.decks[tier].shift() ?? null : id))
  const displaced = t.board[tier][slot]
  if (displaced) t.decks[tier].push(displaced)
  t.board[tier][slot] = cardId
  return t
}

describe('setup', () => {
  it.each([
    [2, 4, 3],
    [3, 5, 4],
    [4, 7, 5],
  ])('%i players: %i of each gem, %i nobles, 5 gold, 4 face-up per tier', (n, gems, nobles) => {
    const { state, events } = setup(seats(n), seededRng(7))
    for (const g of ['white', 'blue', 'green', 'red', 'black'] as Gem[]) expect(state.bank[g]).toBe(gems)
    expect(state.bank.gold).toBe(5)
    expect(state.nobles).toHaveLength(nobles)
    expect(state.board[1]).toHaveLength(4)
    expect(state.board[2]).toHaveLength(4)
    expect(state.board[3]).toHaveLength(4)
    expect(state.decks[1]).toHaveLength(36)
    expect(state.decks[2]).toHaveLength(26)
    expect(state.decks[3]).toHaveLength(16)
    expect(state.turn).toBe(state.firstPlayer)
    expect(events[0]).toMatchObject({ type: 'gameStarted' })
  })

  it('picks the first player randomly across seeds', () => {
    const firsts = new Set(Array.from({ length: 30 }, (_, i) => setup(seats(4), seededRng(i)).state.firstPlayer))
    expect(firsts.size).toBeGreaterThan(1)
  })

  it('rejects bad player counts', () => {
    expect(() => setup(seats(1), rng)).toThrow()
    expect(() => setup(seats(5), rng)).toThrow()
  })
})

describe('taking gems', () => {
  it('take3 moves one of each color and passes the turn', () => {
    const s = fresh()
    const r = act(s, { type: 'take3', gems: ['white', 'blue', 'green'] })
    expect(r.state.players[0].tokens).toMatchObject({ white: 1, blue: 1, green: 1 })
    expect(r.state.bank.white).toBe(3)
    expect(r.state.turn).toBe(1)
    expect(r.events.map((e) => e.type)).toEqual(['gemsTaken', 'turnChanged'])
    expect(s.players[0].tokens.white).toBe(0) // input not mutated
  })

  it('take3 rejects duplicates, gold, empty piles and fewer than 3 when 3 colors exist', () => {
    const s = fresh()
    err(s, { type: 'take3', gems: ['white', 'white', 'blue'] })
    err(s, { type: 'take3', gems: ['white', 'blue', 'gold' as Gem] })
    err(s, { type: 'take3', gems: ['white', 'blue'] })
    const empty = structuredClone(s)
    empty.bank.red = 0
    err(empty, { type: 'take3', gems: ['white', 'blue', 'red'] })
  })

  it('take3 allows fewer only when fewer than 3 colors are available', () => {
    const s = fresh()
    s.bank = { white: 2, blue: 1, green: 0, red: 0, black: 0, gold: 5 }
    expect(legalActions(s, 0).filter((a) => a.type === 'take3')).toEqual([{ type: 'take3', gems: ['white', 'blue'] }])
    err(s, { type: 'take3', gems: ['white'] })
    const r = act(s, { type: 'take3', gems: ['white', 'blue'] })
    expect(r.state.players[0].tokens).toMatchObject({ white: 1, blue: 1 })
  })

  it('take2 needs at least 4 in the pile', () => {
    const s = fresh()
    const r = act(s, { type: 'take2', gem: 'red' })
    expect(r.state.players[0].tokens.red).toBe(2)
    expect(r.state.bank.red).toBe(2)
    const low = structuredClone(s)
    low.bank.red = 3
    expect(err(low, { type: 'take2', gem: 'red' })).toMatch(/at least 4/)
  })

  it('rejects actions out of turn', () => {
    const s = fresh()
    expect(err(s, { type: 'take2', gem: 'red' }, 1)).toMatch(/not your turn/)
  })
})

describe('reserving', () => {
  it('reserve from board: gold, refill, hidden on the table', () => {
    const s = fresh()
    const id = s.board[1][2]!
    const next = s.decks[1][0]
    const r = act(s, { type: 'reserve', tier: 1, slot: 2 })
    const p = r.state.players[0]
    expect(p.reserved).toEqual([{ id, fromDeck: false }])
    expect(p.tokens.gold).toBe(1)
    expect(r.state.bank.gold).toBe(4)
    expect(r.state.board[1][2]).toBe(next)
    const reservedEvent = r.events.find((e) => e.type === 'cardReserved')!
    expect(reservedEvent).toEqual({ type: 'cardReserved', seat: 0, from: 'board', tier: 1, slot: 2 })
    expect(r.events.map((e) => e.type)).toEqual(['cardReserved', 'slotRefilled', 'goldGained', 'turnChanged'])
  })

  it('reserve from deck takes the top card', () => {
    const s = fresh()
    const top = s.decks[3][0]
    const r = act(s, { type: 'reserve', tier: 3, fromDeck: true })
    expect(r.state.players[0].reserved).toEqual([{ id: top, fromDeck: true }])
    expect(r.state.decks[3]).toHaveLength(s.decks[3].length - 1)
  })

  it('no gold when the bank has none, still reserves', () => {
    const s = fresh()
    s.bank.gold = 0
    const r = act(s, { type: 'reserve', tier: 1, slot: 0 })
    expect(r.state.players[0].tokens.gold).toBe(0)
    expect(r.state.players[0].reserved).toHaveLength(1)
    expect(r.events.some((e) => e.type === 'goldGained')).toBe(false)
  })

  it('caps at 3 reserved', () => {
    const s = fresh()
    s.players[0].reserved = [s.decks[1][0], s.decks[1][1], s.decks[1][2]].map((id) => ({ id, fromDeck: true }))
    expect(err(s, { type: 'reserve', tier: 1, slot: 0 })).toMatch(/3 reserved/)
    expect(legalActions(s, 0).some((a) => a.type === 'reserve')).toBe(false)
  })

  it('an empty deck leaves the slot empty after reserving', () => {
    const s = fresh()
    s.decks[2] = []
    const r = act(s, { type: 'reserve', tier: 2, slot: 1 })
    expect(r.state.board[2][1]).toBeNull()
    expect(err(r.state, { type: 'reserve', tier: 2, fromDeck: true }, 1)).toMatch(/empty/)
  })
})

describe('buying', () => {
  // t1-01: blue bonus, cost 2 green 2 black
  it('pays with tokens, refills the slot, returns tokens to the bank', () => {
    let s = withBoardCard(fresh(), 't1-01', 0)
    s.players[0].tokens = { white: 0, blue: 0, green: 2, red: 0, black: 2, gold: 0 }
    s.bank.green -= 2
    s.bank.black -= 2
    const next = s.decks[1][0]
    const r = act(s, { type: 'buy', source: 'board', tier: 1, slot: 0 })
    s = r.state
    expect(s.players[0].cards).toEqual(['t1-01'])
    expect(s.players[0].tokens).toMatchObject({ green: 0, black: 0 })
    expect(s.bank.green).toBe(4)
    expect(s.board[1][0]).toBe(next)
    expect(r.events[0]).toMatchObject({ type: 'cardBought', from: 'board', cardId: 't1-01', paid: { green: 2, black: 2 } })
  })

  it('bonuses discount and gold is wild', () => {
    let s = withBoardCard(fresh(), 't1-01', 0)
    // one green bonus from an owned green card, one green token, one black + one gold
    s.players[0].cards = ['t1-08'] // green bonus
    s.players[0].tokens = { white: 0, blue: 0, green: 1, red: 0, black: 1, gold: 1 }
    s.bank = { ...s.bank, green: 3, black: 3, gold: 4 }
    const r = act(s, { type: 'buy', source: 'board', tier: 1, slot: 0 })
    s = r.state
    expect(s.players[0].tokens).toMatchObject({ green: 0, black: 0, gold: 0 })
    expect(r.events[0]).toMatchObject({ paid: { green: 1, black: 1, gold: 1 } })
  })

  it('can buy for free with enough bonuses', () => {
    const s = withBoardCard(fresh(), 't1-01', 0)
    s.players[0].cards = ['t1-08', 't1-09', 't1-30', 't1-32'] // 2 green + 2 black bonuses
    const r = act(s, { type: 'buy', source: 'board', tier: 1, slot: 0 })
    expect(r.events[0]).toMatchObject({ paid: {} })
  })

  it('rejects an unaffordable card', () => {
    const s = withBoardCard(fresh(), 't1-01', 0)
    expect(err(s, { type: 'buy', source: 'board', tier: 1, slot: 0 })).toMatch(/afford/)
  })

  it('buys from reserve', () => {
    const s = fresh()
    s.players[0].reserved = [{ id: 't1-04', fromDeck: true }] // blue, 1pt, cost 4 red
    s.players[0].tokens.red = 4
    s.bank.red = 0
    const r = act(s, { type: 'buy', source: 'reserved', cardId: 't1-04' })
    expect(r.state.players[0].reserved).toEqual([])
    expect(r.state.players[0].cards).toEqual(['t1-04'])
    expect(points(r.state.players[0])).toBe(1)
    expect(err(s, { type: 'buy', source: 'reserved', cardId: 't1-05' })).toMatch(/reserve/)
  })

  it('empty deck leaves the bought slot null and keeps 4 face-up only while the deck has cards', () => {
    const s = withBoardCard(fresh(), 't1-01', 0)
    s.decks[1] = []
    s.players[0].cards = ['t1-08', 't1-09', 't1-30', 't1-32']
    const r = act(s, { type: 'buy', source: 'board', tier: 1, slot: 0 })
    expect(r.state.board[1][0]).toBeNull()
    expect(r.events.some((e) => e.type === 'slotRefilled')).toBe(false)
  })
})

describe('token limit', () => {
  it('requires returning tokens down to 10, including just-taken ones', () => {
    const s = fresh()
    s.players[0].tokens = { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 } // 9
    const r = act(s, { type: 'take3', gems: ['white', 'blue', 'green'] })
    expect(r.state.pending).toEqual({ kind: 'discard', over: 2 })
    expect(r.state.turn).toBe(0)
    expect(r.events.map((e) => e.type)).toEqual(['gemsTaken'])
    expect(err(r.state, { type: 'take2', gem: 'red' })).toMatch(/Return/)
    expect(err(r.state, { type: 'discard', tokens: { white: 1 } })).toMatch(/exactly 2/)
    expect(err(r.state, { type: 'discard', tokens: { gold: 2 } })).toMatch(/don't have/)
    const legal = legalActions(r.state, 0)
    expect(legal.every((a) => a.type === 'discard')).toBe(true)
    expect(legal).toContainEqual({ type: 'discard', tokens: { white: 2 } })
    const d = act(r.state, { type: 'discard', tokens: { white: 1, green: 1 } })
    expect(d.state.pending).toBeNull()
    expect(d.state.players[0].tokens).toMatchObject({ white: 2, green: 2 })
    expect(d.state.turn).toBe(1)
    expect(d.events.map((e) => e.type)).toEqual(['gemsReturned', 'turnChanged'])
  })
})

describe('nobles', () => {
  const noble = (id: string) => NOBLES.find((n) => n.id === id)!
  // n-04 needs 4 black + 4 red; n-07 needs 4 black + 4 white
  const blackRed = ['t1-11', 't1-14', 't1-15', 't1-17', 't1-05', 't1-06', 't1-07', 't1-16'] // 4 black, 4 red
  it('awards automatically when exactly one qualifies, one per turn', () => {
    const s = fresh()
    s.nobles = ['n-04', 'n-08', 'n-09']
    s.players[0].cards = blackRed.slice(0, 7) // 4 black, 3 red
    s.players[0].reserved = [{ id: 't1-19', fromDeck: true }] // red, cost 2 blue 1 green
    s.players[0].tokens = { white: 0, blue: 2, green: 1, red: 0, black: 0, gold: 0 }
    const r = act(s, { type: 'buy', source: 'reserved', cardId: 't1-19' })
    expect(r.state.players[0].nobles).toEqual(['n-04'])
    expect(r.state.nobles).toEqual(['n-08', 'n-09'])
    expect(points(r.state.players[0])).toBe(3)
    expect(r.events.map((e) => e.type)).toEqual(['cardBought', 'nobleVisited', 'turnChanged'])
    expect(noble('n-04').requires).toEqual({ black: 4, red: 4 })
  })

  it('lets the player choose when several qualify, and only one is taken', () => {
    const s = fresh()
    s.nobles = ['n-04', 'n-07', 'n-08']
    s.players[0].cards = [...blackRed, 't1-12', 't1-13', 't1-18'] // + 3 white
    s.players[0].reserved = [{ id: 't1-21', fromDeck: true }] // white, cost 2 red 1 black
    const r = act(s, { type: 'buy', source: 'reserved', cardId: 't1-21' })
    expect(r.state.pending).toEqual({ kind: 'noble', options: ['n-04', 'n-07'] })
    expect(legalActions(r.state, 0)).toEqual([
      { type: 'chooseNoble', nobleId: 'n-04' },
      { type: 'chooseNoble', nobleId: 'n-07' },
    ])
    expect(err(r.state, { type: 'chooseNoble', nobleId: 'n-08' })).toMatch(/can't visit/)
    const c = act(r.state, { type: 'chooseNoble', nobleId: 'n-07' })
    expect(c.state.players[0].nobles).toEqual(['n-07'])
    expect(c.state.nobles).toEqual(['n-04', 'n-08'])
    expect(c.state.turn).toBe(1)
  })
})

describe('end of game', () => {
  function nearWin(): SplendorState {
    const s = fresh(3)
    // seat 1 holds 13 points (5 + 5 + 3) and can buy reserved t2-01 (2 pts, cost 3 white 5 black) to reach 15
    s.players[1].cards = ['t3-02', 't3-10', 't2-07']
    s.players[1].reserved = [{ id: 't2-01', fromDeck: true }]
    s.players[1].tokens = { white: 3, blue: 0, green: 0, red: 0, black: 5, gold: 0 }
    s.bank.white -= 3
    s.bank.black = 2
    s.nobles = []
    s.turn = 1
    return s
  }

  it('finishes the round after someone reaches 15', () => {
    const s = nearWin()
    const r = act(s, { type: 'buy', source: 'reserved', cardId: 't2-01' })
    expect(points(r.state.players[1])).toBe(15)
    expect(r.state.endTriggered).toBe(true)
    expect(r.state.result).toBeNull()
    expect(r.state.turn).toBe(2)
    expect(r.events.map((e) => e.type)).toEqual(['cardBought', 'endTriggered', 'turnChanged'])
    const last = act(r.state, { type: 'take3', gems: ['white', 'blue', 'green'] })
    expect(last.state.result).toEqual({ ranking: [1, 0, 2], winners: [1] })
    expect(last.events.at(-1)).toMatchObject({ type: 'gameOver', winners: [1] })
    expect(legalActions(last.state, 0)).toEqual([])
    expect(err(last.state, { type: 'take2', gem: 'red' }, 0)).toMatch(/over/)
  })

  it('ties break on fewest purchased cards, then share the win', () => {
    const s = fresh(2)
    s.endTriggered = true
    s.turn = 1
    // both on 15: seat 0 with 3 cards (5 + 5 + 5), seat 1 with 7 cards (5 + 5 + five 1-pointers)
    s.players[0].cards = ['t3-02', 't3-10', 't3-20']
    s.players[1].cards = ['t3-15', 't3-13', 't1-04', 't1-10', 't1-12', 't1-22', 't1-31']
    const r = act(s, { type: 'take3', gems: ['white', 'blue', 'green'] })
    expect(r.state.result!.winners).toEqual([0])
    const tie = structuredClone(s)
    tie.players[1].cards = ['t3-15', 't3-13', 't3-02'] // 15 points with 3 cards: a true tie
    const t = act(tie, { type: 'take3', gems: ['white', 'blue', 'green'] })
    expect(t.state.result!.winners).toEqual([0, 1])
  })

  it('offers pass only when nothing else is possible', () => {
    const s = fresh()
    s.bank = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
    s.players[0].reserved = [s.decks[1][0], s.decks[1][1], s.decks[1][2]].map((id) => ({ id, fromDeck: true }))
    s.decks[1] = s.decks[1].slice(3)
    expect(legalActions(s, 0)).toEqual([{ type: 'pass' }])
    const r = act(s, { type: 'pass' })
    expect(r.state.turn).toBe(1)
    expect(err(fresh(), { type: 'pass' })).toMatch(/only pass/)
  })
})

describe('hidden information', () => {
  it('table and other seats see reserved cards only as tiers and never see deck order', () => {
    let s = fresh(3)
    const boardCard = s.board[2][0]!
    s = act(s, { type: 'reserve', tier: 2, slot: 0 }).state
    const deckTop = s.decks[3][0]
    s = act(s, { type: 'reserve', tier: 3, fromDeck: true }).state
    const t = tableView(s, seats(3))
    const tJson = JSON.stringify(t)
    expect(t.players[0].reserved).toEqual([{ tier: 2 }])
    expect(t.players[1].reserved).toEqual([{ tier: 3 }])
    expect(tJson).not.toContain(deckTop)
    // the board card left the board; nothing on the table names it any more
    expect(tJson).not.toContain(boardCard)
    expect(t.decks).toEqual({ 1: 36, 2: 25, 3: 15 })
    for (const id of s.decks[1]) expect(tJson).not.toContain(`"${id}"`)

    const other = playerView(s, 2, seats(3))
    const oJson = JSON.stringify(other)
    expect(oJson).not.toContain(deckTop)
    expect(oJson).not.toContain(boardCard)
    expect(other.myReserved).toEqual([])

    const mine = playerView(s, 1, seats(3))
    expect(mine.myReserved).toEqual([{ id: deckTop, tier: 3, fromDeck: true }])
    expect(JSON.stringify(mine)).not.toContain(boardCard)
  })

  it('reserve events never name the card', () => {
    const s = fresh()
    const id = s.board[1][0]!
    const r = act(s, { type: 'reserve', tier: 1, slot: 0 })
    expect(JSON.stringify(r.events.filter((e) => e.type === 'cardReserved'))).not.toContain(id)
    const d = act(s, { type: 'reserve', tier: 1, fromDeck: true })
    expect(JSON.stringify(d.events)).not.toContain(s.decks[1][0])
  })

  it('player view carries affordability, payments and legal flags on my turn only', () => {
    const s = withBoardCard(fresh(), 't1-01', 0)
    s.players[0].tokens = { white: 0, blue: 0, green: 2, red: 0, black: 2, gold: 0 }
    const v = playerView(s, 0, seats(2))
    expect(v.isMyTurn).toBe(true)
    expect(v.affordable['t1-01']).toBe(true)
    expect(v.payments['t1-01']).toEqual({ tokens: { green: 2, black: 2 }, goldShort: 0 })
    expect(v.legal).toMatchObject({ take3: true, take2: true, reserve: true, buy: true, pass: false })
    expect(v.lastAction).toBeNull()
    const o = playerView(s, 1, seats(2))
    expect(o.isMyTurn).toBe(false)
    expect(o.legalActions).toEqual([])
  })

  it('lastAction summaries use seat names', () => {
    const s = fresh()
    const r = act(s, { type: 'take3', gems: ['white', 'blue', 'green'] })
    const t = tableView(r.state, [
      { playerOrder: 0, screenName: 'Joe', color: 'red' },
      { playerOrder: 1, screenName: 'Sam', color: 'blue' },
    ])
    expect(t.lastAction!.summary).toBe('Joe took 1 diamond, 1 sapphire, 1 emerald')
    expect(t.players[0]).toMatchObject({ name: 'Joe', color: 'red', tokenCount: 3 })
  })
})

describe('turn order (shuffled every game)', () => {
  it('draws a permutation of the seats, and the first player leads it', () => {
    for (const n of [2, 3, 4]) {
      for (let seed = 0; seed < 20; seed++) {
        const { state } = setup(seats(n), seededRng(seed))
        expect([...state.turnOrder].sort()).toEqual(Array.from({ length: n }, (_, i) => i))
        expect(state.firstPlayer).toBe(state.turnOrder[0])
        expect(state.turn).toBe(state.turnOrder[0])
      }
    }
    // Not always seat order: across seeds, 4-player orders vary beyond a rotation of 0,1,2,3.
    const orders = new Set(Array.from({ length: 40 }, (_, i) => setup(seats(4), seededRng(i)).state.turnOrder.join('')))
    const rotations = new Set(['0123', '1230', '2301', '3012'])
    expect([...orders].some((o) => !rotations.has(o))).toBe(true)
  })

  it('passes turns along the drawn order, and the round ends back at the first player', () => {
    const { state: s0 } = setup(seats(4), seededRng(5))
    let s = s0
    const starts: number[] = [s.turn]
    const r = seededRng(9)
    for (let i = 0; i < 400 && !s.result; i++) {
      const seat = s.turn
      const legal = legalActions(s, seat)
      const res = applyAction(s, seat, legal[Math.floor(r() * legal.length)], r)
      if (!res.ok) throw new Error(res.error)
      if (res.state.turn !== seat && !res.state.result) starts.push(res.state.turn)
      s = res.state
    }
    // Every turn hand-off follows the drawn order.
    starts.forEach((seat, i) => expect(seat).toBe(s0.turnOrder[i % 4]))
    // The game ended at a round boundary: the last seat to play is the last in the order.
    expect(s.result).not.toBeNull()
    expect(starts[starts.length - 1]).toBe(s0.turnOrder[3])
  })

  it('falls back to seat order from the first player for states saved before turn orders', () => {
    const { state } = setup(seats(3), seededRng(2))
    const legacy = { ...state, firstPlayer: 1, turn: 1 } as SplendorState
    delete (legacy as Partial<SplendorState>).turnOrder
    expect(tableView(legacy, seats(3)).turnOrder).toEqual([1, 2, 0])
  })
})
