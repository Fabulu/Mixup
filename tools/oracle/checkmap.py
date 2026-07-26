#!/usr/bin/env python3
"""Diff our exported level map against the real game's $D000 image.

sub_00_0C34 expands the bank-3 map into $D000 as 2 bytes per cell. If our
extraction is right, the two are byte-identical. Any mismatch means the
collision LUT, the map pointer, or the expansion is wrong -- which shows up as
the player walking through walls.

Usage:  python tools/oracle/checkmap.py [--level 1]
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    args = ap.parse_args()

    ours = open(os.path.join(ROOT, f'assets/levels/{args.level:02d}.map.bin'), 'rb').read()
    width = len(ours) // 32

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    started = {'v': False}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for _ in range(4):
        pyboy.tick(1, False)

    real = bytes(pyboy.memory[0xD000:0xD000 + len(ours)])

    print(f'level {args.level}: width {width} metatiles, {len(ours)} bytes')
    if real == ours:
        print('EXACT MATCH with $D000')
        pyboy.stop(save=False)
        return

    tiles = sum(1 for i in range(0, len(ours), 2) if real[i] != ours[i])
    colls = sum(1 for i in range(1, len(ours), 2) if real[i] != ours[i])
    print(f'MISMATCH: {tiles} tile-id bytes, {colls} collision bytes differ\n')

    print(f'{"col":>4}{"row":>5}{"ourTile":>9}{"realTile":>9}'
          f'{"ourColl":>9}{"realColl":>9}')
    shown = 0
    for col in range(width):
        for row in range(16):
            i = (col * 16 + row) * 2
            if real[i] == ours[i] and real[i + 1] == ours[i + 1]:
                continue
            print(f'{col:4d}{row:5d}{ours[i]:9d}{real[i]:9d}'
                  f'{ours[i+1]:9d}{real[i+1]:9d}')
            shown += 1
            if shown >= 30:
                print('  ... (truncated)')
                pyboy.stop(save=False)
                return
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
