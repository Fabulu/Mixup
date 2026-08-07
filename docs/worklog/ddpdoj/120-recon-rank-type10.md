# 120 -- RECON: object type 10 (RANK) `$260794` vs the port's inline rank work

status: **IN PROGRESS**

started: 2026-08-07. wave: 120. role: RECON (READ-ONLY; the only tree file I
write is this one; throwaway scripts live in `.scratch/w120/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address
is build B. instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address ==
file offset, big-endian), capstone `CS_ARCH_M68K` / `CS_MODE_M68K_030`.

`[M]` = measured by me, this session, from the image or this tree.

THE QUESTION (from the brief): object type 10 = RANK (`$260794`, priority
`$1F`, runs FIRST every frame in the top-level object driver `$240F62`) is
UNPORTED (W105 sec 4.1). Does the port's INLINE rank arithmetic in `src/score.js`
(`bombRankFeed`, the rank accumulator writes) substitute for the rank object's
per-frame work (`$2608D2`), or is there a GAP that diverges every frame?

## 0. PREMISE CHECK

opened items, to be closed below:

- [ ] The 119-strategic-plan.md the brief cites does NOT EXIST on disk
      (`docs/worklog/ddpdoj/119*` -> no file). The "architect" and its "open"
      item are inherited from CATCHUP sec 7c's prose, not from a file. This
      recon proceeds off the question as stated; the plan is a phantom reference.
- [ ] Verify 38-recon sec 3.1's transcription of `$2608D2` by reading it myself
      (the #1 correctness item: the brief says check the premise).
- [ ] Verify `$260794`'s state machine and that `$25FF7A` is the state-1 body
      that reaches `$2608D2`.
- [ ] Confirm whether ANY port code writes `$81309E` (the rank output byte) or
      advances `$8130C6` (the rank clock).

## LOG (appended as findings arrive)

- opened IN PROGRESS. Read CATCHUP (7b/7c), HANDOVER, W105, recon 71, recon 38,
  src/score.js, src/hud.js (full), src/scheduler.js (sec around $81309E),
  src/palette.js (sec around $260794).
- PREMISE ITEM 1: `119-strategic-plan.md` does not exist on disk. The brief's
  citation is to a phantom. The question itself is well-formed and proceeds.
