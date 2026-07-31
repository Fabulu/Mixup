#!/usr/bin/env python3
"""Drive Mesen 2 headless from Python.

This is the thin layer every Gradius oracle tool sits on. It knows three things:

  1. Where Mesen is installed (MESEN_HOME, else the setup_mesen.py default).
  2. That `Mesen.exe --testRunner --enableStdout <script.lua> <rom.nes>` runs with
     no window at all - the test runner path in Mesen's Program.cs returns before
     Avalonia is ever started - and that the process exit code is whatever the
     script passed to `emu.stop(n)`.
  3. That `--enableStdout` is the only channel out of the Lua sandbox that does
     not need a file: Lua `print()` lands on the parent's stdout. (`emu.log()`
     does NOT; it goes to the script window, which does not exist headless.)

Everything the script wants to say is prefixed with a tag so the emulator's own
log noise ("[CPU] Uninitialized memory read: $07F0") can be filtered out.
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

TAG = "PROBE "

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_ROM = REPO_ROOT / "Gradius (USA).nes"


def mesen_home() -> Path:
    env = os.environ.get("MESEN_HOME")
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Mixup" / "mesen"
    return Path.home() / ".local" / "share" / "mixup" / "mesen"


def mesen_exe() -> Path:
    home = mesen_home()
    exe = home / ("Mesen.exe" if sys.platform == "win32" else "Mesen")
    if not exe.exists():
        raise SystemExit(
            f"Mesen not found at {exe}\n"
            f"Run: python {Path(__file__).with_name('setup_mesen.py')}"
        )
    if not (home / "settings.json").exists():
        raise SystemExit(
            f"{home / 'settings.json'} missing. Without it Mesen opens its first-run\n"
            f"setup wizard (a GUI window) instead of running headless.\n"
            f"Run: python {Path(__file__).with_name('setup_mesen.py')} --settings-only"
        )
    return exe


@dataclass
class Run:
    returncode: int
    stdout: str
    stderr: str
    lines: list[str] = field(default_factory=list)   # tagged lines, tag stripped
    log: list[str] = field(default_factory=list)     # everything else

    def fields(self) -> dict[str, str]:
        """Tagged lines of the form `key = value` as a dict."""
        out: dict[str, str] = {}
        for line in self.lines:
            if " = " in line:
                k, v = line.split(" = ", 1)
                out[k.strip()] = v.strip()
        return out


def run_script(script: Path, rom: Path = DEFAULT_ROM, *, timeout_s: int = 120,
               env_extra: dict[str, str] | None = None) -> Run:
    """Run a Lua script against a ROM, headless. Returns captured output."""
    if not rom.exists():
        raise SystemExit(f"ROM not found: {rom}  (supply your own; it is gitignored)")
    exe = mesen_exe()
    argv = [
        str(exe),
        "--testRunner",        # headless: TestRunner.Run returns before Avalonia starts
        "--enableStdout",      # Lua print() -> our stdout
        "--noaudio",
        "--novideo",
        # 0 means "no speed limit". Measured: 3000 frames in ~41s with the throttle
        # on vs ~35s off. It does not change a single output byte - the --twice
        # determinism check is run with this flag on.
        "--emulation.emulationSpeed=0",
        f"--timeout={timeout_s}",
        str(script.resolve()),
        str(rom.resolve()),
    ]
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    proc = subprocess.run(argv, capture_output=True, text=True,
                          timeout=timeout_s + 60, env=env)
    tagged, log = [], []
    for line in proc.stdout.splitlines():
        (tagged if line.startswith(TAG) else log).append(
            line[len(TAG):] if line.startswith(TAG) else line)
    return Run(proc.returncode, proc.stdout, proc.stderr, tagged, log)
