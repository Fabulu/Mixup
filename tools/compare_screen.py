#!/usr/bin/env python3
"""Dump the REAL game's screen for chosen gameplay frames.

Boots the ROM through the menus (same pattern as tools/oracle/trace.py), drives
a scripted input sequence with the same one-frame lead and the same
main-loop-iteration clock the physics oracle uses, and writes, per captured
frame:

  * i<NNNN>.png -- an 8-bit *indexed* PNG whose palette index IS the DMG shade
                   (0 lightest .. 3 darkest), byte-identical in format to the
                   goldens written by tools/golden.mjs, so the JS side can read
                   them back without a decoder for two formats
  * an entry in meta.json holding shadow OAM ($FE00) and the LCD / raster
    registers for that frame -- that is what lets tools/compare_visual.mjs
    attribute a pixel delta to a specific unimplemented feature instead of
    guessing.

Screens are captured for every requested frame AND its +-1 neighbours, because
the ROM renders iteration N's shadow OAM during the *following* frame; the JS
comparator searches those offsets rather than assuming one.

The emulator never ships; this is a test oracle only.

Usage:
  python tools/compare_screen.py --frames 150 --script "20:,130:R" \
         --capture 30,60,90,120,150 --out rip/real/fall-and-walk
"""
import argparse
import importlib.util
import json
import os
import struct
import zlib

import numpy as np
from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
FRAME_END = 0x0A4F        # sub_00_0A4F, the main loop's VBlank wait


def _load_oracle_trace():
    """Import tools/oracle/trace.py under a private name.

    It cannot be imported as `trace` -- that shadows the stdlib module.
    """
    path = os.path.join(ROOT, 'tools', 'oracle', 'trace.py')
    spec = importlib.util.spec_from_file_location('_roj_oracle_trace', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


OT = _load_oracle_trace()

# PyBoy's DMG greys -> shade index (0 = lightest).  Verified empirically on a
# gameplay frame: the screen only ever contains these four values.
SHADE_OF_R = {255: 0, 153: 1, 85: 2, 0: 3}

# Registers worth recording for delta attribution.
IO = {'LCDC': 0xFF40, 'STAT': 0xFF41, 'SCY': 0xFF42, 'SCX': 0xFF43,
      'LY': 0xFF44, 'BGP': 0xFF47, 'OBP0': 0xFF48, 'OBP1': 0xFF49,
      'WY': 0xFF4A, 'WX': 0xFF4B}
HRAM = {'rasterMode': 0xFFC7, 'scxBase': 0xFFA9, 'scyBase': 0xFFAA,
        'wySrc': 0xFFAC, 'camXhi': 0xFFA2, 'camXlo': 0xFFA3,
        'camYhi': 0xFFA4, 'camYlo': 0xFFA5, 'frame': 0xFFB1,
        'oamCursor': 0xFF9D, 'attrMask': 0xFF9E}
WRAM = {'waterLine': 0xC755, 'level': 0xFFB0}

# Render-lag offsets stored around each requested frame.
LAGS = (-1, 0, 1, 2)


# --- minimal indexed-PNG writer (stdlib only) ------------------------------
def write_indexed_png(path, w, h, indices, palette):
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += bytes(indices[y * w:(y + 1) * w])
    plte = bytearray()
    for c in palette:
        plte += bytes(c[:3])
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n')
        fh.write(chunk(b'IHDR', ihdr))
        fh.write(chunk(b'PLTE', bytes(plte)))
        fh.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b'IEND', b''))


# Same DMG green as src/render/renderer.js DMG_PALETTE, so a golden PNG and a
# real PNG look alike side by side.  Purely cosmetic: the stored bytes are
# shade indices either way.
DMG_PALETTE = [(0xE0, 0xF8, 0xD0), (0x88, 0xC0, 0x70),
               (0x34, 0x68, 0x56), (0x08, 0x18, 0x20)]


def screen_shades(pyboy):
    """160x144 shade indices (0..3) from the emulator's RGBA screen."""
    a = np.asarray(pyboy.screen.ndarray)[:, :, 0]
    out = np.empty(a.shape, dtype=np.uint8)
    seen = np.unique(a)
    for v in seen:
        if int(v) not in SHADE_OF_R:
            raise RuntimeError(f'unexpected screen luminance {int(v)}')
        out[a == v] = SHADE_OF_R[int(v)]
    return out.reshape(-1)


def snapshot_regs(mem):
    d = {}
    for name, addr in IO.items():
        d[name] = mem[addr]
    for name, addr in HRAM.items():
        d[name] = mem[addr]
    for name, addr in WRAM.items():
        d[name] = mem[addr]
    return d


def snapshot_oam(mem):
    """40 x {y,x,tile,attr} from shadow OAM's live copy at $FE00.

    OAM coordinates are screen + (8, 16); the JS side undoes that.
    """
    raw = list(mem[0xFE00:0xFEA0])
    return [raw[i * 4:i * 4 + 4] for i in range(40)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=150)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--capture', default='30,60,90,120',
                    help='comma-separated 1-based frame numbers')
    ap.add_argument('--out', default='rip/real/scenario')
    ap.add_argument('--settle', type=int, default=0)
    args = ap.parse_args()

    if args.level != 1:
        raise SystemExit('compare_screen.py can only reach level 1: the boot '
                         'path taps START through the menus and does not drive '
                         'the round-select. Other levels need a save state.')

    script = args.script or f'{args.frames}:R'
    timeline = OT.parse_script(script)
    capture = sorted({int(x) for x in args.capture.split(',') if x.strip()})
    # Neighbours so the comparator can search the render lag. The ROM shows
    # iteration N's shadow OAM during the following frame (lag +1); the very
    # first gameplay iteration is entered mid-tick, so frame 1 lands at +2.
    wanted = sorted({f + o for f in capture for o in LAGS
                     if 1 <= f + o <= args.frames + 2})

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    count = {'n': 0}
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)

    boot_frame = OT.boot_to_gameplay(pyboy)
    for name in set(OT.BUTTONS.values()):
        pyboy.button_release(name)
    for _ in range(args.settle):
        pyboy.tick(1, False)

    # boot_to_gameplay returns having already completed the first gameplay
    # iteration; that one is frame 1 (see docs/03-VERIFICATION.md).
    base = max(0, count['n'] - 1)

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    grabbed = {}
    want = set(wanted)
    last_needed = max(wanted) if wanted else 0

    held = set()
    guard = 0
    while count['n'] - base <= last_needed and guard < last_needed * 8 + 800:
        guard += 1
        idx = count['n'] - base
        # One-frame input lead, exactly as tools/oracle/trace.py.
        nxt = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in nxt - held:
            pyboy.button_press(name)
        for name in held - nxt:
            pyboy.button_release(name)
        held = nxt
        pyboy.tick(1, True)

        now = count['n'] - base
        if now in want and now not in grabbed:
            shades = screen_shades(pyboy)
            write_indexed_png(os.path.join(outdir, f'i{now:04d}.png'),
                              160, 144, shades, DMG_PALETTE)
            grabbed[now] = {'regs': snapshot_regs(pyboy.memory),
                            'oam': snapshot_oam(pyboy.memory)}

    meta = {'source': 'pyboy-screen', 'rom': os.path.basename(ROM),
            'script': script, 'level': args.level, 'bootFrame': boot_frame,
            'capture': capture, 'stored': sorted(grabbed),
            'frames': {str(k): v for k, v in grabbed.items()}}
    with open(os.path.join(outdir, 'meta.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, indent=1)

    missing = [f for f in wanted if f not in grabbed]
    print(f'gameplay started at emulator frame {boot_frame}')
    print(f'script "{script}", captured {len(grabbed)}/{len(wanted)} frames '
          f'-> {outdir}')
    if missing:
        print(f'  MISSING: {missing}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
