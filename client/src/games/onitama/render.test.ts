import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { onitamaModule, playerView, tableView, type OnitamaAction, type OnitamaState } from '@games/onitama/engine'
import { seededRng, type SeatInfo } from '@games/types'
import { TableView, planAnimation, MAX_TURN_MS } from './TableView'
import { PhoneView } from './PhoneView'
import type { GameInstance } from '../../types/game'

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const g = globalThis as unknown as Record<string, unknown>
  g.window ??= { innerWidth: 1920, innerHeight: 1080, matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} }
})

const seats: SeatInfo[] = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: ['red', 'blue'][i] }))
const instance = { id: 'x', joinCode: 'X', phase: 'playing', version: 1, hostUserId: 'h', game: { id: 'g', slug: 'onitama', name: 'Onitama', minPlayers: 2, maxPlayers: 2 }, players: [], tableView: null } as GameInstance
const noop = () => {}
const sound = { play: noop, registerFiles: noop, registerSynth: noop } as never

/** Plays a random game, calling onStep for every action; returns the states seen. */
function play(seed: number, onStep?: (prev: OnitamaState, next: OnitamaState, events: { type: string; [k: string]: unknown }[]) => void) {
  const rng = seededRng(seed)
  let { state } = onitamaModule.setup(seats, rng)
  const snaps = [state]
  for (let i = 0; i < 300 && !onitamaModule.isFinished(state); i++) {
    const seat = onitamaModule.activeSeats(state)[0]
    const legal = onitamaModule.legalActions(state, seat)
    const res = onitamaModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)] as OnitamaAction, rng)
    if (!res.ok) throw new Error(res.error)
    onStep?.(state, res.state, res.events)
    state = res.state
    if (i === 10) snaps.push(state)
  }
  snaps.push(state)
  return snaps
}

const tv = (st: OnitamaState, history?: GameInstance['history']) =>
  renderToString(createElement(TableView, { instance: { ...instance, history }, view: tableView(st, seats) as never, players: [], events: [], seq: 1, onEventsDone: noop, sound }))
const phone = (st: OnitamaState, seat: number, extra: Record<string, unknown> = {}) =>
  renderToString(
    createElement(PhoneView, {
      instance,
      view: playerView(st, seat, seats) as never,
      playerOrder: seat,
      me: undefined,
      players: [],
      sendAction: async () => true,
      pending: false,
      error: null,
      clearError: noop,
      ...extra,
    } as never)
  )

describe('onitama renders', () => {
  it('draws the TV table: 10 pieces as ink tokens (no images), 5 cards with diagrams, both temples', () => {
    const [start] = play(3)
    const html = tv(start)
    expect((html.match(/data-anchor="piece-/g) ?? []).length).toBe(10)
    expect((html.match(/data-card="/g) ?? []).length).toBe(5)
    expect((html.match(/data-diagram=""/g) ?? []).length).toBe(5)
    expect(html).toContain('師')
    expect(html).toContain('弟')
    expect(html).not.toContain('pieces/')
    expect(html).not.toContain('data-crown-cell')
  })

  it('draws each phone from its own side, with my cards and the opponent\'s', () => {
    const [start] = play(4)
    for (const seat of [0, 1]) {
      const html = phone(start, seat)
      expect(html).toContain('data-phone-board')
      // my 2 + opponent's 2 + side card
      expect((html.match(/data-card="/g) ?? []).length).toBe(5)
      expect(html).not.toContain('Game Over')
    }
  })

  it('shows the Final Score with a crown column, the way of victory, and the series once there are 2+ games', () => {
    const snaps = play(5)
    const end = snaps[snaps.length - 1]
    expect(end.result).not.toBeNull()
    const single = tv(end)
    expect(single).toContain('Final Score')
    expect((single.match(/data-crown-cell/g) ?? []).length).toBe(2)
    expect(single).toContain('data-way')
    expect(single).not.toContain('data-series=')
    const hist = [
      { scores: [1, 0], winners: [0] },
      { scores: [0, 1], winners: [1] },
    ]
    const series = tv(end, hist)
    expect(series).toContain('data-series=')
    expect(series).toContain('Series tied')
    const ph = phone(end, 0, { rematch: async () => true })
    expect(ph).toContain('Rematch')
    expect(ph).toContain('Final Score')
  })
})

describe('animation plan', () => {
  it('plans every real turn within the time cap, hiding only destinations that the new table renders', () => {
    let turns = 0
    for (const seed of [11, 12, 13]) {
      play(seed, (prev, next, events) => {
        const a = tableView(prev, seats)
        const b = tableView(next, seats)
        const plan = planAnimation(events, a, b, false)
        expect(plan.total).toBeLessThanOrEqual(MAX_TURN_MS)
        const html = tv(next)
        for (const anchor of plan.hidden) expect(html).toContain(`data-anchor="${anchor}"`)
        // the used card and the taken card both fly every turn
        expect(plan.flyers.length).toBeGreaterThanOrEqual(2)
        turns++
      })
    }
    expect(turns).toBeGreaterThan(20)
  })
})
