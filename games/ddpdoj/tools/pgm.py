#!/usr/bin/env python3
"""Drive MAME headless on the PGM (DoDonPachi DaiOuJou) driver.

Sibling of `mame.py`, which drives the NES driver. Same three facts:
  1. where MAME lives,
  2. the exact flag set that opens no window and exits on its own,
  3. `print()` from an -autoboot_script lands on our stdout, so a tag is enough.

Nothing ROM-derived is written into the repo -- probe artifacts go to a scratch
directory outside it (MIXUP_SCRATCH, else the system temp).

Default set is `ddpdojblk` (Black Label), the owner's port target
(games/ddpdoj/NOTES-versions.md).
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

TAG = "PROBE "

DEFAULT_SET = "ddpdojblk"
DEFAULT_ROMPATH = Path(os.environ.get("MIXUP_ROMPATH", r"C:\oldpcsx2"))


def mame_home() -> Path:
    env = os.environ.get("MAME_HOME")
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Mixup" / "mame"
    return Path.home() / ".local" / "share" / "mixup" / "mame"


def mame_exe() -> Path:
    exe = mame_home() / ("mame.exe" if sys.platform == "win32" else "mame")
    if not exe.exists():
        raise SystemExit(f"MAME not found at {exe}")
    return exe


def scratch() -> Path:
    env = os.environ.get("MIXUP_SCRATCH")
    d = Path(env) if env else Path(tempfile.gettempdir()) / "mixup-ddpdoj"
    d.mkdir(parents=True, exist_ok=True)
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
    romset: str = DEFAULT_SET,
    rompath: Path = DEFAULT_ROMPATH,
    seconds: int = 20,
    debugger: bool = False,
    env: dict[str, str] | None = None,
    snapshot_dir: Path | None = None,
    extra: list[str] | None = None,
    timeout: int = 1800,
    nvram_dir: Path | None = None,
) -> Run:
    # MEASURED 2026-07-31: a stale nvram/<set>/sram left behind by an earlier run
    # makes ddpdojblk boot to a full-screen "ROM ERROR !" and sit there forever.
    # -nonvram_save stops MAME WRITING nvram; it does NOT stop it READING an
    # existing file. So every run gets its own empty nvram directory and the
    # factory defaults from the "sram" ROM region are used. Without this the
    # harness is not reproducible and the failure looks like a bad dump.
    if nvram_dir is None:
        nvram_dir = scratch() / "nvram-clean"
    nvram_dir.mkdir(parents=True, exist_ok=True)

    # MEASURED 2026-07-31: MAME writes cfg/<set>.cfg on exit EVEN THOUGH
    # `-showconfig` reports `writeconfig 0` (that option governs the .ini, not the
    # per-system cfg). The file it wrote for ddpdojblk carried
    #     <counters><coins index="0" number="10"/></counters>
    # i.e. a coin count ACCUMULATED ACROSS RUNS. cfg also carries DIP-switch and
    # input state, so a run is not hermetic unless this is redirected too. Two
    # early runs of this session diverged and one booted into the INPUT TEST
    # service screen; this is the only cross-run channel found. Give every run a
    # fresh cfg directory and delete it first.
    cfg_dir = scratch() / "cfg-clean"
    if cfg_dir.exists():
        for p in cfg_dir.iterdir():
            if p.is_file():
                p.unlink()
    cfg_dir.mkdir(parents=True, exist_ok=True)

    argv = [
        str(mame_exe()),
        romset,
        "-rompath", str(rompath),
        "-video", "none",
        "-sound", "none",
        "-nothrottle",
        "-skip_gameinfo",
        "-seconds_to_run", str(seconds),
        # MAME's cwd is mame_home, not ours -- the script path MUST be absolute.
        "-autoboot_script", str(Path(script).resolve()),
        "-autoboot_delay", "0",
        # boolean options take a -no prefix, never a value (NOTES-mame-oracle.md §6.3)
        "-nonvram_save",
        "-noautosave",
        "-nvram_directory", str(nvram_dir),
        "-cfg_directory", str(cfg_dir),
    ]
    if debugger:
        # -debug makes machine.debugger non-nil; -debugger none stops it opening a window.
        argv += ["-debug", "-debugger", "none"]
    if snapshot_dir is not None:
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        argv += ["-snapshot_directory", str(snapshot_dir)]
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
