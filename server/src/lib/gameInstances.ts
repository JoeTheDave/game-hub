import { randomInt } from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from './prisma.js'
import { GAMES, getGame } from '../games/registry.js'
import type { GameEvent, GameModule, Rng, SeatInfo } from '../games/types.js'
import { emitToSeat, emitToTable } from './socket.js'

export type Phase = 'lobby' | 'playing' | 'finished'

/** Shape of GameInstance.gameState. The platform owns `phase`; the engine owns `state`. */
export interface StoredGameState {
  phase: Phase
  state?: unknown
}

export const instanceInclude = {
  game: true,
  hostUser: { select: { id: true, name: true } },
  players: { orderBy: { playerOrder: 'asc' as const } },
} satisfies Prisma.GameInstanceInclude

export type LoadedInstance = Prisma.GameInstanceGetPayload<{ include: typeof instanceInclude }>

/** Server-side rng for live games (simulation and tests inject a seeded one instead). */
export const serverRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32

export function loadInstance(id: string) {
  return prisma.gameInstance.findUnique({ where: { id }, include: instanceInclude })
}

export function storedState(instance: { gameState: Prisma.JsonValue | null }): StoredGameState {
  const gs = instance.gameState as Partial<StoredGameState> | null
  const phase: Phase = gs?.phase === 'playing' || gs?.phase === 'finished' ? gs.phase : 'lobby'
  return { phase, state: gs?.state }
}

export function seatInfos(instance: LoadedInstance): SeatInfo[] {
  return instance.players.map((p) => ({ playerOrder: p.playerOrder, screenName: p.screenName, color: p.color }))
}

export function moduleFor(instance: LoadedInstance): GameModule<unknown, unknown> | undefined {
  return getGame(instance.game.slug) as GameModule<unknown, unknown> | undefined
}

/**
 * Everything any viewer may see about an instance: no joinTokens, no host email, and the
 * engine state only through tableView (never raw).
 */
export function lobbySafe(instance: LoadedInstance) {
  const { phase, state } = storedState(instance)
  const mod = moduleFor(instance)
  return {
    id: instance.id,
    joinCode: instance.joinCode,
    phase,
    version: instance.version,
    hostUserId: instance.hostUserId,
    game: {
      id: instance.game.id,
      slug: instance.game.slug,
      name: instance.game.name,
      minPlayers: mod?.minPlayers ?? 0,
      maxPlayers: mod?.maxPlayers ?? 0,
    },
    players: instance.players.map((p) => ({
      id: p.id,
      playerOrder: p.playerOrder,
      screenName: p.screenName,
      color: p.color,
      signedIn: p.userId != null,
    })),
    tableView: phase !== 'lobby' && mod && state !== undefined ? mod.tableView(state, seatInfos(instance)) : null,
  }
}

export type LobbySafeInstance = ReturnType<typeof lobbySafe>

export function playerViewFor(instance: LoadedInstance, playerOrder: number): unknown {
  const { phase, state } = storedState(instance)
  const mod = moduleFor(instance)
  if (phase === 'lobby' || !mod || state === undefined) return null
  return mod.playerView(state, playerOrder, seatInfos(instance))
}

/** True when the token matches that seat's joinToken. */
export function seatTokenValid(instance: LoadedInstance, playerOrder: unknown, joinToken: unknown): boolean {
  if (typeof playerOrder !== 'number' || typeof joinToken !== 'string' || joinToken.length === 0) return false
  const seat = instance.players.find((p) => p.playerOrder === playerOrder)
  return !!seat?.joinToken && seat.joinToken === joinToken
}

/**
 * Push the new state to every viewer: the table (and every seat, for shared info) gets
 * lobby-safe data + tableView + events; each seat additionally gets its own playerView.
 */
export function broadcastInstance(instance: LoadedInstance, events: GameEvent[] = []) {
  const safe = lobbySafe(instance)
  const tablePayload = { instance: safe, events, version: instance.version }
  emitToTable(instance.id, 'table-updated', tablePayload)
  for (const p of instance.players) {
    emitToSeat(instance.id, p.playerOrder, 'table-updated', tablePayload)
    emitToSeat(instance.id, p.playerOrder, 'seat-updated', {
      playerOrder: p.playerOrder,
      playerView: playerViewFor(instance, p.playerOrder),
      version: instance.version,
    })
  }
}

/** Upsert a Game row for every registered game, so a new game appears without a migration. */
export async function syncGameCatalog() {
  for (const mod of Object.values(GAMES)) {
    const options = { minPlayers: mod.minPlayers, maxPlayers: mod.maxPlayers }
    await prisma.game.upsert({
      where: { slug: mod.slug },
      update: { name: mod.name, options },
      create: { slug: mod.slug, name: mod.name, options },
    })
  }
}
