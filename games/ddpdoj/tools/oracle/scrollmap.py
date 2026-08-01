#!/usr/bin/env python3
r"""STATIC decoder for the DoJ background/scroll program (VERSION-B, $2xxxxx).

READER ONLY.  Reads out/maincpu.bin (the decrypted :maincpu image, ROM-derived,
gitignored) and prints the COMPLETE inventory of the scroll subsystem:

  python scrollmap.py tables        the five per-stage tables + consistency checks
  python scrollmap.py script N      decode BOTH scripts of stage-index N, every record
  python scrollmap.py scripts       decode all 10 scripts, summary counts
  python scrollmap.py sim N         simulate the stage-N scroll program -> LENGTH
  python scrollmap.py cols N [k]    first k columns of stage N's column stream
  python scrollmap.py elem N        the BG-element handler table for stage N

Everything here is READ FROM THE LISTING.  Nothing is measured.  Every claim
that leaves this file must say so.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMAGE = HERE / "out" / "maincpu.bin"

D = IMAGE.read_bytes() if IMAGE.exists() else None


def u16(a):
    return struct.unpack_from(">H", D, a)[0]


def s16(a):
    return struct.unpack_from(">h", D, a)[0]


def u32(a):
    return struct.unpack_from(">I", D, a)[0]


# ---- the five per-stage tables, all read from the listing -------------------
T_STAGE_SCRIPTS = 0x26153E   # $26152C: lea ($26153E,PC),A0 ; A0 = (A0,$813096.w)
T_BG_PALETTE = 0x261252      # $2611B2
T_BG_COLSTREAM = 0x261266    # $2611D6
T_BG_TILEBASE = 0x240D62     # $240D80
T_BG_ELEMTABLE = 0x262302    # $262328

OPS = {
    0x00: ("SPAWN",   2, 0x2620DE),
    0x04: ("REPEAT",  6, 0x262102),
    0x08: ("SPEED",   2, 0x26213A),
    0x0C: ("FREEZE",  0, 0x26214C),
    0x10: ("BGELEM",  6, 0x262160),
    0x14: ("CUE",     2, 0x262180),
    0x18: ("FLAG",    2, 0x2621D6),
}


def stage_scripts(n):
    p = u32(T_STAGE_SCRIPTS + 4 * n)
    return p, u32(p), u32(p + 4)


def walk(script_ptr):
    """Walk one script.  header = (objstream, cuestream) then records."""
    obj = u32(script_ptr)
    cue = u32(script_ptr + 4)
    a = script_ptr + 8
    recs = []
    while True:
        t = u16(a)
        if t == 0xFFFF:
            recs.append((a, t, None, None, None))
            break
        cond = u16(a + 2)
        op = u16(a + 4)
        if op not in OPS:
            raise SystemExit(f"desync: bad op ${op:04X} at ${a:06X}")
        n, sz, _ = OPS[op][0], OPS[op][1], OPS[op][2]
        args = [u16(a + 6 + 2 * i) for i in range(sz // 2)]
        recs.append((a, t, cond, op, args))
        a += 6 + sz
    return obj, cue, recs


def objstream(p):
    out = []
    while True:
        v = u32(p)
        if v == 0xFFFFFFFF:
            break
        out.append((p, v, u16(p + 4)))
        p += 6
    return out, p + 4


def cmd_tables():
    print("stage  scriptpair  script0   script1   palette   colstream tilebase   elemtab")
    for n in range(5):
        sp, s0, s1 = stage_scripts(n)
        print(f"  {n}    ${sp:06X}    ${s0:06X}  ${s1:06X}  "
              f"${u32(T_BG_PALETTE+4*n):06X}  ${u32(T_BG_COLSTREAM+4*n):06X}  "
              f"${u32(T_BG_TILEBASE+4*n):08X} ${u32(T_BG_ELEMTABLE+4*n):06X}")
    print()
    # the two are INTERLEAVED: stream0 pal0 stream1 pal1 ... stream4 pal4
    cs = [u32(T_BG_COLSTREAM + 4 * n) for n in range(5)]
    pal = [u32(T_BG_PALETTE + 4 * n) for n in range(5)]
    print("column streams (each bounded by its OWN stage's palette block):")
    tot = 0
    for n in range(5):
        ln = pal[n] - cs[n]
        tot += ln
        print(f"  stage{n} ${cs[n]:06X}..${pal[n]:06X}  {ln:6d} B  "
              f"{ln/36:8.3f} columns  {'OK' if ln % 36 == 0 else '*** NOT x36 ***'}"
              f"  {ln//36*32:6d} px")
    print(f"  TOTAL {tot} B  {tot//36} columns")
    print()
    print("palette blocks (bounded by the NEXT stage's column stream):")
    for n in range(5):
        ln = (cs[n + 1] - pal[n]) if n < 4 else None
        print(f"  stage{n} ${pal[n]:06X}  "
              + (f"{ln} B  {'OK' if ln == 0x800 else '*** != $800 ***'}" if ln
                 else "(last -- upper bound not derivable from these tables)"))


def fmt_rec(a, t, cond, op, args):
    name = OPS[op][0]
    s = f"  ${a:06X}  t=${t:04X}({t:4d})  c=${cond:04X}  op=${op:02X} {name:6s}"
    if op == 0x08:
        v = args[0]
        s += f"  speed=${v:04X} = {v/64:6.3f} px/frame"
    elif op == 0x04:
        s += (f"  rewind={s16(a+6):+5d} cols  len={args[1]:3d}  "
              f"loops={'INF' if args[2] == 0xFFFF else args[2]}")
    elif op == 0x00:
        s += f"  spawn {args[0]} object(s) from the object stream"
    elif op == 0x10:
        s += f"  bgelem id={args[0]}  arg=${(args[1] << 16) | args[2]:08X}"
    elif op == 0x14:
        s += f"  {args[0]} cue sub-record(s)"
    elif op == 0x18:
        s += f"  flag level {args[0]}"
    return s


def cmd_script(n):
    sp, s0, s1 = stage_scripts(n)
    for idx, sc in ((0, s0), (1, s1)):
        obj, cue, recs = walk(sc)
        body = recs[-1][0] - (sc + 8)
        print(f"=== stage{n} script{idx} ${sc:06X}  objstream=${obj:06X} "
              f"cuestream=${cue:06X}  records=${sc+8:06X}..${recs[-1][0]-1:06X} "
              f"({len(recs)-1} records, {body} B) terminator ${recs[-1][0]:06X}")
        counts = {}
        conds = {}
        for r in recs[:-1]:
            print(fmt_rec(*r))
            counts[r[3]] = counts.get(r[3], 0) + 1
            conds[r[2]] = conds.get(r[2], 0) + 1
        print("  ops: " + "  ".join(f"${k:02X}({OPS[k][0]})x{v}"
                                    for k, v in sorted(counts.items())))
        print("  cond words seen: " + " ".join(f"${k:04X}x{v}" for k, v in sorted(conds.items())))
        if obj:
            ents, end = objstream(obj)
            print(f"  object stream ${obj:06X}..${end-1:06X}: {len(ents)} entries")
            for p, ptr, w in ents:
                print(f"    ${p:06X}  handler/ptr ${ptr:08X}  param ${w:04X}")
        if cue:
            print(f"  cue stream ${cue:06X}: " + " ".join(f"{u16(cue+2*i):04X}" for i in range(24)))
        print()


def cmd_scripts():
    print("stage/scr  addr     recs  bytes  ops")
    grand = {}
    for n in range(5):
        _, s0, s1 = stage_scripts(n)
        for idx, sc in ((0, s0), (1, s1)):
            obj, cue, recs = walk(sc)
            counts = {}
            for r in recs[:-1]:
                counts[r[3]] = counts.get(r[3], 0) + 1
                grand[r[3]] = grand.get(r[3], 0) + 1
            print(f"  {n}/{idx}   ${sc:06X}  {len(recs)-1:4d}  {recs[-1][0]-(sc+8):5d}  "
                  + " ".join(f"${k:02X}x{v}" for k, v in sorted(counts.items())))
    print("  GRAND " + "  ".join(f"${k:02X}({OPS[k][0]})x{v}" for k, v in sorted(grand.items())))
    print("  total records: " + str(sum(grand.values())))


def cmd_sim(n, verbose=True):
    """Simulate the scroll program EXACTLY as $2612A0/$262062/$261F76 run it.

    One iteration = one LOGIC FRAME with the background handler live
    ($8130D2 == 0, $813180 == 0, $81317E == 0 -- i.e. no external override).
    """
    _, s0, s1 = stage_scripts(n)
    obj0, cue0, recs0 = walk(s0)
    obj1, cue1, recs1 = walk(s1)

    # ---- object state ($26114C init, entry clock 0) ----
    speed_bg = 0x20           # ($1C,A5)
    speed_tx = 0x20           # ($22,A5)
    acc_tick = 0              # ($1E,A5)
    acc_col = (0 & 3) << 9    # ($20,A5) = (clock&3)*512
    frozen = 0                # ($8,A5)
    clock = 0                 # $8130CE
    colptr = u32(T_BG_COLSTREAM + 4 * n)   # ($A,A5)
    cursor = 0
    # init fill writes 15 columns, cursor = $F
    colptr += 15 * 36
    cursor = 15
    stream_base = u32(T_BG_COLSTREAM + 4 * n)

    # ---- script blocks ($813192 / $8131AA) ----
    blk = [dict(cur=s0 + 8, obj=obj0, cue=cue0, rew=0, loop=0, rlen=0, cnt=0, resume=0),
           dict(cur=s1 + 8, obj=obj1, cue=cue1, rew=0, loop=0, rlen=0, cnt=0, resume=0)]

    frame = 0
    cols_written = 0
    px = 0
    events = []
    spawns = 0
    bgelems = 0
    LIMIT = 400000
    ended = None

    while frame < LIMIT:
        # --- $262062: the interpreter, both scripts, exact-equality on clock ---
        for i in (0, 1):
            b = blk[i]
            while True:
                a = b["cur"]
                t = u16(a)
                if t == 0xFFFF or t != clock:
                    break
                op = u16(a + 4)
                sz = OPS[op][1]
                args = [u16(a + 6 + 2 * k) for k in range(sz // 2)]
                ci = (colptr - stream_base) // 36
                if op == 0x08:
                    if i == 0:
                        speed_bg = args[0]
                    else:
                        speed_tx = args[0]
                    events.append((frame, clock, px, ci, f"SPEED{i} ${args[0]:04X} "
                                                     f"({args[0]/64:.3f} px/f)"))
                elif op == 0x0C:
                    frozen = 1
                    b["resume"] = (clock + 4) & 0xFFFF
                    events.append((frame, clock, px, ci, f"FREEZE (resume at ${b['resume']:04X})"))
                elif op == 0x04:
                    if i == 0:
                        colptr += s16(a + 6) * 36
                        cursor_delta = s16(a + 6)
                        b["rew"] = colptr
                    else:
                        b["rew"] = 1   # script-1 column pointer is not simulated
                    b["rlen"] = args[1]
                    b["cnt"] = args[1] + 1
                    b["loop"] = args[2]
                    events.append((frame, clock, px, ci,
                                   f"REPEAT{i} rewind {s16(a+6):+d} cols len {args[1]} "
                                   f"loops {'INF' if args[2] == 0xFFFF else args[2]}"))
                elif op == 0x00:
                    spawns += args[0]
                    events.append((frame, clock, px, ci, f"SPAWN {args[0]}"))
                elif op == 0x10:
                    bgelems += 1
                    events.append((frame, clock, px, ci, f"BGELEM id={args[0]}"))
                elif op == 0x14:
                    events.append((frame, clock, px, ci, f"CUE x{args[0]}"))
                elif op == 0x18:
                    events.append((frame, clock, px, ci, f"FLAG {args[0]}"))
                b["cur"] = a + 6 + sz

        # --- $2612FE..: accumulate ---
        acc_tick += speed_bg
        px += speed_bg / 64.0
        if acc_tick >= 0x200:
            acc_tick -= 0x200
            if not frozen:
                clock = (clock + 1) & 0xFFFF
        acc_col += speed_bg
        if acc_col >= 0x800:
            acc_col -= 0x800
            # --- $261F76, script 0 only (the only absolute-long caller) ---
            b = blk[0]
            if b["rew"]:
                b["cnt"] -= 1
                if b["cnt"] <= 0:
                    if b["loop"] == 0xFFFF:
                        b["cnt"] = b["rlen"]
                        colptr = b["rew"]
                    else:
                        b["loop"] -= 1
                        if b["loop"] > 0:
                            b["cnt"] = b["rlen"]
                            colptr = b["rew"]
                        else:
                            b["rew"] = 0
                            frozen = 0
                            clock = b["resume"]
                            events.append((frame, clock, px, ci, "REPEAT DONE -> unfreeze, "
                                                             f"clock := ${clock:04X}"))
            colptr += 36
            cursor = (cursor + 1) & 0x3F
            cols_written += 1

        frame += 1

        if u16(blk[0]["cur"]) == 0xFFFF and blk[0]["rew"] == 0 and ended is None:
            ended = (frame, clock, px, cols_written)
        if blk[0]["loop"] == 0xFFFF and blk[0]["rew"]:
            ended = ("LOCKED", frame, clock, px, cols_written)
            break

    if verbose:
        print(f"=== stage-index {n}: SIMULATED SCROLL PROGRAM "
              f"(listing-derived, no external override) ===")
        print(" frame   clock      px  col   event")
        for f, c, p, ci, e in events:
            print(f"{f:6d}  ${c:04X}  {p:8.1f} {ci:4d}   {e}")
        print()
        send = u32(T_BG_COLSTREAM + 4 * n + 4) if n < 4 else u32(T_BG_PALETTE)
        print(f"  columns written : {cols_written}  "
              f"({cols_written*32} px of map, stream is {(send - stream_base)//36} cols)")
        print(f"  scroll distance : {px:.1f} px = {px/32:.2f} columns = {px/224:.2f} screens (224 px tall)")
        print(f"  logic frames    : {frame}  ({frame/60.0:.1f} s at 60 Hz)")
        print(f"  final clock     : ${clock:04X} ({clock})")
        print(f"  spawn-op objects: {spawns}   bg elements: {bgelems}")
        print(f"  end state       : {ended}")
    return frame, px, cols_written


def cmd_cols(n, k=8):
    p = u32(T_BG_COLSTREAM + 4 * n)
    base = u32(T_BG_TILEBASE + 4 * n)
    print(f"stage{n} column stream ${p:06X}, tile base ${base:08X}")
    for c in range(k):
        w = [u32(p + c * 36 + 4 * r) for r in range(9)]
        print(f"  col{c:3d}  " + " ".join(f"{v:08X}" for v in w))
        print(f"        +base " + " ".join(f"{(v+base) & 0xFFFFFFFF:08X}" for v in w))


def cmd_elem(n):
    t = u32(T_BG_ELEMTABLE + 4 * n)
    nxt = u32(T_BG_ELEMTABLE + 4 * (n + 1)) if n < 4 else T_BG_ELEMTABLE
    cnt = (nxt - t) // 4
    print(f"stage{n} BG-element handler table ${t:06X}, {cnt} entries "
          f"(bounded by ${nxt:06X})")
    for i in range(cnt):
        print(f"  id {i:2d}  ${u32(t+4*i):06X}")


def cmd_tiles(n):
    """distinct tile words referenced by stage n's column stream"""
    p = u32(T_BG_COLSTREAM + 4 * n)
    end = u32(T_BG_PALETTE + 4 * n)
    base = u32(T_BG_TILEBASE + 4 * n)
    tiles, attrs = set(), set()
    ncol = (end - p) // 36
    for i in range((end - p) // 4):
        v = u32(p + 4 * i)
        s = (v + base) & 0xFFFFFFFF
        tiles.add(s >> 16)
        attrs.add(s & 0xFFFF)
    print(f"stage{n}: {ncol} columns, {ncol*9} map entries, "
          f"{len(tiles)} distinct tile numbers "
          f"${min(tiles):04X}..${max(tiles):04X}, {len(attrs)} distinct attr words: "
          + " ".join(f"${a:04X}" for a in sorted(attrs)[:16]))


if __name__ == "__main__":
    if D is None:
        raise SystemExit(f"{IMAGE} missing -- run `python derive.py` first")
    c = sys.argv[1]
    if c == "tables":
        cmd_tables()
    elif c == "script":
        cmd_script(int(sys.argv[2]))
    elif c == "scripts":
        cmd_scripts()
    elif c == "sim":
        cmd_sim(int(sys.argv[2]))
    elif c == "cols":
        cmd_cols(int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 8)
    elif c == "elem":
        cmd_elem(int(sys.argv[2]))
    elif c == "tiles":
        for i in range(5):
            cmd_tiles(i)
    else:
        raise SystemExit(__doc__)
