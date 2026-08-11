// W316: stage-5 type $45, the first of the fifteen and the biggest by record count.
//
// What is worth asserting is not that it runs -- it is the four things a transcription of a
// four-state machine gets wrong: that the state tests are independent and fall through, that the
// ramp at `($1E,A5)` is also the sprite index, that the burst fires at a STORED angle rather than
// re-aiming every shot, and that the death arm goes through the impact kind W312 added.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { AimTables } from '../src/aim.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const HANDLER = 0x270e36;
const INITBODY = 0x270dd8;
const SPRITES = 0x27100c;
const A5 = 0x8137c0;              // a scratch enemy record, clear of the live table
const A6 = 0x8139c0;              // its sub-record

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);                     // the sub-record pointer
  ram.setU16(A6 + 0x02, 0x2000);                 // X, comfortably on screen and above $1400
  ram.setU16(A6 + 0x04, 0x2000);                 // Y
  ram.setU16(A6 + 0x18, 0x0100);                 // HP, positive
  const bullets = [];
  return {
    ram,
    log,
    bullets,
    ctx: {
      tables: HAVE ? new AimTables(ROM) : null, rom: ROM,
      unported: log, unportedLog: log, notes: log,
      bulletSpawn: (site, res) => bullets.push({ site, res }),
      soundPost: () => {},
    },
  };
}
const run = (f) => handlerMap().get(HANDLER)(f.ram, ROM, A5, f.ctx);

// ==================== 1. IT IS REGISTERED, BOTH HALVES

test('W316 type $45\'s handler and init body are both registered', { skip: SKIP }, () => {
  // A handler without its init body spawns a record the ROM never filled; `dojcoverage.py`'s
  // inventory check requires BOTH, which is what W315 learned the hard way.
  assert.ok(HANDLER_ADDRESSES.includes(HANDLER), 'the handler');
  assert.ok(INIT_BODY_ADDRESSES.includes(INITBODY), 'and the init body');
});

test('W316 the type table names exactly these two addresses', { skip: SKIP_IMG }, () => {
  // `$27E412 + ($45 & $7F) * 8` -- type $45 is in the HIGH table's low half because `$45 < $80`
  // puts it in the LOW table. Read it rather than trusting the census.
  const off = 0x45 * 8;
  assert.equal(IMG.readUInt32BE(0x267824 + off), 0x270dd0, 'the init stub');
  assert.equal(IMG.readUInt32BE(0x267824 + off + 4), HANDLER, 'and the handler');
  assert.equal(0x270dd0 + 8, INITBODY, 'and init + 8 is the body, as $26361A does');
  assert.equal(IMG.readUInt16BE(0x270dd0 + 2), 0, 'run length zero');
});

// ==================== 2. THE BOUNDS TEST IS SIGNED AND ON THE SUB-RECORD

test('W316 an X at or below -$800 frees the record', { skip: SKIP }, () => {
  // `cmpi.w #-$800,($2,A6) / bgt` -- SIGNED, and on the SUB-record's X rather than the record's.
  // An unsigned reading frees nothing, because $F800 is large unsigned.
  for (const x of [0xf800, 0xf000, 0x8000]) {
    const f = world();
    f.ram.setU16(A6 + 0x02, x);
    f.ram.setU16(A5, 0x8045);
    run(f);
    assert.equal(f.ram.u16(A5), 0, `X $${x.toString(16)} is off-screen`);
  }
  const on = world();
  on.ram.setU16(A6 + 0x02, 0xf801);
  on.ram.setU16(A5, 0x8045);
  run(on);
  assert.notEqual(on.ram.u16(A5), 0, 'and -$7FF is still on');
});

// ==================== 3. THE STATE TESTS FALL THROUGH

test('W316 states 0 and 1 both advance in ONE frame', { skip: SKIP }, () => {
  // Four independent ascending `cmpi.b`s, not a switch. State 0 setting state 1 at `$270EE0` is
  // re-read at `$270EE6` on the same frame, so a delay of one in each counter walks two states in
  // one call. A port using a switch would take two frames per step.
  const f = world();
  f.ram.setU8(A5 + 0x17, 0);
  f.ram.setU8(A5 + 0x1a, 0);            // due8 fires on an ALREADY-zero counter
  f.ram.setU8(A5 + 0x1b, 4);
  f.ram.setU8(A5 + 0x1c, 0);
  f.ram.setU8(A5 + 0x1d, 4);
  run(f);
  assert.ok(f.ram.u8(A5 + 0x17) >= 1, 'it left state 0');
  assert.equal(f.ram.u16(A5 + 0x1e), 4, 'and state 1 already ramped, in the same frame');
});

test('W316 the ramp clamps at $1C and only then aims', { skip: SKIP }, () => {
  // `addq.w #4` then `cmpi.w #$1C / blt` -- the aim happens on the frame the ramp REACHES the
  // clamp, not on every frame of the climb, and `move.w #$1C` pins it there.
  const f = world();
  f.ram.setU8(A5 + 0x17, 1);
  f.ram.setU16(A5 + 0x1e, 0x18);
  f.ram.setU8(A5 + 0x1c, 0);
  f.ram.setU8(A5 + 0x1d, 4);
  f.ram.setU16(0x8103e6, 0x8000);       // P1 alive, so the aim can resolve
  f.ram.setU16(0x8103e6 + 2, 0x2000);
  f.ram.setU16(0x8103e6 + 4, 0x2000);
  run(f);
  assert.equal(f.ram.u16(A5 + 0x1e), 0x1c, 'clamped');
  assert.equal(f.ram.u8(A5 + 0x17), 2, 'and it advanced to state 2');
  assert.equal(f.ram.u8(A5 + 0x26) & ~0x3c, 0, 'the stored angle is masked to $3C');
  assert.equal(f.ram.u16(A5 + 0x22), 3);
  // The burst counters load as `move.w #$808,($20,A5)`, `#$3,($22,A5)`, `#$3,($24,A5)` -- and
  // then STATE 2's ARM RUNS ON THE SAME FRAME, so `($20,A5)` is already one lower than the
  // literal. That is the fall-through, and it is why the pair is asserted as $0708 and not $0808.
  //
  // Two byte fields per word literal, the W273 lesson: `move.w #$3,($24,A5)` puts ZERO in the
  // byte at $24 and the 3 in its reload at $25. So `tst.b ($24,A5)` is false immediately and the
  // `($20,A5)` arm is the one that runs -- which is exactly what the $0708 shows.
  assert.equal(f.ram.u8(A5 + 0x24), 0, 'the byte at $24 is the literal LOW half: zero');
  assert.equal(f.ram.u8(A5 + 0x25), 3, 'and $25 is its reload');
  assert.equal(f.ram.u16(A5 + 0x20), 0x0708, 'state 2 already ticked ($20,A5) in this frame');
});

// ==================== 4. THE SPRITE INDEX *IS* THE RAMP

test('W316 the drawn sprite is `$27100C[($1E,A5)]`', { skip: SKIP }, () => {
  // Eight longwords and the ramp moves 0..$1C in steps of 4, so the ramp is the frame counter for
  // an open-and-close animation. Two of the four states exist only to drive it.
  for (const idx of [0, 4, 0x0c, 0x1c]) {
    const f = world();
    f.ram.setU8(A5 + 0x17, 4);          // a state past every arm, so only the draw runs
    f.ram.setU16(A5 + 0x1e, idx);
    run(f);
    // The emitter's bucket-0 record carries the art long at +4.
    assert.equal(f.ram.u32(0x80397c + 4), ROM.u32(SPRITES + idx),
      `ramp $${idx.toString(16)} draws entry ${idx / 4}`);
  }
});

test('W316 a ramp off the four-step grid throws rather than reading past the table',
  { skip: SKIP }, () => {
    // Nothing in the ROM bounds `adda.w ($1E,A5),A0`; the two ramp arms are what keep it on the
    // grid. If a future wave writes that field from somewhere else, this says so.
    for (const bad of [2, 0x20, 0x1e]) {
      const f = world();
      f.ram.setU8(A5 + 0x17, 4);
      f.ram.setU16(A5 + 0x1e, bad);
      assert.throws(() => run(f), /the ramp moves/, `$${bad.toString(16)}`);
    }
  });

// ==================== 5. THE BURST FIRES AT A STORED ANGLE

test('W316 the burst uses `($26,A5)`, not a fresh aim per shot', { skip: SKIP }, () => {
  // `$270F8A move.b ($26,A5),D1` -- the angle was stored once when the ramp clamped, and only
  // `$270FA8` refreshes it, when `($24,A5)` runs out. Re-aiming every shot would make the fan
  // track the player instead of sweeping.
  const f = world();
  f.ram.setU8(A5 + 0x17, 2);
  f.ram.setU8(A5 + 0x26, 0x24);
  f.ram.setU8(A5 + 0x24, 3);
  f.ram.setU8(A5 + 0x22, 0);            // due8 fires
  f.ram.setU8(A5 + 0x23, 3);
  run(f);
  assert.equal(f.bullets.length, 1, 'one shot');
  assert.equal(f.bullets[0].site, 0x270f96);
  assert.equal(f.ram.u8(A5 + 0x26), 0x24, 'and the angle is unchanged');
  assert.equal(f.ram.u8(A5 + 0x24), 2, 'while the refresh counter ticked');
});

test('W316 state 2 drops to state 3 below X $1400, and 3 runs in the SAME frame',
  { skip: SKIP }, () => {
    // `cmpi.w #$1400,($2,A6) / bge $270F58` sets state 3, the burst arm still fires on the way
    // out, and then STATE 3'S ARM RUNS TOO -- with the ramp already at zero it goes straight to
    // state 4. Three states in one frame, which is what four independent ascending `cmpi.b`s buy.
    // My first draft expected state 3 and found 4.
    const f = world();
    f.ram.setU8(A5 + 0x17, 2);
    f.ram.setU16(A6 + 0x02, 0x1000);
    f.ram.setU8(A5 + 0x24, 1);
    f.ram.setU8(A5 + 0x22, 0);
    f.ram.setU8(A5 + 0x23, 3);
    f.ram.setU8(A5 + 0x1c, 0);           // so state 3's delay also fires
    f.ram.setU16(A5 + 0x1e, 0);          // and its ramp is already down
    run(f);
    assert.equal(f.bullets.length, 1, 'it still fired on the way out of state 2');
    assert.equal(f.ram.u8(A5 + 0x17), 4, 'and state 3 completed in the same frame');

    // With state 3's delay NOT due, it stops at 3 -- which is the control for the above.
    const g = world();
    g.ram.setU8(A5 + 0x17, 2);
    g.ram.setU16(A6 + 0x02, 0x1000);
    g.ram.setU8(A5 + 0x1c, 5);
    run(g);
    assert.equal(g.ram.u8(A5 + 0x17), 3, 'state 3, waiting');
  });

test('W316 state 3 ramps back DOWN to zero and then to state 4', { skip: SKIP }, () => {
  const f = world();
  f.ram.setU8(A5 + 0x17, 3);
  f.ram.setU16(A5 + 0x1e, 4);
  f.ram.setU8(A5 + 0x1c, 0);
  f.ram.setU8(A5 + 0x1d, 4);
  run(f);
  assert.equal(f.ram.u16(A5 + 0x1e), 0, 'back to zero');
  assert.equal(f.ram.u8(A5 + 0x17), 4, 'and done');
});

// ==================== 6. THE DAMAGE AND DEATH ARMS

test('W316 a hit flashes the palette byte by XOR, not by assignment', { skip: SKIP }, () => {
  // `$270E6A eor.b D2,D0` on `($1D,A6)` against `($19,A5)`. An assignment would make the flash
  // permanent; the XOR is what makes it alternate while the hit bit keeps being set.
  const f = world();
  f.ram.setU8(A6, 0x04);                // a bit inside the $5C mask
  f.ram.setU8(A5 + 0x18, 0x10);
  f.ram.setU8(A5 + 0x19, 0x03);
  f.ram.setU8(A6 + 0x1d, 0x10);
  f.ram.setU8(A5 + 0x17, 4);
  run(f);
  assert.equal(f.ram.u8(A6 + 0x1d), 0x13, '$10 ^ $03');
  assert.equal(f.ram.u8(A6) & 0x5c, 0, 'and the hit bits were cleared with $A3');
});

test('W316 no hit RESTORES the palette byte from `($18,A5)`', { skip: SKIP }, () => {
  // `$270EC2 move.b ($18,A5),($1D,A6)` -- the else arm, which is what ends the flash.
  const f = world();
  f.ram.setU8(A6, 0x00);
  f.ram.setU8(A5 + 0x18, 0x10);
  f.ram.setU8(A6 + 0x1d, 0x77);
  f.ram.setU8(A5 + 0x17, 4);
  run(f);
  assert.equal(f.ram.u8(A6 + 0x1d), 0x10);
});

test('W316 death goes through the impact kind W312 added, then frees', { skip: SKIP }, () => {
  // `$270EAE moveq #$8,D0 / $270EB4 jsr $27F8F0` is `allocPoolA27F8F0` at kind $08 -- one of the
  // two hooks W312 ported four waves ago. Without it this arm would throw, so the order those
  // waves landed in was load-bearing.
  const f = world();
  f.ram.setU16(A5, 0x8045);
  f.ram.setU8(A6, 0x04);                // a hit, so the HP test is reached
  f.ram.setU16(A6 + 0x18, 0x8000);      // HP negative -> dead
  f.ram.setU8(A5 + 0x17, 4);
  const before = f.ram.u16(0x817f7e);   // POOL_A.liveCount
  run(f);
  assert.equal(f.ram.u16(A5), 0, 'the record was freed');
  assert.equal(f.ram.u16(0x817f7e), before + 1, 'and an impact was allocated');
});

test('W316 a positive HP does NOT die', { skip: SKIP }, () => {
  // `tst.w ($18,A6) / bpl` -- the SIGN, so $7FFF is alive and $8000 is not.
  const f = world();
  f.ram.setU16(A5, 0x8045);
  f.ram.setU8(A6, 0x04);
  f.ram.setU16(A6 + 0x18, 0x7fff);
  f.ram.setU8(A5 + 0x17, 4);
  run(f);
  assert.notEqual(f.ram.u16(A5), 0, 'still live');
});

// ==================== 7. THE WINDOWS ARE BOUNDED BY CODE

test('W316 both ROM windows end where the next routine begins', { skip: SKIP_IMG }, () => {
  // `$270E08 + $2E == $270E36`, the handler, and `$27100C + $20 == $27102C`, type $46's init. So
  // neither extent is a guess and neither can grow into code without breaking here.
  assert.equal(0x270e08 + 0x2e, HANDLER);
  assert.equal(SPRITES + 0x20, 0x27102c);
  assert.equal(IMG.readUInt16BE(HANDLER), 0x0c6e, 'the handler opens with cmpi.w');
  assert.equal(IMG.readUInt16BE(0x27102c), 0x3b7c, 'and $27102C is an init stub');
  // The record prototype is NINE words and ends exactly where the sub prototype starts.
  assert.equal(0x270e08 + 9 * 2, 0x270e1a);
  assert.equal(IMG.readUInt16BE(0x270dea), 0x7008, 'moveq #$8,D0 -- D0+1 = nine');
});

test('W316 the init body is dispatched by address', { skip: SKIP }, () => {
  // `initbody.js` keeps its registry private and exposes only the address list, so the body's
  // dispatch is `initbody.test.js`'s business. What matters here is that the address the type
  // table names is the one registered -- a body under the wrong key runs for the wrong type.
  assert.ok(INIT_BODY_ADDRESSES.includes(INITBODY));
  assert.equal(INIT_BODY_ADDRESSES.filter((a) => a === INITBODY).length, 1, 'exactly once');
});
