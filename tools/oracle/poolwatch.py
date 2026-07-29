#!/usr/bin/env python3
"""Watch the $C6CF pool (and the player's HP) on any level, no kill injected.

drops.py answers "what does a dying enemy leave behind"; this answers "what
else writes the pool during ordinary play". The level-6 vehicle's shot
(1:$57CB) and the breakable-block spawn ($20A4) both go through the same
allocator, so a pool entry appearing with nobody dying is the thing to look
for.

  python tools/oracle/poolwatch.py --level 6 --frames 300
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB
SAMPLE = 0x0A4F

POOL = 0xC6CF
HP, HP_MAX = 0xFF8A, 0xFF8E
KNOCKBACK = 0xC714

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        names = {BUTTONS[k.upper()] for k in keys.strip() if k.upper() in BUTTONS}
        out.extend([names] * int(n))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=6)
    ap.add_argument('--frames', type=int, default=300)
    ap.add_argument('--script', default='')
    ap.add_argument('--warp', default=None)
    args = ap.parse_args()

    pb = PyBoy(ROM, window='null', sound_emulated=False)
    if args.level != 1:
        pb.hook_register(0, LEVEL_INIT,
                         lambda _: pb.memory.__setitem__(0xFFB0, args.level), None)
    started = {'f': None}
    ctx = {'f': 0}
    pb.hook_register(0, MAIN_LOOP,
                     lambda c: started.__setitem__('f', c['f'])
                     if started['f'] is None else None, ctx)
    for f in range(3000):
        ctx['f'] = f
        if started['f'] is not None:
            break
        if f % 10 == 0:
            pb.button_press('start')
        elif f % 10 == 5:
            pb.button_release('start')
        pb.tick(1, False)
    pb.button_release('start')

    m = pb.memory
    if args.warp:
        parts = args.warp.split(',')
        m[0xFF81] = int(parts[0])
        m[0xFF82] = 0x80
        if len(parts) > 1:
            m[0xFF83] = int(parts[1])
            m[0xFF84] = 0

    script = parse_script(args.script) if args.script else []
    prev = None
    spawns = 0
    for f in range(args.frames):
        keys = script[f] if f < len(script) else set()
        for name in BUTTONS.values():
            if name in keys:
                pb.button_press(name)
            else:
                pb.button_release(name)
        pb.tick(1, False)
        live = []
        for i in range(4):
            s = bytes(m[POOL + i * 8:POOL + i * 8 + 8])
            if s[0]:
                live.append((i, s))
        sig = tuple((i, s[0], s[7]) for i, s in live)
        body = '  '.join(
            f'#{i} k={s[0]:02X} x={s[1]:02X}{s[2]:02X} y={s[3]:02X}{s[4]:02X} '
            f'vx={s[5]:02X} vy={s[6]:02X} sub={s[7]:02X}' for i, s in live)
        if sig != prev:
            print(f'f{f+1:4d} hp={m[HP]:2d} kb={m[KNOCKBACK]:02X}  '
                  f'{body or "(empty)"}')
            if len(live) > (len(prev) if prev else 0):
                spawns += 1
            prev = sig
    print(f'-- pool spawn events: {spawns}, final hp {m[HP]}')
    pb.stop(save=False)


if __name__ == '__main__':
    main()
