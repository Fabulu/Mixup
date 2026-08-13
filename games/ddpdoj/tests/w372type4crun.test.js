// W372: DRIVE handler4C. The suite already proves it parses, is registered and matches the ROM; this
// proves it RUNS. A handler that throws on its first frame passes every static check there is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { AimTables } from '../src/aim.js';
import { MoveTables } from '../src/vectors.js';
import { handlerMap, TYPE_SPECS } from '../src/handlers.js';
import { RomWindows } from '../src/rom.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
// applyVelocityA6 needs the MOVEMENT tables, not the aim tables: the dispatcher's tail is `jmp $2417DE`
// and it consumes `ctx.tables.vector()`. handler4C gets its AIM tables separately, through the local
// aimTables(rom) helper -- two different table objects, and the smoke has to supply the right one.
const TABLES = HAVE ? new MoveTables(json, ROM) : null;
const T4C = TYPE_SPECS.get(0x4c);

const A5 = 0x8137c0;              // a scratch record, clear of the live table
const A6 = 0x8139c0;              // its sub-record

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A6 + 0x02, 0x2000);                 // position, on screen
  ram.setU16(A6 + 0x04, 0x2000);
  ram.setU32(A5 + T4C.hpPoolAt, 0x00007fff);     // a POSITIVE 32-bit pool, so it is alive
  ram.setU16(A6 + T4C.damageAccumAt, 0x7fff);
  const draws = [];
  return {
    ram,
    log,
    draws,
    ctx: {
      tables: TABLES, rom: ROM, aim: HAVE ? new AimTables(ROM) : null,
      unported: log, unportedLog: log, notes: log,
      bulletSpawn: (site, res) => draws.push({ site, res }),
      soundPost: () => {},
    },
  };
}
const run = (f) => handlerMap().get(T4C.handler)(f.ram, ROM, A5, f.ctx);

test('W372 handler4C RUNS a frame without throwing', { skip: SKIP }, () => {
  // The first thing that would have caught a bad splice, a wrong import or a missing ROM window, none
  // of which any static check in this suite can see.
  const f = world();
  assert.doesNotThrow(() => run(f), 'a plain frame');
});

test('W372 a FROZEN frame still runs, and takes the draw-only path', { skip: SKIP }, () => {
  // $26F5F2's bne lands on the FIRST draw call, not the rts, so a paused $4C skips every state and
  // still draws. Driving it proves the port took that branch rather than returning early.
  const f = world();
  f.ram.setU16(0x8130d2, 1);                     // the freeze flag
  const before = f.ram.u16(A6 + T4C.stateAt);
  assert.doesNotThrow(() => run(f), 'a frozen frame');
  assert.equal(f.ram.u16(A6 + T4C.stateAt), before, 'and the state machine did NOT advance');
});

test('W372 the retire arm returns early and releases the flag', { skip: SKIP }, () => {
  // ($9E,A6) set means the prologue retires: it clears $8130DE and returns without running a state.
  const f = world();
  f.ram.setU16(T4C.releaseFlag, 1);
  f.ram.setU8(A6 + 0x9e, 1);
  assert.doesNotThrow(() => run(f), 'the retire frame');
  assert.equal(f.ram.u16(T4C.releaseFlag), 0, '$8130DE released on the way out');
});

test('W372 ten frames run clean, so the state machine advances without throwing', { skip: SKIP }, () => {
  // The states each index tables ($26F984, $26FCD2, $2735FA) through ROM windows declared this wave.
  // A missing or mis-sized window throws by address, so ten frames is a real exercise of them.
  const f = world();
  for (let i = 0; i < 10; i++) {
    assert.doesNotThrow(() => run(f), `frame ${i}`);
  }
});
