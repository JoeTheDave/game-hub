/**
 * Onitama card data, transcribed from Joe's repo (github.com/JoeTheDave/onitama, app/lib/cards.ts):
 * the 16 base cards plus the 16 from the Sensei's Path expansion. Every base card's moves and stamp
 * were checked against the official cards; no corrections were needed.
 *
 * Move convention: [dx, dy] from the MOVER's point of view: +dx = the mover's right, +dy = forward
 * (toward the opponent). The engine mirrors these per side.
 */

export type Color = 'red' | 'blue'
export const COLORS: readonly Color[] = ['red', 'blue']

export interface CardDef {
  /** Stable id (kebab-case name). */
  id: string
  name: string
  /** The stamp colour: when this is the side card at setup, that colour moves first. */
  stamp: Color
  /** The card's flavour quote. */
  text: string
  /** Offsets [dx, dy] relative to the mover (right, forward). */
  moves: [number, number][]
  /** In the base game (otherwise Sensei's Path). */
  base: boolean
  /** Key of the card's kanji calligraphy image (from the repo's assets/complete/_<key>.*). */
  kanjiKey: string
}

export const CARDS: readonly CardDef[] = [
  { id: "dragon", name: "Dragon", stamp: 'red', text: "Be swift as the thunder that peals before you have a chance to cover your ears, fast as the lightning that flashes before you can blink your eyes.", moves: [[-2, 1], [2, 1], [-1, -1], [1, -1]], base: true, kanjiKey: "dragon" },
  { id: "giraffe", name: "Giraffe", stamp: 'blue', text: "Project your power, vaulting at opponents who believe themselves safely out of range. Aggression is subservient to surprise.", moves: [[-2, 1], [0, -1], [2, 1]], base: false, kanjiKey: "giraffe" },
  { id: "panda", name: "Panda", stamp: 'red', text: "Your opponent watches for your complacency, so show it to him. Lull him into an attack, then unleash your Art when he has already committed to his attack.", moves: [[-1, -1], [0, 1], [1, 1]], base: false, kanjiKey: "panda" },
  { id: "tiger", name: "Tiger", stamp: 'blue', text: "The power of your Art projects itself like a shadow. Sense your opponent's fear, and pounce with certainty and strength.", moves: [[0, 2], [0, -1]], base: true, kanjiKey: "tiger" },
  { id: "rat", name: "Rat", stamp: 'red', text: "Your opponent cannot attack when he cannot predict. Let your movements be immediate, your attacks be unexpected.", moves: [[-1, 0], [0, 1], [1, -1]], base: false, kanjiKey: "rat" },
  { id: "viper", name: "Viper", stamp: 'red', text: "The Art of the Viper is to strike in the Moment. This is the true Art.", moves: [[-2, 0], [0, 1], [1, -1]], base: false, kanjiKey: "viper" },
  { id: "eel", name: "Eel", stamp: 'blue', text: "If your opponent strikes with fire, counter with water, becoming completely fluid and freeflowing.", moves: [[-1, 1], [-1, -1], [1, 0]], base: true, kanjiKey: "eel" },
  { id: "fox", name: "Fox", stamp: 'red', text: "Hurry your opponent through your Art, give him no time to think, less time to act.", moves: [[1, 1], [1, 0], [1, -1]], base: false, kanjiKey: "fox" },
  { id: "dog", name: "Dog", stamp: 'blue', text: "Deny your opponent his Art. Once you have blocked his attack, do not let him go, but instead relentlessly hamper his momentum.", moves: [[-1, 1], [-1, 0], [-1, -1]], base: false, kanjiKey: "dog" },
  { id: "ox", name: "Ox", stamp: 'blue', text: "Pour your strength into the forms of your Art. In it's punches, it's kicks, in the steady advance of your agression.", moves: [[0, 1], [1, 0], [0, -1]], base: true, kanjiKey: "ox" },
  { id: "sea-snake", name: "Sea Snake", stamp: 'blue', text: "There is no movement or opportunity wasted. Strike where you are not expected, flow where your opponent believes you cannot be.", moves: [[-1, -1], [0, 1], [2, 0]], base: false, kanjiKey: "seasnake" },
  { id: "bear", name: "Bear", stamp: 'blue', text: "Defend your ground. Do not be like those fools who are quick to run to attack from another position. They have lost the fight because they have already run from it.", moves: [[-1, 1], [0, 1], [1, -1]], base: false, kanjiKey: "bear" },
  { id: "rabbit", name: "Rabbit", stamp: 'blue', text: "Be near to your opponent, blinding him with your speed. The Art of the Rabbit is the Art of speed.", moves: [[-1, -1], [1, 1], [2, 0]], base: true, kanjiKey: "rabbit" },
  { id: "cobra", name: "Cobra", stamp: 'red', text: "Attack violently when your opponents are not expecting it - show leisure in the beginning, then suddenly attack vigorously.", moves: [[-1, 0], [1, 1], [1, -1]], base: true, kanjiKey: "cobra" },
  { id: "phoenix", name: "Phoenix", stamp: 'blue', text: "No opponent expects that which he believes is not there. Harness the shadows, bend the sun, strike as the wind - from a place unseen.", moves: [[-2, 0], [-1, 1], [1, 1], [2, 0]], base: false, kanjiKey: "phoenix" },
  { id: "mouse", name: "Mouse", stamp: 'blue', text: "All opponents have a hole in their Art, an opening of weakness. The Art of the Mouse is to find that opening, enter it, and strike.", moves: [[-1, -1], [0, 1], [1, 0]], base: false, kanjiKey: "mouse" },
  { id: "boar", name: "Boar", stamp: 'red', text: "Watch for opportunity, for it will present itself. Then strike, focusing all your might into a single rush, trampling your opponent's Art under your own.", moves: [[-1, 0], [0, 1], [1, 0]], base: true, kanjiKey: "boar" },
  { id: "iguana", name: "Iguana", stamp: 'red', text: "While your opponent wears himself out with unnecessary movement, you will gather your strength. A devastating sweep or fatal punch is the pinnacle of the Art.", moves: [[-2, 1], [0, 1], [1, -1]], base: false, kanjiKey: "iguana" },
  { id: "crane", name: "Crane", stamp: 'blue', text: "Make no unnecessary movement, conserving your strength until the time is right to strike. The true Art is a symphony of graceful strikes.", moves: [[-1, -1], [0, 1], [1, -1]], base: true, kanjiKey: "crane" },
  { id: "frog", name: "Frog", stamp: 'red', text: "Do not fail to learn from the pure voice of an ever flowing mountain stream spashing over the rocks. Emulate it's flow, mimic it's power.", moves: [[-2, 0], [-1, 1], [1, -1]], base: true, kanjiKey: "frog" },
  { id: "crab", name: "Crab", stamp: 'blue', text: "Move with your opponent's movements, as if you are the mever-ceasing tide. When the time is right, he will fall prey to your attack.", moves: [[-2, 0], [0, 1], [2, 0]], base: true, kanjiKey: "crab" },
  { id: "elephant", name: "Elephant", stamp: 'red', text: "Only the strong may pursue your Art. This is why it is the true Art, the Art that cannot be stopped.", moves: [[-1, 1], [-1, 0], [1, 1], [1, 0]], base: true, kanjiKey: "elephant" },
  { id: "sable", name: "Sable", stamp: 'blue', text: "Be fluid, and control the battlefield with constant movement and precision strikes.", moves: [[-2, 0], [-1, -1], [1, 1]], base: false, kanjiKey: "sable" },
  { id: "goose", name: "Goose", stamp: 'blue', text: "Your robes are your cloak of feathers; spread your wings to hide your intentions. Even then, as your opponent seeks to determine your motive, you shall strike.", moves: [[-1, 1], [-1, 0], [1, 0], [1, -1]], base: true, kanjiKey: "goose" },
  { id: "tanuki", name: "Tanuki", stamp: 'blue', text: "The Art of the Tanuki is the Art of opportunity. Patience will open the door to the perfect angle of your strike.", moves: [[-1, -1], [0, 1], [2, 1]], base: false, kanjiKey: "tanuki" },
  { id: "horse", name: "Horse", stamp: 'red', text: "Lose yourself in the rhythm of your Art. At times be swift and decisive, at other times measured and taunting.", moves: [[-1, 0], [0, 1], [0, -1]], base: true, kanjiKey: "horse" },
  { id: "monkey", name: "Monkey", stamp: 'blue', text: "Without deception you cannot carry out strategy, without strategy you cannot control the opponent.", moves: [[-1, 1], [-1, -1], [1, 1], [1, -1]], base: true, kanjiKey: "monkey" },
  { id: "mantis", name: "Mantis", stamp: 'red', text: "Your opponent sees, but does not understand. Distract the watchful, misguide the wary. This is the Art of the Mantis, the Art of the deceptive strike.", moves: [[-1, 1], [0, -1], [1, 1]], base: true, kanjiKey: "mantis" },
  { id: "rooster", name: "Rooster", stamp: 'red', text: "Do not allow your enemy to rest, but focus your Art to deliver quick, sharp strikes whenever he lags.", moves: [[-1, 0], [-1, -1], [1, 1], [1, 0]], base: true, kanjiKey: "rooster" },
  { id: "otter", name: "Otter", stamp: 'red', text: "Who can stop the flowing stream? The Art of the Otter is the Art of Power, knocking away the advances of the opponent through sustained, powerful strikes.", moves: [[-1, 1], [1, -1], [2, 0]], base: false, kanjiKey: "otter" },
  { id: "kirin", name: "Kirin", stamp: 'red', text: "There is Art in grace, Art in discernment, Art in sensing the truth. Pierce the veil of the shadow, and strike your opponent from a place of enlightenment.", moves: [[-1, 2], [0, -2], [1, 2]], base: false, kanjiKey: "kirin" },
  { id: "turtle", name: "Turtle", stamp: 'red', text: "Within your sphere of power, your Art remains supreme. Engage your opponent, and deflect his strikes.", moves: [[-2, 0], [-1, -1], [1, -1], [2, 0]], base: false, kanjiKey: "turtle" },
]

export const CARD_BY_ID: Readonly<Record<string, CardDef>> = Object.fromEntries(CARDS.map((c) => [c.id, c]))
export const BASE_CARDS: readonly CardDef[] = CARDS.filter((c) => c.base)

/** Board size and each colour's home row / temple arch square (x, y). Red's home is row 0. */
export const SIZE = 5
export const HOME_ROW: Readonly<Record<Color, number>> = { red: 0, blue: 4 }
export const TEMPLE: Readonly<Record<Color, readonly [number, number]>> = { red: [2, 0], blue: [2, 4] }

/** Safety cap: the official game has no draw, but simulation must always end. */
export const PLY_CAP = 200
