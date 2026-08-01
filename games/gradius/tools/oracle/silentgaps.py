#!/usr/bin/env python3
"""Find SILENT non-implementations: a ROM basic block inside a routine the port
otherwise implements, that games/gradius/src/ never mentions at all.

A named gap is a throw carrying an address.  A silent gap is a quiet return.
This looks for the second kind, mechanically:

  1. recursive-descent the mode-5 frame from $9650 (callcensus.py's walk);
  2. cut the reachable code into basic blocks at every label / branch target;
  3. for each block, ask whether ANY address inside it appears in src/;
  4. report the blocks with ZERO mentions, restricted to the ROM regions the
     port claims (so the 25-block boss file does not drown the signal).

Not proof of a bug -- proof that nobody wrote the address down.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASM = os.path.join(HERE, '..', '..', 'rip', 'prg.asm')
SRC = os.path.join(HERE, '..', '..', 'src')
PRG = open(os.path.join(HERE, '..', '..', 'assets', 'prg.bin'), 'rb').read()
def wd(a): return PRG[a - 0x8000] | (PRG[a - 0x8000 + 1] << 8)

line_re = re.compile(r'^\s{4}([0-9A-F]{4}): ((?:[0-9A-F]{2} )+)\s*([A-Z]{3})?\s*(.*)$')
lab_re = re.compile(r'^(loc|sub|st|jt)_([0-9A-F]{4}):')
code, labels = {}, set()
with open(ASM) as f:
    for ln in f:
        ln = ln.rstrip('\n')
        m = lab_re.match(ln)
        if m:
            labels.add(int(m.group(2), 16))
            continue
        m = line_re.match(ln)
        if m:
            code[int(m.group(1), 16)] = (
                m.group(3), (m.group(4) or '').split(';')[0].strip(),
                len(m.group(2).split()))

INLINE = {0x80D4: 7, 0x88AD: 5, 0x8989: 7, 0x96C5: 5,
          0x982F: 16, 0xAE1C: 42, 0xC439: 11}
TABLE_TARGETS = {b: [wd(b + 2 * i) for i in range(n)] for b, n in INLINE.items()}
abs_re = re.compile(r'^\$([0-9A-F]{4})$')
BRANCH = ('BEQ', 'BNE', 'BCC', 'BCS', 'BMI', 'BPL', 'BVC', 'BVS')

def reach(entries):
    seen, stack = set(), list(entries)
    while stack:
        a = stack.pop()
        if a in seen or a not in code:
            continue
        seen.add(a)
        mn, op, nb = code[a]
        m = abs_re.match(op)
        if mn in ('JSR', 'JMP') and m:
            t = int(m.group(1), 16)
            stack.append(t)
            if t == 0x83E4 and (a + 3) in TABLE_TARGETS:
                stack.extend(TABLE_TARGETS[a + 3])
        elif mn in BRANCH and m:
            stack.append(int(m.group(1), 16))
        if mn not in ('RTS', 'RTI', 'JMP', 'BRK'):
            stack.append(a + nb)
    return seen

SEEN = reach([0x9650])

ADDR = re.compile(r'(?:\$|0x|st_|loc_|sub_|jt_|h_|hdlr)([0-9A-Fa-f]{4})\b')
named = set()
for root, _, files in os.walk(SRC):
    for fn in files:
        if fn.endswith('.js'):
            t = open(os.path.join(root, fn), encoding='utf-8',
                     errors='replace').read()
            named.update(int(m.group(1), 16) for m in ADDR.finditer(t))

# --- cut into blocks --------------------------------------------------------
starts = sorted(a for a in SEEN if a in labels or a == 0x9650)
addrs = sorted(SEEN)
blocks = []
for i, s in enumerate(starts):
    end = starts[i + 1] if i + 1 < len(starts) else 0x10000
    body = [a for a in addrs if s <= a < end]
    if body:
        blocks.append((s, body))

# regions the port CLAIMS -- everything else is a whole unported subsystem and
# is reported separately by callcensus.py
CLAIMED = [
    (0x8000, 0x83FF, 'boot / house helpers'),
    (0x8400, 0x87FF, 'math + canned VRAM packets'),
    (0x8800, 0x8BFF, 'VRAM streamer / OAM builder'),
    (0x9600, 0x9CFF, 'flow / mode-5 state machine'),
    (0x9D00, 0x9FFF, 'terrain streamer'),
    (0xA000, 0xA1FF, 'player + weapons'),
    (0xA200, 0xA5FF, 'spawn engine'),
    (0xA600, 0xAEE9, 'enemy update + $AE1C ported handlers'),
    (0xB020, 0xB2D0, 'ported enemy handlers $B026/$B098/$B0AF/$B198/$B205/$B26C'),
    (0xBBB7, 0xBFFF, 'enemy bullets + shot sweep'),
    (0xC000, 0xC3FF, 'collision'),
    (0xEC00, 0xFFFF, 'sound driver'),
]

print("=" * 74)
print("SILENT-GAP SCAN -- reachable mode-5 blocks with NO mention in src/")
print("=" * 74)
print("mode-5 reachable instruction addresses: %d" % len(SEEN))
print("basic blocks in that set             : %d" % len(blocks))
tot_silent = 0
for lo, hi, name in CLAIMED:
    rows = []
    n_in = 0
    for s, body in blocks:
        if not (lo <= s <= hi):
            continue
        n_in += 1
        if not any(a in named for a in body):
            rows.append((s, body[-1], len(body)))
    if not n_in:
        continue
    print("\n$%04X-$%04X  %s" % (lo, hi, name))
    print("   %d blocks reachable, %d with ZERO mention in src/" % (n_in, len(rows)))
    for s, e, n in rows:
        mn, op, _ = code[s]
        print("      $%04X-$%04X (%2d instrs)  first: %s %s" % (s, e, n, mn, op))
        tot_silent += 1
print("\nTOTAL silent blocks in claimed regions: %d" % tot_silent)
