#!/usr/bin/env python3
"""W159 chain-system ROM checker and optional controlled oracle capture.

Default mode is a fast static checker over the decrypted VERSION-B maincpu.
It pins the chain call graph, core opcodes, and table extents. ``capture`` runs
``w159chain.lua`` and writes only under ``.scratch/w159-oracle``.

    python tools/oracle/w159chain.py
    python tools/oracle/w159chain.py capture [frames]
    python tools/oracle/w159chain.py verify-capture
    python tools/oracle/w159chain.py --break-opcode
    python tools/oracle/w159chain.py verify-capture --break-capture

``--break-opcode`` is the deliberate RED control. It mutates an in-memory copy
only, never the ROM-derived file or source tree.

``--break-capture`` is the equivalent RED control for the captured timing
contract. It mutates one parsed row in memory only.
"""
from __future__ import annotations

import csv
import os
import struct
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
IMAGE = HERE / "out" / "maincpu.bin"
SCRATCH = ROOT / ".scratch" / "w159-oracle"


def be16(data: bytes, at: int) -> int:
    return struct.unpack_from(">H", data, at)[0]


def abs_callers(data: bytes, target: int) -> list[tuple[int, str]]:
    t = struct.pack(">I", target)
    out = [(i, "jsr") for i in range(0, len(data) - 5, 2)
           if data[i:i + 6] == b"\x4e\xb9" + t]
    out += [(i, "jmp") for i in range(0, len(data) - 5, 2)
            if data[i:i + 6] == b"\x4e\xf9" + t]
    return sorted(out)


def require(data: bytes, at: int, expected: bytes, why: str) -> None:
    got = data[at:at + len(expected)]
    if got != expected:
        raise AssertionError(
            f"${at:06X} {why}: {got.hex()} != {expected.hex()}")


def static_check(*, break_opcode: bool = False, verbose: bool = True) -> None:
    raw = bytearray(IMAGE.read_bytes())
    if break_opcode:
        raw[0x284636] ^= 1
    data = bytes(raw)

    # Full direct producer inventory. These are exact absolute-long calls in
    # the listing, not a hand-selected subset. Internal BSR edges are pinned
    # separately below because their target is displacement-encoded.
    hit = abs_callers(data, 0x286096)
    kill = abs_callers(data, 0x28615E)
    grant = abs_callers(data, 0x287682)
    assert len(hit) == 89, f"scoreHit direct callers: {len(hit)} != 89"
    assert len(kill) == 90, f"scoreKill direct callers: {len(kill)} != 90"
    assert grant == [
        (0x249FDA, "jsr"), (0x27FBE4, "jsr"), (0x2866CA, "jmp"),
        (0x2867A4, "jsr"), (0x2867CE, "jsr"), (0x2867E4, "jsr"),
    ], f"$287682 caller set changed: {grant}"

    # Per-frame decay and presentation call graph.
    require(data, 0x28D52E, bytes.fromhex("4eb9002842b0"), "HUD drain call")
    require(data, 0x28D534, bytes.fromhex("4eb90028444e"), "HUD ledger call")
    require(data, 0x2845CC, bytes.fromhex("53790081b5c8"), "popup countdown")
    require(data, 0x284610, bytes.fromhex("61000fa4"), "popup BSR")
    require(data, 0x284614, bytes.fromhex("3c390081b5c0"), "meter sample")
    require(data, 0x284636, bytes.fromhex("53790081b5c0"), "meter decrement")
    require(data, 0x284640, bytes.fromhex("23c00081b5b8"), "chain-break clear A")
    require(data, 0x284646, bytes.fromhex("23c00081b5ce"), "chain-break clear B")
    require(data, 0x284658, bytes.fromhex("61001382"), "chain-bar BSR")

    # Hit/kill and ordinary-chain edges.
    require(data, 0x2860F2, bytes.fromhex("61000782"), "$400 beam-chain BSR")
    require(data, 0x28617C, bytes.fromhex("61000148"), "P1 kill-chain BSR")
    require(data, 0x286224, bytes.fromhex("61000250"), "P2 kill-chain BSR")
    require(data, 0x286314, bytes.fromhex("4a790081b5c0"), "continue fork")
    require(data, 0x28631C, bytes.fromhex("6100031c"), "cold refill BSR")
    require(data, 0x286320, bytes.fromhex("42790081b5da"), "cold chain reset")
    require(data, 0x2863B2, bytes.fromhex("3082"), "BCD chain write")
    require(data, 0x2863E8, bytes.fromhex("61000250"), "hot refill BSR")
    require(data, 0x286664, bytes.fromhex("33f90081b5b20081b5c0"), "cap clamp")
    require(data, 0x2866C4, bytes.fromhex("d1790081b64a"), "cap gauge add")
    require(data, 0x2866CA, bytes.fromhex("4ef900287682"), "cap grant tail")
    require(data, 0x28679E, bytes.fromhex("d5790081b64a"), "beam gauge add")
    require(data, 0x2867A4, bytes.fromhex("4eb900287682"), "beam grant call")
    require(data, 0x2867C8, bytes.fromhex("d5790081b64a"), "laser gauge add")
    require(data, 0x2867CE, bytes.fromhex("4eb900287682"), "laser grant call")

    # Grantor threshold/refusal/spawn contract.
    require(data, 0x287682, bytes.fromhex("0c79095f0081b64a"), "gauge threshold")
    require(data, 0x28768C, bytes.fromhex("0c7900050081b65c"), "stock refusal")
    require(data, 0x287696, bytes.fromhex("0c7900040081b6e0"), "pending refusal")
    require(data, 0x2876A0, bytes.fromhex("42790081b64a"), "gauge clear")
    require(data, 0x2876C6, bytes.fromhex("52790081b6e0"), "pending increment")
    require(data, 0x287702, bytes.fromhex("700c"), "kind-C selection")
    require(data, 0x28770C, bytes.fromhex("4eb90027e912"), "kind-C spawn")

    cap = [be16(data, 0x287DF0 + i * 2) for i in range(2)]
    refill = [be16(data, 0x287DF4 + i * 2) for i in range(2)]
    cap_gain = [be16(data, 0x286EC2 + i * 2) for i in range(5)]
    hyper_cap_gain = [be16(data, 0x286ECC + i * 2) for i in range(5)]
    stock_adjust = [be16(data, 0x2866D2 + i * 2) for i in range(6)]
    assert cap == [56, 90], f"chain caps changed: {cap}"
    assert refill == [20, 18], f"chain refills changed: {refill}"
    assert cap_gain == [4, 4, 5, 4, 4], f"normal cap-gain table changed: {cap_gain}"
    assert hyper_cap_gain == [1, 1, 1, 1, 1], \
        f"hyper cap-gain table changed: {hyper_cap_gain}"
    assert stock_adjust == [0, 0xFFFF, 0, 1, 2, 3], \
        f"stock adjustment table changed: {stock_adjust}"

    if verbose:
        print(f"PASS W159 static: hit callers={len(hit)}, kill callers={len(kill)}, "
              f"grant callers={len(grant)}, cap={cap}, refill={refill}")
        print("  hit callers : " + " ".join(f"${a:06X}" for a, _ in hit))
        print("  kill callers: " + " ".join(f"${a:06X}" for a, _ in kill))
        print("  $287682     : " + " ".join(f"${a:06X}/{k}" for a, k in grant))


def verify_capture(rows: list[dict[str, str]], *, break_capture: bool = False) -> None:
    """Pin the controlled capture's exact frame order and numeric deltas."""
    by_lf = {int(r["lf"]): r.copy() for r in rows}
    if break_capture:
        by_lf[4811]["meter"] = "0001"

    def row(lf: int) -> dict[str, str]:
        if lf not in by_lf:
            raise AssertionError(f"capture lacks logic frame {lf}")
        return by_lf[lf]

    def event(lf: int, fragment: str) -> None:
        if fragment not in row(lf)["events"]:
            raise AssertionError(f"lf {lf} lacks event {fragment!r}")

    # The first kill starts a meter but not chain 1. Two kills two frames later
    # seed and advance the BCD counter before the HUD's end-of-frame decrement.
    assert (row(2786)["chain"], row(2786)["meter"], row(2786)["cap"]) == \
        ("0000", "0011", "0038")
    event(2786, "meter+@28664E:81B5C0=12")
    event(2786, "meter-@284636:81B5C0=11")
    assert (row(2788)["chain"], row(2788)["meter"]) == ("0003", "0033")
    event(2788, "chain-seed1@286380:81B5DA=1")
    event(2788, "chain+@2863B2:81B5DA=3")
    event(2788, "meter+@28664E:81B5C0=34")
    event(2788, "meter-@284636:81B5C0=33")

    # Clean no-hit contact gap: exactly one meter unit per logic frame, while
    # the BCD chain count is retained for every sample.
    clean = [row(lf) for lf in range(4343, 4392)]
    assert [int(r["meter"], 16) for r in clean] == list(range(0x36, 0x05, -1)), \
        "lf 4343..4391 is not the exact 54-to-6 one-per-frame decay window"
    assert {r["chain"] for r in clean} == {"1004"}, \
        "BCD chain changed during clean no-hit decay window"
    assert not any(any(x in r["events"] for x in
                       ("kill-cap", "meter+", "chain+", "gauge+beam"))
                   for r in clean), "clean no-hit window contains a producer"

    # Expiry clears score accumulators, but the displayed count is reset by the
    # next cold kill. The following connected kills seed 1 and reach BCD 2.
    assert row(4810)["meter"] == "0001"
    assert (row(4811)["meter"], row(4811)["chain"]) == ("0000", "1022")
    event(4811, "chainend-a@284640")
    event(4811, "chainend-b@284646")
    assert (row(4956)["chain"], row(4956)["meter"]) == ("0000", "0011")
    event(4956, "chain0@286320:81B5DA=0")
    assert (row(4958)["chain"], row(4958)["meter"]) == ("0002", "0021")
    event(4958, "chain-seed1@286380:81B5DA=1")

    # Deliberately forced pacing only: an authentic cap-tail add crosses the
    # real threshold and makes a live kind-C item in that same logic frame.
    assert row(4801)["gauge"] == "0960" and row(4801)["forced"] == "1"
    assert (row(4984)["gauge"], row(4984)["item_c_live"]) == ("0000", "1")
    event(4984, "gauge+cap@2866C4:81B64A=966")
    event(4984, "gauge0-grant@2876A0:81B64A=0")

    # Presentation is sampled on the same frames: exact TX cells and a chain
    # bar record. These are the board outputs the published asset audit maps.
    assert (row(2899)["tx435"], row(2899)["tx436"], row(2899)["tx437"]) == \
        ("C5FB000A", "C5F1000A", "C5E7000A")
    assert int(row(2899)["b25_records"]) > 0
    assert "001CC4E4" in row(2899)["b25_tiles"]


def summarize(tsv: Path, *, break_capture: bool = False) -> None:
    with tsv.open(newline="", encoding="utf8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    if not rows:
        raise AssertionError("capture TSV is empty")
    verify_capture(rows, break_capture=break_capture)

    phases: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        phases.setdefault(row["phase"], []).append(row)
    print(f"CAPTURE {len(rows)} logic frames: {tsv}")
    for name, rs in phases.items():
        chain = [int(r["chain"], 16) for r in rs]
        meter = [int(r["meter"], 16) for r in rs]
        gauge = [int(r["gauge"], 16) for r in rs]
        b25 = [int(r["b25_records"]) for r in rs]
        ev = Counter(e.split("@", 1)[0] for r in rs for e in r["events"].split(",") if e)
        print(f"  {name:20s} n={len(rs):4d} chain ${min(chain):04X}..${max(chain):04X} "
              f"meter {min(meter)}..{max(meter)} gauge {min(gauge)}..{max(gauge)} "
              f"b25 {min(b25)}..{max(b25)} events={dict(ev)}")

    natural = [r for r in rows if int(r["lf"]) < 4800]
    forced = [r for r in rows if int(r["lf"]) >= 4800]
    print(f"  natural max gauge=${max(int(r['gauge'], 16) for r in natural):04X}, "
          f"max chain=${max(int(r['chain'], 16) for r in natural):04X}")
    threshold = [r for r in forced if "gauge0-grant" in r["events"]]
    print(f"  forced threshold grant frames={[r['lf'] for r in threshold]}")
    item_frames = [r for r in forced if int(r["item_c_live"]) > 0]
    print(f"  forced kind-C live first={item_frames[0]['lf'] if item_frames else 'NONE'}")
    print("PASS W159 capture contract: hit/refill/decrement/break/restart/grant/TX/bucket25")


def capture(frames: int) -> None:
    static_check(verbose=False)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    tsv = SCRATCH / "w159-chain.tsv"
    tsv.unlink(missing_ok=True)
    os.environ["PGM_SCRATCH"] = str(SCRATCH / "mame")
    sys.path.insert(0, str(HERE))
    import pgm  # noqa: E402

    defs = pgm.scenarios()
    env = {
        "W159_FRAMES": str(frames),
        "W159_INPUT": defs["bootPrefix"]["versionB"],
        "W159_TSV": str(tsv),
        "W159_REQUIRE_BUILD": "B",
    }
    run = pgm.run(HERE / "w159chain.lua", seconds=max(900, frames // 15 + 600),
                  env=env, timeout=7200)
    (SCRATCH / "w159-chain.log").write_text(
        "\n".join(run.lines), encoding="utf8")
    pgm.check(run, "W159 chain capture")
    for line in run.lines:
        print(line)
    summarize(tsv)


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "capture":
        capture(int(args[1]) if len(args) > 1 else 5800)
    elif args and args[0] == "verify-capture":
        summarize(SCRATCH / "w159-chain.tsv",
                  break_capture="--break-capture" in args)
    else:
        static_check(break_opcode="--break-opcode" in args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
