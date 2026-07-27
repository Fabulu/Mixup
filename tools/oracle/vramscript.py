#!/usr/bin/env python3
"""Record every write sub_00_0A0E makes on the real cartridge.

The interpreter's output is a stream of (address, value) writes in a specific
order, so that stream -- not the VRAM image it ends up producing -- is the
thing to compare. Comparing the image would let a wrong ORDER pass, and would
also drag in the tile bitmaps, which arrive by block copy and have nothing to
do with this routine.

Hooks the four store sites, one per mode, and reads HL and A out of the CPU at
each. Also dumps the raw script bytes each record came from, so the JS side can
be fed exactly what the cartridge was fed.

Usage:
  python tools/oracle/vramscript.py                 # -> rip/vramscript.json
  python tools/oracle/vramscript.py --until 3000    # more of the boot path
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

SCRIPT_ENTRY = 0x0A0E     # sub_00_0A0E: DE = script pointer
RECORD = 0x0A14           # sub_00_0A14: one record, A = ctrl, HL = dest
TITLE_LOOP = 0x02C4
LEVEL_INIT = 0x04BB        # route dispatcher has just written $FFB0
MAIN_LOOP = 0x0567

# The store in each mode's inner loop. HL is the destination and A the value
# at the instant these execute.
STORES = {
    0x0A28: 0,            # copy horizontal, LD [HL+],A
    0x0A30: 1,            # RLE horizontal
    0x0A36: 2,            # copy vertical, LD (HL),A
    0x0A43: 3,            # RLE vertical
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--until', type=int, default=1200,
                    help='emulator frames to run')
    ap.add_argument('--out', default='rip/vramscript.json')
    ap.add_argument('--level', type=int, default=None,
                    help='boot all the way into this level instead of stopping '
                         'at the title, so the level-init scripts ($32A3) and '
                         'the levels-1/2 window surface ($0E24) run too -- '
                         'that is where the modes other than copy-horizontal '
                         'actually appear')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    m = pyboy.memory

    writes = []
    records = []
    scripts = []

    def record_len(at):
        """Bytes this record occupies, header included."""
        ctrl = m[at + 2]
        count = (ctrl & 0x3F) or 0x100
        mode = ctrl >> 6
        return 3 + (1 if mode in (1, 3) else count)

    def walk(at):
        """Raw bytes of a whole script, terminator included."""
        p = at
        while m[p] != 0x00:
            p += record_len(p)
        return [m[i] for i in range(at, p + 1)]

    # $0A0E is both the entry point and the loop head, so it fires once per
    # record plus once for the terminator. An invocation is a hit whose DE is
    # NOT where the previous record left off.
    state = {'expect': None}

    def on_entry(_):
        de = (reg.D << 8) | reg.E
        if de != state['expect']:
            scripts.append({'addr': de, 'bank': m[0xC703], 'bytes': walk(de)})
        state['expect'] = None if m[de] == 0x00 else de + record_len(de)

    def on_record(_):
        records.append({'dest': reg.HL, 'ctrl': reg.A,
                        'de': (reg.D << 8) | reg.E, 'bank': m[0xC703]})

    def on_store(_, mode):
        writes.append([reg.HL, reg.A, mode])

    pyboy.hook_register(0, SCRIPT_ENTRY, on_entry, None)
    pyboy.hook_register(0, RECORD, on_record, None)
    for addr, mode in STORES.items():
        pyboy.hook_register(0, addr, lambda _, mo=mode: on_store(_, mo), None)

    hit = {'n': 0}
    pyboy.hook_register(0, TITLE_LOOP,
                        lambda _: hit.__setitem__('n', hit['n'] + 1), None)

    if args.level is None:
        for _ in range(args.until):
            pyboy.tick(1, False)
            if hit['n'] > 40:
                break
    else:
        inj = {'done': False}

        def on_init(_):
            if not inj['done']:
                inj['done'] = True
                pyboy.memory[0xFFB0] = args.level

        if args.level != 1:
            pyboy.hook_register(0, LEVEL_INIT, on_init, None)
        started = {'v': False}
        pyboy.hook_register(0, MAIN_LOOP,
                            lambda _: started.__setitem__('v', True), None)
        for f in range(args.until):
            if started['v']:
                break
            if f % 30 == 0:
                pyboy.button('start', delay=3)
            pyboy.tick(1, False)
        for _ in range(30):
            pyboy.tick(1, False)

    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'writes': writes, 'records': records,
                   'scripts': scripts}, fh)

    print(f'reached the title loop {hit["n"]}x')
    print(f'{len(scripts)} script invocations, {len(records)} records, '
          f'{len(writes)} writes')
    for sc in scripts:
        print(f"  bank {sc['bank']:02X}:${sc['addr']:04X}  {len(sc['bytes'])} bytes")

    by_mode = {}
    for _, _, mode in writes:
        by_mode[mode] = by_mode.get(mode, 0) + 1
    print('writes by mode:', dict(sorted(by_mode.items())))

    lo = min(w[0] for w in writes)
    hi = max(w[0] for w in writes)
    print(f'destination range: ${lo:04X}-${hi:04X}')
    print(f'\nwrote {out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
