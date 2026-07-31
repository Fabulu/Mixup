// One game frame.  ROM: bank 0, the $0567 main-loop body -- $0567..$0649 --
// plus the two routines it is the only caller of: $057D-$05AD (the moon) and
// $05F2-$0649 (the pause toggle).  Split out of src/main.js in Phase 10, which
// cut that file along the ROM/host line: everything here is cartridge, and
// nothing here touches the DOM, requestAnimationFrame, audio or a canvas.
//
// THIS FILE IS ORDER.  The sequence of calls in tick() is not a style choice
// and must not be tidied:
//
//   * the order sprites are queued IS shadow-OAM order, which on a DMG IS
//     sprite priority AND the ten-sprites-per-line cut.  $FFA7 parity decides
//     which of two identical HUD arms runs ($0573 before everything at OAM
//     index 0, or $05E5 after the player, the enemies and the doors), so the
//     bar alternates position every frame -- MEASURED on all fourteen levels
//     with tools/oracle/oamorder.py.
//   * the three drawEnemies flushes are three DIFFERENT flushes at three
//     different points in the listing, not one call written three times.  The
//     second one sits between $05CF and $05D2 because 1:$5CA8 appends from
//     inside the enemy driver; moving it past updateDoors measured 199 of 400
//     level-6 frames wrong, all on $FFA7 = 1, with the sprite multiset
//     identical on all 400 -- an ORDER fault and nothing else.
//   * a paused frame JUMPS to $05D9, it does not skip: it lands past the
//     camera and the player but IN FRONT of the second HUD arm, the splash
//     pass, the pause toggle and $064A's shadow-OAM clear.
//
// GUARDED BY games/batman/tests/frameorder.test.js, which asserts both the full
// ordered sprite queue at both parities and, as an explicitly-labelled change
// detector, the ordered list of subsystem calls in this file's tick() against a
// literal list carrying each one's ROM address.  That test's source-path
// constant points HERE; it moved with this code in the same commit.  Two of the
// five order mutations Phase 6 was written against live in this file -- M4, the
// second drawEnemies flush moved past updateDoors, and M5, the draw queue
// reversed at flush -- and both were re-run against this file after the move.

import { BTN } from '../input.js';
import { updatePlayer } from '../player.js';
import { deathTick } from '../player/death.js';
import { updateCamera } from '../camera.js';
import { drawPlayer, streamPlayerTiles, applyAnimHitbox,
         cachePlayerScreen, drawMetasprite } from '../render/metasprite.js';
import { updateBatarangs, drawBatarangs } from '../batarang.js';
import { updateRope } from '../rope.js';
import { drawHud } from '../hud.js';
import { updateBreakables } from '../collision.js';
import { updateActors } from '../actors.js';
import { updateEnemies, drawEnemies } from '../enemies.js';
import { updateWater, updateSplashes, tickTileAnim } from '../water.js';
import { updateDrops } from '../drops.js';
import { updateDoors } from '../doors.js';
import { updateVictoryHold, c740Idle } from '../effects.js';
import { runHook } from '../mods.js';
import { tickRaster, rasterModeForLevel } from '../raster.js';

/** @typedef {import('../gametypes.js').GameState} GameState */

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

/**
 * One game frame. ROM: the $0567 main-loop body.
 *
 * @param {GameState} state
 */
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
