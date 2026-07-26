#!/usr/bin/env python3
"""Capture the level-1/2 water: the window tilemap and its tile animation.

The water body is drawn by the WINDOW layer. Its tilemap at $9C00 is a two-row
textured surface over a solid fill, and the surface ANIMATES -- the game
rewrites the four surface tiles' bitmaps in place, cycling through a few
variants, which is what makes the water look like it is flowing.

That animation comes from a generic animated-tile streamer (loc_00_3127, driven
by $C70F/$C710 with per-level tables at 2:$61A4, 0:$31EE, 0:$3246 and 0:$3295).
Porting the streamer means porting its VRAM write queue as well, so for now the
frames are CAPTURED here, exactly as tools/rip_title.py captures the title
screen. Same trade, same escape route: when the streamer is ported, this goes.

  python tools/rip_water.py            # -> assets/water.json
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
WINDOW_MAP = 0x9C00


def tile_addr(tid):
    """Signed $8800 addressing, as LCDC bit 4 = 0 selects."""
    return 0x9000 + tid * 16 if tid < 0x80 else 0x8800 + (tid - 0x80) * 16


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--col', type=int, default=74,
                    help='where to stand so the water is live')
    ap.add_argument('--settle', type=int, default=300)
    ap.add_argument('--sample', type=int, default=400,
                    help='frames to watch for animation variants')
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets/water.json'))
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    started = {'v': False}
    count = {'n': 0}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)
    if args.level != 1:
        pyboy.hook_register(
            0, 0x04BB,
            lambda _: pyboy.memory.__setitem__(0xFFB0, args.level), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)

    m = pyboy.memory
    base = count['n']
    m[0xFF81] = args.col
    m[0xFF82] = 0x80
    while count['n'] - base < args.settle:
        pyboy.tick(1, False)

    # The map itself never changes once the level is up.
    tilemap = [m[WINDOW_MAP + i] for i in range(1024)]
    ids = sorted(set(tilemap))
    print('window map tile ids:', [hex(v) for v in ids])
    print('row 0:', ' '.join('%02X' % tilemap[i] for i in range(20)))
    print('row 1:', ' '.join('%02X' % tilemap[32 + i] for i in range(20)))

    # Watch each id's bitmap; the ones that change are the animated surface.
    seen = {t: [] for t in ids}          # id -> list of distinct bitmaps, in order
    changes = {t: [] for t in ids}       # id -> frames at which it changed
    last = {}
    for _ in range(args.sample):
        target = count['n'] + 1
        while count['n'] < target:
            pyboy.tick(1, False)
        f = count['n'] - base
        for t in ids:
            a = tile_addr(t)
            b = bytes(m[a + i] for i in range(16))
            if last.get(t) != b:
                if t in last:
                    changes[t].append(f)
                last[t] = b
                if b not in seen[t]:
                    seen[t].append(b)

    anim_ids = [t for t in ids if len(seen[t]) > 1]
    static_ids = [t for t in ids if len(seen[t]) == 1]
    print('animated tiles:', [hex(t) for t in anim_ids])
    print('static tiles:  ', [hex(t) for t in static_ids])

    # Frames between successive changes -> the hold time per variant.
    period = None
    if anim_ids:
        deltas = [b - a for a, b in zip(changes[anim_ids[0]], changes[anim_ids[0]][1:])]
        if deltas:
            period = max(set(deltas), key=deltas.count)
    print('variants:', len(seen[anim_ids[0]]) if anim_ids else 0,
          ' hold frames:', period)

    out = {
        'note': 'CAPTURE, not a translation -- see tools/rip_water.py',
        'level': args.level,
        'map': tilemap,
        'animIds': anim_ids,
        'holdFrames': period or 8,
        # frames[v][i] = the 16 bytes of animIds[i] during variant v
        'frames': [[list(seen[t][v]) for t in anim_ids]
                   for v in range(len(seen[anim_ids[0]]) if anim_ids else 0)],
        'static': {str(t): list(seen[t][0]) for t in static_ids},
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(out, f)
    print('->', args.out)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
