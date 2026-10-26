/**
 * Dragonheart card and board data, transcribed from Joe's copy (vault:
 * Projects/game-hub/Dragonheart/Dragonheart Card List.md and Board Notes.md).
 * Both decks are identical apart from the colour of the backs.
 */

export const KINDS = ['treasure', 'fireDragon', 'petrified', 'sorceress', 'troll', 'dwarf', 'knight', 'huntress', 'ship'] as const
export type Kind = (typeof KINDS)[number]

/** Each board space holds cards of exactly one kind, so a Space is named by its kind. */
export type Space = Kind
export const SPACES: readonly Space[] = KINDS

export type DeckColor = 'green' | 'red'
/** Seat 0 plays green (disciple of the Great Dragon); seat 1 plays red (the wizard's minion). */
export const DECK_COLORS: readonly DeckColor[] = ['green', 'red']

export const KIND_NAMES: Record<Kind, string> = {
  treasure: 'Treasure Chest',
  fireDragon: 'Fire Dragon',
  petrified: 'Petrified Dragon',
  sorceress: 'Sorceress',
  troll: 'Troll',
  dwarf: 'Dwarf',
  knight: 'Knight',
  huntress: 'Huntress',
  ship: 'Ship',
}

/** Card outlines per space. 0 = a single outline holding an unlimited stack (only the top shows). */
export const CAPACITY: Record<Space, number> = {
  treasure: 0,
  fireDragon: 0,
  petrified: 0,
  sorceress: 0,
  troll: 0,
  knight: 2,
  huntress: 3,
  ship: 3,
  dwarf: 4,
}

/**
 * Board layout (for the TV): the painted board has two rows. Columns run left to right.
 * The Great Dragon starts in the open area to the right of the Petrified Dragon (top row,
 * column 4), above the Dwarf.
 */
export const BOARD_LAYOUT: Record<Space, { row: 0 | 1; col: number }> = {
  fireDragon: { row: 0, col: 0 },
  treasure: { row: 0, col: 1 },
  sorceress: { row: 0, col: 2 },
  petrified: { row: 0, col: 3 },
  huntress: { row: 1, col: 0 },
  ship: { row: 1, col: 1 },
  knight: { row: 1, col: 2 },
  troll: { row: 1, col: 3 },
  dwarf: { row: 1, col: 4 },
}
export const GREAT_DRAGON_START = { row: 0 as const, col: 4 }

/** Straight arrows on the board: which spaces an activated space collects from. */
export const ARROWS: Partial<Record<Space, Space[]>> = {
  fireDragon: ['treasure'],
  sorceress: ['treasure', 'petrified'],
  troll: ['sorceress'],
  knight: ['sorceress', 'troll'],
  huntress: ['fireDragon'],
}
/** Curved arrows: these spaces send their cards to the pile below the Ship once they fire. */
export const TO_BELOW_SHIP: readonly Space[] = ['knight', 'huntress']

/** Per deck: [kind, point values]. Ships carry a bow-and-sword symbol and score nothing. */
const DECK_SPEC: [Kind, number[]][] = [
  ['treasure', [4, 3, 3, 2, 2, 1, 1]],
  ['fireDragon', [4, 3, 3, 2]],
  ['petrified', [2, 2, 2, 2, 2]],
  ['sorceress', [2, 2, 1, 1]],
  ['troll', [3, 2, 1]],
  ['dwarf', [3, 2, 2, 2, 1, 1, 1, 1, 1, 1]],
  ['knight', [2, 1, 1, 1, 1]],
  ['huntress', [2, 2, 1, 1, 1, 1]],
  ['ship', [0, 0, 0, 0, 0, 0]],
]

export interface CardDef {
  /** 'g-01'..'g-50' (green deck) or 'r-01'..'r-50' (red deck). */
  id: string
  deck: DeckColor
  kind: Kind
  points: number
}

function buildDeck(deck: DeckColor): CardDef[] {
  const prefix = deck === 'green' ? 'g' : 'r'
  const out: CardDef[] = []
  for (const [kind, values] of DECK_SPEC) {
    for (const points of values) {
      out.push({ id: `${prefix}-${String(out.length + 1).padStart(2, '0')}`, deck, kind, points })
    }
  }
  return out
}

export const GREEN_DECK: readonly CardDef[] = buildDeck('green')
export const RED_DECK: readonly CardDef[] = buildDeck('red')
export const CARDS: readonly CardDef[] = [...GREEN_DECK, ...RED_DECK]
export const CARD_BY_ID: Readonly<Record<string, CardDef>> = Object.fromEntries(CARDS.map((c) => [c.id, c]))

export const DECK_SIZE = 50
export const HAND_SIZE = 5
export const HAND_SIZE_WITH_DRAGON = 6
export const GREAT_DRAGON_POINTS = 3
export const SHIP_STACKS_TO_END = 3
