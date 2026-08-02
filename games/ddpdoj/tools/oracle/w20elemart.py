#!/usr/bin/env python3
r"""W20 recon: SIZE the BG-ELEMENT art -- the part of the background that is NOT
in the column stream.

Op $10 (BGELEM) constructs an object whose handler writes
    ($10,A6) = <long>     and   ($14,A6) = <word>
and whose updater ends `jsr $24179E ; jmp $23DF2A` -- the sprite enqueue.  Those
two fields are exactly the ship's ($a,A6) `offs` and ($e,A6) size word that
export-web.mjs already models (`SHIP_SIZE = 0x0620`, wide = bits 14..9, high =
bits 8..0), so each element is ONE sprite stream and can be walked and priced
with the identical model.

  python w20elemart.py [stage]

READER ONLY.
"""
from __future__ import annotations

import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import w20level as W  # noqa: E402
import w20price as P  # noqa: E402

ROM = P.ROM
SPRMASK_SIZE = 0x1000000     # bytes; REGION16_LE
SPRCOL_SIZE = 0x2000000


def region(layout, size):
    buf = bytearray(size)
    for name, off in layout:
        d = (ROM / name).read_bytes()
        buf[off:off + len(d)] = d
    return memoryview(buf)


def words(buf):
    import array
    a = array.array("H")
    a.frombytes(buf)
    return a


sprmask = words(region([("cave_b04401w064.u1", 0)], SPRMASK_SIZE))
sprcol = words(region([("cave_a04401w064.u7", 0),
                       ("cave_a04402w064.u8", 0x800000)], SPRCOL_SIZE))
MASKW, COLW = len(sprmask), len(sprcol)
POP = [bin(i).count("1") for i in range(65536)]


def walk(offs, wide, high):
    b = offs & (MASKW - 1)
    a0 = (((sprmask[(b + 1) & (MASKW - 1)] << 16) | sprmask[b & (MASKW - 1)]) >> 2)
    b += 2
    npix = 0
    for _ in range(wide * high):
        npix += 16 - POP[sprmask[b & (MASKW - 1)]]
        b += 1
    return (2 + wide * high, a0 & (COLW - 1),
            0 if npix == 0 else (npix - 1) // 3 + 1)


def elems(stage):
    T = 0x262302
    tab = W.L(T + 4 * stage)
    nxt = W.L(T + 4 * (stage + 1)) if stage < 4 else None
    out = []
    a = tab
    while True:
        h = W.L(a)
        if nxt is not None and a >= nxt:
            break
        if not (0x230000 <= h < 0x2A0000):
            break
        art = par = None
        for o in range(0, 40, 2):
            if W.W(h + o) == 0x2D7C and W.W(h + o + 6) == 0x0010:
                art = W.L(h + o + 2)
            elif W.W(h + o) == 0x3D7C and W.W(h + o + 4) == 0x0014:
                par = W.W(h + o + 2)
        out.append((h, art, par))
        a += 4
    return tab, out


for stage in ([int(sys.argv[1])] if len(sys.argv) > 1 else range(5)):
    tab, es = elems(stage)
    print(f"\nstage {stage}: element table ${tab:06X}, {len(es)} entries")
    print("  id  handler   offs(sprmask word)  size    wide high   px   "
          "maskwords  colwords   bytes")
    tm = tc = 0
    mblocks, cblocks = [], []
    for i, (h, art, par) in enumerate(es):
        if art is None or par is None:
            print(f"  {i:2d}  ${h:06X}  -- constructor not of the expected shape")
            continue
        wide, high = (par >> 9) & 0x3F, par & 0x1FF
        mw, c0, cw = walk(art, wide, high)
        tm += mw
        tc += cw
        mblocks.append((art & (MASKW - 1), mw))
        cblocks.append((c0, cw))
        print(f"  {i:2d}  ${h:06X}  ${art:07X}          ${par:04X}  "
              f"{wide:4d} {high:4d} {wide*16:4d}x{high:<4d}"
              f"{mw:8d} {cw:9d} {2*(mw+cw):8d}")
    # coalesce, exactly as export-web.mjs packs
    def coal(bl):
        r = sorted([(s, s + n) for s, n in bl if n > 0])
        out = []
        for s, e in r:
            if out and s <= out[-1][1]:
                out[-1][1] = max(out[-1][1], e)
            else:
                out.append([s, e])
        return out
    cm, cc = coal(mblocks), coal(cblocks)
    um = sum(e - s for s, e in cm)
    uc = sum(e - s for s, e in cc)
    mb = b"".join(sprmask[s:e].tobytes() for s, e in cm)
    cb = b"".join(sprcol[s:e].tobytes() for s, e in cc)
    print(f"  TOTAL mask {tm} words in {len(cm)} coalesced blocks ({um} words), "
          f"colour {tc} words in {len(cc)} blocks ({uc} words)")
    print(f"  raw {2*(um+uc):,d} B   gzip-9 "
          f"{len(zlib.compress(mb, 9)) + len(zlib.compress(cb, 9)):,d} B")
