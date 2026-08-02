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


def records(prg: bytes, max_id: int = 0x100) -> dict[int, list[list[int]]]:
    def b(a): return prg[a - 0x8000]

    out: dict[int, list[list[int]]] = {}
    for mid in range(max_id):
        doubled = (mid * 2) & 0xFF
        table = TABLE_B if mid >= 0x80 else TABLE_A      # $8AAD BCS
        ptr = b(table + doubled) | (b(table + doubled + 1) << 8)
        if not (0x8000 <= ptr <= 0xFFFE):
            continue                                     # not a pointer
        n = b(ptr)                                       # $8AC6, 0 = nothing
        if n == 0 or n > 16:
            continue
        if ptr + 1 + n * 4 > 0x10000:
            continue
        recs = []
        for i in range(n):
            o = ptr + 1 + i * 4
            recs.append([b(o), b(o + 1), b(o + 2), b(o + 3)])   # dy tile attr dx
        out[mid] = recs
    return out


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
