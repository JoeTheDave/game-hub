#!/usr/bin/env python3
"""Clean Joe's card kanji (black brush calligraphy on white) into transparent ink.

Source: Joe's original Onitama repo (github.com/JoeTheDave/onitama), app/assets/complete/_<card>.*
Usage: python3 make_kanji.py <complete_dir> <out_dir> [--sheet sheet.png]
- alpha comes from darkness (white -> transparent), ink is a warm near-black
- each glyph is trimmed, upscaled with Lanczos (sources are ~200-950 px) and lightly
  re-sharpened, then centred on a canvas with consistent 6% padding, 512 px tall
"""
import os
import sys

from PIL import Image, ImageFilter, ImageOps

# card slug -> source file. Variants: giraffe uses _mod (single clean glyph run); rabbit uses the .png
# (兔; the .gif is actually 虎, tiger); elephant uses the original (the _mod is identical in shape).
SOURCES = {
    'dragon': '_dragon.png', 'giraffe': '_giraffe_mod.png', 'panda': '_panda.png', 'tiger': '_tiger.png',
    'rat': '_rat.png', 'viper': '_viper.png', 'eel': '_eel.png', 'fox': '_fox.png', 'dog': '_dog.jpg',
    'ox': '_ox.gif', 'sea-snake': '_seasnake.png', 'bear': '_bear.jpg', 'rabbit': '_rabbit.png',
    'cobra': '_cobra.jpg', 'phoenix': '_phoenix.png', 'mouse': '_mouse.png', 'boar': '_boar.png',
    'iguana': '_iguana.png', 'crane': '_crane.png', 'frog': '_frog.png', 'crab': '_crab.png',
    'elephant': '_elephant.png', 'sable': '_sable.png', 'goose': '_goose.png', 'tanuki': '_tanuki.jpg',
    'horse': '_horse.jpg', 'monkey': '_monkey.png', 'mantis': '_mantis.png', 'rooster': '_rooster.png',
    'otter': '_otter.png', 'kirin': '_kirin.png', 'turtle': '_turtle.png',
}
INK = (24, 20, 18)
H = 512
PAD = 0.06


def clean(path):
    im = Image.open(path)
    if im.mode in ('P', 'LA', 'RGBA'):
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    g = ImageOps.grayscale(im.convert('RGB'))
    # darkness -> alpha with a soft knee so anti-aliased edges survive
    a = g.point(lambda v: 0 if v > 235 else 255 if v < 70 else int((235 - v) * 255 / 165))
    box = a.point(lambda v: 255 if v > 40 else 0).getbbox()
    a = a.crop(box)
    inner_h = int(H * (1 - 2 * PAD))
    scale = inner_h / a.height
    w = max(1, int(a.width * scale))
    a = a.resize((w, inner_h), Image.LANCZOS)
    if scale > 1.5:
        a = a.filter(ImageFilter.GaussianBlur(scale * 0.35)).point(lambda v: 0 if v < 60 else 255 if v > 190 else int((v - 60) * 255 / 130))
    W = int(w + 2 * H * PAD)
    out = Image.new('RGBA', (W, H), INK + (0,))
    layer = Image.new('RGBA', (w, inner_h), INK + (255,))
    layer.putalpha(a)
    out.alpha_composite(layer, (int(H * PAD), int(H * PAD)))
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    outs = {}
    for slug, f in SOURCES.items():
        im = clean(os.path.join(src, f))
        im.save(os.path.join(dst, f'{slug}.webp'), 'WEBP', quality=90, method=6)
        outs[slug] = im
    if '--sheet' in sys.argv:
        sheet = Image.new('RGB', (8 * 220, 4 * 140), (233, 220, 190))
        for i, (slug, im) in enumerate(outs.items()):
            t = im.copy(); t.thumbnail((210, 128))
            sheet.paste(t, ((i % 8) * 220 + 5, (i // 8) * 140 + 6), t)
        sheet.save(sys.argv[sys.argv.index('--sheet') + 1])


if __name__ == '__main__':
    main()
