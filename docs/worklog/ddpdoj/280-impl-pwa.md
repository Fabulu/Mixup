# W280: DOCKET D14 -- the page is an installable PWA

Status: DONE. Suite 1955/1955 (1942 + 13), sweep 0 missing on both, `node
tools/build-dist.mjs` clean with the ROM-leak guard passing, all run before the commit.

## Starting state

W279 committed at `3f50019`, D18 recorded at `3266fe1`, and **the session's 74 commits
pushed** -- the first push of the session, per D18.

## THE ONE THING THAT DECIDED THE DESIGN: DO NOT PRECACHE THE SPRITE SHEET

`assets/spr/` is sharded and deferred on purpose. `src/web/assets.js` fetches ONE shard at a
time, promotes the shard the stage is about to need, and draws a transparent pen for tiles
whose shard has not arrived -- the whole point is that the game is playable long before the
art is complete. Shard 9 alone is 218 KiB and shard 5 is 119 KiB, and the port first asks for
shard 5 **103 seconds into stage 1**.

A `cache.addAll()` over the manifest -- which is what a generated worker does -- would undo
all of it: every shard pulled on first load, on whatever connection the player is on, before
the game starts. So the routing splits by WHAT a request is:

    the SHELL    cache-first   the page, the manifest, the three icons
    assets/      NETWORK-first, cached on 200, cache as the OFFLINE fallback

Online, the player always gets art matching the current build and pays the shard cost exactly
when `assets.js` decided to pay it. Offline, they get the shards they have already seen.

**And a never-seen asset offline returns 504, never a synthesised 200.** `assets.js` says in
its own words that a missing `.bin` "does not throw on its own -- it yields an EMPTY buffer"
and renders "a perfectly plausible empty tile sheet". A fabricated empty body here would
therefore produce a silently wrong picture, which is the one outcome this project refuses.
Asserted, along with the absence of any `new Response(new Uint8Array(...))`.

## THE WORKER'S LOCATION IS LOAD-BEARING

**`sw.js` MUST sit at `games/ddpdoj/`, beside `index.html`.** A worker's default scope is its
own directory, so one at `games/ddpdoj/src/sw.js` would control `/games/ddpdoj/src/` and NOT
`/games/ddpdoj/index.html` -- it would register, resolve successfully, and control nothing.
Widening scope needs a `Service-Worker-Allowed` response header this deploy does not set.

That failure is completely silent, so three things guard it: the file's own header says it,
the page compares `location.pathname` against the scope it actually got and warns, and the
test asserts `src/sw.js` does not exist.

## THE CACHE NAME IS THE VERSION

`sw.js` ships `const BUILD = 'dev'` so a dev tree has a stable name, and
`tools/build-dist.mjs` rewrites it to the same 14-digit build id it stamps into
`src/buildid.js`. Changing the name is the entire eviction mechanism -- there is no
revalidation heuristic and there should not be one, because the shell is a single HTML file
with an inline module and a stale copy of it against fresh assets is exactly what this
avoids.

**A worker published with `'dev'` would serve the first build it ever saw, for ever, to
everyone who had visited once.** So the stamp THROWS if its anchor line is gone rather than
silently doing nothing, and the test asserts both the replace and the throw.

## `INCLUDE` DID NOT COVER ANY OF IT

`build-dist.mjs`'s `INCLUDE` takes `index.html`, `games/index.json`, `shared`, and per game
`game.json`, `src` and `assets`, plus `*.html` for the two PAGES. A `manifest.webmanifest`,
`sw.js` or `.png` at a game's root reached `dist/` through none of those. Five entries added,
each `existsSync`-filtered so `gradius` -- the other PAGES entry, which has no PWA files --
is unaffected.

Verified by running the build: all five land in `dist/games/ddpdoj/`, `sw.js` there carries
the stamped id while the source tree keeps `'dev'`, and the ROM-leak guard passes at 311
files with its six existing deliberate exceptions.

## THE ICONS ARE GENERATED, AND THAT IS THE POINT

`tools/make-pwa-icons.mjs` draws three PNGs from constants in the file. Two reasons, and the
second matters more:

1. a binary blob in the tree has no provenance -- six months on nobody can tell whether a
   512x512 PNG was drawn, downloaded, or cut out of a screenshot. The generator IS the
   provenance.
2. `build-dist.mjs` refuses to publish any file appearing verbatim inside a ROM, and
   `tools/make-placeholder-tiles.mjs` exists because the player's tile pool used to be lifted
   from bank 2 of the cartridge. **An icon cut from the running game would be cartridge
   graphics with extra steps.** This generator never opens a ROM, never opens `assets/`, and
   never reads a frame.

The PNG encoder is sixty lines in that file -- signature, IHDR, one deflated IDAT of filter-0
rows, IEND, CRC32 -- which is cheaper and far more auditable than a dependency. Node's `zlib`
does the compression; only the chunk framing is hand-rolled.

Three files: `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` drawn at a 10% bleed
so the art stays inside the spec's middle-80% safe zone. **A maskable icon must be opaque
everywhere** or the platform's circular crop shows the launcher through the corners -- the
test decodes the IDAT and checks alpha at all four corners and the centre, because that is
exactly the kind of thing a generator gets wrong silently.

## The manifest

`scope` is `/games/ddpdoj/` and not the origin, because the origin hosts three games.
`orientation` is **portrait**, because the game is a TATE shooter (D13) and the installed app
should launch that way rather than in whatever the device happened to be holding.
`theme_color` and `background_color` match the page's own `#0b0f14` and the `theme-color`
meta, so the system chrome does not flash a different colour on launch. `apple-touch-icon` is
declared separately because iOS installs from it and ignores `icons`.

## Registration

Last, on `load`, never awaited, gated on `isSecureContext` -- which is true for localhost as
well as https, so local development exercises it. **Nothing on the page depends on it**: the
port boots, runs and renders identically with no worker at all, and a registration that
blocked the first frame would trade the thing that works for a nicety.

## Docket status

    D13 W279   D14 FIXED (W280)   D15 W279
    D16 open -- the hyper bar outside hyper
    D17 open -- the in-stage medals
    D18 standing rule -- commit AND push every wave

## Order for the next wave

1. **D16, the hyper bar outside hyper.** SETTLE WHAT `$81B63E` MEANS FIRST -- `hud.js` calls
   it `hyperActiveP1` and it has 92 references in build B, so the name may be wrong and the
   word may mean "the gauge is armed". W279 measured that the bar IS ported and its tile
   tracks the gauge, but only on the hyper arm, and the port is faithful there. Do not assume
   a missing draw: D7 and D8 both looked like one and were not.
2. **D17, the in-stage medals** -- the tally is reachable, so the gap is upstream.
3. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`, whose table is already
   windowed.
