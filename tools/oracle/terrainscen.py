#!/usr/bin/env python3
"""Terrain/collision oracle: record the cartridge's answer to a specific
question about map-cell handling.

Unlike trace.py this samples MAP CELLS ($D000) and hooked ROM arms as well as
the player, because the interesting terrain bugs are "which arm of the probe
dispatcher ran", not "where did the player end up".

  python tools/oracle/terrainscen.py --level 5 --warp 36,29 --script "1:,80:R" \
      --cells 36,13 37,13 37,14 37,15 38,14 --out rip/terrain/l5-breakwall.json
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
LEVEL_INIT = 0x04BB

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down',
           'A': 'a', 'B': 'b'}

# Arms of the collision dispatchers worth counting, by (bank, addr).
ARMS = {
    'floor_break': 0x1E65,       # loc_00_1E65 -- a breakable cell is stepped on
    'floor_land': 0x1E35,        # loc_00_1E35 -- ordinary landing
    'hprobe_R': 0x1EF9,          # sub_00_1EF9  right horizontal probe
    'hprobe_L': 0x1FAF,          # sub_00_1FAF  left horizontal probe
    'cling_try_R': 0x1F33,       # loc_00_1F33  right cling candidate
    'cling_try_L': 0x1FE9,       # loc_00_1FE9  left cling candidate
    'cling_take_R': 0x1F52,      # the cling actually fires (right wall)
    'cling_take_L': 0x200C,      # ... left wall
    'push_R': 0x1F61,            # loc_00_1F61  wall push, right
    'push_L': 0x1F87,            # loc_00_1F87  wall push, left
    'exit_script': 0x272C,       # loc_00_272C  the $04/$05 walk-through
    'spike_dmg': 0x1E14,         # loc_00_1E14  spike damage
    'objscan': 0x2426,           # loc_00_2426  map-object overlap scan
    'obj_hit_FF': 0x2622,        # the scan reports $FF
    'obj_hit_FD': 0x261E,        # the scan reports $FD
    'restore_erase': 0x1364,     # a breakable timer expires (cell erased)
    'pickup': 0x4D4E,            # bank 1 -- pickup consume (bank hook below)
}
BANK1_ARMS = {'pickup'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        names = {BUTTONS[k.upper()] for k in keys.strip() if k.upper() in BUTTONS}
        out.extend([names] * int(n))
    return out


def boot_to_gameplay(pyboy, level=1, max_frames=2000):
    started = {'frame': None}
    ctx = {'f': 0}
    if level != 1:
        pyboy.hook_register(
            0, LEVEL_INIT,
            lambda _: pyboy.memory.__setitem__(0xFFB0, level), None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda c: started.__setitem__('frame', c['f'])
                        if started['frame'] is None else None, ctx)
    for f in range(max_frames):
        ctx['f'] = f
        if started['frame'] is not None:
            return f
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--cells', nargs='*', default=[],
                    help='col,row pairs (MAP row 0-15) to sample every frame')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    script = args.script or f'{args.frames}:R'
    timeline = parse_script(script)
    cells = [tuple(int(v) for v in c.split(',')) for c in args.cells]

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    pending = {k: 0 for k in ARMS}
    samples = []

    def make_cb(name):
        def cb(_):
            pending[name] += 1
        return cb

    for name, addr in ARMS.items():
        pyboy.hook_register(1 if name in BANK1_ARMS else 0, addr,
                            make_cb(name), None)

    def snap(_):
        m = pyboy.memory
        row = {
            'x': (m[0xFF81] << 8) | m[0xFF82],
            'y': (m[0xFF83] << 8) | m[0xFF84],
            'vx': m[0xFF86], 'vy': m[0xFF87],
            'air': m[0xFF80], 'facing': m[0xFF88],
            'hp': m[0xFF8A], 'hpMax': m[0xFF8E],
            'cling': m[0xFFB2], 'jumpRel': m[0xFFC2],
            'action': m[0xC71E], 'iframes': m[0xC714],
            'camX': (m[0xFFA2] << 8) | m[0xFFA3],
            'bk': [[m[0xC67B + i * 3], m[0xC67C + i * 3], m[0xC67D + i * 3]]
                   for i in range(8)],
            'cells': [[m[0xD000 + c * 32 + r * 2], m[0xD000 + c * 32 + r * 2 + 1]]
                      for (c, r) in cells],
            'arms': {k: v for k, v in pending.items() if v},
        }
        for k in pending:
            pending[k] = 0
        samples.append(row)

    pyboy.hook_register(0, FRAME_END, snap, None)

    boot = boot_to_gameplay(pyboy, level=args.level)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, len(samples) - 1)

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

    frames = []
    for i, row in enumerate(samples[base:base + args.frames]):
        row['f'] = i + 1
        frames.append(row)

    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'level': args.level, 'script': script, 'warp': args.warp,
                   'cells': cells, 'bootFrame': boot, 'frames': frames}, fh)
    print(f'wrote {out}  ({len(frames)} frames, boot {boot})')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
