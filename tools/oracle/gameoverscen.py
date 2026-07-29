#!/usr/bin/env python3
"""Record the GAME OVER lettering from the cartridge, as OAM.

WHAT THIS IS.  Zeroing $FF8A starts loc_00_17B6 -> sub_00_29E7, which seeds
eight 5-byte records at $C1C0 from 0:$2AD7 and hands them to loc_00_2A0D.  Each
record walks the 276-byte path at 0:$2AFF one entry a frame, a signed nibble of
X and a signed nibble of Y at a time, and draws ONE 8x16 metasprite from
0:$2ACF = $12 $13 $14 $15 $16 $17 $15 $18.  Those seven distinct metasprites are
OBJ tiles $1C $1E $20 $22 $24 $26 $28, and tools/oracle/gameoverprobe.py prints
them out of live VRAM: they are the bevelled letters **G A M E O V E R**.
Slot n arms only once slot n-1 has taken 8 steps, so the eight letters trail
each other along one path like a snake.

This recorder is EVENT-CAPPED, not frame-capped, in the shape of
tools/oracle/deathscen.py: it stops on loc_00_2AAD (or loc_00_0150 if the run
had no lives left), so a lag frame cannot skew it.

WHAT IT RECORDS, per main-loop iteration ($0A4F):

  * every 4-byte shadow-OAM record the burst wrote, in write order, taken at
    the two CALL sites ($2A6A moving, $2AA8 parked) by reading the OAM cursor
    $FF9D BEFORE the call and the bytes it lands on after.  That is the
    effect's entire visible footprint.
  * `pre`, the cursor at the burst's first draw of the frame -- i.e. how many
    OAM entries the rest of the frame had already queued.  This is what pins
    the DRAW ORDER, which is not constant: $0567 calls sub_00_29E7 at $057A
    when $FFA7 == 0 and at $05EC when it does not, so the letters are queued
    before the player on one frame and after it on the next.
  * the $C1C0 records themselves, and $FFA7 / $C712 / $C715.

Usage:
  python tools/oracle/gameoverscen.py --level 1 --out rip/oracle/gameover-l1.json
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
OAM_TAIL = 0x064A           # sub_00_0C1F clears from $FF9D and zeroes it
LEVEL_INIT = 0x04BB
DEATH_HANDOFF = 0x2AAD
RESET = 0x0150
LAG_SET = 0x065C

DRAW_MOVING = 0x2A6A        # $2A63-$2A6A, the flying arm
DRAW_PARKED = 0x2AA8        # $2AA1-$2AA8, the arm that holds the final pose

SHADOW_OAM = 0xC000
BURST = 0xC1C0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--frames', type=int, default=900)
    ap.add_argument('--lives', type=int, default=None,
                    help='$C767 before the kill; 1 makes this death the game over')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    ctr = {'n': 0, 'started': False, 'lag': 0}
    hits = {'handoff': 0, 'reset': 0, 'handoffFrame': 0}
    injected = {'v': False}
    pending = {'draws': [], 'total': 0}

    def on_level_init(_):
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    def on_draw(_):
        pending['draws'].append(m[0xFF9D])

    def on_tail(_):
        # $064A is the LAST read of $FF9D before sub_00_0C1F zeroes it.
        pending['total'] = m[0xFF9D]

    def on_handoff(_):
        hits['handoff'] += 1
        # loc_00_2AAD is reached from INSIDE loc_00_2A0D, during an iteration
        # whose $0A4F never fires -- $2ACC jumps to loc_00_035B. Same
        # correction deathscen.py makes.
        hits['handoffFrame'] = ctr['n'] + 1

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: ctr.__setitem__('started', True), None)
    pyboy.hook_register(0, DEATH_HANDOFF, on_handoff, None)
    pyboy.hook_register(0, RESET, lambda _: hits.__setitem__('reset', hits['reset'] + 1), None)
    pyboy.hook_register(0, DRAW_MOVING, on_draw, None)
    pyboy.hook_register(0, DRAW_PARKED, on_draw, None)
    pyboy.hook_register(0, OAM_TAIL, on_tail, None)
    pyboy.hook_register(0, LAG_SET, lambda _: ctr.__setitem__('lag', ctr['lag'] + 1), None)

    rows = []
    base = {'n': 0}
    active = {'v': False}

    def frame_end(_):
        ctr['n'] += 1
        if active['v']:
            idx = ctr['n'] - base['n']
            oam = [m[SHADOW_OAM + i] for i in range(0xA0)]
            draws = [{'at': c, 'rec': oam[c:c + 4]} for c in pending['draws']]
            rows.append({
                'f': idx,
                'pre': pending['draws'][0] if pending['draws'] else None,
                'draws': draws,
                'oamTotal': pending['total'],
                'ffa7': m[0xFFA7], 'ffb1': m[0xFFB1],
                'c712': m[0xC712], 'c715': m[0xC715],
                'burst': [[m[BURST + i * 5 + b] for b in range(5)] for i in range(8)],
            })
        pending['draws'] = []
        pending['total'] = 0

    pyboy.hook_register(0, FRAME_END, frame_end, None)

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

    if args.lives is not None:
        m[0xC767] = args.lives
    hits['handoff'] = hits['reset'] = 0
    ctr['lag'] = 0
    base['n'] = ctr['n']
    active['v'] = True

    start = {'level': m[0xFFB0], 'lives': m[0xC767], 'hp': m[0xFF8A],
             'ffa7': m[0xFFA7], 'ffb1': m[0xFFB1]}

    poked = {'v': False}
    while ctr['n'] - base['n'] < args.frames:
        idx = ctr['n'] - base['n']
        if not poked['v'] and idx >= args.poke_at:
            poked['v'] = True
            m[0xFF8A] = 0                       # loc_00_17B6's own trigger
        pyboy.tick(1, False)
        if hits['handoff'] or hits['reset']:
            break

    if not hits['handoff'] and not hits['reset']:
        raise SystemExit('FAIL: the death sequence never landed')

    # Landmarks, derived rather than asserted, so the diff can pin them.
    seeded = next((r['f'] for r in rows if r['c715']), None)
    arm = [None] * 8
    park = [None] * 8
    prev = [0] * 8
    for r in rows:
        for i in range(8):
            fl = r['burst'][i][0]
            if fl and arm[i] is None:
                arm[i] = r['f']
            if (fl & 1) and park[i] is None:
                park[i] = r['f']
            prev[i] = fl

    out = {'level': args.level, 'pokeAt': args.poke_at, 'start': start,
           'landed': 'handoff' if hits['handoff'] else 'reset',
           'handoffFrame': hits['handoffFrame'] - base['n'] if hits['handoff'] else None,
           'lagFrames': ctr['lag'],
           'ids': [m[0x2ACF + i] for i in range(8)],
           'seededFrame': seeded, 'armFrames': arm, 'parkFrames': park,
           'iterations': ctr['n'] - base['n'], 'frames': rows}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh)

    drawn = sum(len(r['draws']) for r in rows)
    pres = sorted({r['pre'] for r in rows if r['pre'] is not None})
    print(json.dumps({'level': args.level, 'landed': out['landed'],
                      'handoffFrame': out['handoffFrame'],
                      'iterations': out['iterations'], 'lag': ctr['lag'],
                      'seeded': seeded, 'arm': arm, 'park': park,
                      'drawCalls': drawn, 'distinctPreCursors': pres}))
    print(f'wrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
