# W124 IMPL -- THE RESULT SCREEN LOGIC: phase machine, tally, banner, slot free

status: **IN PROGRESS** (set DONE before commit).
wave: 124. role: IMPL (the sole writer to `games/ddpdoj/src/` this wave).
date: 2026-08-07.
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
