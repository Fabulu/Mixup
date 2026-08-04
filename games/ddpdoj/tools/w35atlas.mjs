#!/usr/bin/env node
// WAVE 35 -- THE SPRITE ATLAS'S PROVENANCE.
//
//   node tools/w35atlas.mjs capture   [--cap rip/web/capture.json]
//   node tools/w35atlas.mjs port      <trace.tsv> <seed.bin> --seed-lf N [...]
//   node tools/w35atlas.mjs diff      <trace.tsv> <seed.bin> --seed-lf N [...]
//
// THE PROBLEM.  `tools/export-web.mjs` builds the published sprite atlas by
// walking the RECORDING's own display list: every `offs` field that appears in
// any of `capture.bin`'s 161 frames becomes a stream in `assets/spr/`, plus the
// ship's 16 other bank frames harvested by address.  150 + 16 = the 166 in
// `assets/manifest.json`.  So the answer to "which sprites does stage 1 draw?"
// is currently READ OUT OF A RECORDING OF STAGE 1, which is the provenance
// problem W28 §6 named as the thing that actually gates deleting `capture.bin`.
//
// WHAT THIS TOOL DOES.  It produces the same set from the other side -- the
// PORT's own emitted display list, whose `offs` fields come from ROM tables and
// ROM immediates and never from the capture -- and diffs the two sets.
//
// Both sides are read at the SAME place (the emitted hardware list, parsed by
// `src/render/spritelist.js`), so the comparison is apples to apples.
//
// EVERY NUMBER THIS PRINTS IS THE PORT'S OR THE RECORDING'S.  Nothing here is
// compared against MAME.  The `port` side runs under the same coverage
// interventions `tools/w34damagegate.mjs` documents -- a synthetic fire tap, the
// owner's own stick script, `--no-pods`, `--stub-unported` and a free run past
// the end of the trace -- and every one of them makes the run off-distribution
// (`docs/knowledge/09`).  A stream this run does NOT reach is not a stream the
// stage does not draw.

import { readFileSync } from 'node:fs';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { handlerMap } from '../src/handlers.js';
import { SHIP_MUTATE } from '../src/shipsprite.js';
import { freeEnemy } from '../src/initbody.js';
import { Capture } from '../src/render/capture.js';
import { parseSpriteList, BUFFER_STRIDE, RAM_STRIDE } from '../src/render/spritelist.js';
import { walkDirectory } from '../src/render/spritedir.js';
import { assemble, SPRMASK_LAYOUT, SPRMASK_SIZE } from '../src/render/regions.js';
import { stage1Handlers } from './w34damagegate.mjs';

const FIRE_WORD = portWordFromBits([BIT.b1]);
const AUTO_WORD = portWordFromBits([BIT.b3]);
const LIST = 0x800000;
const LIST_WORDS = 0x500;          // $800000..$8009FF, 5 words x 256 entries

function readTsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const f = l.split('\t');
    const o = {};
    head.forEach((h, i) => { o[h] = f[i]; });
    return o;
  });
}

/** The RECORDING's set: every `offs` in any of `capture.bin`'s frames. */
export function captureStreams(capJsonPath, capBinPath) {
  const cap = new Capture(
    JSON.parse(readFileSync(capJsonPath, 'utf8')),
    new Uint8Array(readFileSync(capBinPath)));
  const seen = new Map();
  let records = 0;
  for (let i = 0; i < cap.length; i++) {
    for (const s of parseSpriteList(cap.state(i).spritebuffer, BUFFER_STRIDE)) {
      records++;
      const e = seen.get(s.offs) ?? { n: 0, wh: new Set() };
      e.n++; e.wh.add(`${s.width}x${s.height}`);
      seen.set(s.offs, e);
    }
  }
  return { frames: cap.length, records, streams: seen };
}

/** The PORT's set: every `offs` its own emitter writes to $800000..$8009FF. */
export function portStreams(tsvPath, seedPath, tablesPath, opts = {}) {
  const rows = readTsv(tsvPath);
  const seed = new Uint8Array(readFileSync(seedPath));
  const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
  const byLf = new Map(rows.map((r) => [Number(r.lf), r]));
  const seedLf = opts.seedLf ?? Number(rows[0].lf);
  const start = byLf.get(seedLf);
  if (!start) throw new Error(`the trace has no logic frame ${seedLf}`);

  const savedMutate = SHIP_MUTATE.value;
  if (opts.noPods) SHIP_MUTATE.value = 'no-option-object';
  const savedHandlers = new Map();
  try {
    let game = new Game(seed, tables,
      { logicFrame: seedLf, videoFrame: Number(start.vf) });
    const stubbed = new Map();
    if (opts.stub) {
      const HM = handlerMap(game.rom);
      for (const [h] of stage1Handlers(game.rom, game.ram)) {
        if (HM.has(h)) continue;
        savedHandlers.set(h, HM.get(h));
        HM.set(h, (ram, rom2, a5) => {
          stubbed.set(h, (stubbed.get(h) ?? 0) + 1);
          freeEnemy(ram, a5);
        });
      }
      game = new Game(seed, tables,
        { logicFrame: seedLf, videoFrame: Number(start.vf) });
    }

    const seen = new Map();
    const words = new Uint16Array(LIST_WORDS);
    let ran = 0, blocked = null, lf = seedLf, maxClk = 0;
    for (lf = seedLf + 1; ; lf++) {
      const row = byLf.get(lf);
      if (!row && !opts.free) break;
      if (opts.free && ran >= opts.free) break;
      let word = row ? Number(row.portin) : 0xffff;
      if (opts.stick) {
        word &= portWordFromBits([BIT.down, (ran % 512) < 256 ? BIT.right : BIT.left]);
      }
      if (opts.auto) word &= AUTO_WORD;
      else if (opts.fire && (lf % opts.fire) === 0) word &= FIRE_WORD;
      try {
        game.step(word);
      } catch (e) {
        if (e.name !== 'Unreached') throw e;
        blocked = { lf, addr: e.romAddress, message: e.message };
        break;
      }
      ran++;
      for (let i = 0; i < LIST_WORDS; i++) words[i] = game.ram.u16(LIST + i * 2);
      for (const s of parseSpriteList(words, RAM_STRIDE)) {
        const e = seen.get(s.offs) ?? { n: 0, wh: new Set(), firstLf: lf };
        e.n++; e.wh.add(`${s.width}x${s.height}`);
        seen.set(s.offs, e);
      }
      const clk = game.ram.u16(0x8130ce);
      if (clk > maxClk) maxClk = clk;
    }
    return { ran, from: seedLf + 1, to: lf - 1, blocked, maxClk, streams: seen,
      stubbed };
  } finally {
    SHIP_MUTATE.value = savedMutate;
    const HM = handlerMap();
    for (const [h] of savedHandlers) HM.delete(h);
  }
}

// ===========================================================================
// THE ROM SIDE.  `rom` mode.
//
// The 68000 never names a "stage-1 sprite list"; the address is the per-object
// descriptor `($a,A6)` (`src/spritequeue.js` §the seven-field spec) and it is
// written from four kinds of place.  This is the enumeration of those places
// for stage 1, and its HONESTY CONDITION is stated first because it bounds
// every number below:
//
//   * the LONGWORD TABLES were found by taking every stream either instrument
//     produced and asking where in build B that longword lives -- i.e. the SET
//     OF TABLES is discovered by measurement and is a FLOOR, not a census.
//   * each table is then enumerated to its FULL EXTENT out of the ROM, which is
//     the half measurement cannot do.  That is where the growth comes from.
//   * the ANIMATION RANGES are `(base, step, wrap)` triples read out of the
//     bullet behaviour bodies (`src/mover.js animateRenderOffsWrap`), which
//     enumerate their own frames exactly.
//
// A table's extent is defined here as the maximal run of consecutive 4-byte
// longwords that are all valid stream starts in the mask ROM's own directory
// (`src/render/spritedir.js`).  That test is strong: 8,073 of 4,194,304 word
// addresses are stream starts, so a run of four is not an accident.
// THE THREE INSTRUMENTS the table set was discovered from, and it is three
// because each sees what the others cannot: the 161-frame `capture.bin`
// (150 streams), the PORT's own 12,000-frame emitter (329), and wave 3's
// `rip/assets/manifest.json` harvest over `stage1-{deep,open}.tsv` (1,211).
// Their union is 1,311 streams; every one of the 1,311 is a directory entry.
//
// A `why` of `''` means the reader is pc-relative (`lea (d16,PC),An`) and a
// literal scan cannot see it -- W34 §1.1's limitation, in the other direction.
export const ROM_TABLES = Object.freeze([
  [0x24bbba, 'the OPTION pods\' template table, $24BBAA-indexed ($24C096)'],
  [0x24d8ac, 'option object, second bank'],
  [0x24dfe8, 'option object, third bank'],
  [0x24f5e4, ''],
  [0x255342, 'the SHIP tilt table $25533A -- 2 ship types x 17 tilts ($249E4E lea)'],
  [0x255462, 'the ship\'s second image set ($249EC2 lea $25545A)'],
  [0x25567a, 'the invulnerability AURA, 16 frames ($24A4B0 lea)'],
  [0x25572e, 'the pods\' own images ($2556E8)'],
  [0x25b578, ''], [0x25b6dc, ''], [0x25b778, ''], [0x25b7e6, ''],
  [0x25b856, ''], [0x25b984, ''],
  [0x25cf80, ''],
  [0x25e7b8, ''], [0x25ed58, ''], [0x25f1bc, ''], [0x25f7c8, ''],
  [0x25f880, ''], [0x25fcd2, ''],
  [0x268594, 'enemy type $10 ($27DC86 lea)'],
  [0x268b9e, 'enemy type $11: main + fire, 16 headings each (src/handlers.js:151)'],
  [0x269bb6, 'the damage-first family, second table'],
  [0x269e48, 'the damage-first family heading table (src/initbody.js:149)'],
  [0x26be70, 'the MIDBOSS $26B6FA'],
  [0x26bf42, 'the MIDBOSS, second table'],
  [0x26bfe8, 'the MIDBOSS, third table'],
  [0x272c7a, 'types $20/$21, handler $272AAC ($268D78/$268F9A/$277E1E/$278066 lea)'],
  [0x278338, ''], [0x27e3d2, ''], [0x27ea1a, ''], [0x27ebcc, ''],
  [0x27f488, ''], [0x2856e4, ''],
  [0x2881d2, 'the HUD/effect block ($284D88 lea)'],
  [0x2881f2, 'the HUD/effect block, main run ($285C86 lea)'],
  [0x288d62, ''],
  [0x289820, ''], [0x2898b0, ''], [0x289940, ''], [0x2899d0, ''],
  [0x289a60, ''], [0x289e7a, ''], [0x28a5c2, ''],
  [0x28b032, ''], [0x28b050, ''], [0x28b06e, ''],
  [0x28e658, ''], [0x29136e, ''],
  [0x2923da, ''],
]);

/** STRIDED RECORD TABLES -- `[base, byteStride, fieldOffset]`.  Not every table
 *  is a bare longword array: `$283D50` is 32 records of 12 bytes whose word 2/3
 *  pair sits at +$8, interleaved with two other fields.  The run detector
 *  behind `ROM_TABLES` cannot see those, and a scan that only looks for the
 *  common shape reports them as absent -- the same class of miss
 *  `src/spritequeue.js` records for bucket 23's counter. */
export const ROM_STRIDED = Object.freeze([
  [0x283d50, 12, 0, 'a bullet direction table: 32 records x 12 B ($283D50..$283EC4)'],
]);

/** Stream addresses that are ISOLATED longword immediates -- `move.l #$xxxxxx,`
 *  inside a handler body -- rather than members of a table.  `[stream, the
 *  build-B address the literal sits at]`.  Every one was located by searching
 *  build B for the value; `$1C07A4` is the single exception and is derived, not
 *  found: it is one 2x24 stream ($34 words) past `$1C0770`, which IS a literal
 *  in the `$283D50` direction table -- an animation step whose base is a table
 *  entry. It is listed so the atlas contains it, with its derivation stated. */
export const ROM_IMMEDIATES = Object.freeze([
  [0x1727c4, 0x273954], [0x172d18, 0x273cf0], [0x1928bc, 0x2758b6],
  [0x192a48, 0x275a78], [0x1bca34, 0x2766ec], [0x1bca80, 0x27fca2],
  [0x1c03c8, 0x283d50], [0x1c07a4, 0], [0x1cf060, 0x284f88],
  [0x22cbcc, 0x2623a6], [0x22da70, 0x2623fe], [0x22ded4, 0x26244c],
  [0x22e508, 0x26249e], [0x22f184, 0x2624f0], [0x22fe98, 0x26253e],
  [0x23061c, 0x26258c], [0x231520, 0x2625da], [0x231c44, 0x262628],
  [0x232578, 0x262676], [0x232eac, 0x2626c4], [0x233630, 0x262712],
  [0x233f34, 0x262760],
]);

/** `(base, step, wrap)` out of `src/mover.js`, which reads them out of the
 *  bullet behaviour bodies' own `addi.l`/`cmpi.l` pairs. */
export const ROM_ANIM_RANGES = Object.freeze([
  [0x1bf58c, 0x0c, 0x1bf5d4], [0x1bf5d4, 0x14, 0x1bf714],
  [0x1bfef4, 0x24, 0x1bff84], [0x1bff84, 0x24, 0x1c0014],
  [0x1c0014, 0x24, 0x1c00a4], [0x1c00a4, 0x24, 0x1c0134],
  [0x1c0134, 0x14, 0x1c01ac], [0x1c0260, 0x14, 0x1c02b0],
  [0x1c02d8, 0x14, 0x1c0350], [0x1c0944, 0x24, 0x1c09d4],
  [0x1c0ca4, 0x14, 0x1c0cf4], [0x1c0d1c, 0x14, 0x1c0d94],
  [0x1c0e0c, 0x24, 0x1c0e9c], [0x1c1bf8, 0x24, 0x1c1e38],
  [0x1c1ec8, 0x24, 0x1c2108],
]);

const hex = (v) => `$${v.toString(16).padStart(6, '0')}`;

/**
 * Enumerate the stage-1 sprite addresses from the cartridge.
 * @param cpu   the decrypted 68000 image (address == file offset)
 * @param mask  the assembled sprite mask region
 */
export function romStreams(cpu, mask) {
  const dir = new Set(walkDirectory(mask).starts);
  const be32 = (a) => (((cpu[a] << 24) | (cpu[a + 1] << 16)
    | (cpu[a + 2] << 8) | cpu[a + 3]) >>> 0);
  const isStart = (a) => {
    const v = be32(a);
    return v > 0 && v < 0x1000000 && dir.has(v & 0x7fffff);
  };
  const out = new Map();
  const add = (o, src) => {
    if (!out.has(o)) out.set(o, new Set());
    out.get(o).add(src);
  };
  const tables = [];
  for (const [base, why] of ROM_TABLES) {
    if (!isStart(base)) throw new Error(`${hex(base)} is not a stream-pointer `
      + 'table start: its first longword is not a stream start in the mask '
      + `ROM's directory. (${why})`);
    let n = 0;
    while (isStart(base + 4 * n)) { add(be32(base + 4 * n) & 0x7fffff, hex(base)); n++; }
    tables.push({ base, n, why });
  }
  for (const [base, stride, field, why] of ROM_STRIDED) {
    let n = 0;
    while (isStart(base + stride * n + field)) {
      add(be32(base + stride * n + field) & 0x7fffff, hex(base)); n++;
    }
    if (n === 0) throw new Error(`strided table ${hex(base)} has no entries at `
      + `+${field} stride ${stride} -- ${why}`);
    tables.push({ base, n, why: `${why} [strided]` });
  }
  for (const [o, at] of ROM_IMMEDIATES) {
    if (!dir.has(o)) throw new Error(`immediate ${hex(o)} is not a stream start`);
    if (at && (be32(at) & 0x7fffff) !== o) {
      throw new Error(`the immediate cited at ${hex(at)} is `
        + `${hex(be32(at) & 0x7fffff)}, not ${hex(o)} -- the citation has rotted`);
    }
    add(o, at ? `imm ${hex(at)}` : 'derived');
  }
  for (const [base, step, wrap] of ROM_ANIM_RANGES) {
    for (let o = base; o < wrap; o += step) {
      if (!dir.has(o)) throw new Error(`animation range ${hex(base)} step `
        + `${step} reaches ${hex(o)}, which is not a stream start`);
      add(o, `anim ${hex(base)}+${step}`);
    }
  }
  return { streams: out, tables };
}

function main(argv) {
  const mode = argv[0];
  const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
  const here = (p) => new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const capJson = arg('--cap-json', here('../rip/web/capture.json'));
  const capBin = arg('--cap-bin', here('../rip/web/capture.bin'));

  if (mode === 'rom') {
    const cpu = new Uint8Array(readFileSync(arg('--cpu',
      here('../tools/oracle/out/maincpu.bin'))));
    const rd = (n) => new Uint8Array(readFileSync(`${here('../rip/rom/')}${n}`));
    const mb = assemble(rd, SPRMASK_LAYOUT, SPRMASK_SIZE);
    const mask = new Uint16Array(mb.buffer, 0, SPRMASK_SIZE / 2);
    const dir = walkDirectory(mask);
    console.log(`DIRECTORY ${dir.starts.length} streams in the mask ROM, `
      + `$000000..${hex(dir.end)} of $${(mask.length).toString(16)} words`);
    const { streams, tables } = romStreams(cpu, mask);
    for (const t of tables) {
      console.log(`  ${hex(t.base)}  ${String(t.n).padStart(3)} entries   ${t.why}`);
    }
    console.log(`ROM LIST ${streams.size} distinct stage-1 sprite streams, from `
      + `${tables.length} tables (${tables.reduce((s, t) => s + t.n, 0)} entries) `
      + `+ ${ROM_IMMEDIATES.length} immediates + ${ROM_ANIM_RANGES.length} `
      + 'animation ranges');
    if (argv.includes('--list')) {
      for (const o of [...streams.keys()].sort((a, b) => a - b)) {
        console.log(`  ${hex(o)}  ${[...streams.get(o)].join(' ')}`);
      }
    }
    return;
  }

  if (mode === 'capture' || mode === 'diff') {
    const c = captureStreams(capJson, capBin);
    console.log(`CAPTURE ${c.frames} frames, ${c.records} display-list records, `
      + `${c.streams.size} DISTINCT STREAMS`);
    if (mode === 'capture') {
      for (const [o, e] of [...c.streams].sort((a, b) => a[0] - b[0])) {
        console.log(`  ${hex(o)}  n=${e.n}  ${[...e.wh].join(',')}`);
      }
      return;
    }
    const [tsv, seedBin] = argv.slice(1).filter((a) => !a.startsWith('--'));
    const p = portStreams(tsv, seedBin,
      arg('--tables', here('../rip/port/player.tables.json')), {
        seedLf: argv.includes('--seed-lf') ? Number(arg('--seed-lf')) : undefined,
        fire: argv.includes('--no-fire') ? 0 : Number(arg('--fire', 20)),
        auto: argv.includes('--auto'),
        noPods: argv.includes('--no-pods'),
        free: Number(arg('--free', 0)),
        stick: argv.includes('--stick'),
        stub: argv.includes('--stub-unported'),
      });
    console.log(`PORT    ${p.ran} frames (lf${p.from}..lf${p.to}), maxclk `
      + `${p.maxClk}, ${p.streams.size} DISTINCT STREAMS`);
    if (p.blocked) {
      console.log(`        BLOCKED at lf${p.blocked.lf} by `
        + `$${(p.blocked.addr ?? 0).toString(16).toUpperCase()}`);
    }
    const onlyCap = [...c.streams.keys()].filter((o) => !p.streams.has(o)).sort((a, b) => a - b);
    const onlyPort = [...p.streams.keys()].filter((o) => !c.streams.has(o)).sort((a, b) => a - b);
    const both = [...c.streams.keys()].filter((o) => p.streams.has(o));
    console.log(`BOTH        ${both.length}`);
    console.log(`CAPTURE-ONLY ${onlyCap.length}: ${onlyCap.map(hex).join(' ')}`);
    console.log(`PORT-ONLY    ${onlyPort.length}: ${onlyPort.map(hex).join(' ')}`);
    return;
  }
  throw new Error(`unknown mode ${mode}`);
}

if (process.argv[1] && process.argv[1].endsWith('w35atlas.mjs')) {
  main(process.argv.slice(2));
}
