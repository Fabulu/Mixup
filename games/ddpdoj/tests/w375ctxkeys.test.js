// W375 -- THE CTX KEYS THE FRONT-END SLOTS READ.
//
// W374 and W375 registered the six front-end slots ([7], [9], [13], [14], [15], [17]) in
// `defaultHandlers`, so for the first time they run from `runObjectDriver` on a real frame.
// THREE OF THEM OPEN THEIR STATE 0 ON A `ctx` KEY `Game#ctx()` DID NOT CARRY, unguarded:
//
//   objslot14.js:38   resetScrolls23C61E(ctx.videoRegs)   -- $288BCE, and it is the slot's
//                                                            FIRST instruction
//   objslot14.js:39   clearTx23C622(ctx.tx)               -- $288BD4
//   objslot9.js:221   clearTx23C622(ctx.tx)               -- $25C9A0
//   objslot17.js:163  clearTx23C622(ctx.tx)               -- $25CDC0
//
// AND A FOURTH SLOT, one indirection out: slot [7]'s state 0 calls `screenWipe23C6C6(ram, ctx)`
// ($290B20 -> $23C6C6, objslot7pool.js:555), and that routine opens with the SAME two lines
// (background.js:1608/1609). So four of the six were broken, not three.
//
// MEASURED before the fix, each driven through `Game#step` -> `runObjectDriver`:
//
//   slot  [7]  TypeError: Cannot set properties of undefined (setting 'tx_yscroll')
//              at resetScrolls23C61E <- screenWipe23C6C6 <- objSlot7 state 0
//   slot [14]  TypeError: Cannot set properties of undefined (setting 'tx_yscroll')
//   slot  [9]  TypeError: Cannot read properties of undefined (reading 'setLong')
//   slot [17]  TypeError: Cannot read properties of undefined (reading 'setLong')
//
// `Game#ctx()` carried the same two objects under the names the rest of the port uses --
// `video` (a `VideoRegs`) and `txvram` (a `TxVram`) -- so the fix is two ALIASES, not a rename:
// `irq6` dispatches the score flush off `ctx.txvram` itself and the scroll VM reads `ctx.video`.
//
// The third test is the one that matters beyond this defect. "A slot reads a ctx key nobody
// supplies" is a CLASS of bug, it is silent when the read is guarded and fatal when it is not,
// and it survived three waves. So the ctx reads in all six files are enumerated and checked.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import {
  BgVram, TxVram, VideoRegs, clearTx23C622, resetScrolls23C61E,
} from '../src/background.js';
import { OBJ } from '../src/objdriver.js';
import { SOUND } from '../src/sound.js';
import { UnportedLog } from '../src/unported.js';

const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const seedBytes = new Uint8Array(readFileSync(SEED));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));
const game = () => new Game(seedBytes.slice(), tablesJson, { palCatchUp: false });

/** A dispatch type `defaultHandlers` does not claim, so a spy on it displaces nothing. */
const SPY_TYPE = 0x33;

/** The lowest EMPTY object-table slot in the seed, so the spy runs as early in the walk as the
 *  seed allows and sees `ctx` as close to `#ctx()`'s own return as an outside caller can. */
function firstEmptySlot(g) {
  for (let i = 0; i < OBJ.slots; i++) {
    if (g.ram.u16(OBJ.base + i * OBJ.stride + OBJ.typeOff) === 0) return i;
  }
  throw new Error('the seed has no empty object slot -- this test cannot plant a record');
}

/** Plant a zeroed record of `type` in state `state` and return its address. */
function plant(g, slotIndex, type, state = 0) {
  const a5 = OBJ.base + slotIndex * OBJ.stride;
  for (let i = 0; i < OBJ.stride; i++) g.ram.setU8(a5 + i, 0);
  g.ram.setU16(a5 + OBJ.typeOff, type);
  g.ram.setU8(a5 + 0x02, state);                  // every one of the six keys state off ($2,A5)
  return a5;
}

/** Run ONE frame with a spy handler planted, and return what the spy saw. `#ctx()` is private,
 *  so the object driver's own `h(ram, slot, slotIndex, ctx)` call is the only way to it. */
function captureCtx() {
  const g = game();
  assert.equal(g.handlers.has(SPY_TYPE), false,
    `type $${SPY_TYPE.toString(16)} is a REAL handler now -- pick another spy type`);
  let ctx = null, keys = null, calls = 0;
  g.handlers.set(SPY_TYPE, (_ram, _slot, _i, c) => {
    calls++; ctx = c; keys = Object.keys(c);      // snapshot INSIDE the frame, not after it
  });
  plant(g, firstEmptySlot(g), SPY_TYPE);
  g.step(0);
  assert.equal(calls, 1, 'the spy handler never ran, so nothing below tests anything');
  return { g, ctx, keys };
}

// --------------------------------------------------------------- 1. both names, one object

test('W375: Game#ctx() carries tx/txvram and videoRegs/video, and each pair is ONE object',
  () => {
    const { g, ctx } = captureCtx();

    for (const k of ['tx', 'txvram', 'video', 'videoRegs']) {
      assert.ok(Object.hasOwn(ctx, k), `Game#ctx() does not carry \`${k}\``);
    }
    // The SAME object, not a copy: a clear through `ctx.tx` must be visible to the ISR6 score
    // flush, which reads `ctx.txvram`, and a scroll reset through `ctx.videoRegs` must be
    // visible to the renderer, which reads `g.video`.
    assert.equal(ctx.tx, ctx.txvram);
    assert.equal(ctx.tx, g.txvram);
    assert.equal(ctx.videoRegs, ctx.video);
    assert.equal(ctx.videoRegs, g.video);
    assert.ok(ctx.tx instanceof TxVram);
    assert.ok(ctx.videoRegs instanceof VideoRegs);

    // Aliases, not renames -- the old names must still be there for everyone else.
    ctx.tx.setLong(0x904000, 0xdeadbeef);
    assert.equal(ctx.txvram.long(0x904000), 0xdeadbeef);
    ctx.videoRegs.bg_xscroll = 0x123;
    assert.equal(ctx.video.bg_xscroll, 0x123);
  });

// The SAME defect, twice more, and both GUARDED -- so instead of a TypeError they were silence.
// They were `KNOWN_MISSING_OPTIONAL` entries below until this wave; the inventory is exact-set
// equality, so supplying them means deleting their lines there.
//
//   unported  about thirty `ctx.unported?.note(..)` sites across the six front-end files, every
//             one a NO-OP from the driver. `Game#ctx()` carried the log only as `unportedLog`.
//             This is the mechanism that makes an unported callee COUNTABLE instead of an
//             invisible skip, so it was switched off for exactly the six files W374/W375 had
//             just connected to the driver.
//   bgVram    `objslot14.js:40` and `background.js:1610` (the `screenWipe23C6C6` tail, i.e. slot
//             [7]'s state 0): `$23C638`, the BG tilemap clear. `Game#ctx()` carried the same
//             `BgVram` as `vram` -- `stageend.js:513` already calls `ctx.vram.clear23C638()`.
test('W375: Game#ctx() carries unported/unportedLog and bgVram/vram, and each pair is ONE object',
  () => {
    const { g, ctx } = captureCtx();

    for (const k of ['unported', 'unportedLog', 'bgVram', 'vram']) {
      assert.ok(Object.hasOwn(ctx, k), `Game#ctx() does not carry \`${k}\``);
    }
    assert.equal(ctx.unported, ctx.unportedLog);
    assert.equal(ctx.unported, g.unportedLog);
    assert.equal(ctx.bgVram, ctx.vram);
    assert.equal(ctx.bgVram, g.vram);
    assert.ok(ctx.unported instanceof UnportedLog);
    assert.ok(ctx.bgVram instanceof BgVram);

    // Aliases, not renames. A note through the front end's name must be the same census the
    // runners print off `unportedLog`, and `$23C638` through `bgVram` must clear the ring the
    // renderer reads off `vram`.
    ctx.unported.note(0x123456, 'W375 alias probe');
    assert.ok(g.unportedLog.report().some((l) => l.includes('$123456 W375 alias probe')));
    ctx.vram.setLong(3, 7, 0xdeadbeef);
    assert.equal(ctx.bgVram.long(3, 7), 0xdeadbeef);
    ctx.bgVram.clear23C638();
    assert.equal(ctx.vram.long(3, 7), 0);
  });

// THE ALIAS, DRIVEN. W375 originally proved it with slot [9]'s counted unported note. W379 moved
// that note from `$25CB94` to the real per-record `$25CBF4 jsr $25E72E` site, and W502 ports that
// final site. The stronger successor drives the same slot from `Game#step`, forces `$25E72E`'s
// label-only branch, and observes cartridge TX output through `ctx.tx` while proving the old census
// entry is gone.
/**
 * W445 -- REMOVE THE SEED'S LIVE PLAYER OBJECT, because slot [9] state 0 IS THE START OF A
 * CREDIT and the cartridge never reaches it with a player alive.
 *
 * `rip/web/seed.bin` is a MID-GAME board dump: dispatch type $8002 sits in the object table
 * and `$8103E6` has bit 15. Planting slot [9] in state 0 on top of that makes the select
 * screen's reset and a live ship coexist, which no board state does -- and W445 turned that
 * synthetic overlap into a throw, for a faithful reason. `$25CA78 move.w #$A,D0 / jsr $241182`
 * stages the RANK object, whose `$2605C8` state-0 INIT runs `$2606FA jsr $24A810` -- 9,618
 * bytes of `$8103E6..$812977`, the whole player block. On a board that is free, because at the
 * start of a credit there is no player: `tests/w378rank.test.js` measures the block at ZERO
 * nonzero words on the frame the real cold-boot path enters the INIT. Here it wiped a running
 * ship mid-pass and `spawnShot` then read a null table.
 *
 * So the bench, not the wiring, is what is corrected: the precondition is made the one the
 * board has. Nothing this test asserts depends on the ship existing.
 *
 * @returns the number of player objects removed, so a seed that changes cannot silently make
 *   this a no-op.
 */
function dropPlayerObjects(g) {
  let n = 0;
  for (let i = 0; i < OBJ.slots; i++) {
    const a5 = OBJ.base + i * OBJ.stride;
    const t = g.ram.u16(a5 + OBJ.typeOff) & 0x7fff;
    if (t !== 2 && t !== 3) continue;                 // dispatch types 2 / 3 -- P1 / P2
    for (let b = 0; b < OBJ.stride; b++) g.ram.setU8(a5 + b, 0);
    n += 1;
  }
  return n;
}

test('W502: slot [9] reaches its live $25E72E TX draw through Game#ctx()', () => {
  const g = game();
  assert.equal(g.unportedLog.calls.size, 0, 'the log is not empty before the frame');
  assert.equal(dropPlayerObjects(g), 1,
    'the seed carried exactly one player object and it is gone -- see dropPlayerObjects');

  const a5 = plant(g, firstEmptySlot(g), 9, 0);
  g.step(0);                                           // state 0 clears TX and advances to state 1
  assert.equal(g.ram.u8(a5 + 0x02), 1);
  assert.equal(txAllZero(g), true, 'slot [9] state 0 did not establish a clear TX map');

  g.ram.setU8(0x813005, 1);                           // `$25E73C` forces the label-only branch
  g.step(0);

  assert.equal(txAllZero(g), false,
    'the live per-record draw did not write its cartridge side labels through ctx.tx');
  assert.deepEqual(g.unportedLog.report().filter((l) => l.includes('$25E72E')), [],
    '$25E72E still reached the unported census instead of its live draw');
});

// `$288BDA jsr $23C638` through `ctx.bgVram`, driven. Before the alias the guard swallowed it and
// the BG tilemap kept whatever the seed had in it.
test('W375: slot [14] state 0 clears the BG tilemap through ctx.bgVram', () => {
  const g = game();
  plant(g, firstEmptySlot(g), 14, 0);
  for (let row = 0; row < 16; row++) g.vram.setLong(row, row * 3, 0x11110000 + row);
  assert.ok([...g.vram.w].some((w) => w !== 0), 'the BG ring was not dirtied, so this proves nothing');

  g.step(0);

  assert.deepEqual([...g.vram.w].filter((w) => w !== 0), [],
    'slot [14] state 0 did not clear $900000 through ctx.bgVram ($288BDA jsr $23C638)');
});

// --------------------------------------------------------------- 2. the defect, DRIVEN

// DRIVEN, not called directly: each slot is planted in the object table in state 0 and reached
// through `Game#step` -> `runObjectDriver` -> `defaultHandlers.get(type)`, which is the exact
// path that was throwing. `resetScrolls23C61E` and `clearTx23C622` are ALSO called directly off
// a real `ctx` at the end, to pin which key each one needs.

/** The TX map and the scroll registers, dirtied so a clear that did not happen is visible. A
 *  fresh `TxVram` is already all zeroes and a fresh `VideoRegs` already holds three of the four
 *  reset values, so without this the assertions below would pass vacuously. */
function dirty(g) {
  for (let i = 0; i < 64 * 32; i++) g.txvram.setLong(0x904000 + i * 4, 0x11110000 + i);
  g.video.tx_yscroll = 0x55; g.video.tx_xscroll = 0x66;
  g.video.bg_yscroll = 0x77; g.video.bg_xscroll = 0x88;
}

function txAllZero(g) {
  for (let i = 0; i < 64 * 32; i++) {
    if (g.txvram.long(0x904000 + i * 4) !== 0) return false;
  }
  return true;
}

for (const [name, type] of [['[9]', 9], ['[14]', 14], ['[17]', 17]]) {
  test(`W375: slot ${name} state 0 runs from the driver and clears the TX map through ctx.tx`,
    () => {
      const g = game();
      const a5 = plant(g, firstEmptySlot(g), type, 0);
      dirty(g);
      assert.equal(txAllZero(g), false, 'the TX map was not dirtied, so the clear proves nothing');

      g.step(0);                                   // THREW before the fix -- see the header

      assert.equal(txAllZero(g), true,
        `slot ${name} state 0 did not clear $904000..$905FFF through ctx.tx`);
      assert.equal(g.ram.u8(a5 + 0x02), 1,
        `slot ${name} state 0 did not advance the record past state 0`);
    });
}

test('W375: slot [14] state 0 resets BOTH scrolls through ctx.videoRegs, tx_xscroll to 1', () => {
  const g = game();
  const a5 = plant(g, firstEmptySlot(g), 14, 0);
  dirty(g);

  g.step(0);

  // $23C5F2 sets tx_xscroll to ONE, not zero -- the off-by-one is in the cartridge.
  assert.deepEqual({
    tx_yscroll: g.video.tx_yscroll, tx_xscroll: g.video.tx_xscroll,
    bg_yscroll: g.video.bg_yscroll, bg_xscroll: g.video.bg_xscroll,
  }, { tx_yscroll: 0, tx_xscroll: 1, bg_yscroll: 0, bg_xscroll: 0 });
  // $288BE6/$288BEC -- the rest of state 0 ran too, so the throw was not merely swallowed.
  assert.equal(g.ram.u16(a5 + 0x08), 0x4400);
  assert.equal(g.ram.u16(a5 + 0x0a), 0x1c00);
  assert.equal(g.ram.u8(a5 + 0x16), 1);
});

// Slot [7] gets its own test because its state 0 wipes both tilemaps and posts three preserving
// sound entries in sequence:
//
//     290B26  jsr $28C170     -> $28BBAC, packs $15000000
//     290B2C  jsr $28C0FC     -> $28BB76, packs $10000000
//     290B32  jsr $28C10C     -> $28BB8A, packs $20000000
//
// W425 added the first direct-entry dispatch. W567 added the latter two without inventing
// WRAPPERS rows, because all three cartridge entries preserve a fixed bare longword.
test('W567: slot [7] state 0 wipes the screen and posts all three preserving entries', () => {
  const g = game();
  plant(g, firstEmptySlot(g), 7, 0);
  dirty(g);

  let err = null;
  try { g.step(0); } catch (e) { err = e; }

  assert.equal(err, null, 'all three preserving entries are now directly postable');
  assert.equal(txAllZero(g), true, 'slot [7] state 0 did not clear the TX map through ctx.tx');
  assert.equal(g.video.tx_xscroll, 1);
  assert.equal(g.video.bg_xscroll, 0);

  const ring = Array.from({ length: 0x190 / 4 }, (_, i) => g.ram.u32(SOUND.ring + i * 4));
  assert.ok(ring.includes(0x15000000), '$290B26 enqueued the BGM-command longword');
  assert.ok(ring.includes(0x10000000), '$290B2C enqueued the first preserving longword');
  assert.ok(ring.includes(0x20000000), '$290B32 enqueued the second preserving longword');
});

test('W375: the two callees, called directly off a real ctx, take the aliased objects', () => {
  const { g, ctx } = captureCtx();
  dirty(g);

  resetScrolls23C61E(ctx.videoRegs);               // $23C61E, as objslot14.js:38 calls it
  clearTx23C622(ctx.tx);                           // $23C622, as three slots call it

  assert.equal(g.video.tx_xscroll, 1);
  assert.equal(g.video.bg_xscroll, 0);
  assert.equal(txAllZero(g), true);
});

// --------------------------------------------------------------- 3. the guard for the NEXT one

// WHAT THE SCAN COVERS: every literal `ctx.<name>` in the six front-end slot files, with
// comments and string/template literal bodies blanked out first (so the `ctx.selectDraws`
// that appears only in objslot17.js's JSDoc is correctly NOT counted -- asserted below).
//
// WHAT IT DOES NOT COVER: computed access (`ctx[expr]`), destructuring (`const {a} = ctx` --
// none of the six do this today, unlike handlers.js), a ctx bound to another name and read
// through it, and `ctx.<name>` inside a regex literal. It is a lexical scan, not a type
// checker. It is worth having anyway: every current read in these files is literal `ctx.<name>`.
//
// THE ONE IT DEMONSTRABLY MISSES, and it bit in this very wave: a ctx read in a CALLEE that
// lives outside the six files. Slot [7] passes `ctx` whole to `screenWipe23C6C6`, whose two
// unguarded reads are in background.js, so this scan never sees them and the test above drives
// slot [7] instead. Any scan of the six files alone is a floor, not a ceiling.
const SLOT_FILES = ['objslot7pool.js', 'objslot9.js', 'objslot13.js',
  'objslot14.js', 'objslot15.js', 'objslot17.js'];

/** Replace every comment body and every string/template body with spaces, preserving length and
 *  newlines so offsets and line numbers still line up. */
function blankCommentsAndStrings(src) {
  const out = src.split('');
  const n = src.length;
  const wipe = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      wipe(i, j); i = j; continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const j = e < 0 ? n : e + 2;
      wipe(i, j); i = j; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        j++;
      }
      wipe(i, j); i = j; continue;
    }
    i++;
  }
  return out.join('');
}

/** Every `ctx.<name>` read in the six files, split by whether it is GUARDED. A read is guarded
 *  when `?.` or `??` follows the name -- `ctx.unported?.note(..)` degrades to nothing, while
 *  `clearTx23C622(ctx.tx)` throws. Both matter; they fail differently, so they are asserted
 *  differently below. */
function scanCtxReads() {
  const guarded = new Map(), unguarded = new Map();
  let total = 0;
  for (const f of SLOT_FILES) {
    const src = blankCommentsAndStrings(readFileSync(SRC + f, 'utf8'));
    for (const m of src.matchAll(/\bctx\.([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      total++;
      const rest = src.slice(m.index + m[0].length).replace(/^[ \t]+/, '');
      const bucket = (rest.startsWith('?.') || rest.startsWith('??')) ? guarded : unguarded;
      const line = src.slice(0, m.index).split('\n').length;
      bucket.set(m[1], [...(bucket.get(m[1]) ?? []), `${f}:${line}`]);
    }
  }
  return { guarded, unguarded, total };
}

// The GUARDED reads of keys `Game#ctx()` does not supply. Each one is a real gap -- the routine
// silently does nothing from the driver -- and each is listed here with what it would need, so
// that a NEW one fails this test instead of joining them unnoticed. Supplying a key through `#ctx()` or
// replacing an obsolete optional read with a direct production call means deleting its line here.
//
// `unported` and `bgVram` LEFT THIS INVENTORY IN W375's SECOND PASS. Both were the same alias
// defect as `tx`/`videoRegs`, only guarded, and both are now supplied by `Game#ctx()` and
// asserted by the two tests above. The measured cost of `unported` was the point of the exercise:
// from the shipped seed the census does not move at all (no front-end slot is live in it), but
// with a slot planted and driven it does -- slot [9] +39 notes at $25CB94, slot [13] +1 at
// $287B0E, slot [7] +3 ($23C67E/$23C694/$23C6AA, the $A0xxxx clears inside `screenWipe23C6C6`).
// Those were being emitted into nothing.
const KNOWN_MISSING_OPTIONAL = Object.freeze({
  // W460 removed `clear24631C`: slots [8], [13], and [14] now import the verified
  // stageend.js body directly, so the cartridge clear cannot degrade to a no-op.
  // W509 removed `load246710`, `loadAnim0`, `ready24681A`, and `commit246800`: the reached
  // objslot7pool.js `$2907E2` state machine now calls the existing production loaders, check,
  // and free directly, so none remains a guarded ctx read or a missing Game#ctx capability.
  // W519 removed `rankByte`: Game#ctx now supplies the shared drawByte242E24 body,
  // so slot [14] state 1 no longer silently falls back to rank 0.
  // `menuCarry28D53C` LEFT THIS INVENTORY IN W418, and its line here was FALSE the whole time.
  // It said "$28D53C. Not ported." -- but `$28D53C` has been `tallyscreen.js menuCarry28D53C`
  // since W278, and `objslot8.js` and `tallyscreen.js` itself both call it directly. The one
  // guarded read was `objslot13.js:179`, whose `!ctx.menuCarry28D53C?.(ram)` therefore returned
  // at the FIRST LINE of `$288B00` on every frame for 45 waves, taking the continue screen's
  // nine-second countdown with it. This inventory is meant to make a silent gap visible; a wrong
  // reason in it made a real one invisible instead. **Check that the reason is still true when
  // you add a line here, and again when you read one.**
  menuGate2901E0: 'objslot7pool.js:563 -- an OVERRIDE by design: `(ctx.menuGate2901E0 ?? '
    + 'menuGate2901E0)` falls back to the module\'s own ported gate. Absent from ctx on purpose.',
  cue28CC28: '$28CC28. Not ported.',
});

test('W375 GUARD: every ctx key the six front-end slots read is one Game#ctx() supplies', () => {
  const { guarded, unguarded, total } = scanCtxReads();
  const { keys } = captureCtx();
  const provided = new Set(keys);

  // NOT VACUOUS. If the scan ever matches nothing -- a bad regex, a renamed file, a blanking
  // bug that ate the whole source -- these fail rather than passing green on an empty set.
  assert.ok(total >= 80, `the ctx scan found only ${total} reads in ${SLOT_FILES.length} files`);
  assert.ok(unguarded.size >= 3, `only ${unguarded.size} distinct unguarded ctx keys found`);
  assert.ok(unguarded.has('tx') && unguarded.get('tx').length >= 3,
    'the scan lost the unguarded `ctx.tx` reads this test exists for');
  assert.ok(unguarded.has('videoRegs'), 'the scan lost objslot14.js:38');
  // Blanking works: `ctx.selectDraws` occurs ONLY in objslot17.js JSDoc, never as code.
  assert.equal(guarded.has('selectDraws') || unguarded.has('selectDraws'), false,
    'comments were not blanked -- the scan is counting prose as code');

  // THE DEFECT ITSELF: an unguarded read of a key nobody supplies is a TypeError on the first
  // frame the slot reaches that state. There is no acceptable list here; it must be empty.
  const fatal = [...unguarded.keys()].filter((k) => !provided.has(k));
  assert.deepEqual(fatal, [], 'these ctx keys are read UNGUARDED by a front-end slot and '
    + `Game#ctx() does not supply them, so the slot THROWS when it reaches that line: ${
      fatal.map((k) => `${k} (${unguarded.get(k).join(', ')})`).join('; ')
    }. Add an alias in Game#ctx() -- additively -- or supply the key.`);

  // THE SAME CLASS, GUARDED: silent, not fatal, so it is an inventory rather than a ban. A new
  // entry appearing here is a NEW gap and must be triaged, not absorbed.
  const silent = [...guarded.keys()].filter((k) => !provided.has(k)).sort();
  assert.deepEqual(silent, Object.keys(KNOWN_MISSING_OPTIONAL).sort(),
    'the set of GUARDED ctx keys the front-end slots read but Game#ctx() does not supply has '
    + 'changed. Each such read silently does nothing. If you added one, add it to '
    + 'KNOWN_MISSING_OPTIONAL with what it would need; if you supplied one, delete its line '
    + `there. found: [${silent.join(', ')}]`);
});
