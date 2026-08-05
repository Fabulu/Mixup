#!/usr/bin/env node
// W67 (T1) -- **THE PRODUCER CENSUS.**  The check this project did not have.
//
//     node games/ddpdoj/tools/w67trailgate.mjs [--assets DIR] [--break NAME]
//
// ============================================================================
// WHY THIS FILE EXISTS
// ============================================================================
// `$24A53E jsr $253604` -- the ship's afterimage trail -- was a COUNTED NOTE
// from wave 12 to wave 66.  The ship was ported in W12, gated at 0 divergent by
// `pgm.py shipgate`, and called finished for fifty-four waves with a producer
// missing, and **NO CHECK IN THIS REPO COULD HAVE SEEN IT**:
//
//   * `shipgate` compares the port's staged bytes for buckets 5, 15 and 19
//     against the board's.  `$253604` writes bucket **12**.  A gate that
//     compares a named list of buckets is structurally blind to the buckets not
//     on the list, exactly as the mover gate is blind to sprite fields.
//   * every unit test in `tests/ship.test.js` asserts on records the ship's
//     block DID append.  Nothing asserts on the ones it did not.
//   * and the picture told nobody, because an afterimage that is never drawn
//     and an afterimage drawn behind the ship in colour 31 are not something a
//     player has a baseline for.  W66 §4 is the same shape one wave earlier:
//     forty-one beam segments that never emitted a record, invisible because a
//     record that was never written and a record with no picture look identical.
//
// So the check cannot be "compare bucket 12 too".  It has to be the general
// one, and this is it:
//
//   **(A) ASK THE CARTRIDGE which buckets a ported routine can feed, and
//    (B) require the PORT to put a record in every one of them.**
//
// (A) is a transitive walk of `jsr`/`jmp <abs>.l` out of the ship's own draw
// block, resolving every enqueue stub it lands on to its (buffer, counter) pair
// and thence to a bucket.  It reaches `$2536AA jsr $23FDB2` through
// `$24A53E jsr $253604` -- two levels -- which is precisely the edge every
// other instrument in this repo is missing.  **Run against W12..W66's tree it
// names bucket 12 and (B) measures zero, which is the definition of a check
// that would have caught this class.**
//
// WHAT IT CANNOT SEE, said the way `tools/oracle/xref.py` says it: only
// ABSOLUTE-LONG `jsr`/`jmp`.  A `bsr`, a PC-relative dispatch or a pointer
// table is invisible to it, so the bucket set is a **LOWER BOUND** and a
// missing bucket is never proof that a routine has no producer.  That is fine
// for a gate whose failure mode is "the port emits nothing into a bucket the
// ROM says it can" -- a lower bound on the demand side only ever under-claims.
//
// AND IT IS PORT-VS-LISTING, NOT A BOARD COMPARISON.  No capture in this repo
// holds the fire button, so `($3f,A6)` is 0 on all 2,301 frames of
// `fly-around` and the board has never been seen drawing this trail.  Adding
// bucket 12 to `shipgate`'s `CLAIMED_BUCKETS` would compare two empty buffers
// -- a fixture sitting where two readings agree, which `docs/knowledge/03`
// calls not a check and which this project has now shipped six times.
//
// FOUR BREAKS, each of which MUST turn one NAMED row red:
//   --break no-trail            $253604 emits nothing (the W12..W66 tree)
//   --break trail-every-phase   drop `$25368A tst.w $80390C`
//   --break trail-no-coarse-skip drop `$25369C cmp.l D6,D5`
//   --break census-no-recursion  do not follow a non-stub call at all, so the
//                               census loses bucket 12 -- the control that
//                               proves (A) really does follow `$24A53E jsr
//                               $253604` rather than reading the direct stubs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { BIT, RAM, P } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { loadBundle } from '../src/web/assets.js';
import { BUCKETS, RECORD_BYTES, NAMED_BUCKETS } from '../src/spritequeue.js';
import { SHIP_MUTATE, TRAIL } from '../src/shipsprite.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const BREAKS = ['no-trail', 'trail-every-phase', 'trail-no-coarse-skip',
  'census-no-recursion'];
const brk = arg('break', null);
if (brk && !BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: ${BREAKS.join(', ')}`);
  process.exit(2);
}

const IMAGE = path.join(HERE, 'oracle', 'out', 'maincpu.bin');
if (!fs.existsSync(IMAGE)) {
  console.error(`${IMAGE} missing -- this gate reads the DECRYPTED cartridge, `
    + 'not a transcription. Produce it with '
    + '`python games/ddpdoj/tools/oracle/derive.py`');
  process.exit(2);
}
if (!fs.existsSync(path.join(ASSETS, 'manifest.json'))) {
  console.error(`${ASSETS}/manifest.json is missing -- run: `
    + 'node games/ddpdoj/tools/export-web.mjs');
  process.exit(2);
}

// ===========================================================================
// (A) THE ROM CENSUS
// ===========================================================================
const IMG = fs.readFileSync(IMAGE);
const u16 = (a) => IMG.readUInt16BE(a);
const u32 = (a) => IMG.readUInt32BE(a);

/** THE WINDOWS THE PORT CLAIMS.  `src/shipsprite.js` is the transcription of
 *  exactly these two spans, and `55-diag` §4.3 enumerated the first one's
 *  enqueue sites by hand.  They are stated as ROM addresses so that widening
 *  the port without widening this is visible in a diff. */
const CLAIMED_WINDOWS = [
  [0x24a482, 0x24a800, '$24A482..$24A7FF -- the ship\'s sprite block '
    + '(drawShip/drawShipAlt/drawGlow)'],
  [0x249ea0, 0x249ee8, '$249EA0..$249EE7 -- the ship\'s ground-plane shadow '
    + '(drawShipShadow)'],
];
const ROM_LO = 0x230000, ROM_HI = 0x2b0000;
const JSR_ABS = 0x4eb9, JMP_ABS = 0x4ef9;

/** `resolveEmitStub`'s four prologues, non-throwing: the bucket, or null.
 *  A bucket is only ever returned when the (buffer, counter) LONGWORDS READ
 *  OUT OF THE CARTRIDGE match one of the thirty pairs -- never from a map. */
function stubBucket(at0) {
  let at = at0;
  if (at + 24 >= IMG.length) return null;
  if (u16(at) === 0x48e7) at += 4;                       // movem.l ...,-(A7)
  else if (u16(at) === 0x2f08 && u16(at + 2) === 0x2f00) at += 4;
  if (u16(at) !== 0x41f9 || u16(at + 6) !== 0xd0f9) return null;
  const buffer = u32(at + 2), counter = u32(at + 8);
  const b = BUCKETS.find((x) => x.buffer === buffer && x.counter === counter);
  return b ? b.i : null;
}

const census = new Map();          // bucket -> [{site, stub, via}]
const visited = new Set();
function walk(lo, hi, depth, via) {
  for (let pc = lo; pc < hi; pc += 2) {
    const w = u16(pc);
    if (w !== JSR_ABS && w !== JMP_ABS) continue;
    const t = u32(pc + 2);
    if (t < ROM_LO || t >= ROM_HI) continue;
    const b = stubBucket(t);
    if (b !== null) {
      if (!census.has(b)) census.set(b, []);
      const row = { site: pc, stub: t, via: via.slice() };
      if (!census.get(b).some((r) => r.site === pc && r.via.join() === via.join())) {
        census.get(b).push(row);
      }
      continue;
    }
    if (depth <= 0) continue;
    const key = `${t}:${depth}`;
    if (visited.has(key)) continue;
    visited.add(key);
    // A bounded window on the callee. $253604..$2536B4 is $B0 bytes; $200 is
    // four times that and short enough that the walk cannot wander into the
    // next subsystem.
    walk(t, Math.min(t + 0x200, ROM_HI), depth - 1, [...via, pc]);
  }
}
const DEPTH = brk === 'census-no-recursion' ? 0 : 2;
for (const [lo, hi] of CLAIMED_WINDOWS) walk(lo, hi, DEPTH, []);

const hx = (n) => `$${n.toString(16).toUpperCase().padStart(6, '0')}`;
const romBuckets = [...census.keys()].sort((a, b) => a - b);

let code = 0;
const rows = [];
function row(ok, text) { rows.push([ok, text]); if (!ok) code = 1; }

// THE CENSUS ITSELF IS AN ASSERTION.  A set that quietly shrank would make
// every (B) row below pass vacuously -- W66 §6.1's shape, and the reason
// `--break census-no-recursion` exists.
const EXPECT_BUCKETS = [5, 12, 19];
const EXPECT_SITES = 9;
const sites = romBuckets.reduce((n, b) => n + census.get(b).length, 0);
row(romBuckets.join(',') === EXPECT_BUCKETS.join(',') && sites === EXPECT_SITES,
  `(A) THE ROM CENSUS -- walking jsr/jmp <abs>.l ${DEPTH} levels out of the two `
  + `windows src/shipsprite.js claims, the cartridge names buckets `
  + `[${romBuckets.join(', ')}] (expect [${EXPECT_BUCKETS.join(', ')}]) over `
  + `${sites} enqueue sites (expect ${EXPECT_SITES})`);
for (const b of romBuckets) {
  for (const r of census.get(b)) {
    console.log(`      bucket ${String(b).padStart(2)}  ${hx(r.site)} jsr `
      + `${hx(r.stub)}${r.via.length ? `   via ${r.via.map(hx).join(' -> ')}` : ''}`);
  }
}
// AND THE EDGE THAT MATTERS, named rather than left implicit.
const trailRow = (census.get(NAMED_BUCKETS.trail) ?? [])
  .find((r) => r.site === 0x2536aa && r.via.length === 1 && r.via[0] === 0x24a53e);
row(!!trailRow,
  `(A2) and it reaches ${hx(0x2536aa)} jsr ${hx(0x23fdb2)} THROUGH `
  + `${hx(0x24a53e)} jsr ${hx(0x253604)} -- the two-level edge every other `
  + 'instrument in this repo is missing');

// ===========================================================================
// (B) THE PORT MUST FILL EVERY BUCKET THE CARTRIDGE NAMED
// ===========================================================================
const bundle = await loadBundle(async (n) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, n))));

const STEPS = 900;
const FIRE = portWordFromBits([BIT.b1]);
const LEFT = portWordFromBits([BIT.left]);
const RIGHT = portWordFromBits([BIT.right]);

// ONE SCENARIO REACHES ALL THREE, and it has to be this one: the trail's gate
// is `($3f,A6)`, which only `$24C282` sets and only seventeen HELD frames
// reach; and `$25369C cmp.l D6,D5` skips every sample the ship has not moved a
// coarse ($FF80 = 2 px) step away from, so a run that flies into a clamp and
// stops emits nothing at all.  Hence: fire HELD and a left/right sweep.
function run(mutate, { move = true } = {}) {
  SHIP_MUTATE.value = mutate;
  try {
    const g = new Game(bundle.seed, bundle.tables, {
      logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
      bgSeed: bundle.cap.part(0, 'bg'),
    });
    const r = {
      perBucket: new Map(BUCKETS.map((b) => [b.i, 0])),
      trailFirst: -1, armedAt: -1, maxPerFrame: 0, framesWith: 0, records: 0,
      phaseOnWith: 0, phaseOffWith: 0, moved: 0,
      images: new Set(), sizes: new Set(), flips: new Set(), stop: null,
    };
    let prevPos = g.ram.u32(RAM.player1 + P.posY);
    for (let i = 0; i < STEPS; i++) {
      g.ram.setU8(0x810424, 0xff);
      let word = 0xffff & FIRE;
      if (move) word &= (i % 120 < 60) ? LEFT : RIGHT;
      try { g.step(word); } catch (e) {
        r.stop = `${e.message.split('\n')[0].slice(0, 160)}`;
        break;
      }
      // EVERYTHING IS SAMPLED AFTER THE STEP.  `$80390C` is toggled inside the
      // frame (`$23BE92 bchg #0,$80390D`, main-loop call #0) and `($3f,A6)` is
      // set inside it too (`$24C282`, type-5 call #9, which runs BEFORE the
      // ship's draw at call #16) -- so a pre-step read of either is the
      // previous frame's answer and would invert (C4) and mis-date (C1).
      if (r.armedAt < 0 && g.ram.u8(RAM.player1 + P.dead) !== 0) r.armedAt = i;
      const phase = g.ram.u16(0x80390c) !== 0;
      const pos = g.ram.u32(RAM.player1 + P.posY);
      if (((pos ^ prevPos) & TRAIL.coarse) !== 0) r.moved++;
      prevPos = pos;
      // The staged bucket-12 records, read at the board's own $23D382 sample
      // point -- so what is counted is what `$23FDB2` WROTE, not what survived
      // the depth sort.
      for (const s of g.staged) {
        r.perBucket.set(s.i, r.perBucket.get(s.i) + s.count / RECORD_BYTES);
      }
      const s12 = g.staged.find((s) => s.i === NAMED_BUCKETS.trail);
      const n = s12 ? s12.count / RECORD_BYTES : 0;
      r.records += n;
      if (n > 0) {
        r.framesWith++;
        if (r.trailFirst < 0) r.trailFirst = i;
        if (n > r.maxPerFrame) r.maxPerFrame = n;
        if (phase) r.phaseOnWith++; else r.phaseOffWith++;
        for (let k = 0; k < n; k++) {
          const at = k * RECORD_BYTES;
          r.images.add((s12.bytes[at + 4] << 24 | s12.bytes[at + 5] << 16
            | s12.bytes[at + 6] << 8 | s12.bytes[at + 7]) >>> 0);
          r.sizes.add(s12.bytes[at + 8] << 8 | s12.bytes[at + 9]);
          r.flips.add(s12.bytes[at + 10] << 8 | s12.bytes[at + 11]);
        }
      }
    }
    return r;
  } finally { SHIP_MUTATE.value = null; }
}

const mut = BREAKS.includes(brk) && brk !== 'census-no-recursion' ? brk : null;
const a = run(mut);
// THE CONTROL FOR (C5): the identical input with the stick NEVER touched.  The
// beam still arms, so the gate is open on the same frame -- and `$25369C`
// compares every ring sample against the ship's own coarse position, which has
// not changed, so the trail must emit NOTHING.  A run that emits records with a
// motionless ship has lost that instruction.
const still = run(mut, { move: false });
row(a.stop === null, `(B0) the ${STEPS}-step run completed`
  + (a.stop ? ` -- IT DID NOT: ${a.stop}` : ''));

for (const b of romBuckets) {
  const n = a.perBucket.get(b) ?? 0;
  row(n > 0, `(B) BUCKET ${String(b).padStart(2)} -- the cartridge names `
    + `${census.get(b).length} enqueue site(s) reachable from the ship's draw `
    + `block, and over ${STEPS} steps with fire HELD and a left/right sweep the `
    + `port staged ${n} record(s) into it`
    + (n > 0 ? '' : ' -- **NOTHING AT ALL**, so a producer the ROM names is '
      + 'not in the port or is not emitting'));
}

// ---- (C) the trail's own shape, so "emits something" is not the whole claim
row(a.armedAt === 16, `(C1) $24C282 arms the trail's gate ($3f,A6) during step `
  + `${a.armedAt} (expect 16 -- $24C164's sixteen frames of arm-up, then the `
  + 'latch), and the identical no-stick run arms on step '
  + `${still.armedAt} (expect the same)`);
row(a.trailFirst === 17 && still.armedAt === a.armedAt,
  `(C2) and the first bucket-12 record follows on step ${a.trailFirst} `
  + '(expect 17, i.e. NOT the arming frame): `$2536B6` seeds all sixteen ring '
  + 'slots with the ship\'s CURRENT position, so on the arming frame every '
  + 'sample compares equal under `$25369C` and the trail is empty by '
  + 'construction');
row(a.maxPerFrame === TRAIL.passes - 1,
  `(C3) at most ${a.maxPerFrame} record(s) in any one frame (expect `
  + `${TRAIL.passes - 1}) -- \`moveq #$5,D7\` + \`dbra\` is SIX passes and the `
  + 'sixth stores the ring head and rts\'es. 55-diag §4.3 read it as six records');
row(a.phaseOffWith === 0 && a.phaseOnWith === a.framesWith,
  `(C4) $25368A tst.w $80390C -- ${a.phaseOnWith} of ${a.framesWith} frames `
  + `with records are on the phase the aura and the glow draw on, and `
  + `${a.phaseOffWith} are on the other one (expect 0)`);
row(still.records === 0 && still.moved === 0 && a.records > 0 && a.moved > 0,
  `(C5) $25369C cmp.l D6,D5 -- A MOTIONLESS SHIP HAS NO TRAIL. The identical `
  + `run with the stick never touched crossed ${still.moved} coarse cells `
  + `(expect 0) and emitted ${still.records} bucket-12 record(s) (expect 0), `
  + `against ${a.moved} and ${a.records} for the sweeping run. Both arm the `
  + 'beam on the same step, so the only difference is the ship moving');
row(a.sizes.size === 1 && a.sizes.has(TRAIL.size)
  && a.flips.size === 1 && a.flips.has(TRAIL.flip),
  `(C6) every record is size $${[...a.sizes].map((x) => x.toString(16)).join('/')}`
  + ` (expect $${TRAIL.size.toString(16)}, the ship's own 3x32) in flip/colour `
  + `$${[...a.flips].map((x) => x.toString(16)).join('/')} (expect `
  + `$${TRAIL.flip.toString(16)} -- COLOUR 31)`);
// NO NEW ART, as a measurement rather than as an argument.
const shipImages = new Set();
{
  const g = new Game(bundle.seed, bundle.tables, {
    logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  for (let i = 0; i < STEPS; i++) {
    shipImages.add(g.ram.u32(RAM.player1 + P.animA));
    g.ram.setU8(0x810424, 0xff);
    g.step(0xffff & ((i % 120 < 60) ? LEFT : RIGHT));
  }
}
const foreign = [...a.images].filter((x) => !shipImages.has(x));
row(foreign.length === 0 && a.images.size > 1,
  `(C7) NO NEW ART -- the ${a.images.size} distinct image longs the trail emits `
  + `are all values the ship's own ($a,A6) takes in the same window `
  + `(${foreign.length} foreign, expect 0). D2 is the IMAGE RING and the ring `
  + 'holds nothing but copies of $25533A[0]\'s seventeen tilt frames');

// ===========================================================================
console.log('');
for (const [ok, text] of rows) console.log(`${ok ? 'PASS' : 'FAIL'}: ${text}`);
const passed = rows.filter(([ok]) => ok).length;
if (brk) {
  // THE EXIT CODE UNDER `--break` IS THE SAME AS WITHOUT IT, deliberately:
  // `pgm.py check` reads a NON-ZERO exit as "it went red, as it must", exactly
  // as it does for `w64bombgate` and `w65beamgate`. A break that reddened
  // nothing exits 0 and the runner reports the stage as FAIL with the reason.
  const red = rows.filter(([ok]) => !ok).map(([, t]) => t.split(' --')[0]);
  console.log(`\n${red.length ? 'EXPECTED-RED' : 'NOTHING MOVED'} `
    + `[--break ${brk}]: `
    + (red.length ? `${red.length} named row(s) went red: ${red.join('; ')}`
      : 'every row still passes -- this break cannot fail and the rows it aims '
        + 'at are worth nothing'));
}
console.log(`\n${passed} of ${rows.length} ${code ? 'PASS -- FAILED' : 'PASS'}`);
process.exit(code);
