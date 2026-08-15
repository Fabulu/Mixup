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

**THE FINISH LINE (owner, 2026-08-14):** the project is done when **D36, the second game in the cartridge --
DoDonPachi DaiOuJou WHITE LABEL -- is finished.** D36 stays LAST in order, exactly as before; this names the
endpoint, it does not promote the item. Everything in section 6 comes first.

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
    (`20260813164141`), so the next is due at **W375**, which is the wave in progress.
    **Run `node games/ddpdoj/tools/export-web.mjs` from the repo root BEFORE
    `node tools/publish.mjs --only ddpdoj`** whenever windows changed. **W374 added 33 windows
    (498 -> 531), so this publish MUST regenerate.** Count them from the file --
    `rip/port/player.tables.json`'s `rom.windows` array -- not from a handoff note; a mid-wave note
    recorded 31 and the wave finished at 33.

---

## 3. HOW YOU WORK: COORDINATE, DO NOT PORT

The porting loop is: **decode a 68000 routine -> write the JS -> write driving tests -> run them ->
commit.** Decoding is the token-expensive part and parallelises well. Writing does not, because
several routines land in the same file.

### Your own job, in order, for every unit

1. **Check whether it is already ported.** `grep -rli "<ADDR>" games/ddpdoj/src/` for the bare hex
   with no `0x` and no `$`. **SIX routines this project "needed" already existed under another
   name**: `$243DD0`, `$24652A`, `$24641A`, `$285AF2`, `$259FBC`, and -- found in W374 --
   **`$27F8F0` = `allocPoolA27F8F0` in `src/bee.js`**. Do this before dispatching anything, and
   prefer `tools/claimed.py`: the grep misses role-named ports, which is how eight duplicates were
   written in one session.
2. **Dispatch a RECON agent** to decode the routine completely (brief in 4.1).
3. **Review the returned spec yourself** against section 7's trap list. Most defects this project
   shipped were misreadings that looked plausible. Catching them at spec review is far cheaper than
   after a port.
4. **Dispatch a PORT agent** with the reviewed spec (brief in 4.2). **Never run two port agents on
   the same file at once.** Serialise them. **Worktree isolation is refused by the owner**, so
   serialising is the only option.
5. **Verify**: full suite, then the gate.
6. **Commit and push yourself.** Keep the commit message factual about what was found and what was
   wrong. Update `docs/NEXT_AGENT_HANDOFF.md` in the same commit.

### Parallelism: the owner asked for ONE AGENT AT A TIME (2026-08-14)

**Run agents SERIALLY.** One recon, review its spec, one port, verify, commit, then the next unit. The
owner's words: *"only work in parallel if you are sure it disrupts nothing. One agent working at the time is
usually better."* Read-only recon agents genuinely cannot corrupt the tree, so fanning them out is *safe* --
but the owner was shown six at once and asked for serial anyway, so "it is technically safe" is not a
sufficient reason. Parallelise only when you can state why it disrupts nothing AND the work genuinely needs
it.

**WORKTREE ISOLATION IS REFUSED.** The owner said *"please don't do worktrees."* The brief previously
offered it as the fallback for port-agent file contention; it is withdrawn. Serialisation by target file is
the only concurrency control, and since all seven shared draws land in `src/objslot9.js`, that means one
port agent at a time there regardless.
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

## 5. CURRENT STATE (W375 landed and published)

**Suite 3023/3023, zero skips. Gate exit 0. 536 ROM windows. Dispatch 16 of 20.** W373 ended at
2730 tests and 498 windows; W374 at 2875 and 531.

**PUBLISHED: build `20260815041100`** (`export-web.mjs` BEFORE `publish.mjs`, per the standing rule
-- this wave added windows and skipping the export serves stale assets).

**THE HEADLINE: A COLD BOOT NOW REACHES A DRAWING SCREEN THROUGH THE CARTRIDGE'S OWN PATH.**
`Game#boot()` exists (it did not, in any form). From `new Game(new Uint8Array(0x20000), tables,
{palCatchUp: false})`, `boot()` then `step()`: slot [8] appears as type `$8008` at state `$D` on
frame 1, 300 warning frames, `$D -> 2` at frame 302, then 101 terminated display-list entries. The
positive control is the load-bearing part -- removing ONLY `jsr $28841E` throws `Unreached` at
`$25B602` with `style value 0`.

**D41 IS ANSWERED: coin plus start was NOT sufficient.** Three blockers, all cleared: no boot path,
slot [8] `$25A770` unported, and the `$13CEC8` IRQ4 coin path unmodelled. Coin is bound on the page
(`Digit5`/`Digit6`/`Digit9`/`F2`), and the `$C08000` player word and `$C08004` coin word stay
separate all the way to the browser.

**STILL BLANK AND STALLED, none of it throwing:** `$259FF8` (warning screen draws nothing),
`$23CFDE` (credit line, so a coin is invisible), the `$25AD02`/`$25AFD8` blink pair, and the four
screen sub-machines that keep arms 1, 5, 9 and 12 holding. The attract loop terminates at state 12
rather than cycling.

**STATED HOLE:** `Game` has a second per-frame input now (`this.coinPort`) and `.replay` v1 cannot
carry it, so a recording made while coining up diverges on credit count. Every existing fixture is
unaffected. The fix is a v2 encoding with a sibling `coinin` block, not a change to `step()`.

**Confirm the baseline yourself before trusting that line.** If the suite reports failures while
other agents are editing `src/`, they are almost certainly a snapshot of a mid-edit file rather than
a regression -- re-run once on a quiet tree before diagnosing anything. The totals (2875 tests, 0
skipped) are the numbers to match.

`docs/NEXT_AGENT_HANDOFF.md` is the detailed record. Read it after this file. **It is over 10,000
lines and it is NOT uniformly current**: it carries at least one section that a later wave in the
same run contradicted (it records `$25E4D0` as having no ported caller and warns against wiring
one -- `$25D560` landed later in that wave and is its caller). Treat it as a research log, not as
state, and check anything it asserts against the code.

### Done

* **Stage 5** -- handler-complete and spawn-complete.
* **Hibachi** (`$B0`) -- init body, all twelve body callees, and the 666-byte body, driven.
* **Object dispatch slot [7]** `$290BE8` -- complete. A per-player loop that forks on a two-option,
  ten-second menu (`$2911B0`) to slot [17] or slot [15].
* **Slot [13]** `$288A60`, **slot [14]** `$288C6C`, **slot [15]** `$291F66`, **slot [17]** `$25CEB8`.
* **Slot [9]** `$25CACA` -- **COMPLETE except its `$25CB94` tail.** All EIGHT record states are
  ported (`$25D306`, `$25D402`, `$25D39C`, `$25D4F0`, `$25D560`, `$25D010`, `$25D1DA`, `$25D164`),
  and so is the seeder `$25C8A2` (`$25C8A2..$25CAC0`, `$220` bytes -- W373 estimated ~550 from an
  address gap). `$25CB94`, the dispatcher's continuation past the record walk, is still a counted
  note: it reads `$23D16C`, tests bit `$F`, checks record 1 and calls `$23C98E`.
* **`$25D560`, the state-7 handler** -- ported as `phase7_25D560` in `src/objslot17.js`.
  732 bytes, `$25D560..$25D83B`, one `rts`. Its six callees remain counted notes (see section 6).
* **`$23E2F2`** -- the zooming enqueue in REGISTER form, `enqueueZoomedRegisters` /
  `resolveZoomRegisterStub` in `src/spritequeue.js`, a family of thirteen stubs. It is what
  unblocked the last three shared draws.
* **D35's coin handler**, `$13CFBA` through `$13D0EA`, complete: edge read, DIP coinage conversion,
  a four-byte tick queue, and a six-frame counter solenoid pulse. **But nothing feeds it a coin**
  -- see D41, new on 2026-08-15.

### ALL EIGHT SHARED SELECT-SCREEN DRAWS ARE PORTED, in `src/objslot9.js`

    $25E220   $25E29E   $25E4D0   $25E6CE   $25E824   $25EDF8   $25EF30   $25F074

**NO SINGLE CALL SITE RUNS ALL EIGHT, and that is the cartridge's design, not an omission.**
`confirmAndDraw` (record states 1 and 4) fires seven and omits `$25E4D0`. `$25D560`'s tail at
`$25D800` fires seven and omits `$25EDF8` -- counted as seven `4EB9` jsrs in `$25D800..$25D839`, not
assumed. **Do not "fix" either list by adding the missing one**; it would draw a sprite on the wrong
screen. The tail's order is load-bearing in both: every call emits into the same bucket, so
reordering them reorders the sprites.

**Three sizes this project recorded were wrong because they came from an address gap.** Measured to
the real `rts`: `$25E6CE` is **70** bytes (recorded 342), `$25E4D0` is **446** (recorded 958),
`$25F074` is **327** (recorded unknown). **An address gap bounds a REGION, not a routine.**

### THE FRONT-END SLOTS ARE REGISTERED IN `src/main.js` -- THEY WERE NOT BEFORE

Until W374 `defaultHandlers` held only slots **0-6, 10, 11**. Every screen the front-end waves built
was correct code the object driver could not reach. W374 added **7, 9, 13, 15, 17**; W375 added
**14**. `slotObject(fn, rom)` adapts `(ram, rom, a5, ctx)` to the driver's
`(ram, slot, slotIndex, ctx)`; slot [17] needs more than the adapter, because `phase7_25D560`'s draw
tail takes its seven draws as `ctx.selectDraws` rather than importing them (`objslot9.js` already
imports `objslot17.js`, so importing back would close a cycle).

**READ `main.js` FOR THE LIVE LIST. Do not copy this one** -- it moved twice in two waves.

### TWO REAL BUGS IN SHIPPED CODE WERE FIXED IN W374

Both are worth knowing because both are shapes that recur:

* **`confirmAndDraw`'s early `return`.** `$25D244 beq.w $25D254` lands INSIDE the draw block, on its
  first instruction, not on the `rts`. A non-confirm frame skips the sound and the state write and
  **still draws**. Modelled as an early `return`, the whole select screen drew only on the single
  frame a button was pressed.
* **`bee.js`'s `offset & 0xffff`**, which dropped the high word of type `$1B`'s four-corner death
  rows and collapsed a box to a segment.

**AND THE FIRST BUG WITHDREW TWO CLAIMS THAT HAD ALREADY BEEN SHIPPED INTO DOCSTRINGS.** `$25EDF8`'s
body and `$25F074`'s art arm were both recorded as dead gates on the strength of the early return.
**Both are live**: on a non-confirm frame `($1,A6)` is still 4 at the call, so both
`cmpi.b #$4,($1,A6)` gates fire. That is trap 10 -- and the rule it leaves is worth more than the
fix: **before calling a gate dead because of what a caller writes, resolve the branch that skips
that write.** "The caller sets it to 2" is only an argument if the caller ALWAYS sets it to 2.

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

**Every unit the previous edition of this section listed is DONE** -- `$25EDF8`, `$25EF30`,
`$25E6CE`, `$25E29E`, `$25E824`, `$25F074`, `$25D560` and `$25C8A2` all landed in W374. The list
below replaces it. **Run the already-ported check (section 3, step 1) on each one anyway**; that
list was current when it was written too.

Sizes below are measured to a real `rts` unless marked. **A size taken from an address gap bounds a
REGION, not a routine** -- that error put three numbers in this file wrong by up to a factor of six.

1. **`$23C98E`** -- the cheapest unit on the list and it pays TWICE. It is the descriptor's third
   code pointer, and it is the ONE thing blocking two separate places: slot [9]'s `$25CB94` tail
   calls it, and `tallyscreen.js:945` carries a counted note saying slot [11]'s phase 0 can never
   complete without it. Unported -- it appears in `src/` only in prose (trap 17), so grep the name
   and the family, not the address.
2. **`$25CB94`** -- slot [9]'s continuation past the record walk, and then slot [9] is complete. It
   reads `$23D16C` (a descriptor input accessor, ported alongside `$23D186`), tests bit `$F`, checks
   record 1 and calls `$23C98E`. Unread; do unit 1 first.
3. **`$25D560`'s SIX CALLEES**, all counted notes in `objslot17.js`, all sized from `HANDLER7`:

       $25F530     80 B   the head -- and it `bsr`s $25F592 (560 B), so it is really two
       $25FAA4    334 B   the per-frame body
       $25F456    218 B   the tail call
       $26070C    124 B   the handoff
       $2603FE    172 B   the pair site, behind a once-only latch on $812F80

   Plus `$25F2D0`, slot [17]'s state-6 label pair, noted at `objslot17.js:317`.
4. **D41: coin and start controls.** New from the owner on 2026-08-15 and the smallest
   player-visible item on the docket. **`ctx.coinPort` is read at `isr.js:51` and set NOWHERE** -- a
   repo-wide grep returns the read and the parameter name, nothing else -- so the coin port sits at
   `COIN.idle` for ever and no coin can be inserted. The economy below it is complete and driven.
   **The trap is at the site**: IRQ6's `portWord` is `$C08000`, the PLAYER port; `$13CFBA` reads
   `$C08004`. Handing one to the other credits a coin every frame, and it already cost six test
   failures. Browser layer is `src/web/input.js`; `games/ddpdoj/.scratch/` holds a stale copy that
   is NOT the live tree. **Swiss QWERTZ: bind by `e.code`, and bind `KeyY` and `KeyZ` together.**
5. **FIVE dispatch slots still untouched** -- not nine, and not eleven. Six of the eleven W372 found
   are ported (`objslot7pool.js`, `objslot9.js`, `objslot13.js`, `objslot14.js`, `objslot15.js`,
   `objslot17.js`) and all six are now registered in `main.js`. What is left:

       [ 8] $25A770    ~188 B to its first rts, TEN distinct callees   -- the big one
       [12] $28F3AC     ~76 B   zero callees before the first rts      -- hiscore family
       [16] $256E7A     ~74 B   zero                                   -- service/test menu
       [18] $24902A             the ASIC27 self-test (see below)
       [19] $28EE88     ~30 B   zero                                   -- 51 callees, 18 unported

   **Those byte counts are FLOORS, measured to the first `rts` only.** A dispatcher's arms usually
   live BELOW its entry -- slot [14]'s do, and slot [9]'s start at `$25C8A2`, `$228` bytes under its
   own table entry. Trap 6, and it has bitten this table specifically.
6. **Slot [18], the ASIC27 self-test.** Real work, NOT on the path to the milestone, and **not an
   ending** -- the D37 anchor on it was withdrawn in W373 on the strength of its own strings. Its
   callees are **compiled C**: arguments pushed right to left, caller cleans up, and the compiler
   **batches the cleanup across two calls** (`lea ($18,A7),A7` after two 12-byte pushes). `$24842C`
   BLOCKS on input inside a loop, which does not fit a per-frame driver and **needs a decision, not
   a transcription**.
7. **Docket, by what is actually blocked:**
   * **D33** main screen -- slot [17] is ported and registered; the screen itself still needs its
     seeding and its entry path.
   * **D34** character select -- slot [9], complete but for `$25CB94` (units 1 and 2).
   * **D35** life and coin -- the coin HANDLER is done; **lives, extends, game over and continue
     remain unanchored**, and D41 is the input edge D35 never covered.
   * **D37** endings -- **needs re-anchoring**; slot [18] is not it.
   * **D38** input lag, faithful -- the logic side is measured faithful; only the presentation path
     remains.
   * **D39** input lag mods -- three toggles specified, and D38 lands first.
   * **D26** second ship and two more pilots; **D28** the multi-ship/pilot mods, explicitly deferred
     by the owner until the game is done.
8. **D36, the second ROM game -- DoDonPachi DaiOuJou WHITE LABEL.** LAST by the owner's explicit
   instruction, and **the project's definition of done**. Nothing has been decoded for it: no entry
   point, no region bound, no dispatch table. When its turn comes, the first job is to locate its
   reset vector and bound its region, **not** to assume it mirrors Black Label's layout.

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
19. **A COMMENT IS NOT A PORT, AND A COMMENT CAN BE WRONG.** `claimed.py` reported `$23C194` as
    CLAIMED; every hit was a comment in `displaylist.js`, and **the comment was the error**. It said
    the routine was `move.w #1,D0 / or.w D0,$80393C` and stopped there. The routine is four bytes
    longer and ends `bra.w $23C008`, which is `lea $B0E000,A0 / move.w $80393C,(A0)` -- the commit to
    the IGS023 control register. **Call #4 dropped two hardware writes every frame from wave 11 to
    W375.** `claimed.py` classifies hits CODE / NOTE / COMMENT for exactly this reason: read the
    class, not the verdict, and re-decode anything whose only evidence is prose.
20. **NEVER PROVE AN EXTENT BY ASSERTING AN ABSENCE.** `w236banner-palette.test.js` proved W236's
    five-block extent with `assert.throws(() => ROM.bytes(0x2256b8 + 5*0x40, 64), Unreached)` -- a
    claim about **the window list**, not about W236. `$2256B8 + 5*$40` is `$2257F8`, and the moment
    an unrelated wave declared a window there for the high-score fade targets, a correct test failed
    for a reason with nothing to do with its subject. Prove bounds from **the code that reads the
    data** or from the table's own terminator (`$28EE1E` pair [5] is `$80008000`, not an address).
21. **A routine may never return, and may be PRECEDED BY A `jmp` RATHER THAN AN `rts`.** Trap 6 says
    scan back from the preceding `rts`; sometimes there is none. `$25B3D4` is `jmp $25A14C.l`,
    `nop`-padded. And `$23BF74` has no `rts` anywhere in `$23BF74..$23C007`: it falls through into
    the seven-call main loop and `bra`s back forever. `4EF9` is 6 bytes, `4E75` is 2, so tail-jump
    routines are 4 bytes longer than a naive size count.
22. **A push/pop pair means the routine is REGISTER-TRANSPARENT and returns NOTHING.** `$23C1C2`
    opens `move.l D0,-(A7)` and its shared tail closes `move.l (A7)+,D0`. "It returns the old mask"
    is the obvious reading and it is wrong. Check both halves before you name a return value.
23. **`$8xx0` IS `SBCD`, NOT A COMPARE, AND IT WRITES ITS DESTINATION.** `$8300` decodes field by
    field as SBCD D0,D1 (bits 15-12 = `1000`, bits 8-4 = `10000`, bit 3 = 0); a `cmp.b D0,D1` is
    `$B200`, a different opcode. W379 found the port had read `$25CB86 8300` as a compare, concluded
    D1 was untouched, and let the following `$25CB8E 1D41 002F move.b D1,($2F,A6)` write back the
    literal `1` the `moveq` had put there. **That pinned the select screen's auto-confirm clock at 1
    forever**, so the borrow never happened, and every record sat in state 1 waiting for a button
    press that a demo run never makes. Nine bytes, and it froze the whole screen.
    **The tell is an arithmetic opcode followed by a store of the "compared" register.** If code
    writes back a register you believe was only read, you have mis-decoded the instruction above it.
24. **A COUNTED NOTE GOES STALE WHEN SOMEONE ELSE PORTS ITS SUBJECT.** `objslot17.js` noted
    `$26077E bsr.w $260580` with a message listing four routines as unread. W378 ported all four
    into `rank.js` and nobody removed the note, so the cartridge's ONLY caller of that routine still
    did not call it -- and `$26089E`, the sole writer of `$81315C`, sits at the bottom of it. **When
    you port a routine, grep the tree for notes naming it** and hand the list to whoever owns them.

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

1. **Confirm the baseline yourself first**: full suite (expect 2875, 0 skipped), gate exit 0,
   `git status`, and the window count out of `rip/port/player.tables.json` (expect 531). Do this
   before reading anything, so you find out immediately if a document is describing a tree that no
   longer exists. Several sections of this file have been wrong in exactly that way.
2. **Publish. It is due at W375 and W374 added 33 windows**, so
   `node games/ddpdoj/tools/export-web.mjs` from the repo root FIRST, then
   `node tools/publish.mjs --only ddpdoj`. Skipping the first step serves stale assets from the live
   site, and that fails as a broken page rather than as a red test.
3. Read `docs/NEXT_AGENT_HANDOFF.md` for detail -- as a research log, not as state. See section 5.
4. Take unit 1 from section 6 (`$23C98E`). Run the already-ported check, dispatch a RECON agent,
   review the spec yourself against section 7, then dispatch a PORT agent.
5. Keep going. Do not stop.
