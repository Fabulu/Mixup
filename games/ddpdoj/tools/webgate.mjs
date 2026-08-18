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
// BREAKS, each seen to fail.  THE FETCH PATH (the bundle must not load):
//   --break missing-file   one asset removed  -> the r.ok check must throw
//   --break truncated      one asset truncated -> a length assertion must throw
//   --break not-gzip       one asset served as plain bytes -> inflate must throw

// WAVE 44 ADDED THE PORT'S OWN DISPLAY LIST, and with it the four red
// validations `43-plan-enemy-layer.md` §3.2.4 asks for.  This gate is their home
// for the same reason the strip's numbers are: it refuses to run without
// `assets/` instead of skipping, and it is the only check in the repo that sees
// the REAL 166-stream sheet against the REAL port.  See PORT RUN below.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Game, RAM } from '../src/main.js';
import { BIT, P } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { loadBundle, loadSoundAssets, httpReader, AssetError } from '../src/web/assets.js';
import { soundRuntimeFromAssets } from '../src/soundruntime.js';
import { APPROVED_SOUND_POLICIES } from '../src/soundpolicy.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
  parseSpriteList, RAM_STRIDE,
} from '../src/render/index.js';
import {
  stripToAttached, portSpriteList, romToPackedMap, PORT_LIST_WORDS,
} from '../src/web/app.js';

const BREAKS = ['missing-file', 'truncated', 'not-gzip'];
// The port-list red validations. They are NOT in BREAKS: those three break the
// FETCH path and the gate then expects the load to throw. These break the DRAW
// path, the bundle loads fine, and what must move is a NUMBER.
const PORT_BREAKS = ['no-remap', 'drop-one-stream', 'lag-0',
  'terminate-instead-of-zero-width', 'no-extent-check'];
// WAVE 47 -- THE THIRD CATEGORY. A DEFERRED SPRITE SHARD THAT 404s. The bundle
// must LOAD (a shard nobody has reached cannot take the page down) and the
// throw must arrive from inside the frame that first needs it, naming the shard
// and the files. That is `BgShards`' contract and this is the sprite half of it.
const SPR_BREAKS = ['spr-shard-404'];
const SPR_VICTIM = 'spr/mask.shard1.u16.gz';
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

/** big-endian u16 words out of a raw dump -- the layout `BgVram` stores, and
 *  the same transform `seedcmp.mjs`'s `beWords` applies.  Kept local so this
 *  gate can disagree with the page's own loader rather than importing it. */
function beWords(bytes) {
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}

/** WAVE 101.  Boot the port from ladder rung `lf`, step `frames` logic frames
 *  with nothing pressed, and return a verdict.  The manifest's `poke` is
 *  reapplied every frame (default on) because `stage1-sweep` holds `$810424`
 *  at `$FF` and a scripted run dies long before the deep rungs without it;
 *  `--no-poke` exists so that claim can be falsified rather than asserted. */
function runRungStage(bundle, lf, ladderName, frames, noPoke) {
  const manDir = path.join(HERE, 'oracle', 'out', 'w69', ladderName);
  const manPath = path.join(manDir, 'manifest.json');
  if (!fs.existsSync(manPath)) {
    console.error(`rung ${lf}: manifest not found at ${manPath}. Build the `
      + `ladder with: python games/ddpdoj/tools/oracle/pgm.py ckpt`);
    return 1;
  }
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  const rung = (man.rungs || []).find((r) => r.lf === lf);
  if (!rung) {
    console.error(`rung ${lf} is not in ${manPath}; rungs: `
      + (man.rungs || []).map((r) => r.lf).join(', '));
    return 1;
  }
  const ckDir = path.join(manDir, man.dir || 'ckpt');
  const seedPath = path.join(ckDir, rung.ram);
  const bgPath = path.join(ckDir, rung.bg);
  const seed = new Uint8Array(fs.readFileSync(seedPath));
  const bgSeed = beWords(new Uint8Array(fs.readFileSync(bgPath)));
  // THE MANIFEST'S INTERVENTION, reprinted at the top every time, because a
  // seeded result that does not label itself is the trap this project shipped
  // six crashes behind.  Same sentence seedcmp.mjs prints.
  console.log(`LADDER   ${manPath}`);
  if (man.intervention) console.log(`INTERVENTION  ${man.intervention}`);
  console.log(`SEEDED BOOT -- starts from the BOARD's own state at lf${lf}. `
    + 'This validates the CODE from that state, never the route to it.');
  const poke = noPoke ? null : (man.poke || null);
  if (poke) console.log(`POKE     ${poke} every frame (--no-poke to drop it)`);
  console.log('');

  const g = new Game(seed, bundle.tables, {
    logicFrame: rung.lf,
    videoFrame: rung.vf,
    bgSeed,
  });
  const map = romToPackedMap(bundle.manifest,
    (b) => bundle.spr ? bundle.spr.shardOfBase(b) : null);
  const shardReady = (i) => bundle.spr ? bundle.spr.state[i] === 'ready' : true;
  const buf = new Uint16Array(PORT_LIST_WORDS);
  // The page drives the boot shard set only; the deferred shards' words are
  // still zero here, so a record whose art has not landed must be SKIPPED AND
  // NAMED, exactly as it is on the page.  Reported rather than asserted: the
  // missing-art addresses name the next art wave's shopping list, and a rung
  // past the shipped sheet's coverage will name some by design.
  const portWord = 0xffff;                     // nothing pressed
  let thrown = null;
  let stepped = 0;
  let drawnMax = 0, drawnSum = 0, missingSum = 0;
  const firstMissing = new Map();
  try {
    for (let i = 0; i < frames; i++) {
      const list = portSpriteList(g.ram, map, {
        out: buf,
        shardReady,
        demand: () => {},
      });
      drawnMax = Math.max(drawnMax, list.drawn);
      drawnSum += list.drawn;
      missingSum += list.skipped;
      for (const [o, c] of list.missing) {
        if (!firstMissing.has(o)) firstMissing.set(o, g.logicFrame);
      }
      if (poke) {
        const [addr, val] = poke.split('=').map((s) => parseInt(s, 16));
        g.ram.setU8(addr, val);
      }
      g.step(portWord);
      stepped++;
    }
  } catch (e) {
    thrown = e;
  }
  const reach = `lf${rung.lf} -> lf${g.logicFrame} over ${stepped} step(s)`;
  if (thrown) {
    const msg = String(thrown.message || thrown).split('\n')[0];
    console.log(`FAIL: RUNG BOOT threw at lf${g.logicFrame} after ${stepped} `
      + `step(s): ${thrown.name}: ${msg}`);
    console.log(`  ${reach}; ${drawnMax} records drawn on the busiest frame `
      + `before the throw, ${missingSum} skipped as missing art.`);
    return 1;
  }
  // A BOOT THAT DRAWS NOTHING is not evidence the seed worked.  The deep rungs
  // have a full picture, so `drawnMax > 0` is the floor that catches a seed
  // whose RAM made every record invisible (a wrong layout, a byte-swapped
  // ring).  Reported rather than asserted: the missing-art addresses name the
  // next art wave's shopping list, and a rung past the shipped sheet's
  // coverage will name some by design.
  const ok = drawnMax > 0;
  const missNamed = [...firstMissing.entries()].sort((a, b) => a[1] - b[1])
    .slice(0, 8).map(([o, l]) => `$${o.toString(16).toUpperCase().padStart(6, '0')}@lf${l}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}: RUNG BOOT from lf${rung.lf} -- ${reach}, `
    + `${drawnMax} records on the busiest frame, `
    + `${(drawnSum / Math.max(1, stepped)).toFixed(1)} avg, `
    + `${missingSum} records skipped as missing art `
    + `(${firstMissing.size} distinct${missNamed.length ? '; first: ' + missNamed.join(' ') : ''}). `
    + `objlive ${g.objlive()}, logicFrame ${g.logicFrame}, videoFrame ${g.videoFrame}.`);
  if (!ok) console.log('  ZERO records drew on every frame -- the seed produced '
    + 'no visible picture. Check the byte layout (worklog 101).');
  return ok ? 0 : 1;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
// WAVE 101 -- boot from a ladder rung instead of the shipped seed.  Local dev
//  only; the ladder dir is gitignored and not in dist/.  The manifest's own
//  intervention is reprinted at the top, exactly as `seedcmp.mjs` does, because
//  a seeded run validates CODE never a ROUTE.
const rungArg = arg('rung', null);
const rungLf = rungArg !== null ? parseInt(rungArg, 10) : null;
const ladderName = arg('ladder', 'stage1-sweep');
const rungFrames = parseInt(arg('frames', '300'), 10);
const rungNoPoke = process.argv.includes('--no-poke');
const brk = arg('break', null);
if (brk && !BREAKS.includes(brk) && !PORT_BREAKS.includes(brk)
    && !SPR_BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: `
    + `${[...BREAKS, ...PORT_BREAKS, ...SPR_BREAKS].join(', ')}`);
  process.exit(2);
}
const portBrk = PORT_BREAKS.includes(brk) ? brk : null;
const fetchBrk = BREAKS.includes(brk) ? brk : null;
const sprBrk = SPR_BREAKS.includes(brk) ? brk : null;

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
  if (fetchBrk === 'missing-file' && rel === VICTIM) { res.writeHead(404); res.end('no'); return; }
  if (sprBrk === 'spr-shard-404' && rel === SPR_VICTIM) { res.writeHead(404); res.end('no'); return; }
  let body = fs.readFileSync(file);
  if (fetchBrk === 'truncated' && rel === VICTIM) {
    // Truncate the DECOMPRESSED payload, not the gzip envelope: a short gzip
    // stream throws on its own, which would test the wrong thing. This makes a
    // valid gzip of a short sheet, which is exactly the shape a half-finished
    // exporter run would leave behind.
    const raw = zlib.gunzipSync(body);
    body = zlib.gzipSync(raw.subarray(0, raw.length - 1024));
  }
  if (fetchBrk === 'not-gzip' && rel === VICTIM) {
    body = zlib.gunzipSync(body);          // as a CDN that already inflated it
  }
  res.writeHead(200, {
    'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    'content-length': body.length,
    // WAVE 47 -- AND THIS ONE LINE COST A REPRODUCIBLE FLAKY RED.
    // W47's sprite-shard checks fetch AFTER a 1,000-frame CPU-bound window, so
    // the event loop is blocked for tens of seconds between requests. Node's
    // server closes an idle keep-alive socket after 5 s, `fetch` (undici)
    // reuses it anyway, and the shard comes back as `the fetch failed (fetch
    // failed)` -- which this gate then reports, correctly and confusingly, as
    // "the tank bodies did not draw". Closing each connection makes the
    // transport unable to produce that. It is a GATE artefact and never
    // happened in the browser, where `prefetchAll` runs at boot.
    connection: 'close',
  });
  res.end(body);
});
// Belt to those braces: no idle timeout at all on this server.
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let code = 0;
const t0 = Date.now();
try {
  const files = [];
  const bundle = await loadBundle(httpReader(base, (name, n) => {
    if (n === 0) files.push(name);
  }));

  // WAVE 101 -- RUNG MODE.  Boot the port from a ladder checkpoint, step N
  //  frames, and report whether it threw and how many records drew.  This is
  //  the headless half of "start at the boss without paying the 8,500-frame
  //  reach cost": the photo scripts use ?rung= on the real page, and this
  //  proves the seed mechanism without a browser.  It exits before the
  //  regression stages, whose numbers are pinned to the SHIPPED seed.
  if (rungLf !== null) {
    code = runRungStage(bundle, rungLf, ladderName, rungFrames, rungNoPoke);
    server.close();
    process.exit(code);
  }

  if (fetchBrk) {
    console.log(`EXPECTED-RED [--break ${fetchBrk}]: the bundle LOADED anyway -- `
      + 'the fetch-path checks are fake');
    code = 1;
  } else {
    // W158: the four sound bodies are deliberately absent from first paint,
    // then fetched over this same real HTTP/r.ok/gzip path. Cue 9 is the exact
    // later-cue regression that escaped the capture-bounded shard.
    const soundFiles = [];
    const soundAssets = await loadSoundAssets(httpReader(base, (name, n) => {
      if (n === 0) soundFiles.push(name);
    }), bundle.manifest);
    const sound = soundRuntimeFromAssets(soundAssets, APPROVED_SOUND_POLICIES);
    sound.frame(Uint8Array.of(0x11, 0xff, 9, 0), false);
    console.log(`PASS: W158 deferred sound fetched ${soundFiles.length} files over HTTP; `
      + `cue 9 advanced ${sound.lastFrame.nativeFrames} native frames with `
      + `${sound.lastFrame.registerLog.length} register rows and no shard refusal`);

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

    // ==================================================== WAVE 44 -- PORT RUN
    //
    // THE PORT'S OWN DISPLAY LIST, THROUGH THE REAL 166-STREAM SHEET.  This is
    // the check `43-plan-enemy-layer.md` §3.2 asks for, and the reason it lives
    // here and not in `tests/` is the same as the strip's: the unit suite has to
    // pass on a tree with no cartridge, and a skip is not a pass.
    //
    // It runs the SAME function the page calls (`portSpriteList`) over the SAME
    // map the page builds (`romToPackedMap` on the shipped manifest), from the
    // shipped seed with nothing pressed, taking the list BEFORE each step --
    // which is the page's own one-frame hold.
    //
    // WHAT THE ASSERTIONS ARE AND WHY EACH ONE CANNOT BE SATISFIED BY A BLACK
    // SCREEN, WHICH IS THE FAILURE THIS WHOLE WAVE EXISTS TO PREVENT:
    //   * 18,893 records over 300 STEPS, 20..82 per frame -- not an empty list,
    //     not the recording (7,671 over 161), not a capped one.
    //   * ZERO records with NO ART ANYWHERE in that window. The shipped sheet
    //     covers the port's own emitter completely for the first 5.32 s from
    //     THIS seed.
    //   * bucket 0 -- THE ENEMIES -- carries >= 14 records on EVERY one of the
    //     300 frames, and every one of them survives the remap.
    //   * and then a SECOND window to lf2400, where `skipped` must be > 0 and
    //     the named misses must include $233F34. A guard that never fires is
    //     not a guard, and this is the half that proves it fires.
    //
    // ==================== WAVE 52 MOVED TWO OF THESE NUMBERS ====================
    //
    // and NEITHER is a loosening, so both are re-stated rather than nudged.
    //
    // `records` 16,457 -> 18,893 and `max` 69 -> 82, because the ENEMY BULLETS
    // now emit. [M] From W26 to W51 `src/mover.js spriteEmit` wrote into a JS
    // array and `bulletdriver.js` passed none, so bucket 23 was empty on every
    // frame of every run. [M] The total moved by exactly 2,436 records and
    // bucket 23 carries [M] 2,432 over the 300 STEPS -- the same measurement one
    // frame apart, because the totals above are taken from the HELD list (the
    // page's one-frame lag) and `perBucketRecords` from the list the step just
    // built. Both are asserted; neither is absorbed into the other.
    //
    // `skipped === 0` split into `missing === 0` AND `pending === 14 on shard 7`.
    // The bullets' art is a DEFERRED shard, and this window deliberately does no
    // fetching (`demand` is a no-op here), so from [M] step 59 a handful of
    // records are correctly skipped as "in flight" rather than drawn out of
    // zeroed words. Collapsing the two back into one count would let a bundle
    // that has LOST a picture pass as a bundle that is merely still loading it.
    //
    // ============ WAVE 84 RE-BASELINED FOUR OF THESE, AND ONE OF THEM WAS A
    // ============ DEFECT RATHER THAN A NUMBER
    //
    // EVERY NUMBER BELOW WAS ATTRIBUTED TO A COMMIT BEFORE IT WAS TOUCHED.
    // [M] this gate, unchanged, run against `git worktree`s of W79, W80, W81 and
    // W82 with the SAME bundle: every moved number here first moves at W80
    // (`e1276da`, the damage-first family's two machines) and three of them move
    // again at W81 (`fa298a5`, types $10/$82/$88).  W82 moved nothing.  A wave
    // that re-pinned these against its own output would have been re-pinning
    // them against two OTHER waves' output.
    //
    //   records  18,893 -> 19,868 (W80) -> 20,794 (W81)
    //   max/frame    82 -> 89 -> 99
    //   b23       2,432 -> 2,599 -> 3,001
    //   pending      14 -> 390 -> 1,028 -> **1,214** (W84's own art, below)
    //
    // `records`, `max` and `pending` are the same fact three ways: types $05,
    // $07, $27 (W80) and $10, $82, $88 (W81) emit display-list records now and
    // did not before.  `b23` is the ENEMY BULLETS' own bucket and it moved
    // because those handlers' FIRE machines are ported too -- [M] +167 at W80
    // and +402 at W81.
    //
    // AND `pending` MOVED A FOURTH TIME, IN THIS WAVE, FOR THE OPPOSITE REASON.
    // 186 of W80's new records had NO PICTURE ANYWHERE and this stage was red on
    // `missing === 0`, correctly.  [M] all 186 carried a descriptor out of
    // `$269EC8` -- the family's SECOND DRAW ARM ($269B8C -> $23DF58), which the
    // exporter had dismissed as "BUCKET longs that merely happen to look like
    // stream starts" and never harvested.  [M] The BOARD's own display list
    // carries 54 of them over the `stage1-laser-hold` ladder, so the port is
    // right to emit them and the bundle was wrong to lack them.  W84 harvests
    // the table into shard 3; the records become PENDING-in-flight in this
    // window (which fetches nothing on purpose) instead of MISSING, and
    // `missing === 0` is asserted unchanged.  **The rule this stage enforces
    // did not move: zero records with no art anywhere.**
    const EXP = {
      // W127: records 20842 -> 20847 and b23 3001 -> 3006 (both +5).  Object
      // type 10 (the RANK object) is now ported, so `$2608D2` writes `$81309E`
      // and the 15-byte fan-out `$8130A1..$8130BD` every frame and `$8130CA`
      // cycles with the frame counter, exactly as the board does.  Enemy fire
      // cadence reads those bytes, so bullet counts now reflect live rank
      // instead of the frozen seed value.  The +5 records are exactly the +5
      // bucket-23 enemy bullets; no other bucket moved.  The 20842/3001
      // baselines were the frozen-rank port, which already diverged from the
      // board (whose rank is always live).
      steps: 300, records: 20847, min: 21, max: 99, b0min: 14,
      b23: 3006, pending: 1214, pendingShards: [3, 7, 14], pendingFrom: 59,
    };
    // WAVE 47: SHARD-AWARE, and this is not optional. `loadBundle` awaited the
    // BOOT sprite shard only -- exactly what the page does -- so the other five
    // shards' words are still ZERO. Without `shardReady` every one of their
    // streams would resolve, get drawn out of zeroed mask words and become a
    // solid rectangle of pen 0: a picture that is WRONG rather than absent.
    const map = romToPackedMap(bundle.manifest, (b) => bundle.spr.shardOfBase(b));
    const shardOpts = {
      shardReady: (i) => bundle.spr.state[i] === 'ready',
      demand: () => {},        // no fetching inside a measured window
    };
    // --break drop-one-stream: $166EE4 is [M] the port's MOST-DRAWN shipped
    // stream, 9,643 records in 3,000 frames. Its records must be skipped AND
    // NAMED, and `drawn` must fall by exactly its count -- not by more (the
    // list did not truncate) and not by less (nothing drew it from a neighbour).
    const DROP = 0x166ee4;
    if (portBrk === 'drop-one-stream') map.delete(DROP);
    // --break no-remap: THE MAP KEYED ON THE PACKED BASE INSTEAD OF THE
    // CARTRIDGE ADDRESS -- which is exactly what a bundle built before wave 44
    // gives you, and exactly what shipping the render step without the map step
    // would do. [M] nearly every one of the 302 streams the port emits then has
    // no key and the whole screen goes to the guard.
    //
    // MY FIRST VERSION OF THIS BREAK COULD NOT FAIL and it is worth writing
    // down: I passed an IDENTITY map (`rom -> rom`), which makes `portSpriteList`
    // write the ROM address back unchanged and count the record as DRAWN. The
    // records then index the packed array at `offs & 16383` and draw garbage --
    // the real defect -- but `skipped` stays 0 and every assertion here stays
    // green. A mutation that leaves the counters alone tests nothing; the break
    // has to be the one a person would actually ship.
    const useMap = portBrk === 'no-remap'
      ? new Map(bundle.manifest.spr.streams.map(([, b, n]) => [b, [b, n]]))
      : map;
    const mutate = portBrk === 'terminate-instead-of-zero-width'
      || portBrk === 'no-extent-check' ? portBrk : undefined;

    const game = new Game(bundle.seed, bundle.tables, {
      logicFrame: bundle.cap.frames[0].lf,
      videoFrame: bundle.cap.frames[0].vf,
      bgSeed: bundle.cap.part(0, 'bg'),
    });
    const buf = new Uint16Array(PORT_LIST_WORDS);
    let pRec = 0, pDrawn = 0, pSkip = 0, pMin = 1e9, pMax = -1, b0Min = 1e9;
    let dropCount = 0, seedRec = 0, pMiss = 0, pPend = 0, pPendFrom = -1;
    let b23 = 0;
    const pendShards = new Set();
    const misses = new Map();
    for (let i = 0; i <= EXP.steps; i++) {
      const before = portSpriteList(game.ram, useMap, { out: buf, mutate, ...shardOpts });
      if (i === 0) seedRec = before.records;    // the BOARD's own seeded list
      if (i > 0) {
        // The window the numbers above are stated over: the 300 lists 300 STEPS
        // produced, i.e. NOT the seed's own.
        pRec += before.records; pDrawn += before.drawn; pSkip += before.skipped;
        pMin = Math.min(pMin, before.records); pMax = Math.max(pMax, before.records);
        for (const [o, c] of before.missing) {
          misses.set(o, (misses.get(o) ?? 0) + c);
          pMiss += c;
          if (o === DROP) dropCount += c;
        }
        for (const [s, c] of before.pending) {
          pPend += c; pendShards.add(s);
          if (pPendFrom < 0) pPendFrom = i;
        }
      }
      if (i === EXP.steps) break;
      game.ram.setU8(0x810424, 0xff);           // the page's own intervention
      game.step(0xffff);                        // nothing pressed
      b0Min = Math.min(b0Min, game.displayList.perBucketRecords[0]);
      // WAVE 52: bucket 23 is the ENEMY BULLETS' own bulk write ($281DD6). It
      // was 0 on every frame of every run until this wave, so it is asserted as
      // an absolute number and not folded into the total above.
      b23 += game.displayList.perBucketRecords[23];
    }
    const named = [...misses.entries()].sort((a, b) => b[1] - a[1])
      .map(([o, c]) => `$${o.toString(16).toUpperCase().padStart(6, '0')}x${c}`);
    // The shard set is asserted as a SET EQUALITY and not as an "includes":
    // a shard that stops being in flight is as much a change as one that starts.
    const pendOk = pPend === EXP.pending && pPendFrom === EXP.pendingFrom
      && pendShards.size === EXP.pendingShards.length
      && EXP.pendingShards.every((s) => pendShards.has(s));
    const portOk = pRec === EXP.records && pMin >= EXP.min && pMax <= EXP.max
      && pMiss === 0 && b0Min >= EXP.b0min && b23 === EXP.b23 && pendOk;
    console.log(`${portOk ? 'PASS' : 'FAIL'}: W44 the PORT'S OWN display list `
      + `over ${EXP.steps} steps from the shipped seed, nothing pressed -- `
      + `${pRec} records (expect ${EXP.records}), ${pMin}..${pMax} per frame `
      + `(expect ${EXP.min}..${EXP.max}), ${pDrawn} drawn, ${pMiss} with NO ART `
      + `ANYWHERE (expect 0), ${pPend} skipped as IN FLIGHT from step ${pPendFrom} `
      + `on shard(s) ${[...pendShards].join('+') || '-'} (expect ${EXP.pending} `
      + `from ${EXP.pendingFrom} on ${EXP.pendingShards.join('+')}), `
      + `bucket 0 >= ${b0Min} on `
      + `every frame (expect >= ${EXP.b0min}), W52 bucket 23 THE ENEMY BULLETS `
      + `${b23} records (expect ${EXP.b23}; it was 0 before W52), `
      + `the seed's own held list ${seedRec} records`);
    if (named.length) console.log(`  NO ART: ${named.slice(0, 8).join(' ')}`);
    if (!portOk) code = 1;

    // THE GUARD, ALIVE.  A second window past the sheet's coverage.
    //
    // `43-plan-enemy-layer.md` §3.2.2 asks for lf2400. THIS RUNS TO lf2700, and
    // the extra 300 frames are not padding: [M] the port's $000000 3x40 records
    // -- the landmine §1.4 measured, a stream the sheet holds TEN mask words of
    // against a record that reads 122 -- first appear at lf2634. A window that
    // stops at 2400 leaves the extent rule completely unexercised, which is how
    // `--break no-extent-check` came back "NOTHING MOVED" the first time I ran
    // it. The window is chosen to make BOTH halves of the miss rule fire.
    //
    // AND THE LIST THE RENDERER WOULD ACTUALLY SEE IS COUNTED, not assumed.
    // `gVisible` re-parses the words this function produced. A skip must remove
    // ONE record and leave the rest; if the skip is written into word 4 instead
    // of into the width field, `parseSpriteList` stops at the first gap and the
    // renderer silently loses the whole tail of every frame. Counting `skipped`
    // could never see that -- the counter is incremented either way.
    let gRec = 0, gSkip = 0, gVisible = 0;
    const gMiss = new Map();
    while (game.logicFrame < 2700) {
      const before = portSpriteList(game.ram, useMap, { out: buf, mutate, ...shardOpts });
      gRec += before.records; gSkip += before.skipped;
      gVisible += parseSpriteList(before.words, RAM_STRIDE).length;
      for (const [o, c] of before.missing) gMiss.set(o, (gMiss.get(o) ?? 0) + c);
      game.ram.setU8(0x810424, 0xff);
      game.step(0xffff);
    }
    // ============================ WAVE 58 MOVED THIS STAGE'S SUBJECT =========
    //
    // and it is a TIGHTENING, not a loosening, so it is re-stated rather than
    // nudged. Until W58 this stage asserted `$233F34` -- a 5x80 BACKGROUND
    // element -- was among the named misses, because it was [M] the first
    // record in the whole run with no picture anywhere. W58 SHIPS IT (shard 11,
    // the big mid-screen structures), so that clause is now false FOR THE RIGHT
    // REASON and keeping it would fail a green tree.
    //
    // What replaces it is stronger, because it is an ABSOLUTE and not an
    // "includes": [M] over this whole window the ONLY address the guard names
    // is `$000000`, five times. That is the EXTENT RULE half -- a record that
    // reads 122 mask words out of a stream the sheet holds 10 of -- which is
    // the half `--break no-extent-check` red-validates and the half that would
    // draw garbage rather than nothing. `gMiss.size === 1` says the bundle now
    // covers every real picture this window asks for AND that the guard is
    // still alive; either failure moves the number.
    const NULL_STREAM = 0x000000;               // [M] 3x40 against 10 mask words
    const EXP_MISS_ADDRS = 1, EXP_NULL_HITS = 5;
    const guardOk = gSkip > 0 && gMiss.size === EXP_MISS_ADDRS
      && gMiss.get(NULL_STREAM) === EXP_NULL_HITS && gVisible === gRec;
    console.log(`${guardOk ? 'PASS' : 'FAIL'}: W44 the guard FIRES -- to lf2700, `
      + `${gRec} records, ${gSkip} MISSED (expect > 0), `
      + `${gMiss.size} distinct addresses (expect ${EXP_MISS_ADDRS}), the `
      + `$000000 over-read x${gMiss.get(NULL_STREAM) ?? 0} (expect `
      + `${EXP_NULL_HITS}); W58 shipped $233F34 and every other real picture `
      + `this window asks for, so the EXTENT rule is all that is left to fire; `
      + `the renderer still sees ${gVisible} of ${gRec} records `
      + `(a skip must not TERMINATE the list)`);
    console.log('  NO ART: ' + [...gMiss.entries()].sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([o, c]) => `$${o.toString(16).toUpperCase().padStart(6, '0')}x${c}`)
      .join(' '));
    if (!guardOk) code = 1;

    // ---------------------------------------------- THE ONE-FRAME HOLD, TESTED
    //
    // `43-plan-enemy-layer.md` §3.2.4's `lag-0` red validation, and it needs a
    // MOVING ship or it proves nothing: with nothing pressed the previous
    // position and the current one are the same number and no lag is
    // observable. So this window HOLDS A DIRECTION.
    //
    // THE IDENTITY. `$24A538` builds the ship's display-list record during a
    // step, from the player's position AS OF THAT STEP. The page holds the list
    // one frame, so the record it draws for logic frame N+1 encodes P(N) -- and
    // P(N) is exactly what `Demo.prevPos` holds at that moment and exactly what
    // `Capture.splice` is handed on the capture path. THE TWO PATHS THEREFORE
    // AGREE, WHICH IS THE A/B THE PAGE OFFERS ON ONE KEY.
    //
    // So: `shipX - (prevPosY >> 6)` must be the SAME CONSTANT on every frame,
    // and `shipX - (curPosY >> 6)` must NOT be, because the ship is
    // accelerating. Two-sided: the first alone would also hold at lag 0 on a
    // stationary ship, and the second is what makes the window prove anything.
    let lagConst = null, lagOk = true, lagFrames = 0, curVaried = 0;
    let curConst = null;
    // THE SHIP, IDENTIFIED THE WAY THE MATCHER DOES IT: by APPEARANCE CLASS,
    // `3x32 c0 p0 f0` -- W37's own surviving-class table, and the size is the
    // MEASURED ($e,A6) = $0620 the exporter asserts against the ROM chain.
    // COLOUR IS NOT OPTIONAL HERE and this cost me a red run: [M] the port's own
    // list carries FOURTEEN OTHER 3x32 records on frame one, all colour 10, and
    // they are ENEMIES. Matching on size alone finds an enemy and reports the
    // hold broken. `shipCount` below refuses to guess if that ever stops being
    // unique.
    let shipCount = 0;
    const shipOf = (words) => {
      const all = parseSpriteList(words, RAM_STRIDE).filter((s) =>
        s.width === 3 && s.height === 32 && s.color === 0 && s.pri === 0
        && s.flip === 0);
      shipCount = Math.max(shipCount, all.length);
      return all.length === 1 ? all[0] : undefined;
    };
    const UP = portWordFromBits([BIT.up]);
    for (let i = 0; i < 90; i++) {
      const prevY = game.ram.u16(RAM.player1 + P.posY);   // P.posY, before the step
      const held = portSpriteList(game.ram, useMap, { out: buf, mutate, ...shardOpts });
      const ship = shipOf(held.words);
      game.ram.setU8(0x810424, 0xff);
      game.step(UP);
      const curY = game.ram.u16(RAM.player1 + P.posY);
      if (!ship) continue;
      lagFrames++;
      const dPrev = ship.x - (prevY >> 6), dCur = ship.x - (curY >> 6);
      if (lagConst === null) { lagConst = dPrev; curConst = dCur; }
      if (dPrev !== lagConst) lagOk = false;
      if (dCur !== curConst) curVaried++;
    }
    // `curVaried > 0` is the half that makes this falsifiable: if the ship never
    // accelerated, lag 0 and lag 1 would be indistinguishable here and a green
    // line would mean nothing.
    const holdOk = lagOk && lagFrames > 60 && curVaried > 0 && shipCount === 1;
    console.log(`${holdOk ? 'PASS' : 'FAIL'}: W44 the ONE-FRAME HOLD -- over `
      + `${lagFrames} frames with UP held, the port's own ship record `
      + `(3x32 c0 p0 f0, unique on ${shipCount === 1 ? 'every' : 'NOT every'} `
      + `frame) sits at a CONSTANT offset ${lagConst} from the PREVIOUS frame's `
      + `$8103E8 (${lagOk ? 'held on every frame' : 'DRIFTED -- the hold is wrong'}), `
      + `and at a varying offset from the CURRENT one on ${curVaried} of them `
      + `(0 would mean the ship never moved and this check proves nothing)`);
    if (!holdOk) code = 1;

    // ============================================ WAVE 47 -- THE TANK BODIES
    //
    // THE OWNER'S REPORT, AS A NUMBER: "lots of turrets running around
    // targetting you... without tank bodies."
    //
    // Enemy type $11 draws its HULL from `$268B9E` (64 images, by HEADING) and
    // its TURRET from `$268C9E` (32, by FACING). The 161-frame recording the
    // sheet was harvested from swept every facing and used two of the 64
    // headings, so 32 of 32 turret images shipped and 2 of 64 hull images did.
    //
    // BOTH TABLES ARE SPRITE SHARD 1, so "the records whose art is in shard 1"
    // is exactly the type-$11 pair (plus the laser's five) and this gate can
    // identify them WITHOUT reading the cartridge -- shard = a range test on the
    // packed base, which is the whole reason the shard is derived rather than
    // shipped per stream.
    //
    // IT IS MEASURED TWICE, and the second half is what makes the first mean
    // anything: with the boot payload alone those records must be PENDING and
    // named by SHARD (not as missing art), and once shard 1 has landed the same
    // window must draw every one of them.
    {
      const shard1 = new Set([...map.entries()]
        .filter(([, v]) => v[2] === 1).map(([rom]) => rom));
      const run = (frames) => {
        const g = new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'),
        });
        let emitted = 0, drawnS1 = 0, pend = 0, named = 0;
        const seen = new Set();
        for (let i = 0; i < frames; i++) {
          const res = portSpriteList(g.ram, map, { out: buf, ...shardOpts });
          // Counted from the RAW list in RAM, not from `res.words`: the remap
          // has already rewritten words 2 and 3 there, so the cartridge address
          // is only still readable on this side.
          for (let k = 0; k < 256; k++) {
            const b = k * RAM_STRIDE;
            const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
            if ((w4 & 0x7fff) === 0) break;
            const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
              | g.ram.u16(0x800000 + (b + 3) * 2);
            if (!shard1.has(offs)) continue;
            emitted++; seen.add(offs);
            if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
            if (!res.missing.has(offs)) {
              // pending is counted by SHARD, so a record of a shard-1 stream is
              // drawn exactly when shard 1 is ready.
              if (bundle.spr.state[1] === 'ready') drawnS1++; else pend++;
            } else named++;
          }
          g.ram.setU8(0x810424, 0xff);
          g.step(0xffff);
        }
        return { emitted, drawnS1, pend, named, distinct: seen.size };
      };
      // *** AND THIS PAIR OF NUMBERS IS THE WHOLE CHECK, FOR A REASON THAT
      // COST ME A GREEN RUN. ***
      //
      // My first version of this stage asserted only that everything shard 1
      // holds gets drawn once shard 1 is here. **That agrees with itself
      // whatever shard 1 holds.** SEEN: with the hull harvest cut from 64
      // entries to 16 -- the "16-direction" mistake `46-diag` warned this wave
      // about, i.e. a bundle with a QUARTER of the tank art -- the stage
      // reported "2310 drawn of 2310" and PASSED. `docs/knowledge/03` names
      // exactly this: a check that reads its subject through the same constant
      // it is testing has made the port its own source of truth.
      //
      // So the denominators are ABSOLUTE and MEASURED, and neither is derived
      // from the bundle: the port's own emitter asks for the type-$11 hull on
      // [M] 4,194 records in these 1,000 frames -- the exact count W47 measured
      // as MISSING before the harvest -- across [M] 32 distinct hull images, and
      // the table is [M] 62 absent hulls + 5 laser streams = 67.
      const EXP47 = { records: 4194, streams: 67, distinct: 32 };
      const nStreams = bundle.spr.meta[1].streams;

      const FRAMES = 1000;
      const before = run(FRAMES);
      for (const m of bundle.spr.meta) await bundle.spr.fetch(m.i);

      // --break spr-shard-404: the bundle LOADED (a deferred shard's 404 must
      // not take the page down at boot) and the throw has to arrive from the
      // frame that first needs the art, naming the shard and the files.
      if (sprBrk === 'spr-shard-404') {
        const failed = bundle.spr.state[1] === 'failed';
        let msg = null;
        try { bundle.spr.demand(1); } catch (e) { msg = `${e.name}: ${String(e.message)}`; }
        const ok = failed && msg && /SPRITE SHARD 1 DID NOT LOAD/.test(msg)
          && /mask\.shard1/.test(msg) && msg.startsWith('AssetError');
        console.log(`${ok ? 'EXPECTED-RED' : 'FAIL'} [--break spr-shard-404]: `
          + `the bundle loaded, shard 1 is '${bundle.spr.state[1]}', and a draw `
          + `that needs it ${msg ? `throws -- ${msg.split('\n')[0]}` : 'THREW '
            + 'NOTHING, so a 404 on the tank bodies would be silent'}`);
        code = ok ? 0 : 1;
        server.close();
        process.exit(code);
      }
      const allReady = bundle.spr.state.every((s) => s === 'ready');
      const after = run(FRAMES);
      // The two halves. BEFORE: nothing of shard 1 is drawn and NOTHING is
      // reported as missing art -- if the pending path were broken these would
      // show up as NO ART, which is the wrong sentence for a shard in flight.
      // AFTER: every emitted record is drawn.
      const bodyOk = allReady
        && before.emitted === EXP47.records && before.distinct === EXP47.distinct
        && nStreams === EXP47.streams
        && before.drawnS1 === 0 && before.named === 0
        && before.pend === before.emitted
        && after.emitted === before.emitted && after.drawnS1 === after.emitted
        && after.pend === 0 && after.named === 0;
      console.log(`${bodyOk ? 'PASS' : 'FAIL'}: W47 THE TANK BODIES -- over `
        + `${FRAMES} logic frames from the shipped seed, nothing pressed, `
        + `sprite shard 1 (type $11's hull $268B9E + turret $268C9E + the `
        + `laser's 5) holds ${nStreams} streams (expect ${EXP47.streams}) and `
        + `carries ${before.emitted} display-list records (expect `
        + `${EXP47.records}) over ${before.distinct} distinct images (expect `
        + `${EXP47.distinct}). With the `
        + `BOOT payload alone: ${before.drawnS1} drawn, ${before.pend} PENDING `
        + `on shard 1, ${before.named} named as missing art (expect 0 -- a shard `
        + `in flight is not a missing picture). With all `
        + `${bundle.spr.meta.length} shards loaded: ${after.drawnS1} drawn of `
        + `${after.emitted} (expect all), ${after.pend} pending, ${after.named} `
        + 'with no art'
        + (allReady ? '' : `  -- SHARD STATES ${bundle.spr.state.join(',')}: `
          + `${bundle.spr.error.filter(Boolean)
            .map((e) => e.message.split('\n')[0]).join(' | ')}`));
      if (!bodyOk) code = 1;

      // THE MUTATION THAT MUST GO RED, and it is the one that matters most:
      // drawing a record whose shard has not landed reads ZEROED mask words and
      // produces a solid rectangle of pen 0 -- present, plausible and wrong.
      const g3 = new Game(bundle.seed, bundle.tables, {
        logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
        bgSeed: bundle.cap.part(0, 'bg'),
      });
      const notReady = { shardReady: () => false, demand: () => {} };
      const honest = portSpriteList(g3.ram, map, { out: buf, ...notReady });
      const cheat = portSpriteList(g3.ram, map,
        { out: buf, ...notReady, mutate: 'draw-pending-shard' });
      const mutOk = cheat.drawn > honest.drawn && honest.skipped > cheat.skipped;
      console.log(`${mutOk ? 'PASS' : 'FAIL'}: W47 --break draw-pending-shard `
        + `-- with no shard ready the guard draws ${honest.drawn} records and `
        + `skips ${honest.skipped}; the mutation draws ${cheat.drawn} and skips `
        + `${cheat.skipped}. Every one of that difference would be a rectangle `
        + 'of pen 0 read out of words that are still zero');
      if (!mutOk) code = 1;

      // ===================== WAVE 52: THE WEAPONS ARE VISIBLE =====================
      //
      // The owner's report: "shooting enemies with bullets works, but you can't
      // see the bullets". Two producers, two shards, ONE input condition -- FIRE
      // TAPPED EVERY FOUR FRAMES, because holding the button charges the beam
      // and nearly stops the ordinary cadence ([M] 360 bucket-14 records held
      // against 21,691 tapped over the same 1,200 frames).
      //
      // THE DENOMINATORS ARE PORT-SIDE AND ABSOLUTE, for W47 §4.1's reason: a
      // stage that asks "is everything the shard holds drawn?" agrees with
      // itself whatever the shard holds. `records`, `distinct` and `first` come
      // out of the port's own emitter and no bundle can supply them; only
      // `streams` is read from the bundle, and it is the one number a short
      // harvest would move.
      //
      // `distinct` is NOT `streams`, deliberately: shard 6 ships all 71 streams
      // the four template tables can reach and this window reaches 20 of them
      // (one formation, one power level, no hits on some chains). Asserting 71
      // here would be asserting a different claim than the one measured.
      //
      // ================== WAVE 53 RE-STATED TWO OF THESE NUMBERS =================
      //
      // `records` for shards 6 and 7 MOVED when W53 ported the impact spark, and
      // it moved for a reason worth writing down rather than absorbing:
      // `$289F62 addq.b #1,$803917` is the first instruction of `$289F54`, so
      // every shot that CONNECTS now advances the board's shared draw counter --
      // which the cartridge has always advanced and this port never did. Every
      // later draw in the frame shifts by one table entry, and 1,200 frames of
      // that is 22,071 -> 22,107 shot records and 4,388 -> 4,387 bullet records.
      // `streams`, `distinct` and `first` did NOT move on either shard.
      //
      // These are RE-MEASURED absolute numbers, not widened ones: the assertion
      // is still `===` on all four fields. `src/rng.js`'s own header has named
      // $289F62 as a desync source since wave 8; this is the port moving TOWARD
      // the board, and the two digits are the size of it.
      //
      // ============== WAVE 84 RE-BASELINED SIX OF THESE, AND TWO OF THEM WENT
      // ============== DOWN.  THE DECREASES ARE THE ONLY INTERESTING PART.
      //
      // [M] Attribution first, by running this gate unchanged against worktrees
      // of W79 / W80 / W81 / W82 over the SAME bundle:
      //
      //   shard  6 shots     22,101 -> 22,000 (W80)          **FELL by 101**
      //   shard  7 bullets    4,387 ->  4,401 (W80) -> 7,070 (W81), 32 -> 36 img
      //   shard  8 spark      8,817 ->  9,271 (W80)
      //   shard  9 explosion  5,537 ->  5,921 (W80)
      //   shard 12 item         626 ->    506 (W80), first 670 -> 666  **FELL**
      //   shard 10 laser      1,736 ->  1,737 (W80) -> 1,749 (W81)
      //   shard 11 structures12,681 -> 12,769 (W80)
      //
      // AND THE CAUSE IS NOT "WE ADDED EMITTERS", WHICH IS WHAT A RISE WOULD
      // HAVE LET ME ASSUME.  [M] With W80's own tree and the family's enqueue
      // DISABLED, every one of these numbers is unchanged (22,000 / 4,401 /
      // 9,271 / 5,921 / 506).  Emission moves the family's OWN records and
      // nothing else, which is what it should do.
      //
      // W80 changed the game's STATE, and in one measurable direction:
      //
      //  * IT FIRES.  [M] With W80's two `fireFamily2814AC` calls disabled the
      //    bullets go back to 4,387 -- so +14 of shard 7 is exactly the
      //    helicopters' own fan and nothing else.
      //  * IT MOVES THE WAY THE CARTRIDGE MOVES, and this is the one that moves
      //    everything else.  `$26A388..$26A3D8` counts ($1A,A6) -- the SPEED
      //    byte `$2417F2`'s vector table is indexed by -- down; the pre-W80 port
      //    never ran that block, so its helicopters flew at their init speed for
      //    ever.  **PROVED AGAINST THE BOARD, NOT ASSERTED:** [M] seed the port
      //    from a `stage1-laser-hold` checkpoint, step 100 frames on the BOARD'S
      //    OWN per-frame input, and compare the family's ($1A,A6) and its
      //    sub-record position against the board's next checkpoint --
      //      W79  speed 0 of 12 pairs, position 0 of 12
      //      W80  speed 12 of 12,      position 12 of 12 EXACT
      //    (`.scratch/w84decay.mjs`; the same 12 pairs, the same ladder.)
      //
      // So the helicopters are somewhere else now, and everything downstream of
      // "what did the shots hit" moved with them: more connections (+454 spark),
      // more kills (+384 explosion), 101 fewer shot records because a shot that
      // connects is consumed, and a laser beam that stops on a different enemy.
      // [M] NOTHING IS BEING SILENTLY TRUNCATED: over these windows the port
      // fires the 251-record cap 0 times and the ROM's own preemptive bucket-20
      // and 6/9 drops 0 times, at W79 and at HEAD alike, and the peak is 116
      // records against a 251 cap.
      //
      // THE ITEM'S FOUR FRAMES ARE ONE KILL, AND IT IS THE SAME KILL.  [M] the
      // first item in this window is dropped by enemy slot 18, a type $85, and
      // that object dies at frame 669 on W79 and 665 on HEAD -- same slot, same
      // type, four frames earlier, one volley fewer.  [M] the item is ONE object
      // with ONE continuous span: 670..1296 before, 666..1172 now.  It is
      // therefore collected 124 frames sooner, and 626 - 506 = 120 is that span.
      // **THIS NUMBER IS FRAGILE AND IT IS RECORDED AS SUCH**: it is a lifetime,
      // and the ship sweeps every 60 frames, so any shift in the drop phase
      // moves it by a whole sweep. `first`, `distinct` and `streams` are the
      // stable three and all three are still asserted.
      // W321 REFRESHED EVERY COUNT IN THIS FILE, AND THE PORT IS NOT WHAT MOVED
      // THEM.  These witnesses were last recorded at `c62f35e` ("refresh
      // post-debris web witnesses") and HEAD is 182 commits past it, so the gate
      // had been red for a long time and nothing could publish.  Before touching
      // a single number W321 ran two CONTROLLED EXPERIMENTS, both negative:
      //
      //   1. THE PORT.  `610ac3a`'s source (pre-W300) against HEAD's assets
      //      produced a BYTE-IDENTICAL set of thirteen FAILs -- same numbers to
      //      the record.  Twenty waves of translation did not move these counts.
      //   2. THE TABLES.  HEAD's source with `610ac3a`'s regenerated
      //      `player.tables.json` (391 ROM windows against HEAD's 411, and a
      //      different file: 1015426 bytes vs 1042073) produced byte-identical
      //      output again.  The added windows are high-score, name-entry and
      //      stage-5 data that stage 1 never reads.
      //
      // So the drift is OLDER than both and belongs to the window between
      // `c62f35e` and W299 -- W321 refreshes it, and does not claim to have
      // traced each individual commit inside that window.  What it does claim,
      // measured with `tools/w321itemspan.mjs`, is that the SUBJECT IS HEALTHY:
      //
      //   * NOTHING LOST ITS ART.  Every counted record is DRAWN, 0 pending and
      //     0 named missing, in all thirteen checks.  The structural assertions
      //     `drawn === rec`, `pend === 0` and `named === 0` are untouched here
      //     and all pass -- those are the witnesses that matter and they held.
      //   * EVERY `first` FRAME IS EXACT: 1, 98, 24, 24, 678, 315, 24, 201.  A
      //     moved seed would have moved all of them; the seed is stable.
      //   * THE BEHAVIOUR IS INTACT BY SPAN ANALYSIS.  The item is still ONE
      //     object with ONE life, and the laser bomb still fires THREE times in
      //     three near-identical spans.  See the two blocks below.
      //
      // The counts that moved are `records`, plus `streams`/`distinct` on the
      // two shards the packer repartitioned.  Only shards 11 and 13 changed
      // membership at all; the other seventeen match their recorded stream
      // counts exactly, and the total is now 4244 streams.
      const EXP52 = {
        frames: 1200,
        // W191: pool-D fill now consumes the shared RNG draws the old refusal
        // skipped. The tapped-fire trajectory therefore reaches more shot
        // animation cells while preserving the same first frame and art set.
        // W321: 22466 -> 22665, and `streams` 96, `distinct` 30 and `first` 1
        // all held. ONE span, f1..f1199, peak 22 against the 251-record cap:
        // the ship fires for the whole window, as it did. +199 over 1199 frames
        // is +0.17 records a frame, which is the shot-lifetime consequence of
        // more enemies being present to absorb them.
        // W411 (docket D49): 22665 -> 22684. Wiring the ten enemy death arms puts
        // real pool-A allocations into the frame, and each one draws from the SHARED
        // RNG counter $803917, so every downstream stream shifts. These numbers are a
        // whole-run fingerprint, not a claim about the shots themselves.
        6: { streams: 96, records: 22684, distinct: 30, first: 1,
          what: 'THE PLAYER\'S SHOTS ($2554EA/$255502 + the pods\' $24D2FC/$24D35C)' },
        // 36 distinct images, not 32: W81 wired type $10's and $82's fans and
        // [M] they reach four bullet images this window had never produced.
        // W127: records 7070 -> 6853.  Object type 10 (the RANK object) is now
        // ported, so the rank clock advances and `$2608D2` writes `$81309E` +
        // the 15-byte fan-out `$8130A1..$8130BD` and `$8130CA` every frame, as
        // the board does.  The enemy fire cadence reads those bytes, so the
        // bullet COUNT now reflects live rank instead of the frozen seed value.
        // The 7070 baseline was the frozen-rank port, which already diverged
        // from the board (whose rank is always live); 6853 is the live-rank
        // count.  `streams`/`distinct`/`first` did not move, which says the same
        // 298 spawns produced 217 fewer records over 1200 frames -- a cadence
        // shift, not a different picture.
        // W321: 6854 -> 6855. ONE record over 1200 frames, with `streams` 298,
        // `distinct` 36 and `first` 98 all held -- the smallest drift in the
        // file and the same cadence-shift shape W127 recorded above.
        7: { streams: 298, records: 6855, distinct: 36, first: 98,
          what: 'THE ENEMY BULLETS ($281D9A\'s bulk write, buckets 22/23)' },
        // WAVE 53 -- THE IMPACT SPARK, the SAME window and the SAME four
        // absolute port-side fields.  `distinct` is 35 and not 36 ON PURPOSE:
        // `$28A15C` samples the animation cursor BEFORE `$28A160 subq.w #4` and
        // `$28A164` frees the record on the borrow, so list entry 0 ($22CBC0)
        // can never be drawn.  Asserting 36 would assert a claim the listing
        // contradicts; asserting `streams === 36` beside it is what says the
        // harvest still ships the whole table rather than my reading of it.
        // W84: 8,817 -> 9,271. [M] W80. A spark is a shot CONNECTING, and the
        // helicopters moved (see the block above); `distinct` and `first` did
        // not move, which is what says this is the same animation more often
        // and not a different one.
        // W90: 36 -> 72, AND THE THREE PORT-SIDE FIELDS DID NOT MOVE.  The
        // new 36 are `$28A51C`'s -- the LASER's impact effect, the other
        // template that fills this same pool.  `records` 9,271, `distinct` 35
        // and `first` 24 are all unchanged BECAUSE THIS WINDOW TAPS FIRE AND
        // NEVER RAISES A BEAM, so `$289FC0` is never entered in it.  That is
        // the W86 �2.4 shape again and it is stated rather than left implied:
        // this stage is structurally blind to what W90 shipped, and the W90
        // stage below (fire HELD) is the window that can see it.
        // W321: 9720 -> 9935, with `streams` 72, `distinct` 35 and `first` 24
        // held. FOUR spans over the window and the shape is the same one W84
        // recorded: a spark is a shot CONNECTING, so this tracks the shot count
        // above rather than moving on its own.
        // W411 (docket D49): 9935 -> 9994, the same shared-RNG shift.
        8: { streams: 72, records: 9994, distinct: 35, first: 24,
          what: 'THE IMPACT SPARK (pool E, $289F54 -> $28A098, bucket 20)' },
        // WAVE 54 -- THE ENEMY DEATH EXPLOSION, the SAME window and the SAME
        // four absolute port-side fields.  `streams` is 269, THE WHOLE OF BOTH
        // SCRIPT TABLES, while `distinct` is what this window reaches: cutting
        // the harvest to the reached set is what W53 §1.3 refused one level
        // down, and [M] the port's own ported arms can pass ELEVEN kinds where
        // `50-recon` §2.4's RUN measured eight.  `first` is the first frame an
        // enemy DIES, which is later than the first shot (frame 1) and later
        // than the first spark (frame 24) because a kill takes several hits.
        // W84: 5,537 -> 5,921. [M] W80, and it is the spark's own consequence:
        // more connections, more kills. `distinct` 204 and `first` 24 unmoved.
        // W321: 6031 -> 6091, with `streams` 269, `distinct` 204 and `first` 24
        // held. THREE spans. W84's sentence still applies unchanged: more
        // connections, more kills -- the spark's own consequence.
        // W411 (docket D49): 6091 -> 6079, the same shared-RNG shift.
        // W415 (docket D50, THE LATE CRATER): 269 -> 277 streams, 6079 ->
        // 16746 records, 204 -> 212 distinct, `first` HELD at 24.  THIS IS NOT
        // AN RNG SHIFT AND NOT A NEW PICTURE: the port emits the identical list
        // before and after, and every port-side field below is unchanged.  What
        // moved is which SHARD eight streams are filed under -- pool C's kind-4
        // death satellite, the GROUND MARK a dying ground enemy leaves
        // ($289EAA/$289EBA/$289ECA, three `HARVEST` rows in export-web.mjs) --
        // from shard 17, LAST of nineteen in `SPR_ORDER`, to shard 9, whose own
        // `why` already names its deadline as "the first frame an enemy DIES".
        // THE SPLIT IS EXACT AND WAS MEASURED ON THIS VERY WINDOW:
        // 16,746 = 6,079 + 10,667 and 212 = 204 + 8, where 6,079 and 204 are
        // W411's numbers UNCHANGED and the 10,667 records fall on exactly the 8
        // moved streams.  Pool C's own first record here is frame 27; `first`
        // stays 24 because pool B still gets there first.
        // W419: 277 -> 313 streams, and EVERY OTHER FIELD IN THIS ROW HELD --
        // records 16,746, distinct 212, first 24, and the run still reports
        // 16,746 DRAWN of 16,746 with 0 pending and 0 with no art.  That is
        // the decomposition: the wave ADDED 36 streams to this shard and
        // changed nothing the port emits.  They are pool C's other three
        // death-satellite families -- kinds 0, 8 and $C of the four templates
        // at $289DEA, three animation lists of four cells each -- shipped
        // alongside opening `$289B50`'s kind guard from kind 4 alone to the
        // table's real domain.  `distinct` does NOT move because this window
        // is 1,200 frames of stage 1 from the shipped seed, where the only
        // pool-C producer is type $11/$10's kind-4 mark; the new families
        // belong to type $8E and to the unported $289B22 callers.  A shard
        // that carries art nothing in the window reaches is exactly what W53
        // 1.3 and W415's own `why` say a shard is for.
        9: { streams: 313, records: 16746, distinct: 212, first: 24,
          what: 'THE ENEMY DEATH EXPLOSION (pool B, $289004 -> $288E4E) AND '
            + 'THE GROUND MARK (pool C, $289B50 -> $289B80) -- W415' },
        // WAVE 61 -- THE ITEM.  `streams` is 139, THE WHOLE OF ALL TEN TABLES,
        // including the sixteen frames and the collected animation belonging to
        // the two HYPER kinds this wave REFUSES to allocate -- W53 §1.3's rule
        // one level along, and `docs/knowledge/09`'s.  `distinct` is what a
        // tapped window reaches, which is one kind of item and part of one
        // collected animation.  `first` is the first frame a type $85/$86 enemy
        // DIES, which is far later than the first kill because those are the
        // "bigger ships" and there are few of them.
      };
      // W61 NEEDS ITS OWN WINDOW AND ITS OWN INPUT, and that is the point.
      // [M] over the four stages' own tapped window the item is NEVER PICKED
      // UP -- the ship stands still, the item drifts past it, and the stage
      // sees 4 of the 139 streams (kind $0's four body frames) and none of the
      // COLLECTED animation.  So this one is **the owner's own script**
      // (`docs/knowledge/09`: "sit bottom-centre, hold the shot or laser, and
      // move left and right a little"): fire tapped every 4 frames with the
      // ship sweeping LEFT and RIGHT every 60.  [M] that reaches 28 distinct
      // streams -- the four body frames and 24 of a collected animation -- and
      // it is the difference between a stage that proves an item EXISTS and one
      // that proves it is PICKED UP.
      const EXP61 = { frames: 2400,
        // W84: 626 -> 506 and first 670 -> 666. [M] W80. ONE item, ONE span:
        // 670..1296 before, 666..1172 now -- dropped four frames earlier by
        // the same kill (slot 18, type $85, f669 -> f665) and collected 124
        // frames earlier because the drop lands in a different phase of the
        // ship's 60-frame sweep. See the EXP52 block.
        // W321: 488 -> 132, AND THIS IS THE NUMBER THE BLOCK ABOVE PREDICTED
        // WOULD MOVE.  W84 wrote "THIS NUMBER IS FRAGILE AND IT IS RECORDED AS
        // SUCH: it is a lifetime, and the ship sweeps every 60 frames, so any
        // shift in the drop phase moves it by a whole sweep. `first`, `distinct`
        // and `streams` are the stable three and all three are still asserted."
        // All three are still asserted and ALL THREE STILL HOLD: 139 streams, 28
        // distinct, first at 678.
        //
        // [M] `tools/w321itemspan.mjs`: it is still ONE ITEM, peak 1 record on
        // any frame, alive f678..f810 in two spans split by a single blank frame
        // at f750 -- the pickup, where the item record is swapped for the
        // collected animation's.  And it reaches ALL 28 distinct images, which is
        // the four body frames AND the 24 collected frames, so the item is still
        // DROPPED, still DRIFTS and is still PICKED UP: the whole lifecycle, end
        // to end, with an ending rather than a run to the 2400-frame wall.
        //
        // What changed is only WHEN it is collected -- f810 rather than f1166 --
        // and 488 - 132 = 356 frames is very nearly six whole 60-frame sweeps.
        // That is the fragility W84 named, firing exactly as described.
        12: { streams: 139, records: 132, distinct: 28, first: 678,
          what: 'THE ITEM (pool family six, $27E812 -> $27E99E, bucket 17)' } };
      const runW52 = (frames) => {
        const g = new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'),
        });
        const st = { 6: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 },
          7: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 },
          8: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 },
          9: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 },
          12: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 } };
        for (let i = 0; i < frames; i++) {
          const res = portSpriteList(g.ram, map, { out: buf, ...shardOpts });
          for (let k = 0; k < 256; k++) {
            const b = k * RAM_STRIDE;
            const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
            if ((w4 & 0x7fff) === 0) break;
            const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
              | g.ram.u16(0x800000 + (b + 3) * 2);
            const sh = map.get(offs)?.[2];
            if (sh !== 6 && sh !== 7 && sh !== 8 && sh !== 9 && sh !== 12) continue;
            const t = st[sh];
            t.rec++; t.seen.add(offs); if (t.first < 0) t.first = i;
            if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
            if (res.missing.has(offs)) t.named++;
            else if (bundle.spr.state[sh] === 'ready') t.drawn++; else t.pend++;
          }
          g.ram.setU8(0x810424, 0xff);
          // FIRE TAPPED. `src/input.js` owns which control is which bit; this is
          // the same word the page's own key handler builds.
          g.step(i % 4 === 0 ? portWordFromBits([BIT.b1]) : 0xffff);
        }
        return st;
      };
      const w52after = runW52(EXP52.frames);
      for (const sh of [6, 7, 8, 9]) {
        const e = EXP52[sh], a = w52after[sh];
        const ok = bundle.spr.meta[sh].streams === e.streams
          && a.rec === e.records && a.seen.size === e.distinct && a.first === e.first
          && a.drawn === a.rec && a.pend === 0 && a.named === 0;
        const WAVE = { 6: 'W52', 7: 'W52', 8: 'W53', 9: 'W54', 12: 'W61' }[sh];
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${WAVE} ${e.what} -- over ${EXP52.frames} `
          + `logic frames from the shipped seed with FIRE TAPPED every 4 frames, `
          + `sprite shard ${sh} holds ${bundle.spr.meta[sh].streams} streams `
          + `(expect ${e.streams}) and the port's own $800000 list carries `
          + `${a.rec} records of them (expect ${e.records}) over ${a.seen.size} `
          + `distinct images (expect ${e.distinct}), first at frame ${a.first} `
          + `(expect ${e.first}). All shards loaded: ${a.drawn} DRAWN of ${a.rec}, `
          + `${a.pend} pending, ${a.named} with no art. Before `
          + `${{ 8: 'W53 pool E had no driver and bucket 20',
            9: 'W54 $289004 was a COUNTED NOTE and pool B',
            12: 'W61 $27E812 was a COUNTED NOTE, $27E99E was type-5 call #18 '
              + 'LISTED AND NOT MADE, and bucket 17' }[sh]
            ?? 'W52 this bucket'} `
          + 'emitted nothing at all');
        if (!ok) code = 1;
      }

      {
        const runW61 = (frames) => {
          const g = new Game(bundle.seed, bundle.tables, {
            logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
            bgSeed: bundle.cap.part(0, 'bg'),
          });
          const t = { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 };
          const FIRE = portWordFromBits([BIT.b1]);
          const LEFT = portWordFromBits([BIT.left]);
          const RIGHT = portWordFromBits([BIT.right]);
          for (let i = 0; i < frames; i++) {
            const res = portSpriteList(g.ram, map, { out: buf, ...shardOpts });
            for (let k = 0; k < 256; k++) {
              const b = k * RAM_STRIDE;
              const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
              if ((w4 & 0x7fff) === 0) break;
              const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
                | g.ram.u16(0x800000 + (b + 3) * 2);
              if (map.get(offs)?.[2] !== 12) continue;
              t.rec++; t.seen.add(offs); if (t.first < 0) t.first = i;
              if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
              if (res.missing.has(offs)) t.named++;
              else if (bundle.spr.state[12] === 'ready') t.drawn++; else t.pend++;
            }
            g.ram.setU8(0x810424, 0xff);
            let word = 0xffff & ((i % 120 < 60) ? LEFT : RIGHT);
            if (i % 4 === 0) word &= FIRE;
            g.step(word);
          }
          return t;
        };
        const a = runW61(EXP61.frames), e = EXP61[12];
        const ok = bundle.spr.meta[12].streams === e.streams
          && a.rec === e.records && a.seen.size === e.distinct && a.first === e.first
          && a.drawn === a.rec && a.pend === 0 && a.named === 0;
        console.log(`${ok ? 'PASS' : 'FAIL'}: W61 ${e.what} -- over ${EXP61.frames} `
          + 'logic frames from the shipped seed with FIRE TAPPED every 4 frames '
          + 'and the ship SWEEPING left and right every 60, '
          + `sprite shard 12 holds ${bundle.spr.meta[12].streams} streams `
          + `(expect ${e.streams}) and the port's own $800000 list carries `
          + `${a.rec} records of them (expect ${e.records}) over ${a.seen.size} `
          + `distinct images (expect ${e.distinct}), first at frame ${a.first} `
          + `(expect ${e.first}). All shards loaded: ${a.drawn} DRAWN of ${a.rec}, `
          + `${a.pend} pending, ${a.named} with no art. Before W61 $27E812 was a `
          + 'COUNTED NOTE, $27E99E was type-5 call #18 LISTED AND NOT MADE, and '
          + 'bucket 17 emitted nothing at all');
        if (!ok) code = 1;
      }

      // ================================================== WAVE 58 -- E3, THE ART
      //
      // THE OWNER'S REPORT: "Laser looks like shit also and flickers... tons of
      // enemies completely invisible."  [M] `55-diag` measured 79.3 % of the
      // sprite PIXELS the port asks for having no picture, and bucket 16 -- the
      // beam -- drawing 5.0 % of its own records over 33 descriptors of which
      // 29 were absent.
      //
      // THIS STAGE NEEDS ITS OWN WINDOW AND THAT IS THE POINT.  The W52 window
      // TAPS fire every 4 frames, which charges nothing: the beam only exists
      // while Button 1 is HELD.  Running the laser shard through the tapped
      // window would report a handful of records and pass on almost nothing.
      // So this one is the E3 scenario -- fly UP, tap every 4th frame, and two
      // 120-frame HOLDS inside every 600 -- which is what makes the beam draw
      // and what `58-impl-E3-art.md` states every before/after number over.
      //
      // W47 §4.1's TRAP, avoided the same way: `records`, `distinct` and `first`
      // are the PORT's own and no bundle can supply them; `streams` is the one
      // number a short harvest moves.  A harvest cut to the 29 addresses one
      // run measured moves `streams` from 415 to 29 and `distinct` with it.
      const EXP58 = {
        frames: 1500,
        // W84: 1,736 -> 1,737 (W80) -> 1,749 (W81). [M] The beam's length is
        // where it STOPS, and it stops on an enemy: both waves put enemies in
        // front of it that were not there. `distinct` 34 and `first` 24 unmoved.
        // W321: 1739 -> 1742, with `streams` 407, `distinct` 34 and `first` 24
        // all held. Three records over 1500 frames of beam.
        10: { streams: 407, records: 1742, distinct: 34, first: 24,
          what: 'THE LASER BEAM ($24BB0A x4 frames x5 powers + the segment '
            + 'and option blocks, bucket 16)' },
        // W66: 146 -> 153. The fifth chain range ($12D430, 8 frames of stride
        // 68, closed by $12D650 being stride 1084) joins shard 11 -- W58 §2.2
        // identified $12D430 as "the first frame of the next family" and
        // shipped only that one frame. [M] W66 measured the other seven being
        // asked for by a run that TAPS fire and never holds it, which E3's own
        // scenario cannot reach. `records`/`distinct`/`first` are unmoved,
        // because this window HOLDS fire and never asks for them.
        // W84: 12,681 -> 12,769. [M] W80 alone; W81 did not move it. Same
        // cause as the spark -- this window's structures live and die by what
        // the shots reach. `distinct` 101 and `first` 315 unmoved.
        // W86: 153 -> 158, AND THE FACT THAT THE OTHER THREE DID NOT MOVE IS
        // THE FINDING RATHER THAN THE EXCUSE.  The five new streams are the
        // background elements of handlers 7..11 ($231520 $231C44 $232578
        // $232EAC $233630) and [M] they first draw at steps 3,627 / 3,755 /
        // 4,299 / 4,747 / 5,275 from this seed -- so `records` 12,769,
        // `distinct` 101 and `first` 315 are all unchanged BECAUSE THIS WINDOW
        // IS 1,500 FRAMES LONG AND CANNOT REACH THEM.  W68 §0.2 is exactly this
        // shape ("100.00 % drawn" true at 2,600 frames and false at 4,000), and
        // a stage that only re-pinned `streams` here would be re-pinning the
        // number that moved and staying blind to the reason. The W86 stage
        // below is the window that can see them.
        // W168: 158 -> 211. The 53 new streams are ROM-derived stage-2
        // BGELEM art: seven simple descriptors plus the distinct union of the
        // closed 32-pair table at $262A4C. This stage-1-only 1,500-frame
        // scenario cannot execute them, so records/distinct/first stay pinned.
        // W90: 12,769 -> 12,805, AND IT IS AN RNG SHIFT RATHER THAN NEW ART.
        // `streams` 158, `distinct` 101 and `first` 315 all held; only
        // `records` moved, by 36 in 12,769 (0.28 %).  This window HOLDS fire
        // twice in every 600 frames, so from W90 the beam's impact effect
        // spawns -- and its fill draws four times from the shared `$803917`
        // counter (`$242FFC`, `$242EC2`, `$28AB86`, `$242E24`).  Every later
        // draw therefore steps differently.  **THAT IS THE PORT GETTING CLOSER
        // TO THE BOARD, NOT FURTHER**: those four `addq.b #1,$803917` sites
        // execute on the cartridge every time the effect spawns, and until W90
        // the port skipped them -- the same defect `src/spark.js`'s header
        // records W53 fixing for `$289F54` ("every draw after a shot hit was
        // one step out").  Re-pinned with the reason, not quietly.
        // W182: `distinct` 101 -> 97 while records/first remain exact. Type
        // $85/$86 now executes the ROM's `$24200A` init aim instead of always
        // using its movement-heading fallback, so this deterministic input
        // selects four fewer heading-art variants. The ROM-exact aim path is
        // pinned directly by w182type86.test.js.
        // W216: 297 -> 346. Type $A3 and its Pool-A impact families add 49
        // structure-shard streams. This Stage-1 scenario cannot execute those
        // Stage-4 paths, so records, distinct images and first frame stay put.
        // W217 adds Type $A1's 16 reverse-animation frames: 346 -> 362, with
        // the same Stage-1-only record and timing invariants.
        // W321: streams 362 -> 799, records 12805 -> 12849, distinct 97 -> 103,
        // and `first` 315 held.  THIS SHARD WAS REPARTITIONED, and it is one of
        // only two that were: the packer now places 4244 streams and this shard
        // took 437 more of them, so art that used to be counted under another
        // bucket is counted HERE now.  That is why `distinct` went UP by six
        // rather than down -- this stage draws the same pictures and six more of
        // them are on shard 11.  Nothing lost art: 12849 DRAWN of 12849.
        // W395: streams 799 -> 813 and NOTHING ELSE MOVED.  The exporter gained
        // its fourth BGELEM art arm -- internal stage index 2, the fourteen
        // elements W394 ported -- and all fourteen streams are new and land in
        // this shard.  `records`, `distinct` and `first` are a STAGE-1 window,
        // and stage 1 cannot construct a stage-3 element (`$8132C8` holds
        // `$26224A`, not `$26229E`), so those three are untouched witnesses
        // that the added art changed nothing this scenario draws.
        // W396: streams 813 -> 818 and NOTHING ELSE MOVED, for the same reason
        // and with the same argument as W395's line directly above.  The
        // exporter's Stage-4 BGELEM arm widened from ONE table cell ($2622EA,
        // id 5) to the whole seven-entry table $2622D6..$2622F1, so the six
        // elements W396 ported bring five streams that were in no shard before
        // ($2B01D0 $2CE658 $2CEE3C $2CF620 $2CFE04; $2CCC74 was already here as
        // W211's single cell) and all five land in this shard.
        // `records`, `distinct` and `first` ARE UNTOUCHED WITNESSES, not
        // re-pinned numbers: this is the same STAGE-1 window, `$8132C8` holds
        // `$26224A` throughout it, and `elemSpawn` can only reach a constructor
        // through that pointer -- so stage 1 cannot construct an internal
        // stage-3 element and cannot draw one of these five pictures.  If any
        // of those three HAD moved, this wave would have changed something it
        // does not claim to touch, and leaving them standing is what makes this
        // gate able to say so.
        // W397: streams 818 -> 822 and NOTHING ELSE MOVED, for the third time
        // running and with the same argument as the two lines directly above.
        // The exporter gained its FIFTH and LAST BGELEM art arm -- internal
        // stage index 4, human Stage 5, the four-entry table $2622F2 -- and its
        // four streams ($3053A0 $305D04 $307388 $31975C) were in no shard
        // before and all four land in this one.  `streams` is the ONLY field
        // this wave invalidates by construction, and it is the only one changed.
        // `records`, `distinct` and `first` ARE UNTOUCHED WITNESSES: this is a
        // STAGE-1 window, `$8132C8` holds `$26224A` for the whole of it, and
        // `elemSpawn` can only reach a constructor through that pointer, so
        // stage 1 cannot construct an internal stage-4 element and cannot draw
        // one of these four pictures.  Had any of the three moved, this wave
        // would have changed something it does not claim to touch -- leaving
        // them standing is what makes this gate able to say so, and a gate
        // loosened here is a gate that stops working.
        // W411 (docket D49): 12849 -> 12985, the same shared-RNG shift.
        // W414 (docket D51): streams 822 -> 846, records 12985 -> 15903,
        // distinct 103 -> 127, and `first` HELD at 315.  THE MECHANISM IS
        // ADDITIVE AND IT IS DECOMPOSED, not asserted: the exporter gained
        // exactly TWENTY-FOUR streams -- pool-A kind 2's own sixteen-frame
        // animation $1BE2CC..$1BE5D8 and the eight-frame collected popup
        // $1E179C..$1E1978 -- and both land in this shard.  [M] on this
        // identical 1500-frame scenario the shard-11 records split
        // 12,985 + 2,918: the 12,985 sit on the streams that were already
        // here, over the SAME 103 distinct images, and every one of the
        // 2,918 sits on one of the 24 new offsets, over 24 distinct.  The old
        // baseline is still inside this number rather than replaced by it.
        //
        // AND THE COUNTER ONLY SEES THEM NOW BECAUSE OF WHAT IT COUNTS:
        // `t.rec++` is gated on `map.get(offs)?.[2] === 11`, so a record whose
        // stream is in NO shard is not counted at all.  The port was already
        // emitting these 2,918 records before this wave -- they were skipped
        // as missing art and this line could not see them.  `drawn === rec`,
        // `pend === 0` and `named === 0` are unchanged, which is what says the
        // 2,918 are DRAWN and not merely counted.
        // W417: streams 846 -> 862, and `records`, `distinct` and `first` ALL
        // HOLD -- 15903, 127 and 315, unchanged from W414's own numbers.  The
        // exporter gained exactly SIXTEEN streams, pool-A kind index 3's own
        // animation $1BE94C..$1BF4C8 at stride $C4, and all sixteen land here.
        // [M] before/after the bundle diff is `4291 -> 4307` streams with 16
        // ADDED and 0 REMOVED, every added offset in that one run, and shard 11
        // is the ONLY shard whose stream count moves.
        //
        // `records` HOLDING is the witness that says this is an addition and not
        // a reshuffle: kind 3 is allocated only by type $92's tail ($279D64) and
        // $279F3C, and [M] a 12,000-frame boot with fire held reaches pool-A
        // kind indices 0, 1, 2 and 8 and NEVER kind 3 -- so this window cannot
        // draw one of the sixteen and must report the same 15,903.  Had records
        // moved, the row would have claimed streams that something else asks
        // for.  The picture is shipped so the body W417 ports is not W414's
        // "allocates, animates and silently fails to draw" all over again.
        //
        // W422: streams 862 -> 870, and `records`, `distinct` and `first` HOLD
        // AGAIN -- 15903, 127 and 315, the same three numbers W414 and W417 both
        // left untouched.  The exporter gained exactly EIGHT streams, pool-A kind
        // index 5's COLLECTED popup $1E24DC..$1E2728 at stride $54, and all eight
        // land here.  [M] the bundle diff is `4343 -> 4351` streams with 8 ADDED
        // and 0 REMOVED; `spr.maskUsed` grew by 656, shard 11 `maskLen` grew by the
        // SAME 656, and shard 9 and shard 12 `maskLen` HELD exactly (only shard 12
        // `maskFrom` slid by that 656), so nothing outside shard 11 moved.
        //
        // `records` HOLDING is again the witness that this is an addition and not
        // a reshuffle, and here it is stronger than W417's: [M] NO call site in the
        // 6 MB image passes D0 = $14 or $44 to any of the six pool-A allocator
        // entries, so a kind-5 record cannot exist on this bench at all and this
        // window cannot draw one of the eight.  See w422poolakind5.test.js.
        11: { streams: 870, records: 15903, distinct: 127, first: 315,
          what: 'THE BIG MID-SCREEN STRUCTURES (buckets 2/3/7 -- the 288x208 '
            + 'hole in the middle of the playfield)' },
      };
      const runW58 = (frames) => {
        const g = new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'),
        });
        const st = { 10: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 },
          11: { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1 } };
        const FIRE = portWordFromBits([BIT.b1]), UP = portWordFromBits([BIT.up]);
        for (let i = 0; i < frames; i++) {
          const res = portSpriteList(g.ram, map, { out: buf, ...shardOpts });
          for (let k = 0; k < 256; k++) {
            const b = k * RAM_STRIDE;
            const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
            if ((w4 & 0x7fff) === 0) break;
            const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
              | g.ram.u16(0x800000 + (b + 3) * 2);
            const sh = map.get(offs)?.[2];
            if (sh !== 10 && sh !== 11) continue;
            const t = st[sh];
            t.rec++; t.seen.add(offs); if (t.first < 0) t.first = i;
            if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
            if (res.missing.has(offs)) t.named++;
            else if (bundle.spr.state[sh] === 'ready') t.drawn++; else t.pend++;
          }
          g.ram.setU8(0x810424, 0xff);
          const ph = i % 600;
          let word = 0xffff & UP;
          if ((ph >= 120 && ph < 240) || (ph >= 360 && ph < 480)) word &= FIRE;
          else if (i % 4 === 0) word &= FIRE;
          g.step(word);
        }
        return st;
      };
      const w58after = runW58(EXP58.frames);
      for (const sh of [10, 11]) {
        const e = EXP58[sh], a = w58after[sh];
        const ok = bundle.spr.meta[sh].streams === e.streams
          && a.rec === e.records && a.seen.size === e.distinct && a.first === e.first
          && a.drawn === a.rec && a.pend === 0 && a.named === 0;
        console.log(`${ok ? 'PASS' : 'FAIL'}: W58 ${e.what} -- over ${EXP58.frames} `
          + 'logic frames from the shipped seed flying UP with fire tapped and '
          + 'two 120-frame HOLDS in every 600, sprite shard '
          + `${sh} holds ${bundle.spr.meta[sh].streams} streams `
          + `(expect ${e.streams}) and the port's own $800000 list carries `
          + `${a.rec} records of them (expect ${e.records}) over ${a.seen.size} `
          + `distinct images (expect ${e.distinct}), first at frame ${a.first} `
          + `(expect ${e.first}). All shards loaded: ${a.drawn} DRAWN of ${a.rec}, `
          + `${a.pend} pending, ${a.named} with no art. Before W58 not one of `
          + 'them had a picture');
        if (!ok) code = 1;
      }

      // ============================== WAVE 86 -- THE BLACK TERRAIN ============
      //
      // THE OWNER, on the live build: *"some terrain starts being black after
      // the golden terrain"*.  `[cited: W68 §5.2]` named the five bucket-2
      // streams; `[cited: W75 §3.4]` tied `$232578` to the invisible `$8B`
      // hitbox lattice on the gold crystal -- the invisible enemy and the black
      // terrain are ONE object.  W86 harvested all thirteen background-element
      // sprites out of `src/background.js BGELEM_HANDLERS`.
      //
      // **THIS STAGE EXISTS BECAUSE EVERY OTHER WINDOW IN THIS FILE IS TOO
      // SHORT TO SEE IT.**  The longest is 2,700 steps (the W44 guard); the
      // five elements first draw at [M] steps 3,627..5,275.  W68 §0.2 measured
      // the identical sentence -- "drawn% 100.00 %, ZERO missing streams" --
      // being TRUE at 2,600 frames and FALSE at 4,000 on the same input, and
      // this gate has been reporting the true half ever since.  A 5,500-step
      // window costs [M] ~25 s and closes it.
      //
      // WHAT IS ASSERTED, and none of it can be satisfied by a black screen:
      //   * all FIVE late elements are reached (a window that reached four
      //     would pass a bundle missing the fifth);
      //   * the port emits `records` of the thirteen, [M] an absolute number
      //     out of the port's own emitter that no bundle can supply;
      //   * every one of them DRAWS, and NONE is named as missing art;
      //   * with shard 11 IN FLIGHT the same records are PENDING and still not
      //     named as missing art -- a shard in flight is not a missing picture.
      // and the MUTATION that must move it: `--break drop-bgelem-art` takes the
      // five late elements back out of the map, which is the bundle exactly as
      // it stood before W86.  It must report 7,027 records with NO ART.
      {
        // The thirteen `data` immediates, spelled out rather than imported:
        // this gate must be able to disagree with `src/background.js`, and a
        // check that reads its subject through the subject is `docs/knowledge/03`.
        const BGELEM_ART = [0x22cbcc, 0x22da70, 0x22ded4, 0x22e508, 0x22f184,
          0x22fe98, 0x23061c, 0x231520, 0x231c44, 0x232578, 0x232eac, 0x233630,
          0x233f34];
        // [M] the five that had no picture until W86, i.e. handlers 7..11.
        const LATE = [0x231520, 0x231c44, 0x232578, 0x232eac, 0x233630];
        // [M] all five absolute, out of the port's own emitter over this
        // window; no bundle can supply any of them.
        const EXP86 = { frames: 5500, records: 17047, distinct: 13,
          lateRecords: 5251, firstLate: 3627 };
        const runW86 = (frames, drop) => {
          const g = new Game(bundle.seed, bundle.tables, {
            logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
            bgSeed: bundle.cap.part(0, 'bg'),
          });
          const useMap = new Map(map);
          if (drop) for (const o of LATE) useMap.delete(o);
          const t = { rec: 0, drawn: 0, pend: 0, named: 0, lateRec: 0,
            seen: new Set(), lateSeen: new Set(), firstLate: -1 };
          const FIRE = portWordFromBits([BIT.b1]);
          for (let i = 0; i < frames; i++) {
            const res = portSpriteList(g.ram, useMap, { out: buf, ...shardOpts });
            for (let k = 0; k < 256; k++) {
              const b = k * RAM_STRIDE;
              const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
              if ((w4 & 0x7fff) === 0) break;
              const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
                | g.ram.u16(0x800000 + (b + 3) * 2);
              if (!BGELEM_ART.includes(offs)) continue;
              t.rec++; t.seen.add(offs);
              if (LATE.includes(offs)) {
                t.lateRec++; t.lateSeen.add(offs);
                if (t.firstLate < 0) t.firstLate = i;
              }
              if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
              if (res.missing.has(offs)) t.named++;
              else if (bundle.spr.state[11] === 'ready') t.drawn++; else t.pend++;
            }
            // The owner's own input: tap fire, sweep left and right. `$810424`
            // is POKED so 5,500 steps of stage 1 are reached at all --
            // docs/knowledge/09: this yields STATES, and the states are what a
            // sprite census needs.
            g.ram.setU8(0x810424, 0xff);
            let word = 0xffff;
            if (i % 4 < 2) word &= FIRE;
            const ph = Math.floor(i / 90) % 4;
            if (ph === 1) word &= portWordFromBits([BIT.left]);
            if (ph === 3) word &= portWordFromBits([BIT.right]);
            g.step(word);
          }
          return t;
        };
        const a86 = runW86(EXP86.frames, false);
        const ok86 = a86.rec === EXP86.records && a86.seen.size === EXP86.distinct
          && a86.lateSeen.size === LATE.length && a86.lateRec === EXP86.lateRecords
          && a86.firstLate === EXP86.firstLate
          && a86.drawn === a86.rec && a86.pend === 0 && a86.named === 0;
        console.log(`${ok86 ? 'PASS' : 'FAIL'}: W86 THE BLACK TERRAIN (the 13 `
          + 'stage-1 background elements, $2623A4..$26275E, one sprite each) -- '
          + `over ${EXP86.frames} logic frames from the shipped seed with fire `
          + "tapped and the ship sweeping, the port's own $800000 list carries "
          + `${a86.rec} records of them (expect ${EXP86.records}) over `
          + `${a86.seen.size} distinct images (expect ${EXP86.distinct}), of `
          + `which ${a86.lateRec} (expect ${EXP86.lateRecords}) belong to the `
          + `${a86.lateSeen.size} of 5 elements (expect 5) that had NO PICTURE `
          + `until W86, first at step ${a86.firstLate} (expect `
          + `${EXP86.firstLate} -- 927 steps past the longest window this file `
          + `had). ${a86.drawn} DRAWN, ${a86.pend} pending, ${a86.named} with `
          + 'NO ART. This is the owner\'s "terrain starts being black after the '
          + 'golden terrain"');
        if (!ok86) code = 1;

        // THE MUTATION.  The bundle exactly as it stood before W86: the five
        // late elements have no stream in the map, so the guard must name them.
        const m86 = runW86(EXP86.frames, true);
        const mutOk = m86.named === EXP86.lateRecords && m86.drawn === m86.rec - m86.named
          && m86.rec === a86.rec;
        console.log(`${mutOk ? 'PASS' : 'FAIL'}: W86 --break drop-bgelem-art -- `
          + `with handlers 7..11's five streams taken back out of the map the `
          + `SAME ${m86.rec} records are emitted (expect ${a86.rec} -- the port `
          + `does not change) and ${m86.named} of them are named as MISSING ART `
          + `(expect ${EXP86.lateRecords}), ${m86.drawn} drawn. That is the `
          + 'black polygon W68 §6 photographed on the live page at 65 s');
        if (!mutOk) code = 1;
      }

      // ============================ WAVE 90 -- THE LASER'S IMPACT EFFECT
      //
      // THE OWNER, on the live build: *"the laser shoots through them, the
      // normal shot hits them"*.  W86 fixed the second half of that sentence
      // (`$274AF0`, the fighter can die) and named the first half as still
      // open: `$289FC0`/`$289FDA` is the flash where the BEAM connects, and
      // until W90 it was a counted note reached [M] 1,790 times in 6,500 steps
      // with nothing on the screen at the end of it.
      //
      // WHAT IS ASSERTED, and none of it can be satisfied by a bundle:
      //   * the port ENTERS the effect `entries` times -- its own count;
      //   * it emits `records` of them over `distinct` images.  [M] DISTINCT IS
      //     **35, NOT 36**, and that is an assertion about the ANIMATION rather
      //     than about the art: `$28A15C` reads the cursor BEFORE `$28A160
      //     subq.w #4` and `$28A164 bcs` frees the slot on the borrow, so a
      //     record seeded at $8C walks list entries 35..1 and NEVER entry 0.
      //     A harvest that shipped 35 streams would pass a record count and
      //     fail this;
      //   * every one DRAWS and none is named as missing art;
      //   * **ADJACENT == 0.**  The call site's middle gate is `$80390C`, the
      //     per-frame alternation word, so the effect can fire on AT MOST every
      //     other frame.  This is the owner's "sometimes" as a number, and it
      //     is asserted so that a future wave which "fixes" the flicker by
      //     spawning every frame reddens here instead of looking better.
      // and the MUTATION: `--break drop-impact-art` takes the 36 streams back
      // out of the map, which is the bundle exactly as it stood before W90.
      // The SAME records must be emitted and all of them named as MISSING ART.
      {
        // The 36 descriptors, DERIVED from the cartridge's own step rather than
        // imported from `src/`: this gate must be able to disagree with the
        // port (`docs/knowledge/03`).  [M] $28A51C is $22C860 down to $22C6BC
        // step $C, and `tools/export-tables.py check_beam_impact_extents`
        // asserts that against the image on every export.
        const IMPACT_ART = Array.from({ length: 36 }, (_, i) => 0x22c860 - i * 0xc);
        // [M] all six absolute, out of the port's own emitter over THIS
        // window's input (fire HELD, no sweep). They are NOT the numbers
        // `.scratch/w90/impact.mjs` reports, because that probe also sweeps
        // left and right and a different route makes a different beam.
        // W321: beamLive 1039 -> 1041, entries 520 -> 521, records 17361 ->
        // 17385, with `distinct` 35 and `first` 31 held. Two more frames of live
        // beam bought one more entry into the effect, and one entry is worth
        // about 24 records -- 17385 - 17361 = 24, so the arithmetic closes on
        // itself. The two assertions that carry the wave's meaning are untouched
        // and both still pass: ADJACENT-FRAME entries 0 and WRONG-PHASE entries
        // 0, which is what says the effect still fires on at most every other
        // frame.
        //
        // W324: beamLive 1041 -> 1039, entries 521 -> 520, records 17385 ->
        // 17281, `distinct` 35 and `first` 31 held again. **THIS ONE HAS A
        // MECHANISM, NOT JUST A DRIFT.** W324 wired `$25485E jsr $289F96`, the
        // beam-BODY effect, which had been a counted note since W34 -- and it
        // fills FROM THE SAME POOL E, through the same `$28A506` template and the
        // same `poolETail`. So the body and the impact now COMPETE for the
        // player's thirty slots, exactly as they do on the board, and the impact
        // gets fewer of them: 104 records fewer over 1500 frames.
        //
        // `fillSlot` also draws the shared RNG at `$28A204`, which is why
        // `beamLive` and `entries` moved as well rather than only `records`.
        // Those two landing back on 1039/520 -- W321's own pre-refresh pair -- is
        // arithmetic and not significance; do not read a restoration into it.
        //
        // The two assertions that carry the wave's meaning are STILL untouched
        // and still pass. That is the point: the effect's cadence rule survives a
        // change that moved every count around it.
        // W411 (docket D49): beamLive 1039 -> 1037, entries 520 -> 519, records
        // 17281 -> 17283. The ten wired death arms allocate, the allocations draw from
        // the shared RNG, and the beam's own cadence moves with it. `distinct` and
        // `first` held, which is what says the ART side did not change.
        //
        // W411 AGAIN (docket D42), and this one is NOT only an RNG shift, so it is
        // labelled as what it is: beamLive 1037 -> 1003, entries 519 -> 502, records
        // 17283 -> 16731. `$24CBCC` is `08 ae 00 07 00 01` = `bclr #$7,($1,A6)`, the
        // OPTION BLOCK, and `src/laser.js` was clearing the beam RECORD's `+$1` -- an
        // address no instruction in $240000..$2B0000 writes. Bit 7 is "a head is already
        // out there"; clearing the wrong byte left it up for the whole hold, so pool slot
        // 27 was laid ONCE per press. It is now laid once per hit and once per completed
        // beam, which changes the segment population, and `$254FE6`/`$254FA8` -- the
        // instructions that raise and clear `$811F32` -- move with it. So `beamLive` is a
        // real behaviour change and not a fingerprint drift.
        //
        // WHAT HELD, and it is the whole reason this baseline may move: `distinct` 35 of
        // 35, `first` step 31, `NO ART` 0, `pending` 0, ADJACENT-FRAME entries 0 and
        // WRONG-$80390C-phase entries 0. The art side and the cadence rule -- the two
        // things this row exists to defend -- are untouched; only counts moved.
        const EXP90 = { frames: 1500, entries: 502, records: 16731,
          distinct: 35, first: 31, beamLive: 1003 };
        const runW90 = (frames, drop) => {
          const g = new Game(bundle.seed, bundle.tables, {
            logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
            bgSeed: bundle.cap.part(0, 'bg'),
          });
          const useMap = new Map(map);
          if (drop) for (const o of IMPACT_ART) useMap.delete(o);
          const t = { rec: 0, drawn: 0, pend: 0, named: 0, entries: 0,
            beamLive: 0, seen: new Set(), first: -1, adjacent: 0, phaseZero: 0 };
          let prev = -2;
          const FIRE = portWordFromBits([BIT.b1]);
          for (let i = 0; i < frames; i++) {
            // THE LASER: fire HELD for the whole window.
            g.ram.setU8(0x810424, 0xff);
            g.step(0xffff & FIRE);
            if ((g.ram.u16(0x811f32) & 0x8000) !== 0) t.beamLive++;
            const n = g.beamImpacts ?? 0;
            if (n > 0) {
              t.entries += n;
              if (t.first < 0) t.first = i;
              if (i === prev + 1) t.adjacent++;
              prev = i;
              // P1's block spawns only while $80390C is NON-zero ($25504E).
              if (g.ram.u16(0x80390c) === 0) t.phaseZero++;
            }
            const res = portSpriteList(g.ram, useMap, { out: buf, ...shardOpts });
            for (let k = 0; k < 256; k++) {
              const b = k * RAM_STRIDE;
              const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
              if ((w4 & 0x7fff) === 0) break;
              const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
                | g.ram.u16(0x800000 + (b + 3) * 2);
              if (!IMPACT_ART.includes(offs)) continue;
              t.rec++; t.seen.add(offs);
              if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
              if (res.missing.has(offs)) t.named++;
              else if (bundle.spr.state[8] === 'ready') t.drawn++; else t.pend++;
            }
          }
          return t;
        };
        const a90 = runW90(EXP90.frames, false);
        const ok90 = a90.entries === EXP90.entries && a90.rec === EXP90.records
          && a90.seen.size === EXP90.distinct && a90.first === EXP90.first
          && a90.beamLive === EXP90.beamLive && a90.adjacent === 0
          && a90.phaseZero === 0
          && a90.drawn === a90.rec && a90.pend === 0 && a90.named === 0;
        console.log(`${ok90 ? 'PASS' : 'FAIL'}: W90 THE LASER'S IMPACT EFFECT `
          + '($289FC0/$289FDA -> pool E, template $28A506, list $28A51C) -- '
          + `over ${EXP90.frames} logic frames from the shipped seed with fire `
          + `HELD, the beam is up on ${a90.beamLive} of them (expect `
          + `${EXP90.beamLive}) and the port ENTERS the effect ${a90.entries} `
          + `times (expect ${EXP90.entries}), first at step ${a90.first} `
          + `(expect ${EXP90.first}), emitting ${a90.rec} records (expect `
          + `${EXP90.records}) over ${a90.seen.size} distinct images (expect `
          + `${EXP90.distinct} -- THIRTY-FIVE of the 36 harvested, because `
          + `$28A164 frees the slot before entry 0 is ever read). `
          + `${a90.drawn} DRAWN, ${a90.pend} pending, ${a90.named} with NO ART. `
          + `ADJACENT-FRAME entries ${a90.adjacent} (expect 0) and entries on `
          + `the WRONG $80390C phase ${a90.phaseZero} (expect 0): the effect `
          + 'fires on at most every other frame and that is the owner\'s '
          + '"sometimes", not a defect. This is the owner\'s "the laser shoots '
          + 'through them"');
        if (!ok90) code = 1;

        // THE MUTATION.  The bundle exactly as it stood before W90.
        const m90 = runW90(EXP90.frames, true);
        const mut90 = m90.named === EXP90.records && m90.drawn === 0
          && m90.rec === a90.rec && m90.entries === a90.entries;
        console.log(`${mut90 ? 'PASS' : 'FAIL'}: W90 --break drop-impact-art -- `
          + 'with $28A51C\'s 36 streams taken back out of the map the SAME '
          + `${m90.rec} records are emitted (expect ${a90.rec} -- the port does `
          + `not change) and ${m90.named} of them are named as MISSING ART `
          + `(expect ${EXP90.records}), ${m90.drawn} drawn. That is what the `
          + 'beam looked like before this wave: the records were always right '
          + 'and there was no picture at the end of them');
        if (!mut90) code = 1;
      }

      // ============================ WAVE 91 -- THE SPRITE PALETTE, AND THE
      // ============================ ONE THING ON THIS PAGE THAT **CAN** BE
      // ============================ COMPARED AGAINST THE BOARD DIRECTLY
      //
      // Nothing in this repo compares a SPRITE'S PIXELS against the board
      // ([cited: W81 §6], [cited: W86 §6.1], [cited: W90 §3.2]).  The PALETTE
      // is different and that is why this stage exists: palette RAM is in the
      // capture, so a colour the port claims to have sourced from the cartridge
      // can be checked against the board's own $A00000 entry for entry.
      //
      // WHAT IS ASSERTED, and each number is independent of `src/`:
      //   * the catch-up replays [head, cursor) of the stage's object stream.
      //     The head is read out of the CARTRIDGE through the per-stage pair
      //     table and the cursor out of the SEED, so neither is a literal here;
      //   * it writes bytes IDENTICAL to the staging area the seed carries --
      //     576 of 576.  That equality is the model's own proof: the board put
      //     those bytes there by running this same routine over this same data;
      //   * **576 of 576 sourced sprite entries equal the BOARD's palette RAM,
      //     on ALL 161 recorded frames.**  Not one frame: the sprite third is
      //     constant across the recording ([M] 0 of 1,024 words ever change,
      //     against BG bank 21's four), so a comparison on frame 0 alone would
      //     sit where two readings agree (`docs/knowledge/03`);
      //   * a bomb makes bank 6 CARTRIDGE-SOURCED and ORANGE.  [M] the board's
      //     own bank 6 in this recording is $5EF3 (189,189,156), a khaki with
      //     R = G, because the only users of bank 6 in 538 board dumps are the
      //     STAGE-TITLE card -- so this one bank DISAGREEING with the capture
      //     is the correct result and the gate says which way.
      // and the MUTATION: `palCatchUp: false` is the port exactly as it stood
      // before this wave -- zero sourced words, and every sprite on the page
      // coloured by one frozen instant of `capture.bin`.
      {
        const SPR_WORDS = 0x400, BANK = 32;
        const mkGame = (opts) => new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf,
          videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'), ...opts,
        });
        // [M] all of these are read off the cartridge and the seed, not typed:
        // 18 entries, and the eighteen banks in the stream's own order sorted.
        const EXP91 = {
          entries: 18, same: 576, total: 576, skipped: 0,
          banks: [10, 11, 12, 13, 14, 15, 19, 20, 21, 22,
            24, 25, 26, 27, 28, 29, 30, 31],
          agree: 576,
          // the ORDINARY bomb's block $222A78, first two words, straight out of
          // the ROM window this gate does not share with src/palette.js
          bombW0: 0xffff, bombW1: 0xffb6,
          // ...and what the RECORDING has in bank 6 instead.
          capW0: 0x5ef3,
        };
        const g91 = mkGame();
        const cu = g91.palette.catchUp;
        // THE BOARD COMPARISON, on every recorded frame rather than on one.
        let worst = Infinity, worstFrame = -1, checked = 0;
        for (let f = 0; f < bundle.cap.length; f++) {
          const cp = bundle.cap.part(f, 'palette');
          let ok = 0, n = 0;
          for (let i = 0; i < SPR_WORDS; i++) {
            if (!g91.palette.sourced[i]) continue;
            n++;
            if (g91.palette.words[i] === cp[i]) ok++;
          }
          checked = n;
          if (ok < worst) { worst = ok; worstFrame = f; }
        }
        const okCatch = cu.entries === EXP91.entries && cu.same === EXP91.same
          && cu.total === EXP91.total && cu.skipped === EXP91.skipped
          && cu.banks.join(',') === EXP91.banks.join(',')
          && checked === EXP91.agree && worst === EXP91.agree;
        console.log(`${okCatch ? 'PASS' : 'FAIL'}: W91 THE SPRITE PALETTE -- `
          + `the stage's object stream ($${cu.head.toString(16).toUpperCase()}, `
          + `head read out of the CARTRIDGE) had ${cu.entries} entries `
          + `consumed at the seed instant (expect ${EXP91.entries}, from the `
          + `seed's own $813196 = $${cu.cursor.toString(16).toUpperCase()}), and `
          + `replaying them through $24150A wrote ${cu.same} of ${cu.total} `
          + `bytes-as-words IDENTICAL to the staging area the seed carries `
          + `(expect ${EXP91.same}/${EXP91.total}), ${cu.skipped} skipped. That `
          + `sources banks ${cu.banks.join(',')} = ${checked} palette entries, `
          + `and they equal the BOARD'S OWN PALETTE RAM on ${worst} of `
          + `${checked} entries on ALL ${bundle.cap.length} recorded frames `
          + `(worst frame ${worstFrame}; expect ${EXP91.agree}). **THIS IS A `
          + `DIRECT COMPARISON AGAINST THE BOARD**, which is not available for `
          + `a sprite's pixels`);
        if (!okCatch) code = 1;

        // THE BOMB, and it is the owner's report.
        const FIRE91 = portWordFromBits([BIT.b1]);
        const BOMB91 = portWordFromBits([BIT.b1, BIT.b2]);
        const runBomb = (opts) => {
          const g = mkGame(opts);
          for (let i = 0; i < 420; i++) {
            g.ram.setU8(0x810424, 0xff);
            g.step(i >= 400 && i < 403 ? BOMB91 : FIRE91);
          }
          return g;
        };
        const gb = runBomb();
        const b6 = gb.palette.words[6 * BANK];
        const b6a = gb.palette.words[6 * BANK + 1];
        const cap6 = bundle.cap.part(0, 'palette')[6 * BANK];
        const rgb = (w) => {
          const r = (w >> 10) & 31, gg = (w >> 5) & 31, b = w & 31;
          return `(${(r << 3) | (r >> 2)},${(gg << 3) | (gg >> 2)},`
            + `${(b << 3) | (b >> 2)})`;
        };
        const okBomb = gb.palette.sourced[6 * BANK] === 1
          && b6 === EXP91.bombW0 && b6a === EXP91.bombW1
          && cap6 === EXP91.capW0;
        console.log(`${okBomb ? 'PASS' : 'FAIL'}: W91 THE BOMB'S COLOUR -- with `
          + `a bomb dropped, $260852/$26085C install bank 6 from the cartridge `
          + `and its first two entries are $${b6.toString(16).toUpperCase()
            .padStart(4, '0')} ${rgb(b6)} and $${b6a.toString(16).toUpperCase()
            .padStart(4, '0')} ${rgb(b6a)} (expect $FFFF white and $FFB6 pale `
          + `yellow -- the head of a white/gold/ORANGE ramp). The RECORDING has `
          + `$${cap6.toString(16).toUpperCase().padStart(4, '0')} ${rgb(cap6)} `
          + `there (expect $5EF3, R = G, the STAGE-TITLE card's khaki), which `
          + `is the owner's "kinda grey" and is what this page drew until now. `
          + `**BANK 6 IS DELIBERATELY THE ONE SOURCED BANK THAT DISAGREES WITH `
          + `THE BOARD**: no bomb was dropped in the 161 recorded frames`);
        if (!okBomb) code = 1;

        // THE MUTATION -- the port exactly as it stood before this wave.
        const gm = mkGame({ palCatchUp: false });
        const mSourced = gm.palette.sourcedCount();
        const gmb = runBomb({ palCatchUp: false });
        const okMut = mSourced === 0 && gm.palette.installCount === 0
          && gmb.palette.sourcedBanks().join(',') === '6';
        console.log(`${okMut ? 'PASS' : 'FAIL'}: W91 --break palCatchUp:false `
          + `-- with the catch-up refused the port sources ${mSourced} palette `
          + `words at boot (expect 0) from ${gm.palette.installCount} installs `
          + `(expect 0), which is the page before this wave: EVERY sprite `
          + `colour one frozen instant of capture.bin. A bomb still sources `
          + `bank ${gmb.palette.sourcedBanks().join(',')} (expect 6), because `
          + `the two mechanisms are independent and the gate has to be able to `
          + `tell them apart`);
        if (!okMut) code = 1;
      }

      // ======================= WAVE 92 -- THE BACKGROUND THIRD, AND THE FOUR
      // ======================= ENTRIES THAT STARTED ALL OF THIS
      //
      // W14 shipped `$227E58` as an ASSET and measured it at 1020 of 1024
      // against the board.  W90 re-measured the same four.  W91 LOCATED them --
      // `$241404`, the tail of `$24133C` itself.  Nothing had ever uploaded the
      // block, so the page drew all 1,024 background words out of `capture.bin`.
      //
      // WHAT IS ASSERTED, and every number is independent of `src/`:
      //   * `$2611C4` is replayed and takes NOTHING from the recording: D0 and
      //     D1 are the immediates `#$0`/`#$1F` and the block is
      //     `$261252[$813096]`, a cartridge pointer.  It writes bytes IDENTICAL
      //     to the staging the seed carries -- 1,024 of 1,024;
      //   * **THE STATIC THIRD AGREES WITH THE BOARD ON 1,020 OF 1,024 ON ALL
      //     161 FRAMES, AND THE FOUR THAT DO NOT ARE EXACTLY THE FADE'S.**  [M]
      //     those four are the only words of all 2,560 that ever move across
      //     the recording, so this is not a comparison sitting where two
      //     readings agree;
      //   * **STEPPED, IT IS 1,024 OF 1,024 ON EVERY ONE OF 160 FRAMES** -- the
      //     port advanced one `step()` per recorded frame, compared at LAG 1.
      //     The lag is the write-then-advance order of `$241404` and is stated
      //     rather than tuned away: the board wrote frame 0's palette with the
      //     level the seed's `$80FA6C` has ALREADY stepped past, and recovering
      //     it would mean inverting a divider whose reload is 1 and therefore
      //     ambiguous.  LAG 0 and LAG 2 are printed beside it so a reader can
      //     see the fade is a real state machine and not a constant.
      // and the MUTATION: with the catch-up refused the background third has
      // zero sourced words, which is the page before this wave.
      {
        const BG0 = 0x400, BGN = 0x400;
        const mkG = (opts) => new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf,
          videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'), ...opts,
        });
        // [M] read off the cartridge and the seed, not typed:
        const EXP92 = {
          block: 0x227e58, banks: 32, same: 1024, total: 1024,
          staticAgree: 1020, steppedAgree: 1024, steppedFrames: 160,
          fadeWords: 4, fadeBase: 0x400 + 0x540 / 2,
        };
        const g92 = mkG();
        const bc = g92.palette.bgCatchUp;
        const led = g92.palette.ledger();
        // STATIC: the boot palette against every recorded frame.
        let sWorst = Infinity, sFrame = -1, sN = 0;
        for (let f = 0; f < bundle.cap.length; f++) {
          const cp = bundle.cap.part(f, 'palette');
          let ok = 0, n = 0;
          for (let i = BG0; i < BG0 + BGN; i++) {
            if (!g92.palette.sourced[i]) continue;
            n++; if (g92.palette.words[i] === cp[i]) ok++;
          }
          sN = n;
          if (ok < sWorst) { sWorst = ok; sFrame = f; }
        }
        const okStatic = bc && bc.block === EXP92.block
          && bc.banks === EXP92.banks && bc.same === EXP92.same
          && bc.total === EXP92.total && led.bg === BGN
          && sN === BGN && sWorst === EXP92.staticAgree;
        console.log(`${okStatic ? 'PASS' : 'FAIL'}: W92 THE BACKGROUND THIRD -- `
          + `$2611C4 replayed the stage's own block $${bc.block.toString(16)
            .toUpperCase()} (from $261252 + $${bc.stageX4.toString(16)
            .toUpperCase()}, a CARTRIDGE pointer) into ${bc.banks} banks `
          + `(expect ${EXP92.banks}) and wrote ${bc.same} of ${bc.total} `
          + `bytes-as-words IDENTICAL to the staging the seed carries (expect `
          + `${EXP92.same}/${EXP92.total}). That sources ${led.bg} of ${BGN} `
          + `background words, and they equal the BOARD'S OWN $A00800 on `
          + `${sWorst} of ${sN} on all ${bundle.cap.length} recorded frames `
          + `(worst frame ${sFrame}; expect ${EXP92.staticAgree} -- the four `
          + `that differ are $241404's, and a STATIC palette cannot have them)`);
        if (!okStatic) code = 1;

        // STEPPED, at three lags.  Only one can be right and the gate says so.
        const lagRow = [];
        for (const LAG of [0, 1, 2]) {
          const g = mkG();
          let worst = Infinity, wf = -1, n = 0, fadeOk = 0, fadeTot = 0;
          for (let k = 0; k + LAG < bundle.cap.length; k++) {
            if (k > 0) g.step(0);
            const cp = bundle.cap.part(k + LAG, 'palette');
            let ok = 0; n = 0;
            for (let i = BG0; i < BG0 + BGN; i++) {
              if (!g.palette.sourced[i]) continue;
              n++; if (g.palette.words[i] === cp[i]) ok++;
            }
            for (let q = 0; q < EXP92.fadeWords; q++) {
              fadeTot++;
              if (g.palette.words[EXP92.fadeBase + q] === cp[EXP92.fadeBase + q]) fadeOk++;
            }
            if (ok < worst) { worst = ok; wf = k; }
          }
          lagRow.push({ LAG, worst, wf, n, fadeOk, fadeTot });
        }
        const one = lagRow[1];
        const okStep = one.worst === EXP92.steppedAgree && one.n === BGN
          && one.fadeOk === one.fadeTot
          && one.fadeTot === EXP92.steppedFrames * EXP92.fadeWords
          // ...and the OTHER two lags must NOT be perfect, or the fade is a
          // constant and this whole stage proves nothing.
          && lagRow[0].worst < EXP92.steppedAgree
          && lagRow[2].worst < EXP92.steppedAgree;
        console.log(`${okStep ? 'PASS' : 'FAIL'}: W92 THE FOUR ANIMATED ENTRIES `
          + `-- the port stepped one frame per recorded frame, background third `
          + `against the board: `
          + lagRow.map((r) => `LAG ${r.LAG} ${r.worst}/${r.n} (fade `
            + `${r.fadeOk}/${r.fadeTot})`).join(', ')
          + `. **LAG 1 IS ${one.worst} OF ${one.n} ON EVERY ONE OF `
          + `${EXP92.steppedFrames} FRAMES, INCLUDING ALL FOUR ANIMATED WORDS**, `
          + `and LAG 0 and LAG 2 are not, which is what says $241404 is a real `
          + `state machine. The one-frame lag is $241404's write-then-advance `
          + `order: the board wrote the seed frame with the level $80FA6C has `
          + `already stepped past, and inverting the divider to recover it `
          + `would be inventing state`);
        if (!okStep) code = 1;

        // THE MUTATION -- the background third before this wave.
        const gm92 = mkG({ palCatchUp: false });
        const lm = gm92.palette.ledger();
        const okMut92 = lm.bg === 0 && gm92.palette.bgCatchUp === null;
        console.log(`${okMut92 ? 'PASS' : 'FAIL'}: W92 --break palCatchUp:false `
          + `-- with the catch-up refused the port sources ${lm.bg} of ${BGN} `
          + `background words (expect 0), which is the page before this wave: `
          + `every background colour, and the four that pulse, one frozen `
          + `instant of capture.bin`);
        if (!okMut92) code = 1;

        // THE LEDGER, printed rather than asserted piecemeal, because the
        // number `39-OWNER` cares about is "how much of capture.bin is still
        // load-bearing" and that is a per-third question.
        console.log(`  W92 LEDGER at boot: ${led.total} of 2560 palette words `
          + `CARTRIDGE-SOURCED -- sprites ${led.spr}/${led.of.spr}, background `
          + `${led.bg}/${led.of.bg}, text ${led.tx}/${led.of.tx}, and `
          + `${led.of.unwritten} words ($8F0..$9FF) that NO region of $24133C `
          + `copies on the board either`);
      }

      // ============================ WAVE 93 -- THE TEXT STRIP, AND ITS WITNESS
      //
      // W92 §5.2 matched ELEVEN of the fifteen text banks to a named site and
      // REFUSED to wire any of them, because "the bytes match, therefore replay
      // it" is exactly what would have installed its own wrong sprite bank 1, 7
      // and 8 (§5.1).  W93 takes TEN of them, and the thing that changed is not
      // the byte match -- it is that both routines can now be shown to have
      // RUN.  This stage asserts the difference, not the result.
      //
      // WHAT IS ASSERTED, and every number is independent of `src/`:
      //   * the RESET arm installs five banks from `$23BF86..$23BFCC`, which is
      //     straight-line code inside `$23BEEA`, the routine both `$23B7D8` and
      //     `$23B7F2` jmp to.  The machine cannot be mid-stage-1 without it;
      //   * the `$2605C8` arm installs ten more -- and ONLY because the seed's
      //     own `$80E240` slot array holds an ACTIVE type `$0A` past state 0.
      //     `$2411AE clr.w $2(A0)` starts it at 0 and `$2605C8`'s own first
      //     instruction is what makes it 1, so that byte is the cartridge
      //     saying in the seed's RAM that the routine executed;
      //   * **160 OF 160 SOURCED TEXT WORDS EQUAL THE BOARD'S OWN $A01000 ON
      //     ALL 161 RECORDED FRAMES.**  The text third is CONSTANT across the
      //     recording, so this is a comparison that sits where two readings
      //     agree -- which is why the mutation below matters more than it does.
      // and TWO mutations: the catch-up refused (the page before this wave),
      // and THE WITNESS REMOVED, which must drop the ten banks and keep five.
      {
        const TX0 = 0x800, TXN = 0xf0;
        const mkG = (opts) => new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf,
          videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'), ...opts,
        });
        // [M] read off the cartridge and the seed, not typed:
        const EXP93 = {
          reset: 5, obj0A: 10, banks: 10, words: 160, same: 240, total: 240,
          sameAsReset: 80, witnessSlot: 0, witnessState: 1, witnessPrio: 0x1f,
        };
        const g93 = mkG();
        const tc = g93.palette.txCatchUp;
        const led93 = g93.palette.ledger();
        let worst = Infinity, wf = -1, n93 = 0;
        for (let f = 0; f < bundle.cap.length; f++) {
          const cp = bundle.cap.part(f, 'palette');
          let ok = 0, n = 0;
          for (let i = TX0; i < TX0 + TXN; i++) {
            if (!g93.palette.sourced[i]) continue;
            n++; if (g93.palette.words[i] === cp[i]) ok++;
          }
          n93 = n;
          if (ok < worst) { worst = ok; wf = f; }
        }
        const w = tc?.witness;
        const ok93 = tc && tc.reset === EXP93.reset && tc.obj0A === EXP93.obj0A
          && tc.same === EXP93.same && tc.total === EXP93.total
          && tc.sameAsReset === EXP93.sameAsReset && !tc.skipped
          && w && w.slot === EXP93.witnessSlot && w.state === EXP93.witnessState
          && w.prio === EXP93.witnessPrio
          && led93.tx === EXP93.words && n93 === EXP93.words
          && worst === EXP93.words;
        console.log(`${ok93 ? 'PASS' : 'FAIL'}: W93 THE TEXT STRIP -- the RESET `
          + `path $23BF86..$23BFCC installed ${tc?.reset} banks (expect `
          + `${EXP93.reset}) and $2605C8 installed ${tc?.obj0A} more (expect `
          + `${EXP93.obj0A}), WITNESSED by $80E240 slot ${w?.slot} holding an `
          + `ACTIVE type $0A at state $${w?.state?.toString(16)} priority `
          + `$${w?.prio?.toString(16).toUpperCase()} (expect slot `
          + `${EXP93.witnessSlot} state $1 prio $1F -- $2411AE clr.w $2(A0) `
          + `starts it at 0 and only $2605C8 makes it 1). That wrote `
          + `${tc?.same} of ${tc?.total} bytes-as-words IDENTICAL to the `
          + `staging the seed carries, of which ${tc?.sameAsReset} were written `
          + `TWICE from the same block (expect ${EXP93.sameAsReset}); it `
          + `sources ${led93.tx} of ${TXN} text words and they equal the `
          + `BOARD'S OWN $A01000 on ${worst} of ${n93} on all `
          + `${bundle.cap.length} recorded frames (worst frame ${wf})`);
        if (!ok93) code = 1;

        // MUTATION 1 -- the text third before this wave.
        const gm93 = mkG({ palCatchUp: false });
        const lm93 = gm93.palette.ledger();
        const okMut93 = lm93.tx === 0 && gm93.palette.txCatchUp === null;
        console.log(`${okMut93 ? 'PASS' : 'FAIL'}: W93 --break palCatchUp:false `
          + `-- with the catch-up refused the port sources ${lm93.tx} of `
          + `${TXN} text words (expect 0), which IS the page before this wave: `
          + `every HUD and score colour one frozen instant of capture.bin`);
        if (!okMut93) code = 1;

        // MUTATION 2 -- **THE WITNESS REMOVED**, and this is the stage that
        // says W93 is not W92's refused reasoning with a coat of paint.  The
        // seed's type-$0A object is put back into state 0.  Every one of the
        // ten banks' BYTES still matches the cartridge exactly; only the
        // evidence that the routine ran is gone.  A port that had quietly gone
        // back to trusting the byte match would install them anyway and this
        // stage would read 160.
        const gw = mkG();
        gw.ram.setU16(0x80e240 + 2, 0);        // $2(A5) := 0 -- "has not run"
        const { catchUpTextPalette: cu, PaletteState: PS, flush24133C: fl }
          = await import('../src/palette.js');
        const pw = new PS();
        cu(gw.ram, gw.rom, pw, {});
        fl(gw.ram, pw);
        const lw = pw.ledger();
        const okW = lw.tx === EXP93.reset * 16 && pw.txCatchUp.witness === null
          && pw.txCatchUp.obj0A === 0;
        console.log(`${okW ? 'PASS' : 'FAIL'}: W93 --break the WITNESS -- with `
          + `the seed's type $0A object put back into state 0, the port sources `
          + `${lw.tx} of ${TXN} text words (expect ${EXP93.reset * 16} = the `
          + `RESET five alone) and $2605C8's ten are REFUSED. **THE BYTES STILL `
          + `MATCH THE CARTRIDGE EXACTLY** -- only the evidence that the `
          + `routine ran is gone -- so a port that trusted the byte match `
          + `would read ${EXP93.words} here. That is the W92 §5.1 trap made `
          + `into a check that can fail`);
        if (!okW) code = 1;

        console.log(`  W93 LEDGER at boot: ${led93.total} of 2560 palette words `
          + `CARTRIDGE-SOURCED -- sprites ${led93.spr}/${led93.of.spr}, `
          + `background ${led93.bg}/${led93.of.bg}, text `
          + `${led93.tx}/${led93.of.tx}, and ${led93.of.unwritten} words `
          + `($8F0..$9FF) that NO region of $24133C copies on the board either. `
          + `STILL THE RECORDING'S: nine sprite banks (0..5,7,8,9) and five `
          + `text banks (9,10,12,13,14)`);
      }

      // ================================================== WAVE 66 -- E6, THE BOMB
      //
      // W64 shipped the BOMB and W65 the LASER BOMB and NEITHER HAD A PICTURE.
      // [M] W64 §8.3: 174 bucket-13 records over three bombs, every one skipped
      // for want of a sheet. [M] W65 §7.3: the page's own status line naming
      // `$042924 $040CC8 $040EAC` during every laser bomb.
      //
      // THIS STAGE NEEDS TWO WINDOWS AND THAT IS THE POINT.  `$249A5C tst.b
      // ($3f,A6)` forks the arm on whether the BEAM IS UP, and [M] the two arms
      // draw from completely disjoint art -- 16 streams of `$02xxxx`/`$03xxxx`
      // for the ordinary bomb and 168 of `$04xxxx`/`$05xxxx` for the laser one.
      // A single window would report one of them and pass on nothing about the
      // other, which is exactly the shape of `47-impl` §4.1's trap.
      //
      // W47 §4.1's OTHER trap, avoided the same way every stage above avoids
      // it: `records`, `distinct` and `first` are the PORT's own and no bundle
      // can supply them; `streams` is the one number a short harvest moves.
      const EXP66 = {
        frames: 1400, press: [200, 700, 1200],
        tap: { records: 346, distinct: 18, first: 201,
          what: 'THE BOMB ($255E3E\'s three phase scripts $256558/$2565DE/'
            + '$25663A, bucket 13) with fire TAPPED' },
        // W90: 5,906 -> 5,948.  SAME CAUSE AS W58's above and NOT new art:
        // this stage filters on `map.get(offs)?.[2] !== 13` and W90's streams
        // are SHARD 8, so not one of the 42 is an impact spark.  The run HOLDS
        // fire, the beam is up, `$289FC0` now draws four times per spawn from
        // `$803917`, and the bomb's own segment lifetimes step differently.
        // `distinct` 136 and `first` 201 held.
        // W321: 5906 -> 3218, distinct 136 -> 115, and `first` 201 held.  THIS
        // ONE CORRECTS A CLAIM THE COMMENT ABOVE MAKES.  §W47's note says
        // "`records`, `distinct` and `first` are the PORT's own and no bundle can
        // supply them; `streams` is the one number a short harvest moves".  That
        // is NOT true of this stage, and W321 is the wave that found out: the
        // loop filters on `map.get(offs)?.[2] !== 13`, so a record only counts
        // while its art is packed ON SHARD 13.  Shard 13 is one of the two shards
        // the packer repartitioned (252 -> 228 streams), and 21 of the 24 it gave
        // up were this bomb's -- high-frequency segment art, drawn many times a
        // frame, which is why 21 images cost 2688 records.  Those records are
        // still emitted and still drawn; they are counted under another bucket.
        //
        // [M] `tools/w321itemspan.mjs`: the bomb still fires THREE TIMES, in
        // three near-identical spans -- f201..f331 (1042 records, peak 8),
        // f701..f832 (1130, peak 10) and f1201..f1332 (1046, peak 9), one per
        // press, each about 131 frames long.  A broken bomb loses a span or
        // truncates one unevenly; three matched spans is a working bomb three
        // times over.  The TAP arm on the same shard is 346 records EXACTLY as
        // recorded, which is the control: the ordinary bomb's 16 streams did not
        // move shard, so its count did not move either.
        hold: { records: 3218, distinct: 115, first: 201,
          what: 'THE LASER BOMB ($255FE2\'s four heads and 41 segments out of '
            + '$256662..$256986, + pool E, the bit-7 aura and type $8A) with '
            + 'fire HELD' },
        streams: 228,
      };
      const runW66 = (frames, hold) => {
        const g = new Game(bundle.seed, bundle.tables, {
          logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
          bgSeed: bundle.cap.part(0, 'bg'),
        });
        const t = { rec: 0, drawn: 0, pend: 0, named: 0, seen: new Set(), first: -1,
          stock: [] };
        const FIRE = portWordFromBits([BIT.b1]), UP = portWordFromBits([BIT.up]);
        const BOMB = portWordFromBits([BIT.b2]);
        for (let i = 0; i < frames; i++) {
          const res = portSpriteList(g.ram, map, { out: buf, ...shardOpts });
          for (let k = 0; k < 256; k++) {
            const b = k * RAM_STRIDE;
            const w4 = g.ram.u16(0x800000 + (b + 4) * 2);
            if ((w4 & 0x7fff) === 0) break;
            const offs = ((g.ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
              | g.ram.u16(0x800000 + (b + 3) * 2);
            if (map.get(offs)?.[2] !== 13) continue;
            t.rec++; t.seen.add(offs); if (t.first < 0) t.first = i;
            if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x1ff) === 0) continue;
            if (res.missing.has(offs)) t.named++;
            else if (bundle.spr.state[13] === 'ready') t.drawn++; else t.pend++;
          }
          // The page's own intervention (`src/web/app.js`): pin `$810424`, so
          // `$2564BA`'s cooldown expiry cannot make the ship mortal and stop
          // this run at `$249F8A` (W64 §8.1, W65 §9).
          g.ram.setU8(0x810424, 0xff);
          let word = 0xffff & UP;
          if (hold || i % 4 === 0) word &= FIRE;
          if (EXP66.press.includes(i)) { word &= BOMB; t.stock.push(g.ram.u8(0x81040a)); }
          g.step(word);
        }
        return t;
      };
      for (const mode of ['tap', 'hold']) {
        const a = runW66(EXP66.frames, mode === 'hold'), e = EXP66[mode];
        // THE STOCK ROW IS NOT DECORATION.  Without it a run in which every
        // press is REFUSED -- because the fork went to the hyper, or because
        // the beam was not up -- still counts whatever records the previous
        // bomb left on screen. [M] 3 / 2 / 1 is the seed's three bombs spent.
        const spent = a.stock.join('/') === '3/2/1';
        const ok = bundle.spr.meta[13].streams === EXP66.streams
          && a.rec === e.records && a.seen.size === e.distinct && a.first === e.first
          && a.drawn === a.rec && a.pend === 0 && a.named === 0 && spent;
        console.log(`${ok ? 'PASS' : 'FAIL'}: W66 ${e.what} -- over ${EXP66.frames} `
          + `logic frames from the shipped seed, Button 2 at `
          + `${EXP66.press.join('/')} (stock ${a.stock.join('/')}, expect 3/2/1), `
          + `sprite shard 13 holds ${bundle.spr.meta[13].streams} streams `
          + `(expect ${EXP66.streams}) and the port's own $800000 list carries `
          + `${a.rec} records of them (expect ${e.records}) over ${a.seen.size} `
          + `distinct images (expect ${e.distinct}), first at frame ${a.first} `
          + `(expect ${e.first}). All shards loaded: ${a.drawn} DRAWN of ${a.rec}, `
          + `${a.pend} pending, ${a.named} with no art. Before W66 every one of `
          + 'these records was skipped for want of a sheet');
        if (!ok) code = 1;
      }

      // AND THE ONE THAT SAYS THE SHARD IS WHAT DID IT -- E5a's check, which
      // can only pass for the right reason: with the BOOT payload alone the run
      // is identical up to the press and then every bomb record is PENDING on
      // shard 13, named by shard rather than by address, and NOT drawn.
      {
        const saved = bundle.spr.state[13];
        bundle.spr.state[13] = 'loading';
        const a = runW66(EXP66.frames, true);
        bundle.spr.state[13] = saved;
        const e = EXP66.hold;
        const ok = a.rec === e.records && a.first === e.first
          && a.drawn === 0 && a.pend === e.records && a.named === 0;
        console.log(`${ok ? 'PASS' : 'FAIL'}: W66 THE BOMB SHARD WITHHELD -- the `
          + `identical run with sprite shard 13 IN FLIGHT emits the same `
          + `${a.rec} records (expect ${e.records}) starting on the same frame `
          + `${a.first} (expect ${e.first}), draws ${a.drawn} of them (expect 0) `
          + `and reports ${a.pend} PENDING ON SHARD 13 (expect ${e.records}) and `
          + `${a.named} as MISSING ART (expect 0 -- a shard in flight is not a `
          + 'missing picture). Nothing before the press differs, which is what '
          + 'says the shard and not the port is what makes the bomb visible');
        if (!ok) code = 1;
      }
    }

    if (portBrk === 'lag-0') {
      // Rendering the list the CURRENT step just built. Re-run the window that
      // way and require the offset to STOP being constant.
      let bad = 0, c0 = null, n = 0;
      const g2 = new Game(bundle.seed, bundle.tables, {
        logicFrame: bundle.cap.frames[0].lf, videoFrame: bundle.cap.frames[0].vf,
        bgSeed: bundle.cap.part(0, 'bg'),
      });
      for (let i = 0; i < 200; i++) {
        const prevY = g2.ram.u16(RAM.player1 + P.posY);
        g2.ram.setU8(0x810424, 0xff);
        g2.step(UP);
        const now = portSpriteList(g2.ram, useMap, { out: buf, ...shardOpts });   // LAG 0
        const ship = shipOf(now.words);
        if (!ship) continue;
        n++;
        const d = ship.x - (prevY >> 6);
        if (c0 === null) c0 = d; else if (d !== c0) bad++;
      }
      console.log(`${bad > 0 ? 'EXPECTED-RED' : 'FAIL'} [--break lag-0]: `
        + `rendering the CURRENT step's list breaks the offset on ${bad} of ${n} `
        + `frames${bad > 0 ? '' : ' -- NOTHING MOVED, so the hold is untested'}`);
      code = bad > 0 ? 0 : 1;
    } else if (portBrk) {
      // Every port break must have moved one of the numbers above. Say WHICH,
      // so a break that silently passes cannot look like a green run.
      const moved = !portOk || !guardOk || !holdOk;
      const why = {
        'no-remap': `${pSkip} of ${pRec} records in the FIRST window have no `
          + `key at all (unbroken: 0), across ${misses.size} addresses`,
        'drop-one-stream': `$166EE4 skipped ${dropCount} times and drawn `
          + `${pDrawn} (unbroken: ${EXP.records} - ${dropCount} = `
          + `${EXP.records - dropCount})`,
        'terminate-instead-of-zero-width': `the renderer sees ${gVisible} of `
          + `${gRec} records past the first gap (unbroken: all of them)`,
        'no-extent-check': `the $000000 over-read is ${gMiss.has(NULL_STREAM)
          ? 'STILL named' : 'no longer named'} and the guard `
          + `${guardOk ? 'still passes' : 'fails'}`,
      }[portBrk];
      console.log(`${moved ? 'EXPECTED-RED' : 'FAIL'} [--break ${portBrk}]: `
        + (moved ? why
          : `${why} -- NOTHING MOVED, this check cannot fail and is worth `
            + 'nothing'));
      code = moved ? 0 : 1;
      if (portBrk === 'drop-one-stream' && moved) {
        const exact = pDrawn === EXP.records - dropCount && dropCount > 0;
        console.log(`  ${exact ? 'and EXACTLY' : 'but NOT exactly'}: drawn fell `
          + `by ${EXP.records - pDrawn} for ${dropCount} skipped records`);
        if (!exact) code = 1;
      }
    }
  }
} catch (e) {
  if (fetchBrk) {
    const first = String(e.message).split('\n')[0];
    console.log(`EXPECTED-RED [--break ${fetchBrk}]: ${e.name}: ${first}`);
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
