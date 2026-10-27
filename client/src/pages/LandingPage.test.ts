import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { gameCover } from '../games/registry'
import { GameCard } from './LandingPage'

describe('home page game cards', () => {
  it('has cover art for every listed game, and none for the retired Tic-Tac-Toe', () => {
    expect(gameCover('dragonheart')).toMatch(/cover.*\.webp/)
    expect(gameCover('splendor')).toMatch(/cover.*\.webp/)
    expect(gameCover('tic-tac-toe')).toBeNull()
  })

  it('renders a card as just the cover image, clickable to play', () => {
    const game = { id: 'g1', slug: 'dragonheart', name: 'Dragonheart', minPlayers: 2, maxPlayers: 2 }
    const html = renderToString(createElement(GameCard, { game, busy: false, disabled: false, onOpen: () => {} }))
    expect(html).toContain(`src="${gameCover('dragonheart')}"`)
    expect(html).toContain('aria-label="Play Dragonheart"')
    expect(html).toContain('cursor-pointer')
    expect(html).not.toContain('cursor-not-allowed')
  })

  it('shows a setting-up overlay on the card being created', () => {
    const game = { id: 'g2', slug: 'splendor', name: 'Splendor', minPlayers: 2, maxPlayers: 4 }
    const html = renderToString(createElement(GameCard, { game, busy: true, disabled: true, onOpen: () => {} }))
    expect(html).toContain('Setting up…')
  })
})
