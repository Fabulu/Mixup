# Minimal Z80 disassembler covering the opcodes DOJ's compiler emits.
# Usage: python z80dis.py <starthex> <lengthhex>
import sys

REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
REG8_DD = ['B', 'C', 'D', 'E', 'IXh', 'IXl', '(HL)', 'A']
RP = ['BC', 'DE', 'HL', 'SP']
RP2 = ['BC', 'DE', 'HL', 'AF']
CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']


def disasm(b, start, end):
    i = start
    out = []
    while i < end:
        addr = i
        prefix = None
        op = b[i]
        dd = False
        if op in (0xDD, 0xFD):
            dd = True
            prefix = op
            i += 1
            op = b[i]
        reg8 = REG8_DD if dd else REG8
        s = ''
        nxt = b[i + 1] if i + 1 < len(b) else 0
        nxt2 = b[i + 2] if i + 2 < len(b) else 0

        def r8(idx):
            if dd and idx == 6:
                d = b[i + 2] if i + 2 < len(b) else 0
                disp = d if d < 128 else d - 256
                return '(IX%+d)' % disp
            return reg8[idx]

        try:
            if op == 0xCB:
                if dd:
                    disp = nxt if nxt < 128 else nxt - 256
                    bitop = b[i + 2]
                    i += 3
                    s = 'CB (IX%+d) $%02X' % (disp, bitop)
                else:
                    bitop = nxt
                    i += 2
                    s = 'CB $%02X' % bitop
            elif op == 0xED:
                eop = nxt
                x = (eop >> 6) & 3
                y = (eop >> 3) & 7
                z = eop & 7
                addr16 = nxt | (nxt2 << 8)
                if x == 1:
                    rp = RP2[y]
                    if z == 0:
                        s = 'IN %s,(C)' % rp
                    elif z == 1:
                        s = 'OUT (C),%s' % rp[0]
                    else:
                        s = 'ED $%02X' % eop
                    i += 2
                elif x == 2:
                    cc = CC[y]
                    if eop == 0x44 or eop == 0x4C or eop == 0x54 or eop == 0x5C or eop == 0x64 or eop == 0x6C or eop == 0x74 or eop == 0x7C:
                        s = 'NEG'
                    elif eop == 0x4D:
                        s = 'RETI'
                    elif eop == 0x45:
                        s = 'RETN'
                    elif z == 0:
                        s = 'RET %s' % cc
                    else:
                        s = 'ED $%02X' % eop
                    i += 2
                elif x == 3:
                    if y == 0:
                        s = 'LD (%04X),%s' % (addr16, RP[z])
                        i += 4
                    elif y == 2:
                        s = 'LD %s,(%04X)' % (RP[z], addr16)
                        i += 4
                    elif y == 4:
                        s = 'NEG'
                        i += 2
                    elif y == 5:
                        s = 'RETN' if eop == 0x45 else 'RETI'
                        i += 2
                    elif y == 6:
                        s = 'IM %d' % (z & 3)
                        i += 2
                    else:
                        s = 'ED $%02X' % eop
                        i += 2
                elif x == 0:
                    if z == 4:
                        s = {0: 'LDI', 1: 'CPI', 2: 'INI', 3: 'OUTI'}.get(y, 'ED $%02X' % eop)
                    elif z == 0:
                        s = {0: 'LDI', 1: 'CPI', 2: 'INI', 3: 'OUTI'}.get(y, 'ED $%02X' % eop)
                    elif z == 8:
                        s = {0: 'LDD', 1: 'CPD', 2: 'IND', 3: 'OUTD'}.get(y, 'ED $%02X' % eop)
                    else:
                        s = 'ED $%02X' % eop
                    i += 2
                else:
                    s = 'ED $%02X' % eop
                    i += 2
            elif op == 0x00:
                s = 'NOP'; i += 1
            elif op == 0x08:
                s = 'EX AF,AF\''; i += 1
            elif op == 0x10:
                s = 'DJNZ $%02X' % nxt; i += 2
            elif op == 0x18:
                s = 'JR $%02X' % nxt; i += 2
            elif op in (0x20, 0x28, 0x30, 0x38):
                cc = CC[(op >> 3) & 3]; s = 'JR %s,$%02X' % (cc, nxt); i += 2
            elif op == 0x02:
                s = 'LD (BC),A'; i += 1
            elif op == 0x12:
                s = 'LD (DE),A'; i += 1
            elif op == 0x0A:
                s = 'LD A,(BC)'; i += 1
            elif op == 0x1A:
                s = 'LD A,(DE)'; i += 1
            elif op == 0x22:
                addr16 = nxt | (nxt2 << 8); s = 'LD ($%04X),HL' % addr16; i += 3
            elif op == 0x2A:
                addr16 = nxt | (nxt2 << 8); s = 'LD HL,($%04X)' % addr16; i += 3
            elif op == 0x32:
                addr16 = nxt | (nxt2 << 8); s = 'LD ($%04X),A' % addr16; i += 3
            elif op == 0x3A:
                addr16 = nxt | (nxt2 << 8); s = 'LD A,($%04X)' % addr16; i += 3
            elif op in (0x01, 0x11, 0x21, 0x31):
                rp = RP[(op >> 4) & 3]; val = nxt | (nxt2 << 8); s = 'LD %s,$%04X' % (rp, val); i += 3
            elif op in (0x09, 0x19, 0x29, 0x39):
                rp = RP[(op >> 4) & 3]; s = 'ADD HL,%s' % rp; i += 1
            elif op == 0xE3:
                s = 'EX (SP),HL'; i += 1
            elif op == 0xEB:
                s = 'EX DE,HL'; i += 1
            elif op == 0xD9:
                s = 'EXX'; i += 1
            elif op == 0xE9:
                s = 'JP (HL)'; i += 1
            elif op == 0xF9:
                s = 'LD SP,HL'; i += 1
            elif op == 0xC9:
                s = 'RET'; i += 1
            elif op in (0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8):
                cc = CC[(op >> 3) & 3]; s = 'RET %s' % cc; i += 1
            elif op == 0xC3:
                addr16 = nxt | (nxt2 << 8); s = 'JP $%04X' % addr16; i += 3
            elif op in (0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA):
                cc = CC[(op >> 3) & 3]; addr16 = nxt | (nxt2 << 8); s = 'JP %s,$%04X' % (cc, addr16); i += 3
            elif op in (0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC):
                cc = CC[(op >> 3) & 3]; addr16 = nxt | (nxt2 << 8); s = 'CALL %s,$%04X' % (cc, addr16); i += 3
            elif op == 0xCD:
                addr16 = nxt | (nxt2 << 8); s = 'CALL $%04X' % addr16; i += 3
            elif op == 0xE8:
                s = 'ADD SP,$%02X' % nxt; i += 2
            elif op == 0xF8:
                s = 'LD HL,SP$%02X' % nxt; i += 2
            elif op == 0xDB:
                s = 'IN A,($%02X)' % nxt; i += 2
            elif op == 0xD3:
                s = 'OUT ($%02X),A' % nxt; i += 2
            elif op in (0xC5, 0xD5, 0xE5, 0xF5):
                rp = RP2[(op >> 4) & 3]; s = 'PUSH %s' % rp; i += 1
            elif op in (0xC1, 0xD1, 0xE1, 0xF1):
                rp = RP2[(op >> 4) & 3]; s = 'POP %s' % rp; i += 1
            elif op == 0xC6:
                s = 'ADD A,$%02X' % nxt; i += 2
            elif op == 0xCE:
                s = 'ADC A,$%02X' % nxt; i += 2
            elif op == 0xD6:
                s = 'SUB $%02X' % nxt; i += 2
            elif op == 0xDE:
                s = 'SBC A,$%02X' % nxt; i += 2
            elif op == 0xE6:
                s = 'AND $%02X' % nxt; i += 2
            elif op == 0xEE:
                s = 'XOR $%02X' % nxt; i += 2
            elif op == 0xF6:
                s = 'OR $%02X' % nxt; i += 2
            elif op == 0xFE:
                s = 'CP $%02X' % nxt; i += 2
            elif op == 0x27:
                s = 'DAA'; i += 1
            elif op == 0x2F:
                s = 'CPL'; i += 1
            elif op == 0x3F:
                s = 'CCF'; i += 1
            elif op == 0x07:
                s = 'RLCA'; i += 1
            elif op == 0x0F:
                s = 'RRCA'; i += 1
            elif op == 0x17:
                s = 'RLA'; i += 1
            elif op == 0x1F:
                s = 'RRA'; i += 1
            elif op == 0xC7:
                s = 'RST $00'; i += 1
            elif op == 0xD7:
                s = 'RST $10'; i += 1
            elif op == 0xCF:
                s = 'RST $08'; i += 1
            elif op == 0xDF:
                s = 'RST $18'; i += 1
            elif op == 0xE7:
                s = 'RST $20'; i += 1
            elif op == 0xEF:
                s = 'RST $28'; i += 1
            elif op == 0xF7:
                s = 'RST $30'; i += 1
            elif op == 0xFF:
                s = 'RST $38'; i += 1
            elif op in (0x03, 0x13, 0x23, 0x33):
                rp = RP[(op >> 4) & 3]
                s = ('INC IX' if (dd and rp == 'HL') else ('INC ' + rp))
                i += 1
            elif op in (0x0B, 0x1B, 0x2B, 0x3B):
                rp = RP[(op >> 4) & 3]
                s = ('DEC IX' if (dd and rp == 'HL') else ('DEC ' + rp))
                i += 1
            elif (op & 0xC7) == 0x04:
                # INC r: 0x04,0x0C,0x14,0x1C,0x24,0x2C,0x34,0x3C
                idx = (op >> 3) & 7
                s = 'INC ' + r8(idx)
                i += 2 if (dd and idx == 6) else 1
            elif (op & 0xC7) == 0x05:
                # DEC r
                idx = (op >> 3) & 7
                s = 'DEC ' + r8(idx)
                i += 2 if (dd and idx == 6) else 1
            elif (op & 0xC7) == 0x06:
                # LD r,n
                idx = (op >> 3) & 7
                if dd and idx == 6:
                    d = nxt
                    disp = d if d < 128 else d - 256
                    s = 'LD (IX%+d),$%02X' % (disp, nxt2)
                    i += 3
                else:
                    name = REG8_DD[idx] if (dd and idx in (4, 5)) else REG8[idx]
                    s = 'LD %s,$%02X' % (name, nxt)
                    i += 2
            elif op == 0x36:
                if dd:
                    d = nxt
                    disp = d if d < 128 else d - 256
                    s = 'LD (IX%+d),$%02X' % (disp, nxt2)
                    i += 3
                else:
                    s = 'LD (HL),$%02X' % nxt
                    i += 2
            elif op == 0x37:
                s = 'SCF'; i += 1
            elif op == 0xF3:
                s = 'DI'; i += 1
            elif op == 0xFB:
                s = 'EI'; i += 1
            elif op == 0x76:
                s = 'HALT'; i += 1
            elif (op & 0xC0) == 0x40 and op != 0x76:
                dst = (op >> 3) & 7
                src = op & 7
                if dd and (dst == 6 or src == 6):
                    # LD r,(IX+d) or LD (IX+d),r: opcode + disp byte.
                    # The (HL)/(IX+d) operand becomes (IX+d); the OTHER register
                    # uses the plain REG8 set (H/L NOT replaced in this form).
                    d = nxt
                    disp = d if d < 128 else d - 256
                    ix = '(IX%+d)' % disp
                    ds = ix if dst == 6 else REG8[dst]
                    ss = ix if src == 6 else REG8[src]
                    s = 'LD %s,%s' % (ds, ss)
                    i += 2
                elif dd and (dst in (4, 5) or src in (4, 5)):
                    # LD IXh/IXl,r or LD r,IXh/IXl (no disp byte).
                    s = 'LD %s,%s' % (REG8_DD[dst], REG8_DD[src])
                    i += 1
                else:
                    s = 'LD %s,%s' % (REG8[dst], REG8[src])
                    i += 1
            elif (op & 0xC0) == 0x80:
                alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP']
                idx = op & 7
                s = alu[(op >> 3) & 7] + r8(idx)
                # DD-prefixed ALU on (IX+d) consumes the displacement byte.
                i += 2 if (dd and idx == 6) else 1
            else:
                s = '.db $%02X' % op; i += 1
        except Exception as ex:
            s = '?? $%02X (%s)' % (op, ex); i += 1
        pfx = ('%02X ' % prefix) if prefix else ''
        out.append('$%04X: %s%s' % (addr, pfx, s))
    return out


if __name__ == '__main__':
    b = open('rip/sound/z80ram.bin', 'rb').read()
    start = int(sys.argv[1], 16) if len(sys.argv) > 1 else 0x376C
    length = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x400
    for line in disasm(b, start, start + length):
        print(line)
