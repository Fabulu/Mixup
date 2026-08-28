// Boot, the screen state machine, and the host frame loop.
// ROM: init $0150, and the post-frame transition arms around the main loop.
//
// THE FRAME ITSELF IS NOT HERE.  $0567-$0650 -- the main-loop body whose CALL
// ORDER determines OAM ordering, and therefore DMG sprite priority, the
// ten-per-line cut and platform-carry ordering -- lives in ./game/frame.js as
// of Phase 10, along with the moon ($057D) and the pause toggle ($05F2) that
// only it calls.  That file carries the order rules and the test that guards
// them.  What stays here is the skeleton the cartridge's main loop sits inside:
// the title/round-select/options/card/ending screens, the async level hand-offs,
// the death handoff and the game-over reset.
//
// `tick` is re-exported below rather than moved-and-forgotten: THIRTY-SEVEN
// oracle tools resolve 'src/main.js' as a LITERAL STRING and would fail at
// runtime, not at lint time.  Retiring that re-export needs a scripted pass over
// tools/ and a full clean gate, and it is a separate commit from this one.

import { createState, GAMEPLAY_PALETTES } from './state.js';
import { makeTunables } from './tunables.js';
import { attachInput, detachInput, sampleInput } from './input.js';
import { initLevel, clearLevel } from './level.js';
import { loadManifest, loadPlayerTiles, installAssetProvider } from './assets.js';
import { renderFrame } from './render/renderer.js';
import { tick } from './game/frame.js';
import { createPresenter, armAudio, onRefocus, createWatchdog,
         createFailReporter } from './host/runtime.js';
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
import { tickRaster } from './raster.js';

import { Sound } from './sound/index.js';

// The one game frame, re-exported at its historical name. See the header.
export { tick } from './game/frame.js';

const FRAME_MS = 1000 / 59.73;      // DMG frame rate

export async function boot(canvas, { level = 1, tunables = {}, mods = [],
                                     title = true, onOptions = null,
                                     onError = null, ending = false,
                                     difficulty = 1, assetProvider = undefined,
                                     soundData = null } = {}) {
  if (assetProvider !== undefined) installAssetProvider(assetProvider);
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

  // The canvas, the upscale and the blit: ./host/runtime.js. `fb` is the
  // framebuffer renderFrame writes into; present() puts it on the page.
  const { fb, present } = createPresenter(canvas);

  attachInput();

  const sound = new Sound(soundData);
  armAudio(sound);

  let acc = 0;
  let last = performance.now();
  let running = true;

  // THE ACCUMULATOR STAYS HERE, and ./host/runtime.js's header says why at
  // length: the fixed-timestep loop below wraps the per-screen dispatch and the
  // post-frame transition arms read flags its body sets, so lifting it out is an
  // inversion of control rather than a move -- and no stage of the 26 drives
  // boot() at all, while the harness that does advances the clock exactly one
  // FRAME_MS per callback and so can only ever exercise the one-step case.
  const resync = () => { last = performance.now(); acc = 0; };
  onRefocus(resync);

  // Arm on every async handoff, disarm in resume(); if it fires, the loop was
  // suspended and never came back, and it can say WHICH handoff did it.
  const watchdog = createWatchdog((where, err) =>
    fail(`the frame loop was suspended by "${where}" and never resumed`)(err));
  const arm = (where) => watchdog.arm(where);

  /** Restart the rAF loop after an async screen swap. */
  const resume = () => {
    watchdog.disarm();
    last = performance.now();
    acc = 0;
    requestAnimationFrame(step);
  };

  // `fail(where)(err)` -- the shape .catch() wants. Halting is this file's job
  // because `running` belongs to the loop above.
  const fail = createFailReporter({ sound, onError, halt: () => { running = false; } });

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
    present();

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
    stop() {
      running = false;
      detachInput();
      sound.stop();
      sound.setEnabled(false);
    },
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


