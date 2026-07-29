#!/usr/bin/env python3
"""Record every WRITE to the expanded map ($D000) the cartridge makes, frame by
frame, plus hp/ammo/hpMax.

Terrain bugs show up as a cell the ROM changes and the port does not (or the
other way round, or the same change one column over). Diffing the whole map per
frame is the only way to see all of them at once; a hand-picked cell list only
finds what you already suspected.

  python tools/oracle/mapdelta.py --level 7 --warp 13,26 --frames 120 \
      --script "1:,119:R" --out rip/terrain/rom-l7.json
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
LEVEL_INIT = 0x04BB
BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        names = {BUTTONS[k.upper()] for k in keys.strip() if k.upper() in BUTTONS}
        out.extend([names] * int(n))
    return out


def boot(pyboy, level=1, max_frames=2000):
    started = {'f': None}
    ctx = {'f': 0}
    if level != 1:
        pyboy.hook_register(0, LEVEL_INIT,
                            lambda _: pyboy.memory.__setitem__(0xFFB0, level), None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda c: started.__setitem__('f', c['f'])
                        if started['f'] is None else None, ctx)
    for f in range(max_frames):
        ctx['f'] = f
        if started['f'] is not None:
            return f
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--width', type=int, default=None)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    script = args.script or f'{args.frames}:R'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    width = args.width
    if width is None:
        with open(os.path.join(ROOT, 'assets', 'levels',
                               f'{args.level:02d}.map.bin'), 'rb') as fh:
            width = len(fh.read()) // 32

    nbytes = width * 32
    prev = {'buf': None}
    rows = []

    def snap(_):
        m = pyboy.memory
        buf = bytes(m[0xD000:0xD000 + nbytes])
        changed = []
        if prev['buf'] is not None:
            p = prev['buf']
            for i in range(0, nbytes, 2):
                if buf[i] != p[i] or buf[i + 1] != p[i + 1]:
                    changed.append([i // 32, (i % 32) // 2, buf[i], buf[i + 1]])
        prev['buf'] = buf
        rows.append({'x': (m[0xFF81] << 8) | m[0xFF82],
                     'y': (m[0xFF83] << 8) | m[0xFF84],
                     'air': m[0xFF80], 'hp': m[0xFF8A], 'hpMax': m[0xFF8E],
                     'ammo': m[0xC759], 'cling': m[0xFFB2],
                     'chg': changed})

    pyboy.hook_register(0, FRAME_END, snap, None)
    b = boot(pyboy, level=args.level)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, len(rows) - 1)

    if args.warp is not None:
        parts = args.warp.split(',')
        pyboy.memory[0xFF81] = int(parts[0]) & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = int(parts[1]) & 0xFF
            pyboy.memory[0xFF84] = 0x00

    held = set()
    guard = 0
    while len(rows) - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = len(rows) - base
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want
        pyboy.tick(1, False)

    frames = []
    for i, r in enumerate(rows[base:base + args.frames]):
        r['f'] = i + 1
        frames.append(r)
    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'level': args.level, 'script': script, 'warp': args.warp,
                   'width': width, 'frames': frames}, fh)
    print(f'wrote {out} ({len(frames)} frames, boot {b})')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
