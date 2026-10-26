import { describe, expect, it } from 'vitest'
import { seededRng, type GameEvent, type SeatInfo } from '../types.js'
import { CARD_BY_ID, GREEN_DECK, RED_DECK, SPACES, type Kind, type Space } from './data.js'
import {
  dragonheartModule as game,
  legalActions,
  playerView,
  tableView,
  type DragonheartAction,
  type DragonheartState,
} from './engine.js'

const seats: SeatInfo[] = [
  { playerOrder: 0, screenName: 'Joe', color: 'green' },
  { playerOrder: 1, screenName: 'Ann', color: 'red' },
]
const rng = seededRng(7)

/** A blank table: both decks intact, empty hands, seat 0 to play. */
function base(): DragonheartState {
  return {
    players: [
      { deck: GREEN_DECK.map((c) => c.id), hand: [], score: [] },
      { deck: RED_DECK.map((c) => c.id), hand: [], score: [] },
    ],
    spaces: Object.fromEntries(SPACES.map((sp) => [sp, []])) as unknown as Record<Space, string[]>,
    belowShip: [],
    shipStacks: [],
    greatDragon: 'board',
    turn: 0,
    firstPlayer: 0,
    endAfterSeat: null,
    lastPlay: null,
    result: null,
    turnCount: 0,
  }
}

/** Take the next unused card of a kind (and value) out of a seat's deck. */
function draw(s: DragonheartState, seat: 0 | 1, kind: Kind, points?: number): string {
  const deck = s.players[seat].deck
  const i = deck.findIndex((id) => CARD_BY_ID[id].kind === kind && (points === undefined || CARD_BY_ID[id].points === points))
  if (i < 0) throw new Error(`no ${kind} left`)
  return deck.splice(i, 1)[0]
}
const hand = (s: DragonheartState, seat: 0 | 1, kind: Kind, n = 1, points?: number) => {
  const ids = Array.from({ length: n }, () => draw(s, seat, kind, points))
  s.players[seat].hand.push(...ids)
  return ids
}
const onSpace = (s: DragonheartState, seat: 0 | 1, kind: Kind, n = 1) => {
  const ids = Array.from({ length: n }, () => draw(s, seat, kind))
  s.spaces[kind].push(...ids)
  return ids
}
const fill = (s: DragonheartState, seat: 0 | 1, n: number) => {
  // filler cards of a kind nobody uses in these tests' plays
  for (let i = 0; i < n; i++) s.players[seat].hand.push(draw(s, seat, 'dwarf'))
}

function act(s: DragonheartState, seat: number, action: DragonheartAction) {
  const r = game.applyAction(s, seat, action, rng)
  if (!r.ok) throw new Error(r.error)
  return r
}
function err(s: DragonheartState, seat: number, action: unknown) {
  const r = game.applyAction(s, seat, action as DragonheartAction, rng)
  expect(r.ok).toBe(false)
  return r.ok ? '' : r.error
}
const types = (events: GameEvent[]) => events.map((e) => e.type)

describe('setup', () => {
  it('deals five cards to each player from their own deck and picks a first player', () => {
    const { state, events } = game.setup(seats, seededRng(1))
    expect(state.players[0].hand).toHaveLength(5)
    expect(state.players[1].hand).toHaveLength(5)
    expect(state.players[0].deck).toHaveLength(45)
    expect(state.players[0].hand.every((id) => id.startsWith('g-'))).toBe(true)
    expect(state.players[1].hand.every((id) => id.startsWith('r-'))).toBe(true)
    expect([0, 1]).toContain(state.firstPlayer)
    expect(state.turn).toBe(state.firstPlayer)
    expect(state.greatDragon).toBe('board')
    expect(events).toEqual([{ type: 'gameStarted', firstPlayer: state.firstPlayer }])
    expect(game.setup(seats, seededRng(1)).state).toEqual(state)
  })

  it('refuses anything but two players', () => {
    expect(() => game.setup([seats[0]], rng)).toThrow()
  })
})

describe('validation', () => {
  it('rejects malformed and illegal plays without throwing', () => {
    const s = base()
    const [k] = hand(s, 0, 'knight')
    const [t] = hand(s, 0, 'troll')
    const mine = s.players[0].hand.slice()
    for (const bad of [null, 42, {}, { type: 'nope' }, { type: 'play' }, { type: 'play', cardIds: [] }, { type: 'play', cardIds: [7] }]) err(s, 0, bad)
    expect(err(s, 1, { type: 'play', cardIds: [k] })).toMatch(/turn/)
    expect(err(s, 0, { type: 'play', cardIds: [k, t] })).toMatch(/same picture/)
    expect(err(s, 0, { type: 'play', cardIds: [k, k] })).toMatch(/once/)
    expect(err(s, 0, { type: 'play', cardIds: ['r-01'] })).toMatch(/hand/)
    expect(err(s, 0, { type: 'play', cardIds: [t], collect: 'treasure' })).toMatch(/choose/)
    expect(err(s, 0, { type: 'play', cardIds: [k], collect: 'bogus' })).toMatch(/Invalid collect/)
    expect(s.players[0].hand).toEqual(mine)
  })

  it('enforces the printed outlines on capacity spaces', () => {
    const s = base()
    onSpace(s, 1, 'knight')
    const ks = hand(s, 0, 'knight', 2)
    expect(err(s, 0, { type: 'play', cardIds: ks })).toMatch(/room/)
    act(s, 0, { type: 'play', cardIds: [ks[0]] })
  })

  it('only allows passing with an empty hand', () => {
    const s = base()
    hand(s, 0, 'troll')
    expect(err(s, 0, { type: 'pass' })).toMatch(/at least one/)
  })

  it('never mutates the input state', () => {
    const s = base()
    onSpace(s, 1, 'treasure', 2)
    const fd = hand(s, 0, 'fireDragon')
    const snapshot = JSON.parse(JSON.stringify(s))
    act(s, 0, { type: 'play', cardIds: fd })
    expect(s).toEqual(snapshot)
  })
})

describe('space effects', () => {
  it('Fire Dragon takes the whole Treasure Chest stack', () => {
    const s = base()
    const chest = onSpace(s, 1, 'treasure', 3)
    const fd = hand(s, 0, 'fireDragon', 2)
    const r = act(s, 0, { type: 'play', cardIds: fd })
    expect(r.state.players[0].score).toEqual(chest)
    expect(r.state.spaces.treasure).toEqual([])
    expect(r.state.spaces.fireDragon).toEqual(fd)
    const ev = r.events.find((e) => e.type === 'cardsCollected')!
    expect(ev).toMatchObject({ seat: 0, from: 'treasure', count: 3, visibleIds: [chest[2]] })
  })

  it('collects nothing when the target space is empty', () => {
    const s = base()
    const fd = hand(s, 0, 'fireDragon')
    const r = act(s, 0, { type: 'play', cardIds: fd })
    expect(r.state.players[0].score).toEqual([])
    expect(types(r.events)).not.toContain('cardsCollected')
  })

  it('Treasure Chest and Petrified Dragon have no effect', () => {
    const s = base()
    onSpace(s, 1, 'troll')
    const tc = hand(s, 0, 'treasure')
    const r = act(s, 0, { type: 'play', cardIds: tc })
    expect(r.state.players[0].score).toEqual([])
    const p = hand(r.state, 1, 'petrified')
    const r2 = act(r.state, 1, { type: 'play', cardIds: p })
    expect(r2.state.players[1].score).toEqual([])
    expect(r2.state.greatDragon).toBe('board')
  })

  it('Troll takes the Sorceress stack', () => {
    const s = base()
    const sorc = onSpace(s, 1, 'sorceress', 2)
    const tr = hand(s, 0, 'troll')
    const r = act(s, 0, { type: 'play', cardIds: tr })
    expect(r.state.players[0].score).toEqual(sorc)
  })

  it('Sorceress must choose when both Treasure Chest and Petrified Dragon have cards', () => {
    const s = base()
    const chest = onSpace(s, 1, 'treasure', 2)
    const pet = onSpace(s, 1, 'petrified', 1)
    const so = hand(s, 0, 'sorceress')
    expect(err(s, 0, { type: 'play', cardIds: so })).toMatch(/Treasure Chest or Petrified Dragon/)
    const a = act(s, 0, { type: 'play', cardIds: so, collect: 'treasure' })
    expect(a.state.players[0].score).toEqual(chest)
    expect(a.state.spaces.petrified).toEqual(pet)
    expect(a.state.greatDragon).toBe('board')
  })

  it('Sorceress collects automatically when only one target has cards', () => {
    const s = base()
    const chest = onSpace(s, 1, 'treasure', 1)
    const so = hand(s, 0, 'sorceress')
    expect(err(s, 0, { type: 'play', cardIds: so, collect: 'petrified' })).toMatch(/no cards/)
    const a = act(s, 0, { type: 'play', cardIds: so })
    expect(a.state.players[0].score).toEqual(chest)
  })

  it('taking a Petrified Dragon card takes the Great Dragon and a 6-card hand', () => {
    const s = base()
    onSpace(s, 1, 'petrified', 2)
    const so = hand(s, 0, 'sorceress')
    fill(s, 0, 4)
    const r = act(s, 0, { type: 'play', cardIds: so, collect: 'petrified' })
    expect(r.state.greatDragon).toBe(0)
    expect(r.state.players[0].hand).toHaveLength(6)
    expect(r.events).toContainEqual({ type: 'greatDragonMoved', from: 'board', to: 0 })
    expect(r.events).toContainEqual({ type: 'cardsDrawn', seat: 0, count: 2 })
  })

  it('stealing the Great Dragon sends a random card from the opponent’s 6-card hand to the top of their deck', () => {
    const s = base()
    s.greatDragon = 1
    fill(s, 1, 6)
    onSpace(s, 1, 'petrified', 1)
    const so = hand(s, 0, 'sorceress')
    const oppHandBefore = s.players[1].hand.slice()
    const deckBefore = s.players[1].deck.length
    const r = act(s, 0, { type: 'play', cardIds: so })
    expect(r.state.greatDragon).toBe(0)
    expect(r.state.players[1].hand).toHaveLength(5)
    expect(r.state.players[1].deck).toHaveLength(deckBefore + 1)
    const returned = r.state.players[1].deck[0]
    expect(oppHandBefore).toContain(returned)
    expect(r.state.players[1].hand).not.toContain(returned)
    const ev = r.events.find((e) => e.type === 'cardReturnedToDeck')!
    expect(ev).toEqual({ type: 'cardReturnedToDeck', seat: 1 })
  })

  it('does not return a card when the opponent holds five or fewer', () => {
    const s = base()
    s.greatDragon = 1
    fill(s, 1, 4)
    onSpace(s, 1, 'petrified', 1)
    const so = hand(s, 0, 'sorceress')
    const r = act(s, 0, { type: 'play', cardIds: so })
    expect(r.state.players[1].hand).toHaveLength(4)
    expect(types(r.events)).not.toContain('cardReturnedToDeck')
  })

  it('re-taking the dragon you already hold changes nothing', () => {
    const s = base()
    s.greatDragon = 0
    onSpace(s, 1, 'petrified', 1)
    const so = hand(s, 0, 'sorceress')
    const r = act(s, 0, { type: 'play', cardIds: so })
    expect(r.state.greatDragon).toBe(0)
    expect(types(r.events)).not.toContain('greatDragonMoved')
  })

  it('Dwarf: whoever plays the fourth card takes all four', () => {
    const s = base()
    const three = onSpace(s, 1, 'dwarf', 3)
    const d = hand(s, 0, 'dwarf', 2)
    expect(err(s, 0, { type: 'play', cardIds: d })).toMatch(/room/)
    const r = act(s, 0, { type: 'play', cardIds: [d[0]] })
    expect(r.state.players[0].score).toEqual([...three, d[0]])
    expect(r.state.spaces.dwarf).toEqual([])
    const ev = r.events.find((e) => e.type === 'cardsCollected')!
    expect((ev.visibleIds as string[]).length).toBe(4) // all four were face-up
  })

  it('Dwarf: fewer than four does nothing', () => {
    const s = base()
    const d = hand(s, 0, 'dwarf', 3)
    const r = act(s, 0, { type: 'play', cardIds: d })
    expect(r.state.spaces.dwarf).toEqual(d)
    expect(r.state.players[0].score).toEqual([])
  })

  it('Knight: the second card takes Sorceress or Troll, then the knights go below the Ship', () => {
    const s = base()
    const k1 = onSpace(s, 1, 'knight', 1)
    const sorc = onSpace(s, 1, 'sorceress', 1)
    const troll = onSpace(s, 1, 'troll', 2)
    const k = hand(s, 0, 'knight')
    expect(err(s, 0, { type: 'play', cardIds: k })).toMatch(/Sorceress or Troll/)
    const r = act(s, 0, { type: 'play', cardIds: k, collect: 'troll' })
    expect(r.state.players[0].score).toEqual(troll)
    expect(r.state.spaces.sorceress).toEqual(sorc)
    expect(r.state.spaces.knight).toEqual([])
    expect(r.state.belowShip).toEqual([...k1, ...k])
    expect(r.events).toContainEqual({ type: 'movedBelowShip', from: 'knight', cardIds: [...k1, ...k] })
  })

  it('Knight: a single knight on an empty space does nothing yet', () => {
    const s = base()
    onSpace(s, 1, 'sorceress', 1)
    const k = hand(s, 0, 'knight')
    expect(err(s, 0, { type: 'play', cardIds: k, collect: 'sorceress' })).toMatch(/doesn't let you choose/)
    const r = act(s, 0, { type: 'play', cardIds: k })
    expect(r.state.spaces.knight).toEqual(k)
    expect(r.state.players[0].score).toEqual([])
  })

  it('Huntress: the third card takes the Fire Dragon stack, then the huntresses go below the Ship', () => {
    const s = base()
    const fds = onSpace(s, 1, 'fireDragon', 2)
    const h1 = onSpace(s, 1, 'huntress', 1)
    const h = hand(s, 0, 'huntress', 2)
    const r = act(s, 0, { type: 'play', cardIds: h })
    expect(r.state.players[0].score).toEqual(fds)
    expect(r.state.belowShip).toEqual([...h1, ...h])
    expect(r.state.spaces.huntress).toEqual([])
  })

  it('Ship: the third card takes the pile below the Ship and forms a ship stack', () => {
    const s = base()
    const pile = [draw(s, 1, 'knight'), draw(s, 1, 'knight'), draw(s, 1, 'huntress')]
    s.belowShip.push(...pile)
    const sh1 = onSpace(s, 1, 'ship', 2)
    const sh = hand(s, 0, 'ship')
    const r = act(s, 0, { type: 'play', cardIds: sh })
    expect(r.state.players[0].score).toEqual(pile)
    expect(r.state.belowShip).toEqual([])
    expect(r.state.shipStacks).toEqual([[...sh1, ...sh]])
    expect(r.state.spaces.ship).toEqual([])
    expect(r.events).toContainEqual({ type: 'shipStackFormed', index: 0, cardIds: [...sh1, ...sh] })
    expect(r.state.endAfterSeat).toBeNull()
  })
})

describe('turns and the end of the game', () => {
  it('refills the hand and passes the turn', () => {
    const s = base()
    const tr = hand(s, 0, 'troll')
    fill(s, 0, 4)
    const r = act(s, 0, { type: 'play', cardIds: tr })
    expect(r.state.players[0].hand).toHaveLength(5)
    expect(r.state.turn).toBe(1)
    expect(r.events.at(-1)).toEqual({ type: 'turnChanged', seat: 1 })
  })

  it('the third ship stack gives the opponent one final turn, then the game ends', () => {
    const s = base()
    s.shipStacks = [[draw(s, 1, 'ship'), draw(s, 1, 'ship'), draw(s, 1, 'ship')], [draw(s, 1, 'ship'), draw(s, 1, 'ship'), draw(s, 1, 'ship')]]
    onSpace(s, 0, 'ship', 2)
    const sh = hand(s, 0, 'ship')
    fill(s, 0, 4)
    hand(s, 1, 'troll')
    fill(s, 1, 4)
    const r = act(s, 0, { type: 'play', cardIds: sh })
    expect(r.state.shipStacks).toHaveLength(3)
    expect(r.state.endAfterSeat).toBe(1)
    expect(r.events).toContainEqual({ type: 'finalTurn', seat: 1 })
    expect(tableView(r.state, seats).finalTurn).toBe(true)
    const troll = r.state.players[1].hand.find((id) => CARD_BY_ID[id].kind === 'troll')!
    const end = act(r.state, 1, { type: 'play', cardIds: [troll] })
    expect(end.state.result).not.toBeNull()
    expect(types(end.events)).toContain('gameOver')
    expect(game.isFinished(end.state)).toBe(true)
    expect(game.activeSeats(end.state)).toEqual([])
  })

  it('a player who cannot draw any cards has played their final turn; the opponent gets one more', () => {
    const s = base()
    const tr = hand(s, 0, 'troll')
    hand(s, 0, 'dwarf') // keep a card in hand
    s.players[0].deck = [] // ...but nothing left to draw
    hand(s, 1, 'treasure')
    const r = act(s, 0, { type: 'play', cardIds: tr })
    expect(r.state.endAfterSeat).toBe(1)
    const tc = r.state.players[1].hand[0]
    const end = act(r.state, 1, { type: 'play', cardIds: [tc] })
    expect(end.state.result).not.toBeNull()
  })

  it('an end trigger during the final turn changes nothing', () => {
    const s = base()
    s.endAfterSeat = 0
    const tr = hand(s, 0, 'troll')
    s.players[0].deck = [] // would trigger the end again; it's already the final turn
    const r = act(s, 0, { type: 'play', cardIds: tr })
    expect(r.state.result).not.toBeNull()
  })

  it('passing with an empty hand ends the turn (and, with an empty deck, triggers the end)', () => {
    const s = base()
    s.players[0].deck = []
    expect(legalActions(s, 0)).toEqual([{ type: 'pass' }])
    const r = act(s, 0, { type: 'pass' })
    expect(types(r.events)).toEqual(['passed', 'finalTurn', 'turnChanged'])
    expect(r.state.endAfterSeat).toBe(1)
  })

  it('scores the score piles plus 3 for the Great Dragon', () => {
    const s = base()
    s.players[0].score = [draw(s, 0, 'treasure', 4), draw(s, 0, 'dwarf', 3)] // 7
    s.players[1].score = [draw(s, 1, 'fireDragon', 4), draw(s, 1, 'treasure', 4)] // 8
    s.greatDragon = 0 // 7 + 3 = 10
    s.endAfterSeat = 0
    s.players[0].hand = [draw(s, 0, 'troll', 1)]
    const r = act(s, 0, { type: 'play', cardIds: s.players[0].hand.slice() })
    expect(r.state.result).toEqual({ scores: [10, 8], winners: [0] })
  })

  it('a tie goes to the Great Dragon holder, otherwise it is shared', () => {
    const s = base()
    s.players[0].score = [draw(s, 0, 'treasure', 4), draw(s, 0, 'treasure', 1)] // 5
    s.players[1].score = [draw(s, 1, 'treasure', 2)] // 2 + 3 dragon = 5
    s.greatDragon = 1
    s.endAfterSeat = 0
    s.players[0].hand = [draw(s, 0, 'troll', 1)]
    const tie = act(s, 0, { type: 'play', cardIds: s.players[0].hand.slice() })
    expect(tie.state.result).toEqual({ scores: [5, 5], winners: [1] })

    const t = base()
    t.players[0].score = [draw(t, 0, 'treasure', 4)]
    t.players[1].score = [draw(t, 1, 'treasure', 4)]
    t.endAfterSeat = 0
    t.players[0].hand = [draw(t, 0, 'troll', 1)]
    const shared = act(t, 0, { type: 'play', cardIds: t.players[0].hand.slice() })
    expect(shared.state.result).toEqual({ scores: [4, 4], winners: [0, 1] })
    expect(game.winners(shared.state)).toEqual([0, 1])
  })

  it('cards left in hand score nothing', () => {
    const s = base()
    s.endAfterSeat = 0
    s.players[0].hand = [draw(s, 0, 'troll', 1), draw(s, 0, 'treasure', 4)]
    const r = act(s, 0, { type: 'play', cardIds: [s.players[0].hand[0]] })
    expect(r.state.result!.scores[0]).toBe(0)
  })
})

describe('legal actions and previews', () => {
  it('enumerates value multisets that fit, times each collect choice', () => {
    const s = base()
    hand(s, 0, 'dwarf', 1, 3)
    hand(s, 0, 'dwarf', 2, 1)
    hand(s, 0, 'sorceress', 1)
    onSpace(s, 1, 'treasure', 1)
    onSpace(s, 1, 'petrified', 1)
    const legal = legalActions(s, 0)
    const dwarfPlays = legal.filter((a) => a.type === 'play' && CARD_BY_ID[a.cardIds[0]].kind === 'dwarf')
    // values {3} ×{1,1}: choose 0-1 of the 3 and 0-2 of the 1s, minus the empty pick = 5
    expect(dwarfPlays).toHaveLength(5)
    const sorc = legal.filter((a) => a.type === 'play' && CARD_BY_ID[a.cardIds[0]].kind === 'sorceress')
    expect(sorc.map((a) => (a as { collect?: string }).collect).sort()).toEqual(['petrified', 'treasure'])
    for (const a of legal) expect(game.applyAction(s, 0, a, rng).ok).toBe(true)
    expect(legalActions(s, 1)).toEqual([])
  })

  it('respects capacity in the enumeration', () => {
    const s = base()
    onSpace(s, 1, 'dwarf', 3)
    hand(s, 0, 'dwarf', 3)
    const legal = legalActions(s, 0)
    expect(legal.every((a) => a.type === 'play' && a.cardIds.length === 1)).toBe(true)
  })

  it('previews what each play would collect', () => {
    const s = base()
    onSpace(s, 1, 'treasure', 2)
    onSpace(s, 1, 'petrified', 1)
    hand(s, 0, 'sorceress')
    const v = playerView(s, 0, seats)
    const toPet = v.options.find((o) => o.action.type === 'play' && o.action.collect === 'petrified')!
    expect(toPet.preview).toMatchObject({ space: 'sorceress', count: 1, collects: [{ from: 'petrified', count: 1 }], takesDragon: true })
    const toChest = v.options.find((o) => o.action.type === 'play' && o.action.collect === 'treasure')!
    expect(toChest.preview).toMatchObject({ collects: [{ from: 'treasure', count: 2 }], takesDragon: false })
  })
})

describe('hidden information', () => {
  function midGame() {
    const s = base()
    s.players[0].hand = [draw(s, 0, 'troll'), draw(s, 0, 'dwarf')]
    s.players[1].hand = [draw(s, 1, 'troll'), draw(s, 1, 'dwarf')]
    s.players[0].score = [draw(s, 0, 'treasure')]
    s.players[1].score = [draw(s, 1, 'treasure')]
    const stack = onSpace(s, 1, 'fireDragon', 3)
    return { s, stack }
  }

  it('the table never sees hands, decks, score piles or cards below the top of a stack', () => {
    const { s, stack } = midGame()
    const json = JSON.stringify(tableView(s, seats))
    const secret = [
      ...s.players.flatMap((p) => [...p.hand, ...p.deck, ...p.score]),
      ...stack.slice(0, -1),
    ]
    for (const id of secret) expect(json).not.toContain(`"${id}"`)
    expect(json).toContain(`"${stack[2]}"`)
  })

  it('the table shows each space’s card count and total points, but still only the top card of a stack', () => {
    const { s, stack } = midGame()
    const tv = tableView(s, seats)
    const fd = tv.spaces.fireDragon
    expect(fd.count).toBe(3)
    expect(fd.points).toBe(stack.reduce((a, id) => a + CARD_BY_ID[id].points, 0))
    expect(fd.visible).toEqual([stack[2]])
    expect(tv.spaces.treasure).toEqual({ count: 0, points: 0, visible: [] })
    expect(tv.belowShip.points).toBe(0)
  })

  it('a phone sees its own hand and score pile, never the opponent’s', () => {
    const { s } = midGame()
    const v = playerView(s, 0, seats)
    expect(v.hand).toEqual(s.players[0].hand)
    expect(v.scorePile).toEqual(s.players[0].score)
    const json = JSON.stringify(v)
    for (const id of [...s.players[1].hand, ...s.players[1].score, ...s.players[1].deck, ...s.players[0].deck]) {
      expect(json).not.toContain(`"${id}"`)
    }
  })

  it('collection events name only cards that were face-up', () => {
    const { s, stack } = midGame()
    const fdHolder = s
    const chest = onSpace(fdHolder, 1, 'treasure', 3)
    fdHolder.players[0].hand.push(draw(fdHolder, 0, 'fireDragon'))
    const play = fdHolder.players[0].hand.at(-1)!
    const r = act(fdHolder, 0, { type: 'play', cardIds: [play] })
    const json = JSON.stringify(r.events)
    for (const id of chest.slice(0, -1)) expect(json).not.toContain(`"${id}"`)
    expect(json).not.toContain(`"${stack[0]}"`)
    for (const e of r.events) {
      if (e.type === 'cardsDrawn') expect(Object.keys(e).sort()).toEqual(['count', 'seat', 'type'])
    }
  })

  it('reveals both score piles once the game is over', () => {
    const s = base()
    s.players[0].score = [draw(s, 0, 'treasure')]
    s.players[1].score = [draw(s, 1, 'treasure')]
    s.endAfterSeat = 0
    s.players[0].hand = [draw(s, 0, 'troll')]
    const r = act(s, 0, { type: 'play', cardIds: s.players[0].hand.slice() })
    expect(tableView(r.state, seats).result!.scorePiles).toEqual([s.players[0].score, s.players[1].score])
  })
})
