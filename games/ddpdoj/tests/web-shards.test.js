// WAVE 14 -- THE SHARDED BG SHEET, and the three failures it has to tell apart.
//
// Stage 1's background is 2,026 tiles in eight shards, six of which arrive
// AFTER the first frame.  Everything here runs on SYNTHETIC manifests, synthetic
// shard bodies and the repo's own SOURCE TEXT -- no cartridge, no
// `games/ddpdoj/assets/`, no network -- for the same reason tests/render.test.js
// and tests/web-page.test.js state for themselves: the suite has to pass on a
// tree where nobody has extracted a ROM.
//
// WHAT IS *NOT* TESTED HERE, so nobody mistakes a green run for more than it is:
// that the tiles are the right pixels.  That is `tools/bgstrip.py --check`
// (bundle vs cartridge, 0 differing pixels) and `tools/bundlegate.mjs`
// (15955968/15955968 px), and both need the cartridge.  What IS tested is the
// distinction between three failures, which is the only thing this wave added
// that can go wrong SILENTLY:
//
//   a shard that FAILED   -> throw, naming the file
//   a shard that is LATE  -> do NOT throw, draw the transparent pen, and SAY SO
//   a tile in NO shard    -> neither of those; that is an EXPORT gap
//
// The middle one is the dangerous one.  "Draw nothing and carry on" is exactly
// what the black screen this wave came out of did.  The ONLY thing that makes
// it not a repeat is that the shard's name reaches the status line, so that is
// asserted as a value and not as a comment.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BgShards, AssetError } from '../src/web/assets.js';
import { streamColumnOf } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

// ---------------------------------------------------------------- fixtures

/** A manifest with one shard per entry of `runs`, slot runs contiguous. */
function fakeManifest(runs, boot = [0]) {
  let at = 0;
  const shards = runs.map((tiles, i) => {
    const m = {
      i, kind: 'scroll', cols: [i * 32, i * 32 + 31], firstSlot: at, tiles,
    };
    at += tiles;
    return m;
  });
  return { encoding: 'gzip', gfx: { bg: { tiles: at, tileBytes: 4, shards, boot } } };
}

/**
 * A `bin` reader over that manifest.  Tile numbers are 100, 101, 102, ... in
 * slot order unless `nos` says otherwise; a shard body is `tiles * 4` bytes of
 * `i + 1`, so which shard's pixels landed where is readable from the buffer.
 */
function fakeBin(manifest, opts = {}) {
  const n = manifest.gfx.bg.tiles;
  const nos = opts.nos ?? Array.from({ length: n }, (_, i) => 100 + i);
  return async (name) => {
    if (name === 'gfx/bg.tileno.u16.gz') {
      return new Uint8Array(Uint16Array.from(nos).buffer);
    }
    const m = /^gfx\/bg\.shard(\d+)\.tiles\.u8\.gz$/.exec(name);
    if (m) {
      const i = +m[1];
      if (opts.fail?.includes(i)) throw new AssetError(`assets/${name}: HTTP 404.`);
      if (opts.hang?.includes(i)) return new Promise(() => {});   // never settles
      const s = manifest.gfx.bg.shards[i];
      return new Uint8Array(s.tiles * manifest.gfx.bg.tileBytes).fill(i + 1);
    }
    throw new AssetError(`assets/${name}: HTTP 404.`);
  };
}

// ============================================ 1. THE SLOT SPACE MUST TILE

test('loadIndex REJECTS shard runs that do not tile the slot space', async () => {
  // The honest case first, or the rejections below prove nothing.
  const good = fakeManifest([4, 4, 4]);
  const bg = new BgShards(good, fakeBin(good));
  await bg.loadIndex();
  assert.equal(bg.shardOfTile[100], 0);
  assert.equal(bg.shardOfTile[104], 1);
  assert.equal(bg.shardOfTile[108], 2);
  assert.equal(bg.shardOfTile[99], -1, 'a tile in NO shard must stay -1');

  // A GAP: shard 2 claims to start one slot late. Without this check the gap is
  // a run of slots no shard ever installs -- tiles that are silently
  // transparent forever, with nothing in `waiting` and nothing `failed`. That
  // is the black screen again, wearing a green tick.
  const gap = fakeManifest([4, 4, 4]);
  gap.gfx.bg.shards[2].firstSlot = 9;
  await assert.rejects(() => new BgShards(gap, fakeBin(gap)).loadIndex(),
    (e) => e instanceof AssetError
      && /tile the slot space exactly/.test(e.message)
      && /shard 2/.test(e.message));

  // An OVERLAP, the other way a run can fail to tile: shard 2 starts early and
  // its pixels would land on top of shard 1's.
  const over = fakeManifest([4, 4, 4]);
  over.gfx.bg.shards[2].firstSlot = 7;
  await assert.rejects(() => new BgShards(over, fakeBin(over)).loadIndex(),
    (e) => e instanceof AssetError && /tile the slot space exactly/.test(e.message));

  // The runs summing to less than the manifest's own tile count.
  const short = fakeManifest([4, 4, 4]);
  short.gfx.bg.tiles = 13;
  await assert.rejects(() => new BgShards(short, fakeBin(short)).loadIndex(),
    (e) => e instanceof AssetError && /cover 12 slots/.test(e.message));

  // And `bg.tileno.u16` being the wrong length for the manifest -- a bundle
  // half-regenerated, which is the realistic way this happens.
  const man = fakeManifest([4, 4, 4]);
  const shortNos = async (name) => (name === 'gfx/bg.tileno.u16.gz'
    ? new Uint8Array(Uint16Array.from([100, 101, 102]).buffer)
    : fakeBin(man)(name));
  await assert.rejects(() => new BgShards(man, shortNos).loadIndex(),
    (e) => e instanceof AssetError && /3 entries for 12 slots/.test(e.message));
});

test('loadIndex REJECTS a tile that appears in TWO shards', async () => {
  // The exporter asserts disjointness at export time; this is the re-check at
  // load. It matters because `shardOfTile` is SINGLE-VALUED: if tile T were in
  // shards 0 and 2, `demand()` would name one of them, promoting it would not
  // bring the tile, and the page would report a late fetch that never lands and
  // blame the wrong file.
  const man = fakeManifest([4, 4, 4]);
  const dup = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 102];
  await assert.rejects(() => new BgShards(man, fakeBin(man, { nos: dup })).loadIndex(),
    (e) => e instanceof AssetError
      && /tile 102 \(\$66\) is in shard 0 AND shard 2/.test(e.message)
      && /disjoint/.test(e.message));

  // A duplicate WITHIN one shard is the same bug and must also be caught.
  const dup2 = [100, 101, 101, 103, 104, 105, 106, 107, 108, 109, 110, 111];
  await assert.rejects(() => new BgShards(man, fakeBin(man, { nos: dup2 })).loadIndex(),
    (e) => e instanceof AssetError && /shard 0 AND shard 0/.test(e.message));
});

// ================================================ 2. FAILED vs LATE vs GAP

test('demand() on a FAILED shard throws an AssetError NAMING THE FILE', async () => {
  const man = fakeManifest([4, 4, 4]);
  const bg = new BgShards(man, fakeBin(man, { fail: [2] }));
  await bg.loadIndex();

  // The fetch RESOLVES even though it failed -- a shard nobody has scrolled
  // into must not kill a running page from a background fetch. The throw
  // belongs to the draw that needs it, and nowhere else.
  await assert.doesNotReject(() => bg.fetch(2));
  assert.equal(bg.state[2], 'failed');
  assert.deepEqual(bg.status().failed, [2]);
  assert.deepEqual(bg.status().waiting, [], 'a failure is not a wait');

  let threw = null;
  try { bg.demand(2); } catch (e) { threw = e; }
  assert.ok(threw instanceof AssetError, 'demand() on a failed shard MUST throw');
  // Naming the FILE is the requirement, not merely throwing: the page's entire
  // recovery story is "regenerate this one file", and a message that says only
  // "shard 2" leaves the reader to work out which path that is.
  assert.match(threw.message, /assets\/gfx\/bg\.shard2\.tiles\.u8\.gz/);
  assert.match(threw.message, /map columns 64\.\.95/, 'it must name the COLUMNS');
  assert.match(threw.message, /node games\/ddpdoj\/tools\/export-web\.mjs/);
  assert.match(threw.message, /HTTP 404/, 'it must carry the ORIGINAL cause');

  // It must keep throwing. A one-shot error is a black screen from the second
  // frame on.
  assert.throws(() => bg.demand(2), AssetError);

  // A failed shard must never be FETCHED AGAIN, or the page spins on a 404 for
  // as long as it runs.
  //
  // NOTE FOR THE NEXT READER, because it cost two mutation runs to find out.
  // The no-retry property is held by a REDUNDANT PAIR of guards --
  // `promote()`'s `state === 'failed'` early return and `pump()`'s
  // `state[next] !== 'idle'` -- and EITHER ONE ALONE IS SUFFICIENT. So no
  // single-line mutation of the loader can make this assertion fail; only
  // removing both does (verified: both-removed -> RED, either-alone -> green).
  // Do not read a green run here as "each of those two lines is tested".
  //
  // It counts FETCHES rather than inspecting `queue` for a related reason: the
  // obvious `assert(!queue.includes(2))` cannot fail at all, because pump()
  // drains the queue on the same tick whatever promote() put in it. That
  // assertion was written, measured, and deleted.
  let fetches = 0;
  const counting = new BgShards(man, async (name) => {
    if (name !== 'gfx/bg.tileno.u16.gz') fetches++;
    return fakeBin(man, { fail: [2] })(name);
  });
  await counting.loadIndex();
  await counting.fetch(2);
  assert.equal(fetches, 1);
  counting.promote(2);
  counting.prefetchAll();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(counting.state[2], 'failed');
  assert.equal(fetches, 1 + 2,
    'shards 0 and 1 were fetched; shard 2 must NOT have been retried');

  // The SECOND-MAP shard has no columns and must still produce a sentence.
  const sm = fakeManifest([4, 4]);
  sm.gfx.bg.shards[1].cols = null;
  sm.gfx.bg.shards[1].kind = 'secondmap';
  const bg2 = new BgShards(sm, fakeBin(sm, { fail: [1] }));
  await bg2.loadIndex();
  await bg2.fetch(1);
  assert.throws(() => bg2.demand(1),
    (e) => /the second map/.test(e.message)
      && /assets\/gfx\/bg\.shard1\.tiles\.u8\.gz/.test(e.message));
});

test('demand() on a LOADING shard does NOT throw and puts it in status().waiting',
  async () => {
    const man = fakeManifest([4, 4, 4]);
    const bg = new BgShards(man, fakeBin(man, { hang: [1] }));
    await bg.loadIndex();
    assert.deepEqual(bg.status().waiting, [], 'nothing waits before a draw asks');

    // A draw needs shard 1 and does not have it. This must be SURVIVABLE --
    // the frame draws the transparent pen and the page keeps running.
    assert.doesNotThrow(() => bg.demand(1));
    const st = bg.status();
    assert.deepEqual(st.waiting, [1],
      'a shard a DRAW asked for and did not have MUST reach the status line; '
      + 'without that this is indistinguishable from the silent black screen '
      + 'the wave came out of');
    assert.equal(st.ready, 0);
    assert.deepEqual(st.failed, []);
    assert.equal(st.total, 3);
    // Demanding it PROMOTES it. The demand is the schedule's real signal --
    // followColumn's lookahead is a guess, a draw asking is a fact.
    assert.ok(bg.queue.includes(1) || bg.state[1] === 'loading');

    // Once it lands it must LEAVE `waiting`. A status line that never clears is
    // as useless as one that never fills.
    const ok = new BgShards(man, fakeBin(man));
    await ok.loadIndex();
    ok.demand(1);
    assert.deepEqual(ok.status().waiting, [1]);
    await ok.fetch(1);
    assert.deepEqual(ok.status().waiting, [], 'install() must clear `waiting`');
    assert.equal(ok.status().ready, 1);
    assert.equal(ok.slot[104], 4, 'shard 1 owns slots 4..7, tiles 104..107');
    assert.equal(ok.slot[100], -1, 'and shard 0 has NOT been installed');
    assert.equal(ok.pixels[4 * 4], 2, "shard 1's body landed at firstSlot*4");
    assert.equal(ok.pixels[0], 0, 'and shard 0s slots are still untouched');

    // A SHORT body is a failure, not a partial install -- half a sheet renders
    // a plausible picture with the wrong tiles in it.
    const shorty = new BgShards(man, async (name) => (
      name === 'gfx/bg.tileno.u16.gz'
        ? fakeBin(man)(name)
        : new Uint8Array(3)));
    await shorty.loadIndex();
    await shorty.fetch(0);
    assert.equal(shorty.state[0], 'failed');
    assert.throws(() => shorty.demand(0),
      (e) => /is 3 B; the manifest says 4 tiles x 4 = 16/.test(e.message));
  });

// ================================================== 3. THE QUEUE IS A QUEUE

test('promote() moves a QUEUED shard to the head, and pump() is SERIAL',
  async () => {
    const man = fakeManifest([4, 4, 4, 4, 4, 4]);
    const order = [];
    let live = 0, maxLive = 0;
    const settle = [];
    const bin = async (name) => {
      if (name === 'gfx/bg.tileno.u16.gz') {
        return new Uint8Array(Uint16Array.from(
          Array.from({ length: 24 }, (_, i) => 100 + i)).buffer);
      }
      const i = +/shard(\d+)/.exec(name)[1];
      order.push(i);
      live++;
      maxLive = Math.max(maxLive, live);
      // A promise THIS TEST decides when to settle, so the queue can be
      // reordered while a fetch is in flight -- which is the real case:
      // followColumn() runs every frame, mid-download.
      return new Promise((res) => {
        settle.push(() => { live--; res(new Uint8Array(16).fill(i + 1)); });
      });
    };
    const bg = new BgShards(man, bin);
    await bg.loadIndex();

    bg.prefetchAll();
    assert.deepEqual(order, [0], 'prefetchAll starts exactly ONE fetch');
    assert.deepEqual(bg.queue, [1, 2, 3, 4, 5], 'the rest QUEUE, in need order');

    // Mid-flight the scroll reaches shard 4. It must jump the whole queue.
    bg.promote(4);
    assert.equal(bg.queue[0], 4, 'promote() must put it at the HEAD');
    assert.deepEqual(bg.queue, [4, 1, 2, 3, 5], 'and must not duplicate it');
    assert.deepEqual(order, [0], 'promote() must not start a SECOND fetch');
    bg.promote(4);
    assert.deepEqual(bg.queue, [4, 1, 2, 3, 5], 'promoting twice is idempotent');

    settle.shift()();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(order, [0, 4],
      'the promoted shard must be the NEXT one fetched, not the next in index '
      + 'order -- a queue that does not reorder is not a queue');
    assert.equal(maxLive, 1,
      'pump() must be SERIAL. Eight parallel fetches over one connection make '
      + 'promotion meaningless, and promotion is the entire point of the queue');

    settle.shift()();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(order, [0, 4, 1], 'then the queue resumes in order');
    assert.equal(maxLive, 1);

    // A shard already READY is never re-fetched.
    bg.promote(4);
    assert.equal(bg.queue.includes(4), false);
  });

test('followColumn() promotes the shard under the cursor and the one ahead',
  async () => {
    const man = fakeManifest([4, 4, 4, 4, 4, 4]);   // cols 0..31, 32..63, ...
    const bg = new BgShards(man, fakeBin(man, { hang: [0, 1, 2, 3, 4, 5] }));
    await bg.loadIndex();

    bg.followColumn(64);                 // shard 2 covers columns 64..95
    const touched = (b) => b.meta.map((m) => m.i)
      .filter((i) => b.queue.includes(i) || b.state[i] !== 'idle');
    assert.deepEqual(touched(bg), [2, 3],
      'the shard under the cursor AND the one 32 columns ahead -- one shard of '
      + 'lookahead, cut against a measured 4.3 s tightest gap');

    // A column it cannot place must promote NOTHING. `streamColumn()` returns
    // -1 for the boss lock's rewind and for stages 2..5, and a -1 that got
    // treated as a column would promote shard 0 forever.
    const idle = new BgShards(man, fakeBin(man, { hang: [0, 1, 2, 3, 4, 5] }));
    await idle.loadIndex();
    idle.followColumn(-1);
    assert.deepEqual(idle.queue, [], 'followColumn(-1) must be a NO-OP');
    assert.deepEqual(idle.state, man.gfx.bg.shards.map(() => 'idle'));

    // A second-map shard has no `cols` and must never be promoted by scrolling.
    const sm = fakeManifest([4, 4]);
    sm.gfx.bg.shards[1].cols = null;
    const b2 = new BgShards(sm, fakeBin(sm, { hang: [0, 1] }));
    await b2.loadIndex();
    b2.followColumn(0);
    assert.equal(b2.queue.includes(1), false);
    assert.equal(b2.state[1], 'idle');
  });

// ======================================== 4. THE STREAM POINTER ARITHMETIC

test('streamColumnOf() places $225B78 + 36*c and REFUSES everything else', () => {
  // These are the exporter's own constants, read out of its SOURCE so this test
  // needs no bundle and so it fails loudly if the export ever moves.
  const src = read('tools/export-web.mjs');
  assert.match(src, /cols:\s*0x225b78/, "the exporter's stage-1 column stream");
  assert.match(src, /ncols:\s*224/);
  assert.match(src, /const COL_BYTES = 36/);
  const map = { cols: '$225B78', colBytes: 36, ncols: 224 };
  const base = 0x225b78;

  for (const c of [0, 1, 31, 32, 63, 96, 127, 223]) {
    assert.equal(streamColumnOf(map, base + 36 * c), c,
      `$${(base + 36 * c).toString(16)} is column ${c}`);
  }

  // OFF THE END. Column 224 is inside the 248-column stream but past the 224
  // the scroll VM was measured to reach and past everything exported, so it
  // must be -1 and not 224 -- `followColumn(224)` would promote a shard that
  // does not exist.
  assert.equal(streamColumnOf(map, base + 36 * 224), -1);
  assert.equal(streamColumnOf(map, base + 36 * 247), -1,
    'the SECOND MAP at $227AF8 sits inside the 248-column stream and is NOT a '
    + 'scrolling column');

  // BEFORE the base: the boss lock rewinds the pointer, and stages 2..5 live in
  // the same address space and are not exported at all.
  assert.equal(streamColumnOf(map, base - 36), -1);
  assert.equal(streamColumnOf(map, 0x140000), -1, 'a build-A address');
  assert.equal(streamColumnOf(map, 0x2611d6), -1);

  // NOT A MULTIPLE OF 36 -- the one that would produce a PLAUSIBLE answer. A
  // pointer read mid-column, divided by 36, lands within a column of the truth
  // and promotes a shard that is very nearly right, which is the hardest kind
  // of wrong to notice.
  for (const d of [1, 2, 17, 35]) {
    assert.equal(streamColumnOf(map, base + 36 * 40 + d), -1,
      `$${(base + 36 * 40 + d).toString(16)} is mid-column and must be -1`);
  }

  // Zero is "no column written yet", not column 0. TRUE, and asserted, but be
  // aware of WHY it is true: `off = 0 - $225B78` is negative and the `off < 0`
  // arm catches it. The explicit `if (!ptr)` in `streamColumnOf` is belt and
  // braces and deleting it changes no answer -- measured by mutation. This
  // line pins the BEHAVIOUR, not that guard.
  assert.equal(streamColumnOf(map, 0), -1);
  assert.equal(streamColumnOf(map, NaN), -1);
  assert.equal(streamColumnOf(null, base), -1, 'a pre-wave-14 bundle has no map');
  assert.equal(streamColumnOf(undefined, base), -1);

  // And the shard cut agrees with this arithmetic: 32 columns each, seven
  // scroll shards, every one of the 224 columns in exactly one of them.
  assert.match(src, /const SHARD_COLS = 32/);
  const SH = 32, n = Math.ceil(224 / SH);
  assert.equal(n, 7);
  for (let c = 0; c < 224; c++) {
    const hit = [];
    for (let s = 0; s < n; s++) {
      if (c >= s * SH && c <= Math.min((s + 1) * SH, 224) - 1) hit.push(s);
    }
    assert.equal(hit.length, 1, `column ${c} lands in ${hit.length} shards`);
  }
});
