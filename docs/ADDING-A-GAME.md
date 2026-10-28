# Adding a Game to GameHub: the Playbook

Every new game follows this playbook. It comes from building Splendor (v1.0.0) and the five rounds of play-test feedback that followed. Joe expects a new game to arrive at the same quality bar **without being re-taught**: read this before drafting a new game's spec, and follow it while building. `server/src/games/splendor` and `client/src/games/splendor` are the reference implementation. When this doc is vague, copy what Splendor does.

---

## 0. The flow, end to end

1. **Gather references** (§1). Joe scans the rulebook, board and components on the Epson scanner, and they're transcribed into the vault.
2. **Draft the spec and stop for review** (§2). It covers the rules engine, views, TV, phone, art, animation and sound. Joe reviews it, and nothing is built until he says so.
3. **Build in this order:** engine and data (with the simulation tests), then art and sound, then the client TV and phone. The engine and the art can be built in parallel. The client builds on the engine's view and event types.
4. **Ship, then play-test iterations.** Each round of Joe's feedback becomes `## Iteration N` on the game's spec, shipped and stamped. Expect several rounds of TV polish.
5. **Tag** when Joe calls the game done.

## 1. Reference gathering (vault, never the repo)

- Everything goes in `obsidian-vault/Projects/game-hub/<Game>/`:
  - `<Game> Rules.md`: the rulebook transcribed verbatim, page by page, with an "Open questions" list at the end.
  - `<Game> Board Notes.md`: each space, its capacity, and the arrows between spaces.
  - `<Game> Card List.md` (or a component list): every component with counts and values, plus a **"look" description** for art prompts.
  - Scan folders: `Rulebook Scans/`, `Board Scans/` (plus a stitched image), `Card Scans/`.
- Scan with `scanimage` at 300 dpi, using the ET-4850 (`escl:https://192.168.1.149:443`, or `airscan:e0:EPSON ET-4850 Series`). If it's asleep, ping it and retry.
- **Verify the counts against known totals** (deck size, per-colour counts, point distributions), and say when they reconcile. When a total doesn't add up, ask.
- **Scans are reference only. They never ship and are never copied into the app** (Joe's rule).

## 2. The spec

Two specs: one for the game, plus a framework spec iteration if the game needs the contract to stretch (§3). The spec must state:
- **Every rule as an engine behaviour:** setup, each action, the turn sequence (including pending sub-steps such as discards or choices), end trigger, scoring and tie-breaks. Resolve every ambiguity explicitly and list it under Assumptions for Joe.
- **The hidden-information table:** what the TV sees, what each phone sees, and what nobody sees (deck order, the contents of other players' hands, face-down piles).
- **Events** for every visible change (they drive animation and sound).
- **The TV layout, the phone layout, the art asset list, and the animation choreography** (sections 5–8 below).
- **Tests** (§9).

## 3. Engine (server/src/games/<slug>/)

- Implement `GameModule` (`server/src/games/types.ts`):
  - `setup`, `applyAction`, `tableView`, `playerView`, `isFinished`, `activeSeats`, `legalActions` and `winners`.
  - Register it in `server/src/games/registry.ts`. That's the only server wiring.
  - **Catalog:** a module is listed by default. Set `listed: false` to retire a game from selection (home page, Create Game, `POST /games/instances` refuses it) while keeping its code, tests and existing instances, as Tic-Tac-Toe is.
  - **Cover art:** add `client/src/games/<slug>/cover.webp` (portrait 3:4, about 800 px wide, Joe supplies the art). The home page picks it up automatically (`gameCover()` in the client registry) and shows it as a large card that creates a game and jumps to its lobby.
  - **Turn order:** if the real game has a "who goes first" rule that can't translate (e.g. "youngest player"), shuffle the seats into a random turn order in `setup`. Rematch re-runs `setup`, so every rematch reshuffles (Splendor does this).
- **Pure and deterministic.** State and actions are plain JSON; no classes or Dates. No clock, and randomness only from the injected `Rng`. Never mutate the input state. No Express, Prisma or React imports.
- **Validate every action as untrusted input** (wrong types, NaN, out-of-range indices, duplicates). Return `{ok:false, error}` for bad input and never throw. The pre-tag review fuzzes this.
- **`legalActions` enumerates every concrete legal action,** including pending sub-steps. The phone uses it for "can I do this" cues, and the simulator uses it to play.
- **Hidden info is enforced in the views:**
  - `tableView` is everything public.
  - `playerView(seat)` adds that seat's private info and precomputed helpers for the phone (e.g. `affordable`, `payments`, `legalActions`).
  - **Events must never carry hidden info**: no card identity for face-down moves.
- **The headless simulation must work:** `npm run simulate -- <slug> --games 1000 --players N`. The future plan is to train a neural network on simulated games, so it must be fast (Splendor runs at about 2,100 two-player games/sec).

## 4. Platform rules (don't fork them per game)

- **No game-specific code in shared routes, pages or sockets.** Everything game-specific goes through the two registries.
- **Shared pieces you get for free:**
  - Server: join with a seat `joinToken`, the lobby, and Start (the host or seat 0; it appears on seat 0's phone once `players >= minPlayers`; no "admin" label).
  - Server: versioned optimistic writes, and per-viewer socket rooms.
  - Client: the TV feed queue (`useTableFeed`), reconnect resync, `SoundBoard` (audio unlock tap, mute), and the phone shell.
- **Admin role:** `gameState.adminSeat` (default 0, the first to join) holds Start, Rematch and the lobby options. The admin hands it on with `POST /games/instances/:id/admin` `{ playerOrder, joinToken, newAdmin }` (current admin or host only; any phase; the new admin isn't asked). Never hard-code "seat 0"; the phone gets `PhoneViewProps.admin`.
- **Lobby options:** a game declares `options: GameOption[]` (boolean checkboxes: `{ key, label, type: 'boolean', default }`) on its `GameModule`. The platform renders them on the host lobby and the admin's phone lobby (read-only for others), stores the values (`PATCH /games/instances/:id/options`, lobby only, validated), and passes them, defaults filled in, to `setup(players, rng, options)` on Start and on every Rematch.
- **Rematch:** `POST /games/instances/:id/rematch` (the admin seat's token or the host) re-runs `setup` for the same players on a finished game: same instance, join code and seat tokens, no lobby. The TV feed treats finished → fresh as a new table, with no animation. Games only render the button: `PhoneViewProps.rematch` is set on the admin's phone once the game is over.
- **Wake lock:** the TV table and the phone play screens hold a screen wake lock while open and visible (`useWakeLock`, re-acquired when the page becomes visible or regains focus), so the computer running the TV never sleeps mid-game. Nothing to do per game.
- **Game screens aren't selectable:** the TV shell and the phone shell carry `.game-surface` (`client/src/index.css`), so nothing can be selected by click-and-drag and images can't be dragged out. Inputs (and `.select-text`) opt back in. Don't undo this in a game's CSS.
- If a game needs something the contract doesn't have, extend the contract in a framework spec iteration. Prove that **every existing game's test suite still passes**.

## 5. The TV: a tabletop, not a dashboard

These are Joe's standing preferences, learned the hard way on Splendor:
- **A fixed 1920×1080 design canvas,** scaled to fit with a CSS transform.
- **A table surface** (generated wood or felt texture) with soft vignette lighting.
- **No dashboard chrome:** no boxed panels, header bars, hard-bordered badges, divider lines or turn-recap banners.
- **Components lie loose on the table** with a small *deterministic* jitter (rotation of about ±1.5–3° and a few px of offset, seeded by piece id so nothing twitches between renders), but stay upright enough to read from a couch.
- **The central play area (market or board) is big:** the biggest thing on screen, centred. Shared supplies (token bank and so on) sit close to it, e.g. a row beneath it.
- **Player zones use identical geometry** whatever the player count. Splendor uses the 4-player corner zones for every seat, assigned in seat order; a 2-player game takes the top-left and top-right corners. Each zone's content is centred so **its gap to the screen edge equals its gap to the central play area.**
- **Name and score** sit on a small physical-looking marker (a tent card or score disc), not a header.
- **Only what's public in the real game is shown.** If the physical game hides something (deck counts, reserved card faces, face-down piles), hide it too: show a back, or a stack whose thickness hints at its size, with no number.
- **The current turn** is a soft warm light pool under that player's zone: a single uniform golden candlelight colour, *not* the seat colour (seat colours render too unevenly). Bound it to the player's own zone.
- **Stacks must be readable:** where cards pile up so that only the top shows, add a small physical-looking tag with the card count and total points (when the values were public when played). Never leave players guessing what a pile holds.
- **Pieces keep their spaces.** When something is taken from a row, leave the gap (`stableSlots`) rather than letting the rest reflow.
- **Mute and exit controls** are small, low-opacity and at the bottom centre, never over a player's area.

## 6. The phone: the player's private hand

- **Both orientations:** every phone UI must work in portrait *and* landscape, re-laying out sensibly (e.g. board left, cards right in landscape) and scaling the main play area to fit, so it never disappears on small viewports. If a game truly needs one orientation, it must detect the wrong one and show a clear "rotate your phone" prompt (Joe, 2026-10-28).
- **Selections are always visible:** every multi-step choice (card → piece → destination) marks the current selection distinctly on screen, not just in the confirm bar.

- **Portrait first, never scrolls** (the phone shell is fixed full-viewport), 16px inputs (to stop iOS zooming), safe areas respected.
- **The default tab is the most common action** (Splendor: Gems).
- **The phone always shows what the player could do,** even off-turn (e.g. affordable marks). Off-turn, action buttons are hidden but browsing works. Pending sub-steps (discard, choose) take over the screen.
- **Admin menu:** place the shared `<AdminMenu {...admin} />` (`client/src/components/AdminMenu.tsx`) at the end of the phone header row. It renders only on the admin's phone: a small "Players" button, then a sheet with "Make admin" for each other player and a confirmation. Never show who is admin on the TV.
- **End screen:** final standings, a crown in its own column for the winner(s), and a **Rematch** button whenever `rematch` is provided (the admin only). No "Game Over" heading. Disable the button while it's starting.
- **Series across rematches:**
  - Implement `GameModule.summary(state)` (final score per seat + winners). The platform then records one entry per completed game in `instance.history` (kept across rematches, reset by a new lobby).
  - When `history.length >= 2`, the end screen adds a series table: a column per game (that game's winning score in gold) plus an emphasised Total, a laurel on the overall leader by cumulative score, and a one-line summary. Dragonheart's `SeriesTable` and `seriesSummary` are the reference.
  - The current match's own standings (with its crown) stay above it. On the phone, only the table scrolls sideways (names and Total pinned) and the results panel scrolls, never the page.
- **Uses the same composed components and art as the TV.** Light haptics; sound plays on the TV only.
- **Buttons:** active = `cursor-pointer`; disabled = faded + `cursor-default`, never `cursor-not-allowed`.

## 7. Art: generated locally, composed in code

- Generate with local ComfyUI (`~/ai/ComfyUI`, started with `--disable-smart-memory --fp32-vae` on this AMD GPU), and **stop it when done**.
  - Flux fp8 is good for objects, gems and textures. That checkpoint drifts NSFW and invents text, so use **SDXL with a negative prompt for people and scenes**.
  - Check every image by eye: no garbled text, extra limbs or frames.
  - Commit the prompts, seeds, workflows and processing scripts to `tools/<slug>-art/`, plus an `assets/README.md`, so any asset can be regenerated in the same style.
- **Atomic assets, composed in code:**
  - Exactly **one image per symbol** (e.g. one image per gem), reused everywhere at different sizes.
  - Cards are built in React/CSS: scene image + frame + numerals.
  - Card backs: a texture plus a code-drawn title. Blur the backdrop art slightly behind the title and keep the text sharp.
- **Brightness and footprint:** normalise symbol images so each fills its image the same way and reads clearly on the table. Keep the originals in `tools/<slug>-art/originals/`, so processing is idempotent.
- **Tokens and chips:** a subtle (blurred, low-opacity) background, with the symbol filling about 80% of the chip.
- **Costs and requirements** show just the coloured shape and a number, with no tiny symbol inside (it reads as clutter).
- **Typography:** use the **Cinzel** family (Cinzel 800 for numerals with lining and tabular digits, optically centred in their circles or squares; Cinzel Decorative for titles). Never use IM Fell English for numbers (its 1 looks Roman). It is fine for wordmarks such as Onitama's card names, which copy Joe's original repo cards. A game based on Joe's own earlier design follows that design's typography.
- **Match the real game's look as closely as possible (Joe's bar), without shipping the real images.** Dragonheart taught that freshly invented art reads as "cheesy" and loses the board's meaning. The method that works:
  - **img2img from the scans** with SDXL at low denoise (about 0.30–0.40), plus per-subject passes, so the composition, palette and every painted subject stay faithful while the pixels are newly generated. Clean seams and creases first.
  - On boards whose spaces have **painted subjects inside their outlines**, those must survive (they tell players what goes where). Keep the printed outlines and arrows in the art, and don't double-draw them in code.
  - **Measure the space geometry from the scan** (normalised rects in fill order, arrows, special spots) into `boardGeometry.json`, and derive all TV positions from it so cards sit exactly in the painted outlines.
  - Reserve from-scratch generation for components with no scan (e.g. table textures).

## 8. Animation and sound

- **Event-driven:** each `table-updated` carries the action's `events`, and the TableView plans the flights from the previous render's positions (FLIP via the Web Animations API, with no animation library) and calls `onEventsDone`.
- **Flight geometry:**
  - The outer layer translates and scales from the source rect to the destination rect. The inner layer flips around the piece's **centre** (`FlipCard`: both faces absolutely positioned).
  - Moving and flipping happen as **one fluid motion along a straight path** that lands exactly in the slot.
  - Keep the geometry in a pure function and unit-test that frames never leave the source/destination envelope. Two real bugs came from this: pieces landing one slot over, and pieces dipping a card-height low.
- **Pace:** about 600–900 ms per motion with a gentle ease-out (`cubic-bezier(.22,.8,.3,1)`) and about 90 ms stagger. A whole turn takes ≤ 2.5 s. "Slow enough to see, fast enough not to annoy." The phones never wait for the TV.
- **Never let an unpainted piece show as a box:**
  - Decode every piece image up front (`preloadImages()` in the game's `assets.ts`, called from `prepareTable` and on TV mount) and use `decoding="sync"` on piece images, so freshly rendered flight copies paint immediately.
  - Draw stack-thickness edges as thin clipped slivers, never full card-sized boxes.
  - Hide a pile's edges and top card together.
  - (Dragonheart: slower TV browsers showed gray boxes at flight destinations.)
- **The TV must update immediately** when a move arrives. The feed queue advances as soon as the previous animation has finished (see `client/src/lib/tableQueue.ts`).
- **Sound:**
  - Short, soft and natural: about −12 dBFS, rounded attacks, low-passed, played at about half gain.
  - Synthesized in-repo (`tools/<slug>-art/make_sounds.py`) or CC0 with credits.
  - Never harsh clicks or noise bursts.
- **`prefers-reduced-motion`:** quick fades.

## 9. Tests (all in `npm test`)

- **Engine:** setup per player count, every action's legal and illegal cases, pending sub-steps, end trigger, scoring and tie-breaks.
- **Data:** counts and point distributions match the vault card list.
- **Hidden info:** `tableView`, other seats' `playerView` and table events never contain hidden identities.
- **Simulation:** 1,000 random-agent games across player counts. Check the game's invariants after every action (component conservation, capacity limits), deterministic seed replay, and a JSON round-trip.
- **Client:** pure logic helpers, layout (equal margins, zones fit, no overlaps), flight geometry, and a render test of TV and phones from real game states.
- **No browser in agent runs.** Joe spot-checks on the real TV and phones, so list exactly what to check in each completion.
