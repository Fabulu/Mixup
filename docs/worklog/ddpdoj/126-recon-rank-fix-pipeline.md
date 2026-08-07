# 126 -- RECON: the RANK-fix gauge/stock pipeline (port plan)

status: **DONE**

started: 2026-08-07. wave: 126. role: RECON (READ-ONLY on `src/`; the only tree
file I write is this; throwaway scripts live in `.scratch/w126/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address
below is build B. instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin`
(address == file offset, big-endian), capstone `CS_ARCH_M68K` / `CS_MODE_M68K_030`.

`[M]` = measured by me, this session, from the image or this tree.

THE JOB (from the brief): map the gauge/stock pipeline that feeds the rank
recompute, so the RANK-fix impl wave (W120's verdict) can be sized. W120 found
rank FROZEN (object type 10 `$260794`/`$2608D2` not in dispatch; `$81309E` never
written). W120's ordering constraint: close the gauge/stock pipeline FIRST, THEN
port object type 10, else the recompute unmasks inert upstream errors
(frozen -> wrong-and-rising rank). This recon MAPS that pipeline link by link
and produces a port plan with wave sizing; it does NOT implement.

## 0. PREMISE CHECKS

- [x] **W120 exists and is sound.** `docs/worklog/ddpdoj/120-recon-rank-type10.md`,
      DONE. I re-disassembled `$2608D2..$260A1E` `[M]` and reproduce W120's
      transcript instruction for instruction (formula, clamp, fan-out).
- [x] **Recon 71 sec 4.2's chain is real but its middle link is mis-framed by the
      brief.** The brief writes the chain as `$287682` -> `$2530CA` -> `$285A62`.
      `[M]` `$285A62` is NOT reachable by porting the pipeline alone: it lives
      INSIDE the hyper-ACTIVATION body `$285A24..$285B2A`, which the port GATES
      OFF at two transcribed guards (`$285A12 tst $81B63E`, `$285A1C tst
      $81B658`) and THROWS past. `$81B658` (hyper request) is written only by
      `$24989A` inside the bomb/hyper button handler `$249814`, which
      `src/player.js` has thrown on since W4. So `$285A62` requires porting the
      hyper button + the activation body, not just "the pipeline". This is the
      single biggest sizing correction to come out of this recon (see PORT PLAN).
- [x] **`$287682` is NOT "the drain toward rank" as the brief's framing implies.**
      `[M]` it does not touch rank at all. It is a CONDITIONAL hyper-item GRANTOR:
      gauge `$81B64A` >= `$95F` -> clear gauge, then EITHER spawn a kind-$C item
      (`$27E912`, no hyper) OR bank a pending item in `$81B6E0` (hyper active).
      See 1.1.
- [x] **The dispatch priority is `$1F`, confirmed.** `[M]` `$240F62` entry [10] =
      handler `$260794`, word2 `$001F0000`. Highest of all 20 object types; runs
      FIRST every frame, before the player (`$1C`) and the ledger (`$09`). Matches
      `hud.js` header.
- [x] **W120's "frozen" verdict reproduced independently.** `[M]` grep of
      `games/ddpdoj/src/` for `setU*` writes: the ONLY pipeline word the port
      writes is `$81B64A` (the gauge), at `score.js:488` (`bombRankFeed`, +$18 per
      8 hits). Zero `setU` writes to `$81309E`, `$8130C6`, `$81B646`/`$81B648`,
      `$81B65C`/`$81B65E`, `$81B6E0`/`$81B6E2`, `$81B642`/`$81B644`. So every
      pipeline word below the gauge is FROZEN at its seed value. `$81B64A`
      accumulates undrained because `$287682` is NOTED everywhere it should be
      called.
- [x] **The port reads `$813098` (loop word), NOT `$81309E` (real rank), for
      gameplay.** `[M]` census: 13 src files read `0x813098` (bossf23, bossguns,
      bossphase, bullets, damage, framesync, handlers, hud, initbody, options,
      score, shipsprite, spark); ZERO read `0x81309e` (only scheduler.js:313, the
      always-4 discarded branch W120 named). So the port's "rank" gates are loop
      gates, correct for stage 1. The board's gameplay-affecting rank reader
      `$2650BC`/`$2650CC` (enemy bullet-tier selector, 4/3/2 at `$C0`/`$E0`) is
      NOT replicated in the port -- port enemies fire the lowest tier regardless.

## 1. THE GAUGE/STOCK PIPELINE, LINK BY LINK

### 1.1 `$287682` -- the CONDITIONAL hyper-item GRANTOR (the keystone) [M]

```
287682  cmpi.w   #$95f, $81b64a.l      ; gauge <= $95F?
28768A  bls.b    $287680               ; -> rts (do nothing; $287680 is bare rts)
28768C  cmpi.w   #$5,   $81b65c.l      ; stock at MAX (5)?
287694  beq.b    $287678               ; -> PIN gauge at $95F, rts (queue full)
287696  cmpi.w   #$4,   $81b6e0.l      ; pending at MAX (4)?
28769E  beq.b    $287678               ; -> PIN gauge at $95F, rts
2876A0  clr.w    $81b64a.l             ; *** CLEAR the gauge ***
2876A6  tst.w    $81b6e4.l             ; pending-display flag
2876AC  beq.b    $2876be               ; 0 -> skip player-state gate
2876AE  tst.w    $8103e6.l  / bpl $2876c6   ; player-state shortcut to +pending
2876B6  tst.b    $81040a.l  / bne $2876c6
2876BE  tst.w    $81b63e.l             ; *** hyper active P1? ***
2876C4  beq.b    $287702               ; NO hyper -> SPAWN kind-$C (1.1a)
2876C6  addq.w   #$1, $81b6e0.l        ; hyper ACTIVE -> bank a PENDING item
        ... (the +pending arm: table write at $25531C, cap, rts)
287702  moveq    #$c, d0               ; D0 = $C (HYPER ITEM kind)
287704  movem.l  d0/d2/d6/a0/a2,-(a7)
287708  move.w   #$7000, d6            ; D6 = spawn position base
28770C  jsr      $27e912.l             ; *** SPAWN the kind-$C item ***
287712  movem.l  (a7)+, d0/d2/d6/a0/a2
287716  rts
```

So `$287682` is the gate that converts a full gauge into EITHER a live kind-$C
item (no hyper) OR a deferred pending count `$81B6E0` (hyper active -- the web's
"no gauge gain while hypering" rule, recon 71 sec 4.1). It does NOT write
`$81B65C` (stock) and it does NOT write rank. W38 sec 2.4's correction (cited in
`score.js:capClamp`) is exactly right; this recon confirms it from the image.

The SIX absolute-long callers `[M]` (matches `score.js`'s "six"):

| # | site | context | ported? |
|---|------|---------|---------|
| 1 | `$249FDA jsr` | inside DEATH handler `$249Fxx`; follows `$249FD4 jsr $287B9A` (death grants gauge). The death rank-quarter `$24A006 lsr.w #2,$81B646` is in the SAME routine (P1; `$24A0AA` P2). | death routine: see 1.5 |
| 2 | `$27FBE4 jsr` | the BEE collect: `$27FBDE add.w d0,$81b64a / jsr $287682` inside bee body `$27FACC`. | REFUSED (bee.js, W111) |
| 3 | `$2866CA jmp` | the capTail `$286674`: meter-cap hyper-stock bonus, `$2866C4 add.w d0,$81b64a / jmp $287682`. | NOTED (score.js capClamp) |
| 4 | `$2867A4 jsr` | bombRankFeed `$286774` (the `$400` arm): per-hit, D2 always $18, reload `$81B636=8`. | PARTIAL (score.js bombRankFeed: writes gauge, NOTEs grant) |
| 5 | `$2867CE jsr` | laserRankFeed `$2867B4` (the laser): per-hit, D2=$4 or $30 (hyper), reload 8. | NOTED (score.js; laser arm `$286A82` is unreached()) |
| 6 | `$2867E4 jsr` | a third feeder `$2867DE`: `add.w d2,$81b64a / jsr $287682 / move #$8,$81b636 / rts`. | NOT ported. `[M]` ZERO absolute AND ZERO pcrel callers anywhere in `$100000..end` -- **DEAD / vestigial** (like `$28678E..$28679C` in bombRankFeed). |

**Verdict on `$287682`:** UNPORTED (NOTED at every one of its 5 live call sites;
the 6th is dead). The port's `bombRankFeed` is the only site that writes the
gauge, and it NOTEs the grant, so the gauge accumulates undrained.

### 1.2 `$27E912` -- the item SPAWNER (general, kind-table-driven) [m]

`$27E912` is the slot-FINDER: D0 = kind -> pick a table (`$816B7A`/$`816D7A`/.../
`$816E7A` for kind $C) -> walk D2+1 records of stride `$40` to find a free slot ->
return with A0 pointing at it. The kind-$C (hyper-item) table is at `$816E7A`.
The actual spawn body is reached further in (`$27F6E4`+), which writes the object
record. This is the item subsystem (W59 territory).

`src/items.js` REFUSES kind `$C` (and kind `$14`) at the allocator -- the "I2
REFUSAL" `bomb.js:411` names. So even if `$287682` were ported, the kind-$C item
would not spawn. **Un-porting this refusal is a prerequisite of the pipeline.**

**Verdict:** UNPORTED (and deliberately refused at the allocator).

### 1.3 `$2530CA` -- the kind-$C COLLECT site (stock++) [m]

```
2530CA  addq.w   #$1, $81b65c.l        ; *** hyper stock P1 += 1 ***
2530D0  move.w   #$95f, $81b642.l      ; reset hyper gauge P1 (the 1200-frame one)
2530D8  bsr.w    $25349a               ; (sub-routine)
2530DC  jmp      $286ed6.l             ; tail-call HUD hyper-stock icon draw
```

`[M]` ZERO absolute AND ZERO pcrel callers: `$2530CA` is a FALL-THROUGH, reached
mid-routine when the kind-$C item's collect handler runs (the item subsystem
dispatches per-kind handlers; kind-$C's handler lands here). The stock increment
is UNCAPPED here -- `$287682`'s `cmpi.w #$5,$81b65c` is the only cap (recon 71
sec 4.2 noted this). Because kind `$C` is refused at the allocator, no kind-$C
item ever exists to be collected, so `$2530CA` is unreachable in the port.

**Verdict:** UNPORTED (unreachable; upstream of the kind-$C refusal).

### 1.4 `$285A62` -- the stock -> power word conversion (INSIDE hyper activation) [m]

`$285A62` is reached by FALL-THROUGH from the hyper-ACTIVATION body, NOT a call:

```
285A12  tst.w    $81b63e.l  / bne $285a96   ; GUARD 1: already hypering -> tail
285A1C  tst.w    $81b658.l  / beq $285a0a   ; GUARD 2: no hyper REQUEST -> flash
285A24  moveq    #$11, d0 / and.b $8103e6 / bne $285b32   ; player-state gate
285A30  move.w   #$1, $81b63e.l             ; *** ACTIVATE hyper P1 ***
...
285A56  move.w   $81b65c.l, d0              ; D0 = stock
285A5C  move.w   d0, $81b654.l              ; hyper level := stock
285A62  add.w    d0, $81b646.l              ; *** POWER += stock (the rank term) ***
285A68  cmpi.w   #$23, $81b646 / bls -> clamp $23
285A8A  clr.w    $81b65c.l                  ; clear stock
...
285B2A  jmp      $2875b4.l                  ; tail-call the pending drain
```

So `$285A62` is `POWER += stock`, where stock is `$81B65C` and power is `$81B646`
(recon 71 sec 4.2 correct; the "add.w $81b65c,$81b646" is via D0). But this only
runs when the hyper ACTIVATES, which needs `$81B658` (request) set, which needs
the bomb/hyper button `$24989A`/`$249814` -- thrown in `src/player.js` since W4.

`src/hud.js` TRANSCRIBES the two guards (`HUD.hyperP1: 0x285a12`, `hyperP2:
0x285b3c`) and THROWS BY ADDRESS past them (`hud.js:2056`). Both guard words are
0 in the seed; the cartridge's own guards send every frame to the flash path
`$285A0A` -> `jmp $2873AC`.

**Verdict:** UNPORTED (gated off by the unported hyper-request button). **This is
why the brief's "port `$285A62`" is a much bigger job than it sounds: it requires
the hyper button + the activation body + the hyper-end + the P2 mirror.**

### 1.5 The death rank-quarter and the death-grant feeder (the `$249Fxx` routine) [m]

`[M]` `$249FB0..$24A12E` is the player DEATH routine (P1 arm `$249FB0`, P2 arm
`$24A056`). It contains:
- `$249FD4 jsr $287B9A / $249FDA jsr $287682` -- death grants gauge + grant (the
  web's "dying fills the hyper gauge" rule, recon 71 sec 4.1C). `$287B9A` is the
  P1 death-grant; `$287BB6` is P2.
- `$24A000 jsr $285AF2` -- force hyper-END on death.
- `$24A006 move.w $81b646.l,d0 / lsr.w #$2,d0 / move.w d0,$81b646.l` -- **the
  death rank QUARTER** (P1; `$24A0AA` is P2 on `$81B648`).
- `$24A014..$24A028` -- clear stock `$81B65C`, HUD redraw.
- `$24A030 jsr $25392E` / `$24A03E jsr $2531DE` -- respawn setup.

`src/damage.js:185` names `$24A006` in a COMMENT only. The death rank-quarter is
live in the port ONLY IF the death routine runs -- and on the corpus (no deaths)
it never does. On a playing run with hypers, the quarter is the only SINK on
`$81B646` (besides the bomb debit `$249976`); without it, a death would not reset
rank. The bomb debit `$249976` is behind `unreached()` at `bomb.js:1467`.

**Verdict:** death-grant + rank-quarter UNPORTED (death routine partly noted; the
rank-quarter is a no-op today because `$81B646` is always 0).

### 1.6 The pending drain `$2875B4` -- PARTIALLY ported (guard only) [m]

```
2875B4  tst.w    $81b6e4.l  / beq $2875d6   ; pending-display flag
2875BC  tst.w    $8103e6.l  / bmi $2875ce   ; player-state arm
2875C4  tst.w    $8130be.l  / bmi $2875d6   ; lives arm
2875CC  rts                                ; (don't drain yet)
2875D6  move.w   $81b6e0.l, d7  / beq rts   ; pending count == 0 -> rts
2875DE  cmpi.w   #$95f, $81b64a / ...       ; gauge overflowed again? +1 pending
2875F0  subq.w   #$1, d7                    ; dbra count
2875F2  move.w   #$7000, d6
2875FA  moveq    #$c, d0                    ; kind $C
2875FC  jsr      $27e912.l                  ; *** SPAWN deferred kind-$C items ***
287606  dbra     d7, $2875fa                 ; one per pending entry, D6 += $800
28760E  clr.w    $81b6e0.l                  ; clear the queue
```

`[M]` THREE absolute callers: `$249922` (player object, P1, per-frame), `$285B2A`
(hyper-activation tail), `$28EAB8` (stage-end / result-screen). `src/bomb.js`
PORTS the guard as `flushPendingGrants2875B4` (line 390), called from `bomb.js:
1447` (the player-object per-frame path). The guard returns early because
`$81B6E0` (pending) is always 0 (its only writer `$2876C6` is inside the unported
`$287682`). The SPAWN LOOP `$2875FC` is `unreached(BOMB.itemSpawner)` (bomb.js:
411) -- it throws by address rather than spawning.

**Verdict:** PARTIALLY ported (guard runs as a proven no-op; spawn loop refused).

## 2. OBJECT TYPE 10 -- CONFIRMED [M]

Reproduced W120's transcript; added the state-0 INIT sizing and the `$288610`
computed-call callee.

- **Dispatch entry** `[M]`: `$240F62[10] = $260794`, word2 `$001F0000` (priority
  `$1F`, highest of all 20). Runs FIRST every frame.
- **State machine `$260794`**: state byte at `$2(A5)`. State 0 -> INIT `$2605C8`;
  state 1 -> per-frame body (`$2607A8..$2607F6`); state 2 -> teardown
  (`$2603DA -> jmp $241292`).
- **Per-frame body** `[M]`: `$813082` gate; `$8130D2` freeze/scroll gate (skips
  the CLOCK +1 at `$2607E4` but NOT the recompute -- `bne $2607EA`); `$2607E4
  addq.l #$1,$8130C6` (the rank clock, 24.8 fixed point); `$2607EA jsr $2608D2`
  (the recompute); `$2607F0 jsr $288610` (a computed-call dispatcher, see below);
  `$2607F6` writes `$81B414 := 1` if loop 2+.
- **Recompute `$2608D2`** `[M]`: `D1 = base[stage]` (from RAM pointer `$81315C`
  + stage idx `$813092`); `D1 += ($8130C6 >> 8)`; if hyper active
  (`$81B63E | $81B640`): `D1 += 16 * max($81B646, $81B648)`; loop 2+ pins `$FF`
  (or `$F8` no hyper); `move.w D1,$81309E`; clamp `$F0` (no hyper) / `$FF`
  (hyper); fan-out `$260984..$260A18` writes `$8130A1 $8130A3 ... $8130BD`
  (FOURTEEN bullet-system bytes). Reads NO chain/score state (W120 confirmed).
- **`$288610`** `[M]`: a computed-call dispatcher. Walks 2 entries at `$81B706`
  (stride `$16`), reads an index word, `jsr (jump_table[idx])` at `$288638`.
  Register-indirect -- invisible to absolute/pcrel xref. Needs its jump-table
  targets traced before the object ships (they are per-player rank-related
  updaters; small, but unmeasured).
- **State-0 INIT `$2605C8..$26070A`** `[M]`: sets state=1; calls `$259C4A`; TEN
  `$2414BE` resource installs (the palette/resource half already replayed by
  `palette.js catchUpTextPalette`, W92); then `clr $813080 / move #$1,$813082`;
  the `$813098` loop branch (loop 1 -> `$2603DA` + `$2606CA`; loop 2+ ->
  `$8130BE`/`$8130C0` lives := `$FFFF`, clear `$813142..$813154`); then
  `$25FD0C`, `$28D552` (creates object type 0!), `$28EBFE`, and (loop 1 only)
  `$27F87C`, `$2884E2`, `$287024`, `$24A810`, `$25FE42`, `$288574`.
  **DEFERRABLE**: a seeded run starts in state 1, so INIT only runs on cold boot
  / fresh RAM. The palette half is covered; the non-palette tail is cold-boot-only.

**Verdict:** UNPORTED. Not in `main.js defaultHandlers`. Add type 10, port the
state machine + state-1 body + recompute + fan-out + `$288610`. Defer state-0
INIT (seed starts in state 1).

## 3. PORT PLAN -- RANK FIX, SIZED IN WAVES

### The dependency graph (the bit the brief understates)

```
                       OBJECT TYPE 10 ($260794 + $2608D2 + fan-out + $288610)
                                  (reads $81B646/$81B648)
                                            ^
                                            | (the 16*max(power) term)
              $81B646/$81B648 (POWER word)  |
                              ^             |
              $285A62 (stock -> power)      |  (the rest of the rank formula --
                  ^                         |   base[stage] + clock>>8 -- runs
       hyper ACTIVATION $285A24..$285B2A    |   INDEPENDENTLY of hypers)
       needs hyper-request button $24989A   |
                              ^             |
              $81B65C (STOCK)               |
                ^                           |
       $2530CA (kind-$C collect: stock++)   |
                ^                           |
       kind-$C item must EXIST (un-refuse  |
         items.js allocator) + spawn body  |
                ^                           |
       $27E912 (spawner) <-.                |
                            \               |
       $287682 (GRANTOR) ----: gauge crosses $95F -> spawn OR bank pending
            ^   ^   ^   ^    :
            |   |   |   |    :
   bombRank  bee capTail laser death-grant  :  (the pending branch)
   Feed $286774 $27FBDE $2866C4 $2867B4     |
                                   $249FDA  |
                                            v
                                  $81B6E0 (pending) -> $2875B4 (drain) -> $27E912
```

THE KEY SIZING INSIGHT: the pipeline naturally splits into TWO correctness
tiers, because `$81B646` (power) is ZERO on both the corpus board AND the port
(the corpus is owner-decision-4: no hypers, no fire). So:

- **Tier 1 (the clock/base term):** object type 10 ALONE produces
  `$81309E = base[stage] + (clock>>8) + 0`. On the corpus this EXACTLY matches
  the board (both have power=0). Independent of hypers.
- **Tier 2 (the power term):** requires the FULL hyper subsystem (button +
  activation `$285A62` + grantor `$287682` + spawner + collect + pending drain +
  hyper-end + the death/bomb/bee sinks). Only matters on a hyper-active run.

### Wave A (Tier 1) -- port object type 10. ~1 wave. CORPUS-SAFE.

- Add type 10 to `main.js defaultHandlers`.
- Port the state machine `$260794` (states 0/1/2; state 0 INIT can be a cold-boot
  stub that sets state=1 and notes the resource-install tail, since seeded runs
  start in state 1 -- defer the full INIT to a boot-at-any-rung follow-up).
- Port the state-1 per-frame body (`$2607A8..$2607F6`): the `$813082` gate, the
  `$8130D2` freeze gate, `$8130CA` write, clock advance `$2607E4`, recompute call
  `$2607EA`, `$288610` callee, `$2607F6` loop-2+ `$81B414` write.
- Port the recompute `$2608D2..$260A1E` (formula + clamp + 14-byte fan-out). ~120
  instructions transcribed verbatim from W120's listing (re-verified `[M]`).
- Port `$288610` + TRACE its jump table `$288638` (2 entries; register-indirect;
  the only unmeasured piece).
- Headless test from the seed: assert `$81309E` advances ~1 per 256 frames from
  the base, and that re-seeding at each rung matches the board's `$81309E` (it
  must, since both are base + clock>>8 with power=0).

**Dependencies:** none (the recompute reads no chain/score/hyper-activation
state; it reads `$81B646`/`$81B648` which are 0 and stay 0 until Tier 2).
**Biggest risk:** ZERO to scoring/chain (W120 sec 5, re-verified: recompute
reads only `$81315C`/`$813092`/`$8130C6`/`$81B63E`/`$81B640`/`$81B646`/`$81B648`
/`$813098`, none of which is chain/score). The `$288610` computed calls are the
one unknown -- they must be confirmed benign (no score writes) before ship.
**Gate impact:** seedcmp re-seeds `$81309E` every 250 frames; clock drift per
segment <= 1, so the green ladder stays green (and becomes MEANINGFUL for rank
where before it was masking a frozen value).

### Wave B (Tier 2) -- the gauge/stock pipeline + hyper subsystem. 3-4 waves.

This is the substantive port. Ordered by dependency (each wave must close before
the next feeds it, else stock/power errors accumulate uncorrected -- W120's
"wrong-and-rising"):

**B1 -- hyper activation + end (the gate for the power term).**
- Un-throw the bomb/hyper button `$249814`/`$24989A` in `player.js` (sets
  `$81B658` hyper-request). Couple to the existing input layer (W109).
- Port the activation body `$285A24..$285B2A` (P1) and `$285B4E..` (P2) IN hud.js,
  replacing the throw past the guards. Includes `$285A62` (stock -> power),
  `$81B654` (hyper level := stock), the clamp `$23`, the stock clear, the
  chain-meter pin `$285A4C`, the HUD redraw, the tail `jmp $2875B4`.
- Port the hyper-END `$285AF2` (currently NOTED; called from the player object
  `$249970` and from death `$24A000`). Without it the hyper never ends and
  `$81B63E` stays set.
- Red-validate against a MAME hyper-active capture (the corpus cannot exercise
  this -- owner decision 4 forbids hypers on the gate).

**B2 -- the grantor + spawner + collect (the pipeline proper).**
- Port `$287682` (the grantor). Replace the FIVE `note(ctx, SCORE.hyperGrant,
  ...)` sites in `score.js` (bombRankFeed, capClamp, the dead 6th stays dead) and
  the bee `score.js`/`bee.js` REFUSAL, and the death-grant, with real calls.
- Un-refuse kind `$C` at `items.js` allocator; port `$27E912` (slot-finder) + the
  spawn body `$27F6E4`.
- Port the kind-$C collect handler -> `$2530CA` (stock++, gauge reset `$81B642`,
  HUD draw).
- Port the pending-drain SPAWN LOOP `$2875FC` (replace `unreached()` in
  `bomb.js:411`).

**B3 -- the sinks (so rank is RESET on death/bomb, not just raised).**
- Port the death rank-quarter `$24A006`/`$24A0AA` (`$81B646`/`$81B648` >>= 2) and
  the death-grant `$287B9A`/`$287BB6` in `damage.js` (currently a comment).
- Un-`unreached` the bomb rank debit `$249976` (`bomb.js:1467`): `$81B646 -= 3`
  per bomb during hyper.
- Un-REFUSE the bee gauge feed `$27FBDE` in `bee.js` (bees fill the gauge
  correctly, recon 71 sec 4.2 -- the step table 3%/30%, the hyper gate).
- The P2 mirrors throughout (`$287616`, `$285B3C`, `$285C1C`, `$24A056` arm).

**Dependencies:** B1 -> B2 -> B3. The activation (B1) must ship before the
pipeline (B2) feeds it, else stock accumulates without converting to power (a
frozen stock, not wrong rank, but it means B2 is untestable in isolation). The
sinks (B3) must ship with B2 (a pipeline that raises power but never resets it on
death/bomb is the "wrong-and-rising" W120 warned of).
**Biggest risk:** W120's -- a half-closed pipeline (e.g. B2 shipped without B3's
death-quarter) makes rank monotonically rising across deaths, which is the
owner's named failure ("one wrong rank gain breaks the route"). Red-validate
each wave against a MAME hyper-active capture; the corpus gate CANNOT test this
(no hypers, no deaths). Couple tightly to the existing bee (W111), bomb, laser,
HUD, and item-allocator work.

### The biggest risk, restated

W120's warning is SOUND for the hyper-active case and the plan honours it: the
pipeline (B2) + sinks (B3) must CLOSE before/with the activation (B1), never
half. The risk the brief understates is that `$285A62` is not a pipeline link --
it is the heart of the hyper-ACTIVATION body, gated by the unported hyper button.
So "port the pipeline first, then type 10" (the brief's framing) is really
"port the hyper subsystem (button + activation + end + grantor + spawner +
collect + drain + sinks), then type 10" -- a 3-4 wave job, not a quick lead-in.

The mitigating finding: object type 10 (Wave A) is CORRECT IN ISOLATION on the
corpus and on every no-hyper run, because the power term is 0 on both sides. So
Wave A can ship FIRST (it makes rank = base + clock>>8, matching the board on
the corpus), and the hyper subsystem (Wave B) can follow at its own pace. This
INVERTS the brief's "pipeline first" order, but with a sound justification: the
corpus cannot test the power term either way, and the recompute reads no
chain/score state, so there is no "wrong-and-rising" exposure until hypers
activate. If the owner/brief prefers the strict W120 order (pipeline first, then
type 10), the plan above supports it -- just reverse the wave labels and accept
that Wave B's pipeline is untestable until Wave A's recompute lands to read its
output. Either order closes the same dependency graph.

## RULED OUT / COULD NOT REACH

- **The jump table `$288638` targets for `$288610`.** Register-indirect; needs a
  RAM tap or a静态 walk of the table words at `$81B706` against the seed. Flagged
  as the one unmeasured piece of Wave A; must be traced before Wave A ships.
- **The base[stage] table value.** `$2608D2` reads it from a RAM pointer
  `$81315C`, not a fixed ROM address. W19 cited ~52 for stage 1; not re-measured
  (moot until type 10 ships). Wave A's test will pin it from the seed.
- **The state-0 INIT non-palette tail's cold-boot correctness.** Seeded runs skip
  it; deferred to a boot-at-any-rung follow-up. The palette half is covered by
  palette.js.
- **Dynamic (MAME) confirmation.** No emulator this recon; all findings are from
  the image and the source. Wave B's red-validation requires a hyper-active MAME
  capture the corpus cannot substitute for.

## LOG (appended as findings arrived)

- opened IN PROGRESS. Read CATCHUP (7e/7i), W71 (sec 4.2), W120 (the verdict),
  W119 (the plan), `score.js` (full), `hud.js` (hyper header + guards).
- `[M]` no worklog at 126; created this file.
- `[M]` disassembled `$287682`: NOT a rank drain -- a CONDITIONAL hyper-item
  grantor (gauge >= $95F -> clear, spawn kind-$C OR bank pending `$81B6E0`).
- `[M]` census of `$287682`'s SIX absolute callers: death `$249FDA`, bee
  `$27FBE4`, capTail `$2866CA`, bombRankFeed `$2867A4`, laserRankFeed `$2867CE`,
  and a 6th `$2867E4` that has ZERO callers anywhere -- DEAD/vestigial.
- `[M]` disassembled `$2530CA` (kind-$C collect: stock++ + gauge reset + HUD),
  `$285A62` (stock -> power, INSIDE hyper activation `$285A24..$285B2A`),
  `$27FBDE` (bee gauge feed), `$2875B4` (pending drain).
- `[M]` `$285A62` is FALL-THROUGH from activation; activation is GATED OFF by
  `$81B658` (request) whose only writer is the hyper button `$24989A`, thrown in
  player.js. So `$285A62` requires the hyper subsystem, not just the pipeline.
- `[M]` `$249FB0..$24A12E` is the DEATH routine: contains death-grant `$249FD4/
  FDA`, hyper-end `$24A000`, rank-quarter `$24A006 lsr #2,$81b646` (P1) /
  `$24A0AA` (P2).
- `[M]` `$2875B4` is PARTIALLY ported: bomb.js `flushPendingGrants2875B4` runs
  its guard (called from bomb.js:1447 in the player-object path), returns early
  on `$81B6E0==0`; spawn loop `$2875FC` is `unreached()`.
- `[M]` `$2530CA` has ZERO callers -- fall-through mid-routine (kind-$C collect).
- `[M]` dispatch table: `$240F62[10] = $260794` priority `$001F`. Highest.
- `[M]` re-disassembled `$2608D2..$260A1E`: reproduces W120 instruction for
  instruction.
- `[M]` port write census: only `$81B64A` is written (score.js:488). `$81309E`,
  `$8130C6`, `$81B646`/`$81B648`, `$81B65C`/`$81B65E`, `$81B6E0`/`$81B6E2`,
  `$81B642`/`$81B644` all have ZERO `setU` writes. Frozen verdict reproduced.
- `[M]` port read census: 13 files read `$813098` (loop); ZERO read `$81309E`
  (real rank) for gameplay. Board's `$2650BC/CC` bullet-tier selector is not
  replicated.
- `[M]` disassembled state-0 INIT `$2605C8..$26070A`: 10 resource installs +
  ~10 callees; palette half covered by palette.js; DEFERRABLE (seed starts in
  state 1).
- `[M]` `$288610`: computed-call dispatcher, jump table `$288638`, 2 entries at
  `$81B706`. Register-indirect; the one unmeasured piece of Wave A.
- wrote the port plan (sec 3): Wave A (object type 10, corpus-safe, ~1 wave) +
  Wave B (hyper subsystem, 3-4 waves, B1 activation/end -> B2 pipeline -> B3
  sinks). Biggest risk: W120's half-closed-pipeline wrong-and-rising, gated by
  the unported hyper button that the brief's framing understates.
- closed DONE.

status: **DONE**
