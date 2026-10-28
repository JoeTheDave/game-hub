# Splendor sound credits

All sound effects here are **synthesized in-repo** from code (numpy/scipy oscillators and filtered noise, encoded to MP3 with ffmpeg). No third-party samples are used, so there are no licensing obligations.

Generator: `tools/splendor-art/make_sounds.py`. To regenerate: `python make_sounds.py client/src/games/splendor/assets/sounds`.

| File | Use |
|------|-----|
| chip-single.mp3 | one token moved (a soft glass tink, -16 dBFS; round 2) |
| chip-multi.mp3 | several tokens moved (a gentle cascade of 3 tinks, -16 dBFS; round 2) |
| card-slide.mp3 | card sliding across the table |
| card-flip.mp3 | card flipped face-up or face-down |
| deck-deal.mp3 | deck deals a replacement card (slide + flip) |
| noble-chime.mp3 | noble visits a player |
| turn-tick.mp3 | turn passes to the next player |
| fanfare.mp3 | game over |

Levels: every sound is normalized to about -12 dBFS, with rounded 5–15 ms attacks and a final low-pass, so nothing clicks or hisses. The table also plays them at reduced gain.

Play-test round 2 (spec 1793147156389): the clay-click chip sounds were disliked. They were replaced by inharmonic sine "glass" partials with a 4 ms attack and short decay, at -16 dBFS (quieter than the rest). Regenerate just those with `--only chip-single,chip-multi`.
