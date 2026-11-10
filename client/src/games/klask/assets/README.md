# Klask assets

None of these come from the real Klask game: no scans or photos of the product are used.

## Files
| File | Size | Source |
|---|---|---|
| `../cover.webp` | 800×1067 | Generated art (`cover-a`) plus the title "KLASK" composited in code |
| `wood.webp` | 1024² seamless | Generated warm oak grain (`wood`, round 2) |
| `playfield.webp` | 1024² seamless | Generated dark navy painted MDF (`playfield`, round 2), no lines |
| `felt-noise.webp` | 512² seamless, greyscale | Generated in code: a fine grain to multiply over surfaces at low opacity (optional) |
| `sounds/*.mp3` | | Synthesized; see `sounds/CREDITS.md` |

How the textures were made:
- **Cover:** cropped to 3:4, with a navy gradient over the top so the title reads (and a stray drink-can label in the render is hidden). "KLASK" is in **Bungee** (Google Fonts, OFL), yellow (the ball's colour) with a thick navy outline and a soft drop shadow.
- **Wood:** grain runs vertically. A clean 1024×740 band (above a patch artefact in the render) is stacked with its vertical mirror, so rows wrap invisibly, then the left and right edges are blended.
- **Playfield:** a central crop (avoiding a pale corner and a wood sliver in the render) is lighting-flattened (high-pass) and wrap-blended so tiles don't show blocks.

Striker, ball, biscuits, painted lines and goals are drawn in code (canvas 2D), for both the realistic and the stylized table.

## Generation (ComfyUI, local)
Start ComfyUI: `~/ai/ComfyUI/start.sh --listen 127.0.0.1 --port 8188 --reserve-vram 2.0 --fp32-vae --disable-smart-memory`. **Stop it when done.**

Model: **Flux fp8** (`fluxedUpFluxNSFW_112_fp8.safetensors`), euler/simple, cfg 1.0, guidance 3.5. Degenerate (flat or black) outputs are retried automatically with seed + 1000.

| Job (file) | Size | Seed used | Steps |
|---|---|---|---|
| `cover-a` (`jobs.json`) | 896×1184 | 101 | 24 |
| `wood` (`jobs-round2.json`) | 1024² | 717 | 22 |
| `playfield` (`jobs-round2.json`) | 1024² | 616 | 22 |

Prompts are in `tools/klask-art/jobs.json` and `jobs-round2.json`.

Rejected candidates:
- `cover-b`: busy bar scene with a face and a red striker.
- `cover-c`: odd T-shaped strikers.
- Round-1 `wood`: flat stripes.
- Round-1 `playfield`: a board on a white background, not edge to edge.

## Regenerate
```bash
cd tools/klask-art
~/ai/ComfyUI/venv/bin/python comfy_gen.py jobs.json /tmp/klask-raw --only cover-a
~/ai/ComfyUI/venv/bin/python comfy_gen.py jobs-round2.json /tmp/klask-raw --only wood,playfield
curl -sL -o /tmp/Bungee-Regular.ttf https://github.com/google/fonts/raw/main/ofl/bungee/Bungee-Regular.ttf
python3 process_assets.py /tmp/klask-raw /tmp/Bungee-Regular.ttf
~/ai/ComfyUI/venv/bin/python make_sounds.py ../../client/src/games/klask/assets/sounds
```
