#!/usr/bin/env python3
"""The renderer gate: regenerate the whole measured corpus and check every frame.

One command, from a cold ROM to a verdict. It

  1. measures the emulator's NES master palette (palprobe.lua),
  2. dumps a set of frames chosen to cover different things,
  3. rebuilds each with the model in NOTES-render.md and compares 61,440 pixels,
  4. runs every negative control and reports which frames are BLIND to which,
     because a scenario that cannot see a break is not covering it
     (docs/knowledge/03, "coverage must be proportional to the content").

Everything it writes is ROM-DERIVED and lands under tools/oracle/out/video/.

    python games/gradius/tools/oracle/rendergate.py
    python games/gradius/tools/oracle/rendergate.py --quick     # skip the long runs
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "video"

BOOT = "200:,10:S,190:"
LONG = BOOT + "," + ",".join(["100:B", "50:R", "100:B", "50:U", "100:B", "50:D"] * 8)

# Twenty sprites that between them exercise 8x16, both flips, the OAM-index
# priority rule (index 10 sits at a LARGER x than index 11, so the Game Boy's
# smaller-x-wins rule would pick the other one), the 8-per-scanline limit
# (ten sprites on one line -> indices 28 and 29 must vanish), the right-edge
# clip with no wrap (x = 252), and a sprite straddling the split boundary.
SPRITES = ("10:59,8D,01,100;11:59,8D,02,96"
           + "".join(f";{20+i}:139,8D,03,{8+i*24}" for i in range(10))
           + ";30:159,8D,00,40;31:159,8D,40,60;32:159,8D,80,80;33:159,8D,C0,100"
           + ";40:213,8D,20,60;41:179,8D,00,252;42:179,8D,00,0;43:203,8D,01,150")

# Three 8x16 sprites straddling the boundary, built from a tile PAIR that
# differs between CHR bank 0 and bank 1, which is what makes the sprite half of
# the mid-frame bank swap measurable at all.
STRADDLE = "50:203,3D,00,60;51:203,3D,01,80;52:203,3D,02,100;53:207,37,00,120"

# Painted nametable rows 0,1,26-29 in BOTH nametables, with a tile sequence
# whose top row differs between banks 0 and 1. Stage 1 leaves the two scanlines
# around the split blank, so without this the boundary checks are vacuous:
# --break boundary+1 scored 0 px. SYNTHETIC -- labelled as such.
_A = [0x24, 0x25, 0x26, 0x27, 0x2A, 0x2B, 0x2D, 0x2E,
      0x2F, 0x41, 0x42, 0x43, 0x44, 0x47, 0x48, 0x49]
_B = [0x4B, 0x4D, 0x4F, 0x50, 0x24, 0x25, 0x26, 0x27,
      0x2A, 0x2B, 0x2D, 0x2E, 0x2F, 0x41, 0x42, 0x43]
VRAM = ";".join(
    f"{base + row * 32:04X}:" + ",".join(f"{seq[(c + row * 3) % 16]:02X}"
                                         for c in range(32))
    for base, seq in ((0x2000, _A), (0x2400, _B))
    for row in (0, 1, 26, 27, 28, 29))

# (name, dump frame, script, sprites, vram, refine, what it is for)
CORPUS = [
    ("f400",  400,  BOOT, "", "", False, "stage 1 opening, natural"),
    ("f1200", 1200, LONG, "", "", False, "later, scroll near a nametable seam"),
    ("f2600", 2600, LONG, "", "", False, "TITLE screen: full nametable, no split"),
    ("inj",   800,  BOOT, SPRITES, "", False, "20 injected sprites, natural bg"),
    ("sb810", 810,  BOOT, STRADDLE, "", False, "sprites straddling the boundary"),
    ("inj2",  800,  BOOT, SPRITES, VRAM, True, "sprites + PAINTED boundary rows"),
    ("gx802", 802,  BOOT, "", VRAM, True, "painted boundary, different split jitter"),
]
QUICK = {"f400", "f2600", "inj", "sb810", "inj2"}

# The two frames above that PAINT the boundary scanlines, which the game leaves
# blank. On those scanlines the model is not exact: where inside the scanline
# each of the split's three changes bites depends on where the CPU's writes land,
# and that jitters a few dots per frame with the sprite-0 spin -- so which of the
# two frames keeps a residual changes from run to run. Measured bound: at most
# 6 px, never off scanlines 211-212. Stated as a bound and ENFORCED, rather than
# hidden inside a PASS; tighten either number and this gate goes red.
SYNTHETIC = {"inj2", "gx802"}
RESIDUAL_MAX_PX = 6
RESIDUAL_SCANLINES = {211, 212}


def sh(argv: list[str]) -> str:
    r = subprocess.run([sys.executable] + argv, capture_output=True, text=True)
    if r.returncode not in (0, 1):
        print(r.stdout[-3000:], r.stderr[-3000:], file=sys.stderr)
        raise SystemExit(f"failed: {' '.join(argv)}")
    return r.stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--skip-capture", action="store_true",
                    help="reuse the dumps already in out/video/")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    pal = OUT / "master_palette.bin"
    if not a.skip_capture or not pal.exists():
        print("measuring the emulator's NES master palette ...")
        sys.path.insert(0, str(HERE))
        import mesen
        pal.unlink(missing_ok=True)
        r = mesen.run_script(HERE / "palprobe.lua", timeout_s=180,
                             env_extra={"PP_OUT": str(pal).replace("\\", "/")})
        for line in r.lines:
            if line.startswith(("measured", "rejected", "worst")):
                print("  " + line)
        if not pal.exists():
            raise SystemExit("palprobe.lua wrote no palette")

    rows, blind = [], {}
    for name, at, script, spr, vram, refine, why in CORPUS:
        if a.quick and name not in QUICK:
            continue
        d = OUT / name
        if not a.skip_capture:
            print(f"\ncapturing {name} (frame {at}): {why}")
            sh([str(HERE / "videoprobe.py"), "--at", str(at),
                "--frames", str(at + 2), "--script", script,
                "--oam", spr, "--vram", vram, "--out", str(d)])
        argv = [str(HERE / "rendercheck.py"), "--dir", str(d), "--all-breaks"]
        if refine:
            argv.append("--refine")
        text = sh(argv)
        bad = next((l for l in text.splitlines() if l.startswith("[")), "?")
        npx = int(bad.split("]")[1].split()[0]) if "]" in bad else -1
        lines = {int(l.split("scanline")[1].split(":")[0])
                 for l in text.splitlines() if l.strip().startswith("scanline")}
        rows.append((name, why, bad, npx, lines))
        for l in text.splitlines():
            if "--break" in l:
                b = l.split("--break")[1].split()[0]
                blind.setdefault(b, []).append((name, "BLIND" not in l))

    print("\n" + "=" * 74)
    for name, why, bad, _n, _l in rows:
        print(f"  {name:<7} {bad:<52} {why}")

    print("\nnegative controls -- frames that SEE each break:")
    ok = True
    for b, seen in sorted(blind.items()):
        yes = [n for n, s in seen if s]
        no = [n for n, s in seen if not s]
        if not yes:
            ok = False
        print(f"  --break {b:<11} seen by {','.join(yes) or 'NOBODY':<28} "
              f"blind: {','.join(no) or '-'}")

    print()
    for name, _w, _b, npx, lines in rows:
        if name in SYNTHETIC and npx:
            print(f"  note: {name} keeps {npx} px on scanline(s) {sorted(lines)}"
                  f" -- the boundary-jitter residual "
                  f"(bound: {RESIDUAL_MAX_PX} px on {sorted(RESIDUAL_SCANLINES)})")
    bad_nat = [r for r in rows if r[0] not in SYNTHETIC and r[3] != 0]
    bad_syn = [r for r in rows if r[0] in SYNTHETIC
               and (r[3] > RESIDUAL_MAX_PX or not r[4] <= RESIDUAL_SCANLINES)]
    if bad_nat:
        print("[FAIL] natural frames that are not pixel-exact: "
              + ", ".join(f"{r[0]} ({r[3]} px)" for r in bad_nat))
    if bad_syn:
        print("[FAIL] synthetic residual out of its stated bound: "
              + ", ".join(f"{r[0]} {r[3]} px on {sorted(r[4])}" for r in bad_syn))
    if not ok:
        print("[FAIL] some negative controls are seen by no frame")
    if bad_nat or bad_syn or not ok:
        return 1
    nat = len([r for r in rows if r[0] not in SYNTHETIC])
    print(f"[PASS] {nat} natural frames rebuilt pixel-exactly; the synthetic "
          f"boundary frames stay inside the stated residual; every negative "
          f"control is seen by at least one frame")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
