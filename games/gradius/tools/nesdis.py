#!/usr/bin/env python3
"""nesdis - table-driven 6502 disassembler + recursive-descent tracer for NROM/CNROM.

Written for Gradius (USA), mapper 3 (CNROM): PRG is 32 KB permanently mapped at
$8000-$FFFF, so an address is an address and there is no bank context to carry.
That is the whole reason this is ~400 lines rather than banktrace.py's 336 plus
gbdis.py's 500.

What it does that a linear disassembler (capstone, da65 without a config) cannot:
  * recursive-descent from the three vectors, so code and data are separated by
    reachability rather than by guessing;
  * xref lists per label, so "who calls this" is answerable;
  * hardware-register annotation ($2000-$2007, $4000-$401F) inline;
  * CNROM bank-write detection: any store into $8000-$FFFF is the mapper latch;
  * a --selftest mode that cross-checks every decoded instruction against
    capstone's independent MOS65XX decoder (docs/knowledge/03: two sides of a
    comparison must be independently derived).

Usage:
    python nesdis.py "Gradius (USA).nes" --coverage
    python nesdis.py "Gradius (USA).nes" --out rip/prg.asm
    python nesdis.py "Gradius (USA).nes" --entry 8A51 --entry 8281
    python nesdis.py "Gradius (USA).nes" --regs
    python nesdis.py "Gradius (USA).nes" --selftest
"""
import argparse
import os
import sys
from collections import defaultdict

# ---------------------------------------------------------------- addressing
# name, operand byte count (excluding opcode), format
IMP, ACC, IMM, ZP, ZPX, ZPY, IZX, IZY, ABS, ABX, ABY, IND, REL = range(13)
SIZE = {IMP: 0, ACC: 0, IMM: 1, ZP: 1, ZPX: 1, ZPY: 1, IZX: 1, IZY: 1,
        ABS: 2, ABX: 2, ABY: 2, IND: 2, REL: 1}

# flow classes
FLOW_NEXT, FLOW_BRANCH, FLOW_JMP, FLOW_JSR, FLOW_RET, FLOW_JMPI, FLOW_ILL = \
    'next', 'branch', 'jmp', 'jsr', 'ret', 'jmpi', 'ill'

OPS = {}


def _o(code, mn, mode, flow=FLOW_NEXT, illegal=False):
    OPS[code] = (mn, mode, flow, illegal)


# --- official set, 151 opcodes -------------------------------------------
for code, mn, mode in [
    (0x00, 'BRK', IMM), (0x40, 'RTI', IMP), (0x60, 'RTS', IMP),
    (0x4C, 'JMP', ABS), (0x6C, 'JMP', IND), (0x20, 'JSR', ABS),
    (0x10, 'BPL', REL), (0x30, 'BMI', REL), (0x50, 'BVC', REL),
    (0x70, 'BVS', REL), (0x90, 'BCC', REL), (0xB0, 'BCS', REL),
    (0xD0, 'BNE', REL), (0xF0, 'BEQ', REL),
    (0x08, 'PHP', IMP), (0x28, 'PLP', IMP), (0x48, 'PHA', IMP),
    (0x68, 'PLA', IMP), (0x18, 'CLC', IMP), (0x38, 'SEC', IMP),
    (0x58, 'CLI', IMP), (0x78, 'SEI', IMP), (0xB8, 'CLV', IMP),
    (0xD8, 'CLD', IMP), (0xF8, 'SED', IMP), (0xEA, 'NOP', IMP),
    (0xAA, 'TAX', IMP), (0x8A, 'TXA', IMP), (0xA8, 'TAY', IMP),
    (0x98, 'TYA', IMP), (0xBA, 'TSX', IMP), (0x9A, 'TXS', IMP),
    (0xCA, 'DEX', IMP), (0xE8, 'INX', IMP), (0x88, 'DEY', IMP),
    (0xC8, 'INY', IMP),
    (0x24, 'BIT', ZP), (0x2C, 'BIT', ABS),
]:
    flow = {'RTI': FLOW_RET, 'RTS': FLOW_RET, 'BRK': FLOW_RET}.get(mn, FLOW_NEXT)
    if mn == 'JMP':
        flow = FLOW_JMP if mode == ABS else FLOW_JMPI
    elif mn == 'JSR':
        flow = FLOW_JSR
    elif mn[0] == 'B' and mode == REL:
        flow = FLOW_BRANCH
    _o(code, mn, mode, flow)

# ALU group: ORA AND EOR ADC STA LDA CMP SBC  (aaa bbb 01)
_ALU = ['ORA', 'AND', 'EOR', 'ADC', 'STA', 'LDA', 'CMP', 'SBC']
_ALU_MODES = [IZX, ZP, IMM, ABS, IZY, ZPX, ABY, ABX]
for a, mn in enumerate(_ALU):
    for b, mode in enumerate(_ALU_MODES):
        if mn == 'STA' and mode == IMM:
            continue                      # $89 is an illegal NOP #imm
        _o((a << 5) | (b << 2) | 0x01, mn, mode)

# shift group (aaa bbb 10)
for code, mn, mode in [
    (0x0A, 'ASL', ACC), (0x06, 'ASL', ZP), (0x16, 'ASL', ZPX),
    (0x0E, 'ASL', ABS), (0x1E, 'ASL', ABX),
    (0x2A, 'ROL', ACC), (0x26, 'ROL', ZP), (0x36, 'ROL', ZPX),
    (0x2E, 'ROL', ABS), (0x3E, 'ROL', ABX),
    (0x4A, 'LSR', ACC), (0x46, 'LSR', ZP), (0x56, 'LSR', ZPX),
    (0x4E, 'LSR', ABS), (0x5E, 'LSR', ABX),
    (0x6A, 'ROR', ACC), (0x66, 'ROR', ZP), (0x76, 'ROR', ZPX),
    (0x6E, 'ROR', ABS), (0x7E, 'ROR', ABX),
    (0x86, 'STX', ZP), (0x96, 'STX', ZPY), (0x8E, 'STX', ABS),
    (0xA2, 'LDX', IMM), (0xA6, 'LDX', ZP), (0xB6, 'LDX', ZPY),
    (0xAE, 'LDX', ABS), (0xBE, 'LDX', ABY),
    (0xC6, 'DEC', ZP), (0xD6, 'DEC', ZPX), (0xCE, 'DEC', ABS),
    (0xDE, 'DEC', ABX),
    (0xE6, 'INC', ZP), (0xF6, 'INC', ZPX), (0xEE, 'INC', ABS),
    (0xFE, 'INC', ABX),
    (0x84, 'STY', ZP), (0x94, 'STY', ZPX), (0x8C, 'STY', ABS),
    (0xA0, 'LDY', IMM), (0xA4, 'LDY', ZP), (0xB4, 'LDY', ZPX),
    (0xAC, 'LDY', ABS), (0xBC, 'LDY', ABX),
    (0xC0, 'CPY', IMM), (0xC4, 'CPY', ZP), (0xCC, 'CPY', ABS),
    (0xE0, 'CPX', IMM), (0xE4, 'CPX', ZP), (0xEC, 'CPX', ABS),
]:
    _o(code, mn, mode)

# --- undocumented opcodes -------------------------------------------------
# Present so the tracer does not silently mis-length an instruction if it walks
# into one.  Marked illegal=True; the tracer stops there by default because in
# practice reaching one means the trace has fallen into data.
for code, mn, mode in [
    (0x1A, 'NOP', IMP), (0x3A, 'NOP', IMP), (0x5A, 'NOP', IMP),
    (0x7A, 'NOP', IMP), (0xDA, 'NOP', IMP), (0xFA, 'NOP', IMP),
    (0x80, 'NOP', IMM), (0x82, 'NOP', IMM), (0x89, 'NOP', IMM),
    (0xC2, 'NOP', IMM), (0xE2, 'NOP', IMM),
    (0x04, 'NOP', ZP), (0x44, 'NOP', ZP), (0x64, 'NOP', ZP),
    (0x14, 'NOP', ZPX), (0x34, 'NOP', ZPX), (0x54, 'NOP', ZPX),
    (0x74, 'NOP', ZPX), (0xD4, 'NOP', ZPX), (0xF4, 'NOP', ZPX),
    (0x0C, 'NOP', ABS),
    (0x1C, 'NOP', ABX), (0x3C, 'NOP', ABX), (0x5C, 'NOP', ABX),
    (0x7C, 'NOP', ABX), (0xDC, 'NOP', ABX), (0xFC, 'NOP', ABX),
    (0xA7, 'LAX', ZP), (0xB7, 'LAX', ZPY), (0xAF, 'LAX', ABS),
    (0xBF, 'LAX', ABY), (0xA3, 'LAX', IZX), (0xB3, 'LAX', IZY),
    (0x87, 'SAX', ZP), (0x97, 'SAX', ZPY), (0x8F, 'SAX', ABS),
    (0x83, 'SAX', IZX),
    (0xEB, 'SBC', IMM),
    (0xC7, 'DCP', ZP), (0xD7, 'DCP', ZPX), (0xCF, 'DCP', ABS),
    (0xDF, 'DCP', ABX), (0xDB, 'DCP', ABY), (0xC3, 'DCP', IZX),
    (0xD3, 'DCP', IZY),
    (0xE7, 'ISC', ZP), (0xF7, 'ISC', ZPX), (0xEF, 'ISC', ABS),
    (0xFF, 'ISC', ABX), (0xFB, 'ISC', ABY), (0xE3, 'ISC', IZX),
    (0xF3, 'ISC', IZY),
    (0x27, 'RLA', ZP), (0x37, 'RLA', ZPX), (0x2F, 'RLA', ABS),
    (0x3F, 'RLA', ABX), (0x3B, 'RLA', ABY), (0x23, 'RLA', IZX),
    (0x33, 'RLA', IZY),
    (0x67, 'RRA', ZP), (0x77, 'RRA', ZPX), (0x6F, 'RRA', ABS),
    (0x7F, 'RRA', ABX), (0x7B, 'RRA', ABY), (0x63, 'RRA', IZX),
    (0x73, 'RRA', IZY),
    (0x07, 'SLO', ZP), (0x17, 'SLO', ZPX), (0x0F, 'SLO', ABS),
    (0x1F, 'SLO', ABX), (0x1B, 'SLO', ABY), (0x03, 'SLO', IZX),
    (0x13, 'SLO', IZY),
    (0x47, 'SRE', ZP), (0x57, 'SRE', ZPX), (0x4F, 'SRE', ABS),
    (0x5F, 'SRE', ABX), (0x5B, 'SRE', ABY), (0x43, 'SRE', IZX),
    (0x53, 'SRE', IZY),
    (0x0B, 'ANC', IMM), (0x2B, 'ANC', IMM), (0x4B, 'ALR', IMM),
    (0x6B, 'ARR', IMM), (0xAB, 'LXA', IMM), (0xCB, 'SBX', IMM),
    (0x9C, 'SHY', ABX), (0x9E, 'SHX', ABY), (0x9B, 'TAS', ABY),
    (0xBB, 'LAS', ABY), (0x93, 'SHA', IZY), (0x9F, 'SHA', ABY),
    (0x8B, 'ANE', IMM),
]:
    _o(code, mn, mode, FLOW_NEXT, illegal=True)

for code in (0x02, 0x12, 0x22, 0x32, 0x42, 0x52, 0x62, 0x72,
             0x92, 0xB2, 0xD2, 0xF2):
    _o(code, 'JAM', IMP, FLOW_ILL, illegal=True)

assert len(OPS) == 256, f'opcode table has {len(OPS)} entries, want 256'

# ---------------------------------------------------------------- registers
PPU_REGS = {
    0x2000: 'PPUCTRL', 0x2001: 'PPUMASK', 0x2002: 'PPUSTATUS',
    0x2003: 'OAMADDR', 0x2004: 'OAMDATA', 0x2005: 'PPUSCROLL',
    0x2006: 'PPUADDR', 0x2007: 'PPUDATA',
}
APU_REGS = {
    0x4000: 'SQ1_VOL', 0x4001: 'SQ1_SWEEP', 0x4002: 'SQ1_LO', 0x4003: 'SQ1_HI',
    0x4004: 'SQ2_VOL', 0x4005: 'SQ2_SWEEP', 0x4006: 'SQ2_LO', 0x4007: 'SQ2_HI',
    0x4008: 'TRI_LINEAR', 0x400A: 'TRI_LO', 0x400B: 'TRI_HI',
    0x400C: 'NOISE_VOL', 0x400E: 'NOISE_LO', 0x400F: 'NOISE_HI',
    0x4010: 'DMC_FREQ', 0x4011: 'DMC_RAW', 0x4012: 'DMC_START',
    0x4013: 'DMC_LEN', 0x4014: 'OAMDMA', 0x4015: 'SND_CHN',
    0x4016: 'JOY1', 0x4017: 'JOY2_FRAME',
}


def reg_name(a):
    if 0x2000 <= a <= 0x3FFF:
        return PPU_REGS.get(0x2000 + (a & 7))
    return APU_REGS.get(a)


# ---------------------------------------------------------------- ROM image
class Rom:
    def __init__(self, path):
        raw = open(path, 'rb').read()
        if raw[:4] != b'NES\x1a':
            raise SystemExit('not an iNES file')
        self.header = raw[:16]
        self.prg_banks = raw[4]
        self.chr_banks = raw[5]
        f6, f7 = raw[6], raw[7]
        self.mapper = (f7 & 0xF0) | (f6 >> 4)
        self.mirroring = 'four-screen' if f6 & 8 else ('vertical' if f6 & 1 else 'horizontal')
        self.battery = bool(f6 & 2)
        self.trainer = bool(f6 & 4)
        self.nes20 = ((f7 >> 2) & 3) == 2
        self.submapper = (raw[8] >> 4) if self.nes20 else None
        off = 16 + (512 if self.trainer else 0)
        n = self.prg_banks * 0x4000
        self.prg = raw[off:off + n]
        self.chr = raw[off + n:off + n + self.chr_banks * 0x2000]
        self.base = 0x10000 - len(self.prg)     # $8000 for 32 KB, $C000 for 16 KB
        self.raw = raw

    def byte(self, a):
        return self.prg[a - self.base]

    def word(self, a):
        return self.byte(a) | (self.byte(a + 1) << 8)

    def in_prg(self, a):
        return self.base <= a <= 0xFFFF

    def vectors(self):
        return self.word(0xFFFA), self.word(0xFFFC), self.word(0xFFFE)


# ---------------------------------------------------------------- decode
def decode(rom, addr):
    """-> (text, length, flow, target, mnemonic, mode, operand)"""
    op = rom.byte(addr)
    mn, mode, flow, illegal = OPS[op]
    n = SIZE[mode]
    ops = [rom.byte(addr + 1 + i) if rom.in_prg(addr + 1 + i) else 0 for i in range(n)]
    val = None
    target = None
    if n == 1:
        val = ops[0]
    elif n == 2:
        val = ops[0] | (ops[1] << 8)

    if mode == IMP:
        text = mn
    elif mode == ACC:
        text = f'{mn} A'
    elif mode == IMM:
        text = f'{mn} #${val:02X}'
    elif mode == ZP:
        text = f'{mn} ${val:02X}'
    elif mode == ZPX:
        text = f'{mn} ${val:02X},X'
    elif mode == ZPY:
        text = f'{mn} ${val:02X},Y'
    elif mode == IZX:
        text = f'{mn} (${val:02X},X)'
    elif mode == IZY:
        text = f'{mn} (${val:02X}),Y'
    elif mode == ABS:
        text = f'{mn} ${val:04X}'
    elif mode == ABX:
        text = f'{mn} ${val:04X},X'
    elif mode == ABY:
        text = f'{mn} ${val:04X},Y'
    elif mode == IND:
        text = f'{mn} (${val:04X})'
    elif mode == REL:
        target = (addr + 2 + (val - 256 if val > 127 else val)) & 0xFFFF
        text = f'{mn} ${target:04X}'
    if flow in (FLOW_JMP, FLOW_JSR, FLOW_JMPI):
        target = val
    if illegal and flow == FLOW_NEXT:
        text += '  ; *undoc*'
    return text, 1 + n, flow, target, mn, mode, val


# ---------------------------------------------------------------- tracer
class Tracer:
    def __init__(self, rom):
        self.rom = rom
        self.code = {}                    # addr -> (text, len, mn, mode, val)
        self.labels = {}
        self.xrefs = defaultdict(set)
        self.calls = defaultdict(set)
        self.pending = []
        self.visited = set()
        self.jmpi = set()                 # JMP (ind) sites, unresolved
        self.reg_hits = defaultdict(set)  # reg addr -> {site}
        self.bank_writes = {}             # site -> (addr, folded A or None)
        self.data_refs = defaultdict(set)  # PRG addr referenced as data -> sites
        self.stopped_illegal = set()
        self.idisp = set()                # inline-jump-table dispatcher entries
        self.itables = {}                 # table base -> [targets]
        self.itable_capped = set()         # tables that hit the entry cap
        self.max_table = 64
        self.always_taken = set()   # branches proven unconditional by Z-folding

    def label_for(self, a, kind='sub'):
        if a not in self.labels:
            self.labels[a] = f'{kind}_{a:04X}'
        return self.labels[a]

    def push(self, a, kind='loc', src=None):
        if not self.rom.in_prg(a):
            return
        self.label_for(a, kind)
        if src is not None:
            self.xrefs[a].add(src)
        if a not in self.visited:
            self.pending.append(a)

    def run(self):
        while self.pending:
            self.trace(self.pending.pop())

    def trace(self, addr):
        acc = None                        # constant-folded A, for CNROM latch
        zf = None                         # constant-folded Z flag, or None
        nf = None                         # constant-folded N flag, or None
        while True:
            if not self.rom.in_prg(addr):
                return
            if addr in self.visited:
                return
            self.visited.add(addr)
            text, length, flow, target, mn, mode, val = decode(self.rom, addr)
            self.code[addr] = (text, length, mn, mode, val)

            # --- constant fold A far enough to name the CHR bank value ---
            if mn == 'LDA' and mode == IMM:
                acc = val
            elif mn in ('TXA', 'TYA', 'PLA', 'AND', 'ORA', 'EOR', 'ADC',
                        'SBC', 'ASL', 'LSR', 'ROL', 'ROR', 'LDA'):
                acc = None

            # --- constant fold the Z flag ---------------------------------
            # `LDA #$08 / BNE x` is an UNCONDITIONAL branch: the fall-through
            # arm does not exist and is usually data.  Not folding this walked
            # the trace into a 6-byte data blob at $A1A4 and stopped on a JAM.
            # docs/knowledge/02-traps.md #1: follow the fall-through the ROM
            # actually takes, not the one the encoding permits.
            if mn in ('LDA', 'LDX', 'LDY') and mode == IMM:
                zf = (val == 0)
                nf = bool(val & 0x80)
            elif mn in ('STA', 'STX', 'STY', 'NOP', 'PHA', 'PHP', 'CLC',
                        'SEC', 'CLI', 'SEI', 'CLD', 'SED', 'CLV', 'JSR'):
                pass                      # these do not touch Z or N
            elif flow != FLOW_BRANCH:
                zf = nf = None
            if mn == 'JSR':
                zf = nf = None            # callee may return any flags

            # --- register / data annotation ---
            if mode in (ABS, ABX, ABY, IND) and val is not None and mn != 'JSR' \
                    and mn != 'JMP':
                if 0x2000 <= val <= 0x401F:
                    self.reg_hits[val if val >= 0x4000 else 0x2000 + (val & 7)].add(addr)
                elif val >= 0x8000 and mn in ('STA', 'STX', 'STY'):
                    self.bank_writes[addr] = (val, acc)
                elif val >= 0x8000 and mn in ('LDA', 'LDX', 'LDY', 'CMP', 'ADC',
                                              'SBC', 'AND', 'ORA', 'EOR', 'BIT'):
                    self.data_refs[val].add(addr)

            nxt = (addr + length) & 0xFFFF
            if flow == FLOW_ILL:
                self.stopped_illegal.add(addr)
                return
            if flow == FLOW_RET:
                return
            if flow == FLOW_JMPI:
                self.jmpi.add(addr)
                return
            if flow == FLOW_JMP:
                self.push(target, 'loc', addr)
                return
            if flow == FLOW_BRANCH:
                self.push(target, 'loc', addr)
                taken = None
                if zf is not None and mn in ('BNE', 'BEQ'):
                    taken = zf if mn == 'BEQ' else not zf
                elif nf is not None and mn in ('BPL', 'BMI'):
                    taken = nf if mn == 'BMI' else not nf
                if taken:
                    self.always_taken.add(addr)
                    return                # fall-through arm is unreachable
                # On the NOT-taken path of a Z-branch the flag is known for
                # free, whatever produced it.  This is what makes the very
                # common `DEX / BNE loop / BEQ exit` tail resolve: the BEQ is
                # unconditional, and without this the trace ran on into data
                # (it invented a CNROM bank write at $8894).
                # This is also what makes an exhaustive `BPL x / BMI y` pair
                # resolve: after BPL falls through, N is known 1, so the BMI is
                # unconditional and the bytes after it are data (at $8BF0 they
                # are an oscillation table, FD FB FB F9 F9 FB FB FD ...).
                if mn == 'BNE':
                    zf = True
                elif mn == 'BEQ':
                    zf = False
                elif mn == 'BPL':
                    nf = True
                elif mn == 'BMI':
                    nf = False
                addr = nxt
                continue
            if flow == FLOW_JSR:
                self.push(target, 'sub', addr)
                self.calls[addr].add(target)
                if target in self.idisp:
                    # Konami inline jump table: the bytes after the JSR are a
                    # little-endian pointer list, NOT code.  Control never
                    # returns here.  ROM: dispatcher at $83E4.
                    self.read_itable(nxt, addr)
                    return
                addr = nxt
                continue
            addr = nxt

    # ---- inline jump tables --------------------------------------------
    def read_itable(self, base, site):
        """Read the pointer list an inline-dispatcher JSR is followed by.

        Extent heuristic (the same one banktrace.py used on the Game Boy):
        entries must point into PRG, and the handler bodies normally follow the
        table immediately, so the table ends at the lowest entry that lies
        after the table base.  Capped at self.max_table and the cap is
        REPORTED, never silent.
        """
        if base in self.itables:
            return
        entries = []
        p = base
        while len(entries) < self.max_table and p + 1 <= 0xFFFF:
            v = self.rom.word(p)
            if not self.rom.in_prg(v):
                break
            entries.append(v)
            p += 2
            after = [e for e in entries if e > base]
            if after and p >= min(after):
                break
        if not entries:
            return
        if len(entries) >= self.max_table:
            self.itable_capped.add(base)
        self.itables[base] = entries
        self.labels[base] = f'jt_{base:04X}'
        self.xrefs[base].add(site)
        for e in entries:
            self.push(e, 'st', site)

    # ---- dispatcher detection -------------------------------------------
    def detect_dispatchers(self):
        """A routine is an inline-table dispatcher if, decoding linearly from
        its entry, it does PLA twice and then JMP (zp) with no RTS or JSR in
        between.  That is the `pull the return address, use it as a table base`
        idiom.  Returns the set of newly found entries."""
        found = set()
        for entry in {t for ts in self.calls.values() for t in ts}:
            if entry in self.idisp or not self.rom.in_prg(entry):
                continue
            a, pulls = entry, 0
            for _ in range(48):
                if not self.rom.in_prg(a):
                    break
                text, ln, flow, tgt, mn, mode, val = decode(self.rom, a)
                if mn == 'PLA':
                    pulls += 1
                if mn in ('RTS', 'RTI', 'JSR') or flow == FLOW_ILL:
                    break
                if flow == FLOW_JMPI and pulls >= 2 and val is not None and val < 0x100:
                    found.add(entry)
                    break
                if flow in (FLOW_JMP, FLOW_JMPI):
                    break
                a += ln
        self.idisp |= found
        return found

    def run_to_fixpoint(self, seeds):
        """Trace, detect dispatchers, re-trace, until nothing new is found."""
        rounds = []
        while True:
            self.run()
            new = self.detect_dispatchers()
            n_before = len(self.visited)
            rounds.append((len(self.code), sorted(new)))
            if not new:
                return rounds
            # A dispatcher was discovered, so every block previously traced
            # *past* a dispatcher JSR walked into pointer data and everything
            # derived from it is wrong.  Discard ALL derived state (not just
            # code/visited -- forgetting jmpi and reg_hits here left phantom
            # findings such as a bogus "JMP ($A681)") and re-walk from seeds.
            self.visited.clear()
            self.code.clear()
            self.labels.clear()
            self.xrefs.clear()
            self.calls.clear()
            self.jmpi.clear()
            self.reg_hits.clear()
            self.bank_writes.clear()
            self.data_refs.clear()
            self.itables.clear()
            self.itable_capped.clear()
            self.stopped_illegal.clear()
            self.always_taken.clear()
            self.pending = list(seeds)
            del n_before

    # ---------------------------------------------------------- output
    def listing(self):
        out = []
        addr = self.rom.base
        run = []

        def flush():
            if not run:
                return
            start = run[0][0]
            vals = [v for _, v in run]
            for i in range(0, len(vals), 16):
                ch = vals[i:i + 16]
                hexs = ' '.join(f'${b:02X}' for b in ch)
                asc = ''.join(chr(b) if 32 <= b < 127 else '.' for b in ch)
                out.append(f'    {start+i:04X}:              .byte {hexs:<64} ; |{asc}|')
            run.clear()

        while addr <= 0xFFFF:
            if addr in self.itables:
                flush()
                ents = self.itables[addr]
                out.append('')
                refs = sorted(self.xrefs.get(addr, ()))
                out.append(f'; inline jump table, {len(ents)} entries'
                           + (f'  (xref {refs[0]:04X})' if refs else '')
                           + ('  *CAPPED*' if addr in self.itable_capped else ''))
                out.append(f'{self.labels[addr]}:')
                for i, e in enumerate(ents):
                    out.append(f'    {addr+2*i:04X}: {e&0xFF:02X} {e>>8:02X}      '
                               f'.word ${e:04X}   ; [{i}] {self.labels.get(e,"")}')
                addr += 2 * len(ents)
                continue
            if addr in self.code:
                flush()
                text, length, mn, mode, val = self.code[addr]
                if addr in self.labels:
                    out.append('')
                    refs = sorted(self.xrefs.get(addr, ()))
                    if refs:
                        rs = ', '.join(f'{r:04X}' for r in refs[:10])
                        more = '' if len(refs) <= 10 else f' (+{len(refs)-10})'
                        out.append(f'; xrefs: {rs}{more}')
                    out.append(f'{self.labels[addr]}:')
                raw = ' '.join(f'{self.rom.byte(addr+i):02X}' for i in range(length))
                note = ''
                if val is not None and mode in (ABS, ABX, ABY):
                    r = reg_name(val)
                    if r:
                        note = f'   ; {r}'
                if addr in self.bank_writes:
                    a, a_val = self.bank_writes[addr]
                    note = f'   ; CNROM CHR bank <- {"$%02X" % a_val if a_val is not None else "<dynamic>"}'
                out.append(f'    {addr:04X}: {raw:<10} {text}{note}')
                addr += length
            else:
                run.append((addr, self.rom.byte(addr)))
                addr += 1
            if addr > 0xFFFF:
                break
        flush()
        return '\n'.join(out)

    def coverage(self):
        n = sum(l for (_, l, _, _, _) in self.code.values())
        d = sum(2 * len(v) for v in self.itables.values())
        return n, d, len(self.rom.prg)


# ---------------------------------------------------------------- selftest
def selftest(rom, tracer):
    """Cross-check every traced instruction against capstone's decoder."""
    try:
        import capstone
    except ImportError:
        print('capstone not installed - selftest skipped (this is a SKIP, not a pass)')
        return 2
    md = capstone.Cs(capstone.CS_ARCH_MOS65XX, capstone.CS_MODE_MOS65XX_6502)
    bad = 0
    checked = 0
    for addr in sorted(tracer.code):
        text, length, mn, mode, val = tracer.code[addr]
        blob = bytes(rom.byte(addr + i) for i in range(min(3, 0x10000 - addr)))
        ins = list(md.disasm(blob, addr, count=1))
        if not ins:
            print(f'  {addr:04X}: capstone refused to decode {blob.hex()} (ours: {text})')
            bad += 1
            continue
        i = ins[0]
        checked += 1
        if i.size != length or i.mnemonic.upper() != mn:
            print(f'  {addr:04X}: ours={mn}/{length}  capstone={i.mnemonic.upper()}/{i.size}'
                  f'  bytes={blob[:length].hex()}')
            bad += 1
    print(f'selftest: {checked} instructions cross-checked against capstone, {bad} mismatch(es)')
    return 1 if bad else 0


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rom')
    ap.add_argument('--entry', action='append', default=[], help='extra hex entry point')
    ap.add_argument('--out')
    ap.add_argument('--coverage', action='store_true')
    ap.add_argument('--regs', action='store_true')
    ap.add_argument('--xrefs', action='store_true')
    ap.add_argument('--banks', action='store_true')
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--header', action='store_true')
    ap.add_argument('--tables', action='store_true')
    ap.add_argument('--no-disp', action='store_true',
                    help='disable inline-jump-table following (for A/B measurement)')
    args = ap.parse_args()

    rom = Rom(args.rom)
    nmi, res, irq = rom.vectors()

    if args.header:
        print(f'header      {rom.header.hex(" ")}')
        print(f'PRG         {len(rom.prg)} bytes ({rom.prg_banks} x 16 KB) mapped at ${rom.base:04X}-$FFFF')
        print(f'CHR         {len(rom.chr)} bytes ({rom.chr_banks} x 8 KB)')
        print(f'mapper      {rom.mapper}' + (f' submapper {rom.submapper}' if rom.nes20 else ''))
        print(f'mirroring   {rom.mirroring}   battery {rom.battery}   NES2.0 {rom.nes20}')
        print(f'NMI   ${nmi:04X}')
        print(f'RESET ${res:04X}')
        print(f'IRQ   ${irq:04X}')

    t = Tracer(rom)
    seeds = [res, nmi, irq] + [int(e, 16) for e in args.entry]
    t.push(res, 'reset')
    t.push(nmi, 'nmi')
    t.push(irq, 'irq')
    for e in args.entry:
        t.push(int(e, 16), 'user')
    rounds = t.run_to_fixpoint(seeds) if not args.no_disp else [(0, [])] and (t.run() or [])

    if args.coverage:
        n, d, total = t.coverage()
        print(f'traced as code: {n}/{total} bytes ({100.0*n/total:.1f}%)'
              f' + {d} bytes of inline jump table ({100.0*(n+d)/total:.1f}% total)')
        print(f'  {len(t.labels)} labels, {len(t.itables)} inline tables, '
              f'{len(t.jmpi)} unresolved JMP (ind), '
              f'{len(t.stopped_illegal)} traces stopped on a JAM opcode')
        print(f'  {len(t.always_taken)} branches proven always-taken by Z-folding '
              '(their fall-through arm is not code)')
        if t.itable_capped:
            print('  CAPPED tables (extent heuristic hit the '
                  f'{t.max_table}-entry limit, may be truncated): '
                  + ' '.join(f'${a:04X}' for a in sorted(t.itable_capped)))
        for i, (ncode, new) in enumerate(rounds or []):
            if new:
                print(f'  round {i}: {ncode} instrs, found dispatchers '
                      + ' '.join(f'${a:04X}' for a in new))

    if args.tables:
        print('\n== inline jump tables ==')
        for base in sorted(t.itables):
            ents = t.itables[base]
            print(f'  ${base:04X}  {len(ents):3d} entries'
                  + ('  *CAPPED*' if base in t.itable_capped else ''))
            print('        ' + ' '.join(f'{e:04X}' for e in ents))

    if args.regs:
        print('\n== hardware register accesses (traced code only) ==')
        for a in sorted(t.reg_hits):
            sites = sorted(t.reg_hits[a])
            nm = reg_name(a) or '?'
            head = ' '.join(f'{s:04X}' for s in sites[:12])
            more = '' if len(sites) <= 12 else f' (+{len(sites)-12} more)'
            print(f'  ${a:04X} {nm:<11} {len(sites):4d} site(s): {head}{more}')

    if args.banks:
        print('\n== stores into $8000-$FFFF (CNROM CHR bank latch) ==')
        for site in sorted(t.bank_writes):
            a, v = t.bank_writes[site]
            vs = f'${v:02X}' if v is not None else '<dynamic>'
            print(f'  {site:04X}: -> ${a:04X}   A={vs}')

    if args.xrefs:
        print('\n== most-referenced routines ==')
        for a, refs in sorted(t.xrefs.items(), key=lambda kv: -len(kv[1]))[:40]:
            print(f'  ${a:04X}  {len(refs):4d} refs  {t.labels.get(a,"")}')
        print('\n== unresolved JMP (indirect) sites ==')
        for a in sorted(t.jmpi):
            print(f'  ${a:04X}  {t.code[a][0]}')

    rc = 0
    if args.selftest:
        rc = selftest(rom, t)

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(f'; {os.path.basename(args.rom)} - PRG trace from vectors\n')
            f.write(f'; NMI ${nmi:04X}  RESET ${res:04X}  IRQ ${irq:04X}\n')
            f.write(t.listing())
            f.write('\n')
        print(f'wrote {args.out}', file=sys.stderr)

    return rc


if __name__ == '__main__':
    sys.exit(main())
