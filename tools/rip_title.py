#!/usr/bin/env python3
"""Capture the title screen's VRAM and BG tilemap.

The title is drawn by two VRAM scripts (5:$5170 and 1:$7C44) run through
sub_00_0A0E over a tilemap cleared to $2F. Rather than port the script
interpreter AND work out which tile resources the boot path loads, this halts
at the title loop ($02C4) and snapshots what the real game built.

Honest about what it is: a capture, not a translation. The scripts themselves
are still unported; when the interpreter lands this file can go.

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
    vram = bytes(m[0x8000:0xA000])
    out = os.path.join(ROOT, 'assets')
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'title.vram.bin'), 'wb') as f:
        f.write(vram)

    meta = {
        'scx': m[0xFF43], 'scy': m[0xFF42],
        'bgp': m[0xFF47], 'obp0': m[0xFF48], 'obp1': m[0xFF49],
        'lcdc': m[0xFF40], 'wy': m[0xFF4A], 'wx': m[0xFF4B],
    }
    with open(os.path.join(out, 'title.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f)

    tilemap = vram[0x1800:0x1C00]
    used = sorted({b for b in tilemap})
    print(f'title captured after {hit["n"]} title-loop frames')
    print(f'  vram      : {len(vram)} bytes -> assets/title.vram.bin')
    print(f'  registers : {meta}')
    print(f'  tilemap   : {len(used)} distinct tiles, '
          f'first row {" ".join(f"{b:02X}" for b in tilemap[:20])}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
