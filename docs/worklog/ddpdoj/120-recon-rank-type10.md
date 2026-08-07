# 120 -- RECON: object type 10 (RANK) `$260794` vs the port's inline rank work

status: **DONE**

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

## VERDICT (the one-line answer)

**DIVERGENCE. The rank output `$81309E` is computed NOT AT ALL. `score.js`'s
`bombRankFeed` is NOT a substitute: it writes `$81B64A` (the hyper-item gauge),
a DIFFERENT variable three indirections upstream from the rank output.** The
rank object (type 10) does not run in the port, so `$81309E` (the rank value),
`$8130C6` (the rank clock) and `$8130A1..$8130BD` (the fan-out) are all FROZEN
at their seed values for the whole run.

The nuance that matters for owner decision 3: the rank value drives DIFFICULTY
(bullet counts/speeds via `$81309E` readers), NOT the score NUMBER. The score,
chain and combo numbers are computed by SEPARATE machines (`score.js`'s
`$286096`/`$28615E`/`$2862C6`, `hud.js`'s drain/decrement) that do not read
`$81309E`. So "stage-1 scoring" (points) is correct; "stage-1 rank" (the
difficulty value) is frozen and wrong on any run where the board's rank would
move. The owner's "rank must be frame-exact" (decision 3) is NOT met.

## 0. PREMISE CHECK (closed)

- [x] **`119-strategic-plan.md` DOES exist** (`docs/worklog/ddpdoj/119-strategic-plan.md`,
      190 lines). The prior partial run of THIS worklog logged it as a phantom;
      that was wrong (Glob finds it on disk). It names Phase 0a (this recon) in
      its own section 5 as "the single highest-value next move." The brief's
      citation is sound.
- [x] **Verified `$2608D2` myself** `[M]` -- disassembled `$2608D2..$260A1E` off
      `maincpu.bin`. It reproduces recon 38 sec 3.1 instruction for instruction
      (the only addition: recon 38 elided `$2608F0 move.w #$DF,D2`, the cap on
      the base+clock term, which is harmless because D2 is overwritten at
      `$2608F4` before any compare; it is dead code, a vestige).
- [x] **Verified `$260794`'s state machine** `[M]` -- state 1 reaches
      `$2608D2` via `$2607EA jsr $2608D2.l`, every frame, after the clock
      advance `$2607E4 addq.l #1,$8130C6.l`.
- [x] **Confirmed NO port code writes `$81309E` or advances `$8130C6`** `[M]`
      -- grep of `games/ddpdoj/src/` for `81309[eE]|8130C6` finds only comments
      and one READ in `scheduler.js:313`; a grep for any `setU*` to
      `0x81309e|0x8130c6|0x81b646|0x81b648` returns ZERO matches. ROM census
      (`[M]`): the ONLY build-B writer of `$81309E` is `$2608D2` itself (7 write
      sites, all inside the recompute); the ONLY build-B writer of `$8130C6` is
      `$2607E4` (inside the rank object's state machine).

## 1. THE SIDE-BY-SIDE COMPARISON

### 1.1 What the rank object `$260794` does every frame (ROM-verified `[M]`)

The object's state machine at `$260794` `[M]`:

```
260794  tst.b    $2(a5)              ; the state byte
260798  beq.w    $2605c8             ; state 0 -> INIT (the palette install)
26079C  cmpi.b   #$2,$2(a5)
2607A2  beq.b    $260788             ; state 2 -> teardown ($2603da -> jmp $241292)
2607A4  jsr      $25ff7a(pc)         ; state 1 -> the per-frame body (palette/sound)
2607A8  tst.w    $813082.l / bne $260808   ; a gate; set arm runs $260808
...
2607DA  tst.w    $8130d2.l           ; the freeze/scroll gate
2607E0  bne.w    $2607ea             ; frozen -> SKIP the clock +1 BUT STILL jsr
2607E4  addq.l   #$1,$8130c6.l       ; *** THE RANK CLOCK +1 (24.8 fixed point) ***
2607EA  jsr      $2608d2.l           ; *** THE RANK RECOMPUTE ***
2607F0  jsr      $288610.l           ; a second callee
2607F6  tst.w    $813098.l           ; the loop word (see 1.4)
```

NOTE: `$8130D2` (freeze) skips the CLOCK advance but NOT `$2608D2` -- the `bne`
jumps TO `$2607EA`, not past it. So the recompute runs every frame regardless of
freeze. Priority `$1F` (highest of all 20 object types) puts this FIRST in the
frame, before the player (`$1C`) and the ledger (`$09`); that ordering is the
W19-measured `rankclk > rank= > [hits] > drain > meter-`, and `hud.js`'s header
documents it.

The recompute `$2608D2` `[M]`, transcribed in full:

```
2608D2  movea.l  $81315c.l, a0       ; A0 = ($81315C) -- per-STAGE base table POINTER (RAM)
2608D8  move.w   $813092.l, d2       ; D2 = stage index
2608E0  move.b   (a0,d2.w), d1       ; D1 = base[stage]  (one BYTE)
2608E4  move.l   $8130c6.l, d2       ; D2 = rank clock
2608EC  lsr.l    #8, d2              ; D2 = clock >> 8
2608EE  add.w    d2, d1              ; D1 += clock>>8
2608F4  move.w   $81b63e.l, d0       ; D0 = hyper active P1
2608FA  or.w     $81b640.l, d0       ; | hyper active P2
260900  beq.b    $26091a             ; NO hyper -> SKIP the power term entirely
260902  move.w   $81b646.l, d0       ; D0 = power P1
260908  cmp.w    $81b648.l, d0       ; vs power P2
26090E  bcc.b    $260916
260910  move.w   $81b648.l, d0       ; D0 = max(P1, P2)
260916  lsl.w    #4, d0              ; D0 <<= 4   (x16)
260918  add.w    d0, d1              ; D1 += 16 * max(power1, power2)
26091A  tst.w    $813098.l           ; the LOOP word
260920  beq.w    $260944             ; loop 1 -> write the computed value
260924  move.w   #$ff, $81309e.l     ; loop 2+ WITH a hyper: PIN $FF
26093A  move.w   #$f8, $81309e.l     ; loop 2+ WITHOUT a hyper: PIN $F8
260944  move.w   d1, $81309e.l       ; *** THE RANK OUTPUT WRITE: $81309E = D1 ***
260958  cmpi.w   #$f0,$81309e / bls  ; clamp to $F0 (no hyper)
260970  cmpi.w   #$ff,$81309e / bls  ; clamp to $FF (hyper)
260984..$260A18                     ; fan the low byte out into ELEVEN bytes
                                    ;   $8130A1 $8130A3 $8130A5 $8130A7 $8130A9
                                    ;   $8130AB $8130AD $8130AF $8130B1 $8130B3
                                    ;   $8130B5 $8130B7 $8130B9 $8130BB $8130BD
260A1E  rts
```

So the rank value is `base[stage] + (clock>>8) + 16*max(power1,power2)`, clamped,
written to `$81309E`, and fanned out to fourteen bullet-system bytes. ALL of
this is RAM-driven (the base table address comes from the RAM pointer at
`$81315C`; it is not a fixed ROM address). W19 cited base ~ 52 for stage 1
`[CITED]`; I did not re-measure the base value because `$2608D2` does not run in
the port at all, so the base value is moot until the object is ported.

### 1.2 What the port's `score.js` "rank arithmetic" actually does

`score.js` has exactly ONE rank-pipeline routine: `bombRankFeed` (`$286774`,
`SCORE.bombRankFeed`). It is a FAITHFUL transcription of `$286774` and does this
`[M vs score.js:484-500]`:

```
$286774 subq.w #1,$81B636   ; decrement the 8-frame divider
$28677A bcc -> rts           ; not zero yet: return
$28679E add.w D2,$81B64A     ; *** D2 is always $18 *** -> adds $18 to $81B64A
$2867A4 jsr $287682          ; NOTED, not ported (the hyperGrant)
$2867AA move.w #$8,$81B636   ; reload the divider to 8
```

`bombRankFeed` is called from `bombHitChain` (`$2868EE bsr $286774`), i.e. on a
laser/bomb HIT while a chain is up. It writes `SCORE.rankAccum = $81B64A`.

**`$81B64A` is the hyper-item GAUGE, NOT the rank output.** The chain of
custody (recon 71 sec 4.2) is: `$81B64A` crosses `$95F` -> `$287682` spawns a
kind-$C item -> collected at `$2530CA addq.w #1,$81B65C` (hyper stock) -> the
NEXT super at `$285A62 add.w $81B65C,$81B646` (power word) -> THEN `$2608D2`
turns `$81B646` into the `16*max(power)` rank term. That is THREE indirections
(`$81B64A` -> `$81B65C` -> `$81B646` -> `$81309E`), and the port stops at the
FIRST: `$287682` is NOTED, so `$81B64A` accumulates without ever draining,
without ever becoming a stock, a power word, or a rank value.

### 1.3 The gap, stated as a census

| word | role | build-B writer(s) `[M]` | port writes it? |
|---|---|---|---|
| `$81309E` | **rank OUTPUT** (the value the game uses) | `$2608D2` only (7 sites, all inside the recompute) | **NO** (grep: 0 source writes; frozen at seed) |
| `$8130C6` | rank CLOCK (24.8 fixed point) | `$2607E4 addq.l #1` only | **NO** (grep: 0 source refs; frozen at seed) |
| `$8130A1..$8130BD` | the 14-byte fan-out | `$260984..$260A18` only | **NO** (frozen at seed) |
| `$81B646`/`$81B648` | power words (the `16*x` term) | `$285A62` (hyper act), `$249976` (bomb debit), `$24A00C` (death) | **NO** (grep: 0 setU writes; bomb debit is behind an `unreached()` throw; hyper act unported) |
| `$81B64A`/`$81B64C` | hyper-item gauge (UPSTREAM of rank) | `$28679E` (bombRankFeed), `$2866C4`, `$27FBDE` (bee, REFUSED) | **YES** (`score.js bombRankFeed`; but accumulates undrained) |

The bottom row is the ONLY rank-pipeline variable the port changes, and it is
the furthest one from the output.

### 1.4 The `$813098` vs `$81309E` distinction (a trap the recons did not spell out)

`handlers.js`, `bullets.js`, `bossf23.js`, `bossguns.js`, `bossphase.js`,
`turret.js` all read a word they call `rank` at address `0x813098`. **That is NOT
the dynamic rank value.** `[M]` census of `$813098` over build B: it is WRITTEN
at exactly two sites, `$259DB4 (move.w #$0,$813098)` and `$259DCA (move.w
#$1,$813098)` -- a discrete 0/1 LOOP indicator (0 = loop 1, 1 = loop 2+), read
70+ times as `tst.w`. The dynamic rank is `$81309E`, 6 bytes later. So every
"rank != 0" gate in the bullet/handler/boss files is actually a "loop 2+" gate,
and those are CORRECT for stage 1 (the seed has `$813098 = 0`, and nothing in
stage 1 changes it). The dynamic-rank divergence in `$81309E` does NOT flow
through those gates.

## 2. WHAT READS THE RANK OUTPUT `$81309E` (build B, `[M]`)

Three readers, found by an abs.long census of `$0081309E`:

1. **`$2595F2` (at `$259604`)** -- `move.w $81309e,D2` inside the "spread"
   function. But `$2595F2` ALWAYS RETURNS 4: every computed branch falls into
   `$25962A moveq #$4,D0` (scheduler.js:311-325). The value is DISCARDED. **No
   effect.**
2. **`$259E92`** -- `move.w $81309e,D3 / jsr $25A17A`. Passes the rank value to a
   display/status routine. A DRAW, not gameplay.
3. **`$2650BC`/`$2650CC`** -- an enemy/turret handler: `cmpi.w #$C0,$81309e /
   bcs`; `cmpi.w #$E0,$81309e / bcs`; selects `D0 = 4` (rank<$C0), `3`
   ($C0..$DF) or `2` ($E0+) and stores it into the object's `$25(A5)` byte (a
   bullet-count or fire-rate selector). **GAMEPLAY-AFFECTING: rank drives how
   many bullets this enemy fires.**

So the frozen rank DOES affect gameplay (enemy bullet counts), but it does NOT
affect any score, chain or combo arithmetic. The score NUMBER is computed by
machines that never read `$81309E`.

## 3. WHY THE CORPUS DOES NOT SEE IT (and a playing run would)

Seedcmp re-seeds `$81309E` from board RAM at every rung (every 250 frames).
Within one 250-frame segment the clock term (`clock>>8`) drifts by at most 1
(250/256 ~= 0.98), and no hyper/power term moves on the passive corpus (owner
decision 4: minimum rank, no fire, no hypers). So the per-segment divergence in
`$81309E` is <= 1, and re-seeding masks it entirely. This is why 13,084 seeded
frames stay green while the rank is structurally frozen.

A PLAYING run (which owner decision 4 mandates for real verification) would
diverge: the board's clock rises, its rank crosses `$C0`/`$E0`, and enemies
switch bullet tiers, while the port's rank stays pinned and the port keeps the
lowest tier. That divergence is invisible to the seedcmp gate (re-seeded) but
real to a player and to any route that depends on bullet density.

## 4. THE PARADOX THAT MAKES UPSTREAM RANK ERRORS INERT

Recon 71 sec 4.2 and `items.js` document the route-breaking case: a bee (or a
hyper item) collected wrongly fills `$81B64A`, which (via `$287682` ->
`$81B65C` -> `$285A62` -> `$81B646`) becomes a permanent `+16 rank` at the next
super. That chain of custody ENDS at `$2608D2`. Because `$2608D2` never runs in
this port, NONE of those upstream errors reach `$81309E`. The port therefore has
TWO compounding errors -- (a) the gauge/stock pipeline diverges (recon 71, the
bee REFUSAL, `$287682` NOTED) and (b) the recompute is absent -- that happen to
CANCEL at the output: `$81309E` is frozen regardless of what `$81B64A` does.
Shipping the recompute WITHOUT first closing the gauge/stock pipeline would
UNMASK those errors, turning a frozen rank into a wrong-and-rising one. This is
the ordering constraint on the fix (sec 6).

## 5. THE FIX AND ITS RISK TO THE FRAME-EXACT CHAIN DECREMENT

**The fix is: port object type 10 (`$260794`) into the dispatch.** Concretely
`[M]`:
- add type 10 to `main.js defaultHandlers`;
- port the state machine (`$260794`: states 0/1/2);
- port state 0 INIT (`$2605C8`) -- the palette-install half is ALREADY replayed
  by `palette.js catchUpTextPalette` (W92), so only the non-palette tail
  (`jsr $259C4A`, `clr.w $813080`, `move.w #$1,$813082`, the `$813098` branch)
  needs porting;
- port the state-1 frame body (`$2607A8..$2607F6`): the `$813082` gate, the
  `$8130D2`/`$8130D4` counters, the `$8130CA` write, the clock advance
  `$2607E4`, the recompute `$2607EA jsr $2608D2`, the `$288610` callee;
- port the recompute `$2608D2` itself (the formula in sec 1.1) and its fan-out.

**Risk to the frame-exact chain-meter decrement `$284636`/`$2847D4`: ZERO.**
- The decrement lives in object type 0 (`$28D520`, `hud.js`, priority `$09`).
  The recompute lives in object type 10 (`$260794`, priority `$1F`). They are
  DIFFERENT dispatch entries; porting type 10 adds a new object that runs
  EARLIER in the frame, it does not modify type 0's code or its slot.
- `objalloc.js` already inserts objects in descending priority and the driver
  (`$2410BC`) walks them in address order, so adding type 10 at `$1F` puts it
  before the player (`$1C`) and the ledger (`$09`) by construction (the same
  mechanism `hud.js`'s header relies on for the `rank > player > ledger`
  ordering). No ordering code changes.
- The recompute `$2608D2` reads ONLY `$81315C` (table ptr), `$813092` (stage),
  `$8130C6` (clock), `$81B63E`/`$81B640` (hyper active), `$81B646`/`$81B648`
  (power), `$813098` (loop) `[M]`. NONE of those are chain-meter or score
  state. It writes only `$81309E` and `$8130A1..$8130BD`. It cannot perturb the
  chain decrement or the score machines.

So the fix is ISOLATED from the owner's frame-exact chain concern. The risk it
DOES carry is sec 4's: shipping the recompute before the gauge/stock pipeline
(`$287682`, `$2530CA`, `$285A62`) is closed would unmask the inert upstream
errors. The safe order is: close the hyper/bee stock pipeline FIRST (recon 71's
chain, items.js's REFUSAL), THEN port `$2608D2`.

## 6. WHAT "CORRECT" MEANS HERE (for owner decision 3)

Owner decision 3: "Scoring, combo and chain must be frame-exact, possibly
sub-frame. One wrong rank gain from using super and the entire route breaks."
Splitting that into its two halves:

- **"Scoring/combo/chain frame-exact": MET.** The score, chain and combo
  machines (`score.js`, `hud.js`) do not read `$81309E`; their frame order
  (`hud.js` header) is reproduced by construction. The rank object's absence
  does not touch them.
- **"Rank frame-exact / one wrong rank gain breaks the route": NOT MET, but the
  failure mode is FROZEN, not wrong-and-rising.** The route-breaking case
  requires the recompute to RUN for a wrong stock to become a wrong rank. With
  the recompute absent, no stock error (bee, hyper, bomb) can change `$81309E`.
  So the port cannot currently produce "one wrong rank gain"; it produces NO
  rank gain at all. That is a different failure from the one the decision names,
  and it is invisible on the passive corpus and on any seeded comparison.

The honest summary for the owner: stage-1 SCORE ARITHMETIC is correct and
frame-exact; stage-1 RANK (dynamic difficulty) is frozen at the seed value and
will diverge from the board on any run where rank should move. The two are
separate subsystems; the rank gap does not corrupt the score.

## RULED OUT

- **That `bombRankFeed` is a substitute for `$2608D2`.** It writes `$81B64A`
  (the gauge), not `$81309E` (the output). `[M]` ROM + source.
- **That the port writes the rank output anywhere.** `[M]` grep: zero `setU*`
  hits for `$81309E`, `$8130C6`, `$81B646`, `$81B648`. The bomb debit `$249976`
  is behind an `unreached()` throw (bomb.js:1467), never executed, because the
  hyper flag `$81B63E` is never non-zero in this port.
- **That the handlers' "rank" reads (`$813098`) are the dynamic rank.** `[M]`
  they are a 0/1 loop indicator, distinct from `$81309E`, and correct for stage
  1.
- **That `$26070C` (the resume note's "gate-clearing" routine) is part of the
  rank recompute.** `[M]` it is a separate routine that tests/clears `$813082`
  (the same gate `$260794`'s state machine tests at `$2607A8`) and runs
  `$25D990` + `$260580`; it has two `bsr` callers (`$25C79C`, `$25D664`). It is
  a palette/sound servicer for the `$813082` gate, tangential to the rank
  formula. It does not write `$81309E` or `$8130C6`.

## COULD NOT REACH (measured reasons)

- **The base table value for stage 1.** `$2608D2` reads the base from a RAM
  POINTER at `$81315C`, not a fixed ROM address `[M]`. The seed carries the
  pointer; the table it points to is in ROM but its address is a runtime value.
  Since `$2608D2` does not run in the port, the base value is moot until the
  object is ported; W19 cited ~52 `[CITED]` and I did not re-derive it.
- **Dynamic confirmation.** No MAME, no seedcmp run this wave. The "frozen at
  seed" claim is from source (no writer exists) and ROM (only writer is the
  unported recompute), not from a live tap.
- **The `$813082` gate's full semantics.** It selects between `$260808` (set)
  and the clock/recompute path (clear) inside the rank object. Porting type 10
  needs it, but it is not on the rank-output path itself.

## LOG (appended as findings arrived)

- opened IN PROGRESS. Read CATCHUP (7b/7c/7d), HANDOVER, W105 (sec 4.1), W71
  (sec 4.2), W119 (the strategic plan, which DOES exist on disk contrary to the
  prior partial run's log), recon 38 (full), `score.js` (full), `hud.js`
  (full), `scheduler.js` (sec around `$81309E`), `palette.js` (sec around
  `$260794`), `bomb.js` (rank debit), `bee.js` (rank gauge REFUSED).
- PREMISE ITEM 1 CORRECTED: `119-strategic-plan.md` exists; the prior log line
  saying it does not was wrong.
- `[M]` disassembled `$260794`'s state machine: state 1 reaches `$2608D2` via
  `$2607EA jsr $2608D2.l`, after `$2607E4 addq.l #1,$8130C6.l`.
- `[M]` disassembled `$2608D2..$260A1E`: reproduces recon 38 sec 3.1 exactly;
  writes `$81309E` and fans out to `$8130A1..$8130BD`.
- `[M]` census: the ONLY build-B writer of `$81309E` is `$2608D2` (7 sites);
  the ONLY build-B writer of `$8130C6` is `$2607E4`.
- `[M]` grep of `games/ddpdoj/src/`: ZERO `setU*` writes to `$81309E`,
  `$8130C6`, `$81B646`, `$81B648`. The port never writes the rank output, the
  clock, or the power words. `bombRankFeed` writes `$81B64A` (the gauge) only.
- `[M]` census of `$813098`: it is a 0/1 LOOP indicator (writers `$259DB4`/`$259DCA`
  only), NOT the dynamic rank. The handlers/bullets/boss "rank" reads are loop
  gates, correct for stage 1.
- `[M]` census of `$81309E` readers: `$2595F2` (discarded, always-4), `$259E92`
  (a draw), `$2650BC`/`$2650CC` (enemy bullet-count selector, gameplay-affecting).
  None feed score/chain/combo arithmetic.
- `[M]` disassembled `$26070C`: it is the `$813082` gate servicer (clears the
  gate, runs `$25D990`+`$260580`), NOT part of the rank formula. Two `bsr`
  callers (`$25C79C`,`$25D664`). Tangential.
- confirmed the fix (port type 10) is ISOLATED from the chain decrement
  `$284636`/`$2847D4`: separate object type, separate dispatch entry, recompute
  reads no chain/score state.
- closed DONE.

status: **DONE**
