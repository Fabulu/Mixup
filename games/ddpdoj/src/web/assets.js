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

  // --- the two tile sheets -------------------------------------------------
  const sheets = {};
  for (const [key, size, bytes] of [['bg', manifest.gfx.bg, BG_TILE_BYTES],
    ['tx', manifest.gfx.tx, TX_TILE_BYTES]]) {
    const pixels = await bin(`gfx/${key}.tiles.u8.gz`);
    const nos = new Uint16Array((await bin(`gfx/${key}.tileno.u16.gz`)).buffer);
    if (size.tileBytes !== bytes) {
      throw new AssetError(`assets/manifest.json: ${key} tiles are `
        + `${size.tileBytes} B each, this renderer decodes ${bytes} B`);
    }
    if (pixels.length !== size.tiles * bytes) {
      throw new AssetError(`assets/gfx/${key}.tiles.u8 is ${pixels.length} B, `
        + `the manifest says ${size.tiles} x ${bytes} = ${size.tiles * bytes}`);
    }
    if (nos.length !== size.tiles) {
      throw new AssetError(`assets/gfx/${key}.tileno.u16 has ${nos.length} `
        + `entries for ${size.tiles} tiles`);
    }
    // tile number -> slot. A dense 64 Ki lookup: 256 KiB, built once, and it
    // makes the per-tile path a single array read instead of a Map probe in
    // the middle of decoding 3,072 tiles a frame.
    const slot = new Int32Array(0x10000).fill(-1);
    for (let i = 0; i < nos.length; i++) slot[nos[i]] = i;
    if (opts.dropTile !== undefined && key === 'bg') slot[opts.dropTile] = -1;
    sheets[key] = { pixels, nos, slot, tileBytes: bytes, count: size.tiles };
  }

  const tileFn = (sheet, name) => (roms, index, out = new Uint8Array(sheet.tileBytes)) => {
    const s = sheet.slot[index & 0xffff];
    if (s < 0) {
      throw new AssetError(`${name} tile ${index} ($${index.toString(16)}) is `
        + `not in the exported sheet (${sheet.count} tiles). The bundle was `
        + 'built for a different capture than the one being drawn.');
    }
    out.set(sheet.pixels.subarray(s * sheet.tileBytes, (s + 1) * sheet.tileBytes));
    return out;
  };

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
  const capJson = JSON.parse(await text('capture.json'));
  if (!capJson.rebased) {
    throw new AssetError('assets/capture.json is not marked `rebased`. It is '
      + 'the raw oracle capture, whose sprite offsets point at cartridge '
      + 'addresses this bundle does not contain.');
  }
  const cap = new Capture(capJson, await bin('capture.bin.gz'));
  const seed = await bin('seed.bin.gz');
  const tables = JSON.parse(await text('player.tables.json'));

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
    tileFns: { bgTileFn: tileFn(sheets.bg, 'BG'), txTileFn: tileFn(sheets.tx, 'TX') },
    sheets,
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
          throw new AssetError(`capture frame ${i} (lf${cap.frames[i].lf}) uses `
            + `${name} tile ${no} at map entry ${t}, which the exported sheet `
            + `does not contain (${sheet.count} tiles).`);
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
