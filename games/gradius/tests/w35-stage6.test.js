// Wave 35 tests -- STAGE 6 (`$19 = 5`): `$B480` (dispatch entry 26), `$C6DE`
// (`jt_$C439[5]`), `$CDA5` (the stage-end exit aperture), `$99C4` (the `$83`
// shortcut) and `$C099` (the type-`$9A` multi-hit counter).
//
// WHAT THIS SUITE IS GUARDING, stated once so the individual checks read as
// consequences of it:
//
//  1. `$B480` IS A THREE-PHASE CYCLE AND THE DISPATCH IS A DOUBLE `DEY`, so
//     phase 0 and phase 1 land on the SAME arm and only phase 2 branches away.
//     A port written as `switch (phase)` passes every timing check and takes
//     the wrong arm the one frame the creature re-aims.
//  2. THE TWO RANK ROWS ARE SEVEN ENTRIES EACH, `$B4E4` and `$B4EB`, and the
//     second ends one byte before dispatch entry 27's opcode. `$17` is bounded
//     at 5 by its only writer (`$9C45`, and `$45` is capped at 2 by
//     `$89D3 CMP #$02 / BCS`), so entry 6 is transcribed and unreachable and
//     entry 7 does not exist. Nothing here clamps the rank.
//  3. `$C6DE` FILLS AN ENEMY-BULLET SLOT, not the enemy slot the late spawner
//     cleared for it -- the only one of the seven arms that does.
//  4. `$CDA5` IS NOT A FIVE-LINE HOOK. It is a bound test and TWO `JSR $CDB3`,
//     and `$CDB3` is 40 instructions with a 92-byte table behind it.
//  5. `$99CF` FALLS INTO `$99D3`. The stage-6/7 shortcut still runs the tail.
//
// EVERY CHECK BELOW WAS WATCHED TO GO RED under the named mutant on its
// `RED WHEN` line, and the touched sources were sha256'd before and after every
// restore. The mutation table is in docs/worklog/gradius/35-impl-stage6.md.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { updateEnemies, spawnEngine } from '../src/enemies.js';
import { shotSweep } from '../src/collision.js';
import { sub_CDA5 } from '../src/collision.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const SLOT = 9;
const I = SLOT + ENEMY_BASE;
const BULLET = 0x16;                 // enemy-bullet object index = $16 + slot

// ======================= ENTRY 26, $B480 ===================================

/** One type-`$1A`/`$9A` creature in slot 9, well inside `$B251`'s box. */
function cell(initialised, { rank = 0, x = 0x80, y = 0x60 } = {}) {
  const s = createState();
  s.substate = 0x80;
  s.zp19 = 5;
  s.zp17 = rank;
  s.spawn.zA8 = SLOT;
  s.obj.type[I] = initialised ? 0x9A : 0x1A;
  s.obj.x[I] = x;
  s.obj.y[I] = y;
  s.obj.status[I] = 0;               // no $ADC1 status animator in the way
  s.obj.x[0] = 0x20; s.obj.y[0] = 0x80;   // the ship, for $BCB5's aim
  return s;
}

test('$B480 init: $B0B4 sets bit 7, phase := 2, dwell := $B4E4[rank]', () => {
  // $B480 LDA $030C,X / BMI $B496 -- the uninitialised arm. $B485 JSR $B0B4,
  // $B488 LDA #$02 / STA $048C,X, $B48D LDY $17 / LDA $B4E4,Y / STA $04CC,X.
  // It moves NOTHING on that frame ($B495 RTS, no $B251).
  // RED WHEN: the init writes phase 0 (the creature then re-aims on its first
  // frame instead of drifting), or reads $B4EB instead of $B4E4.
  for (const rank of [0, 1, 2, 3, 4, 5]) {
    const s = cell(false, { rank });
    updateEnemies(s, res);
    assert.strictEqual(s.obj.type[I], 0x9A, '$B0B4: type $1A -> $9A');
    assert.strictEqual(s.obj.s0480[I], 2, '$B488 LDA #$02 -> $048C,X');
    assert.strictEqual(s.obj.s04C0[I], rom.read(0xB4E4 + rank),
      `rank ${rank}: $B48F LDA $B4E4,Y -> $04CC,X`);
    assert.strictEqual(s.obj.x[I], 0x80, '$B495 RTS -- nothing moves on init');
  }
});

test('$B4E4/$B4EB are two SEVEN-entry rows and they are NOT the same row', () => {
  // The load-bearing fact: $B4EB is $B4E4 + 7, so the dwell after a FLIGHT leg
  // and the dwell after a DRIFT leg come from different rows. A port that used
  // one row for both keeps the creature moving and gets every period wrong.
  // RED WHEN: $B4D6's read is changed to $B4E4 (or $B4BE's to $B4EB).
  for (let r = 0; r <= 6; r++) {
    assert.notStrictEqual(rom.read(0xB4E4 + r), rom.read(0xB4EB + r),
      `rank ${r}: the two rows must differ, or this suite proves nothing`);
  }
  // ...and the run really is 14 bytes: $B4F2 is dispatch entry 27's `LDA
  // $030C,X`, so a rank of 7 would read an OPCODE through the second row.
  // `dwellByRank` stops at $B4F2 and the reader throws there. The rank cannot
  // reach 7 ($9C45 bounds it at 5) and NOTHING in the port clamps it -- this
  // asserts the export's bound is the ROM's, not that we defend against it.
  assert.throws(() => rom.read(0xB4F2), /not in any exported range/,
    '$B4EB[7] is entry 27\'s opcode and must stay a loud throw');
});

test('$B480 phase 2 (DRIFT): $AEE1 moves it, and at dwell 1 it goes to phase 0', () => {
  // loc_B4C8: JSR $AEE1 / DEC $04CC,X / BEQ $B4D4. Above zero the phase stays
  // 2; at zero the dwell reloads from row B ($B4EB) and the phase becomes 0.
  // RED WHEN: the DEC is moved after the test (the drift then runs one frame
  // long), or $B4DC stores 2 instead of 0 (the creature never re-aims).
  const s = cell(true, { rank: 0 });
  s.obj.s0480[I] = 2;
  s.obj.s04C0[I] = 3;
  const x0 = s.obj.x[I];
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s04C0[I], 2, '$B4CB DEC $04CC,X');
  assert.strictEqual(s.obj.s0480[I], 2, 'still drifting');
  assert.notStrictEqual(s.obj.x[I], x0, '$B4C8 JSR $AEE1 must actually move it');
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s04C0[I], 1, 'and again');
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s0480[I], 0, '$B4DC LDA #$00 -- the RE-AIM phase');
  assert.strictEqual(s.obj.s04C0[I], rom.read(0xB4EB + 0),
    '$B4D6 LDA $B4EB,Y -- row B, not row A');
});

test('$B480 phase 0 RE-AIMS the creature at the ship, then flies it (phase := 1)', () => {
  // $B49B LDA $048C,X / BNE $B4A5 -- phase 0 ONLY calls $BCB5, and with A = $A8
  // (the enemy's own index), so it aims the CREATURE, not a bullet. Then the
  // fall-through at $B4AE flies it one frame and stores 1.
  // RED WHEN: the `if (phase === 0)` guard is dropped (it re-aims every frame
  // and never commits to a leg), or the aim is given a bullet index.
  const s = cell(true, { rank: 0 });
  s.obj.s0480[I] = 0;
  s.obj.s04C0[I] = 5;
  s.obj.xvel[I] = 0; s.obj.yvel[I] = 0; s.obj.s0460[I] = 0;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s0480[I], 1, '$B4B6 LDA #$01 -> $048C,X');
  assert.ok(s.obj.xvel[I] !== 0 || s.obj.xvelf[I] !== 0,
    '$B4A2 JSR $BCB5 must have written a velocity onto the CREATURE');
  // $BCE2's two bits, and they are NOT symmetric. Bit 0 is set when the ENEMY
  // is ABOVE the target ($BCEA BCS taken means no borrow; the INY is on the
  // borrow arm, i.e. enemyY < targetY) and bit 1 when the enemy is LEFT of it.
  // The ship here is BELOW and to the LEFT of the creature, so the byte is 1,
  // not 3 -- and writing the comment out is worth more than the assertion,
  // because "2 = x sign" is the reading that produces a plausible wrong port.
  assert.strictEqual(s.obj.s0460[I], 1,
    '$BD21 STA $046C,X -- the aim wrote the creature\'s own direction byte');
  // ...and on the NEXT frame phase 1 must NOT re-aim.
  const dir = s.obj.s0460[I];
  s.obj.x[0] = 0xF0; s.obj.y[0] = 0x10;      // move the ship somewhere else
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s0460[I], dir,
    'phase 1 flies the OLD course: $B49E BNE $B4A5 skips the aim');
});

test('$B480 phase 1 at dwell 1 reloads row A and returns to phase 2', () => {
  // loc_B4BC: LDY $17 / LDA $B4E4,Y / STA $04CC,X / LDA #$02 / BNE $B4B8.
  // RED WHEN: $B4C4's 2 becomes 0 or 1 -- the cycle then has two phases and the
  // creature either never drifts or never stops re-aiming.
  const s = cell(true, { rank: 3 });
  s.obj.s0480[I] = 1;
  s.obj.s04C0[I] = 1;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s0480[I], 2, '$B4C4 LDA #$02');
  assert.strictEqual(s.obj.s04C0[I], rom.read(0xB4E4 + 3),
    '$B4BE LDA $B4E4,Y -- row A, not row B');
});

test('$B480 phase 0 falls into $B4AE with phase 1 -- the DOUBLE DEY, not a switch', () => {
  // $B4A5 LDY $048C,X / DEY / BEQ $B4AE / DEY / BEQ $B4C8. Phase 1 branches to
  // $B4AE on the FIRST DEY; phase 0 reaches it by falling past BOTH. So the two
  // share an arm and only phase 2 is different. Proven by the OBSERVABLE
  // difference between the arms: $B4AE flies with $BDFA, $B4C8 drifts with
  // $AEE1 and ends on $B251. Give phase 0 a dwell of 1 and it must take
  // $B4BC's row-A reload -- which only $B4AE can reach.
  // RED WHEN: phase 0 is routed to $B4C8 (a plausible reading of "0 is not 1
  // and not 2"), or given an arm of its own.
  const s = cell(true, { rank: 0 });
  s.obj.s0480[I] = 0;
  s.obj.s04C0[I] = 1;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s0480[I], 2,
    'phase 0 with dwell 1 must reach $B4BC (the $B4AE arm), giving phase 2');
  assert.strictEqual(s.obj.s04C0[I], rom.read(0xB4E4 + 0),
    '...and row A. Row B here would mean it took $B4C8.');
});

test('$B480 uses ANIMATOR ROW 6, and $B650 has exactly four rows', () => {
  // $B496 LDY #$06 / JSR $B628. Rows are three bytes at $B650: 0 (the warp
  // rain), 3 ($B4FD), 6 (THIS) and 9 ($B559). A wrong row keeps a plausible
  // cadence and shows the wrong sprite -- invisible to any timing check.
  // RED WHEN: the 6 becomes 0, 3 or 9.
  const base = rom.read(0xB651 + 6);
  const count = rom.read(0xB652 + 6);
  const thresh = rom.read(0xB650 + 6);
  const s = cell(true, { rank: 0 });
  s.obj.s0480[I] = 2; s.obj.s04C0[I] = 0xFF;
  s.obj.timer[I] = u8(thresh - 1);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.anim[I], u8(base + 1),
    `row 6: the animator must step to base+1 = $${u8(base + 1).toString(16)}`);
  assert.ok(count > 0, 'fixture: row 6 has a frame count');
  // and the table really is 12 bytes -- $B65C is loc_B65C, the docking routine.
  assert.throws(() => rom.read(0xB65C), /not in any exported range/,
    '$B650 is FOUR rows; a fifth would read $B65C\'s opcodes');
});

// ======================= $C6DE, jt_$C439[5] =================================

/** Stage 6 parked in the `$82` countdown, on the frame the gates pass. */
function erupting(frame = 0) {
  const s = createState();
  s.substate = 0x82;
  s.spawn.z60 = 2;
  s.zp19 = 5;
  s.frame = u8(frame);
  return s;
}

test('$C6DE fills an ENEMY-BULLET slot, not the enemy slot cleared for it', () => {
  // The single fact that separates this arm from the other six. `lateSpawner`
  // allocates and clears an ENEMY slot before dispatch ($C41E/$C42A); $C6DE
  // then ignores it and scans `$0136,X` (the bullet band, object $16 + slot)
  // for its own. A port that filled the enemy slot would spawn a real enemy of
  // type 1 -- and type 1 IS a ported handler, so it would not even throw.
  // RED WHEN: the writes are moved to the enemy band, or the scan reads
  // $030C,X.
  const s = erupting(0);
  assert.doesNotThrow(() => spawnEngine(s, res));
  for (let k = 0; k <= 9; k++) {
    assert.strictEqual(s.obj.type[k + ENEMY_BASE], 0,
      `enemy slot ${k} must stay empty -- $C6DE does not use it`);
  }
  assert.strictEqual(s.obj.anim[BULLET + 9], 0x8D, '$C74A LDA #$8D -> $0136,X');
  assert.strictEqual(s.obj.type[BULLET + 9], 0x01, '$C737 LDA #$01 -> $0316,X');
  assert.strictEqual(s.obj.animFrame[BULLET + 9], 0x01, '...and -> $0176,X');
});

test('$C745 LDA #$98 is an IMMEDIATE -- and zero page $98 holds a DIFFERENT value', () => {
  // The trap: this routine WROTE zero page $98 four instructions earlier
  // ($C704 STA $98, the velocity's high byte), so reading `A9 98` as `LDA $98`
  // yields a plausible number instead of a crash. The opcode is A9.
  // RED WHEN: `o.x[i] = 0x98` becomes the computed high byte.
  //
  // Driven twice with velocities that make the two readings differ: $A9's
  // nibble*2 changes with the pattern stream, and $98 = a9 >> 3.
  for (const f of [0, 4, 8, 12]) {
    const s = erupting(f);
    spawnEngine(s, res);
    const slot = s.obj.anim.indexOf(0x8D);
    assert.ok(slot >= BULLET, `frame ${f}: something must have spawned`);
    assert.strictEqual(s.obj.x[slot], 0x98,
      `frame ${f}: x is the immediate $98 on EVERY spawn, whatever the stream`);
  }
});

test('$C6DE: the 16-bit velocity is $A9 * 32 + $02, split across $03C6:$03F6', () => {
  // $C6F6-$C714. The four ASLs plus ROL/ASL/ROL are a 16-bit `<< 5`; the frame
  // counter is added as the LOW BYTE, so it carries into the integer half.
  // RED WHEN: the shift is done as two independent 8-bit shifts (the carry out
  // of the low half is then lost), or $02 is treated as a separate jitter term.
  //
  // Re-derived here from the stream rather than from the port: $C447[6] is the
  // pointer at $C44D, the stream is $C752, and sub_$C44F's index is
  // ((pre-INC $69) & $3F) >> 1 with the nibble chosen by the POST-INC $69.
  const ptr = rom.word(0xC44D);
  assert.strictEqual(ptr, 0xC752, 'fixture: X = 6 selects the $C752 stream');
  for (const f of [0, 4, 8]) {
    const s = erupting(f);
    const pre = s.spawn.z69;
    const patternByte = rom.read(ptr + ((pre & 0x3F) >>> 1));
    const nibble = ((pre + 1) & 1) ? (patternByte & 0x0F) : (patternByte >>> 4);
    const a9 = (nibble * 2) & 0xFF;
    const v = a9 * 32 + f;
    spawnEngine(s, res);
    const slot = s.obj.anim.indexOf(0x8D);
    assert.strictEqual(s.obj.yvelf[slot], v & 0xFF,
      `frame ${f}: $03F6 is the low byte of a9*32 + $02`);
    assert.strictEqual(s.obj.yvel[slot], (v >>> 8) & 0xFF,
      `frame ${f}: $03C6 is its high byte -- the carry must propagate`);
  }
});

test('$C6DE declines silently when all ten bullet slots are busy ($C6F3 RTS)', () => {
  // An allocation failure is gameplay, not an error -- the same rule $BC63 and
  // $A3BB follow. RED WHEN: the scan throws, or wraps to slot 9 anyway.
  const s = erupting(0);
  for (let k = 0; k <= 9; k++) s.obj.anim[BULLET + k] = 0x77;
  assert.doesNotThrow(() => spawnEngine(s, res));
  for (let k = 0; k <= 9; k++) {
    assert.strictEqual(s.obj.anim[BULLET + k], 0x77,
      `bullet slot ${k} must be untouched`);
  }
});

// ======================= $CDA5, THE EXIT APERTURE ===========================

test('$CDA5 runs sub_$CDB3 TWICE a frame and stops dead at $66 == $58', () => {
  // $CDAC JSR $CDB3 / $CDAF JSR $CDB3. Two cells a frame, 88 cells, 44 frames.
  // RED WHEN: one of the two calls is dropped (the aperture then takes 88
  // frames and the ship meets a wall that is still closing), or the $58 bound
  // is widened (the table then runs into sub_$CE89's opcodes).
  const s = createState();
  s.zp19 = 5;
  let frames = 0;
  while (s.spawn.z66 < 0x58 && frames < 200) { sub_CDA5(s, res); frames++; }
  assert.strictEqual(frames, 44, '88 cells at two a frame is 44 frames exactly');
  assert.strictEqual(s.spawn.z66, 0x58, 'and it lands ON the bound, not past it');
  // One more call must do NOTHING -- both the outer gate and sub_$CDB3's own.
  const before = s.vram.cursor;
  sub_CDA5(s, res);
  assert.strictEqual(s.spawn.z66, 0x58, '$CDA7 CMP #$58 / BCC -- no 45th frame');
  assert.strictEqual(s.vram.cursor, before, '...and no 89th VRAM packet');
});

test('$CDA5 queues ONE five-byte nametable packet per cell, at row hi+7 / col lo+16', () => {
  // $CDC5-$CDD9 reduces to $2400 + 32*hi + lo + $F0. The check derives the
  // address the SHORT way (row/column) so it cannot agree with the port through
  // the same shifts -- the discipline W34 used on $C353.
  // RED WHEN: the $F0 is dropped, the nametable base becomes $2000, or hi and
  // lo are swapped.
  const tbl = res.collisionTables;
  const s = createState();
  s.zp19 = 5;
  sub_CDA5(s, res);                       // two cells: table entries 0 and 1
  const packets = readQueue(s);
  assert.strictEqual(packets.length, 2, 'two cells -> two packets');
  for (let k = 0; k < 2; k++) {
    const t = tbl.read(0xCE31 + k);
    const row = (t >> 4) + 7;
    const col = (t & 0x0F) + 16;
    assert.strictEqual(packets[k].addr, 0x2000 + 0x400 + row * 32 + col,
      `cell ${k}: nametable 1, row ${row}, column ${col}`);
    assert.deepStrictEqual(packets[k].bytes, [0x00],
      'one data byte, and it blanks the tile');
    assert.ok(packets[k].addr >= 0x2400 && packets[k].addr < 0x27C0,
      'every address must land in the nametable, never the attribute table');
  }
});

/** Walk `$0700` the way `$8A51` does, far enough for this suite's packets. */
function readQueue(s) {
  const q = s.vram.q;
  const out = [];
  let i = 0;
  while (i < s.vram.cursor && q[i] !== 0) {
    const addr = (q[i + 1] << 8) | q[i + 2];
    const bytes = [];
    let k = i + 3;
    while (q[k] !== 0xFF) { bytes.push(q[k]); k++; }
    out.push({ mode: q[i], addr, bytes });
    i = k + 1;
  }
  return out;
}

test('$CDA5 clears the matching 2-bit collision cell on PAGE $06', () => {
  // $CDFD-$CE2A: $0600 + $81 + 8*lo + ((hi+3) >> 2), masked with
  // $CE2D[(hi+3) & 3]. The page byte is the IMMEDIATE $06 at $CE1A, so a port
  // that reused $C32F's page-5 arithmetic would clear the wrong half of the map
  // -- and W34's M22 is the record of that being invisible to four checks that
  // all used page 5.
  // RED WHEN: the page becomes $05, the +$81 is dropped, or the mask index
  // loses its +3.
  const tbl = res.collisionTables;
  const s = createState();
  s.zp19 = 5;
  s.coll.fill(0xFF);
  sub_CDA5(s, res);
  for (let k = 0; k < 2; k++) {
    const t = tbl.read(0xCE31 + k);
    const off = ((((t >> 4) + 3) >> 2) + 0x81 + ((t & 0x0F) << 3)) & 0xFF;
    const mask = tbl.read(0xCE2D + (((t >> 4) + 3) & 3));
    // The byte started at $FF, so after `AND mask` it must BE the mask: that
    // asserts both halves at once -- the 2-bit field is clear AND the other six
    // bits are untouched.
    assert.strictEqual(s.coll[0x100 + off], mask,
      `cell ${k}: $0600+$${off.toString(16)} must be exactly $CE2D[${(((tblRead(tbl, k) >> 4) + 3) & 3)}]`);
  }
  // Page 5 must be untouched: this routine writes $0600 only.
  assert.ok(s.coll.slice(0, 0x100).every((b) => b === 0xFF),
    '$CE1A LDA #$06 -- page $05 is not this routine\'s page');
});

test('the 88 cells are 84 DISTINCT ones -- four are opened twice, and that is the ROM', () => {
  // Stated as a check so nobody "corrects" the table to 84. It also pins the
  // shape: rows hi+7 span 7..22 and columns lo+16 span 21..31, a bevelled
  // cross -- stage 6's exit aperture.
  // RED WHEN: the export's length changes, or its bound stops being $58.
  const tbl = res.collisionTables;
  const cells = [];
  for (let k = 0; k < 0x58; k++) {
    const t = tbl.read(0xCE31 + k);
    cells.push(((t >> 4) << 4) | (t & 0x0F));
  }
  assert.strictEqual(cells.length, 88, '$CDB5 CPX #$58');
  assert.strictEqual(new Set(cells).size, 84, 'four duplicates, the ROM\'s own');
  const rows = cells.map((t) => (t >> 4) + 7);
  const cols = cells.map((t) => (t & 0x0F) + 16);
  assert.strictEqual(Math.min(...rows), 7);
  assert.strictEqual(Math.max(...rows), 22);
  assert.strictEqual(Math.min(...cols), 21);
  assert.strictEqual(Math.max(...cols), 31);
  // and the byte after the table is sub_$CE89's opcode, so the run is exact.
  assert.throws(() => tbl.read(0xCE89), /not in any exported range/,
    '$CE89 is `LDA $18` -- an 89th cell would read it');
});

// ======================= $C099, THE MULTI-HIT COUNTER =======================

const tblRead = (tbl, k) => tbl.read(0xCE31 + k);

test('$C099: a type-$9A creature takes $BFC5[rank] hits, and the shot is still eaten', () => {
  // The arm that shipped as a throw until W35 on the strength of "$C099 ran 0
  // times in every measured run". Type $9A is entry 26's initialised form, so
  // nothing could reach it before stage 6 existed.
  // RED WHEN: the INC is dropped (the creature dies to one shot), the compare
  // is inverted, or the under-threshold arm forgets to consume the shot.
  const w = res.weaponTables;
  for (const rank of [0, 3, 5]) {
    const need = w.read(0xBFC5 + rank);
    const s = createState();
    s.substate = 0x80;
    s.zp17 = rank;
    s.obj.status[0] = 1;
    s.obj.x[0] = 80; s.obj.y[0] = 96;      // $C3AD needs a real player X
    const e = ENEMY_BASE + 4;
    s.obj.type[e] = 0x9A;
    s.obj.status[e] = 0x00;
    s.obj.x[e] = 100; s.obj.y[e] = 100;
    let hits = 0;
    for (let n = 0; n < need + 2 && s.obj.type[e] === 0x9A; n++) {
      // one shot, on the creature's own pixel
      s.obj.anim[3] = 6; s.obj.animFrame[3] = 0;
      s.obj.x[3] = 100; s.obj.y[3] = 100;
      shotSweep(s, res);
      hits += 1;
    }
    assert.strictEqual(hits, need,
      `rank ${rank}: $BFC5[${rank}] = ${need} hits, no more and no fewer`);
  }
});
