#!/usr/bin/env python3
"""Tiled SDXL img2img of the Dragonheart board.

Repaints the cleaned stitched board scan tile by tile at about 4096 px wide, so each figure is
large enough for SDXL to render properly. Each tile's prompt names the subjects inside it, and
the tiles are feather-blended back together.

Usage: python3 board_tiles.py SRC.png OUT.png --denoise 0.35 --seed 21 [--work /tmp/dh2/tiles]
Needs ComfyUI running (see assets/README.md) and img2img.py alongside.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import img2img  # noqa: E402

GEO = os.path.join(os.path.dirname(__file__), '../../client/src/games/dragonheart/boardGeometry.json')
STYLE = ('detailed fantasy oil painting, board game board art in the style of Michael Menzel, warm sunset light, '
         'rich painterly brushwork, highly detailed, ')
SUBJECTS = {
    'huntress': 'a blonde huntress archer in dark leather drawing a longbow, standing on a rock by the sea',
    'fireDragon': 'a pale golden winged fire dragon flying over the sea',
    'ship': 'a wooden single-mast sailing ship with a furled square sail on the violet sea near a wooden dock',
    'treasure': 'an open wooden treasure chest on top of a jagged golden rock spire above the sea',
    'knight': 'a red-haired knight with a sword and shield crouching in tall grass on a cliff top',
    'sorceress': 'a sorceress on a rearing brown horse holding a staff with a glowing light, on a dirt road, a distant castle',
    'petrified': 'a huge petrified grey stone dragon with folded stone wings and a red jewel hanging on a chain',
    'troll': 'a hulking grey-skinned troll crouching and holding a wooden club',
    'dwarf': 'a bearded dwarf with a lantern inside a timber-framed mine entrance',
}
SCENERY = [(0.0, 'a calm violet sea at sunset with a glowing sun, red and orange clouds, rocky shore'),
           (0.33, 'grassy sea cliffs, a dirt road, distant mountains under a violet sky'),
           (0.66, 'a rocky hill lair, dirt ground, a leafy tree, violet evening sky')]


def tile_prompt(x0, x1, y0, y1, geo):
    subs = []
    for name, sp in geo['spaces'].items():
        if name not in SUBJECTS:
            continue
        o = sp['outlines'][0]
        cx, cy = o['x'] + o['w'] / 2, o['y'] + o['h'] / 2
        if x0 <= cx < x1 and y0 <= cy < y1:
            subs.append(SUBJECTS[name])
    mid = (x0 + x1) / 2
    scen = [s for t, s in SCENERY if mid >= t][-1]
    return STYLE + ', '.join(subs + [scen])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--denoise', type=float, default=0.35)
    ap.add_argument('--seed', type=int, default=21)
    ap.add_argument('--width', type=int, default=4096)
    ap.add_argument('--tile', type=int, default=1024)
    ap.add_argument('--stride', type=int, default=768)
    ap.add_argument('--work', default='/tmp/dh2/tiles')
    a = ap.parse_args()
    geo = json.load(open(GEO))
    src = Image.open(a.src).convert('RGB')
    W = a.width; H = int(round(W * src.height / src.width / 8)) * 8
    src = src.resize((W, H), Image.LANCZOS)
    os.makedirs(a.work, exist_ok=True)
    # Full-height tiles (no vertical overlap), processed left to right. Each tile is cut from the
    # running composite, so it sees its left neighbour's repaint in the overlap and agrees with it,
    # which avoids double-image ghosting where two independent repaints are blended.
    TW, TH = a.tile, H
    xs = list(range(0, W - TW + 1, a.stride))
    if xs[-1] != W - TW:
        xs.append(W - TW)
    cur = np.asarray(src, np.float64).copy()
    feather = 192
    for xi, x in enumerate(xs):
        name = f'tile-{xi}'
        inp = os.path.join(a.work, name + '-in.png')
        Image.fromarray(cur[:, x:x + TW].clip(0, 255).astype(np.uint8)).save(inp)
        prompt = tile_prompt(x / W, (x + TW) / W, 0, 1, geo)
        job = {'name': name, 'input': inp, 'width': TW, 'height': TH, 'prompt': prompt,
               'seed': a.seed, 'denoise': a.denoise}
        path = img2img.run(job, a.work)
        out = np.asarray(Image.open(path).convert('RGB').resize((TW, TH), Image.LANCZOS), np.float64)
        alpha = np.ones(TW)
        if xi > 0:
            alpha[:feather] = np.linspace(0, 1, feather)
        cur[:, x:x + TW] = cur[:, x:x + TW] * (1 - alpha[None, :, None]) + out * alpha[None, :, None]
        print(name, prompt[len(STYLE):][:90], flush=True)
    res = cur.clip(0, 255).astype(np.uint8)
    Image.fromarray(res).save(a.out)


if __name__ == '__main__':
    main()
