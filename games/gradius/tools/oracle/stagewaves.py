#!/usr/bin/env python3
"""stagewaves.py -- THE INVENTORY. Every scripted spawn in a stage, from the PRG.

WAVE 20 / recon 4. docs/knowledge/09-enumerate-then-validate.md: the ROM is the
source of the INVENTORY, the oracle is the source of the VERDICT. This file is
the inventory half. It reads `assets/prg.bin` (nothing runs, no emulator) and
prints, for a stage:

  * every wave record of every chunk -- [trigger, cmd] pairs, in ROM order,
    each with the 16-bit SCROLL it fires at;
  * what each record spawns: the single-spawn type ($A3B1, cmd < $80, via
    table A $A662, 3 bytes per cmd) or the squadron type ($A3E4, cmd >= $80,
    via table B $A602, 4 bytes at (cmd << 2) AND $FF);
  * the $AE1C handler each spawned type dispatches to (index = type AND $7F),
    and whether games/gradius/src/enemies.js has ported it.

The decode is the port's own, line for line -- see src/enemies.js runEngine(),
fireWave(), singleSpawn(), formationSetup(). Two facts that are easy to get
wrong and are asserted here rather than assumed:

  * a record fires at ($61 + (trigger >> 7)) * 256 + ((trigger * 2) AND $FF),
    NOT at trigger * 2 inside the chunk -- the top bit of the trigger is the
    512-px band's second page;
  * trigger $FF is the TERMINATOR ($A33F), and the byte after it is the next
    chunk's first record. The chunk pointers are consecutive, so this is
    cross-checked: the terminator must sit exactly one byte before the next
    chunk pointer, for every chunk whose successor differs.

Usage
  python games/gradius/tools/oracle/stagewaves.py            # stage 1
  python games/gradius/tools/oracle/stagewaves.py --stage 2
  python games/gradius/tools/oracle/stagewaves.py --json out/stagewaves.json

ROM-DERIVED. out/ is gitignored; nothing here may be committed.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]                       # repo root
PRG = ROOT / "games" / "gradius" / "assets" / "prg.bin"
SRC_ENEMIES = ROOT / "games" / "gradius" / "src" / "enemies.js"

STAGE_PTR = 0xA7D0        # $A2D5 LDA $A7D0,Y -- 7 stages, 2 bytes each
CHUNKS_PER_STAGE = 8      # $61 = $3F AND $0E, used as a BYTE offset -> 8 words
TABLE_PTRS = 0xA5FE       # $A397: Y=0 -> table A ($A662), Y=2 -> table B ($A602)
FORMATION = 0xA592        # $A3E8 LDA $A592,X -- 2 bytes, [count|X, firstY]
PATTERN = 0xA5BC          # $A42F LDA $A5BC,Y -- 3 bytes, [delay, dY, style]
DISPATCH = 0xAE1C         # $AE19 JSR $83E4, 42 entries
DISPATCH_N = 42
END_PAGE = 0x98FD         # $9926 LDA $3F / CMP $98FD,Y -- the stage ends here
BOSS_PAGE = 0x9A3D        # $9A4F / $9986


class Rom:
    def __init__(self, path: Path):
        self.d = path.read_bytes()
        if len(self.d) != 32768:
            raise SystemExit(f"{path} is {len(self.d)} bytes, expected 32768")

    def b(self, a: int) -> int:
        return self.d[(a - 0x8000) & 0x7FFF]

    def w(self, a: int) -> int:
        return self.b(a) | (self.b(a + 1) << 8)


def ported_handlers() -> set[int]:
    """The handler ADDRESSES src/enemies.js dispatch() actually implements.

    Read out of the source rather than duplicated here, so this tool cannot
    claim a handler is ported after someone removes it.
    """
    txt = SRC_ENEMIES.read_text(encoding="utf8")
    body = txt.split("function dispatch(", 1)[1].split("\n}", 1)[0]
    return {int(m, 16) for m in re.findall(r"case 0x([0-9A-Fa-f]{4}):", body)}


def chunk_records(rom: Rom, table: int, idx: int) -> tuple[int, list[tuple[int, int]]]:
    """Decode one chunk's [trigger, cmd] list. Returns (pointer, records)."""
    ptr = rom.w(table + idx * 2)
    recs = []
    a = ptr
    while True:
        trig = rom.b(a)
        if trig == 0xFF:                 # $A33F/$A341/$A345 -- the terminator
            break
        recs.append((trig, rom.b(a + 1)))
        a += 2
        if len(recs) > 128:
            raise SystemExit(f"chunk ${ptr:04X}: no $FF terminator in 128 records")
    return ptr, recs


def spawn_of(rom: Rom, cmd: int) -> dict:
    """What one wave command spawns. The port's own arithmetic."""
    if cmd >= 0xF0:
        # $A34B CMP #$F0 / BCS $A37A -- the 5-byte inline record. Not ported.
        return {"path": "inline5 $A37A", "type": None, "note": "cmd >= $F0"}
    if cmd < 0x80:
        # $A35A: table A, 3 bytes per command. $64 carries type AND edge.
        base = rom.w(TABLE_PTRS + 0)
        a = (base + cmd * 3) & 0xFFFF
        d = [rom.b(a), rom.b(a + 1), rom.b(a + 2)]
        t = (d[0] - 0xA0) & 0xFF
        x = 0xF0
        if t >= 0x30:                    # $A3CA CMP #$30 / BCC
            x = 0x10
            t = (t - 0x30) & 0xFF
        return {"path": "single $A3B1", "type": t, "x": x, "style": d[1],
                "y": d[2], "desc": d}
    # $A36D: table B, (cmd << 2) AND $FF. $65 is the TYPE, $64 the status.
    base = rom.w(TABLE_PTRS + 2)
    a = (base + ((cmd << 2) & 0xFF)) & 0xFFFF
    d = [rom.b(a), rom.b(a + 1), rom.b(a + 2), rom.b(a + 3)]
    fx = (d[2] << 1) & 0xFF
    f0, f1 = rom.b(FORMATION + fx), rom.b(FORMATION + fx + 1)
    py = ((d[3] << 2) - d[3]) & 0xFF
    return {"path": "squadron $A3E4", "type": d[1], "status": d[0],
            "members": f0 & 0x0F, "spawnX": f0 & 0xF0, "firstY": f1,
            "pattern": [rom.b(PATTERN + py), rom.b(PATTERN + py + 1),
                        rom.b(PATTERN + py + 2)], "desc": d}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, default=1, help="1-based, like the game")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    st = a.stage - 1

    rom = Rom(PRG)
    ported = ported_handlers()
    hs = [rom.w(DISPATCH + 2 * i) for i in range(DISPATCH_N)]

    print(f"=== $AE1C DISPATCH TABLE: {DISPATCH_N} entries, "
          f"{len(set(hs))} distinct addresses")
    n_ported = sum(1 for h in hs if h in ported)
    print(f"    ported by src/enemies.js: {n_ported} entries "
          f"({len({h for h in hs if h in ported})} distinct); "
          f"unported {DISPATCH_N - n_ported} entries "
          f"({len({h for h in hs if h not in ported})} distinct)")

    table = rom.w(STAGE_PTR + 2 * st)
    endp, bossp = rom.b(END_PAGE + st), rom.b(BOSS_PAGE + st)
    print(f"\n=== STAGE {a.stage}: chunk table ${table:04X}, "
          f"end page ${endp:02X} (scroll ${endp * 256:04X}), "
          f"boss page ${bossp:02X} (scroll ${bossp * 256:04X})")

    chunks, seen_cmd, all_types, out = [], {}, {}, []
    ptrs = [rom.w(table + 2 * i) for i in range(CHUNKS_PER_STAGE)]
    for i in range(CHUNKS_PER_STAGE):
        ptr, recs = chunk_records(rom, table, i)
        chunks.append((ptr, recs))
        # the terminator cross-check: consecutive chunks
        nxt = ptrs[i + 1] if i + 1 < CHUNKS_PER_STAGE else None
        term = ptr + 2 * len(recs)
        tail = "" if nxt in (None, ptr) else (
            "  [OK terminator abuts next chunk]" if term + 1 == nxt
            else f"  [!! terminator ${term:04X} does not abut ${nxt:04X}]")
        band = i * 2                     # $61 for this chunk
        print(f"\n-- chunk {i}: $61={band:2d}  ptr ${ptr:04X}  "
              f"{len(recs)} records  camera pages {band}-{band + 1} "
              f"(scroll ${band * 256:04X}-${band * 256 + 0x1FF:04X}){tail}")
        for k, (trig, cmd) in enumerate(recs):
            scroll = ((band + (trig >> 7)) * 256 + ((trig * 2) & 0xFF)) & 0xFFFF
            sp = spawn_of(rom, cmd)
            seen_cmd[cmd] = seen_cmd.get(cmd, 0) + 1
            t = sp["type"]
            ent = (t & 0x7F) if t is not None else None
            h = hs[ent] if ent is not None and ent < DISPATCH_N else None
            ok = "PORTED " if (h in ported) else "UNPORTED"
            if t is not None:
                all_types.setdefault(t, 0)
                all_types[t] += 1
            print(f"   [{k:2d}] trig ${trig:02X} -> scroll ${scroll:04X}  "
                  f"cmd ${cmd:02X}  {sp['path']:16s} "
                  + (f"type ${t:02X} -> entry {ent:2d} ${h:04X} {ok}"
                     if t is not None else "cmd >= $F0, NOT PORTED")
                  + (f"  x{sp['members']}" if "members" in sp else ""))
            out.append({"chunk": i, "index": k, "trigger": trig, "cmd": cmd,
                        "scroll": scroll, "path": sp["path"], "type": t,
                        "entry": ent, "handler": h,
                        "ported": bool(h in ported), "spawn": sp})

    print(f"\n=== TOTALS, stage {a.stage}")
    print(f"  wave records            : {sum(len(c[1]) for c in chunks)}")
    print(f"  distinct wave commands  : {len(seen_cmd)}  "
          + " ".join(f"${c:02X}x{n}" for c, n in sorted(seen_cmd.items())))
    print(f"  distinct spawned types  : {len(all_types)}  "
          + " ".join(f"${t:02X}x{n}" for t, n in sorted(all_types.items())))
    ents = {}
    for r in out:
        if r["entry"] is not None:
            ents.setdefault(r["entry"], [r["handler"], r["ported"], 0])
            ents[r["entry"]][2] += 1
    print(f"  distinct $AE1C entries reached by stage {a.stage}'s records: "
          f"{len(ents)}")
    for e in sorted(ents):
        h, p, n = ents[e]
        print(f"     entry {e:2d} ${h:04X} {'PORTED  ' if p else 'UNPORTED'} "
              f"{n} record(s)")
    miss = [r for r in out if not r["ported"]]
    print(f"  records whose spawn the port CANNOT dispatch: {len(miss)} of "
          f"{len(out)}; first at scroll "
          + (f"${miss[0]['scroll']:04X}" if miss else "-"))

    if a.json:
        p = Path(a.json)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"stage": a.stage, "endPage": endp,
                                 "bossPage": bossp, "records": out}), "utf8")
        print(f"  wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
