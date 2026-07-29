#!/usr/bin/env python3
"""Dump the cartridge's live $9800 BG tilemap after N gameplay frames.

The port samples the level MAP through the metatile table instead of modelling
the column streamer.  That is only equivalent if every tilemap cell the screen
shows came from the streamer.  This prints the real thing so the two can be
compared cell for cell.
"""
import argparse
import importlib.util
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
FRAME_END = 0x0A4F


def _load():
    p = os.path.join(ROOT, 'tools', 'oracle', 'trace.py')
    s = importlib.util.spec_from_file_location('_roj_tm_trace', p)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


OT = _load()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=9)
    ap.add_argument('--frames', type=int, default=40)
    ap.add_argument('--script', default='20:,180:R')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    timeline = OT.parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    count = {'n': 0}
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)
    OT.boot_to_gameplay(pyboy, level=args.level)
    for name in set(OT.BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, count['n'] - 1)
    held = set()
    guard = 0
    while count['n'] - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = count['n'] - base
        nxt = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for n in nxt - held:
            pyboy.button_press(n)
        for n in held - nxt:
            pyboy.button_release(n)
        held = nxt
        pyboy.tick(1, False)

    mem = pyboy.memory
    tm = list(mem[0x9800:0x9C00])
    win = list(mem[0x9C00:0xA000])
    regs = {'SCX': mem[0xFF43], 'SCY': mem[0xFF42], 'LCDC': mem[0xFF40],
            'camXhi': mem[0xFFA2], 'camXlo': mem[0xFFA3],
            'camYhi': mem[0xFFA4], 'camYlo': mem[0xFFA5]}
    print(f'level {args.level} after {args.frames} frames  regs={regs}')
    for r in range(32):
        print(f'{r:2d} ' + ' '.join(f'{tm[r * 32 + c]:02X}' for c in range(32)))
    if args.out:
        p = os.path.join(ROOT, args.out)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as fh:
            json.dump({'level': args.level, 'frames': args.frames,
                       'bg': tm, 'window': win, 'regs': regs}, fh)
        print('wrote', p)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
