#!/usr/bin/env python3
"""Turn raw ComfyUI renders into Klask's shipped assets.

Usage: python3 process_assets.py RAW_DIR FONT.ttf
  RAW_DIR  holds cover-a.png, wood.png (round 2), playfield.png (round 2) from comfy_gen.py
  FONT     Bungee-Regular.ttf (Google Fonts, OFL) for the cover title

Writes client/src/games/klask/cover.webp and assets/{wood,playfield,felt-noise}.webp.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..', '..', 'client', 'src', 'games', 'klask')
ASSETS = os.path.join(GAME, 'assets')


def flatten(im, radius=90):
    """Remove the render's uneven lighting (low frequencies) so tiles don't show as blocks."""
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    lo = np.asarray(im.convert('RGB').filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)
    return Image.fromarray(np.clip(a - lo + a.reshape(-1, 3).mean(0), 0, 255).astype(np.uint8))


def seamless(im):
    """Make a texture tile: blend it with its half-shifted copy, weighted toward the copy at the
    tile edges (where the shifted copy's seamless centre lies)."""
    a = np.asarray(flatten(im), dtype=np.float32)
    h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    wx = 1 - np.abs(np.linspace(-1, 1, w))  # 1 at centre, 0 at edges
    wy = 1 - np.abs(np.linspace(-1, 1, h))
    wgt = np.clip(np.minimum.outer(wy, wx) * 2.2, 0, 1)[..., None]
    return Image.fromarray((a * wgt + b * (1 - wgt)).astype(np.uint8))


def seamless_x(im):
    """Horizontal-only wrap blend (for vertically mirrored wood: rows already wrap)."""
    a = np.asarray(flatten(im), dtype=np.float32)
    w = a.shape[1]
    b = np.roll(a, w // 2, axis=1)
    wgt = np.clip((1 - np.abs(np.linspace(-1, 1, w))) * 2.2, 0, 1)[None, :, None]
    return Image.fromarray((a * wgt + b * (1 - wgt)).astype(np.uint8))


def wood_texture(src, out, size=1024):
    """Wood grain runs vertically: stack the clean band with its vertical mirror so rows wrap
    invisibly (grain lines continue), then blend the left/right edges."""
    band = Image.open(src).convert('RGB').crop((0, 0, 1024, 740))
    tall = Image.new('RGB', (1024, 1480))
    tall.paste(band, (0, 0))
    tall.paste(band.transpose(Image.FLIP_TOP_BOTTOM), (0, 740))
    seamless_x(tall.resize((size, size), Image.LANCZOS)).save(out, 'WEBP', quality=86, method=6)


def texture(src, crop, out, size=1024, q=86, extra=None):
    im = Image.open(src).convert('RGB')
    if crop:
        im = im.crop(crop)
    im = im.resize((size, size), Image.LANCZOS)
    if extra:
        im = extra(im)
    seamless(im).save(out, 'WEBP', quality=q, method=6)


def cover(src, font, out):
    im = Image.open(src).convert('RGB')
    w, h = im.size  # 896×1184 (≈3:4)
    tw = round(h * 3 / 4)
    im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h)).resize((800, 1067), Image.LANCZOS)
    # Darken the top for the title (it also hides a stray can label in the render).
    grad = Image.new('L', (1, 1067))
    for y in range(1067):
        t = max(0.0, 1 - y / 470)
        grad.putpixel((0, y), int(245 * min(1.0, t * 1.35) ** 1.2))
    shade = Image.new('RGB', im.size, (10, 16, 44))
    im = Image.composite(shade, im, grad.resize(im.size))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(font, 168)
    text = 'KLASK'
    bbox = d.textbbox((0, 0), text, font=f)
    tx = (800 - (bbox[2] - bbox[0])) // 2 - bbox[0]
    ty = 70 - bbox[1]
    # soft drop shadow, then a thick navy outline, then the yellow fill (the ball's colour)
    sh = Image.new('L', im.size, 0)
    ImageDraw.Draw(sh).text((tx + 6, ty + 10), text, font=f, fill=200)
    im.paste((0, 0, 0), mask=sh.filter(ImageFilter.GaussianBlur(10)))
    d.text((tx, ty), text, font=f, fill=(255, 210, 50), stroke_width=9, stroke_fill=(16, 26, 70))
    im.save(out, 'WEBP', quality=88, method=6)


def felt_noise(out, size=512):
    """A fine, near-neutral grain overlay (multiply at low opacity) generated from noise."""
    rng = np.random.default_rng(7)
    n = rng.normal(0, 1, (size, size)).astype(np.float32)
    img = Image.fromarray(np.clip(128 + n * 18, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    a = np.asarray(img, dtype=np.float32)
    a = 200 + (a - a.mean()) * 1.4
    seamless(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB')).convert('L').save(out, 'WEBP', quality=82, method=6)


def main():
    raw, font = sys.argv[1], sys.argv[2]
    os.makedirs(ASSETS, exist_ok=True)
    cover(os.path.join(raw, 'cover-a.png'), font, os.path.join(GAME, 'cover.webp'))
    # wood (round 2): keep the clean top band above a patch artefact; grain runs vertically.
    wood_texture(os.path.join(raw, 'wood.png'), os.path.join(ASSETS, 'wood.webp'))
    # playfield (round 2): central crop avoids a pale corner and a wood sliver at the right edge.
    texture(os.path.join(raw, 'playfield.png'), (150, 150, 874, 874), os.path.join(ASSETS, 'playfield.webp'))
    felt_noise(os.path.join(ASSETS, 'felt-noise.webp'))


if __name__ == '__main__':
    main()
