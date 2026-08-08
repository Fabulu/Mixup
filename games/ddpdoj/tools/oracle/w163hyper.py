#!/usr/bin/env python3
"""Static VERSION-B inventory for W163's chain-earned hyper pipeline.

Use ``--break-opcode`` for the in-memory RED control. The ROM dump is never
modified.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

IMAGE = Path(__file__).resolve().parent / "out" / "maincpu.bin"


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


def check(*, break_opcode: bool = False) -> None:
    raw = bytearray(IMAGE.read_bytes())
    if break_opcode:
        raw[0x285A62] ^= 1
    data = bytes(raw)

    # Complete absolute-long caller inventories for both players.
    assert absolute_edges(data, 0x287682) == [
        (0x249FDA, "jsr"), (0x27FBE4, "jsr"), (0x2866CA, "jmp"),
        (0x2867A4, "jsr"), (0x2867CE, "jsr"), (0x2867E4, "jsr")]
    assert absolute_edges(data, 0x287722) == [
        (0x24A07E, "jsr"), (0x27FB5E, "jsr"), (0x28676C, "jmp"),
        (0x286826, "jsr"), (0x286850, "jsr"), (0x286866, "jsr")]
    assert absolute_edges(data, 0x2875B4) == [
        (0x249922, "jsr"), (0x285B2A, "jmp"), (0x28EAB8, "jsr")]
    assert absolute_edges(data, 0x287616) == [
        (0x24992A, "jsr"), (0x285C54, "jmp"), (0x28EACE, "jsr")]
    assert absolute_edges(data, 0x27E912) == [
        (0x2875FC, "jsr"), (0x28765E, "jsr"),
        (0x28770C, "jsr"), (0x2877AC, "jsr")]

    # Chain cap tail and mirrored grant thresholds.
    require(data, 0x286674, "30390081309441fa08464e71d0c03010", "cap gain table")
    require(data, 0x2866C4, "d1790081b64a4ef900287682", "P1 earn and grant")
    require(data, 0x286766, "d1790081b64c4ef900287722", "P2 earn and grant")
    require(data, 0x287682, "0c79095f0081b64a", "P1 threshold")
    require(data, 0x287722, "0c79095f0081b64c", "P2 threshold")
    require(data, 0x28770C, "4eb90027e912", "P1 immediate item")
    require(data, 0x2877AC, "4eb90027e912", "P2 immediate item")

    # Item pools, collection, request, activation, duration and sinks.
    require(data, 0x27E94E, "41f900816e7a343c0005", "kind-C pool")
    require(data, 0x27E960, "41f900816ffa343c0005", "kind-14 pool")
    require(data, 0x2530CA, "52790081b65c33fc095f0081b642", "P1 collect")
    require(data, 0x2530F2, "52790081b65e33fc095f0081b644", "P2 collect")
    require(data, 0x249868, "5341d24143f900252b44", "request power lookup")
    require(data, 0x24989A, "34bc000108ee00000001", "request and player flag")
    require(data, 0x25325E, "103c005008390002008130f8", "P1 activation invulnerability")
    require(data, 0x25328A, "13c00081048613fc005000810486", "P2 forced-$50 invulnerability")
    require(data, 0x25329A, "08b90000008103e74ebaf468", "P1 end flag clear and beam reset")
    require(data, 0x285A62, "d1790081b646", "P1 rank power gain")
    require(data, 0x285B8C, "d1790081b648", "P2 rank power gain")
    require(data, 0x285ABA, "33fc00780081b5c8", "P1 chain maintenance")
    require(data, 0x285BE4, "33fc00780081b5f2", "P2 chain maintenance")
    require(data, 0x285AEA, "55790081b642", "P1 duration drain")
    require(data, 0x285C14, "55790081b644", "P2 duration drain")
    require(data, 0x249970, "4eb900285af257790081b646", "P1 bomb end and debit")
    require(data, 0x2499C0, "4eb900285c1c57790081b648", "P2 bomb end and debit")

    print("PASS W163 static: complete P1/P2 grant, pending, allocator, "
          "collect, activation, duration and bomb-sink inventory")


if __name__ == "__main__":
    check(break_opcode="--break-opcode" in sys.argv[1:])
