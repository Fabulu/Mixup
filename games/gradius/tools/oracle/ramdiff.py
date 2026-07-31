#!/usr/bin/env python3
"""Find the ROM's variables by differencing $0000-$07FF across scripted runs.

This is how the Batman port found its own player fields, and it is worth more
right now than any guess at a state vector: we do not yet know a single Gradius
RAM address, so the probe has to be able to DISCOVER them.

It drives games/gradius/tools/oracle/probe.py, which dumps the full 2 KB of NES
RAM once per game frame at the stable sample point ($80B5, the last instruction
of the NMI handler -- see probe.lua). Runs share an identical boot prefix, so
they are in byte-identical states right up to the frame the scripts diverge; any
address that differs after that is downstream of the button, and the frame it
first differs on orders the causal chain.

Two modes:

  --ab            two scripts, one table: for every address, the first frame at
                  which they disagree. Read top-down it is the propagation path
                  from the controller port into the game's variables.

  --find-player   the discriminating experiment. Four runs off one boot: idle,
                  hold RIGHT, hold LEFT, hold DOWN, hold UP. An address is a
                  player X candidate only if it drifts one way under RIGHT and
                  the OTHER way under LEFT; Y likewise under DOWN/UP. A byte
                  that merely "changes when you press something" is not
                  evidence -- half of RAM does that. Opposite signs under
                  opposite buttons is.

Usage
  python games/gradius/tools/oracle/ramdiff.py --find-player
  python games/gradius/tools/oracle/ramdiff.py --find-player --hold 240 --top 30
  python games/gradius/tools/oracle/ramdiff.py --ab "" "R"
  python games/gradius/tools/oracle/ramdiff.py --ab "" "A" --hold 120

MEASURED facts this tool relies on:
  * probe.py --twice is byte-identical, RAM dump included, so a difference
    between two runs is caused by the script and nothing else.
  * The default boot reaches game mode ($00) = 5 at game frame 282, with one lag
    frame at 283.
  * The ship does NOT respond to the stick for the first ~28 frames of mode 5:
    holding RIGHT from game frame 300 moves $0360 only at frame 310, while
    holding it from 400 or 500 moves it on the press frame itself. That is a
    stage-entry window in the game, not a harness artifact -- but it is exactly
    the kind of thing that reads as a ten-frame input lag if the hold window
    starts too early, so the boot prefix runs to frame 400.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "ramdiff"

BOOT = "200:,10:S,190:"     # 400 game frames; mode 5 from 282, ship live from 310
BOOT_FRAMES = 400


def s8(v: int) -> int:
    return v - 256 if v > 127 else v


def d8(a: int, b: int) -> int:
    """b - a as a signed 8-bit delta, so a low byte wrapping reads as +1/-1."""
    return ((b - a + 128) & 0xFF) - 128


class Trace:
    """One run's RAM dump: frames x 2048 bytes."""

    def __init__(self, name: str, script: str, frames: int):
        self.name = name
        self.script = script
        js = OUT / f"{name}.json"
        rd = OUT / f"{name}.ram"
        probe.run(frames, script, js, ramdump=rd)
        self.doc = json.loads(js.read_text())
        blob = rd.read_bytes()
        self.n = len(blob) // 2048
        self.blob = blob
        if self.n != frames:
            raise SystemExit(f"{name}: dumped {self.n} frames, expected {frames}")

    def at(self, frame: int) -> memoryview:
        return memoryview(self.blob)[frame * 2048:(frame + 1) * 2048]

    def col(self, addr: int) -> list[int]:
        return [self.blob[f * 2048 + addr] for f in range(self.n)]


def drift(vals: list[int], lo: int, hi: int) -> int:
    """Net signed movement of one byte over [lo, hi), wrap-aware."""
    return sum(d8(vals[f], vals[f + 1]) for f in range(lo, min(hi, len(vals)) - 1))


def changes(vals: list[int], lo: int, hi: int) -> int:
    return sum(1 for f in range(lo, min(hi, len(vals)) - 1) if vals[f] != vals[f + 1])


# --------------------------------------------------------------------- A/B ---

def mode_ab(a_keys: str, b_keys: str, hold: int, top: int):
    frames = BOOT_FRAMES + hold
    A = Trace("ab_a", BOOT + f",{hold}:{a_keys}", frames)
    B = Trace("ab_b", BOOT + f",{hold}:{b_keys}", frames)

    # Sanity that makes this check able to fail: before the scripts diverge the
    # two runs must be byte-identical. If they are not, the runs are not
    # comparable and every number below is noise.
    same_pre = all(A.at(f) == B.at(f) for f in range(BOOT_FRAMES))
    print(f"[{'PASS' if same_pre else 'FAIL'}] runs identical for all "
          f"{BOOT_FRAMES} boot frames before the scripts diverge")
    if not same_pre:
        return 1

    first = {}
    for f in range(BOOT_FRAMES, frames):
        ra, rb = A.at(f), B.at(f)
        if ra == rb:
            continue
        for addr in range(2048):
            if addr not in first and ra[addr] != rb[addr]:
                first[addr] = f

    print(f"\n=== A={a_keys or 'idle'!r}  B={b_keys or 'idle'!r}   "
          f"hold {hold} frames from game frame {BOOT_FRAMES} ===")
    print(f"{len(first)} of 2048 addresses ever diverge\n")
    print(f"{'addr':>6} {'1st':>5}  {'A@div':>5} {'B@div':>5}  "
          f"{'A end':>5} {'B end':>5}  {'driftA':>7} {'driftB':>7}")
    for addr, f in sorted(first.items(), key=lambda kv: (kv[1], kv[0]))[:top]:
        ca, cb = A.col(addr), B.col(addr)
        print(f"  ${addr:04X} {f:5d}  {ca[f]:5d} {cb[f]:5d}  "
              f"{ca[-1]:5d} {cb[-1]:5d}  "
              f"{drift(ca, BOOT_FRAMES, frames):7d} "
              f"{drift(cb, BOOT_FRAMES, frames):7d}")
    return 0


# ----------------------------------------------------------- find-player -----

DIRS = [("idle", ""), ("right", "R"), ("left", "L"), ("down", "D"), ("up", "U")]


def mode_find_player(hold: int, top: int):
    frames = BOOT_FRAMES + hold
    tr = {}
    for name, keys in DIRS:
        tr[name] = Trace(name, BOOT + f",{hold}:{keys}", frames)
        d = tr[name].doc
        # $07 (held), NOT $9C -- $9C is the sprite emitter's scratch by the time
        # the sample is taken. See probe.lua's header.
        print(f"  ran {name:6s} script={d['inputScript']!r} "
              f"frames={d['gameFrames']} lag={d['lagFrames']} "
              f"held$07(last)={tr[name].col(0x07)[-1]:#04x} "
              f"X$0360={tr[name].col(0x360)[-1]:3d} "
              f"Y$0320={tr[name].col(0x320)[-1]:3d}")

    idle = tr["idle"]
    same_pre = all(
        all(tr[n].at(f) == idle.at(f) for n, _ in DIRS)
        for f in (0, BOOT_FRAMES // 2, BOOT_FRAMES - 1)
    )
    print(f"\n[{'PASS' if same_pre else 'FAIL'}] all five runs byte-identical "
          f"through the shared boot prefix")

    lo, hi = BOOT_FRAMES, frames
    cols = {n: {} for n, _ in DIRS}
    # only look at addresses that move under at least one direction
    interesting = set()
    for f in range(lo, hi):
        for n, _ in DIRS:
            if n == "idle":
                continue
            ra, rb = idle.at(f), tr[n].at(f)
            if ra == rb:
                continue
            for a in range(2048):
                if ra[a] != rb[a]:
                    interesting.add(a)
    print(f"{len(interesting)} of 2048 addresses respond to any held direction")

    for n, _ in DIRS:
        for a in interesting:
            cols[n][a] = tr[n].col(a)

    def report(axis: str, pos: str, neg: str):
        """Two tiers, and the tiering is the whole point.

        "Moves when you press something" is not evidence: with enemies on
        screen, hundreds of addresses do -- the shadow OAM alone rotates its
        flicker slots every frame. The strong discriminator is the conjunction
        of THREE things:
          1. drifts under POS and NEG in OPPOSITE directions,
          2. is completely still on the idle run over the same window,
          3. by a margin.
        Condition 2 is what separates the player's position from every sprite
        byte that happens to be downstream of it. Tier 2 is printed anyway, so
        a field that fails only condition 2 is visible rather than discarded.
        """
        strong, weak = [], []
        for a in sorted(interesting):
            dp = drift(cols[pos][a], lo, hi)
            dn = drift(cols[neg][a], lo, hi)
            di = drift(cols["idle"][a], lo, hi)
            ci = changes(cols["idle"][a], lo, hi)
            if dp * dn < 0 and abs(dp - dn) > 4:
                (strong if (di == 0 and ci == 0) else weak).append(
                    (abs(dp - dn), a, dp, dn, di, ci))
        # Ties broken towards the LOWER address: a variable and its copies score
        # identically, and the canonical one is normally the one the copies were
        # made from -- zero page and the low actor arrays before the $07xx
        # history rings.
        strong.sort(key=lambda r: (r[0], -r[1]), reverse=True)
        weak.sort(key=lambda r: (r[0], -r[1]), reverse=True)

        def table(rows, n):
            if not rows:
                print("  none")
                return
            print(f"{'addr':>7} {'drift+':>7} {'drift-':>7} {'driftIdle':>10} "
                  f"{'idleChg':>8}   {pos}[last 6]                {neg}[last 6]")
            for _, a, dp, dn, di, ci in rows[:n]:
                vp = " ".join(f"{v:3d}" for v in cols[pos][a][-6:])
                vn = " ".join(f"{v:3d}" for v in cols[neg][a][-6:])
                print(f"  ${a:04X} {dp:7d} {dn:7d} {di:10d} {ci:8d}   "
                      f"{vp}   {vn}")

        print(f"\n=== {axis}: drift under {pos.upper()} and {neg.upper()} have "
              f"OPPOSITE sign, AND the address never moves while idle ===")
        table(strong, top)
        print(f"\n  --- same sign test but NOT still while idle "
              f"({len(weak)} addresses, top 5) ---")
        table(weak, 5)

    report("PLAYER X", "right", "left")
    report("PLAYER Y", "down", "up")

    # 16-bit pairs: a byte whose neighbour ticks exactly when it wraps
    print("\n=== 16-bit pair check (low byte wraps <-> high byte steps) ===")
    found = False
    for a in sorted(interesting):
        if a + 1 not in interesting:
            continue
        for n in ("right", "left", "down", "up"):
            lo_c, hi_c = cols[n][a], cols[n][a + 1]
            wraps = [f for f in range(lo, hi - 1)
                     if abs(lo_c[f + 1] - lo_c[f]) > 128]
            steps = [f for f in range(lo, hi - 1) if hi_c[f + 1] != hi_c[f]]
            if wraps and steps and set(steps) == set(wraps):
                print(f"  ${a:04X}/${a+1:04X} under {n}: "
                      f"{len(wraps)} wraps, all matched by a high-byte step")
                found = True
                break
    if not found:
        print("  none found in this window (may just mean nothing crossed 256)")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--find-player", action="store_true")
    ap.add_argument("--ab", nargs=2, metavar=("A", "B"),
                    help="two button strings held after the shared boot")
    ap.add_argument("--hold", type=int, default=180,
                    help="frames to hold after the boot prefix")
    ap.add_argument("--top", type=int, default=24)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if args.ab:
        return mode_ab(args.ab[0], args.ab[1], args.hold, args.top)
    if args.find_player:
        return mode_find_player(args.hold, args.top)
    ap.error("choose --find-player or --ab A B")


if __name__ == "__main__":
    raise SystemExit(main())
