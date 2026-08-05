# W64 IMPL — B2: THE BOMB `$2498E2`

status: **IN PROGRESS**

wave: 64. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: the BOMB — `$249814`'s zero-hyper-stock arm — **before** the hyper,
against recon 38's own ordering. The owner's blocking item
(`39-OWNER-visible-play-before-sound.md`: *load the page, fly, shoot, laser,
BOMB, kill a visible enemy*).

`[M]` = measured by me this session.

## LOG (appended as findings arrive)

- opened.
- read `63-impl-B1`, `38-recon`, `39-OWNER`, `61-impl-I2`, `54-impl-E5b`.
- **THE BRIEF'S PREMISE HOLDS on the fork**: `$249864 move.w (A1),D1 / $249866
  beq $2498E2` with A1 = `$81B65C`. `[M]` the shipped seed has
  `$81B65C = 0`, so **the BOMB arm is the default**, as the brief says.
- **`($24,A6)` = `$81040A` IS THE BOMB STOCK AND `[M]` THE SEED HAS 3.**
  The word at `$81040A` is `$0303`; `$2498E2 tst.b` reads the HIGH byte, `$03`.
  P2's `$81046C` is `$0000`.
- **RECON 38 §1.2 IS WRONG ABOUT `$81B6FE`.** It calls it "a bomb is ALREADY
  RUNNING". `[M]` its only two absolute writers in `$230000..$2B0000` are
  `$28732E move.w #$1` and `$2873A4 clr.w`, both inside `$287324`/`$287340` --
  **the HYPER's flash record**, whose only callers are `$285A38` and `$285A96`,
  i.e. behind W63's throws. So the refusal cannot fire in this port.
- **THE BOMB IS A `$811F72` RECORD.** `$249A4A move.w D2,(A1)` with A1 =
  `$811F72` (loaded at `$249902` and `[M]` not clobbered: every callee between
  either does not touch A1 or saves it -- `$24150A`'s `movem.l d0/a0-a1`).
  So the bomb ALLOCATES record 0 of the 45 x `$30` table `src/damage.js` calls
  "the BOMB-LASER's record", and `$249A32 bset #$6,$1(A6)` is the second guard
  of `$24560A`. **Both of `bombLaserBlock`'s guards go true on the frame the
  bomb is pressed**, so the bomb cannot be shipped without `$24560A`.
- **`$255DD8` (type-5 call #7) IS THE BOMB'S DRIVER**, and `$2564F0` its
  teardown: it runs `$2877D0`/`$2877FE` (**THE CHAIN RESET**), clears
  `$8103E7`/`$810449` bit 6 and WIPES all 45 records.
