// stage4cmp.mjs -- the PORT's st_$C5AD against the CARTRIDGE's, spawn for spawn.
//
// WAVE 31. Consumes out/stage4poke/spawns-decoded.json, produced by
// stage4poke.py from a real Mesen run with $19 forced to 3 across the $82
// countdown. Read that file's header first: this is an INTERVENTION run, valid
// evidence for "is the transcription right" and not for anything about stage
// 4's pacing or geometry (docs/knowledge/09).
//
// For each spawn the board produced it rebuilds the exact inputs st_$C5AD
// consumed -- the PRE-INC $69, the frame counter $02, and the slot $C41E's scan
// landed on -- runs the port's own spawn engine, and compares all nine object
// fields plus the post-INC $69. Nothing is re-derived from the port's formula:
// the expected values are the cartridge's bytes.
//
//   python games/gradius/tools/oracle/stage4poke.py
//   node   games/gradius/tools/oracle/stage4cmp.mjs
//
// Exits non-zero on any mismatch. Not wired into test-all.mjs: it needs an
// emulator run, like every other tool under tools/oracle/ that does.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..');
const { createState, ENEMY_BASE, u8 } = await import(
  new URL('../../src/state.js', import.meta.url));
const { spawnEngine } = await import(new URL('../../src/enemies.js', import.meta.url));
const { headlessResources } = await import(new URL('../../tests/helpers.js', import.meta.url));

const SRC = join(HERE, 'out', 'stage4poke', 'spawns-decoded.json');
let rows;
try {
  rows = JSON.parse(readFileSync(SRC, 'utf8'));
} catch {
  console.error(`no ${SRC}. Run stage4poke.py first (it needs Mesen + the ROM).`);
  process.exit(2);
}
if (!rows.length) { console.error('the dump is empty'); process.exit(2); }

const res = headlessResources(0);
const rom = res.enemyTables;

// $048C -> s0480 and $04AC -> s04A0 are the port's own array names for those
// two ROM addresses (its bases are $0480/$04A0 with the +$0C folded in).
const GET = {
  x: (o, i) => o.x[i], y: (o, i) => o.y[i], xvel: (o, i) => o.xvel[i],
  yvel: (o, i) => o.yvel[i], xvelf: (o, i) => o.xvelf[i],
  yvelf: (o, i) => o.yvelf[i], accel: (o, i) => o.s0480[i],
  anim: (o, i) => o.anim[i], hit: (o, i) => o.s04A0[i],
};
const FIELDS = Object.keys(GET);

let compared = 0, bad = 0;
const perField = Object.fromEntries(FIELDS.map((f) => [f, 0]));
const first = [];
const note = (m) => { bad++; if (first.length < 10) first.push(m); };
const h = (v) => '$' + v.toString(16).toUpperCase().padStart(2, '0');

for (const r of rows) {
  const s = createState();
  s.substate = 0x82;              // $A2F7 -> $A2FB JMP $C413, the late spawner
  s.spawn.z60 = 2;                // the engine's running state
  s.zp19 = r.z19;                 // 0 on the control row, 3 on the poked ones
  s.frame = u8(r.z02);            // $02 as the board had it on the spawn frame
  s.spawn.z69 = r.z69_m1;         // the PRE-INC cursor sub_$C44F reads
  // $C41E scans slots 9..0 for an empty one. Occupy the ones above the slot the
  // board used so the port's scan lands on the same index.
  for (let j = 9; j > r.slot; j--) s.obj.type[j + ENEMY_BASE] = 0x27;

  spawnEngine(s, res);
  const i = r.slot + ENEMY_BASE;
  compared++;

  // The board's row is sampled after $ADAB dispatched, and the handler's init
  // arm ($B3A7 -> $B0B4) has already added $80. The port's row is pre-dispatch,
  // so compare the low seven bits -- which is where the arm's own constant is.
  if ((s.obj.type[i] & 0x7F) !== (r.type & 0x7F)) {
    note(`f${r.frame} type ${h(s.obj.type[i] & 0x7F)} vs ${h(r.type & 0x7F)}`);
  }
  for (const f of FIELDS) {
    const p = GET[f](s.obj, i);
    if (p !== r[f]) { perField[f]++; note(`f${r.frame} ${f}: port ${h(p)} vs cart ${h(r[f])}`); }
  }
  if (s.spawn.z69 !== r.z69) note(`f${r.frame} $69: port ${s.spawn.z69} vs cart ${r.z69}`);
}

// Coverage in TABLE ENTRIES and BRANCHES, per docs/knowledge/10 -- never frames.
const desc = new Set(), ramp = new Set(), jit = new Set(), craters = new Set();
for (const r of rows) {
  if (r.z19 !== 3) continue;
  const post = u8((r.z69_m1 === 0xFF ? 0x7F : r.z69_m1) + 1);
  const pb = rom.read(rom.word(0xC44B) + ((r.z69_m1 & 0x3F) >>> 1));
  const nib = (post & 1) ? (pb & 0x0F) : ((pb >>> 4) & 0x0F);
  desc.add(nib);
  ramp.add(post < 0x1E ? '$69<$1E' : '$69>=$1E');
  jit.add(r.z02 & 0x0F);
  craters.add(r.x);
}

console.log(`spawns compared : ${compared}`);
console.log(`mismatches      : ${bad}`);
for (const f of FIELDS) if (perField[f]) console.log(`  ${f}: ${perField[f]}`);
if (first.length) console.log('first divergences:\n  ' + first.join('\n  '));
console.log('');
console.log(`$C603 descriptor rows : ${desc.size} of 16 exercised`);
console.log(`$C5D4 ramp arms       : ${[...ramp].sort().join(' + ')} (of 2)`);
console.log(`$C601 craters         : ${[...craters].map(h).join(' ')} (of 2)`);
console.log(`$C5DE jitter values   : ${[...jit].sort((a, b) => a - b).join(',')} `
          + `-- $C415's AND #$03 bounds this to 0/4/8/12, so 4 of 16 is ALL of them`);

process.exit(bad ? 1 : 0);
