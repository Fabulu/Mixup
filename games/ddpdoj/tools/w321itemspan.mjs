// W321: WHY THE WEB GATE'S RECORD COUNTS MOVED, measured rather than
// re-baselined.
//
// `webgate.mjs` reports thirteen FAILs whose numbers all drifted, e.g. the W61
// item at "132 records (expect 488)". A total alone cannot say which of two very
// different things happened:
//
//   BENIGN   the same object appears on the same frame and lives a shorter or
//            longer life, so one contiguous span changed length. There is
//            precedent recorded in the gate itself at EXP61: W84 moved
//            626 -> 506 because the item was "collected 124 frames earlier
//            because the drop lands in a different phase of the ship's
//            60-frame sweep".
//   REAL     the objects stopped being produced, or stopped having art, so the
//            population itself fell.
//
// This prints what the gate cannot: the SPANS (every run of consecutive frames
// carrying at least one record for the bucket, with length and peak), and the
// per-shard spread, so a count that merely moved shard is not mistaken for a
// count that vanished.
//
// `--tables <player.tables.json>` swaps the simulation's tables while leaving
// the assets alone. That is the controlled experiment for "did regenerating the
// ROM windows move the numbers": same port, same seed, same art, other tables.
//
// Runs off the assets on disk -- no HTTP server, because nothing here tests the
// fetch path. `loadBundle` takes a reader, so the reader is `fs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { BIT } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { loadBundle } from '../src/web/assets.js';
import { RAM_STRIDE } from '../src/render/index.js';
import { portSpriteList, romToPackedMap, PORT_LIST_WORDS } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const TABLES = arg('tables', null);

const reader = async (n) => new Uint8Array(fs.readFileSync(path.join(ASSETS, n)));
const bundle = await loadBundle(reader, {});
// Every shard is on disk, so every shard is ready -- this is not the page's
// deferred-load story and does not pretend to be.
for (let i = 0; i < bundle.spr.state.length; i++) bundle.spr.state[i] = 'ready';

const tables = TABLES
  ? JSON.parse(fs.readFileSync(path.resolve(TABLES), 'utf8'))
  : bundle.tables;

const map = romToPackedMap(bundle.manifest, (b) => bundle.spr.shardOfBase(b));
const buf = new Uint16Array(PORT_LIST_WORDS);

const FIRE = portWordFromBits([BIT.b1]);
const LEFT = portWordFromBits([BIT.left]);
const RIGHT = portWordFromBits([BIT.right]);
const UP = portWordFromBits([BIT.up]);
const BOMB = portWordFromBits([BIT.b2]);

// The gate's own three input scripts, so the totals are comparable by
// construction. Each returns the word for frame i.
const SCRIPTS = {
  // W52/W53/W54: fire tapped every 4 frames, nothing else.
  w52: { frames: 1200, buckets: [6, 7, 8, 9], expect: { 6: 22466, 7: 6854, 8: 9720, 9: 6031 },
    word: (i) => (i % 4 === 0 ? 0xffff & FIRE : 0xffff) },
  // W61: fire tapped, ship sweeping left and right every 60 frames.
  w61: { frames: 2400, buckets: [12], expect: { 12: 488 },
    word: (i) => {
      let w = 0xffff & ((i % 120 < 60) ? LEFT : RIGHT);
      if (i % 4 === 0) w &= FIRE;
      return w;
    } },
  // W66 hold: flying up with fire held, bombs at 200/700/1200.
  w66: { frames: 1400, buckets: [13], expect: { 13: 5906 },
    word: (i) => {
      let w = 0xffff & UP & FIRE;
      if (i === 200 || i === 700 || i === 1200) w &= BOMB;
      return w;
    } },
};

const run = (name) => {
  const s = SCRIPTS[name];
  const g = new Game(bundle.seed, tables, {
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  const st = new Map();      // bucket -> {seen:Set, perFrame:[]}
  for (const b of s.buckets) st.set(b, { seen: new Set(), perFrame: [] });
  const spread = new Map();  // every shard -> {rec, seen:Set}
  let unmapped = 0;
  for (let i = 0; i < s.frames; i++) {
    portSpriteList(g.ram, map, { out: buf, shardReady: () => true, demand: () => {} });
    const frameN = new Map();
    for (const b of s.buckets) frameN.set(b, 0);
    for (let k = 0; k < 256; k++) {
      const b = k * RAM_STRIDE;
      const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
      if ((w4 & 0x7fff) === 0) break;
      const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
        | g.ram.u16(0x800000 + (b + 3) * 2);
      const m = map.get(offs);
      if (!m) { unmapped++; continue; }
      const sh = m[2];
      if (!spread.has(sh)) spread.set(sh, { rec: 0, seen: new Set() });
      const sp = spread.get(sh); sp.rec++; sp.seen.add(offs);
      if (!st.has(sh)) continue;
      st.get(sh).seen.add(offs);
      frameN.set(sh, frameN.get(sh) + 1);
    }
    for (const b of s.buckets) st.get(b).perFrame.push(frameN.get(b));
    g.ram.setU8(0x810424, 0xff);
    g.step(s.word(i));
  }
  return { s, st, spread, unmapped };
};

// Collapse a per-frame count array to spans of consecutive non-empty frames.
const spansOf = (perFrame) => {
  const out = [];
  let cur = null;
  for (let i = 0; i < perFrame.length; i++) {
    if (perFrame[i] > 0) {
      if (!cur) cur = { from: i, to: i, records: 0, peak: 0 };
      cur.to = i; cur.records += perFrame[i];
      cur.peak = Math.max(cur.peak, perFrame[i]);
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
};

console.log(`assets   ${ASSETS}`);
console.log(`tables   ${TABLES ? path.resolve(TABLES) : 'from the bundle'}`);
console.log('');

for (const name of (arg('only', null) ? [arg('only', null)] : Object.keys(SCRIPTS))) {
  const { s, st, spread, unmapped } = run(name);
  console.log(`=== ${name.toUpperCase()} -- ${s.frames} frames, `
    + `unmapped records (no art at all) ${unmapped}`);
  for (const b of s.buckets) {
    const t = st.get(b);
    const total = t.perFrame.reduce((x, y) => x + y, 0);
    const sp = spansOf(t.perFrame);
    const exp = s.expect[b];
    const mark = total === exp ? 'MATCHES' : `expect ${exp}`;
    console.log(`  shard ${b}: ${total} records (${mark}), `
      + `${t.seen.size} distinct, ${sp.length} span(s), `
      + `${bundle.spr.meta[b].streams} streams packed`);
    // Only the short span lists are worth printing in full; a bucket that is on
    // screen almost every frame produces one span and says nothing.
    if (sp.length <= 8) {
      for (const x of sp) {
        console.log(`      f${x.from}..f${x.to}  ${x.to - x.from + 1} frames, `
          + `${x.records} records, peak ${x.peak}`);
      }
    }
  }
  const others = [...spread.keys()].sort((a, b) => a - b)
    .filter((sh) => !s.buckets.includes(sh));
  console.log(`  other shards touched: ${others.map((sh) => `${sh}:${spread.get(sh).rec}`).join(' ')}`);
  console.log('');
}
