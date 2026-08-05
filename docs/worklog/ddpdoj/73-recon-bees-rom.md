# 73 — ROM RECON: THE BEE QUESTION, SETTLED AGAINST THE LISTING

status: **DONE** — see §0 THE HEADLINE, §9 THE VERDICT ON EACH WEB RECON, and
§10 THE WAVE ESTIMATE.

started / finished: 2026-08-05
role: ROM RECON (read-only). This file is the only thing I write or commit.
`games/ddpdoj/src/` belongs to T1 this round and `games/ddpdoj/tools/` to the
seed-anywhere wave — **read freely, write nothing**. `games/gradius/` NOT
TOUCHED.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Build B =
`$23xxxx..$2Axxxx`. **Every address below is build B.**

instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` — the decrypted build-B
image, **address == file offset**, 6,291,456 B (gitignored). Disassembly by
capstone (`CS_MODE_M68K_030`) in the session scratchpad; cross-references by an
absolute-long scan **plus** a `bsr.b/.w`, `bra.b/.w`, `jsr/jmp/lea (d16,PC)`
scan over `$230000..$2B0000`. Sprite decode by `games/ddpdoj/tools/pgmgfx.py`
(the project's own IGS023 decoder) against `games/ddpdoj/rip/rom/`.
Neither scan can see `jsr (An)` through a pointer, so **every caller count is a
LOWER BOUND** and a clean result is "no site of the kinds I can see".

`[M]` = measured by me this session out of that image, out of `src/`, or out of
`games/ddpdoj/assets/`. Anything from another document says so and names it.
**No MAME was run. Nothing here is compared against the board.**

---

## 0. THE HEADLINE — and the brief's premise is FALSE in its most important half

**THE OWNER IS SEEING A REAL BEE SPRITE, DRAWN BY OUR PORT, FLICKERING ON
ALTERNATE FRAMES, AND EVERY PART OF THAT IS THE CARTRIDGE'S OWN CODE,
FAITHFULLY PORTED IN WAVE 30.**

1. **THE BEE IS NOT AN ITEM-POOL KIND. It is kind index 1 of the pool at
   `$8171BE`** — the pool `50-recon-effects` calls "impact pool A" — body
   **`$27FACC`**, and it carries every bee mechanic the web describes: a
   per-stage counter compared against **`#$A` = 10** (`$27FBFA`), a ten-entry
   BCD base-value table `$27FD22` (**100, 200 … 900, 1000**), a `base × live
   HIT count` BCD digit-multiply through `$286128`, and the hyper-gauge step
   law. **Recon 71 §6.2's "the bee is a SEVENTH subsystem, outside both ranges
   recon 59 censused" is CORRECT.** §1.
2. **THE HIDDEN BEE IS AN OBJECT WITH HP AND THE BEE'S OWN SPRITE — ENEMY TYPE
   `$8A`.** Its sub-record prototype `$2766E6` holds **sprite `$1BCA34`, size
   `$0618`, draw offsets `$FA00FD00` — byte for byte the pool-A bee template
   `$280EB0`** — and **HP `$000A` = 10**. Its record prototype `$2766E0` sets
   `($1A,A5) = $0004`, and its death arm `$2767DE` passes that `$0004` to
   `$27F92A`, the **reserved-TEN-slot** allocator into the bee's pool. **[M]
   stage 1's spawn script has exactly TEN type-`$8A` records.** §2, §3.
3. **SO THERE IS A "COVER", AND THE OWNER IS RIGHT ABOUT THIS GAME — but it is
   not a lid over a bee, it is a bee you have to shoot.** Web recon 70 §2.2's
   *"not one DaiOuJou source describes a bee as being inside, under, or released
   by a destructible object"* is **CONTRADICTED BY THE LISTING**. §3.
4. **AND THE REVEAL GATE IS AN EMIT GATE, NOT A STATE FLAG.** `$276702`, type
   `$8A`'s handler, **does not emit at all** unless a bomb is live (`$811F72`)
   or **a live player is within `$240` of it on the short axis** — and then
   `$2767AA bchg #$6,($1,A6) / bne` emits **on every OTHER frame**, toggling
   the sprite `$2767B2 eori.l #$B4,($A,A6)` between `$1BCA34` and `$1BCA80`.
   **`$1BCA34 ^ $B4 == $1BCA80`, which is the second frame the REVEALED bee
   uses at `$27FCA0`.** One coherent two-frame bee animation, at a 50 % duty
   cycle, appearing only when you fly near. §4.
5. **THAT IS THE OWNER'S "showing up and flickering … disappeared and
   reappeared", EXACTLY, AND IT IS AUTHENTIC.** `src/handlers.js:1494`
   `handler8A` ports the proximity test, the `bchg` and the `eori` line for
   line. **Nothing should be "fixed" here.** §5.
6. **THE DEFECT IS AN OMISSION, NOT AN OVER-DRAW.** `$2767E6 jsr $27F92A` is a
   counted NOTE in `deathSeq8A`, and pool A's driver `$27F95A` — **type-5 call
   #4** — is unported (`src/type5.js:160`, index 3). [M] `$817F7E`, pool A's
   live count, is **0 on every frame of every run this port has made**
   (`src/damage.js:438`). **So the player can shoot the flickering bee, and no
   bee ever appears.** The port draws the carrier and never the pickup. §5.
7. **RECON 71'S GAUGE PREDICTION IS CONFIRMED TO THE DIGIT.** `$27FBD0..$27FBDE`
   is `subi.w #$14 / addi.w #$48` in a loop over a **binary** hit count
   (`$242AF6` converts the BCD counter), with the count clamped to `#$200`
   (BCD 200) first — **`$48` per 20 hits, ceiling `$2D0` = 720, zero below 20**,
   gated on `$81B63E` (hyper active) at `$27FBA2`. §6.
8. **THE `$81B64A`/`$81B64C` CENSUS IS DONE — nobody had ever run it.**
   17 absolute-long sites each; **11 writers each**; and **`$27FBDE` — the bee —
   is one of them.** §6.
9. **KIND `$08` IS NOT THE BEE, AND ITS TARGET IS 3, NOT 10.** [M] the shipped
   seed has `$81040A` = 3 and **`$81040B` = 3**. That is recon 70's C2 and recon
   72's item 2, both answered, and both against recon 70's identification. §7.
   (Its ART is nonetheless an insect — see §7.2, which is the one thing in this
   file that could still confuse a reader of the picture.)
10. **CORRECTION TO `59-recon-items` §2.1, and it has propagated.** The enemy
    type table's base is **`$27E412` with (init, handler) pairs**, not
    `$27E016` with (step, init). Recon 59's `$27E016 + 8*$85 == $27E43E` reads
    the HANDLER as "step" and **the NEXT type's init as this type's init**. It
    got the right handler by luck and the wrong init every time. §2.1.

---

## 1. THE BEE, IN THE ROM: POOL `$8171BE`, KIND INDEX 1, BODY `$27FACC`

### 1.1 The pool, and it closes exactly `[M]`

```
[M] $27F8FC  lea $8171BE,A0 / moveq #$45,D7        70 slots of $2C  (general)
[M] $27F936  lea $817DC6,A0 / moveq #$9,D7         10 slots of $2C  (RESERVED)
[M] $8171BE + 70*$2C == $817DC6                                       EXACT
[M] $817DC6 + 10*$2C == $817F7E == THE LIVE COUNT ($27F95A reads it)  EXACT
[M] $27F87C's clear: lea $8171BE / move.w #$6E6,D0 / (A0)+ dbra
        = $6E7 words = $DCE bytes = 80*$2C ($DC0) + 14 more bytes,
        i.e. the pool PLUS $817F7E $817F80 $817F82 $817F84
        $817F86 $817F88 $817F8A                                       EXACT
```

So the family is **80 slots + seven trailing words**, and three of those seven
are the bee's:

| word | what, measured |
|---|---|
| `$817F7E` | the pool LIVE COUNT (`$280B3E addq`, eleven `subq` sites) |
| **`$817F80`** | **THE BEE COUNTER.** `$27FBF4 addq.w #$1` / `$27FBFA cmpi.w #$A` |
| **`$817F82`** | **THE BASE-VALUE CURSOR.** `$27FC0C addq.w #$4`, read at `$27FBEE` and by the RESULT SCREEN at `$29023E` |
| `$817F84`/`$817F86` | P1's star accumulators (`$27F9F0`, capped `$3E7`) |
| `$817F88`/`$817F8A` | the P2 mirror |

**THE RESETS ARE THE DISCRIMINATOR RECON 71 §2.2 ASKED FOR `[M]`:**

```
[M] $27F890  clr.w $817F80 / rts                    <- THE BEE COUNTER ALONE
[M] $27F898  $817F80 := $817F84 := $817F86 := 0     <- P1 + the counter
[M] $27F8AE  $817F80 := $817F88 := $817F8A := 0     <- P2 + the counter
[M] $27F8C4  all five
[M] $27F8E6  clr.w $817F82 / bra $27F8C4            <- ALSO the BASE CURSOR
```

**`$817F80` has a reset that does NOT clear `$817F82`, and `$817F82` has exactly
one clear, which is the one that clears everything.** That is a per-stage
counter beside a per-GAME base ratchet, which is precisely the shape recon 71
§1.1 and §2.2 predicted for "ten per stage" + "+base per perfected stage".

### 1.2 The driver `$27F95A` and the 20-kind dispatch `$27F99E` `[M]`

```
$27F95A  D7 = $817F7E ; beq rts        <- LIVE-COUNT driven
$27F964  A6 = $8171BE                  <- walks all 80 slots as ONE array
$27F976  D1 = (A6) ; beq -> next
$27F97A  ($4,A6) -= $813176            <- the scroll, the same word the items use
$27F97E  moveq #$7C,D0 / and.w D1,D0   <- 5 bits, 32 indices, a BYTE offset
$27F982  tst.b D1 / bmi $2810CA        <- a second, higher-priority arm
$27F988  lea ($27F99E,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
```

[M] `$27F99E` holds **20 valid longwords** (`$27F99E..$27F9ED`); indices 20..31
run off the end into code (`$27F9EE` disassembles as `moveq #$1,D0`), the same
shape `50-recon` §1.5 recorded. The twenty:

```
[ 0] $27FA30  [ 1] $27FACC  <-- THE BEE   [ 2] $27FE0E  [ 3] $27FED2
[ 4] $27FA30  [ 5] $27FF9A  [ 6] $280082  [ 7] $28016A
[ 8] $280252  [ 9] $28036A  [10] $280486  [11] $2805A2
[12] $2806BE  [13] $2807D6  [14] $2808F2  [15] $280A0E
[16] $27FACC  <-- the bee AGAIN           [17] $27FF9A
[18] $280082  [19] $28016A
```

**Kind 1 and kind 16 share `$27FACC`, and the body tells them apart at
`$27FCC8 moveq #$4,D0 / and.w D0,D1 / eor.w D0,D1 / bne $27FCEA`** — kind 1
(bit 2 set) falls through to the scroll + emit; kind 16 (bit 2 clear) takes
`$27FCEA`, which flies a waypoint script off `$27FD72`. So there are **two bee
variants: the placed one and a moving one.**

### 1.3 THE COLLECT ARM — `base × hits` and the hyper gauge, both `[M]`

`$27FACC` dispatches on the status word exactly as the item pool does —
`btst #$0` = already collected, `btst #$C` = P1 touching (`$27FB6C`),
`btst #$B` = P2 touching (`$27FAE6`), else `$27FC8C` = the idle step.

P1's arm, verbatim, with the P2 mirror 130 bytes above it against `$81293E`,
`$81B5EA`, `$81B604`, `$81B640`, `$81B64C`, `$287722`:

```
$27FB6C  D3 = $81293C
$27FB72  D4 = $81B5C0        <- THE CHAIN METER
$27FB78  D5 = $81B5DA        <- THE HIT COUNTER (BCD)
$27FB7E  btst #$1,$8130F8 -> a stage-end swap to $81B60C/$81B610 through $242AC6
$27FBA2  tst.w $81B63E / bne $27FBEE   <<< HYPER ACTIVE -> NO GAUGE, skip entirely
$27FBAC  tst.w D4 / beq  $27FBEE       <<< chain meter 0 -> no gauge
$27FBB0  tst.w D5 / beq/bmi $27FBEE    <<< no hits -> no gauge
$27FBBA  cmpi.w #$200,D5 / bls / move.w #$200,D5     <<< CLAMP AT BCD 200
$27FBC6  D0 = D5 ; jsr $242AF6                        <<< BCD -> BINARY (D2)
$27FBCE  moveq #0,D0
$27FBD0  subi.w #$14,D2 ; bcs $27FBDE ; addi.w #$48,D0 ; bra $27FBD0
$27FBDE  add.w D0,$81B64A                             <<< THE HYPER GAUGE
$27FBE4  jsr $287682                                  <<< the threshold check
```

then, unconditionally (the gauge arm rejoins here):

```
$27FBEE  D1 = $817F82                          <- the base-value cursor
$27FBF4  addq.w #$1,$817F80                    <- THE BEE COUNT
$27FBFA  cmpi.w #$A,$817F80 / bne $27FC12      <<< TEN
$27FC04  tst.w D3 / bne $27FC12                <<< $81293C must be 0
$27FC08  bset #$5,(A6)                         <<< THE x2 FLAG
$27FC0C  addq.w #$4,$817F82                    <<< THE BASE RATCHET
$27FC12  lea ($27FD22,PC),A0 / D0 = (A0,D1.w)  <- the base, a BCD LONG
$27FC1C  btst #$5,(A6) / beq $27FC24
$27FC22  add.l D0,D0                           <<< THE x2 -- A BINARY DOUBLE
$27FC24  lea ($27FD4A,PC),A0 / ($10,A6) = (A0,D1.w)   <- the popup descriptor
$27FC30  tst.w D4 / tst.w D5 / bmi -> $27FC5E  <- no chain: the flat award
$27FC3A  ($1E,A6) = D5
$27FC3E  D1 = (A6).b ; moveq #$3,D4
$27FC42  moveq #$F,D3 / and.w D5,D3 / subq.w #1,D3 / bcs $27FC54
$27FC4A  jsr $286128 / dbra D3,$27FC4A         <<< add D0 once per BCD digit
$27FC54  lsr.w #$4,D5 / lsl.l #$4,D0 / dbra D4,$27FC42
```

`[M]` **`$27FD22` is TEN BCD LONGWORDS: `$100 $200 $300 $400 $500 $600 $700
$800 $900 $1000`.** `$27FD4A` is ten more (`$00010004 … $00090004 $00010008`),
written to `($10,A6)` — the collected-popup descriptor.

Four things fall straight out and each is a web claim decided:

* **`base × hits` EXISTS AND IT IS A BCD DIGIT-MULTIPLY**, not a `mulu`. Recon
  71 §1.2's option (a)/(b) fork: **neither** — it is four passes of "add the
  base `digit` times, then shift the base one BCD digit left". It calls
  `$286128` (the ITEM adder), **not** the kill/chain machine, so **collecting a
  bee does NOT tick the chain.**
* **THE ×2 IS `add.l D0,D0` ON A BCD LONG.** rokulpg / trap15's documented
  overflow bug is **IN THE LISTING** (recon 70 §4.3, recon 72 §5). A base of BCD
  `$8000` doubles to `$10000`, which reads out as 10,000 and not 16,000. **The
  port must transcribe the bug.**
* **THE ×2 GATE IS `count == 10 AND $81293C == 0`** — one word, not the two
  player-state bits recon 70 §6.1 attributed to kind `$08`.
* **THE BASE LADDER STARTS AT BCD 100, NOT 1,000.** §9 weighs that against the
  web.

### 1.4 The idle step `$27FC8C` — and the REVEALED bee blinks too `[M]`

```
$27FC8C  move.l #$1BCA34,($A,A6)      <- bee frame A
$27FC94  subq.w #$1,($18,A6) / bcc $27FCA8
$27FC9A  move.w #$2,($18,A6)
$27FCA0  move.l #$1BCA80,($A,A6)      <- bee frame B, on the borrow frame only
$27FCA8  ...off-screen test -> free...
$27FCC8  (the kind-1 / kind-16 fork, §1.2)
$27FCE2  movea.l ($28,A6),A0 / jmp (A0)    <- the emit, into the record's LAYER
```

[M] the template gives `($18,A6) = $0000`, so the cycle is **0 → borrow (frame
B, reload 2) → 2 → 1 → 0 → borrow …**: **frame B one frame in three.** A
revealed DaiOuJou bee therefore **BLINKS at 20 Hz on the board**, which no
source in either language records and which recon 72 §3 correctly refused to
guess at.

`[M]` `($28,A6)` is set by the fill at `$280B9E` from the six-entry table
`$280BB6` = `$23D762 $23D762 $23D79E $23D7DA $23D816 $23D852` — six identical
emitters into six different display-list buffers (`$80397C`, `$805104`,
`$805CC8`, `$80688C`, `$807450`). **It is a PRIORITY LAYER, not a state.**

---

## 2. THE CARRIER: ENEMY TYPE `$8A`

### 2.1 A CORRECTION FIRST — the enemy type table `[M]`

`59-recon-items` §2.1 (and every document quoting it) uses
`$27E016 + 8*type -> [step, init]`. **The real table is `$27E412 + 8*(type-$80)`
and each entry is `[init, handler]`**, which is what `$2635FC`/`$263608`/
`$263612` compute and what `src/spawn.js:SPAWN.TYPE_HI` already has right.

```
[M] type $85 @$27E43A  init $275812 (+8 = $27581A)  handler $275914
[M] type $86 @$27E442  init $275BAE (+8 = $275BB6)  handler $275914
[M] type $89 @$27E45A  init $277270 (+8 = $277278)  handler $27733E
[M] type $8A @$27E462  init $2766A6 (+8 = $2766AE)  handler $276702
[M] type $8B @$27E46A  init $27681C (+8 = $276824)  handler $27687E
```

Recon 59's base is **4 bytes high**, so it reads each type's HANDLER as its
"step" and **the NEXT type's INIT as its init**. Its `$275BAE` for type `$85` is
in fact type `$86`'s init. `src/initbody.js` has the right bodies and a
**mislabel in its comments** (`$2766AE` is labelled type `$8A`, correctly;
`$276824` is labelled `$8B`, correctly; but `src/handlers.js:1482` says
"`$27681C` is type `$8B`'s init stub" when it is type `$8B`'s init and
`$2766A6` is `$8A`'s). Naming only — no behaviour depends on it.

### 2.2 THE PROTOTYPES — the whole answer in twenty-eight bytes `[M]`

`$2766AE` (type `$8A`'s init body) calls `$2637A2` with `$2766E6` and `$26377A`
with `$2766E0`, D0 = 2 (three words into `($16,A5)`):

```
[M] record proto $2766E0 =  0000 0000 0004
        -> ($16,A5)=$0000  ($18,A5)=$0000  ($1A,A5)=$0004
[M] sub proto    $2766E6 =  8100 FA00 FD00 001B CA34 0618
                            0500 0700 0400 0400 000A 1000 001C 0000
        bit 15 of $8100 is SET -> the LONG form ($2637AC), so:
        (A6)+$00 = $8100
        +$06/$08 = $FA00 / $FD00      <- the draw offsets
        +$0A     = $001BCA34          <<< THE BEE SPRITE
        +$0E     = $0618              <<< width 3 (48 px), height $18 (24 px)
        +$10..$16= $0500 $0700 $0400 $0400   <- the hitbox
        +$18     = $000A              <<< HP = TEN
        +$1A/$1B = $10 / $00          <- speed, heading
        +$1C     = $001C   +$1E = $0000  -> emitter $27829C[0] = $23D762
```

**Set that beside pool A's own bee template `$280EB0`, which the fill `$280B3E`
copies into a revealed bee:**

```
[M] $280EB0 = FA00 FD00  001B CA34  0618  0980 0980 0780 0780  0000  001C
```

**The draw offsets, the sprite and the size word are IDENTICAL.** The carrier is
drawn as the bee. There is no separate "cover" art anywhere on this path.

For contrast, type `$8B`'s prototypes `[M]`:

```
[M] $27685E = 0000 0008     -> ($18,A5) = $0008   (pool-A kind index 2, $27FE0E)
[M] $276862 = A200 0000 0000 0000 0000 0000 0500 0500 0200 0200 0020 1000 0000 0000
        +$0A = $00000000  (NO SPRITE)   +$0E = $0000  (NO SIZE)   +$18 = 0 (HP 0)
```

**Type `$8B` really is invisible and really is a one-hit object** — and its
handler `$27687E` has **no emit at all**. It drops kind 2, not the bee.

---

## 3. THE REVEAL, AND WHETHER IT IS A LASER TEST

### 3.1 The death arm `[M]`

```
$2767D0  moveq #$1,D0 / jsr $28615E          <- score 1
$2767D8  jsr $28C25A                          <- the death cue
$2767DE  move.w ($1A,A5),D0                   <<< = $0004, THE BEE KIND
$2767E2  move.b ($1F,A6),D2                   <- the display LAYER
$2767E6  jsr $27F92A                          <<< THE RESERVED-TEN ALLOCATOR
$2767EC  moveq #$C,D0 / jsr $289004           <- the explosion
$2767F4..$276810  the $278320 remap + the $24179E hook
$276814  jmp $263762                          <- free the carrier
```

`[M]` **`$27F92A` HAS EXACTLY ONE CALLER IN `$230000..$2B0000`, absolute or
PC-relative: this one.** Ten slots reserved, ten carriers per stage, one
allocator. **A bee can never fail to allocate because the pool is busy.**

### 3.2 [M] STAGE 1 HAS EXACTLY TEN TYPE-`$8A` RECORDS

Parsed straight out of the cartridge: stage table `$263336`, stage-1 entry
(script `$230C6C`, aux `$23170C`, res `$231852`), 8-byte records, terminator
`$FFFF` at `$231704` after **339 records** — which is the 339 `src/spawn.js`'s
header already names, so the parse is corroborated from the port's side.

```
[M] stage-1 type census (339 records):
    $05 x28  $07 x59  $08 x12  $09 x7  $0B x12  $0D x1  $0E x1  $10 x16
    $11 x104 $20 x5   $21 x1   $24 x1  $27 x5   $31 x1
    $80 x6   $82 x33  $85 x2   $88 x3  $89 x7   $8A x10   $8B x25
[M] TYPE $86: ZERO RECORDS IN STAGE 1.
```

**TEN.** The ten, with their spawn triggers and the first word of their
movement script (the spawn cross-axis coordinate `$263830` reads):

| # | trigger | aux idx | script | cross-axis word | /64 |
|---:|---:|---|---|---:|---:|
| 1 | 173 | `$070` | `$23211E` | `$7540` | 469.0 |
| 2 | 177 | `$085` | `$2323A0` | `$74C0` | 467.0 |
| 3 | 233 | `$086` | `$2323A6` | `$75C0` | 471.0 |
| 4 | 283 | `$087` | `$2323AC` | `$7400` | 464.0 |
| 5 | 289 | `$087` | `$2323AC` | `$7400` | 464.0 |
| 6 | 355 | `$08C` | `$2323D2` | `$74C0` | 467.0 |
| 7 | 389 | `$088` | `$2323B4` | `$7480` | 466.0 |
| 8 | 407 | `$089` | `$2323BC` | `$7500` | 468.0 |
| 9 | 415 | `$08B` | `$2323CC` | `$74C0` | 467.0 |
| 10 | 452 | `$08A` | `$2323C4` | `$74C0` | 467.0 |

`[M]` the stage-1 script's maximum trigger is **488**, so the ten run from
**35 % to 93 %** of the stage — **none in the opening third**, which is recon
72 §1's headline and it survives.

**BUT THE R/L SEQUENCE TEST FAILS, AND I AM NOT SMOOTHING IT.** All ten spawn
words are within 7 units (464.0–471.0) of each other. That is the **along-scroll
spawn edge**, not a left/right position: nine of the ten spawn beyond the
playfield edge and are carried in by the scroll, and the CROSS-axis position for
a type `$8A` is set by `$263822`/`$263888`'s odometer arithmetic from the
record's `param` at spawn time, which for all ten is `$0000`. **So this table
cannot confirm or refute `R,L,R,L,L,L,L,R,L,L` — the sides are not in the data I
read.** Recorded as **UNRESOLVED**, with the cheap follow-up in §11.

### 3.3 IS IT THE LASER? — NO POINT TEST EXISTS `[M]`

`$276702..$276818` is 75 instructions and I read all of them. **There is no
coordinate-equality test, no point-in-region test against a laser tip, and no
reference to any laser word.** The kill is ordinary damage:

```
$276744  moveq #$5C,D1 / and.b (A6),D1 / beq $276756   <- the generic HIT bits
$27674A  andi.b #$A3,(A6)                              <- clear them
$27674E  tst.w ($18,A6) / bmi $2767D0                  <- HP < 0 -> the bee
```

`[M]` the `$5C` bits are written from several damage paths, not one: an
`ori.b #$44,(An)` / `bset #$4,(An)` census over `$230000..$2B0000` finds
`$244EBC`, `$244EC4`, `$245016`, `$245024`, `$245050`, `$245132`, `$245172`,
`$24545C`, `$24557E`, `$2458D8` among others — and **`$24545C` is inside
`$2453C2`, the LASER collision block**, while `$245016`/`$245132` are in the
shot's. Both walk the same `$81459C` sub-record pool the carrier lives in.

> **THEREFORE: the reveal in build B is HP, not a laser test.** The laser is the
> practical instrument — 10 HP delivered to a fixed map point while the ship
> holds still is what a laser is for, and it is what every guide describes —
> but **`レーザーの先端` is a player-facing description of an HP kill, not a
> mechanism in this ROM.** Recon 70 §2.1's "the trigger is plausibly a point
> test against the laser's leading end" is **REFUTED**; its C11 is closed.
>
> **AND THIS SATISFIES THE COORDINATOR'S FILTER.** An HP-10 object that any
> weapon can kill, that shows itself whenever the ship comes within `$240`, is
> trivially capable of yielding ten collections a stage in ordinary play. A
> laser-tip point test would not have been.

---

## 4. THE FLICKER — MEASURED, AND IT IS THE CARTRIDGE'S

```
$276756  tst.w $811F72 / bne $2767A6      <- a BOMB is live: show it unconditionally
$27675E  jsr $242884                      <- which players are alive (a 2-bit mask)
$276764  tst.w D0 / beq $2767CE           <- nobody alive -> RTS, NOTHING DRAWN
$276768  btst #$0,D0 / beq $27678A
$27676E  D2 = $8103EA ; D1 = ($4,A6) - D2 ; abs
$27677E  cmpi.w #$240,D1 / bcs $2767A0    <<< P1 WITHIN $240 -> SHOW
$276784  btst #$1,D0 / beq $2767CE        <- else P2, or RTS
$27678A  ...the P2 copy against $81044C...
$27679E  bcc $2767CE                      <- far -> RTS, NOTHING DRAWN
$2767A0  move.w #$F,($18,A5)
$2767A6  subq.w #$1,($18,A5)
$2767AA  bchg #$6,($1,A6) / bne $2767CE   <<< EVERY OTHER FRAME ONLY
$2767B2  eori.l #$B4,($A,A6)              <<< $1BCA34 <-> $1BCA80
$2767BA  D0 = ($1E,A6)*4 ; A0 = $27829C[D0] ; jsr (A0)   <- THE EMIT
$2767CE  rts
```

Three separate facts, each measured:

1. **THERE IS NO EMIT ON THE DEFAULT PATH.** A type `$8A` more than `$240` from
   both players draws **nothing at all**. That is the hidden state, and it is
   implemented as *not calling the emitter*, not as a flag.
2. **WHEN IT DOES SHOW, IT SHOWS AT A 50 % DUTY CYCLE.** `bchg` tests the old
   bit and flips it, so the emit runs on alternate frames.
3. **AND THE TWO SHOWN FRAMES ARE DIFFERENT PICTURES.** `[M]`
   `$1BCA34 ^ $B4 == $1BCA80`, and `$1BCA80` is literally the second frame the
   REVEALED bee uses at `$27FCA0`. The carrier and the pickup share one
   two-frame animation.

**AND IT IS A DIFFERENT MECHANISM FROM THE ONE RECON 72 §8 ITEM 4 PREDICTED.**
[M] `$80390A`/`$803914` appear **nowhere** in `$27E812..$27F801` or in
`$27F87C..$281200`. What DOES exist is a **sprite-thinning** gate — twelve
`cmp.w $80390C,D0` sites in pool A, e.g. `$27FAA8` inside the STAR body:

```
$27FA98  cmpi.w #$3C,$817F7E / bcs -> ALWAYS EMIT
$27FAA4  moveq #$1,D0 / and.w D7,D0 / cmp.w $80390C,D0 / beq -> RTS
```

i.e. **once the pool holds 60 or more live records, half of them are skipped
each frame, alternating on the slot index.** That is a second authentic flicker,
it belongs to twelve of the twenty kinds, and **the BEE IS NOT ONE OF THEM** —
`$27FACC..$27FD20` has no frame-counter reference. `[M]` the four ported item
kinds (`$0`, `$4`, `$8`, `$10`) have none either; the three `$80390C` sites in
the item subsystem (`$27EFB2`, `$27F024`, `$27F2B6`) are all inside the REFUSED
hyper kinds `$0C`/`$14`.

---

## 5. WHY OUR PORT DRAWS THEM — AND IT IS NOT A MISSING GATE `[M]`

**`src/handlers.js:1494 handler8A` PORTS ALL OF §4, LINE FOR LINE**, including
`playersAlive242884`, both asymmetric `$240` proximity arms, the `bchg` ("so the
blink+emit below runs on every OTHER frame" — its own comment), the
`eori.l #$B4` and `enqueueThroughStub` through `$27829C[0] = $23D762` = bucket 0.
W30 §4.3 records it as **bucket 0's first producer**.

So:

| the owner's words | what the ROM does | our port |
|---|---|---|
| *"bee pickups showing up"* | a bee sprite, emitted only within `$240` | **correct, ported** |
| *"disappeared and reappeared"* | `bchg #$6` — every other frame | **correct, ported** |
| *"something on top of them so they don't normally show"* | nothing on top: the handler simply does not emit when you are far | **correct, ported** |
| *"fighting with a nonexistent sprite"* | no: `$1BCA34` and `$1BCA80` are both real | — |
| *"you have to shoot the cover off them"* | **RIGHT — HP 10, and its death spawns the bee** | **THE HALF THAT IS MISSING** |

**THE MISSING HALF, with its three addresses `[M]`:**

* `src/handlers.js deathSeq8A` turns `$2767E6 jsr $27F92A` into
  `u?.note(0x27f92a, …)`. The bee is never allocated.
* `src/type5.js:160` lists `0x27f95a` at index **3 (call #4)** and does not call
  it. Pool A has no driver.
* `src/damage.js:438` states it from the other side: *"`$817F7E` is 0 on this
  tree and stays 0"*, and `$244DFE..$244E5C` — `$244D62`'s **block 3**, the
  collision that would OR the collect bit into a bee's status word — is a NOTE.

> **SO THE ANSWER TO THE BRIEF'S QUESTION 2 IS: WE ARE NOT DRAWING A BEE THAT
> SHOULD BE HIDDEN. WE ARE DRAWING THE HIDDEN OBJECT EXACTLY AS THE CARTRIDGE
> DRAWS IT, AND WE ARE FAILING TO PRODUCE THE PICKUP IT SHOULD LEAVE BEHIND.**
> The visible symptom of an omission looks identical to an over-draw, which is
> why the owner's reading was the natural one and why it is worth saying plainly
> that **nothing about the flicker should be "fixed".**

**AND THE PREMISE CHECK THE BRIEF ASKED FOR, EXPLICITLY: the occlusion
hypothesis is WRONG, and the mechanism is an unported spawn.** There is no
occluder, no missing sprite fighting for the same slot, and no reveal FLAG our
port fails to honour. There is a routine we do not call.

---

## 6. THE `$81B64A` / `$81B64C` CENSUS — recon 71's Tier 1, done `[M]`

**17 absolute-long sites each. 11 WRITERS each. The bee is one of them.**

| site | instruction (P1) | P2 mirror | what |
|---|---|---|---|
| `$253936` | `move.w D0,$81B64A` | `$253970` | the hyper-block RESET (`$25392E`, D0 = 0, clears `$81B63E`/`$81B642`/`$81B64E`/`$81B654`/`$81B658` with it) |
| `$2539B0` | `move.w D0,$81B64A` | `$2539E4` | a second reset |
| **`$27FBDE`** | **`add.w D0,$81B64A`** | **`$27FB58`** | **THE BEE. §1.3** |
| `$2866C4` | `add.w D0,$81B64A` | `$286766` | inside the chain/kill machine |
| `$28679E` | `add.w D2,$81B64A` | `$286820` | " |
| `$2867C8` | `add.w D2,$81B64A` | `$28684A` | " |
| `$2867DE` | `add.w D2,$81B64A` | `$286860` | " |
| `$2875E8` | `clr.w $81B64A` | `$28764A` | the pending-grant flush |
| `$287678` | `move.w #$95F,$81B64A` | `$287718` | force-full |
| `$2876A0` | `clr.w $81B64A` | `$287740` | `$287682`'s clear on grant |
| `$287BAC` | `move.w #$95E,$81B64A` | `$287BC8` | set to one BELOW full |
| readers | `$285D4E`, `$285DB2`, `$2875DE cmpi #$95F`, `$287682 cmpi #$95F`, `$287BA2 cmpi #$95F` | mirrors | |

*(`$287B9C`/`$287BB8 andi.w #$81,(A0)+` are alignment false positives of the
byte search, not references.)*

**RECON 71'S PREDICTED CONSTANTS, CHECKED AGAINST THE LISTING:**

| recon 71 §8 item 1 predicted | `[M]` the ROM |
|---|---|
| 3 % ≈ **`$48` (72)** per step | **`$27FBD8 addi.w #$48,D0` — EXACT** |
| ceiling **`$2D0` (720)** at 30 % | `$27FBBA cmpi.w #$200,D5` clamps at BCD 200; 200/20 = 10 steps × `$48` = **`$2D0` — EXACT** |
| floor at 20 hits | `$27FBD0 subi.w #$14,D2` borrows on the first pass below 20 → **D0 stays 0 — EXACT** |
| "a 10-entry word table `$48 $90 … $2D0`" **or** a multiply | **NEITHER: a subtract-and-add LOOP.** Same law, third shape |
| gated `tst.w $81B63E / bne <skip>` | **`$27FBA2 tst.w $81B63E / bne $27FBEE` — EXACT, and it SKIPS rather than banking to `$81B6E0`** |
| BCD-vs-binary on the index: unresolved | **SETTLED: the counter `$81B5DA` is BCD, `$27FBC8 jsr $242AF6` converts it to BINARY (a 14-pass `sbcd` loop against the BCD power table at `$242B20`), and the /20 is done in BINARY.** A port that divides the BCD word by 20 is wrong above 99 hits |

**Two further gates the web never mentioned and a port would omit `[M]`:**
`$27FBAC tst.w D4 / beq` — **the CHAIN METER `$81B5C0` must be non-zero** — and
`$27FBB0 tst.w D5 / beq / bmi`. A bee taken with the chain expired gives no
gauge at all even if the hit counter still reads high.

**THE CHAIN OF CUSTODY RECON 71 §4.2 WROTE OUT IS THEREFORE REAL, LINK BY
LINK**, and the first link is now an address: `$27FBDE` → `$287682` (`cmpi.w
#$95F`) → `$81B6E0` → `$2875B4`'s flush → `$27E912` → a kind-`$C` item →
`$2530CA addq.w #1,$81B65C` → `$285A62 add.w $81B65C,$81B646` (ACCUMULATES) →
`$2608D2`'s ×16 term. **Every link after the first is unported today**
(`61-impl` §5 [CITED]), so no bee wave can ship the gauge add without re-reading
that section.

---

## 7. THE THREE RECONS' CONTESTED CLAIM: IS THE BEE ONE OF THE SIX ITEM KINDS?

### 7.1 NO — and `$81040B` decides it `[M]`

Recon 70 §6 said kind `$08` "probably yes", six structural matches. Recon 72 §6
said probably not. Recon 71 §6.2 said definitely not, a seventh subsystem.
**Recon 71 IS RIGHT**, and the single number both 70 (C2) and 72 (item 2) asked
for is now measured — from `games/ddpdoj/assets/seed.bin.gz`, the port's own
shipped board seed:

```
[M] $81040A = $03      the counter
[M] $81040B = $03      THE TARGET.  THREE, not ten.
[M] $817F80 = $00      the real bee counter (fly-around starts a fresh stage)
[M] $817F82 = $00      the base cursor
[M] $817F7E = $00      pool A's live count
[M] $8171BA = $00      the item pool's live count
```

**`$81040B` = 3 kills recon 70 §6.1 in one number.** Kind `$08` counts to three,
and its completion adds `$4D` (77) to `$8128F4` with a cap of 99 on `$8128FE`,
against a `-$9A` (154 = 2 × 77) at bomb use (`38-recon` §1.3 [CITED]) — recon 71
§6.2's parenthetical is the better reading: **kind `$08` is a two-halves BOMB
item, three fragments to the half.** I did not walk `$8128F4`'s consumers to
prove that and I am not asserting it; what is measured is the 3, the `$4D` and
the absence of any 10.

Everything else follows: **none of the six item kinds reads a chain word, writes
the hyper gauge, counts to ten, or multiplies** — `59-recon` §5.3 measured the
first two, and this file adds that the third and fourth live at `$27FBF4` and
`$27FC42`, outside both ranges recon 59 censused.

### 7.2 THE ONE THING THAT WILL STILL CONFUSE A READER: KIND `$08` IS DRAWN AS AN INSECT `[M]`

I decoded the art rather than reasoning about it. Using the project's own
`pgmgfx.py` against `games/ddpdoj/rip/rom/`, with the sizes the templates give:

* **kind `$00` (`$1B8318`+3, 3 × 24)** — a rounded capsule with a large letter
  on it, the letter changing across the four cells. That is `61-impl` §6b's
  *"red-and-white capsule with a large orange `P`"*, confirmed from the ROM.
* **kind `$08` (`$1B8448`+3, 3 × 24)** — **an insect: a round eye, antennae,
  wings above, a segmented striped abdomen, legs below**, four cells that differ
  in body colour rather than in shape.
* **kind `$10` (`$1B89C8`+3, 2 × 32)** — a rounded-square badge.
* **the bee proper (`$1BCA34`, 3 × 24, and `$1BCA80`)** — a winged shape at an
  angle, the pair the carrier and the pickup share.
* **`$1BCACC` (2 × 16)** — a five-pointed STAR, which is kind 0 of pool A's own
  16-frame animation (`$27FA46 addi.l #$24` wrapping at `$1BCD0C` → 16 frames).

**So there are TWO insect-looking pickups in this cartridge and they are
different objects with different pools, different counters and different
scoring.** Anyone who identifies "the bee" by looking at the screen will pick
the wrong one. **This is the trap for the next wave and it is why §7.1 is
decided on `$81040B` and not on the picture.**

**AND KIND `$08` CANNOT BE WHAT THE OWNER SAW.** `[M]` its only attributed drop
is type `$86`'s death (`$275B04 moveq #$8,D0`), and **stage 1's script has ZERO
type-`$86` records** (§3.2). `src/handlers.js` says the same thing from the
other side. In stage 1 the port can only ever drop kind `$00`, the P capsule.

---

## 8. WHAT I COULD NOT DETERMINE

Stated the way `docs/knowledge` requires — what I looked for, and where.

1. **The left/right sequence of stage 1's ten bees.** §3.2. The spawn script's
   first movement-script word is the along-scroll spawn edge and all ten are
   within 7 units of each other; the cross-axis position is produced at spawn by
   `$263822`/`$263888` from `param` (all ten are `$0000`) and by the movement
   stream's later opcodes, which I did not interpret. **Recon 72's
   `R,L,R,L,L,L,L,R,L,L` is neither confirmed nor refuted.** The cheap
   follow-up is in §11.1 and it is a port run, not a listing read.
2. **Which damage sites can actually reach a type `$8A`.** I found the `$5C`
   bits written from both the laser block `$2453C2` (`$24545C ori.b #$44,(A2)`)
   and the shot blocks, all into the same `$81459C` pool. I did **not** prove
   that a shot's damage per hit can take 10 HP off a carrier in a reachable
   time, so **"the shot cannot reveal a bee" is not refuted as an outcome, only
   as a mechanism.**
3. **Whether kind 16 (`$27FCEA`, the flying bee) is used in stage 1**, and who
   allocates it. `[M]` none of the twelve pool-A allocation sites I found passes
   D0 = `$40`; `$27F8F8`'s four callers (`$281D2E`, `$281E3A`, `$282016`,
   `$29EC6A`) take D0 from a register I did not trace.
4. **`$28112C` and `$280FDC`** — the bee's collected arm and its collected
   animation. Named, not read. They are inside the wave's scope.
5. **What `$81293C`/`$81293E` are** (the ×2's second gate, `$27FC04 tst.w D3`).
   Read as an operand, not chased to a writer. **A port cannot ship the ×2
   without them.**
6. **`$8128F4`'s consumers**, i.e. whether kind `$08` really is a bomb fragment
   (§7.1). Not walked.
7. **Anything dynamic.** No MAME, no gate, no test, no port run. **No run this
   project has ever made has had a live pool-A record**, so every branch in §1
   and §4's emit arm is transcribed-and-unexercised on the pool side. §5's port
   claims are read out of `src/`, not measured in a run.
8. **The `$27F99E` dispatch's 20 kinds**: I identified 1/16 (bee), 0/4 (star)
   and 2 (type `$8B`'s drop) and left fifteen unnamed.
9. **VIDEO WOULD HELP AND I COULD NOT USE IT.** The coordinator's note about
   `74-REF-arcade-video-sources.md` is right that video would show what a hidden
   bee looks like. **It is no longer needed for the mechanism** — §2.2 and §4
   settle it from the listing — but **it would independently confirm the 50 %
   duty cycle and the `$240` radius**, which are exactly the two numbers a
   player would notice and no text source records. A follow-up wave sampling
   frames around a known bee position would close it.

---

## 9. THE VERDICT ON EACH WEB RECON'S CONTESTED CLAIMS

**Where a web claim and the listing disagree, the listing wins and this section
says so.**

### `70-webrecon-bees-mechanics`

| its claim | verdict `[M]` |
|---|---|
| ten bees per stage, hidden and pre-placed | **CONFIRMED.** `$27FBFA cmpi.w #$A`, and stage 1 has exactly ten type-`$8A` records |
| **revealed by the LASER, specifically its TIP (`レーザーの先端`)** | **REFUTED AS A MECHANISM.** No point test, no laser word, no coordinate compare exists in `$276702..$276818`. The reveal is **HP 10** through the generic `$5C` hit bits, which several damage paths write. C11 closed |
| ordinary shot does not reveal | **NOT SUPPORTED BY THE LISTING** as a rule; unresolved as an outcome (§8.2) |
| **"NOT ONE DAIOUJOU SOURCE SAYS A BEE IS INSIDE A DESTRUCTIBLE OBJECT"**, and destructible cover belongs to DonPachi | **THE LISTING CONTRADICTS THE WEB.** DaiOuJou build B has a destructible carrier with HP, and the owner's memory is right about **this** game. The web's silence was silence |
| C1 *"is enemy type `$86` the hidden-bee carrier?"* | **NO — type `$8A` is**, and type `$86` does not occur in stage 1 at all |
| C2 `$81040B` == 10 | **REFUTED. It is 3** |
| kind `$08` is the bee, six structural matches | **REFUTED** (§7.1) |
| C6 the BCD ×2 bug | **CONFIRMED IN THE LISTING.** `$27FC22 add.l D0,D0` on a BCD base |
| C7 a +1 HIT written at reveal, from outside the item subsystem | **NOT FOUND.** [M] `$276702..$276818` and `$27FACC..$27FD20` contain **no** reference to `$81B5C0`, `$81B5DA`, `$81B5B2` or `$81B5E0` as a WRITE; `$27FB72`/`$27FB78` READ two of them. **The "uncovering adds a HIT and refills the gauge 50 %" claim has no writer on either path** |
| C14 the flicker is the items' 4-cell/2-frame animation | **REFUTED for the bee**, which has its own 1-in-3 blink (§1.4) and, on the carrier, a 1-in-2 emit gate (§4) |

### `71-webrecon-bees-scoring`

| its claim | verdict `[M]` |
|---|---|
| **§0.3 the bee is a SEVENTH subsystem, outside both ranges recon 59 censused** | **CONFIRMED.** `$27FACC`, pool `$8171BE` |
| §6.2's seven tests ruling out the cap-20 counter | **CONFIRMED** — and `$8130BE` is not the bee counter; `$817F80` is |
| base × live HIT count | **CONFIRMED**, as a BCD digit-multiply at `$27FC42` |
| **base = 1,000** (four sources) vs **100** (TASVideos) | **THE ROM SAYS THE LADDER STARTS AT BCD 100** (`$27FD22[0] = $00000100`) and reaches BCD 1000 at index 9. **The TASVideos figure matches the first entry.** Whether the wikis' "1,000" is `$286128`'s own ×10 or a different label is UNRESOLVED — I did not read `$286128`'s scaling |
| +1,000 per perfected stage (single-source) | **CONFIRMED IN SHAPE**: `$27FC0C addq.w #$4,$817F82` walks the ten-entry table one step per perfected stage, and the table's steps are +100 BCD |
| ×2 on the tenth, gated on no-miss | **CONFIRMED**, gated on `count == 10 && $81293C == 0` |
| **3 % = `$48`, 30 % = `$2D0`, floor 20, ceiling 200, gated on `$81B63E`** | **CONFIRMED, EVERY NUMBER** (§6). This is the best-predicted result any recon in this project has produced |
| the gate might BANK to `$81B6E0` rather than refuse | **REFUTED: it SKIPS** (`$27FBA2 bne $27FBEE`) |
| collecting a bee does not tick the chain | **CONFIRMED** — the award goes through `$286128`, not `$28615E`/`$2862C6` |
| §6.3 `$8130BE`'s `bmi` freezing the chain decrement | **NOT INVESTIGATED.** Still open, still uncensused |

### `72-webrecon-bees-stage1`

| its claim | verdict `[M]` |
|---|---|
| ten bees, fixed, none in the opening stretch | **CONFIRMED**: ten records, triggers 173–452 of a 488 span |
| **the side sequence `R,L,R,L,L,L,L,R,L,L`** | **UNRESOLVED** (§3.2, §8.1). Not refuted — the datum I read is the wrong axis |
| the bee is probably NOT one of the six pool kinds | **CONFIRMED** |
| its `$04` ↔ Max Power and `$10` ↔ 1UP mappings | untested here |
| **every flashing-bee claim traces to a later game; DaiOuJou's appearance is undocumented** | **CORRECT ABOUT THE WEB, AND THE ROM SUPPLIES THE ANSWER: DaiOuJou's bee DOES blink** — the pickup 1 frame in 3, the carrier 1 frame in 2. Recon 72's refusal to guess was right |
| item 4: is any item record drawn on even frames only, off `$80390A`/`$803914` | **NO** — but pool A has a **`$80390C` sprite-thinning gate on twelve of twenty kinds above 60 live records**, and that is the even-frame mechanism the question was reaching for |
| item 8: connect the reveal to `$2453C2` | **PARTLY.** `$2453C2` writes the `$5C` bits the carrier consumes, so it is *a* damage source — but it is not "where the reveal lives"; there is no laser-specific reveal |
| the ledger has no row for bees, nothing measured | **STILL TRUE.** This file is a listing read |

---

## 10. WAVE ESTIMATE

**TWO WAVES, AND THE FIRST ONE IS SMALL AND VISIBLE.**

| # | wave | scope | size `[M]` | why |
|---|---|---|---|---|
| **B1** | **THE BEE APPEARS** | `$27F8EE`/`$27F8F8`/`$27F92A` (the three pool-A entries, 60 B), `$280B3E` the fill (~120 B) with the `$280E4A` 20-template table (20 × 22 B) and the `$280BB6`/`$280BCE` tables, `$27F95A` the driver (~66 B, **type-5 call #4**), `$27F87C` the clear, `$27FACC..$27FD20` **the bee body only** (148 B) with `$27FD22`/`$27FD4A`/`$27FD72`, `$27F2F0`-equivalent frees, the six `$23D762` layer emitters (already ported as emit stubs), **and `$2767E6`'s call made**. **REFUSE the other 18 kinds** at the allocator, loudly and by name. Art: `$1BCA34`, `$1BCA80`, `$1BCACC` + whatever `$28112C` walks | ~600 B of code + a ~440 B ROM window + a small shard | The owner can already SEE the carrier. Making its death produce a bee that falls, draws and can be walked into is the whole visible fix, and it is bounded by refusing the nineteen other kinds. **`$244D62` block 3 must come with it** (`$244DFE..$244E5C`) — `$2459D0` already shipped in W60, so the prerequisite is met |
| **B2** | **THE BEE SCORES** — and it touches RANK | `$27FB6C`/`$27FAE6` (the two collect arms, ~260 B), `$242AF6` (46 B), the ten-entry base table and the ×2 **transcribed with its BCD bug**, `$286128`'s two call shapes, `$817F80`/`$817F82` and their five resets, `$28112C`/`$280FDC` | ~400 B | **`$27FBDE add.w D0,$81B64A` is the first link of the accumulator chain in §6.** `$287682` and everything after it are unported and `61-impl` §5 measured a −24 offset on `$81B64A` already. **Ship the gauge add only with a decision about `$287682`, or REFUSE the gauge add and count it** the way W61 refused kinds `$0C`/`$14` |

**Realistic range 2–3** — B1 may split its art shard, and `$27F99E`'s other
nineteen kinds are a separate (large) enumeration nobody has sized.

**MUST BE TRUE BEFORE B2 SHIPS:** `$81293C` identified (§8.5); a decision on
`$287682`; and the ×2's `add.l D0,D0` transcribed **as the bug**, with a comment
naming rokulpg/trap15 and this file.

---

## 11. IMPLEMENTER-READY NOTES

1. **THE ONE MEASUREMENT THIS FILE OWES:** run the port for stage 1 and log the
   cross-axis position (`($4,A6)`) of each of the ten type-`$8A` records at the
   frame it first emits. That settles §8.1's `R,L,R,L,L,L,L,R,L,L` and gives the
   wave a red switch. It is a read-only run of code already in `src/`.
2. **RANGE-CHECK `$27F99E` TO 20 ENTRIES AND THROW.** The mask is `$7C` — 32
   indices — against 20 longwords; index 20 lands on `moveq #$1,D0`.
3. **THE `$280E4A` TEMPLATE TABLE IS 20 ENTRIES OF 22 BYTES** and the fill skips
   `+$1A`/`+$1B` (`$280B8C addq.w #$2,A0`). Do not merge the skip away.
4. **`$27F92A` IS NOT `$27F8EE` WITH A DIFFERENT BASE.** It reserves the LAST
   TEN slots and its only caller is the bee carrier's death. A port that routes
   the bee through `$27F8EE` will lose bees to a busy pool, silently.
5. **DO NOT TOUCH `handler8A`'s `bchg`/`eori`/`$240` arms.** §4/§5. They are the
   flicker, and the flicker is the cartridge's.
6. **`$27FBA2`'s hyper gate SKIPS, `$27FBAC`'s chain-meter gate SKIPS, and the
   `$200` clamp happens BEFORE the BCD→binary conversion.** Three separate
   early-outs; all three are rank-relevant.
7. **CONVERT, DO NOT DIVIDE.** `$242AF6` is a 14-pass `sbcd` loop against the
   BCD power table at `$242B20`. Dividing `$81B5DA` by 20 as a binary number
   gives different step boundaries above 99 hits, which is where scoring routes
   live.
8. **Fix the type-table base in `59-recon-items` §2.1 and in
   `src/handlers.js:1482`** (§2.1). The right one is `$27E412 + 8*(t-$80)`,
   `[init, handler]`, which `src/spawn.js` already has.

---

## LOG (appended as findings arrived)

- opened. Read `70-webrecon-bees-mechanics`, `71-webrecon-bees-scoring`,
  `72-webrecon-bees-stage1`, `59-recon-items` (all 937 lines), `61-impl-I2-items`
  (all 800 lines), HANDOVER, `docs/knowledge/09` and `10`.
- **[M] THE `$81B64A`/`$81B64C` CENSUS — recon 71's Tier 1, and nobody had run
  it.** 17 sites each, 11 writers each. **`$27FBDE add.w D0,$81B64A` is in the
  `$27Fxxx` range, OUTSIDE both ranges recon 59 censused** — which is how the
  bee was found. **Recon 71's `$48`-per-step and `$2D0`-ceiling predictions are
  EXACT**, the floor is 20 hits, the gate is `$81B63E` and it SKIPS, and the
  index comes from a BCD→BINARY conversion by `$242AF6`.
- **[M] THE BEE IS `$27FACC`, KIND 1 OF POOL `$8171BE`** — `cmpi.w #$A` against
  `$817F80`, a ten-entry BCD base table `$27FD22` (100…1000), a `base × hits`
  BCD digit-multiply into `$286128`, and the ×2 as `add.l D0,D0` **on a BCD
  value — the documented overflow bug, in the listing.**
- **[M] THE POOL GEOMETRY CLOSES EXACTLY**: 70 + 10 = 80 slots of `$2C`,
  `$8171BE + 70*$2C == $817DC6`, `+ 10*$2C == $817F7E` the live count, and
  `$27F87C`'s clear covers the pool plus seven trailing words, three of which
  are the bee's counter, base cursor and the star accumulators.
- **[M] THE CARRIER IS ENEMY TYPE `$8A`**, prototype `$2766E6`: **sprite
  `$1BCA34`, size `$0618`, draw offsets `$FA00FD00` — byte for byte the pool-A
  bee template `$280EB0` — and HP `$000A` = TEN.** Its record prototype sets
  `($1A,A5) = $0004` and its death passes it to `$27F92A`, **whose only caller
  in the whole image is that one site**, into a **RESERVED TEN-SLOT** arena.
- **[M] STAGE 1 HAS EXACTLY TEN TYPE-`$8A` RECORDS** out of 339, triggers
  173..452 of a 488 span — **none in the opening third**, corroborating recon
  72 §1. **The R/L sequence is UNRESOLVED**: the datum I read is the
  along-scroll spawn edge, not the cross axis.
- **[M] THE REVEAL IS AN EMIT GATE, NOT A FLAG, AND NOT A LASER TEST.**
  `$276702` emits nothing unless a bomb is live or a player is within `$240`;
  then `bchg #$6,($1,A6)` emits on **every OTHER frame** and
  `eori.l #$B4,($A,A6)` toggles `$1BCA34` ↔ `$1BCA80` — **and `$1BCA80` is the
  same second frame the REVEALED bee uses at `$27FCA0`.**
- **[M] THE OWNER'S OCCLUSION HYPOTHESIS IS WRONG AND THE OWNER'S "shoot the
  cover off" IS RIGHT.** We draw the hidden object exactly as the cartridge
  does; what is missing is `$2767E6 jsr $27F92A` (a counted note) and pool A's
  driver `$27F95A`, type-5 call #4 (`src/type5.js:160`, index 3). `[M]`
  `$817F7E` is 0 on every run this port has ever made.
- **[M] WEB RECON 70 §2.2 IS CONTRADICTED BY THE LISTING**: DaiOuJou build B
  DOES have a destructible bee carrier. The six sources' silence was silence.
- **[M] KIND `$08` IS NOT THE BEE — `$81040B` = 3**, read out of the port's own
  shipped seed. Recon 70's C2 and recon 72's item 2 both answered, against
  recon 70's identification.
- **[M] AND THE TRAP FOR THE NEXT READER: KIND `$08`'s ART IS AN INSECT TOO.**
  Decoded from the cartridge with `pgmgfx.py`. **Two bee-looking pickups, two
  pools, two counters.** Kind `$08` nevertheless cannot be what the owner saw —
  its only drop is type `$86`'s death and **stage 1 has zero type-`$86`
  records.**
- **[M] A SECOND, DIFFERENT AUTHENTIC FLICKER**: twelve of pool A's twenty kinds
  gate their emit on `cmp.w $80390C,D0` **once the pool holds 60+ records** —
  sprite thinning. The bee is not one of them, and neither is any ported item
  kind.
- **[M] A CORRECTION THAT HAS PROPAGATED:** the enemy type table is
  `$27E412 + 8*(t-$80)`, `[init, handler]`. `59-recon-items` §2.1's
  `$27E016 + 8*t -> [step, init]` is 4 bytes high and reads **the next type's
  init** as this type's.
- nine things I could not determine (§8); the first — the ten bees' left/right
  order — is one read-only port run away (§11.1).

status: **DONE**
