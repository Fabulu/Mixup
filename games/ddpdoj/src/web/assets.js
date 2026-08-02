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
export class BgShards {
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
    this.bin = bin;
    this.meta = bg.shards;
    this.boot = bg.boot;
    this.tileBytes = bg.tileBytes;
    this.count = bg.tiles;
    this.pixels = new Uint8Array(bg.tiles * bg.tileBytes);
    this.nos = null;                       // filled by `loadIndex`
    this.slot = new Int32Array(0x10000).fill(-1);
    this.shardOfTile = new Int16Array(0x10000).fill(-1);
    /** 'idle' | 'loading' | 'ready' | 'failed', per shard */
    this.state = this.meta.map(() => 'idle');
    this.error = this.meta.map(() => null);
    this.inflight = this.meta.map(() => null);
    /** shards a DRAW asked for and did not have, since the last `drain()` */
    this.waiting = new Set();
    /** tiles that are in NO shard -- an export gap, not a late fetch */
    this.orphans = new Set();
    this.queue = [];
    this.pumping = false;
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
   * Fetch shard `i` once.  Returns a promise that RESOLVES even on failure --
   * the failure is recorded in `state`/`error` and raised by `demand()` at the
   * moment a draw actually needs it, so a shard nobody has reached yet cannot
   * kill a running page from a background fetch.
   */
  fetch(i) {
    if (this.state[i] === 'ready') return Promise.resolve();
    if (this.inflight[i]) return this.inflight[i];
    this.state[i] = 'loading';
    const p = this.bin(`gfx/bg.shard${i}.tiles.u8.gz`)
      .then((b) => { this.install(i, b); })
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
   * caller draws the transparent pen.
   */
  demand(i) {
    if (this.state[i] === 'failed') {
      const why = this.error[i]?.message?.split('\n')[0] ?? 'unknown';
      throw new AssetError(`BG SHARD ${i} DID NOT LOAD (${why}).\n`
        + `It holds ${this.meta[i].tiles} background tiles for `
        + (this.meta[i].cols
          ? `map columns ${this.meta[i].cols[0]}..${this.meta[i].cols[1]}`
          : 'the second map')
        + ', and the port has scrolled into them. The picture would be BLACK '
        + `there, so this stops instead.\nMissing file: `
        + `assets/gfx/bg.shard${i}.tiles.u8.gz`);
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

  /** Queue every shard that is not here yet, in ascending (i.e. need) order. */
  prefetchAll() {
    for (let i = 0; i < this.meta.length; i++) {
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

  /** Everything the page's status line needs, in one object. */
  status() {
    const ready = this.state.filter((s) => s === 'ready').length;
    return {
      ready,
      total: this.meta.length,
      loading: this.state.map((s, i) => (s === 'loading' ? i : -1)).filter((i) => i >= 0),
      failed: this.state.map((s, i) => (s === 'failed' ? i : -1)).filter((i) => i >= 0),
      waiting: [...this.waiting],
      orphans: this.orphans.size,
    };
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
    if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
    const reader = r.body.getReader();
    const out = new Uint8Array(total);
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.set(value, n);
      n += value.length;
      onProgress?.(name, n, total);
    }
    return out;
  };
}

const TD = new TextDecoder();

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
  if (opts.dropTile !== undefined) bg.slot[opts.dropTile] = -1;

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
  const txTileFn = (roms, index, out = new Uint8Array(TX_TILE_BYTES)) => {
    const s = sheets.tx.slot[index & 0xffff];
    if (s < 0) {
      throw new AssetError(`TX tile ${index} ($${index.toString(16)}) is not in `
        + `the exported sheet (${sheets.tx.count} tiles). The bundle was built `
        + 'for a different capture than the one being drawn.');
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

  // --- the packed sprite streams ------------------------------------------
  const maskBytes = await bin('spr/mask.u16.gz');
  const colBytes = await bin('spr/col.u16.gz');
  const sprmask = new Uint16Array(maskBytes.buffer);
  const sprcol = new Uint16Array(colBytes.buffer);
  if (sprmask.length !== manifest.spr.maskWords
      || sprcol.length !== manifest.spr.colWords) {
    throw new AssetError(`assets/spr: mask ${sprmask.length} words and col `
      + `${sprcol.length} words against a manifest saying `
      + `${manifest.spr.maskWords} and ${manifest.spr.colWords}`);
  }
  // SpriteDrawer indexes with `& (len - 1)`. On the cartridge those lengths are
  // the ROM region sizes and are powers of two by construction; here they are
  // powers of two because the exporter rounds up to one. If they were not, an
  // out-of-range read would wrap somewhere the board would not.
  for (const [n, a] of [['mask', sprmask], ['col', sprcol]]) {
    if ((a.length & (a.length - 1)) !== 0) {
      throw new AssetError(`assets/spr/${n}.u16 is ${a.length} words, which is `
        + 'not a power of two; SpriteDrawer\'s & (len-1) would wrap wrongly');
    }
  }
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
    // WAVE 14: the stage's own BG palette block and its second map -- shipped
    // and checked, drawn by nothing yet.  See the manifest notes.
    bgPalette,
    secondMap,
    bgPaletteAgreement: palAgree,
    // WAVE 13: every BG tile number the PORT's own ring asked for and the sheet
    // could not supply -- now almost always "a shard that has not landed yet",
    // which `bg.status().waiting` names.
    missingBgTiles,
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
  // [base, maskWords] sorted by base -> a lookup by exact base.
  const byBase = new Map(streams.map(([b, n]) => [b, n]));
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
      if (have < want) {
        throw new AssetError(`capture frame ${i} (lf${cap.frames[i].lf}) record `
          + `${s.i} is ${s.width}x${s.height} and needs ${want} mask words; the `
          + `exported stream at ${s.offs} has ${have}.`);
      }
    }
  }
}
