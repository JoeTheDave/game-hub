import { describe, expect, it } from 'vitest'
import { CARDS } from '@games/onitama/data'
import { boardDelta, type MoveOption } from '@games/onitama/engine'
import { TV_FACING, destinations, diagramCell, movablePieces, mustPass, phoneCell, phoneSquare, seriesSummary, tvCell, wayLine } from './logic'

describe('move diagrams match the board', () => {
  // For every card move, the diagram cell (relative to centre) must equal the on-screen delta that
  // move produces on the board, for each player, on both the TV and the phone.
  it('TV: a card held by red or blue shows its moves exactly as they travel on the TV board', () => {
    for (const card of CARDS) {
      for (const color of ['red', 'blue'] as const) {
        for (const m of card.moves) {
          const [cx, cy] = diagramCell(m, TV_FACING[color])
          const d = boardDelta(color, m)
          const a = tvCell([2, 2])
          const b = tvCell([2 + d[0], 2 + d[1]])
          expect([cx - 2, cy - 2]).toEqual([b[0] - a[0], b[1] - a[1]])
        }
      }
    }
  })

  it('phone: my cards (facing up) show moves as they travel on my own-side board', () => {
    for (const card of CARDS) {
      for (const color of ['red', 'blue'] as const) {
        for (const m of card.moves) {
          const [cx, cy] = diagramCell(m, 'up')
          const d = boardDelta(color, m)
          const a = phoneCell([2, 2], color)
          const b = phoneCell([2 + d[0], 2 + d[1]], color)
          expect([cx - 2, cy - 2]).toEqual([b[0] - a[0], b[1] - a[1]])
        }
      }
    }
  })

  it("phone: the opponent's cards (facing down) show their moves as seen from my side", () => {
    for (const card of CARDS) {
      for (const [me, them] of [['red', 'blue'], ['blue', 'red']] as const) {
        for (const m of card.moves) {
          const [cx, cy] = diagramCell(m, 'down')
          const d = boardDelta(them, m)
          const a = phoneCell([2, 2], me)
          const b = phoneCell([2 + d[0], 2 + d[1]], me)
          expect([cx - 2, cy - 2]).toEqual([b[0] - a[0], b[1] - a[1]])
        }
      }
    }
  })

  it('puts each player\'s home row at the bottom of their phone, and phoneSquare inverts phoneCell', () => {
    expect(phoneCell([0, 0], 'red')[1]).toBe(4)
    expect(phoneCell([0, 4], 'blue')[1]).toBe(4)
    for (const color of ['red', 'blue'] as const)
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) expect(phoneSquare(phoneCell([x, y], color), color)).toEqual([x, y])
  })
})

describe('selection helpers', () => {
  const mv = (card: string, from: [number, number], to: [number, number], danger = false): MoveOption => ({ action: { type: 'move', card, from, to }, danger, wins: false })
  const options = [mv('tiger', [2, 0], [2, 2]), mv('tiger', [1, 0], [1, 2], true), mv('crab', [2, 0], [2, 1])]

  it('lists the pieces a card can move, and the destinations for a card + piece', () => {
    expect(movablePieces(options, 'tiger')).toEqual([[2, 0], [1, 0]])
    expect(destinations(options, 'tiger', [1, 0]).map((o) => o.danger)).toEqual([true])
    expect(destinations(options, null, [1, 0])).toEqual([])
  })

  it('detects a forced pass', () => {
    expect(mustPass([{ type: 'pass', card: 'tiger' }, { type: 'pass', card: 'crab' }])).toBe(true)
    expect(mustPass([{ type: 'move', card: 'tiger', from: [0, 0], to: [0, 1] }])).toBe(false)
  })

  it('summarises a series of wins and names the way of victory', () => {
    expect(seriesSummary([{ scores: [1, 0], winners: [0] }], [{ seat: 0, name: 'A' }, { seat: 1, name: 'B' }])).toBeNull()
    const s = seriesSummary([{ scores: [1, 0], winners: [0] }, { scores: [1, 0], winners: [0] }, { scores: [0, 1], winners: [1] }], [{ seat: 0, name: 'A' }, { seat: 1, name: 'B' }])!
    expect(s.totals).toEqual([2, 1])
    expect(s.line).toBe('A leads the series · 2 to 1')
    expect(wayLine('stone')).toBe('Way of the Stone')
    expect(wayLine('stream')).toBe('Way of the Stream')
  })
})
