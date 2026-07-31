#!/usr/bin/env python3
"""An executable model of the Vic Viper's movement, checked against the cartridge.

playerhook.py found the code ($9FFC, reached from the NMI's state machine). This
file is the falsifiable statement of what that code DOES: a free-running
simulation seeded once and then driven only by the button stream, compared
byte-for-byte against the real machine's RAM every frame.

Free-running is the point. A per-frame "predict the next value from the real
previous value" check hides an error that only compounds -- and the sub-pixel
accumulator at $0340/$0380 is exactly the kind of state that compounds. Here the
model is seeded at ONE frame and must survive on its own.

What is modelled, and where it lives in the ROM:

  $9FFC   player update entry              (JSR at $9A6A, and at $969A)
  $9FFC   LDA $0100 / CMP #$02 / BCC       alive gate -- >= 2 skips movement
  $A006   LDA $40 / ADC #$02 / CMP #$10    speed level -> raw
  $A011   STA $99 / LDA #$00 / STA $98
  $A017   LSR $99 / ROR $98                16-bit step = raw * 128  (8.8 px/frame)
  $A01B   LDY #$40                         the X arrays are the Y arrays + $40
  $A01F   RIGHT, $A031 LEFT                clamps $F0 and $10
  $A043   DOWN, $A063 UP                   clamps $C0 and $10, and a PRE-check
  $A080   the 24-entry position ring + the two Option followers
  $A0AD   the player's tilt/animation latch
  $A0C8   the Options' animation

Usage
  python playermodel.py                    # default scripted run + all checks
  python playermodel.py --negative         # show every check failing on purpose
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe  # noqa: E402

OUT = probe.OUT

# --------------------------------------------------------------- RAM map -----
# All proven: $0360/$0320 by poke (PROBE.md), the rest by the write hook.
P_STATUS = 0x0100   # object status. player alive == 1; >= 2 == dying/dead
P_ANIMID = 0x0120   # sprite/tilt index written from $9B at $A0C0
P_ANIMT  = 0x0140   # tilt latch timer, INC $0140 at $A0AD
P_RINGC  = 0x0160   # position-ring cursor, 0..23
P_Y      = 0x0320   # object Y, integer pixels
P_YF     = 0x0340   # object Y, 1/256 pixel   ($0320 + $20)
P_X      = 0x0360   # object X, integer pixels ($0320 + $40)
P_XF     = 0x0380   # object X, 1/256 pixel   ($0320 + $60)
RING_X   = 0x07A0   # 24 entries
RING_Y   = 0x07C0
SPEED    = 0x0040   # SPEED UP level, INC $40 at $89A1
OPTIONS  = 0x0045   # Option count, INC $45 at $89D9, capped at 2 by $89D5
HELD     = 0x0007   # buttons held  (R $01 L $02 D $04 U $08)
MODE     = 0x0000

R, L, D, U = 0x01, 0x02, 0x04, 0x08


class Model:
    """The port's player physics, written the way the JS will be written.

    Every branch cites the address whose bytes it came from. Nothing here is
    inferred from behaviour -- the behaviour is what checks it.
    """

    # constants, each read out of the PRG image (bytes quoted in NOTES-player.md)
    SPEED_BIAS   = 0x02   # $A009  ADC #$02
    SPEED_MAX    = 0x10   # $A00B  CMP #$10 / $A00F LDA #$10
    X_MAX        = 0xF0   # $A028  CMP #$F0 / $A02C LDA #$F0
    X_MIN        = 0x10   # $A03A  CMP #$10 / $A03E LDA #$10
    Y_MAX        = 0xC0   # $A052/$A059 CMP #$C0 / $A05D LDA #$C0
    Y_MIN        = 0x10   # $A06C/$A073 CMP #$10 / $A077 LDA #$10
    RING_LEN     = 0x18   # $A08C  CMP #$18 / $A090 SBC #$18
    OPT_LAG      = 0x0B   # $A2AA  SBC #$0B -- 11 ring entries per Option
    ANIM_PERIOD  = 0x08   # $A0BA  CMP #$08

    diag_norm = False    # negative control only; the ROM does NOT do this
    whole_px  = False    # negative control only

    def __init__(self, ram: bytes):
        self.x  = ram[P_X];    self.xf = ram[P_XF]
        self.y  = ram[P_Y];    self.yf = ram[P_YF]
        self.cursor = ram[P_RINGC]
        self.ringx = list(ram[RING_X:RING_X + 24])
        self.ringy = list(ram[RING_Y:RING_Y + 24])
        self.animId = ram[P_ANIMID]
        self.animT  = ram[P_ANIMT]
        self.opt = [(ram[P_X + 1], ram[P_Y + 1]), (ram[P_X + 2], ram[P_Y + 2])]

    # $A006-$A01A. The whole speed system is these six instructions.
    def step16(self, speed_level: int) -> int:
        raw = (speed_level + self.SPEED_BIAS) & 0xFF      # $A009 ADC #$02, 8-bit
        if raw >= self.SPEED_MAX:                         # $A00B CMP / $A00D BCC
            raw = self.SPEED_MAX                          # $A00F LDA #$10
        if self.whole_px:
            return (raw >> 1) << 8                        # negative control
        return raw << 7                                   # $A017 LSR $99/ROR $98

    def tick(self, held: int, speed_level: int, n_options: int):
        s = self.step16(speed_level)
        if self.diag_norm and (held & 0x03) and (held & 0x0C):
            s >>= 1                                       # negative control

        # ---- X axis. $A01F. Y register = $40, so $0320,Y IS $0360. ----------
        if held & R:                                      # $A021 AND #$01
            v = ((self.x << 8) | self.xf) + s             # $A285 16-bit ADC
            self.xf = v & 0xFF
            hi = (v >> 8) & 0xFF                          # 8-bit, wraps
            self.x = hi if hi < self.X_MAX else self.X_MAX   # $A028/$A02E
        # NOT elif: $A031 is reached whether or not RIGHT ran, so L+R both run.
        if held & L:                                      # $A033 AND #$02
            v = ((self.x << 8) | self.xf) - s             # $A297 16-bit SBC
            self.xf = v & 0xFF
            hi = (v >> 8) & 0xFF
            self.x = hi if hi >= self.X_MIN else self.X_MIN  # $A03A/$A040

        # ---- Y axis. $A043. Y register = 0. --------------------------------
        tilt = 1                                          # $A043 LDA #$01
        if (held & D) and self.y < self.Y_MAX:            # $A04B / $A052 pre-check
            v = ((self.y << 8) | self.yf) + s
            self.yf = v & 0xFF
            hi = (v >> 8) & 0xFF
            self.y = hi if hi < self.Y_MAX else self.Y_MAX   # $A059/$A07D
            tilt = 2                                      # $A05F LDY #$02
        elif (held & U) and self.y >= self.Y_MIN:         # $A065 / $A06C pre-check
            v = ((self.y << 8) | self.yf) - s
            self.yf = v & 0xFF
            hi = (v >> 8) & 0xFF
            self.y = hi if hi >= self.Y_MIN else self.Y_MIN  # $A073/$A07D
            tilt = 3                                      # $A079 LDY #$03

        # ---- position ring + Options. $A080. -------------------------------
        # ADVANCED ONLY WHILE A DIRECTION IS HELD -- $A082 AND #$0F / BEQ $A0AD.
        if held & 0x0F:
            c = self.cursor + 1                           # $A08A ADC #$01
            if c >= self.RING_LEN:                        # $A08C CMP #$18
                c -= self.RING_LEN                        # $A090 SBC #$18 (C set)
            self.cursor = c
            self.ringx[c] = self.x                        # $A099 STA $07A0,Y
            self.ringy[c] = self.y                        # $A09F STA $07C0,Y
            i = c
            for k in range(2):                            # $A0A7/$A0AA, two calls
                i = (i - self.OPT_LAG) % self.RING_LEN    # $A2A9 SBC #$0B / ADC #$18
                self.opt[k] = (self.ringx[i], self.ringy[i])

        # ---- the tilt latch. $A0AD. ----------------------------------------
        self.animT = (self.animT + 1) & 0xFF              # $A0AD INC $0140
        if self.animT >= 0x80:                            # $A0B0 BPL
            self.animT = 0x10                             # $A0B2 LDA #$10
        if self.animT >= self.ANIM_PERIOD:                # $A0BA CMP #$08
            self.animId = tilt                            # $A0C0 STA $0120
            self.animT = 0                                # $A0C5 STA $0140

    def snapshot(self):
        return dict(x=self.x, xf=self.xf, y=self.y, yf=self.yf,
                    cursor=self.cursor, animId=self.animId, animT=self.animT,
                    opt1x=self.opt[0][0], opt1y=self.opt[0][1],
                    opt2x=self.opt[1][0], opt2y=self.opt[1][1],
                    ringx=tuple(self.ringx), ringy=tuple(self.ringy))


def actual(ram: bytes):
    return dict(x=ram[P_X], xf=ram[P_XF], y=ram[P_Y], yf=ram[P_YF],
                cursor=ram[P_RINGC], animId=ram[P_ANIMID], animT=ram[P_ANIMT],
                opt1x=ram[P_X + 1], opt1y=ram[P_Y + 1],
                opt2x=ram[P_X + 2], opt2y=ram[P_Y + 2],
                ringx=tuple(ram[RING_X:RING_X + 24]),
                ringy=tuple(ram[RING_Y:RING_Y + 24]))


# The default route: 260 frames of every direction and every pair, kept in the
# left half of stage 1 where nothing can kill the ship. A run that dies stops
# being a movement test (the update is skipped entirely at $9FFC/$A003) and the
# checker says so rather than silently comparing a corpse.
SCRIPT = ("200:,10:S,110:"          # boot to gameplay, control at ~frame 310
          ",20:,25:D,25:U,20:R,30:L"
          ",25:RD,25:LU,20:RU,20:LD"
          ",15:LR,15:UD,20:")

# The SPEED-UP run. At $40 = 0 the step is exactly $0100 = 1.00 px/frame, so the
# sub-pixel byte never changes and the X clamp is never reached -- which makes
# three of the negative controls VACUOUS (measured: they passed). This run forces
# the speed level and drives the ship into both X walls, so those controls bite.
SCRIPT_FAST = ("200:,10:S,110:"
               ",20:,60:R,45:L,20:D,20:U,25:RD,25:LU,15:UD,15:LR,10:")


def collect(frames=560, script=SCRIPT, speed_poke: int | None = None,
            tag: str = ""):
    j = OUT / f"playermodel{tag}.json"
    ram = OUT / f"playermodel{tag}.ram"
    poke = "" if speed_poke is None else f"0040={speed_poke}@315-{frames - 1}"
    probe.run(frames, script, j, ramdump=ram, watch="0040,0045,0100", poke=poke)
    doc = json.loads(j.read_text())
    blob = ram.read_bytes()
    frames_ram = [blob[i * 2048:(i + 1) * 2048] for i in range(len(blob) // 2048)]
    return doc, frames_ram


def check(doc, rams, seed: int, last: int, variant: str = "", verbose=True):
    """Seed the model at `seed` and free-run it to `last`. Returns (ok, msg)."""
    fr = doc["frames"]
    m = Model(rams[seed])
    if variant:
        apply_variant(m, variant)
    bad = []
    for i in range(seed + 1, last + 1):
        # buttons HELD during frame i's own update: $81BF runs at $80A4, before
        # the state machine at $80AA, and $07 survives to the $80B5 sample.
        m.tick(rams[i][HELD], rams[i][SPEED], rams[i][OPTIONS])
        got, want = m.snapshot(), actual(rams[i])
        if got != want:
            diff = {k: (got[k], want[k]) for k in want if got[k] != want[k]}
            bad.append((i, diff))
            if len(bad) >= 4:
                break
    n = last - seed
    if not bad:
        return True, f"free-ran {n} frames from seed {seed}: every field exact"
    f0, d0 = bad[0]
    keys = ", ".join(f"{k} model={a} rom={b}" for k, (a, b) in list(d0.items())[:4])
    return False, (f"free-ran {n} frames from seed {seed}: FIRST DIVERGENCE at "
                   f"frame {f0} ({keys})")


VARIANTS = {
    "no-subpixel": "drop the $0340/$0380 accumulator, step whole pixels",
    "x-max-220":   "believe the recon's X clamp of 220 instead of the ROM's $F0",
    "diag-norm":   "normalise diagonals (halve the step when two axes move)",
    "no-down-priority": "let UP win over DOWN when both are held",
    "no-y-precheck": "clamp Y after the add instead of pre-checking at $A052",
    "ring-always": "get the ring length wrong (23 instead of $18)",
    "opt-lag-12":  "trail the Options by 12 ring entries instead of 11",
}


def apply_variant(m: Model, name: str):
    """Deliberately wrong models, so the checker can be SEEN to fail.

    docs/knowledge/03: a check that has never gone red is not evidence. Each of
    these is a mistake a reasonable person would actually make.
    """
    if name == "no-subpixel":
        m.whole_px = True
    elif name == "x-max-220":
        m.X_MAX = 220
    elif name == "diag-norm":
        m.diag_norm = True
    elif name == "no-down-priority":
        # the ROM tests DOWN first and only falls through to UP when DOWN is
        # blocked by the floor pre-check ($A054 BCS $A063). Testing UP first is
        # the obvious alternative reading of the same two ifs.
        orig = m.tick
        def tick(held, lvl, nopt, _o=orig):
            if (held & U) and (held & D):
                held &= ~D & 0xFF
            _o(held, lvl, nopt)
        m.tick = tick
    elif name == "no-y-precheck":
        # drop the PRE-checks at $A052/$A06C and clamp afterwards only. The two
        # are NOT equivalent: without the pre-check the sub-pixel byte keeps
        # moving while the ship sits against the wall.
        m.Y_MAX_PRE = False
        orig = m.tick
        def tick(held, lvl, nopt, _m=m, _o=orig):
            s = _m.step16(lvl)
            if held & D:
                v = ((_m.y << 8) | _m.yf) + s
                _m.yf = v & 0xFF
                hi = (v >> 8) & 0xFF
                _m.y = hi if hi < _m.Y_MAX else _m.Y_MAX
                _o(held & ~(D | U) & 0xFF, lvl, nopt)
                return
            _o(held, lvl, nopt)
        m.tick = tick
    elif name == "ring-always":
        m.RING_LEN = 23
    elif name == "opt-lag-12":
        m.OPT_LAG = 12
    else:
        raise SystemExit(f"unknown variant {name}")


def one_run(name, doc, rams, seed, negative):
    fr = doc["frames"]
    # The window has to be one where the ship is alive and under control the
    # whole time, or the comparison is not about movement at all.
    play = [i for i, f in enumerate(fr)
            if f["mode"] == 5 and f["w_0100"] == 1 and i >= seed]
    if not play or play[0] != seed:
        raise SystemExit(f"seed frame {seed} is not a live gameplay frame")
    last = seed
    for i in play:
        if i == last + 1 or i == seed:
            last = i
        else:
            break
    rng = range(seed, last + 1)
    xs = [rams[i][P_X] for i in rng]
    dirs = sorted({rams[i][HELD] & 0x0F for i in rng})
    print(f"--- {name} ---")
    print(f"  window      : frames {seed}..{last} (mode 5, $0100 == 1 throughout)")
    print(f"  speed $40   : {sorted({rams[i][SPEED] for i in rng})}   "
          f"options $45 : {sorted({rams[i][OPTIONS] for i in rng})}")
    print(f"  X reached   : {min(xs)}..{max(xs)}   "
          f"Y reached : {min(rams[i][P_Y] for i in rng)}.."
          f"{max(rams[i][P_Y] for i in rng)}")
    print(f"  sub-pixel $0380 distinct values: "
          f"{len({rams[i][P_XF] for i in rng})}")
    print(f"  directions  : {', '.join('$%X' % d for d in dirs)}")
    fails = 0
    vacuous = set()
    ok, msg = check(doc, rams, seed, last)
    print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
    fails += 0 if ok else 1
    if negative:
        print("  negative controls -- each MUST go red in at least one run:")
        for vname, why in VARIANTS.items():
            vok, vmsg = check(doc, rams, seed, last, variant=vname)
            if vok:
                vacuous.add(vname)
            tag = "vacuous here" if vok else "PASS(red)"
            print(f"    [{tag:13s}] {vname:17s} {why}")
            print(f"        {vmsg}")
    print()
    return fails, vacuous


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=560)
    ap.add_argument("--seed", type=int, default=325)
    ap.add_argument("--speed", type=int, default=5,
                    help="speed level to force in the second run")
    ap.add_argument("--negative", action="store_true",
                    help="also run the deliberately-wrong models")
    args = ap.parse_args()

    print("=== THE PLAYER MODEL, FREE-RUN AGAINST THE CARTRIDGE ===")
    fails = 0
    doc, rams = collect(args.frames, SCRIPT)
    f, vacA = one_run("run A: natural speed ($40 untouched), all 8 directions",
                      doc, rams, args.seed, args.negative)
    fails += f
    doc, rams = collect(args.frames, SCRIPT_FAST, speed_poke=args.speed,
                        tag="_fast")
    f, vacB = one_run(f"run B: $40 forced to {args.speed} "
                      f"(step = {min(args.speed + 2, 16) * 128 / 256:g} px/frame), "
                      f"into both X walls",
                      doc, rams, args.seed, args.negative)
    fails += f
    if args.negative:
        dead = vacA & vacB
        print(f"  [{'FAIL' if dead else 'PASS'}] every negative control was seen "
              f"to go red in at least one run "
              f"({len(vacA & vacB)} never fired: {sorted(dead)})")
        print(f"  note: {sorted(vacA - vacB)} are VACUOUS at speed level 0 -- at "
              f"$40 = 0 the step is\n        exactly $0100 = 1.00 px/frame, so "
              f"the sub-pixel byte never moves and the\n        X clamp is never "
              f"reached. That is why run B exists.")
        fails += len(dead)
    print(f"  {'ALL CHECKS GREEN' if not fails else str(fails) + ' PROBLEM(S)'}")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
