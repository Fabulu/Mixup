#!/usr/bin/env python3
"""Settle WHERE in the frame a routine runs relative to the player update.

Registers an execution hook on a ROM address and snapshots player state at the
instant it fires, alongside the state at end-of-frame.  Comparing the two tells
us whether a routine sees this frame's player position or last frame's --
something no amount of reading the listing settles reliably, because the player
update is spread across bank 0.

Usage:
  python tools/oracle/hookprobe.py --addr 121F --frames 120 \
      --script "20:,40:R,10:RA,50:R"
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        out.extend([{BUTTONS[k.upper()] for k in keys.strip()
                     if k.upper() in BUTTONS}] * int(n))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--addr', default='121F', help='hex CPU address to hook')
    ap.add_argument('--bank', type=int, default=0)
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--script', default='20:,40:R,10:RA,50:R')
    args = ap.parse_args()

    addr = int(args.addr, 16)
    timeline = parse_script(args.script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    state = {'started': False, 'atHook': None, 'hits': 0}

    def on_main(_):
        state['started'] = True

    def on_hook(_):
        state['hits'] += 1
        m = pyboy.memory
        state['atHook'] = {
            'x': (m[0xFF81] << 8) | m[0xFF82],
            'y': (m[0xFF83] << 8) | m[0xFF84],
            'vy': m[0xFF87],
            'air': m[0xFF80],
            'camY': (m[0xFFA4] << 8) | m[0xFFA5],
        }

    pyboy.hook_register(0, MAIN_LOOP, on_main, None)
    pyboy.hook_register(args.bank, addr, on_hook, None)

    for f in range(2000):
        if state['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)

    print(f'hooking {args.bank:02X}:${addr:04X}\n')
    print(f'{"f":>4}  {"y@hook":>7} {"camY@hook":>10} | '
          f'{"y@end":>7} {"camY@end":>9} {"vy":>4} {"air":>4}   verdict')

    held, prev_end = set(), None
    for f in range(1, args.frames + 1):
        want = timeline[min(f, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want

        state['atHook'] = None
        pyboy.tick(1, False)

        m = pyboy.memory
        end = {'x': (m[0xFF81] << 8) | m[0xFF82],
               'y': (m[0xFF83] << 8) | m[0xFF84],
               'vy': m[0xFF87], 'air': m[0xFF80],
               'camY': (m[0xFFA4] << 8) | m[0xFFA5]}
        h = state['atHook']

        if h and (f in (1, 2, 20, 21, 22, 23, 30) or 58 <= f <= 66):
            if h['y'] == end['y']:
                verdict = 'hook sees THIS frame'
            elif prev_end and h['y'] == prev_end['y']:
                verdict = 'hook sees PREVIOUS frame'
            else:
                verdict = 'neither (mid-update)'
            print(f'{f:4d}  {h["y"]:7d} {h["camY"]:10d} | '
                  f'{end["y"]:7d} {end["camY"]:9d} {end["vy"]:4d} '
                  f'{end["air"]:4d}   {verdict}')
        prev_end = end

    print(f'\nhook fired {state["hits"]} times')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
