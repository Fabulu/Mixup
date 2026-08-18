// BUILD-ID-SCOPED SHELL URLS -- DOCKET D53, "we need a weapon against this staleness".
//
// ===========================================================================
// THE BUG THIS EXISTS FOR
// ===========================================================================
// `games/ddpdoj/sw.js` serves the SHELL cache-first and the assets network-first.
// The shell is the page, its ~118 modules and the shared audio/input layer. Cache
// entries are build-scoped (`ddpdoj-shell-<buildId>`), the old cache is deleted on
// activate, and `caches.match` is pinned to this build's cache. All of that is
// correct and none of it helps, because of the one thing it cannot fix:
//
//   **THE MODULE URLS WERE THE SAME IN EVERY BUILD.**
//
// So the first load after any deploy, for anyone who had visited before, went:
//
//   1. the OLD worker is still the controller -- the new one is not fetched until
//      the page's `load` event, and it is the page that registers it;
//   2. the navigation is network-first, so the browser gets the NEW index.html;
//   3. that HTML asks for `./src/web/app.js`, the same URL as yesterday, and the
//      old worker answers it CACHE-FIRST out of `ddpdoj-shell-<previous>`;
//   4. new page + old modules, which is a runtime error that looks exactly like a
//      port defect.
//
// That is not a race that "usually" passes. It is the guaranteed outcome of every
// deploy, and it was measured: 1 file from the new build, 118 from the old.
// And it LATCHES, which is why the owner reported that only Ctrl-Shift-R cleared
// it: `navigator.serviceWorker.register()` sits at the bottom of the page's inline
// module, below the two `import` statements. When a stale module throws, the module
// body never runs, so the new worker is never registered, so the old one keeps
// answering -- for every ordinary reload, indefinitely. A hard reload bypasses the
// worker, the page runs, registration finally happens, and the site "fixes itself".
//
// ===========================================================================
// THE FIX: CHANGE THE URL, NOT THE POLICY
// ===========================================================================
// The module tree is published under a directory carrying the build id --
// `games/ddpdoj/src-20260818175903/` -- and the page's two entry specifiers are
// rewritten to match. Relative imports INSIDE the tree need no rewriting at all:
// they resolve within whatever directory their importer was loaded from.
//
// This is the content-hash idea with the plumbing removed. What matters is not
// that the name encodes a digest, it is that **a new build cannot be answered out
// of an old cache, because the old cache has never heard of the URL.** That works
// against the ALREADY-DEPLOYED worker, which is the property the alternatives lack:
//
//   * `?v=<buildId>` on the same paths is defeated outright -- the shipped worker
//     looks up with `{ ignoreSearch: true }`, so `app.js?v=NEW` matches the cached
//     `app.js` and the stale bytes come back anyway. It would only start working one
//     deploy after `sw.js` itself changed, and the deploy in between is the broken one.
//   * making the shell network-first fixes nothing on the transition load either,
//     for the same reason: the worker doing the serving is the OLD one. It also
//     gives up the offline shell.
//
// The offline shell is preserved exactly: an offline visitor gets index.html from
// the shell cache, and that HTML names the same build's module URLs, which are in
// the same cache. A mixture is now unrepresentable rather than unlikely.
//
// ===========================================================================
// SCOPE: GAMES THAT SHIP A SERVICE WORKER, WHICH TODAY IS ONLY DaiOuJou
// ===========================================================================
// Batman and Gradius have no `sw.js` and therefore no cache-first layer -- their
// modules are governed by `dist/_headers` alone, which is `no-cache` and
// revalidates. They do NOT have this hole and their URLs are deliberately left
// alone. `build-dist.mjs` gates this on the presence of `sw.js`, so a game that
// gains a worker gets versioned URLs in the same commit rather than by remembering.
//
// `shared/` is the trap in that decision. `src/web/app.js` and `src/web/input.js`
// import `/shared/audio.js` and `/shared/input.js`, which are OUTSIDE the game's
// src/ tree and are still shell-cached by the worker -- a fix scoped to src/ alone
// would leave two stale modules behind, which is the whole failure again in
// miniature. So a versioned copy of the shared layer is published beside it and the
// importing specifiers are rewritten. `dist/shared/` stays exactly where it is,
// because Gradius imports it and Gradius is not being changed.

import fs from 'node:fs';
import path from 'node:path';

/** The published directory name for a game's module tree in this build. */
export const srcDirName = (buildId) => `src-${buildId}`;
/** The published directory name for the shared layer in this build. */
export const sharedDirName = (buildId) => `shared-${buildId}`;

/**
 * Every quoted RELATIVE specifier in a JS or HTML source.
 *
 * Matched on the quoted string rather than on `import ... from`, because a real
 * import list spans lines and an anchored pattern silently misses those -- and a
 * silent miss here republishes a stale URL. The `./` or `../` prefix is what keeps
 * it honest: prose in these files says things like "not under src/", which is not
 * a specifier and does not start that way.
 */
const QUOTED_RELATIVE = /(['"])((?:\.\.?\/)[^'"\n]*)\1/g;

/**
 * Rewrite the relative specifiers of one file.
 *
 * @param {string} text     the file's source
 * @param {string} fromPath the file's SITE path, e.g. `/games/ddpdoj/index.html`
 * @param {(resolved: string) => string|null} remap
 *        given the resolved site path, return the new site path or null to keep it
 * @returns {{ text: string, changed: number }}
 */
export function rewriteRelativeRefs(text, fromPath, remap) {
  let changed = 0;
  const base = `https://x${fromPath}`;
  const out = text.replace(QUOTED_RELATIVE, (whole, q, spec) => {
    let resolved;
    try { resolved = new URL(spec, base).pathname; } catch { return whole; }
    const to = remap(resolved);
    if (to === null || to === resolved) return whole;
    // Re-express as a relative specifier from this file's directory. A bare name
    // must keep its `./`, or a module specifier becomes a bare import.
    let rel = path.posix.relative(path.posix.dirname(fromPath), to);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    changed++;
    return `${q}${rel}${q}`;
  });
  return { text: out, changed };
}

const walk = (dir, out = []) => {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

const sitePath = (dist, abs) => `/${path.relative(dist, abs).split(path.sep).join('/')}`;

/**
 * Move a game's published module tree to a build-scoped URL and repoint everything
 * that names it.
 *
 * Called by tools/build-dist.mjs AFTER the build id exists and after `buildid.js`
 * has been written, so the generated file moves with the tree.
 *
 * @param {string} dist    the dist/ directory
 * @param {string} game    e.g. 'ddpdoj'
 * @param {string} buildId the 14-digit build id
 * @returns {{ src: string, shared: string, htmlRefs: number, sharedRefs: number, files: number }}
 */
export function versionShellTree(dist, game, buildId) {
  const gameDir = path.join(dist, 'games', game);
  const oldSrc = path.join(gameDir, 'src');
  const newSrcName = srcDirName(buildId);
  const newSrc = path.join(gameDir, newSrcName);
  if (!fs.existsSync(oldSrc)) {
    throw new Error(`versionShellTree: ${game} has no dist src/ to version`);
  }
  // MOVED, not copied. Two live copies would double a 4.8 MB payload and leave the
  // stale URL answerable, which is the thing being closed.
  fs.renameSync(oldSrc, newSrc);

  // The shared layer, versioned BESIDE the original. dist/shared/ stays: Gradius
  // imports it and Gradius has no worker, so its URLs must not move.
  const newSharedName = sharedDirName(buildId);
  const oldShared = path.join(dist, 'shared');
  const newShared = path.join(dist, newSharedName);
  if (fs.existsSync(oldShared) && !fs.existsSync(newShared)) {
    // `.test.js` is filtered here on purpose. NEVER_SHIP in build-dist.mjs names
    // `input.test.js` but not `audio.test.js`, so dist/shared/ already carries one
    // test file -- a pre-existing leak, left alone because it is not this unit --
    // and there is no reason to publish a SECOND copy of it.
    fs.cpSync(oldShared, newShared,
      { recursive: true, filter: (s) => !s.endsWith('.test.js') });
  }

  const remapShared = (p) => (p.startsWith('/shared/') ? `/${newSharedName}${p.slice('/shared'.length)}` : null);

  let sharedRefs = 0;
  const files = walk(newSrc).filter((p) => p.endsWith('.js'));
  for (const f of files) {
    const from = sitePath(dist, f);
    const src = fs.readFileSync(f, 'utf8');
    const { text, changed } = rewriteRelativeRefs(src, from, remapShared);
    if (changed) { fs.writeFileSync(f, text); sharedRefs += changed; }
  }

  // The page's entry specifiers. `./src/web/app.js` -> `./src-<buildId>/web/app.js`.
  const oldSrcSite = `/games/${game}/src/`;
  const remapSrc = (p) => (p.startsWith(oldSrcSite)
    ? `/games/${game}/${newSrcName}/${p.slice(oldSrcSite.length)}` : remapShared(p));
  let htmlRefs = 0;
  for (const n of fs.readdirSync(gameDir)) {
    if (!n.endsWith('.html')) continue;
    const p = path.join(gameDir, n);
    const { text, changed } = rewriteRelativeRefs(fs.readFileSync(p, 'utf8'), sitePath(dist, p), remapSrc);
    if (changed) { fs.writeFileSync(p, text); htmlRefs += changed; }
  }
  if (htmlRefs === 0) {
    throw new Error(`versionShellTree: ${game}'s pages name no './src/...' module, so `
      + 'nothing was repointed. Either the entry moved or the rewrite stopped matching -- '
      + 'and a silent no-op here republishes the exact URL collision D53 is about.');
  }

  // POST-CONDITION. Anything still resolving to an unversioned shell URL is a hole
  // the next deploy would serve stale, so it fails the build rather than shipping.
  const leftovers = [];
  for (const f of [...walk(newSrc).filter((p) => p.endsWith('.js')),
    ...fs.readdirSync(gameDir).filter((n) => n.endsWith('.html')).map((n) => path.join(gameDir, n))]) {
    const from = sitePath(dist, f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(QUOTED_RELATIVE)) {
      let resolved;
      try { resolved = new URL(m[2], `https://x${from}`).pathname; } catch { continue; }
      if (resolved.startsWith('/shared/') || resolved.startsWith(oldSrcSite)) {
        leftovers.push(`${from} -> ${m[2]}`);
      }
    }
  }
  if (leftovers.length) {
    throw new Error('versionShellTree: these shell references still point at an '
      + `unversioned URL and would be served from a stale cache:\n  ${leftovers.join('\n  ')}`);
  }

  return { src: newSrcName, shared: newSharedName, htmlRefs, sharedRefs, files: files.length };
}
