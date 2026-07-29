// The stage-intro card.  ROM: sub_00_333F, called from loc_00_04BB (a level
// entered from a menu) and from $2836 (a level entered from the one before).
//
// It is the FIRST thing level init does -- before sub_00_2889, sub_00_0C34,
// sub_00_0D50 or 1:$4DDA -- so it is built on top of whatever VRAM the previous
// screen left, exactly like round select. Resource $02 is the same 6:$54B4 font
// blob the title and round select both copy, which is why $8800-$8C7F comes out
// of the build unchanged.
//
// $3342-$3364 is a plain list of eight compares and it RETs for everything
// else, so the card shows on levels 1/4/5/8/9/$0B/$0C/$0E and nowhere else.
// The two arms differ by one instruction: a ROUTE START (1/5/9/$0C) enters at
// loc_00_3365, which refills HP from $FF8E; a BOSS (4/8/$0B/$0E) enters at
// loc_00_3369 and does not.
//
// MEASURED end to end against the cartridge (tools/oracle/stageintro.py), and
// identical on all eight levels:
//
//   frame  1-60   $3391, B = $3C. The fill and the three resource loads have
//                 already happened, so this is 60 frames of a flat $DC screen
//                 with the emblem on it. START ($FFE2 bit 3) leaves here.
//   frame  61     3:$7C15, the first half of the frame decoration.
//   frame  62     3:$7C4C, the second half.
//   frame  63     the level's own text, 3:$7BF9[level-1] -> {len, script}.
//                 On a BOSS level 0:$3485's 31 bytes are appended first, over
//                 the terminator those four records deliberately lack.
//   frame  64-243 $C712 = $B4 counting down. START leaves here too.
//   frame 244-276 sub_00_0A7F with C = 0 -- the same 33-frame fade title.js
//                 already owns, and it is NOT cancellable.
//
// 276 frames in total. START during either loop RETs immediately and the fade
// never runs, so a cancelled card leaves the palettes where they were.
//
// Frames 61, 62 and 63 test nothing: the three sub_00_0A4F calls at $33C8,
// $33F7 and $345A have no $FFE2 read after them. The card genuinely cannot be
// skipped while it is painting itself.

import { buildTileCache } from './assets.js';
import { blockCopy, fillTilemap, VRAM_BASE } from './vram.js';
import { runVramScript } from './vramscript.js';
import { createFade, tickFade } from './title.js';
import { BTN } from './player.js';
import { RASTER_OFF } from './raster.js';
import { drawMetasprite } from './render/metasprite.js';

/** $3346-$3352: the four route starts, which also refill HP at loc_00_3365. */
export const INTRO_ROUTE_LEVELS = [0x01, 0x05, 0x09, 0x0C];
/** $3356-$3362, and again at $342A-$3436: the four bosses. */
export const INTRO_BOSS_LEVELS = [0x04, 0x08, 0x0B, 0x0E];

/** Does sub_00_333F do anything at all for this level? */
export function showsStageIntro(level) {
  return INTRO_ROUTE_LEVELS.includes(level) || INTRO_BOSS_LEVELS.includes(level);
}

function b64(s) {
  const bin = typeof atob === 'function'
    ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Check the manifest block before indexing into it.
 *
 * A missing table must THROW: metasprite id 0 and tile 0 are both valid, so a
 * default looks plausible and is wrong -- and a half-built intro card is much
 * harder to notice than a missing one.
 */
export function requireStageIntroSpec(spec) {
  const need = ['fill', 'tiles', 'scripts', 'levelScripts', 'bossScript',
                'blankFrames', 'holdFrames', 'sprite'];
  const missing = need.filter((k) => spec?.[k] === undefined);
  if (!spec || missing.length) {
    throw new Error(
      `assets/manifest.json ${!spec ? 'has no "stageIntro" section'
        : '"stageIntro" is missing: ' + missing.join(', ')}. `
      + 'Most likely a stale cached copy -- hard-reload the page. '
      + 'If that does not help, re-run: python tools/export_assets.py');
  }
  return spec;
}

/**
 * The $C61B buffer sub_00_0A0E is handed on frame 63.
 *
 * $3404-$341B copies `len` bytes -- the length byte of the record, also stored
 * in $FFA0 -- and loc_00_343A then copies 0:$3485's 31 bytes to $C61B + $FFA0.
 * For a boss that lands exactly one past the last record, so the appended
 * script's own $00 is the only terminator in the buffer. Concatenating is
 * therefore the literal thing, not a convenience.
 */
export function stageIntroTextScript(spec, level) {
  const own = spec.levelScripts[String(level)];
  if (own === undefined) {
    throw new Error(`stageIntro: no level script for level ${level} -- `
      + 're-run: python tools/export_assets.py');
  }
  const script = b64(own);
  if (!INTRO_BOSS_LEVELS.includes(level)) return script;
  const boss = b64(spec.bossScript);
  const out = new Uint8Array(script.length + boss.length);
  out.set(script, 0);
  out.set(boss, script.length);
  return out;
}

/**
 * Build the card's VRAM.  ROM: $336F-$3382 plus the three scripted frames.
 *
 * @param spec   manifest.stageIntro
 * @param level  $FFB0
 * @param base   the VRAM the previous screen left; copied, never mutated
 * @param run    the script interpreter, passed in to keep vram.js acyclic
 * @param stage  how many of the three scripted frames have run (0..3). The
 *               card paints itself over three frames and the port shows each
 *               of them, so the intermediate images are real states.
 */
export function buildStageIntroVram(spec, level, base, run, stage = 3) {
  const vram = base ? Uint8Array.from(base) : new Uint8Array(0x2000);

  // $3371: sub_00_34A4 with D = $DC. Runs with the LCD OFF (sub_00_09DD) and
  // leaves $9A3F alone -- see fillTilemap.
  fillTilemap(vram, spec.fill);

  // $3374-$3382: resources $02, $1D, $05 through sub_00_0B15, in that order.
  for (const t of spec.tiles) blockCopy(vram, t.dest, b64(t.bytes));

  if (stage >= 1) run(vram, b64(spec.scripts[0]));      // $33A6, frame 61
  if (stage >= 2) run(vram, b64(spec.scripts[1]));      // $33D5, frame 62
  if (stage >= 3) run(vram, stageIntroTextScript(spec, level));  // $3404/$343A
  return vram;
}

/**
 * Assemble everything one showing of the card needs.
 *
 * @param base  the finished VRAM of the screen before it, or null.
 *
 * MEASURED (tools/oracle/introdiff.mjs, all eight levels): it does not matter.
 * rLCDC is $E7, so the BG reads $8800 SIGNED, and every tile id the visible
 * 20x18 window uses -- plus both halves of every one of the emblem's 40
 * sprites -- lands inside the three resources the card loads for itself. Build
 * it over the cartridge's own base or over a blank 8 KB buffer and the visible
 * screen is byte-identical either way. That is what makes it safe to show on a
 * BOSS level, which is entered from the previous LEVEL ($2836) and whose VRAM
 * the port does not model at all. Pass the real base where you have it, so the
 * whole 8 KB stays comparable; pass null where you do not.
 */
export function loadStageIntro(manifest, level, base = null) {
  const spec = requireStageIntroSpec(manifest.stageIntro);
  const vram = buildStageIntroVram(spec, level, base,
                                   (v, s) => runVramScript(v, s), 0);
  return {
    spec,
    level,
    vram,
    // sub_00_0A7F reads its ramps from 0:$0B09/$0B11, which manifest.title
    // already carries -- the same two tables, not a second copy of them.
    fadeSpec: requireFadeRamps(manifest),
    // The tile area is written once, on frame 0, and never again -- the three
    // scripts only touch $98xx/$99xx. So one cache serves the whole card.
    tiles: buildTileCache(vram),
    // A VIEW, not a copy: the scripts run against the map through this and the
    // renderer has to see the result.
    bgMap: vram.subarray(0x1800, 0x1C00),
  };
}

/** ROM: $3369-$3390. Everything before the blank hold. */
export function showStageIntro(state, art) {
  const spec = art.spec;
  state.video.bgMap = art.bgMap;
  state.level.tiles = art.tiles;
  state.video.sprites.length = 0;
  state.video.scx = 0;                 // $FFA9, untouched here and already 0
  state.video.scy = 0;                 // $FFAA, likewise
  // rLCDC $E7 at $338D. The window is enabled but rWY is still $90, so it sits
  // one line below the screen and paints nothing -- measured, $9C00-$9FFF is
  // not touched by any of this.
  state.video.windowY = 0x90;
  state.video.windowLatchY = 0x90;
  // $3386: rIE = $05. Bit 1 is CLEAR, so the $0048 STAT vector is masked off
  // and no raster program runs while the card is up -- the same reason the
  // menus have no scanline effects (SAVEPOINT, item 2 under "not ported").
  // Without this a card shown between two LEVELS inherits the last one's mode
  // and gets a parallax band across it.
  if (state.raster) {
    state.raster.mode = RASTER_OFF;
    state.raster.delta = 0;
    state.raster.closing = 0;
  }
  state.camera.x = 0;
  state.camera.y = 0x1000;             // cameraPixels subtracts the $10 bias

  // loc_00_3365, route starts only: $FF8A <- $FF8E. The bosses do NOT get this.
  if (INTRO_ROUTE_LEVELS.includes(art.level)) state.player.hp = state.player.hpMax;

  state.stageIntro = {
    art,
    frame: 0,
    stage: 0,                          // scripts applied so far
    hold: 0,                           // $C712, armed at $345D
    fade: null,
  };

  // $3369: LD BC,$0104 -> sub_00_0AE1. B is the id and C the mask (§32), so
  // this is cue $01 with mask $04 -- and $04 is NOT the stop-all mask the
  // menus use, so whatever was playing keeps playing underneath.
  requestSound(state, spec.sound?.id ?? 0x01, spec.sound?.mask ?? 0x04);
}

/**
 * One frame of the card.
 *
 * @returns 'intro' while it should keep running, 'done' at $3484 (or at either
 *          `RET NZ`, which is the same exit as far as the caller is concerned).
 */
export function tickStageIntro(state) {
  const s = state.stageIntro;
  const spec = s.art.spec;

  // $FFB1 ticks in VBlank whatever screen is up, and the emblem is redrawn
  // every frame from a queue nothing else clears here.
  state.frame = (state.frame + 1) & 0xFF;
  state.video.sprites.length = 0;
  s.frame++;

  // $347F: sub_00_0A7F, C = 0. Reached only by running the hold out; it is not
  // cancellable and it does not draw ($0A7F has no sub_00_0BC6 in it).
  if (s.fade) {
    if (!tickFade(s.fade, state.video)) {
      s.fade = null;
      return 'done';                                   // $3484
    }
    return 'intro';
  }

  // Every other frame of the card draws the emblem and then clears the tail of
  // shadow OAM ($33C2/$33F1/$3454/$3468 -> sub_00_0BC6, then sub_00_0C1F).
  drawEmblem(state, s);

  const blank = spec.blankFrames;                      // $3390: B = $3C
  if (s.frame <= blank) {
    // $3394: BIT 3 of $FFE2, tested AFTER the wait -- so the earliest possible
    // exit is the end of frame 1, never before one frame has been shown.
    if (state.input.pressed & BTN.START) return 'done';   // $3398: RET NZ
    return 'intro';
  }

  // $33A6 / $33D5 / $3404: one script per frame, and no START test between
  // them.
  //
  // The cartridge copies the script into $C61B and lets the VBlank ISR at
  // $0714 run it, so its writes land in the VBlank that ENDS this frame and
  // the hardware first shows them on the next one. The port applies them here
  // and renders afterwards, so the border appears one displayed frame earlier
  // -- the same tick-then-render convention title.js's press-start flash uses,
  // and the VRAM state after each tick is what introdiff.mjs compares (the
  // cartridge's own snapshots are taken at $33CB / $33FA / $3462, i.e. after
  // the matching sub_00_0A4F has returned).
  if (s.stage < 3) {
    s.stage++;
    applyStage(s);
    if (s.stage === 3) s.hold = spec.holdFrames;       // $345D: $C712 = $B4
    return 'intro';
  }

  // loc_00_3462. START first ($3471), then the countdown ($3476-$347D).
  if (state.input.pressed & BTN.START) return 'done';  // $3475: RET NZ
  s.hold = (s.hold - 1) & 0xFF;
  if (s.hold !== 0) return 'intro';
  s.fade = createFade(s.art.fadeSpec, 0x00);           // $347F: LD C,$00
  return 'intro';
}

/**
 * The card is shown from level load, where nothing has loaded manifest.title
 * for it -- so resolve the ramps once and THROW if they are absent. A default
 * would fade to a plausible-looking wrong palette.
 */
function requireFadeRamps(manifest) {
  const t = manifest?.title;
  if (!t?.fadeBgp || !t?.fadeObp1) {
    throw new Error('stageIntro: manifest.title.fadeBgp/fadeObp1 missing -- '
      + 're-run: python tools/export_assets.py');
  }
  return { fadeBgp: t.fadeBgp, fadeObp1: t.fadeObp1 };
}

function applyStage(s) {
  const { spec, level, bgMap } = s.art;
  // The scripts address $98xx/$99xx, i.e. the BG map, so run them against the
  // map view with the map's own base -- and the view is a subarray of the card's
  // VRAM, so the tile cache and the renderer both see the result.
  const script = s.stage === 1 ? b64(spec.scripts[0])
    : s.stage === 2 ? b64(spec.scripts[1])
      : stageIntroTextScript(spec, level);
  runVramScript(bgMap, script, { base: 0x9800 });
}

/** $3463-$3468: metasprite $F2 at BC = $5858, attr mask 0. 40 records. */
function drawEmblem(state, s) {
  const manifest = state.titleManifest;
  if (!manifest) return;
  const sp = s.art.spec.sprite;
  drawMetasprite(state, manifest.metasprites.table1, sp.id,
                 sp.x - 8, sp.y - 16, 0);
}

export function hideStageIntro(state) {
  state.video.bgMap = null;
  state.stageIntro = null;
}

function requestSound(state, id, mask) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

/** The VRAM offset a script destination lands at; exported for the tests. */
export const MAP_BASE = 0x9800 - VRAM_BASE;
