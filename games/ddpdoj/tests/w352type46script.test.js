// W352 type $46 -- the init's spawn-clock cascade, checked against the SCRIPT.
//
// `$46`'s init body compares `$8130CE` against five constants and sets `($18,A5)` per match. Those
// constants are not arbitrary: they are spawn-clock values, so every one must appear in stage 5's script
// as a `$46` record. That makes the cascade checkable from a direction independent of reading it -- and
// it also says exactly which of the type's thirteen records are special and which take the prototype
// default, which the disassembly alone cannot tell you.
//
// Written BEFORE handler55's sibling handler46, deliberately. If the cascade had been misread, this fails
// in seconds; discovering it later, from a handler that draws plausibly, costs a wave.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

const STAGE5 = 0x237978;
const TYPE46 = 0x46;

// The cascade as read off $27105C..$2710B6: [clock, ($18,A5) value, the cmpi's address].
const CASCADE = Object.freeze([
  [0x0e6, 0x60, 0x27105c],
  [0x0e4, 0xf0, 0x27106e],
  [0x108, 0x40, 0x271080],
  [0x106, 0xf0, 0x271092],
  [0x116, 0x80, 0x2710a4],
]);

/** The +0 words of every stage-5 script record of a given type. 8-byte records, $FFFF terminates. */
function clocksOf(type) {
  const out = [];
  for (let cur = STAGE5; IMG.readUInt16BE(cur) !== 0xffff; cur += 8) {
    if (IMG[cur + 4] === type) out.push(IMG.readUInt16BE(cur));
  }
  return out;
}

test('W352 the init cascade reads as five clock/value pairs', { skip: SKIP }, () => {
  for (const [clock, value, at] of CASCADE) {
    // cmpi.w #clock,$8130CE is 0x0C79 <clock> 0x0081 0x30CE -- eight bytes.
    assert.equal(IMG.readUInt16BE(at), 0x0c79, `$${at.toString(16)} cmpi.w #imm,abs.l`);
    assert.equal(IMG.readUInt16BE(at + 2), clock, `  ...against $${clock.toString(16)}`);
    assert.equal(IMG.readUInt32BE(at + 4), 0x008130ce, '  ...on the spawn clock $8130CE');
    assert.equal(IMG.readUInt16BE(at + 8), 0x6600, '  ...bne, so each store is skipped INDEPENDENTLY');
    // move.b #value,($18,A5) is 0x1B7C 0x00<value> 0x0018, at the branch's fall-through.
    assert.equal(IMG.readUInt16BE(at + 12), 0x1b7c, `$${(at + 12).toString(16)} move.b #imm,(d16,A5)`);
    assert.equal(IMG.readUInt16BE(at + 14), value, `  ...#$${value.toString(16)}`);
    assert.equal(IMG.readUInt16BE(at + 16), 0x0018, '  ...into ($18,A5)');
  }
  assert.equal(IMG.readUInt16BE(0x2710b6), 0x4e75, '$2710B6 rts ends the init body');
});

test('W352 every cascade constant is a REAL $46 spawn in stage 5s script', { skip: SKIP }, () => {
  const clocks = clocksOf(TYPE46);
  assert.equal(clocks.length, 13, '$46 has thirteen script records');
  for (const [clock] of CASCADE) {
    assert.ok(clocks.includes(clock),
      `the init compares against $${clock.toString(16)}, so the script must spawn $46 at that clock`);
  }
});

test('W352 FIVE of the thirteen are special; the other EIGHT take the prototype default', { skip: SKIP }, () => {
  const clocks = clocksOf(TYPE46);
  const named = new Set(CASCADE.map(([c]) => c));
  const special = clocks.filter((c) => named.has(c));
  const defaulted = clocks.filter((c) => !named.has(c));
  assert.equal(special.length, 5, 'five records match a cascade arm');
  assert.equal(defaulted.length, 8, 'eight fall through every test');
  // Named explicitly, because "the rest" is where a misreading would hide: if the cascade grew or
  // shrank, this list changes and the failure says which clock moved.
  assert.deepEqual(defaulted, [0x0d0, 0x0d4, 0x0f6, 0x119, 0x127, 0x129, 0x138, 0x13b],
    'the eight defaulted clocks, in script order');
  // Two arms select the same $F0, so the type shows FOUR distinct ($18,A5) values across five frames.
  assert.equal(new Set(CASCADE.map(([, v]) => v)).size, 4,
    '$E4 and $106 both select $F0, so four distinct values over five frames');
});

test('W352 the clock is the record +0 word -- monotonic across the whole script', { skip: SKIP }, () => {
  // If +0 were anything but a clock this would not hold, and the cross-check above would be meaningless.
  let prev = -1;
  let n = 0;
  for (let cur = STAGE5; IMG.readUInt16BE(cur) !== 0xffff; cur += 8) {
    const c = IMG.readUInt16BE(cur);
    assert.ok(c >= prev, `record ${n} clock $${c.toString(16)} not below its predecessor`);
    prev = c;
    n += 1;
  }
  assert.equal(n, 770, 'stage 5 has 770 script records');
});
