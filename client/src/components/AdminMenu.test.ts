import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminMenu } from './AdminMenu'
import { GameOptions } from './GameOptions'
import type { GameInstance, LobbyPlayer } from '../types/game'

const players: LobbyPlayer[] = [
  { id: 'a', playerOrder: 0, screenName: 'Joe', color: 'red', signedIn: false },
  { id: 'b', playerOrder: 1, screenName: 'Jeff', color: 'blue', signedIn: false },
]
const promote = async () => true

describe('AdminMenu', () => {
  it('renders nothing for a non-admin phone', () => {
    expect(renderToString(createElement(AdminMenu, { isAdmin: false, playerOrder: 1, players, promote }))).toBe('')
  })
  it('renders a small Players button (no "admin" label on screen) for the admin', () => {
    const html = renderToString(createElement(AdminMenu, { isAdmin: true, playerOrder: 0, players, promote }))
    expect(html).toContain('data-admin-menu')
    expect(html).toContain('aria-label="Players"')
    expect(html.toLowerCase()).not.toContain('>admin<')
  })
})

describe('GameOptions', () => {
  const instance = {
    optionsSchema: [{ key: 'random', label: 'Randomize card content', type: 'boolean', default: false }],
    options: { random: true },
  } as unknown as GameInstance

  it('renders each option as a checkbox with its label and value', () => {
    const html = renderToString(createElement(GameOptions, { instance, editable: true }))
    expect(html).toContain('Randomize card content')
    expect(html).toContain('checked')
    expect(html).not.toContain('disabled')
  })
  it('is read-only for non-admins', () => {
    const html = renderToString(createElement(GameOptions, { instance, editable: false }))
    expect(html).toContain('disabled')
  })
  it('renders nothing when the game has no options', () => {
    expect(renderToString(createElement(GameOptions, { instance: {} as GameInstance, editable: true }))).toBe('')
  })
})
