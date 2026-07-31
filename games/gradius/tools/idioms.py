#!/usr/bin/env python3
"""idioms.py -- byte-pattern scan of the Gradius PRG for the hardware idioms that
decide how the port must be structured.  Every hit is a byte sequence found in the
file; the interpretation is printed next to it so it can be checked by hand.

Usage: python idioms.py "Gradius (USA).nes"
"""
import sys

def main(path):
    raw = open(path, "rb").read()
    prg = raw[16:16 + raw[4] * 0x4000]
    A = lambda i: 0x8000 + i          # CPU address of PRG offset i
    hx = lambda s: " ".join(f"{b:02X}" for b in s)

    def find(pat, label):
        out = []
        for i in range(len(prg) - len(pat) + 1):
            if prg[i:i + len(pat)] == bytes(pat):
                out.append(i)
        print(f"\n--- {label}   pattern {hx(pat)}   {len(out)} hit(s)")
        for i in out:
            print(f"    ${A(i):04X}   {hx(prg[i:i+len(pat)+4])}")
        return out

    print("=== $2002 (PPUSTATUS) reads and what bit they test ===")
    for i in range(len(prg) - 5):
        if prg[i] in (0xAD, 0xAE, 0xAC, 0x2C) and prg[i+1] == 0x02 and prg[i+2] == 0x20:
            nxt = prg[i+3:i+8]
            note = ""
            if prg[i+3] == 0x29:
                m = prg[i+4]
                note = {0x80: "AND #$80 -> VBLANK flag", 0x40: "AND #$40 -> SPRITE 0 HIT",
                        0x20: "AND #$20 -> SPRITE OVERFLOW"}.get(m, f"AND #${m:02X}")
            elif prg[i+3] in (0x10, 0x30):
                note = ("BPL" if prg[i+3] == 0x10 else "BMI") + " -> tests bit7 VBLANK"
            elif prg[i+3] in (0x50, 0x70):
                note = ("BVC" if prg[i+3] == 0x50 else "BVS") + " -> tests bit6 SPRITE 0 HIT (via BIT)"
            else:
                note = "(value discarded -> resets the $2005/$2006 write toggle)"
            mn = {0xAD: "LDA", 0xAE: "LDX", 0xAC: "LDY", 0x2C: "BIT"}[prg[i]]
            print(f"  ${A(i):04X}  {mn} $2002   next={hx(nxt)}   {note}")

    print("\n=== writes into $8000-$FFFF = CNROM CHR bank register ===")
    for i in range(len(prg) - 2):
        if prg[i] in (0x8D, 0x8E, 0x8C, 0x9D, 0x99):
            t = prg[i+1] | (prg[i+2] << 8)
            if t >= 0x8000:
                mn = {0x8D: "STA", 0x8E: "STX", 0x8C: "STY", 0x9D: "STA,X", 0x99: "STA,Y"}[prg[i]]
                held = prg[t - 0x8000] if t - 0x8000 < len(prg) else None
                print(f"  ${A(i):04X}  {mn} ${t:04X}   ; byte held at ${t:04X} = "
                      f"${held:02X} (bus-conflict value)")

    print("\n=== OAM shadow page $0200 usage ===")
    for i in range(len(prg) - 2):
        t = prg[i+1] | (prg[i+2] << 8)
        if 0x0200 <= t <= 0x02FF and prg[i] in (0x8D, 0x9D, 0x99, 0xAD, 0xBD, 0xB9, 0xEE, 0xFE):
            mn = {0x8D: "STA", 0x9D: "STA,X", 0x99: "STA,Y", 0xAD: "LDA",
                  0xBD: "LDA,X", 0xB9: "LDA,Y", 0xEE: "INC", 0xFE: "INC,X"}[prg[i]]
            print(f"  ${A(i):04X}  {mn} ${t:04X}")

    find([0xA9, 0x3F], "immediate $3F (palette base high byte for $2006)")
    find([0x8C, 0x14, 0x40], "STY $4014 OAM DMA")
    find([0x8D, 0x14, 0x40], "STA $4014 OAM DMA")

    # palette-looking data: a $3F,$00 address pair inside the VRAM-update stream format
    print("\n=== $3F00/$3F10 as a literal 16-bit big-endian pair (VRAM queue address) ===")
    for i in range(len(prg) - 1):
        if prg[i] == 0x3F and prg[i+1] in (0x00, 0x10):
            print(f"    ${A(i):04X}  {hx(prg[i:i+20])}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Gradius (USA).nes")
