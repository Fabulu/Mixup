#!/usr/bin/env python3
"""Record everything that writes VRAM while the cartridge builds the title.

assets/title.vram.bin is a capture of the result. To retire it we have to know
what PRODUCED it, which is three different mechanisms: block copies through
sub_00_09FB (the tile bitmaps), the stack-based tilemap fill at sub_00_34A4,
and the VRAM scripts at sub_00_0A0E (already ported).

This logs all three in execution order, with enough detail to replay them.

Usage:  python tools/oracle/titlebuild.py
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

COPY = 0x09FB             # sub_00_09FB: HL=src, DE=dest, BC=count
FILL = 0x34A4             # sub_00_34A4: D=fill byte
SCRIPT = 0x0A0E           # sub_00_0A0E: DE=script
TITLE_LOOP = 0x02C4


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--until', type=int, default=1500)
    ap.add_argument('--out', default='rip/titlebuild.json')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    m = pyboy.memory

    events = []
    snaps = []
    # sub_00_09FB's loop jumps back to its own first instruction, so the hook
    # fires once per BYTE. A hit is a fresh call only when it does not continue
    # the previous one.
    last = {'hl': None, 'bc': None}

    def on_copy(_):
        hl, bc = reg.HL, (reg.B << 8) | reg.C
        de = (reg.D << 8) | reg.E
        if last['hl'] is not None and hl == last['hl'] + 1 and bc == last['bc'] - 1:
            last['hl'], last['bc'] = hl, bc
            return
        last['hl'], last['bc'] = hl, bc
        ev = {'kind': 'copy', 'src': hl, 'dest': de, 'len': bc,
              'bank': m[0xC703]}
        # Only VRAM-bound copies matter here, and the source bank is mapped
        # right now -- so grab the bytes while we can see them.
        if 0x8000 <= de < 0xA000:
            ev['bytes'] = [m[hl + i] for i in range(bc)]
        events.append(ev)

    def snap(tag):
        v = m[0x8000:0xA000]
        snaps.append({'tag': tag, 'at': len(events),
                      'v9800': v[0x1800], 'v9a3f': v[0x1a3f],
                      'v9c00': v[0x1c00], 'v9ffe': v[0x1ffe],
                      'nonzero': sum(1 for b in v if b)})

    def on_fill(_):
        snap('before fill')
        events.append({'kind': 'fill', 'value': reg.D})

    script_state = {'expect': None}

    def record_len(at):
        ctrl = m[at + 2]
        return 3 + (1 if (ctrl >> 6) in (1, 3) else ((ctrl & 0x3F) or 0x100))

    def on_script(_):
        de = (reg.D << 8) | reg.E
        if de != script_state['expect']:
            p = de
            while m[p] != 0x00:
                p += record_len(p)
            events.append({'kind': 'script', 'addr': de, 'bank': m[0xC703],
                           'bytes': [m[i] for i in range(de, p + 1)]})
        script_state['expect'] = None if m[de] == 0x00 else de + record_len(de)

    # $0150 is the boot/reset entry -- snapshot as early as anything runs.
    pyboy.hook_register(0, 0x0150, lambda _: snap('boot $0150')
                        if not snaps else None, None)
    pyboy.hook_register(0, 0x022E, lambda _: snap('$022E copyright'), None)
    pyboy.hook_register(0, 0x027D, lambda _: snap('$027D title build'), None)
    pyboy.hook_register(0, COPY, on_copy, None)
    pyboy.hook_register(0, FILL, on_fill, None)
    pyboy.hook_register(0, SCRIPT, on_script, None)

    hit = {'n': 0}
    pyboy.hook_register(0, TITLE_LOOP,
                        lambda _: hit.__setitem__('n', hit['n'] + 1), None)

    for _ in range(args.until):
        pyboy.tick(1, False)
        if hit['n'] > 40:
            break

    vram = list(m[0x8000:0xA000])
    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'events': events, 'vram': vram, 'snaps': snaps}, fh)

    kinds = {}
    for e in events:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    print(f'reached the title loop {hit["n"]}x')
    print('events:', kinds)

    print('\nblock copies landing in VRAM:')
    for e in events:
        if e['kind'] != 'copy':
            continue
        if 0x8000 <= e['dest'] < 0xA000:
            print(f"  bank {e['bank']:02X}:${e['src']:04X} -> ${e['dest']:04X}"
                  f"  {e['len']:5d} B")
    other = [e for e in events
             if e['kind'] == 'copy' and not 0x8000 <= e['dest'] < 0xA000]
    print(f'({len(other)} more copies to non-VRAM destinations)')
    print(f'\nwrote {out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
