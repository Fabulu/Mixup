#!/usr/bin/env python3
"""C1 RECON: decode mailbox.tsv cue payloads to extract the set of (type,id)
that actually FIRE during the stage-1 capture -- the dynamic subset Wave A must
reproduce.  Confirms the pack format [type, pan_after_vol, id, channel<<2]."""
import re
from pathlib import Path
from collections import Counter, defaultdict

P = Path(__file__).resolve().parent.parent.parent / "rip" / "sound" / "mailbox.tsv"
lines = P.read_text().splitlines()
hdr = lines[0].split("\t")
print("hdr:", hdr)

# parse each door; extract the 0006=/0008= pair if present (single-cue doors)
cue_events = []  # (door, vf, lf, type, pan, cid, chan)
multi = 0
for ln in lines[1:]:
    cols = ln.split("\t")
    if len(cols) < 6:
        continue
    door, vf, lf, pc, data, payload = cols[:6]
    # find 0006=XXXX and 0008=YYYY in payload
    m6 = re.findall(r"0006=([0-9A-Fa-f]{4})", payload)
    m8 = re.findall(r"0008=([0-9A-Fa-f]{4})", payload)
    if m6 and m8:
        # take the LAST pair (closest to doorbell); many doors repeat each write twice
        w6 = m6[-1]
        w8 = m8[-1]
        typ = int(w6[0:2], 16)
        pan = int(w6[2:4], 16)
        cid = int(w8[0:2], 16)
        chs2 = int(w8[2:4], 16)
        cue_events.append((int(door), int(vf), int(lf), typ, pan, cid, chs2))
    else:
        multi += 1

print(f"\nparse: {len(cue_events)} cue doors with 0006/0008 pair, {multi} doors without (z80 upload / etc)")
print(f"total doors in file: {len(lines)-1}")

# unique (type, id)
seen = Counter()
id_by_type = defaultdict(set)
for door, vf, lf, typ, pan, cid, chs2 in cue_events:
    seen[(typ, cid)] += 1
    id_by_type[typ].add(cid)

print("\n=== UNIQUE (type, id) THAT FIRE IN STAGE 1 ===")
for (typ, cid), n in sorted(seen.items()):
    # reverse the pan: pan_mailbox = pan_arg - $14 (unless id==$1d) + master; just show raw
    print(f"  type=${typ:X} id=${cid:02X} ({cid:3d})   fires {n}x")

print("\n=== by type ===")
for typ in sorted(id_by_type):
    ids = sorted(id_by_type[typ])
    print(f"  type ${typ:X}: {len(ids)} ids -> {['$%02X' % i for i in ids]}")

# which wrappers correspond (id -> wrapper addr, from my decoded table)
ID2WRAP = {
    0x00: ("$28C25A", "SFX", 0xB4, 0x1E), 1: ("$28C274", "SFX", 0x9E, 0x1E),
    2: ("$28C28E", "SFX", 0x80, 0x1E), 3: ("$28C2A8", "SFX", 0x8A, 0x1E),
    4: ("$28C2C2", "SFX", 0x80, 0x1E), 5: ("$28C2DC", "BGM", 0xA8, 0x1E),
    6: ("$28C2F6", "BGM", 0xA8, 0x1E), 7: ("$28C310", "BGM", 0xFF, 0x1E),
    8: ("$28C32A", "BGM", 0x80, 0x1E), 9: ("$28C344", "BGM", 0x80, 0x1E),
    0xA: ("$28C35E", "BGM", 0x80, 0x1E), 0xB: ("$28C378", "BGM", 0x80, 0x1E),
    0xC: ("$28C3A0", "BGM", 0xB2, 0x3E), 0xD: ("$28C3BA", "BGM", 0x5D, 0x0A),
    0x11: ("$28C3D4", "BGM", 0x5D, 0x0A), 0x15: ("$28C3EE", "BGM", 0x5D, 0x0A),
    0xE: ("$28C408/422/43C/452", "T2/ungated", 0x80, 0x28),
    0x12: ("$28C468/482/49C/4B2", "T2/ungated", 0x80, 0x28),
    0x16: ("$28C4C8/4E2/4FC/512", "T2/ungated", 0xE6, 0x28),
    0xF: ("$28C528", "BGM", 0xE4, 0x28), 0x13: ("$28C542", "BGM", 0xE4, 0x28),
    0x10: ("$28C55C", "BGM", 0xFF, 0x28), 0x14: ("$28C576", "BGM", 0xFF, 0x28),
    0x17: ("$28C5B0", "BGM", 0xFF, 0x00), 0x1D: ("$28C5CA", "BGM", 0xE4, 0x01),
    0x1E: ("$28C5E4/610", "SFX/BGM", 0xFF, 0x01), 0x1F: ("$28C62A", "BGM", 0xFF, 0x01),
    0x20: ("$28C644", "BGM", 0xFF, 0x01), 0x21: ("$28C65E", "BGM", 0xFF, 0x01),
    0x22: ("$28C678", "BGM", 0xFF, 0x01), 0x1C: ("$28C692", "BGM", 0x80, 0x02),
    0x18: ("$28C6AC", "BGM", 0x80, 0x00), 0x19: ("$28C6C6", "BGM", 0x80, 0x00),
    0x1A: ("$28C6E0", "BGM", 0xFF, 0x00), 0x1B: ("$28C6FA", "BGM", 0x94, 0x00),
    0x24: ("$28C714/740", "SFX/BGM", 0x62, 0x03), 0x25: ("$28C75A", "BGM", 0x80, 0x03),
    0x26: ("$28C774", "BGM", 0x80, 0x03), 0x27: ("$28C78E", "BGM", 0x80, 0x03),
    0x28: ("$28C7A8/7C2", "T2/ungated", 0xFF, 0x0A), 0x2D: ("$28C7D8", "BGM", 0xFF, 0x0A),
    0x29: ("$28C812", "BGM", 0xD2, 0x0A), 0x2A: ("$28C82C/846", "T2/ungated", 0x80, 0x0A),
    0x2B: ("$28C85C", "BGM", 0xFF, 0x0A), 0x2C: ("$28C876/890", "T2/ungated", 0xFF, 0x0A),
    0x2E: ("$28C8A6", "BGM", 0x80, 0x0A), 0x2F: ("$28C8C0", "BGM", 0x80, 0x0A),
    0x30: ("$28C8DA", "BGM", 0xDC, 0x0A), 0x31: ("$28C8F4", "BGM", 0x80, 0x0A),
    0x32: ("$28C90E", "BGM", 0x80, 0x0A), 0x33: ("$28C928", "BGM", 0x80, 0x0A),
    0x34: ("$28C942", "BGM", 0x80, 0x0A), 0x35: ("$28C95C", "BGM", 0x80, 0x0A),
    0x36: ("$28C976", "BGM", 0x80, 0x0A), 0x37: ("$28C990", "BGM", 0x80, 0x0A),
    0x38: ("$28C9AA", "BGM", 0x80, 0x0A), 0x39: ("$28C9C4", "BGM", 0x80, 0x0A),
    0x3A: ("$28C9DE", "BGM", 0x80, 0x0A), 0x3B: ("$28C9F8", "BGM", 0xFF, 0x14),
    0x3C: ("$28CA12", "BGM", 0xFF, 0x14), 0x3F: ("$28CA60", "BGM", 0xFF, 0x14),
    0x40: ("$28CA7A", "BGM", 0xFF, 0x14),
}
print("\n=== FIRING ids -> wrapper ===")
firing_ids = set()
for (typ, cid), n in sorted(seen.items()):
    firing_ids.add((typ, cid))
    w = ID2WRAP.get(cid, ("??", "?", 0, 0))
    print(f"  type=${typ:X} id=${cid:02X} {n}x  -> wrapper {w[0]} ({w[1]})")
print(f"\nfiring (type,id) pairs: {len(firing_ids)}")
