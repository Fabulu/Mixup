#!/usr/bin/env python3
"""Hold the ROM-resolved animated-tile tables against the recording.

`waterbuild.py` logs, per frame, the ($C70F, $C710, $C711, dest) cursor triple
and the 32 bytes the cartridge staged at $C5CB.  This replays loc_00_3127 from
the tables alone and asserts every one of those, in order.

  python tools/oracle/waterbuild.py --level 1 --frames 200
  python tools/oracle/animcheck.py  --level 1
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbrom import Rom                              # noqa: E402
import animtables                                  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    args = ap.parse_args()

    path = os.path.join(ROOT, 'rip', 'waterbuild-%02d.json' % args.level)
    rec = json.load(open(path, encoding='utf-8'))
    rom = Rom()

    key = args.level
    if args.level == 6 and rec.get('ffc9') == 1:
        key = '6alt'
    tables = animtables.resolve_all(rom)
    t = tables.get(key)
    if t is None:
        if rec['events']['anim']:
            raise SystemExit('the tables say level %d does not animate, but '
                             '%d writes were recorded'
                             % (args.level, len(rec['events']['anim'])))
        print('level %d: no animation, and none recorded - agreed'
              % args.level)
        return

    # loc_00_3127's three cursors, cleared by $0523-$0529 at level init.
    c70f = c710 = c711 = 0
    bad = 0
    for i, e in enumerate(rec['events']['anim']):
        src = t['blocks'][c70f * 2 + c710]
        dest = t['dests'][c710 + c711 * 2]
        want = (c70f, c710, c711, dest, list(src))
        got = (e['c70f'], e['c710'], e['c711'], e['dest'], e['bytes'])
        if want != got:
            bad += 1
            if bad <= 5:
                print('frame %d MISMATCH' % e['f'])
                for name, w, g in zip(('c70f', 'c710', 'c711', 'dest', 'bytes'),
                                      want, got):
                    if w != g:
                        print('   %-5s built=%s  cart=%s' % (name, w, g))
        # $31B5-$31EA: advance.
        c710 += 1
        if c710 >= 2:
            c710 = 0
            c70f = c70f + 1 if c70f + 1 < len(t['steps']) else 0
            c711 = t['steps'][c70f]

    n = len(rec['events']['anim'])
    print('level %d: %d/%d staged blocks reproduced from ROM tables'
          % (args.level, n - bad, n))
    print('  dest table 0:$%04X -> %s' % (t['destPtr'],
          ' '.join('$%04X' % d for d in t['dests'])))
    print('  step table 0:$%04X -> %s' % (t['stepPtr'], t['steps']))
    print('  src  table 2:$%04X, %d blocks' % (t['srcPtr'], len(t['blocks'])))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
