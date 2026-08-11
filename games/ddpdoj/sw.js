// THE SERVICE WORKER -- DOCKET D14, "we should turn the whole thing into a PWA".
//
// **THIS FILE MUST LIVE AT `games/ddpdoj/sw.js` AND NOWHERE ELSE.** A worker's
// default scope is its own directory, so one at `games/ddpdoj/src/sw.js` would
// control `/games/ddpdoj/src/` and NOT `/games/ddpdoj/index.html` -- it would
// register, report success, and control nothing. Widening scope needs a
// `Service-Worker-Allowed` response header, which this deploy does not set.
//
// ===========================================================================
// THE ONE THING THIS HAD TO GET RIGHT: **DO NOT PRECACHE THE SPRITE SHEET.**
// ===========================================================================
// `assets/spr/` is SHARDED AND DEFERRED on purpose. `src/web/assets.js` fetches
// one shard at a time, promotes the shard the stage is about to need, and draws a
// transparent pen for tiles whose shard has not arrived. The whole point is that
// the page is playable long before the art is complete.
//
// A `cache.addAll()` over the manifest would undo all of that: it would pull every
// shard on FIRST LOAD, on whatever connection the player is on, before the game
// starts. So the routing is split by WHAT a request is, not by where it is:
//
//   the SHELL      cache-first, then network      the page, its modules, the
//                                                manifest, the icons
//   the ASSETS     network-first, cache on 200    every .gz shard and .json
//                  (stale-while-revalidate for    under assets/
//                   the offline case)
//
// So an online player always gets fresh art and pays the shard cost exactly when
// `assets.js` decided to pay it; an offline player gets whatever shards they have
// already seen, and the port's own AssetError names any shard they have not.
//
// ===========================================================================
// THE VERSION IS THE CACHE NAME
// ===========================================================================
// `BUILD` is rewritten by `tools/build-dist.mjs` to the same 14-digit build id it
// stamps into `src/buildid.js`. Changing the name is what evicts the old cache --
// there is no revalidation heuristic here and there should not be one, because the
// shell is a single HTML file with an inline module and a stale copy of it against
// fresh assets is exactly the failure this avoids.
const BUILD = 'dev';
const SHELL_CACHE = `ddpdoj-shell-${BUILD}`;
const ASSET_CACHE = `ddpdoj-assets-${BUILD}`;

// Everything needed to BOOT and reach a first picture, and nothing more. Listed
// rather than globbed: a glob would silently start precaching the shards the day
// somebody moves a file.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // `reload` so an install never re-uses an HTTP cache entry for the shell --
    // that is how a "new" worker ends up serving the old page.
    await Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    // Take over as soon as the install finishes rather than waiting for every tab
    // to close. Safe here because the cache name carries the build id, so an old
    // tab cannot be handed a mixture.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
    for (const k of await caches.keys()) {
      // Only ever delete OUR caches. Another page on this origin may have its own.
      if (k.startsWith('ddpdoj-') && !keep.has(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

/** Is this one of the sharded, deferred asset files? */
const isAsset = (url) => url.pathname.includes('/games/ddpdoj/assets/');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only GET, and only our own origin. A range request (audio seeking) must go
  // straight to the network: a 206 cannot be served from a Cache entry and
  // caching one produces a response the browser refuses.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) return;

  if (isAsset(url)) {
    // NETWORK-FIRST. The player is online in the normal case and the art should be
    // whatever the current build says it is; the cache is the offline fallback.
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) {
          const c = await caches.open(ASSET_CACHE);
          c.put(req, r.clone());
        }
        return r;
      } catch {
        const hit = await caches.match(req);
        if (hit) return hit;
        // No network and never seen: let it 504 rather than inventing an empty
        // body. `src/web/assets.js` is explicit that a missing .bin yields an
        // EMPTY buffer and renders "a perfectly plausible empty tile sheet" --
        // so a synthesised 200 here would produce a silently wrong picture,
        // which is the one outcome this project refuses.
        return new Response('offline and this asset was never cached', {
          status: 504, statusText: 'Gateway Timeout',
        });
      }
    })());
    return;
  }

  // THE SHELL: cache-first. It is a handful of small files and they only change
  // when the build id does.
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && r.type === 'basic') {
        const c = await caches.open(SHELL_CACHE);
        c.put(req, r.clone());
      }
      return r;
    } catch {
      // A navigation with nothing cached is the only case worth a special answer:
      // hand back the page itself if we have it, so a deep link still boots.
      if (req.mode === 'navigate') {
        const page = await caches.match('./index.html', { ignoreSearch: true });
        if (page) return page;
      }
      throw new Error('offline');
    }
  })());
});
