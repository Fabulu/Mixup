#!/usr/bin/env python3
import json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parents[1] / "oracle"
sys.path.insert(0, str(HERE))
import pgm
name = sys.argv[1] if len(sys.argv) > 1 else "stage1-deep"
sc = json.loads((HERE / "scenarios.json").read_text(encoding="utf8"))
s = next(v for v in sc["scenarios"] if v["name"] == name)
boot = sc["bootPrefix"]["versionB" if s.get("build","B") == "B" else "versionA"]
inp = boot + (";" + s["tail"] if s.get("tail") else "")
r = pgm.run(HERE / "w10zoom.lua", seconds=3600, env={
    "W10_FRAMES": str(s["frames"]), "W10_INPUT": inp,
    "W10_REQUIRE_BUILD": s.get("build","B")})
pgm.check(r, f"w10zoom {name}")
for l in r.lines: print("  " + l)
