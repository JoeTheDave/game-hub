#!/usr/bin/env python3
"""Synthesize Onitama's soft sound effects (no samples, nothing licensed).

Usage: ~/ai/ComfyUI/venv/bin/python tools/onitama-art/make_sounds.py OUT_DIR
(needs numpy, scipy and ffmpeg with libmp3lame; the ComfyUI venv has numpy+scipy)

Per the playbook: short, soft, natural. Rounded attacks (3-15 ms), low-passed, peaks about
-14 dBFS. Wood and paper rather than clicks; the temple bell is the only tonal one.
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(1)


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


def wood(f0, dur=0.22, body=0.06):
    """A soft wooden knock: a few damped inharmonic modes plus a tiny band of noise."""
    x = t(dur)
    modes = sum(a * np.sin(2 * np.pi * f0 * r * x) * np.exp(-x / (body * d)) for r, a, d in
                [(1.0, 1.0, 1.0), (2.71, 0.45, 0.6), (4.16, 0.22, 0.4)])
    knock = band(rng.standard_normal(len(x)), f0 * 1.5, f0 * 6) * np.exp(-x / 0.012) * 0.35
    return (modes + knock) * env(len(x), 0.004, body * 1.6)


def SOUNDS():
    out = {}
    out['wood-clack'] = lowpass(wood(420), 3200)
    # slide: felt-on-paper swish, band-passed noise with a slow swell
    x = t(0.42)
    sw = band(rng.standard_normal(len(x)), 500, 2600) * np.sin(np.pi * np.clip(x / 0.42, 0, 1)) ** 1.6
    out['slide'] = lowpass(sw, 2400) * 0.6
    # capture: deeper, heavier soft thock + a short dull slide
    th = lowpass(wood(190, 0.32, 0.09), 1800)
    x2 = t(0.32)
    out['capture'] = th + band(rng.standard_normal(len(x2)), 300, 1200) * np.exp(-x2 / 0.07) * 0.15
    # card swish: quicker, airier paper swish
    x = t(0.3)
    cs = band(rng.standard_normal(len(x)), 1200, 5000) * (np.sin(np.pi * np.clip(x / 0.3, 0, 1)) ** 2.2)
    out['card-swish'] = lowpass(cs, 4200) * 0.5
    # bell: soft temple bell, inharmonic partials, slow decay
    x = t(2.4)
    f = 392
    bell = sum(a * np.sin(2 * np.pi * f * r * x + p) * np.exp(-x / d) for r, a, d, p in
               [(1.0, 1.0, 1.6, 0), (2.02, 0.4, 1.0, 0.3), (2.76, 0.25, 0.7, 0.9), (4.07, 0.12, 0.45, 1.4), (0.5, 0.3, 2.0, 0.1)])
    out['bell'] = lowpass(bell * env(len(x), 0.012, 1.4), 3000)
    # turn tick: a very light high wood tap
    out['turn-tick'] = lowpass(wood(880, 0.12, 0.03), 4500) * 0.6
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
