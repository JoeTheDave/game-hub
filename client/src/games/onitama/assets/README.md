# Onitama assets

## Sources
- **Cover** (`../cover.webp`): Joe's poster (vault `Projects/game-hub/Onitama/Poster - Onitama.png`, 1024×1536), cropped to 3:4 from y = 110 (keeping the title, the gold circle and both fighters), resized to 800×1067, WebP q82.
- **Kanji** (`kanji/<slug>.webp`, 32): Joe's calligraphy from his original repo (github.com/JoeTheDave/onitama, `app/assets/complete/_<card>.*`), cleaned by `tools/onitama-art/make_kanji.py`.
  - Processing: alpha comes from darkness, ink is warm near-black, and each glyph is trimmed, upscaled with Lanczos, re-sharpened and padded 6%, 512 px tall.
  - Variant picks: giraffe uses `_giraffe_mod.png`. Rabbit uses `_rabbit.png`, because `_rabbit.gif` is actually 虎 (tiger). Elephant uses the original.
  - The slugs are the card names lowercased with hyphens (e.g. `sea-snake`).
- **Everything else** was generated locally with ComfyUI.

## Generated art (ComfyUI)
Start ComfyUI with `~/ai/ComfyUI/start.sh --listen 127.0.0.1 --port 8188 --reserve-vram 2.0 --fp32-vae --disable-smart-memory`, and **stop it when done**.

- `python3 tools/onitama-art/comfy_gen.py tools/onitama-art/jobs.json /tmp/oni-raw`
  - Models: Flux fp8 (euler, 22–24 steps, guidance 3.5) for textures and objects; SDXL base (dpmpp_2m karras, 30 steps, cfg 6) for the `mat` landscape.
  - Seeds are in `jobs.json`.
- `python3 tools/onitama-art/comfy_gen.py tools/onitama-art/jobs-round2.json /tmp/oni-raw`
  - Picks used: `red-student-b` (seed 72) and `table-b` (seed 81).
  - Unused alternates: `red-student-a/c` and `parchment-b`.
- `python3 tools/onitama-art/process_assets.py /tmp/oni-raw client/src/games/onitama/assets` (pillow + numpy):
  - **Pieces** (retired: the client draws pieces in code as flat ink-brush tokens, per Joe's dislike of realistic 3D tokens; the files below were removed from the app, the recipe stays for history) (`pieces/{red,blue}-{master,student}.webp`, 384²):
    - The red lacquer discs (master: gold dragon kamon crest; student: black ink ensō) are cut out with a circular alpha.
    - **Blue is the same image recoloured** (red hues → indigo 224°, with gold and black untouched), so each pair matches exactly.
  - **Temples** (`temple-{red,blue}.webp`, 256²): a brushed torii glyph; blue by recolour.
  - **Stamps** (`stamp-{red,blue}.webp`, 256²): hanko seal impressions for the first-player stamp. Both were generated; their seal "characters" are abstract.
  - **`table.webp`** (1920×1080): dark aged cedar, one backdrop to use with `background-size: cover`. It isn't tileable; a seam-blend attempt left a visible band.
  - **`parchment.webp`** (1024², seamless): procedural washi (periodic noise plus soft fibres) for the card faces and board.
  - **`mat.webp`** (1600 wide): the SDXL sumi-e landscape (mountains, waterfalls, pagoda, red maple), lightened 50% toward the paper colour so the board grid reads on top. The artist-seal corner is cropped off.

## Sounds
See `sounds/CREDITS.md` and `tools/onitama-art/make_sounds.py`. Run it with the ComfyUI venv's python (numpy + scipy) and ffmpeg.

## Original repo art (iteration 1: the 3D table)
Joe's own art from github.com/JoeTheDave/onitama, ported by `tools/onitama-art/port_repo_art.py <checkout>`:
- `repo/svg/<card-id>.svg`: the animal for each card (from `old/src/components/svg/*.js`, with JSX expressions fixed to the repo's colours: characterColor for animals, opaqueWhite for the master icon), plus `swish.svg`, `master-icon.svg` and `logo.svg`.
- `repo/*.webp`:
  - `mural` (board top)
  - `ying-yang`, `ying-yang-red`, `ying-yang-blue` (centre and temple homes)
  - `card-texture`, `board-texture`
  - `ink-fighters-one`, `ink-fighters-two` (the martial-arts decorations)
  - `logo`

Cards are drawn in the repo's design: as a landscape canvas texture on the TV (`cardArt.ts`), and as an upright DOM card on the phone (`components.tsx`). The TV's 3D pieces are procedural (`three/models.ts`); there are no piece images.
