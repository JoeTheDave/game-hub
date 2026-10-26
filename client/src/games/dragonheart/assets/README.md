# Dragonheart art assets

Every image here was **newly generated with local AI image generation**. No scan pixels ship.

- **Iteration 1 (current board, cards and backs):** these are **SDXL img2img repaints of the scans** of Joe's physical copy (vault: `Projects/game-hub/Dragonheart/`). Joe wanted the board and cards as close to the originals as possible, so each new painting keeps the original's composition and colours (denoise 0.30–0.40), but it is newly generated art, not the scan itself.
- **Iteration 0 assets (figure, table):** generated from prompts alone, with the scans used only as visual reference.

## Library (each asset generated once, reused everywhere)
- `cards/<kind>.webp`, 600×840: the painting for each of the 9 card kinds (`treasure, fireDragon, petrified, sorceress, troll, dwarf, knight, huntress, ship`). Each is repainted from that card's art in the scan, after the frame, corner squares and edge motif were inpainted out. The frame, corner value squares and the ship glyph are drawn in code around them.
- `board/panorama.webp`, 2200×739 (about 2.98:1, the real board's proportions): the board repainted from the stitched scan.
  - Each space's subject is painted inside its outline, as on the original.
  - The printed outlines and arrows survive faintly in the paint. Code draws crisp ones exactly on top, using `../boardGeometry.json`, which was measured from the same crop.
- `back/green.webp` and `back/red.webp`, 600×1024: full-colour backs repainted from the two scanned backs. They show the silver S-shaped two-headed dragon, its wings, and the glowing slit-pupil eye in the deck colour. **These are the faithful backs to use (objectFit cover).**
- `back/dragon.webp`, 600×1024 RGBA: a neutral grey version of the same dragon. Its alpha follows its silver parts, and there's a small transparent oval where the code-drawn eye sits. It's kept for compatibility with the iteration-0 tint compositing.
- `figure/great-dragon.webp`, 512² transparent: the red Great Dragon figure.
- `table/surface.webp`, 1024²: a seamless dark-oak tile (mirror-tiled).
- `sounds/*.mp3`: synthesized effects, about −12 dBFS. See `sounds/CREDITS.md`.

## Models
- **SDXL base 1.0** (dpmpp_2m/karras, 30 steps, cfg 6.5, with a negative prompt) for the cards, board and back.
- **Flux fp8** (`fluxedUpFluxNSFW_112_fp8`, euler, 20 steps, guidance 3.5) for the plastic figure and the table texture, which are photoreal objects. Flux isn't used for people (see `docs/ADDING-A-GAME.md` §7).

## Regenerate the iteration-1 art (img2img from the scans)
1. Prepare the inputs (scratch only, never committed): `~/ai/ComfyUI/venv/bin/python tools/dragonheart-art/prep_scans.py /tmp/dh2`.
   - This stitches the three board scans (SIFT plus a partial affine, feathered), crops to the board and flattens or inpaints the three fold creases.
   - It deskews each card, inpaints the frame bits and centre-crops the art.
   - It crops both backs.
2. Start ComfyUI (below).
3. **Board:**
   1. Background pass: `python3 tools/dragonheart-art/board_tiles.py /tmp/dh2/board_clean.png /tmp/dh2/out/tiled.png --denoise 0.34 --seed 21`. This repaints 4096 px wide in full-height 1024-wide tiles with stride 768, sequentially, so each tile agrees with its neighbour's repaint and there's no ghosting.
   2. Subject pass: `python3 tools/dragonheart-art/board_subjects.py /tmp/dh2/board_clean.png /tmp/dh2/out/tiled.png /tmp/dh2/out/b1.png --denoise 0.30 --seed 31`. This repaints each space's subject from the full-resolution scan with only its own prompt, then feather-pastes it.
   3. Touch-up: `board_subjects.py b1.png b1.png b2.png --denoise 0.36 --seed 34 --only sorceress,knight`.
   4. The fold crease through the Sorceress kept reappearing as a pole. Inpaint (TELEA, r=9) columns x 2722–2742 of `b2.png`, except rows 150–560 (the horse), then `board_subjects.py b2' b2' b3.png --denoise 0.33 --seed 41 --only sorceress`.
   5. Export `b3.png` to 2200×739 WebP q86.
4. **Cards:** `python3 tools/dragonheart-art/img2img.py tools/dragonheart-art/jobs-img2img-cards.json /tmp/dh2/out` (denoise 0.40, seed 51). Fire Dragon, Sorceress and Petrified use seed 52 at denoise 0.32, because 0.40 changed their composition. Resize to 600×840 WebP q84.
5. **Backs:** `python3 tools/dragonheart-art/img2img.py tools/dragonheart-art/jobs-img2img-backs.json /tmp/dh2/out` (denoise 0.33, seed 61), resized to 600×1024. `dragon.webp` is derived from the green result: grey, alpha = low saturation, with the eye oval cleared.
6. Eye-check against the scans, then **stop ComfyUI**.

## Regenerate (iteration 0, prompt-only)
1. Start ComfyUI with `~/ai/ComfyUI/start.sh --listen 127.0.0.1 --port 8188 --reserve-vram 2.0 --fp32-vae --disable-smart-memory`.
2. Generate: `python tools/dragonheart-art/comfy_gen.py tools/dragonheart-art/jobs.json /tmp/dh-raw [--only name]`.
3. Process: `python tools/dragonheart-art/process_assets.py /tmp/dh-raw client/src/games/dragonheart/assets`. This needs a venv with `rembg[cpu]`, pillow and numpy, *not* the ComfyUI venv.
4. Sounds: `python tools/dragonheart-art/make_sounds.py client/src/games/dragonheart/assets/sounds` (needs numpy, scipy and ffmpeg).
5. Look at every output, then stop ComfyUI.

The petrified, ship, back, panorama and figure assets were each picked from 3–4 seeds after an eye check. `jobs.json` records the winning prompt and seed.

## Prompts and seeds (`tools/dragonheart-art/jobs.json`)
| Asset | Model | Size | Seed | Prompt |
|---|---|---|---|---|
| `card-dwarf` | sdxl | 832×1152 | 610 | a bearded dwarf miner with a pickaxe crouching in a dark timber-framed mine tunnel, a glowing oil lantern hanging from a beam, warm orange lantern light, deep brown shadows, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-knight` | sdxl | 832×1152 | 611 | a young red-haired knight in a brown leather and mail tunic with a red cape raising a sword and holding a round shield, crouching on a grassy hillside, warm golden sunset light, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-huntress` | sdxl | 832×1152 | 612 | a blonde huntress archer with a braid and a quiver, in a dark green leather tunic and trousers, kneeling on a rock drawing a longbow aimed upward to the right, violet and peach sunset sky behind her, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-treasure` | sdxl | 832×1152 | 613 | an open wooden treasure chest overflowing with gold coins and jewels sitting on top of a tall jagged golden rock spire above the sea, pink and violet sunset sky, distant mountains, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-fireDragon` | sdxl | 832×1152 | 614 | a pale golden winged dragon diving through the air over the sea at sunset, wings spread wide, long tail, pink and peach hazy sky, misty mountains far away, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-sorceress` | sdxl | 832×1152 | 615 | a dark-haired sorceress in a flowing grey gown riding a rearing brown horse, holding up a tall staff with a glowing blue-white light at its tip, rocky desert ground, violet dusk sky, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-petrified` | sdxl | 832×1152 | 726 | an enormous petrified dragon turned entirely to grey stone, coiled on a rocky hill, its stone wings folded, the whole dragon is weathered grey granite with cracks and moss, the only color is a glowing blood-red ruby jewel hanging from an iron chain around its stone neck, pale lavender evening sky, fantasy board game card illustration, detailed painterly digital oil painting, muted grey stone, full scene |
| `card-ship` | sdxl | 832×1152 | 727 | a small medieval wooden cog boat with one single mast and one cream square sail, a single small boat alone, sailing on calm deep violet water, purple and peach evening sky, gentle waves, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `card-troll` | sdxl | 832×1152 | 618 | a hulking muscular brown-skinned troll with small tusks sitting hunched holding a huge wooden club, a leather strap across its chest, earthy brown and ochre background, fantasy board game card illustration, detailed painterly digital oil painting, rich warm colors, full scene |
| `board-panorama` | sdxl | 1536×576 | 720 | a wide fantasy landscape panorama painting, the left third is a calm sea at sunset with red and orange clouds and dark rocky sea cliffs with a wooden dock and a small sailing boat, the middle third is a grassy cliff-top dirt road with a distant castle on a hill under a violet sky, the right third is a rocky mountain dragon lair with a huge coiled grey stone dragon statue lying on the ground and one leafy tree at the far right edge, soft hazy warm light, board game board art, detailed painterly digital oil painting, rich warm colors |
| `back-dragon` | sdxl | 832×1152 | 740 | a silver metallic serpentine dragon forming a large S shape, one dragon head at the top left and another dragon head at the bottom right of its long scaly coiled body, grey bat wings spread behind its middle, symmetrical heraldic emblem, monochrome silver and grey, highly detailed scales, centered, isolated on a pure flat black background |
| `great-dragon` | flux | 768×768 | 642 | a small glossy deep crimson red plastic dragon miniature figurine, a board game playing piece, the dragon is seated upright on a small round base with its wings folded tightly along its back, long neck, head raised, molded scales, single solid deep red plastic color, studio product photo, three-quarter view, centered, fills two thirds of the frame, isolated on a flat uniform medium gray background, no shadow, no text |
| `table` | flux | 1024×1024 | 650 | a flat top-down seamless texture of a dark weathered oak wood tabletop, deep brown-grey grain with fine cracks, evenly lit, full frame, no objects, no text |
