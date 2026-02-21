import { Router, Request, Response } from 'express'
import passport from 'passport'
import bcrypt from 'bcrypt'
import prisma from '../lib/prisma.js'
import { authenticateWithPassword } from '../auth/passport.js'

const router = Router()

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json(req.user)
  } else {
    res.status(401).json({ error: 'Not authenticated' })
  }
})

// Register with email/password
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, passwordConfirmation } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    if (password !== passwordConfirmation) {
      return res.status(400).json({ error: 'Password confirmation does not match' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, name: true },
    })

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Session error' })
      res.status(201).json(user)
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// Login with email/password
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await authenticateWithPassword(email, password)
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Session error' })
      res.json(user)
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' })
    res.json({ success: true })
  })
})

// Google OAuth - initiate
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

// Google OAuth - callback (custom handler so we can save session before redirect)
router.get('/google/callback', (req: Request, res: Response, next) => {
  passport.authenticate('google', (err: Error | null, user: Express.User | false) => {
    if (err) {
      return next(err)
    }
    if (!user) {
      return res.redirect('/login?error=google')
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return next(loginErr)
      }
      // Explicitly save the session before redirecting (required when using a session store e.g. on Fly.io)
      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr)
        }
        res.redirect('/')
      })
    })
  })(req, res, next)
})

export default router
