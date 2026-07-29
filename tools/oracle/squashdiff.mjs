// MODE 7 -- the OPTIONS squash (loc_00_0935) -- port vs cartridge, PER SCANLINE.
//
// rasterdiff.mjs covers seven of the eight $0857 arms and 335,664 scanlines.
// It cannot cover this one: mode 7 belongs to a SCREEN, not a level, so
// rastertrace.py (which boots into a level) never reaches it and rasterport.mjs
// has no level to drive.  That gap is exactly why a one-line offset in
// squashBands survived every register comparison in the suite and had to be
// found in pixels.
//
// The cartridge side is tools/oracle/rastersquash.py, which walks the real menu
// to loc_00_3893 and hooks the arm's last instruction ($095B), so both the line
// it fired on and the values it wrote are measured rather than modelled.
//
// THE ONE RULE THIS FILE IS ABOUT.  Mode 7 re-arms rLYC every single line
// ($0937: INC (HL)), and its store to rSCY is the last thing it does ($095A),
// by which point the fetcher has already latched the current line's scroll.
// So a value written by the arm that fired on line L is displayed from line
// L+1.  Every other arm re-arms several lines ahead and the distinction never
// shows.  MEASURED against menuscreen.mjs's recorded options screen: with the
// shift the port is 23040/23040, without it 22004/23040 and the sequence of
// values is byte-identical either way -- only its line assignment moves.
//
// Usage:
//   python tools/oracle/rastersquash.py --frames 240
//   node tools/oracle/squashdiff.mjs [--show 3]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const REF = path.join(ROOT, 'rip', 'oracle', 'rastersquash.json');

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { squashBands, RASTER_SQUASH } = await imp('src/raster.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const show = parseInt(arg('show', '0'), 10);
const FRAMES = parseInt(arg('frames', '240'), 10);
const H = 144;

if (argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync('python', ['tools/oracle/rastersquash.py', '--frames', String(FRAMES),
    '--out', path.relative(ROOT, REF)], { cwd: ROOT, stdio: 'inherit' });
}
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));

/**
 * The measured event stream of one frame -> 144 rows of [scy, bgp].
 *
 * Line 0 carries what the VBlank tail left ($0852's snapshot); the arm that
 * fired on line L supplies lines L+1 and below until the next one.  That "+1"
 * IS the rule under test -- see the header.
 */
function expand(frame) {
  const rows = [];
  const evs = frame.bands.slice().sort((a, b) => a.ly - b.ly);
  let scy = frame.base.scy, bgp = frame.base.bgp;
  let i = 0;
  for (let y = 0; y < H; y++) {
    while (i < evs.length && evs[i].ly + 1 <= y) {
      scy = evs[i].scy; bgp = evs[i].bgp; i++;
    }
    rows.push([scy, bgp]);
  }
  return rows;
}

const SQUASH_BGP = 0x1B;                          // $094F

let badLines = 0, badHandoff = 0, compared = 0, shown = 0;
const deltas = new Set();
const firstBad = [];
const strays = [];

const all = ref.frames.slice(0, FRAMES);
for (let fi = 0; fi < all.length - 1; fi++) {
  const f = all[fi];
  // WHICH $C763 THE ARMS ACTUALLY RAN WITH, and it is not this frame's `in`.
  //
  // rastersquash.py groups a frame as: the $0A4F sample ('in'), then the
  // VBlank tail ($0852, 'base'), then the arms.  The delta ramp lives in the
  // VBlank half ($0835-$0851), i.e. BETWEEN the sample and the arms -- so
  // `in.c763` is the pre-ramp value and the arms ran one step ahead of it.
  // The next frame's sample is that post-ramp value.  MEASURED: at f14
  // `in.c763` is 1 while the arms accumulate at 2, which is f15's sample.
  // Not a port bug and not a recorder bug: just the sampling point.
  const delta = all[fi + 1].in.c763;
  // The port's squash is a pure function of $C763 and the VBlank base, both of
  // which the recording carries -- so this needs no game state at all.
  const state = { raster: { mode: RASTER_SQUASH, delta } };
  const base = { from: 0, scx: f.base.scx, scy: f.base.scy, bgp: f.base.bgp,
                 obp0: 0, obp1: 0 };
  const { bands, handoff } = squashBands(state, base, H);
  deltas.add(delta);

  // bandFor, inlined: mode 7 emits one band per line, but do not assume it.
  const rows = [];
  let b = bands[0], bi = 0;
  for (let y = 0; y < H; y++) {
    while (bi + 1 < bands.length && bands[bi + 1].from <= y) b = bands[++bi];
    rows.push([b.scy & 0xFF, b.bgp & 0xFF]);
  }

  // THE HANDOFF, read off the arm that performed it rather than off `in`.
  // $0953 stores rLYC -- already INCremented at $0937 -- into $FFAC, so the
  // window starts one line BELOW the line the crossing arm fired on. The
  // $095B hook records $FFAC at that instant; `in.ffac` is two display frames
  // stale and is not usable here.
  const cut = f.bands.findIndex((b) => b.bgp === SQUASH_BGP);
  const romHandoff = cut < 0 ? null : f.bands[cut].ly + 1;

  // THE STRAY RE-FIRE, measured on 3 of 240 frames and counted rather than
  // failed. The handoff arm parks rLYC at 0, which cannot match again -- but
  // if a STAT request was already latched when it did so, the ISR runs ONE
  // more time below the handoff line and writes a scroll the model has no way
  // to predict (f58: an extra arm at ly 89 storing SCY 2, with rLYC left at
  // 1). That is the interrupt-latency race of section 28 in miniature. A port
  // that renders one coherent frame per tick cannot reproduce it, and a
  // scenario that "passed" by modelling it would be modelling noise.
  if (cut >= 0 && cut !== f.bands.length - 1) {
    strays.push(f.f);
    continue;
  }

  const want = expand(f);
  for (let y = 0; y < H; y++) {
    compared++;
    if (want[y][0] === rows[y][0] && want[y][1] === rows[y][1]) continue;
    badLines++;
    if (firstBad.length < 12) {
      firstBad.push(`f${f.f} line ${y}: rom scy=${want[y][0]} bgp=$${want[y][1].toString(16)}`
        + `  port scy=${rows[y][0]} bgp=$${rows[y][1].toString(16)}`);
    }
  }

  if (romHandoff !== handoff) {
    badHandoff++;
    if (firstBad.length < 12) {
      firstBad.push(`f${f.f} handoff: rom=${romHandoff} port=${handoff}`);
    }
  }

  if (show && shown < show) {
    shown++;
    const span = (r) => r.map((v) => v[0]).slice(0, 90).join(',');
    console.log(`f${f.f} delta=${delta} fires=${f.bands.length} handoff=${romHandoff}`);
    console.log(`  rom  ${span(want)}`);
    console.log(`  port ${span(rows)}`);
  }
}

console.log(`\nmode-7 squash: ${ref.frames.length} frames, ${compared} scanlines, `
  + `$C763 values ${[...deltas].sort((a, b) => a - b).join(',')}`);
if (strays.length) {
  console.log(`stray post-handoff ISR fires on ${strays.length} frame(s) `
    + `(${strays.join(', ')}) -- section 28, excluded from the diff.`);
}
console.log(`bad lines ${badLines}, bad handoffs ${badHandoff}  -- `
  + (badLines || badHandoff ? 'FAIL' : 'ok'));
for (const s of firstBad) console.log('  ' + s);
process.exit(badLines || badHandoff ? 1 : 0);
