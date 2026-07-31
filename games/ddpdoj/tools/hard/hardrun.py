#!/usr/bin/env python3
"""Headless MAME runner for the SLOWDOWN + RANK recon probes.

Deliberately self-contained rather than importing tools/pgm.py: another agent is
writing tools/oracle/ and tools/pgm.py at the same time as this recon, and a
shared module that changes mid-run makes a measurement unreproducible.

All output goes to hard/out/, which is gitignored -- everything a probe prints
here is derived from the board image.
"""
from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

TAG = "PROBE "
HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
DEFAULT_ROMPATH = Path(os.environ.get("MIXUP_ROMPATH", r"C:\oldpcsx2"))
DEFAULT_SET = "ddpdojblk"


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


@dataclass
class Run:
    returncode: int
    stdout: str
    stderr: str
    lines: list[str] = field(default_factory=list)
    argv: list[str] = field(default_factory=list)


def run(script, *, romset=DEFAULT_SET, seconds=20, debugger=False,
        env=None, extra=None, timeout=3600, rompath=DEFAULT_ROMPATH) -> Run:
    argv = [
        str(mame_exe()), romset,
        "-rompath", str(rompath),
        "-video", "none", "-sound", "none", "-nothrottle", "-skip_gameinfo",
        "-seconds_to_run", str(seconds),
        "-autoboot_script", str(Path(script).resolve()),
        "-autoboot_delay", "0",
        "-nonvram_save", "-noautosave",
    ]
    if debugger:
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


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("script", type=Path)
    ap.add_argument("--set", dest="romset", default=DEFAULT_SET)
    ap.add_argument("--seconds", type=int, default=20)
    ap.add_argument("--debugger", action="store_true")
    ap.add_argument("--env", action="append", default=[])
    ap.add_argument("--save", type=Path, default=None)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    env = dict(kv.split("=", 1) for kv in a.env)
    r = run(a.script, romset=a.romset, seconds=a.seconds,
            debugger=a.debugger, env=env)
    body = "\n".join(r.lines)
    print(f"# rc={r.returncode} probe-lines={len(r.lines)}")
    print(body)
    if a.save:
        a.save.parent.mkdir(parents=True, exist_ok=True)
        a.save.write_text(body + "\n", encoding="utf-8")
    if r.returncode != 0 or not r.lines:
        sys.stderr.write("---- MAME stdout tail ----\n" + r.stdout[-3000:] +
                         "\n---- stderr tail ----\n" + r.stderr[-3000:] + "\n")
    return 0 if r.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
