#!/usr/bin/env python3
"""Cut out raw ComfyUI gem renders into tools/splendor-art/originals/gems/<gem>.webp.

Same recipe as process_assets.gems() (rembg isnet + alpha matting, faint-alpha cleanup, fit in a
448 box on a 512 canvas). Then run brighten_gems.py to produce the shipped gems.

Usage: python cut_gems.py gem=raw.png [gem=raw.png ...]   (rembg venv, e.g. /tmp/rembgenv)
Play-test round 2 (spec 1793147156389): gold=r2-gold-404, blue=r2-blue-202, black=r2-blackB-515
(prompts and seeds in jobs-round2-gems.json).
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'originals', 'gems')
sess = new_session('isnet-general-use')
for arg in sys.argv[1:]:
    gem, raw = arg.split('=', 1)
    src = Image.open(raw).convert('RGB')
    cut = remove(src, session=sess, alpha_matting=True, alpha_matting_foreground_threshold=240,
                 alpha_matting_background_threshold=20, alpha_matting_erode_size=6)
    a = np.asarray(cut.split()[-1])
    a = np.where(a < 40, 0, a).astype('uint8')
    cut.putalpha(Image.fromarray(a).filter(ImageFilter.GaussianBlur(0.6)))
    cut = cut.crop(cut.getbbox())
    cut.thumbnail((448, 448), Image.LANCZOS)
    canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    canvas.paste(cut, ((512 - cut.width) // 2, (512 - cut.height) // 2), cut)
    canvas.save(os.path.join(OUT, f'{gem}.webp'), 'WEBP', quality=85, method=6)
    print(gem, 'ok')
