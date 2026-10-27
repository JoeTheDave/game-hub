import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { dragonheartModule, tableView, type DragonheartAction, type DragonheartState } from '@games/dragonheart/engine'
import { seededRng, type SeatInfo } from '@games/types'
import { TableView, planAnimation, MAX_TURN_MS, noteText } from './TableView'
import { slotRect } from './layout'
import { flyerZ } from './flyers'
import { PhoneView } from './PhoneView'
import type { GameInstance } from '../../types/game'

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const g = globalThis as unknown as Record<string, unknown>
  g.window ??= { innerWidth: 1920, innerHeight: 1080, matchMedia: () => ({ matches: false }) }
})

const seats: SeatInfo[] = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: ['red', 'blue'][i] }))
const instance = { id: 'x', joinCode: 'X', phase: 'playing', version: 1, hostUserId: 'h', game: { id: 'g', slug: 'dragonheart', name: 'Dragonheart', minPlayers: 2, maxPlayers: 2 }, players: [], tableView: null } as GameInstance
const noop = () => {}
const sound = { play: noop, registerFiles: noop, registerSynth: noop } as never

function play(seed: number, onStep?: (prev: DragonheartState, next: DragonheartState, events: { type: string; [k: string]: unknown }[]) => void) {
  const rng = seededRng(seed)
  let { state } = dragonheartModule.setup(seats, rng)
  const snaps = [state]
  for (let i = 0; i < 400 && !dragonheartModule.isFinished(state); i++) {
    const seat = dragonheartModule.activeSeats(state)[0]
    const legal = dragonheartModule.legalActions(state, seat)
    const res = dragonheartModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)] as DragonheartAction, rng)
    if (!res.ok) throw new Error(res.error)
    onStep?.(state, res.state, res.events)
    state = res.state
    if (i === 20 || (state.greatDragon !== 'board' && snaps.length < 3)) snaps.push(state)
  }
  snaps.push(state)
  return snaps
}

describe('dragonheart views render', () => {
  it('renders the table and both phones for start, mid-game, dragon-held and finished states', () => {
    for (const s of play(5)) {
      const tv = tableView(s, seats)
      const html = renderToString(createElement(TableView, { instance, view: tv as never, players: [], events: [], seq: 1, onEventsDone: noop, sound }))
      expect(html.length).toBeGreaterThan(1000)
      if (tv.finished) expect(html).toContain('Dragonheart')
      for (const seat of seats) {
        const pv = dragonheartModule.playerView(s, seat.playerOrder, seats)
        renderToString(
          createElement(PhoneView, {
            instance,
            view: pv as never,
            playerOrder: seat.playerOrder,
            me: undefined,
            players: [],
            sendAction: async () => true,
            pending: false,
            error: null,
            clearError: noop,
          })
        )
      }
    }
  })
})

describe('stack notes', () => {
  it('shows a subtle "count · points" only for 2 or more cards', () => {
    expect(noteText(3, 7)).toBe('3 · 7')
    expect(noteText(2, 0)).toBe('2 · 0')
    expect(noteText(1, 4)).toBeNull()
    expect(noteText(0, 0)).toBeNull()
  })

  it('renders a note on the TV for every space holding 2+ cards, and no post-it tags', () => {
    const snaps = play(7)
    for (const st of snaps) {
      const tv = tableView(st, seats)
      const html = renderToString(createElement(TableView, { instance, view: tv as never, players: [], events: [], seq: 1, onEventsDone: noop, sound }))
      const multi = Object.values(tv.spaces).filter((sv) => sv.count >= 2).length + (tv.belowShip.count >= 2 ? 1 : 0)
      expect((html.match(/dh-stacknote/g) ?? []).length).toBe(multi)
      expect(html).not.toContain('dh-tag')
    }
  })
})

/** A minimal table view for planner tests. */
function fakeView(spaces: Partial<Record<string, string[]>>) {
  const all = ['treasure', 'fireDragon', 'petrified', 'sorceress', 'troll', 'dwarf', 'knight', 'huntress', 'ship']
  return {
    spaces: Object.fromEntries(all.map((k) => [k, { count: spaces[k]?.length ?? 0, visible: spaces[k] ?? [], points: 0 }])),
    belowShip: { count: 0, visible: [], points: 0 },
    shipStacks: [],
    greatDragon: 'board',
    players: [0, 1].map((seat) => ({ seat, name: `P${seat}`, color: null, deck: seat ? 'red' : 'green', handCount: 5, deckCount: 30, scoreCount: 0, handMax: 5, hasDragon: false })),
    turn: 0,
    firstPlayer: 0,
    endAfterSeat: null,
    finalTurn: false,
    lastPlay: null,
    result: null,
    finished: false,
  } as never
}

describe('layering: a played card always lands on top', () => {
  it('the completing 4th Dwarf lands in the front outline above the other three, and stays on top as the set is collected', () => {
    const prev = fakeView({ dwarf: ['g-20', 'g-21', 'r-22'] })
    const next = fakeView({})
    const events = [
      { type: 'cardsPlayed', seat: 0, space: 'dwarf', cardIds: ['g-23'] },
      { type: 'cardsCollected', seat: 0, from: 'dwarf', count: 4, visibleIds: ['g-20', 'g-21', 'r-22', 'g-23'] },
    ]
    const plan = planAnimation(events, prev, next, false)
    const landing = plan.flyers[0]
    const front = slotRect('dwarf', 3)
    expect(landing.to).toEqual(front)
    const others = plan.flyers.filter((f) => f !== landing && f.appear !== false)
    expect(others.length).toBe(3)
    for (const o of others) expect(flyerZ(landing)).toBeGreaterThan(flyerZ(o))
    const continued = plan.flyers.find((f) => f.appear === false)!
    for (const o of others) expect(flyerZ(continued)).toBeGreaterThan(flyerZ(o))
  })

  it('every capacity space: each successive play lands above the cards already there', () => {
    for (const [space, cap] of [['knight', 2], ['huntress', 3], ['ship', 3], ['dwarf', 4]] as const) {
      for (let before = 1; before < cap; before++) {
        const ids = Array.from({ length: before }, (_, i) => `g-${String(10 + i).padStart(2, '0')}`)
        const plan = planAnimation([{ type: 'cardsPlayed', seat: 0, space, cardIds: ['r-40'] }], fakeView({ [space]: ids }), fakeView({ [space]: [...ids, 'r-40'] }), false)
        const f = plan.flyers[0]
        expect(f.to).toEqual(slotRect(space, before))
        // the board draws existing cards at z 2..; flyers sit above every board card
        expect(flyerZ(f)).toBeGreaterThan(2 + cap)
        expect(plan.hidden).toContain(`slot-${space}-${before}`)
      }
    }
  })

  it('a stack keeps showing its previous top under the incoming card until it lands', () => {
    const plan = planAnimation(
      [{ type: 'cardsPlayed', seat: 1, space: 'treasure', cardIds: ['r-01', 'r-02'] }],
      fakeView({ treasure: ['g-01'] }),
      fakeView({ treasure: ['g-01', 'r-01', 'r-02'] }),
      false
    )
    const ghost = plan.flyers.find((f) => f.from === f.to)!
    const incoming = plan.flyers.filter((f) => f !== ghost)
    expect(incoming.length).toBe(2)
    for (const f of incoming) expect(flyerZ(f)).toBeGreaterThan(flyerZ(ghost))
    expect(flyerZ(incoming[1])).toBeGreaterThan(flyerZ(incoming[0]))
    expect(ghost.vanishAt).toBeCloseTo(incoming[1].delay + incoming[1].duration)
  })
})

describe('animation planning', () => {
  it('plans every real turn within the cap, hides each destination, and chains cards that move twice', () => {
    const seen = new Set<string>()
    let turns = 0
    for (const seed of [1, 2, 3]) {
      play(seed, (prevS, nextS, events) => {
        turns++
        const prev = tableView(prevS, seats)
        const next = tableView(nextS, seats)
        const plan = planAnimation(events, prev, next, false)
        for (const e of events) seen.add(e.type)
        expect(plan.total).toBeLessThanOrEqual(MAX_TURN_MS)
        for (const f of plan.flyers) {
          expect(f.delay + f.duration).toBeLessThanOrEqual(MAX_TURN_MS + 1)
          expect(f.duration).toBeGreaterThan(0)
        }
        const played = events.find((e) => e.type === 'cardsPlayed')
        if (played) {
          expect(plan.flyers.length).toBeGreaterThanOrEqual((played.cardIds as string[]).length)
          expect(plan.hidden.some((h) => h.startsWith('slot-') || h.startsWith('top-'))).toBe(true)
        }
        if (events.some((e) => e.type === 'greatDragonMoved')) expect(plan.hidden).toContain('dragon')
        // A card that moves twice (played, then sent below the Ship / to a ship stack / collected)
        // rests where it landed until its second flight starts, which is hidden until then: the
        // copies hand over at the same instant, so the card is never missing or doubled.
        const chained = plan.flyers.filter((f) => f.appear === false)
        if (events.some((e) => e.type === 'movedBelowShip' || e.type === 'shipStackFormed')) {
          expect(chained.length).toBeGreaterThan(0)
          const starts = new Set(chained.map((f) => Math.round(f.delay)))
          const vanishes = plan.flyers.filter((f) => f.vanishAt != null && f.from !== f.to)
          expect(vanishes.length).toBe(chained.length)
          for (const v of vanishes) {
            expect(v.vanishAt!).toBeGreaterThanOrEqual(v.delay + v.duration - 1)
            expect(starts.has(Math.round(v.vanishAt!))).toBe(true)
          }
        }
        if (events.length) expect(plan.sounds.length).toBeGreaterThan(0)
      })
    }
    expect(turns).toBeGreaterThan(150)
    for (const t of ['cardsPlayed', 'cardsCollected', 'cardsDrawn', 'movedBelowShip', 'shipStackFormed', 'greatDragonMoved']) expect(seen.has(t)).toBe(true)
  })
})
