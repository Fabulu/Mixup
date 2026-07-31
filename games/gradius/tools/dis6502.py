#!/usr/bin/env python3
"""dis6502.py -- minimal, dependency-free 6502 disassembler for a mapper-3 NES PRG.

Mapper 3 = CNROM: no PRG banking, the whole 32 KB sits at $8000-$FFFF forever, so
CPU address == 0x8000 + file offset into PRG.  That is why this can be a 100-line
tool instead of a bank tracker.

  python dis6502.py ROM  linear START [END]      -- straight-line disassembly
  python dis6502.py ROM  trace  ADDR [ADDR...]   -- recursive follow of flow
  python dis6502.py ROM  xref   ADDR             -- who references ADDR

Nothing is written to disk; output is ROM-derived, keep it out of git.
"""
import sys

# addressing modes: (name, length, formatter)
IMP, ACC, IMM, ZP, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, REL = range(13)
LEN = {IMP: 1, ACC: 1, IMM: 2, ZP: 2, ZPX: 2, ZPY: 2, ABS: 3, ABX: 3, ABY: 3,
       IND: 3, IZX: 2, IZY: 2, REL: 2}

T = {}
def _d(spec):
    for line in spec.strip().splitlines():
        parts = line.split()
        op = int(parts[0], 16)
        T[op] = (parts[1], globals()[parts[2]])

_d("""
00 BRK IMP
01 ORA IZX
05 ORA ZP
06 ASL ZP
08 PHP IMP
09 ORA IMM
0A ASL ACC
0D ORA ABS
0E ASL ABS
10 BPL REL
11 ORA IZY
15 ORA ZPX
16 ASL ZPX
18 CLC IMP
19 ORA ABY
1D ORA ABX
1E ASL ABX
20 JSR ABS
21 AND IZX
24 BIT ZP
25 AND ZP
26 ROL ZP
28 PLP IMP
29 AND IMM
2A ROL ACC
2C BIT ABS
2D AND ABS
2E ROL ABS
30 BMI REL
31 AND IZY
35 AND ZPX
36 ROL ZPX
38 SEC IMP
39 AND ABY
3D AND ABX
3E ROL ABX
40 RTI IMP
41 EOR IZX
45 EOR ZP
46 LSR ZP
48 PHA IMP
49 EOR IMM
4A LSR ACC
4C JMP ABS
4D EOR ABS
4E LSR ABS
50 BVC REL
51 EOR IZY
55 EOR ZPX
56 LSR ZPX
58 CLI IMP
59 EOR ABY
5D EOR ABX
5E LSR ABX
60 RTS IMP
61 ADC IZX
65 ADC ZP
66 ROR ZP
68 PLA IMP
69 ADC IMM
6A ROR ACC
6C JMP IND
6D ADC ABS
6E ROR ABS
70 BVS REL
71 ADC IZY
75 ADC ZPX
76 ROR ZPX
78 SEI IMP
79 ADC ABY
7D ADC ABX
7E ROR ABX
81 STA IZX
84 STY ZP
85 STA ZP
86 STX ZP
88 DEY IMP
8A TXA IMP
8C STY ABS
8D STA ABS
8E STX ABS
90 BCC REL
91 STA IZY
94 STY ZPX
95 STA ZPX
96 STX ZPY
98 TYA IMP
99 STA ABY
9A TXS IMP
9D STA ABX
A0 LDY IMM
A1 LDA IZX
A2 LDX IMM
A4 LDY ZP
A5 LDA ZP
A6 LDX ZP
A8 TAY IMP
A9 LDA IMM
AA TAX IMP
AC LDY ABS
AD LDA ABS
AE LDX ABS
B0 BCS REL
B1 LDA IZY
B4 LDY ZPX
B5 LDA ZPX
B6 LDX ZPY
B8 CLV IMP
B9 LDA ABY
BA TSX IMP
BC LDY ABX
BD LDA ABX
BE LDX ABY
C0 CPY IMM
C1 CMP IZX
C4 CPY ZP
C5 CMP ZP
C6 DEC ZP
C8 INY IMP
C9 CMP IMM
CA DEX IMP
CC CPY ABS
CD CMP ABS
CE DEC ABS
D0 BNE REL
D1 CMP IZY
D5 CMP ZPX
D6 DEC ZPX
D8 CLD IMP
D9 CMP ABY
DD CMP ABX
DE DEC ABX
E0 CPX IMM
E1 SBC IZX
E4 CPX ZP
E5 SBC ZP
E6 INC ZP
E8 INX IMP
E9 SBC IMM
EA NOP IMP
EC CPX ABS
ED SBC ABS
EE INC ABS
F0 BEQ REL
F1 SBC IZY
F5 SBC ZPX
F6 SBC ZPX
F6 INC ZPX
F8 SED IMP
F9 SBC ABY
FD SBC ABX
FE INC ABX
""")

BRANCH = {"BPL", "BMI", "BVC", "BVS", "BCC", "BCS", "BNE", "BEQ"}
STOP = {"RTS", "RTI", "JMP", "BRK"}

REGNAME = {0x2000: "PPUCTRL", 0x2001: "PPUMASK", 0x2002: "PPUSTATUS", 0x2003: "OAMADDR",
           0x2004: "OAMDATA", 0x2005: "PPUSCROLL", 0x2006: "PPUADDR", 0x2007: "PPUDATA",
           0x4014: "OAMDMA", 0x4016: "JOY1", 0x4017: "JOY2"}


class Rom:
    def __init__(self, path):
        raw = open(path, "rb").read()
        n = raw[4] * 0x4000
        self.prg = raw[16:16 + n]
        self.base = 0x10000 - n  # 32 KB -> $8000

    def b(self, a):
        return self.prg[a - self.base]

    def w(self, a):
        return self.b(a) | (self.b(a + 1) << 8)


def decode(rom, pc):
    op = rom.b(pc)
    if op not in T:
        return ("???", IMP, 1, None, f".byte ${op:02X}")
    mn, mode = T[op]
    ln = LEN[mode]
    arg = None
    if mode == IMM:
        arg = rom.b(pc + 1); txt = f"#${arg:02X}"
    elif mode in (ZP, ZPX, ZPY):
        arg = rom.b(pc + 1)
        txt = f"${arg:02X}" + {ZP: "", ZPX: ",X", ZPY: ",Y"}[mode]
    elif mode in (ABS, ABX, ABY, IND):
        arg = rom.w(pc + 1)
        s = REGNAME.get(arg, "")
        txt = ("(" if mode == IND else "") + f"${arg:04X}" + (")" if mode == IND else "")
        txt += {ABS: "", ABX: ",X", ABY: ",Y", IND: ""}[mode]
        if s:
            txt += f"   ; {s}"
    elif mode in (IZX, IZY):
        arg = rom.b(pc + 1)
        txt = f"(${arg:02X}" + (",X)" if mode == IZX else "),Y")
    elif mode == REL:
        d = rom.b(pc + 1)
        arg = (pc + 2 + (d - 256 if d > 127 else d)) & 0xFFFF
        txt = f"${arg:04X}"
    else:
        txt = "A" if mode == ACC else ""
    return (mn, mode, ln, arg, txt)


def line(rom, pc):
    mn, mode, ln, arg, txt = decode(rom, pc)
    raw = " ".join(f"{rom.b(pc + i):02X}" for i in range(ln))
    return f"{pc:04X}  {raw:<9s} {mn} {txt}", ln, mn, mode, arg


def linear(rom, start, end):
    pc = start
    while pc < end:
        s, ln, *_ = line(rom, pc)
        print(s)
        pc += ln


def trace(rom, seeds, limit=8000):
    seen = set()
    out = {}
    work = list(seeds)
    calls = set()
    while work:
        pc = work.pop()
        while True:
            if pc in seen or not (rom.base <= pc < 0x10000):
                break
            seen.add(pc)
            s, ln, mn, mode, arg = line(rom, pc)
            out[pc] = s
            if mn in BRANCH:
                work.append(arg)
            elif mn == "JSR":
                calls.add(arg); work.append(arg)
            elif mn == "JMP" and mode == ABS:
                work.append(arg); break
            elif mn in STOP or mn == "???":
                break
            pc += ln
            if len(seen) > limit:
                break
    for pc in sorted(out):
        pre = "\n" if pc in calls else ""
        print(pre + out[pc])


def xref(rom, target):
    for off in range(len(rom.prg)):
        pc = rom.base + off
        try:
            mn, mode, ln, arg, txt = decode(rom, pc)
        except IndexError:
            continue
        if arg == target and mode in (ABS, ABX, ABY, IND, REL):
            s, *_ = line(rom, pc)
            print(s)


if __name__ == "__main__":
    rom = Rom(sys.argv[1])
    cmd = sys.argv[2]
    if cmd == "linear":
        linear(rom, int(sys.argv[3], 16), int(sys.argv[4], 16) if len(sys.argv) > 4 else int(sys.argv[3], 16) + 0x40)
    elif cmd == "trace":
        trace(rom, [int(a, 16) for a in sys.argv[3:]])
    elif cmd == "xref":
        xref(rom, int(sys.argv[3], 16))
