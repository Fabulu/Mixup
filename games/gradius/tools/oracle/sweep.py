#!/usr/bin/env python3
"""sweep.py -- record ONE long cartridge run and a SEED EVERY N FRAMES.

WAVE 20 / recon 4. Wave 10 built "seed the port at any cartridge frame" and it
was used for two scenarios. This is the machinery that uses it to sweep the
WHOLE stage: a single cartridge run, with the video seed dumped at regular
intervals, so that sweep.mjs can start the port at EVERY one of those frames and
say what it does there.

WHY ONE RUN AND NOT N SCENARIOS. scen.py boots the cartridge twice per scenario;
a 140-seed sweep would be 280 emulator runs. probe.lua already takes a full
$0000-$07FF dump on every sampled frame and PROBE_VIDEO_AT already accepts a
LIST of frames, so one run gives every seed AND the oracle's side of every
comparison for free:

  * the SEED at frame f   = ram[f] + the video blob recorded at f;
  * the ORACLE ROWS for f+1..f+W = ram[f+1..f+W], read directly. Every one of
    the corpus's 1022 watched addresses is below $0800 (checked here), so the
    RAM dump IS the watch vector -- no 80 MB JSON of repeated field names.

THE POWER-UP POINT, from wave 12's audit and repeated by the owner: every
UNPOWERED run stalled at scroll $04BD while the run carrying power-ups reached
$0A64 and four otherwise-unreached handlers. So the default run is POWERED, and
an unpowered run is recorded alongside it for contrast rather than instead.

    python games/gradius/tools/oracle/sweep.py                    # both runs
    python games/gradius/tools/oracle/sweep.py --only powered
    python games/gradius/tools/oracle/sweep.py --frames 3000 --every 30

Outputs, all under out/sweep/ and all ROM-DERIVED (gitignored, never committed):
    <run>.json    meta + the per-frame BASE probe row (no watch list)
    <run>.ram     $0000-$07FF x gameFrames, the oracle side of every window
    <run>.video   the video seed blob at each seed frame
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "sweep"
SCEN = HERE / "scenarios.json"

# The corpus's own boot prefix. A script that never presses START measures the
# ATTRACT DEMO -- wave 12 fell into that and wrote it into PROBE.md 5.
BOOT = "200:,10:S,190:"

# The only trajectory measured to survive stage 1's opening (wave 10 measured
# first death for every fixed hold; RD/RU is the one that lives). The tail is
# open-ended: `--frames` decides how long it runs.
TRAJ = [(1350, "RDA"), (324, "RUA"), (80, "RDA")]

POWER = "0044=2,0045=2,0046=5,0041=1"
# $44 = 2 DOUBLE, $45 = 2 Options, $46 = 5 shield, $41 = 1 missiles -- the four
# the rank byte $17 is built from, and the four that made the difference between
# scroll $04BD and $0A64 in wave 12's audit.
#
# THE `boss` RUN IS MEASURED, NOT GUESSED. bossreach.py held seven different
# directions for the last 4000 frames; `RA` (what `powered` holds) dies at frame
# 5514 / scroll $0A28 and the checkpoint sends the camera back to $0800, but
# `RUA` and `UA` survive to scroll $0D00 with ZERO deaths and take $1B through
# $81 $82 $83 $84 $85 -- the boss and end-of-stage sub-states. So the boss IS
# reachable and this run is how the sweep gets there.
RUNS = {
    "powered":   {"poke": POWER, "switch": None, "tail": "RA"},
    "unpowered": {"poke": "",    "switch": None, "tail": "RA"},
    "boss":      {"poke": POWER, "switch": 5000, "tail": "RUA"},
}


def script_for(frames: int, switch=None, tail="RA") -> str:
    used = 400 + sum(n for n, _ in TRAJ)
    if frames <= used:
        raise SystemExit(f"--frames {frames} is shorter than the trajectory ({used})")
    segs = BOOT + "," + ",".join(f"{n}:{b}" for n, b in TRAJ)
    if switch and switch > used:
        segs += f",{switch - used}:RA"
        used = switch
    return segs + f",{frames - used}:{tail}"


def run_one(name: str, frames: int, every: int, first: int, spec: dict,
            timeout_s: int) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    poke = spec["poke"]
    script = script_for(frames, spec.get("switch"), spec.get("tail", "RA"))
    # A poke has to carry an ABSOLUTE frame window on both sides: probe.lua's
    # parser demands @FROM-TO and porttrace.mjs's reads the same string, so the
    # cartridge and the port apply it at the same $80B5 (docs/knowledge/01).
    poke_abs = ",".join(f"{p}@{first}-{frames - 1}"
                        for p in poke.split(",") if p)
    seeds = list(range(first, frames - every, every))
    jp, ram, vid = OUT / f"{name}.json", OUT / f"{name}.ram", OUT / f"{name}.video"
    print(f"=== {name}: {frames} frames, {len(seeds)} seeds every {every} "
          f"from {first}\n    script {script}\n    poke   {poke_abs or '(none)'}")
    r = probe.run(frames, script, jp, ramdump=ram, watch="", poke=poke_abs,
                  video=vid, video_at=seeds, timeout_s=timeout_s)
    doc = json.loads(jp.read_text())
    rows = doc["frames"]
    if len(rows) != frames:
        raise SystemExit(f"{name}: probe sampled {len(rows)} frames, want {frames}")
    n = ram.stat().st_size
    if n != 2048 * frames:
        raise SystemExit(f"{name}: ram dump is {n} bytes, want {2048 * frames}")

    scroll = [(row["scrollHi"] << 8) | row["scrollLo"] for row in rows]
    meta = {
        "tool": "games/gradius/tools/oracle/sweep.py",
        "note": "ROM-DERIVED. Do not commit.",
        "run": name, "script": script, "poke": poke_abs,
        "frames": frames, "every": every, "firstSeed": first,
        "seeds": seeds,
        "videoSeedBytes": probe.VIDEO_SEED_BYTES,
        "lagDrops": [int(l.split("=", 1)[1]) for l in r.lines
                     if l.startswith("lag.dropAtGameFrame")],
        "maxScroll": max(scroll),
        "rows": rows,
    }
    (OUT / f"{name}.meta.json").write_text(json.dumps(meta), encoding="utf8")
    jp.unlink(missing_ok=True)
    print(f"    max scroll ${max(scroll):04X} at frame {scroll.index(max(scroll))}"
          f"; lag drops {len(meta['lagDrops'])}; "
          f"ram {n // 1024} KB, video {vid.stat().st_size // 1024} KB")
    # WHERE THE RUN DIED, if it did. $1B = $A0 is the dying state ($C1D6), and
    # $1B is not in probe.lua's base KEYS -- it comes out of the RAM dump, which
    # is the same instant. Reported here so the run's own reach is a measured
    # number in this file's output rather than something sweep.mjs infers.
    ramb = ram.read_bytes()
    sub = [ramb[i * 2048 + 0x1B] for i in range(frames)]
    dying = [i for i, v in enumerate(sub) if v == 0xA0]
    print(f"    dying frames ($1B = $A0): {len(dying)}"
          + (f", first {dying[0]}" if dying else "")
          + f"; distinct $1B values {sorted(set(sub))}")
    meta["subStates"] = sorted(set(sub))
    meta["dyingFrames"] = dying
    (OUT / f"{name}.meta.json").write_text(json.dumps(meta), encoding="utf8")
    return meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=9000)
    ap.add_argument("--every", type=int, default=60)
    ap.add_argument("--first", type=int, default=400)
    ap.add_argument("--only", default="")
    ap.add_argument("--timeout", type=int, default=2400)
    a = ap.parse_args()

    # Every watched address must be inside the RAM dump, or the sweep's oracle
    # side is silently short. Asserted, not assumed.
    watch = [int(x, 16) for x in json.loads(SCEN.read_text())["watch"]]
    bad = [w for w in watch if w > 0x7FF]
    if bad:
        raise SystemExit(f"{len(bad)} watched addresses are above $07FF "
                         f"(first ${bad[0]:04X}) -- the RAM dump cannot carry "
                         f"them and sweep.mjs would compare nothing there")
    print(f"{len(watch)} watched addresses, all <= ${max(watch):04X}")

    for name, spec in RUNS.items():
        if a.only and a.only != name:
            continue
        run_one(name, a.frames, a.every, a.first, spec, a.timeout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
