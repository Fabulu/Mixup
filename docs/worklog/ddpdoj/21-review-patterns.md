# W21 REVIEW - THE PATTERN GENERATORS

status: **DONE**
wave: 21   role: reviewer (DAIOUJOU)   started/finished: 2026-08-02
target of review: `a78bf9e`, worklog `21-impl-pattern-generators.md`
target build: `ddpdojblk` VERSION-B. Every address below is build B unless the
line says `[build A]`. READER ONLY - nothing in `src/` was left changed, no
commit was made.

VERDICT: **defects-found.** The transcription is right - I re-derived it from my
own disassembly and enumerated the whole parameter space against it - but three
of the wave's *claims* are not supported by the checks that are supposed to back
them, and one ported register contract is silently wrong.

---

## 1. WHAT I DID, AND WITH WHAT

* Independent 68000 disassembly with **capstone 5.0.7** against
  `tools/oracle/out/maincpu.bin` (build B) and `rip/rosetta/img-ddpdojblk.bin`
  (build A). I did not read the port's comments as evidence.
* An **independent Python model** of the two cores, the 19 entries, the 8 shared
  bodies and the 9 spawn-inits, written from that disassembly, emitting a write
  log in the same shape as `WriteLog`.
* **12 constant mutations** of my own, each restored byte-identical.
* Re-ran the gate on all three corpora and the full 10 × 3 mutation matrix.
* Ran `rosetta.py align` on the six ported anchors - which the wave did not.

---

## 2. WHAT HOLDS UP (and it is most of it)

### 2.1 The listing, re-derived

Instruction for instruction, my disassembly agrees with `src/bullets.js` and
`src/bulletmath.js` on all of:

* `$2814B6` core A and `$2817C2` core B - the freeze triple summed as WORDS, the
  `tst.w $811F72 / bpl` + `btst #0,$811F73 / bne` re-entry, **the freeze exit's
  carry-CLEAR quirk** (`$28154E`), the five-slot unrolled `dbra` search, the
  `$81B414` ladder immediates `$D/$15/$1F/$25/$29`, `$281536 ori #1,SR`;
* `A0 = record base + $10` after the six-load copy - verified by walking the
  `(A0)+` chain, and therefore `$28158A ($a,A0)` = +$1A, `$281572 ($c,A0)` =
  +$1C, `$281592 ($2a,A0)` = +$3A, and the nine inits' `+$10` displacement rule;
* `$281578 add.w (A7),D7` reading D0's **HIGH** word (the stack is D0,D7,A0,A1;
  `add.w (A7)` takes the first two bytes of the pushed longword);
* the bank split - `$281586 add.b D1,D1` ×2 and `$28159A lsr.b #2,D1` in core A
  only, core B `$2818A8 bra.w $28159C` jumping past both;
* all nine spawn-inits, byte for byte, including `$28190C`'s `move.l D5,($26,A0)`
  being a **LONG** and `$281942`'s `move.l D5,($24,A0)` being a **LONG**, and
  `$2818E0` being a literal duplicate of `$2818B4`;
* `$284190` and the four-entry `neg.w` jump table at
  `$2841C2/$284202/$284242/$284282`; `movem.w D2-D3,$1e(A6)` storing only the
  LOW words, which is why `low16()` is right;
* the flagship call site `$273B44` - and it carries something the worklog's
  illustration omits: `$273B50 cmpi.w #$4,$813092 / bne` else
  `move.l #$FFFF0004,D0`, i.e. **a speed bias of `$FFFF` = −1**. The port's
  `u16(d7 + speedBias)` handles it correctly (`add.w` wraps); a port that had
  treated the bias as unsigned would not.

### 2.2 Two exhaustive function-level comparisons (the brief's item 3)

**`$284190`, all 65,536 inputs.** Every (speed 0..255, dir 0..255) pair driven
through `src/bulletmath.js` against my independent read of `maincpu.bin`:
**IDENTICAL, 65,536 of 65,536** - including all four quadrant boundaries and the
angle-wrap seams (dir `$3F/$40/$7F/$80/$C0/$FF`) and the speed extremes
(0, 1, 254, 255). Boundary spot values off the cartridge: speed 20 → (223, 0) and
(0, 148); speed 63 → (704, 0); speed 255 → (2852, 0) / (0, 1896).

**The generators, 48,906 invocations.** 19 entries × rank ∈ {0,1} × 3 enemy-flag
combinations × all 39 kinds × 11 angles (`0,1,$0C,$1F,$20,$3F,$40,$7F,$80,$C0,$FF`),
port write log vs my independent model: **0 divergent rows of 48,906.** This is
the enumeration the brief asked for in place of sampling one run, and the port
passes it.

### 2.3 The field's extent, independently

`$200920` pointer deltas are **exactly 520 for every one of 0..255** and
`ptr[256] = ptr[257] = 0`; `$283F50[i] = 8·triangle(i)` for **all 256** entries;
the raw quadrant longwords are all non-negative (min 0, max 45,645) and none
overflows a word after `asr.l #4`. `quadStride = 65×8` is confirmed, and the
implementer's `asr.l` note is correct-but-currently-moot (no negative entry
exists today).

### 2.4 The board work reproduces

`play` 197 / `fanplay` 245 / `faninvuln` 10,057 spawns, **0 divergent** in each,
and the 10 × 3 mutation matrix reproduces cell for cell. `$812950` is confirmed
non-zero under the poke - and **stronger than reported**: `faninvuln` carries
`b2=0001` ×8,462, `b2=0002` ×122, `b2=0003` ×1,473. `$813160` reads 0 on all
10,499 spawns, so `no-global-bias` is red on `$812950` alone.

### 2.5 The cross-build check the wave skipped - and it passes

`rosetta.py align`: `$2814B6→$180502` MEDIUM, `$2817C2→$1807AA` MEDIUM,
`$284190→$182DEE` **HIGH**, `$281956→$18093E` MEDIUM, `$2815C6→$180612` MEDIUM,
`$282030→$180FD0` MEDIUM. I then disassembled build A directly:

| build B | [build A] | identical? |
|---|---|---|
| `$28134E` pair +0/+6 | `$1803D2` | yes, instruction for instruction |
| `$281366` triple +0/+5/+10 | `$1803EA` | yes |
| `$28138A` flags-adaptive | `$18040E` | yes (incl. `bne $281348`/`$1803CC` `swap D1` fixup) |
| `$2813A6` spread3 centre +2 | `$18042A` | yes |
| `$2813D4` spread2 | `$180458` | yes |
| `$2814B6` core A | `$180502` | yes |
| `$2817C2` core B | `$1807AA` | yes |
| **`$281494` the orphan** | **`$1804E0`** | yes - same `jsr core / addi.l #$40000 / jsr core / movem.l (A7)+,D0-D1/A0 / rts`, and preceded by an unconditional `bra.w $18042A` in A exactly as `$281490 bra.w $2813A6` in B |

So **correction 5.1 is cross-build confirmed**: `$281494` is an orphan body in
*both* builds. That also **refutes the worklog's gloss** - it is not "the rank≠0
arm of a generator whose head THIS BUILD does not contain"; neither build has a
head. Build A additionally lacks a counterpart for B's `$281450`, which is a real
B-only entry and confirms the port's 19-entry B inventory is not a mis-split.

---

## 3. FINDINGS

### F1 - MODERATE. "7 of 8 rank≠0 fan bodies driven" is not what the gate says

`w21patterngate.mjs` knows 13 rank≠0 bodies/arms (`BODIES`). Across all three
corpora the union of `body:` marks is **7**:
`$2813A6 $2813D4 $281402 $281668 $2816C0 $2816DE $281708`.

**Never driven, with their live fire-site counts from `w21patterns.py gens`:**

| body / arm | entry | fire sites | driven? |
|---|---|---|---|
| `$28134E` pair +0/+6 (bank A) | `$281420` | **4** | NO |
| `$281450` spread2 +4 (inline) | `$281450` | **10** | NO |
| `$281726` single +2 (inline) | `$281726` | **4** | NO |
| `$281776` spread2 +6 (inline) | `$281776` | **1** | NO |
| `$281366` triple (bank A) | `$281432` | 0 | NO |
| `$281680` triple (bank B) | `$281754` | 0 | NO |

The worklog (§6.3, and the commit message) says **one** was undriven and that it
was undriven *because it has zero call sites*. Four of the six undriven arms have
call sites. Measured against the eight SHARED bodies named in `bullets.js`'s own
header the number is **5 of 8**, not 7 of 8.

The gate itself prints a hardcoded denominator: `BODIES reached ${size}/8` over a
13-entry map. That is a coverage number that cannot be right.

### F2 - MODERATE. Correction 5.2's *conclusion* is right; its *proof* is not

`w21patterns.py rewrites` prints:

```
  writers that touch the LOW byte ($1,A6) = kind bits 0..5:  0
  writers of the WHOLE word:                                 0
```

**The second line is false.** There are **11 `clr.w (A6)`** in
`$282104..$283BAF`, each at `A6 = record base` (their tails are
`lea $40(a6),a6 / dbra d7,$281e54`) and each followed by
`move.w #$FFFF,$2(a6)` - the bullet's own death, exactly `$281330`'s park
pattern:

```
$282496 $282552 $28260E $2826CA $282BDC $282DEE $282EAA $282F5C
$2834EC $2835BA $283696
```

The tool cannot see them: its opcode allowlist covers `ori/andi/eori`,
`move.b/move.w` immediate-or-Dn and the bit ops, and has no `clr`, `neg`, `not`,
`addi` or `move.l` form.

**And its stated premise is false.** The header asserts "A6 = the $40-byte bullet
record for the whole of the mover". It is not: continuations advance it -
`$28213E adda.l #$a,a6`, closing with `lea $36(a6),a6` - so `(A6)` in those
tails is **record + $0A, the sprite descriptor**. That is what the 14
`move.l …,(A6)` (e.g. `$282152 move.l #$1BF58C,(A6)`, an animation-frame swap)
and 12 `addi.l #x,(A6)` sites actually are. Had the allowlist covered `move.l`,
the tool would have reported **14 false "type-word rewrites"**; it was saved by
the same gap that hid the `clr.w`s.

My capstone multi-start sweep (40 start offsets, majority vote per address) finds
**81** instructions writing through `(A6)` with no displacement in that range,
against the tool's 53:

```
andi.b 30   move.l 14   bchg.b 14   addi.l 12   clr.w 11
```

**The conclusion survives** - `clr.w` writes 0, which is a *free slot*, not a
live bullet of a new kind; every byte op is bits 8..15; `bchg #3,(A6)` is word
bit 11 (I re-derived the big-endian byte→word-bit mapping and confirm it). But
"THERE ARE NO IN-FLIGHT KIND REWRITES" is an **absence claim**, and
`docs/knowledge/09` is explicit that only the listing proves absence. The listing
scan that carries it is partial in one direction and mis-premised in the other,
and it is published as exhaustive.

### F3 - MODERATE. The `$284190` unit tests seed through the constants they test

`mathRom()` in `tests/bullets.test.js:453` builds the synthetic fold window at
`VEC.fold`, the pointer table at `VEC.speedPtrs`, and the rows at
`VEC.quadStride`. `velocity()` reads `VEC.fold` and `VEC.speedPtrs`. Fixture and
subject share the constant, so they agree whatever it holds. **Proven:**

```
VEC.fold $283F50 -> $283F60
  node --test tests/bullets.test.js   68 pass, 1 fail
  the ONLY red: "the exported velocity field carries the 1.5:1 ellipse"
  the four synthetic tests (quadrants, asr.l, speed 0, domain guard) stay GREEN

  ...and with rip/port/player.tables.json moved aside:
  67 pass, 0 FAIL, 2 skipped -- fully green with the port reading the fold
  table from the wrong address.
```

This is the eighth-defective-check shape, alive in this wave. It is *mitigated*
by the real-cartridge test - but that test is skippable, and on a fresh checkout
the suite is green. The record-layout half of the suite does not have this
problem (it seeds the template at literal offsets and asserts a write log of
literal addresses, exactly as the brief requires) - this is the `$284190` half
only.

### F4 - MINOR. Mutation-table break C proves nothing about the port

`velocity()` **never reads `VEC.quadStride`** - the stride is implicit in the
`$200920` pointers (`movea.l (A3,D0.w),A3 / adda.w (A2),A3`). `grep` confirms the
constant is referenced only by `mathRom()` and, separately, by
`export-tables.py`'s own `QUAD_STRIDE`. Changing it cannot change any port
output; the "2 of 69 red" in §8.2 is the synthetic fixture breaking itself
(`win(a, 512)` with records written at `a + 8×64`). Reported as a source break
that exercised the port; it did not.

### F5 - MODERATE (latent). Twelve entries are ported without the ROM's register restore

Twelve rank≠0 arms push and pop `movem.l D0-D1/A0`:

```
$281420 $281432 $281442 $281450 $281484 $2814AC
$281744 $281754 $281764 $281776 $2817A8 $2817B8
   (pops at $281360 / $281384 / $2813CE / $2813EA / $28147E / $2817A2 / ...)
```

so on return **D0, D1 and A0 are the caller's originals**. The port's `pair06`,
`triple05`, `spread2A/3A`, `spread2B/3B`, `adaptive` and the two inlined arms
leave `regs.d0` and `regs.d1` mutated (`+$60000`, `−8/+$10` on the angle byte,
and the `add.b D1,D1` ×2 scale).

`spawnCore`'s own doc-comment is careful about exactly this - "MUTATED: d1 is
written back … which is what the ROM does" - so the register contract is modelled
in the core and silently *not* modelled one level up. A caller cannot tell which
entries preserve.

Invisible today: at `$813098 = 0` every arm is `beq`/`jmp` straight into the core
with no `movem`, and the gate reconstructs registers per invocation. It becomes
wrong the first time a call site is ported - specifically a `dbra` fan that reuses
D0/D1, e.g. **`$273B44`'s eight-way ring calling `$2817B8` eight times**, under
rank ≠ 0. At the "monstrous accuracy" bar this is a defect now, not later.

### F6 - MINOR. `poolPark()` is exported, never called, never tested

`BUL.slots 210 → 205` leaves the suite at **69 pass, 0 fail**. `BUL.slots` is
read only by `poolPark` (`$281330`), which nothing in the tree calls. It is the
one ported routine in the wave with zero coverage of any kind.

### F7 - INFORMATIONAL. `rosetta.py` was not used

The brief made it mandatory ("the fall-through trap has bitten TEN times"). The
worklog does not mention it. I ran it and the result is favourable (§2.5) - so
this is a process gap, not a defect, except that it also means the worklog's
gloss on `$281494` ("a generator whose head THIS BUILD does not contain") went
out unchecked and is wrong.

### F8 - MINOR. Numbers that do not reconcile

* `w21patterns.py gens` prints `TOTAL 943` and "19 entry points, **943** call
  sites"; `sites` and the worklog and the commit say **912**. The 31 are the
  generator bank's internal core calls, which `sites` excludes and `gens`
  counts - the two summaries contradict each other in the same tool.
* The union of rank-0 entry arms attributed across the three corpora is **8**
  (`$2813F0 $281402 $281484 $2814AC $281764 $2816F6 $2817A8 $2817B8`), not the
  worklog's "9 distinct rank-0 arms". With F1, the "**26 of 73** branches
  executed" total is not reproducible from the gate's own output.

### F9 - INFORMATIONAL. Two smaller things

* `$812950` takes **three** distinct non-zero values under the poke (1, 2, 3),
  not just 1. The finding is stronger than published.
* `tools/oracle/w21bullets.lua:253` carries `REL = { [0x13C806] = true, … }` - a
  **build-A** address with no comment saying why. Copied idiom; per the brief a
  build-A address is a defect unless the line explains itself.

---

## 4. MY MUTATION TABLE - every check I broke, watched red, and restored

`node --test tests/bullets.test.js` baseline **69 pass, 0 fail**.

| # | file | constant | change | result |
|---|---|---|---|---|
| 1 | bullets.js | `REC.speed` | `+$1A → +$1B` | **40 red** (reproduces break A) |
| 2 | bullets.js | `REC.attribute` | `+$1C → +$1A` | **3 red** |
| 3 | bullets.js | `TPL.runInit` | `+$10 → +$12` | **1 red** |
| 4 | bullets.js | `TYPEBIT.coreB` | `$200 → $400` | **1 red** |
| 5 | bullets.js | `REC.param2a` | `+$2A → +$2B` | **2 red** |
| 6 | bullets.js | `BUL.templatePtrs` | `$281956 → $28195A` | **12 red** |
| 7 | bullets.js | `BUL.windowIters[4]` | `$29 → $28` | **1 red** |
| 8 | bullets.js | `BUL.stride` | `$40 → $20` | **38 red** |
| 9 | bullets.js | **`BUL.slots`** | **210 → 205** | **0 red - GREEN (F6)** |
| 10 | bulletmath.js | **`VEC.fold`** | `$283F50 → $283F60` | **1 red**, and **0 red with tables absent (F3)** |
| 11 | bulletmath.js | **`VEC.quadStride`** | `65×8 → 64×8` | 2 red, **both fixture artefacts (F4)** |
| 12 | bulletmath.js | `VEC.speedPtrs` | `$200920 → $200924` | 2 red (quadrant test stayed green) |

Restored, verified byte-identical both ways:

```
30cda299a78d9b26c1a5e56bab635cf4d40cc1b889514cdf8b39794c40b8068a  src/bullets.js
675664e4d3fba497765359898428ca0cccfbfd42de6cc2744f3198738700688b  src/bulletmath.js
6ff34f9f90a7c2eec299157f62a6ca3faa25e941b47d0643c2705fa2b1f7ca85  tests/bullets.test.js
node --test tests/  ->  307 pass, 0 fail, 0 skipped
```

---

## 5. THE COVERAGE SENTENCE, RESTATED HONESTLY

> **39 of 39 kinds** are instantiated through the port and compared against an
> independent parse of the cartridge; I additionally compared all 39 against a
> second, independent model of the emitter over 48,906 (entry, rank, flags, kind,
> angle) combinations at **0 divergent**. **9 of 39** kinds - {3,4,5,6,7,11,12,13,19}
> - have additionally been compared against the live board, 10,499 spawns, write
> for write, 0 divergent.
>
> **8 of 19 rank-0 entry arms** and **7 of 13 rank≠0 bodies/arms** have been
> executed by a board run; six rank≠0 arms have not, and **four of those six have
> live fire sites** (`$28134E`/4, `$281450`/10, `$281726`/4, `$281776`/1). The
> `$284190` half has **0 of 6** branches board-executed - the mover is unported -
> but is exhaustively compared as a function over its entire 65,536-point domain.
>
> **20 of 39 kinds are transcribed but unexercised on the board**, and the wave is
> right that no in-flight rewrite produces them - though see F2 for the state of
> the proof. **40 paths throw with their ROM address.**
