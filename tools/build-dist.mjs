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

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');

const INCLUDE = ['index.html', 'src', 'assets'];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dst, name));
  } else {
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
fs.writeFileSync(path.join(DIST, '_headers'), [
  '/assets/*',
  '  Cache-Control: no-cache',
  '',
  '/src/*',
  '  Cache-Control: no-cache',
  '',
  '/',
  '  Cache-Control: no-cache',
  '',
].join('\n'));

let files = 0, bytes = 0;
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p); else { files++; bytes += s.size; }
  }
})(DIST);

console.log(`dist/ built: ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
