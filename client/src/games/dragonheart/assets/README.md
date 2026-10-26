# Dragonheart art assets

Every image here was **newly generated with local AI image generation**. The scans of Joe's physical copy (vault: `Projects/game-hub/Dragonheart/`) were used only as visual reference when writing prompts. No scan pixels ship.

## Library (each asset generated once, reused everywhere)
- `cards/<kind>.webp`, 600×840: the painted illustration for each of the 9 card kinds (`treasure, fireDragon, petrified, sorceress, troll, dwarf, knight, huntress, ship`). The frame, corner value squares and the ship glyph are drawn in code around them.
- `board/panorama.webp`, 2200×800 (2.75:1): the board painting. The card outlines, arrows and space positions are drawn in code over it.
- `back/dragon.webp`, 630×880 RGBA: a silver serpentine dragon whose alpha follows its brightness. Code lays it over the green or red field and adds the glowing eye.
- `figure/great-dragon.webp`, 512² transparent: the red Great Dragon figure.
- `table/surface.webp`, 1024²: a seamless dark-oak tile (mirror-tiled).
- `sounds/*.mp3`: synthesized effects, about −12 dBFS. See `sounds/CREDITS.md`.

## Models
- **SDXL base 1.0** (dpmpp_2m/karras, 30 steps, cfg 6.5, with a negative prompt) for the cards, board and back.
- **Flux fp8** (`fluxedUpFluxNSFW_112_fp8`, euler, 20 steps, guidance 3.5) for the plastic figure and the table texture, which are photoreal objects. Flux isn't used for people (see `docs/ADDING-A-GAME.md` §7).

## Regenerate
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
