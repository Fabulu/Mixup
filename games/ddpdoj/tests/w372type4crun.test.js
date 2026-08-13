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
import { BUCKETS } from '../src/spritequeue.js';

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
// THE FRAME DRIVER RESETS THE SPRITE QUEUE; a bare handler call does not. `enqueueRegisters` writes at
// base + off and bumps off EVERY call, so without this the write address walks forward until it reaches
// the scratch record -- which is what made three earlier runs look like the handler corrupting memory.
// No choice of scratch address avoids it; only resetting does.
const frame = (f) => { for (const b of BUCKETS) f.ram.setU16(b.counter, 0); };
const run = (f) => { frame(f); return handlerMap().get(T4C.handler)(f.ram, ROM, A5, f.ctx); };

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

test('W372 every internal call site matches its definition arity', { skip: SKIP }, () => {
  // The bug this file found was an ARITY MISMATCH -- handler4C called retireCheck4C(ram, a6) against a
  // five-parameter definition. JavaScript does not check that, so nothing static caught it. This is the
  // audit generalised: every $4C function's call sites, counted depth-aware, against its definition.
  //
  // It is a source-text check rather than a ROM check, which is unusual here and is the point: the
  // three defects this type produced (invented names, wrong order, wrong count) are all invisible to
  // the cartridge assertions, because none of those 64 pins ever CALLS anything.
  const src = readFileSync(new URL('../src/handlers.js', import.meta.url), 'utf8');
  const from = src.indexOf('// ===================== TYPE $4C -- the stage-5 multi-part set piece');
  const to = src.indexOf('function handler1A(ram, rom, a5, ctx) {');
  assert.ok(from > 0 && to > from, 'the $4C block is where it was spliced');
  const blk = src.slice(from, to).replace(/\/\/[^\n]*/g, '');   // strip comments: commas hide in them
  const defs = new Map();
  for (const m of blk.matchAll(/function (\w+)\(([^)]*)\)\s*\{/g)) {
    defs.set(m[1], m[2].split(',').filter((a) => a.trim()).length);
  }
  assert.ok(defs.size >= 17, `all $4C functions found, got ${defs.size}`);
  const argsAt = (t, k) => {
    let d = 0; let cur = ''; const out = [];
    for (; k < t.length; k++) {
      const c = t[k];
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (d === 0) { out.push(cur); break; } d--; }
      if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    return out.filter((a) => a.trim()).length;
  };
  const bad = [];
  for (const [name, n] of defs) {
    const re = new RegExp(`(?<!function )\\b${name}\\(`, 'g');
    for (const m of blk.matchAll(re)) {
      const got = argsAt(blk, m.index + m[0].length);
      if (got !== n) bad.push(`${name}: defined with ${n}, called with ${got}`);
    }
  }
  assert.deepEqual(bad, [], 'no call site disagrees with its definition');
});

test('W372 state 0s TWO-STAGE timer really fires, and it changes the draw variant', { skip: SKIP }, () => {
  // Behaviour, not just absence of throwing. State 0 arms ($34,A6)=2 with its reload, and ($1A,A6)=$16.
  // The inner counter borrows and reloads; only then does the outer tick. When the outer reaches zero it
  // sets ($17,A5) -- the field the draw selector reads -- and advances to state 1.
  //
  // A port that collapsed the two counters into one would reach state 1 far too early, and a port that
  // stored the state unconditionally in setState4C would never advance at all. Both pass the smokes.
  const f = world();
  f.ram.setU16(A6 + 0x02, 0x2100);               // past the $2000 gate, so step 1 completes at once
  assert.equal(f.ram.u8(A5 + T4C.drawSelectAt), 0, 'the draw variant starts clear');
  let flipped = -1;
  for (let i = 0; i < 400 && flipped < 0; i++) {
    run(f);
    if (f.ram.u8(A5 + T4C.drawSelectAt) !== 0) flipped = i;
  }
  assert.ok(flipped > 0, `the two-stage timer fired, on frame ${flipped}`);
  // It must NOT fire immediately: two nested counters means tens of frames, not one or two.
  assert.ok(flipped > 8, `and it took ${flipped} frames, not one -- the counters are nested`);
  assert.equal(f.ram.u16(A6 + T4C.stateAt), 1, 'and it handed over to state 1');
  assert.equal(f.ram.u16(A6 + T4C.stepAt), 0, "state 1 starts at step 0 -- $26F858 cleared it");
});

// W372 OPEN DEFECT -- the alternation probe is REMOVED, not disabled, and this note is why.
//
// Driving 4000 frames throws `$8eec0ed2 is outside main RAM` from drawAll4C's `ram.u32(a6 + 0x02)`.
// That address is a POSITION LONG, so ($6,A5) -- the sub-record pointer A6 is read from -- is being
// overwritten somewhere in a long run. The handler never writes ($6,A5) itself, so the suspect is a
// callee reached only deep into the state machine: buildParts246520 on the death path, or one of the
// spawn writes running with a bad q.addr.
//
// It is recorded rather than left as a red test because a failing suite stops being read. The four
// smokes and the state-0 behaviour test above all pass, so what is proven is: the handler runs, the
// two-stage timer fires, and something corrupts the sub-record pointer over hundreds of frames.
// FIND IT BEFORE TRUSTING $4C IN A LONG RUN.

test('W372 states 2 and 4 ALTERNATE over a long run -- the one-bit toggle drives both', { skip: SKIP }, () => {
  // Restored now the fixture resets the sprite queue each frame, as the frame driver does. ($18,A5) is
  // a single bit: state 1 picks 2 or 4 from it, then flips it. A port that hardcoded either would run
  // half the pattern forever and pass every other test in this file.
  const f = world();
  f.ram.setU16(A6 + 0x02, 0x2100);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    run(f);
    assert.equal(f.ram.u32(A5 + 0x06), A6, `the sub-record pointer survives frame ${i}`);
    seen.add(f.ram.u16(A6 + T4C.stateAt));
  }
  assert.ok(seen.has(2) && seen.has(4),
    `visited both branch states; saw ${[...seen].sort((a, b) => a - b).join(',')}`);
  assert.ok(f.ram.u16(A5 + 0x18) <= 1, 'and the toggle stays a single bit');
});
