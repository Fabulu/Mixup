#!/usr/bin/env python3
r"""W20 recon: PRICE the background layout export, and answer the sharing
question by TILE CONTENT rather than by tile number.  READER ONLY -- writes
nothing but stdout (and, with `--dump`, files under rip/ which is gitignored).

  python w20price.py verify        re-decode tiles from the ROM region and check
                                   rip/assets/bg.tiles.bin agrees (red-validated)
  python w20price.py share         cross-stage sharing by CONTENT HASH, not index
  python w20price.py price         whole-stage export weight, gzip -9, per stage
  python w20price.py shard N K     stage N sliced into shards of K map columns
  python w20price.py elem N        the BG-element art tables for stage N

Encoding priced here is EXACTLY the one games/ddpdoj/tools/export-web.mjs ships:
BG tiles DECODED to one byte per pixel (32x32 = 1024 B/tile), tile-number side
table as u16, everything gzip level 9.
"""
from __future__ import annotations

import hashlib
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import w20level as W  # noqa: E402

HERE = Path(__file__).resolve().parent
GAME = HERE.parent.parent
ROM = GAME / "rip" / "rom"
ASSETS = GAME / "rip" / "assets"

TB = 1024          # decoded bytes per 32x32 BG tile
PACKED = 640       # packed bytes per 32x32 5bpp BG tile

# ---- the igs023 region, assembled exactly as pgm.cpp ROM_START(ddpdojblk) ----
IGS023_SIZE = 0xA00000
IGS023_LAYOUT = [("pgm_t01s.rom", 0x000000), ("cave_t04401w064.u19", 0x180000)]


def igs023():
    buf = bytearray(IGS023_SIZE)
    for name, off in IGS023_LAYOUT:
        d = (ROM / name).read_bytes()
        buf[off:off + len(d)] = d
    return bytes(buf)


def decode_bg(region, n, out):
    """32x32, 5bpp, LSB-first plain bitstream, 640 B/tile (00-recon-assets.md)."""
    base = n * PACKED * 8            # in bits
    for y in range(32):
        rb = base + y * 160
        for x in range(32):
            b = rb + x * 5
            byi, bit = b >> 3, b & 7
            v = (region[byi] | (region[byi + 1] << 8)) >> bit
            out[y * 32 + x] = v & 0x1F
    return out


def sheet_bytes():
    p = ASSETS / "bg.tiles.bin"
    if not p.exists():
        raise SystemExit(f"{p} missing -- run: python games/ddpdoj/tools/assets.py export")
    return p.read_bytes()


def cmd_verify():
    """The decoded sheet on disk must equal a from-ROM decode.  Red-validated."""
    blob = sheet_bytes()
    reg = igs023()
    print(f"rip/assets/bg.tiles.bin = {len(blob)} B = {len(blob)//TB} tiles")
    print(f"igs023 region assembled  = {len(reg)} B")
    import random
    random.seed(20)
    tiles = [0x0AA9, 0x11C6, 0x12AA, 0x1891, 0x1AAA, 0x1BA5, 0x1EAA, 0x260B,
             0x26AA, 0x2F85] + [random.randrange(0, 0x3000) for _ in range(90)]
    out = bytearray(TB)
    bad = 0
    for t in tiles:
        decode_bg(reg, t, out)
        if bytes(out) != blob[t * TB:(t + 1) * TB]:
            bad += 1
    print(f"  {len(tiles)} tiles re-decoded from the ROM: {len(tiles)-bad} match, {bad} differ")
    # RED: the same check with the plane weights reversed must FAIL
    def decode_rev(n, o):
        base = n * PACKED * 8
        for y in range(32):
            for x in range(32):
                b = base + y * 160 + x * 5
                byi, bit = b >> 3, b & 7
                v = (reg[byi] | (reg[byi + 1] << 8)) >> bit
                v &= 0x1F
                o[y * 32 + x] = int(f"{v:05b}"[::-1], 2)
        return o
    badr = sum(1 for t in tiles
               if bytes(decode_rev(t, bytearray(TB))) != blob[t * TB:(t + 1) * TB])
    print(f"  RED (5-bit plane order reversed): {len(tiles)-badr} match, {badr} differ")


def stage_sets():
    out = []
    for s in range(W.NSTAGE):
        n, base, tiles, attrs, raw = W.stage_tiles(s)
        flat = [t for c in tiles for t in c]
        out.append((n, base, tiles, flat, sorted(set(flat)), raw))
    return out


def cmd_share():
    blob = sheet_bytes()
    st = stage_sets()
    print("CONTENT HASHES -- two tile NUMBERS with the same 1024 decoded bytes are")
    print("the same picture, wherever they sit in the ROM.\n")
    h = {}
    for s, (n, base, tiles, flat, uniq, raw) in enumerate(st):
        for t in uniq:
            h.setdefault(s, {})[t] = hashlib.blake2b(
                blob[t * TB:(t + 1) * TB], digest_size=16).digest()
    hs = {s: set(v.values()) for s, v in h.items()}
    print("       " + "".join(f"{j:>9}" for j in range(W.NSTAGE)) + "   distinct-content")
    for i in range(W.NSTAGE):
        row = "".join(f"{len(hs[i] & hs[j]):9d}" for j in range(W.NSTAGE))
        print(f"  {i}  {row}    {len(hs[i]):5d} of {len(h[i]):5d} numbers")
    union_n = set()
    union_h = set()
    for s in range(W.NSTAGE):
        union_n |= set(h[s].keys())
        union_h |= hs[s]
    print(f"\n  union by NUMBER  : {len(union_n)}")
    print(f"  union by CONTENT : {len(union_h)}")
    print(f"  sum of per-stage content sets: {sum(len(hs[s]) for s in range(5))}")
    print(f"  => cross-stage duplicate pictures: "
          f"{sum(len(hs[s]) for s in range(5)) - len(union_h)}")
    # how much of the duplication is the BLANK tile?
    blank = hashlib.blake2b(bytes(TB), digest_size=16).digest()
    inb = [s for s in range(5) if blank in hs[s]]
    print(f"  the all-zero (index 0) tile appears in stages: {inb}")
    # is each stage's tile-number range contiguous?
    print("\nCONTIGUITY of each stage's tile-number range (are these tile BANKS?)")
    for s, (n, base, tiles, flat, uniq, raw) in enumerate(st):
        span = uniq[-1] - uniq[0] + 1
        holes = span - len(uniq)
        print(f"  stage {s}: ${uniq[0]:04X}..${uniq[-1]:04X} span {span:5d}, "
              f"used {len(uniq):5d}, holes {holes:4d} "
              f"({100*len(uniq)/span:.1f} % of the span used)")
    print("\nGAPS BETWEEN CONSECUTIVE STAGE RANGES (unused tile numbers between banks)")
    ends = [(st[s][4][0], st[s][4][-1]) for s in range(5)]
    for s in range(4):
        print(f"  stage{s} ends ${ends[s][1]:04X} -> stage{s+1} starts "
              f"${ends[s+1][0]:04X}   gap {ends[s+1][0]-ends[s][1]-1}")


def gz(b):
    return len(zlib.compress(b, 9))


def price_stage(blob, s, uniq, raw, base):
    sheet = b"".join(blob[t * TB:(t + 1) * TB] for t in uniq)
    tileno = struct.pack(f"<{len(uniq)}H", *uniq)
    # the map: u16 tile number + u16 attr per entry, exactly what a port needs
    mp = b"".join(struct.pack("<HH", ((v >> 16) + base) & 0xFFFF, v & 0xFFFF)
                  for v in raw)
    pal = W.D[W.L(W.PAL_TBL + s * 4):W.L(W.PAL_TBL + s * 4) + 0x800]
    return {
        "tiles": len(uniq),
        "sheet_raw": len(sheet), "sheet_gz": gz(sheet),
        "tileno_raw": len(tileno), "tileno_gz": gz(tileno),
        "map_raw": len(mp), "map_gz": gz(mp),
        "pal_raw": len(pal), "pal_gz": gz(pal),
    }


def cmd_price():
    blob = sheet_bytes()
    st = stage_sets()
    print("PER-STAGE BG EXPORT, encoded exactly as export-web.mjs encodes "
          "(decoded 1 B/px, gzip -9)\n")
    print("stage  tiles   sheet raw    sheet gz    map raw  map gz  tileno gz  "
          "pal gz   TOTAL gz   KiB")
    tot = 0
    rows = []
    for s, (n, base, tiles, flat, uniq, raw) in enumerate(st):
        r = price_stage(blob, s, uniq, raw, base)
        t = r["sheet_gz"] + r["map_gz"] + r["tileno_gz"] + r["pal_gz"]
        tot += t
        rows.append((s, r, t))
        print(f"  {s}   {r['tiles']:5d}  {r['sheet_raw']:10,d}  {r['sheet_gz']:10,d}  "
              f"{r['map_raw']:8,d} {r['map_gz']:7,d}  {r['tileno_gz']:8,d}  "
              f"{r['pal_gz']:6,d}  {t:9,d}  {t/1024:7.1f}")
    print(f"  ALL 5 STAGES                                                        "
          f"        {tot:9,d}  {tot/1024:7.1f}")
    print()
    # bytes per tile, the number that drives every projection below
    for s, r, t in rows:
        print(f"  stage {s}: {r['sheet_gz']/r['tiles']:6.1f} gz bytes per tile "
              f"({r['sheet_gz']/r['sheet_raw']*100:.1f} % of raw)")


def cmd_encodings():
    """Price the stage-1 sheet under every container that is actually available
    to a browser page, so the 653 KiB headline can be argued with."""
    try:
        import brotli  # noqa
        have_br = True
    except Exception:
        have_br = False
    blob = sheet_bytes()
    reg = igs023()
    st = stage_sets()
    print("stage  form                       raw        gzip-9     brotli-11")
    for s, (n, base, tiles, flat, uniq, raw) in enumerate(st):
        dec = b"".join(blob[t * TB:(t + 1) * TB] for t in uniq)
        pk = b"".join(reg[t * PACKED:(t + 1) * PACKED] for t in uniq)
        # PLANAR: five 1-bit planes per tile, MSB-first inside a byte
        pl = bytearray()
        for t in uniq:
            tile = blob[t * TB:(t + 1) * TB]
            for p in range(5):
                acc = 0
                nb = 0
                for i in range(TB):
                    acc = (acc << 1) | ((tile[i] >> p) & 1)
                    nb += 1
                    if nb == 8:
                        pl.append(acc)
                        acc = nb = 0
        pl = bytes(pl)
        for nm, b in (("decoded 1 B/px", dec), ("packed 5bpp (ROM)", pk),
                      ("planar 5x1bpp", pl)):
            br = "-"
            if have_br:
                import brotli
                br = f"{len(brotli.compress(b, quality=11)):,d}"
            print(f"  {s}   {nm:<22} {len(b):10,d} {gz(b):10,d} {br:>12}")
        print()


def cmd_shard(stage, k):
    blob = sheet_bytes()
    n, base, tiles, attrs, raw = W.stage_tiles(stage)
    print(f"stage {stage}: {n} map columns, sharded every {k} columns\n")
    print("shard  cols        tiles  new-tiles  sheet gz  map gz  TOTAL gz    KiB")
    seen = set()
    tot = 0
    for i in range(0, n, k):
        cols = tiles[i:i + k]
        uniq = sorted({t for c in cols for t in c})
        new = [t for t in uniq if t not in seen]
        seen.update(uniq)
        sheet = b"".join(blob[t * TB:(t + 1) * TB] for t in new)
        mp = b"".join(struct.pack("<HH", ((v >> 16) + base) & 0xFFFF, v & 0xFFFF)
                      for v in raw[i * 9:(i + k) * 9])
        g = gz(sheet) if new else 0
        m = gz(mp)
        tot += g + m
        print(f"  {i//k:2d}   {i:3d}..{min(i+k, n)-1:3d}  {len(uniq):5d}  "
              f"{len(new):9d}  {g:8,d}  {m:6,d}  {g+m:8,d}  {(g+m)/1024:6.1f}")
    print(f"  TOTAL over {(n+k-1)//k} shards: {tot:,d} B = {tot/1024:.1f} KiB "
          f"(one-shot whole-stage was priced by `price`)")


def cmd_elem(stage):
    """The BG-element handlers' art pointers.  $2623A4-shaped constructors:
       move.l #TABLE,($10,A6) / move.w #P,($14,A6) / move.l #UPD,($8,A6)"""
    T_ELEM = 0x262302
    tab = W.L(T_ELEM + 4 * stage)
    # the table is bounded by the next stage's table
    nxt = W.L(T_ELEM + 4 * (stage + 1)) if stage < 4 else None
    ents = []
    a = tab
    while True:
        v = W.L(a)
        if nxt is not None and a >= nxt:
            break
        if not (0x230000 <= v < 0x2A0000):
            break
        ents.append(v)
        a += 4
    print(f"stage {stage}: element table ${tab:06X}, {len(ents)} entries")
    for i, h in enumerate(ents):
        # scan the first 32 bytes for `move.l #imm,($10,A6)` = 2D7C xxxxxxxx 0010
        art = par = upd = None
        for o in range(0, 40, 2):
            if W.W(h + o) == 0x2D7C:
                imm, dsp = W.L(h + o + 2), W.W(h + o + 6)
                if dsp == 0x0010:
                    art = imm
                elif dsp == 0x0008:
                    upd = imm
            elif W.W(h + o) == 0x3D7C and W.W(h + o + 4) == 0x0014:
                par = W.W(h + o + 2)
        print(f"  id {i:2d}  handler ${h:06X}  art=${art:06X}" if art else
              f"  id {i:2d}  handler ${h:06X}  art=?", end="")
        print(f"  param=${par:04X}" if par is not None else "  param=?", end="")
        print(f"  updater=${upd:06X}" if upd else "  updater=?")
    arts = sorted({a for a in (None,) if a})
    return ents


# ---------------------------------------------------------------------------
# WAVE 20: the TWO EXTRA BG map painters found by the whole-stage measurement.
# Neither goes through the scroll VM's column stream, and both use a tile base
# of their own that no per-stage table mentions.
#
#   $26C220  type $1C's handler ($267904 -> init $26C1C2 / handler $26C20C):
#            23 columns x 9 rows from $227AF8, base $32A90000, painted into ring
#            columns 47.. (or 41.. when $803926 == 0), EVERY frame the object
#            lives while $8130CE != $105.
#   $25BB6C  14 columns x 7 rows from $2302E0, base $36A90000, into ring column
#            0 -- one whole 448x224 screen, the pre-stage page.
#
# The 23 columns at $227AF8 are stream columns 224..246 of the SAME region the
# scroll VM reads -- i.e. 23 of the 24 "unreachable tail" columns
# 20-recon-scroll-engine.md flagged.  They are not unreachable.  They are a
# different map with a different base.

EXTRA = [
    ("second map  type $1C  $26C220", 0x227AF8, 23, 9, 0x32A9),
    ("pre-stage screen  $25BB6C",     0x2302E0, 14, 7, 0x36A9),
]


def cmd_extra():
    blob = sheet_bytes()
    st = stage_sets()
    for name, src, nc, nr, tb in EXTRA:
        ents = []
        for i in range(nc * nr):
            v = W.L(src + 4 * i)
            ents.append((((v >> 16) + tb) & 0xFFFF, v & 0xFFFF))
        uniq = sorted({t for t, a in ents})
        sheet = b"".join(blob[t * TB:(t + 1) * TB] for t in uniq)
        mp = b"".join(struct.pack(">HH", t, a) for t, a in ents)
        print(f"{name}")
        print(f"  stream ${src:06X}..${src + 4*len(ents) - 1:06X} = {4*len(ents)} B, "
              f"{nc}x{nr} = {len(ents)} entries, {len(uniq)} distinct tiles "
              f"${uniq[0]:04X}..${uniq[-1]:04X}")
        print(f"  tiles raw {len(sheet):,d}  gz {gz(sheet):,d}   map gz {gz(mp)}")
        h = {hashlib.blake2b(blob[t * TB:(t + 1) * TB], digest_size=16).digest()
             for t in uniq}
        for s in range(5):
            o = {hashlib.blake2b(blob[t * TB:(t + 1) * TB], digest_size=16).digest()
                 for t in st[s][4]}
            print(f"    content shared with stage {s}: {len(h & o)}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "price"
    if cmd == "verify":
        cmd_verify()
    elif cmd == "share":
        cmd_share()
    elif cmd == "extra":
        cmd_extra()
    elif cmd == "encodings":
        cmd_encodings()
    elif cmd == "price":
        cmd_price()
    elif cmd == "shard":
        cmd_shard(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "elem":
        cmd_elem(int(sys.argv[2]))
    else:
        print(__doc__)