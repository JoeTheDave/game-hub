/**
 * The look of Joe's original Onitama (github.com/JoeTheDave/onitama): its colour constants, each
 * card's "alignment" (which tints its move squares and wisdom band), and the ported art.
 */
import type { Color } from '@games/onitama/data'

/** `architecture/constants.js` colours from the original repo. */
export const REPO = {
  blue: 'rgb(90, 120, 140)',
  red: 'rgb(145, 85, 75)',
  green: 'rgb(130, 140, 120)',
  gray: 'rgb(150, 150, 150)',
  darkGray: 'rgb(68, 68, 68)',
  opaqueBlue: 'rgba(90, 120, 140, 0.4)',
  opaqueRed: 'rgba(145, 85, 75, 0.3)',
  opaqueGreen: 'rgba(130, 140, 120, 0.5)',
  opaqueWhite: 'rgba(255, 255, 255, 0.4)',
  characterColor: 'rgba(100, 100, 100, 0.6)',
  deepRed: 'rgb(119, 0, 0)',
  cardTan: 'rgba(224, 221, 191, 0.8)',
} as const

export type Alignment = 'left' | 'right' | 'center'

/** Per card, from the repo's `app/lib/cards.ts`. */
export const ALIGNMENT: Record<string, Alignment> = {
  dragon: 'center', giraffe: 'center', panda: 'right', tiger: 'center', rat: 'left', viper: 'left', eel: 'left', fox: 'right',
  dog: 'left', ox: 'right', 'sea-snake': 'right', bear: 'left', rabbit: 'right', cobra: 'right', phoenix: 'center', mouse: 'right',
  boar: 'center', iguana: 'left', crane: 'center', frog: 'left', crab: 'center', elephant: 'center', sable: 'right', goose: 'left',
  tanuki: 'right', horse: 'left', monkey: 'center', mantis: 'center', rooster: 'right', otter: 'left', kirin: 'center', turtle: 'center',
}

/** Move-square colour in the attack-pattern grid, by alignment (repo `AttackPatternGrid`). */
export const MOVE_COLOR: Record<Alignment, string> = { left: REPO.blue, center: REPO.green, right: REPO.red }
/** Wisdom-band colour along the bottom of the card, by alignment (repo `Card`). */
export const BAND_COLOR: Record<Alignment, string> = { left: REPO.opaqueBlue, center: REPO.opaqueGreen, right: REPO.opaqueRed }
/** The first-player box behind the master icon, by stamp colour. */
export const STAMP_COLOR: Record<Color, string> = { red: REPO.red, blue: REPO.blue }

export const alignmentOf = (id: string): Alignment => ALIGNMENT[id] ?? 'center'

const urls = (glob: Record<string, string>) =>
  Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]))

/** Ported SVG art: one animal per card (by card id), plus swish, master-icon and logo. */
export const REPO_SVG = urls(import.meta.glob('./assets/repo/svg/*.svg', { eager: true, query: '?url', import: 'default' }))

import MURAL from './assets/repo/mural.webp'
import CARD_TEXTURE from './assets/repo/card-texture.webp'
import BOARD_TEXTURE from './assets/repo/board-texture.webp'
import YIN_YANG from './assets/repo/ying-yang.webp'
import YIN_YANG_RED from './assets/repo/ying-yang-red.webp'
import YIN_YANG_BLUE from './assets/repo/ying-yang-blue.webp'
import INK_ONE from './assets/repo/ink-fighters-one.webp'
import INK_TWO from './assets/repo/ink-fighters-two.webp'
import LOGO from './assets/repo/logo.webp'

export const REPO_IMG = {
  mural: MURAL,
  cardTexture: CARD_TEXTURE,
  boardTexture: BOARD_TEXTURE,
  yinYang: YIN_YANG,
  yinYangRed: YIN_YANG_RED,
  yinYangBlue: YIN_YANG_BLUE,
  inkOne: INK_ONE,
  inkTwo: INK_TWO,
  logo: LOGO,
} as const
