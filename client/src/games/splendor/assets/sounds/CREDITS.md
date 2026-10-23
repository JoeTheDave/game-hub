# Splendor sound credits

All sound effects here are **synthesized in-repo** from code (numpy/scipy oscillators and filtered noise, encoded to MP3 with ffmpeg). No third-party samples are used, so there are no licensing obligations.

Generator: `tools/splendor-art/make_sounds.py`. To regenerate: `python make_sounds.py client/src/games/splendor/assets/sounds`.

| File | Use |
|------|-----|
| chip-single.mp3 | one token moved |
| chip-multi.mp3 | several tokens moved |
| card-slide.mp3 | card sliding across the table |
| card-flip.mp3 | card flipped face-up or face-down |
| deck-deal.mp3 | deck deals a replacement card (slide + flip) |
| noble-chime.mp3 | noble visits a player |
| turn-tick.mp3 | turn passes to the next player |
| fanfare.mp3 | game over |
