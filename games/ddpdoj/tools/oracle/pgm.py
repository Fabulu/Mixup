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
import shutil
import subprocess
import sys
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


def build_script(defs: dict, s: dict) -> str:
    pre = defs["bootPrefix"][s.get("boot", "versionB")]
    return (pre + ";" + s["tail"]) if s.get("tail") else pre


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


COMMANDS = {
    "verify": _cmd_verify, "landmarks": _cmd_landmarks, "trace": _cmd_trace,
    "snap": _cmd_snap, "seed": _cmd_seed, "scen": _cmd_scen, "gate": _cmd_gate,
    "inputlead": _cmd_inputlead, "rtc": _cmd_rtc, "drc": _cmd_drc,
    "seedstate": _cmd_seedstate, "pixred": _cmd_pixred,
    "objdriver": _cmd_objdriver, "overrun": _cmd_overrun,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        print(f"usage: {Path(__file__).name} {{{'|'.join(COMMANDS)}}} [args]")
        raise SystemExit(2)
    raise SystemExit(COMMANDS[sys.argv[1]](sys.argv[2:]))
