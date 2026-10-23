/**
 * Headless simulation: plays N complete games with random agents and reports speed + results.
 *   npm run simulate -- <slug> --games 1000 --players 2 --seed 1
 */
import { getGame, GAMES } from './registry.js'
import { simulate } from './simulate.js'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = Number(process.argv[i + 1])
  if (!Number.isFinite(v)) throw new Error(`--${name} needs a number`)
  return v
}

const slug = process.argv.slice(2).find((a) => !a.startsWith('--') && !/^\d+$/.test(a))
const game = slug ? getGame(slug) : undefined
if (!game) {
  console.error(`Usage: npm run simulate -- <slug> [--games N] [--players P] [--seed S]\nGames: ${Object.keys(GAMES).join(', ')}`)
  process.exit(1)
}

const games = arg('games', 1000)
const players = arg('players', game.minPlayers)
const seed = arg('seed', 1)
if (players < game.minPlayers || players > game.maxPlayers) {
  console.error(`${game.slug} supports ${game.minPlayers}–${game.maxPlayers} players`)
  process.exit(1)
}

const wins = new Array(players).fill(0)
let draws = 0
let stalled = 0
let totalTurns = 0
const t0 = performance.now()
for (let g = 0; g < games; g++) {
  const r = simulate(game, { players, seed: seed + g })
  totalTurns += r.turns
  if (r.stalled) stalled++
  else if (r.winners.length !== 1) draws++
  else wins[r.winners[0]]++
}
const secs = (performance.now() - t0) / 1000

console.log(`${game.name}: ${games} games, ${players} players, seeds ${seed}..${seed + games - 1}`)
console.log(`  ${(games / secs).toFixed(0)} games/sec (${secs.toFixed(2)}s), avg ${(totalTurns / games).toFixed(1)} actions/game`)
wins.forEach((w, i) => console.log(`  seat ${i}: ${w} wins (${((100 * w) / games).toFixed(1)}%)`))
console.log(`  draws/shared wins: ${draws}, stalled: ${stalled}`)
