import type { ClientGameModule } from '../types'
import { TableView } from './TableView'
import { PhoneView } from './PhoneView'
import { SOUNDS, preloadImages } from './assets'

const dragonheart: ClientGameModule = {
  slug: 'dragonheart',
  TableView,
  PhoneView,
  prepareTable(sound) {
    sound.registerFiles(SOUNDS)
    void preloadImages()
  },
}

export default dragonheart
