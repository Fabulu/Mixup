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
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import { SPRQ, enqueueShotSprite } from '../src/spritequeue.js';
// WAVE 11: the counter reset is now the TAIL of main-loop call #4, not the only
// part of it the port models -- src/displaylist.js.
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import { RNG, draw } from '../src/rng.js';
import { S, PS, PLAYER_SLOTS, shotHandlers, handler253BDA } from '../src/shots.js';
import { SHOT, SHOT_HANDLERS } from '../src/weapons.js';
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

test('ordinary and hyper shot base/continuation entries are registered', () => {
  const h = shotHandlers();
  assert.deepEqual([...h.keys()].sort(),
    [0x253b1e, 0x253bda, 0x253e34, 0x253ec6,
      0x254078, 0x254136, 0x2541bc, 0x25427a,
      0x254300, 0x2543a4, 0x25442a, 0x2544ce].sort());
  // dispatch entries 0, 8, 2 and 10 -- the four low nibbles wave 5 measured
  for (const [i, a] of [[0, 0x253b1e], [8, 0x253bda], [2, 0x253e34], [10, 0x253ec6]]) {
    assert.equal(SHOT_HANDLERS[i], a, `$253ADE[${i}]`);
  }
  for (const [i, a] of [[4, 0x254078], [12, 0x254136],
    [5, 0x2541bc], [13, 0x25427a], [6, 0x254300], [14, 0x2543a4],
    [7, 0x25442a], [15, 0x2544ce]]) {
    assert.equal(SHOT_HANDLERS[i], a, `$253ADE[${i}] hyper shot`);
  }
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
