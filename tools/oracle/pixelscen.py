#!/usr/bin/env python3
"""Record the cartridge's SCREEN for gameplay frames, on ANY level.

tools/compare_screen.py does this for level 1 only -- it refuses anything else
because its boot path taps START through the menus.  This one injects $FFB0 at
loc_00_04BB exactly as tools/oracle/trace.py does (and as verify_assets.py
cross-checked against real route entry), so the parallax levels, the level-6
track and every enemy-heavy level become measurable in PIXELS instead of only
in registers.

Same alignment rules as trace.py: iteration-counted frames, one-frame input
lead, --warp applied after frame 1.

Per captured frame it stores the 160x144 shade buffer, shadow OAM, and the LCD
registers, in ONE json -- no PNG decoder needed on the JS side.

Usage:
  python tools/oracle/pixelscen.py --level 9 --frames 200 --script "20:,180:R" \
      --capture 40,80,120,160,200 --out rip/oracle/pix-l9.json
"""
import argparse
import importlib.util
import json
import os

import numpy as np
from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
FRAME_END = 0x0A4F


def _load_oracle_trace():
    path = os.path.join(ROOT, 'tools', 'oracle', 'trace.py')
    spec = importlib.util.spec_from_file_location('_roj_pix_trace', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


OT = _load_oracle_trace()

SHADE_OF_R = {255: 0, 153: 1, 85: 2, 0: 3}

IO = {'LCDC': 0xFF40, 'STAT': 0xFF41, 'SCY': 0xFF42, 'SCX': 0xFF43,
      'BGP': 0xFF47, 'OBP0': 0xFF48, 'OBP1': 0xFF49, 'WY': 0xFF4A,
      'WX': 0xFF4B}
HRAM = {'rasterMode': 0xFFC7, 'scxBase': 0xFFA9, 'scyBase': 0xFFAA,
        'wySrc': 0xFFAC, 'wxSrc': 0xFFAB, 'camXhi': 0xFFA2, 'camXlo': 0xFFA3,
        'camYhi': 0xFFA4, 'camYlo': 0xFFA5, 'frame': 0xFFB1, 'parity': 0xFFA7,
        'oamCursor': 0xFF9D, 'attrMask': 0xFF9E}
WRAM = {'waterLine': 0xC755, 'level': 0xFFB0, 'lag': 0xC757,
        'far': 0xC742, 'mid': 0xC743, 'trackScx': 0xFFCC}


def screen_shades(pyboy):
    a = np.asarray(pyboy.screen.ndarray)[:, :, 0]
    out = np.empty(a.shape, dtype=np.uint8)
    for v in np.unique(a):
        if int(v) not in SHADE_OF_R:
            raise RuntimeError(f'unexpected screen luminance {int(v)}')
        out[a == v] = SHADE_OF_R[int(v)]
    return out.reshape(-1).tolist()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=200)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--capture', default='40,80,120,160,200')
    ap.add_argument('--warp', default=None)
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--out', default='rip/oracle/pix.json')
    args = ap.parse_args()

    script = args.script or f'{args.frames}:R'
    timeline = OT.parse_script(script)
    capture = sorted({int(x) for x in args.capture.split(',') if x.strip()})
    # Neighbours, because the panel shows iteration N's OAM during frame N+1.
    wanted = sorted({f + o for f in capture for o in (-1, 0, 1, 2)
                     if 1 <= f + o <= args.frames + 2})

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    count = {'n': 0}
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)

    boot_frame = OT.boot_to_gameplay(pyboy, level=args.level)
    for name in set(OT.BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, count['n'] - 1)

    if args.ammo is not None:
        pyboy.memory[0xC759] = args.ammo & 0xFF
    if args.warp is not None:
        parts = args.warp.split(',')
        pyboy.memory[0xFF81] = int(parts[0]) & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = int(parts[1]) & 0xFF
            pyboy.memory[0xFF84] = 0x00

    grabbed = {}
    want = set(wanted)
    last = max(wanted) if wanted else 0
    held = set()
    guard = 0
    while count['n'] - base <= last and guard < last * 8 + 800:
        guard += 1
        idx = count['n'] - base
        nxt = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in nxt - held:
            pyboy.button_press(name)
        for name in held - nxt:
            pyboy.button_release(name)
        held = nxt
        pyboy.tick(1, True)
        now = count['n'] - base
        if now in want and now not in grabbed:
            mem = pyboy.memory
            regs = {k: mem[a] for k, a in IO.items()}
            regs.update({k: mem[a] for k, a in HRAM.items()})
            regs.update({k: mem[a] for k, a in WRAM.items()})
            raw = list(mem[0xFE00:0xFEA0])
            grabbed[now] = {
                'screen': screen_shades(pyboy),
                'regs': regs,
                'oam': [raw[i * 4:i * 4 + 4] for i in range(40)],
            }

    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-screen', 'level': args.level,
                   'script': script, 'warp': args.warp, 'ammo': args.ammo,
                   'bootFrame': boot_frame, 'capture': capture,
                   'frames': {str(k): v for k, v in grabbed.items()}}, fh)
    print(f'level {args.level} boot@{boot_frame}: captured '
          f'{len(grabbed)}/{len(wanted)} -> {out}')
    missing = [f for f in wanted if f not in grabbed]
    if missing:
        print(f'  MISSING {missing}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
