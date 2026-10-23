#!/usr/bin/env python3
"""Turn raw ComfyUI outputs (RAW_DIR/*.png) into the shipped WebP asset library.

Usage: python process_assets.py RAW_DIR ASSET_DIR
Needs: pillow, numpy, rembg (gem cutouts). Run in a venv: pip install "rembg[cpu]" pillow numpy
"""
import sys, os
from PIL import Image, ImageOps, ImageFilter
import numpy as np

RAW, OUT = sys.argv[1], sys.argv[2]
GEMS = ['white', 'blue', 'green', 'red', 'black', 'gold']
SCENES = [f't{t}-{c}' for t in (1, 2, 3) for c in ('white', 'blue', 'green', 'red', 'black')]


def save(im, rel, q=80, **kw):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6, **kw)
    print(f'{rel}: {os.path.getsize(path)//1024} KB')


def cover(im, w, h):
    return ImageOps.fit(im, (w, h), Image.LANCZOS, centering=(0.5, 0.5))


def gems():
    from rembg import remove, new_session
    sess = new_session('isnet-general-use')
    for g in GEMS:
        src = Image.open(os.path.join(RAW, f'gem-{g}.png')).convert('RGB')
        cut = remove(src, session=sess, alpha_matting=True, alpha_matting_foreground_threshold=240,
                     alpha_matting_background_threshold=20, alpha_matting_erode_size=6)
        a = np.asarray(cut.split()[-1])
        # Drop faint shadow/noise alpha and soften edge slightly.
        a = np.where(a < 40, 0, a).astype('uint8')
        cut.putalpha(Image.fromarray(a).filter(ImageFilter.GaussianBlur(0.6)))
        cut = cut.crop(cut.getbbox())
        # Normalize: gem fits a 448 box centered in 512 so all six read the same size.
        cut.thumbnail((448, 448), Image.LANCZOS)
        canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        canvas.paste(cut, ((512 - cut.width) // 2, (512 - cut.height) // 2), cut)
        save(canvas, f'gems/{g}.webp', q=85)


def scenes():
    for s in SCENES:
        save(cover(Image.open(os.path.join(RAW, f'scene-{s}.png')).convert('RGB'), 630, 880), f'scenes/{s}.webp', q=78)


def nobles():
    for i in range(1, 11):
        save(Image.open(os.path.join(RAW, f'noble-n-{i:02d}.png')).convert('RGB').resize((512, 512), Image.LANCZOS),
             f'nobles/n-{i:02d}.webp', q=80)


def backs():
    eng = ImageOps.grayscale(Image.open(os.path.join(RAW, 'back-engraving.png')))
    save(ImageOps.autocontrast(cover(eng, 630, 880), cutoff=1), 'backs/engraving.webp', q=75)
    nob = ImageOps.grayscale(Image.open(os.path.join(RAW, 'back-noble-engraving.png')))
    nob = nob.crop((100, 55, 965, 920))  # trim the printed margin + caption off the generated plate
    save(ImageOps.autocontrast(nob.resize((512, 512), Image.LANCZOS), cutoff=1), 'backs/noble-engraving.webp', q=75)


def mirror_tile(im, size):
    """Make a seamless tile by mirroring a half-size crop into a 2x2 grid."""
    h = size // 2
    q = cover(im, h, h)
    tile = Image.new('RGB', (size, size))
    tile.paste(q, (0, 0)); tile.paste(ImageOps.mirror(q), (h, 0))
    tile.paste(ImageOps.flip(q), (0, h)); tile.paste(ImageOps.flip(ImageOps.mirror(q)), (h, h))
    return tile


def textures():
    save(cover(Image.open(os.path.join(RAW, 'parchment.png')).convert('RGB'), 256, 256), 'token/parchment.webp', q=80)
    save(mirror_tile(Image.open(os.path.join(RAW, 'table.png')).convert('RGB'), 1024), 'table/surface.webp', q=75)


if __name__ == '__main__':
    gems(); scenes(); nobles(); backs(); textures()
