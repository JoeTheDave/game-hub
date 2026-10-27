"""Paint the two missing collection arrows onto Joe's board image.

The board Joe supplied has no arrows into the Sorceress space, although both the Knight and
the Troll collect from it (rulebook p.3). This draws them in the style of the board's curved
silver arrows (a tapered metallic shaft with a notched chevron head and a soft shadow), between
the outlines so no card art is touched.

Usage: python3 add_arrows.py <board.png> <out.png> [--preview preview.png]
Then run clip_cards.py on <out.png> (the arrows sit outside every outline, so the card clips
are unchanged; only the panorama gains the arrows).
"""
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor

# (start, control, end) in board pixels (2172x724). Each runs from the gap above the collecting
# space toward the Sorceress outline's nearest lower edge, bowing gently like the board's arrows.
ARROWS = [
    ((1242, 322), (1262, 256), (1330, 242)),  # Knight -> Sorceress (up and to the right)
    ((1646, 322), (1626, 256), (1568, 242)),  # Troll -> Sorceress (up and to the left)
]


def bezier(p0, p1, p2, t):
    a = (1 - t) ** 2
    b = 2 * (1 - t) * t
    c = t ** 2
    return (a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1])


def tangent(p0, p1, p2, t):
    dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    n = math.hypot(dx, dy) or 1
    return dx / n, dy / n


def arrow_polys(p0, p1, p2, head_len=34.0, head_w=17.0, tail_w=1.6, neck_w=7.0):
    """Shaft polygon (tapering from tail to neck) and a notched chevron head, in board px."""
    total = 0.0
    prev = p0
    for i in range(1, 101):
        q = bezier(p0, p1, p2, i / 100)
        total += math.hypot(q[0] - prev[0], q[1] - prev[1])
        prev = q
    t_neck = max(0.0, 1 - head_len * 0.7 / total)
    left, right = [], []
    steps = 60
    for i in range(steps + 1):
        t = t_neck * i / steps
        x, y = bezier(p0, p1, p2, t)
        tx, ty = tangent(p0, p1, p2, t)
        w = (tail_w + (neck_w - tail_w) * (i / steps) ** 0.8) / 2
        left.append((x - ty * w, y + tx * w))
        right.append((x + ty * w, y - tx * w))
    shaft = left + right[::-1]
    tip = p2
    tx, ty = tangent(p0, p1, p2, 1.0)
    base = (tip[0] - tx * head_len, tip[1] - ty * head_len)
    notch = (tip[0] - tx * head_len * 0.62, tip[1] - ty * head_len * 0.62)
    head = [
        tip,
        (base[0] - ty * head_w, base[1] + tx * head_w),
        notch,
        (base[0] + ty * head_w, base[1] - tx * head_w),
    ]
    return shaft, head


def paint(board):
    w, h = board.size
    big = (w * SS, h * SS)
    shadow = Image.new('L', big, 0)
    edge = Image.new('L', big, 0)
    fill = Image.new('L', big, 0)
    shine = Image.new('L', big, 0)
    ds, de, df, dh = (ImageDraw.Draw(m) for m in (shadow, edge, fill, shine))
    sc = lambda pts, dx=0.0, dy=0.0: [((x + dx) * SS, (y + dy) * SS) for x, y in pts]
    for p0, p1, p2 in ARROWS:
        shaft, head = arrow_polys(p0, p1, p2)
        for poly in (shaft, head):
            ds.polygon(sc(poly, 2.0, 2.5), fill=150)
            de.polygon(sc(poly), fill=255)
        # inner fill: the same shapes, slightly thinner, for a dark metallic rim
        shaft_i, head_i = arrow_polys(p0, p1, p2, head_len=31.0, head_w=14.0, tail_w=0.7, neck_w=4.6)
        df.polygon(sc(shaft_i), fill=255)
        df.polygon(sc(head_i), fill=255)
        # a thin highlight along the shaft's upper side for a polished look
        shaft_h, _ = arrow_polys(p0, p1, p2, head_len=34, head_w=0, tail_w=0.3, neck_w=1.6)
        dh.polygon(sc(shaft_h, -0.6, -0.8), fill=255)
    down = lambda m, blur=0: (m.filter(ImageFilter.GaussianBlur(blur * SS)) if blur else m).resize((w, h), Image.LANCZOS)
    out = board.convert('RGBA')
    out.alpha_composite(Image.merge('RGBA', (*[Image.new('L', (w, h), 20)] * 3, down(shadow, 1.6).point(lambda v: v * 0.55))))
    out.alpha_composite(Image.merge('RGBA', (Image.new('L', (w, h), 92), Image.new('L', (w, h), 98), Image.new('L', (w, h), 108), down(edge))))
    out.alpha_composite(Image.merge('RGBA', (Image.new('L', (w, h), 214), Image.new('L', (w, h), 220), Image.new('L', (w, h), 228), down(fill))))
    out.alpha_composite(Image.merge('RGBA', (Image.new('L', (w, h), 252), Image.new('L', (w, h), 253), Image.new('L', (w, h), 255), down(shine).point(lambda v: v * 0.85))))
    return out.convert('RGB')


def main():
    src, dst = sys.argv[1], sys.argv[2]
    board = Image.open(src).convert('RGB')
    out = paint(board)
    out.save(dst)
    if '--preview' in sys.argv:
        prev = sys.argv[sys.argv.index('--preview') + 1]
        out.crop((1150, 180, 1760, 420)).resize((1220, 480), Image.LANCZOS).save(prev)


if __name__ == '__main__':
    main()
