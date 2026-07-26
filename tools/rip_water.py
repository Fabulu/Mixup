#!/usr/bin/env python3
"""Capture a level's ANIMATED TILES, plus the window tilemap where there is one.

Two separate things make water look like water in this game, and neither is in
the level's exported VRAM:

1. The window tilemap at $9C00. Level init fills it with tile $01 ($04C9,
   $0E0C), and then a VRAM script at $0E24 overwrites the top two rows with a
   textured surface. Our VRAM export is taken at level init, BEFORE that script
   runs, so the export shows only the flat fill.

2. Tile ANIMATION. A generic animated-tile streamer (loc_00_3127, driven by
   $C70F/$C710 against per-level tables at 2:$61A4, 0:$31EE, 0:$3246 and
   0:$3295) rewrites tile bitmaps in place through a VRAM write queue that the
   VBlank ISR drains. In level 1 that covers fourteen tiles: the falling water
   ($74-$7B), the surface ($E0-$E3) and $F1/$F3. The tilemaps never change --
   only the bitmaps do.

Porting the streamer means porting its write queue too, so the frames are
CAPTURED here, exactly as tools/rip_title.py captures the title screen. Same
trade, same escape route. The cadence is measured, not assumed.

Which levels animate is not a guess: 0:$31EE holds a per-level destination
table pointer and $FFFF means "none". Levels 1, 2, 3, 5, 6, 7, 12 and 13 have
animated tiles; 4, 8-11 and 14 have none.

  python tools/rip_water.py                        # -> assets/water.json
  python tools/rip_water.py --levels 1,2,3,5,6,7,12,13
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
LEVEL_INIT = 0x04BB
WINDOW_MAP = 0x9C00

# BG tiles use the signed $8800 region, i.e. $8800-$97FF. Anything below that
# is OBJ-only, and $8000-$80BF in particular is the player's own tile streamer
# (sub_00_2C13) -- already ported, and not what we are looking for here.
BG_LO, BG_HI = 0x8800, 0x9800


def bg_id(addr):
    return (addr - 0x9000) // 16 if addr >= 0x9000 else 0x80 + (addr - 0x8800) // 16


def capture(level, col, settle, sample):
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    started = {'v': False}
    count = {'n': 0}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)
    if level != 1:
        pyboy.hook_register(
            0, LEVEL_INIT,
            lambda _: pyboy.memory.__setitem__(0xFFB0, level), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)

    m = pyboy.memory
    base = count['n']
    # Level 1 only: stand past the waterfall trigger (column $36) so the
    # stamped column exists. Everywhere else the player is left at the level
    # start -- tile animation is global VRAM state, not positional, and warping
    # past a level's width (level 2 is 33 metatiles wide) wedges the boot.
    if level == 1:
        m[0xFF81] = col
        m[0xFF82] = 0x80
    while count['n'] - base < settle:
        pyboy.tick(1, False)

    tilemap = list(m[WINDOW_MAP:WINDOW_MAP + 1024])

    # Read the whole tile block as ONE slice per frame. Reading it byte by byte
    # is 2048 Python-level calls per frame and turns a 30-second capture into
    # a 30-minute one.
    addrs = list(range(BG_LO, BG_HI, 16))
    nslots = len(addrs)
    last = {}
    variants = {a: [] for a in addrs}
    changes = {a: [] for a in addrs}
    for _ in range(sample):
        target = count['n'] + 1
        # Guard the wait: if the frame hook ever stops firing (a level that
        # never reaches the main loop, say) this must not spin forever.
        spins = 0
        while count['n'] < target and spins < 200:
            pyboy.tick(1, False)
            spins += 1
        f = count['n'] - base
        block = bytes(m[BG_LO:BG_HI])
        for s in range(nslots):
            a = addrs[s]
            b = block[s * 16:(s + 1) * 16]
            if last.get(a) != b:
                if a in last:
                    changes[a].append(f)
                last[a] = b
                if b not in variants[a]:
                    variants[a].append(b)

    anim = [a for a in addrs if len(variants[a]) > 1]
    pyboy.stop(save=False)

    if not anim:
        return {'animIds': [], 'holdFrames': 0, 'frames': [], 'map': tilemap}

    # Every animated tile in a level shares one cadence and one variant count;
    # assert that rather than assume it, because the streamer is per-level.
    counts = {len(variants[a]) for a in anim}
    holds = []
    for a in anim:
        d = [y - x for x, y in zip(changes[a], changes[a][1:])]
        if d:
            holds.append(max(set(d), key=d.count))
    hold = max(set(holds), key=holds.count) if holds else 8
    if len(counts) > 1:
        print('  WARNING: differing variant counts %s -- using the smallest' % counts)
    n = min(counts)

    ids = [bg_id(a) for a in anim]
    print('  animated BG tiles: %s' % ' '.join('$%02X' % i for i in ids))
    print('  %d variants, %d frames each' % (n, hold))
    return {
        'animIds': ids,
        'holdFrames': hold,
        # frames[v][i] = the 16 bytes of animIds[i] during variant v
        'frames': [[list(variants[a][v]) for a in anim] for v in range(n)],
        'map': tilemap,
    }


def main():
    ap = argparse.ArgumentParser()
    # Every level whose 0:$31EE entry is not $FFFF.
    ap.add_argument('--levels', default='1,2,3,5,6,7,12,13')
    ap.add_argument('--col', type=int, default=74,
                    help='where to stand; must be past the waterfall trigger')
    ap.add_argument('--settle', type=int, default=120)
    # The cycle is a handful of variants a few frames apart, so a short window
    # characterises it completely; sampling hundreds of frames only makes the
    # capture slow.
    ap.add_argument('--sample', type=int, default=90)
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets/water.json'))
    args = ap.parse_args()

    levels = [int(x) for x in args.levels.split(',') if x.strip()]
    out = {'note': 'CAPTURE, not a translation -- see tools/rip_water.py',
           'levels': {}}
    for lvl in levels:
        print('level %d:' % lvl)
        out['levels'][str(lvl)] = capture(lvl, args.col, args.settle, args.sample)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(out, f)
    print('->', args.out)


if __name__ == '__main__':
    main()
