// WAVE 453 (D69) -- MERGE THE TWO `$242494` DISTANCE BODIES.
//
// `bossscripts.js` exported one transcription while `items.js` carried another
// private body for the real `$27EE88` set-item call. This regression reads the
// cartridge, preserves the deleted body below, proves word arithmetic at the
// edges, and drives dirty reused item records through both sides of the latch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { dist242494 } from '../src/bossscripts.js';
import { ITEM, I, runItemDriver } from '../src/items.js';
import { BUCKETS } from '../src/spritequeue.js';
import { headRegister, bodyPairs, narrowIndex } from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const IMAGE = join(ROOT, 'tools', 'oracle', 'out', 'maincpu.bin');
const TABLES = join(ROOT, 'rip', 'port', 'player.tables.json');
const HAVE_IMAGE = existsSync(IMAGE);
const HAVE_TABLES = existsSync(TABLES);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const TJ = HAVE_TABLES ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE_TABLES ? new RomWindows(TJ.rom) : null;
const MOVES = HAVE_TABLES ? new MoveTables(TJ, ROM) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const SKIP_TABLES = HAVE_TABLES ? false : 'player.tables.json absent; skip, not pass';

const word = (n) => n & 0xffff;
const signedByte = (n) => (n & 0x80) ? n - 0x100 : n;
const shortTarget = (at, opcode) => at + 2 + signedByte(opcode);

/** MOVEM.W memory-to-register sign extension, represented as an unsigned long. */
function movemWord(n) {
  const w = word(n);
  return (w & 0x8000) ? (0xffff0000 | w) >>> 0 : w;
}

/** Independent low-word execution of `$24249A..$2424B6`. */
function cartridgeDistance(selfY, selfX, targetY, targetX) {
  let d0 = word(selfY - targetY);             // sub.w D2,D0
  if (d0 & 0x8000) d0 = word(-d0);           // bpl.s / neg.w D0
  const d4 = d0 >>> 2;                       // move.w D0,D4 / lsr.w #2,D4
  d0 = word(d0 - d4);                        // sub.w D4,D0
  let d1 = word(selfX - targetX);             // sub.w D3,D1
  if (d1 & 0x8000) d1 = word(-d1);           // bpl.s / neg.w D1
  const carry = d0 < d1;                     // cmp.w D1,D0 sets borrow as carry
  if (carry) [d0, d1] = [d1, d0];            // bcc.s skips exg when D0 >= D1
  d1 >>>= 1;                                 // lsr.w #1,D1
  d0 = word(d0 + d1);                        // add.w D1,D0
  return d0;                                 // move.w D0,D0, then unsigned API word
}

// The private `items.js` body deleted by W453, retained as local evidence rather
// than paraphrased. Its RAM reads are the part the merged caller must preserve.
function deletedItemsDistance(ram, a6, d2, d3) {
  let d0 = u16(ram.u16(a6 + I.pos) - d2);
  if (d0 & 0x8000) d0 = u16(-d0);
  const d4 = d0 >>> 2;
  d0 = u16(d0 - d4);
  let d1 = u16(ram.u16(a6 + I.posX) - d3);
  if (d1 & 0x8000) d1 = u16(-d1);
  if (d0 < d1) { const t = d0; d0 = d1; d1 = t; }
  return u16(d0 + (d1 >>> 1));
}

const DISTANCE_CASES = Object.freeze([
  ['positive Y subtraction', 0x0100, 0x0000, 0x00cc, 0x0000, 0x0027],
  ['negative Y subtraction', 0x00cc, 0x0000, 0x0100, 0x0000, 0x0027],
  ['positive X subtraction', 0x0000, 0x0100, 0x0000, 0x00cc, 0x0034],
  ['negative X subtraction', 0x0000, 0x00cc, 0x0000, 0x0100, 0x0034],
  ['Y $8000 negates to itself', 0x8000, 0x0000, 0x0000, 0x0000, 0x6000],
  ['X $8000 negates to itself', 0x0000, 0x8000, 0x0000, 0x0000, 0x8000],
  ['Y three-quarter scaling truncates', 0x0103, 0x0000, 0x0000, 0x0000, 0x00c3],
  ['Y-major compare takes bcc', 0x0200, 0x0040, 0x0000, 0x0000, 0x01a0],
  ['X-major compare takes exg', 0x0040, 0x0100, 0x0000, 0x0000, 0x0118],
  ['odd minimum is logically halved', 0x0004, 0x0100, 0x0000, 0x0000, 0x0101],
  ['wrapped coordinate subtraction', 0x0000, 0x0000, 0xffff, 0x0000, 0x0001],
  ['largest reachable result', 0x8000, 0x8000, 0x0000, 0x0000, 0xb000],
]);

test('SECTION 1: exact `$24248E..$2424B9` bytes pin both MOVEM loads and the whole body',
  { skip: SKIP_IMAGE }, () => {
    const expected = Buffer.from(
      '4ca8000c00024cae0003000290426a0244403800e44c904492436a024441b0416402c340e249d04130004e75',
      'hex');
    assert.deepEqual(IMG.subarray(0x24248e, 0x2424ba), expected);

    assert.equal(IMG.readUInt16BE(0x24248e), 0x4ca8,
      '$24248E movem.w ($2,A0),D2-D3');
    assert.equal(IMG.readUInt16BE(0x242490), 0x000c, 'MOVEM mask selects D2-D3');
    assert.equal(IMG.readUInt16BE(0x242492), 0x0002, 'target record displacement is +$02');
    assert.equal(IMG.readUInt16BE(0x242494), 0x4cae,
      '$242494 movem.w ($2,A6),D0-D1');
    assert.equal(IMG.readUInt16BE(0x242496), 0x0003, 'MOVEM mask selects D0-D1');
    assert.equal(IMG.readUInt16BE(0x242498), 0x0002, 'self record displacement is +$02');

    assert.equal(IMG.readUInt16BE(0x24249a), 0x9042, 'sub.w D2,D0');
    assert.equal(IMG.readUInt16BE(0x24249c), 0x6a02, 'bpl.s $2424A0');
    assert.equal(shortTarget(0x24249c, IMG[0x24249d]), 0x2424a0);
    assert.equal(IMG.readUInt16BE(0x24249e), 0x4440, 'neg.w D0');
    assert.equal(IMG.readUInt16BE(0x2424a2), 0xe44c, 'lsr.w #2,D4');
    assert.equal(IMG.readUInt16BE(0x2424a4), 0x9044, 'sub.w D4,D0');
    assert.equal(IMG.readUInt16BE(0x2424a6), 0x9243, 'sub.w D3,D1');
    assert.equal(IMG.readUInt16BE(0x2424a8), 0x6a02, 'bpl.s $2424AC');
    assert.equal(shortTarget(0x2424a8, IMG[0x2424a9]), 0x2424ac);
    assert.equal(IMG.readUInt16BE(0x2424aa), 0x4441, 'neg.w D1');
    assert.equal(IMG.readUInt16BE(0x2424ac), 0xb041, 'cmp.w D1,D0');
    assert.equal(IMG.readUInt16BE(0x2424ae), 0x6402, 'bcc.s $2424B2');
    assert.equal(shortTarget(0x2424ae, IMG[0x2424af]), 0x2424b2);
    assert.equal(IMG.readUInt16BE(0x2424b0), 0xc340, 'exg.l D1,D0');
    assert.equal(IMG.readUInt16BE(0x2424b2), 0xe249, 'lsr.w #1,D1');
    assert.equal(IMG.readUInt16BE(0x2424b4), 0xd041, 'add.w D1,D0');
    assert.equal(IMG.readUInt16BE(0x2424b6), 0x3000, 'move.w D0,D0');
    assert.equal(IMG.readUInt16BE(0x2424b8), 0x4e75, 'rts');
  });

test('SECTION 1b: both MOVEM.W loads sign-extend each word but the body consumes low words', () => {
  const targetLoad = [movemWord(0x8000), movemWord(0x7fff)];
  const selfLoad = [movemWord(0xffff), movemWord(0x8000)];
  assert.deepEqual(targetLoad, [0xffff8000, 0x00007fff],
    '$24248E loads target Y/X into D2/D3 in ascending memory and register order');
  assert.deepEqual(selfLoad, [0xffffffff, 0xffff8000],
    '$242494 loads self Y/X into D0/D1 in ascending memory and register order');
  assert.equal(cartridgeDistance(...selfLoad, ...targetLoad),
    cartridgeDistance(0xffff, 0x8000, 0x8000, 0x7fff),
    'the subsequent .w instructions ignore the sign-extended upper halves');
});

test('SECTION 2: decoded word semantics cover both signs, `$8000`, scale, swap, half-min and wrap',
  () => {
    for (const [name, sy, sx, ty, tx, expected] of DISTANCE_CASES) {
      assert.equal(cartridgeDistance(sy, sx, ty, tx), expected, `${name}: independent model`);
      assert.equal(dist242494(sy, sx, ty, tx), expected, `${name}: shared survivor`);
    }

    let maxAbs = 0;
    let maxScaledY = 0;
    for (let delta = 0; delta <= 0xffff; delta++) {
      const abs = (delta & 0x8000) ? word(-delta) : delta;
      maxAbs = Math.max(maxAbs, abs);
      maxScaledY = Math.max(maxScaledY, word(abs - (abs >>> 2)));
    }
    assert.equal(maxAbs, 0x8000, 'word absolute value is bounded by $8000');
    assert.equal(maxScaledY, 0x6000, 'the scaled Y magnitude is bounded by $6000');
    assert.equal(0x8000 + (0x6000 >>> 1), 0xb000,
      'therefore a final add carry is unreachable from coordinate inputs');

    // Isolate the final two opcodes anyway. ADD.W wraps only D0's low word and
    // MOVE.W D0,D0 neither clears nor sign-extends its upper half. The JS API
    // deliberately returns the final unsigned low word.
    const before = 0x1234ffff;
    const halfMinimum = 0x0002 >>> 1;
    const afterAddWord = ((before & 0xffff0000) | word(before + halfMinimum)) >>> 0;
    const afterMoveWordSelf = afterAddWord;
    assert.equal(afterAddWord, 0x12340000, 'synthetic $FFFF + ($0002 >> 1) wraps to $0000');
    assert.equal(afterMoveWordSelf, 0x12340000, 'move.w D0,D0 preserves the upper half');
    assert.equal(word(afterMoveWordSelf), 0x0000, 'the helper returns only D0.w');
  });

test('SECTION 2b: the deleted private body and shared survivor agree on dirty RAM inputs', () => {
  const ram = new Ram();
  const a6 = ITEM.base;
  for (let k = 0; k < ITEM.stride; k++) ram.setU8(a6 + k, (0x53 + k * 29) & 0xff);
  for (const [name, sy, sx, ty, tx, expected] of DISTANCE_CASES) {
    ram.setU16(a6 + I.pos, sy);
    ram.setU16(a6 + I.posX, sx);
    assert.equal(deletedItemsDistance(ram, a6, ty, tx), expected, `${name}: deleted body`);
    assert.equal(dist242494(ram.u16(a6 + I.pos), ram.u16(a6 + I.posX), ty, tx), expected,
      `${name}: merged call shape`);
  }
});

test('SECTION 3: one exported body survives and all 20 production callers use it', () => {
  const itemSource = readFileSync(join(SRC, 'items.js'), 'utf8');
  assert.match(itemSource, /import \{ dist242494 \} from '\.\/bossscripts\.js';/);
  assert.doesNotMatch(itemSource, /^function dist242494\s*\(/m,
    'the private items.js transcription must stay deleted');
  assert.match(itemSource,
    /dist242494\(\s*ram\.u16\(a6 \+ I\.pos\), ram\.u16\(a6 \+ I\.posX\),\s*HOME_08\.d2, HOME_08\.d3\)/,
    '$27EE88 must preserve the private body RAM reads in Y, X, target-Y, target-X order');

  const census = {};
  let declarations = 0;
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = readFileSync(join(SRC, entry.name), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const uses = [...code.matchAll(/\bdist242494\s*\(/g)].length;
    if (uses) census[entry.name] = uses;
    declarations += [...code.matchAll(/\bfunction\s+dist242494\s*\(/g)].length;
  }
  assert.equal(declarations, 1, 'exactly one production body remains');
  assert.deepEqual(census, {
    'boss2.js': 3,
    'boss4.js': 3,
    'bossarrival.js': 1,
    'bossf23.js': 3,
    'bossphase.js': 2,
    'bossscripts.js': 3,
    'handlers.js': 1,
    'hibachiguns.js': 1,
    'items.js': 1,
    'stage3carrier.js': 1,
    'stage4type42.js': 1,
    'stage5type44.js': 1,
  }, '20 calls plus the one declaration in bossscripts.js');
  assert.equal(Object.values(census).reduce((n, count) => n + count, 0) - declarations, 20);
});

test('SECTION 4: `$27EE80..$27EE9F` pins fixed target order, JSR, unsigned threshold and latch stores',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(IMG.subarray(0x27ee80, 0x27eea0), Buffer.from(
      '343c4600363c1c004eb9002424940c4002006200006a08d600001d7c000a001a', 'hex'));
    assert.equal(IMG.readUInt16BE(0x27ee80), 0x343c, 'move.w #$4600,D2');
    assert.equal(IMG.readUInt16BE(0x27ee82), 0x4600, 'target Y');
    assert.equal(IMG.readUInt16BE(0x27ee84), 0x363c, 'move.w #$1C00,D3');
    assert.equal(IMG.readUInt16BE(0x27ee86), 0x1c00, 'target X');
    assert.equal(IMG.readUInt16BE(0x27ee88), 0x4eb9, 'jsr absolute long');
    assert.equal(IMG.readUInt32BE(0x27ee8a), 0x00242494, 'jsr $242494');
    assert.equal(IMG.readUInt16BE(0x27ee8e), 0x0c40, 'cmpi.w #$0200,D0');
    assert.equal(IMG.readUInt16BE(0x27ee90), 0x0200);
    assert.equal(IMG.readUInt16BE(0x27ee92), 0x6200, 'bhi.w uses unsigned C/Z flags');
    assert.equal(0x27ee94 + IMG.readInt16BE(0x27ee94), 0x27eefe, 'far arm target');
    assert.equal(IMG.readUInt16BE(0x27ee96), 0x08d6, 'bset #0,(A6)');
    assert.equal(IMG.readUInt16BE(0x27ee9a), 0x1d7c, 'move.b #$0A,($1A,A6)');

    const jsr = Buffer.from('4eb900242494', 'hex');
    const sites = [];
    for (let at = 0x230000; at <= 0x2b0000 - jsr.length; at += 2) {
      if (IMG.subarray(at, at + jsr.length).equals(jsr)) sites.push(at);
    }
    assert.deepEqual(sites, [
      0x26cac8, 0x26ffa6, 0x2783b0, 0x2783d8, 0x27ee88,
      0x289ce2, 0x289cf4, 0x29326a, 0x29346c, 0x2934cc,
      0x293542, 0x2935be, 0x293608, 0x29367e, 0x2936de,
      0x297b80, 0x297c18, 0x297c88, 0x297d38, 0x297da2,
      0x297e54,
    ], 'all 21 direct cartridge calls are pinned; `$27EE88` is the item call');
  });

function driveDirtyItem(y, x) {
  const ram = new Ram();
  const a6 = ITEM.base;
  for (let k = 0; k < ITEM.stride; k++) ram.setU8(a6 + k, (0x53 + k * 29) & 0xff);
  const residue30 = ram.u8(a6 + 0x30);
  const residue3f = ram.u8(a6 + 0x3f);

  ram.setU16(a6 + I.status, 0xa008);       // allocated, initialized, kind $08, not latched
  ram.setU16(a6 + I.pos, y);               // A6+$02, Y
  ram.setU16(a6 + I.posX, x);              // A6+$04, X
  ram.setU16(a6 + I.frame, 0x0202);        // valid reused animation state
  ram.setU16(a6 + I.anim, 0x0000);
  ram.setU8(a6 + I.speed, 0x5d);           // dirty old speed
  ram.setU8(a6 + I.angle, 0x29);           // dirty old angle, retained past re-aim gate
  ram.setU16(ITEM.count, 1);
  ram.setU16(ITEM.freeze, 1);               // tail emits but cannot move the witness
  ram.setU16(ITEM.g803912, 1);              // opposite re-aim arm preserves dirty angle
  ram.setU8(ITEM.pause30f8, 0);
  ram.setU16(ITEM.scroll, 0);
  const bucket = BUCKETS[17];
  ram.setU16(bucket.counter, 0);

  const telemetry = runItemDriver(ram, ROM, { rom: ROM, tables: MOVES });
  return { ram, a6, bucket, telemetry, residue30, residue3f };
}

test('SECTION 5: real `$27EE88` caller reads dirty A6+$02/+$04 in Y/X order on both latch arms',
  { skip: SKIP_TABLES }, () => {
    const states = [
      ['near positive Y', 0x4800, 0x1c00, true],
      ['far X only', 0x4800, 0x2000, false],
      ['far Y only', 0x4a00, 0x1c00, false],
      ['near negative Y', 0x4400, 0x1c00, true],
    ];
    for (const [name, y, x, latch] of states) {
      const { ram, a6, bucket, telemetry, residue30, residue3f } = driveDirtyItem(y, x);
      assert.deepEqual(telemetry,
        { live: 1, emitted: 1, freed: 0, collected: 0, walked: 1 },
        `${name}: real driver reaches the item and emits one external record`);
      assert.equal(ram.u16(bucket.counter), 12, `${name}: bucket 17 has one 12-byte record`);
      assert.equal(ram.u16(a6 + I.pos), y, `${name}: freeze preserves Y`);
      assert.equal(ram.u16(a6 + I.posX), x, `${name}: freeze preserves X`);
      assert.equal(ram.u16(a6 + I.status), latch ? 0xa108 : 0xa008,
        `${name}: lifecycle latch bit is bit 0 of the high status byte`);
      assert.equal(ram.u8(a6 + I.speed), latch ? 0x0a : 0x5d,
        `${name}: only the near arm replaces dirty speed`);
      assert.equal(ram.u8(a6 + I.angle), latch ? 0x20 : 0x29,
        `${name}: dirty angle proves the selected latch arm externally`);
      assert.equal(ram.u8(a6 + 0x30), residue30, `${name}: unowned dirty +$30 survives`);
      assert.equal(ram.u8(a6 + 0x3f), residue3f, `${name}: unowned dirty +$3F survives`);
    }
  });

test('SECTION 6: live registers include W453 and every later proved merge',
  () => {
    const heads = headRegister();
    const pairs = bodyPairs();
    const narrow = [...narrowIndex()].filter(([, claims]) => claims.size > 1);
    assert.equal(heads.length, 71,
      'W475 left 68; W497 adds $2491C0 and $253D82/$253D90; later Hibachi source consolidation removes the temporary W554 $2A54E2 duplicate');
    assert.ok(!heads.includes(0x242494), '$242494 has one function head after the merge');
    assert.equal(pairs.length, 27,
      'W497 added the authentic-selection/player-object pair; W603 removes the score-hit pair after generalizing both callers through one body');
    assert.ok(!pairs.some(([pair]) => pair === 'bossscripts.js dist242494 <> items.js dist242494'),
      'the deleted body must stay absent from the body-marker register');
    assert.equal(narrow.length, 16,
      'W474 left 15; W497 registers the authentic-selection adapter at $2491C0');
  });
