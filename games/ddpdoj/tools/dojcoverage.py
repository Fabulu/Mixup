#!/usr/bin/env python3
"""Reusable static/dynamic coverage gate for closed DOJ dispatch families.

The ROM supplies each inventory. Source registries supply the ported set.
Existing board and port corpora supply dynamic evidence. The joins are:

  static minus dynamic: present code not exercised by the available corpus
  dynamic minus static: an inventory defect, always a hard failure

This does not replace bosscoverage.py. W102 remains the authoritative boss
gate. This tool reuses its proven Rom/routine walker while providing adapters
for other closed table shapes. Instruction totals are lower bounds because
address-register indirect calls cannot be recovered by this static walker.
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import struct
from pathlib import Path

from bosscoverage import Rom, routine, _target


HERE = Path(__file__).resolve().parent
GAME = HERE.parent
SRC = GAME / "src"
OUT = GAME / "tools" / "oracle" / "out"
ROM_PATH = OUT / "maincpu.bin"
CONFIG_PATH = HERE / "dojcoverage-config.json"
BASELINE_PATH = HERE / "dojcoverage-baseline.json"
CKPT_DIR = OUT / "w69" / "stage1-sweep" / "ckpt"
W25_TSV = OUT / "w25-handler-stage1.tsv"
W22_TSV = OUT / "w22-spawn-stage1.tsv"
W75_JSON = OUT / "w75" / "seedcmp.json"
W168_JSON = HERE / "w168-stage2-bgelem-evidence.json"
RAM_BASE = 0x800000


def source_block(path: Path, start: str, end: str) -> str:
    text = path.read_text(encoding="utf-8")
    a = text.find(start)
    if a < 0:
        raise ValueError(f"{path.name}: missing source registry marker {start!r}")
    b = text.find(end, a + len(start))
    if b < 0:
        raise ValueError(f"{path.name}: missing registry terminator after {start!r}")
    return text[a:b]


def hexes(text: str) -> set[int]:
    return {int(x, 16) for x in re.findall(r"0x([0-9a-fA-F]+)", text)}


def source_registries() -> dict:
    main = source_block(SRC / "main.js", "export function defaultHandlers", "export class Game")
    object_ids = {int(x) for x in re.findall(r"^\s*\[(\d+),", main, re.M)}

    type5 = source_block(SRC / "type5.js", "export const TYPE5_PORTED = new Set([", "]);\n")
    type5_addrs = hexes(type5)

    init_src = (SRC / "initbody.js").read_text(encoding="utf-8")
    init_bodies = {int(x, 16) for x in re.findall(r"BODY\.set\(0x([0-9a-fA-F]+)", init_src)}

    handlers = source_block(SRC / "handlers.js", "const HANDLERS = new Map([", "]);\n")
    handler_addrs = {int(x, 16) for x in re.findall(
        r"^\s*\[0x([0-9a-fA-F]+),", handlers, re.M)}

    bg = source_block(SRC / "background.js", "export const BGELEM_HANDLERS = [", "];\n")
    bg_pairs = {(int(a, 16), int(b, 16)) for a, b in re.findall(
        r"ctor:\s*0x([0-9a-fA-F]+),\s*upd:\s*0x([0-9a-fA-F]+)", bg)}

    return dict(objects=object_ids, type5=type5_addrs,
                init_bodies=init_bodies, handlers=handler_addrs,
                bgelem=bg_pairs)


def entry(key, label, addresses, ported, state=None, **extra):
    return dict(key=str(key), label=label, addresses=list(addresses),
                ported=bool(ported), state=state or ("ported" if ported else "unknown"),
                dynamic=False, **extra)


def walk_top_objects(rom: Rom, regs: dict, cfg: dict):
    entries = []
    base, count = cfg["base"], cfg["count"]
    for i in range(count):
        handler = rom.r32(base + i * 8)
        priority = rom.r32(base + i * 8 + 4)
        entries.append(entry(i, f"object type ${i:02X}", [handler], i in regs["objects"],
                             handler=handler, priority=priority))
    phantoms = [f"top_objects:{i}" for i in sorted(regs["objects"] - set(range(count)))]
    return entries, phantoms


def walk_type5(rom: Rom, regs: dict, cfg: dict):
    rows = []
    for ins in rom.md.disasm(rom.d[cfg["start"]:cfg["end"]], cfg["start"]):
        if ins.mnemonic != "jsr":
            continue
        addr = _target(ins.op_str.split(",")[0].strip())
        if addr is not None:
            rows.append((ins.address, addr))
    if len(rows) != cfg["count"]:
        raise ValueError(f"type5 call range yielded {len(rows)}, expected {cfg['count']}")
    entries = [entry(i + 1, f"type-5 call #{i + 1} at ${pc:06X}", [addr],
                     addr in regs["type5"], callsite=pc, target=addr)
               for i, (pc, addr) in enumerate(rows)]
    static = {a for _, a in rows}
    phantoms = [f"type5_calls:${a:06X}" for a in sorted(regs["type5"] - static)]
    return entries, phantoms


NULL_HANDLERS = {0x26781C, 0x27E40A}


def walk_enemy_types(rom: Rom, regs: dict, cfg: dict):
    entries = []
    static_bodies, static_handlers = set(), set()
    for typ in range(256):
        base = cfg["bases"][typ >> 7]
        off = (typ & 0x7f) * 8
        init = rom.r32(base + off)
        handler = rom.r32(base + off + 4)
        body = init + 8
        is_null = handler in NULL_HANDLERS
        if not is_null:
            static_bodies.add(body)
            static_handlers.add(handler)
        ported = (not is_null) and body in regs["init_bodies"] and handler in regs["handlers"]
        state = "null" if is_null else ("ported" if ported else "unknown")
        entries.append(entry(typ, f"enemy type ${typ:02X}",
                             [] if is_null else [body, handler], ported, state,
                             init=init, init_body=body, handler=handler, null=is_null))
    phantoms = []
    for a in sorted(regs["init_bodies"] - static_bodies):
        phantoms.append(f"enemy_types:init_body:${a:06X}")
    for a in sorted(regs["handlers"] - static_handlers):
        phantoms.append(f"enemy_types:handler:${a:06X}")
    return entries, phantoms


def walk_spawn_script(rom: Rom, enemy_by_type: dict, cfg: dict):
    stage = cfg["stage"]
    tab = cfg["stage_table"] + stage * 0x10
    cursor = rom.r32(tab)
    entries = []
    while True:
        trigger = rom.r16(cursor)
        if trigger == 0xffff:
            break
        typ = rom.d[cursor + 4]
        e = enemy_by_type[typ]
        entries.append(entry(f"{cursor:06X}",
            f"stage {stage + 1} spawn ${cursor:06X}, type ${typ:02X}", [],
            e["ported"], e["state"], record=cursor, trigger=trigger, type=typ,
            handler=e["handler"], init_body=e["init_body"]))
        cursor += 8
        if len(entries) > 4096:
            raise ValueError(f"stage {stage + 1} spawn script did not terminate")
    return entries, []


def ctor_update(rom: Rom, ctor: int) -> int | None:
    for ins in rom.md.disasm(rom.d[ctor:ctor + 64], ctor):
        op = ins.op_str.replace(" ", "").lower()
        m = re.fullmatch(r"#\$([0-9a-f]+),\$8\(a6\)", op)
        if ins.mnemonic == "move.l" and m:
            return int(m.group(1), 16)
        if ins.mnemonic == "rts":
            break
    return None


def walk_bgelem(rom: Rom, regs: dict, cfg: dict):
    stage, pt = cfg["stage"], cfg["pointer_table"]
    base = rom.r32(pt + stage * 4)
    end = rom.r32(pt + (stage + 1) * 4)
    if end <= base or (end - base) % 4:
        raise ValueError(f"stage {stage + 1} BGELEM extent is not adjacent/closed")
    entries = []
    for i in range((end - base) // 4):
        ctor = rom.r32(base + i * 4)
        upd = ctor_update(rom, ctor)
        if upd is None:
            entries.append(entry(i, f"stage {stage + 1} BGELEM {i}", [ctor], False,
                                 "unknown", ctor=ctor, update=None,
                                 reason="constructor update target is computed or unresolved"))
        else:
            ported = (ctor, upd) in regs["bgelem"]
            entries.append(entry(i, f"stage {stage + 1} BGELEM {i}", [ctor, upd],
                                 ported, ctor=ctor, update=upd))
    static_pairs = {(e["ctor"], e["update"]) for e in entries if e["update"] is not None}
    all_stage12 = None
    if stage == 1:
        all_stage12 = static_pairs
    phantoms = []
    # A source pair belongs to this adapter if its constructor is inside this table.
    table_ctors = {e["ctor"] for e in entries}
    for pair in sorted(p for p in regs["bgelem"] if p[0] in table_ctors and p not in static_pairs):
        phantoms.append(f"stage{stage + 1}_bgelem:${pair[0]:06X}/${pair[1]:06X}")
    return entries, phantoms


def read_checkpoints():
    paths = sorted(glob.glob(str(CKPT_DIR / "c*.ram.bin")))
    if not paths:
        raise FileNotFoundError(f"no checkpoint RAM dumps under {CKPT_DIR}")
    object_types = set()
    updates_by_table = {}
    for path in paths:
        b = Path(path).read_bytes()
        def u16(a): return struct.unpack_from(">H", b, a - RAM_BASE)[0]
        def u32(a): return struct.unpack_from(">I", b, a - RAM_BASE)[0]
        for i in range(20):
            typ = u16(0x80E240 + i * 0x50)
            if typ:
                object_types.add(typ & 0xff)
        tab = u32(0x8132C8)
        for i in range(8):
            slot = 0x8131C8 + i * 0x20
            if b[slot - RAM_BASE] & 0x80:
                updates_by_table.setdefault(tab, set()).add(u32(slot + 8))
    return object_types, updates_by_table, len(paths)


def read_enemy_dynamic():
    if not W25_TSV.exists():
        raise FileNotFoundError(f"{W25_TSV} missing")
    rows = set()
    with W25_TSV.open(encoding="ascii") as f:
        for line in f:
            p = line.rstrip().split("\t")
            if len(p) >= 5 and p[0] == "SPAWN":
                rows.add((int(p[4], 16), int(p[3], 16)))
    if not rows:
        raise ValueError(f"{W25_TSV.name} has no SPAWN rows")
    return rows


def read_spawned_types():
    if not W22_TSV.exists():
        raise FileNotFoundError(f"{W22_TSV} missing")
    types = set()
    with W22_TSV.open(encoding="ascii") as f:
        for line in f:
            p = line.rstrip().split("\t")
            if len(p) >= 5 and p[0] == "S":
                types.add(int(p[4], 16))
    if not types:
        raise ValueError(f"{W22_TSV.name} has no allocator-claim rows")
    return types


def read_w75_element_updates():
    if not W75_JSON.exists():
        raise FileNotFoundError(f"{W75_JSON} missing")
    doc = json.loads(W75_JSON.read_text(encoding="utf-8"))
    out = set()
    for row in doc.get("results", []):
        blocked = row.get("blocked") or {}
        if "element updater" in blocked.get("message", ""):
            out.add(int(blocked["addr"]))
    if not out:
        raise ValueError(f"{W75_JSON.name} has no element-updater evidence")
    return out


def read_w168_stage2_elements():
    """Read ID-qualified evidence so shared updater targets remain distinct."""
    if not W168_JSON.exists():
        raise FileNotFoundError(f"{W168_JSON} missing")
    doc = json.loads(W168_JSON.read_text(encoding="utf-8"))
    if doc.get("schema") != 1 or "VERSION-B" not in doc.get("target", ""):
        raise ValueError(f"{W168_JSON.name} is not VERSION-B schema 1 evidence")
    rows = doc.get("events", [])
    if not rows:
        raise ValueError(f"{W168_JSON.name} has no element events")
    return rows


def lower_bound(rom: Rom, addresses):
    seen = {}
    indirect = 0
    for addr in sorted(set(addresses)):
        if not (0x200000 <= addr < len(rom.d)):
            continue
        body, _ = routine(rom, addr)
        seen.update(body)
        indirect += sum(1 for ins in body.values()
                        if ins.mnemonic in ("jsr", "jmp")
                        and not ins.op_str.strip().startswith("$"))
    return dict(instructions=len(seen), bytes=sum(len(i.bytes) for i in seen.values()),
                indirect_calls=indirect, lower_bound=True)


def registry_tokens(regs):
    tokens = set()
    tokens.update(f"object:{i}" for i in regs["objects"])
    tokens.update(f"type5:{a:06X}" for a in regs["type5"])
    tokens.update(f"enemy-init:{a:06X}" for a in regs["init_bodies"])
    tokens.update(f"enemy-handler:{a:06X}" for a in regs["handlers"])
    for ctor, upd in regs["bgelem"]:
        tokens.add(f"bgelem:{ctor:06X}/{upd:06X}")
    return tokens


def build_report(break_coverage=False, break_inventory=False):
    if not ROM_PATH.exists():
        raise FileNotFoundError(f"{ROM_PATH} missing")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    rom = Rom(ROM_PATH.read_bytes())
    regs = source_registries()
    cfg = {x["name"]: x for x in config["families"]}

    families, phantoms = {}, []
    families["top_objects"], p = walk_top_objects(rom, regs, cfg["top_objects"]); phantoms += p
    families["type5_calls"], p = walk_type5(rom, regs, cfg["type5_calls"]); phantoms += p
    families["enemy_types"], p = walk_enemy_types(rom, regs, cfg["enemy_types"]); phantoms += p
    enemy_by_type = {int(e["key"]): e for e in families["enemy_types"]}
    for name in ("stage1_spawn_script", "stage2_spawn_script"):
        families[name], p = walk_spawn_script(rom, enemy_by_type, cfg[name]); phantoms += p
    for name in ("stage1_bgelem", "stage2_bgelem"):
        families[name], p = walk_bgelem(rom, regs, cfg[name]); phantoms += p

    object_types, ckpt_updates, n_ckpt = read_checkpoints()
    enemy_dynamic = read_enemy_dynamic()
    spawned_types = read_spawned_types()
    w75_updates = read_w75_element_updates()
    w168_elements = read_w168_stage2_elements()
    inventory_errors = []

    object_by_id = {int(e["key"]): e for e in families["top_objects"]}
    for typ in sorted(object_types):
        if typ not in object_by_id:
            inventory_errors.append(f"object type ${typ:02X} observed outside the 20-entry table")
        else:
            object_by_id[typ]["dynamic"] = True

    enemy_entries = {int(e["key"]): e for e in families["enemy_types"]}
    for typ in sorted(spawned_types):
        e = enemy_entries.get(typ)
        if e is None:
            inventory_errors.append(f"enemy type ${typ:02X} observed outside the 256-entry inventory")
        else:
            e["dynamic"] = True
    for typ, handler in sorted(enemy_dynamic):
        e = enemy_entries.get(typ)
        if e is None:
            inventory_errors.append(f"enemy type ${typ:02X} observed outside the 256-entry inventory")
        elif e["handler"] != handler:
            inventory_errors.append(
                f"enemy type ${typ:02X} observed handler ${handler:06X}, static table says ${e['handler']:06X}")
        else:
            e["dynamic"] = True

    bg_all = {}
    for name in ("stage1_bgelem", "stage2_bgelem"):
        for e in families[name]:
            if e["update"] is not None:
                bg_all[e["update"]] = e
    for updates in ckpt_updates.values():
        for addr in updates:
            if addr not in bg_all:
                inventory_errors.append(f"checkpoint observed BGELEM updater ${addr:06X} outside stage 1/2 inventory")
            else:
                bg_all[addr]["dynamic"] = True
    for addr in sorted(w75_updates):
        if addr not in bg_all:
            inventory_errors.append(f"w75 observed BGELEM updater ${addr:06X} outside stage 1/2 inventory")
        else:
            bg_all[addr]["dynamic"] = True

    stage2_by_id = {int(e["key"]): e for e in families["stage2_bgelem"]}
    seen_stage2_ids = set()
    for row in w168_elements:
        elem_id = int(row["id"])
        observed_ctor = int(row["constructor"])
        observed_update = int(row["update"])
        if elem_id in seen_stage2_ids:
            inventory_errors.append(f"w168 observed stage 2 BGELEM id {elem_id} twice")
            continue
        seen_stage2_ids.add(elem_id)
        e = stage2_by_id.get(elem_id)
        if e is None:
            inventory_errors.append(
                f"w168 observed stage 2 BGELEM id {elem_id} outside static inventory")
        elif e["ctor"] != observed_ctor or e["update"] != observed_update:
            inventory_errors.append(
                f"w168 stage 2 BGELEM id {elem_id} observed "
                f"${observed_ctor:06X}/${observed_update:06X}, static table says "
                f"${e['ctor']:06X}/${e['update']:06X}")
        else:
            e["dynamic"] = True

    if break_inventory:
        inventory_errors.append("DELIBERATE RED: observed object type $FF outside the 20-entry table")

    tokens = registry_tokens(regs)
    if break_coverage and tokens:
        tokens.remove(sorted(tokens)[0])
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8")) if BASELINE_PATH.exists() else None
    baseline_tokens = set(baseline.get("ported_registry", [])) if baseline else set()
    regressions = sorted(baseline_tokens - tokens)

    report_families = []
    for desc in config["families"]:
        name = desc["name"]
        entries = families[name]
        code = [a for e in entries for a in e["addresses"]]
        live = [e for e in entries if e["state"] != "null"]
        has_dynamic = desc.get("dynamic_from") is not None
        unexercised = [e["label"] for e in live if has_dynamic and not e["dynamic"]]
        report_families.append(dict(
            name=name, shape=desc["shape"], entries=len(entries),
            ported=sum(1 for e in entries if e["ported"]),
            null=sum(1 for e in entries if e["state"] == "null"),
            unknown=sum(1 for e in entries if e["state"] == "unknown"),
            dynamic_evidence=desc.get("dynamic_from"),
            dynamic_seen=sum(1 for e in entries if e["dynamic"]),
            static_minus_dynamic=unexercised if has_dynamic else None,
            sizing=lower_bound(rom, code), entries_detail=entries))

    return dict(schema=1, target=config["target"],
                evidence=dict(checkpoint_rungs=n_ckpt,
                              board_spawned_types=len(spawned_types),
                              enemy_type_handler_pairs=len(enemy_dynamic),
                              w75_element_updates=len(w75_updates),
                              w168_stage2_element_events=len(w168_elements)),
                families=report_families, delegated=config["delegated"],
                backlog=config["backlog"], phantoms=sorted(phantoms),
                inventory_errors=inventory_errors,
                baseline_present=baseline is not None,
                coverage_regressions=regressions,
                ported_registry=sorted(tokens))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", metavar="PATH")
    ap.add_argument("--emit-baseline", action="store_true")
    ap.add_argument("--break-coverage", action="store_true")
    ap.add_argument("--break-inventory", action="store_true")
    args = ap.parse_args()
    try:
        report = build_report(args.break_coverage, args.break_inventory)
    except (FileNotFoundError, ValueError, KeyError, AssertionError) as e:
        print(f"FAIL: {e}")
        return 1

    if args.emit_baseline:
        print(json.dumps({"schema": 1, "ported_registry": report["ported_registry"]}, indent=1))
        return 0
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")

    print("DOJ reusable coverage")
    for f in report["families"]:
        dyn = "UNKNOWN" if f["static_minus_dynamic"] is None else str(f["dynamic_seen"])
        print(f"  {f['name']}: {f['ported']}/{f['entries']} ported, "
              f"{f['unknown']} unknown, {f['null']} null, dynamic {dyn}, "
              f"{f['sizing']['instructions']} lower-bound insns")
        if f["static_minus_dynamic"] is not None:
            print(f"    static-minus-dynamic: {len(f['static_minus_dynamic'])}")
    print(f"  backlog: {len(report['backlog'])} exact config records")
    print("  sizing: LOWER BOUND, address-register indirect calls remain UNKNOWN")

    failed = False
    if not report["baseline_present"]:
        print("FAIL coverage: baseline missing")
        failed = True
    elif report["coverage_regressions"]:
        print(f"FAIL coverage: lost {len(report['coverage_regressions'])} registry entries")
        for x in report["coverage_regressions"]:
            print(f"  {x}")
        failed = True
    else:
        print("OK coverage: live source registries are supersets of the baseline")
    if report["phantoms"]:
        print(f"FAIL inventory: {len(report['phantoms'])} source registry entries are not in ROM inventories")
        for x in report["phantoms"]:
            print(f"  {x}")
        failed = True
    if report["inventory_errors"]:
        print(f"FAIL inventory: {len(report['inventory_errors'])} dynamic observations are outside static inventory")
        for x in report["inventory_errors"]:
            print(f"  {x}")
        failed = True
    else:
        print("OK inventory: every dynamic object/type/handler/BGELEM observation is statically inventoried")
    print("FAIL" if failed else "OK")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
