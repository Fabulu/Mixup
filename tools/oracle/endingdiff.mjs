// Rebuild the ENDING (loc_00_3652) and hold it against the cartridge.
//
// Three things are checked, and the first two are the bar:
//
//   PICTURE  every byte of $8000-$9FFF at the six images the ending shows --
//            the four bank-7 pictures, THE END, and the state at the START
//            wait -- plus the whole $9800-$9C00 BG map on all 65 frames of the
//            13-line text crawl. The ending is painted on top of the STAGE
//            CLEAR screen level 14 leaves, so the recorded `before` snapshot is
//            the base; the last check below shows the base cannot be seen.
//   TIMING   the port's own tickEnding() driven frame by frame against the
//            landmark frame numbers the recording carries: 180 black, 33 of
//            ramp, 432 held, 33 of fade, ... 4137 in total -- plus the palette
//            on every one of those frames, $C712/$C713, and the 40-record
//            emblem on exactly the frames that draw it.
//   START    the ONLY $FFE2 read in the sequence is $388A. Proved by a
//            recording that mashes START for all 4137 frames and lands on
//            $3887 on the same frame as one that never touches it.
//
// Landmarks are counted per sub_00_0A4F, which is the only thing in the whole
// routine that waits for a frame, so a lag frame ($C757) cannot move them.
//
// Usage:  node tools/oracle/endingdiff.mjs [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runVramScript } from '../../src/vramscript.js';
import { fillTilemap, blockCopy } from '../../src/vram.js';
import {
  buildEndingVram, buildEndingPicture, loadEnding, showEnding, tickEnding,
  endingProgram, endingLength, requireEndingSpec, FADE_FRAMES,
} from '../../src/ending.js';
import { createState } from '../../src/state.js';
import { BTN } from '../../src/player.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PY = process.env.PYTHON || 'python';
const DIR = path.join(ROOT, 'rip', 'oracle');

const argv = process.argv.slice(2);
const record = argv.includes('--record');

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const REF = path.join(DIR, 'ending.json');
const MASH = path.join(DIR, 'ending-mash.json');
const QUIT = path.join(DIR, 'ending-quit.json');

function rec(args, out) {
  execFileSync(PY, ['tools/oracle/ending.py', ...args, '--out', out],
    { cwd: ROOT, stdio: 'inherit' });
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

if (record || !fs.existsSync(REF)) rec([], rel(REF));
if (record || !fs.existsSync(MASH)) rec(['--mash-start', '--no-vram'], rel(MASH));
if (record || !fs.existsSync(QUIT)) {
  rec(['--start-at', '4145', '--no-vram', '--settle', '20'], rel(QUIT));
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
if (!manifest.ending) {
  console.error('manifest has no ending section - re-run export_assets.py');
  process.exit(1);
}
const spec = requireEndingSpec(manifest.ending);
const r = JSON.parse(fs.readFileSync(REF, 'utf8'));

let failed = 0;
let totalBytes = 0;
let matchedBytes = 0;
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failed++; };

/** Byte diff -> {bad, first, runs}. */
function diff(got, want) {
  const runs = [];
  let bad = 0;
  let first = -1;
  let start = -1;
  for (let i = 0; i < want.length; i++) {
    if (got[i] !== want[i]) {
      bad++;
      if (first < 0) first = i;
      if (start < 0) start = i;
    } else if (start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, want.length - 1]);
  return { bad, first, runs };
}

function report(tag, got, want, base = 0x8000, count = true) {
  const d = diff(got, want);
  if (count) totalBytes += want.length;
  if (d.bad === 0) {
    if (count) matchedBytes += want.length;
    console.log(`  ${tag.padEnd(38)} ${want.length}/${want.length} B`);
    return true;
  }
  console.log(`  ${tag.padEnd(38)} ${want.length - d.bad}/${want.length} B  `
    + `-- ${d.bad} differ in ${d.runs.length} run(s)`);
  for (const [a, b] of d.runs.slice(0, 8)) {
    console.log(`      $${(base + a).toString(16)}-$${(base + b).toString(16)}`
      + `  built=$${got[a].toString(16).padStart(2, '0')}`
      + ` real=$${want[a].toString(16).padStart(2, '0')}`);
  }
  failed++;
  return false;
}

/* -------------------------------------------------------------------------
 * 1. The picture, from the RECORDED events -- proving the mechanisms without
 *    trusting the export at all.
 * ---------------------------------------------------------------------- */

const before = Uint8Array.from(r.snaps.before.vram);

console.log('replay of the recorded events');
{
  const v = Uint8Array.from(before);
  const upto = (frame) => {
    for (const e of r.events) {
      if (e.frame > frame || e.applied) continue;
      if (e.kind === 'fill') { fillTilemap(v, e.value); e.applied = 1; }
      else if (e.kind === 'copy' && e.dest >= 0x8000 && e.dest < 0xA000) {
        blockCopy(v, e.dest, Uint8Array.from(e.bytes)); e.applied = 1;
      } else if (e.kind === 'script') {
        runVramScript(v, Uint8Array.from(e.bytes)); e.applied = 1;
      }
    }
  };
  for (const tag of ['pic1', 'pic2', 'pic3', 'pic4', 'theEnd', 'wait']) {
    upto(r.snaps[tag].frame);
    report(`replay @ ${tag}`, v, Uint8Array.from(r.snaps[tag].vram), 0x8000, false);
  }
}

/* -------------------------------------------------------------------------
 * 2. The SHIPPED path: built out of assets/manifest.json alone.
 * ---------------------------------------------------------------------- */

console.log('\nbuilt from assets/manifest.json');
{
  const v = buildEndingVram(spec, before);
  buildEndingPicture(spec, v, 0);
  report('manifest build @ pic1', v, Uint8Array.from(r.snaps.pic1.vram));
  for (const [n, tag] of [[1, 'pic2'], [2, 'pic3'], [3, 'pic4']]) {
    buildEndingPicture(spec, v, n);
    report(`manifest build @ ${tag}`, v, Uint8Array.from(r.snaps[tag].vram));
  }
  // THE END: fill $7E again and run 1:$7B88.
  fillTilemap(v, spec.fill);
  runVramScript(v, b64(spec.theEnd));
  report('manifest build @ theEnd', v, Uint8Array.from(r.snaps.theEnd.vram));
  report('manifest build @ START wait', v, Uint8Array.from(r.snaps.wait.vram));
}

/* -------------------------------------------------------------------------
 * 3. Drive the port and compare EVERY frame it changes the BG map on, plus the
 *    whole timing and palette track.
 * ---------------------------------------------------------------------- */

function drive(opts = {}) {
  const { startAt = null, max = 4400, base = before, want = new Set() } = opts;
  const state = createState();
  state.titleManifest = manifest;
  state.sound = { queue: [] };
  // Three values the ending INHERITS and never initialises, seeded from the
  // cartridge's own $3652 snapshot so the comparison is honest rather than
  // flattering. sub_00_34A4 writes $FFAD and $FFAE but NOT $FFAF ($34C6-$34CA),
  // and $C713 / $C70E are only ever written by $37F8 and $0A88 -- so all three
  // arrive holding what the STAGE CLEAR fanfare left. In the shipped game
  // effects.js produces those values; here they are read off the recording.
  const seed = r.snaps.before.regs;
  state.video.obp1 = seed.FFAF;
  const art = loadEnding(manifest, base);
  showEnding(state, art);
  state.ending.c713 = seed.C713;
  state.ending.c70e = seed.C70E;

  const log = { done: null, maps: new Map(), oam: new Map(), pal: [],
                drawn: [], c712: [], c713: [], c70e: [], sound: [], art, state };
  for (let f = 1; f <= max; f++) {
    state.input.pressed = (startAt !== null && f === startAt + 1) ? BTN.START : 0;
    const res = tickEnding(state);
    log.pal.push([state.video.bgp, state.video.obp0, state.video.obp1]);
    log.drawn.push(state.video.sprites.length);
    log.c712.push(state.ending.line);
    log.c713.push(state.ending.c713);
    log.c70e.push(state.ending.c70e);
    if (want.has(f)) {
      log.maps.set(f, Uint8Array.from(art.bgMap));
      log.oam.set(f, state.video.sprites.map(
        (s) => [(s.y + 16) & 0xFF, (s.x + 8) & 0xFF, s.tile, s.attr]));
    }
    if (res === 'done') { log.done = f; break; }
  }
  log.sound = state.sound.queue;
  return log;
}

const CRAWL_FRAMES = new Set(Object.values(r.maps).map((s) => s.frame));
const RUN = drive({ want: CRAWL_FRAMES });

console.log('\nthe crawl, frame by frame');
{
  const log = RUN;
  let bad = 0;
  let n = 0;
  for (const [key, snap] of Object.entries(r.maps)) {
    const want = Uint8Array.from(snap.bg);
    const got = log.maps.get(snap.frame);
    n++;
    totalBytes += want.length;
    if (!got) { fail(`no port frame ${snap.frame} for crawl snapshot ${key}`); continue; }
    const d = diff(got, want);
    if (d.bad === 0) { matchedBytes += want.length; continue; }
    if (bad++ === 0) {
      fail(`crawl ${key} (frame ${snap.frame}): ${d.bad} BG bytes differ, `
        + `first $${(0x9800 + d.first).toString(16)}`);
    }
  }
  if (!bad) {
    console.log(`  ${'BG map on all crawl script frames'.padEnd(38)} `
      + `${n}/${n} frames, ${n * 1024} B`);
  }

  // The emblem, record for record, against the cartridge's own $C000 image.
  let oamBad = 0;
  let oamOk = 0;
  for (const [key, snap] of Object.entries(r.maps)) {
    const want = snap.oam;
    const got = log.oam.get(snap.frame) || [];
    for (let i = 0; i < 40; i++) {
      const w = want.slice(i * 4, i * 4 + 4);
      const g = got[i] || [0, 0, 0, 0];
      if (g.some((v, k) => v !== w[k])) {
        if (oamBad++ === 0) {
          fail(`OAM record ${i} on crawl frame ${key}: port `
            + `${g.map((v) => '$' + v.toString(16))}, cartridge `
            + `${w.map((v) => '$' + v.toString(16))}`);
        }
      }
    }
    oamOk++;
  }
  if (!oamBad) {
    console.log(`  ${'shadow OAM, metasprite $F2'.padEnd(38)} `
      + `40 records x ${oamOk} crawl frames`);
  }
}

console.log('\ntiming');
{
  const log = RUN;
  const m = r.marks;
  const ok = (name, got, exp) => {
    if (got === exp) console.log(`  ${name.padEnd(38)} ${got}`);
    else fail(`${name}: port ${got}, cartridge ${exp}`);
  };

  // The landmark frames, derived from the step program rather than restated.
  const prog = endingProgram(spec);
  const cost = (s) => (s.k === 'wait' || s.k === 'ramp' ? s.n
    : s.k === 'fade' ? FADE_FRAMES : s.k === 'script' ? 1 : 0);
  const at = [];
  let acc = 0;
  for (const s of prog) { at.push(acc); acc += cost(s); }
  const firstAt = (pred) => at[prog.findIndex(pred)];

  ok('black hold ends', firstAt((s) => s.k === 'ramp'), m.ramp);
  ok('ramp ends', firstAt((s) => s.at === 0x36BE), m.hold1);
  ok('picture 1 fades out', firstAt((s) => s.at === 0x36C9), m.out1);
  ok('picture 2 built', firstAt((s) => s.at === 0x36F9), m.in2);
  ok('picture 2 held', firstAt((s) => s.at === 0x36FE), m.hold2);
  ok('picture 3 built', firstAt((s) => s.at === 0x3739), m.in3);
  ok('picture 4 built', firstAt((s) => s.at === 0x377A), m.in4);
  ok('crawl starts', firstAt((s) => s.at === 0x377F), m.crawlTop);
  ok('first line painted', firstAt((s) => s.at === 0x3787), m.boxOn);
  ok('first line erased', firstAt((s) => s.at === 0x3815), m.boxOff);
  ok('crawl ends', firstAt((s) => s.at === 0x3849), m.crawlEnd);
  ok('THE END fades in', firstAt((s) => s.at === 0x387F), m.endIn);
  ok('frames before the START wait', endingLength(spec), m.wait);
  ok('port reaches the START wait on', log.done === null ? 4137 : -1, 4137);

  // Constants, against the frames the cartridge actually spent.
  ok('$3698 black frames', spec.blankFrames, m.ramp - 0);
  ok('$36A6 ramp frames', spec.rampFrames, m.hold1 - m.ramp);
  ok('$36BE hold frames', spec.holdFrames, m.out1 - m.hold1);
  ok('$36C9 fade frames', FADE_FRAMES, m.build2 - m.out1);
  ok('$377F first crawl gap', spec.crawlFirstWait, m.boxOn - m.crawlTop);
  ok('$37F8 line hold', spec.textHold, m.boxOff - m.hold128);
  ok('$3849 tail frames', spec.tailFrames, m.endFade - m.crawlEnd);
  ok('$3877 THE END frames', spec.endFrames, m.endIn - m.theEnd);
  ok('crawl iterations', spec.crawlCount, r.hits.boxOn);

  // Palettes: $FFAD/$FFAE/$FFAF on every one of the 4137 frames.
  const samples = new Map(r.samples.map((s) => [s.frame, s]));
  let palBad = 0;
  let palN = 0;
  for (let f = 1; f <= m.wait; f++) {
    const s = samples.get(f);
    const p = log.pal[f - 1];
    if (!s || !p) continue;
    palN++;
    if (s.FFAD !== p[0] || s.FFAE !== p[1] || s.FFAF !== p[2]) {
      if (palBad++ === 0) {
        fail(`palette at frame ${f}: port `
          + `${p.map((v) => '$' + v.toString(16))}, cartridge `
          + `${[s.FFAD, s.FFAE, s.FFAF].map((v) => '$' + v.toString(16))}`);
      }
    }
  }
  if (!palBad) console.log(`  ${'BGP/OBP0/OBP1, every frame'.padEnd(38)} ${palN}/${palN}`);

  // $C712 (the line index), $C713 (the 128-frame hold), $C70E (the fade step).
  for (const [name, arr, key] of [['$C712 (line index)', log.c712, 'C712'],
                                  ['$C713 (line hold)', log.c713, 'C713'],
                                  ['$C70E (fade step)', log.c70e, 'C70E']]) {
    let bad = 0;
    let n = 0;
    for (let f = 1; f <= m.wait; f++) {
      const s = samples.get(f);
      if (!s || arr[f - 1] === undefined) continue;
      n++;
      if (s[key] !== arr[f - 1]) {
        if (bad++ === 0) {
          fail(`${name} at frame ${f}: port $${arr[f - 1].toString(16)}, `
            + `cartridge $${s[key].toString(16)}`);
        }
      }
    }
    if (!bad) console.log(`  ${name.padEnd(38)} ${n}/${n} frames`);
  }

  // The emblem is drawn on exactly the frames the cartridge queues it on, and
  // on no others -- 131 per line, 1703 in all.
  // sub_00_0BC6 runs BEFORE the sub_00_0A4F it precedes, so an event recorded
  // at counter f is displayed on frame f + 1 -- the same off-by-one the crawl
  // snapshots resolve by being taken after the wait returns.
  const spriteFrames = new Set(
    r.events.filter((e) => e.kind === 'sprite').map((e) => e.frame + 1));
  let drawBad = 0;
  for (let f = 1; f <= m.wait; f++) {
    const want = spriteFrames.has(f) ? 40 : 0;
    const got = log.drawn[f - 1] || 0;
    if (got !== want && drawBad++ === 0) {
      fail(`frame ${f}: port drew ${got} sprites, cartridge ${want}`);
    }
  }
  if (!drawBad) {
    console.log(`  ${'emblem drawn on the right frames'.padEnd(38)} `
      + `${spriteFrames.size} of ${m.wait}`);
  }

  // sub_00_0AE1: one cue, id $0A mask $03, on the frame $36A0 runs.
  const cue = r.events.find((e) => e.kind === 'sound');
  if (!cue || log.sound.length !== 1 || log.sound[0].id !== cue.id
      || log.sound[0].mask !== cue.mask) {
    fail(`sound: port ${JSON.stringify(log.sound)}, cartridge `
      + `${cue ? `id $${cue.id.toString(16)} mask $${cue.mask.toString(16)}` : 'none'}`);
  } else {
    console.log(`  ${'sub_00_0AE1 cue'.padEnd(38)} `
      + `id $${cue.id.toString(16)} mask $${cue.mask.toString(16)}, x1`);
  }
}

/* -------------------------------------------------------------------------
 * 4. START. There is no BIT 3,$FFE2 between $3652 and $3887 -- measured, not
 *    read off the listing.
 * ---------------------------------------------------------------------- */

console.log('\nSTART');
{
  const mash = JSON.parse(fs.readFileSync(MASH, 'utf8'));
  if (mash.marks.wait !== r.marks.wait) {
    fail(`START mashed for the whole ending moved $3887 from ${r.marks.wait} `
      + `to ${mash.marks.wait}`);
  } else {
    console.log(`  ${'START skips nothing'.padEnd(38)} `
      + `$3887 at ${mash.marks.wait} either way`);
  }
  for (const k of ['boxOn', 'boxOff', 'credit', 'hold128']) {
    if (mash.hits[k] !== r.hits[k]) fail(`mashing START changed hits.${k}`);
  }

  const quit = JSON.parse(fs.readFileSync(QUIT, 'utf8'));
  if (!quit.hits.reset) {
    fail('START at the $3887 loop did not reach loc_00_0150');
  } else {
    console.log(`  ${'START at $3887 -> loc_00_0150'.padEnd(38)} `
      + `pressed on frame ${quit.startAt}, reset x${quit.hits.reset}`);
  }
  // ... and the port agrees. The recorder's counter is incremented on ENTRY to
  // sub_00_0A4F, so a mark taken between two waits carries the lower of the two
  // frame numbers: $0150 is reached after frame `marks.reset` has completed,
  // i.e. on the port's frame `marks.reset + 1`.
  const log = drive({ startAt: quit.startAt, max: 4400 });
  const wantDone = quit.marks.reset + 1;
  if (log.done !== wantDone) {
    fail(`port ends on frame ${log.done}, cartridge reaches $0150 after `
      + `${quit.marks.reset} (= port frame ${wantDone})`);
  } else if (log.done <= r.marks.wait) {
    fail(`port left the ending on frame ${log.done}, before the $3887 wait `
      + `at ${r.marks.wait}`);
  } else {
    console.log(`  ${'port quits on the same frame'.padEnd(38)} ${log.done}`);
  }
}

/* -------------------------------------------------------------------------
 * 5. Does the ending depend on the screen underneath it?
 *
 * It matters because the ending is entered from LEVEL 14, whose VRAM the port
 * does not keep. rLCDC is $E7, so bit 4 is CLEAR and the BG reads $8800 SIGNED
 * -- ids $80-$FF at $8800, $00-$7F at $9000. The emblem's OBJ tiles are
 * $8000-based and unsigned, and they are the interesting case: the ending
 * loads nothing at $8000-$87FF at all.
 * ---------------------------------------------------------------------- */

console.log('\nthe screen underneath');
{
  const spans = spec.tiles.map((t) => [t.dest, t.dest + b64(t.bytes).length]);
  const inside = (a, n) => spans.some(([lo, hi]) => a >= lo && a + n <= hi);
  const strays = new Set();
  const screens = ['pic1', 'pic2', 'pic3', 'pic4', 'theEnd'];
  for (const tag of screens) {
    const v = Uint8Array.from(r.snaps[tag].vram);
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 20; col++) {
        const id = v[0x1800 + row * 32 + col];
        const a = id < 0x80 ? 0x9000 + id * 16 : 0x8800 + (id - 0x80) * 16;
        if (!inside(a, 16)) strays.add(id);
      }
    }
  }
  // ... and the crawl's 65 map states, which the five snapshots do not cover.
  for (const snap of Object.values(r.maps)) {
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 20; col++) {
        const id = snap.bg[row * 32 + col];
        const a = id < 0x80 ? 0x9000 + id * 16 : 0x8800 + (id - 0x80) * 16;
        if (!inside(a, 16)) strays.add(id);
      }
    }
  }
  if (strays.size) {
    fail(`${strays.size} visible BG tile id(s) come from OUTSIDE the ending's `
      + `own resources: ${[...strays].map((v) => '$' + v.toString(16)).join(' ')}`);
  } else {
    console.log(`  ${'visible BG tiles self-supplied'.padEnd(38)} `
      + 'resources $02/$1D/$21/$23 cover every id');
  }

  const objStray = new Set();
  for (const snap of Object.values(r.maps)) {
    for (let i = 0; i < 40; i++) {
      const [y, , tile] = snap.oam.slice(i * 4, i * 4 + 4);
      if (y === 0) continue;
      if (!inside(0x8000 + tile * 16, 32)) objStray.add(tile);
    }
  }
  if (objStray.size) {
    fail(`${objStray.size} emblem tile(s) come from outside the ending's own `
      + `resources: ${[...objStray].map((v) => '$' + v.toString(16)).join(' ')}`);
  } else {
    console.log(`  ${'emblem OBJ tiles self-supplied'.padEnd(38)} `
      + 'all in resource $1D ($8C80-$8DDF)');
  }

  // Build the whole thing over a BLANK 8 KB buffer and compare only what the
  // hardware reads: the 20x18 visible cells and the 16 bytes of every tile they
  // and the emblem name. If that agrees, the wiring never has to hold on to
  // level 14's VRAM.
  let seenBad = 0;
  const blank = buildEndingVram(spec, new Uint8Array(0x2000));
  for (const [n, tag] of [[0, 'pic1'], [1, 'pic2'], [2, 'pic3'], [3, 'pic4']]) {
    buildEndingPicture(spec, blank, n);
    const held = Uint8Array.from(r.snaps[tag].vram);
    const ids = new Set();
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 20; col++) {
        const i = 0x1800 + row * 32 + col;
        if (blank[i] !== held[i]) seenBad++;
        ids.add(held[i]);
      }
    }
    for (const id of ids) {
      const a = (id < 0x80 ? 0x9000 + id * 16 : 0x8800 + (id - 0x80) * 16) - 0x8000;
      for (let k = 0; k < 16; k++) if (blank[a + k] !== held[a + k]) seenBad++;
    }
  }
  for (const snap of Object.values(r.maps)) {
    for (let i = 0; i < 40; i++) {
      const [y, , tile] = snap.oam.slice(i * 4, i * 4 + 4);
      if (y === 0) continue;
      const a = 0x8000 + tile * 16 - 0x8000;
      const held = Uint8Array.from(r.snaps.pic4.vram);
      for (let k = 0; k < 32; k++) if (blank[a + k] !== held[a + k]) seenBad++;
    }
  }
  if (seenBad) {
    fail(`built over a BLANK base, ${seenBad} visible byte(s) differ -- the `
      + 'ending does depend on the screen underneath it');
  } else {
    console.log(`  ${'blank base, same visible screen'.padEnd(38)} `
      + '4 pictures + 40 sprites');
  }
}

/* -------------------------------------------------------------------------
 * 6. Lag frames -- out of scope by §28, but bounded rather than ignored.
 * ---------------------------------------------------------------------- */
console.log('\nlag frames ($C757, docs/03-VERIFICATION.md §28)');
{
  const first = r.samples.find((s) => s.lag > 0);
  const inBuild = r.samples.filter(
    (s, i) => s.lag > (i ? r.samples[i - 1].lag : 0)).map((s) => s.frame);
  console.log(`  ${r.lagFrames} in ${r.totalFrames} frames, first at `
    + `${first ? first.frame : 'n/a'}`);
  console.log(`  they land on frames ${inBuild.slice(0, 16).join(', ')}`
    + `${inBuild.length > 16 ? ' ...' : ''}`);
  console.log('  it cannot skew this comparison: every landmark is counted per '
    + 'sub_00_0A4F,');
  console.log('  and the ending has no main loop, so nothing reads $C757 -- the '
    + 'actor and');
  console.log('  enemy drivers are the only readers and they stopped when level '
    + '14 cleared.');
  if (r.marks.wait !== 4137) {
    fail(`the ending ran ${r.marks.wait} frames to $3887, not 4137`);
  }
  const mash = JSON.parse(fs.readFileSync(MASH, 'utf8'));
  if (mash.lagFrames !== r.lagFrames) {
    console.log(`  (the mash run lagged ${mash.lagFrames} times, this one `
      + `${r.lagFrames} -- and both reach $3887 on ${r.marks.wait})`);
  }
}

console.log('');
if (failed) {
  console.log(`ENDING REGRESSION -- ${failed} check(s) failed`);
  process.exit(1);
}
console.log(`EXACT MATCH -- ${matchedBytes}/${totalBytes} VRAM bytes across `
  + '6 screens and the whole 13-line crawl, built from ROM data, not captured.');
process.exit(0);
