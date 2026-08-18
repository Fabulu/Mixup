// ===============================================================================================
// W416 -- DOCKET D48.  `$242EC2`'s SIGN TEST READS BIT 7, AND FIFTEEN SITES READ BIT 15.
// ===============================================================================================
//
// THE FACT.  `$242EC2` ends
//
//   $242ED6  10 30 00 00   move.b (A0,D0.w),D0
//   $242EDA  20 5f         movea.l (A7)+,A0      <- MOVEA writes no condition code
//   $242EDC  4e 75         rts                   <- nor does RTS
//
// so the last instruction in the routine to set N is the `move.b`, and **N is bit 7 of the
// table byte**.  Every `bpl`/`bmi` after a `jsr $242EC2` branches on that bit.  The port read
// `i16(drawWord242EC2(...)) < 0` -- bit 15 of a word whose high byte is `$803916`'s and is
// always zero -- so at fifteen sites ONE ARM COULD NEVER RUN.
//
// **THE DOCKET SAID ELEVEN AND W412 SAID TWELVE.  BOTH COUNTS ARE LOW.**  SECTION 1 re-derives
// the set by scanning the image rather than by trusting either number: 21 `bpl`/`bmi` sites in
// the ROM, 18 of them ported, 3 already right, 15 wrong.  The four in `src/boss3.js` appear in
// no earlier list.
//
// **THE RNG STREAM DOES NOT MOVE.**  Both readings draw exactly once at every one of the
// fifteen, and no arm of any of them makes a further draw (SECTION 5 asserts that from the
// bytes).  So a gate fingerprint that moves here is NOT an RNG shift and must be explained by
// the values themselves.
//
// SECTION 1  the scan -- how many sites there really are, and which file each is in
// SECTION 2  the four `src/initbody.js` sites, swept over the counter's whole period
// SECTION 3  the three HIBACHI gun inits, same sweep
// SECTION 4  the six CUE forks, driven end to end through the scheduler
// SECTION 5  the arms make no extra draws, so this cannot be called an RNG shift
// SECTION 6  the three sites that were ALREADY right, and why each was
// SECTION 7  the three ROM sites that are NOT ported, named rather than claimed
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { PaletteState } from '../src/palette.js';
import { SCHED, runScheduler25962E } from '../src/scheduler.js';
import { RNG, RNG_242EC2, drawNegative242EC2, drawWord242EC2 } from '../src/rng.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { gun5Init2A81BC, gun8Init2A8800, gun9Init2A89BA } from '../src/hibachiguns.js';
import { HIBACHI_A4 } from '../src/hibachiend.js';
import '../src/boss3.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');

const NEED = [IMAGE, TABLES];
const MISSING = NEED.filter((p) => !existsSync(p));
const SKIP = MISSING.length === 0 ? false
  : `${MISSING.map((p) => path.basename(p)).join(', ')} absent -- run `
    + 'tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';

const IMG = MISSING.length === 0 ? readFileSync(IMAGE) : null;
const tables = MISSING.length === 0 ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const MT = () => new MoveTables(tables);
const ROM = () => new RomWindows(tables.rom);

// ===============================================================================================
// SECTION 1 -- THE SCAN.
// ===============================================================================================

/** Every `4E B9 0024 2EC2` in the image, and the opcode that follows it. */
function scanSites() {
  const jsr = [];
  for (let a = 0; a + 6 <= IMG.length; a += 2) {
    if (w(a) === 0x4eb9 && l(a + 2) === 0x00242ec2) jsr.push(a);
  }
  const forks = jsr.filter((a) => IMG[a + 6] === 0x6a || IMG[a + 6] === 0x6b);
  return { jsr, forks };
}

test('W416 SECTION 1: the fact -- $242EC2\'s last CCR write is a BYTE move', { skip: SKIP },
  () => {
    assert.equal(w(0x242ec2), 0x5239, '$242EC2 `5239` addq.b #1,<abs.l>');
    assert.equal(l(0x242ec4), 0x00803917, '  ...$803917, the LOW byte of the state word');
    assert.equal(w(0x242ec8), 0x3039, '$242EC8 `3039` move.w <abs.l>,D0');
    assert.equal(l(0x242eca), 0x00803916, '  ...$803916 -- NO MASK, the whole word');
    assert.equal(w(0x242ed0), 0x41fa, '$242ED0 `41FA` lea (d16,PC),A0');
    assert.equal(0x242ed2 + w(0x242ed2), RNG_242EC2.table, '  ...$242EDE, the 256-byte table');
    assert.equal(w(0x242ed6), 0x1030, '$242ED6 `1030` move.b (A0,D0.w),D0 -- THE LAST CCR WRITE');
    assert.equal(w(0x242ed8), 0x0000, '  ...extension word $0000: index D0.w, displacement 0');
    assert.equal(w(0x242eda), 0x205f, '$242EDA `205F` movea.l (A7)+,A0 -- MOVEA sets no flag');
    assert.equal(w(0x242edc), 0x4e75, '$242EDC `4E75` rts -- and RTS sets none');
    // ...so N is bit 7 of the byte, and this is what the port must expose.
    let high = 0;
    for (let i = 0; i < RNG_242EC2.entries; i++) if (IMG[RNG_242EC2.table + i] & 0x80) high++;
    assert.equal(high, 128, '[M] EXACTLY 128 of the 256 table bytes have bit 7 set');
    // Every index is reachable: `addq.b` walks the low byte 0..255 and never carries.
    const ram = new Ram();
    const rom = ROM();
    const seen = new Set();
    for (let i = 0; i < 256; i++) seen.add(drawWord242EC2(ram, rom) & 0xff);
    assert.equal(seen.size, new Set(IMG.subarray(0x242ede, 0x242fde)).size,
      'a full period of the counter reads every DISTINCT byte the table holds');
  });

test('W416 SECTION 1: the site list is TWENTY-ONE in the ROM, not eleven and not twelve',
  { skip: SKIP }, () => {
    const { jsr, forks } = scanSites();
    assert.equal(jsr.length, 99, '99 `jsr $242EC2` in the image');
    // No `bsr` reaches it: a word `bsr` spans +-$8000, so only $23AEC4..$24AEC2 could.
    let bsr = 0;
    for (let a = 0x23a000; a < 0x24c000; a += 2) {
      const op = w(a);
      if ((op & 0xff00) !== 0x6100) continue;
      const lo = op & 0xff;
      if (lo === 0xff) continue;
      const t = lo === 0 ? a + 2 + (w(a + 2) >= 0x8000 ? w(a + 2) - 0x10000 : w(a + 2))
        : a + 2 + (lo > 127 ? lo - 256 : lo);
      if (t === 0x242ec2) bsr++;
    }
    assert.equal(bsr, 0, '...and NO `bsr` reaches it, so the caller set is the 99');
    assert.deepEqual(forks.map((a) => a.toString(16).toUpperCase()), [
      '264DF6', '27ADD4', '27B6FA', '27C2BC', '27C77A', '27D44A', '28A258', '29CE16',
      '29D1A8', '29D448', '29D5A4', '29E162', '2A5D4C', '2A6204', '2A6618', '2A7860',
      '2A81DA', '2A881E', '2A89D0', '2A8EEE', '2A9804',
    ], 'TWENTY-ONE of the 99 are followed immediately by `bpl`/`bmi`');
    assert.equal(forks.length, 21, '  ...twenty-one, and the docket says eleven, W412 twelve');
    // The other 78 are not sign tests at all: none has a `6A`/`6B` within four instructions.
    let stray = 0;
    for (const a of jsr) {
      if (forks.includes(a)) continue;
      for (let k = 6; k < 14; k++) if (IMG[a + k] === 0x6a || IMG[a + k] === 0x6b) stray++;
    }
    assert.equal(stray, 0, 'and no `6A`/`6B` byte appears in the eight bytes after any of the '
      + 'other 78, so nothing was missed by only looking at the NEXT instruction');
    assert.equal(IMG[0x29e168], 0x6b, '$29E168 is `6B` bmi -- the ONE site of the 21 that is a '
      + '`bmi`; every other is `bpl`, and reading them all as one shape would invert it');
  });

// ===============================================================================================
// SECTION 2 -- THE FOUR `src/initbody.js` SITES.
//
// Each is swept over ALL 256 states of the shared counter, which is its whole domain
// ($23BE36 clr.w $803916 zeroes the high byte and $242EC2's `addq.b` never carries into it).
// BEFORE this wave every one of the 256 took the `bpl` arm; the split below is what the
// hardware does.
// ===============================================================================================

const A5 = 0x818000, A6 = 0x819000;

function sweepBody(addr, read) {
  const hist = new Map();
  for (let c = 0; c < 256; c++) {
    const ram = new Ram();
    ram.setU16(RNG.state, c);
    ram.setU32(A5 + 0x06, A6);
    runInitBodyAddr(addr, ram, ROM(), A5, new UnportedLog(), MT(), new PaletteState(),
      () => {});
    const v = read(ram);
    hist.set(v, (hist.get(v) ?? 0) + 1);
  }
  return hist;
}

test('W416 SECTION 2: $264DF6 -- ($38,A5) is $02 on half the draws, never before',
  { skip: SKIP }, () => {
    assert.equal(w(0x264df0), 0x1b7c, '$264DF0 `1B7C` move.b #imm,(d16,A5)');
    assert.equal(w(0x264df2), 0x00fe, '  ...#$FE');
    assert.equal(w(0x264df4), 0x0038, '  ...into ($38,A5), UNCONDITIONALLY');
    assert.equal(w(0x264dfc), 0x6a06, '$264DFC `6A06` bpl.s $264E04');
    assert.equal(w(0x264e04), 0x4e75, '  ...$264E04 `4E75`, so the bpl arm writes NOTHING');
    assert.equal(w(0x264dfe), 0x1b7c, '$264DFE `1B7C` move.b #$2,($38,A5) -- the N arm');
    assert.equal(w(0x264e00), 0x0002, '  ...#$02');
    const h = sweepBody(0x264d5a, (ram) => ram.u8(A5 + 0x38));
    assert.deepEqual([...h.entries()].sort((a, b) => a[0] - b[0]), [[0x02, 128], [0xfe, 128]],
      '($38,A5) is $02 on 128 counter states and $FE on 128; the bit-15 reading gave $FE x256');
  });

test('W416 SECTION 2: $27ADD4 -- type $9C\'s ($1,A6) bit 6 sets on half the draws',
  { skip: SKIP }, () => {
    assert.equal(w(0x27adda), 0x6a06, '$27ADDA `6A06` bpl.s $27ADE2');
    assert.equal(w(0x27addc), 0x08ee, '$27ADDC `08EE` bset #imm,(d16,A6) -- mode 5, register 6, '
      + 'so A6 and not A3 (the W412 trap)');
    assert.equal(w(0x27ade0), 0x0001, '  ...($1,A6)');
    assert.equal(w(0x27adde), 0x0006, '  ...bit 6, i.e. `| $40`');
    const h = sweepBody(0x27ad96, (ram) => (ram.u8(A6 + 1) & 0x40) !== 0);
    assert.deepEqual([...h.entries()].sort(), [[false, 128], [true, 128]],
      'bit 6 is SET on 128 of the 256 counter states; before, it was set on none');
  });

test('W416 SECTION 2: $27C2BC -- type $9E\'s mirror arm, and its NEG is a WORD',
  { skip: SKIP }, () => {
    assert.equal(w(0x27c2c2), 0x6a0a, '$27C2C2 `6A0A` bpl.s $27C2CE');
    assert.equal(w(0x27c2ce), 0x4e75, '  ...$27C2CE `4E75`');
    assert.equal(w(0x27c2c4), 0x1d7c, '$27C2C4 `1D7C` move.b #imm,(d16,A6)');
    assert.equal(w(0x27c2c6), 0x0040, '  ...#$40');
    assert.equal(w(0x27c2c8), 0x001c, '  ...($1C,A6)');
    // THE OPERAND SIZE, CHECKED BECAUSE THIS ARM HAS NEVER RUN.  NEG is `0100 0100 SS eeeeee`
    // and SS=01 is WORD -- the same encoding that makes the brief's own `4254` a `clr.w`.
    assert.equal(w(0x27c2ca), 0x446d, '$27C2CA `446D` neg.?(d16,A5)');
    assert.equal((w(0x27c2ca) >> 6) & 3, 1, '  ...size bits 7-6 are 01 = WORD, so `neg.w`');
    assert.equal((w(0x2a81e4) >> 6) & 3, 0, '  ...and $2A81E4 `442C` has 00 = BYTE, which is '
      + 'what makes the two ports differ; getting this backwards was W416\'s first draft');
    assert.equal(w(0x27c2b8), 0xd16d, '$27C2B8 `D16D` add.w D0,($1C,A5) writes the same WORD');
    const h = sweepBody(0x27c28e, (ram) => ram.u8(A6 + 0x1c) === 0x40);
    assert.deepEqual([...h.entries()].sort(), [[false, 128], [true, 128]],
      '($1C,A6) becomes $40 on 128 of 256; before, on none');
  });

test('W416 SECTION 2: $27D44A -- type $A3\'s oscillation mirror, also a `neg.w`',
  { skip: SKIP }, () => {
    assert.equal(w(0x27d450), 0x6a04, '$27D450 `6A04` bpl.s $27D456');
    assert.equal(w(0x27d452), 0x446d, '$27D452 `446D` neg.?(d16,A5)');
    assert.equal((w(0x27d452) >> 6) & 3, 1, '  ...size 01 = WORD');
    assert.equal(w(0x27d454), 0x002a, '  ...($2A,A5)');
    const h = sweepBody(0x27d404, (ram) => ram.u16(A5 + 0x2a));
    assert.deepEqual([...h.entries()].sort((a, b) => a[0] - b[0]),
      [[0x0080, 128], [0xff80, 128]],
      '($2A,A5) is $0080 on 128 states and its WORD negation $FF80 on 128.  A byte negate would '
      + 'have left $0080 on all 256, because the high byte it would flip is zero -- which is '
      + 'why the size mattered here and nowhere else');
  });

// ===============================================================================================
// SECTION 3 -- THE THREE HIBACHI GUN INITS.
//
// All three are `neg.b`, all three start the gun's sweep running the other way, and all three
// carried a file comment and a test assertion saying the arm was DEAD.
// ===============================================================================================

const A4SLOT = SCHED.a1Base, SUB = 0x81c000;

function sweepGun(fn, off) {
  const hist = new Map();
  for (let c = 0; c < 256; c++) {
    const ram = new Ram();
    ram.setU16(RNG.state, c);
    ram.setU32(SUB + 0x02, 0x38001c00);
    fn(ram, ROM(), A4SLOT, SUB);
    const v = ram.u8(A4SLOT + off);
    hist.set(v, (hist.get(v) ?? 0) + 1);
  }
  return [...hist.entries()].sort((a, b) => a[0] - b[0]);
}

test('W416 SECTION 3: guns 5, 8 and 9 each start their sweep DOWN on half the draws',
  { skip: SKIP }, () => {
    for (const [gun, at, neg, field] of [['5', 0x2a81e0, 0x2a81e4, 0x11],
      ['8', 0x2a8824, 0x2a8828, 0x11], ['9', 0x2a89d6, 0x2a89da, 0x0f]]) {
      assert.equal(w(at), 0x6a00, `gun ${gun}: $${at.toString(16).toUpperCase()} \`6A00\` bpl.w`);
      assert.equal(w(neg), 0x442c, `  ...and \`442C\` neg.b (d16,A4) behind it`);
      assert.equal((w(neg) >> 6) & 3, 0, '  ...size 00 = BYTE, so `setU8` is right');
      assert.equal(w(neg + 2), field, `  ...($${field.toString(16).toUpperCase()},A4)`);
    }
    assert.deepEqual(sweepGun(gun5Init2A81BC, 0x11), [[0x06, 128], [0xfa, 128]],
      'gun 5 ($11,A4): $06 x128 / $FA x128.  w404 asserted "$06, the negate is dead"');
    assert.deepEqual(sweepGun(gun8Init2A8800, 0x11), [[0x03, 128], [0xfd, 128]],
      'gun 8 ($11,A4): $03 x128 / $FD x128.  w405 asserted "$03, always taken"');
    assert.deepEqual(sweepGun(gun9Init2A89BA, 0x0f), [[0x01, 128], [0xff, 128]],
      'gun 9 ($F,A4): $01 x128 / $FF x128.  w406 asserted "ALWAYS taken"');
  });

// ===============================================================================================
// SECTION 4 -- THE SIX CUE FORKS, DRIVEN END TO END.
//
// Four of these are the five-instruction shape
//   lea $28C274,A0 / jsr $242EC2 / bpl.s +6 / lea $28C28E,A0 / jsr (A0)
// which is exactly the shape W409 measured at `$2A6618` and found 5/3 rather than 8/0.  The
// scripts are driven through the scheduler's A4 walk off their own ROM tables, so the numbers
// below are the port running, not a hand call.
// ===============================================================================================

const BOSS3_F_TABLE = 0x29cbd0;      // $29CC1C holds $29D180: entry [9].step
const BOSS3_E_TABLE = 0x29d252;      // [0] = $29D400/$29D460, [1] = $29D556/$29D5C6

function driveA4(table, index, counter, frames, firstIsInit) {
  const ram = new Ram();
  ram.setU16(RNG.state, counter);
  const sounds = [];
  const ctx = {
    tables: MT(), unported: new UnportedLog(), palette: new PaletteState(),
    bossRec: A5, bossSubRec: 0x818400, soundPost: (a) => sounds.push(a),
  };
  ram.setU32(0x818400 + 0x02, 0x38001c00);
  ram.setU32(SCHED.ptrA4, table);
  ram.setU16(SCHED.a4Base, (firstIsInit ? 0x8000 : 0x8001) | index);
  const rom = ROM();
  for (let f = 0; f < frames; f++) runScheduler25962E(ram, rom, ctx);
  return { ram, sounds };
}

/** How many counter states produce each `{$28C274 count} / {$28C28E count}` pair. */
function cueHistogram(table, index, frames, firstIsInit) {
  const hist = new Map();
  for (let c = 0; c < 256; c++) {
    const r = driveA4(table, index, c, frames, firstIsInit);
    const k = `${r.sounds.filter((x) => x === 0x28c274).length}/`
      + `${r.sounds.filter((x) => x === 0x28c28e).length}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  return hist;
}

test('W416 SECTION 4: the fork is one `lea` apart at every one of the six sites',
  { skip: SKIP }, () => {
    for (const [jsr, br] of [[0x27b6fa, 0x27b700], [0x27c77a, 0x27c780], [0x29ce16, 0x29ce1c],
      [0x29d1a8, 0x29d1ae], [0x2a5d4c, 0x2a5d52], [0x2a6204, 0x2a620a]]) {
      const tag = `$${jsr.toString(16).toUpperCase()}`;
      assert.equal(l(jsr - 4), 0x0028c274, `${tag}: the lea BEFORE the jsr loads $28C274`);
      assert.equal(w(br), 0x6a06, `  ...\`6A06\` bpl.s, six bytes on`);
      assert.equal(w(br + 2), 0x41f9, '  ...over a `41F9` lea <abs.l>,A0');
      assert.equal(l(br + 4), 0x0028c28e, '  ...whose operand is $28C28E');
      assert.equal(w(br + 8), 0x4e90, '  ...and both arms join at `4E90` jsr (A0)');
    }
  });

test('W416 SECTION 4: F9\'s debris cue and F1\'s random cue both post $28C28E now',
  { skip: SKIP }, () => {
    const f9 = cueHistogram(BOSS3_F_TABLE, 9, 40, false);
    const total9 = [...f9.keys()].map((k) => k.split('/').map(Number));
    assert.ok(total9.every(([a, b]) => a + b === 8),
      '$29D1A8: eight cues in 40 frames on every counter state -- the cadence does not move');
    assert.equal(f9.get('8/0'), 1, '  ...and only ONE of the 256 states gives 8 x $28C274 and '
      + 'zero $28C28E, which is what the bit-15 reading gave on ALL 256');
    assert.equal([...f9.values()].reduce((a, b) => a + b, 0), 256, '  ...256 states accounted');
    assert.equal(f9.get('3/5'), 65, '  ...the modal split is 3 x $28C274 / 5 x $28C28E, on 65');

    const f1 = cueHistogram(BOSS3_F_TABLE, 1, 40, false);
    assert.ok([...f1.keys()].map((k) => k.split('/').map(Number)).every(([a, b]) => a + b === 8),
      '$29CE16: also eight cues in 40 frames');
    assert.equal(f1.get('8/0'), 2, '  ...and 2 of 256 states leave $28C28E unposted');
    assert.equal(f1.get('4/4'), 87, '  ...the modal split is 4/4, on 87');
  });

test('W416 SECTION 4: E1\'s fan step and E2\'s sub both take the other arm on half the states',
  { skip: SKIP }, () => {
    // $29D444 move.w #$3,D1 / $29D448 jsr / $29D44E bpl.s / $29D450 move.w #-3,D1
    assert.equal(w(0x29d444), 0x323c, '$29D444 `323C` move.w #imm,D1');
    assert.equal(w(0x29d446), 0x0003, '  ...#$0003');
    assert.equal(w(0x29d44e), 0x6a04, '$29D44E `6A04` bpl.s $29D454');
    assert.equal(w(0x29d450), 0x323c, '$29D450 `323C` move.w #imm,D1');
    assert.equal(w(0x29d452), 0xfffd, '  ...#$FFFD = -3');
    assert.equal(w(0x29d454), 0x1941, '$29D454 `1941` move.b D1,(d16,A4)');
    assert.equal(w(0x29d456), 0x0017, '  ...($17,A4), the join both arms reach');
    const e1 = new Map();
    for (let c = 0; c < 256; c++) {
      const v = driveA4(BOSS3_E_TABLE, 0, c, 1, true).ram.u8(SCHED.a4Base + 0x17);
      e1.set(v, (e1.get(v) ?? 0) + 1);
    }
    assert.deepEqual([...e1.entries()].sort((a, b) => a[0] - b[0]), [[0x03, 128], [0xfd, 128]],
      'E1 ($17,A4): +3 on 128 states and -3 on 128; the bit-15 reading gave +3 on all 256');

    // $29D5A4 jsr / $29D5AA bpl.w / $29D5AE subi.B #$C,($18,A4).  SUBI is `0000 0100 SS eeeeee`
    // and SS=00 is BYTE -- checked because this arm has never run.
    assert.equal(w(0x29d5aa), 0x6a00, '$29D5AA `6A00` bpl.w');
    assert.equal(0x29d5ac + w(0x29d5ac), 0x29d5b4, '  ...to $29D5B4, over one instruction');
    assert.equal(w(0x29d5ae), 0x042c, '$29D5AE `042C` subi.?(d16,A4)');
    assert.equal((w(0x29d5ae) >> 6) & 3, 0, '  ...size 00 = BYTE');
    assert.equal(w(0x29d5b0), 0x000c, '  ...#$0C');
    assert.equal(w(0x29d5b2), 0x0018, '  ...($18,A4)');
    let ran = 0;
    for (let c = 0; c < 256; c++) {
      const ram = driveA4(BOSS3_E_TABLE, 1, c, 1, true).ram;
      // $29D590..$29D5A2 leave ($18,A4) = -($16,A4) + 6 before the fork.
      const before = (-ram.u8(SCHED.a4Base + 0x16) + 6) & 0xff;
      if (ram.u8(SCHED.a4Base + 0x18) === ((before - 0x0c) & 0xff)) ran++;
    }
    assert.equal(ran, 128, 'E2: the `subi.b #$C` runs on 128 of the 256 states, and on NONE '
      + 'under the bit-15 reading');
  });

test('W416 SECTION 4: hibachi A4 scripts 1 and 3 post ten cues either way, split ~5/5',
  { skip: SKIP }, () => {
    for (const [name, script] of [['script 1 ($2A5D4C)', 1], ['script 3 ($2A6204)', 3]]) {
      const hist = new Map();
      for (let c = 0; c < 256; c++) {
        const ram = new Ram();
        ram.setU16(RNG.state, c);
        const sounds = [];
        const ctx = {
          tables: MT(), unported: new UnportedLog(), palette: new PaletteState(),
          bossRec: A5, bossSubRec: 0x818400, soundPost: (a) => sounds.push(a),
        };
        ram.setU32(0x818400 + 0x02, 0x38001c00);
        ram.setU32(SCHED.ptrA4, HIBACHI_A4.table);
        ram.setU16(SCHED.a4Base, 0x8000 | script);
        const rom = ROM();
        for (let f = 0; f < 40; f++) runScheduler25962E(ram, rom, ctx);
        const k = `${sounds.filter((x) => x === 0x28c274).length}/`
          + `${sounds.filter((x) => x === 0x28c28e).length}`;
        hist.set(k, (hist.get(k) ?? 0) + 1);
      }
      assert.ok([...hist.keys()].map((k) => k.split('/').map(Number))
        .every(([a, b]) => a + b === 10), `${name}: ten cues in 40 frames, every state`);
      assert.equal(hist.get('10/0'), undefined,
        `  ...and NOT ONE of the 256 states posts ten $28C274 and no $28C28E, which is what `
        + `the bit-15 reading did on all 256`);
      assert.equal(hist.get('5/5'), 82, '  ...the modal split is 5/5, on 82 states');
    }
  });

// ===============================================================================================
// SECTION 5 -- THE STREAM DOES NOT MOVE, SO THIS IS NOT AN RNG SHIFT.
// ===============================================================================================

test('W416 SECTION 5: every arm of every fixed site is draw-free, so both readings consume '
  + 'the SAME bytes', { skip: SKIP }, () => {
  // The instruction bytes between each `bpl`/`bmi` and its join, at all fifteen sites.  A draw
  // would be a `4EB9 0024 2Exx`, a `4EB9 0024 3xxx` or a `61xx` into the family; none appears.
  const ARMS = [
    [0x264dfe, 0x264e04], [0x27addc, 0x27ade2], [0x27b702, 0x27b708],
    [0x27c2c4, 0x27c2ce], [0x27c782, 0x27c788], [0x27d452, 0x27d456],
    [0x29ce1e, 0x29ce24], [0x29d1b0, 0x29d1b6], [0x29d450, 0x29d454],
    [0x29d5ae, 0x29d5b4], [0x2a5d54, 0x2a5d5a], [0x2a620c, 0x2a6212],
    [0x2a81e4, 0x2a81e8], [0x2a8828, 0x2a882c], [0x2a89da, 0x2a89de],
  ];
  assert.equal(ARMS.length, 15, 'fifteen arms, one per fixed site');
  for (const [from, to] of ARMS) {
    for (let a = from; a < to; a += 2) {
      assert.notEqual(w(a), 0x4eb9, `$${a.toString(16).toUpperCase()} is not a jsr`);
      assert.notEqual(w(a) & 0xff00, 0x6100, `  ...nor a bsr`);
    }
  }
  // ...and the port agrees: one draw per visit whichever arm runs.
  const ram = new Ram();
  const rom = ROM();
  for (let c = 0; c < 256; c++) {
    const before = ram.u8(RNG.counter);
    drawNegative242EC2(ram, rom);
    assert.equal(ram.u8(RNG.counter), (before + 1) & 0xff,
      'drawNegative242EC2 advances $803917 exactly once, like every family member');
  }
  // The three sites whose arms DO draw are $2A7860, $2A8EEE and $2A9804 -- and all three are
  // unported.  SECTION 7 names them.
  assert.equal(l(0x2a7872 + 2), 0x002431f4, '$2A7872 (inside $2A7860\'s arm) IS a $2431F4 draw');
  assert.equal(l(0x2a9818), 0x002431f4, "  ...and $2A9816 is a $2431F4 draw inside $2A9804 arm");
});

// ===============================================================================================
// SECTION 6 -- THE THREE SITES THAT WERE ALREADY RIGHT.
// ===============================================================================================

test('W416 SECTION 6: $28A258, $2A6618 and $29E162 already read bit 7, for three reasons',
  { skip: SKIP }, () => {
    // $28A258 -- W412 fixed it because it was inside that wave's own unit.
    assert.equal(w(0x28a25e), 0x6a02, '$28A25E `6A02` bpl.s, the impact spark\'s angle base');
    // $2A6618 -- W409 wrote it correctly from the start and MEASURED 5/3 over eight cues.
    assert.equal(w(0x2a661e), 0x6a06, '$2A661E `6A06` bpl.s, A4 script 5\'s state-0 cue');
    // $29E162 -- NEVER LISTED BY ANYBODY, and already right.  It is the one `bmi` of the 21,
    // so the arm runs on N CLEAR, and `src/boss3.js` reads `(direction & 0x80) === 0`.
    assert.equal(w(0x29e168), 0x6b02, '$29E168 `6B02` bmi.s $29E16C -- a bmi, not a bpl');
    assert.equal(w(0x29e16a), 0x4400, '$29E16A `4400` neg.b D0 -- what the bmi SKIPS');
    assert.equal((w(0x29e16a) >> 6) & 3, 0, '  ...size 00 = BYTE');
    assert.equal(w(0x29e16c), 0x1940, '$29E16C `1940` move.b D0,(d16,A4)');
    assert.equal(w(0x29e16e), 0x001e, '  ...($1E,A4), the join');
    // It needs the VALUE as well as the flag, which is why it is the one site left reading the
    // word: `drawNegative242EC2` would throw the byte away.
    const ram = new Ram();
    const rom = ROM();
    let negated = 0;
    for (let c = 0; c < 256; c++) {
      ram.setU16(RNG.state, c);
      const d = drawWord242EC2(ram, rom) & 0xff;
      if ((d & 0x80) === 0) negated++;
    }
    assert.equal(negated, 128, 'E5\'s direction is negated on 128 of the 256 states -- the '
      + 'complement of the other twenty, because this one branch is a `bmi`');
  });

// ===============================================================================================
// SECTION 7 -- THE THREE ROM SITES THAT ARE NOT PORTED.
// ===============================================================================================

test('W416 SECTION 7: $2A7860, $2A8EEE and $2A9804 are real forks in UNPORTED routines',
  { skip: SKIP }, () => {
    // The A1 gun table $2A72C8 is fourteen {init, step} pairs; guns 1 and 12 are not ported,
    // and the second table $2A92A8 has entries of its own.
    assert.equal(l(0x2a72c8 + 1 * 8), 0x002a7850, '$2A72C8[1].init is $2A7850 -- gun 1');
    assert.equal(l(0x2a72c8 + 12 * 8), 0x002a8ed0, '$2A72C8[12].init is $2A8ED0 -- gun 12');
    assert.ok(0x2a7860 > 0x2a7850 && 0x2a7860 < 0x2a78d0, '$2A7860 is inside gun 1\'s init');
    assert.ok(0x2a8eee > 0x2a8ed0 && 0x2a8eee < 0x2a8f1c, '$2A8EEE is inside gun 12\'s init');
    // AND THE ONE THING THAT MAKES THEM DIFFERENT FROM THE FIFTEEN: their taken arm DRAWS.
    assert.equal(w(0x2a7866), 0x6a00, '$2A7866 `6A00` bpl.w');
    assert.equal(w(0x2a7872), 0x4eb9, '$2A7872 `4EB9` jsr -- INSIDE the arm the bpl skips');
    assert.equal(l(0x2a7874), 0x002431f4, '  ...$2431F4, another member of the shared-counter '
      + 'family.  Whoever ports gun 1 must expect the RNG STREAM to move, which is not true '
      + 'of any of the fifteen this wave fixed');
    assert.equal(w(0x2a9804), 0x4eb9, '$2A9804 `4EB9` jsr $242EC2, in the alt table $2A92A8');
    assert.equal(l(0x2a9806), 0x00242ec2, '  ...$242EC2');
  });
