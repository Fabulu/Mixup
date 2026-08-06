# W64 IMPL - B2: THE BOMB `$2498E2`

status: **DONE** - **THE OWNER CAN DROP A BOMB.** Gate ALL GREEN 62/0/0 (was
57), 878 unit tests (was 844), webgate 14/14, build-dist clean with
PUBLISH_VERBATIM unmoved at 5. 53 of 53 mutants RED, 0 survivors - **eight of
my own checks could not fail and all eight are replaced.** **NO RANK WRITE
MOVED**: `$81309E` 53, `$81B646`/`$81B648`/`$81B65C`/`$81B65E` 0, on every one
of 2,600 headless frames and every one of 17 browser samples, against a
`rank-poke` control that turns all five rows red. Verified on the LIVE build
`20260805122418` as well as locally. Boot +408 B.

**AND IT COST TWO THINGS, BOTH DECLARED:** the LASER BOMB (bomb while holding
fire) throws by address (§7), and `$2564BA` - the bomb's cooldown expiry - is
the first instruction this port has ever run that clears the seed's `$FF`
invulnerability, which makes `$249F8A`, the HIT/DEATH path, reachable in the
headless harness (§8). The shipped page pins `$FF` every frame, so the owner
does not meet it; a gate does.

wave: 64. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: the BOMB - `$249814`'s zero-hyper-stock arm - **before** the hyper,
against recon 38's own ordering. The owner's blocking item
(`39-OWNER-visible-play-before-sound.md`: *load the page, fly, shoot, laser,
BOMB, kill a visible enemy*).

`[M]` = measured by me this session, over
`games/ddpdoj/tools/oracle/out/maincpu.bin` (the decrypted build-B image,
address == file offset) with capstone `CS_ARCH_M68K` / `CS_MODE_M68K_000`, a
recursive-descent tracer and a write census, and over the PORT driven from the
shipped bundle seed and from the deployed page.

---

## 0. THE ORDERING - **IT WAS NOT LOAD-BEARING, AND THE RECON'S TWO REASONS ARE BOTH STALE**

The brief asked for the BOMB before the HYPER and told me to check whether
recon 38 §6's order (skeleton → hyper → bomb) is load-bearing. **It is not**,
and I did not reorder anything. The recon gave exactly two reasons for putting
the bomb third and `[M]` neither survives:

| recon 38 §6 wave 3 says the bomb | `[M]` this session |
|---|---|
| "It depends on wave 2 for `$285AF2` and `$81B646`" | **Only when `$81B63E` is non-zero.** `$249968 tst.w $81B63E / beq $2499D4` skips both, and `$81B63E`'s only writer is `$285A30`, behind W63's throw, reached only from a hyper stock `$2530CA` can grant - which `src/items.js` REFUSES at the allocator (I2's THE REFUSAL). So the hyper-end call and the −3 are **unreachable by construction**, and the port throws by address on the guard's other arm |
| "...and on the A2/A3 weapon loops `$24518A`/`$24525C` for its own hit bit" | **Ported by W51.** `src/damage.js weaponObjectPass` blocks 7 and 8. And §6 shows the bomb does not need them anyway: its own damage never sets the `$400` bit |

**The real dependency is neither of those.** It is `$24560A` and `$255DD8`, and
they belong to the bomb alone (§1). Doing the hyper first would not have moved
one line of this wave.

---

## 1. THE PREMISE, CHECKED - the brief holds, and recon 38 has FOUR errors

`$249814` is Button 2 with a two-way fork on `$81B65C` and the bomb stock is
`($24,A6)`: both true, both re-derived from the listing. `[M]` the shipped seed
has `$81B65C = $81B65E = 0`, so the BOMB arm is the default, as the brief says.
**`($24,A6)` is `$81040A` and `[M]` THE SEED HAS THREE BOMBS** (the word reads
`$0303`; `$2498E2 tst.b` takes the high byte). P2's `$81046C` is 0.

Four things recon 38 states are wrong, and each one changes the port:

### 1.1 **`$81B6FE` IS NOT "A BOMB IS ALREADY RUNNING" - IT IS THE HYPER'S**

Recon §1.2 names `$2498FC tst.w $81B6FE` that way. `[M]` its only two absolute
writers in `$230000..$2B0000` are `$28732E move.w #$1` and `$2873A4 clr.w`,
both inside `$287324`/`$287340`, and `[M]` those two routines have exactly one
caller each - `$285A38` and `$285A96`, **the HYPER's activation and its
per-frame tail**, both behind W63's throws. So the second refusal is the
hyper's flash interlock and it cannot fire in this port. The refusal that means
"a bomb is already up" is the THIRD one, `$249908`, and it reads the record
this very routine allocates seventy instructions later (§1.2).

### 1.2 **THE BOMB IS AN OBJECT IN THE `$811F72` TABLE**, which recon 38 never says

`$249A4A move.w D2,(A1)` writes `$811F72` - A1 was loaded at `$249902` for the
third refusal and `[M]` survives every intervening call (`$2875B4`, `$242AC6`
×3 and `$2532EA` never touch A1; `$260852`'s `$24150A` SAVES it with `movem.l
d0/a0-a1`). D2 is `$8000 | (($7,A5)<<7) | ($58,A6)`, and `$249A50` copies the
ship's position in behind it.

**That one instruction turns on every gate in this port that reads `$811F72`**
- `src/damage.js`'s `$245614`, `src/score.js`'s `$286884`, `src/effects.js`'s
`$288FBC`, `src/bullets.js`'s `$28153C`, `src/handlers.js`'s `$273A14` and
`$276756`, `src/hud.js`'s `$284A6C`, `src/options.js`'s `$24C8E4` - and
`$249A32 bset #$6,($1,A6)` turns on the SECOND of `$24560A`'s two guards in the
same breath. **There is no version of this wave that ports the trigger and
defers `$24560A`.** `src/damage.js` has said since W51 that both of its guards
are "FALSE on this tree"; that was true only because nothing could press the
bomb.

### 1.3 **THE SCREEN CLEAR AND THE POOL WIPE ARE NOT ON THE ORDINARY BOMB'S PATH**

Recon §1.3 lists `$249ABE jsr $252714` (the pool wipe) and `$249AEA jsr
$243DA0` (the bullet cancel) in one flat table of "what firing one DOES", and
§1.4 builds a whole finding on "the BOMB arm calls `$243DA0` at `$249AEA`".
`[M]` **`$249A7E` is `6076` - `bra.b $249AF6` - and it jumps over thirteen
instructions including both calls:**

```
$249A5C tst.b ($3f,A6) / bne.b $249A80
$249A62 ...the ORDINARY bomb...   $249A7E bra.b $249AF6   <<< SKIPS $249A80..$249AF4
$249A80 ...the LASER bomb...      $249ABE jsr $252714
                                  $249AEA jsr $243DA0     <<< THE SCREEN CLEAR
```

So **a bomb pressed while the ship is not firing a beam does not arm `$81B410`
and does not cancel a single bullet.** Recon §7.2 already falsified
`src/bulletdriver.js`'s "the cancel is driven only from a bomb"; this falsifies
the recon's own replacement for it, in the other direction. Both readings would
have shipped a bomb that wipes the screen where the board's does not.

### 1.4 **`$249AF8`'s `$24A440` READ IS DEAD - recon §7.1 item 5 is ANSWERED**

The recon left three possibilities open ("a deliberate code-as-data read, a
mis-trace of D1, or a second `lea` I have not found") and called it "a
first-order gap for anyone porting `$2498E2`'s tail". `[M]` **it is the first,
and it does not matter: D0 is never read again.** `$249AFA beq`, `$249B02 beq`
and `$249B06 beq` all reach `$249B10`, whose only use of a register is `tst.w
(A2)`; the routine's exit `$249E4E` opens `move.w ($58,A6),D0`. The port does
the branch-free thing the cartridge does - nothing - and **exports no ROM
window for a value the cartridge never uses.** The address is a counted note.

---

## 2. WHAT WAS PORTED - `src/bomb.js`, and the rule that decided it

Every callee was classified by a WRITE CENSUS of its absolute writes to
`$800000..$81FFFF` *and* its address-register-indirect writes, never by name:

```
[M] ZERO RAM WRITES  ->  a counted NOTE, by address:
      $2532EA (49 instr, calls $240DC2/$240E1A)   the bomb's fire cue
      $260852 / $26085C  -> $24150A, a 64-byte RESOURCE INSTALL (data);
                            $24150A is a counted note in six other files
      $28C55C / $28C576  -> the $28Cxxx SOUND family, deferred whole (W53)
[M] RAM WRITES  ->  PORTED
```

| ROM | insn | what | where |
|---|---:|---|---|
| `$2498E2..$249B28` | ~90 | **THE ARM**: three refusals, the stock, the `$812940` counter capped at 99, the chain latch, the three `$242AC6` displays, the RECORD, the invulnerability, and `$249B10`'s hand-off to the OTHER player | `fireBomb2498E2` |
| `$255DD8` | 36 | **TYPE-5 CALL #7**, the cooldown arm and the four-entry dispatch | `bombDriver255DD8` |
| `$255E3E..$255FE0` | ~120 of 292 | the three-phase script machine, its three template installs and both terminators | `bombScript255E3E` |
| `$2564F0` | 14 | **THE TEARDOWN**: the two chain resets, both `($1,A6)` bit 6 clears, and the 45-record wipe | `bombTeardown2564F0` |
| `$2564BA` | 11 | the `$81296C` expiry and its ASYMMETRIC invulnerability clear | `bombCooldownExpiry2564BA` |
| `$2877D0` / `$2877FE` | 18 | **THE CHAIN RESET**, seven stores each | `resetChain2877D0` |
| `$24560A..$2456A4` | ~30 of 468 | **THE BOMB'S DAMAGE**: 150 slots of `$20` from `$81459C`, `$50` HP each | `bombDamage24560A` |
| `$243DA0` | 10 | the bomb's cancel entry - ARM ONLY, `$81B412 := $FFFF` | `armBombCancel243DA0` |
| `$2875B4` / `$287616` | 25 | the pending-grant flush, a PROVEN no-op (§4) | `flushPendingGrants2875B4` |
| `$23FF06` / `$23FF42` / `$23FFB4` | 52 | twelve bytes each into BUCKET 13 (`$80A8DC`, counter `$80AFEC`) | `emitBucket13` |

```
[M] src/bomb.js   ~940 lines   112 distinct ROM addresses cited
```

**ONE new ROM window, 274 bytes** (`$25653C + $112`), a UNION of six extents
each derived from an instruction, asserted on every export by
`check_bomb_extents`. `games/gradius/` NOT TOUCHED.

### 2.1 Four things a "tidy" port gets wrong here

* **`$243DA0` IS NOT `$243E7C`.** `src/midboss.js armScreenClear` is the
  midboss's entry of the same 14-entry family; it arms `$81B412 := 0` and WALKS
  210 slots. The bomb's arms `$81B412 := $FFFF` and RETURNS. The sign is the
  whole behaviour: `src/bulletdriver.js`'s `$281CE0 bmi` sends 0 to the FREE
  arm (whose `$27F8F8` is a counted note) and `$FFFF` to the **TRANSFORM** arm,
  which has no call and has been fully ported since W29. Mutant M15.
* **`$249950 lea $810448,A2` on P1's arm is THE OTHER PLAYER**, and `$2499A0
  lea $8103E6,A2` on P2's. It looks like a transcription slip and it is not:
  `$249B10 tst.w (A2)` reads it to hand the bomb's `$FF` invulnerability and
  its two timers to the other ship. Mutant M14.
* **`$255F7E bchg #$1,(A6)` SETS Z FROM THE OLD BIT.** The frame the bit goes
  0→1 does nothing and the frame it goes 1→0 draws. A port that reads the NEW
  bit draws on the wrong parity and finishes the bomb a frame early. Mutant
  M26, unit test *"$255F7E bchg SETS Z FROM THE OLD BIT"*.
* **`$255ED2` and `$255F4E` FALL INTO the next phase test IN THE SAME FRAME**
  (`$255EF8 beq $255F02`). `[M]` the fade's `($24,A6)` is already 24, not 28,
  at the end of the frame that installs it. A port that returned after the
  install runs every phase one frame long. It was a SURVIVING mutant (§9 E).

---

## 3. READ PAST THE APPARENT END - four places

* **`$249A7E bra.b $249AF6` jumps over both of the arm's `jsr`s** (§1.3). A
  reader who lists the block's calls in address order gets a different weapon.
* **`$2459CE` is a bare `rts` two bytes before `$2459D0`**, which is
  `playerBox`. It is where BOTH of `$24560A`'s guards branch, and it is not
  reachable by reading forward from `$24560A`.
* **`$2456A4` is an `rts` in the MIDDLE of `$24560A`** - the end of the first
  arm, 809 bytes before the end of the routine.
* **`$255FD4` is a `nop` on a live branch.** `$255FCE tst.b ($3f,A0) / beq
  $255FD6` and the arm it guards is one `nop`; both sides reach `$255FD6`.
  Transcribed, because a reader who smooths the branch away has silently
  decided what the `nop` used to be.

---

## 4. `$2875B4` IS A PROVEN NO-OP, AND IT THROWS RATHER THAN GRANTING

The brief: *"I2 refused the hyper-stock item kinds AT THE ALLOCATOR, so
`$2530BE`/`$2530E6` are unreachable by construction. **If your work makes them
reachable, say so loudly.**"*

**IT DOES NOT, and here is the proof rather than the assurance.** `$24991A bne
$249930` calls `$2875B4` only on the bomb that takes the stock to zero, and
`[M]` in the shipped seed `$81B6E4 = 0` and `$81B6E0 = 0`, so `$2875BA beq`
takes the `$2875D6` arm and `$2875DC beq` returns. `[M]` the only producer of
`$81B6E0` in `$230000..$2B0000` is `$2876C6`, inside `$287682`, which
`src/score.js` has NOTED for thirty waves.

The port transcribes the routine and **throws by address at `$2875FC jsr
$27E912`** if `$81B6E0` is ever non-zero, with the whole chain in the message:
one collected hyper item is +1 `$81B65C`, which `$285A62` turns into +1
`$81B646` at the NEXT super, which is +16 RANK, accumulating and paid for ever.
Unit-tested with a pending grant in place (mutants M17, M18 and the replacement
check §9 A).

---

## 5. RANK - every address, digit-identical, to I2's standard

**Four rank addresses plus the fifth the brief added, THREE inputs, and a
control that proves the rows can move.**

| 2,600 frames from the shipped seed | `$81309E` | `$81B646` | `$81B648` | `$81B65C` | `$81B65E` |
|---|---:|---:|---:|---:|---:|
| tap fire, NO bomb (`--break no-press`) | 53 | 0 | 0 | 0 | 0 |
| tap fire, **THREE BOMBS + a fourth press** | **53** | **0** | **0** | **0** | **0** |
| tap fire, three bombs, `--break rank-poke` | **54** | **1** | **1** | **1** | **1** |
| `[M]` 20,000-frame run, ~51 bombs (§10) | 53 | 0 | 0 | 0 | 0 |
| `[M]` deployed page, 17 samples, 3 bombs | 53 | 0 | 0 | 0 | 0 |

The gate asserts each of the five **on every frame** - the first frame any of
them differs from the seed is recorded with its value and its cause - and
`rank-poke` turns all five rows red and nothing else. `$81B64A` (the hyper EARN
accumulator W63 §6.1 moved to 1,512) is **0** in this scenario on both trees,
because this scenario taps rather than holds and never reaches `$287682`.

**WHY NOTHING MOVED, from the listing and not from the run:**

* `$249976 subq.w #$3,$81B646` - the bomb's −3 - is behind `$249968 tst.w
  $81B63E / beq $2499D4`, and `[M]` `$81B63E` cannot be non-zero in this port
  (§0). The port **throws at `$285AF2` by address** on the other arm, in FRONT
  of the debit, so a run that ever reaches it has not silently moved the word.
  Unit test *"BOMBING WHILE HYPERING THROWS AT $285AF2"* asserts both the throw
  and that `$81B646` is unchanged after it.
* `$24560A` writes `$812952`, `$812954` and the enemy pool. It touches no rank
  word.
* `$2564F0` writes the chain block, `$81294C` and the 45 records. No rank word.
* `$81309E` still cannot move in this port at all: `[M]` `$2608D2` and
  `$260794` (object type 10) remain ABSENT from `src/`. W60, W61, W62 and W63
  each said this and it is still true.

**THE FRAME POSITION, and B1's answer still holds.** The bomb's debit is in the
PLAYER object (`$2491C0`/`$249246`) and B1 settled by measurement that
`$240F62`'s second longword is the dispatch priority and `$24111E` keeps the
table descending, so rank(`$1F`) > player(`$1C`) > ledger(`$09`). `[M]`
**re-measured this session on this tree: `w63hudgate` still reports 6,200 of
6,200 frames `rank < player < ledger`, 0 bad**, with the bomb ported. So a
debit would land on frame N+1 - and there is none to land.

---

## 6. THE CHAIN ON BOMB KILLS - RE-MEASURED, and the answer is TWO answers

The brief warned that W63 §5.4's claim about `src/score.js`'s second chain
machine "is exactly the kind of claim with a shelf life". Re-measured:

### 6.1 A bomb KILL is ORDINARY - `$286876` is the BEAM's, not the bomb's

`[M]` `$24560A`'s only OR into an enemy record is `$24569A or.w D6,(A5)` with
D6 = `$80FA72`, **the pass mask** (`$1000` for P1, `$0800` for P2). It is never
`$400`. The `$400` bit has exactly two setters and both are in the A2/A3 weapon
loops (`$245242`, `$2452F2` - recon 38 §1.5). So a bomb kill goes through
`$28615E`/`$2862C6`, the ordinary chain machine, exactly as recon 38 §4.2 says.

`[M]` `.scratch/w64chain.mjs`, 1,600 steps, three inputs, counting `$81B636` -
the rank divider `$2868AE` seeds and nothing else writes:

```
[M] tap fire, NO bomb        $81B636 non-zero on    0 frames
[M] tap fire, THREE BOMBS    $81B636 non-zero on    0 frames
[M] HELD fire, no bomb       $81B636 non-zero on 1169 frames
```

**W63 §5.4 stands and is now measured against the bomb as well: `$286876` is
reachable, is ported, and is reached by the BEAM. The bomb does not reach it.**
`src/score.js` needed no change this wave and got none.

### 6.2 **A BOMB ENDS A RUNNING CHAIN - 113 FRAMES LATER**

This is the bomb's real chain effect and no document in this repo had it.
`$2499D4 tst.w D0 / $2499D8 move.w #$1,(A3)` latches `$81B5AE` when the meter
was non-zero at the press; `$2564F0`, at the END of the bomb's script, cashes
that latch in for `$2877D0`, which zeroes the whole P1 chain block - both BCD
accumulators, the meter, the popup mirror, both per-link adders and the chain
COUNT. `[M]` on the deployed page:

```
[M] BOMB1 +0.5s   meter 24  chain 32   $81B5AE 1
[M] BOMB1 +3.5s   meter  0  chain  0   ...the teardown ran at lf3547
```

and `[M]` in the gate, 3 of 3 teardowns had `$81B5AE` latched and the meter was
0 on all three teardown frames. It is a row of the gate with its own control
(`no-driver` reddens it, `frozen-stock` does not).

**AND THE SCORE IS LOWER WITH BOMBS**, which is worth stating because it is the
opposite of the naive expectation: `[M]` 1,600 steps, identical inputs, total
`$39028` with no bomb and `$38790` with three. A bomb kills enemies that would
otherwise have been chained.

---

## 7. THE LASER BOMB - **BROKEN RATHER THAN FAKED**, and it is the one thing

`$249A5C tst.b ($3f,A6) / bne $249A80`. That byte is the one `src/laser.js`
sets at `$24C282` when the beam's arm-up completes and clears at `$24C2D6` on
release - so this arm is **"bomb WHILE HOLDING FIRE"**, and it is not "the same
bomb with one extra flag". `$249A98 bset #$0,($1,A1)` sets bit 0 of the BOMB
RECORD's own type word, and that bit is read in two places:

* `$255E16 andi.w #$7,D0` → table entry 1 = **`$255FE2`**, a FOUR-record bomb
  (`$25600C lea ($7B0,A1),A1`, three more script pointers at `($7FE,A6)`,
  `($82E,A6)`, `($85E,A6)`), 302 instructions plus `$2561AA`, `$2562FC`,
  `$256346`, `$2563B6`, `$256468` and `$289FF4`;
* `$245632 btst #$0,D5` → **`$2456A6`**, the other 809 bytes of `$24560A` (a
  bounding box over all 45 records, then two pool walks).

`[M]` ≈630 instructions with their own ROM windows. **The port throws at
`$249A80`, the arm's FIRST instruction, so no partial state is written**, and
the message names both routines and says what to do instead (tap fire rather
than hold it). S1's precedent: declare it and prefer broken to fabricated.

**WHAT THIS COSTS THE OWNER, precisely:** load the page, fly, shoot, laser,
bomb - all five work. *Holding* the beam and bombing in the same instant stops
the page with `UNPORTED $249A80`. It is wave B3's, with `$255FE2` and
`$2456A6`.

---

## 8. WHAT THIS WAVE MADE REACHABLE - and the biggest is not the bomb

### 8.1 **`$249F8A`, THE HIT/DEATH PATH** - reachable for the first time since wave 4

`$249524 tst.b ($3e,A6)` sends an INVULNERABLE player to `$24952A bclr
#$4,(A6)`, which clears the same bit *without branching*. `[M]` the shipped
seed has `($3e,A6) = $FF` and `$249530 cmpi.b #$FF / beq` means `$FF` never
counts down - so from wave 4 to wave 63 nothing in this port could clear it and
`$249542 bclr #$4,(A6) / bne $249F8A` could not fire.

**`$2564BA clr.b ($3e,A0)` - the bomb's cooldown expiry, 40 frames after the
script ends - is the first instruction this port has ever run that clears it.**
So a bomb makes the ship MORTAL, and the next hit reaches `$249F8A`: 212
instructions, twenty callees, and among them `$24A00C lsr.w #$2,$81B646`
(**death QUARTERS the rank power word**), `$24A01C clr.w $81B65C` and `$249FDA
jsr $287682`. That is rank-critical and item-granting ground and it is not this
wave's.

**IT IS NOT FIXED, IT IS DECLARED**, with the address, in `src/player.js`'s
throw text, and it is a GATE ROW: *"the ONLY stop is `$249F8A`, the hit path a
BOMB makes reachable"*, matched by `romAddress`. Its other half is the
`no-press` control - `[M]` **the same 2,600-step run with no bomb does not stop
at all.**

**AND THE OWNER DOES NOT MEET IT.** `src/web/app.js:699 g.ram.setU8(INVULN,
0xff)` - the fly-around scenario's intervention, in the shipped page - re-pins
`$810424` every frame, so on the page `$2564BA`'s clear is undone the same
frame and the ship never dies. `[M]` `inv` is `ff` on all 17 browser samples
and `PAGE ERRORS []`. That is the page's doing and not the port's, and it is
recorded here because the day that poke goes, this throw arrives.

### 8.2 **W62's `$294F68` WINDOW WAS SHORT - FIVE PAIRS, AND THE TABLE IS SEVEN**

`[M]` a 20,000-frame run that bombs reaches `$2596F4 movea.l (A0,D0.w),A0` with
D0 = `$28` at **logic frame 9,153**, where the same run without bombs had never
got past lf 19,533's `$228658`. Bombs kill the midboss sooner, so the boss
arrives sooner. `[M]` entries [5] and [6] are `($295616,$295626)` and
`($295684,$2956F6)` - ordinary `$295xxx` script pointers - and [7] is
`$397C00C0`, i.e. `move.w #$C0,...`, **CODE**. So the extent is SEVEN pairs.

Widened to `$0038` with `check_boss_a4_extent` asserting all three facts on
every export. `[M]` the throw now names the SCRIPT (`UNPORTED $295616`) instead
of the table, which is precisely what W62's own comment says the window is
for. **A short window is not caught at the export; it is caught by
`src/rom.js` on a player's machine** - W54 §6.2, arriving for the third time.

### 8.3 Bucket 13 - the bomb DRAWS, and the picture is still not there

`$23FF06`/`$23FF42`/`$23FFB4` are ported: twelve bytes each into `$80A8DC` with
`$80AFEC` bumped by `$C`. `[M]` **174 records over three bombs on the deployed
page, ~58 per bomb.** Bucket 13 has no harvested sprite shard, so
`src/render/index.js` SKIPS every record whose stream is not in the sheet - the
same shape as W63's HUD. The STATE is this port's; the picture is not, and no
new sprite shard ships.

---

## 9. EVERY CHECK SEEN TO FAIL - 53 mutants, 53 RED, 0 survivors

`.scratch/mutate64.mjs`: apply ONE edit with a single-occurrence anchor, run
ONE check, require a NAMED test or a NAMED gate row RED, restore, **verify
sha256 byte-identical**. 180-second timeout per child (W62 §11.1 found a check
that HUNG rather than failing).

```
[M] 53 of 53 mutants turned a NAMED check RED; survivors 0; SKIPPED 0
```

**EIGHT OF MY OWN CHECKS COULD NOT FAIL, ALL EIGHT FOUND BY THE MUTANTS**, and
all eight are replaced with checks that can:

| | what was wrong | the check that exists now |
|---|---|---|
| **A** | `$24991A`'s "only the LAST bomb calls `$2875B4`" - every fixture had `$81B6E0 = 0`, so the routine was a no-op on BOTH sides of the branch and the two readings agreed everywhere | a fixture with ONE pending grant: stock 2→1 must NOT throw and stock 1→0 must throw at `$27E912` |
| **B** | `$24990E move.w #$1,$803938` - nothing read the queue word back | it is asserted after a fire AND after a refusal, which is what "before the consume, after the three vetoes" means |
| **C** | `player.js`'s hyper fork - no unit test drives `bombAndShotGuards` at all | a GATE ROW with its own short run: `$81B65C := 1` before the press must stop at `$249868` with zero bomb events |
| **D** | `$255E74`'s last install word - nothing in the port reads `($2E,A6)`, so a 15th word landing two bytes wide was invisible | it asserts `($2E,A6)` IS written and `($30,A6)` is NOT - because `($30,A6)` is the NEXT RECORD's type word, and writing it would make slot 1 look live |
| **E** | `$255F3E move.w #$1C,($24,A6)` - the gate counted PHASES, not the length of one, so a fade seven eighths as long was green | a nine-frame walk asserting the borrow, `($2a,A6)` 6→5, the reload to `$1C`, and that the sixth borrow installs the blink |
| **F** | `$24567A cmpi.w #$9800 / bhi` - the fixture was so far outside the bound that `$9900` rejected it too | `y = $7040` gives d1 = `$9800` exactly, which `bhi` ACCEPTS, and `$7041` gives `$9801`, which it does not |
| **G** | `$245688 bmi` read as bit 14 - same shape: no fixture had bit 14 set and bit 15 clear | the enemy's +X reach is set to `$6000` so d2 = `$7000` (bit 14 SET) and must still be hit, and `$7100` so d2 = `$8100` and must not - and the +X and −X extents are set INDEPENDENTLY, which is the only way to do it without pushing d3 past `$6000` |
| **H** | `player.js`'s `if (what.startsWith('fired')) return` - a port that returns on refusals too is invisible to every other row | a GATE ROW on `($3c,A6)`, `$249B50`'s own byte: 0 on the three FIRED press frames (they took `$249B28 bra $249E4E`) and 1 on the refused one (it fell through to `$249B2C`, the cadence machine) |

F and G are W61's M4/M33 and W63's D/E for the third time: **a fixture sitting
where two readings agree is not a check.**

**AND THE GATE HAS FOUR CONTROLS**, because one cannot separate four claims:

```
[M] --break no-driver      type-5 call #7 counted, not run (i.e. HEAD)   11 RED
[M] --break no-press       Button 2 never pressed                        12 RED
[M] --break rank-poke      +1 into each of the FIVE rank words        5 RED, all rank
[M] --break frozen-stock   ($24,A6) restored to 3 every step             9 RED
```

`no-driver` is the sharpest: `[M]` the record is allocated and **never freed** -
1 of 45 slots dirty at the end, `($1,A6)` bit 6 set on all 2,500 frames, zero
teardowns, zero phases, zero expiries, and `$24560A` damaging for ever. The two
rows that stay green under it are the ones about the ALLOCATION, which is
exactly the half the driver is not.

---

## 10. THE POOL, TO E5b's STANDARD - a LONG run, because W33's leak showed at 2,906

`.scratch/w64drain.mjs`, 20,000 steps, a bomb every 140 frames, the stock
re-filled by the PROBE (not by the port) so that the ship stays `$FF` and the
run is about the pool rather than about §8.1:

```
[M] bombs fired 51   teardowns 50   $24560A slot-hits 5,536
[M] $811F72 pool: MAX **1 of 45** slots occupied, live on 5,403 frames,
                  1 at the end (a bomb was in flight when the run stopped)
[M] bucket 13: 2,931 records emitted, 58.6 per bomb
[M] RANK: $81309E 53  $81B646 0  $81B648 0  $81B65C 0  $81B65E 0  $81B64A 0
```

**The bomb allocates ONE slot and `$2564F0` frees FORTY-FIVE**, which is the
cartridge's own `moveq #$2C,D7` and not a tidy-up: the unit test asserts slot
44 IS cleared and slot 45 is NOT (`$256530`'s off-by-one would be invisible
otherwise). The gate's own row is 0 of 45 dirty at the end and it goes red
under `no-driver`.

**AND NO OTHER POOL IS ALLOCATED FROM.** `$2875B4`'s `$27E912` throws (§4);
`$243DA0`'s cancel is unreachable (§1.3); `$24560A` allocates nothing.

---

## 11. COVERAGE - branches and table entries, never frames

* **`$2498E2..$249B28`: ~90 transcribed, [M] all but the LASER arm REACHED.**
  Both `$249936`/`$249986` player blocks are transcribed and P1's is reached;
  the `$2499DC` display block is reached ONCE per life (its own `bset` shuts
  it, `[M]` `$249A2E` sets `(A6)` bit 6 and only `$252EBC`/`$252F4C` - an item
  pickup - clear it). The three refusals: **[M] 2 of 3 REACHED** (no-stock and
  bomb-already-up), and the third is proven unreachable (§1.1).
* **`$255DD8`'s FOUR dispatch entries: 4 transcribed, [M] 1 REACHED.** Entries
  1 and 3 are `$255FE2` and throw (§7); indices 4..7 read code as a pointer and
  throw with the record's value.
* **`$255E3E`'s THREE phases: 3 transcribed, [M] 3 REACHED**, 51 times each in
  §10's run. Its three `($1,A6)`-bit-1 twins are transcribed as throws.
* **`$24560A`'s TWO arms: 2 transcribed, [M] 1 REACHED.** `$2456A6` throws.
* **`$2564F0`'s TWO chain resets: 2 transcribed, [M] 1 REACHED** - P2's
  `$81B5B0` is never latched because `$8130C0` is `$FFFF` in the seed. Both are
  unit-tested and the test asserts P1's does NOT touch P2's block.
* **`$2564BA`'s two arms: 2 transcribed, 2 unit-tested, [M] 1 REACHED** (the
  bomber's `$FF`).
* **`$2875B4`: transcribed, [M] REACHED on the last bomb and it returns at
  `$2875DC`**; its grant loop throws.
* **The `$25653C` window: 6 sub-extents, [M] 3 REACHED** (`$25653C`,
  `$2565BC`, `$25661E` and their two scripts); the three bit-1 twins are
  exported inside the union and throw.
* **Transcribed and unexercised, NAMED:** `$243DA0` (the ordinary bomb never
  calls it, §1.3); P2's whole arm; `$2875B4`'s `$81B6E4` arm; `$249B10`'s
  partner hand-off (P2 is dead in this seed); `$2499E8`'s `$9A`/`$2` floor.
* **Unit tests 844 → 878, 0 skipped.** New file `tests/w64bomb.test.js` (34).
  `webgate` **14 of 14**, unmoved.

---

## 12. THE PAGE, IN A REAL BROWSER - WHAT I SAW `[M]`

Chrome + Python `playwright`, W61/W62/W63's recipe, **fire TAPPED** (80 ms down
/ 240 ms up, the owner's own `z`) and Button 2 is `x`. Tapped and not held for
two reasons: a chain has to be STARTED before a bomb can be seen to end it, and
holding past the beam's arm-up is §7's throw. The page is READ, not only
photographed.

### 12.1 DEPLOYED - `https://gbtman.pages.dev/games/ddpdoj/`, build `20260805122418`

```
[M] BOOTED      lf 2313  stock 3  rec 0     hits   0  draws   0  rank 53/0/0/0/0
[M] BEFORE      lf 3324  stock 3  rec 0     hits   0  draws   0  meter 45 chain  6
[M] BOMB1+0.5s  lf 3377  stock 2  rec 8100  hits 145  draws  23  meter 24 chain 32  latch 1
[M] BOMB1+3.5s  lf 3589  stock 2  rec 0     hits 350  draws  58  meter  0 chain  0  teardown 1
[M] BOMB2+0.5s  lf 3828  stock 1  rec 8100  hits 390  draws  81  phase1 2
[M] BOMB2+3.5s  lf 4042  stock 1  rec 0     hits 425  draws 116  teardown 2
[M] BOMB3+0.5s  lf 4272  stock 0  rec 8100  hits 492  draws 138  phase1 3
[M] BOMB3+3.5s  lf 4479  stock 0  rec 0     hits 549  draws 174  teardown 3
[M] FINAL       lf 6346  stock 0  rec 0     pool 0 of 45   total 0x35216
[M] rank 53 / power 0 / 0 / hyper stock 0 / 0 on EVERY ONE of the 17 samples
[M] PAGE ERRORS []   -- no throw, no console error, 60.0 Hz throughout
```

**That is the wave's whole result, on a screen: press X, the stock falls 3 → 2
→ 1 → 0, a `$8100` record appears in `$811F72` and lives about 113 frames,
`$24560A` takes `$50` off every live enemy on the screen every one of those
frames, the chain the bomb was thrown into is DELETED at the teardown, all 45
records go back to 0, and the ship is invulnerable while it runs.** Before this
wave, pressing X stopped the page with `UNPORTED $249814`.

What is NOT there, and a reader should hear it from me: **the bomb has no
picture.** Its 58 bucket-13 records a bomb are real and countable and the
renderer skips every one of them for want of a sprite shard. On screen the
bomb is: the enemies dying, the ship's own invulnerability, and nothing else.
The "B B B" in the shot below is the HUD layer, which is still `$240DC2` and
still not the port's.

Screenshots: `.scratch/w64local-0boot.png`, `-before.png`, `-bomb1.png`,
`-bomb2.png`, `-bomb3.png`, `-final.png` (local) and `.scratch/w64live-*.png`
(deployed).

### 12.2 LOCAL (`python -m http.server 8764`), and it agrees

```
[M] 3 bombs, stock 3 -> 0, 398 slot-hits, 174 bucket-13 records,
    3 teardowns, pool 0 of 45, rank 53/0/0/0/0 on all 17 samples, no error
[M] BOMB1: meter 17 -> 54 at the press (the kills) -> **0** at the teardown
```

### 12.3 **THE FIRST DEPLOYED RUN WAS A STALE EDGE, AGAIN**

W63 §11.3 recorded that a page confirmed live on three consecutive build-id
polls can still serve a stale `main.js` from another node. `[M]` it happened
again, in the sharpest possible form: the run taken immediately after
`publish.mjs` confirmed `20260805122014` failed with **`g.bombEvents is not
iterable`** - i.e. the browser was running W63's `main.js` on a page whose
build id was W64's. Re-running after a republish gave §12.1. A wave that took
the first run as its result would have reported itself broken.

---

## 13. THE GATE, ON THE SETTLED TREE

W58 §6's rule: a gate started before the tree settled is not evidence about the
tree. The run below started **after** `.scratch/mutate64.mjs` had finished
touching `src/` and after the last test edit; nothing was edited while it ran.

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 62 passed, 0 failed, 0 SKIPPED
  [PASS] THE BOMB: $2498E2, $255DD8, $24560A and $2564F0
  [PASS] THE BOMB RED [no-driver]      -- went red without type-5 call #7
  [PASS] THE BOMB RED [no-press]       -- went red with Button 2 never pressed
  [PASS] THE BOMB RED [rank-poke]      -- went red with a rank word poked
  [PASS] THE BOMB RED [frozen-stock]   -- went red with the bomb stock frozen
```

**57 → 62 stages, and the five new ones are this wave's scenario and its four
REDs.** Nothing was disabled, skipped, narrowed or loosened. The ones this wave
could plausibly have broken, all green:

- **`fly-around: port vs board, 0 divergent frames` and its 5 REDs** - the only
  port-vs-board window this project has. It presses no button, so nothing
  bombs.
- **`THE CHAIN EXPIRES` and its 3 REDs** (W63's) - including the object-ORDER
  row this wave depends on for §5's frame-position answer.
- **`STAGE 1 ENDS` and its `RED [no-timeout]`** - the port still reaches lf
  19,218 and still stops on `UNPORTED $228658`.
- `display list`, `pixel gate` (100.0000 %), `demo gate`, `midboss DEATH`,
  `assets/integrity` and its `[rom-byte]` ROM-LEAK GUARD (one new ROM window
  and one widened one went through it), and the `background shard gate` - the
  stage that FRESH-EXPORTS, i.e. where `check_bomb_extents` and
  `check_boss_a4_extent` actually run.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/     878 pass, 0 fail, 0 SKIPPED   (was 844)
node games/ddpdoj/tools/webgate.mjs 14 of 14 PASS                 (unmoved)
node tools/build-dist.mjs           clean, 5 deliberate exception(s)  <- UNMOVED
```

### 13.1 THE BOOT COST - one new window, one widened, 408 B

```
[M] manifest.json            10,776 ->  10,776      +0   (no new shard)
[M] player.tables.json.gz   140,115 -> 140,523    +408
[M] spr/streams.u32.gz         1,055 ->   1,055     +0
[M] seed.bin.gz                6,878 ->   6,878     +0
[M] capture.json.gz            3,920 ->   3,920     +0
[M] TOTAL                   162,744 -> 163,152    +408 B = 0.40 KiB
```

**+408 B for 274 new cartridge bytes (`$25653C + $112`) and 16 widened ones
(`$294F68`)**, hex-encoded at two characters a byte before gzip. **No new
sprite shard**, so `manifest.json` - the one body served uncompressed - does
not move, and `PUBLISH_VERBATIM` does not grow.

---

## 14. WHAT THIS WAVE DID NOT DO

- **THE HYPER.** Recon 38's wave 2, and `src/player.js` now throws for it under
  its own name at `$249868` instead of calling it "THE BOMB".
- **THE LASER BOMB** (§7) - `$255FE2` and `$2456A6`, ≈630 instructions.
- **`$249F8A`** (§8.1) - found, declared, named in the throw, not ported.
- **THE BOMB IS NOT DRAWN** (§8.3).
- **`$2926E2`'s TAIL** - W63 §5.3's, still not fixed; not this wave's.
- **Nothing is compared against MAME.** No gate in this repo has ever pressed
  Button 2 against the board, and this wave did not build one. What is proved
  is that the port runs the cartridge's own instructions in the cartridge's own
  slots. **Whether the board's `$811F72` record lives 113 frames is
  unmeasured**, and so is whether its `$24560A` takes `$50` off the same 150
  slots on the same frame.
- **`games/gradius/` was not touched.**

---

## 15. WHAT I COULD NOT DETERMINE

* **Whether `$81B5AE` is EVER cleared.** `$2499D8` sets it and `[M]` no absolute
  writer in `$230000..$2B0000` clears it inside anything this port runs - it is
  1 for the rest of the run after the first bomb thrown into a chain. So the
  SECOND and third bombs also reset the chain, whether or not one was running.
  Transcribed as written; the reader is elsewhere, probably in the life reset.
* **What `$812952`/`$812954` are for.** `$245622 move.w #$7800` and `$24562C
  move.l D0` run on every frame of every bomb and nothing in `$24560A`'s
  reachable arm reads either. `$245802 movea.l $812954,A5` does, inside
  `$2456A6` - §7's arm.
* **`$249AF8`'s read is dead in THIS routine** (§1.4). Whether the four-word
  region at `$24A440` is a table the cartridge means to have, or code the
  author indexed by accident, I did not decide and do not need to.
* **The `$28C55C` cue and `$2532EA`** - counted, and sound is item 6.
* **Whether the board's ship is invulnerable at the seed's own frame.** The
  seed has `($3e,A6) = $FF` and the page pins it (§8.1). `$FF` is a value the
  game itself writes at `$2495A2`, so the seed is not obviously wrong - but the
  question of what the BOARD does 40 frames after a bomb is exactly the
  unmeasured half of §8.1 and it is open.

---

## 16. ONE PARAGRAPH

**The owner can drop a bomb.** `$249814` had been one throw with one name for
both of its weapons since wave 4; it is now a fork on `$81B65C` whose hyper arm
says HYPER and whose bomb arm runs. `src/bomb.js` ports the arm `$2498E2`, the
type-5 driver `$255DD8` and its three-phase script, the ninth block of
`$244D62` - `$24560A`, which `src/damage.js` had thrown on since W51 - and the
teardown `$2564F0` that resets the chain, clears both players' `($1,A6)` bit 6
and wipes all forty-five records. The single fact that organises all of it is
one recon 38 never states: **`$249A4A move.w D2,(A1)` writes `$811F72`**, so a
bomb is an OBJECT in the table `src/damage.js` calls the bomb-laser's record,
and pressing it turns on seven subsystems' gates at once - which is why the
damage could not be deferred and why the driver had to ship in the same commit
as the allocator. Recon 38's ordering was not load-bearing: both of its stated
reasons for putting the bomb third are stale, and I said so rather than
reordering. **No rank word moved** - five addresses, three inputs, 20,000
frames and seventeen browser samples, against a poke that turns all five rows
red. What it cost is stated twice, in the code and here: bombing while holding
the beam throws by address, and the bomb's own cooldown expiry is the first
thing this port has ever run that makes the ship mortal. **Press X on
`https://gbtman.pages.dev/games/ddpdoj/` and watch three bombs take 549 points
of damage off the screen.**

status: **DONE**
