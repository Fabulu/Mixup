// W314: what stage 5 actually needs, measured rather than guessed.
//
// W313 showed stage 5's whole spawn script walks with no `Unreached`. That was true and it was not
// the same as "stage 5 works": the walker allocates records and runs init stubs, while the per-frame
// HANDLER is a separate table entry. FIFTEEN of stage 5's 35 types have no handler in the port.
//
// W314 said sixteen. **W315 corrects it to fifteen**: type $00 points at `$26781C`, which
// `tools/dojcoverage.py` has always classified as a NULL handler, so there is nothing to port. The
// coverage tool's own inventory check is what caught the error.
//
// The number is what makes this a work list instead of an observation, so it is pinned here: a wave
// that ports one of the fifteen makes this file fail, and updating it is how the count comes down.

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
import { SPAWN, resetAndInstallStage26331E } from '../src/spawn.js';
import { enemyHandlerMap, runEnemyFrame } from '../src/enemyframe.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const SCRIPTS = Object.freeze({
  1: 0x230c6c, 2: 0x2325d0, 3: 0x2342ba, 4: 0x2358b0, 5: 0x237978,
});
const TYPE_LO = 0x267824;
const TYPE_HI = 0x27e412;

// W315 CORRECTION. `tools/dojcoverage.py` has long declared these two the NULL handlers, and
// they are why its report counts 130 of the 256 types as `null` rather than `unknown`. A type
// pointing at one of them has nothing to port: `$26781C` is `jmp $263762`, which is `freeEnemy`.
//
// W314 censused by absence from `enemyHandlerMap` alone and so counted type $00 among stage 5's
// missing types. Absence from that map is not the same as unported, and the coverage tool's
// inventory check is what caught it -- registering `$26781C` as a handler made it report
// "1 source registry entries are not in ROM inventories".
const NULL_HANDLERS = new Set([0x26781c, 0x27e40a]);

/** `$2635FC`/`$263608`: the low table for types 0..$7F, the high one for $80..$FF. */
function typeEntry(t) {
  const tab = t < 0x80 ? TYPE_LO : TYPE_HI;
  const off = (t & 0x7f) * SPAWN.TYPE_STRIDE;
  return { init: IMG.readUInt32BE(tab + off), handler: IMG.readUInt32BE(tab + off + 4) };
}
/** The 8-byte script records' type bytes, counted. */
function census(script) {
  const counts = new Map();
  let cur = script;
  while (IMG.readUInt16BE(cur) !== 0xffff) {
    const t = IMG[cur + 4];
    counts.set(t, (counts.get(t) ?? 0) + 1);
    cur += 8;
  }
  return counts;
}
function missingOf(script, map) {
  const out = [];
  for (const [t, n] of [...census(script)].sort((a, b) => a[0] - b[0])) {
    const e = typeEntry(t);
    if (NULL_HANDLERS.has(e.handler)) continue;          // nothing to port
    if (!map.has(e.handler)) out.push({ type: t, records: n, ...e });
  }
  return out;
}
/** The types a stage uses that point at a NULL handler -- present, and already complete. */
function nullOf(script) {
  return [...census(script)]
    .filter(([t]) => NULL_HANDLERS.has(typeEntry(t).handler))
    .map(([t, n]) => ({ type: t, records: n }));
}

// ==================== 1. THE WORK LIST

test('W314/W315 stage 5 has FIFTEEN types with no handler, over 65 of its 770 records',
  { skip: SKIP_IMG }, () => {
    // The measurement this file exists for. `enemyHandlerMap` is built from the cartridge, and
    // `runEnemyDriver`'s `handlers.get(h)` miss is where a missing handler is reported -- but
    // absence from that map is NOT the same as unported, which is W315's correction: a type
    // pointing at a NULL handler has nothing to port. W314 said sixteen and 66; it is fifteen
    // and 65.
    const map = enemyHandlerMap(ROM);
    const miss = missingOf(SCRIPTS[5], map);
    assert.equal(miss.length, 15, `fifteen types, got ${miss.map((m) => m.type.toString(16))}`);
    assert.equal(miss.reduce((a, m) => a + m.records, 0), 65, 'across 65 records');
    // Ranked by how much of the stage each one buys, which is the order to port them in.
    const ranked = [...miss].sort((a, b) => b.records - a.records || a.type - b.type);
    assert.deepEqual(ranked.map((m) => m.type),
      [0x45, 0x46, 0x8e, 0x1b, 0x1a, 0x81, 0x48, 0x49, 0x4a, 0x4b,
        0x43, 0x47, 0x4c, 0x59, 0xb0]);
    assert.deepEqual(ranked.slice(0, 3).map((m) => m.records), [21, 13, 6],
      '$45, $46 and $8E are a third of the missing records between them');
  });

test('W315 stage 5\'s one type-$00 record points at a NULL handler', { skip: SKIP_IMG }, () => {
  // `$26781C` is `jmp $263762` -- `freeEnemy`, six bytes, bounded by the init stub before it and
  // by `$267824`, the type table that named it. So the record spawns with run length 0 and frees
  // itself on its first frame. Nothing to port, and registering it as a handler is what the
  // coverage tool's inventory check rejects.
  assert.equal(typeEntry(0x00).handler, 0x26781c);
  assert.ok(NULL_HANDLERS.has(0x26781c));
  assert.equal(IMG.readUInt16BE(0x26781c), 0x4ef9, 'an absolute jmp');
  assert.equal(IMG.readUInt32BE(0x26781e), 0x00263762, 'to freeEnemy');
  assert.equal(IMG.readUInt16BE(0x267822), 0x4e71, 'then a nop pad');
  assert.equal(0x267824, TYPE_LO, 'and then the type table itself');
  assert.equal(IMG.readUInt16BE(typeEntry(0x00).init + 2), 0, 'run length zero');
  // Stage 5 is the only stage that uses it, one record, and no other stage has any null type.
  assert.deepEqual(nullOf(SCRIPTS[5]), [{ type: 0x00, records: 1 }]);
  for (const s of [1, 2, 3, 4]) assert.deepEqual(nullOf(SCRIPTS[s]), [], `stage ${s}`);
});

test('W314 each missing type\'s init and handler come from the cartridge\'s own table',
  { skip: SKIP_IMG }, () => {
    // Recorded so the next wave does not have to find them again, and asserted so a table that
    // moved would fail here rather than silently port the wrong routine.
    const want = new Map([
      [0x1a, [0x268d1e, 0x268e6c]],
      [0x1b, [0x269256, 0x269350]], [0x43, [0x26dda4, 0x26de32]],
      [0x45, [0x270dd0, 0x270e36]], [0x46, [0x27102c, 0x2710e2]],
      [0x47, [0x26d6ee, 0x26d7d0]], [0x48, [0x271284, 0x27133a]],
      [0x49, [0x27159e, 0x271640]], [0x4a, [0x2719ae, 0x271a64]],
      [0x4b, [0x271c92, 0x271d48]], [0x4c, [0x26f4da, 0x26f5f2]],
      [0x59, [0x2659dc, 0x265a14]], [0x81, [0x273f06, 0x274076]],
      [0x8e, [0x276404, 0x2764d2]], [0xb0, [0x2a42d4, 0x2a4606]],
    ]);
    for (const [t, [init, handler]] of want) {
      const e = typeEntry(t);
      assert.equal(e.init, init, `type $${t.toString(16)} init`);
      assert.equal(e.handler, handler, `type $${t.toString(16)} handler`);
    }
    assert.equal(want.size, 15);
  });

// ==================== 2. THE CONTRAST THAT MAKES IT A GAP

test('W314 stages 1..4 have NO missing handlers at all', { skip: SKIP_IMG }, () => {
  // Which is what makes fifteen a real gap rather than a property of the measurement. The four
  // stages that play end to end are complete by this test's own definition.
  const map = enemyHandlerMap(ROM);
  for (const s of [1, 2, 3, 4]) {
    const miss = missingOf(SCRIPTS[s], map);
    assert.deepEqual(miss, [], `stage ${s} is complete`);
  }
});

test('W314 stage 5 is the biggest stage and has the most distinct types', { skip: SKIP_IMG }, () => {
  const sizes = Object.fromEntries([1, 2, 3, 4, 5].map((s) => {
    const c = census(SCRIPTS[s]);
    return [s, { types: c.size, records: [...c.values()].reduce((a, b) => a + b, 0) }];
  }));
  assert.deepEqual(sizes[5], { types: 35, records: 770 });
  assert.deepEqual(sizes[1], { types: 21, records: 339 });
  assert.deepEqual(sizes[4], { types: 29, records: 382 });
  for (const s of [1, 2, 3, 4]) {
    assert.ok(sizes[5].records > sizes[s].records, `bigger than stage ${s}`);
    assert.ok(sizes[5].types > sizes[s].types, `and more varied than stage ${s}`);
  }
});

// ==================== 3. WHY W313'S CLEAN WALK WAS NOT A CLEAN STAGE

test('W314 the walker and the driver are different tables', { skip: SKIP_IMG }, () => {
  // W313 walked all 770 records with no `Unreached`, which was true and incomplete. `initDispatch`
  // reads `init` (`$263614`) and the RUN LENGTH out of the init stub, while the per-frame handler
  // is the SECOND longword of the same table entry (`$263628`). A type can therefore spawn
  // perfectly and have nothing to run afterwards, which is exactly the state 16 of stage 5's types
  // are in.
  const map = enemyHandlerMap(ROM);
  const e = typeEntry(0x81);
  assert.equal(e.init, 0x273f06, 'type $81\'s init stub');
  assert.equal(IMG.readUInt16BE(e.init), 0x3b7c, 'and it IS the 8-byte `move.w #N,($4,A5)` stub');
  assert.equal(IMG.readUInt16BE(e.init + 6), 0x4e75, 'ending in rts');
  assert.equal(IMG.readUInt16BE(e.init + 2), 1, 'with run length 1');
  assert.ok(!map.has(e.handler), 'but its handler is absent');
  // `handlers.js` already names `$273F06` -- as the far boundary of type $80's span, which is how
  // the port came to know the address without ever porting the type.
  const src = readFileSync(path.join(R, 'src', 'handlers.js'), 'utf8');
  assert.match(src, /\$273F06. is type \$81's init stub/);
});

test('W314 the first live throw is type $81\'s run-length read', { skip: SKIP }, () => {
  // Driving the enemy frame over the seed with stage 5 installed stops at `initDispatch`'s
  // `rom.u16(init + 2)` for type $81 -- a WINDOW error, because an unported type has no window
  // either. It is the shallowest symptom of the sixteen and it is why the throw's address looks
  // like data rather than like a missing handler.
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU16(0x813092, 4);
  ram.setU16(0x813094, 8);
  ram.setU16(0x813096, 16);
  resetAndInstallStage26331E(ram, ROM, log);
  const handlers = enemyHandlerMap(ROM);
  const ctx = {
    tables: MT, rom: ROM, unportedLog: log, unported: log, notes: log, palette: new PaletteState(),
  };
  let caught = null;
  for (let f = 0; f < 1500 && !caught; f++) {
    ram.setU16(SPAWN.DISTANCE_CLOCK, f);
    try { runEnemyFrame(ram, ROM, ctx, handlers); } catch (e) { caught = e; }
  }
  assert.ok(caught, 'stage 5 does stop');
  assert.equal(caught.name, 'Unreached');
});

test('W314 a bare `new Ram()` is not a valid way to drive ANY stage', { skip: SKIP }, () => {
  // The control that saved this wave from a wrong conclusion. Driving the enemy frame over an empty
  // Ram throws for stage 1 too -- at a garbage pointer, because the machine has no coherent
  // globals. So a throw under that harness says nothing about the stage; only the per-type handler
  // census above does.
  const drive = (stage) => {
    const ram = new Ram();
    const log = new UnportedLog();
    ram.setU16(0x813092, stage);
    ram.setU16(0x813094, stage * 2);
    ram.setU16(0x813096, stage * 4);
    resetAndInstallStage26331E(ram, ROM, log);
    const handlers = enemyHandlerMap(ROM);
    const ctx = {
      tables: MT, rom: ROM, unportedLog: log, unported: log, notes: log,
      palette: new PaletteState(),
    };
    for (let f = 0; f < 1500; f++) {
      ram.setU16(SPAWN.DISTANCE_CLOCK, f);
      try { runEnemyFrame(ram, ROM, ctx, handlers); } catch { return f; }
    }
    return null;
  };
  assert.notEqual(drive(0), null, 'stage 1 throws under this harness, and stage 1 plays');
  assert.notEqual(drive(4), null, 'so stage 5 throwing under it proves nothing on its own');
});
