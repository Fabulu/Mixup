#!/usr/bin/env python3
"""State 4: the press-start flash, loc_00_031B, and the fade that follows it.

Two things are being settled, both by measurement rather than by reading the
listing:

  * how long it runs.  `$031B: LD B,$78` is 120 iterations of a loop whose only
    frame boundary is `$0330 CALL sub_00_0A4F`, then `$0350: LD C,$00 ->
    sub_00_0A7F` fades out over sub_00_0A7F's own 33 frames before $035B.
  * what it draws.  $0333 assembles a VRAM script in WRAM at $C61B and lets the
    VBlank ISR at $0714 run it: 19 bytes from 1:$7C44 (the whole title-text
    script, START and OPTIONS both) when `B & $08` is set, and 5 bytes from
    1:$7C57 (an RLE of $2F over the five START cells) when it is clear.  So the
    word START blinks and OPTIONS is repainted underneath it unchanged.

Also records the palette shadows $FFAD/$FFAE/$FFAF every frame, which is the
same fade sub_00_0A7F ran INTO the title at $02C1 -- so this doubles as the
check on assets/title.json's eight registers being derivable.

Usage:  python tools/oracle/titleflash.py [--cheat]
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

TITLE_LOOP = 0x02C4
FADE_IN = 0x02C1         # LD C,$80 -> sub_00_0A7F, before the loop
FLASH = 0x031B           # LD B,$78
FLASH_BODY = 0x031D
FADE_OUT = 0x0350        # LD C,$00 -> sub_00_0A7F
ROUND_SELECT = 0x035B
FRAME_END = 0x0A4F
# The five cells 1:$7C44's first record writes, and the seven of its second.
START_CELL = 0x9967
OPTION_CELL = 0x99A7


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cheat', action='store_true',
                    help='enter the flash through $02D8 (B+SELECT+LEFT) '
                         'instead of START')
    ap.add_argument('--out', default='rip/titleflash.json')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    marks = {'fadeIn': [], 'flash': [], 'body': [], 'fadeOut': [], 'rs': [],
             'loop': []}
    fc = {'n': 0}
    rows = []

    def mark(name):
        def cb(_):
            marks[name].append(fc['n'])
        return cb

    def on_frame(_):
        fc['n'] += 1
        rows.append({
            'f': fc['n'],
            'start': m[START_CELL], 'option': m[OPTION_CELL],
            'bgp': m[0xFFAD], 'obp0': m[0xFFAE], 'obp1': m[0xFFAF],
            'wx': m[0xFFAB], 'wy': m[0xFFAC], 'scx': m[0xFFA9],
            'scy': m[0xFFAA], 'lcdc': m[0xFF40],
            'c61b': [m[0xC61B + i] for i in range(5)],
            'c70e': m[0xC70E],
        })

    pyboy.hook_register(0, FADE_IN, mark('fadeIn'), None)
    pyboy.hook_register(0, TITLE_LOOP, mark('loop'), None)
    pyboy.hook_register(0, FLASH, mark('flash'), None)
    pyboy.hook_register(0, FLASH_BODY, mark('body'), None)
    pyboy.hook_register(0, FADE_OUT, mark('fadeOut'), None)
    pyboy.hook_register(0, ROUND_SELECT, mark('rs'), None)
    pyboy.hook_register(0, FRAME_END, on_frame, None)

    tapped = {'v': False}
    for _ in range(2000):
        pyboy.tick(1, False)
        if len(marks['loop']) > 60 and not tapped['v']:
            tapped['v'] = True
            if args.cheat:
                # $02C7 tests $FFE2 == $26 exactly: B ($02) + SELECT ($04) +
                # LEFT ($20), and nothing else.
                for name in ('b', 'select', 'left'):
                    pyboy.button_press(name)
            else:
                pyboy.button_press('start')
        elif tapped['v'] and marks['flash']:
            for name in ('b', 'select', 'left', 'start'):
                pyboy.button_release(name)
        if marks['rs']:
            break

    if not marks['flash']:
        raise SystemExit('loc_00_031B never executed - the probe never arrived')
    if not marks['rs']:
        raise SystemExit('never reached round select')

    f0 = marks['flash'][0]
    f1 = marks['fadeOut'][0]
    f2 = marks['rs'][0]
    seq = [r for r in rows if f0 <= r['f'] <= f2]

    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'marks': marks, 'rows': rows, 'cheat': args.cheat}, fh)

    print('entered $031B via %s' % ('the $02D8 cheat' if args.cheat
                                    else 'START at $030E'))
    print('  $031D ran %d times' % len(marks['body']))
    print('  $031B -> $0350 : %d frames' % (f1 - f0))
    print('  $0350 -> $035B : %d frames' % (f2 - f1))
    # The blink, as a run-length of the START cell's tile id.
    runs = []
    for r in seq:
        if runs and runs[-1][0] == r['start']:
            runs[-1][1] += 1
        else:
            runs.append([r['start'], 1])
    print('  $9967 runs: %s'
          % ' '.join('$%02X x%d' % (v, n) for v, n in runs[:12]))
    print('  $99A7 (OPTIONS) values: %s'
          % sorted({r['option'] for r in seq}))
    print('  palettes at the title loop: BGP=$%02X OBP0=$%02X OBP1=$%02X'
          % (rows[f0 - 2]['bgp'], rows[f0 - 2]['obp0'], rows[f0 - 2]['obp1']))
    print('  LCDC=$%02X SCX=$%02X SCY=$%02X WX=$%02X WY=$%02X'
          % (rows[f0 - 2]['lcdc'], rows[f0 - 2]['scx'], rows[f0 - 2]['scy'],
             rows[f0 - 2]['wx'], rows[f0 - 2]['wy']))
    fade = [(r['f'] - f1, r['bgp'], r['obp0'], r['obp1'])
            for r in rows if f1 <= r['f'] <= f2]
    steps = []
    for t in fade:
        if not steps or steps[-1][1:] != t[1:]:
            steps.append(t)
    print('  fade-out steps (frame, BGP, OBP0, OBP1): %s'
          % ' '.join('%d:$%02X/$%02X/$%02X' % s for s in steps))
    print('->', path)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
