#!/usr/bin/env python3
"""Second pass on the Dragonheart board: repaint each space's subject on its own.

Each space's outline region is cut from the cleaned full-resolution scan (so the subject is
large and sharp) and repainted with img2img using only that subject's prompt. It's then
feather-pasted over the tiled background (board_tiles.py output). This keeps every figure
faithful to the original instead of letting a tile's mixed prompt turn one subject into another.

Usage: python3 board_subjects.py SCAN_CLEAN.png TILED.png OUT.png --denoise 0.3 --seed 31
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import img2img  # noqa: E402
from board_tiles import GEO, STYLE, SUBJECTS  # noqa: E402

PROMPTS = dict(SUBJECTS)
PROMPTS['petrified'] = ('a huge petrified dragon made of weathered grey stone, coiled with folded stone wings, moss and '
                        'vines growing on it, a glowing red ruby jewel hanging from an iron chain around its neck, '
                        'on a rocky hill at dusk')
PROMPTS['treasure'] = ('an open wooden treasure chest full of gold sitting on the very top of a tall jagged golden rock spire '
                       'rising from the sea, violet sky, distant hills')
PROMPTS['troll'] = ('a hulking muscular grey-skinned troll crouching on a dirt path at the foot of a hill, holding a big '
                    'wooden club across its knees, a leather strap over its shoulder')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scan'); ap.add_argument('tiled'); ap.add_argument('out')
    ap.add_argument('--denoise', type=float, default=0.3)
    ap.add_argument('--seed', type=int, default=31)
    ap.add_argument('--margin', type=float, default=0.12)
    ap.add_argument('--work', default='/tmp/dh2/subjects')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    geo = json.load(open(GEO))
    scan = Image.open(a.scan).convert('RGB')
    base = Image.open(a.tiled).convert('RGB')
    SW, SH = scan.size; BW, BH = base.size
    os.makedirs(a.work, exist_ok=True)
    only = set(a.only.split(',')) if a.only else None
    for name, sp in geo['spaces'].items():
        if name not in PROMPTS or (only and name not in only):
            continue
        o = sp['outlines'][0]
        x0 = max(0.0, o['x'] - o['w'] * a.margin); x1 = min(1.0, o['x'] + o['w'] * (1 + a.margin))
        y0 = max(0.0, o['y'] - o['h'] * a.margin); y1 = min(1.0, o['y'] + o['h'] * (1 + a.margin))
        crop = scan.crop((int(x0 * SW), int(y0 * SH), int(x1 * SW), int(y1 * SH)))
        cw, ch = crop.size
        s = 1024 / max(cw, ch)
        gw, gh = int(cw * s) // 8 * 8, int(ch * s) // 8 * 8
        inp = os.path.join(a.work, name + '-in.png')
        crop.resize((gw, gh), Image.LANCZOS).save(inp)
        job = {'name': name, 'input': inp, 'width': gw, 'height': gh, 'prompt': STYLE + PROMPTS[name],
               'seed': a.seed, 'denoise': a.denoise}
        path = img2img.run(job, a.work)
        bx0, by0, bx1, by1 = int(x0 * BW), int(y0 * BH), int(x1 * BW), int(y1 * BH)
        rep = Image.open(path).convert('RGB').resize((bx1 - bx0, by1 - by0), Image.LANCZOS)
        mask = Image.new('L', rep.size, 0)
        f = int(min(rep.size) * 0.08)
        mask.paste(255, (f, f, rep.size[0] - f, rep.size[1] - f))
        mask = mask.filter(ImageFilter.GaussianBlur(f / 2))
        base.paste(rep, (bx0, by0), mask)
        print(name, 'done', flush=True)
    base.save(a.out)


if __name__ == '__main__':
    main()
