// WAVE 8 -- the shot subsystem, pinned against the LISTING.
//
// These tests run on SYNTHETIC RAM and a SYNTHETIC ROM window, so
// `node --test games/ddpdoj/tests/` still works on a tree with no cartridge
// extracted -- the same rule tests/render.test.js states for itself.  What they
// cannot do is prove the translation matches the board; that is what
// `pgm.py shotgate` is for, and its four mutations are what prove IT can fail.

import test from 'node:test';
import assert from 'node:assert';

import { Ram } from '../src/ram.js';
import { P } from '../src/machine.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import { SPRQ, enqueueShotSprite } from '../src/spritequeue.js';
// WAVE 11: the counter reset is now the TAIL of main-loop call #4, not the only
// part of it the port models -- src/displaylist.js.
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import { RNG, draw } from '../src/rng.js';
import { S, PS, PLAYER_SLOTS, shotHandlers, handler253BDA,
  handler253D52, handler253FE8, spawnShotTypeB } from '../src/shots.js';
import { SHOT, SHOT_HANDLERS, runShotDriver } from '../src/weapons.js';
import { TYPE5 } from '../src/type5.js';
import { RAWDUMP_SPEC, EXEC_SPEC, REPORTED_COLUMNS, CLAIMED } from '../src/state.js';

function grab(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** A RomWindows over one synthetic window at `base`. */
function romAt(base, bytes) {
  return romWindows([[base, bytes]]);
}
/** Several windows at once -- W34's shot HIT path reads three tables. */
function romWindows(pairs) {
  return new RomWindows({
    windows: pairs.map(([base, bytes]) => ({
      base: `$${base.toString(16)}`, len: bytes.length, why: 'test',
      hex: bytes.map((b) => b.toString(16).padStart(2, '0')).join(''),
    })),
  });
}

// ---------------------------------------------------------------- ROM windows
test('a ROM read outside every window is a LOUD NAMED THROW, not undefined', () => {
  const rom = romAt(0x240000, [1, 2, 3, 4]);
  assert.equal(rom.u32(0x240000), 0x01020304);
  const e = grab(() => rom.u16(0x240004));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x240004);
  // ...and a read that STRADDLES the end is outside too, not truncated.
  assert.ok(grab(() => rom.u32(0x240002)) instanceof Unreached);
});

// ---------------------------------------------------------------- $23F3AE
test('$23F3AE packs (y,x) with ONE asr.l #6 across both halves', () => {
  const r = new Ram();
  const rec = 0x810812;
  // ($2,A6)+($6,A6) = the drawn Y, ($4,A6)+($8,A6) = the drawn X, 1/64 px.
  r.setU16(rec + S.posY, 0x6240);
  r.setU16(rec + S.drawOff, 0xfc00);          // -1024 = -16 px
  r.setU16(rec + S.posX, 0x1380);
  r.setU16(rec + S.drawOff + 2, 0xfe00);      // -512 = -8 px
  r.setU32(rec + S.dlWord23, 0xdeadbeef);
  r.setU16(rec + S.dlWord4, 0x1234);
  r.setU16(rec + S.dlWord5, 0x4002);
  const off = enqueueShotSprite(r, rec);
  assert.equal(off, 0, 'the first record goes at $80AFD6 == 0');
  assert.equal(r.u16(SPRQ.shotBucketCount), 12, '$23F3BA addi.w #$c');
  const y = 0x6240 + 0xfc00 - 0x10000;        // sign-extended adds, then u16
  const x = 0x1380 + 0xfe00 - 0x10000;
  const packed = ((((y & 0xffff) << 16) | (x & 0xffff)) | 0) >> 6;
  const want = (packed & 0x07ff03ff) | 0x80008000;
  assert.equal(r.u16(SPRQ.shotBucket + 0), (want >>> 16) & 0xffff);
  assert.equal(r.u16(SPRQ.shotBucket + 2), want & 0xffff);
  assert.equal(r.u32(SPRQ.shotBucket + 4), 0xdeadbeef, '$23F3E0');
  assert.equal(r.u16(SPRQ.shotBucket + 8), 0x1234, '$23F3E2');
  assert.equal(r.u16(SPRQ.shotBucket + 10), 0x4002, '$23F3E4 ($1c,A6)');
});

test('the ONE loop of call #4 the port models clears all THIRTY counters', () => {
  const r = new Ram();
  for (let i = 0; i <= 0x1d; i++) r.setU16(0x80afc0 + i * 2, 0x1111);
  r.setU16(0x80affc, 0x2222);                 // one word PAST the dbra's range
  resetSpriteQueueCounters(r);                // $23D70C: moveq #$1d,D0
  for (let i = 0; i <= 0x1d; i++) assert.equal(r.u16(0x80afc0 + i * 2), 0);
  assert.equal(r.u16(0x80affc), 0x2222, 'the loop is 30 words, not "the block"');
});

// ---------------------------------------------------------------- $2433AE
test('$2433AE is a 64-entry TABLE walked by a BYTE counter, not a generator', () => {
  const r = new Ram();
  const rom = romAt(RNG.table, Array.from({ length: 256 }, (_, i) => i));
  r.setU16(RNG.state, 0x00ff);                // high byte 0, low byte $FF
  // $2433AE `addq.b #1,$803917` -- a BYTE add: $FF wraps to $00 and does NOT
  // carry into $803916's high byte.
  const v = draw(r, rom);
  assert.equal(r.u16(RNG.state), 0x0000, 'the wrap must not touch the high byte');
  assert.equal(v, 0x00010203, 'index ($00 & $3f) = 0');
  r.setU16(RNG.state, 0x1234);
  draw(r, rom);
  assert.equal(r.u8(RNG.counter), 0x35);
  // index = ($3f & the whole WORD) = 0x35 & 0x3f = 0x35
  assert.equal(draw(r, rom) >>> 0, ((0x36 * 4) << 24 >>> 0)
    + ((0x36 * 4 + 1) << 16) + ((0x36 * 4 + 2) << 8) + (0x36 * 4 + 3));
});

// ---------------------------------------------------------------- geometry
test('the ten compared slots are the two bases $249C5C/$249C60 name', () => {
  assert.equal(SHOT.p1Table + PLAYER_SLOTS.primary[0] * SHOT.stride, 0x810812);
  assert.equal(SHOT.p1Table + PLAYER_SLOTS.secondary[0] * SHOT.stride, 0x810962);
  // $249C5C lea ($2a0,A0),A0 and $249C60 lea ($150,A0),A4
  assert.equal(PLAYER_SLOTS.primary[0] * SHOT.stride, 0x2a0);
  assert.equal(PLAYER_SLOTS.secondary[0] * SHOT.stride, 0x2a0 + 0x150);
  // five each: D7 = the ROM word behind $8127E4 (MEASURED 4), and $249C6C's
  // cap to 3 applies only when $81308C is zero, which it is NOT ($0001).
  assert.equal(PLAYER_SLOTS.primary[1] - PLAYER_SLOTS.primary[0] + 1, 5);
  assert.equal(PLAYER_SLOTS.secondary[1] - PLAYER_SLOTS.secondary[0] + 1, 5);
  // ...and the gate dumps exactly those ten records.
  const [, a1, l1] = RAWDUMP_SPEC.find((x) => x[0] === 'shot1');
  const [, a2, l2] = RAWDUMP_SPEC.find((x) => x[0] === 'shot2');
  assert.equal(a1, 0x810812); assert.equal(l1, 5 * SHOT.stride);
  assert.equal(a2, 0x810962); assert.equal(l2, 5 * SHOT.stride);
});

test('Type-B paired spawn advances A1 to the adjacent 38-byte muzzle template', () => {
  const template = (x) => {
    const b = Buffer.alloc(0x26);
    b.writeUInt16BE(0x8001, 0x00);
    b.writeUInt16BE(x, 0x04);
    b.writeUInt32BE(0x240400, 0x0a);
    return [...b];
  };
  const r = new Ram();
  const prec = SHOT.p1Rec;
  r.setU32(0x8127e4, 0x240100);
  r.setU16(0x81308c, 1);
  r.setU16(prec + P.posY, 0x2000);
  r.setU16(prec + P.posX, 0x1000);
  r.setU16(prec + PS.formation, 2);
  r.setU16(prec + PS.power, 0);
  r.setU16(prec + PS.animPhase, 0);
  r.setU16(prec + PS.animIdx, 4);
  const rom = romWindows([
    [0x240100, [0, 0]],
    [0x240200, [0, 0x24, 0x03, 0]],
    [0x240300, [...template(0x0100), ...template(0x0200)]],
    [0x240400, Array(12).fill(0)],
    [0x25551a, [0, 0x24, 0x02, 0]],
  ]);

  spawnShotTypeB(r, rom, prec, {});

  const first = SHOT.p1Table + 0x2a0;
  const second = first + SHOT.stride;
  assert.equal(r.u16(first + S.posX), 0x1200,
    '$249DEE receives A1 after the first 38-byte filler advances it');
  assert.equal(r.u16(second + S.posX), 0x1100,
    '$249DE8 uses the first Type-B muzzle template');
});

test('all sixteen cartridge shot dispatch entries are registered', () => {
  const h = shotHandlers();
  assert.deepEqual([...h.keys()].sort(), SHOT_HANDLERS.toSorted());
  for (let i = 0; i < SHOT_HANDLERS.length; i++) {
    assert.equal(h.has(SHOT_HANDLERS[i]), true,
      `$253ADE[${i}] -> $${SHOT_HANDLERS[i].toString(16).toUpperCase()}`);
  }
  assert.equal(SHOT_HANDLERS[1], 0x253c98, 'Type-B player base');
  assert.equal(SHOT_HANDLERS[9], 0x253d52, 'Type-B player continuation');
  assert.equal(SHOT_HANDLERS[3], 0x253f56, 'Type-B option base');
  assert.equal(SHOT_HANDLERS[11], 0x253fe8, 'Type-B option continuation');
});

test('Type-B player shot survives entry 1, transitions to entry 9, and moves', () => {
  const r = new Ram();
  const rec = SHOT.p1Table;
  const prec = SHOT.p1Rec;
  const rom = romWindows([
    [0x24e512, [0x00, 0x24, 0xe5, 0x30]],
    [0x24e530, [0xfc, 0x00, 0xfe, 0x00, 0x08, 0x10, 0x00, 0x00]],
    [0x24e600, [0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22]],
  ]);
  r.setU16(rec, 0x8001);
  r.setU16(rec + S.posY, 0x4000);
  r.setU16(rec + S.posX, 0x2000);
  r.setU32(rec + S.animPtr, 0x24e600);
  r.setU16(rec + S.animIdx, 4);
  r.setU16(prec + 0x30, 0x0020);
  r.setU16(prec + 0x32, 0x0010);
  const ctx = { tables: { shotVector: () => ({ dy: -0x0100, dx: 0x0080 }) } };

  for (let frame = 0; frame < 4; frame++) {
    assert.equal(runShotDriver(r, rom, shotHandlers(), ctx), 1, `frame ${frame}`);
  }
  assert.equal(r.u16(rec) & 0x000f, 9, '`ori.w #$8` selects dispatch entry 9');
  assert.equal(r.u16(rec + S.posY), 0x3e20,
    'one carried frame followed by two velocity frames');
  assert.equal(r.u16(rec + S.posX), 0x2110);
  assert.equal(r.u32(rec + S.drawOff), 0xfc00fe00, '$24E512 normal block');
  assert.equal(r.u32(rec + S.dlWord23), 0x11111111, 'entry 9 advances the animation');
  assert.equal(r.u16(SPRQ.shotBucketCount), 4 * SPRQ.recordBytes);
  assert.notEqual(r.u16(rec), 0, 'the normal Type-B player shot remains live');
});

test('Type-B player hit uses $24E5EE and consumes MoveTables zoom flags', () => {
  const r = new Ram();
  const rec = SHOT.p1Table;
  const sounds = [];
  const rom = romWindows([
    [RNG.table, Array(256).fill(0)],
    [0x24e5ee, [0x00, 0x24, 0xe6, 0x20]],
    [0x24e620, [0xfc, 0x00, 0xfe, 0x00, 0x08, 0x10,
      0x00, 0x24, 0xe6, 0x40, 0x00, 0x00, 0x00, 0x08]],
    [0x24e640, [0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22]],
  ]);
  r.setU16(rec, 0x81c9);
  r.setU16(rec + S.posY, 0x2000);
  r.setU16(rec + S.posX, 0x1800);
  r.setU16(rec + S.velY, 0x0100);
  r.setU16(rec + S.velX, 0x0080);
  r.setU16(rec + S.tableIdx, 0);
  r.setU16(rec + S.power, 0);
  const requestedPowers = [];
  const syntheticFlags = new Map([[0, 0x8800a400], [0x0a, 0x9800b400]]);
  const ctx = {
    soundPost: (cue) => sounds.push(cue),
    tables: {
      typeBHitFlags(power) {
        requestedPowers.push(power);
        return syntheticFlags.get(power);
      },
    },
  };

  handler253D52(r, rom, rec, ctx, SHOT.p1Rec, 0xc9);
  assert.equal(r.u16(rec + S.posY), 0x2440,
    '$253DE0 adds $300, then the full and quartered velocities move the hit');
  assert.equal(r.u16(rec + S.posX), 0x18a0);
  assert.equal(r.u16(rec + S.velY), 0x0040);
  assert.equal(r.u16(rec + S.velX), 0x0020);
  assert.equal(r.u32(rec + S.drawOff), 0xfc00fe00, '$24E5EE hit block');
  assert.equal(r.u16(rec + S.animIdx), 4);
  assert.deepEqual(sounds, [0x28c714]);
  assert.equal((r.u32(SPRQ.shotBucket) & 0xf800fc00) >>> 0, syntheticFlags.get(0),
    'power 0 consumes the hit flags supplied by MoveTables');

  r.setU16(rec + S.power, 0x0a);
  handler253D52(r, rom, rec, ctx, SHOT.p1Rec, 0xc9);
  assert.equal(r.u16(rec + S.animIdx), 0, 'later hit steps the replacement animation');
  assert.equal(r.u16(rec + S.posY), 0x2480, 'later hits keep drifting');
  assert.equal(r.u16(SPRQ.shotBucketCount), 24);
  assert.equal((r.u32(SPRQ.shotBucket + 12) & 0xf800fc00) >>> 0,
    syntheticFlags.get(0x0a), 'power 10 consumes the final MoveTables entry');
  assert.deepEqual(requestedPowers, [0, 0x0a],
    'the runtime forwards the record power to the cartridge-backed accessor');
});

test('Type-B option shot survives entry 3 and transitions to entry 11', () => {
  const r = new Ram();
  const rec = SHOT.p1Table;
  const rom = romWindows([
    [0x25092c, [0x00, 0x25, 0x09, 0x40]],
    [0x250940, [0xfb, 0x00, 0xfd, 0x00, 0x06, 0x10]],
    [0x250960, [0x33, 0x33, 0x33, 0x33]],
  ]);
  r.setU16(rec, 0x8003);
  r.setU16(rec + S.posY, 0x3000);
  r.setU16(rec + S.posX, 0x2000);
  r.setU32(rec + S.animPtr, 0x250960);
  const ctx = { tables: { shotVector: () => ({ dy: -0x0100, dx: 0x0100 }) } };

  for (let frame = 0; frame < 3; frame++) {
    assert.equal(runShotDriver(r, rom, shotHandlers(), ctx), 1, `frame ${frame}`);
  }
  assert.equal(r.u16(rec) & 0x000f, 0x0b, '`ori.w #$8` selects dispatch entry 11');
  assert.equal(r.u16(rec + S.posY), 0x2e00);
  assert.equal(r.u16(rec + S.posX), 0x2200);
  assert.equal(r.u32(rec + S.drawOff), 0xfb00fd00, '$25092C normal block');
  assert.equal(r.u32(rec + S.dlWord23), 0x33333333);
  assert.equal(r.u16(SPRQ.shotBucketCount), 36);
  assert.notEqual(r.u16(rec), 0, 'the normal Type-B option shot remains live');
});

test('Type-B normal shot bounds use the cartridge $7800/$4800 and $7400/$4400 limits', () => {
  const aliveAt = (handler, y, x, vy = 0, vx = 0) => {
    const r = new Ram();
    const rec = SHOT.p1Table;
    r.setU16(rec, handler === handler253D52 ? 0x8049 : 0x814b);
    r.setU16(rec + S.posY, y); r.setU16(rec + S.posX, x);
    r.setU16(rec + S.velY, vy); r.setU16(rec + S.velX, vx);
    r.setU32(rec + S.animPtr, 0x240000); r.setU16(rec + S.animIdx, 4);
    const rom = romAt(0x240000, Array(8).fill(0));
    handler(r, rom, rec, {}, SHOT.p1Rec, r.u8(rec + S.lowByte));
    return r.u16(rec) !== 0;
  };
  assert.equal(aliveAt(handler253D52, 0x76ff, 0x3fff, 0x0100), true);
  assert.equal(aliveAt(handler253D52, 0x7700, 0x2000, 0x0100), false,
    'Type-B player Y == $7800 dies');
  assert.equal(aliveAt(handler253D52, 0x1000, 0x4000), false,
    'Type-B player X + $800 == $4800 dies');
  assert.equal(aliveAt(handler253D52, 0x1000, 0xf800), true,
    'Type-B player negative X survives the biased carry test');
  assert.equal(aliveAt(handler253FE8, 0x72ff, 0x3dff, 0x0100), true);
  assert.equal(aliveAt(handler253FE8, 0x7300, 0x2000, 0x0100), false,
    'Type-B option Y == $7400 dies');
  assert.equal(aliveAt(handler253FE8, 0x1000, 0x3e00), false,
    'Type-B option X + $600 == $4400 dies');
  assert.equal(aliveAt(handler253FE8, 0x1000, 0xfa00), true,
    'Type-B option negative X survives the biased carry test');
});

test('Type-B option hit uses $250DEA and does not drift on later hits', () => {
  const r = new Ram();
  const rec = SHOT.p1Table;
  const sounds = [];
  const rom = romWindows([
    [RNG.table, Array(256).fill(0)],
    [0x250dea, [0x00, 0x25, 0x0e, 0x20]],
    [0x250e20, [0xfb, 0x00, 0xfd, 0x00, 0x06, 0x10,
      0x00, 0x25, 0x0e, 0x40, 0x00, 0x00, 0x00, 0x08]],
    [0x250e40, [0x44, 0x44, 0x44, 0x44, 0x55, 0x55, 0x55, 0x55]],
  ]);
  r.setU16(rec, 0x81cb);
  r.setU16(rec + S.posY, 0x2000);
  r.setU16(rec + S.posX, 0x1800);
  r.setU16(rec + S.velY, 0x0100);
  r.setU16(rec + S.velX, 0x0080);
  r.setU16(rec + S.tableIdx, 0);
  const ctx = { soundPost: (cue) => sounds.push(cue) };

  handler253FE8(r, rom, rec, ctx, SHOT.p1Rec, 0xcb);
  assert.equal(r.u16(rec + S.posY), 0x2100);
  assert.equal(r.u16(rec + S.posX), 0x1880);
  assert.equal(r.u16(rec + S.velY), 0x0040);
  assert.equal(r.u16(rec + S.velX), 0x0020);
  assert.equal(r.u32(rec + S.drawOff), 0xfb00fd00, '$250DEA hit block');
  assert.equal(r.u16(rec + S.animIdx), 4);
  assert.equal((r.u32(SPRQ.shotBucket) & 0x80008000) >>> 0, 0x80008000,
    'option hit uses the ordinary $23F3AE emitter');
  assert.deepEqual(sounds, [0x28c714]);

  handler253FE8(r, rom, rec, ctx, SHOT.p1Rec, 0xcb);
  assert.equal(r.u16(rec + S.animIdx), 0);
  assert.equal(r.u16(rec + S.posY), 0x2100, 'later option hits do not drift');
  assert.equal(r.u16(rec + S.posX), 0x1880);
  assert.equal(r.u16(SPRQ.shotBucketCount), 24);
});

test('$253BDA takes the HIT path only on bit 7 of the type word\'s LOW byte', () => {
  const r = new Ram();
  const rec = 0x810812;
  r.setU16(rec, 0x8048);
  r.setU16(rec + S.posY, 0x1000);
  r.setU16(rec + S.velY, 0x100);
  r.setU32(rec + S.animPtr, 0x24d918);
  // W34: the first-hit arm reads three more tables -- the $2433AE draw table
  // (twice), the $24DEB2 pointer table, and the block behind the pointer.
  const rom = romWindows([
    [0x24d918, Array(32).fill(0)],              // the animation frames
    [0x2433d0, Array(64).fill(0)],              // $2433AE's canned longwords
    [0x24deb2, [0x00, 0x24, 0xde, 0xf0]],       // the pointer for tableIdx 0
    // The block is `move.l (A0)+,($6,A6) / move.w (A0)+,($E,A6) /
    // move.l (A0)+,($1E,A6) / move.l (A0)+,($22,A6)`, and that last LONGWORD
    // lands on ($22,A6) AND ($24,A6) -- the animation index.  Byte 12/13 =
    // $0010 so the index survives the `subq.w #4` that follows; with the block
    // all zeros the shot despawns on its own first hit, which is faithful and
    // makes the test about something else.
    [0x24def0, [0, 0, 0, 0, 0, 0,
      0x00, 0x24, 0xd9, 0x18,                   // ($1E,A6) = the anim pointer
      0, 0, 0x00, 0x10, 0, 0]],                 // ($22,A6)/($24,A6)
  ]);
  handler253BDA(r, rom, rec, {}, 0x8103e6, 0x48);       // bit 7 clear -> moves
  assert.equal(r.u16(rec + S.posY), 0x1100, '$253B9A add.w D0,($2,A6)');
  // W34.  With bit 7 SET this used to be a LOUD NAMED THROW at $253BDE,
  // because nothing could set the bit: $245044 is inside the collision pass
  // and the pass was a note.  Both are ported now, so the arm runs, and the
  // thing to assert is the fork `$253BDE bset #$1,(A6) / beq $253C10`: the
  // FIRST hit takes the long arm and every hit after it takes the short one.
  handler253BDA(r, rom, rec, {}, 0x8103e6, 0xc8);       // bit 1 CLEAR -> first hit
  assert.equal(r.u8(rec) & 0x02, 0x02, '$253BDE bset #$1,(A6) latched');
  // $253C90 `move.l (A0)+,($22,A6)` is a LONGWORD: it lands on ($22,A6) AND
  // ($24,A6), the animation index the very next instruction decrements.  The
  // block supplies $00000010, so after $253BE4's `subq.w #$4` the index is $C.
  // Read as a WORD it would leave whatever `body253B94` had left there, which
  // is why the assertion is the ABSOLUTE value and not a delta.
  assert.equal(r.u16(rec + S.animIdx), 0x0c,
    '$253C90 is a LONG, so ($24,A6) is $10 - 4');
  handler253BDA(r, rom, rec, {}, 0x8103e6, 0xc8);       // bit 1 SET -> later hit
  assert.equal(r.u16(rec + S.animIdx), 0x08,
    '$253BE4 subq.w #$4,($24,A6) on every hit after the first');
});

test('$253B9E is an UNSIGNED compare against $8000 and kills the record', () => {
  const r = new Ram();
  const rec = 0x810812;
  r.setU16(rec, 0x8048);
  r.setU16(rec + S.posY, 0x7f00);
  r.setU16(rec + S.velY, 0x0200);            // -> $8100, top bit set
  const rom = romAt(0x24d918, [0, 0, 0, 0]);
  r.setU32(rec + S.animPtr, 0x24d918);
  handler253BDA(r, rom, rec, {}, 0x8103e6, 0x48);
  assert.equal(r.u16(rec), 0, '$253B90 clr.w (A6)');
});

test('$253BAA kills on (X + $400) >= $4000 -- the SECOND add\'s carry', () => {
  const r = new Ram();
  const rec = 0x810812;
  const rom = romAt(0x24d918, [0, 0, 0, 0, 0, 0, 0, 0]);
  const put = (x) => {
    r.setU16(rec, 0x8048); r.setU16(rec + S.posY, 0x1000);
    r.setU16(rec + S.velY, 0); r.setU16(rec + S.velX, 0);
    r.setU16(rec + S.posX, x); r.setU32(rec + S.animPtr, 0x24d918);
    r.setU16(rec + S.animIdx, 4);
    handler253BDA(r, rom, rec, {}, 0x8103e6, 0x48);
    return r.u16(rec) !== 0;
  };
  assert.equal(put(0x3bff), true, '$3BFF + $400 = $3FFF: still alive');
  assert.equal(put(0x3c00), false, '$3C00 + $400 = $4000: carry, dead');
  assert.equal(put(0xfc00), true, '-$400 + $400 = 0: alive (this is the point '
    + 'of the +$400 bias -- a negative X is not a dead X)');
});

// ---------------------------------------------------------------- type 5
test('object type 5 is 23 subsystem calls and the port makes ONE of them', () => {
  assert.equal(TYPE5.calls.length, 23);
  assert.equal(TYPE5.calls[7], TYPE5.shotDriver);
  assert.equal(TYPE5.shotDriver, 0x253a70);
  assert.equal(new Set(TYPE5.calls).size, 23, 'no duplicate jsr targets');
});

// ---------------------------------------------------------------- the gate
test('the gate compares the shot records and REPORTS what it cannot claim', () => {
  for (const c of ['q6', 'scroll', 'p42', 'p44', 'shot1', 'shot2']) {
    assert.ok(CLAIMED.includes(c), `${c} must be a CLAIMED column`);
  }
  // ...and these two are traced but NOT claimed, on purpose -- see the comment
  // in src/state.js.  A test that pins the classification is what stops a later
  // wave from quietly moving a red column into the reported bucket.
  // WAVE 11 added three more, and they are pinned by NAME here for the same
  // reason: `b000`/`affe`/`affc` are call #4's budget arithmetic over ALL
  // THIRTY buckets, and the port has a producer for one of them. They are
  // compared byte-for-byte by `pgm.py dlgate`, which feeds the port the board's
  // staged bytes, and reported-not-claimed anywhere else.
  assert.deepEqual(REPORTED_COLUMNS, ['nshot', 'rng', 'b000', 'affe', 'affc']);
  for (const c of REPORTED_COLUMNS) assert.ok(!CLAIMED.includes(c));
  // the hit tap the gate fails on, and the wider one it only reports
  const ex = Object.fromEntries(EXEC_SPEC.map((e) => [e[0], e]));
  assert.equal(ex.hitex[1], 0x245044);
  assert.equal(ex.hitex[2], 0x810812);
  assert.equal(ex.hitex[3], 0x810a51, 'the TEN compared records, and no more');
  assert.equal(ex.hitany[2], 0x810572, 'the whole P1 table, reported only');
});

test('the player-record fields the spawn reads are the ROM\'s offsets', () => {
  assert.equal(PS.power, 0x20);       // $249C48 move.w ($20,A6),D0
  assert.equal(PS.animPhase, 0x42);   // $24A238 / $24A26E
  assert.equal(PS.animIdx, 0x44);     // $24A254 / $24A32E  <- the $24A2D6 tail
  assert.equal(PS.powerByte, 0x56);   // $24A24A move.b ($56,A6),(-$1,A0)
  assert.equal(PS.formation, 0x5a);   // $24A25A
  assert.equal(PS.soundGate, 0x3a);   // $249D04 / $249D0C
  assert.equal(S.animIdx, 0x24);      // ...into the shot's ($24,A6)
  assert.equal(S.dlWord5, 0x1c);      // and ($56,A6) lands in its LOW byte
});
