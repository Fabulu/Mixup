// shapecheck.mjs -- does the port's trace really emit the oracle's state vector?
//
// The comparison is only as good as the claim that the two sides are talking
// about the same fields. This checks that claim the way docs/knowledge/03 says
// to: the two sides are DERIVED INDEPENDENTLY. The expected field list is
// parsed out of probe.lua's own `KEYS` table -- the Lua source, the thing the
// emulator actually runs -- and compared against the list porttrace.mjs
// declares. A test that imported the constant from porttrace.mjs and compared
// it to itself would prove only that JavaScript works.
//
// It also checks the two claims that would silently invalidate every number:
//   * the sample point porttrace.mjs prints ($80B5) is the address probe.lua
//     hooks;
//   * every watched address is either readable from the port's state or listed
//     in UNMODELLED with a reason.
//
// Runs without Mesen and without a recorded corpus -- it seeds the port from
// 2048 zero bytes, which is a legal RAM image (game mode 0, nothing alive).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tracePort, PROBE_KEYS, WORK_KEYS, NOT_PRODUCED, UNMODELLED, peek }
  from './porttrace.mjs';
import { createState } from '../../src/state.js';
import { headlessResources } from '../../tests/helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function luaKeys(file, varName) {
  const src = readFileSync(join(HERE, file), 'utf8');
  const m = new RegExp(`local ${varName}\\s*=\\s*\\{([\\s\\S]*?)\\}`).exec(src);
  if (!m) throw new Error(`could not find \`local ${varName}\` in ${file}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function luaConst(file, name) {
  const src = readFileSync(join(HERE, file), 'utf8');
  const m = new RegExp(`local ${name}\\s*=\\s*(0x[0-9A-Fa-f]+)`).exec(src);
  if (!m) throw new Error(`could not find \`local ${name}\` in ${file}`);
  return Number(m[1]);
}

const checks = [];
const ok = (cond, msg, detail = '') => checks.push({ cond, msg, detail });

// ---- 1. the state vector's field list, parsed out of the Lua ----------------
const romKeys = luaKeys('probe.lua', 'KEYS');
ok(JSON.stringify(romKeys) === JSON.stringify(PROBE_KEYS),
   `porttrace.mjs emits probe.lua's ${romKeys.length} fields, in its order`,
   `rom: ${romKeys.join(',')}\n       port: ${PROBE_KEYS.join(',')}`);

const objKeys = luaKeys('objloop.lua', 'KEYS');
const missing = WORK_KEYS.filter((k) => !objKeys.includes(k));
ok(missing.length === 0,
   `porttrace.mjs's work counters all exist in objloop.lua`, `missing: ${missing}`);

// ---- 2. the sample point ----------------------------------------------------
ok(luaConst('probe.lua', 'FRAME_END') === 0x80B5,
   "probe.lua's sample point is still $80B5");
ok(luaConst('objloop.lua', 'FRAME_END') === luaConst('probe.lua', 'FRAME_END'),
   'objloop.lua samples at the same instruction probe.lua does');
const src = readFileSync(join(HERE, 'porttrace.mjs'), 'utf8');
ok(/samplePoint: '\$80B5'/.test(src),
   "porttrace.mjs declares the same sample point");

// ---- 3. every watched address is accounted for ------------------------------
const defs = JSON.parse(readFileSync(join(HERE, 'scenarios.json'), 'utf8'));
const st = createState();
const orphan = defs.watch.filter((a) =>
  peek(st, parseInt(a, 16)) === null && !UNMODELLED[a]);
ok(orphan.length === 0,
   `all ${defs.watch.length} watched addresses are modelled or explained`,
   `unexplained: ${orphan.join(',')}`);

// ---- 4. the trace actually produces rows, and they carry the right keys -----
let doc = null, err = null;
try {
  doc = tracePort({
    name: 'shapecheck', script: '12:', frames: 10, align: 0,
    seed: new Uint8Array(2048), watch: defs.watch,
    res: headlessResources(0),
  });
} catch (e) { err = e; }
ok(err === null, 'the port trace runs on a zero RAM image', String(err));
if (doc) {
  const want = [...PROBE_KEYS, ...WORK_KEYS, ...defs.watch.map((a) => `w_${a}`)];
  ok(JSON.stringify(doc.fields) === JSON.stringify(want),
     `the emitted header lists all ${want.length} fields`);
  const row = doc.frames[0];
  const absent = want.filter((k) => !(k in row));
  ok(absent.length === 0, 'every declared field is present on every row',
     `absent: ${absent}`);
  // Assert on the OUTPUT, not on "nothing threw" (docs/knowledge/02 trap #2).
  ok(doc.frames.length === 9, `9 rows for a 10-frame align-0 trace`,
     `got ${doc.frames.length}`);
  ok(row.guard === 1, '`guard` is 1, i.e. the value $04 holds AT $80B5');
  const nulls = NOT_PRODUCED.filter((k) => row[k] !== null);
  ok(nulls.length === 0, 'the not-produced fields are null, not a plausible 0',
     `non-null: ${nulls}`);
}

let bad = 0;
for (const c of checks) {
  console.log(`  [${c.cond ? 'PASS' : 'FAIL'}] ${c.msg}`);
  if (!c.cond && c.detail) console.log(`         ${c.detail}`);
  if (!c.cond) bad++;
}
console.log(`  ${checks.length} shape checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
