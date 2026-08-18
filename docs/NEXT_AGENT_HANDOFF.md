# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-18 (W411)

## DOCKET -- THE OWNER'S PLAY REPORTS. `docs/DOCKET.md` IS AUTHORITATIVE.

Live items: **D42 D43 D46 D48 D50**. Closed by W410/W411: **D44 D45**. **D47** (docs pass) is done.

**THE TRIAGE THAT USED TO SIT HERE WAS WRONG IN THREE OF FIVE ITEMS AND HAS BEEN DELETED.** It is
still in git history if you want it. What it got wrong, because the pattern matters more than the
text:

- D44/D45: it named `items.js`, which is the WRONG SUBSYSTEM (P capsules). Stars and medals are
  pool A. It then blamed the 31 unported enemy types; every one of the ten refusing handlers was
  ported. Both guesses were mine and both were wrong.
- D45: it called kind 1 the medal. Kind 1 is the bee. The medal is kind 2.
- D43: it described the ordinary bomb's screen clear. **The owner corrected me**: the report is the
  LASER BOMB, a separate weapon with its own damage pass `$2456A6`.

**Read `docs/DOCKET.md` for the current state of each.** D44/D45 carry a full measured diagnosis;
D43 carries the owner's correction and the pool-B arithmetic; D50 is the late crater, unstarted.

## START HERE -- W411 (docket D49)

### A TEST WAS PINNING A DEFECT, AND IT COST EIGHT WAVES

`$27FA34` is `66 b8`: a **backward** `bne` to `$27F9EE`, the star's collect arm. `bee.js` read it as
"bits 11 or 12 set and it does NOTHING", and `w265poolakind0.test.js` **asserted that reading**. So
since W265 a star the player flew into was never collected, never scored, never counted. Coordinator
verified the bytes independently: `$27FA34 + 2 - $48 = $27F9EE`.

**This is the shape to fear.** Not a wrong constant a test would catch, but a wrong reading a test
was defending. When an ablation of that line passed, the test agreed with the port and both were
wrong together. Treat "the test pins it" as evidence about the TEST until you have read the bytes.

### THE OWNER'S D44/D45 HAD TWO INDEPENDENT CAUSES, AND BOTH ARE NOW FIXED

Ten enemy death arms called three unported entries of the pool-A allocator and logged a deferral
instead of dropping. Kind index 2, the medal, had no body at all. Measured, lf2000, 5400 frames:

| | before | after |
|---|---|---|
| pool-A delivered | 18 | **58** |
| kind 2 (medal) | 0 | **32** |
| `$817F84` medal P1 | 0 | **15** |
| `$817F86` star P1 | 0 | **4** |
| `$27F8EE` / `$27F8FA` refusals | 11 / 21 | **0 / 0** |

`$27F8F8`'s 1440 refusals are the bullet mover freeing off-screen: real, invisible, DEFERRED.

### THE ORDER IN MY BRIEF WAS BACKWARDS AND THE AGENT SAID SO

I ordered type `$90` first as a cheap proof needing no new body. `$90` is a **stage-2** type that
never spawns on any bench in this repo, and reaching stage 2 hits a **pre-existing** throw at frame
6495 (`$280252`, kind index 8, 45 records at once, a bullet cancel with `$81B412 != 0`). The agent
proved it pre-existing by reverting to `HEAD`: original throws at 6495, its tree at 6443, a 52-frame
RNG shift and not a regression. **That throw is still there and is nobody's fix yet.**

### FIVE GATE BASELINES MOVED, AND WHY THAT IS NOT A COVER-UP

W52/W53/W54/W58/W90 fingerprints shifted because real allocations now draw from the shared RNG
counter `$803917`. **`distinct` and `first` held on every shard** -- that is the witness that the ART
side did not change and only counts moved. Coordinator checked the diff. If you ever move a baseline
without being able to say which fields held, stop.

### FOUR MORE DECODING ERRORS FOUND IN ALREADY-SHIPPED CODE

- **`hitShortB` was wrong for both stage-4 kinds.** W216 wrote the ordinary body's sprite advance
  where `$281010 move.w (A0)+,($16,A6)` reads a table: `$0054` for kind 18 (port said `$0064`),
  `$0064` for kind 19 (port said `$00C4`).
- **`andi.w #$F8DF` clears bits 10, 9, 8 and 5, not 13.** Bit 5 is INSIDE the kind field, so the
  instruction edits the kind index of any record carrying it.
- **`$279B16` is `movem.W`, not `movem.L`** -- `4C9C` has bit 6 clear. Read as long, type `$91`
  would run 257 passes off a seven-entry table. `aligned.py` prints the bytes right; the size bit is
  on the reader.
- **The `$27F8FA` bounds tests are CARRY tests, not sign tests.** `addi.w #$800 / addi.w #$7800 /
  bcs` frees `[$8000,$F7FF]` and lets `[$F800,$FFFF]` through, because the first add wraps it back
  down. A `bmi` port would free the whole top half.

### THE ALLOCATOR HAS FIVE ENTRIES AND SEVEN CALLERS, NOT FOUR AND FIVE

`$27F8E6` is a fifth entry, called from `$288ABE`. `$27EF90` and `$27F294` also call `$27F8EE`,
outside `handlers.js`. The docket's four-entry list is incomplete.

### ONE WIRE IS WRITTEN BUT UNREACHABLE, AND IT IS LABELLED AS SUCH

Type `$8E`'s drop calls `$27664E jsr $289AF4` before `$27665A`, and pool C's absolute allocator
refuses kind `$8`, so the whole arm throws. The wire is cited and correct; it needs pool C kind `$8`
first. The agent wrote that in the test file rather than writing a test that pretends.

### 47 ABLATIONS, 9 GREEN, 2 INVALID

All nine were values a test wrote and never read back. Two mutations were provably untestable
(`u8 & 0x80` is the same bit as `u16 & 0x8000`; the `$8E` arm throws earlier) and were replaced.
Pass 3: 47 of 47 red.

### VERIFIED

Suite **3729 pass / 0 fail / 0 skipped** (3698 before; +31). Gate **exit 0**. `--verify` **OK at 600
windows** (one new: `$280F34 + $A8`). `export-web.mjs` was run before the gate.

### NEXT

**D42** (hyper laser hit animation -- it also owns the bee's 11-frame muzzle window from W410),
**D43** (the laser bomb's nearest-only pool B, corrected by the owner), **D50** (the late crater),
**D48** (the wrong-bit RNG at eleven sites), then A4 `$14`. The frame-6495 kind-8 throw needs an
owner too.

## W409 NOTES

### THE ENDING COMPLETES. NOT "DOES NOT STOP" -- COMPLETES, BY THE CARTRIDGE'S OWN STORE.

A4 script 5 takes the slot on frame 4447 and **`$812E06` goes to 1 on frame 4889**, which is
`$2A6466 jsr $2595E8`, the stage-over store. States `[4447,0] [4478,1] [4744,2] [4753,3] [4761,4]`,
and `4761 + $80 = 4889` exactly. `$2A646C clr.w (A4)` frees the slot on the same frame. Nothing
throws in 12,000 frames on the W404 bench.

**MY BRIEF WAS WRONG AND SO WERE THE LAST FOUR HANDOFFS.** I wrote "only A4 `$14` reaches
`$2595E8`" and repeated it as the reason the ending was never nearer. A scan of `$2A4000..$2AB000`
finds **two** `4EB9 002595E8`: `$2A6B88` (A4 `$14`) and **`$2A6466`, in this unit**. Script 1's fork
has an ending on EACH arm, and the arm every bench has been running is now complete.

### WHAT IS STILL OUT: A4 `$14` (`$2A6B7A`, `$1A`) is the OTHER arm's ending, still counted, as are
A4 `$12`, `$13` and A4 script 0.

### ENTRY-TO-ENTRY OVERSHOT AGAIN, AND THIS TIME BY TWO UNITS

`$3AA` splits three ways, not two: `$270` code, `$100` this script's own data, and **`$3A` belonging
to A4 script 0**, which is two thousand bytes away and names it with `$2A5A04 lea ($D82,PC),A0`.
Fourth wave running. Treat entry-to-entry as an upper bound and nothing else.

### 79 ABLATIONS, 21 GREEN ON THE FIRST PASS -- THE WORST RATIO YET

All 21 were in blocks the tests **counted but never read**: the entire `$28B34A` blast (5), the
entire state-1 spawn record (6), both `cmpi.b #$2` guards, two reload fields, `$259924`, and the
palette install, which was invisible because no test supplied a `ctx.palette`. Ten new tests read
records back. Pass 2 still had 2 green: `dx >> 2 -> >> 1` survived **because the default RNG state
draws a dx of zero**. Fixed by driving `$803916 = 7`. Pass 3: 79 of 79 red.

Two mutations were INVALID and were replaced, both stated in the test file: a state guard no value
can separate, and a byte read where all sixteen source words are `$0000`.

### A PORT-WIDE DEFECT WAS FOUND HERE AND DELIBERATELY NOT FIXED: SEE DOCKET D48

`bpl` after `jsr $242EC2` tests **bit 7**, because `$242ED6 move.b (A0,D0.w),D0` is the last
instruction to touch N and neither the `movea.l` nor the `rts` after it does. The port tests bit 15
in **eleven places across five files**, and `rng.js`'s doc comment states bit 15 as if correct.
Coordinator verified the ROM bytes independently. This unit is written correctly and measures the
difference: 5 x `$28C274` + 3 x `$28C28E` where the bit-15 reading gives 8 and 0.

**Do not fix it in a porting wave.** It changes behaviour at eleven sites, several of them `if` arms
whose dead branch has never executed, so today's green tests may be pinning the wrong behaviour.

### WINDOWS: THREE NEW, 599

`$2A6688 + $80` (emitter rows), `$2A670A + $56` (a `$246410` chain -- and `$246410` is
`move.w (A0)+,D0 / subq.w #1,D0 / beq`, **not** a `dbra`, so a count of 6 means 6), and
`$2A676E + $1A` (a `$246520` chain whose entry is twelve bytes with no fill word).

### VERIFIED

Suite **3698 pass / 0 fail / 0 skipped** (3668 before; +30). Gate **exit 0**. `--verify` **OK at 599
windows**.

### PUBLISH STATE, CORRECTED

W408's section said the W407 publish was still owed. **It is not.** It was run against a quiet tree
after W408 landed and confirmed live as build **`20260816181806`**. Next publish falls at W412.

### NEXT

The owner's play report, **docket D42..D47**, outranks further HIBACHI internals. After that,
**D48**, then A4 `$14` for the other arm's ending.

## W408 NOTES

### THE LOOP CLOSES IN THE ROM AND NEVER IN PLAY, AND THE ARITHMETIC SAYS WHY

All seven guns and six scripts of `$F -> $11 -> $10 -> $F` are registered and all three arrows
exist. **The real path still never executes `$2A6AA2`.** `$2A6AD8 move.b #$4,($1A,A5)` re-arms phase
B's timer to `$04xx` when gun `$B` starts, and one lap costs gun `$B` 507 frames + A4 `$10`'s `$60`
+ gun `$A`'s **minimum** `$352` = **1,455 frames against a ceiling of `$04FF` = 1,279**. A shortfall
of `$B0`, and it is structural: `($1F1,A6)` only ever grows, so gun `$A` can only get longer.

**"Closed" in the arrows and "reachable" in play are different claims.** Do not report the first as
if it were the second.

### NEW STOP: FRAME 4447 AT $2A6418, A4 SCRIPT 5, A PORT STOP

`$2A5886[5].init` IS `$2A6418`, `303C 000E` (ordinary code) stands there, and `$2A728A moveq #$5 /
jmp $25980C` in phase B's death tail routed us in. Counted at `$3AA`. Measured: timer `$040B` written
on 3412, and 3412 + 1035 = 4447 exactly.

**The ending is no nearer.** Completion is `$2595E8`; only A4 `$14` reaches it (`$2A5CB4 moveq #$14`)
and only script 1's first-loop arm starts `$14`. Closing a loop is not progress toward an exit that
lies outside it.

### GUN $A IS THE ODD ONE OUT THREE WAYS

It neither aims, nor selects a player, nor toggles `($3,A5)`. Its four absolute calls are exactly
`$242438`, `$242EC2`, `$2817C2`, `$259B08` -- no `$24270A`, no `$2422A2`, no `086D`. Driven: with
both players dead it fires the same twelve bullets. Its ring is kind **28**, the tracker, and gun `$A`
writes the global they read: `$2832B0 tst.w $8130DC` reads the word `$2A8BC0`/`$2A8BD4` rewrite every
frame the gun exists. D4 (`$00030016`) is a real parameter here where every other gun passes zero.
`tst.b ($1F0,A6) / neg.b ($10,A4)`, paired with `$2A8C3C not.b ($1F0,A6)` in the retire tail, makes
the ring alternate direction run to run.

### $2A8B10..$2A8B4B IS $3C BYTES NOTHING POINTS AT

Nine `{bias, kind}` longwords and six `{dY, dX}` muzzle longwords, sitting between gun 9's `4E75` and
gun `$A`'s template. Gun 9 and gun `$A` have exactly one `lea (d16,PC)` each and neither names it; no
longword in the 6 MB image lands inside it. **The layout rule `[code][template][8 longwords][code]`
has a fourth thing in it here.** No window declared, since nothing reads it.

### A NUMBER COPIED ONE GUN TOO FAR

W407's handoff said gun `$A`'s trailing data was `$3C`. It is **`$2A`** (`$11E - $F4` = `$A` template
+ `$20` pointers). `$3C` is gun `$B`'s own trailing figure. `HIBACHI_A1_COUNTED` had the same error;
both corrected. Entry-to-entry minus code is a per-gun number, not a constant.

### 47 ABLATIONS, FOUR GREEN, ONE INVALID

All four holes were the same shape: three ramp caps that every test drove from zero, where a single
`addi` never reaches any cap. New tests drive each at `cap - 1` AND at the cap. One mutation was
**invalid** -- `u8` vs `u16` on the ring index is provably the same routine, since `andi.w #$FC`
clears bit 8 -- and was replaced by two mutations of the index itself, both red. 47 of 47 red.

### VERIFIED

Suite **3668 pass / 0 fail / 0 skipped** (3644 before; +24). Gate **exit 0**. `--verify` **OK at 596
windows** (one new: `$2A8B4C + $10`).

### PUBLISH STATE, READ THIS

W407's publish **REFUSED** and was right to: I started it while the next agent was mid-edit, so it
ran the suite against half-written files and reported 23 failures that do not exist in the committed
tree. Publish is a whole-tree action. **Run `export-web.mjs` then `publish.mjs` BEFORE dispatching
the next agent, or wait until the tree is quiet.** The W407 publish is still owed.

### NEXT

**A4 script 5 `$2A6418`** (`$3AA`, counted), phase B's death tail, which is the frame-4447 stop and
is on the ending chain rather than in either attack loop.

## W407 NOTES

### THE BRIEF SAID THIS WOULD CLOSE A LOOP. IT DOES NOT, AND THE AGENT SAID SO.

`$F -> $11 -> $10 -> $F` is real. But **a three-link loop needs three guns and this unit had one**:
`$10` waits on **A1 gun `$A` `$2A8B7C`**, which is still unported. Porting gun `$B` and A4 `$11`/`$10`
advances the path one gun further and hands the next agent a gun, not a script.

Take the general lesson: **a coordinator's framing is a hypothesis, not a finding.** If the unit does
not do what the brief predicted, report what it does.

### GUN $B HAS A THIRD FREEZE BEHAVIOUR, AND W406'S RULE MISSED IT

W406 said ten of fourteen guns have a `4A79 008130D4` freeze arm. The TEST yes, the ARM no. All
fourteen displacements decoded: guns 0..8 branch backward into their own init, but **`$2A8CB8 6600
01CA` lands FORWARD on `$2A8E84`**, gun `$B`'s own retire tail (`bchg #$0,($3,A5) / moveq #$B /
jsr $259B08`). A frozen gun `$B` **clears its A1 slot** and A4 `$11` walks on the next frame. Three
behaviours, not two, so gun `$B` does not use `gunTick`.

### GUN $B COMPUTES AN AIM AND THROWS IT AWAY

`$2A8D0A jsr $2422A2`, then `$2A8D10 323C 0080` writes `#$80` straight over the answer, and it is
that constant `$2A8D14 move.b D1,($7,A4)` stores. Worse, `$2A8CCA move.b ($4,A4),D2 / cmp.b
($5,A4),D2 / bne.w $2A8D18` runs the block on volley **one only**, because nothing in the gun ever
writes `($5,A4)`. So the heading is `$80` for the whole run and from volley two the gun keeps firing
after both players are dead. Driven: targets at `($6000,$0200)` and `($2000,$2400)` produce
byte-identical volleys. Gun `$B` is also the only ported gun with **no A6 ramp at all**, so it fires
the same pattern every lap.

### EXTENTS, AND WHY ENTRY-TO-ENTRY IS NOT CODE LENGTH

Gun `$B` is `$236` table-entry to table-entry of which **`$1FA` is code**; the trailing `$3C` is
`$1C + $20`, gun `$C`'s 14-word template plus its eight self-pointers. This is now the third wave
running where the two numbers differ, so treat entry-to-entry as an upper bound and nothing more.

### NEW STOP: FRAME 4016 AT $2A8B7C, A PORT STOP

`$2A72C8[$A].init` IS `$2A8B7C`, `41FA lea` stands there, and this wave's own A4 `$10` (`$2A6A90
moveq #$A / jsr $259A18`) is what routed us in. Frames 3317 -> 4016; spawn calls 4,865 -> **8,105**.

### 59 ABLATIONS, SIX GREEN, ONE REAL AND TWO INVALID

The real hole: reversing each arm's `jsr` site list was invisible because every per-site count is 180
either way. The new test derives the eighteen sites by scanning for `4EB9 002817C2` and asserts
ascending order plus the `$10` stride and `$28` gap. Two mutations were **invalid** (a `k < 10` that
never fires, an `addi.l #$30000` provably identical to a word add) and were replaced with ones that
redden. Three are proved equivalences, not weakened tests. `export-tables.py` now fails loudly if any
of them rot.

### VERIFIED AND PUBLISHED

Suite **3644 pass / 0 fail / 0 skipped** (3615 before; +29). Gate **exit 0**. `--verify` **OK at 595
windows** (one new: `$2A8C70 + $A`). This was the fifth wave since W402, so `export-web.mjs` ran
BEFORE `publish.mjs`.

### NEXT

**A1 gun `$A` `$2A8B7C`** -- `$11E` entry-to-entry, `$F4` of code (`4E75` AT `$2A8C6E`, after
`$2A8C66 moveq #$A / jsr $259B08`), the remaining `$3C` being gun `$B`'s template and blob. That is
the frame-4016 stop, and it is the third member that actually closes the `$F/$10/$11` loop.

## W406 NOTES

### W403 DROPPED PHASE B'S EXIT, AND NOTHING NOTICED FOR THREE WAVES

`$2A7226 4EFA 006C` is `jmp $2A7294`, and all three ways out of `$2A71C6` land on it. W403 did not
port it. The consequence was invisible because it is a store with no consumer: `bossExitShared` had
**no phase-B caller at all**, so `$2A7088 subq.w #$1,($1A,A5)` never ran for phase B, and A4 `$F`'s
closing `$2A6A6C move.b #$C,($1A,A5)` went nowhere. Measured: `($1A,A5)` sat at `$6270` for all 390
frames between A4 script 4 and A4 `$F`. Fixed in `src/hibachi2.js`.

This is the shape to watch for: **a missing jump does not throw, it just quietly removes a caller.**

### A1 GUN 9 AND A4 $F ARE PORTED; THE PATH RUNS TO FRAME 3317

Gun 9 `$2A89BA/$2A89F4`: `$1C2` table-entry to table-entry, of which **`$156` is code**. Bounded by
`4E75` AT `$2A8B0E` which `$2A8AE8`'s `bcc.w` lands on exactly, by gun `$A`'s template at `$2A8B4C`
(so `$2A8B10..$2A8B7B` is gun `$A`'s data, not gun 9's), and by `$2A72C8[$A].init`. Sixteen shots a
volley in two mirrored arms picked by `btst #$0,($4,A4)`, sweeping +-1 per volley inside a **signed**
band `[-$20,+$20]` -- `$2A8AD0 6C00` is BGE, not BCC. Bullets went 3,745 -> **4,865**.

New stop: **frame 3317 at `$2A6AB6`**, A4 `$11`'s init, a PORT stop waiting on gun `$B`.

### TWO CONVENTIONS THE LAST THREE WAVES STATED TOO BROADLY

1. **Not every gun has a freeze arm.** `4A79 008130D4` stands at ten of the fourteen step entries;
   **guns 9, `$A` and `$D` have none**. `$2A89F4` is `532C 0002 / 6502 / 4E75`. A frozen gun 9 keeps
   burning volleys and stepping its sweep, and the spawn core's own gate `$2814BA` discards them.
2. **The scripts do not run in id order and `$12` is an orphan.** `$F -> $11 -> $10 -> $F` is a
   closed three-link loop (`$2A6A5C moveq #$11`, `$2A6AE8 moveq #$10`, `$2A6AA2 moveq #$F`), and an
   enumeration of every `moveq #n / jsr $25980C` in `$2A4000..$2AB000` yields 17 ids with `$12` not
   among them.

### THE ENDING CHAIN STILL DOES NOT COMPLETE, IN THE CARTRIDGE'S OWN TERMS

Completing means `$2595E8` suspending the stage. Only A4 `$14` reaches it, and only script 1's
first-loop arm starts A4 `$14`. This bench is the other arm, so the route out is phase B's death
(`$2A722E`) into A4 `5`, still counted at `$3AA`. Do not report "the ending runs" on the grounds that
a run did not stop.

### SIXTY ABLATIONS, FIVE GREEN, FOUR REAL

The byte cap's `bls` vs `bcc` agree everywhere except AT `$1E`; two phase-B arms were never driven
because the real path only takes the middle one; and `pickTarget(a5)` vs `(a6)` pick the same record
whenever only one player is alive. One mutation was invalid (a no-op both consumers mask) and was
replaced by one that reddens. One is a labelled equivalence: D1's bits 8..15 have no consumer, since
`$28158E`/`$281596` are `move.b` and gun 9's D3 is a literal rather than a `$26BFFC` index.

### WINDOWS: ONE NEW, 594

`$2A898C + $E`, gun 9's template. Three bounds: `$2A89BA`'s own `lea`, `moveq #$6` + `dbra` = 7 words
(n+1), and `base + $E = $2A899A` where the eight `$002A89BA` self-pointers begin.

### VERIFIED

Suite **3615 pass / 0 fail / 0 skipped** (3590 before; +25). Gate **exit 0** from its own exit code.
`export-tables.py --verify` **OK at 594 windows**.

### PUBLISH IS DUE NEXT WAVE

W407 is the fifth since W402. **Run `export-web.mjs` BEFORE `publish.mjs`** -- W404, W405 and W406
all added windows, so publishing without regenerating serves stale assets.

### NEXT

**A1 gun `$B` `$2A8C9A`** (`$236`, counted) and **A4 `$11` `$2A6AB6`** (`$46`), which is what the
frame-3317 stop waits on. A4 `$10` (`$40`) closes the three-link loop behind it.
