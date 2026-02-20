import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import passport from 'passport'
import prisma from './lib/prisma.js'
import { sessionMiddleware } from './auth/session.js'
import authRoutes from './routes/auth.js'
import './auth/passport.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

const isDev = process.env.NODE_ENV !== 'production'
const clientOrigin = process.env.CLIENT_ORIGIN || (isDev ? 'http://localhost:3000' : undefined)

app.use(
  cors({
    origin: clientOrigin || true,
    credentials: true,
  })
)
app.use(express.json())
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())

// Serve static files from the React app build directory
const clientBuildPath = path.join(__dirname, '../../dist/client')
app.use(express.static(clientBuildPath))

// Auth routes
app.use('/api/auth', authRoutes)

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
