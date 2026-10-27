import { describe, expect, it } from 'vitest'
import { dragonheartModule, playerView, type DragonheartAction, type DragonheartState } from '@games/dragonheart/engine'
import { CARD_BY_ID } from '@games/dragonheart/data'
import { seededRng, type SeatInfo } from '@games/types'
import { choiceLabel, handGrid, matchingOptions, maxPerKind, previewText, selectable, seriesSummary, toggle } from './logic'

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
  it('leads with the points collected, then the dragon, Knights/Huntresses and ships', () => {
    expect(previewText(null)).toBe('')
    expect(previewText({ space: 'treasure', count: 1, collects: [], takesDragon: false, movesBelowShip: false, shipStack: null })).toBe('No cards collected')
    expect(previewText({ space: 'fireDragon', count: 1, collects: [{ from: 'treasure', count: 3, points: 7 }], takesDragon: false, movesBelowShip: false, shipStack: null })).toBe(
      'Takes 7 pts from Treasure Chest'
    )
    expect(previewText({ space: 'sorceress', count: 1, collects: [{ from: 'petrified', count: 2, points: 4 }], takesDragon: true, movesBelowShip: false, shipStack: null })).toBe(
      'Takes 4 pts from Petrified Dragon + the Great Dragon (+3)'
    )
    expect(previewText({ space: 'troll', count: 1, collects: [{ from: 'sorceress', count: 1, points: 1 }], takesDragon: false, movesBelowShip: false, shipStack: null })).toBe(
      'Takes 1 pt from Sorceress'
    )
    expect(previewText({ space: 'ship', count: 1, collects: [{ from: 'belowShip', count: 3, points: 4 }], takesDragon: false, movesBelowShip: false, shipStack: 3 })).toMatch(/^Takes 4 pts .*game ends/)
    expect(previewText({ space: 'knight', count: 1, collects: [{ from: 'troll', count: 1, points: 2 }], takesDragon: false, movesBelowShip: true, shipStack: null })).toMatch(/below the Ship/)
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

  it('keeps a landscape hand in one row however much room the action bar leaves', () => {
    // Before a tap (tall hand area) and after (the action bar takes height): still one row of 6.
    for (const h of [420, 300, 180, 120]) {
      const g = handGrid(820, h, 6, 336 / 220, 10, true)
      expect(g.rows).toBe(1)
      expect(g.cols).toBe(6)
      expect(g.cardW * (336 / 220)).toBeLessThanOrEqual(h + 0.5)
    }
    // Portrait may still use more rows.
    expect(handGrid(360, 520, 6, 336 / 220, 10, false).rows).toBeGreaterThan(1)
  })
})

describe('seriesSummary (match history across rematches)', () => {
  const players = [
    { seat: 0, name: 'Jeff' },
    { seat: 1, name: 'James' },
  ]

  it('is null until two games have been completed', () => {
    expect(seriesSummary(undefined, players)).toBeNull()
    expect(seriesSummary([], players)).toBeNull()
    expect(seriesSummary([{ scores: [72, 43], winners: [0] }], players)).toBeNull()
  })

  it('totals each seat and names the overall leader', () => {
    const s = seriesSummary(
      [
        { scores: [72, 43], winners: [0] },
        { scores: [40, 61], winners: [1] },
        { scores: [55, 50], winners: [0] },
      ],
      players
    )!
    expect(s.totals).toEqual([167, 154])
    expect(s.leaders).toEqual([0])
    expect(s.line).toBe('Jeff leads the series · 167 to 154')
  })

  it('can be led by a player who won fewer games', () => {
    const s = seriesSummary(
      [
        { scores: [30, 29], winners: [0] },
        { scores: [31, 30], winners: [0] },
        { scores: [10, 60], winners: [1] },
      ],
      players
    )!
    expect(s.leaders).toEqual([1])
    expect(s.line).toBe('James leads the series · 119 to 71')
  })

  it('reports a tied series', () => {
    const s = seriesSummary(
      [
        { scores: [50, 40], winners: [0] },
        { scores: [40, 50], winners: [1] },
      ],
      players
    )!
    expect(s.leaders).toEqual([0, 1])
    expect(s.line).toBe('Series tied · 90 to 90')
  })
})
