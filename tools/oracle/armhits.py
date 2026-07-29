#!/usr/bin/env python3
"""Total executions of a set of ROM addresses over a scenario.

hits.py answers "which path on THIS frame"; this answers "did that arm run at
all, and how often" -- the coverage question. A scenario that passes without
executing the arm it was written for is a test that has silently stopped
testing (docs/03-VERIFICATION.md, lesson 5).

Boot cadence is copied from trace.py verbatim so $FFB1/$FFA7 phase matches the
oracle corpus.

  python tools/oracle/armhits.py --level 5 --frames 620 --ammo 9 \
      --script "20:,200:R,4:B,..." --addrs 3C8A:armored 3CF4:damage
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB
AMMO = 0xC759
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
    ap.add_argument('--script', default='')
    ap.add_argument('--frames', type=int, default=300)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--bank', type=int, default=0)
    ap.add_argument('--difficulty', type=int, default=None)
    ap.add_argument('--trace-from', type=int, default=None)
    ap.add_argument('--trace-to', type=int, default=None)
    ap.add_argument('--addrs', nargs='+', required=True)
    args = ap.parse_args()

    labels = []
    for spec in args.addrs:
        a, _, name = spec.partition(':')
        labels.append((int(a, 16), name or a))

    timeline = parse_script(args.script) if args.script else []
    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)

    started = {'v': False}
    counts = {name: 0 for _, name in labels}
    order = []
    first = {}
    ctx = {'f': 0}

    def level_init(_):
        if args.level != 1:
            pb.memory[0xFFB0] = args.level
    if args.level != 1:
        pb.hook_register(0, LEVEL_INIT, level_init, None)
    if args.difficulty is not None:
        pb.hook_register(0, 0x0D50,
                         lambda _: pb.memory.__setitem__(0xC756, args.difficulty),
                         None)
    pb.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for addr, name in labels:
        def make(n):
            def cb(_):
                counts[n] += 1
                first.setdefault(n, ctx['f'])
                if (args.trace_from is not None
                        and args.trace_from <= ctx['f'] <= (args.trace_to
                                                            or args.trace_from)):
                    order.append((ctx['f'], n))
            return cb
        pb.hook_register(args.bank, addr, make(name), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pb.button('start', delay=3)
        pb.tick(1, False)
    for n in set(BUTTONS.values()):
        pb.button_release(n)

    m = pb.memory
    if args.ammo is not None:
        m[AMMO] = args.ammo
    if args.warp:
        parts = args.warp.split(',')
        m[0xFF81] = int(parts[0])
        m[0xFF82] = 0x80
        if len(parts) > 1:
            m[0xFF83] = int(parts[1])
            m[0xFF84] = 0

    held = set()
    for f in range(2, args.frames + 1):
        ctx['f'] = f
        want = timeline[min(f, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pb.button_press(n)
        for n in held - want:
            pb.button_release(n)
        held = want
        if args.ammo is not None and m[AMMO] < 2:
            m[AMMO] = args.ammo
        pb.tick(1, False)

    for _, name in labels:
        print(f'{name:24s} {counts[name]:6d}   first f{first.get(name, "-")}')
    if order:
        print('-- ordered:')
        for f, n in order:
            print(f'   f{f:4d}  {n}')
    pb.stop(save=False)


if __name__ == '__main__':
    main()
