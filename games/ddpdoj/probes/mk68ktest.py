#!/usr/bin/env python3
"""Generate a 32 KB 68000 test program for MAME capability probing.

This is OUR OWN CODE. It is not derived from any commercial ROM. It exists so that
MAME's Lua execution-hook capability can be proven on a real 68000 without needing an
arcade board image, by loading it into MAME's `megadriv` driver as a cartridge:

    mame megadriv -cart tap68k2.bin -video none -sound none -nothrottle \
         -skip_gameinfo -autoboot_delay 0 -autoboot_script probe_m68k.lua \
         -seconds_to_run 20

Two variants:
  plain   nop/nop/nop/bra.s hot loop           -> proves taps see opcode fetches
  irq     + enables the VDP vblank interrupt   -> proves vector-fetch and cpu_space taps

The generated .bin is deliberately NOT checked in; regenerate it.
"""
import struct
import sys


def build(irq: bool) -> bytearray:
    rom = bytearray(b"\x00" * 0x8000)

    def w32(o, v):
        rom[o:o + 4] = struct.pack(">I", v)

    def w16(o, v):
        rom[o:o + 2] = struct.pack(">H", v)

    w32(0x00, 0x00FF0000)                       # initial supervisor stack pointer
    for vec in range(1, 64):                    # every exception vector -> 0x200
        w32(vec * 4, 0x00000200)
    if irq:
        w32(0x78, 0x00000300)                   # level-6 autovector (vblank) -> 0x300

    rom[0x100:0x110] = b"SEGA MEGA DRIVE "
    rom[0x110:0x120] = b"(C)OWN 2026.JUL "
    rom[0x120:0x150] = b"68K TAP PROBE - OUR OWN CODE".ljust(0x30, b" ")
    rom[0x150:0x180] = b"68K TAP PROBE".ljust(0x30, b" ")
    rom[0x180:0x18E] = b"GM 00000000-00"
    w32(0x1A0, 0x00000000)                      # ROM start
    w32(0x1A4, 0x00007FFF)                      # ROM end
    rom[0x1A8:0x1AC] = b"RA\xf8\x20"
    w32(0x1AC, 0x00FF0000)                      # RAM start
    w32(0x1B0, 0x00FFFFFF)                      # RAM end
    rom[0x1F0:0x200] = b"JUE             "

    if irq:
        #   move.w #$2000,sr              enable interrupt levels 1..6
        #   move.w #$8174,($00C00004).l   VDP reg 1: display on, vblank IRQ on, mode 5
        # l: nop
        #   bra.s l
        main = bytes.fromhex("46FC2000" "33FC8174" "00C00004" "4E71" "60FC")
        #   move.w ($00C00004).l,d0       read VDP status -> acknowledges the interrupt
        #   rte
        handler = bytes.fromhex("303900C00004" "4E73")
        rom[0x300:0x300 + len(handler)] = handler
    else:
        # l: nop / nop / nop / bra.s l    four distinct fetch addresses in a tight loop
        main = bytes.fromhex("4E71" "4E71" "4E71" "60F8")

    rom[0x200:0x200 + len(main)] = main
    return rom


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "tap68k.bin"
    irq = "--irq" in sys.argv
    data = build(irq)
    with open(out, "wb") as fh:
        fh.write(data)
    print("wrote %s (%d bytes, irq=%s)" % (out, len(data), irq))
