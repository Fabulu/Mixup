#!/usr/bin/env python3
"""Print a window of the bank-aware listing: tools/show.py BANK LO [HI]

Reads disasm/bank_XX.asm (produced by tools/banktrace.py --outdir disasm) and
echoes every line whose address falls in [LO,HI].  Labels/xref comments that
precede an in-range instruction are kept.
"""
import re
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    bank = int(sys.argv[1], 16)
    lo = int(sys.argv[2], 16)
    hi = int(sys.argv[3], 16) if len(sys.argv) > 3 else lo + 0x40
    # BATDIS env var selects the listing directory ('disasm' or 'disasm2').
    path = os.path.join(ROOT, os.environ.get('BATDIS', 'disasm'),
                        f'bank_{bank:02X}.asm')
    pend = []
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        m = re.match(r'^\s{4}([0-9A-F]{4}):', line)
        if m:
            a = int(m.group(1), 16)
            if lo <= a <= hi:
                for p in pend:
                    print(p)
                print(line)
            pend = []
        else:
            pend.append(line)
            if len(pend) > 4:
                pend.pop(0)


if __name__ == '__main__':
    main()
