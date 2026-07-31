#!/usr/bin/env python3
"""Re-derive the frame landmarks, PER BUILD, from the decrypted 68000 image.

WHY THIS IS A TOOL AND NOT A TABLE OF NUMBERS
---------------------------------------------
`ddpdojblk`'s 2 MiB program ROM holds TWO COMPLETE GAMES. The boot chooser's
"1: VERSION-A (OLD)" runs from $13xxxx and "2: VERSION-B (NEW)" from $23xxxx,
and they are relayouts, not a mirror -- the per-call deltas run from +0xFFC5C to
+0x100C94, so no constant offset exists and no address may be translated by
adding 0x100000. Every landmark in the wave-0 recons except the ones in
`00-recon-hard.md` §9 is a VERSION-A address.

So this file re-derives the landmark set from the image, for BOTH builds, by
byte-pattern search over 68000 encodings plus unidasm confirmation. The output
is `landmarks.json`, which the probe and the worklog both read. Re-run it and
you get the evidence again; nothing here is quoted from another document.

WHAT THE SEARCH CAN AND CANNOT SEE (state it every time this is quoted):
  CAN     absolute-long operands: addq.w #1,$80390a.l / tst.b $803940.l
  CANNOT  (d16,An), (An)+, (d8,An,Xn) -- anything through a base register.
So "N sites" is a lower bound and a clean result is "no absolute-long site",
never "nothing does this".

The image itself is ROM-derived and lands in out/ (gitignored). landmarks.json
holds ADDRESSES ONLY -- the same class of fact as every address in
NOTES-machine.md -- and is committed.

Usage:
  python derive.py                 # dump a fresh image if needed, derive, write
  python derive.py --show          # print the derivation evidence, do not write
"""
from __future__ import annotations

import argparse
import json
import struct
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pgm  # noqa: E402

HERE = Path(__file__).resolve().parent
IMAGE = HERE / "out" / "maincpu.bin"
LANDMARKS = HERE / "landmarks.json"

# --- RAM addresses. These are BUILD-INDEPENDENT: 00-recon-hard.md measured that
# the two builds share the RAM layout, and this file re-confirms it by finding
# the same byte patterns twice, once in each build's address range.
SEM = 0x803940      # the vblank semaphore -- THE SAMPLE POINT
CTR = 0x80390A      # free-running frame counter, ++ per MAIN LOOP ITERATION
PHASE3 = 0x80390E   # mod-3 phase, read back BY the frame sync itself
P1RAW = 0x803970    # P1 input mirror
INPORT = 0xC08000   # the hardware input port

BUILDS = {"A": (0x100000, 0x200000), "B": (0x200000, 0x300000)}


def dasm(pc: int, count: int = 12) -> list[str]:
    """unidasm over the decrypted image. `-basepc` makes the listing's addresses
    real 68000 addresses: the image is loaded at 0 and :maincpu offset == 68000
    address on this driver (BIOS at $000000, program at $100000)."""
    exe = pgm.mame_home() / "unidasm.exe"
    r = subprocess.run(
        [str(exe), str(IMAGE), "-arch", "m68000",
         "-basepc", hex(pc), "-skip", hex(pc), "-count", str(count)],
        capture_output=True, text=True)
    return [ln.rstrip() for ln in r.stdout.splitlines() if ln.strip()]


def find(data: bytes, pat: bytes) -> list[int]:
    out, i = [], 0
    while True:
        i = data.find(pat, i)
        if i < 0:
            return out
        out.append(i)
        i += 1


def be32(v: int) -> bytes:
    return struct.pack(">I", v)


def in_build(addr: int, b: str) -> bool:
    lo, hi = BUILDS[b]
    return lo <= addr < hi


def ensure_image(force: bool = False) -> None:
    if IMAGE.exists() and not force:
        return
    IMAGE.parent.mkdir(parents=True, exist_ok=True)
    r = pgm.run(HERE / "dumpcpu.lua", seconds=30,
                env={"PGM_DUMP": str(IMAGE), "PGM_DUMP_AT": "400"})
    for ln in r.lines:
        print("  " + ln)
    if not IMAGE.exists():
        raise SystemExit("dumpcpu.lua produced no image\n" + r.stdout[-3000:])


def derive(data: bytes, build: str, verbose: bool) -> dict:
    lo, hi = BUILDS[build]
    ev: list[str] = []

    def note(s: str) -> None:
        ev.append(s)
        if verbose:
            print("   " + s)

    # 1. THE COUNTER ROUTINE.  `addq.w #1,$80390a.l` = 5279 + long.
    #    00-recon-hard.md §4: $80390A/$80390D/$80390E are bumped INSIDE the main
    #    loop body, not by an interrupt -- that is the coupling that makes
    #    slowdown a state change rather than a pace change, so the routine that
    #    does it is the anchor for everything else.
    ctr_sites = [a for a in find(data, b"\x52\x79" + be32(CTR)) if in_build(a, build)]
    if len(ctr_sites) != 1:
        raise SystemExit(f"build {build}: expected 1 `addq.w #1,${CTR:06X}.l`, "
                         f"got {[hex(a) for a in ctr_sites]}")
    counters = ctr_sites[0]
    note(f"counters routine  ${counters:06X}  (unique `addq.w #1,${CTR:06X}.l` in build {build})")

    # 2. THE MAIN LOOP.  Whoever `jsr`s the counter routine is the loop head.
    callers = [a for a in find(data, b"\x4e\xb9" + be32(counters)) if in_build(a, build)]
    if len(callers) != 1:
        raise SystemExit(f"build {build}: counters routine has {len(callers)} "
                         f"callers {[hex(a) for a in callers]}, expected exactly 1")
    loop_head = callers[0]
    note(f"main loop head    ${loop_head:06X}  (its ONLY caller in the whole image)")

    # 3. THE SEVEN CALLS + the `bra` back.  Walk the fixed 6-byte `jsr abs.l`
    #    encoding from the loop head; the loop ends at the first word that is
    #    not 4EB9.
    calls, a = [], loop_head
    while data[a:a + 2] == b"\x4e\xb9":
        calls.append(struct.unpack(">I", data[a + 2:a + 6])[0])
        a += 6
    tail = a
    tail_op = struct.unpack(">H", data[tail:tail + 2])[0]
    if (tail_op & 0xFF00) != 0x6000:                  # bra.s
        raise SystemExit(f"build {build}: loop tail at ${tail:06X} is {tail_op:04X}, not a bra")
    disp = tail_op & 0xFF
    if disp >= 0x80:
        disp -= 0x100
    target = tail + 2 + disp
    if target != loop_head:
        raise SystemExit(f"build {build}: loop tail branches to ${target:06X}, "
                         f"not back to the head ${loop_head:06X}")
    note(f"loop tail         ${tail:06X}  bra -> ${target:06X}  ({len(calls)} calls in the body)")
    for i, c in enumerate(calls):
        note(f"  call {i}          ${c:06X}")

    # 4. EVERY absolute-long WRITE to the semaphore, classified by the opcode in
    #    front of the operand rather than by one assumed encoding.  This matters:
    #    the recons only ever searched `move.b #imm,$803940.l` (13FC), and build
    #    B arms through a REGISTER as well (`moveq #2,D0 / move.b D0,$803940.l`
    #    at $23C388/$23C38A), which that pattern cannot see.  Classifying by
    #    opcode found it; a fixed pattern would have reported build B as having
    #    one fewer divider path than it has.
    sem_sites: dict[int, list[int]] = {}      # armed value (or -1) -> [pc...]
    arm_all: list[tuple[int, int, str]] = []
    # `move.b #imm,$803940.l` is [13FC][imm16][addr32]: the 4-byte operand sits
    # 4 bytes past the opcode word, so the instruction starts at operand-4.
    for a in find(data, be32(SEM)):
        pc = a - 4
        if pc < lo or pc >= hi:
            continue
        if data[pc:pc + 2] == b"\x13\xfc":
            imm = struct.unpack(">H", data[pc + 2:pc + 4])[0] & 0xFF
            arm_all.append((pc, imm, f"move.b #${imm:X}"))
    for reg in range(8):                                    # move.b Dn,abs.l
        for a in find(data, bytes([0x13, 0xC0 | reg]) + be32(SEM)):
            if in_build(a, build):
                arm_all.append((a, -1, f"move.b D{reg}"))
    for a in find(data, b"\x42\x39" + be32(SEM)):           # clr.b abs.l
        if in_build(a, build):
            arm_all.append((a, 0, "clr.b"))
    arm_all.sort()
    for a, v, how in arm_all:
        note(f"semaphore write   ${a:06X}  {how},${SEM:06X}"
             + (f"   -> waits {v} vblank(s)" if v > 0 else ""))
        sem_sites.setdefault(v, []).append(a)
    arm1 = sem_sites.get(1, [])
    arm2 = sem_sites.get(2, [])
    sync = None
    for c in calls:
        if any(c <= a < c + 0x200 for a in arm1):
            sync = c
    if sync is None:
        raise SystemExit(f"build {build}: no main-loop call arms ${SEM:06X}")
    note(f"frame sync        ${sync:06X}  (main-loop call #{calls.index(sync)}; arms ${SEM:06X})")

    # 5. THE WAIT LOOPS.  `tst.b $803940.l` = 4A39 + long, immediately followed
    #    by `bne` back to itself (66 F8: -8, over the 8-byte tst).
    #
    #    CORRECTION TO THE RECONS, measured here: there is not ONE wait loop,
    #    there are THREE self-branching ones per build, each preceded by its own
    #    arm.  00-recon-oracle.md §"could not do" item 4 flagged exactly this
    #    ("there are three other wait sites in the same routine; I have not shown
    #    they are never used") and named the ARM addresses; these are the
    #    matching SPIN addresses.  Which one the game actually spins in is a
    #    measurement, not a derivation -- `pgm.py meter` reads it off the
    #    interrupted-PC histogram -- so all three are recorded and none is
    #    privileged here.
    tst = [a for a in find(data, b"\x4a\x39" + be32(SEM)) if in_build(a, build)]
    note(f"tst.b ${SEM:06X} sites: {[f'${a:06X}' for a in tst]}")
    waits = [a for a in tst if data[a + 6:a + 8] == b"\x66\xf8"]
    if not waits:
        raise SystemExit(f"build {build}: no self-branching wait loop on ${SEM:06X}")
    for w in waits:
        armed = "arm #1" if (w - 8) in arm1 else "arm #2" if (w - 8) in arm2 else "no arm at -8"
        note(f"wait loop         ${w:06X} (tst.b) / ${w + 6:06X} (bne -8)   [{armed}]")
    # Which spin the FRAME SYNC reaches: it arms, tests the mod-3 phase, and
    # branches INTO the middle of a wait routine rather than falling through
    # (that is why the recons' "$13C6AC arms with 2" head is never executed on
    # the common path). Find the branch out of the sync whose target is a wait.
    primary = None
    for off in range(sync, sync + 0x40, 2):
        op = struct.unpack(">H", data[off:off + 2])[0]
        if op in (0x6600, 0x6700, 0x6000):            # bne/beq/bra .w
            d = struct.unpack(">h", data[off + 2:off + 4])[0]
            t = off + 2 + d
            if t in waits:
                primary = t
                note(f"frame sync branches to a wait: ${off:06X} -> ${t:06X}")
    if primary is None:
        primary = waits[0]
        note(f"frame sync has no direct branch to a wait; defaulting primary to ${primary:06X}")

    # 6. THE ISR RELEASE.  `subq.b #1,$803940.l` = 5339 + long.
    rel = [a for a in find(data, b"\x53\x39" + be32(SEM)) if in_build(a, build)]
    if len(rel) != 1:
        raise SystemExit(f"build {build}: {len(rel)} `subq.b #1,${SEM:06X}.l` sites")
    release = rel[0]
    note(f"ISR6 release      ${release:06X}  (subq.b #1,${SEM:06X})")

    # 7. THE (A) GATE inside IRQ6.  00-recon-oracle.md measured it on build A:
    #    `tst.b $803940 / beq <past four jsrs>` -- four ISR subroutines skipped
    #    when the main loop overran, WHILE THE INPUT READ STILL RUNS. It is the
    #    same shape as Batman's $C757 and it means a dropped frame is not
    #    uniform. Find it as the tst.b site that is followed by a beq whose
    #    target is at or just past the release.
    gate = None
    for a in tst:
        op = struct.unpack(">H", data[a + 6:a + 8])[0]
        if (op & 0xFF00) == 0x6700:                    # beq.s
            d = op & 0xFF
            if d >= 0x80:
                d -= 0x100
            t = a + 8 + d
            if a < release < t:
                gate = (a, t)
    if gate is None:
        raise SystemExit(f"build {build}: no `tst.b ${SEM:06X} / beq` skipping the release")
    note(f"IRQ6 (A) gate     ${gate[0]:06X}  beq -> ${gate[1]:06X}  "
         f"(skips everything up to and including the release at ${release:06X})")
    # WHAT the gate skips, enumerated: the (A) half of this game's lag behaviour
    # is exactly "these N subroutines do not run on an overrun frame, while the
    # input read before the gate still does". A port that drops a frame
    # uniformly is wrong here (docs/knowledge/06; same shape as Batman's $C757).
    gate_skips = []
    q = gate[0] + 8
    while q < gate[1]:
        if data[q:q + 2] == b"\x4e\xb9":
            gate_skips.append(struct.unpack(">I", data[q + 2:q + 6])[0])
            q += 6
        else:
            q += 2
    note(f"  gated subroutines: {[f'${c:06X}' for c in gate_skips]}")

    # 8. THE INPUT READ.  `lea $C08000,A0` = 41F9 + long, and the mirror store
    #    `move.w D0,$803970.l` = 33C0 + long.
    lea = [a for a in find(data, b"\x41\xf9" + be32(INPORT)) if in_build(a, build)]
    mir = [a for a in find(data, b"\x33\xc0" + be32(P1RAW)) if in_build(a, build)]
    note(f"input port lea    {[f'${a:06X}' for a in lea]}   "
         f"P1 mirror store {[f'${a:06X}' for a in mir]}")

    # 9. THE 2-VBLANK DIVIDER.  The frame sync reads the mod-3 phase back
    #    (`tst.w $80390e.l` = 4A79 + long) and can branch to the head that arms
    #    with 2 -- a scheduled 29.6 Hz cadence that is NOT slowdown and will
    #    masquerade as it to anything that only counts frames.
    ph = [a for a in find(data, b"\x4a\x79" + be32(PHASE3)) if in_build(a, build)]
    note(f"tst.w ${PHASE3:06X} (mod-3 phase read-back) sites: {[f'${a:06X}' for a in ph]}")

    return {
        "counters": counters, "loopHead": loop_head, "loopTail": tail,
        "calls": calls, "frameSync": sync,
        "waitLoops": waits, "waitLoop": primary, "waitBne": primary + 6,
        "isr6Release": release, "isr6Gate": gate[0], "isr6GateTarget": gate[1],
        "isr6GateSkips": gate_skips,
        "semaphoreWrites": [{"pc": a, "value": v, "how": how} for a, v, how in arm_all],
        "armSites1": arm1, "armSites2": arm2,
        "inputLea": lea, "p1MirrorStore": mir, "phaseReads": ph,
        "evidence": ev,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true", help="print evidence, do not write")
    ap.add_argument("--force-dump", action="store_true")
    a = ap.parse_args()

    ensure_image(a.force_dump)
    data = IMAGE.read_bytes()
    import hashlib
    print(f"# image={IMAGE} size={len(data)} sha256={hashlib.sha256(data).hexdigest()}")

    doc = {
        "_note": "ADDRESSES ONLY, derived by games/ddpdoj/tools/oracle/derive.py "
                 "from the DECRYPTED :maincpu region of ddpdojblk. Two builds live "
                 "in this ROM and share no code address; A = $13xxxx (2002.04.05 "
                 "MASTER, the chooser's silent default), B = $23xxxx (2002.10.07 "
                 "BLACK VER, the port target). Re-derive with derive.py; do not "
                 "hand-edit.",
        "set": pgm.DEFAULT_SET,
        "ram": {"semaphore": SEM, "frameCounter": CTR, "phase3": PHASE3,
                "p1raw": P1RAW, "p1edge": 0x803972, "p1prev": 0x803974,
                "irq4Vector": 0x801470, "irq6Vector": 0x801478,
                "irq4Phase": 0x80FA84, "spriteList": [0x800000, 0x8009FF]},
        "bios": {"irq4Trampoline": 0x000CA6, "irq6Trampoline": 0x000CBE},
        "builds": {},
    }
    for b in ("A", "B"):
        print(f"\n=== build {b}  (${BUILDS[b][0]:06X}-${BUILDS[b][1] - 1:06X}) ===")
        doc["builds"][b] = derive(data, b, True)

    if not a.show:
        LANDMARKS.write_text(json.dumps(doc, indent=2), encoding="utf8")
        print(f"\nwrote {LANDMARKS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
