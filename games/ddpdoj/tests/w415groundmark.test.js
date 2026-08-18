// W415 -- DOCKET D50. The ground mark a dying ground enemy leaves, and why the
// owner saw it arrive after the fireball it belongs to.
//
//   the owner, playing live from the start of the game with fire held:
//   "some of the enemies who die not leaving craters right away when dead as
//    they should, the craters come a tiny bit later"
//
// WHAT THE MARK IS. Not a death spawn and not pool B. It is POOL C's kind-4
// satellite: `$2688BA jsr $289AF4` at the tail of type $11's death arm and the
// same call in type $10's, allocated by `$289B50` and driven by `$289B80`. Its
// record scrolls with the ground and lives until it scrolls off, which is why
// it reads as a mark on the terrain rather than as an explosion.
//
// WHAT WAS ACTUALLY WRONG, AND IT IS NOT THE PORT. [M] on the stage1-laser-hold
// ladder at lf2000 with fire held, 900 frames, against the shipped bundle: the
// port allocates the mark on the frame of the death and draws it on the next
// one, which is the CARTRIDGE'S OWN CALL ORDER (assertion 3 below). Its eight
// art streams were filed under sprite shard 17, LAST of nineteen in `SPR_ORDER`,
// while the fireball beside it is shard 9, FIFTH. On the published page the
// fireball therefore lands on the frame of the death and the mark cannot be
// drawn until the last shard in the queue arrives.
//
// WHAT THIS FILE ASSERTS, and every assertion is one of exactly two kinds --
// W414's rule, kept:
//
//   * the CARTRIDGE's own bytes, read out of `maincpu.bin`: the spawn site, the
//     gate that makes it SOME enemies and not all, the call order that puts the
//     mark one frame behind the fireball, and the template's own wrap, which is
//     what pins the harvest at four entries per list.
//   * the SHIPPED bundle, asked whether it can answer those exact offsets at
//     the width the record asks for, AND ON WHICH SHARD. The last one is the
//     assertion that would have caught D50: a membership test alone passes on
//     HEAD, because the art was always present -- just not in time.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const IMAGE = path.join(ROOT, 'rip', 'sound', 'maincpu.bin');
const MANIFEST = path.join(ROOT, 'assets', 'manifest.json');

const IMG = fs.existsSync(IMAGE) ? fs.readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false
  : 'the ROM image is absent; THIS IS A SKIP, NOT A PASS.';
const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => u16(a) * 0x10000 + u16(a + 2);
const bytes = (a, n) => Array.from(IMG.subarray(a, a + n));

// The shipped bundle's stream triples, read the way W414 reads them: straight
// out of `assets/`, so this file needs no HTTP shim and no capture.
function shipped() {
  if (!fs.existsSync(MANIFEST)) return null;
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const file = path.join(ROOT, 'assets', man.spr.streamsFile);
  if (!fs.existsSync(file)) return null;
  const raw = zlib.gunzipSync(fs.readFileSync(file));
  const u32a = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
  const n = man.spr.streamCount;
  assert.equal(u32a.length, n * 3, 'streams.u32 is streamCount x 3');
  const out = new Map();
  let rom = 0;
  for (let i = 0; i < n; i++) {
    rom = (rom + u32a[i]) >>> 0;                 // plane 0, delta-coded
    out.set(rom, { base: u32a[n + i], maskWords: u32a[2 * n + i] });
  }
  // `src/web/assets.js shardOfBase`, transcribed: the packed base decides.
  const shardOfBase = (b) => {
    for (const s of man.spr.shards) {
      if (b >= s.maskFrom && b < s.maskFrom + s.maskLen) return s.i;
    }
    return -1;
  };
  const orderOf = new Map(man.spr.shards.map((s) => [s.i, s.order]));
  return { man, streams: out, shardOfBase, orderOf };
}
const SHIP = shipped();
const SKIP_SHEET = SHIP ? false
  : 'assets/ has not been exported (node tools/export-web.mjs); '
    + 'THIS IS A SKIP, NOT A PASS.';

// ---- the two addresses this whole item turns on, named once.
const POOLC_TEMPLATES = 0x289dea;   // src/effects.js POOL_C.templateTable
const POOLB_KIND7_CELL0 = 0x202614; // effect script A[7] cell 0 -- the fireball

/** The kind-4 template's three animation lists, and every stream they name. */
function markStreams() {
  const t = u32(POOLC_TEMPLATES + 4);            // `(kind & $3C)` and kind is 4
  const lists = [0, 1, 2].map((i) => u32(t + 0x10 + i * 4));
  const wrap = u16(t + 0x0a);
  const entries = wrap / 4 + 1;
  const offs = new Set();
  for (const l of lists) for (let i = 0; i < entries; i++) offs.add(u32(l + i * 4));
  return { t, lists, wrap, entries, offs: [...offs], size: u16(t + 6) };
}

// ============ 1. THE SPAWN SITE, OUT OF THE CARTRIDGE

test('W415 $2688BA is type $11 jsr $289AF4 -- the ground mark, kind 4',
  { skip: SKIP_IMG }, () => {
  // $2688A8 moveq #$4,D0 -- POOL C KIND 4. When this file was written it was the
  // only kind `$289B50` accepted; W419 measured the table's real domain (kinds
  // 0, 4, 8 and $C -- `$289DEA`'s four distinct longs, and `$267F4E cmpi.w #$3`
  // from the caller side) and opened the guard. THE MARK IS STILL KIND 4; what
  // changed is that it is no longer the only one.
  assert.deepEqual(bytes(0x2688a8, 2), [0x70, 0x04]);
  assert.deepEqual(bytes(0x2688aa, 2), [0x72, 0x00]);      // moveq #$0,D1
  assert.deepEqual(bytes(0x2688ac, 4), [0x12, 0x2e, 0x00, 0x1f]); // move.b ($1F,A6),D1
  assert.deepEqual(bytes(0x2688b0, 2), [0xd2, 0x41]);      // add.w D1,D1
  // $2688B2 `41 fa f7 04` is `lea (d16,PC),A0`, and the target is THE EXTENSION
  // WORD'S ADDRESS plus the displacement -- $2688B4 + (-$8FC) = $267FB8, the
  // secondary remap row `src/effects.js` calls REMAP.secondary267FB8.
  assert.deepEqual(bytes(0x2688b2, 4), [0x41, 0xfa, 0xf7, 0x04]);
  const disp = (u16(0x2688b4) << 16) >> 16;
  assert.equal(0x2688b4 + disp, 0x267fb8);
  assert.deepEqual(bytes(0x2688ba, 6), [0x4e, 0xb9, 0x00, 0x28, 0x9a, 0xf4]);
  assert.equal(u32(0x2688bc), 0x00289af4, 'jsr $289AF4');
  // AND TYPE $10's DEATH ARM IS THE SAME SIX INSTRUCTIONS at $26820C..$26821E,
  // which is the other half of "some of the enemies": these two types leave a
  // mark and nothing else in the port's stage-1 population does. [M] over 900
  // frames at lf2000 the six handlers that free a record are $2688CC (type $11,
  // 40 deaths), $26A2E2 ($07/$27, 11), $269CEA ($05, 7), $268232 (type $10, 4),
  // $27687E ($8B, 3) and $2739C0 ($80, 1), and only the first and the fourth
  // reach a `jsr $289AF4`.
  assert.deepEqual(bytes(0x26820c, 2), [0x70, 0x04]);
  assert.deepEqual(bytes(0x26821e, 6), [0x4e, 0xb9, 0x00, 0x28, 0x9a, 0xf4]);
  const d10 = (u16(0x268218) << 16) >> 16;              // $268216 lea (d16,PC),A0
  assert.equal(0x268218 + d10, 0x267fb8, 'the same secondary remap row');
});

test('W415 $26889E btst #0,$815EA5 is what makes it SOME enemies, not all',
  { skip: SKIP_IMG }, () => {
  // The owner wrote "some of the enemies", and this is the whole of it.
  // $268898 addq.w #1,$815EA4 counts the frame's deaths; $815EA5 is that
  // word's LOW BYTE, so bit 0 is the count's parity, and `beq` skips the
  // spawn when it is CLEAR. The first death of a frame leaves a mark, the
  // second does not, the third does. $815EA4 is one of the three words the
  // enemy driver zeroes after its walk (src/enemies.js ENEMY.clrAfter).
  assert.deepEqual(bytes(0x268898, 6), [0x52, 0x79, 0x00, 0x81, 0x5e, 0xa4]);
  assert.deepEqual(bytes(0x26889e, 8),
    [0x08, 0x39, 0x00, 0x00, 0x00, 0x81, 0x5e, 0xa5]);
  assert.deepEqual(bytes(0x2688a6, 2), [0x67, 0x18], '$2688A6 beq +$18');
  // ...and the skip lands PAST the jsr, on the sound cue.
  assert.equal(0x2688a8 + 0x18, 0x2688c0);
  assert.equal(u32(0x2688c2), 0x0028c25a, '$2688C0 jsr $28C25A, the death cue');
});

// ============ 2. THE CALL ORDER -- WHY ONE FRAME IS THE FLOOR, NOT A DEFECT

test('W415 $28B5E6 runs pool C BEFORE the enemy driver, so the mark is one '
  + 'frame behind the fireball by the cartridge own order',
  { skip: SKIP_IMG }, () => {
  // Object type 5's call list. Pool C's driver is FIRST and the enemy driver --
  // inside which the death arm above allocates -- is SECOND, so a record born
  // in call #2 is not stepped or emitted until call #1 of the NEXT frame.
  // Pool B's driver is the FIFTH call, after the allocation, so the fireball
  // emits on the frame of the death. [M] on the bench with every shard present:
  // pool B lag 0, pool D lag 0, pool C lag 1.
  assert.deepEqual(bytes(0x28b5e6, 6), [0x4e, 0xb9, 0x00, 0x28, 0x9b, 0x80]);
  assert.deepEqual(bytes(0x28b5ec, 6), [0x4e, 0xb9, 0x00, 0x26, 0x34, 0xf4]);
  assert.equal(u32(0x28b5fe + 2), 0x00288e4e, 'pool B is the fifth call');
});

// ============ 3. THE TEMPLATE'S OWN WRAP PINS THE HARVEST AT FOUR

test('W415 the kind-4 template names three lists and its wrap says FOUR cells',
  { skip: SKIP_IMG }, () => {
  const m = markStreams();
  assert.equal(m.t, 0x289e26, 'template table $289DEA + (kind $4 & $3C)');
  assert.deepEqual(m.lists, [0x289eaa, 0x289eba, 0x289eca]);
  // `$289B50` sets the cursor to `drawByte24311A() * 4` and the driver reloads
  // it from ($12) = the template's wrap on the borrow, so the cursor is only
  // ever 0/4/8/$C. FOUR entries per list -- which is the number the three
  // `HARVEST` rows in export-web.mjs carry, taken from the cartridge and not
  // from a run.
  assert.equal(m.wrap, 0x000c);
  assert.equal(m.entries, 4);
  // Twelve pointers, EIGHT distinct: list 2 duplicates list 1 byte for byte.
  assert.equal(m.offs.length, 8);
  assert.deepEqual(m.offs.slice().sort((a, b) => a - b),
    [0x229f7c, 0x229fe0, 0x22a044, 0x22a0a8,
      0x22a10c, 0x22a170, 0x22a1d4, 0x22a238]);
  for (let i = 0; i < 4; i++) {
    assert.equal(u32(0x289eba + i * 4), u32(0x289eca + i * 4),
      'list 2 is list 1, byte for byte');
  }
  assert.equal(m.size, 0x0620, 'the template size word');
});

// ============ 4. THE BUNDLE CAN ANSWER THEM, AT THE WIDTH THE RECORD ASKS

test('W415 all eight ground-mark streams are in the sheet and long enough',
  { skip: SKIP_IMG || SKIP_SHEET }, () => {
  const m = markStreams();
  // The record's hardware word 4 is the template's size word: wide is bits
  // 14..9 and high is bits 8..0, and `portSpriteList` refuses a stream shorter
  // than `2 + wide * high` and counts it as MISSING. A membership test alone
  // would pass on a stream that is present and too short.
  const wide = (m.size & 0x7e00) >> 9, high = m.size & 0x01ff;
  assert.equal(wide, 3);
  assert.equal(high, 32);
  const need = 2 + wide * high;
  for (const o of m.offs) {
    const s = SHIP.streams.get(o);
    assert.ok(s !== undefined,
      `$${o.toString(16).toUpperCase()} is not in the shipped sheet`);
    assert.ok(s.maskWords >= need,
      `$${o.toString(16).toUpperCase()} holds ${s.maskWords} mask words, `
      + `the record asks for ${need}`);
  }
});

// ============ 5. THE ASSERTION THAT WOULD HAVE CAUGHT D50

test('W415 the ground mark is not fetched later than the fireball it belongs to',
  { skip: SKIP_IMG || SKIP_SHEET }, () => {
  // THIS IS THE ITEM. On HEAD every stream above was present and long enough --
  // the four assertions before this one all passed -- and the owner still saw
  // the mark arrive after the death, because the eight streams were filed under
  // sprite shard 17, which `SPR_ORDER` fetches NINETEENTH OF NINETEEN, while
  // the fireball the same death spawns is shard 9, fetched FIFTH. A shard that
  // has not landed is not drawn (`portSpriteList`'s `here` test); `demand()`
  // promotes it the first frame a record asks, which is why the mark arrived
  // late rather than never.
  const m = markStreams();
  const fire = SHIP.streams.get(POOLB_KIND7_CELL0);
  assert.ok(fire !== undefined, 'the fireball first cell is in the sheet');
  const fireShard = SHIP.shardOfBase(fire.base);
  const fireOrder = SHIP.orderOf.get(fireShard);
  for (const o of m.offs) {
    const sh = SHIP.shardOfBase(SHIP.streams.get(o).base);
    const order = SHIP.orderOf.get(sh);
    assert.ok(order <= fireOrder,
      `the ground mark $${o.toString(16).toUpperCase()} is on sprite shard ${sh}, `
      + `fetched ${order} of ${SHIP.man.spr.shards.length - 1}, while the `
      + `fireball the same death spawns is on shard ${fireShard}, fetched `
      + `${fireOrder}. The mark cannot be drawn until its shard lands, so on `
      + 'the published page it arrives after the death that made it -- '
      + 'docket D50');
  }
});
