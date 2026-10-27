#!/usr/bin/env python3
"""Build the Dragonheart card frame overlay from the scanned cards (spec 1793038854620, iteration 3).

Joe wants the cards to carry the original game's artistic border: light grey edge, silver
filigree band, the silver dragon curling down the left edge from the top-left corner and up the
right edge from the bottom-right corner, and dark corner cartouches holding the point values.

Steps (reproducible from the vault scan):
  1. Crop the Troll card from `Card Faces - All Types.jpg`, straighten it (the angle that minimises
     the card's bounding box) and crop to the card.
  2. Resize to the game's card shape (outline ratio 336:220 -> 660x1008; the real card is 1.537,
     so this is a <1% squash, no 9-slice needed).
  3. Erase the printed numbers from the four corner cartouches (diffusion inpaint of the bright
     glyph pixels from the surrounding dark texture). The game draws its own numerals there.
  4. Cut the art window out (transparent), keeping the corner cartouches and the silver dragon
     pixels that overlap the window edge (low-saturation bright pixels in the edge strips).
  5. Round the outer corners and write `assets/frame/frame.webp` + `assets/frame/frame.json`
     (window and cartouche positions as fractions of the card, for the React component).

Usage: python3 tools/dragonheart-art/make_frame.py [scan.jpg]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SCAN = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    '/home/joe/obsidian-vault/Projects/game-hub/Dragonheart/Card Scans/Card Faces - All Types.jpg'
)
OUT_DIR = ROOT / 'client/src/games/dragonheart/assets/frame'
W, H = 660, 1008

# Measured on the straightened Troll card (671x1031 px), then scaled to W x H.
SRC_W, SRC_H = 671, 1031
WINDOW = (80, 80, 585, 951)  # art window inside the filigree band
CARTOUCHES = {  # outer rects of the four dark corner cartouches
    'tl': (72, 67, 161, 190),
    'tr': (508, 62, 611, 192),
    'bl': (57, 838, 157, 966),
    'br': (506, 841, 601, 961),
}
# Outer edge of the silver filigree band (the grey card border outside it is trimmed off).
BAND_OUTER = (47, 45, 623, 984)
# Strips inside the window where the silver dragon overlaps the art (kept if silver).
DRAGON_STRIPS = [(80, 80, 150, 680), (520, 560, 585, 951)]


def straighten(scan: Image.Image) -> Image.Image:
    s = scan.width / 1020
    crop = scan.crop(tuple(int(v * s) for v in (630, 945, 965, 1400)))
    best = None
    for a10 in range(-60, 61):
        a = a10 / 10
        r = crop.rotate(a, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))
        m = np.asarray(r.convert('L')) < 238
        ys = np.where(m.sum(1) > 20)[0]
        xs = np.where(m.sum(0) > 20)[0]
        area = (ys[-1] - ys[0]) * (xs[-1] - xs[0])
        if best is None or area < best[0]:
            best = (area, a, (xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
    _, a, box = best
    return crop.rotate(a, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255)).crop(box)


def sc(rect):
    x0, y0, x1, y1 = rect
    sx, sy = W / SRC_W, H / SRC_H
    return int(round(x0 * sx)), int(round(y0 * sy)), int(round(x1 * sx)), int(round(y1 * sy))


def inpaint(rgb: np.ndarray, mask: np.ndarray, iters=400) -> np.ndarray:
    """Fill masked pixels by repeatedly averaging their known neighbours (simple diffusion)."""
    out = rgb.copy()
    known = ~mask
    out[mask] = 0
    for _ in range(iters):
        acc = np.zeros_like(out)
        cnt = np.zeros(mask.shape)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            acc += np.roll(np.roll(out * known[..., None], dy, 0), dx, 1)
            cnt += np.roll(np.roll(known.astype(float), dy, 0), dx, 1)
        fill = mask & (cnt > 0)
        out[fill] = acc[fill] / cnt[fill][:, None]
        known = known | fill
        if known.all():
            pass
    return out


def main():
    card = straighten(Image.open(SCAN).convert('RGB')).resize((W, H), Image.LANCZOS)
    a = np.asarray(card).astype(float) / 255
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / (mx + 1e-6)
    lum = a.mean(2)

    # 3. Erase the printed numerals inside each cartouche's dark interior.
    glyph = np.zeros(lum.shape, bool)
    for rect in CARTOUCHES.values():
        x0, y0, x1, y1 = sc(rect)
        pad = 9  # stay inside the cartouche's silver border
        sub = (lum[y0 + pad:y1 - pad, x0 + pad:x1 - pad] > 0.5) & (sat[y0 + pad:y1 - pad, x0 + pad:x1 - pad] < 0.3)
        glyph[y0 + pad:y1 - pad, x0 + pad:x1 - pad] |= sub
    glyph = np.asarray(Image.fromarray((glyph * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    rgb = inpaint(a, glyph)
    # A touch of blur over the erased areas so the fill reads as the cartouche's dark enamel.
    blurred = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255
    rgb[glyph] = blurred[glyph]

    # 4. Transparent art window, keeping cartouches and the silver dragon over the window edge.
    alpha = np.ones(lum.shape)
    wx0, wy0, wx1, wy1 = sc(WINDOW)
    alpha[wy0:wy1, wx0:wx1] = 0
    for rect in CARTOUCHES.values():
        x0, y0, x1, y1 = sc(rect)
        alpha[y0:y1, x0:x1] = 1
    silver = (sat < 0.16) & (lum > 0.32)
    silver = np.asarray(Image.fromarray((silver * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))) > 0
    for rect in DRAGON_STRIPS:
        x0, y0, x1, y1 = sc(rect)
        alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], silver[y0:y1, x0:x1])
    # Any remaining art (saturated paint) that bleeds past the window into the band goes too; the
    # frame itself is silver/grey (low saturation), so it's untouched.
    ix0, iy0, ix1, iy1 = sc((62, 62, 606, 968))  # just inside the filigree band
    inner = np.zeros(lum.shape, bool)
    inner[iy0:iy1, ix0:ix1] = True
    # The Troll's paint is warm brown: red clearly above green and blue. The frame is neutral.
    warm = (a[..., 0] - a[..., 1] > 0.06) & (a[..., 0] - a[..., 2] > 0.1)
    paint = inner & (((sat > 0.3) & (lum < 0.85)) | warm)
    # Keep only sizeable patches of paint (the scan's colour noise in the band is speckle).
    paint = np.asarray(Image.fromarray((paint * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))) > 0
    paint = np.asarray(Image.fromarray((paint * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    for rect in CARTOUCHES.values():
        x0, y0, x1, y1 = sc(rect)
        paint[y0:y1, x0:x1] = False
    alpha[paint] = 0
    # The Troll's shadowed club overlaps the right band's inner edge: dark pixels there are paint.
    rx0, ry0, rx1, ry1 = sc((582, 330, 606, 480))
    alpha[ry0:ry1, rx0:rx1][lum[ry0:ry1, rx0:rx1] < 0.5] = 0
    # Soften the alpha edge by a pixel so the cut doesn't alias.
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(float) / 255

    # 5. Repair the side bands (iteration 4). Removing the Troll's paint left holes in the band
    #    next to the art window (Joe saw them as a thick dark bar on every card). Underlay the
    #    whole band ring with a clean straight filigree strip taken from the top band between the
    #    cartouches, so any hole shows filigree instead of nothing.
    frame = Image.fromarray((np.dstack([rgb, alpha]) * 255).clip(0, 255).astype(np.uint8), 'RGBA')
    tx0, tx1 = sc((240, 0, 440, 0))[0], sc((240, 0, 440, 0))[2]
    by0, by1 = sc((0, BAND_OUTER[1], 0, WINDOW[1]))[1], sc((0, BAND_OUTER[1], 0, WINDOW[1]))[3]
    strip = frame.crop((tx0, by0, tx1, by1)).convert('RGB').convert('RGBA')  # opaque band texture
    under = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox0, oy0, ox1, oy1 = sc(BAND_OUTER)
    ix0w, iy0w, ix1w, iy1w = sc(WINDOW)
    def tile_h(img, x0, x1, y):
        x = x0
        while x < x1:
            under.paste(img.crop((0, 0, min(img.width, x1 - x), img.height)), (x, y))
            x += img.width
    def tile_v(img, y0, y1, x):
        y = y0
        while y < y1:
            under.paste(img.crop((0, 0, img.width, min(img.height, y1 - y))), (x, y))
            y += img.height
    bh = by1 - by0
    tile_h(strip, ox0, ox1, oy0)                                         # top
    tile_h(strip.transpose(Image.FLIP_TOP_BOTTOM), ox0, ox1, oy1 - bh)   # bottom
    side = strip.rotate(90, expand=True)                                 # vertical band, outer edge left
    tile_v(side, oy0, oy1, ox0)                                          # left
    tile_v(side.transpose(Image.FLIP_LEFT_RIGHT), oy0, oy1, ox1 - bh)    # right
    # The underlay stops at the window so the art still shows there.
    ua = np.asarray(under).copy()
    ua[iy0w:iy1w, ix0w:ix1w, 3] = 0
    under = Image.fromarray(ua, 'RGBA')
    clean = under.copy()
    under.alpha_composite(frame)
    frame = under
    # The right band between the top-right cartouche and the dragon's tail still shows the
    # Troll's fur through the filigree; that stretch is plain band, so use the clean strip there.
    rb = sc((WINDOW[2], CARTOUCHES['tr'][3], BAND_OUTER[2], DRAGON_STRIPS[1][1]))
    frame.paste(clean.crop(rb), rb[:2])

    # 6. Trim the light-grey outer border (iteration 4): the card's edge becomes the silver
    #    filigree's outer edge. The trimmed frame is stretched back to the outline shape W x H
    #    (a small vertical squash of the ornament) so cards still equal their board outlines.
    trim = sc(BAND_OUTER)
    tw, th = trim[2] - trim[0], trim[3] - trim[1]
    frame = frame.crop(trim).resize((W, H), Image.LANCZOS)
    rgba = np.asarray(frame).astype(float) / 255
    alpha = rgba[..., 3].copy()

    # 7. Rounded outer corners (about 4% of the width).
    r = int(round(W * 0.04))
    yy, xx = np.mgrid[0:H, 0:W]
    for cx, cy in ((r, r), (W - r - 1, r), (r, H - r - 1), (W - r - 1, H - r - 1)):
        inx = (xx < r) if cx == r else (xx > W - r - 1)
        iny = (yy < r) if cy == r else (yy > H - r - 1)
        corner = inx & iny & ((xx - cx) ** 2 + (yy - cy) ** 2 > r * r)
        alpha[corner] = 0
    rgba[..., 3] = alpha

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray((rgba * 255).clip(0, 255).astype(np.uint8), 'RGBA').save(OUT_DIR / 'frame.webp', quality=95, method=6)

    def frac(rect):
        x0, y0, x1, y1 = sc(rect)
        return {'x': (x0 - trim[0]) / tw, 'y': (y0 - trim[1]) / th, 'w': (x1 - x0) / tw, 'h': (y1 - y0) / th}

    meta = {
        'source': 'Card Faces - All Types.jpg (Troll card), straightened; numbers erased; window cut out; side bands repaired; grey border trimmed',
        'size': [W, H],
        'window': frac(WINDOW),
        'cartouches': {k: frac(v) for k, v in CARTOUCHES.items()},
        'cornerRadius': r / W,
    }
    (OUT_DIR / 'frame.json').write_text(json.dumps(meta, indent=2) + '\n')
    print('wrote', OUT_DIR / 'frame.webp', OUT_DIR / 'frame.json')


if __name__ == '__main__':
    main()
