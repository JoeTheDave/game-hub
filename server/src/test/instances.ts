import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { generateJoinCode } from '../lib/joinCode.js'

/**
 * Test helper: create a lobby instance of any registered game directly in the DB, bypassing
 * POST /api/games/instances. Route tests use Tic-Tac-Toe (simple and deterministic) even though
 * it is unlisted, so it can no longer be created through the API.
 */
export async function createInstanceDirect(slug: string, hostUserId: string): Promise<{ id: string; joinCode: string }> {
  const game = await prisma.game.findUniqueOrThrow({ where: { slug } })
  const inst = await prisma.gameInstance.create({
    data: {
      gameId: game.id,
      hostUserId,
      joinCode: generateJoinCode(),
      gameState: { phase: 'lobby' } as unknown as Prisma.InputJsonValue,
    },
  })
  return { id: inst.id, joinCode: inst.joinCode }
}
