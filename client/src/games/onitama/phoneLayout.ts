/**
 * The phone's in-game layout (everything below the header), as a pure function of the available
 * size, so it can be tested for every orientation and tiny viewports. Portrait: the opponent's
 * cards on top, the board, my cards, then the fixed action area. Landscape: the board on the
 * left, and the opponent's cards, my cards and the action area stacked on the right. The board
 * always gets a positive, fitting size: it never disappears.
 */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PhoneLayout {
  orientation: 'portrait' | 'landscape'
  board: Box
  opp: Box
  cards: Box
  action: Box
  /** Width of each of my two hand cards and of the smaller side card. */
  handW: number
  sideW: number
}

/** Fixed height of the action area (prompt / confirm bar with the move named and Cancel/Play). */
export const ACTION_AREA_PX = 84
const PAD = 10
const GAP = 8
/** Card height = width × CARD_H; plus room for the side card's label. */
const CARD_H = 1.4
const LABEL = 16
/** Hand cards plus the 0.62× side card, with gaps, across the available width. */
const ROW_UNITS = 2.62
const MIN_BOARD = 96

export function phoneLayout(w: number, h: number): PhoneLayout {
  const W = Math.max(0, Math.floor(w))
  const H = Math.max(0, Math.floor(h))
  if (W > H) {
    // Landscape: board left, everything else right.
    const oppH = Math.min(52, Math.max(30, H * 0.16))
    const boardSide = Math.max(MIN_BOARD, Math.min(H - PAD * 2, Math.floor(W * 0.56)))
    const board = { x: PAD, y: Math.max(0, Math.floor((H - boardSide) / 2)), w: boardSide, h: boardSide }
    const rx = board.x + board.w + PAD
    const rw = Math.max(0, W - rx - PAD)
    const opp = { x: rx, y: PAD / 2, w: rw, h: oppH }
    const action = { x: rx, y: H - ACTION_AREA_PX, w: rw, h: ACTION_AREA_PX }
    const midH = Math.max(0, action.y - (opp.y + opp.h) - GAP)
    const handW = Math.max(0, Math.floor(Math.min((rw - GAP * 2) / ROW_UNITS, (midH - LABEL) / CARD_H)))
    const cards = { x: rx, y: opp.y + opp.h + GAP / 2, w: rw, h: midH }
    return { orientation: 'landscape', board, opp, cards, action, handW, sideW: Math.floor(handW * 0.62) }
  }
  // Portrait: opponent strip, board, my cards, action area.
  const oppH = Math.min(56, Math.max(34, H * 0.09))
  const avail = Math.max(0, H - oppH - ACTION_AREA_PX - GAP * 3)
  let handW = Math.floor((W - PAD * 2 - GAP * 2) / ROW_UNITS)
  let cardsH = handW * CARD_H + LABEL
  // Never let the cards squeeze the board below about half of the free height.
  if (avail - cardsH < avail * 0.5) {
    cardsH = Math.floor(avail * 0.5)
    handW = Math.max(0, Math.floor((cardsH - LABEL) / CARD_H))
  }
  const boardSide = Math.max(Math.min(MIN_BOARD, avail), Math.floor(Math.min(W - PAD * 2, avail - cardsH)))
  const opp = { x: PAD, y: GAP / 2, w: W - PAD * 2, h: oppH }
  const board = { x: Math.floor((W - boardSide) / 2), y: opp.y + opp.h + GAP, w: boardSide, h: boardSide }
  const cards = { x: PAD, y: board.y + board.h + GAP, w: W - PAD * 2, h: cardsH }
  const action = { x: PAD, y: H - ACTION_AREA_PX, w: W - PAD * 2, h: ACTION_AREA_PX }
  return { orientation: 'portrait', board, opp, cards, action, handW, sideW: Math.floor(handW * 0.62) }
}
