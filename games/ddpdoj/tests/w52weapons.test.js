// WAVE 52 -- THE WEAPONS ARE VISIBLE: the enemy-bullet sprite sink
// (`$284286`/`$283194`/`$281D9A`), the two animation rings the sink made live
// (`26-review` F2 at `$282B7A` and its third sibling at `$282748`), the shot and
// bullet art harvest, and the planar stream table.
//
// EVERY EXPECTED VALUE IS DERIVED FROM THE LISTING, quoted at the assertion,
// never from running the port and writing down what came out (`docs/knowledge/03`).
//
// Two shapes are avoided on purpose:
//  * NO FIXTURE SITS WHERE TWO READINGS AGREE. The renderOffs halves are
//    DIFFERENT numbers and the two positions are different, so the F1 axis swap
//    is a visible failure rather than a coincidence.
//  * NO ASSERTION SEEDS ITS OWN ANSWER. The packed position word is computed by
//    hand from `asr.l #6 / andi.l #$07FF03FF / ori.l #$80008000`.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { BUL, REC } from '../src/bullets.js';
import { spriteEmit, runMover, MOVER, CONTINUATIONS, EMIT_BYTES } from '../src/mover.js';
import { BULLET_DRIVER, runBulletDriver } from '../src/bulletdriver.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SRC = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const TOOL = (f) => fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8');
const u16 = (v) => v & 0xffff;
const POOL0 = BUL.pool;

/** A live bullet whose four sprite fields are all DIFFERENT, so a swapped or
 *  dropped field cannot pass by coincidence. */
function seedSpriteRec(ram, s, o = {}) {
  const b = POOL0 + s * BUL.stride;
  ram.setU16(b + REC.typeWord, o.type ?? 0x8000);
  ram.setU16(b + REC.posA, o.posA ?? 0x4000);       // vertical
  ram.setU16(b + REC.posB, o.posB ?? 0x2000);       // horizontal -- DIFFERENT
  ram.setU16(b + 0x06, o.roHi ?? 0x0100);           // the +$6 half
  ram.setU16(b + 0x08, o.roLo ?? 0x0200);           // the +$8 half -- DIFFERENT
  ram.setU32(b + REC.descriptor, o.desc ?? 0x001c0d1c);
  ram.setU16(b + REC.graphic, o.gfx ?? 0x0210);
  ram.setU16(b + REC.attribute, o.attr ?? 0x001a);
  return b;
}

// =============================================== $284286, THE EMIT ITSELF

test('$284286 adds the +$6 half to posA and the +$8 half to posB (26-review F1)', () => {
  // 284286 lea ($2,A6),A1      A1 = +$2
  // 28428a move.l (A1)+,D0     D0 = [posA:posB],  A1 = +$6
  // 28428c swap D0             D0 = [posB:posA] -- the LOW half is now posA
  // 28428e add.w (A1)+,D0      so posA += word@+$6,  A1 = +$8
  // 284290 swap D0             D0 = [posA':posB]
  // 284292 add.w (A1)+,D0      posB += word@+$8
  const ram = new Ram(null);
  const base = seedSpriteRec(ram, 0);
  const at = 0x809c4c;
  spriteEmit({ ram, spriteOut: { a4: at } }, base);
  // BY HAND: posA = $4000 + $0100 = $4100 ; posB = $2000 + $0200 = $2200
  // long = $41002200 ; asr.l #6 -> $01040088 ; & $07FF03FF -> $01040088
  // ori.l #$80008000 -> $81048088
  assert.equal(ram.u32(at), 0x81048088,
    'the axes are swapped -- word@+$6 belongs to posA, not to posB');
  assert.equal(ram.u32(at + 4), 0x001c0d1c, '$2842A4 move.l (A1)+,(A4)+  the descriptor');
  assert.equal(ram.u16(at + 8), 0x0210, '$2842A6 move.w (A1),(A4)+  the graphic');
  assert.equal(ram.u16(at + 10), 0x001a, '$2842A8 move.w ($1c,A6),(A4)+  the attribute');
});

test('the pre-W52 pairing is a DIFFERENT number, so the check above is not vacuous', () => {
  const ram = new Ram(null);
  const base = seedSpriteRec(ram, 0);
  const at = 0x809c4c;
  spriteEmit({ ram, spriteOut: { a4: at }, mut: 'emit-axes-swapped' }, base);
  // posA = $4000 + $0200 = $4200 ; posB = $2000 + $0100 = $2100
  // $42002100 asr.l #6 -> $01080084 ; ori -> $81088084
  assert.equal(ram.u32(at), 0x81088084);
  assert.notEqual(ram.u32(at), 0x81048088);
});

test('$2842A2..$2842A8 write TWELVE bytes and advance A4 by twelve', () => {
  const ram = new Ram(null);
  const base = seedSpriteRec(ram, 0);
  const out = { a4: 0x809c4c };
  spriteEmit({ ram, spriteOut: out }, base);
  assert.equal(EMIT_BYTES, 12, 'the display-list request is 12 bytes (spritequeue.js)');
  assert.equal(out.a4, 0x809c4c + 12, '(A4)+ four times = +$C');
  spriteEmit({ ram, spriteOut: out }, base);
  assert.equal(out.a4, 0x809c4c + 24, 'the second record lands after the first');
  assert.equal(ram.u32(0x809c4c + 12), ram.u32(0x809c4c),
    'and it is a SECOND record, not a rewrite of the first');
});

test('a caller with no spriteOut writes nothing at all (the position gate)', () => {
  const ram = new Ram(null);
  const base = seedSpriteRec(ram, 0);
  spriteEmit({ ram }, base);
  assert.equal(ram.u32(0x809c4c), 0, 'the gate passes no sink and must see no write');
});

// ================================================ $283194, THE TRAIL BLOCK

test('$283194 lea (-$c,A4),A4 REWINDS A4 -- the record MOVES to bucket 22', () => {
  // 283194 lea (-$c,A4),A4     <-- and nothing restores it before the dbra
  // 283198 movea.l $81B41C,A0
  // 28319e movea.l A4,A2
  // 2831a0 move.l (A2)+,(A0)+  x3
  // 2831a6 move.l A0,$81B41C
  const ram = new Ram(null);
  ram.setU16(0x813176, 0);
  // kind 27's continuation IS the trail block. Drive it directly.
  const base = seedSpriteRec(ram, 0, { type: 0x8000 });
  ram.setU32(base + REC.continuation, 0x283194);
  ram.setU32(base + 0x0a, 0x1bfef4);         // the ring's own wrap base
  ram.setU16(base + 0x30, 0);                // the drift budget: spent
  const out = { a4: 0x809c4c };
  ram.setU32(0x81b41c, 0x809274);
  // the plain path emits first, then the continuation runs.
  const ctx = { ram, rom: null, notes: new UnportedLog(), spriteOut: out };
  spriteEmit(ctx, base);
  assert.equal(out.a4, 0x809c4c + 12);
  CONTINUATIONS.get(0x283194)(ctx, base);
  assert.equal(out.a4, 0x809c4c,
    'A4 must be back where it started: the entry is MOVED, not copied, and the '
    + 'next slot overwrites those twelve bytes');
  assert.equal(ram.u32(0x81b41c), 0x809274 + 12, '$2831A6 move.l A0,$81B41C');
  assert.equal(ram.u32(0x809274), ram.u32(0x809c4c),
    'the twelve bytes are the ones the emit just wrote');
});

// ================================================ $281D9A, THE TWO COUNTERS

test('$281DCE/$281DD6 set both counters from pointer differences that MOVED', () => {
  const ram = new Ram(null);
  ram.setU16(0x813176, 0);
  for (let s = 0; s < 3; s++) {
    const b = seedSpriteRec(ram, s);
    ram.setU32(b + REC.continuation, 0x282944);   // kind 12: animate, no pos effect
    ram.setU32(b + 0x0a, 0x1c0ca4);
  }
  ram.setU16(BULLET_DRIVER.ctr22, 0);
  ram.setU16(BULLET_DRIVER.ctr23, 0);
  const r = runBulletDriver({ ram, rom: null, unportedLog: new UnportedLog() });
  assert.equal(r.emitted, 3, 'three live slots, three 12-byte records');
  assert.equal(ram.u16(BULLET_DRIVER.ctr23), 36,
    '$281DD6 move.w A4,$80AFE2 -- 3 records x 12 bytes');
  assert.equal(ram.u16(BULLET_DRIVER.ctr22), 0,
    'no trailing kind ran, so bucket 22 is untouched ($281DB2 read it back as 0)');
});

test('bucket 22 APPENDS: $281DB2 reads $80AFE0 back before the mover runs', () => {
  const ram = new Ram(null);
  ram.setU16(0x813176, 0);
  ram.setU16(BULLET_DRIVER.ctr22, 24);            // two records already staged
  ram.setU16(BULLET_DRIVER.ctr23, 0);
  runBulletDriver({ ram, rom: null, unportedLog: new UnportedLog() });
  assert.equal(ram.u16(BULLET_DRIVER.ctr22), 24,
    'the driver is the exception that proves the bulk-writer rule: it APPENDS');
});

// ============================== THE TWO RINGS THE SINK MADE LIVE

test('$282B7A wraps kind 19 at $1C1E38 back to $1C1BF8 (26-review F2)', () => {
  // 282b74 addi.l #$24,(A6)      A6 = base+$A
  // 282b7a cmpi.l #$1c1e38,(A6)
  // 282b80 bne $282b88
  // 282b82 move.l #$1c1bf8,(A6)
  const step = (from, mut) => {
    const ram = new Ram(null);
    const base = POOL0;
    ram.setU16(base + REC.typeWord, 0x8000);
    ram.setU8(base + 0x34, 0x08);                 // bit 3 set -> the animate arm
    ram.setU16(base, ram.u16(base) & ~0x0800);    // bchg #3 must return 0
    ram.setU32(base + 0x0a, from);
    CONTINUATIONS.get(0x282b64)({ ram, rom: null, notes: new UnportedLog(), mut }, base);
    return ram.u32(base + 0x0a);
  };
  assert.equal(step(0x1c1c1c), 0x1c1c40, 'inside the ring it is a plain +$24');
  assert.equal(step(0x1c1e14), 0x1c1bf8,
    '$1C1E14 + $24 == $1C1E38, which is the wrap: it must come back to $1C1BF8');
  assert.equal(step(0x1c1e14, 'kind19-no-wrap'), 0x1c1e38,
    'the pre-W52 code stepped straight past the wrap, which is what put '
    + '$1C1E5C/$1C1E80/$1C1EA4 -- addresses in no ROM animation table -- on screen');
});

test('$282748 bounds kind 7 by the limit at +$10 and the span at +$14', () => {
  // 282748 addi.l #$24,D0
  // 28274e cmp.l (A0)+,D0     A0 = +$10 -> the LIMIT
  // 282752 sub.l (A0),D0      A0 = +$14 -> the SPAN
  // 282756 move.l D0,(A6)
  // 282758 move.b (A0)+,(A0)+ +$19 := +$18
  const step = (from, mut) => {
    const ram = new Ram(null);
    const base = POOL0;
    ram.setU8(base + 0x19, 0);                    // $282738 tst.b: not delayed
    ram.setU8(base + 0x18, 0x03);                 // the reload
    ram.setU32(base + 0x0a, from);
    ram.setU32(base + 0x14, 0x6c);                // $2826F4 move.l #$6C,$14(A6)
    ram.setU32(base + 0x10, 0x1bf9e4 + 0x6c);     // $283C42: spr + (+$14)
    CONTINUATIONS.get(0x282738)({ ram, rom: null, notes: new UnportedLog(), mut }, base);
    return { at: ram.u32(base + 0x0a), delay: ram.u8(base + 0x19) };
  };
  assert.equal(step(0x1bf9e4).at, 0x1bfa08, 'inside the ring it is a plain +$24');
  assert.equal(step(0x1bfa2c).at, 0x1bf9e4,
    '$1BFA2C + $24 == the limit, so the SPAN $6C comes back off it: a THREE-frame ring');
  assert.equal(step(0x1bfa2c, 'kind7-no-wrap').at, 0x1bfa50,
    'unbounded, the port walks off the end of a three-frame ring');
  assert.equal(step(0x1bf9e4).delay, 0x03,
    '$282758 move.b (A0)+,(A0)+ reloads the delay byte +$19 from +$18');
});

// ================================================== THE HARVEST, AS SOURCE
//
// A unit test cannot read the cartridge (`node --test` must pass on a tree with
// no ROM), so these read the EXPORTER, which is where the extents are claimed.
// The extents themselves are checked against the ROM on every export by
// `checkTableExtent` and by the chain walk, and those were seen to fail.

test('the shot harvest walks the four template tables the PORT reaches', () => {
  const s = TOOL('export-web.mjs');
  for (const t of ['0x2554ea', '0x255502', '0x24d2fc', '0x24d35c']) {
    assert.ok(s.includes(t), `${t} is a shot template pointer table src/ reads`);
  }
  assert.ok(/SHOT_POWERS = \[0, 2, 4, 6, 8\]/.test(s),
    'the power index is ($20,A6)*2 over 0,2,4,6,8 -- $249C48 / $24D4F8');
  assert.ok(/SHOT_ANIM_TOP[\s\S]{0,200}0x24d2fc: 8/.test(s),
    'a pod installs ($24,A6) from a phase that cycles 8,4,0, so its ring is 3 long');
});

test('the shot harvest REFUSES a template whose dispatch nibble is unported', () => {
  const s = TOOL('export-web.mjs');
  assert.ok(s.includes('SHOT_HIT_TABLE = { 0: 0x24deb2, 2: 0x25014c }'),
    'nibble 0 -> $253C7A\'s table, nibble 2 -> $253F38\'s');
  assert.ok(/if \(!\(nib in SHOT_HIT_TABLE\)\) \{[\s\S]{0,400}throw new Error/.test(s),
    'a template carrying an unported nibble must STOP the export, not ship art '
    + 'for a handler that does not exist ($268594 is the precedent)');
  assert.ok(s.includes('now carries a PORTED dispatch nibble'),
    'and the deliberately-unharvested +4 laser arm is asserted to STAY unported: '
    + 'the day $254078 lands, the export must stop and say so rather than leave '
    + 'the laser shots as a silent named skip');
});

test('every bullet range must close EXACTLY on its stated end address', () => {
  const s = TOOL('export-web.mjs');
  assert.ok(/BULLET_RANGES = Object\.freeze\(\[/.test(s));
  for (const [b, e] of [['0x1bf58c', '0x1c0e9c'], ['0x1c1418', '0x1c143c'],
    ['0x1c1658', '0x1c167c'], ['0x1c1b68', '0x1c23d8']]) {
    assert.ok(s.includes(`[${b}, ${e},`), `the range ${b}..${e} is claimed`);
  }
  assert.ok(/if \(a !== endsAt\) \{[\s\S]{0,400}throw new Error/.test(s),
    'the chain STEPPING OVER the stated end is an error -- that two-sided pin is '
    + 'the whole reason a range is not a guess');
});

test('the two weapon shards are DEFERRED and fetched FIRST among the deferred', () => {
  const s = TOOL('export-web.mjs');
  assert.ok(/\[6, 'shots'/.test(s) && /\[7, 'bullets'/.test(s));
  assert.ok(/SPR_BOOT = \[0\]/.test(s),
    'shard 0 stays the ONLY boot shard, so capture.bin and bundlegate cannot move');
  // W53 inserted shard 8, THE IMPACT SPARK, fourth: its deadline is the first
  // frame a shot CONNECTS, which is behind both weapons and ahead of shard 1.
  // W54 inserted shard 9, THE DEATH EXPLOSION, fourth -- ahead of the spark
  // even though it is 218.4 KiB against 0.8, because [M] the first frame an
  // enemy DIES is the same frame the first shot connects (24 in webgate's own
  // tapped window) and `demand()` promotes whichever the simulation reaches.
  // W58 inserted shard 10, THE LASER, THIRD -- ahead of the death explosion,
  // because the player can hold fire on frame one and the beam is the owner's
  // most-repeated complaint -- and shard 11, THE STRUCTURES, LAST, because it
  // is 256.7 KiB and `demand()` promotes it the moment a record asks ([M] +5.3 s).
  // W61 inserted shard 12, THE ITEM, immediately behind the explosion: [M] the
  // only drop this port reaches is `$275B06`, twelve instructions above the
  // `$289004` that spawns shard 9, so the two have the SAME deadline.
  // W66 inserted shard 13, THE BOMB, fifth -- behind the explosion and ahead of
  // the item, because its deadline is a DELIBERATE PRESS rather than an event
  // the game reaches by itself, and because at 186 KiB it is the second-largest
  // body in the bundle and must not sit in front of shards the simulation
  // reaches on its own.  `demand()` promotes it on the frame Button 2 is pressed.
  // W81 inserted 14 (the gold mech), 16 (the twin turret) and 15 (the fighter)
  // BETWEEN the spark and shard 1, in that order, because the BOARD's own
  // ladder puts type $10 on screen from lf2,200 and type $88 from lf2,500 --
  // both ahead of shard 1's measured +7.7 s -- and type $82 not until lf3,825.
  // W84 MOVED SHARD 3 AHEAD OF SHARD 1, and THIS ASSERTION IS WHAT CAUGHT IT.
  // Shard 3 is the damage-first family, and the exporter's own note said "[M]
  // first needed lf6426" -- true while the port emitted nothing for that family
  // at all. W80 wired its two machines and [M] its first record now lands at
  // lf2106 from the shipped seed, 1.8 s after boot, against shard 1's +7.7 s.
  // The shard whose deadline moved is not the shard whose code changed, which
  // is exactly why the ORDER-IS-A-CLAIM loop below exists.
  // W98 appended shard 17, THE BOSS, LAST -- and it is the first shard in this
  // bundle whose deadline is measurably LATER than shard 1's rather than
  // earlier. [M] its first record lands at lf8,144 = 137.6 s from the seed,
  // where shard 1 wants art at +7.7 s. It is also the largest body here
  // (367.0 KiB), so it must not sit in front of anything.
  assert.ok(/SPR_ORDER = Object\.freeze\(\[0, 7, 6, 10, 9, 13, 12, 8, 14, 16, 15, 3,\s*1, 2, 4, 5, 11, 17\]\)/.test(s),
    'the bullets (+0.7 s), the shots (the first fire frame), the LASER (the '
    + 'first held frame), the death explosion, THE BOMB, THE ITEM, the impact '
    + 'spark, W81\'s three enemy-art shards and W84\'s shard 3 all come before '
    + 'shard 1 (+7.7 s), and W98\'s boss (137.6 s) comes after everything: '
    + 'index order is NOT need order any more');
  // and the ORDER IS A CLAIM ABOUT DEADLINES, not a literal: whatever the array
  // says, every shard whose first need is earlier than shard 1's must precede
  // it. This is the assertion the literal above cannot make on its own.
  const order = JSON.parse(s.match(/SPR_ORDER = Object\.freeze\((\[[\s\S]*?\])\)/)[1]);
  for (const early of [7, 6, 10, 9, 13, 12, 8, 14, 16, 15, 3]) {
    assert.ok(order.indexOf(early) < order.indexOf(1),
      `shard ${early}'s first need is earlier than shard 1's +7.7 s, so it must `
      + 'be fetched first');
  }
  assert.ok(/\[12, 'items'/.test(s), 'W61: the item is its own shard');
  assert.ok(/\[13, 'bomb'/.test(s), 'W66: the bomb and the laser bomb are a shard');
  assert.ok(/\[10, 'laser'/.test(s) && /\[11, 'structures'/.test(s),
    'W58: the laser and the big mid-screen structures are their own shards');
  assert.ok(/order: SPR_ORDER\.indexOf\(i\)/.test(s),
    'and the order is PUBLISHED in the manifest rather than assumed by the queue');
});

test('ShardQueue.prefetchAll reads the published order, not the index', () => {
  const s = SRC('web/assets.js');
  assert.ok(/this\.meta\[a\]\.order \?\? a\) - \(this\.meta\[b\]\.order \?\? b\)/.test(s),
    'sorted by the published order, falling back to the index for the BG shards');
});

// ============================================ THE PLANAR STREAM TABLE

test('the stream table is PLANAR and DELTA-coded, and an old bundle is REFUSED', () => {
  const e = TOOL('export-web.mjs'), a = SRC('web/assets.js');
  assert.ok(/SPR_STREAMS_FORMAT = 'planes-delta-1'/.test(e));
  assert.ok(/streamsFormat: SPR_STREAMS_FORMAT/.test(e),
    'the format is published, so a stale bundle is a named refusal and not garbage');
  assert.ok(/p === 2\s*\?\s*cur\s*:\s*\(cur - \(i \? sprStreamList\[i - 1\]\[p\] : 0\)\)/.test(e),
    'columns 0 and 1 are first-differenced; column 2 (maskWords) is NOT -- it is '
    + 'small and unordered and differencing makes it bigger');
  assert.ok(/streamsFormat !== 'planes-delta-1'/.test(a)
    && /throw new AssetError/.test(a),
    'the loader refuses any other format BY NAME: a wrong stream table draws the '
    + 'wrong picture and never throws');
  assert.ok(/rom = \(rom \+ flat\[i\]\) >>> 0/.test(a),
    'the accumulator is >>> 0, which is exact for a DECREASING column too');
});

// =========================================== THE SINK IS NOT A NOTE ANY MORE

test('the bullet driver no longer NOTES its own missing emission', () => {
  const s = SRC('bulletdriver.js');
  assert.ok(!/unportedLog\?\.note\(BULLET_DRIVER\.counterWrite/.test(s),
    'the $281DCE note said "this driver passes no sink". It passes one now, and '
    + 'a note that is no longer true is worse than no note at all');
  assert.ok(/ctx\.spriteOut = \{ a4: a4start \}/.test(s),
    '$281D9E lea $809C4C,A4 is a real cursor now');
  // and the note's own counted address is gone from the port's ledger.
  const ram = new Ram(null);
  ram.setU16(0x813176, 0);
  const log = new UnportedLog();
  runBulletDriver({ ram, rom: null, unportedLog: log });
  assert.ok(!log.report().some((l) => l.includes('281DCE') || l.includes('281dce')),
    'a run of the driver must not count $281DCE any more');
});

test('runMover still writes NOTHING to the staging buffers without a sink', () => {
  // The position gate (`tools/w26movergate.mjs`) passes no `spriteOut`, and this
  // is what says its numbers cannot have moved.
  const ram = new Ram(null);
  ram.setU16(0x813176, 0);
  for (let s = 0; s < 5; s++) {
    const b = seedSpriteRec(ram, s);
    ram.setU32(b + REC.continuation, 0x282944);
    ram.setU32(b + 0x0a, 0x1c0ca4);
  }
  runMover({ ram, rom: null, notes: new UnportedLog() });
  for (let k = 0; k < 64; k += 4) {
    assert.equal(ram.u32(MOVER.spriteBuf + k), 0,
      `bucket 23's staging buffer must be untouched at +${k}`);
  }
});
