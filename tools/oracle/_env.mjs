// ONE place decides where the repo is, where the GAME is, and how a headless
// harness reaches that game's assets.
//
// WHY THIS FILE EXISTS. Before it, 50 tools carried a verbatim copy of the
// `imp()` dynamic-import helper, 48 carried a fetch shim that rewrites any URL
// down to `assets/...` and re-resolves it against the repo root (three
// different spellings, all equivalent), and ROOT itself was derived 72 times
// in three different ways. That is not merely duplication: it means there is no
// single answer to "where do the game's assets come from", so a tree whose
// layout moves can be fed a MOVED src/ from an UNMOVED assets/ by every harness
// at once -- staying bit-exact while the browser draws a zero-filled level.
//
// THE SEAM IS `GAME_ROOT`. ROOT is the repository; GAME_ROOT is the directory
// holding one game's src/, tests/ and assets/. They were the same directory
// when this file was written, and the split is what lets a second game exist
// without touching 90 tools.
//
// Note what is deliberately NOT here: rip/ output paths, the ROM filename, and
// the python spawn cwd all stay resolved against ROOT. Those are repo-level
// scratch and repo-level inputs, not game content.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The repository root: two levels above tools/oracle/. */
export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/**
 * The directory holding the game under test -- its src/, tests/ and assets/.
 *
 * Every path in this file that names game CONTENT resolves against this, and
 * every path that names repo scratch (rip/, dist/) resolves against ROOT.
 */
export const GAME_ROOT = path.join(ROOT, 'games', 'batman');

/** Import a module by its path RELATIVE TO THE GAME, e.g. imp('src/state.js'). */
export const imp = (p) => import(pathToFileURL(path.join(GAME_ROOT, p)).href);

/** Resolve a path relative to the game, e.g. gamePath('assets', 'manifest.json'). */
export const gamePath = (...p) => path.join(GAME_ROOT, ...p);

/**
 * Install the headless `fetch` the port's src/assets.js talks to.
 *
 * src/assets.js resolves its URLs against ITS OWN module url, so what arrives
 * here is an absolute file:// URL ending in `assets/...`. The shim keeps only
 * that tail and re-resolves it against GAME_ROOT.
 *
 * A missing file returns a 404 response rather than throwing ENOENT. Both are
 * failures; a 404 is the one src/assets.js can name usefully.
 *
 * Idempotent: several tools install it and then import another that would too.
 */
export function installFetchShim() {
  if (globalThis.__oracleFetchShim) return;
  globalThis.__oracleFetchShim = true;
  globalThis.fetch = async (url) => {
    const rel = String(url).replace(/^.*?assets\//, 'assets/');
    const file = path.join(GAME_ROOT, rel);
    if (!fs.existsSync(file)) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const buf = fs.readFileSync(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  };
}
