import { describe, expect, it } from 'vitest'
import { dragonheartModule, playerView, type DragonheartAction, type DragonheartState } from '@games/dragonheart/engine'
import { CARD_BY_ID } from '@games/dragonheart/data'
import { seededRng, type SeatInfo } from '@games/types'
import { choiceLabel, handGrid, matchingOptions, maxPerKind, previewText, selectable, toggle } from './logic'

const seats: SeatInfo[] = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))

/** Walk random games and hand back every state with its current seat's player view. */
function* views(games = 20) {
  for (let g = 0; g < games; g++) {
    const rng = seededRng(100 + g)
    let { state } = dragonheartModule.setup(seats, rng)
    for (let i = 0; i < 200 && !dragonheartModule.isFinished(state); i++) {
      const seat = dragonheartModule.activeSeats(state)[0]
      yield { state, view: playerView(state, seat, seats) }
      const legal = dragonheartModule.legalActions(state, seat)
      const res = dragonheartModule.applyAction(state, seat, legal[Math.floor(rng() * legal.length)] as DragonheartAction, rng)
      if (!res.ok) throw new Error(res.error)
      state = res.state as DragonheartState
    }
  }
}

describe('hand selection', () => {
  it('only lets same-kind cards join a selection, capped by what the space can take', () => {
    for (const { view } of views()) {
      const max = maxPerKind(view.options)
      for (const id of view.hand) {
        let sel: string[] = []
        sel = toggle(view.options, sel, id)
        const k = CARD_BY_ID[id].kind
        if (!max[k]) {
          expect(sel).toEqual([])
          continue
        }
        expect(sel).toEqual([id])
        // fill the selection with every other same-kind card the rules allow
        for (const other of view.hand) if (other !== id && CARD_BY_ID[other].kind === k) sel = toggle(view.options, sel, other)
        expect(sel.every((x) => CARD_BY_ID[x].kind === k)).toBe(true)
        expect(sel.length).toBeLessThanOrEqual(max[k]!)
        // and every reachable selection is a legal play (1 option, or 2 for a collect choice)
        const m = matchingOptions(view.options, sel)
        expect(m.length === 1 || m.length === 2).toBe(true)
        expect((m[0].action as { cardIds: string[] }).cardIds).toEqual(sel)
      }
    }
  })

  it('tapping another kind starts a new selection; tapping a selected card removes it', () => {
    for (const { view } of views(5)) {
      const kinds = [...new Set(view.hand.map((id) => CARD_BY_ID[id].kind))].filter((k) => maxPerKind(view.options)[k])
      if (kinds.length < 2) continue
      const a = view.hand.find((id) => CARD_BY_ID[id].kind === kinds[0])!
      const b = view.hand.find((id) => CARD_BY_ID[id].kind === kinds[1])!
      expect(selectable(view.options, [a], b)).toBe(true)
      expect(toggle(view.options, [a], b)).toEqual([b])
      expect(toggle(view.options, [a], a)).toEqual([])
      return
    }
  })

  it('offers two collect choices for a Sorceress or Knight play when both targets hold cards', () => {
    let seen = false
    for (const { view } of views(40)) {
      for (const o of view.options) {
        if (o.action.type !== 'play' || !o.action.collect) continue
        const m = matchingOptions(view.options, o.action.cardIds)
        expect(m).toHaveLength(2)
        expect(new Set(m.map((x) => (x.action as { collect?: string }).collect)).size).toBe(2)
        for (const x of m) expect(choiceLabel(x)).toMatch(/^Take /)
        seen = true
      }
      if (seen) break
    }
    expect(seen).toBe(true)
  })
})

describe('previewText', () => {
  it('describes collections, the dragon, Knights/Huntresses and ships', () => {
    expect(previewText(null)).toBe('')
    expect(previewText({ space: 'treasure', count: 1, collects: [], takesDragon: false, movesBelowShip: false, shipStack: null })).toBe('No effect this turn')
    expect(previewText({ space: 'sorceress', count: 1, collects: [{ from: 'petrified', count: 2 }], takesDragon: true, movesBelowShip: false, shipStack: null })).toBe(
      'Collects 2 cards from Petrified Dragon, takes the Great Dragon'
    )
    expect(previewText({ space: 'ship', count: 1, collects: [{ from: 'belowShip', count: 3 }], takesDragon: false, movesBelowShip: false, shipStack: 3 })).toMatch(/game ends/)
    expect(previewText({ space: 'knight', count: 1, collects: [{ from: 'troll', count: 1 }], takesDragon: false, movesBelowShip: true, shipStack: null })).toMatch(/below the Ship/)
  })
})

describe('handGrid', () => {
  it('fits up to six portrait cards without scrolling, as large as possible', () => {
    for (const [w, h] of [
      [360, 420],
      [390, 520],
      [700, 300],
    ]) {
      for (let n = 1; n <= 6; n++) {
        const g = handGrid(w, h, n, 88 / 63, 10)
        expect(g.cols * g.rows).toBeGreaterThanOrEqual(n)
        expect(g.cols * g.cardW + (g.cols - 1) * 10).toBeLessThanOrEqual(w)
        expect(g.rows * g.cardW * (88 / 63) + (g.rows - 1) * 10).toBeLessThanOrEqual(h + 0.5)
        expect(g.cardW).toBeGreaterThan(40)
      }
    }
  })
})
