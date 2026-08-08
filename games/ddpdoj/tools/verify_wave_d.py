#!/usr/bin/env python3
"""
Wave D premise verifier.

Derives the "tight union" of stage-1 sample data straight from keyon.tsv
(the C4 sample-inventory aid) and checks it against the W135 architect claims:

  * 28 disjoint byte intervals
  * 1,538,920 bytes raw
  * 100% of the 1501 valid keyons covered
  * 0 bytes from pgm_m01s.rom (everything lives in u17 @0x400000)

Address decode (frame.lua:131-133):
    addr = (saddr<<20) | ((acc>>12) & 0xfffff)   # masked to 24 bits
keyon.tsv's `start`/`end` columns are the DECODED 24-bit addresses (sb/eb);
`len` == end - start confirms a half-open byte interval [start, end).

u17 (cave_m04401b032.u17) is mapped at 0x400000 in the ICS 24-bit sample
space (4 MiB window 0x400000-0x7FFFFF). u17 file offset = start - 0x400000.
pgm_m01s.rom is @0x000000 (0x000000-0x1FFFFF).

Read-only. No files written.
"""
import sys, os, gzip

KEYON = os.path.join(os.path.dirname(__file__), "..", "rip", "sound", "keyon.tsv")
U17   = os.path.join(os.path.dirname(__file__), "..", "rip", "rom", "cave_m04401b032.u17")
M01S  = os.path.join(os.path.dirname(__file__), "..", "rip", "rom", "pgm_m01s.rom")

U17_BASE = 0x400000          # u17 base in ICS 24-bit address space
U17_END  = 0x400000 + 0x400000  # 0x800000 (4 MiB)
M01S_END = 0x200000          # pgm_m01s.rom is 2 MiB


def load_keyons(path):
    rows = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        idx = {name: i for i, name in enumerate(header)}
        for line in f:
            if not line.strip():
                continue
            c = line.rstrip("\n").split("\t")
            rows.append({
                "n":      int(c[idx["n"]]),
                "voice":  int(c[idx["voice"]]),
                "fmt":    c[idx["fmt"]],
                "start":  int(c[idx["start"]], 16),
                "end":    int(c[idx["end"]], 16),
                "len":    int(c[idx["len"]]),
                "saddr":  int(c[idx["saddr"]], 16),
            })
    return rows


def merge_intervals(intervals):
    """intervals: list of (start, end) half-open. Returns merged disjoint list."""
    if not intervals:
        return []
    s = sorted(intervals)
    merged = [list(s[0])]
    for lo, hi in s[1:]:
        if lo <= merged[-1][1]:  # overlap or touch -> extend
            if hi > merged[-1][1]:
                merged[-1][1] = hi
        else:
            merged.append([lo, hi])
    return [(lo, hi) for lo, hi in merged]


def main():
    rows = load_keyons(KEYON)
    total = len(rows)
    print(f"keyon.tsv rows: {total}")

    valid = [r for r in rows if r["end"] > r["start"]]
    invalid = [r for r in rows if r["end"] <= r["start"]]
    print(f"valid (end>start): {len(valid)}   invalid (end<=start): {len(invalid)}")
    # Architect premise 3: 119 invalid events across 17 distinct triples.
    distinct_inv = {(r["start"], r["end"], r["saddr"]) for r in invalid}
    print(f"  invalid distinct (start,end,saddr) triples: {len(distinct_inv)}")

    # Sanity: len == end - start for valid rows.
    bad_len = [r for r in valid if r["len"] != r["end"] - r["start"]]
    assert not bad_len, f"{len(bad_len)} rows where len != end-start"
    print(f"  all valid rows: len == end-start (OK)")

    # Which ROM does each valid keyon live in?
    in_u17 = [r for r in valid if U17_BASE <= r["start"] and r["end"] <= U17_END]
    in_m01s = [r for r in valid if r["start"] < M01S_END]
    other = [r for r in valid if r not in in_u17 and r not in in_m01s]
    print(f"valid keyons fully inside u17 window: {len(in_u17)}")
    print(f"valid keyons touching m01s window  : {len(in_m01s)}")
    print(f"valid keyons in neither window      : {len(other)}")
    assert len(in_u17) == len(valid), "some valid keyons are NOT in u17!"
    assert len(in_m01s) == 0, "premise breach: a keyon needs pgm_m01s.rom"

    # Build the tight union as u17 file-offset intervals [start-0x400000, end-0x400000).
    intervals = [(r["start"] - U17_BASE, r["end"] - U17_BASE) for r in valid]
    merged = merge_intervals(intervals)
    raw = sum(hi - lo for lo, hi in merged)
    print()
    print(f"TIGHT UNION (u17 file offsets):")
    print(f"  fragments: {len(merged)}   (architect claim: 28)")
    print(f"  raw bytes: {raw:,}   (architect claim: 1,538,920)")
    print(f"  span      : 0x{merged[0][0]:06X} .. 0x{merged[-1][1]:06X}")

    # Coverage check: every valid keyon's [start,end) must be a subset of the union.
    mset = merged
    def covered(lo, hi):
        for mlo, mhi in mset:
            if mlo <= lo and hi <= mhi:
                return True
        return False
    uncovered = [r for r in valid if not covered(r["start"] - U17_BASE, r["end"] - U17_BASE)]
    assert not uncovered, f"{len(uncovered)} valid keyons NOT covered by the union!"
    print(f"  coverage  : 100% of {len(valid)} valid keyons (OK)")

    # Print the 28 fragments (u17 file offsets, half-open).
    print()
    print("THE 28 FRAGMENTS (u17 file offset, half-open [lo, hi)):")
    for i, (lo, hi) in enumerate(merged, 1):
        gap_prev = "" if i == 1 else f"  (gap {lo - merged[i-2][1]:,} from prev)"
        print(f"  {i:2d}. 0x{lo:06X}..0x{hi:06X}  len={hi-lo:>8,}{gap_prev}")

    # Verify against the real u17 file: extract, gzip, measure.
    print()
    sz = os.path.getsize(U17)
    print(f"u17 file size: {sz:,} bytes ({sz/1024/1024:.2f} MiB)")
    assert sz == 0x400000, "u17 is not exactly 4 MiB"
    with open(U17, "rb") as f:
        data = f.read()
    stitched = bytearray()
    for lo, hi in merged:
        stitched += data[lo:hi]
    assert len(stitched) == raw
    print(f"stitched raw size: {len(stitched):,}")
    gz = gzip.compress(bytes(stitched), 9)
    print(f"stitched gzip -9 : {len(gz):,}  ({len(gz)/1024/1024:.2f} MiB)")
    print(f"  architect claim gzip: 1,156,232")

    # MUST-FAIL preview: if fragment k is removed, how many keyons go red?
    print()
    print("MUST-FAIL preview (remove one fragment at a time):")
    for k in range(len(merged)):
        reduced = merged[:k] + merged[k+1:]
        red = 0
        for r in valid:
            lo, hi = r["start"] - U17_BASE, r["end"] - U17_BASE
            ok = any(mlo <= lo and hi <= mhi for mlo, mhi in reduced)
            if not ok:
                red += 1
        print(f"  drop frag {k+1:2d} (0x{merged[k][0]:06X}..0x{merged[k][1]:06X}, "
              f"{merged[k][1]-merged[k][0]:,} B) -> {red} keyons red")
    print()
    print("PREMISE VERDICT:")
    ok28 = len(merged) == 28
    okraw = raw == 1538920
    print(f"  28 fragments : {'PASS' if ok28 else 'FAIL'}")
    print(f"  1,538,920 raw: {'PASS' if okraw else 'FAIL'}")


if __name__ == "__main__":
    main()
