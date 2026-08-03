# W26 REVIEW -- the bullet MOVER `$281DDE` (per-frame pool drive) + handler fire wiring

status: **APPROVE with minor findings.**  The mover's load-bearing structure is
byte-faithful over its true span (re-derived independently from `maincpu.bin`
this review); the done-when is met (0 divergent of 244,545 slot-steps through
the midboss, 3 RED mutations); no regression (381/0/0 tests; W21/W25 gates
unchanged).  The four findings are all sprite/note cosmetics explicitly outside
the gate's compared set -- none touches position, velocity, kind or alive.
wave: 26. role: REVIEW (read-only; no `src/` edits, no commits).
date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER).

## METHOD

Independent capstone disassembly of `$281D9A..$282030` straight off
`tools/oracle/out/maincpu.bin` (`tools/oracle/w26rev_disasm.py`, written this
review; no reliance on prior art or on the impl worklog's prose).  Each of the
five paths, the window ladder, the global-kill gate, the bounds kill, the
sprite emit, the velocity recompute and the continuation dispatch were checked
instruction-by-instruction against `src/mover.js`.  The behaviour pointer table
`$282030` was dumped and the eight ported kinds confirmed; the kind 3/12/19
initialisers+continuations and the `$2820CC` muzzle helper / `$284190`
velocity entry were spot-checked.  The gate was then re-run by hand over both
the stage-1 and the invuln (midboss) corpora, with the three mutations.

## THE DONE-WHEN -- re-measured this review

`tools/oracle/w26mover.lua` taps the bullet driver `$281D9A` BEFORE
(`$81B40C` @ PC `$281DA6`, one insn before `bsr $281DDE`) and AFTER
(`$80AFE0` @ PC `$281DCE`, four insns after the mover returns), dumping the
whole pool both times so the spawn side cannot leak in.  The gate seeds the
port from BEFORE, runs `runMover` once, compares to AFTER.

```
CORPUS w26-mover-stage1.tsv   frames=1185  slot-comparisons=14847
RESULT divergent=0 of 14847 slot-steps  -> 100.0000 %
CORPUS w26-mover-invuln.tsv   frames=6602 slot-comparisons=244545   (reaches the MIDBOSS)
RESULT divergent=0 of 244545 slot-steps -> 100.0000 %

MUTATIONS (RULE 4 -- every check seen to fail):
  stage1:  velocity-stored-not-recomputed 136/14847   no-plain-move 14633/14847   break-kill 173/14847
  invuln:  velocity-stored-not-recomputed 3454/244545 no-plain-move 239907/244545 break-kill 3078/244545
  window-constant NOT ATTEMPTED (documented blind spot: spawn cap == move cap,
    so no slot can exist past the current cap -- the W21 spawn gate's blind spot)
```

The invuln run reaches the midboss (kind 6 = `$282620`, the midboss's own
bullet, was the one-kind addition that took the run from throwing on the
unported initialiser to 0 divergent).  The kind-6 continuation target-track
branch is dead in the corpus (`+$2C == 0` for all 32099 of its spawns), as the
impl worklog states.

## FAITHFULNESS -- the mover over its TRUE span

The mover is `$281DDE..$28202E`.  The `$282030` longword that capstone renders
as `ori.b #$4,-$5556(a0)` is the FIRST ENTRY of the behaviour pointer table,
not an instruction -- confirmed by dumping `$282030[kind]` for all 39 kinds
(kinds 14/15 alias to `$282840` = kind 10, matching the W21 note).  **No
fall-through is flattened** -- the project's #1 nemesis.  Every apparent
terminator was read past:

- **window ladder `$281DEA..$281E1E`**: `move.w #$45/$6d/$9f/$bd/$d1,D7` with
  `tst.w $81B414/6/8/A ; beq $281e54`.  `MOVER.iterCounts=[0x45,0x6d,0x9f,
  0xbd,0xd1]` and `moverIterCount` returns `iterCounts[step]+1` (dbra).  FAITHFUL.
- **per-slot dispatch `$281E54`**: `move.w (A6),D2 ; bpl $281e4a` (dead ->
  advance); `addq #1,$81B40C` (livecount); the global-kill gate; `move.w
  #$5180,D0 ; and.w D2,D0 ; bne $281ed6`; PLAIN fall-through.  FAITHFUL.
- **global-kill gate `$281E20`**: survive iff `$811F72!=0 && bit0 && $8130F8
  bit15 clear` (`bpl $281e6c` resume, else `$281e36` kill).  `driveSlot`
  encodes exactly this.  FAITHFUL.
- **PLAIN `$281E74`**: `move.l $1e(A6),D0 ; sub.w D6,D0 ; add.w D0,$4(A6) ;
  swap ; add.w D0,$2(A6)` -- integrate the STORED velocity, velB -= scroll.
  bounds `$c800`/`$9000`.  `plainPath` matches.  FAITHFUL.  (The "velocity is
  never stored" mantra describes the bit-7 family only; plain bullets genuinely
  fly on the stored vector -- the impl worklog's §"VELOCITY: STORED vs
  RECOMPUTED" is correct and is the trap this wave got right.)
- **DISPATCH `$281EEE`**: `add.w D6,$4` (undo); `bsr $284190` -> `movem.w
  D2-D3,$1e` (STORE); `jsr $282030[kind]`; cadence `$34/$9c`; advance inline
  (no move, no jmp).  `dispatchPath` matches.  FAITHFUL.
- **bit-7 RECOMPUTE `$281F3E`**: bounds FIRST, then `bsr $284190 ; add.w
  D2,$2 ; add.w D3,$4` (no store), emit, `btst #$6` -> transform or
  `jmp $22(A6)`.  bit-8 sub-path `$281F84` runs the initialiser.  FAITHFUL
  (transcribed verbatim; not exercised by stage 1 -- no bit-7 kind appears).
- **bit-14 `$281FA2` + bit-5 transform `$281FB4..$28202E`**: transcribed
  verbatim; not exercised by stage 1.  UNVALIDATED, named by the impl worklog.
- **kill = free**: `$281EC4 clr.w (A6) ; move.w #$ffff,$2(A6)` (+ advance).
  FAITHFUL (see F3 for a note-accounting nit on the shared `freeSlot`).

`$284286` sprite emit is byte-identical to the inline `$281E96..$281EB8`
(verified by disassembling both).  `$2820CC` muzzle helper and `$284190`
velocity entry are the W21 ports, called correctly (speed->D0, dir->D1, dA->D2
->velA, dB->D3->velB).  The kind 3/12 continuations' `animateRenderOffsWrap`
(including the wrap) is faithful.  **No fabricated reads**: the only
fabrication the project ever named here -- the W25 `fireGate267FC6` `$804000`
RNG -- remains an honest DEFERRED note in `handlers.js` (re-read this review);
W26 introduces no new fabrications.

## THE FIRE WIRING + NO REGRESSION

- `fireBullet` (`handlers.js`) is a thin wire to W21 `fire()`; the six
  handlers' direct fan calls stay `noteFan` (the aim+gate state machine is W27,
  correctly not faked).  The W26 diff to `handlers.js` is purely ADDITIVE
  (one import + one exported function + comments) -- it does not touch any
  handler body, so it cannot regress the handler gate.
- `ddpdoj` tests: **381 pass / 0 fail / 0 skip** (mover subset 11/0/0; the
  real-table tests run because `rip/port/player.tables.json` is present).
- W21 pattern gate: **0 divergent of 197 spawns**, kinds 7/39 -- UNCHANGED.
- W25 handler gate: **UNCHANGED from the W25 baseline** -- `$82` 0/204, `$8B`
  0/31476, `$10` 0/6390, `$11` 2221, `$05` 4123, `$07` 7900 (sum 14244, the
  exact W25 number; the `$11/$05/$07` divergences are the documented
  fire/state-machine + SPAWN-Y blockers, W26/W27).
- W26 `pgm.py` stages registered SKIP-if-corpus-absent (verified in the diff);
  the two mover stages invoke exactly the gate binary re-run green above.

## FINDINGS

### F1 -- MINOR: `spriteEmit()` swaps the renderOffs half-words
`src/mover.js:323-340`.  The port adds renderOffs' HIGH word to posB and its
LOW word to posA:
```
lo = u16(lo + ((ro >>> 16) & 0xffff));   // posB += renderOffs hi
hi = u16(hi + (ro & 0xffff));            // posA += renderOffs lo
```
but the ROM (`$284286`, and the byte-identical inline `$281E96`) adds the HIGH
word to posA and the LOW word to posB.  Tracing the swap idiom: after
`move.l (A1)+,D0` (D0=[posA:posB]) and `swap / add.w (A1)+ / swap / add.w
(A1)+`, the final D0 is [posA+rH : posB+rL] where rH=word@$6, rL=word@$8.  This
is INCONSISTENT with `muzzleAndSprite()` in the same file, which correctly
pairs renderOffs_hi (word@$6) with posA and renderOffs_lo (word@$8) with posB.
**Latent**: `spriteEmit` returns immediately when no `ctx.sprites` sink is
passed, and neither the gate nor any test passes one, so it is currently dead;
sprite fields are explicitly excluded from the gate's compared set.  Once a
rendering consumer is wired it would place every bullet sprite with its axes
swapped.  Fix: swap the two `ro` masks.

### F2 -- MINOR: kind 19 continuation omits the renderOffs wrap
`src/mover.js:590-611`.  The ROM `$282B7A cmpi.l #$1c1e38,(A6) ; bne ;
move.l #$1c1bf8,(A6)` wraps base+$A at `$1c1e38 -> $1c1bf8`, but the kind-19
continuation does `base+$A += $24` with no wrap.  The shared
`animateRenderOffsWrap` (which DOES wrap, and is used faithfully by kinds
3/4/5/6/12/13) is not used here.  **Latent**: base+$A is a sprite field, not
gate-compared; a kind-19 bullet animating ~30 frames would run its frame
pointer past the wrap into garbage in the port.  Fix: route the kind-19
animate through `animateRenderOffsWrap(ctx, base, 0x1c1bf8, +0x24, 0x1c1e38)`.

### F3 -- MINOR: `freeSlot()` over-notes `$27F8F8`
`src/mover.js:298-308`.  `boundsKill` and the bit-12 kill both call
`freeSlot()`, which emits the `$27F8F8` impact-pool-spawn note.  But the ROM's
bounds-kill and bit-12 kill target `$281EC4` (`clr.w (A6) ; move.w #$ffff,$2
(A6) ; advance`) -- NO `$27F8F8` call.  Only the global-kill gate path
(`$281E36`) calls `$27F8F8`.  **Note-only** (no bullet-state effect; no gate
checks note counts), but it inflates the `$27F8F8` count and misattributes the
effect spawn to paths that do not have it.  Fix: have `boundsKill` and the
bit-12 kill call `freeSlotNoEffect`, reserving `freeSlot` for the global-kill
path.

### F4 -- INFORMATIONAL: initialiser comments mislabel renderOffs/descriptor
`src/mover.js` (kinds 3/4/5/6/19 init blocks).  Several lines comment `+$0a`
as "renderOffs" (e.g. kind 19 `ram.setU32(base + 0x0a, 0x1c1b68); // renderOffs`),
but `REC.renderOffs = 0x06` and `REC.descriptor = 0x0a`.  The actual byte
writes (offset + value) are faithful to the ROM; only the comments swap the
field names.  Cosmetic; the layout constants in `REC` are correct.

## VERDICT

APPROVE.  The wave's central claim -- a byte-faithful mover driving 0
divergent of 244,545 slot-steps through the midboss with three RED mutations
-- holds under independent re-derivation.  The fall-through trap (the #1
nemesis) is clean: every path was read past its terminator and the true span
is respected.  No fabricated reads; the prior fireGate fabrication stays
honestly demoted.  The findings are sprite/note cosmetics outside the compared
set and do not block the done-when; F1/F2 are worth a cleanup pass before the
rendering wave wires a sprite sink.
