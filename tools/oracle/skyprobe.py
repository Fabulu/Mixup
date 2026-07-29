#!/usr/bin/env python3
"""What IS the $05A6 metasprite (E=$34, BC=$1880, attr $10, levels 9/$0A/$0B)?

sub_00_0F56's sibling mystery: the main loop draws metasprite $34 at OAM
(24, 128) on the three parallax-sky levels, every frame, even paused, and the
port draws nothing there. This dumps, from the running cartridge on a chosen
level:

  * every shadow-OAM entry whose tile is in $E0..$E3 (the metasprite's tiles),
  * the decoded 8x16 pixels of OBJ tiles $E0-$E3 as ASCII art,
  * a PNG crop of the screen region the metasprite covers.

Usage:  python tools/oracle/skyprobe.py --level 9
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                    # noqa: E402
from trace import ROM, boot_to_gameplay                    # noqa: E402

SHADOW_OAM = 0xC000


def decode_tile(mem, base):
    rows = []
    for y in range(8):
        lo = mem[base + y * 2]
        hi = mem[base + y * 2 + 1]
        row = ''
        for x in range(7, -1, -1):
            ci = ((hi >> x) & 1) * 2 + ((lo >> x) & 1)
            row += ' .#@'[ci]
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=9)
    ap.add_argument('--settle', type=int, default=90)
    ap.add_argument('--shot', default='rip/oracle/skyprobe.png')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    boot_to_gameplay(pyboy, level=args.level)
    for _ in range(args.settle):
        pyboy.tick(1, True)

    m = pyboy.memory
    print(f'level ${m[0xFFB0]:02X}  frame ${m[0xFFB1]:02X}')
    hits = []
    for i in range(40):
        b = SHADOW_OAM + i * 4
        y, x, t, a = m[b], m[b + 1], m[b + 2], m[b + 3]
        if 0xE0 <= t <= 0xE3:
            hits.append((i, y, x, t, a))
    print('shadow-OAM entries with tiles $E0-$E3:')
    for i, y, x, t, a in hits:
        print(f'  slot {i:2d}: OAM y={y:3d} x={x:3d} tile=${t:02X} attr=${a:02X}'
              f'  (screen {x-8},{y-16})')

    # OBJ tiles at $8000 + tile*16 (8x16 mode pairs E0/E1 and E2/E3).
    for t in (0xE0, 0xE1, 0xE2, 0xE3):
        print(f'OBJ tile ${t:02X}:')
        for row in decode_tile(m, 0x8000 + t * 16):
            print('   ' + row)

    pyboy.screen.image.save(args.shot)
    print('wrote', args.shot)


if __name__ == '__main__':
    main()
