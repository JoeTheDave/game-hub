import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import passport from 'passport'
import prisma from './lib/prisma.js'
import { sessionMiddleware } from './auth/session.js'
import authRoutes from './routes/auth.js'
import gameRoutes from './routes/games.js'
import './auth/passport.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV !== 'production'
export const clientOrigin = process.env.CLIENT_ORIGIN || (isDev ? 'http://localhost:3000' : undefined)

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp() {
  const app = express()

  // Trust Fly.io proxy (required for secure cookies and correct protocol in production)
  app.set('trust proxy', 1)

  app.use(
    cors({
      origin: clientOrigin || true,
      credentials: true,
    })
  )
  app.use(express.json())
  app.use(cookieParser())
  app.use(sessionMiddleware)
  app.use(passport.initialize())
  app.use(passport.session())

  // Serve static files from the React app build directory
  const clientBuildPath = path.join(__dirname, '../../dist/client')
  app.use(express.static(clientBuildPath))

  // API routes
  app.use('/api/auth', authRoutes)
  app.use('/api', gameRoutes)

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Unknown API routes are JSON 404s, not the SPA shell
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Catch all handler: send back React's index.html file for any non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'))
  })

  // Error handler: redirect to client error page for browser requests, JSON for API
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Error]', err.message, err.stack)
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal server error' })
    }
    res.redirect('/error')
  })

  return app
}
