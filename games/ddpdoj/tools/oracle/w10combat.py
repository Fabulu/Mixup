"""WAVE 10 RECON 4/5 -- the COMBAT probe.  READ-ONLY instrumentation.

One `frame.lua` run per invocation, driven through `pgm.py trace`, with
PROBE_WATCH / PROBE_RAWDUMP / PROBE_EXEC only.  Nothing here pokes the machine
and nothing here is a gate: it exists to answer five questions with numbers.

  1  HELD vs EDGE fire.  $249B48 tests ($19,A6) = $803972 = the EDGE word
     ($23D156 `and.w D0,D2` with D2 = NOT prev).  So a HOLD gives exactly one
     set bit.  The RAW HELD word $803970 reaches ($18,A6) and -- measured
     statically -- NOTHING in $200000-$2A0000 does `btst #4,($18,An)`.  The one
     consumer of the raw held BUTTON bit is the OPTION object:
        $24C134  move.b ($18,A4),($40,A6)     A4 = $8103E6 (player)
        $24C164  btst   #$4,($40,A6)          <- THE LASER GATE
     `lhold` counts $24C164 being reached at all (via the write two
     instructions earlier that shares its basic block) and `lcoll` counts the
     laser's collision routine actually running.

  2  THE PLAYER HITBOX.  $28B69A `lea $8103E6,A4`, then $244D84
     `jsr ($2459D0,PC)`, which builds the box as
        D0 = ($2,A4) + ($10,A4)      D1 = ($2,A4) - ($12,A4)
        D2 = ($4,A4) + ($14,A4)      D3 = ($4,A4) - ($16,A4)
     so the four half-extents are $8103F6/$8103F8 (the +$2 axis) and
     $8103FA/$8103FC (the +$4 axis), in 1/64 px (the enqueue's `asr.l #6`).
     $8103FA/$8103FC are REWRITTEN EVERY FRAME by $249E78
     `move.l (A0,D0.w),($14,A6)` out of the table behind $2553CA, indexed by
     the tilt ($4e,A6) -- i.e. the port's `animB` IS the hitbox.

  3  THE DAMAGE CONSTANTS.  $2458E8 `subi.w #$1e0,($18,A5)` and $245814
     `subi.w #$208,($18,A5)` are the LASER's per-frame damage; $24504E
     `sub.w D4,($14,A6)` / $24505E `sub.w D5,($16,A5)` is the SHOT's two-way
     exchange.

  4  SCORE / CHAIN.  Candidate words are WATCHED, never named as fact.
"""
from __future__ import annotations
import json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pgm  # noqa: E402

SCEN = json.loads((HERE / "scenarios.json").read_text())
BOOT = SCEN["bootPrefix"]["versionB"]

# ---------------------------------------------------------------- the scripts
# HOLD:  Button 1 held from lf2000 to lf2600 (600 logic frames), then released,
#        then five single-frame TAPS, so one run contains both cases.
HOLD = ("1980=;2000=A;2600=;2700=A;2701=;2720=A;2721=;2740=A;2741=;"
        "2760=A;2761=;2780=A;2781=")
# CONTROL: identical timing, no Button 1 at all.
NONE = "1980=;2000=;2600=;2700=;2701=;2720=;2721=;2740=;2741=;2760=;2761="

WATCH = ",".join([
    # --- the player's own collision box, $8103E6 + $10/$12/$14/$16
    "pby0=8103F6", "pby1=8103F8", "pbx0=8103FA", "pbx1=8103FC",
    "ppy=8103E8", "ppx=8103EA", "ptilt=810434", "pst=8103E6",
    "pf1=8103E6:b",           # the WORD's high byte; ($1,A6) is pf1lo below
    "pf1lo=8103E7:b",         # bit 0 = HYPER, bit 3 = fire-now, bit 4 = firing
    "p3c=810422:b",           # ($3c,A6), set by $249B50 on a shot edge
    "p2a=810410:b", "p2b=810411:b",   # ($2a,A6) delay, ($2b,A6) count
    "ppow=810406", "pform=810440",    # ($20,A6) power, ($5a,A6) formation
    # --- the OPTION record for P1 ($8104AA) and its copy of the RAW HELD byte
    "opt=8104AA", "optf=8104AB:b", "ohold=8104EA:b", "oedge=8104EB:b",
    # --- the LASER record for P1
    "lz=811EF2", "lz10=811F02", "lz1c=811F0E",
    # --- candidate CHAIN / SCORE / hit words (NOT claimed to be any of these)
    "c b410=81B410", "cb412=81B412", "cb63e=81B63E", "cb654=81B654",
    "cb6e6=81B6E6", "cb6e8=81B6E8", "c2952=812952", "c2954=812954:l",
    "c30ce=8130CE", "c3092=813092", "c295c=81295C", "c5e9c=815E9C",
    "c71ba=8171BA", "c7f7e=817F7E",
]).replace("c b410", "cb410")

EXEC = ",".join([
    "sedge=249B50:810422:810423",          # the shot EDGE was seen this frame
    "lhold=24C160:8104EA:8104EB",          # $24C15A..$24C164, the LASER GATE's
                                           #   own basic block (clr.w ($40,A6))
    "ocopy=24C134:8104EA:8104EB",          # the option object ran at all
    "lcoll=2453C6:811EF2:811F23",          # the LASER collision ran
    "lhit=2458D8:811F72:8125E3",           # a laser segment hit something
    "shit=245044:810572:810C33",           # a player shot hit something
])

RAWDUMP = ",".join([
    "prec=8103E6:60",       # the whole player record
    "orec=8104AA:60",       # the whole P1 option record
    "lrec=811EF2:20",       # the P1 laser record
])


def one(tag: str, tail: str, frames: int = 3000) -> Path:
    out = HERE / "out" / f"w10-{tag}.tsv"
    r = pgm.trace(out, frames=frames, buttons=BOOT + ";" + tail, build="B",
                  meter=False, extra_env={
                      "PROBE_WATCH": WATCH,
                      "PROBE_EXEC": EXEC,
                      "PROBE_RAWDUMP": RAWDUMP,
                  })
    pgm.check(r, f"w10-{tag}")
    return out


def dumprun(tag: str, tail: str, at: int, frames: int = 3000) -> Path:
    """A full 128 KiB RAM image at ONE logic frame.  Three of these -- the
    firing run early, the firing run late, and the non-firing control late --
    are how the SCORE / CHAIN words are hunted: a word that grows only in the
    run that killed things is a candidate; a word that grows in both is a
    timer.  A candidate is NOT a fact until an instruction is shown writing it."""
    out = HERE / "out" / f"w10-{tag}.tsv"
    binp = HERE / "out" / f"w10-{tag}.ram.bin"
    r = pgm.trace(out, frames=frames, buttons=BOOT + ";" + tail, build="B",
                  meter=False, extra_env={
                      "PROBE_WATCH": WATCH,
                      "PROBE_RAMDUMP": f"{at}:{binp}",
                  })
    pgm.check(r, f"w10-{tag}")
    return binp


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "hold"
    if which.startswith("dump-"):
        _, tg, at = which.split("-")
        p = dumprun(f"dump-{tg}-{at}", {"hold": HOLD, "none": NONE}[tg], int(at))
    else:
        p = one(which, {"hold": HOLD, "none": NONE}[which])
    print("WROTE", p)
