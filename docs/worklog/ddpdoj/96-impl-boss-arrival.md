# 96 -- IMPL: THE BOSS'S ARRIVAL -- and the arrival is EIGHT rungs, not fifteen

status: **IN PROGRESS.**

started: 2026-08-06. wave: 96. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `95-impl-boss-wave-d.md`, `94-impl-boss-wave-c.md`,
`85-impl-boss-bucket-trace.md`, `39-OWNER-visible-play-before-sound.md`.

---

## 0. THE PREMISE, RE-MEASURED -- and the brief's size is wrong in BOTH directions

`[M]` I grepped `src/`, `tools/` and the worklogs before disassembling anything,
and I ran the ladder BEFORE touching a line.

### 0.1 The brief says "all 15 arrival rungs". `[M]` SEVEN OF THE FIFTEEN ARE NOT THE ARRIVAL'S.

`[M]` the fifteen rungs lf8,250..11,750 and what each is ACTUALLY blocked on, on
the FIRST FRAME of its segment, out of the unmutated BEFORE sweep:

| blocked on | rungs | what it is |
|---|---:|---|
| `$241D3E` | **7** | the unexported speed level (W95 §3) |
| `$294FA6` | **1** | F script 0's STEP |
| `$295304` | 5 | **F script 2's STEP** |
| `$295432` | 2 | **F script 3's STEP** |

**F 2 and F 3 are W95 §7's own list of what the STEADY STATE still needs**, not
the arrival's. So the arrival proper is **EIGHT rungs**, and the other seven
belong to the wave that finishes W95's twelve.

### 0.2 The brief says "$294FA0 is the blocker". `[M]` IT IS ONE INSTRUCTION.

```
[M] 294FA0  397c00c00002   move.w #$c0,$2(a4)      <- F 0 INIT, the whole of it
[M] 294FA6  536c0002       subq.w #$1,$2(a4)       <- and it FALLS THROUGH
```

F 0 is **ten instructions**: a 192-frame countdown, then `MAIN.start 0`, one
`$24150A` cue and `clr.w (a4)`. It is not a blocker in any load-bearing sense.
**What is behind it is MAIN 0 (`$293204`/`$29321C`, 252 instructions), and MAIN 0
is the arrival.**

### 0.3 The true size, resolved through the real tables in `$2596C6`'s walk order

`[M]` `.scratch/w96/census.py` (W95's, whose ported set is DERIVED from the
port's own `registerScript` calls):

```
[M] RUNGS 72
[M] UNION entry points over all rungs: 41, of which UNPORTED 21
```

**21, not W94 §3B's 22.** The 15 arrival rungs' first frames need 21 unported
entry points = **21 script ids, 39 entry points**; `[M]` static closure
(`.scratch/w96/walk.py`, `jsr (An)` invisible, a LOWER BOUND) is **43 boss-local
routines / 1,526 instructions NEW** against the already-ported closure, plus 6
outside it. **W95's whole wave was 690 boss-local instructions.** So the brief's
"the arrival" is **2.2x a wave that was already a full wave.**

**IT IS MORE THAN ONE WAVE AND I SAY SO HERE, AS THE BRIEF ASKS.** The split is
not invented: §0.1's blocking census draws it.

### 0.4 Speed level `$82` -- TRUE, and W95's derivation of its DOMAIN is wrong

`[M]` `player.tables.json` exports **92 of 256** levels, `0..68` plus multiples
of 8; **130 is in neither** and `quads['130']` is absent. Confirmed.

`[M]` **but W95 §3's "four sites step `$4A`/`$8A` by +-2 in LOCKSTEP with
`$2A(A6)`" is false, and it is the half that sizes the fix.** Two of the four
move them in OPPOSITE directions:

```
[M] $294448 addq.b #$2,$4a(a6) / $29444C addq.w #$4,$2a(a6)    same sign
[M] $2947CA subq.b #$2,$4a(a6) / $2947CE subq.w #$4,$2a(a6)    same sign
[M] $294910 subq.b #$2,$4a(a6) / $294914 addq.w #$4,$2a(a6)    OPPOSITE
[M] $294A12 addq.b #$2,$4a(a6) / $294A16 subq.w #$4,$2a(a6)    OPPOSITE
```

so `$4A` is **not** a function of `$2A` and the domain is **not** `$82 +- 44`.
`[M]` the board's own RAM over all 72 rungs carries **four** distinct values in
`$4A`/`$8A`, not one: **`$6A`, `$76`, `$82`, `$AE`** (106, 118, 130, 174).

`[M]` **the invariant that IS provable from the image**: over the whole
`$200000..$2B0000` image, the ONLY writers of `($4A,A6)`/`($8A,A6)` inside the
boss's own code are those four `+-2` sites, and the base is the prototype's
`$82`, which is EVEN. **So the boss's part speed bytes are ALWAYS EVEN**, and
that -- not a guessed band -- is what the exporter is widened to.

---

*(sections 1..8 to follow)*
