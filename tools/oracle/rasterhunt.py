#!/usr/bin/env python3
"""Is there a raster effect on the death / CONTINUE / game-over screens?

SAVEPOINT.md item 2 assumes the "snaking pseudo-3D game-over lettering" is
per-scanline SCX modulation.  This settles that by measurement rather than by
argument, because there is exactly one mechanism on a DMG that can change a
scroll register mid-frame -- the STAT interrupt -- and it can be counted.

Per frame it records:

  * how many times the STAT ISR (loc_00_0857) actually ran;
  * how many DISTINCT rSCX / rSCY / rBGP values were seen across those runs,
    i.e. whether anything was modulated at all;
  * rIE, rSTAT, rLYC, $FFC7 -- the four bytes that decide whether it can.

$0857 is reached only from the $0048 vector, and rIE bit 1 gates that vector.
Every menu path in the ROM writes rIE = $05 ($025E title, $02B8, $03D0 round
select, $3388, $3691, $36F2, $3732, $3773, $3870, $3932); only the three level
loads ($0EB7 / $0EDE / $0F2D), the stage-clear picture ($35C7) and the options
transition ($38C3) write $07.  This run is what turns that reading into a
measurement.

Usage:
  python tools/oracle/rasterhunt.py --level 1 --out rip/oracle/rasterhunt.json
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
ROUND_SELECT = 0x035B
RESET = 0x0150            # $2ABA: game over is a JP Z,$0150, a hard reboot
DEATH_SEQ = 0x2AAD
STAT_ISR = 0x0857
VBLANK_TAIL = 0x0852


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--lives', type=int, default=0,
                    help='$C767 before the kill -- 0 makes the next death the '
                         'game over rather than a respawn')
    ap.add_argument('--frames', type=int, default=1600)
    ap.add_argument('--out', default='rip/oracle/rasterhunt.json')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    cur = {'stat': 0, 'scx': set(), 'scy': set(), 'bgp': set()}
    rows = []
    st = {'started': False, 'screen': 'level', 'resets': 0, 'rs': 0,
          'deaths': 0}

    def on_frame(_):
        rows.append({'screen': st['screen'], 'statFires': cur['stat'],
                     'scxSeen': len(cur['scx']), 'scySeen': len(cur['scy']),
                     'bgpSeen': len(cur['bgp']),
                     'ie': m[0xFFFF], 'stat': m[0xFF41], 'lyc': m[0xFF45],
                     'ffc7': m[0xFFC7], 'lcdc': m[0xFF40],
                     'scx': m[0xFF43], 'scy': m[0xFF42]})
        cur['stat'] = 0
        cur['scx'] = set()
        cur['scy'] = set()
        cur['bgp'] = set()

    def on_stat(_):
        cur['stat'] += 1
        cur['scx'].add(m[0xFF43])
        cur['scy'].add(m[0xFF42])
        cur['bgp'].add(m[0xFF47])

    pyboy.hook_register(0, FRAME_END, on_frame, None)
    pyboy.hook_register(0, STAT_ISR, on_stat, None)
    pyboy.hook_register(0, VBLANK_TAIL, on_stat, None)   # counts as a sample
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda _: (st.__setitem__('started', True),
                                   st.__setitem__('screen', 'level')), None)
    pyboy.hook_register(0, LEVEL_INIT,
                        lambda _: (m.__setitem__(0xFFB0, args.level)
                                   if args.level != 1 else None), None)
    pyboy.hook_register(0, ROUND_SELECT,
                        lambda _: (st.__setitem__('screen', 'roundselect'),
                                   st.__setitem__('rs', st['rs'] + 1)), None)
    pyboy.hook_register(0, RESET,
                        lambda _: (st.__setitem__('screen', 'title-or-gameover'),
                                   st.__setitem__('resets', st['resets'] + 1)),
                        None)
    pyboy.hook_register(0, DEATH_SEQ,
                        lambda _: st.__setitem__('deaths', st['deaths'] + 1),
                        None)

    for f in range(3000):
        if st['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before believing a single row.
    if not st['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got {m[0xFFB0]}')

    m[0xC767] = args.lives
    rows.clear()
    st['resets'] = st['rs'] = st['deaths'] = 0

    killed = False
    for i in range(args.frames):
        if not killed and len(rows) > 40:
            killed = True
            m[0xFF8A] = 0                 # loc_00_17B6's own trigger
        # tap START on whatever menu it lands on, so CONTINUE and the
        # subsequent game over are both reached inside one run.
        if killed and len(rows) > 200 and len(rows) % 40 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)

    if not st['deaths'] and not st['resets']:
        raise SystemExit('FAIL: the death sequence never ran -- nothing measured')

    # --- verdict -----------------------------------------------------------
    by_screen = {}
    for r in rows:
        b = by_screen.setdefault(r['screen'], {'frames': 0, 'statFrames': 0,
                                               'modFrames': 0, 'ie': set(),
                                               'ffc7': set()})
        b['frames'] += 1
        # statFires counts the VBlank tail too, so >1 means a real STAT fire.
        if r['statFires'] > 1:
            b['statFrames'] += 1
        if r['scxSeen'] > 1 or r['scySeen'] > 1 or r['bgpSeen'] > 1:
            b['modFrames'] += 1
        b['ie'].add(r['ie'])
        b['ffc7'].add(r['ffc7'])

    print(f'{len(rows)} frames, deaths {st["deaths"]}, round-select entries '
          f'{st["rs"]}, resets ($0150) {st["resets"]}')
    print(f'{"screen":<20}{"frames":>8}{"frames w/ STAT":>16}'
          f'{"frames w/ modulated regs":>26}  rIE      $FFC7')
    for k, b in by_screen.items():
        print(f'{k:<20}{b["frames"]:>8}{b["statFrames"]:>16}'
              f'{b["modFrames"]:>26}  '
              f'{sorted(hex(v) for v in b["ie"])}  '
              f'{sorted(b["ffc7"])}')

    out = {'level': args.level, 'lives': args.lives,
           'deaths': st['deaths'], 'resets': st['resets'],
           'roundSelects': st['rs'],
           'byScreen': {k: {kk: (sorted(vv) if isinstance(vv, set) else vv)
                            for kk, vv in b.items()}
                        for k, b in by_screen.items()},
           'frames': rows}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh)
    print(f'wrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
