#!/usr/bin/env python3
"""Does level 6's track ever report $FFC9 == 1 under ordinary input?

SAVEPOINT gap 4: the $FFC9 == 1 alternate tile-animation table (2:$625E) is
ported but never exercised -- every recording to date was idle, and an idle
player parks the track via the $2F48 equal-column stop with direction 2 left
standing. This holds RIGHT and logs, per frame:

  $FFC9 (direction), $FFC8 (limit latch), $FFCA:$FFCB (track X),
  $FF81 (player column), $C70F/$C710/$C711 (the tile-anim cursors)

plus which streamer arm executed ($3151 alt table / $3156 normal / $3169 off),
via hooks on the three addresses.

Usage:  python tools/oracle/conveyordir.py --frames 800 --script "20:,780:R"
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                    # noqa: E402
from trace import (ROM, FRAME_END, BUTTONS, boot_to_gameplay,  # noqa: E402
                   parse_script)

ARM_ALT = 0x3151      # LD HL,$625E -- the $FFC9 == 1 table
ARM_NORM = 0x3156     # the ordinary per-level row
ARM_OFF = 0x3169      # $FFC9 == 0 -- no stream, cursors hold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=800)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=6)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--force-col', type=int, default=None,
                    help='punchreach-style: plant this player column at the '
                         '$2F08 read so the track sees it regardless of '
                         'physics -- the way to reach the $2F40 limit arms')
    ap.add_argument('--out', default='rip/oracle/conveyordir.json')
    args = ap.parse_args()

    script = args.script or f'{args.frames}:'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    arm = {'v': None}
    for name, addr in (('alt', ARM_ALT), ('norm', ARM_NORM), ('off', ARM_OFF)):
        pyboy.hook_register(0, addr,
                            (lambda n: lambda _: arm.__setitem__('v', n))(name),
                            None)

    if args.force_col is not None:
        pyboy.hook_register(
            0, 0x2F08,
            lambda _: pyboy.memory.__setitem__(0xFF81, args.force_col & 0xFF),
            None)

    rows = []

    def sample(_):
        m = pyboy.memory
        rows.append({
            'dir': m[0xFFC9], 'latch': m[0xFFC8],
            'track': (m[0xFFCA] << 8) | m[0xFFCB],
            'pcol': m[0xFF81],
            'c70f': m[0xC70F], 'c710': m[0xC710], 'c711': m[0xC711],
            'arm': arm['v'],
        })
        arm['v'] = None

    boot_to_gameplay(pyboy, level=args.level)
    pyboy.hook_register(0, FRAME_END, sample, None)

    if args.warp:
        parts = [int(v) for v in args.warp.split(',')]
        pyboy.memory[0xFF81] = parts[0] & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = parts[1] & 0xFF
            pyboy.memory[0xFF84] = 0

    # Release whatever menu navigation left held, then drive the script with
    # the one-frame input lead trace.py documents (docs/03-VERIFICATION.md).
    for name in BUTTONS.values():
        pyboy.button_release(name)
    held = set()
    for f in range(args.frames):
        want = timeline[min(f + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    dirs = {}
    for r in rows:
        dirs[r['dir']] = dirs.get(r['dir'], 0) + 1
    arms = {}
    for r in rows:
        arms[r['arm']] = arms.get(r['arm'], 0) + 1
    print(f'{len(rows)} frames; $FFC9 histogram: {dirs}; streamer arms: {arms}')

    # Transitions, so the legs and turn frames are visible at a glance.
    last = None
    for i, r in enumerate(rows):
        if r['dir'] != last:
            print(f"  f{i:4d}: dir {last} -> {r['dir']}  latch={r['latch']}"
                  f" track=${r['track']:04X} pcol=${r['pcol']:02X} arm={r['arm']}")
            last = r['dir']

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as fh:
        json.dump({'level': args.level, 'script': script, 'rows': rows}, fh)
    print('wrote', args.out)


if __name__ == '__main__':
    main()
