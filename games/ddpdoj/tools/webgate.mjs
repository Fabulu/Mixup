#!/usr/bin/env node
// THE BROWSER FETCH PATH, GATED  (wave 7).
//
//     node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
//
// `bundlegate.mjs` proves the bundle's CONTENT is right, but it reads it off
// the filesystem.  Wave 6 listed "the fetch and region-assembly path in the
// browser" as untested and it stayed untested, on the belief that there is no
// browser on this machine and nothing may be downloaded.  This closes as much
// of that gap as can be closed without one: it starts a real HTTP server over
// `assets/` and
// loads the bundle through `httpReader` -- the SAME function the page calls,
// with the same `r.ok` check, the same `.gz` naming and the same
// `DecompressionStream` inflate -- and renders one frame from the result.
//
// WAVE 37 ADDED THE STRIP.  `Demo.draw()` now throws the recorded enemies out
// of the display list (`stripToAttached`), and this is the only check that runs
// it over the REAL bundle: the unit suite has to pass on a tree with no
// cartridge, so it can only use synthetic frames.  This gate already refuses to
// run without `assets/` rather than skipping, which is what makes it the right
// home for the measured numbers.
//
// WHAT IT STILL DOES NOT COVER: the canvas blit, the keyboard and pointer
// events, the requestAnimationFrame cadence, and CSS/layout.
//
// AND THE "NOBODY CAN LOOK" PART OF THAT SENTENCE IS FALSE, MEASURED W37.
// This file, `tests/web-page.test.js` and worklogs 07, 09, 14 and 27 have all
// said "there is no browser on this machine" since wave 6.  There is:
// `C:\Program Files\Google\Chrome\Application\chrome.exe` (and Edge), and the
// Python `playwright` package is already installed -- nothing was downloaded.
// W37 loaded this page in it, flew the ship with the arrow keys, pressed fire,
// read the status line back out of the DOM and screenshotted the canvas
// (`docs/worklog/ddpdoj/42-impl-strip-capture-enemies.md` §3).  `--headless
// --screenshot --virtual-time-budget` does NOT work -- the boot stalls inside
// `loadBundle` -- but playwright driving real time does, first try.
// **A REAL PLAYABILITY GATE IS THEREFORE POSSIBLE**, which is what
// `39-OWNER-visible-play-before-sound.md` asks for and what no gate here does.
//
// THREE BREAKS, each seen to fail:
//   --break missing-file   one asset removed  -> the r.ok check must throw
//   --break truncated      one asset truncated -> a length assertion must throw
//   --break not-gzip       one asset served as plain bytes -> inflate must throw

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadBundle, httpReader, AssetError } from '../src/web/assets.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
  parseSpriteList,
} from '../src/render/index.js';
import { stripToAttached } from '../src/web/app.js';

const BREAKS = ['missing-file', 'truncated', 'not-gzip'];
// A file every path needs, and one whose absence a picture would not report.
// WAVE 14: the single BG sheet became eight shards, so the victim is a BOOT
// shard -- the ones `loadBundle` awaits.  A DEFERRED shard would be the wrong
// victim on purpose: its 404 is meant to be survivable until a frame needs it,
// which is a different check and is `bundlegate --break shard-404`.
const VICTIM = 'gfx/bg.shard0.tiles.u8.gz';

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const brk = arg('break', null);
if (brk && !BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: ${BREAKS.join(', ')}`);
  process.exit(2);
}

if (!fs.existsSync(path.join(ASSETS, 'manifest.json'))) {
  console.error(`${ASSETS}/manifest.json is missing -- run: `
    + 'node games/ddpdoj/tools/export-web.mjs');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(ASSETS, rel);
  if (!file.startsWith(ASSETS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  if (brk === 'missing-file' && rel === VICTIM) { res.writeHead(404); res.end('no'); return; }
  let body = fs.readFileSync(file);
  if (brk === 'truncated' && rel === VICTIM) {
    // Truncate the DECOMPRESSED payload, not the gzip envelope: a short gzip
    // stream throws on its own, which would test the wrong thing. This makes a
    // valid gzip of a short sheet, which is exactly the shape a half-finished
    // exporter run would leave behind.
    const raw = zlib.gunzipSync(body);
    body = zlib.gzipSync(raw.subarray(0, raw.length - 1024));
  }
  if (brk === 'not-gzip' && rel === VICTIM) {
    body = zlib.gunzipSync(body);          // as a CDN that already inflated it
  }
  res.writeHead(200, {
    'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    'content-length': body.length,
  });
  res.end(body);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let code = 0;
const t0 = Date.now();
try {
  const files = [];
  const bundle = await loadBundle(httpReader(base, (name, n) => {
    if (n === 0) files.push(name);
  }));

  if (brk) {
    console.log(`EXPECTED-RED [--break ${brk}]: the bundle LOADED anyway -- `
      + 'the fetch-path checks are fake');
    code = 1;
  } else {
    // Loadable is not the same as usable. Render one frame through the real
    // renderer and require a picture rather than a black rectangle: a
    // zero-filled sheet loads perfectly and draws a plausible empty starfield.
    const r = new Renderer(bundle.roms, bundle.tileFns);
    const st = bundle.cap.state(0);
    const f = bundle.cap.frames[0];
    bundle.cap.splice(st, 0, f.py, f.px);
    const rgb = resolveRgb(r.renderIndexed(st),
      paletteRgb(bundle.cap.part(1, 'palette')));
    const rgba = rgbToRgba(rotateCCW(rgb, SCREEN_W, SCREEN_H));
    let lit = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] | rgba[i + 1] | rgba[i + 2]) lit++;
    }
    const px = rgba.length / 4;
    const ok = lit > px / 2;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${files.length} files fetched over HTTP `
      + `in ${Date.now() - t0} ms, assembled, and one frame rendered `
      + `${px} px with ${lit} (${(100 * lit / px).toFixed(1)}%) non-black`);
    console.log(`  ${files.join(' ')}`);
    if (!ok) code = 1;

    // WAVE 37 -- THE RECORDED ENEMIES, AND THE ONLY CHECK THAT SEES THE REAL
    // BUNDLE.  `tests/web-page.test.js` proves what `stripToAttached` DOES, on
    // synthetic data, because the unit suite has to pass on a tree with no
    // cartridge.  This is where the MEASURED numbers live, because this gate
    // already refuses to run without `assets/` (exit 2 above) rather than
    // skipping -- and a skip is not a pass.
    //
    // TWO-SIDED ON PURPOSE.  0 % changed means the strip did nothing; ~100 %
    // means it wrecked the screen.  The measured answer is 8.99 %, and the
    // band below is wide enough that a re-exported bundle does not go red for
    // being a slightly different picture and narrow enough that either failure
    // is caught.  The record counts are exact, because 161 frames of capture
    // are not going to quietly become a different 161 frames.
    const EXPECT = { before: 7671, after: 886, classes: 8 };
    let nb = 0, na = 0, changed = 0, total = 0, worstLit = 1;
    const kept = new Set();
    for (let fi = 0; fi < bundle.cap.length; fi++) {
      const fr = bundle.cap.frames[fi];
      const a = bundle.cap.state(fi);       // as the page rendered it before W37
      const b = bundle.cap.state(fi);
      bundle.cap.splice(a, fi, fr.py, fr.px);
      bundle.cap.splice(b, fi, fr.py, fr.px);
      nb += parseSpriteList(a.spritebuffer).length;
      // THE SAME FUNCTION THE PAGE CALLS, not a second implementation of it.
      na += stripToAttached(b, bundle.cap.attached()[fi]).kept;
      for (const s of parseSpriteList(b.spritebuffer)) {
        kept.add(`${s.width}x${s.height} c${s.color} p${s.pri} f${s.flip}`);
      }
      const ia = r.renderIndexed(a), A = Uint16Array.from(ia);
      const ib = r.renderIndexed(b);
      let lit = 0;
      for (let i = 0; i < A.length; i++) {
        total++;
        if (A[i] !== ib[i]) changed++;
        if (ib[i]) lit++;
      }
      worstLit = Math.min(worstLit, lit / A.length);
    }
    const pct = 100 * changed / total;
    // THE BACKGROUND AND THE HUD MUST SURVIVE.  The owner would rather see an
    // empty enemy layer than a broken screen, so the worst stripped frame still
    // has to be a picture. Before the strip the capture's frames are ~99 % lit.
    const strip = nb === EXPECT.before && na === EXPECT.after
      && kept.size === EXPECT.classes && pct > 5 && pct < 20 && worstLit > 0.5;
    console.log(`${strip ? 'PASS' : 'FAIL'}: W37 strip over `
      + `${bundle.cap.length} frames -- display-list records ${nb} -> ${na} `
      + `(expect ${EXPECT.before} -> ${EXPECT.after}), ${kept.size} classes `
      + `survive (expect ${EXPECT.classes}), ${changed}/${total} px changed `
      + `= ${pct.toFixed(4)} %, worst stripped frame ${(100 * worstLit).toFixed(1)} % lit`);
    if (!strip) code = 1;
  }
} catch (e) {
  if (brk) {
    const first = String(e.message).split('\n')[0];
    console.log(`EXPECTED-RED [--break ${brk}]: ${e.name}: ${first}`);
    code = e instanceof AssetError ? 0 : 1;
    if (code) console.log('  ...but not as an AssetError, so the message a human '
      + 'sees would not name the file or say how to rebuild it');
  } else {
    console.error(String(e.stack || e));
    code = 1;
  }
}
server.close();
process.exit(code);
