// ===============================================================================================
// W396 -- THE SIX CONSTRUCTORS INTERNAL STAGE 3 DRAWS WITH, AND THE PICTURES BEHIND THEM.
// ===============================================================================================
//
// UNIT. `$2622D6`'s table. Internal stage index 3 (human Stage 4) has SEVEN background-element
// constructors and `src/background.js` carried exactly ONE of them -- id 5, W211's, the element
// the clock-0 script asks for. The other six were `unreached`, and `tools/export-web.mjs`'s
// Stage-4 arm harvested the SINGLE table cell `$2622EA` rather than the table. So five pictures
// were in no shard at all:
//
//     $2B01D0 (ids 0 and 6)   $2CE658 (id 1)   $2CEE3C (id 2)   $2CF620 (id 3)   $2CFE04 (id 4)
//
// That is W86's BLACK TERRAIN, one stage further on, and worse than "no picture": SECTION 5 shows
// the port's own Stage-4 background VM THROWING `Unreached $263038` at frame 2,625, because
// `elemSpawn` refuses a constructor it does not carry. Stage 4 could not be driven past its 44th
// second.
//
// **THE BAR HERE IS THE SHEET, NOT THE CODE PATH**, exactly as in W395. SECTION 3 reads
// `assets/spr/mask.shard11.u16.gz` back and compares it WORD FOR WORD against
// `rip/rom/cave_b04401w064.u1` -- 22,176 words of real mask data at the packed offsets the
// manifest publishes.
//
// **WHERE THE BRIEF IS WRONG, from the bytes:**
//
//   1. "$23DEFC is bucket 1, $23DF2A is bucket 2" is right, but the brief leaves the impression
//      that the stage-2 arm's constant carries over. IT IS THE OPPOSITE ONE. All SEVEN updaters
//      here end `4EF9 0023DF2A`; internal stage 2's fourteen end `4EF9 0023DEFC`. A row copied
//      from W395's block would be wrong in that byte pair, which is precisely the failure W394
//      described. SECTION 1 and SECTION 6.
//   2. "`6E00 bgt.w` vs `6C00 bge.w` ... Decode each; do not alias." Decoded: all seven carry
//      `6C00 bge.w` at `upd+$0C` with displacement `$0006`, where internal stage 2's fourteen
//      carry `6E00`. So this whole stage is `lbge` and W395's whole stage was `lbgt` -- ONE BYTE
//      (trap 19), the other way round. SECTION 1.
//   3. "**Port the six**" and "the deliverable is rows in `BGELEM_HANDLERS` **and** their pixels"
//      implies six new pictures. IT IS FIVE. `$262FC8` (id 0) and `$26301A` (id 6) write the
//      SAME `$2B01D0` descriptor, the SAME `$3520` Y and the SAME `$262FE6` updater -- literally
//      the same updater address, so `BGELEM_BY_UPD` collides -- and differ in ONE INSTRUCTION:
//      `1D7C 0016 000D` (`move.b #$16,($D,A6)`) against `3D7C 0056 000C` (`move.w #$56,($C,A6)`,
//      trap 3, a word literal over two byte fields). Seven elements, six streams, five new.
//      SECTION 1 and SECTION 2.
//   4. "Note the existing arm 3 in `export-web.mjs` reads **one cell** (`$2622D6 + 5*4`)." True,
//      and it also implies the only edit is that arm. It is not: the harvest LEDGER ROW moves
//      from `$2622EA` to `$2622D6` (pinned in `tests/w211stage4.test.js`), the bundle's stream
//      count moves in ELEVEN test files, shard 11's row moves in `tools/webgate.mjs`, and
//      `tests/w395stage2art.test.js` SECTION 4's bundle-wide totals move by construction. Every
//      one of those is named in the wave report.
//
// SECTION 1  the seven units, decoded byte by byte (no test of its own -- see the block there)
// SECTION 2  THE LEDGER and THE OFFSETS: all six streams in the bundle, inside shard 11's span
// SECTION 3  **THE PIXELS**, compared against the mask ROM word for word
// SECTION 4  BEFORE AND AFTER, COUNTED: 4,258 -> 4,263 streams, 813 -> 818 on shard 11
// SECTION 5  THE CLOSURE: the port's own Stage-4 VM, which used to THROW at frame 2,625
// SECTION 6  ABLATED FROM THE IMAGE -- seven guards, seven throws, each named by address, and
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
import { BGELEM_HANDLERS, BGO, BGRAM, BgVram, ESLOT, backgroundInit, backgroundFrame }
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

const S3 = BGELEM_HANDLERS.filter((h) => h.stage === 3);
const ELEM_TABLE_PTRS = 0x262302;
const STAGE3_TABLE = 0x26229e;      // internal stage 2's, W395's -- here only the near bound
const STAGE4_TABLE = 0x2622d6;      // internal stage 3's: THE UNIT
const STAGE4_END = 0x2622f2;        // ...and its bound, entry 4 of the pointer array
const STRUCT_SHARD = 11;

/** The exporter's own numbers, MEASURED at the commit before this wave's arm existed -- the
 *  values the shipped `assets/manifest.json` carried while the Stage-4 arm read ONE table cell. */
const BEFORE = Object.freeze({
  streamCount: 4258, shard11Streams: 813, shard11MaskLen: 1138178, shard11ColLen: 3183741,
  maskUsed: 2415260,
});

/** [M] the extents the mask ROM's own chain gives, by id, via `src/render/spritedir.js`
 *  `streamExtent`. Ids 0 and 6 are ONE stream and therefore one entry in the sum. */
const EXTENT = [7490, 2018, 2018, 2018, 2018, 6626, 7490];
const DISTINCT_WORDS = 7490 + 2018 * 4 + 6626;            // 22,188

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
// SECTION 1 -- the seven units, decoded rather than pattern-matched.
//
// **THIS SECTION HAS NO `test()` OF ITS OWN, AND THAT IS DELIBERATE**, for the reason W395's
// SECTION 1 gives: its assertions are pure cartridge truth, they held before this wave, and a
// test that cannot go red without its fix is trap 21. They are the POSITIVE CONTROL of SECTION
// 6's emitter and duplicate-pair ablations -- the un-ablated family property stated first, then
// the byte that breaks it -- so they are asserted inside tests that ARE red without the arm.
// ===============================================================================================

/** The `$1E`-byte constructor: five instructions with the `4E75` AT ctor+$1C (trap 5). */
const CTOR_UNIT = 0x1e;
/** The `$34`-byte updater unit: `$32` of code plus the `4E71` filler word at +$32. */
const UPD_UNIT = 0x34;

function assertSevenEntries() {
  assert.equal(S3.length, 7, 'W211 shipped one row; W396 ported the other six');
  // THE EXTENT IS THE CARTRIDGE'S, and it is the same pointer array W395 proved out one cell
  // along. Entry 3 names the table, entry 4 bounds it. Nothing counts an absence.
  assert.equal(l(ELEM_TABLE_PTRS + 3 * 4), STAGE4_TABLE, '$262302 entry 3 = $2622D6');
  assert.equal(l(ELEM_TABLE_PTRS + 4 * 4), STAGE4_END, '$262302 entry 4 = $2622F2, THE BOUND');
  assert.equal((STAGE4_END - STAGE4_TABLE) / 4, 7, 'so ($2622F2 - $2622D6) / 4 = SEVEN entries');
  assert.equal(l(ELEM_TABLE_PTRS + 2 * 4), STAGE3_TABLE,
    '...and entry 2 is still $26229E, W395\'s table, which this one begins immediately after');
}

function assertConstructors() {
  assertSevenEntries();
  for (let i = 0; i < S3.length; i++) {
    const h = S3[i];
    const tag = `$${h.ctor.toString(16).toUpperCase()} (id ${i})`;
    assert.equal(h.id, i, `${tag}: row i carries id i -- op $10 indexes this table by id`);
    assert.equal(l(STAGE4_TABLE + i * 4), h.ctor, `${tag}: the table's own cell names it`);
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
    // adjacency: id 6 sits at $26301A and installs $262FE6, which is id 0's, not $263038.
    assert.equal(w(h.ctor + 0x0e), 0x2d7c, `${tag}: then \`move.l #imm,($8,A6)\``);
    assert.equal(w(h.ctor + 0x14), 0x0008, '  ...displacement $8');
    assert.equal(l(h.ctor + 0x10), h.upd, '  ...and its immediate IS the registry `upd`');
    // TRAP 3. Ids 0..5 write the `kind` BYTE at $D; id 6 writes a WORD at $C that covers $C and
    // $D both. `src/background.js` carries that as `kindWord: true`, the same flag W168 gave
    // stage 1's ids 4 and 5.
    if (h.kindWord) {
      assert.equal(w(h.ctor + 0x16), 0x3d7c, `${tag}: closes \`move.w #imm,($C,A6)\``);
      assert.equal(w(h.ctor + 0x1a), 0x000c, '  ...displacement $C -- TWO byte fields');
    } else {
      assert.equal(w(h.ctor + 0x16), 0x1d7c, `${tag}: closes \`move.b #imm,($D,A6)\``);
      assert.equal(w(h.ctor + 0x1a), 0x000d, '  ...displacement $D -- the kind byte alone');
    }
    assert.equal(w(h.ctor + 0x18), h.kind, '  ...and its immediate IS the registry `kind`');
    // TRAP 5: the `4E75` sits AT the last address, so the unit is $1E bytes, not $1C.
    assert.equal(w(h.ctor + 0x1c), 0x4e75, `${tag}: \`4E75 rts\` AT ctor+$1C`);
  }
  // Only id 6 takes the word form, and its kind is $56 against id 0's $16 -- the SAME element
  // with a different flip/colour word. `elemStage` reads ($C,A6) as a WORD and ORs it into
  // hardware word 2's high byte, so this is a visible difference, not a dead store.
  assert.deepEqual(S3.filter((h) => h.kindWord).map((h) => h.id), [6]);
  assert.deepEqual(S3.map((h) => h.kind), [0x16, 0x17, 0x16, 0x17, 0x17, 0x16, 0x56]);
}

function assertUpdaters() {
  // SIX updaters behind seven rows: ids 0 and 6 install the SAME `$262FE6`.
  const upds = [...new Set(S3.map((h) => h.upd))];
  assert.equal(upds.length, 6, 'seven rows, SIX updaters');
  assert.equal(S3[0].upd, S3[6].upd, '  ...because ids 0 and 6 share $262FE6');
  assert.equal(S3[0].upd, 0x262fe6);
  for (const h of S3) {
    const tag = `$${h.upd.toString(16).toUpperCase()} (id ${h.id})`;
    // `302E 0002 / 48C0` -- move.w ($2,A6),D0 / ext.l D0. The `.l` half of `lbge`.
    assert.equal(l(h.upd), 0x302e0002, `${tag}: \`move.w ($2,A6),D0\``);
    assert.equal(w(h.upd + 4), 0x48c0, '  ...`ext.l D0`, which is why the variant is `l`');
    // `0680 0000xx00` -- addi.l #thr,D0. The threshold, read out of the instruction.
    assert.equal(w(h.upd + 6), 0x0680, '  ...`addi.l #imm,D0`');
    assert.equal(l(h.upd + 8), h.thr, '  ...and the registry `thr` IS that immediate');
    // TRAP 4 and TRAP 19: `6C00` is `bge.w`, `6E00` is `bgt.w`, the displacement is the same
    // $0006 in both, and the target is the EXTENSION WORD's address + disp.
    assert.equal(w(h.upd + 0x0c), 0x6c00, `${tag}: \`6C00 bge.w\` -- NOT internal stage 2's 6E00`);
    assert.equal(w(h.upd + 0x0e), 0x0006, '  ...disp $0006');
    assert.equal(h.upd + 0x0e + 6, h.upd + 0x14, '  ...so it branches to upd+$14');
    assert.equal(w(h.upd + 0x10), 0x4216, 'and upd+$10, the instruction it SKIPS, is `clr.b (A6)`');
    assert.equal(w(h.upd + 0x12), 0x4e75, '  ...followed by `4E75 rts`: the despawn');
    assert.equal(h.v, 'lbge', '  ...so every row here is `lbge`');
    // `4EB9 0024179E` -- the scroll compensation, then the five-register load, then the tail.
    assert.equal(w(h.upd + 0x14), 0x4eb9, `${tag}: \`jsr $24179E\`, the scroll compensation`);
    assert.equal(l(h.upd + 0x16), 0x24179e);
    // THE TAIL JUMP, and the field that would have been wrong had these rows been aliased onto
    // W395's $262B6A. TRAP 5: `4EF9` is 6 bytes and the routine NEVER RETURNS.
    assert.equal(w(h.upd + 0x2c), 0x4ef9, '`4EF9 jmp` closes the updater');
    assert.equal(l(h.upd + 0x2e), 0x23df2a, '  ...to $23DF2A, BUCKET 2, not $23DEFC');
    assert.equal(h.emit, 0x23df2a, '  ...which is what the registry row says');
    assert.equal(w(h.upd + 0x32), 0x4e71, 'and the unit closes with the `4E71 nop` filler');
  }
  // THREE distinct thresholds over seven rows. Ids 0 and 6 share one because they share the
  // updater the threshold lives in.
  assert.deepEqual(S3.map((h) => h.thr),
    [0x6800, 0x1c00, 0x1c00, 0x1c00, 0x1c00, 0x5c00, 0x6800]);
  // ...and the six updaters differ from one another in ONE BYTE TOTAL: +$0A, the `addi.l`
  // immediate's high byte. Everything else over all $34 bytes is identical, which is what says
  // this is one family and the harvest is reading the right shape.
  const base = IMG.subarray(S3[1].upd, S3[1].upd + UPD_UNIT);
  for (const u of upds) {
    const cur = IMG.subarray(u, u + UPD_UNIT);
    const diffs = [];
    for (let k = 0; k < UPD_UNIT; k++) if (base[k] !== cur[k]) diffs.push(k);
    assert.deepEqual(diffs, l(u + 8) === 0x1c00 ? [] : [0x0a],
      `$${u.toString(16).toUpperCase()} differs from $263056 in the threshold byte and nothing `
      + 'else');
  }
}

/** IDS 0 AND 6 ARE ONE ELEMENT WITH TWO `kind` WORDS. Every immediate but the last is equal. */
function assertTheDuplicatePair() {
  const [a, b] = [S3[0], S3[6]];
  assert.equal(a.data, b.data, '$262FC8 and $26301A install the same $2B01D0');
  assert.equal(a.data, 0x2b01d0);
  assert.equal(a.yPos, b.yPos, '  ...the same $3520 Y');
  assert.equal(a.upd, b.upd, '  ...and the same $262FE6 updater');
  assert.notEqual(a.kind, b.kind, '  ...and differ in `kind`, $16 against $56');
  // The two constructors are byte-identical for their first $16 bytes and differ only in the
  // last instruction. Stated as a byte-diff so it cannot be argued about.
  const diffs = [];
  for (let k = 0; k < CTOR_UNIT; k++) {
    if (IMG[a.ctor + k] !== IMG[b.ctor + k]) diffs.push(k);
  }
  assert.deepEqual(diffs, [0x16, 0x19, 0x1b],
    'the two constructors differ at ctor+$16 (1D7C against 3D7C), ctor+$19 ($16 against $56) '
    + 'and ctor+$1B ($0D against $0C) -- the kind instruction, and nothing else');
  // SIX distinct descriptors over seven rows, and that is why the exporter's arm may not use
  // W395's "distinct === entries" rule.
  assert.equal(new Set(S3.map((h) => h.data)).size, 6);
}

// ===============================================================================================
// SECTION 2 -- THE LEDGER and THE OFFSETS.
// ===============================================================================================

test('W396 SECTION 2: the harvest ledger carries $2622D6, seven entries, six distinct, six '
  + 'added', { skip: SKIP }, () => {
    assertSevenEntries();
    const { manifest } = bundle();
    const row = (manifest.spr.harvest ?? []).find((r) =>
      String(r.at).toLowerCase() === `$${STAGE4_TABLE.toString(16)}`);
    assert.ok(row, 'manifest.spr.harvest must carry the $2622D6 row. Before this wave it carried '
      + '$2622EA -- ONE CELL of a seven-entry table -- so six of the stage\'s seven elements were '
      + 'harvested by nothing');
    assert.equal(row.shard, STRUCT_SHARD, 'the structures shard, as all four BGELEM arms use');
    assert.equal(row.entries, 7, 'seven handlers');
    assert.equal(row.distinct, 6, 'SIX distinct streams: ids 0 and 6 draw the same $2B01D0');
    assert.equal(row.added, 6, 'and all six were added by this arm -- nothing else in the '
      + 'exporter reaches any of them, including id 5\'s $2CCC74, which W211\'s single-cell arm '
      + 'used to add and which this arm replaces');
    assert.equal(row.already, 1, 'the one `already` is the SECOND row carrying $2B01D0, counted '
      + 'per ROW as the stage-2 arm counts it, not a second stream');
    assert.equal(row.stride, 4);
    assert.equal(row.endsAt, `$${STAGE4_END.toString(16).toUpperCase()}`,
      'and it ends AT $2622F2, the pointer array\'s entry 4 -- the bound is the cartridge\'s, '
      + 'not a count typed into the exporter');
  });

test('W396 SECTION 2: all six streams are in the shipped stream list, inside shard 11\'s packed '
  + 'span, with the mask ROM\'s own extents', { skip: SKIP }, () => {
    assertConstructors();
    const { rows, shard } = bundle();
    const absent = S3.filter((h) => !rows.has(h.data))
      .map((h) => '$' + h.data.toString(16).toUpperCase());
    assert.deepEqual(absent, [], 'every one of the seven rows\' descriptors is in spr/streams.u32');
    for (let i = 0; i < S3.length; i++) {
      const r = rows.get(S3[i].data);
      const tag = `$${S3[i].data.toString(16).toUpperCase()} (id ${i})`;
      assert.equal(r.maskWords, EXTENT[i], `${tag}: the chain's extent, not a record's`);
      assert.ok(r.base >= shard.maskFrom && r.base + r.maskWords <= shard.maskFrom + shard.maskLen,
        `${tag}: packed base ${r.base} lies inside shard ${STRUCT_SHARD}'s span `
        + `[${shard.maskFrom}, ${shard.maskFrom + shard.maskLen}). "Which shard is this stream `
        + 'in" is a range test on the packed base -- there is no fourth manifest field');
    }
    // Ids 0 and 6 are ONE stream and share one packed block: the sum below counts it once.
    assert.equal(rows.get(S3[0].data).base, rows.get(S3[6].data).base,
      'ids 0 and 6 resolve to the same packed block, which is what "six distinct" means');
    assert.equal([...new Set(S3.map((h) => h.data))]
      .reduce((a, d) => a + rows.get(d).maskWords, 0), DISTINCT_WORDS,
    'the six are 22,188 mask words between them');
  });

// ===============================================================================================
// SECTION 3 -- **THE PIXELS.** The bar is the sheet.
// ===============================================================================================

test('W396 SECTION 3: shard 11\'s shipped mask body IS the cartridge\'s, word for word, for all '
  + 'six', { skip: SKIP }, () => {
    const { rows, shard } = bundle();
    const romBytes = readFileSync(MASKROM);
    // MAME REGION16_LE, loaded at word 0 of the sprite mask region (src/render/regions.js).
    const rom = new Uint16Array(romBytes.buffer, romBytes.byteOffset, romBytes.byteLength >>> 1);
    const shBytes = gunzipSync(readFileSync(here('../assets/spr/mask.shard11.u16.gz')));
    const sheet = new Uint16Array(shBytes.buffer, shBytes.byteOffset, shBytes.byteLength >>> 1);
    assert.equal(sheet.length, shard.maskLen,
      'the shipped file is exactly the span the manifest publishes');

    let compared = 0, rewritten = 0;
    for (const offs of new Set(S3.map((h) => h.data))) {
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
    assert.equal(rewritten, 6);
    assert.equal(compared, DISTINCT_WORDS - 6 * 2,
      '22,176 mask words compared against the cartridge -- the six extents less their six '
      + 'two-word headers. THIS is "the tiles are in the sheet"');
  });

// ===============================================================================================
// SECTION 4 -- BEFORE AND AFTER, COUNTED.
// ===============================================================================================

// **W397 MOVED EVERY TOTAL IN THIS SECTION, AND IT IS UPDATED RATHER THAN LOOSENED** -- exactly
// as W396 did to W395's SECTION 4, and for the same reason: these are BUNDLE-WIDE numbers, so any
// later wave that adds a stream invalidates them by construction. W397 is the fifth and LAST
// BGELEM arm, internal stage index 4's four-entry table `$2622F2`, and its four streams
// ($3053A0 $305D04 $307388 $31975C) are all new and all land on shard 11. W396's own contribution
// stays its own term (`+ 5`, `+ 15562`, `+ 35647`); W397's is the second, named and separate.
// SECTIONS 2 and 3 -- these seven rows' own offsets and their pixels -- did not move at all.
const W397 = Object.freeze({ streams: 4, maskWords: 12632, colWords: 41127 });

// **W414 (DOCKET D51) MOVED THEM AGAIN, AND THE NOTE ABOVE THAT W397 WAS THE LAST IS WRONG.**
// W397 was the last BGELEM wave; it was never the last wave that can add a stream. W414 shipped
// pool-A kind index 2's own sixteen-frame animation ($1BE2CC..$1BE5D8, stride $34) and the
// eight-frame collected popup the star shares with it ($1E179C..$1E1978, stride $44) -- the
// medal the owner reported missing. TWENTY-FOUR streams, all new, all on shard 11. Its term is
// the next one below, named and separate, so this test still says what its own wave did.
const W414 = Object.freeze({ streams: 24, maskWords: 1328, colWords: 2327 });

// W417 ships pool-A kind index 3's OWN sixteen-frame animation ($1BE94C..$1BF4C8, stride $C4)
// in the same wave as its body $27FED2 -- SIXTEEN streams, all new, all on shard 11.  [M] the
// bundle diff over the export is `4,291 -> 4,307` with 16 added and 0 removed, and shard 11 is
// the only shard whose stream count moves.  Its term is separate and named, so this test still
// says what its own wave did.
const W417 = Object.freeze({ streams: 16, maskWords: 3104, colWords: 9888 });

// W419 ships pool C's OTHER THREE death-satellite families in the same wave as the guard that
// reaches them.  `$289DEA` is indexed by `kind & $3C` and holds FOUR templates -- kinds 0, 4, 8
// and $C -- and only kind 4's eight streams were in the bundle; the port's allocator refused
// everything else, so `handlers.js:2014` (type $8E's death, `moveq #$8`) threw.  THIRTY-SIX
// streams, all new, all onto SHARD 9, beside the explosion the same death spawns.  [M] the
// bundle diff over the export is `4,307 -> 4,343` with 36 added and 0 removed; shard 9 goes
// 277 -> 313 streams and 158,466 -> 166,218 mask words, and `spr.maskUsed` grows by that SAME
// 7,752 -- so nothing outside shard 9 moved.  Shard 11 is untouched, which is why its terms
// below do NOT carry a W419 addend.
const W419 = Object.freeze({ streams: 36, maskWords: 7752, colWords: 23109 });

// W422 ships pool-A kind index 5's COLLECTED popup ($1E24DC..$1E2728, stride $54) in the
// same wave as its body $27FF9A -- EIGHT streams, all new, all on shard 11.  The live ring
// that body animates needed nothing: [M] $1BCD0C + n * $34 was already 16 of 16, because
// hyper kinds 9 and 13 share it.  [M] the bundle diff over the export is `4,343 -> 4,351`
// with 8 added and 0 removed, and shard 11 is the only shard whose stream count moves.
const W422 = Object.freeze({ streams: 8, maskWords: 656, colWords: 738 });

// **W443 (DOCKET D56) MOVED THEM AGAIN, AND IT IS THE FIRST WAVE SINCE W419 TO MOVE A SHARD
// OTHER THAN 11.** The HYPER beam's own four frames ($022084 $022268 $02244C $022630, stride
// $1E4) had never been exported: `$255008 addi.w #$78,D3` puts the hyper on pair-table entries
// 15..19 of $24BB0A, all five of which point at ONE block, $24BAE2, and `export-web.mjs` walked
// entries 0..4 only. W442 measured the port drawing 88 bucket-16 records in 100 frames with no
// picture -- the owner's "the laser just cuts off". FOUR streams, all new, all onto SHARD 10, the
// laser's own. [M] shard 10 goes 407 -> 411 streams, 54,582 -> 56,510 mask words and
// 118,820 -> 126,298 colour words; `spr.maskUsed` grows by the SAME 1,928; and shard 11 HELD at
// 870/1,171,460/3,273,468 -- which is why the shard-11 terms below do NOT carry a W443 addend and
// only `streamCount`, `maskUsed` and SIZES[10] do.
const W443 = Object.freeze({ streams: 4, maskWords: 1928, colWords: 7478 });
const W497 = Object.freeze({ streams: 543, maskWords: 123510 });
const W498 = Object.freeze({ streams: 9, maskWords: 26226 });
const W555 = Object.freeze({ streams: 6, maskWords: 7404 });
const W556 = Object.freeze({ streams: 1, maskWords: 4610 });
const W557 = Object.freeze({ streams: 1, maskWords: 338 });
const W558 = Object.freeze({ streams: 64, maskWords: 35968 });
const W560 = Object.freeze({ streams: 7, maskWords: 9326 });
const W589 = Object.freeze({
  streams: 105,
  maskWords: 9778,
  colWords: 51065,
});
const W597 = Object.freeze({ streams: 82, maskWords: 3620 });
const W598 = Object.freeze({ streams: 101, maskWords: 15850 });

test('W396 SECTION 4: the bundle grew by exactly these five and by nothing else',
  { skip: SKIP }, () => {
    const { manifest, rows, shard } = bundle();
    // FIVE, not six: $2CCC74 was already in the bundle as W211's single harvested cell, so the
    // arm adds six streams where one of them replaces an entry that was already there.
    assert.equal(manifest.spr.streamCount,
      BEFORE.streamCount + 5 + W397.streams + W414.streams + W417.streams
        + W419.streams + W422.streams + W443.streams + W497.streams + W498.streams
        + W555.streams + W556.streams + W557.streams + W558.streams + W560.streams
        + W589.streams + W597.streams + W598.streams,
      'W555 adds six Hibachi frames, W556/W557 add one fixed stream each, W558 adds 64, '
      + 'W560 adds seven, W589 adds 105 list-B streams, W597 adds 82 hyper streams, and '
      + 'W598 adds 101 complete-ending streams. The current 5,274-stream bundle '
      + 'total is exact, never a floor');
    assert.equal(shard.streams,
      BEFORE.shard11Streams + 5 + W397.streams + W414.streams + W417.streams
        + W422.streams,
      '813 -> 818 -> 822 -> 846 -> 862 -> 870 streams on shard 11');
    assert.equal(shard.maskLen,
      BEFORE.shard11MaskLen + 15562 + W397.maskWords + W414.maskWords + W417.maskWords
        + W422.maskWords,
      '1,138,178 -> 1,153,740 -> 1,166,372 -> 1,167,700 mask words: 7,490 + 2,018 x 4 = the '
      + 'five NEW extents, with $2CCC74\'s 6,626 already counted, then W397\'s four and '
      + 'W414\'s twenty-four');
    assert.equal(shard.colLen,
      BEFORE.shard11ColLen + 35647 + W397.colWords + W414.colWords + W417.colWords
        + W422.colWords,
      '3,183,741 -> 3,219,388 -> 3,260,515 -> 3,262,842 -> 3,272,730 colour words');
    assert.equal(manifest.spr.maskUsed,
      BEFORE.maskUsed + 15562 + W397.maskWords + W414.maskWords + W417.maskWords
        + W419.maskWords + W422.maskWords + W443.maskWords
        + W497.maskWords + W498.maskWords + W555.maskWords + W556.maskWords
        + W557.maskWords + W558.maskWords + W560.maskWords + W589.maskWords
        + W597.maskWords + W598.maskWords,
      'W555 adds 7,404 mask words, W556 adds 4,610, W557 adds 338, W558 adds 35,968, '
      + 'W560 adds 9,326, W589 adds 9,778, W597 adds 3,620, and W598 adds 15,850');

    // W396 through W443 establish the historical structure and laser additions. W497 then
    // expands shards 0, 6, 10, and 13, W498 adds nine Game Over streams to shard 0, and
    // W555 adds six Hibachi body frames, W556/W557 add one fixed body each, W558 adds
    // the shared 64-frame part table, W560 adds seven streams, W597 adds 82 streams to shard 0,
    // and W598 adds 101 complete-ending streams to shard 17. Keep every current shard exact so
    // the global total cannot hide a misplaced stream.
    const SIZES = [359, 67, 32, 54, 17, 70, 313, 298, 72, 313, 451, 870, 139, 412, 90, 4, 37,
      1516, 160];
    assert.deepEqual(manifest.spr.shards.map((s) => s.streams), SIZES,
      'the exact current stream membership of every shard');
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
    assert.equal(n, 822 + W414.streams + W417.streams + W422.streams,
      'all 870 of shard 11\'s streams are in the published list');
    assert.equal(sum, shard.maskLen,
      'and their extents sum to the span exactly -- every stream owns its own mask block, which '
      + 'is what makes rewriting each header safe');
  });

// ===============================================================================================
// SECTION 5 -- THE CLOSURE. The port's own Stage-4 background VM, which used to THROW.
//
// This is the half of the wave the sheet cannot show. `elemSpawn` (`$262366`) resolves the
// constructor the table names through `BGELEM_BY_CTOR` and calls `unreached` -- which THROWS --
// on one it does not carry. So before this wave Stage 4's background could not be driven past
// frame 2,624: at 2,625 the scroll script's op $10 asks for id 1, `$263038`, and the port died.
//
// TRAP 23 IS EXPLICITLY RESPECTED HERE. This harness is `backgroundInit` + `backgroundFrame`
// alone, with no player, no enemies and no stage end, and [M] it reaches its own frontier at
// frame 5,968 -- `$26134E`'s map-column pointer walks off the exported column window and
// `rom.u32` refuses `$83E0002C` by address. So the run is bounded at 5,900 and this test asserts
// ONLY WHAT IT SEES: ids 5, 1 and 2, at frames 1, 2,625 and 5,761. **It makes no claim whatever
// about ids 0, 3, 4 and 6.** Those four are ported and their art is in the sheet (SECTIONS 2 and
// 3), and this run does not witness them; saying otherwise would be W394's "443-frame formation"
// again, a number that was really the distance to a crash.
// ===============================================================================================

test('W396 SECTION 5: the port\'s own Stage-4 VM runs 5,900 frames, constructs ids 5/1/2 out of '
  + 'the registry, and stages all three into BUCKET 2', { skip: SKIP }, () => {
    assertTheDuplicatePair();
    const ROM = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
    const ram = new Ram();
    const vram = new BgVram();
    const bgA5 = 0x80e240;
    const spawns = [];
    let frame = 0;
    const ctx = { unportedLog: new UnportedLog(), soundPost() {},
      scrollEvent: (e) => { if (e.kind === 'bgelem') spawns.push({ id: e.id, frame }); } };
    ram.setU16(BGRAM.stageX4, 12);                       // internal stage index 3
    ram.setU16(bgA5 + BGO.entryClock, 0);
    backgroundInit(ram, ROM, vram, ctx, bgA5);
    assert.equal(ram.u32(BGRAM.elemTable), STAGE4_TABLE,
      '$262332 installed $2622D6 as this stage\'s handler table -- which is what makes every '
      + 'id below index THIS table and not another stage\'s');

    const staged = new Map();
    const construct = new Map();
    for (frame = 1; frame <= 5900; frame++) {
      const before = spawns.length;
      ram.setU16(BUCKETS[2].counter, 0);               // read this frame's records alone
      backgroundFrame(ram, ROM, vram, ctx, bgA5);
      if (spawns.length > before) {
        const id = spawns[spawns.length - 1].id;
        for (let s = 0; s < 8; s++) {
          const slot = BGRAM.elemSlots + s * 0x20;
          if (ram.u8(slot + ESLOT.active) === 0) continue;
          construct.set(id, { upd: ram.u32(slot + ESLOT.update),
            data: ram.u32(slot + ESLOT.data), yPos: ram.u16(slot + ESLOT.yPos),
            kind: ram.u16(slot + ESLOT.kind) });
        }
      }
      const n = ram.u16(BUCKETS[2].counter);
      for (let o = 0; o < n; o += 12) {
        const d = ram.u32(BUCKETS[2].buffer + o + 4);
        if (!staged.has(d)) staged.set(d, frame);
      }
    }

    // **WHAT THE RUN SAW.** Id 1 at 2,625 is the frame the port used to die on.
    assert.deepEqual(spawns, [{ id: 5, frame: 1 }, { id: 1, frame: 2625 },
      { id: 2, frame: 5761 }],
    'three op-$10 requests in 5,900 frames: id 5 at clock 0 (W211\'s), then id 1, then id 2');

    // Each one CONSTRUCTED the registry's own four fields into its slot -- `elemConstruct` is
    // `$262FC8`'s five instructions, and this is them landing in RAM.
    for (const id of [5, 1, 2]) {
      const h = S3.find((r) => r.id === id);
      assert.deepEqual(construct.get(id),
        { upd: h.upd, data: h.data, yPos: h.yPos, kind: h.kind },
        `id ${id}: ($8,A6) ($10,A6) ($14,A6) and ($C,A6) hold the constructor's immediates`);
    }

    // ...and each one STAGED, on its own spawn frame, into bucket 2 -- `$23DF2A`, the emitter
    // SECTION 1 read out of `upd+$2E`, not bucket 1.
    const { rows, shard } = bundle();
    for (const [id, at] of [[5, 1], [1, 2625], [2, 5761]]) {
      const h = S3.find((r) => r.id === id);
      assert.equal(staged.get(h.data), at,
        `id ${id}'s $${h.data.toString(16).toUpperCase()} is on the bucket-2 display list on `
        + 'frame ' + at + ', its own spawn frame');
      const r = rows.get(h.data);
      assert.ok(r, 'and the address the RUNNING PORT puts on the display list is in the shipped '
        + 'stream list -- before this wave two of these three were not, so the renderer named '
        + 'them as missing art and drew nothing');
      assert.ok(r.base >= shard.maskFrom && r.base < shard.maskFrom + shard.maskLen,
        `id ${id} is in shard 11`);
    }
  });

// ===============================================================================================
// SECTION 6 -- ABLATED FROM THE IMAGE. Each guard, mutated, throws BY ADDRESS.
// ===============================================================================================
//
// `tools/export-web.mjs` reads the DECRYPTED 68000 image directly (`romBe32`/`romBe16` over
// `tools/oracle/out/maincpu.bin`), not `rip/port/player.tables.json`, so these guards cannot be
// ablated out of the exported ROM windows the way a port dependency can. W395 gave the exporter
// a `--cpu` override for exactly this: each run below feeds it one mutated byte pair of a private
// copy of the cartridge and asserts the message names the address.
//
// NO NEW ROM WINDOW IS DECLARED and none is needed. The exporter does not use windows at all, and
// the only program-ROM address the PORT dereferences here -- the table $2622D6, through
// `elemSpawn`'s `rom.u32(tab + id*4)` -- is entirely inside the WAVE 13 window $262240 + $100,
// which already covered all seven cells before this wave. Asserted in the first test below, cell
// by cell. The seven `data` values are offsets into the sprite MASK rom and are never read as
// program ROM by anything.

const ablate = (patch) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'w396-'));
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

test('W396 SECTION 6: the EXTENT bound, ablated -- entry 4 of $262302 moved by one byte',
  { skip: SKIP }, () => {
    // POSITIVE CONTROL, and the whole of the no-new-window claim: the pointer-array cell and all
    // seven table entries are readable through the EXPORTED windows, so the port's only
    // program-ROM read here is already covered and this wave declares nothing.
    const ROM = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
    assert.equal(ROM.u32(ELEM_TABLE_PTRS + 3 * 4), STAGE4_TABLE,
      '$262302 entry 3 is readable through the exported windows');
    assert.equal(ROM.u32(ELEM_TABLE_PTRS + 4 * 4), STAGE4_END, '  ...and so is entry 4');
    for (let i = 0; i < 7; i++) {
      assert.equal(ROM.u32(STAGE4_TABLE + i * 4), S3[i].ctor,
        `$2622D6 entry ${i}, through the exported windows, is the row's constructor`);
      assert.equal(l(STAGE4_TABLE + i * 4), S3[i].ctor,
        '  ...and the exporter\'s own reading of the same cell, straight out of the image, agrees');
    }

    // The table's length is not typed into the exporter: it is `(entry4 - entry3) / 4`. Move the
    // far bound and the arm must refuse rather than harvest 7 entries out of a $1D-byte table.
    const out = ablate((b) => b.writeUInt32BE(STAGE4_END + 1, ELEM_TABLE_PTRS + 4 * 4));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$262302/, 'and name the pointer array');
    assert.match(out, /\$2622f3/, '  ...and the value it read');
    assert.match(out, /not a typed-in count/,
      'the message says why the pair is the extent rather than the count');
  });

test('W396 SECTION 6: the DESCRIPTOR, ablated -- ids 0 and 6\'s `move.l #imm,($10,A6)` immediates',
  { skip: SKIP }, () => {
    assertConstructors();
    // The art is read out of the instruction that writes it. BOTH halves of the duplicate pair
    // are moved together, and to the SAME new value, so that the pass-one structure (six
    // distinct descriptors, the pair sharing an updater) still holds and the guard that fires is
    // the registry comparison rather than the count.
    const out = ablate((b) => {
      b.writeUInt32BE(0x2b01d4, S3[0].ctor + 2);
      b.writeUInt32BE(0x2b01d4, S3[6].ctor + 2);
    });
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$262fc8/, 'and name id 0\'s constructor');
    assert.match(out, /draw one picture and simulate another/,
      'which is exactly what a divergence here would do');
  });

test('W396 SECTION 6: the UPDATER immediate, ablated -- id 2\'s `move.l #upd,($8,A6)` opcode',
  { skip: SKIP }, () => {
    // `upd` is read out of ctor+$10 and NOT assumed from ctor+$1E, because id 6 proves a
    // constructor can install an updater that is not the code following it. Break the opcode the
    // reader keys on and the arm must refuse rather than read an immediate out of whatever is
    // there.
    const out = ablate((b) => b.writeUInt16BE(0x2d40, S3[2].ctor + 0x0e));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$263098/, 'and name the instruction\'s own address, id 2\'s ctor+$E');
    assert.match(out, /move\.l #upd/);
  });

test('W396 SECTION 6: the `4E75` AT ctor+$1C, ablated -- id 4\'s',
  { skip: SKIP }, () => {
    // TRAP 5. The `rts` sits AT ctor+$1C, which is what makes the unit $1E bytes and what makes
    // `data` readable out of ctor+2 rather than out of some longer routine.
    const out = ablate((b) => b.writeUInt16BE(0x4e71, S3[4].ctor + 0x1c));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$26312e/, 'and name id 4\'s constructor');
    assert.match(out, /4E75.*ctor\+\$1C/i);
  });

test('W396 SECTION 6: the EMITTER, ablated -- id 3\'s `4EF9` target set to internal stage 2\'s '
  + '$23DEFC', { skip: SKIP }, () => {
    // POSITIVE CONTROL -- SECTION 1's family property, on the UN-ablated image: all seven
    // updaters are one family, all six of them jump to $23DF2A, and every one carries `6C00`.
    assertUpdaters();
    // The one field that makes these seven their own family. A row silently aliased onto W395's
    // $262B6A would harvest the same art and draw it out of the wrong bucket.
    const out = ablate((b) => b.writeUInt32BE(0x23defc, S3[3].upd + 0x2e));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$2630fa/, 'and name id 3\'s updater');
    assert.match(out, /wrong sprite bucket/);
  });

test('W396 SECTION 6: SHARED ART MUST SHARE AN UPDATER, ablated -- id 1 made to draw $2B01D0',
  { skip: SKIP }, () => {
    assertTheDuplicatePair();
    // Give a third row the pair's descriptor. Now $2B01D0 is installed by ids 0, 1 and 6 with
    // updaters $262FE6, $263056 and $262FE6 -- two behaviours reading one picture, which is the
    // shape a mis-transcribed descriptor takes, and the rule that lets this arm accept six
    // distinct streams over seven entries at all.
    const out = ablate((b) => b.writeUInt32BE(0x2b01d0, S3[1].ctor + 2));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /entries 0\/1\/6/, 'and name all three entries');
    assert.match(out, /\$262fc8 \$263038 \$26301a/, '  ...by constructor address');
    assert.match(out, /never two elements/);
  });

test('W396 SECTION 6: the DUPLICATE-PAIR COUNT, ablated -- id 6 given a seventh descriptor',
  { skip: SKIP }, () => {
    // With id 6 drawing something of its own there is no duplicate pair left, so seven entries
    // carry seven distinct descriptors. The arm must refuse: "seven entries, six streams" is a
    // MEASURED property of this table, and a harvest that silently accepted seven would be
    // harvesting a table this file has not read.
    const out = ablate((b) => b.writeUInt32BE(0x2b01d4, S3[6].ctor + 2));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$2622d6/, 'and name the table');
    assert.match(out, /7 entries and 7 distinct descriptors/);
    assert.match(out, /exactly ONE duplicate pair/);
  });
