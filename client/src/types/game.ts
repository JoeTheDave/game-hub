/** Game catalog entry (GET /api/games). */
export interface Game {
  id: string
  slug: string
  name: string
  minPlayers: number
  maxPlayers: number
}

export type Phase = 'lobby' | 'playing' | 'finished'

/** A seat as every viewer sees it (never includes a joinToken). */
export interface LobbyPlayer {
  id: string
  playerOrder: number
  screenName: string
  color: string | null
  signedIn: boolean
}

/** Lobby-safe instance: what the server sends to the TV and every phone. */
export interface GameInstance {
  id: string
  joinCode: string
  phase: Phase
  version: number
  hostUserId: string
  game: Game
  players: LobbyPlayer[]
  /** The game's public tableView once started; null in the lobby. */
  tableView: unknown
}

/** Something that visibly happened (game-defined shape), for animation and sound. */
export interface GameEvent {
  type: string
  [k: string]: unknown
}

/** The TV's update stream: the new instance plus the events that produced it. */
export interface TableUpdate {
  instance: GameInstance
  events: GameEvent[]
  /** Increments for every update, so views can key animations. */
  seq: number
}
