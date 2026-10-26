#!/usr/bin/env python3
"""Synthesize Dragonheart's sound effects (no external samples) and encode them as small MP3s.

Design goal (docs/ADDING-A-GAME.md section 8, from Splendor play-tests): soft and natural, never jarring.
Every sound has a rounded attack (5-15 ms), is low-passed (no harsh highs or white-noise
bursts), and is normalized to a quiet peak (about -12 dBFS). The table also plays them at
reduced gain in code.

Usage: python make_sounds.py OUT_DIR   (needs numpy, scipy, ffmpeg with libmp3lame)
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
PEAK = 10 ** (-12 / 20)  # -12 dBFS
rng = np.random.default_rng(11)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, attack=0.008, decay=0.05):
    """Rounded attack (raised-cosine) into an exponential decay."""
    x = np.arange(n) / SR
    e = np.exp(-x / decay)
    a = max(1, int(SR * attack))
    a = min(a, n)
    e[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    return e


def lowpass(x, hz, order=4):
    return sosfilt(butter(order, hz, btype='low', fs=SR, output='sos'), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, btype='high', fs=SR, output='sos'), x)


def place(total, parts):
    out = np.zeros(int(SR * total))
    for start, sig in parts:
        i = int(SR * start)
        out[i:i + len(sig)] += sig[: max(0, len(out) - i)]
    return out


def clay_click(pitch=1500, d=0.09, amp=1.0):
    """A soft ceramic/clay chip touching another: a damped low ping with a muted body."""
    n = int(SR * d)
    x = t(d)
    ping = (np.sin(2 * np.pi * pitch * x) + 0.35 * np.sin(2 * np.pi * pitch * 2.31 * x)) * env(n, 0.005, 0.022)
    body = np.sin(2 * np.pi * pitch * 0.32 * x) * env(n, 0.006, 0.03)
    tex = lowpass(rng.standard_normal(n), 1800) * env(n, 0.005, 0.012)
    return amp * lowpass(0.6 * ping + 0.5 * body + 0.15 * tex, 3500)


def chip_single():
    return place(0.16, [(0, clay_click(1450))])


def chip_multi():
    parts = []
    for k in range(3):
        parts.append((k * 0.075 + rng.uniform(0, 0.015), clay_click(rng.uniform(1250, 1650), amp=rng.uniform(0.65, 1.0))))
    return place(0.36, parts)


def swish(d, lo=250, hi=1600, amp=1.0):
    """Gentle paper swish: low-passed noise under a smooth bell-shaped envelope."""
    n = int(SR * d)
    x = t(d)
    noise = lowpass(highpass(rng.standard_normal(n), lo), hi)
    e = np.sin(np.pi * np.clip(x / d, 0, 1)) ** 2
    return amp * noise * e


def card_slide():
    return place(0.4, [(0, swish(0.36))])


def card_flip():
    """Soft paper flick: a brief muted swish plus a faint low thump as the card settles."""
    d = 0.14
    n = int(SR * d)
    flick = swish(0.07, 300, 2200, 0.8)
    thump = np.sin(2 * np.pi * 150 * t(d)) * env(n, 0.008, 0.035)
    return place(0.18, [(0, flick), (0.04, 0.35 * thump)])


def deck_deal():
    return place(0.5, [(0, 0.8 * swish(0.26)), (0.24, card_flip())])


def bell(freq, d, amp=1.0):
    """Warm, soft bell: few partials, slow-ish decay, rounded attack."""
    n = int(SR * d)
    x = t(d)
    partials = [(1, 1.0, 0.9), (2.0, 0.28, 0.5), (3.0, 0.08, 0.3)]
    s = sum(a * np.sin(2 * np.pi * freq * r * x) * np.exp(-x / dec) for r, a, dec in partials)
    return amp * lowpass(s * env(n, 0.012, 10), 3000)


def noble_chime():
    return place(1.3, [(0, bell(523.25, 1.1, 0.6)), (0.12, bell(659.25, 1.05, 0.5)), (0.24, bell(783.99, 1.0, 0.5))])


def turn_tick():
    """Very subtle wood tap."""
    d = 0.08
    n = int(SR * d)
    x = t(d)
    s = (np.sin(2 * np.pi * 620 * x) + 0.25 * np.sin(2 * np.pi * 1450 * x)) * env(n, 0.004, 0.016)
    return place(0.1, [(0, 0.5 * lowpass(s, 2500))])


def horn(freq, d, amp=1.0):
    """Mellow horn-ish tone: few harmonics, soft attack, gentle release."""
    x = t(d)
    s = sum((1 / k ** 1.5) * np.sin(2 * np.pi * freq * k * x) for k in range(1, 5))
    s = s * (1 + 0.003 * np.sin(2 * np.pi * 5 * x))
    a = (0.5 - 0.5 * np.cos(np.pi * np.minimum(1, x / 0.05))) * np.exp(-np.maximum(0, x - d * 0.55) / 0.18)
    return amp * lowpass(s * a, 2000)


def fanfare():
    notes = [(0.0, 392.0, 0.2), (0.2, 523.25, 0.2), (0.4, 659.25, 0.85)]
    parts = [(s, horn(f, d, 0.5)) for s, f, d in notes]
    parts += [(0.4, horn(523.25, 0.85, 0.28)), (0.4, horn(392.0, 0.85, 0.22)), (0.4, bell(1046.5, 1.0, 0.12))]
    return place(1.5, parts)


def card_place():
    """A card set down on a stack: a short soft swish ending in a muted low tap."""
    d = 0.12
    n = int(SR * d)
    tap = np.sin(2 * np.pi * 180 * t(d)) * env(n, 0.006, 0.03)
    return place(0.3, [(0, 0.6 * swish(0.16, 250, 1400)), (0.13, 0.5 * tap)])


def collect():
    """A stack gathered up: two overlapping gentle swishes."""
    return place(0.6, [(0, swish(0.32, 220, 1300, 0.8)), (0.16, swish(0.34, 260, 1500, 0.7))])


def dragon_rumble():
    """Low, gentle rumble for the Great Dragon changing hands: filtered noise over a soft low hum."""
    d = 1.3
    n = int(SR * d)
    x = t(d)
    noise = lowpass(rng.standard_normal(n), 220, 4)
    hum = np.sin(2 * np.pi * 55 * x + 0.6 * np.sin(2 * np.pi * 3.2 * x)) + 0.4 * np.sin(2 * np.pi * 82.5 * x)
    e = np.sin(np.pi * np.clip(x / d, 0, 1)) ** 1.5
    return place(1.4, [(0, (0.9 * noise / (np.max(np.abs(noise)) + 1e-9) + 0.7 * hum) * e)])


def ship_bell():
    """A soft ship's bell: two gentle strikes."""
    return place(1.6, [(0, bell(587.33, 1.2, 0.6)), (0.32, bell(587.33, 1.2, 0.45))])


SOUNDS = {
    'card-slide': card_slide, 'card-place': card_place, 'card-flip': card_flip, 'collect': collect,
    'dragon-rumble': dragon_rumble, 'ship-bell': ship_bell, 'turn-tick': turn_tick, 'fanfare': fanfare,
}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, fn in SOUNDS.items():
        sig = lowpass(fn(), 5000, 2)  # final gentle high cut on everything
        sig = sig / (np.max(np.abs(sig)) + 1e-9) * PEAK
        fin = min(len(sig), int(SR * 0.006))
        sig[:fin] *= np.linspace(0, 1, fin)
        fade = min(len(sig), int(SR * 0.03))
        sig[-fade:] *= np.linspace(1, 0, fade)
        with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
            wavfile.write(tmp.name, SR, (sig * 32767).astype(np.int16))
            dst = os.path.join(out, name + '.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', dst], check=True)
        print(f'{name}.mp3: {os.path.getsize(dst)//1024} KB, {len(sig)/SR:.2f}s')
