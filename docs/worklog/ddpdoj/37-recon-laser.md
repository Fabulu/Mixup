# W37 — RECON: the player's LASER

status: DONE

Role: recon (READ-ONLY; the only file I wrote is this one; no commits).
Target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$28xxxx`)
unless the line says otherwise.

**PRIORITY, mid-task:** the coordinator raised this from recon to blocker — the
owner loaded the live site, pressed fire and got the `$24C180` throw, and the
gate fires on the FIRST held frame, so the game cannot be played at all. §9 is
written as an implementer brief for that reason.

---

## METHOD, AND WHAT THE NUMBERS ARE

Every figure marked **[M]** I measured in this session, two ways:

- `unidasm` through `games/ddpdoj/tools/oracle/xref.py dasm` / `ptrtable` /
  `callers` / `abs`, over `games/ddpdoj/tools/oracle/out/maincpu.bin`
  (6,291,456 B, address == file offset);
- a **capstone 5.0.7 every-even-offset sweep** of `$230000..$2A0000` I wrote
  this session (`scratchpad/scan2.py`).

Figures marked **[CITED]** name the document they came from and I did **not**
re-measure them. **No MAME was run in this session: every dynamic number below
is [CITED], without exception.**

Limits, stated once. The even-offset sweep over-reports (a hit can be a
mid-instruction alignment inside data) and never under-reports inside the range
swept. `xref.py`'s absolute searches cannot see `(d16,An)`, `(An)+`, or
PC-relative operands, so **a site count is a LOWER BOUND** and a clean result is
"no absolute-long site", never "nothing does this". Where I could not find
something I say so and say where I looked.

**In flight:** an implementer is editing `games/ddpdoj/src/` (handlers, spawn,
type5). Everything I say about `src/` is a snapshot of the tree as I read it and
may already be stale.

---

## 0. THE HEADLINE — THE BRIEF'S PREMISE IS HALF WRONG

The brief treats "the laser" as one thing. **[M] It is TWO weapons, in two
subsystems, selected by two different bits, damaged by two different passes, and
scored through two different arms.**

| | **(A) the BOMB-LASER** | **(B) THE BEAM** — what the owner means |
|---|---|---|
| selector | bit 0 of the PLAYER record's `($1,A6)` | `$24C164 btst #4,($40,A6)` — Button 1 **HELD** |
| set by | `$24989E bset #$0,($1,A6)` — inside the **BOMB** | nothing latches on the player; the raw held bit is re-copied every frame at `$24C134` |
| lives in | the player's shot spawn `$249BFC` | the OPTION OBJECT `$24C096` (type-5 call #9) |
| records | the 36-slot shot table `$810572` | `$811EF2`/`$811F12` control + a 32-slot × `$30` segment pool per player at `$8112F2`/`$8118F2` |
| handler | shot dispatch `[4]`=`$254078`, `[12]`=`$254136` | its own 32-entry dispatch `$254712`, driven by type-5 call #10 `$254680` |
| damage | the ordinary `$244D62` blocks 6a/6b | `$24536E`→`$2453AC`, a SEPARATE pass, plus `$244D62`'s **ninth block `$24560A`** |
| score | the ordinary `$286096` arms | `$2860C8 bsr $286A82`, a different accumulator, and a different chain rule at `$2862DC` |
| templates | `$24E8BC..`, **exported** by Wave 8 | `$24A932`/`$24AF68`/`$24B0A0`/`$24B1E0`, **NOT exported** |

Wave 8's "LASER TEMPLATES" export and `shots.js`'s `$254078` throw are **(A)**.
The thing a player gets by holding fire — the thing that throws on the live site
— is **(B)**, and Wave 8 exported none of (B)'s tables.

Both are unported. They interact: (A)'s bit changes four of (B)'s decisions.

---

## 1. WHAT SELECTS THE LASER

### 1.1 (A) — bit 0 of the player's `($1,A6)`, and the BOMB sets it

`$249BFC` (`src/shots.js spawnShot`) reads it twice **[M]**:

```
249c1c: btst #$0,($1,A6) / beq $249c28
249c24:   move.w #$6,D7            the free-slot scan length becomes 6
249c32: btst #$0,($1,A6) / beq $249c3c
249c3a:   addq.w #4,D0             +4 = the SECOND longword of $2554EA/$255502
```

**[M] Every reader of that bit I found**, by sweeping `$230000..$2A0000` for
`btst.b #$0, $1(aN)` and keeping the sites where the base register is
demonstrably the player record:

| site | what it changes |
|---|---|
| `$249B30` | the power byte `($56,A6)` comes from `($55,A6)`, not `($54,A6)` |
| `$249B5A` | the burst count D0 is forced to `$8` before `lsr #1 / andi #6` |
| `$249BC6` | the ship's cadence delay `($2a,A6)` is forced to 2 |
| `$249C1C` | the free-slot scan length becomes 6 |
| `$249C32` | the template pointer index gains +4 → the laser templates |
| `$249D18` | the fire SOUND becomes `$28C3EE`, not `$28C3BA` |
| `$24C1B2` | **(B)'s** beam template family becomes `$24D00A`, not `$24CFE2` |
| `$24C4DC` | the POD cadence delay is forced to 2 |
| `$24C482` | the POD burst count is forced to 8 |
| `$24CBEC`, `$24CCFC`, `$24CEB0` | **(B)'s** segment templates change |
| `$24D14A` | each pod's motion gains `dx += dx>>2` — the pods splay wider |

**[M] The only writer of that bit in the whole of build B that I could find is
`$24989E`, and it is inside the BOMB.** The sweep for
`b(set|clr|chg).b #$0, $1(aN)` over `$230000..$2A0000` returns **9 decode
sites** [M]:

```
  $24989E bset #$0,($1,A6)   <- A6 = THE PLAYER RECORD (the bomb block)
  $249A98 bset #$0,($1,A1)      A1 = the death/respawn sub-record ($249A80 arm)
  $24C0C8 bset #$0,($1,A6)      A6 = the OPTION block (its "initialised" bit)
  $24CD36 bset #$0,($1,A3)      A3 = $811EF2, (B)'s own beam record
  $254E1C bset #$0,($1,A0)      inside the (B) segment-handler family
  $26D4D6 bclr / $27C410 bset / $27C41C bclr / $27F562 bset   enemy records
```

`$24989E`'s context, read out of the listing **[M]**:

```
2497fe: cmpi.w #$4,$8130CE / bcs $249B2C      the distance clock must be >= 4
24980a: btst #$5,($19,A6) / beq $249B2C       BUTTON 2, on the EDGE byte
249814: A0 = $25270C (P1) / $252754 (P2) ; A1 = $81B65C/$81B65E  the BOMB STOCK
249864: move.w (A1),D1 / beq $2498E2          no bombs -> the HYPER arm instead
249898: jsr (A0)                              $25270C -- and see below
24989a: move.w #$1,(A2)
24989e: bset #$0,($1,A6)                      <<-- the (A) selector
2498a4: jsr $28C8DA
```

and `$25270C` **is itself a laser routine** [M]: `andi.w #$DFFB,$8104AA` then
`$25273A lea $8112F2,A6 / lea $811EF2,A0 / lea $811F32,A1 / lea $8104AA,A2`,
ending in `$2527AA move.w #$1F,D7 / move.w D0,(A6) / lea ($30,A6),A6 / dbra` —
**it zeroes 32 records of `$30` at `$8112F2`, i.e. (B)'s whole segment pool.**
So the bomb tears the beam down and switches the ship into bomb-laser mode in
the same breath.

**I could NOT find any instruction in `$230000..$2A0000` that CLEARS the (A)
bit.** Where I looked: the 9-site bit-op sweep above; `xref.py abs 8103e6` /
`810448` (267 decode sites, none a bit-clear on `+$1`); and the player's own
`$2491C0..$24A430`. It may be cleared by a whole-word write through a base
register, which no absolute search can see — `$249A2E bset #$6,(A6)` and
`$24C2F4 andi.w #$DFDB,(A6)` are the shape of instruction that would do it, but
neither touches bit 0. **UNRESOLVED, and it matters**: it decides whether (A) is
momentary or sticky.

### 1.2 (B) — the RAW HELD Button-1 bit, no latch on the player at all

```
24c134: move.b ($18,A4),($40,A6)     the PLAYER's RAW held byte -> the option block
24c15a: btst #$5,(A4) / beq $24C164
24c160:   clr.w ($40,A6)             the ONLY thing that can veto it
24c164: btst #$4,($40,A6) / beq $24C29E    <<-- THE LASER GATE
```

**CONFIRMED against the listing, exactly as the throw message states**: the gate
is on the RAW byte, has no speed-index term, and fires on the first held frame.
The ship's own cadence machine `$249B48` tests the EDGE byte `($19,A6)`, which
is why tapping gives shots and holding gives the beam.

**There is no ship-select, DIP or mode flag involved** [M]. `($58,A6)`
(`P.shipSel`) is read at `$249BCE`, `$24C1D0`, `$24CC0A` and `$24CCD6`, but only
to pick *which* table; `$80380F`, tested at `$2497AA`, gates the BOMB, not the
laser; `$8130F8` bit 2 gates the laser's SCORE arm (§4), not the weapon.

---

## 2. THE FIRE PATH, AND WHAT WAVE 8 ACTUALLY COVERS

### 2.1 (A): the bomb-laser goes through the spawn `shots.js` already has

`$249C3A`'s +4 selects `$2554EA[1] = $25556E` and `$255502[1] = $255582`; each
is a five-longword table indexed by `power*2`. **[M] Read out of the image:**

```
$2554EA[0] SHOT  $24DA20 $24DA6C $24DAB8 $24DB04 $24DB50   type word $8000 x5
$2554EA[1] LASER $24E8BC $24E908 $24E954 $24E9A0 $24E9EC   type word $8004 x5
$255502[0] SHOT  $24DA46 $24DA92 $24DADE $24DB2A $24DB76   type word $8000 x5
$255502[1] LASER $24E8E2 $24E92E $24E97A $24E9C6 $24EA12   type word $8004 x5
```

`shots.js`'s claim that the laser templates carry `$8004` → dispatch `[4]` is
**CONFIRMED, 10 of 10 templates [M]**. The spawn itself is fully translated
already; the throw is on the handler.

### 2.2 (B): the beam does not use the shot spawn at all

It is built inside `$24C096` from **four template families**, chosen by
`($22,A4)`, `($58,A4)`, `($5b,A4)` bit 2 and the (A) bit, through five
pointer tables at `$24CFBA..$24D12D` **[M]**:

```
$24CFBA  25 longs  -> $24A932 + $26*n     (type word $8002/$8007/$800C ...)
$24D01E   2 longs  -> $24D026,$24D03A     ship-select level
$24D026  20 longs  -> $24AF68 + $0E*n     (type word $8000/$8005/$800A ...)
$24D076   2 longs  -> $24D07E,$24D092
$24D07E  10 longs  -> $24B0A0 + $20*n     (type word $8001/$8006 ...)
$24D0A6   2 longs  -> $24D0AE,$24D0C2
$24D0AE  10 longs  -> $24B1E0 + $20*n
$24D0D6  ...                              the (A)-bit variant
```

### 2.3 WHAT THE WAVE 8 EXPORT COVERS — measured against all 107 windows

I parsed every `(0x…, 0x…, "…")` window out of
`games/ddpdoj/tools/export-tables.py` — **107 windows [M]** — and tested each
laser address against them:

| address | what | covered? |
|---|---|---|
| `$24E8BC..$24EA37` | (A) ship laser templates | **YES** — `$24E740..$24EA5F` |
| `$24E744`, `$24E7D4` | (A) laser anim tables | **YES** — same window |
| `$251184..` | (A) option-pod laser templates | **YES** — `$251100..$2513FF` |
| **`$24EC72`** | **(A) handler `[4]`'s sprite table (`$2540B2 lea`)** | **NOT COVERED** |
| **`$24ED4E`** | **(A) handler `[12]`'s hit table (`$25419E lea`)** | **NOT COVERED** |
| **`$24CFBA..$24D12D`** | (B) all five pointer tables | **NOT COVERED** |
| **`$24A932..$24ACE7`** | (B) template family 1 (25 × `$26`) | **NOT COVERED** |
| **`$24AF68..$24B047`** | (B) template family 2 (20 × `$0E`) | **NOT COVERED** |
| **`$24B0A0..$24B2FF`** | (B) template families 3/4 (20 × `$20`) | **NOT COVERED** |

**So the answer to "do the Wave 8 exports cover the fire path" is: they cover
(A)'s templates and NOT (A)'s two handler tables, and NOTHING of (B).**
Wave 8 exported the templates the *spawn* reads and not the tables the
*handler* re-points from — the same shape of gap as `$24DDD6`/`$24DEB2`, which
Wave 8 *did* export for the ordinary shot. That looks like an oversight rather
than a decision, and it is one line of `SHOT_WINDOWS` to fix
(`$24EC70, 0x0200`, by analogy with `(0x24DDD0, 0x01B0)`).

---

## 3. THE LASER'S OWN BEHAVIOUR

### 3.1 (A) is a stream of ordinary shot records with different constants

`$254078` (entry `[4]`) and `$254136` (entry `[12]`) are ONE routine with two
entry points, exactly the shape of `$253B1E`/`$253BDA`. **[M] Span
`$254078..$2541BB` = 324 bytes.** Read past the apparent end: `$2541B8 bra
$254140` jumps BACKWARD into the second entry's body, and the routine's real
last instruction is `$2541B8`; `$2541BC` is dispatch entry `[5]`.

Differences from the shot, all [M] from the listing:

| | shot `$253B1E` | laser `$254078` |
|---|---|---|
| Y kill | `cmpi.w #-$8000,($2,A6) / bcc` | same (`$2540FA`) |
| X kill | `+$400 / -$4000 / bcs` | **`+$C00 / -$5000 / bcs`** (`$25410A`) — a wider corridor |
| sprite table | `$24DDD6` | **`$24EC72`** |
| hit table | `$24DEB2` | **`$24ED4E`** |
| first-hit effect | `$289F54` D0=`$14` | same D0=`$14` (`$254174`) |
| first-hit scatter | two `$2433AE` draws, `asr #1` | **NO scatter at all**; `$25418A asr.w #2` on both velocities and nothing else |
| later-hit step | `subq.w #4,($24,A6)` | same |

**The laser record does NOT jitter on impact.** That is the single most visible
behavioural difference and a port that copies `$253BDE` would get it wrong.

### 3.2 (B) is a PERSISTENT BEAM, rebuilt from scratch every frame

Read out of `$24CB3A` and `$24CDC0` **[M]**:

- the control record `$811EF2` (P1) / `$811F12` (P2) is re-anchored to the ship
  every frame: `$24CE18 move.l ($2,A4),D0 / addi.l #$8000000,D0 / move.l D0,($2,A3)`;
- the segment chain is laid down by a `dbra` over **30 of the 32 pool slots**
  (`$24CBEA / $24CEA0 moveq #$1D,D0`), each `$30` bytes, at `$8112F2` (P1) /
  `$8118F2` (P2) — `$8112F2 + 32*$30 = $8118F2` and `$8118F2 + 32*$30 = $811EF2`,
  so the two pools are exactly 32 slots each and butt against the control
  records **[M]**;
- each iteration steps the write position `$24CF2A addi.w #$800,($2,A6)` and
  stops at `$24CF30 cmpi.w #$7800,($2,A6) / bcc` — **the beam terminates at the
  top of the playfield, not after a fixed length**;
- when it does, `$24CF40 move.w #$1,($c,A3)` and `($50,A6)` is reset to 4 —
  `($c,A3)` is then the "beam is complete" flag the retract path tests at
  `$24CF02`;
- the beam's HEAD is written at pool slot 27: `$24CCD0 movea.l A1,A2 / lea
  ($510,A1),A1` and `$510 = 27*$30`, so `$811802` = P1 slot 27 **[M]**. That is
  the same `$811802` `src/damage.js` calls "the A2 weapon object" — it is not a
  weapon object, it is the beam's muzzle record.

**What updates it per frame:** three separate type-5 calls, all unported.

| call | routine | what it does |
|---|---|---|
| #9 | `$24C096` | the gate, the arm-up, and the two beam BUILDERS (`$24CB3A`, `$24CDC0`) |
| #10 | `$254680` | **THE SEGMENT DRIVER** — 32 slots per player, `type & $1F` into a **32-entry dispatch at `$254712`** |
| #11 | `$255042` | the beam's DRAW: `$811F32`/`$811F52` into the sprite queue via `$23F508`/`$23EB6A` |
| #7 | `$255DD8` | the **bomb-laser** record `$811F72`, `(A6)&7` into a 4-entry dispatch at `$255E2E` |

**[M] `$254712` holds 32 entries resolving to 17 distinct handlers:**
`$2547B2 $2547C0 $2547E6 $254800 $2548C4 $2548DA $2548F0 $254904 $254986
$2549A8 $254A60 $254A68 $254ABE $254ACC $254B68 $254B76 $254B9E`.

**What kills it.** Releasing fire routes `$24C164` to `$24C29E`, which runs
`$24C2AC jsr $25370A` (`clr.w ($60,A4)`), `$24C2B2 bsr $24C8E4` (the speed ramp
back up) and, if `(A6)` bit 6 is set, `$24C2C4`'s teardown: five player cadence
bytes zeroed, `$252714`/`$25275C` called (the pool wipe of §1.1), `($4a,A6)=8`,
`($4b,A6)=4`, `andi.w #$DFDB,(A6)`, and then the pods swing BACK by
`($3e,A6)` per frame at `$24C310..$24C338`. The segments themselves are not
freed there — they are driven to death individually by call #10's handlers,
which is why the pool wipe exists as a separate routine.

### 3.3 THE ARM-UP SEQUENCE — and it reproduces the cited +17 EXACTLY

This is the part the implementer needs frame-by-frame, and **I derived it from
ROM constants alone, with no run** [M]:

```
24c164: btst #4,($40,A6) / beq $24C29E          held?
24c16e: tst.b ($3f,A6) / beq $24C180
24c174:   subq.b #1,($3f,A6) / bne $24C310      <- THE START DELAY
24c17c:   bset #6,(A6)
24c180: jsr $2536FA                             ($60,A4) += 4, capped at $80
24c186: btst #2,($1,A6) / beq $24C196           already latched? -> short arm
24c18e:   bsr $24C8BE ; bra $24C33A
24c196: tst.b ($1b,A6) / bne $24C1F6            pod 0 still swung out?
24c19c: bsr $24C8BE ; bsr $24C906 ; bcc $24C33A
24c1a8: bset #2,($1,A6)                         <<-- THE LATCH
...
24c1f6: cmpi.w #$4,($10,A6) / bne $24C23A
24c23a: move.b ($3e,A6),D0
24c23e: sub.b D0,($1b,A6)                       pod 0 angle -> 0
24c242: add.b D0,($3b,A6)                       pod 1 angle -> $40
24c246: cmpi.b #$40,($3b,A6) / bcs $24C33A      not there yet: done for this frame
24c250: bset #4,(A6) ... ($4a,A6)=8 ($4b,A6)=4 ... ($3f,A4)=1
```

The constants come out of the formation-2 option template `$24BF6E`, decoded
through `$24C0E8`'s copy **including its four-byte hole at +$22..+$25** [M]:

```
record +$1B = $10   pod 0 angle       (machine.js MEASURED $10 -- agrees)
record +$3B = $30   pod 1 angle       (machine.js MEASURED $30 -- agrees)
record +$3E = $02   THE SWING STEP
record +$3F = $0A   THE START DELAY
record +$4B = $04   the ramp counter  (= (($5a,A4)-2>>1)+4 at $24C8DC -- agrees)
```

So, from the first held frame:

```
  +0 .. +8    9 frames  ($3f,A6) counts $0A -> 0, everything else skipped
  +9 .. +16   8 frames  ($3b,A6) $30 -> $40 in steps of 2; ($1b,A6) $10 -> 0
  +17         ($1b,A6) == 0, so $24C196 falls through and $24C1A8 LATCHES
```

**9 + 8 = 17. The cited "$8104AB bit 2 latches at +17" is CONFIRMED from the
ROM, independently of the board run that produced it.** That is the strongest
cross-check in this document and it is the number an implementer should gate on.

From +17 the pods are stowed, so `$24C346 tst.b ($1b,A6) / beq $24C368` takes
the OTHER arm of the formation dispatch, and `$24C368 bsr $24D12E / add
($1e,A6),($2,A6) / bsr $24CB3A` **is where the beam is built** [M].

> **THIS RETIRES A COMMENT IN `src/options.js`.** Its `$24C368` throw calls that
> arm "a SINGLE `$24D12E` call plus `$24CB3A`, the **pods-stowed path**.
> MEASURED `$10` on every sampled frame". The measurement is right and the name
> is wrong: `$24C368` is not a curiosity, it is **the second half of the
> laser**, and it is unreachable in every corpus run for exactly the reason the
> laser is — nobody held the button for 17 frames. This is the third time on
> this project a path has been labelled inert because the thing that reaches it
> was unported.

The cited "+20: `$811EF2` goes live, `$8200 -> $8201/$9201`" is **partially
confirmable from the listing** [M]:

- `$8201` = `$8200` + `$24CD36 bset #$0,($1,A3)` with A3 = `$811EF2`. ✔
- `$9201` = `$8201` | `$1001`, and there is exactly one instruction in build B
  that ORs `$1001` into that record: **`$2455AE ori.w #$1001,(A1)`**, inside the
  laser's damage pass, with A1 = `$811EF2`. ✔ So `$9201` means *the beam hit
  something*, and the quoted trace therefore contains a hit.
- The three-frame gap +17 → +20 I could not pin to an instruction. Candidates
  are `($42,A6)`/`($43,A6)` (= `$00`/`$01` in the template) and `($4e,A6)`,
  cleared at `$24C1AE`. **UNRESOLVED.**

### 3.4 A CORRECTION TO ONE QUOTED MEASUREMENT

> "`$81295C` falls to 0 for the rest of the hold."

True, and it is **not a laser write**. `$81295C` is cleared at `$253A7C` and
incremented at `$253AA0` once per LIVE shot record, every frame, by the shot
driver `$253A70` [M]. It falls to 0 because the ship's cadence machine is
edge-gated (`$249B48 btst #4,($19,A6)`) and a held button produces one edge, so
after the initial burst nothing new spawns and the table drains. Reading it as
"the laser zeroes `$81295C`" would send an implementer looking for a writer that
does not exist. The six shots at lf2001..2007 are that same burst.

---

## 4. DAMAGE AND SCORING — THE PART THAT MATTERS MOST

### 4.1 The laser has its OWN damage pass, and it is not `$244D62`'s shot loops

```
$245314   88 B   entry, A6-selected (P1/P2); ONE caller, $254DA2 (a segment handler)
$24536E   62 B   entry, D7-selected;         ONE caller, $24CE46 (the beam builder)
   both -> $245352: $80FA7C = 1 ; D6 = $2800 ; A2 = A1 ; bset #1,(A1) ; bsr $2453C2
$2453AC  606 B   THE PASS itself, ending $245608 rts. Reached the OTHER way from
                 $24530C bsr, with $80FA7C = 0 and (A1) bit 1 required ALREADY set.
```

`$80FA7C` is the discriminator between "the beam just started" and "the beam is
already running", and it gates `$2455C6 tst.w $80FA7C / bne $2455FC` — the
knockback the beam applies to what it is melting. **[M]**

The pass walks **pool A `$81459C`, 100 slots (`$245426 move.w #$63,D7`) and pool
B `$81521C`, 50 slots (`$245548 move.w #$31,D7`)** — and unlike `$244D62`'s
loops it walks the SLOTS, not the live count. Damage is `sub.w D5,($18,A5)` with
D5 derived from `($1c,A1)`, reduced by `lsr #2` when `$81308C` is 0 and again by
`lsr #1` when `$81309C` is negative **[M]**.

### 4.2 **`$244D62` DOES NOT END AT `$245310`** — a ninth block nobody has named

W34 §1.4 tabulates `$244D62` as eight blocks ending at `$245310`, and
`src/damage.js` reproduces that table. **[M] `$245310` is `bra.w $24560A`, and
`$24560A..$2459CE` is 966 more bytes of the same routine** — a ninth block that
begins `lea $811F72,A6 / move.w (A6),D5 / bpl $2459CE`, i.e. **it runs only when
the BOMB-LASER is live**, and then:

- `$245638 lea $81459C,A5 / move.w #$95,D7` — **150 slots**, `moveq #$50,D5`
  (or `#$1` when `($1e,A6)` is non-zero): the bomb-laser's per-frame damage;
- `$2456A6..$245708` — a bounding box over **`$811F72` as 45 records of `$30`**
  (`$2456BC moveq #$2C,D5`, `$245704 lea ($2e,A6),A6` after a post-incrementing
  `tst.w (A6)+`), which **CONFIRMS `src/options.js`'s cited "45 × `$30` segment
  table `$811F72`"** [M];
- then pool B `$81521C`, 50 slots (`$245720 moveq #$31,D7`).

`$24560A` **appears nowhere under `games/ddpdoj/src/`** [M, grep]. W34's scan
range was `$244D62..$245312`, so the block is outside every count that wave
published, and `damage.js`'s `noteWeapons()` deferral names `$24518A`,
`$24525C` and `$2453AC` but not `$24560A`. **This is the twelfth fall-through
incident on this project and it has the usual shape: the routine looked
finished because the table said it was.** It is not a defect in what W34
shipped — the block is behind a flag the port holds at 0 — but the ledger is
under-counted by 966 bytes and the deferral note is silent about it.

### 4.3 THE SCORE ARM — the laser scores through a DIFFERENT accumulator

```
286096: btst #$1,(A6) / bne -> rts
28609e: btst #$2,$8130F8 / beq $2860DE
2860a8: move.w $811F72,D2 / bpl $2860DE          the BOMB-LASER record
2860b0: btst #$0,D2 / beq $2860DE
2860b6: moveq #$1,D0
2860b8: tst.b D2 / bmi $2860DE                   its bit 7 must be CLEAR
2860bc: btst #$4,D1 / beq $286102                P1?
2860c2: add.w $81B63E,D0                         + the hyper level
2860c8: bsr $286A82                              <<-- THE LASER ARM
2860cc: bra $2860DE                              ...and the ORDINARY P1 ADD STILL RUNS
```

**[M] `$2860CC bra.b $2860DE` means a laser hit runs BOTH `$286A82` AND the
ordinary `$2860E4..$2860FE` pending-score add, in that order.** `src/score.js`
already transcribes this correctly, including the unreachable P2 mirror at
`$2860CE`.

`$286A82` (**282 bytes, `$286A82..$286B9B`**, 0 absolute callers — reached only
by `$2860C8 bsr`) is a **completely separate machine** [M]:

```
$81B60C   a 10-frame reload      $286ABC / $286B8A move.w #$A
$81B612   a 7 reload             $286AC4 / $286B92 move.w #$7
$81B610   THE LASER ACCUMULATOR, clamped to $7FFF at $286B6A
$81B5DE   a countdown; when it BORROWS ($286AFC subq / bcc) the arm re-arms
$286AF8   bsr $2867B4            <<-- and this is the RANK feeder
$286B86   bsr $286626 into $81B4C4   the ordinary BCD adder, P1's pending score
```

### 4.4 **THE LASER FEEDS RANK ON ITS OWN CLOCK** — the owner's named failure

`$2867B4` (42 bytes, `$2867B4..$2867DD`; 0 absolute callers, reached by
`$286AF8 bsr`) **[M]**:

```
2867b4: subq.w #1,$81B636 / bcc -> rts       ITS OWN 8-FRAME DIVIDER
2867bc: moveq #$4,D2
2867be: tst.w $81B63E / beq                  hyper up?
2867c6:   moveq #$30,D2                      ...then 48 instead of 4
2867c8: add.w D2,$81B64A
2867ce: jsr $287682                          <<-- GRANTS A HYPER STOCK
2867d4: move.w #$8,$81B636                   reload the divider
```

`$287682` is the routine `src/score.js`'s own `capTail` note already names as
"the routine that GRANTS a hyper stock (`$81B65C`, capped at 5) and therefore
feeds `$285A62`'s +16 rank. That is the owner's own case." **[M] `$287682` has
six absolute callers in build B: `$249FDA`, `$27FBE4`, `$2866CA`, `$2867A4`,
`$2867CE`, `$2867E4`** — and `$2867CE` is the laser's.

**So: holding the laser accrues `$81B64A` at 4 per 8 frames (48 per 8 frames
under hyper) and grants hyper stock, which grants rank. The shot path reaches
`$287682` only through `$2866CA`, the chain-meter cap clamp — a different
trigger with a different cadence.** This is precisely the "one wrong rank gain
from using super and the entire route breaks" case, and it is unported on both
sides today.

### 4.5 **THE LASER BREAKS THE CHAIN** — measured at the chain machine

`$2862C6`, the per-hit chain machine, **[M] verbatim**:

```
2862dc: move.w $811F72,D2
2862e2: bpl $2862F2              not live -> the ordinary chain
2862e4: btst #$7,D2 / bne $2862F2
2862ea: tst.w $81B5AE / beq $286320
286320: clr.w $81B5DA            <<-- THE CHAIN COUNTER IS ZEROED
286326: (the plain score add; NO meter refill, NO meter test)
```

**While the bomb-laser record is live with bit 7 clear and `$81B5AE` == 0, every
hit CLEARS the chain counter and skips both the meter test and the refill.**
`src/score.js` transcribes this correctly today, and because `$811F72` is
permanently 0 in the port that branch has never been taken.

### 4.6 ORDER WITHIN THE FRAME — the answer to the brief's question

W19's measured order is
`rankclk > rank= > [ CHAIN+ > score+ > meter+ > (meter=cap) > score+ ]* > drain
> drain0 > meter-`, chain timer LAST.

**[M] The laser does NOT change that ordering, and here is why, from the
listing:**

1. **The chain decrement is still last.** It lives in `$284636`, inside
   `$28444E`, inside top-level object **type 0 `$28D520`** — a different
   dispatch entry from type 5, and nothing in the laser's chain touches it.
2. **The laser's own writes are all INSIDE the bracketed hit group**, because
   they are reached from `$286096`, which is called from an enemy handler or
   from `$2453AC`/`$24560A`. Their position in the frame is the caller's.
3. **But the laser ADDS a step inside the group, before the existing ones:**
   `$286A82` runs at `$2860C8`, i.e. **before** `$2860E4`'s pending-score add
   and before `$28615E`'s chain machine on a kill. The group becomes
   `[ laserAcc+ > (rank feed, every 8th) > score+ > CHAIN=0 > score+ ]`.
4. **And the laser's damage pass runs at a DIFFERENT POINT IN THE FRAME from
   the shot's.** The shot pass is `$28B670`, type 5's TAIL, after all 23 calls
   (`src/type5.js` already places it there). The laser's per-frame pass is
   `$24530C bsr $2453AC` and the ninth block `$24560A`, both **inside**
   `$244D62`, i.e. also in the tail — *but* the beam's start-of-beam pass
   `$24536E` is called from `$24CE46`, inside **type-5 call #9**, which runs
   **fourteen calls earlier**. So on the frame a beam starts, a laser hit can
   register before the enemy driver's own damage reactions for that frame.

**[M] `$811F72` is read at 32 absolute sites in build B** (sweep for
`$811f72.l`), and **not one of them writes it** — every write is through a base
register. The readers are not confined to the score code:

```
$24560A $2456C0 $249902 $24A3B0 $24C8E4 $255DD8 $255FAA $256468 $25652A
$264EBA $273A18 $2740AC $276756 $27A584 $27BCD0
$2814C6 $28153C $2817D2 $281848 $281E20 $281E5E     <- bullets.js / mover.js, PORTED
$284A6C $2860A8 $2862DC $28648C $286884 $286AAC $286BAA $286DD2 $288FBC
$29EC22 $29EC30
```

**Six of those sites are already inside ported code** (`src/bullets.js` §
`$2814BA`/`$28153C`/`$281544`, `src/mover.js` `$281E20`, `src/handlers.js`
`$273A18`/`$276756`). Those branches are frozen on their `$811F72 == 0` arm
today and will all change behaviour the day the laser lands. That is a
regression surface the implementer must be told about up front.

---

## 5. WHAT IS ALREADY THERE — checked, not assumed

I read `src/shots.js`, `src/damage.js`, `src/score.js`, `src/options.js`,
`src/type5.js`, `src/machine.js` and `src/weapons.js` in full.

**PRESENT AND CORRECT (transcription-level):**

| piece | where | note |
|---|---|---|
| the (A) selector read at `$249C1C`/`$249C32` | `shots.js:179,188` | correct |
| the `#$6` scan-length override | `shots.js:184` | correct |
| the (A) throw on `$254078` | `shots.js:197` | correct |
| the (B) gate `$24C164` and its throw on `$24C180` | `options.js:125` | the gate condition is the board's own; **verified against the listing** |
| the ramp UP `$24C8E4` | `options.js:198` | **ported and correct**, incl. the `$811F72` and `($1,A4)` bit-6 guards |
| `$25370A clr.w ($60,A4)` | `options.js:159` | ported |
| `$24C1A8`'s latch, `$811EF2`, the 45×`$30` table | `options.js:132` throw text | named, not implemented |
| the laser arms of `$286096` and `$2862C6` | `score.js:263,358` | **transcribed correctly**, both as live code (`$2862DC`) and as a note (`$2860C8`) |
| `$2453AC` / `$24536E` | `damage.js:91,364` | named in a deferral note |
| `laserRampWouldMove` | `type5.js:164` | a pure predicate, **no callers in the shipped path** — dead, and says so |

**ABSENT:**

- every routine in §6's table except `$24C8E4` and `$25370A`;
- `$2536FA` — **16 bytes**, and its sibling `$25370A` is already ported;
- the ninth block `$24560A` (966 B) — not even named;
- `$24EC72`/`$24ED4E`/`$24CFBA..$24D12D` and the four (B) template families —
  not exported;
- type-5 calls **#7 `$255DD8`, #10 `$254680`, #11 `$255042`** — counted as three
  of the thirteen unported calls, with no indication that they are the laser.

**WRONG OR STALE, and I checked rather than assumed:**

1. `src/type5.js:81-84` — "the spawn's laser selector is `btst #$0,($1,A6)` …
   the flag is READ in four places in `src/` and **WRITTEN IN NONE**, so `laser`
   in `shots.js` is permanently whatever the seed says (0), and the `$254078`
   throw sitting behind it is unreachable." **True of `src/` and false as a
   statement about the cartridge**: the cartridge writes it at `$24989E`, inside
   the bomb, which `src/player.js` throws on. The sentence reads as a fact about
   the game and is a fact about the port.
2. `src/options.js:178` — `$24C368` called "the pods-stowed path". It is the
   beam builder (§3.3).
3. `src/damage.js:59-67` and W34 §1.4 — the six/eight-block table of `$244D62`
   stops at `$245310`, which is a `bra` into 966 more bytes (§4.2).
4. `src/damage.js:364` deferral text — describes `$811802`/`$811892` as "the A2
   weapon object" / "the A3 object". They are pool slots 27 and 30 of the
   laser's own segment pool (`$28B690`/`$28B696 lea`), not separate weapons.

---

## 6. SIZE THE WAVE — the routine ledger

All spans **[M]**, start..last byte inclusive, from `unidasm` boundaries.

### (B) THE BEAM — the owner's blocker

| # | routine | bytes | state |
|---|---|---|---|
| 1 | `$24C164..$24C29D` the gate and its body (delay, ramp, latch, arm-up) | 314 | **throw** |
| 2 | `$2536FA..$253709` the `($60,A4)` ramp | 16 | absent |
| 3 | `$24C8BE..$24C8E3` speed ramp DOWN | 38 | absent |
| 4 | `$24C906..$24C927` the template stepper (returns carry) | 34 | absent |
| 5 | `$24CAAE..$24CAFB` template copy A | 78 | absent |
| 6 | `$24CAFC..$24CB39` template copy B | 62 | absent |
| 7 | `$24CB3A..$24CDBF` beam builder 1 | 646 | absent |
| 8 | `$24CDC0..$24CFB9` beam builder 2 (the segment chain) | 506 | absent |
| 9 | `$24CFBA..$24D12D` five pointer tables | 372 | **not exported** |
| 10 | `$254680..$254711` the segment DRIVER (type-5 #10) | 146 | absent |
| 11 | `$254712..$2547B1` its 32-entry dispatch | 160 | **not exported** |
| 12 | `$2547B2..$255041` **17 distinct segment handlers** | 2,192 | absent |
| 13 | `$255042..~$2551FD` the beam DRAW (type-5 #11) | ~444 | absent |
| 14 | `$245314..$24536D` + `$24536E..$2453AB` damage entries | 152 | absent |
| 15 | `$2453AC..$245609` the damage pass | 606 | absent |
| 16 | `$24A932`+`$24AF68`+`$24B0A0`+`$24B1E0` template families | ~1,500 | **not exported** |

**Code subtotal: ≈ 5,234 bytes across 15 routines, plus ~2,032 bytes of
tables that no export window covers.** Entry-point denominators: **32 dispatch
entries / 17 distinct handlers** (`$254712`), **4 pointer tables of 25/20/10/10
entries** (`$24CFBA` family), **32 pool slots × 2 players**.

### (A) THE BOMB-LASER

| routine | bytes | state |
|---|---|---|
| `$254078..$2541BB` handlers `[4]`+`[12]` | 324 | **throw** |
| `$24EC72`, `$24ED4E` handler tables | ~460 | **not exported** |
| `$2497FE..$2498E1` the BOMB block that sets the bit | 228 | absent |
| `$25270C..$2527BD` the bomb spawn / pool wipe | 178 | absent |
| `$255DD8..?` the `$811F72` driver (type-5 #7), 4-entry dispatch `$255E2E`, 2 distinct bodies | ≥ 1,700 | absent |
| `$24560A..$2459CE` `$244D62`'s ninth block | 966 | **absent and unnamed** |

### SCORE / CHAIN / RANK

| routine | bytes | state |
|---|---|---|
| `$286A82..$286B9B` the laser hit arm | 282 | note |
| `$2867B4..$2867DD` the rank feeder | 42 | absent |
| `$287682..?` the hyper-stock grant | ? | absent (already named by `score.js`) |
| `$286B9C..$286DA7` the P2 mirror | 524 | note |
| `$2862DC`'s chain fork | — | **already ported and correct** |

### DEPENDENCIES THAT ARE THEMSELVES UNPORTED

| needed by | dependency | size |
|---|---|---|
| `$24C180` | `$2536FA` | 16 B — trivial, do it in the same wave |
| beam draw #11 | `$23F508`, `$23EB6A` (sprite-queue entries) | check `spritequeue.js`; `$23EFEE` and `$23F2CA` are already there |
| beam builders | `$289FC0`/`$289FDA` (effects, from `$255066`/`$2550F0`) | the `$289xxx` family, unported for W34 §1.6's reason |
| the segment handlers | `$245314` (one of them calls the damage pass) | in this wave |
| `$286A82` | `$287682` → `$285A62` (+16 rank) | **W28's wave 8** |
| every beam frame | the four template families + 5 pointer tables | export-only, one `export-tables.py` edit |
| (A)'s handler | `$24EC72`/`$24ED4E` | export-only, one edit |
| (A) | the whole BOMB (`$2497AA`, `$25270C`, `$28C8DA`) | `player.js` throws on it today |

### **ONE WAVE OR THREE? — THREE, and here is the split**

**It is not one wave.** 5,234 bytes and 17 handlers behind three unported
type-5 calls is larger than W34 (which was 1,456 bytes and one call) and larger
than W31 (the 576-instruction midboss).

| wave | scope | why the cut is here |
|---|---|---|
| **L1** | export the tables; port `$24C164..$24C29D`, `$2536FA`, `$24C8BE`, `$24C906`, `$24CAAE`, `$24CAFC` and the arm-up; the throw moves from `$24C180` to `$24C368`/`$24CB3A` | the whole 17-frame arm-up is deterministic from ROM constants (§3.3), so it is checkable without the beam existing. **This alone does NOT unblock the owner** — see below. |
| **L2** | the two builders `$24CB3A`/`$24CDC0`, call #10 `$254680` + its 32 entries + 17 handlers, call #11 `$255042` | this is the beam. It is the big one and it may split again at the 17 handlers. |
| **L3** | `$24536E`/`$2453AC`, `$244D62`'s ninth block `$24560A`, `$286A82`, `$2867B4` and the `$287682` rank feed | damage and the ledger, which is where the owner's frame-exactness constraint bites and which needs `$287682`'s machine (W28 wave 8) beside it |

**(A), the bomb-laser, is a FOURTH wave** and should not be mixed in: it needs
the bomb, and `$254078` is only 324 bytes but `$255DD8`'s driver is not.

**Honest warning about L1 in isolation.** Porting L1 alone moves the throw 17
frames later. It does not make the game playable; it makes it playable for 17
frames. If the goal is "the owner can press fire", **L1 and L2 must ship
together**, and L3 can follow (a beam that draws and does not damage is
visibly wrong but not a lie, provided `$2453AC` stays a loud named throw).

There is a tempting shortcut — route the held case to `$24C29E`, the no-laser
path, so nothing throws. **Do not.** That is a quiet wrong answer of exactly
the class `HANDOVER` §4 forbids: the game would behave as though fire had been
tapped, and no gate would ever see it.

---

## 7. WHAT I COULD NOT DETERMINE

1. **What CLEARS the (A) bit** (bit 0 of the player's `($1,A6)`). Ruled out: the
   nine bit-op sites in `$230000..$2A0000`; the 267 absolute references to
   `$8103E6`/`$810448`; the player handler `$2491C0..$24A430`. It must be a
   whole-word write through a base register. Until it is found, I cannot say
   whether the bomb-laser is momentary or sticky, and that changes how long the
   ship's shot spawn is in laser mode after a bomb.
2. **The +17 → +20 gap** (§3.3). The latch is pinned to the instruction; the
   three frames after it are not. Candidates: `($42,A6)`/`($43,A6)`, `($4e,A6)`.
3. **RESOLVED, and it changes L3 — `$24C37A` has no inbound reference I could
   find.** `$24CB3A` and `$24CDC0` have exactly one `bsr` each and both are in
   the same six bytes:

   ```
   24c368: bsr $24d12e ; add.w ($1e,A6),($2,A6) ; bsr $24cb3a
   24c378: bra $24c37e
   24c37a: bsr $24cdc0          <-- and NOTHING I can find reaches $24C37A
   24c37e: dbra D7,$24c0b0 / rts
   ```

   What I looked at: (a) an every-even-offset capstone sweep of
   `$230000..$2A0000` for any instruction whose decoded operand text contains
   `24c37a` — **0 sites** (capstone prints absolute targets for PC-relative
   branches, so this covers `bra`/`bsr`/`bcc` as well as absolute operands);
   (b) a raw search of the whole 6 MB image for the longword `$0024C37A` —
   **0 occurrences**; (c) the same for `$0024CDC0` — **0**; (d) the formation
   dispatch `$24C384`, whose three entries are `bra.w $24C390/$24C4F8/$24C690`.

   **I am NOT writing "`$24CDC0` is dead code."** Two comments on this project
   have claimed unreachability and been artifacts of something else being
   unported, and this file has just retired a third (`$24C368`). But the
   consequence has to be stated because it re-prices L3: **`$24536E`'s ONE
   caller is `$24CE46`, which is inside `$24CDC0`.** If `$24C37A` really is
   unreachable in build B, then the beam's start-of-beam damage entry never
   runs, the beam is damaged ONLY by `$24530C bsr $2453AC` from the collision
   pass — and `10-recon-combat §8.7`'s cited "`$2453C2` executed ZERO times in
   580 live-beam frames" is explained by structure rather than by sampling.
   **Check this against build A with `tools/rosetta.py` before porting
   `$24CDC0`; a HIGH pairing is a lead to confirm by reading, not a fact.**
4. **The exact end of `$255042`** (type-5 call #11). I bracketed it at
   `$255042..~$2551FD` from where data begins; I did not find its `rts`.
5. **`$255DD8`'s full extent** and how many of its 4 dispatch entries are
   distinct (I measured 2 distinct bodies, `$255E3E` and `$255FE2`).
6. **RESOLVED — `$81B5AE` is "you bombed while a chain was alive".** [M] It has
   **three absolute build-B sites**: `$249958`, `$2564F4`, `$2862EC`.
   `$249958 lea $81B5AE,A3` is in the BOMB/HYPER block, and thirty instructions
   later:

   ```
   249962: move.w $81B5C0,D0      <- P1's CHAIN METER
   ...
   2499d4: tst.w D0 / beq $2499DC
   2499d8: move.w #$1,(A3)        <- $81B5AE = 1
   ```

   So the chain-break at `$2862EA` is **conditional on NOT having bombed with a
   live chain**: `$81B5AE == 0` → `$286320 clr.w $81B5DA`, the chain dies;
   `$81B5AE != 0` → the ordinary chain path runs. In other words the cartridge
   already has a "bombing preserves your chain" rule and the laser's chain-break
   is its complement. `src/score.js`'s transcription (`p.guard`) is correct;
   what was missing was what the guard MEANS. **This is directly the owner's
   "one wrong rank gain from using super and the entire route breaks" surface
   and it must not be simplified.** (P2's is `$81B5B0`, `$249958`'s twin at
   `$2499A6`.)
7. **Any dynamic number at all.** I ran no MAME, no gate and no test, by design.
8. **Whether `$2453C2` really ran zero times in 580 live-beam frames** — that is
   `10-recon-combat §8.7` [CITED] and I did not re-measure it. Structurally it
   is unsurprising: `$2453C2` is only reached from `$245364`, i.e. from the
   beam's *start* pass, not its per-frame one.

---

## 8. WAVE ESTIMATE

**THREE waves for the beam (L1+L2 together, then L3), plus a FOURTH for the
bomb-laser.** Floor: three. Realistic: **four to five**, because L2's 17
segment handlers (2,192 bytes) have a decent chance of splitting and because L3
drags in `$287682`, which W28 priced as its own wave.

**Order that matters:** the table export before anything (it is one edit and
every routine reads through it); L1 and L2 in the same shipping unit or the
owner is no better off; L3 after, with `$2453AC` a loud named throw in the
meantime; (A) last, behind the bomb.

---

## 9. THE IMPLEMENTER'S CHECKLIST

1. **Add the missing export windows FIRST.** `$24EC70,0x0200`;
   `$24CFB0,0x0180`; `$24A930,0x03C0`; `$24AF60,0x00F0`; `$24B0A0,0x0260`;
   `$254710,0x00A0`. Widths are mine and deliberately generous — "wider than
   measured fails at the export, narrower than used fails on the player's
   machine" is `export-tables.py`'s own rule.
2. **Gate on the RAW byte, never the edge, and never on the speed index.**
   `$24C164 btst #4,($40,A6)`. The wave-9 guard failed because it added a
   `speedIdx !== laserFloor` term the ROM has not got — a player already at the
   floor got silence. **Do not add a term the listing does not have**, even one
   that looks safe.
3. **The arm-up is 9 + 8 = 17 frames** and every constant comes from the
   formation-2 template `$24BF6E` through `$24C0E8`'s copy **with its four-byte
   hole**. `($3f,A6)=$0A`, `($3e,A6)=$02`, `($1b,A6)=$10`, `($3b,A6)=$30`,
   cap `$40`. Ignoring the hole shifts every byte from +$26 up by four and
   silently gives the wrong step.
4. **`$24C368` is the beam, not "pods stowed".** Retire that comment.
5. **`$244D62` does not end at `$245310`.** Read `$24560A..$2459CE`.
6. **`$254078` does NOT scatter on impact** and its X kill corridor is
   `+$C00/-$5000`, not the shot's `+$400/-$4000`.
7. **`$2860CC bra` means the laser arm and the ordinary add BOTH run**, in that
   order.
8. **The laser feeds rank on its own 8-frame divider** (`$2867B4`), separately
   from the chain-meter cap. Any wave that ports `$286A82` without `$2867B4`
   ships a laser that scores and does not raise rank — which is the owner's
   named failure with the sign flipped.
9. **Six already-ported branches change the day `$811F72` can be non-zero**
   (`bullets.js`, `mover.js`, `handlers.js`). Re-run those gates.
10. **Every unported piece gets a loud named throw at its own address.** In
    particular `$2453AC` and `$24560A` must throw rather than return, or the
    port will draw a beam that melts nothing and no gate will notice.

---

## LOG

- opened; read HANDOVER, `docs/knowledge/09` and `10`, W34, W28, and
  `src/{shots,damage,score,options,type5,machine,weapons}.js`.
- **the brief conflates two weapons** (§0): the Wave 8 "laser templates" are the
  BOMB-LASER; the held-fire BEAM is a different subsystem.
- **[M] the (A) selector's only writer in build B is `$24989E`, inside the
  BOMB**; I could not find a clearer (§7.1).
- **[M] `$24C164`'s gate confirmed exactly as the throw message states** — raw
  byte, no speed term, first held frame.
- **[M] the cited "+17 latch" reproduces from ROM constants alone**: 9 delay
  frames (`($3f,A6)=$0A`) + 8 swing frames (`($3b,A6)` `$30`→`$40` by 2).
- **[M] `$9201` = `$8201 | $1001` and the only `ori.w #$1001` into `$811EF2` is
  `$2455AE`, inside the laser damage pass** — so the quoted trace contains a hit.
- **CORRECTION**: "`$81295C` falls to 0" is the shot table draining, not a laser
  write (§3.4).
- **[M] Wave 8 covers (A)'s templates and NOT (A)'s two handler tables, and
  covers NOTHING of (B)** — tested against all 107 export windows (§2.3).
- **[M] `$244D62` has a NINTH block, `$24560A..$2459CE`, 966 bytes**, behind the
  bomb-laser flag, named nowhere in `src/` (§4.2). Twelfth fall-through.
- **[M] the laser feeds RANK through `$2867B4 → $287682` on its own 8-frame
  divider**, and **breaks the chain** at `$2862DC` (§4.4, §4.5).
- **[M] `$811F72` is read at 32 absolute build-B sites, six of them inside
  already-ported files.**
- **[M] `$24C368` is the beam builder**, not the "pods-stowed path"
  `src/options.js` calls it.
- **[M] `$81B5AE` identified**: it is set to 1 at `$2499D8` when a bomb/hyper is
  used while the chain meter is non-zero, so the laser's chain-break at
  `$2862EA` is "unless you bombed with a live chain" (§7.6).
- **[M] `$24C37A bsr $24CDC0` has NO inbound reference I could find** — a
  build-B-wide operand sweep, a whole-image longword search and the formation
  dispatch all came back empty. If that holds, `$24536E` (the beam's own damage
  entry, one caller `$24CE46`, inside `$24CDC0`) never runs and the beam is
  damaged only by `$24530C bsr $2453AC`. **Stated as "I could not find", not as
  absence** (§7.3). Confirm against build A before porting `$24CDC0`.
- sized: **≈5,234 bytes / 15 routines / 32 dispatch entries / 17 distinct
  handlers** for the beam, plus ~2,032 bytes of unexported tables.
- **WAVE ESTIMATE: three for the beam (L1+L2 shipped together, then L3), a
  fourth for the bomb-laser. `$2536FA` is 16 bytes and is the only trivial
  dependency; `$287682` is not.**

status: DONE
