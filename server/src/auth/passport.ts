import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import bcrypt from 'bcrypt'
import prisma from '../lib/prisma.js'

export interface SessionUser {
  id: number
  email: string
  name: string | null
}

passport.serializeUser((user, done) => {
  const u = user as SessionUser
  done(null, { id: u.id, email: u.email, name: u.name })
})

passport.deserializeUser(async (obj, done) => {
  try {
    const { id } = obj as SessionUser
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    })
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

// Google OAuth strategy
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

if (googleClientId && googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value
          const googleId = profile.id
          const name = profile.displayName || profile.name?.givenName || null

          if (!email) {
            return done(new Error('No email from Google profile'), undefined)
          }

          // Check for existing user by Google ID
          let user = await prisma.user.findUnique({
            where: { googleId },
          })

          if (user) {
            return done(null, { id: user.id, email: user.email, name: user.name })
          }

          // Check for existing user by email (created with email/password)
          user = await prisma.user.findUnique({
            where: { email },
          })

          if (user) {
            // Link Google account to existing user
            await prisma.user.update({
              where: { id: user.id },
              data: { googleId, name: user.name || name },
            })
            return done(null, { id: user.id, email: user.email, name: user.name || name })
          }

          // Create new user
          const newUser = await prisma.user.create({
            data: { email, name, googleId },
          })
          return done(null, { id: newUser.id, email: newUser.email, name: newUser.name })
        } catch (err) {
          return done(err, undefined)
        }
      }
    )
  )
}

export const authenticateWithPassword = async (
  email: string,
  password: string
): Promise<SessionUser | null> => {
  const user = await prisma.user.findUnique({
    where: { email },
  })
  if (!user?.passwordHash) return null
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null
  return { id: user.id, email: user.email, name: user.name }
}
