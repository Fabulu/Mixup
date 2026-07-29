#!/usr/bin/env python3
"""sub_00_0F56: the grounded draw-Y bob, measured off shadow OAM.

Levels 9/$0A/$0B subtract 3 (level 6: 2) from the DRAW Y of the player
($1D24, grounded = $FF80 == 0) and of every grounded enemy (1:$606F,
r[0] & 3 == 0) on frames where $FFB1 & 7 == 0, unpaused ($C716 == 0).

This idles on a level and logs, per frame: $FFB1, $FF80, $FF94 (the player's
OAM Y register), and the player's first OAM entry (tiles $00-$0B) plus the
first enemy OAM entry, so the bob's -N dips line up against the phase.

Usage:  python tools/oracle/bobprobe.py --level 9 --frames 40
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                    # noqa: E402
from trace import ROM, FRAME_END, boot_to_gameplay        # noqa: E402

SHADOW_OAM = 0xC000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=9)
    ap.add_argument('--frames', type=int, default=40)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    boot_to_gameplay(pyboy, level=args.level)

    rows = []
    fc = {'n': 0}

    def sample(_):
        m = pyboy.memory
        player = None
        enemy = None
        for i in range(40):
            b = SHADOW_OAM + i * 4
            y, x, t = m[b], m[b + 1], m[b + 2]
            if y == 0:
                continue
            if t <= 0x0B and player is None:
                player = (i, y, x, t)
            elif 0x40 <= t < 0xE0 and enemy is None:
                enemy = (i, y, x, t)
        rows.append({'f': fc['n'], 'ffb1': m[0xFFB1], 'air': m[0xFF80],
                     'ff94': m[0xFF94], 'player': player, 'enemy': enemy})

    pyboy.hook_register(0, FRAME_END, sample, None)
    for f in range(args.frames):
        fc['n'] = f
        pyboy.tick(1, False)

    for r in rows:
        p = r['player']
        e = r['enemy']
        phase = r['ffb1'] & 7
        print(f"f{r['f']:3d} ffb1=${r['ffb1']:02X} ph={phase} air={r['air']}"
              f" ff94={r['ff94']:3d}"
              f" playerOAM={'y=%d x=%d t=$%02X (slot %d)' % (p[1], p[2], p[3], p[0]) if p else '-'}"
              f" enemyOAM={'y=%d x=%d t=$%02X (slot %d)' % (e[1], e[2], e[3], e[0]) if e else '-'}")


if __name__ == '__main__':
    main()
