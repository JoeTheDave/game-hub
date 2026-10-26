#!/usr/bin/env python3
"""Turn raw ComfyUI outputs into Dragonheart's shipped WebP asset library.

Usage: python process_assets.py RAW_DIR ASSET_DIR
Needs: pillow, numpy, rembg (for the figure cutout). Use a separate venv: pip install "rembg[cpu]" pillow numpy
PICKS maps each asset to the raw file chosen after eye-checking the generated variants.
"""
import sys, os
from PIL import Image, ImageOps, ImageFilter
import numpy as np

RAW, OUT = sys.argv[1], sys.argv[2]
CARDS = ['treasure', 'fireDragon', 'petrified', 'sorceress', 'troll', 'dwarf', 'knight', 'huntress', 'ship']
PICKS = {}  # jobs.json holds the chosen prompt+seed for every asset, so raw names match asset names


def raw(name):
    return Image.open(os.path.join(RAW, PICKS.get(name, name) + '.png'))


def save(im, rel, q=80, **kw):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6, **kw)
    print(f'{rel}: {os.path.getsize(path)//1024} KB')


def cover(im, w, h):
    return ImageOps.fit(im, (w, h), Image.LANCZOS, centering=(0.5, 0.5))


def cards():
    for c in CARDS:
        save(cover(raw(f'card-{c}').convert('RGB'), 600, 840), f'cards/{c}.webp', q=78)


def board():
    pano = raw('board-panorama').convert('RGB')
    w = pano.width
    pano = cover(pano, w, round(w / 2.75))
    save(pano.resize((2200, 800), Image.LANCZOS), 'board/panorama.webp', q=78)


def back():
    """Silver dragon on black → RGBA whose alpha follows brightness, so code can lay it over a green/red field."""
    im = cover(raw('back-dragon').convert('RGB'), 630, 880)
    g = np.asarray(ImageOps.grayscale(im)).astype(np.float32)
    alpha = np.clip((g - 18) * 1.9, 0, 255).astype('uint8')
    rgba = ImageOps.grayscale(im).convert('RGB')
    rgba.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.5)))
    save(rgba, 'back/dragon.webp', q=82)


def figure():
    from rembg import remove, new_session
    cut = remove(raw('great-dragon').convert('RGB'), session=new_session('isnet-general-use'))
    a = np.asarray(cut.split()[-1])
    cut.putalpha(Image.fromarray(np.where(a < 40, 0, a).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6)))
    cut = cut.crop(cut.getbbox())
    cut.thumbnail((448, 448), Image.LANCZOS)
    canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    canvas.paste(cut, ((512 - cut.width) // 2, (512 - cut.height) // 2), cut)
    save(canvas, 'figure/great-dragon.webp', q=85)


def mirror_tile(im, size):
    h = size // 2
    q = cover(im, h, h)
    tile = Image.new('RGB', (size, size))
    tile.paste(q, (0, 0)); tile.paste(ImageOps.mirror(q), (h, 0))
    tile.paste(ImageOps.flip(q), (0, h)); tile.paste(ImageOps.flip(ImageOps.mirror(q)), (h, h))
    return tile


def table():
    save(mirror_tile(raw('table').convert('RGB'), 1024), 'table/surface.webp', q=75)


if __name__ == '__main__':
    cards(); board(); back(); figure(); table()
