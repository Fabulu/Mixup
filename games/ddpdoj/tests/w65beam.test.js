// W65 (B3) -- THE LASER BOMB.  `$249A80`, `$255FE2` and `$2456A6`.
//
// The ROM below is SYNTHETIC and it is built from the same structural facts
// `tools/export-tables.py check_beam_bomb_extents` asserts against the real
// image on every export -- the four head-table pointers at their template
// offsets, `$256692`'s eight entries, `$256712`'s twelve five-longword steps
// and its `$FFFFFFFF`.  A unit test can only read the port's source; the
// cartridge's own numbers are checked at the export and in
// `tools/w65beamgate.mjs`, which drives the SHIPPED bundle.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import { podKnockback24D188, POD_KNOCK } from '../src/options.js';
import {
  BOMB, BOMBRAM, BEAM_REC, BEAM_TEMPLATES, bombDriver255DD8,
  bombDamageAlt2456A6, fireBomb2498E2,
} from '../src/bomb.js';

const ctx = (extra = {}) => ({
  unportedLog: new UnportedLog(),
  tables: { vector: () => ({ dy: 7, dx: 11 }) },
  ...extra,
});

// ===========================================================================
// THE SYNTHETIC BEAM ROM
// ===========================================================================
const HEAD = [0x256662, 0x25666e, 0x25667a, 0x256686];   // rec 0 / 43 / 42 / 44
const PTRS = 0x256692;
const PTR_TARGETS = 0x2566b2;
const LIST = 0x256712;
const LIST_TABLES = 0x256806;
const HEAD_B = [0x256986, 0x256992, 0x25699e, 0x2569aa]; // rec 0 / 43 / 42 / 44
const PTRS_B = 0x2569b6;
const PTR_TARGETS_B = 0x2569d6;
const LIST_B = 0x256a36;
const LIST_TABLES_B = 0x256b2a;

/** `$255FEA..$256062`'s copy sequence, as `[srcOffset, recordOffset, size]`.
 *  Written out rather than generated so a reader can check it against the
 *  listing line by line; `installBeamTemplate` walks the same shape. */
const INSTALL = (() => {
  const seq = [
    [4, 0x06], [-4, 0], [2, 0x0e], [4, 0x10], [4, 0x14], [4, 0x18], [2, 0x1c],
    [4, 0x1e], [4, 0x22], [2, 0x26], [4, 0x28], [4, 0x2c],
  ];
  void seq;
  // The three blocks after `lea ($7B0,A1),A1`, expressed as the record
  // offsets the moves land on (the `addq.w #$4` holes are simply absent).
  return [
    [0x00, 0x006, 4], [0x04, 0x00e, 2], [0x06, 0x010, 4], [0x0a, 0x014, 4],
    [0x0e, 0x018, 4], [0x12, 0x01c, 2], [0x14, 0x01e, 4], [0x18, 0x022, 4],
    [0x1c, 0x026, 2], [0x1e, 0x028, 4], [0x22, 0x02c, 4],
    [0x26, 0x7e0, 2], [0x28, 0x7e6, 4], [0x2c, 0x7ee, 2], [0x2e, 0x7f0, 4],
    [0x32, 0x7f4, 4], [0x36, 0x7f8, 4], [0x3a, 0x7fc, 2], [0x3c, 0x7fe, 4],
    [0x40, 0x802, 4], [0x44, 0x806, 4], [0x48, 0x80a, 4], [0x4c, 0x80e, 2],
    [0x4e, 0x810, 2], [0x50, 0x816, 4], [0x54, 0x81e, 2], [0x56, 0x820, 4],
    [0x5a, 0x824, 4], [0x5e, 0x828, 4], [0x62, 0x82c, 2], [0x64, 0x82e, 4],
    [0x68, 0x832, 4], [0x6c, 0x836, 2], [0x6e, 0x838, 4], [0x72, 0x83c, 4],
    [0x76, 0x840, 2], [0x78, 0x846, 4], [0x7c, 0x84e, 2], [0x7e, 0x850, 4],
    [0x82, 0x854, 4], [0x86, 0x858, 4], [0x8a, 0x85c, 2], [0x8c, 0x85e, 4],
    [0x90, 0x862, 4], [0x94, 0x866, 4], [0x98, 0x86a, 4], [0x9c, 0x86e, 2],
  ];
})();

function beamRom() {
  const mem = new Map();
  const w = (a, v) => { mem.set(a, (v >>> 8) & 0xff); mem.set(a + 1, v & 0xff); };
  const l = (a, v) => { w(a, (v >>> 16) & 0xffff); w(a + 2, v & 0xffff); };
  // ---- $256CAA, the 158-byte install.  Only the fields the port reads back
  // carry meaningful values; the rest are recognisable filler.
  const T = BEAM_TEMPLATES.install;
  for (const [src, , size] of INSTALL) {
    if (size === 2) w(T + src, 0x1111); else l(T + src, 0x11111111);
  }
  w(T + 0x26, 0x8000);                 // record 42's status
  w(T + 0x4e, 0x8000);                 // record 43's
  w(T + 0x76, 0x8200);                 // record 44's -- bit 1 SET
  l(T + 0x0e, 0x00000078);             // ($18,A6) = 0, ($1A,A6) = $78 = 120
  l(T + 0x18, 0x00000008);             // ($22,A6) = 0, ($24,A6) = 8
  w(T + 0x1c, 0x0008);                 // ($26,A6) -- the reload
  l(T + 0x14, HEAD[0]); l(T + 0x3c, HEAD[2]);
  l(T + 0x64, HEAD[1]); l(T + 0x8c, HEAD[3]);
  l(T + 0x1e, LIST); l(T + 0x22, PTRS);
  // ($80A,A6) -- record 42's own +$2A, and $2561AA's cursor.  The cartridge
  // seeds it $001C here and `subq.w #$4` walks it to 0; leaving it as filler
  // sends `$2561C8 movea.l (A0,D0.w),A0` outside $256692's eight entries,
  // which is exactly what the synthetic ROM's `not modelled` throw caught.
  l(T + 0x48, 0x001c0000);
  // The three heads' own ($28) phase words.  Filler here sends `$256348` down
  // its `$256362` arm on the very first frame, which CLEARS record 44's bit 1
  // and reaches `$289FF4` -- the synthetic ROM's `not modelled` throw again,
  // and a second demonstration that a template hole is not a neutral value.
  l(T + 0x44, 0x00080000);             // record 42: ($806) = 8, ($808) = 0
  l(T + 0x6e, 0x00000000);             // record 43
  l(T + 0x94, 0x00080000);             // record 44: ($866) = 8, ($868) = 0
  // ---- the 18-byte segment template.
  const S = BEAM_TEMPLATES.seg;
  w(S, 0x8000); l(S + 2, 0xfe00f800); w(S + 6, 0x0240);
  l(S + 8, 0x02000200); l(S + 12, 0x08000800); w(S + 16, 0x0006);
  // Both ships have the same cartridge geometry with distinct art streams.
  const families = [
    [HEAD, PTRS, PTR_TARGETS, LIST, LIST_TABLES, 0],
    [HEAD_B, PTRS_B, PTR_TARGETS_B, LIST_B, LIST_TABLES_B, 0x100],
  ];
  for (const [heads, ptrs, ptrTargets, list, listTables, tag] of families) {
    heads.forEach((h, i) => {
      for (let k = 0; k < 3; k++) l(h + k * 4, 0x900 + tag + i * 0x10 + k);
    });
    for (let i = 0; i < 8; i++) {
      l(ptrs + i * 4, ptrTargets + i * 12);
      for (let k = 0; k < 3; k++) {
        l(ptrTargets + i * 12 + k * 4, 0xa00 + tag + i * 0x10 + k);
      }
    }
    for (let i = 0; i < 12; i++) {
      const e = list + i * 20;
      for (let k = 0; k < 4; k++) l(e + k * 4, 0xb00 + tag + i * 0x10 + k);
      l(e + 16, listTables + i * 0x20);
      for (let k = 0; k < 8; k++) {
        l(listTables + i * 0x20 + k * 4, 0xc00 + tag + i * 8 + k);
      }
    }
    l(list + 12 * 20, 0xffffffff);
  }
  // ---- POOL E, because $255FE2 reaches $289FF4 whenever $812954 is set
  // ($256354 -> $25636E clears record 44's bit 1 -> $256162 jmp).  The
  // three canned RNG tables and the three templates are served as CONSTANTS,
  // which is enough for the rows here and honest about being enough.
  for (let i = 0; i < 128; i++) { mem.set(0x243174 + i, 0); mem.set(0x242e42 + i, 3); }
  for (let i = 0; i < 256; i++) { mem.set(0x242ede + i, 0); mem.set(0x24301a + i, 0); }
  for (let i = 0; i < 64; i++) mem.set(0x28aba0 + i, 0);
  for (let i = 0; i < 3; i++) {
    const t = 0x28a464 + i * 22;
    l(0x28a030 + i * 4, t);
    w(t, 0); w(t + 2, 0xfc00); w(t + 4, 0xfd00); w(t + 6, 0x0418);
    w(t + 8, 0x0006); w(t + 10, 0x0606);
    l(t + 12, 0x0002001c); l(t + 16, 0x28a4a6 + i * 32); w(t + 20, 0);
    for (let k = 0; k < 8; k++) l(0x28a4a6 + i * 32 + k * 4, 0x50000 + k);
  }
  const need = (a) => {
    if (!mem.has(a)) throw new Error(`beamRom: $${a.toString(16)} not modelled`);
    return mem.get(a);
  };
  return {
    u8: need,
    u16: (a) => (need(a) << 8) | need(a + 1),
    u32: (a) => (((need(a) << 24) | (need(a + 1) << 16)
      | (need(a + 2) << 8) | need(a + 3)) >>> 0),
  };
}

/** The seed's own player shape, with the BEAM up. */
function player(ram, { dead = 1, stock = 3 } = {}) {
  ram.setU16(RAM.player1, 0x8000);
  ram.setU8(RAM.player1 + BOMBRAM.stockOffset, stock);
  ram.setU8(RAM.player1 + P.invuln, 0xff);
  ram.setU8(RAM.player1 + P.dead, dead);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  return RAM.player1;
}

// ===========================================================================
// $249A80 -- THE ARM
// ===========================================================================
test('$249A98 bset #$0,($1,A1) writes THE RECORD, not the option block', () => {
  const ram = new Ram();
  const rec = player(ram);
  fireBomb2498E2(ram, ctx(), rec, 0);
  // A1 is `$811F72` at $249A98 and `$8104AA` at $249AD8, and the reload is
  // between them ($249AB2).  If a port kept ONE A1 the `bset` would land on
  // $8104AB and the two `move.w`s on $811FAA/$811FC8 -- inside SEGMENT 1.
  assert.equal(ram.u16(BOMBRAM.rec) & 1, 1, '$249A98 -> $811F73 bit 0');
  assert.equal(ram.u8(BOMBRAM.optP1 + 1) & 1, 0, '...and NOT $8104AB');
  assert.equal(ram.u16(BOMBRAM.optP1 + 0x38), 0x26, '$249AD8 -> $8104E2');
  assert.equal(ram.u16(BOMBRAM.rec + 0x38), 0, '...and NOT $811FAA');
});

test('P2\'s laser arm uses $81050E and $81294E, not P1\'s', () => {
  const ram = new Ram();
  ram.setU16(RAM.player2, 0x8000);
  ram.setU8(RAM.player2 + BOMBRAM.stockOffset, 3);
  ram.setU8(RAM.player2 + P.dead, 1);
  fireBomb2498E2(ram, ctx(), RAM.player2, 1);
  assert.equal(ram.u16(BOMBRAM.optP2 + 0x38), 0x26, '$249AD8 with A1 = $81050E');
  assert.equal(ram.u16(BOMBRAM.optP1 + 0x38), 0, 'P1\'s block untouched');
  assert.equal(ram.u16(BOMBRAM.soundQueueP2), 1, '$249ACC lea $81294E,A2');
  assert.equal(ram.u16(BOMBRAM.soundQueue), 0);
  assert.equal(ram.u16(BOMBRAM.rec) & 0x80, 0x80, '$249A48 -- the P2 bit');
});

test('$249A9E clr.w $8127E2 and $249AA4 ($46,A6) := $2E are the arm\'s, and '
  + 'the ORDINARY arm writes neither', () => {
  const a = new Ram(); const ra = player(a);
  a.setU16(BOMBRAM.g8127e2, 0x4321);
  fireBomb2498E2(a, ctx(), ra, 0);
  assert.equal(a.u16(BOMBRAM.g8127e2), 0, '$249A9E');
  assert.equal(a.u16(ra + 0x46), 0x2e, '$249AA4 -- $2496A2\'s ramp cursor');
  const b = new Ram(); const rb = player(b, { dead: 0 });
  b.setU16(BOMBRAM.g8127e2, 0x4321);
  fireBomb2498E2(b, ctx(), rb, 0);
  assert.equal(b.u16(BOMBRAM.g8127e2), 0x4321, '$249A7E jumps $249A9E');
  assert.equal(b.u16(rb + 0x46), 0, '...and $249AA4');
});

// ===========================================================================
// $255FE2 -- THE FOUR-RECORD MACHINE
// ===========================================================================
test('$255FE2 installs FOUR records -- 0, 42, 43 and 44 -- and NOT 1..41',
  () => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    bombDriver255DD8(ram, beamRom(), ctx());
    assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.tail), 0x8000, 'record 42');
    assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.mid), 0x8000, 'record 43');
    // `$25600C lea ($7B0,A1),A1` is what puts the second head at +$7E0.  A
    // port that read it as `+$7B0 from the record base` would install at
    // record 41 and leave 42/43/44 dead -- and the segments would overwrite it.
    assert.equal(BEAM_REC.tail / BOMBRAM.stride, 42, '$7E0 / $30 == 42');
    assert.equal(ram.u32(BOMBRAM.rec + BEAM_REC.tip + 0x1e), HEAD[3]);
    assert.equal(ram.u32(BOMBRAM.rec + BEAM_REC.mid + 0x1e), HEAD[1]);
    assert.equal(ram.u32(BOMBRAM.rec + BEAM_REC.tail + 0x1e), HEAD[2]);
  });

test('Type-B laser bomb installs all six alternate pointers and $28C542', () => {
  const ram = new Ram();
  const cues = [];
  ram.setU16(BOMBRAM.rec, 0x8003);                    // laser bit 0 plus ship bit 1
  bombDriver255DD8(ram, beamRom(), ctx({ soundPost: (a) => cues.push(a) }));
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), HEAD_B[0]);
  assert.equal(ram.u32(BOMBRAM.rec + 0x28), LIST_B);
  assert.equal(ram.u32(BOMBRAM.rec + 0x2c), PTRS_B);
  assert.equal(ram.u32(BOMBRAM.rec + BEAM_REC.tail + 0x1e), HEAD_B[2]);
  assert.equal(ram.u32(BOMBRAM.rec + BEAM_REC.mid + 0x1e), HEAD_B[1]);
  assert.equal(ram.u32(BOMBRAM.rec + BEAM_REC.tip + 0x1e), HEAD_B[3]);
  assert.deepEqual(cues, [BOMB.beamCue28C542]);
  assert.equal(ram.u32(BOMBRAM.rec + 0x0a), 0x00000a01,
    'the first frame reads index 4 from the Type-B record-0 head table');
});

test('record 44 is installed with bit 1 SET, which is what keeps $289FF4 '
  + 'out of the first frames', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  bombDriver255DD8(ram, beamRom(), ctx());
  // $256154 btst #$1,(A6) / bne $25616A -- a SET bit RETURNS before the
  // `moveq #$2,D0 / jmp $289FF4`.  The template's own $8200 is what sets it.
  assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.tip) & 0x0200, 0x0200);
  assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.tail) & 0x0200, 0);
});

test('$2561AA seeds ONE segment a frame -- D6 is a latch, not a counter', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  const rom = beamRom();
  const live = () => {
    let n = 0;
    for (let k = 1; k <= BEAM_REC.segs; k++) {
      if (ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) & 0x8000) n++;
    }
    return n;
  };
  bombDriver255DD8(ram, rom, ctx());
  assert.equal(live(), 1, 'frame 1: $25620A moveq #$1,D6 stops the loop seeding');
  bombDriver255DD8(ram, rom, ctx());
  assert.equal(live(), 2, 'frame 2');
  bombDriver255DD8(ram, rom, ctx());
  assert.equal(live(), 3, 'frame 3');
});

test('a seeded segment sits at the player Y + $600 and the player X', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  bombDriver255DD8(ram, beamRom(), ctx());
  const s = BOMBRAM.rec + BEAM_REC.seg0;
  // $2561F0 move.l ($2,A5),D0 / $2561F4 addi.l #$6000000,D0 -- a LONG add, so
  // the $600 lands on the HIGH word and a carry out of X would reach it.
  assert.equal(ram.u16(s + 0x02), 0x2600, '$2561F4 addi.l #$6000000');
  assert.equal(ram.u16(s + 0x04), 0x1800);
  // D5 is the POINTER `$2561C8 movea.l (A0,D0.w),A0` dereferenced, not the
  // table slot it came out of.  ($80A,A6) is seeded $1C and `$2561AA subq.w
  // #$4` takes it to $18 BEFORE the read, so this is $256692[6].
  assert.equal(ram.u32(s + 0x18), 0x2566b2 + 6 * 12,
    '$256206 move.l D5,(A1)+ -- the POINTER is saved on the segment, and it '
    + 'is what $256212 re-reads the anim through on every later frame');
});

test('$255FE2 walks 120 script frames and then TWELVE $256712 entries', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  const rom = beamRom();
  let n = 0;
  while ((ram.u16(BOMBRAM.rec) & 0x8000) !== 0 && n < 400) {
    // This synthetic bench does not drain per-frame sprite queues, so its old
    // requests eventually overwrite player RAM. Restore the live type-A selector
    // before each frame rather than feeding that bench artifact to $25270C.
    ram.setU16(RAM.player1 + P.shipSel, 0);
    bombDriver255DD8(ram, rom, ctx()); n++;
  }
  // 120 from ($1A,A6)'s $78 seed plus 12 from the list, and the record is
  // cleared ON the twelfth rather than after it.
  assert.equal(n, 132, 'the driver ran 132 times');
  assert.equal(ram.u16(BOMBRAM.rec), 0, '$2564F0 wiped record 0');
  assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.tip), 0, '...and record 44');
  assert.equal(ram.u16(BOMBRAM.cooldown), 0x28, '$25619A move.w #$28');
});

test('$256468 clears BOTH ($1,A6) bit 6 AND bit 7, and $812954', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.bset8(RAM.player1 + 0x01, 7);
  const rom = beamRom();
  // `$812954` is set on the LAST frame only, and deliberately: a non-zero
  // `$812954` earlier sends `$256348` down `$25636E`, which clears record
  // 44's bit 1 and reaches `$289FF4` -- a different subsystem (pool E) with
  // its own three RNG tables, which this synthetic ROM does not model and
  // says so rather than serving zeroes.
  for (let n = 0; n < 131; n++) bombDriver255DD8(ram, rom, ctx());
  ram.setU32(BOMBRAM.g12954, 0x00814000);
  // The synthetic bench accumulates display requests across frames and can
  // overwrite this selector; the board drains those requests every frame.
  ram.setU16(RAM.player1 + P.shipSel, 0);
  bombDriver255DD8(ram, rom, ctx());
  // bit 6 is $2564F0's (both players); bit 7 is $256468's own $2564AA, and it
  // is the one that switches $2496A2 / $24D188 / $24A4E2 back off.
  assert.equal(ram.btst8(RAM.player1 + 0x01, 6), false, '$256516');
  assert.equal(ram.btst8(RAM.player1 + 0x01, 7), false, '$2564AA bclr #$7');
  assert.equal(ram.u32(BOMBRAM.g12954), 0, '$2564B2 move.l D0,$812954');
  assert.equal(ram.u16(0x811ef2), 0, '$25270C\'s beam record');
});

test('$256346 IS A BARE `rts` and $256348 is the routine after it', () => {
  // The pair matters because `$256128 bsr.w $256346` and `$25612C bsr.w
  // $256348` are ADJACENT calls: a reader who starts at $256346 reads its
  // `rts` as $256348's and loses the whole of record 44's mover.
  assert.equal(BOMB.beamNop256346 + 2, BOMB.beamHead256348);
  const log = new UnportedLog();
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  bombDriver255DD8(ram, beamRom(), ctx({ unportedLog: log }));
  assert.ok([...log.calls.keys()].some((k) => k.startsWith('$256346 ')),
    'the bare rts is a COUNTED note, not a silent skip');
});

test('the Type-B laser twin reaches its own $256A36 phase-2 list', () => {
  const ram = new Ram();
  const rom = beamRom();
  ram.setU16(BOMBRAM.rec, 0x8003);
  for (let frame = 0; frame < 120; frame++) {
    ram.setU16(BOMBRAM.bucket13Counter, 0);
    ram.setU16(RAM.player1 + P.shipSel, 2);
    bombDriver255DD8(ram, rom, ctx());
  }
  assert.equal(ram.u16(BOMBRAM.rec + 0x18), 1,
    '$256118 enters phase 2 on the 120th frame');
  assert.equal(ram.u32(BOMBRAM.rec + 0x28), LIST_B + 20,
    '$25618E advances from the first Type-B five-longword entry');
});

// ===========================================================================
// $2456A6 -- THE DAMAGE
// ===========================================================================
/** One enemy in pool A or pool B, at the origin with `$2000` HP. */
function enemyAt(ram, base, n, { y = 0x1000, x = 0x1000, status = 0xa000 } = {}) {
  const a = base + n * 0x20;
  ram.setU16(a, status);
  ram.setU16(a + 0x02, y); ram.setU16(a + 0x04, x);
  ram.setU16(a + 0x10, 0x100); ram.setU16(a + 0x12, 0x100);
  ram.setU16(a + 0x14, 0x100); ram.setU16(a + 0x16, 0x100);
  ram.setU16(a + 0x18, 0x2000);
  return a;
}

/** A live bomb record with a box big enough to hold the enemies above. */
function beamRec(ram, off = 0, { low = 0x01 } = {}) {
  // `$245622 move.w #$7800,$812952` and `$24562C move.l D0,$812954` run in
  // `$24560A` BEFORE the fork, so every direct call to the alt arm has to
  // stand in for them.  Leaving `$812952` at 0 makes `$2457C6 cmp/bcc` reject
  // every pool-B enemy and the three pool-B rows below pass vacuously.
  ram.setU16(BOMBRAM.g12952, 0x7800);
  const a = BOMBRAM.rec + off;
  ram.setU16(a, 0x8000 | low);
  ram.setU16(a + 0x02, 0x1000); ram.setU16(a + 0x04, 0x1000);
  for (const o of [0x10, 0x12, 0x14, 0x16]) ram.setU16(a + o, 0x2000);
  return a;
}

test('$2456A6 hits EVERY pool-A enemy in the box for $1E0', () => {
  const ram = new Ram();
  beamRec(ram);
  ram.bset8(RAM.player1 + 0x01, 6);
  const e1 = enemyAt(ram, BOMBRAM.poolA, 3);
  const e2 = enemyAt(ram, BOMBRAM.poolA, 9);
  const far = enemyAt(ram, BOMBRAM.poolA, 20, { y: 0x6800, x: 0x6000 });
  const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  assert.equal(r.hitsA, 2, 'both, and not the one outside the box');
  assert.equal(ram.u16(e1 + 0x18), 0x2000 - 0x1e0);
  assert.equal(ram.u16(e2 + 0x18), 0x2000 - 0x1e0);
  assert.equal(ram.u16(far + 0x18), 0x2000, 'untouched');
});

test('...but pool B is ONE enemy, the NEAREST, for $208', () => {
  const ram = new Ram();
  // **POOL B WALKS RECORDS 1..41 AND POOL A WALKS 0..44.**  `$245780 lea
  // ($30,A6),A6` is the whole difference and it is one instruction; a fixture
  // with only record 0 live sees pool A hit and pool B not, which is how this
  // was found.
  beamRec(ram, BOMBRAM.stride);
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.setU16(RAM.player1 + P.posY, 0x0100);
  const near = enemyAt(ram, BOMBRAM.poolB, 2, { y: 0x0f00 });
  const far = enemyAt(ram, BOMBRAM.poolB, 5, { y: 0x1900 });
  const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  assert.equal(r.hitsB, 1, '$2457FA damages exactly the one $812954 names');
  assert.equal(ram.u32(BOMBRAM.g12954), near, '$2457E2 move.l A5,$812954');
  assert.equal(ram.u16(near + 0x18), 0x2000 - 0x208, '$245814 subi.w #$208');
  assert.equal(ram.u16(far + 0x18), 0x2000, 'the FARTHER one is untouched');
});

test('$2457C6 keeps the MINIMUM: a nearer pool-B enemy replaces a farther one '
  + 'and not the other way round', () => {
  const ram = new Ram();
  beamRec(ram, BOMBRAM.stride);
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.setU16(RAM.player1 + P.posY, 0x0100);
  // slot 2 is FARTHER and is seen FIRST, so a port that took the last write
  // would end on it.
  enemyAt(ram, BOMBRAM.poolB, 2, { y: 0x1900 });
  const near = enemyAt(ram, BOMBRAM.poolB, 7, { y: 0x0f00 });
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  assert.equal(ram.u32(BOMBRAM.g12954), near);
});

test('$2457D6 FLOORS $812952 at the player Y + $C00', () => {
  const ram = new Ram();
  beamRec(ram, BOMBRAM.stride);
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.setU16(RAM.player1 + P.posY, 0x1000);   // + $C00 = $1C00
  enemyAt(ram, BOMBRAM.poolB, 2, { y: 0x1100 });
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  // The enemy's near edge is $1100 - $100 = $1000, well below the floor, so
  // $812952 must read the FLOOR and not the edge.  Without the floor the beam
  // would report a target behind the ship and $2496C2 would drag it for ever.
  assert.equal(ram.u16(BOMBRAM.g12952), 0x1c00);
});

test('THE POOL-B TARGET SHADOWS POOL A: $24588E drops anything behind it',
  () => {
    const ram = new Ram();
    beamRec(ram);
    ram.bset8(RAM.player1 + 0x01, 6);
    ram.setU32(BOMBRAM.g12954, 0x00815300);      // a pool-B target is held
    ram.setU16(BOMBRAM.g12952, 0x0800);          // ...at $800
    const behind = enemyAt(ram, BOMBRAM.poolA, 4, { y: 0x0900 });
    const front = enemyAt(ram, BOMBRAM.poolA, 6, { y: 0x0700 });
    const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
    assert.equal(r.hitsA, 1);
    assert.equal(ram.u16(front + 0x18), 0x2000 - 0x1e0);
    assert.equal(ram.u16(behind + 0x18), 0x2000, '$24588E cmp/bcc');
  });

test('a bomb record with BIT 1 SET does no damage at all ($24578C btst #$1)',
  () => {
    const ram = new Ram();
    // `$245788 move.b (A6),D4` reads the HIGH byte of the type word, so the
    // bit is **word bit 9**, not bit 1 of the low byte -- the same bit
    // `$256154 btst #$1,(A6)` parks record 44 with and the same one the
    // install seeds `$8200`.  A fixture that set the low byte's bit 1 finds
    // both readings agreeing, which is how this row was found defective.
    beamRec(ram, 0, { low: 0x0200 });
    ram.bset8(RAM.player1 + 0x01, 6);
    const e = enemyAt(ram, BOMBRAM.poolA, 3);
    const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
    assert.equal(r.hitsA, 0, 'the record is live but PARKED');
    assert.equal(ram.u16(e + 0x18), 0x2000);
  });

/** `$24593E bmi $2459C6` skips a NEGATIVE +2 word, and `$2459B6 move.w
 *  #$FFFF,(A5)` is how a bullet is erased -- so `$FFFF` is "already gone".  A
 *  fresh `Ram` is all zeroes, i.e. 211 bullets sitting live at (0,0), and the
 *  box in these fixtures covers (0,0): the first draft of the two rows below
 *  reported 70 erasures and would have passed a port that ignored the box
 *  entirely.  Parking the pool is what makes them checks. */
function parkBullets(ram) {
  for (let n = 0; n <= 0xd1; n++) {
    ram.setU16(BOMBRAM.bulletPool + 2 + n * BOMBRAM.bulletStride, 0xffff);
  }
}

test('$2459B2/$2459B6 ERASE a bullet inside the box, and the pair is TWO '
  + 'words at DIFFERENT offsets', () => {
  const ram = new Ram();
  beamRec(ram);
  parkBullets(ram);
  ram.bset8(RAM.player1 + 0x01, 6);
  const b = BOMBRAM.bulletPool + 5 * BOMBRAM.bulletStride;
  ram.setU16(b, 0x1234);                 // the status word
  ram.setU16(b + 0x02, 0x1000);          // Y -- POSITIVE, so $24593E passes
  ram.setU16(b + 0x04, 0x1000);          // X
  const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  assert.equal(r.erased, 1);
  assert.equal(ram.u16(b), 0, '$2459B2 clr.w (-$2,A5)');
  assert.equal(ram.u16(b + 0x02), 0xffff, '$2459B6 move.w #$FFFF,(A5)');
});

test('the bullet WALK LENGTH is the four-rung $81B414 ladder', () => {
  const mk = (rungs) => {
    const ram = new Ram();
    beamRec(ram);
    parkBullets(ram);
    ram.bset8(RAM.player1 + 0x01, 6);
    for (let i = 0; i < rungs; i++) ram.setU16(BOMBRAM.bulletWindow[i], 1);
    // one bullet at slot $50 = 80, inside the box: reachable only from the
    // SECOND rung on ($6D = 109).
    const b = BOMBRAM.bulletPool + 0x50 * BOMBRAM.bulletStride;
    ram.setU16(b, 0x1234);
    ram.setU16(b + 0x02, 0x1000); ram.setU16(b + 0x04, 0x1000);
    return bombDamageAlt2456A6(ram, ctx(), RAM.player1).erased;
  };
  assert.equal(mk(0), 0, '$245908 move.w #$45,D7 -- 70 slots, 80 is outside');
  assert.equal(mk(1), 1, '$245914 move.w #$6D,D7 -- 110 slots');
});

test('$2456A6 sets the $400 HIT BIT that $245638 never sets', () => {
  const ram = new Ram();
  beamRec(ram);
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.setU16(BOMBRAM.hitMask, 0x1000);
  const e = enemyAt(ram, BOMBRAM.poolA, 3);
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  // recon 38 1.5 and W64 6.1 both say the bit "has exactly two setters and
  // both are in the A2/A3 weapon loops".  $2458E2 is a third.
  assert.equal(ram.u16(e) & 0x1400, 0x1400,
    'the pass mask OR $400 -- and $400 is what routes the kill to $286876');
});

test('$2458EE bmi BREAKS the record walk when the HP goes negative', () => {
  const ram = new Ram();
  beamRec(ram, 0);                       // record 0
  beamRec(ram, BOMBRAM.stride);          // record 1 -- a second armed record
  ram.bset8(RAM.player1 + 0x01, 6);
  const e = enemyAt(ram, BOMBRAM.poolA, 3);
  ram.setU16(e + 0x18, 0x0100);          // less than $1E0
  const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  assert.equal(r.hitsA, 1, 'the SECOND record does not hit the dead enemy');
  assert.equal(ram.u16(e + 0x18), (0x0100 - 0x1e0) & 0xffff);
});

// ===========================================================================
// THE THREE PATHS $249A92 MADE REACHABLE
// ===========================================================================
test('$249A92 bset #$7 is what turns on $2496A2, $24D188 and $24A4E2', () => {
  const ram = new Ram();
  const rec = player(ram);
  assert.equal(ram.btst8(rec + P.flags1, 7), false);
  fireBomb2498E2(ram, ctx(), rec, 0);
  assert.equal(ram.btst8(rec + P.flags1, 7), true);
  // ...and the two ramp cursors the three paths read, both seeded by the arm.
  assert.equal(ram.u16(rec + 0x46), 0x2e, '$249AA4 -- $2496A2 reads this');
  assert.equal(ram.u16(BOMBRAM.optP1 + 0x38), 0x26, '$249AD8 -- $24D188 does');
  assert.equal(ram.u16(BOMBRAM.optP1 + 0x56), 0x08, '$249ADE -- $24D200 does');
  assert.equal(ram.u16(rec + 0x26), 0x0101,
    '$249A86 -- $24A4E2 reads BOTH bytes of this word, ($26) and ($27)');
  void OPT;
});

// ===========================================================================
// THE ROWS THE MUTATION SWEEP DEMANDED
// ===========================================================================
// `.scratch/mutate65.mjs` ran 59 single-instruction mutants and TWENTY-THREE
// survived the first pass.  Everything below exists because one of them did.

test('$2456A6 leaves the WHOLE box at $80FA74, all four words exact', () => {
  const ram = new Ram();
  // One record, deliberately ASYMMETRIC in all four extents so no two of the
  // four words can be swapped without showing, at a position that is not the
  // origin so the +D6 bias cannot hide in a zero.
  const a = BOMBRAM.rec;
  ram.setU16(a, 0x8001);
  ram.setU16(a + 0x02, 0x1000); ram.setU16(a + 0x04, 0x0800);
  ram.setU16(a + 0x10, 0x0100); ram.setU16(a + 0x12, 0x0200);
  ram.setU16(a + 0x14, 0x0300); ram.setU16(a + 0x16, 0x0400);
  ram.bset8(RAM.player1 + 0x01, 6);
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  // $2456E4 keeps the MAX of (x + $14) against the seed $F800 (SIGNED -2,048);
  // $2456EC the MIN of (x - $16) against $4000; $2456F4 the MAX of (y + $10)
  // against $F800; $2456FC the MIN of (y - $12) against $7C00.  Then
  // `$24570C add.w D6,(A5)+` x4 with D6 = $2800.
  assert.equal(ram.u16(BOMBRAM.box + 0), (0x0800 + 0x0300 + 0x2800) & 0xffff,
    'max X');
  assert.equal(ram.u16(BOMBRAM.box + 2), (0x0800 - 0x0400 + 0x2800) & 0xffff,
    'min X');
  assert.equal(ram.u16(BOMBRAM.box + 4), (0x1000 + 0x0100 + 0x2800) & 0xffff,
    'max Y');
  assert.equal(ram.u16(BOMBRAM.box + 6), (0x1000 - 0x0200 + 0x2800) & 0xffff,
    'min Y');
});

test('...and with NO live record the four SEEDS survive, biased by D6', () => {
  const ram = new Ram();
  ram.bset8(RAM.player1 + 0x01, 6);
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  // $2456A6 move.w #$F800,D0 / $2456B2 #$4000 / $2456B8 #$7C00, and D6 is
  // `$24518A move.w #$2800,D6` -- the CALLER's, because `$24563E move.w
  // $80FA72,D6` is on the OTHER arm of `$245636`.
  assert.deepEqual([0, 2, 4, 6].map((o) => ram.u16(BOMBRAM.box + o)),
    [(0xf800 + 0x2800) & 0xffff, (0x4000 + 0x2800) & 0xffff,
      (0xf800 + 0x2800) & 0xffff, (0x7c00 + 0x2800) & 0xffff]);
});

test('the pools are FIFTY and ONE HUNDRED slots, and the last one counts',
  () => {
    const ram = new Ram();
    beamRec(ram, BOMBRAM.stride);
    ram.bset8(RAM.player1 + 0x01, 6);
    // $245720 `moveq #$31,D7` + `dbra` is 50, and $245822 `move.w #$63,D7` is
    // 100 -- so slots 49 and 99 are the LAST ones and a loop one short misses
    // exactly them.
    const b = enemyAt(ram, BOMBRAM.poolB, 49);
    // NEARER than the pool-B one: with $812954 set, $24588E drops any
    // pool-A enemy behind it (the row above this file has for that).
    const a = enemyAt(ram, BOMBRAM.poolA, 99, { y: 0x0800 });
    const r = bombDamageAlt2456A6(ram, ctx(), RAM.player1);
    assert.equal(r.hitsB, 1, 'pool B slot 49');
    assert.equal(r.hitsA, 1, 'pool A slot 99');
    assert.equal(ram.u16(b + 0x18), 0x2000 - 0x208);
    assert.equal(ram.u16(a + 0x18), 0x2000 - 0x1e0);
  });

test('POOL B walks records 1..41 and POOL A walks 0..44 -- both ends', () => {
  // record 0 ONLY: pool A hits, pool B cannot.
  const only0 = new Ram();
  beamRec(only0, 0);
  only0.bset8(RAM.player1 + 0x01, 6);
  enemyAt(only0, BOMBRAM.poolA, 3);
  enemyAt(only0, BOMBRAM.poolB, 3);
  const r0 = bombDamageAlt2456A6(only0, ctx(), RAM.player1);
  assert.equal(r0.hitsA, 1, '$245898 movea.l A0,A6 -- pool A starts at 0');
  assert.equal(r0.hitsB, 0, '$245780 lea ($30,A6),A6 -- pool B starts at 1');
  // record 41 ONLY, the LAST of pool B's `moveq #$28,D7` + `dbra`.
  const only41 = new Ram();
  beamRec(only41, 41 * BOMBRAM.stride);
  only41.bset8(RAM.player1 + 0x01, 6);
  enemyAt(only41, BOMBRAM.poolB, 3);
  assert.equal(bombDamageAlt2456A6(only41, ctx(), RAM.player1).hitsB, 1);
  // record 44, which pool A reaches and pool B does not.
  const only44 = new Ram();
  beamRec(only44, 44 * BOMBRAM.stride);
  only44.bset8(RAM.player1 + 0x01, 6);
  enemyAt(only44, BOMBRAM.poolA, 3);
  enemyAt(only44, BOMBRAM.poolB, 3);
  const r44 = bombDamageAlt2456A6(only44, ctx(), RAM.player1);
  assert.equal(r44.hitsA, 1, 'pool A reaches record 44');
  assert.equal(r44.hitsB, 0, 'pool B stops at 41');
});

test('$2457C2 uses D1 (the enemy near edge), not D0 (its far one)', () => {
  const ram = new Ram();
  beamRec(ram, BOMBRAM.stride);
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.setU16(RAM.player1 + P.posY, 0x0000);      // the floor is + $C00
  // ASYMMETRIC extents: +Y $800, -Y $100.  D0 = y + $2800 + $800 and
  // D1 = y + $2800 - $100, so `D1 - D6` is y - $100 and `D0 - D6` is y + $800
  // -- $900 apart, and both are above the $C00 floor.
  const e = enemyAt(ram, BOMBRAM.poolB, 4, { y: 0x2000 });
  ram.setU16(e + 0x10, 0x800); ram.setU16(e + 0x12, 0x100);
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  assert.equal(ram.u16(BOMBRAM.g12952), 0x2000 - 0x100,
    '$2457C2 move.w D1,D4 / $2457C4 sub.w D6,D4');
});

test('$2458D8 bset #$4 marks the RECORD that scored, and it is bit 4', () => {
  const ram = new Ram();
  beamRec(ram, 0);
  beamRec(ram, 7 * BOMBRAM.stride);
  ram.bset8(RAM.player1 + 0x01, 6);
  enemyAt(ram, BOMBRAM.poolA, 3);
  bombDamageAlt2456A6(ram, ctx(), RAM.player1);
  // Record 0 hits first and `$2458EE bmi` does NOT fire ($2000 - $1E0 is
  // positive), so record 7 hits too -- both are marked.
  assert.equal(ram.u8(BOMBRAM.rec) & 0x10, 0x10, 'record 0');
  assert.equal(ram.u8(BOMBRAM.rec + 7 * BOMBRAM.stride) & 0x10, 0x10);
});

test('$2560D2 steps ($24,A6) by FOUR and reloads from ($26,A6)', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  const rom = beamRom();
  const seen = [];
  for (let n = 0; n < 4; n++) {
    bombDriver255DD8(ram, rom, ctx());
    seen.push(ram.u16(BOMBRAM.rec + 0x24));
  }
  // The install seeds ($24,A6) = 8 and ($26,A6) = 8, so `subq.w #$4` gives
  // 4, 0, then BORROWS and reloads 8, then 4.  A step of 8 would give 0, then
  // reload for ever and never read the middle entry of the three-long tables.
  assert.deepEqual(seen, [4, 0, 8, 4]);
});

test('$2561AA reloads ($80A,A6) to $1C, which is $256692 eight entries',
  () => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    const rom = beamRom();
    const seen = [];
    for (let n = 0; n < 9; n++) {
      bombDriver255DD8(ram, rom, ctx());
      seen.push(ram.u16(BOMBRAM.rec + 0x80a));
    }
    // Seeded $1C by the install, `subq.w #$4` per frame, and `$2561B0 move.w
    // #$1C` on the borrow -- so the cursor is $18,$14,$10,$C,$8,$4,$0,$1C,$18
    // and $256692's EIGHT entries are exactly its range.
    assert.deepEqual(seen, [0x18, 0x14, 0x10, 0x0c, 8, 4, 0, 0x1c, 0x18]);
  });

// ===========================================================================
// THE EXPORTER'S OWN CLAIMS
// ===========================================================================
// A unit test can only read the exporter's SOURCE; the run against the real
// cartridge is `check_beam_bomb_extents`, and the worklog 11 has it green.
// These pin the claims so a later edit that narrows a window or drops the
// check has to say so here too.
const TOOL = fs.readFileSync(
  new URL('../tools/export-tables.py', import.meta.url), 'utf8');

test('the exporter ASSERTS the LASER BOMB extents against the cartridge',
  () => {
    assert.ok(/def check_beam_bomb_extents/.test(TOOL));
    assert.ok(/-> dict:\n(?:\s*check_\w+\(d\)[^\n]*\n)*\s*check_beam_bomb_extents\(d\)/
      .test(TOOL), 'and it runs on EVERY export, not behind a flag');
  });

test('the eight W65 ROM windows are declared with the lengths the port reads',
  () => {
    for (const [a, n] of [['0x256662', '0x0648'], ['0x256CAA', '0x00B0'],
      ['0x242EDE', '0x0100'], ['0x28ABA0', '0x0040'], ['0x243174', '0x0080'],
      ['0x28A030', '0x000C'], ['0x28A464', '0x00A2'], ['0x24D282', '0x003C']]) {
      assert.ok(TOOL.includes(`(${a}, ${n},`), `${a} + ${n}`);
    }
    // Each ship's half is $324 bytes: four 12-byte head tables, eight
    // pointers, eight 12-byte targets, twelve 20-byte entries plus terminator,
    // and twelve 32-byte tables. The combined window is twice that size.
    const oneShip = 4 * 12 + 32 + 96 + 12 * 20 + 4 + 12 * 32;
    assert.equal(oneShip, 0x324);
    assert.equal(BEAM_TEMPLATES.dataLen, oneShip * 2);
    assert.equal(BEAM_TEMPLATES.data + BEAM_TEMPLATES.dataLen,
      BEAM_TEMPLATES.install);
    // ...and $256CAA's is the install sequence plus the 18-byte segment
    // template, which must abut it.
    assert.equal(BEAM_TEMPLATES.install + BEAM_TEMPLATES.installLen,
      BEAM_TEMPLATES.seg);
    assert.equal(BEAM_TEMPLATES.installLen + BEAM_TEMPLATES.segLen, 0xb0);
  });

test('the LASER BOMB SPARK speed domain is DERIVED, not listed', () => {
  assert.ok(/def beam_spark_speed_indices/.test(TOOL));
  assert.ok(/s\.update\(beam_spark_speed_indices\(d\)\)/.test(TOOL),
    'and speed_index_set() uses it');
  // The two immediates come out of the OPCODE and the extension word, never
  // out of this file: `$28A272 addq.b #$4,D0` and `$28A284 move.w #$C0,D0`.
  assert.ok(/op = u16\(d, BEAM_SPARK_ADD_AT\)/.test(TOOL));
  assert.ok(/const = u16\(d, BEAM_SPARK_CONST_AT \+ 2\)/.test(TOOL));
});

// ---- and the ELEVEN more the second sweep demanded ------------------------
//
// These are all AFTER ONE DRIVER FRAME, because `$255FE2` installs and then
// runs `$2562FC` and `$256348` in the same frame -- there is no observable
// moment between them, which is exactly why the gate could not see any of it.

test('$25606C biases record 42 by -$200 and $2560C6 writes the SHORT axis',
  () => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    ram.setU16(RAM.player1 + P.posY, 0x3000);
    ram.setU16(RAM.player1 + P.posX, 0x1234);
    bombDriver255DD8(ram, beamRom(), ctx());
    // The install puts (playerY + $FE00) on +$02 and then `$2562FC` adds $400
    // and the player's velocity (0 here).  A `+$200` bias would land $400
    // higher and a `move.l` at `$2560C6` would overwrite the bias entirely.
    assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.tail + 0x02),
      (0x3000 + 0xfe00 + 0x400) & 0xffff, '$256064/$25606C addi.w #$FE00');
    assert.equal(ram.u16(BOMBRAM.rec + BEAM_REC.tail + 0x04), 0x1234,
      '$2560C6 move.w D0 -- the LOW word, i.e. the SHORT axis');
  });

test('a live segment advances $400 PLUS the player velocity, per frame', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  ram.setU16(RAM.player1 + P.posY, 0x1000);
  ram.setU16(RAM.player1 + P.velY, 0x0123);      // ($30,A5) -- NOT ZERO
  const rom = beamRom();
  bombDriver255DD8(ram, rom, ctx());             // seeds segment 1
  const s = BOMBRAM.rec + BEAM_REC.seg0;
  const y0 = ram.u16(s + 0x02);
  bombDriver255DD8(ram, rom, ctx());
  // $256218 move.w ($2,A6),D0 / $25621C addi.w #$200 / $256220 add.w ($30,A5)
  // / $25623E addi.w #$200 -- TWO $200s and the velocity.  A corpus in which
  // the ship is not moving holds ($30,A5) at 0 and cannot see the third term,
  // which is why this row sets it and why the gate's own row could not.
  assert.equal(ram.u16(s + 0x02), (y0 + 0x400 + 0x123) & 0xffff);
});

test('$256234 culls a segment at $7800, and $7700 is NOT culled', () => {
  const mk = (y) => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    ram.setU16(RAM.player1 + P.posY, 0x1000);
    const rom = beamRom();
    bombDriver255DD8(ram, rom, ctx());           // seeds segment 1
    const s = BOMBRAM.rec + BEAM_REC.seg0;
    ram.setU16(s + 0x02, y);                     // ...and place it by hand
    bombDriver255DD8(ram, rom, ctx());
    return (ram.u16(s) & 0x8000) !== 0;
  };
  // The bound is tested on the value after ONE `addi.w #$200` and the
  // velocity (0 here), so $7600 + $200 = $7800 is the first culled one.
  assert.equal(mk(0x7500), true, '$7700 survives $256234 cmpi.w #$7800 / bcs');
  assert.equal(mk(0x7600), false, '$7800 does not');
});

test('$256330 stops record 42 at $7E00, not at $7F00', () => {
  const mk = (y) => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    const rom = beamRom();
    bombDriver255DD8(ram, rom, ctx());
    ram.setU16(BOMBRAM.rec + BEAM_REC.tail + 0x02, y);
    ram.setU16(BOMBRAM.rec + BEAM_REC.tail + 0x28, 0);
    bombDriver255DD8(ram, rom, ctx());
    return ram.u16(BOMBRAM.rec + BEAM_REC.tail + 0x28);
  };
  // $256324 addi.w #$400 runs first, so $7A00 -> $7E00 is the first stop.
  assert.equal(mk(0x7900), 0, '$7D00 keeps going');
  assert.equal(mk(0x7a00), 1, '$7E00 sets ($28,A6) := 1');
});

test('$256386 bset #$1 READS THE OLD BIT, like $255F7E bchg', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  // Record 44's install word is $8200, i.e. bit 1 ALREADY SET, so `$256386
  // bset` must find it set and RETURN.  Everything past it -- `$25638C bclr`,
  // the `$7E2` write and `$2563AC bset #$6,(A0)` -- must NOT run on frame 1.
  // Record 0's bit 6 is the cleanest witness: nothing else in the frame
  // touches it.
  bombDriver255DD8(ram, beamRom(), ctx());
  assert.equal(ram.btst8(BOMBRAM.rec + BEAM_REC.tip, 1), true, 'the $8200 bit');
  assert.equal(ram.btst8(BOMBRAM.rec, 6), false,
    '$2563AC bset #$6,(A0) is behind the `bne` and did not run -- a port that '
    + 'read the NEW bit would have fallen through on the very first frame');
});

test('$2563B6 rebuilds $400 apart, and ($80A,A6) ends the frame at $18', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8001);
  ram.setU16(RAM.player1 + P.posY, 0x0400);
  const rom = beamRom();
  // Run out the 120-frame phase so `($18,A6)` is 1 and `$256192 bsr $2563B6`
  // is on the path.
  for (let n = 0; n < 121; n++) bombDriver255DD8(ram, rom, ctx());
  assert.equal(ram.u16(BOMBRAM.rec + 0x18), 1, 'phase 2');
  // `$256460 move.w #$1C,($80A,A6)` is the LAST thing the rebuild does, and
  // then `$256196 bra $256120` runs `$2561AA`, whose own `subq.w #$4` takes
  // it to $18 before the frame ends.  So the OBSERVABLE value is $18 and the
  // instruction's own is $1C -- both are stated because a reader who checks
  // only the listing will expect $1C here.
  assert.equal(ram.u16(BOMBRAM.rec + 0x80a), 0x18);
  const y1 = ram.u16(BOMBRAM.rec + BEAM_REC.seg0 + 0x02);
  const y2 = ram.u16(BOMBRAM.rec + BEAM_REC.seg0 + BOMBRAM.stride + 0x02);
  assert.equal((y2 - y1) & 0xffff, 0x400, '$2563F8 addi.w #$400,D6');
});

test('BOTH 41-segment loops reach segment 41, and the proof is the CLEAR',
  () => {
    // The seeder cannot show it: `[M]` a segment is culled at $7800 and the
    // step is $400, so at most 29 are ever live at once and a `dbra` one
    // short is invisible in the count.  What IS visible is that segment 41
    // gets CLEARED -- by `$25623A clr.w (A6)` in $2561AA and by `$2563D4
    // clr.w (A1)` in $2563B6.  Both loops are exercised with a hand-placed
    // live record in slot 41.
    const seg41 = BOMBRAM.rec + 41 * BOMBRAM.stride;
    // (a) $2561AA, phase 1: a live segment past $7800 must be cleared.
    const a = new Ram();
    a.setU16(BOMBRAM.rec, 0x8001);
    const rom = beamRom();
    bombDriver255DD8(a, rom, ctx());
    a.setU16(seg41, 0x8000);
    a.setU16(seg41 + 0x02, 0x7700);              // + $200 -> $7900, past $7800
    a.setU32(seg41 + 0x18, 0x2566b2);            // a pointer $256212 can read
    bombDriver255DD8(a, rom, ctx());
    assert.equal(a.u16(seg41), 0, '$25623A clr.w (A6) reached slot 41');
    // (b) $2563B6, phase 2: everything past the beam's end is cleared.
    const b = new Ram();
    b.setU16(BOMBRAM.rec, 0x8001);
    b.setU16(RAM.player1 + P.posY, 0x0400);
    for (let n = 0; n < 121; n++) bombDriver255DD8(b, rom, ctx());
    assert.equal(b.u16(seg41), 0, '$2563D4 clr.w (A1) reached slot 41');
    assert.equal(BEAM_REC.segs, 41, 'moveq #$28,D7 plus the dbra');
  });

// ===========================================================================
// $24D188 -- THE PODS' KNOCKBACK
// ===========================================================================
/** `$24D282`'s five words and `$24D28E`'s twenty, as the cartridge holds them.
 *  `[M]` read out of the image this session; the exporter asserts the two
 *  `lea`s, the `subq.w #$2` and `$24D2BE`'s `moveq #$0,D0` on every export. */
// SIX words, not five: the `movem.w (A0,D0.w),D0-D1` at index 8 reads words
// 4 AND 5, so the settle table runs $24D282..$24D28D and $24D28E abuts it.
const SETTLE = [0, 0, 8, 32, 8, 0];
const RAMP = [0, 0, 8, 16, 32, 48, 64, 88, 112, 136,
  160, 192, 224, 256, 288, 320, 384, 448, 512, 256];
function realRom() {
  const at = (a) => {
    if (a >= POD_KNOCK.ramp && a < POD_KNOCK.ramp + 40) {
      return RAMP[(a - POD_KNOCK.ramp) >> 1];
    }
    if (a >= POD_KNOCK.settle && a < POD_KNOCK.settle + 12) {
      return SETTLE[(a - POD_KNOCK.settle) >> 1];
    }
    throw new Error(`realRom: $${a.toString(16)} is outside $24D282+$3C`);
  };
  return { u8: (a) => at(a & ~1) & 0xff, u16: at, u32: (a) => at(a) };
}
let lastVector = { spd: null, ang: null };
const fakeTables = () => ({
  vector: (spd, ang) => { lastVector = { spd, ang }; return { dy: 7, dx: 11 }; },
});

test('$24D188 walks the $24D28E ramp, and the FIRST push is the LAST entry',
  () => {
    const ram = new Ram();
    const rom = realRom();
    const pod = 0x8104aa;
    ram.setU16(pod + OPT.posY, 0x4000);
    ram.setU16(pod + 0x38, 0x26);                  // $249AD8's seed
    ram.setU16(0x812970, 1);                       // the draw freeze, so the
    // four gates below the ramp skip the shadow enqueue and this row is about
    // the ramp alone.
    podKnockback24D188(ram, ctx({ rom }), { player: RAM.player1 }, pod);
    // `($38,A6)` is $26 and the table is indexed in BYTES, so the first read
    // is `$24D28E[19]` -- and [19] is $0100 while [18] is $0200, i.e. the push
    // gets BIGGER on the second frame.  A reader who assumed a decay would
    // have written the table backwards.
    assert.equal(ram.u16(pod + OPT.posY), 0x4000 - 0x0100, 'frame 1: $100');
    assert.equal(ram.u16(pod + 0x38), 0x24, '$24D19C subq.w #$2');
    podKnockback24D188(ram, ctx({ rom }), { player: RAM.player1 }, pod);
    assert.equal(ram.u16(pod + OPT.posY), 0x4000 - 0x0100 - 0x0200,
      'frame 2: $200, which is LARGER');
    assert.equal(ram.u16(pod + 0x38), 0x22);
  });

test('...and when the ramp is spent, $24D200 SETTLES through $2417D4', () => {
  const ram = new Ram();
  const rom = realRom();
  const pod = 0x8104aa;
  ram.setU16(pod + OPT.posY, 0x4000);
  ram.setU16(pod + OPT.posX, 0x2000);
  ram.setU16(pod + 0x38, 0);                       // the ramp is over
  ram.setU16(pod + 0x56, 0x08);                    // $249ADE's seed
  ram.setU16(0x812970, 1);
  podKnockback24D188(ram, ctx({ rom, tables: fakeTables() }),
    { player: RAM.player1 }, pod);
  // `$24D200 move.w ($56,A6),D0` reads BEFORE `$24D204 subq.w #$4`, so the
  // first `movem.w` is at index 8 -- $24D282[4] and [5] -- and the cursor
  // ends at 4.
  assert.equal(ram.u16(pod + 0x56), 4, '$24D204 subq.w #$4');
  assert.equal(lastVector.spd, 8, '$24D282 + 8 -> the speed word');
  assert.equal(lastVector.ang, 0, '...and the angle word beside it');
  assert.equal(ram.u16(pod + OPT.posY), 0x4000 + 7, '$2417F4 add.w D2');
  assert.equal(ram.u16(pod + OPT.posX), 0x2000 + 11, '$2417F8 add.w D3');
  // ...and it RELOADS to 8 when the cursor borrows.
  ram.setU16(pod + 0x56, 0);
  podKnockback24D188(ram, ctx({ rom, tables: fakeTables() }),
    { player: RAM.player1 }, pod);
  assert.equal(ram.u16(pod + 0x56), 8, '$24D208 bpl / $24D20A move.w #$8');
});

test('$256224: with $812954 SET the cull is $812952 AND STILL $7800', () => {
  // `$256224 tst.w $812954 / beq $256234` -- with a pool-B target held, a
  // segment is culled if it passes THAT target ($25622C cmp/bhi) **or** the
  // $7800 bound ($256234).  The row above only reaches the second arm, and a
  // mutant that widened the FIRST arm's own $7800 to $7900 survived it.
  const mk = (y, g12952) => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    ram.setU16(RAM.player1 + P.posY, 0x1000);
    const rom = beamRom();
    bombDriver255DD8(ram, rom, ctx());             // seeds segment 1
    const s = BOMBRAM.rec + BEAM_REC.seg0;
    ram.setU16(s + 0x02, y);
    ram.setU32(BOMBRAM.g12954, 0x00815300);        // a pool-B target IS held
    ram.setU16(BOMBRAM.g12952, g12952);
    bombDriver255DD8(ram, rom, ctx());
    return (ram.u16(s) & 0x8000) !== 0;
  };
  assert.equal(mk(0x7500, 0x7f00), true, '$7700 is under both bounds');
  assert.equal(mk(0x7600, 0x7f00), false, '$7800 fails $256234 even so');
  assert.equal(mk(0x5000, 0x5100), false, '$5200 fails $25622C cmp/bhi');
  assert.equal(mk(0x5000, 0x5300), true, '...and $5200 under it survives');
});

// ===========================================================================
// WAVE 66 -- **THE FORTY-ONE SEGMENTS NEVER EMITTED A RECORD**
// ===========================================================================
// W65 transcribed `$25624C jsr $23FF42`, `$2562EA jsr $23FF42` and
// `$25620C bra.b $25624C` as a bare counter and never appended anything to
// bucket 13.  Nothing in this file, in `tools/w65beamgate.mjs` or in
// `pgm.py check` could see it: bucket 13 had no sprite shard until W66, so
// every record it DID emit was skipped for want of a picture and a MISSING
// record looked exactly like a SKIPPED one.  It was found by opening the page
// with the art shipped.
//
// The row below is about the RECORD, not about the count: it reads bucket 13's
// own counter `$80AFEC` and the twelve bytes at `$80A8DC`, so a port that
// bumps `drawn` without emitting fails it, and so does one that emits the
// wrong record.
test('W66: $25624C jsr $23FF42 -- EACH LIVE SEGMENT APPENDS A BUCKET-13 RECORD',
  () => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    ram.setU16(RAM.player1 + P.posY, 0x2000);
    ram.setU16(RAM.player1 + P.posX, 0x1800);
    const rom = beamRom();
    const draws = [];
    const c = ctx({ bombEvent: (k, v) => { if (k === 'draw') draws.push(v); } });
    const live = () => {
      let n = 0;
      for (let k = 1; k <= BEAM_REC.segs; k++) {
        if (ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) & 0x8000) n++;
      }
      return n;
    };
    // Three driver frames: one segment is seeded per frame, so the SEGMENT
    // records go 1, 2, 3 and the four heads are constant. The counter is the
    // claim -- `$23FF12 addi.w #$C` -- not the event.
    // [M] the heads: `$256130`/`$25614A`/`$25615A` draw unconditionally and
    // `$256140` is behind `$25613A btst #$1,($7E0,A6)`, so this fixture's
    // three frames all carry the same number.
    const HEADS = 3;
    let prevSegs = 0, prevRecords = 0;
    for (let f = 1; f <= 3; f++) {
      ram.setU16(BOMBRAM.bucket13Counter, 0);
      draws.length = 0;
      bombDriver255DD8(ram, rom, c);
      const records = ram.u16(BOMBRAM.bucket13Counter) / 0x0c;
      assert.equal(records, draws.length,
        `frame ${f}: $80AFEC counts ${records} records and $23FF36 wrote `
        + `${draws.length} -- the counter and the writes must agree`);
      assert.equal(live(), f, `frame ${f}: one segment seeded per frame`);
      // THE EXACT NUMBER, not an inequality: [M] the four heads emit HEADS
      // records a frame and every live segment emits exactly one more, so a
      // port that keeps W65's bare `drawn++` reports HEADS on all three frames
      // and this row goes red on frame 1.
      assert.equal(records, HEADS + live(),
        `frame ${f}: ${live()} segments are live, so bucket 13 must hold `
        + `${HEADS} head records + ${live()} segment records = `
        + `${HEADS + live()}, and it holds ${records}. W65 counted the three `
        + '`jsr $23FF42` sites and emitted none of them');
      prevSegs = live(); prevRecords = records;
    }
    void prevSegs;
    // And the record's own bytes: `$23FF36 move.l D0,(A0)+` writes the packed
    // position with BOTH live bits set, which is what makes it a real
    // display-list entry rather than a zeroed slot.
    const a0 = BOMBRAM.bucket13;
    assert.equal((ram.u32(a0) & 0x80008000) >>> 0, 0x80008000,
      '$23FF30 ori.l #$80008000 -- the two live bits');
    assert.notEqual(ram.u32(a0 + 4), 0,
      '$23FF38 -- the anim long, i.e. the segment\'s PICTURE');
  });
