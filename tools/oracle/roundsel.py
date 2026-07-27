#!/usr/bin/env python3
"""Drive the real round-select screen and record its cursor state per frame.

Menu logic is exactly the sort of thing that transcribes plausibly and behaves
wrong -- a wrap that goes the other way, a press that should be swallowed. So
rather than trust the listing, this walks the cartridge to state 5, feeds it a
scripted input sequence, and records $C712 (route) and $C713 (START/CONTINUE)
after every loop iteration, alongside the $FFE2 that iteration consumed.

tools/oracle/roundseldiff.mjs replays the same presses through the port.

Usage:  python tools/oracle/roundsel.py
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

TITLE_LOOP = 0x02C4
RS_LOOP = 0x03DC          # loop head: $FFE2 is what this pass will act on
RS_SETTLED = 0x0472       # after every handler, before the START test

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down',
           'A': 'a', 'B': 'b', 'S': 'start'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        out.extend([{BUTTONS[k.upper()] for k in keys.strip()
                     if k.upper() in BUTTONS}] * int(n))
    return out


def main():
    ap = argparse.ArgumentParser()
    # Deliberately exercises the wraps in both directions, DOWN with no
    # continue available, and left/right while CONTINUE is selected.
    ap.add_argument('--script',
                    default='6:,3:R,6:,3:R,6:,3:R,6:,3:R,6:,3:L,6:,3:L,6:,'
                            '3:D,6:,3:U,6:,3:R,6:')
    ap.add_argument('--out', default='rip/roundsel.json')
    ap.add_argument('--mask', default=None,
                    help='hex $C753 route-completion mask to inject, so the '
                         'cleared-route skipping is actually exercised. A fresh '
                         'boot is always $00.')
    ap.add_argument('--continue-available', action='store_true',
                    help='set $FFB5, which is the only thing that makes '
                         'CONTINUE exist and start selected')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    m = pyboy.memory

    hit = {'n': 0}
    pyboy.hook_register(0, TITLE_LOOP,
                        lambda _: hit.__setitem__('n', hit['n'] + 1), None)

    pending = {'e2': None}
    samples = []

    def on_loop(_):
        pending['e2'] = m[0xFFE2]

    def on_settled(_):
        if pending['e2'] is None:
            return
        samples.append({'pressed': pending['e2'],
                        'cursor': m[0xC712], 'mode': m[0xC713]})
        pending['e2'] = None

    pyboy.hook_register(0, RS_LOOP, on_loop, None)
    pyboy.hook_register(0, RS_SETTLED, on_settled, None)

    # Boot to the title, then tap START to walk into round select. The two
    # flags have to be injected BEFORE loc_00_035B reads them -- the setup
    # picks the starting cursor and mode from exactly these.
    for _ in range(3000):
        pyboy.tick(1, False)
        if hit['n'] > 40:
            break
    if args.mask is not None:
        m[0xC753] = int(args.mask, 16)
    if args.continue_available:
        m[0xFFB5] = 1
        m[0xC767] = 3                 # lives, drawn next to CONTINUE
    pyboy.button('start', delay=4)
    # START at the title goes through state 4 first -- loc_00_031B, the
    # "press start" flash, which runs 120 frames before round select begins.
    for _ in range(400):
        pyboy.tick(1, False)
        if samples:
            break
    for _ in range(10):
        pyboy.tick(1, False)

    base = len(samples)
    timeline = parse_script(args.script)
    held = set()
    for want in timeline:
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want
        pyboy.tick(1, False)

    rows = samples[base:]
    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'script': args.script, 'rows': rows,
                   'continueAvailable': m[0xFFB5],
                   'routeMask': m[0xC753]}, fh)

    print(f'{len(rows)} loop iterations recorded')
    print(f"$FFB5 = {m[0xFFB5]}, $C753 = ${m[0xC753]:02X}")
    seen = sorted({(r['cursor'], r['mode']) for r in rows})
    print('distinct (route, mode) states visited:', seen)
    print(f'wrote {out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
