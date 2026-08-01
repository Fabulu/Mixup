// sweep.mjs -- THE VERDICT half of the stage sweep. WAVE 20 / recon 4.
//
// sweep.py records ONE long cartridge run with a video seed every N frames.
// This file starts the PORT at every one of those seeds, runs it for a window,
// and says what happens: CLEAN, DIVERGENT (which field, which frame) or THREW
// (which ROM address). The output is a MAP OF THE STAGE indexed by SCROLL.
//
// WHY THIS IS NOT compare.mjs. compare.mjs grades a hand-written corpus of 43
// scenarios; it is the gate and it must stay one. This is a SURVEY: 140-odd
// windows nobody chose, tiling the whole run, whose job is to find where the
// port stops working rather than to prove that a chosen place works.
//
// THE GRADING IS compare.mjs's, deliberately, so a CLEAN here means the same
// thing it means there:
//   * the oracle side of every watched address comes straight out of the RAM
//     dump ($0000-$07FF at the $80B5 sample point) -- probe.lua's `w_` fields
//     are the same read;
//   * the LIVE WINDOW rule is the same: grading stops the frame the cartridge's
//     $1B leaves the set src/nmi.js's $96A5 ladder ports;
//   * $36 is INFO (compare.mjs's one remaining INFO field) and page $02 is
//     graded by the display-list rule -- every slot's Y byte always, all four
//     bytes of every slot the CARTRIDGE has live -- because src/oam.js clears
//     hidden slots that $8BAB leaves stale, and says so.
//
// A window that THROWS is not a failure of the harness: it is the answer. The
// throw carries the ROM address the port refused, which is what turns "Gradius
// is unfinished as soon as you get further along" into a list.
//
//   node games/gradius/tools/oracle/sweep.mjs                # both runs
//   node games/gradius/tools/oracle/sweep.mjs --run powered --window 60
//   node games/gradius/tools/oracle/sweep.mjs --seed 2300 --verbose
//
// ROM-DERIVED input, out/ is gitignored. Nothing here may be committed.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tracePort, SCEN_DEFS, NOT_PRODUCED, UNMODELLED } from './porttrace.mjs';
import { headlessResources } from '../../tests/helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SWEEP = join(HERE, 'out', 'sweep');
const VIDEO_SEED_BYTES = 2048 + 32 + 256;

// The $1B values src/nmi.js's ladder ports -- compare.mjs's MODELLED_1B, and it
// has to stay the same set or a CLEAN here is not a CLEAN there.
const MODELLED_1B = new Set([0, 1, 2, 3, 4, 0x80, 0xA0]);
const INFO = new Set(['w_0036']);

function hex(n, w = 4) {
  return `$${n.toString(16).toUpperCase().padStart(w, '0')}`;
}

function loadRun(run) {
  const meta = JSON.parse(readFileSync(join(SWEEP, `${run}.meta.json`), 'utf8'));
  const ram = readFileSync(join(SWEEP, `${run}.ram`));
  const vid = readFileSync(join(SWEEP, `${run}.video`));
  if (ram.length !== 2048 * meta.frames) {
    throw new Error(`${run}.ram is ${ram.length} bytes, want ${2048 * meta.frames}`);
  }
  if (vid.length !== VIDEO_SEED_BYTES * meta.seeds.length) {
    throw new Error(`${run}.video is ${vid.length} bytes, want `
                  + `${VIDEO_SEED_BYTES * meta.seeds.length}`);
  }
  return { meta, ram, vid };
}

/** The seed object porttrace.mjs's seedFromCartridge() wants, at seed index k. */
function seedAt({ meta, ram, vid }, k) {
  const f = meta.seeds[k];
  const row = meta.rows[f];
  if (row.frame !== f) {
    throw new Error(`row ${f} carries frame ${row.frame} -- the meta rows are `
                  + 'not 0-indexed by game frame and every seed would be off');
  }
  const v = k * VIDEO_SEED_BYTES;
  return {
    frame: f,
    ram: ram.subarray(f * 2048, (f + 1) * 2048),
    vram: vid.subarray(v, v + 2048),
    palette: vid.subarray(v + 2048, v + 2080),
    oam: vid.subarray(v + 2080, v + 2336),
    chrBank: row.chrBank,
    chrOffset: row.chrOffset,
    splitRan: row.sprite0Hit,
  };
}

/**
 * Grade ONE window. Returns a verdict object; nothing is printed here.
 *
 * The oracle's value for a watched address at frame f is ram[f*2048 + addr] --
 * the same byte probe.lua would have put in `w_XXXX`, read at the same instant.
 */
function gradeWindow(rt, k, { window, watch, res, verbose, neuter }) {
  const { meta, ram } = rt;
  const seed = seedAt(rt, k);
  const f0 = seed.frame;
  const last = Math.min(f0 + window, meta.frames - 1);
  const rd = (f, a) => ram[f * 2048 + a];
  const scrollAt = (f) => (rd(f, 0x3F) << 8) | rd(f, 0x3E);

  // THE GAME MODE, $00. src/nmi.js is `if (state.mode === MODE_STAGE)
  // stagePlay(...)` with NO else, so in any other mode the port runs the frame
  // skeleton and nothing else -- it neither throws nor matches. A map that does
  // not carry the mode would report that as an ordinary divergence.
  const out = {
    seed: f0, scroll: scrollAt(f0), scrollEnd: scrollAt(last),
    mode: rd(f0, 0x00), demo: rd(f0, 0x09),
    verdict: null, threw: null, graded: 0, stopped: null,
    diverged: [], unmodelled: 0,
  };

  let port;
  try {
    port = tracePort({
      name: `sweep@${f0}`, script: meta.script, frames: last + 1, align: f0,
      seed, watch, poke: meta.poke, res, stopOnThrow: true, neuter,
    });
  } catch (e) {
    // stopOnThrow only catches throws from inside nmi(); a throw from the SEED
    // itself (an assertion in seedFromCartridge) lands here and is a different
    // animal, so it is labelled differently rather than merged into the map.
    out.verdict = 'SEED-REFUSED';
    out.threw = { atFrame: f0, message: String(e.message || e) };
    return out;
  }
  if (port.threw) {
    out.verdict = 'THREW';
    out.threw = port.threw;
  }

  // THE LIVE WINDOW, compare.mjs's rule: stop the frame the cartridge's $1B
  // leaves the ported set. That is a fact about the CARTRIDGE and applies
  // whether or not the port threw.
  const frames = [];
  for (const r of port.frames) {
    const sub = rd(r.frame, 0x1B);
    if (!MODELLED_1B.has(sub)) {
      out.stopped = { frame: r.frame, sub, scroll: scrollAt(r.frame) };
      break;
    }
    frames.push(r);
  }
  out.graded = frames.length;
  out.modes = [...new Set(frames.map((r) => rd(r.frame, 0x00)))].sort();

  // ---- the field comparison ------------------------------------------------
  const counts = new Map();
  let firstFrame = null;
  for (const r of frames) {
    for (const a of watch) {
      const key = `w_${a}`;
      const addr = parseInt(a, 16);
      const p = r[key];
      if (p === null || p === undefined) continue;   // UNMODELLED, counted below
      if (INFO.has(key)) continue;
      const o = rd(r.frame, addr);
      if (addr >= 0x0200 && addr <= 0x02FF) {
        // The display-list rule (compare.mjs): the Y byte of every slot always,
        // and all four bytes of a slot the CARTRIDGE has live (Y != $F4).
        const slotY = rd(r.frame, 0x0200 + (((addr - 0x0200) >> 2) << 2));
        if ((addr & 3) !== 0 && slotY === 0xF4) continue;
      }
      if (o !== p) {
        counts.set(key, (counts.get(key) || 0) + 1);
        if (firstFrame === null || r.frame < firstFrame) firstFrame = r.frame;
      }
    }
  }
  if (frames.length) {
    for (const a of watch) {
      const v = frames[0][`w_${a}`];
      if (v === null || v === undefined) out.unmodelled++;
    }
  }
  out.diverged = [...counts.entries()]
    .map(([field, n]) => ({ field, n }))
    .sort((x, y) => y.n - x.n);
  out.firstDivergentFrame = firstFrame;
  if (firstFrame !== null) {
    // Which field went first, and by how much -- the map is useless without it.
    const row = frames.find((r) => r.frame === firstFrame);
    out.firstFields = [...counts.keys()]
      .filter((k2) => row[k2] !== rd(firstFrame, parseInt(k2.slice(2), 16)))
      .slice(0, 6)
      .map((k2) => `${k2} port ${row[k2]} rom ${rd(firstFrame, parseInt(k2.slice(2), 16))}`);
  }

  // ---- THE END-OF-WINDOW SCREEN, and it is FREE ---------------------------
  // The sweep TILES: with --window == --every, window k ends on exactly the
  // frame seed k+1 was taken at, so the next seed's video blob IS this window's
  // expected screen. Nothing else in this repo compares the port's nametable
  // outside compare.mjs's own corpus, and the field check above cannot see it
  // (the watch list has ZERO addresses in $0500-$06FF and none in PPU space --
  // counted, not assumed).
  //
  // EXCUSED, exactly as compare.mjs excuses it: a window in which the cartridge
  // re-enters the stage-intro states {1,2,3,4} runs $882C's full-screen loader
  // $8871, which src/flow.js says outright it does not port. Those windows are
  // marked rather than counted.
  const kNext = meta.seeds[k + 1] === last ? k + 1 : -1;
  out.stageLoad = frames.some((r) => [1, 2, 3, 4].includes(rd(r.frame, 0x1B)));
  if (kNext > 0 && !port.threw && port.finalVideo
      && port.frames.length && port.frames[port.frames.length - 1].frame === last) {
    const nxt = seedAt(rt, kNext);
    const cnt = (a, b, n) => {
      let d = 0;
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
      return d;
    };
    // THE HARDWARE OAM IS GRADED BY THE DISPLAY LIST'S RULE, not byte for byte.
    // MEASURED here the same way compare.mjs measured it: a straight comparison
    // reported 118 of 256 bytes differing at seed 1900 while the nametable, the
    // palette and all 1022 watched addresses were exact. src/oam.js fills hidden
    // slots with $F4 in all four bytes; $8BAB writes only the Y byte and leaves
    // tile/attribute/X stale. Y always, all four bytes of a slot the CARTRIDGE
    // is showing.
    let oam = 0;
    for (let s = 0; s < 64; s++) {
      const b = s * 4;
      const live = nxt.oam[b] !== 0xF4;
      for (let i = 0; i < 4; i++) {
        if (i !== 0 && !live) continue;
        if (nxt.oam[b + i] !== port.finalVideo.oam[b + i]) oam++;
      }
    }
    out.video = {
      nt: cnt(port.finalVideo.nt, nxt.vram, 2048),
      pal: cnt(port.finalVideo.pal, nxt.palette, 32),
      oam,
      coll: cnt(port.finalVideo.coll, ram.subarray(last * 2048 + 0x500,
                                                   last * 2048 + 0x700), 512),
    };
    const v = out.video;
    if (v.pal || v.oam || v.coll || (v.nt && !out.stageLoad)) out.videoBad = true;
  }

  if (!out.verdict) {
    out.verdict = out.diverged.length ? 'DIVERGED'
                : (out.videoBad ? 'SCREEN' : 'CLEAN');
  }
  else if (out.diverged.length) out.verdict = 'THREW+DIVERGED';
  if (verbose) console.log(JSON.stringify(out, null, 2));
  return out;
}

/** `unimplemented enemy handler $B6E1 ...` -> `$B6E1`; else the first $XXXX. */
function romOf(msg) {
  const m = /\$([0-9A-F]{4})/.exec(msg || '');
  return m ? `$${m[1]}` : '(no ROM address in the message)';
}

function main(argv) {
  const arg = (k, d) => {
    const i = argv.indexOf(k);
    return i < 0 ? d : argv[i + 1];
  };
  const runs = arg('--run', '') ? [arg('--run', '')]
    : ['powered', 'unpowered'].filter((r) => existsSync(join(SWEEP, `${r}.meta.json`)));
  const window = Number(arg('--window', 60));
  const onlySeed = arg('--seed', '') ? Number(arg('--seed', '')) : null;
  const verbose = argv.includes('--verbose');
  // A DELIBERATE BREAK, passed straight to tracePort. The sweep is only
  // worth reading if it goes red when the port is wrong, and 143 CLEAN
  // windows is exactly the shape of a check that is not looking at anything.
  const neuter = arg('--neuter', null);
  const watch = JSON.parse(readFileSync(SCEN_DEFS, 'utf8')).watch;
  const res = headlessResources(0);

  for (const run of runs) {
    const rt = loadRun(run);
    const { meta } = rt;
    console.log(`\n=== SWEEP ${run}: ${meta.frames} cartridge frames, `
              + `${meta.seeds.length} seeds every ${meta.every}, window ${window} `
              + `frames, max scroll ${hex(meta.maxScroll)}`
              + (neuter ? `  NEUTER ${neuter}` : ''));
    console.log(`    script ${meta.script}`);
    console.log(`    poke   ${meta.poke || '(none)'}`);
    console.log(`    ${watch.length} watched addresses; grading = compare.mjs's `
              + `(live window on $1B, display-list rule on page $02, $36 INFO)`);
    console.log(`\n  ${'seed'.padStart(5)} ${'scroll'.padStart(7)} `
              + `${'..end'.padStart(6)}  ${'graded'.padStart(6)}  verdict`);

    const rows = [];
    for (let k = 0; k < meta.seeds.length; k++) {
      if (onlySeed !== null && meta.seeds[k] !== onlySeed) continue;
      const v = gradeWindow(rt, k, { window, watch, res, verbose, neuter });
      rows.push(v);
      let tail = '';
      if (v.threw) tail = `${romOf(v.threw.message)} @f${v.threw.atFrame}  `
                        + v.threw.message.replace(/\s+/g, ' ').slice(0, 96);
      else if (v.diverged.length) {
        tail = `${v.diverged.length} fields, first f${v.firstDivergentFrame}: `
             + (v.firstFields || []).slice(0, 3).join('; ');
      }
      if (v.video && (v.video.nt || v.video.pal || v.video.oam || v.video.coll)) {
        tail += `  [screen nt ${v.video.nt}/2048 pal ${v.video.pal} oam `
              + `${v.video.oam} coll ${v.video.coll}`
              + (v.stageLoad ? ', stage load -> nt is knownFail $8871' : '') + ']';
      }
      if (v.stopped) {
        tail += `  [live window ended f${v.stopped.frame}, $1B = `
              + `${hex(v.stopped.sub, 2)}]`;
      }
      console.log(`  ${String(v.seed).padStart(5)} ${hex(v.scroll).padStart(7)} `
                + `${hex(v.scrollEnd).padStart(6)} `
                + `${String((v.modes || [v.mode]).join('/')).padStart(4)} `
                + `${String(v.graded).padStart(6)}  `
                + `${v.verdict.padEnd(8)} ${tail}`);
    }

    // ---- the summary, with the denominator ---------------------------------
    const by = (p) => rows.filter(p).length;
    console.log(`\n  --- ${run}: ${rows.length} windows, `
              + `${rows.reduce((a, r) => a + r.graded, 0)} graded frames`);
    console.log(`      CLEAN     ${by((r) => r.verdict === 'CLEAN')}`);
    console.log(`      SCREEN    ${by((r) => r.verdict === 'SCREEN')}`
              + `   (fields exact, end-of-window screen/terrain map not)`);
    const withScreen = rows.filter((r) => r.video);
    console.log(`      windows whose END-OF-WINDOW SCREEN was compared: `
              + `${withScreen.length} of ${rows.length}; `
              + `${withScreen.filter((r) => r.stageLoad).length} contain a stage `
              + `load (nametable excused, knownFail $8871)`);
    console.log(`      DIVERGED  ${by((r) => r.verdict === 'DIVERGED')}`);
    console.log(`      THREW     ${by((r) => r.verdict.startsWith('THREW'))}`);
    console.log(`      SEED-REFUSED ${by((r) => r.verdict === 'SEED-REFUSED')}`);
    // THE MODE SPLIT. A window the cartridge spends outside game mode 5 is not
    // a comparison the port was ever built to pass -- src/nmi.js runs no mode
    // logic there -- and lumping the two together would hide both.
    const m5 = rows.filter((r) => (r.modes || []).every((m) => m === 5));
    const other = rows.filter((r) => !(r.modes || []).every((m) => m === 5));
    console.log(`      windows entirely in game mode 5: ${m5.length}  `
              + `(CLEAN ${m5.filter((r) => r.verdict === 'CLEAN').length}, `
              + `DIVERGED ${m5.filter((r) => r.verdict === 'DIVERGED').length}, `
              + `THREW ${m5.filter((r) => r.verdict.startsWith('THREW')).length})`);
    console.log(`      windows that leave mode 5: ${other.length}  `
              + `(modes seen ${[...new Set(other.flatMap((r) => r.modes || []))]
                  .sort().join(',')}; src/nmi.js models mode 5 ONLY, so these `
              + `diverge without throwing)`);
    const firstBad = rows.find((r) => r.verdict !== 'CLEAN');
    console.log(`      first non-CLEAN window: `
              + (firstBad ? `seed ${firstBad.seed}, scroll ${hex(firstBad.scroll)}`
                          : 'none'));
    const hist = new Map();
    for (const r of rows) {
      if (!r.threw) continue;
      const key = romOf(r.threw.message);
      const e = hist.get(key) || { n: 0, first: r.seed, msg: r.threw.message };
      e.n++;
      hist.set(key, e);
    }
    console.log(`      distinct ROM addresses thrown: ${hist.size}`);
    for (const [k, e] of [...hist.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`        ${k}  ${e.n} window(s), first seed ${e.first}  `
                + e.msg.replace(/\s+/g, ' ').slice(0, 110));
    }
    writeFileSync(join(SWEEP, `${run}.verdict.json`),
                  JSON.stringify({ run, window, rows }, null, 1));
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
