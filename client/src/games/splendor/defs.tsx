import { createContext, useContext, useRef, type ReactNode } from 'react'
import { CARD_BY_ID, NOBLE_BY_ID, type CardDef } from '@games/splendor/data'

/**
 * Card definitions and noble portraits for the game on screen. A "Randomize card content" game's
 * cards exist only in its state, so the views send the definitions of every card the viewer can
 * see (`view.cardDefs`) and the pairing of nobles to portraits (`view.noblePortraits`).
 * Components read them from here, falling back to the default set.
 */
interface Defs {
  cards: Readonly<Record<string, CardDef>>
  portraits: Readonly<Record<string, string>>
}

const DefsContext = createContext<Defs>({ cards: {}, portraits: {} })

export function DefsProvider({ value, children }: { value: Defs; children: ReactNode }) {
  return <DefsContext.Provider value={value}>{children}</DefsContext.Provider>
}

/**
 * Accumulates the card definitions a screen has seen, so a card that leaves view mid-animation
 * (e.g. reserved from the board) can still be drawn while it flies. Ids are unique per generated
 * deck, so accumulating never mixes games. Portraits follow the latest view; a rematch can
 * re-pair the same noble ids.
 */
export function useAccumulatedDefs(view: { cardDefs?: Record<string, CardDef>; noblePortraits?: Record<string, string> }): Defs {
  const cards = useRef<Record<string, CardDef>>({})
  if (view.cardDefs) Object.assign(cards.current, view.cardDefs)
  return { cards: cards.current, portraits: view.noblePortraits ?? {} }
}

export function cardDefFrom(defs: Defs, id: string): CardDef | undefined {
  return defs.cards[id] ?? CARD_BY_ID[id]
}

export function useCardDef(id: string): CardDef | undefined {
  return cardDefFrom(useContext(DefsContext), id)
}

export function useDefs(): Defs {
  return useContext(DefsContext)
}

export function useNoblePortrait(nobleId: string): string | undefined {
  const defs = useContext(DefsContext)
  return defs.portraits[nobleId] ?? NOBLE_BY_ID[nobleId]?.portrait
}
