#!/usr/bin/env python3
"""stage4poke.py -- run stage 4's CEILING VOLCANO on the real cartridge.

WAVE 31. The plan's W31 DONE-WHEN asks for a stage-4 scenario that clears to
the stage-4 BigCore. **No button script this project has can reach stage 4**,
and that is measured rather than assumed:

    the endchain trajectory (the corpus boot + RDA/RUA/RDA + RA to f5000 +
    a fixed RUA hold, with the four rank-byte power-up pokes) run out to
    26,000 frames dies THREE TIMES inside stage 2, between scroll $03E8 and
    $0463, then game-overs at f14333 and never leaves stage 1 again.
    maxScroll $0E00; stages visited: $19 = 0 and 1 only.

(The inherited sentence "the endchain stops at the stage-2 -> stage-3
transition" describes the DUMP, which ends at f12000. The RUN does not stop
there; it plays on and dies. Stage 3 is not one dump-length away.)

So this uses the fallback docs/knowledge/09 approves and the W29 plan names by
hand: a BOTH-SIDES intervention that validates the CODE, not the route. `$19` is
forced to 3 for exactly the `$82` countdown window -- the window in which the
late spawner runs -- and every ceiling-volcano spawn the board produces is
dumped for `stage4cmp.mjs` to compare against the port's `st_$C5AD`.

WHY THIS PARTICULAR POKE IS SURGICAL, out of the listing rather than out of
hope. Across the `$82` window the ONLY thing `$19` selects is the late-spawner
arm, because stages 1 and 4 agree on everything else that reads it there:

    $9A3D[0] == $9A3D[3] == $0C      same boss-trigger page
    $98FD[0] == $98FD[3] == $0E      same stage-end page
    $99FC/$9A00                      stage 0 AND stage 3 both get sfx $3F
    the camera is parked at $0C00 for the whole window, so no terrain streams
    and $9E38's per-stage pointers are never re-read

READ THE PROVENANCE LABEL. This is an intervention run. It is valid evidence for
"is our transcription of `$C5AD`/`$B377` right", and NOT evidence about stage 4's
pacing, spawn density or what the stage looks like -- the terrain under these
rocks is stage 1's. See docs/knowledge/09's intervention-run section.

    python games/gradius/tools/oracle/stage4poke.py
    python games/gradius/tools/oracle/stage4poke.py --reach   # the wall, remeasured

Output lands in out/stage4poke/ (gitignored). Nothing ROM-derived is committed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "stage4poke"

# The endchain's own trajectory (reachcheck.py's, verbatim) -- the one input
# this corpus has that survives stage 1 and reaches the $82 countdown.
BOOT = "200:,10:S,190:"
LEAD = [(1350, "RDA"), (324, "RUA"), (80, "RDA")]
SWITCH = 5000
TAIL = "RUA"
POWER = "0044=2,0045=2,0046=5,0041=1"

# The $82 countdown, measured on this trajectory: $1B := $82 at f6459, := $83
# at f7739. The poke opens one frame LATE on purpose, so f6459 runs the STAGE-1
# arm ($C486, type $0A) and stands as an in-run control: if the poke did nothing
# the dump would be 271 type-$0A rocks instead of 1.
W82_FROM, W82_TO = 6460, 7730

# $030C,X etc. -- X is the raw enemy slot 0..9, so the object arrays are read at
# base + slot with no further offset (the port folds the +$0C into its own base).
FIELDS = dict(anim=0x012C, type=0x030C, y=0x032C, x=0x036C, yvel=0x03BC,
              yvelf=0x03EC, xvel=0x042C, xvelf=0x044C, accel=0x048C,
              hit=0x04AC)
VOLCANO_TYPES = (0x0A, 0x8A, 0x15, 0x95)


def _script(frames: int) -> str:
    used = 400 + sum(n for n, _ in LEAD)
    segs = [BOOT] + [f"{n}:{b}" for n, b in LEAD]
    segs.append(f"{SWITCH - used}:RA")
    segs.append(f"{frames - SWITCH}:{TAIL}")
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


def cmd_reach(frames: int) -> int:
    """Re-measure the wall: how far does the endchain trajectory actually get?"""
    poke = ",".join(f"{p}@400-{frames - 1}" for p in POWER.split(","))
    rows, rb = _run(frames, poke, "reach")
    g = lambda i, a: rb[i * 2048 + a]
    prev, maxscroll = None, 0
    for i, row in enumerate(rows):
        s = (row["scrollHi"] << 8) | row["scrollLo"]
        maxscroll = max(maxscroll, s)
        cur = (g(i, 0x19), g(i, 0x1B), g(i, 0x00D4))
        if cur != prev:
            print("  f%-6d $19=%02X $1B=%02X mode=%02X scroll=$%04X"
                  % (i, cur[0], cur[1], cur[2], s))
            prev = cur
    print("maxScroll $%04X" % maxscroll)
    print("stages visited ($19):",
          ["$%02X" % v for v in sorted({g(i, 0x19) for i in range(len(rows))})])
    return 0


def cmd_spawns(frames: int, stage: int) -> int:
    pokes = [f"{p}@400-{frames - 1}" for p in POWER.split(",")]
    pokes.append(f"0019={stage:d}@{W82_FROM}-{W82_TO}")  # probe.lua: DECIMAL value
    rows, rb = _run(frames, ",".join(pokes), "spawns")
    g = lambda i, a: rb[i * 2048 + a]
    n = len(rows)

    out, prev = [], [0] * 10
    for i in range(n):
        cur = [g(i, FIELDS["type"] + j) for j in range(10)]
        for j in range(10):
            # A spawn is an empty slot becoming non-empty. The sample is taken
            # after $ADAB has dispatched, so the type already carries bit 7 --
            # the handler's init arm ($B0B4) ORs it in on the spawn frame.
            if prev[j] == 0 and cur[j] in VOLCANO_TYPES:
                out.append(dict(frame=i, slot=j, z19=g(i, 0x19),
                                z69_m1=g(i - 1, 0x69), z69=g(i, 0x69),
                                z02=g(i, 0x02),
                                **{k: g(i, v + j) for k, v in FIELDS.items()}))
        prev = cur

    (OUT / "spawns-decoded.json").write_text(json.dumps(out))
    byt: dict[int, int] = {}
    for r in out:
        byt[r["type"]] = byt.get(r["type"], 0) + 1
    print("volcano-family spawns: "
          + ", ".join("$%02X x%d" % (t, c) for t, c in sorted(byt.items())))
    if 0x8A not in byt:
        print("WARNING: the f%d control spawn (type $0A/$8A, the STAGE-1 arm) is "
              "missing. The $82 window has moved; re-read $1B before trusting "
              "this dump." % W82_FROM)
    print("wrote %d rows to %s" % (len(out), OUT / "spawns-decoded.json"))
    print("now run: node games/gradius/tools/oracle/stage4cmp.mjs")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=8000)
    ap.add_argument("--stage", type=int, default=3, help="$19 value to force")
    ap.add_argument("--reach", action="store_true",
                    help="re-measure how far the trajectory survives instead")
    a = ap.parse_args()
    if a.reach:
        return cmd_reach(max(a.frames, 26000))
    return cmd_spawns(a.frames, a.stage)


if __name__ == "__main__":
    raise SystemExit(main())
