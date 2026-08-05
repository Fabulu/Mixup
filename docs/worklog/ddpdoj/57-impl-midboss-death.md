# W57 / M1 — IMPL: the midboss's DEATH (`$26C1C2`/`$26C1CA`/`$26C20C`)

status: **IN PROGRESS**

wave: 57 (DaiOuJou M1). role: IMPLEMENTER, SOLE writer to `games/ddpdoj/src/`.
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`–`$2Axxxx`) unless the line says otherwise.

`[M]` = measured by me this session. Anything else is cited by document.

## THE BRIEF

W56 measured, on the LIVE deployed build, that killing the stage-1 midboss stops
the port with `UNPORTED $26C1C4` — enemy type `$1C`'s init stub, whose only
enqueuer in build B is the midboss's own death (`$26B7E0`/`$26B7E2`). L3/W51 gave
the beam the ability to kill and thereby walked the port into a path nothing had
executed in 25 waves. Because the throw is on an EARLIER frame than
`$26B73A jsr $261100`, the scroll speed-restore is now unreachable, not merely
unexercised.

Fix: a ROM window at `$26C1C0`, port `$26C1CA` and `$26C20C`, and — the
load-bearing part — **a scenario that actually kills the midboss**, in the gate.

## LOG (appended as findings arrive)

- opened.
- **[M] REPRODUCED LOCALLY, to the frame W56 measured on the deployed page.**
  The port driven from the shipped bundle seed with fire held stops at
  **step 1766 / lf3766 / clk 232** with `UNPORTED $26C1C4`, out of
  `spawn.js initDispatch` -> `processDeferred` -> `runSpawnWalker`. W56's live
  RUN C stopped at lf3766/clk 232. Same frame, same stack.
- **[M] THE BRIEF'S ONE WRONG PREMISE, and it is the reason the fix is small.**
  W56 §2.4 (and the brief, quoting it) call `$26C20C` "a palette/gradient write
  into PGM register space `$9000xx` that the port does not model". **`$900000`
  is the port's OWN BG VIDEORAM.** `$240D92 lea $900000,A0 / adda.w D0,A0 /
  move.l D4,(A0)` with `D0 = ((row<<6)+col)*4` is `src/background.js
  writeMapLong`, ported since W13, and `BgVram.setLong` is its store. `$26C20C`
  addresses the same array with the same arithmetic out of registers:
  `adda.w #$100,A2` is the ROW stride and `adda.w #$4,A0` is the COLUMN stride.
- **[M] AND ITS SOURCE IS THE STAGE'S OWN COLUMN STREAM.** `$26C220 lea
  $227AF8,A1` is column **224** of the W13 window `$225B78` (248 columns x 36 B;
  $225B78 + 224*36 == $227AF8 exactly) and the 23 x 9 longwords the two `dbra`s
  copy are 828 B == 23 columns x 36 B, exactly. Stage 1's script ends at clock
  `$0344` = 836, i.e. ~209 columns at four clocks each, so **columns 224..246
  are past the end of the scrolled map** -- a dedicated 23-column art block, and
  this routine is what puts it on the screen. So the blit is PORTED, not noted.
- **[M] EXTENT PINNED FROM BOTH ENDS, and $50 would have been six bytes too
  wide.** `$26C1F0`'s flags word is `$8000` (bit 15 SET), so `$2637A2` takes the
  LONG form: 28 table bytes, and `$26C1F0 + 28 == $26C20C`, which IS the
  handler. The window is `$26C1C2 + $4A`, not the `$26C1C0 + $50` the
  diagnostic proposed -- `$50` claims six bytes of `cmpi.w #$105,$8130CE`.
- **[M] READ PAST THE APPARENT END.** `$26C264 rts` ends the handler and
  `$26C266 move.w #$6,($4,A5) / rts` is type **$12**'s init stub
  (`$267824 + 8*$12 == $2678B4 -> ($26C266, $26C3E2)`), a different type. There
  is nothing to fall through into.
- **[M] THE FIX WORKS AND THE SPEED-RESTORE IS REACHED.** Fire held, 3,000
  steps, no throw. `$813180/$813182/$813184 := 1/$20/$20` on **lf3830**
  (`$26B73A jsr $261100`), consumed and cleared on lf3831 (`$2612B4`), and the
  background object's `($1C,A5)` goes **`$0008` -> `$0020`** on lf3831.
- **[M] THE CRAWL, MEASURED BOTH WAYS FROM THE SAME SEED:**

  | | fire HELD (he dies) | fire SUPPRESSED (control) |
  |---|---|---|
  | `($1C,A5) = $0008` from | lf3675 (clk 231) | lf3675 (clk 231) |
  | ...to | **lf3831** | lf4251 (clk 240) |
  | frames of 0.125 px/f | **156** | **576** |
  | frames per clock tick after | **16** (0.500 px/f) | 64, until clk 240 |

  The control's 576 is W56's ROM arithmetic (9 ticks x 64 f) and its live
  measurement (lf3687..lf4263) to the frame. The held run is the same crawl
  ended **420 frames early by the kill**, which is the 4x speed-up `$26B73A`
  pushes -- not an unfreeze.
- **[M] THE TYPE-$1C OBJECT LIVES AND LEAVES BY THE ARM THE LISTING GIVES IT.**
  It becomes live at **lf3767 / clk 232** (the frame the port used to throw on)
  and frees itself at **lf4271 / clk 261**. 261 == `$0105`, i.e.
  `$26C20C cmpi.w #$105,$8130CE / jmp $263762`, measured rather than assumed.
- **[M] THE BLIT LANDS: 207 longwords, and the WRAP is real.** Differencing the
  port's `BgVram` across the death frame: exactly **207** longwords changed, in
  **23 columns -- 47..63 and 0..5** (the `andi.w #$FF` wrap), **9 rows each**.
  Spot-checked at both ends against the cartridge: col 47 row 0 == `$32CE002A`
  == `rom.u32($227AF8) + $32A90000`, and col 5 row 8 == `$3342002E` ==
  `rom.u32($227AF8 + 206*4) + $32A90000`.
- **[M] WHAT HAPPENS INSTEAD OF THE THROW, and the new frontier.** Fire held
  from the shipped seed, the run now reaches **lf7870 / clk 488** and stops at
  `UNPORTED $292902` -- the **stage-1 BOSS's** handler, which W36 left as a
  named throw on purpose ("the 44th is the stage-1 BOSS `$292902`, which stays a
  loud named throw"). That is **4,104 logic frames further** than the
  `$26C1C4` wall, and it is not this wave's. Nothing else throws in between.
