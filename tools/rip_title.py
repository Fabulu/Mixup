#!/usr/bin/env python3
"""Capture the title screen's LCD register state.

The VRAM capture this used to take is gone. sub_00_0A0E is ported, and the
title image is now BUILT from its ingredients -- see src/vram.js
buildTitleVram(), proved byte-for-byte by tools/oracle/titlediff.mjs.

What is left is the eight LCD registers, and they are captured rather than
derived for a specific reason: they are read 40 frames into the title loop, so
the palette values are the state AFTER sub_00_0A7F's fade has finished, not the
immediates the code writes ($34C6 sets BOTH object palettes to $E4; the
captured OBP1 is $C4). Deriving them means running the fade, which is a
separate job from building the screen.

Usage:  python tools/rip_title.py
"""
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
TITLE_LOOP = 0x02C4


def main():
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    hit = {'n': 0}
    pyboy.hook_register(0, TITLE_LOOP, lambda _: hit.__setitem__('n', hit['n'] + 1), None)

    # No input at all -- the title comes up on its own after the logo.
    for _ in range(1200):
        pyboy.tick(1, False)
        if hit['n'] > 40:      # a few frames in, so the fade has finished
            break
    if hit['n'] == 0:
        raise RuntimeError('never reached the title loop')

    m = pyboy.memory
    out = os.path.join(ROOT, 'assets')
    os.makedirs(out, exist_ok=True)

    meta = {
        'scx': m[0xFF43], 'scy': m[0xFF42],
        'bgp': m[0xFF47], 'obp0': m[0xFF48], 'obp1': m[0xFF49],
        'lcdc': m[0xFF40], 'wy': m[0xFF4A], 'wx': m[0xFF4B],
    }
    with open(os.path.join(out, 'title.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f)

    print(f'title registers captured after {hit["n"]} title-loop frames')
    print(f'  {meta} -> assets/title.json')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
