#!/usr/bin/env python3
"""Find the code that moves the Vic Viper.

$0360 (player X) and $0320 (player Y) are the real variables -- proven by poke,
not by correlation (PROBE.md section 4). This tool answers the question a RAM
diff structurally cannot: WHICH INSTRUCTION writes them, and what else that same
routine touches.

It puts Mesen WRITE callbacks on the addresses, records the PC of every store
plus the 6502 return-address chain sitting on the stack, and buckets everything
per GAME frame (sampled at $80B5, the same point probe.lua proved).

Usage
  # who writes X and Y during 200 frames of held RIGHT?
  python playerhook.py --watch 0360,0320 --script "200:,10:S,90:,200:R" --frames 500

  # every write to the whole object X array, so the player's store is
  # distinguishable from the shared object loop
  python playerhook.py --watch 0360-037F --frames 500

  # dump individual writes with registers, for eight frames from frame 460
  python playerhook.py --trace 0360 --from 460 --tracen 8

  # put exec hooks on candidate routine entries and count hits per frame
  python playerhook.py --exec 8641,86A0 --frames 500

Checks that can fail (docs/knowledge/03):
  * --selfcheck runs the identical script with the watch range moved to an
    address the game never writes, and asserts ZERO sites.  A hook that reports
    something no matter where you point it is not evidence.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
LUA = HERE / "playerhook.lua"
OUT = HERE / "out"

# Same boot prefix ramdiff.py uses: title, START, stage load. Mode 5 at ~282,
# ship controllable at ~310.
BOOT = "200:,10:S,190:"


def run(*, frames: int, script: str, watch: str, json_out: Path,
        frm: int = 0, trace: str = "", tracen: int = 8, exec_addrs: str = "",
        order: str = "", ordern: int = 2, poke: str = "",
        stack: int = 3, timeout_s: int = 300):
    json_out = json_out.resolve()
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.unlink(missing_ok=True)
    env = {
        "PH_FRAMES": str(frames),
        "PH_SCRIPT": script,
        "PH_WATCH": watch,
        "PH_JSON": str(json_out),
        "PH_FROM": str(frm),
        "PH_TRACE": trace,
        "PH_TRACEN": str(tracen),
        "PH_EXEC": exec_addrs,
        "PH_POKE": poke,
        "PH_ORDER": order,
        "PH_ORDERN": str(ordern),
        "PH_STACK": str(stack),
    }
    r = mesen.run_script(LUA, timeout_s=timeout_s, env_extra=env)
    err = [l for l in r.lines if l.startswith("ERROR = ")]
    if err:
        raise SystemExit("playerhook.lua failed: " + err[0][len("ERROR = "):])
    if "END" not in r.lines:
        print(r.stdout[-4000:], file=sys.stderr)
        raise SystemExit(f"playerhook.lua did not finish (exit {r.returncode})")
    if not json_out.exists():
        raise SystemExit(f"reported END but wrote no {json_out}")
    return json.loads(json_out.read_text())


def report(doc: dict, *, top: int = 40):
    sites = sorted(doc["sites"], key=lambda s: -s["n"])
    print(f"  watch {doc['watch']}   game frames {doc['frames']}   "
          f"recording from frame {doc['from']}")
    print(f"  {len(doc['sites'])} distinct (address, PC) sites\n")
    print(f"    {'addr':>6} {'PC*':>6}  {'writes':>7} {'frames':>6} "
          f"{'/frame':>7}  {'first':>6} {'last':>6}  call chain (return addrs)")
    for s in sites[:top]:
        pfc = ",".join(str(c) for c in s["perFrameCounts"])
        chain = " <- ".join(f"${c:04X}" for c in s["chain"])
        print(f"    ${s['addr']:04X} ${s['pc']:04X}  {s['n']:7d} "
              f"{s['framesHit']:6d} {pfc:>7}  {s['firstFrame']:6d} "
              f"{s['lastFrame']:6d}  {chain}")
    print("\n  * PC is Mesen's cpu.pc at the moment of the store, i.e. the")
    print("    address AFTER the storing instruction's operand bytes.")
    print("  ! the call chain is a SCAN of the 6502 stack for bytes that look")
    print("    like return addresses. It is a lead, not a proof: stale bytes")
    print("    below the stack pointer survive and read as plausible callers")
    print("    ($AC9B showed up that way and is DATA at $AC82). Confirm a chain")
    print("    with --order, which logs real execution.")
    if doc["traces"]:
        print("\n  individual writes:")
        print(f"    {'frame':>6} {'PC':>6} {'val':>4} {'A':>4} {'X':>4} "
              f"{'Y':>4} {'held':>5} {'scan':>5}")
        for t in doc["traces"]:
            print(f"    {t['f']:6d} ${t['pc']:04X} {t['v']:4d} {t['a']:4d} "
                  f"{t['x']:4d} {t['y']:4d}  ${t['held']:02X} {t['scan']:5d}")
    if doc.get("order"):
        print("\n  execution ORDER (flat, per game frame):")
        prev_f, t0 = None, 0
        for d in doc["order"]:
            if d["f"] != prev_f:
                print(f"    --- game frame {d['f']} ---")
                prev_f, t0 = d["f"], d["cyc"]
            print(f"      +{d['cyc'] - t0:7d} cyc  scanline {d['scan']:4d}  "
                  f"${d['pc']:04X}   A=${d['a']:02X} X=${d['x']:02X} Y=${d['y']:02X}")
    if doc["exec"]:
        print("\n  exec hooks:")
        for e in doc["exec"]:
            print(f"    ${e['pc']:04X}  hits={e['n']}")
            for s in e["samples"][:24]:
                d = json.loads(s)
                print(f"       frame {d['f']:5d}  A=${d['a']:02X} X=${d['x']:02X} "
                      f"Y=${d['y']:02X} P=${d['p']:02X}")


def selfcheck(frames: int, script: str, frm: int = 450):
    """Negative controls. The hook must be SEEN to report nothing.

    docs/knowledge/03: a check you have never seen fail is not evidence. Three
    failure modes are ruled out here:

      1. a callback that fires regardless of the range handed to it,
      2. a callback that reports addresses outside its range (RAM mirrors:
         $0360 is also visible at $0B60, $1360, $1B60),
      3. a callback that fires on READS as well as writes -- $0360 is read far
         more often than it is written, so a read-firing hook would report a
         much larger count from a much larger set of PCs.

    The "dead" range $0600-$06FF was itself MEASURED, not assumed: the first
    version of this check used $0790-$079F and FAILED with 38 sites, because
    RESET's RAM-integrity test at $8037-$8050 writes the whole $0700 page. The
    window therefore also starts after boot.
    """
    print("=== SELF-CHECK: negative controls for the write hook ===")
    dead = run(frames=frames, script=script, watch="0600-06FF",
               json_out=OUT / "ph_dead.json", frm=frm)
    live = run(frames=frames, script=script, watch="0360",
               json_out=OUT / "ph_live.json", frm=frm)
    ndead = len(dead["sites"])
    nlive = len(live["sites"])
    outside = [s for s in live["sites"] if s["addr"] != 0x360]
    print(f"  dead range $0600-$06FF (frames {frm}+) : {ndead} sites, "
          f"{sum(s['n'] for s in dead['sites'])} writes")
    print(f"  live address $0360      (frames {frm}+) : {nlive} sites, "
          f"{sum(s['n'] for s in live['sites'])} writes")
    for s in live["sites"]:
        print(f"      ${s['addr']:04X} from PC ${s['pc']:04X}: {s['n']} writes "
              f"over {s['framesHit']} frames")
    checks = [
        (ndead == 0, "a range the game never writes reports ZERO sites "
                     "(the hook is range-limited, not universal)"),
        (nlive > 0, "the live address reports sites (the hook fires at all)"),
        (not outside, f"no site is outside the requested range "
                      f"({len(outside)} strays -- mirrors would show up here)"),
        (nlive <= 4, f"only a handful of PCs write $0360 ({nlive}); a hook that "
                     f"also fired on reads would report dozens"),
    ]
    fails = 0
    for ok, msg in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
        fails += 0 if ok else 1
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", type=int, default=500)
    ap.add_argument("--script", default=BOOT + ",120:R")
    ap.add_argument("--watch", default="0360,0320")
    ap.add_argument("--from", dest="frm", type=int, default=0)
    ap.add_argument("--trace", default="")
    ap.add_argument("--tracen", type=int, default=8)
    ap.add_argument("--exec", dest="exec_addrs", default="")
    ap.add_argument("--order", default="",
                    help="hex addresses whose execution SEQUENCE to log")
    ap.add_argument("--ordern", type=int, default=2)
    ap.add_argument("--poke", default="",
                    help="force RAM at the sample point: ADDR=VAL@FROM-TO")
    ap.add_argument("--stack", type=int, default=3)
    ap.add_argument("--out", type=Path, default=OUT / "playerhook.json")
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--selfcheck", action="store_true")
    args = ap.parse_args()

    if args.selfcheck:
        return selfcheck(args.frames, args.script, args.frm or 450)

    doc = run(frames=args.frames, script=args.script, watch=args.watch,
              json_out=args.out, frm=args.frm, trace=args.trace,
              tracen=args.tracen, exec_addrs=args.exec_addrs,
              order=args.order, ordern=args.ordern, poke=args.poke,
              stack=args.stack)
    print("=== WHO WRITES THE PLAYER ===")
    report(doc, top=args.top)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
