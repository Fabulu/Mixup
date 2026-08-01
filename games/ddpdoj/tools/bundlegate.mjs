#!/usr/bin/env node
// THE PUBLISHED BUNDLE, GATED  (wave 7).
//
//     node games/ddpdoj/tools/bundlegate.mjs --assets games/ddpdoj/assets
//                --dump rip/pix-demo --tsv tools/oracle/out/w6/demo.tsv
//
// `tools/demogate.mjs` proves the demo path off the CARTRIDGE: 58 MiB of ROM
// regions, addressed exactly as the IGS023 addresses them,
// 15,955,968/15,955,968 pixels identical to MAME over 159 frames.
//
// This asks the only new question wave 7 raises: does the SAME path, fed the
// 363 KiB exported bundle instead -- tiles decoded into sheets, sprite streams
// re-based into a compact address space, every capture record's `offs` field
// rewritten to match -- produce the SAME pixels?  Anything less than
// 15,955,968/15,955,968 means the exporter dropped something, and the failure
// mode it would otherwise have is the one that has no symptom: a zero-filled
// sheet renders a perfectly plausible empty starfield.
//
// FOUR BREAKS, and every one of them must be seen to fail, because wave 6 found
// two gates in this project that could not (`06-impl-pixel-slice.md` §2):
//
//   --break drop-tile    remove one USED BG tile from the sheet index
//                        -> the boot-time coverage check must THROW, by name
//   --break drop-stream  remove one sprite stream from the manifest
//                        -> the boot-time coverage check must THROW, by name
//   --break zero-col     zero the packed colour data
//                        -> the PIXELS must diverge
//   --break blank-tile   zero one used BG tile's pixels in the sheet
//                        -> the PIXELS must diverge
//
// AND THE FOURTH ONE ALREADY CAUGHT ME ONCE.  `blank-tile` first blanked "the
// middle slot of the sheet" and came back 15,955,968/15,955,968 STILL EXACT --
// because most of the 415 exported BG tiles are in the tilemap without ever
// being on screen (`buildBgMap` decodes all 1,024 map entries; the visible
// window is 224 rows of 448 pixels out of a 512 x 2048 map).  A break that
// cannot fail is worth nothing, so the victim is now MEASURED: the visible tile
// cells are computed from each frame's `bg_yscroll`, `bg_xscroll` and rowscroll
// exactly as `igs023.js` computes them, and the tile blanked is the one
// maximising (times visible on screen) x (pixels that are not the transparent
// pen 31).
//
// The first two test the loud-failure path (a bundle that is missing something
// says so); the last two test that the bundle's CONTENT is load-bearing rather
// than decoration.

import fs from 'node:fs';
import path from 'node:path';
import { Game, RAM } from '../src/main.js';
import { P } from '../src/machine.js';
import {
  Renderer, paletteRgb, resolveRgb, mamePixelsToRgb, SCREEN_W, SCREEN_H,
} from '../src/render/index.js';
import { loadBundle, AssetError } from '../src/web/assets.js';

const INVULN = 0x810424;      // the fly-around scenario's poke, same instant

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

const BREAKS = ['drop-tile', 'drop-stream', 'zero-col', 'blank-tile'];

/**
 * The BG tile whose absence would cost the most pixels, measured rather than
 * guessed.  Visibility is computed the way `Renderer.renderIndexed` computes
 * it: row `(y + bg_yscroll) & 0x1ff`, column `(x + bg_xscroll + rowscroll[y])
 * & 0x7ff`, over 224 x 448 screen pixels per frame.
 * @returns {{tile:number, visits:number, opaque:number, score:number}}
 */
function mostVisibleBgTile(cap, sheet) {
  const visits = new Map();
  for (let i = 0; i < cap.length; i++) {
    const st = cap.state(i);
    if (st.regs.ctrl & (1 << 12)) continue;            // BG layer disabled
    const seen = new Set();
    for (let y = 0; y < 224; y++) {
      const r = (((y + st.regs.bg_yscroll) & 0x1ff) >> 5) * 64;
      const sx = (st.regs.bg_xscroll + st.rowscroll[y]) & 0x7ff;
      for (let x = 0; x < 448; x += 32) {
        // Every 32-pixel step lands in a new tile column; the two partial
        // columns at the edges are covered by the loop's own rounding.
        seen.add(r + ((((x + sx) & 0x7ff)) >> 5));
      }
    }
    for (const cell of seen) {
      const no = st.bg[cell * 2];
      visits.set(no, (visits.get(no) ?? 0) + 1);
    }
  }
  let best = null;
  for (const [no, n] of visits) {
    const slot = sheet.slot[no];
    if (slot < 0) continue;
    let opaque = 0;
    const px = sheet.pixels.subarray(slot * sheet.tileBytes, (slot + 1) * sheet.tileBytes);
    for (let k = 0; k < px.length; k++) if (px[k] !== 31) opaque++;
    const score = n * opaque;
    if (!best || score > best.score) best = { tile: no, visits: n, opaque, score, slot };
  }
  if (!best || best.score === 0) {
    throw new Error('no visible, non-transparent BG tile found -- `--break '
      + 'blank-tile` would be a break that cannot fail, which is worse than no '
      + 'break at all');
  }
  return best;
}

async function main() {
  const a = { assets: null, dump: null, tsv: null, break: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    if (argv[i] === '--assets') a.assets = v();
    else if (argv[i] === '--dump') a.dump = v();
    else if (argv[i] === '--tsv') a.tsv = v();
    else if (argv[i] === '--break') a.break = v();
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  for (const k of ['assets', 'dump', 'tsv']) {
    if (!a[k]) throw new Error(`--${k} is required`);
  }
  if (a.break && !BREAKS.includes(a.break)) {
    throw new Error(`unknown --break ${a.break}; known: ${BREAKS.join(', ')}`);
  }

  // The SAME loader the page runs, over the filesystem instead of HTTP. It is
  // deliberately the same module and not a second reader: the assembly, the
  // length assertions and the coverage check are what this gate is testing.
  const read = async (name) => {
    const p = path.join(a.assets, name);
    if (!fs.existsSync(p)) {
      throw new AssetError(`assets/${name} is missing`);
    }
    return new Uint8Array(fs.readFileSync(p));
  };

  const bundleOpts = {};
  if (a.break === 'zero-col') bundleOpts.zeroCol = true;
  if (a.break === 'drop-stream') bundleOpts.dropStream = 0;
  if (a.break === 'drop-tile') {
    // A tile the capture actually uses, taken from the exported sheet itself so
    // this cannot quietly pick one that is not in the tilemap at all. It does
    // NOT have to be a VISIBLE tile: the coverage check runs over every map
    // entry, on screen or not, which is exactly the point of it.
    const probe = await loadBundle(read);
    const victim = probe.sheets.bg.nos[Math.floor(probe.sheets.bg.count / 2)];
    try {
      await loadBundle(read, { dropTile: victim });
    } catch (e) {
      console.log(`EXPECTED-RED [--break drop-tile]: ${e.name}: `
        + `${String(e.message).split('\n')[0]}`);
      return e instanceof AssetError ? 0 : 1;
    }
    console.log(`EXPECTED-RED [--break drop-tile]: BG tile ${victim} was `
      + 'removed from the sheet and NOTHING THREW -- the coverage check is fake');
    return 1;
  }
  if (a.break === 'drop-stream') {
    try {
      await loadBundle(read, bundleOpts);
    } catch (e) {
      console.log(`EXPECTED-RED [--break drop-stream]: ${e.name}: `
        + `${String(e.message).split('\n')[0]}`);
      return e instanceof AssetError ? 0 : 1;
    }
    console.log('EXPECTED-RED [--break drop-stream]: a sprite stream was removed '
      + 'from the manifest and NOTHING THREW -- the coverage check is fake');
    return 1;
  }

  const bundle = await loadBundle(read, bundleOpts);
  if (a.break === 'blank-tile') {
    const s = bundle.sheets.bg;
    const v = mostVisibleBgTile(bundle.cap, s);
    console.log(`  victim: BG tile ${v.tile}, on screen in ${v.visits} of `
      + `${bundle.cap.length} frames, ${v.opaque}/${s.tileBytes} pixels opaque`);
    s.pixels.fill(0, v.slot * s.tileBytes, (v.slot + 1) * s.tileBytes);
  }

  const { cap, seed, tables } = bundle;
  const rows = readTsv(a.tsv);
  const byLf = new Map(rows.map((r) => [Number(r.lf), r]));
  const seedLf = cap.frames[0].lf;
  const start = byLf.get(seedLf);
  if (!start || start.portin === undefined) {
    throw new Error('the demo trace has no `portin` column -- re-run '
      + '`pgm.py pixdemo`; without it the port would be fed its own answer');
  }

  const game = new Game(seed, tables, {
    logicFrame: seedLf, videoFrame: cap.frames[0].vf,
  });
  const renderer = new Renderer(bundle.roms, bundle.tileFns);

  let exact = 0, total = 0, compared = 0, worst = null;
  let pal, ours, ref;
  for (let i = 1; i < cap.length; i++) {
    const f = cap.frames[i];
    const row = byLf.get(f.lf);
    if (!row) break;
    const prevPy = game.ram.u16(RAM.player1 + P.posY);
    const prevPx = game.ram.u16(RAM.player1 + P.posX);
    game.ram.setU8(INVULN, 0xff);
    game.step(Number(row.portin));
    if (game.logicFrame !== f.lf) {
      throw new Error(`the port is at lf${game.logicFrame}, the capture frame `
        + `is lf${f.lf} -- the capture is not one dump per logic frame`);
    }
    const st = cap.state(i);
    cap.splice(st, i, prevPy, prevPx);
    const idx = renderer.renderIndexed(st);
    pal = paletteRgb(cap.part((i + 1) % cap.length, 'palette'), pal);
    ours = resolveRgb(idx, pal, ours);
    const pixFile = path.join(a.dump,
      `f${String(f.vf + 1).padStart(6, '0')}.pixels.bin`);
    if (!fs.existsSync(pixFile)) continue;      // the last frame has no N+1
    ref = mamePixelsToRgb(new Uint8Array(fs.readFileSync(pixFile)),
      SCREEN_W, SCREEN_H, ref);
    let same = 0;
    for (let k = 0; k < ours.length; k += 3) {
      if (ours[k] === ref[k] && ours[k + 1] === ref[k + 1]
        && ours[k + 2] === ref[k + 2]) same++;
    }
    exact += same; total += SCREEN_W * SCREEN_H; compared++;
    if (same !== SCREEN_W * SCREEN_H && !worst) {
      worst = { lf: f.lf, vf: f.vf, same, of: SCREEN_W * SCREEN_H };
    }
  }

  const ok = exact === total && compared >= 100;
  const pct = total ? (100 * exact / total) : 0;
  if (a.break) {
    console.log(`EXPECTED-RED [--break ${a.break}]: ${exact}/${total} = `
      + `${pct.toFixed(4)}% -- `
      + (ok ? 'STILL EXACT, the gate is fake' : 'diverged, as it must'));
    return ok ? 1 : 0;
  }
  if (compared < 100) {
    console.log(`FAIL only ${compared} frames compared; a bundle gate with no `
      + 'frames is not a pass');
  }
  const m = bundle.manifest;
  console.log(`${ok ? 'PASS' : 'FAIL'}: the PUBLISHED BUNDLE renders `
    + `${exact}/${total} = ${pct.toFixed(4)}% identical to MAME over `
    + `${compared} frames` + (worst ? `; first divergent ${JSON.stringify(worst)}` : ''));
  console.log(`  bundle: ${m.gfx.bg.tiles} BG tiles + ${m.gfx.tx.tiles} TX tiles `
    + `decoded, ${m.spr.streams.length} sprite streams `
    + `(${m.spr.maskUsed} mask + ${m.spr.colUsed} colour words packed into `
    + `${m.spr.maskWords} + ${m.spr.colWords}), ${m.frames} capture frames`);
  console.log('  UNPORTED calls the port made during those frames:');
  for (const l of game.unportedLog.report()) console.log('   ' + l);
  return ok ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error(String(e.stack || e));
  process.exit(2);
});
