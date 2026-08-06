# 51 - IMPL: the beam DAMAGES (L3, `$2453AC`), and what it reaches

status: **DONE**

started: 2026-08-05
role: implementer (SOLE writer to `games/ddpdoj/`; I do not touch
`games/gradius/`)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

Brief: the owner is playing the live build and reports "Laser no longer crashes
the game, your little options come to front, but no laser graphics happen and
**the enemies don't die**." The graphics half is E2/E3. Mine is the enemies not
dying: port `$2453AC` (W45 named it L3 and left it deliberately), plus the
scoring differences W37 §4.3–4.6 measured **if measurement shows they went
live**.

**[M]** = measured by me this session: `unidasm` through
`games/ddpdoj/tools/oracle/xref.py dasm` over `tools/oracle/out/maincpu.bin`
(6,291,456 B, address == file offset); a whole-build-B branch-target sweep I
wrote this session (every even offset of `$230000..$2B0000`, decoding `Bcc`
byte/word/long displacements and absolute `jsr`/`jmp`); the PORT driven from the
shipped bundle seed (`games/ddpdoj/assets/`, `loadBundle`, `new Game(...)`) with
the fire bit held, tapped or suppressed; and the REAL PAGE in Chrome. No MAME
was run.

---

## 0. THE BRIEF IS RIGHT ABOUT THE GOAL AND WRONG ABOUT TWO STRUCTURAL FACTS

### 0.1 **`$2453AC` IS NOT REACHED FROM `laser.js`. IT IS REACHED FROM
### `damage.js`, AND TWO MORE UNPORTED BLOCKS SIT IN FRONT OF IT.** [M]

The brief, W45 §10 and `damage.js`'s own deferral text all treat `$2453AC` as
the laser's routine. Its only reachable caller is **`$24530C bsr.w`, inside
`$244D62`**, after two further blocks:

```
245188  movea.l (A7)+,A1        A1 = $811EF2, the BEAM record (the tail's lea)
24518a  move.w #$2800,D6
24518e  move.w (A4),D0 / bpl.w $2459CE       the player must be LIVE
245194  tst.b D0       / bmi.w $24560A
24519a  tst.b ($3f,A4) / beq.w $24560A       <<-- THE LASER BYTE
2451a2  BLOCK 7: A2 = $811802 (pool slot 27) vs 150 enemy slots
24525c  BLOCK 8: A3 = $811892 (pool slot 30) vs 150 enemy slots
24530c  bsr.w $2453AC                        THE BEAM'S OWN PASS
245310  bra.w $24560A                        the NINTH block (bomb-laser)
```

So the work is **three routines and a guard, in `src/damage.js`**, not one
routine in `src/laser.js`.

**`($3f,A4)` GATES ALL OF IT** [M] - the byte `$24C282 move.b #$1,($3f,A4)`
sets when the arm-up completes and `$24C2D6` clears on release. W45 §2 found
that byte from the other end (`$249B40` is `bne $249E4E`, a return, not "the
dead flag"); this is the other thing it gates. It is why W34 could defer the
whole tail without losing one hit - until W45 nothing in this port could hold
fire - and it is why porting it **cannot change a frame of any no-input gate**.

**The 150 is not a third pool** [M]: `$81459C + 100*$20 = $81521C`, pool B's
base, so `moveq #$95,D7` walks pool A's hundred and pool B's fifty
contiguously, **as capacity**, where blocks 6a/6b walk the live counters. A port
that reused `poolDamage` here would walk the wrong records with the wrong
early-outs.

### 0.2 **THE `bset` THAT ARMS THE PASS IS A BYTE OP, AND IT RETIRES W45's ONE
### UNRECONCILED NUMBER.** [M]

```
2453b4  tst.w (A1) / bpl $245608          the beam record must be live
2453ba  bset #$1,(A1) / beq $245608       <<-- BYTE op: bit 9 of the word = $0200
```

`bset` on memory is a BYTE operation and sets Z from the bit's **old** value, so
**the pass arms itself on its first run and damages from its second**, and the
bit it leaves behind is **`$0200`**.

W45 §0.4 measured the port's `$811EF2` as `$8000` where `10-recon-combat §2`'s
board trace has **`$8200`**, and wrote: "So `$0200` is a per-power bit of the
sub-template, not a divergence - but I have not reproduced the board's state to
prove it, and that is a one-line check for whoever next has a board run."
**The guess was wrong and it needed no board run.** `$0200` is `$2453BA`, and
the board's trace has it because the board's beam had run its damage pass.
[M] With this wave the port's record goes `$8000` (+21) → **`$8201`** (+22) →
**`$9201`** on a hit - all three of the board's traced values, for the ROM's own
reasons. `$9201 = $8201 | $1001` and `ori.w #$1001,(A1)` at `$2454AC`/`$2455AE`
are, per W45 §4's own whole-image encoding scan, the ONLY setters of bit 4 of
`$811EF2` in build B - the bit `$254F48 btst #4,(A2)` uses to light the drawn
column.

**AND IT MEANS `$245314`/`$24536E` ARE NOT NEEDED.** W37 §4.1 calls those two
"the laser's damage entries"; their only callers are `$254DA2` (inside
`$254D06`) and `$24CE46` (inside `$24CDC0`). [M] My sweep for any
`bra`/`bsr`/`Bcc`/`jsr`/`jmp` targeting `$254D06` returns **0 sites** - the same
shape as W37 §7.3's result for `$24C37A`. Both stay unported and neither is
called dead code; the pass arms itself without either.

### 0.3 **THE SCORE FORK THAT WENT LIVE IS `$286876`, NOT THE `$811F72` FORKS.**

The brief names three, all behind **`$811F72`**, the BOMB-laser's record. W45
measured it 0 on 600 held frames and predicted that "once the beam actually
damages things, that may no longer hold."

[M] **It still holds, and a different fork opened instead.** `$811F72` and
`$8130F8` were 0 on all 1,701 steps of a held run in which the beam killed 116
enemies. What went live is `$2860F2 bsr $286876`:

* `$2454E0`/`$2455F2 ori.w #$400,D4 / or.w D4,(A5)` and block 8's
  `$2452F2 ori.w #$4400,D4` put bits into the **enemy's** type word;
* the handlers' `moveq #$5C,D1 / and.b (A6),D1` keeps `$400` (bit 2) and
  `$4000` (bit 6);
* `$286096`'s `$2860EC btst #$2,D1 / beq $2860F8` therefore takes
  **`bsr $286876`** instead of the plain BCD add.

`src/score.js` has called that arm "the BOMB hit bit ($400), which is set only
at `$245242`/`$2452F2`, both inside the A2/A3 weapon loops `src/damage.js` does
not run" since W34. **Both halves of that sentence are now false.** [M] It fired
2 times in 601 steps of the held run (0 in the control), and `$286674` - the
cap-clamp tail - went from 2 to 55.

**It is ported, not noted, and the reason is that `$2860F0 beq $2860F8` makes it
run INSTEAD of the plain add, never as well** (unlike `$2860C8`'s laser arm,
whose `$2860CC bra` rejoins). A note there silently drops the whole ledger event
- score, chain, meter and hi-water - on every laser hit. `$286774`, its rank
feeder and the exact twin of `$2867B4`, is ported with it.

---

## 1. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---|---|---|
| `$245188..$2451A0` | 26 | the weapon tail's three gates, incl. `($3f,A4)` | `damage.js weaponTail` |
| `$2451A2..$24525A` | 185 | BLOCK 7 - slot 27 vs 150 enemy slots | `weaponObjectPass(7)` |
| `$24525C..$24530A` | 175 | BLOCK 8 - slot 30 vs 150 enemy slots | `weaponObjectPass(8)` |
| `$2453AC..$2453C0` | 22 | the pass's entry and its self-arming `bset` | `laserDamagePass` |
| `$2453C2..$245608` | 584 | THE BODY: both hyper recomputes, pool A (100), pool B (50) | `laserDamageBody`/`laserPool` |
| `$24560A..$245620` | 24 | the NINTH block's two guards, then a throw | `bombLaserBlock` |
| `$286876..$286A80` | 523 | `$286096`'s `$400` arm | `score.js bombHitChain` |
| `$286774..$2867B2` | 64 | its rank feeder | `score.js bombRankFeed` |
| `$281D36`/`$281D38` | 8 | the screen clear's two bullet writes (§3) | `bulletdriver.js` |

**Zero new export windows, zero new asset bytes, `games/gradius/` untouched.**

### 1.1 FOUR DIFFERENT DAMAGE REDUCTIONS IN ONE ROUTINE, none the same [M]

A "tidy" port makes these consistent and is wrong four times:

| site | reduction | gate |
|---|---|---|
| blocks 6a/6b (W34) | `lsr.w #2` - a QUARTER | `$81308C == 0` |
| block 7 `$245236` | `lsr.w #1` - a HALF | `$81308C == 0` |
| block 8 `$2452E6` | `lsr.w #1` - a HALF, after `add.w D5,D5` on `$81B6E6` | `$81308C == 0` |
| `$2453AC` `$2454D4` | `lsr.w #2` - a QUARTER | `$81308C == 0` |

and the two hyper recomputes of `($e,A1)` use **different shift ladders**:
`$2453FA` is `lsr #2` then a conditional `lsr #1` on `$81309C`'s sign;
`$245522` is `lsr #1` then a conditional `lsr #1` on `$8130F8` bit 0.

### 1.2 THE ONE THING THAT LOOKS LIKE A BUG AND IS THE LISTING [M]

`$2455CE move.w D5,D4 / bpl $2455D6` → `lsr.w #3,D4 / neg.w D4 /
move.w D4,($e,A1)`. After the first **pool B** hit the beam's damage word is
stored **negated and an eighth of its size**; the next pool-B hit re-negates it
(`$2455D2 neg.w D5`) without rewriting it. Pool A reads the same word with no
`neg`, so a beam that has hit anything in pool B then **subtracts a negative in
pool A - it heals**. Nothing resets `($e,A1)` between frames except `$254C1E`
(a new beam) or the hyper arms. Read four times; transcribed, **not** guarded,
and recorded here so the next person to see an enemy gain HP knows which
instruction did it. Stage 1 holds `$815EA0` at 0 throughout, so no run in this
repo has reached it.

### 1.3 D0 IS CARRIED FROM POOL A INTO POOL B [M]

`$2454C2 move.w D4,D0` overwrites the box's upper Y bound with the reach of the
last pool-A enemy hit, and nothing between `$2454FA` and `$245580 cmp.w D4,D0`
reloads it, so `laserPool` returns `d0`. See §4 for why that carry is provably
unobservable and is transcribed anyway.

### 1.4 NO POOL IS ALLOCATED FROM

The brief's pool-leak warning is answered by not allocating. The three routines
ported here **write into records that already exist** - the 100+50 enemy slots
at `$81459C`, the beam record `$811EF2`, the enemy type words - and call no
allocator. `$27F8F8`, the only allocator this wave came near, is explicitly NOT
ported for exactly Recon 50's reason (§3).

---

## 2. THE MEASUREMENTS - the W34 control method [M]

Same tree, same shipped bundle seed, `$810424 = $FF` each step (the page's own
intervention); the only difference is the input word. "W45 tree" is
`a3df8ab~1`, checked out into the worktree, not a stash - **an earlier version
of this section had the baseline wrong because `git stash` cannot revert a file
that is already committed, and every "baseline" number taken after the first
commit was silently the new tree. Re-measured from the commit.**

```
                              600 steps    1200      1700     kills at 1700
W45 tree, fire HELD             4 kills    4         4          4
W51 tree, fire HELD            57 kills   95       116        116
W51 tree, fire SUPPRESSED       0 kills    0         0          0
W51 tree, fire TAPPED (W34)     -          -         -        116
```

**On the W45 tree the number does not move after step ~300: holding fire kills
four things and then nothing, forever.** That is the owner's sentence, measured.

```
                     W45 tree, HELD      W51 tree, HELD
score (pending BCD)  $86                 $67147
chain / hi-water     4 / 4               280 / 280
$811EF2              $8001               $9201
$81B64A (rank feed)  0                   840
$811F72 / $8130F8    0 / 0               0 / 0   (all 1,701 steps)
$286876 executions   0                   2 in 601, more in 1,701
```

The beam record's timeline reproduces: live `$8000` at +21, `$8201` at +22 (the
`bset` arms), first `$1000` (a hit) at +32.

---

## 3. **THE BEAM KILLS THE MIDBOSS, AND THAT UNCOVERED A CRASH THIS WAVE DID
## NOT CAUSE** [M]

W33 §3 predicted that "the midboss halts the scroll at clk 197 and the port
cannot kill it". W34 falsified the *consequence* it drew from that. **The
premise is now falsified too: the beam kills it** - the body and all eight arms,
each with its own `$289004`/`$28C25A` death note, at step 1,773 of a held run.

The midboss's death arms run `$243E7C move.w #$1,$81B410`
(`src/midboss.js armScreenClear`, ported since W31), and the very next frame
`$281CD6`'s positive arm reached **`$27F8F8`, a loud named throw since W29**,
whose comment read:

> "It is reachable only when `$81B410` is non-zero, and nothing in the port can
> make it non-zero: the only writer is the bomb (`$249814`)."

**That sentence was false when it was written.** `$243E7C` is the second writer
and W31 ported it; what was missing was the death. And [M] **the throw was
already live on the W45 tree by ORDINARY TAPPED SHOTS, at step 2,203** - W34's
own control input, on a path that has been shipping since W34 and that no test
or gate walked far enough to reach. So this wave did not create it; it found it.

### 3.1 `$27F8F8` IS NOW A COUNTED NOTE, AND IT IS NOT A CLAMP

Two reasons, both from the project's own rules:

1. **It must not be ported.** `$27F8F8` is a SLOT ALLOCATOR over the impact pool
   `$8171BE` - `moveq #$45,D7` = 70 slots of `$2C`, free test `tst.w (A0)`,
   filled at `$280B3E`, which also bumps the live count `$817F7E` - and its only
   driver is **`$27F95A`, type-5 call #4, unported**. Porting the allocator
   without the driver consumes all 70 slots and then fails silently forever:
   W33's defect one level down, which is `50-recon-effects`'s own warning and
   the brief's. **This wave allocates nothing.**
2. **A note here invents nothing**, which is `src/unported.js`'s test for the
   difference. The caller reads neither A0 nor the carry
   (`$281D34 move.w (A7)+,D7` is followed by no `bcc`), and the two writes that
   actually clear the bullet - `$281D36 clr.w (A6)` and
   `$281D38 move.w #$FFFF,($2,A6)` - are ported. Every other member of this
   effect family in the port (`$289004`, `$28C25A`, `$289F54`, `$27F8EE`,
   `$289F96`) is already a counted note for the same reason.

### 3.2 WHAT IS BEHIND IT, AND WHY THIS WAVE STOPS THERE

One instruction later the run reaches
**`UNPORTED $26C1C4: word at $26C1C4 is outside every ROM window exported by
tools/export-tables.py`** - `src/spawn.js initDispatch` reading the run-length
immediate of an enemy type's init stub. Killing the midboss lets stage 1 advance
past clk 197 and spawn types the export has never covered.

[M] **That frontier is not this wave's either.** With ONLY the `$27F8F8`
downgrade applied to the W45 damage tree, fire merely TAPPED reaches `$26C1C4`
at step **2,204** - the same step as the full W51 tree with taps. The beam
reaches it sooner (step 1,774 held) because it kills the midboss sooner.

Porting past it is the enemy layer beyond the midboss - item 5 of
`39-OWNER-visible-play-before-sound.md` - because the window is one line but the
init body `$26C1CA` and its handler are W23's work, and a wider export with no
body is churn. **It is left as a loud named throw, which is the correct answer
to an unported path, and it is now the first thing a held-fire run hits.**

---

## 4. EVERY CHECK SEEN TO FAIL - 19 mutants, 18 red, 1 named survivor

`node games/ddpdoj/.scratch/mutate.mjs`: apply ONE edit, run ONE test file,
require a NAMED test red, restore, **verify the file's sha256 is byte-identical**
(the harness throws on a mismatch). Every restore matched.

| # | mutation | the NAMED test that went red |
|---|---|---|
| M1 | `$2453BA bset` ignores the OLD bit | `$2453BA … ARMS on its first run` |
| M2 | `$2453B4 tst.w (A1)/bpl` inverted | same |
| M3 | `$2453C6` seeds the reach `#$7000` | `$2454AC … lights the drawn column` |
| M4 | `$245604 sub.w D6,($10,A1)` dropped | `$2453BA … ARMS on its first run` |
| M5 | `$2454AC ori.w #$1001` → `#$0001` | `… lights the drawn column` |
| M6 | `$2453C2 bclr #$4,(A1)` dropped | same |
| M7 | `$2454E0 ori.w #$400` dropped | `… the bit $286096 forks on` |
| M8 | `$2454D4 lsr.w #2` → `#1` | `… is a QUARTER and block 7 … is a HALF` |
| M9 | block 7's `lsr.w #1` → `#2` | same |
| M10 | `$24519A tst.b ($3f,A4)` gate removed | `$24519A … gates blocks 7, 8 AND $2453AC` |
| M11 | blocks 7/8 walk 100 slots, not 150 | `… walk 150 slots as CAPACITY` |
| M13 | `$245618 btst #$6` guard dropped | `$24560A … throws by address` |
| M14 | `$286966 btst #$6,D1` always one step | `$286876's chain step is ONE or TWO` |
| M15 | `$2868BA` seeds the meter with 9 | `$286876's cold start seeds the meter to 10` |
| M16 | `$28679E` adds `$14`, not `$18` | `$286774 adds $18 to $81B64A` |
| M17 | `$286876` skips its `$8130F8` throw | `$286876 refuses to invent $286A82's tail` |
| M18 | `$281D36 clr.w (A6)` dropped | `$281CD6 … clears the bullet and NAMES $27F8F8` |
| M19 | `$2454BE`/`$2455C0` reach write dropped | `pool A's reach shadows D0` |

**M12 IS THE SURVIVOR AND IT IS PROVABLY UNCATCHABLE.** It removes the D0 carry
from pool A into pool B (§1.3). The argument is two instructions:

```
245580  cmp.w D4,D0       / bcs    skip if D0 < yMinus
2455a8  cmp.w ($10,A1),D4 / bcc    skip if yMinus >= ($10,A1)
```

Every write that changes D0 (`$2454C2`, `$2455C4`) writes `($10,A1)` with the
**same value two instructions earlier** (`$2454BE`, `$2455C0`), and pool B has no
arm that skips the second test - pool A's `$2454A2 bra $2454C4` is pool A's
alone. So whenever the carry could matter (after a pool-A hit) D0 and `($10,A1)`
are equal and the reach test is at least as strict; when no pool-A hit happened,
the mutation has nothing to drop. Category (c) of the brief's three. The port
keeps the carry because the registers carry it, M19 proves the shadowing write
is checked, and the test that owns this is named for what it can actually prove.

**TWO OF MY OWN CHECKS COULD NOT FAIL WHEN FIRST WRITTEN**, and the mutation
cycle caught both rather than review:

* the reach test asserted only the POST-HIT reach, which any enemy overwrites,
  so M3 (a wrong seed immediate) survived. It now also asserts a HITLESS pass
  leaves `$7400`, which covers `$2453C6` and `$245604` together;
* the D0 test asserted a pool-B rejection that the REACH test would have made
  anyway, so M12 "passed" for the wrong reason. It is rewritten as the proof
  above, with the survivor documented in the test body.

**AND ONE OF MY OWN CHECKS FOUND A REAL DEFECT BEFORE ANY RUN DID.** The first
version of this wave wired A1/A2/A3 into only TWO of `$28B670`'s four
`$244D62` call sites - the `$81308C == 0` pair `$28B766`/`$28B79C` has different
indentation and a `str.replace` missed it. `$81308C` is 1 in every scenario in
this corpus, so no measurement would have found it; the unit test that drives
the tail with `$81308C = 0` threw on the first run.

---

## 5. THE PAGE, IN A REAL BROWSER - WHAT I SAW [M]

Chrome + Python `playwright` over `python -m http.server`, the recipe W42
established. Nothing downloaded. The server was killed afterwards.

**The ship flies, the button holds, the pods come to the front, and the tanks
come apart.** Sampled every 120 ms for 19 s from the same boot, `b0` is how many
display-list records came out of bucket 0, THE ENEMIES:

```
                 samples   lf range      mean b0   error panel
fire HELD           87    2505..3774      14.99    $26C1C4 (§3.2)
fire SUPPRESSED     90    2517..3834      23.20    empty
```

and on the W45 tree, fire held, the same 19 s: **`$27F8F8 IS NOT PORTED YET`** -
i.e. the build the owner is playing already dies there, one instruction in front
of the frontier this wave names.

The screenshots at +5 s show the ship at the bottom of the road with both pods
swung forward, `PLAYER-1`, `PRESS START`, the bomb count `B B B` and the power
bar intact, six tanks on the road with fire held against seven in the control at
the same logic frame, and the beam's two bright segments above the ship. The
displayed SCORE stays 0 in both, and that is a different gap with a name:
`$2842B0`, the pending→total drain, lives in top-level object type 0 and
`src/score.js notePerFrameLedger` has counted it by address since W34.

---

## 6. COVERAGE - branches and table entries, never frames

- **`$244D62`'s blocks: 6 of 9 ported** (5, 6a, 6b, 7, 8, and the ninth's two
  guards), was 3 of 9. Blocks 1–4 remain one L16 deferral naming four addresses.
- **`$2453AC`: all 606 bytes transcribed.** Both hyper recomputes and pool A's
  `$245494` double are transcribed-and-unexercised (`$81B6E6` and `$81B410` are
  0 on this tree); everything else executes.
- **`$286096`'s four arms: 3 of 4 now ported** - the plain P1 add, the plain P2
  add and `$286876`. `$286A82`/`$286DA8` stay notes (both gates measured 0), and
  `$2860CE`'s P2 mirror stays a comment because nothing branches into it.
- **unported and throwing, by address:** `$245622` (the ninth block's body),
  `$286AAA` (`$286876`'s `$8130F8` arm), `$26C1C4` (the enemy-layer export
  frontier, §3.2), and W45's `$24CDC0`, `$245314`, `$24536E`, `$24560A`,
  `$254078`, `$255DD8`.
- **downgraded from throw to counted note: `$27F8F8`** - one address, with §3.1's
  two reasons and the two writes behind it ported.
- **unit tests 606 → 618, 0 skipped.** New file `tests/w51laserdamage.test.js`,
  12 tests; `tests/integration.test.js`'s `$27F8F8` test inverted rather than
  deleted; `tests/w34damage.test.js`'s `$24518A` deferral assertion inverted
  rather than deleted.

### 6.1 THE GATE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

Unchanged from W32..W45. **Nothing was disabled, skipped, narrowed or loosened.**
Also green on the final tree:

```
node --test games/ddpdoj/tests/     618 pass, 0 fail, 0 SKIPPED   (was 606)
node games/ddpdoj/tools/webgate.mjs 7 of 7 PASS
```

`webgate`'s W44 stage still reports **16,457 records / 0 MISSED over 300 steps
with nothing pressed**, digit for digit - which is the evidence that this wave
changed nothing on the no-input path, as §0.1's gate predicted it could not.

---

## 7. WHAT THIS WAVE DID NOT DO

- **No art.** The beam's own streams are E2/E3's row; zero asset bytes here.
- **`$287682` is still unported** and is now reached from a sixth caller
  (`$2867A4`, inside `$286774`). It is COUNTED with its consequence spelled out:
  `$81B64A` accumulates - [M] 840 over 1,700 held frames - with nothing to drain
  it at `#$95F`, so a long chain banks rank the board would have spent. That is
  W28's wave 8 and it is the last link of `20-OWNER-scoring-must-be-exact`'s
  chain.
- **The enemy layer past the midboss is not ported** (§3.2) and is now the first
  wall a held-fire run hits.
- **Nothing is compared against MAME.** No gate in this repo compares a beam
  damage frame against a board frame, and this wave did not build one.
- **`games/gradius/` was not touched.**

## LOG (appended as findings arrived)

- opened; read 37, 34, 38, 39, 45, HANDOVER, `docs/knowledge/09` and `10`,
  `src/{damage,score,laser,handlers,bulletdriver,midboss,type5,machine,ram,
  unported}.js`.
- §0.1 **[M] the brief is wrong about WHERE the work is.** `$2453AC` is reached
  from `$24530C` inside `$244D62`, behind blocks 7 and 8 and behind
  `$24519A tst.b ($3f,A4)`.
- §0.2 **[M] `$2453BA bset #$1,(A1)` is a BYTE op = `$0200`**, and it retires
  W45 §0.4's guess. The port now produces `$8000`/`$8201`/`$9201`.
- §0.2 **[M] `$254D06` has 0 inbound branch/call sites in build B.**
- §0.3 **[M] the score fork that went live is `$286876`, not the `$811F72`
  forks**, and it is ported because `$2860F0 beq` makes it replace the add.
- §2 **[M] ENEMIES DIE: 116 kills / 1,700 frames held, against 4 on the W45
  tree at ANY window length and 0 with fire suppressed.**
- §2 **a measurement method error, corrected in place:** `git stash` cannot
  revert a file already committed, so every "W45 baseline" taken after this
  wave's first commit was the new tree. Re-measured from `a3df8ab~1`.
- §3 **[M] the beam kills the MIDBOSS** - body and all eight arms - which arms
  `$81B410` and reached `$27F8F8`, a throw whose "unreachable" comment had been
  false since W31. **[M] It was already live on the W45 tree by TAPPED shots at
  step 2,203.** Downgraded to a counted note; the allocator is NOT ported
  (Recon 50's leak) and the two writes behind it are.
- §3.2 **[M] the frontier behind it is `$26C1C4`**, the enemy-layer export gap,
  reached at step 2,204 by taps on the W45 damage tree too. Left throwing.
- §4 [M] 19 mutants, **18 turned a NAMED test red**, every restore
  byte-identical by sha256. One survivor, provably uncatchable, with the proof
  in the test. **Two of my own checks could not fail when written**; one of my
  tests found a real four-call-site defect no measurement could have.
- §5 [M] **DRIVEN IN CHROME.** Fire held vs suppressed, 19 s each: mean bucket-0
  records 14.99 vs 23.20. The W45 tree dies at `$27F8F8` in the same window.
- §6.1 [M] **`pgm.py check` ALL GREEN 49/0/0, 0 SKIPPED**; unit tests
  606 → 618; `webgate` 7 of 7 with W44's 16,457/0 MISSED reproducing.

status: **DONE**
