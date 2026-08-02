#!/usr/bin/env python3
"""Extract the metasprite records that `sub_8AAC` expands, into
games/gradius/assets/metasprites.json.

ROM-DERIVED OUTPUT. `assets/` is gitignored; this file must never be committed.

Kept separate from tools/export_assets.py on purpose: that tool belongs to a
parallel workstream and is being edited there. This one only appends a file.

WHAT IT READS, and why those addresses:

    8AAC: 0A         ASL A            metasprite id * 2, carry = id >= $80
    8AAD: B0 0A      BCS $8AB9
    8AAF: A8         TAY
    8AB0: BE 9E 8D   LDX $8D9E,Y      \\ low  byte
    8AB3: B9 9F 8D   LDA $8D9F,Y      / high byte    -> table A at $8D9E
    8AB9: A8         TAY
    8ABA: BE 9E 8E   LDX $8E9E,Y      \\
    8ABD: B9 9F 8E   LDA $8E9F,Y      /               -> table B at $8E9E

and each record is

    [count][dy][tile][attr][dx][dy][tile][attr][dx]...

from $8AC6 (count, 0 terminates) and the four loads at $8ACF/$8AD8/$8ADE/$8AE7.

THE CHECK THAT MATTERS, and it is run below (`--verify`): expanding id 1 must
reproduce, byte for byte, the four OAM records the cartridge actually had in
hardware OAM on a captured frame. tools/oracle/out/video/f1200/oam.bin holds
    slot 47  y=96 tile=$0D attr=$20 x=88
    slot 32  y=96 tile=$0B attr=$20 x=80
    slot 17  y=96 tile=$09 attr=$21 x=72
    slot  2  y=88 tile=$DF attr=$23 x=68
with $0360 = 80 and $0320 = 96. If that does not come out, the record format
above is wrong and this script says so instead of writing the file.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
REPO = GAME.parents[1]

TABLE_A = 0x8D9E          # $8AB0 LDX $8D9E,Y
TABLE_B = 0x8E9E          # $8ABA LDX $8E9E,Y
CURSOR_STEP = 0xC4        # $8AF4 ADC #$C4

# THE END OF THE HIGH TABLE, PROVEN BY THE ROM RATHER THAN GUESSED (wave 21).
#
# There is no bound check anywhere in $8AAC; `$8AAD BCS` sends every id >= $80
# to $8E9E and reads two bytes. So "which ids are real" is a fact about the
# DATA, and this is the byte that settles it:
#
#   $8EE0  id $A1's slot  =  E6 8E  ->  $8EE6
#   $8EE2  id $A2's slot  =  FB 95  ->  $95FB   (18 records, $95FB..$9643)
#   $8EE4  id $A3's slot  =  44 96  ->  $9644   (starts exactly where $A2 ends)
#   $8EE6  ...  id $A1's RECORD lives here, 9 bytes, ending $8EEF
#
# i.e. the table points AT ITS OWN LAST SLOT + 2. Slots $A4..$A8 would be
# $8EE6..$8EEF, which is $A1's payload -- and reading those five slots as
# pointers reproduces $A1's nine bytes exactly ($0402 $01DB $0400 $01DD $0108
# = 02 04 DB 01 00 04 DD 01 08). So the high table is $8E9E-$8EE5, 36 entries,
# ids $80-$A3, and there is nothing above $A3.
#
# THIS REPLACES `n > 16`, which was invented. $8AC6's loop has no upper limit
# on the record count and id $A2 is EIGHTEEN records; the old guard dropped it
# silently and drawMetasprite draws nothing for a missing id. It dropped eight
# other ids too ($A9 $AE $B9 $BA $C1 $CA $CB $F0) -- all of them above $A3, all
# of them CHR/sound bytes read as a count -- and five more junk ids with small
# counts ($B8 $C9 $D4 $F2 $FB) it happily KEPT. The id bound removes all
# thirteen and keeps $A2.
HIGH_TABLE_END = 0x8EE6   # first byte past id $A3's slot; == the value in $8EE0
MAX_ID = 0xA4             # ids $00-$A3


def load_prg() -> bytes:
    p = GAME / "assets" / "prg.bin"
    if not p.exists():
        raise SystemExit(f"{p} missing -- run tools/export_assets.py first")
    d = p.read_bytes()
    if len(d) != 0x8000:
        raise SystemExit(f"prg.bin is {len(d)} bytes, expected 32768")
    return d


def opcode_guard(prg: bytes, addr: int, want: int, what: str) -> None:
    """Abort if the instruction we cite is not the one that is there.

    Two real transcription errors were caught by exactly this class of guard
    while the asset exporter was written, so it is not ceremony.
    """
    got = prg[addr - 0x8000]
    if got != want:
        raise SystemExit(f"ABORT: {what} cites ${addr:04X} as opcode "
                         f"${want:02X} but the ROM has ${got:02X} there")


def records(prg: bytes, max_id: int = MAX_ID) -> dict[int, list[list[int]]]:
    def b(a): return prg[a - 0x8000]

    # The bound above is a claim until this runs. $8EE0 is id $A1's slot.
    last_slot = TABLE_B + ((0xA3 * 2) & 0xFF)            # $8EE4
    if last_slot + 2 != HIGH_TABLE_END:
        raise SystemExit(f"ABORT: id $A3's slot is ${last_slot:04X}, so the high "
                         f"table would end at ${last_slot + 2:04X}, not "
                         f"${HIGH_TABLE_END:04X}")
    a1_ptr = b(TABLE_B + ((0xA1 * 2) & 0xFF)) | (b(TABLE_B + ((0xA1 * 2) & 0xFF) + 1) << 8)
    if a1_ptr != HIGH_TABLE_END:
        raise SystemExit(f"ABORT: id $A1's pointer reads ${a1_ptr:04X}, not "
                         f"${HIGH_TABLE_END:04X} -- the argument that the high "
                         f"table ends at id $A3 rests on that byte and it moved")

    out: dict[int, list[list[int]]] = {}
    for mid in range(max_id):
        doubled = (mid * 2) & 0xFF
        table = TABLE_B if mid >= 0x80 else TABLE_A      # $8AAD BCS
        ptr = b(table + doubled) | (b(table + doubled + 1) << 8)
        if not (0x8000 <= ptr <= 0xFFFE):
            continue                                     # not a pointer
        n = b(ptr)                                       # $8AC6, 0 = nothing
        if n == 0:
            continue                                     # $8AC8 BEQ $8B02
        if ptr + 1 + n * 4 > 0x10000:
            raise SystemExit(f"ABORT: id ${mid:02X} at ${ptr:04X} claims {n} "
                             f"records, which runs past $FFFF")
        recs = []
        for i in range(n):
            o = ptr + 1 + i * 4
            recs.append([b(o), b(o + 1), b(o + 2), b(o + 3)])   # dy tile attr dx
        out[mid] = recs

    # $A2 is the record the invented `n > 16` guard dropped. Pin it by extent,
    # not by count: 18 records is 1 + 72 bytes, $95FB..$9643, and $A3's record
    # starts at $9644. If either moves this is not the table I read.
    if 0xA2 not in out or len(out[0xA2]) != 18:
        raise SystemExit(f"ABORT: id $A2 is {len(out.get(0xA2, []))} records, "
                         f"expected 18")
    a2 = b(TABLE_B + ((0xA2 * 2) & 0xFF)) | (b(TABLE_B + ((0xA2 * 2) & 0xFF) + 1) << 8)
    a3 = b(TABLE_B + ((0xA3 * 2) & 0xFF)) | (b(TABLE_B + ((0xA3 * 2) & 0xFF) + 1) << 8)
    if a2 != 0x95FB or a3 != 0x9644 or a2 + 1 + 18 * 4 != a3:
        raise SystemExit(f"ABORT: $A2 at ${a2:04X} + 1 + 18*4 = "
                         f"${a2 + 73:04X} but $A3 is at ${a3:04X}")
    return out


# ==========================================================================
# THE CHECK THAT WOULD HAVE CAUGHT $A2: does every id the ROM NAMES exist?
#
# $A2 did not throw. `drawMetasprite` returns the cursor unchanged for a
# missing record, so the boss's death explosion would simply have drawn
# nothing -- the one failure mode this project has agreed not to have. A
# missing record is only detectable by asking the other direction: enumerate
# every id the cartridge can put into the anim field and demand it be present.
#
# THE ANIM FIELD IS `$0120 + slot`. $8B4D `LDA $0120,X` is what makes an object
# visible at all, and the enemy handlers write it as `STA $012C,X` (base + 12,
# where the enemy slots start). So this scans the whole PRG for a store into
# $0120-$013F and resolves the value from the instruction immediately before.
ANIM_LO, ANIM_HI = 0x0120, 0x0140

# The six explosion-script pointers. $AEA8 LDA $AE71,Y (Y = $016C,X * 2) then
# LDA ($98),Y with Y = $042C,X -- every non-zero byte of a script is an id.
EXPLOSION_PTRS = 0xAE71
EXPLOSION_N = 6


def referenced_ids(prg: bytes) -> dict[int, list[str]]:
    """Every metasprite id the ROM can write into $0120,X, with its site."""
    def b(a): return prg[a - 0x8000]
    def w(a): return b(a) | (b(a + 1) << 8)

    refs: dict[int, list[str]] = {}
    def add(mid, why):
        refs.setdefault(mid, []).append(why)

    # (a) the explosion scripts -- this is where $A2 lives (scripts 4 and 5)
    for s in range(EXPLOSION_N):
        p = w(EXPLOSION_PTRS + 2 * s)
        if not 0x8000 <= p < 0x10000:
            raise SystemExit(f"ABORT: explosion script {s} -> ${p:04X}")
        a = p
        while b(a) != 0:                             # a 0 byte ends the script
            add(b(a), f"explosion script {s} (${a:04X})")
            a += 1
            if a - p > 64:
                raise SystemExit(f"ABORT: explosion script {s} at ${p:04X} has "
                                 f"no 0 terminator in 64 bytes")

    # (b) LDA #imm immediately followed by a store into the anim field.
    #     A9 imm | 9D lo hi (STA abs,X) / 99 (STA abs,Y) / 8D (STA abs)
    for a in range(0x8000, 0xFFFD):
        if b(a) != 0xA9:                             # LDA #imm
            continue
        st = a + 2
        if b(st) not in (0x9D, 0x99, 0x8D):
            continue
        tgt = w(st + 1)
        if ANIM_LO <= tgt < ANIM_HI:
            add(b(a + 1), f"${a:04X} LDA #${b(a + 1):02X} / ${st:04X} "
                          f"STA ${tgt:04X}")
    return refs


def check_ids(table: dict[int, list[list[int]]], prg: bytes) -> list[str]:
    """Loud on any id the ROM names that the export does not contain."""
    bad = []
    for mid, whys in sorted(referenced_ids(prg).items()):
        # Id 0 is not a metasprite: $8B50 `BEQ $8B89` skips any slot whose
        # $0120,X is 0, so `LDA #$00 / STA $0120,X` is the ROM's way of making
        # an object invisible and never reaches $8AAC. Six sites write it.
        if mid == 0:
            continue
        if mid not in table:
            bad.append(f"  MISSING metasprite ${mid:02X} -- named by "
                       + "; ".join(whys[:3])
                       + (f" (+{len(whys) - 3} more)" if len(whys) > 3 else ""))
    return bad


def verify(table: dict[int, list[list[int]]]) -> list[str]:
    """Expand id 1 and compare against the cartridge's own hardware OAM."""
    oam_path = GAME / "tools/oracle/out/video/f1200/oam.bin"
    ram_path = GAME / "tools/oracle/out/video/f1200/ram.bin"
    if not (oam_path.exists() and ram_path.exists()):
        return ["SKIP: no captured frame at tools/oracle/out/video/f1200/ "
                "(ROM-derived, regenerate with tools/oracle/videoprobe.py --at 1200)"]
    oam = oam_path.read_bytes()
    ram = ram_path.read_bytes()
    base_x, base_y = ram[0x360], ram[0x320]

    # The list in hardware OAM was built on the PREVIOUS frame from a base of
    # 188: $2F reads 4 here, and 188 + $44 = 256 -> $8B3E's BNE fails -> +4.
    cursor = 188
    got, want = [], []
    for dy, tile, attr, dx in table[1]:
        y = (base_y + dy) & 0xFF
        x = (base_x + dx) & 0xFF
        got.append((cursor // 4, y, tile, attr, x))
        want.append((cursor // 4, oam[cursor], oam[cursor + 1],
                     oam[cursor + 2], oam[cursor + 3]))
        cursor = (cursor + CURSOR_STEP) & 0xFF
        if cursor == 0:
            cursor = (cursor + CURSOR_STEP) & 0xFF

    msgs = []
    for g, w in zip(got, want):
        ok = g == w
        msgs.append(("  [PASS] " if ok else "  [FAIL] ")
                    + f"slot {g[0]:2d} model y={g[1]} tile=${g[2]:02X} "
                      f"attr=${g[3]:02X} x={g[4]}   cart y={w[1]} "
                      f"tile=${w[2]:02X} attr=${w[3]:02X} x={w[4]}")
    if got != want:
        msgs.append("  metasprite record format does NOT match the cartridge")
    return msgs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()

    prg = load_prg()
    opcode_guard(prg, 0x8AAC, 0x0A, "sub_8AAC ASL A")
    opcode_guard(prg, 0x8AB0, 0xBE, "table A LDX $8D9E,Y")
    opcode_guard(prg, 0x8ABA, 0xBE, "table B LDX $8E9E,Y")
    opcode_guard(prg, 0x8AF4, 0x69, "cursor step ADC #imm")
    if prg[0x8AF5 - 0x8000] != CURSOR_STEP:
        raise SystemExit("ABORT: $8AF5 is not #$C4")

    table = records(prg)
    msgs = verify(table)
    print("verify metasprite id 1 against hardware OAM at frame 1200:")
    for m in msgs:
        print(m)
    if any("[FAIL]" in m for m in msgs):
        return 1

    refs = referenced_ids(prg)
    gaps = check_ids(table, prg)
    print(f"cross-reference: {len(refs)} ids are named by an explosion script "
          f"or an `LDA #imm / STA $012x,X` pair (the TABLE-sourced ids -- e.g. "
          f"the boss's $B8EF damage frames -- need the exported blocks to "
          f"resolve and are checked by tools/tablecoverage.py)")
    if gaps:
        print("METASPRITE IDS THE ROM NAMES AND THE EXPORT DOES NOT HAVE:")
        for g in gaps:
            print(g)
        print("  drawMetasprite() draws NOTHING for a missing id -- this is a "
              "silent failure, which is why it is checked here.")
        return 1
    if args.verify_only:
        return 0

    out = GAME / "assets" / "metasprites.json"
    out.write_text(json.dumps({
        "note": "ROM-DERIVED. Do not commit. Rebuild with tools/export_metasprites.py",
        "readBy": "$8AAC sub_8AAC",
        "tables": {"low": f"${TABLE_A:04X}", "high": f"${TABLE_B:04X}"},
        "format": "id -> [[dy, tile, attr, dx], ...]",
        "records": {str(k): v for k, v in sorted(table.items())},
    }, indent=1))
    print(f"wrote {out}  ({len(table)} metasprites)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
