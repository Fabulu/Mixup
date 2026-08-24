// W443 (DOCKET D56) -- **THE HYPER BEAM'S ART IS NOW IN THE BUNDLE.**
//
// The owner, verbatim:
//
//   "Laser comes out, it hits something, and it just cuts off, it has no hit
//    animation or particles"
//   "hyper has been fucked for a long time and you keep saying you found it"
//
// W442 measured the cause and deliberately did not fix it: the hyper beam's
// four frames were never exported. THIS WAVE EXPORTS THEM.
// `w442hyperbeamimpact.test.js` keeps the whole measurement -- the simulation
// is right, the records are created, pool E is byte-identical to the board --
// and its two tests that PINNED THE DEFECT are rewritten there rather than
// deleted. This file is the art half: the cartridge derivation, the four
// streams in the shipped bundle, and the ledger that reconciles.
//
// ---------------------------------------------------------------------------
// THE MECHANISM, ALL OF IT IN ONE INDEXED READ
// ---------------------------------------------------------------------------
//     $254ff8  36 2d 00 22           move.w ($22,A5),D3   the POWER step
//     $254ffc  d6 43 / d6 43         add.w D3,D3 twice    x4 -> the pair stride
//     $255000  08 2d 00 00 00 01     btst  #$0,($1,A5)    <- THE HYPER BIT
//     $255006  67 06                 beq.b $25500E
//     $255008  06 43 00 78           addi.w #$78,D3       <- THE HYPER'S GROUP
//     $25500c  60 18                 bra.b $255026
//     $25500e  0c 6d 00 02 00 5a     cmpi.w #$2,($5a,A5)  the FORMATION arm
//     $255016  06 43 00 50           addi.w #$50,D3
//     $25501c  4a 6d 00 58           tst.w ($58,A5)       the SHIP-SELECT arm
//     $255022  06 43 00 28           addi.w #$28,D3
//     $255026  43 f9 00 24 bb 0a     lea   $24BB0A,A1
//     $25502c  d2 c3                 adda.w D3,A1
//     $25502e  20 19                 move.l (A1)+,D0      the START OFFSET $1E
//     $255030  30 c0                 move.w D0,(A0)+
//     $255032  20 d9                 move.l (A1)+,(A0)+   the BLOCK POINTER
//
// **THE BRIEF FOR THIS WAVE, AND W442'S OWN COMMENT, BOTH MIS-QUOTE THIS.**
// They say `$255000 btst #$0,($1,A4)` and `$255026 lea ($24BB0A,PC),A1 /
// move.l ($4,A1),($12,A0)`. The register is **A5**, not A4; the `lea` is
// **ABSOLUTE LONG** (`43F9`), not PC-relative (`43FA`); and the pair is read
// with two `(A1)+` post-increments rather than a `($4,A1)` displacement. None
// of it changes the conclusion -- $78 is still the immediate and $24BB0A still
// the table -- but the bytes are asserted here as they ARE, because a test that
// pins a mis-quote is a test that goes red for the wrong reason later.
// THE THREE ARMS ARE A PRIORITY LADDER AND THE HYPER IS FIRST: bit 0 of
// `($1,A5)` short-circuits past both the formation and the ship-select tests,
// so a hyper beam uses +$78 whatever the ship and formation are. That is why
// ONE block serves all five power steps.
//
// `$24BB0A` is TWENTY `(startOffset, pointer)` pairs of eight bytes. `#$78` is
// a BYTE offset, so the hyper is entries $78/$8 = 15..19 -- five power steps,
// the same width as the +$0 group the plain laser uses. [M] ALL FIVE POINT AT
// ONE BLOCK, `$24BAE2`, and that block is the LAST of the twenty
// (`$24B7EA + 19 x $28`), so the hyper beam has a SINGLE four-frame animation
// shared by every power step. `$2550A0 subi.w #$A` walks it from `$1E` down to
// `$0` and reads `($a,A6)` at each stop, giving
//
//     $022084  $022268  $02244C  $022630      stride exactly $1E4
//
// -- which is, to the address, the four bucket-16 streams W442 measured the
// port asking for and the bundle not having: 22 records each, 88 in 100 frames.
//
// ---------------------------------------------------------------------------
// **HOW THIS TEST FAILS IF THE ART IS FAKED.** Stated explicitly, because
// hand-adding four stream ids would satisfy a naive "are they present" check.
// ---------------------------------------------------------------------------
// 1. SECTION 1 never looks at the bundle. It DERIVES the four addresses from
//    `rip/sound/maincpu.bin` -- the group offset out of `$255008`'s own
//    immediate, the entry index by dividing it by the pair stride, the block by
//    following the pointer, the frames by walking the block. Every later
//    section compares the bundle against THAT array, never against a literal.
// 2. SECTION 2 requires the four to be CONTIGUOUS in shard 10's packed mask, in
//    frame order, each stream's `maskWords` equal to the mask ROM chain's own
//    extent, and their pixels equal to the cartridge's word for word. A stream
//    id appended to a list without harvesting the pixels has no packed block at
//    all, and one harvested from the wrong place has the wrong words.
// 3. SECTION 3 preserves the exact hyper derivation while accepting W497's new
//    reachable regular groups. It requires all 64 distinct frames produced by
//    the twenty entries to exist on shard 10 and reconciles every shard count.
// 4. SECTION 4 requires the separate hyper ledger row to retain its exact four
//    frames, while the regular row must reconcile `added + already == entries`.
//
// W443 moved no ROM window. W497 adds only the unrelated 24-byte `$253A58`
// Type-B hit-flag window; SECTION 5 confirms the existing beam windows still
// serve the hyper block and pointer table whole.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS } from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const here = (p) => path.join(R, p);

const IMAGE = here('rip/sound/maincpu.bin');
const MASKROM = here('rip/rom/cave_b04401w064.u1');
const MANIFEST = here('assets/manifest.json');
const STREAMS = here('assets/spr/streams.u32.gz');
const SHEET10 = here('assets/spr/mask.shard10.u16.gz');
const TABLES = here('rip/port/player.tables.json');

const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_SHEET = (existsSync(MANIFEST) && existsSync(STREAMS)) ? false
  : 'assets/ has not been exported (node games/ddpdoj/tools/export-web.mjs); '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_MASK = (existsSync(MASKROM) && existsSync(SHEET10)) ? false
  : 'rip/rom/cave_b04401w064.u1 or assets/spr/mask.shard10.u16.gz is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_TABLES = existsSync(TABLES) ? false
  : 'rip/port/player.tables.json is absent. THIS IS A SKIP, NOT A PASS.';

const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => u16(a) * 0x10000 + u16(a + 2);
const hx = (v) => `$${v.toString(16).toUpperCase()}`;

// The cartridge's own shape of the beam's animation table, named so the
// derivation below reads as the code it mirrors and not as a pile of constants.
const PTRTAB = 0x24bb0a;      // $255026 lea ($24BB0A,PC),A1
const PAIRS = 20;
const PAIRSTRIDE = 8;         // (startOffset.l, pointer.l)
const BLOCKS = 0x24b7ea;      // the block array the pairs index
const BLOCKBYTES = 0x28;
const FRAME0 = 0x1e;          // every pair's start offset
const FRAMESTEP = 0x0a;       // $2550A0 subi.w #$A

const LASER_SHARD = 10;

// ===========================================================================
// SECTION 1 -- THE CARTRIDGE. The four addresses are DERIVED, never typed.
// ===========================================================================

/** Walks the 68k image the way `$255000..$25502C` does and returns
 *  `{ groupBytes, first, block, frames }`. Nothing here reads the bundle. */
function deriveHyper() {
  // (a) THE INDEX. D3 is the POWER step, scaled by FOUR -- `($22,A5)` is
  //     already doubled, so x4 is the eight-byte pair stride and not a x4 of
  //     the raw power.
  assert.deepEqual([...IMG.subarray(0x254ff8, 0x255000)],
    [0x36, 0x2d, 0x00, 0x22, 0xd6, 0x43, 0xd6, 0x43],
    '$254FF8 move.w ($22,A5),D3 / add.w D3,D3 / add.w D3,D3');

  // (b) THE HYPER ARM, byte for byte, and it is A5 -- not the A4 the brief and
  //     W442's comment both say. `btst #$0,($1,A5)` tests the bit
  //     `$24989E bset #$0,($1,A6)` sets, and it is the only thing that makes
  //     this beam the hyper beam (W442 test 4 drives it live, 99 frames of
  //     100).
  assert.deepEqual([...IMG.subarray(0x255000, 0x255006)],
    [0x08, 0x2d, 0x00, 0x00, 0x00, 0x01], '$255000 btst #$0,($1,A5)');
  assert.equal(u16(0x255006), 0x6706, '$255006 beq.b to the FORMATION arm');
  assert.equal(u16(0x255008), 0x0643, '$255008 addi.w #imm,D3');
  const groupBytes = u16(0x25500a);
  assert.equal(u16(0x25500c), 0x6018,
    '$25500C bra.b $255026 -- the hyper arm SHORT-CIRCUITS the other two, so '
    + 'a hyper beam uses this group whatever the ship and formation are. That '
    + 'is why ONE block serves all five power steps');

  // (c) THE OTHER TWO ARMS, so that "+$78 is the hyper" is a distinction the
  //     cartridge draws and not a label this file applies.
  assert.deepEqual([...IMG.subarray(0x25500e, 0x255014)],
    [0x0c, 0x6d, 0x00, 0x02, 0x00, 0x5a], '$25500E cmpi.w #$2,($5a,A5)');
  assert.equal(u16(0x255018), 0x0050, '...and its group offset is $50');
  assert.deepEqual([...IMG.subarray(0x25501c, 0x255020)],
    [0x4a, 0x6d, 0x00, 0x58], '$25501C tst.w ($58,A5) -- the ship select');
  assert.equal(u16(0x255024), 0x0028, '...and its group offset is $28');

  // (d) THE READ THE GROUP OFFSET INDEXES. `43F9` is `lea xxx.L,A1`: an
  //     ABSOLUTE LONG, so the base is the longword itself.
  assert.equal(u16(0x255026), 0x43f9, '$255026 lea xxx.L,A1 (ABSOLUTE, 43F9)');
  assert.equal(u32(0x255028), PTRTAB, '...and the long IS $24BB0A');
  assert.equal(u16(0x25502c), 0xd2c3, '$25502C adda.w D3,A1');
  assert.equal(u16(0x25502e), 0x2019,
    'move.l (A1)+,D0 -- the START OFFSET longword of the pair');
  assert.equal(u16(0x255032), 0x20d9,
    'move.l (A1)+,(A0)+ -- and its BLOCK POINTER, into the beam record');

  // (e) THE ENTRY INDEX, divided out of the immediate rather than written down.
  assert.equal(groupBytes % PAIRSTRIDE, 0,
    'the group offset is a whole number of pairs');
  const first = groupBytes / PAIRSTRIDE;

  // (f) THE TABLE. Twenty pairs, every one carrying start offset $1E, every
  //     pointer landing on the block array's own grid, and the array ABUTTING
  //     the pair table -- which is the only thing that says there are twenty.
  assert.equal(BLOCKS + PAIRS * BLOCKBYTES, PTRTAB,
    'the block array ends exactly where the pair table begins');
  const blockAt = new Set();
  for (let k = 0; k < PAIRS; k++) blockAt.add(BLOCKS + k * BLOCKBYTES);
  const ptrs = [];
  for (let i = 0; i < PAIRS; i++) {
    const a = PTRTAB + i * PAIRSTRIDE;
    assert.equal(u32(a), FRAME0, `pair ${i} starts at $1E`);
    const p = u32(a + 4);
    assert.ok(blockAt.has(p), `pair ${i}'s pointer ${hx(p)} is on the grid`);
    ptrs.push(p);
  }

  // (g) THE HYPER'S GROUP IS ONE BLOCK, AND IT IS THE LAST ONE.
  const group = ptrs.slice(first);
  const block = BLOCKS + (PAIRS - 1) * BLOCKBYTES;
  assert.equal(new Set(group).size, 1,
    'all the +$78 pairs point at ONE block: the hyper beam has ONE animation, '
    + 'shared by every power step');
  assert.equal(group[0], block,
    `and it is ${hx(block)}, the LAST of the twenty`);

  // (h) THE FRAMES. `$2550A0 subi.w #$A,($10,A6)` from $1E down to 0, `($a,A6)` each.
  assert.equal(FRAME0 + FRAMESTEP, BLOCKBYTES,
    'the walk fills a $28 block exactly');
  const frames = [];
  for (let off = FRAME0; off >= 0; off -= FRAMESTEP) {
    frames.push(u32(block + off + 4) & 0x7fffff);
  }
  return { groupBytes, first, block, frames, group };
}

test('W443 SECTION 1: $255008\'s own #$78 puts the hyper on entries 15..19, all '
  + 'five point at the ONE block $24BAE2, and its four frames are $022084 '
  + '$022268 $02244C $022630 at stride $1E4', { skip: SKIP_IMG }, () => {
  const h = deriveHyper();
  assert.equal(h.groupBytes, 0x78, 'the immediate is $78');
  assert.equal(h.first, 15, '$78 / $8 = entry 15');
  assert.equal(h.group.length, 5,
    'five power steps, the same width as the +$0 group the plain beam uses');
  assert.equal(h.block, 0x24bae2);
  // The walk runs DOWN the block's offsets, which comes out ASCENDING in
  // address here -- and that ordering is itself part of the claim.
  assert.deepEqual(h.frames, [0x022084, 0x022268, 0x02244c, 0x022630],
    'the four W442 measured bucket 16 asking for, 22 records each, 88 in 100 '
    + 'frames, and NONE of them in any shard of the shipped bundle');
  for (let i = 1; i < h.frames.length; i++) {
    assert.equal(h.frames[i] - h.frames[i - 1], 0x1e4,
      'four frames of ONE animation, not four strays');
  }
  // AND THE PLAIN LASER IS A DIFFERENT BLOCK, which is the whole of D56: the
  // bundle harvested entry 0's block and the hyper's is nineteen blocks on.
  assert.equal(u32(PTRTAB + 4), BLOCKS, 'entry 0 -> $24B7EA, the plain beam');
  assert.equal(u32(BLOCKS + FRAME0 + 4) & 0x7fffff, 0x014d28,
    'whose first frame is $014D28 -- in B16_MEASURED, shipped since W58');
  assert.notEqual(BLOCKS, h.block);
  assert.ok(h.block < PTRTAB, 'and $24BAE2 is $28 bytes BELOW the pair table '
    + 'the old harvest was declared from, which is why no entry of that '
    + 'harvest could ever reach it');
});

test('W443/W497 SECTION 1: entries 5..14 are ten regular blocks and remain '
  + 'distinct from the exact hyper group',
{ skip: SKIP_IMG }, () => {
  // The +$28 (ship select) and +$50 (formation) groups are not the hyper.
  // W497 makes them reachable and packs them, while this structural distinction
  // keeps the +$78 equality proof non-vacuous.
  const seen = new Set();
  for (let i = 5; i < 15; i++) seen.add(u32(PTRTAB + i * PAIRSTRIDE + 4));
  assert.equal(seen.size, 10, 'ten distinct blocks, one per entry');
  assert.equal(seen.has(0x24bae2), false, 'and NOT the hyper\'s');
  assert.equal(seen.has(0x24b7ea), false, '...nor the plain beam\'s');
  const off = [];
  for (const b of seen) {
    for (let o = FRAME0; o >= 0; o -= FRAMESTEP) {
      off.push(u32(b + o + 4) & 0x7fffff);
    }
  }
  assert.equal(off.length, 40);
  assert.equal(new Set(off).size, 40,
    'forty distinct regular-group streams, separate from the hyper four');
});

// ===========================================================================
// The shipped bundle. W419's TRAP: planes 0 AND 1 are first-differenced and
// only plane 2 is raw. Reading plane 1 without accumulating gives every stream
// a base of a few hundred, files them all under shard 0, and makes a shard
// assertion pass while saying nothing.
// ===========================================================================
function shipped() {
  const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(man.spr.streamsFormat, 'planes-delta-1',
    'a bundle written by another encoder is refused by NAME, not decoded');
  const raw = gunzipSync(readFileSync(STREAMS));
  const a = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
  const n = man.spr.streamCount;
  assert.equal(a.length, n * 3, 'streams.u32 is streamCount x 3');
  let rom = 0, base = 0;
  const byRom = new Map();
  for (let i = 0; i < n; i++) {
    rom = (rom + a[i]) >>> 0;
    base = (base + a[n + i]) >>> 0;
    byRom.set(rom, { offs: rom, base, maskWords: a[2 * n + i] });
  }
  const shardOfBase = (b) => {
    for (const s of man.spr.shards) {
      if (b >= s.maskFrom && b < s.maskFrom + s.maskLen) return s.i;
    }
    return -1;
  };
  return { man, byRom, shardOfBase };
}

// ===========================================================================
// SECTION 2 -- THE FOUR ARE IN THE SHIPPED BUNDLE, AND THEY ARE THE PIXELS.
// ===========================================================================

test('W443 SECTION 2: all four hyper frames are in spr/streams.u32, on the '
  + 'LASER shard, contiguous in frame order, with the mask ROM chain\'s own '
  + 'extents', { skip: SKIP_IMG || SKIP_SHEET }, () => {
  const { frames } = deriveHyper();
  const { man, byRom, shardOfBase } = shipped();
  const absent = frames.filter((o) => !byRom.has(o)).map(hx);
  assert.deepEqual(absent, [], '**DOCKET D56.** Every one of the hyper beam\'s '
    + 'four frames is in the shipped stream list. This assertion was RED at '
    + 'W442 for all four, and 88 of the beam\'s own records in 100 frames had '
    + 'no picture in any browser');

  const rows = frames.map((o) => byRom.get(o));
  const shard = man.spr.shards[LASER_SHARD];
  assert.equal(shard.kind, 'laser', 'shard 10 is the beam\'s own shard');
  for (let i = 0; i < rows.length; i++) {
    assert.equal(shardOfBase(rows[i].base), LASER_SHARD,
      `${hx(frames[i])} is in shard 10, beside the beam it belongs to`);
    assert.ok(rows[i].base >= shard.maskFrom
      && rows[i].base + rows[i].maskWords <= shard.maskFrom + shard.maskLen,
      `${hx(frames[i])} lies wholly inside shard 10's packed span. "Which `
      + 'shard is this stream in" is a range test on the packed base -- there '
      + 'is no fourth manifest field');
  }
  // CONTIGUOUS, IN FRAME ORDER: appended as one family by one walk, which is
  // what a hand-added id or a scatter-gather repack does not produce.
  for (let i = 1; i < rows.length; i++) {
    assert.equal(rows[i].base, rows[i - 1].base + rows[i - 1].maskWords,
      `frame ${i} follows frame ${i - 1} in the packed mask`);
  }
  // FOUR FRAMES OF ONE SIZE -- the other half of "this is an animation".
  assert.equal(new Set(rows.map((r) => r.maskWords)).size, 1,
    'one extent for all four');
  assert.deepEqual(rows.map((r) => r.maskWords), [482, 482, 482, 482],
    '[M] the mask ROM chain\'s own extent: 2 header words + 480 mask words');
  // AND THE WALK STOPPED WHERE THE BLOCK DID. $022814 continues the $1E4 grid
  // and IS in the bundle -- W58's `$24A86A..$24B7EA` directory scan put it
  // there long ago -- but its extent is a DIFFERENT number of mask words, so
  // it is a different subject and not a fifth frame. The $28 block holds FOUR
  // $A slots and no fifth, and the ledger's `added: 4 / already: 0` is the
  // other half of that: W443 did not take it and did not need to.
  const next = byRom.get(frames[3] + 0x1e4);
  assert.ok(next, `${hx(frames[3] + 0x1e4)} is in the bundle already`);
  assert.equal(next.maskWords, 362,
    '...at 362 mask words against these four at 482');
  assert.notEqual(next.maskWords, rows[0].maskWords,
    '...so it is NOT a fifth frame of this animation, and a walk that ran on '
    + 'past the block would have taken a stream of a different size');
});

test('W443 SECTION 2: shard 10\'s shipped mask body IS the cartridge\'s, word '
  + 'for word, for all four frames',
{ skip: SKIP_IMG || SKIP_SHEET || SKIP_MASK }, () => {
  const { frames } = deriveHyper();
  const { man, byRom } = shipped();
  const shard = man.spr.shards[LASER_SHARD];
  const romBytes = readFileSync(MASKROM);
  // MAME REGION16_LE, loaded at word 0 of the sprite mask region.
  const rom = new Uint16Array(romBytes.buffer, romBytes.byteOffset,
    romBytes.byteLength >>> 1);
  const shBytes = gunzipSync(readFileSync(SHEET10));
  const sheet = new Uint16Array(shBytes.buffer, shBytes.byteOffset,
    shBytes.byteLength >>> 1);
  assert.equal(sheet.length, shard.maskLen,
    'the shipped file is exactly the span the manifest publishes');

  let compared = 0;
  for (const o of frames) {
    const r = byRom.get(o);
    const at = r.base - shard.maskFrom;
    // Words 0 and 1 are the stream's COLOUR POINTER and the exporter REWRITES
    // them to the packed colour base. A sheet that shipped the cartridge's own
    // header would point the drawer at colour words that are not in the bundle.
    assert.notEqual((sheet[at] << 16) | sheet[at + 1],
      (rom[o] << 16) | rom[o + 1],
      `${hx(o)}: the two header words are re-based, not copied`);
    let diff = -1;
    for (let k = 2; k < r.maskWords; k++) {
      if (sheet[at + k] !== rom[o + k]) { diff = k; break; }
      compared++;
    }
    assert.equal(diff, -1, `${hx(o)}: mask word ${diff} of ${r.maskWords} `
      + 'differs from the cartridge -- the sheet would draw noise where the '
      + 'hyper beam is');
  }
  assert.equal(compared, 4 * (482 - 2),
    '1,920 mask words compared against the cartridge -- the four extents less '
    + 'their four two-word headers. THIS is "the picture exists", and it is '
    + 'the sentence D56 has been waiting for since the port could fire a hyper');
});

// ===========================================================================
// SECTION 3 -- THE RECONCILIATION AFTER W497'S REACHABLE REGULAR GROUPS.
// ===========================================================================

/** W497 can legitimately add browser-reachable art to several shards. The
 * reconciliation therefore checks packed-map ownership and exact span sums,
 * rather than freezing W442's whole-bundle totals. */

test('W443/W497 SECTION 3: every beam-table frame is packed and the shard set '
  + 'reconciles exactly',
{ skip: SKIP_IMG || SKIP_SHEET }, () => {
  const { man, byRom, shardOfBase } = shipped();
  const tableFrames = new Set();
  for (let i = 0; i < PAIRS; i++) {
    const block = u32(PTRTAB + i * PAIRSTRIDE + 4);
    for (let off = FRAME0; off >= 0; off -= FRAMESTEP) {
      tableFrames.add(u32(block + off + 4) & 0x7fffff);
    }
  }
  assert.equal(tableFrames.size, 64,
    '15 regular entries yield 60 unique frames and five hyper entries share four');
  assert.deepEqual([...tableFrames].filter((o) => !byRom.has(o)), [],
    'all regular and hyper beam frames are in the packed map');
  for (const offs of tableFrames) {
    assert.equal(shardOfBase(byRom.get(offs).base), LASER_SHARD,
      `${hx(offs)} belongs to the laser shard`);
  }
  assert.equal(man.spr.shards.reduce((sum, s) => sum + s.streams, 0),
    man.spr.streamCount,
    'the disjoint shard stream counts sum exactly to the global count');
});

test('W443/W497 SECTION 3: shard 10 streams sum to its packed span exactly',
{ skip: SKIP_SHEET }, () => {
  const { man, byRom } = shipped();
  const shard = man.spr.shards[LASER_SHARD];
  let sum = 0, n = 0;
  for (const r of byRom.values()) {
    if (r.base >= shard.maskFrom && r.base < shard.maskFrom + shard.maskLen) {
      sum += r.maskWords; n++;
    }
  }
  assert.equal(n, shard.streams,
    'every manifest row assigned to shard 10 is counted exactly once');
  assert.equal(sum, shard.maskLen,
    'and their extents sum to the span exactly -- every stream owns its own '
    + 'mask block, which is what makes rewriting each header safe');
});

// ===========================================================================
// SECTION 4 -- THE SEPARATE HYPER LEDGER AND EXPANDED REGULAR LEDGER.
// ===========================================================================

test('W443/W497 SECTION 4: manifest keeps the exact $24BAE2 hyper row and '
  + 'reconciles the expanded $24BB0A regular-beam row', { skip: SKIP_SHEET }, () => {
  const { man } = shipped();
  const rows = man.spr.harvest ?? [];
  const hyper = rows.find((r) => String(r.at).toUpperCase() === '$24BAE2');
  assert.ok(hyper, 'the ledger must NAME the hyper\'s block. Without it the '
    + 'four streams are back to being whatever some run happened to ask for, '
    + 'and nothing in the shipped bytes says where they came from');
  assert.equal(hyper.shard, LASER_SHARD, 'onto the laser shard');
  assert.equal(hyper.entries, 4, 'four frames');
  assert.equal(hyper.distinct, 4, 'four distinct: no two frames share art');
  assert.equal(hyper.added, 4, 'and every one of them is NEW -- not one was '
    + 'already in the sheet under another table, which is what says the hyper '
    + 'beam really had no pictures');
  assert.equal(hyper.already, 0);
  assert.equal(hyper.stride, 0x0a, '$2550A0 subi.w #$A, the block\'s own step');
  assert.equal(hyper.endsAt, '$24BB0A', 'and the block ends exactly where the '
    + 'pair table begins -- the bound is the cartridge\'s own adjacency, not a '
    + 'count typed into the exporter');

  // W58's ledger row now includes W497's reachable +$28 and +$50 groups. Its
  // internal accounting must still close exactly.
  const w58 = rows.find((r) => String(r.at).toUpperCase() === '$24BB0A');
  assert.ok(w58, 'the regular-beam harvest is still declared from $24BB0A');
  assert.equal(w58.shard, LASER_SHARD);
  assert.equal(w58.entries, w58.distinct, 'the row reports its exact distinct union');
  assert.equal(w58.added + w58.already, w58.entries,
    'new plus pre-existing streams reconciles to the row total');
  assert.equal(w58.endsAt, '$24C080');
});

// ===========================================================================
// SECTION 5 -- NO WINDOW MOVES, AND THE ONE THAT ALREADY EXISTS IS NAMED.
// ===========================================================================

test('W443/W497 SECTION 5: W226\'s $24B900+$02AA serves all beam groups whole',
{ skip: SKIP_TABLES }, () => {
  const json = JSON.parse(readFileSync(TABLES, 'utf8'));
  // `rom.windows` is `{ base: "$25321E", len, why, hex }` -- the base is a HEX
  // STRING, and reading it as a number files every window at NaN and makes the
  // containment test below vacuously false (or, with a `??`, vacuously true).
  const list = json.rom.windows;
  const rows = list.map((w) => ({
    base: parseInt(String(w.base).replace('$', ''), 16), len: w.len,
  }));
  assert.equal(rows.length, ROM_WINDOW_COUNT,
    'the shipped table carries exactly the declared window count');
  assert.ok(rows.every((w) => Number.isFinite(w.base) && w.len > 0),
    'every window decoded to a real base and length');
  const holds = (from, to) => rows.some((w) =>
    from >= w.base && to <= w.base + w.len);
  assert.ok(holds(0x24bae2, 0x24bae2 + BLOCKBYTES),
    'the hyper block $24BAE2..$24BB0A is served WHOLE by ONE window. '
    + 'src/rom.js #at will not stitch a read across a seam -- W226\'s own '
    + 'lesson, and W428\'s');
  assert.ok(holds(PTRTAB, PTRTAB + PAIRS * PAIRSTRIDE),
    'and so is the pair table it abuts');
  // W551-W570 add unrelated data windows; no beam window moves.
  assert.equal(ROM_WINDOW_COUNT, 843,
    'W497 and W500-W570 reconcile the current exact RomWindows registry');
  assert.equal(ROM_OVERLAP_PAIRS, 77,
    'the beam window is unchanged; W518 adds the later forced slot-[15] data overlap');
});
