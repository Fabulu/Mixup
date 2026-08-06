# 111 -- IMPL: the BEE (yellow medal), pool A's reserved ten

status: **DONE.** opened 2026-08-06, closed same day. wave: 111. role: IMPL
(the only writer of `games/ddpdoj/src/` this wave). target: `ddpdojblk`
VERSION-B.

The recon is W110 (`110-recon-medals-bee-port.md`, DONE). This wave ports the
bee: allocator, fill, driver, body, clear, and two wires.

---

## 0. PREMISE CHECK -- five claims, FOUR hold, ONE corrected

The brief asked me to verify five claims. Four hold exactly. One is corrected:

| claim | `[M]` this wave | verdict |
|---|---|---|
| handler8A ported, death arm notes $27F92A at handlers.js:2088 | line 2088: `u?.note(0x27f92a, ...)` | CONFIRMED |
| $286128 = scoreByMask in score.js:770 | line 770: `export function scoreByMask(ram, d0, d1)` | CONFIRMED |
| impactCollisionBlock at damage.js:443 is block 3 | line 443: `function impactCollisionBlock(ram, box, d7)` | CONFIRMED |
| type5.js lists call #4 $27F95A at index 3 as a counted note | line 160: `0x27f95a` at calls[3], not in TYPE5_PORTED | CONFIRMED |
| **block 3 will flag bees for collection with zero port work** (W110 sec 1.4) | **WRONG: block 3's inner scan is capped `idx < 70` (damage.js:451); bees live in slots 70-79 at $817DC6. The ROM has NO slot cap -- `dbra D6,$244E12` walks by live count only.** | **CORRECTED: cap widened to 80** |

The scan bound `idx < 70` was a port-added safety cap matching the general
arena. The ROM walks all 80 slots (general + reserved ten) as one contiguous
array. Without the fix, the bee is invisible to collision and cannot be
collected. This is the single premise correction.

### Additional finding: $81293C IS the no-miss flag

`[M]` writer scan of the image: `$81293C` has exactly one build-B writer,
`$249FC8 addq.w #2,$81293C` inside the hit path `$249F8A`, and one build-B
clear, `$25314A clr.w $81293C` (stage init). It is the per-player "got hit
this stage" counter: 0 = no-miss. The bee's x2 gate at `$27FC04 tst.w D3`
(D3 = $81293C) tests it directly. **So the x2 + cursor ratchet CAN ship**
(the brief permitted it if identified), with the BCD overflow bug faithfully
transcribed.

### Additional finding: the "flat award" is actually two paths

The score award at `$27FBEE` has TWO paths, gated on D4 (chain meter) and D5
(chain hit count):

* **CHAIN path** `$27FC3A`: the BCD digit-multiply. Calls `$286128` once per
  BCD digit of D5, shifting D0 left one digit each outer pass. Awards
  `base x chain_hits`.
* **FLAT path** `$27FC5E`: calls `$286128` ONCE. Awards `base x 1`.

Both call `$286128` (scoreByMask), NEITHER ticks the chain (no `$28615E`).
The brief's "flat award only" was misleading but the addresses it listed
(`$27FC42` the digit-multiply) are the chain path. Both are transcribed.

---

## 1. WHAT PORTED (in ROM order)

1. **$27F87C pool-A clear**: `$6E7` words from `$8171BE`, covering all 80 slots
   plus the seven trailing words (`$817F7E` live count, `$817F80` bee count,
   `$817F82` cursor, `$817F84..$817F8A`). Wired at `rebuildWorld25FD38`
   (stageend.js) next to `clearItemPool`.
2. **$27F92A reserved-ten allocator**: 10 slots at `$817DC6`, returns a free
   one, bumps `$817F7E`. Range-checks D0 (kind) to index 1 ($04) or 16 ($40),
   THROWS on anything else (the REFUSAL of the 18 non-bee kinds).
3. **$280B3E fill**: 22-byte template from `$280EB0`, position from carrier +
   scroll, the `+$1A`/`+$1B` skip (`addq #2,A0`), layer-table write to
   `($28,A6)` from `$280BB6`, fill hook `$280CEE` (sets `+$1E = $9601`).
   Off-screen-on-spawn abort (`$280B2A`: undo count bump, free slot, return).
4. **$27F95A driver**: live-count walk over 80 slots, scroll (`$813176` to
   `+$04`), 5-bit kind mask `$7C`, stride-4 dispatch through `$27F99E`.
   Range-checks the table to 20 entries, THROWS on 20+.
5. **$27FACC bee body**: `btst #0` (collected), `btst #$C` (P1 touch), `btst
   #$B` (P2 touch) dispatch; idle step `$27FC8C` (blink `$1BCA34`/`$1BCA80`
   at 20 Hz, off-screen free, kind-1 emit through `($28,A6)`); collect arms
   `$27FB6C` (P1) / `$27FAE6` (P2) with the flat + chain-multiply score
   award through `$286128`.
6. **x2 + cursor ratchet**: `$27FC08 bset #$5` / `$27FC0C addq.w #4,$817F82`,
   gated on count==10 AND `$81293C==0`. The bug `$27FC22 add.l D0,D0`
   transcribed faithfully (binary double on packed BCD).

### REFUSED (loud named notes/throws)

* **The gauge add** `$27FBA2..$27FBDE` (P1, writes `$81B64A`) and
  `$27FB1C..$27FB68` (P2, writes `$81B64C`): rank accumulators. Calls
  `$287682` (undecided). Refused like W61's hyper-stock.
* **Kind-16 flying arm** `$27FCEA`: REFUSED with a named throw. Stage-1 use
  unknown (no pool-A allocation site passes D0=$40). Transcribed the fork
  (`moveq #$4 / and / eor / bne`); kind 1 falls through to the emit.

---

## LOG

- opened IN PROGRESS. Read W110 (full), CATCHUP, HANDOVER. Premise check: five
  claims verified against source and ROM. Four confirmed; one corrected (block 3
  idx < 70 cap, see sec 0).
- `[M]` disassembled all bee routines from the image: $27F87C (clear), $27F92A
  (allocator), $280B3E (fill), $27F95A (driver head + dispatch), $27FACC (body),
  $27FC8C (idle step), $27FBEE (score award), $27FC7C (off-screen free), $27FCEA
  (kind-16 arm). The fill hook $280CEE, the template table $280E4A, the layer
  table $280BB6, the fill hook table $280BCE, the base ladder $27FD22.
- `[M]` $81293C writer scan: one build-B writer ($249FC8 addq.w #2, in hit path
  $249F8A), one clear ($25314A clr.w, stage init). IS the no-miss flag. Shipped
  the x2 + cursor ratchet with the BCD overflow bug faithfully transcribed.
- Wrote `src/bee.js`: POOL_A constants, BEE_TEMPLATE (22 bytes hardcoded from
  image), BASE_LADDER (10 BCD longs), LAYER_EMITTERS (6 stubs), DISPATCH (20
  entries). allocBee27F92A, fillBee280B3E, runPoolADriver, beeBody27FACC,
  collectArm, scoreAward27FBEE, idleStep27FC8C, offscreenFree27FC7C, clearPoolA.
- Template data ($280E4A/$280EB0/$280BB6/$280BCE) is NOT in an exported ROM
  window. Transcribed as constants (cited to the image) rather than modifying
  tools/export-tables.py (outside src/ scope). Same approach items.js takes for
  its ANIM_LISTS.
- Wired handlers.js:2088 (allocBee27F92A replaces the note), type5.js
  (impactDriver constant + TYPE5_PORTED + case at #4), damage.js:451 (idx < 70
  -> idx < 80 + comment update), stageend.js:168 (clearPoolA next to
  clearItemPool). Exported impactCollisionBlock for testing.
- Wrote tests/w111bee.test.js: 10 tests covering the four must-fail checks, the
  x2 bug, the refusal, the clear, and the flat award. All pass.
- RED -> GREEN verification: each must-fail check was seen failing during
  development (wrong box math, wrong accumulator offset, wrong off-screen
  boundary, syntax errors) and fixed to green.
- Gates: 1221/0/0 (was 1211/0/0; +10 new tests, 0 fail, 0 skip).
  bosscoverage 103/0/8 (unchanged). publish --dry running.

status: **DONE**
