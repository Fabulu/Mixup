#!/usr/bin/env python3
"""Record everything the STAGE CLEAR screen writes to VRAM, from the cartridge.

The victory fanfare (loc_00_34D0) paints its picture with three mechanisms, all
of them already ported somewhere in this tree -- which is the whole point:

  loc_00_350F   23 x 32 B of bank-6 tile data, one block per frame, handed to
                the VBlank ISR's $FF9B/$C5CB block queue ($074E-$07BA).
  loc_00_3566   two sub_00_09FB copies of bank-6 VRAM SCRIPTS into $C61B, which
                the same ISR runs through sub_00_0A0E ($0714).  They paint the
                WINDOW tilemap at $9C00, not the BG.
  $35B2-$35C9   the STAT/LYC program: $FFC7 = 5 (loc_00_08EA, "rWX = $A8"),
                rLYC = min($FFAC + $20, $8F), $FFAB = $07, $FFAC ramping.

So this hooks all three and snapshots VRAM either side of the sequence.  The
BEFORE snapshot matters as much as the AFTER one: the level's own $9800 tilemap
is streamed at runtime and is not modelled by the port at all, so the honest bar
is "every byte the fanfare CHANGES is right", and the only way to know which
bytes those are is to measure them.

  python tools/oracle/stageclear.py --level 4 --out rip/oracle/stageclear-l4.json

Landmarks are recorded per main-loop iteration ($0A4F), never per pyboy.tick --
a lag frame gives two hardware frames for one iteration (deathscen.py's note).
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
RESET = 0x0150
COPY = 0x09FB           # sub_00_09FB: HL=src, DE=dest, BC=count
SCRIPT = 0x0A0E         # sub_00_0A0E: DE=script
QUEUE = 0x0757          # the ISR's 32-B block flush; DE=dest, $C5CB=payload
FANFARE = 0x34D0
PHASE1 = 0x350F
BLOCKS = 0x3566
HOLD = 0x35D8           # the ramp is finished and everything is on screen
DISPATCH = 0x35E8       # loc_00_35E8, one instruction before the level leaves
LAG_SKIP = (1, 0x4E3F)

ENEMY0 = 0xC268
QUEUE_BUF = 0xC5CB


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=4)
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--frames', type=int, default=1600)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    m = pyboy.memory

    ctr = {'n': 0, 'started': False, 'skip': 0}
    hits = {'fanfare': 0, 'phase1': 0, 'blocks': 0, 'hold': 0, 'dispatch': 0,
            'reset': 0}
    injected = {'v': False}
    events = []
    snaps = {}
    samples = []
    watching = {'v': False}

    def on_level_init(_):
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    # sub_00_09FB's loop jumps back to its own head, so the hook fires once per
    # BYTE (titlebuild.py's note). A hit is a fresh call only when it does not
    # continue the previous one.
    last = {'hl': None, 'bc': None}

    def on_copy(_):
        hl, bc = reg.HL, (reg.B << 8) | reg.C
        de = (reg.D << 8) | reg.E
        if last['hl'] is not None and hl == last['hl'] + 1 and bc == last['bc'] - 1:
            last['hl'], last['bc'] = hl, bc
            return
        last['hl'], last['bc'] = hl, bc
        if not watching['v']:
            return
        events.append({'kind': 'copy', 'frame': ctr['n'], 'src': hl, 'dest': de,
                       'len': bc, 'bank': m[0xC703],
                       'bytes': [m[hl + i] for i in range(bc)]})

    def record_len(at):
        ctrl = m[at + 2]
        return 3 + (1 if (ctrl >> 6) in (1, 3) else ((ctrl & 0x3F) or 0x100))

    script_state = {'expect': None}

    def on_script(_):
        de = (reg.D << 8) | reg.E
        if de != script_state['expect'] and watching['v']:
            p = de
            while m[p] != 0x00:
                p += record_len(p)
            events.append({'kind': 'script', 'frame': ctr['n'], 'addr': de,
                           'bytes': [m[i] for i in range(de, p + 1)]})
        script_state['expect'] = None if m[de] == 0x00 else de + record_len(de)

    def on_queue(_):
        if not watching['v']:
            return
        de = (reg.D << 8) | reg.E
        events.append({'kind': 'queue', 'frame': ctr['n'], 'dest': de,
                       'bytes': [m[QUEUE_BUF + i] for i in range(0x20)]})

    def regs():
        return {
            'FFAB': m[0xFFAB], 'FFAC': m[0xFFAC], 'FFC7': m[0xFFC7],
            'FFAD': m[0xFFAD], 'FFAE': m[0xFFAE], 'FFAF': m[0xFFAF],
            'FFA9': m[0xFFA9], 'FFAA': m[0xFFAA],
            'rLCDC': m[0xFF40], 'rSTAT': m[0xFF41] & 0x78, 'rLYC': m[0xFF45],
            'rWX': m[0xFF4B], 'rWY': m[0xFF4A], 'rIE': m[0xFFFF],
            'C712': m[0xC712], 'C70E': m[0xC70E], 'C70F': m[0xC70F],
            'C74E': m[0xC74E], 'C74F': m[0xC74F],
        }

    def snap(tag):
        if tag in snaps:
            return
        snaps[tag] = {'frame': ctr['n'], 'vram': list(m[0x8000:0xA000]),
                      'regs': regs()}

    def on_fanfare(_):
        hits['fanfare'] += 1
        if hits['fanfare'] == 1:
            watching['v'] = True
            snap('before')

    def on_hold(_):
        hits['hold'] += 1
        snap('hold')

    def on_dispatch(_):
        hits['dispatch'] += 1
        snap('dispatch')

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, RESET, lambda _: hits.__setitem__('reset', hits['reset'] + 1), None)
    pyboy.hook_register(0, COPY, on_copy, None)
    pyboy.hook_register(0, SCRIPT, on_script, None)
    pyboy.hook_register(0, QUEUE, on_queue, None)
    pyboy.hook_register(0, FANFARE, on_fanfare, None)
    pyboy.hook_register(0, PHASE1, lambda _: hits.__setitem__('phase1', hits['phase1'] + 1), None)
    pyboy.hook_register(0, BLOCKS, lambda _: hits.__setitem__('blocks', hits['blocks'] + 1), None)
    pyboy.hook_register(0, HOLD, on_hold, None)
    pyboy.hook_register(0, DISPATCH, on_dispatch, None)
    pyboy.hook_register(LAG_SKIP[0], LAG_SKIP[1],
                        lambda _: ctr.__setitem__('skip', ctr['skip'] + 1), None)

    def frame_end(_):
        ctr['n'] += 1
        if watching['v']:
            samples.append({'frame': ctr['n'], 'FFAC': m[0xFFAC],
                            'rLYC': m[0xFF45], 'FFC7': m[0xFFC7],
                            'FFAB': m[0xFFAB], 'C712': m[0xC712],
                            'FFAD': m[0xFFAD], 'FFAE': m[0xFFAE],
                            'FFAF': m[0xFFAF], 'stalls': ctr['skip']})

    pyboy.hook_register(0, FRAME_END, frame_end, None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: ctr.__setitem__('started', True), None)

    for f in range(3000):
        if ctr['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before reading a single byte.
    if not ctr['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got {m[0xFFB0]}')
    if m[0xC73E] == 0:
        raise SystemExit(f'FAIL: level {args.level} has no boss ($C73E = 0)')

    # The boot path already tripped $0150 once; leaving the counters alone makes
    # every "has it happened yet?" test true on the first tick (deathscen.py).
    for k in hits:
        hits[k] = 0
    base = ctr['n']
    ctr['skip'] = 0
    poked = {'v': False, 'hp': None}

    while ctr['n'] - base < args.frames:
        if not poked['v'] and ctr['n'] - base >= args.poke_at:
            poked['v'] = True
            poked['hp'] = m[ENEMY0 + 0x16]
            m[ENEMY0 + 0x16] = 0                    # 1:$4E82's own trigger
        pyboy.tick(1, False)
        if hits['dispatch'] or hits['reset']:
            break

    if not hits['fanfare']:
        raise SystemExit('FAIL: loc_00_34D0 never ran')
    if 'hold' not in snaps:
        raise SystemExit('FAIL: the fanfare never reached loc_00_35D8')
    if 'dispatch' not in snaps:
        raise SystemExit('FAIL: the fanfare never reached loc_00_35E8')

    for tag in snaps:
        snaps[tag]['frame'] -= base
    for s in samples:
        s['frame'] -= base

    out = {'level': args.level, 'bossHpWas': poked['hp'],
           'driverStalls': ctr['skip'],
           'hits': hits, 'events': events, 'snaps': snaps, 'samples': samples}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh)

    before = snaps['before']['vram']
    hold = snaps['hold']['vram']
    disp = snaps['dispatch']['vram']
    runs = []
    run = None
    for i in range(0x2000):
        if before[i] != hold[i]:
            if run is None:
                run = [i, i]
            else:
                run[1] = i
        elif run is not None:
            runs.append(run)
            run = None
    if run is not None:
        runs.append(run)
    changed = sum(r[1] - r[0] + 1 for r in runs)
    kinds = {}
    for e in events:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    print(f"level {args.level}: phase1 x{hits['phase1']}, blocks x{hits['blocks']}, "
          f"events {kinds}, stalls {ctr['skip']}")
    print(f"VRAM changed by the fanfare: {changed} B in {len(runs)} run(s)")
    for a, b in runs[:24]:
        print(f'  ${0x8000 + a:04X}-${0x8000 + b:04X}  {b - a + 1} B')
    if len(runs) > 24:
        print(f'  ... and {len(runs) - 24} more')
    same = sum(1 for i in range(0x2000) if hold[i] == disp[i])
    print(f'hold vs dispatch snapshot: {same}/8192 identical')
    print('regs at hold:', json.dumps(snaps['hold']['regs']))
    print(f'wrote {args.out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
