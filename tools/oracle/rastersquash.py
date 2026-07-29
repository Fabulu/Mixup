#!/usr/bin/env python3
"""Mode 7 -- the OPTIONS squash (loc_00_0935) -- per scanline, from the title.

rastertrace.py boots into a LEVEL, and mode 7 belongs to a screen instead: it
is armed at $38AB when START is pressed on the title's OPTION entry.  So this
walks the real menu (START to the title loop, DOWN to move $C712, START again),
asserts it landed at loc_00_3893, and then records the same thing rastertrace
does -- rLY at the ISR entry, rSCY/rBGP at the arm's exit -- for the whole
transition.

Mode 7 re-arms rLYC every single line ($0937: INC (HL)), so a frame here is up
to 144 STAT fires rather than three.  It also carries the one byte of state the
squash has, $C763, which the VBlank half ramps 0 -> ceiling one step every 8th
frame ($0835-$0851).

That ceiling is the reason this file exists.  $084B compares against $0C but
$084F stores $0B, so the delta clamps at $0B and the compare constant is one
above it.  Reading the compare as the clamp gives an animation that is right
for 88 frames and then one step too fast forever, which no screenshot would
ever show.

Usage:
  python tools/oracle/rastersquash.py --frames 200
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pyboy import PyBoy                                   # noqa: E402
from trace import ROM, ROOT                               # noqa: E402

TITLE_LOOP = 0x02C4        # loc_00_02C4, the title's own frame loop
OPTIONS_ENTRY = 0x3893     # loc_00_3893, reached from $0312
FRAME_WAIT = 0x0A4F
VBLANK_TAIL = 0x0852
STAT_ISR = 0x0857
SQUASH_ARM = 0x095B        # loc_00_0935's last instruction before the RETI

rLY, rLYC, rSCX, rSCY, rBGP = 0xFF44, 0xFF45, 0xFF43, 0xFF42, 0xFF47


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=200)
    ap.add_argument('--out', default='rip/oracle/rastersquash.json')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    hits = {'title': 0, 'options': 0}
    ev = []
    entry = {'ly': 0}

    pyboy.hook_register(0, TITLE_LOOP,
                        lambda _: hits.__setitem__('title', hits['title'] + 1), None)
    pyboy.hook_register(0, OPTIONS_ENTRY,
                        lambda _: hits.__setitem__('options', hits['options'] + 1), None)
    pyboy.hook_register(0, STAT_ISR,
                        lambda _: entry.__setitem__('ly', m[rLY]), None)
    pyboy.hook_register(0, FRAME_WAIT, lambda _: ev.append(('s', {
        'c763': m[0xC763], 'c764': m[0xC764], 'c765': m[0xC765],
        'c766': m[0xC766], 'ffc7': m[0xFFC7], 'ffac': m[0xFFAC],
        'ffad': m[0xFFAD], 'ffaa': m[0xFFAA], 'ffa9': m[0xFFA9],
        'c712': m[0xC712]})), None)
    pyboy.hook_register(0, VBLANK_TAIL, lambda _: ev.append(('v', {
        'scx': m[rSCX], 'scy': m[rSCY], 'bgp': m[rBGP], 'lyc': m[rLYC]})), None)
    pyboy.hook_register(0, SQUASH_ARM, lambda _: ev.append(('a', {
        'ly': entry['ly'], 'scy': m[rSCY], 'bgp': m[rBGP],
        'lyc': m[rLYC], 'ffac': m[0xFFAC]})), None)

    # --- walk the real menu ------------------------------------------------
    for f in range(600):
        if hits['title']:
            break
        if f % 20 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    if not hits['title']:
        raise SystemExit('FAIL: never reached the title loop ($02C4)')
    for _ in range(60):
        pyboy.tick(1, False)

    # $02DB tests bits 6 and 7 in ONE AND, and $02F9 acts with XOR $01 on
    # $C712 -- UP and DOWN are the same button (docs/03-VERIFICATION.md 17).
    pyboy.button('down', delay=3)
    for _ in range(20):
        pyboy.tick(1, False)
    if m[0xC712] != 1:
        raise SystemExit(f'FAIL: cursor is $C712 = {m[0xC712]}, wanted 1 (OPTION)')

    ev.clear()
    pyboy.button('start', delay=3)
    for _ in range(240):
        pyboy.tick(1, False)
        if hits['options']:
            break
    if not hits['options']:
        raise SystemExit('FAIL: START on OPTION never reached loc_00_3893')

    ev.clear()
    for _ in range(args.frames + 4):
        pyboy.tick(1, False)

    # --- group exactly as rastertrace.py does ------------------------------
    frames = []
    i = 0
    while i < len(ev) and len(frames) < args.frames:
        if ev[i][0] != 's':
            i += 1
            continue
        j = i + 1
        while j < len(ev) and ev[j][0] != 'v':
            j += 1
        if j >= len(ev):
            break
        rec = {'f': len(frames) + 1, 'in': ev[i][1], 'base': ev[j][1],
               'bands': []}
        k = j + 1
        while k < len(ev) and ev[k][0] != 'v':
            if ev[k][0] == 'a':
                rec['bands'].append(ev[k][1])
            k += 1
        frames.append(rec)
        i = j

    deltas = sorted({f['in']['c763'] for f in frames})
    print(f'{len(frames)} frames after loc_00_3893')
    print(f'$C763 values seen: {deltas}   (the CLAMP is the largest of these; '
          f'$084B compares against $0C)')
    print(f'$C766 values seen: {sorted({f["in"]["c766"] for f in frames})}')
    print(f'STAT fires per frame: {sorted({len(f["bands"]) for f in frames})}')
    for f in frames[:2] + frames[-2:]:
        b = f['bands']
        print(f'  f{f["f"]:3d} $C763={f["in"]["c763"]:2d} base scy='
              f'{f["base"]["scy"]:3d} bands={len(b)} '
              f'first={[(x["ly"], x["scy"]) for x in b[:4]]} '
              f'last={[(x["ly"], x["scy"], x["bgp"]) for x in b[-2:]]} '
              f'$FFAC={f["in"]["ffac"]}')

    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'frames': frames}, fh)
    print(f'wrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
