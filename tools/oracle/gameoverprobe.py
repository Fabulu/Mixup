#!/usr/bin/env python3
"""What IS the thing that appears when Batman dies?

SAVEPOINT item 2 calls it "the snaking pseudo-3D game-over / continue
lettering" and filed it under the raster program.  tools/oracle/rasterhunt.py
already disproved the raster premise -- zero STAT fires across 388 frames of
those screens.  This probe settles the other half, what the effect actually
IS, by LOOKING, which for "what does it draw" is the right instrument.

From a real death on the cartridge it prints:

  * the eight metasprites 0:$2ACF names, rendered as ASCII out of LIVE VRAM
    (a boot-time read is not proof -- the OBJ region is streamed);
  * the flight path slot 0 walks, as an ASCII plot;
  * the screen the burst's own OAM makes, at frames you choose.

Usage:
  python tools/oracle/gameoverprobe.py --level 1 --at 110,150,200,480
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
DEATH_HANDOFF = 0x2AAD
RESET = 0x0150
DRAW_MOVING = 0x2A6A
DRAW_PARKED = 0x2AA8
SHADOW_OAM = 0xC000
BURST = 0xC1C0
IDS = 0x2ACF

SHADES = ' .+#'
SCREEN_W, SCREEN_H = 160, 144


def tile_ascii(m, tile, rows=16):
    """`rows` lines of an 8x16 OBJ tile, read out of live VRAM at $8000."""
    out = []
    base = 0x8000 + tile * 16
    for y in range(rows):
        lo, hi = m[base + y * 2], m[base + y * 2 + 1]
        out.append(''.join(SHADES[((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1)]
                           for x in range(8)))
    return out


def plot_path(points, w=25, h=20):
    """Slot 0's whole flight, in OAM coordinates, squashed to a text grid."""
    grid = [[' '] * w for _ in range(h)]

    def cell(p):
        return (min(w - 1, max(0, (p[0] - 8) * w // 176)),
                min(h - 1, max(0, (p[1] - 16) * h // 160)))

    for p in points:
        gx, gy = cell(p)
        grid[gy][gx] = '.'
    sx, sy = cell(points[0])
    ex, ey = cell(points[-1])
    grid[sy][sx] = 'S'
    grid[ey][ex] = 'E'
    return ['+' + '-' * w + '+'] + ['|' + ''.join(r) + '|' for r in grid] \
        + ['+' + '-' * w + '+']


def compose(draws, glyphs):
    """The burst's own OAM, rasterised. Nothing else on the screen is drawn."""
    scr = [[' '] * SCREEN_W for _ in range(SCREEN_H)]
    for y, x, tile, _attr in draws:
        art = glyphs.get(tile)
        if not art:
            continue
        for yy in range(16):
            for xx in range(8):
                c = art[yy][xx]
                if c == ' ':
                    continue
                sy, sx = y - 16 + yy, x - 8 + xx
                if 0 <= sy < SCREEN_H and 0 <= sx < SCREEN_W:
                    scr[sy][sx] = c
    # 2:1 horizontally, 3:1 vertically -- enough to read eight 8x16 letters.
    return ['|' + ''.join(scr[r][c] for c in range(0, SCREEN_W, 2)) + '|'
            for r in range(0, SCREEN_H, 3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--frames', type=int, default=900)
    ap.add_argument('--at', default='110,150,200,480',
                    help='comma-separated iterations to compose a screen for')
    ap.add_argument('--out', default='rip/oracle/gameoverprobe.json')
    args = ap.parse_args()
    at = {int(v) for v in args.at.split(',') if v.strip()}

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    ctr = {'n': 0, 'started': False}
    hits = {'handoff': 0, 'reset': 0}
    injected = {'v': False}
    pending = []
    rows = []
    base = {'n': 0}
    active = {'v': False}

    def on_level_init(_):
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    def frame_end(_):
        ctr['n'] += 1
        if active['v']:
            oam = [m[SHADOW_OAM + i] for i in range(0xA0)]
            rows.append({'f': ctr['n'] - base['n'],
                         'draws': [oam[c:c + 4] for c in pending],
                         'slot0': [m[BURST + 3], m[BURST + 4]],
                         'flags0': m[BURST]})
        pending.clear()

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: ctr.__setitem__('started', True), None)
    pyboy.hook_register(0, FRAME_END, frame_end, None)
    pyboy.hook_register(0, DRAW_MOVING, lambda _: pending.append(m[0xFF9D]), None)
    pyboy.hook_register(0, DRAW_PARKED, lambda _: pending.append(m[0xFF9D]), None)
    pyboy.hook_register(0, DEATH_HANDOFF,
                        lambda _: hits.__setitem__('handoff', hits['handoff'] + 1), None)
    pyboy.hook_register(0, RESET,
                        lambda _: hits.__setitem__('reset', hits['reset'] + 1), None)

    for f in range(3000):
        if ctr['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before believing a single row.
    if not ctr['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got {m[0xFFB0]}')

    # $0150 fires once during boot; leaving that count in makes the very first
    # tick look like a landing.
    hits['handoff'] = hits['reset'] = 0
    base['n'] = ctr['n']
    active['v'] = True

    poked = {'v': False}
    while ctr['n'] - base['n'] < args.frames:
        if not poked['v'] and ctr['n'] - base['n'] >= args.poke_at:
            poked['v'] = True
            m[0xFF8A] = 0                       # loc_00_17B6's own trigger
        pyboy.tick(1, False)
        if hits['handoff'] or hits['reset']:
            break

    if not hits['handoff'] and not hits['reset']:
        raise SystemExit('FAIL: the death sequence never landed')

    ids = [m[IDS + i] for i in range(8)]
    tiles = []
    for r in reversed(rows):                    # the last fully-drawn frame
        if len(r['draws']) == 8:
            tiles = [d[2] for d in r['draws']]
            break
    if not tiles:
        raise SystemExit('FAIL: no frame drew all eight slots')
    glyphs = {t: tile_ascii(m, t) for t in dict.fromkeys(tiles)}

    print(f'0:$2ACF = {" ".join("$%02X" % v for v in ids)}')
    print(f'OBJ tiles drawn = {" ".join("$%02X" % t for t in tiles)}')
    print('\nthe glyphs, out of live VRAM:')
    order = list(dict.fromkeys(tiles))
    for r in range(16):
        print('   ' + '  '.join(glyphs[t][r] for t in order))
    print('   ' + '  '.join('$%02X    ' % t for t in order))

    path = [r['slot0'] for r in rows if r['flags0']]
    print(f'\nslot 0 walks {len(path)} steps, '
          f'X {min(p[0] for p in path)}..{max(p[0] for p in path)} '
          f'Y {min(p[1] for p in path)}..{max(p[1] for p in path)}:')
    for line in plot_path(path):
        print('   ' + line)

    by_f = {r['f']: r for r in rows}
    for f in sorted(at):
        if f not in by_f:
            continue
        print(f'\nframe {f} -- the burst\'s OAM, and nothing else:')
        for line in compose(by_f[f]['draws'], glyphs):
            print('   ' + line)

    out = {'level': args.level, 'ids': ids, 'tiles': tiles,
           'glyphs': {str(k): v for k, v in glyphs.items()},
           'landed': 'handoff' if hits['handoff'] else 'reset',
           'iterations': ctr['n'] - base['n'], 'frames': rows}
    p = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as fh:
        json.dump(out, fh)
    print(f'\nwrote {p} ({len(rows)} iterations, landed on {out["landed"]})')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
