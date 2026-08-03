# W24 IMPL — the movement interpreter: $2638A6, the 13 opcodes, the velocity cache

status: **IN PROGRESS.** wave: 24 (plan W24)   role: implementer (sole `src/`
writer this wave). date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`-`$2Axxxx`) unless the line says otherwise. **No build-A address is
introduced anywhere in this wave.**

## THE SPEC (plan W24, verbatim)

> `$2638A6`, the 13 opcodes (12 escapes + `>= $C0` set-speed; 8 of 12 escapes are
> UNREAD — read them first, and one is a loop-back, so a partial interpreter runs
> off the end of a stream), the velocity cache invalidation, `$241812`
> direction+speed -> `$200920`. FIRST dump the byte-code streams ... *Done when:*
> the streams are dumped and inventoried (count, sizes); interpreter passes
> listing-derived unit tests; one scripted mover's position track compares at 0
> divergent over its whole life.

The recon (24-recon-movement.md, DONE) delivered the dump+inventory (163 streams
/ 3454 B; 13 opcodes; the dispatch table; the resource-resolution chain) and the
unit-test substrate. This wave PORTS the interpreter, WIRES it, and proves it
three ways: listing-derived unit tests, one mover's whole-life position track at
0 divergent, and the W23 spawn-stats gate re-closed (511 deferred fields ->
fewer divergent).

## STARTING STATE (what the salvage left)

A prior implementer session died to the usage limit mid-implementation. The
SALVAGE commit (53eff89) preserved:
- `games/ddpdoj/src/movement.js` (351 lines) — **an UNWired, UNVERIFIED draft.**
  Imported by nothing. The salvage message warns verbatim: *"Whoever picks it up
  should check every routine against the listing before wiring it in, because a
  plausible-looking draft that nobody verified is exactly the input the
  fall-through trap wants."*
- `tools/oracle/w24streams.py` (the dump script; runs, emits a SyntaxWarning).
- `assets/w24-movement/{stage1-streams.json, stage1-resource-1F.bin}` (gitignored).

So step 1 is NOT "trust the draft": it is to independently re-disassemble
`$263808` / `$2638A6` / `$2417DE` / the 12 escapes from `maincpu.bin` and check
every routine against the listing. Findings recorded below as they arrive.

## PLAN OF WORK

1. Re-derive `$263808`/`$2638A6`/`$2417DE`/12 escapes from the listing; verify
   (and correct) the draft `movement.js`.  [DONE-WHEN port item 1]
2. Wire: spawn walker resolves the stream cursor; init body calls
   `readMovementInit`; the handler step calls `stepMovement`.
3. Listing-derived unit tests over the 163 dumped streams (each opcode; loop-back
   does not run off the end).  [DONE-WHEN #1]
4. Mover-position gate: one scripted mover's whole-life position track at 0
   divergent vs the W17 corpus.  [DONE-WHEN #2]
5. Re-run `w23statsgate.mjs`: 511 deferred -> fewer divergent.  [DONE-WHEN #3]
6. RED mutation (break one opcode / velocity resolution), watch position diverge,
   restore, SHA-verify.
7. Regression: `node --test games/ddpdoj/tests/` (green, 0 skip); `pgm.py check`.
8. Commit incrementally via the hardened protocol; update this worklog.

## FINDINGS LOG (updated as they arrive)

### F0 — the draft was plausible and partly wrong (the salvage warning earned)
I re-disassembled `$263760..$263A0C` (free/init/interp/escapes), `$241790..`
(scroll comp + velocity) and `$241812` from `maincpu.bin` and diffed the draft
line by line. The draft parsed and read well; FIVE defects survived because
nobody had verified it (exactly the salvage's warning). All fixed this wave:

1. **`readMovementInit` bit-6 branch dropped the controller Y.** `$26381C
   move.l ($48,A5),($2,A6)` is a LONG copy: high word -> X, low word -> Y, THEN
   Y+=scroll. The draft set X from the high word but added scroll to the
   EXISTING Y, never writing the controller's low word. (Unused in stage 1 -- no
   stream sets bit 6 -- but RULE 6.) Fixed.
2. **`stepMovement` EXIT path crashed.** `runEscape` returns the `MOVE_EXIT`
   Symbol for escape #10; the code then fell through to `setU32(movement, Symbol)`
   -> TypeError. The two carrier streams (`$071`/`$072`) terminate on EXIT in the
   per-frame interpreter, so this DOES fire. Added `if (a0 === MOVE_EXIT) return
   true;`.
3. **Escape #0 (loop-back) wrapped the address to 16 bits.** `return u16(a0 -
   2*off)` truncates a 32-bit ROM address ($231860 -> $1860). `suba.w` is a
   32-bit address op (sign-extended word; 2*off <= 510 < $8000 so no sign issue).
   Fixed to `(a0 - 2*off) >>> 0`. (Loop-back is unused in stage 1; ported for
   the later stage that emits one.)
4. **`scrollCompensate` added the WRONG half of `$80b03c`.** `move.l / swap /
   add.w` adds the ORIGINAL HIGH word (after swap, the low half of the register).
   The draft read `$80b03e` (the low word) -- inverting the swap. The
   scroll-locked types `$8A`/`$8B` use this every frame, so it would drift their
   X position. Fixed to read `$80b03c`.
5. Minor: `cmpi.b #$80,($4,A6)` tests the HIGH byte of Y (big-endian), not the
   "low byte" the comment claimed; the redundant `setU8(counter)` before the
   `setU16` (the ROM writes a word). Comments/cleanup only.

Everything else in the draft verified faithful: the HEAD param/counter state
machine (incl. the counter-done "advance, don't apply the old heading" path),
the dirty/clean velocity cache, the SPEED/ESCAPE dispatch, escapes #1-#11, the
init Y-odometer `ror.w #7`, and `$2417DE`/`$241812` (D2->+$02, D3->+$04).

6. **`readMovementInit` referenced `op` out of scope (ReferenceError).** The HEAD
   terminator after the peek loop stores `op` as the heading (`$263874`), but the
   draft declared `const op` INSIDE the `for` block -- so after `break` it was
   gone and the first real init threw. (Caught by the unit tests, not by reading:
   a reminder that F0-F5 were found by listing-diff, but a 6th waited for the
   tests to exercise the path.) Hoisted to `let op;` outside the loop.

### F1 — resource #$1F resolved; the movement cursor is live
`resolveMovementPtr` returned a placeholder offset (W22's "W24, noted" sentinel).
Now reads `res = stageTableEntry(rom, stageIndex(ram)).res` and returns
`(res + aux[idx]) >>> 0` -- the IGS027A latch is a transparent indirection for
THIS resource (the bytes are plain ROM, recon §2), so the value is identical to
`readSlot($1F)` and no new protection work is needed. `installStage` optionally
`prot.setSlot(0x1f, res)` to keep the simulated latch faithful. Added the
`$231852..$2325D0` (3454 B) resource window to `export-tables.py` (gitignored
output); `player.tables.json` now carries 83 windows.

### F2 — `readInitPosition` wired (the W23 gate's door)
`initbody.js`'s `readInitPosition` was a noted no-op; it now calls
`readMovementInit(ram, rom, a5, ...)`. All 12 init-body call sites updated to
pass `rom`. With F1, a scripted spawn now resolves its stream and runs the full
init reader -- so the W23-deferred speed/heading/anim/flags overrides compute.

**Regression after F0-F2:** `node --test games/ddpdoj/tests/` = **343 pass,
0 fail, 0 skip** (one spawn-test updated: `resolveMovementPtr` no longer notes
`$246CAC` -- it resolves).

### F3 — DONE-WHEN #3: the W23 spawn-stats gate re-closed (511 -> 0 on scripted)
`w23statsgate.mjs` now drives the spawn walker per frame to resolve each
scripted spawn's movement stream, seeds the scratch record's cursor (+$12) and
param (+$0A), and lets the init reader override speed/heading/anim/flags. Result
over the W17-equivalent corpus (308 stage-1 (lf,type) spawns):

```
RESULT stats divergent: 0 across 308 spawns (100.0000 % match)
  W24 movement reader $263808 PORTED: 270 scripted spawns, their
    speed/heading/anim/flags are STRICT at 0 divergent. (W23 deferred 511 -> 0.)
  deferred (no script stream -- W25/W29 handler-spawned): 108 spd/hdg fields
  W24 position gap: 66 aim->bucket fields ($80/$82/$85/$88/$89)
  rank-counter / stale-bucket / out-of-scope: unchanged
RED [swap-tables]=820  [corrupt-hp]=111  [seed-wrong-stage]=14   (all RED)
```

A focused diagnostic confirmed the interpreter is correct: **270/270 scripted
spawns match the board's speed/heading at 0 divergent**. The 108 residual are
DEFERRED spawns (the validated walker -- 339=339 -- does not see them; they are
handler-enqueued via `$815EAA`, W25/W29), so their movement is not `$263808`'s
output and never was in W24's scope. The gate now classifies this honestly:
movement fields are STRICT for scripted spawns (closing W24) and a named
`deferred` gap otherwise (never a silence). The two `$88` hb14/hb16 anim-driven
hitbox residuals W23 accepted also closed (anim is now computed).

### F4 — a latent W23 precedence bug the gate exposed (init88 hitbox target)
Once the movement stream's flag escape cleared sub-record bit 5, the `$88`
init's anim-driven hitbox branch was entered for the first time and THREW:
`$14 is outside main RAM`. The line was `ram.setU16(a6 + an !== 0 ? S.hit14 :
S.hit16, ...)` which JS parses as `(a6+an)!==0 ? 0x14 : 0x16` -- writing to
address `$14` (operator precedence), not `a6 + (an!==0 ? hit14 : hit16)`. The
bug was dormant in W23 (bit 5 was set, branch skipped; the 2 `$88` divergences
were exactly this branch's absence). Fixed to `a6 + (an !== 0 ? S.hit14 :
S.hit16)`. This is W23-review F1's predicted "downstream wave trusting a spawned
enemy's fields" -- the movement anim made it live.
