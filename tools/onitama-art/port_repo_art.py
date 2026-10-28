"""Port Joe's original Onitama art (github.com/JoeTheDave/onitama) into GameHub assets.

- old/src/components/svg/*.js (React SVG components: the animal art per card, Swish, MasterIcon,
  Logo) become standalone .svg files in client/src/games/onitama/assets/repo/svg/, with the JSX
  expressions replaced by fixed values (the repo's own colours).
- app/assets/*.{jpg,png} (mural, yin-yangs, card/board textures, ink-fighter decorations, logo)
  become WebP in client/src/games/onitama/assets/repo/.

Usage: python3 tools/onitama-art/port_repo_art.py /path/to/onitama-checkout
"""
import os
import re
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'src', 'games', 'onitama', 'assets', 'repo')
CHARACTER = 'rgba(100,100,100,0.6)'  # the repo's colors.characterColor
OPAQUE_WHITE = 'rgba(255,255,255,0.4)'


def slug(name: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '-', name).lower()  # SeaSnake -> sea-snake


def port_svg(src: str, name: str) -> str:
    js = open(src).read()
    m = re.search(r'<svg[\s\S]*?</svg>', js)
    if not m:
        raise SystemExit(f'no <svg> in {src}')
    svg = m.group(0)
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1).split()
    w, h = float(vb[2]), float(vb[3])
    svg = re.sub(r'\s(width|height)=\{`[^`]*`\}', '', svg)  # template literals: {`${w}px`}
    svg = re.sub(r'\s(width|height)=\{[^}]*\}', '', svg)
    svg = re.sub(r'\s(width|height)="[^"]*"', '', svg)
    svg = re.sub(r'\sstyle=\{\{[^}]*\}\}', '', svg)
    svg = svg.replace('fill={fillColor}', f'fill="{CHARACTER}"')
    svg = svg.replace('fill={colors.opaqueWhite}', f'fill="{OPAQUE_WHITE}"')
    svg = svg.replace('<svg ', f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}" ', 1)
    leftover = re.findall(r'=\{[^}]*\}', svg)
    if leftover:
        raise SystemExit(f'unconverted JSX in {name}: {leftover[:3]}')
    svg = re.sub(r'\s+', ' ', svg)
    return svg


def main():
    repo = sys.argv[1]
    os.makedirs(os.path.join(ROOT, 'svg'), exist_ok=True)
    svgdir = os.path.join(repo, 'old', 'src', 'components', 'svg')
    for f in sorted(os.listdir(svgdir)):
        if not f.endswith('.js') or f in ('index.js', 'NotFound.js'):
            continue
        name = f[:-3]
        out = os.path.join(ROOT, 'svg', slug(name) + '.svg')
        open(out, 'w').write(port_svg(os.path.join(svgdir, f), name))
    assets = os.path.join(repo, 'app', 'assets')
    jobs = {
        'mural.jpg': ('mural.webp', None),
        'ying-yang.png': ('ying-yang.webp', 512),
        'ying-yang-red.png': ('ying-yang-red.webp', 512),
        'ying-yang-blue.png': ('ying-yang-blue.webp', 512),
        'card-texture.png': ('card-texture.webp', None),
        'board-background-texture.png': ('board-texture.webp', None),
        'abstract-background-decoration-one.jpg': ('ink-fighters-one.webp', None),
        'abstract-background-decoration-two.jpg': ('ink-fighters-two.webp', None),
        'onitama-logo.png': ('logo.webp', None),
    }
    for src, (dst, size) in jobs.items():
        im = Image.open(os.path.join(assets, src))
        im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
        if size:
            im = im.resize((size, size), Image.LANCZOS)
        im.save(os.path.join(ROOT, dst), 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    main()
