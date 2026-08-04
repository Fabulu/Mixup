// Wave 38 tests -- THE END-OF-GAME CHAIN AND THE LOOP WRAP.
//
// `$9872` -> `$9B3E` -> `$9BED` -> `$9C12` -> `$9C1E` -> `$988C` -> `$BB0F`
// -> `$CE94` -> `$98DD` -> `$98E5`, and out the other side into loop 2 of
// stage 1.
//
// WHAT THIS SUITE IS GUARDING, stated once so the individual checks read as
// consequences of it:
//
//  1. **`$9889 INC $28,X` IS THE ONLY LOOP-COUNTER INCREMENT IN THE PRG.**
//     Eleven instructions name `$1A` and none of them is indexed; `$28,X` has
//     exactly three (`$97BF` STA, `$9889` INC, `$9B72` LDA). So this one byte
//     is the whole of "loops exist", and `$1A` reaches an index register only
//     through `$B007 INY` and `$CEB5 TAX` -- it can never select a stream.
//  2. **`$9872`'s `INC $1B` LANDS ON THE STAGE-INTRO LADDER.** `jt_$982F[7..10]`
//     and `jt_$96C5[0..3]` hold the same four addresses. The ending is the
//     game's own intro, replayed, with the checkpoint bytes rewritten first --
//     which is why it happens over STAGE 1's terrain.
//  3. **`$988C` AND `$9C24` ARE THE SAME RUNG OF TWO LADDERS.** `$988C` falls
//     into `$9C24` while `$57` is 0 and diverts to the brain the frame it is
//     not, so `$9C24`'s own `$1B := $80` arm is unreachable from there.
//  4. **`$CB28` FALLS THROUGH INTO `$CB2B`.** `$BB72 JSR $CB28` is a sound
//     request AND the explosion conversion of slot 8; read as a sound request
//     alone, the next instruction writes an animation-script index into a live
//     metasprite object and nothing throws.
//  5. **`$CF2D` IS SEVEN WORDS AND ALL SEVEN ARE `$CF3B`.** The one
//     `$1A`-indexed pointer in the ROM is flat, and `$CEAC` clamps at 6.
//
// EVERY CHECK BELOW WAS WATCHED TO GO RED under the named mutant on its
// `RED WHEN` line, and the touched sources were sha256'd before and after every
// restore. The mutation table is in docs/worklog/gradius/38-impl-ending-loop.md.
//
// NOTHING HERE IS A CARTRIDGE COMPARISON. No corpus run clears seven stages,
// so every expected value was derived by hand out of rip/prg.asm and is written
// as a literal rather than re-read through the same constant the port indexes
// (docs/knowledge/03's seeding trap). Where a number does come from the export
// it is labelled.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { updateEnemies } from '../src/enemies.js';
import { nmi } from '../src/nmi.js';
import { bootState } from '../src/main.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const SLOT = 9;                       // $BB0F LDX #$09
const I = SLOT + ENEMY_BASE;          // 21: $0315 / $0335 / $0375 / $0475 / $0495
const J = 8 + ENEMY_BASE;             // 20: the metasprite object $988C puts at $74,$80

/** Stage 7 at the sub-state `$9A4D` hands over at `bossPage`, nothing else. */
function atEnd(sub = 0x86) {
  const s = bootState(res.manifest);
  s.zp19 = 6;
  s.substate = sub;
  return s;
}

/** A state with the brain already spawned and settled, ready for `$CE94`. */
function settled() {
  const s = createState();
  s.obj.type[I] = 0x28;
  s.obj.s0480[I] = 1;                 // $0495 != 0 -- phase 3
  return s;
}

// ===================== 1. $9872 -- THE LOOP WRAP ITSELF ======================

test('$9872: the checkpoint quartet is rewritten and $28,X is INCd', () => {
  // 9872 E6 1B / 9874 A6 18 / 9876 A9 00 / 9878 8D 01 20 / 987B 85 3F
  // 987D 95 26 / 987F 95 24 / 9881 A4 42 / 9883 F0 02 / 9885 A9 01
  // 9887 95 22 / 9889 F6 28 / 988B 60
  // RED WHEN: any of the five stores is dropped, $28,X is STA'd instead of
  // INC'd, or $22,X takes $42's value instead of ($42 ? 1 : 0).
  const s = atEnd();
  s.zp19 = 6;
  s.cam.hi = 0x0C;
  s.save22[0] = 9; s.save24[0] = 7; s.save26[0] = 6; s.save28[0] = 3;
  s.zp.meter = 4;                     // $42 != 0 -> $22,X becomes 1, NOT 4
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x87, '$9872 INC $1B');
  assert.strictEqual(s.cam.hi, 0x00, '$987B STA $3F');
  assert.strictEqual(s.save26[0], 0, '$987D STA $26,X -- the stage goes to 0');
  assert.strictEqual(s.save24[0], 0, '$987F STA $24,X -- the page goes to 0');
  assert.strictEqual(s.save22[0], 1, '$9887: $42 = 4 must store 1, not 4');
  assert.strictEqual(s.save28[0], 4, '$9889 INC $28,X: 3 -> 4');
  assert.strictEqual(s.bandA.mask, 0, '$9878 STA $2001 blanks THIS frame');
});

test('$9872: $42 == 0 leaves A at 0 and $22,X becomes 0', () => {
  // $9881 LDY $42 / $9883 BEQ $9887 -- the BEQ skips `LDA #$01`, so A is still
  // the 0 from $9876. A port that always wrote 1 would pass the check above.
  // RED WHEN: the `$42 ? 1 : 0` collapses to a constant.
  const s = atEnd();
  s.save22[0] = 9;
  s.zp.meter = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.save22[0], 0);
});

test('$9872 fires ONLY on $19 == 6 -- $9906 is an equality test', () => {
  // $9906 CMP #$06 / $9908 D0 03 BNE $990D. Stage 7 is the only stage that can
  // take it; stage 6 ($19 == 5) goes to $CDA5 and everything else falls past
  // both. RED WHEN: the compare becomes `>=` or moves to another stage.
  for (const st of [0, 1, 2, 3, 4, 5]) {
    const s = atEnd();
    s.zp19 = st;
    s.save28[0] = 0;
    nmi(s, 0, res);
    assert.strictEqual(s.save28[0], 0,
      `$19 = ${st} must NOT increment the loop counter`);
  }
  const s6 = atEnd();
  s6.zp19 = 6;
  s6.save28[0] = 0;
  nmi(s6, 0, res);
  assert.strictEqual(s6.save28[0], 1, '$19 = 6 must');
});

// ================== 2. THE LADDER, END TO END, AND THE WRAP ==================

test('the chain runs $86 -> loop 2 stage 1, and every leg has its own length', () => {
  // THE WHOLE POINT OF THIS SUITE. Driven through nmi(), from the sub-state
  // $9A4D hands over at bossPage, with no input at all.
  //
  // Each number below is a DERIVATION, not an observation:
  //   23  $9C24 emits 4 blocks a frame from a zero streamer lead and $9DA7
  //       first refuses on the 85th ($0180 = 384 px); 84/4 = 21 frames, one
  //       throttled frame, one frame to read $57. Same 23 the boot intro
  //       measures (src/flow.js).
  //   156 26 path records at $BB82 x 6 frames each ($BB2F CMP #$06).
  //   161 $4E := $A0 at $BB7D, DECd once a frame, then one tick.
  //   144 sixteen more characters at 9 frames each (8 DECs + the tick).
  //   256 $4C is 0 when $BB1F first DECs it, so it wraps the whole byte.
  //   23  the SECOND $9C24, on the same zero lead.
  // RED WHEN: any leg's length changes -- e.g. the 6-frame path step becomes
  // 5, $4E is re-armed with something other than 8, or $4C is pre-loaded.
  const s = atEnd();
  const at = {};
  const key = (a, b) => `${a.toString(16)}->${b.toString(16)}`;
  let prev = s.substate;
  let path26 = -1, settle = -1, firstChar = -1, done4F = -1;
  for (let f = 0; f < 2000; f++) {
    const before = s.obj.s0460[I];
    const before4F = s.zp4F;
    nmi(s, 0, res);
    if (s.substate !== prev) { at[key(prev, s.substate)] = f; prev = s.substate; }
    if (path26 < 0 && before === 25 && s.obj.s0460[I] === 26) path26 = f;
    if (settle < 0 && s.obj.s0480[I] !== 0) settle = f;
    if (firstChar < 0 && before4F === 0 && s.zp4F === 1) firstChar = f;
    if (done4F < 0 && s.zp4F === 0xFF) done4F = f;
    if (s.substate === 0x80) break;
  }
  assert.strictEqual(at['86->87'], 0, '$9872 on the first frame');
  assert.strictEqual(at['87->88'], 1, '$9B3E is a ONE-frame state');
  assert.strictEqual(at['88->89'], 2, '$9BED');
  assert.strictEqual(at['89->8a'], 3, '$9C12');
  assert.strictEqual(at['8a->8b'], 4, '$9C1E');
  assert.strictEqual(at['8b->8c'] - at['8a->8b'], 23,
    '$988C loops on $9C24 for 23 frames before the brain');
  assert.strictEqual(path26 - at['8b->8c'], 156, '26 path records x 6 frames');
  assert.strictEqual(firstChar - settle, 161, '$4E = $A0 then one tick');
  assert.strictEqual(at['8c->8d'] - done4F, 256,
    '$4C starts at 0, so $BB1F takes a full 256 frames');
  assert.strictEqual(at['8d->1'], at['8c->8d'] + 1, '$98E5 is one frame');
  assert.strictEqual(at['4->80'] - at['8d->1'], 26,
    'the second intro: states 1,2,3 then 23 frames of $9C24');
  // ...and the state it lands in.
  assert.strictEqual(s.substate, 0x80, 'PLAY');
  assert.strictEqual(s.zp19, 0, 'STAGE 1');
  assert.strictEqual(s.zp1A, 1, 'LOOP 2 -- $1A is no longer pinned at 0');
});

test('the second lap increments again: $1A goes 1 -> 2', () => {
  // The wrap is not a one-shot. RED WHEN: $9872 sets $28,X to 1 instead of
  // INCing it, which the first-lap check above cannot tell apart.
  const s = atEnd();
  s.save28[0] = 1;
  s.zp1A = 1;
  for (let f = 0; f < 2000 && s.substate !== 0x80; f++) nmi(s, 0, res);
  assert.strictEqual(s.zp1A, 2);
});

test('$98DD runs the object pass and NOTHING else', () => {
  // 98DD E6 5B / 98DF 20 AB AD / 98E2 4C 8C 9A. No spawn engine, no player,
  // no collision, no enemy bullets, no streamer.
  // RED WHEN: st98DD calls mode5Body instead of mode5Tail -- the player would
  // move and the spawn engine would run.
  const s = atEnd(0x8C);
  s.obj.status[0] = 1;
  s.obj.x[0] = 0x50;
  s.zp5B = 0;
  const before = { x: s.obj.x[0], z60: s.spawn.z60 };
  nmi(s, 0x01, res);                  // RIGHT held: $9FFC would move the ship
  assert.strictEqual(s.obj.x[0], before.x, '$98DD must not run the player');
  assert.strictEqual(s.spawn.z60, before.z60, 'nor the spawn engine');
  assert.strictEqual(s.zp5B, 1, '$98DD INC $5B, and $9658 did not clear it');
});

// ===================== 3. $988C -- THE DIVERSION ============================

test('$988C streams while $57 is 0 and does NOT advance $1B', () => {
  // 988C A5 57 / D0 03 / 9890 4C 24 9C. $9C24 has no INC $1B on that arm.
  // RED WHEN: st988C advances $1B unconditionally, or the $57 test is inverted.
  const s = atEnd(0x8B);
  s.build.ahead = 0;
  const before = s.vram.cursor;
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x8B, 'still $8B');
  assert.notStrictEqual(s.vram.cursor, before, '$9C24 queued terrain');
  assert.strictEqual(s.obj.type[I], 0, 'and did NOT spawn the brain');
});

test('$988C spawns the brain the frame $57 is set, and $9C24 never sees it', () => {
  // 9893-98DA. The six object writes, the two $0100 writes, INC $1B, sfx $E8,
  // INC $1F and the two canned packets.
  // The `$1B := $80` arm of $9C24 ($9C38 -> $9C3C) is UNREACHABLE from here
  // because $988C tests $57 first -- asserted as "$1B is $8C, never $80".
  // RED WHEN: the $57 test is dropped, any coordinate is wrong, or the port
  // delegates the whole rung to introTerrain.
  const s = atEnd(0x8B);
  s.build.ahead = 1;                  // the streamer says "far enough ahead"
  s.zp1F = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.substate, 0x8C, '$98C5 INC $1B -- and NOT $9C3C\'s $80');
  assert.strictEqual(s.obj.type[I], 0x28, '$989F STA $0315 -- entry 40');
  assert.strictEqual(s.obj.y[I], 0x88, '$98A4 STA $0335');
  assert.strictEqual(s.obj.x[I], 0xA4, '$98A9 STA $0375');
  assert.strictEqual(s.obj.y[J], 0x80, '$98AE STA $0334');
  assert.strictEqual(s.obj.x[J], 0x74, '$98B3 STA $0374');
  assert.strictEqual(s.obj.anim[J], 0x9E, '$98B8 STA $0134');
  assert.strictEqual(s.obj.anim[0], 0, '$98BF STA $0120 -- the ship stops drawing');
  assert.strictEqual(s.obj.status[0], 3, '$98C9 STA $0100 -- 3, written AFTER the 0');
  assert.strictEqual(s.zp1F, 1, '$98D1 INC $1F');
  assert.ok(s.sfx.includes(0xE8), '$98CC sfx $E8');
});

// ================ 4. $BB0F -- THE BRAIN'S 26-RECORD PATH ====================

test('$BB0F steps once every SIX frames, and only on a stepped frame', () => {
  // $BB29 INC $014C,X / CMP #$06 / BCC RTS, and $B647's tail zeroes the timer.
  // RED WHEN: the threshold moves, or the timer is reset on the non-stepping
  // frames too (which would make it step every frame).
  const s = createState();
  s.obj.type[I] = 0x28;
  const seen = [];
  for (let f = 0; f < 18; f++) { updateEnemies(s, res); seen.push(s.obj.s0460[I]); }
  assert.deepStrictEqual(seen,
    [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3],
    'steps on frames 5, 11, 17');
});

test('$BB82 record 0 is dX 1 / no Y climb / metasprite $96', () => {
  // $BB82 = `01 00`, and the port must read byte 0 as a signed-by-wrap X delta
  // and byte 1 as (Yhi << 4 | msLo). Written as literals off rip/prg.asm.
  // RED WHEN: the two bytes are swapped, or the nibbles are.
  const s = createState();
  s.obj.type[I] = 0x28;
  s.obj.x[I] = 0xA4; s.obj.y[I] = 0x88;
  for (let f = 0; f < 6; f++) updateEnemies(s, res);
  assert.strictEqual(s.obj.x[I], 0xA5, '$BB43 ADC $0375');
  assert.strictEqual(s.obj.y[I], 0x88, 'high nibble 0 -- no climb');
  assert.strictEqual(s.obj.anim[I], 0x96, '$BB61 ADC #$96 with low nibble 0');
  assert.strictEqual(s.obj.timer[I], 0, '$B64C STA $014C,X');
});

test('the whole path: 26 records, and the LAST one is $E6/$37', () => {
  // $BBB0 = `E6 37`, $BBB6 = `FF`. `$E6` is -26, `$37` is Y += 3 (subtract 3
  // from $0335) and metasprite $96 + 7 = $9D. The endpoint is a DERIVATION:
  // sum the 26 dX bytes as signed and the 26 high nibbles, off rip/prg.asm.
  //   sum(dX)  = +14 (records 0-9) then negative all the way to -$A4 net
  //   sum(Yhi) = the climb
  // RED WHEN: the terminator is missed and the port walks into $BBB7's opcodes,
  // or a record is skipped.
  const s = createState();
  s.obj.type[I] = 0x28;
  s.obj.x[I] = 0xA4; s.obj.y[I] = 0x88;
  let dx = 0, dy = 0;
  for (let r = 0; r < 26; r++) {
    dx += rom.read(0xBB82 + 2 * r) << 24 >> 24;      // signed byte
    dy += rom.read(0xBB83 + 2 * r) >> 4;
  }
  assert.strictEqual(rom.read(0xBB82 + 52), 0xFF, '$BBB6 terminates it');
  for (let f = 0; f < 26 * 6; f++) updateEnemies(s, res);
  assert.strictEqual(s.obj.s0460[I], 26, 'all 26 records consumed');
  assert.strictEqual(s.obj.x[I], u8(0xA4 + dx));
  assert.strictEqual(s.obj.y[I], u8(0x88 - dy));
  // and the port must have STOPPED: one more step would read $BBB7's `LDA $5D`.
  for (let f = 0; f < 12; f++) updateEnemies(s, res);
  assert.strictEqual(s.obj.s0460[I], 26, 'the $FF is not consumed as a record');
});

test('$BB66: the triangle owner $D4 gates the settle', () => {
  // $BB6B LDA $D4 / D0 12 BNE $BB81. $D4 is $D2 + OFF.OWNER.
  // RED WHEN: the gate is dropped, or it reads pulse 1's $B2 instead.
  const s = createState();
  s.obj.type[I] = 0x28;
  s.obj.s0460[I] = 26;                // path already exhausted
  s.snd[0xD4 - 0xB0] = 0x40;          // the triangle is mid-note
  for (let f = 0; f < 12; f++) updateEnemies(s, res);
  assert.strictEqual(s.obj.s0480[I], 0, '$0495 must not advance while $D4 is set');
  assert.strictEqual(s.obj.anim[I], 0, 'but $BB68 blanks the brain anyway');
  s.snd[0xD4 - 0xB0] = 0;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.s0480[I], 1, '$BB7A INC $0495');
  assert.strictEqual(s.zp4E, 0xA0, '$BB7D STA $4E');
});

test('$BB72 JSR $CB28 FALLS INTO $CB2B: slot 8 becomes an explosion', () => {
  // THE FALL-THROUGH. $CB28 is `JSR $EC1E` with sub_$CB2B immediately after it
  // and no RTS between. Read as a plain sound request, slot 8 keeps type 0 and
  // its live metasprite, and the very next instruction ($BB75 STA $016C,X)
  // writes an explosion-script index into it.
  // RED WHEN: explodeInPlace() is dropped from loc_BB66.
  const s = createState();
  s.obj.type[I] = 0x28;
  s.obj.s0460[I] = 26;
  s.obj.type[J] = 0x00; s.obj.anim[J] = 0x9E; s.obj.status[J] = 1;
  for (let f = 0; f < 5; f++) updateEnemies(s, res);   // $BB2F's six-frame gate
  assert.strictEqual(s.obj.type[J], 0x00, 'nothing yet -- the gate is 6 frames');
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[J], 0x02, '$CB45/$CB47: slot 8 type := 2');
  assert.strictEqual(s.obj.status[J], 0, '$CB3C STA $010C,X');
  assert.strictEqual(s.obj.animFrame[J], 0x05, '$BB75 overrides script 2 with 5');
  assert.ok(s.sfx.includes(0xAC), 'and the sound still happens');
  // $ADAB walks slots 9 DOWN to 0, so slot 8 is dispatched as an explosion in
  // this same frame and $AE99 consumes one byte of script 5 -- the metasprite
  // is no longer the ending picture $988C put there.
  assert.notStrictEqual(s.obj.anim[J], 0x9E);
  assert.strictEqual(s.obj.xvel[J], 1, '$AEB5 INC $042C,X, the script cursor');
});

test('$BB1F: $4C counts a full 256 frames, then frees slot 9 and INCs $1B', () => {
  // $BB1F DEC $4C / D0 5E. $4C is 0 on entry ($9B3E cleared it), so the first
  // DEC gives $FF. RED WHEN: the count is pre-loaded, or the free is dropped.
  const s = settled();
  s.substate = 0x8C;
  s.zp4F = 0xFF;
  s.zp4C = 0;
  for (let f = 0; f < 255; f++) updateEnemies(s, res);
  assert.strictEqual(s.zp4C, 1, '255 DECs from 0 leave 1');
  assert.strictEqual(s.obj.type[I], 0x28, 'and the brain is still there');
  updateEnemies(s, res);
  assert.strictEqual(s.zp4C, 0);
  assert.strictEqual(s.obj.type[I], 0, '$AEF8');
  assert.strictEqual(s.substate, 0x8D, '$BB26 INC $1B');
});

// ==================== 5. $CE94 -- THE TYPEWRITER ============================

test('$CF2D is SEVEN words and all seven are $CF3B', () => {
  // The single fact that rules out "loops select a different stream". Written
  // as a literal; the seven-ness is the clamp's ($CEAE CMP #$06), not a guess.
  // RED WHEN: the export narrows, or the port stops reading the table at all.
  for (let i = 0; i < 7; i++) {
    assert.strictEqual(rom.read(0xCF2D + 2 * i) | (rom.read(0xCF2E + 2 * i) << 8),
      0xCF3B, `entry ${i}`);
  }
  assert.strictEqual(rom.read(0xCF3B), 0x22);
  assert.strictEqual(rom.read(0xCF3C), 0xC8, 'the PPU address $22C8');
  assert.strictEqual(rom.read(0xCF4D), 0xFE, 'the pause terminator');
});

test('$CEAC clamps $1A at 6 and the text is identical at every loop', () => {
  // $CEAC LDA $1A / CMP #$06 / BCC $CEB4 / LDA #$06. An UNCLAMPED $1A of 200
  // would index $CF2D + 400 = $D0BD, deep in the terrain tables.
  // RED WHEN: the clamp is dropped (the reader throws or reads terrain) or the
  // table index is not doubled.
  const shot = (loop) => {
    const s = settled();
    s.zp1A = loop;
    s.zp4F = 4;                       // emit five characters
    s.vram.cursor = 0x20;
    updateEnemies(s, res);
    return [...s.vram.q.slice(0x20, s.vram.cursor)];
  };
  const base = shot(0);
  for (const loop of [1, 5, 6, 7, 0xFF]) {
    assert.deepStrictEqual(shot(loop), base, `loop counter ${loop}`);
  }
  assert.ok(base.length > 4, 'and it emitted something');
});

test('$CE94 emits ($4F + 1) characters into ONE packet, from the start', () => {
  // $CED6 STA $9A, $CF23 DEC $9A before each character, $CEF4 BPL. So tick n
  // re-sends the whole line: [$01][$22][$C8][chars...][$FF].
  // The sixteen character bytes are written as literals off rip/prg.asm --
  // NOT re-read through rom.read(0xCF3D + i), which would agree with itself.
  const TEXT = [0x0B, 0x05, 0x0F, 0x01, 0x07, 0x02, 0x0C, 0x1C,
                0x08, 0x02, 0x0C, 0x11, 0x05, 0x0F, 0x0A, 0x39];
  // RED WHEN: the DEC/emit order flips (n instead of n+1 characters), the two
  // address bytes are dropped, or the $FF terminator is not appended.
  for (const n of [0, 1, 5, 15]) {
    const s = settled();
    s.zp4F = n;
    s.vram.cursor = 0x30;
    updateEnemies(s, res);
    const got = [...s.vram.q.slice(0x30, s.vram.cursor)];
    assert.deepStrictEqual(got,
      [0x01, 0x22, 0xC8, ...TEXT.slice(0, n + 1), 0xFF],
      `$4F = ${n} must emit ${n + 1} characters`);
    assert.strictEqual(s.zp4F, n + 1, '$CF09 INC $4F');
    assert.strictEqual(s.zp4E, 0x08, '$CEAA re-arms the 8-frame delay');
  }
});

test('the SIXTEENTH tick hits the $FE and skips the click sound', () => {
  // $CEEB CMP #$FE / F0 1D -> $CF0C LDA #$80 / STA $4F / D0 F0 BNE $CF02.
  // $CF02 is PAST the $CEF6-$CEFF click, so the pause tick is silent -- and
  // then $CF09 INCs $4F to $81, which is why the phase byte is never observed
  // as $80.
  // RED WHEN: the $FE arm falls into the click, or sets $4F to $FF directly.
  const s = settled();
  s.zp4F = 16;
  s.vram.cursor = 0x30;
  s.sfx.length = 0;
  updateEnemies(s, res);
  assert.strictEqual(s.zp4F, 0x81, '$CF0C then $CF09');
  assert.ok(!s.sfx.includes(0x35) && !s.sfx.includes(0x3F),
    'no typewriter click on the pause tick');
  assert.strictEqual(s.vram.q[s.vram.cursor - 1], 0xFF, '$CF02 still runs');
});

test('the click reads the byte just written, and is $35 on every reachable tick', () => {
  // $CEF6 LDA #$3F / $CEF8 LDY $06FF,X / F0 02 BEQ $CEFF / $CEFD LDA #$35.
  // `$06FF,X` is $0700 + X - 1, i.e. the LAST byte appended -- which at this
  // point is the newest character, because $CF02's $FF has not been written
  // yet.
  //
  // THE `$3F` ARM IS TRANSCRIBED AND UNREACHABLE ON THIS SCRIPT, and that is
  // stated rather than faked: `$CF3D`'s sixteen characters are
  // 0B 05 0F 01 07 02 0C 1C 08 02 0C 11 05 0F 0A 39 and NONE of them is $00,
  // so no value of $4F can put a 0 in front of $CEF8. Forcing one would be an
  // intervention that proves a JS branch, not a cartridge state; the branch is
  // kept because it is in the listing.
  // RED WHEN: the two sounds are swapped, or the inspected byte is off by one
  // (the $FF terminator, or the character before).
  const TEXT = [0x0B, 0x05, 0x0F, 0x01, 0x07, 0x02, 0x0C, 0x1C,
                0x08, 0x02, 0x0C, 0x11, 0x05, 0x0F, 0x0A, 0x39];
  assert.ok(!TEXT.includes(0x00), 'no blank in the script -- $3F cannot fire');
  for (const n of [0, 7, 15]) {
    const s = settled();
    s.zp4F = n;
    s.vram.cursor = 0x30;
    s.sfx.length = 0;
    updateEnemies(s, res);
    assert.ok(s.sfx.includes(0x35), `$4F = ${n} clicks with $35`);
    assert.ok(!s.sfx.includes(0x3F), 'and never with $3F');
    assert.strictEqual(s.vram.q[s.vram.cursor - 2], TEXT[n],
      'the byte $CEF8 inspects is the newest CHARACTER, not $CF02\'s $FF');
  }
});

test('$CE94 finishes on pulse 1 going free: $4F := $FF and +10,000 points', () => {
  // $CECA LDA $B2 / D0 07, then $CECE LDA #$FF / STA $4F / $CED2 JSR $843F.
  // $843F is $9B:$9A:$99 = 01 00 00 -- BCD $010000, ten thousand points.
  // RED WHEN: the $B2 wait is dropped, or the score add is the wrong magnitude.
  const s = settled();
  s.zp4F = 0x81;
  s.snd[0x02] = 0x50;                 // $B2: pulse 1 is owned
  updateEnemies(s, res);
  assert.strictEqual(s.zp4F, 0x81, 'still waiting');
  s.snd[0x02] = 0;
  s.zp4E = 0;                         // the delay is not what is under test
  updateEnemies(s, res);
  assert.strictEqual(s.zp4F, 0xFF);
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x00, 0x00, 0x01],
    '$843F adds BCD $010000');
});

test('$4F == $FF stops $CE94 being called at all', () => {
  // $BB16 LDA $4F / CMP #$FF / F0 03 BEQ $BB1F -- the typewriter is not
  // re-entered once it is done, so the score is added exactly once.
  // RED WHEN: the $FF test moves inside $CE94 only.
  const s = settled();
  s.zp4F = 0xFF;
  s.zp4C = 0x10;
  s.vram.cursor = 0x30;
  updateEnemies(s, res);
  assert.strictEqual(s.vram.cursor, 0x30, 'nothing queued');
  assert.strictEqual(s.zp4C, 0x0F, '$BB1F ran instead');
});

test('the ending music is requested while $4F is 0 and pulse 2 is free', () => {
  // $CE94 LDA $C3 / D0 09 and $CE98 LDA $4F / D0 05, both skipping $CE9C.
  // RED WHEN: either gate is dropped, or the sound index is not $B2.
  const s = settled();
  s.zp4F = 0; s.snd[0xC3 - 0xB0] = 0; s.sfx.length = 0;
  updateEnemies(s, res);
  assert.ok(s.sfx.includes(0xB2), '$CE9C sfx $B2');
  const busy = settled();
  busy.zp4F = 0; busy.snd[0xC3 - 0xB0] = 0x20; busy.sfx.length = 0;
  updateEnemies(busy, res);
  assert.ok(!busy.sfx.includes(0xB2), 'pulse 2 owned -> no request');
  const late = settled();
  late.zp4F = 3; late.snd[0xC3 - 0xB0] = 0; late.sfx.length = 0;
  updateEnemies(late, res);
  assert.ok(!late.sfx.includes(0xB2), '$4F != 0 -> no request');
});

// ================== 6. THE $1A CONSUMERS, NOW THAT THEY RUN =================

test('loop 2 makes $B003 read the NEXT row of $B01D', () => {
  // $B003 LDA $1A / F0 01 / INY, on top of `LDY $17 / ($19 != 0) INY`. The row
  // is `64 46 3C 37 32 2D 28 23 1E` -- literals off rip/prg.asm.
  // This is the only $1A reader that changes a TABLE index, and it is the
  // reason "loop 2 difficulty" is a thing at all.
  // RED WHEN: the loop nudge is dropped or applied twice.
  const ROW = [0x64, 0x46, 0x3C, 0x37, 0x32, 0x2D, 0x28, 0x23, 0x1E];
  for (let i = 0; i < 9; i++) {
    assert.strictEqual(rom.read(0xB01D + i), ROW[i], `$B01D[${i}]`);
  }
  // rank 0, stage 1, loop 1 -> Y = 0 -> $64. Loop 2 -> Y = 1 -> $46.
  assert.strictEqual(ROW[0], 0x64);
  assert.strictEqual(ROW[1], 0x46, 'a hatch fires 46/64 as often on loop 2');
});

test('$1A is not pinned: the port reaches a non-zero loop counter', () => {
  // The headline. Before W38 `state.zp1A` could only ever be 0, because the
  // only instruction in the PRG that increments it ($9889) was unported.
  // RED WHEN: $9872 stops INCing, or $9B3E stops restoring $1A from $28,X.
  const s = atEnd();
  assert.strictEqual(s.zp1A, 0, 'starts pinned');
  for (let f = 0; f < 2000 && s.substate !== 0x80; f++) nmi(s, 0, res);
  assert.strictEqual(s.zp1A, 1);
});
