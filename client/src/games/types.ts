import type { ComponentType } from 'react'
import type { GameEvent, GameInstance, LobbyPlayer } from '../types/game'
import type { SoundBoard } from '../lib/soundBoard'

/** Props for a game's shared-screen (TV) view. */
export interface TableViewProps<V = unknown> {
  instance: GameInstance
  /** The engine's tableView for the state AFTER `events` were applied. */
  view: V
  players: LobbyPlayer[]
  /** What just happened (empty after a resync or on first load: render without animation). */
  events: GameEvent[]
  /** Increments per update; use as a key for one-shot animations. */
  seq: number
  /**
   * Call once this update's animation is finished, so the next queued update can play.
   * If never called, the platform moves on after 4s. Call immediately if you don't animate.
   */
  onEventsDone: () => void
  sound: SoundBoard
}

/** Props for a game's phone (controller) view. Rendered inside the full-screen phone shell. */
export interface PhoneViewProps<V = unknown, A = unknown> {
  instance: GameInstance
  /** The engine's playerView for this seat. */
  view: V
  playerOrder: number
  me: LobbyPlayer | undefined
  players: LobbyPlayer[]
  /** Sends one action to the engine. Resolves true when applied; false on a rejection (see error). */
  sendAction: (action: A) => Promise<boolean>
  /** True while an action is in flight. */
  pending: boolean
  /** The last rejection message from the engine/server, or null. */
  error: string | null
  clearError: () => void
}

export interface ClientGameModule {
  slug: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TableView: ComponentType<TableViewProps<any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PhoneView: ComponentType<PhoneViewProps<any, any>>
  /** Optional: called once when the table screen mounts (register sounds, preload art). */
  prepareTable?: (sound: SoundBoard) => void
}
