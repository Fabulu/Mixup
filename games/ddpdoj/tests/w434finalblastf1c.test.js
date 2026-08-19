// WAVE 434 -- THE LAST POOL-B SLOT THAT WAS NOT BYTE-IDENTICAL TO THE BOARD.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG
// ---------------------------------------------------------------------------
// W433 wired the stage-1 boss death to `$2440E0` (`boss2.js
// finalBlast2440E0`) and measured the result the honest way: against the
// board's own RAM dump at lf10000 of `out/w69/stage1-laser-hold`, pool-B slots
// that were byte-identical went 37/80 to 79/80. It recorded the remainder as
// "a single residue byte at `+$1C` of a FREED slot 2 -- $40 on the board, $00
// in the port", and left it for a later wave.
//
// THE CAUSE IS THAT THE ROUTINE IS UNROLLED IN THE ROM AND THE BLOCKS ARE NOT
// ALL THE SAME. `finalBlast2440E0` has always read the 39 spawns as one
// uniform loop over the 16-byte rows at `$244ACE`. [M] `tools/aligned.py sweep
// 0x2440e0 0x244ace` decodes 555 instructions: four of preamble, 39 blocks of
// FOURTEEN instructions each (546), four of tail, and ONE instruction that
// belongs to no block --
//
//     $2441B4  11 7c 00 40 00 1c    move.b #$40,($1c,A0)
//
// It stands AFTER block 2's last store (`$2441AE move.w #$2,($10,A0)`) and
// BEFORE block 3's `$2441BA move.w (A1)+,D0`, so A0 is still block 2's slot.
// The THIRD record the routine allocates, and only that one, gets `+$1C` set.
//
// WHY IT HID FOR SO LONG. `$28904E move.b D0,($1c,A0)` in the allocator itself
// runs with D0 already masked to zero, so `$289004` ZEROES the field; a port
// that never re-writes it looks exactly like a port whose allocator simply
// ran. Every other byte of row 2's record matched, on a slot that was FREED
// again by lf9975, so the only surviving evidence was one residue byte on a
// dead record.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE PROVES, AND IN WHICH ORDER
// ---------------------------------------------------------------------------
//  1. THE ROM. `$2441B4` really is `move.b #$40,($1c,A0)`, and it is the ONLY
//     instruction in `$2440F4..$244ABA` that is not part of a block: all 39
//     blocks are byte-identical 64-byte copies of block 0, laid at
//     `$2440F4 + k*$40` and, from k=3 on, shifted by the six bytes this one
//     instruction occupies. That pins WHICH allocation it belongs to by
//     arithmetic instead of by eye.
//  2. THE DELIVERABLE. Seeded from the board's lf9800 rung and stepped on the
//     board's own input words to lf10000, all EIGHTY pool-B slots are
//     byte-identical to the board's own dump -- 80/80, where W433 measured
//     79/80. The check is over all $38 bytes of all 80 slots, not a field list.
//  3. THE RED. `finalBlast2440E0` on a DIRTY `Ram` writes `$40` to `+$1C` of
//     exactly one slot and `$00` to the other 38, and the dirt is what proves
//     the `$40` was WRITTEN rather than survived: every slot is pre-loaded
//     with `$5A` there first.
//  4. THE POSITIVE CONTROL on 2 -- the board's pool B at lf10000 is not blank,
//     and the port's own pool B is not the seed's, so "80/80" cannot be two
//     empty arrays agreeing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { POOL_B, B } from '../src/effects.js';
import { finalBlast2440E0 } from '../src/boss2.js';
import { readTrace } from '../tools/portdiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const LADDER = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TRACE = path.join(LADDER, 'trace.tsv');
const CK = path.join(LADDER, 'ckpt');
const TABLES = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');

const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && fs.existsSync(path.join(CK, 'c009800.ram.bin'))
  && fs.existsSync(path.join(CK, 'c010000.ram.bin'));

const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf9800 and lf10000) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_TABLES = HAVE_TABLES ? false
  : 'rip/port/player.tables.json is absent -- `python tools/export-tables.py`. '
    + 'THIS IS A SKIP, NOT A PASS.';

const SEED_LF = 9800;                  // the rung this run starts from
const CMP_LF = 10000;                  // ...and the rung it is compared at
const RAM_BASE = 0x800000;

const BLOCK0 = 0x2440f4;               // the first `move.w (A1)+,D0`
const BLOCK_BYTES = 0x40;              // 14 instructions
const BLOCKS = 39;
const F1C_STORE = 0x2441b4;            // move.b #$40,($1c,A0)
const F1C_BYTES = [0x11, 0x7c, 0x00, 0x40, 0x00, 0x1c];
const F1C_BLOCK = 2;                   // the block whose A0 it lands in
const TAIL = 0x244aba;                 // jsr $260E36, W433's shake arm
const hx2 = (v) => `$${v.toString(16).toUpperCase().padStart(2, '0')}`;

// ===========================================================================
// 1. THE ROM -- WHICH ALLOCATION THE STORE BELONGS TO, BY ARITHMETIC
// ===========================================================================
test('W434: $2441B4 is move.b #$40,($1c,A0) and it is the ONLY instruction in '
  + '$2440E0 that is not part of one of the 39 identical blocks',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];

  assert.deepEqual(at(F1C_STORE, 6), F1C_BYTES,
    `$${F1C_STORE.toString(16).toUpperCase()} must be move.b #$40,($1c,A0)`);

  // Block 0 is the template. Blocks 0..2 are flush; blocks 3.. are pushed by
  // the six bytes of the store, which is exactly what makes it block 2's.
  const block0 = at(BLOCK0, BLOCK_BYTES);
  const startOf = (k) => BLOCK0 + k * BLOCK_BYTES + (k > F1C_BLOCK ? 6 : 0);
  const wrong = [];
  for (let k = 0; k < BLOCKS; k++) {
    if (String(at(startOf(k), BLOCK_BYTES)) !== String(block0)) {
      wrong.push(`block ${k} at $${startOf(k).toString(16).toUpperCase()}`);
    }
  }
  assert.deepEqual(wrong, [],
    'all 39 blocks must be byte-identical copies of block 0');

  // The layout closes on both ends, so no block was miscounted: block 2 ends
  // exactly where the store starts, and block 38 ends exactly at the tail.
  assert.equal(startOf(F1C_BLOCK) + BLOCK_BYTES, F1C_STORE,
    'the store must sit immediately after block 2');
  assert.equal(startOf(BLOCKS - 1) + BLOCK_BYTES, TAIL,
    'block 38 must end exactly at the $244ABA tail');
  assert.deepEqual(at(TAIL, 6), [0x4e, 0xb9, 0x00, 0x26, 0x0e, 0x36],
    'and the tail is jsr $260E36 -- W433 shake arm, unchanged');

  // A wrong-by-one reading would put the store on block 1 or block 3. State
  // that those two boundaries carry ordinary block code, so "it is block 2's"
  // is a measurement and not a preference.
  for (const k of [1, 3]) {
    assert.notDeepEqual(at(startOf(k) + BLOCK_BYTES, 6), F1C_BYTES,
      `block ${k} must NOT be followed by the store`);
  }
});

// ===========================================================================
// 2 + 4. THE DELIVERABLE, ON THE LADDER, WITH ITS POSITIVE CONTROL
// ===========================================================================
test('W434: all 80 pool-B slots are byte-identical to the board at lf10000 of '
  + 'stage1-laser-hold, seeded from its own lf9800 rung', { skip: SKIP_LADDER },
async () => {
  const { Game } = await import('../src/main.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === SEED_LF);
  const upper = man.rungs.find((r) => r.lf === CMP_LF);
  assert.ok(rung && upper, `lf${SEED_LF} and lf${CMP_LF} must both be rungs`);

  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const trace = readTrace(TRACE);
  // The ladder's own intervention, carried out of the manifest rather than
  // reinvented: $810424 (the player's invulnerability timer) held at $FF.
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));

  const game = new Game(seed, tables, {
    logicFrame: SEED_LF, videoFrame: rung.vf, bgSeed,
  });
  for (let lf = SEED_LF + 1; lf <= CMP_LF; lf++) {
    const r = trace.byLf.get(lf);
    assert.ok(r, `the trace must carry lf${lf}`);
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(r.portin));       // THE BOARD'S OWN INPUT WORD, not a bench
  }

  const board = new Uint8Array(fs.readFileSync(path.join(CK, upper.ram)));
  const port = game.ram.b;
  const slotOff = (s) => POOL_B.base - RAM_BASE + s * POOL_B.stride;

  // POSITIVE CONTROL FIRST, both directions. If the board's pool were blank
  // AND the port's were blank this comparison would pass on nothing, and the
  // seed's own pool is what proves the 200 frames actually rewrote it.
  const nonBlank = (buf) => {
    let n = 0;
    for (let s = 0; s < POOL_B.slots; s++) {
      for (let k = 0; k < POOL_B.stride; k++) if (buf[slotOff(s) + k]) { n++; break; }
    }
    return n;
  };
  // [M] EXACTLY 39 of the board's 80 slots carry any non-zero byte at lf10000,
  // and NOT ONE of them is live. `$2440E0` cleared all 4,538 bytes at lf9902
  // and then allocated its 39 rows into slots 0..38 in order; by lf10000 every
  // one of them has been freed again. So this whole rung is a comparison of
  // RESIDUE, which is exactly why one byte of it could hide for a wave.
  assert.equal(nonBlank(board), 39,
    `the board's pool B at lf${CMP_LF} must carry the 39 rows $2440E0 seeded`);
  let boardLive = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOff(s);
    if (((board[o + B.status] << 8) | board[o + B.status + 1]) !== 0) boardLive++;
  }
  assert.equal(boardLive, 0,
    `every pool-B slot is FREE on the board at lf${CMP_LF} -- all 39 are residue`);
  let movedFromSeed = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    for (let k = 0; k < POOL_B.stride; k++) {
      if (seed[slotOff(s) + k] !== port[slotOff(s) + k]) { movedFromSeed++; break; }
    }
  }
  // [M] 43 when this was written. Stated as a floor because the deliverable
  // below pins the port byte for byte anyway; the only job here is to refuse a
  // run that stalled and handed back its own seed.
  assert.ok(movedFromSeed >= 39,
    `the port's pool B must have MOVED away from the lf${SEED_LF} seed; only `
    + `${movedFromSeed} of ${POOL_B.slots} slots differ from it`);

  // THE DELIVERABLE: every one of the $38 bytes of every one of the 80 slots.
  const differ = [];
  let identical = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOff(s);
    const bytes = [];
    for (let k = 0; k < POOL_B.stride; k++) {
      if (board[o + k] !== port[o + k]) {
        bytes.push(`+$${k.toString(16).toUpperCase().padStart(2, '0')} `
          + `board ${hx2(board[o + k])} port ${hx2(port[o + k])}`);
      }
    }
    if (bytes.length === 0) identical++;
    else {
      differ.push(`slot ${s} @ $${(POOL_B.base + s * POOL_B.stride)
        .toString(16).toUpperCase()}: ${bytes.join(', ')}`);
    }
  }
  assert.deepEqual(differ, [],
    `every pool-B slot must be byte-identical to the board at lf${CMP_LF}`);
  assert.equal(identical, POOL_B.slots, '80 of 80, stated as a count too');

  // AND THE BYTE THIS WAVE IS ABOUT, named, on the FREED slot it lives on.
  const two = slotOff(2);
  assert.equal((board[two + B.status] << 8) | board[two + B.status + 1], 0,
    'slot 2 is FREE at lf10000 -- this is a RESIDUE byte, not a live field');
  assert.equal(board[two + B.f1c], 0x40, 'the board leaves $40 at +$1C');
  assert.equal(port[two + B.f1c], 0x40, '...and so must the port');
});

// ===========================================================================
// 3. THE RED -- THE STORE ITSELF, ON A DIRTY POOL
// ===========================================================================
test('W434: finalBlast2440E0 sets +$1C on exactly one of its 39 records and '
  + 'clears it on the other 38 -- measured over dirt, not over a fresh Ram',
{ skip: SKIP_TABLES }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const ctx = { unportedLog: new UnportedLog() };

  // DIRTY EVERY FIELD. `$28904E` zeroes `+$1C`, so a fresh `Ram` would let a
  // port that writes NOTHING there agree with 38 of the 39 slots by accident.
  // Pre-load $5A everywhere: now a slot reading $00 has been through the
  // allocator, a slot reading $40 has been through $2441B4, and a slot reading
  // $5A was never touched at all -- three distinguishable outcomes instead of
  // two.
  for (let s = 0; s < POOL_B.slots; s++) {
    const a = POOL_B.base + s * POOL_B.stride;
    for (let k = 0; k < POOL_B.stride; k++) ram.setU8(a + k, 0x5a);
    ram.setU16(a + B.status, 0);       // ...but FREE, or nothing can allocate
  }
  ram.setU16(POOL_B.count, 0x5a5a);
  ram.setU16(0x813092, 1);             // stage 1, so the hook takes the #$1 arm

  const a6 = 0x812000;                 // a scratch parent; only ($2,A6) is read
  ram.setU32(a6 + 0x02, 0x01234567);
  finalBlast2440E0(ram, rom, ctx, a6);

  // The pool is cleared first, so `$289004` hands out 0, 1, 2, ... in order and
  // ROW k IS SLOT k. That identity is what makes "block 2" and "slot 2" the
  // same statement, so it is asserted rather than assumed.
  for (let s = 0; s < BLOCKS; s++) {
    assert.equal(ram.u16(POOL_B.base + s * POOL_B.stride + B.status) & 0x8000,
      0x8000, `row ${s} must have landed in slot ${s}`);
  }

  const f1c = [];
  for (let s = 0; s < POOL_B.slots; s++) {
    f1c.push(ram.u8(POOL_B.base + s * POOL_B.stride + B.f1c));
  }
  assert.deepEqual(
    f1c.slice(0, BLOCKS).map((v, i) => (v ? `${i}:${hx2(v)}` : null)).filter(Boolean),
    [`${F1C_BLOCK}:${hx2(0x40)}`],
    'exactly one of the 39 allocated slots may carry a non-zero +$1C');
  assert.equal(f1c.slice(0, BLOCKS).filter((v) => v === 0).length, BLOCKS - 1,
    'and the other 38 are ZERO -- put there by the allocator, over $5A dirt');

  // The dirt was real, and this is what says so: `$288E0C` runs first and
  // wipes all 4,538 bytes, so NOTHING anywhere in the pool still reads $5A and
  // the 41 slots past the 39 are blank rather than merely untouched.
  let stillDirty = 0, blankTail = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const a = POOL_B.base + s * POOL_B.stride;
    let blank = true;
    for (let k = 0; k < POOL_B.stride; k++) {
      if (ram.u8(a + k) === 0x5a) stillDirty++;
      if (ram.u8(a + k) !== 0) blank = false;
    }
    if (s >= BLOCKS && blank) blankTail++;
  }
  assert.equal(stillDirty, 0, 'no byte of pool B may survive $288E0C as $5A');
  assert.equal(blankTail, POOL_B.slots - BLOCKS,
    'the 41 slots past the 39 are BLANK -- cleared, not skipped');
  assert.equal(ram.u16(POOL_B.count), 0,
    'and $81C8EA, dirtied to $5A5A above, is cleared with them');
});
