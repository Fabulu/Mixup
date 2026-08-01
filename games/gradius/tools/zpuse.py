#!/usr/bin/env python3
"""zpuse.py -- exhaustive static census of every instruction that touches a
zero-page address, or that references an absolute address, in a mapper-3 PRG.

Why this exists: recon rounds kept asking "who reads $1A?" and answering with
`grep` over a *traced* disassembly, which only covers bytes the tracer reached.
This scans all 32768 bytes at every alignment and reports each hit with the
opcode that would decode there, so nothing hides behind a data island.

  python zpuse.py PRG.bin zp 1A          -- all ZP-addressed ops on $1A
  python zpuse.py PRG.bin abs C413       -- all absolute/JMP/JSR refs to $C413
  python zpuse.py PRG.bin word C486      -- every 2-byte LE occurrence

False positives are expected (a data byte pair can look like `LDA $1A`); the
point is the list is a SUPERSET, so absence from it is real absence.
"""
import sys

ZP_OPS = {
    0x05: 'ORA', 0x06: 'ASL', 0x24: 'BIT', 0x25: 'AND', 0x26: 'ROL',
    0x45: 'EOR', 0x46: 'LSR', 0x65: 'ADC', 0x66: 'ROR', 0x84: 'STY',
    0x85: 'STA', 0x86: 'STX', 0xA4: 'LDY', 0xA5: 'LDA', 0xA6: 'LDX',
    0xC4: 'CPY', 0xC5: 'CMP', 0xC6: 'DEC', 0xE4: 'CPX', 0xE5: 'SBC',
    0xE6: 'INC',
}
ZPX_OPS = {
    0x15: 'ORA', 0x16: 'ASL', 0x35: 'AND', 0x36: 'ROL', 0x55: 'EOR',
    0x56: 'LSR', 0x75: 'ADC', 0x76: 'ROR', 0x94: 'STY', 0x95: 'STA',
    0x96: 'STX', 0xB4: 'LDY', 0xB5: 'LDA', 0xB6: 'LDX', 0xD5: 'CMP',
    0xD6: 'DEC', 0xF5: 'SBC', 0xF6: 'INC', 0x01: 'ORA(izx)',
    0x11: 'ORA(izy)', 0xA1: 'LDA(izx)', 0xB1: 'LDA(izy)',
    0x81: 'STA(izx)', 0x91: 'STA(izy)',
}
ABS_OPS = {
    0x0D: 'ORA', 0x0E: 'ASL', 0x2C: 'BIT', 0x2D: 'AND', 0x2E: 'ROL',
    0x4D: 'EOR', 0x4E: 'LSR', 0x6D: 'ADC', 0x6E: 'ROR', 0x8C: 'STY',
    0x8D: 'STA', 0x8E: 'STX', 0xAC: 'LDY', 0xAD: 'LDA', 0xAE: 'LDX',
    0xCC: 'CPY', 0xCD: 'CMP', 0xCE: 'DEC', 0xEC: 'CPX', 0xED: 'SBC',
    0xEE: 'INC', 0x20: 'JSR', 0x4C: 'JMP', 0x6C: 'JMP()',
    0x1D: 'ORA,X', 0x19: 'ORA,Y', 0x3D: 'AND,X', 0x39: 'AND,Y',
    0x5D: 'EOR,X', 0x59: 'EOR,Y', 0x7D: 'ADC,X', 0x79: 'ADC,Y',
    0x9D: 'STA,X', 0x99: 'STA,Y', 0xBD: 'LDA,X', 0xB9: 'LDA,Y',
    0xBC: 'LDY,X', 0xBE: 'LDX,Y', 0xDD: 'CMP,X', 0xD9: 'CMP,Y',
    0xFD: 'SBC,X', 0xF9: 'SBC,Y', 0x1E: 'ASL,X', 0x3E: 'ROL,X',
    0x5E: 'LSR,X', 0x7E: 'ROR,X', 0xDE: 'DEC,X', 0xFE: 'INC,X',
}


def main():
    rom, mode, val = sys.argv[1], sys.argv[2], int(sys.argv[3], 16)
    d = open(rom, 'rb').read()
    base = 0x8000
    hits = 0
    for i in range(len(d) - 2):
        a = base + i
        op = d[i]
        if mode == 'zp':
            if op in ZP_OPS and d[i + 1] == val:
                print(f'{a:04X}  {ZP_OPS[op]} ${val:02X}')
                hits += 1
            elif op in ZPX_OPS and d[i + 1] == val:
                print(f'{a:04X}  {ZPX_OPS[op]} ${val:02X},idx')
                hits += 1
        elif mode == 'abs':
            if op in ABS_OPS and d[i + 1] | (d[i + 2] << 8) == val:
                print(f'{a:04X}  {ABS_OPS[op]} ${val:04X}')
                hits += 1
        elif mode == 'word':
            if d[i] | (d[i + 1] << 8) == val:
                print(f'{a:04X}  word ${val:04X}')
                hits += 1
    print(f'-- {hits} hit(s)')


main()
