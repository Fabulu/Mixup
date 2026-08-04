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
import { loadBundle, httpReader, AssetError } from '../src/web/assets.js';
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
if (brk && !BREAKS.includes(brk) && !PORT_BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: `
    + `${[...BREAKS, ...PORT_BREAKS].join(', ')}`);
  process.exit(2);
}
const portBrk = PORT_BREAKS.includes(brk) ? brk : null;
const fetchBrk = BREAKS.includes(brk) ? brk : null;

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

  if (fetchBrk) {
    console.log(`EXPECTED-RED [--break ${fetchBrk}]: the bundle LOADED anyway -- `
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
    //   * 16,457 records over 300 STEPS, 20..69 per frame -- not an empty list,
    //     not the recording (7,671 over 161), not a capped one.
    //   * ZERO MISSED in that window. The shipped sheet covers the port's own
    //     emitter completely for the first 5.32 s from THIS seed.
    //   * bucket 0 -- THE ENEMIES -- carries >= 14 records on EVERY one of the
    //     300 frames, and every one of them survives the remap.
    //   * and then a SECOND window to lf2400, where `skipped` must be > 0 and
    //     the named misses must include $233F34. A guard that never fires is
    //     not a guard, and this is the half that proves it fires.
    const EXP = { steps: 300, records: 16457, min: 20, max: 69, b0min: 14 };
    const map = romToPackedMap(bundle.manifest);
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
    let dropCount = 0, seedRec = 0;
    const misses = new Map();
    for (let i = 0; i <= EXP.steps; i++) {
      const before = portSpriteList(game.ram, useMap, { out: buf, mutate });
      if (i === 0) seedRec = before.records;    // the BOARD's own seeded list
      if (i > 0) {
        // The window the numbers above are stated over: the 300 lists 300 STEPS
        // produced, i.e. NOT the seed's own.
        pRec += before.records; pDrawn += before.drawn; pSkip += before.skipped;
        pMin = Math.min(pMin, before.records); pMax = Math.max(pMax, before.records);
        for (const [o, c] of before.missing) {
          misses.set(o, (misses.get(o) ?? 0) + c);
          if (o === DROP) dropCount += c;
        }
      }
      if (i === EXP.steps) break;
      game.ram.setU8(0x810424, 0xff);           // the page's own intervention
      game.step(0xffff);                        // nothing pressed
      b0Min = Math.min(b0Min, game.displayList.perBucketRecords[0]);
    }
    const named = [...misses.entries()].sort((a, b) => b[1] - a[1])
      .map(([o, c]) => `$${o.toString(16).toUpperCase().padStart(6, '0')}x${c}`);
    const portOk = pRec === EXP.records && pMin >= EXP.min && pMax <= EXP.max
      && pSkip === 0 && b0Min >= EXP.b0min;
    console.log(`${portOk ? 'PASS' : 'FAIL'}: W44 the PORT'S OWN display list `
      + `over ${EXP.steps} steps from the shipped seed, nothing pressed -- `
      + `${pRec} records (expect ${EXP.records}), ${pMin}..${pMax} per frame `
      + `(expect ${EXP.min}..${EXP.max}), ${pDrawn} drawn, ${pSkip} MISSED `
      + `(expect 0), bucket 0 >= ${b0Min} on every frame (expect >= ${EXP.b0min}), `
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
      const before = portSpriteList(game.ram, useMap, { out: buf, mutate });
      gRec += before.records; gSkip += before.skipped;
      gVisible += parseSpriteList(before.words, RAM_STRIDE).length;
      for (const [o, c] of before.missing) gMiss.set(o, (gMiss.get(o) ?? 0) + c);
      game.ram.setU8(0x810424, 0xff);
      game.step(0xffff);
    }
    const FIRST_MISS = 0x233f34;                // [M] a 5x80 BACKGROUND element
    const NULL_STREAM = 0x000000;               // [M] 3x40 against 10 mask words
    const guardOk = gSkip > 0 && gMiss.has(FIRST_MISS) && gMiss.has(NULL_STREAM)
      && gVisible === gRec;
    console.log(`${guardOk ? 'PASS' : 'FAIL'}: W44 the guard FIRES -- to lf2700, `
      + `${gRec} records, ${gSkip} MISSED (expect > 0), `
      + `${gMiss.size} distinct addresses, includes $233F34 `
      + `(${gMiss.has(FIRST_MISS) ? 'yes' : 'NO'}) and the $000000 over-read `
      + `(${gMiss.has(NULL_STREAM) ? `yes x${gMiss.get(NULL_STREAM)}` : 'NO'}); `
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
      const held = portSpriteList(game.ram, useMap, { out: buf, mutate });
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
        const now = portSpriteList(g2.ram, useMap, { out: buf });   // LAG 0
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
