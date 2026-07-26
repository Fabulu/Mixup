#!/usr/bin/env python3
"""Dump arbitrary RAM ranges at chosen gameplay frames.

For "what external system just moved the player?" questions -- the state
vector only covers what the port models, so anything unimplemented is
invisible in a normal trace.

Usage:
  python tools/oracle/peek.py --level 5 --script "20:,600:R" --frames 220 \
      --at 216,218 --range C1E8:32 --range C728:16
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
LEVEL_INIT = 0x04BB
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
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--script', default='20:,600:R')
    ap.add_argument('--frames', type=int, default=220)
    ap.add_argument('--at', default='')
    ap.add_argument('--range', action='append', default=[],
                    help='HEXADDR:LEN, repeatable')
    args = ap.parse_args()

    at = {int(x) for x in args.at.split(',') if x.strip()}
    ranges = []
    for r in args.range:
        a, _, n = r.partition(':')
        ranges.append((int(a, 16), int(n)))

    timeline = parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    if args.level != 1:
        pyboy.hook_register(
            0, LEVEL_INIT,
            lambda _: pyboy.memory.__setitem__(0xFFB0, args.level), None)

    started = {'v': False}
    count = {'n': 0}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in set(BUTTONS.values()):
        pyboy.button_release(n)

    base = count['n'] - 1
    held = set()
    while count['n'] - base < args.frames:
        idx = count['n'] - base
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want
        pyboy.tick(1, False)

        fr = count['n'] - base
        if fr in at:
            m = pyboy.memory
            print(f'--- frame {fr}  player x=${m[0xFF81]:02X}{m[0xFF82]:02X} '
                  f'y=${m[0xFF83]:02X}{m[0xFF84]:02X} vy={m[0xFF87]:3d} '
                  f'air={m[0xFF80]} carryX={m[0xC72F]:3d} carryY={m[0xC730]:3d}')
            for a, n in ranges:
                row = ' '.join(f'{m[a + i]:02X}' for i in range(n))
                print(f'    ${a:04X}: {row}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
