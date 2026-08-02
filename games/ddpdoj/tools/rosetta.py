#!/usr/bin/env python3
r"""ROSETTA -- align routines ACROSS BUILDS of DoDonPachi DaiOuJou.

WHY THIS EXISTS
---------------
Six 68000 program images of the same game are on this machine.  `ddpdojblk`
alone carries two complete builds (A = 2002.04.05 MASTER at $10xxxx-$1C7FFF,
B = 2002.10.07 BLACK at $2xxxxx) and they are RELAYOUTS, not a mirror -- no
constant offset exists (derive.py's docstring measured deltas from +$FFC5C to
+$100C94).  Every question this project keeps getting wrong is a question a
second implementation would settle:

  * ROUTINE BOUNDARIES.  Ten fall-through incidents.  If build A has an `rts`
    where build B appears to fall through, one of the two readings is wrong.
  * TABLE EXTENTS.  An anchor pins a table's start, never its end.  The same
    stride and count in two builds pins it from both ends.
  * MISSED SITES.  A search with a too-narrow address filter looks clean.  The
    other build's aligned list shows the hole.  (This is how $290762 was found:
    W10 filtered $813098's writers to $23xxxx-$28xxxx and missed one at $29xxxx.)

THE METHOD -- RAM-REFERENCE SEQUENCE ALIGNMENT
----------------------------------------------
Code addresses relocate between builds.  RAM and I/O addresses do NOT: the two
builds share the RAM map (measured, 00-recon-hard.md, and re-confirmed here by
190 aligned $813098 sites).  So the ordered stream of absolute-long operands
that land in RAM/IO is a BUILD-INVARIANT TOKEN SEQUENCE.  Extract it per build,
run a longest-matching-block diff over the two streams, and every matching block
is a stretch of code that is the same in both builds -- with a piecewise-linear
address map attached.

WHAT THIS CAN AND CANNOT SEE.  Say it every time a result from here is quoted;
same rule as xref.py, derive.py and docs/knowledge/08:

  CAN     absolute-long operands:  tst.w $813098.l / lea $80E240,A0 / jsr $2410BC
  CANNOT  (d16,An), (An)+, (d8,An,Xn), PC-relative -- anything through a base
          register.  The object driver's own dispatch is invisible to it.

So an alignment is EVIDENCE OF SAMENESS, and a gap in an alignment is NOT
evidence of difference: a routine that touches no absolute-long RAM address is
simply not visible to this tool at all.  Every result carries a confidence.

CONFIDENCE, and why a false pairing is worse than none
------------------------------------------------------
A false pairing lets a build-A reading be quoted as a build-B fact.  That is the
standing failure mode here (games/ddpdoj/NOTES-build-split.md).  So every
`align` result reports:

  run     how many consecutive RAM tokens matched around the query (the block)
  ctx     how many of those tokens are on each side of the query point
  opcode  whether the two-word opcode context at the mapped site is identical
  uniq    whether the block's token n-gram occurs exactly once in the target

  HIGH    run >= 8 AND opcode identical AND uniq
  MEDIUM  run >= 4 AND opcode identical
  LOW     anything else -- DO NOT quote a LOW pairing as a fact

ROM-DERIVED.  Images live in games/ddpdoj/rip/rosetta/ (gitignored twice over).
Nothing this file produces may be committed except addresses.

  python rosetta.py dump [set ...]        dump decrypted :maincpu per set
  python rosetta.py map                   content extents + version strings
  python rosetta.py sites RAMADDR         every abs.l site, ALL images, aligned
  python rosetta.py align ADDR            map one address A<->B (or --to SET)
  python rosetta.py bounds ADDR           cross-build routine-boundary check
  python rosetta.py table ADDR STRIDE      cross-build table-extent check
  python rosetta.py dasm ADDR N [--set S]  unidasm passthrough
"""
from __future__ import annotations

import argparse
import collections
import difflib
import os
import struct
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RIP = HERE.parent / "rip" / "rosetta"
ORACLE = HERE / "oracle"
sys.path.insert(0, str(ORACLE))

SETS = ["ddpdojblk", "ddpdojblkbl", "ddpdojp", "ddp3", "ddpdoj", "ddpdojb"]

# The two CODE ranges.  ddpdojblk/blkbl carry a build in each; every other set
# carries one build in the low range and DATA in the high one.
RANGES = {"A": (0x100000, 0x1C8000), "B": (0x200000, 0x2B0000)}

# Build-invariant address space.  $800000-$8FFFFF work RAM, $A00000 palette,
# $B00000 video regs, $C00000 I/O.  Deliberately NOT $100000-$5FFFFF (code).
RAMWIN = ((0x800000, 0x900000), (0xA00000, 0xA10000),
          (0xB00000, 0xB10000), (0xC00000, 0xC10000))


def in_ram(v: int) -> bool:
    return any(lo <= v < hi for lo, hi in RAMWIN)


def img_path(s: str) -> Path:
    return RIP / f"img-{s}.bin"


_CACHE: dict[str, bytes] = {}


def image(s: str) -> bytes:
    if s not in _CACHE:
        p = img_path(s)
        if not p.exists():
            raise SystemExit(f"{p} missing -- run `python rosetta.py dump {s}`")
        _CACHE[s] = p.read_bytes()
    return _CACHE[s]


# --------------------------------------------------------------------- dump
def cmd_dump(args) -> None:
    import pgm  # oracle/pgm.py -- carries the -noreadconfig/-rompath knowledge
    RIP.mkdir(parents=True, exist_ok=True)
    for s in (args.sets or SETS):
        env = {"PGM_DUMP": str(img_path(s)).replace("/", "\\"), "PGM_DUMP_AT": "60"}
        r = pgm.run(ORACLE / "dumpcpu.lua", machine=s, seconds=8, env=env, timeout=600)
        ok = any(l.startswith("DUMPED") for l in r.lines)
        print(f"{s:14s} rc={r.returncode} {'OK' if ok else 'FAILED'} "
              f"{img_path(s).stat().st_size if ok else 0}")


# ---------------------------------------------------------------------- map
def cmd_map(args) -> None:
    import re
    pat = re.compile(rb"20\d\d[ .]\d\d[ .]\d\d[ -~]{0,26}")
    for s in SETS:
        if not img_path(s).exists():
            print(f"{s:14s} (no image)")
            continue
        d = image(s)
        blocks = [i // 0x1000 for i in range(0x100000, 0x500000, 0x1000)
                  if len(collections.Counter(d[i:i + 0x1000])) > 4]
        runs, a = [], blocks[0]
        for i, x in enumerate(blocks):
            if i + 1 == len(blocks) or blocks[i + 1] != x + 1:
                runs.append((a * 0x1000, (x + 1) * 0x1000 - 1))
                if i + 1 < len(blocks):
                    a = blocks[i + 1]
        print(f"{s:14s} " + "  ".join(f"${x:06X}-${y:06X}" for x, y in runs))
        for m in pat.finditer(d, 0x100000):
            print(f"                 ${m.start():06X}  {m.group()[:30].decode('latin1')!r}")


# --------------------------------------------------------------- ram tokens
def tokens(s: str, build: str) -> tuple[list[int], list[int]]:
    """(offsets, values) of every abs.l RAM/IO operand in one build's code range."""
    d, (lo, hi) = image(s), RANGES[build]
    offs, vals = [], []
    for o in range(lo, hi, 2):
        v = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]
        if in_ram(v):
            offs.append(o)
            vals.append(v)
    return offs, vals


_TOK: dict[tuple[str, str], tuple[list[int], list[int]]] = {}


def tok(s: str, build: str):
    k = (s, build)
    if k not in _TOK:
        _TOK[k] = tokens(s, build)
    return _TOK[k]


def blocks(src: tuple[str, str], dst: tuple[str, str]):
    """difflib matching blocks over the two RAM-token VALUE streams."""
    _, av = tok(*src)
    _, bv = tok(*dst)
    sm = difflib.SequenceMatcher(a=av, b=bv, autojunk=False)
    return sm.get_matching_blocks()


_BLK: dict = {}


def matching(src, dst):
    k = (src, dst)
    if k not in _BLK:
        _BLK[k] = blocks(src, dst)
    return _BLK[k]


_NG: dict = {}


def _ngrams(dst, k: int = 6) -> collections.Counter:
    """Count of every k-token window in the destination stream, built once."""
    if dst not in _NG:
        _, bv = tok(*dst)
        _NG[dst] = collections.Counter(tuple(bv[i:i + k]) for i in range(len(bv) - k + 1))
    return _NG[dst]


def ctxwords(s: str, off: int, n: int = 2) -> tuple[int, ...]:
    d = image(s)
    return tuple(struct.unpack_from(">H", d, off - 2 * (i + 1))[0] for i in range(n))


def refine(addr: int, src, dst, approx: int, win: int = 0x60):
    """Byte-refine an anchor-derived address.

    The anchor pins ONE token exactly; the routine entry is only as far from it
    as the two builds' identical instruction lengths make it, and prologues do
    differ (measured: $2410BC's anchor delta is 8 bytes off its true entry).
    So score every even candidate in +/-win by masked word agreement, where a
    32-bit value that lands in CODE space on both sides counts as a wildcard.
    Returns (best_addr, score, margin_over_runner_up).
    """
    ds, dd = image(src[0]), image(dst[0])
    n = 0x30  # words of context to score
    scores = []
    for cand in range(approx - win, approx + win + 1, 2):
        sc, i = 0, 0
        while i < n:
            so, do = addr + 2 * i, cand + 2 * i
            if not (0 <= do < len(dd) - 4 and 0 <= so < len(ds) - 4):
                break
            sw = struct.unpack_from(">H", ds, so)[0]
            dw = struct.unpack_from(">H", dd, do)[0]
            sl = struct.unpack_from(">I", ds, so)[0]
            dl = struct.unpack_from(">I", dd, do)[0]
            if sw == dw:
                sc += 1
                i += 1
            elif 0x100000 <= sl < 0x600000 and 0x100000 <= dl < 0x600000:
                sc += 2  # a relocated code pointer in the same slot: strong
                i += 2
            else:
                sc -= 2
                i += 1
        scores.append((sc, cand))
    scores.sort(key=lambda t: (-t[0], abs(t[1] - approx)))
    best, second = scores[0], (scores[1] if len(scores) > 1 else (0, 0))
    return best[1], best[0], best[0] - second[0]


def align(addr: int, src, dst):
    """Map ADDR from (set,build) src to (set,build) dst.  Returns a dict."""
    ao, av = tok(*src)
    bo, bv = tok(*dst)
    # nearest token index at or after addr
    import bisect
    i = bisect.bisect_left(ao, addr)
    best = None
    for a, b, n in matching(src, dst):
        if n and a <= min(i, len(ao) - 1) < a + n:
            best = (a, b, n)
            break
        if n and a <= i <= a + n:
            best = (a, b, n)
    if best is None:
        # addr sits in a gap: use the block that starts nearest after i
        cand = [(abs(a - i), a, b, n) for a, b, n in matching(src, dst) if n >= 4]
        if not cand:
            return None
        _, a, b, n = min(cand)
        best = (a, b, n)
        j = a
    else:
        a, b, n = best
        j = min(max(i, a), a + n - 1)
    a, b, n = best
    k = b + (j - a)
    delta_here = bo[k] - ao[j]
    mapped = addr + delta_here
    ctx_ok = ctxwords(src[0], ao[j]) == ctxwords(dst[0], bo[k])
    # uniqueness of the 6-token n-gram around j in the destination stream
    g = tuple(av[max(0, j - 2): j + 4])
    hits = _ngrams(dst).get(g, 0) if len(g) >= 4 else 99
    before, after = j - a, a + n - 1 - j
    if n >= 8 and ctx_ok and hits == 1:
        conf = "HIGH"
    elif n >= 4 and ctx_ok:
        conf = "MEDIUM"
    else:
        conf = "LOW"
    ref, score, margin = refine(addr, src, dst, mapped)
    if addr == ao[j]:
        ref, score, margin = mapped, 99, 99
    if margin < 2 and conf == "HIGH":
        conf = "MEDIUM"          # anchor is solid, the entry offset is not
    return dict(src_tok=ao[j], dst_tok=bo[k], value=av[j], run=n, before=before,
                after=after, ctx_ok=ctx_ok, uniq=hits, mapped=ref,
                anchor_map=mapped, score=score, margin=margin,
                delta=ref - addr, conf=conf, exact=(addr == ao[j]))


def parse_bs(s: str):
    st, _, b = s.partition(":")
    return (st or "ddpdojblk", b or "B")


# -------------------------------------------------------------------- sites
def cmd_sites(args) -> None:
    tgt = struct.pack(">I", int(args.ram, 16))
    for s in SETS:
        if not img_path(s).exists():
            continue
        d = image(s)
        rows = []
        i = 0
        while True:
            i = d.find(tgt, i)
            if i < 0:
                break
            if i % 2 == 0 and i >= 0x100000:
                rows.append((i, struct.unpack_from(">H", d, i - 2)[0],
                             struct.unpack_from(">H", d, i - 4)[0]))
            i += 1
        per = collections.Counter("B" if r[0] >= 0x200000 else "A" for r in rows)
        print(f"=== {s}  n={len(rows)}  A={per['A']} B={per['B']}")
        if args.list:
            for o, p2, p4 in rows:
                print(f"    ${o - 2 if p2 not in (0,) else o:06X}  "
                      f"op={p4:04X} {p2:04X} [$813098-style operand at ${o:06X}]")


# -------------------------------------------------------------------- align
def cmd_align(args) -> None:
    src, dst = parse_bs(args.frm), parse_bs(args.to)
    for a in [int(x, 16) for x in args.addrs]:
        r = align(a, src, dst)
        if r is None:
            print(f"${a:06X}  NO ALIGNMENT")
            continue
        print(f"${a:06X} [{src[0]}:{src[1]}] -> ${r['mapped']:06X} "
              f"[{dst[0]}:{dst[1]}]  {r['conf']}")
        print(f"    anchor ${r['src_tok']:06X}->${r['dst_tok']:06X} "
              f"(RAM ${r['value']:06X}{'' if r['exact'] else ', nearest'})"
              f"  run={r['run']} (-{r['before']}/+{r['after']})"
              f"  ctx={'same' if r['ctx_ok'] else 'DIFFERENT'}"
              f"  ngram_hits={r['uniq']}  delta={r['delta']:+#x}"
              f"  refine(score={r['score']},margin={r['margin']})")


# ------------------------------------------------------------------- bounds
RTS, RTE, JMP, BRA_W, NOP = 0x4E75, 0x4E73, 0x4EF9, 0x6000, 0x4E71


def scan_terminators(s: str, lo: int, hi: int):
    d, out = image(s), []
    for o in range(lo, hi, 2):
        w = struct.unpack_from(">H", d, o)[0]
        if w in (RTS, RTE):
            out.append((o, "rts" if w == RTS else "rte"))
        elif w == JMP:
            out.append((o, f"jmp ${struct.unpack_from('>I', d, o + 2)[0]:06X}"))
        elif w == BRA_W:
            out.append((o, f"bra.w ${o + 2 + struct.unpack_from('>h', d, o + 2)[0]:06X}"))
    return out


def cmd_bounds(args) -> None:
    """Does the routine at ADDR end where we think it does, in BOTH builds?"""
    src, dst = parse_bs(args.frm), parse_bs(args.to)
    a = int(args.addr, 16)
    span = args.span
    r = align(a, src, dst)
    if r is None:
        raise SystemExit("no alignment for the entry point")
    b = r["mapped"]
    print(f"ENTRY ${a:06X} [{src[0]}:{src[1]}] <-> ${b:06X} [{dst[0]}:{dst[1]}]  {r['conf']}")
    ta = scan_terminators(src[0], a, a + span)
    tb = scan_terminators(dst[0], b, b + span)
    print(f"  {src[0]}:{src[1]} terminators:")
    for o, k in ta[:12]:
        print(f"    +${o - a:04X}  ${o:06X}  {k}")
    print(f"  {dst[0]}:{dst[1]} terminators:")
    for o, k in tb[:12]:
        print(f"    +${o - b:04X}  ${o:06X}  {k}")
    off_a = [o - a for o, _ in ta[:12]]
    off_b = [o - b for o, _ in tb[:12]]
    agree = [x for x in off_a if x in off_b]
    print(f"  AGREE at offsets: {[hex(x) for x in agree[:12]]}")
    if off_a[:1] != off_b[:1]:
        print("  ** FIRST TERMINATOR DISAGREES -- one of the two readings is wrong,")
        print("     or the builds genuinely differ here.  Do not resolve by preference.")


# -------------------------------------------------------------------- table
def cmd_table(args) -> None:
    """Compare a pointer table's extent across builds.

    A code-pointer table's entries all land in the OWN build's code range; the
    entry count is what an anchor cannot pin.  Read both builds and compare.
    """
    src, dst = parse_bs(args.frm), parse_bs(args.to)
    a = int(args.addr, 16)
    stride = int(args.stride, 0)
    r = align(a, src, dst)
    b = r["mapped"] if r else None
    for name, (st, bd), base in ((src[0] + ":" + src[1], src, a),
                                 (dst[0] + ":" + dst[1], dst, b)):
        if base is None:
            print(f"{name}: no alignment")
            continue
        d, lo, hi = image(st), *RANGES[bd]
        print(f"{name}  ${base:06X} stride ${stride:X}")
        n = 0
        for i in range(args.max):
            v = struct.unpack_from(">I", d, base + i * stride)[0]
            ok = lo <= v < hi
            print(f"    [{i:2d}] ${base + i * stride:06X} = ${v:08X} "
                  f"{'code' if ok else ('RAM' if in_ram(v) else 'OUT-OF-RANGE  <-- extent ends here')}")
            if not ok and not in_ram(v):
                break
            n += 1
        print(f"    -> {n} in-range entries")


# ---------------------------------------------------------------- calibrate
def jsr_targets(s: str, build: str) -> set[int]:
    d, (lo, hi) = image(s), RANGES[build]
    out = set()
    for o in range(lo, hi - 6, 2):
        if struct.unpack_from(">H", d, o)[0] in (0x4EB9, 0x4EF9):
            v = struct.unpack_from(">I", d, o + 2)[0]
            if lo <= v < hi:
                out.add(v)
    return out


def cmd_calibrate(args) -> None:
    """HOW OFTEN IS AN ALIGNMENT RIGHT?  Measure it, do not assert it.

    A `jsr abs.l` target is a routine ENTRY that both builds must have if they
    implement the same routine.  So: take entries in the source build, align
    them, and ask whether the mapped address is also a `jsr` target in the
    destination.  A wrong mapping almost never lands on one (entries are ~1 in
    300 even addresses), so the hit rate is a real false-pairing rate, bucketed
    by the confidence the tool reported.  A false pairing is worse than none --
    this is the number that says whether a bucket may be quoted.
    """
    src, dst = parse_bs(args.frm), parse_bs(args.to)
    a_t = sorted(jsr_targets(*src))
    b_t = jsr_targets(*dst)
    import random
    random.seed(args.seed)
    sample = random.sample(a_t, min(args.n, len(a_t)))
    buckets: dict[str, list[int]] = {"HIGH": [], "MEDIUM": [], "LOW": [], "NONE": []}
    for a in sample:
        r = align(a, src, dst)
        if r is None:
            buckets["NONE"].append(0)
            continue
        buckets[r["conf"]].append(1 if r["mapped"] in b_t else 0)
    print(f"{src[0]}:{src[1]} -> {dst[0]}:{dst[1]}   "
          f"{len(a_t)} jsr-targets in source, {len(b_t)} in destination, "
          f"sample {len(sample)}")
    for k in ("HIGH", "MEDIUM", "LOW", "NONE"):
        v = buckets[k]
        if not v:
            print(f"  {k:6s} n=0")
            continue
        print(f"  {k:6s} n={len(v):4d}  mapped-onto-a-real-entry {sum(v):4d} "
              f"({sum(v) / len(v) * 100:5.1f} %)")


# ----------------------------------------------------------------- codexref
def cmd_codexref(args) -> None:
    """Every reference to a CODE address, INCLUDING PC-relative ones.

    `xref.py` documents that it cannot see `(d16,PC)` -- and the object driver's
    own dispatch is exactly that (`lea ($240F62,PC),A0`).  So a routine can look
    uncalled and be called every frame.  This closes that hole for the four
    encodings that actually carry a code address:

        4EB9/4EF9 llllllll   jsr/jmp abs.l
        41F9      llllllll   lea abs.l,A0..A7   (0x41F9|reg<<9)
        6100/6000 dddd       bsr.w / bra.w
        61xx/60xx            bsr.s / bra.s
        4EBA/4EFA dddd       jsr/jmp (d16,PC)
        41FA      dddd       lea (d16,PC),An    (0x41FA|reg<<9)
    """
    tgt = int(args.addr, 16)
    for s in (args.sets or ["ddpdojblk"]):
        d = image(s)
        print(f"=== {s} -> ${tgt:06X}")
        for build, (lo, hi) in RANGES.items():
            for o in range(lo, hi - 4, 2):
                w = struct.unpack_from(">H", d, o)[0]
                hit = None
                if w in (0x4EB9, 0x4EF9) or (w & 0xF1FF) == 0x41F9:
                    if struct.unpack_from(">I", d, o + 2)[0] == tgt:
                        hit = {0x4EB9: "jsr", 0x4EF9: "jmp"}.get(w, "lea") + " abs.l"
                elif w in (0x6100, 0x6000, 0x4EBA, 0x4EFA) or (w & 0xF1FF) == 0x41FA:
                    dd = struct.unpack_from(">h", d, o + 2)[0]
                    if o + 2 + dd == tgt:
                        hit = {0x6100: "bsr.w", 0x6000: "bra.w", 0x4EBA: "jsr (d16,PC)",
                               0x4EFA: "jmp (d16,PC)"}.get(w, "lea (d16,PC)")
                elif (w & 0xFF00) in (0x6100, 0x6000) and (w & 0xFF) not in (0, 0xFF):
                    dd = struct.unpack_from(">b", d, o + 1)[0]
                    if o + 2 + dd == tgt:
                        hit = "bsr.s" if (w & 0xFF00) == 0x6100 else "bra.s"
                if hit:
                    print(f"    [{build}] ${o:06X}  {hit}")


# --------------------------------------------------------------------- dasm
def cmd_dasm(args) -> None:
    exe = Path(os.environ.get("MAME_HOME") or
               (Path(os.environ["LOCALAPPDATA"]) / "Mixup" / "mame")) / "unidasm.exe"
    a = int(args.addr, 16)
    r = subprocess.run([str(exe), str(img_path(args.set)), "-arch", "m68000",
                        "-basepc", hex(a), "-skip", hex(a), "-count", str(args.n)],
                       capture_output=True, text=True)
    print(r.stdout)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dump"); d.add_argument("sets", nargs="*"); d.set_defaults(f=cmd_dump)
    m = sub.add_parser("map"); m.set_defaults(f=cmd_map)
    s = sub.add_parser("sites"); s.add_argument("ram"); s.add_argument("--list", action="store_true")
    s.set_defaults(f=cmd_sites)
    al = sub.add_parser("align"); al.add_argument("addrs", nargs="+")
    al.add_argument("--from", dest="frm", default="ddpdojblk:B")
    al.add_argument("--to", default="ddpdojblk:A"); al.set_defaults(f=cmd_align)
    bo = sub.add_parser("bounds"); bo.add_argument("addr")
    bo.add_argument("--from", dest="frm", default="ddpdojblk:B")
    bo.add_argument("--to", default="ddpdojblk:A")
    bo.add_argument("--span", type=lambda x: int(x, 0), default=0x200); bo.set_defaults(f=cmd_bounds)
    tb = sub.add_parser("table"); tb.add_argument("addr"); tb.add_argument("stride")
    tb.add_argument("--from", dest="frm", default="ddpdojblk:B")
    tb.add_argument("--to", default="ddpdojblk:A")
    tb.add_argument("--max", type=int, default=32); tb.set_defaults(f=cmd_table)
    ca = sub.add_parser("calibrate")
    ca.add_argument("--from", dest="frm", default="ddpdojblk:B")
    ca.add_argument("--to", default="ddpdojblk:A")
    ca.add_argument("-n", type=int, default=150)
    ca.add_argument("--seed", type=int, default=21); ca.set_defaults(f=cmd_calibrate)
    cx = sub.add_parser("codexref"); cx.add_argument("addr")
    cx.add_argument("sets", nargs="*"); cx.set_defaults(f=cmd_codexref)
    ds = sub.add_parser("dasm"); ds.add_argument("addr"); ds.add_argument("n", type=int, nargs="?", default=200)
    ds.add_argument("--set", default="ddpdojblk"); ds.set_defaults(f=cmd_dasm)
    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
