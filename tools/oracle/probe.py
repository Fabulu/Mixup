#!/usr/bin/env python3
"""Probe the real ROM's boot path to find where gameplay actually begins.

The port starts directly in a level; the real game boots through the Sunsoft
logo, title and round-select screens first.  Before we can diff anything we
need to know exactly which frame gameplay starts on and what the player state
is at that moment.

Usage:  python tools/oracle/probe.py [--frames 1200]
"""
import argparse
import os
import sys

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

# Addresses from docs/00-MASTER-REFERENCE.md
A_AIR, A_XHI, A_XLO, A_YHI, A_YLO = 0xFF80, 0xFF81, 0xFF82, 0xFF83, 0xFF84
A_VX, A_VY, A_FACING = 0xFF86, 0xFF87, 0xFF88
A_HP, A_LEVEL, A_FRAME = 0xFF8A, 0xFFB0, 0xFFB1
A_CAMXHI, A_CAMXLO = 0xFFA2, 0xFFA3
A_ANIM = 0xFFC3
A_LIVES = 0xC767

MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=1200)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    hits = {'mainloop': 0, 'levelinit': 0, 'first_mainloop_frame': None,
            'last_levelinit_frame': None}

    def on_mainloop(ctx):
        hits['mainloop'] += 1
        if hits['first_mainloop_frame'] is None:
            hits['first_mainloop_frame'] = ctx['frame']

    def on_levelinit(ctx):
        hits['levelinit'] += 1
        hits['last_levelinit_frame'] = ctx['frame']

    ctx = {'frame': 0}
    pyboy.hook_register(0, MAIN_LOOP, lambda c: on_mainloop(c), ctx)
    pyboy.hook_register(0, LEVEL_INIT, lambda c: on_levelinit(c), ctx)

    print(f'{"frame":>6} {"lvl":>4} {"air":>4} {"X":>7} {"Y":>7} '
          f'{"vx":>4} {"vy":>4} {"fc":>3} {"hp":>3} {"anim":>5} '
          f'{"camX":>6} {"lives":>6}  mainloop')

    prev = None
    for f in range(args.frames):
        ctx['frame'] = f
        # Tap START every 30 frames to walk through logo / title / round select.
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)

        m = pyboy.memory
        row = (m[A_LEVEL], m[A_AIR],
               (m[A_XHI] << 8) | m[A_XLO], (m[A_YHI] << 8) | m[A_YLO],
               m[A_VX], m[A_VY], m[A_FACING], m[A_HP], m[A_ANIM],
               (m[A_CAMXHI] << 8) | m[A_CAMXLO], m[A_LIVES])

        if row != prev or f % 120 == 0:
            print(f'{f:6d} {row[0]:4d} {row[1]:4d} {row[2]:7d} {row[3]:7d} '
                  f'{row[4]:4d} {row[5]:4d} {row[6]:3d} {row[7]:3d} '
                  f'{row[8]:5d} {row[9]:6d} {row[10]:6d}  {hits["mainloop"]}')
            prev = row

    print()
    print(f'main-loop hits      : {hits["mainloop"]}')
    print(f'first main-loop frame: {hits["first_mainloop_frame"]}')
    print(f'level-init hits     : {hits["levelinit"]} '
          f'(last at frame {hits["last_levelinit_frame"]})')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
