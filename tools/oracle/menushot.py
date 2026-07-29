#!/usr/bin/env python3
"""Record the MENU screens off the cartridge: pixels, LCD shadows, OAM.

The screens in src/title.js / roundselect.js / options.js are all claimed
byte-exact on VRAM.  This records what the cartridge actually DISPLAYS at a set
of landmarks, plus the per-frame palette/window shadows around each transition,
so the things a VRAM diff cannot see -- a fade that is missing, a window in the
wrong place, a sprite nobody draws -- show up as numbers.

Landmarks are counted per ROM loop hook, never per pyboy.tick.

Usage:
  python tools/oracle/menushot.py --out rip/oracle/menus.json
"""
import argparse
import json
import os
import sys

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

LOOPS = {'copy': 0x026C, 'title': 0x02C4, 'flash': 0x031D,
         'rs': 0x03DC, 'opt': 0x38D5}
SOUND_REQ = 0x0AE1

SHADOWS = {'bgp': 0xFFAD, 'obp0': 0xFFAE, 'obp1': 0xFFAF,
           'scx': 0xFFA9, 'scy': 0xFFAA, 'wx': 0xFFAB, 'wy': 0xFFAC}


def log(*a):
    print(*a, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='rip/oracle/menus.json')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    mem = pyboy.memory

    hits = dict.fromkeys(LOOPS, 0)
    for key, addr in LOOPS.items():
        pyboy.hook_register(0, addr,
                            (lambda k: lambda _: hits.__setitem__(k, hits[k] + 1))(key),
                            None)
    songs = []
    pyboy.hook_register(0, SOUND_REQ, lambda _: songs.append(
        (pyboy.register_file.B, pyboy.register_file.C, dict(hits))), None)

    out = {'snaps': {}, 'traces': {}, 'songs': None}

    def regs():
        r = {k: int(mem[a]) for k, a in SHADOWS.items()}
        r['lcdc'] = int(mem[0xFF40])
        return r

    def oam():
        return [[int(mem[0xFE00 + i * 4 + j]) for j in range(4)]
                for i in range(40) if int(mem[0xFE00 + i * 4])]

    def snap(tag):
        px = pyboy.screen.ndarray[:, :, 0]
        shades = [3 - min(3, int(v) * 4 // 256) for row in px for v in row]
        out['snaps'][tag] = {'screen': shades, 'regs': regs(), 'oam': oam(),
                             'hits': dict(hits)}
        log(f'  snap {tag}: {regs()} oam={len(oam())} hits={hits}')

    def run(n, render=True, trace=None):
        for _ in range(n):
            pyboy.tick(1, render)
            if trace is not None:
                trace.append({**{k: hits[k] for k in LOOPS}, **regs()})

    def until(pred, limit, what):
        for _ in range(limit):
            if pred():
                return
            pyboy.tick(1, True)
        raise SystemExit(f'FAIL: never reached {what} (hits={hits})')

    # ---- copyright screen (state 1) -------------------------------------
    until(lambda: hits['copy'] >= 100, 900, 'the copyright screen')
    run(1)
    snap('copyright')

    until(lambda: hits['title'] >= 40, 900, 'the title loop')
    out['copyright_loop_total'] = hits['copy']
    log('  copyright loop iterations:', hits['copy'])

    # ---- title, settled --------------------------------------------------
    run(1)
    snap('title')
    tr = []
    run(40, trace=tr)
    out['traces']['title'] = tr

    # the cursor blink, sampled with OAM
    blink = []
    for _ in range(40):
        pyboy.tick(1, True)
        blink.append({'ffb1': int(mem[0xFFB1]), 'oam': oam()})
    out['traces']['title_blink'] = blink

    # ---- title with the cursor on OPTION ---------------------------------
    pyboy.button('down', delay=4)
    run(20)
    snap('title-option')

    # ---- OPTIONS ---------------------------------------------------------
    at = hits['opt']
    pyboy.button('start', delay=4)
    tr = []
    for _ in range(200):
        pyboy.tick(1, True)
        tr.append({**{k: hits[k] for k in LOOPS}, **regs()})
        if hits['opt'] >= at + 90:
            break
    out['traces']['options_open'] = tr
    snap('options')

    pyboy.button('down', delay=4)
    run(20)
    snap('options-sound')
    pyboy.button('down', delay=4)
    run(20)
    snap('options-exit')

    at = hits['title']
    pyboy.button('start', delay=4)          # EXIT -> back to the title
    tr = []
    for _ in range(240):
        pyboy.tick(1, True)
        tr.append({**{k: hits[k] for k in LOOPS}, **regs()})
        if hits['title'] >= at + 40:
            break
    out['traces']['options_close'] = tr
    snap('title-after-options')

    # ---- START at the title -> flash -> round select ---------------------
    # $C712 came back 0 (START) from the options exit, so do NOT touch UP/DOWN.
    at = hits['flash']
    pyboy.button('start', delay=4)
    tr = []
    for _ in range(200):
        pyboy.tick(1, True)
        tr.append({**{k: hits[k] for k in LOOPS}, **regs(),
                   'tile9967': int(mem[0x9967])})
        if hits['flash'] == at + 4 and 'flash-4' not in out['snaps']:
            snap('flash-4')
        if hits['flash'] == at + 12 and 'flash-12' not in out['snaps']:
            snap('flash-12')
        if hits['rs'] >= 1:
            break
    out['traces']['flash'] = tr

    # ---- round select: the fade in, frame by frame -----------------------
    tr = []
    for _ in range(120):
        tr.append({**{k: hits[k] for k in LOOPS}, **regs(), 'oam': oam()})
        if hits['rs'] == 1 and 'roundselect-first' not in out['snaps']:
            snap('roundselect-first')
        if hits['rs'] == 20 and 'roundselect-h20' not in out['snaps']:
            snap('roundselect-h20')
        pyboy.tick(1, True)
    out['traces']['roundselect'] = tr
    run(30)
    snap('roundselect')

    out['songs'] = [{'id': b, 'mask': c, 'hits': h} for b, c, h in songs]
    dest = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w') as f:
        json.dump(out, f)
    log('wrote ' + dest)
    log('snaps: ' + ', '.join(out['snaps']))
    pyboy.stop(save=False)


if __name__ == '__main__':
    sys.exit(main())
