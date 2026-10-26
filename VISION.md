# GameHub — Vision

## Purpose
A Jackbox-style party-game hub. A host signs in, creates a game, and puts the game view on a shared screen (TV/monitor). Players join from their phones by scanning a QR code or entering an 8-character join code. No account or app install needed. Each phone becomes that player's controller, and moves sync live to the shared screen over Socket.IO. Tic-tac-toe is the proof-of-concept game that exercises the full create → lobby → join → play loop.

The core goal is a **framework that makes adding new games easy**. The existing code was written early and carries implementation detail that isn't a requirement. Treat it as a starting point, not a contract.

## Target User
TBD: confirm with Joe. Inferred: Joe's family and friends playing together in the same room (one shared screen, everyone on their own phone).

## Value Proposition
- **It feels like a real board game, not a business app.** No forms-and-tables UI.
- **Zero-friction join:** scan a QR code, pick a name and color, play.
- **New games are cheap to add:** each game is a self-contained unit that plugs into the shared platform.

## Design Principles
- **Main (shared) screen = the table.** Render actual board-game components: boards, stacks of cards, dice, tokens and pieces, board graphics. It should look and feel physical and playful.
- **Phone = the player's private hand.** It holds that player's private info for the game (their cards, hidden choices, resources) and should be fun and engaging, not just a button panel.
- **Each game owns its look on both screens.** The phone interface differs per game. The platform supplies plumbing (join, seats, sync, turn flow); games supply the experience.
- Generic platform pages (login, create, join) can stay simple, but shouldn't feel like a corporate dashboard either.
- **Every game is built the same way, to the same bar.** That means:
  - real reference material from Joe's physical copy (scanned, then transcribed into the vault)
  - a pure, simulatable rules engine
  - a TV that looks like the real components lying on a table
  - a private, no-scroll phone hand
  - locally generated art composed in code (never the scans)
  - gentle, quick animation with soft sound

  The full playbook is **`docs/ADDING-A-GAME.md`**. Any thread that adds a game follows it, so quality doesn't depend on remembering a past conversation.

## Business Model
TBD. Inferred: personal/hobby project, no monetization.

## Competitive Landscape
TBD. Obvious comparison: Jackbox Games (paid, closed catalog). Other comparisons: AirConsole, and browser party-game sites.

## Roadmap
- MVP: platform loop (auth, game catalog, create/lobby/join/start, live sync) proven with tic-tac-toe ✅
- Game-module framework: each game self-contained (rules engine + TV view + phone view), headless-simulatable ✅ (v1.0.0)
- Splendor, the first full board game, with a tabletop TV, private phone hands, animation and sound ✅ (v1.0.0)
- Dragonheart (2 players), the second full board game, built from the playbook (in progress)
- Later: train a neural network on simulated games (the engines already support headless simulation)
- Then: build a shared kit of tabletop components (cards, decks, dice, boards, tokens) that games compose, more games, game-specific creation options, and a real landing page (currently a blank placeholder)

## Out of Scope (Strategic)
TBD
