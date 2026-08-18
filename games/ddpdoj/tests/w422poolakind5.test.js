// W422 -- POOL-A KIND INDEX 5 ($27FF9A), BODY AND ART, AND IT IS ALSO INDEX 17.
//
// WHAT THIS FILE IS FOR. `$27F99E` has twenty entries over seven distinct bodies.
// Six of the seven were ported between W111 and W417; `$27FF9A` was the last, and
// it is named TWICE -- indices 5 and 17 -- so one function closes the table.
//
// THE BRIEF FOR THIS WAVE WAS WRONG ABOUT THE ART AND SECTION 7 IS WHERE IT SHOWS.
// It said the missing family was "$1E24DC $1E2510 $1E2544 ... stride $34". $34 is
// the stride of the LIVE ring, which is [M] already 16 of 16 in the bundle because
// hyper kinds 9 and 13 share it. The COLLECTED popup at $1E24DC is stride **$54**,
// and the cartridge says so four ways (the descriptor word $280F56, the sprite
// table's own spacing, the sibling family $1E2F5C already harvested at $54, and
// $2810CA's seven adds). Shipping the brief's eight addresses would have shipped
// four frames that are not in this animation and missed four that are.
//
// THE OTHER THING NOT TO REPEAT: kind 5's cull is `$280046 cmpi.w #$FE00,($2,A6)`
// followed by `$28004C 6D` = **BLT, signed**. Kind 0's twin is a bare `bmi`. A port
// that reused kind 0's reading frees the record 512 units early and NO fresh-`Ram`
// fixture notices, because a fresh slot never sits in [-$200, 0). SECTION 5 drives
// both sides of that band and SECTION 3 pins the opcode.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RomWindows } from '../src/rom.js';
import { Ram } from '../src/ram.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0, runPoolADriver, POOL_A, DISPATCH, B } from '../src/bee.js';
import { buildDisplayList, resetSpriteQueueCounters } from '../src/displaylist.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');

const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false
  : 'generated ROM tables absent; THIS IS A SKIP, NOT A PASS.';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false
  : 'the ROM image is absent; THIS IS A SKIP, NOT A PASS.';
const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => u16(a) * 0x10000 + u16(a + 2);
const hex = (a, n) => IMG.subarray(a, a + n).toString('hex');
const diffOffsets = (a, b, n) => {
  const out = [];
  for (let i = 0; i < n; i++) if (IMG[a + i] !== IMG[b + i]) out.push(i);
  return out;
};

// ---- the shipped bundle, read straight out of assets/ (no HTTP shim, no capture).
const MANIFEST = path.join(R, 'assets', 'manifest.json');
function shipped() {
  if (!existsSync(MANIFEST)) return null;
  const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const file = path.join(R, 'assets', man.spr.streamsFile);
  if (!existsSync(file)) return null;
  const raw = gunzipSync(readFileSync(file));
  const a = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
  const n = man.spr.streamCount;
  assert.equal(a.length, n * 3, 'streams.u32 is streamCount x 3');
  // W419's TRAP, carried forward: planes 0 AND 1 are first-differenced and only
  // plane 2 is raw. Reading plane 1 without accumulating gives every stream a base
  // of a few hundred, files them all under shard 0, and makes a shard assertion
  // pass while saying nothing.
  let rom = 0, base = 0;
  const triples = [];
  for (let i = 0; i < n; i++) {
    rom = (rom + a[i]) >>> 0;
    base = (base + a[n + i]) >>> 0;
    triples.push([rom, base, a[2 * n + i]]);
  }
  const shardOfBase = (b) => {
    for (const s of man.spr.shards) {
      if (b >= s.maskFrom && b < s.maskFrom + s.maskLen) return s.i;
    }
    return -1;
  };
  return {
    man,
    byRom: new Map(triples.map((t) => [t[0], t])),
    shardOfBase,
    map: romToPackedMap({ spr: { streams: triples } }, shardOfBase),
  };
}
const SHIP = shipped();
const SKIP_SHEET = SHIP ? false
  : 'assets/ has not been exported (node tools/export-web.mjs); '
    + 'THIS IS A SKIP, NOT A PASS.';

const KIND5 = 0x27ff9a;
const STEP5 = 0x27ffe6;
const CARRIER = 0x814600;
const STARP1 = 0x817f86, STARP2 = 0x817f8a;
const P1PEND = 0x81b4c0, P2PEND = 0x81b4c4;
const RING = 0x1bcd0c, RINGSTRIDE = 0x34, RINGWRAP = 0x1bd04c;
const POPUP = 0x1e24dc, POPUPSTRIDE = 0x54, POPUPEND = 0x1e277c;
// D0 = $44 is what the cartridge would pass; $280DBA rewrites the status to $14.
const ALLOC_D0 = 0x44;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + 0x02, 0x30001c00);            // long axis $3000, short $1C00
  const sounds = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    notes: log, soundPost: (a) => sounds.push(a) };
  return { ram, log, ctx, sounds };
}
const alloc = (f, kind = ALLOC_D0) => {
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, kind, 0, 0, CARRIER);
  assert.ok(slot !== null, 'the allocator delivered a slot');
  return slot;
};
const drive = (f) => runPoolADriver(f.ram, ROM, f.ctx);

// ============ 1. THE DISPATCH: ONE ADDRESS, TWO ENTRIES, AND THE TABLE CLOSES

test('W422 $27F99E names $27FF9A at indices 5 AND 17, and nowhere else',
  { skip: SKIP_IMG }, () => {
    assert.equal(u32(0x27f99e + 5 * 4), KIND5);
    assert.equal(u32(0x27f99e + 17 * 4), KIND5);
    assert.equal(DISPATCH[5], KIND5);
    assert.equal(DISPATCH[17], KIND5);
    const at = [];
    for (let i = 0; i < 20; i++) if (u32(0x27f99e + i * 4) === KIND5) at.push(i);
    assert.deepEqual(at, [5, 17], 'exactly two entries, and the port agrees');
    // ...and the port's DISPATCH is the cartridge's table, long for long.
    for (let i = 0; i < 20; i++) {
      assert.equal(DISPATCH[i], u32(0x27f99e + i * 4), `[${i}]`);
    }
    // FIFTEEN distinct ADDRESSES over twenty entries -- five aliases (0/4, 1/16,
    // 5/17, 6/18, 7/19) -- and the fifteen are SEVEN routines, because the hyper
    // cancel's eight are one body at eight addresses. After this wave every one of
    // the twenty is translated, which is what makes `runBody`'s throw a
    // table-integrity check rather than a to-do list.
    assert.equal(new Set(DISPATCH).size, 15);
    assert.equal(DISPATCH.length, 20);
    for (const [a, b] of [[0, 4], [1, 16], [5, 17], [6, 18], [7, 19]]) {
      assert.equal(DISPATCH[a], DISPATCH[b], `indices ${a} and ${b} alias`);
    }
  });

// ============ 2. THE EXTENT, BOUNDED THREE WAYS, AND THERE IS NO TRAILING DATA

test('W422 the unit is $27FF9A..$280081, $E8 of pure code with ZERO trailing bytes',
  { skip: SKIP_IMG }, () => {
    // (1) UPPER BOUND, entry to entry. The next distinct body in the table is
    // $280082, DISPATCH[6]/[18], ported since W216 as `stage4ImpactBody`.
    assert.equal(u32(0x27f99e + 6 * 4), 0x280082);
    assert.equal(DISPATCH[6], 0x280082);
    assert.equal(0x280082 - KIND5, 0xe8);

    // (2) THE SWEEP CLOSES IT EXACTLY. `$280080 4E75` is an rts that ENDS at
    // $280081, so the last byte of the unit is the last byte before the next
    // entry: entry-to-entry is not an over-estimate here, it is the answer.
    // W418's gap held this unit's own tables, W419's the next unit's data and
    // W420's was alignment; this is a FOURTH shape -- no gap at all.
    assert.equal(u16(0x280080), 0x4e75, 'the last instruction is rts');
    assert.equal(0x280080 + 2, 0x280082, 'and it ends AT the next entry');

    // The three flow breaks the linear sweep hits, each resumed at a branch target
    // computed from INSIDE the span, which is what makes the coverage complete:
    //   $27FF9E  67 46      beq  -> $27FFE6   the step arm
    //   $28004C  6D 24      blt  -> $280072   the free
    //   $280064  67 00 000A beq.w-> $280070   the rts
    assert.equal(IMG[0x27ff9e], 0x67);
    assert.equal(0x27ff9e + 2 + IMG[0x27ff9f], STEP5);
    assert.equal(IMG[0x28004c], 0x6d, '$6D is BLT -- NOT $6C, which is BGE');
    assert.equal(0x28004c + 2 + IMG[0x28004d], 0x280072);
    assert.equal(u16(0x280064), 0x6700);
    assert.equal(0x280066 + u16(0x280066), 0x280070);
    // ...and the one `bra.w`, whose target is the EXTENSION WORD's address plus disp.
    assert.equal(u16(0x27ffe2), 0x6000);
    assert.equal(0x27ffe4 + u16(0x27ffe4), 0x280fdc, 'the collect arm ends at $280FDC');

    // (3) THE LOW BOUND IS A POSITIVE WITNESS TOO. $27FF96 is `4ED0 jmp (A0)`, the
    // last instruction of kind 3's step, ported in W417; $27FF98 is a `4E71 nop`
    // that belongs to that routine's padding. Neither is reachable from $27FF9A,
    // and $27FF9A itself decodes as `andi.w #$1800,D1` -- a head, not a middle.
    assert.equal(u16(0x27ff92), 0x206e, '$27FF92 movea.l (d16,A6),A0');
    assert.equal(u16(0x27ff96), 0x4ed0, '$27FF96 jmp (A0)');
    assert.equal(u16(0x27ff98), 0x4e71, '$27FF98 nop -- kind 3 padding');
    assert.equal(u16(KIND5), 0x0241, '$27FF9A andi.w #imm,D1');
    assert.equal(u16(KIND5 + 2), 0x1800, '...of $1800');

    // THE ONE INTERIOR BYTE PAIR THAT IS NOT REACHED IS A NOP, NOT DATA. $280068's
    // `jmp` never falls through and the `beq.w` above jumps PAST $28006E to $280070,
    // so $28006E is unreachable filler -- and kind 0's body has the same nop in the
    // same place ($27FAB8), which is the witness that it is a cartridge habit and
    // not something this reading invented.
    assert.equal(u16(0x280068), 0x4ef9);
    assert.equal(u32(0x28006a), 0x23eba0);
    assert.equal(u16(0x28006e), 0x4e71, 'unreachable nop');
    assert.equal(u16(0x27fab8), 0x4e71, 'and kind 0 has one too');
    assert.equal(u16(0x27faba), 0x4e75);
  });

// ============ 3. IT IS KIND 0'S BODY, MEASURED BY BYTE DIFF ==================

test('W422 the step arm is kind 0 step to the byte, but for the ring',
  { skip: SKIP_IMG }, () => {
    // $27FA36..$27FA95 against $27FFE6..$280045 -- $60 bytes, from the animation
    // borrow down to and including `add.w D2,($2,A6)`.
    assert.deepEqual(diffOffsets(0x27fa36, STEP5, 0x60),
      [0x15, 0x1a, 0x1b, 0x22, 0x23]);
    // ...and each of the five is a byte of one of the three ring constants.
    assert.equal(u32(0x27fa48), 0x24, 'kind 0 stride');
    assert.equal(u32(0x27fff8), RINGSTRIDE, 'kind 5 stride');
    assert.equal(u32(0x27fa4e), 0x1bcd0c, 'kind 0 wrap');
    assert.equal(u32(0x27fffe), RINGWRAP, 'kind 5 wrap');
    assert.equal(u32(0x27fa56), 0x1bcacc, 'kind 0 base');
    assert.equal(u32(0x280006), RING, 'kind 5 base');
    // and kind 5's base IS kind 0's wrap: the two animations are adjacent runs of
    // one table, which is why W266's harvest already covers both.
    assert.equal((RINGWRAP - RING) % RINGSTRIDE, 0);
    assert.equal((RINGWRAP - RING) / RINGSTRIDE, 16, 'SIXTEEN live frames');

    // THE TAILS ARE IDENTICAL, ALL $34 BYTES: the busy threshold, the walk-parity
    // thinning, the `jmp $23EBA0`, the nop, the rts and the five-instruction free.
    assert.deepEqual(diffOffsets(0x27fa98, 0x28004e, 0x34), []);
    assert.equal(u16(0x28004e), 0x0c79, 'cmpi.w #imm,abs.l');
    assert.equal(u16(0x280050), 0x003c, '...and the threshold is $3C, kind 0\'s');
    assert.equal(u32(0x280052), POOL_A.liveCount);
  });

test('W422 the ONE structural difference is the cull, and it is BLT not BMI',
  { skip: SKIP_IMG }, () => {
    // Kind 0: `$27FA92 add.w D2,($2,A6)` / `$27FA96 6B 24 bmi` -- the N flag of the
    // ADD, i.e. long axis < 0.
    assert.equal(hex(0x27fa92, 4), 'd56e0002');
    assert.equal(IMG[0x27fa96], 0x6b, 'kind 0 is bmi');
    // Kind 5: the same add, then SIX bytes the twin does not have.
    assert.equal(hex(0x280042, 4), 'd56e0002');
    assert.equal(u16(0x280046), 0x0c6e, '$280046 cmpi.w #imm,(d16,A6)');
    assert.equal(u16(0x280048), 0xfe00, '...against $FE00');
    assert.equal(u16(0x28004a), 0x0002, '...on ($2,A6), the LONG axis');
    assert.equal(IMG[0x28004c], 0x6d, 'and $6D is BLT, SIGNED');
    // The two readings are NOT the same predicate, and the band that separates them
    // is real: $FF00 is negative, so `bmi` would free it and `blt #$FE00` does not.
    assert.ok((0xff00 & 0x8000) !== 0, 'bmi would fire at $FF00');
    assert.ok(((0xff00 << 16) >> 16) >= ((0xfe00 << 16) >> 16), '...blt does not');
  });

// ============ 4. THE COLLECT ARM IS KIND 3'S, EIGHT BYTES MOVED =============

test('W422 $27FFA0 and $27FEE0 are the same $46 bytes but for eight',
  { skip: SKIP_IMG }, () => {
    assert.deepEqual(diffOffsets(0x27fee0, 0x27ffa0, 0x46),
      [0x07, 0x13, 0x25, 0x2c, 0x3a, 0x3b, 0x44, 0x45]);
    // the two `lea`s -- and the ORDER is P1 first, with `bne` SKIPPING the P2 one,
    // where kind 2/3's arm loads P1 and tests with `bne` to the SHARED add. Same sense.
    assert.equal(u16(0x27ffa0), 0x7002, '$27FFA0 moveq #$2,D0 -- the counter add');
    assert.equal(u16(0x27ffa2), 0x41f9, '$27FFA2 lea abs.l,A0');
    assert.equal(u32(0x27ffa4), STARP1, '...P1 FIRST');
    assert.equal(u16(0x27ffa8), 0x0801, '$27FFA8 btst #imm,D1');
    assert.equal(u16(0x27ffaa), 0x000c, '...bit 12, P1');
    assert.equal(IMG[0x27ffac], 0x66, '$27FFAC bne -- SKIPS the second lea');
    assert.equal(0x27ffac + 2 + IMG[0x27ffad], 0x27ffb4);
    assert.equal(u32(0x27ffb0), STARP2, 'so P2 is the FALL-THROUGH');
    // the clamp, the selector, the score, the cue and the collected marker
    assert.equal(u16(0x27ffb6), 0x0c50, '$27FFB6 cmpi.w #imm,(A0)');
    assert.equal(u16(0x27ffb8), 0x03e8);
    assert.equal(IMG[0x27ffba], 0x65, '$27FFBA bcs -- UNSIGNED');
    assert.equal(u16(0x27ffbc), 0x30bc);
    assert.equal(u16(0x27ffbe), 0x03e7, 'the clamp is $3E7');
    assert.equal(u16(0x27ffc0), 0x2d7c);
    assert.equal(u32(0x27ffc2), 0x00010004, 'the SELECTOR');
    assert.equal(u16(0x27ffc6), 0x0010, '...into ($10,A6)');
    assert.equal(u16(0x27ffc8), 0x203c);
    assert.equal(u32(0x27ffca), 0x100, 'the score');
    assert.equal(u32(0x27ffd2), 0x286128, 'jsr $286128 -- scoreByMask');
    assert.equal(u32(0x27ffd8), 0x28c5e4, 'jsr $28C5E4 -- the STAR cue, not $28C610');
    assert.equal(hex(0x27ffdc, 6), '1d7c00840001', 'move.b #$84,($1,A6)');
    // kind 3's own four, so the diff above is attributable field by field
    assert.equal(u32(0x27fee4), 0x817f84);
    assert.equal(u32(0x27ff02), 0x00010008);
    assert.equal(u32(0x27ff0a), 0x1000);
    assert.equal(u32(0x27ff18), 0x28c610);
  });

// ============ 5. DRIVEN END TO END, FROM THE ALLOCATOR THE CARTRIDGE USES ====

test('W422 D0 = $44 lands a record ON THIS BODY, via $280DBA ori.w #$14',
  { skip: SKIP || SKIP_IMG }, () => {
    // $280BCE[17] = $280DBA and its last two instructions rewrite the status.
    assert.equal(u32(0x280bce + 17 * 4), 0x280dba);
    assert.equal(hex(0x280de0, 8), '0250ff8300500014',
      '$280DE0 andi.w #$FF83,(A0) / $280DE4 ori.w #$14,(A0)');
    // ...and the template it picks carries the very base the body's wrap restores,
    // which is the third independent witness that $44 is kind 5's allocation.
    assert.equal(u32(0x280e4a + 17 * 4), 0x280ef2);
    assert.equal(u32(0x280ef2 + 4), RING);

    const f = world();
    const slot = alloc(f);
    const status = f.ram.u16(slot + B.status);
    assert.equal(status, 0x8014, 'alive, kind bits $14');
    assert.equal((status & 0x7c) >> 2, 5, 'which the driver reads as index 5');
    assert.equal(DISPATCH[(status & 0x7c) >> 2], KIND5);
    assert.ok(f.ram.u32(slot + B.sprite) >= RING
      && f.ram.u32(slot + B.sprite) < RINGWRAP, 'and inside its own ring');
    // one clean frame through the real driver -- no throw, one live record drawn
    const r = drive(f);
    assert.deepEqual([r.live, r.emitted, r.freed, r.collected ?? 0], [1, 1, 0, 0]);
  });

test('W422 the $FE00 cull keeps a record kind 0 would have freed', { skip: SKIP }, () => {
  // THE SLOT IS DIRTIED FIRST. A recycled pool slot carries the previous tenant's
  // words, and W417/W418/W419 were each bitten by an assertion that only held on a
  // fresh `Ram()`. Every seed below is written over a non-zero field.
  const band = [
    // [long axis after the step, freed?]  -- the boundary is EXACTLY $FE00.
    [0x0000, false], [0xffff, false], [0xff00, false], [0xfe01, false],
    [0xfe00, false], [0xfdff, true], [0xfd00, true], [0x8000, true],
  ];
  for (const [pos, want] of band) {
    const f = world();
    const slot = alloc(f);
    for (let o = 0; o < 0x2c; o += 2) {                 // dirty every word first
      if (o !== B.status) f.ram.setU16(slot + o, 0xa5a5);
    }
    f.ram.setU16(slot + B.status, 0x8014);
    f.ram.setU16(slot + B.pos, pos);
    f.ram.setU16(slot + B.posX, 0x1000);
    f.ram.setU16(slot + 0x20, 0);                       // cached velocity: no motion
    f.ram.setU16(slot + 0x22, 0);
    f.ram.setU16(POOL_A.pause, 1);                      // keep the cache, skip $241812
    f.ram.setU16(POOL_A.liveCount, 1);
    f.ram.setU8(slot + B.blinkTimer, 5);                // not due: leave the ring alone
    drive(f);
    assert.equal(f.ram.u16(slot + B.status) === 0, want,
      `long axis $${pos.toString(16)}: freed should be ${want}`);
    if (want) {
      assert.equal(f.ram.u16(slot + B.pos), 0, '$280076 clears the position too');
      assert.equal(f.ram.u16(POOL_A.liveCount), 0, '$28007A decrements the count');
    }
  }
});

test('W422 the ring walks $34 and wraps at $1BD04C, and the timer is NOT forced',
  { skip: SKIP }, () => {
    const f = world();
    const slot = alloc(f);
    f.ram.setU16(slot + B.pos, 0x3000);
    f.ram.setU16(slot + 0x20, 0);
    f.ram.setU16(slot + 0x22, 0);
    f.ram.setU16(POOL_A.pause, 1);
    // start on the LAST frame of the ring so the wrap happens inside the trace
    f.ram.setU32(slot + B.sprite, RINGWRAP - RINGSTRIDE);
    f.ram.setU8(slot + B.blinkTimer, 0);                // due on the very next frame
    f.ram.setU8(slot + B.blinkTimer + 1, 3);            // reload from ($19,A6)
    const seen = [];
    for (let i = 0; i < 10; i++) {
      drive(f);
      seen.push([f.ram.u32(slot + B.sprite), f.ram.u8(slot + B.blinkTimer)]);
    }
    // frame 1 wraps to the BASE, and the reload is ($19,A6) = 3 -- kind 2 and kind 3
    // force $1 and $2 on their wrap frames and this one does NOT.
    assert.deepEqual(seen.map((s) => s[0]), [
      RING, RING, RING, RING, RING + RINGSTRIDE, RING + RINGSTRIDE,
      RING + RINGSTRIDE, RING + RINGSTRIDE, RING + 2 * RINGSTRIDE,
      RING + 2 * RINGSTRIDE,
    ]);
    assert.deepEqual(seen.map((s) => s[1]), [3, 2, 1, 0, 3, 2, 1, 0, 3, 2]);
  });

test('W422 the pause gate, the freeze gate and the speed ramp', { skip: SKIP }, () => {
  const seed = (f, slot) => {
    f.ram.setU16(slot + B.pos, 0x3000);
    f.ram.setU16(slot + B.posX, 0x1000);
    f.ram.setU8(slot + B.blinkTimer, 9);
    f.ram.setU8(slot + B.speed, 0x10);
    f.ram.setU8(slot + B.angle, 0x00);
    f.ram.setU16(slot + 0x20, 0x0111);                  // a cached pair nothing else
    f.ram.setU16(slot + 0x22, 0x0222);                  // could produce
  };
  // PAUSED ($803912 non-zero): the cache is kept, the ramp does not run.
  {
    const f = world(); const slot = alloc(f); seed(f, slot);
    f.ram.setU16(POOL_A.pause, 1);
    drive(f);
    assert.equal(f.ram.u8(slot + B.speed), 0x10, 'no ramp while paused');
    assert.equal(f.ram.u16(slot + 0x20), 0x0111, 'the cache survives');
    assert.equal(f.ram.u16(slot + B.pos), 0x3111, 'and it still MOVES on it');
    assert.equal(f.ram.u16(slot + B.posX), 0x1222);
  }
  // UNPAUSED but FROZEN ($8130D2 non-zero): no ramp, but the vector IS recomputed.
  {
    const f = world(); const slot = alloc(f); seed(f, slot);
    f.ram.setU16(POOL_A.freeze, 1);
    drive(f);
    assert.equal(f.ram.u8(slot + B.speed), 0x10, 'no ramp while frozen');
    assert.notEqual(f.ram.u16(slot + 0x20), 0x0111, 'the cache is REPLACED');
    const v = MT.vector(0x10, 0x00);
    assert.equal(f.ram.u16(slot + 0x20), v.dy);
    assert.equal(f.ram.u16(slot + 0x22), v.dx);
  }
  // RUNNING: the ramp adds one, and the recompute uses the RAMPED value.
  {
    const f = world(); const slot = alloc(f); seed(f, slot);
    drive(f);
    assert.equal(f.ram.u8(slot + B.speed), 0x11, '$28001A addq.b #1,($1A,A6)');
    const v = MT.vector(0x11, 0x00);
    assert.equal(f.ram.u16(slot + 0x20), v.dy);
    assert.equal(f.ram.u16(slot + 0x22), v.dx);
  }
  // ...and the angle is masked to SIX bits by `$280024 moveq #$3F / $280026 and.b`.
  {
    const f = world(); const slot = alloc(f); seed(f, slot);
    f.ram.setU8(slot + B.angle, 0xc5);                  // $C5 & $3F = $05
    drive(f);
    const v = MT.vector(0x11, 0x05);
    assert.equal(f.ram.u16(slot + 0x20), v.dy);
    assert.equal(f.ram.u16(slot + 0x22), v.dx);
  }
});

test('W422 the $3F angle mask is TRANSCRIBED, and no input can observe it',
  { skip: SKIP }, () => {
    // NAMED RATHER THAN FAKED, the way W417 named its two untestable mutations.
    // `$280024 moveq #$3F,D1 / $280026 and.b ($1B,A6),D1` is a real instruction pair
    // in the cartridge -- [M] the bytes are asserted below -- but `$241812` opens
    // with `$2417E4 moveq #$3F / and.b` and applies the SAME mask to its own
    // argument. `MoveTables.vector` reproduces that inner mask, so dropping the
    // outer one changes nothing any record can show.
    if (!SKIP_IMG) {
      assert.equal(u16(0x280024), 0x723f, '$280024 moveq #$3F,D1');
      assert.equal(u16(0x280026), 0xc22e, '$280026 and.b (d16,A6),D1');
      assert.equal(u16(0x280028), 0x001b, '...on ($1B,A6), the angle byte');
    }
    // THE POSITIVE WITNESS that no fixture can separate the two readings: over the
    // whole byte domain, the masked and unmasked calls agree on every angle.
    for (let a = 0; a < 256; a++) {
      const m = MT.vector(0x11, a & 0x3f);
      const u = MT.vector(0x11, a);
      assert.deepEqual([u.dy, u.dx], [m.dy, m.dx], `angle $${a.toString(16)}`);
    }
  });

test('W422 a busy pool thins by walk parity at $3C, not below it', { skip: SKIP }, () => {
  // The count and the population are the SAME number here: faking $817F7E without
  // the records makes the driver's own slot walk throw, which is how this test
  // found out that the threshold cannot be probed with one record and a big count.
  const run = (n, phase) => {
    const f = world();
    f.ram.setU16(POOL_A.collisionPhase, phase);
    for (let i = 0; i < n; i++) alloc(f);
    f.ram.setU16(POOL_A.pause, 1);                      // keep every cached velocity
    assert.equal(f.ram.u16(POOL_A.liveCount), n, 'the pool really holds n records');
    const r = drive(f);
    assert.equal(r.live, n, 'and the driver walked all of them');
    return r.emitted;
  };
  // `remaining` is the dbra counter D7 - n, so it runs n-1 down to 0 and its parity
  // alternates. Under $3C every record draws; at $3C exactly half are dropped,
  // whichever phase $80390C holds -- the pool thins itself instead of culling.
  assert.equal(run(0x3b, 0), 0x3b, 'under $3C every record draws');
  assert.equal(run(0x3b, 1), 0x3b);
  assert.equal(run(0x3c, 0), 0x1e, 'at $3C, half of them are skipped');
  assert.equal(run(0x3c, 1), 0x1e);
});

// ============ 6. COLLECTION, AND THE FOURTH SELECTOR ========================

test('W422 collecting runs the arm, the transform and the popup', { skip: SKIP }, () => {
  for (const [bit, ctr, other, pend] of [
    [0x1000, STARP1, STARP2, P1PEND], [0x0800, STARP2, STARP1, P2PEND]]) {
    const f = world();
    const slot = alloc(f);
    // DIRTY the fields the arm and the transform write, so nothing below can pass
    // on a fresh-`Ram` zero.
    f.ram.setU32(slot + B.hitLongA, 0xdeadbeef);
    f.ram.setU16(slot + B.hitShortB, 0x5a5a);
    f.ram.setU32(slot + B.spriteOff, 0x5a5a5a5a);
    f.ram.setU16(slot + B.size, 0x5a5a);
    f.ram.setU8(slot + B.blinkTimer, 0x5a);
    f.ram.setU8(slot + B.blinkTimer + 1, 0x5a);
    f.ram.setU16(ctr, 0x0100);
    f.ram.setU16(other, 0x0007);
    f.ram.setU32(pend, 0);
    f.ram.setU16(slot + B.status, 0x8014 | bit);        // block 3's collect flag
    const r = drive(f);
    assert.equal(r.collected, 1);
    // the counter: +2 on the arm's own player, and the OTHER one untouched
    assert.equal(f.ram.u16(ctr), 0x0102, 'the arm adds $2');
    assert.equal(f.ram.u16(other), 0x0007, 'the other player HELD');
    // the score, read out of the accumulator rather than out of the image
    assert.equal(f.ram.u32(pend), 0x100);
    assert.deepEqual(f.sounds, [0x28c5e4]);
    // ...and the transform ran: `$27FFDC move.b #$84,($1,A6)` then $280FDC's
    // `andi.w #$F8DF`, which leaves bit 7 set so the driver takes the popup arm.
    assert.equal(f.ram.u16(slot + B.status) & 0x0080, 0x0080);
    assert.equal(f.ram.u32(slot + B.sprite), POPUP, 'selector $00010004 -> $1E24DC');
    assert.equal(f.ram.u16(slot + B.hitShortB), POPUPSTRIDE, 'and the step is $54');
    assert.equal(f.ram.u32(slot + B.spriteOff), 0xfc00fb00, 'descriptor 1 offsets');
    assert.equal(f.ram.u16(slot + B.size), 0x0428, 'descriptor 1 size');
  }
});

test('W422 the clamp is $3E7 and it is UNSIGNED', { skip: SKIP }, () => {
  for (const [before, after] of [[0x03e5, 0x03e7], [0x03e6, 0x03e7], [0x03e7, 0x03e7],
    [0x8000, 0x03e7]]) {
    const f = world();
    const slot = alloc(f);
    f.ram.setU16(STARP1, before);
    f.ram.setU16(slot + B.status, 0x8014 | 0x1000);
    drive(f);
    assert.equal(f.ram.u16(STARP1), after, `$${before.toString(16)}`);
  }
  // $8000 is the one that separates `bcs` from `blt`: signed, $8000 + 2 is still
  // below $3E8 and the clamp would NOT fire. [M] the opcode is $65 = bcs.
  assert.equal(IMG === null ? 0x65 : IMG[0x27ffba], 0x65);
});

test('W422 FOUR selector values exist in the image, not three', { skip: SKIP_IMG }, () => {
  // W411's note and export-tables.py's both said three. The BOUND (three descriptor
  // pointers) is right; the reason was not. Scan every `move.l #imm,($10,A6)` in
  // the pool-A body range and read the values back.
  const found = new Map();
  for (let a = 0x27f000; a < 0x281000; a += 2) {
    if (u16(a) === 0x2d7c && u16(a + 6) === 0x0010) {
      const v = u32(a + 2);
      if (!found.has(v)) found.set(v, []);
      found.get(v).push(a);
    }
  }
  assert.deepEqual([...found.keys()].sort((x, y) => x - y),
    [0x00010004, 0x00010008, 0x00050000, 0x00050004]);
  // $00010004 is written at THREE sites, and only ONE of them reaches $280FDC.
  assert.deepEqual(found.get(0x00010004), [0x27ffc0, 0x280384, 0x2807f0]);
  assert.equal(0x27ffe4 + u16(0x27ffe4), 0x280fdc, 'kind 5 branches to the transform');
  for (const site of [0x280384, 0x2807f0]) {
    // hyper kinds 9 and 13: the free shape follows, no `bra.w` at all.
    assert.ok(hex(site + 4, 40).includes('70003c803d400002'),
      `$${site.toString(16)} frees instead`);
  }
  // ...and the low words, which is what actually bounds the pointer run, are three.
  assert.equal(new Set([...found.keys()].map((v) => v & 0xffff)).size, 3);
  assert.equal(POOL_A.collectSelectors, 3);
});

// ============ 7. THE ART, MEASURED, AND THE BRIEF'S STRIDE WAS WRONG ========

test('W422 the popup stride is $54 and the cartridge says so three ways',
  { skip: SKIP_IMG }, () => {
    // (1) THE DESCRIPTOR. Selector $00010004's LOW word 4 picks $280F34's second
    // pointer, and that descriptor's last word is the step $281010 stores.
    const rec = u32(0x280f34 + 4);
    assert.equal(rec, 0x280f4c, 'descriptor 1');
    const base = u32(rec);
    assert.equal(base, 0x280f8c, 'its sprite table');
    assert.equal(u32(rec + 4), 0xfc00fb00, 'its offset pair');
    assert.equal(u16(rec + 8), 0x0428, 'its size');
    assert.equal(u16(rec + 10), POPUPSTRIDE, 'ITS STEP IS $54, NOT $34');
    // (2) THE TABLE'S OWN SPACING. The HIGH word 1 indexes entry 1, and entry 2 is
    // exactly eight steps on -- so the table closes the run itself.
    assert.equal(u32(base + 1 * 4), POPUP);
    assert.equal(u32(base + 2 * 4), POPUPEND);
    assert.equal(POPUPEND - POPUP, 8 * POPUPSTRIDE);
    for (let i = 0; i < 9; i++) {
      assert.equal(u32(base + (i + 1) * 4) - u32(base + i * 4), 8 * POPUPSTRIDE,
        `$280F8C[${i}] to [${i + 1}]`);
    }
    // (3) THE SIBLING. Kind 18's selector $00050004 has the SAME low word, so it
    // reads the SAME descriptor -- and export-web.mjs has harvested $1E2F5C at
    // stride $54 since W216. Two entries of one table cannot have two strides.
    assert.equal(u16(0x2800a8), 0x2d7c);
    assert.equal(u32(0x2800aa), 0x00050004);
    assert.equal(u32(base + 5 * 4), 0x1e2f5c);
    // THE BRIEF'S EIGHT ADDRESSES, AT STRIDE $34, ARE NOT THIS FAMILY: it stops
    // $130 short of the table's own end.
    assert.notEqual(POPUP + 8 * 0x34, POPUPEND);
    assert.equal(POPUPEND - (POPUP + 8 * 0x34), 0x100);
  });

test('W422 all eight popup frames AND the sixteen live frames are in the bundle',
  { skip: SKIP_SHEET }, () => {
    // THE LIVE RING NEEDED NOTHING: hyper kinds 9 and 13 animate it and W266
    // harvested it, so the half that was missing is the popup alone.
    for (let i = 0; i < 16; i++) {
      const a = RING + i * RINGSTRIDE;
      assert.ok(SHIP.byRom.has(a),
        `live frame $${a.toString(16).toUpperCase()} is missing`);
    }
    // THE POPUP, which W422 ships. Every frame present, in ONE shard, and each
    // one's maskWords equal to the others' -- these are eight frames of one size.
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const a = POPUP + i * POPUPSTRIDE;
      const t = SHIP.byRom.get(a);
      assert.ok(t, `popup frame $${a.toString(16).toUpperCase()} is missing`);
      rows.push([SHIP.shardOfBase(t[1]), t[2]]);
    }
    assert.equal(new Set(rows.map((r) => r[0])).size, 1, 'one shard');
    assert.equal(rows[0][0], 11, 'shard 11, where $1E179C and $1E2F5C already live');
    assert.deepEqual(rows.map((r) => r[1]), new Array(8).fill(rows[0][1]));
    // and they are CONTIGUOUS in the packed mask, which is what says they were
    // appended as one family rather than gathered from a repack.
    for (let i = 1; i < 8; i++) {
      const prev = SHIP.byRom.get(POPUP + (i - 1) * POPUPSTRIDE);
      const cur = SHIP.byRom.get(POPUP + i * POPUPSTRIDE);
      assert.equal(cur[1], prev[1] + prev[2], `frame ${i} follows frame ${i - 1}`);
    }
    // the two neighbours the walk must NOT have swallowed: $1E223C is entry 0 and
    // $1E277C is entry 2, and neither is part of this animation.
    assert.equal(SHIP.byRom.has(POPUPEND), false, '$1E277C is the NEXT family');
    assert.equal(SHIP.byRom.has(0x1e223c), false, '...and $1E223C the previous one');
  });

test('W422 a collected kind-5 record REACHES THE GLASS, frame by frame',
  { skip: SKIP || SKIP_SHEET }, () => {
    const f = world();
    const slot = alloc(f);
    f.ram.setU16(slot + B.pos, 0x3000);
    f.ram.setU16(slot + B.posX, 0x1000);
    f.ram.setU16(slot + B.status, 0x8014 | 0x1000);
    drive(f);                                            // the collect frame
    assert.equal(f.ram.u32(slot + B.sprite), POPUP);
    const seen = [];
    for (let i = 0; i < 60 && f.ram.u16(slot + B.status) !== 0; i++) {
      resetSpriteQueueCounters(f.ram);
      drive(f);
      buildDisplayList(f.ram);
      const L = portSpriteList(f.ram, SHIP.map);
      seen.push({ sprite: f.ram.u32(slot + B.sprite), records: L.records,
        drawn: L.drawn, skipped: L.skipped, missing: [...L.missing.keys()] });
    }
    // EVERY frame the popup shows is one of the eight, and never past the eighth.
    const frames = [...new Set(seen.map((s) => s.sprite))].sort((a, b) => a - b);
    for (const a of frames) {
      assert.equal((a - POPUP) % POPUPSTRIDE, 0,
        `$${a.toString(16)} is on the $54 grid`);
      assert.ok(a >= POPUP && a < POPUPEND, `$${a.toString(16)} is inside the family`);
    }
    assert.equal(frames[frames.length - 1], POPUP + 7 * POPUPSTRIDE,
      '$2810CA reaches base + 7 x $54 and no further');
    assert.equal(frames.length, 8, 'and it shows all eight');
    // AND IT DRAWS. `skipped` is the counter that reads 1 on every frame if the art
    // half of this wave is left out, which is exactly what HEAD's bundle produced.
    assert.deepEqual([...new Set(seen.map((s) => s.skipped))], [0]);
    assert.deepEqual(seen.flatMap((s) => s.missing), []);
    assert.deepEqual([...new Set(seen.map((s) => s.records))], [1]);
    assert.deepEqual([...new Set(seen.map((s) => s.drawn))], [1]);
  });

// ============ 8. NOTHING IN THIS IMAGE ALLOCATES IT, AND THAT IS A MEASUREMENT

test('W422 no call site in the 6 MB image passes D0 = $14 or $44 to the allocator',
  { skip: SKIP_IMG }, () => {
    // The pool-A allocator has six entry points. Every reference to any of them in
    // the whole image is a `jsr` operand -- the longs appear NOWHERE else, so there
    // is no indirect call through a table either.
    const entries = [0x27f8e6, 0x27f8ee, 0x27f8f0, 0x27f8f8, 0x27f8fa, 0x27f92a];
    const want = new Set(entries);
    const sites = [];
    for (let a = 2; a + 4 <= IMG.length; a += 2) {
      if (!want.has(u32(a))) continue;
      const op = u16(a - 2);
      assert.ok(op === 0x4eb9 || op === 0x4ef9,
        `$${u32(a).toString(16)} appears at $${a.toString(16)} outside a jsr/jmp`);
      sites.push(a - 2);
    }
    assert.equal(sites.length, 27, 'twenty-seven call sites, all of them jsr/jmp');
    // ...and not one of them is preceded by a D0 load of $14 or $44 within 44 bytes.
    for (const site of sites) {
      for (let back = 2; back <= 44; back += 2) {
        const a = site - back;
        assert.notEqual(u16(a), 0x7014, `$${a.toString(16)} moveq #$14,D0`);
        assert.notEqual(u16(a), 0x7044, `$${a.toString(16)} moveq #$44,D0`);
        if (u16(a) === 0x303c) {
          assert.notEqual(u16(a + 2), 0x0014, `$${a.toString(16)} move.w #$14,D0`);
          assert.notEqual(u16(a + 2), 0x0044, `$${a.toString(16)} move.w #$44,D0`);
        }
      }
    }
    // So kind 5 cannot be produced on any bench here and this wave claims no state
    // trace for a cartridge-driven one. It is ported because the dispatch names it
    // twice and because it was the last live latent throw in `runBody`.
  });
