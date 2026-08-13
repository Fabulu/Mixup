#!/usr/bin/env python3
"""Decode every branch in a span and print its target. No verdict, just the arithmetic.

W362 built this after a hand-computed branch target went into a commit AND a frozen spec const with two
instructions sharing one address -- a structural impossibility that neither writing it nor reviewing it
caught. An audit of three targets found one wrong. The conclusion was that more audits beat more care, so
this makes an audit one command.

    python tools/branches.py 0x2a6b94 0x2a6bb0

IT DELIBERATELY HAS NO PASS/FAIL. `spanned.py` shipped with a verdict its measurement could not support and
had to have it removed; `claimed.py` needed three separate corrections to its summary layer while its
counts were right throughout. The lesson both taught: print what you measured and let the reader judge.

THE ENCODING THIS EXISTS FOR. A Bcc/BRA/BSR opcode's low byte IS the displacement when nonzero:

    64 0e         bcc.s   +$0E   -- self-contained, target = addr + 2 + $0E
    64 00 03 70   bcc.w   +$370  -- low byte 00 means the WORD form, target = addr + 2 + $0370
    64 ff ...     bcc.l          -- 68020+, does not occur in this cartridge

Reading a short branch as word invents a target thousands of bytes away, and it will look plausible:
$2A4612's real target is $2A4622, and misreading it gave $2A94CD.

*** IT SCANS EVERY 2-BYTE BOUNDARY, SO IT REPORTS FALSE BRANCHES INSIDE MULTI-WORD INSTRUCTIONS. ***

This is not fixable without a full decoder, and it showed up on the first real run: over $2A4606..$2A4620 it
reports `$2A460A bmi.s -$6C -> $2A45A0`, which is not an instruction at all -- $2A4606 is
`4eb9 002a 6b94` (jsr $2A6B94), and $2A460A lands on the `6b` of the operand.

So USE IT TO CHECK A TARGET YOU ALREADY HAVE, not to enumerate a routine's branches. Given an address you
believe holds a branch, it tells you the form and the arithmetic; given a span, some of its output is noise.
The same caveat applies to `rosetta.py dasm`, which has silently mis-aligned six times this session -- there
is no aligned-decode tool here, and pretending otherwise is how a phantom register cost four waves.
"""
import io
import sys
from pathlib import Path

IMG = Path(__file__).resolve().parent.parent / 'rip' / 'sound' / 'maincpu.bin'

# Bcc is 0110cccc. 0x60 BRA, 0x61 BSR, then the conditions.
CC = {
    0x60: 'bra', 0x61: 'bsr', 0x62: 'bhi', 0x63: 'bls', 0x64: 'bcc', 0x65: 'bcs',
    0x66: 'bne', 0x67: 'beq', 0x68: 'bvc', 0x69: 'bvs', 0x6a: 'bpl', 0x6b: 'bmi',
    0x6c: 'bge', 0x6d: 'blt', 0x6e: 'bgt', 0x6f: 'ble',
}


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    lo, hi = int(argv[0], 16), int(argv[1], 16)
    d = io.open(IMG, 'rb').read()
    print(f'branches in ${lo:06X}..${hi:06X}  (targets computed, NOT validated)')
    n = 0
    for a in range(lo, hi, 2):
        op = d[a]
        if op not in CC:
            continue
        disp = d[a + 1]
        if disp == 0:
            raw = int.from_bytes(d[a + 2:a + 4], 'big')
            off = raw - 0x10000 if raw >= 0x8000 else raw
            tgt, form, size = a + 2 + off, 'w', 4
        elif disp == 0xff:
            raw = int.from_bytes(d[a + 2:a + 6], 'big')
            off = raw - 0x100000000 if raw >= 0x80000000 else raw
            tgt, form, size = a + 2 + off, 'l', 6
        else:
            off = disp - 0x100 if disp > 0x7f else disp
            tgt, form, size = a + 2 + off, 's', 2
        inside = 'in span' if lo <= tgt < hi else ('BACK' if tgt < lo else 'FORWARD')
        print(f'  ${a:06X}  {CC[op]}.{form:1} {off:+#7x} -> ${tgt:06X}   {size} bytes, {inside}')
        n += 1
    print(f'{n} branch(es). A target outside the span is not an error -- it is how arms and tails work.')
    print('NOTE: this scans every 2-byte boundary, so entries landing inside a multi-word instruction are '
          'NOISE. Use it to check an address you already believe is a branch.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
