# GameHub — Vision

## Purpose
A Jackbox-style party-game hub. A host signs in, creates a game, and puts the game view on a shared screen (TV/monitor). Players join from their phones by scanning a QR code or entering an 8-character join code. No account or app install needed. Each phone becomes that player's controller, and moves sync live to the shared screen over Socket.IO. Tic-tac-toe is the proof-of-concept game that exercises the full create → lobby → join → play loop.

## Target User
TBD: confirm with Joe. Inferred: Joe's family and friends playing together in the same room (one shared screen, everyone on their own phone).

## Value Proposition
TBD: confirm with Joe. Inferred: zero-friction join (scan a QR code, pick a name and color, play), and a platform where adding a new game is a self-contained unit of work.

## Business Model
TBD. Inferred: personal/hobby project, no monetization.

## Competitive Landscape
TBD. Obvious comparison: Jackbox Games (paid, closed catalog). Other comparisons: AirConsole, and browser party-game sites.

## Roadmap
TBD: confirm with Joe. Inferred from the code:
- MVP: platform loop (auth, game catalog, create/lobby/join/start, live sync) proven with tic-tac-toe ✅
- Next: real landing page (currently a blank placeholder), more games, game-specific creation options (the `Game.options` schema is unused so far)

## Out of Scope (Strategic)
TBD
