import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { splendorModule, tableView, type SplendorAction, type SplendorState } from '@games/splendor/engine'
import { seededRng, type SeatInfo } from '@games/types'
import { TableView } from './TableView'
import { PhoneView } from './PhoneView'
import type { GameInstance } from '../../types/game'

// Smoke test: both views render real engine states (start, mid-game, pending, finished) without throwing.
beforeAll(() => {
  // SSR warns that layout effects don't run on the server; that's expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const g = globalThis as unknown as Record<string, unknown>
  g.window ??= { innerWidth: 1920, innerHeight: 1080, matchMedia: () => ({ matches: false }) }
})

const seats: SeatInfo[] = [0, 1, 2].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: ['red', 'blue', 'green'][i] }))
const instance = { id: 'x', joinCode: 'X', phase: 'playing', version: 1, hostUserId: 'h', game: { id: 'g', slug: 'splendor', name: 'Splendor', minPlayers: 2, maxPlayers: 4 }, players: [], tableView: null } as GameInstance
const noop = () => {}
const sound = { play: noop, registerFiles: noop, registerSynth: noop } as never

function states(): SplendorState[] {
  const rng = seededRng(7)
  let { state } = splendorModule.setup(seats, rng)
  const out = [state]
  let sawPending = false
  for (let i = 0; i < 400 && !splendorModule.isFinished(state); i++) {
    const seat = splendorModule.activeSeats(state)[0]
    const legal = splendorModule.legalActions(state, seat)
    const res = splendorModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)] as SplendorAction, rng)
    if (!res.ok) throw new Error(res.error)
    state = res.state
    if (state.pending && !sawPending) {
      sawPending = true
      out.push(state)
    }
    if (i === 60) out.push(state)
  }
  out.push(state)
  return out
}

describe('splendor views render', () => {
  it('renders the table and every phone for start, mid-game, pending and finished states', () => {
    for (const s of states()) {
      const tv = splendorModule.tableView(s, seats)
      const html = renderToString(
        createElement(TableView, { instance, view: tv as never, players: [], events: [], seq: 1, onEventsDone: noop, sound })
      )
      expect(html).toContain('Splendor')
      for (const seat of seats) {
        const pv = splendorModule.playerView(s, seat.playerOrder, seats)
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
  it('turns real engine events into flyers, hidden destinations and sounds within ~2.5s', async () => {
    const { planAnimation } = await import('./TableView')
    const rng = seededRng(3)
    let { state } = splendorModule.setup(seats.slice(0, 2), rng)
    // Any anchor resolves to some rect: we only check the plan's shape, not geometry.
    const anyRect = { get: () => ({ x: 10, y: 10, w: 50, h: 70 }) } as unknown as Map<string, { x: number; y: number; w: number; h: number }>
    const seen = new Set<string>()
    for (let i = 0; i < 300 && !splendorModule.isFinished(state); i++) {
      const seat = splendorModule.activeSeats(state)[0]
      const legal = splendorModule.legalActions(state, seat)
      const prev = tableView(state, seats.slice(0, 2))
      const res = splendorModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)] as SplendorAction, rng)
      if (!res.ok) throw new Error(res.error)
      state = res.state
      const next = tableView(state, seats.slice(0, 2))
      const plan = planAnimation(res.events, prev, next, anyRect, anyRect, false)
      expect(plan.total).toBeLessThanOrEqual(2500)
      for (const e of res.events) seen.add(e.type)
      const taken = res.events.find((e) => e.type === 'gemsTaken')
      if (taken) {
        const n = Object.values(taken.gems as Record<string, number>).reduce((a, b) => a + b, 0)
        expect(plan.flyers.length).toBeGreaterThanOrEqual(n)
      }
      const bought = res.events.find((e) => e.type === 'cardBought')
      if (bought) expect(plan.hidden).toContain(`card-${bought.cardId}`)
      if (res.events.some((e) => e.type === 'cardReserved')) expect(plan.hidden.some((h) => h.includes('-res-'))).toBe(true)
      if (res.events.length) expect(plan.sounds.length).toBeGreaterThan(0)
    }
    expect(seen.has('gemsTaken')).toBe(true)
    expect(seen.has('cardBought')).toBe(true)
  })
})

describe('play-test round 2 UI', () => {
  function finishedState(options?: unknown): SplendorState {
    const rng = seededRng(21)
    let { state } = splendorModule.setup(seats, rng, options)
    for (let i = 0; i < 2000 && !splendorModule.isFinished(state); i++) {
      const seat = splendorModule.activeSeats(state)[0]
      const legal = splendorModule.legalActions(state, seat)
      const res = splendorModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)] as SplendorAction, rng)
      if (!res.ok) throw new Error(res.error)
      state = res.state
    }
    return state
  }
  const phone = (s: SplendorState, seat: number) =>
    renderToString(
      createElement(PhoneView, {
        instance,
        view: splendorModule.playerView(s, seat, seats) as never,
        playerOrder: seat,
        me: undefined,
        players: [],
        sendAction: async () => true,
        pending: false,
        error: null,
        clearError: noop,
      })
    )

  it('final scores show a crown column instead of rank numbers (TV and phone)', () => {
    const s = finishedState()
    expect(s.result).toBeTruthy()
    const tv = renderToString(
      createElement(TableView, { instance, view: splendorModule.tableView(s, seats) as never, players: [], events: [], seq: 1, onEventsDone: noop, sound })
    )
    const crowns = tv.match(/data-crown-col/g) ?? []
    expect(crowns).toHaveLength(3)
    expect(tv).not.toMatch(/>\s*[123]\.\s*</)
    const ph = phone(s, 0)
    expect(ph.match(/data-crown-col/g) ?? []).toHaveLength(3)
    expect(ph).toContain('👑')
  })

  it('affordable cards glow blue with no checkmark', async () => {
    const { AFFORDABLE_GLOW, AffordableMark } = await import('./PhoneView')
    expect(AFFORDABLE_GLOW).toContain('#60a5fa')
    const html = renderToString(createElement(AffordableMark))
    expect(html).toContain('data-affordable')
    expect(html).toContain('96,165,250')
    expect(html).not.toContain('✓')
    expect(html).not.toContain('#86efac')
  })

  it('renders a randomized deck from the view’s card definitions, with paired portraits', () => {
    const { state } = splendorModule.setup(seats, seededRng(8), { randomizeCards: true })
    const view = tableView(state, seats)
    const tv = renderToString(createElement(TableView, { instance, view: view as never, players: [], events: [], seq: 1, onEventsDone: noop, sound }))
    // board cards render (their scenes come from the generated defs, not the default set)
    const boardIds = [1, 2, 3].flatMap((t) => view.board[t as 1 | 2 | 3]).filter(Boolean) as string[]
    expect(boardIds.every((id) => id.startsWith('x'))).toBe(true)
    expect((tv.match(/spl-card/g) ?? []).length).toBeGreaterThanOrEqual(boardIds.length + view.nobles.length)
    for (const portrait of Object.values(view.noblePortraits)) expect(tv).toContain(portrait)
    expect(phone(state, 0)).toContain('Gems')
  })
})
