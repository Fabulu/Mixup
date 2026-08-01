#!/usr/bin/env python3
"""RECON 20 -- the aim, transcribed from the listing, and diffed against the
cartridge row by row.

THE FUNCTION ($24203E, the 64-direction core).  Pure: registers in, register
out, three PC-relative ROM tables, no globals, no RAM.

    aim64(shooterY, shooterX, targetY, targetX) -> 0..63

  usage:
    python aimmodel.py tables                 dump the three tables
    python aimmodel.py check out/mv.tsv       diff the model against a run
    python aimmodel.py sweep                  the model's own exhaustive census
"""
import struct, sys, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMG = HERE.parent / "oracle" / "out" / "maincpu.bin"
_d = IMG.read_bytes()

LUT64  = list(_d[0x2420F6:0x2420F6 + 129])          # $2420F6, 129 bytes
BASE64 = [struct.unpack_from(">H", _d, 0x2420E6 + 2 * i)[0] for i in range(8)]
OPS64  = [struct.unpack_from(">I", _d, 0x2420C6 + 4 * i)[0] for i in range(8)]
SUB64  = [op == 0x2420AE for op in OPS64]           # $2420AE sub / $2420BA add

LUT256  = list(_d[0x242362:0x242362 + 65])          # $242362, 65 bytes
BASE256 = [struct.unpack_from(">H", _d, 0x242352 + 2 * i)[0] for i in range(8)]
# $242312 + D4*4 : eight 8-byte stubs, each `add.w/sub.w D0,D1 / andi.w #$ff,D1`
SUB256 = [struct.unpack_from(">H", _d, 0x242312 + 8 * i)[0] == 0x9240
          for i in range(8)]

W = 0xFFFF


def _asr_w(v, n):
    v &= W
    s = v - 0x10000 if v & 0x8000 else v
    return (s >> n) & W


def front(sy, sx, ty, tx):
    """$24203E..$242084 -- returns (D4 octant*2, D0 ratio 0..128, early0)."""
    d0, d1, d2, d3 = (sy + 0x1800) & W, (sx + 0x1800) & W, (ty + 0x1800) & W, (tx + 0x1800) & W
    d4 = 8
    if d1 < d3:                       # sub.w D3,D1 / bcc  -- BORROW
        d1 = (-(d1 - d3)) & W         # neg.w D1
        d4 = 0
    else:
        d1 = (d1 - d3) & W
    if d0 < d2:                       # sub.w D2,D0 / bcc
        d0 = (-(d0 - d2)) & W
        d4 += 4
    else:
        d0 = (d0 - d2) & W
    d2 = _asr_w(d1, 1)                # D2 = |dx| >> 1 ARITHMETIC
    d1 = (d1 + d2) & W                # D1 = |dx| * 3/2   <-- THE AXIS SCALE
    if d1 < d0:                       # cmp.w D0,D1 / bcc
        d4 += 2
        d0, d1 = d1, d0               # exg
    if d1 == 0:                       # tst.w D1 / beq -> rts, D1 already 0
        return d4, 0, True
    n = (d0 << 6) & 0xFFFFFFFF        # asl.l #6
    q, rem = n // d1, n % d1          # divu.w  (q <= 128 here, no overflow)
    d0 = (q * 2) & W
    if d1 < ((rem * 2) & W):          # cmp.w D2,D1 / bcc / addq #1,D0
        d0 = (d0 + 1) & W
    return d4, d0, False


def aim64(sy, sx, ty, tx):
    d4, d0, early = front(sy, sx, ty, tx)
    if early:
        return 0
    i = d4 >> 1
    lut = LUT64[d0] if d0 < len(LUT64) else LUT64[-1]
    d1 = (BASE64[i] - lut) & W if SUB64[i] else (BASE64[i] + lut) & W
    return ((d1 + 4) & W) >> 3 & 0x3F


def front256(sy, sx, ty, tx):
    d0, d1, d2, d3 = (sy + 0x1800) & W, (sx + 0x1800) & W, (ty + 0x1800) & W, (tx + 0x1800) & W
    d4 = 8
    if d1 < d3:
        d1 = (-(d1 - d3)) & W; d4 = 0
    else:
        d1 = (d1 - d3) & W
    if d0 < d2:
        d0 = (-(d0 - d2)) & W; d4 += 4
    else:
        d0 = (d0 - d2) & W
    d2 = _asr_w(d1, 1)
    d1 = (d1 + d2) & W
    if d1 < d0:
        d4 += 2; d0, d1 = d1, d0
    if d1 == 0:
        return d4, 0, True
    n = (d0 << 5) & 0xFFFFFFFF        # asl.l #5
    q, rem = n // d1, n % d1
    d0 = (q * 2) & W
    if _asr_w(d1, 1) < (rem & W):     # asr.w #1,D1 / cmp.w D2,D1 / bcc
        d0 = (d0 + 1) & W
    return d4, d0, False


def aim256(sy, sx, ty, tx):
    d4, d0, early = front256(sy, sx, ty, tx)
    if early:
        return 0
    i = d4 >> 1
    lut = LUT256[d0] if d0 < len(LUT256) else LUT256[-1]
    d1 = (BASE256[i] - lut) & W if SUB256[i] else (BASE256[i] + lut) & W
    return d1 & 0xFF


# ------------------------------------------------------------------ call sites
def _scan_sites():
    """Which entry point each RETURN ADDRESS belongs to (build B only)."""
    ent = {0x24200A: "24200A", 0x24202C: "24202C", 0x24203E: "24203E",
           0x242178: "242178", 0x24226E: "24226E", 0x242290: "242290",
           0x2422A2: "2422A2"}
    ret = {}
    for a in range(0x230000, 0x2B0000, 2):
        op = struct.unpack_from(">H", _d, a)[0]
        if op in (0x4EB9, 0x4EF9):
            t = struct.unpack_from(">I", _d, a + 2)[0] & 0xFFFFFF
            if t in ent:
                ret[a + 6] = ent[t]
        elif (op & 0xFF00) == 0x6100:
            lo = op & 0xFF
            t = a + 2 + (struct.unpack_from(">h", _d, a + 2)[0] if lo == 0
                         else (lo - 256 if lo > 127 else lo))
            if t in ent:
                ret[a + (4 if lo == 0 else 2)] = ent[t]
    return ret


def check(path):
    sites = _scan_sites()
    per = collections.defaultdict(lambda: [0, 0])   # entry -> [rows, mismatch]
    persite = collections.defaultdict(lambda: [0, 0])
    unk = collections.Counter()
    octs, ratios = collections.Counter(), collections.Counter()
    with open(path) as f:
        hdr = f.readline().rstrip("\n").split("\t")
        ix = {k: i for i, k in enumerate(hdr)}
        for ln in f:
            r = ln.rstrip("\n").split("\t")
            if len(r) < len(hdr):
                continue
            ret = int(r[ix["ret"]], 16)
            ent = sites.get(ret)
            if ent is None:
                unk["%06X" % ret] += 1
                continue
            d4, d0 = int(r[ix["d4"]]), int(r[ix["d0"]])
            octs[d4 >> 1] += 1
            ratios[d0] += 1
            sy, sx = int(r[ix["sy"]]), int(r[ix["sx"]])
            t3 = int(r[ix["t3"]])
            p1w, p1y, p1x = int(r[ix["p1w"]], 16), int(r[ix["p1y"]]), int(r[ix["p1x"]])
            p2w, p2y, p2x = int(r[ix["p2w"]], 16), int(r[ix["p2y"]]), int(r[ix["p2x"]])
            # $24270A, reproduced: A0 = P1 unless ($3,A5) != 0
            a, b = ((p1w, p1y, p1x), (p2w, p2y, p2x))
            if t3 not in (0, 255):
                a, b = b, a
            tw, ty, tx = a if (a[0] & 0x8000) else b
            core = r[ix["core"]] if "core" in ix else "242086"
            f16 = front256 if core.upper() == "2422EA" else front
            ent = ent + "/" + core.upper()
            m4, m0, _ = f16(sy, sx, ty, tx)
            ok = (m4 == d4 and m0 == d0)
            per[ent][0] += 1
            per[ent][1] += 0 if ok else 1
            persite["%s@%06X" % (ent, ret - 6)][0] += 1
            persite["%s@%06X" % (ent, ret - 6)][1] += 0 if ok else 1
    print("ENTRY     rows   mismatch   note")
    for k in sorted(per):
        n, m = per[k]
        print("  %-8s %6d %8d   %s" % (k, n, m, "EXACT" if m == 0 else
              "%.1f%% differ -- caller biases D0/D1" % (100.0 * m / n)))
    exact = [k for k, v in persite.items() if v[1] == 0]
    biased = [(k, v) for k, v in persite.items() if v[1] > 0]
    print("\nCALL SITES seen: %d   model EXACT on %d of them, %d biased"
          % (len(persite), len(exact), len(biased)))
    print("  exact  : " + " ".join(sorted(exact)[:24]))
    print("  biased : " + " ".join("%s(%d/%d)" % (k, v[1], v[0])
                                   for k, v in sorted(biased)[:24]))
    if unk:
        print("  UNATTRIBUTED return addresses: %d distinct  %s"
              % (len(unk), " ".join("%s:%d" % kv for kv in unk.most_common(8))))
    print("\noctant histogram (D4/2): " +
          " ".join("%d:%d" % kv for kv in sorted(octs.items())))
    print("ratio index range: %d..%d over %d distinct values"
          % (min(ratios), max(ratios), len(ratios)))


def sweep():
    """The model's own exhaustive census of the BACK half, and of the front
    half over a dense window -- no emulator involved."""
    back = set()
    for i in range(8):
        for r in range(129):
            lut = LUT64[r]
            d1 = (BASE64[i] - lut) & W if SUB64[i] else (BASE64[i] + lut) & W
            back.add((i, r, ((d1 + 4) & W) >> 3 & 0x3F))
    outs = collections.Counter(x[2] for x in back)
    print("BACK HALF: 8 octants x 129 ratios = %d states, %d distinct results"
          % (len(back), len(outs)))
    print("  results seen: %s" % sorted(outs))
    miss = [d for d in range(64) if d not in outs]
    print("  directions NEVER produced: %s" % (miss or "none"))
    # the front half over a dense dy/dx window
    n = 0
    hist = collections.Counter()
    R = 384
    for dy in range(-R, R + 1, 3):
        for dx in range(-R, R + 1, 3):
            hist[aim64(0, 0, -dy, -dx)] += 1
            n += 1
    print("FRONT+BACK over %d (dy,dx) samples in +-%d: %d distinct directions"
          % (n, R, len(hist)))
    print("  least-used: %s" % hist.most_common()[-6:])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tables"
    if cmd == "tables":
        print("LUT64  $2420F6[129] =", " ".join("%02X" % b for b in LUT64))
        print("BASE64 $2420E6[8]   =", BASE64)
        print("OPS64  $2420C6[8]   =", ["SUB" if s else "ADD" for s in SUB64])
        print("LUT256 $242362[65]  =", " ".join("%02X" % b for b in LUT256))
        print("BASE256$242352[8]   =", BASE256)
        print("OPS256 $242312[8]   =", ["SUB" if s else "ADD" for s in SUB256])
        for nm, f in (("N  (player straight 'up',  -Y)", (0, 0, -1000, 0)),
                      ("E  (player at +X)", (0, 0, 0, 1000)),
                      ("S  (player at +Y)", (0, 0, 1000, 0)),
                      ("W  (player at -X)", (0, 0, 0, -1000)),
                      ("SE 45 deg true", (0, 0, 1000, 1000)),
                      ("SE 45 deg in TABLE units", (0, 0, 1500, 1000))):
            print("  aim64%-34s = %2d   aim256 = %3d" % (nm, aim64(*f), aim256(*f)))
    elif cmd == "check":
        check(sys.argv[2])
    elif cmd == "sweep":
        sweep()
