import type { Rng } from '../types.js'
import { CARDS, GEMS, TIERS, type CardDef, type Gem, type GemCounts, type Tier } from './data.js'

/**
 * "Randomize card content": a fresh set of 90 development cards built from the real set's
 * structure, so the result plays like Splendor rather than noise.
 *
 * Each default card is used as a template and keeps its tier, bonus colour, points, cost
 * "shape" (the multiset of amounts) and its own-colour amount. Many real cards cost some of their
 * own bonus colour, at a fixed amount, and the rest never do. Only the other cost colours are
 * drawn at random, from the four colours that aren't the card's bonus.
 *
 * That keeps the tier counts (40/30/20), the per-colour bonus counts (8/6/4), the point
 * distribution and the cost totals exactly as in the real set. Then a seeded hill-climb
 * re-rolls cards until each tier's cost is spread almost evenly across the five colours (the real
 * set is perfectly even: 33/41/43 of each colour per tier), with no two identical cards in a tier.
 *
 * Pure and deterministic: the same rng stream gives the same deck.
 */

/** Per tier, the largest allowed gap between the most- and least-demanded cost colour. */
export const MAX_COLOUR_SPREAD: Record<Tier, number> = { 1: 2, 2: 2, 3: 3 }

interface Template {
  tier: Tier
  bonus: Gem
  points: number
  /** Amount of the card's own bonus colour in its cost (0 = none). */
  own: number
  /** The remaining amounts, largest first, to be placed on other colours. */
  others: number[]
}

function templateOf(c: CardDef): Template {
  const own = c.cost[c.bonus] ?? 0
  const amounts = Object.values(c.cost) as number[]
  const others = amounts.slice()
  if (own) others.splice(others.indexOf(own), 1)
  others.sort((a, b) => b - a)
  return { tier: c.tier, bonus: c.bonus, points: c.points, own, others }
}

function pickDistinct<T>(items: readonly T[], k: number, rng: Rng): T[] {
  const pool = items.slice()
  const out: T[] = []
  for (let i = 0; i < k; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  return out
}

function roll(t: Template, rng: Rng): GemCounts {
  const cost: GemCounts = {}
  if (t.own) cost[t.bonus] = t.own
  const colours = pickDistinct(GEMS.filter((g) => g !== t.bonus), t.others.length, rng)
  t.others.forEach((n, i) => (cost[colours[i]] = n))
  return cost
}

const keyOf = (bonus: Gem, points: number, cost: GemCounts) =>
  `${bonus}|${points}|${GEMS.map((g) => cost[g] ?? 0).join(',')}`

function colourTotals(costs: GemCounts[]): Record<Gem, number> {
  const t: Record<Gem, number> = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  for (const c of costs) for (const g of GEMS) t[g] += c[g] ?? 0
  return t
}

function spread(totals: Record<Gem, number>): number {
  const v = GEMS.map((g) => totals[g])
  return Math.max(...v) - Math.min(...v)
}

function imbalance(totals: Record<Gem, number>): number {
  const v = GEMS.map((g) => totals[g])
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  return v.reduce((a, b) => a + (b - mean) ** 2, 0)
}

function climbTier(tier: Tier, rng: Rng): GemCounts[] {
  const templates = CARDS.filter((c) => c.tier === tier).map(templateOf)
  const costs = templates.map((t) => roll(t, rng))
  const isUnique = (i: number, cost: GemCounts) => {
    const k = keyOf(templates[i].bonus, templates[i].points, cost)
    return costs.every((c, j) => j === i || keyOf(templates[j].bonus, templates[j].points, c) !== k)
  }
  // Clear duplicates first, then balance the colours with a seeded hill-climb.
  for (let i = 0; i < costs.length; i++) {
    for (let tries = 0; !isUnique(i, costs[i]) && tries < 200; tries++) costs[i] = roll(templates[i], rng)
  }
  let score = imbalance(colourTotals(costs))
  for (let step = 0; step < 4000 && spread(colourTotals(costs)) > MAX_COLOUR_SPREAD[tier]; step++) {
    const i = Math.floor(rng() * costs.length)
    if (templates[i].others.length === 0) continue
    const candidate = roll(templates[i], rng)
    if (!isUnique(i, candidate)) continue
    const before = costs[i]
    costs[i] = candidate
    const next = imbalance(colourTotals(costs))
    // Accept improvements, and occasionally a sideways move so the climb doesn't stall.
    if (next < score || (next === score && rng() < 0.5)) score = next
    else costs[i] = before
  }
  return costs
}

/**
 * A climb can stall on tier 3 (large 6s and 7s move the totals in coarse steps), so restart from a
 * fresh roll until the tier is balanced. Every restart draws from the same seeded stream, so this
 * stays deterministic. Falls back to the best attempt (which only ever happened in testing as a
 * spread one point over the limit).
 */
function generateTier(tier: Tier, rng: Rng): GemCounts[] {
  let best: GemCounts[] | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const costs = climbTier(tier, rng)
    if (spread(colourTotals(costs)) <= MAX_COLOUR_SPREAD[tier]) return costs
    if (!best || spread(colourTotals(costs)) < spread(colourTotals(best))) best = costs
  }
  return best!
}

/** True when a generated set has the structure and balance the generator promises. */
export function validateDeck(cards: readonly CardDef[]): string | null {
  for (const tier of TIERS) {
    const mine = cards.filter((c) => c.tier === tier)
    const ref = CARDS.filter((c) => c.tier === tier)
    if (mine.length !== ref.length) return `tier ${tier}: ${mine.length} cards, expected ${ref.length}`
    for (const g of GEMS) {
      if (mine.filter((c) => c.bonus === g).length !== ref.filter((c) => c.bonus === g).length) {
        return `tier ${tier}: wrong number of ${g} bonuses`
      }
    }
    const pts = (cs: readonly CardDef[]) => cs.map((c) => c.points).sort().join(',')
    if (pts(mine) !== pts(ref)) return `tier ${tier}: point distribution differs`
    const keys = new Set(mine.map((c) => keyOf(c.bonus, c.points, c.cost)))
    if (keys.size !== mine.length) return `tier ${tier}: duplicate cards`
    if (spread(colourTotals(mine.map((c) => c.cost))) > MAX_COLOUR_SPREAD[tier]) return `tier ${tier}: colours unbalanced`
    for (const c of mine) {
      const amounts = Object.values(c.cost) as number[]
      if (amounts.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return `${c.id}: bad cost`
    }
  }
  return null
}

/**
 * Generate a randomized deck. Ids carry a short random tag (`x<tag>-<tier>-<nn>`), so cards from
 * different games (e.g. across rematches) can never be mistaken for one another, or for the
 * default set.
 */
export function generateDeck(rng: Rng): CardDef[] {
  const tag = Math.floor(rng() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')
  const out: CardDef[] = []
  for (const tier of TIERS) {
    const templates = CARDS.filter((c) => c.tier === tier).map(templateOf)
    const costs = generateTier(tier, rng)
    templates.forEach((t, i) => {
      out.push({
        id: `x${tag}-${tier}-${String(i + 1).padStart(2, '0')}`,
        tier,
        bonus: t.bonus,
        points: t.points,
        cost: costs[i],
        scene: `t${tier}-${t.bonus}`,
      })
    })
  }
  return out
}
