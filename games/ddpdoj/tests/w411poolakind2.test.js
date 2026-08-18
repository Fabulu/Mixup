// W411 -- DOCKET D49. Pool-A kind index 2 (the gold disc the owner calls the medal),
// the collect arm kind 0/4 has had all along and never ran, and the ten enemy death
// arms that were `ctx.unported.note()` inside fully ported handlers.
//
// WHAT THIS FILE IS FOR. D44 ("only mid-bosses leave stars") and D45 ("nothing leaves
// medals") were ONE gate: `bee.js runBody` dispatched four of twenty pool-A bodies, so
// wiring the ten sites would have turned 32 silent notes into 32 named throws. Every
// assertion below therefore reads the RECORD back -- kind, position, sprite, counter --
// rather than counting a call, because W408/W409's ablations found that counting a
// value nothing reads back is exactly how a mutation survives.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, i16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0, runPoolADriver, POOL_A, DISPATCH,
  LAYER_EMITTERS } from '../src/bee.js';
import { BUCKETS } from '../src/spritequeue.js';
import { handlerMap } from '../src/handlers.js';
import { runInitBodyAddr } from '../src/initbody.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';
const u16img = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32img = (a) => (u16img(a) * 0x10000) + u16img(a + 2);

const CARRIER = 0x814600;
const BOSSFLAGS = 0x8130f8, FREEZE = 0x8130d2;
const SCROLL_LONG = 0x80b03c, SCROLL_SHORT = 0x813176, SCROLL_BOUND = 0x813172;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + 0x02, 0x30001c00);          // long axis $3000, short axis $1C00
  const sounds = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    notes: log, soundPost: (a) => sounds.push(a) };
  return { ram, log, ctx, sounds };
}
/** One live kind-2 record, allocated the way type $8B's death allocates it. */
function medal(f, layer = 0) {
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x08, 0, layer, CARRIER);
  assert.ok(slot !== null, 'the allocator delivered a slot');
  return slot;
}
const drive = (f) => runPoolADriver(f.ram, ROM, f.ctx);

// ==================== 1. THE DISPATCH ENTRY, OUT OF THE CARTRIDGE

test('W411 dispatch index 2 IS $27FE0E, read from the image', { skip: SKIP_IMG }, () => {
  // `$27F99E` is twenty stride-4 longs and the port carries them as an array; index 2
  // is the one this wave ports, so it is the one worth re-reading rather than trusting.
  assert.equal(u32img(0x27f99e + 2 * 4), 0x0027fe0e);
  assert.equal(DISPATCH[2], 0x27fe0e);
  // ...and index 0 and 4 really are the same address, which is why kind 4 needed no body.
  assert.equal(u32img(0x27f99e + 0 * 4), u32img(0x27f99e + 4 * 4));
});

test('W411 $27FE0E and $27F9EE are the same twenty instructions', { skip: SKIP_IMG }, () => {
  // The claim that kind 2's collect arm is "the star's on a different counter" is only
  // worth anything if the bytes say so. $27FE1C..$27FE5D against $27F9EE..$27FA2F: the
  // two `lea` operands differ ($817F84/$817F88 against $817F86/$817F8A) and the two
  // `bra.w` displacements differ (they start from different addresses and land on the
  // same $280FDC). EVERYTHING ELSE is byte-identical.
  const A = 0x27fe1c, Bb = 0x27f9ee, N = 0x42;
  const diff = [];
  for (let i = 0; i < N; i++) if (IMG[A + i] !== IMG[Bb + i]) diff.push(i);
  assert.deepEqual(diff, [0x07, 0x13, 0x40, 0x41],
    'only the two lea low bytes and the bra.w displacement differ');
  assert.equal(u32img(0x27fe1e + 2), 0x00817f84, 'kind 2 P1');
  assert.equal(u32img(0x27fe2a + 2), 0x00817f88, 'kind 2 P2');
  assert.equal(u32img(0x27f9f0 + 2), 0x00817f86, 'the star P1');
  assert.equal(u32img(0x27f9fc + 2), 0x00817f8a, 'the star P2');
  // and both land on $280FDC: bra.w's target is the EXTENSION WORD's address plus disp.
  assert.equal(0x27fe5c + u16img(0x27fe5c), 0x280fdc);
  assert.equal(0x27fa2e + u16img(0x27fa2e), 0x280fdc);
});

test('W411 $27FA34 is a BACKWARD bne to $27F9EE, not a fall-through', { skip: SKIP_IMG }, () => {
  // W265 read this as "bits 11 or 12 set and it does NOTHING at all" and shipped a test
  // that pinned it, so a star the player touched scored nothing for eight waves.
  assert.equal(IMG[0x27fa34], 0x66, 'bne');
  const disp = (IMG[0x27fa35] << 24) >> 24;         // the byte displacement, SIGNED
  assert.equal(disp, -0x48);
  assert.equal(0x27fa36 + disp, 0x27f9ee);
});

// ==================== 2. $280F34, THE COLLECTED TRANSFORM'S TABLE

test('W411 the $280F34 window is three selectors, three descriptors, three '
  + 'sprite tables, ending at code', { skip: SKIP_IMG }, () => {
  // `$280FE0 lea (-$AE,PC),A0` -- the extension word is at $280FE2, so the target is
  // $280FE2 - $AE = $280F34. That arithmetic is the whole bound on the near end.
  assert.equal(0x280fe2 + ((u16img(0x280fe2) << 16) >> 16), 0x280f34);
  // three pointers, and the third's own target is where they stop
  assert.deepEqual([0, 4, 8].map((i) => u32img(0x280f34 + i)),
    [0x00280f40, 0x00280f4c, 0x00280f58]);
  // three 12-byte descriptors {sprite-table base, offset pair, size, STEP}
  assert.deepEqual([0x280f40, 0x280f4c, 0x280f58].map((a) => [
    u32img(a), u32img(a + 4), u16img(a + 8), u16img(a + 10)]), [
    [0x00280f64, 0xfc00fc00, 0x0420, 0x0044],
    [0x00280f8c, 0xfc00fb00, 0x0428, 0x0054],
    [0x00280fb4, 0xfc00fa00, 0x0430, 0x0064]]);
  // ten longwords each, contiguous, and $280FDC is `move.l ($10,A6),D0` -- CODE.
  assert.equal(0x280f64 + 3 * 10 * 4, 0x280fdc);
  assert.equal(u16img(0x280fdc), 0x202e);
  assert.equal(u16img(0x280fde), 0x0010);
});

test('W411 the two stage-4 kinds had the WRONG collected step and now read it',
  { skip: SKIP_IMG }, () => {
  // W216 wrote `hitShortB: spec.step` where `spec.step` is the ORDINARY body's sprite
  // advance. The table says otherwise, and the two are different numbers for both kinds.
  assert.equal(u16img(0x280f4c + 10), 0x0054, 'kind 18: NOT the body step $0064');
  assert.equal(u16img(0x280f58 + 10), 0x0064, 'kind 19: NOT the body step $00C4');
});

// ==================== 3. THE FILL: KIND 2 IS THE JITTER HOOK

test('W411 an allocated kind-2 record carries the $280EC6 template', { skip: SKIP }, () => {
  const f = world();
  const slot = medal(f, 2);
  assert.equal(f.ram.u16(slot) & 0x7c, 0x08, 'kind index 2 in bits 6..2');
  assert.ok((f.ram.u16(slot) & 0x8000) !== 0, 'allocated');
  assert.equal(f.ram.u32(slot + 0x06), 0xfc00fd00, 'the sprite offset pair at +$06');
  assert.equal(f.ram.u32(slot + 0x0a), 0x001be2cc, 'the gold disc at +$0A');
  assert.equal(f.ram.u16(slot + 0x0e), 0x0418, '4 x 24 at +$0E');
  assert.equal(f.ram.u32(slot + 0x10), 0x06800680, 'the long-axis extents');
  assert.equal(f.ram.u32(slot + 0x14), 0x05000500, 'the short-axis extents');
  assert.equal(f.ram.u16(slot + 0x1c), 0x001c, 'the template tail word');
  assert.equal(f.ram.u32(slot + 0x28), 0x0023d79e, 'layer 2 -> $280BB6[2]');
  // $280CF8's jitter: `add.b (rnd & $1F),($18,A0)` on the HIGH byte, then `clr.w ($20,A0)`.
  const jitter = f.ram.u8(slot + 0x18);
  assert.ok(jitter >= 0x01 && jitter <= 0x20, `$${jitter.toString(16)} is $01 + 0..$1F`);
  assert.equal(f.ram.u8(slot + 0x19), 0x01, 'the reload byte survives the jitter');
  assert.equal(f.ram.u16(slot + 0x20), 0, '$280D08 clr.w ($20,A0)');
});

test('W411 the record lands on the CARRIER, plus the short-axis scroll',
  { skip: SKIP }, () => {
  const f = world();
  f.ram.setU16(SCROLL_SHORT, 0x0040);
  const slot = medal(f);
  assert.equal(f.ram.u16(slot + 0x02), 0x3000, 'the long axis is the carrier own');
  assert.equal(f.ram.u16(slot + 0x04), 0x1c40, 'the short axis picked up $813176');
});

// ==================== 4. THE BODY $27FE0E

test('W411 the driver runs a kind-2 record instead of throwing', { skip: SKIP }, () => {
  const f = world();
  const slot = medal(f, 2);
  const before = [1, 8].map((b) => f.ram.u16(BUCKETS[b].counter));
  const t = drive(f);
  assert.equal(t.live, 1);
  assert.equal(t.emitted, 1, '$27FECE jmp (A0) through the record own emitter');
  assert.deepEqual(f.log.report(), [], 'and reached no unported path');
  assert.notEqual(f.ram.u16(slot), 0, 'still live');
  // ...and it is `movea.l ($28,A6),A0 / jmp (A0)`, the record OWN layer emitter, not
  // kind 0 fixed `jmp $23EBA0`. Layer 2 is $280BB6[2] = $23D79E, which is BUCKET 1;
  // $23EBA0 is bucket 8. Counting "something was emitted" cannot tell those apart.
  const after = [1, 8].map((b) => f.ram.u16(BUCKETS[b].counter));
  assert.ok(after[0] > before[0], 'bucket 1, the layer-2 stub');
  assert.equal(after[1], before[1], 'and NOT bucket 8, the fixed stub kind 0 uses');
});

test('W411 every layer byte selects its own $280BB6 stub', { skip: SKIP }, () => {
  // The layer travels D2 -> `andi.w #$FF` -> `lsl.w #2` -> $280BB6, and the six rows
  // resolve to buckets 0, 0, 1, 2, 3 and 7. A wire that dropped the layer would put
  // every drop in bucket 0 and still look fine on a count.
  for (let layer = 0; layer < 6; layer++) {
    const f = world();
    const slot = medal(f, layer);
    assert.equal(f.ram.u32(slot + 0x28), LAYER_EMITTERS[layer],
      `layer ${layer} -> $${LAYER_EMITTERS[layer].toString(16)}`);
  }
});

test('W411 $8130F8 bit 15 FREES the record outright', { skip: SKIP }, () => {
  // `$27FE0E tst.w $8130F8 / bmi $27FE5E` is a WORD test, so it is bit 7 of the BYTE
  // at $8130F8 -- the one `boss.js` sets with `bset #$7`. Bit 6 (its partner, set on
  // the same line) must NOT free, which is what separates a real read from a guess.
  for (const [flags, freed] of [[0x8000, true], [0x4000, false], [0x0080, false]]) {
    const f = world();
    const slot = medal(f);
    const before = f.ram.u16(POOL_A.liveCount);
    f.ram.setU16(BOSSFLAGS, flags);
    drive(f);
    assert.equal(f.ram.u16(slot) === 0, freed,
      `$${flags.toString(16)}: freed = ${freed}`);
    assert.equal(f.ram.u16(POOL_A.liveCount), freed ? before - 1 : before,
      'and the live count moved with it');
  }
});

test('W411 the long axis takes $80B03C unless motion is FROZEN', { skip: SKIP }, () => {
  // `$27FE6E tst.w $8130D2 / bne $27FE80`. The medal has no velocity of its own at all:
  // this and the driver's `sub.w $813176,($4,A6)` are the only two things that move it.
  for (const [freeze, delta] of [[0, 0x0200], [1, 0]]) {
    const f = world();
    const slot = medal(f);
    f.ram.setU16(SCROLL_LONG, 0x0200);
    f.ram.setU16(FREEZE, freeze);
    const y = f.ram.u16(slot + 0x02);
    drive(f);
    assert.equal(f.ram.u16(slot + 0x02), (y + delta) & 0xffff, `freeze=${freeze}`);
    assert.equal(f.ram.u16(slot + 0x20), 0, 'and no velocity was ever computed');
  }
});

test('W411 the bounds test is a CARRY test, so $F800..$FFFF survives',
  { skip: SKIP }, () => {
  // `$27FE96 addi.w #$800,D0 / $27FE9A addi.w #$7800,D0 / bcs`. Only the LAST add's
  // carry is tested, and the first one wraps a long axis at or above $F800 back down
  // below $800, so the second cannot carry. A `bmi` port would free the whole top half.
  for (const [y, freed] of [
    [0x3000, false], [0x7fff, false],
    [0x8000, true], [0xf7ff, true],
    [0xf800, false], [0xffff, false],
  ]) {
    const f = world();
    const slot = medal(f);
    f.ram.setU16(slot + 0x02, y);
    drive(f);
    assert.equal(f.ram.u16(slot) === 0, freed,
      `long axis $${y.toString(16)}: freed = ${freed}`);
  }
});

test('W411 the short axis frees on X + scroll + $AC00 carrying', { skip: SKIP }, () => {
  // `$27FE84 addi.w #$1C00 / add.w $813172 / addi.w #$9000 / bcs`, i.e. it survives
  // while X + $813172 stays below $5400.
  for (const [x, scroll, freed] of [
    [0x1c00, 0x0000, false], [0x53ff, 0x0000, false],
    [0x5400, 0x0000, true], [0x5300, 0x0100, true],
  ]) {
    const f = world();
    const slot = medal(f);
    f.ram.setU16(slot + 0x04, x);
    f.ram.setU16(SCROLL_BOUND, scroll);
    drive(f);
    assert.equal(f.ram.u16(slot) === 0, freed,
      `short axis $${x.toString(16)} + $${scroll.toString(16)}: freed = ${freed}`);
  }
});

test('W411 the sprite steps $34 on the OLD-ZERO borrow and wraps at $1BE60C',
  { skip: SKIP }, () => {
  const f = world();
  const slot = medal(f);
  f.ram.setU8(slot + 0x18, 2);                     // not due
  drive(f);
  assert.equal(f.ram.u32(slot + 0x0a), 0x001be2cc, 'timer 2: no step');
  assert.equal(f.ram.u8(slot + 0x18), 1, 'but it counted down');
  f.ram.setU8(slot + 0x18, 0);                     // due: `subq.b #1 / bcc` borrows
  // The reload byte has to differ from the template's own $01, or "reload from
  // ($19,A6)" and "write 1" are indistinguishable.
  f.ram.setU8(slot + 0x19, 6);
  drive(f);
  assert.equal(f.ram.u32(slot + 0x0a), 0x001be300, '$1BE2CC + $34');
  assert.equal(f.ram.u8(slot + 0x18), 6,
    '$27FEA6 move.b ($19,A6),($18,A6) -- the RELOAD BYTE, not a constant');
  f.ram.setU8(slot + 0x19, 1);
  // and the wrap replaces on the SAME pass, so $1BE60C is never a value it holds
  f.ram.setU32(slot + 0x0a, 0x001be5d8);
  f.ram.setU8(slot + 0x18, 0);
  // The reload byte is $01 out of the template, so it has to be made DIFFERENT before
  // the wrap or "forces 1" and "reloads from ($19,A6)" are the same number.
  f.ram.setU8(slot + 0x19, 5);
  drive(f);
  assert.equal(f.ram.u32(slot + 0x0a), 0x001be2cc, '$1BE5D8 + $34 = $1BE60C -> wrap');
  assert.equal(f.ram.u8(slot + 0x18), 0x01,
    '$27FEC4 move.b #$1,($18,A6) -- the wrap forces 1, it does not reload the 5');
});

// ==================== 5. THE COLLECT ARM, AND THE FOUR COUNTERS

test('W411 collecting a medal bumps $817F84/$817F88 and NOT the star pair',
  { skip: SKIP }, () => {
  // $28DB70's result screen reads FOUR independent words. If these were a lo/hi pair
  // the star's counter would move too, and this is the assertion that says they are not.
  for (const [bit, mine, theirs] of [
    [0x1000, POOL_A.medalP1Total, POOL_A.medalP2Total],
    [0x0800, POOL_A.medalP2Total, POOL_A.medalP1Total],
  ]) {
    const f = world();
    const slot = medal(f);
    f.ram.setU16(slot, f.ram.u16(slot) | bit);
    drive(f);
    assert.equal(f.ram.u16(mine), 1, `bit $${bit.toString(16)}: its own counter`);
    assert.equal(f.ram.u16(theirs), 0, 'not the other player');
    assert.equal(f.ram.u16(POOL_A.collectP1Total), 0, 'and NOT the star $817F86');
    assert.equal(f.ram.u16(POOL_A.collectP2Total), 0, 'nor $817F8A');
  }
});

test('W411 the collected medal takes the transform out of $280F34', { skip: SKIP }, () => {
  const f = world();
  const slot = medal(f);
  const y = f.ram.u16(slot + 0x02);
  f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);
  drive(f);
  assert.equal(f.ram.u8(slot + 0x01), 0x84,
    '$27FE54 move.b #$84 -- bit 7 of the low byte routes the NEXT frame to $2810CA');
  assert.equal(f.ram.u16(slot + 0x02), (y + 0x0600) & 0xffff,
    '$280FF6 addi.l #$6000000 -- a LONG add on the position');
  assert.equal(f.ram.u32(slot + 0x06), 0xfc00fc00, 'the descriptor offset pair');
  assert.equal(f.ram.u32(slot + 0x0a), 0x001e179c,
    'selector $00050000 -> $280F40 -> base $280F64, index 5*4 = $14');
  assert.equal(f.ram.u16(slot + 0x0e), 0x0420, 'the descriptor size');
  assert.equal(f.ram.u16(slot + 0x16), 0x0044, 'and the descriptor STEP');
  assert.equal(f.ram.u16(slot + 0x12), 0x0010, '$281004');
  assert.equal(f.ram.u16(slot + 0x14), 0x0202, '$28100A');
  assert.equal(f.ram.u16(slot + 0x1c), 0x001d, '$281020');
  assert.equal(f.ram.u8(slot + 0x18), 0x07, '$281014 move.b #$7,($18,A6)');
  assert.equal(f.ram.u8(slot + 0x19), 0x0f, '$28101A move.b #$F,($19,A6)');
  assert.deepEqual(f.sounds, [0x28c5e4], '$27FE4E jsr $28C5E4');
  // `moveq #$50,D0 / move.b (A6),D1 / jsr $286128` -- the mask is the status word
  // HIGH byte, and $90 bit 4 sends the award to P1 pending BCD.
  assert.equal(f.ram.u32(0x81b4c0) >>> 0, 0x00000050,
    '$27FE44 moveq #$50 -- the medal and the star are worth the same $50 HERE; the '
    + 'x10/x20 difference is the RESULT SCREEN reading two different counters');
  assert.equal(f.ram.u32(0x81b4ca) >>> 0, 0, 'and P2 got nothing');
});

test('W411 the collect CLEARS bits 10, 9, 8 and 5 of the status', { skip: SKIP }, () => {
  // `$280FF2 andi.w #$F8DF,(A1)+`, and the mask is worth spelling out a nibble at a
  // time: F = 1111 (15..12), 8 = 1000 (11..8), D = 1101 (7..4), F = 1111 (3..0). So the
  // FOUR bits it clears are 10, 9, 8 and 5 -- NOT bit 13, which is the x2 flag and
  // survives. Bit 5 sits INSIDE the kind field ($7C is bits 6..2), so this instruction
  // edits the kind index of any record that carried it; that is why the record here
  // raises 10, 9 and 8 only, and why bit 12 and bit 13 are checked as SURVIVORS.
  const f = world();
  const slot = medal(f);
  f.ram.setU16(slot, f.ram.u16(slot) | 0x2700 | 0x1000);
  drive(f);
  assert.equal(f.ram.u16(slot) & 0x0700, 0, 'bits 10, 9 and 8 all gone');
  assert.equal(f.ram.u16(slot) & 0x1000, 0x1000, 'bit 12 SURVIVES -- $F8DF keeps it');
  assert.equal(f.ram.u16(slot) & 0x2000, 0x2000, 'and so does bit 13, the x2 flag');
  // ...and the kind index is NOT $08 any more: `$27FE54 move.b #$84,($1,A6)` writes
  // the whole low byte, and $84 & $7C is $04. The record stops being a kind-2 record
  // the moment it is collected, which is fine because bit 7 of that same byte routes
  // the next frame to $2810CA before the kind is ever looked at again.
  assert.equal(f.ram.u16(slot) & 0x7c, 0x04, '$84 & $7C');
});

test('W411 the collected drift takes its DIRECTION from the $1C00 line',
  { skip: SKIP }, () => {
  // `$281026 move.w $813176,D0 / add.w ($4,A6),D0 / moveq #$30,D1 / cmpi.w #$1C00,D0 /
  // bcc / moveq #$10,D1` -- $30 at or right of the line and $10 left of it, feeding
  // `$241812` and landing in ($1A,A6). The two are opposite quadrants of the 64-step
  // circle, so the SIGN is the assertion; a swap flips both.
  const at = (x) => {
    const f = world();
    const slot = medal(f);
    f.ram.setU16(slot + 0x04, x);
    f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);
    drive(f);
    return i16(f.ram.u16(slot + 0x1a));
  };
  const left = at(0x1bff), right = at(0x1c00);
  assert.ok(left > 0, `x $1BFF -> direction $10, dx ${left} > 0`);
  assert.ok(right < 0, `x $1C00 -> direction $30, dx ${right} < 0`);
  assert.equal(left, -right, 'the same magnitude, so it really is a mirror');
});

test('W411 the collected medal then runs $2810CA, not $27FE0E', { skip: SKIP }, () => {
  // `$27F982 tst.b D1 / bmi $2810CA` -- the LOW byte's bit 7, which the collect arm
  // just set. So the second frame is the zoomed collected animation and the body is
  // never reached again; a port that left the kind bits deciding would loop the medal.
  const f = world();
  const slot = medal(f);
  f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);
  drive(f);
  const t = drive(f);
  assert.equal(t.collected, 1, '$2810CA ran');
  assert.deepEqual(f.log.report(), []);
});

test('W411 the medal collect CLAMPS at $3E7 like the star own', { skip: SKIP }, () => {
  for (const [start, want] of [[0x03e6, 0x03e7], [0x03e7, 0x03e7]]) {
    const f = world();
    const slot = medal(f);
    f.ram.setU16(POOL_A.medalP1Total, start);
    f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);
    drive(f);
    assert.equal(f.ram.u16(POOL_A.medalP1Total), want);
  }
});

test('W411 the collected STEP is per-kind, out of $280F34', { skip: SKIP }, () => {
  // The shared transform is table-driven, so kinds 2, 18 and 19 must come out with
  // THREE different values at ($16,A6). W216 hard-coded `spec.step` -- the ORDINARY
  // body's sprite advance -- here, which gave $0064 and $00C4 where the cartridge says
  // $0054 and $0064. A test that only ever collects kind 2 cannot see that.
  for (const [kind, want] of [[0x08, 0x0044], [0x48, 0x0054], [0x4c, 0x0064]]) {
    const f = world();
    const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, kind, 0, 0, CARRIER);
    assert.ok(slot !== null, `kind $${kind.toString(16)} allocated`);
    f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);
    drive(f);
    assert.equal(f.ram.u16(slot + 0x16), want,
      `kind $${kind.toString(16)} collects with step $${want.toString(16)}`);
  }
});

// ==================== 6. THE WIRING: TEN SITES, FIVE HANDLERS

const A5 = 0x8137c0, A6 = 0x8139c0;

function enemyWorld() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x02, 0x20002000);
  ram.setU16(A6 + 0x18, 0x8000);                   // HP negative: dead
  ram.setU8(A6, 0x04);                             // a hit, so the damage arm is taken
  const ctx = { ram, tables: MT, rom: ROM,
    unported: log, unportedLog: log, notes: log,
    bulletSpawn: () => {}, soundPost: () => {}, killEvent: () => {} };
  return { ram, log, ctx };
}
/** Every live pool-A record, as {kind index, long axis, short axis}. */
function records(ram) {
  const out = [];
  for (let i = 0; i < POOL_A.totalSlots; i++) {
    const a = POOL_A.base + i * POOL_A.stride;
    const st = ram.u16(a);
    if (st !== 0) {
      out.push({ slot: a, status: st, kind: (st & 0x7c) >> 2,
        y: ram.u16(a + 0x02), x: ram.u16(a + 0x04) });
    }
  }
  return out;
}

/** A type $90 built through its own init body, then put in the DAMAGED-but-alive
 *  state the particle loop needs: a hit flag, HP under `($18,A5)`, and `($1E,A5)`
 *  as the dbra count. */
function type90(count) {
  const f = enemyWorld();
  f.ram.setU8(A5 + 0x0c, 0x90);
  f.ram.setU16(0x813092, 1);
  f.ram.setU16(0x813094, 2);
  runInitBodyAddr(0x27980a, f.ram, ROM, A5, f.log, MT);
  f.ram.setU32(A6 + 0x02, 0x20002000);
  f.ram.setU8(A6, 0x04);                           // a hit
  f.ram.setU16(A6 + 0x18, 0x0100);                 // ALIVE, and under the cooldown
  f.ram.setU16(A5 + 0x18, 0x0f00);
  f.ram.setU16(A5 + 0x1e, count);                  // the dbra counter
  f.ram.setU16(A5 + 0x16, 1);
  return f;
}

test('W411 type $8B death drops ONE kind-2 record on the carrier', { skip: SKIP }, () => {
  const f = enemyWorld();
  f.ram.setU16(A5 + 0x18, 0x0008);                 // the $27685E prototype own value
  f.ram.setU16(A5 + 0x16, 1);                      // on-screen already
  f.ram.setU8(A6 + 0x1f, 4);                       // $276904 move.b ($1F,A6),D2
  handlerMap().get(0x27687e)(f.ram, ROM, A5, f.ctx);
  const r = records(f.ram);
  assert.equal(f.ram.u32(r[0].slot + 0x28), LAYER_EMITTERS[4],
    'the layer BYTE travels: ($1F,A6) = 4 picks $280BB6[4], not row 0');
  assert.equal(r.length, 1, 'exactly one, not the seven a loop would give');
  assert.equal(r[0].kind, 2, 'kind index 2 -- the gold disc');
  assert.equal(r[0].y, 0x2000, 'D1 = 0 from $27F8EE moveq, so it is ON the carrier');
  assert.equal(r[0].x, 0x2000);
  assert.equal(f.ram.u16(A5), 0, 'and the enemy was freed');
});

test('W411 type $8B REFUSES a D0 the prototype cannot produce', { skip: SKIP }, () => {
  // The brief said to range-check ($18,A5) rather than assume it. $27685E loads $0008
  // and nothing in $276600..$276A00 writes ($18,A5) again, so anything else is loud.
  const f = enemyWorld();
  f.ram.setU16(A5 + 0x18, 0x000c);
  f.ram.setU16(A5 + 0x16, 1);
  assert.throws(() => handlerMap().get(0x27687e)(f.ram, ROM, A5, f.ctx),
    /\$276908 jsr \$27F8EE with D0 = \$C/);
});

// TYPE $8E'S DROP COULD NOT BE DRIVEN WHEN THIS FILE WAS WRITTEN, AND W419 UNBLOCKED IT.
// `death8E` reaches `$27664E jsr $289AF4` BEFORE `$27665A jsr $27F8EE`, and pool C's
// absolute allocator used to refuse kind $8 ("not the translated kind-4 template
// selected by type $37"), so the whole arm threw and the drop below it was
// unreachable -- which is also why the 5400-frame census never counted a $27F8EE note
// from $27665A. W419 opened that guard to the table's real domain (kinds 0, 4, 8 and
// $C) and harvested the missing art, so the arm now runs to the end;
// `w419poolckinds.test.js` traces the pool-C record it leaves. THE NOTE IS KEPT AND
// CORRECTED rather than deleted: W418 found a test whose stated reason had been false
// for 45 waves while its assertion held, and a stale explanation is that same defect.

test('W411 types $8F and $94 pass ($1E,A6) as the LAYER', { skip: SKIP }, () => {
  // `$2777DE` and `$27A37C` are both `move.w ($1E,A6),D2`, which `$27F8F0` masks to a
  // byte and shifts into $280BB6. Every other assertion about these two arms works
  // with the word at 0, where dropping the argument entirely looks identical -- so the
  // layer is set to a row that is NOT 0 here and the record's +$28 is read back.
  // Type $8F dies TWICE: the first lethal hit swaps in the death art and reloads HP
  // ($2777A4/$2777AC), and only the second reaches $2777E2. That two-stage shape is
  // W172's own finding and it is why this loop carries a pass count.
  for (const [handler, type, layer, passes] of [
    [0x2775cc, 0x8f, 3, 2], [0x27a1b4, 0x94, 5, 1]]) {
    const f = enemyWorld();
    f.ram.setU16(A5, 0x8000 | type);
    f.ram.setU16(A5 + 0x16, 1);
    f.ram.setU16(A6 + 0x1e, layer);
    for (let n = 0; n < passes; n++) {
      f.ram.setU8(A6, f.ram.u8(A6) | 0x10);
      f.ram.setU16(A6 + 0x18, 0x8001);
      handlerMap().get(handler)(f.ram, ROM, A5, f.ctx);
    }
    const r = records(f.ram);
    assert.equal(r.length, 1, `type $${type.toString(16)}: one drop`);
    assert.equal(r[0].kind, 2);
    assert.equal(f.ram.u32(r[0].slot + 0x28), LAYER_EMITTERS[layer],
      `type $${type.toString(16)}: ($1E,A6) = ${layer} selects $280BB6[${layer}]`);
  }
});

test('W411 type $88 death drops SEVEN, one per $2763E8 vector', { skip: SKIP }, () => {
  const f = enemyWorld();
  f.ram.setU16(A5, 0x8088);
  f.ram.setU16(A5 + 0x16, 1);
  handlerMap().get(0x275f30)(f.ram, ROM, A5, f.ctx);
  const r = records(f.ram);
  assert.equal(r.length, 7, 'moveq #$6,D6 plus dbra is SEVEN passes, not six');
  assert.ok(r.every((e) => e.kind === 2), 'all kind index 2');
  // the seven longs are packed {long axis, short axis} offsets added to the carrier
  // `$280B56 add.l ($2,A6),D1` is a LONG add, so a low half that wraps CARRIES INTO
  // the long axis. Three of the seven do: $2000 + $F800 and $2000 + $FC00 both exceed
  // $FFFF, which is why `0,f800` reads back as `1,f800` and `400,fc00` as `401,fc00`.
  // A word-wise add -- the shape W374 removed from this fill -- gives the other seven.
  const off = r.map((e) => `${((e.y - 0x2000) & 0xffff).toString(16)},${
    ((e.x - 0x2000) & 0xffff).toString(16)}`).sort();
  assert.deepEqual(off,
    ['0,0', '0,800', '1,f800', '400,400', '401,fc00', 'fc00,400', 'fc01,fc00'].sort());
});

test('W411 type $91 tail reads movem.W, so SEVEN and not 257', { skip: SKIP }, () => {
  // `4C9C` has bit 6 clear. Read as movem.l the count word would be $0100.
  const f = enemyWorld();
  runInitBodyAddr(0x279aa2, f.ram, ROM, A5, f.log, MT);
  f.ram.setU32(A6 + 0x02, 0x20002000);
  f.ram.setU8(A6 + 0x01, 0x80);                    // $279B62 btst -- the tail, not the body
  f.ram.setU8(A5 + 0x17, 0);                       // the linger byte borrows this frame
  handlerMap().get(0x279b2e)(f.ram, ROM, A5, f.ctx);
  const r = records(f.ram);
  assert.equal(r.length, 7);
  assert.ok(r.every((e) => e.kind === 2), 'D0 is the WORD $0008, not the long $00080006');
});

test('W411 type $97 death drops FIVE', { skip: SKIP }, () => {
  const f = enemyWorld();
  f.ram.setU16(A5, 0x8097);
  f.ram.setU16(A5 + 0x16, 1);
  f.ram.setU16(A6 + 0x1e, 0);
  handlerMap().get(0x277f26)(f.ram, ROM, A5, f.ctx);
  const r = records(f.ram);
  assert.equal(r.length, 5, 'moveq #$4,D6 plus dbra');
  assert.ok(r.every((e) => e.kind === 2));
});

test('W411 type $90 damage particles are kind index FOUR, not two', { skip: SKIP }, () => {
  // The one site of the ten whose D0 is $10. Kind 4 shares kind 0's body $27FA30, so
  // this was the wire that needed no new code -- and it must not be folded into the $8
  // sites, because the two take different bodies out of the same dispatch.
  const f = type90(2);
  handlerMap().get(0x279898)(f.ram, ROM, A5, f.ctx);
  const r = records(f.ram);
  assert.equal(r.length, 3, 'dbra on 2 is three passes');
  // AND THE KIND INDEX IS GONE FROM THE RECORD, WHICH IS THE CARTRIDGE'S DOING.
  // `$280BCE[4] = $280D28` ends `clr.b ($1,A0)`, and ($1,A0) is the status word's LOW
  // byte -- the very byte the kind index lives in. So a D0 = $10 record lives as
  // $8000 and takes DISPATCH[0], which is the same $27FA30 DISPATCH[4] names. The
  // distinction is real in the FILL and erased in the record; a test that asserted
  // "kind 4 is readable back" would be asserting something the ROM does not do.
  assert.ok(r.every((e) => e.status === 0x8000),
    '$280D2A clr.b ($1,A0) -- hook 4 erases the index it was allocated with');
  // D1's HIGH word is the fixed $08C0 and its low word one of the four $279A92 words.
  assert.ok(r.every((e) => e.y === 0x2000 + 0x08c0), '$279976 move.w #$08C0 / swap');
  assert.ok(r.every((e) => [0x0480, 0x0600, 0x0740, 0x08c0]
    .includes((e.x - 0x2000) & 0xffff)), 'and one of the four table words');
});

test('W411 the $90 particles take HOOK 4, not hook 0', { skip: SKIP_IMG }, () => {
  // The only thing that still separates D0 = $10 from D0 = 0 once `clr.b ($1,A0)` has
  // run is the SPEED, and the two hooks build it differently:
  //   hook 0 ($280C5E):  $0420 floor, then $2431F4 >> 1
  //   hook 4 ($280D28):  $0420 floor, then abs($242B3C) >> 1, then addq.b #5
  // `$803916` is a fixed word in a bench, so both tables are read at index 0 and the
  // expected byte is arithmetic on the image rather than on the port.
  // `$24324E`, $2431F4's table, holds ONLY 0, 1, 2 and 3 -- all 64 bytes of it. So
  // hook 0's speed is $04 + (0..3 >> 1), i.e. $04 or $05 and nothing else, ever.
  // Hook 4's is $04 + (abs($242B3C) >> 1) + 5, which starts at $09. The two ranges do
  // not touch, which is what makes this a separator rather than a coincidence.
  const t = Array.from({ length: 64 }, (_, i) => IMG[0x24324e + i]);
  assert.deepEqual([...new Set(t)].sort(), [0, 1, 2, 3], '$24324E holds only 0..3');
  for (const [state, run] of [[0, null], [0x11, null], [0x2a, null]]) {
    const f = type90(0);
    f.ram.setU16(0x803916, state);
    handlerMap().get(0x279898)(f.ram, ROM, A5, f.ctx);
    const r = records(f.ram);
    assert.equal(r.length, 1, run ?? `state $${state.toString(16)}`);
    const speed = f.ram.u8(r[0].slot + 0x1a);
    assert.ok(speed >= 0x09,
      `speed $${speed.toString(16)}: hook 4's addq.b #5 puts it out of hook 0's {4,5}`);
    assert.equal(f.ram.u8(r[0].slot + 0x1b) !== 0, true,
      'and the angle byte was written, which hooks 2 and 3 would have skipped');
  }
});

test('W411 the kind-4 records the $90 arm drops run kind 0 body', { skip: SKIP }, () => {
  const f = type90(0);
  handlerMap().get(0x279898)(f.ram, ROM, A5, f.ctx);
  const drv = { ram: f.ram, rom: ROM, tables: MT, unported: f.log,
    unportedLog: f.log, notes: f.log, soundPost: () => {} };
  runPoolADriver(f.ram, ROM, drv);
  assert.deepEqual(f.log.report(), [], 'the driver dispatched it without a note');
});
