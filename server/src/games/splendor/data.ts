/**
 * Splendor components, transcribed from Joe's physical copy (vault note
 * Projects/game-hub/Splendor Card Scans/Splendor Card Data.md). The scans are reference only.
 * Gem key: white = diamond, blue = sapphire, green = emerald, red = ruby, black = onyx.
 */

export const GEMS = ['white', 'blue', 'green', 'red', 'black'] as const
export type Gem = (typeof GEMS)[number]
export type Token = Gem | 'gold'
export const TOKENS: readonly Token[] = [...GEMS, 'gold']
export type GemCounts = Partial<Record<Gem, number>>
export type Tier = 1 | 2 | 3
export const TIERS: readonly Tier[] = [1, 2, 3]

export interface CardDef {
  id: string
  tier: Tier
  bonus: Gem
  points: number
  cost: GemCounts
  /** Art key: one scene per tier per bonus color (several cards share art, as in the real game). */
  scene: string
}

export interface NobleDef {
  id: string
  points: number
  requires: GemCounts
  /** Art key for the portrait. */
  portrait: string
}

export const CARDS: readonly CardDef[] = [
  { id: 't1-01', tier: 1, bonus: 'blue', points: 0, cost: { green: 2, black: 2 }, scene: 't1-blue' },
  { id: 't1-02', tier: 1, bonus: 'blue', points: 0, cost: { blue: 1, green: 3, red: 1 }, scene: 't1-blue' },
  { id: 't1-03', tier: 1, bonus: 'blue', points: 0, cost: { white: 1, black: 2 }, scene: 't1-blue' },
  { id: 't1-04', tier: 1, bonus: 'blue', points: 1, cost: { red: 4 }, scene: 't1-blue' },
  { id: 't1-05', tier: 1, bonus: 'red', points: 0, cost: { white: 2, blue: 1, green: 1, black: 1 }, scene: 't1-red' },
  { id: 't1-06', tier: 1, bonus: 'red', points: 0, cost: { white: 2, red: 2 }, scene: 't1-red' },
  { id: 't1-07', tier: 1, bonus: 'red', points: 0, cost: { white: 1, blue: 1, green: 1, black: 1 }, scene: 't1-red' },
  { id: 't1-08', tier: 1, bonus: 'green', points: 0, cost: { white: 2, blue: 1 }, scene: 't1-green' },
  { id: 't1-09', tier: 1, bonus: 'green', points: 0, cost: { white: 1, blue: 1, red: 1, black: 1 }, scene: 't1-green' },
  { id: 't1-10', tier: 1, bonus: 'green', points: 1, cost: { black: 4 }, scene: 't1-green' },
  { id: 't1-11', tier: 1, bonus: 'black', points: 0, cost: { white: 2, blue: 2, red: 1 }, scene: 't1-black' },
  { id: 't1-12', tier: 1, bonus: 'white', points: 1, cost: { green: 4 }, scene: 't1-white' },
  { id: 't1-13', tier: 1, bonus: 'white', points: 0, cost: { blue: 3 }, scene: 't1-white' },
  { id: 't1-14', tier: 1, bonus: 'black', points: 0, cost: { green: 1, red: 3, black: 1 }, scene: 't1-black' },
  { id: 't1-15', tier: 1, bonus: 'black', points: 0, cost: { green: 2, red: 1 }, scene: 't1-black' },
  { id: 't1-16', tier: 1, bonus: 'red', points: 0, cost: { white: 3 }, scene: 't1-red' },
  { id: 't1-17', tier: 1, bonus: 'black', points: 0, cost: { white: 1, blue: 2, green: 1, red: 1 }, scene: 't1-black' },
  { id: 't1-18', tier: 1, bonus: 'white', points: 0, cost: { white: 3, blue: 1, black: 1 }, scene: 't1-white' },
  { id: 't1-19', tier: 1, bonus: 'red', points: 0, cost: { blue: 2, green: 1 }, scene: 't1-red' },
  { id: 't1-20', tier: 1, bonus: 'blue', points: 0, cost: { white: 1, green: 1, red: 1, black: 1 }, scene: 't1-blue' },
  { id: 't1-21', tier: 1, bonus: 'white', points: 0, cost: { red: 2, black: 1 }, scene: 't1-white' },
  { id: 't1-22', tier: 1, bonus: 'red', points: 1, cost: { white: 4 }, scene: 't1-red' },
  { id: 't1-23', tier: 1, bonus: 'red', points: 0, cost: { white: 2, green: 1, black: 2 }, scene: 't1-red' },
  { id: 't1-24', tier: 1, bonus: 'white', points: 0, cost: { blue: 1, green: 1, red: 1, black: 1 }, scene: 't1-white' },
  { id: 't1-25', tier: 1, bonus: 'white', points: 0, cost: { blue: 2, black: 2 }, scene: 't1-white' },
  { id: 't1-26', tier: 1, bonus: 'white', points: 0, cost: { blue: 2, green: 2, black: 1 }, scene: 't1-white' },
  { id: 't1-27', tier: 1, bonus: 'blue', points: 0, cost: { black: 3 }, scene: 't1-blue' },
  { id: 't1-28', tier: 1, bonus: 'blue', points: 0, cost: { white: 1, green: 2, red: 2 }, scene: 't1-blue' },
  { id: 't1-29', tier: 1, bonus: 'blue', points: 0, cost: { white: 1, green: 1, red: 2, black: 1 }, scene: 't1-blue' },
  { id: 't1-30', tier: 1, bonus: 'black', points: 0, cost: { white: 2, green: 2 }, scene: 't1-black' },
  { id: 't1-31', tier: 1, bonus: 'black', points: 1, cost: { blue: 4 }, scene: 't1-black' },
  { id: 't1-32', tier: 1, bonus: 'black', points: 0, cost: { green: 3 }, scene: 't1-black' },
  { id: 't1-33', tier: 1, bonus: 'green', points: 0, cost: { red: 3 }, scene: 't1-green' },
  { id: 't1-34', tier: 1, bonus: 'green', points: 0, cost: { white: 1, blue: 1, red: 1, black: 2 }, scene: 't1-green' },
  { id: 't1-35', tier: 1, bonus: 'green', points: 0, cost: { blue: 2, red: 2 }, scene: 't1-green' },
  { id: 't1-36', tier: 1, bonus: 'black', points: 0, cost: { white: 1, blue: 1, green: 1, red: 1 }, scene: 't1-black' },
  { id: 't1-37', tier: 1, bonus: 'green', points: 0, cost: { white: 1, blue: 3, green: 1 }, scene: 't1-green' },
  { id: 't1-38', tier: 1, bonus: 'green', points: 0, cost: { blue: 1, red: 2, black: 2 }, scene: 't1-green' },
  { id: 't1-39', tier: 1, bonus: 'red', points: 0, cost: { white: 1, red: 1, black: 3 }, scene: 't1-red' },
  { id: 't1-40', tier: 1, bonus: 'white', points: 0, cost: { blue: 1, green: 2, red: 1, black: 1 }, scene: 't1-white' },
  { id: 't2-01', tier: 2, bonus: 'red', points: 2, cost: { white: 3, black: 5 }, scene: 't2-red' },
  { id: 't2-02', tier: 2, bonus: 'green', points: 1, cost: { white: 3, green: 2, red: 3 }, scene: 't2-green' },
  { id: 't2-03', tier: 2, bonus: 'red', points: 2, cost: { white: 1, blue: 4, green: 2 }, scene: 't2-red' },
  { id: 't2-04', tier: 2, bonus: 'red', points: 1, cost: { white: 2, red: 2, black: 3 }, scene: 't2-red' },
  { id: 't2-05', tier: 2, bonus: 'white', points: 1, cost: { green: 3, red: 2, black: 2 }, scene: 't2-white' },
  { id: 't2-06', tier: 2, bonus: 'white', points: 2, cost: { green: 1, red: 4, black: 2 }, scene: 't2-white' },
  { id: 't2-07', tier: 2, bonus: 'white', points: 3, cost: { white: 6 }, scene: 't2-white' },
  { id: 't2-08', tier: 2, bonus: 'blue', points: 1, cost: { blue: 2, green: 2, red: 3 }, scene: 't2-blue' },
  { id: 't2-09', tier: 2, bonus: 'red', points: 1, cost: { blue: 3, red: 2, black: 3 }, scene: 't2-red' },
  { id: 't2-10', tier: 2, bonus: 'red', points: 3, cost: { red: 6 }, scene: 't2-red' },
  { id: 't2-11', tier: 2, bonus: 'white', points: 1, cost: { white: 2, blue: 3, red: 3 }, scene: 't2-white' },
  { id: 't2-12', tier: 2, bonus: 'blue', points: 3, cost: { blue: 6 }, scene: 't2-blue' },
  { id: 't2-13', tier: 2, bonus: 'green', points: 2, cost: { green: 5 }, scene: 't2-green' },
  { id: 't2-14', tier: 2, bonus: 'black', points: 1, cost: { white: 3, blue: 2, green: 2 }, scene: 't2-black' },
  { id: 't2-15', tier: 2, bonus: 'red', points: 2, cost: { black: 5 }, scene: 't2-red' },
  { id: 't2-16', tier: 2, bonus: 'black', points: 2, cost: { white: 5 }, scene: 't2-black' },
  { id: 't2-17', tier: 2, bonus: 'blue', points: 1, cost: { blue: 2, green: 3, black: 3 }, scene: 't2-blue' },
  { id: 't2-18', tier: 2, bonus: 'black', points: 2, cost: { blue: 1, green: 4, red: 2 }, scene: 't2-black' },
  { id: 't2-19', tier: 2, bonus: 'blue', points: 2, cost: { white: 5, blue: 3 }, scene: 't2-blue' },
  { id: 't2-20', tier: 2, bonus: 'blue', points: 2, cost: { blue: 5 }, scene: 't2-blue' },
  { id: 't2-21', tier: 2, bonus: 'black', points: 3, cost: { black: 6 }, scene: 't2-black' },
  { id: 't2-22', tier: 2, bonus: 'green', points: 1, cost: { white: 2, blue: 3, black: 2 }, scene: 't2-green' },
  { id: 't2-23', tier: 2, bonus: 'green', points: 3, cost: { green: 6 }, scene: 't2-green' },
  { id: 't2-24', tier: 2, bonus: 'blue', points: 2, cost: { white: 2, red: 1, black: 4 }, scene: 't2-blue' },
  { id: 't2-25', tier: 2, bonus: 'green', points: 2, cost: { blue: 5, green: 3 }, scene: 't2-green' },
  { id: 't2-26', tier: 2, bonus: 'white', points: 2, cost: { red: 5 }, scene: 't2-white' },
  { id: 't2-27', tier: 2, bonus: 'green', points: 2, cost: { white: 4, blue: 2, black: 1 }, scene: 't2-green' },
  { id: 't2-28', tier: 2, bonus: 'black', points: 1, cost: { white: 3, green: 3, black: 2 }, scene: 't2-black' },
  { id: 't2-29', tier: 2, bonus: 'white', points: 2, cost: { red: 5, black: 3 }, scene: 't2-white' },
  { id: 't2-30', tier: 2, bonus: 'black', points: 2, cost: { green: 5, red: 3 }, scene: 't2-black' },
  { id: 't3-01', tier: 3, bonus: 'black', points: 4, cost: { green: 3, red: 6, black: 3 }, scene: 't3-black' },
  { id: 't3-02', tier: 3, bonus: 'green', points: 5, cost: { blue: 7, green: 3 }, scene: 't3-green' },
  { id: 't3-03', tier: 3, bonus: 'blue', points: 3, cost: { white: 3, green: 3, red: 3, black: 5 }, scene: 't3-blue' },
  { id: 't3-04', tier: 3, bonus: 'white', points: 3, cost: { blue: 3, green: 3, red: 5, black: 3 }, scene: 't3-white' },
  { id: 't3-05', tier: 3, bonus: 'black', points: 3, cost: { white: 3, blue: 3, green: 5, red: 3 }, scene: 't3-black' },
  { id: 't3-06', tier: 3, bonus: 'black', points: 4, cost: { red: 7 }, scene: 't3-black' },
  { id: 't3-07', tier: 3, bonus: 'white', points: 4, cost: { black: 7 }, scene: 't3-white' },
  { id: 't3-08', tier: 3, bonus: 'red', points: 4, cost: { green: 7 }, scene: 't3-red' },
  { id: 't3-09', tier: 3, bonus: 'green', points: 3, cost: { white: 5, blue: 3, red: 3, black: 3 }, scene: 't3-green' },
  { id: 't3-10', tier: 3, bonus: 'black', points: 5, cost: { red: 7, black: 3 }, scene: 't3-black' },
  { id: 't3-11', tier: 3, bonus: 'blue', points: 4, cost: { white: 7 }, scene: 't3-blue' },
  { id: 't3-12', tier: 3, bonus: 'blue', points: 4, cost: { white: 6, blue: 3, black: 3 }, scene: 't3-blue' },
  { id: 't3-13', tier: 3, bonus: 'red', points: 5, cost: { green: 7, red: 3 }, scene: 't3-red' },
  { id: 't3-14', tier: 3, bonus: 'white', points: 4, cost: { white: 3, red: 3, black: 6 }, scene: 't3-white' },
  { id: 't3-15', tier: 3, bonus: 'blue', points: 5, cost: { white: 7, blue: 3 }, scene: 't3-blue' },
  { id: 't3-16', tier: 3, bonus: 'red', points: 4, cost: { blue: 3, green: 6, red: 3 }, scene: 't3-red' },
  { id: 't3-17', tier: 3, bonus: 'red', points: 3, cost: { white: 3, blue: 5, green: 3, black: 3 }, scene: 't3-red' },
  { id: 't3-18', tier: 3, bonus: 'green', points: 4, cost: { blue: 7 }, scene: 't3-green' },
  { id: 't3-19', tier: 3, bonus: 'green', points: 4, cost: { white: 3, blue: 6, green: 3 }, scene: 't3-green' },
  { id: 't3-20', tier: 3, bonus: 'white', points: 5, cost: { white: 3, black: 7 }, scene: 't3-white' },
]

export const NOBLES: readonly NobleDef[] = [
  { id: 'n-01', points: 3, requires: { green: 3, blue: 3, red: 3 }, portrait: 'p-01' },
  { id: 'n-02', points: 3, requires: { black: 3, red: 3, white: 3 }, portrait: 'p-02' },
  { id: 'n-03', points: 3, requires: { black: 3, red: 3, green: 3 }, portrait: 'p-03' },
  { id: 'n-04', points: 3, requires: { black: 4, red: 4 }, portrait: 'p-04' },
  { id: 'n-05', points: 3, requires: { green: 3, blue: 3, white: 3 }, portrait: 'p-05' },
  { id: 'n-06', points: 3, requires: { black: 3, blue: 3, white: 3 }, portrait: 'p-06' },
  { id: 'n-07', points: 3, requires: { black: 4, white: 4 }, portrait: 'p-07' },
  { id: 'n-08', points: 3, requires: { blue: 4, green: 4 }, portrait: 'p-08' },
  { id: 'n-09', points: 3, requires: { blue: 4, white: 4 }, portrait: 'p-09' },
  { id: 'n-10', points: 3, requires: { red: 4, green: 4 }, portrait: 'p-10' },
]

export const CARD_BY_ID: Readonly<Record<string, CardDef>> = Object.fromEntries(CARDS.map((c) => [c.id, c]))
export const NOBLE_BY_ID: Readonly<Record<string, NobleDef>> = Object.fromEntries(NOBLES.map((n) => [n.id, n]))

/**
 * Portrait pool: Joe's 32 portraits (p-01..p-32). The original 10 generated portraits were retired
 * (Joe, 2026-10-28). Each game pairs every noble in play with a random, distinct portrait from here.
 */
export const NOBLE_PORTRAITS: readonly string[] = Array.from({ length: 32 }, (_, i) => `p-${String(i + 1).padStart(2, '0')}`)
