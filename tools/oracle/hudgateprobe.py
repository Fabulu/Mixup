#!/usr/bin/env python3
"""Cartridge side of hudgate.mjs: is the energy bar really hidden while
$C740 != $FF -- during a boss countdown, and for level 14's entrance?

Logs per frame: $C740, $C750, and whether shadow OAM holds the HUD bar
(a sprite at OAM y=$10, x=$18 -- BC=$1810 at $0F7B).

Usage:
  python tools/oracle/hudgateprobe.py --level 4 --frames 400 --kill 30
  python tools/oracle/hudgateprobe.py --level 14 --frames 300
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                    # noqa: E402
from trace import ROM, FRAME_END, boot_to_gameplay        # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=4)
    ap.add_argument('--frames', type=int, default=400)
    ap.add_argument('--kill', type=int, default=0)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    boot_to_gameplay(pyboy, level=args.level)

    rows = []
    fc = {'n': 0}

    def sample(_):
        m = pyboy.memory
        hud = 0
        for i in range(40):
            b = 0xC000 + i * 4
            # MEASURED on level 4: the bar is five sprites at OAM y=24,
            # x=16..48, tile $30, attr $10 (screen y=8 -- the metasprite
            # carries the +16/+8 OAM bias itself).
            if m[b] == 24 and 16 <= m[b + 1] <= 96:
                hud += 1
        rows.append((fc['n'], m[0xC740], m[0xC750], hud))

    pyboy.hook_register(0, FRAME_END, sample, None)
    for f in range(args.frames):
        fc['n'] = f
        if args.kill and f == args.kill:
            # zero the boss's HP byte, drops.py style: slot 0 +$16
            pyboy.memory[0xC268 + 0x16] = 0
        pyboy.tick(1, False)

    prev = None
    for f, c740, c750, hud in rows:
        row = f'C740=${c740:02X} C750=${c750:02X} hudEntries={hud}'
        if row != prev:
            print(f'f{f:4d} {row}')
            prev = row


if __name__ == '__main__':
    main()
