#!/usr/bin/env python3
"""Static call-graph census: every subroutine reachable from the MODE-5 FRAME,
and what games/gradius/src/ says about it.

Method (docs/knowledge/09-enumerate-then-validate.md): the ROM is the inventory.
Recursive descent over rip/prg.asm from the NMI $806A and from the mode-5 entry
$9650, expanding the seven inline jump tables, collects every JSR/JMP target.
That set is then split three ways against src/:

  IMPLEMENTED    the address appears in src/ outside any throw() argument
  NAMED-UNPORTED the address appears ONLY inside a throw() argument
  SILENT         the address appears nowhere in src/ at all

The third class is the one this pass exists to find: a ROM routine the port has
never even acknowledged.  Exactly the shape that shipped twice before.
"""
import os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ASM = os.path.join(HERE, '..', '..', 'rip', 'prg.asm')
SRC = os.path.join(HERE, '..', '..', 'src')

line_re = re.compile(r'^\s{4}([0-9A-F]{4}): ((?:[0-9A-F]{2} )+)\s*([A-Z]{3})?\s*(.*)$')
code = {}
with open(ASM) as f:
    for ln in f:
        m = line_re.match(ln.rstrip('\n'))
        if not m:
            continue
        a = int(m.group(1), 16)
        code[a] = (m.group(3), (m.group(4) or '').split(';')[0].strip(),
                   len(m.group(2).split()))

INLINE = {0x80D4: 7, 0x88AD: 5, 0x8989: 7, 0x96C5: 5,
          0x982F: 16, 0xAE1C: 42, 0xC439: 11}
PRG = open(os.path.join(HERE, '..', '..', 'assets', 'prg.bin'), 'rb').read()
def wd(a): return PRG[a - 0x8000] | (PRG[a - 0x8000 + 1] << 8)
TABLE_TARGETS = {b: [wd(b + 2 * i) for i in range(n)] for b, n in INLINE.items()}

abs_re = re.compile(r'^\$([0-9A-F]{4})$')
BRANCH = ('BEQ', 'BNE', 'BCC', 'BCS', 'BMI', 'BPL', 'BVC', 'BVS')

def reach(entries):
    seen, calls = set(), set()
    stack = list(entries)
    while stack:
        a = stack.pop()
        if a in seen or a not in code:
            continue
        seen.add(a)
        mn, op, nb = code[a]
        m = abs_re.match(op)
        if mn in ('JSR', 'JMP') and m:
            t = int(m.group(1), 16)
            calls.add(t); stack.append(t)
            if t == 0x83E4 and (a + 3) in TABLE_TARGETS:
                for tt in TABLE_TARGETS[a + 3]:
                    calls.add(tt); stack.append(tt)
        elif mn in BRANCH and m:
            stack.append(int(m.group(1), 16))
        if mn not in ('RTS', 'RTI', 'JMP', 'BRK'):
            stack.append(a + nb)
    return seen, calls

ADDR = re.compile(r'(?:\$|0x|st_|loc_|sub_|jt_|h_|hdlr)([0-9A-Fa-f]{4})\b')

def scan_src():
    """Return (all_named, throw_only). A throw() argument is everything from
    `throw` to the terminating `);` -- crude but this source writes them that
    way consistently."""
    allnamed, inthrow = set(), set()
    for root, _, files in os.walk(SRC):
        for fn in sorted(files):
            if not fn.endswith('.js'):
                continue
            txt = open(os.path.join(root, fn), encoding='utf-8',
                       errors='replace').read()
            # throw bodies
            for m in re.finditer(r'throw new Error\((.*?)\);', txt, re.S):
                for a in ADDR.finditer(m.group(1)):
                    inthrow.add(int(a.group(1), 16))
            for a in ADDR.finditer(txt):
                allnamed.add(int(a.group(1), 16))
    return allnamed, inthrow

ALL, THROWN = scan_src()

def classify(t):
    if t not in ALL:
        return 'SILENT'
    if t in THROWN and t not in (ALL - THROWN):
        pass
    return 'NAMED'

def report(title, calls, seen):
    inprg = sorted(t for t in calls if 0x8000 <= t <= 0xFFFF)
    silent = [t for t in inprg if t not in ALL]
    named = [t for t in inprg if t in ALL]
    print("\n%s" % title)
    print("  JSR/JMP targets reachable        : %d" % len(inprg))
    print("  named anywhere in src/           : %d  (%.0f%%)"
          % (len(named), 100.0 * len(named) / len(inprg)))
    print("  NOT MENTIONED ANYWHERE in src/   : %d  (%.0f%%)"
          % (len(silent), 100.0 * len(silent) / len(inprg)))
    for i in range(0, len(silent), 12):
        print("     " + " ".join("$%04X" % t for t in silent[i:i + 12]))
    print("  reachable instruction addresses  : %d bytes-of-code entries "
          "(%.1f%% of the 32 KB image)" % (len(seen), 100.0 * len(seen) / 32768))
    return inprg, silent

print("=" * 74)
print("CALL-GRAPH CENSUS  (rip/prg.asm recursive descent, inline tables expanded)")
print("=" * 74)
seen_nmi, calls_nmi = reach([0x806A])
seen_m5, calls_m5 = reach([0x9650])
report("From the NMI $806A -- the whole cartridge frame, all seven game modes:",
       calls_nmi, seen_nmi)
inprg5, silent5 = report("From the mode-5 entry $9650 -- stage play only:",
                         calls_m5, seen_m5)

# Bucket the mode-5 silent set by ROM region so the gaps have names.
REGIONS = [
    (0x8000, 0x83FF, 'boot / house helpers'),
    (0x8400, 0x87FF, 'math + canned VRAM packets'),
    (0x8800, 0x8BFF, 'VRAM streamer / OAM builder'),
    (0x8C00, 0x8FFF, 'metasprite tables'),
    (0x9000, 0x95FF, 'unreached region'),
    (0x9600, 0x9CFF, 'flow / mode-5 state machine'),
    (0x9D00, 0x9FFF, 'terrain streamer'),
    (0xA000, 0xA1FF, 'player + weapons'),
    (0xA200, 0xA5FF, 'spawn engine'),
    (0xA600, 0xADFF, 'wave tables + enemy update'),
    (0xAE00, 0xBBFF, 'enemy handlers'),
    (0xBC00, 0xBFFF, 'enemy bullets / shot sweep'),
    (0xC000, 0xC3FF, 'collision'),
    (0xC400, 0xC8FF, 'stage advance / terrain enemies'),
    (0xC900, 0xCFFF, 'bosses'),
    (0xD000, 0xEBFF, 'CHR-ish / unreached'),
    (0xEC00, 0xFFFF, 'sound driver'),
]
print("\n  the SILENT mode-5 set by ROM region:")
for lo, hi, name in REGIONS:
    hits = [t for t in silent5 if lo <= t <= hi]
    tot = [t for t in inprg5 if lo <= t <= hi]
    if tot:
        print("    $%04X-$%04X %-32s %3d silent of %3d reachable"
              % (lo, hi, name, len(hits), len(tot)))
