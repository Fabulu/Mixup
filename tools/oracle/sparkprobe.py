#!/usr/bin/env python3
"""The melee hit-spark ($26FC-$271B -> sub_00_0CC2), measured.

Replays the l3-punch-connect scenario and records, per frame:

  * all ten $C693 records (60 bytes),
  * the $C744-$C747 staging bytes,
  * player $FF81-$FF84 and facing $FF88 at the $271B call,
  * every shadow-OAM entry whose tile belongs to the spark's metasprite
    (dumped in full for the frames where a $C693 slot is live).

Hooks $271B to capture the spawn instant, so the staged position can be
diffed against `player X hi +/- 1, X lo, Y hi, Y lo` exactly.

Usage:  python tools/oracle/sparkprobe.py
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                    # noqa: E402
from trace import (ROM, FRAME_END, BUTTONS, boot_to_gameplay,  # noqa: E402
                   parse_script)

SPAWN = 0x271B          # CALL sub_00_0CC2 -- the spark spawn
SHADOW_OAM = 0xC000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=3)
    ap.add_argument('--warp', default='46,23')
    ap.add_argument('--frames', type=int, default=172)
    ap.add_argument('--script', default='20:,32:R,6:RB,2:R,20:,6:B,20:,6:B,60:')
    ap.add_argument('--out', default='rip/oracle/sparkprobe.json')
    args = ap.parse_args()

    timeline = parse_script(args.script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    spawns = []
    fc = {'n': 0}

    def on_spawn(_):
        m = pyboy.memory
        spawns.append({
            'f': fc['n'],
            'stage': [m[0xC744], m[0xC745], m[0xC746], m[0xC747]],
            'player': [m[0xFF81], m[0xFF82], m[0xFF83], m[0xFF84]],
            'facing': m[0xFF88],
        })

    pyboy.hook_register(0, SPAWN, on_spawn, None)

    boot_to_gameplay(pyboy, level=args.level)

    rows = []

    def sample(_):
        m = pyboy.memory
        pool = list(m[0xC693:0xC693 + 60])
        live = any(pool[i * 6] for i in range(10))
        row = {'f': fc['n'], 'pool': pool if live else None}
        if live:
            oam = []
            for i in range(40):
                b = SHADOW_OAM + i * 4
                if m[b] != 0:
                    oam.append([i, m[b], m[b + 1], m[b + 2], m[b + 3]])
            row['oam'] = oam
        rows.append(row)

    pyboy.hook_register(0, FRAME_END, sample, None)

    if args.warp:
        parts = [int(v) for v in args.warp.split(',')]
        pyboy.memory[0xFF81] = parts[0] & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = parts[1] & 0xFF
            pyboy.memory[0xFF84] = 0

    for name in BUTTONS.values():
        pyboy.button_release(name)
    held = set()
    for f in range(args.frames):
        fc['n'] = f
        want = timeline[min(f + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    print(f'{len(spawns)} spark spawn(s):')
    for s in spawns:
        px = s['player']
        want = ((px[0] + (1 if s['facing'] == 0 else -1)) & 0xFF)
        ok = s['stage'][0] == want and s['stage'][1:] == px[1:]
        print(f"  f{s['f']:3d} facing={s['facing']} player="
              f"{['%02X' % v for v in px]} staged="
              f"{['%02X' % v for v in s['stage']]}"
              f"  {'MATCHES xhi+/-1 rule' if ok else 'RULE MISMATCH'}")

    live = [r for r in rows if r['pool']]
    print(f'{len(live)} frames with a live $C693 slot')
    for r in live[:20]:
        p = r['pool']
        slots = [f"slot{i}={['%02X' % v for v in p[i*6:i*6+6]]}"
                 for i in range(10) if p[i * 6]]
        print(f"  f{r['f']:3d} {' '.join(slots)}")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as fh:
        json.dump({'spawns': spawns, 'rows': rows}, fh)
    print('wrote', args.out)


if __name__ == '__main__':
    main()
