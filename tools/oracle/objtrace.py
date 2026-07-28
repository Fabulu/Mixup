#!/usr/bin/env python3
"""Cartridge-side reference trace for the $C1E8 MAP-OBJECT array.

trace.py samples a fixed state vector that carries only four bytes of two
object slots. Porting the remaining map-object handlers needs the whole array:
all 8 records, all 16 bytes, every frame -- including the +9/+$0A screen
position cache the overlap scan compares against (loc_00_2426), which is the
one field an object can get wrong while still LOOKING right on screen.

So this is a second, narrower oracle rather than more fields bolted onto the
shared one: it reuses trace.py's boot path, sampling hook and input lead
verbatim (imported, not copied) and dumps $C1E8-$C267 raw.

It also records $C757 (the lag-frame flag) per frame, because the actor driver
skips its updates on a lag frame ($424D) and a scenario must be capped just
short of the first one -- see docs/03-VERIFICATION.md section 28.

Usage:
  python tools/oracle/objtrace.py --level 3 --frames 200 --script "200:"
  python tools/oracle/objtrace.py --level 3 --frames 200 --warp 18,24
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pyboy import PyBoy                                   # noqa: E402
from trace import (ROM, ROOT, FRAME_END, BUTTONS,         # noqa: E402
                   boot_to_gameplay, parse_script)

OBJ_BASE = 0xC1E8
SLOTS = 8
RECORD = 16
LAG = 0xC757          # $C757 -- set when VBlank beat the main loop
PARALLAX = 0xFFCA     # the level-6 track $0B slaves its X to
CONVEYOR = 0xFFC9     # its direction byte, written by loc_00_2EF4


def sample(mem):
    return {
        'x': (mem[0xFF81] << 8) | mem[0xFF82],
        'y': (mem[0xFF83] << 8) | mem[0xFF84],
        'vx': mem[0xFF86], 'vy': mem[0xFF87],
        'air': mem[0xFF80],
        'camX': (mem[0xFFA2] << 8) | mem[0xFFA3],
        'camY': (mem[0xFFA4] << 8) | mem[0xFFA5],
        'hp': mem[0xFF8A],
        'carryX': mem[0xC72F], 'carryY': mem[0xC730],
        'lag': mem[LAG],
        'track': (mem[PARALLAX] << 8) | mem[PARALLAX + 1],
        'dir': mem[CONVEYOR],
        'obj': [mem[OBJ_BASE + i] for i in range(SLOTS * RECORD)],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=200)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=3)
    ap.add_argument('--out', default='rip/oracle')
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--warp', default=None, metavar='COL[,ROW]')
    ap.add_argument('--cells', default=None, metavar='COL,ROW[;COL,ROW...]',
                    help='also sample these $D000 map cells (graphic, '
                         'collision) each frame -- types 6 and 9 are TERRAIN, '
                         'so their real output is in the map, not the record')
    args = ap.parse_args()

    script = args.script or f'{args.frames}:'
    timeline = parse_script(script)
    cells = []
    if args.cells:
        for pair in args.cells.split(';'):
            c, r = pair.split(',')
            cells.append((int(c), int(r)))

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    samples = []

    def take(_):
        row = sample(pyboy.memory)
        # $D000 + col*$20 + (row & $0F)*2  -- sub_00_11B9, column-major.
        row['cells'] = [pyboy.memory[0xD000 + c * 0x20 + (r & 0x0F) * 2 + k]
                        for (c, r) in cells for k in (0, 1)]
        samples.append(row)

    pyboy.hook_register(0, FRAME_END, take, None)

    boot_frame = boot_to_gameplay(pyboy, level=args.level)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)

    # boot_to_gameplay returns having already run the first gameplay iteration.
    base = max(0, len(samples) - 1)

    if args.ammo is not None:
        pyboy.memory[0xC759] = args.ammo & 0xFF
    if args.warp is not None:
        parts = args.warp.split(',')
        pyboy.memory[0xFF81] = int(parts[0]) & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = int(parts[1]) & 0xFF
            pyboy.memory[0xFF84] = 0x00

    held = set()
    guard = 0
    while len(samples) - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = len(samples) - base
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    trace = []
    for i, row in enumerate(samples[base:base + args.frames]):
        row['f'] = i + 1
        trace.append(row)

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, f'objtrace_L{args.level:02d}.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'script': script,
                   'level': args.level, 'cells': cells,
                   'bootFrame': boot_frame, 'frames': trace}, fh)

    lags = [t['f'] for t in trace if t['lag']]
    print(f'level {args.level}, {len(trace)} frames, script "{script}"')
    print(f'lag frames ($C757): {lags if lags else "none"}')
    print(f'wrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
