import { CARD_BY_ID, GREAT_DRAGON_POINTS, KIND_NAMES, type Kind } from '@games/dragonheart/data'
import type { DragonheartAction, PlayOption, PlayPreview } from '@games/dragonheart/engine'

/**
 * Pure phone logic: which hand cards can be selected, what a selection plays, and how a
 * play's preview reads. The engine's `options` (legal actions + previews) are the source of truth.
 */

type Play = Extract<DragonheartAction, { type: 'play' }>
const isPlay = (a: DragonheartAction): a is Play => a.type === 'play'

const kindOf = (id: string): Kind => CARD_BY_ID[id].kind
const valueKey = (ids: string[]) =>
  ids
    .map((id) => CARD_BY_ID[id].points)
    .sort((a, b) => a - b)
    .join(',')

/** The most cards of each kind this player may play at once right now. */
export function maxPerKind(options: PlayOption[]): Partial<Record<Kind, number>> {
  const out: Partial<Record<Kind, number>> = {}
  for (const o of options) {
    if (!isPlay(o.action)) continue
    const k = kindOf(o.action.cardIds[0])
    out[k] = Math.max(out[k] ?? 0, o.action.cardIds.length)
  }
  return out
}

/** Can this hand card be tapped, given the current selection? */
export function selectable(options: PlayOption[], selected: string[], id: string): boolean {
  if (selected.includes(id)) return true
  const k = kindOf(id)
  const max = maxPerKind(options)[k] ?? 0
  if (max === 0) return false
  if (selected.length === 0) return true
  return kindOf(selected[0]) === k ? selected.length < max : true // another kind replaces the selection
}

/** Tap a card: toggle it within its kind; tapping another kind starts a new selection. */
export function toggle(options: PlayOption[], selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id)
  if (!selectable(options, selected, id)) return selected
  if (selected.length && kindOf(selected[0]) !== kindOf(id)) return [id]
  return [...selected, id]
}

/**
 * The legal plays matching a selection (same kind and same card values; the engine treats
 * equal-valued cards of a kind as interchangeable). Two results = a collect choice.
 * Each returned action carries the actual selected card ids.
 */
export function matchingOptions(options: PlayOption[], selected: string[]): PlayOption[] {
  if (selected.length === 0) return []
  const kind = kindOf(selected[0])
  const key = valueKey(selected)
  return options
    .filter((o) => isPlay(o.action) && kindOf(o.action.cardIds[0]) === kind && valueKey(o.action.cardIds) === key)
    .map((o) => ({ ...o, action: { ...(o.action as Play), cardIds: selected.slice() } }))
}

const SOURCE_NAME = (from: string) => (from === 'belowShip' ? 'below the Ship' : KIND_NAMES[from as Kind])

/** A one-line description of what a play will do. */
export function previewText(p: PlayPreview | null): string {
  if (!p) return ''
  // Points first (Joe, iteration 13): what the play is worth matters more than the card count.
  const taken = p.collects.filter((c) => c.count > 0)
  let s = taken.length
    ? 'Takes ' + taken.map((c) => `${c.points} pt${c.points === 1 ? '' : 's'} from ${SOURCE_NAME(c.from)}`).join(' and ')
    : 'No cards collected'
  if (p.takesDragon) s += ` + the Great Dragon (+${GREAT_DRAGON_POINTS})`
  const extra: string[] = []
  if (p.movesBelowShip) extra.push(`the ${KIND_NAMES[p.space]}s go below the Ship`)
  if (p.shipStack != null) extra.push(p.shipStack >= 3 ? 'the third ship sails: the game ends' : `ship stack ${p.shipStack} of 3 sails`)
  return extra.length ? `${s}; ${extra.join('; ')}` : s
}

/** Label for a collect choice button. */
export function choiceLabel(o: PlayOption): string {
  const a = o.action as Play
  const c = o.preview?.collects[0]
  const target = a.collect ?? c?.from
  return target ? `Take ${SOURCE_NAME(target)}${c ? ` · ${c.points} pt${c.points === 1 ? '' : 's'}` : ''}` : 'Play'
}

/**
 * Biggest hand-card width that fits `n` cards in a w×h area. The row count is fixed by the phone's
 * orientation, never by the momentary space: in landscape the hand is always ONE row (cards shrink
 * to fit), so showing the action bar after a tap can't reflow it into 2×3 (Joe, iteration 3).
 * In portrait it may use up to 3 rows.
 */
export function handGrid(w: number, h: number, n: number, ratio: number, gap = 8, landscape = false) {
  let best = { cols: Math.max(1, n), rows: 1, cardW: 0 }
  const maxRows = landscape ? 1 : 3
  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = Math.max(1, Math.ceil(n / rows))
    const byW = (w - gap * (cols - 1)) / cols
    const byH = (h - gap * (rows - 1)) / rows / ratio
    const cardW = Math.floor(Math.max(0, Math.min(byW, byH)))
    if (cardW > best.cardW) best = { cols, rows, cardW }
  }
  return best
}
