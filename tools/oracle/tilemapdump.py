#!/usr/bin/env python3
"""Dump the cartridge's live $9800 BG tilemap after N gameplay frames.

The port samples the level MAP through the metatile table instead of modelling
the column streamer.  That is only equivalent if every tilemap cell the screen
shows came from the streamer.  This prints the real thing so the two can be
compared cell for cell.

SAMPLE POINT.  Everything here is read INSIDE the $0A4F hook -- the main
loop's VBlank wait -- and never at the PyBoy tick boundary, for the reason
trace.py's own docstring gives: a tick boundary slices the main loop mid-head,
so some ticks contain two executions of the camera routine and some contain
none.  Reading $FFA2-$FFA5/SCX/SCY there returns the NEXT iteration's camera
next to this iteration's player fields.  Measured on this exact scenario
(80 frames, '20:,180:R'):

    level 5 f80   hook camX,camY = 16,284  SCY 22     tick = 16,288  SCY 28
    level 2 f80   hook camX,camY = 16,325  SCY 67     tick = 17,326  SCY 69

The port's tick() output at f80 is 16,284 and 16,325 -- i.e. the hook values,
exactly.  With the tick-boundary read those two levels reported CAMERA
MISMATCH in bgartdiff.mjs and were skipped, which is why levels 2 and 5 had no
background-art coverage at all.  The $9800 bytes themselves are identical at
the two points (verified frame by frame); only the camera/scroll registers
move, and those are what places the sampling window.
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
    shots = {}

    def snap(_):
        count['n'] += 1
        mem = pyboy.memory
        shots[count['n']] = {
            'bg': list(mem[0x9800:0x9C00]),
            'window': list(mem[0x9C00:0xA000]),
            'regs': {'SCX': mem[0xFF43], 'SCY': mem[0xFF42], 'LCDC': mem[0xFF40],
                     # $FFA9/$FFAA -- the scroll the ISR programs for the TOP
                     # of the frame.  rSCX/rSCY themselves are whatever the
                     # last raster arm left, which on level 6 is the $FFCC
                     # track band: rSCX reads $C0 at $0A4F while $FFA9 is $10.
                     # rastertrace.py's frame grouping says the same thing --
                     # "the registers came from iteration N's $FFA9/$FFAA,
                     # which is exactly the pair one port tick() produces".
                     'scxBase': mem[0xFFA9], 'scyBase': mem[0xFFAA],
                     'camXhi': mem[0xFFA2], 'camXlo': mem[0xFFA3],
                     'camYhi': mem[0xFFA4], 'camYlo': mem[0xFFA5]},
        }
        # Only the frame being reported and its neighbour are ever read; keep
        # the dict small so an 80-frame run does not hold 80 x 2 KB.
        shots.pop(count['n'] - 3, None)

    pyboy.hook_register(0, FRAME_END, snap, None)
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

    shot = shots.get(base + args.frames)
    if shot is None:
        raise RuntimeError(
            f'no $0A4F sample for iteration {args.frames} '
            f'(have {sorted(k - base for k in shots)})')
    tm = shot['bg']
    win = shot['window']
    regs = shot['regs']
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
