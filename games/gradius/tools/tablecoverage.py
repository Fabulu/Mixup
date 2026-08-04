#!/usr/bin/env python3
"""tablecoverage.py -- does the EXPORT ship every table the port INDEXES?

WHY THIS EXISTS. Wave 15 crashed on `$B086`/`$B088`: a ported handler indexed a
ROM table nobody had exported. Wave 20's census found 28 more ranges in the same
state, so 24 of the 29 unported handlers were going to repeat it one at a time.
That is the LOUD half of the problem and `romByteReader`'s throw handles it.

The QUIET half is metasprite `$A2`: `export_metasprites.py` dropped an 18-record
entry behind an invented `n > 16` bound, and `drawMetasprite` returns the cursor
unchanged for a missing id -- so the boss's death explosion would have DRAWN
NOTHING and thrown nothing. A missing record is invisible from the port's side.
It is only visible by asking the other direction: enumerate what the CARTRIDGE
names and demand the export contain it.

So this tool goes both ways, off `assets/prg.bin` and the shipped JSON, with
nothing hand-maintained in between:

  1. TABLES. Walk all 42 `$AE1C` dispatch targets and `$C413` (the second
     spawner) with the real decoder; collect every `LDA/LDX/LDY/CMP/ADC/SBC
     abs,X|abs,Y` whose base is in PRG. Every one of those bases is a table the
     port must be able to read. Cross-reference against the exported byte
     ranges of every assets/*/tables.json. Report the gaps.

  2. METASPRITE IDS. Every id the cartridge can put in the anim field
     (`$0120 + slot`; `$8B4D LDA $0120,X` is what makes an object visible at
     all) must exist in assets/metasprites.json. Three sources:
       (a) the six explosion scripts at `$AE71`,
       (b) `LDA #imm` immediately followed by a store into $0120-$013F,
       (c) `LDA table,Y|table,X` followed within six instructions by such a
           store -- the table's bytes are ids. TWO HEURISTICS, both labelled
           at the code below because both got this wrong once: the window
           walks PAST conditional branches (the store is often two branches
           downstream, as at `$B936`) but stops at a competing non-immediate
           `LDA`; and the table EXTENT is taken as "up to the next indexed
           base inside the same exported block, else the block end".

  python games/gradius/tools/tablecoverage.py [--verbose]

Exit 1 on any gap. Nothing is written.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dis6502 import decode, BRANCH, STOP, ABS, ABX, ABY, IMM     # noqa: E402

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ASSETS = GAME / "assets"

DISPATCH = 0xAE1C          # $AE19 JSR $83E4, 42 entries
NENT = 42
LATE_SPAWNER = 0xC413      # the second spawner; its own $83E4 at $C439

# WAVE 32b.  THE ROOT SET WAS NARROWER THAN THE GREEN READ.
#
# This tool walked from the 42 $AE1C entries plus $C413 and reported OK, and
# W32's recon then found SEVEN unexported ranges (120 bytes) that the ROM does
# index -- because the routines that read them are not reachable from those
# roots.  A green here is a statement about the walk, not about the cartridge,
# and it stayed green with all seven missing.
#
# The roots below close that.  Each is an entry point the FRAME reaches
# directly rather than through the enemy dispatch:
#
#   $8BD9   inside sub_$8B10 ($80A7), the stage-5 arm sprite pass -> $8C06,
#           which indexes $8BF2 and $8C02.  NOT a subroutine: $8B91 BEQ jumps
#           in and $8BF0 BMI falls back out, so it has no xref a call-graph
#           walk would follow.
#   $CB91   the arm driver, reached from $9691 (the $9663 fork) and from
#           $9A76 -> $C772 -> $CB8A.  Indexes $CBCA, and calls $CC33/$CC99,
#           which index $CC1F, $CD65 and $CD85.
#   $BEF3   the shot-vs-arm sweep, reached from $C037 inside $BFE2.  Indexes
#           $BEEA.  W32b rooted it while it was still unported, because the
#           tool's job is to report what the ROM indexes, not what the port has
#           reached; W32c ported it.
#
# WAVE 32c ADDS A FOURTH, $A16F, and the reason is the same class of blindness:
# the MISSILE loop hangs off $9FFC (the player), not off the enemy dispatch, so
# it was outside the walk.  W32c ported its $A17C stage-5 arm -- the SIXTH
# `$19 == 4` site in the PRG, which W32a's five-wall list did not have -- and
# the loop indexes $A1A4/$A1A6/$A1A8, three two-byte fly/crawl rows.  MEASURED
# when it was added: the walk goes from 78 indexed bases to 81 and the tool
# still reports OK, so those three were ALREADY exported.  It is rooted anyway,
# because "already covered" is a fact to be re-checked on every run and not a
# reason to leave a live routine outside the walk.
#
# $9663 IS DELIBERATELY NOT A ROOT, and the recon's §6 recommendation to add it
# was wrong.  Its own body -- the four-header census -- indexes nothing: four
# absolute LDAs and an INX.  Rooting it instead drags in the whole of mode 5
# ($A2C0, $ADAB, $9FFC, $C0C7 and $9A8C's tail), and with it seventeen TERRAIN
# and STREAMER tables that ARE exported, just decoded into
# `terrain/stages.json` rather than raw into one of TABLE_FILES.  Measured:
# adding it turns this tool from 1 gap into 20, none of them real.  The three
# roots above are the ones that reach the seven ranges the recon actually
# found.
#
# THE LESSON, and it is worth more than the four lines: a coverage tool's ROOT
# SET is an assumption, and this one carried "every table is read by an $AE1C
# handler" for eleven waves.  Anything reached from the NMI's own order
# ($80A7's sprite pass, $80AA's state machine) was outside it.
STAGE5_ROOTS = [0x8BD9, 0xCB91, 0xBEF3, 0xA16F]
ANIM_LO, ANIM_HI = 0x0120, 0x0140
EXPLOSION_PTRS, EXPLOSION_N = 0xAE71, 6
INDEXERS = ("LDA", "LDX", "LDY", "CMP", "ADC", "SBC")

TABLE_FILES = ["enemies/tables.json", "flow/tables.json",
               "collision/tables.json", "weapons/tables.json",
               "sound/tables.json"]

# `hud/packets.json` exports the same thing in a different shape: a decoded
# `table` of N pointer entries at $864E plus every packet they point at. It is
# still an exported range, so it is folded in below rather than excused.
HUD_PACKETS = "hud/packets.json"

# GAPS THAT ARE OUT OF SCOPE, NAMED AND PRINTED EVERY RUN rather than silently
# whitelisted. Removing an entry here must be a deliberate edit.
#
#   $CF2D/$CF2E  the ENDING chain canned-packet pointers ($CEB6/$CEBB LDA
#                $CF2D,X). Reached only through entry 40 ($BB0F -> $CE94) when
#                $048C != 0 and $4F != $FF. 20-plan-completeness.md 5 excludes
#                the ending chain from this plan; when it is taken, export
#                $CF2D-$CF3A (7 pointers, all $CF3B) and the flat script.
KNOWN_GAPS = {
    0xCF2D: "ending chain ($CE94), excluded by 20-plan-completeness.md 5",
    0xCF2E: "ending chain ($CE94), excluded by 20-plan-completeness.md 5",
}


class Prg:
    """dis6502.Rom reads a .nes; this reads the exported prg.bin directly, so
    the tool runs in a tree that has assets/ but not the cartridge."""

    def __init__(self, data: bytes):
        if len(data) != 0x8000:
            raise SystemExit(f"prg.bin is {len(data)} bytes, expected 32768")
        self.d = data

    def b(self, a):                                    # mapper 3: no banking
        return self.d[a - 0x8000] if 0x8000 <= a <= 0xFFFF else 0

    def w(self, a):
        return self.b(a) | (self.b(a + 1) << 8)


def walk(rom: Prg, entry: int, limit: int = 6000):
    """Linear + branch walk from one root. Returns (reached, indexed)."""
    seen, work, indexed = set(), [entry], {}
    while work:
        pc = work.pop()
        while True:
            if pc in seen or not (0x8000 <= pc < 0x10000):
                break
            seen.add(pc)
            mn, mode, ln, arg, _txt = decode(rom, pc)
            if mode in (ABX, ABY) and mn in INDEXERS and arg >= 0x8000:
                indexed.setdefault(arg, set()).add(pc)
            if mn in BRANCH:
                work.append(arg)
            elif mn == "JSR":
                work.append(arg)
            elif mn == "JMP" and mode == ABS:
                work.append(arg)
                break
            elif mn in STOP or mn == "???":
                break
            pc += ln
            if len(seen) > limit:
                break
    return seen, indexed


def exported_blocks(rom: "Prg") -> list[dict]:
    """Every exported byte range, from every assets/*/tables.json + the HUD."""
    out = []
    p = ASSETS / HUD_PACKETS
    if not p.exists():
        raise SystemExit(f"{p} missing -- run tools/export_assets.py first")
    hud = json.loads(p.read_text(encoding="utf-8"))["table"]
    base = int(hud["rom"].lstrip("$"), 16)
    n = hud["entries"] * 2                             # $85F7/$85FC, lo/hi rows
    out.append({"file": HUD_PACKETS, "name": "cannedPacketPtrs", "base": base,
                "end": base + n,
                "bytes": [rom.b(base + i) for i in range(n)]})
    for rel in TABLE_FILES:
        p = ASSETS / rel
        if not p.exists():
            raise SystemExit(f"{p} missing -- run tools/export_assets.py first")
        j = json.loads(p.read_text(encoding="utf-8"))
        for blk in j["blocks"]:
            base = int(blk["rom"].lstrip("$"), 16)
            out.append({"file": rel, "name": blk["name"], "base": base,
                        "end": base + len(blk["bytes"]),
                        "bytes": blk["bytes"]})
    return sorted(out, key=lambda b: b["base"])


def find_block(blocks, addr):
    for b in blocks:
        if b["base"] <= addr < b["end"]:
            return b
    return None


def collect_indexed(rom: Prg):
    """base -> reader addresses, over the 42 handlers + $C413 + STAGE5_ROOTS."""
    roots = ([rom.w(DISPATCH + 2 * i) for i in range(NENT)]
             + [LATE_SPAWNER] + STAGE5_ROOTS)
    allidx: dict[int, set] = {}
    for r in roots:
        _seen, idx = walk(rom, r)
        for a, sites in idx.items():
            allidx.setdefault(a, set()).update(sites)
    return allidx


# ------------------------------------------------------------------ metasprites
def referenced_ids(rom: Prg, blocks, indexed):
    """id -> [why], from the three sources described in the docstring."""
    refs: dict[int, list[str]] = {}

    def add(mid, why):
        refs.setdefault(mid, []).append(why)

    for s in range(EXPLOSION_N):                       # (a)
        p = rom.w(EXPLOSION_PTRS + 2 * s)
        a = p
        while rom.b(a) != 0 and a - p <= 64:
            add(rom.b(a), f"explosion script {s} (${a:04X})")
            a += 1

    for a in range(0x8000, 0xFFFD):                    # (b)
        if rom.b(a) != 0xA9:                           # LDA #imm
            continue
        st = a + 2
        if rom.b(st) in (0x9D, 0x99, 0x8D) and ANIM_LO <= rom.w(st + 1) < ANIM_HI:
            add(rom.b(a + 1),
                f"${a:04X} LDA #${rom.b(a + 1):02X} -> ${rom.w(st + 1):04X}")

    # (c) LDA table,Y  ...  STA $012x,X   within four instructions.
    #     The bases come from the same walk the table half uses, so an id table
    #     no handler reads is not searched for.
    bases = sorted(indexed)
    for a in range(0x8000, 0xFFFD):
        if rom.b(a) not in (0xB9, 0xBD):               # LDA abs,Y / abs,X
            continue
        base = rom.w(a + 1)
        if base not in indexed:
            continue
        # Walk FORWARD past conditional branches, not up to them. $B936 is
        # `LDA $B8EF,Y / BEQ $B962 / CMP $012C,X / BEQ $B9A8 / STA $012C,X`:
        # the store is two branches downstream on the fall-through path, and
        # stopping at the first BEQ made this check miss the boss's own damage
        # frames ($6C-$71) entirely. Seen to happen; the window is 6 now.
        pc, hit = a + 3, None
        for _ in range(6):
            if not 0x8000 <= pc < 0xFFFD:
                break
            mn, mode, ln, arg, _t = decode(rom, pc)
            if mn == "STA" and mode in (ABS, ABX, ABY) and ANIM_LO <= arg < ANIM_HI:
                hit = arg
                break
            # A COMPETING TABLE LOAD ENDS THE WINDOW. Without this, $C6A6
            # `LDA $C6CE,Y / STA $032C,X` ran on into $C6B3 `LDA $C6CA,Y /
            # STA $012C,X` six bytes later and this check claimed $C6CE's
            # position bytes were metasprite ids. (It only ever ADDS demands,
            # so it could not have passed something bad -- but it was
            # attributing to the wrong table.)
            #
            # `LDA #imm` does NOT end it, and that is deliberate: $AF21 is
            # `LDA $AF0A,Y / BNE $AF28 / LDA #$00 / STA $012C,X`. The immediate
            # is the blink-OFF path ($AF18 BCS $AF26); on the path where the
            # table byte survives to the store, it is not executed. Breaking
            # there lost all six blinking-pickup ids.
            if mn in ("PLA", "TXA", "TYA") or (mn == "LDA" and mode != IMM):
                break
            if mn in STOP or mn == "JSR":
                break
            pc += ln
        if hit is None:
            continue
        blk = find_block(blocks, base)
        if blk is None:
            continue                                   # the table half reports it
        # EXTENT HEURISTIC, stated as one: the table runs to the next base any
        # handler indexes inside the same block, or to the block end.
        nxt = next((x for x in bases
                    if blk["base"] <= x < blk["end"] and x > base), blk["end"])
        for off in range(base, nxt):
            v = blk["bytes"][off - blk["base"]]
            if v == 0:
                continue                               # 0 = invisible/terminator
            add(v, f"${a:04X} LDA ${base:04X},Y -> ${hit:04X} "
                   f"(byte ${off:04X} of block {blk['name']})")
    return refs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    rom = Prg((ASSETS / "prg.bin").read_bytes())
    blocks = exported_blocks(rom)
    indexed = collect_indexed(rom)

    missing, known = [], []
    for b in sorted(indexed):
        if find_block(blocks, b) is not None:
            continue
        (known if b in KNOWN_GAPS else missing).append(b)

    print(f"TABLES: {len(indexed)} PRG bases indexed by the 42 $AE1C handlers "
          f"+ $C413 + {len(STAGE5_ROOTS)} stage-5 roots; {len(blocks)} exported ranges "
          f"({sum(b['end'] - b['base'] for b in blocks)} bytes)")
    if args.verbose:
        for base in sorted(indexed):
            blk = find_block(blocks, base)
            where = f"{blk['file']}:{blk['name']}" if blk else "*** NOT EXPORTED"
            print(f"  ${base:04X}  read by "
                  + " ".join(f"${s:04X}" for s in sorted(indexed[base])[:4])
                  + f"   {where}")
    for base in known:
        print(f"  KNOWN GAP ${base:04X} (read by "
              + " ".join(f"${s:04X}" for s in sorted(indexed[base]))
              + f"): {KNOWN_GAPS[base]}")
    for base in missing:
        print(f"  *** ${base:04X} is indexed by "
              + " ".join(f"${s:04X}" for s in sorted(indexed[base]))
              + " and is in NO exported range")

    ms_path = ASSETS / "metasprites.json"
    if not ms_path.exists():
        raise SystemExit(f"{ms_path} missing -- run tools/export_metasprites.py")
    have = set(int(k) for k in
               json.loads(ms_path.read_text(encoding="utf-8"))["records"])
    refs = referenced_ids(rom, blocks, indexed)
    # $8B50 `BEQ $8B89` skips any slot whose $0120,X is 0, so id 0 is the ROM
    # way of making an object invisible and never reaches $8AAC. Not an id.
    gaps = [(m, w) for m, w in sorted(refs.items()) if m != 0 and m not in have]

    print(f"METASPRITES: {len(refs) - (1 if 0 in refs else 0)} ids named by the "
          f"ROM, {len(have)} exported")
    if args.verbose:
        for mid in sorted(refs):
            mark = "ok " if mid in have or mid == 0 else "***"
            print(f"  {mark} ${mid:02X}  {refs[mid][0]}")
    for mid, whys in gaps:
        print(f"  *** metasprite ${mid:02X} is named by "
              + "; ".join(whys[:3])
              + (f" (+{len(whys) - 3} more)" if len(whys) > 3 else "")
              + " and is NOT in metasprites.json -- drawMetasprite() would "
                "draw nothing and throw nothing")

    if missing or gaps:
        print(f"FAIL: {len(missing)} unexported table(s), "
              f"{len(gaps)} missing metasprite(s)")
        return 1
    print("OK: every table the handlers index is exported, and every metasprite "
          "id the ROM names exists")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
