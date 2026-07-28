// Boot and frame loop.  ROM: init $0150, main loop $0567-$0650.
//
// The main loop's CALL ORDER is deliberately preserved: it is what determines
// OAM ordering (and therefore sprite priority) and platform-carry ordering.

import { createState } from './state.js';
import { makeTunables } from './tunables.js';
import { attachInput, sampleInput } from './input.js';
import { initLevel } from './level.js';
import { updatePlayer } from './player.js';
import { updateCamera } from './camera.js';
import { loadManifest, loadPlayerTiles } from './assets.js';
import { createFramebuffer, renderFrame, SCREEN_W, SCREEN_H } from './render/renderer.js';
import { drawPlayer, streamPlayerTiles, applyAnimHitbox } from './render/metasprite.js';
import { updateBatarangs, drawBatarangs } from './batarang.js';
import { updateRope } from './rope.js';
import { drawHud } from './hud.js';
import { updateBreakables } from './collision.js';
import { updateActors } from './actors.js';
import { updateEnemies, drawEnemies } from './enemies.js';
import { updateWater, updateSplashes, tickWaterArt } from './water.js';
import { resolveLoadout, runHook } from './mods.js';
import { loadTitle, showTitle, hideTitle, tickTitle } from './title.js';
import {
  loadRoundSelect, showRoundSelect, hideRoundSelect, tickRoundSelect,
} from './roundselect.js';

import { Sound } from './sound/index.js';

const FRAME_MS = 1000 / 59.73;      // DMG frame rate

/**
 * Which level each route starts at. ROM: loc_00_049D -- cursor 0/1/2 pick
 * levels $01/$05/$09, and anything else (only reachable once $C753 == $07)
 * picks $0C, the Joker warp.
 */
const ROUTE_LEVEL = [1, 5, 9, 12];

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
    let routeChosen = -1;          // round select -> level
    while (acc >= FRAME_MS && steps < 4) {
      for (let i = 0; i < perFrame; i++) {
        sampleInput(state);         // ROM: the joypad read lives in VBlank
        runHook(loadout, 'onInput', state);
        if (state.title) {
          // loc_00_02C4: the title has its own loop; no game logic runs.
          const r = tickTitle(state);
          if (r === 'start') startPressed = true;
          // $3893, the options/sound-test screen, is not ported. The launcher
          // already offers difficulty, level and mods, so OPTION returns there
          // rather than pretending or doing nothing. Documented deviation.
          else if (r === 'options' && onOptions) { running = false; onOptions(); return; }
        } else if (state.roundSelect) {
          // loc_00_03DC: round select has its own loop too.
          if (tickRoundSelect(state) === 'start') {
            routeChosen = state.roundSelect.cursor;
          }
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

    // START on the title goes to ROUND SELECT, not to a level -- $0312 walks
    // through state 4's flash into loc_00_035B. Round select is built on top
    // of the title's VRAM, so the title image has to still be around here.
    if (startPressed) {
      hideTitle(state);
      loadRoundSelect(manifest, titleArt.vram).then((art) => {
        showRoundSelect(state, art);
        last = performance.now();
        acc = 0;
        requestAnimationFrame(step);
      });
      return;
    }

    // loc_00_049D: the route picks the level. Leaving either menu reloads,
    // because showTitle/showRoundSelect swapped the tile cache out from under
    // it -- and that is async, so the loop stops and resumes.
    if (routeChosen >= 0) {
      const chosen = ROUTE_LEVEL[routeChosen] ?? ROUTE_LEVEL[3];
      hideRoundSelect(state);
      state.video.bgp = 0xE4;
      initLevel(state, chosen).then(() => {
        last = performance.now();
        acc = 0;
        requestAnimationFrame(step);
      });
      return;
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
      initLevel(state, next).then(() => {
        // $2820 does not reset the run: HP, lives and ammo all carry across.
        Object.assign(state.flow, { lives: carried.lives, ammo: carried.ammo });
        state.player.hp = carried.hp;
        state.player.hpMax = carried.hpMax;
        last = performance.now();
        acc = 0;
        requestAnimationFrame(step);
      });
      return;
    }

    if (state.flow.respawnPending) {
      state.flow.respawnPending = false;
      const lives = state.flow.lives;
      initLevel(state, state.level.number).then(() => {
        state.flow.lives = lives;
        state.player.dead = 0;
        state.deathTimer = 0;
        last = performance.now();
        acc = 0;
        requestAnimationFrame(step);
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

/** One game frame. ROM: the $0567 main-loop body. */
export function tick(state, manifest, playerTiles) {
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
  updateActors(state);                // $05BA CALL 1:$4230

  // $05BD CALL $1336: the player state machine is not a call target -- it is
  // the fall-through TAIL of sub_00_1336, reached via $1640 -> $170A after
  // that routine's tile-restore, effect-pool and ballistics work.
  // $05BD CALL $1336 begins with the delayed tile restores at $1349, before
  // falling through into the player state machine.
  updateBreakables(state);            // $1349
  updatePlayer(state);                // $170A-$1D0B
  applyAnimHitbox(state, manifest);   // $1D2C -- hitbox follows the animation
  drawPlayer(state, manifest);        // $1D0C
  updateWater(state);                 // $05C6 CALL $2CBE -- levels 1-2 water
  tickWaterArt(state);                // loc_00_3127's tile flip-book (captured)
  streamPlayerTiles(state, manifest, playerTiles);  // $2C13
  updateBatarangs(state);             // $3A35
  drawBatarangs(state, manifest);     // $3D15
  updateRope(state, manifest);        // $3D5F -- the tail of the same routine
  updateEnemies(state);               // $05CF CALL 1:$4E0C
  updateSplashes(state);              // $05EF CALL 1:$7AD3 -- queues onto the
                                      // enemy draw list, so OAM order holds
  drawEnemies(state, manifest);       // flush loc_01_5CA8's queued sprites

  // Level transitions additionally run the sub_00_104E camera variant
  // mid-frame (the $F0-masked / SUB $15 one). That belongs in the transition
  // path, not here.

  if (state.player.iframes > 0) state.player.iframes--;

  state.frame = (state.frame + 1) & 0xFF;   // $FFB1
  state.parity ^= 1;                        // $FFA7
}
