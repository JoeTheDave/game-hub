export interface Game {
  id: string
  slug: string
  name: string
  options: Record<string, unknown> | null
}

export interface GameInstancePlayer {
  id: string
  gameInstanceId: string
  userId: string | null
  screenName: string
  color: string | null
  joinToken: string | null
  playerOrder: number
  joinedAt: string
}

/** Top-level instance status and optional requiredPlayerCount live in gameState. */
export interface GameInstanceGameState {
  status?: 'lobby' | 'in_progress' | 'finished'
  requiredPlayerCount?: number
  [key: string]: unknown
}

export interface GameInstance {
  id: string
  gameId: string
  hostUserId: string
  joinCode: string
  gameState: (GameInstanceGameState & TicTacToeState) | null
  game: Game
  hostUser: { id: string; email: string; name: string | null }
  players: GameInstancePlayer[]
}

export interface TicTacToeState {
  board?: string[][]
  currentTurnPlayerOrder?: number
  winner?: number | null
  status?: 'playing' | 'won' | 'draw'
}
