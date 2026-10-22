# GameHub — Claude Code Context

## Read these first
- `VISION.md`: what this app is and why
- `PROJECT.md`: how it's built, deployed, and what conventions apply

## Critical conventions for this project
- Game state lives in the `GameInstance.gameState` JSON column, and its shape is game-specific (switched on `game.slug`). Every state change must go through a route that calls `emitGameInstanceUpdate()`, or connected screens/controllers go stale.
- Players are mostly anonymous. Player identity is `playerOrder` (seat index) plus a one-time `joinToken`, not a user session. Don't add auth requirements to join/move/controller routes.
- Deploys are manual (`npm run deploy` → `fly deploy`, app `sage-game-hub`). The release command runs `prisma migrate deploy` against prod, so a pushed migration goes live on the next deploy.

## Local Dev
```bash
npm install
npm run dev     # ensures the Postgres container + DB, applies migrations, starts both servers
```
Heads-up: `scripts/ensure-postgres.sh` still targets the old `raise-the-bones-postgres` container on :5432, but this machine runs `sage-shared-dev-postgres` on :5432. Repoint the script, or start the servers directly (`npm run dev:server` / `npm run dev:client`) against `sage-shared-dev-postgres`. See PROJECT.md → Non-Obvious Conventions.
Frontend: http://localhost:3000
Backend: http://localhost:3001
