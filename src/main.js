// Boot and frame loop.  ROM: init $0150, main loop $0567-$0650.
//
// The main loop's CALL ORDER is deliberately preserved: it is what determines
// OAM ordering (and therefore sprite priority) and platform-carry ordering.

import { createState, GAMEPLAY_PALETTES } from './state.js';
import { makeTunables } from './tunables.js';
import { attachInput, sampleInput } from './input.js';
import { initLevel, clearLevel } from './level.js';
import { updatePlayer } from './player.js';
import { updateCamera } from './camera.js';
import { loadManifest, loadPlayerTiles } from './assets.js';
import { createFramebuffer, renderFrame, SCREEN_W, SCREEN_H } from './render/renderer.js';
import { drawPlayer, streamPlayerTiles, applyAnimHitbox,
         cachePlayerScreen } from './render/metasprite.js';
import { updateBatarangs, drawBatarangs } from './batarang.js';
import { updateRope } from './rope.js';
import { drawHud } from './hud.js';
import { updateBreakables } from './collision.js';
import { updateActors } from './actors.js';
import { updateEnemies, drawEnemies } from './enemies.js';
import { updateWater, updateSplashes, tickTileAnim } from './water.js';
import { updateDrops } from './drops.js';
import { updateDoors } from './doors.js';
import { updateVictoryHold } from './effects.js';
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

  const fb = createFramebuffer();
  const ctx = canvas.getContext('2d');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const image = ctx.createImageData(SCREEN_W, SCREEN_H);

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

  /** Restart the rAF loop after an async screen swap. */
  const resume = () => { last = performance.now(); acc = 0; requestAnimationFrame(step); };

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
  let pendingLevel = 0;
  let pendingAfter = null;
  function enterLevel(n, after = null) {
    if (!showsStageIntro(n)) {
      initLevel(state, n).then(() => { if (after) after(); resume(); });
      return;
    }
    pendingLevel = n;
    pendingAfter = after;
    showStageIntro(state, loadStageIntro(manifest, n, null));
    resume();
  }

  function enterRoundSelect() {
    if (!titleArt) return false;
    hideTitle(state);
    hideRoundSelect(state);
    loadRoundSelect(manifest, titleArt.vram).then((art) => {
      showRoundSelect(state, art);
      resume();
    });
    return true;
  }

  // $2ABA: `JP Z, loc_00_0150` -- lives hitting zero is not a game state, it
  // is a jump to the BOOT VECTOR, which clears HRAM and all of $C000-$DFFE.
  // MEASURED with $C753 forced to $03 and one life left: after the reset
  // $C753 = 0, $FFB5 = 0, lives = 5, level 1. src/player.js's deathTick
  // already resets lives and counts the game over; this watches that count.
  let gameOversSeen = state.flow.gameOver || 0;

  function step(now) {
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
    ctx.putImageData(image, 0, 0);

    // $388E: `JP loc_00_0150` -- the ending does not RETURN anywhere, it
    // resets the machine. The nearest honest equivalent here is the same path
    // a game over takes: wipe the run and go back to the title.
    if (endingDone) {
      endingDone = false;
      hideEnding(state);
      Object.assign(state.video, GAMEPLAY_PALETTES);
      if (titleArt) {
        hideRoundSelect(state);
        state.flow.lives = 5;
        state.flow.routeMask = 0;
        state.flow.continueAvailable = 0;
        state.flow.maxHpTaken = 0;      // $C754 -- only the boot vector clears it
        initLevel(state, 1).then(() => { showTitle(state, titleArt); resume(); });
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
      pendingLevel = 0;
      pendingAfter = null;
      initLevel(state, n).then(() => { if (after) after(); resume(); });
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
      // instruction reroutes into $78CC the moment $C740 leaves $FF. That
      // countdown is unported, so this latch stands in for it, and the driver
      // reads the same flag ($4EB8's `if (state.flow.levelCleared)`).
      // initLevel rearms it exactly where the ROM rearms $C740 ($0DCA).
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
      // the exit table below rather than inventing a screen.
      if (state.level.exitRight !== undefined
          && state.level.exitRight !== 0xFF && state.level.exitRight !== 0xFE) {
        state.flow.nextLevel = state.level.exitRight;
      }
    }

    // The death sequence ends by asking for a level reload, which is async and
    // so cannot happen inside tick(). Without this, falling off the map just
    // leaves the player below the world with nothing to bring them back.
    // Walking off an edge changes level; like respawn, the reload is async.
    if (state.flow.nextLevel) {
      const next = state.flow.nextLevel;
      state.flow.nextLevel = 0;
      const carried = { lives: state.flow.lives, hp: state.player.hp,
                        hpMax: state.player.hpMax, ammo: state.flow.ammo };
      enterLevel(next, () => {
        // $2820 does not reset the run: HP, lives and ammo all carry across.
        Object.assign(state.flow, { lives: carried.lives, ammo: carried.ammo });
        state.player.hp = carried.hp;
        state.player.hpMax = carried.hpMax;
      });
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
          initLevel(state, 1).then(() => { showTitle(state, titleArt); resume(); });
          return;
        }
      } else if (enterRoundSelect()) {
        return;
      }

      // No title art: a direct-level boot from the launcher has no menu to go
      // back to, so keep the old restart-in-place rather than softlock.
      initLevel(state, state.level.number).then(() => {
        state.flow.lives = lives;
        state.player.dead = 0;
        state.deathTimer = 0;
        resume();
      });
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
    // $0150 is the BOOT VECTOR, not a game-over screen: it clears HRAM and
    // all of $C000-$DFFE, so cleared routes go with it. (Difficulty is a
    // launcher control in this port and is deliberately left alone.)
    state.flow.routeMask = 0;
    state.flow.continueAvailable = 0;
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

/** One game frame. ROM: the $0567 main-loop body. */
export function tick(state, manifest, playerTiles) {
  // loc_00_3566/$35D0: the victory fanfare BLOCKS the main loop -- it is a
  // wait routine the clear path calls, not a state the loop drives. While it
  // holds, no camera, no player, no enemies. It raises flow.levelCleared at
  // loc_00_35E8 about 632 frames after the boss dies.
  if (updateVictoryHold(state)) return;
  if (state.flow.paused) return;
  runHook(state.loadout, 'onFrame', state);

  // $0567 order (P1 subset -- the omitted calls are enemies/actors/effects).
  state.video.sprites.length = 0;     // $0C1F clears unused shadow OAM

  // $0573: the HUD is drawn FIRST so it takes the lowest OAM slots and wins
  // sprite priority over the player and everything else.
  drawHud(state, manifest);

  // $05B7: the camera runs FIRST, reading the PREVIOUS iteration's player
  // position -- so the visible camera intentionally lags the player by one
  // frame. drawPlayer therefore draws against last frame's camera, as the ROM
  // does.
  updateCamera(state);                // $121F
  // $0E74's own table, so there is one source of truth for it. Note that
  // "mode 0" on the eight levels with no arm does NOT mean level 6's track
  // parallax -- $0F1F writes rIE = $05 there, masking the STAT vector off
  // entirely, so nothing runs at all.
  state.raster.mode = rasterModeForLevel(state.level.number);
  tickRaster(state);

  updateActors(state, manifest);      // $05BA CALL 1:$4230

  // $05BD CALL $1336: the player state machine is not a call target -- it is
  // the fall-through TAIL of sub_00_1336, reached via $1640 -> $170A after
  // that routine's tile-restore, effect-pool and ballistics work.
  // $05BD CALL $1336 begins with the delayed tile restores at $1349, before
  // falling through into the player state machine.
  // $1349 tile restores, then loc_00_1391's effect pool -- the next third of
  // the same routine, which is why it lives behind the same call.
  updateBreakables(state, manifest);
  // $1444: the ballistic pool -- the hearts enemies drop. It sits between the
  // tile restores and the player state machine, and BEHIND the $1438 gate,
  // which skips the entire rest of the chain while $C750 is set. That gate
  // lives at the top of updatePlayer (see the note there); repeating its
  // condition here is what keeps the two in the right order.
  if (!state.flow.bossMode) updateDrops(state, manifest);
  updatePlayer(state, manifest);      // $170A-$1D0B
  // $1B58, the tail of the player update: stash the screen position that the
  // NEXT frame's $1444 ballistic pass will read.
  cachePlayerScreen(state);
  applyAnimHitbox(state, manifest);   // $1D2C -- hitbox follows the animation
  drawPlayer(state, manifest);        // $1D0C
  updateWater(state);                 // $05C6 CALL $2CBE -- levels 1-2 water
  streamPlayerTiles(state, manifest, playerTiles);  // $2C13
  // loc_00_3127 is the TAIL of sub_00_2C13, not a separate call, so it belongs
  // immediately after it -- it used to run one call too early. Built from the
  // ROM tables now rather than replayed from a capture.
  tickTileAnim(state);
  updateBatarangs(state);             // $3A35
  drawBatarangs(state, manifest);     // $3D15
  updateRope(state, manifest);        // $3D5F -- the tail of the same routine
  updateEnemies(state);               // $05CF CALL 1:$4E0C
  // $05D2: LD A,[$C733] / AND A / CALL NZ,1:$4BB0 -- the door a punch opened,
  // its four erases and the debris it throws.
  updateDoors(state, manifest);
  updateSplashes(state);              // $05EF CALL 1:$7AD3 -- queues onto the
                                      // enemy draw list, so OAM order holds
  drawEnemies(state, manifest);       // flush loc_01_5CA8's queued sprites

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

