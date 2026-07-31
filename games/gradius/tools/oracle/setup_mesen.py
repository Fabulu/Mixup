#!/usr/bin/env python3
"""Unattended install of the Mesen 2 reference emulator.

No GUI, no admin rights, no clicking. Downloads the pinned release, verifies its
SHA-256, extracts it into a private home folder OUTSIDE the repo, and writes the
settings.json that makes Mesen (a) skip its first-run setup wizard, (b) allow the
Lua sandbox to use `io`/`os`, and (c) power on deterministically.

    python games/gradius/tools/oracle/setup_mesen.py

Nothing here is ROM-derived. Nothing here is written inside the repo.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

MESEN_VERSION = "2.1.1"

# Pinned release assets. sha256 of the Windows zip was measured locally; the
# others are left None so a non-Windows run still works but says so out loud.
RELEASES = {
    "Windows": (
        "https://github.com/SourMesen/Mesen2/releases/download/2.1.1/Mesen_2.1.1_Windows.zip",
        "23ccc2bc060b663c68dad3a8c5d6da7d23a50f872d04f135bafa2b04ff7d5cbe",
    ),
    "Linux": (
        "https://github.com/SourMesen/Mesen2/releases/download/2.1.1/Mesen_2.1.1_Linux_x64.zip",
        None,
    ),
    "Darwin": (
        "https://github.com/SourMesen/Mesen2/releases/download/2.1.1/Mesen_2.1.1_macOS_x64_Intel.zip",
        None,
    ),
}


def default_home() -> Path:
    """Where Mesen gets installed. Deliberately outside the git repo."""
    env = os.environ.get("MESEN_HOME")
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Mixup" / "mesen"
    return Path.home() / ".local" / "share" / "mixup" / "mesen"


# Mesen keeps its whole configuration in one file next to the executable when it
# runs in portable mode. Every value below is here for a reason:
#
#   Debug.ScriptWindow.AllowIoOsAccess  - without it the Lua sandbox has no `io`
#       and no `os` table at all, so a script cannot write a framebuffer dump.
#       Measured: with it false, `type(io)` is "nil".
#   Debug.ScriptWindow.ScriptTimeout    - seconds a single Lua callback may run.
#   Nes.RamPowerOnState / Randomize*    - determinism. These are already the
#       Mesen defaults, but they are spelled out so that a stray value in a
#       user's own config can never silently make the oracle non-reproducible.
#   Nes.EnableHdPacks=false             - an installed HD pack would replace the
#       tiles and change every pixel we compare against.
#   Emulation.RunAheadFrames=0          - run-ahead re-simulates frames; it must
#       not be on under an oracle.
SETTINGS = {
    "Debug": {
        "ScriptWindow": {
            "AllowIoOsAccess": True,
            "AllowNetworkAccess": False,
            "ScriptTimeout": 3600,
            "AutoStartScriptOnLoad": True,
        }
    },
    "Nes": {
        "RamPowerOnState": "AllZeros",
        "RandomizeCpuPpuAlignment": False,
        "RandomizeMapperPowerOnState": False,
        "EnableHdPacks": False,
        "DisableGameDatabase": False,
        "Region": "Auto",
    },
    "Emulation": {
        "RunAheadFrames": 0,
        "EmulationSpeed": 100,
    },
    "Preferences": {
        "AutomaticallyCheckForUpdates": False,
        "DisableOsd": True,
        "SingleInstance": False,
    },
}


def write_settings(home: Path) -> Path:
    path = home / "settings.json"
    path.write_text(json.dumps(SETTINGS, indent=2), encoding="utf-8")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--home", type=Path, default=default_home(),
                    help="install directory (default: %(default)s)")
    ap.add_argument("--force", action="store_true", help="reinstall even if present")
    ap.add_argument("--settings-only", action="store_true",
                    help="just rewrite settings.json in an existing install")
    args = ap.parse_args()

    home: Path = args.home
    system = platform.system()
    if system not in RELEASES:
        print(f"unsupported platform: {system}", file=sys.stderr)
        return 2
    url, expected = RELEASES[system]
    exe = home / ("Mesen.exe" if system == "Windows" else "Mesen")

    home.mkdir(parents=True, exist_ok=True)

    if args.settings_only:
        print(f"settings -> {write_settings(home)}")
        return 0

    if exe.exists() and not args.force:
        print(f"already installed: {exe}")
    else:
        tmp = home / "_download.zip"
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, tmp)
        digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
        print(f"sha256 {digest}")
        if expected is None:
            print("  (no pinned hash for this platform - not verified)")
        elif digest != expected:
            tmp.unlink()
            print(f"HASH MISMATCH, expected {expected}", file=sys.stderr)
            return 3
        else:
            print("  matches pinned hash")
        with zipfile.ZipFile(tmp) as zf:
            zf.extractall(home)
        tmp.unlink()
        if system != "Windows":
            exe.chmod(0o755)
        print(f"installed: {exe}")

    print(f"settings -> {write_settings(home)}")
    print()
    print("Mesen home:", home)
    print("Set MESEN_HOME to override. Next:")
    print("  python games/gradius/tools/oracle/capability_probe.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
