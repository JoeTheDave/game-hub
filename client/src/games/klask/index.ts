import type { ClientGameModule } from '../types'
import { TableView } from './TableView'
import { PhoneView } from './PhoneView'
import { SOUNDS, preloadImages } from './assets'

const klask: ClientGameModule = {
  slug: 'klask',
  TableView,
  PhoneView,
  prepareTable(sound) {
    sound.registerFiles(SOUNDS)
    void preloadImages()
  },
}

export default klask
