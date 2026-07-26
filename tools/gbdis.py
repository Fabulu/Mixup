#!/usr/bin/env python3
"""Bank-aware Game Boy (LR35902) disassembler.

Built for the Batman: Return of the Joker port project. Usable as a CLI or as
a library:

    from gbdis import Rom, Disassembler
    rom = Rom("Batman - Return of the Joker (USA, Europe).gb")
    d = Disassembler(rom)
    d.trace_from_vectors()
    print(d.listing(bank=0))

Addressing convention: a "location" is (bank, addr). Bank 0 lives at
$0000-$3FFF; every other bank is mapped at $4000-$7FFF. Raw file offset for
(bank, addr) is bank*0x4000 + (addr & 0x3FFF).
"""

import argparse
import sys
from collections import defaultdict

R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
R16 = ['BC', 'DE', 'HL', 'SP']
R16S = ['BC', 'DE', 'HL', 'AF']
CC = ['NZ', 'Z', 'NC', 'C']
ALU = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP ']
ROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SWAP', 'SRL']

# Hardware register names, used to annotate $FFxx accesses.
IO_REGS = {
    0xFF00: 'rP1', 0xFF01: 'rSB', 0xFF02: 'rSC', 0xFF04: 'rDIV',
    0xFF05: 'rTIMA', 0xFF06: 'rTMA', 0xFF07: 'rTAC', 0xFF0F: 'rIF',
    0xFF10: 'rNR10', 0xFF11: 'rNR11', 0xFF12: 'rNR12', 0xFF13: 'rNR13',
    0xFF14: 'rNR14', 0xFF16: 'rNR21', 0xFF17: 'rNR22', 0xFF18: 'rNR23',
    0xFF19: 'rNR24', 0xFF1A: 'rNR30', 0xFF1B: 'rNR31', 0xFF1C: 'rNR32',
    0xFF1D: 'rNR33', 0xFF1E: 'rNR34', 0xFF20: 'rNR41', 0xFF21: 'rNR42',
    0xFF22: 'rNR43', 0xFF23: 'rNR44', 0xFF24: 'rNR50', 0xFF25: 'rNR51',
    0xFF26: 'rNR52',
    0xFF40: 'rLCDC', 0xFF41: 'rSTAT', 0xFF42: 'rSCY', 0xFF43: 'rSCX',
    0xFF44: 'rLY', 0xFF45: 'rLYC', 0xFF46: 'rDMA', 0xFF47: 'rBGP',
    0xFF48: 'rOBP0', 0xFF49: 'rOBP1', 0xFF4A: 'rWY', 0xFF4B: 'rWX',
    0xFFFF: 'rIE',
}

# ---------------------------------------------------------------------------
# Opcode table: opcode -> (template, length, flow)
#   template uses {d8} {d16} {a8} {a16} {e8} placeholders
#   flow is one of: None (falls through), 'jp', 'jr', 'call', 'ret', 'rst',
#                   'jphl', 'stop', 'halt', 'illegal'
# ---------------------------------------------------------------------------

def _build_table():
    t = {}

    def put(op, tmpl, length, flow=None, target=None):
        t[op] = (tmpl, length, flow, target)

    put(0x00, 'NOP', 1)
    put(0x10, 'STOP', 2, 'stop')
    put(0x76, 'HALT', 1, 'halt')
    put(0xF3, 'DI', 1)
    put(0xFB, 'EI', 1)
    put(0x27, 'DAA', 1)
    put(0x2F, 'CPL', 1)
    put(0x37, 'SCF', 1)
    put(0x3F, 'CCF', 1)
    put(0x07, 'RLCA', 1)
    put(0x0F, 'RRCA', 1)
    put(0x17, 'RLA', 1)
    put(0x1F, 'RRA', 1)

    put(0x08, 'LD [{a16}], SP', 3)
    put(0xE8, 'ADD SP, {e8}', 2)
    put(0xF8, 'LD HL, SP{e8s}', 2)
    put(0xF9, 'LD SP, HL', 1)

    put(0xE0, 'LDH [{a8}], A', 2)
    put(0xF0, 'LDH A, [{a8}]', 2)
    put(0xE2, 'LDH [C], A', 1)
    put(0xF2, 'LDH A, [C]', 1)
    put(0xEA, 'LD [{a16}], A', 3)
    put(0xFA, 'LD A, [{a16}]', 3)

    put(0x18, 'JR {e8t}', 2, 'jr')
    put(0xC3, 'JP {a16}', 3, 'jp')
    put(0xE9, 'JP HL', 1, 'jphl')
    put(0xCD, 'CALL {a16}', 3, 'call')
    put(0xC9, 'RET', 1, 'ret')
    put(0xD9, 'RETI', 1, 'ret')
    put(0xCB, 'PREFIX', 2)

    for i, cc in enumerate(CC):
        put(0x20 + i * 8, f'JR {cc}, {{e8t}}', 2, 'jrc')
        put(0xC2 + i * 8, f'JP {cc}, {{a16}}', 3, 'jpc')
        put(0xC4 + i * 8, f'CALL {cc}, {{a16}}', 3, 'callc')
        put(0xC0 + i * 8, f'RET {cc}', 1)

    for i in range(8):
        put(0xC7 + i * 8, f'RST ${i*8:02X}', 1, 'rst', i * 8)

    for i, r in enumerate(R16):
        put(0x01 + i * 0x10, f'LD {r}, {{d16}}', 3)
        put(0x03 + i * 0x10, f'INC {r}', 1)
        put(0x0B + i * 0x10, f'DEC {r}', 1)
        put(0x09 + i * 0x10, f'ADD HL, {r}', 1)

    for i, r in enumerate(R16S):
        put(0xC1 + i * 0x10, f'POP {r}', 1)
        put(0xC5 + i * 0x10, f'PUSH {r}', 1)

    for i, m in enumerate(['[BC]', '[DE]', '[HL+]', '[HL-]']):
        put(0x02 + i * 0x10, f'LD {m}, A', 1)
        put(0x0A + i * 0x10, f'LD A, {m}', 1)

    for i, r in enumerate(R8):
        put(0x04 + i * 8, f'INC {r}', 1)
        put(0x05 + i * 8, f'DEC {r}', 1)
        put(0x06 + i * 8, f'LD {r}, {{d8}}', 2)

    for d in range(8):
        for s in range(8):
            op = 0x40 + d * 8 + s
            if op == 0x76:
                continue
            put(op, f'LD {R8[d]}, {R8[s]}', 1)

    for a in range(8):
        for s in range(8):
            put(0x80 + a * 8 + s, f'{ALU[a]}{R8[s]}', 1)
        put(0xC6 + a * 8, f'{ALU[a]}{{d8}}', 2)

    for op in (0xD3, 0xDB, 0xDD, 0xE3, 0xE4, 0xEB, 0xEC, 0xED,
               0xF4, 0xFC, 0xFD):
        put(op, f'DB ${op:02X}', 1, 'illegal')

    return t


TABLE = _build_table()


def cb_name(cb):
    r = R8[cb & 7]
    grp = cb >> 6
    bit = (cb >> 3) & 7
    if grp == 0:
        return f'{ROT[bit]} {r}'
    if grp == 1:
        return f'BIT {bit}, {r}'
    if grp == 2:
        return f'RES {bit}, {r}'
    return f'SET {bit}, {r}'


class Rom:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.data = f.read()
        self.banks = len(self.data) // 0x4000
        self.title = self.data[0x134:0x144].rstrip(b'\x00').decode('ascii', 'replace')

    def offset(self, bank, addr):
        return bank * 0x4000 + (addr & 0x3FFF)

    def byte(self, bank, addr):
        return self.data[self.offset(bank, addr)]

    def word(self, bank, addr):
        return self.byte(bank, addr) | (self.byte(bank, addr + 1) << 8)

    def home(self, addr):
        """Read from bank 0 ($0000-$3FFF) regardless of current bank."""
        return self.data[addr]


class Disassembler:
    def __init__(self, rom):
        self.rom = rom
        # code[bank] = {addr: (text, length, raw_bytes)}
        self.code = defaultdict(dict)
        self.labels = {}            # (bank, addr) -> name
        self.xrefs = defaultdict(set)   # (bank, addr) -> {(bank, addr) callers}
        self.calls = defaultdict(set)   # (bank, addr) -> {(bank, addr) callees}
        self.io_hits = defaultdict(set)  # ioaddr -> {(bank,addr)}
        self.ram_hits = defaultdict(set)  # ramaddr -> {(bank,addr)}
        self.visited = set()
        self.pending = []
        self.unresolved_far = set()  # sites calling $4000+ with unknown bank

    # -- helpers ----------------------------------------------------------

    def label_for(self, bank, addr, kind='sub'):
        key = (bank, addr)
        if key not in self.labels:
            self.labels[key] = f'{kind}_{bank:02X}_{addr:04X}'
        return self.labels[key]

    def add_entry(self, bank, addr, kind='sub', src=None):
        # Bank-0 addresses are always bank 0, whatever bank we came from.
        if addr < 0x4000:
            bank = 0
        elif addr >= 0x8000:
            return  # RAM target; can't disassemble statically
        elif bank == 0:
            # $4000-$7FFF while tracing bank 0: the target lives in whichever
            # bank is currently mapped, which this tracer does not model. Do NOT
            # fall back to bank 0 -- that aliases into $0000-$3FFF and invents
            # code. Use tools/banktrace.py, which carries bank context.
            self.unresolved_far.add((bank, addr) if src is None else src)
            return
        key = (bank, addr)
        self.label_for(bank, addr, kind)
        if src:
            self.xrefs[key].add(src)
        if key not in self.visited:
            self.pending.append(key)

    # -- tracing ----------------------------------------------------------

    def trace_from_vectors(self, extra_banks=True):
        """Seed from RST vectors, interrupt vectors and $0100 entry."""
        for a in range(0x00, 0x40, 8):
            self.add_entry(0, a, 'rst')
        for a in (0x40, 0x48, 0x50, 0x58, 0x60):
            self.add_entry(0, a, 'irq')
        self.add_entry(0, 0x100, 'entry')
        self.run()

    def run(self):
        while self.pending:
            bank, addr = self.pending.pop()
            self.trace(bank, addr)

    def trace(self, bank, addr):
        while True:
            key = (bank, addr)
            if key in self.visited:
                return
            if addr < 0x4000 and bank != 0:
                bank = 0
                key = (bank, addr)
            if addr >= 0x8000:
                return
            if self.rom.offset(bank, addr) >= len(self.rom.data):
                return

            self.visited.add(key)
            text, length, flow, target = self.decode(bank, addr)
            raw = bytes(self.rom.byte(bank, addr + i) for i in range(length))
            self.code[bank][addr] = (text, length, raw)

            nxt = addr + length

            if flow == 'illegal':
                return
            if flow in ('ret', 'jphl', 'stop'):
                return
            if flow == 'rst':
                self.add_entry(0, target, 'rst', key)
                addr = nxt
                continue
            if flow in ('jp', 'jr'):
                self.add_entry(bank, target, 'loc', key)
                return
            if flow in ('jpc', 'jrc'):
                self.add_entry(bank, target, 'loc', key)
                addr = nxt
                continue
            if flow in ('call', 'callc'):
                self.add_entry(bank, target, 'sub', key)
                self.calls[key].add((0 if target < 0x4000 else bank, target))
                addr = nxt
                continue

            addr = nxt

    # -- decode -----------------------------------------------------------

    def decode(self, bank, addr):
        op = self.rom.byte(bank, addr)

        if op == 0xCB:
            cb = self.rom.byte(bank, addr + 1)
            return cb_name(cb), 2, None, None

        tmpl, length, flow, target = TABLE[op]
        text = tmpl

        if '{d8}' in tmpl:
            v = self.rom.byte(bank, addr + 1)
            text = tmpl.replace('{d8}', f'${v:02X}')
        elif '{a8}' in tmpl:
            v = self.rom.byte(bank, addr + 1)
            io = 0xFF00 | v
            name = IO_REGS.get(io, f'${io:04X}')
            self.io_hits[io].add((bank, addr))
            text = tmpl.replace('{a8}', name)
        elif '{e8t}' in tmpl:
            e = self.rom.byte(bank, addr + 1)
            if e > 127:
                e -= 256
            target = (addr + 2 + e) & 0xFFFF
            tb = 0 if target < 0x4000 else bank
            text = tmpl.replace('{e8t}', self.label_for(tb, target, 'loc'))
        elif '{e8s}' in tmpl:
            e = self.rom.byte(bank, addr + 1)
            if e > 127:
                e -= 256
            text = tmpl.replace('{e8s}', f'{e:+d}')
        elif '{e8}' in tmpl:
            e = self.rom.byte(bank, addr + 1)
            if e > 127:
                e -= 256
            text = tmpl.replace('{e8}', f'{e:+d}')
        elif '{d16}' in tmpl:
            v = self.rom.word(bank, addr + 1)
            self._note_operand(bank, addr, v)
            text = tmpl.replace('{d16}', f'${v:04X}')
        elif '{a16}' in tmpl:
            v = self.rom.word(bank, addr + 1)
            target = v
            if flow in ('jp', 'jpc', 'call', 'callc'):
                tb = 0 if v < 0x4000 else bank
                text = tmpl.replace('{a16}', self.label_for(tb, v, 'sub' if 'call' in (flow or '') else 'loc'))
            else:
                self._note_operand(bank, addr, v)
                name = IO_REGS.get(v)
                text = tmpl.replace('{a16}', name if name else f'${v:04X}')

        return text, length, flow, target

    def _note_operand(self, bank, addr, v):
        if 0xFF00 <= v <= 0xFFFF:
            self.io_hits[v].add((bank, addr))
        elif 0xC000 <= v <= 0xDFFF:
            self.ram_hits[v].add((bank, addr))
        elif 0xFE00 <= v <= 0xFE9F:
            self.ram_hits[v].add((bank, addr))

    # -- output -----------------------------------------------------------

    def listing(self, bank, show_data=True):
        out = []
        base = 0x0000 if bank == 0 else 0x4000
        end = base + 0x4000
        addr = base
        code = self.code[bank]
        data_run = []

        def flush_data():
            if not data_run:
                return
            start = data_run[0][0]
            vals = [v for _, v in data_run]
            for i in range(0, len(vals), 16):
                chunk = vals[i:i + 16]
                hexs = ' '.join(f'${b:02X}' for b in chunk)
                asc = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
                out.append(f'    {start + i:04X}:              DB {hexs:<64} ; |{asc}|')
            data_run.clear()

        while addr < end:
            if addr in code:
                flush_data()
                text, length, raw = code[addr]
                key = (bank, addr)
                if key in self.labels:
                    out.append('')
                    refs = self.xrefs.get(key)
                    if refs:
                        rs = ', '.join(f'{b:02X}:{a:04X}' for b, a in sorted(refs)[:8])
                        more = '' if len(refs) <= 8 else f' (+{len(refs)-8})'
                        out.append(f'; xrefs: {rs}{more}')
                    out.append(f'{self.labels[key]}:')
                rawh = ' '.join(f'{b:02X}' for b in raw)
                out.append(f'    {addr:04X}: {rawh:<10} {text}')
                addr += length
            else:
                if show_data:
                    data_run.append((addr, self.rom.byte(bank, addr)))
                addr += 1
        flush_data()
        return '\n'.join(out)

    def coverage(self):
        rows = []
        for bank in range(self.rom.banks):
            covered = sum(l for (_, l, _) in self.code[bank].values())
            rows.append((bank, covered, 0x4000, 100.0 * covered / 0x4000))
        return rows


def main():
    ap = argparse.ArgumentParser(description='Game Boy ROM disassembler')
    ap.add_argument('rom')
    ap.add_argument('--bank', type=int, help='dump a single bank')
    ap.add_argument('--all', action='store_true', help='dump every bank')
    ap.add_argument('--outdir', help='write per-bank .asm files here')
    ap.add_argument('--coverage', action='store_true')
    ap.add_argument('--entry', action='append', default=[],
                    help='extra entry point as BANK:ADDR (hex addr), repeatable')
    ap.add_argument('--io', action='store_true', help='list hardware register accesses')
    ap.add_argument('--ram', action='store_true', help='list WRAM/OAM absolute accesses')
    args = ap.parse_args()

    rom = Rom(args.rom)
    d = Disassembler(rom)
    for spec in args.entry:
        b, a = spec.split(':')
        d.add_entry(int(b, 0), int(a, 16), 'user')
    d.trace_from_vectors()

    if args.coverage:
        print(f'{rom.title}  {rom.banks} banks')
        total = 0
        for bank, cov, size, pct in d.coverage():
            total += cov
            print(f'  bank {bank}: {cov:6d}/{size} bytes traced as code  ({pct:5.1f}%)')
        print(f'  total : {total}/{rom.banks*0x4000} ({100.0*total/(rom.banks*0x4000):.1f}%)')

    if args.io:
        print('\n== hardware register access ==')
        for io in sorted(d.io_hits):
            name = IO_REGS.get(io, f'${io:04X}')
            sites = sorted(d.io_hits[io])
            loc = ', '.join(f'{b:02X}:{a:04X}' for b, a in sites[:10])
            more = '' if len(sites) <= 10 else f' (+{len(sites)-10} more)'
            print(f'  {name:<8} {len(sites):4d} sites: {loc}{more}')

    if args.ram:
        print('\n== absolute WRAM/OAM access ==')
        for ra in sorted(d.ram_hits):
            sites = sorted(d.ram_hits[ra])
            loc = ', '.join(f'{b:02X}:{a:04X}' for b, a in sites[:10])
            more = '' if len(sites) <= 10 else f' (+{len(sites)-10} more)'
            print(f'  ${ra:04X}  {len(sites):4d} sites: {loc}{more}')

    if args.outdir:
        import os
        os.makedirs(args.outdir, exist_ok=True)
        for bank in range(rom.banks):
            p = os.path.join(args.outdir, f'bank_{bank:02X}.asm')
            with open(p, 'w', encoding='utf-8') as f:
                f.write(f'; {rom.title} - bank {bank:02X}\n')
                f.write(d.listing(bank))
                f.write('\n')
            print(f'wrote {p}', file=sys.stderr)

    if args.bank is not None:
        print(d.listing(args.bank))
    elif args.all:
        for bank in range(rom.banks):
            print(f'\n;=== BANK {bank:02X} ===\n')
            print(d.listing(bank))


if __name__ == '__main__':
    main()
