# 130 -- RECON: live-page REC/PLAY (Phase 4c)

status: **DONE (recon)** -- the port plan for the live-page integration is
below. READ-ONLY: no `src/` touched, no commit, no implement. Premise
correction: the brief cited "worklog 128 (Phase 4c sketch)" -- **128 was
never written as a file** (CATCHUP 7n calls W128 "text-only"). The Phase 4c
sketch actually lives in `119-strategic-plan.md` lines 97-113, especially
line 113: "tee `currentPortWord()` into a ring buffer each logic frame in
`app.js`, dump `.replay` (seed from current rung via W101). Player: feed
portin[i] into step(), compare periodic digest, surface first divergence on
screen." This recon fleshes that one sentence into a sized plan.

started: 2026-08-07
role: READ-ONLY RECON. Cites are `games/ddpdoj/...` paths with line numbers,
all measured this session.

---

## 0. PREMISE CHECK (the brief's one drift is a path abbreviation, not a fault)

| brief says | actual | note |
|---|---|---|
| `src/web/app.js` | `games/ddpdoj/src/web/app.js` | game-scoped, not repo-root |
| `src/web/input.js` | `games/ddpdoj/src/web/input.js` | same |
| the step at ~:785 | `app.js:785` `g.step(currentPortWord())` | CONFIRMED, exact |
| `currentPortWord` ~:122 | `input.js:122` | CONFIRMED |
| `loadRung` ~:1151 | `app.js:1151` | CONFIRMED |
| Demo.loop ~:1070 | `app.js:1091` (`loop`) | close enough |
| worklog 128 | **does not exist** | sketch is in `119-strategic-plan.md:113` |

`currentPortWord()` (`input.js:122`) returns `portWordFromBits(currentBits())`,
and `currentBits()` reads `currentMask()` (`input.js:98`) = the shared
controller (keyboard + gamepad, W109) OR'd with `touchHeld` (the on-screen
pad + floating stick), masked to 16 bits. So the input word is **one OR of
keyboard + gamepad + touch**, sampled once per LOGIC frame inside `step()`.
Constraint 3 (sample once per logic frame) is already honoured -- the tee
goes at the same point.

No existing REC/PLAY scaffolding: `games/ddpdoj/src/web/` has only `app.js`,
`assets.js`, `input.js`. The word "replay" in `app.js` is the recorded
CAPTURE (HUD/enemies), not `.replay` playback. Clean slate.

---

## 1. THE INTEGRATION POINTS (measured)

* **The step site** -- `app.js:773` `Demo.step()`:
  - `app.js:783` snapshots the sprite list (the one-frame hold);
  - `app.js:784` `g.ram.setU8(INVULN, 0xff)` -- the HARDCODED live poke
    (`INVULN = 0x810424`, `app.js:231`). This is the always-on invuln aura,
    the W100 owner decision. It is the SAME poke the `.replay` format carries
    (`poke: "810424=FF"`). So PLAY on the live page already honours it;
    REC must freeze `poke: "810424=FF"` into the file.
  - `app.js:785` `g.step(currentPortWord())` -- THE TEE POINT for REC, and
    the replace point for PLAY.
* **The loop** -- `app.js:1091` `Demo.loop(now)`: rAF callback, polls the
  gamepad ONCE per animation frame (`pollInput()`, `app.js:1097`), then runs
  `while (acc >= periodMs && n < 8) step()` (`app.js:1106`). So 0-8 logic
  frames per rAF; `currentPortWord()` is read inside `step()`, i.e. once per
  LOGIC frame. The REC tee and the PLAY feed both go inside `step()`, not
  `loop()`, to stay per-logic-frame.
* **The Game** -- `Demo.game` (`app.js:688`), a `Game` (`main.js:139`,
  ctor `main.js:146`). Seed inputs at construction: `seed` (Uint8Array
  0x20000), `tables`, `{ logicFrame, videoFrame, bgSeed }`. For PLAY we
  construct a Game the same way from the `.replay`'s seed.
* **The boot** -- `app.js:1224` `boot(canvas, opts)`: fetches `game.json`,
  `loadBundle`, resolves `?rung=` via `loadRung` (`app.js:1151`), constructs
  `Demo`, `attachInput`, starts the rAF. Returns `{ demo, bundle, stats,
  mode, setMode, spriteSource, setSpriteSource, stop }` (`app.js:1287`).
  `window.__mixup = app` is already exposed (`index.html:730`) as a debugging
  handle -- REC/PLAY can hang off the Demo it already returns.
* **The input layer** -- `shared/input.js`'s `createInput` controller
  (`state()`, `poll()`, `attach()`, `hasPad`, `clearKeyboard`). REC reads
  `currentPortWord()` untouched; PLAY does not call it (feeds `portin[i]`).
  No input-layer change needed for either.
* **The UI shell** -- `index.html:229` `#bar` (name, spacer, `#stats`, `#rot`,
  `#ctrl`, `#infobtn`); `index.html:266` `#status` (the status line);
  `index.html:268` `#rung-banner` (the seeded-provenance banner, W101);
  `index.html:270` `#info` (the INFO sheet).

---

## 2. REC DESIGN -- tee + seed capture + package

### 2a. The tee (inside `Demo.step()`, `app.js:785`)

When REC is armed, capture the input word ONCE per logic frame at the exact
sample point:

```
const pw = currentPortWord();      // computed once, used for both
if (rec) rec.portin.push(pw);      // the tee
g.ram.setU8(INVULN, 0xff);         // (existing poke, already above this)
g.step(pw);
```

Notes:
- The poke (`app.js:784`) is ABOVE the step; the tee order must keep the
  poke before `g.step()` exactly as today (do not reorder). Cleanest: tee
  `pw` right where `currentPortWord()` is now called, feed `pw` to `step()`.
- The buffer is a growable `number[]` or a `Uint16Array` with capacity
  doubling. A stage-1 run is ~19,217 frames -> ~38 KB. Trivial.
- The tee is the ONLY game-logic touch in REC. The simulation is unchanged.

### 2b. The seed capture (at REC-START, before the first tee'd frame)

The `.replay` seed is `{ lf, vf, ramB64, bgB64, tablesB64 }`. From the live
`Demo.game`:

- **lf / vf** -- `game.logicFrame` / `game.videoFrame` (`main.js:184/185`).
  These are the seed's own lf/vf; the first tee'd portin is for lf+1, which
  is exactly the headless player's convention (`replay.mjs:137`).
- **ramB64** -- `game.ram.b` is the live `Uint8Array(0x20000)` (`ram.js:34`,
  a copy made at construction, mutated in place every step). Snapshot a
  DETACHED copy at REC-start: `game.ram.b.slice()`. base64 in the browser
  via `btoa(String.fromCharCode(...bytes))` chunked (128 KiB -- chunk it,
  spread blows the stack), or a small `fileSaveAs` helper. This is the same
  128 KiB W101 ships as the seed and `seedcmp` re-seeds from.
- **bgB64** -- `game.vram.w` is the live `Uint16Array(2048)` big-endian
  tilemap ring (`background.js:191`). To get the 4096 big-endian bytes the
  format wants (the inverse of `beWords`, `app.js:1130` / `replay.mjs:58`):
  `for (i) { out[2i]=w[i]>>8; out[2i+1]=w[i]&0xff }`, then base64.
- **tablesB64** -- two options (see risks 5c). (1) RE-FETCH
  `assets/player.tables.json.gz`, gunzip, base64 the raw bytes -- this
  matches `tablesSha256` exactly. (2) `JSON.stringify(bundle.tables)` ->
  base64 -- lossless for the player (it `JSON.parse`s), but a different
  byte sequence from the shipped file. Recommend (1) for fidelity;
  `bundle.tables` came from `player.tables.json.gz` (`assets.js:698`).

### 2c. The package (the W129 `.replay` v1 format, `NOTES-replay.md`)

On REC-STOP, assemble the v1 object exactly as `replay.mjs buildReplay`
(`replay.mjs:198`) does, but in the browser:

```
{
  format: 'ddpdoj.replay/v1',
  build: 'B',
  version: { git, tablesSha256, buildId: 'ddpdoj-live' },
  seed: { lf, vf, ramB64, bgB64, tablesB64 },
  scenario: seeded?.scenario ?? 'live',
  intervention: seeded?.intervention,          // carry the rung's label
  poke: '810424=FF',                            // the live poke (INVULN)
  portin: { encoding:'u16be', count, b64 },     // u16be of the tee'd words
  digest: {
    algo: 'sha256',
    columns: CLAIMED,                           // full set (stateVector always complete)
    cumulative,                                 // sha256 of the whole feed
    periodFrames: 250,
    periods: [{ lf, sha256 }]                   // fresh-window hashes
  }
}
```

`columns` is the FULL `CLAIMED` set (`state.js:388`): `stateVector` always
populates every claimed name on the live page, so (unlike a trace-based
replay, which filters to the cols the trace carries) a live recording freezes
all of CLAIMED. The headless player uses the frozen set verbatim
(`replay.mjs:126`), so this is consistent.

**The digests are computed LIVE during REC** (cheap insurance + the file is
self-verifying): each tee'd frame, also feed `stateVector(game)` into a
cumulative hash and a rolling per-period hash. See 4c for the client-side
hash. At REC-STOP, assert the browser's own cumulative reproduces (trivially
true -- same feed, same frames) and write both into `digest`.

### 2d. The save (browser download)

`JSON.stringify(obj)` -> `new Blob([json], {type:'application/json'})` ->
`URL.createObjectURL` -> a synthetic `<a download="doj-lfN-M.replay">` click.
Standard. The `tablesB64` makes the file ~150-400 KB (the tables JSON is the
bulk); the 128 KiB RAM is ~170 KB base64. Total a few hundred KB per recording.

---

## 3. PLAY DESIGN -- boot + feed + digest + divergence

### 3a. Load + boot

A file-`<input>` (`accept=".replay,application/json"`) -> `file.arrayBuffer()`
-> `JSON.parse(TextDecoder.decode(...))`. On load, the page enters PLAYBACK
mode and boots a FRESH `Game` from the file's seed, mirroring `replay.mjs:118`:

```
const ram = UNB64(obj.seed.ramB64);
const bg  = beWords(UNB64(obj.seed.bgB64));   // app.js:1130 beWords
const tbl = JSON.parse(new TextDecoder().decode(UNB64(obj.seed.tablesB64)));
const game = new Game(ram, tbl, { logicFrame: obj.seed.lf,
                                  videoFrame: obj.seed.vf, bgSeed: bg });
```

This is the SAME construction W101's `Demo` constructor uses
(`app.js:688-692`) and `loadRung` feeds (`app.js:1194-1199`). The existing
`Demo` can host it: hand the booted Game to a new Demo (or add a
`Demo.playFrom(game)` path). The BG shard scheduler + the sprite-list hold
all work off `game`, so the visible picture is a faithful playback.

### 3b. Feed (inside `Demo.step()`, replacing the input source)

```
const pw = playback ? obj.portin.words[playback.i++]   // feed the recording
                    : currentPortWord();               // normal play
g.ram.setU8(INVULN, 0xff);                             // the live poke (== file's poke)
g.step(pw);
if (playback && playback.i >= obj.portin.count) endPlayback();
```

The live poke (`app.js:784`) IS the file's `poke: "810424=FF"`, so the
playback reproduces the recording's poke path exactly. (If a future recording
carried a different poke, the live page could not honour it without a generic
poke-applier -- flag as a forward constraint, not a blocker: every live REC
records exactly `810424=FF`.) At end-of-portin, stop the loop.

### 3c. Digest + divergence (on the SAME Game the user watches)

The visible Demo's Game IS the playback Game, so `stateVector(game)` each
frame is the thing to check. Feed it the SAME way `replay.mjs:141` does:

```
const v = stateVector(game);
const line = obj.digest.columns.map(c => String(v[c])).join('\t') + '\n';
```

Compare per-period (fresh hash at each 250-frame boundary) against
`obj.digest.periods[k].sha256`, and the cumulative against
`obj.digest.cumulative`. Surface the FIRST divergent window (the
`replay.mjs:151` shape: `{ index, from, to, got, want }`), never "N frames
differ" (`docs/knowledge/01`). On GREEN at end-of-portin, say so.

No SHADOW Game needed for the playback case -- the visible Game IS the
verify target. (A shadow would only be wanted for "verify a recording while
the user plays their own run", a different feature; out of scope here.)

### 3d. The divergence display

A dedicated `#replay-banner` (parallel to `#rung-banner`, `index.html:268`),
not `#status`: `#status` already cycles loading / shard / miss messages and
would fight the divergence text. Green: "REPLAY GREEN -- N frames, all
periods reproduce." Red: "REPLAY RED -- first divergence in window
lfA..lfB (period k); player HASH vs recorded HASH. Re-run with the trace to
localise to a single frame." (The `replay.mjs:327-336` report text, verbatim
in spirit.)

---

## 4. THE DIGEST REUSE (client-side, no Node) -- the one real subtlety

`replay.mjs` is a Node tool: it imports `node:fs`, `node:crypto`,
`node:child_process` at module top (`replay.mjs:33-36`) and uses
`createHash('sha256')` incrementally (`update(line)` per frame,
`replay.mjs:142/143`). The browser CANNOT import `replay.mjs` as-is.

What the browser CAN import: `stateVector`, `CLAIMED` from
`games/ddpdoj/src/state.js` (already browser-safe -- `app.js` pulls `main.js`
which pulls `state.js`; nothing Node in `state.js`). So a new browser module
`games/ddpdoj/src/web/replay.js` imports those and owns:

- the FEED LINE (one line, copied verbatim from `replay.mjs:141`):
  `columns.map(c => String(v[c])).join('\t') + '\n'`;
- the SHA-256, via **`crypto.subtle.digest('SHA-256', bytes)`** -- but
  SubtleCrypto has NO incremental `update()`. So ACCUMULATE the feed string
  and hash once at each boundary:
  - keep `cumulativeFeed` (one growing string);
  - at each 250-frame boundary, `periodHash = sha256(cumulativeFeed.slice(periodStart))`;
  - at end, `cumulativeHash = sha256(cumulativeFeed)`.
- `TextEncoder().encode(feed)` -> `subtle.digest` -> hex. This matches
  Node's `createHash().update(string)` (UTF-8 default) byte-for-byte, because
  SHA-256 of the concatenated feed == the incremental hash of the parts.

Memory: ~94 columns x ~10 chars x N frames. ~2 MB / 2,000 frames, ~19 MB /
19,000 frames. Acceptable for a dev session; flag for very long runs.

A cross-check gate: a test that builds a `.replay` from the fly-around ladder
(via `replay.mjs`) AND via the browser module's ACCUMULATE path on the same
frames, and asserts `digest.cumulative` + every `periods[k].sha256` are
identical. This is the proof the digest reuse is faithful (the W129
own-walk assertion, `replay.mjs:263`, ported to cross-tool).

---

## 5. THE UI + INTEGRATION

### 5a. Controls (where REC/PLAY go)

`#bar` (`index.html:229`) is the natural home -- it already holds `#rot`,
`#ctrl`, `#infobtn`. Add two controls:
- a **REC** toggle button (`#rec`): click to ARM (status line says
  "REC armed -- start playing"), click again to STOP and download the
  `.replay`. Arms/captures the seed at ARM time, tees until STOP.
- a **PLAY** file-`<input>` (`#play`, `accept=".replay"`): on load, enters
  PLAYBACK mode, boots from the file, feeds portin[], shows the banner.

Mobile caveat: `#stats` already hides under 560px (`index.html:101`); two
more buttons are fine on desktop, tight on phone. REC/PLAY are DEVELOPER
tools (the owner is the audience), so hiding them behind the INFO sheet on
narrow screens is acceptable. The on-screen pad (`#pad`) and the controls
do not conflict: in PLAYBACK the live inputs are simply not read.

### 5b. Opt-in, off by default (REC/PLAY must not disturb normal play)

REC is a flag on the Demo (`demo.rec = {...}`); PLAY is a flag
(`demo.playback = {...}`). `step()` checks them; when both null the path is
IDENTICAL to today (one extra `const pw = currentPortWord()` is the only
overhead -- and even that can be gated behind `if (rec || playback)` so the
hot path is untouched when neither is armed). The page boots and plays
exactly as now until the owner explicitly arms REC or loads a `.replay`.

### 5c. Interaction with `?rung=` + the input layer

- REC on a rung-booted page (local dev): the captured seed is whatever the
  live RAM is at ARM time (the rung's lf has advanced). Carry the rung's
  `scenario`/`intervention` into the file's fields. The `.replay` is
  self-contained -- it does not need the ladder to replay.
- PLAY ignores `?rung=` (it boots from the file's seed).
- The shared input controller needs NO change. REC reads it via
  `currentPortWord()` as today; PLAY does not call `currentPortWord()`.

---

## 6. THE PORT PLAN (~1-2 waves)

**Wave 131 -- REC + the browser digest module (the spine).**
- `games/ddpdoj/src/web/replay.js` (new): exports `armRecorder(demo)`,
  `stopRecorder()` -> the v1 object, `digestOf(stateVec, columns)` /
  `periodHash(feedSlice)` / `b64(bytes)` / `unb64(str)` / `beWords(bytes)`.
  Imports `stateVector, CLAIMED` from `../state.js`. Uses `crypto.subtle`.
- `app.js`: the tee in `Demo.step()` (one `if (this.rec)`); the seed capture
  (ram.b slice, vram.w -> be bytes, re-fetch tables.json.gz); the REC flag.
- `index.html`: the `#rec` button + the Blob download.
- Tests: `tests/w131recplay.test.js` -- headless: drive `Demo.step()` with a
  fixed portin, arm REC, step N frames, stop, assert the v1 object's seed
  reproduces (boot a fresh Game from it, feed the same portin, assert
  `stateVector` matches). Cross-check the browser digest vs `replay.mjs`'s
  on the same frames (the 4 cross-check). Red-validate: flip one portin bit
  -> the recording's own digest changes (A); flip a seed byte at a CLAIMED
  player address -> playback diverges (B, per W129 finding B).

**Wave 132 -- PLAY + the divergence UI.**
- `app.js`: the `Demo.playback` path in `step()` (feed `portin[i]`), the
  boot-from-replay construction, end-of-portin stop.
- `index.html`: the `#play` file-input, the `#replay-banner`, the report
  text.
- Tests: load the W129 fly-around fixture (regenerated by the gate), play it
  on the headless Demo, assert GREEN. Mutate the fixture's `portin[100]`
  (A), a seed byte (B), or `digest.cumulative` (C) -> assert the banner
  reports the right window / MISMATCH.

A single combined wave (131) is plausible if the digest module is the first
thing written and cross-checked; splitting keeps the digest faithfulness
gated on its own. **Recommend 2 waves** (the digest cross-check is the load-
bearing risk and deserves its own gate).

---

## 7. RISKS

- **(a) The seed capture -- reading live RAM/BG/tables.** RAM and BG are
  trivial (`game.ram.b`, `game.vram.w` are live in-memory arrays). The one
  real question is tables: re-fetch `player.tables.json.gz` for byte-exact
  `tablesSha256` (preferred) vs `JSON.stringify(bundle.tables)` (lossless
  for replay but a different sha). The header `Content-Encoding: gzip` path
  (`assets.js:698` uses a `DecompressionStream`-style gunzip) must work
  outside `loadBundle` too.
- **(b) Browser file-handling.** The download (Blob + `<a download>`) and
  upload (`<input type=file>` + `arrayBuffer`) are standard, but: large
  files (~few hundred KB) on a phone; the `.replay` extension is unknown to
  the OS (offer `application/json` accept). Minor.
- **(c) The digest reuse -- client-side, no Node.** SubtleCrypto has no
  incremental `update()`; ACCUMULATE-then-hash works (SHA-256 of the
  concatenated feed == the incremental hash) but the growing string costs
  memory on long runs (~19 MB / 19,000 frames). The cross-check gate (4) is
  the proof it is faithful; without it the browser digest could silently
  diverge from the headless one.
- **(d) REC/PLAY disturbing normal play.** Mitigated by construction: both
  are null/off by default; the hot path in `step()` is unchanged when
  neither is armed. The one inescapable addition is computing `pw` once
  (which is what `currentPortWord()` already costs).
- **(e) The poke consistency.** The live page hardcodes `810424=FF`
  (`app.js:784`); every live REC records that poke; the headless player
  applies it from the file. A future poke would need a generic applier on
  the live page. Forward constraint, not a blocker.
- **(f) Mode interaction.** REC and PLAY are mutually exclusive (a flag
  check). Neither makes sense mid-the-other; the UI disarms one before
  arming the other. `?rung=` + REC is fine (seed is whatever is live);
  PLAY ignores `?rung=`.
- **(g) Frame-level localisation.** As with W129's headless player, the
  live PLAY surfaces the first divergent 250-frame WINDOW, not the single
  frame (frame-level needs the live trace, which a `.replay` does not
  carry). Say so in the banner, do not imply finer.

---

## 8. OUT OF SCOPE

- A savestate (the `.replay` is a history, not a moment; `NOTES-replay.md`
  "What it is NOT").
- "Verify while you play" (a shadow Game running alongside the user's own
  run). That is a different feature; the playback case reuses the visible
  Game as the verify target and needs no shadow.
- bundling the ladder / shipping recorded `.replay`s in dist/ (W131/132 are
  page features; any fixture stays gitignored under `tools/oracle/out/`).
- Sound / slowdown (Phase 5). REC/PLAY touches neither.
