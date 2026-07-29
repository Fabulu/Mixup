#!/usr/bin/env python3
"""Do the ceiling/floor probes MATTER on a cling-lock frame?

The port skips both while $FFB2 & $1F runs; the cartridge runs both ($1909 ->
loc_00_1A9D, $1AC2 -> loc_00_1B1B).  This samples A at $1AA0 (just after
CALL sub_00_1EA6) and at $1B1E (just after CALL sub_00_1DB9) together with
$FFB2, over a list of scripted runs, and reports every cling frame on which
either probe returned NONZERO -- i.e. every frame where skipping them changes
state.
"""
import argparse
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import ROM, FRAME_END, boot_to_gameplay, parse_script, BUTTONS  # noqa: E402

# (name, level, frames, script, warp)
RUNS = [
    ('walljump-reverse', 1, 200, '15:,25:R,8:RA,20:R,10:A,30:L,12:LA,40:R,40:', None),
    ('walljump-launch-right', 1, 115, '40:,50:R,10:RA,15:L', None),
    ('walljump-chain', 1, 260, '40:,50:R,10:RA,50:L,10:LA,50:R,10:RA,40:R', None),
    ('l1-chamber-cling-up', 1, 60, '4:,3:A,3:,50:RA', '9,25'),
    ('l1-chamber-cling-left', 1, 60, '4:,3:A,3:,50:LA', '4,26'),
    ('l1-spawn-left-wall', 1, 80, '35:,3:A,3:,39:LA', None),
    ('l5-gauntlet', 5, 578, '20:,140:R,20:RA,120:R,20:RA,120:R,20:RA,120:R,20:RA,320:R', None),
    ('l5-spike-cling', 5, 200, '10:,60:R,10:RA,120:RA', '20,26'),
    ('l3-platform-cling', 3, 200, '10:,60:R,10:RA,120:RA', '50,21'),
    ('l9-walls', 9, 300, '20:,100:R,10:RA,50:L,10:LA,110:R', None),
    ('l4-arena-walls', 4, 120, '10:,3:A,3:,104:RA', '10,29'),
    ('l7-breakables', 7, 300, '20:,100:R,10:RA,50:L,10:LA,120:R', None),
    ('l2-slopes', 2, 300, '20:,120:R,10:RA,50:L,10:LA,100:R', None),
]


def run(name, level, frames, script, warp, verbose=False):
    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    it = {'n': 0}
    hits = []
    cur = {'ceil': None, 'floor': None}

    def on_frame(_):
        m = pb.memory
        cl = m[0xFFB2] & 0x1F
        if cl and (cur['ceil'] or cur['floor']):
            hits.append((it['n'], cl, cur['ceil'], cur['floor'],
                         m[0xFF87], m[0xFF83], m[0xFF81]))
        cur['ceil'] = None
        cur['floor'] = None
        it['n'] += 1

    pb.hook_register(0, FRAME_END, on_frame, None)
    pb.hook_register(0, 0x1AA0, lambda _: cur.__setitem__('ceil', pb.register_file.A), None)
    pb.hook_register(0, 0x1B1E, lambda _: cur.__setitem__('floor', pb.register_file.A), None)

    boot_to_gameplay(pb, level=level)
    for n in set(BUTTONS.values()):
        pb.button_release(n)
    base = it['n']
    hits.clear()
    if warp:
        parts = warp.split(',')
        pb.memory[0xFF81] = int(parts[0])
        pb.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pb.memory[0xFF83] = int(parts[1])
            pb.memory[0xFF84] = 0
    tl = parse_script(script)
    held = set()
    guard = 0
    clingframes = {'n': 0}
    while it['n'] - base < frames and guard < frames * 8 + 800:
        guard += 1
        idx = it['n'] - base
        want = tl[min(idx + 1, len(tl) - 1)] if tl else set()
        for nm in want - held:
            pb.button_press(nm)
        for nm in held - want:
            pb.button_release(nm)
        held = want
        pb.tick(1, False)
        if pb.memory[0xFFB2] & 0x1F:
            clingframes['n'] += 1
    pb.stop(save=False)
    return base, hits, clingframes['n']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None)
    args = ap.parse_args()
    for name, level, frames, script, warp in RUNS:
        if args.only and args.only not in name:
            continue
        base, hits, cf = run(name, level, frames, script, warp)
        print(f'{name:26s} lv{level:<3d} clingFrames={cf:4d} '
              f'nonzero-probe-on-cling={len(hits)}')
        for h in hits[:12]:
            print(f'    f{h[0] - base:<4d} FFB2&1F=${h[1]:02X} ceil={h[2]} '
                  f'floor={h[3]} vy={h[4]} row={h[5]} col={h[6]}')


if __name__ == '__main__':
    main()
