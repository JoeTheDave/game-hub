"""Brighten and normalise the six gem images (Splendor iteration 2).

Reads the untouched generated gems from tools/splendor-art/originals/gems/ and writes
client/src/games/splendor/assets/gems/<gem>.webp, so it is idempotent: re-running never
compounds the adjustment.

Per gem: lift brightness/saturation/contrast plus a gentle gamma lift (the white diamond was
already clear and only gets a touch of contrast), then crop to the visible stone and re-centre
it so every gem's farthest opaque pixel sits on the same circle (RADIUS of the canvas). Fitting
the stone's real silhouette into a circle means any shape fills a round token without its
corners clipping, round stones aren't under-sized, and all gems read at the same visual size on
cards, tokens and chips.

Usage:  python3 tools/splendor-art/brighten_gems.py
"""
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/splendor-art/originals/gems"
DST = ROOT / "client/src/games/splendor/assets/gems"
CANVAS = 512
RADIUS = 0.475  # farthest opaque pixel from centre, as a fraction of the canvas side

# brightness, colour (saturation), contrast, gamma (<1 lifts mid-tones)
ADJUST = {
    "white": (1.00, 1.00, 1.06, 1.00),
    "blue": (1.50, 1.12, 1.04, 0.75),
    "green": (1.32, 1.15, 1.08, 0.85),
    "red": (1.45, 1.15, 1.08, 0.80),
    "black": (1.50, 0.80, 1.18, 0.82),
    "gold": (1.18, 1.12, 1.06, 0.90),
}


def adjust(im: Image.Image, b: float, c: float, k: float, g: float) -> Image.Image:
    alpha = im.getchannel("A")
    rgb = im.convert("RGB")
    if g != 1.0:
        lut = [round(255 * (i / 255) ** g) for i in range(256)]
        rgb = rgb.point(lut * 3)
    rgb = ImageEnhance.Brightness(rgb).enhance(b)
    rgb = ImageEnhance.Color(rgb).enhance(c)
    rgb = ImageEnhance.Contrast(rgb).enhance(k)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def silhouette_radius(stone: Image.Image) -> float:
    """Distance from the stone's centre to its farthest opaque pixel."""
    a = stone.getchannel("A")
    w, h = stone.size
    cx, cy = (w - 1) / 2, (h - 1) / 2
    px = a.load()
    r2 = 0.0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] > 40:
                r2 = max(r2, (x - cx) ** 2 + (y - cy) ** 2)
    return r2 ** 0.5


def normalise(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    stone = im.crop(bbox)
    w, h = stone.size
    scale = RADIUS * CANVAS / silhouette_radius(stone)
    stone = stone.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(stone, ((CANVAS - stone.width) // 2, (CANVAS - stone.height) // 2), stone)
    return canvas


def main() -> None:
    for gem, params in ADJUST.items():
        im = Image.open(SRC / f"{gem}.webp").convert("RGBA")
        out = normalise(adjust(im, *params))
        out.save(DST / f"{gem}.webp", "WEBP", quality=88, method=6)
        print(f"{gem}: {(DST / f'{gem}.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
