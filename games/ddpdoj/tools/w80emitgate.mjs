#!/usr/bin/env node
// WAVE 80 -- **THE EMISSION GATE**: does the PORT put a display-list record on
// screen for each object the CARTRIDGE does, per enemy type?
//
//   node games/ddpdoj/tools/w80emitgate.mjs --manifest <dir>/manifest.json
//        [--from LF] [--to LF] [--type 05,07,27] [--break NAME] [--json out]
//
// WHY IT EXISTS.  Diagnostic 68 §8.3 asked for exactly this and said, in its own
// words, *"two cheap gates fall out of it and neither exists today ... an
// EMISSION gate ... [M] It would go red on five types right now."*  Every gate
// this project had measured either the port against itself (`drawn%`, which is
// conditioned on the port having emitted the record and therefore CANNOT SEE an
// object that emits nothing) or the port's state columns against the board
// (`seedcmp`, which compares 94 named fields and none of them is "did this
// object draw").  An enemy that is simulated perfectly and never enqueued is
// green on both.  That is how five types stayed invisible through 79 waves.
//
// WHAT IT COMPARES, AND THE ONE SKEW IT HAS.  For each rung of a W69 checkpoint
// ladder:
//
//   BOARD  the checkpoint IS the board's 128 KiB of main RAM, so the display
//          list it was emitting, the enemy table and both sub-record pools are
//          all in it.  `boarddl.mjs`'s own `readCheckpoint` reads them -- the
//          same instrument W75 used, imported rather than re-implemented, so
//          the two reports cannot drift apart.
//   PORT   seed a `Game` from that same checkpoint, step ONE logic frame on the
//          board's own `portin` word, and read the port's list with the SAME
//          function.
//
// **THE SKEW IS ONE LOGIC FRAME AND IT IS NOT HIDDEN.**  A checkpoint holds the
// list for frame N; a port seeded at N produces the list for N+1.  So this gate
// compares COUNTS PER TYPE, never positions, and a type whose population changes
// on that one frame is off by one object.  Over 210 rungs that is noise against
// a signal of "0 of 490" versus "490 of 490"; it would NOT be adequate for a
// claim about a single object, and no claim here is.  Positions are seedcmp's
// job and it already does it.
//
// LABEL.  A ladder is a scripted run and may be POKED; the manifest's own
// `intervention` string is reprinted on every report (docs/knowledge/09).
//
// BLOCKED IS PRINTED, COUNTED, AND DRIVES THE EXIT CODE.  W78's whole finding
// was that a comparison which never ran reads as a pass.  A rung whose single
// step throws `Unreached` is reported by ADDRESS and excluded from the ratios,
// and the ratios carry the rung count they were computed over.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/main.js';
import { assertProfileTables, resolveGameProfile } from '../src/profiles.js';
import { readCheckpoint, Ram } from './boarddl.mjs';
import { readTrace } from './portdiff.mjs';
import { loadBundle, AssetError } from '../src/web/assets.js';
import { romToPackedMap, portSpriteList } from '../src/web/app.js';

// ------------------------------------------------------------------ arguments
function args(argv) {
  const a = { manifest: null, from: null, to: null, types: null, json: null,
    break: null, quiet: false, every: null, assets: null };
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    switch (argv[i]) {
      case '--assets': a.assets = v(); break;
      case '--manifest': a.manifest = v(); break;
      case '--from': a.from = Number(v()); break;
      case '--to': a.to = Number(v()); break;
      case '--every': a.every = Number(v()); break;
      case '--type': a.types = new Set(v().split(',').map((s) => parseInt(s, 16))); break;
      case '--json': a.json = v(); break;
      case '--break': a.break = v(); break;
      case '--quiet': a.quiet = true; break;
      default:
        if (argv[i].startsWith('--')) throw new Error(`unknown flag ${argv[i]}`);
    }
  }
  if (!a.manifest) throw new Error('--manifest is required');
  return a;
}

// =========================================================================
// THE MUTATIONS.  `docs/knowledge/03`: a check nobody has watched fail is not
// a check.  Each of these is a defect this gate would have to catch, and each
// is applied to the PORT side only -- the board side is a file on disk and
// mutating it would prove nothing about the port.
// =========================================================================
const BREAKS = {
  'no-emit': 'skip the port step entirely and report the port as emitting '
    + 'nothing. This is LITERALLY THE PRE-W80 TREE for types $05/$07/$27, so if '
    + 'the gate is green under it the gate is worthless.',
  'count-board-twice': 'census the BOARD checkpoint on both sides. The gate is '
    + 'then comparing a file with itself and is green by construction -- the '
    + 'shape of every oracle that has ever quietly stopped oracling.',
  'live-not-drawn': 'count a type as DRAWN whenever it has a live slot, '
    + 'without checking the display list. The pre-W80 tree passes this: the '
    + 'invisible types were all alive, they just never enqueued.',
};

/** per-type census of ONE RAM image: objects, live/coll/art slot-frames, and
 *  how many of the art-carrying slots appear in that image's display list.
 *  The match is on the DESCRIPTOR + SIZE, deliberately weaker than W75's 80-bit
 *  equality, because the two sides are one frame apart and the position words
 *  therefore MUST differ. */
function census(ram, opts = {}) {
  const cp = readCheckpoint(ram);
  const seen = new Set();
  for (const e of cp.entries) {
    if (e.filler) continue;
    seen.add(`${e.d.offs},${e.d.width},${e.d.height}`);   // boarddl's own decode
  }
  const out = new Map();
  for (const o of cp.objects) {
    const s = out.get(o.type) ?? { objects: 0, live: 0, coll: 0, art: 0, drawn: 0 };
    s.objects++;
    for (const sl of o.slots) {
      if (!sl.live) continue;
      s.live++;
      if (sl.coll) s.coll++;
      if (!sl.art) continue;
      s.art++;
      const d = readDesc(ram, sl.addr);
      if (opts.liveNotDrawn || seen.has(d)) s.drawn++;
    }
    out.set(o.type, s);
  }
  return out;
}
// A SLOT'S key must be built with the SAME arithmetic `decode` uses on an
// ENTRY, or nothing ever matches and the gate is green because it compared
// zero with zero.  It did exactly that on its first run.  `$23D624` copies
// +$0A/+$0C/+$0E through untouched except for OR-ing the flip/colour byte over
// word 2's HIGH byte, so the descriptor's top 7 bits are `+$A & $7F` -- not
// `& $FF`, which would fold `pri` into the stream address.
function readDesc(ram, slot) {
  const size = ram.u16(slot + 0x0e);
  const offs = ((ram.u16(slot + 0x0a) & 0x007f) << 16) | ram.u16(slot + 0x0c);
  return `${offs},${(size & 0x7e00) >> 9},${size & 0x01ff}`;
}

const ram16 = (ram, a) => ram.u16(a);

/** big-endian u16 words out of a raw dump -- the layout `BgVram` stores. */
function beWords(bytes) {
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}

// ============================ THE ART HALF ================================
// **EMITTING IS NOT SEEING.**  Wiring a handler's enqueue makes the record
// exist; whether the owner sees anything depends on the SHIPPED SHEET having
// that stream.  W68 §8.1 spells out that `drawn%` cannot see an object that
// never emitted, and the converse is just as true: an emission gate cannot see
// a record with no picture.  So `--assets` runs the SAME `portSpriteList` the
// browser runs, over the SAME bundle the browser fetches, and reports per type
// how many of the port's own records had art behind them.  Without this flag
// this tool can only say "a record exists", and it says exactly that.
async function loadSheet(dir, profile) {
  const read = async (name) => {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) throw new AssetError(`assets/${name} is missing`);
    return new Uint8Array(fs.readFileSync(p));
  };
  const bundle = await loadBundle(read, { profile });
  // Every shard, not just the boot set: the question here is "is the picture in
  // the bundle at all", not "has it landed yet".  Delivery timing is
  // `webgate`'s subject and conflating the two is how a 43.99 % have-rate got
  // reported as missing art in W68 §5.1.
  for (const m of bundle.spr.meta) await bundle.spr.fetch(m.i);
  const map = romToPackedMap(bundle.manifest, (b) => bundle.spr.shardOfBase(b));
  return { bundle, map };
}

export function gate(a, sheet = null, profile = resolveGameProfile()) {
  if (a.break && !BREAKS[a.break]) {
    throw new Error(`unknown --break ${a.break}; have ${Object.keys(BREAKS).join(', ')}`);
  }
  if (sheet && sheet.bundle.profile !== profile) {
    throw new TypeError('W80 emission gate cartridge tables and packaged sheet use different '
      + 'DaiOuJou edition profiles');
  }
  const manDir = path.dirname(path.resolve(a.manifest));
  const man = JSON.parse(fs.readFileSync(a.manifest, 'utf8'));
  const ckDir = path.join(manDir, man.dir ?? 'ckpt');
  const tablesPath = fileURLToPath(
    new URL('../rip/port/player.tables.json', import.meta.url));
  const tables = JSON.parse(fs.readFileSync(tablesPath, 'utf8'));
  assertProfileTables(profile, tables);
  const trace = readTrace(path.join(manDir, man.trace ?? 'trace.tsv'));

  let rungs = man.rungs.slice().sort((x, y) => x.lf - y.lf);
  if (a.from !== null) rungs = rungs.filter((r) => r.lf >= a.from);
  if (a.to !== null) rungs = rungs.filter((r) => r.lf <= a.to);
  if (a.every !== null) rungs = rungs.filter((_, i) => i % a.every === 0);

  const T = new Map();
  const T_ = (ty) => {
    if (!T.has(ty)) {
      T.set(ty, { type: ty, hasArt: 0, noArt: 0, streamsMissing: new Set(),
        b: { objects: 0, live: 0, coll: 0, art: 0, drawn: 0 },
        p: { objects: 0, live: 0, coll: 0, art: 0, drawn: 0 } });
    }
    return T.get(ty);
  };
  const blocked = new Map();
  let ran = 0;

  for (const r of rungs) {
    const buf = new Uint8Array(fs.readFileSync(path.join(ckDir, r.ram)));
    const boardRam = new Ram(buf);
    const row = trace.byLf.get(r.lf);
    if (!row || row.portin === undefined) {
      blocked.set('no-portin', (blocked.get('no-portin') ?? 0) + 1);
      continue;
    }
    let portCensus = null;
    try {
      if (a.break === 'count-board-twice') {
        portCensus = census(boardRam);
      } else if (a.break === 'no-emit') {
        portCensus = new Map();
      } else {
        const bgPath = path.join(ckDir, r.bg);
        const game = new Game(buf.slice(), tables, {
          profile,
          logicFrame: r.lf,
          videoFrame: Number(r.vf),
          bgSeed: fs.existsSync(bgPath)
            ? beWords(new Uint8Array(fs.readFileSync(bgPath))) : undefined,
        });
        game.step(Number(row.portin));
        portCensus = census(game.ram, { liveNotDrawn: a.break === 'live-not-drawn' });
        // The SHEET question, asked of the port's own list through the page's
        // own function.  `missing` is keyed by CARTRIDGE stream address, so a
        // slot's descriptor joins the two directly.
        if (sheet) {
          // AND THE OBVIOUS VERSION OF THIS IS WRONG, WHICH IS WHY IT IS
          // WRITTEN OUT.  My first pass asked whether the stream appeared in
          // `portSpriteList`'s `missing` map -- but `missing` can only name
          // streams of records that ARE IN THE LIST, so a type that emits
          // nothing has nothing missing and came back "art: 30/0".  That is
          // the emission bug reported as a clean bill of health for the art,
          // on the very types the wave exists for.  The question is
          // MEMBERSHIP IN THE SHEET, so ask the sheet.
          for (const o of readCheckpoint(game.ram).objects) {
            if (a.types && !a.types.has(o.type)) continue;
            const t = T_(o.type);
            for (const sl of o.slots) {
              if (!sl.live || !sl.art) continue;
              const stream = ((ram16(game.ram, sl.addr + 0x0a) & 0x7f) << 16)
                | ram16(game.ram, sl.addr + 0x0c);
              if (sheet.map.has(stream)) t.hasArt++;
              else { t.noArt++; t.streamsMissing.add(stream); }
            }
          }
        }
      }
    } catch (e) {
      const at = e.romAddress !== undefined
        ? `$${e.romAddress.toString(16).toUpperCase()}` : `${e.name}`;
      blocked.set(at, (blocked.get(at) ?? 0) + 1);
      continue;
    }
    ran++;
    const boardCensus = census(boardRam);
    for (const [ty, s] of boardCensus) {
      if (a.types && !a.types.has(ty)) continue;
      const t = T_(ty);
      for (const k of ['objects', 'live', 'coll', 'art', 'drawn']) t.b[k] += s[k];
    }
    for (const [ty, s] of portCensus) {
      if (a.types && !a.types.has(ty)) continue;
      const t = T_(ty);
      for (const k of ['objects', 'live', 'coll', 'art', 'drawn']) t.p[k] += s[k];
    }
  }

  const rows = [...T.values()].sort((x, y) => y.b.live - x.b.live);
  return { man, rungs, ran, blocked, rows };
}

function report(g, a) {
  const { man, rungs, ran, blocked, rows } = g;
  console.log(`W80 EMISSION GATE  '${man.scenario}'  ${rungs.length} rungs `
    + `lf${rungs[0]?.lf}..${rungs[rungs.length - 1]?.lf}`);
  if (man.intervention) console.log(`INTERVENTION ${man.intervention}`);
  console.log('LABEL scripted input, not a human playing (docs/knowledge/09). '
    + 'The port side is ONE logic frame ahead of the board side; counts only.');
  if (a.break) console.log(`BREAK ${a.break} -- ${BREAKS[a.break]}`);
  console.log(`RUNGS COMPARED ${ran} of ${rungs.length}`
    + (blocked.size ? `; BLOCKED ${[...blocked].map(([k, n]) => `${k} x${n}`).join(', ')}` : ''));
  console.log('');
  console.log('TYPE   board-live  board-art  board-DRAWN | port-live  port-art  '
    + 'port-DRAWN |  ratio' + (a.assets ? ' | SHEET has/NO-ART' : ''));
  let anyRed = false;
  // W78's LESSON, WIRED IN RATHER THAN QUOTED: **zero is a number that passes
  // quietly.**  On this gate's first run every `board-DRAWN` was 0 (the slot
  // key was built with a different mask than the entry key), so no type could
  // be red and it printed GREEN over a comparison that had compared nothing.
  // A board census with art slot-frames and no drawn records is now a HARD RED
  // against the INSTRUMENT, named as such, before any per-type verdict.
  const boardArt = rows.reduce((n, r) => n + r.b.art, 0);
  const boardDrawn = rows.reduce((n, r) => n + r.b.drawn, 0);
  if (ran === 0 || (boardArt > 0 && boardDrawn === 0)) {
    console.log(`INSTRUMENT RED -- ${ran} rungs compared, board art `
      + `slot-frames ${boardArt}, board DRAWN ${boardDrawn}. The cartridge `
      + `draws what it carries; a zero here is this tool failing to read the `
      + `display list, not the board failing to emit.`);
    anyRed = true;
  }
  for (const r of rows) {
    const ratio = r.b.drawn === 0 ? '   --  '
      : `${(100 * r.p.drawn / r.b.drawn).toFixed(1).padStart(6)}%`;
    // RED means: the board draws this type and the port draws under half as
    // many.  Not "not equal" -- the one-frame skew makes exact equality a
    // false alarm generator, and a gate that cries wolf gets muted.
    const red = r.b.drawn >= 20 && r.p.drawn * 2 < r.b.drawn;
    if (red) anyRed = true;
    console.log(`$${r.type.toString(16).toUpperCase().padStart(2, '0')}  `
      + `${String(r.b.live).padStart(10)} ${String(r.b.art).padStart(10)} `
      + `${String(r.b.drawn).padStart(11)} | ${String(r.p.live).padStart(9)} `
      + `${String(r.p.art).padStart(9)} ${String(r.p.drawn).padStart(10)} | `
      + `${ratio}${a.assets ? `  |  ${r.hasArt}/${r.noArt}${r.noArt
        ? ` (${[...r.streamsMissing].slice(0, 4)
          .map((x) => '$' + x.toString(16).toUpperCase()).join(' ')})` : ''}` : ''}`
      + `${red ? '  <<< NOT DRAWN' : ''}`);
  }
  console.log('');
  console.log(anyRed ? 'RESULT RED -- at least one type the board draws is '
    + 'drawn by the port less than half as often'
    : 'RESULT GREEN -- every type the board draws >=20 records of is drawn by '
      + 'the port at least half as often');
  if (a.json) fs.writeFileSync(a.json, JSON.stringify({ rows, ran, blocked: [...blocked] }, null, 1));
  return anyRed ? 1 : 0;
}

async function main(argv) {
  const a = args(argv);
  const profile = resolveGameProfile();
  const sheet = a.assets ? await loadSheet(a.assets, profile) : null;
  return report(gate(a, sheet, profile), a);
}

if (process.argv[1] && process.argv[1].endsWith('w80emitgate.mjs')) {
  process.exit(await main(process.argv.slice(2)));
}
export { BREAKS, census };
