#!/usr/bin/env python3
"""Record the cartridge's SCREEN through a player death, in PIXELS.

WHY.  The death sequence is one of the best-verified things in this port --
deathdiff.mjs is 6/6 and gameoverdiff.mjs compares 13504 shadow-OAM bytes --
and NONE of that has ever been looked at as a picture.  Both of the last two
real bugs in this project were byte-exact in memory and wrong on screen, and
the GAME OVER lettering is exactly the shape that hides one: eight metasprites
walking a 276-byte path ACROSS the HUD and the dying player, where the answer
depends on OAM order (DMG sprite priority) and on the ten-per-line cut.  A
shadow-OAM diff cannot see either.

WHAT IT DRIVES.  Zeroing $FF8A is what the last point of damage leaves behind;
loc_00_17B6 starts sub_00_29E7 on its own and loc_00_2A0D runs the $C1C0 burst
for 452 iterations to loc_00_2AAD.  With `--lives 1` the same death is a GAME
OVER instead ($2ABA takes `JP Z, loc_00_0150`), which is a different picture
because the burst runs on a screen whose HUD is about to be wiped.

ALIGNMENT.  Same rules as pixelscen.py, which this is deliberately a sibling
of: iteration-counted frames off $0A4F, one-frame input lead, $FFB0 injected at
loc_00_04BB.  Capture indices are absolute main-loop iterations, and the kill
is applied at the END of iteration `--kill-at`, so a port twin that sets
player.hp = 0 after its own tick() number `--kill-at` sees the same thing.

Per captured frame: the 160x144 shade buffer, shadow OAM ($C000, which is what
the burst writes -- FE00 is a DMA copy of it), the LCD registers, and the eight
$C1C0 records so a divergence can be attributed without a second run.

Usage:
  python tools/oracle/deathpix.py --level 1 --kill-at 40 \
      --capture 60,100,200,320,440 --out rip/oracle/pix/death-l1.json
  python tools/oracle/deathpix.py --level 3 --kill-at 40 --lives 1 \
      --capture 60,200,440 --out rip/oracle/pix/gameover-l3.json
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
LAG_SET = 0x065C
DEATH_HANDOFF = 0x2AAD
RESET = 0x0150

HP = 0xFF8A
LIVES = 0xC767
BURST = 0xC1C0
ENEMY0_HP = 0xC268 + 0x16       # 1:$4E82's trigger, what the last punch leaves


def _load_trace():
    path = os.path.join(ROOT, 'tools', 'oracle', 'trace.py')
    spec = importlib.util.spec_from_file_location('_roj_deathpix_trace', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


OT = _load_trace()

SHADE_OF_R = {255: 0, 153: 1, 85: 2, 0: 3}

IO = {'LCDC': 0xFF40, 'SCY': 0xFF42, 'SCX': 0xFF43, 'BGP': 0xFF47,
      'OBP0': 0xFF48, 'OBP1': 0xFF49, 'WY': 0xFF4A, 'WX': 0xFF4B}
HRAM = {'frame': 0xFFB1, 'parity': 0xFFA7, 'oamCursor': 0xFF9D,
        'camXhi': 0xFFA2, 'camXlo': 0xFFA3, 'camYhi': 0xFFA4, 'camYlo': 0xFFA5}
WRAM = {'level': 0xFFB0, 'lag': 0xC757, 'lives': 0xC767, 'countdown': 0xC740,
        'dead': 0xC715, 'hp': 0xFF8A}


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
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--kill-at', type=int, default=40)
    ap.add_argument('--lives', type=int, default=None,
                    help='$C767 before the kill; 1 makes this death a GAME OVER')
    ap.add_argument('--boss', action='store_true',
                    help='kill the BOSS (enemy 0 +$16) instead of the player: '
                         'the $C740 countdown, the explosions and loc_00_34D0 '
                         "-- the STAGE CLEAR screen, which has only ever been "
                         'compared as VRAM, never as pixels')
    ap.add_argument('--script', default=None)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--capture', default='60,100,200,320,440')
    ap.add_argument('--frames', type=int, default=520)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    script = args.script or f'{args.frames}:'
    timeline = OT.parse_script(script)
    capture = sorted({int(x) for x in args.capture.split(',') if x.strip()})
    # The panel shows iteration N's OAM during N+1, exactly as pixelscen.py
    # documents, so keep the neighbours and let the JS side pick its lag.
    wanted = sorted({f + o for f in capture for o in (-1, 0, 1, 2)
                     if 1 <= f + o <= args.frames + 2})

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    count = {'n': 0, 'lag': 0}
    marks = {'handoff': None, 'reset': None}
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)
    pyboy.hook_register(0, LAG_SET,
                        lambda _: count.__setitem__('lag', count['lag'] + 1), None)

    boot_frame = OT.boot_to_gameplay(pyboy, level=args.level)
    for name in set(OT.BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, count['n'] - 1)

    def rel(_):
        return count['n'] - base

    pyboy.hook_register(0, DEATH_HANDOFF,
                        lambda _: marks.__setitem__('handoff', rel(None))
                        if marks['handoff'] is None else None, None)
    pyboy.hook_register(0, RESET,
                        lambda _: marks.__setitem__('reset', rel(None))
                        if marks['reset'] is None else None, None)

    if args.warp is not None:
        parts = args.warp.split(',')
        m[0xFF81] = int(parts[0]) & 0xFF
        m[0xFF82] = 0x80
        if len(parts) > 1:
            m[0xFF83] = int(parts[1]) & 0xFF
            m[0xFF84] = 0x00

    grabbed = {}
    want = set(wanted)
    last = max(wanted) if wanted else 0
    held = set()
    killed = False
    guard = 0
    while count['n'] - base <= last and guard < last * 8 + 2000:
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
        if not killed and now >= args.kill_at:
            if args.lives is not None:
                m[LIVES] = args.lives & 0xFF
            m[ENEMY0_HP if args.boss else HP] = 0
            killed = True
        if now in want and now not in grabbed:
            regs = {k: m[a] for k, a in IO.items()}
            regs.update({k: m[a] for k, a in HRAM.items()})
            regs.update({k: m[a] for k, a in WRAM.items()})
            raw = list(m[0xC000:0xC0A0])
            grabbed[now] = {
                'screen': screen_shades(pyboy),
                'regs': regs,
                'oam': [raw[i * 4:i * 4 + 4] for i in range(40)],
                'burst': [[m[BURST + i * 5 + j] for j in range(5)]
                          for i in range(8)],
            }

    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-screen', 'level': args.level,
                   'script': script, 'killAt': args.kill_at,
                   'boss': bool(args.boss),
                   'lives': args.lives, 'warp': args.warp,
                   'bootFrame': boot_frame, 'capture': capture,
                   'lag': count['lag'], 'handoff': marks['handoff'],
                   'reset': marks['reset'],
                   'frames': {str(k): v for k, v in grabbed.items()}}, fh)
    print(f'level {args.level} kill@{args.kill_at} lives={args.lives}: '
          f'captured {len(grabbed)}/{len(wanted)}, handoff={marks["handoff"]}, '
          f'reset={marks["reset"]}, lag={count["lag"]} -> {out}')
    missing = [f for f in wanted if f not in grabbed]
    if missing:
        print(f'  MISSING {missing}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
