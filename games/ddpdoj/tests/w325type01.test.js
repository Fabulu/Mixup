// W325 -- type $01 ($267C24/$267C70), the P2-driven item spawner, plus the two shared library
// routines it needed: `$242A48` (the stick decode, SEVEN callers) and `$259C42` (FIVE).
//
// **THIS IS NOT TYPE $81, AND THE MISTAKE IS PART OF WHAT THIS FILE PINS.** The type table is two
// tables -- `$267824` for `$00..$7F` and `$27E412` for `$80..$FF` -- and W325's reconnaissance
// masked the index with `& $7F` while leaving the base at the LOW table, so it read entry 1 and
// translated type `$01`. Test 1 asserts BOTH tables so the confusion cannot recur silently, and
// records that the real `$81` is `$273F06`/`$274076` and still unported.
//
// The code is right about the routines it read. What it is not is stage-5 progress: no stage
// script spawns type $01, which test 2 asserts by walking all five scripts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { stickMove242A48 } from '../src/movement.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const TABLES = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const HANDLER = 0x267c70;
const INITBODY = 0x267c2c;
const A5 = 0x8137c0;
const A6 = 0x8139c0;
const P2RAW = 0x803976;            // $23D17E reads this -- the HELD word
const P2EDGE = 0x803978;           // $23D18E reads this -- the EDGE word
const CONFIG = 0x812e0a;           // $259C42 reads this, and NOTHING writes it
const FREEZE = 0x8130d2;
const STICK_TABLE = 0x242a70;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  const items = [];
  return {
    ram, log, items,
    ctx: {
      tables: TABLES, rom: ROM,
      unported: log, unportedLog: log, notes: log,
      // `items.js` calls this itself as `itemSpawn(d0, siteAddr, slot)` -- the ORDER is the
      // pool's and not this file's, and W325 briefly had the handler call it a second time
      // with different arguments, which showed up here as two events per press.
      itemSpawn: (kind, site, slot) => items.push({ kind, site, slot }),
      soundPost: () => {},
    },
  };
}
const run = (f) => handlerMap().get(HANDLER)(f.ram, ROM, A5, f.ctx);

// ==================== 1. WHICH TYPE THIS ACTUALLY IS

test('W325 $267C24/$267C70 is type $01 -- and $81 is $273F06/$274076, still unported',
  { skip: SKIP_IMG }, () => {
    // The type table is TWO tables and the index is masked, not offset. Reading the LOW table
    // with a masked index is what produced this wave's mislabel; both are asserted so a future
    // reader can see the difference rather than rediscover it.
    const LO = 0x267824, HI = 0x27e412;
    assert.equal(IMG.readUInt32BE(LO + 0x01 * 8), 0x267c24, 'type $01 init, LOW table');
    assert.equal(IMG.readUInt32BE(LO + 0x01 * 8 + 4), HANDLER, 'type $01 handler');
    assert.equal(IMG.readUInt32BE(HI + 0x01 * 8), 0x273f06, 'type $81 init, HIGH table');
    assert.equal(IMG.readUInt32BE(HI + 0x01 * 8 + 4), 0x274076, 'type $81 handler');
    assert.ok(!HANDLER_ADDRESSES.includes(0x274076),
      'and type $81 is NOT registered -- this wave did not port it');
    assert.ok(HANDLER_ADDRESSES.includes(HANDLER), 'type $01 is');
    assert.ok(INIT_BODY_ADDRESSES.includes(INITBODY), 'both halves');
  });

test('W325 NO stage script spawns type $01, so this is not census progress',
  { skip: SKIP_IMG }, () => {
    // Walking all five spawn scripts on the 8-byte stride. This is why the type never appeared in
    // `w314stage5scope.test.js`'s missing list and why porting it did not move that census.
    const SCRIPTS = [0x230c6c, 0x2325d0, 0x2342ba, 0x2358b0, 0x237978];
    for (const base of SCRIPTS) {
      let cur = base, n = 0;
      while (IMG.readUInt16BE(cur) !== 0xffff) {
        if (IMG[cur + 4] === 0x01) n++;
        cur += 8;
      }
      assert.equal(n, 0, `script $${base.toString(16)} holds no type $01 record`);
    }
  });

// ==================== 2. THE STICK TABLE, AGAINST THE IMAGE

test('W325 STICK_HEADINGS matches the sixteen bytes at $242A70 exactly',
  { skip: SKIP_IMG }, () => {
    // `movement.js` carries the table as a literal with an `[M]` marker rather than as a ROM
    // window, the way `bee.js` carries `BASE_LADDER`. That is only safe if something compares it
    // against the cartridge, which is this test. Eight real headings and eight `$FF` refusals.
    const want = [0xff, 0x00, 0x20, 0xff, 0x30, 0x38, 0x28, 0xff,
      0x10, 0x08, 0x18, 0xff, 0xff, 0xff, 0xff, 0xff];
    for (let i = 0; i < 16; i++) {
      assert.equal(IMG[STICK_TABLE + i], want[i], `byte ${i} of $242A70`);
    }
  });

test('W325 the stick decode moves on a HELD direction and refuses the invalid ones',
  { skip: SKIP }, () => {
    // `$242A48` reads p2RAW ($803976) -- the HELD word, not the edge one. The eight real entries
    // are the compass points 8 units apart; index 0 (nothing), 3 (up+down) and 7/$B/$C..$F refuse.
    for (const [held, heading] of [[1, 0x00], [2, 0x20], [4, 0x30], [5, 0x38],
      [6, 0x28], [8, 0x10], [9, 0x08], [10, 0x18]]) {
      const f = world();
      f.ram.setU16(P2RAW, held);
      f.ram.setU8(A6 + 0x1a, 4);                 // a speed, so the vector is non-zero
      stickMove242A48(f.ram, TABLES, A6);
      assert.equal(f.ram.u8(A6 + 0x1b), heading, `held ${held} -> heading $${heading.toString(16)}`);
    }
    // THE REFUSALS, and the store that is NOT dead: `$242A64` writes $40 before returning, and
    // $40 & $3F is 0, so a later $2417DE reads heading 0 rather than a stale one.
    for (const held of [0, 3, 7, 0xb, 0xf]) {
      const f = world();
      f.ram.setU16(P2RAW, held);
      f.ram.setU8(A6 + 0x1b, 0x18);              // a stale heading the refusal must overwrite
      const v = stickMove242A48(f.ram, TABLES, A6);
      assert.equal(f.ram.u8(A6 + 0x1b), 0x40, `held ${held} stores $40`);
      assert.deepEqual(v, { dy: 0, dx: 0 }, 'and applies nothing');
    }
  });

test('W325 the decode reads p2RAW and NOT p2EDGE', { skip: SKIP }, () => {
  // Three two-instruction reads of three different words exist ($803972, $803976, $803978) and
  // picking the wrong one makes a held stick move once instead of every frame. Setting only the
  // EDGE word must produce a refusal, because the decode never looks at it.
  const f = world();
  f.ram.setU16(P2EDGE, 1);
  f.ram.setU16(P2RAW, 0);
  stickMove242A48(f.ram, TABLES, A6);
  assert.equal(f.ram.u8(A6 + 0x1b), 0x40, 'p2EDGE alone is not a held direction');
});

// ==================== 3. THE INIT BODY: A LITERAL POSITION, NO $263808

test('W325 the init body writes a LITERAL position and never reads the script\'s',
  { skip: SKIP }, () => {
    // `$267C46 move.l #$38001C00,($2,A6)` and no `jsr $263808` anywhere in the body. Poison the
    // place `readInitPosition` would have taken the position from: it must be ignored.
    const f = world();
    f.ram.setU32(A5 + 0x48, 0xdeadbeef);         // what $263808 would have copied
    f.ram.setU32(A5 + 0x12, 0x00230000);         // and its movement cursor
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    assert.equal(f.ram.u32(A6 + 0x02), 0x38001c00,
      'the fixed position, not the script\'s');
  });

// ==================== 4. THE HANDLER: COUNTDOWN, THEN AN ITEM ON THE EDGE

test('W325 while ($18,A5) counts down NO item spawns, and the object still MOVES',
  { skip: SKIP }, () => {
    // The countdown gates the SPAWN and not the motion: `$242A48` runs before the test.
    const f = world();
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    f.ram.setU16(A5 + 0x18, 3);
    f.ram.setU16(P2EDGE, 0xffff);                // every button, including bit 6
    f.ram.setU16(P2RAW, 1);                      // and a held direction
    f.ram.setU8(A6 + 0x1a, 4);
    run(f);
    assert.equal(f.ram.u16(A5 + 0x18), 2, 'the countdown decremented');
    assert.equal(f.items.length, 0, 'and NOTHING spawned while it runs');
    assert.equal(f.ram.u8(A6 + 0x1b), 0x00, 'but the stick was still read');
  });

test('W325 at zero, bit 6 of p2EDGE spawns ONE item whose kind is $812E0A * 4',
  { skip: SKIP }, () => {
    for (const [cfg, kind] of [[0, 0x00], [1, 0x04], [2, 0x08], [3, 0x0c], [4, 0x10]]) {
      const f = world();
      runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
      f.ram.setU16(A5 + 0x18, 0);
      f.ram.setU16(P2EDGE, 1 << 6);
      f.ram.setU16(CONFIG, cfg);
      run(f);
      assert.equal(f.items.length, 1, `config ${cfg} spawns one item`);
      assert.equal(f.items[0].kind, kind, `and its kind is ${cfg} * 4 = $${kind.toString(16)}`);
    }
    // The five accepted values are EXACTLY the item pool's kinds $00/$04/$08/$0C/$10 -- five of
    // its six. `$14`, the P2 hyper item, is unreachable from here, which is the internal check
    // that the range test was read correctly.
  });

test('W325 the kind is range-checked with SIGNED compares on both sides', { skip: SKIP }, () => {
  // `$267C9A cmpi.w #$4,D0 / bgt` and `$267CA2 tst.w D0 / bmi` are both signed, so 5 and $FFFF
  // are both refused -- and $FFFF is the one an unsigned reading would let through as 65535 > 4
  // ... or, worse, scale to a kind of $FFFC.
  for (const cfg of [5, 6, 0x7fff, 0xffff, 0xfffe]) {
    const f = world();
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    f.ram.setU16(A5 + 0x18, 0);
    f.ram.setU16(P2EDGE, 1 << 6);
    f.ram.setU16(CONFIG, cfg);
    run(f);
    assert.equal(f.items.length, 0, `config $${cfg.toString(16)} is REFUSED`);
  }
});

test('W325 a button that is not bit 6 spawns nothing', { skip: SKIP }, () => {
  const f = world();
  runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
  f.ram.setU16(A5 + 0x18, 0);
  f.ram.setU16(P2EDGE, 0xffff & ~(1 << 6));      // everything except bit 6
  f.ram.setU16(CONFIG, 0);
  run(f);
  assert.equal(f.items.length, 0, 'btst #$6 is the only bit that fires');
});

test('W325 the freeze stops the MOTION but not the countdown', { skip: SKIP }, () => {
  // `$2417DE` has its own `tst.w $8130D2` gate, so the vector is {0,0} and nothing is applied --
  // but the heading is still stored and the handler still runs its own arms.
  const f = world();
  runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
  f.ram.setU16(FREEZE, 1);
  f.ram.setU16(A5 + 0x18, 2);
  f.ram.setU16(P2RAW, 1);
  f.ram.setU8(A6 + 0x1a, 4);
  const before = f.ram.u32(A6 + 0x02);
  run(f);
  assert.equal(f.ram.u32(A6 + 0x02), before, 'frozen: the position did not move');
  assert.equal(f.ram.u8(A6 + 0x1b), 0x00, 'but the heading was still decoded and stored');
  assert.equal(f.ram.u16(A5 + 0x18), 1, 'and the countdown still ran');
});
