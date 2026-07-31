#!/usr/bin/env python3
"""Unattended install of MAME, the candidate reference emulator for phase 3.

No GUI, no admin rights, no clicking. Downloads the pinned official Windows
binary distribution, verifies its SHA-256 against the checksum MAME publishes
alongside the release, and extracts it into a private home folder OUTSIDE the
repo. Mirrors games/gradius/tools/oracle/setup_mesen.py in role and shape.

    python games/ddpdoj/tools/setup_mame.py

The official Windows "binary distribution" asset (mameXXXb_x64.exe) is a
7-Zip self-extracting archive. It is NOT an installer: running it would pop a
GUI extraction dialog. We never run it -- we extract it with 7-Zip or with
Python's own tooling, which is what makes the install unattended.

Nothing here is ROM-derived. Nothing here is written inside the repo.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# Pinned. 0.289 exists as a git tag on master but has NO published binary
# release as of 2026-07-31; 0.288 is the newest official Windows build.
MAME_VERSION = "0.288"
_BASE = "https://github.com/mamedev/mame/releases/download/mame0288"

RELEASES = {
    # machine -> (asset url, sha256 as published in the release's SHA256SUMS)
    "AMD64": (
        f"{_BASE}/mame0288b_x64.exe",
        "e4ae20a2359d716fb16824961b1b0fb28d8662ffd1298504edff39d368bb4a55",
    ),
    "ARM64": (
        f"{_BASE}/mame0288b_arm64.exe",
        "628886754e45e4cac7e5d3b638dcfc278c2efecd9d1cacc691d8c17bd74722c0",
    ),
}


def default_home() -> Path:
    """Where MAME gets installed. Deliberately outside the git repo."""
    env = os.environ.get("MAME_HOME")
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Mixup" / "mame"
    return Path.home() / ".local" / "share" / "mixup" / "mame"


def sevenzip() -> str | None:
    for cand in (
        shutil.which("7z"),
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ):
        if cand and Path(cand).exists():
            return str(cand)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--home", type=Path, default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if sys.platform != "win32":
        print("This pinned install is the Windows binary distribution.", file=sys.stderr)
        print("On other platforms use your package manager's `mame`.", file=sys.stderr)
        return 2

    arch = platform.machine().upper()
    if arch not in RELEASES:
        print(f"No pinned MAME asset for machine {arch!r}", file=sys.stderr)
        return 2
    url, want = RELEASES[arch]

    home = args.home or default_home()
    exe = home / "mame.exe"
    if exe.exists() and not args.force:
        print(f"MAME already installed: {exe}")
        return 0

    sevenz = sevenzip()
    if not sevenz:
        print(
            "7-Zip not found. The MAME binary asset is a 7-Zip SFX; without 7z the\n"
            "only way to unpack it is to RUN it, which opens a GUI dialog and is\n"
            "therefore not an option here. Install 7-Zip and re-run.",
            file=sys.stderr,
        )
        return 2

    home.mkdir(parents=True, exist_ok=True)
    sfx = home / Path(url).name
    print(f"downloading {url}")
    urllib.request.urlretrieve(url, sfx)

    got = hashlib.sha256(sfx.read_bytes()).hexdigest()
    print(f"sha256 {got}")
    if got != want:
        sfx.unlink(missing_ok=True)
        print(f"CHECKSUM MISMATCH, expected {want}", file=sys.stderr)
        return 1

    print(f"extracting with {sevenz} (no SFX dialog)")
    res = subprocess.run(
        [sevenz, "x", "-y", f"-o{home}", str(sfx)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if res.returncode != 0:
        print(res.stdout, file=sys.stderr)
        return 1
    sfx.unlink(missing_ok=True)

    ver = subprocess.run([str(exe), "-version"], capture_output=True, text=True)
    print(f"installed: {exe}")
    print(f"mame -version: {ver.stdout.strip()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
