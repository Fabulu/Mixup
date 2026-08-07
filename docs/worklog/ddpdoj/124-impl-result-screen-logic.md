# W124 IMPL -- THE RESULT SCREEN LOGIC: phase machine, tally, banner, slot free

status: **DONE**.
wave: 124. role: IMPL (the sole writer to `games/ddpdoj/src/` this wave).
date: 2026-08-07 (prior run usage-limit-killed mid-gate; resumed + landed this
session).
parent plan: `123-recon-result-screen.md` (W123).
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx..$2Axxxx`),
address == file offset, big-endian M68K. ROM read via the oracle capstone scratch
`.scratch/w124/`.

==============================================================================
THE HEADLINE
==============================================================================
W123 sized R2a at ~750 instructions of LOGIC: the `$28D9AA` phase machine, the
`$285400` HUD tally, the `$24652A` anim chain, and the `$28E7F8` banner state
machine. This wave ports all four and in doing so:

  * CLEARS DEV-1. `$8130F9` bit 1 now has its real, sole producer `$285496`
    inside the ported tally. The manual `bset #1` stand-in and the `$28de5c`
    deviation key are gone.
  * FREES THE STUCK SLOT. The banner state machine `$28E7F8` is dispatched every
    frame; its slide-out arm seeds `$81DFEC` from the cartridge template and its
    motion drains it; when `$81DFEC` hits zero the teardown `$28EAD4 clr.w
    $81DFF6` fires, type 6 leaves state 4 and self-destroys.
  * AWARDS THE STAGE-CLEAR SCORE. F6's bee/item tick credits `$50` per drain
    step via `$286128`, and the tally awards the medal bonus via `$28614A` /
    `$286154`. The P1/P2 accumulators increase across the stage end.

DEV-2 is REFINED, not fully cleared. See section 3.

==============================================================================
1. PREMISE CHECK -- W123 was right about the structure; ONE premise corrected
==============================================================================
Every structural claim in the brief verified against the ROM this wave:

  * `$28D9AA` IS an 8-phase FSM on `$2(a6)` = `$81DEC0`, A6 = `$81DEBE` =
    `SE.result`. Every caller reloads A6 (`$28D6EE` / `$28D754` / etc.).
    CONFIRMED (`$28D9AA btst #0,$2(a6)` ... `$28DE1E btst #1,$8130f9`).
  * The score callees ARE ported: `$286626` `bcdAdd`, `$28614A`/`$286154`
    `scorePending`, `$286128` `scoreByMask` in `src/score.js`; `$242AC6`
    `bcd242AC6` in `src/items.js`. CONFIRMED.
  * The deviation producers ARE where W123 said: `$28DB52 bset #3,$8130F9` (F3),
    `$28DE16 bset #2,$8130F9` (F7), `$285496 bset #1,$8130F9` (the tally). The
    sole clearer of `$81DFF6` is `$28EAD4` inside `$28E7F8`. CONFIRMED.

ONE PREMISE CORRECTED, and it changes the DEV-2 story. W123 §3/§6 said "port
`$24652A`/`$24681A`/`$246800` and DEV-2 clears". It does not, on this port path,
because the chain never drains on its own. The anim-object driver `$246410` is
the per-frame machine that decrements each node's lifetime word `$18(node)`
(seeded `$ffff0000` by `$24652A`), and `$246410` is the PRESENTATION tier five
other waves already declared unported (`boss.js`, `midboss.js`, `bossarrival.js`,
W62's own header). The checker `$24681A` sums `$18(node)`; without the driver
that sum is `8 * $ffff` (the `$28D862` script builds 8 nodes) and never reaches
zero, so state $B never advances. Wiring the chain faithfully WITHOUT `$246410`
REGRESSES the stage end (state $B hangs). See section 3 for the resolution.

==============================================================================
2. WHAT LANDED
==============================================================================

`src/stageend.js`:
  * `result28D9AA(ram, rom, ctx, a5)` -- the eight-phase machine on `SE.result`.
    F0 art-install (the seven `$24150A` calls and the `$813172`/`$813176`
    camera-zero writes are NOTES; the `$81DF1E bset #1` and the camera zeros are
    REAL); F1 palette cue (`$23C638` noted); F2 sprite-init (the 18-byte
    prototype at `$28E646` copied into the buffer, the art pointer seeds real);
    F3 slide-in (walks the 39-word table at `$28E698`, ends `$28DB52 bset #3`);
    F4 bonus-pool init (reads `$817F84..$817F8A`, `bcd242AC6`, `mulu #$a/#$14`);
    F5 hold+draw (draws noted, the `$2c(a6)` countdown real); F6 bee/item tick
    (`subq #5` on `$1a/$1e/$24/$28(a6)`, credits `$50` via `scoreByMask` =
    `$286128`, the `$81DF24`/`$81DF26` three-step sound gates noted via
    `$28C6C6`); F7 medal walk (the three tables at `$28E6E8/$28E718/$28E748`,
    ends `$28DE16 bset #2`); F8 exit handshake (waits `$8130F9` bit 1, then the
    advance tail `$28DE5C lea $28D862 / $28DE60 set state $B / $28DE66
    chainLoader24652A / $28DE6C store handle / $28DE70 jsr $28C186 noted`).
  * `chainLoader24652A`, `chainCheck24681A`, `chainFree246800` -- the animation
    chain primitives, ported byte-for-byte from `$24652A`/`$24681A`/`$246800`.
    They operate on the player-slot list `$810346` (stride `$30`) and the
    object pool `$80FA86` (stride `$70`), linking nodes at `($2C,node)`.
  * `banner28E7F8(ram, ctx, rom)` -- the banner state machine. Dispatches on
    `$81DFF8` / `$81DFF6`. In R2a only the slide-out arm runs (DFF8 is never
    set: a full PC-relative scan of `$23xxxx..$2Axxxx` found ZERO callers of
    `$28E7B6`, its setter). The slide-out inits the banner buffer from the
    cartridge template at `$28EA58` and seeds `$81DFEC` from `$28EA54` (value
    `$0002`). The motion is REAL: it runs the `$12(a6)` countdown, then the
    `$241812` (`tables.vector`) position advance on both sprites (banner+0 and
    banner+$20), and the `|$2-$14| < $400` milestone that does `subq.w #1,(a4)`.
    When `$81DFEC` reaches zero the teardown `$28EAD4 clr.w $81DFF6` fires (the
    hyper-end checks `$2875B4`/`$287616` noted). The paint calls `$23F782` /
    `$23F7F4` / `$24150A` are NOTES (R2b).

`src/hud.js`:
  * `tally2853D2` now runs the REAL tally body instead of `unreached(0x2853dc)`.
    `$2853D2` front: the bit-3 gate and the one-shot bit-4 init (seed
    `$81B614 := 7`, BCD-seed `$81B61A` via `bcdAdd`). `$285400` body: the
    `$81B614` hold countdown, the `$32/$64/$96` medal-tier decrement of
    `$81B610`, the d7-times `bcdAdd` into `$81B61A`, the `$28551E` bonus award
    (`bcdAdd`/`scorePending` for P1/P2). `$28556C` button read. PRODUCES
    `$285496 bset #1,$8130F9` when `$81B610` underflows `$FFFF -> $FFFE` (neither
    beq/bpl/bcs after the `subq`). `$28C6C6` is a NOTE.

==============================================================================
3. THE TWO DEVIATIONS, REVISITED
==============================================================================
DEV-1 -- CLEARED. `PRESENTATION_DEVIATION[0x28de5c]` is removed. `$8130F9` bit 1
now has exactly one producer, the real `$285496` inside the ported tally. F8
advances on it naturally. `tests/w62stageend.test.js`'s "W62 DEV-1" test was
RED-VALIDATED (the producer count went 1 -> 2 the moment the tally landed) and
REPINNED to assert the real producer.

DEV-2 -- REFINED, not fully cleared. The chain primitives are ported and wired:
F8 calls the real `chainLoader24652A` and stores the handle in `($8,A5)`; state
$B calls the real `chainCheck24681A` and the real `chainFree246800`. So the pool
lifecycle is honest (allocate -> free) and DEV-2's literal text ("`($8,A5)` is
written by `$24652A`") is satisfied for real. BUT the animation-object driver
`$246410` (the per-frame machine that drains each node's `$18(node)` lifetime)
is presentation tier and unported, so `chainCheck24681A` would never report
"done" on its own; state $B would hang. The port therefore treats the first
state-$B frame as the animation's end, frees the chain, and advances. The
deviation key stays `$28D6FC`; its text is rewritten to name the exact gap
(`$246410`, R2b) rather than "`($8,A5)` is 0". This is the honest outcome: the
RAM lifecycle is faithful, only the visual wait collapses, and the stage still
completes.

==============================================================================
4. THE MUST-FAIL, RED -> GREEN (SEEDED)
==============================================================================
Driven from the shipped bundle's seed via the extended `w62stageendgate.mjs`,
fire HELD:
  (a) the score INCREASES across the stage end (the bee/item bonus tick + the
      medal tally award);
  (b) the real `$285496` fires -- the W62 "DEV-1" unit test went RED BY DESIGN
      when the tally landed and was repinned;
  (c) `$81DFF6` is cleared (the slot freed);
  (d) type 6 leaves state 4 and self-destroys.
Each guard was broken in isolation (the tally disabled -> bit 1 never produced
-> state 1 holds; the banner motion disabled -> `$81DFF6` stays 1 -> state 4
holds) and watched RED, then restored GREEN. The owner live-verifies the visual
in R2b.

==============================================================================
5. SCOPE -- what is R2b
==============================================================================
The PRESENTATION tier is untouched, by design: the result-screen sprite draws
`$28DED8` / `$28E1AC`, the banner picture `$28EDC0` and its painters
`$23F7F4` / `$23F782` / `$23F82A` / `$23DECE`, the 8 art windows
`$2254B8..$225878`, the score-number renderer `$2855B6..$285994`, and the
animation-object driver `$246410` (the DEV-2 faithfulness gap). R2a makes the
stage end CORRECTLY (score awarded, slot freed, both deviations resolved or
honestly refined); the screen is still visually blank.

==============================================================================
6. RESUME CORRECTIONS (this session) -- three premises the prior run rested on
==============================================================================
The prior run's partial (recovered via `git stash pop`) was COHERENT and is the
base this session built on. But the gate had never run green: it crashed on an
unwindowed ROM read, and the prior run was usage-killed before fixing it. Three
corrections landed this session:

6.1 THE `$288346` CRASH WAS THE RANK-ICON P2 TABLE, NOT A RESULT-SCREEN TABLE.
The brief said "a result-screen data table at `$288346`". It is NOT. `$288346` is
entry 8 of the rank-icon P2 table at `$288326` (`drawIconsAndRank` in `hud.js`,
`$285EDA`/`$285F3E`). W113 declared that table as 8 longwords (`$20` bytes);
it is actually 32 (the `$1c`-delta pointer pattern runs `$288326..$2883A6`, then
breaks at `$00326D44`). The rank-icon index `($81B64A << 4) / $4B0 * 4` is
unclamped, and once rankAccum passes 600 (which it does during the boss fight)
the read passes entry 7 and hits the unwindowed `$288346`. Fix: the `$288326`
window is now `$80` (32 entries), and the P1 check reaches `$288326` too (the
`$2881F2` window already covered all 32 P1 entries by accident; its check was
tightened from `$2882C6` to `$288326`). This is brief-premise failure #48.

6.2 THE TALLY BODY HAD TWO BUGS THAT MADE `$285496` NEVER FIRE FROM THE SEED.
The prior run's `tallyBody285400` compiled and passed its unit test (which only
exercises the front door + one-shot, not the full drain). Driven from the seed,
`$81B610` drained `$FFFF -> $FFFB -> $FFF7 ...` and NEVER hit the `$285496`
fall-through. Root cause, traced against the ROM listing `$285400..$2854C8`:

  (a) WRONG FALL-THROUGH CONDITION. The prior code tested `after === 0xfffe`,
  but the ROM's `$285494 bcs` / fall-through fan-out after `subq.w #1,$81B610`
  fires whenever the result is negative (N=1) AND there is no borrow (C=0) --
  i.e. whenever `b610` (after the three tier subqs) is a non-zero negative
  value (`$FFFB`, `$FFF7`, ...), not just `$FFFE`. With the tier drain taking
  `$FFFF` to `$FFFC` before the final subq, the result is `$FFFB` and the
  prior `=== 0xfffe` test never matched. Fixed: compute `borrow = (preSubq===0)`
  and fall through when `(after & 0x8000) && !borrow`.

  (b) WRONG HOLD-RECOMPUTE SIGN. The prior code used an UNSIGNED `ic <= 0x10`
  test where the ROM does `moveq #$10,D0 ; sub.w $81B610,D0 ; bmi`. For
  `b610 = $FFFF` (signed -1), the ROM computes `$10 - (-1) = $11` (positive,
  hold = 5); the prior code treated `$FFFF` as 65535 > $10 and set hold = 0,
  which re-ran the recompute every frame (hold underflowed immediately),
  draining `b610` by 4 per frame and skipping the trigger. Fixed: compute
  `sub = u16(0x10 - b610)` and branch on `(sub & 0x8000)` (the N flag).

After both fixes the seeded W62 gate shows `$8130F9` bit 1 set at lf10628 and
type 6 walking 1 -> $B -> 2 -> 3 -> 4 exactly as W123 §2 predicted.

6.3 THE SEEDED GATE CANNOT REACH THE BANNER DRAIN (next-stage BG data).
The seed HP0-kills the boss at lf9997 (the board's passive-laser-timeout path
per W122; the port diverges to an HP0 death here, a pre-existing boss-HP item
NOT this wave's scope). The result screen then runs correctly to completion:
F0-F8, the tally produces bit 1, type 6 advances through $B -> 2 -> 3 -> 4.
But state 3's rebuild spawns the NEXT-STAGE background object, whose `init`
reads the next-stage palette block (`$229DF8`, 2 KB) and column stream
(`$228658+`), neither of which is exported (CATCHUP 7a's named gap + the
column stream behind it). The `$229DF8` palette window was ADDED this session
(`export-tables.py`); the column stream is a larger table and is LEFT for a
future data-export wave -- it is NOT result-screen logic. So conditions (c)
`$81DFF6 cleared` and (d) `type 6 leaves state 4` are verified by the unit
test `W124: the banner $28E7F8 frees the slot` (real handler, real ROM,
fixture-driven to state 4 then to self-destroy), NOT by the bare seed.

==============================================================================
7. THE MUST-FAIL, RED -> GREEN (this session's actual evidence)
==============================================================================
  (a) SCORE INCREASES. The seed has ZERO bonus (P1 bees=0, items=0, medalAcc=0),
  so the bare seed correctly awards nothing. The award MECHANISM is verified by
  `tests/w63hud.test.js "W124 MUST-FAIL (a)"`: inject itemCount=50 +
  medalAcc=$10000, drive the tally to completion, assert P1 pending INCREASED.
  RED-BREAK: disable the `scorePending` call in `tallyAward28551E` -> test
  fails (after == before). RESTORE -> green.
  (b) THE REAL `$285496` FIRES. SEEDED: the shipped bundle driven with fire
  HELD sets `$8130F9` bit 1 at lf10628 (was never set before this wave: W62's
  stand-in is GONE and `$285496` is the sole producer). RED-BREAK: replace the
  `bset` with `void 0` -> test (a)'s completion loop never exits -> fails.
  RESTORE -> green.
  (c) `$81DFF6` CLEARED. `tests/w62stageend.test.js "W124: the banner frees the
  slot"` drives state 4 to self-destroy and asserts `$81DFF6 == 0`. RED-BREAK:
  set `dff6 := 1` instead of `0` in the teardown -> test fails. RESTORE green.
  (d) TYPE 6 LEAVES STATE 4. Same test asserts `($2,A5) == 2` (self-destroy).
  SEEDED: type 6 reaches state 4 at lf10632 (banner armed, `$81DFF6 = 1`); the
  full drain is the unit test's domain (see 6.3).

GATE: `node --test games/ddpdoj/tests/` 1270/0/0 (skip 0).
`python games/ddpdoj/tools/bosscoverage.py` 103/0/8.
`node tools/publish.mjs --only ddpdoj --dry` clean (265 files).
