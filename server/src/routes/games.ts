import { Router, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import prisma from '../lib/prisma.js'
import { generateJoinCode } from '../lib/joinCode.js'
import { emitGameInstanceUpdate } from '../lib/socket.js'

const router = Router()

// List available game types
router.get('/games', async (_req: Request, res: Response) => {
  try {
    const games = await prisma.game.findMany({
      orderBy: { name: 'asc' },
    })
    res.json(games)
  } catch (error) {
    console.error('List games error:', error)
    res.status(500).json({ error: 'Failed to list games' })
  }
})

// Create a game instance (requires auth)
router.post('/games/instances', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Must be logged in to create a game' })
    }
    const raw = req.body as { gameId?: string | number; options?: Record<string, unknown> }
    const gameId = raw?.gameId != null ? String(raw.gameId) : undefined
    if (!gameId) {
      return res.status(400).json({ error: 'gameId is required' })
    }
    const game = await prisma.game.findUnique({ where: { id: gameId } })
    if (!game) {
      return res.status(404).json({ error: 'Game not found' })
    }
    let gameState: Record<string, unknown> = { status: 'lobby' }
    if (game.slug === 'tic-tac-toe') {
      gameState = { status: 'lobby', requiredPlayerCount: 2 }
    }
    let joinCode = generateJoinCode()
    let existing = await prisma.gameInstance.findUnique({ where: { joinCode } })
    while (existing) {
      joinCode = generateJoinCode()
      existing = await prisma.gameInstance.findUnique({ where: { joinCode } })
    }
    const userId = (req.user as { id: string }).id
    const instance = await prisma.gameInstance.create({
      data: {
        gameId,
        hostUserId: userId,
        joinCode,
        gameState: gameState as Prisma.InputJsonValue,
      },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: true,
      },
    })
    res.status(201).json(instance)
  } catch (error) {
    console.error('Create game instance error:', error)
    res.status(500).json({ error: 'Failed to create game' })
  }
})

// Get game instance by join code (public for join page)
router.get('/games/instances/by-code/:joinCode', async (req: Request, res: Response) => {
  try {
    const { joinCode } = req.params
    const instance = await prisma.gameInstance.findUnique({
      where: { joinCode: joinCode.toUpperCase() },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: { orderBy: { playerOrder: 'asc' } },
      },
    })
    if (!instance) {
      return res.status(404).json({ error: 'Game not found' })
    }
    res.json(instance)
  } catch (error) {
    console.error('Get game instance error:', error)
    res.status(500).json({ error: 'Failed to load game' })
  }
})

// Get game instance by id (for host/players with socket updates)
router.get('/games/instances/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const instance = await prisma.gameInstance.findUnique({
      where: { id },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: { orderBy: { playerOrder: 'asc' } },
      },
    })
    if (!instance) {
      return res.status(404).json({ error: 'Game not found' })
    }
    res.json(instance)
  } catch (error) {
    console.error('Get game instance error:', error)
    res.status(500).json({ error: 'Failed to load game' })
  }
})

function getStatus(gameState: Prisma.JsonValue | null): string | null {
  if (gameState && typeof gameState === 'object' && 'status' in gameState) {
    return String((gameState as Record<string, unknown>).status)
  }
  return null
}

function getRequiredPlayerCount(gameState: Prisma.JsonValue | null): number | null {
  if (gameState && typeof gameState === 'object' && 'requiredPlayerCount' in gameState) {
    const v = (gameState as Record<string, unknown>).requiredPlayerCount
    return typeof v === 'number' ? v : null
  }
  return null
}

function randomJoinToken(): string {
  return randomBytes(16).toString('hex')
}

// Join a game (optional auth). If screenName empty, server assigns "Player 1" / "Player 2" etc.
router.post('/games/instances/:id/join', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { screenName } = req.body as { screenName?: string }
    const screenNameTrimmed = typeof screenName === 'string' ? screenName.trim() : ''
    const instance = await prisma.gameInstance.findUnique({
      where: { id },
      include: { players: true },
    })
    if (!instance) {
      return res.status(404).json({ error: 'Game not found' })
    }
    const status = getStatus(instance.gameState)
    if (status !== 'lobby') {
      return res.status(400).json({ error: 'Game has already started' })
    }
    const requiredPlayerCount = getRequiredPlayerCount(instance.gameState) ?? 2
    if (instance.players.length >= requiredPlayerCount) {
      return res.status(400).json({ error: 'Game is full' })
    }
    const userId = req.isAuthenticated() && req.user ? (req.user as { id: string }).id : null
    const playerOrder = instance.players.length
    const displayName =
      screenNameTrimmed.length > 0
        ? screenNameTrimmed.slice(0, 50)
        : `Player ${playerOrder + 1}`
    const joinToken = randomJoinToken()
    const colorOrder = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'] as const
    const usedColors = new Set(instance.players.map((p) => p.color).filter(Boolean))
    const defaultColor = colorOrder.find((c) => !usedColors.has(c)) ?? null
    const player = await prisma.gameInstancePlayer.create({
      data: {
        gameInstanceId: id,
        userId,
        screenName: displayName,
        color: defaultColor,
        joinToken,
        playerOrder,
      },
    })
    const updated = await prisma.gameInstance.findUnique({
      where: { id },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: { orderBy: { playerOrder: 'asc' } },
      },
    })
    if (updated) {
      emitGameInstanceUpdate(id, updated)
    }
    res.status(201).json({ instance: updated, player })
  } catch (error) {
    console.error('Join game error:', error)
    res.status(500).json({ error: 'Failed to join game' })
  }
})

const ALLOWED_COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'] as const

// Update current player's screenName and/or color (by playerOrder; no auth required for anonymous)
router.patch('/games/instances/:id/players', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { playerOrder, screenName, color } = req.body as {
      playerOrder?: number
      screenName?: string
      color?: string
    }
    if (typeof playerOrder !== 'number' || playerOrder < 0) {
      return res.status(400).json({ error: 'playerOrder is required' })
    }
    const instance = await prisma.gameInstance.findUnique({
      where: { id },
      include: { players: true },
    })
    if (!instance) {
      return res.status(404).json({ error: 'Game not found' })
    }
    if (getStatus(instance.gameState) !== 'lobby') {
      return res.status(400).json({ error: 'Cannot update player after game has started' })
    }
    const player = instance.players.find((p) => p.playerOrder === playerOrder)
    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }
    const updates: { screenName?: string; color?: string | null } = {}
    if (typeof screenName === 'string') {
      const trimmed = screenName.trim().slice(0, 50)
      updates.screenName = trimmed.length > 0 ? trimmed : player.screenName
    }
    if (color !== undefined) {
      if (color === null || color === '') {
        updates.color = null
      } else {
        const c = String(color).toLowerCase()
        if (!ALLOWED_COLORS.includes(c as (typeof ALLOWED_COLORS)[number])) {
          return res.status(400).json({ error: 'Invalid color' })
        }
        const used = new Set(instance.players.filter((p) => p.playerOrder !== playerOrder).map((p) => p.color).filter(Boolean))
        if (used.has(c)) {
          return res.status(400).json({ error: 'Color already taken' })
        }
        updates.color = c
      }
    }
    const updatedPlayer = await prisma.gameInstancePlayer.update({
      where: { id: player.id },
      data: updates,
    })
    const updated = await prisma.gameInstance.findUnique({
      where: { id },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: { orderBy: { playerOrder: 'asc' } },
      },
    })
    if (updated) {
      emitGameInstanceUpdate(id, updated)
    }
    res.json({ instance: updated, player: updatedPlayer })
  } catch (error) {
    console.error('Update player error:', error)
    res.status(500).json({ error: 'Failed to update player' })
  }
})

// Start game (host or first player with valid joinToken)
router.post('/games/instances/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { joinToken } = req.body as { joinToken?: string }
    const instance = await prisma.gameInstance.findUnique({
      where: { id },
      include: { game: true, players: true },
    })
    if (!instance) {
      return res.status(404).json({ error: 'Game not found' })
    }
    const isHost = req.isAuthenticated() && req.user && instance.hostUserId === (req.user as { id: string }).id
    const firstPlayer = instance.players.find((p) => p.playerOrder === 0)
    const canStartWithToken = joinToken && firstPlayer?.joinToken && firstPlayer.joinToken === joinToken
    if (!isHost && !canStartWithToken) {
      return res.status(403).json({ error: 'Only the host or the first player can start the game' })
    }
    const status = getStatus(instance.gameState)
    if (status !== 'lobby') {
      return res.status(400).json({ error: 'Game already started or finished' })
    }
    const requiredPlayerCount = getRequiredPlayerCount(instance.gameState) ?? 2
    if (instance.players.length < requiredPlayerCount) {
      return res.status(400).json({ error: 'Not enough players' })
    }
    const state = (instance.gameState as Record<string, unknown>) || {}
    let gameState: Record<string, unknown> = {}
    if (instance.game.slug === 'tic-tac-toe') {
      gameState = {
        ...state,
        status: 'in_progress',
        board: [['', '', ''], ['', '', ''], ['', '', '']],
        currentTurnPlayerOrder: 0,
        winner: null,
      }
    }
    const updated = await prisma.gameInstance.update({
      where: { id },
      data: { gameState: gameState as Prisma.InputJsonValue },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: { orderBy: { playerOrder: 'asc' } },
      },
    })
    emitGameInstanceUpdate(id, updated)
    res.json(updated)
  } catch (error) {
    console.error('Start game error:', error)
    res.status(500).json({ error: 'Failed to start game' })
  }
})

// Make a move (player whose turn it is)
router.post('/games/instances/:id/move', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { playerOrder, row, col } = req.body as { playerOrder?: number; row?: number; col?: number }
    const instance = await prisma.gameInstance.findUnique({
      where: { id },
      include: { game: true, players: true },
    })
    if (!instance) {
      return res.status(404).json({ error: 'Game not found' })
    }
    const state = instance.gameState as Record<string, unknown> | null
    const status = state?.status as string | undefined
    if (status !== 'in_progress' && status !== 'playing') {
      return res.status(400).json({ error: 'Game is not in progress' })
    }
    if (!state || instance.game.slug !== 'tic-tac-toe') {
      return res.status(400).json({ error: 'Invalid game state' })
    }
    const board = state.board as string[][]
    const currentTurn = (state.currentTurnPlayerOrder as number) ?? 0
    if (playerOrder !== currentTurn) {
      return res.status(400).json({ error: 'Not your turn' })
    }
    const r = typeof row === 'number' ? row : parseInt(String(row), 10)
    const c = typeof col === 'number' ? col : parseInt(String(col), 10)
    if (r < 0 || r > 2 || c < 0 || c > 2 || board[r][c] !== '') {
      return res.status(400).json({ error: 'Invalid move' })
    }
    const marks = ['X', 'O']
    const mark = marks[currentTurn] ?? 'X'
    const newBoard = board.map((rowArr: string[], ri: number) =>
      rowArr.map((cell: string, ci: number) => (ri === r && ci === c ? mark : cell))
    )
    let winner: number | null = null
    let newStatus: string = 'playing'
    const checkLine = (a: string, b: string, c: string) => a && a === b && b === c
    for (let i = 0; i < 3; i++) {
      if (checkLine(newBoard[i][0], newBoard[i][1], newBoard[i][2])) {
        winner = mark === 'X' ? 0 : 1
        newStatus = 'won'
        break
      }
      if (checkLine(newBoard[0][i], newBoard[1][i], newBoard[2][i])) {
        winner = mark === 'X' ? 0 : 1
        newStatus = 'won'
        break
      }
    }
    if (!winner && checkLine(newBoard[0][0], newBoard[1][1], newBoard[2][2])) {
      winner = mark === 'X' ? 0 : 1
      newStatus = 'won'
    }
    if (!winner && checkLine(newBoard[0][2], newBoard[1][1], newBoard[2][0])) {
      winner = mark === 'X' ? 0 : 1
      newStatus = 'won'
    }
    const full = newBoard.every((rowArr: string[]) => rowArr.every((cell: string) => cell !== ''))
    if (!winner && full) {
      newStatus = 'draw'
    }
    const nextTurn = newStatus === 'playing' ? (currentTurn + 1) % 2 : currentTurn
    const gameState = {
      ...state,
      board: newBoard,
      currentTurnPlayerOrder: nextTurn,
      winner,
      status: newStatus,
    }
    const updated = await prisma.gameInstance.update({
      where: { id },
      data: { gameState: gameState as Prisma.InputJsonValue },
      include: {
        game: true,
        hostUser: { select: { id: true, email: true, name: true } },
        players: { orderBy: { playerOrder: 'asc' } },
      },
    })
    emitGameInstanceUpdate(id, updated)
    res.json(updated)
  } catch (error) {
    console.error('Move error:', error)
    res.status(500).json({ error: 'Failed to make move' })
  }
})

export default router
