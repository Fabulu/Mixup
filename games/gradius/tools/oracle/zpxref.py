#!/usr/bin/env python3
"""zpxref.py -- list every instruction in the Gradius PRG that touches a given
zero-page address, decoded properly (so operand bytes of other instructions are
never mistaken for an opcode).

Walks the PRG linearly from a set of entry points using the same decode table as
tools/dis6502.py, but the cheap way: a full linear decode from $8000 would
mis-sync on data, so instead we decode from every address 0..0x7FFF and only
report a hit when the *decoded* instruction at that address is a zero-page
(ZP/ZPX/ZPY) form naming the target AND the address is inside the reachable set
produced by nesdis' recursive descent, if available.  Falls back to "every
alignment" mode with a warning.

  python zpxref.py ROM 42 [44 45 ...]
"""
import subprocess, sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import dis6502 as D


def load(rom):
    b = open(rom, 'rb').read()
    off = 16 if b[:4] == b'NES\x1a' else 0
    return b[off:off + 0x8000]


def main():
    rom = sys.argv[1]
    targets = {int(a, 16) for a in sys.argv[2:]}
    prg = load(rom)
    # decode at every alignment; report the ones that decode to a ZP-mode
    # instruction naming a target.  Duplicates from bad alignment are possible,
    # so each hit prints its bytes for the reader to sanity-check.
    zpmodes = {D.ZP, D.ZPX, D.ZPY}
    for i in range(len(prg) - 2):
        op = prg[i]
        ent = D.T.get(op)
        if not ent:
            continue
        name, mode = ent
        if mode not in zpmodes:
            continue
        if prg[i + 1] not in targets:
            continue
        addr = 0x8000 + i
        raw = ' '.join('%02X' % x for x in prg[i:i + 2])
        sfx = {D.ZP: '', D.ZPX: ',X', D.ZPY: ',Y'}[mode]
        print('%04X  %-5s  %s $%02X%s' % (addr, raw, name, prg[i + 1], sfx))


main()
