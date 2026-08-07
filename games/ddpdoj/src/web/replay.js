// WAVE 131 -- THE BROWSER-SIDE REPLAY MODULE (live-page REC).
//
// The replay PROPERTY is older than this wave (see NOTES-replay.md and
// `tools/replay.mjs`): a `.replay` is a self-describing artifact whose
// `digest.cumulative` is the sha256 of a per-frame feed line over CLAIMED
// columns, and the headless player GREEN-prints it.  This module is the
// BROWSER half of that: it arms a recorder on the LIVE `Demo.game`, tees one
// portin word per logic frame, feeds `stateVector(game)` into an ACCUMULATING
// digest each frame, and at stop packages the whole thing as a v1 `.replay`
// object the headless player (`tools/replay.mjs verifyReplay`) can verify.
//
// THE ONE REAL SUBTLETY -- and the reason this is its own wave -- is that
// SubtleCrypto has NO incremental `update()`.  `tools/replay.mjs` hashes with
// Node's `createHash('sha256')` and calls `.update(line)` once per frame; the
// browser CANNOT do that.  It ACCUMULATES the feed string and hashes once at
// each boundary.  This is faithful because SHA-256 of the concatenated feed is
// exactly the incremental hash of the parts (the cross-check in
// `tests/w131recplay.test.js` is the proof: same feed lines, browser
// accumulate-then-hash vs Node incremental, byte-identical cumulative + every
// period slice).  A green cross-check is the gate; without it the browser
// digest could silently diverge from the headless one.
//
// IMPORTS ONLY browser-safe pieces.  `stateVector` and `CLAIMED` come from
// `../state.js`, which `app.js` already pulls into the browser via `main.js`.
// This module does NOT import `tools/replay.mjs`: that file is a Node tool
// (`node:fs`, `node:crypto`, `node:child_process`) and is unavailable in the
// browser.  The feed line below is copied from it VERBATIM so the two hashing
// paths walk the same bytes (the worklog 130 section 4 note).

import { stateVector, CLAIMED } from '../state.js';

// The v1 format, frozen by W129 (`NOTES-replay.md`, `tools/replay.mjs:50`).
// Mirrored here (not imported) because the headless tool is Node-only.
export const FORMAT = 'ddpdoj.replay/v1';
export const BUILD = 'B';
export const PERIOD_FRAMES = 250;   // the checkpoint cadence (manifest.json `every`)

// ---------------------------------------------------------------------------
// THE DIGEST FEED -- one line, copied VERBATIM from `tools/replay.mjs:141`.
// `columns.map(c => String(v[c])).join('\t') + '\n'` is the load-bearing
// string: the headless player and this module both hash exactly this, so a
// green verify means the same bytes were hashed at record and at replay.
// ---------------------------------------------------------------------------

/** Build one digest feed line from a state vector, over `columns`, in the
 *  EXACT shape `tools/replay.mjs:141` and `portdiff.mjs:276` hash.  Copied
 *  verbatim (not re-implemented) so the browser and Node walks cannot drift on
 *  whitespace or coercion. */
export function feedLine(columns, v) {
  return columns.map((c) => String(v[c])).join('\t') + '\n';
}

/** SHA-256 of a string (UTF-8 encoded) or a raw byte buffer, as lowercase hex.
 *  Uses `crypto.subtle.digest` (SubtleCrypto), which is global in every browser
 *  this page targets and in Node 20+ (so the cross-check runs headless). */
export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const out = await crypto.subtle.digest('SHA-256', bytes);
  return hex(new Uint8Array(out));
}

function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

// ---------------------------------------------------------------------------
// base64 + byte helpers -- browser-native (btoa/atob), chunked so a 128 KiB
// RAM does not blow the call stack the way `String.fromCharCode(...bytes)`
// would.  The shapes mirror `tools/replay.mjs`'s `B64`/`UNB64` so a `.replay`
// written here round-trips through the Node player unchanged.
// ---------------------------------------------------------------------------

/** base64 of a Uint8Array, chunked (a 128 KiB spread throws RangeError). */
export function b64(bytes) {
  const CHUNK = 0x8000;                 // 32 KiB per fromCharCode call
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/** Inverse of `b64`: decode a base64 string into a fresh Uint8Array. */
export function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The inverse of `beWords` (`tools/replay.mjs:58`, `app.js:1130`): lay a
 *  `Uint16Array(2048)` BE ring out as 4096 big-endian bytes.  This is the
 *  shape the v1 `seed.bgB64` field carries and the headless player rebuilds
 *  via `beWords(UNB64(bgB64))`.  The BG ring is a `Uint16Array`, so each word
 *  becomes two bytes high-then-low. */
export function beBytesFromWords(w) {
  const out = new Uint8Array(w.length * 2);
  for (let i = 0; i < w.length; i++) {
    out[i * 2] = (w[i] >> 8) & 0xff;
    out[i * 2 + 1] = w[i] & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE RECORDER -- armed on a live Game, fed once per logic frame.
//
// `armRecorder(game, opts)` returns a recorder; `rec.input(pw)` tees a portin
// word BEFORE the step, `rec.feed()` feeds the post-step state vector AFTER
// the step.  The digest is accumulated as a growing string with period
// boundaries recorded as char offsets, so NO async work happens in the
// per-frame path (SubtleCrypto digests are async).  At stop, each period slice
// and the whole feed are hashed once.  This keeps the hot loop synchronous.
// ---------------------------------------------------------------------------

/**
 * Arm a recorder on `game`.  `opts.seed` is the already-captured seed block
 * (`{ lf, vf, ramB64, bgB64, tablesB64 }`), `opts.version` is the
 * `{ git, tablesSha256, buildId }` block, and `opts.scenario`/`intervention`/
 * `poke` are carried into the file verbatim.  `opts.columns` defaults to the
 * full CLAIMED set (a live recording freezes all of CLAIMED -- `stateVector`
 * always populates every claimed name on the live page, unlike a trace-based
 * replay which filters to the cols the trace carries; see worklog 130 section
 * 2c).  `opts.periodFrames` defaults to PERIOD_FRAMES (250).
 *
 * The returned recorder is mutated by `input()`/`feed()` from inside the
 * page's `step()`; `stopRecorder(rec)` (async) packages it.
 */
export function armRecorder(game, opts) {
  const rec = {
    game,
    columns: opts.columns ?? CLAIMED,
    periodFrames: opts.periodFrames ?? PERIOD_FRAMES,
    seed: opts.seed,
    version: opts.version,
    scenario: opts.scenario ?? 'live',
    intervention: opts.intervention,
    poke: opts.poke ?? '810424=FF',
    portin: [],
    // The feed is accumulated as one growing string; period boundaries are
    // recorded as [start, end) char offsets so each period slice is hashed
    // fresh at stop (the player's per-period windows are FRESH hashes, not a
    // running hash -- `replay.mjs:128/160`).  periodLfs[k] is the lf of the
    // last frame of period k, matching the headless player's `periods[k].lf`.
    cumulativeFeed: '',
    periodBounds: [0],
    periodLfs: [],
    n: 0,
    input(pw) { this.portin.push(pw >>> 0); },
    feed() {
      const v = stateVector(this.game);
      this.cumulativeFeed += feedLine(this.columns, v);
      this.n++;
      if (this.n % this.periodFrames === 0) {
        this.periodBounds.push(this.cumulativeFeed.length);
        this.periodLfs.push(this.seed.lf + this.n);
      }
    },
  };
  return rec;
}

/**
 * Package an armed recorder into a v1 `.replay` object (the format frozen by
 * W129, assembled exactly like `replay.mjs buildReplay` at :198).  Async: the
 * sha256 of the accumulated feed + each period slice.  Clears nothing -- the
 * caller decides whether to reuse the recorder.
 *
 * `digest.cumulative` is the sha256 of the whole feed (== Node's incremental
 * `createHash().update(line)` over the same frames, by the cross-check).
 * `digest.periods[k]` is a FRESH sha256 of the k-th 250-frame slice; the first
 * window whose hash differs is the first-divergence location at 250-frame
 * resolution, exactly as the headless player reports.
 */
export async function stopRecorder(rec) {
  // Close a partial trailing period (the headless player hashes the last
  // window even when it is short: `replay.mjs:148 i === count - 1`).
  if (rec.periodBounds[rec.periodBounds.length - 1] !== rec.cumulativeFeed.length) {
    rec.periodBounds.push(rec.cumulativeFeed.length);
    rec.periodLfs.push(rec.seed.lf + rec.n);
  }

  const cumulative = await sha256Hex(rec.cumulativeFeed);
  const periods = [];
  for (let k = 0; k < rec.periodBounds.length - 1; k++) {
    const slice = rec.cumulativeFeed.slice(rec.periodBounds[k], rec.periodBounds[k + 1]);
    periods.push({ lf: rec.periodLfs[k], sha256: await sha256Hex(slice) });
  }

  // u16be portin bytes: one big-endian word per logic frame, exactly the form
  // `replay.mjs:179 decodePortin` reads back and `step` consumes.
  const portinBytes = new Uint8Array(rec.portin.length * 2);
  for (let i = 0; i < rec.portin.length; i++) {
    portinBytes[i * 2] = (rec.portin[i] >> 8) & 0xff;
    portinBytes[i * 2 + 1] = rec.portin[i] & 0xff;
  }

  return {
    format: FORMAT,
    build: BUILD,
    version: rec.version,
    seed: rec.seed,
    scenario: rec.scenario,
    intervention: rec.intervention,
    poke: rec.poke,
    portin: {
      encoding: 'u16be',
      count: rec.portin.length,
      b64: b64(portinBytes),
    },
    digest: {
      algo: 'sha256',
      columns: rec.columns,
      cumulative,
      periodFrames: rec.periodFrames,
      periods,
    },
  };
}
