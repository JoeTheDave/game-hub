#!/usr/bin/env python3
"""Dragonheart iteration 2: Joe's board image is the board; card faces are clipped from it.

Usage:
  python3 tools/dragonheart-art/clip_cards.py <joe-board.png> [--check out_dir]

- Writes client/src/games/dragonheart/assets/board/panorama.webp (near-lossless, same size).
- For each kind, clips that space's FRONT outline (the outer edge of the painted frame, so the
  frame becomes the card's border) from the board and writes assets/cards/<kind>.webp at 2x
  (Lanczos) for crisp phone rendering. Petrified Dragon's outline is landscape: its clip is
  rotated 90 deg counter-clockwise to a portrait card (the TV turns it back clockwise on the board,
  so the card on the board is pixel-identical to the board beneath it).
- --check draws every measured outline (front red, back outlines green) and the Great Dragon
  start spot over the board, for eyeballing the geometry in boardGeometry.json.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GAME = os.path.join(ROOT, 'client', 'src', 'games', 'dragonheart')
KINDS = ['treasure', 'fireDragon', 'petrified', 'sorceress', 'troll', 'dwarf', 'knight', 'huntress', 'ship']


def main():
    src = sys.argv[1]
    board = Image.open(src).convert('RGB')
    W, H = board.size
    geo = json.load(open(os.path.join(GAME, 'boardGeometry.json')))
    assert (W, H) == (geo['source']['w'], geo['source']['h']), 'geometry was measured on a different image size'
    board.save(os.path.join(GAME, 'assets', 'board', 'panorama.webp'), 'WEBP', quality=95, method=6)
    os.makedirs(os.path.join(GAME, 'assets', 'cards'), exist_ok=True)
    manifest = {'source': {'w': W, 'h': H}, 'clips': {}}
    for kind in KINDS:
        sp = geo['spaces'][kind]
        o = sp['outlines'][0]
        box = (round(o['x'] * W), round(o['y'] * H), round((o['x'] + o['w']) * W), round((o['y'] + o['h']) * H))
        clip = board.crop(box)
        if sp['orientation'] == 'landscape':
            clip = clip.rotate(90, expand=True)
        clip = clip.resize((clip.width * 2, clip.height * 2), Image.LANCZOS)
        clip.save(os.path.join(GAME, 'assets', 'cards', f'{kind}.webp'), 'WEBP', quality=92, method=6)
        manifest['clips'][kind] = {'box': list(box), 'rotated': sp['orientation'] == 'landscape'}
        print(kind, box, clip.size)
    # The exact pixel boxes clipped, so tests can prove each card's art is its outline's region.
    with open(os.path.join(GAME, 'assets', 'cards', 'clips.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    if '--check' in sys.argv:
        out = sys.argv[sys.argv.index('--check') + 1]
        os.makedirs(out, exist_ok=True)
        im = board.copy()
        d = ImageDraw.Draw(im)
        for name, sp in geo['spaces'].items():
            for i, o in enumerate(sp['outlines']):
                d.rectangle([o['x'] * W, o['y'] * H, (o['x'] + o['w']) * W, (o['y'] + o['h']) * H], outline=(255, 0, 0) if i == 0 else (0, 255, 0), width=2)
        cx, cy = geo['greatDragonStart']['center']
        d.ellipse([cx * W - 60, cy * H - 60, cx * W + 60, cy * H + 60], outline=(255, 255, 0), width=3)
        im.save(os.path.join(out, 'geometry-check.png'))


if __name__ == '__main__':
    main()
