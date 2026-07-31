#!/usr/bin/env python3
r"""Static helpers over the DECRYPTED :maincpu image: xref, call graph, disasm.

WHAT THIS CAN AND CANNOT SEE -- say it every time a result from here is quoted
(same rule as derive.py, same rule as docs/knowledge/08):

  CAN     absolute-long operands  (`lea $80E240,An`, `jsr $2410BC`, `tst.w $x.l`)
  CANNOT  (d16,An) / (An)+ / (d8,An,Xn) / PC-relative -- anything reached through
          a base register or a PC-relative displacement.

So "N sites" is a LOWER BOUND and a clean result is "no absolute-long site",
never "nothing does this".  The object driver found in wave 2 is itself the
example: its dispatch goes through `lea ($240F62,PC),A0 / movea.l (A0,D1.w),A0`,
which no absolute-long search can see.

The image is ROM-derived and lives in out/ (gitignored).  Produce it with
`python derive.py` (which calls dumpcpu.lua) if it is missing.

  python xref.py lea 80E240              every `lea $80E240,An`
  python xref.py abs 80E240              every absolute-long occurrence
  python xref.py callers 2410BC          every `jsr/jmp $2410BC` (abs.l)
  python xref.py chain 2410BC            walk callers up to the main loop
  python xref.py dasm 2410BC 200         unidasm, byte count
  python xref.py ptrtable 240F62 8 40     N entries, stride, print longword 0
"""
from __future__ import annotations

import struct
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pgm  # noqa: E402

HERE = Path(__file__).resolve().parent
IMAGE = HERE / "out" / "maincpu.bin"


def data() -> bytes:
    if not IMAGE.exists():
        raise SystemExit(f"{IMAGE} missing -- run `python derive.py` first")
    return IMAGE.read_bytes()


def find(d: bytes, pat: bytes) -> list[int]:
    out, i = [], 0
    while True:
        i = d.find(pat, i)
        if i < 0:
            return out
        out.append(i)
        i += 1


def dasm(pc: int, count: int = 120) -> str:
    """unidasm's -count is a BYTE count, not an instruction count (measured)."""
    exe = pgm.mame_home() / "unidasm.exe"
    r = subprocess.run([str(exe), str(IMAGE), "-arch", "m68000",
                        "-basepc", hex(pc), "-skip", hex(pc), "-count", str(count)],
                       capture_output=True, text=True)
    return r.stdout


def cmd_lea(a: int) -> None:
    d, tgt = data(), struct.pack(">I", a)
    for reg in range(8):
        # lea abs.l,An  = 0100 rrr 111 111 001 = 0x41F9 | (reg<<9)
        op = struct.pack(">H", 0x41F9 | (reg << 9))
        for s in find(d, op + tgt):
            print(f"  ${s:06X}  lea ${a:06X},A{reg}")


def cmd_abs(a: int) -> None:
    d = data()
    for s in find(d, struct.pack(">I", a)):
        odd = "  (ODD offset: cannot be an instruction operand)" if s & 1 else ""
        print(f"  ${s:06X}{odd}")


def callers(d: bytes, a: int) -> list[tuple[int, str]]:
    tgt = struct.pack(">I", a)
    out = [(s, "jsr") for s in find(d, b"\x4e\xb9" + tgt)]
    out += [(s, "jmp") for s in find(d, b"\x4e\xf9" + tgt)]
    out.sort()
    return out


def cmd_callers(a: int) -> None:
    for s, k in callers(data(), a):
        print(f"  ${s:06X}  {k} ${a:06X}")


def cmd_chain(a: int, depth: int = 8) -> None:
    d = data()
    seen, cur = set(), [a]
    for lvl in range(depth):
        nxt = []
        for t in cur:
            cs = callers(d, t)
            for s, k in cs:
                print(f"  {'  ' * lvl}${s:06X} {k} -> ${t:06X}")
                if s not in seen:
                    seen.add(s)
                    nxt.append(s)
        if not nxt:
            return
        # a caller SITE is inside some routine; without a routine map we can only
        # continue from the site itself, which the next level's search will treat
        # as a target and find nothing.  So stop after one level unless the site
        # is itself a known jsr target.
        cur = [s for s in nxt if callers(d, s)]
        if not cur:
            print("  (no further absolute-long callers -- the enclosing routine is "
                  "entered by bsr/PC-relative, which this search cannot see)")
            return


def cmd_ptrtable(a: int, stride: int, n: int) -> None:
    d = data()
    for i in range(n):
        off = a + i * stride
        v = struct.unpack(">I", d[off:off + 4])[0]
        rest = d[off + 4:off + stride].hex()
        print(f"  [{i:3d}] ${off:06X}  ptr=${v:06X}  rest={rest}")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "lea":
        cmd_lea(int(args[0], 16))
    elif cmd == "abs":
        cmd_abs(int(args[0], 16))
    elif cmd == "callers":
        cmd_callers(int(args[0], 16))
    elif cmd == "chain":
        cmd_chain(int(args[0], 16))
    elif cmd == "dasm":
        print(dasm(int(args[0], 16), int(args[1]) if len(args) > 1 else 120))
    elif cmd == "ptrtable":
        cmd_ptrtable(int(args[0], 16), int(args[1]), int(args[2]))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
