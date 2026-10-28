import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { onitamaModule, playerView, type MoveOption } from '@games/onitama/engine'
import { CARD_BY_ID } from '@games/onitama/data'
import { seededRng, type SeatInfo } from '@games/types'
import { ACTION_AREA_PX, phoneLayout, type Box } from './phoneLayout'
import { isSameMove, moveLabel, phoneCell, squareLabel } from './logic'
import { PhoneInGameAt } from './PhoneView'

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const g = globalThis as unknown as Record<string, unknown>
  g.window ??= { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} }
})

const inside = (b: Box, w: number, h: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('phoneLayout (portrait and landscape; the board never disappears)', () => {
  const sizes: [number, number][] = [
    [320, 480],
    [568, 320],
    [360, 640],
    [844, 390],
    [390, 844],
    [280, 360],
  ]
  for (const [w, h] of sizes) {
    it(`${w}×${h}`, () => {
      const L = phoneLayout(w, h)
      expect(L.orientation).toBe(w > h ? 'landscape' : 'portrait')
      expect(L.board.w).toBeGreaterThan(80)
      expect(L.board.w).toBe(L.board.h)
      for (const b of [L.board, L.opp, L.cards, L.action]) expect(inside(b, w, h)).toBe(true)
      expect(L.action.h).toBe(ACTION_AREA_PX)
      expect(overlap(L.board, L.cards)).toBe(false)
      expect(overlap(L.board, L.action)).toBe(false)
      expect(overlap(L.board, L.opp)).toBe(false)
      expect(overlap(L.cards, L.action)).toBe(false)
      expect(L.handW).toBeGreaterThan(0)
    })
  }

  it('lays the board out to the left in landscape and on top of the cards in portrait', () => {
    const land = phoneLayout(844, 390)
    expect(land.board.x + land.board.w).toBeLessThanOrEqual(land.cards.x)
    const port = phoneLayout(390, 844)
    expect(port.board.y + port.board.h).toBeLessThanOrEqual(port.cards.y)
  })

  it('does not depend on what is selected (only on the size)', () => {
    expect(phoneLayout(390, 700)).toEqual(phoneLayout(390, 700))
  })
})

describe('move labels from the player’s own perspective', () => {
  it('names files A–E left to right and ranks 1–5 from my home row', () => {
    // Blue: home row y=4 at the bottom; Red: home row y=0 at the bottom (board flipped).
    expect(squareLabel([0, 4], 'blue')).toBe('A1')
    expect(squareLabel([4, 0], 'blue')).toBe('E5')
    expect(squareLabel([4, 0], 'red')).toBe('A1')
    expect(squareLabel([2, 2], 'red')).toBe('C3')
    for (const me of ['red', 'blue'] as const) {
      const [col, row] = phoneCell([1, 3], me)
      expect(squareLabel([1, 3], me)).toBe(`${'ABCDE'[col]}${5 - row}`)
    }
  })

  it('describes the chosen move for the confirm bar', () => {
    const o = { action: { type: 'move', card: 'tiger', from: [2, 4], to: [2, 2] }, danger: false, wins: false } as MoveOption
    expect(moveLabel(o, false, 'Tiger', 'blue')).toBe('Move Student to C3 with Tiger')
    expect(moveLabel({ ...o, wins: true }, true, 'Tiger', 'blue')).toBe('Move Master to C3 with Tiger — this wins!')
    expect(isSameMove(o, { ...o })).toBe(true)
    expect(isSameMove(o, { ...o, action: { ...o.action, to: [1, 2] } as MoveOption['action'] })).toBe(false)
    expect(isSameMove(null, o)).toBe(false)
  })
})

describe('the selected destination is marked on the board', () => {
  const seats: SeatInfo[] = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: ['red', 'blue'][i] }))
  const { state } = onitamaModule.setup(seats, seededRng(5))
  const seat = onitamaModule.activeSeats(state)[0]
  const view = playerView(state, seat, seats)
  // A card+piece with at least two destinations, so "which one is chosen" matters.
  const groups = new Map<string, MoveOption[]>()
  for (const o of view.options) {
    if (o.action.type !== 'move') continue
    const k = `${o.action.card}|${o.action.from.join(',')}`
    groups.set(k, [...(groups.get(k) ?? []), o])
  }
  const multi = [...groups.values()].find((g) => g.length >= 2)!
  const chosen = multi[0]
  const a = chosen.action as { card: string; from: [number, number] }
  const render = (w: number, h: number) =>
    renderToString(
      createElement(PhoneInGameAt, {
        w,
        h,
        view,
        opp: view.players.find((p) => p.seat !== seat),
        options: view.options,
        isMyTurn: true,
        passOnly: false,
        pending: false,
        selCard: a.card,
        selFrom: a.from,
        confirm: chosen,
        onPick: () => {},
        onPiece: () => {},
        onDest: () => {},
        onCancel: () => {},
        act: async () => true,
      })
    )

  it('marks exactly one selected square, keeps the other options as plain highlights, and names the move', () => {
    expect(multi.length).toBeGreaterThanOrEqual(2)
    for (const [w, h] of [
      [390, 700],
      [844, 390],
    ] as const) {
      const html = render(w, h)
      expect((html.match(/data-dest-selected/g) ?? []).length).toBe(1)
      expect((html.match(/data-dest="/g) ?? []).length).toBe(multi.length - 1)
      const master = !!view.board.find((p) => p.x === a.from[0] && p.y === a.from[1])?.master
      const text = moveLabel(chosen, master, CARD_BY_ID[a.card].name, view.myColor).replace('—', '&#x2014;')
      expect(html).toContain('data-confirm-text')
      expect(html.includes(text) || html.includes(moveLabel(chosen, master, CARD_BY_ID[a.card].name, view.myColor))).toBe(true)
      expect(html).toContain('oni-sel-arrow')
    }
  })
})
