import type { Color } from '@games/onitama/data'
import type { MoveOption, OnitamaAction, Square } from '@games/onitama/engine'

/** Which screen direction a card's "forward" points, for drawing its move diagram. */
export type Facing = 'up' | 'down' | 'left' | 'right'

/**
 * Where a card offset (right, forward; mover-relative) lands in a 5×5 diagram whose centre is
 * [2,2] (col, row), given the screen direction the mover faces. Pure.
 */
export function diagramCell([dx, dy]: readonly [number, number], facing: Facing): [number, number] {
  switch (facing) {
    case 'up':
      return [2 + dx, 2 - dy]
    case 'down':
      return [2 - dx, 2 + dy]
    case 'right':
      return [2 + dy, 2 + dx]
    case 'left':
      return [2 - dy, 2 - dx]
  }
}

/**
 * TV board: red's zone is on the left and blue's on the right, so each player's home row faces
 * them. Board square [x,y] → screen (col,row): col = y, row = 4 - x. With this, red faces right
 * (its right hand is down-screen) and blue faces left (its right hand is up-screen).
 */
export function tvCell([x, y]: readonly [number, number]): [number, number] {
  return [y, 4 - x]
}

/** The screen direction a colour faces on the TV. */
export const TV_FACING: Record<Color, Facing> = { red: 'right', blue: 'left' }

/**
 * Phone board, seen from the player's own side (their home row at the bottom, forward = up).
 * Red: forward +y, right −x. Blue: forward −y, right +x.
 */
export function phoneCell([x, y]: readonly [number, number], me: Color): [number, number] {
  return me === 'red' ? [4 - x, 4 - y] : [x, y]
}

/** Inverse of phoneCell: the board square shown at a phone (col,row). */
export function phoneSquare([col, row]: readonly [number, number], me: Color): Square {
  return me === 'red' ? [4 - col, 4 - row] : [col, row]
}

const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1]

/** The move options for a chosen card and piece. */
export function destinations(options: MoveOption[], card: string | null, from: Square | null): MoveOption[] {
  if (!card || !from) return []
  return options.filter((o) => o.action.type === 'move' && o.action.card === card && same(o.action.from, from))
}

/** True when the seat has no move at all (only passes are legal). */
export function mustPass(legal: OnitamaAction[]): boolean {
  return legal.length > 0 && legal.every((a) => a.type === 'pass')
}

/** Squares of my pieces that can move with the chosen card (so the phone can hint which to tap). */
export function movablePieces(options: MoveOption[], card: string | null): Square[] {
  const out: Square[] = []
  for (const o of options) {
    if (o.action.type !== 'move' || (card && o.action.card !== card)) continue
    if (!out.some((s) => same(s, (o.action as { from: Square }).from))) out.push((o.action as { from: Square }).from)
  }
  return out
}

/** A short human description of a move for the confirm sheet. */
export function describeMove(o: MoveOption, pieceIsMaster: boolean, cardName: string): string {
  const who = pieceIsMaster ? 'your Master' : 'a Student'
  if (o.wins) return `Move ${who} with ${cardName} — this wins!`
  return `Move ${who} with ${cardName}`
}

export interface SeriesSummary {
  games: { scores: number[]; winners: number[] }[]
  totals: number[]
  leaders: number[]
  line: string
}

/** Wins across rematches (shown once there are 2+ games). Mirrors Dragonheart's. */
export function seriesSummary(
  history: { scores: number[]; winners: number[] }[] | undefined,
  players: { seat: number; name: string }[]
): SeriesSummary | null {
  if (!history || history.length < 2) return null
  const seats = players.map((p) => p.seat)
  const totals: number[] = []
  for (const seat of seats) totals[seat] = history.reduce((sum, g) => sum + (g.scores[seat] ?? 0), 0)
  const best = Math.max(...seats.map((s) => totals[s]))
  const leaders = seats.filter((s) => totals[s] === best)
  const ordered = seats.slice().sort((a, b) => totals[b] - totals[a])
  const score = ordered.map((s) => totals[s]).join(' to ')
  const name = (seat: number) => players.find((p) => p.seat === seat)?.name ?? `Player ${seat + 1}`
  const line = leaders.length === 1 ? `${name(leaders[0])} leads the series · ${score}` : `Series tied · ${score}`
  return { games: history, totals, leaders, line }
}

/** The end-of-game line naming how it was won. */
export function wayLine(way: 'stone' | 'stream' | 'draw' | undefined): string {
  if (way === 'stone') return 'Way of the Stone'
  if (way === 'stream') return 'Way of the Stream'
  return 'A draw — the masters part ways'
}
