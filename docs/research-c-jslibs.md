# RESEARCH-C — Reusable JS building blocks for rendering & audio

Status legend: **[V]** = verified (fetched the repo / LICENSE / actual source and read it).
**[I]** = inferred from docs or secondary sources, not confirmed against code.

Date: 2026-07-26. Target: vanilla ES modules, static file server, no bundler, Node 20 / Windows dev.

---

## 0. Decision summary

| Subsystem | Decision | What / where | Why |
|---|---|---|---|
| **Scanline compositor (A)** | **BUILD OURSELVES** | ~300 LOC plain JS, no deps | Measured 0.69 ms/frame in V8 for the full DMG feature set (§4). Nothing on the market implements DMG semantics (8×16 OBJ, signed `$8800` indices, BGP/OBP per scanline, OAM-index priority). Every candidate is an emulator monolith. |
| **APU synthesis (B)** | **BUILD OURSELVES — hand-port `minigb_apu.c`** | https://github.com/deltabeard/minigb_apu — **MIT** [V] | 390 lines of integer C, complete DMG APU, no floats, designed to emit N samples per call. Direct 1:1 transcription target for an AudioWorkletProcessor. Nothing shippable exposes a drive-the-channels-directly API. |
| **APU runtime architecture** | **ADOPT the pattern (not the code) from `shamblesides/apu`** | https://github.com/shamblesides/apu — **BSD-3-Clause** [V] | Its `gb.worklet.js` is a proven blueprint: sequencer + APU both live inside the AudioWorklet, main thread only posts control messages. Exactly matches our "59.36 Hz timer IRQ independent of the frame loop" requirement. Vendorable as-is if we want a fallback (`npm i apu`, prebuilt `dist/apu.mjs`, wasm inlined as base64 — no clang needed). |
| **Tile → ImageData rendering** | **BUILD OURSELVES** | `Uint32Array` view over `ImageData.data.buffer` + `putImageData` | No permissive JS library does indexed-palette tile compositing. Hand loop measured at 4.1% of a 60 Hz budget. WebGL is unjustified at 23,040 px. |
| **Pixel-art scaling / display** | **ADOPT the standard recipe, no library** | MDN *Crisp pixel art look* — https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look [V] | Two CSS lines + integer scale factor. Any library here is pure overhead. |
| **DMG-style JS game framework** | **DOES NOT EXIST** | — | Four separate searches returned nothing. GB Studio compiles to real GB hardware (C/GBDK), not a JS runtime. |

**Net: we vendor zero runtime dependencies.** We transcribe one MIT C file and copy one architectural pattern.

---

## 1. Emulator survey — PPU / APU separability & licensing

| Project | License | Verified? | Language | APU separable? | PPU separable? | Verdict |
|---|---|---|---|---|---|---|
| **deltabeard/minigb_apu** | **MIT** (header of `minigb_apu.c`: *"minigb_apu is released under the terms of the MIT license"*, © 2019 Mahyar Koshkouei, © 2017 Alex Baines) | **[V]** read full source | C, 13 KB / ~390 LOC | **Yes — it IS the standalone APU** | n/a | **PORT THIS.** See §2. |
| **baines/MiniGBS** (upstream of the above) | **MIT** (© 2017 Alex Baines) | **[V]** read LICENSE | C | Yes (.gbs player) | n/a | Upstream provenance confirms clean MIT chain. |
| **shamblesides/apu** | **BSD-3-Clause** (© 2020 Nigel Nelson) | **[V]** read LICENSE + `lib/index.ts` + `lib/gb.worklet.js` + `lib/gb.c` | TS + C→wasm | **Yes** — worklet takes `{type:'write', layer, register, value}` messages → `gb_sound_w()` | n/a | **Steal the architecture.** Optionally vendor `dist/apu.mjs`. See §2.3. |
| **shamblesides/apu-legacy** (npm `gameboy-sound`) | **MIT** (© 2010-2019 Nigel Nelson & Grant Galitz) | **[V]** read LICENSE + `lib/APU.js` | Pure JS, 12 KB | Yes, function-based API | n/a | **REJECT for our use.** Built on `AudioBufferSourceNode` + `OfflineAudioContext` pre-rendering, depends on `big.js`, and the source carries `// TODO: WTF?? WHY??` on a magic `/512`. Cannot be driven live at 59.36 Hz. Its LFSR-table and duty-string code is still worth reading (§5.2). |
| **binji/binjgb** | **MIT** (© Ben Smith) | **[V]** read LICENSE + `src/` listing | C → wasm | **No** | **No** | `src/emulator.c` is a single **175 KB** file containing CPU+PPU+APU+MBC. Excellent *reference*, zero separability. |
| **LIJI32/SameBoy** | **Expat (= MIT)**, with an exception for `iOS/`. GitHub reports `NOASSERTION` because of that exception. | **[V]** file listing; license form **[I]** from project docs | C | `Core/apu.c` = **105 KB** | `Core/display.c` = **95 KB** | **Ground-truth reference only.** Cycle-accurate, CGB-aware, quirk-laden. Far too much for a game that never uses length/sweep. |
| **torch2424/wasmboy** | **GPL-3.0-or-later** | **[V]** fetched `LICENSE` *and* `package.json` (`"license": "GPL-3.0-or-later"`) | AssemblyScript → wasm | — | — | **BLOCKED.** README/blog posts claiming "Apache 2.0" are wrong; the LICENSE file and package.json both say GPL-3. Do not touch. |
| **taisel/GameBoy-Online** | `GameBoyCore.js` header says **MIT** (© 2010-2016 Grant Galitz). **No repo-level LICENSE file.** | **[V]** read the file header + repo listing | JS | No — `GameBoyCore.js` is **350 KB**, one class | No | Widely mis-cited as GPL-2; the actual source header is MIT. Still unusable: monolith. Its descendants (`apu-legacy`) inherit the MIT grant. |
| **danShumway/serverboy.js** | **GPL-2.0** | **[V]** GitHub API `spdx_id` | JS | Exposes raw PCM out | Exposes raw pixels | **BLOCKED** by license, and it's a Galitz fork anyway. |
| **juchi/gameboy.js** | **MIT** (© 2015 Julien Chichignoud) | **[V]** read LICENSE + `src/display/gpu.ts` | TS | `src/sound/` exists | `src/display/gpu.ts`, 13 KB, genuinely per-scanline | **Closest permissive JS PPU.** Rejected: it reads through `cpu.memory.vram()` function indirection, has no window layer (`// TODO draw a line for the window here too`), no per-scanline palette latching, and README admits sprite glitches. Rewriting it costs more than writing ours. Worth reading `drawScanLine` for structure. |
| **roblouie/gameboy-emulator** (TS) | **NO LICENSE** (GitHub API returns no `spdx_id`; `/LICENSE` 404s) | **[V]** | TS | `gameboy.apu` | `gameboy.gpu` | **BLOCKED** — unlicensed = all rights reserved. Do not vendor. |
| **mmitch/gbsplay** | **GPL v1 or later** (README, © 2003-2025 Tobias Diedrich) | **[V]** read README license section | C | Yes | n/a | **BLOCKED.** |
| **aselker/gameboy-sound-chip** | **GPL-3.0** | **[V]** | **Verilog** | n/a | n/a | **BLOCKED** and it's an FPGA design, not software. |
| **megamarc/Tilengine** | **MPL-2.0** | **[V]** GitHub API `spdx_id` | C (+ emscripten) | n/a | Scanline renderer, indexed palettes, per-raster callback | The only structural match for requirement A — but it's a SNES/Genesis model (per-tile palette selectors, layers), not DMG (BGP register, signed `$8800`, 8×16 OBJ, OAM priority). Adapting it + shipping a wasm blob + MPL file-level copyleft > writing 300 lines. **Rejected.** |
| **hUGEDriver / hUGETracker** | **Public domain** | **[I]** from README | Z80 asm / Pascal | Driver is GB assembly | n/a | No JS/web playback code exists. Nothing reusable. |

### Things that do not exist (searched, confirmed negative)
- A permissively-licensed standalone JS/WASM **DMG PPU** module. [V] — every hit is an emulator monolith.
- A JS **DMG-style game framework** with the tile/sprite/palette model. [V] — 4 distinct searches, nothing.
- A **JS hUGEDriver / GBS player** that isn't GPL. [V]
- A lightweight **indexed-palette tile→ImageData** JS library. [V] — nearest hits are PixiJS Tilemap (WebGL sprite batcher, wrong model) and Tilengine (C).

---

## 2. APU: the plan

### 2.1 Why not adopt anything

The whole market splits into two shapes, neither of which is what we need:

1. **Register-write emulator cores** (binjgb, SameBoy, `shamblesides/apu`, minigb_apu). Driven by `write(addr, val)`.
2. **Note-level pre-renderers** (`apu-legacy`). Schedule a whole track ahead of time into an `OfflineAudioContext`.

Our sequencer is a *port of the game's own driver*, which itself writes `NR10-NR51` at 59.36 Hz. So shape (1) is actually the right interface — we just need it callable **inside the audio thread**, driven by our tick, not by a VGM file. `minigb_apu` is shape (1) at a size we can read in one sitting.

### 2.2 Recommended architecture

```
main thread (rAF, 60 Hz)                  audio thread (AudioWorklet)
  game logic / PPU                          ┌──────────────────────────────┐
  postMessage({cmd:'sfx', id})  ─────────►  │ command ring (matches $C6FB) │
  postMessage({cmd:'bgm', id})              │            ↓                 │
                                            │ ported sound driver          │
                                            │   ticked at exactly 4096/69  │
                                            │            ↓                 │
                                            │ writeReg(NRxx, v)            │
                                            │            ↓                 │
                                            │ DMG APU (ported minigb_apu)  │
                                            │            ↓ 128 frames      │
                                            └──────────► outputs[0][0/1]   │
```

The sound driver **must** live in the worklet, not on rAF. `docs/00-MASTER-REFERENCE.md:49` and `docs/recon-4-audio.md:555` establish that the original ticks on the Timer IRQ *independent of the frame loop*. Running it on rAF would be both less faithful and jittery.

**Exact tick timing** — 59.36 Hz is `4096/69` Hz exactly, and at any sane sample rate that is a clean rational. Use an integer accumulator, never floats:

```js
// in the worklet, once
const TICK_NUM = 4096;              // tick rate numerator
const TICK_DEN = 69 * sampleRate;   // 48000 -> 3_312_000  (808.59375 samples/tick)
let acc = 0;

// per output sample
acc += TICK_NUM;
while (acc >= TICK_DEN) { acc -= TICK_DEN; soundDriverTick(); }
```

### 2.3 Fallback / de-risking option

If the port stalls, `npm i apu@0.3.0` ships a prebuilt `dist/apu.mjs` (single ES module, wasm base64-inlined, ~9 kB gzip, BSD-3) that needs **no clang/LLVM/binaryen** despite what its README implies — the toolchain is only for rebuilding. Its worklet already accepts raw register writes:

```js
node.port.postMessage({ type: 'write', layer: 0, register: 0x14, value: v });  // 0x14 = NR50
```

Register offsets are `addr - 0xFF10`. We would have to fork it to move our sequencer inside the worklet (posting ~10-30 messages per 16.8 ms from the main thread is workable but adds main-thread-scheduling jitter to music timing — not acceptable for BGM, fine for SFX).

### 2.4 Simplifications we get to make

Per the brief (game never uses length counters, sweep, or zombie envelopes) we can delete, relative to `minigb_apu.c`:

- `update_len()` + all `len.*` state and the `len_max`/`inc` math — **~25 LOC gone**
- `update_sweep()` + all `sweep.*` state, and the NR10 branch of `chan_trigger` — **~35 LOC gone**
- The zombie-mode block in the `0xFF12/0xFF17/0xFF21` write case — **~15 LOC gone**
- `minigb_apu_audio_read()` and the `ortab[]` — nothing reads back

That's roughly a **380 → 250 line** port.

---

## 3. AudioWorklet: verdict and gotchas

**Verdict: AudioWorklet. Not ScriptProcessor, not pre-rendering.**

- ScriptProcessorNode is deprecated, runs on the main thread, and its glitching is the exact failure mode we'd hit while the game loop is also on the main thread. [V, MDN + Chrome dev blog]
- Pre-rendering (the `apu-legacy` approach) cannot work: our SFX are triggered by gameplay and the BGM is register-driven, so there is no track to render ahead of time.
- AudioWorklet is **Baseline Widely Available since April 2021**; Safari shipped it natively in **14.1 (macOS) / iOS 14.5**. [V, MDN + release history] The old `standardized-audio-context` note that "Safari's AudioWorklet is a ScriptProcessor internally" refers to that polyfill's own shim, not to modern Safari.

### Gotchas, with mitigations

| Gotcha | Detail | Mitigation |
|---|---|---|
| **Module loading** | `audioWorklet.addModule(url)` needs a real URL. Worklets permit **static `import`** but **`import()` throws by spec**. Firefox only gained worklet ESM support in **114**. [V] | Ship the worklet as **one self-contained `.js` file with zero imports.** Duplicating a couple of small tables is cheaper than the compat matrix. Works on a bare static server. |
| **Sample rate** | Worklet global `sampleRate` is the context rate and never changes. iOS reports 44100 on older devices, 48000 on newer; passing `{sampleRate: 48000}` to the constructor is unreliable on Safari. [V/I] | **Never hard-code 48000.** Derive everything from the `sampleRate` global (see the `TICK_DEN` snippet). Our APU is rate-agnostic by construction. |
| **Autoplay policy** | Context starts `suspended` until a user gesture. | Call `ctx.resume()` from the first keydown/click; also `suspend()`/`resume()` on `visibilitychange` (pattern lifted verbatim from `apu/lib/index.ts`, §5.4). |
| **No `console.log` in Safari worklets** | [I] | Debug via `port.postMessage`. |
| **Render quantum** | Always 128 frames on native impls, but don't assume it. | Loop `for (let off = 0; off < out.length; off += 128)` — `apu/lib/gb.worklet.js` does exactly this. [V] |
| **iOS silent switch** | Web Audio is muted by the hardware ringer switch. | Known limitation; document it, don't fight it. |

---

## 4. Rendering: measured performance

I wrote and ran a realistic DMG compositor in Node 20.17 (V8 — same engine as Chrome) covering the **full** feature set from the spec: BG with per-scanline SCX/SCY, signed `$8800` tile indices, 32×32 map wrap, window layer, 8×16 sprites with 10-per-line selection, X/Y flip, behind-BG priority, reverse-OAM-order compositing, and per-scanline BGP/OBP0/OBP1.

```
full frame (BG + window + 40 sprites/10-per-line + per-scanline palettes): 0.689 ms/frame
  => 4.1% of a 60Hz frame budget
  => 1452 fps if rendering were the only cost
full VRAM tile re-decode (384 tiles): 0.184 ms
```

**[V] — script committed at `tools/bench-compositor.mjs`; run `node tools/bench-compositor.mjs`. Measured, not estimated.** The number is conservative: the benchmark allocates a 4-element palette LUT array *per scanline*, which real code would hoist.

Implications:

1. **Per-scanline register changes are free.** 36 raster splits/frame cost nothing measurable — we re-read `scx[y]`/`bgp[y]` every line unconditionally rather than tracking split boundaries. Simpler *and* fast.
2. **WebGL is unjustified.** At 23,040 pixels the bottleneck is neither fill nor upload. `putImageData` of a 160×144 ImageData is a ~92 KB memcpy. The famous `putImageData` slowness is about *large* canvases and about `getImageData`, neither of which applies.
3. **Full VRAM re-decode is 0.18 ms** — so we don't even need dirty-tracking on the tile cache for correctness, only as an optimisation. Decode on write is still preferred, but this is a cheap safety net.

### Rendering recipe

```js
// once
const img  = ctx.createImageData(160, 144);
const px32 = new Uint32Array(img.data.buffer);   // write one u32 per pixel, not 4 bytes
const SHADE = new Uint32Array([0xff9bbc0f, 0xff8bac0f, 0xff306230, 0xff0f380f]); // ABGR, LE

// per frame: fill px32, then
backCtx.putImageData(img, 0, 0);                 // 160x144 backing canvas
displayCtx.imageSmoothingEnabled = false;
displayCtx.drawImage(backCanvas, 0, 0, 160*S, 144*S);
```

`putImageData` **ignores the canvas transform** [V, MDN] — that's why the intermediate canvas + `drawImage` is mandatory for scaling, not optional. It's also why it's fast.

Byte-order caveat: `0xff9bbc0f` as a `Uint32` on a little-endian machine lays out as R=`0x0f` G=`0xbc` B=`0x9b` A=`0xff`. Verify the constants against a screenshot once; don't trust the hex reading left-to-right.

---

## 5. Code worth stealing

### 5.1 Duty cycles as an 8-bit mask (`minigb_apu.c`) [V] — MIT
Avoids a 4×8 table and a 2-D index:
```c
const uint8_t duty_lookup[] = { 0x10, 0x30, 0x3C, 0xCF };  // 12.5% 25% 50% 75%
c->square.duty = duty_lookup[val >> 6];          // from NR11/NR21 bits 7-6
...
c->square.duty_counter = (c->square.duty_counter + 1) & 7;
c->val = (c->square.duty & (1 << c->square.duty_counter)) ? HI : LO;
```
Cross-checked against gbdev.gg8.se: `00000001 / 10000001 / 10000111 / 01111110`. [V]

### 5.2 Noise: divisor LUT + LFSR (`minigb_apu.c`) [V] — MIT
```c
const uint32_t lfsr_div_lut[] = { 8, 16, 32, 48, 64, 80, 96, 112 };   // NR43 bits 2-0
freq = DMG_CLOCK_FREQ / (lfsr_div_lut[c->noise.lfsr_div] << c->freq); // c->freq = NR43 >> 4

c->noise.lfsr_reg = (c->noise.lfsr_reg << 1) | (c->val >= HI);
c->val = !(((c->noise.lfsr_reg >> 14) & 1) ^ ((c->noise.lfsr_reg >> 13) & 1)) ? HI : LO;  // 15-bit
c->val = !(((c->noise.lfsr_reg >>  6) & 1) ^ ((c->noise.lfsr_reg >>  5) & 1)) ? HI : LO;  //  7-bit
```
Left-shifting formulation; equivalent to the canonical right-shift one. Divisor table matches gbdev.gg8.se exactly. [V]
Watch: `if (c->freq >= 14) c->enabled = 0;` — NR43 shift values 14/15 are invalid on hardware. Our driver writes NR43 verbatim from note data (`recon-4-audio.md:536`), so **keep this guard**.

The `apu-legacy` (MIT) precomputed-table variant, if you'd rather build the sequence up front:
```js
for (let i = 0, lfsr = 0x7FFF; i < 0x8000; ++i) {
  table[i] = (lfsr & 1) ? -1 : 1;
  lfsr = (lfsr >> 1) | ((((lfsr >> 1) ^ lfsr) & 1) << 14);
}
```

### 5.3 Sub-sample averaging — the anti-aliasing trick [V] — MIT
This is the single most valuable thing in `minigb_apu.c`. Rather than point-sampling the square wave (which aliases horribly at high note frequencies), it accumulates the *time-weighted* average of every wave transition that falls inside one output sample:
```c
while (update_freq(c, &pos)) {                       // steps to next duty edge
    c->square.duty_counter = (c->square.duty_counter + 1) & 7;
    sample += ((pos - prev_pos) / c->freq_inc) * c->val;   // weight by fraction of sample
    c->val = (c->square.duty & (1 << c->square.duty_counter)) ? HI : LO;
    prev_pos = pos;
}
sample += c->val;
sample *= c->volume;
```
Port this faithfully. Getting it wrong is what makes naive JS chiptune synths sound gritty.

### 5.4 Worklet bootstrap with an inlined Blob (`apu/lib/index.ts`) [V] — BSD-3
Sidesteps `addModule` path/CORS issues and worklet-ESM compat entirely:
```js
const blob = new Blob([workletSource], { type: 'application/javascript' });
await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
const node = new AudioWorkletNode(ctx, 'gameboy-processor', { outputChannelCount: [2] });
```
Plus the visibility handling, which is correct and worth copying verbatim:
```js
if (document.visibilityState === 'visible') audioContext.resume();
document.addEventListener('visibilitychange', () =>
  document.visibilityState === 'visible' ? audioContext.resume() : audioContext.suspend());
```
Note: a Blob-URL worklet **cannot** use relative static imports. If you go this route, one self-contained string.

### 5.5 Signed `$8800` tile addressing (ours, from the benchmark)
```js
let idx = bgMap[tileRow * 32 + tileCol];
if (signedTiles) idx = 256 + ((idx << 24) >> 24);   // sign-extend, rebase to tile 256
```

### 5.6 Sprite priority without a per-pixel priority buffer (ours)
Lowest OAM index wins ⇒ just composite in **reverse** OAM order and let later writes lose:
```js
for (let si = nsp - 1; si >= 0; si--) { ... }        // nsp <= 10, already in OAM order
```
Behind-BG needs one bit per pixel of BG state, not a full priority map:
```js
if (behind && !lineIsBg0[px]) continue;              // lineIsBg0[x] = (bgColorIndex === 0)
```

---

## 6. Scaling & display

Two rules, no library.

```css
canvas#screen {
  image-rendering: pixelated;   /* fall back: crisp-edges, -webkit-optimize-contrast */
  width:  640px;                /* 160 * 4 — INTEGER multiple only */
  height: 576px;                /* 144 * 4 */
}
```
```html
<canvas id="screen" width="160" height="144"></canvas>
```

- Keep the canvas **backing store at 160×144** and let CSS scale it. Do *not* size the backing store by `devicePixelRatio` — you'd be upscaling in JS and then again in CSS.
- **Integer scale factors only.** MDN is explicit: non-integer mapping between CSS pixels and device pixels makes some source pixels render larger than others. Compute `S = Math.max(1, Math.min(vw / 160, vh / 144) | 0)` and letterbox the remainder. [V]
- Non-integer `devicePixelRatio` (browser zoom at 110 %, some Windows laptops at 125 %/150 %) will still produce uneven pixels. MDN calls this unsolvable in the general case. [V] Accept it; the alternative (rendering at `160*S*dpr` and rounding) trades unevenness for blur.
- If you ever scale with `drawImage` instead of CSS, set `imageSmoothingEnabled = false` on the destination context — `image-rendering` does not affect `drawImage`.

---

## 7. Sources

- minigb_apu (MIT) — https://github.com/deltabeard/minigb_apu — `minigb_apu.c`, `minigb_apu.h` read in full
- MiniGBS (MIT) — https://github.com/baines/MiniGBS
- shamblesides/apu (BSD-3) — https://github.com/shamblesides/apu — `lib/index.ts`, `lib/gb.worklet.js`, `lib/gb.c`, LICENSE, package.json
- shamblesides/apu-legacy, npm `gameboy-sound` (MIT) — https://github.com/shamblesides/apu-legacy — `lib/APU.js`
- binjgb (MIT) — https://github.com/binji/binjgb
- SameBoy (Expat + iOS exception) — https://github.com/LIJI32/SameBoy
- wasmboy (**GPL-3.0-or-later**) — https://github.com/torch2424/wasmboy
- GameBoy-Online (MIT per file header, no LICENSE file) — https://github.com/taisel/GameBoy-Online
- gameboy.js (MIT) — https://github.com/juchi/gameboy.js
- serverboy.js (**GPL-2.0**) — https://github.com/danShumway/serverboy.js
- gbsplay (**GPL-1.0+**) — https://github.com/mmitch/gbsplay
- Tilengine (MPL-2.0) — https://github.com/megamarc/Tilengine
- Pan Docs / gbdev wiki, sound hardware — https://gbdev.gg8.se/wiki/articles/Gameboy_sound_hardware
- MDN, AudioWorkletGlobalScope — https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope
- MDN, putImageData — https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
- MDN, Crisp pixel art look — https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look
- Chrome for Developers, Audio Worklet design pattern — https://developer.chrome.com/blog/audio-worklet-design-pattern/
- Bugzilla 1572644, "Support import in worklet scripts" — https://bugzilla.mozilla.org/show_bug.cgi?id=1572644
