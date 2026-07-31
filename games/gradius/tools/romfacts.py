#!/usr/bin/env python3
"""romfacts.py -- parse the iNES/NES2.0 header and scan the PRG for the hardware
idioms the port has to model.  Reads the cartridge; writes nothing.

Usage:  python romfacts.py "Gradius (USA).nes"

Nothing here is inferred: every line printed is a byte that was read out of the file.
CPU address of PRG file offset f is  0x8000 + (f - 16)   (mapper 3: no PRG banking,
all 32 KB is fixed at $8000-$FFFF, so an address is an address).
"""
import sys, hashlib, zlib, collections

MMIO = {
    0x2000: "PPUCTRL", 0x2001: "PPUMASK", 0x2002: "PPUSTATUS", 0x2003: "OAMADDR",
    0x2004: "OAMDATA", 0x2005: "PPUSCROLL", 0x2006: "PPUADDR", 0x2007: "PPUDATA",
    0x4014: "OAMDMA", 0x4016: "JOY1", 0x4017: "JOY2/FRAMECTR",
}

def main(path):
    raw = open(path, "rb").read()
    print(f"file                {path}")
    print(f"size                {len(raw)} bytes")
    print(f"sha1                {hashlib.sha1(raw).hexdigest()}")
    print(f"crc32               {zlib.crc32(raw) & 0xffffffff:08x}")
    h = raw[:16]
    print(f"header              {' '.join(f'{b:02X}' for b in h)}")
    assert h[:4] == b"NES\x1a", "not an iNES file"
    prg16 = h[4]; chr8 = h[5]; f6 = h[6]; f7 = h[7]
    nes2 = (f7 & 0x0C) == 0x08
    mapper = (f6 >> 4) | (f7 & 0xF0)
    print(f"format              {'NES 2.0' if nes2 else 'iNES 1.0'}   (flags7 bits2-3 = {(f7>>2)&3})")
    print(f"PRG                 {prg16} x 16 KB = {prg16*16} KB")
    print(f"CHR                 {chr8} x 8 KB  = {chr8*8} KB   ({chr8} switchable CNROM banks)")
    print(f"mapper              {mapper}")
    if nes2:
        print(f"submapper           {h[8] >> 4}    (mapper 3 submapper 2 = BUS CONFLICTS)")
        print(f"timing byte 12      0x{h[12]:02X}  (0 = NTSC/RP2C02)")
        print(f"expansion byte 15   0x{h[15]:02X}")
    print(f"mirroring           {'vertical' if f6 & 1 else 'horizontal'}   (flags6 bit0 = {f6&1})")
    print(f"battery             {'yes' if f6 & 2 else 'no'}")
    print(f"trainer             {'yes' if f6 & 4 else 'no'}")

    prg = raw[16:16 + prg16 * 0x4000]
    chr_ = raw[16 + prg16 * 0x4000:]
    print(f"PRG bytes           {len(prg)}   CHR bytes {len(chr_)}")
    # two 16 KB halves identical?
    if prg16 == 2:
        a, b = prg[:0x4000], prg[0x4000:]
        print(f"PRG halves identical? {a == b}")

    def cpu(off):  # file offset within prg -> CPU address
        return 0x8000 + off

    print()
    print("=== vectors (last 6 bytes of PRG) ===")
    for name, off in (("NMI", 0x7FFA), ("RESET", 0x7FFC), ("IRQ/BRK", 0x7FFE)):
        v = prg[off] | (prg[off + 1] << 8)
        print(f"  {name:8s} ${v:04X}")

    print()
    print("=== absolute accesses to PPU / OAM-DMA / joypad registers ===")
    # opcode table for absolute-addressed instructions we care about
    absops = {0xAD: "LDA", 0x8D: "STA", 0x2C: "BIT", 0xAE: "LDX", 0x8E: "STX",
              0xAC: "LDY", 0x8C: "STY", 0xCD: "CMP", 0x0D: "ORA", 0x2D: "AND",
              0x4D: "EOR", 0x6D: "ADC", 0xED: "SBC", 0xEE: "INC", 0xCE: "DEC",
              0xBD: "LDA,X", 0x9D: "STA,X", 0xB9: "LDA,Y", 0x99: "STA,Y",
              0xBC: "LDY,X", 0xBE: "LDX,Y", 0x1D: "ORA,X", 0x3D: "AND,X",
              0xDD: "CMP,X", 0xFE: "INC,X"}
    hits = collections.defaultdict(list)
    for i in range(len(prg) - 2):
        op = prg[i]
        if op not in absops:
            continue
        tgt = prg[i + 1] | (prg[i + 2] << 8)
        if tgt in MMIO:
            hits[tgt].append((cpu(i), absops[op]))
    for reg in sorted(MMIO):
        lst = hits.get(reg, [])
        print(f"  ${reg:04X} {MMIO[reg]:14s} {len(lst):4d} access(es)")
        for addr, mn in lst:
            print(f"        ${addr:04X}  {mn} ${reg:04X}")
    return prg


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Gradius (USA).nes")
