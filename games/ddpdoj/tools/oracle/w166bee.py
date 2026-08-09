#!/usr/bin/env python3
"""Static VERSION-B inventory for W166's bee-to-hyper collect arms.

Use ``--break-opcode`` for the in-memory RED control. The ROM dump is never
modified. Use ``--inventory`` while auditing to print absolute-long callers.
"""
from __future__ import annotations

import struct
import sys
import csv
from pathlib import Path

IMAGE = Path(__file__).resolve().parent / "out" / "maincpu.bin"
CAPTURE = IMAGE.parents[5] / ".scratch" / "w159-oracle" / "w159-chain.tsv"


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


def check(*, break_opcode: bool = False, inventory: bool = False) -> None:
    raw = bytearray(IMAGE.read_bytes())
    if break_opcode:
        raw[0x27FBDE] ^= 1
    data = bytes(raw)

    if inventory:
        for target in (0x242AF6, 0x27F92A, 0x286128, 0x287682, 0x287722):
            print(f"${target:06X}: {absolute_edges(data, target)}")

    # Carrier drop, bee dispatch, and both complete mirrored collect entries.
    require(data, 0x2767DE,
            "302d001a142e001f4eb90027f92a",
            "type-$8A kind/layer bee allocation")
    require(data, 0x27FAD6,
            "0801000c660000900801000b670001a8",
            "P1/P2 touch dispatch")
    require(data, 0x27FAE6,
            "36390081293e38390081b5ea3a390081b604",
            "P2 collect register load")
    require(data, 0x27FB1C,
            "4a790081b640660000444a44673e4a45673a6b38",
            "P2 hyper/meter/hit gates")
    require(data, 0x27FB30,
            "48e7fc000c450200630000063a3c020030054eb900242af6",
            "P2 BCD-$0200 clamp and converter")
    require(data, 0x27FB48,
            "700004420014650000080640004860f2d1790081b64c"
            "4eb9002877224cdf003f",
            "P2 groups-of-20 gain and grant")
    require(data, 0x27FB6C,
            "36390081293c38390081b5c03a390081b5da",
            "P1 collect register load")
    require(data, 0x27FBA2,
            "4a790081b63e660000444a44673e4a45673a6b38",
            "P1 hyper/meter/hit gates")
    require(data, 0x27FBB6,
            "48e7fc000c450200630000063a3c020030054eb900242af6",
            "P1 BCD-$0200 clamp and converter")
    require(data, 0x27FBCE,
            "700004420014650000080640004860f2d1790081b64a"
            "4eb9002876824cdf003f",
            "P1 groups-of-20 gain and grant")

    # Full $242AF6 callee, read through its RTS, plus the next table through
    # its actual end. This guards the BCD-to-binary boundary rather than a
    # guessed arithmetic shortcut.
    require(data, 0x242AF6,
            "41fa0044594f224f3f40fffe720d94428308830864023280"
            "d542301951c9fff20042c0004642584f4e75",
            "$242AF6 14-pass packed-BCD converter")
    require(data, 0x242B20,
            "0001000200040008001600320064012802560512102420484096",
            "$242AF6 BCD powers through table end")

    # The grant callee inventories prove these bee tails now enter the same
    # authentic pipeline as chain-cap earnings. W163 owns the callee body.
    assert absolute_edges(data, 0x287682) == [
        (0x249FDA, "jsr"), (0x27FBE4, "jsr"), (0x2866CA, "jmp"),
        (0x2867A4, "jsr"), (0x2867CE, "jsr"), (0x2867E4, "jsr")]
    assert absolute_edges(data, 0x287722) == [
        (0x24A07E, "jsr"), (0x27FB5E, "jsr"), (0x28676C, "jmp"),
        (0x286826, "jsr"), (0x286850, "jsr"), (0x286866, "jsr")]

    print("PASS W166 static: carrier drop, P1/P2 bee collect, BCD conversion, "
          "earn accumulators and complete grant caller inventory")


def verify_mame() -> None:
    """Recheck W159's reproducible natural VERSION-B bee collection.

    Regenerate it with ``python tools/oracle/w159chain.py capture 5800``.
    W159's Lua uses normal stage input through the bee event; its only gauge
    intervention occurs later at logic frame 4800 and cannot affect these rows.
    """
    if not CAPTURE.exists():
        raise FileNotFoundError(
            f"{CAPTURE} missing; run w159chain.py capture 5800 first")
    with CAPTURE.open(newline="", encoding="utf-8") as handle:
        rows = {int(row["lf"]): row for row in csv.DictReader(handle, delimiter="\t")}
    bee = rows[4344]
    assert bee["forced"] == "0", "bee row must precede the controlled threshold"
    assert "gauge-write@27FBDE:81B64A=A3F" in bee["events"]
    assert "gauge0-grant@2876A0:81B64A=0" in bee["events"]
    assert bee["item_c_live"] == "1" and bee["stock"] == "0000"
    collect = rows[4724]
    assert "stock+@2530CA:81B65C=1" in collect["events"]
    assert "hyper-gauge=95f@2530D0:81B642=95F" in collect["events"]
    assert collect["stock"] == "0001"
    print("PASS W166 MAME: natural bee `$27FBDE` crossed the grant threshold "
          "at lf4344; kind-C collection loaded stock/gauge at lf4724")


if __name__ == "__main__":
    check(break_opcode="--break-opcode" in sys.argv[1:],
          inventory="--inventory" in sys.argv[1:])
    if "--verify-mame" in sys.argv[1:]:
        verify_mame()
