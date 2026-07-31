// Assemble the deployable site into dist/.
//
// Only what a browser needs: the launcher, src/ and the extracted assets.
// Tools, tests, docs, the disassembly and the ROM itself all stay out.
//
// dist/ is gitignored -- it contains ROM-derived data and is regenerated from
// your own cartridge with `python tools/export_assets.py` first.
//
// Usage:  node tools/build-dist.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './oracle/_env.mjs';

const DIST = path.join(ROOT, 'dist');

// Per game: game.json, src/ and assets/. tests/ is deliberately NOT copied.
//
// games/index.json is the FIRST thing the launcher fetches and game.json is the
// second, before any game code is imported at all -- so a dist/ without them is
// a site whose game select renders empty. They are cheap and they are load
// bearing; the INCLUDE list is the only place that knows it.
const GAMES = ['batman', 'gradius'];

// Games that also ship their OWN page. Gradius cannot go through the launcher
// yet: the picker imports code.entry, code.mods and code.input, and Gradius has
// only the first of the three. Until it has the other two it is reachable at
// /games/gradius/ and listed in the picker as a link, not booted inline.
const PAGES = ['gradius'];

const INCLUDE = ['index.html', 'games/index.json',
                 ...GAMES.flatMap((g) => [`games/${g}/game.json`,
                                          `games/${g}/src`, `games/${g}/assets`]),
                 ...PAGES.map((g) => `games/${g}/index.html`)];

// assets/ is ROM-DERIVED, and "derived" covers a range. games/batman/assets/
// holds extracted tables -- decoded levels, a tile subset, a sound script. But
// games/gradius/tools/export_assets.py also drops prg.bin and chr.bin there,
// and those are the cartridge's two 32 KB halves BYTE-FOR-BYTE: together they
// are the whole ROM. Gitignore keeps them out of the repo; it does NOT keep
// them out of dist/, and dist/ gets published to a public URL.
//
// They are intermediates -- src/assets.js fetches manifest.json, chr/tiles.u8,
// terrain/stages.json and metasprites.json, and never these -- so dropping them
// costs the site nothing. The guard below is the part that matters: an
// intermediate nobody remembers is exactly how this would come back.
const NEVER_SHIP = new Set(['prg.bin', 'chr.bin', 'prg.asm']);

// Files the guard below WILL find inside a ROM and that we ship anyway, each
// with the reason written out. This list is deliberately awkward to add to.
//
// player.tiles.bin -- 6974 B, the player's animation tile pool from bank 2.
//   src/assets.js:82 fetches it and the port cannot draw Batman without it, so
//   there is no version of the site that works without shipping these bytes.
//   It has been served publicly since the first deploy. Noted here so it is a
//   decision on the record rather than an oversight nobody ever looked at.
//
// The Gradius chr/bank*.bin files are NOT here: the renderer fetches
// chr/tiles.u8, a re-indexed one-byte-per-pixel sheet, and the raw banks are
// just intermediates the exporter happened to leave behind.
const SHIPPED_ANYWAY = new Set(['player.tiles.bin']);

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dst, name));
  } else {
    if (NEVER_SHIP.has(path.basename(src))) return;
    // The Gradius exporter also leaves the four raw 8 KB CHR banks in assets/.
    // chr/tiles.u8 is what the renderer actually fetches; these are verbatim
    // cartridge graphics and the guard below rejects them.
    if (/^bank\d+\.bin$/.test(path.basename(src))) return;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.error(`missing ${item} -- run: python tools/export_assets.py`);
    process.exit(1);
  }
  copy(src, path.join(DIST, item));
}

// THE GUARD. dist/ is published to a public URL, so "is this file a piece of the
// cartridge?" has to be answered by measurement, not by remembering to add a
// basename to NEVER_SHIP above.
//
// Every ROM in the repo root is read once, and every file about to be published
// is checked for being a byte-identical contiguous slice of one. That is the
// property that matters -- not the name, not the extension, not the directory.
// prg.bin and chr.bin were caught by exactly this: each is 32768 bytes and each
// matches its half of Gradius (USA).nes exactly.
//
// Legitimate extracted assets do not trip it. A decoded level table, a
// re-indexed tile sheet and a transcribed sound script are all transformations;
// none of them appears verbatim in the ROM. If something does trip it, the
// export step is shipping an intermediate rather than a translation, and that
// is the bug -- not this check.
const roms = fs.readdirSync(ROOT)
  // NOT `md` for Mega Drive: it also matches Markdown, and this happily loaded
  // README.md as a cartridge. Use `gen`/`bin` under a roms/ dir if that console
  // ever arrives -- a bare `.bin` at the repo root is too broad to guess at.
  .filter((f) => /\.(gb|gbc|nes|sfc|smc|gen)$/i.test(f))
  .map((f) => ({ name: f, data: fs.readFileSync(path.join(ROOT, f)) }));

const shipped = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else shipped.push(p);
  }
})(DIST);

const leaked = [];
for (const file of shipped) {
  const data = fs.readFileSync(file);
  // Under 1 KB a coincidental match means nothing -- a run of zeroes or a short
  // table can legitimately appear in both. The concern is bulk ROM content.
  if (data.length < 1024) continue;
  if (SHIPPED_ANYWAY.has(path.basename(file))) continue;
  for (const rom of roms) {
    if (rom.data.includes(data)) {
      leaked.push(`${path.relative(DIST, file)}  (${data.length} B, verbatim inside ${rom.name})`);
      break;
    }
  }
}

if (leaked.length) {
  console.error('\nREFUSING TO BUILD: dist/ contains verbatim cartridge data.\n'
    + leaked.map((l) => '  ' + l).join('\n')
    + '\n\ndist/ is published publicly. A file that appears byte-for-byte inside a\n'
    + 'ROM is the ROM, however it got there. Either the exporter is writing an\n'
    + 'intermediate into assets/ (drop it, or add its basename to NEVER_SHIP),\n'
    + 'or something that should be a translation is a copy.');
  fs.rmSync(DIST, { recursive: true, force: true });
  process.exit(1);
}
console.log(`rom-leak guard: ${shipped.length} files checked against `
  + `${roms.length} ROM(s) [${roms.map((r) => r.name).join(', ') || 'none present'}] -- clean`);

// Assets must REVALIDATE, not be treated as immutable.
//
// They were served `max-age=31536000, immutable`, which is only safe if a
// file's contents never change under a fixed URL -- and ours do: re-running an
// exporter rewrites them in place. assets/water.json gained a per-level shape
// and every browser that had already cached the old one kept it for a year,
// silently losing the window tilemap and the tile animation. The water then
// rendered as black squares, intermittently, depending purely on cache state.
//
// Cloudflare Pages sends ETags, so revalidation is a 304 in the normal case.
// If these ever need long caching again, the URLs have to carry a content
// hash first.
//
// THE ENTRY DOCUMENT IS `no-store`, NOT `no-cache`, and the distinction is the
// whole point. `no-cache` means "keep it, but revalidate" -- phones treat that
// loosely for the top-level document, and Safari's back-forward cache will
// hand back a stored page without asking anyone. That has looked like a game
// bug three separate times in this project. `no-store` leaves nothing to serve
// stale.
//
// Only the HTML pays that cost; everything it references stays on `no-cache`
// and revalidates to a 304 via ETag, which is cheap and correct once the
// document that names them is guaranteed fresh. Both `/` and `/index.html` are
// listed because a rule for one does not necessarily match the other, and the
// `/*` fallback catches anything added later.
// ORDER MATTERS AND IT IS NOT "MOST SPECIFIC WINS". Cloudflare Pages applies
// every matching rule in file order and later ones override earlier ones, so
// the broad `/*` fallback has to come FIRST. Written the other way round it
// silently reverted the entry document to no-cache -- verified by reading
// Cache-Control off the live response, which is the only way to know.
fs.writeFileSync(path.join(DIST, '_headers'), [
  '/*',
  '  Cache-Control: no-cache',
  '',
  // One rule for everything a game owns -- its src/ and its assets/ both live
  // under /games/<id>/ now, so the two separate /assets/* and /src/* rules that
  // used to be here no longer match anything and would have gone quietly dead.
  '/games/*',
  '  Cache-Control: no-cache',
  '',
  '/',
  '  Cache-Control: no-store, must-revalidate',
  '',
  '/index.html',
  '  Cache-Control: no-store, must-revalidate',
  '',
].join('\n'));

// Stamp the SAME build id into the code and into the manifest, so the app can
// tell when a browser has served it a mixed pair.
//
// `no-cache` makes every file revalidate, and every path shape does carry it --
// but that is not the failure mode. Deploys are not atomic from a client's
// point of view: a page loaded while one is landing can take new JS from one
// edge and an old manifest from another. That showed up as "cannot read
// properties of undefined (reading 'map')" on a phone while the same build was
// fine on a laptop, and no cache header can prevent it. Detecting it can.
const buildId = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
for (const g of GAMES) {
fs.writeFileSync(path.join(DIST, 'games', g, 'src', 'buildid.js'), [
  '// Generated by tools/build-dist.mjs. In a dev tree this file does not',
  '// exist, and assets.js skips the check entirely.',
  `export const BUILD_ID = '${buildId}';`,
  '',
].join('\n'));
  const mp = path.join(DIST, 'games', g, 'assets', 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  m.buildId = buildId;
  fs.writeFileSync(mp, JSON.stringify(m));
}

let files = 0, bytes = 0;
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p); else { files++; bytes += s.size; }
  }
})(DIST);

console.log(`dist/ built: ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
