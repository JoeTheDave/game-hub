#!/usr/bin/env python3
"""Turn raw ComfyUI renders (tools/onitama-art/jobs.json + round-2 picks) into Onitama's assets.

Usage: python3 process_assets.py <raw_dir> <assets_dir>
Needs pillow + numpy (system python is fine).

- pieces: the red master/student discs are cut out of their white backdrop (largest non-white
  blob, feathered alpha, square crop). The blue pieces are the SAME images recoloured
  (red/vermilion hues -> indigo; the gold crest and black rim untouched), so pairs match exactly.
- temples: the red torii brush glyph (alpha from distance to paper white), blue by recolour.
- stamps: hanko impressions cut out the same way (both colours were generated).
- table: the dark cedar texture as a single 1920x1080 backdrop (use background-size: cover; the
  half-offset cross-fade made a visible seam, so it is deliberately not tiled).
- parchment: procedural washi (periodic noise + soft fibres), seamless by construction.
- mat: the sumi-e landscape lightened toward paper so the board grid reads on top; the
  artist-seal corner is cropped away.
"""
import colorsys
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

RAW, OUT = sys.argv[1], sys.argv[2]
PICK = {'red-master': 'red-master', 'red-student': 'red-student-b', 'table': 'table-b'}


def raw(name):
    return Image.open(os.path.join(RAW, PICK.get(name, name) + '.png')).convert('RGB')


def disc(im, size=384):
    """Cut a lacquer token out of its white plate + grey shadow: the disc is the saturated or very
    dark pixels (red/blue lacquer, black rim, gold crest), with interior holes filled."""
    a = np.asarray(im, dtype=np.float32) / 255
    mx, mn = a.max(2), a.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    m = ((sat > 0.28) | (mx < 0.30)).astype(np.uint8) * 255
    mi = Image.fromarray(m, 'L').filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # fill holes: flood the outside from a corner, everything not reached is inside the disc
    from PIL import ImageDraw
    flood = mi.copy()
    ImageDraw.floodfill(flood, (0, 0), 128)
    inside = np.asarray(flood) != 128
    ys, xs = np.where(inside)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    r = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    circle = np.clip((r - np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)) / 1.5 + 0.5, 0, 1)  # anti-aliased
    rgba = np.dstack([a * 255, circle * 255]).astype(np.uint8)
    half = int(r * 1.03)
    img = Image.fromarray(rgba, 'RGBA').crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    return img.resize((size, size), Image.LANCZOS)


def cutout(im, thresh=38, feather=1.2, pad=0.04, square=True, bbox_thresh=None):
    a = np.asarray(im, dtype=np.float32)
    dist = np.sqrt(((255 - a) ** 2).sum(2))  # distance from white
    mask = dist > (bbox_thresh or thresh)
    # keep the largest blob via its bbox (objects are centred and isolated on white)
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    alpha = np.clip((dist - thresh * 0.6) / (thresh * 0.8), 0, 1)
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    if feather:
        r, g, b, al = img.split()
        al = al.filter(ImageFilter.GaussianBlur(feather))
        img = Image.merge('RGBA', (r, g, b, al))
    w, h = x1 - x0, y1 - y0
    side = max(w, h) if square else None
    p = int((side or max(w, h)) * pad)
    if square:
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        half = side // 2 + p
        return img.crop((cx - half, cy - half, cx + half, cy + half))
    return img.crop((x0 - p, y0 - p, x1 + p, y1 + p))


def to_blue(img):
    """Recolour vermilion/red hues to the poster's indigo; leave gold, black and white alone."""
    arr = np.asarray(img.convert('RGBA'), dtype=np.float32) / 255
    rgb = arr[..., :3]
    mx = rgb.max(2); mn = rgb.min(2)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # hue in degrees
    h = np.zeros_like(mx)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, (60 * ((g - b) / d) + 360) % 360, h)
    h = np.where(mx == g, 60 * ((b - r) / d) + 120, h)
    h = np.where(mx == b, 60 * ((r - g) / d) + 240, h)
    red = ((h < 25) | (h > 335)) & (s > 0.3)
    out = rgb.copy()
    ys, xs = np.where(red)
    for y, x in zip(ys, xs):
        v = mx[y, x]
        out[y, x] = colorsys.hsv_to_rgb(224 / 360, min(1, s[y, x] * 0.78), min(1, v * 0.74))
    arr[..., :3] = out
    return Image.fromarray((arr * 255).astype(np.uint8), 'RGBA')


def seamless(img):
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    yy = np.abs(np.linspace(-1, 1, h))[:, None]
    xx = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(np.maximum(yy, xx) * 1.6 - 0.6, 0, 1)[..., None]  # 0 centre -> 1 edges
    return Image.fromarray((a * (1 - m) + rolled * m).astype(np.uint8))


def periodic_noise(n, scale, rng):
    """Seamless value noise via random Fourier phases restricted to low frequencies."""
    f = np.zeros((n, n), dtype=complex)
    for ky in range(-scale, scale + 1):
        for kx in range(-scale, scale + 1):
            if kx == 0 and ky == 0:
                continue
            amp = 1 / (1 + (kx * kx + ky * ky)) ** 0.9
            f[ky % n, kx % n] = amp * np.exp(1j * rng.uniform(0, 2 * np.pi))
    z = np.real(np.fft.ifft2(f))
    return (z - z.min()) / (z.max() - z.min())


def parchment(n=1024, seed=7):
    rng = np.random.default_rng(seed)
    base = np.array([238, 226, 200], dtype=np.float32)
    tone = periodic_noise(n, 6, rng) * 0.6 + periodic_noise(n, 24, rng) * 0.4
    img = base[None, None, :] * (0.93 + 0.09 * tone[..., None])
    fib = Image.new('L', (n, n), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(fib)
    for _ in range(900):  # soft kozo fibres, drawn wrapped so the tile stays seamless
        x, y = rng.uniform(0, n, 2)
        ang = rng.uniform(0, np.pi); ln = rng.uniform(20, 90)
        dx, dy = np.cos(ang) * ln, np.sin(ang) * ln
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                d.line([(x + ox, y + oy), (x + dx + ox, y + dy + oy)], fill=int(rng.uniform(40, 110)), width=1)
    fib = np.asarray(fib.filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32)[..., None] / 255
    img = img * (1 - 0.10 * fib)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def main():
    os.makedirs(os.path.join(OUT, 'pieces'), exist_ok=True)
    save = lambda im, rel, q=88: im.save(os.path.join(OUT, rel), 'WEBP', quality=q, method=6)
    for kind in ('master', 'student'):
        red = disc(raw(f'red-{kind}'))
        save(red, f'pieces/red-{kind}.webp')
        save(to_blue(red), f'pieces/blue-{kind}.webp')
    torii = cutout(raw('temple-red'), thresh=60, square=True, bbox_thresh=110).resize((256, 256), Image.LANCZOS)
    save(torii, 'temple-red.webp'); save(to_blue(torii), 'temple-blue.webp')
    for c in ('red', 'blue'):
        save(cutout(raw(f'stamp-{c}'), thresh=60, bbox_thresh=110).resize((256, 256), Image.LANCZOS), f'stamp-{c}.webp')
    t = raw('table')
    save(t.resize((1920, 1920), Image.LANCZOS).crop((0, 420, 1920, 1500)), 'table.webp', 82)
    save(parchment(), 'parchment.webp', 84)
    mat = raw('mat')
    w, h = mat.size
    mat = mat.crop((0, 0, int(w * 0.93), int(h * 0.94)))  # drop the artist seal corner
    paper = Image.new('RGB', mat.size, (236, 224, 198))
    mat = Image.blend(mat, paper, 0.5).resize((1600, int(1600 * mat.height / mat.width)), Image.LANCZOS)
    save(mat, 'mat.webp', 82)


if __name__ == '__main__':
    main()
