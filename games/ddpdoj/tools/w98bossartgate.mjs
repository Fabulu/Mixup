#!/usr/bin/env node
// WAVE 98 -- **DOES THE BUNDLE HOLD A PICTURE FOR EVERY SPRITE THE BOARD
// ITSELF DRAWS?**  Read the BOARD's own display list out of W69's checkpoint
// ladder and look every descriptor up in the shipped sheet.
//
//   node games/ddpdoj/tools/w98bossartgate.mjs
//        [--manifest <dir>/manifest.json] [--from LF] [--to LF]
//        [--break <name>] [--quiet]
//
// WHY THIS AND NOT THE EMISSION GATE.  `tools/w80emitgate.mjs` compares
// PER-TYPE RECORD COUNTS -- how many display-list entries each enemy type
// produced -- and W81 §6 already said plainly what that cannot see: it never
// looks at the PIXELS and it never looks at the BUCKET.  For an ART wave the
// count is not the claim.  The claim is *the address at the end of the record
// resolves to a picture*, and the only unimpeachable source for the set of
// addresses is the cartridge running on the board.
//
// A checkpoint is the whole of main RAM, so $800000..$8009FF is the hardware
// display list the board had just emitted.  `boarddl.mjs readCheckpoint`
// decodes it with the ROM's own arithmetic (that file's header is the
// derivation, and its three `--break` mutations are its red validation); this
// tool adds one question on top of it and asks it of every entry.
//
// **THIS IS A ONE-DIRECTIONAL CHECK AND IT SAYS SO.**  It can prove the sheet
// is SHORT.  It cannot prove a stream we ship is the RIGHT picture, it cannot
// compare a pixel, and a stream the board never reaches in these 72 rungs is
// invisible to it -- which is exactly why the harvest is sized off the ROM
// TABLES and not off this report (W41 §1.4, W81 §1.1).  What it closes is the
// hole W96 §6.1 measured: the port emitting the boss's records at the right
// coordinates with nothing at the end of them.
//
// LABEL.  `stage1-sweep` is a POKED run -- $810424 held at $FF -- and the
// manifest's own `intervention` string is reprinted on every report, because
// docs/knowledge/09 is explicit that a poked run gives STATES, not a picture of
// the game.  For THIS question that costs nothing: an invulnerable player does
// not change which sprite the boss's own animation cursors select.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readCheckpoint, Ram } from './boarddl.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const hx = (v) => '$' + (v >>> 0).toString(16).toUpperCase().padStart(6, '0');

// ===========================================================================
// THE RED VALIDATION.  Each mutation is a state this repo has really been in,
// and `--break` requires the verdict to move.
// ===========================================================================
export const MUTATIONS = {
  'no-boss-shard': 'drop sprite shard 17 back out of the sheet -- the bundle '
    + 'exactly as it shipped at W96, when the boss arrived, descended, handed '
    + 'off and fought for 559 frames with no picture for any of it.',
  'no-type24-immediate': 'drop $7E8AC, type $24\'s FIRST record, back out. '
    + 'Shard 4 has harvested that type\'s TABLE ($2970D8) since W47 and the '
    + 'literal at $29709E was never in it, so the type shipped with half its '
    + 'art for fifty waves and no gate in this repo noticed.',
  'boot-shard-only': 'answer every lookup out of shard 0 alone -- the 166 '
    + 'streams the bundle held before W47 sharded it. This is the control: if '
    + 'the check cannot go red here it is not measuring anything.',
};

// ===========================================================================
// THE BOSS'S OWN ART, READ OUT OF THE CARTRIDGE HERE.
//
// Deliberately NOT imported from `export-web.mjs`: if the gate asked the
// exporter which streams the boss has, a wrong harvest and a wrong gate would
// agree.  These are the same six windows `tools/export-tables.py` pins and this
// file walks them itself, out of `maincpu.bin`.
// ===========================================================================
/** `[base, entries, byteStride, what]` -- W82's three and W96's three. */
const BOSS_TABLES = Object.freeze([
  [0x292a88, 32, 4, 'OBJECT 0, the left part ($292972, by ($2A,A6))'],
  [0x292b7a, 32, 4, 'OBJECT 1, the right part ($292B08, by ($6A,A6))'],
  [0x292c2a, 120, 4, 'OBJECT 3, 15 rows of $20 ($292C00, by ($AC,A6)+7 << 5)'],
  [0x292e32, 3, 4, 'OBJECT 4 ($292E10, no index -- [0] only)'],
  [0x292eca, 32, 4, 'OBJECT 5 ($292E3E, by (byte & $3E)*2)'],
  [0x292f84, 24, 16, 'OBJECT 6, THE HULL ($292F4A, by ($11A,A6))'],
]);
/** $292952 `move.l #$6539C,D2` -- OBJECT 2, an immediate and not a table. */
const BOSS_IMMEDIATES = Object.freeze([0x06539c]);

function bossStreams() {
  const cpuFile = path.join(GAME, 'tools/oracle/out/maincpu.bin');
  if (!fs.existsSync(cpuFile)) return null;
  const d = new Uint8Array(fs.readFileSync(cpuFile));
  const be32 = (x) => (((d[x] << 24) | (d[x + 1] << 16) | (d[x + 2] << 8)
    | d[x + 3]) >>> 0);
  const out = new Map();
  for (const [base, n, stride, what] of BOSS_TABLES) {
    for (let i = 0; i < n; i++) out.set(be32(base + i * stride) & 0x7fffff, what);
  }
  for (const o of BOSS_IMMEDIATES) out.set(o, 'OBJECT 2 ($292952 immediate)');
  return out;
}

/** the shipped sheet, as a set of CARTRIDGE word offsets. */
function loadSheet(assetsDir, mutation) {
  const man = JSON.parse(fs.readFileSync(path.join(assetsDir, 'manifest.json'), 'utf8'));
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(assetsDir, man.spr.streamsFile)));
  if (man.spr.streamsFormat !== 'planes-delta-1') {
    throw new Error(`stream table format ${man.spr.streamsFormat} is not `
      + 'planes-delta-1; this tool decodes the format export-web.mjs writes');
  }
  const n = man.spr.streamCount;
  const flat = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  // column 0 is romOffs, first-differenced (src/web/assets.js)
  const offs = new Uint32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc = (acc + flat[i]) >>> 0; offs[i] = acc; }
  // which shard each stream belongs to, from the packed base column
  const base = new Uint32Array(n);
  acc = 0;
  for (let i = 0; i < n; i++) { acc = (acc + flat[n + i]) >>> 0; base[i] = acc; }
  // `SprShards.shardOfBase` keys off the MASK run, not the colour run -- column
  // 1 of the stream table is the packed MASK base (src/web/assets.js:359).
  // Reading it as the colour base gives -1 for every stream, every `--break`
  // becomes a no-op and the gate is green on an empty sheet; that is the first
  // thing this file did and it is why `boot-shard-only` is one of the three.
  const shardOf = (b) => {
    for (const s of man.spr.shards) {
      if (b >= s.maskFrom && b < s.maskFrom + s.maskLen) return s.i;
    }
    return -1;
  };
  const set = new Set();
  for (let i = 0; i < n; i++) {
    const sh = shardOf(base[i]);
    if (mutation === 'no-boss-shard' && sh === 17) continue;
    if (mutation === 'boot-shard-only' && sh !== 0) continue;
    if (mutation === 'no-type24-immediate' && offs[i] === 0x07e8ac) continue;
    set.add(offs[i]);
  }
  return { man, set };
}

function args(argv) {
  const a = {
    manifest: path.join(GAME, 'tools/oracle/out/w69/stage1-sweep/manifest.json'),
    assets: path.join(GAME, 'assets'), from: 0, to: Infinity,
    break: null, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    if (argv[i] === '--manifest') { a.manifest = v; i++; } else if (argv[i] === '--assets') { a.assets = v; i++; } else if (argv[i] === '--from') { a.from = Number(v); i++; } else if (argv[i] === '--to') { a.to = Number(v); i++; } else if (argv[i] === '--break') { a.break = v; i++; } else if (argv[i] === '--quiet') a.quiet = true;
  }
  if (a.break && !MUTATIONS[a.break]) {
    throw new Error(`unknown --break ${a.break}; have `
      + `${Object.keys(MUTATIONS).join(', ')}`);
  }
  return a;
}

export function run(argv = []) {
  const a = args(argv);
  const man = JSON.parse(fs.readFileSync(a.manifest, 'utf8'));
  const dir = path.join(path.dirname(a.manifest), man.dir);
  const { set } = loadSheet(a.assets, a.break);

  // offs -> {entries, firstLf, lastLf}
  const seen = new Map();
  let entries = 0, rungs = 0;
  for (const r of man.rungs) {
    if (r.lf < a.from || r.lf > a.to) continue;
    const buf = fs.readFileSync(path.join(dir, r.ram));
    const cp = readCheckpoint(new Ram(buf));
    rungs++;
    for (const e of cp.entries) {
      if (e.filler) continue;
      const o = e.d.offs;
      if (o === 0) continue;                       // the null stream, W41 §1.3
      entries++;
      const s = seen.get(o) ?? { n: 0, firstLf: r.lf, lastLf: r.lf };
      s.n++; s.lastLf = r.lf; seen.set(o, s);
    }
  }

  const missing = [...seen].filter(([o]) => !set.has(o))
    .sort((x, y) => y[1].n - x[1].n);
  let missRecords = 0;
  for (const [, s] of missing) missRecords += s.n;

  // --------------------------------------------- THE BOSS'S OWN, the assertion
  const boss = bossStreams();
  if (!boss) throw new Error('tools/oracle/out/maincpu.bin is missing; run '
    + 'games/ddpdoj/tools/oracle/derive.py');
  const bossSeen = [...seen].filter(([o]) => boss.has(o));
  const bossMissing = bossSeen.filter(([o]) => !set.has(o))
    .sort((x, y) => y[1].n - x[1].n);
  let bossEntries = 0, bossMissEntries = 0;
  for (const [, s] of bossSeen) bossEntries += s.n;
  for (const [, s] of bossMissing) bossMissEntries += s.n;
  const bossShipped = [...boss.keys()].filter((o) => set.has(o)).length;

  if (!a.quiet) {
    console.log(`W98 BOARD ART COVERAGE -- ${man.scenario}, ${rungs} rungs `
      + `lf${a.from === 0 ? man.rungs[0].lf : a.from}..`
      + `${a.to === Infinity ? man.rungs[man.rungs.length - 1].lf : a.to}`);
    console.log(`  INTERVENTION: ${man.intervention}`);
    console.log(`  the BOARD's own display list: ${entries} entries over `
      + `${seen.size} distinct sprite streams`);
    console.log(`  the shipped sheet holds ${set.size} streams`);
    if (a.break) console.log(`  --break ${a.break}: ${MUTATIONS[a.break]}`);
    console.log(`  NOT IN THE SHEET: ${missing.length} streams, `
      + `${missRecords} board entries`);
    for (const [o, s] of missing.slice(0, 20)) {
      console.log(`    ${hx(o)}  ${String(s.n).padStart(5)} entries  `
        + `lf${s.firstLf}..${s.lastLf}`);
    }
    if (missing.length > 20) console.log(`    ... and ${missing.length - 20} more`);
    console.log('\n  THE BOSS\'S OWN SIX TABLES + $292952\'s immediate, read '
      + `here out of maincpu.bin: ${boss.size} streams, of which the bundle `
      + `holds ${bossShipped}`);
    console.log(`  the BOARD draws ${bossSeen.length} of them over `
      + `${bossEntries} display-list entries in this ladder`);
    for (const [o, s] of bossMissing.slice(0, 20)) {
      console.log(`    MISSING ${hx(o)}  ${String(s.n).padStart(5)} entries  `
        + `lf${s.firstLf}..${s.lastLf}  ${boss.get(o)}`);
    }
  }
  // WHAT IS ASSERTED IS THE BOSS'S, NOT THE WHOLE SHEET.  [M] the board draws
  // 651 distinct streams over this ladder and the bundle holds 533 of them;
  // the 118 it does not are the enemy-bullet ($1Cxxxx) and effect ($22Axxx)
  // families, they predate this wave, and they are REPORTED above rather than
  // asserted so that this gate says something true about the thing it is for.
  const ok = bossMissing.length === 0;
  console.log(ok
    ? `W98 BOARD ART: ok -- all ${bossSeen.length} of the boss's own streams `
      + `that the BOARD draws (${bossEntries} display-list entries) have a `
      + `picture in the shipped bundle, and the sheet holds ${bossShipped} of `
      + `the ${boss.size} its tables contain. (board-wide, REPORTED not `
      + `asserted: ${missing.length} of ${seen.size} streams absent, `
      + `${missRecords} of ${entries} entries)`
    : `W98 BOARD ART: ${bossMissing.length} OF THE BOSS'S STREAMS MISSING `
      + `(${bossMissEntries} of ${bossEntries} board display-list entries the `
      + 'boss produces)');
  return { ok, entries, distinct: seen.size, missing: missing.length, missRecords,
    bossStreams: boss.size, bossShipped, bossSeen: bossSeen.length,
    bossEntries, bossMissing: bossMissing.length, bossMissEntries };
}

if (process.argv[1] && process.argv[1].endsWith('w98bossartgate.mjs')) {
  const r = run(process.argv.slice(2));
  process.exit(r.ok ? 0 : 1);
}
