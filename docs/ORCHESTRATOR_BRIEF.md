# DoDonPachi DaiOuJou Black Label Version-B -- ORCHESTRATOR BRIEF

**You are a coordinator, not a porter.** Read this whole file before doing anything. It carries the
goal, the rules that are not negotiable, the working model, the current state, the measured next
units, and the decoding traps that have cost this project the most time. Everything here was learned
the expensive way.

---

## 1. WHAT THIS IS

`C:\programmieren\batman` is a readable JavaScript translation of the arcade ROM
**DoDonPachi DaiOuJou Black Label Version-B**. The game lives under `games/ddpdoj/`.

**The milestone:** one credit from stage 1 through stage 5 with no `Unreached`, then the loops.

**The owner's standing goal, stated repeatedly and never withdrawn:**
> "finish everything we ever talked about including stage 5, hibachi, the docket, and everything I forgot."

Stage 5 and Hibachi are **done**. The docket is the remaining bulk. See section 6.

---

## 2. RULES THAT ARE NOT NEGOTIABLE

Break any of these and the owner loses work or money.

1. **NEVER END YOUR TURN WHILE DOCKET WORK REMAINS.** This is the single most expensive failure in
   this project's history. The previous agent did it four times. The owner's words: *"this was a
   disastrous breach of contract and cost us 100 dollars."*
   * A finished unit is **not** a reason to stop. A natural seam is **not** a reason to stop.
   * **Running low on context is NOT a reason to stop** -- the harness summarizes for you. The
     previous agent used this as a justification and was corrected. Write state to
     `docs/NEXT_AGENT_HANDOFF.md`, commit, and keep going.
   * Put status reports **inside a turn that continues with tool calls**, never in one that ends.
   * Stop only when the owner tells you to, or when something genuinely needs their decision and no
     other work can proceed.
2. **NO EM DASHES** anywhere -- output, docs, commit messages, agent briefs. Use `--`. Asked for
   twice.
3. **NEVER `git add -A`.** Add named paths only.
4. **NEVER delete outside the project.** Never `rm` from `/` (Git Bash maps it to
   `C:\Program Files\Git`) and never use a bare `./` target. Name a file before proposing to delete
   it. Write temp files with absolute paths under the session scratchpad.
5. **NEVER touch** `NUL`, `.scratch-*`, or `games/ddpdoj/tools/oracle/c1_*.py`. They are untracked
   and not yours.
6. **Never commit generated `rip/` or `assets/`.**
7. **Never widen an existing ROM window.** Declare a new one.
8. **Write source files as LF bytes.** Never `sed -i` over a glob, never a Python text-mode write.
9. **At least 90 percent of effort in playable product code.** Recon that does not end in shipped
   code is waste.
10. **One focused smoke per meaningful change.** Every port must be **driven**, not just compiled.
11. **Publish every FIFTH wave** (standing authorisation). Last publish was W370
    (`20260813164141`), so the next is due at **W375**. Wave W373 is complete.
    **Run `node games/ddpdoj/tools/export-web.mjs` from the repo root BEFORE
    `node tools/publish.mjs --only ddpdoj`** whenever windows changed. W373 added 41 windows.

---

## 3. HOW YOU WORK: COORDINATE, DO NOT PORT

The porting loop is: **decode a 68000 routine -> write the JS -> write driving tests -> run them ->
commit.** Decoding is the token-expensive part and parallelises well. Writing does not, because
several routines land in the same file.

### Your own job, in order, for every unit

1. **Check whether it is already ported.** `grep -rli "<ADDR>" games/ddpdoj/src/` for the bare hex
   with no `0x` and no `$`. **Five routines this project "needed" already existed under another
   name** (`$243DD0`, `$24652A`, `$24641A`, `$285AF2`, `$259FBC`). Do this before dispatching
   anything.
2. **Dispatch a RECON agent** to decode the routine completely (brief in 4.1).
3. **Review the returned spec yourself** against section 7's trap list. Most defects this project
   shipped were misreadings that looked plausible. Catching them at spec review is far cheaper than
   after a port.
4. **Dispatch a PORT agent** with the reviewed spec (brief in 4.2). **Never run two port agents on
   the same file at once.** Either serialise them or give each `isolation: "worktree"`.
5. **Verify**: full suite, then the gate.
6. **Commit and push yourself.** Keep the commit message factual about what was found and what was
   wrong. Update `docs/NEXT_AGENT_HANDOFF.md` in the same commit.

### Parallelism that is safe

* Many RECON agents at once -- they are read-only.
* PORT agents in parallel **only** when their target files are disjoint, or with worktree isolation.
* One VERIFY pass at a time. **Never run `export-tables.py` while the suite is running** -- it
  regenerates data the W129/W132 replay tests read and turns four mutation tests red. A red
  MUT-A/B/C is a race before it is a regression: re-run before diagnosing.

### What you must never delegate

* The already-ported grep (step 1).
* Spec review (step 3).
* Commits, pushes, and handoff updates.
* Any decision about whether a bound is real.

---

## 4. AGENT BRIEFS -- COPY THESE

### 4.1 RECON agent (read-only, parallel-safe)

> Decode 68000 routine `$XXXXXX` in `games/ddpdoj/rip/sound/maincpu.bin`. **That file is addressed by
> RAW FILE OFFSET -- do not subtract `$200000`.**
>
> Work from `cd games/ddpdoj` and use `python tools/aligned.py sweep <start> <end>`. It refuses
> rather than guesses: it stops at flow breaks (`RTS`, `RTE`, `RTR`, `JMP`, `BRA`) because bytes
> after one are only code if something branches to them. **Resume from every branch target you find,
> including backward ones.** A `bsr`/`jsr` target is authoritative evidence of an entry point and
> outranks the sweep. The tool occasionally mis-sizes an instruction (it has done so for `divs.w` and
> `adda.w`); when an address looks off, dump raw bytes with Python and decode by hand.
>
> Return a structured report containing:
> * Every instruction with its address, in flow order, with branch targets resolved to addresses.
> * The routine's TRUE start and end. **The dispatch-table address is often NOT the start** -- arms
>   branch backward. Scan from the preceding `rts`.
> * Every table it reads, with the **bound stated by the code**, not by a plausibility scan, and the
>   evidence for that bound.
> * Every callee, and for each one whether `grep -rli "<addr>" games/ddpdoj/src/` finds it.
> * Every register that is **inherited rather than set** (A4 and A0 are the usual culprits).
> * Anything you could not resolve. **Say so. Do not guess a value the cartridge does not define.**
>
> Check every item in the trap list you were given. Report which traps apply.

Paste section 7 into every recon brief.

### 4.2 PORT agent (writes code, serialise by file)

> You have a verified spec for `$XXXXXX`. Write the port into `<file>` and driving tests into
> `games/ddpdoj/tests/w<N><name>.test.js`.
>
> * Transcribe what the cartridge does, including things that look untidy. Overlapping writes,
>   sequential compares that cascade, stale registers and duplicated stores are usually load-bearing.
>   If you "clean up" a construct, the individual lines still look right and the behaviour silently
>   changes.
> * Comment every non-obvious line with its ROM address and why it is written that way.
> * Where a value cannot be resolved, call `ctx.unported?.note(addr, why)` with the exact extent.
>   **Never invent a value.**
> * **Run your tests.** Iterate until green. Static checks prove shape, not correctness: this project
>   has shipped invented function names, wrong argument order, wrong argument COUNT, out-of-scope
>   variables and shadowed imports, and **all of them passed `node --check` and every ROM assertion.
>   Only execution caught them.**
> * Do not run the full suite; the coordinator does that.
> * Report what you wrote, what your tests assert, and anything the spec got wrong.

### 4.3 VERIFY agent (or do it yourself)

> `node --test games/ddpdoj/tests/` then `node games/ddpdoj/tools/webgate.mjs`. Report pass/fail
> counts, skip count, and gate exit code. If MUT-A/B/C are red, re-run once before reporting -- they
> race with `export-tables.py`.

---

## 5. CURRENT STATE (end of W373)

**Suite 2730/2730, zero skips. Gate exit 0. Tree clean. Everything pushed.**

`docs/NEXT_AGENT_HANDOFF.md` is the detailed, verified record. Read it after this file. It is long
but every section was checked at the end of the wave.

### Done

* **Stage 5** -- handler-complete and spawn-complete.
* **Hibachi** (`$B0`) -- init body, all twelve body callees, and the 666-byte body, driven.
* **Object dispatch slot [7]** `$290BE8` -- complete. A per-player loop that forks on a two-option,
  ten-second menu (`$2911B0`) to slot [17] or slot [15].
* **Slot [13]** `$288A60`, **slot [14]** `$288C6C`, **slot [15]** `$291F66`, **slot [17]** `$25CEB8`.
* **Slot [9]** `$25CACA` -- dispatcher plus five of its eight record states.
* **D35's coin handler**, `$13CFBA` through `$13D0EA`, complete: edge read, DIP coinage conversion,
  a four-byte tick queue, and a six-frame counter solenoid pulse.

### Established structure

**The front end is a CHAIN, not a set of peers.** From scanning all 34 `$241182` call sites:

    [0]  -> [7]
    [7]  -> [17] when the menu answers 0, [15] otherwise
    [13] -> [14] -> [12]
    [6]  -> [19] -> [8] -> [9] and [10]
    [18] -> [8]
    [3]  -> [16]
    [11] -> [0] [1] [4] [5] [11] [13] [14]        the tally screen is the hub
    [17] -> [10]

**The "from" side of that table is a heuristic** (nearest preceding dispatch entry) and dispatch
entries are not routine starts. Verify an edge before relying on it. One was already wrong.

### Two identifications that changed the docket

* **Slot [18] is NOT D37.** Its own strings are `Asic27 Test`, `Asic27 Stack Ram Error !!`,
  `Global Ram Testing...`, `All Functions Test Ok!`, `A) Exit`. It is the ASIC27 coprocessor's
  operator self-test. The D37 anchor is **withdrawn** in `docs/DOCKET.md`.
  **Lesson: read a slot's strings before anchoring a docket item on it. It costs one command.**
* **Slot [9] IS D34**, confirmed: a two-player character select with real mutual exclusion. Each side
  reads the OTHER side's byte, `$25D2EA` returns the first option that differs, the two order tables
  are mirrored (`0,1,2` and `2,1,0`), and the cursor steps OVER the other player's pick.

---

## 6. NEXT UNITS, MEASURED, CHEAPEST FIRST

Sizes are upper bounds from the address gap to the next known routine.

1. **`$25EDF8`** (312) -- the PORTRAIT draw, fully swept, spec is in the handoff. Eight tables, four
   per side; art index is the cursor value times four; body gated on record state 4.
2. **`$25EF30`** (324) -- the only shared draw that reads the OTHER record. Part-read in the handoff.
3. **`$25E6CE`** (342), **`$25E29E`** (1072), **`$25E824`** (1492), **`$25F074`** -- the remaining
   shared draws. Both record state 1 and state 4 call all seven, so each serves the whole screen.
   **`$25E220` is done and is the pattern for them.**
4. **`$25D560`** -- slot [17]'s last handler. Part-read. Pulls in `$25F530`, `$25FAA4`, and a far
   branch to `$25D800`.
5. **Slot [9]'s OBJECT state 0** `$25C8A2` (~550 bytes) -- then slot [9] is complete.
6. **Slot [18]** the ASIC27 self-test. Real work but NOT on the path to the milestone. Its callees
   are **compiled C**: arguments pushed right to left, caller cleans up, and **the compiler batches
   the cleanup across two calls** (`lea ($18,A7),A7` after two 12-byte pushes). `$24842C` BLOCKS on
   input inside a loop, which does not fit a per-frame driver and **needs a decision, not a
   transcription**.
7. **Nine dispatch slots still untouched:** [8] `$25A770`, [12] `$28F3AC`, [16] `$256E7A`,
   [19] `$28EE88`, and the rest.
8. **Docket:** D33 main screen (slot [17], ported), D34 (slot [9], mostly done), D35 (coin handler
   done; **lives, extends, game over and continue are still unanchored**), D37 (re-anchor needed),
   D38 input lag faithful (logic side measured faithful; presentation path remains), D39 input lag
   mods (three toggles specified), D26 second ship plus two more pilots, D28 multi-ship/pilot mods.
9. **D36, the second ROM game -- LAST, by the owner's explicit instruction.**

---

## 7. DECODING TRAPS -- PASTE THIS INTO EVERY RECON BRIEF

Every one of these has produced a shipped defect or a withdrawn claim.

1. **`cmpi.b #imm,(d16,An)`: the IMMEDIATE word comes BEFORE the displacement.** `0C2E 0003 0001` is
   `cmpi.b #$3,($1,A6)`, **not** `cmpi.b #$1,($3,A6)`. Reading it backwards turns one state byte into
   four independent flags and every arm still looks plausible. It survived eleven passing tests.
2. **Opcode size fields.** `$5239` is `addq.b` and `$5279` is `addq.w`. `$0C39` is `cmpi.b` and
   `$0C79` is `cmpi.w`. Reading a byte op as a word makes odd addresses look like alignment faults
   and merges two adjacent fields into one.
3. **`DBcc` decrements and branches if FALSE.** `move.w #$N,D7` plus `dbra` is **N+1** passes.
   `moveq #$31` is 50, `move.w #$C7` is 200, `move.w #$6F` is 112.
4. **A word literal is TWO byte fields.** `move.w #$202,($34,A6)` sets a counter AND its reload.
   `move.w #$101` sets both to 1. `move.w #$093C` sets `$09` and `$3C`.
5. **Counter-and-reload pairs live on ADJACENT BYTES.** Seen five or more times.
6. **The dispatch-table address is often NOT the routine's start.** Arms branch backward. Seen five
   times. Scan from the preceding `rts`. Measuring forward from the table entry gets the span wrong.
7. **`lea (d16,PC),An`: EA = address of the EXTENSION WORD + disp**, not the instruction address.
8. **Self-bounding tables.** When a pointer table is immediately followed by its own targets, its
   FIRST ENTRY IS ITS BOUND. A forward plausibility scan cannot find the end. But **do not
   pattern-match this** -- one such claim was made, withdrawn, and only restored once a second
   routine settled it.
9. **A `move.w` to `(d16,An)` overlaps the NEXT instruction's byte source.** `move.w D0,($4,A6)`
   then `move.b ($5,A6),($6,A5)` copies the low byte of D0. Deliberate. Separating the fields breaks
   it silently.
10. **Sequential compares are not an else-if chain.** A handler that advances a state byte lets the
    next compare fire in the SAME frame. One record walks `3 -> 5 -> 6 -> 7` in one call.
11. **Registers inherited across calls.** A4 and A0 are routinely set by a caller and used by a
    callee. **`$241182` leaves the staging slot in A0 and does not restore it**, so a following
    `move.w #$0,($4,A0)` writes the NEWLY STAGED RECORD, not the current object.
12. **`stageCreate(ram, type, dispatchPri)` needs the lookup**, not a constant:
    `(t) => rom.u16(0x240F62 + t * 8 + 4)`. Passing `0` type-errors the moment the arm runs. This
    defect was written twice.
13. **Carry-flag boolean returns** via `ori.w #$1,SR` / `andi.w #$FFFE,SR`. Find both exits.
14. **The two type tables**: types `$00..$7F` at `$267824 + type*8`; `$80..$FF` at
    `$27E412 + (type-$80)*8`. `initBody = init + 8`.
15. **The sprite bucket counter is a BYTE OFFSET, not a sprite tally.** Four emits moved it by 48.
    Assert a whole multiple in tests, never a count.
16. **`BUCKETS[i].counter` is an ADDRESS, not a running count.** Writing it rewrites the bucket
    descriptor and breaks `resolveEmitStub` for the whole process.
17. **This port cites ROM addresses in PROSE.** `grep 0x259554` finds a comment and misses the code.
    Search the bare hex, the NAME, or the FAMILY.
18. **A scripted string replace that finds no anchor writes nothing and says nothing.** Two handoff
    edits silently no-opped this way. **Grep for the result, not the exit code.**

---

## 8. TOOLING

Run from the repo root unless stated.

| Tool | Use |
|---|---|
| `games/ddpdoj/tools/aligned.py` | `cd games/ddpdoj` first. `sweep <start> <end>`, `check <start> <end> <addr>...` |
| `games/ddpdoj/tools/export-tables.py` | **Python.** Declares ROM windows. Regenerates data -- never run while the suite runs. |
| `node games/ddpdoj/tools/webgate.mjs` | The gate. Must exit 0. |
| `node games/ddpdoj/tools/export-web.mjs` | Run BEFORE publish when windows changed. |
| `node tools/publish.mjs --only ddpdoj` | Publish. Every fifth wave. |
| `node --test games/ddpdoj/tests/` | Full suite. Takes minutes; run in background. |

**`RomWindows` serves a read only from a window containing it WHOLE.** Declare windows in
`export-tables.py` with the bound the code states and the evidence for it in the comment.

`unreached()` = an unimplemented branch, throws. `note()` / `noteEffect()` = a deliberate, counted
deferral.

---

## 9. WHAT TO DO FIRST

1. Read `docs/NEXT_AGENT_HANDOFF.md`.
2. Confirm the baseline yourself: full suite, gate, `git status`.
3. Take unit 1 from section 6 (`$25EDF8`). Its spec is already in the handoff -- still run the
   already-ported grep, still review the spec, then dispatch a PORT agent.
4. Keep going. Do not stop.
