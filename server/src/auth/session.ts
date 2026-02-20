import session from 'express-session'

const isProduction = process.env.NODE_ENV === 'production'
const secret = process.env.SESSION_SECRET || 'dev-secret-change-in-production'

export const sessionMiddleware = session({
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
  name: 'gamehub.sid',
})
