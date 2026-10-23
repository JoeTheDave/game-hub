# GameHub — Technical Reference

## What This Is
A multiplayer party-game hub with games as self-contained modules (tic-tac-toe, Splendor): a signed-in host creates a game and shows it on a shared screen, and players join from their phones via QR code or join code and play through a phone "controller", with live sync over Socket.IO. It deploys as a single Fly.io app (`sage-game-hub`, region `dfw`) where Express serves both the API and the built React client. The app is currently **suspended** (last release v7, 2026-03-14).

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
- **No CI/CD**: no `.github/workflows/`. Deploys run by hand from a laptop.
- **No staging environment.**
- **Auth:** Passport with express-session (`connect-pg-simple` store, cookie `gamehub.sid`), offering email/password (bcrypt) and Google OAuth. Session-based, so it's in line with the standards.
- **Local Postgres container name** `raise-the-bones-postgres` (see Non-Obvious Conventions).

## Stack
| Layer | In Use |
|-------|--------|
| Frontend | React 18, Vite 5, React Router 7, Tailwind 3, socket.io-client, qrcode.react, Web Animations API (no animation lib), Web Audio SoundBoard |
| Backend | Express 4 (ESM, TypeScript via tsx/tsc), Prisma 6, Socket.IO 4, Passport (local + google-oauth20) |
| Database | PostgreSQL. Local: `game_hub_dev`. Prod: Fly Postgres via the `DATABASE_URL` secret (which cluster hasn't been verified) |
| Auth | Session-based. Email/password plus Google SSO. Players don't need accounts |
| Deployment | Fly.io app `sage-game-hub` (https://sage-game-hub.fly.dev), auto-stop, min 0 machines, 512 MB shared CPU |

## Repo Structure
```
game-hub/
├── server/src/
│   ├── app.ts                 # createApp(): express app without listen (Supertest uses it)
│   ├── index.ts               # http server + sockets + catalog sync on boot
│   ├── games/                 # ── one folder per game; pure engines, no Express/Prisma/React ──
│   │   ├── types.ts           # GameModule contract, seededRng, shuffle
│   │   ├── registry.ts        # slug → module (the ONLY place a game is wired in server-side)
│   │   ├── simulate.ts        # headless simulate()/replay()/randomAgent
│   │   ├── simulate-cli.ts    # npm run simulate -- <slug> --games N --players P --seed S
│   │   ├── tic-tac-toe/       # engine + tests
│   │   └── splendor/          # data (90 cards, 10 nobles), engine, tests
│   ├── lib/                   # gameInstances (lobbySafe, views, broadcast, catalog sync), socket, prisma, joinCode
│   ├── routes/                # auth.ts, games.ts (generic; no game-specific code)
│   └── prisma/                # schema + migrations
├── client/src/
│   ├── games/
│   │   ├── types.ts           # ClientGameModule: { slug, TableView, PhoneView, prepareTable? }
│   │   ├── registry.ts        # slug → lazy client module (the ONLY client wiring point)
│   │   ├── tic-tac-toe/
│   │   └── splendor/          # composed components, TableView (TV), PhoneView, logic, assets/
│   ├── pages/                 # generic: HostLobbyPage, TablePage (TV), PlayPage (phone), JoinGamePage, …
│   ├── components/PhoneLobby.tsx
│   ├── hooks/                 # useTableFeed, useSeatFeed, useSocket (useLiveSubscription), useSoundBoard, useGameModule
│   └── lib/                   # soundBoard, seat storage, phoneScreen shell, playerColors, api
├── tools/splendor-art/        # ComfyUI workflows, prompts, cutout + sound synthesis scripts
└── vitest.config.ts           # server/src/**/*.test.ts + client/src/**/*.test.ts
```

## Data Models
- **User**: `id` uuid, `email` unique, `name?`, `passwordHash?` (null for Google users), `googleId?` unique, timestamps.
- **Game**: catalog row. It's **upserted on boot from the server registry** (`syncGameCatalog`), so a new game needs no migration. Fields: `slug` unique, `name`, and `options` Json = `{ minPlayers, maxPlayers }`.
- **GameInstance**: `id` uuid, `gameId`, `hostUserId`, `joinCode` (8 chars, no I/O).
  - `gameState` Json = `{ phase: 'lobby'|'playing'|'finished', state?: <engine state> }`. The platform owns `phase`, and the engine owns `state`.
  - `version` Int is incremented on every write (optimistic concurrency).
- **GameInstancePlayer**: `playerOrder` (seat), `screenName`, `color?`, `joinToken` (the seat's secret, returned only to the joiner), `userId?`. Unique on `(gameInstanceId, playerOrder)`.
- Also: the `session` table, created at runtime by `connect-pg-simple`.

## API Endpoints
**Auth** (`/api/auth`): `GET /me`, `POST /register`, `POST /login`, `POST /logout`, `GET /google`, and `GET /google/callback`.

**Games** (`/api`). These routes are generic, and responses are **lobby-safe**: no joinTokens, no host email, and engine state only via `tableView`.
- `GET /games`: the catalog, with min/max players.
- `POST /games/instances` (auth): creates an instance in phase `lobby`.
- `GET /games/instances/by-code/:joinCode` and `GET /games/instances/:id`: return the lobby-safe instance, plus `tableView` when playing.
- `GET /games/instances/:id/me?playerOrder&joinToken`: returns that seat's `playerView`.
- `POST /games/instances/:id/join` `{ screenName? }`: returns `{ instance, player: { playerOrder, screenName, color, joinToken } }`. This is the only response that carries a token.
- `PATCH /games/instances/:id/players` `{ playerOrder, joinToken, screenName?, color? }`: lobby only.
- `POST /games/instances/:id/start`: host session or seat 0's `joinToken`, once `players >= minPlayers`. Calls `module.setup`.
- `POST /games/instances/:id/action` `{ playerOrder, joinToken, action, version? }`: calls `module.applyAction`, then a versioned write. Returns `{ playerView, version }`, or a 409 with a fresh view on conflict.
- `GET /api/health`: DB ping. Unknown `/api/*` paths return a JSON 404.

**Sockets** (per-viewer rooms):
- `subscribe-table {id}` joins `game:<id>:table`.
- `subscribe-seat {id, playerOrder, joinToken}` is token-checked and joins `game:<id>:seat:<n>`.
- Every write emits `table-updated {instance, events, version}` to the table and all seats, and `seat-updated {playerOrder, playerView, version}` to each seat.

## Frontend Routes
| Path | Component | Auth | Notes |
|------|-----------|------|-------|
| `/` | LandingPage (blank placeholder) | – | MasterLayout |
| `/login`, `/register` | LoginPage, RegisterPage | – | MasterLayout |
| `/create-game` | CreateGamePage | required | MasterLayout; shows player counts |
| `/lobby/:slug/:id` | HostLobbyPage (QR, join URL, roster, Start) | required | MasterLayout |
| `/game/:slug/:id` | TablePage, which renders the game's `TableView` (the TV) | – | full screen; sound unlock overlay + mute |
| `/join/:joinCode` | JoinGamePage (auto-join, stores seat) | – | phone shell |
| `/play/:slug/:id` | PlayPage, which renders the shared PhoneLobby, then the game's `PhoneView` | – | phone shell |
| `/error`, `*` | ErrorPage | – | |

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
- **Adding a game** (spec 1792780973323):
  - Server: create `server/src/games/<slug>/` implementing `GameModule` (pure; JSON-only state; rng only via the injected `Rng`; no clock).
  - Client: create `client/src/games/<slug>/` exporting `{ slug, TableView, PhoneView, prepareTable? }`.
  - Add one line to each registry. Nothing else changes, and no migration is needed.
  - Run `npm test`. Every game's suite must still pass, which is the guarantee that a new game doesn't break old ones.
- **Hidden info is enforced server-side.** The table and other seats only ever get `tableView`, and each phone gets its own `playerView`. Engines decide what's hidden (e.g. Splendor's reserved cards are `{tier}` only to non-owners).
- **Events drive the TV's animation and sound.** `applyAction` returns `events` (which must contain no hidden info). `useTableFeed` queues them, and the TableView calls `onEventsDone`; the platform skips ahead after 4 s. A resync or first load has no events, so it renders without animating.
- **Headless simulation:** `simulate(module, {players, seed, agents})` plays a whole game with no server or UI, and replay is deterministic from seed + log. `npm run simulate -- splendor --games 2000 --players 2` runs at about 2,100 games/sec. This is meant for generating neural-network training data later.
- **Client imports pure engine/data via `@games/*`** (Vite alias → `server/src/games`). Those files get type-checked under the client's strict settings, so they need type-only imports, no enums and no Node built-ins.
- **Splendor art:**
  - Generated locally (ComfyUI: Flux fp8 for gems, SDXL for scenes and portraits), and composed in code.
  - Exactly one image per gem, reused everywhere.
  - The scans in the vault are reference only and never ship.
  - Regenerate with `tools/splendor-art/` (see `assets/README.md`). ComfyUI on this GPU needs `--disable-smart-memory --fp32-vae`.
- **Sockets in dev** connect straight to `http://localhost:3001` (Vite only proxies `/api`). In prod they're same-origin.
- `trust proxy` is set to 1 for Fly, which secure cookies require.
- **Local Postgres:** `scripts/ensure-postgres.sh` uses the machine's shared `sage-shared-dev-postgres` container (postgres/localdev123). It provides `game_hub_dev` and `game_hub_test` (route tests use the test DB, and `fileParallelism` is off).
- Migration `20250809000000_add_example_users` seeds `alice@example.com`/`bob@example.com` into every environment.

## Tagged Versions
None yet.
