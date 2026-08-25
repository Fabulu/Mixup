// ===============================================================================================
// W395 -- THE FOURTEEN PICTURES INTERNAL STAGE 2 DRAWS WITH, AND THE FOURTH BGELEM HARVEST ARM.
// ===============================================================================================
//
// UNIT. `tools/export-web.mjs`. It had BGELEM art arms for `stage === 0` (W86, thirteen), for
// `stage === 1` (W168, eight, one of them a 32-pair animation) and for `stage === 3` (W211, one
// cell). It had NO arm for `stage === 2`, so the fourteen rows W394 ported -- internal stage
// index 2, human Stage 3, the stage DEMO 2 plays -- were harvested by nothing:
//
//   $290F10 $292094 $294018 $295F9C $2961A0 $298124 $29A0A8
//   $29C02C $29CC90 $29DC54 $29FBD8 $2A1B5C $2A3AE0 $2A5A64
//
// The port computed the whole stage correctly and had no picture at the end of it. That is W86's
// BLACK TERRAIN, one stage over, and W394's own SECTION 5 named these addresses so this wave
// could harvest them.
//
// **THE BAR HERE IS THE SHEET, NOT THE CODE PATH.** A test that only proves the arm ran would
// pass on a bundle whose mask words are zero. SECTION 3 therefore reads
// `assets/spr/mask.shard11.u16.gz` back and compares it WORD FOR WORD against
// `rip/rom/cave_b04401w064.u1` -- 86,448 words of real mask data, at the packed offsets the
// manifest publishes.
//
// **WHERE THE BRIEF IS WRONG, from the bytes:**
//
//   1. "stage 2" is ambiguous in this file and the brief uses BOTH meanings in one sentence.
//      `stage === 2` is the INTERNAL index; `tools/export-web.mjs` already calls
//      `stage === 1` "stage 2" (`STAGE2_BGELEM_TABLE = 0x26227E`) and `stage === 3` "Stage 4".
//      By the exporter's own convention these fourteen are STAGE 3, and the new constants are
//      named `STAGE3_BGELEM_TABLE`/`STAGE4_BGELEM_TABLE` to match the three arms already there.
//      SECTION 6 pins both names against the cartridge's pointer array so the numbering cannot
//      be argued about again.
//   2. "the fourteen streams ... `background.js` now has all fourteen rows (`kind $16`, `lbgt`,
//      `emit $23DEFC`, varying `data`/`yPos`/`thr`)". True, but "varying `thr`" is four values
//      over fourteen rows, not fourteen: `$7000` on ELEVEN of them and `$2000`/`$2C00`/`$3C00`
//      on ids 3, 7 and 13 alone. [M] the fourteen updaters differ from each other in ONE BYTE
//      TOTAL -- byte `+$0A`, the `addi.l` immediate's high byte -- and are otherwise identical
//      over all $34 bytes. SECTION 1.
//   3. "Add the arm, harvest the art, and prove the sheet actually gains those tiles" implies the
//      only edit is the arm. It is not: the bundle's stream count is PINNED IN ELEVEN TEST FILES
//      and shard 11's stream count is pinned in `tools/webgate.mjs`, and both had to move. The
//      numbers and the reason are in SECTION 4; the files are named in the wave report.
//
// SECTION 1  the fourteen updaters, and the one byte that separates them (no test of its own)
// SECTION 2  THE LEDGER and THE OFFSETS: all fourteen in the bundle, inside shard 11's span
// SECTION 3  **THE PIXELS**, compared against the mask ROM word for word
// SECTION 4  BEFORE AND AFTER, COUNTED: 799 -> 813 streams, 1,051,702 -> 1,138,178 mask words
// SECTION 5  the closure: a real cold boot to +10,600, and what the DEMO asks for is in the sheet
// SECTION 6  ABLATED FROM THE IMAGE -- three guards, three throws, each named by address, and
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

import { Game } from '../src/main.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS } from '../src/spritequeue.js';
import { BGELEM_HANDLERS } from '../src/background.js';

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

const S2 = BGELEM_HANDLERS.filter((h) => h.stage === 2);
const ELEM_TABLE_PTRS = 0x262302;
const STAGE3_TABLE = 0x26229e;
const STAGE4_TABLE = 0x2622d6;
const STRUCT_SHARD = 11;

/** The exporter's own numbers, MEASURED at the commit before this wave's arm existed. They are
 *  quoted in SECTION 4 as the "before" half of the count, and every one of them is the value the
 *  shipped `assets/manifest.json` carried with three BGELEM arms instead of four. */
const BEFORE = Object.freeze({
  streamCount: 4244, shard11Streams: 799, shard11MaskLen: 1051702, shard11ColLen: 2868034,
  maskUsed: 2328784,
});

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
// SECTION 1 -- the fourteen updaters, decoded rather than pattern-matched.
//
// **THIS SECTION HAS NO `test()` OF ITS OWN, AND THAT IS DELIBERATE.** Its assertions are pure
// cartridge truth: they hold at HEAD, they held before this wave, and a test that cannot go red
// without its fix is trap 21. They are instead the POSITIVE CONTROL of SECTION 6's emitter
// ablation -- the un-ablated family property stated first, then the one byte that breaks it --
// so the same bytes are asserted and the test they live in is red without the arm.
// ===============================================================================================

/** The `$34`-byte updater unit: `$32` of code plus the `4E71` filler word at +$32. */
const UPD_UNIT = 0x34;

function assertOneFamily() {
  assert.equal(S2.length, 14, 'W394 ported all fourteen rows');
  const id0 = IMG.subarray(S2[0].upd, S2[0].upd + UPD_UNIT);
  for (const h of S2) {
    const cur = IMG.subarray(h.upd, h.upd + UPD_UNIT);
    const diffs = [];
    for (let k = 0; k < UPD_UNIT; k++) if (id0[k] !== cur[k]) diffs.push(k);
    // The `addi.l #imm,D0` at +$06 carries a LONG immediate at +$08..+$0B, so the threshold's
    // high byte is +$0A. Nothing else in the updater may differ: a second differing byte would
    // mean this stage is not one family and the harvest is reading the wrong shape.
    assert.deepEqual(diffs, h.thr === S2[0].thr ? [] : [0x0a],
      `$${h.upd.toString(16).toUpperCase()} differs from $262B6A in the threshold byte and `
      + 'in nothing else');
    assert.equal(l(h.upd + 0x08), h.thr, 'and the registry `thr` IS that immediate');
    // TRAP 4: `6E00` is `bgt.w` and its target is the EXTENSION WORD's address + disp.
    assert.equal(w(h.upd + 0x0c), 0x6e00, '`6E00 bgt.w`, which is why this row is `lbgt`');
    assert.equal(w(h.upd + 0x0e), 0x0006, '  ...disp $0006');
    assert.equal(h.upd + 0x0e + 6, h.upd + 0x14, '  ...so it branches to upd+$14');
    assert.equal(w(h.upd + 0x10), 0x4216, 'and upd+$10, the instruction it SKIPS, is `clr.b (A6)`');
    assert.equal(w(h.upd + 0x12), 0x4e75, '  ...followed by `4E75 rts`: the despawn');
    // The tail jump: the field the exporter's new arm checks, and the field that would have been
    // wrong had these rows been aliased onto W168's $2627CA.
    assert.equal(w(h.upd + 0x2c), 0x4ef9, '`4EF9 jmp` closes the updater');
    assert.equal(l(h.upd + 0x2e), 0x23defc, '  ...to $23DEFC, BUCKET 1, not $23DF2A');
    assert.equal(h.emit, 0x23defc, '  ...which is what the registry row says');
  }
  // FOUR distinct thresholds over fourteen rows, not fourteen. The brief implies `thr` varies
  // freely; eleven of the fourteen carry the same one.
  assert.deepEqual([...new Set(S2.map((h) => h.thr))].sort((a, b) => a - b),
    [0x2000, 0x2c00, 0x3c00, 0x7000], 'four distinct thresholds over fourteen rows');
  assert.equal(S2.filter((h) => h.thr === 0x7000).length, 11,
    'ELEVEN of them share $7000; only ids 3, 7 and 13 do not');
  assert.deepEqual(S2.filter((h) => h.thr !== 0x7000).map((h) => h.id), [3, 7, 13]);
}

// ===============================================================================================
// SECTION 2 -- THE LEDGER and THE OFFSETS.
// ===============================================================================================

test('W395 SECTION 2: the harvest ledger carries $26229E, fourteen entries, fourteen distinct, '
  + 'fourteen NEW', { skip: SKIP }, () => {
    const { manifest } = bundle();
    const row = (manifest.spr.harvest ?? []).find((r) =>
      String(r.at).toLowerCase() === `$${STAGE3_TABLE.toString(16)}`);
    assert.ok(row, 'manifest.spr.harvest must carry the $26229E row. Without it the fourteen '
      + 'streams are back to being whatever some run happened to ask for, which is the floor '
      + 'W86 replaced for stage 1');
    assert.equal(row.shard, STRUCT_SHARD, 'the structures shard, as all four BGELEM arms use');
    assert.equal(row.entries, 14, 'fourteen handlers');
    assert.equal(row.distinct, 14, 'fourteen distinct streams: no two rows share art');
    assert.equal(row.added, 14, 'and every one of them is NEW -- not one was already in the '
      + 'sheet under another table, which is what says the stage really had no pictures');
    assert.equal(row.already, 0);
    assert.equal(row.stride, 4);
    assert.equal(row.endsAt, `$${(STAGE3_TABLE + 14 * 4).toString(16).toUpperCase()}`,
      'and it ends AT $2622D6, the next stage\'s table -- the bound is the pointer array\'s, '
      + 'not a count typed into the exporter');
  });

test('W395 SECTION 2: all fourteen are in the shipped stream list, inside shard 11\'s packed '
  + 'span, with the mask ROM\'s own extents', { skip: SKIP }, () => {
    const { rows, shard } = bundle();
    const absent = S2.filter((h) => !rows.has(h.data))
      .map((h) => '$' + h.data.toString(16).toUpperCase());
    assert.deepEqual(absent, [], 'every one of the fourteen is in spr/streams.u32');
    // [M] the extents the mask ROM's own chain gives, via src/render/spritedir.js streamExtent.
    const EXTENT = [4482, 8066, 8066, 514, 8066, 8066, 8066, 3170, 4034, 8066, 8066, 8066,
      8066, 1682];
    for (let i = 0; i < S2.length; i++) {
      const r = rows.get(S2[i].data);
      const tag = `$${S2[i].data.toString(16).toUpperCase()} (id ${i})`;
      assert.equal(r.maskWords, EXTENT[i], `${tag}: the chain's extent, not a record's`);
      assert.ok(r.base >= shard.maskFrom && r.base + r.maskWords <= shard.maskFrom + shard.maskLen,
        `${tag}: packed base ${r.base} lies inside shard ${STRUCT_SHARD}'s span `
        + `[${shard.maskFrom}, ${shard.maskFrom + shard.maskLen}). "Which shard is this stream `
        + 'in" is a range test on the packed base -- there is no fourth manifest field');
    }
    assert.equal(EXTENT.reduce((a, b) => a + b, 0), 86476,
      'the fourteen are 86,476 mask words between them');
  });

// ===============================================================================================
// SECTION 3 -- **THE PIXELS.** The bar is the sheet.
// ===============================================================================================

test('W395 SECTION 3: shard 11\'s shipped mask body IS the cartridge\'s, word for word, for all '
  + 'fourteen', { skip: SKIP }, () => {
    const { rows, shard } = bundle();
    const romBytes = readFileSync(MASKROM);
    // MAME REGION16_LE, loaded at word 0 of the sprite mask region (src/render/regions.js).
    const rom = new Uint16Array(romBytes.buffer, romBytes.byteOffset, romBytes.byteLength >>> 1);
    const shBytes = gunzipSync(readFileSync(here('../assets/spr/mask.shard11.u16.gz')));
    const sheet = new Uint16Array(shBytes.buffer, shBytes.byteOffset, shBytes.byteLength >>> 1);
    assert.equal(sheet.length, shard.maskLen,
      'the shipped file is exactly the span the manifest publishes');

    let compared = 0, rewritten = 0;
    for (const h of S2) {
      const r = rows.get(h.data);
      const at = r.base - shard.maskFrom;
      const tag = `$${h.data.toString(16).toUpperCase()}`;
      // Words 0 and 1 are the stream's COLOUR POINTER and the exporter REWRITES them to the
      // packed colour base. They must differ, and a sheet that shipped the cartridge's own
      // header would point the drawer at colour words that are not in the bundle.
      assert.notEqual((sheet[at] << 16) | sheet[at + 1], (rom[h.data] << 16) | rom[h.data + 1],
        `${tag}: the two header words are re-based, not copied`);
      rewritten++;
      // Words 2.. are wide*high MASK words and are the picture. Not one may differ.
      let diff = -1;
      for (let k = 2; k < r.maskWords; k++) {
        if (sheet[at + k] !== rom[h.data + k]) { diff = k; break; }
        compared++;
      }
      assert.equal(diff, -1, `${tag}: mask word ${diff} of ${r.maskWords} differs from the `
        + 'cartridge. The sheet would draw noise where this element is');
    }
    assert.equal(rewritten, 14);
    assert.equal(compared, 86476 - 14 * 2,
      '86,448 mask words compared against the cartridge -- the fourteen extents less their '
      + 'fourteen two-word headers. THIS is "the tiles are in the sheet"');
  });

// ===============================================================================================
// SECTION 4 -- BEFORE AND AFTER, COUNTED.
// ===============================================================================================

// **W396 MOVED EVERY TOTAL IN THIS SECTION, AND THE SECTION IS UPDATED RATHER THAN LOOSENED.**
// These are BUNDLE-WIDE numbers, so any later wave that adds a stream invalidates them by
// construction; W396 widened the exporter's Stage-4 BGELEM arm from one table cell to the whole
// seven-entry table `$2622D6` and brought FIVE more streams, all onto shard 11. W395's own
// contribution is still stated as its own term (`+ 14`, `+ 86476`, `+ 315707`) so that this test
// still says what W395 did; W396's is the second term, named and separate. Nothing here became an
// inequality, and SECTION 2 and SECTION 3 -- the fourteen streams' own offsets and their pixels --
// did not move at all, because they are about these fourteen rather than about the bundle.
//
// **W397 MOVED THEM AGAIN, and it is the LAST wave that can move them for this reason:** its arm
// is the fifth and final BGELEM arm, internal stage index 4's four-entry table `$2622F2`, and with
// it every constructor in all five per-stage tables has its picture. Its four streams are all new
// and all land on shard 11. Its term is the third one below, named and separate, so this test
// still says what W395 did.
const W396 = Object.freeze({ streams: 5, maskWords: 15562, colWords: 35647 });
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

test('W395 SECTION 4: the bundle grew by exactly these fourteen and by nothing else',
  { skip: SKIP }, () => {
    const { manifest, rows, shard } = bundle();
    assert.equal(manifest.spr.streamCount,
      BEFORE.streamCount + 14 + W396.streams + W397.streams
        + W414.streams + W417.streams + W419.streams + W422.streams + W443.streams
        + W497.streams + W498.streams + W555.streams + W556.streams + W557.streams
        + W558.streams + W560.streams + W589.streams,
      'W555 adds six Hibachi frames, W556/W557 add one fixed stream each, W558 adds 64, and '
      + 'W560 adds six selector streams and one fixed stream; W589 adds 105 slot-7 list-B streams. '
      + 'The current 5,091-stream bundle '
      + 'total is exact, never a floor');
    assert.equal(shard.streams,
      BEFORE.shard11Streams + 14 + W396.streams + W397.streams
        + W414.streams + W417.streams + W422.streams,
      '799 -> 813 -> 818 -> 822 -> 846 -> 862 -> 870 streams on shard 11');
    assert.equal(shard.maskLen,
      BEFORE.shard11MaskLen + 86476 + W396.maskWords + W397.maskWords
        + W414.maskWords + W417.maskWords + W422.maskWords,
      '1,051,702 -> 1,138,178 -> 1,153,740 -> 1,166,372 -> 1,167,700 -> 1,170,804 mask words');
    assert.equal(shard.colLen,
      BEFORE.shard11ColLen + 315707 + W396.colWords + W397.colWords
        + W414.colWords + W417.colWords + W422.colWords,
      '2,868,034 -> 3,183,741 -> 3,219,388 -> 3,260,515 -> 3,262,842 -> 3,272,730 colour words');
    assert.equal(manifest.spr.maskUsed,
      BEFORE.maskUsed + 86476 + W396.maskWords + W397.maskWords
        + W414.maskWords + W417.maskWords + W419.maskWords + W422.maskWords
        + W443.maskWords + W497.maskWords + W498.maskWords + W555.maskWords + W556.maskWords
        + W557.maskWords + W558.maskWords + W560.maskWords + W589.maskWords,
      'W555 adds 7,404 mask words, W556 adds 4,610, W557 adds 338, W558 adds 35,968, '
      + 'W560 adds 9,326, and W589 adds 9,778');

    // W395 through W443 establish the historical structure and laser additions. W497 then
    // expands shards 0, 6, 10, and 13, W498 adds nine Game Over streams to shard 0, and
    // W555 adds six Hibachi body frames, W556/W557 add one fixed body each, W558 adds
    // the shared 64-frame part table, and W560 adds six selectors and one fixed stream to shard 17.
    // Keep every current shard exact so the global total cannot hide a misplaced stream.
    const SIZES = [277, 67, 32, 54, 17, 70, 313, 298, 72, 313, 451, 870, 139, 412, 90, 4, 37,
      1415, 160];
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
// SECTION 5 -- THE CLOSURE. What demo 2 actually asks for, and the sheet that now answers.
// ===============================================================================================

test('W395 SECTION 5: a real cold boot reaches +10,514, emits into BUCKET 1, and the descriptor '
  + 'it carries IS in the shipped sheet', { skip: SKIP }, () => {
    const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
    const g = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false });
    g.boot();
    g.ram.setU8(0x803957, 1);
    for (let f = 1; f <= 10600; f++) g.step(0xffff);
    const desc = g.ram.u32(BUCKETS[1].buffer + 4);
    assert.equal(desc, 0x290f10,
      'bucket 1 record 0 carries $290F10, id 0\'s own stream. W394 pinned the emission; what '
      + 'this asserts is that the address the RUNNING PORT puts on the display list is the '
      + 'address the exporter harvested');
    const { rows, shard } = bundle();
    const r = rows.get(desc);
    assert.ok(r, 'and it is in the shipped stream list -- before this wave it was not, so the '
      + 'renderer named it as missing art and drew nothing');
    assert.ok(r.base >= shard.maskFrom && r.base < shard.maskFrom + shard.maskLen,
      'in shard 11');
    assert.equal(r.maskWords, 4482, 'with its full 4,482-word extent');
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
// the one address the PORT dereferences here -- the table $26229E, through `elemSpawn`'s
// `rom.u32(tab + id*4)` -- is already inside W-earlier window $262240 + $100, asserted below.
// The fourteen `data` values are offsets into the sprite MASK rom and are never read as program
// ROM by anything; `tests/w394bgelem.test.js` pins the nine that numerically collide with boss
// code so the coincidence cannot be misread as coverage.

const ablate = (patch) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'w395-'));
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

test('W395 SECTION 6: the EXTENT bound, ablated -- entry 3 of $262302 moved by one byte',
  { skip: SKIP }, () => {
    // POSITIVE CONTROL, and the whole of the no-new-window claim: the two pointer-array cells and
    // all fourteen table entries are readable through the EXPORTED windows, so the port's only
    // program-ROM read here is already covered by $262240 + $100 and this wave declares nothing.
    // The fourteen `data` values are sprite-MASK offsets and are never read as program ROM.
    const ROM = new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);
    assert.equal(ROM.u32(ELEM_TABLE_PTRS + 2 * 4), STAGE3_TABLE,
      '$262302 entry 2 is readable through the exported windows');
    assert.equal(ROM.u32(ELEM_TABLE_PTRS + 3 * 4), STAGE4_TABLE, '  ...and so is entry 3');
    for (let i = 0; i < 14; i++) {
      assert.equal(ROM.u32(STAGE3_TABLE + i * 4), S2[i].ctor,
        `$26229E entry ${i}, through the exported windows, is the row's constructor`);
      // ...and the exporter's own reading of the same table, straight out of the image, agrees.
      assert.equal(l(STAGE3_TABLE + i * 4), S2[i].ctor);
    }

    // The table's length is not typed into the exporter: it is `(entry3 - entry2) / 4`. Move the
    // far bound and the arm must refuse rather than harvest 14 entries out of a $39-byte table.
    const out = ablate((b) => b.writeUInt32BE(STAGE4_TABLE + 1, ELEM_TABLE_PTRS + 3 * 4));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$262302/, 'and name the pointer array');
    assert.match(out, /\$2622d7/, '  ...and the value it read');
    assert.match(out, /not a typed-in count/,
      'the message says why the pair is the extent rather than the count');
  });

test('W395 SECTION 6: the DESCRIPTOR, ablated -- id 7\'s `move.l #imm,($10,A6)` immediate',
  { skip: SKIP }, () => {
    // The art is read out of the instruction that writes it. Change what the cartridge writes
    // and the exporter must not go on shipping the registry's copy.
    const out = ablate((b) => b.writeUInt32BE(0x29c030, S2[7].ctor + 2));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$262d8a/, 'and name id 7\'s constructor');
    assert.match(out, /draw one picture and simulate another/,
      'which is exactly what a divergence here would do');
  });

test('W395 SECTION 6: the EMITTER, ablated -- id 0\'s `4EF9` target set to stage 2\'s $23DF2A',
  { skip: SKIP }, () => {
    // POSITIVE CONTROL -- SECTION 1's family property, on the UN-ablated image: all fourteen
    // updaters are one family and every one of them jumps to $23DEFC.
    assertOneFamily();
    // The one field that makes these fourteen their own family. A row silently aliased onto
    // W168's $2627CA would harvest the same art and draw it out of the wrong bucket.
    const out = ablate((b) => b.writeUInt32BE(0x23df2a, S2[0].upd + 0x2e));
    assert.ok(out, 'the exporter must THROW, not complete');
    assert.match(out, /\$262b6a/, 'and name id 0\'s updater');
    assert.match(out, /wrong sprite bucket/);
  });
