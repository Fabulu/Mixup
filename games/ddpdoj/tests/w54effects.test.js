// WAVE 54 (E5b) -- POOL B, THE ENEMY DEATH EXPLOSION (`src/effects.js`).
//
// SHAPE OF THESE TESTS.  Every one drives the real routine against the REAL
// exported cartridge windows and asserts on a value THE ROM decides -- a script
// pointer read out of `$221520`, a duration word read out of the script's own
// list, a bucket read out of `$267FA0`, a velocity read out of `$200920`.  None
// writes a constant and reads it back through the same constant;
// `docs/knowledge/03` names that shape and this project has shipped it twice.
//
// Every throw assertion pins `e.romAddress`, never the message text
// (`27-review.md` §1A).  Tests that need the cartridge SKIP LOUDLY when the
// export is absent, and A SKIP IS NOT A PASS.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { BUCKETS } from '../src/spritequeue.js';
import {
  POOL_B, POOL_D, B, EMIT_STUB, REMAP, remapBucket,
  clearEffectPool, clearSubEffectPool, spawnEffect, walkDescriptor288E20,
  runEffectDriver, subSpawn288ED0,
} from '../src/effects.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- run tools/export-tables.py. THIS IS '
    + 'A SKIP, NOT A PASS.';

function ctxOf() {
  const log = new UnportedLog();
  return { ctx: { unportedLog: log, unported: log, tables: MT, rom: ROM }, log };
}
const slot = (n) => POOL_B.base + n * POOL_B.stride;

// ===========================================================================
// 1. THE GEOMETRY.  Three arithmetics that close on a landmark, and the
//    landmarks are not constants this file also chose.
// ===========================================================================

test('pool B: 80 x $38 lands EXACTLY on the bit bucket, and the bit bucket on '
  + 'the count word', () => {
  assert.equal(POOL_B.base + POOL_B.slots * POOL_B.stride, POOL_B.bitBucket,
    '$289078 lea $81C8B2 -- the FAILURE return is the slot ONE PAST THE END');
  assert.equal(POOL_B.bitBucket + POOL_B.stride, POOL_B.count,
    '$288E58 clr.w $81C8EA sits immediately after the bit-bucket slot');
  // $288E0C clears ($8DC+1) words.  That must be the whole pool PLUS the bit
  // bucket PLUS the count word -- if it were only the 80 slots the arithmetic
  // would come up 58 bytes short and the clear would leave a live bit bucket.
  assert.equal(POOL_B.clearWords * 2,
    POOL_B.slots * POOL_B.stride + POOL_B.stride + 2,
    '$288E12 move.w #$8DC,D0 -- 4,538 B = 80 slots + the bit bucket + $81C8EA');
  assert.equal(POOL_D.clearWords * 2, POOL_D.slots * POOL_D.stride + 2,
    '$28908A move.w #$280,D0 -- 1,282 B = pool D\'s 20 x $40 + $81CDEC');
});

test('$288E0C and $289084 clear their WHOLE pool, count word included', () => {
  const ram = new Ram();
  for (let i = 0; i < POOL_B.clearWords; i++) ram.setU16(POOL_B.base + i * 2, 0xbeef);
  for (let i = 0; i < POOL_D.clearWords; i++) ram.setU16(POOL_D.base + i * 2, 0xbeef);
  // one word PAST each pool, which must survive
  ram.setU16(POOL_B.base + POOL_B.clearWords * 2, 0xcafe);
  clearEffectPool(ram);
  assert.equal(ram.u16(POOL_B.base), 0);
  assert.equal(ram.u16(POOL_B.bitBucket), 0, 'the BIT BUCKET is cleared too');
  assert.equal(ram.u16(POOL_B.count), 0, 'and so is $81C8EA');
  assert.equal(ram.u16(POOL_B.base + POOL_B.clearWords * 2), 0xcafe,
    'and NOTHING past it -- the dbra runs $8DD times, not $8DE');
  clearSubEffectPool(ram);
  assert.equal(ram.u16(POOL_D.base), 0);
  assert.equal(ram.u16(POOL_D.count), 0, '$81CDEC is inside $289084\'s range');
});

// ===========================================================================
// 2. `$289004` -- THE ALLOCATOR, AND ITS INVISIBLE FAILURE
// ===========================================================================

test('$289004 initialises ELEVEN fields and NOT the position', () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  // the slot carries a previous tenant's bytes; the allocator must clear the
  // ones it names and LEAVE the position, which every caller writes itself.
  for (let o = 2; o < POOL_B.stride; o += 2) ram.setU16(slot(0) + o, 0x7777);
  const a0 = spawnEffect(ram, ctx, 0x07);
  assert.equal(a0, slot(0), 'the FIRST free slot, scanned from $81B732');
  assert.equal(ram.u16(a0 + B.status), 0x8007, '$28902E ori.w #$8000,D0');
  assert.equal(ram.u16(a0 + B.hook), 0, '$289036 ($10,A0)');
  assert.equal(ram.u16(a0 + B.sub12), 0xffff,
    '$28903A ($12,A0) = $FFFF -- the sub-spawn is OFF unless a caller arms it');
  assert.equal(ram.u8(a0 + B.f16), 0x1e, '$289040 move.b #$1E,($16,A0)');
  assert.equal(ram.u16(a0 + B.delay), 0, '$289046 ($18,A0)');
  assert.equal(ram.u16(a0 + B.speed), 0, '$28904A ($1a,A0) -- a WORD, so BOTH '
    + 'the speed byte and the angle byte');
  assert.equal(ram.u8(a0 + B.f1c), 0, '$28904E move.b D0,($1c,A0)');
  assert.equal(ram.u8(a0 + B.f1d), 0x1e, '$289052 move.b #$1E,($1d,A0)');
  assert.equal(ram.u16(a0 + B.bucket), 0, '$289058 ($1e,A0)');
  assert.equal(ram.u32(a0 + B.fricDelta), 0, '$28905E ($22,A0)');
  assert.equal(ram.u32(a0 + B.nudge), 0, '$289062 ($26,A0)');
  assert.equal(ram.u32(a0 + B.vel), 0, '$289066 ($34,A0)');
  assert.equal(ram.u16(a0 + B.pos), 0x7777,
    'and the POSITION is UNTOUCHED -- $289004 never writes it, the caller does');
});

test('a FULL POOL returns the BIT BUCKET and is a COUNTED event, not a throw '
  + 'and not a silent discard', () => {
  const ram = new Ram();
  const { ctx, log } = ctxOf();
  for (let n = 0; n < POOL_B.slots; n++) ram.setU16(slot(n) + B.status, 0x8001);
  const a0 = spawnEffect(ram, ctx, 0x07, 0x268852);
  assert.equal(a0, POOL_B.bitBucket,
    '$289078 lea $81C8B2 -- the caller CANNOT TELL, there is no carry');
  const n = log.report().join('\n');
  assert.match(n, /\$289078/, 'W33 4: a failure nobody counts is a leak');
  assert.match(n, /\$268852/, 'and the CALL SITE is named');
});

test('$289016 range-checks the kind against the 34 script entries, and the '
  + 'kind bit 7 is NOT part of that range', () => {
  const ram = new Ram();
  const { ctx, log } = ctxOf();
  // $85 -> $85 & $7F = 5, inside 0..$21 -> a REAL slot.
  assert.equal(spawnEffect(ram, ctx, 0x85), slot(0), 'kind $85 is entry [1][5]');
  assert.equal(ram.u16(slot(0) + B.status), 0x8085,
    'and the FULL kind survives into the status word -- bit 7 picks $221630');
  // $22 -> outside, and $A2 -> the same index one table along, also outside.
  for (const bad of [0x22, 0x7f, 0xa2]) {
    const a = spawnEffect(ram, ctx, bad, 0x26b1e4);
    assert.equal(a, POOL_B.bitBucket, `kind $${bad.toString(16)} is out of range`);
  }
  assert.match(log.report().join('\n'), /\$289078/,
    'and each one is COUNTED with its kind');
});

test('$28900E `cmpi.w #$0,D1 / blt` CANNOT be taken, and the port says so by '
  + 'address rather than pretending it is live', () => {
  // The branch is transcribed because it is an instruction; it is unreachable
  // because $28900A masks D1 with $7F one instruction earlier.  There is no
  // input that reaches it, which is the claim -- so the test is that every
  // byte value takes the OTHER arm.
  const ram = new Ram();
  const { ctx } = ctxOf();
  for (let k = 0; k < 256; k++) {
    ram.setU16(slot(0) + B.status, 0);
    const a = spawnEffect(ram, ctx, k);
    const inRange = (k & 0x7f) <= POOL_B.kindMax;
    assert.equal(a === slot(0), inRange,
      `kind $${k.toString(16)}: (k & $7F) = ${k & 0x7f}`);
  }
});

// ===========================================================================
// 3. `$288E20` -- THE DESCRIPTOR WALKER AND ITS TWO ESCAPES
// ===========================================================================

test('$288E20 stops on a POSITIVE longword and consumes both 8-byte escapes',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const a6 = slot(0);
  // [M] kind 0's list at $221740 opens with the $FFFF SIZE escape --
  // `FFFF 0618 FA00 FD00` -- and the stream address follows it.  Every value
  // asserted below is read out of the CARTRIDGE by this test, not written by it.
  ram.setU32(a6 + B.descCursor, 0x221740);
  ram.setU32(a6 + B.pos, 0x00100010);
  assert.equal(ROM.u16(0x221740), 0xffff, 'the escape tag, from the cartridge');
  const wantSize = ROM.u16(0x221742), wantOffs = ROM.u32(0x221744);
  walkDescriptor288E20(ram, ROM, a6);
  assert.equal(ram.u16(a6 + B.size), wantSize,
    '$288E34 move.w (A1)+,($e,A6) -- the width/height escape');
  assert.equal(ram.u32(a6 + B.offs), wantOffs,
    '$288E38 move.l (A1)+,($6,A6) -- the two sprite OFFSET words');
  assert.equal(ram.u32(a6 + B.descCursor), 0x221748,
    'and the cursor stops ON the stream address, having stepped EIGHT bytes');
  assert.equal(ram.u32(a6 + B.pos) >>> 0, 0x00100010,
    'a SIZE escape does NOT move the position');
  assert.ok((ROM.u32(0x221748) & 0x80000000) === 0,
    'and what it stopped on is a positive longword -- a stream address');
});

test('$288E3E, the NUDGE escape, adds a LONG to the position -- a 32-bit add, '
  + 'so a carry out of the short axis REACHES the long axis', () => {
  const ram = new Ram();
  const a6 = slot(0);
  // A hand-built list, because [M] no entry of the 68 opens with this arm -- it
  // is transcribed-and-unexercised in the corpus and must still be right.
  const rom = new RomWindows({ windows: [{ base: '$300000', len: 16,
    why: 'test', hex: '8000000000018000' + '0000000000000000' }] });
  ram.setU32(a6 + B.descCursor, 0x300000);
  ram.setU32(a6 + B.pos, 0x0000ffff);
  walkDescriptor288E20(ram, rom, a6);
  assert.equal(ram.u32(a6 + B.pos) >>> 0, 0x00018000 + 0x0000ffff,
    '$288E42 add.l D1,($2,A6) -- ADD.L, and $FFFF + $8000 carries into +$02');
  assert.equal(ram.u32(a6 + B.descCursor), 0x300008,
    'and the nudge escape is EIGHT bytes too, not six');
});

test('$288E2C compares the escape tag as a WORD -- $FF00 is a NUDGE, not a '
  + 'SIZE, and a byte test cannot tell them apart', () => {
  const ram = new Ram();
  const a6 = slot(0);
  // A tag whose HIGH BYTE is $FF and whose word is not $FFFF.  `cmpi.w
  // #$FFFF,D0 / bne $288E3E` takes the NUDGE arm; a port that tested only the
  // high byte would load ($e,A6) and ($6,A6) out of the position delta.
  const rom = new RomWindows({ windows: [{ base: '$300000', len: 16,
    why: 'test', hex: 'ff00000000010002' + '0000000000000000' }] });
  ram.setU32(a6 + B.descCursor, 0x300000);
  ram.setU32(a6 + B.pos, 0);
  ram.setU16(a6 + B.size, 0x1234);
  walkDescriptor288E20(ram, rom, a6);
  assert.equal(ram.u32(a6 + B.pos) >>> 0, 0x00010002, 'the NUDGE arm ran');
  assert.equal(ram.u16(a6 + B.size), 0x1234,
    'and ($e,A6) is UNTOUCHED -- the SIZE arm did not run');
});

// ===========================================================================
// 4. `$288E4E` -- THE DRIVER
// ===========================================================================

/** One live record, positioned on screen, with a kind and a bucket. */
function live(ram, n, { kind = 0x07, bucket = 0, pos = 0x02000200, ...rest } = {}) {
  const a6 = slot(n);
  ram.setU16(a6 + B.status, 0x8000 | kind);
  ram.setU32(a6 + B.pos, pos >>> 0);
  ram.setU16(a6 + B.bucket, bucket);
  for (const [k, v] of Object.entries(rest)) {
    if (k === 'vel' || k === 'nudge' || k === 'fricDelta') ram.setU32(a6 + B[k], v >>> 0);
    else ram.setU16(a6 + B[k], v);
  }
  return a6;
}

test('$288E7A `bset #6,(A6)` is a BYTE op on the HIGH byte -- the started flag '
  + 'is $4000, not $0040, and reading it as a word puts it inside the KIND',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  const a6 = live(ram, 0, { kind: 0x00 });
  runEffectDriver(ram, ROM, ctx);
  assert.equal(ram.u16(a6 + B.status) & 0xff00, 0xc000,
    '$8000 -> $C000: bit 6 of the HIGH byte');
  assert.equal(ram.u16(a6 + B.status) & 0xff, 0x00,
    'and the KIND is untouched -- $288E84 `andi.w #$FF,D1` reads it back');
  // and the script is loaded ONCE: the cursors must not be re-seeded next frame
  const c1 = ram.u32(a6 + B.durCursor);
  runEffectDriver(ram, ROM, ctx);
  assert.notEqual(ram.u32(a6 + B.durCursor), 0,
    'the cursor is live');
  assert.ok(ram.u32(a6 + B.durCursor) >= c1,
    'and it only ever moves FORWARD -- a re-seed would reset it to $221778+2');
});

test('the FIRST cell counter is the duration word PLUS ONE, and every later one '
  + 'is not', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  const a6 = live(ram, 0, { kind: 0x00 });
  const durList = ROM.u32(POOL_B.tableA + 4);       // entry [0][0]'s duration list
  runEffectDriver(ram, ROM, ctx);
  // $288EA2 move.w (A2)+,($32,A6) / $288EA6 addq.w #1 -- then the SAME frame's
  // $288F86 subq.w #1 takes it straight back down.
  assert.equal(ram.u16(a6 + B.cell), ROM.u16(durList),
    '$288EA6 addq.w #1 and $288F86 subq.w #1 cancel on the first frame');
  assert.equal(ram.u32(a6 + B.durCursor), durList + 2,
    'and the cursor sits on the SECOND duration word');
});

test('the SPAWN DELAY skips the record entirely AND is excluded from $81C8EA',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  const a6 = live(ram, 0, { kind: 0x00, delay: 3 });
  const t = runEffectDriver(ram, ROM, ctx);
  assert.equal(ram.u16(a6 + B.delay), 2, '$288E6C subq.w #1,($18,A6)');
  assert.equal(ram.u16(a6 + B.status) & 0xff00, 0x8000,
    'and the script has NOT been started -- $288E7A is below the skip');
  assert.equal(ram.u16(POOL_B.count), 0,
    '$288E74 addq.w #1 sits BELOW $288E64\'s skip, so a delayed record is NOT '
    + 'in the count word even though it holds a slot');
  assert.equal(t.delayed, 1);
  assert.equal(t.live, 0);
  assert.equal(t.emitted, 0, 'and it emits nothing');
});

test('$288F94 the script TERMINATOR frees the slot -- a script that runs out '
  + 'is the pool\'s own drain', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  const a6 = live(ram, 0, { kind: 0x00 });
  // run until the record frees itself, and require it to actually happen
  let n = 0;
  while (ram.u16(a6 + B.status) !== 0 && n < 600) { runEffectDriver(ram, ROM, ctx); n++; }
  assert.ok(n < 600, 'the record freed itself');
  assert.equal(ram.u16(a6 + B.status), 0, '$288F9C clr.w (A6)');
  // and the length is the SCRIPT's, read out of the cartridge rather than
  // written here: the sum of its duration words, plus the +1 on the first.
  const durList = ROM.u32(POOL_B.tableA + 4);
  let sum = 1, i = 0;
  for (; ROM.u16(durList + i * 2) !== 0xffff; i++) sum += ROM.u16(durList + i * 2) + 1;
  assert.equal(n, sum, `the script's own ${i} duration words say ${sum} frames`);
});

test('$288F68 THE OFF-SCREEN CULL frees on EITHER axis, and only the SECOND '
  + '`addi.w` of each pair is branched on', { skip: SKIP }, () => {
  const cull = (pos) => {
    const ram = new Ram();
    const { ctx } = ctxOf();
    const a6 = live(ram, 0, { kind: 0x00, pos });
    runEffectDriver(ram, ROM, ctx);
    return ram.u16(a6 + B.status) === 0;
  };
  // the SHORT axis (the low word): survives (v + $1000) & $FFFF < $5800
  assert.equal(cull(0x02000000), false, 'short axis 0 is on screen');
  assert.equal(cull(0x020047ff), false, 'short axis $47FF is the last that lives');
  assert.equal(cull(0x02004800), true, 'short axis $4800 is culled');
  assert.equal(cull(0x0200f000), false, 'and $F000 (= -$1000) lives -- the '
    + 'window WRAPS, which is what the two adds are for');
  assert.equal(cull(0x0200efff), true, '$EFFF (= -$1001) does not');
  // the LONG axis (the high word, after the swap): < $9000 of (v + $1000)
  assert.equal(cull(0x7fff0000), false, 'long axis $7FFF lives');
  assert.equal(cull(0x80000000), true, 'long axis $8000 is culled');
  assert.equal(cull(0xf0000000), false, 'and $F000 lives, the same wrap');
});

test('$288F5A position += velocity is TWO word adds around a `swap`, so a carry '
  + 'out of the SHORT axis never reaches the LONG one', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  // short axis $0020 + $FFF0 wraps to $0010.  An `add.l` would carry the 1 into
  // +$02 and move the record a whole unit up the long axis, every frame.
  const a6 = live(ram, 0, { kind: 0x00, pos: 0x02000020, vel: 0x0000fff0 });
  runEffectDriver(ram, ROM, ctx);
  assert.equal(ram.u16(a6 + B.pos + 2), 0x0010, 'the short axis WRAPPED');
  assert.equal(ram.u16(a6 + B.pos), 0x0200,
    '$288F5E add.w / $288F62 swap / $288F64 add.w -- the long axis is UNMOVED');
});

test('$288F18 hands $241D34 D0 = THE SPEED INDEX and D1 = THE ANGLE, not the '
  + 'other way round, and CLEARS the speed byte so it is a one-shot',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  // $05C0 -- one of type $88's own death-arm literals ($27633A) -- is speed 5,
  // angle $C0.  Read the answer out of the SAME table $241D34 reads.
  const a6 = live(ram, 0, { kind: 0x00, speed: 0x05c0 });
  const want = MT.shotVector(0x05, 0xc0);
  runEffectDriver(ram, ROM, ctx);
  assert.equal(ram.u16(a6 + B.vel), want.dy & 0xffff,
    '$288F2E move.w D2,($34,A6) -- and D2 is $241D34\'s LONG axis');
  assert.equal(ram.u16(a6 + B.vel + 2), want.dx & 0xffff, '$288F32 move.w D3');
  assert.equal(ram.u8(a6 + B.speed), 0, '$288F36 clr.b ($1a,A6) -- ONE SHOT');
  assert.equal(ram.u8(a6 + B.angle), 0xc0, 'and the angle byte SURVIVES');
  // the two are not interchangeable: reading them the other way round would
  // give shotVector($C0, $05), a different vector.
  assert.notDeepEqual(MT.shotVector(0x05, 0xc0), MT.shotVector(0xc0 & 0x7f, 0x05),
    'the two orders give different vectors, so this test can see the swap');
});

test('$288F3A FRICTION reloads its countdown and subtracts the delta from the '
  + 'velocity, high word from high word', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  // the LOW halves borrow ($0010 - $0020) and the HIGH ones do not, which is
  // the ONLY input shape that separates two `sub.w`s from one `sub.l`.
  const a6 = live(ram, 0, { kind: 0x00, vel: 0x01000010, fricDelta: 0x00100020 });
  ram.setU8(a6 + B.fricCtr, 1); ram.setU8(a6 + B.fricReload, 4);
  runEffectDriver(ram, ROM, ctx);
  assert.equal(ram.u8(a6 + B.fricCtr), 0, 'frame 1: `subq.b #1` does not borrow');
  assert.equal(ram.u32(a6 + B.vel) >>> 0, 0x01000010, 'so nothing is subtracted');
  runEffectDriver(ram, ROM, ctx);
  assert.equal(ram.u8(a6 + B.fricCtr), 4, '$288F4A reloads from ($21,A6)');
  assert.equal(ram.u32(a6 + B.vel) >>> 0, 0x00f0fff0,
    '$288F50/$288F56 -- TWO word subtractions, so no borrow crosses the halves. '
    + 'One `sub.l` would give $00EFFFF0 and move the record on the long axis');
});

test('$288FBC THE LASER INTERLOCK halves the emit rate while the beam record is '
  + 'NEGATIVE, and the record still MOVES on the skipped frames',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  const a6 = live(ram, 0, { kind: 0x00, vel: 0x00100010 });
  ram.setU16(POOL_B.laserRec, 0x8000);            // the beam is ON
  const emits = [];
  for (let f = 0; f < 4; f++) {
    ram.setU16(POOL_B.frameParity, f);            // $80390A
    const before = ram.u32(a6 + B.pos);
    emits.push(runEffectDriver(ram, ROM, ctx).emitted);
    assert.notEqual(ram.u32(a6 + B.pos), before,
      `frame ${f}: the record MOVES whether or not it is emitted`);
  }
  assert.deepEqual(emits, [0, 1, 0, 1],
    '$288FC8 `move.w $80390A,D0 / andi.w #$1 / beq` -- ODD frames only');
  ram.setU16(POOL_B.laserRec, 0x0001);            // the beam is OFF
  ram.setU16(POOL_B.frameParity, 0);
  assert.equal(runEffectDriver(ram, ROM, ctx).emitted, 1,
    'and with $811F72 POSITIVE the parity does not matter');
});

test('$288FF0 is FIVE entries and a selector outside 0/4/8/$C/$10 is a LOUD '
  + 'NAMED THROW -- the longword at $289004 is that routine\'s own movem.l',
  { skip: SKIP }, () => {
  assert.deepEqual(Object.keys(EMIT_STUB).map(Number), [0, 4, 8, 0xc, 0x10]);
  const ram = new Ram();
  const { ctx } = ctxOf();
  live(ram, 0, { kind: 0x00, bucket: 0x14 });
  assert.throws(() => runEffectDriver(ram, ROM, ctx),
    (e) => e.name === 'Unreached' && e.romAddress === POOL_B.emitTable);
});

test('the five entries reach buckets 0, 1, 2, 3 and 7, and a record lands in '
  + 'the bucket its ($1e,A6) names', { skip: SKIP }, () => {
  const want = { 0x0: 0, 0x4: 1, 0x8: 2, 0xc: 3, 0x10: 7 };
  for (const [sel, bucket] of Object.entries(want)) {
    const ram = new Ram();
    const { ctx } = ctxOf();
    live(ram, 0, { kind: 0x00, bucket: Number(sel) });
    const t = runEffectDriver(ram, ROM, ctx);
    assert.equal(t.emitted, 1);
    assert.equal(ram.u16(BUCKETS[bucket].counter), 12,
      `selector $${Number(sel).toString(16)} -> bucket ${bucket}, ONE 12-byte record`);
  }
});

test('THE COUNT WORD IS REBUILT FROM ZERO EVERY FRAME and the frees do NOT '
  + 'decrement it -- the census identity is scan == count - freed + delayed',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  live(ram, 0, { kind: 0x00 });                       // ordinary
  live(ram, 1, { kind: 0x00, delay: 5 });             // delayed
  live(ram, 2, { kind: 0x00, pos: 0x02005000 });      // culled this frame
  ram.setU16(POOL_B.count, 0x1234);                   // a stale value
  const t = runEffectDriver(ram, ROM, ctx);
  assert.equal(t.freed, 1, 'the off-screen one');
  assert.equal(t.delayed, 1);
  assert.equal(ram.u16(POOL_B.count), t.live);
  assert.equal(ram.u16(POOL_B.count), 2,
    '$288E58 clr.w then two `addq.w #1` -- the STALE $1234 is gone, and the '
    + 'record freed later in the same pass is still IN the count');
  let scan = 0;
  for (let n = 0; n < POOL_B.slots; n++) if (ram.u16(slot(n) + B.status)) scan++;
  assert.equal(scan, ram.u16(POOL_B.count) - t.freed + t.delayed,
    'the census identity, from two independent instruments');
});

test('the driver walks ALL EIGHTY SLOTS every frame -- a free slot costs a '
  + 'dbra here, unlike pool E\'s driver', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  live(ram, POOL_B.slots - 1, { kind: 0x00 });   // the LAST slot only
  const t = runEffectDriver(ram, ROM, ctx);
  assert.equal(t.live, 1, 'the 80th slot is reached with 79 free ones ahead');
  assert.equal(t.emitted, 1);
});

// ===========================================================================
// 5. THE SUB-SPAWN -- pool D receives the requested secondary debris
// ===========================================================================

test('$288ED0 the SUB-SPAWN allocates the requested records, the one-shot still '
  + 'fires, and ($16,A6) still reaches ($1d,A6)',
  () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  const a6 = slot(0);
  ram.setU16(a6 + B.sub12, 0x0001);      // TWO records asked for
  ram.setU16(a6 + B.sub14, 0x0400);
  ram.setU16(a6 + B.bucket, 0x10);
  ram.setU8(a6 + B.f16, 0x2a);
  assert.equal(subSpawn288ED0(ram, ctx, a6), true);
  assert.equal(ram.u8(a6 + B.f1d), 0x2a, '$288EEA move.b ($16,A6),($1d,A6)');
  assert.equal(ram.u16(a6 + B.sub12), 0xffff, '$288EFA -- the ONE-SHOT');
  let liveD = 0;
  for (let i = 0; i < POOL_D.slots; i++) {
    if (ram.u16(POOL_D.base + i * POOL_D.stride) !== 0) liveD++;
  }
  assert.equal(liveD, 2, 'the COUNT-MINUS-ONE input 1 allocates TWO records');
  assert.equal(ram.u16(POOL_D.count), 2, 'pool D count tracks both records');
  // second call: $FFFF now, so nothing happens at all
  assert.equal(subSpawn288ED0(ram, ctx, a6), false, '$288ED4 bmi $288F00');
});

test('a record whose ($12,A6) is still $289004\'s $FFFF never reaches $288EF0',
  () => {
  const ram = new Ram();
  const { ctx, log } = ctxOf();
  const a0 = spawnEffect(ram, ctx, 0x07);
  assert.equal(subSpawn288ED0(ram, ctx, a0), false);
  assert.doesNotMatch(log.report().join('\n'), /\$289098/,
    'a BARE allocation does not sub-spawn -- $50-recon 4.2\'s own point');
});

// ===========================================================================
// 6. THE REMAP ROWS, and the range check the ROM does not have
// ===========================================================================

test('$267FA0 is THREE 6-word rows and $278320 is TWO, and an index past a '
  + 'row is a LOUD NAMED THROW', { skip: SKIP }, () => {
  // The VALUES come from the cartridge; this test asserts the SHAPE.
  const row = (base) => [0, 2, 4, 6, 8, 10].map((o) => ROM.u16(base + o));
  assert.deepEqual(row(REMAP.death267FA0), [0, 0, 4, 8, 0xc, 0x10],
    '$267FA0, the DEATH row');
  assert.deepEqual(row(REMAP.hit267FAC), [4, 4, 8, 0xc, 0x10, 0x10],
    '$267FAC, the HIT row -- it never maps to bucket 0');
  assert.deepEqual(row(REMAP.secondary267FB8), row(REMAP.death267FA0),
    '$267FB8, $289AF4\'s row, is the death row again');
  assert.deepEqual(row(REMAP.shared278320), row(REMAP.death267FA0));
  assert.deepEqual(row(REMAP.shared278320 + 12), row(REMAP.hit267FAC));
  // every value a row can yield is a legal $288FF0 selector, which is what
  // makes the emit safe when the index is
  for (const base of [REMAP.death267FA0, REMAP.hit267FAC, REMAP.shared278320]) {
    for (const v of row(base)) assert.ok(v in EMIT_STUB, `$${v.toString(16)}`);
  }
  for (const bad of [12, 14, 0xff, -2, 3]) {
    assert.throws(() => remapBucket(ROM, REMAP.death267FA0, bad, 0x268852),
      (e) => e.name === 'Unreached' && e.romAddress === 0x268852,
      `byte offset ${bad} is outside the 12-byte row`);
  }
});

// ===========================================================================
// 7. THE ARM THE PORT'S OWN COMMENT HAD WRONG
// ===========================================================================

test('type $10\'s death arm passes kind $4, NOT $7 -- $2681D6 is `moveq #$4,D0`',
  { skip: SKIP }, () => {
  // Read it out of the IMAGE if it is here, so this is the cartridge's claim
  // and not mine.  (The image is gitignored; without it the shape is still
  // pinned by src/handlers.js's own call, tested through the handler above.)
  const IMG = path.join(HERE, '..', 'tools', 'oracle', 'out', 'maincpu.bin');
  if (!fs.existsSync(IMG)) {
    assert.fail('tools/oracle/out/maincpu.bin missing -- run tools/oracle/derive.py. '
      + 'THIS IS A FAILURE, NOT A SKIP: the claim is about the cartridge.');
  }
  const fd = fs.openSync(IMG, 'r');
  const b = Buffer.alloc(8);
  fs.readSync(fd, b, 0, 8, 0x2681d6);
  fs.closeSync(fd);
  assert.equal(b.readUInt16BE(0), 0x7004,
    '$2681D6 moveq #$4,D0 -- type $10\'s DEATH effect is kind $4');
  assert.equal(b.readUInt16BE(6), 0x4eb9, 'and $2681DC is the jsr');
  // ...against type $11's, which really is $7
  const fd2 = fs.openSync(IMG, 'r');
  const c = Buffer.alloc(2);
  fs.readSync(fd2, c, 0, 2, 0x26884c);
  fs.closeSync(fd2);
  assert.equal(c.readUInt16BE(0), 0x7007, '$26884C moveq #$7,D0 -- type $11\'s');
  // AND THE PORT PASSES THE CARTRIDGE'S OWN VALUE, read here, not written here.
  // The port's comment said $7 for BOTH from W25b until W54, so this assertion
  // is the one that would have caught it.
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'handlers.js'), 'utf8');
  const resources = fs.readFileSync(path.join(HERE, '..', 'src', 'world-resources.js'), 'utf8');
  const kind10 = (b.readUInt16BE(0) & 0xff).toString(16).padStart(2, '0');
  const kind11 = (c.readUInt16BE(0) & 0xff).toString(16).padStart(2, '0');
  assert.ok(src.includes(`effectArmNine(ram, rom, ctx, a6, 0x${kind10}, descriptor.remaps.death,\n`
    + '    descriptor.effectSites.death, descriptor.effects)'),
    `$2681DC's descriptor-backed call must pass 0x${kind10}, the kind the cartridge holds`);
  assert.ok(resources.includes('effectSites: { firstZero: 0x2682c0, death: 0x2681dc }'),
    'Black type $10 must bind the descriptor-backed death call to native $2681DC');
  assert.ok(src.includes(`effectArmNine(ram, rom, ctx, a6, 0x${kind11}, `
    + 'descriptor.remaps.death,\n    descriptor.handler - 0x7a, descriptor.effects)'),
    `$268852's edition-aware call must pass 0x${kind11}`);
  assert.notEqual(kind10, kind11,
    'and the two are DIFFERENT, so this test can see them being confused');
});

// ===========================================================================
// 8. THE EXPORTER'S OWN CLAIMS.  A unit test can only read the SOURCE; the
//    cartridge-side halves are red-validated in 54-impl-E5b-explosions.md §4.2.
// ===========================================================================

const SRC = (f) => fs.readFileSync(path.join(HERE, '..', 'src', f), 'utf8');
const TOOL = (f) => fs.readFileSync(path.join(HERE, '..', 'tools', f), 'utf8');

test('the effect art is harvested by WALKING ALL 68 SCRIPT ENTRIES, not by the '
  + 'kinds a run reaches', () => {
  const s = TOOL('export-web.mjs');
  assert.ok(/EFFECT_ENTRIES = 34/.test(s) && /EFFECT_TABLES = \[0x221520, 0x221630\]/.test(s),
    'both tables, 34 entries each -- $289004\'s own `cmpi.w #$21,D1 / bgt`');
  assert.ok(/EFFECT_DATA_END = 0x222618/.test(s),
    'and the data\'s far end is a CLAIM the walk must land on exactly');
  assert.ok(/scripts\.size !== 23 \|\| seen\.size !== 269/.test(s),
    '23 scripts over 269 streams, asserted against the cartridge on every export');
  assert.ok(/hi !== EFFECT_DATA_END \|\| entries !== 2 \* EFFECT_ENTRIES/.test(s),
    'a walk that stopped short would ship a SUBSET and never say so');
  assert.ok(/\[9, 'explode'/.test(s), 'shard 9 exists and is named by what it holds');
  assert.ok(!/SPR_BOOT = \[0, 9\]/.test(s) && /SPR_BOOT = \[0\]/.test(s),
    'and it is DEFERRED -- shard 0 stays the only boot shard, so capture.bin '
    + 'and bundlegate\'s 100.0000 % cannot move');
});

test('the $221520 ROM window is 4,344 bytes and its extent is asserted against '
  + 'the cartridge on every export', () => {
  const s = TOOL('export-tables.py');
  assert.ok(/\(0x221520, 0x10F8,/.test(s), '$221520..$222617 = 4,344 B');
  assert.ok(/\(0x267FA0, 0x0024,/.test(s) && /\(0x278320, 0x0018,/.test(s),
    'and the two remap tables, 36 B and 24 B');
  assert.ok(/check_pool_b_extents\(d\)/.test(s), 'called from build()');
  assert.ok(s.includes('d[0x267FC4:0x267FC6] != b"\\x4e\\x75"'),
    '$267FA0\'s three rows are pinned from BELOW by `4E75`, which is code');
  assert.ok(/walk_effect_script/.test(s),
    'and the window\'s far end is re-derived by walking the scripts, not stated');
});

test('TYPE5_PORTED gained the pool B and pool D drivers', () => {
  const s = SRC('type5.js');
  assert.ok(/0x288e4e,\s+\/\/ #5/.test(s), 'pool B\'s driver RUNS');
  assert.ok(/0x2890f2,\s+\/\/ #6/.test(s), 'pool D\'s driver RUNS');
  assert.ok(/effectDriver: 0x288e4e/.test(s));
  assert.ok(/subEffectDriver: 0x2890f2/.test(s));
});

test('$288EF0 calls $289098 and the allocator is present in the source', () => {
  const s = SRC('effects.js');
  assert.ok(/spawnSubEffect289098\(ram, ctx\.rom, ctx, packed/.test(s),
    '$288EF0 dispatches to the pool-D allocator');
  assert.ok(/runSubEffectDriver/.test(s), '$2890F2 has a driver');
  assert.ok(/allocator: 0x289098/.test(s));
});
