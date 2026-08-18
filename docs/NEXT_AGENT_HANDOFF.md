# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-18 (W408)

## DOCKET -- OWNER'S PLAY REPORT, 2026-08-18: SEE docs/DOCKET.md D42..D47

**These live in `docs/DOCKET.md` as D42..D47, which is authoritative.** This copy first
numbered them D41..D45 and collided with the existing D41 (coin and start); corrected here.
D47, a documentation pass, is in the docket file only.

The owner played live build `20260816181806` and reported five defects. **These outrank further
HIBACHI internals**, because they are things a player sees in the first minute and the boss work is
not. Triage below is a first look, NOT a finding -- confirm each against the image before porting.

**D42. The hyper laser has no hit animation.** `src/laser.js` DOES spawn one:
`spawnBeamImpact289FC0` at line 1031, counted into `ctx.beamImpacts`. So the emitter exists and the
question is whether it is reached, whether the effect draws, or whether only P1's block spawns it
(line 1020 says the impact is spawned from P1's block for reasons documented there). Start by
measuring `ctx.beamImpacts` on a real bench with the laser actually on a target.

**D43. The laser bomb does not hit the boss** (and possibly other things). `src/bomb.js:329`
documents `$243DA0` as the bomb's screen-clear entry and is explicit that it is **NOT** the
midboss's, whose sibling `$243E7C` arms `$81B412` and walks the 210 slots. So there are two
different clear paths and the boss may simply not be on the one the bomb takes. Read both.

**D44. Only mid-bosses leave stars.** Item spawning is wired (`spawnItem` is called from
`boss.js`, `handlers.js` x3, `player.js`, `stage4type9d.js`), and `items.js` has ZERO deferrals. So
the allocator is not the problem. Most likely the per-enemy drop is gated on enemy types that are
not ported: **95 of 256 types ported, 130 null, 31 unported**. Check whether the unported types are
the ones that should drop.

**D45. Nothing leaves medals.** Note `src/bee.js` is titled "THE BEE (yellow medal)" and its header
records that a PREVIOUS wave (W111) was opened by the owner reporting too few medals, and that the
agent "spent a wave's worth of attention on a path that had been closed". **Read `bee.js:796` before
starting** so this wave does not repeat that. The medal accumulators are `$817F84`/`$817F86` (P1)
and `$817F88`/`$817F8A` (P2), zeroed in `player.js:176`, with the tier logic at `$2854E0` in
`hud.js`.

**D46. There is no start-of-game menu.** This one is EXPECTED, not a regression: it is docket item
**D33, the main screen**, and nothing of it is decoded yet. Say so rather than treating it as a bug.

## START HERE -- W408

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
