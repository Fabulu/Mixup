#!/usr/bin/env python3
"""Drive MAME headless from Python.

The thin layer every MAME-based probe sits on. It knows three things:

  1. Where MAME is installed (MAME_HOME, else the setup_mame.py default).
  2. The exact flag set that makes MAME run with NO window and exit on its own:

         -video none -sound none -nothrottle -seconds_to_run N
         -autoboot_script <script.lua> -autoboot_delay 0
         -nomouse -nokeyboard_provider ... (see HEADLESS below)

     `-video none` is the load-bearing one: MAME's OSD then creates no window at
     all. Unlike Mesen, MAME needs no undocumented mode -- `-video none` is a
     documented option and it genuinely opens nothing.

  3. That Lua `print()` inside an -autoboot_script lands on the parent's stdout,
     so a tag prefix is all that is needed to separate probe output from MAME's
     own chatter.

A NOTE ON -debug: the Lua bindings `device.debug` (bpset/wpset) and
`machine.debugger` are nil unless MAME is started with -debug. -debug on
Windows defaults to the `windows` debugger, which DOES open a window. Pass
`-debugger none` alongside it to keep the run headless. We only need -debug for
the breakpoint API; the execution-hook route used by capability_probe.lua
(memory taps) needs no debugger at all.
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

TAG = "PROBE "

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ROM = REPO_ROOT / "Gradius (USA).nes"


def mame_home() -> Path:
    env = os.environ.get("MAME_HOME")
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Mixup" / "mame"
    return Path.home() / ".local" / "share" / "mixup" / "mame"


def mame_exe() -> Path:
    home = mame_home()
    exe = home / ("mame.exe" if sys.platform == "win32" else "mame")
    if not exe.exists():
        raise SystemExit(
            f"MAME not found at {exe}\n"
            f"Run: python {Path(__file__).with_name('setup_mame.py')}"
        )
    return exe


@dataclass
class Run:
    """Result of one headless MAME run."""

    returncode: int
    stdout: str
    stderr: str
    lines: list[str] = field(default_factory=list)  # TAG-prefixed lines, tag stripped
    argv: list[str] = field(default_factory=list)


def run_nes(
    script: Path,
    *,
    rom: Path = DEFAULT_ROM,
    seconds: int = 10,
    debugger: bool = False,
    snapshot_dir: Path | None = None,
    extra: list[str] | None = None,
    timeout: int = 600,
) -> Run:
    """Boot `rom` on MAME's NES driver, headless, running `script`."""
    if not rom.exists():
        raise SystemExit(f"ROM not found: {rom}")

    exe = mame_exe()
    argv = [
        str(exe),
        "nes",
        "-cart",
        str(rom),
        "-video",
        "none",
        "-sound",
        "none",
        "-nothrottle",
        "-seconds_to_run",
        str(seconds),
        "-autoboot_script",
        str(script),
        "-autoboot_delay",
        "0",
        # boolean options take the -no prefix, not a value; passing "-nvram_save 0"
        # makes MAME read the "0" as a software-list item and abort.
        "-nonvram_save",
        "-noautosave",
    ]
    if debugger:
        # -debug is what makes machine.debugger / device.debug non-nil.
        # -debugger none is what stops it opening the Windows debugger window.
        argv += ["-debug", "-debugger", "none"]
    if snapshot_dir is not None:
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        argv += ["-snapshot_directory", str(snapshot_dir)]
    if extra:
        argv += extra

    res = subprocess.run(
        argv,
        cwd=str(mame_home()),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    lines = [
        ln[len(TAG):] for ln in res.stdout.splitlines() if ln.startswith(TAG)
    ]
    return Run(res.returncode, res.stdout, res.stderr, lines, argv)
