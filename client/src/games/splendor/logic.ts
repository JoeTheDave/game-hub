import type { SplendorAction } from '@games/splendor/engine'
import type { Gem, Tier, Token } from '@games/splendor/data'

/**
 * Pure UI helpers for the Splendor phone. Gem selection is validated against the engine's own
 * legalActions list, so the phone can never offer a pick the engine would reject.
 */

type Take3 = Extract<SplendorAction, { type: 'take3' }>
type Take2 = Extract<SplendorAction, { type: 'take2' }>

const take3s = (legal: SplendorAction[]) => legal.filter((a): a is Take3 => a.type === 'take3')
const take2s = (legal: SplendorAction[]) => legal.filter((a): a is Take2 => a.type === 'take2')

/** True when `sel` (distinct gems) is a subset of some legal take3 set. */
function extendsTake3(sel: Gem[], legal: SplendorAction[]): boolean {
  return take3s(legal).some((a) => sel.every((g) => a.gems.includes(g)))
}

/**
 * Tapping a gem chip. Selection is a list of gems: distinct gems build toward "take 3 different",
 * and tapping a lone selected gem again doubles it into "take 2 of the same" when that's legal.
 */
export function toggleGem(sel: Gem[], gem: Gem, legal: SplendorAction[]): Gem[] {
  const isDouble = sel.length === 2 && sel[0] === sel[1]
  if (isDouble) return sel[0] === gem ? [] : extendsTake3([gem], legal) ? [gem] : sel
  if (sel.includes(gem)) {
    if (sel.length === 1 && take2s(legal).some((a) => a.gem === gem)) return [gem, gem]
    return sel.filter((g) => g !== gem)
  }
  const next = [...sel, gem]
  if (next.length <= 3 && extendsTake3(next, legal)) return next
  // Not combinable with the current pick: start a fresh pick with this gem if that's legal.
  if (extendsTake3([gem], legal) || take2s(legal).some((a) => a.gem === gem)) return [gem]
  return sel
}

/** The legal action the current selection represents exactly, or null. */
export function selectionAction(sel: Gem[], legal: SplendorAction[]): SplendorAction | null {
  if (sel.length === 0) return null
  if (sel.length === 2 && sel[0] === sel[1]) {
    return take2s(legal).find((a) => a.gem === sel[0]) ?? null
  }
  const key = [...sel].sort().join(',')
  return take3s(legal).find((a) => [...a.gems].sort().join(',') === key) ?? null
}

/** Whether a gem chip can be tapped at all right now. */
export function gemSelectable(gem: Gem, legal: SplendorAction[]): boolean {
  return extendsTake3([gem], legal) || take2s(legal).some((a) => a.gem === gem)
}

export function findBuyBoard(legal: SplendorAction[], tier: Tier, slot: number) {
  return legal.find((a) => a.type === 'buy' && a.source === 'board' && a.tier === tier && a.slot === slot) ?? null
}

export function findBuyReserved(legal: SplendorAction[], cardId: string) {
  return legal.find((a) => a.type === 'buy' && a.source === 'reserved' && a.cardId === cardId) ?? null
}

export function findReserve(legal: SplendorAction[], tier: Tier, slot: number | 'deck') {
  return (
    legal.find(
      (a) =>
        a.type === 'reserve' &&
        a.tier === tier &&
        (slot === 'deck' ? 'fromDeck' in a && a.fromDeck : 'slot' in a && a.slot === slot)
    ) ?? null
  )
}

/** Adjust a discard pick by +/-1 for one token, bounded by what the player holds and the total needed. */
export function adjustDiscard(
  pick: Partial<Record<Token, number>>,
  token: Token,
  delta: 1 | -1,
  held: Record<Token, number>,
  over: number
): Partial<Record<Token, number>> {
  const cur = pick[token] ?? 0
  const total = Object.values(pick).reduce((s, n) => s + (n ?? 0), 0)
  const next = cur + delta
  if (next < 0 || next > held[token]) return pick
  if (delta > 0 && total >= over) return pick
  const out = { ...pick, [token]: next }
  if (next === 0) delete out[token]
  return out
}

export const discardTotal = (pick: Partial<Record<Token, number>>) =>
  Object.values(pick).reduce((s, n) => s + (n ?? 0), 0)
