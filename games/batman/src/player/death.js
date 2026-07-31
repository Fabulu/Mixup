// Batman's death sequence.  ROM: bank 0, sub_00_29E7 ($29E7-$2A0C) and
// loc_00_2A0D / loc_00_2AAD ($2A0D-$2ACC).  Split out of src/player.js in
// Phase 10.
//
// WHY THIS IS NOT PART OF THE PLAYER CHAIN, and src/player.js says so twice:
// on the cartridge sub_00_29E7 is a MAIN-LOOP call -- $057A on even frames,
// $05EC on odd, right after the HUD arm and under the same $C740 test -- not
// something updatePlayer drives.  src/main.js holds both arms.  Driving it from
// the head of updatePlayer put the burst's sprites at the WRONG OAM index on
// odd frames (MEASURED, tools/oracle/deathpix.mjs: death-l1 f441 = 68 wrong
// pixels, death-l9 f441 = 135, both EXACT once the burst is queued in the
// $05EC order).  So deathTick has two call sites and neither is in this
// subtree; startDeath has two and both are in src/player.js's own pit and HP
// arms, which is the edge that decides the import direction below.
//
// THE EDGE BACK: this module imports requestSound from src/player.js, which
// imports startDeath from here -- the same deliberate two-node cycle as
// ./anim.js, and for the same reason.  requestSound is sub_00_0AE1, the
// four-slot $C6FB command ring; eighteen modules in this port carry their own
// copy of those five lines and a nineteenth would be one more place for the
// queue-full rule to drift.  Referenced inside function bodies only, and
// requestSound is a hoisted function declaration, so no load order can observe
// it uninitialised.

import { effects, startDeathBurst, deathBurstTick } from '../effects.js';
import { requestSound } from '../player.js';

/** @typedef {import('../gametypes.js').GameState} GameState */

/**
 * ROM: sub_00_29E7. Seeds the $C1C0 GAME OVER lettering from 0:$2AD7 -- eight
 * letters on one shared path, each trailing the last by 8 frames, which is
 * the snake. See the header of src/effects.js. Sets the
 * dying flag, the $78 counter and the jingle. It does NOT touch vx or vy --
 * MEASURED: a pit death mid-fall keeps vx = -2, vy = -66 frozen in the
 * trace for the whole sequence. Zeroing them here was a port invention and
 * diverged from f-death+1 on.
 *
 * The $78 is NOT the length of the sequence. Nothing decrements it until slot
 * 7 of the burst has finished its scripted flight, which takes 332 frames --
 * see deathBurstTick. MEASURED end to end on levels 1, 3 and 4: 452 frames
 * from here to loc_00_2AAD.
 * @param {GameState} state
 */
export function startDeath(state) {
  const p = state.player;
  if (p.dead) return;                   // $29EB: already dying
  // $29ED-$2A02: the 40-byte seed and $C712 = $78 in one go.
  startDeathBurst(state, state.tunables.deathSequenceFrames);
  p.dead = 1;                           // $29FD: $C715
  // state.deathTimer stays a MIRROR of $C712 -- main.js clears it on respawn
  // and the unit tests read it, but the burst is what owns the byte now.
  state.deathTimer = state.tunables.deathSequenceFrames;
  // $2A05 is LD BC,$0903 -- sub_00_0AE1 takes B as the id and C as the mask,
  // so this is song $09 with mask $03 (play + stop-all), not the $01 every
  // SFX site uses. It is music: the death jingle has to silence the level
  // theme, and mask $01 would leave both playing.
  requestSound(state, 0x09, 0x03);
}

/**
 * ROM: loc_00_2A0D ticks the GAME OVER lettering; loc_00_2AAD then decrements
 * lives and either restarts or ends the run.
 *
 * The burst is the sequence. $C712 -- what the port used to run down on its
 * own as `deathTimer` -- is not touched until slot 7 of the burst reaches the
 * end of its scripted path on frame 332, so the real length is 332 + 120 =
 * 452 frames, MEASURED identically on levels 1, 3 and 4. The old timer-only
 * version took 122.
 *
 * CALL SITE: the main loop, $057A on even frames and $05EC on odd -- once a
 * frame either way, right after the HUD draw and before the camera, and NOT
 * gated on the pause. src/main.js holds both arms. It used to be driven from
 * the head of updatePlayer instead, which put the burst's sprites at the WRONG
 * OAM index on odd frames: MEASURED (tools/oracle/deathpix.mjs) death-l1 f441
 * = 68 wrong pixels and death-l9 f441 = 135, both flagged "EXACT in the $05EC
 * order", i.e. the pixels come back byte-for-byte the moment the burst is
 * queued after the enemies and the doors instead of before the camera.
 *
 * WHAT THE CALL SITE DOES NOT CARRY: on the frame the burst LANDS, the ROM
 * goes to loc_00_2AAD, which is not a return -- `POP AF / POP HL` discards
 * sub_00_29E7's return address and $2ACC is `JP loc_00_035B`, so the rest of
 * that main-loop iteration never runs. The port finishes the frame and then
 * lets src/main.js act on flow.respawnPending; the one visible consequence,
 * the player being drawn on that frame, is gated there at the `drew` test.
 * Everything else that iteration still runs, which $2AAD does not.
 *
 * $0567/$05D9 open `LD A,[$C740] / CP $FF / JR NZ` and the burst call is
 * INSIDE that arm, so the burst does not advance while $C740 is busy -- a boss
 * death countdown or level 14's entrance. MEASURED with an execution hook on
 * sub_00_29E7: 0 hits across 60 frames with $C740 = $00, 60/60 with $FF.
 * @param {GameState} state
 */
export function deathTick(state, manifest = null) {
  // Fire exactly once. Without this the timer sits at zero and every
  // subsequent frame takes another life, draining the lot in a fifth of a
  // second while the async reload is still in flight.
  if (state.flow.respawnPending) return;

  const landed = deathBurstTick(state, manifest);   // loc_00_2A0D
  state.deathTimer = effects(state).deathTicks;     // keep the mirror honest
  if (!landed) return;                              // $2A9E: not yet zero

  // $2AC6: BC = $2E03 -- id $2E, mask $03, on the way out to loc_00_035B.
  requestSound(state, 0x2E, 0x03);

  const flow = state.flow;
  flow.lives = (flow.lives - 1) & 0xFF;          // $2AB6
  if (flow.lives === 0 || flow.lives > 200) {    // wrapped past zero
    flow.lives = state.tunables.startingLives;   // game over -> fresh run
    flow.gameOver = (flow.gameOver || 0) + 1;
  }
  // main.js picks this up and re-runs initLevel, which is async.
  flow.respawnPending = true;
}