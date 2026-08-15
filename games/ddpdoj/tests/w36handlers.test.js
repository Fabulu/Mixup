// W36 -- the SEVEN remaining non-boss stage-1 handlers, their shared tail, the
// one new routine (`$2425B2`), and the two instrument defects they exposed.
//
// SHAPE OF THESE TESTS, following W30's.  Every one drives a real routine
// against the REAL exported cartridge windows and asserts on a value the ROM
// decides -- a muzzle vector out of `$269F48`, a fan pair out of `$2732FA`, a
// sprite pointer out of `$269E48`, a bucket out of a stub's own `lea` operands,
// an animation frame out of `$26990E`.  None of them writes a constant and
// reads it back through the same constant (`docs/knowledge/03`).
//
// Every throw assertion pins `e.romAddress`, never the message text
// (`27-review.md` 1A).
//
// The tests SKIP LOUDLY when the export is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { runHandler } from '../src/handlers.js';
import { stepMovement } from '../src/movement.js';
import { BUL, REC as BREC, TYPEBIT } from '../src/bullets.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const A5 = 0x81364c, A6 = 0x81459c;
const u16 = (v) => v & 0xffff;

// The ROM addresses these tests read THROUGH THE EXPORT, so an assertion is
// always "the handler used the cartridge's number", never "the handler used
// the number this file also carries".
const T = {
  famSprite: 0x269e48, famBucket: 0x269ec8, famAnim4: 0x269bb6,
  famMuzzle: 0x269f48, fan88: 0x2731fa, fan89: 0x2732fa,
  sprite89: 0x272e7a, anim31: 0x26990e, sprite24: 0x2970d8,
};

/** A live enemy: on screen, HP positive, unfrozen, both players far away. */
function fixture(over = {}) {
  const ram = new Ram();
  for (let i = 0; i < 0x60; i++) ram.setU8(A5 + i, 0);
  for (let i = 0; i < 0x40; i++) ram.setU8(A6 + i, 0);
  ram.setU16(A5, 0x8000);                 // live
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);               // no movement stream
  ram.setU16(A6 + 0x18, 0x0100);          // HP positive
  ram.setU16(A6 + 0x38, 0x0100);
  // Inside every bounds test AND inside $2425B2's box at $813096 = 0.
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU8(A5 + 0x16, 1);                // has been on screen
  // W382: `$275FD6 jsr $28AC72` is now LIVE, and $28AC72 opens with
  // `movea.l ($44,A5),A1 / move.w (A1)+,D0`. A hand-built record left that zero,
  // which is a state no cartridge is in: type $88's init at $275DA0 writes
  // `$275ECC + 28 = $275EE8` there (src/initbody.js, `loadSubProto` + rec44).
  // Any test here for a DIFFERENT type must override it with that type's script.
  ram.setU32(A5 + 0x44, 0x275ee8);        // $275DA0's move.l A0,($44,A5)
  ram.setU16(0x813092, 1);                // stage 1
  ram.setU16(0x813096, 0);                // the box-table index
  ram.setU16(0x8103e6, 0x8000);           // P1 alive
  ram.setU16(0x8103e8, 0x7000); ram.setU16(0x8103ea, 0x7000);
  ram.setU16(0x810448, 0x0000);           // P2 dead
  for (const [k, v] of Object.entries(over)) ram.setU16(Number(k), v);
  return ram;
}
function ctxOf(ram) {
  const log = new UnportedLog();
  const spawns = [];
  return {
    ctx: { ram, rom: ROM, tables: MT, unported: log,
           soundPost: (a) => log.note(a, 'WAVE A sound post'),
           bulletSpawn: (s, r) => spawns.push([s, r]) },
    log, spawns,
  };
}
function liveBullets(ram) {
  const out = [];
  for (let s = 0; s < BUL.slots; s++) {
    const tw = ram.u16(BUL.pool + s * BUL.stride);
    if (tw & TYPEBIT.alive) out.push({ slot: s, base: BUL.pool + s * BUL.stride });
  }
  return out;
}
/** Every 12-byte request in a bucket this frame. */
function bucketRequests(ram, b) {
  const n = ram.u16(BUCKETS[b].counter) / 12;
  const out = [];
  for (let i = 0; i < n; i++) {
    const at = BUCKETS[b].buffer + i * 12;
    out.push({
      pos: (ram.u16(at) << 16 | ram.u16(at + 2)) >>> 0,
      spr: (ram.u16(at + 4) << 16 | ram.u16(at + 6)) >>> 0,
      size: ram.u16(at + 8), pal: ram.u16(at + 10),
    });
  }
  return out;
}

// ===========================================================================
// 1. $269B3E / $269E20 -- THE DAMAGE-FIRST FAMILY'S SHARED TAIL
// ===========================================================================

test('$269E20 takes BOTH longwords from the cartridge at (heading & $3E) * 2',
  { skip: SKIP }, () => {
    // Two headings whose masked indices differ, driven through type $09 (whose
    // main path reaches $269E20 with D1 = ($23,A5)).  The expected values are
    // READ OUT OF THE ROM, so a port that indexed with `& $3F` or forgot the
    // `add.w D1,D1` cannot agree with them by construction.
    for (const facing of [0x07, 0x1a]) {
      const ram = fixture();
      ram.setU8(A5 + 0x23, facing);
      ram.setU16(0x803910, 1);               // skip the per-frame aim
      ram.setU16(0x80390c, 1);               // draw arm A
      ram.setU8(A5 + 0x18, 0x40);            // cooldown far from borrowing
      ram.setU16(A5 + 0x26, 0);
      ram.setU8(A6 + 0x1a, 0);               // ($1A,A6) == 0 -> no phase work
      runHandler(0x26a860, ram, ROM, A5, ctxOf(ram).ctx);
      const idx = ((facing & 0x3e) * 2) & 0xffff;
      assert.equal(ram.u32(A6 + 0x0a), ROM.u32(T.famSprite + idx),
        `$269E2C: the sprite pointer for heading $${facing.toString(16)}`);
      assert.equal(ram.u32(A5 + 0x2c), ROM.u32(T.famBucket + idx),
        '$269E38: ($2C,A5) comes from the SECOND table, same index');
    }
  });

test('$269B3E: $80390C picks the arm, and the two arms differ in EVERY field',
  { skip: SKIP }, () => {
    const run = (mirror) => {
      const ram = fixture();
      ram.setU8(A5 + 0x23, 0x04);
      ram.setU16(0x803910, 1);
      ram.setU8(A5 + 0x18, 0x40);
      ram.setU16(0x80390c, mirror);
      ram.setU16(A6 + 0x1c, 0x2900);         // the D4 source, HIGH byte non-zero
      ram.setU16(A5 + 0x20, 8);              // the $269BB6 cursor
      runHandler(0x26a860, ram, ROM, A5, ctxOf(ram).ctx);
      return ram;
    };
    // ARM A ($80390C != 0): bucket 7 through $23DF86, sprite from $269BB6[2],
    // size $828, and ($20,A5) steps by 4 and wraps at $F.
    const a = run(1);
    const bA = resolveEmitStub(ROM, 0x23df86).bucket;
    const rA = bucketRequests(a, bA);
    assert.equal(rA.length, 2, 'arm A: $269E3E and $269B68, in that order');
    assert.equal(rA[1].spr, ROM.u32(T.famAnim4 + 8),
      '$269B64 indexes $269BB6 with ($20,A5) as a BYTE offset');
    assert.equal(rA[1].size, 0x828, '$269B58 move.w #$828,D3');
    assert.equal(a.u16(A5 + 0x20), 12, '$269B6E addq.w #$4 / $269B72 andi.w #$F');
    // ARM B ($80390C == 0): bucket 3 through $23DF58, sprite from ($2C,A5),
    // size $410, and D4 keeps ($1C,A6)'s HIGH byte with $18 in the low one.
    const b = run(0);
    const bB = resolveEmitStub(ROM, 0x23df58).bucket;
    assert.notEqual(bA, bB, 'the two arms feed DIFFERENT buckets');
    const rB = bucketRequests(b, bB);
    assert.equal(rB.length, 1);
    assert.equal(rB[0].spr, b.u32(A5 + 0x2c), '$269B9E move.l ($2C,A5),D2');
    assert.equal(rB[0].size, 0x410, '$269BA2 move.w #$410,D3');
    assert.equal(rB[0].pal, 0x2918,
      '$269BA6 move.w ($1C,A6),D4 then $269BAA move.b #$18,D4 -- a BYTE move, '
      + 'so the high byte $29 survives');
    assert.equal(b.u16(A5 + 0x20), 8, 'arm B does NOT step the $269BB6 cursor');
  });

test('$269B7A: arm B is gated by RANK and by STAGE 2, and both are silent skips',
  { skip: SKIP }, () => {
    const bB = resolveEmitStub(ROM, 0x23df58).bucket;
    const draws = (over) => {
      const ram = fixture(over);
      ram.setU8(A5 + 0x23, 0x04);
      ram.setU16(0x803910, 1);
      ram.setU8(A5 + 0x18, 0x40);
      ram.setU16(0x80390c, 0);
      runHandler(0x26a860, ram, ROM, A5, ctxOf(ram).ctx);
      return ram.u16(BUCKETS[bB].counter);
    };
    assert.equal(draws({}), 12, 'the ungated case draws exactly one request');
    assert.equal(draws({ 0x813098: 1 }), 0, '$269B7A tst.w $813098 / bne -> rts');
    assert.equal(draws({ 0x813092: 2 }), 0, '$269B82 cmpi.w #$2,$813092 / beq');
  });

// ===========================================================================
// 2. $2425B2 -- the rank-selected position-box test
// ===========================================================================

test('$2425B2 gates the fire on BOTH axes, and RANK swaps the table pair',
  { skip: SKIP }, () => {
    // Type $09's fire runs `jsr $2425B2 / bcs` then `jsr $24202C / bcs`.  The
    // box's own bounds come out of $242562/$242576 (rank 0) and
    // $24258A/$24259E (rank != 0), so the test drives a position that is inside
    // one pair and outside the other and asserts the fire flips with RANK.
    const fires = (pos, rank) => {
      const ram = fixture({ 0x813098: rank });
      ram.setU32(A6 + 0x02, pos);
      ram.setU8(A5 + 0x18, 1);              // the cooldown reaches 0 this frame
      ram.setU16(0x8130b4, 0);
      ram.setU16(0x803910, 1);
      const { ctx, spawns } = ctxOf(ram);
      runHandler(0x26a860, ram, ROM, A5, ctx);
      return spawns.length;
    };
    // Read the two long-axis bands out of the ROM and pick a coordinate that
    // separates them.  $242562[0] and $24258A[0] are (sub, add) pairs: the test
    // is `(long - sub) + add` carrying.
    const lo0 = ROM.u32(0x242562), lo1 = ROM.u32(0x24258a);
    assert.notEqual(lo0, lo1, 'the two long-axis entries must differ, or this '
      + 'test cannot tell the tables apart');
    const inBand = (v, e) => u16(u16(v - (e & 0xffff)) + ((e >>> 16) & 0xffff)) === (
      (u16(v - (e & 0xffff)) + ((e >>> 16) & 0xffff)) & 0xffff)
      && (u16(v - (e & 0xffff)) + ((e >>> 16) & 0xffff)) <= 0xffff;
    let sep = null;
    for (let v = 0x1000; v < 0x9000; v += 0x40) {
      if (inBand(v, lo0) !== inBand(v, lo1)) { sep = v; break; }
    }
    assert.ok(sep !== null, 'a long-axis coordinate the two tables disagree on');
    const pos = ((sep << 16) | 0x2000) >>> 0;
    assert.notEqual(fires(pos, 0), fires(pos, 1),
      `at long $${sep.toString(16)} the fire must depend on $813098`);
    // and the SHORT axis is tested too -- the second half of the routine.
    assert.equal(fires(((sep << 16) | 0xf000) >>> 0, inBand(sep, lo0) ? 0 : 1), 0,
      '$2425DE..$242602: a short axis outside the band blocks the fire');
  });

// ===========================================================================
// 3. THE THREE DAMAGE-FIRST SIBLINGS
// ===========================================================================

test('$08/$09/$0B: the death arm scores 8, SPAWNS the effect, and frees',
  { skip: SKIP }, () => {
    for (const h of [0x26a5e4, 0x26a860, 0x26ad28]) {
      const ram = fixture();
      ram.setU8(A6, 0x10);                  // a P1 hit bit inside the $5C mask
      ram.setU16(A6 + 0x18, 0x8001);        // HP already negative
      ram.setU16(A6 + 0x02, 0x1234);        // the position the effect inherits
      ram.setU16(A6 + 0x04, 0x5678);
      ram.setU8(A6 + 0x1a, 0x03);           // the enemy's SPEED
      ram.setU8(A6 + 0x1b, 0x11);           // ...and its HEADING
      const { ctx, log } = ctxOf(ram);
      runHandler(h, ram, ROM, A5, ctx);
      assert.equal(ram.u16(A5), 0, `$${h.toString(16)}: the record was freed`);
      // W54: `$289004` is no longer a note, it is an ALLOCATION.  Assert the
      // pool-B slot the family's own arm ($269D24..$269D44) fills -- and note
      // that not one value below is a constant this test also wrote: the
      // position, the speed and the heading come out of the enemy, and the
      // bucket and the two arithmetics come out of the listing.
      const a0 = 0x81b732;
      assert.equal(ram.u16(a0), 0x8002, `$${h.toString(16)}: allocated, kind $2`);
      assert.equal(ram.u32(a0 + 0x02) >>> 0, 0x12345678,
        "$269D24 move.l ($2,A6),($2,A0) -- the dying enemy's position");
      assert.equal(ram.u8(a0 + 0x1a), 0x03 + 8, '$269D2E addq.b #8,D0');
      assert.equal(ram.u8(a0 + 0x1b), (0x11 * 4) & 0xff, '$269D38/$269D3A x4');
      assert.equal(ram.u16(a0 + 0x1e), 0x10, '$269D40 move.w #$10,($1e,A0)');
      assert.equal(ram.u16(a0 + 0x12), 0xffff,
        'and ($12,A0) is UNTOUCHED -- this arm never arms the pool-D sub-spawn');
      const notes = log.report().join('\n');
      assert.match(notes, /\$28C2A8/, 'the burst is still COUNTED');
    }
  });

test('$08 fires ONE $2814AC bullet whose D2 is $269F48[(aim+1)&$3E] + position',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU8(A5 + 0x18, 0);                // $26A738 subq.b BORROWS -> the fire
    ram.setU16(0x8130b4, 0);
    ram.setU16(0x803910, 1);                // skip the per-frame aim/slew
    ram.setU16(A5 + 0x26, 0);
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x26a5e4, ram, ROM, A5, ctx);
    assert.equal(spawns.length, 1, 'exactly one $2814AC call');
    assert.equal(spawns[0][0], 0x26a782, 'the site is $26A782');
    const live = liveBullets(ram);
    assert.equal(live.length, 1);
    // The aim is deterministic here (P1 at $7000,$7000, self at $4000,$2000),
    // so the muzzle index is too -- and the expected vector is a ROM read.
    // `spawnCore` bank A does `add.b D1,D1` TWICE before it stores the angle
    // ($281586), so the record's byte is the handler's D1 * 4.  D1 is a 0..63
    // aim result here, so `>> 2` inverts it exactly.
    const dir = ram.u8(live[0].base + BREC.origDir) >> 2;
    const idx = u16((u16(dir + 1) & 0x3e) * 2);
    const want = (ROM.u32(T.famMuzzle + idx) + 0x40002000) >>> 0;
    assert.equal(ram.u32(live[0].base + BREC.posA) >>> 0, want,
      '$26A776 add.l ($2,A6),D2 -- a 32-bit add on the muzzle longword');
    // $26A77A move.l #$3000D,D0: the kind is D0 & $3F.
    assert.equal(ram.u16(live[0].base) & 0x3f, 0x0d, 'kind $D');
  });

test('$0B takes its muzzle index from ($23,A5), NOT from the aim result',
  { skip: SKIP }, () => {
    // $26ADF2 is `move.b ($23,A5),D2` where $08 and $09 have `move.b D1,D2`.
    // One byte of difference, and it changes which way the whole salvo leaves.
    // The fixture puts a facing in ($23,A5) that the aim CANNOT produce here.
    const ram = fixture();
    ram.setU8(A5 + 0x28, 1);                // ($28,A5) borrows -> the fire
    ram.setU8(A5 + 0x29, 0x20);
    ram.setU8(A5 + 0x23, 0x11);
    ram.setU8(A5 + 0x24, 0x40);             // the phase counter does not borrow
    ram.setU8(A5 + 0x26, 0);
    ram.setU16(0x803910, 1);
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x26ad28, ram, ROM, A5, ctx);
    assert.equal(spawns.length, 1);
    const live = liveBullets(ram);
    const idx = u16((u16(0x11 + 1) & 0x3e) * 2);
    assert.equal(ram.u32(live[0].base + BREC.posA) >>> 0,
      (ROM.u32(T.famMuzzle + idx) + 0x40002000) >>> 0,
      'the index is ($23,A5) = $11 -> $269F48[$24]');
    // ...and the generator's D1 is the AIM, which is a different number.
    assert.notEqual(ram.u8(live[0].base + BREC.origDir), 0x11,
      '$26ADEA left D1 = the aim; only D2 came from the record');
  });

test('$26A6CE has NO bcs: when both players are dead the facing SURVIVES',
  { skip: SKIP }, () => {
    // `$26A6CE jsr $24202C` is not followed by a branch, so on the carry exit
    // D1 is still `move.b ($23,A5),D1` from $26A6C0 and the slew that follows
    // is slew(x, x).  A port that used the routine's `dir: 0` would swing the
    // enemy to heading 0 the instant the last player died.
    const ram = fixture({ 0x8103e6: 0x0000, 0x810448: 0x0000 });  // BOTH dead
    ram.setU8(A5 + 0x23, 0x2b);
    ram.setU8(A5 + 0x18, 0x40);
    ram.setU16(A5 + 0x26, 0);
    ram.setU16(0x803910, 0);                // the aim block DOES run
    runHandler(0x26a5e4, ram, ROM, A5, ctxOf(ram).ctx);
    assert.equal(ram.u8(A5 + 0x23), 0x2b & 0x3f,
      '$242190 masks with $3F and returns the same value; the facing holds');
  });

// ===========================================================================
// 4. $27733E -- TYPE $89
// ===========================================================================

test('$89 fires TWO bullets from ONE $2732FA entry, stride EIGHT',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(A5 + 0x20, 0x0013);          // the aim state -> the table index
    ram.setU8(A5 + 0x1a, 0);                // the fire cooldown borrows
    ram.setU8(A5 + 0x17, 0x20);
    ram.setU8(A5 + 0x1c, 0x40); ram.setU8(A5 + 0x1d, 0x40);
    ram.setU8(A5 + 0x1e, 0x40);             // the AIM cadence does not borrow
    ram.setU32(A6 + 0x02, 0x40002000);
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x27733e, ram, ROM, A5, ctx);
    assert.deepEqual(spawns.map((s) => s[0]), [0x27745c, 0x277464],
      'two $2813F0 calls, in the ROM\'s order');
    const live = liveBullets(ram);
    assert.equal(live.length, 2);
    // $277448 andi.w #$3E / $27744C add.w D0,D0 / $27744E add.w D0,D0 -- the
    // index is doubled TWICE, so the entries are 8 bytes apart and the two
    // `move.l (A4)+` reads are the two longwords of ONE heading's entry.
    const off = u16(u16((0x13 & 0x3e) * 2) * 2);
    assert.equal(ram.u32(live[0].base + BREC.posA) >>> 0,
      u16((ROM.u32(T.fan89 + off) >>> 16) + 0x4000) * 0x10000
      + u16(ROM.u32(T.fan89 + off) + 0x2000), 'bullet 1 <- $2732FA[+0]');
    assert.notEqual(ROM.u32(T.fan89 + off), ROM.u32(T.fan89 + off + 4),
      'the two longwords of an entry must differ, or a stride-4 read would '
      + 'produce the same picture and this test could not fail');
    assert.equal(ram.u32(live[1].base + BREC.posA) >>> 0,
      u16((ROM.u32(T.fan89 + off + 4) >>> 16) + 0x4000) * 0x10000
      + u16(ROM.u32(T.fan89 + off + 4) + 0x2000), 'bullet 2 <- $2732FA[+4]');
  });

test('$89\'s aim stores the slewed word AND the $272E7A sprite it selects',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU8(A5 + 0x1e, 0);                // the AIM cadence borrows
    ram.setU8(A5 + 0x1f, 0x20);
    ram.setU8(A5 + 0x1c, 0x05); ram.setU8(A5 + 0x1d, 0x05);  // $2773C6 cmp.b equal
    ram.setU8(A5 + 0x1a, 0x40);             // the fire does not run
    ram.setU16(A5 + 0x20, 0x0000);
    runHandler(0x27733e, ram, ROM, A5, ctxOf(ram).ctx);
    const nf = ram.u16(A5 + 0x20);
    assert.notEqual(nf, 0, '$27740A stored the slewed facing');
    assert.equal(ram.u32(A6 + 0x0a), ROM.u32(T.sprite89 + u16((nf & 0x3e) * 2)),
      '$27741A: ($A,A6) <- $272E7A[(D1 & $3E) * 2]');
  });

test('$89\'s $268018 gate: a player INSIDE the stage threshold blocks the fire',
  { skip: SKIP }, () => {
    // The threshold is $2680A2[$813092 * 2], read out of the ROM here so the
    // test cannot agree with a port that used a different table.
    const th = ROM.u16(0x2680a2 + 2);
    const run = (px) => {
      const ram = fixture();
      ram.setU16(0x8103e8, px); ram.setU16(0x8103ea, 0x2000);
      ram.setU8(A5 + 0x1a, 0);
      ram.setU8(A5 + 0x17, 0x20);
      ram.setU8(A5 + 0x1c, 0x40); ram.setU8(A5 + 0x1d, 0x40);
      ram.setU8(A5 + 0x1e, 0x40);
      const { ctx, spawns } = ctxOf(ram);
      runHandler(0x27733e, ram, ROM, A5, ctx);
      return spawns.length;
    };
    // self long axis is $4000; the octagonal distance is |dy|*3/4 + |dx|/2 with
    // dx == 0 here, so a player at $4000 - k has distance k*3/4.
    const near = 0x4000 - Math.floor((th - 0x40) * 4 / 3);
    const far = 0x4000 - Math.floor((th + 0x800) * 4 / 3);
    assert.equal(run(near), 0, `a player nearer than $${th.toString(16)} blocks`);
    assert.equal(run(far), 2, 'and a player beyond it does not');
  });

// ===========================================================================
// 5. $275F30 -- TYPE $88
// ===========================================================================

test('$88 emits FOUR requests and the fourth INHERITS D1-high, D3 and D4',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(A5 + 0x12, 0);
    ram.setU16(A6 + 0x1e, 0);               // the emitter index
    ram.setU16(A6 + 0x1c, 0x1234);
    ram.setU32(A6 + 0x2a, 0x00111111);
    ram.setU32(A5 + 0x24, 0x00222222);
    ram.setU32(A5 + 0x2a, 0x00333333);
    ram.setU16(A5 + 0x22, 0x40);            // the aim cadence does not borrow
    ram.setU8(A5 + 0x1e, 0x40);             // the fire does not run
    runHandler(0x275f30, ram, ROM, A5, ctxOf(ram).ctx);
    const rec = resolveEmitStub(ROM, ROM.u32(0x27829c));
    const reg = resolveEmitStub(ROM, ROM.u32(0x2782e4));
    assert.equal(rec.conv, 'record', '$27829C[0] is the record-convention stub');
    assert.equal(reg.conv, 'register', '$2782E4[0] is the register-convention one');
    const q = bucketRequests(ram, reg.bucket).filter((r) => r.spr !== 0);
    assert.equal(q.length >= 3, true, 'three register-convention requests');
    const third = q[q.length - 2], fourth = q[q.length - 1];
    assert.equal(fourth.size, third.size,
      '$27615C sets neither D3 nor D4, so the fourth request keeps the third\'s');
    assert.equal(fourth.pal, third.pal, 'and its D4');
    // The position words are `asr.l #6` of D1, so the HIGH half of the packed
    // word 0 is the long axis.  The fourth request's long axis must equal the
    // third's, because $27615C only wrote D1's LOW half.
    assert.equal((fourth.pos >>> 16) & 0x7ff, (third.pos >>> 16) & 0x7ff,
      '$27615C is move.w ($4,A6),D1 -- D1\'s HIGH half is the third\'s $FF00 bias');
    assert.notEqual(fourth.pos & 0x3ff, third.pos & 0x3ff,
      'and its LOW half is not (or this test could not tell them apart)');
  });

test('$88 fires SIX bullets, three per turret, from $2731FA and stepped +-5',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(A5 + 0x28, 0x0008);          // turret A's facing
    ram.setU16(A5 + 0x2e, 0x0014);          // turret B's
    ram.setU8(A5 + 0x1e, 0);                // the fire cooldown borrows
    ram.setU8(A5 + 0x31, 0x20);
    ram.setU8(A5 + 0x20, 0x40);             // the salvo counters do not borrow
    ram.setU8(A5 + 0x32, 0x40);             // ...and ($32,A5) is neither 0 nor 1
    ram.setU16(A5 + 0x22, 0x40);
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x275f30, ram, ROM, A5, ctx);
    assert.deepEqual(spawns.map((s) => s[0]),
      [0x2761de, 0x2761e6, 0x2761ee, 0x27622e, 0x276236, 0x27623e],
      'six fires, in the ROM\'s order, alternating $281442 / $2813F0 / $281442');
    const live = liveBullets(ram);
    assert.equal(live.length, 6);
    // Turret A's three headings are D1, D1-5, D1-10 and turret B's are D1,
    // D1+5, D1+10 -- opposite signs, which is `$27621E subq.w #$3` against
    // `$2761CE addq.w #$3`.  ($32,A5) is neither 0 nor 1 here so the START step
    // is zero on both.  The bullets are read in the ROM's own SPAWN ORDER (the
    // order `fire()` returns), never in slot order.
    const bases = spawns.flatMap(([, res]) => res
      .filter((r) => r && r.slot !== undefined && r.slot !== null)
      .map((r) => BUL.pool + r.slot * BUL.stride));
    assert.equal(bases.length, 6, 'six cores, one per fire');
    // The record's angle byte is the handler's D1 * 4 ($281586 add.b D1,D1
    // twice), so a -5 step in the handler reads as -20 here.
    const dirs = bases.map((b) => ram.u8(b + BREC.origDir));
    assert.deepEqual(dirs.slice(0, 3).map((d) => (d - dirs[0]) & 0xff),
      [0, (-20) & 0xff, (-40) & 0xff], 'turret A steps -5 twice');
    assert.deepEqual(dirs.slice(3).map((d) => (d - dirs[3]) & 0xff), [0, 20, 40],
      'turret B steps +5 twice -- the OPPOSITE sign');
    // ($32,A5) picks the STARTING step, and its two arms have OPPOSITE signs
    // per turret: `$2761CE addq.w #$3` / `$27621E subq.w #$3` when it is 0, and
    // `$2761DC addq.w #$5` / `$27622C subq.w #$5` when it is 1.  The fixture
    // above sat on `anything else`, where both are zero and the two readings
    // agree -- so the two live values are driven here as well.
    const withS32 = (s32) => {
      const r = fixture();
      r.setU16(A5 + 0x28, 0x0008); r.setU16(A5 + 0x2e, 0x0014);
      r.setU8(A5 + 0x1e, 0); r.setU8(A5 + 0x31, 0x20);
      r.setU8(A5 + 0x20, 0x40); r.setU8(A5 + 0x32, s32);
      r.setU16(A5 + 0x22, 0x40);
      const c = ctxOf(r);
      runHandler(0x275f30, r, ROM, A5, c.ctx);
      const bb = c.spawns.flatMap(([, res]) => res
        .filter((x) => x && x.slot !== undefined && x.slot !== null)
        .map((x) => BUL.pool + x.slot * BUL.stride));
      return bb.map((b) => r.u8(b + BREC.origDir));
    };
    const none = dirs, s0 = withS32(0), s1 = withS32(1);
    assert.equal((s0[0] - none[0]) & 0xff, (3 * 4) & 0xff,
      '($32,A5)==0: turret A starts at D1 + 3');
    assert.equal((s0[3] - none[3]) & 0xff, (-3 * 4) & 0xff,
      '...and turret B at D1 - 3 -- the OPPOSITE sign');
    assert.equal((s1[0] - none[0]) & 0xff, (5 * 4) & 0xff,
      '($32,A5)==1: turret A starts at D1 + 5');
    assert.equal((s1[3] - none[3]) & 0xff, (-5 * 4) & 0xff,
      '...and turret B at D1 - 5');
    // and D3 came from $2731FA, biased on both axes, per turret.
    const eA = ROM.u32(T.fan88 + u16((8 & 0x3e) * 2));
    assert.equal(ram.u32(bases[0] + BREC.posA) >>> 0,
      u16((eA >>> 16) + 0x300 + 0x4000) * 0x10000 + u16((eA & 0xffff) + 0x5c0 + 0x2000),
      'turret A: $2761B0 addi.w #$5C0 / $2761B6 addi.w #$300');
  });

test('$88\'s recoil uses $2638A6\'s OWN D3, and $275F50 negates it',
  { skip: SKIP }, () => {
    // The recoil block is four instructions after `jsr $2638A6`, and D3 is that
    // routine's return.  The CLEAN-CACHE exit is the one with a value a test
    // can pin: `$2638E8 movem.w ($40,A5),D2-D3` puts the word at ($42,A5) in
    // D3.  So the fixture parks the velocity cache, clears the dirty bit, and
    // points the cursor at a real HEAD opcode with a $00 param.
    //
    // `$231A1C` is stream $023's last two bytes, `20 00`: heading $20 (< $40,
    // so it applies) and param $00 (so the cursor is not advanced).
    const HEAD = 0x231a1c;
    assert.ok(ROM.u8(HEAD) < 0x80 && (ROM.u8(HEAD) & 0x7f) < 0x40
      && ROM.u8(HEAD + 1) === 0, '$231A1C is a HEAD with a $00 param');
    const D3 = 0x0123;
    const base = () => {
      const ram = fixture();
      ram.setU32(A5 + 0x12, HEAD);
      ram.setU8(A5 + 0x0d, 0);              // no scroll compensation
      ram.setU8(A5 + 0x02, 0);              // the velocity cache is CLEAN
      ram.setU16(A5 + 0x40, 0x0045);        // D2
      ram.setU16(A5 + 0x42, D3);            // D3 -- what the recoil reads
      ram.setU16(A6 + 0x2e, 1);             // $275F36 tst.w ($2E,A6) / beq
      ram.setU8(A6, 0x20);                  // $275F3C btst #$5,(A6)
      ram.setU16(A6 + 0x14, 0); ram.setU16(A6 + 0x16, 0);
      ram.setU16(A5 + 0x22, 0x40);          // no aim
      ram.setU8(A5 + 0x1e, 0x40);           // no fire
      return ram;
    };
    const run = (f30) => {
      const ram = base();
      ram.setU16(A6 + 0x30, f30);
      runHandler(0x275f30, ram, ROM, A5, ctxOf(ram).ctx);
      return ram;
    };
    const a = run(0), b = run(1);
    assert.equal(a.u16(A6 + 0x16), D3,
      '$275F42 lea ($16,A6),A0 / $275F58 add.w D3,(A0)');
    assert.equal(a.u16(A6 + 0x14), 0, 'and the OTHER field is untouched');
    assert.equal(b.u16(A6 + 0x14), u16(-D3),
      '$275F4C lea ($14,A6),A0 / $275F50 neg.w D3 -- the other field, NEGATED');
    assert.equal(b.u16(A6 + 0x16), 0);
    // THE FROZEN EXIT.  `$2638A6 tst.w $8130D2 / bne $2638A0` and `$2638A0
    // moveq #$0,D2 / moveq #$0,D3` -- so with the freeze set D3 is ZERO however
    // stale the velocity cache is, and the recoil must not move at all.  This
    // is the only arm that can tell `$2638A0`'s own zeroing from a caller that
    // pre-filled the pair.
    const f = base();
    f.setU16(A6 + 0x30, 0);
    f.setU16(0x8130d2, 1);
    runHandler(0x275f30, f, ROM, A5, ctxOf(f).ctx);
    assert.equal(f.u16(A6 + 0x16), 0,
      '$2638A0 moveq #$0,D3 -- a frozen frame recoils by nothing');
    // $275F52 cmpi.w #$C00,(A0) / bge -- at or above $C00 the add is skipped.
    const c = base();
    c.setU16(A6 + 0x30, 0);
    c.setU16(A6 + 0x16, 0x0c00);
    runHandler(0x275f30, c, ROM, A5, ctxOf(c).ctx);
    assert.equal(c.u16(A6 + 0x16), 0x0c00, '$275F56 bge -- the clamp holds');
  });


test('$2638A6 ZEROES D2/D3 on the frozen entry and on a STOP heading',
  { skip: SKIP }, () => {
    // `$275F30` reads D3 four instructions after the call, so the four exits'
    // return values are part of the specification.  Asserting them through the
    // handler cannot work: on the frozen exit the correct D3 is 0 and a MISSING
    // D3 is `undefined`, and `u16(x + undefined)` is 0 as well -- the two
    // readings produce identical RAM.  So the routine is driven DIRECTLY, with
    // the out-object POISONED so a miss is visible.
    const HEAD = 0x231a1c;                 // heading $20, param $00 (< $40)
    const drive = (cursor, over) => {
      const ram = fixture();
      ram.setU32(A5 + 0x12, cursor);
      ram.setU8(A5 + 0x0d, 0);
      ram.setU8(A5 + 0x02, 0);             // the velocity cache is CLEAN
      ram.setU16(A5 + 0x40, 0x0045);
      ram.setU16(A5 + 0x42, 0x0123);
      for (const [k, v] of Object.entries(over ?? {})) ram.setU16(Number(k), v);
      const vec = { dy: 0x7777, dx: 0x7777 };
      stepMovement(ram, ROM, A5, MT, new UnportedLog(), vec);
      return vec;
    };
    assert.deepEqual(drive(HEAD, {}), { dy: 0x0045, dx: 0x0123 },
      '$2638E8 movem.w ($40,A5),D2-D3 -- the clean-cache exit returns the cache');
    assert.deepEqual(drive(HEAD, { 0x8130d2: 1 }), { dy: 0, dx: 0 },
      '$2638AC bne $2638A0 / moveq #$0,D2 / moveq #$0,D3 -- the FROZEN exit');
    // ...and $263910, the STOP-heading exit, reached by a HEAD whose low seven
    // bits are >= $40.  The address is FOUND in the movement window, not typed.
    let stopAt = null;
    for (let a = 0x231856; a < 0x2325c0; a += 1) {
      const op = ROM.u8(a);
      if (op < 0x80 && (op & 0x7f) >= 0x40 && ROM.u8(a + 1) === 0) { stopAt = a; break; }
    }
    assert.ok(stopAt !== null, 'stage 1 emits at least one STOP heading');
    assert.deepEqual(drive(stopAt, {}), { dy: 0, dx: 0 },
      '$263910 moveq #$0,D2 / move.w D2,D3 -- a STOP heading returns zero');
  });

test('$88\'s death scores $115 -- a move.l, not a moveq -- and notes five gaps',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU8(A6, 0x10);
    ram.setU16(A6 + 0x18, 0x8001);
    const { ctx, log } = ctxOf(ram);
    runHandler(0x275f30, ram, ROM, A5, ctx);
    assert.equal(ram.u16(A5), 0, 'freed');
    // $28615E indexes the chain-value table with D0*2; $115 is well past a
    // moveq's 8-bit range, so a `moveq` reading would have truncated it.
    // `$286096` adds ONE for the hit and `$28615E` adds the kill's own value,
    // so the pending is $1 + $115 in packed BCD.  Asserting the SUM is what
    // shows both ran; asserting $115 alone would pass with the hit dropped.
    assert.equal(ram.u32(0x81b4c0) >>> 0, 0x00000116,
      'the packed-BCD pending score is $1 (the hit) + $115 (the kill)');
    const n = log.report().join('\n');
    for (const a of ['$28C2DC', '$289B22', '$27F8FA']) {
      assert.match(n, new RegExp(a.replace('$', '\\$')), `${a} is COUNTED`);
    }
    // W54: `$289004` left that list because it is no longer a gap.  Type $88's
    // death arm ($2762C6 / $276304 / $276348 / $27638E) makes FOUR allocations,
    // and all four ask pool D for TWO records apiece -- which is THE REFUSAL.
    assert.doesNotMatch(n, /\$289004 /, '$289004 is SPAWNED now, not counted');
    let live = 0;
    for (let i = 0; i < 80; i++) if (ram.u16(0x81b732 + i * 0x38) !== 0) live++;
    assert.equal(live, 4, 'four pool-B records, one per $289004 in $2762C4');
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => ram.u16(0x81b732 + i * 0x38) & 0xff),
      [0x0d, 0x0c, 0x0c, 0x85],
      "the four kinds, in the ROM's own order");
    assert.ok([0, 1, 2, 3].every((i) => ram.u16(0x81b732 + i * 0x38 + 0x12) === 1),
      'ALL FOUR write ($12,A0) = 1 -- two pool-D records each, not zero');
    // $27633A / $27637E / $2763C4 -- three of the four carry a SPEED:ANGLE pair
    // the driver turns into a velocity through $241D34, and the first does not.
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => ram.u16(0x81b732 + i * 0x38 + 0x1a)),
      [0x0000, 0x05c0, 0x0440, 0x0380],
      '($1a,A0) is SPEED:ANGLE and $2762C6 alone leaves it at the init 0');
  });

// ===========================================================================
// 6. $2697F6 (TYPE $31) and $29700C (TYPE $24)
// ===========================================================================

test('$31 walks $26990E in 8-byte steps but reads only SIX, and frees at $230',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(A5 + 0x20, 0);               // no $28C692 emitter
    ram.setU16(A5 + 0x18, 0);               // the counter borrows -> a new frame
    ram.setU16(A5 + 0x16, 0);               // phase 0
    ram.setU16(A5 + 0x1a, 0x18);            // cursor
    ram.setU16(0x80390c, 0);
    runHandler(0x2697f6, ram, ROM, A5, ctxOf(ram).ctx);
    assert.equal(ram.u32(A6 + 0x0a), ROM.u32(T.anim31 + 0x18),
      'the sprite pointer is the entry\'s LONGWORD');
    assert.equal(ram.u16(A5 + 0x18), ROM.u16(T.anim31 + 0x18 + 4),
      'and the frame count is the WORD after it -- six bytes read');
    assert.equal(ram.u16(A5 + 0x1a), 0x20, '$269840 addq.w #$8 -- an 8-byte stride');
    assert.equal(ram.u16(A6 + 0x04), 0x1c00, '$269816 move.w #$1C00,($4,A6)');
    // phase 2 at $228 steps to $230 and frees; at $220 it does not.
    for (const [cur, freed] of [[0x228, true], [0x220, false]]) {
      const r2 = fixture();
      r2.setU16(A5 + 0x20, 0); r2.setU16(A5 + 0x18, 0);
      r2.setU16(A5 + 0x16, 2); r2.setU16(A5 + 0x1a, cur);
      r2.setU16(0x80390c, 0);
      runHandler(0x2697f6, r2, ROM, A5, ctxOf(r2).ctx);
      assert.equal(r2.u16(A5) === 0, freed,
        `$2698B2 cmpi.w #$230: cursor $${cur.toString(16)}`);
    }
  });

test('$31 enqueues ONCE, or TWICE with the extra offset picked by $80390B bit 1',
  { skip: SKIP }, () => {
    const b = resolveEmitStub(ROM, 0x23f896).bucket;
    assert.equal(resolveEmitStub(ROM, 0x23f896).conv, 'record',
      '$23F896 is the FIFTH prologue shape and it is record-convention');
    const run = (mirror2, b390b) => {
      const ram = fixture();
      ram.setU16(A5 + 0x20, 0); ram.setU16(A5 + 0x18, 0x40);
      ram.setU16(0x80390c, mirror2);
      ram.setU8(0x80390b, b390b);
      ram.setU32(A6 + 0x02, 0x40002000);
      runHandler(0x2697f6, ram, ROM, A5, ctxOf(ram).ctx);
      return { ram, q: bucketRequests(ram, b) };
    };
    assert.equal(run(0, 0).q.length, 1, '$2698CA tst.w $80390C / beq -> one');
    const set = run(1, 0x02), clr = run(1, 0x00);
    assert.equal(set.q.length, 2); assert.equal(clr.q.length, 2);
    // WHICH SIDE, not merely "they differ" -- bit 1 SET takes `$2698DC subi.w
    // #$40` and bit 1 CLEAR takes `$2698F0 addi.w #$40`, so the extra request
    // is BELOW the first in one arm and ABOVE it in the other.  Asserting only
    // that the two arms disagree passes with the sense inverted.
    assert.ok((set.q[1].pos >>> 16) < (set.q[0].pos >>> 16),
      '$2698DC: bit 1 SET puts the second request BELOW the first');
    assert.ok((clr.q[1].pos >>> 16) > (clr.q[0].pos >>> 16),
      '$2698F0: bit 1 CLEAR puts it ABOVE');
    // ($4,A6) is rewritten to $1C00 by $269816 every frame, so the restore can
    // only be asserted on ($2,A6) -- which is the half the +-$40 moves.
    assert.equal(set.ram.u16(A6 + 0x02), 0x4000,
      'and the position is restored -- $2698E8 addi.w undoes $2698DC subi.w');
    assert.equal(clr.ram.u16(A6 + 0x02), 0x4000);
  });

test('$24 draws TWICE through $23DECE, the second $FDC00080 away by a 32-bit add',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(A5 + 0x1e, 2);               // neither state arm
    ram.setU8(A5 + 0x1a, 0x40);             // the sprite cursor does not step
    ram.setU16(A5 + 0x18, 0x0c);
    ram.setU16(A6 + 0x04, 0x2000);
    const b = resolveEmitStub(ROM, 0x23dece).bucket;
    assert.equal(b, 0, '$23DECE feeds bucket 0 -- the bucket with no producer');
    runHandler(0x29700c, ram, ROM, A5, ctxOf(ram).ctx);
    const q = bucketRequests(ram, b);
    assert.equal(q.length, 2);
    assert.equal(q[0].spr, 0x0007e8ac, '$29709E move.l #$7E8AC,D2 -- a literal');
    assert.equal(q[1].spr, ROM.u32(T.sprite24 + 0x0c),
      '$2970BA adda.w ($18,A5),A0 -- the SECOND sprite is a table read');
    assert.equal(q[0].size, 0x1488); assert.equal(q[1].size, 0x1488);
    assert.equal(q[0].pal, 0x13); assert.equal(q[1].pal, 0x13);
    // The bias is `addi.l`, so the low half's carry reaches the high half.
    const d1 = 0x40002000, want = ((d1 + 0xfdc00080) >>> 0);
    assert.equal(q[1].pos, (((want | 0) >> 6) & 0x07ff03ff | 0x80008000) >>> 0,
      '$2970C4 addi.l #$FDC00080,D1 -- ONE 32-bit add, not two 16-bit ones');
  });

test('$24 frees itself on a SIGNED short-axis test, and $297086 is signed too',
  { skip: SKIP }, () => {
    for (const [y, freed] of [[0xde00, true], [0xdc00, true], [0xe000, false]]) {
      const ram = fixture();
      ram.setU16(A5 + 0x1e, 2);
      ram.setU16(A6 + 0x04, y);
      runHandler(0x29700c, ram, ROM, A5, ctxOf(ram).ctx);
      assert.equal(ram.u16(A5) === 0, freed,
        `$297062 cmpi.w #$DE00,($4,A6) / bgt -- short axis $${y.toString(16)}`);
    }
    // $297086 cmpi.b #$10,($1A,A6) / blt: a SIGNED byte compare, so $80..$FF
    // are NEGATIVE and take the SHORT step.  The two readings differ on
    // exactly the 128 values $80..$FF.
    const step = (speed) => {
      const ram = fixture();
      ram.setU16(A5 + 0x1e, 2);
      ram.setU16(A6 + 0x04, 0x2000);
      ram.setU8(A6 + 0x1a, speed);
      ram.setU8(A5 + 0x1a, 0);              // the cursor DOES step
      ram.setU8(A5 + 0x1b, 0x20);
      ram.setU16(A5 + 0x18, 0);
      runHandler(0x29700c, ram, ROM, A5, ctxOf(ram).ctx);
      return ram.u16(A5 + 0x18);
    };
    assert.equal(step(0x08), 4, 'below $10: one addq.w #$4');
    assert.equal(step(0x20), 12, 'at or above $10: three of them');
    assert.equal(step(0x90), 4,
      '$90 is NEGATIVE as a signed byte -- the short step, not the long one');
  });

// ===========================================================================
// 7. THE BOSS -- W36 LEFT IT A LOUD NAMED THROW; W62 (S1) PORTED IT
// ===========================================================================
//
// W36 wrote "the 44th is the stage-1 BOSS $292902, which stays a loud named
// throw" and shipped, and W57 walked the port into it on logic frame 7,870 --
// on the LIVE PAGE, with fire held. This test is UPDATED rather than deleted,
// and it asserts the opposite claim on the same address, because the
// nineteenth handler being reachable is what makes stage 1 able to END.
//
// **WHAT IS BEHIND IT IS NOT THE BOSS.** See src/boss.js: recon 48's 111
// script entry points and 257-routine closure are still three waves, and what
// W62 ported is the four routines the STAGE END rides on.

test('$292902 -- THE NINETEENTH HANDLER -- RUNS, and its first dispatch spends '
  + 'one frame of the 10,800-frame timeout', { skip: SKIP }, () => {
    const ram = fixture();
    const { ctx } = ctxOf(ram);
    // The boss's record as $2926EE's `moveq #$7,D0 / jsr $26377A` leaves it.
    ram.setU32(A5 + 0x16, 0x00016c00);            // part 0 HP  93,184
    ram.setU32(A5 + 0x1a, 0x0000a000);            // part 1 HP  40,960
    ram.setU32(A5 + 0x1e, 0x0000a000);            // part 2 HP  40,960
    ram.setU16(A5 + 0x22, 0x2a30);                // **THE TIMEOUT**
    ram.setU16(A6, 0xa001); ram.setU16(A6 + 0x20, 0xa001);
    ram.setU16(A6 + 0x60, 0xa001);
    ram.setU16(0x8103e6, 0x8000);                 // a live P1, for $2428A6
    runHandler(0x292902, ram, ROM, A5, ctx);
    assert.equal(ram.u16(A5 + 0x22), 0x2a2f,
      '$294F3C subq.w #$1,$22(a5), reached through $294AD8 fall-through '
      + '$294DCC jmp $294F32(pc) -- there is no other caller');
    assert.ok(Unreached.prototype instanceof Error);
  });

