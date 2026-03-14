import http from 'http'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import passport from 'passport'
import prisma from './lib/prisma.js'
import { sessionMiddleware } from './auth/session.js'
import { initSocket } from './lib/socket.js'
import authRoutes from './routes/auth.js'
import gameRoutes from './routes/games.js'
import './auth/passport.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Trust Fly.io proxy (required for secure cookies and correct protocol in production)
app.set('trust proxy', 1)

const isDev = process.env.NODE_ENV !== 'production'
const clientOrigin = process.env.CLIENT_ORIGIN || (isDev ? 'http://localhost:3000' : undefined)

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

app.get('/api/health', async (req, res) => {
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

// Example API endpoint using Prisma
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany()
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

app.post('/api/users', async (req, res) => {
  try {
    const { email, name } = req.body
    const user = await prisma.user.create({
      data: { email, name },
    })
    res.status(201).json(user)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Catch all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'))
})

// Error handler: redirect to client error page for browser requests, JSON for API
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message, err.stack)

  // If it's an API request, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Internal server error' })
  }

  // For browser requests (like OAuth callbacks), redirect to error page
  res.redirect('/error')
})

const httpServer = http.createServer(app)
initSocket(httpServer, clientOrigin)

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
