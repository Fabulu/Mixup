// Title screen.  ROM: built at $027D, looped at loc_00_02C4, left through
// loc_00_030E -> loc_00_031B.
//
// The real thing clears the tilemap to $2F, runs two VRAM scripts through
// sub_00_0A0E (5:$5170 for the artwork, 1:$7C44 for the text), starts the
// title music, then fades in with sub_00_0A7F.
//
// NOTHING here is captured any more. The VRAM is BUILT: two bank-6 tile blobs,
// the boot clear, and the three scripts, all out of the manifest --
// tools/oracle/titlediff.mjs holds the built image against the cartridge's own
// and all 8192 bytes agree. And assets/title.json, the eight LCD registers, is
// gone too: every one of them is an immediate in the boot path or an entry in
// sub_00_0A7F's own palette ramp, and tools/oracle/titleflash.py reads all
// eight off the running cartridge to prove the derivation.

import { buildTileCache, loadManifest } from './assets.js';
import { buildTitleVram, requireScreenSpec } from './vram.js';
import { runVramScript } from './vramscript.js';
import { BTN } from './player.js';
import { drawMetasprite } from './render/metasprite.js';

/** Decode one base64 blob from the manifest. */
function b64(s) {
  const bin = typeof atob === 'function'
    ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------------------------------------------------------------------
 * sub_00_0A7F -- the palette fade, and the only reason title.json existed
 * ------------------------------------------------------------------------- */

/**
 * B counts $21 down to $01, so a fade is exactly 33 frames, and a palette step
 * happens on the four iterations where `B & 7 == 0` -- $20, $18, $10 and $08.
 * MEASURED on the fade OUT of the title (tools/oracle/titleflash.py): the
 * shadows change at frame offsets 10, 18 and 26 from $0350, which is those
 * iterations exactly; the step at iteration 2 writes the value already there.
 *
 * $C70E is the ramp index. A fade IN (C bit 7 set, i.e. $02C1's `LD C,$80`)
 * starts at 3 and counts DOWN, so it ends on entry 0 -- $E4/$E4/$C4, which is
 * precisely what the old capture recorded.
 */
export const FADE_FRAMES = 0x21;

export function createFade(spec, mode) {
  return { b: FADE_FRAMES, step: (mode & 0x80) ? 3 : 0, mode, spec };
}

/**
 * One frame of sub_00_0A7F. Returns true while the fade is still running.
 *
 * The low bits of C select which palettes move, and the branch structure is
 * not a switch -- `CP 2` at $0A95 jumps INTO the middle of the routine and
 * `CP 1` at $0AB4 jumps past its tail:
 *   0  everything            1  BG only         2  OBJ only
 *   3  everything, but BGP reads the SECOND ramp at $0B09+4 ($0AA4)
 */
export function tickFade(f, video) {
  if (f.b === 0) return false;
  if ((f.b & 7) === 0) {
    const c = f.mode & 0x7F;
    const e = f.step;
    if (c !== 2) {                                  // $0A95
      video.bgp = f.spec.fadeBgp[c === 3 ? e + 4 : e];        // $0AAE -> $FFAD
    }
    if (c !== 1) {                                  // $0AB4
      video.obp0 = f.spec.fadeBgp[e];               // $0AC3 -> $FFAE
      video.obp1 = f.spec.fadeObp1[e];              // $0ACA -> $FFAF
    }
    f.step += (f.mode & 0x80) ? -1 : 1;             // $0ACC-$0AD7
  }
  f.b -= 1;                                         // $0ADD
  return f.b !== 0;
}

/* ------------------------------------------------------------------------- */

export async function loadTitle() {
  const manifest = await loadManifest();
  const spec = requireScreenSpec(manifest.title, 'title');
  if (!spec.lcd) {
    throw new Error('assets/manifest.json title section has no "lcd" block '
      + '-- re-run: python tools/export_assets.py');
  }

  const vram = buildTitleVram({
    tiles: spec.tiles.map((t) => ({ dest: t.dest, bytes: b64(t.bytes) })),
    scripts: spec.scripts.map(b64),
    fill: spec.fill,
  }, (v, script) => runVramScript(v, script));
  return {
    vram,
    tiles: buildTileCache(vram),
    bgMap: vram.slice(0x1800, 0x1C00),   // $9800, 32x32
    // $9C00, the WINDOW map -- a VIEW, not a copy, because the options screen
    // paints its difficulty word and sound number straight into it. The panel
    // text is already there: the title's own scripts wrote it.
    windowMap: vram.subarray(0x1C00, 0x2000),
    // loc_00_031B's two scripts. The "on" one IS the title's own text script,
    // re-run whole; only the eraser is separate ROM data.
    flashOn: b64(spec.scripts[2]),
    flashOff: b64(spec.flashOff),
    fadeBgp: spec.fadeBgp,
    fadeObp1: spec.fadeObp1,
    lcd: spec.lcd,
  };
}

/**
 * Point the renderer at the title instead of a level.
 *
 * The eight LCD registers are the manifest's now, and every one is derived:
 *   rLCDC  $02BC's `LD A,$E7`, written straight to the register at $02BD
 *   rSCX   never written on this path at all -- the 0 that $0160's HRAM clear
 *          left in the $FFA9 shadow
 *   rSCY   $021D's `XOR A` -> $FFAA
 *   rWX    $0216's `LD A,$07` -> $FFAB
 *   rWY    $02A8's `LD A,$90` -> $FFAC, re-armed just before the text script
 *   rBGP/rOBP0/rOBP1  the end of $02C1's fade IN, i.e. entry 0 of the ramps at
 *          0:$0B09 and 0:$0B11
 * The shadows are pushed to the hardware registers in the VBlank ISR at
 * $0806-$0817, so writing the shadow IS writing the register.
 */
export function showTitle(state, title, withFade = true) {
  const lcd = title.lcd;
  // $02AB, re-run. The press-start flash leaves START ERASED -- its last
  // iteration is B = 1, and `1 & 8` is 0 -- and the cartridge only ever
  // returns here through $027D, which rebuilds the whole screen. Without this
  // the word is missing the second time the title is shown.
  runVramScript(title.bgMap, title.flashOn, { base: 0x9800 });
  state.video.bgMap = title.bgMap;
  state.video.scx = lcd.scx;
  state.video.scy = lcd.scy;
  state.video.obp0 = lcd.obp0;
  state.video.obp1 = lcd.obp1;
  state.video.bgp = lcd.bgp;
  state.level.tiles = title.tiles;
  state.video.sprites.length = 0;
  state.camera.x = 0;
  state.camera.y = 0x1000;             // cameraPixels subtracts the $10 bias
  state.title = {
    frame: 0, cheat: 0, cursor: 0,     // $C712: 0 START, 1 OPTION
    art: title,
    // $02C1: LD C,$80 -> sub_00_0A7F. The loop at $02C4 is not reached until
    // this returns, so the title genuinely ignores input for 33 frames.
    //
    // `withFade` false is the OPTIONS return: $3934 is a bare `JP loc_00_02C4`
    // and re-runs neither the build nor the fade.
    fade: withFade ? createFade(title, 0x80) : null,
    flash: null,
  };

  // $02A1: LD BC,$0003 -> sub_00_0AE1. Song $00 is the title theme, and mask
  // $03 is play + stop-all, so it replaces whatever was running.
  //
  // This is not optional tidying: boot() runs initLevel() BEFORE the title is
  // shown, which has already queued the level's own musicFresh ($02 for level
  // 1). Without this the title screen plays the first level's theme, and the
  // two sound identical because they are.
  requestSound(state, 0x00, 0x03);
}

export function hideTitle(state) {
  state.video.bgMap = null;
  state.title = null;
}

/**
 * One title frame.  ROM: loc_00_02C4, and the two states that hang off it.
 *
 * @returns 'title' while it should keep running, 'options' for $3893, or
 *          'start' once the whole press-start sequence has finished. That is
 *          NOT the frame START is pressed: $030E falls into loc_00_031B, 120
 *          frames of blinking, then a 33-frame fade -- 153 frames before
 *          $035B, measured.
 */
export function tickTitle(state) {
  const t = state.title;
  t.frame++;

  // $FFB1 ticks in VBlank, so it advances on the title too -- the cursor blink
  // is derived from it. And nothing else clears shadow OAM here: tick() owns
  // that line, and tick() does not run while the title is up.
  state.frame = (state.frame + 1) & 0xFF;
  state.video.sprites.length = 0;

  // $02C1's fade blocks before the loop head is ever reached: no cursor, no
  // input, nothing but sub_00_0A4F for 33 frames.
  if (t.fade) {
    if (!tickFade(t.fade, state.video)) t.fade = null;
    return 'title';
  }

  // loc_00_031B: state 4, reached from START at $030E and from the cheat at
  // $02D8. The title loop does not run during it.
  if (t.flash) return tickFlash(state, t);

  // $02C7: the hidden cheat is an exact match on the newly-pressed byte --
  // B + SELECT + LEFT together and nothing else. Sets $C75C, which later
  // spawns the rescue helper during boss fights -- and then `JP loc_00_031B`,
  // so the cheat STARTS THE GAME. It is not a toggle you press and stay.
  if (state.input.pressed === 0x26) {
    t.cheat = 1;
    state.flow.rescueCheat = 1;
    requestSound(state, 0x13);                  // $02D2
    t.flash = { b: 0x78, fade: null };           // $02D8 -> loc_00_031B
    return 'title';
  }

  // $02DB: UP or DOWN (either one) flips the selection and plays $0E.
  if (state.input.pressed & (BTN.UP | BTN.DOWN)) {
    t.cursor ^= 1;                              // $02F9: XOR $01 on $C712
    requestSound(state, 0x0E);
  }

  drawCursor(state, t);

  // $02E7 -> $030E: START acts on the selection.
  if (state.input.pressed & BTN.START) {
    if (t.cursor !== 0) return 'options';       // $0312 -> loc_00_3893
    requestSound(state, 0x0D);                  // $0315
    t.flash = { b: 0x78, fade: null };          // falls into loc_00_031B
  }
  return 'title';
}

/**
 * State 4, one frame.  ROM: loc_00_031D-$0358.
 *
 * MEASURED (tools/oracle/titleflash.py): $031D runs exactly 120 times, then
 * $0350's fade takes 33 more, then $035B. The blink is `B & $08` over a B that
 * counts DOWN from $78, so the word START is on for one frame, off for eight,
 * on for eight, and so on -- and the recorded $9967 tile id is $9C/$2F in
 * exactly that pattern.
 *
 * The "on" script is 1:$7C44 whole, all 19 bytes: it repaints OPTIONS as well,
 * unchanged, every time. The "off" script is a single RLE record covering the
 * five cells of START alone, which is why OPTIONS never blinks.
 *
 * Neither is CALLed here -- $0333 copies the bytes into the WRAM buffer at
 * $C61B and the VBlank ISR at $0714 runs them. Same mechanism as round
 * select's route digit and the options panel's difficulty word.
 */
function tickFlash(state, t) {
  const f = t.flash;

  if (f.fade) {                                 // $0350: LD C,$00
    if (tickFade(f.fade, state.video)) return 'title';
    requestSound(state, 0x01, 0x03);            // $0355: LD BC,$0103
    t.flash = null;
    return 'start';                             // $035B
  }

  drawCursor(state, t);                         // $031E-$032C, every frame

  // $0336: LD A,B / AND $08.
  const script = (f.b & 0x08) ? t.art.flashOn : t.art.flashOff;
  runVramScript(state.video.bgMap, script, { base: 0x9800 });

  f.b = (f.b - 1) & 0xFF;                       // $034D
  if (f.b === 0) f.fade = createFade(t.art, 0x00);
  return 'title';
}

/**
 * ROM: sub_00_0FCC, called from $0309 with the row picked at $02FE -- and from
 * $032C during the flash, with the row picked the same way.
 *
 * A 4-frame blink cycling metasprites $19/$C9/$CA/$CB from the table at
 * 0:$3337, indexed by (frame & $18) >> 3. The two rows are OAM Y $64 and $74
 * at OAM X $28; the hardware's 8/16 px OAM offsets cancel against our
 * screen-space sprite queue, exactly as they do for the player.
 */
const CURSOR_IDS = [0x19, 0xC9, 0xCA, 0xCB];
const CURSOR_X = 0x28 - 8;
const CURSOR_Y = [0x64 - 16, 0x74 - 16];

function drawCursor(state, t) {
  const manifest = state.titleManifest;
  if (!manifest) return;
  const id = CURSOR_IDS[(state.frame & 0x18) >> 3];
  drawMetasprite(state, manifest.metasprites.table1, id,
                 CURSOR_X, CURSOR_Y[t.cursor], 0);
}

function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
