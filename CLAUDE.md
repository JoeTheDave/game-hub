# GameHub — Claude Code Context

## Read these first
- `VISION.md`: what this app is and why
- `PROJECT.md`: how it's built, deployed, and what conventions apply

## Critical conventions for this project
- Each game is a self-contained module (`server/src/games/<slug>` pure engine + `client/src/games/<slug>` TableView/PhoneView), wired in only via the two registries. Never put game-specific code in shared routes, pages or sockets, and run `npm test` so every game's suite still passes.
- Hidden info is enforced server-side: clients only ever receive `tableView` / their own `playerView`, never raw engine state, and never another seat's `joinToken`. Players are anonymous seats authenticated by `joinToken`.
- Deploys are manual (`npm run deploy` → `fly deploy`, app `sage-game-hub`). The release command runs `prisma migrate deploy` against prod, so a pushed migration goes live on the next deploy.

## Local Dev
```bash
npm install
npm run dev     # ensures the Postgres container + DB, applies migrations, starts both servers
```
Tests: `npm test` (Vitest; route tests use `game_hub_test`). Simulation: `npm run simulate -- splendor --games 1000 --players 2`.
Frontend: http://localhost:3000
Backend: http://localhost:3001
