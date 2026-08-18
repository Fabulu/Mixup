// ===============================================================================================
// W421 -- DOCKET D53. THE SHELL URLS CARRY THE BUILD ID, SO A STALE CACHE CANNOT ANSWER.
// ===============================================================================================
//
// THE OWNER'S REPORT: "website for gbtman.pages.dev gave me an error when selecting dodonpachi.
// Only cleared when I ctrl shift r'd. We need a weapon against this staleness."
//
// THE COORDINATOR'S DOCKET CALLED THIS A RACE. IT IS NOT. It was the guaranteed outcome of every
// single deploy for anyone who had visited before, and the wave that fixed it measured the split:
// 1 file from the new build, 118 from the old.
//
//   1. the OLD worker is still the controller -- the page is what registers the new one;
//   2. the navigation is network-first, so the browser gets the NEW index.html;
//   3. that HTML asks for the SAME module URLs as yesterday, and the old worker answers them
//      cache-first out of the previous build's cache;
//   4. new page plus old modules is a runtime error that looks exactly like a port defect.
//
// AND IT LATCHES, which is why only a hard reload cleared it: `serviceWorker.register()` sits at
// the bottom of the page's inline module, BELOW its imports. A stale module throws, the module
// body never runs, the new worker is never registered, and the old one keeps answering for every
// ordinary reload -- indefinitely.
//
// THE FIX IS TO CHANGE THE URL, NOT THE POLICY. The module tree ships under `src-<buildId>/`, so
// the previous cache has never heard of the request and physically cannot serve it.
//
// **WHY `?v=BUILD` WOULD NOT HAVE WORKED**, and the docket suggested it: the SHIPPED worker matches
// with `ignoreSearch: true`, so it strips the query and the stale entry hits anyway. The fix had to
// change the PATH.
//
// SECTION 1  the page's entry specifiers carry a build id
// SECTION 2  no bare `./src/` reference survives anywhere in the published game
// SECTION 3  two builds cannot collide -- the id is in the directory name
// SECTION 4  the fix is gated on a worker existing, so batman and gradius are untouched
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const DIST = here('../../../dist');
const GAME = path.join(DIST, 'games', 'ddpdoj');
const PAGE = path.join(GAME, 'index.html');

// dist/ is generated. If it has not been built in this checkout the honest outcome is a SKIP,
// never a pass -- the same rule the ROM-image tests follow.
const SKIP = existsSync(PAGE) ? false
  : 'dist/games/ddpdoj/index.html absent -- run tools/build-dist.mjs. THIS IS A SKIP, NOT A PASS.';

const html = SKIP ? '' : readFileSync(PAGE, 'utf8');
const VERSIONED = /\.\/src-(\d{14})\//;

test('SECTION 1: the page loads its modules from a BUILD-SCOPED directory', { skip: SKIP }, () => {
  const refs = [...html.matchAll(/\.\/(src[^/"']*)\//g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'the page references a module tree at all');
  const bare = refs.filter((r) => r === 'src');
  assert.deepEqual(bare, [],
    'NO entry specifier may be the bare ./src/ -- that is the URL an old cache can answer');
  for (const r of refs) {
    assert.match('./' + r + '/', VERSIONED,
      `every entry specifier carries a 14-digit build id, got ./${r}/`);
  }
});

test('SECTION 1: all entry specifiers agree on ONE build id', { skip: SKIP }, () => {
  const ids = new Set([...html.matchAll(/\.\/src-(\d{14})\//g)].map((m) => m[1]));
  assert.equal(ids.size, 1,
    'a page half-repointed at two builds would be worse than the bug being fixed');
});

test('SECTION 1: the directory the page names actually exists', { skip: SKIP }, () => {
  const m = html.match(VERSIONED);
  assert.ok(m, 'the page names a versioned tree');
  const dir = path.join(GAME, 'src-' + m[1]);
  assert.ok(existsSync(dir), `the page points at ${path.basename(dir)} and it must exist`);
  assert.ok(readdirSync(dir).length > 0, '  ...and it must not be empty');
});

test('SECTION 2: no bare ./src/ reference survives anywhere in the published game',
  { skip: SKIP }, () => {
    // A single missed rewrite reintroduces the whole defect for that one file, and a partly
    // stale module graph is harder to diagnose than a wholly stale one.
    const offenders = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(html|js|mjs|json)$/.test(e.name)) continue;
        const text = readFileSync(p, 'utf8');
        if (/(["'`(])\.\/src\//.test(text)) offenders.push(path.relative(GAME, p));
      }
    };
    walk(GAME);
    assert.deepEqual(offenders, [],
      'these files still request the unversioned tree an old cache can answer');
  });

test('SECTION 3: the build id is in the DIRECTORY NAME, so two builds cannot share a URL',
  { skip: SKIP }, () => {
    // The proof the docket demanded was two builds in succession producing different shell URLs.
    // That was run by hand; this pins the property that made it true, so it cannot regress
    // silently: the id is part of the path, not a query string.
    const m = html.match(VERSIONED);
    assert.ok(m, 'a build id is present');
    assert.match(m[1], /^\d{14}$/, 'it is the 14-digit build stamp');
    // And it must NOT be a query, because the shipped worker matches with ignoreSearch: true
    // and would strip it -- which is exactly why `?v=BUILD` was rejected.
    assert.doesNotMatch(html, /\.\/src\/[^"']*\?v=/,
      'a ?v= query would be stripped by ignoreSearch and would NOT fix this');
  });

test('SECTION 4: the fix is gated on a service worker, so games without one are untouched',
  { skip: SKIP }, () => {
    // Only a game with a cache-first worker has the hole. Batman and gradius have none, and
    // silently changing their URLs would be scope the owner did not ask for.
    assert.ok(existsSync(path.join(GAME, 'sw.js')), 'ddpdoj has a worker, so it is versioned');
    for (const g of ['batman', 'gradius']) {
      const dir = path.join(DIST, 'games', g);
      if (!existsSync(dir)) continue;
      if (existsSync(path.join(dir, 'sw.js'))) continue;      // if one gains a worker, it qualifies
      const versioned = readdirSync(dir).filter((n) => /^src-\d{14}$/.test(n));
      assert.deepEqual(versioned, [],
        `${g} has no service worker and so must keep its plain URLs`);
    }
  });
