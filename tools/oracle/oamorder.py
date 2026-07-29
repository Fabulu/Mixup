#!/usr/bin/env python3
"""Cartridge-side OAM ORDER probe for the main loop ($0567).

The $0567 body draws through two parity-gated arms and one level-gated arm
that no port comparison currently carries:

    $0573  sub_00_0F7B (HUD) + sub_00_29E7, only when $C740 == $FF and
           $FFA7 == 0
    $05A6  sub_00_0BC6 with E = $34, BC = $1880, A = $10 -- levels 9/$0A/$0B
           only, and it runs even while PAUSED
    $05E5  the same HUD pair as $0573, only when $FFA7 != 0

This records, per frame: $FF9D (the shadow-OAM write cursor) sampled at each
of those call sites and at the frame end, plus the whole shadow OAM.

Usage:
  python tools/oracle/oamorder.py --level 9 --frames 12
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pyboy import PyBoy                                   # noqa: E402
from trace import (ROM, ROOT, FRAME_END, BUTTONS,         # noqa: E402
                   boot_to_gameplay, parse_script)

SITES = {
    'hud_even_entry': 0x0573,
    'gameover_even': 0x057A,
    'sky_entry': 0x05A6,
    'sky_call': 0x05AD,
    'cam': 0x05B7,
    'hud_odd_entry': 0x05E5,
    'gameover_odd': 0x05EC,
    'splash': 0x05EF,
    'oamclear': 0x064A,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=12)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=9)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--out', default='rip/oracle')
    ap.add_argument('--tag', default=None)
    args = ap.parse_args()

    script = args.script or f'{args.frames}:'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    samples = []
    cur = {}

    def mk(name):
        def cb(_):
            cur.setdefault('hits', []).append(name)
            cur[name] = pyboy.memory[0xFF9D]
        return cb

    for name, addr in SITES.items():
        pyboy.hook_register(0, addr, mk(name), None)

    def take(_):
        m = pyboy.memory
        row = dict(cur)
        cur.clear()
        row['parity'] = m[0xFFA7]
        row['frame'] = m[0xFFB1]
        row['c740'] = m[0xC740]
        row['c715'] = m[0xC715]
        row['c716'] = m[0xC716]
        row['cursor'] = m[0xFF9D]
        row['oam'] = [m[0xC000 + i] for i in range(0xA0)]
        samples.append(row)

    pyboy.hook_register(0, FRAME_END, take, None)

    boot_to_gameplay(pyboy, level=args.level)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, len(samples) - 1)

    if args.warp:
        parts = args.warp.split(',')
        pyboy.memory[0xFF81] = int(parts[0]) & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = int(parts[1]) & 0xFF
            pyboy.memory[0xFF84] = 0x00

    held = set()
    guard = 0
    while len(samples) - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = len(samples) - base
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want
        pyboy.tick(1, False)

    trace = []
    for i, row in enumerate(samples[base:base + args.frames]):
        row['f'] = i + 1
        trace.append(row)

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    tag = args.tag or f'L{args.level:02d}'
    path = os.path.join(outdir, f'oamorder_{tag}.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'level': args.level, 'script': script, 'frames': trace}, fh)

    for t in trace:
        oam = t['oam']
        n = 12
        head = ' | '.join(f"{i}:{oam[i*4+1]:3d},{oam[i*4]:3d}#{oam[i*4+2]:02X}a{oam[i*4+3]:02X}"
                          for i in range(n))
        order = ' '.join(f"{h}@{t.get(h, -1)}" for h in t.get('hits', []))
        print(f"f{t['f']:3d} par={t['parity']} c740={t['c740']:02X} "
              f"cur={t['cursor']:02X} n={n} {order}")
        print(f"        {head}")
    print('wrote', path)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
