# W21 IMPL — THE BULLET PATTERN GENERATORS

status: **DONE**
wave: 21   role: implementer (DAIOUJOU)   started: 2026-08-02
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`–`$2Axxxx`) unless the line says otherwise; `$2xxxxx` **below**
`$230000` is shared DATA/library, not build-A code (`NOTES-build-split.md`).
**No build-A address is introduced anywhere in this wave.**

Brief: port the two emitters, the 20 generator entries, the 39+39+39 kind
tables and the velocity field. Explain the STORAGE FORMAT plainly. Get the
angle/speed maths exactly right.

---

## 1. HOW THIS GAME STORES ITS PATTERNS — written for someone who has never
##    read the ROM

The owner asked, and it is the most interesting thing in the subsystem: *"there
are so many cool patterns in this game, I wonder how they are stored."*

**They are not stored. They are written out as code, one instruction per
bullet.**

There is no pattern table. Nowhere in the 6 MB is there a record saying
`{count: 8, step: 11.25°, kind: 4}`. What exists instead is a small vocabulary
of **generators** — nineteen entry points, about two hundred instructions in
total — and every one of the game's 912 firing moments is a `jsr` to one of them
with five registers set up:

```
D0 = (speed bias << 16) | KIND      "a slow blue one"
D1 = the ANGLE                      1/64 of a turn, or 1/256 -- see below
D2 = (axis A << 16) | axis B        where it appears
D3 = a position nudge, and for some kinds a pattern parameter
D4 / D5 = per-kind extras
A5 = the enemy doing the firing
jsr $2817B8
```

### The nineteen generators ARE the fan shapes

Each generator is a hand-unrolled sequence of calls into one of two **spawn
cores**, with the angle and speed offsets baked in as instruction operands. The
two-way spread is literally this, at `$2816DE`:

```
2816DE: subq.b #8,D1          eleven and a quarter degrees to one side
2816E0: jsr    $2817C2        FIRE
2816E6: addi.b #$10,D1        ...and to the other
2816EA: jsr    $2817C2        FIRE
```

That is the whole thing. Eighty-five call sites in the cartridge point at the
entry that runs it. The three-way is the same with a shot in the middle first;
the "two bullets at the same angle, one faster" generator adds `$60000` to D0
between the two calls, which is `+6` in the speed bias's half of the register.

So the vocabulary, complete, is:

| shape | how it is written |
|---|---|
| one bullet | just call the core |
| one bullet, faster | `addi.l #$40000,D0` around the call |
| two, same angle, staggered speed | call, `addi.l #$60000,D0`, call |
| three, same angle | call, `+5`, call, `+5`, call |
| two, ±11.25° | `subq.b #8,D1`, call, `addi.b #$10,D1`, call |
| three, centre + ±11.25° | call, then the above |
| **the adaptive one** | ask the ENEMY's own flags whether to fire two or three |

### Fans wider than three live at the CALL SITE, as a `dbra` loop

The stage-1 midboss's eight-way ring, `$273B44`, is the clearest example in the
game and every number in it is an instruction operand:

```
273B4E: moveq  #$4,D0         KIND 4
273B62: subi.b #$1C,D1        BASE  = the aim, minus 28/256 of a turn
273B66: moveq  #$8,D6         STEP  = 8/256 = 11.25 degrees
273B68: moveq  #$7,D7         COUNT = 8 (dbra counts to -1)
273B6A: lea    $2735FA,A0     the MUZZLE ELLIPSE, 64 entries
273B7E: jsr    $2817B8        FIRE
273B84: add.w  D6,D1 / dbra D7,$273B70
```

A ring, a fan, a spiral and a "wall with a gap in it" are all this loop with
different immediates. That is the answer to the owner's question: **the patterns
are stored the way a demoscene coder stores them — as unrolled code and loop
counters — and the only DATA involved is what each individual bullet IS.**

### What IS stored as data: the 39 KINDS

A **kind** is an index 0..38 into three parallel 39-entry pointer tables. This
is the game's entire per-bullet data model:

| table | entry | what it is |
|---|---|---|
| `$281956[k]` | → a 20-byte **TEMPLATE** | the sprite, the graphic index, the base speed, one flag |
| `$2815C6[k]` | → a **SPAWN-INIT** | up to five stores of the caller's D3/D4/D5 into the record's parameter area. Nine distinct routines behind 39 entries. |
| `$282030[k]` | → a **BEHAVIOUR** | run once by the mover; it installs a per-bullet CONTINUATION at record +$22 that the mover then `jmp`s every frame |

The 20-byte template, in full — and every one of the 39 is this shape:

```
+$00  w   type word    $8100 | kind, plus bit 7 for six of them
+$02  l   sprite render offsets     ($FC00FD00 / $FC00FE00 / $FE00FE00)
+$06  l   sprite descriptor         ($00000000 in every one of the 39)
+$0A  w   graphic index             ($0418 / $0410 / $0210)
+$0C  w   sprite attribute          ($001A in every one of the 39)
+$0E  w   BASE SPEED                (20 in every one of the 39)
+$10  w   run the spawn-init?       (0 or 1)
+$12  w   NOT READ BY ANYTHING -- see §5
```

So a "kind" carries almost nothing: a picture, a base speed that never varies,
and a pointer to the code that makes it curve or split or track you. **The
interesting half of a bullet is its behaviour routine, and that is code too.**

### The separation, stated once

> An **entry point** chooses the SHAPE — how many bullets, at what angle and
> speed offsets. A **kind** chooses what each bullet IS — its picture, and its
> per-frame behaviour. They are orthogonal, and a call site picks both with two
> immediates. Nineteen shapes × thirty-nine kinds, from about two hundred
> instructions and 780 bytes of table.

### And the one variable that turns a shot into a fan

Sixteen of the nineteen entry points open with the same two instructions:

```
tst.w $813098
beq   <the spawn core>
```

**At `$813098 == 0` every single generator emits exactly ONE bullet.** The fan
body is skipped entirely. `$813098` is the loop flag (second lap of the game),
and it has read **0 on every frame this project has ever measured** — sixteen
thousand of them, including a whole boss fight. So every spread described above
is code the cartridge has never been *observed* to run, and validating it needs
the flag forced. See §7.

---

## 2. THE ANGLE AND SPEED MATHS — `$284190`, and the four conventions

This is fourteen instructions and three tables, and a rounding difference here
is a bullet in the wrong place a second later.

```
284190: add.w D0,D0 / add.w D0,D0            speed * 4, a LONGWORD index
284194: lea $200920,A3 / movea.l (A3,D0.w),A3    the per-SPEED table
28419E: move.w D1,D3 / add.w D3,D3           direction * 2, a WORD index
2841A2: lea ($283F50,PC),A2 / adda.w D3,A2 / adda.w (A2),A3   THE FOLD
2841AA: move.l (A3)+,D2 / move.l (A3)+,D3
2841AE: asr.l #4,D2 / asr.l #4,D3            the table is in 1/16ths
2841B2: andi.w #$C0,D1 / jmp ($2841C2,PC,D1) THE QUADRANT
        +$00 rts                Q0 ( dA,  dB)
        +$40 neg.w D2 / rts     Q1 (-dA,  dB)
        +$80 neg.w D2 / neg.w D3 / rts  Q2
        +$C0 neg.w D3 / rts     Q3
```

**1. DIRECTION IS 1/256 OF A TURN**, 1.40625° per step, stored in ONE BYTE at
record `+$1B`. The generators come in two banks and *they do not agree on the
unit*: bank A (`$2813F0`…) takes the angle in **1/64** turn and the core
multiplies it by four (`$281586 add.b D1,D1` twice); bank B (`$2816F6`…) takes
it already in 1/256 and does not. Confusing the two puts every bank-A bullet at
four times its angle. The core then **divides it back** (`$28159A lsr.b #2,D1`)
so a generator can call the core twice with the same register — and that round
trip is lossy above `$40`, which is why it is written as a shift.

**2. SPEED IS AN INDEX, NOT A VELOCITY.** Record `+$1A` is a byte 0..255 that
selects one of **256 tables of 65 records of 8 bytes** — 133,120 bytes of
velocity field at `$200D20..$22151F`, with the pointer table at `$200920`. The
mover **recomputes the velocity from (`+$1A`, `+$1B`) every single frame**
(`$281EF6..$281F02`). Nothing ever stores a heading vector. That is exactly how
a curving or homing bullet works here: the behaviour writes the direction BYTE
and the velocity follows. A port that stores dx/dy and integrates it is a
different program and will get every curving bullet wrong.

**3. THE FIELD IS AN ELLIPSE, 1.5 : 1.** Axis A (record `+$2`, the vertical) is
1.504× axis B (record `+$4`, the horizontal) at every speed. MEASURED through
the port's own code over all 255 non-zero speeds: the ratio is **1.5000 to
1.5113 for speeds 16..255**, and 1.4865..1.5714 below that where rounding an
eleven-unit vector dominates. It is the **same 1.5 the aim carries on the other
axis** (`$24205C`, W20), and the two cancel so a shot flies down the true line.
A textbook `atan2` plus a textbook unit-circle table is self-consistent and
wrong. They port as a pair or not at all.

**4. THE QUANTISATION IS ONE TABLE AND NOTHING ELSE.** `$283F50` is 256 words,
verified against the model over **all 256 entries** to be exactly
`8 × triangle(i)`, period 128, peaking at 64 — so the 256 directions fold onto
65 quarter-angle records (0..64 **inclusive**, which is why the stride is
`65×8 = $208` and not `64×8`). Direction 37 reads record 37; there is no
interpolation and no rounding anywhere else. The `asr.l #4` is **arithmetic** —
`>>>` would differ by one unit on any negative entry — and it discards the
table's 1/16ths before anything uses them. The four quadrants are then
`dir & $C0` into a jump table of three `neg.w`s and an `rts`:

```
dir   0 -> quarter  0, ( dA, dB) = (+A, 0)   "down", the +$2 axis
dir  64 -> quarter 64, (-dA, dB) = (0, +B)   the +$4 axis
dir 128 -> quarter  0, (-dA,-dB) = (-A, 0)
dir 192 -> quarter 64, ( dA,-dB) = (0, -B)
```

which is the same circle the aim produces (aim64 `0` = target below, `16` = to
the right), so aim and velocity agree by construction.

---

## 3. WHAT I PORTED

| file | what |
|---|---|
| `games/ddpdoj/src/bullets.js` | the two spawn cores `$2814B6` / `$2817C2` (freeze gate, active-window ladder, unrolled free-slot search, template copy, speed arithmetic, angle scaling, D3 delta, spawn-init dispatch), all **19** generator entry points and the **8 shared fan bodies** they branch into, the **9 spawn-inits**, the `$40`-byte record layout, the 20-byte template layout, the type-word bit names, the pool clear `$28131E` and park `$281330`, and the `$282030` behaviour DISPATCH |
| `games/ddpdoj/src/bulletmath.js` | `$284190` — the velocity lookup, the `$283F50` fold, the four-quadrant negate `$2841C2`, with the four conventions of §2 written out |
| `games/ddpdoj/src/rom.js` | `+ i32()` — the velocity field's entries are SIGNED longwords and `asr.l #4` is arithmetic |
| `games/ddpdoj/tools/export-tables.py` | **+5 ROM windows, 96 → 165,424 bytes**: the 39 template pointers and the 39 templates, the 39 spawn-init pointers, the 39 behaviour pointers, the 256-word fold table, and **the whole 134,144-byte velocity field**. Plus twelve new export-time invariants (§6). |
| `games/ddpdoj/tools/w21patterns.py` | the static enumeration: `tables inits gens field fold rewrites sites` |
| `games/ddpdoj/tools/oracle/w21bullets.lua` + `w21run.py` | THE SPAWN LEDGER: every pool write made from inside the spawn path, with the full input register set and a 210-bit pool occupancy bitmap per spawn |
| `games/ddpdoj/tools/w21patterngate.mjs` | THE GATE: spawn for spawn, WRITE FOR WRITE, plus the generator-level fan check and an 11-mutation matrix |
| `games/ddpdoj/tests/bullets.test.js` (69) | the suite goes 238 → **307 pass, 0 fail** |
| `games/ddpdoj/tools/oracle/pgm.py` | `check` runs the pattern gate on three corpora + the mutation matrix |

**NOT wired into the port's frame loop.** Like W20's turret, this is a state
transition validated against the board and not yet producing anything on the
page: it needs the spawn walker (W21 in the plan's numbering), the enemy
handlers that call the generators, and the bullet MOVER. `state.js`'s
`WATCH_SPEC`/`CLAIMED` are therefore unchanged — there is no new ported write
inside the live frame and adding one would be a claim I could not back.

### What is DELIBERATELY not ported, and throws by address

* **The 39 behaviour bodies and their continuations**, `$282104..$283BAF`,
  ≈6.7 KB. `behaviourFor()` resolves the address from `$282030` and
  `runBehaviour()` throws carrying it. Those routines are what make a bullet
  curve, split, track or spawn an enemy, and they are a wave of their own.
* **The mover `$281DDE`.** The velocity recompute is ported (`bulletmath.js`)
  and the mover's own loop — the `$5180` dispatch mask, the kill path, the
  sprite emit, the `$81B40E` cadence — is not.
* **`$281494`.** It is not an entry point; see §5.

---

## 4. THE VERDICT — spawn for spawn, WRITE FOR WRITE

The gate does **not** compare the finished record. `w21bullets.lua` captures
every store into the bullet pool made by an instruction inside the spawn path,
as `(PC, address, mask, data)`; the gate replays each spawn's input registers
through `src/bullets.js` and compares the port's write log against the
cartridge's, address by address, in order.

That shape is the point. **A gate that seeds a record through `REC.attribute`
and reads it back through `REC.attribute` agrees with itself whatever
`REC.attribute` holds** — which is the defect two of the last three waves on
this project shipped. Here the board says "a word, value `$001A`, at
`$817F8C+$1C`", and a port with the wrong constant writes a different ADDRESS.

Each spawn row also carries a **210-bit occupancy bitmap of the pool** taken at
that instant, so the port runs its own free-slot search over the board's own
pool state and must land on the board's own slot. That covers the unrolled
five-at-a-time walk and the `$81B414` window ladder, neither of which is
visible in the record's bytes.

```
$ node tools/w21patterngate.mjs                                  # PLAYING
CORPUS w21-bullets-play.tsv  spawns=197  unpaired=0
RESULT divergent=0 (slot 0, writes 0) of 197 spawns  -> 100.0000 %
RANK values in this corpus: 0000
COVERAGE kinds 7/39 -> 3,4,5,7,12,13,19
COVERAGE cores 2/2   spawn-inits 3/9 -> $2818AC $2818B4 $2818E0
COVERAGE rank-0 ENTRY arms attributed 7/19 -> $2813F0 $281402 $281484 $2814AC
                                             $281764 $2817A8 $2817B8
FANS grouped 197 generator invocations over 7 bodies/arms;
     shape-vs-LISTING divergent 0; shape-vs-PORT divergent 0; ungrouped 0

$ node tools/w21patterngate.mjs --corpus .../w21-bullets-fanplay.tsv   # $813098 POKED
CORPUS w21-bullets-fanplay.tsv  spawns=245  unpaired=0
RESULT divergent=0 (slot 0, writes 0) of 245 spawns  -> 100.0000 %
RANK values in this corpus: 0001
COVERAGE rank!=0 generator BODIES reached 2/8 -> $2813A6 $281402
FANS grouped 190 generator invocations over 2 bodies;
     shape-vs-LISTING divergent 0; shape-vs-PORT divergent 0; ungrouped 0
```

### The scenarios, and which kind each one is

| run | kind | frames | spawns | rank | deaths |
|---|---|---|---|---|---|
| `w21-bullets-play` | **PLAYING — on-distribution. No poke of any sort.** | 6,000 | 197 | `$813098` = 0 throughout | **2 (real)** |
| `w21-bullets-fanplay` | PLAYING, **`$813098` POKED to 1 from lf1850** — off-distribution | 6,000 | 245 | `$813098` = 1 on all 245 | *(see §8)* |
| `w21-bullets-faninvuln` | INVULNERABLE **and** `$813098` POKED — coverage only | 9,500 | *(§8)* | 1 | 0 |

All three press the VERSION-B chooser, coin, start, then run the owner's own
routine: sit bottom-centre, hold auto-shot, drift left/right on 12-frame legs,
throw a bomb every 900 logic frames. **Label every fan number
"`$813098` poked".**

### A MEASUREMENT THE POKE HANDED OVER, and it matters to the port

```
$ grep -o "b2=[0-9A-F]*" w21-bullets-play.tsv    | sort | uniq -c
    197 b2=0000
$ grep -o "b2=[0-9A-F]*" w21-bullets-fanplay.tsv | sort | uniq -c
    245 b2=0001
```

**`$812950` — one of the two global speed biases added to EVERY bullet in the
game — read 1 on every spawn of the poked run and 0 on every spawn of the
unpoked one.** `20-plan` §7 item 8 recorded it as "value 0 throughout stage 1 —
do NOT compile the constant in". This is the first measurement anywhere on this
project of it being non-zero, and it is what turns `no-global-bias` from an
invisible mutation into a red one.

---

## 5. FIVE CORRECTIONS TO `20-recon-pattern-tables.md`

Every one is from the listing, and each was found by porting rather than by
reading, which is the argument for porting.

### 5.1 `$281494` IS NOT AN ENTRY POINT — there are NINETEEN, not twenty

```
281494: jsr ($2814B6,PC) / nop / addi.l #$40000,D0 / jsr ($2814B6,PC) / nop
2814A6: movem.l (A7)+,D0-D1/A0        <-- POPS THREE LONGWORDS IT NEVER PUSHED
2814AA: rts                           <-- ...so this returns to garbage
```

Nothing in the 6 MB image branches to it or calls it, and it is not reachable
by fall-through (`$281490` is an unconditional `bra $2813A6`). It is an orphan
BODY — the rank≠0 arm of a generator whose head this build does not contain.
The recon lists it among "twenty entry points" with 0 sites. **The callable
inventory is 19 entry points behind 912 fire call sites** (the recon's 911 plus
one `jsr (d16,PC)` site inside kind 28's own behaviour, which an
absolute-long-only scan cannot see).

### 5.2 THE 20 UNREACHABLE KINDS ARE NOT PRODUCED BY IN-FLIGHT TYPE REWRITES.
### THERE ARE NO IN-FLIGHT TYPE REWRITES.

The recon's §6 says the other 20 kinds "are reached by IN-FLIGHT
TRANSFORMATION — the continuation at rec+`$22` rewrites the type word (e.g.
`$2824DC bchg #$3,(A6)`, measured 1,608 times in 3,200 frames)".

`w21patterns.py rewrites` decodes **every** instruction in `$282104..$283BAF`
whose destination is the type word. There are **53**, and:

```
  writers that touch the LOW byte ($1,A6) = kind bits 0..5:  0
  writers of the WHOLE word:                                 0
```

Every one is a BYTE operation on `(A6)`. On a big-endian 68000 that addresses
the **HIGH** byte — word bits 8..15 — so `bchg #$3,(A6)` is **word bit 11**,
not a kind bit, and bit 11 is not even in the mover's `$5180` dispatch mask. It
is a private per-bullet FLIP-FLOP that four continuations toggle to alternate
between two behaviours on successive frames (`$2824DC bchg #3,(A6) / bne
$282548`). The 53 break down as 35 × `andi.b #$FE,(A6)` (each behaviour
clearing its own dispatch bit, bit 8), 8 × `ori.b #$7C,(A6)` and friends (bit
12, the kill), and 5 × `bchg` on bit 11.

**The KIND of a live bullet is fixed at spawn, in `$281568`/`$28187A`, and
nothing in the 39 behaviours or their continuations changes it.** So the
mechanism the recon proposed does not exist in the range it named, and the
honest status of those 20 kinds is in §7.

### 5.3 TEMPLATE +`$12` IS NOT PADDING

`w21patterns.py tables`:

```
  template +$12 NON-ZERO: {10: 1, 11: 1, 12: 1, 14: 1, 15: 1, 18: 1, 20: 1,
                           23: 1, 38: 19065}
```

Eight of the 39 carry a 1 there, and neither core reads it (the last word read
is +`$10`, after six loads totalling `$10` bytes). Kind 38's +`$12` is `$4A79`,
which is `tst.w abs.l` — **the first opcode after the table**, which is how the
template block's far end is pinned. Calling it "padding" is a claim nobody has
evidence for; it is an unread field and the port says so.

### 5.4 TYPE-WORD BIT 7 IS SET FOR **SIX** KINDS, NOT FIVE PLUS ONE ODDITY

The recon reads kind 35's template type word `$81A3` as "bit 5". Kind 35 is
`$23`, whose own bits are 5, 1 and 0 — so `$81A3` is `$8100 | 35 | $80` and
kind 35 has **bit 7**, exactly like 16, 17, 18, 20 and 21. Six kinds take the
`$281F3E` mover path, not five.

### 5.5 KINDS 14 AND 15 ARE PURE ALIASES OF KIND 10 — 39 INDICES, 37 BULLETS

Kinds 10, 14 and 15 share template `$281ABC`, **whose type word is `$810A`**.
The mover dispatches on the LIVE type word (`$281F08 moveq #$3F,D0 / and.w
(A6),D0`), so a bullet spawned as kind 14 IS kind 10 from the instant it
exists: same template, same spawn-init, same behaviour, same everything. The
recon notes the shared template; the consequence — that the kind index is
erased at spawn — is what matters to a port that indexes anything by kind.

### 5.6 (a smaller one) THE SPAWN-INIT OFFSETS ARE ALL +$10

`A0` is record base + `$10` when a spawn-init runs — the six-load copy sequence
left it there and nothing restores it. So `$2818B4 move.l D3,($18,A0)` writes
record +`$28`. The recon's §4 table has the record offsets right; its §1
register table lists kind 28's target index at "+`$1A`" where the instruction is
`move.b ($3,A5),($1a,A0)` and the record offset is +`$2A`. `$2818E0` is a
byte-for-byte DUPLICATE of `$2818B4`, checked mechanically, not a variant.

---

## 6. COVERAGE — IN KINDS AND BRANCHES, NOT FRAMES

`docs/knowledge/10` is explicit that a frame count is not coverage, so here is
the sentence in the form that file asks for.

### 6.1 KINDS

> **39 of 39 kinds are instantiated through the port's own emitter and compared
> field for field against an INDEPENDENT PARSE of the cartridge's tables**
> (`tests/bullets.test.js`, "all 39 kinds spawn to the bytes an independent parse
> of the ROM predicts": for each kind the test reads the template at LITERAL
> offsets +$00/+$02/+$06/+$0A/+$0C/+$0E/+$10 and asserts the port's write log at
> LITERAL record addresses +$00/+$02/+$06/+$0A/+$0E/+$1C/+$1A/+$1B/+$3A/+$3B).
>
> **9 of 39 kinds — {3,4,5,6,7,11,12,13,19} — are additionally compared against
> the LIVE BOARD**, spawn for spawn and write for write, over 10,499 spawns in
> three corpora, at 0 divergent.
>
> **The remaining 30 are transcribed and driven, but no board run has produced
> one.** For 20 of them (§7) that is because no fire call site passes them at
> any back-scan width and — contrary to `20-recon-pattern-tables` §6 — nothing
> in the 39 behaviours rewrites a live bullet's kind either. For the other 10
> it is because they belong to later stages, which `$813096` never left.

### 6.2 BRANCHES

Counted from the listing, per ported routine, with the executed count taken from
the three corpora:

| routine | branches present | executed by a board run | how the rest are covered |
|---|---|---|---|
| the two spawn cores `$2814B6`/`$2817C2` | 4 freeze arms, 5 window-ladder steps, slot-found / pool-full, D3 zero / non-zero, init-flag 0 / 1, bank A / B = **17** | **10** (freeze open; ladder steps 0, 1 and 3; slot found; D3 applied; init flag both ways; both banks) | 7 by unit test: the three freeze-decline arms, ladder steps 2 and 4, the pool-full drop, D3 == 0 |
| the 19 generator entry points | 16 rank-gated entries x 2 arms + 3 ungated = **35** | **11** (9 distinct rank-0 arms attributed, 7 rank-not-0 bodies, less overlap) | 24 by unit test — `SHAPES` asserts every entry at `$813098` = 0 and = 1, from the listing |
| the flags-adaptive pair `$2814AC`/`$2817B8` | 3 arms x 2 banks = **6** | **2** (both banks' rank-0 arm) | 4 by unit test, all six combinations |
| the 9 spawn-inits | **9** | **3** (`$2818AC`, `$2818B4`, `$2818E0`) | 6 by unit test, each asserted at its record offsets |
| `$284190` | 4 quadrants, speed 0, the byte-domain guard = **6** | 0 — *the mover is not ported, so no board run drives it* | all 6 by unit test, plus the exported-field check over all 256 speeds and all 256 fold entries |
| **total** | **73** | **26** | 47 transcribed, unit-tested, and unexercised on the board |

> **26 of 73 branches in the ported routines have been executed by some board run
> and matched the cartridge; the remaining 47 are transcribed and covered by unit
> tests written from the listing; 40 paths are unported and throw with their ROM
> address (the 39 behaviour bodies and `$281494`).**

### 6.3 THE FANS, SEPARATELY, BECAUSE THEY ARE A DIFFERENT CLAIM

> **7 of the 8 rank-not-0 generator BODIES have been driven on the board and
> match both the listing's immediates and the port's output, over 4,135 grouped
> generator invocations, at 0 divergent — under `$813098` POKED.** The eighth,
> `$281366`/`$281680` (three bullets at speed +0/+5/+10), has zero fire call
> sites in the entire image and cannot be reached without inventing one.

Table-entry coverage, `docs/knowledge/10` item 2: **39 of 39 templates read,
39 of 39 spawn-init pointers resolved, 39 of 39 behaviour pointers resolved,
256 of 256 velocity rows exported and range-checked, 256 of 256 fold entries
checked against the triangle.**

---

## 7. THE 20 KINDS NO FIRE SITE PASSES — the honest status

```
$ python tools/w21patterns.py sites
  back=  600  sites=912  no immediate D0=   8  kinds=19/39
  back= 1200  sites=912  no immediate D0=   0  kinds=19/39
    NOT PASSED BY ANY SITE (20):
      [15, 16, 17, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38]
```

The brief says to drive these by "constructing the in-flight rewrite state".
**I could not, because the rewrite does not exist** — §5.2: there is not one
instruction in `$282104..$283BAF` that writes the kind bits of a live bullet's
type word, and the `bchg #$3,(A6)` the recon cites is word bit 11. The kind is
fixed at spawn, in `$281568`/`$28187A`.

So the status of those 20, stated as its own category:

* **TRANSCRIBED AND DRIVEN, UNEXERCISED ON THE BOARD.** All 20 are instantiated
  through the port's emitter in `tests/bullets.test.js` and compared, field for
  field, against an independent parse of the cartridge's own tables. Their
  templates, spawn-inits and behaviour pointers are exported and range-checked.
* **NOT PROVEN UNREACHABLE.** The back-decode is a heuristic with a measured
  1-in-91 failure rate, 8 sites still had no immediate at a 600-byte window, and
  a computed `jmp (d8,PC,Xn)` dispatch is invisible to every scan this project
  owns. "No site passes it" is a strong lead and not a proof.
* **ONE PRODUCER NOBODY HAD LISTED:** kind 28's own behaviour re-spawns through
  `$2817C2` at `$2832CE` with `D0 = 0` — a `jsr (d16,PC)` the recon's
  absolute-long scan could not see. **Bullets spawn bullets.**

Nothing in the port depends on either number: `spawnCore` accepts any kind
0..38 and throws by address at 39 and above, because that is exactly where the
ROM's own table ends and the cartridge would copy 20 bytes of garbage.

---

## 8. THE MUTATION TABLE — every check seen to fail

### 8.1 GATE MUTATIONS — ten, each red in at least one corpus

A mutation that is green on one corpus is not automatically a defective check:
`no-global-bias` cannot fail on a run where both globals read 0, because on that
run the mutated code and the ROM genuinely do the same thing. What WOULD be
defective is a mutation green EVERYWHERE. So the gate runs a matrix.

```
$ node tools/w21patterngate.mjs --matrix <play>,<fanplay>,<faninvuln>
                                play    fanplay  faninvuln
  attribute-raw-displacement    RED     RED      RED
  init-raw-displacement         RED     green    RED
  no-angle-scale                RED     RED      RED
  scale-both-banks              RED     RED      RED
  no-bit9                       RED     RED      RED
  no-global-bias                green   RED      RED
  bias-from-low-word            RED     RED      RED
  delta-axes-swapped            RED     RED      RED
  fan-always                    RED     green    green
  fan-never                     green   RED      RED
```

| mutation | what it does |
|---|---|
| `attribute-raw-displacement` | writes the sprite attribute at the instruction's literal `$0C` instead of `$10+$0C` — the "A0 is base+$10" trap |
| `init-raw-displacement` | runs the nine spawn-inits with A0 = the record base, i.e. takes every displacement at face value |
| `no-angle-scale` | bank A stops multiplying the angle by four |
| `scale-both-banks` | ...and bank B starts |
| `no-bit9` | drops `$281876 bset #$9,D7`, the only mark of which core spawned a bullet |
| `no-global-bias` | drops `$813160` + `$812950` from the speed |
| `bias-from-low-word` | takes the speed bias from D0's LOW word (the "surely D0 is just the kind" reading) |
| `delta-axes-swapped` | puts D3's two halves on the wrong axes |
| `fan-always` / `fan-never` | ignores `$813098` in each direction |

`no-global-bias` is the row to look at: **invisible on the on-distribution run,
red on both poked runs, because `$812950` reads 1 there** (§4). A project that
had only ever run the unpoked scenario would have shipped the hardcoded zero
`20-plan` §7 warned about, and no amount of extra running at the old settings
could have found it.

**`window-constant` is NOT in the matrix, and the gate prints why on every
run.** It is unseeable here BY CONSTRUCTION: the `$81B414` ladder only changes
an outcome when the lowest free slot is PAST the window, and on that path
`$281536` does `ori #1,SR` and **returns without writing anything**. A write tap
cannot observe a shot that was dropped, so no corpus this probe can produce
contains the row. It is covered by two unit tests, both seen red (break E).

### 8.2 SOURCE BREAKS — five constants, changed one at a time

```
sha256 BEFORE and AFTER all five, verified both ways, byte-identical:
  30cda299a78d9b26c1a5e56bab635cf4d40cc1b889514cdf8b39794c40b8068a  src/bullets.js
  675664e4d3fba497765359898428ca0cccfbfd42de6cc2744f3198738700688b  src/bulletmath.js
```

| break | the edit | tests red | gate (play corpus) |
|---|---|---|---|
| A | `REC.speed` `+$1A` -> `+$1B` | **40 of 69** | 197/197 divergent |
| B | `TPL.baseSpeed` `+$0E` -> `+$10` | **38 of 69** | 197/197 divergent |
| C | `VEC.quadStride` 65 -> 64 records | **2 of 69** | (the mover is unported, so the gate never drives `$284190`) |
| D | `REC.param28` `+$28` -> `+$18`, the raw displacement | **6 of 69** | 66/197 divergent |
| E | `BUL.windowIters` last entry `$29` -> `$28` (210 -> 205 slots) | **1 of 69** | 0/197 — the one the gate cannot see, §8.1 |

Break A is what this wave's test design exists for. The layout tests seed the
template at literal offsets and assert on a write log of literal ADDRESSES, so
moving one record constant by ONE BYTE reddens 40 tests and every one of the
board's 197 spawns. A gate that read the record back through `REC.speed` would
have stayed green through all of it.

### 8.3 TWO CHECKS THAT WENT RED BEFORE I PUSHED THEM

Recorded because the brief asks whether the checks were *watched* failing.

1. The first version of the Lua probe's `S` row had **28 format specifiers and
   30 arguments**, and Lua silently shifted every column after the eleventh.
   The TSV looked like plausible data. It is now `key=value` pairs, which cannot
   do that, and the reason is written in the file.
2. The exported-field ellipse test asserted `|ratio - 1.5042| < 0.002` and went
   red at speed 20 (1.5068) and again at speed 9 (1.5152). The PORT was right;
   my tolerance was invented. It now asserts the MEASURED envelope over all 255
   non-zero speeds (1.5000..1.5113 for speeds >= 16, 1.4864..1.5715 below) plus
   four exact rows read off the cartridge.

---

## 9. WHAT I LEFT UNPORTED, AND WHY

1. **The 39 behaviour bodies and their continuations**, `$282104..$283BAF`,
   ~6.7 KB — the routines that make a bullet curve, split, home, or (kind 18)
   SPAWN AN ENEMY through `$263684`. `runBehaviour()` throws with the exact
   `$282030[k]` address. It is the largest unread block left in the subsystem;
   the recon did not read them either.
2. **The mover `$281DDE`.** Its velocity recompute is ported; its loop, the
   `$5180` dispatch mask, the kill path, the `$81B40E` cadence and the sprite
   emit at `$281E96..$281EB8` are not. Without it nothing here runs in the live
   frame, which is why `WATCH_SPEC`/`CLAIMED` are unchanged — there is no new
   ported write inside the frame and adding one would be a claim I cannot back.
3. **The 912 fire call sites as data.** They are the *instances*, and the whole
   argument of this wave is that porting the generator turns each site into a
   five-tuple. They arrive with the enemy handlers.
4. **The muzzle ellipse tables** (`$2735FA` 64 entries, `$2736FA`, `$268B1E`).
   They belong to the call sites, not to the generators.
5. **`$281494`**, on purpose — it is not an entry point (§5.1), and calling it
   throws by address.
6. **The velocity field is exported in FULL (134,144 B), deliberately.** A
   derived subset — the trick `speed_index_set()` plays for the player's own
   shots — would be a guess, and `$812950` reading 1 on the poked run is the
   measurement that says the guess would have been wrong. ROM windows went
   96 -> **165,424 bytes**; `player.tables.json` is **402,635 B**.

### Riders for whoever picks this up

* **`$812950` = 1 under a poked `$813098`.** Nobody has explained the link.
  `$252C8E` writes it every frame; one read tap on its inputs names it. Until
  then the port reads it from RAM, as written, and never assumes 0.
* **`ungrouped 2053` of 6,188** on the invulnerable fan corpus: groups the fan
  check could not close, i.e. two generators interleaved inside one frame, or a
  shot dropped mid-fan. Neither is a divergence, but the number is the honest
  limit of the grouping heuristic and it would shrink with a tap on the
  generators' own `movem.l D0-D1/A0,-(A7)` prologues.
* **The eighth fan body `$281366`/`$281680`** (three bullets, speed +0/+5/+10)
  has **zero call sites in the whole 6 MB image**, in either bank. Transcribed,
  unit-tested, and unreachable as the cartridge stands.
* **`$2814AC`/`$2817B8`'s adaptive arms** are chosen by `($D,A5) & $81` and by
  bit 1 of the enemy's SUB-record byte 0. Both corpora took the rank-0 arm
  only, so which enemies pick which fan is still listing-only.

---

## 10. THE COMMANDS

```
python games/ddpdoj/tools/w21patterns.py all              the whole static inventory
python games/ddpdoj/tools/export-tables.py                33 windows, 165,424 B
python games/ddpdoj/tools/oracle/w21run.py 6000 w21-bullets-play
python games/ddpdoj/tools/oracle/w21run.py 6000 w21-bullets-fanplay   --rank 1850
python games/ddpdoj/tools/oracle/w21run.py 9500 w21-bullets-faninvuln --rank 1850 --poke 1250
node games/ddpdoj/tools/w21patterngate.mjs
node games/ddpdoj/tools/w21patterngate.mjs --corpus .../w21-bullets-faninvuln.tsv
node games/ddpdoj/tools/w21patterngate.mjs --matrix <play>,<fanplay>,<faninvuln>
node --test games/ddpdoj/tests/                           307 pass, 0 fail
python games/ddpdoj/tools/oracle/pgm.py check
```

Nothing ROM-derived is committed: the three TSVs, `rip/port/player.tables.json`
and `tools/oracle/out/` are gitignored, and the commit went through the private
index `.git/dojpat.index` with `read-tree HEAD` immediately before staging.

status: **DONE**
