#!/usr/bin/env python3
"""stagepoke.py -- ONE parameterised both-sides intervention harness.

WAVE 40. The owner's question:

    "can't you cartridge verify just by warping yourself to all the positions
     you need? Didn't we spend like 5 waves just getting that to work?"

Yes. We built it TWICE and then stopped using it, because both builds were
hardcoded to one stage:

  * `stage4poke.py` + `stage4cmp.mjs` (W31) forced `$19 = 3` across the `$82`
    countdown so the stage-4 LATE SPAWNER ran. 271 spawns, 0 divergent.
  * `b559poke.py` + `b559cmp.mjs` (W32a) held `$19 = 4` across ONE 512-px
    crossing so the chunk loader read stage 5's chunk table and the wave engine
    spawned its OWN records. 2,371 handler frames x 10 fields, 0 divergent.

So W35 (stage 6), W36 (stage 7) and W38 (ending/loops) each reported "could not
reach: any cartridge comparison" while the technique sat in this directory under
a stage-specific name. This file is that technique with the stage taken out.

WHY AN INTERVENTION AT ALL -- MEASURED, NOT ASSUMED. W31 ran the endchain
trajectory (the only input in this corpus that survives stage 1) out to 26,000
frames:

    it dies three times inside stage 2 between scroll $03E8 and $0463 and
    game-overs at f14333. maxScroll $0E00; stages visited: $19 = 0 and 1 only.

No scripted run in this corpus reaches stage 3, let alone 6 or 7. The fallback
`docs/knowledge/09` approves is a BOTH-SIDES INTERVENTION: force the state on
the cartridge, seed the port from the cartridge's own bytes at the instant
before, step one routine, compare. It validates the CODE, not the ROUTE.

READ THE PROVENANCE LABEL ON EVERY NUMBER THIS PRINTS. An intervention run gives
you STATES, not a picture of the game. Nothing here is evidence about any
stage's pacing, spawn density, difficulty or appearance -- the terrain under
these enemies is stage 1's and the camera is stage 1's.

THE THREE MODES
  crossings  run the trajectory with no `$19` poke at all and print every
             512-px chunk crossing, every `$19`/`$1B`/mode change and every
             death. THIS IS THE INPUT TO THE OTHER TWO: a window is chosen from
             a measured crossing, never from a guess. (`stage4poke.py --reach`
             generalised; it printed $19/$1B/mode but not $61, which is the one
             number a chunk-riding poke needs.)

  step       W32a's recipe. Hold `$19 = S` across a narrow window that contains
             a crossing, so `$A2D5 LDA $A7D0,Y` loads stage S's chunk table;
             put `$19` straight back. The wave engine then spawns stage S's own
             records with the game's own descriptor bytes, and every frame of
             every one of their lives is dumped as an index into the RAM film
             for `stagecmp.mjs` to single-step.

  chain      NEITHER predecessor had this. Force `$19` AND the mode-5 SUB-STATE
             `$1B` together for one window, which warps the board into a ladder
             it would otherwise need a seven-stage clear to enter -- `$1B = $86`
             with `$19 = 6` is `$9904`'s test, and `$9904` JMPs to `$9872`, the
             end-of-game chain. Prints the `$1B` ladder, the loop counter
             `$28,X` and `$1A` afterwards, so "can the poke method reach the
             ending" is answered by MEASUREMENT and not by argument.

  spawn      W31's recipe. Hold `$19 = S` across the `$82` countdown window so
             `jt_$C439[$19]`, the stage's LATE SPAWNER (which has no wave
             records at all and can be reached no other way), runs; dump every
             spawn it makes.

WHAT THE POKE ALSO CHANGES ON THE BOARD is stage-dependent and is the caller's
problem to bound. `--verify` prints the four `$0600` arm-group headers over the
whole run so the "no arm group is ever allocated" claim is CHECKED rather than
asserted; W32a's window needed that and yours may too.

    python games/gradius/tools/oracle/stagepoke.py --mode crossings
    python games/gradius/tools/oracle/stagepoke.py --mode step  --stage 5 \
        --window 2320-2365 --tag s6ch2
    python games/gradius/tools/oracle/stagepoke.py --mode spawn --stage 3 \
        --window 6460-7730 --types 0A,8A,15,95 --tag w31repro

Output lands in out/stagepoke/<tag>/ (gitignored). Nothing ROM-derived is ever
committed: the dump is an INDEX (frame numbers and slot numbers) plus the raw
RAM film, both of which stay in out/.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "stagepoke"

# ---------------------------------------------------------------------------
# THE TRAJECTORY. This is the endchain's own, verbatim from reachcheck.py via
# stage4poke.py and b559poke.py -- the one input this corpus has that survives
# stage 1 long enough to cross chunks and to reach the $82 countdown. It is
# shared so that a window measured by --mode crossings is a window the other two
# modes actually see. Change it and every measured window in the worklog is void.
BOOT = "200:,10:S,190:"
LEAD = [(1350, "RDA"), (324, "RUA"), (80, "RDA")]
POWER = "0044=2,0045=2,0046=5,0041=1"       # the four rank bytes, from f400
SWITCH = 5000                                # RA -> RUA, stage4poke.py's
TAIL_EARLY, TAIL_LATE = "RA", "RUA"

# ---------------------------------------------------------------------------
# THE OBJECT RECORD, COMPLETE. 21 fields, every byte the port models per slot.
# The addresses are the ROM's arrays with the +$0C the port folds into its own
# base already added, so they are read at `base + slot` with slot = 0..9.
# The names are src/state.js's own array names; stagecmp.mjs maps them 1:1 and
# refuses to run if any name is missing from state.obj, so this table cannot
# drift away from the port silently.
FIELDS_FULL = dict(
    status=0x010C, anim=0x012C, timer=0x014C, animFrame=0x016C, attrMask=0x018C,
    type=0x030C, y=0x032C, yf=0x034C, x=0x036C, xf=0x038C, carrier=0x03AC,
    yvel=0x03BC, yvelf=0x03EC, style=0x040C, xvel=0x042C, xvelf=0x044C,
    s0460=0x046C, s0480=0x048C, s04A0=0x04AC, s04C0=0x04CC, s04E0=0x04EC)

# The two predecessors' exact field sets, kept BY NAME so their runs can be
# reproduced through this tool byte for byte rather than approximately.
FIELDS_W31 = ["anim", "type", "y", "x", "yvel", "yvelf", "xvel", "xvelf",
              "s0480", "s04A0"]
FIELDS_W32A = ["anim", "timer", "animFrame", "status", "type", "y", "x", "xf",
               "s0480", "s04A0"]
PRESETS = {"full": list(FIELDS_FULL), "w31": FIELDS_W31, "w32a": FIELDS_W32A}

GROUPS = (0x0600, 0x0630, 0x0660, 0x0690)   # the four $0600 arm-group headers
ENEMY_SLOTS = 10


def _script(frames: int, switch: int | None) -> str:
    used = 400 + sum(n for n, _ in LEAD)
    segs = [BOOT] + [f"{n}:{b}" for n, b in LEAD]
    if switch is None or switch >= frames:
        segs.append(f"{frames - used}:{TAIL_EARLY}")
    else:
        segs.append(f"{switch - used}:{TAIL_EARLY}")
        segs.append(f"{frames - switch}:{TAIL_LATE}")
    return ",".join(segs)


def _parse_windows(specs: list[str]) -> list[tuple[int, int]]:
    out = []
    for s in specs:
        a, _, b = s.partition("-")
        if not b:
            raise SystemExit(f"--window wants FROM-TO, got {s!r}")
        out.append((int(a), int(b)))
    return sorted(out)


def _pokes(frames: int, stage: int | None, windows, restore) -> str:
    """The poke string, and the ONLY place `$19` is touched.

    `probe.lua` applies a poke AFTER the frame's sample, so `ADDR=V@F-T` means
    the CPU sees V during frames F+1 .. T+1. Windows are quoted in this file and
    in the worklog as the POKE range, i.e. as this tool takes them.

    `$19` is not restored by the ROM (nothing writes it during play), so every
    window is followed by an explicit write-back -- W32a's second range,
    generalised to N windows.
    """
    ps = [f"{p}@400-{frames - 1}" for p in POWER.split(",")]
    if stage is None:
        return ",".join(ps)
    for i, (a, b) in enumerate(windows):
        b = min(b, frames - 1)
        ps.append(f"0019={stage:d}@{a}-{b}")
        if restore is None:      # --restore none: leave $19 forced. W31's run
            continue             # did exactly this; the $82 window ends first.
        nxt = windows[i + 1][0] - 1 if i + 1 < len(windows) else frames - 1
        if b + 1 <= nxt:
            ps.append(f"0019={restore:d}@{b + 1}-{nxt}")
    return ",".join(ps)


def _run(tag: str, frames: int, poke: str, switch: int | None):
    d = OUT / tag
    d.mkdir(parents=True, exist_ok=True)
    script = _script(frames, switch)
    print(f"tag    {tag}")
    print(f"script {script}")
    print(f"poke   {poke}")
    probe.run(frames, script, d / "run.json", ramdump=d / "run.ram", watch="",
              poke=poke, timeout_s=5400)
    rows = json.loads((d / "run.json").read_text())["frames"]
    return d, rows, (d / "run.ram").read_bytes()


def _verify(rb: bytes, n: int) -> dict:
    """WHAT THE POKE ACTUALLY LEFT ON THE BOARD -- the two bytes the ROM branches
    on, measured over the whole run rather than argued about.

      $19  the stage index. Its histogram is the proof the window opened when it
           was told to and CLOSED again -- the ROM never writes $19 during play,
           so a poke that forgets its write-back leaves the stage forced for the
           rest of the run and every later frame is a different experiment.
      $5C  the arm-group census ($9683 STX $5C). It gates BOTH the `$968E`
           half-rate fork (which reorders the whole frame) and `$CB8A`'s driver.
           $5C == 0 on every frame is the direct evidence that W32b's arm
           subsystem never shared the frame with what is being compared.

    IT USED TO BE THE FOUR `$0600` GROUP HEADERS AND THAT CHECK WAS UNSOUND.
    `b559poke.py` printed them and W32a's worklog recorded "zero for the entire
    run" while the tool's own output said 3,493 of 5,600 frames were non-zero.
    Both the claim and the check were wrong: `$0600`-`$06BF` is the arm pool AND
    the top half of the terrain collision map `$0500`-`$06FF` (src/state.js's
    ARM_POOL comment documents the overlap on purpose), so the streamer fills
    those bytes with collision bits as the camera scrolls and a non-zero header
    means nothing. `$5C` is what `$9663` DERIVED from them, and `$5C` is what
    every consumer reads. The headers are still printed, labelled as ambiguous.
    """
    h19: dict[int, int] = {}
    h5c: dict[int, int] = {}
    for i in range(n):
        v = rb[i * 2048 + 0x19]; h19[v] = h19.get(v, 0) + 1
        w = rb[i * 2048 + 0x5C]; h5c[w] = h5c.get(w, 0) + 1
    print("$19 over %d frames: %s" % (n, {("$%02X" % k): v
                                          for k, v in sorted(h19.items())}))
    print("$5C over %d frames: %s   (0 everywhere = no arm group was ever "
          "censused, so no $968E fork)"
          % (n, {("$%02X" % k): v for k, v in sorted(h5c.items())}))
    nz = sum(1 for i in range(n) if any(rb[i * 2048 + b] for b in GROUPS))
    print("  ($0600/$30/$60/$90 raw: non-zero on %d frames -- AMBIGUOUS, those "
          "bytes are also the terrain collision map)" % nz)

    # THE CROSSINGS THIS RUN ACTUALLY HAD. A window is chosen from a previous
    # run's crossing table, and a poked stage spawns different enemies, so the
    # player can die earlier and move every later crossing. This re-derives them
    # from THIS run's own film, so "the window rode chunk k" is a measurement of
    # the run it describes and not of the run that was used to pick the window.
    xs, prev = [], None
    for i in range(n):
        v = rb[i * 2048 + 0x61]
        if prev is not None and v != prev:
            xs.append(dict(frame=i, z61=v, chunk=v >> 1,
                           z19=rb[i * 2048 + 0x19]))
        prev = v
    print("chunk crossings ($61, chunk = $61 >> 1):")
    for c in xs:
        print("  f%-6d $61 $%02X -> chunk %d   $19 was $%02X at the crossing%s"
              % (c["frame"], c["z61"], c["chunk"], c["z19"],
                 "   <- RIDDEN" if c["z19"] != 0 else ""))
    deaths = [i for i in range(1, n)
              if rb[i * 2048 + 0x1B] == 0xA0 and rb[(i - 1) * 2048 + 0x1B] != 0xA0]
    print("player deaths ($1B -> $A0): %s"
          % (" ".join("f%d" % i for i in deaths) or "none"))
    return dict(z19=h19, z5C=h5c, rawHeaderNonzeroFrames=nz, totalFrames=n,
                crossings=xs, deaths=deaths)


# ---------------------------------------------------------------------------
def cmd_crossings(a) -> int:
    """No `$19` poke at all: just measure where this trajectory can be ridden."""
    frames = a.frames
    d, rows, rb = _run(a.tag, frames, _pokes(frames, None, [], 0), a.switch)
    g = lambda i, x: rb[i * 2048 + x]
    prev, xs, maxs = None, [], 0
    for i, row in enumerate(rows):
        s = (row["scrollHi"] << 8) | row["scrollLo"]
        maxs = max(maxs, s)
        cur = (g(i, 0x19), g(i, 0x61), g(i, 0x1B), g(i, 0x00D4), g(i, 0x20))
        if cur != prev:
            print("  f%-6d $19=%02X $61=%02X $1B=%02X mode=%02X lives=%d "
                  "scroll=$%04X" % (i, *cur, s))
            if prev is not None and cur[1] != prev[1]:
                xs.append(dict(frame=i, z61=cur[1], z19=cur[0], scroll=s))
            prev = cur
    print("maxScroll $%04X" % maxs)
    print("stages visited ($19): "
          + " ".join("$%02X" % v for v in sorted({g(i, 0x19)
                                                  for i in range(len(rows))})))
    print("")
    print("CHUNK CROSSINGS -- $61 is the 512-px chunk index; the chunk loader")
    print("reads $A7D0,Y ONE FRAME per crossing, so a window that contains the")
    print("crossing frame is all a chunk-riding poke needs.")
    for c in xs:
        print("  f%-6d $61 $%02X  scroll $%04X  ($19 was $%02X)"
              % (c["frame"], c["z61"], c["scroll"], c["z19"]))
    (d / "crossings.json").write_text(json.dumps(xs))
    print("wrote %s" % (d / "crossings.json"))
    return 0


def cmd_step(a) -> int:
    """W32a generalised: ride a crossing, then index every frame of every life."""
    frames, windows = a.frames, _parse_windows(a.window)
    poke = _pokes(frames, a.stage, windows, a.restore)
    d, rows, rb = _run(a.tag, frames, poke, a.switch)
    n = len(rows)
    g = lambda i, x: rb[i * 2048 + x]
    verify = _verify(rb, n)

    want = set(a.types) if a.types else None
    lo = min(w[0] for w in windows)
    steps, seen = [], {}
    for i in range(max(1, lo), n):
        for j in range(ENEMY_SLOTS):
            pt, ct = g(i - 1, 0x030C + j), g(i, 0x030C + j)
            if want is None:
                # every live object, spawns and frees included
                if pt == 0 and ct == 0:
                    continue
            else:
                if (pt & 0x7F) not in want and (ct & 0x7F) not in want:
                    continue
            steps.append(dict(frame=i, slot=j, prevType=pt, type=ct))
            seen[pt & 0x7F] = seen.get(pt & 0x7F, 0) + 1
    manifest = dict(
        tool="stagepoke.py", version=1, mode="step", stage=a.stage,
        restore=a.restore, windows=windows, frames=frames, ramFrames=n,
        script=_script(frames, a.switch), poke=poke,
        fields={k: FIELDS_FULL[k] for k in a.fieldnames},
        types=sorted(want) if want else None, enemySlots=ENEMY_SLOTS,
        verify=verify,
        provenance="INTERVENTION RUN (docs/knowledge/09): $19 forced to "
                   f"{a.stage} across {windows}. Validates the CODE under a "
                   "forced state. NOT evidence about this stage's pacing, "
                   "spawn density, difficulty or appearance.")
    (d / "dump.json").write_text(json.dumps(dict(manifest=manifest,
                                                 rows=steps)))
    print("indexed %d slot-frames across %d distinct slots"
          % (len(steps), len({s['slot'] for s in steps})))
    print("  prev-frame types seen: "
          + " ".join("$%02X x%d" % (t, c) for t, c in sorted(seen.items())))
    print("wrote %s" % (d / "dump.json"))
    print("now run: node games/gradius/tools/oracle/stagecmp.mjs --tag %s" % a.tag)
    return 0


def cmd_chain(a) -> int:
    """Warp the mode-5 SUB-STATE, not just the stage.

    `$1B` is a plain RAM byte and the mode-5 dispatcher `jt_$982F` indexes
    straight off it, so any rung of any ladder is one poke away -- INCLUDING the
    ones that ordinarily need a whole run behind them. The end-of-game chain is
    the case this was written for: `$9904` (`$1B = $86`) tests `$19 == 6` and
    JMPs to `$9872`, so `$19 = 6` + `$1B = $86` is the whole entry condition.

    WHAT THIS CANNOT FABRICATE is the state the chain READS rather than tests,
    and the run below prints those bytes rather than assuming them: `$22,X`,
    `$24,X`, `$26,X` (the checkpoint triple `$9B3E` restores from) and `$28,X`
    (the loop counter `$9872` INCs and `$9B3E` copies into `$1A`). A poked entry
    gets whatever ordinary stage-1 play left in them, which is a REAL machine
    state for loop 1 and is NOT the state a genuine seven-stage clear would
    leave. Read the provenance note before quoting any of it.
    """
    frames, windows = a.frames, _parse_windows(a.window)
    ps = [f"{p}@400-{frames - 1}" for p in POWER.split(",")]
    for (x, y) in windows:
        y = min(y, frames - 1)
        ps.append(f"0019={a.stage:d}@{x}-{y}")
        ps.append(f"001B={a.sub:d}@{x}-{y}")
    poke = ",".join(ps)
    d, rows, rb = _run(a.tag, frames, poke, a.switch)
    n = len(rows)
    g = lambda i, x: rb[i * 2048 + x]

    WATCH = [("$00 mode", 0x00), ("$1B", 0x1B), ("$19", 0x19), ("$1A", 0x1A),
             ("$22", 0x22), ("$24", 0x24), ("$26", 0x26), ("$28", 0x28),
             ("$57", 0x57), ("$5B", 0x5B), ("$4F", 0x4F), ("$D4", 0xD4)]
    at = windows[0][0]
    print("")
    print("THE LADDER AFTER THE POKE (only frames on which something moved):")
    prev = None
    changes = []
    for i in range(max(0, at - 2), n):
        cur = tuple(g(i, x) for _, x in WATCH)
        if cur != prev:
            print("  f%-6d " % i + "  ".join(
                "%s=$%02X" % (nm, v) for (nm, _), v in zip(WATCH, cur)))
            changes.append(dict(frame=i, **{nm: v for (nm, _), v
                                            in zip(WATCH, cur)}))
            prev = cur
    subs = sorted({g(i, 0x1B) for i in range(at, n)})
    print("")
    print("$1B values visited after the poke: "
          + " ".join("$%02X" % v for v in subs))
    (d / "chain.json").write_text(json.dumps(dict(
        poke=poke, at=at, sub=a.sub, stage=a.stage, changes=changes,
        subsVisited=subs,
        provenance="INTERVENTION RUN (docs/knowledge/09): $19 and $1B both "
                   "forced. The ladder below is the CODE's response to a "
                   "fabricated entry, not a game that was played to it.")))
    print("wrote %s" % (d / "chain.json"))
    return 0


def cmd_spawn(a) -> int:
    """W31 generalised: hold `$19` across the `$82` window, dump every spawn."""
    frames, windows = a.frames, _parse_windows(a.window)
    poke = _pokes(frames, a.stage, windows, a.restore)
    d, rows, rb = _run(a.tag, frames, poke, a.switch)
    n = len(rows)
    g = lambda i, x: rb[i * 2048 + x]
    verify = _verify(rb, n)

    want = set(a.types) if a.types else None
    out, prev = [], [0] * ENEMY_SLOTS
    for i in range(n):
        cur = [g(i, 0x030C + j) for j in range(ENEMY_SLOTS)]
        for j in range(ENEMY_SLOTS):
            # A spawn is an empty slot becoming non-empty. The sample is taken
            # after $ADAB dispatched, so the type already carries bit 7 -- the
            # handler's init arm ($B0B4) ORs it in on the spawn frame.
            if prev[j] != 0 or cur[j] == 0:
                continue
            if want is not None and (cur[j] & 0x7F) not in want:
                continue
            out.append(dict(frame=i, slot=j, z19=g(i, 0x19),
                            z69_m1=g(i - 1, 0x69), z69=g(i, 0x69),
                            z02=g(i, 0x02),
                            **{k: g(i, FIELDS_FULL[k] + j)
                               for k in a.fieldnames}))
        prev = cur
    byt: dict[int, int] = {}
    for r in out:
        byt[r["type"]] = byt.get(r["type"], 0) + 1
    manifest = dict(
        tool="stagepoke.py", version=1, mode="spawn", stage=a.stage,
        restore=a.restore, windows=windows, frames=frames, ramFrames=n,
        script=_script(frames, a.switch), poke=poke,
        fields={k: FIELDS_FULL[k] for k in a.fieldnames},
        types=sorted(want) if want else None, enemySlots=ENEMY_SLOTS,
        verify=verify,
        provenance="INTERVENTION RUN (docs/knowledge/09): $19 forced to "
                   f"{a.stage} across {windows}. Validates the CODE under a "
                   "forced state. NOT evidence about this stage's pacing, "
                   "spawn density, difficulty or appearance.")
    (d / "dump.json").write_text(json.dumps(dict(manifest=manifest, rows=out)))
    print("spawns captured: "
          + (", ".join("$%02X x%d" % (t, c) for t, c in sorted(byt.items()))
             or "NONE"))
    print("wrote %d rows to %s" % (len(out), d / "dump.json"))

    if a.emit_legacy:
        p = HERE / "out" / "stage4poke" / "spawns-decoded.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        keep = ("frame", "slot", "z19", "z69_m1", "z69", "z02") \
            + tuple(FIELDS_W31)
        p.write_text(json.dumps([{k: r[k] for k in keep} for r in out]))
        print("also wrote %s (so W31's own stage4cmp.mjs can read THIS run)" % p)
    print("now run: node games/gradius/tools/oracle/stagecmp.mjs --tag %s" % a.tag)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mode", choices=("crossings", "step", "spawn", "chain"),
                    default="crossings")
    ap.add_argument("--sub", type=lambda v: int(v, 0), default=0x86,
                    help="chain mode: the $1B sub-state to force ($86 = the "
                         "end-of-game test at $9904)")
    ap.add_argument("--stage", type=int, help="the $19 value to force (0..6)")
    ap.add_argument("--window", action="append", default=[],
                    metavar="FROM-TO", help="poke window, repeatable")
    ap.add_argument("--restore", default="0",
                    help="the $19 value written back after each window, or "
                         "'none' to leave $19 forced for the rest of the run "
                         "(what W31's own script did)")
    ap.add_argument("--frames", type=int, default=8000)
    ap.add_argument("--switch", type=int, default=None,
                    help="frame at which the trajectory switches RA -> RUA "
                         "(stage4poke.py's 5000; omit to hold RA throughout, "
                         "which is b559poke.py's)")
    ap.add_argument("--types", default="",
                    help="comma-separated hex type bytes to capture; bit 7 is "
                         "masked off both sides. Empty = every live object.")
    ap.add_argument("--fields", default="full",
                    help="'full' (all 21), 'w31', 'w32a', or a comma list")
    ap.add_argument("--tag", default=None)
    ap.add_argument("--emit-legacy", action="store_true",
                    help="spawn mode: also write out/stage4poke/"
                         "spawns-decoded.json so W31's own comparator reads it")
    a = ap.parse_args()

    a.restore = None if str(a.restore).lower() == "none" else int(a.restore)
    a.types = [int(t, 16) & 0x7F for t in a.types.split(",") if t.strip()]
    a.fieldnames = PRESETS.get(a.fields) or [f.strip() for f in
                                             a.fields.split(",") if f.strip()]
    bad = [f for f in a.fieldnames if f not in FIELDS_FULL]
    if bad:
        raise SystemExit(f"unknown field(s) {bad}; known: {sorted(FIELDS_FULL)}")
    if a.tag is None:
        a.tag = a.mode if a.mode == "crossings" else f"{a.mode}-s{a.stage}"
    if a.mode == "chain" and a.tag == "chain":
        a.tag = f"chain-s{a.stage}-{a.sub:02X}"
    if a.mode != "crossings":
        if a.stage is None:
            raise SystemExit("--stage is required for --mode step/spawn")
        if not a.window:
            raise SystemExit("--window FROM-TO is required for --mode "
                             "step/spawn; measure one with --mode crossings "
                             "first. A guessed window is not a measured one.")
    return dict(crossings=cmd_crossings, step=cmd_step, spawn=cmd_spawn,
                chain=cmd_chain)[a.mode](a)


if __name__ == "__main__":
    raise SystemExit(main())
