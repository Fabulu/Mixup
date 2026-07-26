#!/usr/bin/env python3
"""Count which of a set of ROM addresses executes on each frame.

Answers "which code path did the game actually take?" without guessing from
the listing.

Usage:
  python tools/oracle/hits.py --from 102 --to 108 \
      --addrs 1D5F:accel 1D6E:storeVxR 18A3:vxZero 1F61:wallR 1F87:wallL
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}


def parse_script(s):
    out = []
    for seg in s.split(','):
        n, _, keys = seg.partition(':')
        out.extend([{BUTTONS[k.upper()] for k in keys.strip()
                     if k.upper() in BUTTONS}] * int(n))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--script', default='20:,40:R,10:RA,50:R')
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--from', dest='lo', type=int, default=102)
    ap.add_argument('--to', dest='hi', type=int, default=108)
    ap.add_argument('--addrs', nargs='+', required=True, help='HEXADDR:label ...')
    ap.add_argument('--level', type=int, default=1,
                    help='inject $FFB0 at loc_00_04BB, same as trace.py')
    args = ap.parse_args()

    labels = []
    for spec in args.addrs:
        a, _, name = spec.partition(':')
        labels.append((int(a, 16), name or a))

    timeline = parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    started = {'v': False}
    order = []

    if args.level != 1:
        pyboy.hook_register(
            0, 0x04BB,
            lambda _: pyboy.memory.__setitem__(0xFFB0, args.level), None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for addr, name in labels:
        def make(n):
            return lambda _: order.append(n)
        pyboy.hook_register(0, addr, make(name), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in set(BUTTONS.values()):
        pyboy.button_release(n)

    held = set()
    for f in range(2, args.frames + 1):
        want = timeline[min(f, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want

        order.clear()
        pyboy.tick(1, False)

        if args.lo <= f <= args.hi:
            m = pyboy.memory
            vx = m[0xFF86] - 256 if m[0xFF86] > 127 else m[0xFF86]
            y = (m[0xFF83] << 8) | m[0xFF84]
            print(f'frame {f:4d}  x={(m[0xFF81] << 8) | m[0xFF82]:5d} '
                  f'row={(y >> 8) & 15:2d} vx={vx:3d} thr={m[0xFF98]}  '
                  f'{" -> ".join(order)}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
