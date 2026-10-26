import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { dragonheartModule, tableView, type DragonheartAction, type DragonheartState } from '@games/dragonheart/engine'
import { seededRng, type SeatInfo } from '@games/types'
import { TableView, planAnimation, MAX_TURN_MS } from './TableView'
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
          const vanishes = plan.flyers.filter((f) => f.vanishAt != null)
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
