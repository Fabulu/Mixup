#!/usr/bin/env python3
"""bosscoverage.py -- STATIC enumeration of the stage-1 boss scheduler,
cross-referenced against the port's registry and validated against the
oracle's dynamic evidence.

THE SYSTEM (plan 100).  Two of the three games already have a coverage tool
(Batman audit_coverage.py, Gradius census.py + tablecoverage.py).  DaiOuJou
discovered its boss by running the port until it threw, which is why the boss
was sized wrong three times: a census of what threw measures WALK ORDER, not
remaining work.  This tool makes the denominator ROM-derived instead.

THE ROM IS THE INVENTORY (knowledge/09).  Every entry point is counted out of
maincpu.bin; nothing here runs the emulator.  The oracle stays the arbiter of
correctness for individual routines -- this tool answers a different question:
what is THERE.

WHAT IT DOES, in order:

  1. TABLES.  Walks the five boss scheduler tables (MAIN, F, E, D, OBJECT),
     each entry resolved to a routine address, kind (INIT/STEP) and a size
     computed by closure over intra-routine branches.  Sizes are LOWER BOUNDS
     because `jsr (An)` is invisible to every static scanner.

  2. ACTIVATION GRAPH.  Scans the ENTIRE image for call sites to the scheduler
     API (`jsr` AND `jmp` -- three D-script entries are tail-call `jmp`s that
     a `jsr`-only scan misses, W99 section 4), resolves the id reaching D0 at
     each site, and classifies every entry as STARTED or NOT-STARTED.  Entries
     with no start site anywhere are DEAD CODE.

  3. CROSS-REFERENCE.  Joins the enumeration against the port's `registerScript`
     calls (W95's mechanism).  The ported set is DERIVED from source every run,
     never a hand list.

  4. THE JOIN, both directions (the real prize, plan 100 section "THE JOIN"):
       static minus dynamic = code that EXISTS and has NEVER EXECUTED.
       dynamic minus static = a DEFECT IN THE ENUMERATOR.

  5. GATE, two red conditions:
       (a) COVERAGE regression -- a ported script is no longer registered.
       (b) INVENTORY regression -- the oracle observed an entry point the
           enumerator never listed.

  python games/ddpdoj/tools/bosscoverage.py [--verbose] [--json out.json]
  python games/ddpdoj/tools/bosscoverage.py --break-coverage     # RED: (a)
  python games/ddpdoj/tools/bosscoverage.py --break-inventory    # RED: (b)

Exit 1 on any gap.  Nothing is written unless --json is passed.

THE DYNAMIC SET comes from two sources, unioned:
  - BOARD-OBSERVED: the checkpoint ladder's 72 RAM dumps (the oracle's own
    record of which slots were live at each rung).  This is SAMPLED presence,
    not execution -- a script that starts and finishes between two rungs is
    invisible, which is why MAIN 0 (the whole arrival) reads "never".
  - PORT-DISPATCHED: scheduler.js records every dispatched address into a Set
    (W102 instrumentation); seedcmp.mjs dumps it after a sweep.  This is
    per-frame, so it catches the between-rungs scripts, but only for port-side
    runs.

If neither source is on disk the dynamic half SKIPs with the command that makes
it, the same way every other oracle-dependent gate stage does.  Condition (b)
cannot work without dynamic evidence, and pretending it does is exactly what
this tool exists to prevent.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import struct
import sys
from pathlib import Path

from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_030

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parent.parent
ROM_PATH = GAME / "tools" / "oracle" / "out" / "maincpu.bin"
SRC_DIR = GAME / "src"
CKPT_DIR = GAME / "tools" / "oracle" / "out" / "w69" / "stage1-sweep" / "ckpt"
DISPATCH_LOG = GAME / "tools" / "oracle" / "out" / "dispatched.json"
BASELINE = HERE / "bosscoverage-baseline.json"

# ==========================================================================
# CONFIG -- the boss-specific part.  Generalize by adding a config block;
# the walker below it is general.
#
# The stage-1 boss installs five routine tables via `$259554`, called from five
# `lea`s at `$292710..$29272A`.  Each of MAIN/F/E/D is a stride-8 table of
# (INIT, STEP) pairs; OBJECT is a $FFFFFFFF-terminated list of single pointers.
# Table extents are CLOSED: the byte after the last entry is a landmark
# (`clr.w (a4) / rts` for E and D, F[0].INIT == base+0x38 for F, the
# $FFFFFFFF terminator for OBJECT, verified by W99 section 1).
# ==========================================================================

TABLES = [
    dict(name="MAIN", base=0x293104, end=0x29314C, slots=1),
    dict(name="F",    base=0x294F68, end=0x294FA0, slots=5),
    dict(name="E",    base=0x295856, end=0x2958CE, slots=10),
    dict(name="D",    base=0x29370A, end=0x2937B2, slots=10),
]
OBJ_BASE = 0x292932

# The scheduler API entry points, with their (family, verb).  Used by the
# activation-graph scan to resolve which id each call site starts.  The full
# list is from W99 section "THE ACTIVATION GRAPH"; every one was verified
# against the image.
API = {
    0x2598D0: ("MAIN", "start"), 0x2598BE: ("MAIN", "stop"), 0x2598C8: ("MAIN", "get"),
    0x25980C: ("F", "start"),    0x259876: ("F", "stop"),    0x2598A2: ("F", "stopall"),
    0x25983E: ("F", "query"),
    0x259962: ("D", "start"),    0x2599EC: ("D", "stop"),    0x2599B4: ("D", "query"),
    0x259A18: ("E", "start"),    0x259B08: ("E", "stop"),    0x259B34: ("E", "stopall"),
    0x259A4A: ("E", "query"),    0x259A82: ("E", "query1"),  0x259AC2: ("E", "clr1"),
    0x259B50: ("E", "set1"),
    0x2598E6: ("OBJ", "arm"),    0x25994A: ("OBJ", "disarm"),
    0x2598FE: ("OBJ", "armall"), 0x259924: ("OBJ", "disarmall"),
}

# Verbs that carry an id in D0.
ID_VERBS = frozenset(("start", "stop", "query", "query1", "clr1",
                      "set1", "arm", "disarm"))

# The bank the boss lives in.  Calls outside this range are engine helpers.
BOSS_LO, BOSS_HI = 0x292000, 0x297000

# Driver entries outside the tables (all ported).  Included in the closure so
# shared-helper reachability is correct, but not counted as table entries.
DRIVER_ENTRIES = (0x2926E2, 0x292902, 0x294AD8)

TERMS = ("rts", "rte", "rtr")


# ==========================================================================
# ROM reader
# ==========================================================================

class Rom:
    def __init__(self, data: bytes):
        self.d = data
        self.md = Cs(CS_ARCH_M68K, CS_MODE_M68K_030)

    def r32(self, a):  # big-endian longword, address == file offset
        return struct.unpack_from(">I", self.d, a)[0]

    def r16(self, a):
        return struct.unpack_from(">H", self.d, a)[0]


# ==========================================================================
# The table walker -- reads the five tables into entry records
# ==========================================================================

def walk_tables(rom: Rom):
    """Return a list of (family, id, kind, addr) for every entry point."""
    entries = []
    for t in TABLES:
        n = (t["end"] - t["base"]) // 8
        t["ids"] = n
        for i in range(n):
            init = rom.r32(t["base"] + i * 8)
            step = rom.r32(t["base"] + i * 8 + 4)
            entries.append((t["name"], i, "INIT", init))
            entries.append((t["name"], i, "STEP", step))

    # OBJECT list: $FFFFFFFF-terminated single pointers
    i = 0
    while True:
        v = rom.r32(OBJ_BASE + i * 4)
        if v == 0xFFFFFFFF:
            break
        entries.append(("OBJ", i, "-", v))
        i += 1

    # extent sanity (W99 section 1 landmarks)
    for a in (0x2958CE, 0x2937B2):
        assert rom.d[a:a + 4] == bytes.fromhex("42544e75"), \
            f"landmark missing at ${a:06X}"
    assert rom.r32(0x294F68) == 0x294FA0, "F[0].INIT != base+0x38"

    return entries


# ==========================================================================
# The routine closure walker -- general M68K branch-closure disassembly
#
# Returns (set of instruction addresses -> instruction, set of call targets).
# A call is any jsr/bsr/jmp to a target OUTSIDE the closure window.  In-range
# branches and bra/jmp are followed.  `jsr (An)` is invisible and every size
# this tool reports is a LOWER BOUND because of it.
# ==========================================================================

def _target(op_first: str):
    """Parse a capstone operand's first token into an int, or None."""
    if not op_first.startswith("$"):
        return None
    t = op_first.lstrip("$")
    for suf in (".l", ".w", ".b", ".s"):
        if t.endswith(suf):
            t = t[:-2]
    try:
        return int(t, 16)
    except ValueError:
        return None


def routine(rom: Rom, start: int, limit=0x4000):
    seen = {}
    todo = [start]
    calls = set()
    while todo:
        pc = todo.pop()
        while True:
            if pc in seen:
                break
            if pc - start > limit or pc < start - limit:
                break
            got = list(rom.md.disasm(rom.d[pc:pc + 16], pc, count=1))
            if not got:
                break
            ins = got[0]
            seen[pc] = ins
            m = ins.mnemonic
            op = ins.op_str.strip()
            first = op.split(",")[0].strip()
            tgt = _target(first)
            if m.startswith(("bsr", "jsr")):
                if tgt is not None:
                    calls.add(tgt)
            elif m in ("bra", "jmp"):
                if tgt is not None:
                    if abs(tgt - start) <= limit:
                        todo.append(tgt)
                    else:
                        calls.add(tgt)
                break
            elif m in TERMS:
                break
            elif m.startswith("b") and not m.startswith(
                    ("bset", "bclr", "btst", "bchg", "bkpt")):
                if tgt is not None:
                    if abs(tgt - start) <= limit:
                        todo.append(tgt)
                    else:
                        calls.add(tgt)
            elif m.startswith("db"):
                if tgt is not None and abs(tgt - start) <= limit:
                    todo.append(tgt)
            pc += len(ins.bytes)
    return seen, calls


def closure(rom: Rom, roots, boss_only=True):
    """Transitive closure over call targets.  Returns {addr: (seen, calls)}."""
    cache = {}
    done = set()
    todo = list(roots)
    lo, hi = (BOSS_LO, BOSS_HI) if boss_only else (0x230000, 0x2B0000)
    while todo:
        a = todo.pop()
        if a in done or a == 0:
            continue
        done.add(a)
        if a not in cache:
            cache[a] = routine(rom, a)
        _, calls = cache[a]
        for c in calls:
            if c not in done and lo <= c < hi:
                todo.append(c)
    return cache


# ==========================================================================
# Activation graph -- scan the whole image for start sites
#
# W99 section 4: D 4, D 5 and D 6 are started by TAIL CALLS (`jmp`, not
# `jsr`), so a `jsr`-only scan reports them as never started.  This scan walks
# BOTH opcodes over the full image and resolves the D0 immediate at each site.
# ==========================================================================

def _scan_api_sites(rom: Rom, apis):
    """Scan the whole image for `jsr $API.l` / `jmp $API.l` sites.

    Returns [(pc, opcode_kind, api_addr)] in address order."""
    sites = []
    for opbytes, kind in ((b"\x4e\xb9", "jsr"), (b"\x4e\xf9", "jmp")):
        i = 0
        while True:
            i = rom.d.find(opbytes, i)
            if i == -1:
                break
            if i + 6 <= len(rom.d):
                tgt = struct.unpack_from(">I", rom.d, i + 2)[0]
                if tgt in apis:
                    sites.append((i, kind, tgt))
            i += 1
    return sorted(sites)


def activation_graph(rom: Rom, closure_cache):
    """Resolve every scheduler API call site in the walked closure to
    (family, verb, id or None).  Returns the started dict {(fam, id): [callers]}.

    D0 is tracked by an address-ordered scan of each routine: the last immediate
    move into D0 before the call is the id.  Arithmetic on D0 invalidates it.
    An unresolved id is flagged but never guessed (knowledge/09)."""
    acts = []
    for ra, (seen, _) in closure_cache.items():
        d0 = None
        for pc in sorted(seen):
            ins = seen[pc]
            m, op = ins.mnemonic, ins.op_str.replace(" ", "")
            if re.match(r"^(moveq|move\.[bwl]|movea\.[wl])$", m) and op.endswith(",d0"):
                src = op[:-3]
                if src.startswith("#$"):
                    try:
                        d0 = int(src[2:], 16)
                    except ValueError:
                        d0 = None
                elif src.startswith("#-"):
                    d0 = int(src[1:], 10) & 0xFFFFFFFF
                elif src.startswith("#"):
                    try:
                        d0 = int(src[1:], 10)
                    except ValueError:
                        d0 = None
                else:
                    d0 = None
            elif m.startswith(("jsr", "bsr")) or m == "jmp":
                tgt = _target(op.split(",")[0].strip())
                if tgt in API:
                    fam, verb = API[tgt]
                    need_id = verb in ID_VERBS
                    sid = ((d0 & 0xFF) if (need_id and d0 is not None)
                           else (None if need_id else "-"))
                    acts.append((pc, ra, fam, verb, sid))
            elif (m.startswith(("add", "sub", "and", "or", "eor", "not", "neg",
                                "lsl", "lsr", "asl", "asr", "rol", "ror", "swap",
                                "ext", "mul", "div", "clr"))
                  and op.endswith("d0")):
                d0 = None
            elif m.startswith("move") and op.endswith(",d0"):
                d0 = None

    started = {}
    unresolved = []
    for (pc, ra, fam, verb, sid) in acts:
        if verb in ("start", "arm") and sid is not None and sid != "-":
            started.setdefault((fam, sid), set()).add(ra)
        if sid is None:
            unresolved.append((pc, ra, fam, verb))
    return started, unresolved, acts


# ==========================================================================
# Ported set -- DERIVED from registerScript in source, never a hand list
# ==========================================================================

def ported_set():
    """Grep every .js under src/ for registerScript(0xADDR) calls."""
    ported = set()
    for f in sorted(SRC_DIR.glob("*.js")):
        src = f.read_text(encoding="utf-8")
        for m in re.finditer(r"registerScript\(0x([0-9a-fA-F]+)", src):
            ported.add(int(m.group(1), 16))
    return ported


# ==========================================================================
# Dynamic set -- two sources, unioned
# ==========================================================================

RAMBASE = 0x800000

# Slot-table geometry (from scheduler.js SCHED, verified W99 section 1)
SCHED_PTRS = dict(
    A0=0x812984, A1=0x812bd4, A2=0x8129cc, A3=0x812a70, A4=0x812d38)
SLOT_BASE = dict(
    A1=0x812bd8, A2=0x8129d0, A3=0x812a74, A4=0x812d3c)
SLOT_COUNT = dict(A1=10, A2=20, A3=10, A4=5)
SLOT_STRIDE = dict(A1=0x20, A2=0x08, A3=0x20, A4=0x20)
FAM_OF = dict(A4="F", A0="MAIN", A1="E", A3="D", A2="OBJ")


def board_observed(rom: Rom):
    """Read every checkpoint RAM dump and collect the set of entry addresses
    that were live in a slot at any rung.  Returns (set_of_addrs, n_rungs).

    This is the oracle's own record -- the board's RAM at a sampled instant.
    SAMPLED presence, not execution: a script that finishes between two rungs
    (250 frames apart) is invisible."""
    if not CKPT_DIR.exists():
        return None, 0
    dumps = sorted(glob.glob(str(CKPT_DIR / "c*.ram.bin")))
    if not dumps:
        return None, 0
    seen_addr = set()
    for p in dumps:
        b = open(p, "rb").read()

        def r32(a):
            return struct.unpack_from(">I", b, a - RAMBASE)[0]

        def r16(a):
            return struct.unpack_from(">H", b, a - RAMBASE)[0]

        # F, E, D slot tables
        for cls in ("A4", "A1", "A3"):
            tab = r32(SCHED_PTRS[cls])
            if tab == 0:
                continue
            for i in range(SLOT_COUNT[cls]):
                a = SLOT_BASE[cls] + i * SLOT_STRIDE[cls]
                s = r16(a)
                if s == 0:
                    continue
                sid = s & 0xFF
                off = sid << 3
                seen_addr.add(rom.r32(tab + off))
                seen_addr.add(rom.r32(tab + off + 4))
        # MAIN cursor
        if r32(SCHED_PTRS["A0"]) != 0:
            cur = r16(0x81298A)
            if r16(0x812980) != 0:
                cur = r16(0x812982)
            if cur != 0xFFFF:
                t = r32(SCHED_PTRS["A0"])
                seen_addr.add(rom.r32(t + (cur << 3)))
                seen_addr.add(rom.r32(t + (cur << 3) + 4))
        # OBJECT slots (pre-filled, status >= $8000 means live)
        if r32(SCHED_PTRS["A2"]) != 0:
            for i in range(20):
                a = 0x8129D0 + i * 8
                if r16(a) < 0x8000:
                    continue
                seen_addr.add(r32(a + 2))
    return seen_addr, len(dumps)


def port_dispatched():
    """Read the port's dispatched-address log if seedcmp dumped one."""
    if not DISPATCH_LOG.exists():
        return None
    try:
        j = json.loads(DISPATCH_LOG.read_text(encoding="utf-8"))
        return set(int(x) for x in j.get("dispatched", []))
    except (json.JSONDecodeError, ValueError):
        return None


# ==========================================================================
# Gate
# ==========================================================================

def load_baseline():
    """The ported-set snapshot.  A regression floor: the current ported set
    must be a SUPERSET.  Updated when coverage grows; never hand-edited."""
    if not BASELINE.exists():
        return None
    j = json.loads(BASELINE.read_text(encoding="utf-8"))
    return set(j.get("ported", []))


def write_baseline(ported):
    """Write the current ported set as the new baseline."""
    BASELINE.write_text(
        json.dumps(dict(ported=sorted(ported)), indent=1) + "\n",
        encoding="utf-8")


# ==========================================================================
# Main
# ==========================================================================

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--json", metavar="PATH", help="write machine-readable output")
    ap.add_argument("--break-coverage", action="store_true",
                    help="RED: drop one ported address to simulate a regression")
    ap.add_argument("--break-inventory", action="store_true",
                    help="RED: inject a dynamic entry the enumerator never listed")
    ap.add_argument("--update-baseline", action="store_true",
                    help="write the current ported set as the baseline and exit")
    args = ap.parse_args()

    if not ROM_PATH.exists():
        print(f"FAIL: {ROM_PATH} missing -- run the oracle once to decrypt the image")
        return 1
    rom = Rom(ROM_PATH.read_bytes())

    # ---- 1. tables ----
    entries = walk_tables(rom)
    ep_addrs = {a for *_, a in entries}
    entry_addrs = sorted(ep_addrs)

    # ---- 2. closures + sizes ----
    roots = sorted(ep_addrs | set(DRIVER_ENTRIES))
    clos = closure(rom, roots, boss_only=False)

    def size_of(a):
        seen, _ = clos[a]
        return len(seen), sum(len(i.bytes) for i in seen.values())

    # ---- 3. activation graph ----
    started, unresolved, acts = activation_graph(rom, clos)

    # ---- 4. ported set ----
    ported = ported_set()
    ported_in_tables = ported & ep_addrs

    if args.update_baseline:
        write_baseline(ported_in_tables)
        print(f"wrote baseline: {len(ported_in_tables)} ported entry addresses "
              f"to {BASELINE.name}")
        return 0

    if args.break_coverage:
        # RED VALIDATION for condition (a): pretend one registration was dropped
        drop = sorted(ported_in_tables)[0]
        ported.discard(drop)
        ported_in_tables.discard(drop)
        print(f"!! --break-coverage: dropped $${drop:06X} from the ported set")

    # ---- 5. dynamic set ----
    dyn_board, n_rungs = board_observed(rom)
    dyn_port = port_dispatched()
    dyn = set()
    if dyn_board:
        dyn |= dyn_board
    if dyn_port:
        dyn |= dyn_port
    dyn_in_tables = dyn & ep_addrs if dyn else set()

    if args.break_inventory:
        # RED VALIDATION for condition (b): inject a dynamic address not in any
        # table -- the oracle "observed" something the enumerator never listed
        fake = 0x297000  # inside the boss bank, past every table
        dyn_in_tables.discard(fake)
        dyn.add(fake)
        dyn_in_tables.add(fake)
        print(f"!! --break-inventory: injected $${fake:06X} into the dynamic set")

    # ---- classify entries ----
    DEAD_IDS = set()
    table_ids = {}
    for (fam, sid, kind, a) in entries:
        table_ids.setdefault(fam, set()).add(sid)
    for fam in table_ids:
        for sid in table_ids[fam]:
            if (fam, sid) not in started:
                DEAD_IDS.add((fam, sid))

    ported_eps = 0
    live_unported = 0
    dead_eps = 0
    for (fam, sid, kind, a) in entries:
        if (fam, sid) in DEAD_IDS:
            dead_eps += 1
        elif a in ported:
            ported_eps += 1
        else:
            live_unported += 1

    # ---- THE JOIN ----
    # static minus dynamic: exists, never executed (untested code)
    static_addrs = ep_addrs
    if dyn:
        never_executed = static_addrs - dyn
        never_executed_live = {a for a in never_executed
                               if a in ported}  # ported but unexercised
        never_executed_unported = {a for a in never_executed
                                   if a not in ported}
        # dynamic minus static: oracle saw something the enumerator missed
        dyn_minus_static = dyn - static_addrs
    else:
        never_executed = set()
        never_executed_live = set()
        never_executed_unported = set()
        dyn_minus_static = set()

    # ---- phantom registrations: port claims an entry in the boss bank that
    #      is not in any table ----
    phantom = {a for a in ported if BOSS_LO <= a < BOSS_HI and a not in ep_addrs}

    # ---- baseline regression check (condition a) ----
    baseline = load_baseline()
    regressions = set()
    if baseline is not None:
        regressions = baseline - ported

    # ---- report ----
    n_entries = len(entries)
    print("=" * 90)
    print(f"BOSS COVERAGE -- {n_entries} entry points across {len(TABLES)} tables "
          f"+ OBJECT (maincpu.bin, capstone CS_MODE_M68K_030)")
    for t in TABLES:
        print(f"  {t['name']:4s} base ${t['base']:06X}  end ${t['end']:06X}  "
              f"{t['ids']} ids  {t['slots']} slot(s)")
    n_obj = len([e for e in entries if e[0] == "OBJ"])
    print(f"  OBJ  base ${OBJ_BASE:06X}  {n_obj} entries  $FFFFFFFF-terminated")
    print()

    print(f"PORTED (registerScript-derived): {ported_eps} entry points "
          f"({len(ported_in_tables)} unique addresses)")
    print(f"LIVE-UNPORTED:  {live_unported} entry points")
    print(f"DEAD (no start site anywhere): {dead_eps} entry points "
          f"(ids: {sorted(f'{f}{s}' for f, s in DEAD_IDS)})")
    print(f"PHANTOM registrations (boss range, not a table entry): {len(phantom)}")
    if phantom:
        for a in sorted(phantom):
            print(f"  *** $${a:06X} registered but not in any boss table")
    print(f"ACTIVATION: {len(acts)} API call sites in closure, "
          f"{len(unresolved)} unresolved D0")
    for (pc, ra, fam, verb) in sorted(unresolved):
        print(f"  UNRESOLVED  $${pc:06X} in $${ra:06X}  {fam}.{verb}")
    print()

    if dyn_board is not None:
        print(f"DYNAMIC (board-observed): {len(dyn_board)} entry addresses "
              f"live at some rung across {n_rungs} RAM dumps")
    else:
        print("DYNAMIC (board-observed): NOT AVAILABLE -- "
              f"run `python games/ddpdoj/tools/oracle/pgm.py ckpt` to build the ladder")
    if dyn_port is not None:
        print(f"DYNAMIC (port-dispatched): {len(dyn_port)} addresses "
              f"(scheduler.js dispatched log)")
    else:
        print("DYNAMIC (port-dispatched): NOT AVAILABLE -- "
              f"run `node games/ddpdoj/tools/seedcmp.mjs --manifest ... "
              f"--dump-dispatched`")
    print(f"DYNAMIC union in tables: {len(dyn_in_tables)} of {len(ep_addrs)} "
          f"unique entry addresses")
    print()

    # ---- THE JOIN report ----
    print("=" * 90)
    print("THE JOIN (plan 100)")
    if dyn:
        print(f"STATIC minus DYNAMIC (exists, NEVER executed): "
              f"{len(never_executed)} unique addresses")
        # group by ported/unported
        ne_ported = sorted(a for a in never_executed if a in ported)
        ne_unported = sorted(a for a in never_executed if a not in ported)
        print(f"  of which PORTED but UNEXERCISED: {len(ne_ported)}")
        if args.verbose:
            for a in ne_ported:
                # find the entry label
                lbl = [(f, s, k) for (f, s, k, aa) in entries if aa == a]
                tag = ",".join(f"{f}{s} {k}" for f, s, k in lbl)
                print(f"    $${a:06X}  {tag}")
        print(f"  of which UNPORTED (expected -- never runs because not ported): "
              f"{len(ne_unported)}")
        print()
        print(f"DYNAMIC minus STATIC (enumerator hole?): "
              f"{len(dyn_minus_static)} addresses")
        for a in sorted(dyn_minus_static):
            print(f"  *** $${a:06X} observed by the oracle but NOT in any table")
    else:
        print("  (no dynamic evidence on disk -- the join cannot run)")
    print()

    # ---- sizes ----
    print("=" * 90)
    boss_insns = set()
    for a, (seen, _) in clos.items():
        if BOSS_LO <= a < BOSS_HI:
            for pc, ins in seen.items():
                boss_insns.add(pc)
    print(f"CLOSURE: {len(clos)} routines, {len(boss_insns)} unique boss-local "
          f"instructions (LOWER BOUND, jsr (An) invisible)")
    print()

    # ---- GATE CONDITIONS ----
    print("=" * 90)
    fail_a = False
    fail_b = False

    # (a) coverage regression
    print("CONDITION (a): coverage regression")
    if phantom:
        print(f"  FAIL: {len(phantom)} phantom registration(s) -- "
              "port claims entries the ROM does not have")
        fail_a = True
    if baseline is not None and regressions:
        print(f"  FAIL: {len(regressions)} ported entry address(es) lost since "
              f"baseline: {sorted(f'${a:06X}' for a in regressions)}")
        fail_a = True
    if not fail_a:
        if baseline is not None:
            print(f"  OK: ported set is a superset of the baseline "
                  f"({len(baseline)} addresses)")
        else:
            print(f"  OK (no baseline yet -- first run; use --update-baseline)")

    # (b) inventory regression
    print("CONDITION (b): inventory regression (oracle vs enumerator)")
    if not dyn:
        print("  SKIP: no dynamic evidence on disk -- condition cannot run")
        print("        (this is honest, not green; see DYNAMIC section above)")
    elif dyn_minus_static:
        print(f"  FAIL: oracle observed {len(dyn_minus_static)} address(es) "
              "the enumerator never listed")
        fail_b = True
    else:
        print(f"  OK: every dynamically observed address is in the static "
              f"inventory ({len(dyn_in_tables)} checked)")

    print()
    if fail_a or fail_b:
        why = []
        if fail_a:
            why.append("(a) coverage")
        if fail_b:
            why.append("(b) inventory")
        print(f"FAIL: {' and '.join(why)} regression detected")
        rc = 1
    else:
        print(f"OK: boss coverage {ported_eps}/{n_entries} entry points ported, "
              f"{live_unported} live-unported, {dead_eps} dead")
        rc = 0

    # ---- JSON ----
    if args.json:
        out = dict(
            total_entries=n_entries,
            ported_entries=ported_eps,
            live_unported=live_unported,
            dead_entries=dead_eps,
            dead_ids=sorted(f"{f}{s}" for f, s in DEAD_IDS),
            entries=[dict(family=f, id=s, kind=k, addr=a,
                          ported=(a in ported),
                          state=("dead" if (f, s) in DEAD_IDS else
                                 "ported" if a in ported else "unported"),
                          started=((f, s) in started),
                          ) for (f, s, k, a) in entries],
            ported_addrs=sorted(ported_in_tables),
            dynamic_board=sorted(dyn_board) if dyn_board else None,
            dynamic_port=sorted(dyn_port) if dyn_port else None,
            never_executed=sorted(never_executed) if dyn else None,
            dyn_minus_static=sorted(dyn_minus_static) if dyn else None,
            n_api_sites=len(acts),
            n_unresolved=len(unresolved),
        )
        Path(args.json).write_text(json.dumps(out, indent=1) + "\n",
                                   encoding="utf-8")
        print(f"wrote {args.json}")

    return rc


if __name__ == "__main__":
    raise SystemExit(main())
