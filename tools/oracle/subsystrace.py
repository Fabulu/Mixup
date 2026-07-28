#!/usr/bin/env python3
"""Cartridge-side reference trace for the PER-LEVEL SUBSYSTEMS: sub_00_2CBE.

sub_00_2CBE ($05C6) dispatches on $FFB0 to a different subsystem per level:

    levels 1/2   loc_00_2D3D   the rising water body      (ported: src/water.js)
    level  6     loc_00_2EF4   the conveyor/parallax track
    level  7     loc_00_2F5F   the falling-block RESPAWNER (object slots 4/5/6)
    level  $0B   loc_00_2CED   the entrance freeze ($C717/$C751)
    level  $0C   loc_00_2FB7   the collapsing floor (table 1:$7BB4)
    level  $0D   loc_00_301E   the one-shot type-$0A spawn into slots 0/1/2
    otherwise    loc_00_3050   the rescue drop, iff subtype $C73E != 0

The last one is also the tail of EVERY arm of the level-$0B branch, which is
the whole reason this file samples it: reading loc_00_2CED to its `RET` and
stopping there misses that all seven of its exits are `JP loc_00_3050`.

Everything here is state trace.py does not carry.  It reuses trace.py's boot
path, sampling hook and input lead verbatim (imported, not copied), and adds
$C757 so a scenario can be capped just short of the first lag frame
(docs/03-VERIFICATION.md section 28).

Usage:
  python tools/oracle/subsystrace.py --level 6  --frames 200
  python tools/oracle/subsystrace.py --level 12 --frames 200 --warp 10,20 \
      --cells 3,21;4,21
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


def sample(mem):
    return {
        # --- player, and everything a subsystem can move about him ---------
        'x': (mem[0xFF81] << 8) | mem[0xFF82],
        'y': (mem[0xFF83] << 8) | mem[0xFF84],
        'vx': mem[0xFF86], 'vy': mem[0xFF87],
        'air': mem[0xFF80],
        'camX': (mem[0xFFA2] << 8) | mem[0xFFA3],
        'camY': (mem[0xFFA4] << 8) | mem[0xFFA5],
        'hp': mem[0xFF8A],
        'facing': mem[0xFF88],
        'action': mem[0xC71E],        # rope / modal action
        'squat': mem[0xFF90],
        'atk': mem[0xFF97],
        'cling': mem[0xFFB2],
        'carryX': mem[0xC72F], 'carryY': mem[0xC730],

        # --- loc_00_2EF4, the level-6 track --------------------------------
        'park': mem[0xFFC8],          # 0 chase player, 1 at bottom, 2 at top
        'dir': mem[0xFFC9],           # 0 stopped, 1 right/up, 2 left/down
        'track': (mem[0xFFCA] << 8) | mem[0xFFCB],
        'plx': mem[0xFFCC],           # the screen-space output ($088A reads it)

        # --- loc_00_2CED, the level-$0B entrance freeze --------------------
        'seqTimer': mem[0xC717],
        'spring': mem[0xC751],

        # --- loc_00_2FB7 / loc_00_301E, the one-shot cursors ---------------
        'cursor': mem[0xC736],
        'respawns': mem[0xC73B],      # loc_00_2F5F's 10-shot counter

        # --- loc_00_3050, the rescue drop ----------------------------------
        'cheat': mem[0xC75C],
        'drop': [mem[a] for a in range(0xC75B, 0xC763)],

        'cleared': mem[0xC740],
        'lag': mem[0xC757],
        'obj': [mem[OBJ_BASE + i] for i in range(SLOTS * RECORD)],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=200)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=6)
    ap.add_argument('--out', default='rip/oracle')
    ap.add_argument('--tag', default=None, help='output file suffix')
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--warp', default=None, metavar='COL[,ROW]')
    ap.add_argument('--cells', default=None, metavar='COL,ROW[;COL,ROW...]',
                    help='also sample these $D000 cells (graphic, collision) '
                         'each frame -- a collapsing floor is TERRAIN, so its '
                         'real output is in the map, not in any record')
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
    tag = args.tag or f'L{args.level:02d}'
    path = os.path.join(outdir, f'subsys_{tag}.json')
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
