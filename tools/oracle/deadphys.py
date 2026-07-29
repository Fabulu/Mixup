#!/usr/bin/env python3
"""Does the cartridge keep running the player's physics after HP hits 0?

The ROM's two death arms are NOT symmetric.  The PIT arm ($1755) ends the
update with a bare `RET` at $1772 once $C715 is set; the HP arm ($17D9) jumps
to $17EA and the chain keeps going -- through $1806 (where $1826 routes a dead
player straight to $1A57), the ceiling probe, gravity and the floor probe.  So
a corpse standing on a conveyor should keep being carried.

This warps onto a conveyor, zeroes $FF8A on a chosen frame, and prints the
position, the carry inbox and the per-iteration hook counts for both probes.
Port twin: tools/oracle/portdeath.mjs (same columns).

  python tools/oracle/deadphys.py --level 3 --warp 7,28 --kill 10 --frames 60
"""
import argparse
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import ROM, FRAME_END, boot_to_gameplay, BUTTONS  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=3)
    ap.add_argument('--warp', default='7,28')
    ap.add_argument('--kill', type=int, default=10, help='frame to zero $FF8A on')
    ap.add_argument('--frames', type=int, default=60)
    args = ap.parse_args()

    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    iters = {'n': 0}
    per = {'ceil': 0, 'floor': 0, 'walls': 0}
    rows = []

    def on_frame(_):
        m = pb.memory
        rows.append(dict(f=iters['n'], x=(m[0xFF81] << 8) | m[0xFF82],
                         y=(m[0xFF83] << 8) | m[0xFF84], vx=m[0xFF86],
                         vy=m[0xFF87], air=m[0xFF80], hp=m[0xFF8A],
                         dead=m[0xC715], carry=m[0xC72F], anim=m[0xFF8F],
                         ceil=per['ceil'], floor=per['floor'], walls=per['walls']))
        per['ceil'] = per['floor'] = per['walls'] = 0
        iters['n'] += 1

    pb.hook_register(0, FRAME_END, on_frame, None)
    pb.hook_register(0, 0x1EA6, lambda _: per.__setitem__('ceil', per['ceil'] + 1), None)
    pb.hook_register(0, 0x1DB9, lambda _: per.__setitem__('floor', per['floor'] + 1), None)
    pb.hook_register(0, 0x1EF9, lambda _: per.__setitem__('walls', per['walls'] + 1), None)

    boot_to_gameplay(pb, level=args.level)
    for name in set(BUTTONS.values()):
        pb.button_release(name)
    base = iters['n']
    rows.clear()
    col, row = (int(v) for v in args.warp.split(','))
    pb.memory[0xFF81] = col
    pb.memory[0xFF82] = 0x80
    pb.memory[0xFF83] = row
    pb.memory[0xFF84] = 0

    killed = False
    guard = 0
    while iters['n'] - base < args.frames and guard < args.frames * 8 + 800:
        guard += 1
        if not killed and iters['n'] - base >= args.kill:
            pb.memory[0xFF8A] = 0
            killed = True
        pb.tick(1, False)

    print('  f dead   x      y     vx  vy air hp carry ceil floor walls')
    for r in rows:
        print(f"{r['f'] - base:3d} {r['dead']:4d} ${r['x']:04X} ${r['y']:04X} "
              f"{r['vx']:4d} {r['vy']:4d} {r['air']:3d} {r['hp']:2d} {r['carry']:5d} "
              f"{r['ceil']:4d} {r['floor']:5d} {r['walls']:5d}")
    pb.stop(save=False)


if __name__ == '__main__':
    main()
