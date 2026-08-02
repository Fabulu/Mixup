#!/usr/bin/env node
// THE DEMO, GATED  (wave 6).  The browser page, minus the browser.
//
//     node tools/demogate.mjs --rom <romdir> --web <rip/web> --dump <rip/pix-demo>
//                             --tsv <out/w6/demo.tsv>
//
// This runs EXACTLY what `src/web/app.js` runs (wave 6 called it `web/app.js`;
// wave 7 moved it under src/ so build-dist.mjs publishes it) -- the port's `Game`, the shared
// `Capture`, the shared splice, the port's `Renderer` -- with the DOM and the
// host clock removed, and then asks the one question a picture cannot answer:
//
//     with the SHIP driven by the port's own arithmetic, is the frame the
//     page would draw pixel-identical to the frame MAME drew?
//
// It is a stronger statement than `pixgate.mjs` makes.  `pixgate` proves the
// renderer reproduces MAME from BOARD state.  This proves the whole demo path
// -- port logic -> player record -> display-list splice -> renderer -> pixels
// -- reproduces MAME, i.e. that the ship the page flies is in the pixel the
// board put it in.  It can only be true because wave 4's player port compares
// 0 divergent frames; if the port's `py`/`px` drifted by one unit at any frame,
// this gate would find it as moved pixels.
//
// The port is fed the SAME input words the board saw (`portin`, one per logic
// frame, measured lead ZERO) and the SAME intervention at the same instant.
// Feeding it the board's positions would be feeding it the answer, and it is
// not: `py`/`px` are never read out of the TSV here.
//
// WHAT THIS GATE CANNOT TELL YOU, said out loud because the number is 100 % and
// a 100 % is exactly where a reader stops reading.  Because the port agrees
// with the board to the unit, the SPLICED display list is byte-identical to the
// board's own -- so "the port drove the ship" and "nothing was spliced at all"
// produce the same picture, and this gate cannot separate them.  What it does
// prove is the other direction, and that is the direction that matters: the
// pixels DO come from the number the port computed.  `--break off-by-one`
// shifts the port's `py` by one whole pixel and 109,885 pixels move;
// `--break frozen-player` stops the port advancing the ship; `--break no-input`
// feeds $FFFF instead of the board's recorded input word.  All three must go
// red, and the mutation percentages are the measure of how much of the picture
// the port is actually responsible for: 691 pixels per frame, 0.6887 %, against
// a ship record of 48x32 px plus two 16-px pods.  `frozen-player` and
// `no-input` print the same 1.7413 % because in THIS window the script's first
// stick input is at lf2000, so the two experiments coincide.
//
// I COULD NOT RUN A BROWSER FROM THIS ENVIRONMENT (no headless browser is
// installed and nothing may be downloaded), so this is also the only execution
// evidence for `src/web/app.js`'s pipeline that wave 6 had (wave 7 added
// `tools/webgate.mjs`, which loads the published bundle over a real HTTP origin). What it does NOT cover
// is stated in the worklog: the fetch/assembly path, the canvas blit, the
// keyboard mapping and the requestAnimationFrame cadence loop.

import fs from 'node:fs';
import path from 'node:path';
import { Game, RAM } from '../src/main.js';
import { P } from '../src/machine.js';
import {
  loadRegions, Renderer, paletteRgb, resolveRgb, mamePixelsToRgb,
  SCREEN_W, SCREEN_H,
} from '../src/render/index.js';
import { Capture } from '../src/render/capture.js';

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

function main() {
  const a = { rom: null, web: null, dump: null, tsv: null, break: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    if (argv[i] === '--rom') a.rom = v();
    else if (argv[i] === '--web') a.web = v();
    else if (argv[i] === '--dump') a.dump = v();
    else if (argv[i] === '--tsv') a.tsv = v();
    else if (argv[i] === '--break') a.break = v();
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  for (const k of ['rom', 'web', 'dump', 'tsv']) {
    if (!a[k]) throw new Error(`--${k} is required`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(a.web, 'capture.json'), 'utf8'));
  const cap = new Capture(manifest,
    new Uint8Array(fs.readFileSync(path.join(a.web, 'capture.bin'))));
  const seed = new Uint8Array(fs.readFileSync(path.join(a.web, 'seed.bin')));
  const tables = JSON.parse(fs.readFileSync(
    path.join(a.web, '..', 'port', 'player.tables.json'), 'utf8'));
  const roms = loadRegions((n) => new Uint8Array(fs.readFileSync(path.join(a.rom, n))));
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
    // WAVE 13: the page seeds the port's $900000 ring from the capture's own
    // first frame and then lets $240D76 write it.  This gate must do the same
    // or it stops being the page's draw path -- which is the ONE thing it
    // exists to be.
    bgSeed: cap.part(0, 'bg'),
  });
  const renderer = new Renderer(roms);

  let exact = 0, total = 0, compared = 0, worst = null, frozen = null;
  let frozenCam = null;
  let pal, ours, ref;
  for (let i = 1; i < cap.length; i++) {
    const f = cap.frames[i];
    const row = byLf.get(f.lf);
    if (!row) break;
    const prevPy = game.ram.u16(RAM.player1 + P.posY);
    const prevPx = game.ram.u16(RAM.player1 + P.posX);
    if (frozen === null) frozen = [prevPy, prevPx];
    game.ram.setU8(INVULN, 0xff);
    game.step(a.break === 'no-input' ? 0xffff : Number(row.portin));
    if (game.logicFrame !== f.lf) {
      throw new Error(`the port is at lf${game.logicFrame}, the capture frame `
        + `is lf${f.lf} -- the capture is not one dump per logic frame`);
    }
    // The page's own draw path, with the port's OWN player position AND -- from
    // wave 13 -- the port's OWN background: the scroll registers the ported
    // $140FFE uploaded and the tilemap ring the ported $240D76 wrote.  This
    // gate loads the REAL IGS023 regions, so unlike the browser bundle it can
    // draw every tile the ring asks for, which makes it the pixel proof of the
    // whole background pipeline rather than of the camera alone.
    const st = cap.state(i);
    {
      st.bg = game.vram.w;
      // `bg-frozen-camera` is the COUNTERFACTUAL for the line above.  A 100 %
      // pixel match "with the port's own background" means nothing unless the
      // substitution can be seen: the capture window is 160 px of scroll over
      // 161 frames, so holding the camera at its first value must wreck it.
      // Without this switch the claim would be indistinguishable from having
      // substituted two values that happen to be equal.
      if (a.break === 'bg-frozen-camera' && frozenCam === null) {
        frozenCam = [game.video.bg_xscroll, game.video.bg_yscroll];
      }
      st.regs = { ...st.regs,
        bg_xscroll: frozenCam ? frozenCam[0] : game.video.bg_xscroll,
        bg_yscroll: frozenCam ? frozenCam[1] : game.video.bg_yscroll,
        tx_xscroll: game.video.tx_xscroll, tx_yscroll: game.video.tx_yscroll };
    }
    let py = prevPy, px = prevPx;
    if (a.break === 'off-by-one') py += 64;             // one whole pixel
    else if (a.break === 'frozen-player') { [py, px] = frozen; }
    else if (a.break === 'bg-frozen-camera') { /* handled above */ }
    else if (a.break !== 'no-input' && a.break) {
      throw new Error(`unknown --break ${a.break}`);
    }
    cap.splice(st, i, py, px);
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
    console.log(`FAIL only ${compared} frames compared; a demo gate with no `
      + 'frames is not a pass');
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}: the port drives the ship and the page's `
    + `own render path is ${exact}/${total} = ${pct.toFixed(4)}% identical to `
    + `MAME over ${compared} frames`
    + (worst ? `; first divergent ${JSON.stringify(worst)}` : ''));
  // The census beside the number, always: "0 divergent pixels" must never be
  // readable as "the whole game agrees". These are the subsystems that ran on
  // the board and did not run in the port during the very frames above.
  console.log('  UNPORTED calls the port made during those frames:');
  for (const l of game.unportedLog.report()) console.log('   ' + l);
  return ok ? 0 : 1;
}

try {
  process.exit(main());
} catch (e) {
  console.error(String(e.stack || e));
  process.exit(2);
}
