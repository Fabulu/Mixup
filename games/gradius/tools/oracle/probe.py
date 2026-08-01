#!/usr/bin/env python3
"""Reference trace: run the REAL Gradius cartridge headless and dump per-frame state.

This is the first real oracle probe for phase 2 -- the NES counterpart of
Batman's tools/oracle/probe.py + trace.py. The emulator never ships; this exists
so that "faithful" is a checkable property (docs/knowledge/01-the-oracle-method.md).

It boots the cartridge, drives the CONTROLLER (not RAM) through a scripted button
sequence, and samples the game's state once per game frame at an exec hook on
$80B5 -- the last instruction of the NMI handler, which is this game's entire
main loop. See probe.lua for the measurement that justifies that address.

Usage
  # 400 game frames, idle boot, JSON to out/probe.json
  python games/gradius/tools/oracle/probe.py --frames 400

  # boot to gameplay and hold RIGHT for 200 frames
  python games/gradius/tools/oracle/probe.py --frames 600 \
      --script "200:,10:S,90:,300:R" --shot out/right.png

  # determinism: same script twice, byte-identical JSON
  python games/gradius/tools/oracle/probe.py --frames 400 --twice

  # measure the input lead instead of inheriting the Game Boy's
  python games/gradius/tools/oracle/probe.py --lead

  # record $0000-$07FF every frame, for ramdiff.py
  python games/gradius/tools/oracle/probe.py --frames 600 \
      --script "200:,10:S,90:,300:R" --ramdump out/right.ram

MEASURED, not assumed (all of it printed by running this file or verify runs):
  * $FFFA -> $806A. The probe re-reads the vector at runtime and refuses to run
    if it is not what it hooked.
  * RESET ends `4C 67 80  JMP $8067` -- an empty spin. There is no main loop, so
    the NMI handler IS the frame and $80B5 is where it is unambiguously finished.
  * $04 reads 1 at every sample, because $80B5 (`STA $04`) has not executed yet.
    The probe asserts this on every frame; if the hook ever landed somewhere else
    the check fails loudly rather than producing a plausible wrong trace.
  * Buttons travel through the controller port: we set them on inputPolled and
    then observe them in $9C, which the game only fills by strobing $4016 at
    $81BF. Nothing is poked into RAM.
  * Lag frames = NMI entries that never reached $80B5. Counted, reported, never
    hidden (docs/knowledge/02 trap #6).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
LUA = HERE / "probe.lua"
OUT = HERE / "out"

# The default boot: idle to the title screen, tap START, let the stage load.
# Measured: mode ($00) reaches 5 (gameplay) and the sprite-0 split starts firing.
BOOT = "200:,10:S,90:"


VIDEO_SEED_BYTES = 2048 + 32 + 256      # nametables + palette RAM + hardware OAM


def run(frames: int, script: str, json_out: Path, *, ramdump: Path | None = None,
        watch: str = "", shot: Path | None = None, poke: str = "",
        video: Path | None = None, video_at: list[int] | None = None,
        timeout_s: int = 300):
    # Mesen's cwd is not ours, so every path handed to the Lua side must be
    # absolute. A relative one fails inside io.open, which used to surface as a
    # stale JSON file being re-read as if it were the new run's output.
    json_out = json_out.resolve()
    json_out.parent.mkdir(parents=True, exist_ok=True)
    env = {
        "PROBE_FRAMES": str(frames),
        "PROBE_SCRIPT": script,
        "PROBE_JSON": str(json_out),
        "PROBE_WATCH": watch,
        "PROBE_POKE": poke,
    }
    if ramdump:
        ramdump = ramdump.resolve()
        ramdump.parent.mkdir(parents=True, exist_ok=True)
        env["PROBE_RAMDUMP"] = str(ramdump)
    if shot:
        shot = shot.resolve()
        shot.parent.mkdir(parents=True, exist_ok=True)
        env["PROBE_SHOT"] = str(shot)
    # THE VIDEO DUMPS (wave 10). PPU $2000-$27FF + palette RAM + hardware OAM,
    # one blob per requested frame: the state the port cannot rebuild when a
    # scenario starts deep, and the state it must have PRODUCED by the end.
    if video is not None:
        if not video_at:
            raise SystemExit("probe.run: video= needs a non-empty video_at=[...]")
        video = video.resolve()
        video.parent.mkdir(parents=True, exist_ok=True)
        video.unlink(missing_ok=True)      # never re-read a previous run's blob
        env["PROBE_VIDEO"] = str(video)
        env["PROBE_VIDEO_AT"] = ",".join(str(f) for f in video_at)
    # Delete the target first: if the script dies, we must not silently read the
    # previous run's file and report it as this run's result.
    json_out.unlink(missing_ok=True)

    r = mesen.run_script(LUA, timeout_s=timeout_s, env_extra=env)
    err = [l for l in r.lines if l.startswith("ERROR = ")]
    if err:
        raise SystemExit("probe.lua failed: " + err[0][len("ERROR = "):])
    if "END" not in r.lines:
        print(r.stdout[-4000:], file=sys.stderr)
        raise SystemExit(f"probe.lua did not finish (exit {r.returncode}) -- "
                         f"a missing END means the script died mid-callback")
    if not json_out.exists():
        raise SystemExit(f"probe.lua reported END but wrote no {json_out}")
    if video is not None:
        # probe.lua already dies if it never reached the frame; this catches the
        # OTHER failure -- a short write -- rather than letting a truncated blob
        # become a silently truncated nametable in every artifact downstream.
        if not video.exists():
            raise SystemExit(f"probe.lua reported END but wrote no {video}")
        n = video.stat().st_size
        want = VIDEO_SEED_BYTES * len(video_at)
        if n != want:
            raise SystemExit(f"{video} is {n} bytes, expected {want} "
                             f"({len(video_at)} x {VIDEO_SEED_BYTES})")
    return r


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# ------------------------------------------------------------------ checks ---

def validate(doc: dict) -> list[tuple[bool, str]]:
    """Checks that CAN fail. Each returns (ok, message)."""
    fr = doc["frames"]
    out = []
    out.append((len(fr) == doc["gameFrames"] and len(fr) > 0,
                f"sampled {len(fr)} game frames"))
    out.append((all(f["frame"] == i for i, f in enumerate(fr)),
                "frame numbers are dense and in order"))
    bad = [f["frame"] for f in fr if f["guard"] != 1]
    out.append((not bad,
                f"$04 == 1 at every sample (the hook is really at $80B5); "
                f"{len(bad)} violations"))
    out.append((doc["lagFrames"] >= 0,
                f"lagFrames = {doc['lagFrames']} "
                f"({doc['nmiEntries']} NMI entries, {doc['gameFrames']} completed)"))
    # The player invariants we measured, asserted on every run that exercises
    # them. Skipped rather than silently passed when the script never presses a
    # direction -- a check that cannot fail is worse than no check (trap #4).
    for bit, name, key, sign in ((0x01, "RIGHT", "playerX", +1),
                                 (0x02, "LEFT", "playerX", -1),
                                 (0x04, "DOWN", "playerY", +1),
                                 (0x08, "UP", "playerY", -1)):
        idx = [i for i, f in enumerate(fr)
               if i and (fr[i - 1]["held"] & bit) and f["mode"] == 5]
        if not idx:
            continue
        bad = [fr[i]["frame"] for i in idx
               if (fr[i][key] - fr[i - 1][key]) * sign < 0]
        out.append((not bad,
                    f"{key} never moves against {name} while it is held "
                    f"({len(idx)} such frames, {len(bad)} violations)"))

    # a trace with no transitions is a vacuous trace (trap 4.3)
    varying = [k for k in doc["fields"]
               if k not in ("frame", "cpuCycle", "counter")
               and len({f[k] for f in fr}) > 1]
    out.append((len(varying) > 0,
                f"{len(varying)} fields actually change over the run: "
                f"{', '.join(varying[:12])}"))
    return out


def summarize(doc: dict, path: Path):
    fr = doc["frames"]
    print(f"  {path}  ({len(fr)} game frames, sha256 {sha256(path)[:16]}…)")
    print(f"  script            : {doc['inputScript']!r}")
    print(f"  nmiEntries        : {doc['nmiEntries']}")
    print(f"  lagFrames         : {doc['lagFrames']}")
    print(f"  inputPolls        : {doc['inputPolls']} "
          f"({doc['inputPollsForced']} with a button forced)")
    print()
    print("  mode ($00) timeline:")
    prev = None
    for f in fr:
        if f["mode"] != prev:
            print(f"    frame {f['frame']:5d}  mode {f['mode']:3d}  "
                  f"counter ${f['counter']:02X}  chrBank {f['chrBank']}  "
                  f"scrollX {f['scrollX']:3d}  splitSpins {f['splitSpins']}")
            prev = f["mode"]
    play = [f for f in fr if f["mode"] == 5]
    if play:
        print("  player, every 20th gameplay frame:")
        print(f"    {'frame':>6} {'held':>5} {'X':>4} {'Y':>4}   "
              f"{'opt1':>9} {'opt2':>9}  scrollLo")
        for f in play[::20]:
            print(f"    {f['frame']:6d}  ${f['held']:02X} "
                  f"{f['playerX']:4d} {f['playerY']:4d}   "
                  f"{f['opt1X']:4d},{f['opt1Y']:<4d} "
                  f"{f['opt2X']:4d},{f['opt2Y']:<4d}  {f['scrollLo']:3d}")
        xs = [f["playerX"] for f in play]
        ys = [f["playerY"] for f in play]
        print(f"    X range {min(xs)}..{max(xs)}   Y range {min(ys)}..{max(ys)}")
        print()
    print("  first frame where each field changes:")
    for k in doc["fields"]:
        if k in ("frame",):
            continue
        base = fr[0][k]
        first = next((f["frame"] for f in fr if f[k] != base), None)
        n = len({f[k] for f in fr})
        if first is not None:
            print(f"    {k:16s} first change @ {first:5d}   distinct {n}")


# ------------------------------------------------------------- input lead ----

def measure_lead(frames: int):
    """Measure whether a button applied at game frame N acts on frame N.

    The Game Boy needed buttons held one tick early (docs/knowledge/01, "Input
    has a lead"). Do not inherit that -- this measures it.

    Method: hold START for exactly one game frame, at a frame chosen while the
    title screen is idle, and find (a) the frame at which $9C first reports the
    button and (b) the frame at which the game's own state first reacts. If the
    lead is zero, $9C reports it on the very frame we asked for.
    """
    press_at = 220
    script = f"{press_at}:,1:S,60:"
    p = OUT / "lead.json"
    run(frames, script, p)
    doc = json.loads(p.read_text())
    fr = doc["frames"]
    seen = [f["frame"] for f in fr if f["pad1"] != 0]
    print(f"  asked for START on game frame {press_at} only")
    print(f"  firstForcedInputFrame (probe side) = {doc['firstForcedInputFrame']}")
    print(f"  frames where $9C != 0              = {seen}")
    print(f"  $9C values                         = "
          f"{[(f['frame'], hex(f['pad1'])) for f in fr if f['pad1'] != 0]}")
    modes = [(f["frame"], f["mode"]) for i, f in enumerate(fr)
             if i and f["mode"] != fr[i - 1]["mode"]]
    print(f"  mode ($00) transitions             = {modes}")
    # The consequence, not just the latch: START on the title screen advances
    # the game mode. If that happens on the press frame too, the whole chain
    # (controller port -> $9C -> state machine) fits inside one NMI.
    reacted = next((f for f, m in modes if f >= press_at), None)
    if seen and seen[0] == press_at:
        print(f"\n  LEAD = 0. A button applied at the inputPolled of game frame N "
              f"is\n  visible in $9C at that same frame's $80B5 sample. The Game "
              f"Boy's\n  one-tick lead does NOT apply: $81BF is called at $80A4, "
              f"inside the\n  same NMI, before the state machine at $80AA.")
        print(f"  [{'PASS' if reacted == press_at else 'FAIL'}] and the game "
              f"REACTED on the same frame: mode changed at {reacted}")
    elif seen:
        print(f"\n  LEAD = {seen[0] - press_at} frames. Encode this in the harness.")
    else:
        print("\n  $9C never became non-zero -- the button did not reach the game. "
              "Check the script.")


# ------------------------------------------------------------- poke check ---

def pokecheck(addr: int, value: int, frames: int = 460):
    """Turn "this address correlates with the player" into "it CONTROLS it".

    Correlation is what a RAM diff gives you and it is not proof: a copy of the
    player's X, a shadow-OAM byte and the real variable all correlate perfectly.
    So: run the identical script twice, force the address in one of them, and
    compare the shadow OAM and the actual pixels. A poke that moves the picture
    is an intervention, not an observation.
    """
    script = BOOT + ",160:R"
    hold_from, hold_to = frames - 60, frames - 1
    base_j, poke_j = OUT / "poke_base.json", OUT / "poke_poked.json"
    base_p, poke_p = OUT / "poke_base.png", OUT / "poke_poked.png"
    watch = f"{addr:04X}"

    rb = run(frames, script, base_j, watch=watch, shot=base_p)
    rp = run(frames, script, poke_j, watch=watch, shot=poke_p,
             poke=f"{addr:04X}={value}@{hold_from}-{hold_to}")

    db, dp = json.loads(base_j.read_text()), json.loads(poke_j.read_text())
    k = f"w_{addr:04X}"
    lb, lp = db["frames"][-1], dp["frames"][-1]
    fb_b, fb_p = rb.fields(), rp.fields()

    print(f"  script          : {script!r}")
    print(f"  poke            : ${addr:04X} = {value} on game frames "
          f"{hold_from}-{hold_to}  ({fb_p.get('pokesApplied')} writes)")
    print(f"  ${addr:04X} at final frame : baseline {lb[k]}   poked {lp[k]}")
    print(f"  framebuffer fnv1a         : baseline {fb_b.get('framebuffer.fnv1a')}"
          f"   poked {fb_p.get('framebuffer.fnv1a')}")
    print(f"  non-black pixels          : baseline "
          f"{fb_b.get('framebuffer.nonBlackPixels')}   poked "
          f"{fb_p.get('framebuffer.nonBlackPixels')}")
    print(f"  PNGs                      : {base_p}  {poke_p}")

    checks = [
        (lp[k] == value or abs(lp[k] - value) <= 2,
         f"the ROM kept the poked value (${addr:04X} reads {lp[k]}, asked {value})"),
        (fb_b.get("framebuffer.fnv1a") != fb_p.get("framebuffer.fnv1a"),
         "the PICTURE changed -- the poke is visible on screen"),
        (int(fb_p.get("framebuffer.nonBlackPixels", 0)) > 1000,
         "the poked frame is still a real picture, not a blank/garbage screen"),
    ]
    fails = 0
    for ok, msg in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
        fails += 0 if ok else 1
    return 1 if fails else 0


# ------------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", type=int, default=400,
                    help="number of GAME frames to sample")
    ap.add_argument("--script", default=BOOT,
                    help='input script, "count:buttons" segments (UDLRABSE)')
    ap.add_argument("--out", type=Path, default=OUT / "probe.json")
    ap.add_argument("--ramdump", type=Path, default=None,
                    help="also write $0000-$07FF per frame, raw, for ramdiff.py")
    ap.add_argument("--watch", default="",
                    help="extra hex addresses to sample, e.g. 0360,0361")
    ap.add_argument("--shot", type=Path, default=None,
                    help="PNG of the final sampled frame")
    ap.add_argument("--twice", action="store_true",
                    help="run the identical script twice and diff the JSON")
    ap.add_argument("--lead", action="store_true",
                    help="measure the input lead instead of tracing")
    ap.add_argument("--poke", default="",
                    help="force RAM at the sample point: ADDR=VAL@FROM-TO")
    ap.add_argument("--pokecheck", metavar="ADDR=VAL",
                    help="prove an address controls the player, e.g. 0360=40")
    args = ap.parse_args()

    if args.pokecheck:
        a, _, v = args.pokecheck.partition("=")
        print("=== POKE CHECK: correlation -> causation ===")
        return pokecheck(int(a, 16), int(v))

    if args.lead:
        print("=== INPUT LEAD ===")
        measure_lead(320)
        return 0

    if args.twice:
        a, b = OUT / "twiceA.json", OUT / "twiceB.json"
        print("=== DETERMINISM: two separate Mesen processes, identical script ===")
        for tag, p in (("A", a), ("B", b)):
            r = run(args.frames, args.script, p, ramdump=OUT / f"twice{tag}.ram")
            f = r.fields()
            print(f"  run {tag}: gameFrames={f.get('gameFrames')} "
                  f"lag={f.get('lagFrames')} finalMode={f.get('finalMode')} "
                  f"json sha256={sha256(p)}")
        ok_json = a.read_bytes() == b.read_bytes()
        ra, rb = OUT / "twiceA.ram", OUT / "twiceB.ram"
        ok_ram = ra.read_bytes() == rb.read_bytes()
        print(f"  [{'PASS' if ok_json else 'FAIL'}] state-vector JSON byte-identical")
        print(f"  [{'PASS' if ok_ram else 'FAIL'}] full RAM dump byte-identical "
              f"({ra.stat().st_size} bytes each)")
        doc = json.loads(a.read_text())
        print()
        for ok, msg in validate(doc):
            print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
        return 0 if ok_json and ok_ram else 1

    r = run(args.frames, args.script, args.out, ramdump=args.ramdump,
            watch=args.watch, shot=args.shot, poke=args.poke)
    doc = json.loads(args.out.read_text())
    print("=== ORACLE TRACE ===")
    summarize(doc, args.out)
    print()
    fails = 0
    for ok, msg in validate(doc):
        print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
        fails += 0 if ok else 1
    if args.ramdump:
        print(f"\n  RAM dump: {args.ramdump} "
              f"({args.ramdump.stat().st_size} bytes = "
              f"{args.ramdump.stat().st_size // 2048} frames x 2048)")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
