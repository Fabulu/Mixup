#!/usr/bin/env python3
"""RECON 10 -- hexdump / record-dump of the decrypted :maincpu image.

  python dump.py hex 230C6C 128
  python dump.py rec 230C6C 8 40      40 records of 8 bytes, w/w/b/b/w decoded
  python dump.py w16 23170C 64        64 words
"""
import sys, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "oracle", "out", "maincpu.bin")
with open(IMG, "rb") as f:
    D = f.read()


def main():
    cmd = sys.argv[1]
    a = int(sys.argv[2], 16)
    n = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0x40
    if cmd == "hex":
        for off in range(a, a + n, 16):
            row = D[off:off + 16]
            print("%06x: %s  %s" % (off, " ".join("%02x" % b for b in row),
                                    "".join(chr(b) if 32 <= b < 127 else "." for b in row)))
    elif cmd == "rec":
        stride = n
        cnt = int(sys.argv[4], 16)
        for i in range(cnt):
            off = a + i * stride
            row = D[off:off + stride]
            hx = " ".join("%02x" % b for b in row)
            w0 = struct.unpack_from(">H", D, off)[0]
            w1 = struct.unpack_from(">H", D, off + 2)[0]
            b4 = D[off + 4]
            b5 = D[off + 5]
            w6 = struct.unpack_from(">H", D, off + 6)[0]
            print("[%3d] %06x: %-24s trig=%5d(%04x) w2=%04x d0=%02x d1=%02x idx=%03x"
                  % (i, off, hx, w0 if w0 < 0x8000 else w0 - 0x10000, w0, w1, b4, b5, w6 & 0xFFF))
            if w0 == 0xFFFF:
                print("      -- terminator --")
                break
    elif cmd == "w16":
        for i in range(0, n, 8):
            vals = struct.unpack_from(">8H", D, a + i * 2)
            print("%06x: %s" % (a + i * 2, " ".join("%04x" % v for v in vals)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
