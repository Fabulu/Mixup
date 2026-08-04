#!/usr/bin/env python3
r"""W36 -- THE STAGE-1 HANDLER INVENTORY, enumerated STATICALLY out of the ROM.

`docs/knowledge/09`: the ROM is the inventory, the oracle is the verdict.  This
script produces the DENOMINATORS for wave 36 and nothing else -- it runs no
emulator, compares nothing, and every number it prints is read out of
`out/maincpu.bin` (the decrypted build-B image, address == file offset).

WHAT IT CAN AND CANNOT SEE -- inherited by every count below:

  CAN     absolute-long `jsr`/`jmp` ($4EB9/$4EF9), PC-relative `bsr.w`/`bsr.b`,
          `bra`/`bcc`/`dbcc` displacements, and `jsr/jmp (d16,PC)`.
  CANNOT  `jsr (An)` through a register the walk cannot resolve, or a computed
          target.

so every "N targets" is a LOWER BOUND and a zero is "no site of the kinds
above", never "nothing does this".

  python w36handlers.py             the whole inventory
  python w36handlers.py body 26A5E4 walk one routine and print it
"""
from __future__ import annotations

import re
import struct
import sys
from pathlib import Path

from capstone import CS_ARCH_M68K, CS_MODE_M68K_030, Cs

HERE = Path(__file__).resolve().parent
IMG = HERE / "out" / "maincpu.bin"
D = IMG.read_bytes()
LO, HI = 0x230000, 0x2A0000          # build B

md = Cs(CS_ARCH_M68K, CS_MODE_M68K_030)

# ------------------------------------------------------------------ the tables
SPAWN_SCRIPT = 0x230C6C              # stage 1's spawn script, 8-byte records
TYPE_TAB_LO = 0x267824               # types $00..$7F, stride 8
TYPE_TAB_HI = 0x27E412               # types $80..$FF
DUMMY_INIT = (0x267814, 0x27E402)
DUMMY_HAND = (0x26781C, 0x27E40A)


def u16(a: int) -> int:
    return struct.unpack_from(">H", D, a)[0]


def u32(a: int) -> int:
    return struct.unpack_from(">I", D, a)[0]


def type_entry(t: int) -> int:
    """The 8-byte dispatcher entry for enemy type `t`, read the way `$2635F6`
    reads it: `lea $267824 / cmpi.w #$80 / lea $27E412 / lsl.w #3`."""
    base = TYPE_TAB_LO if t < 0x80 else TYPE_TAB_HI - 0x80 * 8
    return base + t * 8


def init_of(t: int) -> int:
    return u32(type_entry(t))


def handler_of(t: int) -> int:
    return u32(type_entry(t) + 4)


def stage1_records() -> list[tuple[int, int, int, int, int]]:
    """(addr, clk, param, typeword, param2) for every record until `$FFFF`."""
    out = []
    a = SPAWN_SCRIPT
    while u16(a) != 0xFFFF:
        out.append((a, u16(a), u16(a + 2), u16(a + 4), u16(a + 6)))
        a += 8
    return out


# ------------------------------------------------------- the routine-body walk
BRANCH = re.compile(r"^(b[a-z]{2}|dbf|db[a-z]{2})(\.[bwls])?$")
STOP = {"rts", "rte", "rtr", "rtd"}


def walk_body(start: int, limit: int = 0x4000):
    """Follow every intra-routine branch from `start` and return
    `(instructions, external_targets)`.

    An instruction is IN the body if control reaches it by fall-through or by a
    conditional/unconditional branch DISPLACEMENT.  `jsr`/`bsr` targets are
    external (they come back).  A `jmp`/`bra` to an absolute address outside the
    walked span is external and TERMINATES that path -- which is exactly the
    fall-through trap's shape, so the caller must look at those by hand.
    """
    seen: dict[int, str] = {}
    ext: dict[int, list[str]] = {}
    work = [start]
    while work:
        pc = work.pop()
        while True:
            if pc in seen or pc < LO or pc >= HI or len(seen) > limit:
                break
            got = list(md.disasm(D[pc:pc + 16], pc, count=1))
            if not got:
                seen[pc] = ".word (undecodable)"
                break
            i = got[0]
            seen[pc] = f"{i.mnemonic:8s} {i.op_str}"
            mn = i.mnemonic
            nxt = pc + len(i.bytes)

            # call sites -- always external, control returns
            if mn in ("jsr", "bsr") or mn.startswith("bsr."):
                tgt = _target(i)
                if tgt is not None:
                    ext.setdefault(tgt, []).append(f"{pc:06X}/{mn}")
                pc = nxt
                continue

            if mn == "jmp":
                # A TAIL CALL.  Never walked -- walking it would swallow the
                # callee into this routine's span and hide it from the external
                # list, which is precisely the fall-through trap wearing the
                # opposite disguise.  Recorded and left for a human to read.
                tgt = _target(i)
                if tgt is not None:
                    ext.setdefault(tgt, []).append(f"{pc:06X}/jmp")
                break

            if mn in STOP:
                break

            if BRANCH.match(mn) or BRANCH.match(mn.split(".")[0]):
                tgt = _target(i)
                if tgt is not None and LO <= tgt < HI:
                    work.append(tgt)
                if mn.split(".")[0] in ("bra",):
                    break
            pc = nxt
    return seen, ext


def _target(i) -> int | None:
    """The last `$xxxx` in the operand, which for every control-transfer form
    capstone emits here (`jsr $24179e.l`, `bne.w $29709e`, `jsr $2453ac(pc)`,
    `dbra d0,$2970aa`) is the destination.  Anything with a register index
    (`jmp (a0)`, `jsr (a1)`) has no `$` and returns None -- and those are the
    LOWER-BOUND cases this file's header names."""
    op = i.op_str.strip()
    m = re.fullmatch(r"(?:[^,]*,)?\$([0-9a-fA-F]{1,8})(?:\.[lw]|\(pc\))?", op)
    if not m:
        return None                      # register-indirect / indexed: unresolvable
    return int(m.group(1), 16)


# --------------------------------------------------------------------- reports
def inventory() -> None:
    recs = stage1_records()
    end = SPAWN_SCRIPT + 8 * len(recs)
    by_type: dict[int, int] = {}
    for r in recs:
        by_type[r[3] >> 8] = by_type.get(r[3] >> 8, 0) + 1

    by_hand: dict[int, dict] = {}
    for t, n in by_type.items():
        h = handler_of(t)
        e = by_hand.setdefault(h, {"recs": 0, "types": set()})
        e["recs"] += n
        e["types"].add(t)

    print(f"STAGE-1 SPAWN SCRIPT ${SPAWN_SCRIPT:06X}..${end + 1:06X}"
          f"  ($FFFF terminator at ${end:06X})")
    print(f"  {len(recs)} records / {len(by_type)} distinct types /"
          f" {len(by_hand)} distinct handlers")
    print()
    ported = PORTED
    tot_p = sum(v["recs"] for h, v in by_hand.items() if h in ported)
    print(f"{'handler':>10} {'recs':>5}  types                 ported")
    for h, v in sorted(by_hand.items(), key=lambda kv: -kv[1]["recs"]):
        ts = " ".join(f"${t:02X}" for t in sorted(v["types"]))
        print(f"  ${h:06X} {v['recs']:5d}  {ts:20s}  {'YES' if h in ported else '--'}")
    print()
    print(f"PORTED {sum(1 for h in by_hand if h in ported)} of {len(by_hand)}"
          f" handlers, owning {tot_p} of {len(recs)} spawn records")
    print(f"UNPORTED {sum(1 for h in by_hand if h not in ported)}"
          f" owning {len(recs) - tot_p}")
    print()

    # ---- the types stage 1 reaches that the SCRIPT does not name (W33 §2.2)
    print("TYPES REACHED BUT NOT SCRIPTED (W33 §2.2, re-derived):")
    for t in (0x1C, 0x1E, 0x23):
        print(f"  ${t:02X}  init ${init_of(t):06X}  handler ${handler_of(t):06X}"
              f"  {'PORTED' if handler_of(t) in ported else 'unported'}")
    print()

    # ---- the shape of each unported body
    print("THE UNPORTED BODIES -- extent, instruction count, external targets")
    for h, v in sorted(by_hand.items(), key=lambda kv: -kv[1]["recs"]):
        if h in ported:
            continue
        seen, ext = walk_body(h)
        lo_a, hi_a = min(seen), max(seen)
        outside = {t: s for t, s in ext.items() if not (lo_a <= t <= hi_a)}
        print(f"\n  ${h:06X}  types {' '.join('$%02X' % t for t in sorted(v['types']))}"
              f"  recs {v['recs']}")
        print(f"    span ${lo_a:06X}..${hi_a:06X}   {len(seen)} instructions"
              f"   {len(outside)} external targets")
        for t in sorted(outside):
            print(f"      -> ${t:06X}   {' '.join(outside[t])}")


# The port's own handler table, so the ported/unported split is not a constant
# this file carries.  Parsed out of the sources at run time.
def _read_ported() -> set[int]:
    src = HERE.parent.parent / "src"
    out: set[int] = set()
    for f in ("handlers.js", "midboss.js"):
        txt = (src / f).read_text(encoding="utf-8", errors="replace")
        m = re.search(r"const HANDLERS = new Map\(\[(.*?)\]\);", txt, re.S)
        if m:
            out |= {int(x, 16) for x in re.findall(r"\[0x([0-9a-f]+),", m.group(1))}
    return out


PORTED = _read_ported()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "body":
        a = int(sys.argv[2], 16)
        seen, ext = walk_body(a)
        for pc in sorted(seen):
            print(f"  {pc:06X}: {seen[pc]}")
        print(f"\n{len(seen)} instructions, span ${min(seen):06X}..${max(seen):06X}")
        for t in sorted(ext):
            print(f"  -> ${t:06X}  {' '.join(ext[t])}")
    else:
        inventory()
