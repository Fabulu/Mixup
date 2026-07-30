#!/usr/bin/env python3
"""Which reachable ROM routines does the port not cite anywhere?

Answers "what have we missed?" with a measurement instead of an impression --
this is how the stage-intro screen (sub_00_333F) was found, having sat
unported and uncatalogued through the whole project.

Method. Every routine gbdis finds an xref to is REACHABLE. Every address any
comment in src/ cites is COVERED. Reachable-minus-covered is the raw gap, but
it badly overstates: most entries are internal jump targets inside routines
that ARE ported, and the port cites a routine once rather than labelling every
branch inside it. So the report ranks by DISTANCE to the nearest cited address
in the same bank -- a label 0x20 bytes past a citation is almost certainly
inside ported code; one 0x100+ bytes from anything is a region nobody has
touched.

The distance test is a heuristic and the raw count is not. Both are printed.
A bare `$XXXX` in a comment is treated as bank 0 AND, if it is >= $4000, as
every bank -- deliberately generous, because the alternative is a flood of
false positives from banked addresses whose bank the comment leaves implicit.

Usage:
    python tools/gbdis.py "<rom>" --all --outdir /tmp/dis
    python tools/audit_coverage.py games/batman /tmp/dis
"""
import os, re, sys, glob

# argv[1] is the GAME directory (the one holding src/), not the repo root.
ROOT = sys.argv[1]
DIS  = sys.argv[2]

# Every address the port cites, in any of the forms the comments use:
#   $1B4A   loc_00_1B4A   sub_01_4EB8   1:$4EB8   0:$0857
cited = set()
for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True):
    txt = open(f, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'(?:sub|loc|jt|user)_(\d\d)_([0-9A-Fa-f]{4})', txt):
        cited.add((int(m.group(1)), int(m.group(2), 16)))
    for m in re.finditer(r'(\d):\$([0-9A-Fa-f]{4})', txt):
        cited.add((int(m.group(1)), int(m.group(2), 16)))
    for m in re.finditer(r'\$([0-9A-Fa-f]{4})', txt):
        a = int(m.group(1), 16)
        cited.add((0, a))            # bare $XXXX -- bank 0 by convention
        if a >= 0x4000:              # ...but a banked address could be any bank
            for b in range(1, 8):
                cited.add((b, a))

rows = []
for bank in range(8):
    path = os.path.join(DIS, f'bank_{bank:02d}.asm')
    if not os.path.exists(path):
        continue
    txt = open(path, encoding='utf-8', errors='replace').read()
    # "; xrefs: 01:5C93, ..." immediately precedes a label line
    for m in re.finditer(r'^; xrefs: ([^\n]+)\n(\w+):\n', txt, re.M):
        label = m.group(2)
        n = len(m.group(1).split(','))
        lm = re.match(r'(?:sub|loc|jt|user)_(\d\d)_([0-9A-Fa-f]{4})', label)
        if not lm:
            continue
        addr = int(lm.group(2), 16)
        if (bank, addr) in cited:
            continue
        rows.append((n, bank, addr, label))

import bisect
by_bank = {}
for b, a in cited:
    by_bank.setdefault(b, []).append(a)
for b in by_bank:
    by_bank[b].sort()

def gap(bank, addr):
    xs = by_bank.get(bank, [])
    i = bisect.bisect_left(xs, addr)
    return addr - xs[i - 1] if i else 1 << 30

NEAR = 0x100
orphans = sorted(((n, b, a, l) for n, b, a, l in rows if gap(b, a) > NEAR),
                 reverse=True)

print(f'{len(rows)} reachable routines are cited nowhere in src/.')
print(f'{len(orphans)} of those sit more than 0x{NEAR:X} bytes from ANY cited')
print('address -- i.e. in regions the port has not touched at all.')
print()
print(f'{"xrefs":>5}  {"routine":<16}  gap')
for n, b, a, l in orphans[:45]:
    print(f'{n:5d}  {l:<16}  0x{gap(b, a):X}')
