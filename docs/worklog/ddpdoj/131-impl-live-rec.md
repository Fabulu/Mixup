# 131 -- IMPL: live-page REC + the browser digest module (Phase 4c Wave 1)

status: **DONE** -- the browser digest module, the REC tee + seed capture, and
the #rec UI shipped; all three gates green. Plan: `130-recon-live-recplay.md`
(read-only recon, cites measured this session).

started: 2026-08-07
role: the ONLY writer to `games/ddpdoj/src/web/` this wave. `src/` game-logic
unchanged; this is web/ tooling + app.js wiring.

---

## 0. PREMISE CHECK (all green, measured this session)

| brief says | actual | verdict |
|---|---|---|
| `g.step(currentPortWord())` at app.js:785 | app.js:785, exact | CONFIRMED |
| `currentPortWord` at input.js:122 | input.js:122 | CONFIRMED |
| `loadRung` at app.js:1151 | app.js:1151 | CONFIRMED |
| W129 .replay format in NOTES-replay.md | present, v1 format + the verbatim feed line | CONFIRMED |
| headless player at tools/replay.mjs | present; buildReplay :198, verifyReplay :104 | CONFIRMED |
| `stateVector`/`CLAIMED` at state.js:336/388 | exact; CLAIMED ends :425 | CONFIRMED |
| the poke `0x810424=FF` at app.js:784 | exact (`INVULN = 0x810424`, app.js:231) | CONFIRMED |
| `beWords` inverse at app.js:1130 | exact | CONFIRMED |
| baseline `node --test games/ddpdoj/tests/` | 1290/0/0, 0 skipped | CONFIRMED |

Node is v20.17.0 and `globalThis.crypto.subtle` is present, so the browser
module's `crypto.subtle.digest` runs HEADLESS under `node --test` unchanged.
That is what makes the browser-vs-Node digest cross-check a real test instead
of a browser-driven one.

No premise drift. Proceeding.

---

## 1. WHAT PORTED (the spine, per plan 130 section 6 / Wave 131)

1. **`games/ddpdoj/src/web/replay.js`** (new) -- the browser-side replay module.
   - IMPORTS only browser-safe: `stateVector`, `CLAIMED` from `../state.js`.
     Does NOT import `tools/replay.mjs` (that pulls `node:fs/crypto/child_process`).
   - The digest feed line copied VERBATIM from `replay.mjs:141`:
     `columns.map(c => String(v[c])).join('\t') + '\n'`.
   - SHA-256 via `crypto.subtle.digest('SHA-256', ...)`, ACCUMULATE-THEN-HASH
     (SubtleCrypto has no incremental `update()`; SHA-256 of the concatenated
     feed == the incremental hash). Period boundaries recorded as char-offsets
     into the growing feed; each period slice + the whole are hashed at stop.
   - Exports: `armRecorder(game, opts)`, `stopRecorder(rec)` (async, returns
     the v1 `.replay` object), `feedLine(columns, v)`, `sha256Hex(data)`,
     `b64(bytes)`, `unb64(str)`, `beBytesFromWords(w)`, and the format
     constants `FORMAT`, `BUILD`, `PERIOD_FRAMES`.

2. **The REC tee + seed capture in `app.js`**:
   - `Demo.step()` (~:785): compute `const pw = currentPortWord()` once,
     `if (this.recorder) this.recorder.input(pw)` (the tee), keep the existing
     poke `0x810424=FF` at :784 exactly, `g.step(pw)`, then
     `if (this.recorder) this.recorder.feed()` (the digest feed AFTER step).
   - `Demo.recorder = null` field (off by default; when null the hot path is
     the same binding of `pw` plus two null checks).
   - `Demo.armRecording()` (async): captures the seed at arm time --
     `game.ram.b.slice()` (detached 128 KiB), `beBytesFromWords(game.vram.w)`
     (the 4096 BE bytes, inverse of beWords), `lf`/`vf` from
     `game.logicFrame`/`game.videoFrame`, and the tables (re-fetch
     `assets/player.tables.json.gz` + gunzip + base64 to match `tablesSha256`;
     fallback `JSON.stringify(bundle.tables)` if the fetch fails). Sets
     `this.recorder = armRecorder(game, {...})`.
   - `Demo.stopRecording()` (async): `await stopRecorder(this.recorder)`,
     clears `this.recorder`, returns the v1 object.
   - `boot()` stores `demo.assetBase = base` so arm-recording can re-fetch.

3. **The UI in `index.html`**:
   - A `#rec` toggle button in `#bar` (~:229). Click arms (button -> STOP REC);
     click again stops and downloads the `.replay` via Blob + `<a download>`.
   - A `#replay-banner` (parallel to `#rung-banner` :268), hidden by default,
     carries the REC status (armed / N frames saved). The PLAY green/report
     text is W132; this wave only carries the REC status.

`digest.columns = CLAIMED` (full set; `stateVector` always populates every
claimed name on the live page). `poke: '810424=FF'`. The v1 object is assembled
exactly like `replay.mjs buildReplay` (:198).

---

## 2. THE MUST-FAIL CHECKS (plan 130 section 6, SEEDED)

- **The recorder captures portin:** with the recorder armed and a few steps
  with known input, the recorded portin matches the input words; with the
  recorder NOT armed, the buffer is empty.
- **The browser digest matches the Node one (THE cross-check):** the browser
  module's `sha256Hex` on the accumulated feed == Node's incremental
  `createHash('sha256')` on the same lines. Cumulative + every period slice,
  byte-identical. This is the proof accumulate-then-hash == incremental.
  Runs headless under `node --test` (Node 20 has `crypto.subtle`), NO ROM
  needed -- synthetic feed lines through the verbatim `feedLine`.
- **Red-validate A (portin sensitivity):** flip one bit in a recorded portin
  word at an active frame; assert the digest CHANGES (verify RED).
- **Red-validate B (seed sensitivity):** flip one byte in the seed RAM at a
  CLAIMED player address (`py` at $8103E8, the W129 finding B address);
  assert the digest CHANGES (verify RED).

The A/B end-to-end checks use the fly-around ladder and SKIP when it is
absent (CI), the way `w129replay.test.js` skips. The cross-check itself does
NOT need the ladder and always runs.

---

## 3. SCOPE

W131 = REC + the browser digest module ONLY. PLAY (boot-from-.replay, the
playback feed, the divergence UI) is W132 and is NOT done here. The input
layer (`currentPortWord`) is read, not touched. DOJ gameplay `src/` is not
touched.

---

## 4. GATES (all green)

- `node --test games/ddpdoj/tests/`: **1297/0/0, 0 skipped** (baseline 1290 + 7
  new). The ladder was present this session, so the ROM-gated A/B/recorder
  end-to-end tests RAN (not skipped): 7/7 pass.
- **browser-vs-Node digest cross-check: BYTE-IDENTICAL.** The browser module's
  `sha256Hex` on the accumulated feed == Node's incremental `createHash` on the
  same lines: cumulative + every period slice, over 600 synthetic frames
  (2 full periods + a 100-frame partial). Plus a real-data cross-check: a
  Node incremental walk over CLAIMED on the live Game reproduces the browser
  object's `digest.cumulative` byte-for-byte.
- `node tools/publish.mjs --only ddpdoj --dry`: **clean.** rom-leak guard
  checked 263 files (49 decompressed) against 12 ROMs -- clean, 6 deliberate
  exceptions (all pre-existing). The new `src/web/replay.js` pulls NO
  ROM-derived data; `.replay` fixtures stay gitignored (none written).

### Red-validation (SEEDED, differential: green -> red -> green)

- **A (portin sensitivity):** flip bit 0 of the down-held portin word at lf2130
  (index 129, a known-active frame). Baseline `verifyReplay` GREEN; mutation
  RED (`green=false`, cumulative MISMATCH, a period diverges); restore GREEN.
- **B (seed sensitivity):** flip one byte of `py` ($8103E8, the W129 finding-B
  address, offset $103E8 in the 128 KiB RAM). Baseline GREEN; mutation RED;
  restore GREEN. (p1raw would NOT work here -- step() rewrites it from the
  portin before the first feed; py is PERSISTENT integrated state.)
- **recorder captures portin:** armed + `input()` -> words appear verbatim;
  never `input()`-ed -> buffer empty. The page's `if (this.recorder)` guard is
  the same invariant at the Demo level.

## 5. COMMIT

W131 ships in one commit through a private index. Files:
- `games/ddpdoj/src/web/replay.js` (new) -- the browser digest module.
- `games/ddpdoj/src/web/app.js` -- the tee + seed capture + REC flag + boot
  wrappers (one regression in `web-page.test.js`'s call-site pin, updated).
- `games/ddpdoj/index.html` -- the `#rec` button + `#replay-banner` + download.
- `games/ddpdoj/tests/w131recplay.test.js` (new) -- the gate.
- `docs/worklog/ddpdoj/131-impl-live-rec.md` (this file).

## 6. NOTES / FORWARD

- **PLAY is W132** (boot-from-.replay, the playback feed, the divergence UI).
  This wave's `#replay-banner` carries only REC status; the green/report text
  is W132.
- **`version.git = 'unknown'`** in a browser-built `.replay`: the browser
  cannot run `git rev-parse`. The headless `replay.mjs` gets the real sha; the
  `buildId: 'ddpdoj-live'` distinguishes a live recording. The digest does not
  depend on git.
- **tables fallback:** if the re-fetch of `player.tables.json.gz` fails, the
  seed falls back to `JSON.stringify(bundle.tables)` and `tablesSha256` is
  flagged `'fallback-json'` (lossy for the sha, lossless for replay). On a
  served page the re-fetch succeeds and the sha matches the shipped bytes.
- **Memory:** the recorder accumulates the feed string (~94 cols x ~10 chars x
  N frames -> ~19 MB / 19,000 frames). Acceptable for a dev session; flag for
  very long runs (worklog 130 risk c).
