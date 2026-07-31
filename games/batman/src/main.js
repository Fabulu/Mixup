// Boot and frame loop.  ROM: init $0150, main loop $0567-$0650.
//
// The main loop's CALL ORDER is deliberately preserved: it is what determines
// OAM ordering (and therefore sprite priority) and platform-carry ordering.

import { createState, GAMEPLAY_PALETTES } from './state.js';
import { makeTunables } from './tunables.js';
import { attachInput, sampleInput, BTN } from './input.js';
import { initLevel, clearLevel } from './level.js';
import { updatePlayer } from './player.js';
// sub_00_29E7's tick. NOT part of the player chain -- the cartridge calls it
// from the main loop at $057A and $05EC, and both arms are in this file.
import { deathTick } from './player/death.js';
import { updateCamera } from './camera.js';
import { loadManifest, loadPlayerTiles } from './assets.js';
import { createFramebuffer, renderFrame, SCREEN_W, SCREEN_H } from './render/renderer.js';
import { drawPlayer, streamPlayerTiles, applyAnimHitbox,
         cachePlayerScreen, drawMetasprite } from './render/metasprite.js';
import { updateBatarangs, drawBatarangs } from './batarang.js';
import { updateRope } from './rope.js';
import { drawHud } from './hud.js';
import { updateBreakables } from './collision.js';
import { updateActors } from './actors.js';
import { updateEnemies, drawEnemies } from './enemies.js';
import { updateWater, updateSplashes, tickTileAnim } from './water.js';
import { updateDrops } from './drops.js';
import { updateDoors } from './doors.js';
import { updateVictoryHold, c740Idle } from './effects.js';
import { loadEnding, showEnding, tickEnding, hideEnding } from './ending.js';
import {
  showsStageIntro, loadStageIntro, showStageIntro, tickStageIntro,
  hideStageIntro,
} from './stageintro.js';
import { resolveLoadout, runHook } from './mods.js';
import { loadTitle, showTitle, hideTitle, tickTitle } from './title.js';
import {
  loadRoundSelect, showRoundSelect, hideRoundSelect, tickRoundSelect,
  continueLevel, ROUTE_LEVEL,
} from './roundselect.js';
import { showOptions, hideOptions, tickOptions } from './options.js';
import { tickRaster, rasterModeForLevel } from './raster.js';

import { Sound } from './sound/index.js';

const FRAME_MS = 1000 / 59.73;      // DMG frame rate

export async function boot(canvas, { level = 1, tunables = {}, mods = [],
                                     title = true, onOptions = null,
                                     onError = null, ending = false,
                                     difficulty = 1 } = {}) {
  // Mod params override the ROM defaults before anything reads them; explicit
  // `tunables` still wins last so a caller can force a single value.
  const loadout = resolveLoadout(mods);
  const state = createState(makeTunables({ ...loadout.tunables, ...tunables }));
  state.loadout = loadout;
  state.video.invert = loadout.render.invert;
  state.video.spriteScale = loadout.render.spriteScale || 1;
  state.video.batarangAnim = loadout.render.batarangAnim || null;
  state.hitboxScale = loadout.render.hitboxScale || 1;
  // $C756. Not cosmetic: it gates water damage, the water-spout rate, spike
  // invulnerability, boss HP and several enemy behaviours. See docs §9.
  state.flow.difficulty = Math.max(0, Math.min(2, difficulty | 0));
  const manifest = await loadManifest();
  const playerTiles = await loadPlayerTiles();
  await initLevel(state, level);

  // The title runs before the level, as it does on the cartridge.
  //
  // This used to swallow every error, on the reasoning that a missing capture
  // must not stop the game booting. That reasoning is gone with the capture:
  // the title is BUILT from assets/manifest.json now, so a failure here is a
  // real fault in a required asset, and silently dropping into the level is
  // indistinguishable from "the title screen does nothing". Let it throw --
  // index.html already has an error panel that shows the message.
  let titleArt = null;
  if (title) {
    titleArt = await loadTitle();
    state.titleManifest = manifest;        // the cursor draws from table1
    showTitle(state, titleArt);
  }

  // The ending is only reachable by clearing level $0E, which means beating the
  // Joker. It is pixel-verified against the cartridge (two gate stages), so
  // "can I see it" should not depend on "can I win" -- the launcher can ask for
  // it directly. Same state the clear path enters, so it runs the real
  // loc_00_3652 and not a preview of it.
  if (ending) showEnding(state, loadEnding(manifest, null));

  const fb = createFramebuffer();
  // INTEGER UPSCALE, done here rather than left to CSS.
  //
  // The DMG frame is 160x144 and the page shows it several times larger. Handing
  // that scale to the browser means trusting it to map one source pixel onto a
  // whole number of device pixels -- and it does not always: a fractional CSS
  // scale, a fractional devicePixelRatio, or an element whose left edge lands
  // between device pixels all make some source pixels one device pixel wider
  // than their neighbours. On flat art that is invisible. On a 50% DITHER it is
  // not: the checkerboard beats against the sampling grid and reads as coarse
  // irregular blocks.
  //
  // That is what the ending's credit circle is made of. Its edge is a dithered
  // ring, and it was reported as "giant pixels at the corners, more like tetris
  // pieces than pixels". The RENDER is not at fault -- the ending is pixel-exact
  // against the cartridge over 88 frames of the whole crawl, and the cartridge
  // runs no per-scanline program there at all (MEASURED: rIE = $05 with the STAT
  // bit clear, and the STAT vector fires 0 times in 600 credit frames, so there
  // is no smoothing layer to be missing). The fault is in how it is DISPLAYED.
  //
  // So blit the framebuffer into an offscreen 160x144 canvas and drawImage it
  // onto a backing store that is an exact integer multiple, with smoothing off.
  // The scale-up is then ours and always whole-pixel; whatever the browser does
  // to fit the result is a smooth resample of an already-correct image rather
  // than a per-pixel rounding decision.
  const ctx = canvas.getContext('2d');
  const src = document.createElement('canvas');
  src.width = SCREEN_W;
  src.height = SCREEN_H;
  const srcCtx = src.getContext('2d');
  const image = srcCtx.createImageData(SCREEN_W, SCREEN_H);
  /** Re-read the integer scale the page asked for, clamped to something sane. */
  const backingScale = () => {
    const s = parseInt(canvas.dataset.scale || '0', 10);
    return Number.isFinite(s) && s >= 1 ? Math.min(s, 8) : 1;
  };
  let scale = 0;
  const sizeBacking = () => {
    const s = backingScale();
    if (s === scale) return;
    scale = s;
    canvas.width = SCREEN_W * s;
    canvas.height = SCREEN_H * s;
    ctx.imageSmoothingEnabled = false;
  };
  sizeBacking();

  attachInput();

  // Audio cannot start without a user gesture. boot() is CALLED from one --
  // the launcher's LAUNCH click -- so try immediately: browsers keep transient
  // activation alive for a few seconds, which comfortably covers the awaits
  // above. Waiting for the *next* gesture instead is why the music used to
  // come in several seconds late, after whatever the player happened to press
  // first.
  //
  // The listeners stay as the fallback for when that window has closed (a slow
  // asset load) or when boot() was not reached from a gesture at all.
  const sound = new Sound();
  const armAudio = () => {
    sound.start();
    window.removeEventListener('keydown', armAudio);
    window.removeEventListener('pointerdown', armAudio);
  };
  try {
    sound.start();
  } catch {
    window.addEventListener('keydown', armAudio);
    window.addEventListener('pointerdown', armAudio);
  }

  let acc = 0;
  let last = performance.now();
  let running = true;

  // Refocusing must not replay the missed time, and any key held when focus
  // was lost never sends its keyup -- attachInput's blur handler clears those.
  const resync = () => { last = performance.now(); acc = 0; };
  window.addEventListener('focus', resync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });

  // --- the suspended-loop watchdog ------------------------------------------
  //
  // step() hands off to an async load by RETURNING without rescheduling; only
  // resume() restarts it. Every such handoff is therefore a window in which the
  // game is, correctly, frozen -- and an incorrectly frozen game looks exactly
  // the same. A player sees one thing either way: everything vanishes and the
  // music keeps playing.
  //
  // So make the difference observable. Arm a timer at each handoff and disarm
  // it in resume(); if it ever fires, the loop was suspended and never came
  // back, and we can say WHICH handoff did it instead of guessing from a
  // description. This exists because a reported level-6 softlock could not be
  // reproduced from any scripted input -- the level itself is bit-exact against
  // the cartridge for 400 frames -- so the next occurrence has to report itself.
  let watchdog = null;
  const WATCHDOG_MS = 5000;
  const arm = (where) => {
    if (watchdog !== null) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      watchdog = null;
      fail(`the frame loop was suspended by "${where}" and never resumed`)(
        new Error(`no resume() within ${WATCHDOG_MS} ms`));
    }, WATCHDOG_MS);
  };

  /** Restart the rAF loop after an async screen swap. */
  const resume = () => {
    if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
    last = performance.now();
    acc = 0;
    requestAnimationFrame(step);
  };

  /**
   * Every async screen swap below suspends the rAF loop: step() `return`s
   * WITHOUT rescheduling, and only resume() restarts it. So a rejected load
   * left the loop dead forever while the audio worklet carried on -- a silent
   * freeze with the music still playing, and nothing in the console unless you
   * happened to be watching for an unhandled rejection.
   *
   * REPORTED FROM PLAY on level 6, whose clear is the one handoff that goes
   * through a transition rather than a screen. The level-6 simulation itself
   * is bit-exact against the cartridge for 400 frames, so the fault was never
   * in the game code -- it was that a failure here had no way to be seen.
   *
   * Stop the sound too: a dead game that keeps playing music reads as a game
   * bug rather than a load failure, which is what sent the last investigation
   * looking in the wrong place.
   */
  const fail = (where) => (err) => {
    running = false;
    try { sound.stop(); } catch { /* the driver may never have started */ }
    const msg = `${where} failed: ${(err && err.message) || err}`;
    if (onError) onError(msg, err);
    else console.error('[mixup] ' + msg, err);
  };

  /**
   * loc_00_035B, from all three of its callers: the title walk-through
   * ($0358 falls into it), the death handoff ($2ACC) and the route-clear
   * handoff ($363A). The cartridge does not rebuild the tile area between
   * screens -- round select is painted on top of whatever was there.
   *
   * MEASURED that this is safe for the two paths that arrive from a LEVEL
   * rather than the title: dumping $8000-$9FFF at $0472 both ways and reading
   * the BG map through LCDC $E7's signed $8800 addressing, all 141 tiles the
   * screen references are byte-identical, and the only on-screen map cells
   * that differ are the CONTINUE line the death path is supposed to have.
   * So rebuilding on the title's VRAM is right in every case.
   *
   * @returns false when there is no title art -- a direct-level boot from the
   *          launcher has no menu to go back to, and callers fall back.
   */
  // sub_00_333F is the FIRST instruction of loc_00_04BB and of $2836, so the
  // stage-intro card sits in front of every level load, not beside them. It
  // shows on the four route starts and the four bosses; everywhere else
  // showsStageIntro is false and this is a straight initLevel.
  //
  // The card is built over a BLANK 8 KB buffer on purpose. Measured: every
  // tile the visible 20x18 window uses, and both halves of all 40 emblem
  // sprites, live in the card's own resources $02/$1D/$05 -- so it is
  // byte-identical without modelling whatever VRAM preceded it, which is what
  // makes it safe on a boss level reached mid-route.
  //
  // `opts` reaches src/level.js's initLevel unchanged: `{ transition: true }`
  // is loc_00_2820, the walk-off, which is a much smaller routine than
  // loc_00_04BB. sub_00_333F sits in FRONT of both ($04BB's first instruction
  // and $2836), so the card still shows on a walk-off into a card level.
  let pendingLevel = 0;
  let pendingAfter = null;
  let pendingOpts;
  function enterLevel(n, after = null, opts = undefined) {
    if (!showsStageIntro(n)) {
      arm(`level ${n}`);
      initLevel(state, n, opts).then(() => { if (after) after(); resume(); })
        .catch(fail(`level ${n}`));
      return;
    }
    pendingLevel = n;
    pendingAfter = after;
    pendingOpts = opts;
    showStageIntro(state, loadStageIntro(manifest, n, null));
    resume();
  }

  function enterRoundSelect() {
    if (!titleArt) return false;
    hideTitle(state);
    hideRoundSelect(state);
    arm('round select');
    loadRoundSelect(manifest, titleArt.vram).then((art) => {
      showRoundSelect(state, art);
      resume();
    }).catch(fail('round select'));
    return true;
  }

  // $2ABA: `JP Z, loc_00_0150` -- lives hitting zero is not a game state, it
  // is a jump to the BOOT VECTOR, which clears HRAM and all of $C000-$DFFE.
  // MEASURED with $C753 forced to $03 and one life left: after the reset
  // $C753 = 0, $FFB5 = 0, lives = 5, level 1. src/player.js's deathTick
  // already resets lives and counts the game over; this watches that count.
  let gameOversSeen = state.flow.gameOver || 0;

  /**
   * The rAF entry point exists only to catch SYNCHRONOUS throws.
   *
   * This is the other half of the silent freeze, and the half no `.catch()`
   * could ever have covered. `step` is invoked by requestAnimationFrame, so a
   * throw anywhere inside it -- tick(), renderFrame(), sound.pump(), a mod hook
   * -- unwinds into the browser, the loop is never rescheduled, and the audio
   * worklet keeps playing. Frozen picture, music continuing, nothing in the UI:
   * indistinguishable from the async case, and from a game bug.
   *
   * REPORTED FROM PLAY on level 6, on finishing the level. Every reachable
   * configuration of that clear was reproduced headlessly -- boss killed from
   * the ground and while riding the deck, with renderFrame in the loop, driving
   * main.js's own clear arm -- and all of them hand over to level 7 correctly.
   * The level itself is bit-exact against the cartridge for 400 frames. So the
   * remaining suspect is a fault at RUNTIME in the browser that nothing was
   * reporting, and this makes the next occurrence name itself with a stack.
   */
  function step(now) {
    try {
      stepBody(now);
    } catch (err) {
      fail('the frame loop')(err);
      throw err;                    // keep it in the console with its stack
    }
  }

  function stepBody(now) {
    if (!running) return;

    // Clamp the delta rather than trying to catch up. requestAnimationFrame
    // stops entirely while the window is unfocused, so `now - last` comes back
    // as seconds or minutes; feeding that into the accumulator with a 4-step
    // cap per frame means it can never drain and the game runs at 4x forever.
    // Dropping the missed time is the right call -- nobody wants a minute of
    // fast-forward on refocus.
    acc += Math.min(now - last, FRAME_MS * 4);
    last = now;

    // Fixed timestep, with a cap so a background tab does not spiral.
    // Turbo Mode runs extra logic ticks per displayed frame.
    const perFrame = Math.max(1, loadout.meta.ticksPerFrame | 0);
    let steps = 0;
    let startPressed = false;      // title -> round select
    let introDone = false;         // the stage-intro card has finished
    let endingDone = false;        // the ending has reached $3887
    // { cursor, mode } captured at the press: mode 1 is CONTINUE ($C713),
    // which takes a completely different arm at $047C and never looks at the
    // route cursor at all.
    let menuChoice = null;         // round select -> level
    while (acc >= FRAME_MS && steps < 4) {
      for (let i = 0; i < perFrame; i++) {
        sampleInput(state);         // ROM: the joypad read lives in VBlank
        runHook(loadout, 'onInput', state);
        if (state.title) {
          // loc_00_02C4: the title has its own loop; no game logic runs.
          const r = tickTitle(state);
          if (r === 'start') startPressed = true;
          // $0312 -> loc_00_3893. The options screen is drawn INTO the title's
          // own window tilemap, which is why titleArt has to still be in hand.
          // $0312 -> loc_00_3893. NOT hideTitle(): options is drawn OVER the
          // title, and the title's BG map and tile cache stay put. Nulling them
          // drops the renderer back to the LEVEL map and the squash chews
          // through level-1 tiles.
          else if (r === 'options') {
            state.title = null;
            state.raster.mode = 7;              // $38AB: $FFC7 = 7
            state.raster.closing = 0;
            state.raster.delta = 0;
            showOptions(state, titleArt.windowMap);
          }
        } else if (state.options) {
          // loc_00_38D5. tickRaster is the VBlank half of the squash and has
          // to run every frame the mode is active, not just on input.
          tickRaster(state);
          if (tickOptions(state) === 'title') {
            hideOptions(state);
            state.raster.mode = 0;
            // $3934 is a bare `JP loc_00_02C4`: coming back from OPTIONS
            // re-runs neither the build nor the fade.
            showTitle(state, titleArt, false);
          }
        } else if (state.roundSelect) {
          // loc_00_03DC: round select has its own loop too.
          if (tickRoundSelect(state) === 'start') {
            menuChoice = { cursor: state.roundSelect.cursor,
                           mode: state.roundSelect.mode };
          }
        } else if (state.ending) {
          // loc_00_3652. Blocking, like the card: nothing else runs while it
          // holds, and START skips nothing (measured -- mashing it for all
          // 4137 frames lands on $3887 at exactly the same frame).
          if (tickEnding(state) === 'done') endingDone = true;
        } else if (state.stageIntro) {
          // sub_00_333F blocks: 60 blank frames, three painting frames, 180
          // held, then a 33-frame fade -- 276 in all, and START skips both
          // waits AND the fade.
          if (tickStageIntro(state) === 'done') introDone = true;
        } else {
          tick(state, manifest, playerTiles);
        }
      }
      acc -= FRAME_MS;
      steps++;
    }

    // Hand the game's $C6FB queue to the driver. Anything not consumed here
    // would otherwise pile up, since nothing else drains it.
    sound.pump(state);

    runHook(loadout, 'onRenderFrame', state);
    renderFrame(state, fb);
    image.data.set(fb.rgba);
    sizeBacking();                 // the page may have resized since last frame
    srcCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, SCREEN_W, SCREEN_H,
                  0, 0, SCREEN_W * scale, SCREEN_H * scale);

    // $388E: `JP loc_00_0150` -- the ending does not RETURN anywhere, it
    // resets the machine. The nearest honest equivalent here is the same path
    // a game over takes: wipe the run and go back to the title.
    if (endingDone) {
      endingDone = false;
      hideEnding(state);
      Object.assign(state.video, GAMEPLAY_PALETTES);
      if (titleArt) {
        hideRoundSelect(state);
        resetRun(state);                // $388E: JP loc_00_0150, the boot vector
        arm('title');
        initLevel(state, 1).then(() => { showTitle(state, titleArt); resume(); })
          .catch(fail('title'));
        return;
      }
    }

    // The card is done: drop it and load the level it was announcing. The
    // fade ends on black, so the gameplay palettes have to go back.
    if (introDone) {
      hideStageIntro(state);
      Object.assign(state.video, GAMEPLAY_PALETTES);
      const n = pendingLevel;
      const after = pendingAfter;
      const opts = pendingOpts;
      pendingLevel = 0;
      pendingAfter = null;
      pendingOpts = undefined;
      arm(`level ${n}`);
      initLevel(state, n, opts).then(() => { if (after) after(); resume(); })
        .catch(fail(`level ${n}`));
      return;
    }

    // START on the title goes to ROUND SELECT, not to a level -- $0312 walks
    // through state 4's flash into loc_00_035B. Round select is built on top
    // of the title's VRAM, so the title image has to still be around here.
    if (startPressed && enterRoundSelect()) return;

    // $047C: START. Leaving either menu reloads, because showTitle/
    // showRoundSelect swapped the tile cache out from under it -- and that is
    // async, so the loop stops and resumes.
    if (menuChoice) {
      // mode 1 is CONTINUE, which keeps the level you died on ($0482-$0499);
      // mode 0 is START, which reads the route cursor (loc_00_049D).
      const chosen = menuChoice.mode === 1
        ? continueLevel(state)
        : (ROUTE_LEVEL[menuChoice.cursor] ?? ROUTE_LEVEL[3]);
      hideRoundSelect(state);
      // Round select zeroes both OBJ palettes ($0365). Restoring only BGP
      // leaves every sprite -- Batman, the enemies, the whole HUD -- drawn in
      // colour 0 and invisible against the background, which looks like the
      // level failed to load rather than like a palette.
      Object.assign(state.video, GAMEPLAY_PALETTES);
      enterLevel(chosen);
      return;
    }

    // loc_00_35E8. Finishing a level is NOT the same handoff as walking off
    // its edge: only $2820 does that. A route's last level (4, 8, $0B) sets
    // its $C753 bit and goes back to the menu, the third one completing the
    // set warps straight to level $0C, and level $0E ends the game.
    if (state.flow.levelCleared === 1) {
      // 2 = "$35E8 has already run for this level". The mask write is
      // idempotent but the routing is not. On the cartridge the $C740
      // countdown is what stops the driver re-raising this -- $4EB8's first
      // instruction reroutes into $78CC the moment $C740 leaves $FF.
      //
      // That countdown IS ported now (src/effects.js's bossCountdownTick, and
      // the whole loc_00_34D0 fanfare behind it), so this latch is no longer
      // standing in for a missing feature -- it is the asynchronous frame
      // loop's own guard, because enterLevel and enterRoundSelect are promises
      // and Turbo Mode can run several ticks before either settles. effects.js
      // has its own `done` flag for the same reason. initLevel rearms this one
      // exactly where the ROM rearms $C740 ($0DCA).
      state.flow.levelCleared = 2;
      const next = clearLevel(state);
      if (next.to === 'roundselect' && enterRoundSelect()) return;
      if (next.to === 'level') {
        Object.assign(state.video, GAMEPLAY_PALETTES);
        enterLevel(next.level);
        return;
      }
      // $35F6: clearing level $0E runs the ending -- four picture screens, a
      // 13-line credit crawl and THE END, 4137 frames in all.
      if (next.to === 'ending') {
        showEnding(state, loadEnding(manifest, null));
        resume();
        return;
      }
      // `transition` means the ordinary walk-off handoff and falls through to
      // the exit table below rather than inventing a screen. clearLevel has
      // already resolved WHICH column of 0:$286D it uses: $3603 loads C = 1,
      // the TOP exit, not the right-hand one a walk-off takes. This guard used
      // to test exitRight, which is $FF on the only level that reaches here
      // (level 6), so flow.nextLevel was never written and the cleared vehicle
      // stage ran forever -- the game could not be completed past level 6.
      if (next.exit !== undefined && next.exit !== 0xFF && next.exit !== 0xFE) {
        state.flow.nextLevel = next.exit;
      }
    }

    // The death sequence ends by asking for a level reload, which is async and
    // so cannot happen inside tick(). Without this, falling off the map just
    // leaves the player below the world with nothing to bring them back.
    // Walking off an edge changes level; like respawn, the reload is async.
    if (state.flow.nextLevel) {
      const next = state.flow.nextLevel;
      state.flow.nextLevel = 0;
      // loc_00_2820, for real. This used to run a FULL initLevel and then
      // hand-restore four fields on top; everything else $04BE-$053F clears --
      // velocity, air state, facing, half-extents, i-frames, the animation
      // triple, the water surface, $FFB1/$FFA7 -- was being reset behind the
      // patch. src/level.js's initLevel owns the difference now.
      //
      // RESTORE THE PALETTES. This is the level-6 softlock, and it was neither
      // a freeze nor a crash: the game ran perfectly and was INVISIBLE.
      //
      // Level 6 is the only level that clears into a transition (see the $3605
      // comment above), and its fanfare is a 33-frame fade to WHITE -- $FFAD /
      // $FFAE / $FFAF walk E4 -> 90 -> 40 -> 00. Every other arm out of a clear
      // already put them back: the `to: 'level'` arm above, the stage-intro
      // arm, the ending arm. This one did not, so level 7 loaded and played
      // underneath a blank white screen forever, music and all.
      //
      // MEASURED on the cartridge (vehicle killed by zeroing $C268+$16): the
      // fade reaches 00 at f174, $FFB0 becomes 07 at f181, and on THAT SAME
      // FRAME $FFAD/$FFAE/$FFAF are rewritten E4/E4/C4 -- which is exactly
      // GAMEPLAY_PALETTES. The restore belongs to the level entry, not to the
      // fanfare, so it goes here where the entry is.
      //
      // Why no harness caught it: three of them drove this handover and all
      // reported PASS, because they only checked that frames RENDERED, never
      // that they rendered anything visible. "Renders without throwing" is not
      // "renders a picture" -- the same shape as docs/03's "byte-exact data is
      // not a correct picture". l6clear.mjs now asserts the framebuffer has
      // more than one shade after the handover.
      Object.assign(state.video, GAMEPLAY_PALETTES);
      enterLevel(next, null, { transition: true });
      return;
    }

    // loc_00_2AAD -- the end of the death sequence. player.js has already
    // decremented $C767 (and, on a game over, counted it); what happens next
    // is this.
    if (state.flow.respawnPending) {
      state.flow.respawnPending = false;
      const lives = state.flow.lives;
      const wasGameOver = (state.flow.gameOver || 0) !== gameOversSeen;
      gameOversSeen = state.flow.gameOver || 0;

      if (afterDeath(state, wasGameOver) === 'gameover') {
        if (titleArt) {
          hideRoundSelect(state);
          Object.assign(state.video, GAMEPLAY_PALETTES);
          arm('title');
          initLevel(state, 1).then(() => { showTitle(state, titleArt); resume(); })
            .catch(fail('title'));
          return;
        }
      } else if (enterRoundSelect()) {
        return;
      }

      // No title art: a direct-level boot from the launcher has no menu to go
      // back to, so keep the old restart-in-place rather than softlock. It
      // stands in for CONTINUE, so it does CONTINUE's own $0482 HP refill --
      // level init writes neither $FF8A nor $FF8E.
      arm(`respawn on level ${state.level.number}`);
      initLevel(state, state.level.number).then(() => {
        state.flow.lives = lives;
        state.player.hp = state.player.hpMax;   // $0482
        state.player.dead = 0;
        state.deathTimer = 0;
        resume();
      }).catch(fail(`respawn on level ${state.level.number}`));
      return;
    }

    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  return {
    state,
    sound,
    stop() { running = false; sound.stop(); sound.setEnabled(false); },
  };
}

/**
 * ROM: loc_00_0150, as far as the RUN is concerned.
 *
 * $2ABA (`JP Z, loc_00_0150`) and $388E (the ending's `JP loc_00_0150`) are
 * both hard resets, not screens. $0160-$0168 clears $FF80-$FFFE; $016A-$0177
 * is a PUSH loop with SP = $DFFF and BC = $0FFF, i.e. 4095 pushes covering
 * $C001-$DFFE, and $017A clears $C000 by hand -- so the whole of WRAM goes
 * too. What is then re-seeded is $C756 = 1 ($01D1), $FFB0 = 1 ($01FE),
 * $FF8E = $0A ($0202), $FF8A = $0A ($0204) and $C767 = 5 ($0208).
 *
 * MEASURED (tools/oracle/econgameover.py) with $C753 = $05, $C754 = $07,
 * $C756 = $02, $FF8E = $10 and $C759 = $2A poked in and one life left: the
 * machine comes back 00 / 00 / 01 / $0A / 00. The port kept $C754 and $C756,
 * which permanently erased the three +2-max-HP pickups -- 1:$4DDA zeroes their
 * map cells on re-entry whenever the latch bit is set, so levels 3, 5 and $0D
 * would have started every subsequent run with the heart already gone.
 *
 * $C756 was previously left alone on the reasoning that difficulty is a
 * launcher control here. It is not any more: src/options.js's GAME LEVEL row
 * writes the same field, so the cartridge's own reset applies.
 */
function resetRun(state) {
  const t = state.tunables;
  const flow = state.flow;
  flow.routeMask = 0;                    // $C753
  flow.maxHpTaken = 0;                   // $C754
  flow.difficulty = 1;                   // $01D1
  flow.continueAvailable = 0;            // $FFB5, in the $0160 HRAM clear
  flow.rescueCheat = 0;                  // $C75C
  flow.ammo = 0;                         // $C759
  flow.lives = t.startingLives;          // $0208 (player.js's deathTick agrees)
  state.player.hpMax = t.startingMaxHP;  // $0202
  state.player.hp = t.startingMaxHP;     // $0204
}

/**
 * ROM: loc_00_2AAD -- what the end of the death sequence does to the run.
 *
 * src/player.js's deathTick has already done the `$C767` decrement ($2AB6)
 * and, when it wrapped, counted a game over. This is the rest, and it is a
 * pure state change so tools/oracle/flowdiff.mjs can drive exactly the
 * decision the frame loop drives without a canvas.
 *
 * MEASURED, dying on level 3: $035B is entered with $FFB5 = 1, $C753
 * unchanged, lives 5 -> 4, and $03C8 then puts the cursor on CONTINUE.
 * With one life left instead, $2ABA takes `JP Z, loc_00_0150` and the machine
 * comes back with $FFB5 = 0, $C753 = 0, lives 5, level 1.
 *
 * @returns 'roundselect' or 'gameover'
 */
export function afterDeath(state, wasGameOver) {
  if (wasGameOver) {
    resetRun(state);
    state.player.dead = 0;
    state.deathTimer = 0;
    return 'gameover';
  }
  // $2AAF: LD A,$01 / LDH [$FFB5],A, one instruction before the decrement.
  // This is the ONLY $FFB5 write round select ever sees -- level init's own
  // is consumed by the $0564 fall-through on the very next iteration -- and
  // it is what makes CONTINUE exist and start selected.
  state.flow.continueAvailable = 1;
  return 'roundselect';
}

/** $05A9: LD E,$34 -- the moon, the only fixed sprite the main loop draws. */
const SKY_METASPRITE = 0x34;
/** $05AB: LD A,$10 -- drawn through OBP1. */
const SKY_ATTR = 0x10;
/** $05A6: LD BC,$1880 -- B is OAM y, C is OAM x, so screen (120, 8). */
const SKY_OAM_Y = 0x18, SKY_OAM_X = 0x80;

/**
 * ROM: $057D-$05AD. The MOON, on levels 9, $0A and $0B, every single frame.
 *
 * Three things about it are load-bearing and all three were missing:
 *
 *   - it is drawn BEFORE the camera ($05B7), so it sits at OAM index 0 on an
 *     $FFA7 == 1 frame and immediately after the five HUD sprites on an
 *     $FFA7 == 0 one;
 *   - it is OUTSIDE the $05B0 pause branch, so it survives a pause when
 *     almost nothing else does;
 *   - the $058B layer advance behind it ($C742/$C743, src/raster.js) is the
 *     part that IS gated on $C716, via its own test at $058E.
 *
 * MEASURED (tools/oracle/oamorder.py --level 9): shadow OAM leads with
 * y=16 x=120 tile=$E0 attr=$10 and y=16 x=128 tile=$E2 attr=$10 on frame 1,
 * and manifest.metasprites.table1[$34] reproduces exactly that pair.
 */
function drawSkySprite(state, manifest) {
  const n = state.level.number;
  if (n !== 0x09 && n !== 0x0A && n !== 0x0B) return;   // $057F-$0589
  const table = manifest && manifest.metasprites && manifest.metasprites.table1;
  if (!table) return;
  // sub_00_0BC6 takes OAM coordinates; the sprite queue is in screen ones.
  drawMetasprite(state, table, SKY_METASPRITE,
                 SKY_OAM_X - 8, SKY_OAM_Y - 16, SKY_ATTR);
}

/**
 * ROM: $05F2-$0649 -- the PAUSE toggle, the last thing the main loop body does
 * before sub_00_0C1F and the VBlank wait.
 *
 *   $05F2  $C715 set (dying) forces $C716 = 0 and skips the rest
 *   $05FE  bit 3 of $FFE2 -- START, NEWLY pressed, not held
 *   $0604  $C750 non-zero (level 14's entrance) refuses the toggle outright
 *   $060A  XOR $01, so it is a toggle; the branch is taken on the way OUT
 *   $0614  pausing:   7:$405D ducks the music, then cue BC = $0B01
 *   $0633  unpausing: 7:$4083 restores it, and no cue
 *
 * MEASURED (tools/oracle/econpause.py): walking right, START freezes the
 * player's X at 1108 for 90 frames with RIGHT still held, and a second START
 * resumes from exactly there. Nothing in the port wrote $C716 at all -- twenty
 * sites read it and zero set it -- so the feature was simply absent.
 *
 * The music duck/restore has no port equivalent (src/sound/driver.js's note on
 * flag bit 6); the cue does, and it is the sound the player actually hears.
 */
function updatePause(state) {
  const flow = state.flow;
  if (state.player.dead) { flow.paused = false; return; }   // $05F2-$05FC
  if (!(state.input.pressed & BTN.START)) return;           // $05FE-$0602
  if (flow.bossMode) return;                                // $0604-$0608
  flow.paused = !flow.paused;                               // $060A-$060F
  // $062B: LD BC,$0B01 -- id $0B, mask $01. On the PAUSE half only; $0633's
  // unpause arm queues nothing.
  if (flow.paused && state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id: 0x0B, mask: 0x01 });
  }
}

/** One game frame. ROM: the $0567 main-loop body. */
export function tick(state, manifest, playerTiles) {
  // loc_00_3566/$35D0: the victory fanfare BLOCKS the main loop -- it is a
  // wait routine the clear path calls, not a state the loop drives. While it
  // holds, no camera, no player, no enemies. It raises flow.levelCleared at
  // loc_00_35E8 about 632 frames after the boss dies.
  //
  // Both blocking loops still call sub_00_0A4F once per iteration, so VBlank
  // still runs and $FFB1/$FFA7 still tick straight through the fanfare. That
  // only became observable once the walk-off transition stopped reseeding them
  // (src/level.js) -- level 6 is the one level that clears into a transition.
  if (updateVictoryHold(state)) {
    state.frame = (state.frame + 1) & 0xFF;   // $FFB1
    state.parity ^= 1;                        // $FFA7
    return;
  }

  // $05B0-$05B4: `LD A,[$C716] / AND A / JP NZ, loc_00_05D9`. A paused frame
  // is NOT a skipped frame -- it JUMPS, and it lands past the camera and the
  // player but IN FRONT of the second HUD arm, the splash pass, the pause
  // toggle and $064A's shadow-OAM clear. So the screen is still rebuilt every
  // frame, from almost nothing: MEASURED, a paused cartridge frame holds seven
  // shadow-OAM entries -- the five energy-bar sprites and the two-sprite moon
  // -- where the frame before it held 22. A bare `return` here froze the last
  // frame instead, and would have blanked the screen outright once the OAM
  // clear moved to the head of the tick.
  const paused = !!state.flow.paused;
  // No ROM analogue; it is the mod hook for "a live gameplay frame", and a
  // paused frame is not one. Kept exactly where it was relative to the OAM
  // clear so a mod that queues sprites still has them survive.
  if (!paused) runHook(state.loadout, 'onFrame', state);

  // $064A CALL sub_00_0C1F, modelled at the head rather than the tail: it
  // clears shadow OAM from the draw cursor up and resets the cursor, so an
  // empty queue here is the same picture one frame earlier in the source.
  state.video.sprites.length = 0;

  // $056E vs $05E0: $FFA7 decides WHICH of two identical arms queues the HUD.
  // 0 runs $0573, before everything, at OAM index 0; anything else runs $05E5,
  // after the player, the enemies and the doors. OAM index is DMG sprite
  // priority AND the ten-per-line cut, so the alternation is visible wherever
  // the energy bar crosses another sprite -- MEASURED on all fourteen levels
  // (tools/oracle/oamorder.py): bar at index 0 on even frames, index 6 of 11
  // on level 1's odd frames, index 8 of 12 on level 9's.
  const hudFirst = (state.parity & 1) === 0;
  // $0567 / $05D9: both arms open `LD A,[$C740] / CP $FF / JR NZ`, so the
  // energy bar is drawn only while $C740 is idle -- not during a boss death
  // countdown or its fanfare, and not during level 14's entrance.
  //
  // READ ONCE, HERE, for both arms -- which is not quite what the ROM does:
  // $05D9 re-reads $C740 after $05CF, and 1:$4EF1 writes $C740 = $FE from
  // inside the enemy driver, so in principle the odd arm can see a value the
  // even arm did not. MEASURED (hooks on $05CF, $05D9 and 1:$4EF1; levels 1, 6,
  // 9 and 4; 400 frames each): 1:$4EF1 never executed, $C740 held $FF on all
  // 1600 frames, and the two read sites never disagreed once. So the hoist is
  // latent fragility rather than a live fault -- it would only bite on a frame
  // where a boss death starts between $05CF and $05D9. Left as one read because
  // moving it means splitting the gate across both arms; noted so the next
  // person does not have to re-measure it.
  const hud = c740Idle(state);

  // $0573 draws the bar, $057A CALLs sub_00_29E7 -- the GAME OVER burst -- and
  // $0567's `LD A,[$C740] / CP $FF / JR NZ` covers BOTH, so the burst freezes
  // for as long as the energy bar is withheld. $05E5/$05EC is the same pair on
  // the other parity. The port used to drive the burst from the head of
  // updatePlayer instead, which queued its sprites ahead of the enemies and the
  // doors on odd frames: MEASURED (deathpix.mjs) death-l1 f441 = 68 wrong px
  // and death-l9 f441 = 135, both reported EXACT in the $05EC order.
  // state.player.dead is the $C715 test at $29E7.
  if (hudFirst && hud) {
    drawHud(state, manifest);                         // $0573
    if (state.player.dead) deathTick(state, manifest); // $057A
  }

  // $057D-$05AD: the moon, and $058B's two sky layers behind it. Before the
  // camera, and outside the pause branch.
  drawSkySprite(state, manifest);

  // $0E74's own table, so there is one source of truth for it. Note that
  // "mode 0" on the eight levels with no arm does NOT mean level 6's track
  // parallax -- $0F1F writes rIE = $05 there, masking the STAT vector off
  // entirely, so nothing runs at all.
  //
  // The raster program is ISR code ($0805/$081E) and $058B's layer advance is
  // main-loop code the pause branch jumps PAST rather than into -- $058E does
  // its own $C716 test, which src/raster.js already carries. So this pair runs
  // on a paused frame too.
  state.raster.mode = rasterModeForLevel(state.level.number);
  tickRaster(state);

  if (!paused) {
    // $05B7: the camera runs FIRST, reading the PREVIOUS iteration's player
    // position -- so the visible camera intentionally lags the player by one
    // frame. drawPlayer therefore draws against last frame's camera, as the
    // ROM does.
    updateCamera(state);                // $121F

    updateActors(state, manifest);      // $05BA CALL 1:$4230

    // $05BD CALL $1336: the player state machine is not a call target -- it is
    // the fall-through TAIL of sub_00_1336, reached via $1640 -> $170A after
    // that routine's tile-restore, effect-pool and ballistics work.
    // $1349 tile restores, then loc_00_1391's effect pool -- the next third of
    // the same routine, which is why it lives behind the same call.
    updateBreakables(state, manifest);
    // $1444: the ballistic pool -- the hearts enemies drop. It sits between
    // the tile restores and the player state machine, and BEHIND the $1438
    // gate, which skips the entire rest of the chain while $C750 is set. That
    // gate lives at the top of updatePlayer (see the note there); repeating
    // its condition here is what keeps the two in the right order.
    if (!state.flow.bossMode) updateDrops(state, manifest);
    // updatePlayer reports whether the ROM's chain actually REACHED
    // loc_00_1B4A/loc_00_1D0C this frame. Several arms RET before it -- a
    // scripted door walk-through ($1702/$1706), the pit death ($1773 is a JP
    // into sub_00_29E7, not a CALL), the HP death, an exit reload -- and on
    // those frames the cartridge draws no Batman at all and leaves $FF93/$FF94
    // and the $27A8 hitbox exactly as the previous frame left them.
    //
    // Running the three tails unconditionally was a fall-through of our own:
    // the arm looked like "skip the update", so it borrowed the update's tail.
    // MEASURED on level 5 (pixeldiff l5-walk f80, the one capture frame in the
    // whole suite that lands during a script): the cartridge's OAM holds the 5
    // HUD sprites and the port drew 11, an extra player metasprite worth 315
    // wrong pixels. Gating on the return value takes that to 0 and moves no
    // other frame in any scenario.
    const drew = updatePlayer(state, manifest);      // $170A-$1D0B
    // loc_00_2AAD, the frame the death burst lands, does NOT return into the
    // main loop: `POP AF / POP HL` throws away sub_00_29E7's return address and
    // $2ACC is `JP loc_00_035B`, so the cartridge abandons the rest of that
    // iteration -- nothing from $057D onward runs and the player is not drawn.
    //
    // This guard used to live at the head of updatePlayer, next to the burst
    // call that was there. Moving the burst to its real main-loop call sites
    // left the guard behind, and on the EVEN arm ($057A, where deathTick now
    // runs BEFORE the player update) the handoff frame started drawing a player
    // the cartridge does not. MEASURED (levels 1, 3 and 4, poke at 41): exactly
    // one handoff frame each, all on parity 0, all `drew = true`.
    //
    // Skipping only the draw is still not the whole of what $2AAD abandons, but
    // it is what the port did before and it is strictly closer than drawing him.
    if (drew && !state.flow.respawnPending) {
      // $1B58, the tail of the player update: stash the screen position that
      // the NEXT frame's $1444 ballistic pass will read.
      cachePlayerScreen(state);
      applyAnimHitbox(state, manifest); // $1D2C -- hitbox follows the animation
      drawPlayer(state, manifest);      // $1D0C
    }
    updateWater(state);                 // $05C6 CALL $2CBE -- levels 1-2 water
    // sub_00_2CBE's boss arm ends at loc_00_3050's $3113, which calls
    // sub_00_0BAF IMMEDIATELY -- the rescue carrier's metasprite $68 goes into
    // shadow OAM at $05C6, ahead of the batarangs ($3D15) and well ahead of the
    // enemy driver ($05CF). src/conveyor.js queues it like everything else, so
    // it has to be flushed HERE or not at all: updateEnemies opens by clearing
    // state.enemyDraws, so the entry was being discarded one call later and the
    // carrier was never drawn at all.
    //
    // Invisible until now because the whole path sits behind the $C75C rescue
    // cheat, which measures 0 in normal play and which no oracle scenario can
    // reach -- so the corpus cannot see this either way. tests/conveyor.test.js
    // covers it instead, and goes red if this flush is removed.
    //
    // Safe to flush at this point: rescueDrop is the ONLY thing queued this
    // early. The death burst draws immediately through drawMetasprite, the boss
    // corpse queues from inside the enemy driver ($05CF, after this), and the
    // splashes queue at $05EF with their own flush below.
    drawEnemies(state, manifest);       // $3113's own sub_00_0BAF
    streamPlayerTiles(state, manifest, playerTiles);  // $2C13
    // loc_00_3127 is the TAIL of sub_00_2C13, not a separate call, so it
    // belongs immediately after it -- it used to run one call too early.
    tickTileAnim(state);
    updateBatarangs(state);             // $3A35
    drawBatarangs(state, manifest);     // $3D15
    updateRope(state, manifest);        // $3D5F -- the tail of the same routine
    updateEnemies(state);               // $05CF CALL 1:$4E0C
    // 1:$5CA8 appends to shadow OAM from INSIDE the enemy driver, so the flush
    // belongs HERE -- between $05CF and $05D2 -- and not at the end of the
    // frame where it used to sit. That ordering is the listing's: $05CF calls
    // the driver, which appends through 1:$5CA8, and only then does $05D2 test
    // $C733 and let the door routine append after it.
    //
    // MEASURED on the cartridge ($FF9D read on ENTRY to $05CF and $05D2, as an
    // entry index, level 6, "20:,380:R", 400 frames): the cursor stands at 7-9
    // when the enemy driver is called and at 10-22 when the door check is
    // reached, i.e. the driver's own entries are already in shadow OAM before
    // $05D2 -- which is what forces the flush between the two.
    //
    // Level 6 is NOT evidence about the door routine itself: hooking 1:$4BB0
    // over that same run gives 0 calls and $C733 == 0 on all 400 frames (a
    // door only opens to a punch). The door side of the order is the listing's
    // alone; tools/oracle/doordiff.mjs is what exercises it.
    //
    // The port pushed door sprites immediately but held the enemies in
    // state.enemyDraws until after the HUD, so on ODD frames -- the $05E5 arm,
    // where the energy bar is queued LAST -- every enemy sat behind the bar
    // instead of in front of it. MEASURED (scratch l6cart.py/l6port.mjs, 400
    // frames of level 6): 201/400 frames exact, and all 199 misses were on
    // $FFA7 = 1, with the multiset identical on all 400 -- an ORDER fault and
    // nothing else. OAM index is DMG sprite priority AND the ten-per-line cut,
    // so it is visible wherever a bar crosses an enemy.
    drawEnemies(state, manifest);       // flush loc_01_5CA8's queued sprites
    // $05D2: LD A,[$C733] / AND A / CALL NZ,1:$4BB0 -- the door a punch
    // opened, its four erases and the debris it throws.
    updateDoors(state, manifest);
  }

  if (!hudFirst && hud) {
    drawHud(state, manifest);                          // $05E5
    if (state.player.dead) deathTick(state, manifest); // $05EC
  }

  updateSplashes(state);              // $05EF CALL 1:$7AD3 -- queues onto the
                                      // enemy draw list, so OAM order holds
  // The SECOND flush, and it stays. src/water.js:567 pushes the splash onto the
  // same queue from $05EF -- legitimately after the HUD -- and drawEnemies
  // empties the queue when it flushes, so on every frame that queued nothing
  // here this call is a no-op.
  drawEnemies(state, manifest);       // flush $05EF's splash

  updatePause(state);                 // $05F2-$0649

  // Level transitions additionally run the sub_00_104E camera variant
  // mid-frame (the $F0-masked / SUB $15 one). That belongs in the transition
  // path, not here.

  // The level clear is raised inside updateEnemies now (loc_01_4EB8's boss
  // arm), so there is nothing to poll for here. step() reads flow.levelCleared.

  // $C714 is decremented at the HEAD of the player update ($177C), inside
  // knockback() -- not here. Doing it at tick end left every mid-frame reader
  // one count high.

  state.frame = (state.frame + 1) & 0xFF;   // $FFB1
  state.parity ^= 1;                        // $FFA7
}

