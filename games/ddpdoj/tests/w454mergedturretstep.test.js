// WAVE 454 (D69) -- MERGE THE TYPE $11 AND TYPE $10 TURRET BODIES.
//
// The cartridge carries the same aim, cadence, slew and sprite-selection block
// at `$268A0E` and `$268376`. The only semantic parameter is the type's sprite
// table. This regression pins both bodies, decodes every differing branch, and
// drives dirty recycled records through the two complete production handlers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AimTables } from '../src/aim.js';
import { runHandler } from '../src/handlers.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { TURRET, TURRET_HANDLERS, turretStep } from '../src/turret.js';
import { UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { bodyPairs, headRegister, narrowIndex } from './w450widenedscan.js';

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
const AIM_TABLES = HAVE_TABLES ? new AimTables(ROM) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const SKIP_TABLES = HAVE_TABLES ? false : 'player.tables.json absent; skip, not pass';

const A5 = 0x81364c;
const A6 = 0x81459c;
const DECOY_A6 = 0x81461c;
const P1 = 0x8103e6;
const P2 = 0x810448;

const signedByte = (n) => (n & 0x80) ? n - 0x100 : n;
const shortTarget = (at, opcode) => at + 2 + signedByte(opcode);
const wideTarget = (extensionAt, displacement) => extensionAt
  + ((displacement & 0x8000) ? displacement - 0x10000 : displacement);
const pcRelativeTarget = wideTarget;
const movemWord = (n) => (n & 0x8000) ? (0xffff0000 | n) >>> 0 : n;

const BLOCKS = Object.freeze([
  {
    name: 'type $11', hand: 0x2688cc, type: 0x11,
    start: 0x268a0e, fire: 0x268a5a, draw: 0x268a68,
    freezeBranch: 0x268a14, cadenceBranch: 0x268a1e, carryBranch: 0x268a36,
    lea: 0x268a4e, leaExt: 0x268a50, table: 0x268c9e,
    fireBranch: 0x268a5e, fireBranchExt: 0x268a60, size: 0x620,
    hex: '4a79008130d26652122d0033532d0018643a1b6d001900184cae00030002064002004eb90024200a6530102d00334eb9002421901b41003352010241003ed24141fa024e4e712b701000002208160005',
  },
  {
    name: 'type $10', hand: 0x268232, type: 0x10,
    start: 0x268376, fire: 0x2683c2, draw: 0x2683ce,
    freezeBranch: 0x26837c, cadenceBranch: 0x268386, carryBranch: 0x26839e,
    lea: 0x2683b6, leaExt: 0x2683b8, table: 0x268694,
    fireBranch: 0x2683c6, fireBranchExt: null, size: 0x830,
    hex: '4a79008130d26650122d0033532d0018643a1b6d001900184cae00030002064002004eb90024200a652e102d00334eb9002421901b41003352010241003ed24141fa02dc4e712b701000002208160005',
  },
]);

const MARKERS = Object.freeze([
  ['cadence byte decrement', 0x268a1a, 0x268382, '532d0018'],
  ['reload byte copy', 0x268a20, 0x268388, '1b6d00190018'],
  ['MOVEM.W Y then X', 0x268a26, 0x26838e, '4cae00030002'],
  ['no-player carry branch', 0x268a36, 0x26839e, null],
  ['stored facing load', 0x268a38, 0x2683a0, '102d0033'],
  ['new facing byte store', 0x268a42, 0x2683aa, '1b410033'],
  ['sprite longword store', 0x268a54, 0x2683bc, '2b7010000022'],
]);

function bytes(at, count) {
  return IMG.subarray(at, at + count);
}

function hexAt(at, hex) {
  const expected = Buffer.from(hex, 'hex');
  assert.deepEqual(bytes(at, expected.length), expected);
}

test('SECTION 1: both exact 0x50-byte blocks and all seven W450 markers come from the cartridge',
  { skip: SKIP_IMAGE }, () => {
    for (const b of BLOCKS) {
      const expected = Buffer.from(b.hex, 'hex');
      assert.equal(expected.length, 0x50, `${b.name}: body includes the four-byte btst at fire`);
      assert.deepEqual(bytes(b.start, 0x50), expected, `${b.name}: exact ${b.start.toString(16)} body`);
      assert.equal(b.fire - b.start, 0x4c, `${b.name}: shared fire continuation offset`);
    }

    for (const [name, a11, a10, hex] of MARKERS) {
      if (hex) {
        hexAt(a11, hex);
        hexAt(a10, hex);
      } else {
        assert.equal(IMG[a11], 0x65, `${name}: type $11 is BCS`);
        assert.equal(IMG[a10], 0x65, `${name}: type $10 is BCS`);
      }
    }

    assert.equal(IMG.readUInt16BE(0x268a26), 0x4cae, 'MOVEM.W uses (d16,A6)');
    assert.equal(IMG.readUInt16BE(0x268a28), 0x0003, 'mask $0003 selects D0 then D1');
    assert.equal(IMG.readUInt16BE(0x268a2a), 0x0002, 'memory starts at A6+$02');
    assert.deepEqual([movemWord(0x8001), movemWord(0x7ffe)], [0xffff8001, 0x00007ffe],
      'MOVEM.W sign-extends ascending memory into ascending D0/D1 registers');
    assert.equal(IMG.readUInt16BE(0x268a2c), 0x0640, 'ADDI.W changes only D0 low word');
    assert.equal(IMG.readUInt16BE(0x268a2e), 0x0200, 'muzzle offset is exactly +$0200');
    assert.equal(IMG.readUInt16BE(0x268a46), 0x5201, 'ADDQ.B wraps the facing byte');
    assert.equal(IMG.readUInt16BE(0x268a48), 0x0241, 'ANDI.W then clears the index word');
    assert.equal(IMG.readUInt16BE(0x268a4a), 0x003e, 'word mask selects 32 table arms');
    assert.equal(IMG.readUInt16BE(0x268a4c), 0xd241, 'doubling makes four-byte stride');
  });

test('SECTION 1b: all short, wide and PC-relative targets use the correct base address',
  { skip: SKIP_IMAGE }, () => {
    for (const b of BLOCKS) {
      assert.equal(shortTarget(b.freezeBranch, IMG[b.freezeBranch + 1]), b.draw,
        `${b.name}: freeze branches to its common draw`);
      assert.equal(shortTarget(b.cadenceBranch, IMG[b.cadenceBranch + 1]), b.fire,
        `${b.name}: cadence no-borrow branches to its fire continuation`);
      assert.equal(shortTarget(b.carryBranch, IMG[b.carryBranch + 1]), b.draw,
        `${b.name}: no-live-player carry branches to its common draw`);
      assert.equal(pcRelativeTarget(b.leaExt, IMG.readUInt16BE(b.leaExt)), b.table,
        `${b.name}: LEA displacement is based at its extension word`);
      assert.equal(IMG.readUInt16BE(b.lea + 4), 0x4e71, `${b.name}: table LEA is followed by NOP`);
      if (b.fireBranchExt === null) {
        assert.equal(shortTarget(b.fireBranch, IMG[b.fireBranch + 1]), b.draw,
          `${b.name}: bit-5 clear uses its short draw branch`);
      } else {
        assert.equal(IMG.readUInt16BE(b.fireBranch), 0x6700, `${b.name}: bit-5 clear uses BEQ.W`);
        assert.equal(wideTarget(b.fireBranchExt, IMG.readUInt16BE(b.fireBranchExt)), b.draw,
          `${b.name}: wide branch is based at the extension-word address`);
      }
    }

    const a = bytes(BLOCKS[0].start, 0x50);
    const b = bytes(BLOCKS[1].start, 0x50);
    const differences = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differences.push(i);
    assert.deepEqual(differences, [0x07, 0x29, 0x43],
      'only type-local draw displacements and the table displacement differ');
  });

function dirtyRam({ freeze = 0, cadence = 0, reload = 0xa7, facing = 0xff,
                    players = true, fireCounter = 5 } = {}) {
  const ram = new Ram();
  for (let i = 0; i < 0x50; i++) ram.setU8(A5 + i, (0x5b + i * 37) & 0xff);
  for (let i = 0; i < 0x40; i++) ram.setU8(A6 + i, (0xa7 + i * 19) & 0xff);
  for (let i = 0; i < 0x40; i++) ram.setU8(DECOY_A6 + i, (0x31 + i * 23) & 0xff);

  ram.setU16(A5, 0x8000);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);
  ram.setU16(A5 + 0x16, 0);
  ram.setU8(A5 + 0x18, cadence);
  ram.setU8(A5 + 0x19, reload);
  ram.setU8(A5 + 0x20, 0);
  ram.setU16(A5 + 0x26, 0x7fff);
  ram.setU8(A5 + 0x28, fireCounter);
  ram.setU32(A5 + 0x2a, ROM.u32(0x267f70));
  ram.setU32(A5 + 0x2e, ROM.u32(0x267f74));
  ram.setU8(A5 + 0x32, 0);
  ram.setU8(A5 + 0x33, facing);
  ram.setU8(A5 + 0x34, 0x34);

  ram.setU8(A6, 0x20);
  ram.setU16(A6 + 0x02, 0x3000);
  ram.setU16(A6 + 0x04, 0x2000);
  ram.setU16(A6 + 0x18, 0x7fff);
  ram.setU16(A6 + 0x1a, 0x0016);
  ram.setU16(A6 + 0x1c, 0x1234);
  ram.setU16(TURRET.freezeGate, freeze);
  ram.setU16(0x813172, 0);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813096, 0);

  ram.setU16(P1, players ? 0x8000 : 0);
  ram.setU16(P1 + 2, 0x5000);
  ram.setU16(P1 + 4, 0x2000);
  ram.setU16(P2, 0);
  return ram;
}

function productionRun(block, state) {
  const ram = dirtyRam(state);
  const residueA5 = ram.u8(A5 + 0x3f);
  const residueA6 = ram.u8(A6 + 0x1f);
  const recStub = resolveEmitStub(ROM, ram.u32(A5 + 0x2a));
  const regStub = resolveEmitStub(ROM, ram.u32(A5 + 0x2e));
  assert.equal(recStub.bucket, regStub.bucket, 'the production body and turret emit into one bucket');
  const bucket = BUCKETS[regStub.bucket];
  ram.setU16(bucket.counter, 0);
  const ctx = { ram, rom: ROM, tables: MOVES, unported: new UnportedLog() };
  runHandler(block.hand, ram, ROM, A5, ctx);
  return { ram, bucket, residueA5, residueA6 };
}

function assertExternalDraw(block, result, expectedSprite) {
  const { ram, bucket, residueA5, residueA6 } = result;
  assert.equal(ram.u16(bucket.counter), 24, `${block.name}: body plus turret emit two records`);
  assert.equal(ram.u32(bucket.buffer + 12 + 4), expectedSprite,
    `${block.name}: second external request carries the turret sprite longword`);
  assert.equal(ram.u16(bucket.buffer + 12 + 8), block.size,
    `${block.name}: common draw preserves its type-specific size`);
  assert.equal(ram.u16(bucket.buffer + 12 + 10), 0x1234,
    `${block.name}: common draw preserves A6+$1C colour`);
  assert.equal(ram.u8(A5 + 0x3f), residueA5, `${block.name}: unowned dirty A5+$3F survives`);
  assert.equal(ram.u8(A6 + 0x1f), residueA6, `${block.name}: unowned dirty A6+$1F survives`);
}

test('SECTION 2: dirty production handlers preserve freeze, cadence no-borrow and their fire tails',
  { skip: SKIP_TABLES }, () => {
    for (const block of BLOCKS) {
      const oldSprite = 0x5ac30000 | block.type;

      const frozen = dirtyRam({ freeze: 1, cadence: 2, facing: 0x3f, fireCounter: 5 });
      frozen.setU32(A5 + TURRET.gfxOff, oldSprite);
      const frozenResult = (() => {
        const residueA5 = frozen.u8(A5 + 0x3f), residueA6 = frozen.u8(A6 + 0x1f);
        const bucket = BUCKETS[resolveEmitStub(ROM, frozen.u32(A5 + 0x2e)).bucket];
        frozen.setU16(bucket.counter, 0);
        runHandler(block.hand, frozen, ROM, A5,
          { tables: MOVES, unported: new UnportedLog() });
        return { ram: frozen, bucket, residueA5, residueA6 };
      })();
      assert.equal(frozen.u8(A5 + TURRET.cadenceOff), 2, `${block.name}: freeze preserves phase`);
      assert.equal(frozen.u8(A5 + 0x28), 5, `${block.name}: freeze branches around its fire tail`);
      assert.equal(frozen.u8(A5 + TURRET.facingOff), 0x3f, `${block.name}: freeze preserves facing`);
      assertExternalDraw(block, frozenResult, oldSprite);

      const noBorrow = productionRun(block,
        { freeze: 0, cadence: 2, facing: 0x3f, fireCounter: 5 });
      assert.equal(noBorrow.ram.u8(A5 + TURRET.cadenceOff), 1,
        `${block.name}: SUBQ.B without borrow stores one less`);
      assert.equal(noBorrow.ram.u8(A5 + 0x28), 4,
        `${block.name}: cadence BCC falls through into this type's fire counter`);
      assert.equal(noBorrow.ram.u8(A5 + TURRET.facingOff), 0x3f,
        `${block.name}: no-borrow arm does not slew`);
      assertExternalDraw(block, noBorrow, noBorrow.ram.u32(A5 + TURRET.gfxOff));
    }
  });

test('SECTION 3: cadence borrow reloads, uses live A6 Y/X, slews one step and selects each table',
  { skip: SKIP_TABLES }, () => {
    const sprites = [];
    for (const block of BLOCKS) {
      const result = productionRun(block,
        { freeze: 0, cadence: 0, reload: 0xa7, facing: 0x3f, players: true, fireCounter: 5 });
      const { ram } = result;
      assert.equal(ram.u8(A5 + TURRET.cadenceOff), 0xa7,
        `${block.name}: borrow reloads one byte from A5+$19`);
      assert.equal(ram.u8(A5 + TURRET.facingOff), 0,
        `${block.name}: +$0200 makes the target direction 0 and slew wraps one step 63 to 0`);
      assert.equal(ram.u8(A5 + 0x28), 4,
        `${block.name}: successful aim returns to this type's fire tail`);
      const expected = ROM.u32(block.table);
      assert.equal(ram.u32(A5 + TURRET.gfxOff), expected,
        `${block.name}: ADDQ.B then ANDI.W selects longword entry zero`);
      assertExternalDraw(block, result, expected);
      sprites.push(expected);

      const strideResult = productionRun(block,
        { freeze: 0, cadence: 0, reload: 0x35, facing: 5, players: true, fireCounter: 5 });
      assert.equal(strideResult.ram.u8(A5 + TURRET.facingOff), 4,
        `${block.name}: target direction 0 slews exactly one step from 5 to 4`);
      const strideExpected = ROM.u32(block.table + 8);
      assert.equal(strideResult.ram.u32(A5 + TURRET.gfxOff), strideExpected,
        `${block.name}: facing 4 selects byte offset 8 at four-byte longword stride`);
      assertExternalDraw(block, strideResult, strideExpected);
    }
    assert.notEqual(sprites[0], sprites[1],
      'the same facing selects observably different type $11 and type $10 cartridge tables');
  });

test('SECTION 4: no-live-player carry happens after reload and before slew or the fire tail',
  { skip: SKIP_TABLES }, () => {
    for (const block of BLOCKS) {
      const oldSprite = 0x7e450000 | block.type;
      const ram = dirtyRam({ cadence: 0, reload: 0x6d, facing: 0x21,
        players: false, fireCounter: 5 });
      ram.setU32(A5 + TURRET.gfxOff, oldSprite);
      const residueA5 = ram.u8(A5 + 0x3f), residueA6 = ram.u8(A6 + 0x1f);
      const bucket = BUCKETS[resolveEmitStub(ROM, ram.u32(A5 + 0x2e)).bucket];
      ram.setU16(bucket.counter, 0);
      runHandler(block.hand, ram, ROM, A5,
        { tables: MOVES, unported: new UnportedLog() });
      assert.equal(ram.u8(A5 + TURRET.cadenceOff), 0x6d,
        `${block.name}: reload precedes target-select carry`);
      assert.equal(ram.u8(A5 + TURRET.facingOff), 0x21,
        `${block.name}: carry branches before one-step slew`);
      assert.equal(ram.u8(A5 + 0x28), 5,
        `${block.name}: carry branches directly to draw, not the fire tail`);
      assertExternalDraw(block, { ram, bucket, residueA5, residueA6 }, oldSprite);
    }
  });

test('SECTION 5: the shared helper consumes the caller-held A6, never a recycled pointer reread',
  { skip: SKIP_TABLES }, () => {
    const ram = dirtyRam({ cadence: 0, facing: 0x3f, players: true });
    ram.setU32(A5 + TURRET.subOff, DECOY_A6);
    ram.setU16(DECOY_A6 + 2, 0x5000);
    ram.setU16(DECOY_A6 + 4, 0x7000);
    const decoy2 = ram.u16(DECOY_A6 + 2), decoy4 = ram.u16(DECOY_A6 + 4);
    const result = turretStep(AIM_TABLES, ram, ROM, A5, A6,
      TURRET_HANDLERS.get(0x2688cc));
    assert.deepEqual(result, { aimed: true, dir: 0, carry: false, frozen: false, next: 'fire' });
    assert.equal(ram.u8(A5 + TURRET.facingOff), 0,
      'A6+$02/$04 are loaded in Y/X order and +$0200 keeps the target straight below');
    assert.equal(ram.u16(DECOY_A6 + 2), decoy2, 'the stale pointer target is not read or written');
    assert.equal(ram.u16(DECOY_A6 + 4), decoy4, 'the stale pointer X remains dirty');
  });

test('SECTION 6: one production body serves all three handlers and preserves their continuations', () => {
  const turretSource = readFileSync(join(SRC, 'turret.js'), 'utf8');
  const handlerSource = readFileSync(join(SRC, 'handlers.js'), 'utf8');
  assert.match(handlerSource,
    /import \{ TURRET_HANDLERS, turretStep \} from '\.\/turret\.js';/);
  assert.equal([...handlerSource.matchAll(/\bturretStep\s*\(/g)].length, 3,
    'the type $11, type $10 and type $3D production handlers share the helper');
  assert.match(handlerSource,
    /turretStep\(\(\) => aimTables\(rom\), ram, rom, a5, a6, TURRET_11\)/);
  assert.match(handlerSource,
    /turretStep\(\(\) => aimTables\(rom\), ram, rom, a5, a6, TURRET_10\)/);
  assert.equal([...turretSource.matchAll(/export function turretStep\s*\(/g)].length, 1,
    'exactly one production implementation survives');
  assert.doesNotMatch(turretSource, /function turretHandler\s*\(/,
    'the stale whole-handler throw must not return');
  assert.doesNotMatch(handlerSource, /function\s+turretStep\s*\(/,
    'handlers.js must not regrow an inline transcription');

  const productionUses = {};
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = readFileSync(join(SRC, entry.name), 'utf8');
    const count = [...source.matchAll(/\bturretStep\s*\(/g)].length;
    if (count) productionUses[entry.name] = count;
  }
  assert.deepEqual(productionUses, { 'handlers.js': 3, 'turret.js': 1 },
    'all production imports, calls and the sole declaration are enumerated');
});

test('SECTION 7: W454 merge stays absent after every later register change', () => {
  const heads = headRegister();
  const pairs = bodyPairs();
  const narrow = [...narrowIndex()].filter(([, claims]) => claims.size > 1);
  assert.equal(narrow.length, 16, 'W497 registers the authentic-selection adapter at $2491C0');
  assert.equal(heads.length, 71,
    'W475 left 68; W497 adds $2491C0 and $253D82/$253D90; later Hibachi source consolidation removes the temporary W554 $2A54E2 duplicate');
  assert.equal(pairs.length, 28,
    'W461 left 27; W497 adds the authentic-selection/player-object body pair');
  assert.ok(!pairs.some(([pair]) => pair === 'handlers.js fire11 <> turret.js turretStep'),
    'the seven-marker private fire11 body stays absent');
});
