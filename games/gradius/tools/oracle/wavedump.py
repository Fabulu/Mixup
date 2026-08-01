#!/usr/bin/env python3
"""Decode EVERY stage wave script out of the Gradius PRG.

Chain (all read straight from assets/prg.bin, no emulator):
  $A7D0[stage*2]        -> chunk pointer table
  chunkTable[$61]       -> wave list ($61 = $3F AND $0E, a BYTE offset)
  wave list             -> records, $FF trigger byte terminates
    record = [trigger, cmd]                       (2 bytes)  unless cmd >= $F0,
    record = [trigger, cmd, b2, b3, b4]           (5 bytes)  inline descriptor
  fire when scroll $3F:$3E >= ($61 + carry):(trigger*2)

  cmd <  $80 : descriptor = 4 bytes at [$A5FE] + 3*cmd     -> $A3B1 single spawn
  cmd $80-EF : descriptor = 4 bytes at [$A600] + ((4*cmd)&$FF) -> $A3E4 formation
  cmd >= $F0 : descriptor = the 5 inline bytes, $64 -= $70 -> $A466

Usage: python wavedump.py [--stage N] [--csv]
"""
import sys, os, json

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
PRG = os.path.join(ROOT, "assets", "prg.bin")
BASE = 0x8000

rom = open(PRG, "rb").read()
assert len(rom) == 0x8000, len(rom)


def rd(a):
    return rom[a - BASE]


def rw(a):
    return rd(a) | (rd(a + 1) << 8)


STAGE_PTR = 0xA7D0
TABLE_A = rw(0xA5FE)
TABLE_B = rw(0xA600)
FORM_TBL = 0xA592      # 2 bytes per entry
PAT_TBL = 0xA5BC       # 3 bytes per entry
DISPATCH = 0xAE1C      # 42 handler words, indexed by the TYPE byte

stage_ptrs = [rw(STAGE_PTR + 2 * i) for i in range(7)]
# chunk-table length = distance to the next stage's table
chunk_counts = []
for i, p in enumerate(stage_ptrs):
    nxt = stage_ptrs[i + 1] if i + 1 < len(stage_ptrs) else 0xA844
    chunk_counts.append((nxt - p) // 2)

handlers = [rw(DISPATCH + 2 * i) for i in range(42)]


def handler_idx(t):
    """$AE19 JSR $83E4 with A = the type byte. $83E4's ASL A is 8-bit and the
    carry is discarded, so the effective jump-table index is (type AND $7F)."""
    return t & 0x7F


def handler_of(t):
    i = handler_idx(t)
    if i < 42:
        return "$%04X[%d]" % (handlers[i], i)
    a = DISPATCH + 2 * i
    return "OOR->$%04X[%d]" % (rw(a), i)


def form_entry(i):
    b0 = rd(FORM_TBL + 2 * i)
    b1 = rd(FORM_TBL + 2 * i + 1)
    return b0 & 0x0F, b0 & 0xF0, b1   # count, spawnX, baseY


def pat_entry(i):
    a = PAT_TBL + 3 * i
    return rd(a), rd(a + 1), rd(a + 2)   # delay, dY, style


records = []   # dicts


def decode_chunk(stage, chunk, ptr):
    """Walk one wave list. Returns list of record dicts."""
    out = []
    a = ptr
    guard = 0
    while True:
        guard += 1
        if guard > 400:
            out.append({"error": "runaway at $%04X" % a})
            break
        if a >= 0xFFFF:
            out.append({"error": "ran off PRG"})
            break
        trig = rd(a)
        if trig == 0xFF:
            out.append({"stage": stage, "chunk": chunk, "addr": a,
                        "kind": "END", "trigger": 0xFF})
            break
        cmd = rd(a + 1)
        # fire position: $99 = $61 + carry(trigger*2), $98 = (trigger*2)&FF
        lo = (trig << 1) & 0xFF
        hi = (chunk * 2) + ((trig << 1) >> 8)
        scroll = (hi << 8) | lo
        r = {"stage": stage, "chunk": chunk, "addr": a, "trigger": trig,
             "cmd": cmd, "scroll": scroll}
        if cmd >= 0xF0:
            b = [rd(a + i) for i in range(5)]
            r["kind"] = "INLINE"
            r["size"] = 5
            r["raw"] = b
            d64 = (b[1] - 0x70) & 0xFF
            r["desc"] = [d64, b[2], b[3], b[4]]
            r["route"] = "$A466"
            r["types"] = [0x96] if stage == 2 else [b[3]]
            r["note"] = ("$A46F (stage 3 only) forces type $96"
                         if stage == 2 else "$A4A6 $0600 special, type=$66")
            a += 5
        elif cmd >= 0x80:
            da = TABLE_B + ((cmd * 4) & 0xFF)
            d = [rd(da + i) for i in range(4)]
            cnt, sx, by = form_entry(d[2])
            dly, dy, sty = pat_entry(d[3])
            r["kind"] = "FORM"
            r["size"] = 2
            r["descAddr"] = da
            r["desc"] = d
            r["route"] = "$A3E4"
            r["types"] = [d[1]]
            r["form"] = {"idx": d[2], "count": cnt, "spawnX": sx, "baseY": by}
            r["pat"] = {"idx": d[3], "delay": dly, "dY": dy, "style": sty,
                        "powerup": bool(sty & 1)}
            a += 2
        else:
            da = TABLE_A + 3 * cmd
            d = [rd(da + i) for i in range(4)]
            t = (d[0] - 0xA0) & 0xFF
            if t >= 0x30:
                t = (d[0] - 0xD0) & 0xFF
                sx = 0x10
            else:
                sx = 0xF0
            r["kind"] = "SINGLE"
            r["size"] = 2
            r["descAddr"] = da
            r["desc"] = d
            r["route"] = "$A3B1"
            r["types"] = [t]
            r["single"] = {"type": t, "spawnX": sx, "style": d[1], "y": d[2],
                           "powerup": bool(d[1] & 1)}
            a += 2
        out.append(r)
    return out


all_recs = []
for s in range(7):
    for c in range(chunk_counts[s]):
        p = rw(stage_ptrs[s] + 2 * c)
        all_recs += decode_chunk(s, c, p)

if "--json" in sys.argv:
    print(json.dumps({"stagePtrs": ["$%04X" % p for p in stage_ptrs],
                      "chunkCounts": chunk_counts,
                      "tableA": "$%04X" % TABLE_A, "tableB": "$%04X" % TABLE_B,
                      "records": all_recs}, indent=1))
    sys.exit(0)

want = None
for i, a in enumerate(sys.argv):
    if a == "--stage":
        want = int(sys.argv[i + 1])

print("stage ptr table $A7D0:", " ".join("$%04X" % p for p in stage_ptrs))
print("chunks per stage    :", chunk_counts)
print("tableA $%04X  tableB $%04X" % (TABLE_A, TABLE_B))
print()
cur = None
n_fire = 0
for r in all_recs:
    if want is not None and r.get("stage") != want:
        continue
    key = (r.get("stage"), r.get("chunk"))
    if key != cur:
        cur = key
        p = rw(stage_ptrs[key[0]] + 2 * key[1])
        print("\n== stage %d (S%d) chunk %d @ $%04X  scroll $%04X-$%04X ==" %
              (key[0], key[0] + 1, key[1], p, key[1] * 512, key[1] * 512 + 511))
    if r.get("kind") == "END":
        print("  $%04X  FF                 -- terminator" % r["addr"])
        continue
    n_fire += 1
    ts = " ".join("$%02X" % t for t in r["types"])
    extra = ""
    if r["kind"] == "FORM":
        f, pt = r["form"], r["pat"]
        extra = ("form%02d n=%d X=$%02X Y=$%02X | pat%02d dly=%d dY=%d sty=$%02X%s"
                 % (f["idx"], f["count"], f["spawnX"], f["baseY"],
                    pt["idx"], pt["delay"], pt["dY"], pt["style"],
                    " POWERUP" if pt["powerup"] else ""))
    elif r["kind"] == "SINGLE":
        s1 = r["single"]
        extra = "X=$%02X Y=$%02X sty=$%02X%s" % (
            s1["spawnX"], s1["y"], s1["style"],
            " POWERUP" if s1["powerup"] else "")
    else:
        extra = "raw " + " ".join("$%02X" % b for b in r["raw"])
    print("  $%04X  trig $%02X cmd $%02X @scroll $%04X  %-6s type %-4s %-9s %s"
          % (r["addr"], r["trigger"], r["cmd"], r["scroll"], r["kind"], ts,
             handler_of(r["types"][0]), extra))

print("\nfiring records shown: %d" % n_fire)

# ---- inventory -------------------------------------------------------------
BOSS_AT = [rd(0x9A3D + i) for i in range(7)]     # $3F that flips $1B to $81
ADV_AT = [rd(0x98FD + i) for i in range(7)]      # $3F that ends the stage

print("\n\n================ INVENTORY ================")
print("boss-mode scroll high byte $9A3D :", " ".join("$%02X" % b for b in BOSS_AT))
print("stage-advance  high byte   $98FD :", " ".join("$%02X" % b for b in ADV_AT))
print("live chunk index range = 0 .. floor(($98FD[s]-1)/2)")
print()
hdr = ("%-6s %-7s %-7s %-6s %-6s %-6s %-6s %-5s  %s" %
       ("stage", "chunks", "live", "recs", "live", "FORM", "SINGLE", "INLIN", "types (live chunks)"))
print(hdr)
all_types = {}
for s in range(7):
    lastlive = (ADV_AT[s] - 1) // 2
    recs = [r for r in all_recs if r.get("stage") == s and r.get("kind") != "END"]
    live = [r for r in recs if r["chunk"] <= lastlive]
    tys = {}
    for r in live:
        for t in r["types"]:
            tys[t] = tys.get(t, 0) + 1
            all_types[t] = all_types.get(t, 0) + 1
    print("%-6d %-7d %-7s %-6d %-6d %-6d %-6d %-5d  %s" %
          (s, chunk_counts[s], "0-%d" % lastlive, len(recs), len(live),
           sum(1 for r in live if r["kind"] == "FORM"),
           sum(1 for r in live if r["kind"] == "SINGLE"),
           sum(1 for r in live if r["kind"] == "INLINE"),
           " ".join("$%02X" % t for t in sorted(tys))))

print("\n-- every enemy type any live wave record spawns --")
for t in sorted(all_types):
    print("  type $%02X  n=%-4d  handler %s" % (t, all_types[t], handler_of(t)))
print("distinct types: %d   distinct handlers: %d" %
      (len(all_types), len(set(handler_idx(t) for t in all_types))))

print("\n-- descriptor-table usage --")
cmds = {}
for r in all_recs:
    if r.get("kind") == "END":
        continue
    cmds.setdefault(r["cmd"], 0)
    cmds[r["cmd"]] += 1
print("distinct cmd bytes: %d" % len(cmds))
print("  cmd < $80  (tableA/$A3B1) :", len([c for c in cmds if c < 0x80]),
      "distinct, max $%02X -> tableA spans $%04X-$%04X" %
      (max([c for c in cmds if c < 0x80]), TABLE_A,
       TABLE_A + 3 * max([c for c in cmds if c < 0x80]) + 3))
print("  cmd $80-$EF (tableB/$A3E4):", len([c for c in cmds if 0x80 <= c < 0xF0]),
      "distinct:", " ".join("$%02X" % c for c in sorted(c for c in cmds if 0x80 <= c < 0xF0)))
print("  cmd >= $F0 (inline/$A466) :", len([c for c in cmds if c >= 0xF0]),
      "distinct:", " ".join("$%02X" % c for c in sorted(c for c in cmds if c >= 0xF0)))
forms = sorted(set(r["form"]["idx"] for r in all_recs if r.get("kind") == "FORM"))
pats = sorted(set(r["pat"]["idx"] for r in all_recs if r.get("kind") == "FORM"))
print("  formation entries used ($A592):", forms)
print("  pattern   entries used ($A5BC):", pats)

# ---- port coverage ---------------------------------------------------------
# Ported handler ROUTINES, read out of src/enemies.js dispatch() switch.
PORTED = {0xAE70, 0xAEDD, 0xAE99, 0xAEE1, 0xB026, 0xB098, 0xB0AF, 0xB198,
          0xB205, 0xB26C}
PORTED_ROUTES = {"$A3B1", "$A3E4"}      # $A466 (cmd >= $F0) throws in src

print("\n\n================ PORT COVERAGE ================")
print("ported handler routines (src/enemies.js dispatch()): %d" % len(PORTED))
print("ported spawn routes: %s ; $A466 THROWS" % sorted(PORTED_ROUTES))
print()
print("%-6s %-6s %-9s %-9s %-9s  %s" %
      ("stage", "live", "ok", "badRoute", "badType", "first blocking record"))
for s in range(7):
    lastlive = (ADV_AT[s] - 1) // 2
    live = [r for r in all_recs
            if r.get("stage") == s and r.get("kind") != "END"
            and r["chunk"] <= lastlive]
    ok = badr = badt = 0
    first = None
    for r in live:
        bad = None
        if r["route"] not in PORTED_ROUTES:
            bad = "route %s" % r["route"]
            badr += 1
        elif handlers[handler_idx(r["types"][0])] not in PORTED:
            bad = "type $%02X -> %s" % (r["types"][0],
                                        handler_of(r["types"][0]))
            badt += 1
        else:
            ok += 1
        if bad and first is None:
            first = "$%04X ch%d scroll $%04X cmd $%02X : %s" % (
                r["addr"], r["chunk"], r["scroll"], r["cmd"], bad)
    print("%-6d %-6d %-9d %-9d %-9d  %s" % (s, len(live), ok, badr, badt, first))

print("\n-- stage 1 (index 0): every live record the port cannot run --")
lastlive = (ADV_AT[0] - 1) // 2
for r in all_recs:
    if r.get("stage") != 0 or r.get("kind") == "END" or r["chunk"] > lastlive:
        continue
    t = r["types"][0]
    if r["route"] not in PORTED_ROUTES or handlers[handler_idx(t)] not in PORTED:
        print("  $%04X ch%d scroll $%04X cmd $%02X type $%02X %s" %
              (r["addr"], r["chunk"], r["scroll"], r["cmd"], t, handler_of(t)))

print("\n-- per stage: handler routines needed vs ported --")
# handlers that SPAWN a type no wave list names ($AF98's two callers, and the
# power-up capsule): read out of the listing, confirmed by wavelog.py's $AE19
# histogram ($09 and $0C appear there and in no wave record).
CHILDREN = {0x0F: [0x09], 0x10: [0x0C]}
for s in range(7):
    lastlive = (ADV_AT[s] - 1) // 2
    live = [r for r in all_recs
            if r.get("stage") == s and r.get("kind") != "END"
            and r["chunk"] <= lastlive]
    tys = set()
    for r in live:
        tys.add(r["types"][0])
    for t in list(tys):
        for c in CHILDREN.get(t, []):
            tys.add(c)
    tys.add(0x01)                      # $AEC1: every power-up carrier's death
    rout = {handlers[handler_idx(t)] for t in tys}
    miss = sorted(rout - PORTED)
    blocked = {}
    for r in live:
        t = r["types"][0]
        if r["route"] not in PORTED_ROUTES:
            blocked["route " + r["route"]] = blocked.get("route " + r["route"], 0) + 1
        elif handlers[handler_idx(t)] not in PORTED:
            k = "$%04X(t$%02X)" % (handlers[handler_idx(t)], t)
            blocked[k] = blocked.get(k, 0) + 1
    print("stage %d: %2d routines needed, %2d ported, missing %s" %
          (s, len(rout), len(rout) - len(miss),
           " ".join("$%04X" % m for m in miss)))
    print("         blocked live records: " +
          " ".join("%s=%d" % (k, v) for k, v in sorted(blocked.items(),
                                                       key=lambda kv: -kv[1])))
    print("         stage length $%02X00 px; first blocker at %s" %
          (BOSS_AT[s], "n/a" if not blocked else
           "$%04X (%.0f%% in)" % (
               min(r["scroll"] for r in live
                   if r["route"] not in PORTED_ROUTES
                   or handlers[handler_idx(r["types"][0])] not in PORTED),
               100.0 * min(r["scroll"] for r in live
                           if r["route"] not in PORTED_ROUTES
                           or handlers[handler_idx(r["types"][0])] not in PORTED)
               / (BOSS_AT[s] * 256))))
