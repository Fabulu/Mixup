#!/usr/bin/env node
// WAVE 61 (I2) -- THE ITEM, MEASURED, WITH A CONTROL AND A POOL CENSUS.
//
//   node tools/w61itemgate.mjs [frames] [hold|tap|none] [--stress N] [--json]
//
// ======================== WHAT THIS TOOL CAN AND CANNOT SAY =================
//
//   * It is the PORT replayed against the shipped bundle seed.  **Nothing here
//     is compared against the board.**  No MAME was run.
//   * The fire input is an INTERVENTION (`docs/knowledge/09`): the shipped seed
//     is a no-button capture, so a firing run is valid for COVERAGE and invalid
//     for characterising play.  The `none` run is the CONTROL and it is the row
//     that says items appear only because something died.
//   * Unlike W60's, **this tool pokes NOTHING by default.**  Every item it
//     counts was allocated by `$27E812` from `handler85`'s own death arm.
//   * `--stress N` is a LABELLED INTERVENTION and every row it produces says
//     STRESSED.  It calls the REAL allocator N times a frame at a synthetic
//     site, so the pool sees pressure the stage cannot produce -- which is the
//     only way to reach the pool-FULL arm, the free, and a census high-water
//     mark above 1 of 25.  It says nothing about what the cartridge would do.
//
// **IT RUNS ON A PRE-W61 TREE TOO**, which is what `.scratch/w61tree.mjs`
// needs: the three `g.item*` hooks are read with `?.` because HEAD's `Game` has
// none of them, and everything else it reads is a RAM address that exists on
// both trees.  So the control measures HEAD with the SAME instrument.
//
// ============================ WHAT IT REPORTS ===============================
//
//   THE POOL CENSUS, to `54-impl-E5b` §2's standard: all 25 slots scanned every
//     frame by this tool, INDEPENDENTLY of the driver, and reconciled against
//     the game's own `$8171BA`.  The identity here is simply `scan == count`
//     -- unlike pool B's, because `$27F6AE` increments on allocation and
//     `$27F2F0` decrements on the free and nothing rebuilds the word.  A pool
//     that leaks cannot return to zero, so the ZERO rows are the drain proof.
//   THE POWER LEVEL, which is the owner's actual question: `$810406`/`$810408`,
//     the two ROM cursors `$8127E4`/`$8127E8`, and **the word each cursor
//     points AT** -- which is the `dbra` count the shot spawn and the option
//     pods search with.  Recon 59 §4.4: a power-up buys more simultaneous
//     shots and changes no sprite.
//   THE RANK WORDS recon 59 §5 named, every one: `$81B646`, `$81B64A`,
//     `$81B65C`, `$81B65E` and `$81309E`.
//   THE RNG, `$803916`/`$803917`, because the item's init, its bounces and both
//     collect tails all draw and the trajectory moves the moment items exist.
//   BUCKET 17, the display-list bucket `$23EB06` appends to -- the proof that
//     an item is DRAWN and not merely alive.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { BIT } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { loadBundle } from '../src/web/assets.js';
import { ITEM, POWER, itemCensus, spawnItem } from '../src/items.js';
import { romToPackedMap } from '../src/web/app.js';
import { RAM_STRIDE } from '../src/render/index.js';

const ASSETS = fileURLToPath(new URL('../assets', import.meta.url));
const HOLD = portWordFromBits([BIT.b1]);
const NONE = 0xffff;
export const WATCH = {
  rankPower: 0x81b646,   // $2608D2's power term -- recon 59 §5.1
  hyperEarn: 0x81b64a,   // $286774/$2867B4 accumulate into it
  hyperStock1: 0x81b65c, // the word a kind $C item would raise: +16 RANK EACH
  hyperStock2: 0x81b65e, // ...and P2's
  rank: 0x81309e,        // $2608D2's output
  pending: 0x81b4c0, chain: 0x81b5da, meter: 0x81b5c0,
  rngState: 0x803916, rngCounter: 0x803917,
  counter30BE: 0x8130be, set040A: 0x81040a, setTarget040B: 0x81040b,
};

export async function run({ frames = 6200, mode = 'tap', stress = 0,
  pulse = false } = {}) {
  const read = async (name) => new Uint8Array(fs.readFileSync(path.join(ASSETS, name)));
  const bundle = await loadBundle(read, { shards: 'all' });
  const g = new Game(bundle.seed, bundle.tables, {
    profile: bundle.profile,
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  const R = g.ram;
  const rom = bundle.tables ? g.rom : null;
  // The 139 ITEM STREAMS, taken from the bundle's own shard assignment rather
  // than from a list this tool also wrote -- so "an item was DRAWN" is a
  // statement about the port's `$800000` records matching art the exporter
  // independently decided belongs to shard 12.
  const map = romToPackedMap(bundle.manifest, (b) => bundle.spr.shardOfBase(b));
  const itemStreams = new Set([...map.entries()]
    .filter(([, v]) => v[2] === 12).map(([r0]) => r0));

  const s = {
    frames: 0, err: null,
    live: [], maxLive: 0, maxCount: 0, disagreements: 0, zeroFrames: 0,
    longestZero: 0, runZero: 0, firstSpawnFrame: -1, firstDrawFrame: -1,
    firstCollectFrame: -1, drawFrames: 0, maxRecords: 0, totalRecords: 0,
    driverWalks: 0, driverEmits: 0, driverFrees: 0, driverCollected: 0,
    kindsSeen: new Map(), powerTrace: [], variantSeen: new Set(),
    streamsSeen: new Set(),
  };
  const snap = () => {
    const o = {};
    for (const [k, a] of Object.entries(WATCH)) o[k] = R.u16(a);
    // BYTE reads, because these four ARE bytes in the listing and reading them
    // as words is how the first run of this tool printed `$81040A 771 of 768`
    // for two values the cartridge holds as `3` and `3`.
    o.rngCounter = R.u8(WATCH.rngCounter);       // $803917 addq.b #1
    o.set040A = R.u8(WATCH.set040A);             // $252E9A move.b $81040A,D6
    o.setTarget040B = R.u8(WATCH.setTarget040B); // $252EA0 cmp.b $81040B,D6
    return o;
  };
  const before = snap();
  before.cursorShot = R.u32(POWER.p1Cursor);
  before.cursorPod = R.u32(POWER.p1PodCursor);
  before.wordShot = rom ? rom.u16(before.cursorShot) : -1;
  before.wordPod = rom ? rom.u16(before.cursorPod) : -1;

  for (let i = 0; i <= frames; i++) {
    R.setU8(0x810424, 0xff);                       // the page's own intervention
    const inp = i === 0 ? NONE : (mode === 'hold' ? HOLD
      : mode === 'tap' ? ((i % 4 === 0) ? HOLD : NONE) : NONE);
    try { g.step(inp); } catch (e) { s.err = `step ${i}: ${e.message}`; break; }
    s.frames = i;
    // ---- STRESSED.  The REAL `$27E812`, N times a frame, with the PLAYER's
    // own record standing in for the dying object's -- `$27F6C4 move.l ($2,A6)`
    // is the only field the fill reads from it.  Kinds $0 and $8 alternate,
    // which are the two `handler85` can pass; the hyper kinds stay REFUSED and
    // the refusal is counted by `unportedLog` like any other.
    // `--pulse` stops the pressure at frame 1,500 so the census can show the
    // pool DRAINING BACK TO ZERO under its own rules -- which is E5b §2's
    // actual proof and is not visible while something is filling it every frame.
    for (let k = 0; k < (pulse && i >= 1500 ? 0 : stress); k++) {
      spawnItem(R, g.rom, g.ctxForTools ?? { unportedLog: g.unportedLog,
        tables: g.tables, itemSpawn: null },
      (i + k) % 2 ? 8 : 0, 0x8103e6, 0x0F1751);
    }

    // ---- THE CENSUS.  A second instrument: this walk does not consult the
    // driver and the driver does not consult it.
    const c = itemCensus(R);
    if (c.live > s.maxLive) s.maxLive = c.live;
    if (c.count > s.maxCount) s.maxCount = c.count;
    if (c.count !== c.live) s.disagreements++;
    s.variantSeen.add(c.variant);
    for (const [k, n] of c.kinds) {
      s.kindsSeen.set(k, Math.max(s.kindsSeen.get(k) ?? 0, n));
    }
    if (c.live === 0) {
      s.zeroFrames++; s.runZero++;
      if (s.runZero > s.longestZero) s.longestZero = s.runZero;
    } else {
      s.runZero = 0;
      if (s.firstSpawnFrame < 0) s.firstSpawnFrame = i;
    }

    const t = g.itemFrame;
    if (t) {
      s.driverWalks += t.walked; s.driverEmits += t.emitted;
      s.driverFrees += t.freed; s.driverCollected += t.collected;
    }
    // ---- THE PORT'S OWN `$800000` LIST, read the way the page reads it, and
    // counted by STREAM ADDRESS against shard 12's membership.  The bucket
    // counters themselves are drained every frame, so counting them after
    // `step()` reads zero -- which is what the first version of this tool did.
    let recs = 0;
    for (let k = 0; k < 256; k++) {
      const bb = k * RAM_STRIDE;
      const w4 = R.u16(0x800000 + (bb + 4) * 2);
      if ((w4 & 0x7fff) === 0) break;
      const offs = ((R.u16(0x800000 + (bb + 2) * 2) & 0x7f) << 16)
        | R.u16(0x800000 + (bb + 3) * 2);
      if (itemStreams.has(offs)) { recs++; s.streamsSeen.add(offs); }
    }
    if (recs > 0) {
      s.drawFrames++; s.totalRecords += recs;
      if (recs > s.maxRecords) s.maxRecords = recs;
      if (s.firstDrawFrame < 0) s.firstDrawFrame = i;
    }
    if (s.firstCollectFrame < 0 && (g.itemCollects?.size ?? 0) > 0) s.firstCollectFrame = i;
    if (s.powerTrace.length === 0
      || s.powerTrace[s.powerTrace.length - 1].shot !== R.u16(POWER.p1Shot)
      || s.powerTrace[s.powerTrace.length - 1].laser !== R.u16(POWER.p1Laser)) {
      s.powerTrace.push({ f: i, shot: R.u16(POWER.p1Shot),
        laser: R.u16(POWER.p1Laser),
        cur: R.u32(POWER.p1Cursor), pod: R.u32(POWER.p1PodCursor),
        word: rom ? rom.u16(R.u32(POWER.p1Cursor)) : -1,
        podWord: rom ? rom.u16(R.u32(POWER.p1PodCursor)) : -1 });
    }
  }

  const after = snap();
  after.cursorShot = R.u32(POWER.p1Cursor);
  after.cursorPod = R.u32(POWER.p1PodCursor);
  after.wordShot = rom ? rom.u16(after.cursorShot) : -1;
  after.wordPod = rom ? rom.u16(after.cursorPod) : -1;

  return {
    mode, stress, pulse, ...s,
    before, after,
    streamsDrawn: s.streamsSeen.size, streamsTotal: itemStreams.size,
    spawns: [...(g.itemSpawns ?? [])].map(([k, n]) => `${n} x ${k}`),
    collects: [...(g.itemCollects ?? [])].map(([k, n]) => `${n} x ${k}`),
    kills: g.kills.n, killScore: g.kills.score,
    itemNotes: [...g.unportedLog.calls.entries()]
      .filter(([k]) => /^\$(27E812|27E884|2530BE|2530E6|28C5CA|28C9F8|28CA12|28C678|2527BE|2527C6|25349A|2534AC|2878CC|28795C|2533C8|2533D4)/.test(k))
      .map(([k, n]) => `${n} x ${k.slice(0, 96)}`),
  };
}

function fmt(r) {
  const b = r.before, a = r.after;
  const dw = (k) => `${b[k]}->${a[k]}${b[k] === a[k] ? '' : '  ** MOVED **'}`;
  return [
    `MODE ${r.mode}${r.stress ? `  --stress ${r.stress}${r.pulse ? ' --pulse'
      : ''} (STRESSED)` : ''}  `
      + `frames ${r.frames}${r.err ? `   STOPPED: ${r.err}` : ''}`,
    `  ITEM POOL CENSUS  max live ${r.maxLive} of ${ITEM.slots}, max $8171BA `
      + `${r.maxCount}, count-vs-slots disagreements ${r.disagreements}`,
    `                    frames back at ZERO ${r.zeroFrames} (longest run `
      + `${r.longestZero}), first spawn at frame ${r.firstSpawnFrame}`,
    `                    $8171BC values seen: ${[...r.variantSeen].join(',')}`,
    `  KINDS LIVE (max)  ${[...r.kindsSeen].map(([k, n]) => `$${k.toString(16)
      .toUpperCase()}x${n}`).join(' ') || '(none)'}`,
    `  $27E812 SPAWNS    ${r.spawns.join(' | ') || '(none)'}`,
    `  DRIVER $27E99E    ${r.driverWalks} records walked, ${r.driverEmits} `
      + `emitted, ${r.driverCollected} collected-animation steps, `
      + `${r.driverFrees} freed`,
    `  DRAWN ($800000)   ${r.totalRecords} item records over ${r.drawFrames} `
      + `frames, max ${r.maxRecords}/frame, first at frame ${r.firstDrawFrame}; `
      + `${r.streamsDrawn} of ${r.streamsTotal} shard-12 streams reached`,
    `  COLLECTED         ${r.collects.join(' | ') || '(none)'}`
      + `   first at frame ${r.firstCollectFrame}`,
    `  POWER P1`,
    `    power words     $810406/$810408 ${r.powerTrace.map((p) =>
      `f${p.f}:${p.shot}/${p.laser}`).join(' -> ')}`,
    `    SHOT cursor     $${b.cursorShot.toString(16)} (word ${b.wordShot}) -> `
      + `$${a.cursorShot.toString(16)} (word ${a.wordShot})`
      + `${b.cursorShot === a.cursorShot ? '' : '  ** ADVANCED **'}`,
    `    POD  cursor     $${b.cursorPod.toString(16)} (word ${b.wordPod}) -> `
      + `$${a.cursorPod.toString(16)} (word ${a.wordPod})`
      + `${b.cursorPod === a.cursorPod ? '' : '  ** ADVANCED **'}`,
    `  RANK WORDS        $81B646 ${dw('rankPower')} | $81B64A ${dw('hyperEarn')} `
      + `| $81B65C ${dw('hyperStock1')} | $81B65E ${dw('hyperStock2')} `
      + `| $81309E ${dw('rank')}`,
    `  LEDGER            pending $${a.pending.toString(16)} chain ${a.chain} `
      + `meter ${a.meter};  kills ${r.kills} / score ${r.killScore}`,
    `  RNG               $803916 ${dw('rngState')} | $803917 ${dw('rngCounter')}`,
    `  ITEM COUNTERS     $8130BE ${dw('counter30BE')} | $81040A `
      + `${dw('set040A')} of $81040B ${a.setTarget040B}`,
    r.itemNotes.length ? `  NOTED\n    ${r.itemNotes.join('\n    ')}` : '',
  ].filter(Boolean).join('\n');
}

if (process.argv[1]?.endsWith('w61itemgate.mjs')) {
  const argv = process.argv.slice(2);
  const frames = Number(argv.find((x) => /^\d+$/.test(x)) ?? 6200);
  const mode = argv.find((x) => ['hold', 'tap', 'none'].includes(x)) ?? 'tap';
  const sAt = argv.indexOf('--stress');
  const stress = sAt >= 0 ? Number(argv[sAt + 1]) : 0;
  const r = await run({ frames, mode, stress, pulse: argv.includes('--pulse') });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else console.log(fmt(r));
}
