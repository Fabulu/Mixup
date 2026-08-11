// W280 (DOCKET D14): the page is an installable PWA.
//
// Three things here are not style preferences and each has a failure mode that is
// silent, which is why each gets an assertion:
//
//   1. `sw.js` MUST sit beside `index.html`. A worker's default scope is its own
//      directory, so one under `src/` registers, reports success, and controls
//      nothing.
//   2. the worker MUST NOT precache `assets/`. The sprite sheet is sharded and
//      deferred on purpose; a `cache.addAll` would pull every shard on first load.
//   3. `tools/build-dist.mjs` MUST copy these files and MUST stamp the build id
//      into the worker. The cache name IS the version, so a worker published with
//      `'dev'` serves the first build it ever saw for ever.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const ROOT = path.join(GAME, '..', '..');
const PAGE = readFileSync(path.join(GAME, 'index.html'), 'utf8');
const SW = readFileSync(path.join(GAME, 'sw.js'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(path.join(GAME, 'manifest.webmanifest'), 'utf8'));
const BUILDER = readFileSync(path.join(ROOT, 'tools', 'build-dist.mjs'), 'utf8');

/** Comments name the things they warn against, so code checks strip them. */
const stripComments = (js) => js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const SW_CODE = stripComments(SW);

const MODULE = (() => {
  const m = PAGE.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the page has one inline module');
  return m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
})();

// ==================================================== 1. THE MANIFEST

test('W280 the manifest is valid, scoped to this game, and PORTRAIT', () => {
  assert.equal(MANIFEST.scope, '/games/ddpdoj/', 'scoped to the game, not the origin');
  assert.equal(MANIFEST.start_url, './index.html');
  // The game is a TATE shooter (D13), so portrait is the native orientation and the
  // installed app should launch that way rather than in whatever the device held.
  assert.equal(MANIFEST.orientation, 'portrait');
  assert.equal(MANIFEST.display, 'fullscreen');
  assert.ok(Array.isArray(MANIFEST.display_override));
  // The colours must agree with the page's, or the system chrome flashes a
  // different colour on launch.
  assert.equal(MANIFEST.theme_color, '#0b0f14');
  assert.equal(MANIFEST.background_color, '#0b0f14');
  assert.match(PAGE, /<meta name="theme-color" content="#0b0f14">/);
});

test('W280 there is a MASKABLE icon as well as the plain ones', () => {
  // Without a maskable icon Android crops a normal one to a circle and clips the
  // art. The plain and the maskable are the same drawing at different bleeds.
  const purposes = MANIFEST.icons.map((i) => i.purpose);
  assert.ok(purposes.includes('maskable'), 'a maskable icon is declared');
  assert.ok(purposes.includes('any'), 'and a plain one');
  for (const i of MANIFEST.icons) {
    assert.equal(i.type, 'image/png');
    assert.ok(existsSync(path.join(GAME, i.src)), `${i.src} exists`);
  }
});

test('W280 every declared icon really IS a PNG of the size it claims', () => {
  // A manifest that lies about a size gets the icon silently rejected. Read the
  // IHDR rather than trusting the filename.
  for (const i of MANIFEST.icons) {
    const b = readFileSync(path.join(GAME, i.src));
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${i.src} signature`);
    assert.equal(b.subarray(12, 16).toString('ascii'), 'IHDR', `${i.src} first chunk`);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.equal(`${w}x${h}`, i.sizes, `${i.src} is ${w}x${h}`);
    assert.equal(b[24], 8, 'bit depth 8');
    assert.equal(b[25], 6, 'colour type 6 (RGBA)');
  }
});

test('W280 the icons are OPAQUE, which a maskable icon has to be', () => {
  // A transparent corner shows the launcher through the crop. Checked by decoding,
  // because this is exactly the kind of thing a generator gets wrong silently.
  const p = path.join(GAME, 'icon-maskable-512.png');
  const b = readFileSync(p);
  const idat = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o);
    if (b.subarray(o + 4, o + 8).toString('ascii') === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const W = 512, H = 512;
  assert.equal(raw.length, H * (1 + W * 4), 'one filter byte per row plus RGBA');
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [W >> 1, H >> 1]]) {
    const a = raw[y * (1 + W * 4) + 1 + x * 4 + 3];
    assert.equal(a, 255, `pixel ${x},${y} is opaque`);
  }
});

// ============================================ 2. THE WORKER'S PLACE AND ROUTING

test('W280 sw.js sits BESIDE index.html, not under src/', () => {
  // The scope failure is silent: it registers and controls nothing.
  assert.ok(existsSync(path.join(GAME, 'sw.js')), 'at the game root');
  assert.ok(!existsSync(path.join(GAME, 'src', 'sw.js')), 'and not under src/');
  assert.match(MODULE, /navigator\.serviceWorker\.register\('\.\/sw\.js'/,
    'and the page registers the one beside it');
  // The page also CHECKS the scope it got, so a later move is loud.
  assert.match(MODULE, /location\.pathname\.startsWith\(scope\)/,
    'the page verifies its own scope');
});

test('W280 the worker NEVER precaches assets/ -- the shards stay deferred', () => {
  // This is the whole design constraint. `src/web/assets.js` fetches one shard at a
  // time and draws a transparent pen for the ones that have not arrived; a
  // `cache.addAll` over the manifest would pull every shard on first load.
  // Checked against the CODE with comments stripped: the prose in `sw.js` names
  // `cache.addAll()` on purpose, to say why it is NOT used, and a naive grep reads
  // that as the thing it warns against. Same trap W268's UA check documents.
  assert.ok(!/addAll/.test(SW_CODE), 'no addAll anywhere in the code');
  const shell = SW.slice(SW.indexOf('const SHELL = ['), SW.indexOf('];', SW.indexOf('const SHELL = [')));
  assert.ok(!/assets/.test(shell), 'and the shell list names no asset');
  for (const f of ['./index.html', './manifest.webmanifest', './icon-192.png']) {
    assert.ok(shell.includes(f), `the shell list has ${f}`);
  }
});

test('W280 assets are NETWORK-first, and W327 makes NAVIGATIONS network-first too', () => {
  // Online: fresh art, and the shard cost is paid when assets.js decided to pay it.
  // Offline: whatever has been seen. The two routes must not be swapped.
  assert.match(SW, /const isAsset = \(url\) => url\.pathname\.includes\('\/games\/ddpdoj\/assets\/'\)/);
  const assetArm = SW.slice(SW.indexOf('if (isAsset(url))'));
  const head = assetArm.slice(0, assetArm.indexOf('return;'));
  assert.ok(head.indexOf('await fetch(req)') < head.indexOf('caches.match(req)'),
    'the asset arm tries the network BEFORE the cache');
  // W327: the shell is still cache-first for SUB-RESOURCES -- they are a handful of small files
  // that only change with the build id -- but the NAVIGATION is network-first now. Cache-first on
  // the document meant a deployed build was not picked up until the old worker had been replaced
  // and its cache deleted, which is how the owner got a stale page on one device and ERR_FAILED on
  // another. The guard is the `if (!isNav)` around the first lookup.
  const shellArm = SW.slice(SW.indexOf('// THE SHELL.'));
  assert.match(shellArm, /const isNav = req\.mode === 'navigate'/);
  assert.match(shellArm, /if \(!isNav\) \{\s*\n\s*const hit = await caches\.match\(/,
    'the cache-first lookup is SKIPPED for navigations');
  const subOnly = shellArm.slice(shellArm.indexOf('if (!isNav)'));
  assert.ok(subOnly.indexOf('caches.match(req') < subOnly.indexOf('await fetch(req)'),
    'and a sub-resource still tries the cache first');
});

test('W327 the shell handler NEVER throws, because a throw is ERR_FAILED', () => {
  // THE RELEASE BUG THIS TEST EXISTS FOR. `e.respondWith()` with a rejected promise makes the
  // browser report the page as UNREACHABLE -- the owner saw "Die Website ist nicht erreichbar ...
  // ERR_FAILED" while the origin was serving 200, and Ctrl+Shift+R cleared it. The old handler
  // ended its offline path in `throw new Error('offline')`. One transient fetch failure was enough.
  // Comment lines are stripped first: the block above the handler QUOTES the old
  // `throw new Error('offline')` while explaining why it was wrong, and a check that matched its
  // own documentation would be a test of the prose rather than of the code.
  const shellArm = SW.slice(SW.indexOf('// THE SHELL.'))
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/throw new Error/.test(shellArm),
    'the shell arm must resolve to a Response on every path, never reject');
  // And the offline navigation answers with a page that says so, rather than nothing.
  assert.match(shellArm, /status: 503, statusText: 'Offline'/);
});

test('W327 every cache lookup names ITS OWN cache, not every cache on the origin', () => {
  // `caches.match(req)` with no `cacheName` searches EVERY cache in the origin. `activate` deletes
  // the previous `ddpdoj-*` caches, but until it has, a cache-first shell lookup can be answered
  // out of the PREVIOUS build. Both shell lookups are pinned to SHELL_CACHE.
  const shellArm = SW.slice(SW.indexOf('// THE SHELL.'));
  const lookups = shellArm.match(/caches\.match\([^)]*\)/g) ?? [];
  assert.ok(lookups.length >= 3, `expected the shell arm to look up at least 3 times, saw ${lookups.length}`);
  for (const l of lookups) {
    assert.match(l, /cacheName: SHELL_CACHE/, `unscoped cache lookup: ${l}`);
  }
});

test('W280 a never-cached asset offline 504s rather than returning an empty 200', () => {
  // `src/web/assets.js` is explicit that a missing .bin yields an EMPTY buffer and
  // renders "a perfectly plausible empty tile sheet". A synthesised 200 here would
  // therefore produce a silently wrong picture, which is the one outcome this
  // project refuses -- so the worker must fail loudly instead.
  assert.match(SW, /status: 504/);
  assert.ok(!/new Response\(new (ArrayBuffer|Uint8Array)/.test(SW),
    'it never fabricates a body');
});

test('W280 the worker skips what a Cache cannot hold', () => {
  // A 206 from a range request cannot be served from a Cache entry, and caching one
  // produces a response the browser refuses. Non-GET and cross-origin likewise.
  assert.match(SW, /req\.method !== 'GET'/);
  assert.match(SW, /url\.origin !== self\.location\.origin/);
  assert.match(SW, /req\.headers\.has\('range'\)/);
});

test('W280 activate deletes only OUR old caches', () => {
  // Another page on this origin may have its own, and `caches.keys()` is per-origin.
  assert.match(SW, /k\.startsWith\('ddpdoj-'\) && !keep\.has\(k\)/);
});

// ================================================ 3. THE BUILD MUST SHIP IT

test('W280 build-dist copies the PWA files, which nothing else covers', () => {
  // INCLUDE takes `.html` only for PAGES, and `src`/`assets` are the wrong place
  // for both the worker and the manifest.
  assert.match(BUILDER, /'manifest\.webmanifest', 'sw\.js'/);
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    assert.ok(BUILDER.includes(`'${f}'`), `INCLUDE names ${f}`);
  }
});

test('W280 build-dist STAMPS the build id into the worker, and throws if it cannot',
  () => {
    // The cache name IS the version. A worker published with 'dev' would serve the
    // first build it ever saw, for ever, to everyone who had visited once -- so a
    // silent no-op replace is worse than a failed build.
    assert.match(BUILDER, /const BUILD = 'dev';\$\/m, `const BUILD = '\$\{buildId\}';`/);
    assert.match(BUILDER, /has no \\`const BUILD = 'dev';\\` line to/,
      'and it throws when the anchor is gone');
    // The source tree keeps 'dev' so a dev tree has a stable cache name.
    assert.match(SW, /^const BUILD = 'dev';$/m);
  });

test('W280 the worker is registered LAST and never blocks the first frame', () => {
  // Nothing on this page depends on it: the port boots, runs and renders the same
  // with no worker at all.
  assert.match(MODULE, /addEventListener\('load', \(\) => \{\s*navigator\.serviceWorker\.register/);
  assert.match(MODULE, /window\.isSecureContext/,
    'gated on a secure context, which includes localhost');
  assert.ok(!/await navigator\.serviceWorker\.register/.test(MODULE),
    'and never awaited');
});
