# `$813098` RECON — the loop flag, its writers, and what it selects

status: **DONE (static)**   wave: ad-hoc recon   role: recon (READER — no `src/` edits, no commit)
target: `ddpdojblk` VERSION-B (`$23xxxx`-`$2Axxxx`, 2002.10.07 BLACK VER). Every address
is build B unless the line says build A. Every static read is against the decrypted
image `games/ddpdoj/tools/oracle/out/maincpu.bin` (6,291,456 bytes) via capstone
(`CS_MODE_M68K_000`). No ROM-derived bytes are committed; scratch scripts were used
and removed.

## THE QUESTION

> Who writes the loop/rank flag `$813098`, and what tables/branches does it select?
> `$813098` has read 0 on every frame ever measured (16,000+, including a boss
> fight). The DOJ pattern inventory is stated as "39 kinds" — is it really
> "39 kinds × N loop variants"? Are the never-driven fan bodies and never-fired
> kinds LOOP-2 content or genuinely unreachable?

## HEADLINE ANSWER (one paragraph)

`$813098` is the **second-loop flag**, binary (writers only ever store 0 or 1; all
388 reads are `tst.w`). It has **exactly three writer opcodes in build B**
(`$259DB0`, `$259DC6` inside the debug stage-select, and `$290762` on the normal
object-dispatch path) and **zero** of any other writer class — exhaustively proven
statically below, matching the W21 rosetta recon. The flag **does not multiply the
39 kinds** (a kind-4 bullet is the same kind-4 bullet in both loops; kinds are
fixed at spawn). What it multiplies is **generator output**: 17 of the 19 generator
entry points open with `tst.w $813098 / b<cc>`, and at `$813098 == 0` every one
emits ONE bullet, while at `$813098 != 0` 15 of them run a FAN body (2-3 bullets at
angle/speed offsets). Of the 6 rank-`!=0` fan bodies no corpus has driven, **4 are
LOOP-2 content** (they have live fire call sites that reach them when the flag is
set) and **2 are genuinely dead** (zero call sites in the whole 6 MB image). The
real pattern denominator is **39 kinds × (1 loop-1 generator output + N loop-2 fan
shapes per generator)**, with N=2 loop states; the loop-2 half of the bullet
subsystem is **transcribed and unit-tested but board-unvalidated** naturally — so
"~90%" is true only on a transcription accounting and "~45-55%" is the honest
board-validated figure.

---

## 1. THE WRITERS — exhaustively, statically (RULE 2 satisfied)

A direct opcode sweep of the whole 6,291,456-byte image for every instruction class
that can store to `$813098` (abs.long, since `$813098` is outside abs.short range):

| writer class | opcode pattern | sites in build B | sites in build A |
|---|---|---|---|
| `move.w #imm,$813098` | `33FC wwww 00813098` | **3** | 1 |
| `move.w Dn,$813098`   | `33C0..33CF 00813098` | **0** | 0 |
| `clr/st/sf/neg/not/tas $813098` (abs.l) | various `??F9 00813098` | **0** | 0 |

The three build-B writers (the only purposeful writers of the flag anywhere in the
cartridge):

```
$259DB0  move.w #$0,$813098      inside DEBUG STAGE SELECT $259D04 (selector < 6)
$259DC6  move.w #$1,$813098      ditto, selector >= 6 ("STAGE R1..RE")
$290762  move.w #$1,$813098      object type 7, sub-state 2  -- the REACHABLE one
```

Build A's sole counterpart is `$18F230` (`move.w #$1,$813098`), the same
object-type-7 path. The debug-select pair `$259DB0`/`$259DC6` has **no build-A
counterpart** — Black Label added the DIP-gated stage select (W21 §6a).

This is an **exhaustive** static result: the scan walked every even byte of the
image. There is no `move.l`, no `st`, no `clr`, no register-source `move.w` to
`$813098` anywhere. The W10 claim "written at exactly two" (filtered to
`$23xxxx-$28xxxx`, missing `$290762` at `$29xxxx`) and the W17 dynamic "3 writes,
all init" are both superseded by W21 §6 and re-confirmed here.

The non-purposeful "writer" a dynamic tap sees: `$2603E4 move.w #$0,(A0)+ / dbra`
in the `$81308C..$8131BC` clear loop (`lea $81308C,A0 / move.w #$65,D0` at
`$2603DA`; build-A twin `$15F734`). It sweeps `$813098` on the way past and is the
only PC a write-tap ever caught — but it is an init sweep, not a flag setter.

## 2. THE TRIGGER — who sets it, and when (W21 §6c, dynamic)

`$259DB0`/`$259DC6` sit inside the **debug stage-select handler `$259D04`**, which
is **DIP-gated** (`$259D14 move.w $C08006,D0 / btst #7,D0 / bne $259D30`; MAME's
`:DSW` "Unknown" mask `$0080`, default OFF). It is the operator's stage/loop
selector: stages 0-5 (`< 6`) → `$813098 := 0`; stages 6-11 (`>= 6`, "STAGE R*") →
`$813098 := 1`. **`$259D04` has no caller in build B** — `rosetta.py codexref` finds
none and a full-image longword scan for `$00259D04` finds none. (Build A's twin
`$159250` IS called, by a second main-loop body `$13C7A8` that build B does not
have.) So in build B the debug-select writers are reachable only via a computed
`jmp (d8,PC,Xn)` dispatch no address search can see — **listing-only, never
observed to fire**.

`$290762` is the **normal-path writer**, reached through the object dispatch table
entry [7] (`$240F9A -> $290BE8`), sub-state 2:

```
$290746: tst.w  $81E116          ; gate A: the "message/script finished" flag
$29074C: beq    $29077C          ;  -> not finished: skip, go increment a counter
$290758: tst.w  $81E112          ; gate B: the "nobody pressed anything" counter
$29075E: bne    $290B4C          ;  -> someone pressed something: skip
$290762: move.w #$1,$813098      ; *** LOOP FLAG GOES TO 1 ***
$29076A: move.w #$11,D0 / jsr $241182   ; allocate object type $11 ($25CEB8)
$290774: jmp   $241292           ; driver tail
```

`$81E116` is set at `$2911CA`; `$81E112` is a counter incremented off the masked-input
readers. The gate is *"the end-of-stage message sequence finished AND no input
intervened"* — i.e. the **second-lap transition**. Cross-build `align` pins
`$290746 -> $18F214` HIGH and build A's `$18F230` is the same writer. **Both builds
have this path; it is not a Black-Label addition.** Reaching it dynamically is a
play-through problem (get to whatever sequence sets `$81E116`), not a recon one;
W30 (the loop-gate hunt) owns it.

A 3,000-logic-frame VERSION-B write-tap on `$813098` (W21 §6, boot+coin+coin+start)
saw only the init sweep (`$2603E4`, value 0). **None of the three real writers has
ever been observed to fire** — consistent with `$813098 == 0` on all 16,000+
measured frames.

---

## 3. WHAT `$813098` SELECTS — the 17 generator branches

Every `tst.w $813098` (`4A79 00813098`) site in the generator bank `$281000-$282000`,
with the branch and both arms:

| entry | branch | rank==0 (branch TAKEN) | rank!=0 (fall-through) | fan body |
|---|---|---|---|---|
| `$2813F0` | `beq.w $2814B6` | 1 bullet (core) | `$2813FA: jmp $2814B6` | **NONE — no-op gate** |
| `$281402` | `beq.w $2814B6` | 1 bullet | `$28140C` inline: `addi.l #$40000,D0 / jsr core / subi / rts` | single, **speed +4** |
| `$281420` | `beq.w $2814B6` | 1 bullet | `$28142A: movem / bra $28134E` | pair (shared body) |
| `$281432` | `beq.b $2814B6` | 1 bullet | `$28143A: movem / bra $281366` | triple (shared, **DEAD**) |
| `$281442` | `beq.b $2814B6` | 1 bullet | `$28144A: movem / bra $2813D4` | spread2 (shared body) |
| `$281450` | `beq.b $2814B6` | 1 bullet | `$281458` inline: spread2 + speed +4 | spread2, speed +4 |
| `$281484` | `beq.b $2814B6` | 1 bullet | `$28148C: movem / bra $2813A6` | spread3 (shared body) |
| `$2814AC` | `bne.w $28138A` | 1 bullet (fall to core) | `$28138A` adaptive (`($D,A5)&$81`) | flags-adaptive |
| `$2816F6` | `beq.w $2817C2` | 1 bullet | `$281700: jmp $2817C2` | **NONE — no-op gate** |
| `$281708` | `beq.w $2817C2` | 1 bullet | `$281712` inline: `addi.l #$40000,D0 / jsr / subi / rts` | single, speed +4 |
| `$281726` | `beq.w $2817C2` | 1 bullet | `$281730` inline: `addi.l #$20000,D0 / jsr / subi / rts` | single, speed +2 |
| `$281744` | `beq.b $2817C2` | 1 bullet | `$28174C: movem / bra $281668` | pair (shared body) |
| `$281754` | `beq.b $2817C2` | 1 bullet | `$28175C: movem / bra $281680` | triple (shared, **DEAD**) |
| `$281764` | `beq.w $2817C2` | 1 bullet | `$28176E: movem / bra $2816DE` | spread2 (shared body) |
| `$281776` | `beq.w $2817C2` | 1 bullet | `$281780` inline: spread2 + speed +6 | spread2, speed +6 |
| `$2817A8` | `beq.b $2817C2` | 1 bullet | `$2817B0: movem / bra $2816C0` | spread3 (shared body) |
| `$2817B8` | `bne.w $2816A4` | 1 bullet (fall to core) | `$2816A4` adaptive | flags-adaptive |

**17 generator entries open with `tst.w $813098`** (the W21-impl "sixteen"
undercounts by one, OR defines "rank-gated" as "has a distinct fan variant" — see
the two no-op gates below). The 19 entry points are these 17 plus the two spawn
cores `$2814B6` / `$2817C2`. (The orphan `$281494` is not an entry — W21 §5.1.)

**Two of the 17 are no-op gates.** `$2813F0` and `$2816F6` (the plain "single"
entries, 86 + 120 = 206 call sites — the most-common in each bank) carry the
`tst`/`beq` but their rank-`!=0` fall-through is just `jmp <core>`: **both arms
emit one bullet.** The flag has no effect on their output. They account for the
17-vs-16 difference; they look like a template copied to every entry and never
given a fan body for the single. Everything below counts them as "rank-gated in
code, not in effect."

## 4. THE FAN BODIES — the 8 shared bodies + inline arms (verified by disassembly)

Each fan body is a 2-4 instruction sequence of `jsr <core>` with `addi.l`/`subi.l`
speed biases around the calls and `subq.b`/`addi.b` angle offsets on D1. The full
set, disassembled from the listing:

### Shared bodies (reached via `bra` from the entry)

| body | reached by | shape (from the listing) |
|---|---|---|
| `$28134E` | `$281420` | **pair, same angle**: `jsr core / addi.l #$60000,D0 / jsr core` (speed +0/+6) |
| `$281366` | `$281432` | **triple, same angle**: `jsr / addi.l #$50000 / jsr / addi.l #$50000 / jsr` (+0/+5/+10) **DEAD** |
| `$2813D4` | `$281442` | **spread2 ±11.25°**: `add D1,D1 / add D1,D1 / subq.b #8,D1 / jsr / addi.b #$10,D1 / jsr` |
| `$2813A6` | `$281484` | **spread3**: centre (speed +2) then `-8 / +8` |
| `$281668` | `$281744` | **pair, same angle** (bank B): +0/+6 |
| `$281680` | `$281754` | **triple, same angle** (bank B): +0/+5/+10 **DEAD** |
| `$2816DE` | `$281764` | **spread2 ±11.25°** (bank B) |
| `$2816C0` | `$2817A8` | **spread3** (bank B): centre, `-8`, `+8` |

### Inline fan bodies (the entry's own fall-through)

| entry | shape |
|---|---|
| `$281402` | single, speed +4 (`addi.l #$40000,D0` around one `jsr core`) |
| `$281450` | spread2 ±11.25°, speed +4 (`movem / addi.l #$40000,D0 / angle-spread / 2× jsr`) |
| `$281708` | single, speed +4 (bank B) |
| `$281726` | single, speed +2 (bank B) |
| `$281776` | spread2 ±11.25°, speed +6 (bank B) |

### The two adaptive bodies (`bne`-taken at rank!=0)

`$28138A` (bank A) / `$2816A4` (bank B): `($D,A5) & $81` picks 2-way, else bit 1 of
the enemy sub-record byte 0 picks 2-way, else 3-way. **Which enemies pick which fan
is still listing-only** — every corpus took the rank-0 arm.

**Every fan body, at rank==0, collapses to the entry's single `jsr <core>`** — one
bullet. Rank is the single variable that turns a shot into a fan. This is the
gameplay-shaping fact W20 §2 stated and it is confirmed instruction-for-instruction
here.

---

## 5. THE 6 NEVER-DRIVEN BODIES — LOOP-2 vs DEAD (the key question)

The 21b-review established that across all three corpora (`play`, `fanplay`,
`faninvuln`), **7 of 13 ported rank-`!=0` bodies were driven** and six were not:
`$28134E $281366 $281450 $281680 $281726 $281776`. Their fire-call-site counts
(`w21patterns.py gens`, the number of `jsr` sites in the whole image that target the
entry which reaches the body):

| body | reached via entry | fire sites | verdict |
|---|---|---|---|
| `$28134E` (pair) | `$281420` | **4** | **LOOP-2 CONTENT** |
| `$281366` (triple) | `$281432` | **0** | **DEAD** — no caller anywhere in 6 MB |
| `$281450` (spread2+4) | `$281450` | **10** | **LOOP-2 CONTENT** |
| `$281680` (triple) | `$281754` | **0** | **DEAD** — no caller anywhere in 6 MB |
| `$281726` (single+2) | `$281726` | **4** | **LOOP-2 CONTENT** |
| `$281776` (spread2+6) | `$281776` | **1** | **LOOP-2 CONTENT** |

**4 of the 6 are loop-2 content, 2 are genuinely dead.** The four with live sites
are reachable the moment `$813098 != 0` AND the calling enemy fires: the entry's
rank-`!=0` fall-through runs straight into the body. They were not driven in the
poked stage-1 corpus because their call sites belong to later stages (or stage-1
enemies the corpus did not reach), not because the path is closed. **The two
triples `$281366` / `$281680` have zero call sites in either bank of either build —
they are dead code as the cartridge ships**, the orphan cousins of `$281494`
(W21 §5.1). A computed-dispatch invisibility caveat applies (no scan sees
`jmp (d8,PC,Xn)`), but the W21 §5.2 exhaustive opcode sweep of the behaviour range
found no producer, so "dead" is the strong reading, not a proof.

### The 20 never-fired bullet KINDS are NOT loop-2 content

W21 §7 lists the 20 kinds no fire call site passes as D0&`$3F`:
`[15,16,17,20,21,23..34,36,37,38]`. The site scan is loop-agnostic (it back-decodes
the nearest preceding `move.l #imm,D0` regardless of branches), and W21 §5.2 proved
no in-flight type rewrite exists (the `bchg #$3,(A6)` the W20 recon cited is word
bit 11, a per-bullet flip-flop, not a kind bit). **The kind is fixed at spawn and
the same in both loops.** So none of the 20 are loop-2-specific. Their honest status
(W21 §6.1): transcribed and unit-tested, not board-observed; most belong to later
stages (`$813096` never left 0), a few may hide behind a computed dispatch no scan
sees. The loop-2 multiplier does not touch the kind count.

---

## 6. THE TABLES `$813098` INDEXES — and a third reader W21 did not catalogue

`$813098` is read by **388 `tst.w` sites** in the image (build A + B) and **3
`move.w $813098,Dn` direct reads** in build B. The 388 span the whole game, not
just the generators — `$813098` gates a vast surface of loop-2 enemy AI, bosses and
stage scripts. This is the general point: loop 2 is not "stage 1 again harder", it
is a second pass through roughly half the behavioural cartridge.

Two tables are indexed by `$813098` directly (W21 §8b, confirmed):

| table (build B) | build A | reader | `[0]` loop 1 | `[1]` loop 2 |
|---|---|---|---|---|
| `$287DF0` word table (hyper-meter CAP) | `$18692E` | `$28615E` | **56** (W19-measured) | **90** |
| `$28809E` longword sub-table pointers | `$186BDC` | `$2859DC` | `->$2880A6` | `->$28811A` |

The pointer table selects between two 58-word ramp sub-tables; loop 1 repeats each
value **twice**, loop 2 repeats each value **three times** (a slower ramp over the
same ladder). Both builds agree byte-for-byte, so the loop-2 CONSTANTS are
extractable at HIGH confidence with no poking.

**A third direct reader W21 did not list: `$287C3E move.w $813098,(A4)`.** This is
not a table index — it is a **state-record builder** inside the `$287C08`
`movem.l D0-D7/A0-A6` routine:

```
$287C0C: lea  $81B430,A4         ; a record in the $81B4xx status block
$287C3E: move.w $813098,(A4)     ; store LOOP flag into record[0]
$287C44: move.w $813092,$2(A4)   ; store STAGE counter into record[2]
$287C4C: tst.w  $81309A          ; (another loop/stage flag)
$287C52: beq    $287C60
$287C56: move.w #$1,(A4)         ; override: loop=1, stage=5  ("R5")
$287C5A: move.w #$5,$2(A4)
$287C60: ... (d0..d3 -> record[4..$A]) ; jsr $287CEE
```

It snapshots `(loop, stage, ...)` into `$81B430` — almost certainly the **stage
banner / HUD status object** that displays the current loop and stage, with a
special case forcing "loop 1 / stage 5" when `$81309A` is set. It reads the flag to
SHOW it, not to branch on it. So `$813098` feeds four consumers: the 17 generator
gates, the meter-cap table, the ramp sub-table pointers, and this status-record
builder.

---

## 7. THE REAL PATTERN DENOMINATOR

> **N = 2** (the flag is binary: writers store 0 or 1; every read is `tst.w`).
> But the multiplication is not "39 kinds × 2".

The **39 kinds do not multiply**: a kind is a (template, spawn-init, behaviour)
triple fixed at spawn in `$281568`/`$28187A`, and nothing in the 39 behaviours
rewrites the kind bits (W21 §5.2, exhaustively). A loop-2 kind-4 bullet IS a
kind-4 bullet.

What DOES multiply is **generator output**, per entry, per loop:

- 2 entries (`$2813F0`, `$2816F6`): no-op gate, 1 bullet in both loops — **no
  loop variant**.
- 15 entries: rank-`==0` emits **1 bullet**, rank-`!=0` emits a **fan** (2 or 3
  bullets at angle/speed offsets, or the flags-adaptive 2/3-way). These each have
  **2 loop variants**.
- The wider-than-3 fans (midboss 8-way ring `$273B44`, boss unrolled 8-way
  `$264084`, etc.) live at the **call site** as `dbra` loops calling a generator.
  Their fan count is loop-independent in their own code, but each iteration through
  a gated generator doubles its output in loop 2 — so an 8-way ring of singles in
  loop 1 becomes an 8-way ring of fans in loop 2.

So the honest pattern surface is roughly:
**39 kinds** (loop-invariant) **× {1 bullet (loop 1) | fan-of-N (loop 2)} per
generator**, over **912 fire call sites** — and the loop-2 fan shapes are ~15
distinct bodies the cartridge contains but no natural run has executed.

The cleanest one-line correction to the existing inventory:
> The DOJ bullet inventory is **39 kinds** (loop-invariant) **+ 15 generator fan
> bodies that exist only in loop 2** (of which 4 are reached by live call sites
> and 2 are dead), **+ 2 loop-2 table rows** (meter cap 56→90, ramp 2×-repeat→3×).
> "39 kinds" understates the observable-pattern space by roughly the loop-2 fan
> surface, which is ~15 shapes × the 912 call sites that invoke them.

## 8. WHAT IT MEANS FOR THE PHASE B SCOPE ESTIMATE

Two honest readings, and both numbers are defensible if labelled:

- **On a transcription + unit-test accounting: ~90%.** 39/39 kinds transcribed and
  field-compared to an independent ROM parse; 19/19 generator entries and 13/13
  fan bodies ported; the velocity field, fold table, and both loop-2 table rows
  exported and range-checked. The fan bodies are unit-asserted at both
  `$813098 = 0` and `$813098 = 1` from the listing (`SHAPES`).

- **On a board-validated accounting: ~45-55%.** Of the 73 branches in the ported
  bullet routines, 26 have been executed by a board run and matched (W21 §6.2);
  the other 47 are unit-tested only. **The entire loop-2 half of `$813098`-gated
  behaviour is board-unvalidated naturally**: `$813098` has never been non-zero on
  any unforced frame, so none of the 15 fan bodies, neither loop-2 table row, and
  none of the 388 other `tst.w $813098` gates across the game have been observed.
  The poked corpus (`faninvuln`) drove 7 of 13 fan bodies — coverage of the
  transcription, not of the natural game. Reaching `$290762` (the only normal-path
  writer) needs the second-lap transition W30 has not found.

The number to quote depends on which gate the phase requires, and the project's
own rule (`docs/knowledge/03`: "MEASUREMENT PROVES PRESENCE, ONLY THE LISTING
PROVES ABSENCE — write 'I could not reach it', never 'the game does not do this'")
makes the board-validated reading the load-bearing one. **For a Phase B that
claims the bullet subsystem "done" the way the determinism gate claims the frame
sync done, the loop-2 fan bodies and tables are the unpaid half — call it 45-55%,
not 90%.** The unpaid half is cheap to board-validate once W30 lands the loop
transition or the debug warp reaches R-stages with `$813098` live: the port already
emits every fan body and the gate already compares them spawn-for-spawn under a
poke.

---

## 9. WHAT I TRIED AND WHAT I DID NOT DO

- **Static writer scan (exhaustive).** Every even byte of the 6 MB image, every
  writer opcode class (`move.w #imm/Dn`, `clr/st/sf/neg/not/tas` abs.long). Result
  above. This is the RULE-2 answer: I found the writers statically; absence of
  other classes is proven by the scan, not asserted.
- **Static reader/branch map (exhaustive for the generator bank).** All 18
  `tst.w $813098` sites in `$281000-$282000` decoded; the 18th (`$281264`) is a
  stage+loop spawn helper, not a generator. Fan bodies disassembled to the
  instruction.
- **Did NOT re-run the write-tap.** W21 §6 already ran a 3,000-frame VERSION-B tap
  and saw only the init sweep. Re-running MAME is not cheap and would repeat a
  known result; the static writer inventory is conclusive on its own and the
  dynamic result is cited, not reproduced.
- **Did NOT reach `$290762` dynamically.** That is W30's play-through problem
  (get the end-of-stage sequence to set `$81E116`). Statically it is the only
  normal-path writer and it is present in both builds; what I could not do is
  observe it fire.
- **Did NOT scan computed `jmp (d8,PC,Xn)` dispatches.** No address search sees
  them (W21 §4 `codexref` caveat). So "no caller for `$259D04` / for the two dead
  triples" is a strong reading, not a proof — stated as such in §5.

## Files / commands (reproduction)

```
# the decrypted image (gitignored, reproducible via tools/oracle/dumpcpu.lua)
games/ddpdoj/tools/oracle/out/maincpu.bin   6,291,456 bytes

# prior work this confirms and extends
docs/worklog/ddpdoj/20-recon-pattern-tables.md   the 20 generators + 39 kinds
docs/worklog/ddpdoj/21-recon-rosetta.md          the writer analysis (§6) + tables (§8b)
docs/worklog/ddpdoj/21-impl-pattern-generators.md the port + the 5 corrections
docs/worklog/ddpdoj/21b-review.md                the 6-body / 13-denominator re-derivation

# the cross-build tool that pinned the writers and tables from a second build
python games/ddpdoj/tools/rosetta.py sites 813098
python games/ddpdoj/tools/rosetta.py align 290746
python games/ddpdoj/tools/rosetta.py table 287DF0 2
```

status: **DONE (static)**. The loop-2 transition itself (`$290762` firing) remains
W30's to reach or to file BLOCKED.
