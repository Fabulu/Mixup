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
import { drawHud } from './hud.js';
import { updateBreakables } from './collision.js';
import { updateActors } from './actors.js';
import { updateEnemies } from './enemies.js';
import { resolveLoadout, runHook } from './mods.js';

const FRAME_MS = 1000 / 59.73;      // DMG frame rate

export async function boot(canvas, { level = 1, tunables = {}, mods = [] } = {}) {
  // Mod params override the ROM defaults before anything reads them; explicit
  // `tunables` still wins last so a caller can force a single value.
  const loadout = resolveLoadout(mods);
  const state = createState(makeTunables({ ...loadout.tunables, ...tunables }));
  state.loadout = loadout;
  state.video.invert = loadout.render.invert;
  state.video.spriteScale = loadout.render.spriteScale || 1;
  state.video.batarangAnim = loadout.render.batarangAnim || null;
  state.hitboxScale = loadout.render.hitboxScale || 1;
  const manifest = await loadManifest();
  const playerTiles = await loadPlayerTiles();
  await initLevel(state, level);

  const fb = createFramebuffer();
  const ctx = canvas.getContext('2d');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const image = ctx.createImageData(SCREEN_W, SCREEN_H);

  attachInput();

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
    while (acc >= FRAME_MS && steps < 4) {
      for (let i = 0; i < perFrame; i++) {
        sampleInput(state);         // ROM: the joypad read lives in VBlank
        runHook(loadout, 'onInput', state);
        tick(state, manifest, playerTiles);
      }
      acc -= FRAME_MS;
      steps++;
    }

    runHook(loadout, 'onRenderFrame', state);
    renderFrame(state, fb);
    image.data.set(fb.rgba);
    ctx.putImageData(image, 0, 0);

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
    stop() { running = false; },
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
  streamPlayerTiles(state, manifest, playerTiles);  // $2C13
  updateBatarangs(state);             // $3A35
  drawBatarangs(state, manifest);     // $3D15
  updateEnemies(state);               // $05CF CALL 1:$4E0C

  // Level transitions additionally run the sub_00_104E camera variant
  // mid-frame (the $F0-masked / SUB $15 one). That belongs in the transition
  // path, not here.

  if (state.player.iframes > 0) state.player.iframes--;

  state.frame = (state.frame + 1) & 0xFF;   // $FFB1
  state.parity ^= 1;                        // $FFA7
}
