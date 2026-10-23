import { Router, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import prisma from '../lib/prisma.js'
import { generateJoinCode } from '../lib/joinCode.js'
import { getGame } from '../games/registry.js'
import {
  broadcastInstance,
  instanceInclude,
  loadInstance,
  lobbySafe,
  moduleFor,
  playerViewFor,
  seatInfos,
  seatTokenValid,
  serverRng,
  storedState,
  type StoredGameState,
} from '../lib/gameInstances.js'

/**
 * Generic game routes. Nothing here knows any game's rules: everything game-specific goes
 * through the GameModule from the registry (server/src/games/registry.ts).
 */
const router = Router()

const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'] as const

function sessionUserId(req: Request): string | null {
  return req.isAuthenticated() && req.user ? (req.user as { id: string }).id : null
}

/** Write gameState only if nobody else wrote since `version`. Returns false on conflict. */
async function versionedWrite(id: string, version: number, gameState: StoredGameState): Promise<boolean> {
  const res = await prisma.gameInstance.updateMany({
    where: { id, version },
    data: { gameState: gameState as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
  })
  return res.count === 1
}

async function bumpVersion(id: string) {
  await prisma.gameInstance.update({ where: { id }, data: { version: { increment: 1 } } })
}

// List available game types (only games that exist in the registry)
router.get('/games', async (_req: Request, res: Response) => {
  try {
    const games = await prisma.game.findMany({ orderBy: { name: 'asc' } })
    res.json(
      games
        .map((g) => ({ g, mod: getGame(g.slug) }))
        .filter(({ mod }) => mod)
        .map(({ g, mod }) => ({ id: g.id, slug: g.slug, name: g.name, minPlayers: mod!.minPlayers, maxPlayers: mod!.maxPlayers }))
    )
  } catch (error) {
    console.error('List games error:', error)
    res.status(500).json({ error: 'Failed to list games' })
  }
})

// Create a game instance (requires auth)
router.post('/games/instances', async (req: Request, res: Response) => {
  try {
    const userId = sessionUserId(req)
    if (!userId) return res.status(401).json({ error: 'Must be logged in to create a game' })
    const raw = req.body as { gameId?: string | number }
    const gameId = raw?.gameId != null ? String(raw.gameId) : undefined
    if (!gameId) return res.status(400).json({ error: 'gameId is required' })
    const game = await prisma.game.findUnique({ where: { id: gameId } })
    if (!game || !getGame(game.slug)) return res.status(404).json({ error: 'Game not found' })
    let joinCode = generateJoinCode()
    while (await prisma.gameInstance.findUnique({ where: { joinCode } })) joinCode = generateJoinCode()
    const gameState: StoredGameState = { phase: 'lobby' }
    const instance = await prisma.gameInstance.create({
      data: { gameId, hostUserId: userId, joinCode, gameState: gameState as unknown as Prisma.InputJsonValue },
      include: instanceInclude,
    })
    res.status(201).json(lobbySafe(instance))
  } catch (error) {
    console.error('Create game instance error:', error)
    res.status(500).json({ error: 'Failed to create game' })
  }
})

// Lobby-safe instance by join code (public, for the join page)
router.get('/games/instances/by-code/:joinCode', async (req: Request, res: Response) => {
  try {
    const found = await prisma.gameInstance.findUnique({
      where: { joinCode: req.params.joinCode.toUpperCase() },
      include: instanceInclude,
    })
    if (!found) return res.status(404).json({ error: 'Game not found' })
    res.json(lobbySafe(found))
  } catch (error) {
    console.error('Get game instance error:', error)
    res.status(500).json({ error: 'Failed to load game' })
  }
})

// Lobby-safe instance by id (public: the TV and phones)
router.get('/games/instances/:id', async (req: Request, res: Response) => {
  try {
    const instance = await loadInstance(req.params.id)
    if (!instance) return res.status(404).json({ error: 'Game not found' })
    res.json(lobbySafe(instance))
  } catch (error) {
    console.error('Get game instance error:', error)
    res.status(500).json({ error: 'Failed to load game' })
  }
})

// One seat's private view (phone load + resync). Requires that seat's joinToken.
router.get('/games/instances/:id/me', async (req: Request, res: Response) => {
  try {
    const instance = await loadInstance(req.params.id)
    if (!instance) return res.status(404).json({ error: 'Game not found' })
    const playerOrder = Number(req.query.playerOrder)
    if (!seatTokenValid(instance, playerOrder, req.query.joinToken)) {
      return res.status(403).json({ error: 'Invalid seat' })
    }
    res.json({ instance: lobbySafe(instance), playerOrder, playerView: playerViewFor(instance, playerOrder), version: instance.version })
  } catch (error) {
    console.error('Get seat view error:', error)
    res.status(500).json({ error: 'Failed to load game' })
  }
})

// Join a game (optional auth). The joinToken is returned ONLY here, only to the joiner.
router.post('/games/instances/:id/join', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { screenName } = req.body as { screenName?: string }
    const trimmed = typeof screenName === 'string' ? screenName.trim() : ''
    const instance = await loadInstance(id)
    if (!instance) return res.status(404).json({ error: 'Game not found' })
    const mod = moduleFor(instance)
    if (!mod) return res.status(400).json({ error: 'Unknown game type' })
    if (storedState(instance).phase !== 'lobby') return res.status(400).json({ error: 'Game has already started' })
    if (instance.players.length >= mod.maxPlayers) return res.status(400).json({ error: 'Game is full' })
    const playerOrder = instance.players.length
    const usedColors = new Set(instance.players.map((p) => p.color).filter(Boolean))
    const joinToken = randomBytes(16).toString('hex')
    let player
    try {
      player = await prisma.gameInstancePlayer.create({
        data: {
          gameInstanceId: id,
          userId: sessionUserId(req),
          screenName: trimmed.length > 0 ? trimmed.slice(0, 50) : `Player ${playerOrder + 1}`,
          color: PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? null,
          joinToken,
          playerOrder,
        },
      })
    } catch (err) {
      // Two phones raced for the same seat: the loser retries.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'Someone joined at the same moment — try again' })
      }
      throw err
    }
    await bumpVersion(id)
    const updated = await loadInstance(id)
    if (updated) broadcastInstance(updated)
    res.status(201).json({
      instance: updated ? lobbySafe(updated) : null,
      player: { playerOrder: player.playerOrder, screenName: player.screenName, color: player.color, joinToken },
    })
  } catch (error) {
    console.error('Join game error:', error)
    res.status(500).json({ error: 'Failed to join game' })
  }
})

// Update your own seat's name/color in the lobby. Requires that seat's joinToken.
router.patch('/games/instances/:id/players', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { playerOrder, joinToken, screenName, color } = req.body as {
      playerOrder?: number
      joinToken?: string
      screenName?: string
      color?: string | null
    }
    const instance = await loadInstance(id)
    if (!instance) return res.status(404).json({ error: 'Game not found' })
    if (!seatTokenValid(instance, playerOrder, joinToken)) return res.status(403).json({ error: 'Invalid seat' })
    if (storedState(instance).phase !== 'lobby') {
      return res.status(400).json({ error: 'Cannot update player after game has started' })
    }
    const player = instance.players.find((p) => p.playerOrder === playerOrder)!
    const updates: { screenName?: string; color?: string | null } = {}
    if (typeof screenName === 'string') {
      const t = screenName.trim().slice(0, 50)
      updates.screenName = t.length > 0 ? t : player.screenName
    }
    if (color !== undefined) {
      if (color === null || color === '') {
        updates.color = null
      } else {
        const c = String(color).toLowerCase()
        if (!PLAYER_COLORS.includes(c as (typeof PLAYER_COLORS)[number])) return res.status(400).json({ error: 'Invalid color' })
        const taken = instance.players.some((p) => p.playerOrder !== playerOrder && p.color === c)
        if (taken) return res.status(400).json({ error: 'Color already taken' })
        updates.color = c
      }
    }
    await prisma.gameInstancePlayer.update({ where: { id: player.id }, data: updates })
    await bumpVersion(id)
    const updated = await loadInstance(id)
    if (updated) broadcastInstance(updated)
    res.json({ instance: updated ? lobbySafe(updated) : null })
  } catch (error) {
    console.error('Update player error:', error)
    res.status(500).json({ error: 'Failed to update player' })
  }
})

// Start: the host (session) or seat 0 (joinToken), once enough players have joined.
router.post('/games/instances/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { joinToken } = req.body as { joinToken?: string }
    const instance = await loadInstance(id)
    if (!instance) return res.status(404).json({ error: 'Game not found' })
    const mod = moduleFor(instance)
    if (!mod) return res.status(400).json({ error: 'Unknown game type' })
    const isHost = sessionUserId(req) === instance.hostUserId
    if (!isHost && !seatTokenValid(instance, 0, joinToken)) {
      return res.status(403).json({ error: 'Only the host or the first player can start the game' })
    }
    if (storedState(instance).phase !== 'lobby') return res.status(400).json({ error: 'Game already started or finished' })
    if (instance.players.length < mod.minPlayers) return res.status(400).json({ error: 'Not enough players' })
    const { state, events } = mod.setup(seatInfos(instance), serverRng)
    const phase = mod.isFinished(state) ? 'finished' : 'playing'
    if (!(await versionedWrite(id, instance.version, { phase, state }))) {
      return res.status(409).json({ error: 'The game changed — try again' })
    }
    const updated = (await loadInstance(id))!
    broadcastInstance(updated, events)
    res.json(lobbySafe(updated))
  } catch (error) {
    console.error('Start game error:', error)
    res.status(500).json({ error: 'Failed to start game' })
  }
})

// One action from a seat. Authenticated by joinToken; applied by the game's engine.
router.post('/games/instances/:id/action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { playerOrder, joinToken, action, version } = req.body as {
      playerOrder?: number
      joinToken?: string
      action?: unknown
      version?: number
    }
    const instance = await loadInstance(id)
    if (!instance) return res.status(404).json({ error: 'Game not found' })
    if (!seatTokenValid(instance, playerOrder, joinToken)) return res.status(403).json({ error: 'Invalid seat' })
    const seat = playerOrder as number
    const mod = moduleFor(instance)
    if (!mod) return res.status(400).json({ error: 'Unknown game type' })
    const { phase, state } = storedState(instance)
    if (phase !== 'playing' || state === undefined) return res.status(400).json({ error: 'Game is not in progress' })
    if (typeof version === 'number' && version !== instance.version) {
      return res.status(409).json({ error: 'The game changed — try again', playerView: playerViewFor(instance, seat), version: instance.version })
    }
    const result = mod.applyAction(state, seat, action, serverRng)
    if (!result.ok) return res.status(400).json({ error: result.error })
    const nextPhase = mod.isFinished(result.state) ? 'finished' : 'playing'
    if (!(await versionedWrite(id, instance.version, { phase: nextPhase, state: result.state }))) {
      const fresh = await loadInstance(id)
      return res.status(409).json({
        error: 'The game changed — try again',
        playerView: fresh ? playerViewFor(fresh, seat) : null,
        version: fresh?.version,
      })
    }
    const updated = (await loadInstance(id))!
    broadcastInstance(updated, result.events)
    res.json({ playerView: playerViewFor(updated, seat), version: updated.version })
  } catch (error) {
    console.error('Action error:', error)
    res.status(500).json({ error: 'Failed to apply action' })
  }
})

export default router
