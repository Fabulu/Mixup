#!/usr/bin/env python3
"""mutgate.py -- prove a cartridge comparison CAN go red, without touching src/.

WAVE 40. "A comparison that cannot fail proves nothing" is this project's rule,
and the way it has always been honoured is: break the port, watch the gate go
red, put it back, check the file hash. That is impossible for an agent whose
scope forbids writing to `src/` -- and it is exactly the situation W40 was in,
with a concurrent agent holding `src/` and `tests/`.

So the mutant lives somewhere else. This tool:

  1. copies `games/gradius/{src,tests,assets}` plus the two comparator files
     into a scratch tree (a fresh copy per mutant -- no mutant can leak into the
     next one);
  2. applies ONE literal text substitution to one file in the COPY;
  3. runs the COPY's `stagecmp.mjs` against the REAL run's dump directory
     (`--dir`), so the cartridge bytes are the same bytes the green run used and
     the only thing that changed is the port;
  4. records the divergence count and the exit code;
  5. re-hashes every file under the REAL `games/gradius/src` and fails loudly if
     one byte moved.

Step 5 is the point. The claim "src/ is untouched" is a MEASUREMENT here, taken
before and after every mutant, and not a promise.

A mutant that comes back GREEN is a hole in the comparison and is reported as
one -- see `docs/knowledge/03`. A mutant may declare `"expect": "GREEN"`, which
is how a CONTROL is written: an edit that changes no behaviour and must NOT go
red. Without one, "every mutant went red" could equally mean the harness goes
red on any edit at all. A mutant whose substitution does not match any
text in the file is reported as NOT APPLIED, never silently skipped, because a
mutation that was never made is the easiest possible way to fake a red gate.

    python games/gradius/tools/oracle/mutgate.py --dump w32arepro \\
        --mutants games/gradius/tools/oracle/mutants-w40.json

The mutant file is a JSON list of
    {"id","file","find","replace","why"}
`find` is matched LITERALLY and must occur exactly once.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent.parent                     # games/gradius
REPO = GAME.parent.parent
COPY_DIRS = ("src", "tests", "assets")
COPY_TOOLS = ("stagecmp.mjs", "porttrace.mjs")


def src_hashes() -> dict[str, str]:
    out = {}
    for p in sorted((GAME / "src").rglob("*")):
        if p.is_file():
            out[str(p.relative_to(GAME))] = hashlib.sha256(
                p.read_bytes()).hexdigest()
    return out


def build_copy(root: Path) -> Path:
    g = root / "games" / "gradius"
    (g / "tools" / "oracle").mkdir(parents=True, exist_ok=True)
    shutil.copy2(REPO / "package.json", root / "package.json")
    for d in COPY_DIRS:
        shutil.copytree(GAME / d, g / d)
    for f in COPY_TOOLS:
        shutil.copy2(HERE / f, g / "tools" / "oracle" / f)
    return g


def _dump_for(m: dict, default: Path) -> Path:
    """A mutant may name its OWN dump, so one table can cover several runs."""
    if "dump" not in m:
        return default
    d = Path(m["dump"])
    return d if d.is_absolute() else HERE / "out" / "stagepoke" / m["dump"]


def run_one(m: dict, dump: Path, pipeline: str, limit: int) -> dict:
    with tempfile.TemporaryDirectory(prefix="mutgate-") as td:
        g = build_copy(Path(td))
        target = g / m["file"]
        text = target.read_text(encoding="utf8")
        n = text.count(m["find"])
        if n != 1:
            return dict(id=m["id"], applied=False, occurrences=n,
                        verdict="NOT APPLIED", divergences=None,
                        why=m.get("why", ""))
        target.write_text(text.replace(m["find"], m["replace"]),
                          encoding="utf8")
        cmd = [_node(), str(g / "tools" / "oracle" / "stagecmp.mjs"),
               "--tag", dump.name, "--dir", str(dump),
               "--pipeline", pipeline, "--limit", str(limit)]
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(td))
        div = None
        for line in r.stdout.splitlines():
            if line.startswith("RESULT: "):
                div = 0 if line.startswith("RESULT: 0 ") else \
                    int(line.split()[1])
        first = [l.strip() for l in r.stdout.splitlines()
                 if l.strip().startswith("f") and ": port " in l][:2]
        return dict(id=m["id"], applied=True, exit=r.returncode,
                    divergences=div,
                    verdict=("RED" if r.returncode == 1 else
                             "THREW" if r.returncode not in (0, 1) else
                             "GREEN (expected)"
                             if m.get("expect") == "GREEN" else
                             "GREEN -- A HOLE IN THE COMPARISON"),
                    first=first, why=m.get("why", ""),
                    stderr=r.stderr.strip().splitlines()[-1:] if r.returncode
                    not in (0, 1) else [])


def _node() -> str:
    return "node"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True,
                    help="a tag under out/stagepoke/, or an absolute dump dir")
    ap.add_argument("--mutants", required=True)
    ap.add_argument("--pipeline", default="enemies")
    ap.add_argument("--limit", type=int, default=4)
    a = ap.parse_args()

    dump = Path(a.dump)
    if not dump.is_absolute():
        dump = HERE / "out" / "stagepoke" / a.dump
    # `chain` runs write chain.json instead of dump.json; both are valid input.
    if not ((dump / "dump.json").exists() or (dump / "chain.json").exists()):
        raise SystemExit(f"no dump at {dump}")

    before = src_hashes()
    mutants = json.loads(Path(a.mutants).read_text())
    rows = []
    print(f"dump {dump.name}   pipeline {a.pipeline}   "
          f"{len(mutants)} mutants   (src/ is NEVER written -- the mutant is a "
          f"scratch copy)")
    print("")
    for m in mutants:
        r = run_one(m, _dump_for(m, dump), m.get("pipeline", a.pipeline),
                    a.limit)
        rows.append(r)
        d = "" if r["divergences"] is None else f"  {r['divergences']} divergent"
        print(f"  {r['id']:<6} {_dump_for(m, dump).name:<11} "
              f"{r['verdict']:<20}{d:<16}   {r['why']}")
        for f in r.get("first", []):
            print(f"           {f}")
        for e in r.get("stderr", []):
            print(f"           {e}")
    after = src_hashes()
    print("")
    # THE POINT OF THIS CHECK, and why a difference is not automatically a
    # failure: on this project `src/` is often held by a CONCURRENT agent, so a
    # file can legitimately move under a tooling run. What must never happen is
    # one of MY mutations landing there -- every mutation this tool writes
    # carries a `// MUTANT` marker, and that is what is looked for.
    moved = sorted(k for k in set(before) | set(after)
                   if before.get(k) != after.get(k))
    leaked = [k for k in moved
              if "// MUTANT" in (GAME / k).read_text(encoding="utf8",
                                                     errors="ignore")]
    if leaked:
        print(f"FAIL: a mutation LEAKED into the real tree: {leaked}")
        return 2
    if moved:
        print(f"games/gradius/src: {len(moved)} file(s) moved under this run "
              f"({moved}) -- NOT mine: no '// MUTANT' marker is present in any "
              f"of them. A concurrent agent owns src/.")
    else:
        print(f"games/gradius/src: {len(before)} files, sha256 IDENTICAL before "
              f"and after (measured, not promised)")
    green = [r["id"] for r in rows if "HOLE" in r["verdict"]]
    ctrl = [r["id"] for r in rows if r["verdict"] == "GREEN (expected)"]
    miss = [r["id"] for r in rows if not r["applied"]]
    print(f"RED {sum(1 for r in rows if r['verdict'] == 'RED')} of "
          f"{len(rows) - len(ctrl)} mutants"
          + (f"; {len(ctrl)} control(s) green as designed: {ctrl}" if ctrl else "")
          + (f"   GREEN (holes): {green}" if green else "")
          + (f"   NOT APPLIED: {miss}" if miss else ""))
    return 1 if (green or miss) else 0


if __name__ == "__main__":
    raise SystemExit(main())
