import type { ClientGameModule } from '../types'
import { TableView } from './TableView'
import { PhoneView } from './PhoneView'

const ticTacToe: ClientGameModule = {
  slug: 'tic-tac-toe',
  TableView,
  PhoneView,
  prepareTable(sound) {
    // A short stamp/thud when a mark lands.
    sound.registerSynth('stamp', (ctx, destination, when) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, when)
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.08)
      gain.gain.setValueAtTime(0.25, when)
      gain.gain.exponentialRampToValueAtTime(0.01, when + 0.15)
      osc.start(when)
      osc.stop(when + 0.15)
    })
  },
}

export default ticTacToe
