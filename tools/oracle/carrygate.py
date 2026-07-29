#!/usr/bin/env python3
"""Does the $C72F/$C730 carry inbox get consumed while a scripted move runs?

ROM: $1643 is `LD A,[$C737] / AND A / JP Z, loc_00_170A`. loc_00_170A is the
ELSE of that branch, not something upstream of it -- so while $C737 is nonzero
nothing mirrors the inbox into $C723/$C724, nothing adds it to the position,
and, most visibly, nothing ZEROES it at $1738.

This drives level 5 into one of its own $04 exit cells (which is what arms
$C737), pokes a carry into $C72F on the arming frame, and then watches all
four bytes plus the hook counts for $170A and loc_00_164A.

  python tools/oracle/carrygate.py --level 5 --warp 3,20 --frames 200
"""
import argparse
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import ROM, FRAME_END, boot_to_gameplay, BUTTONS  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=5)
    ap.add_argument('--warp', default='3,20')
    ap.add_argument('--hold', default='right')
    ap.add_argument('--frames', type=int, default=200)
    ap.add_argument('--poke', type=int, default=4,
                    help='value to force into $C72F on the arming frame')
    args = ap.parse_args()

    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    iters = {'n': 0}
    per = {'carry': 0, 'script': 0}
    rows = []

    def on_frame(_):
        m = pb.memory
        rows.append(dict(f=iters['n'], x=(m[0xFF81] << 8) | m[0xFF82],
                         y=(m[0xFF83] << 8) | m[0xFF84],
                         c737=m[0xC737], c738=m[0xC738],
                         c72f=m[0xC72F], c730=m[0xC730],
                         c723=m[0xC723], c724=m[0xC724],
                         carry=per['carry'], script=per['script']))
        per['carry'] = per['script'] = 0
        iters['n'] += 1

    pb.hook_register(0, FRAME_END, on_frame, None)
    pb.hook_register(0, 0x170A, lambda _: per.__setitem__('carry', per['carry'] + 1), None)
    pb.hook_register(0, 0x164A, lambda _: per.__setitem__('script', per['script'] + 1), None)

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

    poked = False
    pressed = False
    guard = 0
    while iters['n'] - base < args.frames and guard < args.frames * 8 + 800:
        guard += 1
        if not pressed and iters['n'] - base >= 3:
            pb.button_press(args.hold)
            pressed = True
        # Poke a carry the instant a script is running: this is what a conveyor
        # or a moving platform would have queued on the frame before.
        if not poked and pb.memory[0xC737] != 0:
            pb.memory[0xC72F] = args.poke & 0xFF
            poked = True
        pb.tick(1, False)

    print('  f    x      y   $C737 $C738  $C72F $C730  $C723 $C724  170A 164A')
    prev = None
    for r in rows:
        interesting = (r['script'] or r['carry'] != 1 or r['c72f'] or r['c723']
                       or (prev and prev['c737'] != r['c737']))
        prev = r
        if not interesting:
            continue
        print(f"{r['f'] - base:3d} ${r['x']:04X} ${r['y']:04X}   {r['c737']:3d}  {r['c738']:4d} "
              f"  {r['c72f']:4d}  {r['c730']:4d}   {r['c723']:4d}  {r['c724']:4d} "
              f"  {r['carry']:4d} {r['script']:4d}")
    pb.stop(save=False)


if __name__ == '__main__':
    main()
