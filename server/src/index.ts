import http from 'http'
import { createApp, clientOrigin } from './app.js'
import { initSocket } from './lib/socket.js'
import { syncGameCatalog } from './lib/gameInstances.js'

const PORT = process.env.PORT || 3001

const httpServer = http.createServer(createApp())
initSocket(httpServer, clientOrigin)

syncGameCatalog().catch((err) => console.error('[Games] Failed to sync game catalog:', err))

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
