#!/usr/bin/env python3
"""Record ONE death sequence from the cartridge, as JSON.

Two sequences, both long and both ending in a defined event, so this is shaped
the way tools/oracle/flowscen.py is: EVENT-CAPPED, never frame-capped.  A
recording stops when the ROM's own sequencer lands -- loc_00_361E for a boss,
loc_00_2AAD (or loc_00_0150) for the player -- plus settling frames.

  --event boss    zero the boss's HP byte (enemy record +$16), exactly what the
                  last punch leaves.  1:$4E82 -> $4EB8 -> $4EE0 stamps
                  $C740 = $FE and 1:$78CC / 1:$7936 / loc_00_34D0 take it from
                  there, ~632 frames later writing $C753 itself.
  --event player  zero $FF8A; loc_00_17B6 starts sub_00_29E7 on its own and
                  loc_00_2A0D runs the $C1C0 burst to loc_00_2AAD, 452 frames.

LAG.  $C757 is out of scope by definition (docs/03-VERIFICATION.md 28) but it
is NOT harmless here, and the two sequences differ:

  * The BOSS countdown lives inside the enemy driver, behind $4E39's lag gate,
    so a lag frame stalls it for exactly one frame.  1:$4E3F is that gate's
    skip target; hooking it counts the stalls directly instead of guessing from
    $065C, and every boss landmark is recorded with the stall count that
    preceded it so the reader can subtract a quantity it actually measured.
  * The PLAYER burst runs from the main loop head/tail ($057A / $05EC) with no
    $C757 test at all, and the frame counter here counts main-loop ITERATIONS
    ($0A4F), not hardware frames.  MEASURED with 4 lag frames in the run:
    loc_00_2A0D executes 3616 times = 452 x 8 exactly.  So player frames are
    compared raw, and the lag count is recorded only to prove it stayed
    irrelevant.

Usage:
  python tools/oracle/deathscen.py --event boss --level 4 --out rip/oracle/x.json
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
RESET = 0x0150
LAG_SET = 0x065C            # $C757 <- 1, the ISR's own write
LAG_SKIP = (1, 0x4E3F)      # loc_01_4E39's skip target: one enemy update lost
CLEAR_WRITE = 0x361E        # the $C753 write, the boss sequence's landing
DEATH_HANDOFF = 0x2AAD      # the player sequence's landing
FANFARE = 0x34D0

ENEMY0 = 0xC268
POOL = 0xC693               # 10 x 6
BURST = 0xC1C0              # 8 x 5


def rd(m, addr, n):
    return [m[addr + i] for i in range(n)]


def pool(m):
    return [rd(m, POOL + i * 6, 6) for i in range(10)]


def burst(m):
    return [rd(m, BURST + i * 5, 5) for i in range(8)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--event', required=True, choices=('boss', 'player'))
    ap.add_argument('--level', type=int, required=True)
    ap.add_argument('--mask', default='00', help='hex $C753 before the event')
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--frames', type=int, default=1600)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    ctr = {'n': 0, 'started': False, 'lag': 0, 'skip': 0}
    hits = {'clear': 0, 'handoff': 0, 'reset': 0, 'levelinit': 0, 'fanfare': 0,
            'handoffFrame': 0, 'clearFrame': 0}
    injected = {'v': False}

    def on_level_init(_):
        hits['levelinit'] += 1
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    def bump(k):
        return lambda _: hits.__setitem__(k, hits[k] + 1)

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, RESET, bump('reset'), None)
    pyboy.hook_register(0, CLEAR_WRITE, lambda h: on_clear(h), None)
    def on_handoff(_):
        hits['handoff'] += 1
        # loc_00_2AAD is reached from inside loc_00_2A0D, which the main loop
        # calls at $057A / $05EC -- i.e. DURING the iteration whose $0A4F has
        # not fired yet, and never will, because $2ACC jumps to loc_00_035B.
        # So the landing belongs to frame ctr + 1, not ctr.
        hits['handoffFrame'] = ctr['n'] + 1

    def on_clear(_):
        hits['clear'] += 1
        # loc_00_361B is the same shape: $361E/$362A leave for loc_00_04BB or
        # loc_00_035B without ever reaching this iteration's $064A.
        hits['clearFrame'] = ctr['n'] + 1

    pyboy.hook_register(0, DEATH_HANDOFF, on_handoff, None)
    pyboy.hook_register(0, FANFARE, bump('fanfare'), None)
    # ONE hook on $0A4F: PyBoy refuses a second at the same address, and the
    # counter and the sampler have to agree on what frame it is anyway.
    sampler = {'fn': None}

    def frame_end(_):
        ctr['n'] += 1
        if sampler['fn']:
            sampler['fn']()

    pyboy.hook_register(0, FRAME_END, frame_end, None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: ctr.__setitem__('started', True), None)
    pyboy.hook_register(0, LAG_SET, lambda _: ctr.__setitem__('lag', ctr['lag'] + 1), None)
    pyboy.hook_register(LAG_SKIP[0], LAG_SKIP[1],
                        lambda _: ctr.__setitem__('skip', ctr['skip'] + 1), None)

    for f in range(3000):
        if ctr['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before reading a single byte of the dump.
    if not ctr['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got {m[0xFFB0]}')
    if args.event == 'boss' and m[0xC73E] == 0:
        raise SystemExit(f'FAIL: level {args.level} has no boss ($C73E = 0)')

    m[0xC753] = int(args.mask, 16)
    start = {
        'level': m[0xFFB0], 'bossId': m[0xC73E], 'routeMask': m[0xC753],
        'lives': m[0xC767], 'hp': m[0xFF8A], 'countdown': m[0xC740],
        'enemy0': rd(m, ENEMY0, 32),
    }

    # Everything so far is the boot path.  Zero the counters at the start line,
    # exactly as flowscen.py does -- leaving them makes every "has it happened
    # yet?" test true on the first tick.
    for k in hits:
        hits[k] = 0
    ctr['lag'] = 0
    ctr['skip'] = 0
    base = ctr['n']

    rec = {'timeline': {}, 'stalls': {}, 'explosions': [], 'checkpoints': {},
           'armFrames': [None] * 8, 'parkFrames': [None] * 8, 'spans': {}}
    seen = {'c713': 0, 'phase': 0, 'c740': 0xFF, 'burstSeeded': False,
            'flags': [0] * 8}

    def mark(name, idx):
        if name not in rec['timeline']:
            rec['timeline'][name] = idx
            rec['stalls'][name] = ctr['skip']

    # SAMPLE FROM THE $0A4F HOOK, never from the pyboy.tick loop. One
    # pyboy.tick is one HARDWARE frame and one $0A4F is one main-loop
    # ITERATION, and the two are not the same count: a lag frame gives two
    # hardware frames for one iteration, and reading memory after each tick
    # therefore duplicates one sample and drops another. An earlier version of
    # this recorder did exactly that and reported the $C1C0 counters stepping
    # 3, 5, 7 -- which looks like a real two-per-frame behaviour and is not.
    poked = {'v': False, 'hp': None}
    stop = {'v': False}

    def sample():
        idx = ctr['n'] - base
        if stop['v']:
            return
        if args.event == 'boss':
            c740 = m[0xC740]
            if c740 != 0xFF and seen['c740'] == 0xFF:
                mark('countdownArmed', idx)
            if c740 == 0 and seen['c740'] != 0:
                mark('countdownZero', idx)
            seen['c740'] = c740
            c713 = m[0xC713]
            if c713 != seen['c713']:
                # The record 1:$78E3 just wrote. The pool is sampled AFTER
                # loc_00_1391 has already ticked it this frame and BEFORE the
                # next one, so the fresh slot is the only one still reading its
                # spawn value of $10 -- and it is the only slot the countdown
                # is responsible for. The rest of the live pool is kept for
                # diagnosis but deliberately NOT compared: a lag frame stalls
                # the enemy driver (and so the spawn) while loc_00_1391 keeps
                # counting, which shifts the OLDER slots by one with nothing
                # wrong having happened.
                live = [q for q in pool(m) if q[0] != 0]
                rec['explosions'].append({
                    'index': seen['c713'], 'frame': idx, 'stalls': ctr['skip'],
                    'countdown': c740, 'pool': live,
                    'spawned': next((q for q in live if q[0] == 0x10), None),
                })
                seen['c713'] = c713
            phase = m[0xC712]
            if phase != seen['phase']:
                if phase in (1, 2, 3):
                    mark(f'fanfarePhase{phase}', idx)
                seen['phase'] = phase
            # $FFAC: loc_00_363D's window ramp -- the only visible part of
            # phase 3, and the landmark that pins where the blocking half of
            # the fanfare really begins. Leaves $90 on its first frame and
            # parks at $32 for the hold.
            wy = m[0xFFAC]
            if wy != 0x90:
                mark('windowRampStart', idx)
            if wy == 0x32:
                mark('windowRampEnd', idx)
            # routeWrite comes from the $361E hook, not from watching $C753:
            # the write and the jump out share an iteration whose $0A4F never
            # fires, so a sampler can only ever see it a frame late.
        else:
            if not seen['burstSeeded'] and m[0xC715] != 0:
                seen['burstSeeded'] = True
                mark('burstSeeded', idx)
                rec['checkpoints'][str(idx)] = burst(m)
            if seen['burstSeeded']:
                b = burst(m)
                for i in range(8):
                    if b[i][0] != 0 and seen['flags'][i] == 0:
                        rec['armFrames'][i] = idx
                    if (b[i][0] & 1) and not (seen['flags'][i] & 1):
                        rec['parkFrames'][i] = idx
                    seen['flags'][i] = b[i][0]
                if idx % 64 == 0:
                    rec['checkpoints'][str(idx)] = b

    sampler['fn'] = sample

    while ctr['n'] - base < args.frames:
        idx = ctr['n'] - base
        if not poked['v'] and idx >= args.poke_at:
            poked['v'] = True
            if args.event == 'boss':
                poked['hp'] = m[ENEMY0 + 0x16]
                m[ENEMY0 + 0x16] = 0                # 1:$4E82's own trigger
            else:
                m[0xFF8A] = 0                       # loc_00_17B6's own trigger
        pyboy.tick(1, False)

        if args.event == 'boss' and (hits['clear'] or hits['reset']):
            stop['v'] = True
            if hits['clear']:
                mark('routeWrite', hits['clearFrame'] - base)
            break
        if args.event == 'player':
            if hits['handoff'] and 'handoff' not in rec['timeline']:
                mark('handoff', hits['handoffFrame'] - base)
                stop['v'] = True
            if hits['handoff'] or hits['reset']:
                break

    if args.event == 'boss' and not hits['clear']:
        raise SystemExit('FAIL: the clear sequencer never wrote $C753')
    if args.event == 'player' and not hits['handoff'] and not hits['reset']:
        raise SystemExit('FAIL: the death sequence never reached loc_00_2AAD')

    tl = rec['timeline']
    if args.event == 'boss':
        # The lag-corrected shape of the whole sequence. Only the countdown and
        # phase 1 sit behind $4E39's gate; loc_00_3566 and loc_00_35D0 never
        # return to the main loop, so the stall count cannot grow inside them
        # (and MEASURED it does not: `stalls` is identical at every landmark
        # from fanfarePhase1 onward).
        def span(a, b):
            return ((tl[b] - tl[a]) - (rec['stalls'][b] - rec['stalls'][a])
                    if a in tl and b in tl else None)
        rec['spans'] = {
            'countdown': span('countdownArmed', 'countdownZero'),
            'phase1': span('countdownZero', 'fanfarePhase2'),
            'toPhase3Byte': span('fanfarePhase2', 'fanfarePhase3'),
            'toRamp': span('fanfarePhase3', 'windowRampStart'),
            'ramp': span('windowRampStart', 'windowRampEnd'),
            'toClear': span('windowRampEnd', 'routeWrite'),
            'total': span('countdownArmed', 'routeWrite'),
        }
        rec['fanfareCalls'] = hits['fanfare']
    else:
        rec['spans'] = {
            'seedToHandoff': (tl['handoff'] - tl['burstSeeded']
                              if 'handoff' in tl and 'burstSeeded' in tl else None),
        }
    end = {'routeMask': m[0xC753], 'countdown': m[0xC740], 'bossId': m[0xC73E],
           'lives': m[0xC767], 'continueAvailable': m[0xFFB5],
           'burst': burst(m), 'pool': [p for p in pool(m) if p[0] != 0],
           'enemy0': rd(m, ENEMY0, 32)}

    out = {'event': args.event, 'level': args.level, 'mask': args.mask,
           'pokeAt': args.poke_at, 'bossHpWas': poked['hp'],
           'lagFrames': ctr['lag'], 'driverStalls': ctr['skip'],
           'start': start, 'end': end, **rec}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({'event': args.event, 'level': args.level,
                      'timeline': tl, 'stalls': rec['stalls'],
                      'spans': rec['spans'],
                      'lag': ctr['lag'], 'driverStalls': ctr['skip']}))
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
