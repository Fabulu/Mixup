# W27 - REVIEW: the 39 bullet behaviour bodies

status: **DONE** - VERDICT: **APPROVE WITH FINDINGS** (see the end).
wave: 27. role: REVIEWER (read-only on `src/` and `tests/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B. Every address build B unless noted.

Scope given: NOT re-confirming the three headline numbers (37 distinct bodies /
39 kind indices / 413 pass 0 fail 0 skipped) - the orchestrator confirmed those.
This review is what they do not cover.

Priorities:
1. sweep the whole `games/ddpdoj/tests/` tree for the message-text `Unreached`
   assertion class the implementer self-reported;
2. re-apply the four self-reported surviving mutations on a byte-identical copy
   and confirm the new checks bite, and bite narrowly;
3. spot-check the four recon corrections against the listing;
4. state which of the 37 bodies have any check beyond a same-wave unit test.

---

## PRIORITY 1 - THE ADDRESS-BLIND ASSERTION SWEEP

**Method.** Every site in `games/ddpdoj/tests/` where a thrown `Unreached` or a
logged `UnportedLog` note is inspected was enumerated by grep over
`instanceof Unreached` / `, Unreached)` / `/UNPORTED` / `report().some` /
`calls.keys()`, then each was read in context. **43 inspection sites** across 14
test files. (`games/gradius/` and `games/batman/` are out of the brief's scope
and were not swept; W28 should.)

`Unreached`'s message is built at `games/ddpdoj/src/unported.js:26` as
`UNPORTED $ADDR: <what>. The port reached a path wave 4 did not translate; ...`
- and `<what>` is free-form prose that in many call sites **quotes other ROM
addresses**. `UnportedLog.note` (`unported.js:42`) builds its key the same way:
`$ADDR <what>`. So any substring/regex match over either string is matching a
haystack that contains addresses the check does not intend.

### 1A. IDENTITY ASSERTED BY MESSAGE/STRING TEXT - 4 sites

| # | site | assertion | can it pass with the WRONG address? |
|---|---|---|---|
| 1A-1 | `games/ddpdoj/tests/initbody.test.js:59-60` | `assert.throws(..., /UNPORTED.*not in the W23 stage-1 body table/)` | **YES.** No address is checked at all. `runInitBodyAddr` (`src/initbody.js:626`) interpolates the address into both the `UNPORTED $ADDR:` prefix and the `what`; the regex pins neither. Replace `unreached(addr, ...)` with `unreached(0x000000, ...)` and this test stays green. |
| 1A-2 | `games/ddpdoj/tests/background.test.js:306` | `report().some((s) => s.includes('$261142'))` | **YES.** `src/background.js:757` notes `0x261142` with prose that itself contains the literal `$261142` **and** `$26C7F4` / `$26D254`. Mutate the note's first argument to any address and the key still contains `$261142` in its `what`; the check passes. |
| 1A-3 | `games/ddpdoj/tests/background.test.js:339` | `report().some((l) => l.includes('$28CB88'))`, commented *"the callee is COUNTED, **by address**"* | **YES, and worse - `$28CB88` is not the note's address.** The note is `src/background.js:873`, address **`$2620B4`**. `$28CB88` appears only inside the prose, as the deferred-callback pointer - **which the test itself wrote into the synthetic ROM at `background.test.js:70` (`put32(b, at(CUE+4), 0x28cb88)`).** The check is a round-trip of its own constant, and it says nothing whatever about the address the note is filed under. |
| 1A-4 | `games/ddpdoj/tests/handlers.test.js:92` | `[...u.calls.keys()].some((k) => k.includes('286096'))` | **YES.** `src/handlers.js:88` notes `0x286096` with a `what` beginning `DAMAGE $286096 (W28)`. The substring is unanchored and has no `$`, so it matches the prose copy. Mutate the note address and the check passes. |

### 1B. IDENTITY NOT ASSERTED AT ALL (class-only) - 6 sites

Not the reported shape, but the same defect with the regex removed: the check
cannot tell one `Unreached` from another.

| # | site | verdict |
|---|---|---|
| 1B-1 | `games/ddpdoj/tests/background.test.js:604-610` | Title says *"a stage other than 1 is a LOUD THROW **BY ADDRESS**"*; the body asserts only `e instanceof Unreached`. **Any** `Unreached` satisfies it - including the "outside every ROM window" throw a synthetic ROM raises for unrelated reasons, which is the most likely thing actually happening. The title's claim is untested. |
| 1B-2 | `games/ddpdoj/tests/ship.test.js:305` | `assert.throws(() => runOptionObject(...), Unreached)`. The same file draws the laser/pod-spawn distinction explicitly at `:326` and `:331` (`ROM.optionLaser` vs `ROM.optionSpawn`); this test - "ONE held frame is enough" - would pass if a held frame reached the pod spawn instead of the laser, i.e. exactly the confusion the neighbouring tests exist to prevent. |
| 1B-3..5 | `games/ddpdoj/tests/ship.test.js:145,146,147` | Three `ProtLatch` guards, all `assert.throws(fn, Unreached)`. A port in which all three guards threw the *same* one address passes. Low severity (no ROM semantics ride on it). |
| 1B-6 | `games/ddpdoj/tests/shots.test.js:46` | `assert.ok(grab(() => rom.u32(0x240002)) instanceof Unreached)` - the straddling-read case. Low severity; line 44 pins the address for the neighbouring non-straddling case. |

### 1C. CLEARED - message matches that are ADDITIVE, not identity

These 8 sites match message text, but each pins `e.romAddress` on the **same
error object** first, so the text match is a content assertion on top of a
sound identity check. No action:
`displaylist.test.js:209` (+`:208`), `displaylist.test.js:370` (+`:369`),
`background.test.js:364` (+`:363`), `fire.test.js:247-249` (+`:246`),
`objalloc.test.js:194` (+`:190`), `player.test.js:96` (+`:95`),
`ship.test.js:298` (+`:296`), `ship.test.js:375` (+`:374`).

The remaining 25 sites assert `e.romAddress` (or `threw.romAddress`) directly
and are sound. `mover.test.js` - the file W27 fixed - is clean at all four of
its sites (`:251`, `:267`, `:416`, `:1132`).

### 1D. ONE MORE, CORRECT TODAY BUT FRAGILE

`games/ddpdoj/tests/mover.test.js:521-524` filters note keys with
`/27F8F8/i` to assert an **absence**. It is sound *today* only because
`src/mover.js:302`'s `what` happens not to repeat the address, so the only
`27F8F8` in the key is the address prefix. The absence direction fails **open**:
if the death-effect note were ever refiled under a different address the check
would silently pass while the effect was still spawned. It is the one assertion
whose correctness rests on prose that nobody is required to keep.

**Count: 4 message-text identity assertions (1A), plus 6 address-blind
class-only assertions (1B), out of 43 inspection sites.**

---

## PRIORITY 2 - DO THE FOUR (SIX) FIXES BITE?

**The copy.** `games/ddpdoj/{src,tests,assets,probes,index.html,game.json}` and
`rip/port/player.tables.json` copied to
`…/scratchpad/w27copy/games/ddpdoj/`. Baseline in the copy:
**413 pass / 0 fail / 0 skipped** - the copy is faithful.

`src/mover.js` SHA-256, identical in repo and copy before every mutation and
restored to it after every one:
`7c594d82ad8f38c33102609ed0af9422a6dd2590dac1d6fd811fe21e713b1362`
(prefix `7c594d82ad8f38c3` - matches the implementer's reported final hash).
Mutations were applied **byte-exactly in Python** with a single-occurrence
anchor assertion; an early `sed -i` attempt was abandoned because it rewrote
CRLF to LF and would have made "byte-identical" unprovable. **The real tree was
never written to.**

The worklog's `GREEN - NOT CAUGHT` rows number four; two more rows are bolded
`GREEN` in the family-H table. All six were re-applied:

| # | mutation | mutated sha256 (16) | result |
|---|---|---|---|
| M1 | kind 21's epilogue gets kind 2's table (`$282C8E` → `$2821FA`) | `aa3e584787165b2f` | **RED** `not ok 205` - *kinds 2 and 21 resolve DIFFERENT sprite-frame tables* - 412 pass / 1 fail |
| M2 | kind 22's kill uses `freeSlot` (spurious death effect) | `75f5292a4296a549` | **RED** `not ok 211` - *kind 22 DIES WITH ITS TARGET* - 412/1 |
| M3 | kind 31's init installs kind 30's continuation `$28349A` | `36233aa862a8eeda` | **RED** `not ok 232` - *every ported initialiser installs ITS OWN continuation address at +$22* - 412/1 |
| M4 | recompute runs unconditionally (drop the D1 dirty flag) | `f73e59585c1e8881` | **RED** `not ok 224` - *kinds 27/32 do NOT recompute on a frame where neither counter fired* - 412/1 |
| M5 | kind 26's epilogue gets kind 2's table `$2821FA` | `c088127f308b10d2` | **RED** `not ok 227` - *kind 26 rings its descriptor inside bounds carried in the RECORD* - 412/1 |
| M6 | kind 28's throw carries `$263684` instead of `$242748` | `be0dfd41d28a7e8d` | **RED** `not ok 230` - *kind 28 fires when its +$28 byte REACHES ZERO* - 412/1 |

**Six for six, and every one reddened exactly ONE test - never the suite.**
Restore verified byte-identical to `7c594d82…` after each. The implementer's
self-reported gaps are genuinely closed, and the new checks are narrow enough to
localise the defect they catch.

---

## PRIORITY 3 - THE FOUR RECON CORRECTIONS, AGAINST THE LISTING

All four checked by disassembling the bodies myself
(`python tools/oracle/w27disasm.py <lo> <hi>` from `games/ddpdoj/`, over
`tools/oracle/out/maincpu.bin`) and enumerating every branch by hand. **All four
corrections are right and the recon was wrong.**

### 3.1 Kind 24 is NOT a tracker - CONFIRMED, and stronger than claimed

`$282EBC..$282F6C` beside kind 22's `$282D42..$282DFE`:

| | kind 22 | kind 24 |
|---|---|---|
| `btst #3,$34 / beq` target | `$282DA4` - the TRACK arm | `$282F46` - the RELEASE, directly |
| target-pointer read | `$282DA4 move.l $2c(A6),D1` → `$282DAA movea.l D1,A0` | **none** |
| what touches +$2C | nothing (it *is* the pointer) | `$282F26 subq.b #1,$2c` / `$282F2E move.b $2d,$2c` - a byte countdown+reload |

There is **no `movea`, no indirect read, and no reference to `(A0)`** anywhere in
`$282EF0..$282F5A`. Kind 24 cannot track: the pointer it would need is a
countdown in that body. The recon's family E ("the homing tracker (22,24)") is
wrong on kind 24, and the implementer's "one-frame launch delay built out of the
tracker's machinery" is what the listing says.

Also confirmed in passing: `$282DCE cmpi.l #$1c1eec / bne $282DE4` - reaching the
limit **falls through** into the release at `$282DD8`. Real fall-through, ported.
And `$282DEE` is a bare `clr.w (A6)` + `move.w #$FFFF,$2(A6)` with no `jsr` -
`freeSlotNoEffect` is right.

### 3.2 Kinds 29 and 34 were swapped - CONFIRMED

Read out of the three listings, per wall:

| kind | left `$200` | right `$3600` | top `$600` | bottom `$6E00` | velocity |
|---|---|---|---|---|---|
| 25 `$282F9E` | `neg.b` (`$282FB8`) | `neg.b` (`$282FD6`) | **unreachable** | `neg.b`+`addi.b #$80` (`$283038/$28303A`) | full (`$28304E`) |
| 29 `$28333C` | `move.w #$40,D1` (`$283350`) | `#$C0` (`$28336A`) | `#$00` (`$283386`) | `#$80` (`$2833B4`) | **`asr.w #1`** on both halves (`$28339E`, `$2833CC`) |
| 34 `$28374C` | `addi.b #$80` (`$283766`) | `#$80` (`$283786`) | `#$80` (`$2837A8`) | `#$80` (`$2837D8`) | full (`$2837EC`) |

The recon's "29 uses `addi.b #$80`; 34 uses neg+80" is wrong in **both** halves:
kind 34 is the flat `+$80` on all four walls, and kind 29 does not reflect at
all - it `move.w`s an absolute heading and is the only one that halves the
recomputed velocity. "neg+80" is in fact kind **25**'s bottom wall.

### 3.3 Kind 25's top-wall block is unreachable - CONFIRMED, by two methods

`$282FE6 swap D0 / $282FE8 cmpi.w #$600,D0 / $282FEC bcc.w $28302A` (to the
bottom test) and `$282FF0 bra.w $283064` (to the animation tail). Every branch in
the body - `$282FA2`, `$282FAE`, `$282FC4`, `$282FCC`, `$282FE2`, `$282FEC`,
`$282FF0`, `$28302E`, `$283068`, `$28307A`, `$283096` - was enumerated and **none
targets `$282FF4`**. Kinds 29 and 34 fall through into their equivalent block at
`$283386` / `$2837A2`; kind 25 has the extra `bra` in the way.

Independently, not reusing the implementer's tool bounds:
- whole-image (6 MiB) big-endian longword search for `$282FF4`: **0 hits** - not a jump-table entry;
- a capstone linear sweep over **`$260000..$2A0000`** (4× the implementer's `$281000..$285000`): **0 references**.

The same two methods return 0 for the other five dead stubs the implementer
ruled out (`$282E94`, `$282EAA`, `$282F5C`, `$2834EC`, `$2835BA`).
**Absence caveat:** these methods cannot see a computed or table-indirect jump
whose target is assembled at runtime. I found no such construct in these bodies,
but that is what I tried, not a proof.

### 3.4 Family H does not describe kind 26 - CONFIRMED

Kind 26's continuation `$28310E..$283146` is, in full: the `+$19` gate
(`$28310E tst.b $19 / bne`), `lea $a(A6),A6`, `move.l (A6),D0`,
`lea $6(A6),A0` (→ +$10), `addi.l #$14,D0`, `cmp.l (A0)+,D0` against the LIMIT,
`sub.l (A0),D0` (the span at +$14) on equality, `move.l D0,(A6)`,
`move.b (A0)+,(A0)+` (= +$19 ← +$18), `lea $36(A6),A6`, `dbra`. **That is all of
it.** No drift add, no `add.b` to +$1A or +$1B, no `bsr $284190`, no
`movem.w D2-D3,$1e`. Family H's five listed elements are five things kind 26
does not do.

Kind 27 (`$2831C4..$283256`) *does* match family H, element for element
(`$2831C8` the +$30 gate, `$2831CC/$2831D2/$2831D6` the +$28/+$2A drift,
`$2831DC` +$2C → `add.b D0,$1b`, `$2831F4` +$36 → `add.b D0,$1a`, `$28320C tst.w
D1 / beq` the conditional recompute). So the family label fits 27 and not 26.

`w27targets.py 283C8C` → exactly **1** reference in `$281000..$285000`, and it is
`$2830E6 bra.w $283c8c` - kind 26's. Confirmed independently. And
`$2830EA..$28310E` disassembles as nine bogus `ori.b #$xx,(a4)+` instructions
that are really nine longwords `$001C09D4 … $001C0C54`, spaced `$50` - the
sweep-runs-into-DATA trap, and the `$24` window abutting the continuation is
right.

---

## PRIORITY 4 - WHAT ELSE CHECKS THESE 37 BODIES? MEASURED: NOTHING NEW

**Measured, not quoted.**

1. **`src/mover.js` has exactly two callers in the repo**, and neither is the
   game: `games/ddpdoj/tests/mover.test.js:25` and
   `games/ddpdoj/tools/w26movergate.mjs:29`. A recursive grep of `src/`,
   `index.html` and `tools/` for `runMover` finds no other call site;
   `src/handlers.js:109` states outright that the per-frame integration
   (`runHandler` + `runMover`) is **W29**. So the whole bullet stack is dead code
   from `main.js`'s point of view: **no browser run, no publish gate and no
   scenario ever executes one of these 37 bodies.**
2. **The mover gate compares six fields only** -
   `tools/w26movergate.mjs:164-165`: `posA, posB, speed, dir, velA, velB` -
   so it is structurally blind to every sprite-only body (descriptor +$0A,
   renderOffs +$06, graphic +$0E), which is families A, B, C, K and kind 26.
3. **And the corpora do not contain the W27 kinds at all.** I parsed the live
   type word (`tw & $3F`, bit 15 set) out of every recorded mover corpus:

   | corpus | live-slot rows | distinct kinds |
   |---|---|---|
   | `w26-mover-invuln.tsv` | 485,422 | **8** - 3,4,5,6,7,12,13,19 |
   | `w26-mover-stage1.tsv` | 29,520 | **5** - 4,5,12,13,19 |
   | `w26-mover-val.tsv` | 2,503 | 2 - 12,13 |
   | `w24-mover-stage1.tsv` / `w24-mover-nofire.tsv` / `w26-mover-probe.tsv` | 0 | 0 |

   **517,445 live-slot rows across every corpus this project has recorded, and
   the set of behaviour kinds observed is exactly {3,4,5,6,7,12,13,19} - the
   eight W26 bodies.** Not one of W27's 29 bodies has ever appeared in a
   board recording. The stage-1 corpus's `+$22` values confirm it from the other
   direction: 6 distinct continuations, `$2824DC / $282598 / $282944 / $28299E /
   $282B64` and `$000000` (42 spawn-frame rows) - all W26.

### The answer, plainly

- **Bodies with a check other than a unit test written by the same wave: 8** -
  kinds **3, 4, 5, 6, 7, 12, 13, 19**, all W26, checked by the W26 mover gate
  against a Lua tap on the real cartridge. (Of those, 5 appear in the ordinary
  stage-1 corpus; the other 3 only in the *invulnerable* corpus, which
  `docs/knowledge/09` says is valid for coverage and not for characterising play.)
- **Bodies with none: 29** - every kind W27 ported: 0, 1, 2, 8, 9, 10 (=14, =15),
  11, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38. Their only check is `games/ddpdoj/tests/mover.test.js`, written by
  the wave that wrote the bodies, against the same reading of the same listing.

### The one new board-level fact I could produce

I ran the gate against the W27 tree (it only reads; nothing was written):

```
w26-mover-stage1.tsv  frames=1185  divergent=0 of  14,847 slot-steps
w26-mover-invuln.tsv  frames=6602  divergent=0 of 244,545 slot-steps
```

Read honestly, per `docs/knowledge/10`: **W27's 29 new bodies did not regress the
eight W26 bodies the corpora reach.** It is a statement about what W27 did not
break. It is **not** evidence about any body W27 added, and "0 divergent" must
never be quoted as though it were.

**Absence caveat:** I did not record a new corpus. I did not run MAME. What I did
was enumerate all six existing corpora completely. A corpus that reaches a W27
kind may be recordable - the invulnerable run already reaches 3 kinds the
scripted one does not - but none exists today.

---

## VERDICT

status: **DONE** - **APPROVE WITH FINDINGS.**

W27's transcription work holds up under every check I could apply. The four
self-reported surviving mutations (and the two further bolded-GREEN rows) are all
genuinely closed and each reddens exactly one test. All four recon corrections
are right against the listing, and the two absence claims survive a wider sweep
than the implementer ran. Nothing in `src/mover.js` needs changing.

The findings are all about **checks**, ranked most severe first.

### F1 - the coverage claim beneath all 37 bodies (severity: high)

**29 of the 37 bodies have exactly one check, and it was written by the wave that
wrote the body, from the same reading of the same listing.** Measured above:
517,445 live-slot rows across every recorded mover corpus contain kinds
{3,4,5,6,7,12,13,19} and nothing else; `runMover` has no caller in `src/`.
**Failure scenario:** a body is transcribed with a consistent misreading - the
port and its test agree, the suite is green, and the defect is undetectable until
W29 wires the mover into the frame loop and a human plays past it. This is
`docs/knowledge/10`'s exact shape ("a green test against a wrong transcription
means the test is broken"). W27 states this honestly in its own worklog; the
finding is that the numbers are now measured and worse than "not compared":
**the kinds have never been on the board at all.**
*Fix:* record a mover corpus that reaches W27 kinds before W29 ships the wiring;
extend `w26movergate.mjs`'s compared set to the sprite fields (+$06/+$0A/+$0E),
without which families A/B/C/K and kind 26 stay invisible even then.

### F2 - `background.test.js:339`: a check that round-trips its own constant (severity: medium-high)

`assert.ok(g.unportedLog.report().some((l) => l.includes('$28CB88')), 'and the
callee is COUNTED, **by address**')`. The note is filed under **`$2620B4`**
(`src/background.js:873`); `$28CB88` appears only inside its prose, and it is the
pointer **the test itself wrote into the synthetic ROM** at
`background.test.js:70`. So the check asserts that a value the test supplied came
back out of a string - `docs/knowledge/03`'s "two sides of a comparison must be
independently derived", violated - while its stated subject, the note's address,
is never examined. **Failure scenario:** change `note(0x2620b4, …)` to any other
address and the test stays green; the deferred-cue callee stops being counted
under its own address and nothing says so.
*Fix:* assert on `[...log.calls.keys()]` matching `/^\$2620B4 /` (anchored on the
key's address field), and check the `$28CB88` pointer separately if it is wanted.

### F3 - `initbody.test.js:59-60`: a loud-named-throw test that checks no name (severity: medium)

`assert.throws(fn, /UNPORTED.*not in the W23 stage-1 body table/)` - the only
assertion on the throw, and it pins no address. **Failure scenario:** mutate
`src/initbody.js:626` to `unreached(SOME_CONST, …)` and the test passes; a
player's crash report then names the wrong routine, which is the single thing
this whole throw mechanism exists to prevent. The identical property *is* checked
correctly one file over (`spawn.test.js:364`, `assert.equal(e.romAddress,
0x281000)`) - so the shape is understood in this codebase, just not applied here.
*Fix:* `(e) => e instanceof Unreached && e.romAddress === 0x281000`.

### F4 - `background.test.js:306` and `handlers.test.js:92`: notes matched by prose (severity: medium)

Both match a note by substring over the formatted key, and in both cases the
`what` **repeats the address** (`src/background.js:757-761` quotes `$261142`,
`$26C7F4`, `$26D254`; `src/handlers.js:88` begins `DAMAGE $286096`).
`handlers.test.js:92` searches for `286096` without even a `$`.
**Failure scenario:** refile either note under a different address and both tests
stay green, so the counted-subsystem ledger - the thing that makes an excluded
subsystem "excluded, not silent" - can drift without any check noticing.
*Fix:* match `/^\$261142 /` and `/^\$286096 /` on the key.

### F5 - `background.test.js:604-610`: a title that claims more than the body checks (severity: medium)

Titled *"a stage other than 1 is a LOUD THROW **BY ADDRESS**"*; asserts only
`e instanceof Unreached`. **Failure scenario, and it is the likely one:** the
test runs against a synthetic ROM, so an *unrelated* "outside every ROM window"
`Unreached` satisfies it exactly as well as the stage guard would. The test may
already be passing for the wrong reason today; nothing in it can tell.
*Fix:* pin the guard's address.

### F6 - `ship.test.js:305`: the distinction the neighbouring tests exist for (severity: low-medium)

`assert.throws(() => runOptionObject(g.ram, g.ctx), Unreached)` for "ONE held
frame is enough". Lines `:326` and `:331` in the same file distinguish
`ROM.optionSpawn` from `ROM.optionLaser` by address and explain at length
(`:317-323`) why the distinction matters. This test drops it.
**Failure scenario:** a port that wires the laser to the edge byte reaches the pod
spawn on a held frame; `:305` still passes.

### F7 - three low-severity address-blind sites (severity: low)

`ship.test.js:145,146,147` (three `ProtLatch` guards, class-only - a port where
all three threw one address passes) and `shots.test.js:46` (the straddling ROM
read, class-only; `:44` pins the address for the neighbouring case).

### F8 - `mover.test.js:521-524`: correct today, fails open (severity: low, note only)

The absence assertion filters note keys with `/27F8F8/i`. It is sound only
because `src/mover.js:302`'s prose happens not to repeat the address. If the
death-effect note is ever refiled or reworded the filter silently matches
nothing and the absence check passes while the effect is still spawned. Worth an
anchored `/^\$27F8F8 /`.

### What I looked for and did NOT find

- **No defect in `src/mover.js`.** Every constant, branch and field offset I
  re-derived from the listing (kinds 22, 24, 25, 26, 27, 29, 34 in full) matched
  the port.
- **No surviving mutation.** All six re-applied mutations bit, and each bit one
  test.
- **No further message-text identity assertion in `games/ddpdoj/tests/`** beyond
  the four in §1A - 43 sites enumerated, 25 sound by `romAddress`, 8 sound
  message-content checks on top of a `romAddress` check.
- **The `Unreached` class is DaiOuJou-only**: a grep of `games/batman/` finds no
  occurrence, so the ddpdoj sweep is the whole population for that class.
  **`games/gradius/` was NOT swept** - the brief forbids touching it while its
  implementer runs. If Gradius has an equivalent loud-throw class, this sweep
  should be repeated there.
