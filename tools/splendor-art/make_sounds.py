#!/usr/bin/env python3
"""Synthesize Splendor's sound effects (no external samples) and encode them as small MP3s.

Usage: python make_sounds.py OUT_DIR   (needs numpy, scipy, ffmpeg with libmp3lame)
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, attack=0.002, decay=0.05):
    x = np.arange(n) / SR
    e = np.exp(-x / decay)
    a = int(SR * attack)
    if a:
        e[:a] *= np.linspace(0, 1, a)
    return e


def band(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def clack(pitch=2600, d=0.09, amp=1.0):
    n = int(SR * d)
    noise = band(rng.standard_normal(n), 1500, 7000) * env(n, 0.0005, 0.012)
    ping = (np.sin(2 * np.pi * pitch * t(d)) + 0.5 * np.sin(2 * np.pi * pitch * 1.53 * t(d))) * env(n, 0.0005, 0.03)
    body = np.sin(2 * np.pi * 420 * t(d)) * env(n, 0.001, 0.02)
    return amp * (0.9 * noise + 0.35 * ping + 0.4 * body)


def place(total, parts):
    out = np.zeros(int(SR * total))
    for start, sig in parts:
        i = int(SR * start)
        out[i:i + len(sig)] += sig[: len(out) - i]
    return out


def chip_single():
    return place(0.15, [(0, clack(2700))])


def chip_multi():
    parts = []
    for k in range(5):
        parts.append((k * 0.045 + rng.uniform(0, 0.012), clack(rng.uniform(2300, 3100), amp=rng.uniform(0.6, 1.0))))
    return place(0.4, parts)


def card_slide():
    d = 0.32
    n = int(SR * d)
    x = t(d)
    noise = rng.standard_normal(n)
    # Sweep a band-passed swoosh by mixing two bands with a moving crossfade.
    lo, hi = band(noise, 600, 2500), band(noise, 2000, 6000)
    m = x / d
    sig = (1 - m) * lo + m * hi
    e = np.sin(np.pi * np.clip(x / d, 0, 1)) ** 1.5
    return 0.8 * sig * e


def card_flip():
    d = 0.12
    n = int(SR * d)
    snap = band(rng.standard_normal(n), 1200, 5000) * env(n, 0.0005, 0.018)
    thump = np.sin(2 * np.pi * 180 * t(d)) * env(n, 0.001, 0.03)
    return place(0.16, [(0, 0.6 * band(rng.standard_normal(int(SR * 0.04)), 2000, 6000) * env(int(SR * 0.04), 0.01, 0.015)),
                        (0.035, snap + 0.5 * thump)])


def deck_deal():
    return place(0.42, [(0, 0.7 * card_slide()[: int(SR * 0.22)]), (0.2, card_flip())])


def bell(freq, d, amp=1.0):
    n = int(SR * d)
    x = t(d)
    partials = [(1, 1.0, 1.2), (2.0, 0.5, 0.8), (2.76, 0.35, 0.6), (5.4, 0.15, 0.3)]
    s = sum(a * np.sin(2 * np.pi * freq * r * x) * np.exp(-x / dec) for r, a, dec in partials)
    return amp * s * env(n, 0.003, 10)


def noble_chime():
    return place(1.0, [(0, bell(1046.5, 0.9, 0.6)), (0.09, bell(1318.5, 0.85, 0.5)), (0.18, bell(1568, 0.8, 0.5))])


def turn_tick():
    n = int(SR * 0.08)
    return place(0.1, [(0, (np.sin(2 * np.pi * 1500 * t(0.08)) + 0.3 * np.sin(2 * np.pi * 3000 * t(0.08))) * env(n, 0.001, 0.015))])


def brass(freq, d, amp=1.0):
    n = int(SR * d)
    x = t(d)
    s = sum((1 / k) * np.sin(2 * np.pi * freq * k * x + 0.3 * k) for k in range(1, 8))
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * x)
    s = s * vib
    a = np.minimum(1, x / 0.03) * np.exp(-np.maximum(0, x - d * 0.6) / 0.15)
    return amp * band(s, 150, 5000, 2) * a


def fanfare():
    notes = [(0.0, 523.25, 0.18), (0.18, 659.25, 0.18), (0.36, 783.99, 0.18), (0.56, 1046.5, 0.9)]
    parts = [(s, brass(f, d, 0.55)) for s, f, d in notes]
    parts += [(0.56, brass(783.99, 0.9, 0.3)), (0.56, brass(659.25, 0.9, 0.3)), (0.56, bell(2093, 1.2, 0.15))]
    return place(1.9, parts)


SOUNDS = {
    'chip-single': chip_single, 'chip-multi': chip_multi, 'card-slide': card_slide, 'card-flip': card_flip,
    'deck-deal': deck_deal, 'noble-chime': noble_chime, 'turn-tick': turn_tick, 'fanfare': fanfare,
}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, fn in SOUNDS.items():
        sig = fn()
        sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.7  # normalize to a modest level
        fade = min(len(sig), int(SR * 0.01))
        sig[-fade:] *= np.linspace(1, 0, fade)
        with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
            wavfile.write(tmp.name, SR, (sig * 32767).astype(np.int16))
            dst = os.path.join(out, name + '.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', dst], check=True)
        print(f'{name}.mp3: {os.path.getsize(dst)//1024} KB, {len(sig)/SR:.2f}s')
