#!/usr/bin/env python3
"""W452 cartridge and board oracle for bee-carrier visibility.

Default mode verifies the exact ROM windows and the two ignored MAME captures
identified by w452beevisibility.board.json.  Use ``capture`` to regenerate the
captures from the W69 scenario manifests before verifying them.
"""
from __future__ import annotations

import csv
import hashlib
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMAGE = HERE / "out" / "maincpu.bin"
WITNESS = HERE / "w452beevisibility.board.json"
SNAPS = HERE / "out" / "snap"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(data: bytes, at: int, expected: str, why: str) -> None:
    want = bytes.fromhex(expected)
    got = data[at:at + len(want)]
    if got != want:
        raise AssertionError(
            f"${at:06X} {why}: {got.hex()} != {want.hex()}")


def signed(value: int, bits: int) -> int:
    sign = 1 << (bits - 1)
    return value - (1 << bits) if value & sign else value


def branch_target(data: bytes, pc: int) -> tuple[int, int]:
    """Decode a 68000 Bcc/BRA target and return (target, instruction bytes)."""
    opcode = struct.unpack_from(">H", data, pc)[0]
    if opcode & 0xF000 != 0x6000:
        raise AssertionError(f"${pc:06X} is not a 68000 branch")
    displacement = opcode & 0xFF
    if displacement == 0:
        # The target base is the extension-word address.  Treating the low zero
        # as an 8-bit +0 branch is the exact family of defects W437-W441 found.
        displacement = signed(struct.unpack_from(">H", data, pc + 2)[0], 16)
        return pc + 2 + displacement, 4
    return pc + 2 + signed(displacement, 8), 2


def check_static() -> None:
    data = IMAGE.read_bytes()

    # Type $8A, complete handler through the death jump.  The draw gate is
    # $2767AA bchg #6,($1,A6), followed by $2767B0 bne $2767CE.  Only the old
    # clear-bit arm toggles the descriptor and calls its emitter.
    require(data, 0x276702,
            "4a39008130f86b2c4eb90024179e202e000206400c00d07900813172"
            "0640b000650c48400640040006408c00640e4a2d0016670e4ef900263762"
            "4e711b7c00010016725cc216670c021600a3",
            "type-$8A bounds and hit prologue")
    require(data, 0x27674E,
            "4a6e00186b00007c4a7900811f7266484eb9002428844a40676608000000"
            "671c3439008103ea322e000492426a0244410c410240651c080000016744"
            "34390081044c322e000492426a0244410c410240642e3b7c000f0018"
            "536d0018086e00060001661c0aae000000b4000a302e001ed040d040"
            "41fa1ad84e71207000004e904e75",
            "type-$8A proximity, alternating suppression and emit")
    require(data, 0x2767D0,
            "70014eb90028615e4eb90028c25a302d001a142e001f4eb90027f92a"
            "700c4eb900289004216e00020002302e001ed04043fa1b1e4e71"
            "31710000001e303c0001314000104ef900263762",
            "type-$8A death and released-bee allocation")

    # Released kind-1 bee.  The body dispatch has wide branches into collect
    # arms and into $27FC8C.  The idle arm changes art on a B,A,A cadence but
    # reaches the layer emitter on every surviving in-bounds frame.
    require(data, 0x27FACC,
            "080100006600165a70000801000c660000900801000b670001a8",
            "released-bee collected/touch/idle dispatch")
    require(data, 0x27FC8C,
            "2d7c001bca34000a536e0018640e3d7c000200182d7c001bca80000a"
            "202e000206401c00d0790081317206409000650a48400640080006407800"
            "65b47004c240b141661a4a79008130d2660a30390080b03cd16e0002"
            "206e00284ed0",
            "released-bee B,A,A art cadence, bounds and unconditional emit")

    expected_targets = {
        0x276752: (0x2767D0, 4),
        0x27FAD0: (0x28112C, 4),
        0x27FADA: (0x27FB6C, 4),
        0x27FAE2: (0x27FC8C, 4),
        0x27FC98: (0x27FCA8, 2),
        0x27FCC6: (0x27FC7C, 2),
    }
    for pc, want in expected_targets.items():
        got = branch_target(data, pc)
        if got != want:
            raise AssertionError(
                f"${pc:06X} branch target/size {got} != {want}")

    print("PASS W452 static: type-$8A cover/proximity/blink/drop and released "
          "bee B,A,A continuous-emission arms are byte-exact")


def u16(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset:offset + 2], "big")


def hardware_entry(record: bytes) -> bytes:
    """Apply $23D762 and $23D624 to one record, with board b054 = zero."""
    long_axis = (signed(u16(record, 2), 16) + signed(u16(record, 6), 16)) & 0xFFFF
    short_axis = (signed(u16(record, 4), 16) + signed(u16(record, 8), 16)) & 0xFFFF
    packed = signed((long_axis << 16) | short_axis, 32) >> 6
    request01 = (packed & 0x07FF03FF) | 0x80008000
    emitted01 = ((request01 & 0xF800F800) | (request01 & 0x07FF3FFF)) & 0xFFFFFFFF
    out = bytearray(emitted01.to_bytes(4, "big") + record[10:16])
    out[4] = record[0x1C] | record[0x1D]
    return bytes(out)


def capture_columns(record_address: str) -> tuple[str, str]:
    return {
        "81461c": ("s14", "e14"),
        "8145dc": ("s12", "e12"),
        "817dc6": ("bee0", "e12"),
    }[record_address]


def check_capture(spec: dict) -> int:
    capture = HERE / spec["file"]
    manifest = HERE / spec["manifest"]
    if not capture.exists():
        raise FileNotFoundError(
            f"{capture} missing; run `python {Path(__file__).name} capture`")
    if sha256(capture) != spec["sha256"]:
        raise AssertionError(f"{capture} SHA-256 changed")
    if sha256(manifest) != spec["manifestSha256"]:
        raise AssertionError(f"{manifest} SHA-256 changed")

    wanted = {frame["lf"]: frame for frame in spec["frames"]}
    seen: set[int] = set()
    with capture.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            lf = int(row["lf"])
            frame = wanted.get(lf)
            if frame is None:
                continue
            record_key, enemy_key = capture_columns(frame["recordAddress"])
            if row["vf"] != str(frame["vf"]):
                raise AssertionError(f"{spec['id']} lf{lf}: video frame changed")
            if row[record_key] != frame["record"]:
                raise AssertionError(f"{spec['id']} lf{lf}: object record changed")
            if row[enemy_key] != frame["enemy"]:
                raise AssertionError(f"{spec['id']} lf{lf}: enemy record changed")
            if row["prev"] != frame["queueBytes"]:
                raise AssertionError(f"{spec['id']} lf{lf}: queue size changed")

            display = bytes.fromhex(row["dlist"])
            if hashlib.sha256(display).hexdigest() != frame["displayListSha256"]:
                raise AssertionError(f"{spec['id']} lf{lf}: display list changed")
            entry = hardware_entry(bytes.fromhex(frame["record"]))
            if entry.hex() != frame["entry"]:
                raise AssertionError(f"{spec['id']} lf{lf}: derived entry changed")
            offsets = [at for at in range(0, len(display) - 9, 10)
                       if display[at:at + 10] == entry]
            if offsets != frame["entryOffsets"]:
                raise AssertionError(
                    f"{spec['id']} lf{lf}: entry offsets {offsets} != "
                    f"{frame['entryOffsets']}")
            seen.add(lf)
    if seen != set(wanted):
        raise AssertionError(
            f"{spec['id']}: missing selected frames {sorted(set(wanted) - seen)}")
    return len(seen)


def check_board() -> None:
    witness = json.loads(WITNESS.read_text(encoding="utf-8"))
    if witness["machine"] != {
            "set": "ddpdojblk", "build": "B",
            "maincpuFnv64": "D4C25CA9C91B9D47"}:
        raise AssertionError("W452 board machine pin changed")
    frames = sum(check_capture(spec) for spec in witness["captures"])

    for snap in witness["snapshots"]:
        path = SNAPS / snap["file"]
        if not path.exists() or sha256(path) != snap["sha256"]:
            raise AssertionError(f"snapshot identity changed or missing: {path}")

    print(f"PASS W452 MAME: {frames} selected object-draw frames and "
          f"{len(witness['snapshots'])} framebuffer identities match the "
          "pinned VERSION-B captures")


def run_capture() -> None:
    import pgm

    jobs = [
        {
            "scenario": "stage1-sweep",
            "frames": 4600,
            "output": HERE / "out/w452/carrier-board.tsv",
            "raw": "e14=81378c:50,s14=81461c:2c,dlist=800000:a00,"
                   "prev=80affc:2,p1=8103e6:68",
            "snap": "3998,3999,4000,4001,4002,4003,4445,4446,4447,4448",
            "tag": "w452-carrier",
        },
        {
            "scenario": "stage1-laser-hold",
            "frames": 11550,
            "output": HERE / "out/w452/bee-board.tsv",
            "raw": "e12=8136ec:50,e14=81378c:50,s12=8145dc:2c,"
                   "s14=81461c:2c,bee0=817dc6:2c,dlist=800000:a00,"
                   "prev=80affc:2,p1=8103e6:68",
            "snap": "11295,11296,11297,11298,11299,11300,11301,11302,"
                    "11303,11350,11400,11401,11402,11403",
            "tag": "w452-bee",
        },
    ]
    for job in jobs:
        manifest_path = HERE / f"out/w69/{job['scenario']}/manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        result = pgm.trace(
            job["output"], frames=job["frames"], buttons=manifest["script"],
            meter=False, seconds=1500,
            extra_env={
                "PROBE_POKE": manifest["poke"],
                "PROBE_POKE_FROM": manifest["pokeFrom"],
                "PROBE_RAWDUMP": job["raw"],
                "PROBE_SNAP": job["snap"],
                "PROBE_SNAPTAG": job["tag"],
            })
        pgm.check(result, f"W452 {job['scenario']}")


if __name__ == "__main__":
    if sys.argv[1:] == ["capture"]:
        run_capture()
    elif sys.argv[1:]:
        raise SystemExit(f"usage: {Path(__file__).name} [capture]")
    check_static()
    check_board()
