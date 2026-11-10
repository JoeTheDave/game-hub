import { klaskModule } from './engine.js'
import { simulateMatch } from './simulate.js'

/**
 * The registered module also carries the headless match runner (physics + bots), kept out of
 * engine.ts because simulate.ts imports the engine.
 */
const klaskWithSim: typeof klaskModule = {
  ...klaskModule,
  simulateHeadless: ({ players, seed }) => {
    const r = simulateMatch({ players, seed })
    return { winners: r.state.result?.winners.slice() ?? [], turns: r.points, stalled: r.stalled }
  },
}

export const klask = klaskWithSim
export default klaskWithSim
export * from './engine.js'
export * from './physics.js'
