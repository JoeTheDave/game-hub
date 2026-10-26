#!/usr/bin/env python3
"""Prepare img2img inputs from the vault scans of Joe's Dragonheart copy (iteration 1).

The scans never ship. This script writes intermediate inputs to a scratch directory only.
Run it with the ComfyUI venv, which has OpenCV and SciPy:

    ~/ai/ComfyUI/venv/bin/python tools/dragonheart-art/prep_scans.py /tmp/dh2

Outputs in OUT_DIR:
  board_clean.png    the three board scans registered with SIFT and a partial affine (rotation,
                     scale, translation), feather-blended, cropped to the board, with the fold
                     creases flattened and inpainted. boardGeometry.json is measured in this frame.
  cardsrc/<kind>.png each card's painting: deskewed, with the frame, corner value squares and
                     dragon edge motif inpainted, then centre-cropped to the 0.714 card-art aspect.
  backsrc_<deck>.png the inner art of the green and red card backs (deskewed).
"""
import os, sys
import cv2
import numpy as np
from scipy.ndimage import median_filter

VAULT = '/home/joe/obsidian-vault/Projects/game-hub/Dragonheart'
CARD_ORDER = ['dwarf', 'knight', 'huntress', 'treasure', 'fireDragon', 'sorceress', 'petrified', 'ship', 'troll']
CREASES = (2220, 3508, 4464)        # fold lines, as x in the cropped board
BOARD_CROP = (300, 2550, 0, 6695)   # y0, y1, x0, x1 in the stitched canvas


def stitch_board(out):
    parts = []
    for i in (1, 2, 3):
        img = cv2.imread(f'{VAULT}/Board Scans/Board - Part 0{i}.jpg')
        parts.append(cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE))
    sift = cv2.SIFT_create(8000)
    feats = [sift.detectAndCompute(cv2.cvtColor(p, cv2.COLOR_BGR2GRAY), None) for p in parts]
    bf = cv2.BFMatcher()
    T = [np.eye(3)]
    for k in (1, 2):
        kpA, dA = feats[k - 1]; kpB, dB = feats[k]
        good = [a for a, b in bf.knnMatch(dB, dA, k=2) if a.distance < 0.7 * b.distance]
        src = np.float32([kpB[g.queryIdx].pt for g in good]); dst = np.float32([kpA[g.trainIdx].pt for g in good])
        M, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
        T.append(T[k - 1] @ np.vstack([M, [0, 0, 1]]))
    corners = []
    for p, t in zip(parts, T):
        h, w = p.shape[:2]
        corners.append((t @ np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]]).T)[:2].T)
    allc = np.vstack(corners); mn = allc.min(0); mx = allc.max(0)
    off = np.array([[1, 0, -mn[0]], [0, 1, -mn[1]], [0, 0, 1]])
    W, H = int(np.ceil(mx[0] - mn[0])), int(np.ceil(mx[1] - mn[1]))
    acc = np.zeros((H, W, 3), np.float32); wsum = np.zeros((H, W), np.float32)
    for p, t in zip(parts, T):
        M = (off @ t)[:2]
        warped = cv2.warpAffine(p, M, (W, H), flags=cv2.INTER_LINEAR)
        gray = cv2.cvtColor(p, cv2.COLOR_BGR2GRAY)
        white = cv2.morphologyEx((gray > 225).astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
        _, lab = cv2.connectedComponents(white)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        valid = (~np.isin(lab, list(border))).astype(np.uint8)
        valid = cv2.morphologyEx(valid, cv2.MORPH_OPEN, np.ones((25, 25), np.uint8))
        valid = cv2.erode(valid, np.ones((21, 21), np.uint8))
        dist = np.minimum(cv2.distanceTransform(valid, cv2.DIST_L2, 5), 400)
        wt = cv2.warpAffine(dist, M, (W, H), flags=cv2.INTER_LINEAR)
        acc += warped.astype(np.float32) * wt[..., None] ** 2; wsum += wt ** 2
    board = (acc / np.maximum(wsum, 1e-6)[..., None]).clip(0, 255).astype(np.uint8)
    y0, y1, x0, x1 = BOARD_CROP
    im = board[y0:y1, x0:x1].astype(np.float32)
    # Flatten each fold's narrow shading band, then even out the brightness step across it.
    for c in CREASES:
        for ch in range(3):
            band = im[:, c - 120:c + 120, ch]
            for y in range(0, im.shape[0], 150):
                cm = band[y:y + 150].mean(0)
                w = np.zeros_like(cm); w[60:180] = 1
                im[y:y + 150, c - 120:c + 120, ch] -= (cm - median_filter(cm, size=101, mode='nearest')) * w
    im = im.clip(0, 255).astype(np.uint8)
    m = np.zeros(im.shape[:2], np.uint8)
    for c, r in zip(CREASES, (12, 8, 16)):
        m[:, c - r:c + r + 1] = 255
    im = cv2.inpaint(im, m, 7, cv2.INPAINT_NS).astype(np.float32)
    R = 160
    for c in CREASES:
        t = (np.arange(c - R, c + R) - c) / R
        w = np.where(t < 0, 0.5 * (1 + t), -0.5 * (1 - t))
        for y in range(0, im.shape[0], 60):
            blk = im[y:y + 60]
            d = blk[:, c + 20:c + 70].reshape(-1, 3).mean(0) - blk[:, c - 70:c - 20].reshape(-1, 3).mean(0)
            im[y:y + 60, c - R:c + R] += w[None, :, None] * d[None, None, :]
    cv2.imwrite(os.path.join(out, 'board_clean.png'), im.clip(0, 255).astype(np.uint8))


def deskewed_cards(path):
    im = cv2.imread(path)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    m = cv2.morphologyEx((g < 235).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnts = [c for c in cnts if cv2.contourArea(c) > 200000]
    cnts.sort(key=lambda c: (round(cv2.boundingRect(c)[1] / 800), cv2.boundingRect(c)[0]))
    out = []
    for c in cnts:
        (cx, cy), (w, h), ang = cv2.minAreaRect(c)
        a = ang % 90
        if a > 45:
            a -= 90
        W, H = sorted([w, h])
        rot = cv2.warpAffine(im, cv2.getRotationMatrix2D((cx, cy), a, 1.0), (im.shape[1], im.shape[0]),
                             flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
        out.append(cv2.getRectSubPix(rot, (int(W), int(H)), (cx, cy)))
    return out


def card_sources(out):
    os.makedirs(os.path.join(out, 'cardsrc'), exist_ok=True)
    for name, im in zip(CARD_ORDER, deskewed_cards(f'{VAULT}/Card Scans/Card Faces - All Types.jpg')):
        h, w = im.shape[:2]
        m = np.zeros((h, w), np.uint8)
        for x0, y0, x1, y1 in ((.09, .06, .28, .20), (.72, .06, .92, .20), (.08, .79, .27, .95), (.70, .79, .92, .95),
                               (.08, .06, .17, .48), (.81, .50, .92, .95)):
            m[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 255
        clean = cv2.inpaint(im, m, 21, cv2.INPAINT_TELEA)
        art = clean[int(.095 * h):int(.915 * h), int(.14 * w):int(.85 * w)]
        ah, aw = art.shape[:2]; th = int(aw / 0.714); top = max(0, (ah - th) // 2)
        cv2.imwrite(os.path.join(out, 'cardsrc', f'{name}.png'), art[top:top + th])
    red, green = deskewed_cards(f'{VAULT}/Card Scans/Card Backs - Green and Red.jpg')[:2]
    for deck, im in (('green', green), ('red', red)):
        h, w = im.shape[:2]
        cv2.imwrite(os.path.join(out, f'backsrc_{deck}.png'),
                    im[int(.068 * h):int(.936 * h), int(.115 * w):int(.882 * w)])


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dh2'
    os.makedirs(out, exist_ok=True)
    stitch_board(out)
    card_sources(out)
    print('wrote', out)
