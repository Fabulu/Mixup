# W62 IMPL — S1: MAKE STAGE 1 END

status: **IN PROGRESS**

wave: 62. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: `docs/worklog/ddpdoj/49-recon-stage-end.md` (recon), plus 48 (boss),
57 (M1 midboss death), 61 (I2 items).

## GOAL

Stage 1 must END. Recon 49's cheap path: the boss's `$22(a5) = $2A30` =
10,800-frame hard timeout at `$294F3C` -> `$294DD4` -> the §3.2 chain ->
`$242952` -> object type 6 -> `$25FD0C` stage counter -> `$25FD38` rebuild.

## LOG

(appended as findings arrive)

- **[M] STAGE 1 ENDS.** Driven from the shipped bundle's own seed with fire
  HELD, `tools/w62stageendgate.mjs`, **24 of 24 assertions green**:

  ```
  lf 7870   the boss's handler $292902 runs for the first time (W57's wall)
  lf18669   $294F3C spends the 10,799th decrement of $22(a5) -> $294DD4
  lf18670   D-script 6 starts; seven states 0..6 at 18670/18671/18703/18923/
            18999/19008/19016
  lf19143   $293E16 jsr $2595E8 -- $812E06 := 1        (474 frames, NOT 32)
  lf19144   $25962E returns C=1; $242952 runs ONCE; object TYPE 6 created
  lf19145   $25FCFA queues $813144 (= 7) for the DEFERRED kill
  lf19147   the background object LEAVES the object table
  lf19216   $25FD0C: $813092 0 -> 1, $813096 0 -> 4
  lf19217   $25FD38: a NEW background object, $813144 7 -> $B
  lf19218   the distance clock is ZERO; the new object's first frame asks for
            STAGE 2's column stream $228658 -- no wave has ever exported it
  ```

- **[M] RANK: NO RANK WRITE BECAME REACHABLE.** `$81309E` 53, `$81B646` 0,
  `$81B65C` 0, `$81B65E` 0 -- digit-identical at the boss's arrival and after
  the rebuild. `$81B64A` is 2,112 on both, unmoved from W61's figure.
- **[M] RECON 49 3.1 SAID 32 FRAMES; IT IS 474.** `$293DC6`'s init leaves
  `$2(a4) = 0`, not 6, so the state-6 arm is not taken on the arming frame and
  `$A(a4)` is rewritten to `$80` twice before state 6 is reached.
- **[M] RECON 49 5.3 PRICED THE DEVIATION AT ONE SHORT-CIRCUIT; IT IS TWO**
  (`$28DE5C` and `$28D6FC`), and a THIRD exit is left unsatisfied on purpose
  rather than faked (state 4 waits on `$28E7F8`, which is not ported).
- **[M] `$294DD4` STARTS THREE A3 SCRIPTS, NOT ONE** -- 4 and 5 (the two side
  parts falling away) as well as 6.  A port that registered only D-script 6
  stops on the frame the boss dies.
- **[M] THE PLAYER HAS A STAGE-CLEAR PATH AND IT WAS A THROW**: `$249508 tst.w
  $812972 / bne $24A3A2`.  `$812972` has two writers, `$242958`'s neighbour
  `$242968` and `$28D682`, so W62 is the first wave that could set it.
