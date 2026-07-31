// The level-14 entrance -- the balloon ride that runs INSTEAD of the enemy
// driver.
//
// ROM range: loc_01_77BD with loc_01_782C (the ballistic arc), loc_01_7879
// (the draw) and loc_01_77FF (the end), plus the two 25-byte tables at
// 1:$7A41 (the path) and 1:$7A5A (the poses).
//
// WHY IT IS A FILE OF ITS OWN AND NOT PART OF THE DRIVER. sub_01_4E0C's very
// first act is `LD A,[$C750] / JP NZ, loc_01_77BD`: while the entrance is
// running the entire slot loop is REPLACED, not merely gated. The Joker and
// the chaser stay parked because tryActivate never runs at all. Leaving these
// 125 lines inside the driver made the one file that knows the port's order
// also own a screen that has no order to know -- there is no slot walk here,
// no parity, no dispatch.
//
// It still writes state.enemyDraws, because the balloon IS an enemy draw as
// far as the queue is concerned, and the driver still calls bossIntroTick
// from the head of updateEnemies. That call is the order-bearing part and it
// stays where the order lives.

import { u8, i8, u16 } from '../state.js';
import { effects } from '../effects.js';

/**
 * ROM: loc_01_77BD - the level-14 ENTRANCE. While $C750 is nonzero the whole
 * enemy driver reroutes here, so the Joker and the chaser stay parked (their
 * blob flags are 0; tryActivate never runs). Three stages, all MEASURED on
 * the cartridge over a 400-frame idle boot of level 14:
 *
 *  - $C750 == 1: count $C741 down from $78; at 1, re-arm it to $3F, set
 *    $C750 = 2, park the window ($FFAD = $E4, $FFAC = 0) and stamp the
 *    PLAYER'S vy register with $10 -- the balloon reuses $FF87 as its
 *    vertical step counter, which is why the trace shows vy jump to 16 at
 *    f120 with the player still grounded.
 *  - $C750 == 2: a small path interpreter. START ($FFE2 bit 3 -- the
 *    NEWLY-PRESSED byte, so it is a press, not a hold) skips it. While
 *    vy != $10 every frame runs the RISE arm: balloon Y -= vy, vy--, wait 1.
 *    Otherwise, when the $C741 wait expires, the cursor ($C73F, the same
 *    byte the fights use as the crit flag) steps through 1:$7A41: top bits
 *    00 = wait (low6+4 frames), $40 = X += $40, $80 = X -= $40, $C0 = enter
 *    the rise arm. Cursor $19 or the START press ends it: $C750/$C741/
 *    $C73F/vy = 0, $C740 = $FF (damage re-enabled), window off ($FFAC=$90).
 *  - Each non-skip frame draws the balloon: world -> screen via sub_00_1172,
 *    pose 1:$7A5A[cursor] through the ALT table (sub_00_0BAF, attr 0), and
 *    when its screen X passes $80 the rise ends (vy = $10, Y-lo = 0).
 */
// 1:$7A41 and 1:$7A5A, 25 bytes each and adjacent in the ROM. Both throw
// rather than default: an empty path would park the balloon at the origin and
// an empty pose list would draw metasprite 0, neither of which looks broken.
export function introTable(state, name) {
  const t = state.tables?.[name];
  if (!t) throw new Error(`enemies: tables.${name} missing from the manifest`);
  return t;
}

export function bossIntroTick(state) {
  const f = state.flow;
  if (f.bossMode !== 2) {                           // $77BD: CP $02
    if (f.bossHop - 1 === 0) {                      // $77C4: DEC hits 1
      f.bossHop = 0x3F;                             // $77CB
      f.bossMode = 2;                               // $77D2
      // $77D5-$77DA: $FFAD = $E4, $FFAC = 0. $FFAD is rBGP's shadow, NOT an
      // object palette -- $0806-$0816 settles the mapping ($FFAB->rWX,
      // $FFAC->rWY, $FFAD->rBGP, $FFAE->rOBP0, $FFAF->rOBP1). Both halves are
      // modelled now. $0DFD sets BGP = $FF on level-14 init, blacking the
      // background out for the entrance (level.js's half), and THIS is what
      // restores $E4 when phase 2 starts.
      state.video.bgp = 0xE4;                       // $77D5: $FFAD
      state.video.windowY = 0;                      // $77D8: $FFAC
      // ...and the latch with it. drawWindow reads windowLatchY, never
      // windowY, so writing only the register left the shaft mask parked at
      // $90 and the renderer bailed on every frame of the entrance.
      state.video.windowLatchY = 0;
      state.player.vy = 0x10;                       // $77DC: $FF87
    } else {
      f.bossHop--;                                  // $77C7
      return;
    }
  }
  // $77E0: phase 2.
  if (state.input.pressed & 0x08) return bossIntroEnd(state);   // START skips
  if ((state.player.vy & 0xFF) !== 0x10) return introRise(state);   // $77E8
  f.bossHop = u8(f.bossHop - 1);                    // $77ED
  if (f.bossHop !== 0) return introDraw(state);     // $77F4
  const cur = u8(f.bossCrit + 1);                   // $77F7: $C73F++
  if (cur >= 0x19) return bossIntroEnd(state);      // $77FB: path done
  f.bossCrit = cur;                                 // $7815
  const op = introTable(state, 'introPath')[cur] & 0xC0;                // $781F
  if (op === 0xC0) return introRise(state);         // $782C (the else of $7828)
  if (op === 0x80) f.balloonX = u16(f.balloonX - 0x40);        // $785D
  else if (op === 0x40) f.balloonX = u16(f.balloonX + 0x40);   // $7858
  f.bossHop = (introTable(state, 'introPath')[cur] & 0x3F) + 4;         // $7871 (the moves fall in)
  return introDraw(state);                          // $7879
}

/**
 * ROM: loc_01_782C - the ballistic arc: Y += -(vy), vy--, wait 1. The
 * negate is CPL/INC with the RESULT's bit 7 deciding the sign extension, so
 * vy counting down through 0 into $FF/$FE... turns the rise into an
 * accelerating descent by pure byte wraparound (and vy exactly $80 would
 * extend "negative": kept faithfully).
 */
export function introRise(state) {
  const vy = state.player.vy & 0xFF;
  const n = u8(~vy + 1);                            // $782C-$782F
  const delta = (n & 0x80) ? (0xFF00 | n) : n;      // $7831-$7839
  state.flow.balloonY = u16(state.flow.balloonY + delta);   // $783D-$7848
  // The port keeps p.vy signed while $FF87 is a raw byte; store the signed
  // reading so the traces compare (the & 0xFF at every read restores it).
  state.player.vy = i8(u8(vy - 1));                 // $784C: $FF87--
  state.flow.bossHop = 1;                           // $7851
  return introDraw(state);
}

/** ROM: loc_01_7879 - convert, edge-test, draw through the alt table. */
export function introDraw(state) {
  const f = state.flow;
  const sx = u8((u16(f.balloonX - state.camera.x) >> 4) + 8);       // $7885
  const sy = u8((u16((f.balloonY & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  // $7888: LD A,B -- and sub_00_1172 returns B = screen Y (the same store
  // order screenTail uses at $5CB8). When the ballistic arc brings the
  // balloon down past screen Y $81, the bob restarts: vy back to $10, Y-lo
  // zeroed. Testing screen X here instead diverged the 900-frame run at
  // f375 on exactly vy.
  if (sy >= 0x81) {                                 // $7889
    state.player.vy = 0x10;                         // $788D
    f.balloonY = f.balloonY & 0xFF00;               // $7892: $FFBD = 0
  }
  state.enemyDraws.push({ id: introTable(state, 'introPoses')[f.bossCrit], x: sx, y: sy,
                          attr: 0, alt: true });    // $7894-$78A0: 0BAF
  state.video.windowY = 0;                          // $78A4: $FFAC = 0
  state.video.windowLatchY = 0;                     // the field drawWindow reads
}

/** ROM: loc_01_77FF - the entrance (or its skip) hands control to gameplay. */
export function bossIntroEnd(state) {
  const f = state.flow;
  state.video.windowY = 0x90;                       // $7810-$7812: window off
  state.video.windowLatchY = 0x90;
  f.bossHop = 0;                                    // $7802: $C741
  f.bossCrit = 0;                                   // $7805: $C73F
  f.bossMode = 0;                                   // $7808: $C750
  state.player.vy = 0;                              // $7800: $FF87
  // $780B: $C740 = $FF. That re-enables melee and batarang damage AND brings
  // the HUD back -- both main-loop arms open with `CP $FF` ($0567/$05D9) --
  // so it has to clear the entrance latch itself rather than lean on $C750.
  effects(state).entranceHold = 0;                  // $780B
}
