// WAVE 131 -- THE BROWSER-SIDE REPLAY MODULE (live-page REC).
//
// The replay PROPERTY is older than this wave (see NOTES-replay.md and
// `tools/replay.mjs`): a `.replay` is a self-describing artifact whose
// `digest.cumulative` is the sha256 of a per-frame feed line over CLAIMED
// columns, and the headless player GREEN-prints it.  This module is the
// BROWSER half of that: it arms a recorder on the LIVE `Demo.game`, tees one
// portin word per logic frame, feeds `stateVector(game)` into an ACCUMULATING
// digest each frame, and at stop packages the whole thing as a v2 `.replay`
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

// Replay v2 records both cabinet input ports and the selected external mod seed.
// v1 stays readable so published and locally saved recordings remain playable.
export const FORMAT_V1 = 'ddpdoj.replay/v1';
export const FORMAT_V2 = 'ddpdoj.replay/v2';
export const FORMAT = FORMAT_V2;
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
  if (typeof str !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(str)) {
    throw new Error('invalid base64 replay field');
  }
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Parse and validate the replay's per-frame RAM writes.  This is deliberately
 * strict: a malformed address/value must fail before a fresh Game is swapped
 * into the visible Demo, and the browser must apply the same writes as the
 * headless player. */
export function parsePoke(s) {
  if (s === undefined || s === null || s === '') return [];
  if (typeof s !== 'string') throw new Error('replay poke must be a string');
  return s.split(',').map((kv) => {
    const m = /^([0-9a-f]{6})=([0-9a-f]{1,2})$/i.exec(kv);
    if (!m) throw new Error(`invalid replay poke ${kv}`);
    const address = Number.parseInt(m[1], 16);
    const value = Number.parseInt(m[2], 16);
    if (address < 0x800000 || address >= 0x820000) {
      throw new Error(`replay poke address $${m[1].toUpperCase()} is outside main RAM`);
    }
    return [address, value];
  });
}

/** Preserve the frame-sync semaphore at an arbitrary replay or checkpoint seed. */
export function replaySeedArm(seed, ram, semaphoreOffset) {
  const ramArm = ram?.[semaphoreOffset];
  const explicit = Boolean(seed) && Object.hasOwn(seed, 'arm');
  const arm = explicit
    ? seed.arm
    : (Number.isSafeInteger(ramArm) && ramArm > 0 ? ramArm : 1);
  if (!Number.isSafeInteger(arm) || arm < 0 || arm > 0xff) {
    throw new Error('Replay seed arm must be an integer from 0 through 255.');
  }
  if (explicit && ramArm !== arm) {
    throw new Error(`Replay seed arm ${arm} does not match its RAM semaphore ${String(ramArm)}.`);
  }
  return arm;
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
 * (`{ lf, vf, arm, ramB64, bgB64, tablesB64, sound? }`), `opts.version` is the
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
    coinin: [],
    // The feed is accumulated as one growing string; period boundaries are
    // recorded as [start, end) char offsets so each period slice is hashed
    // fresh at stop (the player's per-period windows are FRESH hashes, not a
    // running hash -- `replay.mjs:128/160`).  periodLfs[k] is the lf of the
    // last frame of period k, matching the headless player's `periods[k].lf`.
    cumulativeFeed: '',
    periodBounds: [0],
    periodLfs: [],
    n: 0,
    input(pw, coinWord = 0xffff) {
      this.portin.push(pw >>> 0);
      this.coinin.push(coinWord >>> 0);
    },
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
 * Package an armed recorder into a v2 `.replay` object, assembled exactly like
 * `replay.mjs buildReplay`. Async: the
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

  if (rec.portin.length !== rec.coinin.length) {
    throw new Error(`replay input streams differ: ${rec.portin.length} player and ${rec.coinin.length} coin words`);
  }
  const encodeWords = (words) => {
    const bytes = new Uint8Array(words.length * 2);
    for (let i = 0; i < words.length; i++) {
      bytes[i * 2] = (words[i] >> 8) & 0xff;
      bytes[i * 2 + 1] = words[i] & 0xff;
    }
    return bytes;
  };
  const portinBytes = encodeWords(rec.portin);
  const coininBytes = encodeWords(rec.coinin);
  const seed = {
    ...rec.seed,
    mods: rec.seed?.mods ?? { ids: [], playableHibachi: null },
  };

  return {
    format: FORMAT,
    build: BUILD,
    version: rec.version,
    seed,
    scenario: rec.scenario,
    intervention: rec.intervention,
    poke: rec.poke,
    portin: {
      encoding: 'u16be',
      count: rec.portin.length,
      b64: b64(portinBytes),
    },
    coinin: {
      encoding: 'u16be',
      count: rec.coinin.length,
      b64: b64(coininBytes),
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

// ---------------------------------------------------------------------------
// WAVE 132 -- THE PLAYBACK VERIFIER (live-page PLAY).
//
// `verifyReplay` in `tools/replay.mjs` (the W129 headless player) boots a FRESH
// Game from a `.replay`'s seed, walks it with the recorded portin, and compares
// the per-period + cumulative digests.  WAVE 131 shipped the RECORDER half of
// the live page (the browser module that BUILDS a `.replay`); this is the other
// half -- the verifier that runs on the SAME Game the user is WATCHING.
//
// The visible Demo's Game IS the verify target: `playFrom(obj)` swaps in a
// fresh Game booted from the file's seed, `step()` feeds it `portin[i]` each
// logic frame, and the verifier's `feed()` hashes the resulting state vector.
// No SHADOW Game is needed -- there is nothing to compare the picture against
// except the file's recorded digest, and the picture the owner sees is produced
// by exactly the Game whose state is being hashed (worklog 130 section 3c).
//
// The return shape MIRRORS `verifyReplay` (replay.mjs:167): `{ green, compared,
// cumulative, cumulativeMatch, cumulativeWant, divergentPeriod, periodCount }`,
// and `divergentPeriod` is the `replay.mjs:151` shape
// `{ index, from, to, got, want }`.  So the live banner and the headless report
// are symmetric: a green live verdict is a green headless verdict on the same
// file, and the first divergent 250-frame window is reported the same way
// (never "N frames differ" -- docs/knowledge/01).
//
// The hot path (`feed()`) is SYNCHRONOUS, exactly like the recorder's: it only
// appends a feed line to a growing string and records a char offset at each
// 250-frame boundary.  All `crypto.subtle.digest` work is deferred to
// `check()`/`finalize()` (the page calls them from `Demo.loop()` at each crossed
// boundary and at end-of-portin), so the per-frame path never awaits -- the
// identical design call W131 made for the recorder (worklog 131 section 1).
// ---------------------------------------------------------------------------

/** Decode a replay `u16be` stream into a `Uint16Array`, mirroring the
 *  headless verifier. The recorder encodes each word as two big-endian bytes;
 *  this is the inverse used by playback to feed one word per logic frame. */
function decodeWordsBlock(block, label) {
  if (!block) throw new Error(`replay ${label} block is missing`);
  if (block.encoding !== 'u16be') {
    throw new Error(`unsupported ${label} encoding ${block?.encoding} (want u16be)`);
  }
  if (!Number.isSafeInteger(block.count) || block.count < 1) {
    throw new Error(`replay ${label}.count must be a positive integer`);
  }
  const bytes = unb64(block.b64);
  if (bytes.length % 2 !== 0 || bytes.length / 2 !== block.count) {
    throw new Error(`replay ${label} count ${block.count} does not match its u16be bytes`);
  }
  const words = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < words.length; i++) {
    words[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  }
  return words;
}

export function decodePortinWords(obj) {
  return decodeWordsBlock(obj?.portin, 'portin');
}

export function decodeCoininWords(obj, playerCount = obj?.portin?.count) {
  if (obj?.format === FORMAT_V1) {
    if (!Number.isSafeInteger(playerCount) || playerCount < 1) {
      throw new Error('legacy replay player count must be a positive integer');
    }
    return new Uint16Array(playerCount).fill(0xffff);
  }
  const words = decodeWordsBlock(obj?.coinin, 'coinin');
  if (words.length !== playerCount) {
    throw new Error(`replay input streams differ: ${playerCount} player and ${words.length} coin words`);
  }
  return words;
}

/** Validate the complete browser/headless initialization contract. */
export function validateReplay(obj) {
  if (!obj || (obj.format !== FORMAT_V1 && obj.format !== FORMAT_V2)) {
    throw new Error(`not a supported DaiOuJou replay artifact (got ${String(obj?.format)})`);
  }
  if (obj.build !== BUILD) throw new Error(`unsupported replay build ${String(obj.build)}`);
  if (!obj.seed || !Number.isSafeInteger(obj.seed.lf) || obj.seed.lf < 0
      || !Number.isSafeInteger(obj.seed.vf) || obj.seed.vf < 0) {
    throw new Error('replay seed lf/vf must be non-negative integers');
  }
  if (obj.seed.sound !== undefined
      && (!obj.seed.sound || typeof obj.seed.sound !== 'object'
        || Array.isArray(obj.seed.sound)
        || obj.seed.sound.format !== 'ddpdoj.sound/v1')) {
    throw new Error('replay sound seed must be a ddpdoj.sound/v1 object when present');
  }
  if (obj.format === FORMAT_V2
      && (!obj.seed.mods || typeof obj.seed.mods !== 'object'
        || Array.isArray(obj.seed.mods) || !Array.isArray(obj.seed.mods.ids))) {
    throw new Error('replay v2 seed.mods must contain a mod id array');
  }
  const ram = unb64(obj.seed.ramB64);
  const bg = unb64(obj.seed.bgB64);
  const tablesBytes = unb64(obj.seed.tablesB64);
  if (ram.length !== 0x20000) throw new Error(`replay RAM seed is ${ram.length} bytes, expected 131072`);
  if (bg.length !== 0x1000) throw new Error(`replay BG seed is ${bg.length} bytes, expected 4096`);
  try { JSON.parse(new TextDecoder().decode(tablesBytes)); }
  catch (e) { throw new Error(`replay tables seed is not JSON: ${e.message}`); }
  const words = decodePortinWords(obj);
  const coinWords = decodeCoininWords(obj, words.length);
  const pokes = parsePoke(obj.poke);
  if (!obj.digest || !Array.isArray(obj.digest.columns)
      || obj.digest.columns.length === 0
      || obj.digest.columns.some((c) => typeof c !== 'string' || c.length === 0)) {
    throw new Error('replay digest.columns must be a non-empty string array');
  }
  if (!Number.isSafeInteger(obj.digest.periodFrames) || obj.digest.periodFrames < 1) {
    throw new Error('replay digest.periodFrames must be a positive integer');
  }
  const periods = Math.ceil(words.length / obj.digest.periodFrames);
  if (!Array.isArray(obj.digest.periods) || obj.digest.periods.length !== periods) {
    throw new Error(`replay digest has ${obj.digest.periods?.length ?? 0} periods, expected ${periods}`);
  }
  for (let i = 0; i < periods; i++) {
    const p = obj.digest.periods[i];
    const end = obj.seed.lf + Math.min((i + 1) * obj.digest.periodFrames, words.length);
    if (!p || p.lf !== end || !/^[0-9a-f]{64}$/.test(p.sha256 ?? '')) {
      throw new Error(`replay digest period ${i} is malformed`);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(obj.digest.cumulative ?? '')) {
    throw new Error('replay digest.cumulative is not a SHA-256 hex digest');
  }
  return {
    ram, bg, tables: JSON.parse(new TextDecoder().decode(tablesBytes)),
    words, coinWords, pokes, modSeed: obj.format === FORMAT_V2 ? obj.seed.mods : null,
  };
}

/**
 * Arm a playback verifier on `game` against a parsed `.replay` object `obj`.
 * Mirrors `verifyReplay` (replay.mjs:104) but runs on the LIVE game the user is
 * watching and hashes through this module's ACCUMULATE-then-`sha256Hex` path
 * (the same path the W131 recorder uses and the W131 cross-check proved
 * byte-identical to Node's incremental `createHash`).
 *
 * `feed()` is called ONCE per logic frame, AFTER `g.step()` (it hashes the state
 * the step produced), exactly where the recorder's `feed()` sits and exactly
 * where `verifyReplay` reads `stateVector` (replay.mjs:140).  `check()` (async)
 * hashes each newly-closed 250-frame window FRESH (a fresh sha256 of the slice,
 * not a running hash -- the same `replay.mjs:128` convention) and records the
 * first divergence; `finalize()` (async) closes the trailing partial period,
 * hashes the cumulative, and returns the verdict in `verifyReplay`'s shape.
 *
 * Period boundaries are tracked as char offsets into the growing feed (the same
 * representation the recorder uses), so each period slice is the exact bytes the
 * headless player would hash for that window.  The `from`/`to` of a divergent
 * window are LOGIC FRAMES (lf), matching `replay.mjs:154-155`.
 */
export function armPlayback(game, obj) {
  validateReplay(obj);
  const columns = obj.digest.columns;
  const periodFrames = obj.digest.periodFrames;
  const seedLf = obj.seed.lf;
  const ver = {
    game,
    obj,
    columns,
    periodFrames,
    seedLf,
    // The feed is accumulated as one growing string; period boundaries are
    // recorded as [start, end) char offsets so each period slice is hashed fresh
    // at its boundary (the player's per-period windows are FRESH hashes, not a
    // running hash -- `replay.mjs:128/160`).  periodLfs[k] is the lf of the LAST
    // frame of period k, matching `obj.digest.periods[k].lf` and the headless
    // player's `to` field.
    cumulativeFeed: '',
    periodBounds: [0],
    periodLfs: [],
    periodIdx: 0,          // the next period to hash (closed but unchecked)
    divergentPeriod: null, // the FIRST divergence, in the replay.mjs:151 shape
    n: 0,                  // frames fed
    ended: false,

    /** One logic frame.  Appends the feed line for the CURRENT state and closes a
     *  period boundary when reached.  No-op once `ended` (so a step() that runs
     *  past end-of-portin does not grow a dead feed). */
    feed() {
      if (this.ended) return;
      const v = stateVector(this.game);
      this.cumulativeFeed += feedLine(this.columns, v);
      this.n++;
      if (this.n % this.periodFrames === 0) {
        this.periodBounds.push(this.cumulativeFeed.length);
        this.periodLfs.push(this.seedLf + this.n);
      }
    },

    /** Hash every period that has CLOSED but not yet been checked, and record the
     *  first divergence.  Idempotent for already-checked periods.  Returns the
     *  current `divergentPeriod` (null until a window diverges).  The page calls
     *  this from `Demo.loop()` at each crossed boundary so a divergence surfaces
     *  at the FIRST window, not only at end-of-portin. */
    async check() {
      while (this.periodBounds.length - 1 > this.periodIdx && !this.divergentPeriod) {
        const k = this.periodIdx;
        const slice = this.cumulativeFeed.slice(this.periodBounds[k], this.periodBounds[k + 1]);
        const got = await sha256Hex(slice);
        const want = this.obj.digest.periods[k]?.sha256 ?? '<missing>';
        if (got !== want) {
          this.divergentPeriod = {
            index: k,
            from: this.seedLf + k * this.periodFrames + 1,
            to: this.periodLfs[k],
            got,
            want,
          };
        }
        this.periodIdx++;
      }
      return this.divergentPeriod;
    },

    /** Close the trailing partial period (the headless player hashes the last
     *  window even when it is short: `replay.mjs:148 i === count - 1`), hash the
     *  cumulative, and return the verdict in `verifyReplay`'s shape.  After this,
     *  `feed()` is a no-op. */
    async finalize() {
      this.ended = true;
      if (this.periodBounds[this.periodBounds.length - 1] !== this.cumulativeFeed.length) {
        this.periodBounds.push(this.cumulativeFeed.length);
        this.periodLfs.push(this.seedLf + this.n);
      }
      await this.check();
      const cumulative = await sha256Hex(this.cumulativeFeed);
      const cumulativeMatch = cumulative === this.obj.digest.cumulative;
      const green = this.divergentPeriod === null && cumulativeMatch;
      return {
        green,
        compared: this.n,
        cumulative,
        cumulativeMatch,
        cumulativeWant: this.obj.digest.cumulative,
        divergentPeriod: this.divergentPeriod,
        periodCount: this.periodBounds.length - 1,
      };
    },
  };
  return ver;
}
