#!/usr/bin/env python3
"""C1 RECON: find every static reference (read or write) to the three sound
enable gates $80380A / $80392A / $803926, and to the master-vol $81DEB4 and the
ring ptrs $81DEAE/$81DEB0.  Prints site + the surrounding instruction via
unidasm so the read/write kind and the dual-role of $803926 are visible."""
import subprocess
import struct
from pathlib import Path

IMG = Path(__file__).resolve().parent / "out" / "maincpu.bin"
d = IMG.read_bytes()
N = len(d)

GATES = {
    0x80380A: "gate A (byte, sound enable)",
    0x80392A: "gate B (word, sound enable)",
    0x803926: "gate C (word, DUAL: sound gate + midboss column)",
    0x81DEB4: "master volume (add.w tail)",
    0x81DEAE: "ring READ ptr (-4 stride, wrap $18C)",
    0x81DEB0: "ring WRITE ptr (wrap $190)",
    0x81DD1E: "ring BUFFER base (100 longwords)",
    0x81DEB6: "SFX-debounce $28C5E4 (set 2)",
    0x81DEB8: "SFX-debounce $28C714 (set 3)",
    0x81DD18: "drain state $28C19A",
    0x81DD1A: "drain state $28C19A",
}

# search for the 4-byte absolute-long address pattern anywhere (reads + writes)
for addr, label in GATES.items():
    pat = struct.pack(">I", addr)
    hits = []
    i = 0
    while True:
        i = d.find(pat, i)
        if i < 0:
            break
        hits.append(i)
        i += 1
    print(f"\n=== ${addr:06X}  {label}  ({len(hits)} ref(s)) ===")
    # disasm a small window around each hit so the instruction is visible
    for h in hits[:40]:
        # disasm 10 bytes starting a little before the hit
        start = max(0, h - 4)
        r = subprocess.run(["python", "xref.py", "dasm", hex(start), "14"],
                           capture_output=True, text=True,
                           cwd=str(Path(__file__).resolve().parent))
        # find the line whose hex addr is closest to h
        line = ""
        for ln in r.stdout.splitlines():
            parts = ln.split(":")
            try:
                a = int(parts[0], 16)
            except Exception:
                continue
            if a <= h:
                line = ln
            else:
                break
        print(f"    site ${h:06X}  -> {line.strip()}")
