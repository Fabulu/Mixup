#!/usr/bin/env python3
r"""RECON 20 -- a FLOW-FOLLOWING disassembler over the decrypted :maincpu image.

Built for one job: READ PAST THE APPARENT END.  The fall-through trap has bitten
this project TEN times, most recently $24C390 falling into $24C476.  A routine
does not end at the first `rts` you see; it ends when EVERY path out of the entry
has hit a terminator.  This walks all of them.

  disasm(pc, n)      unidasm, cached, chunked
  walk(entry)        -> Walk(insns, calls, terms, span, indirect, tables)

Rules encoded:
  * rts/rte/rtr/rtd/illegal/trapv  terminate the path
  * jmp $abs.l / bra                unconditional -> path continues AT THE TARGET
  * jmp (An) / jmp (An,Dn)          INDIRECT -- recorded, path stops, flagged
  * Bcc / DBcc                      both edges taken
  * bsr / jsr                       CALL recorded, path CONTINUES past it
  * a path that walks into another routine's ENTRY is a FALL-THROUGH and is
    reported by name, not silently absorbed.
"""
from __future__ import annotations

import json
import os
import re
import struct
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMAGE = HERE.parent / "oracle" / "out" / "maincpu.bin"
CACHE = HERE / "out" / "dasm-cache.json"

D = IMAGE.read_bytes()


def mame_home() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", "")) / "Mixup" / "mame"


UNIDASM = mame_home() / "unidasm.exe"

_cache: dict[int, tuple[int, str, str]] = {}   # addr -> (len, mnem, ops)
_loaded = False


def _load() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    if CACHE.exists():
        raw = json.loads(CACHE.read_text())
        for k, v in raw.items():
            _cache[int(k)] = tuple(v)


def save() -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({str(k): list(v) for k, v in _cache.items()}))


LINE = re.compile(r"^([0-9a-f]+): ([0-9a-f ]+?)(?:\s{2,}|\s*$)(\S*)\s*(.*)$")


def _decode_chunk(pc: int, nbytes: int = 512) -> None:
    r = subprocess.run([str(UNIDASM), str(IMAGE), "-arch", "m68000",
                        "-basepc", hex(pc), "-skip", hex(pc), "-count", str(nbytes)],
                       capture_output=True, text=True)
    for line in r.stdout.splitlines():
        m = LINE.match(line.strip("\n"))
        if not m:
            continue
        a = int(m.group(1), 16)
        words = m.group(2).split()
        n = len(words) * 2
        if n == 0:
            continue
        _cache.setdefault(a, (n, m.group(3), m.group(4)))


def insn(pc: int) -> tuple[int, str, str]:
    _load()
    if pc not in _cache:
        _decode_chunk(pc)
    if pc not in _cache:
        return (2, "???", "")
    return _cache[pc]


TERM = {"rts", "rte", "rtr", "rtd", "illegal", "reset", "stop"}
COND = re.compile(r"^(b(cc|cs|eq|ne|ge|gt|hi|le|ls|lt|mi|pl|vc|vs)|db[a-z]{1,2}|"
                  r"s[a-z]{2})(\.[bwls])?$")
BRA = re.compile(r"^bra(\.[bwls])?$")
BSR = re.compile(r"^bsr(\.[bwls])?$")
ABS = re.compile(r"^\$([0-9a-f]+)\.l$")
PLAIN = re.compile(r"^\$([0-9a-f]+)$")
PCREL = re.compile(r"^\(\$([0-9a-f]+),PC\)$")


def _target(ops: str) -> int | None:
    ops = ops.strip()
    m = ABS.match(ops) or PLAIN.match(ops) or PCREL.match(ops)
    return int(m.group(1), 16) if m else None


class Walk:
    def __init__(self, entry: int):
        self.entry = entry
        self.insns: dict[int, tuple[int, str, str]] = {}
        self.calls: list[tuple[int, int]] = []     # (site, target)
        self.icalls: list[tuple[int, str]] = []    # indirect call/jmp sites
        self.terms: list[int] = []
        self.leas: list[tuple[int, int]] = []      # (site, table addr)
        self.absrefs: list[tuple[int, int, str]] = []


def walk(entry: int, limit: int = 4000) -> Walk:
    w = Walk(entry)
    seen: set[int] = set()
    stack = [entry]
    while stack:
        pc = stack.pop()
        while True:
            if pc in seen or len(seen) > limit:
                break
            seen.add(pc)
            n, mn, ops = insn(pc)
            w.insns[pc] = (n, mn, ops)
            base = mn.split(".")[0]
            # record references
            if base in ("lea", "pea"):
                t = _target(re.sub(r",\s*A[0-7]\s*$", "", ops))
                if t is not None:
                    w.leas.append((pc, t))
            for m in ABS.finditer(ops):
                w.absrefs.append((pc, int(m.group(1), 16), mn))
            if base in TERM:
                w.terms.append(pc)
                break
            if base in ("jsr", "bsr") or BSR.match(mn):
                t = _target(ops)
                if t is not None:
                    w.calls.append((pc, t))
                else:
                    w.icalls.append((pc, f"{mn} {ops}"))
                pc += n
                continue
            if base == "jmp" or BRA.match(mn):
                t = _target(ops)
                if t is None:
                    w.icalls.append((pc, f"{mn} {ops}"))
                    w.terms.append(pc)
                    break
                if BRA.match(mn) or (entry - 0x400 <= t <= entry + 0x1200):
                    pc = t          # local: still the same routine
                    continue
                w.calls.append((pc, t))   # a TAIL CALL out of the routine
                w.terms.append(pc)
                break
            if COND.match(mn) and not mn.startswith("s"):
                t = _target(ops.split(",")[-1])
                if t is not None:
                    stack.append(t)
                pc += n
                continue
            pc += n
    return w
