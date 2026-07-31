#!/usr/bin/env python3
"""Record the ORACLE side of the comparison corpus.

For every scenario in `scenarios.json` this runs the real cartridge TWICE under
headless Mesen -- once with `probe.lua` (the proven state vector, extended
through its own `--watch` mechanism rather than by editing it) and once with
`objloop.lua` (the work-budget counters NOTES-lag.md asks for) -- merges the two
by frame index, and writes one self-contained artifact per scenario:

    games/gradius/tools/oracle/out/scen/<name>.json

Each artifact carries:
  * the merged per-frame state vector, one row per GAME frame;
  * `seedRam`: the cartridge's full $0000-$07FF at the align frame, base64.
    This is what `porttrace.mjs` starts the port from, and it is the reason the
    comparison can be absolute rather than relative -- the camera, the ring and
    the sub-pixel accumulators all begin from the machine's own values;
  * `lagDrops`: the game frames at which an NMI found the $04 guard set and
    bailed, from BOTH scripts, independently.

EVERYTHING HERE IS ROM-DERIVED and lands under out/, which this directory's
.gitignore excludes. Nothing produced by this file may be committed.

WHAT THE MERGE ASSERTS, because two processes are not one process:
  * both runs sampled the same number of game frames;
  * playerX, playerY and the frame counter $02 agree on EVERY frame;
  * both runs' lag counts agree;
  * the nesting invariants of the counters hold:
        spritesStored <= spriteRecords,  msExpanded <= slotsVisited <= 32.
A failure of any of these is a hard error, not a warning: it would mean the two
halves of every subsequent comparison came from different games.

Usage
  python games/gradius/tools/oracle/scen.py                # all scenarios
  python games/gradius/tools/oracle/scen.py --only idle right-wall
  python games/gradius/tools/oracle/scen.py --list
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
SCEN = HERE / "scenarios.json"
OUT = HERE / "out" / "scen"
OBJ_LUA = HERE / "objloop.lua"


def load_defs() -> dict:
    return json.loads(SCEN.read_text(encoding="utf8"))


def script_frames(script: str) -> int:
    """Total game frames a probe.lua input script covers."""
    n = 0
    for seg in script.split(","):
        seg = seg.strip()
        if not seg:
            continue
        m = re.match(r"^\s*(\d+)\s*:", seg)
        if not m:
            raise SystemExit(f"bad script segment {seg!r}")
        n += int(m.group(1))
    return n


def run_objloop(frames: int, script: str, out: Path, *, poke: str = "",
                timeout_s: int = 300):
    out = out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.unlink(missing_ok=True)      # never re-read a previous run's file
    r = mesen.run_script(OBJ_LUA, timeout_s=timeout_s, env_extra={
        "OBJ_FRAMES": str(frames), "OBJ_SCRIPT": script, "OBJ_JSON": str(out),
        "OBJ_POKE": poke})
    err = [l for l in r.lines if l.startswith("ERROR = ")]
    if err:
        raise SystemExit("objloop.lua failed: " + err[0][len("ERROR = "):])
    if "END" not in r.lines:
        print(r.stdout[-3000:], file=sys.stderr)
        raise SystemExit(f"objloop.lua did not finish (exit {r.returncode})")
    if not out.exists():
        raise SystemExit(f"objloop.lua reported END but wrote no {out}")
    return r


def drops_from_stdout(run) -> list[int]:
    """probe.lua prints `lag.dropAtGameFrame = N` for each dropped NMI."""
    return [int(l.split("=", 1)[1]) for l in run.lines
            if l.startswith("lag.dropAtGameFrame")]


def build(name: str, defs: dict, *, keep_ram: bool = False) -> dict:
    scn = next(s for s in defs["scenarios"] if s["name"] == name)
    align = defs["align"]
    script = defs["bootPrefix"] + "," + scn["tail"]
    frames = script_frames(script)
    if frames <= align:
        raise SystemExit(f"{name}: {frames} frames does not reach align {align}")

    watch = ",".join(defs["watch"])
    pj = OUT / f"{name}.probe.json"
    ram = OUT / f"{name}.ram"
    oj = OUT / f"{name}.objloop.json"

    # INJECTION. Power-ups are unreachable from a button script, so a scenario
    # may force one. probe.lua writes the value at $80B5 AFTER taking the
    # sample, which is the SAME instant porttrace.mjs applies it -- the two
    # harnesses stay frame-aligned (docs/knowledge/01, "apply them at the same
    # point on both sides or every warped scenario sits permanently one frame
    # skewed"). The window starts at `align`, so the seed is unpoked and the
    # first affected frame is align+1 on both sides.
    #
    # A segment may carry `@+N` -- ONE frame, at align+N -- instead of taking the
    # default whole-window hold. That is not a convenience: a value the cartridge
    # itself only ever holds for one frame must be injected for one frame, or the
    # scenario tests invented state. $1F is the case that forced it ($9C38
    # `A9 01 85 1F`, the sprite-0 handover: the very next $8B1A promotes it to 2,
    # so "held at 1" is a state no cartridge frame is ever in).
    segs = []
    for seg in scn.get("poke", "").split(","):
        seg = seg.strip()
        if not seg:
            continue
        if "@" in seg:
            body, _, at = seg.partition("@")
            if not at.startswith("+"):
                raise SystemExit(f"{name}: poke window {at!r} must be '+N' "
                                 f"(one frame at align+N)")
            f = align + int(at[1:])
            if not (align <= f <= frames - 1):
                raise SystemExit(f"{name}: poke frame {f} is outside the compared "
                                 f"window {align}..{frames - 1}")
            segs.append(f"{body.strip()}@{f}-{f}")
        else:
            segs.append(f"{seg}@{align}-{frames - 1}")
    poke = ",".join(segs)

    rp = probe.run(frames, script, pj, ramdump=ram, watch=watch, poke=poke,
                   timeout_s=300)
    ro = run_objloop(frames, script, oj, poke=poke)

    pdoc = json.loads(pj.read_text())
    odoc = json.loads(oj.read_text())
    pf, of = pdoc["frames"], odoc["frames"]

    # --- the merge assertions. These are the reason two processes are allowed.
    if len(pf) != len(of):
        raise SystemExit(f"{name}: probe sampled {len(pf)} frames, "
                         f"objloop {len(of)} -- not the same run")
    bad = [i for i in range(len(pf))
           if pf[i]["playerX"] != of[i]["playerX"]
           or pf[i]["playerY"] != of[i]["playerY"]
           or pf[i]["counter"] != of[i]["counter"]]
    if bad:
        raise SystemExit(f"{name}: the two Mesen processes DISAGREE on "
                         f"{len(bad)} frames (first {bad[0]}) -- the run is not "
                         f"deterministic and nothing downstream is meaningful")
    for i, r in enumerate(of):
        if not (r["spritesStored"] <= r["spriteRecords"]):
            raise SystemExit(f"{name} f{i}: spritesStored {r['spritesStored']} > "
                             f"spriteRecords {r['spriteRecords']}")
        if not (r["msExpanded"] <= r["slotsVisited"] <= 32):
            raise SystemExit(f"{name} f{i}: msExpanded {r['msExpanded']}, "
                             f"slotsVisited {r['slotsVisited']} -- outside 0..32")
        # The enemy loop ($ADB7) is `LDX $A8 / JSR $ADE5 / DEC $A8 / BPL` with
        # no early exit, so it is 10 on every frame the state machine reaches
        # $9A6D and 0 on every other one.  Anything else is docs/knowledge/06
        # model (C) and would have to be modelled, not averaged away.
        if r["enemySlots"] not in (0, 10):
            raise SystemExit(f"{name} f{i}: $ADE5 ran {r['enemySlots']} times, "
                             f"not 0 or 10 -- the enemy loop is not fixed-shape")

    pdrops = drops_from_stdout(rp)
    odrops = [r["frame"] for r in of for _ in range(r["lagged"])]
    if sorted(pdrops) != sorted(odrops):
        raise SystemExit(f"{name}: the two runs disagree about LAG -- "
                         f"probe {pdrops}, objloop {odrops}")

    rambytes = ram.read_bytes()
    if len(rambytes) != 2048 * len(pf):
        raise SystemExit(f"{name}: ram dump is {len(rambytes)} bytes, expected "
                         f"{2048 * len(pf)}")
    seed = rambytes[align * 2048:(align + 1) * 2048]

    merged = []
    for a, b in zip(pf, of):
        row = dict(a)
        for k in ("slotsVisited", "msExpanded", "spriteRecords",
                  "spritesStored", "enemySlots", "lagged"):
            row[k] = b[k]
        merged.append(row)

    doc = {
        "tool": "games/gradius/tools/oracle/scen.py",
        "rom": "Gradius (USA).nes",
        "note": "ROM-DERIVED. Do not commit.",
        "scenario": name,
        "why": scn["why"],
        "inputScript": script,
        # The EXPANDED poke, in absolute game frames -- not the scenario's `@+N`
        # shorthand. porttrace.mjs reads this field and must apply the value at
        # exactly the frames probe.lua did; handing it the shorthand would make
        # the two harnesses resolve `align` independently, which is the drift
        # this one-file corpus exists to prevent.
        "poke": poke,
        "align": align,
        "gameFrames": len(merged),
        "lagFrames": pdoc["lagFrames"],
        "lagDrops": sorted(pdrops),
        "samplePoint": pdoc["samplePoint"],
        "fields": pdoc["fields"] + ["slotsVisited", "msExpanded",
                                    "spriteRecords", "spritesStored",
                                    "enemySlots", "lagged"],
        "seedRam": base64.b64encode(seed).decode("ascii"),
        "frames": merged,
    }
    (OUT / f"{name}.json").write_text(json.dumps(doc), encoding="utf8")

    if not keep_ram:
        ram.unlink(missing_ok=True)      # 2 KB x frames, only the seed is kept
    pj.unlink(missing_ok=True)
    oj.unlink(missing_ok=True)

    fo = ro.fields()
    if poke:
        print(f"  {'':12s}   poke {poke}")
    print(f"  {name:12s} {len(merged):5d} frames  lag={pdoc['lagFrames']} "
          f"{pdrops if pdrops else ''}  "
          f"slotsVisited {fo['slotsVisitedMin']}..{fo['slotsVisitedMax']}  "
          f"msExpanded/f {int(fo['msExpandedTotal']) / len(merged):.2f}  "
          f"stored/f {int(fo['spritesStoredTotal']) / len(merged):.2f}")
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--keep-ram", action="store_true",
                    help="keep the full per-frame RAM dump, not just the seed")
    args = ap.parse_args()

    defs = load_defs()
    names = [s["name"] for s in defs["scenarios"]]
    if args.list:
        for s in defs["scenarios"]:
            print(f"  {s['name']:12s} {defs['bootPrefix']},{s['tail']}")
        return 0
    if args.only:
        unknown = [n for n in args.only if n not in names]
        if unknown:
            raise SystemExit(f"unknown scenario(s): {unknown}; have {names}")
        names = args.only

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"=== ORACLE CORPUS: {len(names)} scenarios, align frame "
          f"{defs['align']}, {len(defs['watch'])} watched addresses ===")
    for n in names:
        build(n, defs, keep_ram=args.keep_ram)
    print(f"\n  written to {OUT}  (ROM-derived, gitignored)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
