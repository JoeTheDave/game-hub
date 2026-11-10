# Klask sound credits

Every sound here is **synthesized in-repo** by `tools/klask-art/make_sounds.py` (numpy + scipy, encoded with ffmpeg/libmp3lame). No samples or third-party audio are used, so there's nothing to license.

| File | What it is |
|---|---|
| `ball-hit.mp3` | a crisp small plastic tick (striker hits ball) |
| `wall.mp3` | a soft wooden thud (ball hits the frame) |
| `biscuit.mp3` | a magnetic snap, a tight double click (biscuit sticks to a striker) |
| `goal.mp3` | the ball dropping into the hole plus a soft two-note chime |
| `klask.mp3` | a playful two-note "uh-oh" stinger (striker in its own goal / biscuits) |
| `serve.mp3` | a very light tick (ball placed for the serve) |
| `win.mp3` | a short warm C–E–G–C fanfare |

All peak at about -14 dBFS with rounded attacks and low-pass filtering, per `docs/ADDING-A-GAME.md` §8.
