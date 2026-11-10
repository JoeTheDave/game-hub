#!/usr/bin/env python3
"""Synthesize Klask's soft sound effects (no samples, nothing licensed).

Usage: ~/ai/ComfyUI/venv/bin/python tools/klask-art/make_sounds.py OUT_DIR
(needs numpy, scipy and ffmpeg with libmp3lame; the ComfyUI venv has numpy+scipy)

Per the playbook: short, soft, natural. Rounded attacks (3-15 ms), low-passed, peaks about
-14 dBFS. The ball hit and wall must stay quiet and short: they fire constantly in a rally.
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(3)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack, decay):
    x = np.arange(n) / SR
    a = np.clip(x / attack, 0, 1) ** 1.5
    return a * np.exp(-np.maximum(x - attack, 0) / decay)


def band(sig, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'bandpass', fs=SR, output='sos'), sig)


def lowpass(sig, hz):
    return sosfilt(butter(2, hz, 'lowpass', fs=SR, output='sos'), sig)


def modes(f0, dur, partials, attack=0.003, decay=0.05):
    x = t(dur)
    s = sum(a * np.sin(2 * np.pi * f0 * r * x + p) * np.exp(-x / (decay * d)) for r, a, d, p in partials)
    return s * env(len(x), attack, decay * 1.5)


def tone(freq, dur, attack=0.01, decay=0.25, partials=((1, 1.0), (2, 0.25), (3, 0.08))):
    x = t(dur)
    s = sum(a * np.sin(2 * np.pi * freq * k * x) for k, a in partials)
    return s * env(len(x), attack, decay)


def seq(*parts):
    """Place (offset_seconds, signal) parts on one timeline."""
    n = max(int(o * SR) + len(s) for o, s in parts)
    out = np.zeros(n)
    for o, s in parts:
        i = int(o * SR)
        out[i:i + len(s)] += s
    return out


def SOUNDS():
    out = {}
    # ball-hit: crisp small plastic tick (bright but band-limited, very short)
    hit = modes(2100, 0.09, [(1.0, 1.0, 1.0, 0), (1.63, 0.5, 0.6, 0.4), (2.9, 0.25, 0.4, 1.1)], 0.002, 0.012)
    x = t(0.09)
    hit = hit + band(rng.standard_normal(len(x)), 2500, 7000) * np.exp(-x / 0.004) * 0.25
    out['ball-hit'] = lowpass(hit, 6500)
    # wall: soft wooden thud of the frame
    x = t(0.16)
    thud = modes(230, 0.16, [(1.0, 1.0, 1.0, 0), (2.4, 0.35, 0.5, 0.5)], 0.004, 0.035)
    thud = thud + band(rng.standard_normal(len(x)), 300, 1500) * np.exp(-x / 0.01) * 0.3
    out['wall'] = lowpass(thud, 2200)
    # biscuit: magnetic snap, a tight double click (metal-ish, damped)
    c1 = modes(3200, 0.06, [(1.0, 1.0, 1.0, 0), (1.47, 0.6, 0.5, 0.3)], 0.0015, 0.006)
    c2 = modes(2600, 0.08, [(1.0, 1.0, 1.0, 0), (1.71, 0.5, 0.5, 0.7)], 0.0015, 0.01)
    out['biscuit'] = lowpass(seq((0, c1 * 0.7), (0.018, c2)), 7000)
    # goal: ball drops into the hole (falling pitch knock) + soft two-note chime
    x = t(0.18)
    f = 520 * np.exp(-x / 0.1) + 180
    drop = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.003, 0.05)
    chime = seq((0, tone(784, 0.7, 0.008, 0.28)), (0.11, tone(1047, 0.9, 0.008, 0.35)))
    out['goal'] = lowpass(seq((0, drop), (0.12, chime * 0.6)), 4500)
    # klask: playful "uh-oh" stinger, two soft falling square-ish notes with a little bend
    def uh(freq, dur, bend):
        x = t(dur)
        fr = freq * (1 - bend * x / dur)
        ph = 2 * np.pi * np.cumsum(fr) / SR
        sq = np.sin(ph) + 0.33 * np.sin(3 * ph) + 0.2 * np.sin(5 * ph)
        return lowpass(sq * env(len(x), 0.012, dur * 0.6), 2400)
    out['klask'] = seq((0, uh(523, 0.18, 0.02)), (0.2, uh(392, 0.34, 0.08)))
    # serve: very light tick
    out['serve'] = lowpass(modes(1400, 0.07, [(1.0, 1.0, 1.0, 0), (2.2, 0.3, 0.5, 0.2)], 0.003, 0.012), 5000) * 0.6
    # win: short warm fanfare, C-E-G-C arpeggio with a held top
    notes = [(0.0, 523, 0.18), (0.13, 659, 0.18), (0.26, 784, 0.2), (0.4, 1047, 0.9)]
    fan = seq(*[(o, tone(fq, d + 0.4, 0.01, 0.18 if d < 0.5 else 0.6)) for o, fq, d in notes])
    out['win'] = lowpass(fan, 3800)
    return out


def main():
    dst_dir = sys.argv[1]
    os.makedirs(dst_dir, exist_ok=True)
    peak = 10 ** (-14 / 20)
    for name, sig in SOUNDS().items():
        sig = sig / (np.abs(sig).max() + 1e-9) * peak
        fade = int(SR * 0.01)
        sig[-fade:] *= np.linspace(1, 0, fade)
        with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
            wavfile.write(tmp.name, SR, (sig * 32767).astype(np.int16))
            dst = os.path.join(dst_dir, name + '.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', dst], check=True)
        print(f'{name}.mp3: {os.path.getsize(dst) // 1024} KB, {len(sig) / SR:.2f}s')


if __name__ == '__main__':
    main()
