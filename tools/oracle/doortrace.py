#!/usr/bin/env python3
"""Cartridge-side reference trace for the DOOR/GATE sequencer and its pools.

The door subsystem is four pieces of RAM that no existing harness samples:

  $C733/$C734/$C735   the sequencer phase and the door's bottom-left cell
  $C60B-$C61A         the debris pool, 4 x 4 B {Xhi, Xlo, Yhi, Ylo}
  $C693-$C6CE         the effect pool, 10 x 6 B {byte0, Xhi, Xlo, Yhi, Ylo, sub}
  $C6CF-$C6EE         the ballistic pool -- the heart a broken door drops

plus the $D000 cells the door actually opens, which is the whole point of the
subsystem and the one thing a screenshot cannot settle (an opened cell and a
closed one differ by two bytes and, for four frames, by nothing on screen).

Every byte of all four pools is dumped, not a summary: the effect pool in
particular keeps its position and subtype AFTER the record is freed (only byte
0 is cleared, $1423), and a port that zeroes the whole record looks right and
is wrong.

$C757 is recorded per frame for the usual reason -- docs/03-VERIFICATION.md
section 28 -- even though the door sequencer itself is NOT lag-gated
(sub_01_4BB0 has no $C757 test, unlike $424D and $4E39). The actors and
enemies around it are, so a cap still has to sit below the first lag frame.

Usage:
  python tools/oracle/doortrace.py --level 13 --frames 45 --warp 4,30 \
      --script "4:B,200:" --cells "5,29;5,30;6,29;6,30"
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pyboy import PyBoy                                   # noqa: E402
from trace import (ROM, ROOT, FRAME_END, BUTTONS,         # noqa: E402
                   boot_to_gameplay, parse_script)

SEQ = 0xC733          # phase 0, 1-4 erase, 5 spawn, 6-$28 debris flight
DEBRIS = 0xC60B
DEBRIS_N = 16
EFFECT = 0xC693
EFFECT_N = 60
BALLISTIC = 0xC6CF
BALLISTIC_N = 32
LAG = 0xC757


def sample(mem):
    return {
        'x': (mem[0xFF81] << 8) | mem[0xFF82],
        'y': (mem[0xFF83] << 8) | mem[0xFF84],
        'vx': mem[0xFF86], 'vy': mem[0xFF87],
        'air': mem[0xFF80], 'facing': mem[0xFF88], 'hp': mem[0xFF8A],
        'atk': mem[0xFF97],
        'camX': (mem[0xFFA2] << 8) | mem[0xFFA3],
        'camY': (mem[0xFFA4] << 8) | mem[0xFFA5],
        'seq': mem[SEQ], 'dcol': mem[SEQ + 1], 'drow': mem[SEQ + 2],
        'lag': mem[LAG],
        'debris': [mem[DEBRIS + i] for i in range(DEBRIS_N)],
        'eff': [mem[EFFECT + i] for i in range(EFFECT_N)],
        'bal': [mem[BALLISTIC + i] for i in range(BALLISTIC_N)],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=60)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=13)
    ap.add_argument('--out', default='rip/oracle')
    ap.add_argument('--name', default=None,
                    help='output basename; defaults to the level number')
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--warp', default=None, metavar='COL[,ROW]')
    ap.add_argument('--cells', default=None, metavar='COL,ROW[;COL,ROW...]',
                    help='$D000 cells to sample (graphic, collision) per frame')
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
        # $D000 + col*$20 + (row & $0F)*2 -- sub_00_11B9, column-major.
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
    name = args.name or f'L{args.level:02d}'
    path = os.path.join(outdir, f'doortrace_{name}.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'script': script,
                   'level': args.level, 'cells': cells,
                   'bootFrame': boot_frame, 'frames': trace}, fh)

    lags = [t['f'] for t in trace if t['lag']]
    armed = [t['f'] for t in trace if t['seq']]
    print(f'level {args.level}, {len(trace)} frames, script "{script}"')
    print(f'$C733 non-zero on frames: '
          f'{f"{armed[0]}..{armed[-1]}" if armed else "NEVER ARMED"}')
    print(f'lag frames ($C757): {lags if lags else "none"}')
    print(f'wrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
