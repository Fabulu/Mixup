#!/usr/bin/env python3
"""Bank-context-aware tracer for MBC1 ROMs.

The stock gbdis tracer cannot follow CALLs into $4000-$7FFF because it does not
know which bank is mapped.  This tracer carries a "currently mapped high bank"
value through the trace and constant-folds the `LD A,n / LD [$2000],A` idiom
that Batman: Return of the Joker uses for every bank switch, so calls into the
switched region resolve to the right physical bank.

State is (curbank, addr).  A physical location is (bank, addr) where bank is 0
for addr < $4000 and curbank otherwise.

Usage:
    python tools/banktrace.py "<rom>" --coverage
    python tools/banktrace.py "<rom>" --outdir disasm
    python tools/banktrace.py "<rom>" --entry 7:412B --entry 5:4000
    python tools/banktrace.py "<rom>" --switches      # list bank-switch sites
"""
import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbdis import Rom, Disassembler, TABLE, cb_name, IO_REGS  # noqa: E402

UNKNOWN = None


class BankTracer:
    def __init__(self, rom, banks=None):
        self.rom = rom
        self.nbanks = rom.banks
        self.d = Disassembler(rom)          # used only for decode()
        self.code = defaultdict(dict)       # bank -> addr -> (text, len, raw)
        self.xrefs = defaultdict(set)       # (bank,addr) -> {(bank,addr)}
        self.calls = defaultdict(set)
        self.labels = {}
        self.visited = set()                # (curbank, addr)
        self.pending = []
        self.switch_sites = {}              # (bank,addr) -> bank value written
        self.unresolved_jphl = set()
        self.unresolved_far = set()         # sites calling $4000+ with unknown bank
        self.candidate_banks = list(range(1, self.nbanks)) if banks is None else banks
        self.follow_jt = False
        self.jumptables = {}    # (bank, tbl_addr) -> [targets]

    # -- jump tables -----------------------------------------------------
    def resolve_jumptable(self, curbank, bank, jphl_addr):
        """Recover `LD HL,tbl / ADD HL,rr / LD A,[HL+] / LD H,(HL) / LD L,A /
        JP HL` dispatch tables.  The table base is the `LD HL,nnnn` immediate
        found by scanning backwards from the JP HL; table length is inferred by
        reading 16-bit LE entries until the read cursor reaches the lowest
        entry that lies after the table (the usual layout: table first, handler
        bodies immediately after)."""
        tbl = None
        for back in range(3, 24):
            a = jphl_addr - back
            if a < (0 if bank == 0 else 0x4000):
                break
            if self.rom.byte(bank, a) == 0x21:      # LD HL,d16
                cand = self.rom.word(bank, a + 1)
                lo = 0 if bank == 0 else 0x4000
                if lo <= cand < lo + 0x4000:
                    tbl = cand
                    break
        if tbl is None:
            return
        lo = 0 if bank == 0 else 0x4000
        hi = lo + 0x4000
        entries = []
        p = tbl
        limit = 0x100
        while len(entries) < limit and p + 1 < hi:
            v = self.rom.word(bank, p)
            if not (lo <= v < hi):
                break
            entries.append(v)
            p += 2
            after = [e for e in entries if e > tbl]
            if after and p >= min(after):
                break
        if not entries:
            return
        self.jumptables[(bank, tbl)] = entries
        for e in entries:
            self.push(curbank, e, 'jt', (bank, jphl_addr))

    # -- labels ----------------------------------------------------------
    def label_for(self, bank, addr, kind='sub'):
        key = (bank, addr)
        if key not in self.labels:
            self.labels[key] = f'{kind}_{bank:02X}_{addr:04X}'
        return self.labels[key]

    def phys(self, curbank, addr):
        return (0 if addr < 0x4000 else curbank, addr)

    def push(self, curbank, addr, kind='sub', src=None):
        if addr >= 0x8000:
            return
        if addr >= 0x4000:
            if curbank is UNKNOWN:
                if src:
                    self.unresolved_far.add(src)
                return
            if curbank >= self.nbanks:
                return
        p = self.phys(curbank, addr)
        self.label_for(p[0], p[1], kind)
        if src:
            self.xrefs[p].add(src)
        st = (curbank, addr)
        if st not in self.visited:
            self.pending.append(st)

    # -- entry -----------------------------------------------------------
    def seed_default(self):
        # reset maps bank 1 at $4000
        for a in (0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38):
            self.push(1, a, 'rst')
        for a in (0x40, 0x48, 0x50, 0x58, 0x60):
            self.push(1, a, 'irq')
        self.push(1, 0x100, 'entry')

    def run(self):
        while self.pending:
            cb, a = self.pending.pop()
            self.trace(cb, a)

    # -- the trace -------------------------------------------------------
    def trace(self, curbank, addr):
        acc = UNKNOWN          # constant-folded value of A, or None
        while True:
            if addr >= 0x8000:
                return
            st = (curbank, addr)
            if st in self.visited:
                return
            if addr >= 0x4000 and (curbank is UNKNOWN or curbank >= self.nbanks):
                return
            self.visited.add(st)
            bank = 0 if addr < 0x4000 else curbank
            op = self.rom.byte(bank, addr)
            text, length, flow, target = self.d.decode(bank, addr)
            raw = bytes(self.rom.byte(bank, addr + i) for i in range(length))
            self.code[bank][addr] = (text, length, raw)
            nxt = (addr + length) & 0xFFFF

            # --- constant folding on A ---
            if op == 0x3E:                       # LD A,d8
                acc = raw[1]
            elif op == 0xAF:                     # XOR A
                acc = 0
            elif op == 0xEA:                     # LD [n16],A
                v = raw[1] | (raw[2] << 8)
                if 0x2000 <= v <= 0x3FFF:
                    self.switch_sites[(bank, addr)] = acc
                    if acc is not UNKNOWN:
                        b = acc & 0x1F
                        if b == 0:
                            b = 1
                        curbank = b
                    else:
                        curbank = UNKNOWN
            elif op in (0x3C, 0x3D):             # INC/DEC A
                acc = ((acc + (1 if op == 0x3C else -1)) & 0xFF) if acc is not UNKNOWN else UNKNOWN
            elif op == 0xF5 or op == 0xF1:       # PUSH/POP AF
                if op == 0xF1:
                    acc = UNKNOWN
            else:
                # any instruction whose destination is A clobbers our constant
                if (0x78 <= op <= 0x7F) or (0x80 <= op <= 0xBF and op < 0xB8) \
                   or op in (0x0A, 0x1A, 0x2A, 0x3A, 0xFA, 0xF0, 0xF2, 0x3F,
                             0x07, 0x0F, 0x17, 0x1F, 0x27, 0x2F, 0xC6, 0xCE,
                             0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xF8):
                    acc = UNKNOWN

            # --- flow ---
            if flow == 'illegal':
                return
            if flow in ('ret', 'stop'):
                return
            if flow == 'jphl':
                self.unresolved_jphl.add((bank, addr))
                if self.follow_jt:
                    self.resolve_jumptable(curbank, bank, addr)
                return
            if flow == 'rst':
                self.push(curbank, target, 'rst', (bank, addr))
                addr = nxt
                continue
            if flow in ('jp', 'jr'):
                self.push(curbank, target, 'loc', (bank, addr))
                return
            if flow in ('jpc', 'jrc'):
                self.push(curbank, target, 'loc', (bank, addr))
                addr = nxt
                continue
            if flow in ('call', 'callc'):
                self.push(curbank, target, 'sub', (bank, addr))
                if target < 0x4000 or curbank is not UNKNOWN:
                    self.calls[(bank, addr)].add(self.phys(curbank, target))
                addr = nxt
                continue
            addr = nxt

    # -- output ----------------------------------------------------------
    def listing(self, bank, show_data=True):
        out = []
        base = 0x0000 if bank == 0 else 0x4000
        end = base + 0x4000
        addr = base
        code = self.code[bank]
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
                out.append(f'    {start+i:04X}:              DB {hexs:<64} ; |{asc}|')
            run.clear()

        while addr < end:
            if addr in code:
                flush()
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
                sw = ''
                if key in self.switch_sites:
                    v = self.switch_sites[key]
                    sw = f'   ; ==> BANK {v:02X}' if v is not None else '   ; ==> BANK <dynamic>'
                out.append(f'    {addr:04X}: {rawh:<10} {text}{sw}')
                addr += length
            else:
                if show_data:
                    run.append((addr, self.rom.byte(bank, addr)))
                addr += 1
        flush()
        return '\n'.join(out)

    def coverage(self):
        rows = []
        for b in range(self.nbanks):
            cov = sum(l for (_, l, _) in self.code[b].values())
            rows.append((b, cov, 0x4000, 100.0 * cov / 0x4000))
        return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rom')
    ap.add_argument('--coverage', action='store_true')
    ap.add_argument('--switches', action='store_true')
    ap.add_argument('--unresolved', action='store_true')
    ap.add_argument('--entry', action='append', default=[])
    ap.add_argument('--outdir')
    ap.add_argument('--bank', type=int)
    ap.add_argument('--xrefs', action='store_true')
    ap.add_argument('--jt', action='store_true', help='follow JP HL jump tables')
    ap.add_argument('--jtlist', action='store_true')
    args = ap.parse_args()

    rom = Rom(args.rom)
    t = BankTracer(rom)
    t.follow_jt = args.jt
    t.seed_default()
    for spec in args.entry:
        b, a = spec.split(':')
        t.push(int(b, 0), int(a, 16), 'user')
    t.run()

    if args.coverage:
        print(f'{rom.title}  {rom.banks} banks')
        tot = 0
        for b, c, s, p in t.coverage():
            tot += c
            print(f'  bank {b}: {c:6d}/{s} traced as code ({p:5.1f}%)')
        print(f'  total : {tot}/{rom.banks*0x4000} ({100.0*tot/(rom.banks*0x4000):.1f}%)')

    if args.switches:
        print('\n== bank switch sites (write to $2000-$3FFF) ==')
        for (b, a), v in sorted(t.switch_sites.items()):
            vs = f'${v:02X}' if v is not None else '<dynamic>'
            print(f'  {b:02X}:{a:04X}  bank <- {vs}')

    if args.unresolved:
        print('\n== JP HL sites (computed jumps) ==')
        for b, a in sorted(t.unresolved_jphl):
            print(f'  {b:02X}:{a:04X}')
        print('\n== far calls with unknown bank ==')
        for b, a in sorted(t.unresolved_far):
            print(f'  {b:02X}:{a:04X}')

    if args.jtlist:
        print('\n== recovered jump tables ==')
        for (b, a), es in sorted(t.jumptables.items()):
            print(f'  {b:02X}:{a:04X}  {len(es)} entries: ' + ' '.join(f'{e:04X}' for e in es))

    if args.xrefs:
        print('\n== most referenced routines ==')
        rank = sorted(t.xrefs.items(), key=lambda kv: -len(kv[1]))
        for (b, a), refs in rank[:60]:
            print(f'  {b:02X}:{a:04X}  {len(refs):4d} refs  {t.labels.get((b,a),"")}')

    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)
        for b in range(rom.banks):
            p = os.path.join(args.outdir, f'bank_{b:02X}.asm')
            with open(p, 'w', encoding='utf-8') as f:
                f.write(f'; {rom.title} - bank {b:02X} (bank-aware trace)\n')
                f.write(t.listing(b))
                f.write('\n')
            print(f'wrote {p}', file=sys.stderr)

    if args.bank is not None:
        print(t.listing(args.bank))


if __name__ == '__main__':
    main()
