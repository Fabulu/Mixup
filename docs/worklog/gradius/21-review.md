# Wave 21 review - Export the tables the handlers index, and the metasprite that vanishes

status: DONE

reviewer, 2026-08-02

Target commit f3497f0 (parent 9c893f0). READER: no src/ edits, no commits.

## What I am checking
1. The 25 anchors vs the actual ROM bytes (spot-check with an independent decoder).
2. Fall-through: read past every apparent end of the blocks and handlers cited.
3. Does any table the port indexes still fail to appear in the export?
4. Metasprite $A2: 18 records, present, correct bytes.
5. Are the new checks capable of failing? Break >= 2, watch red, restore, hash both ways.
6. Regression: 42 scenarios / 14,098 frames, display list.

## Findings (appended as learned)

### CONFIRMED GOOD (re-measured, not quoted)

* `prg.bin` sha1 `dff7bcc5...` == `Gradius (USA).nes`[16:16+32768]. Byte-for-byte.
* All **34** blocks in `assets/enemies/tables.json` (3,060 B) are byte-identical
  to `prg.bin` at their cited ranges; `fileOffset` is consistently `addr-$8000+16`
  (iNES header), same convention as the 9 pre-W21 blocks.
* All **25** W21 anchors: `anchor.rom == end` and `anchor.bytes` == the ROM at
  that address. No overlaps.
* **Independent block-start proof (my own recursive decoder, seeded from the
  reset/NMI/IRQ vectors + all 42 `$AE1C` entries + the 7 `$C439` arms +
  `$982F` + `$80D4`):** ZERO code bytes fall inside any of the 25 blocks, and
  the byte immediately BEFORE every block start is the last byte of a real
  instruction (20x `RTS`, 5x `JMP abs`). So no block starts too late.
  `$B461` (phaseB45C's anchor) is genuinely code - `LDA $044C,X / SEC /
  SBC $048C,X / STA $044C,X / BCS / DEC $042C,X / RTS`, a 16-bit subtract -
  it is just not reachable from my seeds.
* Metasprite `$A2`: `$8EE2 -> $95FB`, count byte `18`, `$95FB+1+72 = $9644` ==
  `$A3`'s pointer. Export has id 162 with 18 records, byte-identical to ROM.
* The `$A3` bound: `$8EE0` (= `$A1`'s slot) holds `$8EE6`; `$8EE6..$8EEE` is
  `02 04 DB 01 00 04 DD 01 08`, `$A1`'s 9-byte record; slots `$A4-$A8` read
  back as `$0402 $01DB $0400 $01DD $0108`. Confirmed exactly. Independent
  route: a full-PRG `LDA #imm -> STA $0120-$013F` scan names **no id above
  `$A3`**; the max is `$A3` at `$C14D`. Two routes, same answer.
* Record counts re-derived: old guard = **161**, new = **157**, unbounded =
  **170**. The delta is exactly `+$A2` and `-{$B8 $C9 $D4 $F2 $FB}`. The
  ledger's "162" was never a real export count.
* Explosion script 4 (`$AE8B`: `A2 6B 6A 69 68 6A 00`) overlaps script 2
  (`$AE8C`: `6B 6A 69 68 6A 00`). Confirmed.
* `$A592`: ROM index 17 = `F4 2A`, 18 = `F4 A0`, **19 = `F4 2A`**, 20 =
  `B3 2C`. The impl's correction (missing entry is index 19, not 17) is right
  and the census's "off by one from 17 up" was wrong.
* `node --test games/gradius/tests/`: **391 pass / 0 fail / 0 skipped**.
* Breaks watched red: delete `$A2` -> tablecoverage exit 1 + 3 node tests red;
  delete `walkerTables` -> tablecoverage names `$B6D2/$B6D9/$B6DD` + 4 node
  tests red. Assets restored, sha1 identical both ways.

### DEFECT 1 (moderate) - tablecoverage.py's root walk misses 5 of the 7
`$C413` arms, so 5 exported blocks can be DELETED and it stays exit 0.

`walk()` follows `JSR`/`JMP abs`/branches but not the inline `$83E4` dispatch.
From root `$C413` it hits `$C436 JSR $83E4` and then decodes the 22-byte table
at `$C439` as instructions (`STX $C4 / LSR $C5 / STX $C6 / LDA $53C5 / ...`)
until an illegal opcode at `$C44E`. Measured: of the seven arms
`$C486 $C546 $C686 $C5AD $C653 $C6DE $C429`, only `$C686` and `$C429` are
reached. `$C44F` is never reached.

Consequence, measured by deleting each W21 block one at a time and re-running
the tool:

    delete lateSpawnerDispatch  -> exit 0   *** did not notice
    delete approachStage0       -> exit 0   *** did not notice
    delete approachStage1       -> exit 0   *** did not notice
    delete approachStage3       -> exit 0   *** did not notice
    delete approachStage5       -> exit 0   *** did not notice
    (the other 20 -> exit 1, correctly)

Adding the 7 arms + `$C44F` as roots takes the base count 66 -> **81**; the 15
extra bases are `$C447 $C448 $C4F4 $C4F6 $C4F7 $C4F8 $C56D $C56E $C601 $C603
$C604 $C605 $C67A $C67B $C750`. All 15 happen to be exported, so there is no
gap in the shipped data today - but only because the implementer exported them
from the census, i.e. from the hand-maintained list the tool's docstring says
it supersedes. `20-plan-completeness.md` §1a now cites "**66** distinct PRG
bases (measured by tablecoverage.py, supersedes the census's 45 rows)" as THE
denominator. That number is under-measured; the closure is at least 81.

Second-order: the metasprite half filters on `base not in indexed`, so id
tables inside those five arms are never checked - including
`$C556/$C55C LDA $C56D/$C56E,Y -> $012C,X`. That is the exact `$A2` class of
bug the tool exists to catch.

Note it is NOT a free fix: with the arms added as roots the extent heuristic
over-claims 17 bogus ids (`$AA $AB $AE $AF $B0 $B3 $BA $BE $BF $C0 $CD $CE
$DC $E0 $EF $FE $FF`) out of the merged `$C58D`/`$C752` nibble streams, and the
tool goes red on all of them. The two W21 decisions (merge the streams into the
block; take the extent as "to the next indexed base or block end") interact.

### DEFECT 2 (moderate) - the anchor does not pin the extent; a block cited
SHORT passes the whole gate.

The guard asserts only "the bytes I claim are at the address I claim". It never
asserts the anchor is the start of a reachable instruction. So any address can
be anchored by copying the ROM bytes there.

Demonstrated: truncated `approachStage5` from `$C750-$C771` (34 B) to
`$C750-$C752` (3 B) - dropping the ENTIRE 32-byte packed-nibble spawn stream
`$C447[3]` points at, the thing the implementer added the block extension for -
and set `anchor = {rom: $C753, bytes: <the ROM's bytes at $C753>}`. Result with
the manifest sha regenerated (i.e. exactly what shipping a short citation in
`ENEMY_BLOCKS_W21` would look like):

    verify_assets.py  OK, 0 mismatches
    tablecoverage.py  exit 0
    node --test       391 pass, 0 fail

`tests/tables.test.js`'s `$C439` test does `assert.doesNotThrow(rom().read(s))`
for the four stream heads, which is why I had to keep `$C752` itself - one byte
of a 32-byte stream is enough to satisfy every check in the tree.

The `$B61E`/`$C686` catches the implementer reports are real, but they are
catches of a *mistranscribed anchor byte*, not of a *mis-cited extent*. The
five extended blocks (`approachStage0/1/3/5`, `stage2Object`) and the four
merged ones are exactly where extent is the risk, and extent is unguarded.
A guard that would work: assert the anchor address is an instruction start in a
recursive-decode closure (my check above already computes it).

### DEFECT 3 (minor) - `tablecoverage.py`'s id scan matches only opcodes
`B9`/`BD`, so the shared animator's metasprite bases are invisible to it.

Source (c) is `if rom.b(a) not in (0xB9, 0xBD): continue`. The `$B628` animator
that entries 26/28/29/38 share computes its id as `$B644 ADC $B651,Y` (opcode
`79`) falling straight into `$B647 STA $012C,X`. Four bases (`$8E $4A $42 $52`)
and their wrap runs are therefore never demanded. Likewise the `$BB0F` path
script's `AND #$0F / ADC #$96 / JMP $B647`.

Both are CLEAN today - I resolved them by hand:

    animRecords Y=0 base $8E wrap 8 -> $8E..$95   all exported
                Y=3 base $4A wrap 8 -> $4A..$51   all exported
                Y=6 base $42 wrap 8 -> $42..$49   all exported
                Y=9 base $52 wrap 6 -> $52..$57   all exported
    $BB83 low nibbles are {0..7} over all 26 records -> ids $96..$9D, all
    exported, and NONE exceeds the $A3 bound (the impl's open question 5 is
    answered: the computed path cannot escape the export).

### RE-MEASURED AND CORRECT (the rest of the impl's numeric claims)

* six W22 routines, my own JSR-following closure: `$AF2E`/`$AF88` -> `$B01D`
  + `$ECB2 $EFCD-$EFCF`; `$B311`/`$B3CB` -> `$B33B`; `$B6E1`/`$B747` ->
  `$B6D2 $B6D9 $B6DD`. Exactly as reported, all exported.
* `$B6A4 LDA $B6D2,Y -> $04EC,X/$040C,X`; `$B6C5 LDA $B6D9,Y -> $012C,X`
  (so `$B6D9` IS a metasprite row); `$B6CB LDA $B6DD,Y -> $0496,X`. 7+4+4 = 15.
* internal splits all add up: gateTiles 12+12, dwellByRank 7+7, animRecords
  4x3, midBossRank 8+8+2+8 = 26, coreTables 3+3+3+7+2+9+9+9 = 45, coreSpread
  4+4+8+8 = 24, pathScript 26x2+`FF` = 53, lateSpawnerDispatch 14+8 = 22,
  approachStage2 2+2+16 = 20, page600Object 32+7+7+7 = 53.
* `$C447` -> `$C526 $C58D $C633 $C752`; every stream head is inside its block.
  `$C893` -> `$C89B $C8F1 $C8BD $C8E0`; all four inside stage2Object.
* `$C67A..$C685` = `02 80 00 40 01 80 00 C0 12 40 28 0A` - the two unnamed
  bytes `12 40` confirmed, and they could be a FIFTH `(x,y)` pair for
  `$C664/$C66D LDA $C67A/$C67B,X` (X steps by 2). Extent unaffected.
* GATE, re-run by me end to end: `node --test` 391/0/0; `test-all.mjs`
  **GREEN, 10 passed, 0 failed, 0 SKIPPED**; 42 scenarios, 14,098/14,098
  frames, 0 failures. Display list summed from the 42 per-scenario lines:
  **902,272 slot-frames, 201,161 live, 0 Y mismatches, 0 content mismatches** -
  the implementer's numbers reproduce exactly.
* `deep-page4` still stops at `$B6E1` frame 2490, as it must.
* commit f3497f0 touches 9 files, ZERO under `assets/` or `rip/`.

### NOTES (not defects of this wave)

* `page600Object`'s "8 rows x 4 columns": the four `,X` loads make `$CA2B,X`
  the BNE gate, and `$CA2B+X` is `00` for X in {0,8,16,24} - consistent with
  FOUR rows of stride 8 as much as with eight of stride 4. The impl flagged
  this as unproven; it still is. The 53-byte EXTENT is right either way.
* `phaseB45C`'s anchor `$B461` is the weakest of the 25: the routine there
  (`LDA $044C,X / SEC / SBC $048C,X / ... / RTS`) is referenced by NOTHING in
  the PRG (`xref` empty, and the two bytes `61 B4` do not occur anywhere). It
  is an orphan. The 5-byte extent is corroborated by its byte-identical twin
  `phaseB42F`, whose anchor `$B434` IS dispatch entry 14.
* The plan's ledger cell "the `n > 16` guard dropped 9 ids and wrongly KEPT 5"
  overstates the loss: 8 of those 9 were above `$A3` and the new bound drops
  them too. The only id actually lost was `$A2`. 161 -> 157 is right.
* The SHARED `.git/index` currently stages DELETION of 8 gradius worklogs
  including `20-plan-completeness.md`, the five `20-recon-*.md` and
  `21-impl-tables-and-metasprite.md`. All are present on disk and in f3497f0's
  tree - the private-index commit was done correctly - but anyone who commits
  through `.git/index` will wipe them.

status: DONE

### BREAKS I RAN (every one watched, assets restored byte-identical)

RED, correctly:
1. delete metasprite `$A2` -> tablecoverage exit 1 naming both scripts; 3 node
   tests red.
2. delete `walkerTables` -> tablecoverage names `$B6D2/$B6D9/$B6DD`; 4 node
   tests red.
3. export-time anchor guard, end shifted one byte -> `ABORT: block
   walkerTables ends at $B6E0 but its anchor is $B6E1`.
4. export-time anchor guard, one anchor byte flipped -> `ABORT: block
   coreTables ... claims $B913 RTS ... but the ROM has 60 there`.
5. export-time overlap guard, midBossHits extended over coreTables ->
   `ABORT: enemy blocks midBossHits ($B852-$B8E8) and coreTables OVERLAP`.

GREEN when it should not be (the two findings above):
6. delete `approachStage1` (64 B) -> tablecoverage **exit 0**. Same for
   `approachStage0`, `approachStage3`, `approachStage5`, `lateSpawnerDispatch`.
7. truncate `approachStage5` 34 B -> 3 B with a forged anchor, manifest sha
   regenerated -> verify_assets OK, tablecoverage exit 0, **391/391 node tests
   pass**.

sha1 before/after, both files: `enemies/tables.json`
`0d72a933729f36247bc8fd18b6a58cdca14bcdc1`, `metasprites.json`
`54f19309d98883099995387d22e3d2fda341d574` - identical both ways.

Cosmetic: the anchor ABORT message prints `want` uppercase and `got` via
`bytes.hex(' ')` lowercase ("...i.e. 1F at $B6DA, but the ROM has 1c there").

### FULL RE-RECORD, BY ME

`python games/gradius/tools/oracle/scen.py` run to completion (exit 0), then
`node games/gradius/tools/test-all.mjs` against the fresh recordings:
**GREEN - 10 passed, 0 failed, 0 SKIPPED**; 42 scenarios,
14,098/14,098 frames, 0 failures; display list re-summed from the 42
per-scenario lines: **902,272 slot-frames, 201,161 live, 0 Y mismatches, 0
live-slot content mismatches.** Identical to the pre-re-record run and to the
implementer's figures.

### VERDICT

**The shipped DATA is correct.** All 34 blocks byte-identical to `prg.bin`, all
25 anchors true, no overlaps, no code inside any block, every block start
immediately after a real terminator instruction, metasprite `$A2` present with
all 18 records byte-exact, the `$A3` id bound proven twice, `$A592` = 21 with
the missing entry at index 19. No table any of the 42 handlers or the 7 `$C413`
arms indexes is unexported except the two named `KNOWN_GAPS`. Gate green after
a full re-record.

**Two of the CHECKS are weaker than claimed** (defects 1 and 2 above), and one
ledger number in `20-plan-completeness.md` ("66 distinct PRG bases", "64
exported") is under-measured - the closure with the `$C439` arms as roots is
at least 81. Neither hides a real gap today; both are exactly the "check that
cannot fail" the project keeps finding, and this makes seven and eight.
