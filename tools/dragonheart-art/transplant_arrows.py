"""Transplant the Knight->Sorceress and Troll->Sorceress arrows from Joe's arrow reference onto his board.

Joe's board (vault `Board Art/Board - Joe v2.png`) has no arrows into the Sorceress. Another tool
repainted the board with gold arrows (vault `Board Art/Board - Arrow Reference (other agent).png`,
2167x726) but subtly altered the rest of the image. This copies ONLY the arrow pixels:
- aligns the reference to the board (no rescale; offset dx=-3, dy=1, found by edge correlation)
- masks a 14 px band along each arrow's traced path plus a 32 px head disc, intersected with pixels that differ
  (a lower threshold for the dark outline pixels, which can sit over dark rock)
- keeps 4 px clear of every outline, so the card clips stay byte-identical
- feathers the mask 0.8 px and composites. Everything outside the mask is pixel-identical.

Usage: python3 transplant_arrows.py <board.png> <reference.png> <out.png>
Then: python3 clip_cards.py <out.png>
"""
import sys
import numpy as np, json
from PIL import Image, ImageDraw, ImageFilter
orig=Image.open(sys.argv[1]).convert('RGB')
ref=Image.open(sys.argv[2]).convert('RGB')
W,H=orig.size
dx,dy=-3,1
A=Image.new('RGB',(W,H)); A.paste(ref,(-dx,-dy))
O=np.asarray(orig,dtype=np.float32); R=np.asarray(A,dtype=np.float32)
diff=np.abs(O-R).sum(2)
def bez(p0,p1,p2,n=60):
    return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0],(1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]) for t in np.linspace(0,1,n)]
paths={'knight':((1213,326),(1238,262),(1330,249)),'troll':((1663,330),(1640,262),(1565,249))}
band=Image.new('L',(W,H),0); d=ImageDraw.Draw(band)
for p in paths.values():
    pts=bez(*p); d.line(pts,fill=255,width=14)
    # head: a wider disc pulled back along the shaft, so both barbs (and their outlines) are covered
    tx,ty=p[2][0]-p[1][0],p[2][1]-p[1][1]; n=(tx*tx+ty*ty)**0.5; cx,cy=p[2][0]-tx/n*12,p[2][1]-ty/n*12
    d.ellipse((cx-32,cy-32,cx+32,cy+32),fill=255)
band=np.asarray(band)>0
# keep away from outline frames
g=json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','..','client','src','games','dragonheart','boardGeometry.json')))
keepout=np.zeros((H,W),bool)
for sp in g['spaces'].values():
    for r in sp['outlines']:
        x0=int(r['x']*W); y0=int(r['y']*H); x1=int((r['x']+r['w'])*W); y1=int((r['y']+r['h'])*H)
        keepout[max(0,y0-4):y1+4,max(0,x0-4):x1+4]=True
lum=R.mean(2)
# The arrows' dark outlines can sit over dark rock, where they differ only slightly from the
# board, so a dark reference pixel counts with a lower difference threshold.
m=band&((diff>35)|((lum<75)&(diff>12)))&~keepout
mi=Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
alpha=np.asarray(mi,dtype=np.float32)[...,None]/255
out=(O*(1-alpha)+R*alpha).astype(np.uint8)
Image.fromarray(out).save(sys.argv[3])
