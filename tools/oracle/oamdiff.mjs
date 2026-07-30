// Shadow OAM ORDER, port vs cartridge, entry by entry.
//
// The repo had two dumpers and no differ. tools/oracle/oamorder.py prints the
// cartridge's $C000 block and the $FF9D cursor at each sub_00_0BC6 call site;
// tools/oracle/oamport.mjs prints state.video.sprites. Both are for reading by
// eye, and every comparison anybody actually made lived in a session scratch
// directory and died with the session. This is that comparison, in the repo.
//
// WHY ORDER IS NOT COSMETIC. OAM index is DMG sprite priority (lower index
// wins on overlap) and it decides the ten-per-scanline cut, so two queues with
// identical CONTENTS in different ORDER are two different pictures the moment
// anything overlaps or a line goes over ten sprites.
//
// WHAT IT FAILS ON, and only this: the entries the two queues AGREE on, taken
// in the order each side put them, must read the same on both sides. Entries
// only one side has are dropped first, so a frame whose contents differ is not
// inherited as a failure here -- that is somebody else's bug (level 12 has 41
// such frames from f81, where the player metasprite sits 1 px right of the
// cartridge's at identical world x).
//
// WHAT THE ORDER TEST ON ITS OWN CANNOT SEE, and why there are four more
// checks beside it. common() drops the entries only one side queued, so a port
// that queues NOTHING agrees with the cartridge on every frame and lands in
// the `content` bucket, which used to be counted and never gated -- stubbing
// drawMetasprite to return immediately gave 0/0/800 and `PASS`. And the +8/+16
// mask in runPort(), which is the only way to compare screen coordinates
// against 8-bit OAM bytes at all, is precisely the operation the renderer does
// NOT do: it turns an unwrapped x of 251 into the cartridge's 3 and calls it
// exact. So this also fails on an empty queue, on zero exact frames, on any
// coordinate outside the range sub_00_0BC6 can express (checked on the RAW,
// unmasked values), and on `content` rising above its recorded baseline.
//
// Dropping the odd entries rather than skipping the whole frame is deliberate:
// "same multiset, different sequence" alone would go quiet on any frame that
// happened to have a content difference too, and l1-water and l9-walk have 53
// and 34 of those. A blind spot that opens exactly where two faults overlap is
// the shape of bug this project keeps finding.
//
// THE DEFECT THIS WAS WRITTEN FOR: the port held enemy sprites in
// state.enemyDraws and flushed them at the END of the frame, while 1:$5CA8
// appends from inside the enemy driver at $05CF. On ODD frames -- the $05E5
// arm, where the energy bar is queued last -- every enemy therefore sat behind
// the bar. Level 6, 400 frames: 201/400 exact, all 199 misses on $FFA7 = 1,
// multiset identical on all 400.
//
//   node tools/oracle/oamdiff.mjs
//   node tools/oracle/oamdiff.mjs --only l6-track --record
//
// --record re-runs PyBoy; without it a cached cartridge dump under
// rip/oracle/oam/ is reused. Each scenario has its own file, so two of these
// running at once do not read each other's data.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIR = path.join(ROOT, 'rip', 'oracle', 'oam');
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');

// Levels chosen for what they put on the queue, not for coverage's sake:
//   6  the vehicle stage -- the enemy driver alone, no doors, and the level
//      the order fault was measured on
//   1  water: the rising-water mechanism itself, on the level the port's water
//      model was built against. NOTE it does NOT reach a splash -- see l2
//   2  water that actually SPLASHES. $05EF's sub_01_7AD3 pushes onto the SAME
//      queue, after the HUD, which is the whole reason the second flush in
//      main.js has to stay. MEASURED (a count of state.enemyDraws.length at
//      that second flush): level 1 gives 0 non-empty frames at 200, 600 AND
//      1200 frames, and level 6/9 give 0 too, but level 2 gives 46 in 400. The
//      justification used to cite l1-water, which could not see it: deleting
//      the second flush left l1/l6/l9 byte-identical.
//   9  a door level, and one of the three that also run the $05A6 sky sprite
// maxContent RATCHETS the frames that differ in CONTENT (not order). Those are
// the pre-existing families this tool does not try to fix -- the l1 water
// dither and the l9 parallax feeder race -- but left ungated they are also
// where a regression would hide, because a frame the port gets newly wrong
// lands in that bucket and is merely counted. Measured today; lower it if you
// fix one, and never raise it without saying what moved.
const SCEN = [
  { name: 'l6-track', level: 6, frames: 400, script: '20:,380:R', maxContent: 0 },
  { name: 'l1-water', level: 1, frames: 200, script: '20:,180:R', maxContent: 53 },
  // 28 content frames, INSPECTED: every one is the player metasprite (tiles
  // $00/$04/$08, attr $30) one pixel low -- cart "86,80,0,48" vs port
  // "86,81,0,48" -- which is the same pre-existing sub-pixel family as the l12
  // residue described above, not an ordering fault. ORDER is 0/400 here.
  { name: 'l2-splash', level: 2, frames: 400, script: '20:,380:R', maxContent: 28 },
  { name: 'l9-walk',  level: 9, frames: 200, script: '20:,180:R', maxContent: 34 },
];

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const record = has('record');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
function expand(script) {
  const t = [];
  for (const seg of script.split(',')) {
    const [n, keys = ''] = seg.split(':');
    let m = 0;
    for (const k of keys.trim()) m |= BTN[k.toUpperCase()] || 0;
    for (let i = 0; i < parseInt(n, 10); i++) t.push(m);
  }
  return t;
}

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();

/** The port's queue, in OAM coordinates and in call order. */
async function runPort(sc) {
  const state = createState(makeTunables());
  state.loadout = resolveLoadout([]);
  await initLevel(state, sc.level);
  const timeline = expand(sc.script);
  const out = [];
  for (let f = 1; f <= sc.frames; f++) {
    const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held;
    state.input.prev = held;
    tick(state, manifest, playerTiles);
    // +8/+16 back on: state.video.sprites is in screen coordinates and shadow
    // OAM is not (sub_00_0BC6's own note in src/render/metasprite.js).
    //
    // The mask is unavoidable -- it is the only way to compare screen
    // coordinates against 8-bit shadow-OAM bytes -- but it is also exactly the
    // operation the RENDERER does not do, so it normalises a coordinate-wrap
    // bug into agreement. `raw` keeps the unmasked values so checkRange() below
    // can still see one. See the RANGE note in the header.
    out.push({
      oam: state.video.sprites.map((e) =>
        [(e.x + 8) & 0xFF, (e.y + 16) & 0xFF, e.tile & 0xFF, e.attr & 0xFF].join()),
      raw: state.video.sprites.map((e) => [e.x, e.y]),
    });
  }
  return out;
}

/** The cartridge's $C000 block, skipping the entries $0C1F cleared to zero. */
function cartRows(row) {
  const o = row.oam, out = [];
  for (let i = 0; i < 40; i++) {
    const y = o[i * 4], x = o[i * 4 + 1], t = o[i * 4 + 2], a = o[i * 4 + 3];
    if (y === 0 && x === 0 && t === 0 && a === 0) continue;
    out.push([x, y, t, a].join());
  }
  return out;
}

let failed = false;
console.log('scenario     frames   exact   order-only   content   worst parity');
for (const sc of SCEN) {
  if (only && sc.name !== only) continue;
  const file = path.join(DIR, `${sc.name}.json`);
  if (record || !fs.existsSync(file)) {
    fs.mkdirSync(DIR, { recursive: true });
    execFileSync('python', ['tools/oracle/oamorder.py',
      '--level', String(sc.level), '--frames', String(sc.frames),
      '--script', sc.script, '--out', path.relative(ROOT, DIR),
      '--tag', sc.name], { cwd: ROOT, stdio: 'pipe' });
    fs.renameSync(path.join(DIR, `oamorder_${sc.name}.json`), file);
  }
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ours = await runPort(sc);

  // Keep only the entries BOTH sides queued, multiplicity included, each side
  // in its own order.
  const common = (a, b) => {
    const want = new Map();
    for (const e of b) want.set(e, (want.get(e) ?? 0) + 1);
    const out = [];
    for (const e of a) {
      const k = want.get(e) ?? 0;
      if (k > 0) { want.set(e, k - 1); out.push(e); }
    }
    return out;
  };

  let exact = 0, orderOnly = 0, content = 0, empty = 0, range = 0;
  const byParity = { 0: 0, 1: 0 };
  const firstBad = [];
  const firstEmpty = [];
  const firstRange = [];
  const n = Math.min(ref.frames.length, ours.length);
  for (let i = 0; i < n; i++) {
    const cs = cartRows(ref.frames[i]);
    const ps = ours[i].oam;

    // RANGE, on the UNMASKED values. sub_00_0BC6 stores both coordinates with
    // an 8-bit `ADD` into an 8-bit $C0xx byte ($0BE9-$0BEB for Y via B,
    // $0BED-$0BEF for X via C), so the only values it can express are
    // x in -8..247 and y in -16..239 once the two hardware origins are taken
    // back out. Anything outside that is a coordinate the cartridge could not
    // have produced, and the mask above would otherwise fold it into
    // agreement -- which is how a missing wrap hid on l9/l10/l12.
    for (const [x, y] of ours[i].raw) {
      if (x < -8 || x > 247 || y < -16 || y > 239) {
        range++;
        if (firstRange.length < 4) firstRange.push(`f${i + 1} x=${x} y=${y}`);
      }
    }
    // A port that queues nothing agrees with everything under common(), so the
    // order test alone would report `ok` while the screen stayed black.
    if (ps.length === 0 && cs.length > 0) {
      empty++;
      if (firstEmpty.length < 4) firstEmpty.push(i + 1);
    }

    if (cs.join('|') === ps.join('|')) { exact++; continue; }
    if (common(cs, ps).join('|') !== common(ps, cs).join('|')) {
      orderOnly++;
      byParity[ref.frames[i].parity & 1]++;
      if (firstBad.length < 8) firstBad.push(i + 1);
    } else {
      content++;
    }
  }
  const worst = orderOnly === 0 ? '-'
    : `$FFA7=${byParity[1] >= byParity[0] ? 1 : 0} (${Math.max(byParity[0], byParity[1])})`;

  // Every one of these is a way the port can be wrong that the ORDER test on
  // its own reports as `ok`.
  const why = [];
  if (n === 0) why.push('compared 0 frames');
  if (orderOnly) why.push(`order at f${firstBad.join(',')}`);
  if (exact === 0) why.push('0 frames matched exactly');
  if (empty) why.push(`port queue EMPTY on ${empty} frame(s) f${firstEmpty.join(',')}`);
  if (range) why.push(`${range} entry/entries outside x -8..247 / y -16..239 (${firstRange.join('; ')})`);
  if (content > sc.maxContent) why.push(`content ${content} > baseline ${sc.maxContent}`);

  console.log(`${sc.name.padEnd(12)} ${String(n).padStart(5)} `
    + `${String(exact).padStart(7)} ${String(orderOnly).padStart(12)} `
    + `${String(content).padStart(9)}/${sc.maxContent}   ${worst}`
    + (why.length ? `  FAIL - ${why.join('; ')}` : '  ok'));
  if (why.length) failed = true;
}

console.log(failed
  ? '\nFAIL - see the reason on each failing row. An ORDER difference means the\n'
    + '       two queues hold the same sprites at different OAM indices, and OAM\n'
    + '       index is DMG priority and the ten-per-line cut, so that is a\n'
    + '       different picture -- check where main.js flushes state.enemyDraws.\n'
    + '       The other reasons are the ways a port can be wrong that an order\n'
    + '       test alone calls `ok`: an empty queue agrees with everything, and\n'
    + '       the +8/+16 mask folds an unwrapped coordinate into agreement.'
  : '\nPASS - order, non-empty, in-range, and content no worse than baseline');
process.exit(failed ? 1 : 0);
