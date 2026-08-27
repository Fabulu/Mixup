// THE PUBLISHED BUNDLE, loaded.  (wave 7)
//
// `games/ddpdoj/tools/export-web.mjs` writes `games/ddpdoj/assets/`; this reads
// it.  The two files are a pair and neither is meaningful alone, so the shapes
// they agree on -- slot order, the packed sprite address space, the gzip
// envelope -- are described once, in the exporter's header comment, and
// asserted here.
//
// WHY THIS IS NOT `render/regions.js`.  `regions.js` assembles the CARTRIDGE's
// three ROM regions: 58 MiB, addressed exactly as the IGS023 addresses them,
// which is what every gate in the project compares against MAME.  That stays.
// This module assembles the same three inputs from 363 KiB of exported data:
// the tiles DECODED into sheets, and the sprite streams RE-BASED into a compact
// address space with `capture.bin`'s own records rewritten to match.  The
// renderer is not modified for either -- `TileCache` already takes
// `bgTileFn`/`txTileFn`, and `SpriteDrawer` only ever sees two typed arrays.
//
// A 404 ON A .bin YIELDS AN EMPTY BUFFER.  Every fetch checks `r.ok`, every
// length is asserted against the manifest, and every tile number and sprite
// stream the capture can ask for is validated at boot -- because the failure
// this guards against is not an exception, it is a zero-filled tile sheet
// rendering a perfectly plausible empty starfield.  That is the same reason
// `games/gradius/src/assets.js` checks `r.ok`, and it is the same class of
// silent-wrong-picture the pixel gates exist to catch.

import { Capture } from '../render/capture.js';
import { parseSpriteList, BUFFER_STRIDE } from '../render/spritelist.js';
import { BG_W, BG_H, TX_W, TX_H } from '../render/tiles.js';
import { assertLittleEndianHost } from '../render/regions.js';

export const BG_TILE_BYTES = BG_W * BG_H;   // 1024, decoded
export const TX_TILE_BYTES = TX_W * TX_H;   // 64, decoded

export const EXPORT_CMD = 'node games/ddpdoj/tools/export-web.mjs';

export class AssetError extends Error {
  constructor(msg) {
    super(`${msg}\n\nRegenerate the bundle from your own cartridge:\n  `
      + `${EXPORT_CMD}`);
    this.name = 'AssetError';
  }
}

/**
 * WAVE 14 -- THE SHARDED BG SHEET.
 *
 * Stage 1's background is 1,820 tiles and 653 KiB gzipped.  The page cannot
 * wait for that, and it must not draw black while it waits either -- a silent
 * black screen is the report this wave came out of.  So the sheet arrives in
 * eight pieces and this class is the thing that knows, at every instant, which
 * of them are here, which are on the way and which FAILED.
 *
 * THE SLOT SPACE IS FIXED AT EXPORT TIME.  `gfx/bg.tileno.u16` lists every slot
 * of every shard, in shard order, and `manifest.gfx.bg.shards[s].firstSlot`
 * says where each shard's run begins.  That is why `shardOfTile` is complete at
 * boot while `slot` is not: the page always knows WHICH shard a tile is in,
 * even before that shard exists, which is the difference between "shard 4 has
 * not arrived" and "this tile was never exported".  Those are different bugs
 * and they get different messages.
 *
 * THREE STATES AND THREE MESSAGES:
 *   ready    the tile is drawn
 *   loading  the tile is drawn as the transparent pen AND the shard is named on
 *            the status line -- the picture is incomplete and says so
 *   failed   a 404, a short body, a bad gzip -> the next draw that needs that
 *            shard THROWS an AssetError naming the shard and the rebuild
 *            command.  It does NOT quietly keep drawing holes: a page that
 *            never recovers has to say why.
 */
/**
 * WAVE 47 -- THE QUEUE, LIFTED OUT OF `BgShards` SO THE SPRITE SHEET CAN HAVE
 * ONE TOO.
 *
 * Everything here is the machinery `BgShards` has had since W14 and which was
 * red-validated by `bundlegate --break shard-404`: three states, one fetch at a
 * time, a promoted shard jumps the queue, a FAILED shard throws from inside the
 * frame that needed it rather than at fetch time.  Nothing about it changed --
 * it moved.  Subclasses supply three things: what a shard's file(s) are, how to
 * install one, and how to describe it in the error message.
 */
export class ShardQueue {
  constructor(meta, boot, bin, what) {
    this.bin = bin;
    this.meta = meta;
    this.boot = boot;
    this.what = what;                      // 'BG' / 'SPRITE', for messages
    /** 'idle' | 'loading' | 'ready' | 'failed', per shard */
    this.state = this.meta.map(() => 'idle');
    this.error = this.meta.map(() => null);
    this.inflight = this.meta.map(() => null);
    /** shards a DRAW asked for and did not have */
    this.waiting = new Set();
    this.queue = [];
    this.pumping = false;
  }

  /** @abstract fetch and install shard `i`; rejects on any failure. */
  async load(i) { throw new Error(`${this.constructor.name} has no load()`); }

  /** @abstract one line naming what shard `i` holds and what file it is. */
  describe(i) { return `${this.what} shard ${i}`; }

  /**
   * Fetch shard `i` once.  Returns a promise that RESOLVES even on failure --
   * the failure is recorded in `state`/`error` and raised by `demand()` at the
   * moment a draw actually needs it, so a shard nobody has reached yet cannot
   * kill a running page from a background fetch.
   */
  fetch(i) {
    if (this.state[i] === 'ready') return Promise.resolve();
    if (this.inflight[i]) return this.inflight[i];
    this.state[i] = 'loading';
    const p = this.load(i)
      .then(() => { this.state[i] = 'ready'; this.waiting.delete(i); })
      .catch((e) => { this.state[i] = 'failed'; this.error[i] = e; })
      .finally(() => { this.inflight[i] = null; });
    this.inflight[i] = p;
    return p;
  }

  /**
   * A DRAW needs shard `i` and does not have it.
   *
   * A failed shard throws HERE, from inside the frame that needed it, because
   * that is the only place the page can honestly say "the picture you are
   * looking at is wrong and here is why".  A loading shard is recorded and the
   * caller draws nothing for it -- named, never black.
   */
  demand(i) {
    if (this.state[i] === 'failed') {
      const why = this.error[i]?.message?.split('\n')[0] ?? 'unknown';
      throw new AssetError(`${this.what} SHARD ${i} DID NOT LOAD (${why}).\n`
        + `${this.describe(i)}`);
    }
    this.waiting.add(i);
    if (this.state[i] === 'idle') this.promote(i);
  }

  /** Put shard `i` at the head of the prefetch queue and start pumping. */
  promote(i) {
    if (this.state[i] === 'ready' || this.state[i] === 'failed') return;
    const at = this.queue.indexOf(i);
    if (at >= 0) this.queue.splice(at, 1);
    this.queue.unshift(i);
    this.pump();
  }

  /**
   * Queue every shard that is not here yet, in FETCH ORDER.
   *
   * WAVE 52.  This used to walk ascending index and call that "need order",
   * which was true while the shards happened to be cut in deadline order and
   * stopped being true the moment two later shards had earlier deadlines: [M]
   * the enemy bullets want art at +0.7 s and the player's shots on the first
   * frame the button is held, against sprite shard 1's +7.7 s. So the exporter
   * PUBLISHES the order (`shards[i].order`) and this reads it. A meta entry
   * without one falls back to its index, which is what every background shard
   * still does.
   */
  prefetchAll() {
    const byNeed = this.meta.map((m, i) => i)
      .sort((a, b) => (this.meta[a].order ?? a) - (this.meta[b].order ?? b));
    for (const i of byNeed) {
      if (this.state[i] === 'idle' && !this.queue.includes(i)) this.queue.push(i);
    }
    this.pump();
  }

  /**
   * ONE fetch at a time.  Deliberately serial: the whole point of the queue is
   * that a promoted shard jumps ahead, and eight parallel fetches over one
   * connection would make the promotion meaningless.
   */
  pump() {
    if (this.pumping) return;
    const next = this.queue.shift();
    if (next === undefined) return;
    if (this.state[next] !== 'idle') { this.pump(); return; }
    this.pumping = true;
    this.fetch(next).finally(() => { this.pumping = false; this.pump(); });
  }

  /** Everything the page's status line needs, in one object. */
  status() {
    const ready = this.state.filter((s) => s === 'ready').length;
    return {
      ready,
      total: this.meta.length,
      loading: this.state.map((s, i) => (s === 'loading' ? i : -1)).filter((i) => i >= 0),
      failed: this.state.map((s, i) => (s === 'failed' ? i : -1)).filter((i) => i >= 0),
      waiting: [...this.waiting],
      orphans: this.orphans?.size ?? 0,
    };
  }
}

export class BgShards extends ShardQueue {
  /**
   * @param {object} manifest  the whole manifest (needs `gfx.bg`)
   * @param {(name:string)=>Promise<Uint8Array>} bin  gunzipping reader
   */
  constructor(manifest, bin) {
    const bg = manifest.gfx.bg;
    if (!Array.isArray(bg.shards) || !Array.isArray(bg.boot)) {
      throw new AssetError('assets/manifest.json has no gfx.bg.shards/boot. '
        + 'This loader is wave 14 or later and the bundle is older.');
    }
    super(bg.shards, bg.boot, bin, 'BG');
    this.tileBytes = bg.tileBytes;
    this.count = bg.tiles;
    this.pixels = new Uint8Array(bg.tiles * bg.tileBytes);
    this.nos = null;                       // filled by `loadIndex`
    this.slot = new Int32Array(0x10000).fill(-1);
    this.shardOfTile = new Int16Array(0x10000).fill(-1);
    /** tiles that are in NO shard -- an export gap, not a late fetch */
    this.orphans = new Set();
  }

  async load(i) {
    this.install(i, await this.bin(`gfx/bg.shard${i}.tiles.u8.gz`));
  }

  describe(i) {
    return `It holds ${this.meta[i].tiles} background tiles for `
      + (this.meta[i].cols
        ? `map columns ${this.meta[i].cols[0]}..${this.meta[i].cols[1]}`
        : 'the second map')
      + ', and the port has scrolled into them. The picture would be BLACK '
      + 'there, so this stops instead.\nMissing file: '
      + `assets/gfx/bg.shard${i}.tiles.u8.gz`;
  }

  /** The slot index, which every shard's tile numbers share.  Boot, once. */
  async loadIndex() {
    const nos = new Uint16Array((await this.bin('gfx/bg.tileno.u16.gz')).buffer);
    if (nos.length !== this.count) {
      throw new AssetError(`assets/gfx/bg.tileno.u16 has ${nos.length} entries `
        + `for ${this.count} slots in the manifest.`);
    }
    this.nos = nos;
    let at = 0;
    for (const m of this.meta) {
      if (m.firstSlot !== at) {
        throw new AssetError(`assets/manifest.json: BG shard ${m.i} says its `
          + `slots start at ${m.firstSlot}, but shards 0..${m.i - 1} end at `
          + `${at}. The shard runs must tile the slot space exactly.`);
      }
      for (let k = 0; k < m.tiles; k++) {
        const t = nos[at + k];
        if (this.shardOfTile[t] >= 0) {
          throw new AssetError(`BG tile ${t} ($${t.toString(16)}) is in shard `
            + `${this.shardOfTile[t]} AND shard ${m.i}. The shards must be `
            + 'disjoint; the exporter asserts it and this re-checks it.');
        }
        this.shardOfTile[t] = m.i;
      }
      at += m.tiles;
    }
    if (at !== this.count) {
      throw new AssetError(`the BG shards cover ${at} slots, the manifest says `
        + `${this.count}.`);
    }
  }

  /** Install one shard's decoded pixels into the slot space. */
  install(i, bytes) {
    const m = this.meta[i];
    const want = m.tiles * this.tileBytes;
    if (bytes.length !== want) {
      throw new AssetError(`assets/gfx/bg.shard${i}.tiles.u8 is ${bytes.length} `
        + `B; the manifest says ${m.tiles} tiles x ${this.tileBytes} = ${want}.`);
    }
    this.pixels.set(bytes, m.firstSlot * this.tileBytes);
    for (let k = 0; k < m.tiles; k++) this.slot[this.nos[m.firstSlot + k]] = m.firstSlot + k;
    this.state[i] = 'ready';
    this.waiting.delete(i);
  }

  /**
   * The SCROLL POSITION drives the schedule.  `col` is the stage-1 map column
   * the port's VM is painting right now ($26134E's cursor), which is the same
   * axis the shards are cut on -- so "which shard will I need next" is
   * arithmetic and not a guess.  One shard of lookahead: the recon measured the
   * tightest gap in the stage at 4.3 s and the loosest at 42 s.
   */
  followColumn(col) {
    if (!(col >= 0)) return;
    for (const m of this.meta) {
      if (!m.cols) continue;
      if (col >= m.cols[0] - 32 && col <= m.cols[1]) this.promote(m.i);
    }
  }
}

/**
 * WAVE 47 -- THE SPRITE SHEET, SHARDED.
 *
 * THE REPORT THIS CAME OUT OF: "lots of turrets running around targetting
 * you... without tank bodies".  Enemy type $11's HULL images were 2 of 64 in
 * the shipped sheet because the recording the sheet was harvested from only ever
 * drove those tanks on two of the 64 headings (`46-diag-orphan-turrets.md`).
 * The fix is 212 streams harvested from the cartridge BY ADDRESS, and it cannot
 * go in the boot payload because boot must not get slower (HANDOVER §8.8).
 *
 * SO IT WORKS EXACTLY LIKE `BgShards`, WITH ONE DIFFERENCE THAT MATTERS.  The BG
 * sheet is indexed by TILE NUMBER, so it needs a 64 Ki lookup to say which shard
 * a tile is in.  The sprite sheet is ONE PACKED ADDRESS SPACE and each shard
 * owns a CONTIGUOUS RANGE of it, so "which shard is this stream in" is a range
 * test on the packed base -- which is why `spr.streams` needed no fourth field
 * and why the page can name the shard for a stream whose shard has not landed.
 *
 * THE ARRAYS ARE ALLOCATED AT FULL SIZE AT BOOT and each shard's words are
 * dropped into place as it arrives.  A record pointing into a range that is
 * still zero would draw a rectangle of pen 0, so it must never reach
 * `SpriteDrawer`: `portSpriteList` skips it by WIDTH and names the shard.
 */
export class SprShards extends ShardQueue {
  constructor(manifest, bin) {
    const spr = manifest.spr;
    if (!Array.isArray(spr.shards) || !Array.isArray(spr.boot)
        || typeof spr.streamCount !== 'number') {
      throw new AssetError('assets/manifest.json has no spr.shards/boot/'
        + 'streamCount. This loader is wave 47 or later and the bundle is '
        + 'older: before W47 the sprite sheet was one unsharded pair of files '
        + 'and the stream table was inline JSON.');
    }
    super(spr.shards, spr.boot, bin, 'SPRITE');
    this.mask = new Uint16Array(spr.maskWords);
    this.col = new Uint16Array(spr.colWords);
    for (const [n, a] of [['mask', this.mask], ['col', this.col]]) {
      if (a.length === 0 || (a.length & (a.length - 1)) !== 0) {
        throw new AssetError(`assets/manifest.json says spr.${n}Words is `
          + `${a.length}, which is not a power of two; SpriteDrawer indexes `
          + 'with & (len-1) and would wrap wrongly.');
      }
    }
    // The shard runs must TILE both address spaces exactly, in order. A gap
    // would be words no shard ever fills -- i.e. a stream that is permanently
    // zero and draws a rectangle of pen 0 with nothing to say about it.
    let m = 0, c = 0;
    for (const s of this.meta) {
      if (s.maskFrom !== m || s.colFrom !== c) {
        throw new AssetError(`assets/manifest.json: sprite shard ${s.i} starts `
          + `at mask ${s.maskFrom} / col ${s.colFrom}, but shards 0..${s.i - 1} `
          + `end at ${m} / ${c}. The shard runs must tile the packed space.`);
      }
      m += s.maskLen; c += s.colLen;
    }
    if (m > this.mask.length || c > this.col.length) {
      throw new AssetError(`assets/manifest.json: the sprite shards cover `
        + `${m} mask and ${c} colour words, more than the ${this.mask.length} `
        + `and ${this.col.length} the arrays hold.`);
    }
    this.usedMask = m;
    this.usedCol = c;
  }

  /** Which shard owns packed mask base `b`, or -1.  A range test, not a table. */
  shardOfBase(b) {
    for (const s of this.meta) {
      if (b >= s.maskFrom && b < s.maskFrom + s.maskLen) return s.i;
    }
    // A stream whose whole extent is the two header words packs as a 2-word
    // block and still lands inside some shard's range; base 0 with a zero-length
    // shard 0 is the only way to get here and the exporter cannot produce it.
    return -1;
  }

  async load(i) {
    const [mask, col] = await Promise.all([
      this.bin(`spr/mask.shard${i}.u16.gz`),
      this.bin(`spr/col.shard${i}.u16.gz`),
    ]);
    this.install(i, mask, col);
  }

  install(i, maskBytes, colBytes) {
    const s = this.meta[i];
    for (const [name, bytes, want] of [['mask', maskBytes, s.maskLen * 2],
      ['col', colBytes, s.colLen * 2]]) {
      if (bytes.length !== want) {
        throw new AssetError(`assets/spr/${name}.shard${i}.u16 is `
          + `${bytes.length} B; the manifest says ${want}.`);
      }
    }
    this.mask.set(new Uint16Array(maskBytes.buffer, maskBytes.byteOffset,
      s.maskLen), s.maskFrom);
    this.col.set(new Uint16Array(colBytes.buffer, colBytes.byteOffset,
      s.colLen), s.colFrom);
    this.state[i] = 'ready';
    this.waiting.delete(i);
  }

  describe(i) {
    const s = this.meta[i];
    return `It holds ${s.streams} sprite streams -- ${s.why} -- and a record `
      + 'has asked for one of them. Those records are SKIPPED AND NAMED rather '
      + 'than drawn from zeroed words, so nothing on screen is wrong; this '
      + 'stops because the art will never arrive.\nMissing files: '
      + `assets/spr/mask.shard${i}.u16.gz and assets/spr/col.shard${i}.u16.gz`;
  }
}

/**
 * gzip -> bytes, through the platform's own decompressor.
 *
 * Refused rather than worked around if the platform has none: the alternative
 * is shipping 4.0 MiB where 66 KiB will do, and a silent fallback that fetches
 * forty times as much over a phone connection is not a kindness.
 * `DecompressionStream` is in every browser this page targets and in node 18+,
 * which is what lets `tools/bundlegate.mjs` run the SAME loader the page runs.
 */
export async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new AssetError('This browser has no DecompressionStream, so the '
      + 'gzipped asset bundle cannot be read. Chrome 80+, Firefox 113+ and '
      + 'Safari 16.4+ have it.');
  }
  try {
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    // The realistic cause is a host or CDN that sets `Content-Encoding: gzip`
    // on a `.gz` file, so the browser has ALREADY inflated it and this sees
    // plain bytes. Say that, rather than letting a stream TypeError stand as
    // the whole diagnosis.
    throw new AssetError(`a gzipped asset did not inflate (${e.message}). If `
      + 'the server sets Content-Encoding: gzip on .gz files the browser has '
      + 'already decompressed it; serve them as plain application/octet-stream.');
  }
}

/**
 * A raw-byte reader over an HTTP base, with the `r.ok` check that is the whole
 * point of having one.
 * @param {string|URL} base  the assets/ directory
 * @param {(name:string, done:number, total:number)=>void} [onProgress]
 */
export function httpReader(base, onProgress) {
  return async (name) => {
    onProgress?.(name, 0, 0);
    const url = new URL(name, base);
    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      throw new AssetError(`assets/${name}: the fetch failed (${e.message}). `
        + 'This page must be served over HTTP -- file:// fails on CORS long '
        + 'before it reaches the renderer.');
    }
    if (!r.ok) {
      throw new AssetError(`assets/${name}: HTTP ${r.status}. A missing .bin `
        + 'does not throw on its own -- it yields an EMPTY buffer, and a '
        + 'zero-filled tile sheet renders a perfectly plausible empty '
        + 'starfield. Hence this check.');
    }
    const total = +(r.headers.get('content-length') || 0);
    // Keep Fetch in charge of the body until Chrome marks the request finished.
    // The manual stream reader intermittently ended deferred transfers as
    // net::ERR_ABORTED after their 200 headers; the release gate caught random
    // missing shards even though boot itself had already completed.
    const out = new Uint8Array(await r.arrayBuffer());
    onProgress?.(name, out.length, total || out.length);
    return out;
  };
}

const TD = new TextDecoder();

/**
 * Fetch the four deferred sound assets after first paint. Runtime constructors
 * perform the semantic validation; this boundary validates manifest names,
 * gzip transport and byte/text types without making sound a boot dependency.
 */
export async function loadSoundAssets(readRaw, manifest) {
  if (!manifest?.sound || manifest.sound.deferred !== true) {
    throw new AssetError('assets/manifest.json has no deferred sound contract');
  }
  if (manifest.sound.rom !== 'cave_m04401b032.u17'
      || manifest.sound.icsBase !== 0x400000 || manifest.sound.fragments !== 6
      || manifest.sound.shardBytes !== 3_612_873) {
    throw new AssetError('assets/manifest.json sound topology must be the W158 '
      + 'u17-only 6-fragment/3612873-byte static command union');
  }
  const expected = Object.freeze({
    sampleShard: 'snd/sample.shard.u8.gz',
    sampleIndex: 'snd/sample.index.json.gz',
    bgmScore: 'snd/bgm-score.json.gz',
    driverParams: 'snd/driver-params.json.gz',
  });
  const declared = {
    sampleShard: manifest.sound.shard,
    sampleIndex: manifest.sound.index,
    bgmScore: manifest.sound.bgmScore,
    driverParams: manifest.sound.driverParams,
  };
  for (const key of Object.keys(expected)) {
    if (declared[key] !== expected[key]) {
      throw new AssetError(`assets/manifest.json sound.${key} is `
        + `${JSON.stringify(declared[key])}; expected ${expected[key]}`);
    }
  }
  let bodies;
  try {
    bodies = await Promise.all(Object.values(expected).map(async (name) =>
      gunzip(await readRaw(name))));
  } catch (e) {
    throw e instanceof AssetError ? e
      : new AssetError(`deferred sound assets failed validation: ${e.message}`);
  }
  const [sampleShard, sampleIndex, bgmScore, driverParams] = bodies;
  if (sampleShard.length !== manifest.sound.shardBytes) {
    throw new AssetError(`assets/${expected.sampleShard} is ${sampleShard.length} B, `
      + `manifest says ${manifest.sound.shardBytes}`);
  }
  return Object.freeze({
    sampleShard: new Uint8Array(sampleShard),
    sampleIndex: TD.decode(sampleIndex),
    bgmScore: TD.decode(bgmScore),
    driverParams: TD.decode(driverParams),
  });
}

/**
 * Load and assemble the whole bundle.
 *
 * @param {(name:string)=>Promise<Uint8Array>} readRaw  reads one file of
 *        `assets/` VERBATIM (still gzipped where the name says `.gz`)
 * @param {object} [opts]  break switches, for `tools/bundlegate.mjs` ONLY --
 *        each one exists so a check in here can be SEEN to fail.
 */
export async function loadBundle(readRaw, opts = {}) {
  assertLittleEndianHost();
  const text = async (n) => TD.decode(await readRaw(n));
  const bin = async (n) => gunzip(await readRaw(n));

  const manifest = JSON.parse(await text('manifest.json'));
  if (manifest.encoding !== 'gzip') {
    throw new AssetError(`assets/manifest.json says encoding=${manifest.encoding}; `
      + 'this loader only knows gzip.');
  }

  // --- the TX sheet, which is still one file and still the capture's --------
  const sheets = {};
  {
    const size = manifest.gfx.tx;
    const pixels = await bin('gfx/tx.tiles.u8.gz');
    const nos = new Uint16Array((await bin('gfx/tx.tileno.u16.gz')).buffer);
    if (size.tileBytes !== TX_TILE_BYTES) {
      throw new AssetError(`assets/manifest.json: tx tiles are `
        + `${size.tileBytes} B each, this renderer decodes ${TX_TILE_BYTES} B`);
    }
    if (pixels.length !== size.tiles * TX_TILE_BYTES) {
      throw new AssetError(`assets/gfx/tx.tiles.u8 is ${pixels.length} B, `
        + `the manifest says ${size.tiles} x ${TX_TILE_BYTES} = `
        + `${size.tiles * TX_TILE_BYTES}`);
    }
    if (nos.length !== size.tiles) {
      throw new AssetError(`assets/gfx/tx.tileno.u16 has ${nos.length} `
        + `entries for ${size.tiles} tiles`);
    }
    // tile number -> slot. A dense 64 Ki lookup: 256 KiB, built once, and it
    // makes the per-tile path a single array read instead of a Map probe in
    // the middle of decoding 3,072 tiles a frame.
    const slot = new Int32Array(0x10000).fill(-1);
    for (let i = 0; i < nos.length; i++) slot[nos[i]] = i;
    sheets.tx = { pixels, nos, slot, tileBytes: TX_TILE_BYTES, count: size.tiles };

    const required = size.requiredColdBoot;
    if (!Array.isArray(required) || required.length === 0) {
      throw new AssetError('assets/manifest.json: gfx.tx.requiredColdBoot must be a non-empty '
        + 'array of cartridge-derived tile numbers');
    }
    const seen = new Set();
    for (const tile of required) {
      if (!Number.isInteger(tile) || tile < 0 || tile > 0xffff || seen.has(tile)) {
        throw new AssetError('assets/manifest.json: gfx.tx.requiredColdBoot must contain unique '
          + `u16 tile numbers; found ${JSON.stringify(tile)}`);
      }
      seen.add(tile);
    }
    if (opts.dropTxTile !== undefined) slot[opts.dropTxTile & 0xffff] = -1;
    const absent = required.filter((tile) => slot[tile] < 0);
    if (absent.length) {
      throw new AssetError('assets/gfx/tx.tiles.u8.gz is missing required cold-front-end tile'
        + `${absent.length === 1 ? '' : 's'} ${absent.map((tile) => `$${
          tile.toString(16).toUpperCase()}`).join(', ')}; regenerate the cartridge TX sheet`);
    }
    sheets.tx.requiredColdBoot = Object.freeze([...required]);
  }

  // --- WAVE 14: the BG sheet, SHARDED --------------------------------------
  //
  // The boot set is the manifest's, not this file's: the exporter is what knows
  // which shards the capture's own tiles are in, and `verifyCoverage` below
  // must be satisfiable out of exactly those.  `opts.shards` is for the gates
  // (bundlegate wants them all so `--break blank-tile` can reach any tile).
  const bg = new BgShards(manifest, bin);
  await bg.loadIndex();
  if (manifest.gfx.bg.tileBytes !== BG_TILE_BYTES) {
    throw new AssetError(`assets/manifest.json: bg tiles are `
      + `${manifest.gfx.bg.tileBytes} B each, this renderer decodes `
      + `${BG_TILE_BYTES} B`);
  }
  const wanted = opts.shards === 'all'
    ? bg.meta.map((m) => m.i)
    : bg.boot;
  for (const i of wanted) {
    await bg.fetch(i);
    if (bg.state[i] !== 'ready') {
      // A BOOT shard is different from a later one: there is no picture at all
      // without it, so it throws HERE rather than waiting for a draw.
      const why = bg.error[i]?.message?.split('\n')[0] ?? 'unknown';
      throw new AssetError(`assets/gfx/bg.shard${i}.tiles.u8.gz is a BOOT shard `
        + `and it did not load (${why}). Shards ${bg.boot.join(' and ')} carry `
        + 'every BG tile the recording uses and the first columns the scroll '
        + 'program paints; without them the page has no background at all.');
    }
  }
  sheets.bg = {
    pixels: bg.pixels, nos: bg.nos, slot: bg.slot,
    tileBytes: BG_TILE_BYTES, count: bg.count, shards: bg,
  };
  if (opts.dropTile !== undefined) bg.slot[opts.dropTile & 0xffff] = -1;

  // W621. `$25BB6C`'s 14-by-7 cabinet plane is not part of a stage map or the
  // old capture, so ordinary coverage cannot protect it. Require its complete
  // cartridge-derived tile set in a loaded boot shard before the first screen.
  const requiredBg = manifest.gfx.bg.requiredColdBoot;
  if (!Array.isArray(requiredBg) || requiredBg.length === 0) {
    throw new AssetError('assets/manifest.json: gfx.bg.requiredColdBoot must be a non-empty '
      + 'array of cartridge-derived tile numbers');
  }
  const requiredBgSeen = new Set();
  for (const tile of requiredBg) {
    if (!Number.isInteger(tile) || tile < 0 || tile > 0xffff || requiredBgSeen.has(tile)) {
      throw new AssetError('assets/manifest.json: gfx.bg.requiredColdBoot must contain unique '
        + `u16 tile numbers; found ${JSON.stringify(tile)}`);
    }
    requiredBgSeen.add(tile);
    const shard = bg.shardOfTile[tile];
    if (shard < 0 || !bg.boot.includes(shard) || bg.slot[tile] < 0) {
      throw new AssetError(`required cold-front-end BG tile $${tile.toString(16).toUpperCase()} `
        + `is absent or unavailable in boot shard ${shard}; regenerate the cartridge BG sheet`);
    }
  }
  sheets.bg.requiredColdBoot = Object.freeze([...requiredBg]);

  // WAVE 13/14.  A tile the sheet does not hold used to be an unconditional
  // AssetError, and until wave 13 that was exactly right: every tile the page
  // could ask for came out of the recording.  It is no longer the only way to
  // get here -- the PORT drives the scroll and stage 1 references 1,820 BG
  // tiles.  So the missing-tile path has THREE arms and none of them is silent:
  //
  //   the CAPTURE's own tiles         -> a throw, from `verifyCoverage`, at
  //                                      load, naming the frame and the tile
  //   a tile whose shard is EN ROUTE  -> the transparent pen, the shard
  //                                      promoted to the head of the queue, and
  //                                      the shard NAMED on the status line
  //   a tile whose shard FAILED       -> `demand()` throws, naming the shard
  //                                      and the file to regenerate
  //   a tile in NO shard at all       -> counted in `missingBgTiles` and in
  //                                      `bg.orphans`; that is an EXPORT gap
  //                                      and it is a different bug
  const missingBgTiles = new Set();
  const BG_TRANSPARENT_PEN = 31;      // render/tiles.js buildBgMap: `v === 31`
  const bgTileFn = (roms, index, out = new Uint8Array(BG_TILE_BYTES)) => {
    const i = index & 0xffff;
    const s = bg.slot[i];
    if (s < 0) {
      const sh = bg.shardOfTile[i];
      if (sh < 0) {
        missingBgTiles.add(i);
        bg.orphans.add(i);
      } else {
        bg.demand(sh);                // THROWS if that shard failed
        missingBgTiles.add(i);
      }
      out.fill(BG_TRANSPARENT_PEN);
      return out;
    }
    out.set(bg.pixels.subarray(s * BG_TILE_BYTES, (s + 1) * BG_TILE_BYTES));
    return out;
  };
  // Missing TX tiles (ported code writes tiles the capture never saw) degrade
  // to transparent like BG tiles, not a throw that stops the page.
  const missingTxTiles = new Set();
  const TX_TRANSPARENT_PEN = 15;      // txTile: pen 15 is board-transparent
  const txTileFn = (roms, index, out = new Uint8Array(TX_TILE_BYTES)) => {
    const i = index & 0xffff;
    const s = sheets.tx.slot[i];
    if (s < 0) {
      missingTxTiles.add(i);
      out.fill(TX_TRANSPARENT_PEN);
      return out;
    }
    out.set(sheets.tx.pixels.subarray(s * TX_TILE_BYTES, (s + 1) * TX_TILE_BYTES));
    return out;
  };

  // --- the stage's own BG palette block, checked against the board ---------
  //
  // Shipped, VALIDATED, and NOT YET USED -- see the manifest note.  It is
  // validated rather than merely carried because an asset nothing reads is an
  // asset nobody notices has gone wrong: this compares the cartridge's block
  // against the palette RAM the recording captured, which is the same
  // comparison the exporter makes and the only one available in the browser.
  const bgPalette = new Uint16Array((await bin('gfx/bg.pal.u16.gz')).buffer);
  if (bgPalette.length !== manifest.gfx.bg.palette.words) {
    throw new AssetError(`assets/gfx/bg.pal.u16 has ${bgPalette.length} words, `
      + `the manifest says ${manifest.gfx.bg.palette.words}`);
  }
  const secondMap = new Uint16Array((await bin('gfx/bg.smap.u16.gz')).buffer);
  if (secondMap.length !== manifest.gfx.bg.secondMap.entries * 2) {
    throw new AssetError(`assets/gfx/bg.smap.u16 has ${secondMap.length} words `
      + `for ${manifest.gfx.bg.secondMap.entries} (tile, attr) entries`);
  }

  // --- WAVE 47: the packed sprite streams, SHARDED --------------------------
  //
  // The stream TABLE comes first and it is a typed array now, not manifest JSON
  // (the manifest is the one uncompressed body and 378 triples of it were 7 KB
  // of boot -- see `export-web.mjs`). It is materialised back onto
  // `manifest.spr.streams` in exactly the shape it always had, so
  // `verifyCoverage`, `romToPackedMap` and `bundlegate` are unchanged.
  {
    const raw = await bin(manifest.spr.streamsFile ?? 'spr/streams.u32.gz');
    const flat = new Uint32Array(raw.buffer, raw.byteOffset,
      Math.floor(raw.byteLength / 4));
    if (flat.length !== manifest.spr.streamCount * 3) {
      throw new AssetError(`assets/${manifest.spr.streamsFile} holds `
        + `${flat.length} u32 for ${manifest.spr.streamCount} streams; it must `
        + 'be exactly 3 per stream ([romOffs, packedBase, maskWords]).');
    }
    // WAVE 52: PLANAR AND DELTA-CODED. Three columns of `streamCount`, columns
    // 0 and 1 first-differenced (see `export-web.mjs` for the 4,152 -> 500 B
    // measurement). The accumulator is `>>> 0`, which is exact for a DECREASING
    // column too because the exporter stored the difference in a Uint32Array.
    // An older bundle is refused BY NAME here rather than decoding to nonsense
    // -- a wrong stream table draws the wrong picture and never throws.
    if (manifest.spr.streamsFormat !== 'planes-delta-1') {
      throw new AssetError(`assets/${manifest.spr.streamsFile} is in format `
        + `"${manifest.spr.streamsFormat ?? 'interleaved (pre-W52)'}" and this `
        + 'loader reads "planes-delta-1". Re-export the bundle: '
        + 'node games/ddpdoj/tools/export-web.mjs');
    }
    const n = manifest.spr.streamCount;
    const list = new Array(n);
    let rom = 0, base = 0;
    for (let i = 0; i < n; i++) {
      rom = (rom + flat[i]) >>> 0;
      base = (base + flat[n + i]) >>> 0;
      list[i] = [rom, base, flat[2 * n + i]];
    }
    manifest.spr.streams = list;
  }

  const spr = new SprShards(manifest, bin);
  const requiredColdBootStreams = manifest.spr.requiredColdBootStreams;
  if (!Array.isArray(requiredColdBootStreams) || requiredColdBootStreams.length === 0) {
    throw new AssetError('assets/manifest.json: spr.requiredColdBootStreams must be a non-empty '
      + 'array of cartridge sprite-stream offsets');
  }
  const requiredSeen = new Set();
  const streamByRom = new Map(manifest.spr.streams.map((row) => [row[0], row]));
  if (opts.dropRequiredSprite !== undefined) streamByRom.delete(opts.dropRequiredSprite);
  for (const offs of requiredColdBootStreams) {
    if (!Number.isInteger(offs) || offs <= 0 || offs > 0x7fffff || requiredSeen.has(offs)) {
      throw new AssetError('assets/manifest.json: spr.requiredColdBootStreams must contain unique '
        + `23-bit positive offsets; found ${JSON.stringify(offs)}`);
    }
    requiredSeen.add(offs);
    const row = streamByRom.get(offs);
    if (!row) {
      throw new AssetError(`required cold-front-end sprite stream $${offs.toString(16).toUpperCase()} `
        + 'has no packed mapping; regenerate the cartridge sprite harvest');
    }
    const shard = spr.shardOfBase(row[1]);
    if (shard < 0 || !spr.boot.includes(shard)) {
      throw new AssetError(`required cold-front-end sprite stream $${offs.toString(16).toUpperCase()} `
        + `maps to shard ${shard}, which is not a boot shard`);
    }
  }

  // W621: the exact seven arm-1 records above stay separately named. The rest
  // of the cabinet shell is represented as complete cartridge stream ranges so
  // the manifest stays small while a missing high-score glyph or selector frame
  // still fails at load, before it can become a transparent hole on canvas.
  const requiredCabinetRanges = manifest.spr.requiredCabinetRanges;
  if (!Array.isArray(requiredCabinetRanges) || requiredCabinetRanges.length === 0) {
    throw new AssetError('assets/manifest.json: spr.requiredCabinetRanges must be a non-empty '
      + 'array of [first stream, exclusive end, exact count] rows');
  }
  let priorEnd = 0;
  for (const range of requiredCabinetRanges) {
    if (!Array.isArray(range) || range.length !== 3) {
      throw new AssetError('assets/manifest.json: each spr.requiredCabinetRanges row must have '
        + 'exactly three numbers');
    }
    const [base, endsAt, count] = range;
    if (!Number.isInteger(base) || !Number.isInteger(endsAt) || !Number.isInteger(count)
        || base <= 0 || endsAt <= base || endsAt > 0x800000 || count <= 0 || base < priorEnd) {
      throw new AssetError('assets/manifest.json: invalid or overlapping cabinet sprite range '
        + JSON.stringify(range));
    }
    priorEnd = endsAt;
    const rows = [...streamByRom.values()]
      .filter(([rom]) => rom >= base && rom < endsAt)
      .sort((a, b) => a[0] - b[0]);
    if (rows.length !== count || rows[0]?.[0] !== base) {
      throw new AssetError(`required cabinet sprite range $${base.toString(16).toUpperCase()}..$${
        endsAt.toString(16).toUpperCase()} has ${rows.length} packed mappings starting at $${(
        rows[0]?.[0] ?? 0).toString(16).toUpperCase()}; expected ${count} mappings starting at its base`);
    }
    for (const [rom, packed] of rows) {
      const shard = spr.shardOfBase(packed);
      if (shard < 0 || !spr.boot.includes(shard)) {
        throw new AssetError(`required cabinet sprite stream $${rom.toString(16).toUpperCase()} `
          + `maps to shard ${shard}, which is not a boot shard`);
      }
    }
  }
  // EVERY stream must land inside SOME shard's range. A stream outside them all
  // would be words nothing ever fills -- a permanent rectangle of pen 0 with no
  // message. This is the sprite analogue of `BgShards.loadIndex`'s disjointness
  // check and it is why the page can name a shard it does not have.
  for (const [rom, base] of manifest.spr.streams) {
    if (spr.shardOfBase(base) < 0) {
      throw new AssetError(`sprite stream $${rom.toString(16)} is at packed base `
        + `${base}, which is inside no shard's range. The exporter's shard runs `
        + 'and its stream table disagree.');
    }
  }
  const sprWanted = opts.shards === 'all' ? spr.meta.map((m) => m.i) : spr.boot;
  for (const i of sprWanted) {
    await spr.fetch(i);
    if (spr.state[i] !== 'ready') {
      const why = spr.error[i]?.message?.split('\n')[0] ?? 'unknown';
      throw new AssetError(`assets/spr/*.shard${i}.u16.gz is a BOOT sprite `
        + `shard and it did not load (${why}). Shard ${spr.boot.join(' and ')} `
        + 'carries every stream the RECORDING draws plus the ship\'s own tilt '
        + 'images; without it there are no sprites at all.');
    }
  }
  const sprmask = spr.mask;
  const sprcol = spr.col;
  if (opts.zeroCol) sprcol.fill(0);

  // --- the capture, the seed and the player tables -------------------------
  // WAVE 14: both JSON bodies are gzipped now.  They were 159 KB of the 408 KB
  // the page used to fetch and the whole-stage background needed that room.
  const capJson = JSON.parse(TD.decode(await bin('capture.json.gz')));
  if (!capJson.rebased) {
    throw new AssetError('assets/capture.json is not marked `rebased`. It is '
      + 'the raw oracle capture, whose sprite offsets point at cartridge '
      + 'addresses this bundle does not contain.');
  }
  const cap = new Capture(capJson, await bin('capture.bin.gz'));
  const seed = await bin('seed.bin.gz');
  const tables = JSON.parse(TD.decode(await bin('player.tables.json.gz')));

  // THE PALETTE BLOCK, against the board.  $2415E8 uploads $227E58 into palette
  // RAM $400..$7FF once per stage, so the recording's own palette IS this
  // block plus whatever the game animates.  The exporter measured 1020 of 1024
  // and named the four; this re-checks it in the browser, because a shipped
  // asset that nothing reads is one nobody notices has gone wrong.  A wrong
  // address or a byte-swap drops it to a few hundred.
  //
  // W90: AND NOTE WHAT THIS DOES NOT CHECK, because `src/web/app.js`'s version
  // of this paragraph was read for 76 waves as though it did.  `$400..$7FF` is
  // the BACKGROUND third of palette RAM.  W90 ended: "**The SPRITE palette
  // `$000..$3FF` has no cartridge source in this bundle at all** -- it is
  // `capture.bin`'s frozen instant and nothing else, because `$24150A` (the
  // 64-byte bank upload into `$80E886`) is unported."
  //
  // **W91 PORTED IT** (`src/palette.js`), so that is now half true: [M] 19 of
  // the 32 sprite banks come out of the cartridge and thirteen are still the
  // recording's.  This check is unchanged and still measures ONLY the
  // background block; the sprite side's own agreement figure is computed by
  // `agreeWithBoard` against this same capture and asserted by
  // `tools/webgate.mjs`, because it depends on the PORT's install history and
  // not on an asset.
  let palAgree = 0;
  {
    const p = cap.part(0, 'palette');
    for (let i = 0; i < bgPalette.length; i++) {
      if (p[0x400 + i] === bgPalette[i]) palAgree++;
    }
    if (palAgree < 1000) {
      throw new AssetError(`assets/gfx/bg.pal.u16 agrees with the recording's `
        + `own palette RAM $400..$7FF on only ${palAgree} of ${bgPalette.length} `
        + 'entries. The exporter measured 1020 (the four that differ are bank '
        + '21 pens 0..3, which the game animates). This palette block and this '
        + 'capture are not from the same stage.');
    }
  }

  const bundle = {
    manifest,
    cap,
    seed,
    tables,
    // `igs023` is deliberately EMPTY: with both tile functions overridden
    // nothing in src/render/ reads it (tiles.js holds the only two readers).
    // A zero-length array makes that a range error rather than a wrong tile if
    // that ever stops being true.
    roms: { igs023: new Uint8Array(0), sprcol, sprmask },
    tileFns: { bgTileFn, txTileFn },
    sheets,
    // WAVE 14: the shard machine.  `bg.status()` is what the page prints and
    // `bg.followColumn()` is what the scroll VM drives.
    bg,
    // WAVE 47: the sprite sheet's own shard machine.  `spr.status()` is printed
    // beside the BG one and `spr.demand(i)` is called by the page's MISS GUARD
    // -- so the sprite schedule is driven by the simulation asking for a
    // picture, which is a better clock than any timer.
    spr,
    // WAVE 14: the stage's own BG palette block and its second map -- shipped
    // and checked, drawn by nothing yet.  See the manifest notes.
    bgPalette,
    secondMap,
    bgPaletteAgreement: palAgree,
    // WAVE 13: every BG tile number the PORT's own ring asked for and the sheet
    // could not supply -- now almost always "a shard that has not landed yet",
    // which `bg.status().waiting` names.
    missingBgTiles,
    missingTxTiles,
    requiredColdBootBg: sheets.bg.requiredColdBoot,
    requiredColdBootTx: sheets.tx.requiredColdBoot,
    requiredColdBootStreams: Object.freeze([...requiredColdBootStreams]),
    requiredCabinetRanges: Object.freeze(requiredCabinetRanges.map((range) =>
      Object.freeze([...range]))),
  };
  verifyCoverage(bundle, opts);
  return bundle;
}

/**
 * EVERY tile number and EVERY sprite stream the capture can ever ask for,
 * checked before a single frame is drawn.
 *
 * This is cheap (161 frames x 3,072 map entries plus 7,671 records, all array
 * indexing) and it converts the one failure mode that has no symptom -- a
 * bundle built from a different capture, or a short file that still parsed --
 * into a message naming the frame and the tile.  Wave 6's own lesson, in the
 * form the wave-7 page needs it: a picture cannot tell you it is missing
 * something.
 */
export function verifyCoverage(bundle, opts = {}) {
  const { cap, sheets, manifest } = bundle;
  let streams = manifest.spr.streams;
  if (opts.dropStream !== undefined) {
    streams = streams.filter((_, i) => i !== opts.dropStream);
  }
  // WAVE 44: the manifest entry is [romOffs, packedBase, maskWords] -- the
  // exporter now keeps the CARTRIDGE address it always computed, because the
  // page remaps the PORT's own display list through it (`app.js
  // portSpriteList`). THIS check is about the CAPTURE, whose records were
  // already rewritten into the packed space by the exporter, so it still keys
  // on the packed base and ignores the ROM one.
  const byBase = new Map(streams.map(([, b, n]) => [b, n]));
  for (let i = 0; i < cap.length; i++) {
    const st = cap.state(i);
    for (const [name, ram, n, sheet] of [['BG', st.bg, 64 * 16, sheets.bg],
      ['TX', st.tx, 64 * 32, sheets.tx]]) {
      for (let t = 0; t < n; t++) {
        const no = ram[t * 2];
        if (sheet.slot[no] < 0) {
          // WAVE 14: three different bugs wear this symptom and they get three
          // different sentences. A tile in a shard that is present but does not
          // index it is a broken sheet; a tile in a shard the boot set does not
          // include is a boot-set mistake in the EXPORTER (the recording must be
          // drawable from boot alone); a tile in no shard was never exported.
          const sh = name === 'BG' ? (bundle.bg?.shardOfTile?.[no] ?? -1) : -1;
          const loaded = sh >= 0 && bundle.bg.state[sh] === 'ready';
          throw new AssetError(`capture frame ${i} (lf${cap.frames[i].lf}) uses `
            + `${name} tile ${no} ($${no.toString(16)}) at map entry ${t}, which `
            + (sh < 0
              ? `the exported sheet does not contain (${sheet.count} slots).`
              : loaded
                ? `BG shard ${sh} is supposed to hold and does not -- the shard `
                  + 'loaded but its slot never got indexed.'
                : `is in BG shard ${sh}, and that shard is not in the boot set `
                  + `[${bundle.bg.boot.join(', ')}]. Everything the RECORDING `
                  + 'draws has to be loadable before the first frame; the '
                  + 'exporter folds those tiles into shard 0 and that has '
                  + 'stopped working.'));
        }
      }
    }
    for (const s of parseSpriteList(st.spritebuffer, BUFFER_STRIDE)) {
      if (s.width === 0 || s.height === 0) continue;   // draw() returns first
      const have = byBase.get(s.offs);
      const want = 2 + s.width * s.height;
      if (have === undefined) {
        throw new AssetError(`capture frame ${i} (lf${cap.frames[i].lf}) record `
          + `${s.i} points at packed sprite offset ${s.offs}, which is not an `
          + 'exported stream base.');
      }
      // WAVE 47: and it must be in a BOOT shard. Everything the RECORDING draws
      // has to be drawable before the first frame -- `bundlegate` renders the
      // capture off the boot payload alone and requires 100.0000 % pixel
      // identity to MAME. A capture stream that drifted into a deferred shard
      // would make that gate depend on the network.
      if (bundle.spr) {
        const sh = bundle.spr.shardOfBase(s.offs);
        if (!bundle.spr.boot.includes(sh)) {
          throw new AssetError(`capture frame ${i} (lf${cap.frames[i].lf}) `
            + `record ${s.i} draws packed sprite base ${s.offs}, which is in `
            + `SPRITE SHARD ${sh} and not in the boot set `
            + `[${bundle.spr.boot.join(', ')}]. The exporter must keep every `
            + 'stream the recording uses in shard 0.');
        }
      }
      if (have < want) {
        throw new AssetError(`capture frame ${i} (lf${cap.frames[i].lf}) record `
          + `${s.i} is ${s.width}x${s.height} and needs ${want} mask words; the `
          + `exported stream at ${s.offs} has ${have}.`);
      }
    }
  }
}
