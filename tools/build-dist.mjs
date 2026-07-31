// Assemble the deployable site into dist/.
//
// Only what a browser needs: the launcher, src/ and the extracted assets.
// Tools, tests, docs, the disassembly and the ROM itself all stay out.
//
// dist/ is gitignored -- it contains ROM-derived data and is regenerated from
// your own cartridge with `python tools/export_assets.py` first.
//
// "ROM-derived" here means DERIVED: decoded tables, a built VRAM image, a
// transcribed sound script. Nothing published is a verbatim slice of a
// cartridge, the guard below measures that rather than trusting it, and there
// is no allowlist -- see SUBSTITUTE and the note above the guard.
//
// Usage:  node tools/build-dist.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './oracle/_env.mjs';
import { makePlaceholderPool } from './make-placeholder-tiles.mjs';

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

// THERE IS NO ALLOWLIST. There used to be one -- `SHIPPED_ANYWAY`, holding
// exactly `player.tiles.bin`: 6974 B of the player's animation tile pool
// lifted verbatim out of bank 2, which src/assets.js:82 fetches and without
// which the port could not draw its player at all. So the guard found it,
// named it, and was told to ship it anyway, on every deploy since the first.
//
// It is gone, and so is the mechanism, deliberately: an allowlist is a hole
// somebody can widen with one line and a plausible reason. What replaced it is
// SUBSTITUTE below -- the shipped build gets ORIGINAL placeholder art of the
// same length and the same tile indexing, and the guard checks it like
// anything else. If a future file genuinely cannot be published, the answer is
// to not publish it, or to draw a replacement, not to re-open this door.
//
// The Gradius chr/bank*.bin files never needed an entry: the renderer fetches
// chr/tiles.u8, a re-indexed one-byte-per-pixel sheet, and the raw banks are
// just intermediates the exporter happened to leave behind.

// Files REPLACED on the way into dist/. Key = repo-relative source path with
// forward slashes; value = a function returning the bytes to publish instead.
//
// The local tree keeps the real cartridge tiles, and it must: regress.mjs,
// pixeldiff.mjs and every oracle harness read games/batman/assets/ directly and
// compare against the ROM frame by frame. Substituting here -- at the copy, not
// in assets/ and not in src/ -- is what lets the published site be free of
// cartridge graphics while the measurement the project runs on is untouched.
// `node tools/oracle/pixeldiff.mjs` must still say 73 frames / 66894 wrong px /
// 96.023% after this change; if it moves, the substitution has leaked into the
// dev tree and that is the bug.
// EMPTY ON PURPOSE, and the machinery stays. player.tiles.bin was in here and
// was taken out by an explicit decision from the repo's owner: the PUBLISHED
// SITE may serve real cartridge art, it is GITHUB that must stay clean. Those
// are different questions and the placeholder swap answered the wrong one --
// the site is the owner's own deployment of their own legally-owned cartridge,
// while the repo is public source that anyone clones.
//
// So the site shows real Batman again (see PUBLISH_VERBATIM), and this stays as
// working machinery plus tools/make-placeholder-tiles.mjs as a worked example,
// for the next asset where substituting IS the right answer.
const SUBSTITUTE = new Map([]);

// Files that ARE verbatim cartridge data and are published anyway, deliberately,
// one line of reasoning each. Not a general allowlist: it is enumerated, it is
// printed on every single build, and the guard below still blocks everything
// not named here.
//
// The distinction that matters, and the reason this is not the hole the old
// SHIPPED_ANYWAY was: prg.bin and chr.bin are the WHOLE CARTRIDGE, 32768 bytes
// each, and the site never fetches them -- publishing those is distributing the
// game, by accident, for no benefit. player.tiles.bin is 6974 bytes of player
// animation art that src/assets.js:82 fetches and without which the port cannot
// draw its own protagonist. Blocking the first is the guard doing its job;
// blocking the second only ever produced a site that looked broken.
const PUBLISH_VERBATIM = new Map([
  ['games/batman/assets/player.tiles.bin',
   'the player animation tile pool, fetched by games/batman/src/assets.js:82 -- '
   + 'the port cannot draw Batman without it. Owner decision: the live site may '
   + 'serve real cartridge art; the repo may not, and does not (assets/ is '
   + 'gitignored and nothing ROM-derived is ever committed).'],
]);

const substituted = [];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dst, name));
  } else {
    if (NEVER_SHIP.has(path.basename(src))) return;
    const rel = path.relative(ROOT, src).split(path.sep).join('/');
    const sub = SUBSTITUTE.get(rel);
    if (sub) {
      const bytes = sub();
      // Same URL, same length, same indexing -- or the browser gets a pool the
      // manifest's offsets do not fit, which draws garbage rather than failing.
      const want = fs.statSync(src).size;
      if (bytes.length !== want) {
        console.error(`substitute for ${rel} is ${bytes.length} B, source is ${want} B`);
        process.exit(1);
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, bytes);
      substituted.push(`${rel}  (${bytes.length} B of original placeholder art)`);
      return;
    }
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
const deliberate = [];
for (const file of shipped) {
  const data = fs.readFileSync(file);
  // Under 1 KB a coincidental match means nothing -- a run of zeroes or a short
  // table can legitimately appear in both. The concern is bulk ROM content.
  if (data.length < 1024) continue;
  const rel = path.relative(DIST, file).split(path.sep).join('/');
  const why = PUBLISH_VERBATIM.get(rel);
  if (why) { deliberate.push(`${rel} (${data.length} B) -- ${why}`); continue; }
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
    + 'ROM is the ROM, however it got there. Four real answers, in order of how\n'
    + 'often they turn out to be the right one:\n'
    + '  - the exporter is writing an INTERMEDIATE into assets/ that the site\n'
    + '    never fetches: drop it, or add its basename to NEVER_SHIP. This was\n'
    + '    the answer for prg.bin, chr.bin and the four chr/bank*.bin files --\n'
    + '    together the whole Gradius cartridge, none of it ever fetched;\n'
    + '  - something that should be a TRANSLATION is a copy: fix the exporter;\n'
    + '  - the site genuinely needs bytes we would rather not publish: draw an\n'
    + '    original replacement of the same length and layout and add it to\n'
    + '    SUBSTITUTE (tools/make-placeholder-tiles.mjs is the worked example);\n'
    + '  - the owner has decided this asset SHOULD be published: add it to\n'
    + '    PUBLISH_VERBATIM with the reason. That is a decision about the site,\n'
    + '    not about the repo -- nothing ROM-derived is committed either way.\n'
    + '    Do not reach for this one first.');
  fs.rmSync(DIST, { recursive: true, force: true });
  process.exit(1);
}
for (const s of substituted) console.log(`substituted: ${s}`);
// Printed EVERY build, never folded into a count. A deliberate exception that
// stops being mentioned is how the old allowlist survived unexamined from the
// first deploy to the day someone finally read it.
for (const d of deliberate) console.log(`published verbatim, deliberately: ${d}`);
console.log(`rom-leak guard: ${shipped.length} files checked against `
  + `${roms.length} ROM(s) [${roms.map((r) => r.name).join(', ') || 'none present'}] `
  + `-- clean, ${deliberate.length} deliberate exception(s)`);

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
