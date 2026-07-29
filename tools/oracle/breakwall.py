#!/usr/bin/env python3
"""Does walking INTO a breakable ($06) cell break it?  ROM: $1F25/$1FDB -> $1E65.

Warps the player next to a $06 column and holds a direction, then reports the
live $D000 cell bytes per frame plus how often loc_00_1E65 executed.

  python tools/oracle/breakwall.py --level 5 --warp 17,31 --hold right \
         --cell 18,31 --cell 18,30 --frames 90
"""
import argparse
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import ROM, FRAME_END, boot_to_gameplay  # noqa: E402

MAP = 0xD000


def cell_addr(col, row):
    # sub_00_11B9: $D000 + (col * 32 + row) * 2
    return MAP + ((col * 32 + row) * 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=5)
    ap.add_argument('--warp', default='17,31')
    ap.add_argument('--hold', default='right')
    ap.add_argument('--frames', type=int, default=90)
    ap.add_argument('--cell', action='append', default=[])
    args = ap.parse_args()

    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    iters = {'n': 0}
    per = {'break': 0}
    rows = []

    def on_frame(_):
        m = pb.memory
        cells = []
        for c in args.cell:
            col, row = (int(v) for v in c.split(','))
            a = cell_addr(col, row)
            cells.append((m[a], m[a + 1]))
        rows.append(dict(f=iters['n'], x=(m[0xFF81] << 8) | m[0xFF82],
                         y=(m[0xFF83] << 8) | m[0xFF84], vx=m[0xFF86],
                         air=m[0xFF80], brk=per['break'], cells=cells,
                         t0=m[0xC67B], t1=m[0xC67E]))
        per['break'] = 0
        iters['n'] += 1

    pb.hook_register(0, FRAME_END, on_frame, None)
    pb.hook_register(0, 0x1E65, lambda _: per.__setitem__('break', per['break'] + 1), None)

    boot_to_gameplay(pb, level=args.level)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start', 'select'):
        pb.button_release(n)
    base = iters['n']
    rows.clear()
    col, row = (int(v) for v in args.warp.split(','))
    pb.memory[0xFF81] = col
    pb.memory[0xFF82] = 0x80
    pb.memory[0xFF83] = row
    pb.memory[0xFF84] = 0

    pressed = False
    while iters['n'] - base < args.frames:
        if not pressed and iters['n'] - base >= 3:
            pb.button_press(args.hold)
            pressed = True
        pb.tick(1, False)

    print(' f    x      y     vx air brk  cells                 timers')
    for r in rows:
        cs = ' '.join(f'({g:02X},{c:02X})' for g, c in r['cells'])
        print(f"{r['f'] - base:3d} ${r['x']:04X} ${r['y']:04X} {r['vx']:4d} {r['air']:2d} "
              f"{r['brk']:2d}  {cs}   {r['t0']:3d} {r['t1']:3d}")
    pb.stop(save=False)


if __name__ == '__main__':
    main()
