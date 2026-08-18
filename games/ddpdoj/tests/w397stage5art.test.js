// ===============================================================================================
// W397 -- THE FOUR CONSTRUCTORS INTERNAL STAGE 4 DRAWS WITH, AND THE PICTURES BEHIND THEM.
// THE LAST BGELEM TABLE.
// ===============================================================================================
//
// UNIT. `$2622F2`'s table. Internal stage index 4 (human Stage 5) has FOUR background-element
// constructors and `src/background.js` carried NONE of them. `tools/export-web.mjs` had four
// BGELEM art arms filtering `stage === 0`, `1`, `2` and `3`; nothing looked at this table at all,
// so `$3053A0 $305D04 $307388 $31975C` were in no shard. That is W86's BLACK TERRAIN for the
// fifth and last time.
//
// **THE BAR IS THE SHEET.** SECTION 3 reads `assets/spr/mask.shard11.u16.gz` back and compares it
// WORD FOR WORD against `rip/rom/cave_b04401w064.u1` -- 12,624 words of real mask data at the
// packed offsets the manifest publishes.
//
// **WHERE THE BRIEF IS WRONG, from the bytes:**
//
//   1. "Four entries, bounded by the pointer array itself: ($262302 - $2622F2) / 4 = 4. Verify
//      that." The COUNT is right and the ARITHMETIC is right, but the brief leaves the impression
//      that this is the same kind of bound W394/W395/W396 used. IT IS NOT, and that is the one
//      structural thing about this table. Those three arms each read `$262302 + n*4` bounded by
//      `$262302 + (n+1)*4`. **THERE IS NO ENTRY 5.** The array holds exactly five longwords and
//      `$262316` is the first instruction of the slot-clear routine -- `41F9 008131C8`,
//      `lea $8131C8,A0`, followed by `303C 0081` / `30FC 0000` / `51C8 FFFA`, the 130-word clear
//      `backgroundInit` transcribes. So the bound is the ARRAY'S OWN BASE, and the only statement
//      of that base in the cartridge is `$262328 41FA FFD8 lea (-$28,PC),A0` -- TRAP 4, target =
//      the EXTENSION WORD's address plus the displacement, `$26232A - $28 = $262302`. The arm
//      decodes that instruction and reads the array THROUGH its target rather than comparing it
//      to a constant. SECTION 1 and SECTION 6's first two tests.
//   2. "This table -> reportedly `$23DEFC` again." TRUE, verified on all four at `upd+$2E`. But
//      the brief then says "the byte at `upd+$0C` is the only tell" without saying which byte
//      this table carries, and the answer is the combination it does not predict:
//
//                            upd+$0C branch      upd+$2E emitter
//          internal stage 2  6E00 bgt.w          $23DEFC  bucket 1
//          internal stage 3  6C00 bge.w          $23DF2A  bucket 2
//          THIS TABLE        6C00 bge.w          $23DEFC  bucket 1
//
//      **THAT PAIR EXISTS IN NEITHER NEIGHBOURING BLOCK.** A row copied from W394's fourteen
//      would carry the right bucket and the wrong branch; a row copied from W396's seven would
//      carry the right branch and the wrong bucket. Both bytes are decoded on all four here and
//      both are guarded in the exporter. SECTION 1, SECTION 6.
//   3. "**Check whether THIS table has duplicates before assuming four-distinct**, and state the
//      count you measured." Measured: FOUR entries, FOUR distinct `data`, FOUR distinct `upd`.
//      No duplicate pair, so W395's `distinct === entries` rule happens to hold here -- and it is
//      asserted as a MEASUREMENT of this table rather than inherited from that arm, which is why
//      SECTION 6 ablates it in both directions (a shared descriptor AND a shared updater).
//   4. "Also check for a **complex entry**." None. All four install the updater at their own
//      `ctor+$1E`, all four updaters are the $32-byte common shape with the `4E71` filler at
//      `+$32`, and no `move.l` in any of the four points at an animation table. Four rows, four
//      streams, nothing hidden.
//   5. "`export-web.mjs` will need a fifth arm." True, and it is not the only edit: the bundle's
//      stream count moves in ELEVEN test files, shard 11's row moves in `tools/webgate.mjs`, and
//      `tests/w395stage2art.test.js` and `tests/w396stage4art.test.js` SECTION 4's bundle-wide
//      totals move by construction. All named in the wave report.
//   6. **THE ONE THING THE BRIEF ASKS FOR THAT NO RUN CAN WITNESS** -- AT W397. The port's Stage-5
//      background VM could not be started at all: `backgroundInit`'s 15-column pre-fill reads
//      `$22D770`, stage 5's map column stream, and that address was in NO exported ROM window. So
//      nothing in this file claimed a scroll script had requested one of these four. SECTION 5
//      said exactly what it ran and exactly what it did not -- trap 23, stated rather than
//      papered over.
//      **W398 DECLARED `$22D770 + $2B70` AND THE LIMIT IS GONE.** SECTION 5's control is inverted
//      in place (`assertStage5VmNowStarts`) and `tests/w398stage5map.test.js` SECTION 2 witnesses
//      all four of these rows spawning through op $10 at frames 1,185 / 1,665 / 2,305 / 6,769 of
//      a cold init. Nothing else in this file moved: this paragraph and that one assertion are
//      the whole of it, and every SECTION 6 ablation is an untouched witness.
//
// SECTION 1  the four units, decoded byte by byte (no test of its own -- see the block there)
// SECTION 2  THE LEDGER and THE OFFSETS: all four in the bundle, inside shard 11's span
// SECTION 3  **THE PIXELS**, compared against the mask ROM word for word
// SECTION 4  BEFORE AND AFTER, COUNTED: 4,263 -> 4,267 streams, 818 -> 822 on shard 11
//            (and, since W414 D51, + 24 more on shard 11 -- a separate named term)
// SECTION 5  THE PORT: the driver resolves all four, stages all four into BUCKET 1, and the
//            `6C00` byte is made VISIBLE at the despawn edge -- plus, since W398, the fact that
//            the Stage-5 VM now starts at all
// SECTION 6  ABLATED FROM THE IMAGE -- twelve guards, twelve throws, each named by address, and
//            the no-new-window statement, inside the first of them
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS } from '../src/spritequeue.js';
import { BGELEM_HANDLERS, BGRAM, BgVram, ESLOT, backgroundFrame, backgroundInit }
  from '../src/background.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ROOT = here('..');
const IMAGE = here('../tools/oracle/out/maincpu.bin');   // the image export-web.mjs itself reads
const TABLES = here('../rip/port/player.tables.json');
const MANIFEST = here('../assets/manifest.json');
const MASKROM = here('../rip/rom/cave_b04401w064.u1');
const EXPORTER = here('../tools/export-web.mjs');

const NEED = [IMAGE, TABLES, MANIFEST, MASKROM, here('../assets/spr/streams.u32.gz'),
  here('../assets/spr/mask.shard11.u16.gz')];
const MISSING = NEED.filter((p) => !existsSync(p));
const SKIP = MISSING.length === 0 ? false
  : `${MISSING.map((p) => path.basename(p)).join(', ')} absent -- run `
    + 'tools/export-tables.py then tools/export-web.mjs. THIS IS A SKIP, NOT A PASS.';

const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const i16 = (v) => (v << 16) >> 16;

const S4 = BGELEM_HANDLERS.filter((h) => h.stage === 4);
const S2 = BGELEM_HANDLERS.filter((h) => h.stage === 2);
const ELEM_TABLE_PTRS = 0x262302;   // ...as the `lea` below states it, never as a typed bound
const PTRS_LEA = 0x262328;          // $262328 41FA FFD8 lea (-$28,PC),A0
const STAGE4_TABLE = 0x2622d6;      // internal stage 3's, W396's -- here only the near bound
const STAGE5_TABLE = 0x2622f2;      // internal stage 4's: THE UNIT
const SLOT_CLEAR = 0x262316;        // ...and what sits immediately after the pointer array
const STRUCT_SHARD = 11;

/** The exporter's own numbers, MEASURED at the commit before this wave's arm existed -- the
 *  values the shipped `assets/manifest.json` carried with FOUR BGELEM arms instead of five. */
const BEFORE = Object.freeze({
  streamCount: 4263, shard11Streams: 818, shard11MaskLen: 1153740, shard11ColLen: 3219388,
  maskUsed: 2430822,
});

/** [M] the extents the mask ROM's own chain gives, by id, via `src/render/spritedir.js`
 *  `streamExtent`. All four distinct, so all four are terms in the sum. */
const EXTENT = [2402, 5762, 722, 3746];
const DISTINCT_WORDS = 2402 + 5762 + 722 + 3746;          // 12,632

/** W414 (docket D51) put TWENTY-FOUR more streams into shard 11: pool-A kind index 2's
 *  own sixteen-frame animation $1BE2CC..$1BE5D8 (stride $34, 50 mask words each = 800)
 *  and the eight-frame collected popup $1E179C..$1E1978 (stride $44, 66 each = 528).
 *  [M] 800 + 528 = 1,328 mask words and 2,327 colour words.
 *
 *  IT IS A SEPARATE TERM AND `BEFORE` IS NOT REWRITTEN. `BEFORE` is the tree W397
 *  measured; folding a later wave's art into it would erase this file's own claim and
 *  leave "grew by exactly these four" true of a number nobody can check. Every total
 *  below is therefore W397's four PLUS this, and each addend names its own wave. */
const W414 = Object.freeze({ streams: 24, maskWords: 1328, colWords: 2327 });

// W417 ships pool-A kind index 3's OWN sixteen-frame animation ($1BE94C..$1BF4C8, stride $C4)
// in the same wave as its body $27FED2 -- SIXTEEN streams, all new, all on shard 11.  [M] the
// bundle diff over the export is `4,291 -> 4,307` with 16 added and 0 removed, and shard 11 is
// the only shard whose stream count moves.  Its term is separate and named, so this test still
// says what its own wave did.
const W417 = Object.freeze({ streams: 16, maskWords: 3104, colWords: 9888 });

// -------------------------------------------------------------------------- the bundle, decoded

/** `spr/streams.u32.gz` is `planes-delta-1`: three planes of `streamCount` entries, planes 0 and
 *  1 first-differenced and accumulated with `>>> 0`, plane 2 raw. Entry i is
 *  `[romOffs, packedBase, maskWords]`. */
function bundle() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.spr.streamsFormat, 'planes-delta-1',
    'a bundle written by another encoder is refused by NAME rather than decoded to nonsense');
  const raw = gunzipSync(readFileSync(here('../assets/spr/streams.u32.gz')));
  const flat = new Uint32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const n = manifest.spr.streamCount;
  const rows = new Map();
  let offs = 0, base = 0;
  for (let i = 0; i < n; i++) {
    offs = (offs + flat[i]) >>> 0;
    base = (base + flat[n + i]) >>> 0;
    rows.set(offs, { offs, base, maskWords: flat[2 * n + i] });
  }
  return { manifest, rows, shard: manifest.spr.shards[STRUCT_SHARD] };
}

// ===============================================================================================
// SECTION 1 -- the four units, decoded rather than pattern-matched.
//
// **THIS SECTION HAS NO `test()` OF ITS OWN, AND THAT IS DELIBERATE**, for the reason W395's and
// W396's SECTION 1 give: its assertions are pure cartridge truth, they held before this wave, and
// a test that cannot go red without its fix is trap 21. They are the POSITIVE CONTROLS of SECTION
// 6's ablations -- the un-ablated family property stated first, then the byte that breaks it --
// so they are asserted inside tests that ARE red without the arm.
// ===============================================================================================

/** The `$1E`-byte constructor: five instructions with the `4E75` AT ctor+$1C (trap 5). */
const CTOR_UNIT = 0x1e;
/** The `$34`-byte updater unit: `$32` of code plus the `4E71` filler word at +$32. */
const UPD_UNIT = 0x34;
/** ...and the whole element: constructor + updater + the `4E71` at ctor+$50. */
const ELEM_UNIT = 0x52;

/** THE BOUND, FOUND IN THE CODE (trap 8), and the one thing about this table that no earlier
 *  BGELEM wave had to deal with. */
function assertFourEntries() {
  assert.equal(S4.length, 4, 'nothing carried a `stage: 4` row before this wave');
  // `41FA FFD8 lea (-$28,PC),A0` -- TRAP 4. The target is the EXTENSION WORD's own address plus
  // the displacement, NOT the opcode's. $26232A - $28 = $262302.
  assert.equal(w(PTRS_LEA), 0x41fa, '$262328 is `41FA lea (d16,PC),A0`');
  assert.equal(w(PTRS_LEA + 2), 0xffd8, '  ...with displacement $FFD8 = -$28');
  assert.equal(PTRS_LEA + 2 + i16(w(PTRS_LEA + 2)), ELEM_TABLE_PTRS,
    '  ...so the pointer array is at $262302, stated by the instruction that reads it. TRAP 4: '
    + 'the base is the extension word\'s address $26232A, never the opcode\'s $262328');
  // ...and the array is FIVE entries, because what follows entry 4 is code. This is not "the
  // absence of a sixth entry": it is the first instruction of the routine `$262328` belongs to.
  assert.equal(l(ELEM_TABLE_PTRS + 4 * 4), STAGE5_TABLE, '$262302 entry 4 = $2622F2, THE TABLE');
  assert.equal(w(SLOT_CLEAR), 0x41f9, '$262316 is `41F9 lea (xxx).l,A0`, an INSTRUCTION');
  assert.equal(l(SLOT_CLEAR + 2), 0x8131c8, '  ...`lea $8131C8,A0`, the element slots');
  assert.equal(w(SLOT_CLEAR + 6), 0x303c, '  ...then `303C move.w #imm,D0`');
  assert.equal(w(SLOT_CLEAR + 8), 0x0081, '  ...#$81 = 129, and TRAP 2 makes that 130 words');
  assert.equal(w(SLOT_CLEAR + 10), 0x30fc, '  ...`30FC move.w #imm,(A0)+`');
  assert.equal(w(SLOT_CLEAR + 14), 0x51c8, '  ...and `51C8 FFFA dbra D0` closing the clear -- '
    + 'which is the 260-byte loop `backgroundInit` transcribes, so $262316 CANNOT be a sixth '
    + 'pointer and the array ends at $262316');
  assert.equal((SLOT_CLEAR - ELEM_TABLE_PTRS) / 4, 5, 'the array is FIVE longwords: internal '
    + 'stages 0..4, and internal stage 4 is the last');
  // THEREFORE the table is bounded by the array itself, and the count is a subtraction.
  assert.equal((ELEM_TABLE_PTRS - STAGE5_TABLE) / 4, 4,
    'so ($262302 - $2622F2) / 4 = FOUR entries. W394/W395/W396 each took `entry n+1` as the '
    + 'bound; this table has no entry 5 and takes the ARRAY\'S OWN BASE');
  assert.equal(l(ELEM_TABLE_PTRS + 3 * 4), STAGE4_TABLE,
    '...and entry 3 is still $2622D6, W396\'s table, which this one begins immediately after');
}

function assertConstructors() {
  assertFourEntries();
  for (let i = 0; i < S4.length; i++) {
    const h = S4[i];
    const tag = `$${h.ctor.toString(16).toUpperCase()} (id ${i})`;
    assert.equal(h.id, i, `${tag}: row i carries id i -- op $10 indexes this table by id`);
    assert.equal(l(STAGE5_TABLE + i * 4), h.ctor, `${tag}: the table's own cell names it`);
    // `2D7C <data> 0010` -- move.l #imm,($10,A6). The descriptor is read out of the instruction
    // that writes it, never from a table of its own.
    assert.equal(w(h.ctor), 0x2d7c, `${tag}: opens \`move.l #imm,($10,A6)\``);
    assert.equal(w(h.ctor + 6), 0x0010, '  ...displacement $10, the `data` field');
    assert.equal(l(h.ctor + 2), h.data, '  ...and its immediate IS the registry `data`');
    // `3D7C <yPos> 0014` -- move.w #imm,($14,A6).
    assert.equal(w(h.ctor + 8), 0x3d7c, `${tag}: then \`move.w #imm,($14,A6)\``);
    assert.equal(w(h.ctor + 0x0c), 0x0014, '  ...displacement $14');
    assert.equal(w(h.ctor + 0x0a), h.yPos, '  ...and its immediate IS the registry `yPos`');
    // `2D7C <upd> 0008` -- move.l #imm,($8,A6). THE UPDATER IS INSTALLED, not implied by
    // adjacency -- W396's id 6 proved a constructor can install one that is not the code
    // following it, so it is read out of ctor+$10 here as well.
    assert.equal(w(h.ctor + 0x0e), 0x2d7c, `${tag}: then \`move.l #imm,($8,A6)\``);
    assert.equal(w(h.ctor + 0x14), 0x0008, '  ...displacement $8');
    assert.equal(l(h.ctor + 0x10), h.upd, '  ...and its immediate IS the registry `upd`');
    // ...and on THIS table it happens to also be ctor+$1E, for all four. Stated, not assumed.
    assert.equal(h.upd, h.ctor + CTOR_UNIT, '  ...which here is also ctor+$1E');
    // TRAP 3, THE OTHER WAY ROUND FROM W396: every entry here writes the `kind` BYTE at $D.
    // Internal stage 3's id 6 writes a WORD at $C covering $C and $D both; nothing here does,
    // so no row is `kindWord`.
    assert.equal(w(h.ctor + 0x16), 0x1d7c, `${tag}: closes \`move.b #imm,($D,A6)\``);
    assert.equal(w(h.ctor + 0x1a), 0x000d, '  ...displacement $D -- the kind byte alone');
    assert.equal(w(h.ctor + 0x18), h.kind, '  ...and its immediate IS the registry `kind`');
    assert.ok(!h.kindWord, '  ...and the row is NOT `kindWord`');
    // TRAP 5: the `4E75` sits AT the last address, so the constructor is $1E bytes, not $1C.
    assert.equal(w(h.ctor + 0x1c), 0x4e75, `${tag}: \`4E75 rts\` AT ctor+$1C`);
    // ...and the whole $52-byte unit closes with the `4E71` filler.
    assert.equal(w(h.ctor + 0x50), 0x4e71, `${tag}: \`4E71 nop\` filler at ctor+$50`);
  }
  assert.deepEqual(S4.map((h) => h.kind), [0x17, 0x17, 0x17, 0x17],
    'all four are kind $17 -- internal stage 2 was $16 throughout and internal stage 3 was mixed');
  assert.deepEqual(S4.map((h) => h.ctor), [0x2631d4, 0x263226, 0x263278, 0x2632ca]);
  assert.deepEqual(S4.map((h) => h.data), [0x3053a0, 0x305d04, 0x307388, 0x31975c]);
  // The four constructors are byte-identical apart from three fields. Stated as a byte-diff so
  // it cannot be argued about, and it is what says these four are one family.
  // `data` occupies ctor+$2..+$5, `yPos` ctor+$A/+$B and `upd` ctor+$10..+$13. Every other byte
  // of the $1E -- the four opcodes, the four displacements, the `kind` immediate and the `4E75`
  // -- must be identical across all four.
  const FIELD_BYTES = new Set([0x02, 0x03, 0x04, 0x05, 0x0a, 0x0b, 0x10, 0x11, 0x12, 0x13]);
  for (let i = 1; i < S4.length; i++) {
    const outside = [];
    for (let k = 0; k < CTOR_UNIT; k++) {
      if (FIELD_BYTES.has(k)) continue;
      if (IMG[S4[0].ctor + k] !== IMG[S4[i].ctor + k]) outside.push('+$' + k.toString(16));
    }
    assert.deepEqual(outside, [],
      `id ${i}'s constructor differs from id 0's ONLY inside \`data\`, \`yPos\` and \`upd\` -- `
      + 'the `kind` instruction is identical in all four of its bytes in all four constructors, '
      + 'which is what "no kindWord on this table" means at the byte level');
    // ...and it DOES differ in the three fields, so the loop above is not comparing a row to
    // itself.
    assert.notEqual(l(S4[i].ctor + 2), l(S4[0].ctor + 2), '  ...and `data` really does differ');
    assert.notEqual(l(S4[i].ctor + 0x10), l(S4[0].ctor + 0x10), '  ...as does `upd`');
  }
}

function assertUpdaters() {
  // FOUR updaters behind four rows. No `BGELEM_BY_UPD` collision on this table, unlike internal
  // stage 3 where ids 0 and 6 share `$262FE6`.
  const upds = [...new Set(S4.map((h) => h.upd))];
  assert.equal(upds.length, 4, 'four rows, FOUR updaters -- no shared one');
  assert.equal(new Set(S4.map((h) => h.data)).size, 4, '...and four DISTINCT descriptors');
  for (const h of S4) {
    const tag = `$${h.upd.toString(16).toUpperCase()} (id ${h.id})`;
    // `302E 0002 / 48C0` -- move.w ($2,A6),D0 / ext.l D0. The `.l` half of `lbge`.
    assert.equal(l(h.upd), 0x302e0002, `${tag}: \`move.w ($2,A6),D0\``);
    assert.equal(w(h.upd + 4), 0x48c0, '  ...`ext.l D0`, which is why the variant is `l`');
    // `0680 0000xx00` -- addi.l #thr,D0. The threshold, read out of the instruction.
    assert.equal(w(h.upd + 6), 0x0680, '  ...`addi.l #imm,D0`');
    assert.equal(l(h.upd + 8), h.thr, '  ...and the registry `thr` IS that immediate');
    // **THE BRANCH BYTE.** TRAP 19 and TRAP 4: `6C00` is `bge.w`, `6E00` is `bgt.w`, the
    // displacement is $0006 in BOTH, and internal stage 2's fourteen carry `6E00` right here.
    assert.equal(w(h.upd + 0x0c), 0x6c00,
      `${tag}: \`6C00 bge.w\` -- NOT internal stage 2's 6E00, which sits at this exact offset`);
    assert.equal(w(h.upd + 0x0e), 0x0006, '  ...disp $0006, the same in both families');
    assert.equal(h.upd + 0x0e + 6, h.upd + 0x14, '  ...so it branches to upd+$14');
    assert.equal(w(h.upd + 0x10), 0x4216, 'and upd+$10, the instruction it SKIPS, is `clr.b (A6)`');
    assert.equal(w(h.upd + 0x12), 0x4e75, '  ...followed by `4E75 rts`: the despawn');
    assert.equal(h.v, 'lbge', '  ...so every row here is `lbge`');
    // `4EB9 0024179E` -- the scroll compensation, then the five-register load, then the tail.
    assert.equal(w(h.upd + 0x14), 0x4eb9, `${tag}: \`jsr $24179E\`, the scroll compensation`);
    assert.equal(l(h.upd + 0x16), 0x24179e);
    // **THE EMITTER.** TRAP 5: `4EF9` is 6 bytes and the routine NEVER RETURNS.
    assert.equal(w(h.upd + 0x2c), 0x4ef9, '`4EF9 jmp` closes the updater');
    assert.equal(l(h.upd + 0x2e), 0x23defc, '  ...to $23DEFC, BUCKET 1, not $23DF2A');
    assert.equal(h.emit, 0x23defc, '  ...which is what the registry row says');
    assert.equal(w(h.upd + 0x32), 0x4e71, 'and the unit closes with the `4E71 nop` filler');
  }
  // FOUR distinct thresholds over four rows.
  assert.deepEqual(S4.map((h) => h.thr), [0x3c00, 0x5000, 0x2400, 0x3400]);
  // ...and the four updaters differ from one another in ONE BYTE TOTAL: +$0A, the `addi.l`
  // immediate's high byte. Everything else over all $34 bytes is identical.
  for (let i = 1; i < S4.length; i++) {
    const diffs = [];
    for (let k = 0; k < UPD_UNIT; k++) {
      if (IMG[S4[0].upd + k] !== IMG[S4[i].upd + k]) diffs.push(k);
    }
    assert.deepEqual(diffs, [0x0a],
      `$${S4[i].upd.toString(16).toUpperCase()} differs from $2631F2 in the threshold byte and `
      + 'nothing else');
  }
}

/** **THE PAIR OF CONSTANTS THAT FLIPPED, SIDE BY SIDE.** The combination on this table exists in
 *  neither neighbouring block, which is the whole reason all four were decoded. */
function assertTheCombinationIsNew() {
  assert.equal(S2.length, 14, 'W394\'s fourteen, internal stage 2');
  const S3 = BGELEM_HANDLERS.filter((h) => h.stage === 3);
  assert.equal(S3.length, 7, 'W396\'s seven, internal stage 3');
  // Internal stage 2: 6E00 + $23DEFC.
  for (const h of S2) {
    assert.equal(w(h.upd + 0x0c), 0x6e00, 'internal stage 2 is `6E00 bgt.w`');
    assert.equal(l(h.upd + 0x2e), 0x23defc, '  ...into bucket 1');
  }
  // Internal stage 3: 6C00 + $23DF2A.
  for (const h of S3) {
    assert.equal(w(h.upd + 0x0c), 0x6c00, 'internal stage 3 is `6C00 bge.w`');
    assert.equal(l(h.upd + 0x2e), 0x23df2a, '  ...into bucket 2');
  }
  // THIS table: 6C00 + $23DEFC. Neither neighbour has that pair, so neither is safe to copy.
  for (const h of S4) {
    assert.equal(w(h.upd + 0x0c), 0x6c00, 'internal stage 4 is `6C00 bge.w`, like stage 3');
    assert.equal(l(h.upd + 0x2e), 0x23defc, '  ...but into bucket 1, like stage 2');
  }
  const pair = (h) => `${w(h.upd + 0x0c).toString(16)}/${l(h.upd + 0x2e).toString(16)}`;
  assert.equal(pair(S4[0]), '6c00/23defc');
  assert.notEqual(pair(S4[0]), pair(S2[0]), 'and it is NOT internal stage 2\'s pair');
  assert.notEqual(pair(S4[0]), pair(S3[0]), '  ...nor internal stage 3\'s');
}

// ===============================================================================================
// SECTION 2 -- THE LEDGER and THE OFFSETS.
// ===============================================================================================

test('W397 SECTION 2: the harvest ledger carries $2622F2, four entries, four distinct, four '
  + 'added, ending AT the pointer array', { skip: SKIP }, () => {
    assertFourEntries();
    const { manifest } = bundle();
    const row = (manifest.spr.harvest ?? []).find((r) =>
      String(r.at).toLowerCase() === `$${STAGE5_TABLE.toString(16)}`);
    assert.ok(row, 'manifest.spr.harvest must carry the $2622F2 row. Before this wave there was '
      + 'no row at all -- the exporter had four BGELEM arms and this is the fifth table');
    assert.equal(row.shard, STRUCT_SHARD, 'the structures shard, as all five BGELEM arms use');
    assert.equal(row.entries, 4, 'four handlers');
    assert.equal(row.distinct, 4, 'FOUR distinct streams -- no duplicate pair on this table');
    assert.equal(row.added, 4, 'and all four were added by this arm: nothing else in the '
      + 'exporter reaches any of them');
    assert.equal(row.already, 0, 'not one of the four was in the bundle by another route');
    assert.equal(row.stride, 4);
    assert.equal(row.endsAt, `$${ELEM_TABLE_PTRS.toString(16).toUpperCase()}`,
      'and it ends AT $262302, the pointer ARRAY -- not at another table. The bound is the '
      + 'cartridge\'s, read through $262328\'s `lea`, not a count typed into the exporter');
  });

test('W397 SECTION 2: all four streams are in the shipped stream list, inside shard 11\'s packed '
  + 'span, with the mask ROM\'s own extents', { skip: SKIP }, () => {
    assertConstructors();
    const { rows, shard } = bundle();
    const absent = S4.filter((h) => !rows.has(h.data))
      .map((h) => '$' + h.data.toString(16).toUpperCase());
    assert.deepEqual(absent, [], 'every one of the four rows\' descriptors is in spr/streams.u32');
    for (let i = 0; i < S4.length; i++) {
      const r = rows.get(S4[i].data);
      const tag = `$${S4[i].data.toString(16).toUpperCase()} (id ${i})`;
      assert.equal(r.maskWords, EXTENT[i], `${tag}: the chain's extent, not a record's`);
      assert.ok(r.base >= shard.maskFrom && r.base + r.maskWords <= shard.maskFrom + shard.maskLen,
        `${tag}: packed base ${r.base} lies inside shard ${STRUCT_SHARD}'s span `
        + `[${shard.maskFrom}, ${shard.maskFrom + shard.maskLen}). "Which shard is this stream `
        + 'in" is a range test on the packed base -- there is no fourth manifest field');
    }
    // $31975C IS A LONG WAY FROM THE OTHER THREE -- 74,708 words past $307388 -- and it resolves
    // in the SAME sprmask chain, which is what says the distance is where the art lives and not
    // a transcription slip into another region.
    assert.ok(S4[3].data - S4[2].data > 0x10000,
      '$31975C sits far from $3053A0/$305D04/$307388, exactly as the brief flagged');
    assert.equal(rows.get(S4[3].data).maskWords, 3746,
      '  ...and `romExtent` closes its chain at 3,746 words like any other stream. It resolves '
      + 'against SPRMASK, never against maincpu.bin');
    assert.equal(new Set(S4.map((h) => h.data)).size, 4, 'four distinct, so four packed blocks');
    assert.equal(S4.reduce((a, h) => a + rows.get(h.data).maskWords, 0), DISTINCT_WORDS,
      'the four are 12,632 mask words between them');
  });

// ===============================================================================================
// SECTION 3 -- **THE PIXELS.** The bar is the sheet.
// ===============================================================================================

test('W397 SECTION 3: shard 11\'s shipped mask body IS the cartridge\'s, word for word, for all '
  + 'four', { skip: SKIP }, () => {
    const { rows, shard } = bundle();
    const romBytes = readFileSync(MASKROM);
    // MAME REGION16_LE, loaded at word 0 of the sprite mask region (src/render/regions.js).
    const rom = new Uint16Array(romBytes.buffer, romBytes.byteOffset, romBytes.byteLength >>> 1);
    const shBytes = gunzipSync(readFileSync(here('../assets/spr/mask.shard11.u16.gz')));
    const sheet = new Uint16Array(shBytes.buffer, shBytes.byteOffset, shBytes.byteLength >>> 1);
    assert.equal(sheet.length, shard.maskLen,
      'the shipped file is exactly the span the manifest publishes');

    let compared = 0, rewritten = 0;
    for (const offs of new Set(S4.map((h) => h.data))) {
      const r = rows.get(offs);
      const at = r.base - shard.maskFrom;
      const tag = `$${offs.toString(16).toUpperCase()}`;
      // Words 0 and 1 are the stream's COLOUR POINTER and the exporter REWRITES them to the
      // packed colour base. They must differ, and a sheet that shipped the cartridge's own
      // header would point the drawer at colour words that are not in the bundle.
      assert.notEqual((sheet[at] << 16) | sheet[at + 1], (rom[offs] << 16) | rom[offs + 1],
        `${tag}: the two header words are re-based, not copied`);
      rewritten++;
      // Words 2.. are wide*high MASK words and are the picture. Not one may differ.
      let diff = -1;
      for (let k = 2; k < r.maskWords; k++) {
        if (sheet[at + k] !== rom[offs + k]) { diff = k; break; }
        compared++;
      }
      assert.equal(diff, -1, `${tag}: mask word ${diff} of ${r.maskWords} differs from the `
        + 'cartridge. The sheet would draw noise where this element is');
    }
    assert.equal(rewritten, 4);
    assert.equal(compared, DISTINCT_WORDS - 4 * 2,
      '12,624 mask words compared against the cartridge -- the four extents less their four '
      + 'two-word headers. THIS is "the tiles are in the sheet"');
  });

// ===============================================================================================
// SECTION 4 -- BEFORE AND AFTER, COUNTED.
// ===============================================================================================

test('W397 SECTION 4: the bundle grew by exactly these four and by nothing else',
  { skip: SKIP }, () => {
    const { manifest, rows, shard } = bundle();
    assert.equal(manifest.spr.streamCount, BEFORE.streamCount + 4 + W414.streams + W417.streams,
      '4,263 -> 4,267 by W397\'s four, then -> 4,291 by W414\'s twenty-four. This '
      + 'number is pinned in TWELVE test files and all twelve move together; the claim is '
      + '"the bundle is what the tree measured", never a floor');
    assert.equal(shard.streams, BEFORE.shard11Streams + 4 + W414.streams + W417.streams,
      '818 -> 822 -> 846 -> 862 streams on shard 11');
    assert.equal(shard.maskLen,
      BEFORE.shard11MaskLen + DISTINCT_WORDS + W414.maskWords + W417.maskWords,
      '1,153,740 -> 1,166,372 mask words: 2,402 + 5,762 + 722 + 3,746, the four NEW extents; '
      + 'then -> 1,167,700 for W414\'s 800 + 528');
    assert.equal(shard.colLen, BEFORE.shard11ColLen + 41127 + W414.colWords + W417.colWords,
      '3,219,388 -> 3,260,515 -> 3,262,842 colour words');
    assert.equal(manifest.spr.maskUsed,
      BEFORE.maskUsed + DISTINCT_WORDS + W414.maskWords + W417.maskWords,
      'and the whole packed mask space grew by the same 12,632, then by the same 1,328: '
      + 'nothing else was added');

    // NO SHARD BUT 11 CHANGED MEMBERSHIP.
    // Index 11 is 822 + W414's 24. Every other entry is untouched, which IS the assertion.
    // W415 (docket D50) MOVED EIGHT STREAMS FROM 17 TO 9 AND ADDED NONE.
    // They are pool C's kind-4 death satellite -- the GROUND MARK a dying ground
    // enemy leaves -- and they were filed under shard 17, which `SPR_ORDER`
    // fetches LAST, while the fireball the same death spawns is shard 9, fetched
    // fifth. Index 9 is 269 + 8 and index 17 is 1239 - 8; `streamCount` is
    // UNCHANGED, and the sum assertion below is what proves the move was a move.
    // W417: index 11 is 846 + W417's SIXTEEN (pool-A kind index 3's own animation).
    // Every other entry is untouched, which is still the assertion -- the row was an
    // ADDITION to one shard and the sum below is what proves it.
    const SIZES = [166, 67, 32, 54, 17, 70, 96, 298, 72, 277, 407, 862, 139, 228, 90, 4, 37,
      1231, 160];
    assert.deepEqual(manifest.spr.shards.map((s) => s.streams), SIZES,
      'every other shard holds exactly what it held before');
    assert.equal(SIZES.reduce((a, b) => a + b, 0), manifest.spr.streamCount,
      'and the nineteen shard counts sum to the total with nothing left over: the shards are '
      + 'disjoint by construction (FIRST shard wins in `shardOfStream`), so a stream added twice '
      + 'would show up here as a sum that overshoots');

    // The packed span is exact: no coalescing loss and no overlap inside shard 11.
    let sum = 0, n = 0;
    for (const r of rows.values()) {
      if (r.base >= shard.maskFrom && r.base < shard.maskFrom + shard.maskLen) {
        sum += r.maskWords; n++;
      }
    }
    assert.equal(n, 822 + W414.streams + W417.streams,
      'all 846 of shard 11\'s streams are in the published list');
    assert.equal(sum, shard.maskLen,
      'and their extents sum to the span exactly -- every stream owns its own mask block, which '
      + 'is what makes rewriting each header safe');
  });

// ===============================================================================================
// SECTION 4b -- **THE FAMILY IS CLOSED.** Five tables, forty-six rows, every one harvested.
// ===============================================================================================

test('W397 SECTION 4: all five per-stage BGELEM tables are ported and all five are harvested',
  { skip: SKIP }, () => {
    assertFourEntries();
    // The five tables the pointer array names, and the five arms that harvest them. The table
    // COUNT is the array's -- five longwords ending where $262316's code begins -- so "all five"
    // is a statement about the cartridge, not about how many arms happen to exist.
    const tables = [];
    for (let i = 0; i < (SLOT_CLEAR - ELEM_TABLE_PTRS) / 4; i++) {
      tables.push(l(ELEM_TABLE_PTRS + i * 4));
    }
    assert.deepEqual(tables, [0x26224a, 0x26227e, 0x26229e, 0x2622d6, 0x2622f2]);
    // Each table's extent is its successor, and the LAST one's is the array itself.
    const bounds = [...tables.slice(1), ELEM_TABLE_PTRS];
    const counts = tables.map((t, i) => (bounds[i] - t) / 4);
    assert.deepEqual(counts, [13, 8, 14, 7, 4], 'the five extents, all from the cartridge');
    assert.equal(counts.reduce((a, b) => a + b, 0), 46);
    // ...and `BGELEM_HANDLERS` carries exactly that, stage by stage. A table with a row missing
    // is an `unreached` throw in `elemSpawn`; a table with a row too many indexes the next one.
    for (let s = 0; s < 5; s++) {
      assert.equal(BGELEM_HANDLERS.filter((h) => h.stage === s).length, counts[s],
        `internal stage ${s}'s table $${tables[s].toString(16).toUpperCase()} has ${counts[s]} `
        + 'entries and src/background.js carries that many rows');
    }
    assert.equal(BGELEM_HANDLERS.length, 46,
      'FORTY-SIX rows over FIVE tables -- the whole BGELEM family, ported');
    // ...and the manifest has one harvest row per table, at the table's own address.
    const { manifest } = bundle();
    const harvest = manifest.spr.harvest ?? [];
    for (let s = 0; s < 5; s++) {
      const row = harvest.find((r) =>
        String(r.at).toLowerCase() === `$${tables[s].toString(16)}`);
      assert.ok(row, `internal stage ${s}'s table $${tables[s].toString(16).toUpperCase()} has a `
        + 'harvest row of its own');
      assert.equal(row.entries, counts[s], '  ...covering every entry, not a subset');
      assert.equal(row.shard, STRUCT_SHARD);
    }
  });

// ===============================================================================================
// SECTION 5 -- THE PORT, AND WHAT NO RUN WITNESSES.
//
// **WHAT THIS CANNOT BE.** W395 booted the whole game to +10,600 and W396 drove `backgroundInit`
// + `backgroundFrame` for 5,900 frames. NEITHER IS AVAILABLE HERE: `backgroundInit`'s 15-column
// pre-fill reads the stage's map column stream through `$2611E0`, and internal stage 4's is
// `$22D770`, which is in NO exported ROM window -- `rom.u32` refuses it BY ADDRESS on the first
// frame of init. (The other four stages' column streams are exported: $225B78 $228658 $22A5F8
// $22B1E8. Stage 5's is the only one that is not.) The second test below runs that init and
// asserts the refusal by address, so this claim is measured rather than asserted.
//
// SO NOTHING IN THIS FILE CLAIMS A SCROLL SCRIPT ASKED FOR ONE OF THESE FOUR. Trap 23: W396 has
// four rows whose elements no run has constructed and says so; this wave has four.
//
// **WHAT IT CAN BE, AND IS.** `elemDriver` (`$26233A`) resolves a live slot's updater through
// `BGELEM_BY_UPD` and calls `unreached` -- which THROWS -- on one it does not carry. Before this
// wave all four of these threw. The first test below places four live slots, runs the port's own
// `backgroundFrame`, and watches the driver, the despawn test and the emitter all execute for
// real: four records in BUCKET 1, none in bucket 2, each carrying the descriptor the exporter
// harvested. THE SLOT STATE IS THE TEST'S, and that is said here rather than implied -- what the
// run witnesses is the DRIVER and the EMITTER, not the spawn.
// ===============================================================================================

/** A frozen frame: `$2612A0 tst/bne` takes the `$8130D2` branch straight to `$2613A0`, which is
 *  `elemDriver` + `screenShake260EC8`. Nothing on that path touches the map columns, which is why
 *  it runs where `backgroundInit` cannot. */
function frozenFrameHarness(rows) {
  const ROM = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
  const ram = new Ram();
  const vram = new BgVram();
  const ctx = { unportedLog: new UnportedLog(), soundPost() {} };
  ram.setU16(BGRAM.bgFreeze, 1);         // $8130D2 -- the frozen branch
  ram.setU16(BGRAM.shakeMode, 0);        // $260EC8 returns at once
  ram.setU16(BGRAM.scrollDelta, 0);      // $813176
  for (let s = 0; s < rows.length; s++) {
    const slot = BGRAM.elemSlots + s * 0x20;
    ram.setU8(slot + ESLOT.active, 0x80);
    ram.setU32(slot + ESLOT.arg, rows[s].arg >>> 0);
    ram.setU32(slot + ESLOT.update, rows[s].h.upd);
    ram.setU32(slot + ESLOT.data, rows[s].h.data);
    ram.setU16(slot + ESLOT.yPos, rows[s].h.yPos);
    ram.setU8(slot + 0x0d, rows[s].h.kind);
  }
  return { ROM, ram, vram, ctx };
}

test('W397 SECTION 5: the port\'s own element driver resolves all four updaters and stages all '
  + 'four into BUCKET 1', { skip: SKIP }, () => {
    assertUpdaters();
    assertTheCombinationIsNew();
    // ...and the SCOPE of what follows. At W397 this measured a LIMIT: no op $10 request reached
    // any of this, because the port's Stage-5 background VM refused to start at all. W398
    // declared $22D770 and the limit is gone, so the same control now measures the opposite.
    assertStage5VmNowStarts();
    // arg = 0, so the high word is 0 and every threshold keeps its element alive.
    const rows = S4.map((h) => ({ h, arg: 0 }));
    const { ROM, ram, vram, ctx } = frozenFrameHarness(rows);
    ram.setU16(BUCKETS[1].counter, 0);
    ram.setU16(BUCKETS[2].counter, 0);
    // BEFORE THIS WAVE THIS LINE THREW: `element updater $2631F2 is not one of the ported BGELEM
    // handlers`. `elemDriver` looks the row up BY its updater, which is why the registry's `upd`
    // is read out of `move.l #upd,($8,A6)` and not assumed from adjacency.
    backgroundFrame(ram, ROM, vram, ctx, 0x80e240);

    const n1 = ram.u16(BUCKETS[1].counter), n2 = ram.u16(BUCKETS[2].counter);
    assert.equal(n1, 4 * 12, 'FOUR 12-byte records on bucket 1 -- $23DEFC, the emitter SECTION 1 '
      + 'read out of upd+$2E');
    assert.equal(n2, 0, '...and NOTHING on bucket 2. A row aliased onto internal stage 3\'s '
      + '$23DF2A would have put all four here instead, and every assertion above would still '
      + 'have passed');
    const { rows: streamRows, shard } = bundle();
    for (let i = 0; i < 4; i++) {
      const o = BUCKETS[1].buffer + i * 12;
      assert.equal(ram.u32(o + 4), S4[i].data,
        `record ${i} carries $${S4[i].data.toString(16).toUpperCase()} -- the address the RUNNING `
        + 'PORT puts on the display list is the address the exporter harvested');
      assert.equal(ram.u16(o + 8), S4[i].yPos, `  ...at the constructor's own Y`);
      assert.equal(ram.u16(o + 10), S4[i].kind, '  ...with the constructor\'s own kind word');
      const r = streamRows.get(ram.u32(o + 4));
      assert.ok(r, '  ...and it is in the shipped stream list; before this wave it was in none, '
        + 'so the renderer would have named it as missing art and drawn nothing');
      assert.ok(r.base >= shard.maskFrom && r.base < shard.maskFrom + shard.maskLen,
        '  ...on shard 11');
    }
  });

test('W397 SECTION 5: `6C00 bge.w` is VISIBLE in the port -- a true sum of exactly 0 keeps these '
  + 'elements alive where internal stage 2\'s `6E00 bgt.w` kills its own', { skip: SKIP }, () => {
    assertUpdaters();
    // THE ONE-BYTE DIFFERENCE, RUN RATHER THAN ASSERTED. `move.w ($2,A6),D0` + `addi.l #thr,D0`
    // + `bge`/`bgt`: the test is on the TRUE signed sum, so an arg high word of -thr sums to
    // exactly 0. `bge` keeps the element; `bgt` clears `(A6)` and it dies.
    for (const h of S4) {
      const edge = (0x10000 - (h.thr >>> 8 << 8)) & 0xffff;   // i16(edge) + thr === 0
      assert.equal(i16(edge) + h.thr, 0, 'the arg high word that makes the true sum exactly 0');
      const alive = frozenFrameHarness([{ h, arg: (edge << 16) >>> 0 }]);
      alive.ram.setU16(BUCKETS[1].counter, 0);
      backgroundFrame(alive.ram, alive.ROM, alive.vram, alive.ctx, 0x80e240);
      assert.equal(alive.ram.u8(BGRAM.elemSlots + ESLOT.active), 0x80,
        `$${h.upd.toString(16).toUpperCase()}: sum 0 and the element LIVES -- that is \`6C00\``);
      assert.equal(alive.ram.u16(BUCKETS[1].counter), 12, '  ...and it staged this frame');
      // One less, and it dies -- so the branch is being evaluated, not skipped.
      const dead = frozenFrameHarness([{ h, arg: (((edge - 1) & 0xffff) << 16) >>> 0 }]);
      dead.ram.setU16(BUCKETS[1].counter, 0);
      backgroundFrame(dead.ram, dead.ROM, dead.vram, dead.ctx, 0x80e240);
      assert.equal(dead.ram.u8(BGRAM.elemSlots + ESLOT.active), 0,
        '  ...and at sum -1 `4216 clr.b (A6)` runs');
      assert.equal(dead.ram.u16(BUCKETS[1].counter), 0, '  ...with nothing staged');
    }
    // THE CONTRAST, on rows that are already in the tree: internal stage 2's fourteen are `lbgt`,
    // and at their OWN sum-0 edge they die. Same code, same harness, one byte apart in the ROM.
    const s2 = S2[0];
    assert.equal(w(s2.upd + 0x0c), 0x6e00, '$262B6A carries `6E00 bgt.w` at the same offset');
    const edge2 = (0x10000 - (s2.thr >>> 8 << 8)) & 0xffff;
    const g = frozenFrameHarness([{ h: s2, arg: (edge2 << 16) >>> 0 }]);
    g.ram.setU16(BUCKETS[1].counter, 0);
    backgroundFrame(g.ram, g.ROM, g.vram, g.ctx, 0x80e240);
    assert.equal(g.ram.u8(BGRAM.elemSlots + ESLOT.active), 0,
      'and internal stage 2\'s id 0 DIES on the same true sum of 0. ONE BYTE, one frame, and a '
      + 'row copied from that block into this table would have been wrong in exactly it');
  });

/** **WHAT NO RUN WITNESSED AT W397, AND WHAT W398 THEN WITNESSED.** TRAP 23, both halves.
 *
 *  At W397 this asserted the opposite: `backgroundInit` REFUSED, naming `$22D770` -- stage 5's map
 *  column stream, which was in no exported ROM window -- on the first frame, long before any op
 *  $10 could ask for an element. That is why this file has no cold boot and no 5,900-frame drive,
 *  and the comment ended "declaring it is a MAP wave, not this one".
 *
 *  **W398 IS THAT MAP WAVE**, and it inverted exactly this assertion and nothing else in this
 *  file: `$22D770 + $2B70` is declared, the init completes, and `tests/w398stage5map.test.js`
 *  SECTION 2 drives all four of THESE rows into being spawned by op $10 at frames 1,185 / 1,665 /
 *  2,305 / 6,769. Everything below the init call is W397's own and is untouched.
 *
 *  **IT STILL HAS NO `test()` OF ITS OWN, AND THAT IS STILL TRAP 21.** It is a positive control
 *  asserted inside the first SECTION 5 test, which IS red without the four rows; on its own it
 *  would pass with this whole wave reverted. */
function assertStage5VmNowStarts() {
  const ROM = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
  const ram = new Ram();
  const vram = new BgVram();
  const ctx = { unportedLog: new UnportedLog(), soundPost() {} };
  ram.setU16(BGRAM.stageX4, 16);            // internal stage index 4 -- human Stage 5
  assert.doesNotThrow(() => backgroundInit(ram, ROM, vram, ctx, 0x80e240),  // fresh Ram: clock 0
    'W398 declared $22D770, so the 15-column pre-fill reads instead of throwing');
  assert.equal(vram.columnsWritten, 15, '  ...fifteen columns of stage 5 terrain');
  assert.equal(ram.u32(0x8132c8), STAGE5_TABLE,
    '  ...and $262332 installed $2622F2, the table whose four rows THIS file transcribes');
  // ...and W397 still declares NO new window, because the only program-ROM address the PORT
  // dereferences for these four elements is the table $2622F2 through `elemSpawn`'s
  // `rom.u32(tab + id*4)`, which the WAVE 13 window $262240 + $100 already covers -- asserted
  // cell by cell in SECTION 6's first test. $22D770 is the MAP's dependency, not theirs.
}

// ===============================================================================================
// SECTION 6 -- ABLATED FROM THE IMAGE. Each guard, mutated, throws BY ADDRESS.
// ===============================================================================================
//
// `tools/export-web.mjs` reads the DECRYPTED 68000 image directly (`romBe32`/`romBe16` over
// `tools/oracle/out/maincpu.bin`), not `rip/port/player.tables.json`, so these guards cannot be
// ablated out of the exported ROM windows the way a port dependency can. W395 gave the exporter a
// `--cpu` override for exactly this: each run below feeds it one mutated byte pair of a private
// copy of the cartridge and asserts the message names the address.
//
// NO NEW ROM WINDOW IS DECLARED and none is needed. The exporter does not use windows at all, and
// the only program-ROM address the PORT dereferences here -- the table $2622F2, through
// `elemSpawn`'s `rom.u32(tab + id*4)` -- is entirely inside the WAVE 13 window $262240 + $100,
// whose own comment already names "$26224A..$2622F2 the BG-element handler tables and $262302 the
// per-stage pointer table". Asserted in the first test below, cell by cell, together with the
// pointer array and the `lea` that bounds the table. The four `data` values are offsets into the
// sprite MASK rom and are never read as program ROM by anything.
//
// **EVERY GUARD IN THE ARM HAS A REACHABLE MUTATION, AND THE ARM WAS RESTRUCTURED TO MAKE IT SO**
// (trap 21, and W396's lesson about two passes). The first draft compared the `lea`'s target
// against a constant typed into the exporter; that guard fired first and made the ENTRY-COUNT
// guard below it unreachable by any image mutation. The arm now reads the array THROUGH the
// `lea`'s target instead, which is both the honest thing -- the instruction supplies the address
// rather than being checked against one -- and what gives the count guard the two-word ablation
// in the second test.

const ablate = (patch) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'w397-'));
  try {
    const img = readFileSync(IMAGE);
    patch(img);
    const cpu = path.join(dir, 'maincpu.bin');
    writeFileSync(cpu, img);
    let out = '';
    try {
      execFileSync(process.execPath, [EXPORTER, '--cpu', cpu, '--out', path.join(dir, 'assets')],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return null;                                   // no throw: the guard is not load-bearing
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('W397 SECTION 6: THE BOUND, ablated -- $262328\'s `lea` displacement moved by two bytes',
  { skip: SKIP }, () => {
    // POSITIVE CONTROL, and the whole of the no-new-window claim: the pointer-array cell and all
    // four table entries are readable through the EXPORTED windows, so the port's only
    // program-ROM read here is already covered and this wave declares nothing.
    const ROM = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
    assert.equal(ROM.u32(ELEM_TABLE_PTRS + 4 * 4), STAGE5_TABLE,
      '$262302 entry 4 is readable through the exported windows');
    assert.equal(ROM.u16(PTRS_LEA), 0x41fa, '  ...and so is $262328\'s `lea`');
    assert.equal(ROM.u16(PTRS_LEA + 2), 0xffd8, '  ...with its extension word');
    for (let i = 0; i < 4; i++) {
      assert.equal(ROM.u32(STAGE5_TABLE + i * 4), S4[i].ctor,
        `$2622F2 entry ${i}, through the exported windows, is the row's constructor`);
      assert.equal(l(STAGE5_TABLE + i * 4), S4[i].ctor,
        '  ...and the exporter\'s own reading of the same cell, straight out of the image, agrees');
    }

    // TRAP 4. Move the displacement and the `lea` names $262300 instead of $262302, so the arm
    // reads its "entry 4" out of the middle of two array cells and refuses. The bound is that
    // instruction's target, not a constant, which is exactly what this proves.
    const out = ablate((b) => b.writeUInt16BE(0xffd6, PTRS_LEA + 2));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$262328/, 'and name the instruction');
    assert.match(out, /\$262300/, '  ...and the address it now points at');
    assert.match(out, /\$22d60026/, '  ...and the nonsense longword it read there');
    assert.match(out, /TRAP 4/, 'the message says why the extension word is the base');
  });

test('W397 SECTION 6: THE ENTRY COUNT, ablated -- the pointer array made one entry longer',
  { skip: SKIP }, () => {
    assertFourEntries();
    // The count is `(arrayBase - table) / 4`, never a typed-in 4. Two words: move the `lea` four
    // bytes on so the array appears to start at $262306, and plant a copy of $2622F2 at its new
    // entry 4 ($262316) so the guard above is satisfied. Now the cartridge looks as though it has
    // a SIXTH stage and this table has five entries -- and the arm must refuse rather than
    // harvest four out of a five-entry table.
    const out = ablate((b) => {
      b.writeUInt16BE(0xffdc, PTRS_LEA + 2);
      b.writeUInt32BE(STAGE5_TABLE, SLOT_CLEAR);
    });
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /5 entries/, 'and say what the cartridge now claims');
    assert.match(out, /\$262306/, '  ...naming the array base it derived');
    assert.match(out, /4 `stage: 4` rows/, '  ...against the registry');
    assert.match(out, /never a typed-in/, 'the message says why the pair is the extent');
  });

test('W397 SECTION 6: the DESCRIPTOR, ablated -- id 1\'s `move.l #imm,($10,A6)` immediate',
  { skip: SKIP }, () => {
    assertConstructors();
    // The art is read out of the instruction that writes it. $305D08 is still a plausible-looking
    // offset four words along, which is exactly the shape a mis-transcribed descriptor takes.
    const out = ablate((b) => b.writeUInt32BE(0x305d08, S4[1].ctor + 2));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$263226/, 'and name id 1\'s constructor');
    assert.match(out, /draw one picture and simulate another/,
      'which is exactly what a divergence here would do');
  });

test('W397 SECTION 6: the UPDATER immediate, ablated -- id 0\'s `move.l #upd,($8,A6)` opcode',
  { skip: SKIP }, () => {
    // `upd` is read out of ctor+$10 and NOT assumed from ctor+$1E, because internal stage 3's id
    // 6 proves a constructor can install an updater that is not the code following it. Break the
    // opcode the reader keys on and the arm must refuse rather than read an immediate out of
    // whatever is there.
    const out = ablate((b) => b.writeUInt16BE(0x2d40, S4[0].ctor + 0x0e));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$2631e2/, 'and name the instruction\'s own address, id 0\'s ctor+$E');
    assert.match(out, /move\.l #upd/);
  });

test('W397 SECTION 6: the `4E75` AT ctor+$1C, ablated -- id 2\'s', { skip: SKIP }, () => {
    // TRAP 5. The `rts` sits AT ctor+$1C, which is what makes the constructor $1E bytes and what
    // makes `data` readable out of ctor+2 rather than out of some longer routine.
    const out = ablate((b) => b.writeUInt16BE(0x4e71, S4[2].ctor + 0x1c));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$263278/, 'and name id 2\'s constructor');
    assert.match(out, /4E75.*ctor\+\$1C/i);
  });

test('W397 SECTION 6: THE `kind` FORM, ablated -- id 3 given internal stage 3\'s word instruction',
  { skip: SKIP }, () => {
    // TRAP 3. `1D7C 0017 000D` writes ONE byte at $D; `3D7C 0056 000C` writes a WORD covering $C
    // and $D both, and `elemStage` reads ($C,A6) as a word into the record's flip/colour field.
    // Internal stage 3's id 6 is genuinely that shape; nothing here is, and an arm that did not
    // look would transcribe a word literal as a byte and lose the high half.
    const out = ablate((b) => {
      b.writeUInt16BE(0x3d7c, S4[3].ctor + 0x16);
      b.writeUInt16BE(0x000c, S4[3].ctor + 0x1a);
    });
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$2632e0/, 'and name id 3\'s kind instruction by its own address');
    assert.match(out, /move\.b #kind/);
    assert.match(out, /TWO byte fields/);
  });

test('W397 SECTION 6: the yPos immediate, ablated -- id 2\'s `move.w #yPos,($14,A6)`',
  { skip: SKIP }, () => {
    // `yPos` rides the sprite record `elemStage` writes at +8, so a wrong one draws the right
    // picture in the wrong place. It is checked against the registry for the same reason `data`
    // is: nothing else in the tree reads this immediate.
    const out = ablate((b) => b.writeUInt16BE(0x1254, S4[2].ctor + 0x0a));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$263278/, 'and name id 2\'s constructor');
    assert.match(out, /yPos \$1254/, '  ...and both readings of the field');
    assert.match(out, /wrong place or the wrong colour/);
  });

test('W397 SECTION 6: the THRESHOLD, ablated -- id 1\'s `addi.l #imm,D0`', { skip: SKIP }, () => {
    // `thr` is the despawn edge and the ONLY byte the four updaters differ in. $5400 is one of
    // internal stage 1's own thresholds, so this is precisely the "copied from the neighbouring
    // block" mistake in the one field that would otherwise never be noticed.
    const out = ablate((b) => b.writeUInt32BE(0x5400, S4[1].upd + 8));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$263244/, 'and name id 1\'s updater');
    assert.match(out, /addi\.l #\$5000/, '  ...and the immediate the registry expects');
    assert.match(out, /frame the element despawns on/);
  });

test('W397 SECTION 6: THE BRANCH BYTE, ablated -- id 0 given internal stage 2\'s `6E00 bgt.w`',
  { skip: SKIP }, () => {
    // POSITIVE CONTROL -- the un-ablated family property and the pair table, on the real image.
    assertUpdaters();
    assertTheCombinationIsNew();
    // ONE BYTE (trap 19). The displacement after it is $0006 in both families, so nothing else
    // in the updater changes and the element simply dies one frame earlier at the despawn edge.
    // SECTION 5's second test shows that difference RUNNING; this shows the harvest refusing it.
    const out = ablate((b) => b.writeUInt16BE(0x6e00, S4[0].upd + 0x0c));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$2631f2/, 'and name id 0\'s updater');
    assert.match(out, /6C00 bge\.w/);
    assert.match(out, /kills this element one frame early/);
  });

test('W397 SECTION 6: THE EMITTER, ablated -- id 2\'s `4EF9` target set to internal stage 3\'s '
  + '$23DF2A', { skip: SKIP }, () => {
    // The other half of the flipping pair. A row aliased onto internal stage 3's near-identical
    // updater would harvest the same art and draw this whole stage out of bucket 2.
    const out = ablate((b) => b.writeUInt32BE(0x23df2a, S4[2].upd + 0x2e));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$263296/, 'and name id 2\'s updater');
    assert.match(out, /wrong sprite bucket/);
  });

test('W397 SECTION 6: NO DUPLICATE DESCRIPTOR, ablated -- id 3 made to draw id 0\'s $3053A0',
  { skip: SKIP }, () => {
    assertUpdaters();
    // "Four entries, four distinct streams" is a MEASUREMENT of this table, not W395's rule
    // inherited. Internal stage 3 genuinely has one duplicate pair and W396's arm allows for it;
    // an arm here that silently accepted three distinct descriptors over four entries would be
    // harvesting a table this file has not read, and would ship one picture short.
    const out = ablate((b) => b.writeUInt32BE(0x3053a0, S4[3].ctor + 2));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$2622f2/, 'and name the table');
    assert.match(out, /4 entries and 3 distinct descriptors/);
    assert.match(out, /NO duplicate pair here/);
  });

test('W397 SECTION 6: NO SHARED UPDATER, ablated -- id 1 made to install id 0\'s $2631F2',
  { skip: SKIP }, () => {
    // The other direction of the same measurement, and it is not redundant: internal stage 3's
    // duplicate pair shares BOTH its descriptor and its updater, so a table can collide in one
    // without the other. `BGELEM_BY_UPD` is a Map keyed on `upd`, and two rows sharing one key
    // means `elemDriver` runs one row's despawn test against the other's slot.
    const out = ablate((b) => b.writeUInt32BE(S4[0].upd, S4[1].ctor + 0x10));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /3 distinct updaters/, 'and count them');
    assert.match(out, /BGELEM_BY_UPD/, '  ...naming what collides');
  });
