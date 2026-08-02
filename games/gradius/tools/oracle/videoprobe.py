#!/usr/bin/env python3
"""Measure everything the Gradius renderer has to reproduce.

Runs videoprobe.lua against the real cartridge headless and writes, for one
chosen game frame:

    pal.bin    32 bytes  palette RAM $3F00-$3F1F
    nt.bin     4096      PPU $2000-$2FFF (both nametables AND their mirrors)
    oam.bin    256       hardware OAM, 64 entries x 4
    chr.bin    8192      the CHR bank that was live at the sample point
    ram.bin    2048      $0000-$07FF
    fb.bin     184320    Mesen's framebuffer, 256x240 BGR
    shot.png             the same frame as a PNG
    dump.json            the measured register values for BOTH raster bands
    frames.json          per-frame band/split/CHR-latch census for the whole run

ROM-DERIVED. Every one of those files is cartridge data; they land under
tools/oracle/out/ which is gitignored, and none of them may be committed.

Usage
    python games/gradius/tools/oracle/videoprobe.py --at 400
    python games/gradius/tools/oracle/videoprobe.py --at 400 --out out/video/base
    python games/gradius/tools/oracle/videoprobe.py --at 400 --patch 9AC0=00 \
        --out out/video/nochrswap        # in-emulator negative control
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
LUA = HERE / "videoprobe.lua"

# Same boot as PROBE.md section 5: idle to the title, tap START, let stage 1
# load. Mode ($00) reaches 5 at game frame 282 and the split starts firing at
# 314; the ship becomes controllable around 310.
BOOT = "200:,10:S,190:"


def run(at: int, out: Path, *, frames: int | None = None, script: str = BOOT,
        patch: str = "", oam: str = "", vram: str = "",
        timeout_s: int = 300) -> dict:
    out = out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    # Delete the products first. PROBE.md section 6: a Lua-side failure that
    # leaves last run's files behind is read back as this run's result.
    for name in ("pal.bin", "nt.bin", "oam.bin", "chr.bin", "ram.bin",
                 "fb.bin", "shot.png", "dump.json", "frames.json"):
        (out / name).unlink(missing_ok=True)

    frames = frames if frames is not None else at + 2
    env = {
        "VP_FRAMES": str(frames),
        "VP_SCRIPT": script,
        "VP_AT": str(at),
        "VP_OUT": str(out).replace("\\", "/"),
        "VP_PATCH": patch,
        "VP_OAM": oam,
        "VP_VRAM": vram,
    }
    r = mesen.run_script(LUA, timeout_s=timeout_s, env_extra=env)
    err = [l for l in r.lines if l.startswith("ERROR = ")]
    if err:
        raise SystemExit("videoprobe.lua failed: " + err[0][len("ERROR = "):])
    if "END" not in r.lines:
        print(r.stdout[-4000:], file=sys.stderr)
        raise SystemExit(f"videoprobe.lua did not finish (exit {r.returncode})")
    for name in ("pal.bin", "nt.bin", "oam.bin", "chr.bin", "fb.bin", "dump.json"):
        if not (out / name).exists():
            raise SystemExit(f"videoprobe.lua reported END but wrote no {name}")

    dump = json.loads((out / "dump.json").read_text())
    dump["_stdout"] = r.fields()
    dump["_lines"] = r.lines
    return dump


# ------------------------------------------------------------------ report ---

def describe(out: Path, dump: dict) -> None:
    nt = (out / "nt.bin").read_bytes()
    pal = (out / "pal.bin").read_bytes()
    oam = (out / "oam.bin").read_bytes()

    print(f"\n--- dump at game frame {dump['frame']} "
          f"(PPU scanline {dump['dumpScanline']}, dot {dump['dumpCycle']}) ---")

    ctrlA, maskA = dump["bandA_ppuctrl"], dump["bandA_ppumask"]
    print("\nBAND A  (latched at $82A0, the RTS of the vblank routine $8281)")
    print(f"  $2000 PPUCTRL = ${ctrlA:02X}  {ctrl_bits(ctrlA)}")
    print(f"  $2001 PPUMASK = ${maskA:02X}  {mask_bits(maskA)}")
    print(f"  $2005 scrollX = {dump['bandA_scrollX']}   scrollY = {dump['bandA_scrollY']}")
    print(f"  written at PPU scanline {dump['bandA_scanline']}, dot {dump['bandA_cycle']}")

    if dump["split_ran"]:
        ctrlB = dump["split_bandB_ppuctrl"]
        print("\nBAND B  (the sprite-0 split at $9AA3)")
        print(f"  sprite-0 spin exits  scanline {dump['split_spinExitScanline']}"
              f" dot {dump['split_spinExitCycle']}  ({dump['split_spins']} spins)")
        print(f"  $2005 scrollX/Y = 0,0 written at scanline "
              f"{dump['split_scrollWriteScanline']} dot {dump['split_scrollWriteCycle']}"
              f"   ($9AB2/$9AB5, X = 0 from $9AB0)")
        print(f"  $2000 PPUCTRL = ${ctrlB:02X}  {ctrl_bits(ctrlB)}")
        print(f"      written at scanline {dump['split_ctrlWriteScanline']}"
              f" dot {dump['split_ctrlWriteCycle']}  ($9ABC, A = $10 AND #$FC)")
    else:
        print("\nBAND B: the split did not run on this frame")

    print("\nCHR LATCHES this frame ($8AA1/$8AA4, CNROM, bank = $8AA8[Y] & 3)")
    for e in dump["chrLatches"]:
        print(f"  Y={e['y']}  -> bank {e['bank']}  chrMemoryOffset0={e['off']}"
              f"  at scanline {e['sl']:>3} dot {e['dot']:>3}")

    print("\nPALETTE RAM $3F00-$3F1F")
    for i in range(4):
        print("  bg%d $3F%02X: " % (i, i * 4) +
              " ".join(f"{b:02X}" for b in pal[i * 4:i * 4 + 4]))
    for i in range(4):
        print("  sp%d $3F%02X: " % (i, 0x10 + i * 4) +
              " ".join(f"{b:02X}" for b in pal[0x10 + i * 4:0x10 + i * 4 + 4]))

    # Mirroring, checked rather than cited: with VERTICAL mirroring $2800 is the
    # same physical RAM as $2000 and $2C00 as $2400. With horizontal it would be
    # $2400==$2000. Both are testable from one 4 KB read, and they disagree, so
    # this is a check that can fail.
    a, b, c, d = nt[0:0x400], nt[0x400:0x800], nt[0x800:0xC00], nt[0xC00:0x1000]
    print("\nMIRRORING (from the 4 KB PPU read, not from the header)")
    print(f"  $2000 == $2800 : {a == c}      (true iff VERTICAL)")
    print(f"  $2400 == $2C00 : {b == d}      (true iff VERTICAL)")
    print(f"  $2000 == $2400 : {a == b}      (true iff HORIZONTAL, or identical data)")
    print(f"  emulator says  : {dump.get('mirroringType')}")

    live = 0
    for i in range(64):
        y = oam[i * 4]
        if y < 0xEF:
            live += 1
    print(f"\nOAM: {live} of 64 entries on screen (Y < $EF).  "
          f"sprite 0 = y={oam[0]} tile=${oam[1]:02X} attr=${oam[2]:02X} x={oam[3]}")


def ctrl_bits(v: int) -> str:
    if v < 0:
        return "(not latched)"
    return (f"NT=${0x2000 + 0x400 * (v & 3):04X} "
            f"inc={32 if v & 4 else 1} "
            f"sprPat=${0x1000 if v & 8 else 0:04X} "
            f"bgPat=${0x1000 if v & 0x10 else 0:04X} "
            f"sprSize={'8x16' if v & 0x20 else '8x8'} "
            f"nmi={'on' if v & 0x80 else 'off'}")


def mask_bits(v: int) -> str:
    if v < 0:
        return "(not latched)"
    f = []
    if v & 0x01: f.append("greyscale")
    f.append("bgLeft8" + ("=show" if v & 0x02 else "=HIDE"))
    f.append("sprLeft8" + ("=show" if v & 0x04 else "=HIDE"))
    f.append("bg" + ("=on" if v & 0x08 else "=OFF"))
    f.append("spr" + ("=on" if v & 0x10 else "=OFF"))
    if v & 0xE0: f.append(f"emphasis={(v >> 5) & 7}")
    return " ".join(f)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", type=int, default=400, help="game frame to dump")
    ap.add_argument("--frames", type=int, default=None)
    ap.add_argument("--script", default=BOOT)
    ap.add_argument("--patch", default="", help="PRG patches, e.g. 9AC0=00")
    ap.add_argument("--oam", default="",
                    help="inject sprites: 'i:y,tile,attr,x;...' (i >= 1)")
    ap.add_argument("--vram", default="",
                    help="inject nametable bytes: 'PPUADDR:hh,hh,...;...'")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    out = Path(a.out) if a.out else HERE / "out" / "video" / f"f{a.at}"
    if not out.is_absolute():
        out = (Path.cwd() / out).resolve()
    dump = run(a.at, out, frames=a.frames, script=a.script, patch=a.patch,
               oam=a.oam, vram=a.vram)
    for line in dump["_lines"]:
        if line.startswith(("framebuffer.", "patch ", "lag.", "injected")):
            print("  " + line)
    describe(out, dump)
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
