#!/usr/bin/env python3
"""Driver for queue.lua -- who fills $0700 and why the streamer skips frames.

    python games/gradius/tools/oracle/queue.py --frames 700 \
        --script "200:,10:S,490:" --from 560 --to 600

    python games/gradius/tools/oracle/queue.py --frames 700 \
        --script "200:,10:S,490:" --neuter starve      # the negative control
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

KIND = {1: "GATE", 2: "BUILD", 3: "DRAIN", 4: "$85E8", 5: "$85F3",
        6: "$863D", 7: "$8641", 8: "$8645", 9: "$8647", 10: "E<-",
        11: "HUD?", 12: "HUD!"}


def run(frames, script, lo, hi, neuter, tag):
    OUT.mkdir(exist_ok=True)
    jf = OUT / f"queue-{tag}.json"
    if jf.exists():
        jf.unlink()
    env = {
        "Q_FRAMES": str(frames), "Q_SCRIPT": script, "Q_JSON": str(jf),
        "Q_FROM": str(lo), "Q_TO": str(hi), "Q_NEUTER": neuter,
    }
    r = mesen.run_script(HERE / "queue.lua", env_extra=env, timeout_s=180)
    if "END" not in r.lines:
        print("\n".join(r.lines[-20:]))
        print("\n".join(r.log[-20:]))
        raise SystemExit(f"probe did not finish (rc={r.returncode})")
    if not jf.exists():
        raise SystemExit(f"no JSON at {jf}")
    return json.loads(jf.read_text())


# ------------------------------------------------------------------ packets --
# The canned-packet producer, decoded straight out of the PRG so it can be
# compared against the $0E deltas the cartridge actually produced.
#
#   $85E8  PHA / LDA #$02 / STA $9B / LDA #$01 / JSR $8645 / PLA
#          -- appends ONE byte, the queue mode $01 (PPU increment 1), then
#          FALLS THROUGH into $85F3. It is a PROLOGUE, not a routine, and
#          $85F1 is the third byte of its `JSR $8645` (the return address that
#          JSR pushes), not an instruction boundary at all.
#   $85F3  STA $9A / ASL A / TAX / pointer := $864E,X  (39-entry word table)
#          then copy bytes until a control code:
#            $FF  end, append nothing
#            $FE  append $FF (packet terminator) and end
#            $FD  append $FF, reset $9B=2, append $01 (new mode byte), continue
#          and, when bit 7 of the INDEX is set, everything after the first two
#          copied bytes is replaced by $00 -- the "erase this text" variant.
PKT_TABLE = 0x864E


def rom_bytes():
    p = mesen.DEFAULT_ROM
    b = p.read_bytes()
    assert b[:4] == b"NES\x1a", "not an iNES image"
    return b[16:16 + 32768]          # 32 KB PRG at $8000


def canned(prg, idx, prologue=True):
    def rd(a):
        return prg[a - 0x8000]
    out = [0x01] if prologue else []
    # $85F5 ASL A / TAX -- the index is doubled with the 8-bit ASL, so bit 7
    # of the index is LOST from the table lookup and only survives in $9A.
    x = (idx << 1) & 0xFF
    ptr = rd(PKT_TABLE + x) | (rd(PKT_TABLE + x + 1) << 8)
    blank = (idx & 0x80) != 0
    nine_b = 2
    p = ptr
    while True:
        b = rd(p)
        p += 1
        if b == 0xFF:
            break
        if b == 0xFE:
            out.append(0xFF)
            break
        if b == 0xFD:
            out.append(0xFF)
            nine_b = 2
            out.append(0x01)
            continue
        if blank:
            if nine_b:
                nine_b -= 1
                out.append(b)
            else:
                out.append(0x00)
        else:
            out.append(b)
    return out, ptr


def packets_report(d):
    prg = rom_bytes()
    # measured: $0E immediately before and after each producer entry
    ev = d["events"]
    seq = {}
    for f, k, x, y, z in ev:
        seq.setdefault(f, []).append((k, x, y, z))
    measured = {}
    for f, s in seq.items():
        for i, (k, a, e, _z) in enumerate(s):
            if k not in (4, 5):
                continue
            # the next $0E write after this entry is the one this producer made
            for k2, x2, y2, z2 in s[i + 1:]:
                if k2 == 10 and ((z2 << 8) | y2) in (0x864D,):
                    measured.setdefault((KIND[k], a), set()).add(x2 - e)
                    break
                if k2 in (4, 5, 6, 7):
                    break
    print("\ncanned packets: ROM decode vs measured $0E delta")
    print("  idx  ptr    decoded bytes                                    len  measured")
    bad = 0
    for (kk, idx) in sorted(measured):
        if kk != "$85F3":
            continue
        # $85F3 is entered either on its own (mode byte already in the queue)
        # or by falling through $85E8; the delta measured here is $85F3's own.
        out, ptr = canned(prg, idx, prologue=False)
        hexs = " ".join(f"{b:02X}" for b in out)
        m = sorted(measured[(kk, idx)])
        ok = m == [len(out)]
        if not ok:
            bad += 1
        print(f"  ${idx:02X}  ${ptr:04X}  {hexs:<48} {len(out):>3}  {m}"
              f"  {'' if ok else '  <-- MISMATCH'}")
    print(f"[{'PASS' if bad == 0 else 'FAIL'}] "
          f"$864E decode length == measured $0E delta for every packet "
          f"({len(measured)} producer/index pairs, {bad} wrong)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=700)
    ap.add_argument("--script", default="200:,10:S,490:")
    ap.add_argument("--from", dest="lo", type=int, default=560)
    ap.add_argument("--to", dest="hi", type=int, default=600)
    ap.add_argument("--neuter", default="")
    ap.add_argument("--tag", default=None)
    ap.add_argument("--timeline", action="store_true")
    ap.add_argument("--packets", action="store_true")
    a = ap.parse_args()
    tag = a.tag or (a.neuter or "base")

    d = run(a.frames, a.script, a.lo, a.hi, a.neuter, tag)
    print(f"gameFrames={d['gameFrames']} guardViolations={d['guardViolations']} "
          f"gateCalls={d['gateCalls']} buildCalls={d['buildCalls']} "
          f"starvePokes={d['starvePokes']} neuter={d['neuter']!r}")
    print(f"$8898 entered={d['hudCalls']}  passed both gates={d['hudRan']}  "
          f"(on $02 even={d['hudRanOnEvenFrameCounter']}, "
          f"odd={d['hudRanOnOddFrameCounter']})")

    print("\n$000E write census (PC reported AFTER the storing instruction):")
    for pc, n in sorted(d["eWriteCensus"].items(), key=lambda kv: -kv[1]):
        print(f"  ${pc}  {n}")

    FF = d["frameFields"]
    idx = {k: i for i, k in enumerate(FF)}
    fr = d["frames"]

    # ---- the headline: how often does $58 actually advance, in mode 5?
    play = [r for r in fr if r[idx["mode"]] == 5 and r[idx["sub"]] >= 0x80]
    adv = 0
    for p, q in zip(play, play[1:]):
        if p[idx["prog"]] != q[idx["prog"]] or p[idx["buildLo"]] != q[idx["buildLo"]]:
            adv += 1
    print(f"\nmode-5 played frames = {len(play)}; frames where $58/$54 changed "
          f"= {adv}  ({adv / max(1, len(play) - 1):.3f} per frame)")

    builds = Counter()
    for r in fr:
        builds[r[idx["buildCalls"]]] += 1
    print(f"builds per frame histogram (all {len(fr)} frames): {dict(sorted(builds.items()))}")
    pbuilds = Counter(r[idx["buildCalls"]] for r in play)
    print(f"builds per frame histogram (mode-5 played): {dict(sorted(pbuilds.items()))}")

    # ---- $0E as seen by the GATE, split by whether the frame built
    ev = d["events"]
    per = {}
    for f, k, x, y, z in ev:
        per.setdefault(f, []).append((k, x, y, z))
    egate_built, egate_not = Counter(), Counter()
    for f, seq in per.items():
        gates = [e for e in seq if e[0] == 1]
        built = any(e[0] == 2 for e in seq)
        for g in gates:
            (egate_built if built else egate_not)[g[1]] += 1
    print(f"\n$0E at $9D83 on frames that BUILT     : {dict(sorted(egate_built.items()))}")
    print(f"$0E at $9D83 on frames that did NOT   : {dict(sorted(egate_not.items()))}")

    # ---- which producer put the bytes there
    prod = Counter()
    for f, k, x, y, z in ev:
        if k in (4, 5, 6, 7):
            prod[(KIND[k], x)] += 1
    print("\nproducer entries in the logged window  (kind, A = packet index):")
    for (kk, ix), n in sorted(prod.items()):
        print(f"  {kk} idx=${ix:02X}  {n}")

    if a.packets:
        packets_report(d)

    if a.timeline:
        print("\ntimeline:")
        for f in sorted(per):
            parts = []
            for k, x, y, z in per[f]:
                if k == 10:
                    parts.append(f"E<-{x}@${(z << 8) | y:04X}")
                elif k in (4, 5, 6, 7, 8, 9):
                    parts.append(f"{KIND[k]}(A=${x:02X},E={y})")
                elif k == 1:
                    parts.append(f"GATE(E={x},3A={y},58=${z:02X})")
                elif k == 2:
                    parts.append(f"BUILD(E={x},58=${y:02X},57={z})")
                elif k == 3:
                    parts.append(f"DRAIN(E={x})")
            print(f"  f{f}: " + " ".join(parts))


if __name__ == "__main__":
    main()
