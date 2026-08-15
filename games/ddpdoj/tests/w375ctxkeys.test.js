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
import { TxVram, VideoRegs, clearTx23C622, resetScrolls23C61E } from '../src/background.js';
import { OBJ } from '../src/objdriver.js';

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

// Slot [7] gets its own test because it CANNOT finish state 0 yet, and that is a finding rather
// than a reason to leave it out. `$290B20 jsr $23C6C6` (the wipe) is followed immediately by
// `$290B26` posting cue `$28C170`, and `sound.js`'s WRAPPERS table has no entry for that address,
// so the frame still ends in a throw -- a DIFFERENT throw, from a different gap, three lines
// later. What this asserts is that the ctx-key failure is gone and the wipe actually happened.
test('W375: slot [7] state 0 reaches screenWipe23C6C6 and stops at the $28C170 sound gap', () => {
  const g = game();
  plant(g, firstEmptySlot(g), 7, 0);
  dirty(g);

  let err = null;
  try { g.step(0); } catch (e) { err = e; }

  // The wipe ran: $23C6C6 -> $23C61E and $23C64E both landed, through the two aliases.
  assert.equal(txAllZero(g), true, 'slot [7] state 0 did not clear the TX map through ctx.tx');
  assert.equal(g.video.tx_xscroll, 1);
  assert.equal(g.video.bg_xscroll, 0);
  // And whatever stops the frame now, it is NOT a missing ctx key.
  assert.ok(err === null || /no wrapper at \$28C170/.test(err.message),
    `slot [7] state 0 stopped on something new: ${err && err.message}`);
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
// checker. It is worth having anyway: all 88 reads in these files are literal `ctx.<name>`.
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
// that a NEW one fails this test instead of joining them unnoticed. Adding a key to `#ctx()`
// means deleting its line here.
const KNOWN_MISSING_OPTIONAL = Object.freeze({
  unported: 'THE BIG ONE. 30 reads. Every `ctx.unported?.note(..)` in the six files is a no-op '
    + 'from the driver, because `Game#ctx()` supplies the SAME log under the name `unportedLog` '
    + '(28 reads elsewhere) and only `enemyframe.js:118` re-aliases it with '
    + '`{...ctx, unported: ctx.unportedLog}`. So the front end\'s counted notes -- the whole '
    + 'mechanism that keeps an unported callee countable instead of a silent skip -- are lost. '
    + 'NOT fixed here: it changes the note census every gate and runner prints, which is a '
    + 'bigger blast radius than this defect and wants its own wave.',
  bgVram: 'objslot14.js:40, `$288BDA jsr $23C638` -- the BG tilemap clear. `Game#ctx()` supplies '
    + 'the same `BgVram` as `vram`, so this is the identical alias defect, guarded.',
  clear24631C: '$24631C, the animation-object table clear. Not ported.',
  rankByte: '$242E24. Ported as makeRankObject\'s own read; not on ctx, so slot [14] state 1 '
    + 'takes rank 0 and always picks tableA.',
  menuCarry28D53C: '$28D53C. Not ported.',
  menuGate2901E0: 'objslot7pool.js:563 -- an OVERRIDE by design: `(ctx.menuGate2901E0 ?? '
    + 'menuGate2901E0)` falls back to the module\'s own ported gate. Absent from ctx on purpose.',
  load246710: '$246710, the animation-resource load. Not ported.',
  loadAnim0: '$24641A mode 0. Not ported.',
  ready24681A: '$24681A. Not ported.',
  commit246800: '$246800. Not ported.',
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
