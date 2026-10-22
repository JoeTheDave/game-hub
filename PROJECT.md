# GameHub — Technical Reference

## What This Is
A multiplayer party-game hub: a signed-in host creates a game and shows it on a shared screen, and players join from their phones via QR code or join code and play through a phone "controller", with live sync over Socket.IO. It deploys as a single Fly.io app (`sage-game-hub`, region `dfw`) where Express serves both the API and the built React client. The app is currently **suspended** (last release v7, 2026-03-14).

## Workflow
```yaml
deployments:
  prod:
    branch: master
# single branch, no staging; no CI. Deploy is manual: `npm run deploy` (setup script → build → fly deploy)
```

## Intentional Deviations from STANDARDS.md
Bootstrapped from the older `raise-the-bones` template, before the current standards. These are drift from the standards, not deliberate choices. Treat them as candidates to modernize:
- **Tailwind CSS v3** (`tailwind.config.js` + PostCSS), not v4.
- **Node 18 Dockerfile**, single stage, which runs `npm ci` with dev deps in the image.
- **No tests**: no Vitest/Supertest/RTL setup and no `test` scripts.
- **No CI/CD**: no `.github/workflows/`. Deploys run by hand from a laptop.
- **No staging environment.**
- **Auth:** Passport with express-session (`connect-pg-simple` store, cookie `gamehub.sid`), offering email/password (bcrypt) and Google OAuth. Session-based, so it's in line with the standards.
- **Local Postgres container name** `raise-the-bones-postgres` (see Non-Obvious Conventions).

## Stack
| Layer | In Use |
|-------|--------|
| Frontend | React 18, Vite 5, React Router 7, Tailwind 3, socket.io-client, qrcode.react, @emeraldpay/hashicon-react |
| Backend | Express 4 (ESM, TypeScript via tsx/tsc), Prisma 6, Socket.IO 4, Passport (local + google-oauth20) |
| Database | PostgreSQL. Local: `game_hub_dev`. Prod: Fly Postgres via the `DATABASE_URL` secret (which cluster hasn't been verified) |
| Auth | Session-based. Email/password plus Google SSO. Players don't need accounts |
| Deployment | Fly.io app `sage-game-hub` (https://sage-game-hub.fly.dev), auto-stop, min 0 machines, 512 MB shared CPU |

## Repo Structure
```
game-hub/
├── client/                    # Vite root (vite.config.ts lives here; build → dist/client)
│   └── src/
│       ├── App.tsx            # routes
│       ├── components/MasterLayout.tsx
│       ├── contexts/AuthContext.tsx
│       ├── hooks/useSocket.ts # shared socket, subscribe-game / instance-updated
│       ├── lib/api.ts, lib/stampSound.ts
│       ├── pages/             # generic pages + *Route.tsx dispatchers by gameSlug
│       │   └── tic-tac-toe/   # Lobby / Game (shared screen) / Controller (phone) pages
│       └── types/game.ts
├── server/src/
│   ├── index.ts               # express app, static serving, /api/health, SPA fallback, socket init
│   ├── auth/                  # passport.ts (strategies, serialize), session.ts
│   ├── lib/                   # prisma.ts, socket.ts, joinCode.ts
│   ├── routes/                # auth.ts, games.ts
│   └── prisma/                # schema.prisma + migrations
├── scripts/                   # ensure-postgres.sh, ensure-database.sh, setup-deployment.js
├── Dockerfile, fly.toml, docker-compose.yml (placeholder only), get-docker.sh
```

## Data Models
- **User**: `id` uuid, `email` unique, `name?`, `passwordHash?` (null for Google users), `googleId?` unique, timestamps. Has `hostedGameInstances` and `gameInstancePlayers`.
- **Game**: a catalog entry. `id` uuid, `slug` unique (e.g. `tic-tac-toe`), `name`, `options` Json? (creation-options schema, unused so far), timestamps. Tic-tac-toe is seeded by migration `20250812000000_seed_tic_tac_toe`.
- **GameInstance**: `id` uuid, `gameId` → Game (cascade), `hostUserId` → User (cascade), `joinCode` unique (8 chars, alphabet without I/O), `gameState` Json? (game-specific, always has `status`), timestamps. Index on `joinCode`.
- **GameInstancePlayer**: `id` uuid, `gameInstanceId` → GameInstance (cascade), `userId?` → User (set null; null for anonymous), `screenName`, `color?` (red/blue/green/yellow/orange/purple), `joinToken?`, `playerOrder` Int (0-based seat), `joinedAt`. Unique on `(gameInstanceId, playerOrder)`.
- Also: the `session` table, which `connect-pg-simple` creates at runtime (`createTableIfMissing`). It isn't in Prisma.

## API Endpoints
**Auth** (`/api/auth`)
- `GET /me`: the current user, or 401
- `POST /register`: email, password, passwordConfirmation (min 8). Creates the user and logs in
- `POST /login`: email/password
- `POST /logout`
- `GET /google`, `GET /google/callback`: Google OAuth. The callback explicitly calls `session.save()` before redirecting to `/`, and redirects to `/login?error=google` on failure

**Games** (`/api`)
- `GET /games`: the catalog (public)
- `POST /games/instances`: **auth required**. `{ gameId }` → creates an instance in `status: lobby` (tic-tac-toe sets `requiredPlayerCount: 2`)
- `GET /games/instances/by-code/:joinCode`: public; the code is upper-cased
- `GET /games/instances/:id`: public
- `POST /games/instances/:id/join`: optional auth. `{ screenName? }` → assigns the next `playerOrder`, a default color and a `joinToken`. Rejects if not in lobby or if the game is full
- `PATCH /games/instances/:id/players`: no auth. `{ playerOrder, screenName?, color? }`, lobby only, colors are unique per instance
- `POST /games/instances/:id/start`: the host (session) or the first player (seat 0 with a matching `joinToken`). Requires a full lobby
- `POST /games/instances/:id/move`: `{ playerOrder, row, col }`. Tic-tac-toe only; status moves `in_progress` → `playing` → `won` | `draw`

**Other**
- `GET /api/health`: DB ping
- `GET /api/users`, `POST /api/users`: **leftover template examples, unauthenticated**. `GET` returns the full User rows *including `passwordHash`*. Remove these before reviving the app.

Every state-changing game route re-reads the instance (with game, hostUser and the ordered players) and broadcasts it to the Socket.IO room `game:<id>` as `instance-updated`.

## Frontend Routes
| Path | Component | Auth | Layout |
|------|-----------|------|--------|
| `/` | LandingPage (blank placeholder) | – | MasterLayout |
| `/login`, `/register` | LoginPage, RegisterPage | – | MasterLayout |
| `/create-game` | CreateGamePage | required | MasterLayout |
| `/lobby/:gameSlug/:id` | GameLobbyRoute → e.g. TicTacToeLobbyPage (shows the QR code and join URL) | required | MasterLayout |
| `/game/:gameSlug/:id` | GameViewRoute → e.g. TicTacToeGamePage (shared screen) | required | MasterLayout |
| `/join/:joinCode` | JoinGamePage (phone; pick a name/color) | – | none |
| `/play/:gameSlug/:id` | GameControllerRoute → e.g. TicTacToeControllerPage (phone controller) | – | none |
| `/error`, `*` | ErrorPage | – | none |

## Environment Variables
| Variable | Where Set | Notes |
|----------|-----------|-------|
| `DATABASE_URL` | `.env` / Fly secret | Postgres. Also used by the session store |
| `SESSION_SECRET` | Fly secret | falls back to a dev string when unset |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Fly secret | the Google strategy is only registered when both are set |
| `GOOGLE_CALLBACK_URL` | Fly secret | defaults to `/api/auth/google/callback` |
| `CLIENT_ORIGIN` | env (optional) | CORS/socket origin. Dev default `http://localhost:3000` |
| `PORT` | `.env` / fly.toml | 3001 |
| `VITE_PORT` | `.env` | Vite dev port, 3000 |
| `NODE_ENV`, `DATABASE_PROVIDER`, `PRISMA_DISABLE_POSTINSTALL_GENERATION` | fly.toml `[env]` | |

## Non-Obvious Conventions
- **Adding a game** has two halves. Server: branch on `game.slug` in `POST /games/instances` (initial state), `/start` (board setup) and `/move` (rules). Client: add `pages/<slug>/` Lobby/Game/Controller pages and register them in the three `*Route.tsx` dispatchers. Seed the `Game` row with a migration.
- **Player identity is client-held.** The phone stores its `playerOrder` (and `joinToken`) after joining and sends it with moves. `/move` trusts `playerOrder` without checking the token, so any client can move for any seat. That's acceptable for a party game, but know it's there.
- **Status values:** `lobby`, then `in_progress` (right after start), then `playing` (after the first move), then `won`/`draw`. `/move` accepts both `in_progress` and `playing`.
- **Sockets in dev** connect straight to `http://localhost:3001` (Vite only proxies `/api`). In prod they're same-origin.
- `trust proxy` is set to 1 for Fly, which secure cookies require.
- **Local Postgres mismatch:** `scripts/ensure-postgres.sh` creates/starts a container named `raise-the-bones-postgres` on :5432 (password `localdev123`), but this machine now runs `sage-shared-dev-postgres` on :5432. `npm run dev` will try to start the old container and collide on the port. Either repoint the script at `sage-shared-dev-postgres` (with matching credentials in `.env`) or skip `db:ensure`.
- Migration `20250809000000_add_example_users` seeds `alice@example.com`/`bob@example.com` into **every** environment, prod included.
- `docker-compose.yml` is a disabled placeholder, and `get-docker.sh` is the vendored Docker installer. Neither is used by the app.

## Tagged Versions
None yet.
