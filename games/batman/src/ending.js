// The ENDING.  ROM: loc_00_3652, reached from loc_00_35E8's dispatch of a
// cleared level -- `$35F6: CP $0E / JR Z, loc_00_3652`, i.e. by finishing level
// 14 and by nothing else.  The three other boss levels set a bit in $C753 and
// go back to round select; only level 14 comes here.
//
// It is the last screen in the game and it has no main loop: like the title,
// round select and the stage-intro card it is straight-line code punctuated by
// sub_00_0A4F, so one $0A4F call is one frame and nothing else advances time.
//
// MEASURED end to end against the cartridge (tools/oracle/ending.py):
// **4137 frames** from $3652 to the START wait at $3887.
//
//   frame     0   $3652: LD D,$7E -> sub_00_34A4 (LCD off, BG map filled, OAM
//                 cleared, $FFAD/$FFAE = $E4) and FOUR resources through
//                 sub_00_0B15: $02 $1D $21 $23.  These are the ONLY tile loads
//                 in the whole sequence -- everything after this re-fills the
//                 map and repaints it, and $8000-$97FF is never touched again.
//                 Then 7:$7E09 straight through sub_00_0A0E (not queued via
//                 $C61B: the LCD is off), $FFAD = $FF, $C712 = 0, rIE = $05,
//                 rLCDC = $E7.  All of it costs zero frames.
//     1- 180   $3698, B = $B4.  A black screen ($FFAD = $FF).
//   181- 213   $36A0: sound $0A mask $03, then a 33-frame ramp that walks
//                 0:$3A31 (FF AB 5B 1B) into $FFAD every 8th frame.  This is
//                 NOT sub_00_0A7F -- it is hand-rolled, and its table is not
//                 $0B09's.  Picture 1 fades up out of black.
//   214- 645   $36BE, BC = $01B0: 432 frames held.
//   646- 678   $36C9: sub_00_0A7F C = $03, which fades BGP down the SECOND
//                 ramp ($0B09+4 = 1B 06 01 00) -- to WHITE, not to black.
//   679-1143   picture 2: fill $7E + 7:$7EAF, fade in C = $83, 432 held.
//  1144-1176   fade out C = $03.
//  1177-1641   picture 3: fill $7E + 7:$7F70, fade in C = $83, 432 held --
//                 and then NO fade out.  The cut to the credits happens with
//                 the LCD off, which is why $370E has no sub_00_0A7F before it.
//  1642-1674   picture 4: fill $6E (a different tile), 7:$7960, $FFAD/$FFAE/
//                 $FFAF all zeroed, fade in C = $80.
//  1675-3847   the text crawl, 13 iterations ($C712 counts 0 -> $0D at $3840):
//                 B frames of nothing ($3C the first time, $20 after),
//                 1:$7B34 then 1:$7B49 -- the credit box painted in tile $7E,
//                 7:$7BFC[$C712] -> {len, script} -- the line itself,
//                 $C713 = $80: 128 frames held,
//                 1:$7B5E then 1:$7B73 -- the same box in $6E, erasing it.
//               Each iteration is B + 133 frames: 193 then 165 x 12 = 2173.
//  3848-3967   $3849, B = $78: 120 frames.
//  3968-4000   $3851: sub_00_0A7F C = $00.
//  4001-4104   THE END: fill $7E, palettes zeroed, OAM cleared, 1:$7B88,
//                 B = $68: 104 frames.
//  4105-4137   $387F: sub_00_0A7F C = $80.
//  4138-       $3887: the ONLY $FFE2 read in the whole sequence.  START ->
//                 JP loc_00_0150, a full reset.
//
// So **START skips nothing**: there is no BIT 3,$FFE2 anywhere between $3652
// and $3887.  Measured too -- mashing START for all 4137 frames lands on $3887
// on the same frame as a run that never touches it.
//
// BANKS.  $3675/$36DD/$371D/$3758 run with bank 7 mapped; $375F switches back
// to bank 1 and only the credit lookup ($37BD-$37DF) leaves it.  So
// 1:$7B34/$7B49/$7B5E/$7B73/$7B88 are BANK 1 -- 7:$7B34 is unrelated data that
// happens to look plausible.  $C703 confirms it on the cartridge.

import { buildTileCache } from './assets.js';
import { blockCopy, fillTilemap, VRAM_BASE } from './vram.js';
import { runVramScript } from './vramscript.js';
import { createFade, tickFade } from './title.js';
import { BTN } from './input.js';
import { RASTER_OFF } from './raster.js';
import { drawMetasprite } from './render/metasprite.js';

/** $35F6: the one level whose clear runs the ending. */
export const ENDING_LEVEL = 0x0E;

/** sub_00_34A4's tail, $34C6-$34CA: BGP and OBP0 only -- OBP1 is NOT written. */
const FILL_BGP = 0xE4;

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
 * A missing table must THROW: tile 0 and metasprite id 0 are both valid, so a
 * default looks plausible and is wrong -- and there is no later screen to
 * notice a half-built ending on.
 */
export function requireEndingSpec(spec) {
  const need = ['fill', 'fill4', 'tiles', 'pictures', 'theEnd', 'boxOn',
                'boxOff', 'credits', 'blackBgp', 'ramp', 'rampFrames',
                'blankFrames', 'holdFrames', 'crawlFirstWait', 'crawlWait',
                'textHold', 'crawlCount', 'tailFrames', 'endFrames', 'fades',
                'sprite'];
  const missing = need.filter((k) => spec?.[k] === undefined);
  if (!spec || missing.length) {
    throw new Error(
      `assets/manifest.json ${!spec ? 'has no "ending" section'
        : '"ending" is missing: ' + missing.join(', ')}. `
      + 'Most likely a stale cached copy -- hard-reload the page. '
      + 'If that does not help, re-run: python tools/export_assets.py');
  }
  if (spec.credits.length !== spec.crawlCount) {
    throw new Error(`ending: ${spec.credits.length} credit lines but $3840 `
      + `counts to ${spec.crawlCount} -- re-run: python tools/export_assets.py`);
  }
  return spec;
}

/**
 * The tile area, built once.  ROM: $3652-$366A.
 *
 * The fill is part of the same sub_00_34A4 call, so it is here too, but every
 * later screen re-fills the map and the four resources are never reloaded.
 *
 * @param base  the VRAM the STAGE CLEAR screen left; copied, never mutated.
 */
export function buildEndingVram(spec, base) {
  const vram = base ? Uint8Array.from(base) : new Uint8Array(0x2000);
  fillTilemap(vram, spec.fill);                       // $3652: LD D,$7E
  // $3657-$366A, IN ORDER: $23 lands at $8C70 and overlaps $1D's $8C80 start,
  // and $23 is loaded last, so the order is load-bearing.
  for (const t of spec.tiles) blockCopy(vram, t.dest, b64(t.bytes));
  return vram;
}

/**
 * One of the four picture builds: re-fill the map, then run its script.
 *
 * All four scripts address $9800-$9A34 only -- measured, not assumed -- so the
 * tile area survives untouched from the one build at $3652.
 *
 * @param n  0..3 for $3675 / $36DD / $371D / $3758.
 */
export function buildEndingPicture(spec, vram, n) {
  fillTilemap(vram, n === 3 ? spec.fill4 : spec.fill);
  runVramScript(vram, b64(spec.pictures[n]));
  return vram;
}

/* -------------------------------------------------------------------------
 * The step program
 *
 * The ending is straight-line code, so the port is a straight-line list. Steps
 * that cost no frames (`build`, `line`) run at the head of the tick that also
 * runs the next frame-consuming one, which is exactly what the cartridge does:
 * every build sits between two sub_00_0A4F calls and the recorder measures it
 * at zero frames.
 * ---------------------------------------------------------------------- */

/** sub_00_0A7F's `LD B,$21` at $0A8B. Not a manifest value -- title.js owns it. */
export const FADE_FRAMES = 0x21;

/** @returns the ROM's own sequence as data. Exported so the tests can walk it. */
export function endingProgram(spec) {
  const F = spec.fades;
  const p = [];
  // $3652. `bgp` is $3685's LD A,$FF, applied after sub_00_34A4's own $E4.
  p.push({ k: 'build', pic: 0, bgp: spec.blackBgp, at: 0x3652 });
  p.push({ k: 'wait', n: spec.blankFrames, at: 0x3698 });
  p.push({ k: 'ramp', n: spec.rampFrames, at: 0x36A6 });
  p.push({ k: 'wait', n: spec.holdFrames, at: 0x36BE });
  p.push({ k: 'fade', c: F[0], at: 0x36C9 });
  p.push({ k: 'build', pic: 1, at: 0x36CE });
  p.push({ k: 'fade', c: F[1], at: 0x36F9 });
  p.push({ k: 'wait', n: spec.holdFrames, at: 0x36FE });
  p.push({ k: 'fade', c: F[2], at: 0x3709 });
  p.push({ k: 'build', pic: 2, at: 0x370E });
  p.push({ k: 'fade', c: F[3], at: 0x3739 });
  p.push({ k: 'wait', n: spec.holdFrames, at: 0x373E });
  // $3749: fill $6E, and $376B-$376F zeroes all three palettes.
  p.push({ k: 'build', pic: 3, bgp: 0, obp0: 0, obp1: 0, at: 0x3749 });
  p.push({ k: 'fade', c: F[4], at: 0x377A });
  for (let i = 0; i < spec.crawlCount; i++) {
    p.push({ k: 'line', v: i, at: 0x3839 });
    p.push({ k: 'wait', n: i ? spec.crawlWait : spec.crawlFirstWait,
             at: i ? 0x3844 : 0x377F });
    p.push({ k: 'script', s: ['boxOn', 0], sprite: true, at: 0x3787 });
    p.push({ k: 'script', s: ['boxOn', 1], sprite: true, at: 0x37A2 });
    p.push({ k: 'script', s: ['credits', i], sprite: true, at: 0x37C7 });
    p.push({ k: 'wait', n: spec.textHold, sprite: true, c713: true, at: 0x37FD });
    // $3815/$3827 draw NO sprite -- only sub_00_0C1F, which wipes the whole
    // shadow OAM because nothing queued anything into it.
    p.push({ k: 'script', s: ['boxOff', 0], at: 0x3815 });
    p.push({ k: 'script', s: ['boxOff', 1], at: 0x3827 });
  }
  p.push({ k: 'line', v: spec.crawlCount, at: 0x3839 });
  p.push({ k: 'wait', n: spec.tailFrames, at: 0x3849 });
  p.push({ k: 'fade', c: F[5], at: 0x3851 });
  // $3856: fill $7E again, palettes zeroed ($385B), OAM cleared AGAIN ($3862),
  // then 1:$7B88 -- run directly, LCD off, like the four pictures.
  p.push({ k: 'build', pic: 'theEnd', bgp: 0, obp0: 0, obp1: 0, at: 0x3856 });
  p.push({ k: 'wait', n: spec.endFrames, at: 0x3877 });
  p.push({ k: 'fade', c: F[6], at: 0x387F });
  p.push({ k: 'quit', at: 0x3887 });
  return p;
}

/** How many frames the program costs before the START wait. MEASURED: 4137. */
export function endingLength(spec) {
  return endingProgram(spec).reduce(
    (n, s) => n + (s.k === 'wait' || s.k === 'ramp' ? s.n
      : s.k === 'fade' ? FADE_FRAMES : s.k === 'script' ? 1 : 0), 0);
}

/**
 * Assemble everything one showing of the ending needs.
 *
 * @param base  the finished VRAM of the STAGE CLEAR screen, or null.
 *
 * MEASURED (tools/oracle/endingdiff.mjs): it does not matter for what is SEEN.
 * rLCDC is $E7, so the BG reads $8800 SIGNED, and every tile id the visible
 * 20x18 window uses across all six screens -- plus both halves of all 40 of the
 * emblem's sprites, which live at $8C80-$8DBF, inside resource $1D -- lands in
 * one of the four resources the ending loads for itself. Pass the real base
 * where you have it so the whole 8 KB stays comparable; pass null where you do
 * not, and the screen is identical either way.
 */
export function loadEnding(manifest, base = null) {
  const spec = requireEndingSpec(manifest.ending);
  const vram = buildEndingVram(spec, base);
  buildEndingPicture(spec, vram, 0);
  return {
    spec,
    vram,
    // The credit circle's metasprite table. Carried HERE rather than read from
    // state.titleManifest at draw time, because that field only exists when the
    // game booted through the title screen -- see drawEmblem.
    metasprites: manifest.metasprites,
    // sub_00_0A7F reads its ramps from 0:$0B09/$0B11, which manifest.title
    // already carries -- the same two tables, not a second copy of them.
    fadeSpec: requireFadeRamps(manifest),
    // The tile area is written once and never again, so one cache serves the
    // whole 4137 frames.
    tiles: buildTileCache(vram),
    // A VIEW, not a copy: the builds and the crawl scripts run against the map
    // through this and the renderer has to see the result.
    bgMap: vram.subarray(0x1800, 0x1C00),
  };
}

/** ROM: everything $3652 does before its first sub_00_0A4F. */
export function showEnding(state, art) {
  const spec = art.spec;
  state.video.bgMap = art.bgMap;
  state.level.tiles = art.tiles;
  state.video.sprites.length = 0;
  // sub_00_34A4's tail, $34BD-$34CA.
  state.video.scx = 0;                       // $FFA9
  state.video.scy = 0;                       // $FFAA
  state.video.windowY = 0x90;                // $FFAC -- the window paints nothing
  state.video.windowLatchY = 0x90;
  state.video.bgp = FILL_BGP;
  state.video.obp0 = FILL_BGP;
  // $3691/$36F2/$3732/$3773/$3870: rIE = $05. Bit 1 is CLEAR, so the $0048 STAT
  // vector is masked off and no raster program runs -- without this the ending
  // inherits level 14's raster mode and gets a scanline band across it.
  if (state.raster) {
    state.raster.mode = RASTER_OFF;
    state.raster.delta = 0;
    state.raster.closing = 0;
  }
  state.camera.x = 0;
  state.camera.y = 0x1000;                   // cameraPixels subtracts the $10 bias

  state.ending = {
    art,
    frame: 0,          // sub_00_0A4F calls so far
    pc: 0,             // index into the step program
    left: 0,           // frames left in the current step
    prog: endingProgram(spec),
    fade: null,
    armed: false,      // the current step has had its counter loaded
    line: 0,           // $C712, set to 0 at $368C
    // $C713 and $C70E are NOT initialised here, and the cartridge does not
    // initialise them either: both arrive holding whatever the STAGE CLEAR
    // fanfare left ($10 and 4, measured). Nothing reads either one before the
    // ending writes it -- $37F8 and $0A88 -- so the inherited value is inert.
    c713: 0,
    c713Pend: false,
    c70e: 0,
    done: false,
  };
}

export function hideEnding(state) {
  state.video.bgMap = null;
  state.ending = null;
}

/**
 * One frame of the ending.
 *
 * @returns 'ending' while it should keep running, 'done' on the frame START is
 *          accepted at $388E -- which is `JP loc_00_0150`, a full reset, not a
 *          return to any caller.
 */
export function tickEnding(state) {
  const s = state.ending;

  // $FFB1 ticks in VBlank whatever screen is up, and nothing here clears shadow
  // OAM except sub_00_0C1F, which every drawing frame calls for itself.
  state.frame = (state.frame + 1) & 0xFF;
  state.video.sprites.length = 0;
  s.frame++;

  // $380C's DEC runs AFTER the sub_00_0A4F it follows, so its result belongs to
  // the NEXT frame -- including the frame after the loop's last iteration,
  // where $C713 lands on 0 and the two erase frames see it there.
  if (s.c713Pend) { s.c713 = (s.c713 - 1) & 0xFF; s.c713Pend = false; }

  // Everything between two sub_00_0A4F calls is this frame's work, so the
  // zero-frame steps run here rather than at the tail of the frame before --
  // which is what makes the palette a build writes ($3685, $376B, $385B) show
  // up on the right frame and not one early.
  runZeroFrameSteps(state, s);

  const step = s.prog[s.pc];
  if (!step) return 'done';

  if (step.k === 'quit') {
    // $3884: XOR A -> $FFE2 before the loop, so a press during $387F's fade is
    // discarded. `pressed` is edge-derived per frame, so that is automatic.
    if (state.input.pressed & BTN.START) { s.done = true; return 'done'; }
    return 'ending';
  }

  if (step.k === 'fade') {
    const running = tickFade(s.fade, state.video);
    // $C70E is a BYTE: $0AD6's DEC takes the last step of a fade-IN from 0 to
    // $FF, where title.js's fade object -- which never has to store it -- keeps
    // a JS -1. Nothing reads it again before $0A88 rewrites it, so this is
    // bookkeeping, not behaviour; it is masked so the trace stays comparable.
    s.c70e = s.fade.step & 0xFF;
    if (!running) { s.fade = null; advance(s); }
    return 'ending';
  }

  if (step.k === 'ramp') {
    // $36AB. B counts $21 down to 1 and the test is on B, before the frame --
    // so `s.left` IS B. Writes land on the frames where B & 7 == 0, i.e. B =
    // $20/$18/$10/$08, the 2nd/10th/18th/26th. Same cadence as sub_00_0A7F's,
    // deliberately, but off a table sub_00_0A7F never reads.
    if ((s.left & 7) === 0) {
      const e = s.rampStep++;
      // $36B3 has no bound: E just keeps walking. Four writes is what the
      // cadence allows, so the table is never over-read on real data.
      if (e < s.art.spec.ramp.length) state.video.bgp = s.art.spec.ramp[e];
    }
    if (--s.left === 0) advance(s);
    return 'ending';
  }

  if (step.k === 'script') {
    applyScript(s, step);
    if (step.sprite) drawEmblem(state, s);
    advance(s);
    return 'ending';
  }

  // 'wait'
  if (step.c713) s.c713Pend = true;                   // $380C, after the wait
  if (step.sprite) drawEmblem(state, s);
  if (--s.left === 0) advance(s);
  return 'ending';
}

/* ------------------------------------------------------------------------- */

function advance(s) {
  s.pc++;
  s.armed = false;
}

/** Execute every step that costs no sub_00_0A4F call, then arm the next one. */
function runZeroFrameSteps(state, s) {
  if (s.armed) return;
  for (;;) {
    const step = s.prog[s.pc];
    if (!step) { s.armed = true; return; }
    if (step.k === 'build') { doBuild(state, s, step); s.pc++; continue; }
    if (step.k === 'line') { s.line = step.v; s.pc++; continue; }
    s.armed = true;
    if (step.k === 'fade') {
      s.fade = createFade(s.art.fadeSpec, step.c);
      // $C70E is a BYTE: $0AD6's DEC takes the last step of a fade-IN from 0 to
    // $FF, where title.js's fade object -- which never has to store it -- keeps
    // a JS -1. Nothing reads it again before $0A88 rewrites it, so this is
    // bookkeeping, not behaviour; it is masked so the trace stays comparable.
    s.c70e = s.fade.step & 0xFF;                          // $0A88, before frame 1
    } else if (step.k === 'ramp') {
      s.left = step.n;
      s.rampStep = 0;
      // $36A0: LD BC,$0A03 -> sub_00_0AE1. B is the id and C the mask (§32), so
      // this is cue $0A with mask $03 -- play + stop-all, which is what silences
      // level 14's music under the ending.
      const cue = s.art.spec.sound;
      requestSound(state, cue?.id ?? 0x0A, cue?.mask ?? 0x03);
    } else if (step.k === 'wait') {
      s.left = step.n;
      if (step.c713) { s.c713 = step.n; s.c713Pend = false; }   // $37F8
    }
    return;                                           // 'script' / 'quit' too
  }
}

/** sub_00_34A4 + one script, all with the LCD off. Costs zero frames. */
function doBuild(state, s, step) {
  const { spec, vram } = s.art;
  // sub_00_34A4: fill, then $34BD-$34CA's register tail, then sub_00_0A61.
  // bgMap is a VIEW of vram, so filling through vram is what the renderer sees.
  fillTilemap(vram, step.pic === 3 ? spec.fill4 : spec.fill);
  state.video.windowY = 0x90;
  state.video.windowLatchY = 0x90;
  state.video.scx = 0;
  state.video.scy = 0;
  state.video.bgp = FILL_BGP;
  state.video.obp0 = FILL_BGP;
  state.video.sprites.length = 0;
  const script = step.pic === 'theEnd' ? b64(spec.theEnd)
    : b64(spec.pictures[step.pic]);
  runVramScript(vram, script);
  if (step.bgp !== undefined) state.video.bgp = step.bgp;
  if (step.obp0 !== undefined) state.video.obp0 = step.obp0;
  if (step.obp1 !== undefined) state.video.obp1 = step.obp1;
}

/**
 * One of the crawl's $C61B scripts.
 *
 * The cartridge copies it into $C61B and lets the VBlank ISR at $0714 run it,
 * so its writes land in the VBlank that ENDS this frame. The port applies them
 * here and renders afterwards -- the same tick-then-render convention
 * stageintro.js uses, and the convention endingdiff.mjs compares against (the
 * cartridge's own snapshots are taken after the matching sub_00_0A4F returns).
 */
function applyScript(s, step) {
  const spec = s.art.spec;
  const [name, i] = step.s;
  runVramScript(s.art.vram, b64(spec[name][i]));
}

/**
 * $3793-$3799: `LD BC,$3838 / LD E,$F2 / XOR A / CALL sub_00_0BC6` -- metasprite
 * $F2 at OAM (56, 56), attr mask 0, 40 records.
 *
 * THIS IS THE CREDIT CIRCLE. The box scripts at 1:$7B34/$7B49 only fill a flat
 * RECTANGLE of tile $7E into the BG map (measured: five run-fills each, every
 * one a single repeated tile id). The smooth dithered oval is this metasprite
 * drawn on top of that rectangle. Without it you get the bare rectangle, with
 * hard 8-pixel stepped corners -- reported from play as "giant pixels at the
 * corners, more like tetris pieces than pixels".
 *
 * It used to read the table out of `state.titleManifest`, which is set ONLY
 * inside `if (title)` in main.js -- i.e. only when the game was booted through
 * the title screen. Boot straight into a level (or straight into the ending
 * from the launcher) and it was null, so this returned early and the whole
 * sprite layer silently vanished.
 *
 * Both oracle harnesses assigned `state.titleManifest` themselves, so both
 * always drew it and both reported the ending PIXEL-EXACT while the shipped
 * app rendered a bare rectangle. A harness that sets up state the application
 * does not have will pass while the application is broken -- see docs/03
 * lesson 38. They no longer set it.
 *
 * The manifest is carried on the art object now, which loadEnding already has
 * in hand, so the draw cannot depend on how the game was entered.
 */
function drawEmblem(state, s) {
  const table = s.art.metasprites || state.titleManifest?.metasprites;
  if (!table) return;
  const sp = s.art.spec.sprite;
  drawMetasprite(state, table.table1, sp.id, sp.x - 8, sp.y - 16, 0);
}

/**
 * The ending is entered from a level clear, where nothing has loaded
 * manifest.title -- so resolve the ramps once and THROW if they are absent.
 * A default would fade to a plausible-looking wrong palette.
 */
function requireFadeRamps(manifest) {
  const t = manifest?.title;
  if (!t?.fadeBgp || !t?.fadeObp1) {
    throw new Error('ending: manifest.title.fadeBgp/fadeObp1 missing -- '
      + 're-run: python tools/export_assets.py');
  }
  return { fadeBgp: t.fadeBgp, fadeObp1: t.fadeObp1 };
}

function requestSound(state, id, mask) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

/** The VRAM offset a script destination lands at; exported for the tests. */
export const MAP_BASE = 0x9800 - VRAM_BASE;
