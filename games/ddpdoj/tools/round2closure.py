#!/usr/bin/env python3
"""Bounded static preflight for Black Label round-2 progression probes.

The inventory is derived from the local cartridge image and live source
registries. It covers all five spawn scripts, all five background-element lists,
progression top objects and type-5 dispatch, source-visible deferred emissions,
movement-stream child types used by scripted carriers, and exact eight-byte init-stub
ROM coverage for every type in that recursive closure. Operator-only diagnostics
are reported but do not block gameplay; a mandatory init that immediately frees its
enemy closes that row without requiring its unreachable alternate handler.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
SRC = GAME / "src"
TABLES_PATH = GAME / "rip" / "port" / "player.tables.json"
sys.path.insert(0, str(HERE))

from dojcoverage import (  # noqa: E402
    CONFIG_PATH,
    ROM_PATH,
    Rom,
    source_registries,
    walk_bgelem,
    walk_enemy_types,
    walk_spawn_script,
    walk_top_objects,
    walk_type5,
)

STAGE_TABLE = 0x263336
BGELEM_POINTER_TABLE = 0x262302
CARRIER_INIT_BODY = 0x272A4A
EXPECTED_STAGE_RECORDS = (339, 332, 414, 382, 770)
EXPECTED_BGELEM_ENTRIES = (13, 8, 14, 7, 4)
OPERATOR_ONLY_TOP_OBJECTS = {
    0x10: (0x256E7A, "operator service-menu dispatcher"),
    0x12: (0x24902A, "operator ASIC27 self-test"),
}
MANDATORY_FREE_ENEMIES = {
    0x9A: (0x29EAE2, 0x29EB7A, 0x263762),
}


def cfg_by_name(config: dict, name: str) -> dict:
    return next(row for row in config["families"] if row["name"] == name)


def generated_rom_windows(path: Path = TABLES_PATH) -> list[tuple[int, int]]:
    if not path.exists():
        raise FileNotFoundError(f"{path} missing; run tools/export-tables.py")
    tables = json.loads(path.read_text(encoding="utf-8"))
    return [(int(row["base"].removeprefix("$"), 16), int(row["len"]))
            for row in tables["rom"]["windows"]]


def init_stub_rows(rom: Rom, closure_types: set[int],
                   windows: list[tuple[int, int]]) -> list[dict]:
    rows = []
    for typ in sorted(closure_types):
        table = 0x267824 if typ < 0x80 else 0x27E412
        init = rom.r32(table + (typ & 0x7F) * 8)
        if (rom.r16(init) != 0x3B7C or rom.r16(init + 4) != 0x0004
                or rom.r16(init + 6) != 0x4E75):
            raise ValueError(f"type ${typ:02X} init stub at ${init:06X} changed shape")
        rows.append({"type": typ, "init": init, "run_length": rom.r16(init + 2),
                     "windowed": any(base <= init and init + 8 <= base + length
                                     for base, length in windows)})
    return rows


def source_files() -> list[Path]:
    return sorted(SRC.rglob("*.js"))


def const_object_slice(text: str, name: str) -> str | None:
    start = re.search(
        rf"(?:export\s+)?const\s+{re.escape(name)}\s*=\s*(?:Object\.freeze\s*\()?\s*\{{",
        text,
    )
    if not start:
        return None
    # Constant records in this source tree close with either `};` or `});`.
    end = re.search(r"^\s*\}\)?;", text[start.end():], re.M)
    return text[start.end():start.end() + end.start()] if end else text[start.end():]


def resolve_type_token(text: str, token: str) -> int | None:
    token = token.strip()
    if re.fullmatch(r"0x[0-9a-fA-F]+|\d+", token):
        return int(token, 0)
    member = re.fullmatch(r"([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)", token)
    if not member:
        return None
    block = const_object_slice(text, member.group(1))
    if block is None:
        return None
    value = re.search(
        rf"\b{re.escape(member.group(2))}\s*:\s*(0x[0-9a-fA-F]+|\d+)\b", block,
    )
    return int(value.group(1), 0) if value else None


def deferred_source_targets() -> tuple[set[int], list[dict], list[dict]]:
    targets: set[int] = set()
    sites: list[dict] = []
    unresolved: list[dict] = []
    call = re.compile(r"\benqueueDeferred\s*\(\s*ram\s*,\s*([^,\n]+)")
    for path in source_files():
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith(("//", "*")) or "function enqueueDeferred" in line:
                continue
            for match in call.finditer(line):
                token = match.group(1).strip()
                value = resolve_type_token(text, token)
                site = {"file": path.relative_to(GAME).as_posix(), "line": line_no,
                        "expression": token}
                if value is None:
                    # The one production dynamic call is the scripted carrier. Its exact
                    # movement-stream children are derived separately below.
                    if path.name == "handlers.js" and token == "type":
                        sites.append({**site, "dynamic": "carrier movement stream"})
                    else:
                        unresolved.append(site)
                else:
                    targets.add(value & 0xFF)
                    sites.append({**site, "type": value & 0xFF})
    # initbody.js uses a local equivalent for type $15 because importing spawn.js
    # there would make a cycle. Both outcomes are literal cartridge branches.
    init = (SRC / "initbody.js").read_text(encoding="utf-8")
    local_child = "enqueueType15Child(ram, child18 ? 0x18 : 0x17"
    local_at = init.find(local_child)
    if local_at < 0:
        unresolved.append({"file": "src/initbody.js", "line": 0,
                           "expression": "type-$15 local deferred child shape changed"})
    else:
        line = init.count("\n", 0, local_at) + 1
        targets.update((0x17, 0x18))
        sites.extend([
            {"file": "src/initbody.js", "line": line,
             "expression": "child18 ? 0x18 : 0x17", "type": 0x17},
            {"file": "src/initbody.js", "line": line,
             "expression": "child18 ? 0x18 : 0x17", "type": 0x18},
        ])
    return targets, sites, unresolved


def carrier_children(rom: Rom, stage_entries: list[list[dict]]) -> list[dict]:
    rows = []
    for stage, entries in enumerate(stage_entries):
        tab = STAGE_TABLE + stage * 0x10
        aux = rom.r32(tab + 4)
        resource = rom.r32(tab + 8)
        for entry in entries:
            if entry["init_body"] != CARRIER_INIT_BODY:
                continue
            record = int(entry["record"])
            index = rom.r16(record + 6) & 0x0FFF
            movement = resource + rom.r16(aux + index * 2)
            cursor = movement + 4
            child = rom.r16(cursor) & 0xFF
            cursor += 2
            escaped = child == 2
            if escaped:
                child = rom.r16(cursor) & 0xFF
            rows.append({"stage": stage + 1, "record": record,
                         "movement_index": index, "movement": movement,
                         "escaped": escaped, "type": child})
    return rows


def walk_all_bgelem(rom: Rom, regs: dict) -> list[list[dict]]:
    stages = []
    for stage in range(4):
        rows, _ = walk_bgelem(rom, regs, {
            "stage": stage, "pointer_table": BGELEM_POINTER_TABLE,
        })
        stages.append(rows)
    # The fifth list ends where the pointer table itself begins. There is no sixth
    # pointer, so make that cartridge-proven wrap explicit instead of guessing.
    base = rom.r32(BGELEM_POINTER_TABLE + 4 * 4)
    end = BGELEM_POINTER_TABLE
    if end <= base or (end - base) % 4:
        raise ValueError("stage 5 BGELEM list does not close at its pointer table")
    rows = []
    from dojcoverage import ctor_update, entry  # local to keep reused helpers obvious
    for index in range((end - base) // 4):
        ctor = rom.r32(base + index * 4)
        update = ctor_update(rom, ctor)
        ported = update is not None and (ctor, update) in regs["bgelem"]
        rows.append(entry(index, f"stage 5 BGELEM {index}",
                          [ctor] if update is None else [ctor, update], ported,
                          "ported" if ported else "unknown", ctor=ctor, update=update))
    stages.append(rows)
    return stages


def mandatory_free_enemy(rom: Rom, regs: dict, typ: int, row: dict) -> dict:
    body, handler, target = MANDATORY_FREE_ENEMIES[typ]
    if row["init_body"] != body or row["handler"] != handler:
        raise ValueError(
            f"type ${typ:02X} mandatory-free row changed from ${body:06X}/${handler:06X}")
    if rom.r16(body) != 0x4EF9 or rom.r32(body + 2) != target:
        raise ValueError(
            f"type ${typ:02X} body is no longer jmp ${target:06X}")
    return {"type": typ, "init_body": body, "handler": handler,
            "free_target": target, "init_ported": body in regs["init_bodies"]}


def unresolved_row(kind: str, row: dict, **extra) -> dict:
    return {"kind": kind, "label": row["label"],
            "addresses": row.get("addresses", []), **extra}


def build_closure(rom_path: Path = ROM_PATH) -> dict:
    if not rom_path.exists():
        raise FileNotFoundError(f"{rom_path} missing")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    rom = Rom(rom_path.read_bytes())
    regs = source_registries()

    enemy_rows, phantoms = walk_enemy_types(rom, regs, cfg_by_name(config, "enemy_types"))
    enemies = {int(row["key"]): row for row in enemy_rows}
    stage_entries = []
    for stage in range(5):
        rows, _ = walk_spawn_script(rom, enemies, {
            "stage": stage, "stage_table": STAGE_TABLE,
        })
        expected = EXPECTED_STAGE_RECORDS[stage]
        if len(rows) != expected:
            raise ValueError(
                f"stage {stage + 1} script has {len(rows)} records, expected {expected}")
        stage_entries.append(rows)

    source_types, deferred_sites, unresolved_expressions = deferred_source_targets()
    carrier_rows = carrier_children(rom, stage_entries)
    carrier_types = {row["type"] for row in carrier_rows}
    direct_types = {row["type"] for rows in stage_entries for row in rows}
    closure_types = direct_types | source_types | carrier_types
    init_stubs = init_stub_rows(rom, closure_types, generated_rom_windows())

    top_rows, top_phantoms = walk_top_objects(
        rom, regs, cfg_by_name(config, "top_objects"))
    operator_only = []
    for typ, (handler, reason) in OPERATOR_ONLY_TOP_OBJECTS.items():
        row = top_rows[typ]
        if row["handler"] != handler:
            raise ValueError(
                f"operator-only object ${typ:02X} changed from handler ${handler:06X}")
        operator_only.append({"object_type": typ, "handler": handler,
                              "reason": reason, "ported": row["ported"]})
    required_top_rows = [row for row in top_rows
                         if int(row["key"]) not in OPERATOR_ONLY_TOP_OBJECTS]

    type5_rows, type5_phantoms = walk_type5(
        rom, regs, cfg_by_name(config, "type5_calls"))
    bgelem_stages = walk_all_bgelem(rom, regs)
    for stage, rows in enumerate(bgelem_stages):
        expected = EXPECTED_BGELEM_ENTRIES[stage]
        if len(rows) != expected:
            raise ValueError(
                f"stage {stage + 1} BGELEM has {len(rows)} entries, expected {expected}")

    mandatory_free = [mandatory_free_enemy(rom, regs, typ, enemies[typ])
                      for typ in sorted(closure_types & MANDATORY_FREE_ENEMIES.keys())]
    mandatory_free_closed = {row["type"] for row in mandatory_free
                             if row["init_ported"]}

    unresolved = []
    for row in required_top_rows:
        if row["state"] == "unknown":
            unresolved.append(unresolved_row("top_object", row,
                                             object_type=int(row["key"])))
    for row in type5_rows:
        if row["state"] == "unknown":
            unresolved.append(unresolved_row("type5", row))
    for typ in sorted(closure_types):
        row = enemies[typ]
        if typ in MANDATORY_FREE_ENEMIES:
            if typ not in mandatory_free_closed:
                unresolved.append({"kind": "mandatory_free_init",
                                   "label": f"enemy type ${typ:02X} immediate-free init",
                                   "addresses": [row["init_body"]], "enemy_type": typ})
            continue
        if row["state"] == "unknown":
            unresolved.append(unresolved_row(
                "enemy_type", row, enemy_type=typ,
                init_body=row["init_body"], handler=row["handler"]))
    for row in init_stubs:
        if not row["windowed"]:
            unresolved.append({"kind": "init_stub_window",
                               "label": f"enemy type ${row['type']:02X} init stub",
                               "addresses": [row["init"]], "enemy_type": row["type"],
                               "run_length": row["run_length"]})
    for stage, rows in enumerate(bgelem_stages, 1):
        for row in rows:
            if row["state"] == "unknown":
                unresolved.append(unresolved_row("bgelem", row, stage=stage,
                                                 ctor=row["ctor"], update=row["update"]))
    for row in unresolved_expressions:
        unresolved.append({"kind": "deferred_expression", "label":
                           f"{row['file']}:{row['line']} {row['expression']}",
                           "addresses": []})

    stages = []
    for stage, rows in enumerate(stage_entries, 1):
        types = {row["type"] for row in rows}
        unknown = {typ for typ in types
                   if enemies[typ]["state"] == "unknown"
                   and typ not in mandatory_free_closed}
        null = {typ for typ in types if enemies[typ]["state"] == "null"}
        stages.append({"stage": stage, "records": len(rows), "types": len(types),
                       "unknown_types": sorted(unknown), "null_markers": sorted(null)})

    return {
        "schema": 2,
        "target": config["target"],
        "rom": str(rom_path),
        "scope": "all five stage scripts plus progression-reachable deferred closure",
        "stages": stages,
        "direct_types": sorted(direct_types),
        "deferred_source_types": sorted(source_types),
        "carrier_types": sorted(carrier_types),
        "closure_types": sorted(closure_types),
        "init_stubs": {"entries": len(init_stubs),
                       "windowed": sum(row["windowed"] for row in init_stubs),
                       "rows": init_stubs},
        "carrier_records": carrier_rows,
        "deferred_sites": deferred_sites,
        "top_objects": {"entries": len(required_top_rows),
                        "ported": sum(row["ported"] for row in required_top_rows),
                        "table_entries": len(top_rows),
                        "operator_only": operator_only},
        "mandatory_free_enemies": mandatory_free,
        "type5": {"entries": len(type5_rows),
                  "ported": sum(row["ported"] for row in type5_rows)},
        "bgelem": [{"stage": stage, "entries": len(rows),
                    "ported": sum(row["ported"] for row in rows)}
                   for stage, rows in enumerate(bgelem_stages, 1)],
        "unresolved": unresolved,
        "registry_phantoms": sorted(phantoms + top_phantoms + type5_phantoms),
    }


def hex_list(values: list[int], width: int = 2) -> str:
    return ", ".join(f"${value:0{width}X}" for value in values) or "none"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Static Black Label round-2 closure preflight for exact progression probes.")
    parser.add_argument("--rom", type=Path, default=ROM_PATH,
                        help="local 6 MiB main CPU image (default: tools/oracle/out/maincpu.bin)")
    parser.add_argument("--json", type=Path, help="also write the full derived report as JSON")
    args = parser.parse_args()
    try:
        report = build_closure(args.rom)
    except (FileNotFoundError, ValueError, KeyError, AssertionError) as error:
        print(f"FAIL round-2 closure: {error}")
        return 2

    print("DDPDOJ BLACK LABEL ROUND-2 STATIC CLOSURE")
    for stage in report["stages"]:
        print(f"  stage {stage['stage']}: {stage['records']} records, {stage['types']} types, "
              f"unknown {hex_list(stage['unknown_types'])}, null markers "
              f"{hex_list(stage['null_markers'])}")
    print(f"  deferred source types: {hex_list(report['deferred_source_types'])}")
    print(f"  carrier stream types: {hex_list(report['carrier_types'])}")
    print(f"  recursive closure: {len(report['closure_types'])} enemy types")
    stubs = report["init_stubs"]
    print(f"  init stubs: {stubs['windowed']}/{stubs['entries']} windowed")
    top = report["top_objects"]
    print(f"  progression top objects: {top['ported']}/{top['entries']} ported")
    for row in top["operator_only"]:
        print(f"  operator-only object ${row['object_type']:02X} excluded: "
              f"${row['handler']:06X} {row['reason']}")
    for row in report["mandatory_free_enemies"]:
        state = "ported" if row["init_ported"] else "UNPORTED"
        print(f"  mandatory-free enemy ${row['type']:02X}: init ${row['init_body']:06X} "
              f"jmp ${row['free_target']:06X} ({state}); handler ${row['handler']:06X} unreachable")
    print(f"  type-5 calls: {report['type5']['ported']}/{report['type5']['entries']} ported")
    for row in report["bgelem"]:
        print(f"  stage {row['stage']} BGELEM: {row['ported']}/{row['entries']} ported")

    if report["registry_phantoms"]:
        print(f"  registry phantoms: {len(report['registry_phantoms'])}")
        for item in report["registry_phantoms"]:
            print(f"    {item}")
    if report["unresolved"]:
        print(f"UNRESOLVED {len(report['unresolved'])}")
        for item in report["unresolved"]:
            addresses = " ".join(f"${value:06X}" for value in item["addresses"])
            print(f"  {item['kind']}: {item['label']} {addresses}".rstrip())
    else:
        print("UNRESOLVED 0")

    if args.json:
        args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    failed = bool(report["unresolved"] or report["registry_phantoms"])
    print("INCOMPLETE" if failed else "CLOSED")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
