// WAVE 34 -- THE SIX CRASHES THAT WERE LIVE ON THE PUBLIC SITE.
//
// W33's sweep (docs/worklog/gradius/33-qa-shipped-throws.md) drove `nmi()` over
// every chunk of every stage the ledger printed RUNNABLE and found five throws
// besides W32c's `$BC44`. Three of them needed no player input at all. This
// suite is the evidence for the fixes and, more importantly, for the CLAIMS the
// fixes rest on -- every one of which is arithmetic on bytes read out of
// `assets/prg.bin`, not out of the port's own tables (docs/knowledge/03: two
// sides of a comparison must be independently derived).
//
// WHAT THIS SUITE CANNOT DO. There is still no cartridge comparison for any of
// this: no corpus scenario reaches stage 2's breakable walls or stage 3's arc
// enemies. Every number is PORT vs LISTING, which is what docs/knowledge/10
// says the guarantee has to rest on when the behaviour space cannot be sampled.
//
// The end-to-end sweep that FOUND all of this now lives in the gate as its own
// stage (`games/gradius/tools/test-all.mjs`, stage "stage sweep"), not here,
// because a gate stage is what a reader looks at.
//
// Mutation table: docs/worklog/gradius/34-impl-shipped-crashes.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, headlessResources } from './helpers.js';
import { u8, ENEMY_BASE } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { playerVsEnemies, shotSweep } from '../src/collision.js';

const res = headlessResources(0);
const prg = new Uint8Array(readFileSync(join(ASSETS, 'prg.bin')));
const rb = (a) => prg[a - 0x8000];

/** Seed the engine on stage `st`'s chunk `c`, exactly as the gate sweep does. */
export function seedChunk(st, c) {
  const rom = res.enemyTables;
  const tbl = rom.word(0xA7D0 + 2 * st);
  const ptr = rom.read(tbl + 2 * c) | (rom.read(tbl + 2 * c + 1) << 8);
  const s = bootState(res.manifest);
  s.zp19 = st;
  s.substate = 0x80;
  s.spawn.z60 = 2;
  s.spawn.z61 = 0;
  s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
  s.cam.hi = 0; s.cam.lo = 0;
  return s;
}

// =========================================================================
// #1  $B415 LDA $B42F,Y -- the five-entry schedule the ROM reads past.
//     Stages 3 and 4, frame 314, no input. W33's most severe finding.
// =========================================================================

test('$B42F/$B45C: the two schedules are 00 00 00 01 01, read out of prg.bin', () => {
  // The independent half of the derivation. If these five bytes were anything
  // else the "three left, two right, net one arc left" argument collapses and
  // so does everything built on it.
  // RED WHEN: export_assets.py cites either range at the wrong address.
  for (const base of [0xB42F, 0xB45C]) {
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => rb(base + k)),
      [0x00, 0x00, 0x00, 0x01, 0x01],
      `the schedule at $${base.toString(16).toUpperCase()}`);
  }
  // and $B200's, which is the CONTROL: four left and one right, not three and
  // two. This is the byte-level reason $B1C5 stops at Y = 4 on the cartridge
  // and $B415 does not.
  assert.deepEqual([0, 1, 2, 3, 4].map((k) => rb(0xB200 + k)),
    [0x00, 0x00, 0x01, 0x00, 0x00], '$B200, the schedule that does NOT overrun');
});

test('$B434/$B461: every byte the overrun can reach is NON-ZERO', () => {
  // The whole bound rests on this: past the schedule the direction flag is
  // always "fly RIGHT", so the enemy leaves through $B251's `CMP #$F4` and the
  // index cannot climb. A zero anywhere in here would mean "fly LEFT" and the
  // enemy could turn round and read further.
  // RED WHEN: nothing in src/ -- this is a fact about the cartridge, and it is
  // here so that a future wave that widens the export has to confront it.
  assert.deepEqual([0xB434, 0xB435, 0xB436].map(rb), [0xBD, 0x0C, 0x03],
    '$B434 is st_B434\'s own LDA $030C,X opcode');
  assert.deepEqual([0xB461, 0xB462, 0xB463].map(rb), [0xBD, 0x4C, 0x04],
    '$B461 is the orphaned routine\'s LDA $044C,X');
  for (const a of [0xB434, 0xB435, 0xB436, 0xB461, 0xB462, 0xB463]) {
    assert.notEqual(rb(a), 0, `$${a.toString(16).toUpperCase()} must be non-zero`);
  }
});

test('$B415: the export covers the read, and the port throws past the bound', () => {
  // The fix, stated as the two numbers it is: seven entries exported, a throw
  // at seven. W30 exported five and let assets.js say "$B434 is not in any
  // exported range" -- a crash report that names the wrong file for a read the
  // ROM makes on purpose.
  // RED WHEN: either range goes back to five bytes.
  const rom = res.enemyTables;
  const blk = (n) => rom.blocks.find((b) => b.name === n);
  assert.equal(blk('phaseB42F').bytes.length, 8, 'phaseB42F: 7 entries + 1 anchor byte');
  assert.equal(blk('phaseB45C').bytes.length, 8, 'phaseB45C: 7 entries + 1 anchor byte');
  for (let y = 0; y <= 6; y++) {
    assert.equal(rom.read(0xB42F + y), rb(0xB42F + y), `$B42F+${y}`);
    assert.equal(rom.read(0xB45C + y), rb(0xB45C + y), `$B45C+${y}`);
  }
});

test('$B402 END TO END: stage 3 survives its own chunk 0, and READS $B434', () => {
  // THE CHECK THAT WOULD HAVE CAUGHT THE SHIPPED BUG. 400 passive frames from
  // stage 3's chunk 0 -- no forced status, no shield, no input -- which is
  // exactly the run that threw at frame 314 before this wave.
  //
  // AND IT ASSERTS THE READ HAPPENED. A fix that quietly clamped $04AC at 4,
  // or that stopped the enemy before the schedule ran out, would also produce
  // 400 clean frames; what it would NOT produce is $046C holding $BD, which is
  // the byte at $B434 and can come from nowhere else on this path.
  // RED WHEN: arcTurn's bound goes back to 5; the schedule is truncated; the
  // arc length or the off-screen box changes so the enemy leaves sooner.
  const s = seedChunk(2, 0);
  let sawOverrun = 0, maxCounter = 0;
  for (let f = 0; f < 400; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    nmi(s, 0x00, res);                       // no buttons at all
    for (let k = 0; k < 10; k++) {
      const i = k + ENEMY_BASE;
      const t = s.obj.type[i] & 0x7F;
      if (t !== 0x0D && t !== 0x0E) continue;
      if (s.obj.s04A0[i] > maxCounter) maxCounter = s.obj.s04A0[i];
      if (s.obj.s04A0[i] >= 5 && s.obj.s0460[i] === rb(0xB42F + s.obj.s04A0[i])) {
        sawOverrun += 1;
      }
    }
  }
  assert.equal(maxCounter, 5, 'the arc counter reaches 5 -- past the five-entry '
    + 'schedule -- and the LISTING bound is 6, so the port is inside it');
  assert.ok(sawOverrun > 0, '$046C,X must hold the byte at $B434 ($BD) on at '
    + 'least one frame: that is the read, not an avoidance of it');
});

test('$B402: the arc is 34 frames and 66 px, which is why the net is one left', () => {
  // The arithmetic the bound is built on, measured through the real handler
  // rather than asserted in a comment. $B212 seeds yvel 2 and accel $20;
  // $B120 subtracts $20/256 a frame, so an integer step is 8 frames and the
  // flip at -3 ($B422 CMP #$FE) is 1 + 4*8 = 33 moving frames. $B1BC re-seeds
  // xvel to $FE every arc, so 33 moves is 66 px.
  // RED WHEN: the seed value, the accel, the flip threshold or the xvel move.
  const s = seedChunk(2, 0);
  const marks = [];       // [frame, x] at each arc boundary of slot 9
  let prev = -1;
  for (let f = 0; f < 400; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    nmi(s, 0x00, res);
    const i = 9 + ENEMY_BASE;
    if ((s.obj.type[i] & 0x7F) !== 0x0D) { prev = -1; continue; }
    const c = s.obj.s04A0[i];
    if (c !== prev) { marks.push([f, c, s.obj.x[i]]); prev = c; }
  }
  assert.ok(marks.length >= 4, `arc boundaries seen: ${marks.length}`);
  for (let n = 1; n < marks.length; n++) {
    assert.equal(marks[n][0] - marks[n - 1][0], 34,
      `arc ${marks[n - 1][1]} lasted ${marks[n][0] - marks[n - 1][0]} frames`);
    const dx = ((marks[n][2] - marks[n - 1][2]) << 24) >> 24;
    assert.equal(Math.abs(dx), 66, `arc ${marks[n - 1][1]} moved ${dx} px`);
  }
  // three left then two right: the sign flips exactly once, after entry 2.
  const signs = [];
  for (let n = 1; n < marks.length; n++) {
    signs.push(Math.sign(((marks[n][2] - marks[n - 1][2]) << 24) >> 24));
  }
  assert.deepEqual(signs.slice(0, 5), [-1, -1, -1, 1, 1],
    'LEFT LEFT LEFT RIGHT RIGHT -- the net is ONE arc left, so the enemy is '
    + 'still on screen when the schedule ends. $B200 is four left and one '
    + 'right, which is why $B1C5 stops at 4 on the cartridge.');
});

// =========================================================================
// #3  $C13D / $C159 -- types $27 and $29 touching the ship. Stages 1-4.
//     Stage 1 threw at frame 414 with the ship never moved.
// =========================================================================

/** A stage-1 play state with a pickup of `type` sitting on the ship. */
function onTheShip(type, digit) {
  const s = bootState(res.manifest);
  const i = 9 + ENEMY_BASE;
  s.obj.type[i] = type;                 // $030C,Y -- bit 7 CLEAR, but $C16E
  s.obj.x[i] = 100; s.obj.y[i] = 100;   // ANDs it off anyway, so both forms hit
  s.obj.s0460[9] = 0;                   // $0460,Y -- box class 0, 16 x 16
  s.obj.x[0] = 100; s.obj.y[0] = 100;
  s.score[5] = digit;                   // $07E5, player 1
  return s;
}

test('$C13D: type $27 is the EXTRA LIFE, and the score byte gates it', () => {
  // W33 §4b: stage 1 carries three $27 records ($A8F5, chunks 5-7) and the port
  // threw the first time one flew into a ship that had not moved.
  // RED WHEN: the arm is a throw again; the score test is dropped or inverted;
  // $20,X is not INCd; the metasprite is not $A3; the object is freed instead
  // of being turned into type 1.
  const even = onTheShip(0x27, 0x40);
  assert.equal(playerVsEnemies(even, res), false, 'the sweep must NOT die');
  assert.equal(even.lives[0], 4, '$C154 INC $20,X -- 3 lives became 4');
  assert.equal(even.obj.type[9 + ENEMY_BASE], 0x01, '$C14A STA $030C,Y');
  assert.equal(even.obj.anim[9 + ENEMY_BASE], 0xA3, '$C14F STA $012C,Y');

  // the ODD arm: $C146 BCS $C136 is a plain "next slot" and consumes nothing.
  const odd = onTheShip(0x27, 0x41);
  assert.equal(playerVsEnemies(odd, res), false);
  assert.equal(odd.lives[0], 3, 'an odd $07E5 pays nothing');
  assert.equal(odd.obj.type[9 + ENEMY_BASE], 0x27,
    'and leaves the object alone, so the next frame can try again');
});

test('$C159: type $29 pays $844B, always, with no score gate at all', () => {
  // RED WHEN: the arm is a throw again; the bonus is $8453's +$0001 or $845B's
  // +$0050 instead of $844B's +$0005; the metasprite is $A3 (that is $C13D's);
  // a score gate is copied across from $C13D.
  const s = onTheShip(0x29, 0x41);        // ODD -- must not matter here
  assert.equal(playerVsEnemies(s, res), false);
  assert.equal(s.obj.type[9 + ENEMY_BASE], 0x01, '$C15B STA $030C,Y');
  assert.equal(s.obj.anim[9 + ENEMY_BASE], 0xA1, '$C160 STA $012C,Y -- $A1, not $A3');
  // $844B is $9A = 5, i.e. +$000500 in the middle BCD byte.
  assert.equal(s.score[5], 0x46, '$07E5 was $41 and $844B adds 5');
  assert.equal(s.lives[0], 3, 'and $C159 has no INC $20,X');
});

test('$C13D/$C159 END TO END: stage 1 chunk 5, 600 frames, ship never moved', () => {
  // W33's repro, and it is the one that matters: the ship is left exactly where
  // bootState puts it, no buttons are pressed, and the $27 flies into it.
  // Before this wave that threw at frame 414.
  // RED WHEN: either arm throws again.
  const s = seedChunk(0, 5);
  let collected = -1, spawned = 0;
  const was = new Uint8Array(10);
  for (let f = 0; f < 600; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    // TWO INTERVENTIONS, LABELLED (docs/knowledge/09), and both are necessary
    // rather than convenient: MEASURED, an identical 1400-frame run without
    // the shield collects nothing, because $C1B8 kills the ship on an ordinary
    // enemy at f~200 and the sweep never gets as far as the $27. So this run
    // is evidence about the CODE under a forced state, not about how stage 1
    // plays. What it is NOT is a forced position: the ship sits exactly where
    // bootState puts it (80, 96) and no button is pressed.
    s.obj.status[0] = 1;
    s.zp.shield = 0xFF;
    nmi(s, 0x00, res);
    for (let k = 0; k < 10; k++) {
      const i = k + ENEMY_BASE;
      const t = s.obj.type[i] & 0x7F;
      if (t === 0x27) spawned += 1;
      // the collection is $C148/$C14D: type $27 -> type 1 with metasprite $A3,
      // in ONE frame and in that slot. Nothing else in the PRG writes $A3 into
      // $012C (grep: two sites, $C14D and $CE0E, and $CE0E is the ending).
      if (was[k] === 0x27 && s.obj.type[i] === 0x01 && s.obj.anim[i] === 0xA3
          && collected < 0) collected = f;
      was[k] = t;
    }
  }
  assert.ok(spawned > 0, 'stage 1 chunk 5 must SPAWN a type $27 ($A8F5, trig $34)');
  assert.ok(collected > 0, 'and the ship must actually COLLECT one -- 600 clean '
    + `frames alone would also be produced by never touching it (f=${collected})`);
});

test('$C16E: the two arms are tested BEFORE the shield and before $C1B8', () => {
  // Why no power-up state avoids these two: $C173/$C177 come first in the
  // dispatch, so a full shield does not stop them and neither does the
  // spawn-frame invulnerability that $C1B8 checks.
  // RED WHEN: the $27/$29 tests are moved below the `>= 3` arm.
  const s = onTheShip(0x27, 0x40);
  s.zp.shield = 0xFF;
  assert.equal(playerVsEnemies(s, res), false);
  assert.equal(s.lives[0], 4, 'a full shield does not block the pickup');
  assert.equal(s.zp.shield, 0xFF, 'and the pickup does not spend it');
  // and the ROM byte order, read independently out of prg.bin
  assert.deepEqual([0xC171, 0xC172, 0xC173, 0xC174, 0xC175, 0xC176,
                    0xC177, 0xC178, 0xC179, 0xC17A, 0xC17B, 0xC17C].map(rb),
    [0x29, 0x7F, 0xC9, 0x27, 0xF0, 0xC6, 0xC9, 0x29, 0xF0, 0xDE, 0xC9, 0x03],
    'AND #$7F / CMP #$27 / BEQ / CMP #$29 / BEQ / CMP #$03 -- in that order');
});

// =========================================================================
// #2  $C2DC -- the BREAKABLE WALL. Stage 2's signature mechanic: 227 field-2
//     cells across 42 of its 83 placed blocks, and shooting one threw.
// =========================================================================

test('$C39B/$C39F: the four masks and the four OR values, out of prg.bin', () => {
  // Independently derived twice over: the raw bytes, and the arithmetic they
  // are (mask k clears the 2-bit field at bit 2k; or[k] is k * $20).
  // RED WHEN: export_assets.py cites the range at the wrong address.
  const tbl = res.collisionTables;
  assert.deepEqual([0, 1, 2, 3].map((k) => rb(0xC39B + k)), [0xFC, 0xF3, 0xCF, 0x3F]);
  assert.deepEqual([0, 1, 2, 3].map((k) => rb(0xC39F + k)), [0x00, 0x20, 0x40, 0x60]);
  for (let k = 0; k < 4; k++) {
    assert.equal(tbl.read(0xC39B + k), (~(3 << (2 * k))) & 0xFF, `mask ${k}`);
    assert.equal(tbl.read(0xC39F + k), k * 0x20, `or ${k}`);
  }
});

/**
 * A stage-2 state with ONE breakable cell under a shot at (sx, sy).
 * Returns the state plus the address arithmetic done INDEPENDENTLY of $C32F's
 * scattered shifts: nametable base + tileRow * 32 + column.
 */
function oneBreakable(sx, sy, { stage = 1, sub = 0, page = 0 } = {}) {
  const s = bootState(res.manifest);
  s.zp19 = stage;
  s.cam.lo = 0; s.cam.hi = page;
  // $C3BF CMP #$01 / $C3C9 ADC #$0A -- a LASER probes 11 px to its RIGHT, so
  // the cell has to be placed where the PROBE lands, not where the sprite is.
  const px = sub === 1 ? u8(sx + 0x0B) : sx;
  const worldLo = u8(u8(px + 8) + s.cam.lo);        // $C3D3-$C3DB
  const tileRow = u8(sy + 0x14) >> 3;               // $C3E9
  const col = worldLo >> 3;
  const a0 = u8((worldLo & 0xF8) + (tileRow >> 2));
  const idx = (page & 1) * 256 + a0;
  s.coll[idx] = (2 << (2 * (tileRow & 3)))          // field = 2, BREAKABLE
              | (1 << (2 * ((tileRow + 1) & 3)));   // and a SOLID neighbour
  s.obj.anim[3 + 5] = 6;                            // object 8, an ordinary shot
  s.obj.animFrame[3 + 5] = sub;                     // 0 shot, 1 LASER, 3 missile
  s.obj.x[3 + 5] = sx; s.obj.y[3 + 5] = sy;
  const ntBase = (page & 1) === 0 ? 0x2000 : 0x2400;
  return { s, idx, tileRow, col, addr: ntBase + tileRow * 32 + col };
}

test('$C32F: the wall goes away, ONE nametable tile is queued, and the sfx fires', () => {
  // THE FIX. Before this wave every one of stage 2's 227 breakable cells threw
  // the first time a shot probed it -- first at frame 130, on 6 of 8 chunks.
  // RED WHEN: $C32F is a throw again; the map write is dropped or clears the
  // wrong field; the queue packet's address arithmetic changes; the sfx goes.
  const f = oneBreakable(0x18, 0x2C);
  const before = f.s.coll[f.idx];
  const cursor = f.s.vram.cursor;
  shotSweep(f.s, res);

  // (a) the 2-bit field is cleared and its NEIGHBOUR in the same byte is not
  assert.notEqual(before, 0, 'the fixture must actually place a breakable cell');
  assert.equal(f.s.coll[f.idx], before & (~(3 << (2 * (f.tileRow & 3))) & 0xFF),
    '$C393 AND $C39B,X / $C398 STA ($A0,X) -- only this cell');
  assert.notEqual(f.s.coll[f.idx], 0, 'and the solid neighbour SURVIVES, which '
    + 'is what makes this a mask and not a byte wipe');

  // (b) exactly one 5-byte packet: mode 1, addr hi, addr lo, $00, $FF
  const q = f.s.vram.q, c = cursor;
  assert.equal(f.s.vram.cursor, (c + 5) & 0xFF, '$0E advanced by five');
  assert.deepEqual([q[c], q[c + 1], q[c + 2], q[c + 3], q[c + 4]],
    [0x01, f.addr >> 8, f.addr & 0xFF, 0x00, 0xFF],
    `one tile blanked at $${f.addr.toString(16).toUpperCase()} -- derived here `
    + 'as ntBase + tileRow * 32 + column, which is NOT how $C353-$C36B spells it');

  // (c) the sound, and its stage fork
  assert.equal(f.s.sfx.at(-1), 0x03, '$C33E LDA #$03 on stage 2');
  const six = oneBreakable(0x18, 0x2C, { stage: 5 });
  shotSweep(six.s, res);
  assert.equal(six.s.sfx.at(-1), 0x04,
    '$C338 LDA #$04 / $C33A CPX #$05 -- stage 6 has its own break sound');

  // (d) page 6 of the map is nametable $2400, not $2000
  const p1 = oneBreakable(0x18, 0x2C, { page: 1 });
  shotSweep(p1.s, res);
  const d = p1.s.vram.q, k = 0;
  assert.equal((d[k + 1] << 8) | d[k + 2], p1.addr,
    '$C349 LDY $A1 / CPY #$05 -- map page $06 draws into NT $2400');
});

test('$C2DF: a shot is consumed by the wall it breaks, a LASER is not', () => {
  // $C2E1 LDA $0163,X / CMP #$01 / BEQ $C2ED. The laser goes THROUGH the hole
  // it just made and can break a second cell in the same sweep; a shot cannot.
  // RED WHEN: the subtype test is dropped, or reads $0123 instead of $0163.
  const shot = oneBreakable(0x18, 0x2C, { sub: 0 });
  shotSweep(shot.s, res);
  assert.equal(shot.s.obj.anim[3 + 5], 0, '$C2E8 LDA #$00 / JSR $C0BD');

  const laser = oneBreakable(0x18, 0x2C, { sub: 1 });
  shotSweep(laser.s, res);
  assert.equal(laser.s.obj.anim[3 + 5], 6, 'the laser survives its own hole');
  assert.equal(laser.s.coll[laser.idx] & 3, 0, 'and it DID break the cell');
});

test('$C2DC END TO END: stage 2, 1400 frames, fire held, walls actually break', () => {
  // W33's repro, in the gate's own shape. Before this wave the earliest throw
  // was frame 130 -- 2.2 seconds after entering the chunk.
  // RED WHEN: $C32F throws again, or stops changing the map.
  const s = seedChunk(1, 2);
  const field2 = () => {
    let n = 0;
    for (let i = 0; i < 512; i++) {
      for (let k = 0; k < 4; k++) if (((s.coll[i] >> (2 * k)) & 3) === 2) n += 1;
    }
    return n;
  };
  let broke = 0, peak = 0;
  for (let f = 0; f < 1400; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    s.obj.status[0] = 1; s.zp.shield = 0xFF;       // INTERVENTIONS, labelled
    const b = field2();
    if (b > peak) peak = b;
    nmi(s, (f % 3 === 0 ? 0x80 : 0x00) | (f % 60 < 30 ? 0x01 : 0x02), res);
    const a = field2();
    if (a < b) broke += b - a;
  }
  assert.ok(peak > 0, 'stage 2\'s streamed map must CONTAIN breakable cells');
  assert.ok(broke > 0, `and shooting must remove some (${broke} of a peak `
    + `${peak} on screen) -- 1400 clean frames alone would also be produced by `
    + 'never firing at one');
});
