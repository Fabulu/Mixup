#!/usr/bin/env python3
"""Static VERSION-B inventory for W164's complete player-death lifecycle.

The checker covers the two contiguous state routines, every direct callee used
by the port, every local control-flow edge, and every ROM table consumed by the
translation. ``--break-opcode`` is an in-memory RED control; it never modifies
the decrypted image.
"""
from __future__ import annotations

import hashlib
import os
import re
import struct
import sys
from pathlib import Path

IMAGE = Path(__file__).resolve().parent / "out" / "maincpu.bin"
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]


def require(data: bytes, at: int, expected: str, why: str) -> None:
    want = bytes.fromhex(expected)
    got = data[at:at + len(want)]
    if got != want:
        raise AssertionError(f"${at:06X} {why}: {got.hex()} != {want.hex()}")


def absolute_edges(data: bytes, target: int) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for opcode, name in ((b"\x4e\xb9", "jsr"), (b"\x4e\xf9", "jmp")):
        needle = opcode + struct.pack(">I", target)
        start = 0
        while True:
            at = data.find(needle, start)
            if at < 0:
                break
            if at % 2 == 0:
                out.append((at, name))
            start = at + 1
    return sorted(out)


CALLERS = {
    0x261116: [(0x249F8A, "jsr"), (0x25FFBE, "jsr")],
    0x2532EA: [(0x2498D8, "jsr"), (0x249A28, "jsr"),
               (0x249F96, "jsr")],
    0x28C3A0: [(0x249F9C, "jsr")],
    0x252714: [(0x249ABE, "jsr"), (0x249FB2, "jsr")],
    0x25275C: [(0x249AD2, "jsr"), (0x24A056, "jsr")],
    0x27F898: [(0x249FCE, "jsr")],
    0x27F8AE: [(0x24A072, "jsr")],
    0x287B9A: [(0x249FD4, "jsr")],
    0x287BB6: [(0x24A078, "jsr")],
    0x285AF2: [(0x249970, "jsr"), (0x24A000, "jsr"),
               (0x29020A, "jsr")],
    0x285C1C: [(0x2499C0, "jsr"), (0x24A0A4, "jsr"),
               (0x290220, "jsr")],
    0x25392E: [(0x24A030, "jsr")],
    0x253968: [(0x24A0D4, "jsr")],
    0x2531DE: [(0x24A03E, "jsr")],
    0x2531FE: [(0x24A0E2, "jsr")],
    0x27E812: [(0x24A10E, "jsr"), (0x267CAC, "jsr"),
               (0x275B06, "jsr"), (0x275B1A, "jsr"),
               (0x27B4A0, "jsr"), (0x294C5E, "jsr"),
               (0x294C7E, "jsr"), (0x294D42, "jsr"),
               (0x294D62, "jsr")],
    0x26080A: [(0x24A214, "jsr")],
    0x241292: [(0x249104, "jmp"), (0x24A21A, "jmp"),
               (0x25CAC2, "jmp"), (0x25CEB0, "jmp"),
               (0x25DBAC, "jmp"), (0x26078C, "jmp"),
               (0x288A34, "jmp"), (0x288C62, "jmp"),
               (0x28D518, "jmp"), (0x28D5F2, "jmp"),
               (0x28F37A, "jsr"), (0x290774, "jmp"),
               (0x290796, "jmp"), (0x291F1C, "jmp")],
}


# Exact displacement-encoded local edges. Absolute-long calls are inventoried
# separately above. This is the complete conditional/loop/return edge set in
# $249F8A..$24A21F, including the apparent $24A12E routine end.
BRANCHES = {
    0x249F94: "6606", 0x249FAE: "660000a6",
    0x24A01A: "670c", 0x24A02E: "6606", 0x24A052: "600000a2",
    0x24A0BE: "670c", 0x24A0D2: "6606", 0x24A0FC: "6710",
    0x24A104: "6608", 0x24A10C: "650a", 0x24A114: "51cffff8",
    0x24A12E: "4e75",
    0x24A134: "661a", 0x24A13E: "6b06", 0x24A144: "4e75",
    0x24A154: "6b02", 0x24A156: "4e75", 0x24A15C: "6600000c",
    0x24A168: "6008", 0x24A184: "6726", 0x24A18A: "6700000c",
    0x24A194: "6700000a", 0x24A19C: "672e", 0x24A1A4: "6726",
    0x24A1A8: "60000022", 0x24A1B0: "671a", 0x24A1B8: "6700000a",
    0x24A1C0: "6702", 0x24A1C8: "6702", 0x24A1D2: "6618",
    0x24A1E8: "6402", 0x24A1F4: "51cdfffc",
    0x24A21A: "4ef900241292",
}


def check(*, break_opcode: bool = False) -> None:
    raw = bytearray(IMAGE.read_bytes())
    if break_opcode:
        raw[0x24A00C] ^= 1
    data = bytes(raw)

    assert hashlib.sha256(data[0x249F8A:0x24A130]).hexdigest() == \
        "79c9b63a30e3664d5cd9e76b500552487bb4caabdf66d8df4ac8ddd20b33fa81"
    assert hashlib.sha256(data[0x24A130:0x24A220]).hexdigest() == \
        "a802d2709787d86ef5886f2cbf5a922c05615a0ff22393cbccee23f0e2281aab"

    for target, expected in CALLERS.items():
        got = absolute_edges(data, target)
        assert got == expected, f"${target:06X} caller set changed: {got}"
    for at, expected in BRANCHES.items():
        require(data, at, expected, "death-state branch")

    # Rank-critical ordering and mirrored reset calls.
    require(data, 0x24A000, "4eb900285af230390081b646e44833c00081b646",
            "P1 hyper end then rank-power quarter")
    require(data, 0x24A01A, "670c42790081b65c4eb900286ed6",
            "P1 stock HUD then state clear")
    require(data, 0x24A0A4, "4eb900285c1c30390081b648e44833c00081b648",
            "P2 hyper end then rank-power quarter")
    require(data, 0x24A0BE, "670c42790081b65e4eb900286f3e",
            "P2 stock HUD then state clear")
    require(data, 0x287B9A, "067902580081b64a0c79095f0081b64a",
            "P1 death gauge fill and cap")
    require(data, 0x287BB6, "067902580081b64c0c79095f0081b64c",
            "P2 death gauge fill and cap")

    # The three data structures directly consumed by the port.
    require(data, 0x25321E,
            "002251380007000600225338000700060022537800070002002253b800070002"
            "002251380008000200225338000800020022537800080002002253b800080002",
            "P1/P2 death palette descriptors")
    require(data, 0x2551FA, "030302020101", "formation reset growth")
    anim = data[0x255B7C:0x255C18]
    assert hashlib.sha256(anim).hexdigest() == \
        "4fd33b6da411236e6ec560ac5dd50a268e3f6543fba4cb97da431377c8c9de36"
    assert anim[-4:] == b"\xff\xff\xff\xff", "animation list terminator moved"

    print("PASS W164 static: complete P1/P2 death callers, branches, tables, "
          "rank/gauge sinks, reset and deferred-kill boundary")


def capture(*, break_capture: bool = False) -> None:
    """Run the controlled MAME path and pin the board's state transition."""
    check()
    os.environ["PGM_SCRATCH"] = str(ROOT / ".scratch" / "w164-oracle")
    sys.path.insert(0, str(HERE))
    import pgm  # noqa: E402

    run = pgm.run(HERE / "w164death.lua", seconds=3600,
                  env={"W164_INPUT": pgm.BOOT_B, "W164_FRAMES": "2750"},
                  timeout=900)
    if run.returncode or run.fails:
        raise AssertionError(
            f"MAME capture failed rc={run.returncode} fails={run.fails}\n"
            + "\n".join(run.lines))

    init = next((x for x in run.lines if x.startswith("INIT ")), "")
    reset = next((x for x in run.lines if x.startswith("RESET ")), "")
    events = next((x for x in run.lines if x.startswith("EVENTS ")), "")
    if break_capture:
        init = init.replace("power=0014", "power=0015")

    im = re.fullmatch(
        r"INIT lf=(\d+) power=0014 stock=0000 earn=095E active=0000 "
        r"state=0100 anim=00255B7C medal=0000", init)
    rm = re.fullmatch(
        r"RESET lf=(\d+) state=0000 formation=0002 keep20=0000 "
        r"keep22=0000 keep25=03 reset=0001 reset2=0000", reset)
    assert im, f"unexpected initializer snapshot: {init}"
    assert rm, f"unexpected reset snapshot: {reset}"
    assert int(rm.group(1)) - int(im.group(1)) == 70, \
        f"death state took {int(rm.group(1)) - int(im.group(1))} frames, not 70"

    ordered = [
        "gauge-add@287B9A", "gauge-cap@287BAC",
        "rank-quarter@24A00E", "stock-clear@24A01C",
        "state-kind@24A036", "state-mask@24A118",
        "state-dead@24A11C", "anim-start@24A120",
        "wait-start@24A128", "anim-step@24A140",
        "delay-load@24A146", "delay-step@24A150",
        "record-restore@24A1F8", "reset-one@25FF4A",
        "reset-zero@25FF4C", "kill-id@241252", "kill-sp@241254",
    ]
    pos = -1
    for event in ordered:
        pos = events.find(event, pos + 1)
        assert pos >= 0, f"capture lacks ordered event {event}: {events}"
    print(init)
    print(reset)
    print("PASS W164 MAME: authentic initializer/reset transition, exact "
          "70-frame state lifetime and ordered rank-to-kill writes")


if __name__ == "__main__":
    args = sys.argv[1:]
    if "capture" in args:
        capture(break_capture="--break-capture" in args)
    else:
        check(break_opcode="--break-opcode" in args)
