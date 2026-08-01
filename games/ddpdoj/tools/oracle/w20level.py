#!/usr/bin/env python3
r"""W20 recon reader: enumerate the per-stage BG layout data out of the decrypted
:maincpu image, count distinct tiles, test cross-stage sharing, and price the
export.  READER ONLY -- writes nothing but stdout.

  python w20level.py tables      the five per-stage tables
  python w20level.py columns     column streams: sizes, distinct tiles, overlap
  python w20level.py script N    decode stage N's two scripts, both terminators
  python w20level.py budget      decoded/gz byte cost per stage (needs rip/assets)
"""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMAGE = HERE / "out" / "maincpu.bin"
D = IMAGE.read_bytes()

STAGE_PTR_TBL = 0x26153E   # 5 longwords -> (script0,script1) pairs
PAL_TBL       = 0x261252   # 5 longwords, per-stage BG palette block
COL_TBL       = 0x261266   # 5 longwords, per-stage BG column stream
BASE_TBL      = 0x240D62   # 5 longwords, per-stage BG tile base (added to map long)
NSTAGE = 5


def L(a: int) -> int: return struct.unpack(">I", D[a:a + 4])[0]
def W(a: int) -> int: return struct.unpack(">H", D[a:a + 2])[0]
def SW(a: int) -> int: return struct.unpack(">h", D[a:a + 2])[0]


def tables():
    print("stage  script0  script1   palette   colstream  tilebase   objstream cuestream")
    for s in range(NSTAGE):
        p = L(STAGE_PTR_TBL + s * 4)
        s0, s1 = L(p), L(p + 4)
        print(f"  {s}    ${s0:06X}  ${s1:06X}  ${L(PAL_TBL+s*4):08X}  ${L(COL_TBL+s*4):08X}  "
              f"${L(BASE_TBL+s*4):08X}  ${L(s0):06X}  ${L(s0+4):06X}")


def col_bounds():
    """stream start = COL_TBL[s], end = PAL_TBL[s] (measured adjacency)."""
    out = []
    for s in range(NSTAGE):
        a, b = L(COL_TBL + s * 4), L(PAL_TBL + s * 4)
        out.append((a, b))
    return out


def stage_tiles(s: int):
    a, b = col_bounds()[s]
    base = L(BASE_TBL + s * 4) >> 16
    n = (b - a) // 36
    tiles, attrs, raw = [], [], []
    for c in range(n):
        col = []
        for r in range(9):
            off = a + c * 36 + r * 4
            lo = L(off)
            raw.append(lo)
            t = ((lo >> 16) + base) & 0xFFFF
            at = lo & 0xFFFF
            col.append(t)
            attrs.append(at)
        tiles.append(col)
    return n, base, tiles, attrs, raw


def columns():
    allsets = {}
    tot_bytes = tot_cols = 0
    print("stage  start     end       bytes  cols  %36  base   distinct  min    max    attr-distinct")
    for s in range(NSTAGE):
        a, b = col_bounds()[s]
        n, base, tiles, attrs, raw = stage_tiles(s)
        flat = [t for c in tiles for t in c]
        st = set(flat)
        allsets[s] = st
        tot_bytes += b - a
        tot_cols += n
        print(f"  {s}   ${a:06X}  ${b:06X}  {b-a:6d}  {n:4d}   {(b-a)%36}   ${base:04X}  "
              f"{len(st):7d}  ${min(st):04X} ${max(st):04X}  {len(set(attrs))}")
    print(f"TOTAL bytes={tot_bytes} cols={tot_cols} distinct-union={len(set().union(*allsets.values()))}")
    print()
    print("PAIRWISE TILE-SET INTERSECTIONS (the sharing question)")
    print("      " + "".join(f"{j:8d}" for j in range(NSTAGE)))
    for i in range(NSTAGE):
        row = "".join(f"{len(allsets[i] & allsets[j]):8d}" for j in range(NSTAGE))
        print(f"  {i}  {row}")
    print()
    print("ATTRIBUTE WORDS (low half of each map longword), per stage, top 8")
    for s in range(NSTAGE):
        n, base, tiles, attrs, raw = stage_tiles(s)
        h = {}
        for x in attrs:
            h[x] = h.get(x, 0) + 1
        top = sorted(h.items(), key=lambda kv: -kv[1])[:8]
        print(f"  stage {s}: " + " ".join(f"{v:04X}:{c}" for v, c in top))


OPSZ = {0x00: 1, 0x04: 3, 0x08: 1, 0x0C: 0, 0x10: 3, 0x14: 1, 0x18: 1}
OPNM = {0x00: "SPAWN-N", 0x04: "REWIND/REPEAT", 0x08: "SPEED", 0x0C: "FREEZE",
        0x10: "BGELEM", 0x14: "CUE", 0x18: "FLAG"}


def walk_script(p: int, label: str, verbose=True):
    objs, cues = L(p), L(p + 4)
    a = p + 8
    recs = 0
    ops = {}
    if verbose:
        print(f"{label} ${p:06X}: header obj=${objs:06X} cue=${cues:06X}")
    while True:
        t = W(a)
        if t == 0xFFFF:
            if verbose:
                print(f"  terminator $FFFF at ${a:06X}: {recs} records, {a-(p+8)} bytes")
            break
        cond = W(a + 2)
        op = W(a + 4)
        na = OPSZ.get(op)
        if na is None:
            print(f"  !! unknown op ${op:04X} at ${a:06X} -- WALK DESYNC")
            break
        args = [W(a + 6 + 2 * i) for i in range(na)]
        ops[op] = ops.get(op, 0) + 1
        if verbose:
            print(f"  ${a:06X}  t=${t:04X} cond=${cond:04X} {OPNM[op]:<14} "
                  + " ".join(f"{x:04X}" for x in args))
        a += 6 + 2 * na
        recs += 1
    return objs, cues, recs, a + 2 - p, ops


def script(sn: int):
    p = L(STAGE_PTR_TBL + sn * 4)
    s0, s1 = L(p), L(p + 4)
    for i, sp in enumerate((s0, s1)):
        objs, cues, recs, size, ops = walk_script(sp, f"stage{sn} script{i}")
        print(f"  ops: " + " ".join(f"{OPNM[k]}x{v}" for k, v in sorted(ops.items())))
        if objs:
            print(f"  object stream ${objs:06X}:")
            q, k = objs, 0
            while L(q) != 0xFFFFFFFF:
                print(f"    [{k:2d}] ${q:06X} handler=${L(q):06X} param=${W(q+4):04X}")
                q += 6
                k += 1
            print(f"    terminator at ${q:06X}, {k} entries, {q+4-objs} bytes")
        if cues:
            print(f"  cue stream ${cues:06X}: first 16 words "
                  + " ".join(f"{W(cues+2*i):04X}" for i in range(16)))
        print()


def script_all():
    tot = 0
    for sn in range(NSTAGE):
        p = L(STAGE_PTR_TBL + sn * 4)
        for i, sp in enumerate((L(p), L(p + 4))):
            objs, cues, recs, size, ops = walk_script(sp, "", verbose=False)
            tot += size
            print(f"stage{sn} script{i} ${sp:06X}: {recs:3d} records {size:4d} B  "
                  f"obj=${objs:06X} cue=${cues:06X}  ops="
                  + " ".join(f"{OPNM[k]}x{v}" for k, v in sorted(ops.items())))
    print(f"TOTAL script bytes (records+header+terminator) = {tot}")


def budget():
    bg = (HERE.parent.parent / "rip" / "assets" / "bg.tiles.bin")
    if not bg.exists():
        raise SystemExit(f"{bg} missing -- run assets.py export")
    blob = bg.read_bytes()
    TB = 1024
    print(f"bg.tiles.bin = {len(blob)} bytes = {len(blob)//TB} tiles of {TB} B (32x32, 1 idx/byte)")
    union = set()
    rows = []
    for s in range(NSTAGE):
        n, base, tiles, attrs, raw = stage_tiles(s)
        st = sorted({t for c in tiles for t in c})
        union |= set(st)
        sheet = b"".join(blob[t * TB:(t + 1) * TB] for t in st)
        gz = len(zlib.compress(sheet, 9))
        # the map stream itself, as u16 tile numbers + u16 attrs, gz
        mapbytes = b"".join(struct.pack(">HH", ((v >> 16) + base) & 0xFFFF, v & 0xFFFF)
                            for v in raw)
        mgz = len(zlib.compress(mapbytes, 9))
        pal = D[L(PAL_TBL + s * 4):L(PAL_TBL + s * 4) + 0x800]
        pgz = len(zlib.compress(pal, 9))
        rows.append((s, len(st), len(sheet), gz, len(mapbytes), mgz, len(pal), pgz))
        print(f"stage {s}: {len(st):5d} tiles  raw={len(sheet):9,d}  gz={gz:8,d}  "
              f"map raw={len(mapbytes):6,d} gz={mgz:6,d}  pal raw={len(pal)} gz={pgz}")
    st = sorted(union)
    sheet = b"".join(blob[t * TB:(t + 1) * TB] for t in st)
    gz = len(zlib.compress(sheet, 9))
    print(f"UNION  : {len(st):5d} tiles  raw={len(sheet):9,d}  gz={gz:8,d}")
    print(f"sum-of-parts gz = {sum(r[3] for r in rows):,d}  vs union gz = {gz:,d}")
    # 4bpp nibble packing experiment: are all indices < 16?
    hi = sum(1 for b in sheet if b >= 16)
    print(f"pixels with index >= 16: {hi} of {len(sheet)}  (5bpp is real: {hi>0})")
    z = sum(1 for b in sheet if b == 0)
    print(f"pixel index 0 (transparent-ish) count: {z} = {100*z/len(sheet):.1f}%")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tables"
    if cmd == "tables":
        tables()
    elif cmd == "columns":
        columns()
    elif cmd == "script":
        script(int(sys.argv[2]))
    elif cmd == "scripts":
        script_all()
    elif cmd == "budget":
        budget()
    else:
        print(__doc__)
