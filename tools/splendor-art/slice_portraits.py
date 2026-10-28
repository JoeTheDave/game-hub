#!/usr/bin/env python3
"""Slice Joe's two 4x4 noble-portrait grids into 32 square portraits (play-test round 2).

Sources (vault): Projects/game-hub/Splendor Card Scans/Noble Portraits - Grid 1.png and Grid 2.png
(1254x1254, thin dark gutters, rounded tile corners).
- Gutters are found from the mean-brightness profile of each axis: runs darker than GUTTER_LUM,
  with runs closer than 8 px merged.
- Each tile is cropped INSET px inside its gutters, which drops the rounded corners and any edge
  line, then resized to 512x512 and saved as WebP q85.
- Output: client/src/games/splendor/assets/nobles/p-01..p-32.webp (grid 1 row-major, then grid 2).
  The existing n-01..n-10 are untouched.

Usage: python3 slice_portraits.py "<Grid 1.png>" "<Grid 2.png>" [--sheet contact.jpg]
"""
import os, sys
import numpy as np
from PIL import Image

GUTTER_LUM = 45
INSET = 12
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'client', 'src', 'games', 'splendor', 'assets', 'nobles')


def gutters(profile):
    dark = profile < GUTTER_LUM
    runs, start = [], None
    for i, d in enumerate(dark):
        if d and start is None:
            start = i
        if not d and start is not None:
            runs.append([start, i - 1])
            start = None
    if start is not None:
        runs.append([start, len(profile) - 1])
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 8:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return merged


def tiles(path):
    im = Image.open(path).convert('RGB')
    g = np.asarray(im.convert('L')).astype(float)
    cols, rows = gutters(g.mean(0)), gutters(g.mean(1))
    if len(cols) != 5 or len(rows) != 5:
        raise SystemExit(f'{path}: expected 5 gutters per axis, got cols={cols} rows={rows}')
    out = []
    for r in range(4):
        for c in range(4):
            x0, x1 = cols[c][1] + 1 + INSET, cols[c + 1][0] - 1 - INSET
            y0, y1 = rows[r][1] + 1 + INSET, rows[r + 1][0] - 1 - INSET
            side = min(x1 - x0, y1 - y0)
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
            out.append(im.crop(box).resize((512, 512), Image.LANCZOS))
    return out


def main():
    grids = [a for a in sys.argv[1:3]]
    portraits = tiles(grids[0]) + tiles(grids[1])
    os.makedirs(OUT, exist_ok=True)
    for i, p in enumerate(portraits, 1):
        p.save(os.path.join(OUT, f'p-{i:02d}.webp'), 'WEBP', quality=85, method=6)
    print(f'{len(portraits)} portraits -> {OUT}')
    if '--sheet' in sys.argv:
        sheet = Image.new('RGB', (8 * 160, 4 * 160), 'white')
        for i, p in enumerate(portraits):
            sheet.paste(p.resize((156, 156)), ((i % 8) * 160 + 2, (i // 8) * 160 + 2))
        sheet.save(sys.argv[sys.argv.index('--sheet') + 1])


if __name__ == '__main__':
    main()
