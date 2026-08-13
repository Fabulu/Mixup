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

test('W341 stage 5 has FOUR types with no handler, over 19 of its 770 records',
  { skip: SKIP_IMG }, () => {
    // The measurement this file exists for. `enemyHandlerMap` is built from the cartridge, and
    // `runEnemyDriver`'s `handlers.get(h)` miss is where a missing handler is reported -- but
    // absence from that map is NOT the same as unported, which is W315's correction: a type
    // pointing at a NULL handler has nothing to port. W314 said sixteen and 66; it is fifteen
    // and 65.
    // W323: TWELVE and 37 -> ELEVEN and 32. Type $1B is ported, and it was the biggest CLEAN one
    // at five records -- `$46` is still bigger at thirteen and still wants `$55` first.
    // W326: ELEVEN and 32 -> TEN and 29, type $81 (3 records). `$1A` is the only remaining type
    // that is neither a dependency bundle nor a boss, and it is blocked on register provenance at
    // `$268D8C` rather than on reading -- see the worklog.
    // W335: TEN and 29 -> NINE and 27, type $49 (2 records). Its two remaining shots are a NOTE and
    // not an `unreached`, because $2816F6's register effects are unread -- so the type IS registered
    // and stage 5 no longer reports a missing handler for it. `$4A`/`$4B` are next and share
    // $270D92 with it (W333).
    // W337: NINE and 27 -> EIGHT and 25, type $4A (2 records). It shares $270D92 with $49 but
    // diverges from it in five places -- see the handler header. `$4B` is the last of the band.
    // W338: EIGHT and 25 -> SEVEN and 23, type $4B (2 records). The $48/$49/$4A/$4B band is CLOSED
    // except `$48`, and the three ported members agree on no constant at all.
    // W339: SEVEN and 23 -> SIX and 21, type $48 (2 records). **THE BAND IS CLOSED.** All four are
    // ported and they form two structural pairs that agree on no handler constant whatsoever.
    // W340: SIX and 21 -> FIVE and 20, type $47, which has exactly ONE record in stage 5's script.
    // **CORRECTION**: earlier notes called $47 "$E2 records". `$E2` is its routine's byte SPAN, taken
    // from the handoff's span list ($49 $A2, $4A $B6, $4B $B6, $47 $E2) -- not a record count. It is
    // the scroll-stopping set-piece and shares NOTHING with the band -- see its handler header.
    const map = enemyHandlerMap(ROM);
    const miss = missingOf(SCRIPTS[5], map);
    // W341: FIVE and 20 -> FOUR and 19, type $43 (one record). Its state 1 carries a NOTE, not an
    // `unreached`: $2417DE is tabulated in machine.js but not implemented, so a $43 in state 1 sits
    // still. The type IS registered, which was the safety requirement.
    // W352: FOUR and 19 -> THREE and 6, type $46 (THIRTEEN records, by far the biggest single drop
    // this file has recorded). W317's dependency finding was right: $46 needed $55 first, W351 ported
    // $55, and $46 followed immediately. Its mode-3 retract arm is an `unreached()` rather than an
    // implementation -- nothing writes 3 to ($17,A5), and the child back-pointer that looked like the
    // missing writer is destroyed by $55's own prototype at $2723B8.
    // W363: THREE and 6 -> TWO and 5, type $B0 (HIBACHI, one record). Its handler is registered with its
    // BODY ($2A6B94) as a note(), which is the $43/$49 pattern -- but it was only safe here because the
    // stage-clear path ($242952, runStageAdvance242952) is a COMPLETE translation. A note-only stage
    // advance would have soft-locked the run at stage 5's end with a green suite and no error.
    // W365: TWO and 5 -> ONE and 1, type $1A (four records). It was recorded for many waves as "blocked on
    // a TRACE at $268D8C" and needed no trace at all -- D2 is consumed sixteen bytes before that call.
    // W372: ZERO. $4C was the last, and this assertion has counted down 4 -> 3 -> 2 -> 1 -> 0 across
    // W352/W363/W365/W372. It is REWRITTEN rather than renumbered because "$4C alone" was a factual
    // claim about which type remained, not a number -- the same distinction W365 got wrong for $1A.
    assert.equal(miss.length, 0,
      `EVERY stage-5 type now has a handler, got ${miss.map((m) => m.type.toString(16))}`);
    assert.equal(miss.reduce((a, m) => a + m.records, 0), 0, 'across 0 records');
    // W369: AND THIS COUNT IS NOT SPAWNABILITY. It measures HANDLERS. $1A and $B0 have registered
    // handlers and NO registered init body, so both throw at spawn and neither is in `miss`. Stage 5
    // therefore has three gaps, not one, and the boss is among them. See w346's W369 pins.
    for (const t of [0x1a, 0xb0]) {
      assert.ok(map.has(typeEntry(t).handler),
        `$${t.toString(16).toUpperCase()} has a handler, which is why it is absent from miss`);
    }
    // Ranked by record count. With $46 gone the remaining three are the two dependency/boss bundles
    // plus $1A, which is still BLOCKED on register provenance at $268D8C rather than on reading.
    assert.deepEqual([...miss], [],
      'The ranked list is empty. $4C was the last: ONE record, five unrolled parts, SEVEN sprite '
      + 'blocks, and 64 assertions in w363type4cfields holding the reading it was transcribed from. '
      + 'HANDLER coverage for stage 5 is now complete -- but see W369: $1A is still UNSPAWNABLE '
      + 'because its INIT BODY is unported, and this test counts handlers, not spawnability.');
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
      [0x46, [0x27102c, 0x2710e2]],
      [0x47, [0x26d6ee, 0x26d7d0]], [0x48, [0x271284, 0x27133a]],
      [0x49, [0x27159e, 0x271640]], [0x4a, [0x2719ae, 0x271a64]],
      [0x4b, [0x271c92, 0x271d48]], [0x4c, [0x26f4da, 0x26f5f2]],
      [0x81, [0x273f06, 0x274076]],
      [0xb0, [0x2a42d4, 0x2a4606]],
    ]);
    for (const [t, [init, handler]] of want) {
      const e = typeEntry(t);
      assert.equal(e.init, init, `type $${t.toString(16)} init`);
      assert.equal(e.handler, handler, `type $${t.toString(16)} handler`);
    }
    assert.equal(want.size, 12);
  });

test('W317 FOUR of the thirteen spawn an UNPORTED child, so record count is the wrong order',
  { skip: SKIP_IMG }, () => {
    // W314 ranked the list by how many records each type covers. W317 scanned every remaining
    // handler for the three deferred-spawn entries (`$263678`/`$263684`/`$263690`) and read the
    // `moveq #TYPE` before each, which changes the order completely: the biggest type by records
    // costs the most, and one of them costs four children.
    //
    //   $46 x13 ~418B   spawns $55, UNPORTED and 1130 bytes  -> ~1550B for 13 records
    //   $48 x2  ~612B   spawns $54, UNPORTED
    //   $43 x1  ~270B   spawns $44, UNPORTED
    //   $4C x1  ~3044B  spawns $4E, $50, $52 and $58 -- ALL FOUR UNPORTED
    //   the other nine are standalone, and `$8E` (6 records, ~468B) is the best of them
    //
    // Asserted as the dependency edges rather than as byte counts, because the edges are what the
    // ROM says and the byte counts are bounded by the next table entry rather than measured.
    const map = enemyHandlerMap(ROM);
    const spawnsOf = (handler, span) => {
      const out = new Set();
      for (let a = handler; a < handler + span - 5; a += 2) {
        if (IMG.readUInt16BE(a) !== 0x4eb9) continue;
        const tgt = IMG.readUInt32BE(a + 2);
        if (tgt !== 0x263678 && tgt !== 0x263684 && tgt !== 0x263690) continue;
        for (let b = a - 2; b >= a - 16; b -= 2) {
          const w = IMG.readUInt16BE(b);
          if ((w & 0xff00) === 0x7000) { out.add(w & 0xff); break; }       // moveq #imm,D0
          if (w === 0x303c) { out.add(IMG.readUInt16BE(b + 2) & 0xff); break; } // move.w #imm,D0
        }
      }
      return out;
    };
    // THREE now have an unported child, and which child. W351 ported $55, so $46's entry moved to the
    // list below rather than being deleted -- deleting it would lose the only machine-checked record of
    // the $46 -> $55 edge, which is exactly what made $55 worth porting.
    for (const [t, span, kids] of [[0x48, 0x264, [0x54]],
      [0x43, 0x10e, [0x44]], [0x4c, 0xbe4, [0x4e, 0x50, 0x52, 0x58]]]) {
      const got = spawnsOf(typeEntry(t).handler, span);
      for (const k of kids) {
        assert.ok(got.has(k), `type $${t.toString(16)} spawns $${k.toString(16)}`);
        assert.ok(!map.has(typeEntry(k).handler), `and $${k.toString(16)} is unported`);
      }
    }
    // Same treatment W319 gave $8E and W323 gave $1B: keep the scan assertion, flip the ported claim.
    for (const [t, span, kids] of [[0x46, 0x1a2, [0x55]]]) {
      const got = spawnsOf(typeEntry(t).handler, span);
      for (const k of kids) {
        assert.ok(got.has(k), `type $${t.toString(16)} still spawns $${k.toString(16)}`);
        assert.ok(map.has(typeEntry(k).handler), `and W351 PORTED $${k.toString(16)}`);
      }
    }
    // `$8E` was the biggest standalone one and W319 took it; `$1B` (5 records) was next and W323
    // took that. Both kept as assertions that the scan still agrees they spawn nothing, which is
    // what made them cheap -- and `$1A` is now the biggest clean target.
    assert.equal(spawnsOf(typeEntry(0x8e).handler, 0x1d4).size, 0, '$8E spawns nothing');
    assert.ok(map.has(typeEntry(0x8e).handler), 'and W319 ported it');
    assert.equal(spawnsOf(typeEntry(0x1b).handler, 0x3fc).size, 0, '$1B spawns nothing either');
    assert.ok(map.has(typeEntry(0x1b).handler), 'and W323 ported it');
    assert.equal(spawnsOf(typeEntry(0x1a).handler, 0x1fc).size, 0, '$1A spawns nothing either');
    assert.ok(map.has(typeEntry(0x1a).handler), 'and W365 ported it -- it was NEVER blocked on a trace');
    // And W317's own type spawned an ALREADY-ported child, which is why it was the cheap one.
    assert.ok(map.has(typeEntry(0x3f).handler), 'type $3F, W199, is ported');
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
  // **THE WORKED EXAMPLE MOVED IN W326.** This test used type `$81` to show a type that spawns
  // perfectly and has no handler -- and W326 ported `$81`, so the example had to become a type that
  // is still in that state. `$1A` is, and it is the next one in the queue (blocked on the D2/D3
  // provenance at `$268D8C`, not on reading). The point of the test is unchanged.
  const e = typeEntry(0x1a);
  assert.equal(e.init, 0x268d1e, 'type $1A\'s init stub');
  assert.equal(IMG.readUInt16BE(e.init), 0x3b7c, 'and it IS the 8-byte `move.w #N,($4,A5)` stub');
  assert.equal(IMG.readUInt16BE(e.init + 6), 0x4e75, 'ending in rts');
  assert.equal(IMG.readUInt16BE(e.init + 2), 1, 'with run length 1');
  // W365: was `!map.has` -- $1A's handler is now registered. The init STUB facts above still hold and are
  // the point of this test; the handler's absence was incidental to them.
  assert.ok(map.has(e.handler), 'and W365 registered its handler');
  // And the type W326 DID port is registered on both halves, which is the contrast that makes the
  // assertion above mean something rather than merely being true of everything.
  assert.ok(map.has(typeEntry(0x81).handler), 'W326: type $81\'s handler IS registered now');
  assert.equal(typeEntry(0x81).init, 0x273f06, 'out of the HIGH table, not the low one');
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
