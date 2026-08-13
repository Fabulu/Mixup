// W363: pin T1A's most error-prone fields against the cartridge.
//
// T1A carries about forty hand-transcribed values. Every time this session a transcription became an
// assertion, the assertion found something -- the type-table check found $55's silently no-op init-body
// registration, the volley-angle check found a -0 comparison bug, and the part-offset check found an ordinal
// I had repeated in four places. So the fields a port would actually index are pinned here.
//
// Chosen for pinning: the fan geometry (seven angles derived from a backoff and a step), the rank cascade
// (two values that move firing rates in OPPOSITE directions, so a swap is silent), and the damage/bounds
// constants. Not pinned: field OFFSETS like palBase, which the tests cannot distinguish from any other byte
// without re-deriving the whole handler -- those stay prose, and the handoff says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TYPE_SPECS } from '../src/handlers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';
const T1A = TYPE_SPECS.get(0x1a);

test('W369 T1A: the handler IS written, and the type still cannot spawn', { skip: SKIP }, () => {
  assert.ok(T1A, 'T1A is registered in TYPE_SPECS');
  // W363 asserted `T1A.ported === false` with the comment "if it is, this file needs revisiting". W365
  // wrote and registered handler1A and did NOT revisit -- it left the flag, so this assertion kept
  // passing on a false claim, and the stale flag then made w346's registry tests skip the type entirely.
  // That is how the missing init body $268D26 stayed invisible for four waves.
  assert.equal(T1A.ported, undefined, 'the handler is written, so there is no `ported: false` flag');
  assert.equal(T1A.initBodyPorted, false,
    'but the INIT BODY is not registered, so every $1A spawn throws from runInitBodyAddr. The block is '
    + 'D3 provenance at $268D8C: the aim CORE takes its target in D2/D3, and neither this body nor '
    + '$263808 writes D3. It feeds the heading and velocity, so it is gameplay, not a note().');
});

test('W363 the fan geometry: backoff $24, step $C, SEVEN symmetric angles', { skip: SKIP }, () => {
  // $26901C subi.w #$24,D1 -- the backoff
  assert.equal(IMG.readUInt16BE(0x26901c), 0x0441, '$26901C subi.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x26901e), T1A.fan.backoff, `  ...#$${T1A.fan.backoff.toString(16)}`);
  // $269020 move.w #$6,D7 -- DBcc, so D7 + 1 passes
  assert.equal(IMG.readUInt16BE(0x269020), 0x3e3c, '$269020 move.w #imm,D7');
  assert.equal(IMG.readUInt16BE(0x269022) + 1, T1A.fan.shots, 'D7 + 1 = seven shots (the DBcc rule)');
  // $26903E addi.w #$C,D1 -- the step between shots
  assert.equal(IMG.readUInt16BE(0x26903e), 0x0641, '$26903E addi.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x269040), T1A.fan.step, `  ...#$${T1A.fan.step.toString(16)}`);
  // Exactly one emit per pass: $269038 jsr $281744, and no second one before the dbra at $269042.
  assert.equal(IMG.readUInt32BE(0x26903a), T1A.fan.emit, '$269038 jsr the fan emit');
  assert.equal(IMG.readUInt16BE(0x269042), 0x51cf, '$269042 dbra D7 -- one emit per pass, not unrolled');

  // The angles must follow from those three numbers AND be symmetric about the aim.
  const want = [];
  for (let i = 0; i < T1A.fan.shots; i += 1) want.push(-T1A.fan.backoff + i * T1A.fan.step);
  assert.deepEqual([...T1A.fan.angles], want, 'angles = -backoff + i * step');
  const mirrored = want.map((x) => (x === 0 ? 0 : -x)).reverse();
  assert.deepEqual(want, mirrored, 'symmetric about the aim -- the check that the reading is right');
});

test('W363 the rank cascade moves the two firing rates in OPPOSITE directions', { skip: SKIP }, () => {
  // $268D44/$268D48/$268D4C set the low-rank defaults; $268D5A/$268D5E/$268D62 the high-rank values.
  const lo = [IMG[0x268d47], IMG[0x268d4b], IMG[0x268d4f]];
  const hi = [IMG[0x268d5d], IMG[0x268d61], IMG[0x268d65]];
  assert.deepEqual(lo, [...T1A.rankLow], 'the low-rank triple, from the moveq/move.b immediates');
  assert.deepEqual(hi, [...T1A.rankHigh], 'the high-rank triple');
  // $268D50 cmpi.w #$1,$813092 -- the threshold, and it is a THRESHOLD (bls) not an equality.
  assert.equal(IMG.readUInt16BE(0x268d50), 0x0c79, '$268D50 cmpi.w #imm,abs.l');
  assert.equal(IMG.readUInt32BE(0x268d54), T1A.rankGlobal, '  ...on $813092, RANK');
  // The point of the cascade: arm 1 gets SLOWER at high rank ($4 -> $6) while arm 2 gets FASTER
  // ($4 -> $3). A port that swapped the two reload sources would be silently wrong in both arms.
  assert.ok(hi[1] > lo[1], 'arm 1 (($2B,A5)) is SLOWER at high rank');
  assert.ok(hi[0] < lo[0], 'arm 2 (($2A,A5)) is FASTER at high rank');
});

test('W363 the damage and bounds constants', { skip: SKIP }, () => {
  // $268E94 moveq #$5C,D1 / and.b (A6),D1 -- the family mask
  // moveq #imm,Dn is 0111 nnn0 dddddddd, so the register is in bits 9-11: D1 is 0x72xx, NOT 0x70xx.
  // I wrote 0x7000 | mask first, which is D0's encoding, and this assertion caught it.
  assert.equal(IMG.readUInt16BE(0x268e94), 0x7200 | T1A.damageMask, '$268E94 moveq #$5C,D1');
  assert.equal(IMG.readUInt16BE(0x268e96), 0xc216, '$268E96 and.b (A6),D1');
  // The bounds test is TWO sequential word adds -- $1000 then $6E00 -- with the carry off the SECOND.
  assert.equal(IMG.readUInt16BE(0x268e76), 0x0640, '$268E76 addi.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x268e78), T1A.boundsBias[0], '  ...#$1000');
  assert.equal(IMG.readUInt16BE(0x268e7a), 0x0640, '$268E7A addi.w #imm,D0 -- the SECOND add');
  assert.equal(IMG.readUInt16BE(0x268e7c), T1A.boundsBias[1], '  ...#$6E00');
  assert.equal(IMG[0x268e7e], 0x64, '$268E7E bcc -- the carry comes off the second add');
  // Folding them would change the carry: with D0 = $F000 the pair clears and the single sets.
  const pair = (((0xf000 + T1A.boundsBias[0]) & 0xffff) + T1A.boundsBias[1]) > 0xffff;
  const single = (0xf000 + T1A.boundsBias[0] + T1A.boundsBias[1]) > 0xffff;
  assert.notEqual(pair, single, 'so the two adds must NOT be folded into one');
});
