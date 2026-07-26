#!/usr/bin/env python3
"""Log exactly which map cell the collision probe reads, and what it finds.

Hooks sub_00_20BA's cell fetch and reads HL out of the CPU, so there is no
guessing about which column/row the game actually consulted.

Usage:  python tools/oracle/probecells.py --from 100 --to 110
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
CELL_FETCH = 0x20E7          # `LD A,(HL)` -- HL is the collision byte address
PROBE_ENTRY = 0x20BA
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
    ap.add_argument('--from', dest='lo', type=int, default=100)
    ap.add_argument('--to', dest='hi', type=int, default=110)
    args = ap.parse_args()

    timeline = parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    started = {'v': False}
    events = []

    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)

    def on_probe(_):
        events.append(('mode', pyboy.memory[0xC72B]))

    def on_cell(_):
        hl = pyboy.register_file.HL
        off = hl - 0xD000
        events.append(('cell', hl, off // 32, (off % 32) // 2,
                       pyboy.memory[hl]))

    pyboy.hook_register(0, PROBE_ENTRY, on_probe, None)
    pyboy.hook_register(0, CELL_FETCH, on_cell, None)

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

        events.clear()
        pyboy.tick(1, False)

        if args.lo <= f <= args.hi:
            m = pyboy.memory
            y = (m[0xFF83] << 8) | m[0xFF84]
            x = (m[0xFF81] << 8) | m[0xFF82]
            print(f'--- frame {f}: x={x} y={y} row={(y >> 8) & 15} '
                  f'vx={m[0xFF86] - 256 if m[0xFF86] > 127 else m[0xFF86]}')
            mode = None
            for e in events:
                if e[0] == 'mode':
                    mode = e[1]
                else:
                    _, hl, col, row, val = e
                    print(f'      mode={mode} -> ${hl:04X} col={col:3d} '
                          f'row={row:2d} coll=${val:02X}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
