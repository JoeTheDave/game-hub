"""Build the Onitama board-top texture (iteration 2): a calm washi surface with a faint sumi-e band.

The original repo mural stretched to a square and read as busy (Joe, 2026-10-28). This replaces
it with:
- warm washi paper (assets/parchment.webp, a seamless 1024 tile) tiled 2x2 at its true aspect
- a faint ink-wash landscape (assets/mat.webp, centre-square crop so it is never stretched) that
  shows around the margins and fades out under the play area, so the grid reads cleanly
- a soft paper vignette

Borders, card-slot frames, the grid and the yin-yangs are drawn in code on top
(client/src/games/onitama/three/scene.ts), so they always match the geometry.

The play-area mask uses the repo board layout (1600 px board; grid at 580,330, 940 px square),
mapped to the 2048 px texture (K = 2048/1600). Keep it in sync with three/geometry.ts.

Usage: python3 make_board.py            -> writes assets/board-top.webp
       python3 make_board.py --mock out.png  -> also writes a top-down layout mock for eye checks
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', '..', 'client', 'src', 'games', 'onitama', 'assets')
TEX = 2048
K = TEX / 1600

GRID = (580, 330, 940)  # x, y, size in board px
CARD_SLOTS = [(600, 1300), (1100, 1300), (140, 670), (600, 40), (1100, 40)]  # 400x260 each


def k(v):
    return int(round(v * K))


def washi():
    tile = Image.open(os.path.join(ASSETS, 'parchment.webp')).convert('RGB')
    tile = tile.resize((TEX // 2, TEX // 2), Image.LANCZOS)
    base = Image.new('RGB', (TEX, TEX))
    for x in (0, TEX // 2):
        for y in (0, TEX // 2):
            base.paste(tile, (x, y))
    # Lift it slightly toward a warm off-white so the slab reads light and calm.
    return Image.blend(base, Image.new('RGB', (TEX, TEX), (241, 233, 215)), 0.25)


def landscape():
    mat = Image.open(os.path.join(ASSETS, 'mat.webp')).convert('RGB')
    s = min(mat.size)
    left = (mat.width - s) // 2
    sq = mat.crop((left, 0, left + s, s)).resize((TEX, TEX), Image.LANCZOS)
    sq = sq.filter(ImageFilter.GaussianBlur(1.2))
    # Soften toward ink wash: mostly desaturated, keeping a hint of the maple red.
    grey = ImageOps.grayscale(sq).convert('RGB')
    return Image.blend(sq, grey, 0.55)


def margin_mask():
    """Alpha for the landscape: present around the margins, nearly gone under the play area."""
    m = Image.new('L', (TEX, TEX), 112)  # ~44% in the margins
    d = ImageDraw.Draw(m)
    gx, gy, gs = GRID
    pad = 70
    d.rounded_rectangle((k(gx - pad), k(gy - pad), k(gx + gs + pad), k(gy + gs + pad)), radius=k(60), fill=12)
    # Calm the strips under the card rows too (cards cover them, but their edges show).
    for (x, y) in CARD_SLOTS:
        d.rounded_rectangle((k(x - 30), k(y - 30), k(x + 430), k(y + 290)), radius=k(30), fill=40)
    return m.filter(ImageFilter.GaussianBlur(k(70)))


def vignette():
    v = Image.new('L', (TEX, TEX), 0)
    d = ImageDraw.Draw(v)
    d.rectangle((0, 0, TEX, TEX), fill=70)
    d.rounded_rectangle((k(60), k(60), TEX - k(60), TEX - k(60)), radius=k(120), fill=0)
    return v.filter(ImageFilter.GaussianBlur(k(90)))


def build():
    base = washi()
    land = landscape()
    # Multiply the landscape onto the paper (ink soaks into washi), weighted by the margin mask.
    soaked = ImageChops.multiply(base, land)
    out = Image.composite(soaked, base, margin_mask())
    # Paper vignette: a touch darker and warmer at the very edge.
    edge = Image.new('RGB', (TEX, TEX), (150, 128, 96))
    out = Image.composite(ImageChops.multiply(out, edge), out, vignette())
    return out


def mock(top):
    """Top-down layout preview: grid, card slots, yin-yangs and borders as the scene draws them."""
    img = top.copy()
    d = ImageDraw.Draw(img, 'RGBA')
    red = (119, 0, 0, 255)
    for m in (10, 20):
        d.rectangle((k(m), k(m), TEX - k(m), TEX - k(m)), outline=red, width=max(2, k(3)))
    for (x, y) in CARD_SLOTS:
        d.rectangle((k(x + 4), k(y + 4), k(x + 396), k(y + 256)), outline=red, width=k(6))
        d.rectangle((k(x + 10), k(y + 10), k(x + 390), k(y + 250)), fill=(232, 222, 196, 255))
    gx, gy, _ = GRID
    for r in range(5):
        for c in range(5):
            x, y = gx + c * 188 + 2, gy + r * 188 + 2
            d.rectangle((k(x), k(y), k(x + 184), k(y + 184)), fill=(255, 252, 244, 70), outline=(40, 30, 20, 150), width=k(2))
    yy = Image.open(os.path.join(ASSETS, 'repo', 'ying-yang.webp')).convert('RGBA')
    for (cx, cy, s) in ((1050, 800, 300), (1050, 420, 100), (1050, 1175, 100)):
        y2 = yy.resize((k(s), k(s)))
        img.paste(y2, (k(cx - s / 2), k(cy - s / 2)), y2)
    return img


if __name__ == '__main__':
    top = build()
    out = os.path.join(ASSETS, 'board-top.webp')
    top.save(out, 'WEBP', quality=90, method=6)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')
    if '--mock' in sys.argv:
        p = sys.argv[sys.argv.index('--mock') + 1]
        mock(top).resize((1024, 1024), Image.LANCZOS).save(p)
        print('mock', p)
