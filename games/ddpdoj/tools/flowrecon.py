"""RECON 10 -- game flow probe driver (stage/mode machine, death, respawn,
continue, loop-2 gate, bees).

Thin wrapper over tools/oracle/pgm.py's `trace()` so every run inherits the
VERSION-B boot prefix, the determinism flags, the build assert and the object
driver census.  Adds nothing to the oracle; it only chooses env.

  python flowrecon.py snaps            long run, framebuffer PNGs on a ladder
  python flowrecon.py dump LF PATH     one full 128 KiB RAM dump at logic LF
  python flowrecon.py watch SPEC       PROBE_WATCH columns over a long run
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "oracle"))
import pgm  # noqa: E402

OUT = HERE / "oracle" / "out" / "flow"
OUT.mkdir(parents=True, exist_ok=True)


def script(extra: str = "") -> str:
    s = pgm.BOOT_B
    return s + (";" + extra if extra else "")


def main(argv):
    cmd = argv[0] if argv else "snaps"
    if cmd == "snaps":
        frames = int(argv[1]) if len(argv) > 1 else 6000
        hold = argv[2] if len(argv) > 2 else ""
        every = int(argv[3]) if len(argv) > 3 else 400
        pts = ",".join(str(x) for x in range(1250, frames + 1, every))
        extra = f"1300={hold}" if hold else ""
        r = pgm.trace(OUT / "snaps.tsv", frames=frames, buttons=script(extra),
                      snap=pts, extra_env={"PROBE_SNAPTAG": "flow"})
        for l in r.lines:
            print(l)
        return 0
    if cmd == "dump":
        lf, path = int(argv[1]), argv[2]
        hold = argv[3] if len(argv) > 3 else ""
        extra = f"1300={hold}" if hold else ""
        r = pgm.trace(OUT / f"dump{lf}.tsv", frames=lf + 2,
                      buttons=script(extra),
                      extra_env={"PROBE_RAMDUMP": f"{lf}:{path}"})
        for l in r.lines:
            print(l)
        return 0
    if cmd == "watch":
        spec = argv[1]
        frames = int(argv[2]) if len(argv) > 2 else 6000
        hold = argv[3] if len(argv) > 3 else ""
        extra = f"1300={hold}" if hold else ""
        r = pgm.trace(OUT / "watch.tsv", frames=frames, buttons=script(extra),
                      extra_env={"PROBE_WATCH": spec})
        for l in r.lines:
            print(l)
        print("TSV", OUT / "watch.tsv")
        return 0
    raise SystemExit(f"unknown command {cmd}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
