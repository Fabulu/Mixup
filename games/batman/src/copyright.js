// The SUNSOFT copyright screen -- flow state 1, and the first thing the
// machine puts on screen.  ROM: built at $01FC-$023B, run at $0265-$0276.
//
// It was never ported. src/vram.js built its output only so fillTilemap could
// erase it again on the way to the title, and boot() went straight to
// showTitle -- so five seconds of hardware-visible, skippable content simply
// did not exist in the port. It is not on the "what is NOT ported" list
// either, which is the interesting part: nothing in the suite looked at flow
// state 1 at all.
//
// The whole screen, in ROM order:
//
//   $01FC-$0212  resources $02 and $1B -> the two tile blobs
//   $0215-$0221  rWX $07, rWY $90 (window parked), rSCY 0, $C712 0
//   $0223-$022C  refill $9C00-$9CDF with $2F -- redundant, the boot fill at
//                $01AB already covered $9800-$9FFE, but it is what runs
//   $0238        VRAM script 5:$52F5, the lettering
//   $0261        rLCDC $E7
//   $0265        LD C,$80 -> sub_00_0A7F: fade IN, 33 frames, blocking
//   $026A-$0276  LD B,$F0 and hold. MEASURED: the $026C loop runs exactly 240
//                times (tools/oracle/menushot.py, `copyright_loop_total`).
//                START ($FFE2 bit 3) breaks out early -- and the test comes
//                BEFORE the `DEC B`, so pressing it on the last iteration and
//                letting the counter expire are the same frame.
//   $0278        LD C,$00 -> sub_00_0A7F: fade OUT, 33 more
//   $027D        the title build takes over
//
// 306 frames in all if nobody presses anything.

import { buildTileCache, loadManifest } from './assets.js';
import { buildCopyrightVram, requireScreenSpec } from './vram.js';
import { runVramScript } from './vramscript.js';
import { BTN } from './input.js';
import { createFade, tickFade } from './title.js';

/** $026A: LD B,$F0. */
export const HOLD_FRAMES = 0xF0;

/** Decode one base64 blob from the manifest. */
function b64(s) {
  const bin = typeof atob === 'function'
    ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Build the screen. Everything comes out of `manifest.title`: the copyright
 * script IS that block's `scripts[0]` (5:$52F5) and the tile blobs are the two
 * boot resources the title inherits, so there is no second manifest section to
 * export and nothing here is captured.
 */
export async function loadCopyright(manifest = null) {
  const m = manifest || await loadManifest();
  const spec = requireScreenSpec(m.title, 'title');
  if (!spec.lcd) {
    throw new Error('assets/manifest.json title section has no "lcd" block '
      + '-- re-run: python tools/export_assets.py');
  }
  const vram = buildCopyrightVram({
    tiles: spec.tiles.map((t) => ({ dest: t.dest, bytes: b64(t.bytes) })),
    scripts: [b64(spec.scripts[0])],
  }, (v, script) => runVramScript(v, script));

  return {
    vram,
    tiles: buildTileCache(vram),
    bgMap: vram.slice(0x1800, 0x1C00),          // $9800, 32x32
    fadeBgp: spec.fadeBgp,
    fadeObp1: spec.fadeObp1,
    lcd: spec.lcd,
  };
}

/**
 * Point the renderer at the copyright screen.  ROM: $0215-$0267.
 *
 * The registers are the title's, and for the same reason: every one of them is
 * an immediate on this path and none of them is rewritten between here and
 * $02BD. rSCX is the 0 that $0160's HRAM clear left -- it is never written.
 *
 * The palettes start at ZERO, also from the HRAM clear, and $0265's fade walks
 * them up to $E4/$E4/$C4. MEASURED (menushot.py, snap `copyright` at loop
 * iteration 101): bgp/obp0/obp1 = $E4/$E4/$C4, wy $90, lcdc $E7, OAM empty.
 */
export function showCopyright(state, art) {
  const lcd = art.lcd;
  state.video.bgMap = art.bgMap;
  state.level.tiles = art.tiles;
  state.video.sprites.length = 0;
  state.video.scx = lcd.scx;                    // never written; the clear's 0
  state.video.scy = lcd.scy;                    // $021D: XOR A -> $FFAA
  state.video.windowX = lcd.wx;                 // $0217: LD A,$07 -> $FFAB
  state.video.windowY = lcd.wy;                 // $021B: LD A,$90 -> $FFAC
  state.video.windowLatchY = lcd.wy;
  state.video.windowMap = null;
  state.video.windowDither = false;
  // $0160's HRAM clear. The fade is the only thing that ever raises them.
  state.video.bgp = 0x00;
  state.video.obp0 = 0x00;
  state.video.obp1 = 0x00;
  state.camera.x = 0;
  state.camera.y = 0x1000;             // cameraPixels subtracts the $10 bias

  state.copyright = {
    art,
    hold: HOLD_FRAMES,                 // $026A
    fade: createFade(art, 0x80),       // $0265: LD C,$80
    out: false,
  };
}

export function hideCopyright(state) {
  state.video.bgMap = null;
  state.copyright = null;
}

/**
 * One frame.  ROM: $0265-$027A.
 *
 * @returns 'copyright' while it should keep running, 'done' once the fade OUT
 *          has finished -- which is $027D, where the title build starts.
 */
export function tickCopyright(state) {
  const c = state.copyright;
  // $FFB1 ticks in VBlank, and sub_00_0A7F / sub_00_0A4F are where the ISR
  // lands, so the counter advances through both fades and the hold even
  // though no game logic runs. Same reasoning as the title's.
  state.frame = (state.frame + 1) & 0xFF;
  state.video.sprites.length = 0;

  if (c.fade) {
    if (tickFade(c.fade, state.video)) return 'copyright';
    c.fade = null;
    // $0278's fade OUT ends the screen; $0265's leads into the hold.
    return c.out ? 'done' : 'copyright';
  }
  if (c.out) return 'done';            // already finished; nothing left to run

  // $026F-$0276. The START test comes BEFORE the `DEC B`, so a press and the
  // counter running out both arrive at $0278 the same way.
  if ((state.input.pressed & BTN.START) || --c.hold <= 0) {
    c.out = true;
    c.fade = createFade(c.art, 0x00);           // $0278: LD C,$00
  }
  return 'copyright';
}
