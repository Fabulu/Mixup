// WAVE 20 -- the turret block and the two enemy prototype loaders.
//
// Synthetic RAM and a synthetic ROM window, so the suite runs on a tree with no
// cartridge. The board comparison is `tools/w20turretgate.mjs`.
//
// THE ONE THING THESE TESTS EXIST FOR that the gate cannot do: the gate can
// only see what the corpus contained. The corpus contains no frame where a
// turret's aim cadence reload is anything but 1, no frame where BOTH players
// are dead while an enemy is alive and the driver is running, and no prototype
// whose flags word has bit 15 CLEAR. Those three are asserted here, from the
// listing, and each one is a path the port would otherwise ship unexercised.

import test from 'node:test';
import assert from 'node:assert';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import { AIM, AimTables } from '../src/aim.js';
import { TURRET, TURRET_HANDLERS, turretStep, turretHandler } from '../src/turret.js';
import { PROTO, loadRecordProto, loadSubProto, loadOffsetPairs } from '../src/enemyproto.js';

function grab(fn) { try { fn(); } catch (e) { return e; } return null; }
const hex = (a) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');

// The aim tables, straight off the recon's dump (see tests/aim.test.js for the
// full arrays; here only what the two cores index).
const LUT64 = [
  0x00, 0x01, 0x01, 0x02, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x08, 0x09,
  0x09, 0x0a, 0x0a, 0x0b, 0x0b, 0x0c, 0x0c, 0x0d, 0x0d, 0x0e, 0x0e, 0x0f, 0x10,
  0x10, 0x11, 0x12, 0x12, 0x13, 0x14, 0x14, 0x15, 0x15, 0x16, 0x16, 0x17, 0x17,
  0x18, 0x19, 0x1a, 0x1a, 0x1b, 0x1b, 0x1c, 0x1c, 0x1d, 0x1e, 0x1f, 0x1f, 0x20,
  0x20, 0x21, 0x21, 0x22, 0x22, 0x23, 0x23, 0x24, 0x24, 0x25, 0x25, 0x26, 0x26,
  0x27, 0x27, 0x28, 0x28, 0x29, 0x2a, 0x2a, 0x2b, 0x2b, 0x2c, 0x2c, 0x2c, 0x2d,
  0x2d, 0x2d, 0x2e, 0x2e, 0x2e, 0x2f, 0x2f, 0x30, 0x30, 0x31, 0x31, 0x32, 0x32,
  0x33, 0x33, 0x34, 0x34, 0x35, 0x35, 0x36, 0x36, 0x36, 0x37, 0x37, 0x37, 0x38,
  0x38, 0x38, 0x39, 0x39, 0x39, 0x3a, 0x3a, 0x3a, 0x3b, 0x3b, 0x3b, 0x3c, 0x3c,
  0x3c, 0x3d, 0x3d, 0x3d, 0x3e, 0x3e, 0x3e, 0x3f, 0x3f, 0x3f, 0x40, 0x40,
];
const BASE64 = [128, 256, 128, 0, 384, 256, 384, 0];
const OPS64 = [0x2420ba, 0x2420ae, 0x2420ae, 0x2420ba,
               0x2420ae, 0x2420ba, 0x2420ba, 0x2420ae];

const SPEC = TURRET_HANDLERS.get(0x2688cc);          // type $11, gfx $268C9E

function romForTurret(extra = []) {
  const w1 = new Uint8Array(0x100);                  // $2420C0
  for (let i = 0; i < 8; i++) {
    const o = AIM.ops64 - 0x2420c0 + 4 * i;
    w1[o + 1] = (OPS64[i] >> 16) & 0xff;
    w1[o + 2] = (OPS64[i] >> 8) & 0xff; w1[o + 3] = OPS64[i] & 0xff;
    const b = AIM.base64 - 0x2420c0 + 2 * i;
    w1[b] = BASE64[i] >> 8; w1[b + 1] = BASE64[i] & 0xff;
  }
  w1.set(LUT64, AIM.lut64 - 0x2420c0);
  const w2 = new Uint8Array(0x100);                  // $242300, aim256's -- the
  for (let i = 0; i < 8; i++) {                      // constructor validates it
    const o = AIM.ops256 - 0x242300 + 8 * i;
    const enc = OPS64[i] === AIM.opSub64 ? 0x9240 : 0xd240;
    w2[o] = enc >> 8; w2[o + 1] = enc & 0xff;
  }
  // the 32-direction sprite table: entry n = $C0DE0000 | n, so a wrong index is
  // not merely "a different longword", it NAMES the index it read
  const gfx = new Uint8Array(0x80);
  for (let n = 0; n < 32; n++) {
    gfx[n * 4] = 0xc0; gfx[n * 4 + 1] = 0xde; gfx[n * 4 + 3] = n;
  }
  return new RomWindows({ windows: [
    { base: '$2420c0', len: 0x100, why: 'test', hex: hex(w1) },
    { base: '$242300', len: 0x100, why: 'test', hex: hex(w2) },
    { base: `$${SPEC.gfx.toString(16)}`, len: 0x80, why: 'test', hex: hex(gfx) },
    ...extra,
  ] });
}
const ROM = romForTurret();
const T = new AimTables(ROM);

const A5 = 0x81364c;                                  // the 48-slot band's slot 0
const A6 = 0x814600;                                  // a sub-record

/** A record with the type-$11 prototype's live fields, plus a live P1. */
function scene({ facing = 0, cad = 0, rel = 1, freeze = 0, y = 0x3000,
                 x = 0x2000, py = 0x5000, px = 0x2000, p1 = 0x8000,
                 p2 = 0x0000, targ = 0 } = {}) {
  const ram = new Ram();
  ram.setU16(TURRET.freezeGate, freeze);
  ram.setU16(AIM.selP1, p1); ram.setU16(AIM.selP1 + 2, py);
  ram.setU16(AIM.selP1 + 4, px);
  ram.setU16(AIM.selP2, p2);
  ram.setU8(A5 + 3, targ);
  ram.setU8(A5 + TURRET.cadenceOff, cad);
  ram.setU8(A5 + TURRET.reloadOff, rel);
  ram.setU8(A5 + TURRET.facingOff, facing);
  ram.setU32(A5 + TURRET.subOff, A6);
  ram.setU16(A6 + 2, y); ram.setU16(A6 + 4, x);
  return ram;
}

// ---------------------------------------------------------------- the cadence
test('$268A1A re-aims only on the frame ($18,A5) BORROWS', () => {
  // cadence 1 -> 0: decrement, no aim, facing untouched
  let ram = scene({ facing: 5, cad: 1 });
  let r = turretStep(T, ram, ROM, A5, SPEC);
  assert.equal(r.aimed, false);
  assert.equal(ram.u8(A5 + TURRET.cadenceOff), 0);
  assert.equal(ram.u8(A5 + TURRET.facingOff), 5, 'no aim frame must not turn');
  // cadence 0 -> borrow: aim, RELOAD from ($19,A5), facing steps ONE.
  // The scene puts the player straight below the muzzle (dy = +$1E00, dx = 0),
  // so the aim is direction 0 and the short way from 5 is DOWNWARD.
  ram = scene({ facing: 5, cad: 0, rel: 1 });
  r = turretStep(T, ram, ROM, A5, SPEC);
  assert.equal(r.aimed, true);
  assert.equal(r.dir, 0, 'straight below the muzzle is direction 0');
  assert.equal(ram.u8(A5 + TURRET.cadenceOff), 1, 'reloaded from ($19,A5)');
  assert.equal(ram.u8(A5 + TURRET.facingOff), 4, 'exactly one step, downward');
});

test('a reload of 3 makes the turret aim once every FOUR frames', () => {
  // No frame in either board corpus has ($19,A5) != 1 -- both turret types'
  // record prototypes hold $0101 -- so this path is listing-only and is
  // asserted here rather than shipped unexercised.
  const ram = scene({ facing: 5, cad: 3, rel: 3 });
  const aims = [];
  for (let f = 0; f < 12; f++) aims.push(turretStep(T, ram, ROM, A5, SPEC).aimed);
  assert.deepEqual(aims, [false, false, false, true, false, false, false, true,
    false, false, false, true]);
});

// ------------------------------------------------------------- the freeze gate
test('$8130D2 freezes the CADENCE as well as the aim -- it preserves phase', () => {
  const ram = scene({ facing: 5, cad: 1, freeze: 1 });
  const r = turretStep(T, ram, ROM, A5, SPEC);
  assert.equal(r.frozen, true);
  assert.equal(ram.u8(A5 + TURRET.cadenceOff), 1,
    'a frozen frame must NOT decrement the countdown');
  assert.equal(ram.u8(A5 + TURRET.facingOff), 5);
  // and the mutation the gate uses must actually change this
  const ram2 = scene({ facing: 5, cad: 1, freeze: 1 });
  turretStep(T, ram2, ROM, A5, SPEC, 'no-freeze-gate');
  assert.equal(ram2.u8(A5 + TURRET.cadenceOff), 0);
});

// -------------------------------------------------------------- the dead-player
test('both players dead: the RELOAD still happens, the aim does not', () => {
  // $268A20 (reload) is BEFORE $268A30 (aim) and $268A36 (bcs), so a frame on
  // which nobody is alive still consumes and re-arms the cadence. Getting this
  // backwards puts every turret one frame out of phase for the rest of its life
  // after a single player death -- and no board frame in either corpus has an
  // enemy aiming with both players dead, so only this test covers it.
  const ram = scene({ facing: 5, cad: 0, rel: 1, p1: 0x0000, p2: 0x0000 });
  const r = turretStep(T, ram, ROM, A5, SPEC);
  assert.equal(r.carry, true);
  assert.equal(r.aimed, false);
  assert.equal(ram.u8(A5 + TURRET.cadenceOff), 1, 'reloaded before the aim');
  assert.equal(ram.u8(A5 + TURRET.facingOff), 5, 'and did not turn');
});

test('a nominated-but-dead P2 is rescued onto P1 by $242722', () => {
  const alive = scene({ facing: 0, cad: 0, targ: 0 });
  turretStep(T, alive, ROM, A5, SPEC);
  const rescued = scene({ facing: 0, cad: 0, targ: 1 });   // nominate P2
  turretStep(T, rescued, ROM, A5, SPEC);
  assert.equal(rescued.u8(A5 + TURRET.facingOff),
    alive.u8(A5 + TURRET.facingOff), 'the fallback must reproduce the P1 aim');
});

// ------------------------------------------------------------- the sprite index
test('$268A54 indexes 32 entries with ((facing+1) & $3E) * 2', () => {
  // Every entry of the synthetic table is $C0DE00nn, so the longword NAMES the
  // index that was read -- a wrong shift shows as a wrong nn rather than as
  // "some other longword".
  const seen = new Set();
  for (const f of [0, 1, 2, 30, 31, 62, 63]) {
    const ram = scene({ facing: f, cad: 0 });
    turretStep(T, ram, ROM, A5, SPEC);
    const got = ram.u32(A5 + TURRET.gfxOff);
    const facing = ram.u8(A5 + TURRET.facingOff);
    assert.equal(got >>> 16, 0xc0de, 'must come out of the 32-entry table');
    assert.equal(got & 0xff, ((facing + 1) & 0x3e) / 2);
    assert.ok((got & 0xff) < 32, 'the index must stay inside 32 entries');
    seen.add(got & 0xff);
  }
  assert.ok(seen.size > 1, 'the facings chosen must not all map to one entry');
});

test('the two turret types differ ONLY in their sprite table', () => {
  const a = TURRET_HANDLERS.get(0x2688cc), b = TURRET_HANDLERS.get(0x268232);
  assert.equal(a.muzzleY, 0x200);
  assert.equal(b.muzzleY, 0x200);
  assert.notEqual(a.gfx, b.gfx);
  assert.equal(a.gfx, 0x268c9e);
  assert.equal(b.gfx, 0x268694);
});

test('dispatching a WHOLE handler is a LOUD NAMED THROW, not a quiet return', () => {
  const e = grab(() => turretHandler(A5, 0x2688cc));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x2688cc);
});

// ------------------------------------------------------- the prototype loaders
test('$26377A copies D0+1 WORDS to ($16,A5)', () => {
  const ram = new Ram();
  const bytes = new Uint8Array(0x40);
  for (let i = 0; i < 0x40; i++) bytes[i] = i;
  const rom = new RomWindows({ windows: [
    { base: '$268808', len: 0x40, why: 'test', hex: hex(bytes) }] });
  const end = loadRecordProto(ram, rom, A5, 0x268808, 0xf);   // moveq #$F
  assert.equal(end, 0x268808 + 32, 'D0+1 = 16 words');
  assert.equal(ram.u16(A5 + PROTO.recordOff), 0x0001);
  assert.equal(ram.u16(A5 + PROTO.recordOff + 30), 0x1e1f);
  assert.equal(ram.u16(A5 + PROTO.recordOff + 32), 0, 'and NOT one word more');
});

test('$2637A2 LONG form: 28 table bytes -> $20 record bytes, position untouched', () => {
  // Type $11's own prototype, byte for byte off the cartridge ($268828).
  const proto = [0xa2, 0x00, 0xfa, 0x00, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00,
                 0x06, 0x20, 0x04, 0x80, 0x06, 0x00, 0x04, 0x40, 0x04, 0x40,
                 0x00, 0x38, 0x04, 0x10, 0x00, 0x15, 0x00, 0x00];
  const rom = new RomWindows({ windows: [
    { base: '$268828', len: proto.length, why: 'test',
      hex: hex(Uint8Array.from(proto)) }] });
  const ram = new Ram();
  ram.setU16(A6 + 2, 0x1234); ram.setU16(A6 + 4, 0x5678);   // the POSITION
  ram.setU16(A5 + PROTO.runLenOff, 0);                      // run length 1
  const end = loadSubProto(ram, rom, A5, A6, 0x268828);
  assert.equal(end, 0x268828 + 28, 'the long form consumes 28 bytes');
  assert.equal(ram.u16(A6 + 0x00), 0xa200, 'the flags word');
  assert.equal(ram.u16(A6 + 0x02), 0x1234, 'position is SKIPPED, not zeroed');
  assert.equal(ram.u16(A6 + 0x04), 0x5678);
  assert.equal(ram.u16(A6 + 0x06), 0xfa00);
  assert.equal(ram.u16(A6 + 0x0e), 0x0620);
  // census §2's decode of THIS prototype: +$10..+$16 are the four hitbox
  // half-extents, +$18 HP, +$1A speed index, +$1B heading, +$1D palette.
  assert.deepEqual([ram.u16(A6 + 0x10), ram.u16(A6 + 0x12),
    ram.u16(A6 + 0x14), ram.u16(A6 + 0x16)], [0x0480, 0x0600, 0x0440, 0x0440],
  'the four hitbox half-extents');
  assert.equal(ram.u16(A6 + 0x18), 0x0038, 'HP = 56');
  assert.equal(ram.u8(A6 + 0x1a), 0x04, 'speed index');
  assert.equal(ram.u8(A6 + 0x1b), 0x10, 'heading -- the INITIAL turret facing');
  assert.equal(ram.u8(A6 + 0x1d), 0x15, 'palette');
  assert.equal(ram.u16(A6 + 0x1e), 0x0000);
});

test('$2637A2 SHORT form ($2637AA bpl): 16 table bytes, and it sets bit 15', () => {
  // THE CORRECTION TO 20-recon-enemy-census §2, which transcribes only the long
  // form and calls it "exactly $20 bytes per sub-record". The word just copied
  // is TESTED, and a prototype with bit 15 CLEAR takes a completely different
  // path: `bset #$7,(-$2,A1)`, two longs, a word, THREE ZERO LONGS, one long.
  // No stage-1 type this wave touches uses it, so the board corpus cannot see
  // it -- which is exactly why it is asserted here.
  const proto = [0x12, 0x34,                          // flags, bit 15 CLEAR
                 0xaa, 0xbb, 0xcc, 0xdd,              // long 1
                 0x11, 0x22, 0x33, 0x44,              // long 2
                 0x55, 0x66,                          // word
                 0x77, 0x88, 0x99, 0x00];             // the LAST long
  const rom = new RomWindows({ windows: [
    { base: '$260000', len: proto.length, why: 'test',
      hex: hex(Uint8Array.from(proto)) }] });
  const ram = new Ram();
  ram.setU16(A5 + PROTO.runLenOff, 0);
  const end = loadSubProto(ram, rom, A5, A6, 0x260000);
  assert.equal(end, 0x260000 + 16, 'the short form consumes SIXTEEN bytes');
  assert.equal(ram.u16(A6 + 0x00), 0x9234, 'bit 15 is SET by $2637C2');
  assert.equal(ram.u32(A6 + 0x06), 0xaabbccdd);
  assert.equal(ram.u32(A6 + 0x0a), 0x11223344);
  assert.equal(ram.u16(A6 + 0x0e), 0x5566);
  assert.equal(ram.u32(A6 + 0x10), 0, 'three zero longwords');
  assert.equal(ram.u32(A6 + 0x14), 0);
  assert.equal(ram.u32(A6 + 0x18), 0);
  assert.equal(ram.u32(A6 + 0x1c), 0x77889900);
});

test('$2637A2 walks ($4,A5)+1 sub-records at a $20 stride, form by form', () => {
  const long = [0xa2, 0x00, 0xfa, 0x00, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x06, 0x20, 0x04, 0x80, 0x06, 0x00, 0x04, 0x40, 0x04, 0x40,
                0x00, 0x38, 0x04, 0x10, 0x00, 0x15, 0x00, 0x00];
  const short = [0x12, 0x34, 0xaa, 0xbb, 0xcc, 0xdd, 0x11, 0x22, 0x33, 0x44,
                 0x55, 0x66, 0x77, 0x88, 0x99, 0x00];
  const proto = [...long, ...short];
  const rom = new RomWindows({ windows: [
    { base: '$260000', len: proto.length, why: 'test',
      hex: hex(Uint8Array.from(proto)) }] });
  const ram = new Ram();
  ram.setU16(A5 + PROTO.runLenOff, 1);              // TWO sub-records
  const end = loadSubProto(ram, rom, A5, A6, 0x260000);
  assert.equal(end, 0x260000 + 44, '28 + 16 -- the two forms MIX in one walk');
  assert.equal(ram.u16(A6 + 0x00), 0xa200);
  assert.equal(ram.u16(A6 + PROTO.subStride), 0x9234,
    'the second sub-record starts exactly $20 bytes on, whichever form ran');
});

test('the two unused prototype loaders throw by address', () => {
  const e = grab(loadOffsetPairs);
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, PROTO.loadOffsets);
});
