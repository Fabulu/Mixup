// THE PAGE.  (wave 7; the wave-6 `web/app.js` moved here so `build-dist.mjs`
// publishes it -- that script copies `games/<id>/src`, and a module under
// `web/` would have been left behind, which is a black page and no message.)
//
// WHAT IS SIMULATED AND WHAT IS REPLAYED, stated here because a picture cannot
// say it, and printed on the page itself because a reader will not open this
// file.  WAVE 9 CORRECTED THIS LIST: it used to say "options" under SIMULATED
// and it was not true (07-review.md D1, and a play report that saw the two pods
// detach as a cluster).  If you change what the page shows, change this list in
// the same commit; a stale note here has misled somebody every time.
//
//   SIMULATED, live, from the port's own code:  the seven-call main loop, the
//     frame counters and their three masks, the ISR model and its (A) gate, the
//     input mirrors and edges, the frame-sync governor, the object driver with
//     its work budget, and THE SHIP -- position, velocity, tilt, clamps and
//     speed modes.  That is wave 4's port; wave 12 added THE OPTION OBJECT
//     $24C096 and the ship's own draw block $24A482, so the two pods and the
//     ship's five attached records are computed too.  MEASURED: 0 divergent
//     frames over 2,200 logic frames of `fly-around` on 66 compared columns --
//     `OPTION_COLUMNS` among them, which wave 4 had to exclude and said so.
//     The four hitbox words $8103F6..$8103FD are compared for the first time
//     as well; the port had been writing them under the name `animB` since
//     wave 4, believing they were animation.
//
//     ONE COLUMN IS STILL RED AND IT IS NOT THIS WAVE'S: `scroll` ($813176)
//     diverges at lf2321 because its writer is inside the unported background
//     object -- verified pre-existing by 11-review.md §4b, and W14's.
//
//   REPLAYED, from a board capture:  the HUD text and the palette still come
//     out of `assets/capture.bin` -- 161 consecutive frames of the `fly-around`
//     scenario, the same window wave 4 compares -- and loop.
//
//     WAVE 37 TOOK THE RECORDED SPRITES OFF THE SCREEN, and that is an OWNER
//     DECISION rather than a consequence of finishing: "we have to get rid of
//     the recorded enemies, they look retarded", then "go removal first"
//     (`39-OWNER-visible-play-before-sound.md`).  The reason is a finding in
//     itself: the capture is 161 frames, stage 1 is 7,317 logic frames, and
//     since wave 13 the BACKGROUND's motion is COMPUTED.  A 161-frame sprite
//     loop replayed against a 7,317-frame computed scroll agrees at the start
//     and drifts after, which is exactly what was reported from play.
//
//     So `Demo.draw()` now strips `st.spritebuffer` to the eight
//     player-attached records (`stripToAttached`, below).  MEASURED over all
//     161 frames of the shipped bundle: 7,671 display-list records -> 886,
//     8.99 % of pixels changed, no throw.  THE LAYER IS EMPTY, NOT WRONG:
//     nothing on the screen is a recorded enemy, and every enemy that appears
//     from here is the port's own.  The strip is in the PAGE and must not move
//     into `tools/export-web.mjs` -- see `stripToAttached`'s header.
//
//     THE BACKGROUND LAYER IS NO LONGER AMONG THEM AT ALL.  Wave 13 made its
//     MOTION the port's; WAVE 14 made its PIXELS the cartridge's.  All 1,820 BG
//     tiles the 224 scrolling map columns of stage 1 reference are exported,
//     plus the 205 the second map at $227AF8 references, in EIGHT SHARDS.  The
//     page fetches shards 0 and 1 before the first frame and queues the rest;
//     the scroll VM's own column cursor promotes whichever one is next.  What
//     the recording still supplies for the background is the ring's initial
//     contents (`bgSeed`, 63 columns the board wrote before the recording
//     started) and the PALETTE.
//
//     **WAVE 90 CORRECTED THIS PARAGRAPH, AND THE CORRECTION IS THE POINT.**
//     It used to end: "the cartridge's own palette block IS shipped and checked
//     (1020 of its 1024 entries equal the board's), but four entries (bank 21
//     pens 0..3) are ANIMATED by an unported routine, so the capture's palette
//     is still what draws."  [M] **Both numbers are exactly right -- 1020 of
//     1024, and the four ARE bank 21 pens 0..3 -- and the paragraph still
//     misled**, because it never said WHICH palette.  $227E58 is 1,024 words
//     and $2415E8 uploads it into palette RAM **$400..$7FF, the BACKGROUND
//     third**.  It contains no sprite entry at all.
//
//     **AND W91 PORTED THE SPRITE PALETTE, WHICH IS WHAT THAT PARAGRAPH WAS
//     FOR.**  W90 ended here: "the SPRITE palette ($000..$3FF) has no
//     cartridge source in this bundle ... $24150A is a COUNTED NOTE in seven
//     files and has never executed."  Both sentences were true and neither is
//     any more.  `src/palette.js` models the three staging areas, the three
//     dirty flags and `$24133C`, the once-a-frame upload that is the ONLY
//     writer of palette RAM on this board; `$24150A` executes from the scroll
//     VM's object stream and from both bomb heads.
//
//     WHAT THAT BUYS, [M] on the shipped seed: **19 of the 32 sprite banks,
//     608 of the 1,024 sprite entries, come out of the cartridge** -- 18 of
//     them replayed from the stage's own object stream at boot
//     (`catchUpObjectStream`) and **bank 6, THE BOMB'S, installed by
//     `$260852`/`$26085C` the moment a bomb is dropped**.  [M] the 18 agree
//     with the board's own palette RAM on **576 of 576** entries.
//
//     **WAVE 92 TOOK THE BACKGROUND THIRD AND THE FOUR ENTRIES THIS WHOLE
//     PARAGRAPH HAS BEEN ABOUT SINCE W14.**  The block above was shipped and
//     never uploaded; [M] `$2611C4 moveq #$0,D0 / moveq #$1F,D1 / jsr $2415E8`
//     inside the scroll VM's per-stage init uploads all 32 banks of it, and
//     `catchUpBgPalette` replays that one call.  It takes NOTHING from the
//     recording: both counts are immediates and the block is
//     `$261252[$813096]`.  [M] the 1,024 words it writes are identical to the
//     staging the seed carries and equal the board's own `$A00800` on **1,020
//     of 1,024 statically -- and on 1,024 of 1,024, all four animated entries
//     included, once the port is stepped** (`92-impl` §4.2).
//
//     **AND THE FOUR ARE `$241404`, THE TAIL OF `$24133C` ITSELF** -- the one
//     routine on this board that writes palette RAM without a staging area.  It
//     reads `$80F086+$540`, scales each channel through `$246292` by a level
//     that ping-pongs between `$18` and `$3C`, and writes `$A00800+$540`.  That
//     is why the block kept agreeing on 1,020 and why nobody found the rest.
//
//     [M] SO THE LEDGER AT BOOT IS **1,600 of 2,560 palette words CARTRIDGE-
//     SOURCED: sprites 576/1,024, background 1,024/1,024, text 0/240**, and the
//     page prints it by third every frame.  W92 also threaded a `PaletteState`
//     down to the enemy init bodies, so the MIDBOSS, the BOSS and types
//     $24/$31 install their own eleven banks live: [M] 1,760 of 2,560 and 23 of
//     32 sprite banks after 6,500 steps of stage-1 flight.
//
//     **WAVE 93 TOOK 160 OF THE TEXT STRIP'S 240 WORDS**, ten of its fifteen
//     banks, and it took them on two warrants rather than on a byte match.
//     Banks 0..4 come from the RESET PATH (`$23BF86..$23BFCC`, straight-line
//     inside `$23BEEA`, which both `$23B7D8` and `$23B7F2` jmp to) and every
//     site in the image that can write those banks writes the same block, so
//     the answer cannot depend on which one ran.  Banks 0..8 and 11 come from
//     `$2605C8`, type $0A's state-0 init -- and [M] the seed's own `$80E240`
//     slot 0 reads type $0A, STATE $01, priority $1F, which is the cartridge
//     saying in its own RAM that the routine executed.  [M] 160 of 160 equal
//     the board's palette RAM on all 161 recorded frames.
//
//     **WHAT IS STILL THE RECORDING'S: 80 words of the TEXT strip (banks 9,
//     10, 12, 13, 14) and nine sprite banks (0..9 less 6), AND THE PAGE SAYS SO
//     EVERY FRAME.**  [M] W93 measured that NO routine in the cartridge
//     reproduces those nine sprite banks: six of them (2, 4, 5, 7, 8, 9) have
//     no call site anywhere that names the block the seed carries, and the
//     three that do (0, 1, 3) sit inside straight-line routines that contradict
//     the seed on their OTHER installs -- `$24A764` on 1 of its 2 banks,
//     `$25BE72` on 3 of its 5 -- so no ordering of them produces this seed.
//     They are refused rather than fabricated, and `93-impl` §3 is the proof.
//     `mergePalette` starts from the capture and overwrites only what a ported
//     install sourced, so a bank nothing has sourced stays visibly on the
//     recording instead of silently becoming zeroes; the status line prints
//     `pal N/2560 cart [spr .. bg .. tx ..] banks ...` and what is missing is
//     named in `92-impl` §5 with the call site each piece needs.
//
//     A SHARD THAT HAS NOT LANDED IS NAMED, NEVER BLACK.  Tiles whose shard is
//     still in flight are drawn as the transparent pen and the shard number
//     goes on the status line; a shard that FAILED to load throws an
//     AssetError naming the shard and the file the moment a frame needs it.
//     The report this wave came out of was a silent black screen.
//
//   PRODUCED (wave 12), and written into the replayed list:  EIGHT display-list
//     records are now COMPUTED every frame rather than relocated -- the ship
//     ($24A538), its invulnerability aura ($24A532), its exhaust glow
//     ($24A632, which goes through the $500000 protection latch), the two
//     option pods ($24D12E x2 out of $24C096) and the three ground shadows
//     ($249EE2 for the ship, $24C438/$24C470 for the pods).  Every byte of all
//     eight is gated by `pgm.py shipgate` against the board's own staged bucket
//     bytes AND against the display-list entries they become: 0 divergent
//     frames over 2,200 logic frames of `fly-around`, with ten red-validated
//     mutations.  THE SHIP BANKS: `manifest.ship.pairs` is the 17 rebased
//     animation pairs the exporter now emits, 16 of which are not in the
//     capture at all because the recorded ship never tilted.
//
//     WHAT THE RECORDING STILL SUPPLIES FOR THEM is WHICH SLOT each occupies.
//     That is not a property of the ship: the port cannot build the whole list
//     until the other 26 buckets have producers, so its records are written
//     into the recorded one at the slots the wave-9 conditional matcher finds.
//
//   W158 SOUND: Game's live four-byte boundary feeds one deferred shared-audio
//     controller and one SoundRuntime. Browser audio is opt-in by gesture; two
//     permanently named hardware details remain approved approximations.
//     Pressing fire runs the ported cadence machine ($249B2C..$249BE2) and the
//     ported spawn and driver, but no shot sprite stream is in the bundle, so
//     what the port computes is INVISIBLE.  The bomb ($249814) and HOLDING fire
//     reach loud named throws.  WAVE 12 MOVED THE HELD-FIRE THROW to the board's
//     own gate: $24C164 `btst #4,($40,A6)`, on the RAW HELD byte $24C134 copies
//     out of the player, entered on the FIRST held frame with no speed-index
//     condition.  Wave 9's throw fired on the fourth held frame and only when
//     the ship was OFF its speed floor, so a player already at the floor held
//     fire and still got silence -- the exact failure it existed to prevent.
//     Those throws are the reason `onError` below is not optional.
//
// THE CADENCE IS THE BOARD'S: 15625/264 Hz = 59.185606060606..., frame period
// exactly 16.896 ms, read from `game.json` where it is spelled once.  The host
// clock decides only HOW MANY logic frames have come due, never what any of
// them computes (`NOTES-replay.md` constraint 1).  Same input word in, same
// frame out, on any machine, at any refresh rate.

import { Game, RAM, MACHINE } from '../main.js';
import { P } from '../machine.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
  parseSpriteList, BUFFER_STRIDE, RAM_STRIDE, SPRITE_LIMIT,
} from '../render/index.js';
import { mergePalette } from '../palette.js';
import { loadBundle, loadSoundAssets, httpReader, gunzip, AssetError } from './assets.js';
import { attachInput, pollInput, currentPortWord } from './input.js';
// W375 -- THE COIN PORT, `$C08004`. Its own import line because it is its own
// PORT: `currentPortWord()` is the inverse of build A's `$13D464` shuffle and
// `currentCoinWord()` is a plain active-low word with no shuffle at all. The
// two must never be mixed (src/web/input.js:126).
import { currentCoinWord, tickCoinPulse, attachCoinKeys, clearCoin } from './input.js';
// W375 -- `COIN.idle` ($FFFF, ACTIVE LOW = nothing pressed) is what the coin
// port is pinned to during `.replay` PLAYBACK. The literal is never written out
// here: it is the cartridge's idle level and it lives with the rest of $13CFBA.
import { COIN } from '../isr.js';
import { AudioController } from '../../../../shared/audio.js';
import { soundRuntimeFromStage1Seed } from '../soundruntime.js';
import { APPROVED_SOUND_POLICIES } from '../soundpolicy.js';
// WAVE 131/132 -- the browser-side replay module.  W131 owns the REC half: the
// `.replay` digest feed + ACCUMULATE-then-hash (SubtleCrypto has no incremental
// update), the recorder arm/stop, and the v1 packaging.  W132 owns the PLAY
// half: `armPlayback` (the verifier that runs on the visible Game) and
// `decodePortinWords` (the u16be inverse).  Imports only browser-safe
// `stateVector`/`CLAIMED` from `../state.js`; does NOT import `tools/replay.mjs`
// (that is a Node tool).
import {
  armRecorder, stopRecorder, b64 as recB64, beBytesFromWords,
  sha256Hex, armPlayback, validateReplay,
  FORMAT as REPLAY_FORMAT, BUILD as REPLAY_BUILD, PERIOD_FRAMES as REPLAY_PERIOD,
} from './replay.js';
import { CLAIMED } from '../state.js';

// --------------------------------------------------------------- PRESENTATION
//
// THE CABINET IS TATE.  MAME's driver declares the screen `rotate="270"` on the
// 448x224 buffer, so the correct picture is 224 WIDE by 448 TALL and the long
// axis of the game is the bitmap's X.
//
// THE ROTATION HAPPENS IN THE PIXEL BUFFER, NOT IN CSS, AND THAT IS THE WHOLE
// TRICK FOR KEEPING THE SCALE INTEGER.  `rotateCCW` writes a 224x448 RGB buffer
// and the canvas's backing store IS 224x448, so the canvas's CSS box is a plain
// axis-aligned rectangle that `fitCanvas` sizes to an exact whole multiple of
// 224x448 in DEVICE pixels.  A `transform: rotate(90deg)` would have put the
// browser's own resampler between the port and the glass -- the transform's
// output box is not the element's layout box, so "the layout box is an integer
// multiple" stops being the same statement as "the painted pixels land on whole
// device pixels", and any transform-origin or sub-pixel offset reintroduces the
// resample.  There is NO transform on the canvas.  Do not add one.
//
// TWO MODES, and only two:
//   tate  224x448, `rotateCCW` applied.  The correct presentation.  DEFAULT.
//   yoko  448x224, the raw board buffer, unrotated.  Offered because a desktop
//         window is wide, and because it is what the gates' PNGs show before
//         `np.rot90`.  It is the game lying on its side; it is a preference,
//         not a correction.
//
// The mode is NOT switched automatically on orientationchange.  A phone tilted
// in a hand would otherwise change what the picture means mid-play, and the two
// modes are different pictures, not two layouts of one.
export const PICTURES = Object.freeze({
  tate: Object.freeze({ w: SCREEN_H, h: SCREEN_W, rotate: true }),
  yoko: Object.freeze({ w: SCREEN_W, h: SCREEN_H, rotate: false }),
});
export const DEFAULT_MODE = 'tate';
export const MODES = Object.freeze(Object.keys(PICTURES));

/** Back-compat: the TATE picture's dimensions, which is what the page had. */
export const CANVAS_W = PICTURES.tate.w, CANVAS_H = PICTURES.tate.h;

// The fly-around scenario's intervention, applied here on the same terms as in
// the comparison: $810424 is the player record's ($3e,A6) invulnerability
// timer, held at $FF from the seed.  $FF is a value the game itself writes at
// $2495A2; it changes WHETHER the ship dies, not what any ported routine
// computes.  Without it a button-free run of this script dies at lf2469 on the
// board (measured, `scenarios.json`).
const LIVE_POKES = Object.freeze([[0x810424, 0xff]]);

/**
 * PURE.  The largest whole scale in DEVICE pixels, for either picture.
 *
 * `image-rendering: pixelated` AND a whole-number scale.  Both are needed: a
 * fractional scale puts the canvas's 1:1 pixels on non-integer device pixels
 * and the browser resamples them.  The Batman port shipped a dithered circle
 * that came out looking like tetris pieces because of exactly this, and it was
 * reported from play.  So this FLOORS -- do not "fix" it into a percentage.
 *
 * It is a separate exported function from `fitCanvas` so it can be TESTED: this
 * is the one piece of the page's layout that is arithmetic rather than CSS, and
 * `tests/web-scale.test.js` drives it at nine device-pixel ratios in both
 * orientations.  The CSS box it returns is `device / dpr`, which is what puts
 * the picture back on whole device pixels; the test asserts the round trip.
 *
 * @param {{w:number,h:number}} pic  PICTURES.tate or PICTURES.yoko
 * @param availCssW,availCssH  the container's size in CSS pixels
 */
export function pickScale(pic, availCssW, availCssH, dpr = 1) {
  const d = dpr > 0 ? dpr : 1;
  const availW = Math.max(0, availCssW) * d;
  const availH = Math.max(0, availCssH) * d;
  // Math.max(1, ...) so a viewport too small for even 1:1 shows 1:1 and
  // overflows rather than showing a resampled sub-pixel picture.
  const scale = Math.max(1, Math.floor(Math.min(availW / pic.w, availH / pic.h)));
  const deviceW = pic.w * scale, deviceH = pic.h * scale;
  return { scale, deviceW, deviceH, cssW: deviceW / d, cssH: deviceH / d };
}

/**
 * Size `canvas` inside `container` for `mode`.  Returns the `pickScale` result.
 *
 * The canvas's BACKING STORE is set by `Demo.setMode`, not here -- this only
 * decides the CSS box.  No transform is ever applied (see PRESENTATION above).
 */
export function fitCanvas(canvas, container = canvas.parentElement,
  mode = DEFAULT_MODE) {
  const pic = PICTURES[mode] ?? PICTURES[DEFAULT_MODE];
  const dpr = window.devicePixelRatio || 1;
  const fit = pickScale(pic,
    container?.clientWidth || window.innerWidth,
    container?.clientHeight || window.innerHeight, dpr);
  canvas.style.width = `${fit.cssW}px`;
  canvas.style.height = `${fit.cssH}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.transform = 'none';        // belt and braces: never a CSS rotate
  canvas.dataset.scale = String(fit.scale);
  canvas.dataset.mode = mode;
  return fit;
}

/**
 * WAVE 14 -- the ROM stream pointer -> the stage-1 map column, or -1.
 *
 * Pulled out of `Demo.streamColumn` as a pure function for the same reason
 * `pickScale` is one: it is the arithmetic that decides WHICH SHARD gets
 * promoted, a wrong answer here is a black stripe forty seconds later, and a
 * method on an unexported class cannot be tested.  `tests/web-page.test.js`
 * §5 is the test.
 *
 * THE -1 IS THE WHOLE POINT.  `$26134E` loads $225B78 + 36*column for the
 * column the scroll VM is painting, but the pointer is ALSO whatever the boss
 * lock rewound it to, and stages 2..5 live in the same address space and are
 * not exported at all.  An address this cannot place must not be turned into a
 * plausible column number -- a plausible column promotes the wrong shard and
 * says nothing.
 *
 * @param {{cols:string, colBytes:number, ncols:number}} map  manifest.gfx.bg.map
 * @param {number} ptr  `game.vram.streamPtr`
 */
export function streamColumnOf(map, ptr) {
  if (!map) return -1;
  const base = Number.parseInt(String(map.cols).replace('$', ''), 16);
  if (!ptr) return -1;                     // 0 = no column written yet
  const off = ptr - base;
  if (off < 0 || off % map.colBytes !== 0) return -1;
  const col = off / map.colBytes;
  return col < map.ncols ? col : -1;
}

/**
 * WAVE 37 -- THE RECORDED ENEMIES COME OFF THE SCREEN.  OWNER'S DECISION:
 * `39-OWNER-visible-play-before-sound.md`, "we have to get rid of the recorded
 * enemies, they look retarded", and then, choosing the order, "go removal
 * first".  Specified by `41-recon-sprite-art.md` §5.1.
 *
 * Keep only the display-list records `cap.attached()[fi]` names -- the ship,
 * its two option pods, its exhaust plume and glow, and the three ground
 * shadows, the eight classes the wave-9 conditional matcher accepts -- compact
 * them to the front, and write the terminator after them.  Everything else in
 * the recording's list is an enemy, an enemy's bullet, an explosion or an item,
 * and every one of those is a RECORDING that no longer agrees with the screen
 * it is drawn on: the capture is 161 frames and stage 1 is 7,317 logic frames,
 * so a short loop is being replayed against a scroll the port now COMPUTES.
 * They were right at the start and drift after; that is what the owner saw.
 *
 * WHY THIS IS IN THE PAGE AND NOT IN `tools/export-web.mjs`, and it is the one
 * place the obvious optimisation is wrong (recon §5.3).  `tools/bundlegate.mjs`
 * renders THE PUBLISHED BUNDLE'S OWN CAPTURE and requires `exact === total` --
 * 100.0000 % pixel-identity to MAME.  Stripping in the exporter would drop that
 * gate to roughly 91 % for entirely the right reason, and the tempting repair
 * would be to weaken the strongest pixel gate this port owns.  `app.js` is on
 * no gate's path -- `bundlegate`, `pixgate` and `webgate` each build their own
 * `Renderer` and their own `st` -- so the strip costs ZERO gate coverage here
 * and would cost the project that gate there.  DO NOT MOVE IT INTO THE DATA.
 *
 * ORDER IS FORCED, NOT STYLISTIC.  `Capture.splice` addresses records by their
 * index in the ORIGINAL list, and `#shipRecord` identifies the ship by its size
 * word among those same indices, so this MUST run AFTER the splice.  Run before
 * it and the splice writes the ship's position into whatever record has landed
 * in the ship's old slot -- the red-validated mutation in the test.
 *
 * Compaction in place is safe because `attached()` is built by walking
 * `parseSpriteList` in order, so the kept indices ascend and the destination
 * never runs ahead of the source.  RELATIVE ORDER SURVIVES, which matters: a
 * higher list index draws IN FRONT on this hardware (`spritelist.js`), and the
 * shadows sit below the ship on 243 of 243 recorded records.
 *
 * The terminator is the hardware's own: `word4 & 0x7fff == 0` ends the list
 * (`spritelist.js`), so the whole eight-word record after the last survivor is
 * zeroed rather than trusting whatever the recording left there.
 *
 * PURE and exported for the same reason `pickScale` and `streamColumnOf` are:
 * a method on an unexported class cannot be tested, and this one decides what
 * the player sees.
 *
 * @param {{spritebuffer: Uint16Array}} st  the renderer's state, POST-splice
 * @param {Array<[number, string, number, number]>} recs  `cap.attached()[fi]`
 * @returns {{kept:number, removed:number}}
 */
export function stripToAttached(st, recs) {
  const buf = st.spritebuffer;
  const S = BUFFER_STRIDE;
  const before = parseSpriteList(buf).length;
  let w = 0, prev = -1;
  for (const [idx] of recs ?? []) {
    // LOUD, NOT QUIET.  Neither of these can happen -- `attached()` walks
    // `parseSpriteList` in order over this same buffer, so its indices are
    // STRICTLY ASCENDING and in range -- and that is exactly why a `continue`
    // would be wrong: it would turn a broken matcher into a ship that silently
    // stops being drawn.  A quiet skip is a defect in its own right on this
    // project, and the check is arithmetic on eight numbers.
    //
    // Ascending is what makes the in-place compaction correct: `idx > prev >=
    // w - 1` gives `idx >= w`, so the destination never runs ahead of the
    // source and no record is overwritten before it has been copied.
    if (idx <= prev || (idx + 1) * S > buf.length) {
      throw new Error(`stripToAttached: attached record ${idx} follows ${prev} `
        + `and must be strictly ascending and inside a ${buf.length}-word `
        + `sprite buffer (writing slot ${w}).`);
    }
    prev = idx;
    if (idx !== w) buf.copyWithin(w * S, idx * S, idx * S + S);
    w++;
  }
  // THE TERMINATOR.  Without it the records after the last survivor are still
  // the recording's and the parser walks straight on into them.
  if ((w + 1) * S <= buf.length) buf.fill(0, w * S, w * S + S);
  return { kept: w, removed: before - w };
}

// =========================================================== WAVE 44 -- E1
//
// THE PORT'S OWN DISPLAY LIST, ON THE SCREEN.
//
// Until this wave `src/main.js:352` was the ONLY mention of `displayList` in
// `src/` or `tools/`: one writer, zero readers.  The port has built a real
// hardware display list at $800000..$8009FF every frame since wave 11 -- main
// loop call #4, `$23D2AE`, ported whole and gated byte-for-byte by `pgm.py
// dlgate` over 1,901 board frames -- and every frame the page threw it away and
// drew the recording's instead.  That single missing edge is why the ported
// enemies were invisible (`40-recon-emission-path.md` §1.2).
//
// TWO THINGS STAND BETWEEN THAT LIST AND A PIXEL, and this is both of them.
//
// (1) THE REMAP.  A record's `offs` field is a CARTRIDGE word offset into
//     `sprmask`.  `tools/export-web.mjs` RE-BASES every shipped stream into a
//     compact 16-bit space so the arrays can be powers of two and
//     `SpriteDrawer` can index them with `& (len-1)`.  So a port record
//     carrying $12D430 indexes the packed array at $12D430 & 16383 and draws
//     somebody else's picture -- MEASURED (`40-recon` §4 step 2): of the 302 ROM
//     offsets the port emits from the page's own seed, 234 are >= 16384 and WRAP,
//     67 land on arbitrary mask data, and exactly ONE (the null stream $000000)
//     coincides with a packed base.  Nothing throws, because the length is a
//     power of two by design.  The map is `manifest.spr.streams`, which
//     `export-web.mjs` has always computed and, until wave 44, discarded.
//
// (2) THE MISS POLICY: EXACT MAP, LOUD MISS, NEVER A FALLBACK.  The shipped
//     sheet is 166 streams harvested from a 161-frame recording; the port asks
//     for whatever stage 1 asks for.  A record whose stream is not in the sheet
//     is NOT DRAWN and its CARTRIDGE ADDRESS is counted and named, on the status
//     line and in `tools/webgate.mjs`'s output.  No modulo, no clamp, no
//     nearest-stream, no "draw it anyway": the entire value of this guard is
//     that a short sheet produces an ADDRESS, which is what makes the next wave
//     a shopping list instead of a hunt.
//
//     AND IT IS A SKIP, NOT A THROW, DELIBERATELY.  This project's rule is that
//     unported paths are LOUD NAMED THROWS, and a reviewer who reads the `skip`
//     below without this paragraph would be right to call it the quiet-return
//     defect HANDOVER §4 forbids.  The rule is about CODE.  This is DATA: a
//     background element with no art would take the whole page down for a
//     picture nobody is asking about, and would make the wave unshippable
//     before the art wave lands.  The honest analogue for missing data is a
//     named skip with a count, and every one of them is printed.
//
//     MEASURED, and this is why the art is a LATER wave and not this one: from
//     the page's own seed the shipped sheet covers the port's emitter
//     COMPLETELY for the first 315 logic frames = 5.32 s -- 16,183 records, 0
//     misses -- and bucket 0, THE ENEMIES, runs 48.49 records per frame over
//     that window at 100.00 % coverage (`43-plan-enemy-layer.md` §1.2,
//     reproduced by this wave in `docs/worklog/ddpdoj/44-impl-E1-render.md`).
//     THAT NUMBER IS A PROPERTY OF THIS SEED and of nothing else: the page boots
//     into the recording's own window and the sheet was harvested from that
//     recording.  A different seed, a from-boot start or a warp has no such
//     grace period, and the misses start immediately.  Say so wherever it is
//     quoted.

/** Every mutation `portSpriteList` can be broken with, and what it breaks.
 *  Declared here for the same reason `displaylist.js MUTATIONS` is: so
 *  `tools/webgate.mjs --break` cannot invent one, and so the whole
 *  red-validation surface is visible in one place. */
export const PORT_LIST_MUTATIONS = {
  'no-remap': 'pass the ROM offset straight through instead of the packed base. '
    + 'The sheet is re-based, so nearly every record then draws the wrong '
    + 'picture -- this must report ~301 of 302 streams missing',
  'drop-one-stream': 'the caller has removed one stream from the map. Its '
    + 'records must be SKIPPED AND NAMED, not drawn from a neighbour',
  'terminate-instead-of-zero-width': 'skip a missing record by zeroing WORD 4 '
    + 'instead of its width field. word4 & $7FFF == 0 is the hardware '
    + "TERMINATOR, so this silently drops the whole list behind the first gap",
  'no-extent-check': 'trust the map and never compare the record\'s '
    + '2 + w*h against the stream\'s length -- the $000000 3x40 case',
  'draw-pending-shard': 'draw a record whose sprite shard has not landed yet. '
    + 'Those words are still ZERO, so the record becomes a solid rectangle of '
    + 'pen 0 -- a picture that is wrong rather than absent, which is the one '
    + 'outcome the whole guard exists to prevent (W47)',
};

/** Checked ONCE, up front, and not lazily inside the record loop: an empty or
 *  immediately-terminated list never reaches a `portMutating` call, so a
 *  misspelled `--break` would run as a CLEAN pass and print green. */
function checkMutation(opts) {
  if (opts.mutate && !(opts.mutate in PORT_LIST_MUTATIONS)) {
    throw new Error(`unknown port-list mutation '${opts.mutate}'; have `
      + Object.keys(PORT_LIST_MUTATIONS).join(', '));
  }
}

function portMutating(opts, name) { return opts.mutate === name; }

/** $800000..$8009FF is 0x500 words: 256 entries x RAM_STRIDE, and the parser
 *  stops at 256 because the hardware does (`spritelist.js`). */
export const PORT_LIST_WORDS = SPRITE_LIMIT * RAM_STRIDE;

/**
 * `manifest.spr.streams` -> `romOffs -> [packedBase, maskWords, shard]`.
 *
 * PURE and exported so it can be tested and so `tools/webgate.mjs` can break it.
 *
 * The LENGTH CHECK is not defensive noise.  Before wave 44 the entries were
 * PAIRS -- `[packedBase, maskWords]` -- and a pair read as a triple would take
 * the packed base for a cartridge address, which is a map that resolves nothing
 * and skips everything: a silently empty screen with a plausible explanation.
 * So an old bundle says so by name instead.
 *
 * WAVE 47 adds the SHARD, and it is derived rather than shipped: each sprite
 * shard owns a contiguous run of the packed mask space (`spr.shards[].maskFrom`
 * / `maskLen`), so the shard is a range test on the base.  `shardOf` is
 * optional -- without it every stream reads as shard 0, which is what a
 * pre-W47 bundle is.
 *
 * @param {object} manifest
 * @param {(base:number)=>number} [shardOf]  usually `bundle.spr.shardOfBase`
 */
export function romToPackedMap(manifest, shardOf = null) {
  const list = manifest?.spr?.streams;
  if (!Array.isArray(list) || !list.length) {
    throw new AssetError('manifest.spr.streams is missing or empty; the page '
      + 'cannot remap the port\'s display list without it. Rebuild: node '
      + 'games/ddpdoj/tools/export-web.mjs');
  }
  if (list[0].length !== 3) {
    throw new AssetError(`manifest.spr.streams entries have ${list[0].length} `
      + 'fields, not 3. This bundle predates wave 44, when the exporter started '
      + 'keeping the CARTRIDGE address alongside the packed one -- without it '
      + 'the port\'s own display list cannot be translated into the sheet\'s '
      + 'address space. Rebuild: node games/ddpdoj/tools/export-web.mjs');
  }
  const m = new Map();
  for (const [rom, base, words] of list) {
    m.set(rom, [base, words, shardOf ? shardOf(base) : 0]);
  }
  return m;
}

/**
 * PURE.  The port's own `$800000` display list, remapped into the packed sheet's
 * address space, ready to hand `renderIndexed` as `st.spritebuffer` with
 * `spriteStride: RAM_STRIDE`.
 *
 * `parseSpriteList` applies the sprite DMA's own word masks (word 1 bit 10,
 * word 2 bit 15 -- `igs023_video.cpp:660-668`), so the RAM list and the post-DMA
 * `:igs023:spritebuffer` parse IDENTICALLY.  That is why this can be a straight
 * copy of main RAM and not a DMA model.
 *
 * HOW A MISS IS SKIPPED, AND WHY IT IS THE WIDTH AND NOT WORD 4.
 * `SpriteDrawer.draw` returns before touching a single ROM word when
 * `wide === 0` (`sprites.js:139`), and `parseSpriteList` terminates only on
 * `(word4 & $7FFF) === 0` (`spritelist.js:46`).  Width is bits 14..9 of word 4
 * and height is bits 8..0, so zeroing the WIDTH of a record that has a non-zero
 * height leaves the terminator test false: the record is skipped and everything
 * BEHIND it still draws.  Zeroing word 4 instead would terminate the list at the
 * first gap and silently drop the rest of the frame, which is the
 * `terminate-instead-of-zero-width` mutation above.
 *
 * A record whose width or height is ALREADY zero is left completely alone: it
 * draws nothing, reads no ROM word and therefore needs no art (the same test
 * `src/web/assets.js verifyCoverage` makes), and zeroing the width of a
 * zero-HEIGHT record would turn word 4 into the terminator.  Those are counted
 * as `blank`, not as misses.
 *
 * THE EXTENT CHECK is the general form of a landmine `43-plan-enemy-layer.md`
 * §1.4 measured: the port emits `offs $000000` -- the null placeholder -- 1,065
 * times at 1x1 AND TEN TIMES AT 3x40, which reads 122 mask words out of a stream
 * the sheet holds 10 words of.  Its packed base is 0, so a map lookup alone
 * would "succeed" and the record would read the next stream's data.  The rule
 * here is `have >= 2 + w*h`, which is exactly the rule `verifyCoverage` already
 * applies to the capture's records, and it covers that case without naming it
 * as a special one.
 *
 * WAVE 47 -- AND THE THIRD OUTCOME: THE ART EXISTS AND HAS NOT ARRIVED YET.
 *
 * The sprite sheet is sharded (`src/web/assets.js SprShards`), so a stream can
 * be in the bundle and still not be in memory.  Those records are skipped THE
 * SAME WAY -- width zeroed, everything behind them still drawn -- but they are
 * counted in `pending` BY SHARD rather than in `missing` by address, because
 * they are two different bugs and they get two different sentences:
 *
 *     NO ART $166840x3        the sheet does not contain this picture
 *     WAITING ON SPR SHARD 1  it does, and 27 KiB of it is in flight
 *
 * and `opts.demand(shard)` is called so the SIMULATION drives the fetch: the
 * shard a record actually asks for jumps to the head of the queue.  That is a
 * better clock than a timer for the same reason `BgShards.followColumn` is
 * (`41-recon-sprite-art.md` §2.5), and it costs nothing to build because the
 * guard was already naming every record it could not draw.
 *
 * A record must NEVER be drawn out of a shard that has not landed: those words
 * are still zero, and a stream of zeroed mask words is a solid rectangle of
 * pen 0 -- a picture that is WRONG rather than absent, which is the one outcome
 * this whole guard exists to prevent.
 *
 * @param {import('../ram.js').Ram} ram  the port's main RAM
 * @param {Map<number,[number,number,number]>} map  `romToPackedMap(...)`
 * @param {{mutate?: string, out?: Uint16Array,
 *          shardReady?: (i:number)=>boolean, demand?: (i:number)=>void}} opts
 * @returns {{words: Uint16Array, records: number, drawn: number,
 *            skipped: number, blank: number, missing: Map<number,number>,
 *            pending: Map<number,number>}}
 */
export function portSpriteList(ram, map, opts = {}) {
  checkMutation(opts);
  const words = opts.out ?? new Uint16Array(PORT_LIST_WORDS);
  for (let i = 0; i < PORT_LIST_WORDS; i++) words[i] = ram.u16(RAM.spriteList + i * 2);

  let records = 0, drawn = 0, skipped = 0, blank = 0;
  const missing = new Map();
  const pending = new Map();
  for (let r = 0; r < SPRITE_LIMIT; r++) {
    const b = r * RAM_STRIDE;
    const w4 = words[b + 4];
    if ((w4 & 0x7fff) === 0) break;                  // the hardware terminator
    records++;
    const wide = (w4 & 0x7e00) >> 9, high = w4 & 0x01ff;
    // Word 2 bits 6..0 are `offs` bits 22..16, word 3 is bits 15..0. Every other
    // bit of word 2 -- flip, colour, pri, and bit 15 which the DMA drops -- is
    // preserved, exactly as `export-web.mjs` preserves them when it rewrites
    // capture.bin (line 632).
    const w2 = words[b + 2];
    const offs = ((w2 & 0x007f) << 16) | words[b + 3];
    if (wide === 0 || high === 0) { blank++; continue; }

    const hit = portMutating(opts, 'no-remap') ? [offs, Infinity, 0] : map.get(offs);
    const enough = hit !== undefined
      && (portMutating(opts, 'no-extent-check') || hit[1] >= 2 + wide * high);
    // WAVE 47: the art may exist and still not be HERE. `draw-pending-shard`
    // is the mutation that draws it anyway, and what it produces is a solid
    // rectangle of pen 0 -- present, plausible and wrong.
    const here = hit === undefined || !opts.shardReady
      || portMutating(opts, 'draw-pending-shard') || opts.shardReady(hit[2]);
    if (hit !== undefined && enough && here) {
      const packed = hit[0];
      words[b + 2] = (w2 & 0xff80) | ((packed >>> 16) & 0x7f);
      words[b + 3] = packed & 0xffff;
      drawn++;
      continue;
    }
    // NOT DRAWN, AND NAMED.  See the miss-policy paragraph above.
    skipped++;
    if (hit !== undefined && enough && !here) {
      // The art is in the bundle and in flight: name the SHARD, and ask for it
      // -- this is the call that makes the delivery schedule a function of the
      // simulation rather than of a clock.
      pending.set(hit[2], (pending.get(hit[2]) ?? 0) + 1);
      opts.demand?.(hit[2]);
    } else {
      missing.set(offs, (missing.get(offs) ?? 0) + 1);
    }
    if (portMutating(opts, 'terminate-instead-of-zero-width')) words[b + 4] = 0;
    else words[b + 4] = w4 & ~0x7e00;                // width := 0, height kept
  }
  return { words, records, drawn, skipped, blank, missing, pending };
}

/** The status line's version of a miss set: the worst `n` by count, as text. */
export function namedMisses(missing, n = 3) {
  return [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([o, c]) => `$${o.toString(16).toUpperCase().padStart(6, '0')}x${c}`)
    .join(' ');
}

/** The two sprite sources the page can draw, and the DEFAULT is the port's.
 *  `capture` is kept as a LABELLED DIAGNOSTIC, not as a fallback: it is the
 *  cheapest correctness check available without MAME, because the ship must
 *  land in the same place in both (`43-plan-enemy-layer.md` §3.4, §8.1). */
export const SPRITE_SOURCES = Object.freeze(['port', 'capture']);
export const DEFAULT_SPRITE_SOURCE = 'port';

// EXPORTED for `tests/w375coinwiring.test.js`. Constructing one needs a bundle,
// a capture and a canvas, but `step()`, `inPlayback()` and `coinTick()` are
// callable on a stub `this`, and testing the REAL methods is the difference
// between checking the playback gate and checking a copy of it.
export class Demo {
  // WAVE 101.  `rung` (optional) boots the port from a ladder checkpoint
  //  instead of the shipped seed.  It carries the rung's own RAM, BG ring,
  //  lf/vf and the manifest's intervention text; see `boot()` for how it is
  //  fetched and `101-Plan-boot-the-page-at-any-rung.md` for why every field
  //  is labelled on screen.  It is LOCAL DEVELOPMENT ONLY: the ladder files
  //  are not in dist/, so on the published page `rung` is always null.
  constructor(canvas, bundle, frameHz, mode = DEFAULT_MODE, rung = null,
      soundController = null) {
    this.bundle = bundle;
    this.cap = bundle.cap;
    // The tile functions come from the exported sheets; nothing else about the
    // renderer changes, and `tools/bundlegate.mjs` is what proves that.
    this.renderer = new Renderer(bundle.roms, bundle.tileFns);
    this.rung = rung;
    // WAVE 131 -- LIVE-PAGE REC.  `recorder` is null until the owner arms REC
    // from the #rec button; when null, `step()` is the same path as today
    // (one `const pw = currentPortWord()` binding + two null checks are the
    // only overhead).  `assetBase` is the URL `boot()` resolved for `assets/`
    // so `armRecording()` can re-fetch `player.tables.json.gz` for a
    // byte-exact `tablesSha256` (the one seed field `bundle.tables` alone
    // cannot reproduce, because it is the PARSED json, not the shipped bytes).
    this.recorder = null;
    this.assetBase = null;
    // WAVE 132 -- LIVE-PAGE PLAY.  `playback` is null until the owner loads a
    // `.replay` via the #play file-input; when null, `step()` reads the live
    // input exactly as before.  When set, `step()` feeds `playback.words[i]`
    // instead of `currentPortWord()` and the verifier hashes the resulting state
    // each frame.  `onPlaybackUpdate` is the page-supplied callback that renders
    // `#replay-banner` (playing / green / mismatch / divergent); Demo owns the
    // verdict, the page owns the DOM, mirroring how the loop owns the simulation
    // and the page owns presentation.
    this.playback = null;
    this.onPlaybackUpdate = null;
    this.seedLf = rung ? rung.lf : this.cap.frames[0].lf;
    // WAVE 13.  THE PORT NOW OWNS THE BACKGROUND'S MOTION.  Two things go in
    // and one comes out:
    //   IN  `bgSeed` -- the board's own $900000 ring at the capture's first
    //       frame.  The port writes at most ONE column per column-step; the
    //       other 63 are whatever the board had already written before the
    //       recording started, and starting from an empty ring would blank
    //       them.  The recording is the gate's INPUT here, never its output.
    //   OUT `game.video` -- bg_xscroll/bg_yscroll/tx_*, computed by the ported
    //       $140FFE from the ported $240B94/$240C22, and `game.vram`, the ring
    //       the ported $240D76 writes.  `draw()` below hands the renderer BOTH
    //       in place of the capture's, which is what takes L5 and L6's program
    //       half off the CAPTURE LEDGER.
    this.soundController = soundController;
    this.game = new Game(rung ? rung.seed : bundle.seed, bundle.tables, {
      logicFrame: this.seedLf,
      videoFrame: rung ? rung.vf : this.cap.frames[0].vf,
      bgSeed: rung ? rung.bgSeed : this.cap.part(0, 'bg'),
      soundSink: soundController,
      // W375 -- THE COIN PULSE ADVANCE. `Game#step` calls this at the ONE site
      // it calls `coinDebounce13CEC8`, i.e. once every two video frames, which
      // is the rate `currentCoinWord()`'s purity exists to protect.
      //
      // GATED ON PLAYBACK for the same reason `coinPort` is, one call site down.
      // See `Demo#coinTick`.
      coinTick: () => this.coinTick(),
    });
    this.prevTilt = this.game.ram.u16(RAM.player1 + P.tilt) << 16 >> 16;
    this.prevPos = [this.game.ram.u16(RAM.player1 + P.posY),
      this.game.ram.u16(RAM.player1 + P.posX)];

    // WAVE 44 -- THE PORT'S OWN DISPLAY LIST.  `romToPacked` is the map the
    // exporter now keeps (`portSpriteList` above); `portList` is the list ONE
    // LOGIC FRAME OLD, and the lag is not optional.
    //
    // `render/capture.js`'s own header measured it: `:igs023:spritebuffer` lags
    // main RAM by one frame -- "lag 1 gives three offsets holding on 161/161
    // captured frames, lag 0 and lag 2 give none" -- and the splice already
    // honours it with `prevPos`/`prevTilt`.  So `step()` snapshots the list
    // BEFORE it runs the frame, which is the list the PREVIOUS frame built, and
    // `draw()` renders that.  A page that renders the list `step()` has just
    // built is one frame early, and it looks ALMOST right.
    //
    // The seed is a board RAM snapshot, so at construction $800000 already holds
    // the BOARD's own list for the frame before the seed: the very first drawn
    // frame is a real list rather than an empty one.
    //
    // WAVE 47 -- and the map now carries the SHARD, so a record whose art is in
    // flight is skipped as `pending` and NAMES ITS SHARD instead of being
    // reported as art the bundle does not have.  `listOpts.demand` is what makes
    // the delivery schedule a function of the game: the shard a record actually
    // asks for jumps the queue.
    this.romToPacked = romToPackedMap(bundle.manifest,
      bundle.spr ? (b) => bundle.spr.shardOfBase(b) : null);
    this.listOpts = {
      out: null,
      shardReady: bundle.spr ? (i) => bundle.spr.state[i] === 'ready' : undefined,
      demand: bundle.spr ? (i) => bundle.spr.demand(i) : undefined,
    };
    this.spriteSource = DEFAULT_SPRITE_SOURCE;
    this.listBuf = new Uint16Array(PORT_LIST_WORDS);
    this.listOpts.out = this.listBuf;
    this.portList = portSpriteList(this.game.ram, this.romToPacked, this.listOpts);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rot = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.pal = new Uint8Array(0x1000 * 3);
    // WAVE 91: the palette the page actually draws through -- the recording's,
    // with every CARTRIDGE-SOURCED word replaced by the port's own.  Allocated
    // once; `mergePalette` writes into it and hangs the count off it.
    this.palMerged = null;
    this.mode = null;
    this.setMode(mode);

    this.periodMs = 1000 / frameHz;
    this.acc = 0;
    this.last = 0;
    this.stepsRun = 0;
    this.hudAt = 0;
    this.hudSteps = 0;
    this.hz = 0;
    this.running = true;
  }

  /**
   * Switch presentation.  This RESIZES THE BACKING STORE, which is the reason
   * the rotation never needs a CSS transform: the canvas is 224x448 in tate and
   * 448x224 in yoko, and `fitCanvas` then multiplies whichever it is by a whole
   * number.  Resizing a canvas clears it, so the next `draw()` repaints; the
   * SIMULATION is untouched, which is the point -- the mode changes the picture
   * and never a logic frame.
   */
  setMode(mode) {
    const name = PICTURES[mode] ? mode : DEFAULT_MODE;
    if (name === this.mode) return name;
    const pic = PICTURES[name];
    this.mode = name;
    this.canvas.width = pic.w;
    this.canvas.height = pic.h;
    this.img = this.ctx.createImageData(pic.w, pic.h);
    this.dirty = true;
    return name;
  }

  /** TRUE while a `.replay` is being fed to the visible Game.
   *
   *  THE REAL MECHANISM, and it is two conditions, not one. `this.playback` is
   *  null until `startPlayback()` builds the descriptor, but it is NOT nulled at
   *  the end -- `endPlayback()` sets `playback.ended` and leaves the descriptor
   *  in place so the banner and the verdict survive. From that instant `step()`
   *  is back on live input (`pw = currentPortWord()`), so anything gated on
   *  playback must test BOTH, exactly as the poke list and the word feed below
   *  already do. Gating on `this.playback` alone would freeze the coin port for
   *  the rest of the session after one replay.
   */
  inPlayback() {
    return !!(this.playback && !this.playback.ended);
  }

  /** W375 -- THE COIN PULSE ADVANCE, gated on playback. Handed to every `Game`
   *  this Demo builds as its `coinTick` hook, which `Game#step` calls at the ONE
   *  site it calls `coinDebounce13CEC8` (once per two video frames).
   *
   *  A METHOD rather than the bare `tickCoinPulse`, because during playback there
   *  is no coin input at all: `step()` pins `coinPort` to `COIN.idle`, so a pulse
   *  that kept counting down would be spending a press the Game never sees. The
   *  pulse is coin INPUT state and it freezes with the rest of it.
   */
  coinTick() {
    if (!this.inPlayback()) tickCoinPulse();
  }

  /** ONE LOGIC FRAME of the port.  No pixel work happens in here. */
  step() {
    const g = this.game;
    const inPlayback = this.inPlayback();
    this.prevPos = [g.ram.u16(RAM.player1 + P.posY), g.ram.u16(RAM.player1 + P.posX)];
    this.prevTilt = g.ram.u16(RAM.player1 + P.tilt) << 16 >> 16;   // ($4e,A6)
    // WAVE 44 -- THE ONE-FRAME HOLD, and it is here rather than in `draw()` on
    // purpose.  Taken BEFORE `g.step()`, $800000 still holds the list the
    // PREVIOUS frame built, which is the frame the sprite DMA would have put on
    // the screen (`render/capture.js`'s measured lag of 1).  Doing it here also
    // makes it independent of how often `draw()` runs: a mode change repaints
    // without stepping, and that must not shift the list by a frame.
    this.portList = portSpriteList(g.ram, this.romToPacked, this.listOpts);
    const pokes = inPlayback ? this.playback.pokes : LIVE_POKES;
    for (const [a, val] of pokes) g.ram.setU8(a, val);
    // WAVE 131/132 -- THE INPUT WORD.  `pw` is computed once and used for the
    // REC tee (W131, when armed) and the step.  WAVE 132 PLAY replaces the live
    // `currentPortWord()` with the next recorded word: the visible Game is fed
    // exactly the input sequence the recording captured, so the picture the
    // owner watches is the picture the verifier is hashing.  The live poke
    // Live play uses the file's complete `poke` list, while ordinary play uses
    // the live intervention below; there is no hidden second write.
    const pw = inPlayback
      ? this.playback.words[this.playback.i++]
      : currentPortWord();
    if (this.recorder) this.recorder.input(pw);
    // W375 -- THE COIN WORD, `$C08004`. A FIELD, not a second `step()` argument:
    // `.replay` v1 fixes `portin.encoding === 'u16be'` at ONE word per logic
    // frame and `decodePortinWords` throws on anything else, so a second
    // per-frame word is a format version bump plus every existing fixture. See
    // `main.js`'s header for the deviation this widens and the v2 `portin` +
    // `coinin` encoding that would close it.
    //
    // AND IT IS NOT TEE'd INTO `this.recorder`, because there is nowhere in a v1
    // file to put it -- which is exactly the hole `main.js` declares.
    //
    // WHICH IS PRECISELY WHY IT IS SUPPRESSED DURING PLAY. A `.replay` must
    // reproduce from (initial state, recorded input words) and NOTHING ELSE
    // (`NOTES-replay.md` constraint 1) -- that property is the whole of what the
    // W132 verifier hashes. A coin word is a second per-frame input the file
    // cannot carry, so leaving it live would let a key pressed by whoever is
    // watching the playback credit a coin, move `$80395A`, and turn a green
    // verify red with no record anywhere of what perturbed it. Pinned to
    // `COIN.idle` the recorded run is bit-identical whatever the keyboard does.
    g.coinPort = inPlayback ? COIN.idle : currentCoinWord();
    g.step(pw);
    if (this.recorder) this.recorder.feed();
    // WAVE 132 -- THE PLAYBACK DIGEST FEED.  After the step hashes the state the
    // step produced (same position as the recorder's feed and `replay.mjs:140`).
    // The verifier's `feed()` is synchronous (it only grows a string); the
    // async hash work happens at period boundaries in `loop()` and at
    // end-of-portin in `endPlayback()`.
    if (inPlayback) {
      const nBoundsBefore = this.playback.verifier.periodBounds.length;
      this.playback.verifier.feed();
      // A closed period is cheap to detect (feed pushed a char-offset bound) and
      // is the signal `loop()` uses to kick off the async window hash.
      if (this.playback.verifier.periodBounds.length > nBoundsBefore) {
        this.playback.needCheck = true;
      }
      // End-of-portin: stop the feed and kick off the final verdict.
      if (this.playback.i >= this.playback.count) this.endPlayback();
    }
    this.stepsRun++;
    // WAVE 14 -- THE SCROLL DRIVES THE DOWNLOAD.  The VM's own column cursor is
    // the same axis the background shards are cut on, so "which shard do I need
    // next" is arithmetic rather than a timer: shard s is map columns
    // [32s, 32s+32), and `followColumn` promotes the current one and the next.
    // Everything is queued at boot anyway (`prefetchAll`); this decides ORDER,
    // which is what matters when the link is slow.
    this.bundle.bg?.followColumn(this.streamColumn());
  }

  /**
   * WAVE 131 -- ARM the live-page REC.  Captures the seed from the live
   * `Demo.game` at the moment of arming (RAM, BG ring, lf/vf, tables) and
   * starts the recorder that `step()` tees one portin word + one digest feed
   * line into each logic frame.  Idempotent while armed (returns the active
   * recorder).  The seed is a DETACHED snapshot: `ram.b.slice()` copies the
   * live 128 KiB so later frames do not mutate the recording's seed, and
   * `beBytesFromWords(vram.w)` is the 4096-BE-byte form the v1 `bgB64` field
   * carries (the inverse of `beWords`, the layout `Game`'s `bgSeed` expects).
   *
   * The tables are RE-FETCHED (`player.tables.json.gz` -> gunzip -> base64)
   * when `assetBase` is set, so `version.tablesSha256` matches the shipped
   * bytes byte-for-byte.  If the fetch fails (a non-HTTP dev page, or the gz
   * is unreachable), the fallback is `JSON.stringify(bundle.tables)` -- lossy
   * for `tablesSha256` but the headless player `JSON.parse`s it back lossless,
   * so the recording still replays; `version.tablesSha256` is flagged
   * `'fallback-json'` so the discrepancy is on the file, not hidden.
   */
  async armRecording() {
    if (this.recorder) return this.recorder;
    // WAVE 132 -- REC and PLAY are mutually exclusive.  The recorder would tee
    // the recorded portin the playback is already feeding, double-counting the
    // input; and the seed the recorder captures at arm time would be the
    // playback Game's mid-walk state, not a clean starting point.  Refuse rather
    // than silently disarming either side.
    if (this.playback) {
      throw new Error('cannot arm REC while a .replay is playing; stop PLAY first.');
    }
    const g = this.game;
    const lf = g.logicFrame;
    const vf = g.videoFrame;

    // RAM: detached copy of the live 128 KiB (`ram.b` is mutated in place every
    // step).  BG: the live 2048-word ring as 4096 big-endian bytes.
    const ramB64 = recB64(g.ram.b.slice());
    const bgB64 = recB64(beBytesFromWords(g.vram.w));

    // Tables: prefer the shipped bytes (byte-exact tablesSha256); fall back to
    // the parsed bundle stringified.  `sha256Hex` hashes the SAME bytes that
    // go into tablesB64 so the two fields agree by construction.
    let tablesBytes = null;
    if (this.assetBase) {
      try {
        tablesBytes = await gunzip(await httpReader(this.assetBase)('player.tables.json.gz'));
      } catch {
        tablesBytes = null;          // surfaced below as the fallback marker
      }
    }
    let tablesSha256;
    if (tablesBytes) {
      tablesSha256 = await sha256Hex(tablesBytes);
    } else {
      tablesBytes = new TextEncoder().encode(JSON.stringify(this.bundle.tables));
      tablesSha256 = 'fallback-json';
    }
    const tablesB64 = recB64(tablesBytes);

    const seeded = this.stats().seeded;
    this.recorder = armRecorder(g, {
      columns: CLAIMED,                 // a live recording freezes ALL of CLAIMED
      periodFrames: REPLAY_PERIOD,
      seed: { lf, vf, ramB64, bgB64, tablesB64 },
      version: {
        git: 'unknown',                // the browser cannot run git; see worklog 131
        tablesSha256,
        buildId: 'ddpdoj-live',
      },
      scenario: seeded?.scenario ?? 'live',
      intervention: seeded?.intervention,
      poke: '810424=FF',               // the live INVULN intervention
    });
    return this.recorder;
  }

  /**
   * WAVE 131 -- STOP the live-page REC and return the packaged v1 `.replay`
   * object (the format frozen by W129, assembled by `replay.js stopRecorder`).
   * Clears `this.recorder` (so `step()` stops teeing).  Returns null if not
   * armed.  The caller (the #rec button) turns the object into a download.
   */
  async stopRecording() {
    if (!this.recorder) return null;
    const obj = await stopRecorder(this.recorder);
    this.recorder = null;
    return obj;
  }

  /**
   * WAVE 132 -- BOOT A FRESH GAME FROM A `.replay` AND START PLAYBACK.
   *
   * The visible Game becomes the verify target.  `obj.seed` is decoded the same
   * way `loadRung` (app.js:1259) and `replay.mjs:118` decode a seed: RAM is the
   * raw 128 KiB, BG is `beWords(...)` of the 4096 BE bytes, tables are
   * `JSON.parse` of the bytes, and `{ logicFrame, videoFrame, bgSeed }` are the
   * seed's own lf/vf.  The first fed portin is for lf+1, matching the headless
   * player's convention (`replay.mjs:137`).  This is the SAME construction the
   * `Demo` constructor uses (app.js:707-711) and `loadRung` feeds it, so the BG
   * shard scheduler + the sprite-list hold all work off the new `game` and the
   * visible picture is a faithful playback.
   *
   * The game-derived pieces (`prevTilt`/`prevPos`/`portList`/`seedLf`) are
   * re-initialised for the new Game; everything else (renderer, `romToPacked`,
   * `listOpts`, canvas, palette) is game-independent and stays.  Any armed
   * recorder is dropped (REC/PLAY mutually exclusive; `armRecording` refuses the
   * reverse direction).  PLAY ignores `?rung=` -- it boots from the file's seed.
   *
   * Returns the playback descriptor (or throws on a format/seed mismatch).
   */
  playFrom(obj) {
    const parsed = validateReplay(obj);
    // Decode the seed the same way `replay.mjs:108-121` does.
    const { ram, bg, tables, words, pokes } = parsed;
    const seed = obj.seed;
    const game = new Game(ram, tables, {
      logicFrame: seed.lf,
      videoFrame: seed.vf,
      bgSeed: beWords(bg),
      soundSink: this.soundController,
      // W375, as in the constructor above -- and gated the same way, so the
      // pulse cannot advance while this Game is being fed a recording.
      coinTick: () => this.coinTick(),
    });
    // ...and the coin keys start CLEAR. The gate below freezes the pulse for the
    // duration of the playback, so a key that was down when PLAY was pressed
    // would otherwise still be down when the verdict lands and credit a coin the
    // owner pressed for minutes ago. Same backstop `attachCoinKeys` runs on blur.
    clearCoin();

    // Swap in the fresh Game and re-init the game-derived state.  `recorder` is
    // dropped (mutually exclusive); `onPlaybackUpdate` is left to the page.
    this.game = game;
    this.seedLf = seed.lf;
    this.prevTilt = game.ram.u16(RAM.player1 + P.tilt) << 16 >> 16;
    this.prevPos = [game.ram.u16(RAM.player1 + P.posY),
      game.ram.u16(RAM.player1 + P.posX)];
    this.portList = portSpriteList(game.ram, this.romToPacked, this.listOpts);
    this.dirty = true;                  // repaint with the new Game's picture
    this.recorder = null;

    this.playback = {
      obj,
      words,
      pokes,
      count: obj.portin.count,
      i: 0,                             // next word to feed (lf = seedLf + i + 1)
      verifier: armPlayback(game, obj),
      ended: false,                     // set by endPlayback at end-of-portin
      result: null,                     // the verdict, once finalize() resolves
      pending: null,                    // in-flight boundary check promise
      needCheck: false,                 // a boundary closed; loop() should check
    };
    // Surface the PLAYING state immediately so the banner is not blank for the
    // first 250 frames (the first window a divergence could surface at).
    this._emitPlayback({ kind: 'playing', lf: obj.seed.lf, count: obj.portin.count });
    return this.playback;
  }

  /**
   * WAVE 132 -- END OF PORTIN.  Finalise the verifier (close the trailing
   * partial period, hash the cumulative), store the verdict, and surface it.
   * After this `step()` no-ops the playback branch (the feed stops growing) and
   * the loop stops calling into the verifier.  Idempotent: a second call is a
   * no-op once a result is in.  The promise is stored on `playback.pending` so
   * `loop()` does not start a second finalize in parallel.
   */
  endPlayback() {
    if (!this.playback || this.playback.ended) return;
    this.playback.ended = true;
    // W375 -- LIVE COIN INPUT RESUMES ON THE NEXT `step()` (`inPlayback()` is
    // false from here), so clear the port on the way out for the same reason
    // `playFrom` clears it on the way in: a key held through the playback must
    // not become a credit the instant the verdict lands.
    clearCoin();
    const pb = this.playback;
    const p = pb.verifier.finalize().then((result) => {
      pb.result = result;
      this._emitPlayback({ kind: result.green ? 'green' : 'red', result, lf: pb.obj.seed.lf,
        count: pb.count, toLf: pb.obj.seed.lf + pb.count });
    }).catch((e) => {
      pb.result = { green: false, error: e?.message ?? String(e) };
      this._emitPlayback({ kind: 'error', error: pb.result.error });
    });
    pb.pending = p;
  }

  /**
   * WAVE 132 -- LIVE BOUNDARY CHECK.  Called from `loop()` after the step batch.
   * If a period boundary closed this batch (or a prior check left one pending),
   * hash the newly-closed window FRESH and, on the FIRST divergence, surface it
   * immediately -- a divergence in the first 250 frames shows up at ~lf+250, not
   * at end-of-portin.  Cheap when nothing closed (the common path: nothing
   * awaits).  No-op when playback is absent or already finalised.
   */
  _pollPlayback() {
    if (!this.playback || this.playback.ended) return;
    const pb = this.playback;
    if (pb.pending) return;             // a finalize or a check is in flight
    if (!pb.needCheck) return;          // no boundary closed since last check
    pb.needCheck = false;
    pb.pending = pb.verifier.check().then((div) => {
      pb.pending = null;
      if (div) {
        // First divergence localised to a 250-frame window; never "N frames
        // differ" (docs/knowledge/01).  Playback continues to end-of-portin so
        // the cumulative verdict is still reached, but the banner flips red now.
        this._emitPlayback({ kind: 'divergent', divergent: div,
          lf: pb.obj.seed.lf, compared: pb.verifier.n });
      }
    }).catch(() => { pb.pending = null; });
  }

  /**
   * WAVE 132 -- Render a playback state through `onPlaybackUpdate`.  The page
   * supplies the callback (it owns `#replay-banner`); the Demo owns the verdict.
   * Centralised here so every transition (playing / divergent / green / red /
   * error) goes through one shape and the page's renderer can stay simple.
   */
  _emitPlayback(state) {
    try { this.onPlaybackUpdate?.(state); } catch { /* a banner throw must not stop the port */ }
  }

  /**
   * The stage-1 map column the port is painting, or -1.
   *
   * `vram.streamPtr` is the ROM address `$26134E` loaded for the current column
   * ($225B78 + 36*column).  It is -1 before the first column is written and
   * whenever the pointer is outside stage 1's own stream -- the boss lock
   * rewinds it and stages 2..5 are not exported at all, so an address this
   * cannot place must NOT be turned into a plausible column number.
   */
  streamColumn() {
    return streamColumnOf(this.bundle.manifest.gfx.bg?.map,
      this.game.vram.streamPtr);
  }

  /** The picture for the port's CURRENT logic frame. */
  draw() {
    const n = this.cap.length;
    const k = (this.game.logicFrame - this.seedLf) % n;
    const fi = k < 0 ? k + n : k;
    const st = this.cap.state(fi);
    // WAVE 13 -- THE SCROLL IS THE PORT'S.  `st.bg` and the four scroll
    // registers are replaced wholesale; `ctrl`, `bg_scale` and the palette are
    // still the recording's (both are constants on every measured frame --
    // ctrl $001F, bg_scale $0210 over 16,000 frames -- and the palette is
    // W15's).  The tile PIXELS are still the bundle's 415 harvested tiles, so
    // once the port scrolls past what the recording happened to fly over the
    // ring asks for tiles the sheet does not hold; `bundle.missingBgTiles`
    // counts every one and the status line prints it.  That is W15's job and
    // it is stated on the page rather than hidden behind a still picture.
    st.bg = this.game.vram.w;
    st.regs = {
      ...st.regs,
      bg_xscroll: this.game.video.bg_xscroll,   // $B03000, from $141018/$14101C
      bg_yscroll: this.game.video.bg_yscroll,   // $B02000
      tx_xscroll: this.game.video.tx_xscroll,   // $23C5FC, written once
      tx_yscroll: this.game.video.tx_yscroll,   // $23C5F2
    };
    // THE SPLICE, through the shared module the packer proves round-trips.
    // `prevPos`, not the current position: the sprite buffer lags main RAM by
    // one frame, measured (`capture.js`).
    //
    // WAVE 9: this now moves EIGHT records, not three -- the ship, two option
    // pods, two exhaust records and three ground shadows.  See
    // `render/capture.js`'s header for the conditional matcher that finds them
    // and `tools/attachreport.mjs` for what it rejected.
    // WAVE 12: the tilt and the 17 REBASED animation pairs now go in with the
    // position, so the ship BANKS.  `prevTilt`, not the current one, for the
    // same measured reason the position is one frame behind: the sprite buffer
    // lags main RAM by one frame.
    this.spliced = this.cap.splice(st, fi, this.prevPos[0], this.prevPos[1],
      { tilt: this.prevTilt, ship: this.bundle.manifest.ship ?? null });
    // WAVE 37 -- AND NOW THE RECORDED ENEMIES COME OFF.  AFTER the splice, for
    // the reason `stripToAttached`'s header gives: the splice addresses records
    // by their index in the ORIGINAL list.  MEASURED over all 161 frames of the
    // shipped bundle: 7,671 display-list records -> 886, 23..72 per frame ->
    // 5..6, 8.99 % of the 16,156,672 compared pixels changed, no throw.  What
    // is left is the eight player-attached classes and nothing else; the
    // background, the HUD (`st.tx`, which is not sprites at all -- 4 of 220
    // record classes in the recording are static and the only frequent one is
    // the null stream drawn off screen), the palette and the four scroll
    // registers are untouched.
    this.stripped = stripToAttached(st, this.cap.attached()[fi]);
    // WAVE 44 -- AND NOW THE PORT'S OWN LIST GOES ON THE SCREEN.
    //
    // Everything above still runs in both sources, and that is deliberate: it
    // keeps the CAPTURE path -- the splice and wave 37's strip -- alive and
    // switchable in one keypress, which is the only correctness check this wave
    // has that does not need MAME.  THE SHIP MUST LAND IN THE SAME PLACE IN
    // BOTH.  In `port` the recording supplies no sprite at all: only `st.tx`
    // (the HUD), the palette, `zoomram`, `rowscroll`, `ctrl` and `bg_scale` are
    // still its, and every record on the screen is the port's own.
    //
    // `spriteStride: RAM_STRIDE` is a STRUCTURAL parameter of `renderIndexed`'s
    // own options bag, not one of the four decoder-mutation knobs whose comment
    // says the port may not pass a non-default value -- that comment is on the
    // CONSTRUCTOR's bag (`render/igs023.js:36-41` vs :74-78), and
    // `tools/pixgate.mjs:327-332` builds its `drawOpts` from exactly the four
    // mutations and passes neither `spriteStride` nor `scrollSign`.
    const port = this.portList;
    const usedPort = this.spriteSource === 'port';
    if (usedPort) st.spritebuffer = port.words;
    // ----------------------------------------------------------- WAVE 98 (H1)
    // AND NOW THE REPLAYED HUD COMES OFF, for W37's reason and by W37's method.
    //
    //   the owner: "I am pretty sure the HUD from the upper left is a recording
    //   and should go till we have the real one"
    //
    // THEY ARE RIGHT AND THE SPLIT IS ALREADY IN THIS REPO'S OWN WORDS.
    // `src/hud.js`: *"the HUD's STATE is this port's and the HUD's PICTURE is
    // not. A player sees no score row, no chain meter and no bomb icons ... and
    // every address above is counted in `unportedLog` on the frames it would
    // have drawn."*  `41-recon` §3.1: the `tx` layer is *"the capture, whole --
    // HUD, score digits, all on-screen text"*.  So what is in the upper left is
    // a 161-frame recording of somebody else's score looping against a 7,317-
    // frame stage, and `39-OWNER`'s "the recorded enemies became off and wrong
    // at some point" is the same sentence about the same mechanism.
    //
    // **THE LAYER GOES EMPTY, NOT WRONG.**  Nothing is substituted and no
    // placeholder is drawn; that is the intended outcome and not a regression.
    // W37 emptied the enemy layer on exactly these terms and the owner asked
    // for it in those words.
    //
    // WHY `wantTx: false` AND NOT A ZEROED `st.tx`.  Tile 0 is a tile, not an
    // absence: zeroing the map would draw whatever tile 0 holds 64x32 times.
    // `wantTx` is a STRUCTURAL parameter of `renderIndexed`'s own options bag,
    // the same class as the `spriteStride` immediately beside it and NOT one of
    // the four decoder mutations whose comment forbids the port a non-default
    // value -- that comment is on the CONSTRUCTOR's bag
    // (`render/igs023.js:36-41` vs :74-78).
    //
    // ONLY IN `port`.  In `capture` the page is DELIBERATELY showing the
    // recording, and that is the one correctness check this repo has that does
    // not need MAME (the paragraph above says so).  Taking the HUD out of that
    // source would break the thing the source exists for.
    //
    // AND THIS IS NOT THE PALETTE.  W91-W93 moved 1,760 of 2,560 palette words
    // to the cartridge and 160 of the 240 TEXT words are among them; the other
    // 80 have no cartridge source yet.  `mergePalette` below reads
    // `this.game.palette` and the capture's, and neither has anything to do
    // with `st.tx`.  **Not one palette word is removed by this and none may
    // be** -- the picture and the colours are two separate retirements and only
    // the picture is retired here.
    //
    // ----------------------------------------------------- WAVE 115 (score digits)
    // THE SCORE DIGITS COME BACK ON, and only them.  W114 found that the score
    // numbers have their OWN IRQ6-gated flush `$185DC4` (the 4th routine behind
    // the `$803940` gate) that drains the dirty records at `$81B4C8` straight
    // into `$904000`, parallel to the `$240DC2`/`$141258` text path the rest of
    // the HUD still uses.  So the port's own `TxVram` now sources `st.tx` in
    // the `port` source, and `wantTx` flips back to true: the P1/P2 score
    // number renders as real text tiles.  The OTHER text (lives, bombs,
    // credits, chain-high-water) is still blank -- those ride the unported
    // `$141258` flush (Wave C') and the cells stay zero / transparent here.
    if (usedPort) st.tx = this.game.txvram.w;
    const idx = this.renderer.renderIndexed(st,
      usedPort ? { spriteStride: RAM_STRIDE } : undefined);
    // `txDropped` now means "the WHOLE TX layer is the recording's".  In
    // `port` the score digits are the port's own (`TxVram`); in `capture` the
    // whole layer is the recording's, as it has been since W98.
    this.txDropped = false;   // W115: never fully dropped now; kept for the stat
    this.txPort = usedPort;   // W115: score digits are the port's (TxVram)
    // The palette that applies is the NEXT frame's -- the measured sample-point
    // offset (00-recon-assets.md §4).  On a looping capture the next frame is
    // the next captured one.
    //
    // WAVE 91 -- AND IT IS NO LONGER ONLY THE RECORDING'S.  `mergePalette`
    // starts from the capture and overwrites every word a ported `$24150A`
    // sourced from the cartridge; `paletteSourced` is how many that is and the
    // status line prints it beside the total, because a page that quietly
    // became half-cartridge would be indistinguishable from one that did not.
    const capPal = this.cap.part((fi + 1) % n, 'palette');
    if (!this.palMerged || this.palMerged.length !== capPal.length) {
      this.palMerged = new Uint16Array(capPal.length);
    }
    mergePalette(this.game.palette, capPal, this.palMerged);
    this.paletteSourced = this.palMerged.fromCartridge;
    this.paletteTotal = capPal.length;
    paletteRgb(this.palMerged, this.pal);
    resolveRgb(idx, this.pal, this.rgb);
    // TATE rotates the BUFFER; yoko blits the board's own 448x224 buffer.
    // Either way the canvas backing store already matches (`setMode`).
    if (PICTURES[this.mode].rotate) {
      rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rot);
      rgbToRgba(this.rot, this.img.data);
    } else {
      rgbToRgba(this.rgb, this.img.data);
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
    return this.cap.frames[fi];
  }

  /** Everything the page's status line shows.  Read, never computed here. */
  stats() {
    const g = this.game;
    const py = g.ram.u16(RAM.player1 + P.posY);
    const px = g.ram.u16(RAM.player1 + P.posX);
    return {
      logicFrame: g.logicFrame,
      videoFrame: g.videoFrame,
      // WAVE 101.  If the port booted from a ladder rung, say so here in the
      // same object the photo harness reads, so a screenshot's `#stats` line
      // carries its own provenance.  Null on the shipped seed (the common
      // case); the page renders `seeded.rung` into the visible banner too.
      // PROJECTION ONLY: the full rung holds a 128 KiB Uint8Array, and the
      // photo scripts sample `stats()` twice a second -- returning the bytes
      // would ship 128 KiB across the playwright bridge on every tick.
      seeded: this.rung ? {
        rung: this.rung.rung, lf: this.rung.lf, scenario: this.rung.scenario,
        intervention: this.rung.intervention, poke: this.rung.poke,
      } : null,
      py, px,
      pyPx: py / 64, pxPx: px / 64,
      tilt: g.ram.u16(RAM.player1 + P.tilt) << 16 >> 16,
      frameCounter: g.ram.u16(RAM.frameCounter),
      logicHz: this.hz,
      mode: this.mode,
      spliced: this.spliced,
      // WAVE 37.  The page must keep SAYING what it is: `stripped` is how many
      // of the recording's own display-list records were thrown away this
      // frame, and `kept` is what survived.  An empty enemy layer with no
      // explanation is the same defect class as a black screen with no
      // explanation.
      stripped: this.stripped?.removed ?? 0,
      kept: this.stripped?.kept ?? 0,
      // WAVE 98 (H1).  Same contract one layer up: the replayed HUD is GONE in
      // the `port` source and the page says so, because an empty upper left
      // with no explanation is the same defect class as an empty enemy layer
      // with no explanation.
      txDropped: this.txDropped ?? false,
      // W115: the P1/P2 score digits are the port's own (rendered from
      // `TxVram` via the ported `$185DC4` flush); the other text is still
      // blank pending Wave C' (`$240DC2`/`$141258`).  `hud-rec` (capture) vs
      // `hud-score` (port) is what the status line prints now.
      txPort: this.txPort ?? false,
      // WAVE 44.  The port's own list, and the honest part is `missed`: a
      // display-list record whose sprite stream is not in the shipped sheet is
      // NOT DRAWN, and its CARTRIDGE address is on the status line. That is
      // what turns "the picture is wrong" into a list of addresses for the art
      // wave to harvest. `blank` are records the hardware itself draws nothing
      // for (width or height zero) and which therefore need no art at all.
      spriteSource: this.spriteSource,
      dlRecords: this.portList?.records ?? 0,
      dlDrawn: this.portList?.drawn ?? 0,
      dlMissed: this.portList?.skipped ?? 0,
      dlBlank: this.portList?.blank ?? 0,
      dlMissing: this.portList ? namedMisses(this.portList.missing) : '',
      // `dlMissed` is every skip; `dlNoArt` is the subset with no art anywhere.
      dlNoArt: this.portList
        ? [...this.portList.missing.values()].reduce((a, b) => a + b, 0) : 0,
      // WAVE 47.  `dlPending` is the OTHER kind of skip and it must not wear the
      // same words: the art IS in the bundle and the shard is in flight. It
      // names the shard, so "the tanks have no bodies for a second at boot"
      // reads as a delivery state rather than as a missing picture.
      dlPending: this.portList
        ? [...this.portList.pending.entries()].sort((a, b) => b[1] - a[1])
          .map(([s, c]) => `${s}x${c}`).join(' ')
        : '',
      sprShards: this.bundle.spr?.status() ?? null,
      dlBuckets: g.displayList?.perBucketRecords?.[0] ?? 0,
      // WAVE 67.  Bucket 12, THE SHIP'S AFTERIMAGE TRAIL, on the status line
      // for one reason: `$24A53E jsr $253604` was a counted note for fifty-four
      // waves and the thing that would have shown it is a number on the page
      // the owner plays.  It is 0 until the beam arms and 0..5 after -- and
      // ZERO ON A STATIONARY SHIP, which is `$25369C` and not a fault.
      dlTrail: g.trailRecords ?? 0,
      capture: this.capFrame,
      unported: g.unportedLog.report(),
      sound: this.soundController?.stats() ?? { status: 'absent' },
      // WAVE 13 -- the scroll program, live.
      clock: g.ram.u16(0x8130ce),          // $8130CE, the distance odometer
      bgx: g.video.bg_xscroll,
      bgy: g.video.bg_yscroll,
      columns: g.vram.columnsWritten,      // $240D76 map columns written
      scrollEvents: g.scrollEvents.length,
      missingBgTiles: this.bundle.missingBgTiles?.size ?? 0,
      // WAVE 14 -- the background shards.  `waiting` is the honest part: a
      // shard a DRAW asked for and did not have.  If it is ever non-empty the
      // player is looking at a hole and the page says which one, rather than
      // showing black and saying nothing.
      mapColumn: this.streamColumn(),
      shards: this.bundle.bg?.status() ?? null,
      // WAVE 91 -- HOW MUCH OF THE PALETTE IS THE CARTRIDGE'S, on the page,
      // every frame.  Until this wave the answer was ZERO for the sprite third
      // and nothing said so: the number that was on the page (1020 of 1024)
      // was about the BACKGROUND and read for 76 waves as though it covered
      // every colour.  `palBanks` is the sprite banks a ported $24150A has
      // sourced; the ones NOT listed are still the recording's.
      palSourced: this.paletteSourced ?? 0,
      palTotal: this.paletteTotal ?? 0,
      palBanks: g.palette?.sourcedBanks() ?? [],
      palInstalls: g.palette?.installCount ?? 0,
      // WAVE 92 -- BY THIRD, because "N of 2,560" is the number that misled a
      // reader for 76 waves.  `capture.bin` going away is the formal definition
      // of stage 1 being done (`39-OWNER`), and which THIRD is still on it is
      // the question that answers.  [M] the last 272 words ($8F0..$9FF) are
      // never written by any of `$24133C`'s three copies on the board either,
      // so they can never be sourced and the page says which they are.
      palLedger: g.palette?.ledger() ?? null,
    };
  }

  /**
   * WAVE 44 -- the A/B.  `port` is the DEFAULT and is what the game IS;
   * `capture` replays the recording's own sprite list through wave 37's strip
   * and is a LABELLED DIAGNOSTIC.  It is kept because the ship must land in the
   * same place in both, which is the cheapest check this wave has and the only
   * one available without MAME.  The SIMULATION is untouched either way, exactly
   * as `setMode` leaves it untouched: this changes the picture, never a frame.
   */
  setSpriteSource(src) {
    this.spriteSource = SPRITE_SOURCES.includes(src) ? src : DEFAULT_SPRITE_SOURCE;
    this.dirty = true;
    return this.spriteSource;
  }

  loop(now) {
    if (!this.running) return;
    // WAVE 109 -- poll the gamepad ONCE per ANIMATION frame (this callback is
    // the rAF), not per logic frame. The Standard Gamepad API is polled, not
    // event-driven; currentPortWord() reads the controller's state each logic
    // frame inside step(), so this refresh happens before any step() runs.
    pollInput();
    if (!this.last) this.last = now;
    let dt = now - this.last;
    this.last = now;
    // A tab that was in the background must not run a thousand frames at once.
    // Presentation is dropped; the SIMULATION is never altered.
    if (dt > 200) dt = this.periodMs;
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.periodMs && n < 8) {
      this.acc -= this.periodMs;
      this.step();
      n++;
    }
    // WAVE 132 -- PLAYBACK LIVE BOUNDARY CHECK.  After the step batch, if a
    // period window closed, hash it fresh and surface the first divergence now
    // (a divergence in window 0 shows up at ~lf+250, not at end-of-portin).
    // Cheap when nothing closed and no playback is active.  The async hash does
    // not block the rAF: `_pollPlayback` stores a promise and resolves later.
    if (this.playback && !this.playback.ended) this._pollPlayback();
    if (n || this.dirty) {
      // `dirty` is set by setMode: resizing the backing store blanks it, and a
      // mode change between two logic frames would otherwise leave a black
      // canvas until the next one came due.
      this.capFrame = this.draw();
      if (this.hudAt) {
        this.hz = 1000 * (this.stepsRun - this.hudSteps) / (now - this.hudAt);
      }
      if (!this.hudAt || now - this.hudAt > 500) {
        this.hudAt = now;
        this.hudSteps = this.stepsRun;
      }
    }
    // Game queued each compact door once during the catch-up batch. The shared
    // controller is the only runtime/chip owner and is pumped once afterwards.
    this.soundController?.pump();
  }
}

/** big-endian u16 words out of a raw dump -- the layout `BgVram` stores.
 *  Mirrors `tools/seedcmp.mjs`'s `beWords` so the rung's `.bg.bin` reaches
 *  the Game through exactly the transformation the headless comparison uses. */
function beWords(bytes) {
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}

/** WAVE 101.  Resolve a rung number to the port's three seed inputs by reading
 *  the ladder manifest + the rung's `.ram.bin` and `.bg.bin` out of the ladder
 *  dir.  Returns null if the ladder is unreachable (the published page), so the
 *  caller falls back to the shipped seed.  `regs.txt` is deliberately NOT read:
 *  `seedcmp.mjs` ignores it too, and `draw()` overrides every scroll register
 *  from `game.video` each frame -- the regs file's `ctrl`/`bg_scale` are
 *  stage-wide constants the capture already carries.
 *
 *  `ladderBase` is the URL of the `tools/oracle/out/` directory, resolved by
 *  `boot()` relative to THIS MODULE (not the asset base -- the base can be
 *  overridden, and `../../tools` from `assets/` is one level too high).  Under
 *  it, `w69/<ladder>/` holds the manifest and `ckpt/`.  `ladderDir` overrides
 *  the whole path for callers that already know it.  The manifest carries its
 *  own intervention text, which the page must surface (plan rule 3: carry the
 *  label, not just the bytes). */
export async function loadRung(ladderBase, rungLf, ladder = 'stage1-sweep', ladderDir = null) {
  const dir = ladderDir
    ? new URL(ladderDir, ladderBase)
    : new URL(`w69/${ladder}/`, ladderBase);
  const manUrl = new URL('manifest.json', dir);
  let manRes;
  try {
    manRes = await fetch(manUrl);
  } catch (e) {
    throw new AssetError(`rung ${rungLf}: the ladder manifest fetch failed `
      + `(${e.message}). This is a LOCAL DEVELOPMENT path; the published page `
      + 'has no ladder and should not pass ?rung=.');
  }
  if (!manRes.ok) {
    throw new AssetError(`rung ${rungLf}: the ladder manifest at ${manUrl.href} `
      + `returned HTTP ${manRes.status}. The ladder lives under `
      + 'tools/oracle/out/ and is gitignored and not published; serve the repo '
      + 'root (or games/ddpdoj/) over HTTP and run pgm.py ckpt to build it.');
  }
  const man = await manRes.json();
  const rung = (man.rungs ?? []).find((x) => x.lf === rungLf);
  if (!rung) {
    const have = (man.rungs ?? []).map((x) => x.lf).join(', ');
    throw new AssetError(`rung ${rungLf} is not in this ladder. Rungs present: `
      + `${have ?? '(none)'}.`);
  }
  const ckDir = new URL(`${man.dir ?? 'ckpt'}/`, dir);
  const read = async (rel) => {
    const u = new URL(rel, ckDir);
    const res = await fetch(u);
    if (!res.ok) {
      throw new AssetError(`rung ${rungLf}: ${u.href} returned HTTP ${res.status}. `
        + 'The checkpoint files are ROM-derived and are not published; rebuild '
        + 'the ladder with pgm.py ckpt.');
    }
    return new Uint8Array(await res.arrayBuffer());
  };
  const seed = await read(rung.ram);
  if (seed.length !== MACHINE.ramSize) {
    throw new AssetError(`rung ${rungLf}: ${rung.ram} is ${seed.length} bytes, `
      + `expected ${MACHINE.ramSize} (the board's 128 KiB main RAM). The seed `
      + 'layout is RAM-only; see worklog 101.');
  }
  const bgSeed = beWords(await read(rung.bg));
  return {
    lf: rung.lf,
    vf: rung.vf,
    seed,
    bgSeed,
    scenario: man.scenario ?? null,
    intervention: man.intervention ?? null,
    poke: man.poke ?? null,
    rung: rungLf,
  };
}

/**
 * Boot the port onto `canvas`.
 *
 * `opts.onError` IS NOT OPTIONAL in practice, and the comment is here rather
 * than in the page because this is where the throw escapes.  EVERY UNPORTED
 * PATH IN THIS PORT IS A THROW carrying a ROM address, and they are reached in
 * ordinary play -- the bomb reaches one, and so does HOLDING fire.  Thrown from inside
 * the requestAnimationFrame callback they land where NOTHING is listening:
 * `boot()` resolved long ago, so the page's `await boot(...)` try/catch cannot
 * see them.  The loop simply stops being rescheduled and the canvas holds its
 * last frame.
 *
 * REPORTED FROM PLAY on Gradius as "softlocks and screen freezes", where it was
 * a named throw the whole time and the message was sitting in the console while
 * the page showed a frozen picture and said nothing.  The fix is this
 * parameter plus the try/catch below, and it is copied here deliberately.
 */
export async function boot(canvas, opts = {}) {
  const base = opts.base ?? new URL('../../assets/', import.meta.url);
  const gameJsonUrl = opts.gameJson ?? new URL('../../game.json', import.meta.url);

  const r = await fetch(gameJsonUrl);
  if (!r.ok) throw new AssetError(`game.json: HTTP ${r.status}`);
  const gameJson = await r.json();
  const frameHz = gameJson.display.frameHz;
  // Spelled once, in game.json, DERIVED (15625/264) and not rounded. If the two
  // ever disagree the page is running at a rate the port was not measured at.
  if (Math.abs(frameHz - MACHINE.refreshHz) > 1e-6) {
    throw new AssetError(`game.json says ${frameHz} Hz, the port's machine `
      + `model says ${MACHINE.refreshHz}. One of them is wrong.`);
  }

  const bundle = await loadBundle(httpReader(base, opts.onProgress), opts.bundleOpts);
  // WAVE 14.  `loadBundle` awaited the BOOT shards only (0 and 1, 210.3 KiB --
  // less than the 408 KiB the wave-13 page fetched before its first frame).
  // The other six are queued HERE, after boot has returned, so they compete
  // with nothing: the recon measured 25 s of slack for the 441 KiB and a
  // tightest single deadline of 4.3 s.
  bundle.bg?.prefetchAll();
  // WAVE 47.  The five deferred SPRITE shards, 209 KiB, queued the same way and
  // in NEED ORDER: shard 1 is type $11's hull -- the owner's missing tank
  // bodies, [M] first asked for at +7.7 s -- and shard 5 is a 70-frame
  // animation [M] first asked for at +103 s. The queue is separate from the
  // background's, so the two run in parallel; the sprite queue is one fifth of
  // the background's bytes and its first deadline is looser, which is the head
  // of `41-recon-sprite-art.md` §7.7's contention question. The TAIL of it is
  // still unanalysed and this wave does not close it.
  bundle.spr?.prefetchAll();
  // WAVE 101 -- BOOT THE PAGE AT ANY LADDER RUNG.  `opts.rung` is the logic
  //  frame the caller wants to start from; `boot()` resolves it to the
  //  checkpoint's three files in the ladder dir and hands the result to `Demo`
  //  in place of the shipped seed.  LOCAL DEVELOPMENT ONLY by construction:
  //  the ladder lives under `tools/oracle/out/`, which `build-dist.mjs` does
  //  not copy into dist/, so on the published page the manifest fetch 404s and
  //  `loadRung` returns null -- the page then boots from the shipped seed and a
  //  visitor with no `?rung=` sees nothing change.  See `101-Plan-...md` for
  //  why a seeded page must label itself: it proves CODE, never a ROUTE.
  const rung = opts.rung != null
    ? await loadRung(opts.ladderBase ?? new URL('../../tools/oracle/out/', import.meta.url),
        opts.rung, opts.ladder, opts.ladderDir)
    : null;
  // One controller exists before Game. It retains only compact frame inputs
  // until assets arrive, then advances the singleton runtime silently until a
  // gesture attaches AudioOut. No pre-gesture PCM becomes an audible backlog.
  const sound = new AudioController(null, opts.onSoundError);
  const demo = new Demo(canvas, bundle, frameHz, opts.mode ?? DEFAULT_MODE, rung, sound);
  // WAVE 131 -- the asset base `armRecording()` re-fetches the tables from, so
  // a live REC's `version.tablesSha256` can match the shipped bytes rather than
  // the fallback `JSON.stringify(bundle.tables)`.
  demo.assetBase = base;
  attachInput(opts.target);
  // W375 -- THE COIN KEYS (Digit5 COIN1, Digit6 COIN2, Digit9 SERVICE, F2 TEST),
  // by `e.code` so they are layout-invariant. SEPARATE from `attachInput`'s
  // shared controller because that controller speaks the PLAYER port's
  // normalized vocabulary and these four switches are not in it; it brings its
  // own blur / pagehide / visibilitychange backstop for the same reason.
  attachCoinKeys(opts.target);

  const frame = (t) => {
    if (!demo.running) return;
    try {
      demo.loop(t);
    } catch (e) {
      // Stop cleanly rather than throwing once per frame forever, and hand the
      // error somewhere a human can see it. The message names the ROM address,
      // which is the whole point of the throws being loud.
      demo.running = false;
      opts.onError?.(e);
      throw e;                       // keep the console trace intact
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Deferred and deliberately not awaited: first paint is already scheduled.
  // A gesture may synchronously arm the AudioContext first. Asset completion
  // constructs the sole SoundRuntime independently, restores the authentic
  // lf1562 stage-one BGM start up to the page seed, then setChip catches up any
  // post-seed frame inputs silently and attaches that same instance if armed.
  const soundReady = new Promise((resolve) => requestAnimationFrame(resolve))
    .then(() => loadSoundAssets(httpReader(base), bundle.manifest))
    .then((assets) => {
      const runtime = soundRuntimeFromStage1Seed(assets, APPROVED_SOUND_POLICIES,
        demo.seedLf);
      sound.setChip(runtime);
      return assets;
    })
    .catch((e) => { sound.fail(e); return null; });

  return {
    demo,
    bundle,
    stats: () => demo.stats(),
    get mode() { return demo.mode; },
    setMode: (m) => demo.setMode(m),
    get spriteSource() { return demo.spriteSource; },
    setSpriteSource: (s) => demo.setSpriteSource(s),
    // WAVE 131 -- REC entry points for the #rec button.  Thin wrappers so the
    // page's API stays one shape (`app.armRecording()`), matching `setMode` etc.
    armRecording: () => demo.armRecording(),
    stopRecording: () => demo.stopRecording(),
    // WAVE 132 -- PLAY entry points for the #play file-input + the banner
    // callback.  `playFrom(obj)` boots a fresh Game from the file's seed and
    // starts playback; `onPlaybackUpdate` is the page's banner renderer.
    playFrom: (obj) => demo.playFrom(obj),
    set onPlaybackUpdate(fn) { demo.onPlaybackUpdate = fn; },
    get playback() { return demo.playback; },
    get game() { return demo.game; },
    sound,
    soundReady,
    stop() { demo.running = false; },
  };
}
