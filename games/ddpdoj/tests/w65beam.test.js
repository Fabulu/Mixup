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
import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import {
  BOMB, BOMBRAM, BEAM_REC, BEAM_TEMPLATES, bombDriver255DD8,
  bombDamageAlt2456A6, fireBomb2498E2,
} from '../src/bomb.js';

const ctx = (extra = {}) => ({ unportedLog: new UnportedLog(), ...extra });

// ===========================================================================
// THE SYNTHETIC BEAM ROM
// ===========================================================================
const HEAD = [0x256662, 0x25666e, 0x25667a, 0x256686];   // rec 0 / 43 / 42 / 44
const PTRS = 0x256692;
const PTR_TARGETS = 0x2566b2;
const LIST = 0x256712;
const LIST_TABLES = 0x256806;

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
  // ---- the four head tables, three longwords each (index space {8,4,0}).
  HEAD.forEach((h, i) => { for (let k = 0; k < 3; k++) l(h + k * 4, 0x900 + i * 0x10 + k); });
  // ---- $256692's eight pointers and their twelve-byte targets.
  for (let i = 0; i < 8; i++) {
    l(PTRS + i * 4, PTR_TARGETS + i * 12);
    for (let k = 0; k < 3; k++) l(PTR_TARGETS + i * 12 + k * 4, 0xa00 + i * 0x10 + k);
  }
  // ---- $256712: TWELVE five-longword entries and the $FFFFFFFF.
  for (let i = 0; i < 12; i++) {
    const e = LIST + i * 20;
    for (let k = 0; k < 4; k++) l(e + k * 4, 0xb00 + i * 0x10 + k);
    l(e + 16, LIST_TABLES + i * 0x20);
    for (let k = 0; k < 8; k++) l(LIST_TABLES + i * 0x20 + k * 4, 0xc00 + i * 8 + k);
  }
  l(LIST + 12 * 20, 0xffffffff);
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

test('the ($1,A6)-bit-1 twin of $255FE2 THROWS at $256986', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8003);       // bit 0 (laser) AND bit 1 (selector)
  try {
    bombDriver255DD8(ram, beamRom(), ctx());
    assert.fail('$256086 must not be run');
  } catch (e) {
    assert.ok(e instanceof Unreached);
    assert.equal(e.romAddress, BOMB.beamScriptAltP1);
  }
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
