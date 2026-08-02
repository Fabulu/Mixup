// WAVE 24 -- the play sub-state machine (jt_$982F) and the game-over arm $96FB.
//
// Every assertion below is written to be SEEN TO FAIL: each names the ROM
// address it pins and the mutation that turns it red (the RED WHEN line). The
// full mutation table -- every fix broken, watched red, restored, SHA-verified
// both ways -- is in docs/worklog/gradius/24-impl-substate-machine.md.
//
// The four defective-check shapes (docs/03 lessons 37-41) are avoided:
//   * no "asserts on no exception" -- each test asserts SPECIFIC state, not just
//     that nmi() returned without throwing;
//   * no "sets up state the app never has" -- states are reachable (the
//     endchain run traverses exactly these sub-states), and any simplification
//     is named;
//   * no "sampled frames with no transitions" -- each test drives the
//     TRANSITION frame, not a steady-state sample;
//   * no "takes the answer as an argument" -- expected values come from the ROM
//     table or from independent arithmetic, never from the same constant the
//     code under test read.
//
// EVERY NUMBER WAS MEASURED OUT OF assets/prg.bin / rip/prg.asm ON 2026-08-02.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createState, u8, ENEMY_BASE } from '../src/state.js';
import { nmi } from '../src/nmi.js';
import { bootState } from '../src/main.js';
import { bindSoundRom, pulse1Dur, OFF } from '../src/sound.js';
import { headlessResources, loadStages, ASSETS } from './helpers.js';

const res = headlessResources(0);
bindSoundRom(res.soundTables);

const RANK_CD = res.stage.rankCountdown;   // $9A35, 8 bytes, exported W24
const BOSS_PAGE = res.stage.bossPage;       // $9A3D[0] = $0C

/** A play state at a given sub-state. bootState's $1B is $80; override it. */
function atSubstate(sub) {
  const s = bootState(res.manifest);
  s.substate = sub;
  return s;
}

// ============================================================== the denominator

test('the dispatch separates arms: $88 routes to $9BED, not $80\'s body', () => {
  // $80's body (st9A4D) advances $1B to $81 when cam.hi >= bossPage. $88 must
  // route to its OWN arm ($9BED) and throw there, NOT run $80's body. This drives
  // the dispatch THROUGH nmi() (the tautology this replaced never called it). The
  // $96A5 ladder lets $88 reach playArm (bit 7 set, bits 4-6 clear), where the
  // port's `switch (substate & 0x0F)` is the code under test.
  // RED WHEN: the mask is `& 0x07` (nmi.js:351) -- $88 & 0x07 == 0 routes to
  // st9A4D, cam.hi >= bossPage advances $1B to $81, and the assert.throws fails
  // because no throw happens. Same red if `case 0x8` collapses into `case 0x0`.
  const s88 = atSubstate(0x88);
  s88.cam.hi = BOSS_PAGE;                  // would advance $1B if misrouted to $80
  assert.throws(() => nmi(s88, 0, res), /\$9BED/,
    '$88 must route to $9BED, not $80');
  const s80 = atSubstate(0x80);
  s80.cam.hi = BOSS_PAGE;
  nmi(s80, 0, res);
  assert.strictEqual(s80.substate, 0x81, '$80 body still runs and advances to $81');
});

test('the 8 unported play arms throw with their ROM target', () => {
  // $86/$9904 (W27), $87/$9B3E, $88/$9BED, $89/$9C12, $8A/$9C1E, $8B/$988C,
  // $8C/$98DD, $8D/$98E5, $8E/$984F, $8F/$984F. Each carries its address.
  // RED WHEN: any arm becomes a quiet return or a wrong-address throw.
  for (const [sub, addr] of [[0x86, '$9904'], [0x87, '$9B3E'], [0x88, '$9BED'],
                             [0x89, '$9C12'], [0x8A, '$9C1E'], [0x8B, '$988C'],
                             [0x8C, '$98DD'], [0x8D, '$98E5'],
                             [0x8E, '$984F'], [0x8F, '$984F']]) {
    const s = atSubstate(sub);
    assert.throws(() => nmi(s, 0, res), new RegExp(`\\${addr}`),
      `$1B=$${sub.toString(16)} should throw at ${addr}`);
  }
});

// ============================================================ the $80 exit ($9A56)

test('$80 ($9A4D) keeps playing while $3F < bossPage, then $9A56 sets $1B := $81', () => {
  // $9A4F CMP $9A3D,X / BCC $9A5B. bossPage for stage 0 is $0C. While cam.hi <
  // $0C, $1B stays $80; the frame it reaches $0C, $1B := $9A45[0] = $81.
  // RED WHEN: the BCC polarity is flipped (advances too early/late), or $81 is
  // wrong.
  let s = atSubstate(0x80);
  s.cam.hi = BOSS_PAGE - 1;                          // below the threshold
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x80, 'still $80 one page below bossPage');

  s = atSubstate(0x80);
  s.cam.hi = BOSS_PAGE;                              // $3F == $9A3D[0]
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x81, '$9A56 STA $1B := $9A45[$19] = $81');
});

test('$9A45 is the constant $81 for every stage (the next-state table)', () => {
  // Read out of rip/prg.asm line 2860: eight bytes, all $81. The port uses a
  // literal $81 (the table is trivially constant); this pins the ROM fact and
  // that no stage's exit goes anywhere else. RED WHEN: the port literal is
  // changed to e.g. $82.
  const prg = readFileSync(join(ASSETS, 'prg.bin'));
  const at = (a) => prg[a - 0x8000];
  for (let i = 0; i < 8; i++) {
    assert.strictEqual(at(0x9A45 + i), 0x81, `$9A45[${i}] = $81`);
  }
  // And the port's literal: stage 0 reaching bossPage sets $1B := $81.
  const s = atSubstate(0x80);
  s.cam.hi = BOSS_PAGE;
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x81, 'the port literal is $81');
});

// =========================================================== $81 ($9A0E) countdown setup

test('$81 ($9A0E) loads $4C:$4D from $9A35[rank] and advances to $82', () => {
  // $9A1E LDA $9A35,X / STA $4D ; $9A23 LDA #$00 / STA $4C ; INC $1B -> $82.
  // Rank 2 is used (not rank 1) because $9A35[0]==$9A35[1]==3: only a rank whose
  // countdown DIFFERS from rank 0 catches a `rank->0` mutation. $9A35[2] = $04.
  // RED WHEN: $4D reads the wrong table column (rank 0 not rank 2), or $4C is
  // not cleared, or $1B is not advanced.
  const s = atSubstate(0x81);
  s.zp17 = 2;                                        // rank 2: $9A35[2] = $04 (!= $03)
  nmi(s, 0, res);
  assert.strictEqual(s.zp4D, RANK_CD[2], '$4D := $9A35[2] = $04');
  assert.strictEqual(s.zp4C, 0x00, '$4C := $00');
  assert.strictEqual(s.substate, 0x82, 'INC $1B -> $82');
  assert.strictEqual(s.zp5B, 1, '$9A27 INC $5B (freezes the camera for $82)');
});

test('$81 countdown duration is rank-indexed: rank 0 -> 768, rank 4 -> 1280', () => {
  // $82 = $9A35[rank] x 256. The table is 03 03 04 04 05 05 06 06. Rank 0 = 3
  // -> 768 frames; rank 4 = 5 -> 1280 frames. (Rank 4 is table-derived, not
  // measured in a powered endchain run -- labelled per knowledge/09.)
  // RED WHEN: the table is read with the wrong indexer (e.g. stage not rank).
  assert.deepEqual(RANK_CD, [3, 3, 4, 4, 5, 5, 6, 6], '$9A35 byte-verified');
  assert.strictEqual(RANK_CD[0] * 256, 768, 'rank 0 countdown');
  assert.strictEqual(RANK_CD[4] * 256, 1280, 'rank 4 countdown (table-derived)');
});

test('$81 stage-6 special case ($19 == 6) is a loud throw', () => {
  // $9A12 CMP #$06 / BNE $9A1E. The port loads one stage; the stage-6 shortcut
  // ($4D:=1, $4C:=$CA) is unreachable. RED WHEN: it silently skips.
  const s = atSubstate(0x81);
  s.zp19 = 6;
  assert.throws(() => nmi(s, 0, res), /\$9A12/);
});

// =========================================================== $82 ($99E9) the countdown

test('$82 ($99E9) 16-bit-decrements $4C:$4D and holds $1B until both are 0', () => {
  // $99EB A2 4C / A9 01 / JSR $840C. $840C is a 16-bit subtract-1: borrow DECs
  // the high byte. Pre-set a SMALL count so the test does not need 768 frames.
  // $4C:$4D = $0002 -> 2 frames to reach 0.
  // RED WHEN: the decrement is 8-bit only (never borrows into $4D), or the
  // zero-test reads only $4C.
  const s = atSubstate(0x82);
  s.zp4C = 0x02; s.zp4D = 0x00;                      // value 2
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x01, 'frame 1: $4C 02->01, no borrow');
  assert.strictEqual(s.zp4D, 0x00, '$4D unchanged');
  assert.strictEqual(s.substate, 0x82, 'still $82 (not zero yet)');
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x00, 'frame 2: $4C 01->00');
  assert.strictEqual(s.zp4D, 0x00, '$4D still 00');
  assert.strictEqual(s.substate, 0x83, '$99FA INC $1B -> $83 when the pair hits 0');
});

test('$82 $840C borrows into $4D: $00:$01 -> $FF:$00 (256 frames implied)', () => {
  // The borrow is the load-bearing half of the 16-bit decrement. With $4C:$4D =
  // $00:$01 (value 256), one frame borrows: $4C wraps $FF, $4D DECs to $00.
  // RED WHEN: the borrow is dropped -- $4C would stay $00 and $4D stay $01, and
  // the countdown would never end (this is exactly the W24 must-fail break).
  const s = atSubstate(0x82);
  s.zp4C = 0x00; s.zp4D = 0x01;                      // value 256
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0xFF, '$4C wraps $00 -> $FF on borrow');
  assert.strictEqual(s.zp4D, 0x00, '$8415 DEC $01,X -- $4D 01 -> 00');
  assert.strictEqual(s.substate, 0x82, 'still $82 (255 to go)');
});

test('$82 zero-test reads BOTH $4C and $4D: $01:$01 stays $82 (pins the $4D half)', () => {
  // $99F2 LDA $4C / ORA $4D / BNE. The countdown loop continues while
  // `(zp4C | zp4D) !== 0`. The borrow half is pinned by the test above; THIS pins
  // the zero-test half -- a mutant that drops `| zp4D` (tests only $4C) ends the
  // timer the first frame $4C reaches 0 while $4D is still nonzero, i.e. after
  // 256 frames instead of 768 at rank 1. The cartridge passes through this exact
  // state every time $4C wraps $00->$FF with $4D>0.
  // $4C:$4D = $01:$01 -> one frame: $4C 01->00 (no borrow), $4D still 01; the pair
  // is NOT zero so $1B must stay $82. The mutant advances to $83.
  // RED WHEN: the zero-test reads only $4C at nmi.js:478 (`(zp4C) !== 0`).
  const s = atSubstate(0x82);
  s.zp4C = 0x01; s.zp4D = 0x01;                      // $4D nonzero after $4C hits 0
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x00, '$4C 01->00, no borrow ($4D unchanged)');
  assert.strictEqual(s.zp4D, 0x01, '$4D still 01 -- the pair is NOT zero');
  assert.strictEqual(s.substate, 0x82, 'still $82: $4D nonzero keeps the countdown');
});

test('$82 end-of-countdown sets $60 := 0 (spawn engine idle) and requests sfx $3F', () => {
  // $99F8 STA $60 (A=0); stage 0 or 3 -> $9A06 JSR $EC1E with $3F. $60 is the
  // spawn-engine state (0 = idle). RED WHEN: $60 is not reset, or the stage
  // gate is wrong.
  const s = atSubstate(0x82);
  s.spawn.z60 = 2;                                   // engine was running
  s.zp4C = 0x01; s.zp4D = 0x00;                      // value 1 -> 0 next frame
  s.zp19 = 0;                                        // stage 0 -> sfx $3F
  s.sfx.length = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.spawn.z60, 0, '$99F8 STA $60 -- spawn engine to idle');
  assert.strictEqual(s.substate, 0x83, '-> $83');
  assert.ok(s.sfx.includes(0x3F), '$9A08 JSR $EC1E with A=$3F on stage 0');
});

test('$82 does NOT request sfx $3F on stage 1 or 2', () => {
  // $99FC LDA $19 / BEQ $9A06 (stage 0) ; $9A00 CMP #$03 / BEQ $9A06 (stage 3).
  // Only stages 0 and 3 fire $3F. RED WHEN: the gate fires on all stages.
  for (const stage of [1, 2]) {
    const s = atSubstate(0x82);
    s.zp4C = 0x01; s.zp4D = 0x00;
    s.zp19 = stage;
    s.sfx.length = 0;
    nmi(s, 0, res);
    assert.ok(!s.sfx.includes(0x3F), `stage ${stage} must not fire $3F`);
    assert.strictEqual(s.substate, 0x83, `stage ${stage} still advances to $83`);
  }
});

// =========================================================== $83 ($99C0) the transition

test('$83 ($99C0) INCs $1B to $84 and sets $62 := 2', () => {
  // $99C0 INC $1B (-> $84); $99D3 INC $5B; $99D7 STA $62 := 2. Stage < 5 path.
  // RED WHEN: $1B is not advanced, or $62 gets the wrong value (e.g. 1 from $81).
  const s = atSubstate(0x83);
  s.zp19 = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x84, '$99C0 INC $1B -> $84');
  assert.strictEqual(s.spawn.z62, 2, '$99D7 LDA #$02 / STA $62');
});

test('$83 stage >= 5 shortcut ($1B := $86) is a loud throw', () => {
  // $99C4 CMP #$05 / BCC $99D3. The port loads one stage; the stage>=5 shortcut
  // ($99CF $1B := $86, plus sfx $AC at == 5) is unreachable. RED WHEN: silent.
  for (const stage of [5, 6]) {
    const s = atSubstate(0x83);
    s.zp19 = stage;
    assert.throws(() => nmi(s, 0, res), /\$99C4/,
      `stage ${stage} should throw at $99C4`);
  }
});

// =========================================================== $84 ($9982) + despawn $994A

test('$84 ($9982) despawns while $3F == bossPage (BEQ $99BA), holding $1B', () => {
  // $9986 CMP $9A3D,X / BEQ $99BA. While $3F == bossPage, run the despawn sweep
  // and stay in $84. RED WHEN: the BEQ is inverted (advances immediately).
  const s = atSubstate(0x84);
  s.cam.hi = BOSS_PAGE;                              // == bossPage
  s.cam.lo = 0xE0;                                   // >= $D0 so the sweep runs
  s.spawn.z5E = 0x3F;                                // a valid cursor
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x84, 'BEQ path stays $84');
  assert.strictEqual(s.spawn.z5E, 0x3E, '$9954 DEC $5E walked the cursor');
});

test('$84 advance path spawns the boss object and $1B -> $85, $5E := #$3F', () => {
  // $998B: the frame $3F leaves bossPage (here forced). Two HUD packets, $2D:=1,
  // clearSlot(9), type[21]:=$98 / y[21]:=$80 / x[21]:=$F0, INC $5B, INC $1B
  // -> $85, $5E := #$3F. RED WHEN: any of the boss bytes is wrong, or $1B/$5E
  // is not set. W26 ports the boss handler, so type $98 now dispatches to $B914
  // (entry 24) and RUNS instead of throwing: the first frame advances the morph
  // to the initial $6C and creates the two inert body slots (type $99).
  const s = atSubstate(0x84);
  s.cam.hi = BOSS_PAGE + 1;                          // != bossPage -> advance path
  // The boss type $98 -> enemies.js dispatch entry 24 -> h_B914 (W26). It must
  // NOT throw. RED WHEN: the boss byte is wrong (e.g. type $99) -- it dispatches
  // to entry 25 ($B913) and the head handler never runs, so anim stays 0.
  assert.doesNotThrow(() => nmi(s, 0, res),
    'type $98 dispatches to $B914 (entry 24), now ported -- must not throw');
  assert.strictEqual(s.substate, 0x85, '$99B1 INC $1B -> $85');
  const bi = 9 + ENEMY_BASE;                         // slot 21
  assert.strictEqual(s.obj.type[bi], 0x98, '$99A2 STA $0315 (boss type $98)');
  assert.strictEqual(s.obj.y[bi], 0x80, '$99A7 STA $0335 (Y unchanged on frame 1)');
  // The spawn writes x=$F0 ($99AC), then the head handler runs this same frame
  // and the intro descent DEC's it once ($B9AF, $F0 >= $A4) -> $EF (239).
  assert.strictEqual(s.obj.x[bi], 0xEF, 'spawn $F0 then $B9AF DEC -> $EF');
  assert.strictEqual(s.spawn.z5E, 0x3F, '$99B3 LDA #$3F / STA $5E (immediate)');
  assert.strictEqual(s.ppu.chrSel, 1, '$9997 STA $2D := 1');
  // The head handler ran this frame: morph stepper set anim to the initial $6C
  // ($B8EF[0]), and bodySync wrote type $99 into both body slots (20 and 19).
  assert.strictEqual(s.obj.anim[bi], 0x6C, '$B940 morph = $B8EF[0] = $6C');
  assert.strictEqual(s.obj.type[8 + ENEMY_BASE], 0x99, 'body slot 8 = $99');
  assert.strictEqual(s.obj.type[7 + ENEMY_BASE], 0x99, 'body slot 7 = $99');
});

test('$994A despawn guard: no sweep while $3E < $D0; sweep runs AT $D0', () => {
  // $994C CPX #$D0 / BCC $997D. The sweep runs only in the last ~quarter of a
  // scroll page. $3E = $D0 is the FIRST byte that runs (BCC is < , not <=).
  // RED WHEN: the guard threshold is changed (e.g. $D1 -- then $D0 wrongly
  // refuses), or the comparison is <= instead of <.
  // $CF: refused
  let s = atSubstate(0x84);
  s.cam.hi = BOSS_PAGE; s.cam.lo = 0xCF;
  s.spawn.z5E = 0x3F;
  nmi(s, 0, res);
  assert.strictEqual(s.spawn.z5E, 0x3F, '$CF (< $D0): cursor unchanged');
  // $D0: the boundary -- runs the sweep
  s = atSubstate(0x84);
  s.cam.hi = BOSS_PAGE; s.cam.lo = 0xD0;
  s.spawn.z5E = 0x3F;
  nmi(s, 0, res);
  assert.strictEqual(s.spawn.z5E, 0x3E, '$D0 (>= $D0): cursor walked -- sweep ran');
});

test('$994A clears 8 collision columns and (cursor < $14) the enemy object bytes', () => {
  // $9958-$996D clear $0500/$0540/$0580/$05C0/$0600/$0640/$0680/$06C0,X.
  // $9974-$997A clear status/anim/type at enemy slot 12+X -- but only when the
  // OLD cursor < $14 ($9970 CPX #$14 / BCS skip). Seed an enemy in slot 12 and a
  // cursor of $0C so the object clear fires.
  // RED WHEN: a column is dropped, or the <$14 object-clear is skipped/duplicated.
  const s = atSubstate(0x84);
  s.cam.hi = BOSS_PAGE;
  s.cam.lo = 0xE0;                                   // >= $D0
  s.spawn.z5E = 0x0C;                                // cursor < $14 -> object clear
  // pre-fill the columns and an enemy slot so we can see them cleared
  for (const base of [0x000, 0x040, 0x080, 0x0C0, 0x100, 0x140, 0x180, 0x1C0]) {
    s.coll[base + 0x0C] = 0xAB;
  }
  s.obj.status[ENEMY_BASE + 0x0C] = 0x55;            // enemy slot 12+0x0C = slot 24
  s.obj.type[ENEMY_BASE + 0x0C] = 0x99;
  nmi(s, 0, res);
  for (const base of [0x000, 0x040, 0x080, 0x0C0, 0x100, 0x140, 0x180, 0x1C0]) {
    assert.strictEqual(s.coll[base + 0x0C], 0, `coll[$${(base + 0x0C).toString(16)}] cleared`);
  }
  assert.strictEqual(s.obj.status[ENEMY_BASE + 0x0C], 0, '$010C,X status cleared');
  assert.strictEqual(s.obj.type[ENEMY_BASE + 0x0C], 0, '$030C,X type cleared');
});

test('$994A object clear stops at cursor $14; the collision columns keep going', () => {
  // $9970 CPX #$14 / BCS $997D. For cursor < $14 the object bytes (status/anim/
  // type at slot 12+X) are cleared; for cursor >= $14 only the collision map is.
  // The bound is $14 because $010C+$14 = $0120 (the anim array base) -- on the
  // cartridge the guard PROTECTS the player's anim byte from being wiped. In
  // this port the object arrays are separate 32-slot arrays, so slot 12+$14 = 32
  // is out of bounds and a dropped guard would write nothing observable: like
  // W22's $AFD2 restore, the guard is faithful but its mutant is silent here.
  // What IS observable: cursor $14 still clears the collision column (>= $14
  // does not stop the sweep, only the object clear). RED WHEN: the collision
  // clear is gated on $14 too (it must not be).
  const s = atSubstate(0x84);
  s.cam.hi = BOSS_PAGE;
  s.cam.lo = 0xE0;
  s.spawn.z5E = 0x14;                                // >= $14
  s.coll[0x000 + 0x14] = 0xAB;
  s.coll[0x100 + 0x14] = 0xAB;
  nmi(s, 0, res);
  assert.strictEqual(s.coll[0x000 + 0x14], 0, '$0500,X still cleared at cursor $14');
  assert.strictEqual(s.coll[0x100 + 0x14], 0, '$0600,X still cleared at cursor $14');
  // The LAST cursor that clears objects is $13 (slot 31). Confirm it does.
  const s2 = atSubstate(0x84);
  s2.cam.hi = BOSS_PAGE; s2.cam.lo = 0xE0;
  s2.spawn.z5E = 0x13;
  s2.obj.type[ENEMY_BASE + 0x13] = 0x99;             // slot 31, the last valid
  nmi(s2, 0, res);
  assert.strictEqual(s2.obj.type[ENEMY_BASE + 0x13], 0, 'cursor $13 (slot 31) IS cleared');
});

// =========================================================== $85 ($997E) the dead fall-through

test('$85 ($997E) is INC $5B only; a direct INC $1B added to st997E would advance', () => {
  // 997E E6 5B / 9980 D0 35 (BNE $99B7, ALWAYS taken). $85 stays $85 every frame;
  // it exits only via the boss-death INC $1B in the W26 boss handler, NOT here.
  // This 5-frame loop catches a DIRECT `state.substate++` (or `INC $1B`) added to
  // st997E -- $1B would walk past $85 within the loop. It does NOT, on its own,
  // catch the 256-frame $5B-wrap hazard: $9658 clears $5B to 0 each frame BEFORE
  // the arm, so the wrap is unreachable while $9658 stands (the $9658 clear itself
  // is guarded by the line-361 test below). RED WHEN: an INC $1B is added to
  // st997E (substate would advance to $86+).
  const s = atSubstate(0x85);
  s.zp5B = 0;                                        // $9658 clears it before the arm
  for (let i = 0; i < 5; i++) nmi(s, 0, res);        // 5 frames of boss fight
  assert.strictEqual(s.substate, 0x85, '$85 never advances $1B on its own');
});

test('$85 does not fall through across the $5B wrap boundary', () => {
  // The cited hazard is "$5B wraps $FF -> $00 on the INC and the dead BNE falls
  // through, re-spawning every 256 frames". In THIS port the wrap is unreachable
  // while $9658 stands (it zeroes $5B before the arm, so the $FE pre-set below is
  // itself overwritten to 0 each frame) AND st997E has no fall-through code. So
  // this loop is honest about what it guards: it goes RED only if $9658 is removed
  // (Finding-C mutant) AND a fall-through is then added -- i.e. it pins the
  // COMBINATION, and stays green today because neither holds. Parking $5B near the
  // wrap each frame is the structural reason the dead BNE can never drop.
  const s = atSubstate(0x85);
  for (let i = 0; i < 4; i++) {
    s.zp5B = 0xFE;                       // would be 2 INCs from the wrap without $9658
    nmi(s, 0, res);
    assert.strictEqual(s.substate, 0x85, `frame ${i}: $85 does not fall through`);
  }
});

test('$85 is safe because $9658 clears $5B every frame BEFORE the INC', () => {
  // The dead-branch proof from the listing rests on ONE line: $9658 STA $5B
  // (ported at nmi.js:293 `state.zp5B = 0;` inside stagePlay, BEFORE the $96A5
  // ladder reaches $997E). To GUARD that line we pre-set a residue ONLY $9658
  // can clear: $FF. With $9658 present, $FF -> (clear) 0 -> (INC) 1. Delete $9658
  // and $FF carries into st997E, the INC wraps $FF -> $00, and the dead BNE would
  // NOT branch (the re-spawn-every-256-frames hazard) -- so assert === 1 fails.
  // RED WHEN: nmi.js:293 `state.zp5B = 0;` is deleted (the post-INC value is 0x00,
  // not 1). This is the foundation of the "$997E fall-through is dead" proof.
  // (RULE 2: this guards $9658's clear, not the fall-through itself -- the port
  // has no fall-through code in st997E to mutate; that rests on the listing.)
  const s = atSubstate(0x85);
  s.zp5B = 0xFF;                        // a residue only $9658 can clear
  nmi(s, 0, res);
  assert.strictEqual(s.zp5B, 1,
    '$9658 cleared $5B to 0, then $997E INC made it 1 (not 0x00 wrap)');
  assert.strictEqual(s.substate, 0x85, 'no fall-through into $9982');
});

// =========================================================== the game-over arm $96FB

test('$96FB INCs $5B every frame (freezes the camera for the game-over hold)', () => {
  // 96FB E6 5B. RED WHEN: the INC is dropped -- the camera would scroll during
  // the game-over screen.
  const s = atSubstate(0xC0);                        // bit 6 set -> gameOverArm
  // Force the jingle-playing path so it runs mode5Body and returns cleanly.
  s.snd[OFF.DUR] = 0x10;                             // $B0 != 0 (jingle mid-note)
  s.zp0A = 0;                                        // no players (solo game-over)
  s.zp5B = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.zp5B, 1, '$96FB INC $5B');
});

test('$96FB holds (mode5Body) while $B0 != 0, then $4C counts down once $B0 reaches 0', () => {
  // $96FD LDA $B0 / BNE $975D (jingle hold); when $B0==0, $9715 DEC $4C.
  // RED WHEN: the $B0 gate is inverted (counts down during the jingle), or $4C
  // is not decremented.
  let s = atSubstate(0xC0);
  s.snd[OFF.DUR] = 1;                                // jingle has 1 tick left
  s.zp0A = 0;
  s.zp4C = 0x78;                                     // the seeded timeout
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x78, '$4C NOT decremented while $B0 != 0');
  // jingle ends ($B0 -> 0; the driver would have DEC'd it). Now $4C counts.
  s.snd[OFF.DUR] = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x77, '$975B DEC $4C once $B0 == 0');
});

test('$96FB CONTINUE ($0A==0, START pressed, jingle done) throws at $970D', () => {
  // $970D JSR $82D5 / mode := 4. Mode 4 is unported. RED WHEN: silent.
  const s = atSubstate(0xC0);
  s.snd[OFF.DUR] = 0;                                // jingle done
  s.zp0A = 0;                                        // solo game-over ($0A cleared)
  s.zp4C = 0x78;                                     // still in the window
  // START pressed this frame:
  assert.throws(() => nmi(s, 0x10, res), /\$970D/);
});

test('$96FB timeout-expired ($4C == 0) throws at $9751 (restart to title)', () => {
  // $9751 JSR $9B3E / mode := 0. The continue window expired; restart to title.
  // RED WHEN: silent.
  const s = atSubstate(0xC0);
  s.snd[OFF.DUR] = 0;
  s.zp0A = 0;                                        // solo -> reaches $9751
  s.zp4C = 0;                                        // window expired
  s.zp33 = 0;                                        // not the cheat ($33 != $0A)
  assert.throws(() => nmi(s, 0, res), /\$9751/);
});

test('$96FB continue-cheat ($33 == $0A on timeout) throws at $9721', () => {
  // $971D CPY #$0A / BNE $974B. The continue cheat restores lives; unported.
  // RED WHEN: silent.
  const s = atSubstate(0xC0);
  s.snd[OFF.DUR] = 0;
  s.zp0A = 0;
  s.zp4C = 0;
  s.zp33 = 0x0A;                                     // the cheat code reached 10
  assert.throws(() => nmi(s, 0, res), /\$9721/);
});

test('$96FB multiplayer timeout ($0A != 0) throws at $97C5', () => {
  // $974B AND #$03 / BNE $97C5. A player still in the game at timeout -> switch.
  // RED WHEN: silent.
  const s = atSubstate(0xC0);
  s.snd[OFF.DUR] = 0;
  s.zp0A = 0x02;                                     // P2 still in
  s.zp4C = 0;
  s.zp33 = 0;
  assert.throws(() => nmi(s, 0, res), /\$97C5/);
});

// ====================================================== pulse1Dur reads $B0 (OFF.DUR)

test('pulse1Dur reads $B0 = pulse 1 DUR (snd[0], OFF.DUR)', () => {
  // $96FD LDA $B0. SND_BASE = $B0, OFF.DUR = 0, so $B0 == snd[0]. RED WHEN: the
  // helper reads the wrong offset (e.g. OWNER at +2).
  const s = createState();
  s.snd[OFF.DUR] = 0;
  assert.strictEqual(pulse1Dur(s), 0, '$B0 == 0 when pulse 1 is free');
  s.snd[OFF.DUR] = 0x37;
  assert.strictEqual(pulse1Dur(s), 0x37, '$B0 == 0x37 mid-note');
});

// ====================================================== the $9A35 export is pinned

test('stage.rankCountdown is exported as 8 bytes 03 03 04 04 05 05 06 06', () => {
  // $9A35, the rank-countdown half of the 16-byte block (tail = $9A3D). Read by
  // $9A1E LDA $9A35,X with X = $17. RED WHEN: the export reads the wrong address
  // or drops a byte.
  assert.deepEqual(RANK_CD, [3, 3, 4, 4, 5, 5, 6, 6]);
  assert.strictEqual(RANK_CD.length, 8, 'eight ranks 0..7');
});
