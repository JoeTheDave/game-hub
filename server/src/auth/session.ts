import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'

const PgSession = connectPgSimple(session)

const isProduction = process.env.NODE_ENV === 'production'
const secret = process.env.SESSION_SECRET || 'dev-secret-change-in-production'

const sessionConfig: session.SessionOptions = {
  secret,
  resave: false,
  saveUninitialized: false,
  name: 'gamehub.sid',
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    path: '/',
  },
}

if (process.env.DATABASE_URL) {
  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
  })
  sessionStore.on('error', (err: Error) => {
    console.error('[Session Store] Error:', err)
  })
  sessionConfig.store = sessionStore
}

export const sessionMiddleware = session(sessionConfig)
