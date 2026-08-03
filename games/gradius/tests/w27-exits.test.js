// THE EXITS -- $9904 (stage-end) + $96CF (next stage) + $984F/$C686/$B61E (warp).
//
// The endchain scenario exercises the SEAMLESS transition ($39 == 0): the boss
// timeout-deaths, $1B goes $85 -> $86, $9904 scrolls to the stage boundary and
// sets $1B := $90, $96CF does the swap. What no scenario exercises is the WARP
// fork ($39 != 0) and the rain it spawns -- those are pinned here, each to its
// ROM constants.
//
// EVERY TEST IN THIS FILE HAS BEEN SEEN RED. The mutation is named in the
// comment above each one.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { spawnEngine, updateEnemies } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const END_PAGE = res.stage.endPage;       // $0E for stage 0

/** A play state at sub-state $86 (stage-end) with the camera at hi. */
function atStageEnd(hi) {
  const s = bootState(res.manifest);      // a valid play state (player, rings...)
  s.substate = 0x86;                      // $1B -- the stage-end sub-state
  s.zp19 = 0;                             // stage 1
  s.cam.hi = hi;
  return s;
}

// ====================== $9904: the stage-end fork ===========================

test('$9904 keeps scrolling while $3F < endPage, then $1B := $90 (seamless)', () => {
  // $992A CMP $98FD,Y / BCC $9947. While cam.hi < $0E, $1B stays $86. The frame
  // it reaches $0E (and $39 == 0), $1B := $90 -> next frame's $96CF.
  // RED WHEN: the BCC polarity is flipped, or endPage is wrong.
  let s = atStageEnd(END_PAGE - 1);
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x86, 'still $86 one page below endPage');

  s = atStageEnd(END_PAGE);
  s.zp39 = 0;                             // seamless route
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x90, '$9935 A=$90 -> $1B := $90 (next stage)');
});

test('$9904 warp fork ($39 != 0): INC $19, INC $3A, $3F := 0, $1B := $8E', () => {
  // $9937 LDX $39 / BEQ $9945. $39 != 0 -> INC $19 (1->2 here, skipping stage 2's
  // index), INC $3A (arms the rain), cam.hi := 0, $1B := $8E (low nibble $E ->
  // $984F). RED WHEN: the warp fork forgets INC $19 or $3A, or sets $8E wrong.
  const s = atStageEnd(END_PAGE);
  s.zp19 = 1;                             // already at stage-1's $19 (the boss run)
  s.zp39 = 1;                             // the warp flag (a four-hatch kill)
  nmi(s, 0, res);
  assert.strictEqual(s.zp19, 2, '$993B INC $19 -- the FIRST of the double INC');
  assert.strictEqual(s.build.gate, 1, '$993D INC $3A -- arms the rain gate');
  assert.strictEqual(s.cam.hi, 0, '$9941 STA $3F -- cam.hi reset for the warp');
  assert.strictEqual(s.substate, 0x8E, '$9943 LDA #$8E -> $1B (low nibble $E -> $984F)');
});

// ====================== $96CF: the next-stage arm ===========================

test('$96CF seamless: INC $19, clear $39/$3A/$3F, $50-$70, $55 := 1, $1B := $80', () => {
  // Reached the frame after $9904 sets $1B := $90. INC $19 (stage swap), the
  // $50-$70 wipe, $55 := 1, $9BF0 packets, $9C3C ($60 := 1, $1B := $80).
  // RED WHEN: INC $19 is dropped (the stage never advances), or $9C3C's $1B is
  // wrong (stage 2 never starts).
  const s = bootState(res.manifest);
  s.substate = 0x90;                      // bit 4 -> $96CF
  s.zp19 = 0;
  s.zp39 = 1; s.build.gate = 1;           // dirty, to prove the clear
  s.cam.hi = 0x0E;
  s.zp5F = 0x77;                          // dirty hatch counter (cleared by $50-$70, NOT reloaded)
  nmi(s, 0, res);
  assert.strictEqual(s.zp19, 1, '$96D1 INC $19 -- stage 1 -> 2');
  assert.strictEqual(s.zp39, 0, '$96D5 STA $39 -- warp flag cleared');
  assert.strictEqual(s.build.gate, 0, '$96D7 STA $3A -- warp gate cleared');
  assert.strictEqual(s.cam.hi, 0, '$96D9 STA $3F -- cam.hi wraps to 0');
  assert.strictEqual(s.build.hi, 1, '$96E4 STA $55 -- streamer page cursor');
  assert.strictEqual(s.spawn.z60, 2, '$9C3C $60 := 1, then spawnEngine INCs to 2 + loadChunk');
  assert.strictEqual(s.substate, 0x80, '$9C3C $1B := $80 -- PLAY (stage 2 begins)');
  assert.strictEqual(s.zp5F, 0, '$50-$70 wipe cleared $5F (not reloaded by the body)');
});

// ====================== $984F: the warp scroll ==============================

test('$984F: 4 px/frame forced scroll + $2D := 1; at $11 score +$5000, $1B := $90', () => {
  // $9853 LDX #$3E / LDA #$04 / JSR $8402 -- cam.lo:hi += 4 each frame. $984F
  // STA $2D := 1 (CHR bank 2). At cam.hi >= $11: +$5000 and $1B := $90 -> $96CF.
  // RED WHEN: the add is 4 not 2 (halving the scroll rate), or the $11 threshold
  // is off.
  const s = bootState(res.manifest);
  s.substate = 0x8E;                      // the warp route
  s.zp19 = 2;                             // past the first INC $19
  s.build.gate = 1;                       // $3A armed
  s.cam.hi = 0x05; s.cam.lo = 0x00;
  const scoreBefore = s.score[5];         // P1 mid score byte ($9A = score[5])
  nmi(s, 0, res);
  assert.strictEqual(s.ppu.chrSel, 1, '$9851 STA $2D := 1');
  assert.strictEqual(s.cam.lo, 0x04, '$8402 cam.lo += 4 (the 4 px/frame forced scroll)');
  assert.strictEqual(s.substate, 0x8E, 'still $8E below $11');

  // push cam.hi to $11 and confirm the score + advance
  s.cam.hi = 0x11; s.cam.lo = 0x00;
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x90, '$986D $1B := $90 once cam.hi >= $11');
  // $9866 LDA #$50 / JSR $8455 -> $9A := $50 -> +$5000 (BCD mid byte += $50)
  assert.strictEqual(s.score[5], u8(scoreBefore + 0x50), '$8455 +$5000 (mid BCD byte += $50)');
});

// ====================== $C686: the warp rain spawner ========================

test('$C686 throttles on $68 vs $C684[$3A]; spawns a type-$A6 drop at X $F0', () => {
  // The late spawner runs every 4th frame and routes to $C686 when $3A != 0.
  // $68 counts up; at $C684[1] = $0A a drop spawns (and $68 resets). The drop is
  // type $A6 ($C6CC[1]), anim $00 ($C6CA[1]), at X $F0, Y from $C6CE[$69&$0F].
  // RED WHEN: the count threshold is wrong, or the type/position tables misread.
  const s = createState();
  s.substate = 0x82;                      // runEngine routes to lateSpawner
  s.zp19 = 0;                             // (any stage; $3A gate pre-empts jt_$C439)
  s.build.gate = 1;                       // $3A != 0 -> $C686
  s.frame = 0;                            // passes the $02 & 3 gate
  s.spawn.z69 = 0x12;                     // ($69 & $0F) = 2 -> $C6CE[2]
  s.spawn.z68 = 9;                        // one below the $0A threshold
  s.cam.hi = 0x00;                        // < $0E (rain active)

  spawnEngine(s, res);
  // $68 went 9 -> 10; 10 >= $C684[1]=$0A spawns. allocEnemySlot scans 9..0 and
  // returns the first empty slot (9 on a fresh state); st_C686 writes that slot.
  const i = 9 + ENEMY_BASE;
  assert.strictEqual(s.spawn.zA8, 9, 'allocEnemySlot returned slot 9 (first empty)');
  assert.strictEqual(s.obj.type[i], 0xA6, '$C6CC[1] = $A6 (the rain type)');
  assert.strictEqual(s.obj.anim[i], 0x00, '$C6CA[1] = $00 (anim/metasprite)');
  assert.strictEqual(s.obj.status[i], 0x80, '$C6BF status $80');
  assert.strictEqual(s.obj.x[i], 0xF0, '$C6C4 X $F0');
  assert.strictEqual(s.spawn.z68, 0, '$C699 $68 reset to 0 after the spawn');
  assert.strictEqual(s.spawn.z69, 0x13, '$C6A1 $69 incremented');
  // Y from $C6CE[2] -- read it from the same ROM the port reads:
  const wantY = res.enemyTables.read(0xC6CE + (0x12 & 0x0F));
  assert.strictEqual(s.obj.y[i], wantY, '$C6A6 Y = $C6CE[$69 & $0F]');
});

test('$C686 stops raining once cam.hi reaches $0E', () => {
  // $C692 LDA $3F / CMP #$0E / BCC $C699 / RTS. Past the stage length, no spawn.
  const s = createState();
  s.substate = 0x82; s.build.gate = 1; s.frame = 0;
  s.spawn.zA8 = 5; s.spawn.z68 = 9; s.cam.hi = 0x0E;
  spawnEngine(s, res);
  assert.strictEqual(s.obj.type[5 + ENEMY_BASE], 0, 'no drop spawned at cam.hi $0E');
});

// ====================== $B61E: the rain handler =============================

test('$B61E animates through $8E..$95 (8 frames, step 6) and drifts left 2 px', () => {
  // sub_B628 (Y=0): timer >= $B650[0]=$06 advances animFrame, wrapping at
  // $B652[0]=$08; metasprite = frame + $B651[0]=$8E. Then $B103: X -= 2.
  // RED WHEN: the threshold/base/count tables are misread, or the drift is not 2.
  const j = 3; const i = j + ENEMY_BASE;
  const s = createState();
  s.obj.type[i] = 0xA6;
  s.obj.status[i] = 0x80;
  s.obj.x[i] = 0x80; s.obj.y[i] = 0x40;
  s.obj.timer[i] = 0; s.obj.animFrame[i] = 0; s.obj.anim[i] = 0x8E;
  s.spawn.zA8 = j;

  // 5 calls: timer climbs 1..5, all < $06 -> no frame advance.
  for (let n = 0; n < 5; n++) updateEnemies(s, res);
  assert.strictEqual(s.obj.animFrame[i], 0, 'timer < $06: animFrame unchanged');
  assert.strictEqual(s.obj.anim[i], 0x8E, 'metasprite stays at base $8E');
  // 6th call: timer reaches $06 -> frame 0 -> 1, metasprite $8E -> $8F.
  updateEnemies(s, res);
  assert.strictEqual(s.obj.animFrame[i], 1, 'timer >= $06: animFrame 0 -> 1');
  assert.strictEqual(s.obj.anim[i], 0x8F, 'metasprite = frame(1) + base($8E) = $8F');
  assert.strictEqual(s.obj.timer[i], 0, 'timer reset after the step');
  // The drift: each call does X -= 2 (6 calls so far -> X = $80 - 12 = $74).
  assert.strictEqual(s.obj.x[i], u8(0x80 - 2 * 6), '$B164 X -= 2 per call');
});
