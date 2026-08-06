# 110 -- RECON: the BEE PORT PLAN (yellow 500-pt medals)

status: **DONE.** opened IN PROGRESS 2026-08-06 after the premise check, closed
same day. (The dig was quick because 73 already mapped the mechanism; this wave's
job was to verify 73/W105 against the image, mark every piece ported/unported/
dead, and cut the smallest stage-1 port. No source under `games/ddpdoj/src/` was
modified. No commit.)

started: 2026-08-06. wave: 110. role: RECON (READ-ONLY; the only tree file I
write is this one; throwaway scripts live in `.scratch/w110/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address
is build B. instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address ==
file offset, big-endian, M68K), read by a throwaway python script
(`.scratch/w110/verify.py`) that opens the image directly.

`[M]` = measured by me this session, from the image or this tree. The ported
set is DERIVED from source (each subsystem's own registration / handler map /
`TYPE5_PORTED` set), never a hand list.

This is the port plan a later implementer can execute. It maps the FULL bee
lifecycle from the ROM with addresses, marks each piece ported / unported /
dead, and states the SMALLEST port that makes a bee appear, fly, get collected
and award the correct score in stage 1.

---

## 0. PREMISE CHECK -- the W105 brief is SOUND

The brief (from W105 sec 1) rests on six load-bearing claims. I verified every
one against the image this session. **All six hold.** Details:

| claim (W105 / recon 73) | `[M]` from the image this wave | verdict |
|---|---|---|
| pool A geometry: `$8171BE + 70*$2C == $817DC6`, `+ 10*$2C == $817F7E` (live count) | arithmetic closes EXACTLY | CONFIRMED |
| 20-kind dispatch at `$27F99E`, kinds 1 and 16 = `$27FACC` (the bee) | `[M]` read all 20 longwords; kind[1]=kind[16]=`$27FACC` | CONFIRMED |
| base ladder `$27FD22` = ten BCD longs `$100..$1000`, index 4 = `$0500` | `[M]` read all ten; matches | CONFIRMED |
| `$27F92A` (reserved-ten bee arena) has exactly ONE abs-long caller: `$2767E6` | `[M]` scanned `$230000..$2B0000` for `4EB9 0027F92A`; one hit, `$2767E6` | CONFIRMED |
| the three allocators: `$27F8EE` 7 callers, `$27F8F8` 4, `$27F92A` 1 | `[M]` abs-long scan returned the same seven / four / one sites W105 lists | CONFIRMED |
| the count gate `$27FBFA cmpi.w #$A,$817F80`; the cursor ratchet `$27FC0C addq.w #$4,$817F82`; the x2 `$27FC22 add.l D0,D0` (BCD overflow bug) | `[M]` bytes at each address: `0c79 000a 00817f80`; `5879 00817f82`; `d080` (= add.l D0,D0) | CONFIRMED |

The carrier's death arm at `$2767D0` also decodes exactly as recon 73 sec 3.1
transcribed it (`[M]` byte dump): `moveq #$1,D0 / jsr $28615E` (scoreKill, 1 pt)
/ `jsr $28C25A` (death cue) / `move.w ($1A,A5),D0` (= `$0004`, bee kind index 1)
/ `move.b ($1F,A6),D2` (display layer) / `jsr $27F92A` (the reserved-ten
allocator) / `moveq #$C,D0 / jsr $289004` (the pool-B explosion allocator).

**One micro-correction to my own verification script (not to 73):** the sub
prototype at `$2766E6` is a STREAM that the long-form init `$2637AC` COPIES into
the sub-record. The HP `$000A` lives at prototype byte `0x14` (word 10 of the
stream) and is WRITTEN to sub-record offset `+$18`; it is not at prototype byte
`0x18`. Recon 73's "+$18 = $000A" names the SUB-RECORD field, not the prototype
offset, and the prototype stream `[M]` (`8100 FA00 FD00 001B CA34 0618 0500 0700
0400 0400 000A 1000 001C 0000`) contains every value 73 claims. No bug in 73;
recorded here because the same offset conflation cost me a minute and will cost
an implementer more if it is not said plainly.

**THE BEE PORT IS UNBLOCKED.** Nothing in the brief is false. The carrier is
already ported; the bee sprite is already exported; the score adder is already
ported; the collision block that collects the bee is already transcribed. What
is missing is one allocator, one fill, one driver, one body, two wires, and a
decision about the rank gauge. That is the rest of this document.

---

## 1. THE BEE LIFECYCLE, MAPPED FROM THE ROM

The medal IS the bee. It is **kind index 1 (and 16) of POOL A**, the "impact"
pool at `$8171BE`, driven by **type-5 call #4 `$27F95A`** (the type-5 subsystem
bus, mechanism #3 in W105's three-mechanism split). It is NOT an item-pool kind
(item kinds score `$10`/`$1000`, never 500; `[M]` `medal`/`bee` appears nowhere
in `games/ddpdoj/src/`).

### 1.1 SPAWN -- who allocates a bee, and when

**The carrier is enemy type `$8A`.** `[M]` its handler `$276702` is registered
in `src/handlers.js`'s `enemyHandlerMap` (line 3278: `[0x276702, handler8A]`),
and the body `handler8A` (line 1995) ports the proximity test, the `bchg #$6`
50%-duty-cycle emit gate and the `eori.l #$B4` sprite toggle line for line (W30).
**The carrier is FULLY PORTED.** Its init body `$2766AE` (registered in
`src/initbody.js`) calls `$2637A2` with the sub-record prototype `$2766E6`
(sprite `$1BCA34`, size `$0618`, HP `$000A` = 10) and the record prototype
`$2766E0` (which sets `($1A,A5) = $0004` = the bee kind index).

**A bee appears ONLY when its carrier dies.** The death arm `$2767D0..$276814`
(recon 73 sec 3.1, `[M]` re-verified) runs on HP < 0:

```
$2767D0  moveq #$1,D0 / jsr $28615E      <- scoreKill, 1 pt            PORTED
$2767D8  jsr $28C25A                       <- the death cue             NOTE (sound)
$2767DE  move.w ($1A,A5),D0                <- = $0004, bee kind index 1
$2767E2  move.b ($1F,A6),D2                <- the display LAYER byte
$2767E6  jsr $27F92A                       <- RESERVED-TEN ALLOCATOR     NOTE (the gap)
$2767EC  moveq #$C,D0 / jsr $289004        <- pool-B explosion           PORTED (spawnEffect)
$2767F4..$276810  the $278320 remap + the $24179E scroll hook
$276814  jmp $263762                       <- free the carrier           PORTED
```

`deathSeq8A` (`src/handlers.js:2083`) ports the scoreKill, the cue note, the
`$289004` explosion (via `noteEffect` + the W54 effect pool) and the field
writes. **The one line that is a counted NOTE is `$2767E6 jsr $27F92A`**
(`src/handlers.js:2088`): the bee is never allocated.

**The three pool-A allocators `[M]` (abs-long caller counts, lower bound):**

| allocator | arena | slots | abs-long callers | role |
|---|---|---|---|---|
| `$27F8EE` | general | 70 (`$8171BE`, stride `$2C`) | **7** (`$27665A` `$276908` `$2774C8` `$2777E2` `$27A380` `$27EF90` `$27F294`) | the 18 non-bee kinds |
| `$27F8F8` | general, alt entry | 70 | **4** (`$281D2E` `$281E3A` `$282016` `$29EC6A`) | the 18 non-bee kinds (D0 from registers 73 did not trace) |
| `$27F92A` | RESERVED TEN | 10 (`$817DC6`, just past the 70) | **1** (`$2767E6`) | the bee ONLY |

`[M]` the reserved ten sit at `$8171BE + 70*$2C == $817DC6`, and
`$817DC6 + 10*$2C == $817F7E` is the pool's LIVE COUNT word. So the bee arena
is a fixed-size ring bolted onto the end of the general arena, and a bee can
never fail to allocate because the general arena is busy. (`$27F92A` is NOT
`$27F8EE` with a different base -- 73 sec 11 item 4, and the single-caller scan
confirms it.)

**What triggers a bee drop in stage 1.** `[M]` recon 73 sec 3.2 parsed the
stage-1 spawn script (`$263336`, 339 records): **exactly TEN type-`$8A`
records**, triggers 173..452 of a 488-span stage -- none in the opening third.
The carrier is the ONLY stage-1 source of bees. (The 18 non-bee pool-A kinds
come from `$27F8EE`/`$27F8F8`; whether any of those callers fire in stage 1 is
UNRESOLVED -- sec 3.)

**Carrier `$8A` ported?** YES (`handler8A`, W30). **Its bee-drop arm
(`$2767E6`) a counted note?** YES (`deathSeq8A` line 2088, `u?.note(0x27f92a,
...)`). That single note is the gap's first half.

### 1.2 DRIVE -- the pool-A driver `$27F95A` (type-5 call #4)

`$27F95A` is the fourth `jsr.l` in the type-5 call list inside `$28B5E0`
(`src/type5.js:160`, index 3). `[M]` the driver head decodes as recon 73 sec 1.2
transcribed it:

```
$27F95A  move.w $817F7E,D7 / beq rts       <- LIVE-COUNT-driven: 0 live -> do nothing
$27F964  lea $8171BE,A6                     <- walks all 80 slots as ONE array
...       move.w $813176,D6                 <- the scroll word (same one items use)
$27F976  D1 = (A6) / beq -> next            <- slot empty -> skip
$27F97A  ($4,A6) -= $813176                 <- apply scroll to the SHORT axis
$27F97E  moveq #$7C,D0 / and.w D1,D0        <- 5-bit kind INDEX (bits 6..2)
$27F982  tst.b D1 / bmi $2810CA             <- a second, higher-priority arm
$27F988  lea ($27F99E,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
```

So: live-count-driven walk over all 80 slots, scroll the record, mask the status
word to a 5-bit kind index, dispatch through the stride-4 single-pointer table
at `$27F99E`. The mask `$7C` = 32 indices against 20 valid longwords (indices
20..31 run off the end into code at `$27F9EE` -- 73 sec 11 item 2: RANGE-CHECK
TO 20 AND THROW).

**The bee body `$27FACC` (kinds 1 and 16) per frame** (recon 73 sec 1.3/1.4,
`[M]` the dispatch head `$27FACC: 0801 0000 6600 165a` = `btst #0,D1 / beq` --
"already collected?" first):

```
$27FACC  btst #0,D1 / beq ...              <- already collected? -> collected anim
          btst #$C,D1 / bne $27FB6C        <- P1 touching? -> P1 collect arm
          btst #$B,D1 / bne $27FAE6        <- P2 touching? -> P2 collect arm
          bra $27FC8C                       <- else: the idle step
```

**The idle step `$27FC8C`** (73 sec 1.4): writes `move.l #$1BCA34,($A,A6)`
(frame A), decrements `($18,A6)` and on the borrow writes `$1BCA80` (frame B)
and reloads `($18,A6) = 2` -- so **the revealed bee blinks at 20 Hz (frame B one
frame in three)**, a fact no web source records. Then an off-screen test that
frees the slot, then the kind-1/kind-16 fork at `$27FCC8` (`moveq #$4,D0 / and.w
D0,D1 / eor.w D0,D1 / bne $27FCEA`): kind 1 (bit 2 set) falls through to the
scroll-adjusted emit at `$27FCE2`; kind 16 (bit 2 clear) takes `$27FCEA`, which
flies a waypoint script off `$27FD72` (the MOVING bee variant).

**The fill `$280B3E`** (73 sec 1.4 / 11 item 3): the allocator's caller writes
fields into the returned slot, and the fill copies the 22-byte template at
`$280EB0` (`[M]`: `FA00 FD00 001BCA34 0618 0980 0980 0780 0780 0000 001C` --
sprite, size, hitbox, the layer selector). The fill skips `+$1A`/`+$1B`
(`$280B8C addq.w #$2,A0`); 73 sec 11 item 3: do not merge the skip. The
six-entry layer table `$280BB6` = six identical emitters (`$23D762` x2,
`$23D79E`, `$23D7DA`, `$23D816`, `$23D852`) into six display-list buffers -- a
PRIORITY LAYER, not a state. The live count is bumped at `$280B3E addq.w #1,
$817F7E` (cited in `src/bulletdriver.js:98`).

**Ported?** NO. `[M]` `$27f95a` appears in `src/` only as comments / counted
notes (`type5.js:160` lists it at index 3; it falls into the `default` counted-
note case). No `runImpactDriver` / `runPoolADriver` exists. `$817F7E` is 0 on
every run this port has ever made (73 sec 5; `src/damage.js:438`).

### 1.3 DRAW -- the bee's sprite shard and emitters

**The bee art is EXPORTED.** `[M]` `tools/export-web.mjs:1748` lists `0x1bca34,
0x1bca80` in shard 13 (the bomb's shard, which also holds enemy type `$8A`'s
pair -- W66/CATCHUP sec 7a). `tools/w35atlas.mjs:231` records the immediate-
capture pair `[0x1bca34, 0x2766ec]` (the carrier's first emit) and
`[0x1bca80, 0x27fca2]` (the revealed bee's frame B). So both bee frames are in
the bundled atlas; the port draws the carrier with them today.

**The emitters are the SAME on the carrier and the pickup.** The bee's
`($28,A6)` (set by the fill from `$280BB6`) selects one of six stubs
(`$23D762`/`$23D79E`/`$23D7DA`/`$23D816`/`$23D852`), each of which APPENDS a
display-list record into buckets 0/1/2/3/7. Those stubs are ALREADY ported as
`enqueueThroughStub` (`src/effects.js EMIT_STUB`, `src/spritequeue.js
resolveEmitStub`). The carrier already uses `$23D762` (bucket 0); the pickup
uses whichever layer the fill picked.

**Ported?** Art: YES (shard 13). Emitters: YES (the stubs are ported). What is
missing is the DRIVER CALLING the emitter -- i.e. once `$27F95A` runs and the
idle step reaches `$27FCE2 jmp ($28,A6)`, the picture appears for free.

### 1.4 COLLECT -- how the player collects a bee

**Collection goes through `$244D62`'s BLOCK 3, NOT through the bee driver.**
`src/damage.js:443 impactCollisionBlock` is the port of `$244DFE..$244E5C`, the
collision pass's third block. It walks impact pool A (`$8171BE`, 70 slots, count
`$817F7E`) and for each live record overlapping the player's box it ORs the
caller's player mask (`$80FA72`, = `$1000` for P1 / `$0800` for P2) into the
record's status word (`$244E4A/$244E50`). That sets word-bit 12 (P1) or 11 (P2),
which the bee body reads as `btst #$C` / `btst #$B` at `$27FACC`.

**Ported?** BLOCK 3 IS TRANSSCRIBED in `src/damage.js` (W60), and runs every
frame as part of `collisionPass`. But it is UNEXERCISED: `$817F7E` is 0 on every
run, so the `if (d6 === 0) return 0` early-out fires and no record is ever
walked. **The moment bees are allocated (so `$817F7E > 0`), block 3 will flag
them for collection with zero further port work.** This is the cheapest piece of
the whole subsystem.

Three guards block 3 carries (73 sec 1.3 names the equivalent item-pool guards;
`src/damage.js` block-3 header transcribes them):
* the live test is `tst.w (A6)+ / bpl` (bit 15 of `+$00`) AND `move.w (A6)+,D4 /
  beq` (word at `+$02`); two tests, not one;
* the half-extents are `+$10`/`+$12` (long) and `+$14`/`+$16` (short), four
  distinct words;
* the skip is `tst.b (-$3,A6) / bmi` -- bit 7 of the KIND byte (`+$01`). For the
  bee, kind index 1 = `$04` in the low byte (bit 7 clear), so the bee is NOT
  skipped. (Kinds with bit 7 of the low byte set -- i.e. kind index `>= 32` --
  would be, but the table only holds 20.)

**The collected flags** (73 sec 1.3, on the bee body): the collect arms set
bit 0 of the status word ("already collected") via the body's own writes; the
damage pass only sets the PLAYER bit. So collection is a two-frame handshake:
block 3 ORs the player bit on frame N; the driver's bee body reads it on frame
N+1, runs the award, sets bit 0, and on the NEXT drive the `btst #0` dispatch
sends the slot to the collected-animation arm (not the idle step).

### 1.5 SCORE -- `$286128` base x hits; the ladder; the cursor; the x2 bug

**The award is `base x live-hit-count` as a four-pass BCD digit-multiply through
`$286128`**, transcribed in recon 73 sec 1.3 from `$27FBEE..$27FC54`. The
shape:

```
$27FBEE  D1 = $817F82                          <- the base-value cursor
$27FBF4  addq.w #$1,$817F80                    <- bump the per-stage bee count
$27FBFA  cmpi.w #$A,$817F80 / bne $27FC12      <- if count == 10 AND $81293C == 0:
$27FC04  tst.w D3 / bne $27FC12
$27FC08  bset #$5,(A6)                         <-   set the x2 flag
$27FC0C  addq.w #$4,$817F82                    <-   ratchet the cursor +4 (one ladder step)
$27FC12  lea ($27FD22,PC),A0 / D0 = (A0,D1.w)  <- the base, a BCD LONG from the ladder
$27FC1C  btst #$5,(A6) / beq $27FC24
$27FC22  add.l D0,D0                           <- the x2 (THE BCD OVERFLOW BUG)
$27FC24  lea ($27FD4A,PC),A0 / ($10,A6) = ...  <- the popup descriptor
$27FC30  tst.w D4 / tst.w D5 / bmi -> flat     <- no chain: skip the multiply
$27FC3E  D1 = (A6).b                           <- the HIGH byte (carries the player bit)
$27FC42  moveq #$F,D3 / and.w D5,D3 / subq #1 / bcs $27FC54
$27FC4A  jsr $286128 / dbra D3,$27FC4A         <- add D0 once per BCD digit of D5
$27FC54  lsr.w #$4,D5 / lsl.l #$4,D0 / dbra D4,$27FC42
```

**`$286128` IS PORTED** as `scoreByMask` (`src/score.js:770`). `[M]` bytes at
`$286128`: `0801 0004 670a 41f9 0081b4c4 6100 04f0` = `btst #4,D1 / beq *+0A /
lea $81B4C4,A0 / bsr.w $286626` -- bit 4 of D1 = P1; the routine credits P1's
pending score, then tests bit 3 for P2. **So the bee's award lands in the
correct player's pending-score accumulator through already-ported code.**

**It does NOT tick the chain.** `[M]` `$286128` calls `$286626` (the ONE BCD
adder, `bcdAdd` in `score.js`), not `$28615E`/`$2862C6` (the kill/chain
machines). 73 sec 1.3 and W105 sec 1.3 both state this; the score.js source
confirms it. The award is a pure pending-score add.

**The base ladder `$27FD22`** `[M]`: `$00000100 $00000200 ... $00000500 ...
$00001000`. The "500-pt medal" is the ladder entry at cursor index 4 (BCD 500),
reached after four perfected stages. On stage 1 with a fresh cursor (`$817F82 =
0`) the base is `$00000100` (BCD 100), and `base x live-hit-count` can carry the
award to a displayed 500 in BCD if the live hit count is in the right range.

**The x2 BCD overflow bug** (`$27FC22 add.l D0,D0`): a binary double on a packed
BCD long. A base of BCD `$8000` doubles to `$10000`, which reads out as 10,000
and not 16,000. rokulpg / trap15 documented this; 73 sec 1.3 found it in the
listing. **The port MUST transcribe the bug, not "fix" it** (73 sec 11 item 7;
HANDOVER owner decision: scoring must be frame-exact, and the bug is the board's
exact behaviour).

**The cursor ratchet gate** (73 sec 1.3): `$27FC0C addq.w #$4,$817F82` runs
ONLY when `count == 10 AND $81293C == 0`. **`$81293C` IS UNIDENTIFIED** (73 sec
8 item 5: read as an operand, not chased to a writer). It is the "no-miss /
stage-clear" gate the web sources describe. **A stage-1 bee port cannot ship the
x2 or the cursor ratchet without identifying `$81293C`**, but it CAN ship the
flat `base x hits` award (which is what a stage-1 player gets on a fresh cursor
anyway: count goes 1..9, never hits 10 within one stage unless all 10 bees are
collected).

**The rank gauge** (`$27FBA2..$27FBDE`, recon 73 sec 1.3 / sec 6): the collect
arm ALSO adds to `$81B64A` (the rank accumulator) on a `subi.w #$14 / addi.w
#$48` loop over the BCD hit count, gated `$81B63E` (hyper active) skip, chain-
meter-zero skip, hits-zero skip, clamped at BCD 200. `$27FBDE add.w D0,$81B64A`
is the first link of the accumulator chain recon 71 §4.2 wrote out (`$27FBDE`
-> `$287682` -> `$81B6E0` -> `$2875B4` -> `$27E912` -> kind-`$C` item ->
`$2530CA` -> `$285A62` -> `$2608D2`'s x16 term). **Every link after `$27FBDE`
is unported today.** 73 sec 10 and `61-impl` sec 5 (cited) measure a -24 offset
on `$81B64A` already; shipping the gauge add without a `$287682` decision would
widen that. **REFUSE THE GAUGE ADD IN THE FIRST BEE WAVE** the way W61 refused
hyper-stock kinds `$0C`/`$14` -- loudly, by address, with the consequence named.

---

## 2. PER-PIECE PORTED / UNPORTED / DEAD

| piece | ROM | ported? | evidence |
|---|---|---|---|
| **SPAWN: carrier `$8A`** | handler `$276702`, init `$2766AE` | **PORTED** | `src/handlers.js:1995 handler8A`; `src/initbody.js`; W30 |
| **SPAWN: carrier death arm** | `$2767D0..$276814` | **PARTIAL** | `deathSeq8A` `src/handlers.js:2083`: scoreKill + cue + explosion + field writes all ported; **ONLY `$2767E6 jsr $27F92A` is a NOTE** (line 2088) |
| **SPAWN: bee allocator** | `$27F92A` (reserved ten) | **UNPORTED** (counted note) | single abs caller `$2767E6` `[M]`; `deathSeq8A` notes it |
| **SPAWN: bee fill** | `$280B3E` + template `$280EB0` + layer table `$280BB6` | **UNPORTED** | nothing in `src/` references `$280B3E`/`$280EB0`/`$280BB6` |
| **DRIVE: pool-A driver** | `$27F95A` (type-5 call #4) | **UNPORTED** (counted note) | `src/type5.js:160` index 3, falls to `default`; `$817F7E` always 0 |
| **DRIVE: kind dispatch table** | `$27F99E` (20 stride-4 ptrs) | **UNPORTED** | nothing reads it |
| **DRIVE: bee body (idle step)** | `$27FC8C` (blink + off-screen free + emit) | **UNPORTED** | nothing in `src/` |
| **DRIVE: bee body (kind-1 emit)** | `$27FCE2 jmp ($28,A6)` | **UNPORTED** | the stubs it reaches ARE ported (`enqueueThroughStub`) |
| **DRIVE: bee body (kind-16 flying)** | `$27FCEA` + waypoint `$27FD72` | **UNPORTED** | stage-1 use unknown (73 sec 8 item 3) |
| **DRIVE: pool-A clear** | `$27F87C` (clears $6E7 words) | **UNPORTED** | the five resets `$27F890`/`$27F898`/`$27F8AE`/`$27F8C4`/`$27F8E6` are also unported |
| **DRAW: bee sprite art** | `$1BCA34`, `$1BCA80` | **PORTED (exported)** | `tools/export-web.mjs:1748` (shard 13, W66) |
| **DRAW: star sprite art** | `$1BCACC` (kind 0's 16-frame anim) | **PORTED (exported)** | in shard 13 |
| **DRAW: emit stubs** | `$23D762`/`$23D79E`/`$23D7DA`/`$23D816`/`$23D852` | **PORTED** | `src/effects.js EMIT_STUB`; `src/spritequeue.js resolveEmitStub` |
| **COLLECT: collision block 3** | `$244DFE..$244E5C` | **TRANSSCRIBED, UNEXERCISED** | `src/damage.js:443 impactCollisionBlock`; runs every frame, early-outs on `$817F7E == 0` |
| **SCORE: item adder** | `$286128` | **PORTED** | `src/score.js:770 scoreByMask` |
| **SCORE: BCD adder** | `$286626` | **PORTED** | `src/score.js:322 bcdAdd` |
| **SCORE: base ladder** | `$27FD22` (data) | **UNPORTED** (data) | ten BCD longs `[M]`; nothing reads them |
| **SCORE: popup ladder** | `$27FD4A` (data) | **UNPORTED** (data) | ten BCD longs |
| **SCORE: count gate** | `$27FBFA cmpi.w #$A,$817F80` | **UNPORTED** | `[M]` bytes confirm; in the unported bee body |
| **SCORE: cursor ratchet** | `$27FC0C addq.w #$4,$817F82` | **UNPORTED** | gated on `$81293C == 0` (UNIDENTIFIED) |
| **SCORE: x2 bug** | `$27FC22 add.l D0,D0` | **UNPORTED** | must transcribe the bug, not fix it |
| **SCORE: rank gauge add** | `$27FBDE add.w D0,$81B64A` | **UNPORTED, REFUSE** | touches rank; `$287682` undecided; refuse like W61 |

**Dead code:** NONE found in the bee path. `$27F92A`'s single caller is a real
death arm. The 18 non-bee kinds are unattributed, not provably dead (sec 3).

---

## 3. THE 18 NON-BEE POOL-A KINDS -- flag honestly, do not block on them

W105 sec 1.5 left kinds 0, 2-15, 17-19 unattributed. Recon 73 sec 8 item 8 left
the same set unnamed. **This wave does too, deliberately.** Their activation
comes from `$27F8EE`'s seven callers and `$27F8F8`'s four, all taking D0 (the
kind) from registers neither 73 nor this wave traced. Attributing them needs a
`bsr`/`jsr (An)` scan plus a D0 dataflow trace at each of the eleven sites; that
is the walker-extension job W105 sec 5.3 describes, and it is its own recon.

**What IS known `[M]`:**

* kind 0 (and 4) = `$27FA30` = the STAR (`$1BCACC`, 16-frame animation, the
  `$80390C` sprite-thinning gate above 60 live records -- 73 sec 4). The star is
  a real pool-A denizen and it IS stage-1-relevant (the `$80390C` gate proves the
  pool can hold 60+ records in normal play, which is only possible if stars are
  spawning). Who spawns it is one of the eleven unknown D0 sources.
* kind 2 = `$27FE0E` = what enemy type `$8B` drops (73 sec 2.2: type `$8B`'s
  prototypes set `($18,A5) = $0008`, and `$0008 & $7C >> 2` = kind index 2).
  Type `$8B` has **25 records in stage 1** (73 sec 3.2 census), so **kind 2 IS
  stage-1-relevant** and goes through `$27F8EE`'s seven-caller list. (Type `$8B`
  itself is ported: `src/handlers.js handler8B`.)
* kinds 17/18/19 mirror 5/6/7 (the table is two overlapping ranges: 0-15 unique,
  16-19 = 1,5-7 again -- 73 sec 1.2). So at most 16 DISTINCT bodies.

**DO NOT BLOCK THE BEE PORT ON THESE.** The implementer should REFUSE the 18 at
the allocator (the shape W52 sec 0.2 established for pool A itself, and W54 sec
THE REFUSAL used for pool D): loud named throws by kind index, the way
`src/effects.js` refuses pool D. A bee port that also tried to attribute and
port the other 18 would be the third census-vs-walk-order trap in a row
(CATCHUP sec 3).

---

## 4. THE SMALLEST STAGE-1 BEE PORT

**Goal:** a bee appears when a type-`$8A` carrier dies, falls/flies, blinks,
gets collected when the player overlaps it, and awards `base x live-hit-count`
through `$286128` to the correct player's pending score. No chain tick, no
gauge add, no x2, no cursor ratchet.

**It fits in ONE implementation wave** (W112), because the expensive
prerequisites are already met:

* the carrier is ported (so bees get spawned);
* the bee art is exported (so they draw);
* the emitters are ported (so they reach the display list);
* collision block 3 is transcribed (so they get collected, the moment
  `$817F7E > 0`);
* `$286128` is ported (so the award lands).

### Wave breakdown

| wave | scope | new code |
|---|---|---|
| **W110 (this)** | recon: verify 73/W105, map lifecycle, cut the port | this doc |
| **W111 (architect)** | design the pool-A module: `POOL_A` constants, `allocBee27F92A`, `fillBee280B3E`, `runPoolADriver27F95A`, `beeBody27FACC` (idle step + collect dispatch), `collectArmP1/P2` (the flat award only); the wire points in `deathSeq8A` and `type5.js`; the REFUSAL of kinds != 1/16 at the allocator; the REFUSAL of the gauge add. Identify `$81293C` if it can be done statically (a writer scan); else leave the x2/cursor gated off and named. | a plan doc |
| **W112 (impl)** | port the above. One new file `src/bee.js` (or `src/impactpool.js` if the implementer wants room for the 18 later). Wire `0x27f95a` into `TYPE5_PORTED` and add its `case` to `makeType5` (call #4, between `subReaper` and `effectDriver` per the ROM's `jsr` order). Replace the `note(0x27f92a, ...)` in `deathSeq8A` with the real allocator + fill call. Port `$27F87C` (the clear) and call it from wherever the pool-B clear is called (stage boundaries). **Must-fail test:** seed a bee into pool A (write the slot directly), run the driver, assert the sprite emits on the right frames and the slot frees off-screen. **Must-fail test 2:** seed a bee inside the player's box, run `collisionPass` then the driver, assert `$286128` fires and the pending score gains `base x hits`. | `src/bee.js` + edits to `type5.js`, `handlers.js`, `damage.js` (block 3 already there), and the stage-reset path |

### What W112 must transcribe, in ROM order

1. **`$27F87C`** the pool-A clear ($6E7 words from `$8171BE`, covering the 80
   slots plus the seven trailing words `$817F7E`/`$817F80`/`$817F82`/...).
   Plus the five resets `$27F890`/`$27F898`/`$27F8AE`/`$27F8C4`/`$27F8E6`
   (which clear the bee counter and/or the star accumulators selectively).
2. **`$27F92A`** the reserved-ten allocator (10 slots at `$817DC6`, returns one,
   bumps `$817F7E`). Range-check the caller's D0 to kind index 1 or 16 and
   THROW on anything else (the REFUSAL of the other 18).
3. **`$280B3E`** the fill (22-byte template from `$280EB0`, the `+$1A`/`+$1B`
   skip, the layer-table write to `($28,A6)`).
4. **`$27F95A`** the driver (live-count walk, scroll, 5-bit kind mask,
   stride-4 dispatch through `$27F99E` -- but ONLY to kind 1/16; the other 18
   are refused at allocation, so the dispatch never sees them, but the table
   read must still be range-checked to 20 and throw).
5. **`$27FACC..$27FD20`** the bee body: the `btst #0/$C/$B` dispatch, the idle
   step `$27FC8C` (blink + off-screen free + kind-1 emit), the collect arms
   `$27FB6C` (P1) / `$27FAE6` (P2). **The collect arm transcribes the flat
   award only** (`$27FBEE` read cursor, `$27FBF4` bump count, `$27FC12` read
   ladder, `$27FC42` the digit-multiply into `$286128`). **The gauge arm
   `$27FBA2..$27FBDE` is REFUSED** (a `note` on `$27FBDE`, like W61's hyper-
   stock refusal). **The x2 (`$27FC08`/`$27FC22`) and the cursor ratchet
   (`$27FC0C`) are gated on `$81293C == 0`, which is UNIDENTIFIED -- refuse them
   too until a writer scan names the word.** On a fresh stage-1 cursor the count
   only reaches 10 if ALL ten bees are collected, so refusing the x2 only
   changes the tenth collection's score; name that in the note.
6. **Kind 16 (`$27FCEA`, the flying bee).** Stage-1 use unknown (73 sec 8 item
   3: none of the twelve pool-A allocation sites found passes D0 = `$40`). The
   implementer should transcribe the fork (`moveq #$4,D0 / and.w D0,D1 / eor /
   bne`) and the kind-1 emit, and **REFUSE `$27FCEA` with a named throw** until
   a stage-1 caller is found. (The thrown path is unreachable on the shipped
   seed by 73's measurement; if it fires, the note tells the next wave what to
   port.)

### Wiring (two sites, both already named in source)

* **`src/handlers.js:2088`** -- replace `u?.note(0x27f92a, ...)` with the real
  `allocBee27F92A(ram, ctx, kind=0x04, layer)` + `fillBee280B3E(...)`. The
  `kind` is `($1A,A5) = $0004`; the `layer` is `($1F,A6)` (read at `$2767E2`,
  currently not captured -- the death arm reads it into D2 before the call; the
  port must read it too).
* **`src/type5.js`** -- add `0x27f95a` to `TYPE5_PORTED`, add a `case
  TYPE5.impactDriver:` (new constant = `0x27f95a`) that calls `runPoolADriver`,
  positioned at the ROM's `jsr` order (call #4 = the fourth `jsr.l`, between
  `$28AD54` subReaper at #3 and `$288E4E` effectDriver at #5). The position is
  load-bearing for bucket depth order, exactly as the effect driver's position
  is (W54 / `type5.js:298` comment).

### The must-fail tests

1. **Spawn + drive + draw.** Seed the shipped seed, run to a frame where a type-
   `$8A` is about to die (or poke one), kill it, assert `$817F7E` goes 0 -> 1,
   the slot at `$817DC6` holds status `$8004` (allocated | kind-1), sprite
   `$1BCA34` is in bucket 0 (or whichever layer), and three frames later bucket
   0 holds `$1BCA80` (the blink).
2. **Collect + score.** Seed a bee directly into pool A at the player's
   coordinates with status `$8004`, run `collisionPass` (block 3 ORs the player
   bit), then `runPoolADriver` (the bee body reads the bit, runs the arm),
   assert `$286128` fired and P1 pending score gained `base x hits` (with a
   fresh cursor: base = `$00000100`, so e.g. 5 hits -> BCD `$0500` = 500).
3. **Off-screen free.** Seed a bee with Y off the playfield, run the driver,
   assert the slot is freed (status -> 0) and `$817F7E` decrements.
4. **Refusal.** Poke a record with kind index 2 into `$817DC6` directly (bypass
   the allocator), run the driver, assert it THROWS by address (the kind-2 body
   is not ported and must not silently no-op).

---

## 5. WHAT I COULD NOT REACH (and what I tried)

Stated the way `docs/knowledge` requires.

1. **`$81293C` / `$81293E`** -- the x2's second gate (`$27FC04 tst.w D3`).
   Read as an operand (recon 73 sec 8 item 5). **I did not run a writer scan.**
   The implementer (W111) should: `grep` the image for `write.*\$81293C` (an
   abs-long `move.* 0081293C` scan) and read each site. If it is a stage-clear
   flag, the x2 and cursor ratchet can ship; if it is a no-miss flag, ditto; if
   it cannot be identified statically, the x2 stays refused and the consequence
   (the 10th bee of a perfect stage scores 1x not 2x) is named.
2. **Which of the 18 non-bee kinds are stage-1-relevant.** Kind 0 (star) and
   kind 2 (type `$8B`'s drop) ARE (sec 3). The rest need the D0 dataflow trace
   at the eleven allocator callers that 73 sec 8 item 8 and this wave both
   declined. **I did not attempt the trace; it is the walker-extension job
   (W105 sec 5.3) and out of scope for a bee port.**
3. **The kind-16 flying bee in stage 1.** 73 sec 8 item 3: no pool-A allocation
   site passes D0 = `$40`. **I re-verified the carrier's D0 is `$0004` (kind 1)
   `[M]`.** Whether any of the other eleven allocator callers passes `$40` in
   stage 1 is the same unresolved D0 trace. Refuse `$27FCEA` until resolved.
4. **Dynamic confirmation.** No MAME, no `seedcmp`, no port run this wave. Every
   "`$817F7E` is 0" claim is read out of source (the code path is unchanged
   since recon 73). The bee is transcribed-and-unexercised on the pool side in
   this port, on every frame of every run ever made.
5. **The R/L sequence of stage 1's ten bees** (recon 72's `R,L,R,L,L,L,L,R,L,L`).
   73 sec 8 item 1 left it UNRESOLVED; I did not re-attempt. The cheap follow-up
   (73 sec 11 item 1) is a read-only port run logging `($4,A6)` at each
   type-`$8A`'s first emit -- that is W112's must-fail test 1, plus a log.

---

## 6. IMPLEMENTER-READY NOTES (the load-bearing gotchas)

1. **`$27F92A` IS NOT `$27F8EE` WITH A DIFFERENT BASE.** It reserves the LAST
   TEN slots and its only caller is the bee carrier's death. Routing the bee
   through `$27F8EE` will lose bees to a busy pool, silently (73 sec 11 item 4).
2. **RANGE-CHECK `$27F99E` TO 20 ENTRIES AND THROW.** The mask is `$7C` (32
   indices) against 20 longwords; index 20 lands on `moveq #$1,D0` (code). (73
   sec 11 item 2.)
3. **THE `$280E4A` TEMPLATE TABLE IS 20 ENTRIES OF 22 BYTES** and the fill skips
   `+$1A`/`+$1B` (`$280B8C addq.w #$2,A0`). Do not merge the skip. (73 sec 11
   item 3.) For the bee only the ONE template `$280EB0` is needed; the other 19
   can be refused.
4. **THE BEE'S STATUS WORD KIND IS SHIFTED.** The 5-bit kind INDEX sits in bits
   6..2 (`$7C` mask), so kind index 1 = status low byte `$04`, kind 16 = `$40`.
   Bit 0 of the status word is the "already collected" flag, NOT the kind. Do
   not read "kind 1" as `status & $FF == 1`.
5. **THE COLLECT HANDSHAKE IS TWO FRAMES.** Block 3 ORs the player bit on frame
   N; the driver reads it on frame N+1. A test that runs `collisionPass` and
   asserts the score in the same frame will fail; run the driver after.
6. **CONVERT, DO NOT DIVIDE, IF THE GAUGE EVER SHIPS.** `$242AF6` is a 14-pass
   `sbcd` loop against the BCD power table `$242B20`. Dividing `$81B5DA` by 20
   as a binary number gives different step boundaries above 99 hits (73 sec 11
   item 6). Out of scope for the flat award but load-bearing if W112-or-later
   ships the gauge.
7. **THE x2 IS THE BUG.** `$27FC22 add.l D0,D0` on a BCD long. Transcribe it as
   a binary double with a comment naming rokulpg/trap15 and recon 73 sec 1.3.
   Do not "correct" it to a BCD multiply.
8. **DO NOT TOUCH `handler8A`'s `bchg`/`eori`/`$240` arms.** They are the
   carrier's flicker, and the flicker is the cartridge's (73 sec 5; W30). The
   owner's "bees showing up and flickering" is the carrier drawn faithfully.
   The defect is the MISSING PICKUP, not an over-draw.
9. **THE GAUGE ADD (`$27FBDE`) IS RANK.** It writes `$81B64A`. Shipping it
   without `$287682` (and the rest of recon 71 sec 4.2's chain) would bank rank
   the board would have spent -- the owner's named failure surface (HANDOVER
   owner decision 3). REFUSE it in W112.

---

## LOG

- opened IN PROGRESS after the premise check. Read W105 sec 1, recon 73 (full),
  `src/damage.js` (block 3 = `impactCollisionBlock`), `src/effects.js` (pool B
  analog + the REFUSAL pattern), `src/score.js` (`$286128` = `scoreByMask`,
  PORTED), `src/type5.js` (call #4 at index 3, not in `TYPE5_PORTED`),
  `src/handlers.js:2083` (`deathSeq8A`, the `$27F92A` note at line 2088) and
  `:1995` (`handler8A`, FULLY ported), CATCHUP sec 7a/7b/8, HANDOVER.
- `[M]` wrote `.scratch/w110/verify.py` and ran it. All six load-bearing claims
  verify against the image (sec 0). The 20-kind table reads exactly as W105
  lists it; the base ladder is `$100..$1000` in BCD with index 4 = `$0500`; the
  count gate bytes are `0c79 000a 00817f80`; the x2 is `d080` = `add.l D0,D0`;
  the cursor ratchet is `5879 00817f82` = `addq.w #$4,(xxx).l`; `$27F92A` has
  exactly one abs-long caller (`$2767E6`); the three allocators have 7/4/1 abs-
  long callers as W105 states; the death arm decodes as recon 73 sec 3.1.
- `[M]` confirmed the bee art is exported: `tools/export-web.mjs:1748` lists
  `0x1bca34, 0x1bca80` in shard 13 (W66); `tools/w35atlas.mjs:231` records both
  immediate-capture pairs.
- `[M]` confirmed `$286128` is PORTED: bytes `0801 0004 ...` = `btst #4,D1 /
  beq / lea $81B4C4,A0 / bsr $286626`, which is `scoreByMask` in `src/score.js`.
- `[M]` confirmed `handler8A` is registered in `enemyHandlerMap` (handlers.js
  line 3278) and ports the proximity / `bchg` / `eori` arms (W30).
- `[M]` confirmed `$27f95a` appears in `src/` ONLY as comments and counted notes
  (type5.js, damage.js, effects.js, items.js, spark.js, bulletdriver.js,
  handlers.js). Zero `runImpactDriver` / `runPoolADriver`. The driver is
  unported.
- did NOT identify `$81293C` (a writer scan is the implementer's job, sec 5
  item 1). Did NOT trace the eleven non-bee allocator callers' D0 (sec 3, sec 5
  item 2). Did NOT resolve the kind-16 stage-1 question (sec 5 item 3). Did NOT
  run MAME / seedcmp (sec 5 item 4).

status: **DONE**
