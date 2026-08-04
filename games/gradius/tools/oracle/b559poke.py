#!/usr/bin/env python3
"""b559poke.py -- run stage 5's `$B559` drifter on the real cartridge.

WAVE 32a. `$B559` is dispatch entry 29, types `$1D`/`$9D`, and **type `$1D` has
zero wave records outside stage 5** (decoded out of `assets/prg.bin`: stages 0-3
and 5-6 name it nowhere; stage 5 names it ten times, in chunks 0 and 1). So no
scripted run in this corpus can dispatch entry 29, and none ever has.

Nor can one be built. The wall is measured, not assumed -- W31 ran the endchain
trajectory out to 26,000 frames:

    it dies three times inside stage 2 between scroll $03E8 and $0463 and
    game-overs at f14333. maxScroll $0E00; stages visited: $19 = 0 and 1 only.

So this uses the fallback `docs/knowledge/09` approves: a BOTH-SIDES
INTERVENTION that validates the CODE, not the route. `$19` is forced to 4 across
a window of ordinary stage-1 play, which makes `$A2D5 LDA $A7D0,Y` load **stage
5's** chunk table on the next 512-px crossing, and the wave engine then spawns
stage 5's own type-`$1D` records with the game's own descriptor fields.

WHAT THE POKE ALSO CHANGES ON THE BOARD, stated rather than hoped:
  * the terrain streamer `$9E38` re-reads its per-stage pointers on the next
    chunk load, so the NAMETABLE becomes stage 5's under a stage-1 collision map.
    Cosmetic here -- nothing this tool compares reads the nametable.
  * `$9663`, `$8B8D`->`$8BD9`, `$C25D`->`$C267` and `$9A76`->`$C772` all start
    firing. Every one walks the four `$0600` group headers, all four of which are
    ZERO for the whole window (no `$CA5E` owner is ever spawned -- stage 5's arm
    records live in chunk 2 and the window never reaches it), so all four are
    no-ops on the board too. THAT IS CHECKED, not assumed: `--verify` prints the
    four headers over the window.
  * `$98FD[4]`/`$9A3D[4]` differ from stage 1's, so the stage would end early.
    The window closes long before that.

READ THE PROVENANCE LABEL. This is an intervention run. It is valid evidence for
"is our transcription of `$B559` right", and it is NOT evidence about stage 5's
pacing, spawn density or what the stage looks like. See `docs/knowledge/09`.

    python games/gradius/tools/oracle/b559poke.py
    python games/gradius/tools/oracle/b559poke.py --frames 6000

Output lands in out/b559poke/ (gitignored). Nothing ROM-derived is committed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "b559poke"

# The endchain's own trajectory (reachcheck.py's / stage4poke.py's, verbatim).
BOOT = "200:,10:S,190:"
LEAD = [(1350, "RDA"), (324, "RUA"), (80, "RDA")]
TAIL = "RA"
POWER = "0044=2,0045=2,0046=5,0041=1"

# THE WINDOW IS 46 FRAMES WIDE AND THAT IS THE WHOLE TRICK.
#
# `$19` is read by the chunk loader (`$A2D5 LDA $A7D0,Y`) only at a 512-px
# CROSSING, and by `$9663`/`$8BD9`/`$C25D`/`$C772` on every frame. Measured on
# this exact trajectory (b559poke run 1, 5,600 frames): the camera crosses
#
#     f1338  scroll $0200  $61 = 2      <- the crossing this poke rides
#     f2362  scroll $0400  $61 = 4
#     f3867  scroll $0600  $61 = 6
#
# so holding `$19 = 4` across f1338 alone loads **stage 5's chunk 1** ($ABD3,
# ten records of which FOUR are type $1D) and then puts `$19` straight back.
# Everything after f1346 -- the drifters' whole lives -- runs under stage 1's
# `$19`, so the four `$0600` walkers never fire and the four group headers stay
# zero. `--verify` checks that rather than asserting it.
#
# RUN 1 IS WHY THIS IS 46 FRAMES AND NOT 3,800. Opening the window at f1400 (i.e.
# AFTER the f1338 crossing) meant the next crossing at f2362 loaded stage 5's
# chunk **2** -- `$ABE8`, the four INLINE-5 ARM records -- and the board spent
# 2,533 frames with live `$0600` arm groups and produced ZERO type-$1D objects.
# That is W32b's subsystem running on the cartridge, which is a fine thing to
# have seen and exactly the wrong window for W32a.
#
# `$19` is not restored by the ROM (nothing writes it during play), so the poke
# has to write it back explicitly -- hence the second range.
W_FROM, W_TO = 1300, 1345

# $030C,X etc. X is the raw enemy slot 0..9; the port folds the +$0C into its
# own base, so these are read at base + slot with no further offset.
FIELDS = dict(anim=0x012C, timer=0x014C, animFrame=0x016C, status=0x010C,
              type=0x030C, y=0x032C, x=0x036C, xf=0x038C, accel=0x048C,
              hit=0x04AC)
DRIFTER_TYPES = (0x1D, 0x9D)
GROUPS = (0x0600, 0x0630, 0x0660, 0x0690)


def _script(frames: int) -> str:
    used = 400 + sum(n for n, _ in LEAD)
    segs = [BOOT] + [f"{n}:{b}" for n, b in LEAD]
    segs.append(f"{frames - used}:{TAIL}")
    return ",".join(segs)


def _run(frames: int, poke: str, tag: str):
    OUT.mkdir(parents=True, exist_ok=True)
    jp, ram = OUT / f"{tag}.json", OUT / f"{tag}.ram"
    script = _script(frames)
    print(f"script {script}")
    print(f"poke   {poke}")
    probe.run(frames, script, jp, ramdump=ram, watch="", poke=poke,
              timeout_s=5400)
    rows = json.loads(jp.read_text())["frames"]
    return rows, ram.read_bytes()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=5600)
    ap.add_argument("--stage", type=int, default=4, help="$19 value to force")
    a = ap.parse_args()
    frames = a.frames

    pokes = [f"{p}@400-{frames - 1}" for p in POWER.split(",")]
    pokes.append(f"0019={a.stage:d}@{W_FROM}-{min(W_TO, frames - 1)}")
    pokes.append(f"0019=0@{W_TO + 1}-{frames - 1}")     # and put it back
    rows, rb = _run(frames, ",".join(pokes), "run")
    n = len(rows)
    g = lambda i, addr: rb[i * 2048 + addr]

    # 1. The four $0600 group headers must be zero for the WHOLE RUN, or the
    #    "no arm group is ever allocated" claim above is false and the drifters
    #    are sharing the frame with W32b's subsystem.
    nonzero = [(i, [g(i, b) for b in GROUPS])
               for i in range(n)
               if any(g(i, b) for b in GROUPS)]
    print("$0600 group headers non-zero on %d of %d frames" % (len(nonzero), n))
    if nonzero:
        print("  first at f%d: %s" % (nonzero[0][0],
                                      ["$%02X" % v for v in nonzero[0][1]]))

    # 2. Every frame of every type-$1D/$9D object's life, with the PREVIOUS
    #    frame's fields alongside so the comparator can single-step the port.
    steps = []
    for i in range(1, n):
        for j in range(10):
            prev_t, cur_t = g(i - 1, 0x030C + j), g(i, 0x030C + j)
            if prev_t not in DRIFTER_TYPES and cur_t not in DRIFTER_TYPES:
                continue
            steps.append(dict(
                frame=i, slot=j,
                before={k: g(i - 1, v + j) for k, v in FIELDS.items()},
                after={k: g(i, v + j) for k, v in FIELDS.items()}))
    (OUT / "steps.json").write_text(json.dumps(steps))

    lives = {}
    for s in steps:
        lives.setdefault(s['slot'], []).append(s['frame'])
    print("type $1D/$9D frames captured: %d, across %d slot(s)"
          % (len(steps), len(lives)))
    inits = sum(1 for s in steps
                if s['before']['type'] == 0x1D and s['after']['type'] == 0x9D)
    frees = sum(1 for s in steps
                if s['before']['type'] in DRIFTER_TYPES and s['after']['type'] == 0)
    print("  init frames ($1D -> $9D): %d   free frames (-> $00): %d"
          % (inits, frees))
    print("wrote %s" % (OUT / "steps.json"))
    print("now run: node games/gradius/tools/oracle/b559cmp.mjs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
