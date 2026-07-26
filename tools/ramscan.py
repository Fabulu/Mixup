#!/usr/bin/env python3
"""RAM access scanner for the Batman: Return of the Joker disassembly.

Runs the bank-aware tracer (tools/banktrace.py) over the ROM, then walks every
decoded instruction and records each WRAM ($C000-$DFFF) / HRAM ($FF80-$FFFE) /
OAM ($FE00-$FE9F) / IO ($FF00-$FF7F) access with a read/write direction and the
site that performs it.

Three classes of access are recognised:

  direct    LDH [a8],A / LDH A,[a8] / LD [a16],A / LD A,[a16]
            -- unambiguous, direction known from the opcode.

  pointer   LD HL,nnnn (or DE/BC) followed by (HL)/(DE)/(BC) accesses in the
            same straight-line block.  A tiny constant-propagation pass tracks
            HL/DE/BC while they stay constant (INC/DEC rr, LD A,[HL+] etc. move
            the cursor) and attributes each dereference to a concrete address.
            Stops at any instruction that clobbers the register, at a CALL, or
            at a control-flow join.

  immediate LD rr,nnnn where nnnn looks like RAM but the register is never
            dereferenced before being clobbered.  These are usually numeric
            constants (e.g. LD BC,$FFF0 == -16) and are reported separately so
            they can be filtered out -- see recon-1 section 6.2.

Usage:
    python tools/ramscan.py "<rom>"                     # full report
    python tools/ramscan.py "<rom>" --range C000 C100   # only that window
    python tools/ramscan.py "<rom>" --addr FF8A         # one address, all sites
    python tools/ramscan.py "<rom>" --csv out.csv
    python tools/ramscan.py "<rom>" --immediates        # show the false-positive class
"""
import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbdis import Rom, IO_REGS                      # noqa: E402
from banktrace import BankTracer                    # noqa: E402


def is_ram(v):
    return (0xC000 <= v <= 0xDFFF) or (0xFE00 <= v <= 0xFE9F) or (0xFF80 <= v <= 0xFFFE)


def is_hw(v):
    return 0xFF00 <= v <= 0xFF7F or v == 0xFFFF


def classify(v):
    if 0xC000 <= v <= 0xDFFF:
        return 'WRAM'
    if 0xFE00 <= v <= 0xFE9F:
        return 'OAM'
    if 0xFF80 <= v <= 0xFFFE:
        return 'HRAM'
    if 0xFF00 <= v <= 0xFF7F or v == 0xFFFF:
        return 'IO'
    return None


class Access:
    __slots__ = ('addr', 'bank', 'site', 'rw', 'kind', 'text')

    def __init__(self, addr, bank, site, rw, kind, text):
        self.addr, self.bank, self.site = addr, bank, site
        self.rw, self.kind, self.text = rw, kind, text


# opcodes that dereference (HL) as source (read) / dest (write)
HL_READ = set()
HL_WRITE = set()
for _d in range(8):
    for _s in range(8):
        _op = 0x40 + _d * 8 + _s
        if _op == 0x76:
            continue
        if _s == 6:
            HL_READ.add(_op)
        if _d == 6:
            HL_WRITE.add(_op)
for _a in range(8):
    HL_READ.add(0x86 + _a * 8)          # ALU A,(HL)
HL_READ.add(0x34)                       # INC (HL)  -- read+write
HL_READ.add(0x35)                       # DEC (HL)
HL_WRITE.add(0x34)
HL_WRITE.add(0x35)
HL_WRITE.add(0x36)                      # LD (HL),d8


class Scanner:
    def __init__(self, rom):
        self.rom = rom
        self.t = BankTracer(rom)
        self.t.follow_jt = True
        self.t.seed_default()
        self.t.run()
        self.acc = []                       # list[Access]
        self.immediates = defaultdict(set)  # value -> {(bank,addr)}
        self.imm_total = defaultdict(int)

    # ---- main walk ----------------------------------------------------
    def scan(self):
        for bank, code in self.t.code.items():
            addrs = sorted(code)
            index = {a: i for i, a in enumerate(addrs)}
            for a in addrs:
                self.scan_at(bank, code, addrs, index, a)

    def scan_at(self, bank, code, addrs, index, a):
        text, length, raw = code[a]
        op = raw[0]
        site = (bank, a)

        if op == 0xE0:                                  # LDH [a8],A
            self.add(0xFF00 | raw[1], bank, site, 'W', 'direct', text)
        elif op == 0xF0:                                # LDH A,[a8]
            self.add(0xFF00 | raw[1], bank, site, 'R', 'direct', text)
        elif op == 0xEA:                                # LD [a16],A
            v = raw[1] | (raw[2] << 8)
            if is_ram(v) or is_hw(v):
                self.add(v, bank, site, 'W', 'direct', text)
        elif op == 0xFA:                                # LD A,[a16]
            v = raw[1] | (raw[2] << 8)
            if is_ram(v) or is_hw(v):
                self.add(v, bank, site, 'R', 'direct', text)
        elif op == 0x08:                                # LD [a16],SP
            v = raw[1] | (raw[2] << 8)
            if is_ram(v):
                self.add(v, bank, site, 'W', 'direct', text)
        elif op in (0x01, 0x11, 0x21, 0x31):            # LD rr,d16
            v = raw[1] | (raw[2] << 8)
            if is_ram(v) or is_hw(v):
                self.follow_pointer(bank, code, addrs, index, a, op, v)

    def add(self, addr, bank, site, rw, kind, text):
        self.acc.append(Access(addr, bank, site, rw, kind, text))

    # ---- pointer following ---------------------------------------------
    def follow_pointer(self, bank, code, addrs, index, a, ldop, base, limit=48):
        """Walk forward from `LD rr,base` tracking rr while it is a known
        constant.  Every dereference is attributed to the current value."""
        reg = {0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP'}[ldop]
        site0 = (bank, a)
        cur = base
        used = False
        i = index[a] + 1
        n = 0
        if reg == 'SP':
            # LD SP,addr is the fast-fill idiom; treat as a bulk write marker.
            self.add(base, bank, site0, 'W', 'sp-fill', code[a][0])
            return
        while n < limit and i < len(addrs):
            ad = addrs[i]
            # require contiguity: if there is a gap the block was not straight line
            prev = addrs[i - 1]
            if prev + code[prev][1] != ad:
                break
            text, length, raw = code[ad]
            op = raw[0]
            site = (bank, ad)
            n += 1
            i += 1

            if reg == 'HL':
                if op in HL_READ or op in HL_WRITE:
                    if op in HL_READ:
                        self.add(cur, bank, site, 'R', 'ptr', text)
                        used = True
                    if op in HL_WRITE:
                        self.add(cur, bank, site, 'W', 'ptr', text)
                        used = True
                    continue
                if op == 0x2A:                       # LD A,[HL+]
                    self.add(cur, bank, site, 'R', 'ptr', text); used = True
                    cur = (cur + 1) & 0xFFFF; continue
                if op == 0x3A:                       # LD A,[HL-]
                    self.add(cur, bank, site, 'R', 'ptr', text); used = True
                    cur = (cur - 1) & 0xFFFF; continue
                if op == 0x22:                       # LD [HL+],A
                    self.add(cur, bank, site, 'W', 'ptr', text); used = True
                    cur = (cur + 1) & 0xFFFF; continue
                if op == 0x32:                       # LD [HL-],A
                    self.add(cur, bank, site, 'W', 'ptr', text); used = True
                    cur = (cur - 1) & 0xFFFF; continue
                if op == 0x23:
                    cur = (cur + 1) & 0xFFFF; continue
                if op == 0x2B:
                    cur = (cur - 1) & 0xFFFF; continue
                if op == 0xCB:                       # CB on (HL)
                    cb = raw[1]
                    if (cb & 7) == 6:
                        grp = cb >> 6
                        self.add(cur, bank, site, 'R' if grp == 1 else 'W', 'ptr', text)
                        used = True
                    continue
                # clobbers HL
                if op in (0x21, 0x09, 0x19, 0x29, 0x39, 0xE1, 0xF8, 0xE9) \
                        or op in (0x26, 0x2E) or (0x60 <= op <= 0x6F) \
                        or (0x67 == op) or op == 0xF9 or op == 0xE7 \
                        or op in (0x24, 0x25, 0x2C, 0x2D) or op == 0xEF:
                    break
                if op in (0xCD, 0xC4, 0xCC, 0xD4, 0xDC):   # CALL
                    break
            elif reg == 'DE':
                if op == 0x1A:
                    self.add(cur, bank, site, 'R', 'ptr', text); used = True; continue
                if op == 0x12:
                    self.add(cur, bank, site, 'W', 'ptr', text); used = True; continue
                if op == 0x13:
                    cur = (cur + 1) & 0xFFFF; continue
                if op == 0x1B:
                    cur = (cur - 1) & 0xFFFF; continue
                if op in (0x11, 0xD1, 0xEB, 0x16, 0x1E, 0xF7) \
                        or (0x50 <= op <= 0x5F) or (0x14, 0x15, 0x1C, 0x1D).count(op):
                    break
                if op in (0xCD, 0xC4, 0xCC, 0xD4, 0xDC):
                    break
            else:  # BC
                if op == 0x0A:
                    self.add(cur, bank, site, 'R', 'ptr', text); used = True; continue
                if op == 0x02:
                    self.add(cur, bank, site, 'W', 'ptr', text); used = True; continue
                if op == 0x03:
                    cur = (cur + 1) & 0xFFFF; continue
                if op == 0x0B:
                    cur = (cur - 1) & 0xFFFF; continue
                if op in (0x01, 0xC1, 0x06, 0x0E, 0xFF) or (0x40 <= op <= 0x4F) \
                        or op in (0x04, 0x05, 0x0C, 0x0D, 0x09):
                    break
                if op in (0xCD, 0xC4, 0xCC, 0xD4, 0xDC):
                    break
            # flow-ending opcodes
            if op in (0xC9, 0xD9, 0xC3, 0x18, 0xE9, 0x76, 0x10):
                break
        if not used:
            self.immediates[base].add(site0)
            self.imm_total[base] += 1

    # ---- reporting ------------------------------------------------------
    def by_addr(self):
        m = defaultdict(lambda: {'R': [], 'W': []})
        for x in self.acc:
            m[x.addr][x.rw if x.rw in 'RW' else 'W'].append(x)
        return m


def fmt_sites(items, maxn=8):
    s = sorted({(x.bank, x.site[1]) for x in items})
    out = ', '.join(f'{b:02X}:{a:04X}' for b, a in s[:maxn])
    if len(s) > maxn:
        out += f' (+{len(s)-maxn})'
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rom')
    ap.add_argument('--range', nargs=2, metavar=('LO', 'HI'))
    ap.add_argument('--addr', action='append', default=[])
    ap.add_argument('--csv')
    ap.add_argument('--immediates', action='store_true')
    ap.add_argument('--maxsites', type=int, default=8)
    ap.add_argument('--region', choices=['WRAM', 'HRAM', 'OAM', 'IO'])
    args = ap.parse_args()

    sc = Scanner(Rom(args.rom))
    sc.scan()
    m = sc.by_addr()

    lo, hi = 0x0000, 0xFFFF
    if args.range:
        lo, hi = int(args.range[0], 16), int(args.range[1], 16)
    want = {int(x, 16) for x in args.addr} if args.addr else None

    if args.csv:
        with open(args.csv, 'w', encoding='utf-8') as f:
            f.write('addr,region,reads,writes,read_sites,write_sites\n')
            for a in sorted(m):
                d = m[a]
                f.write(f'{a:04X},{classify(a)},{len(d["R"])},{len(d["W"])},'
                        f'"{fmt_sites(d["R"], 99)}","{fmt_sites(d["W"], 99)}"\n')
        print(f'wrote {args.csv}', file=sys.stderr)

    print(f'{"addr":>6} {"reg":<5} {"R":>4} {"W":>4}  sites')
    for a in sorted(m):
        if not (lo <= a <= hi):
            continue
        if want and a not in want:
            continue
        reg = classify(a)
        if args.region and reg != args.region:
            continue
        d = m[a]
        nm = IO_REGS.get(a, '')
        head = f'${a:04X} {reg or "":<5} {len(d["R"]):4d} {len(d["W"]):4d}  {nm}'
        print(head)
        if d['R']:
            print(f'        R: {fmt_sites(d["R"], args.maxsites)}')
        if d['W']:
            print(f'        W: {fmt_sites(d["W"], args.maxsites)}')

    if args.immediates:
        print('\n== LD rr,nnnn with a RAM-looking immediate that is never dereferenced ==')
        print('   (numeric constants / false positives)')
        for v in sorted(sc.immediates):
            sites = sorted(sc.immediates[v])
            print(f'  ${v:04X}  {len(sites):3d}x  ' +
                  ', '.join(f'{b:02X}:{a:04X}' for b, a in sites[:6]))


if __name__ == '__main__':
    main()
