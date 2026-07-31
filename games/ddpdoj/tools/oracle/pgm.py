#!/usr/bin/env python3
"""Drive MAME headless on the IGS PGM board (DoDonPachi DaiOuJou).

The thin layer every PGM probe sits on. `games/ddpdoj/tools/mame.py` is the NES
equivalent; this one knows the four extra things that turned out to matter on
this driver, all of them measured:

  1. -rompath must point at the romset directory (C:\\oldpcsx2 on this machine).
     ddpdojblk verifies BAD for exactly one reason -- ddp3blk_defaults.nv has
     the wrong checksum -- and boots anyway with a warning on stderr.
     ddp3_igs027a.bin is NO GOOD DUMP KNOWN and MAME simulates that device.

  2. RUNS ARE ONLY DETERMINISTIC IF YOU ISOLATE MAME'S WRITABLE STATE.
     Two runs of the same script with MAME's default directories produced
     different traces; with -noreadconfig -nowriteconfig and private
     -cfg_directory / -nvram_directory they are byte-identical. MAME rewrites
     <cfg_directory>/ddpdojblk.cfg on exit, and another process using the same
     MAME install can rewrite it underneath you.

  3. MSYS/Git-Bash MANGLES ARGUMENTS THAT LOOK LIKE PATH LISTS. Passing
     PROBE_SAVE="120:/c/tmp/st.bin" silently became something io.open could not
     open, with no error but a nil file handle. Pass Windows paths.

  4. Lua notifier subscriptions and memory-tap handles are BOTH garbage
     collected if you drop them. A script that forgets either produces
     completely empty output and no diagnostic whatsoever.
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

TAG = "PROBE "

HERE = Path(__file__).resolve().parent
DEFAULT_SET = "ddpdojblk"
DEFAULT_ROMPATH = Path(os.environ.get("PGM_ROMPATH", r"C:\oldpcsx2"))


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
    d = Path(os.environ.get("PGM_SCRATCH", Path(os.environ.get("TEMP", "/tmp")) / "mixup-pgm"))
    for sub in ("cfg", "nvram", "snap", "out"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    return d


@dataclass
class Run:
    returncode: int
    stdout: str
    stderr: str
    lines: list[str] = field(default_factory=list)
    argv: list[str] = field(default_factory=list)


def run(
    script: Path,
    *,
    machine: str = DEFAULT_SET,
    seconds: int = 120,
    env: dict[str, str] | None = None,
    debugger: bool = False,
    extra: list[str] | None = None,
    timeout: int = 1800,
) -> Run:
    sc = scratch()
    argv = [
        str(mame_exe()), machine,
        "-rompath", str(DEFAULT_ROMPATH),
        "-video", "none",
        "-sound", "none",
        "-nothrottle",
        "-skip_gameinfo",
        "-seconds_to_run", str(seconds),
        "-autoboot_script", str(script),
        "-autoboot_delay", "0",
        # boolean options take a -no prefix, never a value
        "-nonvram_save",
        "-noautosave",
        # determinism: never read or write the shared config, and keep MAME's
        # writable directories out of the install
        "-noreadconfig",
        "-nowriteconfig",
        "-cfg_directory", str(sc / "cfg"),
        "-nvram_directory", str(sc / "nvram"),
        "-snapshot_directory", str(sc / "snap"),
    ]
    if debugger:
        # -debug is what makes machine.debugger non-nil; -debugger none is what
        # stops it opening a window.
        argv += ["-debug", "-debugger", "none"]
    if extra:
        argv += extra
    e = dict(os.environ)
    if env:
        e.update(env)
    res = subprocess.run(
        argv, cwd=str(mame_home()), capture_output=True, text=True,
        timeout=timeout, env=e,
    )
    lines = [ln[len(TAG):] for ln in res.stdout.splitlines() if ln.startswith(TAG)]
    return Run(res.returncode, res.stdout, res.stderr, lines, argv)


def trace(out_tsv: Path, *, frames: int = 600, buttons: str = "",
          load: Path | None = None, machine: str = DEFAULT_SET,
          pixels: bool = False, seconds: int = 600) -> Run:
    """Run the per-frame state probe and write a TSV."""
    env = {"PROBE_FRAMES": str(frames), "PROBE_OUT": str(out_tsv)}
    if buttons:
        env["PROBE_INPUT"] = buttons
    if load:
        env["PROBE_LOAD"] = str(load)
    if pixels:
        env["PROBE_PIXELS"] = "1"
    return run(HERE / "frame.lua", machine=machine, seconds=seconds, env=env)


def _cmd_trace(argv: list[str]) -> int:
    frames = int(argv[0]) if argv else 300
    out = scratch() / "out" / "trace.tsv"
    r = trace(out, frames=frames)
    for ln in r.lines:
        print(ln)
    print(f"wrote {out}")
    return r.returncode


def _cmd_determinism(argv: list[str]) -> int:
    """Two identical runs must produce byte-identical output."""
    import hashlib
    frames = int(argv[0]) if argv else 200
    digests = []
    for i in (1, 2):
        out = scratch() / "out" / f"det{i}.tsv"
        r = trace(out, frames=frames)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:])
            return 1
        digests.append(hashlib.sha256(out.read_bytes()).hexdigest())
        print(f"run {i}: {digests[-1]}  {out}")
    ok = digests[0] == digests[1]
    print("IDENTICAL" if ok else "DIVERGED")
    return 0 if ok else 1


def _cmd_inputlead(argv: list[str]) -> int:
    """Press P1 Button 1 at logic frame N; report when the game's mirror moves."""
    at = int(argv[0]) if argv else 100
    out = scratch() / "out" / "lead.tsv"
    r = trace(out, frames=at + 20, buttons=f"{at}=A")
    if r.returncode != 0:
        print(r.stdout[-2000:])
        return 1
    rows = [ln.split("\t") for ln in out.read_text().splitlines()]
    cols = {n: i for i, n in enumerate(rows[0])}
    first = None
    for row in rows[1:]:
        if int(row[cols["p1raw"]]) != 0:
            first = int(row[cols["lf"]])
            break
    print(f"applied at logic frame {at}; game input mirror $803970 first non-zero "
          f"at logic frame {first}; lead = {None if first is None else first - at - 1} "
          f"extra frames")
    return 0


COMMANDS = {"trace": _cmd_trace, "determinism": _cmd_determinism,
            "inputlead": _cmd_inputlead}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(f"usage: {Path(__file__).name} {{{'|'.join(COMMANDS)}}} [args]")
        raise SystemExit(2)
    raise SystemExit(COMMANDS[sys.argv[1]](sys.argv[2:]))
