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
  * `seedVram` / `seedPalette` / `seedOam` (WAVE 10): the VIDEO state at the
    same instant -- PPU $2000-$27FF, palette RAM $3F00-$3F1F and the hardware
    OAM. $0000-$07FF alone is only enough to start where the port can REBUILD
    the screen by running from the beginning; these are what make an align
    frame ANYWHERE in the stage comparable. See probe.lua's video-seed header
    for the layout and porttrace.mjs seedFromCartridge() for what each one
    lands in.
  * `seedChrBank` / `seedChrOffset` (WAVE 10): $2D and the mapper offset the
    EMULATOR reports at the align frame. Neither is an input -- $2D is already
    in seedRam and the port derives the offset from it -- they are a CROSS-CHECK
    the loader asserts, so that "the port's CHR latch table agrees with the
    hardware" is a checked fact at the seed and not only a per-frame field;
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
    # PER-SCENARIO ALIGN.  The corpus aligns at 400 because that is clear of the
    # boot intro; wave 4 ported the intro, so the intro scenarios have to seed
    # INSIDE it (at the mode-4 handover, and at the respawn's own $9B3E frame).
    # It is an override rather than a second file so both harnesses still read
    # one definition -- porttrace.mjs takes `align` out of the artifact and
    # never resolves it itself.
    align = scn.get("align", defs["align"])
    script = defs["bootPrefix"] + "," + scn["tail"]
    frames = script_frames(script)
    if frames <= align:
        raise SystemExit(f"{name}: {frames} frames does not reach align {align}")

    watch = ",".join(defs["watch"])
    pj = OUT / f"{name}.probe.json"
    ram = OUT / f"{name}.ram"
    vid = OUT / f"{name}.video"
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

    # TWO video dumps, and the second one is the point. The first is the SEED at
    # the align frame. The second is the CHECK at the last frame of the window:
    # nothing in this corpus has ever compared the port's nametable or palette
    # against the cartridge's, so 2 KB of screen -- everything the terrain
    # streamer builds -- was produced by the port and looked at by nobody. That
    # was tolerable while the port could be seeded only at frames 282/400/614
    # and rebuilt the screen itself; it is not tolerable now that a deep seed
    # HANDS it a screen. See compare.mjs's VIDEO block.
    rp = probe.run(frames, script, pj, ramdump=ram, watch=watch, poke=poke,
                   video=vid, video_at=[align, frames - 1], timeout_s=300)
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
        # THE LAG RULE, asserted on the ORACLE rather than trusted.  $ED02 has
        # exactly one caller ($80A1) and it sits below the frame lock's bail, so
        # every frame that reached the $80B5 sample point ticked the driver
        # exactly once.  If this is ever not 1, either the driver gained a second
        # caller or the sample point moved, and every audio number below it is
        # meaningless (00-recon-sound.md 0: driverCalls == nmiEntries - lagFrames).
        if r["audioTicks"] != 1:
            raise SystemExit(f"{name} f{i}: $ED02 ran {r['audioTicks']} times on a "
                             f"sampled frame, not exactly 1")
        # $ED46 runs once per OWNED channel plus once per chained control
        # command; four channels with no chaining is 4, and a chain can push it
        # higher.  What it can never be is more than 4 + the commands, so the
        # only bound worth asserting is that a frame with no owned channel is 0.
        if r["audioChannels"] < 0:
            raise SystemExit(f"{name} f{i}: $ED46 count is negative")

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
    # $0500-$06FF AT THE LAST FRAME OF THE WINDOW -- the terrain collision map as
    # the port must have BUILT it, not as it was handed it.
    #
    # WHY IT IS HERE. Wave 10 started seeding the map (porttrace.mjs), which is
    # the only way a deep window can be right -- and it immediately made the
    # WRITE path invisible: MEASURED with two deliberate breaks in
    # src/terrain.js's $9F55 block, `$9F7F` base +1 and `$9F81` stride c*8 ->
    # c*4, both GREEN across deep-ground + terrain-death + deep-page3, because
    # every cell that kills the ship was written before the align frame and is
    # now supplied by the seed. The two terrain-death scenarios cannot see it
    # either: they POKE a cell into an all-zero map, bypassing $9F55 entirely.
    # So this is the check that holds the derivation to account.
    #
    # It costs NO extra emulator time: the per-frame RAM dump is already taken
    # for the seed and thrown away, so the last frame's 512 bytes are free.
    last = frames - 1
    fin_coll = rambytes[last * 2048 + 0x0500:last * 2048 + 0x0700]
    coll_changed = sum(1 for i in range(0x200)
                       if fin_coll[i] != seed[0x0500 + i])

    # ---- the video seed (wave 10) ----------------------------------------
    # probe.py has already asserted the length; splitting it here is the only
    # place the layout is written down twice, so the two must agree.
    vidbytes = vid.read_bytes()
    n = probe.VIDEO_SEED_BYTES
    if len(vidbytes) != 2 * n:
        raise SystemExit(f"{name}: video dump is {len(vidbytes)} bytes, expected "
                         f"{2 * n}")
    seed_vram = vidbytes[0:2048]           # PPU $2000-$27FF, at `align`
    seed_pal = vidbytes[2048:2080]         # $3F00-$3F1F
    seed_oam = vidbytes[2080:2336]         # hardware OAM
    fin_vram = vidbytes[n:n + 2048]        # ...and the same three at frames-1
    fin_pal = vidbytes[n + 2048:n + 2080]
    fin_oam = vidbytes[n + 2080:n + 2336]
    # How far apart the two PHYSICAL nametables are. The reason to record it is
    # that a mirrored read would make them identical: vertical mirroring makes
    # $2800 an alias of $2000, and if this dump ever returned $2000-$23FF twice
    # instead of $2000-$27FF, seedVram would silently be half a screen.
    #
    # THIS WAS A HARD ERROR HERE AND IT WAS WRONG. It fired on `intro-respawn`
    # (align 614, ntdiff 0) -- and that is a REAL cartridge state, not a bad
    # read: $882C's full-screen loader $8871 pushes 2304 bytes from $2000, which
    # runs past $23FF and fills BOTH nametables with the same image, so during a
    # stage load the two halves genuinely are identical. Being identical in ONE
    # scenario proves nothing; being identical in EVERY scenario is what a
    # mirrored read looks like, so the check belongs at corpus level and lives
    # in compare.mjs's VIDEO COVERAGE block instead.
    ntdiff = sum(1 for i in range(1024) if seed_vram[i] != seed_vram[1024 + i])
    # The shadow OAM at $0200-$02FF was DMA'd to the hardware at $8087 of THIS
    # frame from the shadow the PREVIOUS frame built, so at $80B5 the two are
    # NOT expected to be equal -- the frame's own display-list build at $80A7
    # has already overwritten the shadow. Recorded rather than asserted, because
    # "how far apart they are" is the OAM phase the port has to reproduce.
    oamlag = sum(1 for i in range(256) if seed_oam[i] != seed[0x0200 + i])

    row_at_align = pf[align]

    merged = []
    for a, b in zip(pf, of):
        row = dict(a)
        for k in ("slotsVisited", "msExpanded", "spriteRecords",
                  "spritesStored", "enemySlots", "lagged", "audioTicks",
                  "audioChannels", "apuWrites", "apuDigest"):
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
                                    "enemySlots", "lagged", "audioTicks",
                                    "audioChannels", "apuWrites", "apuDigest"],
        "seedRam": base64.b64encode(seed).decode("ascii"),
        # ---- the video seed, wave 10 -------------------------------------
        "seedVram": base64.b64encode(seed_vram).decode("ascii"),
        "seedPalette": base64.b64encode(seed_pal).decode("ascii"),
        "seedOam": base64.b64encode(seed_oam).decode("ascii"),
        "seedChrBank": row_at_align["chrBank"],       # $2D at the align frame
        "seedChrOffset": row_at_align["chrOffset"],   # mapper.chrMemoryOffset0
        # Which BAND the mapper offset above belongs to. $80B5 is at scanline
        # ~231, i.e. after $9AA3's sprite-0 spin, so on a frame whose split ran
        # the offset in force is band B's ($9ABF LDY #$02) and NOT $2D's. Without
        # this the seed-time cross-check on $8AA8 cannot be written down
        # correctly -- and the first version of it was wrong for exactly this
        # reason ($2D = 0 but chrOffset = 8192 on `idle`).
        "seedSplitRan": row_at_align["sprite0Hit"],
        # ---- the END-OF-WINDOW video, wave 10 ----------------------------
        # Same three spaces at the LAST compared frame. This is not a seed --
        # nothing installs it -- it is what the port has to have PRODUCED.
        # `ntChanged` is how many of the 2048 nametable bytes the cartridge
        # itself rewrote over the window, i.e. how much of the comparison is
        # the port's own work rather than the seed surviving. A check that
        # bounds its own coverage has to say so in its output
        # (docs/knowledge/03); compare.mjs prints this number every run.
        "finalFrame": frames - 1,
        "finalVram": base64.b64encode(fin_vram).decode("ascii"),
        "finalPalette": base64.b64encode(fin_pal).decode("ascii"),
        "finalOam": base64.b64encode(fin_oam).decode("ascii"),
        "ntChanged": sum(1 for i in range(2048) if fin_vram[i] != seed_vram[i]),
        # ...and the terrain collision map at the same frame. `collChanged` is
        # how many of the 512 the CARTRIDGE rewrote over the window, i.e. how
        # much of the comparison is $9F55's own output rather than the seed.
        "finalColl": base64.b64encode(fin_coll).decode("ascii"),
        "collChanged": coll_changed,
        # How far the two physical nametables are apart at the align frame. 0 is
        # legal for ONE scenario (see above); 0 for all of them means the dump
        # is a mirrored read. compare.mjs asserts that at corpus level.
        "ntHalvesDiffer": ntdiff,
        "frames": merged,
    }
    (OUT / f"{name}.json").write_text(json.dumps(doc), encoding="utf8")

    if not keep_ram:
        ram.unlink(missing_ok=True)      # 2 KB x frames, only the seed is kept
    pj.unlink(missing_ok=True)
    oj.unlink(missing_ok=True)
    vid.unlink(missing_ok=True)          # it is inside the artifact now

    fo = ro.fields()
    if poke:
        print(f"  {'':12s}   poke {poke}")
    print(f"  {name:12s} {len(merged):5d} frames  lag={pdoc['lagFrames']} "
          f"{pdrops if pdrops else ''}  "
          f"slotsVisited {fo['slotsVisitedMin']}..{fo['slotsVisitedMax']}  "
          f"msExpanded/f {int(fo['msExpandedTotal']) / len(merged):.2f}  "
          f"stored/f {int(fo['spritesStoredTotal']) / len(merged):.2f}")
    # The video seed, measured rather than assumed present. `coll` is the
    # terrain collision map $0500-$06FF inside seedRam: it is 0 of 512 at
    # align 400 (every scenario of the original corpus) and NON-zero at any
    # deep align, which is exactly why wave 10 has to seed it.
    coll_nz = sum(1 for i in range(0x0500, 0x0700) if seed[i])
    ntchanged = sum(1 for i in range(2048) if fin_vram[i] != seed_vram[i])
    print(f"  {'':12s}   seed@{align}: nt halves differ on {ntdiff}/1024 bytes, "
          f"hwOAM vs shadow differs on {oamlag}/256, coll {coll_nz}/512 non-zero, "
          f"$2D={row_at_align['chrBank']} chrOffset={row_at_align['chrOffset']}; "
          f"the cartridge rewrote {ntchanged}/2048 nametable and "
          f"{coll_changed}/512 collision bytes by f{frames - 1}")
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
