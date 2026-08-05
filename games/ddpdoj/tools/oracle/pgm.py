#!/usr/bin/env python3
r"""THE oracle for DoDonPachi DaiOuJou (IGS PGM, ddpdojblk) -- one entry point.

Wave 0 left four harnesses: `tools/oracle/pgm.py` + `frame.lua`, `tools/pgm.py`
+ `probes/pgm_*.lua`, `tools/hard/hardrun.py` + its luas, and the ad-hoc
`tools/drive.lua`.  This file is the consolidation.  The others stay in the tree
as libraries and as the record of how their numbers were produced; nothing new
should be built on them.

WHAT THIS FILE KNOWS THAT A NAIVE RUNNER DOES NOT -- every item measured, every
item paid for once already:

 1. -rompath needs FORWARD SLASHES.  Backslashes bite on this MSYS/Windows mix.
    ddpdojblk resolves from ddpdojblk.7z and verifies "best available"; the only
    missing file is ddp3_igs027a.bin, the ARM7 protection ROM, which MAME itself
    marks NO GOOD DUMP KNOWN and simulates in ~40 lines of C++.  IF IT EVER
    VERIFIES "bad", look for a .zip that has crept back beside the .7z -- MAME
    resolves by set name, not by quality, and does not warn that it ignored a
    better archive.

 2. RUNS ARE ONLY DETERMINISTIC IF MAME'S WRITABLE STATE IS ISOLATED.  MAME
    persists a coin counter in <cfg_directory>/ddpdojblk.cfg and rewrites it on
    exit; two runs of the same script with MAME's defaults differ on EVERY row.
    -nonvram_save covers neither that nor a stale nvram/<set>/sram.  Five flags
    are baked in below and `gate --break-cfg` proves they are load-bearing.

 3. ddpdojblk CONTAINS TWO COMPLETE GAMES.  It boots to a chooser, "1: VERSION-A
    (OLD)" / "2: VERSION-B (NEW)", on a ~5 s countdown whose silent default is
    VERSION-A = 2002.04.05 MASTER -- i.e. NOT Black Label.  A harness that boots
    and waits measures the wrong game.  BOOT_B below presses P1 Down then P1
    Button 1, and every probe run asserts which build it actually landed in by
    the top nibble of the semaphore-arm PC ($13xxxx = A, $23xxxx = B).

 4. MSYS/Git-Bash MANGLES ARGUMENTS THAT LOOK LIKE PATH LISTS.  PROBE_SAVE=
    "120:/c/tmp/st.bin" silently became something io.open could not open, with
    no error, only a nil handle several lines later.  Pass Windows paths.

 5. Lua tap handles AND notifier subscriptions are BOTH garbage-collected if
    dropped, and the hook then silently stops firing.  frame.lua keeps them in
    globals; anything new must too.

 6. Exit codes prove nothing here.  A machine halted on "ROM ERROR !" exits 0
    and prints an average speed.  frame.lua asserts on its own output and this
    file turns any FAIL line into a non-zero exit.

Commands
  verify        -verifyroms + the machine pin
  landmarks     print the per-build landmark table (re-derive with derive.py)
  trace N       one probe run, N logic frames
  snap          boot to VERSION-B and write framebuffer PNGs
  seed          produce the seeded VERSION-B NVRAM image, by procedure
  scen [names]  run scenarios from scenarios.json (lag census always printed)
  gate          THE DETERMINISM GATE: boot->stage-1 on VERSION-B, twice
  inputlead N   measure the input lead (expected: 0)
  rtc           census the V3021 RTC and re-run the gate across a date change
  drc           -drc vs -nodrc, same scenario, diff
  seedstate     savestate taken at the game's own sample point, then resumed
  pixred        red-validate the pixel column by switching the sprite DMA off
  objdriver     THE OBJECT DRIVER: the derived table + a measured slot census
  overrun       FORCE AN OVERRUN: the 0-nop control, then an injected-load sweep
  gfx           THE GFX GATE: >=12 frame pairs, our decoder vs MAME, 100.0000 %
  pixslice      THE PIXEL GATE FOR THE PORT'S JS RENDERER (wave 6): a dense
                stretch, a palette FADE, a >=90-sprite frame, and the
                sprite-vs-BG priority rule driven by intervention
  pixdemo       capture 161 consecutive frames + identify the ship's records
  demogate      the demo path end to end: the PORT's player state -> pixels
  zoomcov       ZOOM COVERAGE: all 16 table entries x grow/shrink x axes x flips
  sprites       THE SPRITE HARVEST: every offs the game used, for the atlas
  sound         THE SOUND MAP: mailbox -> keyon, the Z80 blob, ICS in order
  check         THE CHECK RUNNER: every gate, cheapest first, skips counted
  ckpt          WAVE 69: ONE cartridge run over a whole stage, a LADDER of
                checkpoints out of it (main RAM + $900000 + the IGS023 regs
                every 250 logic frames), and a manifest.  Every later
                comparison re-seeds the port from a rung and needs no emulator.
                `--verify` proves the new dumper byte-identical to wave 4's.

 7. THE OBJECT DRIVER IS MAIN-LOOP CALL #2, $2410BC (build A: $1413FE): 20 slots
    of $50 bytes at $80E240, dispatched through a 20-entry table at $240F62,
    walked by an UNCONDITIONAL `dbra`.  `objn`/`objord`/`objlive` are standard
    compared columns, not options -- docs/knowledge/06 calls "object slots
    processed" the field that cannot be retrofitted.

 8. THE CLOCK.  `machine.time.attoseconds + seconds * 1e18` OVERFLOWS int64 at
    10 emulated seconds and silently zeroed `work` on half of every wave-1 run.
    68000 cycles are `seconds*20000000 + attoseconds//50000000000`.

 9. THE DEAD-STACK BOUNDARY IS $81FE00, not $81FF00 -- the stack reaches
    $81FE36.  A guard tap below it fails the run if that ever changes.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

TAG = "PROBE "

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
DEFAULT_SET = "ddpdojblk"
# FORWARD SLASHES. A backslash rompath has failed on this machine.
DEFAULT_ROMPATH = os.environ.get("PGM_ROMPATH", "C:/oldpcsx2")

# The decrypted :maincpu region's FNV-1a-64, printed by frame.lua on EVERY run.
# Machine pin: if this changes, the ROM directory changed under you and no
# cross-session number is trustworthy until you find out why.
PINNED_MAINCPU_FNV64 = os.environ.get("PGM_PIN") or "AUTO"

# --------------------------------------------------------------------------
# THE VERSION-B BOOT PREFIX.  Logic-frame keyed, applied at the game's own
# sample point.  Down selects "2: VERSION-B (NEW)" in the chooser, Button 1 is
# START there ("START = SHOT" is printed on the menu).  Coin twice, then Start.
# Verified by framebuffer snapshot -- see `pgm.py snap`.
# --------------------------------------------------------------------------
BOOT_B = "560=D;570=;600=A;610=;1000=N;1010=;1100=N;1110=;1200=S;1210="


def mame_home() -> Path:
    env = os.environ.get("MAME_HOME")
    if env:
        return Path(env)
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return base / "Mixup" / "mame"


def mame_exe() -> Path:
    exe = mame_home() / ("mame.exe" if sys.platform == "win32" else "mame")
    if not exe.exists():
        raise SystemExit(f"MAME not found at {exe}")
    return exe


def scratch() -> Path:
    """Everything MAME may write, and everything ROM-derived, lives here."""
    d = Path(os.environ.get("PGM_SCRATCH", OUT))
    for sub in ("cfg", "nvram", "snap"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    return d


@dataclass
class Run:
    returncode: int
    stdout: str
    stderr: str
    lines: list[str] = field(default_factory=list)
    argv: list[str] = field(default_factory=list)

    def find(self, prefix: str) -> list[str]:
        return [l for l in self.lines if l.startswith(prefix)]

    @property
    def fails(self) -> list[str]:
        return self.find("FAIL ")


def run(script: Path, *, machine: str = DEFAULT_SET, seconds: int = 120,
        env: dict[str, str] | None = None, debugger: bool = False,
        extra: list[str] | None = None, timeout: int = 3600,
        cfg_dir: Path | None = None, nvram_dir: Path | None = None,
        nvram_save: bool = False) -> Run:
    sc = scratch()
    cfg_dir = cfg_dir if cfg_dir is not None else sc / "cfg"
    nvram_dir = nvram_dir if nvram_dir is not None else sc / "nvram"
    argv = [
        str(mame_exe()), machine,
        "-rompath", DEFAULT_ROMPATH,
        "-video", "none",
        "-sound", "none",
        "-nothrottle",
        "-skip_gameinfo",
        "-seconds_to_run", str(seconds),
        "-autoboot_script", str(script),
        "-autoboot_delay", "0",
        "-noautosave",
        # DETERMINISM. Never read or write the shared config; keep MAME's
        # writable directories out of the install. `gate --break-cfg` removes
        # these and must go RED.
        "-noreadconfig",
        "-nowriteconfig",
        "-cfg_directory", str(cfg_dir),
        "-nvram_directory", str(nvram_dir),
        "-snapshot_directory", str(sc / "snap"),
    ]
    # boolean options take a -no prefix, never a value
    argv.append("-nvram_save" if nvram_save else "-nonvram_save")
    if debugger:
        # -debug is what makes machine.debugger non-nil; -debugger none is what
        # stops it opening a window.
        argv += ["-debug", "-debugger", "none"]
    if extra:
        argv += extra
    e = dict(os.environ)
    if env:
        e.update({k: str(v) for k, v in env.items()})
    res = subprocess.run(argv, cwd=str(mame_home()), capture_output=True,
                         text=True, timeout=timeout, env=e)
    lines = [ln[len(TAG):] for ln in res.stdout.splitlines() if ln.startswith(TAG)]
    return Run(res.returncode, res.stdout, res.stderr, lines, argv)


# --------------------------------------------------------------------------- landmarks
def landmarks() -> dict:
    f = HERE / "landmarks.json"
    if not f.exists():
        raise SystemExit("landmarks.json missing -- run `python derive.py`")
    return json.loads(f.read_text(encoding="utf8"))


def lm_env(build: str = "B") -> str:
    """The landmark subset frame.lua needs, as `name=hex,...`."""
    d = landmarks()
    b = d["builds"][build]
    return ",".join([
        f"wait={b['waitLoop']:x}",
        f"relA={d['builds']['A']['isr6Release']:x}",
        f"relB={d['builds']['B']['isr6Release']:x}",
        f"sync={b['frameSync']:x}",
        f"loop={b['loopHead']:x}",
    ])


def obj_env(build: str = "B") -> str:
    """The object driver, as frame.lua's PROBE_OBJ: "push,base,stride,slots".

    Derived, never typed in: `derive.py` asserts the whole 0x2C-byte shape of
    the driver loop on both builds and refuses to emit a number if it changed.
    """
    b = landmarks()["builds"][build]
    return (f"{b['objSlotHook']:x},{b['objTable']:x},"
            f"{b['objStride']:x},{b['objSlots']}")


# --------------------------------------------------------------------------- probe
def trace(out_tsv: Path, *, frames: int = 600, buttons: str = BOOT_B,
          build: str = "B", machine: str = DEFAULT_SET, meter: bool = True,
          pixels: int = 0, snap: str = "", seconds: int = 3600,
          extra_env: dict | None = None, **kw) -> Run:
    """One probe run.  `buttons` defaults to the VERSION-B boot prefix, because
    the silent default of this cartridge is the WRONG GAME."""
    out_tsv.parent.mkdir(parents=True, exist_ok=True)
    out_tsv.unlink(missing_ok=True)     # never re-read a previous run's file
    env = {
        "PROBE_FRAMES": str(frames),
        "PROBE_OUT": str(out_tsv),
        "PROBE_INPUT": buttons,
        "PROBE_LM": lm_env(build),
        # OBJECT SLOTS PROCESSED is a standard compared column, not an option:
        # docs/knowledge/06 names it the field most likely to be missing from
        # inherited tooling and the one that decides whether slowdown can be
        # retrofitted at all. Wave 2 put it in the vector before wave 4 has an
        # object driver to compare it against, which is the whole point.
        "PROBE_OBJ": obj_env(build),
        "PROBE_REQUIRE_BUILD": build,
    }
    if meter:
        env["PROBE_METER"] = "1"
    if pixels:
        env["PROBE_PIXELS"] = str(pixels)
    if snap:
        env["PROBE_SNAP"] = snap
        env["PROBE_SNAPTAG"] = out_tsv.stem
    if extra_env:
        env.update({k: str(v) for k, v in extra_env.items()})
    return run(HERE / "frame.lua", machine=machine, seconds=seconds, env=env, **kw)


def check(r: Run, what: str, *, quiet: bool = False) -> None:
    """Every run is checked the same way: the probe's own assertions first, the
    exit code second.  A halted machine exits 0."""
    pin = r.find("MACHINE ")
    if not quiet and pin:
        print("  " + pin[0])
    if pin and PINNED_MAINCPU_FNV64 != "AUTO":
        got = pin[0].split("maincpu_fnv64=")[-1]
        if got != PINNED_MAINCPU_FNV64:
            raise SystemExit(f"{what}: MACHINE PIN CHANGED: {got} != "
                             f"{PINNED_MAINCPU_FNV64}. The ROM directory is not "
                             f"what it was; no cross-session number is trustworthy.")
    if r.fails:
        for f in r.fails:
            print("  " + f, file=sys.stderr)
        print(r.stdout[-2500:], file=sys.stderr)
        raise SystemExit(f"{what}: the probe FAILED its own boot assertions")
    if r.returncode != 0 or not r.lines:
        print(r.stdout[-2500:], file=sys.stderr)
        print(r.stderr[-1500:], file=sys.stderr)
        raise SystemExit(f"{what}: MAME exit {r.returncode}, {len(r.lines)} probe lines")


def census(r: Run) -> None:
    for l in r.find("CENSUS "):
        print("  " + l)
    # WARN is a real result, not noise: the bg_scale watch reports the BIOS's
    # non-100% boot writes here. A warning nobody prints is a watch nobody
    # installed.
    for l in r.find("WARN "):
        print("  " + l)
    for l in r.find("BGSCALE "):
        print("  " + l)
    for l in r.find("BUILD "):
        print("  " + l)


# --------------------------------------------------------------------------- commands
def _cmd_verify(argv: list[str]) -> int:
    res = subprocess.run([str(mame_exe()), "-rompath", DEFAULT_ROMPATH,
                          "-verifyroms", DEFAULT_SET],
                         cwd=str(mame_home()), capture_output=True, text=True)
    print(res.stdout.strip())
    if "is bad" in res.stdout:
        print("\nBAD. Check for a .zip that has crept back beside ddpdojblk.7z: "
              "MAME resolves by set name, not by quality.", file=sys.stderr)
        return 1
    r = trace(OUT / "verify.tsv", frames=20, buttons="", seconds=60, meter=False)
    print("  " + (r.find("MACHINE ") or ["MACHINE <none>"])[0])
    print("  " + (r.find("refresh_hz") or ["?"])[0])
    return 0


def _cmd_landmarks(argv: list[str]) -> int:
    d = landmarks()
    print(f"# {d['_note']}\n")
    print("RAM (shared by both builds):")
    for k, v in d["ram"].items():
        print(f"  {k:14s} " + (f"${v[0]:06X}..${v[1]:06X}" if isinstance(v, list)
                               else f"${v:06X}"))
    print("BIOS trampolines (jump through the RAM vectors above):")
    for k, v in d["bios"].items():
        print(f"  {k:14s} ${v:06X}")
    for b, x in d["builds"].items():
        tag = "2002.04.05 MASTER (chooser default -- NOT Black Label)" if b == "A" \
            else "2002.10.07 BLACK VER -- THE PORT TARGET"
        print(f"\n=== build {b}: {tag} ===")
        print(f"  loop head      ${x['loopHead']:06X}   tail ${x['loopTail']:06X} "
              f"(bra back)")
        for i, c in enumerate(x["calls"]):
            note = ""
            if c == x["counters"]:
                note = "  counters: $80390A++, bchg $80390D bit0, $80390E mod 3"
            if c == x["frameSync"]:
                note = "  FRAME SYNC (arms $803940, then spins)"
            print(f"    call {i}      ${c:06X}{note}")
        print(f"  wait loops     " + " ".join(f"${w:06X}" for w in x["waitLoops"])
              + f"   (frame sync reaches ${x['waitLoop']:06X})")
        print(f"  ISR6 release   ${x['isr6Release']:06X}")
        print(f"  ISR6 (A) gate  ${x['isr6Gate']:06X} -> ${x['isr6GateTarget']:06X}, "
              f"skips " + " ".join(f"${c:06X}" for c in x["isr6GateSkips"]))
        print(f"  input read     ${x['inputLea'][0]:06X} (lea $C08000,A0)   "
              f"P1 mirror store ${x['p1MirrorStore'][0]:06X}")
        print("  semaphore writes:")
        for w in x["semaphoreWrites"]:
            v = (f"waits {w['value']}" if w["value"] > 0 else
                 "clears" if w["value"] == 0 else
                 "waits a RUNTIME value (moveq #2,D0 feeds it here)")
            print(f"    ${w['pc']:06X}  {w['how']:12s} {v}")
    print("\nNOTE: build B has a THREE-vblank arm ($23C25C) that build A does not "
          "have,\nand arms through a register at $23C38A (moveq #2,D0 / move.b D0)."
          "\nBoth are SCHEDULING, not slowdown, and both are invisible to a search "
          "for `move.b #imm,$803940`.")
    return 0


def _cmd_trace(argv: list[str]) -> int:
    frames = int(argv[0]) if argv else 900
    out = OUT / "trace.tsv"
    r = trace(out, frames=frames)
    check(r, "trace")
    census(r)
    print(f"wrote {out}")
    return 0


def _cmd_snap(argv: list[str]) -> int:
    """Boot to VERSION-B and write framebuffer PNGs.  docs/knowledge/02 trap 2:
    ALWAYS LOOK AT A FRAMEBUFFER before believing a run reached gameplay."""
    at = argv[0] if argv else "300,700,1300,1700,2200,2600"
    frames = max(int(x) for x in at.split(",")) + 20
    r = trace(OUT / "snap.tsv", frames=frames, snap=at, meter=False)
    check(r, "snap")
    census(r)
    for l in r.find("SNAP "):
        print("  " + l)
    print(f"PNGs in {scratch() / 'snap' / DEFAULT_SET}")
    return 0


def _cmd_seed(argv: list[str]) -> int:
    """PIN VERSION-B IN NVRAM, by procedure.

    Main RAM IS the NVRAM on this board (pgm.cpp:329 `.share(m_mainram)` and
    NVRAM(config,"sram",...) name the same 128 KiB), so MAME writing nvram on
    exit persists the game's own state -- including the version choice, which
    the chooser stores.  The procedure: run WITH -nvram_save into a private
    directory, script the chooser to VERSION-B, exit; MAME leaves
    <dir>/ddpdojblk/sram.  Then boot with NO input at all and assert the run
    lands in build B.

    The image is ROM-DERIVED (it is a snapshot of the board's RAM) and is
    therefore NEVER committed; only its sha256 goes in NOTES-versions.md.
    """
    seeddir = OUT / "seed-nvram"
    if seeddir.exists():
        shutil.rmtree(seeddir)
    (seeddir / DEFAULT_SET).mkdir(parents=True, exist_ok=True)
    print("1. choosing VERSION-B and letting MAME write the NVRAM")
    r = trace(OUT / "seed.tsv", frames=900, buttons="560=D;570=;600=A;610=",
              nvram_dir=seeddir, nvram_save=True, meter=False)
    check(r, "seed/write")
    census(r)
    sram = seeddir / DEFAULT_SET / "sram"
    if not sram.exists():
        raise SystemExit(f"MAME wrote no {sram}")
    dig = hashlib.sha256(sram.read_bytes()).hexdigest()
    print(f"   {sram}  {sram.stat().st_size} bytes  sha256={dig}")
    # The versions recon's candidate flag byte, 00 -> 01. Confirm or refute.
    b = sram.read_bytes()
    print(f"   $03810 = {b[0x3810]:02X}   (versions recon's candidate "
          f"VERSION-B flag; it reported 00 -> 01)")
    nz = [i for i, v in enumerate(b) if v]
    print(f"   non-zero bytes: {len(nz)}  range ${min(nz):05X}..${max(nz):05X}")

    print("2. SILENT boot from the seeded image -- no chooser input at all")
    # 1500 logic frames, not 900: the chooser's countdown ticks about once
    # every 115 logic frames (measured: "6" at lf560, "4" at lf790, "3" at
    # lf850), so it does not expire until ~lf1200. A 900-frame check ended
    # while the menu was still up and reported "still build A", which is a
    # measurement of the run being too short, not of the seed not working.
    r2 = trace(OUT / "seedcheck.tsv", frames=1500, buttons="",
               nvram_dir=seeddir, snap="850,1450", meter=False)
    check(r2, "seed/silent-boot")
    census(r2)
    print(f"   PNG in {scratch() / 'snap' / DEFAULT_SET}")
    return 0


# --------------------------------------------------------------------------- scenarios
def scenarios() -> dict:
    return json.loads((HERE / "scenarios.json").read_text(encoding="utf8"))


def expand_repeat(rep: dict) -> str:
    """WAVE 69.  A scenario tail as a REPEATING CYCLE rather than a literal.

    A stage-length script written out frame by frame does not fit: 19,000 logic
    frames of movement is ~1,900 `lf=NAMES` items, and the whole Windows
    environment block -- which is how `frame.lua` receives PROBE_INPUT -- caps
    at 32,767 characters.  The cycle form is also the honest one: the pattern IS
    periodic, and writing it out longhand would hide that behind a wall of
    numbers nobody would read.

    Deterministic and total: same dict in, same string out, no clock, no random.
    """
    for k in ("from", "period", "until", "cycle"):
        if k not in rep:
            raise SystemExit(f"tailRepeat is missing '{k}'")
    if rep["period"] <= 0:
        raise SystemExit("tailRepeat.period must be positive")
    if not rep["cycle"]:
        raise SystemExit("tailRepeat.cycle is empty")
    items, lf, i = [], int(rep["from"]), 0
    while lf <= int(rep["until"]):
        items.append(f"{lf}={rep['cycle'][i % len(rep['cycle'])]}")
        lf += int(rep["period"])
        i += 1
    return ";".join(items)


def build_script(defs: dict, s: dict) -> str:
    pre = defs["bootPrefix"][s.get("boot", "versionB")]
    parts = [pre]
    if s.get("tail"):
        parts.append(s["tail"])
    if s.get("tailRepeat"):
        parts.append(expand_repeat(s["tailRepeat"]))
    return ";".join(parts)


def run_scenario(defs: dict, s: dict, *, out: Path, tag: str = "",
                 **kw) -> tuple[Run, Path]:
    tsv = out / f"{s['name']}{tag}.tsv"
    if s.get("inject"):
        # ARTIFICIAL LOAD. Scenario-level, so an overrun run is a PERMANENT
        # member of the corpus rather than a one-off experiment.
        ee = dict(kw.pop("extra_env", None) or {})
        ee.setdefault("PROBE_INJECT", s["inject"])
        kw["extra_env"] = ee
    r = trace(tsv, frames=s["frames"], buttons=build_script(defs, s),
              build=s.get("build", "B"), meter=s.get("meter", True),
              pixels=s.get("pixels", 0), snap=s.get("snap", ""), **kw)
    return r, tsv


def first_divergence(a: Path, b: Path) -> list[str]:
    """Per-COLUMN first divergence -- not just 'the files differ'.  A single
    first-divergent-row report points at whichever field happens to be leftmost
    and hides the rest (docs/knowledge/08: rank and chain make every field
    diverge at once, and the leftmost is a symptom, not the cause)."""
    ra = a.read_text().splitlines()
    rb = b.read_text().splitlines()
    if not ra or not rb:
        return [f"empty trace: {a}={len(ra)} rows {b}={len(rb)} rows"]
    cols = ra[0].split("\t")
    if rb[0].split("\t") != cols:
        return ["column headers differ"]
    msgs = []
    if len(ra) != len(rb):
        msgs.append(f"row count {len(ra) - 1} vs {len(rb) - 1}")
    for ci, name in enumerate(cols):
        for ri in range(1, min(len(ra), len(rb))):
            va = ra[ri].split("\t")
            vb = rb[ri].split("\t")
            if va[ci] != vb[ci]:
                msgs.append(f"col {name}: first differs at row {ri} "
                            f"(lf={va[0]}): {va[ci]} vs {vb[ci]}")
                break
    return msgs


def _cmd_scen(argv: list[str]) -> int:
    defs = scenarios()
    names = argv or [s["name"] for s in defs["scenarios"]]
    out = OUT / "scen"
    out.mkdir(parents=True, exist_ok=True)
    rc = 0
    for name in names:
        s = next((x for x in defs["scenarios"] if x["name"] == name), None)
        if s is None:
            raise SystemExit(f"unknown scenario {name}; have "
                             f"{[x['name'] for x in defs['scenarios']]}")
        print(f"\n=== {name}: {s['why']}")
        print(f"    {s['frames']} logic frames, build {s.get('build', 'B')}, "
              f"script {build_script(defs, s)}")
        r, tsv = run_scenario(defs, s, out=out)
        check(r, name)
        census(r)
        print(f"    -> {tsv}")
    return rc


# --------------------------------------------------------------------------- gate
def _cmd_gate(argv: list[str]) -> int:
    """THE DETERMINISM GATE.

    Two identical boot->stage-1 VERSION-B runs must produce byte-identical
    traces.  `--break-cfg` deliberately points MAME at its own default cfg/nvram
    directories with -readconfig/-writeconfig, which must make it FAIL: a gate
    that has never been seen red is not a gate (docs/knowledge/03).
    """
    broke = "--break-cfg" in argv
    rest = [a for a in argv if not a.startswith("--")]
    defs = scenarios()
    name = rest[0] if rest else defs["gate"]
    s = next(x for x in defs["scenarios"] if x["name"] == name)
    out = OUT / "gate"
    out.mkdir(parents=True, exist_ok=True)
    kw: dict = {}
    if broke:
        # MAME's OWN directories, and let it read and write them. This is the
        # exact configuration that made two identical wave-0 runs differ on
        # every row, because MAME persists a coin counter in <cfg>/<set>.cfg.
        kw = {"cfg_dir": mame_home() / "cfg", "nvram_dir": mame_home() / "nvram",
              "nvram_save": True,
              "extra": ["-readconfig", "-writeconfig"]}
        print("!! --break-cfg: MAME's DEFAULT cfg/nvram, -readconfig -writeconfig")
        print("!! this run MUST go RED. If it prints IDENTICAL the gate is fake.")

    print(f"=== gate scenario '{name}': {s['why']}")
    digs, tsvs = [], []
    for i in (1, 2):
        r, tsv = run_scenario(defs, s, out=out, tag=f".{i}", **kw)
        check(r, f"gate/{i}", quiet=(i == 2))
        if i == 1:
            census(r)
        digs.append(hashlib.sha256(tsv.read_bytes()).hexdigest())
        tsvs.append(tsv)
        print(f"  run {i}: {digs[-1]}  {tsv.name}  ({len(tsv.read_text().splitlines()) - 1} rows)")
    ok = digs[0] == digs[1]
    msgs = [] if ok else first_divergence(*tsvs)
    # The ONE tolerated difference, and it is tolerated because it was measured
    # to the byte: d_date carries the five 8-byte words the V3021 calendar
    # lands in ($80209B/$80209D and four copies). Two runs that straddle
    # midnight differ there and NOWHERE ELSE -- see frame.lua's RAM_HOLES.
    # Anything else differing is a real divergence.
    date_only = bool(msgs) and all(m.startswith("col d_date:") for m in msgs)
    if ok:
        print("IDENTICAL")
    elif date_only:
        print("IDENTICAL-EXCEPT-DATE -- the two runs straddled a calendar date "
              "change and differ ONLY in d_date (the V3021 words). Every game "
              "field agrees.")
        for m in msgs:
            print("  " + m)
    else:
        print("DIVERGED")
        for m in msgs:
            print("  " + m)
    ok = ok or date_only
    if broke:
        print("EXPECTED-RED: " + ("STILL IDENTICAL -- the isolation flags are "
                                  "not what makes this deterministic, or MAME's "
                                  "cfg was already clean; investigate"
                                  if ok else "diverged, as it must"))
        return 0 if not ok else 1
    return 0 if ok else 1


def _cmd_inputlead(argv: list[str]) -> int:
    """Measured on VERSION-B, IN GAMEPLAY -- not on a menu, where the input
    mirror may be written by different code. Expected result: 0."""
    at = int(argv[0]) if argv else 2000
    out = OUT / "lead.tsv"
    pre = scenarios()["bootPrefix"]["versionB"]
    r = trace(out, frames=at + 20, buttons=pre + f";{at}=A;{at + 6}=",
              meter=False)
    check(r, "inputlead")
    rows = [ln.split("\t") for ln in out.read_text().splitlines()]
    cols = {n: i for i, n in enumerate(rows[0])}
    first = None
    for row in rows[1:]:
        if int(row[cols["lf"]]) > at - 5 and int(row[cols["p1raw"]]) & 0x10:
            first = int(row[cols["lf"]])
            break
    lead = None if first is None else first - at - 1
    print(f"P1 Button 1 applied at the sample point of logic frame {at}; "
          f"$803970 bit 4 first set at logic frame {first}; lead = {lead}")
    return 0 if lead == 0 else 1


def _cmd_pixred(argv: list[str]) -> int:
    """RED-VALIDATE THE PIXEL LAYER (wave-1 item 5(c)).

    Run the gate scenario twice: once normally, once with the IGS023's sprite
    DMA disabled from Lua.  The game's RAM is not touched, so every RAM digest
    MUST match; the framebuffer loses its whole sprite layer, so `pix` MUST
    differ.  Either half failing means the pixel column is decoration."""
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == defs["gate"])
    s = dict(s, pixels=10)
    a, ta = run_scenario(defs, s, out=OUT, tag=".pixnorm")
    check(a, "pixred/normal", quiet=True)
    b, tb = run_scenario(defs, s, out=OUT, tag=".pixnospr",
                         extra_env={"PROBE_NOSPRITES": "1"})
    check(b, "pixred/nosprites", quiet=True)
    msgs = first_divergence(ta, tb)
    cols = {m.split(":")[0].replace("col ", "") for m in msgs}
    print(f"  columns that differ with the sprite layer switched off: "
          f"{sorted(cols) or 'NONE'}")
    for m in msgs:
        print("    " + m)
    ram_cols = {"d_ram", "d_spr", "d_top", "d_bg", "d_tx"}
    ok = ("pix" in cols) and not (cols & ram_cols)
    print("PIXEL LAYER RED-VALIDATED: pix moved, the RAM digests did not"
          if ok else
          "NOT VALIDATED: " + ("pix did NOT change -- it cannot see the sprite "
                               "layer" if "pix" not in cols else
                               f"RAM digests moved too ({sorted(cols & ram_cols)}) "
                               "-- the poke perturbed the game, not just the picture"))
    return 0 if ok else 1


# --------------------------------------------------------------------------- gfx
# Wave 3.  ROM-derived output only ever goes under games/ddpdoj/rip/, which is
# gitignored twice over (the repo-root `rip/` rule, unanchored so it matches at
# any depth, AND games/ddpdoj/rip/.gitignore containing `*`).
RIP = HERE.parent.parent / "rip"
TOOLS = HERE.parent
ROMDIR = RIP / "rom"

# Spread over BOOT and STAGE 1 both. A gate that only samples gameplay never
# sees the TX-only screens; one that only samples boot never sees a 90-sprite
# frame. 16 points, so the >=12 requirement has slack for a dropped dump.
GFX_POINTS = "200,400,600,800,1000,1300,1600,1800,1900,2000,2100,2200,2300,2400,2500,2580"
GFX_MIN_PAIRS = 12


def _gfx_run(tag: str, points: str, frames: int, *, zoomcov: str = "",
             zoomsynth: bool = False, buttons: str | None = None,
             outdir: Path | None = None) -> Path:
    """One MAME run that leaves IGS023 state+framebuffer pairs on disk."""
    d = outdir if outdir is not None else RIP / f"gfx-{tag}"
    if d.exists():
        shutil.rmtree(d)         # never let a previous run's dumps be counted
    d.mkdir(parents=True, exist_ok=True)
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == defs["gate"])
    script = buttons if buttons is not None else build_script(defs, s)
    env = {"PROBE_GFX": str(d), "PROBE_GFXAT": points}
    if zoomcov:
        env["PROBE_ZOOMCOV"] = zoomcov
    if zoomsynth:
        env["PROBE_ZOOMSYNTH"] = "1"
    r = trace(OUT / f"gfx-{tag}.tsv", frames=frames, buttons=script,
              meter=False, extra_env=env)
    check(r, f"gfx/{tag}")
    census(r)
    for l in r.find("ZOOMCOV "):
        print("  " + l)
    n = len(r.find("GFXDUMP "))
    print(f"  {n} state+framebuffer dumps in {d}")
    return d


def _cmd_gfx(argv: list[str]) -> int:
    """THE GFX GATE (wave 3 item 1).

    One command: run MAME with the VERSION-B script, dump >=12 frame pairs over
    boot AND stage 1, re-render each with our own decoder, and FAIL on anything
    that is not 100.0000 % -- or on too few pairs.

      pgm.py gfx                 dump and gate
      pgm.py gfx --reuse         gate the dumps already on disk
      pgm.py gfx --mutate NAME   RED VALIDATION; the gate must go red
      pgm.py gfx --mutate all    every mutation in turn; ALL must go red
    """
    import subprocess as sp
    reuse = "--reuse" in argv
    mut = None
    for i, a in enumerate(argv):
        if a == "--mutate" and i + 1 < len(argv):
            mut = argv[i + 1]
    d = RIP / "gfx-gate"
    if not reuse and mut is None:
        d = _gfx_run("gate", GFX_POINTS, 2600)
    elif not d.exists():
        d = _gfx_run("gate", GFX_POINTS, 2600)
    if not ROMDIR.exists():
        raise SystemExit(f"{ROMDIR} missing -- run `python "
                         f"games/ddpdoj/tools/assets.py extract` first")

    def gate(m: str | None) -> int:
        cmd = [sys.executable, str(TOOLS / "gfxgate.py"), "--rom", str(ROMDIR),
               "--dump", str(d), "--min-pairs", str(GFX_MIN_PAIRS)]
        if m:
            cmd += ["--mutate", m]
        res = sp.run(cmd, capture_output=True, text=True)
        sys.stdout.write(res.stdout)
        sys.stderr.write(res.stderr)
        return res.returncode

    if mut == "all":
        from importlib import util as _u
        spec = _u.spec_from_file_location("gfxgate", TOOLS / "gfxgate.py")
        mod = _u.module_from_spec(spec); spec.loader.exec_module(mod)
        base = gate(None)
        print(f"\nBASELINE: {'PASS' if base == 0 else 'FAIL'}")
        bad = []
        for name in mod.MUTATIONS:
            print(f"\n--- mutation {name} (must go RED) ---")
            rc = gate(name)
            print(f"    {name}: {'RED (good)' if rc else 'STILL GREEN -- THE GATE IS FAKE'}")
            if rc == 0:
                bad.append(name)
        print("\nRED VALIDATION: " + ("every mutation was caught"
                                      if not bad and base == 0 else
                                      f"BROKEN -- baseline={'ok' if base==0 else 'FAILED'} "
                                      f"undetected={bad}"))
        return 0 if (base == 0 and not bad) else 1
    rc = gate(mut)
    if mut:
        print(f"EXPECTED-RED [{mut}]: " +
              ("diverged, as it must" if rc else
               "STILL 100 % -- the gate cannot see this mutation and is not a gate"))
        return 0 if rc else 1
    return rc


def _cmd_sprites(argv: list[str]) -> int:
    """THE SPRITE HARVEST (wave 3 item 3).

    Sprites cannot be enumerated statically on this board -- there is no table
    in ROM, only a word offset into a length-compressed stream.  So the atlas is
    built from a MEASUREMENT: every `offs`/width/height the game handed to the
    hardware, over the whole corpus, recorded at the sample point.  The policy
    and its consequence go into the manifest; `assets.py export` reads these
    TSVs.
    """
    hv = RIP / "harvest"
    hv.mkdir(parents=True, exist_ok=True)
    defs = scenarios()
    names = argv or ["stage1-open", "stage1-deep"]
    total = {}
    for name in names:
        s = next((x for x in defs["scenarios"] if x["name"] == name), None)
        if s is None:
            raise SystemExit(f"unknown scenario {name}")
        tsv = hv / f"{name}.tsv"
        tsv.unlink(missing_ok=True)
        print(f"\n=== harvesting sprites over '{name}' ({s['frames']} logic frames)")
        r, _ = run_scenario(defs, s, out=OUT, tag=".harv",
                            extra_env={"PROBE_SPRHARVEST": str(tsv)})
        check(r, f"sprites/{name}")
        for l in r.find("CENSUS sprite_harvest"):
            print("  " + l)
        for line in tsv.read_text(encoding="utf8").splitlines()[1:]:
            f = line.split("\t")
            total[(f[0], f[1], f[2])] = total.get((f[0], f[1], f[2]), 0) + int(f[5])
    print(f"\n{len(total)} distinct (offs,width,height) records over "
          f"{len(names)} scenario(s); TSVs in {hv}")
    print("NOTE: this is a PRESENCE measurement. Content the corpus never "
          "reached is ABSENT from the atlas -- enlarge the corpus to enlarge it.")
    return 0


def _cmd_sound(argv: list[str]) -> int:
    """THE SOUND MAP (wave 3 item 4).  Identification only -- audio PLAYBACK is
    deliberately out of the slice (PLAN §6 item 2); this secures the map while
    the tooling is warm, and closes three wave-0 open items:
      * the 68k->Z80 mailbox (the doorbell carries no ID; the payload does),
      * where the uploaded Z80 program lives inside the 68k ROM,
      * the 17 samples whose end <= start, by logging the ICS register writes
        IN ORDER instead of snapshotting them at keyon.
    """
    d = RIP / "sound"
    d.mkdir(parents=True, exist_ok=True)
    defs = scenarios()
    name = argv[0] if argv else "stage1-deep"
    s = next(x for x in defs["scenarios"] if x["name"] == name)
    print(f"=== sound map over '{name}' ({s['frames']} logic frames)")
    r, _ = run_scenario(defs, dict(s, meter=False), out=OUT, tag=".snd",
                        extra_env={"PROBE_SOUND": str(d)})
    check(r, "sound")
    for l in r.find("CENSUS sound"):
        print("  " + l)
    _sound_report(d)
    return 0


def _sound_report(d: Path) -> None:
    """Reduce the three logs to the tables the plan asks for."""
    def rows(p: Path):
        ls = p.read_text(encoding="utf8").splitlines()
        cols = ls[0].split("\t")
        return [dict(zip(cols, l.split("\t"))) for l in ls[1:]]

    mail = rows(d / "mailbox.tsv")
    key = rows(d / "keyon.tsv")
    ics = rows(d / "ics.tsv")
    print(f"\nMAILBOX: {len(mail)} doorbell(s)")
    pcs = {}
    for m in mail:
        pcs[m["pc"]] = pcs.get(m["pc"], 0) + 1
    print(f"  doorbell PCs: {pcs}")
    dat = {}
    for m in mail:
        dat[m["data"]] = dat.get(m["data"], 0) + 1
    print(f"  doorbell data values: {dat}  "
          f"(wave 0 saw only 0001 -- a bell, not a message)")
    # the command payload: which window offsets were written before each ring
    offs = {}
    for m in mail:
        for tok in m["payload_since_last_door"].split():
            o = tok.split("=")[0]
            offs[o] = offs.get(o, 0) + 1
    top = sorted(offs.items(), key=lambda kv: -kv[1])[:12]
    print(f"  window offsets written before a ring (top 12): {top}")
    # MAILBOX -> KEYON
    bydoor: dict[str, list] = {}
    for k in key:
        bydoor.setdefault(k["after_door"], []).append(k)
    print(f"\nMAILBOX -> KEYON: {len(key)} keyon(s), "
          f"{len(bydoor)} distinct preceding doorbell(s)")
    tbl = []
    for m in mail:
        ks = bydoor.get(m["door"], [])
        tbl.append((m["door"], m["lf"], m["payload_since_last_door"][:44],
                    len(ks), ",".join(sorted({x["start"] for x in ks}))[:60]))
    for row in tbl[:24]:
        print(f"  door {row[0]:>4s} lf{row[1]:>5s} payload[{row[2]}] "
              f"-> {row[3]} keyon(s) starts={row[4]}")
    if len(tbl) > 24:
        print(f"  ... {len(tbl)-24} more in {d/'mailbox.tsv'}")
    # THE 17 end<=start SAMPLES
    bad = [k for k in key if int(k["end"], 16) <= int(k["start"], 16)]
    print(f"\nend <= start keyons: {len(bad)} of {len(key)}")
    if bad:
        seen = {}
        for k in bad:
            seen[(k["start"], k["end"], k["saddr"])] = seen.get(
                (k["start"], k["end"], k["saddr"]), 0) + 1
        for kk, n in sorted(seen.items())[:12]:
            print(f"  start={kk[0]} end={kk[1]} saddr={kk[2]} x{n}")
        # WHY end <= start.  With every register write logged in order we can
        # ask the question wave 0 could not: after such a keyon, does the driver
        # go on to move the END registers ($04/$05) for that same voice? If it
        # does, the keyon-time snapshot is simply reading a half-programmed
        # voice, and the sample is not a 1 MiB bank wrap at all.
        byrow = {}
        for i, r in enumerate(ics):
            byrow.setdefault(int(r["n"]), i)
        fixed = 0
        for k in bad[:200]:
            i = byrow.get(int(k["ics_row"]))
            if i is None:
                continue
            for r in ics[i + 1:i + 60]:
                if r["voice"] == k["voice"] and r["reg"] in ("04", "05"):
                    fixed += 1
                    break
        n = min(len(bad), 200)
        print(f"  of the first {n}, {fixed} are followed within 60 ICS register "
              f"writes by another write to the END registers ($04/$05) of the "
              f"SAME voice")
        saddrw = sum(1 for r in ics if r["reg"] == "11" and r["half"] == "hi")
        samebank = sum(1 for k in bad
                       if (int(k["start"], 16) >> 20) == (int(k["end"], 16) >> 20))
        print(f"  saddr (register $11) high byte written {saddrw} time(s); "
              f"{samebank}/{len(bad)} of the end<=start keyons have start and "
              f"end in the SAME 1 MiB bank, so a bank wrap does not explain them")
    _z80_blob(d)
    print(f"\nlogs: {d}")


def _z80_blob(d: Path) -> None:
    """WHERE THE Z80 PROGRAM LIVES IN THE 68k ROM.

    The Z80 has 64 KiB of RAM and NO ROM (pgm.cpp:29), so its whole program was
    uploaded through the $C10000 window.  Searching the DECRYPTED :maincpu image
    -- not the ROM file: init_ddp3() decrypts in place -- for a needle out of the
    Z80's RAM finds it, but only under the right copy model.  Three are tried,
    and the run length is reported rather than the address alone: an address is a
    lead, a long verbatim run is a location.
    """
    z = (d / "z80ram.bin").read_bytes()
    m = (d / "maincpu.bin").read_bytes()
    # a needle out of the first stretch of 32 consecutive non-zero bytes
    start = next((i for i in range(len(z) - 32)
                  if all(z[i + k] for k in range(32))), None)
    if start is None:
        print("\nZ80 BLOB: the Z80's RAM has no 32-byte non-zero stretch")
        return
    needle = z[start:start + 32]
    print(f"\nZ80 BLOB: needle = 32 bytes at z80 RAM ${start:04X}")
    best = None
    for name, lane in (("verbatim (stride 1)", None),
                       ("even byte lane (stride 2, +0)", 0),
                       ("odd byte lane (stride 2, +1)", 1)):
        hay = m if lane is None else m[lane::2]
        step = 1 if lane is None else 1
        hits, i = [], 0
        while len(hits) < 8:
            j = hay.find(needle, i)
            if j < 0:
                break
            hits.append(j)
            i = j + 1
        # Measure the run OUTWARD FROM THE NEEDLE, not from z80 $0000: the low
        # bytes of Z80 RAM are runtime scratch by the time the run ends, so an
        # anchor at 0 would score 6 bytes even on a perfect match further up.
        runs = []
        for j in hits:
            f = 0
            while (j + f < len(hay) and start + f < len(z)
                   and hay[j + f] == z[start + f]):
                f += 1
            b = 0
            while (j - b - 1 >= 0 and start - b - 1 >= 0
                   and hay[j - b - 1] == z[start - b - 1]):
                b += 1
            runs.append((b + f, b, f))
        addr = [f"${(h if lane is None else h*2+lane):06X}" for h in hits]
        print(f"  {name:30s} hits={len(hits)} at {addr} "
              f"run_around_needle(total,back,fwd)={runs}")
        for h, r in zip(hits, runs):
            a0 = (h if lane is None else h * 2 + lane) - r[1]
            z0 = start - r[1]
            build = {0x1: "A ($13xxxx, MASTER)", 0x2: "B ($23xxxx, BLACK -- "
                     "the port target)"}.get((a0 >> 20) & 0xf, "?")
            print(f"      matched region ${a0:06X}..${a0 + r[0] - 1:06X} "
                  f"= z80 RAM ${z0:04X}..${z0 + r[0] - 1:04X}   build {build}")
        for h, r in zip(hits, runs):
            if best is None or r[0] > best[2]:
                best = (name, (h if lane is None else h * 2 + lane), r[0], lane, r)
    if best and best[2] > 4096:
        print(f"  => THE Z80 PROGRAM IS COPIED AS '{best[0]}': "
              f"{best[2]} contiguous bytes around the needle match at "
              f"${best[1]:06X} in the decrypted :maincpu "
              f"({best[4][1]} back, {best[4][2]} forward)")
    else:
        print(f"  => NO MODEL PRODUCED A LONG VERBATIM RUN (best {best[2] if best else 0}"
              f" bytes). The needle is present but the surrounding bytes are not, "
              f"so the upload is NOT a straight copy under any of these three "
              f"models -- it is transformed (packed, or written through code "
              f"rather than a block move). RECORDED AS UNRESOLVED: I did not "
              f"find the blob's source, and I am not going to call a 32-byte "
              f"coincidence a location.")


def _cmd_zoomcov(argv: list[str]) -> int:
    """ZOOM COVERAGE (wave 3 item 2).

    Today's corpus contains zoom-table entries 1 and 0xa: presence, not
    coverage.  This drives all 16 entries x grow/shrink x x-only/y-only/both x
    4 flips, twice -- once against the game's own zoom table and once against a
    synthetic one -- by switching the sprite DMA off and writing our own display
    list into the post-DMA buffer.  Both sides then read the same dumped buffer,
    so it is still our decoder against MAME's, not against itself.
    """
    import subprocess as sp
    start = int(argv[0]) if argv and not argv[0].startswith("-") else 2000
    per = 18
    combos = 16 * 2 * 3 * 4
    batches = -(-combos // per)
    # each batch is HELD for two logic frames so that its own state frame and
    # its own pixels frame form the pair (see frame.lua's zc.hold note)
    frames = start + batches * 2 + 40
    # TWO RUNS, one zoom table each.  A table change mid-run costs exactly one
    # frame pair because the table reaching the draw is latched a frame ahead of
    # the sprite buffer -- measured, see frame.lua's ZC_SYNTH note.  Rather than
    # model an offset that could not be pinned, each run holds its table fixed.
    dirs, rc = [], 0
    for tag, synth in (("zoomcov-native", False), ("zoomcov-synth", True)):
        print(f"\n=== zoom coverage run: {tag} "
              f"({'synthetic zoom table' if synth else 'the GAME OWN zoom table'})")
        d = _gfx_run(tag, "", frames, zoomcov=f"{start},{per}", zoomsynth=synth)
        dirs.append(d)
        rc |= sp.run([sys.executable, str(TOOLS / "gfxgate.py"), "--rom", str(ROMDIR),
                      "--dump", str(d), "--min-pairs", str(batches),
                      "--json", str(OUT / f"{tag}.json")]).returncode
    dumpargs = [x for d in dirs for x in ("--dump", str(d))]
    rc |= sp.run([sys.executable, str(TOOLS / "zoomcov.py"), "--rom", str(ROMDIR),
                  *dumpargs]).returncode
    print("\n--- RED VALIDATION: break the zoom loop (zoom_word -> 0) ---")
    red = 0
    for d in dirs:
        red |= sp.run([sys.executable, str(TOOLS / "gfxgate.py"), "--rom", str(ROMDIR),
                       "--dump", str(d), "--min-pairs", str(batches),
                       "--mutate", "zoom-off"], stdout=sp.DEVNULL).returncode
    print("EXPECTED-RED zoom-off: " +
          ("diverged, as it must" if red else
           "STILL 100 % -- the zoom corpus does not exercise the zoom loop"))
    # WAVE 11.  The entry-$F substitution is the one place the decoder does
    # something the ROM does not say, and until now nothing could see it: on the
    # natural 16-pair corpus `zoom-f-literal` is invisible (no frame there
    # reaches effective index $F), so it lives in gfxgate's EXTRA_MUTATIONS and
    # is red-validated HERE, where the poker drives index $F on purpose --
    # against MAME's own framebuffer, not against our other decoder.
    print("\n--- RED VALIDATION: read zoom entry $F LITERALLY (0, not 1) ---")
    redf = 0
    for d in dirs:
        redf |= sp.run([sys.executable, str(TOOLS / "gfxgate.py"), "--rom", str(ROMDIR),
                        "--dump", str(d), "--min-pairs", str(batches),
                        "--mutate", "zoom-f-literal"], stdout=sp.DEVNULL).returncode
    print("EXPECTED-RED zoom-f-literal: " +
          ("diverged, as it must -- MAME's framebuffer agrees with the SUBSTITUTE "
           "and not with the ROM's literal 0. That is inference plus emulator "
           "behaviour, NOT a hardware measurement, and it stays labelled that way."
           if redf else
           "STILL 100 % -- the zoom corpus never reaches effective index $F, so "
           "the substitution is covered by nothing"))
    return rc or (0 if (red and redf) else 1)


def _cmd_check(argv: list[str]) -> int:
    """THE ddpdoj CHECK RUNNER -- one command, every gate, cheapest first.

    docs/knowledge/03: A SKIP IS NOT A PASS.  A stage that cannot run because a
    path moved is a FAILURE, not a skip; only a genuinely environmental reason
    (no MAME, no ROM directory) is a skip, and the skip count is printed on the
    last line where it cannot be missed.
    """
    import subprocess as sp
    results = []

    def stage(name, fn):
        print(f"\n---- {name} ----")
        try:
            st, note = fn()
        except SystemExit as e:
            st, note = "FAIL", str(e)
        except Exception as e:                     # noqa: BLE001
            st, note = "FAIL", f"{type(e).__name__}: {e}"
        results.append((name, st, note))
        print(f"  [{st}] {name}" + (f" -- {note}" if note else ""))

    def _env():
        try:
            mame_exe()
        except SystemExit as e:
            return ("SKIP", str(e))
        if not ROMDIR.exists():
            return ("SKIP", f"{ROMDIR} missing -- `assets.py extract`")
        return ("PASS", "")

    stage("environment", _env)
    if results[-1][1] == "SKIP":
        print("\nSKIPPED EVERYTHING: no emulator or no extracted ROMs.")
        print(f"VERDICT: SKIP (1 stage skipped)")
        return 0

    def sub(*cmd):
        rc = sp.run([sys.executable, *[str(c) for c in cmd]]).returncode
        return ("PASS" if rc == 0 else "FAIL", f"exit {rc}")

    quick = "--quick" in argv
    # SEE THE RUNNER RED.  `--break-decoder <mutation>` feeds the plain gfx
    # stage a broken decoder, so the whole runner must report FAILURES. A
    # runner that has only ever printed ALL GREEN is not a runner
    # (docs/knowledge/03).
    brk = None
    for i, x in enumerate(argv):
        if x == "--break-decoder" and i + 1 < len(argv):
            brk = argv[i + 1]
    if brk:
        print(f"!! --break-decoder {brk}: the gfx gate stage MUST go red.")
    stage("assets/integrity", lambda: sub(TOOLS / "assets.py", "check"))
    for m in ("overlap", "tx-msb", "bg-planes", "rom-byte"):
        stage(f"assets/integrity RED [{m}]",
              lambda m=m: sub(TOOLS / "assets.py", "check", "--mutate", m))
    if brk:
        stage(f"gfx gate [DELIBERATELY BROKEN: {brk}]",
              lambda: sub(TOOLS / "gfxgate.py", "--rom", ROMDIR,
                          "--dump", RIP / "gfx-gate",
                          "--min-pairs", GFX_MIN_PAIRS, "--mutate", brk))
    else:
        stage("gfx gate", lambda: sub(__file__, "gfx"))
    stage("gfx gate RED (6 mutations)", lambda: sub(__file__, "gfx", "--mutate", "all"))
    # WAVE 4.  The port unit tests first (seconds, no emulator), then the
    # frame-exact comparison, then the four mutations that must go RED, then the
    # replay-determinism property.  Every one of them is a FAIL, never a skip,
    # if it cannot run -- the ROM tables are regenerated by `export-tables.py`
    # and their absence means the tree is not set up, not that the check passed.
    node = shutil.which("node")

    def _node(*a):
        if not node:
            return ("FAIL", "node not on PATH -- the port is JavaScript")
        rc = sp.run([node, *[str(x) for x in a]]).returncode
        return ("PASS" if rc == 0 else "FAIL", f"exit {rc}")

    stage("port unit tests", lambda: _node("--test", TOOLS.parent / "tests"))
    stage("player tables export", lambda: sub(TOOLS / "export-tables.py", "--verify"))
    # WAVE 13.  THE SCROLL PROGRAM, and it is here rather than under `if not
    # quick` because it needs NO EMULATOR RUN: it replays src/background.js
    # against TSVs already on disk (the wave-17 whole-stage corpus, the attract
    # demo at entry clock $0038, and the two wave-10 runs).  Cheapest gate in
    # the runner and it covers 14,443 logic frames.
    SCROLLGATE = TOOLS / "scrollportgate.mjs"
    W17TSV = OUT / "w17-stage1-invuln-p2.tsv"
    ATTRACT = OUT / "bg-attract.tsv"

    def _scroll(*a):
        if not W17TSV.exists():
            # A SKIP IS NOT A PASS.  The corpus is ROM-derived and gitignored,
            # so a fresh clone has to make it -- that is environmental and is
            # reported as a SKIP with the command that fixes it, never as green.
            return ("SKIP", f"{W17TSV.name} missing -- "
                            "`python tools/oracle/w17run.py 16000 "
                            "w17-stage1-invuln-p2` (~6.5 min)")
        return _node(SCROLLGATE, *a)

    stage("scroll program: the port vs the whole of stage 1 (10,431 frames)",
          lambda: _scroll(W17TSV))
    stage("scroll program RED (9 mutations)",
          lambda: _scroll(W17TSV, "--break", "all"))
    stage("scroll program: the ATTRACT entry clock $0038 (1,364 frames)",
          lambda: (("SKIP", f"{ATTRACT.name} missing") if not ATTRACT.exists()
                   else _node(SCROLLGATE, ATTRACT, "--entry", "0x38",
                              "--k", "2636")))
    stage("scroll program RED [no-fast-forward] on the attract entry",
          lambda: (("SKIP", f"{ATTRACT.name} missing") if not ATTRACT.exists()
                   else _node(SCROLLGATE, ATTRACT, "--entry", "0x38",
                              "--k", "2636", "--break", "no-fast-forward")))
    # WAVE 20.  THE TURRET GATE -- the aim pair and the turret block against the
    # board, angle for angle, per frame.  Like the scroll gate it needs NO
    # emulator run: it replays the port against a TSV already on disk.  TWO
    # corpora, and they are different KINDS of evidence (20-OWNER-scenarios-must-
    # play.md): the PLAYING one is on-distribution (the ship fires, kills, bombs
    # and dies) and the INVULNERABLE one is coverage-only.
    TURRETGATE = TOOLS.parent / "tools" / "w20turretgate.mjs"
    for tag, why in (("w20-turret-play", "PLAYING, on-distribution"),
                     ("w20-turret-invuln", "INVULNERABLE, coverage only")):
        tsv = OUT / f"{tag}.tsv"
        stage(f"turret angle vs the board [{why}]",
              lambda tsv=tsv, tag=tag: (
                  ("SKIP", f"{tsv.name} missing -- `python tools/oracle/w20run.py"
                           f" 6000 {tag}`")
                  if not tsv.exists() else _node(TURRETGATE, "--corpus", tsv)))
    stage("turret gate RED (8 mutations)",
          lambda: (("SKIP", "w20-turret-play.tsv missing")
                   if not (OUT / "w20-turret-play.tsv").exists()
                   else _node(TURRETGATE, "--corpus", OUT / "w20-turret-play.tsv",
                              "--break", "all")))
    # WAVE 21.  THE PATTERN GATE -- the two bullet spawn cores, the 19 generator
    # entry points and the 39 kind templates against the board, SPAWN FOR SPAWN
    # AND WRITE FOR WRITE.  Three corpora and they are three different claims:
    # `play` is on-distribution; `fanplay` has $813098 POKED, which is the only
    # way any multi-bullet arm has ever run; `faninvuln` is poked AND
    # invulnerable and is coverage-only.
    PATTERNGATE = TOOLS.parent / "tools" / "w21patterngate.mjs"
    for tag, why in (("w21-bullets-play", "PLAYING, on-distribution"),
                     ("w21-bullets-fanplay", "PLAYING, $813098 POKED"),
                     ("w21-bullets-faninvuln", "INVULNERABLE + POKED, coverage")):
        tsv = OUT / f"{tag}.tsv"
        stage(f"bullet spawns vs the board [{why}]",
              lambda tsv=tsv, tag=tag: (
                  ("SKIP", f"{tsv.name} missing -- `python tools/oracle/w21run.py"
                           f" 6000 {tag}`")
                  if not tsv.exists() else _node(PATTERNGATE, "--corpus", tsv)))
    # ...and the mutation MATRIX. A mutation can be legitimately invisible on one
    # corpus -- `no-global-bias` cannot fail on a run where both globals read 0 --
    # so the requirement is that each of the eleven is RED in AT LEAST ONE, and
    # the grid is printed so a reader sees which corpus caught what.
    _w21 = [OUT / f"{t}.tsv" for t in ("w21-bullets-play", "w21-bullets-fanplay",
                                       "w21-bullets-faninvuln")]
    stage("pattern gate RED (11 mutations x 3 corpora)",
          lambda: (("SKIP", "no w21-bullets-*.tsv")
                   if not any(p.exists() for p in _w21)
                   else _node(PATTERNGATE, "--matrix",
                              ",".join(str(p) for p in _w21 if p.exists()))))
    # WAVE 26.  THE BULLET MOVER GATE -- the per-frame pool drive `$281DDE` vs
    # the board, BEFORE-vs-AFTER the mover (isolating it from the spawn side).
    # Like the other replay gates it needs NO emulator run.
    MOVERGATE = TOOLS.parent / "tools" / "w26movergate.mjs"
    W26TSV = OUT / "w26-mover-stage1.tsv"
    stage("bullet mover: per-frame pool drive vs the board",
          lambda: (("SKIP", f"{W26TSV.name} missing -- `python tools/oracle/"
                            f"w26run.py 6000 w26-mover-stage1`")
                   if not W26TSV.exists()
                   else _node(MOVERGATE, "--corpus", W26TSV)))
    stage("bullet mover RED (3 mutations)",
          lambda: (("SKIP", f"{W26TSV.name} missing")
                   if not W26TSV.exists()
                   else _node(MOVERGATE, "--corpus", W26TSV, "--break", "all")))
    # WAVE 22.  THE SPAWN GATE -- the enemy spawn walker `$2633BE` against the
    # board, frame for frame, over a whole-stage corpus comparable to wave 17.
    # Like the scroll/turret/pattern gates it replays the port against a TSV
    # already on disk and needs NO emulator run.  The cursor ($8132CC) is
    # compared at 0 divergent over the stage-1 window (reset at lf 12360, the
    # same boundary W17 measured), and the spawn counter reaches the script
    # terminator (339 records) on both sides.
    SPAWNGATE = TOOLS.parent / "tools" / "w22spawngate.mjs"
    W22TSV = OUT / "w22-spawn-stage1.tsv"
    stage("spawn walker: cursor + spawn counter vs the whole of stage 1",
          lambda: (("SKIP", f"{W22TSV.name} missing -- `python tools/oracle/"
                             f"w22run.py 16000 w22-spawn-stage1` (~6.5 min)")
                   if not W22TSV.exists() else _node(SPAWNGATE, W22TSV)))
    stage("spawn walker RED (clock-per-frame + 3 mutations)",
          lambda: (("SKIP", f"{W22TSV.name} missing")
                   if not W22TSV.exists() else _node(SPAWNGATE, W22TSV, "--break", "all")))
    # WAVE 23 -- enemy stats as data.  The 21 init bodies' spawn-time hitbox/
    # HP/palette/HP-reload vs the board over the whole stage, plus the plan's
    # required RED (swap two types' tables -> fields diverge).  Speed/heading
    # and the aim->bucket fields are W24-pending (the movement reader $263808).
    STATSGATE = TOOLS.parent / "tools" / "w23statsgate.mjs"
    W23TSV = OUT / "w23-stats-stage1.tsv"
    stage("enemy stats: hitbox/HP/palette/HP-reload at spawn (W23)",
          lambda: (("SKIP", f"{W23TSV.name} missing -- `python tools/oracle/"
                             f"w23run.py 16000 w23-stats-stage1` (~6.5 min)")
                   if not W23TSV.exists() else _node(STATSGATE, W23TSV)))
    stage("enemy stats RED (swap-tables + corrupt-hp + seed-wrong-stage)",
          lambda: (("SKIP", f"{W23TSV.name} missing")
                   if not W23TSV.exists() else _node(STATSGATE, W23TSV, "--break", "all")))
    # WAVE 57 (M1) -- **THE SCENARIO THAT KILLS THE MIDBOSS.**
    #
    # W31 shipped the midboss with "NO RUN IN THIS CORPUS KILLS THE MIDBOSS"
    # written in its own worklog. Twenty waves later W51 gave the beam the
    # ability to kill, and the first player who held fire on the live page hit
    # `UNPORTED $26C1C4` and the game stopped (W56, reproduced three times on
    # the deployed URL). **The window and the two routines W57 ported are 28
    # instructions; the reason the defect survived 25 waves behind a green gate
    # is that nothing in the gate ever killed him.** So the scenario is a stage,
    # not a number in a worklog.
    #
    # It needs NO EMULATOR RUN: it drives the SHIPPED BUNDLE (the same seed and
    # tables the published page boots from) with fire held, and with fire
    # suppressed as a control. `--break no-kill` runs the kill window with fire
    # suppressed, which must turn every assertion about the death, the type-$1C
    # object and the early release RED -- the proof that the stage measures the
    # kill and not the clock.
    MIDBOSSGATE = TOOLS.parent / "tools" / "midbossgate.mjs"
    stage("midboss DEATH: the scroll release, type $1C and its 207 map longwords",
          lambda: _node(MIDBOSSGATE))
    stage("midboss DEATH RED [no-kill]",
          lambda: (("PASS", "went red without the kill, as it must")
                   if _node(MIDBOSSGATE, "--break", "no-kill")[0] == "FAIL"
                   else ("FAIL", "the scenario is GREEN with the midboss alive "
                                 "-- it is not measuring the kill")))
    # ==================== WAVE 62 (S1) -- STAGE 1 ENDS ======================
    # The owner's binding directive (docs/worklog/ddpdoj/39) is that stage 1 be
    # FEATURE COMPLETE and ORACLE-CLEAN, and a stage that never finishes is not
    # complete. Before W62 the port STOPPED at `UNPORTED $292902` on logic frame
    # 7,870 -- on the deployed page, with fire held (W57 SS7.3) -- and every
    # stage in this gate was green over a game that could not reach its own end.
    #
    # This stage drives the SHIPPED BUNDLE for 21,000 frames and asserts, as
    # EXACT FRAMES, the whole chain: the boss's 10,800-frame timeout expiring,
    # D-script 6's seven states, `$2595E8`, `$242952` running ONCE, the
    # background object being DESTROYED and a DIFFERENT one built, and
    # `$813092` going 0 -> 1 with the distance clock back at zero.
    #
    # `--break no-timeout` re-floors `$22(a5)` every frame so the timeout can
    # never expire; 15 of its 24 assertions must go RED, which is the proof
    # that the stage measures the ENDING and not the clock.
    STAGEENDGATE = TOOLS.parent / "tools" / "w62stageendgate.mjs"
    stage("STAGE 1 ENDS: the boss timeout, $242952, and the rebuild",
          lambda: _node(STAGEENDGATE))
    stage("STAGE 1 ENDS RED [no-timeout]",
          lambda: (("PASS", "went red without the timeout, as it must")
                   if _node(STAGEENDGATE, "--break", "no-timeout")[0] == "FAIL"
                   else ("FAIL", "the scenario is GREEN with the boss immortal "
                                 "-- it is not measuring the stage ending")))
    # =============== WAVE 63 (B1) -- THE CHAIN EXPIRES ======================
    # `src/score.js` said for twenty-nine waves that "with no decrement a chain
    # the port starts never expires", because `$240F62[0] = $28D520` -- the
    # object holding `$2842B0` (the pending -> total DRAIN) and `$284636` /
    # `$2847D4` (the two CHAIN METER DECREMENTS) -- was a counted dispatch miss
    # on every frame of every run. W63 ports it, in the cartridge's own slot.
    #
    # THREE controls, because one cannot separate three claims:
    #   no-hud        object type 0 is not dispatched, i.e. HEAD -- 18 of 27 red
    #   frozen-meter  `$81B5C0` restored after every step -- 4 red, all chain
    #   rank-poke     +1 into each of the four rank words -- all 5 RANK rows red
    HUDGATE = TOOLS.parent / "tools" / "w63hudgate.mjs"
    stage("THE CHAIN EXPIRES: object type 0, the drain and $284636",
          lambda: _node(HUDGATE))
    for _m, _why in (("no-hud", "without object type 0 (i.e. HEAD)"),
                     ("frozen-meter", "with the chain meter frozen"),
                     ("rank-poke", "with a rank word poked")):
        stage(f"THE CHAIN EXPIRES RED [{_m}]",
              lambda m=_m, w=_why: (("PASS", f"went red {w}, as it must")
                                    if _node(HUDGATE, "--break", m)[0] == "FAIL"
                                    else ("FAIL", f"the scenario is GREEN {w} "
                                                  "-- it is not measuring this")))
    # ==================== WAVE 64 (B2) -- THE BOMB =========================
    # `39-OWNER-visible-play-before-sound.md`'s test of done is "load the page,
    # fly, shoot, laser, BOMB, and kill a visible enemy". No gate this project
    # owns had ever pressed Button 2: `src/player.js` threw on it, for BOTH
    # arms of `$249814`, from wave 4 to wave 63. W64 ports the bomb arm --
    # `$2498E2`, type-5 call #7 `$255DD8`, the ninth block of `$244D62`
    # (`$24560A`) and the teardown `$2564F0` that resets the chain and drains
    # the 45-record pool.
    #
    # FOUR controls, and see the gate's own header for what each one reddens:
    #   no-driver     call #7 counted and not run, i.e. HEAD -- 11 red
    #   no-press      Button 2 never pressed -- 12 red
    #   rank-poke     +1 into each of the FIVE rank words -- all 5 RANK rows
    #   frozen-stock  `($24,A6)` restored every step -- 9 red
    BOMBGATE = TOOLS.parent / "tools" / "w64bombgate.mjs"
    stage("THE BOMB: $2498E2, $255DD8, $24560A and $2564F0",
          lambda: _node(BOMBGATE))
    for _m, _why in (("no-driver", "without type-5 call #7 (i.e. HEAD)"),
                     ("no-press", "with Button 2 never pressed"),
                     ("rank-poke", "with a rank word poked"),
                     ("frozen-stock", "with the bomb stock frozen")):
        stage(f"THE BOMB RED [{_m}]",
              lambda m=_m, w=_why: (("PASS", f"went red {w}, as it must")
                                    if _node(BOMBGATE, "--break", m)[0] == "FAIL"
                                    else ("FAIL", f"the scenario is GREEN {w} "
                                                  "-- it is not measuring this")))
    # WAVE 65 (B3).  **THE LASER BOMB** -- bombing while HOLDING the beam, which
    # W64 left throwing at `$249A80` rather than inventing.  It is a different
    # weapon and W64's gate cannot reach it: that gate taps fire on purpose,
    # and holding it is the whole precondition here.  `$255FE2` (the
    # four-record 131-frame machine), `$2456A6` (the box against pool B, pool A
    # and the bullets), and the THREE paths `$249A92 bset #$7,($1,A6)` made
    # reachable for the first time in this port -- `$24D188`, `$24A4E2`,
    # `$2496A2`.
    #
    # FOUR controls; see the gate's own header:
    #   no-press    Button 2 never pressed -- 12 red
    #   rank-poke   +1 into each of the FIVE rank words -- 5 red, ALL RANK
    #   tap-fire    W64's own input: the ORDINARY bomb runs instead -- 11 red
    #   no-driver   type-5 call #7 counted and not run -- 7 red
    BEAMGATE = TOOLS.parent / "tools" / "w65beamgate.mjs"
    stage("THE LASER BOMB: $249A80, $255FE2 and $2456A6",
          lambda: _node(BEAMGATE))
    for _m, _why in (("no-press", "with Button 2 never pressed"),
                     ("rank-poke", "with a rank word poked"),
                     ("tap-fire", "with fire TAPPED (the ORDINARY bomb)"),
                     ("no-driver", "without type-5 call #7")):
        stage(f"THE LASER BOMB RED [{_m}]",
              lambda m=_m, w=_why: (("PASS", f"went red {w}, as it must")
                                    if _node(BEAMGATE, "--break", m)[0] == "FAIL"
                                    else ("FAIL", f"the scenario is GREEN {w} "
                                                  "-- it is not measuring this")))
    if not quick:
        stage("fly-around: port vs board, 0 divergent frames",
              lambda: sub(__file__, "flyaround"))
        for m in ("clamp-first", "edge-after-store", "no-tilt-decay",
                  "dy-off-by-one", "no-phase-mask"):
            stage(f"fly-around RED [{m}]",
                  lambda m=m: sub(__file__, "flyaround", "--reuse", "--break", m))
        # WAVE 11.  THE DISPLAY-LIST KEYSTONE, and its two FORCED scenarios --
        # the cap policy is gameplay and the natural corpus reaches 120 of 251
        # records, so `dlgate` alone would leave the drop policy, the equality
        # cap and the terminator decision untested. The mutation sweep runs over
        # the union of the three and is the thing that proves the gate can fail.
        stage("display list: the staged-bytes replay gate (1,901 frames)",
              lambda: sub(__file__, "dlgate"))
        stage("display list: FORCED runtime cap (251 records)",
              lambda: sub(__file__, "dlgate", "--cap"))
        stage("display list: FORCED pre-emptive drop",
              lambda: sub(__file__, "dlgate", "--cap0"))
        stage("display list RED (12 mutations over 3 scenarios)",
              lambda: sub(__file__, "dlgate", "--reuse", "--break", "all"))
        stage("replay determinism (2 in-process + 1 subprocess)",
              lambda: _node(TOOLS / "determinism.mjs",
                            OUT / "w4" / "fly-around.tsv",
                            OUT / "w4" / "fly-around.seed2000.bin",
                            "--seed-lf", 2000, "--poke", "810424=FF"))
        stage("zoom coverage (+ RED)", lambda: sub(__file__, "zoomcov"))
        # WAVE 6.  The PYTHON decoder being bit-exact says nothing about the JS
        # the browser runs, so the port's renderer has its own gate over its own
        # corpus (a dense stretch, a palette fade, a >=90-sprite frame, and the
        # priority rule driven by intervention because no natural frame uses it).
        stage("pixel gate: the port's JS renderer vs MAME",
              lambda: sub(__file__, "pixslice"))
        stage("pixel gate RED (9 mutations)",
              lambda: sub(__file__, "pixslice", "--reuse", "--mutate", "all"))
        # And the demo path end to end: the PORT's player state -> pixels.
        stage("demo capture + ship identification (+ splice round-trip)",
              lambda: sub(__file__, "pixdemo"))
        stage("demo gate: the port drives the ship, pixel-exact",
              lambda: sub(__file__, "demogate"))
        # WAVE 13 added `bg-frozen-camera`: the demo gate's picture now comes
        # from the PORT's background as well as the port's ship, and a 100 %
        # pixel match means nothing without a switch that can wreck it.
        for m in ("off-by-one", "frozen-player", "no-input", "bg-frozen-camera"):
            stage(f"demo gate RED [{m}]",
                  lambda m=m: sub(__file__, "demogate", "--break", m))
        # WAVE 15.  The shard gate: the PUBLISHED bundle's BG tiles (not the
        # ROM) drawn past px 160, pixel-exact against MAME.  Closes
        # capture-ledger L7.  Self-contained -- it fresh-exports first.
        stage("background shard gate: published tiles past px 160 (+ RED)",
              lambda: sub(__file__, "shardgate"))
        stage("determinism gate", lambda: sub(__file__, "gate"))

    nf = sum(1 for _, s, _ in results if s == "FAIL")
    ns = sum(1 for _, s, _ in results if s == "SKIP")
    print("\n" + "=" * 60)
    for n, s, note in results:
        print(f"  [{s}] {n}" + (f" -- {note}" if note else ""))
    print(f"VERDICT: {'ALL GREEN' if nf == 0 else 'FAILURES'} "
          f"-- {len(results) - nf - ns} passed, {nf} failed, {ns} SKIPPED")
    return 1 if nf else 0


def _cmd_seedstate(argv: list[str]) -> int:
    """Wave-1 open item 5(b): take the savestate AT THE GAME'S OWN SAMPLE POINT
    rather than at a video-frame boundary, and see whether $80FA84 -- the IRQ4
    phase counter that was the single live byte a wave-0 resume got wrong --
    now agrees.  The resumed run is aligned on the game's own frame counter
    $80390A, never on the video frame."""
    at = int(argv[0]) if argv else 2000
    n = int(argv[1]) if len(argv) > 1 else 120
    defs = scenarios()
    pre = defs["bootPrefix"]["versionB"]
    st = OUT / "seed.state"
    base = OUT / "seedstate.base.tsv"
    r = trace(base, frames=at + n, buttons=pre, meter=False,
              extra_env={"PROBE_SAVEAT": f"{at}:{st}"})
    check(r, "seedstate/base")
    for l in r.find("SAVED_AT_SAMPLEPOINT"):
        print("  " + l)
    res = OUT / "seedstate.resume.tsv"
    r2 = trace(res, frames=n, buttons="", meter=False,
               extra_env={"PROBE_LOAD": str(st)})
    check(r2, "seedstate/resume", quiet=True)

    def rows(p: Path):
        ls = p.read_text().splitlines()
        cols = {c: i for i, c in enumerate(ls[0].split("	"))}
        return cols, [l.split("	") for l in ls[1:]]

    ca, ra = rows(base)
    cb, rb = rows(res)
    by = {row[ca["c390a"]]: row for row in ra}
    compared, diffs = 0, {}
    for row in rb:
        a = by.get(row[cb["c390a"]])
        if a is None:
            continue
        compared += 1
        for name in ("d_spr", "d_ram", "d_top", "d_pal", "d_spb", "d_bg",
                     "d_tx", "sprites", "irq4ph", "c390e", "p1raw"):
            if a[ca[name]] != row[cb[name]]:
                diffs.setdefault(name, []).append(row[cb["c390a"]])
    print(f"  aligned on $80390A: {compared} frames compared")
    if not diffs:
        print("IDENTICAL -- including $80FA84 (irq4ph)")
        return 0
    for k, v in diffs.items():
        print(f"  {k}: differs on {len(v)}/{compared} frames "
              f"(first at $80390A={v[0]})")
    return 1


def _cmd_rtc(argv: list[str]) -> int:
    """Wave-1 open item 5(a).  The board carries a V3021 RTC that MAME feeds
    from the HOST clock.  Two questions: does the 68k ever read it during a
    scenario, and does the gate survive a system-clock date change?  Only the
    first is answerable without touching the machine clock; the second needs
    PGM_FAKE_DATE, which the caller sets by actually changing the clock."""
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == defs["gate"])
    r, tsv = run_scenario(defs, s, out=OUT, tag=".rtc",
                          extra_env={"PROBE_RTC": "1"})
    check(r, "rtc")
    census(r)
    print("\n$C00006 is the V3021 calendar (pgm.cpp maps c00002/4/c to the sound\n"
          "latches, c00008/a to Z80 reset+control); build B reaches it through\n"
          "`lea $C00006,A0` at $23C53A. A count of zero would have been a\n"
          "PRESENCE measurement returning nothing and would NOT have proved the\n"
          "game never reads it.")

    # THE DATE CHANGE.  MAME seeds its RTC from the HOST clock at machine start,
    # and we cannot move the system clock from here.  TZ moves the LOCAL date
    # instead: +14 and -12 are 26 hours apart, so the two runs are guaranteed to
    # be on different calendar DAYS (and usually different months at a boundary).
    # This is weaker than a real date change -- it does not exercise a year
    # rollover, and it only works if MAME's CRT honours TZ -- so the run prints
    # the RTC bytes the game actually read, and a difference there is the proof
    # that the two runs really did see different dates.
    print("\n=== determinism across a DATE change (TZ +14 vs -12 = 26 h apart) ===")
    digs = {}
    for tz in ("XXX-14", "XXX+12"):
        rr, tt = run_scenario(defs, s, out=OUT, tag=f".tz{tz}",
                              extra_env={"TZ": tz, "PROBE_RTC": "1"})
        for l in rr.find("CENSUS rtc_first_bytes"):
            print("    " + l)
        check(rr, f"rtc/{tz}", quiet=True)
        digs[tz] = (hashlib.sha256(tt.read_bytes()).hexdigest(), tt)
        print(f"  TZ={tz:7s} {digs[tz][0]}")
    ks = list(digs)
    same = digs[ks[0]][0] == digs[ks[1]][0]
    print("IDENTICAL across the date change" if same else "DIVERGED across the date change")
    if not same:
        for m in first_divergence(digs[ks[0]][1], digs[ks[1]][1]):
            print("  " + m)
    return 0


def _cmd_drc(argv: list[str]) -> int:
    """Wave-1 open item 5(e).  -drc vs -nodrc, same scenario, diff."""
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == defs["gate"])
    res = {}
    for flag in ("-drc", "-nodrc"):
        r, tsv = run_scenario(defs, s, out=OUT, tag=f".{flag[1:]}", extra=[flag])
        check(r, flag, quiet=True)
        res[flag] = (hashlib.sha256(tsv.read_bytes()).hexdigest(), tsv)
        print(f"  {flag:7s} {res[flag][0]}")
    a, b = res["-drc"][0], res["-nodrc"][0]
    print("IDENTICAL" if a == b else "DIFFERENT")
    if a != b:
        for m in first_divergence(res["-drc"][1], res["-nodrc"][1]):
            print("  " + m)
    return 0


def _cmd_objdriver(argv: list[str]) -> int:
    """WAVE 2 ITEM 1 -- the top-level object driver, as derived and as measured.

    Located by measurement, not by guessing: `phase.lua` timed the seven
    main-loop calls and attributed every main-RAM write to the call it happened
    in.  ALL the object work is in call #2 and the sprite-list build in call #4.
    """
    d = landmarks()
    for bn in ("A", "B"):
        b = d["builds"][bn]
        tag = "MASTER (chooser default)" if bn == "A" else "BLACK VER -- THE TARGET"
        print(f"\n=== build {bn}: {tag} ===")
        print(f"  driver          ${b['objDriver']:06X}   "
              f"(main-loop call #2, ${b['calls'][2]:06X}, whose only caller is "
              f"the loop head)")
        print(f"  table           ${b['objTable']:06X}..${b['objTable'] + b['objSlots'] * b['objStride'] - 1:06X}"
              f"   {b['objSlots']} slots x ${b['objStride']:X} bytes")
        print(f"  per-slot hook   ${b['objSlotHook']:06X}  move.l A5,-(A7) "
              f"(a WRITE -> a real 68000 execution hook)")
        print(f"  dispatch        ${b['objDispatchCall']:06X} jsr (A0), table "
              f"${b['objDispatchTable']:06X}, {b['objDispatchEntries']} entries")
        print(f"  allocator       ${b['objAlloc']:06X}   pending-create queue "
              f"${b['objPendCreateSP']:06X}, cap ${b['objAllocCapBytes']:X} = "
              f"{b['objAllocCapBytes'] // b['objStride']} records")
        print(f"  ALLOC FAILS     ${b['objAllocFail']:06X} -> returns the dummy "
              f"record ${b['objAllocDummy']:06X} and D0=0: the spawn is SILENTLY "
              f"DROPPED and nothing is evicted")
        print(f"  pending-kill SP ${b['objPendKillSP']:06X}")
    print("\nNO BUDGET TEST EXISTS IN THAT LOOP -- `moveq #$13,D0 / ... / dbra`, "
          "\nunconditional, 20 slots every frame.  That is the LISTING's answer "
          "to \nmechanism (C) at the top level; `pgm.py overrun` is the "
          "measurement.")
    n = int(argv[0]) if argv else 2600
    r, tsv = run_scenario(scenarios(),
                          next(x for x in scenarios()["scenarios"]
                               if x["name"] == scenarios()["gate"]),
                          out=OUT, tag=".obj")
    check(r, "objdriver")
    for l in r.find("CENSUS object"):
        print("  " + l)
    print(f"  -> {tsv}")
    return 0


def _cmd_overrun(argv: list[str]) -> int:
    """WAVE 2 ITEM 2 -- FORCE AN OVERRUN AND CHARACTERISE IT.

    Nobody had ever reached one: wave 0's heaviest stage-1 frames ran to >90%
    utilisation and stopped, and wave 1's 2,600-frame gate completed its loop on
    every single frame.  Without an overrun, mechanism (C) is unmeasured, and
    docs/knowledge/06 says (C) cannot be retrofitted.

    THE TOOL.  MAME's `-speed` is a HOST throttle and leaves the emulated
    337,920 cycles/frame untouched -- it produces no in-game slowdown at all.
    The right tool would be a per-CPU clock scale; MEASURED, it is not reachable
    from MAME 0.288 (see frame.lua's ARTIFICIAL LOAD header for the four places
    I looked).  So the load is injected instead: a NOP SLED written into the
    decrypted :maincpu image past the end of the program ($340000, inside the
    68000's $000000-$3FFFFF ROM window), with one main-loop `jsr` operand
    repointed at it.  A nop pushes nothing, clobbers no register and sets no
    flag, so it changes WHEN the frame runs out of time and nothing about WHAT
    the game does about it.  4 cycles each against a 337,920-cycle frame.

    THE CONTROL comes first and it is not optional: with NOPS=0 the patched run
    must be BYTE-IDENTICAL to the unpatched one.  If it is not, every number the
    sweep produces is about the patch and not about the game.  (The first
    version of this used a counted delay loop with a register saved on the
    stack; its control failed on `d_ram`, and dumping all 128 KiB at the
    injection frame showed 18 differing bytes, all of them dead stack. That is
    why the sled exists and why the control is not decoration.)

    EVERY FIGURE HERE IS MAME-TIMED AND UNCALIBRATED.  Injected load answers
    MECHANISM.  It cannot answer how often or how much the real board slows.
    """
    defs = scenarios()
    name = "overrun"
    s = next((x for x in defs["scenarios"] if x["name"] == name), None)
    if s is None:
        raise SystemExit("scenarios.json has no 'overrun' scenario")
    out = OUT / "overrun"
    out.mkdir(parents=True, exist_ok=True)
    start = s.get("injectFrom", 1900)

    print("=== CONTROL: patch installed, ZERO iterations, vs no patch at all ===")
    a, ta = run_scenario(defs, dict(s, inject=None), out=out, tag=".ctl-nopatch")
    check(a, "overrun/control-nopatch")
    b, tb = run_scenario(defs, dict(s, inject=f"0:{start}"), out=out, tag=".ctl-zero")
    check(b, "overrun/control-zero", quiet=True)
    msgs = first_divergence(ta, tb)
    # WHAT THE CONTROL IS ALLOWED TO MOVE, and why exactly these four.
    #   cyc / work / spin  -- the sled adds 12 cycles (the `jmp`) even at zero
    #     nops.  Timing columns MUST move; if they did not, the patch was not
    #     reached at all and the sweep would be measuring nothing.
    #   d_top -- $81FE00-$81FFFF, dead stack.  A 12-cycle shift changes which
    #     instruction an interrupt lands on, so the PC the 68000 pushes in the
    #     exception frame differs, and after the RTE that is residue below SP.
    #     Diagnosed byte-for-byte: 18 bytes at $81FEE2..$81FF57, one of them
    #     $81FF37 = 904000 vs 25F1F6, and $0025F1F6 is a build-B code address.
    # ANY OTHER COLUMN MOVING means the patch changed the game, and then every
    # number in the sweep is about the patch.  d_ram in particular must not move.
    ALLOWED = {"cyc", "work", "spin", "d_top"}
    moved = {m.split(":")[0].replace("col ", "") for m in msgs}
    if moved - ALLOWED:
        print("CONTROL FAILED -- the inert patch changed GAME STATE, not just "
              f"timing: {sorted(moved - ALLOWED)}")
        for m in msgs:
            print("  " + m)
        return 1
    print(f"CONTROL OK -- at 0 nops only {sorted(moved) or 'nothing'} moved; "
          "every game-state digest (d_ram, d_spr, d_pal, d_spb, d_bg, d_tx) and "
          "every counter is identical")
    for m in msgs:
        print("  " + m)

    nops = [int(x) for x in argv] if argv else [10000, 25000, 50000, 75000, 100000]
    print(f"\n=== SWEEP: injected busy-wait before ${landmarks()['builds']['B']['calls'][2]:06X} "
          f"(the object driver), from logic frame {start} ===")
    for n in nops:
        r, tsv = run_scenario(defs, dict(s, inject=f"{n}:{start}"), out=out,
                              tag=f".i{n}")
        check(r, f"overrun/{n}", quiet=True)
        print(f"\n-- ITERS={n}  (~{n * 18} added 68000 cycles/frame, "
              f"budget 337,920)")
        for l in r.find("INJECT "):
            print("   " + l)
        for key in ("CENSUS logicframes", "CENSUS irq6_per_logicframe",
                    "CENSUS releases_per_logicframe", "CENSUS armed_vblanks",
                    "CENSUS spanned_gt1_videoframe", "CENSUS work_cycles",
                    "CENSUS object_slots_processed", "CENSUS object_slots_live",
                    "CENSUS max_sprite_entries"):
            for l in r.find(key):
                print("   " + l)
        _overrun_report(tsv, start)
        # DOES AN OVERRUN CHANGE WHAT THE GAME COMPUTES, OR ONLY WHEN?
        # The ISR6 (A) gate skips four subroutines on an overrun frame -- one of
        # them uploads the palette, one writes the BG scroll registers -- so the
        # answer should be "what", and this prints the evidence instead of
        # asserting it. Compared against the ZERO-nop control, not the unpatched
        # run, so the 12 `jmp` cycles are not what is being reported.
        state = ("d_ram", "d_spr", "d_pal", "d_spb", "d_bg", "d_tx", "sprites",
                 "objn", "objord", "objlive", "c390a", "c390e", "p1raw", "pix")
        msgs = [m for m in first_divergence(tb, tsv)
                if m.split(":")[0].replace("col ", "") in state]
        print("   STATE vs the 0-nop control: "
              + (f"{len(msgs)} of {len(state)} game-state columns diverge"
                 if msgs else "IDENTICAL -- the overrun changed only timing"))
        for m in msgs:
            print("     " + m)
    return 0


def _overrun_report(tsv: Path, start: int) -> None:
    """The four questions an overrun frame has to answer, read off the trace.

    1. did the logic frame span more than one video frame          (case B)
    2. did the IRQ6 (A) gate fire, skipping four ISR subroutines    (case A)
    3. did OBJECT SLOTS PROCESSED fall below the live-slot count    (case C)
    4. did the game's OWN counters fall behind the display -- $80390A advances
       per MAIN LOOP ITERATION, so if the body does not complete they do not
       advance, and everything driven by them slows WITH the game.
    """
    rows = [l.split("\t") for l in tsv.read_text().splitlines()]
    c = {n: i for i, n in enumerate(rows[0])}
    body = [r for r in rows[1:] if int(r[c["lf"]]) >= start + 5]
    if not body:
        print("   (no frames past the injection point)")
        return
    spanned = sum(1 for r in body if int(r[c["irq6"]]) > 1)
    # THE (A) GATE FIRES ONCE PER MISSED VBLANK, NOT ONCE PER FRAME WITH NO
    # RELEASE. A dilated logic frame sees N vblanks and exactly ONE release (the
    # IRQ6 that found the semaphore armed); the other N-1 take the gate at
    # $23C44C and skip $24133C/$240CC0/$240F26/$287286 and the release itself.
    # So the count is sum(irq6 - rel). `rel == 0` -- which is what wave 1's
    # `gated_zero_release` census counts -- is a much rarer case and would have
    # reported 0 gate firings on a run with 614 of them.
    gated = sum(int(r[c["irq6"]]) - int(r[c["rel"]]) for r in body)
    trunc = sum(1 for r in body if int(r[c["objn"]]) < int(r[c["objlive"]]))
    first, last = body[0], body[-1]
    dlf = int(last[c["lf"]]) - int(first[c["lf"]])
    dvf = int(last[c["vf"]]) - int(first[c["vf"]])
    d390a = (int(last[c["c390a"]]) - int(first[c["c390a"]])) & 0xFFFF
    print(f"   OVERRUN n={len(body)} frames after lf{start + 5}: "
          f"spanned>1_videoframe={spanned}  isr6_A_gate_firings={gated}  "
          f"objn<objlive={trunc}")
    print(f"   PACE  logic frames {dlf} over {dvf} video frames "
          f"= {dlf / max(dvf, 1):.4f} logic/video; "
          f"$80390A advanced {d390a} (= logic frames: "
          f"{'YES' if d390a == dlf else 'NO'})")



# --------------------------------------------------------------------------- wave 4
# THE WATCH SPEC LIVES IN THE PORT, NOT HERE.  `games/ddpdoj/src/state.js`
# defines the addresses and their column names; this reads them out of that file
# so the two sides of the comparison cannot drift apart silently.  A hand-copied
# duplicate here is exactly the kind of thing that stays right for two weeks.
def w4_watch() -> str:
    src = HERE.parent.parent / "src" / "state.js"
    body = src.read_text(encoding="utf8")
    body = body.split("WATCH_SPEC = [", 1)[1].split("];", 1)[0]
    out = []
    for m in re.finditer(r"\['(\w+)',\s*([^,\]]+?)(?:,\s*'(\w)')?\]", body):
        name, expr, sz = m.group(1), m.group(2).strip(), m.group(3)
        addr = eval(expr, {"__builtins__": {}}, _W4_SYMS)
        out.append(f"{name}={addr:X}" + (f":{sz}" if sz else ""))
    if not out:
        raise SystemExit("could not read WATCH_SPEC out of src/state.js")
    _w4_assert_syms()
    return ",".join(out)


def _w4_assert_syms() -> None:
    """The symbol table above is a COPY, and a copy that is never checked is a
    future divergence.  Re-read the real definitions out of src/machine.js and
    fail loudly if any of them moved."""
    txt = (HERE.parent.parent / "src" / "machine.js").read_text(encoding="utf8")
    for obj, names in (("RAM", ("player1", "p1Options", "frameCounterMod4",
                                "frameCounterMod8", "frameCounterMod16")),
                       ("P", ("posY", "posX", "velY", "velX", "tiltDelay", "tilt",
                              "speedIdx", "angle", "state", "flags1", "dirByte",
                              "btnByte", "animA",
                              # WAVE 12: `animB` is gone.  It was never an
                              # animation -- it is the ship's X half-extents from
                              # $2553F2 -- and this assertion is exactly the
                              # thing that must notice a rename.
                              "hitYPlus", "hitYMinus", "hitXPlus", "hitXMinus",
                              "auraPhase", "glowPhase")),
                       # WAVE 12.5: `flags1` is the OPTION block's `$8104AB`,
                       # whose bits 3/4 are the $24C476 fire handshake.
                       ("OPT", ("posY", "posX", "posY2", "raw", "edge",
                                "animDelay", "animIdx", "anim", "flags1"))):
        for n in names:
            m = re.search(rf"\b{n}:\s*(0x[0-9a-fA-F]+)", txt)
            if not m:
                raise SystemExit(f"src/machine.js no longer defines {obj}.{n}")
            want, got = int(m.group(1), 16), getattr(_W4_SYMS[obj], n)
            if want != got:
                raise SystemExit(f"{obj}.{n}: src/machine.js says ${want:X}, "
                                 f"pgm.py's copy says ${got:X}")


# The symbols src/state.js's WATCH_SPEC is written in, mirrored from
# src/machine.js.  Asserted below rather than trusted.
_W4_SYMS = {
    "RAM": type("R", (), {"player1": 0x8103E6, "p1Options": 0x8104AA,
                          "frameCounterMod4": 0x803910,
                          "frameCounterMod8": 0x803912,
                          "frameCounterMod16": 0x803914})(),
    "P": type("P", (), {"posY": 0x02, "posX": 0x04, "velY": 0x30, "velX": 0x32,
                        "tiltDelay": 0x4C, "tilt": 0x4E, "speedIdx": 0x1A,
                        "angle": 0x1B, "state": 0x00, "flags1": 0x01,
                        "dirByte": 0x18, "btnByte": 0x19,
                        "animA": 0x0A,
                        # WAVE 12 -- the ship's four hitbox half-extents.
                        # $8103F6/$8103F8 (Y) and $8103FA/$8103FC (X, tilt-
                        # indexed from $2553F2).  What wave 4 called `animB`
                        # is `hitXPlus`.
                        "hitYPlus": 0x10, "hitYMinus": 0x12,
                        "hitXPlus": 0x14, "hitXMinus": 0x16,
                        "auraPhase": 0x28, "glowPhase": 0x48})(),
    # WAVE 12 -- the OPTION BLOCK, $64 bytes at $8104AA (machine.js `OPT`).
    "OPT": type("O", (), {"posY": 0x02, "posX": 0x04, "posY2": 0x22,
                          "raw": 0x40, "edge": 0x41, "animDelay": 0x42,
                          "animIdx": 0x44, "anim": 0x0A, "flags1": 0x01})(),
}


def _state_js() -> str:
    return (HERE.parent.parent / "src" / "state.js").read_text(encoding="utf8")


def w8_rawdump() -> str:
    """PROBE_RAWDUMP, read OUT OF src/state.js's RAWDUMP_SPEC -- same rule as
    w4_watch(): the two sides of the comparison cannot be allowed to drift."""
    body = _state_js().split("RAWDUMP_SPEC = [", 1)[1].split("];", 1)[0]
    out = []
    for m in re.finditer(r"\['(\w+)',\s*(0x[0-9a-fA-F]+),\s*([^,\]]+?)\]", body):
        n = eval(m.group(3), {"__builtins__": {}}, {})
        out.append(f"{m.group(1)}={int(m.group(2), 16):X}:{n:X}")
    if not out:
        raise SystemExit("could not read RAWDUMP_SPEC out of src/state.js")
    return ",".join(out)


def w8_exec() -> str:
    body = _state_js().split("EXEC_SPEC = [", 1)[1].split("];", 1)[0]
    out = []
    for m in re.finditer(
            r"\['(\w+)',\s*(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+)\]",
            body):
        out.append(f"{m.group(1)}={int(m.group(2), 16):X}:"
                   f"{int(m.group(3), 16):X}:{int(m.group(4), 16):X}")
    if not out:
        raise SystemExit("could not read EXEC_SPEC out of src/state.js")
    return ",".join(out)


def _cmd_shotgate(argv: list[str]) -> int:
    """WAVE 8.  THE SHOT GATE: the `stage1-shot` scenario with the shot
    subsystem's columns -- the ten shot records the player's own spawn can
    reach, the sprite-request bucket, the RNG word, the live-shot count, and
    the per-frame execution count of $245044 (the shot-vs-enemy damage
    routine).  --break NAME runs a mutation and MUST go red."""
    defs = scenarios()
    name = argv[0] if argv and not argv[0].startswith("--") else "stage1-shot"
    s = next(x for x in defs["scenarios"] if x["name"] == name)
    brk = argv[argv.index("--break") + 1] if "--break" in argv else None
    out = OUT / "w8"
    out.mkdir(parents=True, exist_ok=True)
    seed_lf = s.get("seed", 2000)
    seed_bin = out / f"{name}.seed{seed_lf}.bin"
    tsv = out / f"{name}.tsv"
    if "--reuse" not in argv or not (tsv.exists() and seed_bin.exists()):
        r = trace(tsv, frames=s["frames"], buttons=build_script(defs, s),
                  build=s.get("build", "B"), meter=s.get("meter", True),
                  snap=s.get("snap", ""),
                  extra_env={"PROBE_PORTIN": "1", "PROBE_WATCH": w4_watch(),
                             "PROBE_RAWDUMP": w8_rawdump(),
                             "PROBE_EXEC": w8_exec(),
                             "PROBE_POKE": s.get("poke", ""),
                             "PROBE_POKE_FROM": str(s.get("pokeFrom", 0)),
                             "PROBE_RAMDUMP": f"{seed_lf}:{seed_bin}"})
        check(r, name)
        census(r)
        for l in r.find("RAMDUMP"):
            print("  " + l)
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port is JavaScript")
    cmd = [node, str(HERE.parent.parent / "tools" / "portdiff.mjs"),
           str(tsv), str(seed_bin), "--seed-lf", str(seed_lf),
           "--tables", str(HERE.parent.parent / "rip" / "port" / "player.tables.json")]
    if s.get("poke"):
        cmd += ["--poke", s["poke"]]
    if brk:
        cmd += ["--break", brk]
    print("\n$ " + " ".join(cmd[1:]))
    res = subprocess.run(cmd, text=True)
    if brk:
        # EXPECTED-GREEN mutations are declared in tools/breakage.mjs BEFORE the
        # run, with the reason.  Reading the declaration out of that file rather
        # than duplicating it here is the two-sides rule w4_watch() follows.
        body = (HERE.parent.parent / "tools" / "breakage.mjs").read_text(encoding="utf8")
        blk = body.split("EXPECTED_GREEN = {", 1)[-1].split("};", 1)[0]
        if f"'{brk}':" in blk:
            if res.returncode != 0:
                print(f"FAIL mutation '{brk}' is declared EXPECTED-GREEN in "
                      f"tools/breakage.mjs and went RED -- one of the two is wrong")
                return 1
            print(f"EXPECTED-GREEN OK: '{brk}' left the RESULT line green, as "
                  f"tools/breakage.mjs declares it must; the REPORTED line above "
                  f"is where it had to move")
            return 0
        if res.returncode == 0:
            print(f"FAIL mutation '{brk}' did NOT diverge -- the comparison "
                  f"cannot see it")
            return 1
        print(f"RED OK: mutation '{brk}' diverged, as it must")
        return 0
    return res.returncode


# --------------------------------------------------------------------------- wave 5
def _cmd_spritecap(argv: list[str]) -> int:
    r"""WAVE 5 -- THE SPRITE-REQUEST QUEUE AT ITS CAP, BY INTERVENTION.

    The brief: "The sprite list is capped at 256 entries; find out what happens
    at the cap rather than assuming it never fills."  Wave 2 answered from the
    LISTING and said so; the corpus peak is 133 hardware entries and this wave
    re-measured the queue's own high-water at 120 of 251 records over the whole
    stage-1 opening.  A measurement of something that never happens proves
    nothing, so the queue is DRIVEN to its cap instead.

    THE MECHANISM, read off the ROM and re-disassembled here:

      $23D726  the ENQUEUE.  A2 = $80397C + $80AFC0; four `move.l (A0)+,(A2)+`
               = one 12-byte request; $23D73E `addi.w #$c,$80AFC0`;
               $23D746 `cmpi.w #$BC4,$80AFC0` / `beq $23D75A`
      $23D75A  FULL: `clr.w (A1)` zeroes the CALLER's remaining-record count and
               `ori #$1,SR` SETS CARRY.  Nothing already queued is evicted; the
               requests that lose are the ones enqueued LAST.
      $23D64E  the EMIT clamps independently: `cmpi.w #$BC4,D0 / bls` else
               `move.w #$BC4,D0` -- so even a pointer past the cap emits 251.
      $BC4 = 3012 = 251 x 12.  The emitter inserts one filler entry every 52
      records ($23D676 `moveq #$33,D4`, then `moveq #$32`), and 251 + 5 fillers
      = 256 = the IGS023's hardware maximum.  The two numbers are designed
      against each other.

    NOTE ON THE GUARD'S SHAPE, from the listing: the full test is `beq`, not
    `bge`.  It is only safe because the pointer starts at 0 and steps by exactly
    12, so it can never straddle $BC4.  A port that models the guard as ">=" is
    not translating this instruction; a port that models it as "==" inherits the
    same fragility, which is the faithful choice.

    THE INTERVENTION: $80AFC0 is written at the sample point, i.e. before the
    object driver runs and long before $23D712 clears the queue counters in
    main-loop call #4.  It is a value the game itself holds every frame (a
    multiple of 12 below the cap), so this changes WHEN the queue fills and
    nothing about WHAT the code does about it -- the same rule wave 2 applied to
    the NOP sled and wave 4 to the invulnerability timer.

    WHAT WAVE 2 COULD NOT ESTABLISH, NOW SETTLED FROM THE LISTING: wave 2 wrote
    "whether any caller acts on [the carry] I did not establish", because the
    call sites are reached by `bsr`, which an absolute-long xref cannot see.
    A static scan of EVERY `bsr` in $200000-$2A0000 whose target is $23D726
    finds 29 sites, $23D3EC .. $23D61A, and **all 29 are followed by
    `bcs $23D624`** -- the shared bail-out that jumps straight to the emit.
    So the cap does not drop "the last few requests": it abandons the current
    bucket's remainder AND every later bucket, and since the buckets are
    appended in a fixed order, what is lost is a whole low-priority TAIL.
    (`bsr` is what this scan sees; a call through a register would not be.)

    WHAT THIS RUN ADDS, and the honest limit of it: the poke makes the EMITTER
    read the bytes already sitting at those queue offsets, which are last
    frame's requests -- so `sprites`, `d_spr` and `pix` move for two reasons at
    once and are NOT a clean measure of which sprites are lost.  What the run
    does establish, cleanly, is that the FULL PATH EXECUTES (the
    `queue_full_events` census counts executions of `$23D75A`, hooked by its
    `clr.w (A1)` write) and that the machine keeps running normally afterwards
    -- no halt, still build B, the object table still walked.  `d_ram` moving is
    over-determined here (the poke itself writes $80AFC0, which is inside the
    digest), so this command does NOT read `d_ram` as evidence about the carry.
    """
    defs = scenarios()
    name = "stage1-open"
    s = next(x for x in defs["scenarios"] if x["name"] == name)
    frm = int(argv[0]) if argv else 2000
    out = OUT / "w5"
    out.mkdir(parents=True, exist_ok=True)
    print(f"=== CONTROL: no poke, {s['frames']} frames of '{name}'")
    ctl, tc = run_scenario(defs, dict(s, pixels=10), out=out, tag=".cap-ctl")
    check(ctl, "spritecap/control")
    for l in ctl.find("CENSUS max_sprite_entries") + ctl.find("CENSUS sprite_queue"):
        print("  " + l)

    # A SWEEP, because one poke value is a guess.  Every value is a MULTIPLE OF
    # 12 below the $BC4 cap -- the pointer is always a multiple of 12 on the
    # board, and the full test is `beq`, so a value off that grid could never
    # match and would be measuring the poke rather than the game.
    #
    # Why a sweep is needed at all, and it is the first real finding here: the
    # queue is appended by TWO routines.  $23D726 is the guarded one (29 call
    # sites, all in main-loop call #4).  $23D762 is a SECOND appender --
    # `lea $80397C,A0 / adda.w $80AFC0,A0 / ... / $23D794 addi.w #$c,$80AFC0` --
    # WITH NO CAP TEST AT ALL, reached from the object handlers in call #2.  So
    # a poke that is applied at the sample point is consumed by the UNGUARDED
    # appender first, and if that carries the pointer past $BC4 the guarded
    # `beq` can never match for the rest of the frame.  Sweeping downward finds
    # a value where the guarded chain still straddles the cap exactly.
    for lo, hi in ((0x600, None), (0x900, None), (0xA80, None), (0xB40, None),
                   (0xB70, None), (0xBB8, None)):
        val = lo
        assert val % 12 == 0, f"${val:X} is not on the 12-byte record grid"
        hi, lo, recs = f"{val >> 8:X}", f"{val & 0xff:02X}", val // 12
        print(f"\n=== POKE $80AFC0 = ${val:04X} ({val // 12} of 251 records "
              f"already queued) from logic frame {frm}")
        r, tsv = run_scenario(defs, dict(s, pixels=10), out=out,
                              tag=f".cap{recs}",
                              extra_env={"PROBE_POKE": f"80AFC0={hi},80AFC1={lo}",
                                         "PROBE_POKE_FROM": str(frm)})
        check(r, f"spritecap/{recs}", quiet=True)
        full = 0
        for l in (r.find("CENSUS max_sprite_entries")
                  + r.find("CENSUS sprite_queue")
                  + r.find("CENSUS halt_loop_interrupts")
                  + r.find("CENSUS object_slots_processed")
                  + r.find("BUILD ")):
            print("  " + l)
            if "queue_full_events=" in l:
                full = int(l.split("queue_full_events=")[1].split()[0])
        msgs = first_divergence(tc, tsv)
        moved = {m.split(":")[0].replace("col ", "") for m in msgs}
        print(f"  columns moved vs the control: {sorted(moved) or 'NONE'}")
        for m in msgs:
            if m.split(":")[0].replace("col ", "") in (
                    "d_spr", "sprites", "objn", "objord", "objlive", "c390a",
                    "pix"):
                print("    " + m)
        # THE ONLY CLAIM THIS RUN MAKES. See the docstring: `d_ram` is
        # over-determined because the poke writes inside the digest, and
        # `d_spr`/`pix`/`sprites` are over-determined because the emitter reads
        # stale queue bytes. The clean claim is that the cap PATH RUNS and the
        # machine survives it.
        print("  REACHED THE CAP: " + (
            f"YES, {full} executions of $23D75A (`clr.w (A1)`), and the run "
            f"completed on build B with no halt -- so the cap is a path the "
            f"board takes in its stride, not a crash"
            if full else
            "NO -- $23D75A never executed. The poke did not survive to the "
            "enqueue; do not read anything else on this line."))
    return 0


def _cmd_flyaround(argv: list[str]) -> int:
    """WAVE 4.  Run the `fly-around` scenario with the port's compared columns
    and the replay input word, dump main RAM at the seed frame, then hand both
    to `tools/portdiff.mjs`.  --break NAME runs a mutation and MUST go red."""
    defs = scenarios()
    name = argv[0] if argv and not argv[0].startswith("--") else "fly-around"
    s = next(x for x in defs["scenarios"] if x["name"] == name)
    brk = argv[argv.index("--break") + 1] if "--break" in argv else None
    out = OUT / "w4"
    out.mkdir(parents=True, exist_ok=True)
    seed_lf = s.get("seed", 2000)
    seed_bin = out / f"{name}.seed{seed_lf}.bin"
    tsv = out / f"{name}.tsv"
    if "--reuse" not in argv or not (tsv.exists() and seed_bin.exists()):
        r = trace(tsv, frames=s["frames"], buttons=build_script(defs, s),
                  build=s.get("build", "B"), meter=s.get("meter", True),
                  snap=s.get("snap", ""),
                  extra_env={"PROBE_PORTIN": "1", "PROBE_WATCH": w4_watch(),
                             "PROBE_POKE": s.get("poke", ""),
                             "PROBE_POKE_FROM": str(s.get("pokeFrom", 0)),
                             "PROBE_RAMDUMP": f"{seed_lf}:{seed_bin}"})
        check(r, name)
        census(r)
        for l in r.find("RAMDUMP"):
            print("  " + l)
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port is JavaScript")
    cmd = [node, str(HERE.parent.parent / "tools" / "portdiff.mjs"),
           str(tsv), str(seed_bin), "--seed-lf", str(seed_lf),
           "--tables", str(HERE.parent.parent / "rip" / "port" / "player.tables.json")]
    if s.get("poke"):
        # THE SAME INTERVENTION ON BOTH SIDES, or it is not one experiment.
        cmd += ["--poke", s["poke"]]
    if brk:
        cmd += ["--break", brk]
    print("\n$ " + " ".join(cmd[1:]))
    res = subprocess.run(cmd, text=True)
    if brk:
        # RED VALIDATION: the mutation must FAIL.  A mutation that passes is a
        # hole in the comparison, and it is reported as a failure of the GATE.
        if res.returncode == 0:
            print(f"FAIL mutation '{brk}' did NOT diverge -- the comparison "
                  f"cannot see it")
            return 1
        print(f"RED OK: mutation '{brk}' diverged, as it must")
        return 0
    return res.returncode


# --------------------------------------------------------------------------- wave 6
# THE PIXEL SLICE.  The corpus below is not a round number; each range is here
# because something was MEASURED at it.
#
#   PIX_FADE   `PROBE_PALDELTA=24` over the gate scenario reported a SUSTAINED
#              palette movement of 188-217 words (of 2,560) per video frame
#              across lf 1002..1016 -- a fade, not a cut.  Wave 3's whole 16-pair
#              corpus peaks at THREE words, which is why `pixgate.mjs --mutate
#              pal-same-frame` stays green on it: the measured palette
#              sample-point offset (00-recon-assets.md §4) is untested there.
#   PIX_CUT    the same census's top two rows, lf1204/lf1205 at 403 and 399
#              words -- a hard cut, a different shape of palette event.
#   PIX_DENSE  61 CONSECUTIVE logic frames of gameplay.  The plan asks for
#              "every frame of one dense stretch"; wave 3's points are 100+
#              frames apart and cannot see a one-frame transition at all.
#              Chosen at 2500 because the gfx gate measured 111 sprites at
#              f2536 -- the busiest natural frame in the corpus.
#   PIX_PRICOV the sprite-vs-BG priority rule, by intervention.  MEASURED
#              FIRST: of 1,397 sprite records in wave 3's 32 dumped frames,
#              **zero** have the pri bit set, so nothing in the natural corpus
#              exercises `pgm_draw_pix`'s priority test.
PIX_FADE = range(995, 1021)
PIX_CUT = range(1198, 1211)
PIX_DENSE = range(2500, 2561)
PIX_PRICOV_FROM = 2200
PIX_MIN_PAIRS = 60
PIX_MIN_SPRITES = 90
PIX_MIN_PALDELTA = 100
PIX_MIN_DENSE = 40


def _pix_points() -> str:
    return ",".join(str(x) for x in
                    (list(PIX_FADE) + list(PIX_CUT) + list(PIX_DENSE)))


def _cmd_pixslice(argv: list[str]) -> int:
    """THE PIXEL GATE FOR THE PORT'S RENDERER (wave 6).

    `pgm.py gfx` proves the PYTHON decoder bit-exact.  The port ships
    JAVASCRIPT, and a Python decoder that is 100 % says nothing about the JS the
    browser runs, so this is a second gate over `games/ddpdoj/src/render/` --
    the same modules `index.html` imports, no re-implementation.

      pgm.py pixslice                 dump the wave-6 corpus, then gate it
      pgm.py pixslice --reuse         gate the dumps already on disk
      pgm.py pixslice --mutate NAME   RED VALIDATION
      pgm.py pixslice --mutate all    every mutation; ALL must go red
      pgm.py pixslice --paldelta      re-run the palette-delta census that
                                      CHOSE the fade frames
    """
    import subprocess as sp
    if "--paldelta" in argv:
        r = trace(OUT / "paldelta.tsv", frames=2600, meter=False,
                  extra_env={"PROBE_PALDELTA": "24"})
        check(r, "pixslice/paldelta")
        for l in r.find("CENSUS paldelta"):
            print("  " + l)
        return 0
    reuse = "--reuse" in argv
    mut = None
    for i, a in enumerate(argv):
        if a == "--mutate" and i + 1 < len(argv):
            mut = argv[i + 1]

    slice_dir, pri_dir = RIP / "pix-slice", RIP / "pix-pri"
    if not reuse and mut is None:
        _gfx_run("pixslice", _pix_points(), 2600, outdir=slice_dir)
        # The priority poker runs SEPARATELY.  Mixing it into the natural
        # corpus would put a poked display list in the same directory as the
        # frames whose whole value is that the game built them itself.
        d = pri_dir
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)
        defs = scenarios()
        s = next(x for x in defs["scenarios"] if x["name"] == defs["gate"])
        r = trace(OUT / "pix-pri.tsv", frames=PIX_PRICOV_FROM + 40,
                  buttons=build_script(defs, s), meter=False,
                  extra_env={"PROBE_GFX": str(d),
                             "PROBE_PRICOV": str(PIX_PRICOV_FROM)})
        check(r, "pixslice/pricov")
        for l in r.find("PRICOV "):
            print("  " + l)
        print(f"  {len(r.find('GFXDUMP '))} state+framebuffer dumps in {d}")
    for d in (RIP / "gfx-gate", slice_dir, pri_dir):
        if not d.exists():
            raise SystemExit(f"{d} missing -- run `pgm.py pixslice` without "
                             f"--reuse (and `pgm.py gfx` for gfx-gate)")
    if not ROMDIR.exists():
        raise SystemExit(f"{ROMDIR} missing -- run `python "
                         f"games/ddpdoj/tools/assets.py extract` first")
    node = shutil.which("node")
    if not node:
        raise SystemExit("node is not on PATH -- the port's renderer is JS")
    cmd = [node, str(TOOLS / "pixgate.mjs"), "--rom", str(ROMDIR),
           "--dump", str(RIP / "gfx-gate"), "--dump", str(slice_dir),
           "--dump", str(pri_dir),
           "--min-pairs", str(PIX_MIN_PAIRS),
           "--min-sprites", str(PIX_MIN_SPRITES),
           "--min-paldelta", str(PIX_MIN_PALDELTA),
           "--min-dense", str(PIX_MIN_DENSE)]
    if mut:
        cmd += ["--mutate", mut]
    if mut and mut != "all":
        cmd += ["--quiet"]
    rc = sp.run(cmd).returncode
    if mut and mut != "all":
        print(f"EXPECTED-RED [{mut}]: " +
              ("diverged, as it must" if rc else
               "STILL 100 % -- the gate cannot see this mutation"))
        return 0 if rc else 1
    return rc


PIX_DEMO = range(2000, 2160)      # the fly-around scenario's first 160 logic
# frames from its seed, i.e. exactly the window wave 4 compares 0-divergent.


def _cmd_pixdemo(argv: list[str]) -> int:
    """THE BROWSER DEMO'S CAPTURE (wave 6).

    The port does not build the display list -- main-loop call #4 ($23D2AE) is
    unported and so are 18 of the 20 top-level object handlers -- so the demo
    page cannot draw a whole frame out of the port's own state, and this command
    does not pretend otherwise.  What it captures is:

      * 160 CONSECUTIVE frames of board video state from the `fly-around`
        scenario, from its seed at lf2000: the same window wave 4 compares at 0
        divergent frames,
      * the main-RAM seed at lf2000, which is what the port's `Game` starts
        from, and
      * `py`/`px` per logic frame, so `pixpack.mjs` can IDENTIFY the ship's
        display-list records by correlation rather than by eye.

    `vfmap.tsv` in the dump directory records the (video frame -> logic frame)
    join, because the pair offset means a filename alone does not carry it.
    """
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == "fly-around")
    d = RIP / "pix-demo"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True, exist_ok=True)
    out = OUT / "w6"
    out.mkdir(parents=True, exist_ok=True)
    seed_lf = s.get("seed", 2000)
    seed_bin = out / f"demo.seed{seed_lf}.bin"
    tsv = out / "demo.tsv"
    r = trace(tsv, frames=max(PIX_DEMO) + 40, buttons=build_script(defs, s),
              build="B", meter=False,
              extra_env={"PROBE_WATCH": w4_watch(),
                         # the replay input word, one per LOGIC frame -- without
                         # it `demogate.mjs` would have to feed the port the
                         # board's positions, i.e. the answer
                         "PROBE_PORTIN": "1",
                         "PROBE_POKE": s.get("poke", ""),
                         "PROBE_POKE_FROM": str(s.get("pokeFrom", 0)),
                         "PROBE_RAMDUMP": f"{seed_lf}:{seed_bin}",
                         "PROBE_GFX": str(d),
                         "PROBE_GFXAT": ",".join(str(x) for x in PIX_DEMO)})
    check(r, "pixdemo")
    rows = ["vf\tlf"]
    for l in r.find("GFXDUMP "):
        f = dict(p.split("=", 1) for p in l.split()[1:3])
        rows.append(f"{f['vf']}\t{f['lf']}")
    (d / "vfmap.tsv").write_text("\n".join(rows) + "\n", encoding="utf8")
    print(f"  {len(rows) - 1} dumps in {d}; seed {seed_bin}")
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH")
    return subprocess.run(
        [node, str(TOOLS / "pixpack.mjs"), "--dump", str(d), "--tsv", str(tsv),
         "--seed", str(seed_bin), "--out", str(RIP / "web")]).returncode


def _cmd_demogate(argv: list[str]) -> int:
    """THE DEMO PATH, GATED (wave 6).  Runs `src/web/app.js`'s pipeline headlessly:
    the port's Game driven by the board's own recorded input words, the ship's
    display-list records moved to the PORT's position, rendered by the port's
    renderer, and compared pixel for pixel against MAME's framebuffer.

      pgm.py demogate                 the gate
      pgm.py demogate --break NAME    RED VALIDATION (off-by-one, frozen-player,
                                      no-input); the gate must go red
    """
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port's renderer is JS")
    web, dump = RIP / "web", RIP / "pix-demo"
    tsv = OUT / "w6" / "demo.tsv"
    for p in (web / "capture.json", dump, tsv):
        if not p.exists():
            raise SystemExit(f"{p} missing -- run `pgm.py pixdemo` first")
    cmd = [node, str(TOOLS / "demogate.mjs"), "--rom", str(ROMDIR),
           "--web", str(web), "--dump", str(dump), "--tsv", str(tsv)]
    if "--break" in argv:
        cmd += ["--break", argv[argv.index("--break") + 1]]
    return subprocess.run(cmd).returncode


def _cmd_shardgate(argv: list[str]) -> int:
    """WAVE 15.  THE BACKGROUND-SHARD GATE -- the measurement that closes
    capture-ledger L7.

    `pgm.py pixslice` proves the port's renderer matches MAME with BG tiles
    decoded straight from the ROM; `pgm.py demogate`/`bundlegate` prove the
    PUBLISHED bundle matches MAME over the 161-frame capture (px 0..160).
    Neither is the claim L7 makes.  L7 is: the bundle holds the stage's 1,820
    BG tiles (not the capture's 415), and the page can draw a column past px 160
    with them.  This gate swaps the ONE thing that neither older gate did -- the
    BG tile source becomes the published `BgShards` -- and re-runs the identical
    pixel comparison over the pix-slice corpus's past-160 frames (bg_xscroll
    ≈ 0x0C00), so the shard decode is the only variable.

      pgm.py shardgate            fresh export, then baseline + RED
      pgm.py shardgate --reuse    skip the fresh export, reuse assets/ on disk
      pgm.py shardgate --no-red   baseline only
    """
    import subprocess as sp
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port's renderer is JS")
    assets = TOOLS.parent / "assets"
    slice_dir = RIP / "pix-slice"
    if not slice_dir.exists():
        raise SystemExit(f"{slice_dir} missing -- run `pgm.py pixslice` first "
                         "(it produces the past-160 dense frames this gate needs)")
    if not ROMDIR.exists():
        raise SystemExit(f"{ROMDIR} missing -- run `python "
                         f"games/ddpdoj/tools/assets.py extract` first")

    # DONE-WHEN 1: a FRESH extraction passing the exporter's own integrity
    # checks (CHECK 1 the attribute word, CHECK 2 the 1,820/$0AA9..$11C6 +
    # 205/$32A9..$3381 counts, the palette-vs-board agreement, the
    # region-assembly gate).  The exporter cannot verify ITSELF against MAME --
    # that is the baseline run below -- but it can and must catch the gross
    # errors a wrong base or stride would make.
    if "--reuse" not in argv:
        print("-- fresh export (integrity checks live in export-web.mjs)")
        rc = sp.run([node, str(TOOLS / "export-web.mjs")]).returncode
        if rc:
            return rc
    elif not assets.exists():
        raise SystemExit(f"{assets} missing -- run `pgm.py shardgate` without "
                         "--reuse to build it")

    common = [node, str(TOOLS / "pixgate.mjs"), "--rom", str(ROMDIR),
              "--shards", str(assets), "--dump", str(slice_dir),
              "--min-pairs", "40", "--min-sprites", "90", "--min-dense", "40"]
    # DONE-WHEN 3: the shard-backed renderer, past px 160, == MAME.
    print("\n-- shard baseline (BG tiles from the published shards, past px 160)")
    rc = sp.run(common + ["--quiet"]).returncode
    if rc:
        return rc
    if "--no-red" in argv:
        return 0
    # RED: a decode error composed on the shard tiles, and a newly-exported
    # past-160 tile blanked in the shard sheet, must BOTH diverge.  The second
    # is the one that proves the past-160 picture is coming from the SHARDS and
    # not a ROM fallback or the capture.
    print("\n-- shard RED (bg-planes composed; blank-shard-tile)")
    return sp.run(common + ["--mutate", "all", "--quiet"]).returncode


# --------------------------------------------------------------------------- wave 11
# THE DISPLAY-LIST KEYSTONE.  Main-loop call #4 is a PURE TRANSFORM of the thirty
# bucket counters and their staging buffers into $800000..$8009FF, so it can be
# gated to the byte with ZERO new gameplay simulation: dump the board's INPUT and
# its OUTPUT, replay the transform in the port, compare.  The recording becomes
# the gate's input instead of its output.
W11 = OUT / "w11"


def _w11_run(name: str, *, frames: int, script: str, out_bin: Path | None = None,
             extra: dict | None = None, seconds: int = 3600) -> Run:
    W11.mkdir(parents=True, exist_ok=True)
    env = {
        "W11_FRAMES": str(frames),
        "W11_INPUT": script,
        "W11_REQUIRE_BUILD": "B",
    }
    if out_bin is not None:
        out_bin.unlink(missing_ok=True)     # never re-read a previous run's file
        env["W11_OUT"] = str(out_bin)
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    r = run(HERE / "w11dl.lua", seconds=seconds, env=env)
    check(r, name)
    for l in r.find("W11 ") + r.find("BUILD ") + r.find("ZOOMRAM "):
        print("  " + l)
    return r


# THE FORCED CAP.  The queue NEVER fills in natural play -- 120 records of 251
# over 1,901 build-B frames -- so the drop policy, the equality cap and the
# terminator decision at exactly 251 records are three code paths the natural
# corpus cannot test.  They are forced by POKING ONE BUCKET COUNTER at the
# sample point, which is the same class of intervention as wave 2's NOP sled and
# wave 4's invulnerability timer: it changes WHEN the cap is reached and nothing
# about WHAT call #4 does about it.
#
# WHY BUCKET 1's COUNTER $80AFC2 AND NOT $80AFC0.  Wave 5 poked $80AFC0 and had
# to sweep for a value that worked, because $23D762 (the UNGUARDED direct
# appender) consumes the poke first and can carry the pointer PAST $BC4, after
# which the guarded `beq` can never match.  A bucket counter has no such
# problem: the queue pointer starts at bucket 0's own byte count -- always a
# multiple of 12 -- and $BC4 = 3012 is a multiple of 12, so the drain is
# guaranteed to land on the cap EXACTLY.  $80AFC2 is drained FIRST of the 29, so
# the cap fires before any other bucket is touched and the result is repeatable.
#
# AND ONE THING `beq` VS `bge` CANNOT BE ASKED ON THE BOARD.  The queue pointer
# starts at a multiple of 12 and steps by exactly 12, and $BC4 = 3012 is a
# multiple of 12, so `cmpi.w #$BC4 / beq` and a hypothetical `bge` fire on
# EXACTLY the same record.  They are indistinguishable by construction -- which
# is wave 5's point restated as an experiment that cannot be run.  The one place
# they DO differ is when the pointer is ALREADY past $BC4 when the drain starts,
# which is what the second forced scenario below produces: `--cap0` pokes
# $80AFC0 itself, so the guarded `beq` can never match all frame and `bge` would
# abandon everything on the first record.  The difference is invisible in the
# display list (the emit clamps to 251 either way) and VISIBLE in $80AFFC, the
# post-drain queue length -- which is why the gate compares call #4's other
# outputs and not only $800000..$8009FF.
W11_CAP_POKE = "80AFC2=0B,80AFC3=C4"     # $0BC4 = 3012 bytes = 251 records
W11_CAP0_POKE = "80AFC0=0B,80AFC1=40"    # $0B40 = 2880 bytes = 240 records
W11_CAP_FROM = 2000


def _cmd_dlgate(argv: list[str]) -> int:
    """WAVE 11.  THE STAGED-BYTES REPLAY GATE for main-loop call #4.

      pgm.py dlgate                    stage1-open, every build-B frame
      pgm.py dlgate --cap              FORCED: bucket 1's counter to $BC4, so
                                       the RUNTIME cap fires with equality and
                                       the emit reaches exactly 251 records
      pgm.py dlgate --cap0             FORCED: the QUEUE pointer to $B40, so the
                                       pre-emptive drops fire and `beq` vs `bge`
                                       become distinguishable in $80AFFC
      pgm.py dlgate --reuse            re-gate the dump already on disk
      pgm.py dlgate --break NAME       RED VALIDATION; the gate must go red
      pgm.py dlgate --break all        every mutation in turn
    """
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port is JavaScript")
    cap = "--cap" in argv
    cap0 = "--cap0" in argv
    reuse = "--reuse" in argv
    brk = argv[argv.index("--break") + 1] if "--break" in argv else None
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == "stage1-open")
    tag = "cap0" if cap0 else ("cap" if cap else "open")
    binp = W11 / f"dl-{tag}.bin"
    if (not reuse and brk is None) or not binp.exists():
        extra = {"W11_FROM": 700}       # the chooser fires near lf600; build A
                                        # frames are not this gate's subject
        if cap or cap0:
            extra.update({"W11_POKE": W11_CAP0_POKE if cap0 else W11_CAP_POKE,
                          "W11_POKE_FROM": W11_CAP_FROM})
        print(f"=== dumping (staged bytes, display list) pairs over stage1-open"
              f"{' WITH THE FORCED ' + tag.upper() if (cap or cap0) else ''}",
              flush=True)
        r = _w11_run(f"dlgate/{tag}", frames=s["frames"],
                     script=build_script(defs, s), out_bin=binp, extra=extra)
        zoom = (r.find("ZOOMRAM ") or [""])[0][len("ZOOMRAM "):]
        (W11 / f"zoomram-{tag}.txt").write_text(zoom, encoding="utf8")
    zoom = (W11 / f"zoomram-{tag}.txt").read_text(encoding="utf8").strip()

    def gate(m: str | None, which: Path = binp, quiet: bool = False) -> int:
        cmd = [node, str(HERE.parent.parent / "tools" / "dlgate.mjs"), str(which)]
        if zoom:
            cmd += ["--zoomram", zoom]
        if m:
            cmd += ["--break", m]
        kw = {"stdout": subprocess.DEVNULL} if quiet else {}
        return subprocess.run(cmd, text=True, **kw).returncode

    if brk == "all":
        # THE SWEEP RUNS OVER ALL THREE SCENARIOS AND REQUIRES THE UNION.
        # A mutation is only reachable where its path is: `terminator-by-count`
        # needs a 251-record frame, `no-preemptive-drop` needs an over-budget
        # frame, `cap-as-ge` needs the queue pointer ALREADY past $BC4.  Asking
        # for every mutation to go red on the natural scenario would be asking
        # the natural scenario to contain paths it measurably does not.  So each
        # mutation must go red on AT LEAST ONE dump, and which one is printed.
        tags = ["open", "cap", "cap0"]
        bins = {tg: W11 / f"dl-{tg}.bin" for tg in tags}
        missing = [tg for tg in tags if not bins[tg].exists()]
        if missing:
            raise SystemExit(f"run `pgm.py dlgate` and `pgm.py dlgate --cap` and "
                             f"`pgm.py dlgate --cap0` first; missing {missing}")
        import json as _json
        # The mutation list is read OUT OF src/displaylist.js -- the two-sides
        # rule w4_watch() follows.  A hand-copied list here is how a mutation
        # gets silently dropped from the sweep.
        body = (HERE.parent.parent / "src" / "displaylist.js").read_text(encoding="utf8")
        blk = body.split("export const MUTATIONS = {", 1)[1].split("\n};", 1)[0]
        names = re.findall(r"^\s*'([a-z0-9-]+)':", blk, re.M)
        # DECLARED EXPECTED-GREEN, with the reason, BEFORE the run.  See
        # src/displaylist.js §4: build B's terminator test compares D1, which
        # `$23D6DA move.w #$12,D1` has already loaded, so the terminator is
        # written at every length and "force the terminator" cannot move a byte.
        # The plan named this mutation on the recon's reading of that test; the
        # listing refutes the reading, and this is where that is said out loud
        # instead of quietly dropping the mutation.
        #
        # `b054-two-16bit-adds` is declared green for a MEASURED reason and not
        # a structural one: $80B054 has been $00000000 on every frame this
        # project has ever sampled (1,901 build-B frames here, 5,000 in
        # 10-recon-display-list), and adding zero as one 32-bit add or as two
        # 16-bit adds is the same answer. It is red-validated in
        # tests/displaylist.test.js with $80B054 non-zero, where the carry out
        # of the short axis is the whole point. IF A LATER WAVE EVER SEES
        # $80B054 MOVE, this becomes a board-red mutation and the declaration
        # below must come out.
        expected_green = {"always-terminate", "b054-two-16bit-adds"}
        base = 0
        for tg in tags:
            rc0 = gate(None, bins[tg], quiet=True)
            print(f"BASELINE {tg}: {'PASS' if rc0 == 0 else 'FAIL'}")
            base |= rc0
        bad, table = [], []
        for n in names:
            reds = [tg for tg in tags if gate(n, bins[tg], quiet=True) != 0]
            if n in expected_green:
                ok = not reds
                note = ("GREEN everywhere, as DECLARED"
                        if ok else f"RED on {reds} -- the EXPECTED-GREEN "
                                   f"declaration is wrong")
            else:
                ok = bool(reds)
                note = (f"RED on {reds}" if ok else
                        "STILL GREEN ON EVERY SCENARIO -- no gate can see it")
            table.append((n, reds, ok))
            print(f"    {n:24s} {note}")
            if not ok:
                bad.append(n)
        print("\nRED VALIDATION: " + ("every mutation behaved as declared, over "
                                      "the union of stage1-open / --cap / --cap0"
                                      if not bad and base == 0 else
                                      f"BROKEN -- baseline="
                                      f"{'ok' if base == 0 else 'FAILED'} bad={bad}"))
        _json.dump({"baseline": base, "bad": bad,
                    "table": [[n, r] for n, r, _ in table]},
                   open(W11 / "redval.json", "w"))
        return 0 if (base == 0 and not bad) else 1
    rc = gate(brk)
    if brk:
        print(f"EXPECTED-RED [{brk}]: " +
              ("diverged, as it must" if rc else
               "STILL 0 DIVERGENT -- the gate cannot see this mutation"))
        return 0 if rc else 1
    return rc


# THE BUCKET ABLATION.  10-recon-display-list §7.1: "I did not prove what any
# bucket DRAWS in pixels.  The ablation experiment settles all 30 in one run and
# I did not run it."  This is that run, thirty times.  Zero one bucket's counter
# at $23D382 -- after the sum, before the drop policy and the drain -- and diff
# the framebuffer against a control whose only difference is the missing poke.
W11_ABLATE_AT = "1900,2100,2300,2500"
W11_ABLATE_COUNTERS = [
    0x80afc0, 0x80afc2, 0x80afc4, 0x80afc6, 0x80afcc, 0x80afd0, 0x80afd2,
    0x80afc8, 0x80afca, 0x80afd4, 0x80afe8, 0x80aff0, 0x80afea, 0x80afec,
    0x80afd6, 0x80afda, 0x80afd8, 0x80afce, 0x80aff8, 0x80afdc, 0x80afde,
    0x80afe4, 0x80afe0, 0x80afe2, 0x80affa, 0x80afe6, 0x80afee, 0x80aff2,
    0x80aff4, 0x80aff6,
]


def _cmd_ablate(argv: list[str]) -> int:
    """WAVE 11.  WHAT DOES EACH SPRITE BUCKET DRAW?  Measured, not inferred.

      pgm.py ablate                      all 30 buckets (30 runs + 1 control)
      pgm.py ablate 14 19 20             only these bucket indexes
      pgm.py ablate --at 2107,2320 3 5   a SECOND PASS at other logic frames

    WHY A SECOND PASS EXISTS.  A bucket's ablation can only lose pixels on a
    frame where that bucket HAD records, and the rarer buckets are live on a few
    hundred of the 1,901 frames.  Pass 1's four frames were chosen before the
    per-bucket census existed; `node tools/dlgate.mjs <dump> --census --at ...`
    is what says which frames a given bucket is live on, and a second pass at
    those frames turns "0 pixels" from "did not appear" into "appeared and drew
    nothing".  The two are not the same answer and the worklog keeps them apart.
    """
    at_arg = None
    if "--at" in argv:
        i = argv.index("--at")
        at_arg = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    want = [int(a) for a in argv if not a.startswith("-")]
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == "stage1-open")
    script = build_script(defs, s)
    at = at_arg or W11_ABLATE_AT
    d = RIP / ("w11-ablate" if at_arg is None else f"w11-ablate-{at.replace(',', '_')}")
    d.mkdir(parents=True, exist_ok=True)
    pts = [int(x) for x in at.split(",")]

    def one(tag: str, ablate: int | None) -> Path:
        sub = d / tag
        if sub.exists():
            shutil.rmtree(sub)
        sub.mkdir(parents=True, exist_ok=True)
        extra = {"W11_PIX": at, "W11_PIXDIR": str(sub)}
        if ablate is not None:
            extra["W11_ABLATE"] = f"{ablate:X}"
        _w11_run(f"ablate/{tag}", frames=max(pts) + 20, script=script, extra=extra)
        return sub

    # `--report` re-diffs the framebuffers already on disk: the bounding boxes
    # were added after the first 31 runs, and re-running MAME thirty-one times
    # to print a box the dumps already contain would be a measurement of
    # nothing.
    report_only = "--report" in sys.argv
    if report_only:
        print("=== --report: re-diffing the framebuffers already on disk")
        ctl = d / "control"
    else:
        print("=== CONTROL: no ablation")
        ctl = one("control", None)

    def readpix(p: Path):
        return p.read_bytes()

    # THE BOUNDING BOX, not just the count.  "6,380 pixels vanished" is a
    # number; "a 34x50 box that follows the ship" is an IDENTIFICATION.  The
    # screen is 448x224 and `SCR:pixels()` is row-major BGRA
    # (igs023_video.cpp's bitmap; the same layout gfxgate.py reads).
    SW, SH = 448, 224

    def bbox(a: bytes, b: bytes):
        x0, y0, x1, y1, n = SW, SH, -1, -1, 0
        for k in range(0, min(len(a), len(b)), 4):
            if a[k:k + 4] != b[k:k + 4]:
                px, py = (k // 4) % SW, (k // 4) // SW
                x0 = min(x0, px); x1 = max(x1, px)
                y0 = min(y0, py); y1 = max(y1, py)
                n += 1
        return n, (x0, y0, x1, y1) if n else None

    rows = []
    for i, ctr in enumerate(W11_ABLATE_COUNTERS):
        if want and i not in want:
            continue
        print(f"\n=== ablating bucket {i} (counter ${ctr:06X})")
        sub = (d / f"b{i:02d}") if report_only else one(f"b{i:02d}", ctr)
        tot, per, boxes = 0, [], []
        for lf in pts:
            a = readpix(ctl / f"lf{lf:06d}.pixels.bin")
            b = readpix(sub / f"lf{lf:06d}.pixels.bin")
            n, box = bbox(a, b)
            per.append(n)
            if box:
                boxes.append(f"lf{lf}:{box[0]},{box[1]}..{box[2]},{box[3]}")
            tot += n
        rows.append((i, ctr, tot, per, boxes))
        print(f"  bucket {i:2d} ${ctr:06X}: {tot} differing pixels over "
              f"{len(pts)} frames {per}  {' '.join(boxes)}")
    print("\n=== BUCKET -> PIXELS, stage1-open, frames " + at)
    print(f"{'bucket':>6} {'counter':>9} {'pixels_lost':>12}  per-frame"
          f"   bounding boxes of what vanished (x0,y0..x1,y1 of 448x224)")
    for i, ctr, tot, per, boxes in sorted(rows, key=lambda r: -r[2]):
        print(f"{i:6d} ${ctr:06X} {tot:12d}  {per}   {' '.join(boxes)}")
    print(f"\nframebuffers in {d} (ROM-DERIVED -- gitignored)")
    return 0


W12_MUTATIONS = [
    "no-aura", "aura-phase-flat", "no-glow", "glow-without-prot",
    "pods-rigid", "no-shadow", "shadow-no-borrow", "pod-asr-toward-zero",
    "ship-order-swapped", "no-option-object",
]
# Declared GREEN on THIS gate, BEFORE the run, with the reason in shipgate.mjs's
# SHIP_EXPECTED_GREEN.  Both are RED on `pgm.py flyaround`, which is the point:
# a difference the picture cannot see is still a difference, and it needs a
# compared column rather than a pixel.
W12_EXPECTED_GREEN = ["hitx-frozen"]


def _cmd_shipgate(argv: list[str]) -> int:
    """WAVE 12.  THE SHIP, ITS PODS AND THEIR SHADOWS, PRODUCED.

      pgm.py shipgate                  fly-around, buckets 5/15/19
      pgm.py shipgate --reuse          re-use the two dumps
      pgm.py shipgate --break NAME     one mutation; it MUST go red
      pgm.py shipgate --break all      every mutation, plus the expected-greens

    TWO MAME RUNS, not one, and they are two different instruments on the same
    scenario: `w11dl.lua` dumps the board's thirty staged bucket buffers at
    `$23D382` and the display list at the arm; `frame.lua` dumps the input word
    and the 128 KiB RAM seed.  `tools/shipgate.mjs` joins them.
    """
    defs = scenarios()
    s = next(x for x in defs["scenarios"] if x["name"] == "fly-around")
    script = build_script(defs, s)
    out = OUT / "w12"
    out.mkdir(parents=True, exist_ok=True)
    pairs = out / "fly-around.pairs.bin"
    tsv = out / "fly-around.tsv"
    seed_lf = s.get("seed", 2000)
    seed_bin = out / f"fly-around.seed{seed_lf}.bin"
    reuse = "--reuse" in argv and pairs.exists() and tsv.exists() \
        and seed_bin.exists()
    if not reuse:
        # (1) the staged bytes + the display list, from lf1900 so the seed frame
        #     itself is present and the window starts before it.
        _w11_run("w12-shipgate-pairs", frames=s["frames"], script=script,
                 out_bin=pairs,
                 extra={"W11_FROM": seed_lf - 100, "W11_POKE": s.get("poke", ""),
                        "W11_POKE_FROM": s.get("pokeFrom", 0)})
        # (2) the input words and the RAM seed -- the same invocation
        #     `pgm.py flyaround` uses, so the two gates cannot drift apart.
        r = trace(tsv, frames=s["frames"], buttons=script,
                  build=s.get("build", "B"), meter=s.get("meter", True),
                  snap=s.get("snap", ""),
                  extra_env={"PROBE_PORTIN": "1", "PROBE_WATCH": w4_watch(),
                             "PROBE_POKE": s.get("poke", ""),
                             "PROBE_POKE_FROM": str(s.get("pokeFrom", 0)),
                             "PROBE_RAMDUMP": f"{seed_lf}:{seed_bin}"})
        check(r, "fly-around")
        census(r)
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port is JavaScript")
    base = [node, str(HERE.parent.parent / "tools" / "shipgate.mjs"),
            str(pairs), str(tsv), str(seed_bin), "--seed-lf", str(seed_lf)]
    if s.get("poke"):
        base += ["--poke", s["poke"]]

    def one(mut: str | None) -> int:
        cmd = base + (["--break", mut] if mut else [])
        print("\n$ " + " ".join(cmd[1:]))
        return subprocess.run(cmd, text=True).returncode

    if "--break" in argv and argv[argv.index("--break") + 1] == "all":
        bad = []
        for m in W12_MUTATIONS:
            if one(m) == 0:
                print(f"FAIL mutation '{m}' did NOT diverge -- the gate cannot "
                      f"see it")
                bad.append(m)
            else:
                print(f"RED OK: '{m}' diverged, as it must")
        for m in W12_EXPECTED_GREEN:
            rc = one(m)
            print(f"{'EXPECTED-GREEN OK' if rc == 0 else 'FAIL'}: '{m}' "
                  f"{'stayed green' if rc == 0 else 'went red'} -- it is "
                  f"declared green on THIS gate and red on pgm.py flyaround")
            if rc != 0:
                bad.append(m)
        print(f"\nRED VALIDATION: {len(W12_MUTATIONS)} mutations, "
              f"{len(W12_MUTATIONS) - len([b for b in bad if b in W12_MUTATIONS])}"
              f" red as declared; {len(bad)} behaved wrongly")
        return 1 if bad else 0
    if "--break" in argv:
        m = argv[argv.index("--break") + 1]
        rc = one(m)
        if m in W12_EXPECTED_GREEN:
            return 0 if rc == 0 else 1
        if rc == 0:
            print(f"FAIL mutation '{m}' did NOT diverge")
            return 1
        print(f"RED OK: mutation '{m}' diverged, as it must")
        return 0
    return one(None)


# --------------------------------------------------------------- wave 12.5
def _cmd_firegate(argv: list[str]) -> int:
    r"""WAVE 12.5.  THE $24C476 FIRE HANDSHAKE, against the board.

    12-review F2: every exit of option formation 2 falls into `$24C476` and the
    port returned instead.  `shipgate` and `flyaround` cannot see it -- the
    block is INERT on a button-free scenario -- so it needs its own instrument
    and this is it.

    WHY THIS IS A TRACE REPLAY AND NOT A LIVE GATE, stated up front because it
    is the honest limit of the wave: `$24C4F2 bra $24D480` is the PODS' SHOT
    SPAWN, which is W20's and is a named throw here.  On the board the very
    first tap reaches it, so a full-port run BLOCKS on the first fire frame no
    matter what -- before this wave at `$24C180`, after it at `$24D480`.  There
    is no window in which the whole port runs and the handshake is exercised.
    So the block is driven DIRECTLY, frame by frame, off the board's own
    columns: entry state from the sample point of frame N-1, inputs from frame
    N, outputs compared against frame N.  Every value on both sides is measured.

    TWO INSTRUMENTS, not one.  The VALUES (`p34`, `p35`, `oflg1`) say what came
    out; the ELEVEN PROBE_EXEC counters (`state.js FIRE_EXEC`) say which of the
    block's write sites the BOARD executed, and the port counts the same eleven
    under the same names.  A port that reaches the right numbers down the wrong
    arm is red on the second instrument.
    """
    defs = scenarios()
    name = argv[0] if argv and not argv[0].startswith("--") else "stage1-shot"
    s = next(x for x in defs["scenarios"] if x["name"] == name)
    brk = argv[argv.index("--break") + 1] if "--break" in argv else None
    out = OUT / "w12_5"
    out.mkdir(parents=True, exist_ok=True)
    tsv = out / f"{name}.fire.tsv"
    if "--reuse" not in argv or not tsv.exists():
        r = trace(tsv, frames=s["frames"], buttons=build_script(defs, s),
                  build=s.get("build", "B"), meter=s.get("meter", True),
                  extra_env={"PROBE_WATCH": w4_watch(), "PROBE_EXEC": w8_exec(),
                             "PROBE_POKE": s.get("poke", ""),
                             "PROBE_POKE_FROM": str(s.get("pokeFrom", 0))})
        check(r, name)
        census(r)
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not on PATH -- the port is JavaScript")
    cmd = [node, str(HERE.parent.parent / "tools" / "firegate.mjs"), str(tsv)]
    if brk:
        cmd += ["--break", brk]
    print("\n$ " + " ".join(cmd[1:]))
    res = subprocess.run(cmd, text=True)
    if brk:
        # EXPECTED-GREEN mutations are declared in tools/breakage.mjs BEFORE the
        # run, with the MEASUREMENT that says why this scenario cannot see them
        # and the test that does.  Read from that file, never duplicated here.
        body = (HERE.parent.parent / "tools" / "breakage.mjs").read_text(encoding="utf8")
        blk = body.split("FIRE_EXPECTED_GREEN = {", 1)[-1].split("\n};", 1)[0]
        if f"'{brk}':" in blk:
            if res.returncode != 0:
                print(f"FAIL mutation '{brk}' is declared EXPECTED-GREEN in "
                      f"tools/breakage.mjs and went RED -- one of the two is wrong")
                return 1
            print(f"EXPECTED-GREEN OK: '{brk}' left the RESULT line green on "
                  f"{name}, as tools/breakage.mjs declares it must; that file "
                  f"names the measurement and the test that DOES see it fail")
            return 0
        if res.returncode == 0:
            print(f"FAIL mutation '{brk}' did NOT diverge -- the comparison "
                  f"cannot see it")
            return 1
        print(f"RED OK: mutation '{brk}' diverged, as it must")
        return 0
    return res.returncode


# --------------------------------------------------------------------------- wave 69
# THE CHECKPOINT LADDER.
#
# THE CADENCE IS 250 LOGIC FRAMES, and it is a decision with reasons rather than
# a round number:
#
#  * SPACE.  19,600 frames / 250 = 79 rungs x (131,072 B RAM + 4,096 B BG) =
#    10.2 MB.  `games/ddpdoj/tools/oracle/out/` already holds 158 MB, so the
#    ladder is 6 % of what is there and the cadence is not space-limited.  A
#    100-frame cadence would be 26 MB and still affordable; a 1,000-frame one
#    would save nothing worth having.  So space does not decide it.
#  * BISECTION.  What decides it is what you do with a divergence.  The ladder
#    exists so that "first divergent field at lf12,431" can be re-run from the
#    rung BEFORE it in isolation.  A rung every 250 frames puts every frame in
#    the stage within 250 frames of a restartable state -- about four seconds of
#    game time, and a segment that size takes the port well under a second.
#  * ATTRIBUTION.  Segments are compared INDEPENDENTLY, each re-seeded from the
#    board.  That is the property that makes a deep sweep readable: a divergence
#    in segment 7 does not poison segments 8..79, so the report is "which parts
#    of the stage diverge" and not "everything after the first bug".  Coarser
#    rungs blur that; finer rungs stop distinguishing anything, because a
#    re-seed every few frames re-seeds away the very drift being hunted.
#
# ALIGNMENT IS NOT OPTIONAL.  The ladder always contains the corpus's OWN seed
# frames (`seed` in scenarios.json: lf2000 for `fly-around`, lf3716 for
# `stage1-shot`).  A ladder that could not land on an existing seed frame could
# never reproduce an existing result, and the first thing this mechanism has to
# do is reproduce one.
CKPT_EVERY = 250


def ckpt_rungs(defs: dict, s: dict, every: int = CKPT_EVERY,
               extra: list[int] | None = None) -> list[int]:
    """The logic frames to checkpoint, sorted and unique."""
    start = int(s.get("seed", 2000))
    end = int(s["frames"])
    rungs = set(range(start, end, every))
    rungs.add(start)
    # Every seed frame any scenario in the corpus declares, so a reproduction is
    # always possible.  Named from the file, never typed in here.
    for x in defs["scenarios"]:
        if x.get("seed") is not None and start <= int(x["seed"]) < end:
            rungs.add(int(x["seed"]))
    for x in extra or []:
        if start <= x < end:
            rungs.add(x)
    return sorted(rungs)


def _cmd_ckpt(argv: list[str]) -> int:
    """WAVE 69.  ONE cartridge run over a whole stage; a ladder of checkpoints
    out of it; every later comparison is JavaScript over files that exist.

        python pgm.py ckpt [scenario] [--every K] [--also LF,LF] [--verify]

    `--verify` additionally asks the SAME RUN for a wave-4 `PROBE_RAMDUMP` at
    the scenario's own seed frame and asserts it is BYTE-IDENTICAL to the rung
    the new dumper wrote there.  That is the reproduction-first check: the new
    mechanism has to agree with the old one on a frame the old one can reach,
    before anything it says about a frame the old one cannot reach is worth
    reading.
    """
    defs = scenarios()
    name = argv[0] if argv and not argv[0].startswith("--") else "stage1-sweep"
    s = next((x for x in defs["scenarios"] if x["name"] == name), None)
    if s is None:
        raise SystemExit(f"unknown scenario {name}; have "
                         f"{[x['name'] for x in defs['scenarios']]}")
    every = int(argv[argv.index("--every") + 1]) if "--every" in argv else CKPT_EVERY
    extra = ([int(x) for x in argv[argv.index("--also") + 1].split(",")]
             if "--also" in argv else [])
    verify = "--verify" in argv

    out = OUT / "w69" / name
    ck = out / "ckpt"
    if ck.exists():
        shutil.rmtree(ck)          # never mix two runs' rungs in one directory
    ck.mkdir(parents=True, exist_ok=True)
    rungs = ckpt_rungs(defs, s, every, extra)
    tsv = out / "trace.tsv"
    seed_lf = int(s.get("seed", 2000))
    vseed = out / f"verify.ramdump.lf{seed_lf}.bin"

    env = {
        # THE PORT'S INPUT.  Without this the port would be fed its own answer
        # rather than the hardware's input word -- portdiff.mjs refuses a trace
        # that lacks the column, and that refusal is why this is not optional.
        "PROBE_PORTIN": "1",
        "PROBE_WATCH": w4_watch(),
        "PROBE_RAWDUMP": w8_rawdump(),
        "PROBE_EXEC": w8_exec(),
        "PROBE_POKE": s.get("poke", ""),
        "PROBE_POKE_FROM": str(s.get("pokeFrom", 0)),
        "PROBE_CKPT": str(ck),
        "PROBE_CKPT_AT": ",".join(str(x) for x in rungs),
    }
    if verify:
        env["PROBE_RAMDUMP"] = f"{seed_lf}:{vseed}"

    print(f"=== {name}: {s['why'][:160]}...")
    print(f"    {s['frames']} logic frames, build {s.get('build', 'B')}")
    print(f"    {len(rungs)} rungs every {every} frames, lf{rungs[0]}..{rungs[-1]}")
    if s.get("poke"):
        print(f"    INTERVENTION: poke {s['poke']} from lf{s.get('pokeFrom', 0)} "
              f"-- this run yields STATES, not a picture of the game "
              f"(docs/knowledge/09)")
    t0 = time.time()
    r, _ = run_scenario(defs, s, out=out, tag="", extra_env=env)
    # `run_scenario` names the file after the scenario; the manifest wants a
    # stable name, so move rather than guess later.
    got = out / f"{name}.tsv"
    if got.exists():
        tsv.unlink(missing_ok=True)
        got.replace(tsv)
    check(r, f"ckpt/{name}")
    census(r)
    wall = time.time() - t0

    taken = {}
    for l in r.find("CKPT "):
        d = dict(kv.split("=", 1) for kv in l.split()[1:])
        taken[int(d["lf"])] = d
        print("  " + l)
    for l in r.find("CENSUS checkpoints") + r.find("WARN "):
        print("  " + l)

    missing = [x for x in rungs if x not in taken]
    print(f"\nLADDER {len(taken)} of {len(rungs)} rungs taken in {wall:.0f} s "
          f"({s['frames'] / max(wall, 1):.1f} logic frames per wall second)")
    if missing:
        print(f"  MISSING {len(missing)} rungs: lf"
              + ",".join(str(x) for x in missing[:10])
              + (" ..." if len(missing) > 10 else "")
              + "  -- the run ended before them. That is a fact about the RUN.")

    # The per-frame video-frame map, so a seeded port can be given the board's
    # own videoFrame instead of counting from zero.
    rows = tsv.read_text(encoding="utf8").splitlines()
    cols = {c: i for i, c in enumerate(rows[0].split("\t"))}
    vf = {}
    for ln in rows[1:]:
        f = ln.split("\t")
        vf[int(f[cols["lf"]])] = int(f[cols["vf"]])

    man = {
        "wave": 69,
        "scenario": name,
        "why": s["why"],
        "set": defs["set"],
        "build": s.get("build", "B"),
        "frames": s["frames"],
        "script": build_script(defs, s),
        "poke": s.get("poke", ""),
        "pokeFrom": s.get("pokeFrom", 0),
        # LABELLED AT THE SOURCE, so no consumer can present this as ordinary
        # play by accident.  docs/knowledge/09.
        "intervention": (
            f"$810424 held at $FF from lf{s.get('pokeFrom', 0)} -- the player is "
            f"INVULNERABLE. This ladder gives STATES, not a picture of the game; "
            f"a seeded comparison from it validates the CODE from that state, "
            f"never the route to it."
        ) if s.get("poke") else "",
        "every": every,
        "lastLf": max(vf) if vf else 0,
        "rungs": [{"lf": x, "vf": vf.get(x),
                   "ram": f"c{x:06d}.ram.bin", "bg": f"c{x:06d}.bg.bin",
                   "regs": f"c{x:06d}.regs.txt"}
                  for x in rungs if x in taken],
        "missing": missing,
        "trace": tsv.name,
        "dir": "ckpt",
    }
    (out / "manifest.json").write_text(json.dumps(man, indent=1), encoding="utf8")
    print(f"  manifest -> {out / 'manifest.json'}")

    rc = 0
    if verify:
        # THE REPRODUCTION CHECK, and it is the reason --verify exists.
        rung = ck / f"c{seed_lf:06d}.ram.bin"
        if not vseed.exists() or not rung.exists():
            print(f"FAIL verify: {vseed.name} exists={vseed.exists()} "
                  f"{rung.name} exists={rung.exists()}")
            rc = 1
        else:
            a = hashlib.sha256(vseed.read_bytes()).hexdigest()
            b = hashlib.sha256(rung.read_bytes()).hexdigest()
            print(f"VERIFY wave-4 PROBE_RAMDUMP  lf{seed_lf}  sha256={a}")
            print(f"VERIFY wave-69 ladder rung   lf{seed_lf}  sha256={b}")
            if a != b:
                print("FAIL the two dumpers disagree at the same logic frame -- "
                      "the ladder is NOT the seed the corpus already trusts")
                rc = 1
            else:
                print("VERIFY IDENTICAL -- the new dumper reproduces the old one "
                      "byte for byte at a frame the old one can reach")
    if r.fails:
        rc = 1
    return rc


COMMANDS = {
    "ckpt": _cmd_ckpt,
    "verify": _cmd_verify, "landmarks": _cmd_landmarks, "trace": _cmd_trace,
    "snap": _cmd_snap, "seed": _cmd_seed, "scen": _cmd_scen, "gate": _cmd_gate,
    "inputlead": _cmd_inputlead, "rtc": _cmd_rtc, "drc": _cmd_drc,
    "seedstate": _cmd_seedstate, "pixred": _cmd_pixred,
    "objdriver": _cmd_objdriver, "overrun": _cmd_overrun,
    "gfx": _cmd_gfx, "zoomcov": _cmd_zoomcov, "check": _cmd_check,
    "sprites": _cmd_sprites, "sound": _cmd_sound,
    "flyaround": _cmd_flyaround, "spritecap": _cmd_spritecap,
    "shotgate": _cmd_shotgate,
    "pixslice": _cmd_pixslice, "pixdemo": _cmd_pixdemo,
    "demogate": _cmd_demogate, "shardgate": _cmd_shardgate,
    "dlgate": _cmd_dlgate, "ablate": _cmd_ablate,
    "shipgate": _cmd_shipgate, "firegate": _cmd_firegate,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        print(f"usage: {Path(__file__).name} {{{'|'.join(COMMANDS)}}} [args]")
        raise SystemExit(2)
    raise SystemExit(COMMANDS[sys.argv[1]](sys.argv[2:]))
