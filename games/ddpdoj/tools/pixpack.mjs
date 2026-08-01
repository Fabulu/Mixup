#!/usr/bin/env node
// THE BROWSER DEMO'S CAPTURE PACK  (wave 6).
//
//     node tools/pixpack.mjs --dump <dir> --tsv <demo.tsv> --seed <seed.bin>
//                            --out <rip/web>
//
// Two jobs, and the second one is a MEASUREMENT, not a convenience:
//
//  1. Squeeze the per-frame IGS023 state (palette, display list, both
//     tilemaps, rowscroll, zoom table, registers) out of the dump directory
//     into one flat binary the page can fetch once.  The 401,408-byte
//     framebuffers are deliberately NOT packed: the page renders, it does not
//     replay MAME's pixels, and shipping them would let a broken renderer look
//     right.
//
//  2. IDENTIFY THE PLAYER SHIP'S DISPLAY-LIST RECORDS.  The demo draws the
//     ship at the PORT's position, and the port does not build the display
//     list, so something has to say which records are the ship.  Nothing in
//     this repo has ever measured that, so it is measured here and the
//     residual is printed:
//
//       for every captured frame, every record's (x - py>>6, y - px>>6) is
//       histogrammed against the board's OWN player position for that logic
//       frame.  A record that is the ship has the SAME offset on every frame,
//       because the ship is drawn at the ship's position; a record that is
//       anything else does not.  An offset is accepted only if it holds on at
//       least --min-hit of the frames, and the accepted set, its hit counts
//       and the frames it MISSES are all written into the manifest.
//
//     THE FRAME LAG IS SWEPT, NOT ASSUMED.  `PLAN-vertical-slice.md` records
//     that "the `:igs023:spritebuffer` share lags main RAM by one frame", so
//     the list in a dump is the list main RAM held one logic frame earlier.
//     Rather than take that on trust this tool tries lag 0, 1 and 2 and prints
//     all three.  MEASURED, 161 captured frames of `fly-around`:
//         lag 0 -> best offset holds on  75/161      (nothing is stable)
//         lag 1 -> three offsets hold on 161/161     <-- the ship + two pods
//         lag 2 -> best offset holds on  75/161
//     i.e. the inherited claim is confirmed by a comparison that could have
//     refuted it, and the demo is not built on an assumed offset.
//
//     THE AXES.  The cabinet is TATE: MAME's bitmap is 448x224 landscape, and
//     the game's long axis (posY, $8103E8, clamped [$800,$6500] = 32.0..404.0
//     px -- `machine.js` CLAMP) is the bitmap's X.  So the correlation is
//     x against py and y against px, not the other way round.  If that were
//     backwards no offset would be stable and this tool would report zero
//     accepted offsets rather than a plausible wrong answer.

import fs from 'node:fs';
import path from 'node:path';
import { beWords, parseRegs, parseSpriteList } from '../src/render/index.js';
import { Capture } from '../src/render/capture.js';

function args(argv) {
  const a = { dump: null, tsv: null, seed: null, out: null, minHit: 0.9,
    break: null };
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    if (argv[i] === '--dump') a.dump = v();
    else if (argv[i] === '--tsv') a.tsv = v();
    else if (argv[i] === '--seed') a.seed = v();
    else if (argv[i] === '--out') a.out = v();
    else if (argv[i] === '--min-hit') a.minHit = +v();
    else if (argv[i] === '--break') a.break = v();
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  for (const k of ['dump', 'tsv', 'seed', 'out']) {
    if (!a[k]) throw new Error(`--${k} is required`);
  }
  return a;
}

function readTsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const f = l.split('\t');
    const o = {};
    head.forEach((h, i) => { o[h] = f[i]; });
    return o;
  });
}

const PARTS = [
  ['palette', 'palette.bin'],
  ['spritebuffer', 'spritebuffer.bin'],
  ['bg', 'bg_videoram.bin'],
  ['tx', 'tx_videoram.bin'],
  ['rowscroll', 'rowscroll.bin'],
  ['zoomram', 'zoomram.bin'],
];

function main() {
  const a = args(process.argv.slice(2));
  const vfmap = readTsv(path.join(a.dump, 'vfmap.tsv'));
  const tsv = readTsv(a.tsv);
  const byLf = new Map(tsv.map((r) => [+r.lf, r]));

  // The frames we can both render and attribute: dumped, and with a TSV row.
  const frames = [];
  for (const { vf, lf } of vfmap) {
    const pre = path.join(a.dump, `f${String(vf).padStart(6, '0')}.`);
    if (!fs.existsSync(pre + 'palette.bin')) continue;
    const row = byLf.get(+lf);
    if (!row || row.py === undefined || row.px === undefined) continue;
    frames.push({ vf: +vf, lf: +lf, py: +row.py, px: +row.px, pre });
  }
  if (frames.length < 8) {
    throw new Error(`only ${frames.length} usable frames -- pgm.py pixdemo did `
      + 'not produce a capture (a pack with no frames is not a pack)');
  }

  // ---- 2. THE SHIP, by correlation.  Both integer conversions and three
  //         frame lags are tried; the winner is REPORTED with its runners-up.
  for (const f of frames) {
    f.sp = parseSpriteList(beWords(new Uint8Array(
      fs.readFileSync(f.pre + 'spritebuffer.bin'))));
  }
  const conv = { shift: (v) => v >> 6, round: (v) => (v + 32) >> 6 };
  const candidates = [];
  for (const lag of [0, 1, 2]) {
    for (const [cname, cf] of Object.entries(conv)) {
      const hits = new Map();          // "dx,dy" -> Set of frame indexes
      let usable = 0;
      frames.forEach((f, fi) => {
        const ref = byLf.get(f.lf - lag);
        if (!ref) return;
        usable++;
        const cy = cf(+ref.py), cx = cf(+ref.px);
        for (const s of f.sp) {
          const key = `${s.x - cy},${s.y - cx}`;
          let set = hits.get(key);
          if (!set) hits.set(key, (set = new Set()));
          set.add(fi);
        }
      });
      const accepted = [...hits.entries()]
        .filter(([, set]) => set.size >= a.minHit * usable)
        .map(([k, set]) => ({ off: k, hits: set.size }))
        .sort((p, q) => q.hits - p.hits);
      const best = Math.max(0, ...[...hits.values()].map((s) => s.size));
      candidates.push({ lag, conv: cname, usable, accepted, best });
    }
  }
  console.log(`SHIP CORRELATION over ${frames.length} captured frames, `
    + `min-hit ${(a.minHit * 100).toFixed(0)}%:`);
  for (const c of candidates) {
    console.log(`  lag=${c.lag} conv=${c.conv.padEnd(5)} best single offset `
      + `${c.best}/${c.usable} frames; ${c.accepted.length} accepted `
      + JSON.stringify(c.accepted.slice(0, 6)));
  }
  candidates.sort((p, q) => (q.accepted.length - p.accepted.length)
    || (q.best - p.best) || (p.lag - q.lag));
  const win = candidates[0];
  const accepted = win.accepted;
  if (!accepted.length) {
    console.log('  NO STABLE OFFSET AT ANY LAG. The ship is NOT identified; '
      + 'the page will replay the board\'s own records unspliced and say so.');
  }
  console.log(`  CHOSEN lag=${win.lag} conv=${win.conv}`);
  const accSet = new Set(accepted.map((e) => e.off));
  const offsets = accepted.map((e) => e.off.split(',').map(Number));

  // Per frame: which record indexes carry an accepted offset.  Recomputed per
  // frame rather than assumed constant, because the display list is REBUILT
  // FROM SCRATCH every frame and slots are not stable identities
  // (`00-recon-memmap.md`; measured by execution).
  const cf = conv[win.conv];
  let spliced = 0, missing = 0;
  for (const f of frames) {
    const ref = byLf.get(f.lf - win.lag);
    f.refLf = ref ? +ref.lf : null;
    f.refPy = ref ? +ref.py : null;
    f.refPx = ref ? +ref.px : null;
    f.player = [];
    if (ref) {
      const cy = cf(+ref.py), cx = cf(+ref.px);
      for (const s of f.sp) {
        if (accSet.has(`${s.x - cy},${s.y - cx}`)) {
          f.player.push([s.i, s.x - cy, s.y - cx]);
        }
      }
    }
    if (f.player.length) spliced++; else missing++;
    delete f.sp;
  }
  console.log(`  ${spliced} frame(s) carry at least one identified record, `
    + `${missing} carry none`);

  // ---- 1. the pack
  fs.mkdirSync(a.out, { recursive: true });
  const sizes = {};
  const chunks = [];
  for (const f of frames) {
    for (const [name, ext] of PARTS) {
      const b = fs.readFileSync(f.pre + ext);
      if (sizes[name] === undefined) sizes[name] = b.length;
      else if (sizes[name] !== b.length) throw new Error(`${name} size changed`);
      chunks.push(b);
    }
    f.regs = parseRegs(fs.readFileSync(f.pre + 'regs.txt', 'utf8'));
    delete f.pre;
  }
  const bin = Buffer.concat(chunks);
  fs.writeFileSync(path.join(a.out, 'capture.bin'), bin);
  fs.copyFileSync(a.seed, path.join(a.out, 'seed.bin'));
  const manifest = {
    note: 'ROM-DERIVED. Written under games/ddpdoj/rip/, which is gitignored '
      + 'twice over. Never commit this directory.',
    scenario: 'fly-around', frames: frames.length,
    layout: PARTS.map(([n]) => [n, sizes[n]]),
    frameBytes: PARTS.reduce((s, [n]) => s + sizes[n], 0),
    shipCorrelation: {
      lag: win.lag, conversion: win.conv, minHit: a.minHit,
      accepted, candidates,
      framesWithARecord: spliced, framesWithNone: missing,
      offsets,
    },
    seedLf: frames[0].lf,
    frameList: frames,
  };
  fs.writeFileSync(path.join(a.out, 'capture.json'),
    JSON.stringify(manifest, null, 1));
  console.log(`PACK ${frames.length} frames x ${manifest.frameBytes} bytes = `
    + `${bin.length} bytes -> ${path.join(a.out, 'capture.bin')}`);

  // ---- 3. SELF-VERIFICATION, and it is a gate, not a print.
  //
  // The page splices the ship's records to the PORT's position.  The one thing
  // that must be true of that splice, whatever the port computes, is that
  // feeding it the BOARD's own position reproduces the board's own display
  // list -- byte for byte, every record, every frame.  If it does not, then
  // either the identified offsets, the fixed-point conversion or the word
  // layout is wrong, and the page would draw a ship in the wrong place while
  // looking entirely plausible.
  //
  // This runs through `src/render/capture.js`, the SAME code the page calls.
  //
  // RED-VALIDATED: `--break <name>` feeds the splice a deliberately wrong
  // number and the round-trip MUST fail.  A check that has never been seen fail
  // is not evidence (`docs/knowledge/03`).
  const cap = new Capture(manifest, new Uint8Array(bin));
  let checked = 0, bad = 0, worst = null;
  for (let i = 0; i < cap.length; i++) {
    const f = cap.frames[i];
    if (f.refPy === null) continue;
    const before = cap.part(i, 'spritebuffer');
    const st = cap.state(i);
    let py = f.refPy, px = f.refPx;
    if (a.break === 'shift-by-5') { py <<= 1; px <<= 1; }        // >>6 -> >>5
    else if (a.break === 'swap-axes') { [py, px] = [px, py]; }
    else if (a.break === 'no-lag') {
      const cur = byLf.get(f.lf);
      if (cur) { py = +cur.py; px = +cur.px; }
    } else if (a.break) throw new Error(`unknown --break ${a.break}`);
    cap.splice(st, i, py, px);
    checked++;
    for (let w = 0; w < before.length; w++) {
      if (before[w] !== st.spritebuffer[w]) {
        bad++;
        worst = worst ?? { lf: f.lf, word: w, was: before[w], now: st.spritebuffer[w] };
        break;
      }
    }
  }
  if (a.break) {
    console.log(`EXPECTED-RED [--break ${a.break}]: ${bad} of ${checked} frames `
      + (bad ? 'diverged, as they must' : 'STILL ROUND-TRIP -- the check is fake'));
    return bad ? 0 : 1;
  }
  if (bad) {
    console.log(`FAIL SPLICE ROUND-TRIP: ${bad} of ${checked} frames do not `
      + `reproduce the board's own list when fed the board's own position; `
      + `first ${JSON.stringify(worst)}`);
    return 1;
  }
  console.log(`SPLICE ROUND-TRIP: ${checked}/${checked} frames reproduce the `
    + `board's own display list byte for byte when fed the board's own `
    + `position (${offsets.length} record offsets moved per frame)`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error(String(e.stack || e));
  process.exit(2);
}
