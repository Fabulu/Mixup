#!/usr/bin/env python3
"""Record ONE progress-flow scenario from the cartridge, as JSON.

The frame corpus in tools/oracle/regress.mjs compares a per-frame state vector
of player/camera/enemy fields.  Progress bookkeeping does not live in that
vector and, worse, the events that move it END gameplay -- a level clear and a
death both leave the main loop for loc_00_035B, after which the player fields
are meaningless.  So this is a second, event-shaped recorder for the same job:
drive the real machine through one whole progress event and dump the state it
lands in.  tools/oracle/flowdiff.mjs replays the same events through the port
and diffs the two, memory against memory.

Only ever pokes values the ROM writes itself, and always asserts arrival before
reading anything:

  --event clear   zero the boss's own HP byte (enemy record +$16), which is
                  exactly the state the last punch or batarang leaves.  The
                  cartridge's own 1:$4E82 -> $4EB8 -> $4EE0 chain takes it from
                  there, through the $C740 countdown and loc_00_34D0, and
                  writes $C753 itself.
  --event death   zero $FF8A, and loc_00_17B6 starts sub_00_29E7 on its own.

Usage:
  python tools/oracle/flowscen.py --event clear --level 4 --out rip/oracle/x.json
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
RS_SETTLED = 0x0472         # the menu loop's own sub_00_0A4F call
RESET = 0x0150
LAG_SET = 0x065C            # $C757 <- 1

CONTINUE_CELL = 0x9A04      # the 0:$3328 script's whole on-screen effect
LIVES_CELL = 0x9A0E         # $03C3
CURSOR_CELL = 0x99CD        # $03B0 / $044A, the route marker


def sample(m, screen):
    return {
        'screen': screen,
        'level': m[0xFFB0],                 # $FFB0
        'routeMask': m[0xC753],             # $C753
        'continueAvailable': m[0xFFB5],     # $FFB5
        'lives': m[0xC767],                 # $C767
        'cursor': m[0xC712],                # $C712
        'mode': m[0xC713],                  # $C713
        'hp': m[0xFF8A],                    # $FF8A
        # $FF8E and $C754 are the reason fixes 6 and 7 were invisible for so
        # long. The 'game-over-wipes-progress' scenario checked $C753 and never
        # looked at $C754, two bytes away, and every recording ran at the stock
        # $FF8E = $0A -- so "max HP is reset on every level load" and "the +2
        # latch survives the boot vector" both passed 8/8.
        'hpMax': m[0xFF8E],                 # $FF8E
        'maxHpTaken': m[0xC754],            # $C754
        'cursorTile': m[CURSOR_CELL],
        'continueRow': [m[CONTINUE_CELL + i] for i in range(8)],
        'livesDigit': m[LIVES_CELL],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--event', required=True, choices=('clear', 'death'))
    ap.add_argument('--level', type=int, required=True)
    ap.add_argument('--mask', default='00', help='hex $C753 before the event')
    ap.add_argument('--lives', type=int, default=None, help='force $C767')
    # Both are values the ROM writes itself: 1:$4D70 stamps $FF8E and 1:$4D91
    # sets the $C754 bit, together, when the +2 heart is taken. Every earlier
    # recording ran at the stock $0A/$00, so nothing in the corpus could ever
    # have noticed a level load resetting max HP or a game over failing to
    # clear the latch.
    ap.add_argument('--max-hp', type=lambda s: int(s, 16), default=None,
                    help='hex $FF8E before the event (the +2 pickup value)')
    ap.add_argument('--max-hp-taken', type=lambda s: int(s, 16), default=None,
                    help='hex $C754 before the event')
    ap.add_argument('--press-start', action='store_true',
                    help='tap START on the menu the event lands on')
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--frames', type=int, default=1400)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    ctr = {'n': 0, 'started': False, 'lag': 0}
    hits = {'clear': 0, 'death': 0, 'roundselect': 0, 'reset': 0,
            'levelinit': 0, 'settled': 0}
    where = {'screen': 'level'}
    injected = {'v': False}

    def on_level_init(_):
        hits['levelinit'] += 1
        where['screen'] = 'level'
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    def on_rs(_):
        hits['roundselect'] += 1
        where['screen'] = 'roundselect'

    def on_reset(_):
        hits['reset'] += 1
        where['screen'] = 'title'

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, ROUND_SELECT, on_rs, None)
    pyboy.hook_register(0, RESET, on_reset, None)
    pyboy.hook_register(0, 0x361E, lambda _: hits.__setitem__('clear', hits['clear'] + 1), None)
    pyboy.hook_register(0, 0x2AAD, lambda _: hits.__setitem__('death', hits['death'] + 1), None)
    pyboy.hook_register(0, RS_SETTLED,
                        lambda _: hits.__setitem__('settled', hits['settled'] + 1), None)
    pyboy.hook_register(0, FRAME_END,
                        lambda _: ctr.__setitem__('n', ctr['n'] + 1), None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda _: ctr.__setitem__('started', True), None)
    # $065C is the ONLY writer of $C757. Counted, never compared: lag frames
    # are instruction-level timing and out of scope (docs/03-VERIFICATION.md
    # section 28). A scenario that crossed one would still be safe here --
    # nothing below is a per-frame comparison -- but the count belongs in the
    # record so a later reader can see whether it did.
    pyboy.hook_register(0, LAG_SET,
                        lambda _: ctr.__setitem__('lag', ctr['lag'] + 1), None)

    for f in range(3000):
        if ctr['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before touching a single byte of the dump.
    if not ctr['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got {m[0xFFB0]}')

    m[0xC753] = int(args.mask, 16)
    if args.lives is not None:
        m[0xC767] = args.lives
    if args.max_hp is not None:
        m[0xFF8E] = args.max_hp
        m[0xFF8A] = args.max_hp             # 1:$4D72 heals as it upgrades
    if args.max_hp_taken is not None:
        m[0xC754] = args.max_hp_taken
    start = sample(m, 'level')

    # Everything so far is the BOOT path -- one $0150, one $035B, one $04BB
    # and ~50 menu iterations. Leaving those in the counters makes every
    # "has the event happened yet?" test true on the first tick, which is how
    # an earlier version of this recorder cheerfully reported a death that
    # never occurred. Zero them at the start line.
    for k in hits:
        hits[k] = 0
    ctr['lag'] = 0
    where['screen'] = 'level'

    base = ctr['n']
    poked = {'v': False, 'hp': None}
    while ctr['n'] - base < args.frames:
        idx = ctr['n'] - base
        if not poked['v'] and idx >= args.poke_at:
            poked['v'] = True
            if args.event == 'clear':
                poked['hp'] = m[0xC268 + 0x16]
                m[0xC268 + 0x16] = 0           # 1:$4E82's own trigger
            else:
                m[0xFF8A] = 0                  # loc_00_17B6's own trigger
        pyboy.tick(1, False)
        if args.event == 'clear' and hits['clear'] and hits['settled'] > 8:
            break
        if args.event == 'clear' and hits['clear'] and hits['levelinit'] >= 1:
            break
        if args.event == 'death' and (hits['death'] or hits['reset']) \
                and (hits['settled'] > 8 or hits['reset']):
            break

    if args.event == 'clear' and not hits['clear'] and not hits['reset']:
        raise SystemExit('FAIL: the clear sequencer never wrote $C753')
    if args.event == 'death' and not hits['death'] and not hits['reset']:
        raise SystemExit('FAIL: the death sequence never reached loc_00_2AAD')

    # Let the menu settle so the queued resource loads have drained and the
    # cursor/CONTINUE cells are painted.
    for _ in range(90):
        pyboy.tick(1, False)

    end = sample(m, where['screen'])

    pressed = None
    if args.press_start:
        if where['screen'] != 'roundselect':
            raise SystemExit(f"FAIL: --press-start but the screen is "
                             f"{where['screen']}")
        before = hits['levelinit']
        pyboy.button_press('start')
        pyboy.tick(4, False)
        pyboy.button_release('start')
        for _ in range(300):
            pyboy.tick(1, False)
            if hits['levelinit'] > before:
                break
        if hits['levelinit'] == before:
            raise SystemExit('FAIL: START on the menu never reached $04BB')
        for _ in range(60):
            pyboy.tick(1, False)
        pressed = sample(m, 'level')

    out = {'event': args.event, 'level': args.level, 'mask': args.mask,
           'start': start, 'end': end, 'afterStart': pressed,
           'bossHpWas': poked['hp'], 'lagFrames': ctr['lag']}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({'screen': end['screen'], 'routeMask': end['routeMask'],
                      'continueAvailable': end['continueAvailable'],
                      'lives': end['lives'], 'lag': ctr['lag']}))
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
