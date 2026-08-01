#!/usr/bin/env node
// THE PIXEL GATE FOR THE PORT'S OWN RENDERER  (wave 6).
//
// For every dumped frame pair (N, N+1): render frame N's video state with
// `games/ddpdoj/src/render/` -- the JS the browser runs -- and diff it against
// MAME's framebuffer for frame N+1, pixel for pixel, byte for byte.
//
//     node tools/pixgate.mjs --rom <romdir> --dump <dumpdir> [--dump <dir> ...]
//     node tools/pixgate.mjs ... --mutate list|<name>|all
//
// WHY THIS IS EVIDENCE AND NOT A TAUTOLOGY.  The two sides are independently
// derived: this side is a transcription of `igs023_video.cpp` into JS, the
// other side is MAME's own C++ executing.  It is deliberately NOT a comparison
// against `tools/framerender.py` -- that would compare a translation with its
// own source and could only ever find typos.  (`docs/knowledge/03`, the
// two-sides rule.)  The Python gate `pgm.py gfx` stays exactly as it was; this
// one exists because the PORT ships JS, and a Python decoder that is bit-exact
// says nothing about the JS the browser runs.
//
// IT IS A GATE, NOT A REPORT.  Non-zero exit if:
//   * any pair is not 100.0000 %,
//   * fewer than --min-pairs pairs were produced (a gate with no input is not
//     a pass -- this is the half that matters more),
//   * no pair had >= --min-sprites sprites,
//   * no pair was a PALETTE FADE (paldelta >= --min-paldelta).  The palette
//     sample-point offset is invisible on every frame that is not a fade
//     (`00-recon-assets.md` §4), so a corpus without one does not test it.
//   * fewer than --min-dense consecutive pairs exist anywhere in the corpus,
//   * any pair was drawn with bg_scale != 0x210 (MAME does not implement the
//     register; 100 % there would be two wrong pictures agreeing).

import fs from 'node:fs';
import path from 'node:path';
import {
  loadRegions, IGS023_LAYOUT, Renderer, paletteRgb, resolveRgb,
  mamePixelsToRgb, parseSpriteList, effectiveZoom, zoomWord,
  bgTile, bgTileReversedPlanes, txTile, beWords, parseRegs,
  SCREEN_W, SCREEN_H,
} from '../src/render/index.js';

// ---------------------------------------------------------------- mutations
//
// RED VALIDATION.  Each breaks ONE rule the decoder claims to get right.  The
// first six are the wave-3 Python set, re-expressed against the JS, so the two
// gates can be compared number for number.  The last three are new and are the
// three things a JS renderer can get wrong that a Python one could not, or that
// wave 3 had no reason to test: the two sample-point offsets, and the sprite/BG
// priority bit.
const MUTATIONS = {
  'tx-msb': {
    doc: 'TX nibble order flipped (packed_msb instead of _lsb)',
    render: { txTileFn: (r, i, o) => txTile(r, i, o, false) },
  },
  'bg-planes': {
    doc: 'BG 5-bit plane weights reversed (planeoffset {0,1,2,3,4})',
    render: { bgTileFn: bgTileReversedPlanes },
  },
  'spr-mask': {
    doc: 'sprite transparency-mask bit polarity inverted',
    draw: { maskBitOpaque: true },
  },
  'zoom-off': {
    doc: 'the zoom loop disabled -- every sprite pretends to be unzoomed',
    draw: { zoomWordFn: () => 0 },
  },
  'spr-order': {
    doc: 'display list drawn FORWARDS (NOTES-machine.md believed this)',
    draw: { spriteOrderReversed: false },
  },
  'u19-at-200000': {
    doc: 'cave_t04401w064.u19 loaded at 0x200000 instead of 0x180000',
    layout: [
      ['pgm_t01s.rom', 0x000000, 0x200000],
      ['cave_t04401w064.u19', 0x200000, 0x800000],
    ],
  },
  'pal-same-frame': {
    doc: "the palette taken from frame N instead of N+1 (sample-point offset 2)",
    palFromState: true,
  },
  'state-same-frame': {
    doc: 'the video state taken from frame N+1 instead of N (offset 1)',
    stateFromPixels: true,
  },
  'pri-ignore': {
    doc: 'sprite-vs-BG priority ignored: a pri=1 sprite drawn over the BG',
    draw: { ignoreBgPriority: true },
  },
};

// ------------------------------------------------------------------- loading
function loadFrame(dir, n) {
  const pre = path.join(dir, `f${String(n).padStart(6, '0')}.`);
  const rd = (ext) => new Uint8Array(fs.readFileSync(pre + ext));
  return {
    palette: beWords(rd('palette.bin')),
    spritebuffer: beWords(rd('spritebuffer.bin')),
    bg: beWords(rd('bg_videoram.bin')),
    tx: beWords(rd('tx_videoram.bin')),
    rowscroll: beWords(rd('rowscroll.bin')),
    zoomram: beWords(rd('zoomram.bin')),
    spriteram: beWords(rd('spriteram.bin')),
    pixels: rd('pixels.bin'),
    regs: parseRegs(fs.readFileSync(pre + 'regs.txt', 'utf8')),
  };
}

/**
 * Every (n, n+1) both of which were dumped.
 *
 * NOTE the deliberate difference from `gfxgate.py`'s `pairs_in`, which pairs
 * frames off two at a time so a run of three is not double-counted.  Wave 6
 * dumps a DENSE STRETCH on purpose, and there every consecutive pair is a
 * separate, legitimate state->pixels comparison; skipping every other one would
 * halve the coverage the stretch exists to provide.  A frame appearing in two
 * pairs is not double counting -- it is once as state and once as pixels.
 */
function pairsIn(dir) {
  const fs_ = new Set();
  for (const f of fs.readdirSync(dir)) {
    const m = /^f(\d+)\.pixels\.bin$/.exec(f);
    if (m) fs_.add(parseInt(m[1], 10));
  }
  const frames = [...fs_].sort((a, b) => a - b);
  return frames.filter((n) => fs_.has(n + 1)).map((n) => [n, dir, n + 1]);
}

/** The longest run of consecutive pairs -- the "dense stretch" the plan asks
 *  for, measured rather than asserted. */
function longestDenseRun(pairs) {
  let best = 0, cur = 0, prev = -99;
  for (const [n] of pairs) {
    cur = (n === prev + 1) ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = n;
  }
  return best;
}

// ---------------------------------------------------------------------- main
function parseArgs(argv) {
  const a = {
    rom: null, dumps: [], minPairs: 0, minSprites: 0, minPaldelta: 0,
    minDense: 0, mutate: null, json: null, quiet: false, limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--rom') a.rom = v();
    else if (k === '--dump') a.dumps.push(v());
    else if (k === '--min-pairs') a.minPairs = +v();
    else if (k === '--min-sprites') a.minSprites = +v();
    else if (k === '--min-paldelta') a.minPaldelta = +v();
    else if (k === '--min-dense') a.minDense = +v();
    else if (k === '--limit') a.limit = +v();
    else if (k === '--mutate') a.mutate = v();
    else if (k === '--json') a.json = v();
    else if (k === '--quiet') a.quiet = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.mutate === 'list') {
    for (const [k, m] of Object.entries(MUTATIONS)) {
      console.log(`${k.padEnd(18)} ${m.doc}`);
    }
    return 0;
  }
  if (a.mutate && a.mutate !== 'all' && !MUTATIONS[a.mutate]) {
    throw new Error(`unknown mutation ${a.mutate}; have ${Object.keys(MUTATIONS)}`);
  }
  if (!a.rom || !a.dumps.length) throw new Error('--rom and --dump are required');

  if (a.mutate === 'all') {
    const base = runGate(a, null);
    console.log(`\nBASELINE: ${base === 0 ? 'PASS' : 'FAIL'}`);
    const undetected = [];
    for (const name of Object.keys(MUTATIONS)) {
      console.log(`\n--- mutation ${name} (must go RED) ---`);
      const rc = runGate({ ...a, quiet: true }, name);
      console.log(`    ${name}: ${rc ? 'RED (good)' : 'STILL GREEN -- THE GATE IS FAKE'}`);
      if (rc === 0) undetected.push(name);
    }
    console.log('\nRED VALIDATION: ' + (!undetected.length && base === 0
      ? 'every mutation was caught'
      : `BROKEN -- baseline=${base === 0 ? 'ok' : 'FAILED'} undetected=${undetected}`));
    return (base === 0 && !undetected.length) ? 0 : 1;
  }
  return runGate(a, a.mutate);
}

function runGate(a, mutName) {
  const mut = mutName ? MUTATIONS[mutName] : {};
  const roms = loadRegions(
    (name) => new Uint8Array(fs.readFileSync(path.join(a.rom, name))),
    { igs023Layout: mut.layout ?? IGS023_LAYOUT });

  const renderer = new Renderer(roms, {
    bgTileFn: mut.render?.bgTileFn ?? bgTile,
    txTileFn: mut.render?.txTileFn ?? txTile,
  });
  const drawOpts = {
    spriteOrderReversed: mut.draw?.spriteOrderReversed ?? true,
    zoomWordFn: mut.draw?.zoomWordFn ?? zoomWord,
    maskBitOpaque: mut.draw?.maskBitOpaque ?? false,
    ignoreBgPriority: mut.draw?.ignoreBgPriority ?? false,
  };

  let pairs = [];
  for (const d of a.dumps) pairs = pairs.concat(pairsIn(d));
  if (a.limit) pairs = pairs.slice(0, a.limit);

  let exact = 0, total = 0, allOk = true;
  let maxSprites = 0, maxPaldelta = 0;
  const rows = [], scaled = [];
  let palRgbBuf, oursBuf, refBuf;

  for (const [n, dir, m] of pairs) {
    const ds = loadFrame(dir, n), dp = loadFrame(dir, m);
    const stateD = mut.stateFromPixels ? dp : ds;
    const palD = mut.palFromState ? ds : dp;

    const idx = renderer.renderIndexed(stateD, drawOpts);
    palRgbBuf = paletteRgb(palD.palette, palRgbBuf);
    oursBuf = resolveRgb(idx, palRgbBuf, oursBuf);
    refBuf = mamePixelsToRgb(dp.pixels, SCREEN_W, SCREEN_H, refBuf);

    let same = 0;
    for (let i = 0; i < oursBuf.length; i += 3) {
      if (oursBuf[i] === refBuf[i] && oursBuf[i + 1] === refBuf[i + 1]
        && oursBuf[i + 2] === refBuf[i + 2]) same++;
    }
    const npix = SCREEN_W * SCREEN_H;
    const sp = parseSpriteList(ds.spritebuffer);
    let zoomed = 0;
    for (const s of sp) {
      const [xz, yz] = effectiveZoom(s, ds.zoomram, drawOpts.zoomWordFn);
      if (xz !== 0 || yz !== 0) zoomed++;
    }
    let paldelta = 0;
    for (let i = 0; i < ds.palette.length; i++) {
      if (ds.palette[i] !== dp.palette[i]) paldelta++;
    }
    exact += same; total += npix;
    const good = same === npix;
    allOk = allOk && good;
    if (sp.length > maxSprites) maxSprites = sp.length;
    if (paldelta > maxPaldelta) maxPaldelta = paldelta;
    if (ds.regs.bg_scale !== 0x210) scaled.push([n, ds.regs.bg_scale]);
    rows.push({
      state: n, pixels: m, exact: same, total: npix, sprites: sp.length,
      zoomed, paldelta, ctrl: ds.regs.ctrl, bg_scale: ds.regs.bg_scale,
    });
    if (!a.quiet) {
      console.log(
        `${good ? 'OK  ' : 'FAIL'} state f${n} -> pixels f${m}: `
        + `${same}/${npix} = ${(100 * same / npix).toFixed(4).padStart(8)}%  `
        + `sprites=${String(sp.length).padStart(3)} zoomed=${String(zoomed).padStart(2)} `
        + `bgx=0x${ds.regs.bg_xscroll.toString(16).padStart(4, '0')} `
        + `bgy=0x${ds.regs.bg_yscroll.toString(16).padStart(4, '0')} `
        + `ctrl=0x${ds.regs.ctrl.toString(16).padStart(4, '0')} `
        + `scale=0x${ds.regs.bg_scale.toString(16).padStart(4, '0')} `
        + `paldelta=${paldelta}`);
    }
  }

  const pct = total ? (100 * exact / total) : 0;
  const dense = longestDenseRun(pairs);
  const problems = [];
  if (!pairs.length) problems.push('NO PAIRS AT ALL');
  if (pairs.length < a.minPairs) {
    problems.push(`TOO FEW PAIRS: ${pairs.length} < ${a.minPairs} required. `
      + 'A gate with no input is not a pass.');
  }
  if (maxSprites < a.minSprites) {
    problems.push(`NO DENSE-SPRITE FRAME: the busiest pair had ${maxSprites} `
      + `sprites, ${a.minSprites} required. The plan asks for one >=90-sprite `
      + 'frame because a green run over quiet frames proves nothing.');
  }
  if (maxPaldelta < a.minPaldelta) {
    problems.push(`NO PALETTE-FADE FRAME: the biggest palette delta was `
      + `${maxPaldelta} words, ${a.minPaldelta} required. Without a fade the `
      + 'palette sample-point offset is untested -- both choices score 100 %.');
  }
  if (dense < a.minDense) {
    problems.push(`NO DENSE STRETCH: longest run of consecutive pairs is `
      + `${dense}, ${a.minDense} required.`);
  }
  if (scaled.length) {
    problems.push(`${scaled.length} pair(s) drawn with bg_scale != 0x210 `
      + `(${JSON.stringify(scaled)}). MAME DOES NOT IMPLEMENT bg_scale, so `
      + 'those comparisons are worthless in both directions. Escalate -- the '
      + 'ORACLE is wrong there, not the renderer.');
  }
  const verdict = (allOk && !problems.length) ? 'PASS' : 'FAIL';
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`${verdict}: ${exact}/${total} = ${pct.toFixed(4)}% over `
    + `${pairs.length} frame pair(s); densest run ${dense} consecutive, `
    + `busiest ${maxSprites} sprites, biggest palette delta ${maxPaldelta} words`);
  if (a.json) {
    fs.writeFileSync(a.json, JSON.stringify({
      verdict, pairs: pairs.length, exact, total, pct, mutation: mutName,
      dense, maxSprites, maxPaldelta, rows,
    }, null, 1));
  }
  return verdict === 'PASS' ? 0 : 1;
}

try {
  process.exit(main());
} catch (e) {
  console.error(String(e.stack || e));
  process.exit(2);
}
