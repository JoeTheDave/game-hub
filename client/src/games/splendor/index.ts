import type { ClientGameModule } from '../types'
import { TableView } from './TableView'
import { PhoneView } from './PhoneView'
import { SOUNDS } from './assets'

const splendor: ClientGameModule = {
  slug: 'splendor',
  TableView,
  PhoneView,
  prepareTable(sound) {
    sound.registerFiles(SOUNDS)
  },
}

export default splendor
