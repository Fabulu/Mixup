// Wave 36 tests -- STAGE 7 (`$19 = 6`): `$B569` (dispatch entry 30, the
// SHUTTER), `$AF10` (entries 32-37, the GALLERY) and `$9A12` (the stage-7
// countdown seed, whose own checks live in w24-substate.test.js beside the rest
// of the `$982F` ladder).
//
// WHAT THIS SUITE IS GUARDING, stated once so the individual checks read as
// consequences of it:
//
//  1. **`$B5BA BPL $B5A9` FALLS INTO `$B5BC`.** `loc_B5BC`'s only listed xref
//     is `$B5A2 BCS`, so the even-step arm looks like it ends at the
//     collision-map loop. It does not: there is no `JMP` and no `RTS` between
//     `$B5BA` and `$B5BC`. Read the other way, the shutter draws on three of
//     its six steps instead of six. Fall-through incident sixteen.
//  2. **`$B569` IS NOT AN ENEMY.** `$B574 INC $5B` runs on EVERY gate frame,
//     above the phase test, and `$5B` suppresses the camera (`$9A9C`) and the
//     terrain streamer (`$9ACA`). The shutter freezes the world for 121 frames.
//  3. **IT BACK-PATCHES PACKETS IT HAS ALREADY QUEUED**, by absolute address
//     `$06F1,Y` with `Y = $0E`, i.e. `$0700 + $0E - 15`. Same shape as `$88E5
//     STA $06FE,Y` in src/hud.js, eight bytes deeper.
//  4. **PACKET `$1F` IS THE FIRST CALLER OF `$85F3`'s `$FD` ARM** -- three
//     packets out of one index, which src/hudpackets.js recorded as "NOT
//     EXERCISED BY ANY MEASURED FRAME".
//  5. **`$AF10`'s BLINK IS DRIVEN BY `$02`, NOT BY THE OBJECT**, so all six
//     gallery pieces are on and off on the same frames.
//
// EVERY CHECK BELOW WAS WATCHED TO GO RED under the named mutant on its
// `RED WHEN` line, and the touched sources were sha256'd before and after every
// restore. The mutation table is in docs/worklog/gradius/36-impl-stage7.md.
//
// NOTHING HERE IS A CARTRIDGE COMPARISON. Every expected value was derived by
// hand out of rip/prg.asm and is written as a literal, NOT re-read through the
// same constant the port indexes -- docs/knowledge/03's seeding trap. Where a
// number does come from the export it is labelled.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { updateEnemies, spawnEngine, freeSlot } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const SLOT = 9;
const I = SLOT + ENEMY_BASE;
const STAGE7 = 6;

/** A state with one object in slot 9, on stage 7, nothing else running. */
function one(type, x = 0x80, y = 0x40) {
  const s = createState();
  s.zp19 = STAGE7;
  s.obj.type[I] = type;
  s.obj.x[I] = x;
  s.obj.y[I] = y;
  return s;
}

/** One `$ADAB` pass with `$5B` cleared first, the way `$9658` leaves it. */
function frame(s, at) {
  if (at !== undefined) s.frame = at & 0xFF;
  s.zp5B = 0;
  updateEnemies(s, res);
}

// ======================= 1. $AF10 -- THE GALLERY ============================

test('$AF10: each of the six types draws its OWN metasprite, in $AF0A order', () => {
  // $AF1A LDA $030C,X / SEC / SBC #$20 / TAY / $AF21 LDA $AF0A,Y.
  // `$AF0A` = `89 87 8C 8B 8A 88`, read off rip/prg.asm and written here as
  // literals rather than re-read through `rom.read(0xAF0A + y)` -- a check that
  // indexes the same table with the same offset agrees with itself whatever
  // either holds (docs/knowledge/03).
  // RED WHEN: the `- $20` becomes `- $1F`, the table base moves, or the six
  // entries are read in the wrong order.
  const EXPECT = { 0x20: 0x89, 0x21: 0x87, 0x22: 0x8C,
                   0x23: 0x8B, 0x24: 0x8A, 0x25: 0x88 };
  for (const [t, ms] of Object.entries(EXPECT)) {
    const s = one(Number(t));
    frame(s, 0);                        // $02 = 0 -> ($02 AND $1F) = 0 < $1A: ON
    assert.strictEqual(s.obj.anim[I], ms,
      `type $${Number(t).toString(16).toUpperCase()} must draw metasprite `
      + `$${ms.toString(16).toUpperCase()}`);
  }
  // ...and the six are DISTINCT, which is what makes the table an index rather
  // than a constant: a handler that ignored the type would pass the loop above
  // only if every entry were the same byte.
  assert.strictEqual(new Set(Object.values(EXPECT)).size, 6);
});

test('$AF10: 26 frames ON, 6 OFF, in a 32-frame cycle driven by $02', () => {
  // $AF12 LDA $02 / AND #$1F / CMP #$1A / BCS $AF26 (metasprite 0).
  // So the ON window is ($02 AND $1F) in $00..$19 -- 26 of 32 -- and it is the
  // GLOBAL frame counter, not the object's own timer.
  // RED WHEN: the bound moves off $1A, the mask off $1F, or the comparison is
  // inverted.
  const on = [];
  const s = one(0x20);
  for (let f = 0; f < 32; f++) { frame(s, f); on.push(s.obj.anim[I] !== 0); }
  assert.strictEqual(on.filter(Boolean).length, 26, '26 frames ON');
  assert.strictEqual(on.filter((v) => !v).length, 6, '6 frames OFF');
  // and the OFF frames are exactly $1A..$1F, contiguous at the TOP of the cycle
  assert.deepStrictEqual(on.map((v, i) => (v ? null : i)).filter((v) => v !== null),
    [0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F]);
  // it repeats on the next 32 frames -- i.e. the phase really is `$02 AND $1F`
  // and not a counter that runs on
  const on2 = [];
  for (let f = 32; f < 64; f++) { frame(s, f); on2.push(s.obj.anim[I] !== 0); }
  assert.deepStrictEqual(on2, on, 'the cycle is 32 frames, not 64');
});

test('$AF10: all six blink in LOCK-STEP -- the phase is not per-object', () => {
  // The consequence of the check above, asserted on its own because it is the
  // visible thing: the gallery flashes as one piece.
  // RED WHEN: the blink is driven from `$014C,X`/`$016C,X` or any per-slot byte.
  const states = [];
  for (let t = 0x20; t <= 0x25; t++) states.push(one(t));
  for (let f = 0; f < 40; f++) {
    const drawn = states.map((s) => { frame(s, f); return s.obj.anim[I] !== 0; });
    assert.strictEqual(new Set(drawn).size, 1,
      `frame ${f}: all six gallery pieces must agree`);
  }
});

test('$AF10: $AF2B JMP $AEDD -- it drifts, and $5B stops the drift but not the draw', () => {
  // $AF28 STA $012C,X comes BEFORE $AF2B JMP $AEDD, and $AEDD's own first
  // instruction is `LDA $5B / BNE $AF09`. So on a frozen frame the metasprite
  // is still written and only the movement is suppressed. A port that put the
  // freeze test first would blank the gallery whenever anything froze the world
  // -- which on stage 7 is the shutter, three chunks earlier.
  // RED WHEN: $AF28 is moved below the $AEDD call, or the $AEDD call is dropped.
  const s = one(0x22, 0x80);
  frame(s, 0);
  assert.strictEqual(s.obj.xf[I], 0x80, '$AEE3: xf -= $80 on an unfrozen frame');
  const before = s.obj.anim[I];
  s.frame = 0; s.zp5B = 1;              // frozen
  updateEnemies(s, res);
  assert.strictEqual(s.obj.anim[I], before, 'the metasprite is still written');
  assert.strictEqual(s.obj.xf[I], 0x80, 'and $AEE1 did NOT run');
});

test('$AF10: a type outside $20-$25 is a LOUD named throw at $AF21', () => {
  // `$AF0A` is SIX bytes ($AF0A-$AF0F) and `$AF10` is entries 32-37 only, and
  // it never calls `$B0B4`, so `$030C,X` stays $20-$25 for the object's life.
  // An initialised $A0-$A5 would give Y = $80-$85 and $AF21 would read $AF8A --
  // st_AF88's own opcodes. W34's $B415 shape, and it must not arrive as
  // assets.js's "not in any exported range", which points at export_assets.py.
  // RED WHEN: the bound is dropped, or widened to hide a wrong index.
  const s = one(0xA0);                  // $20 | $80
  assert.throws(() => frame(s, 0), /\$AF21 LDA \$AF0A,Y/);
  // the message has to name the type it actually got, or a crash report needs a
  // re-derivation to be useful
  let msg = '';
  try { frame(one(0xA5), 0); } catch (e) { msg = e.message; }
  assert.match(msg, /\$A5/);
  assert.match(msg, /do not.*widen/i);
});

// ======================= 2. $B569 -- THE SHUTTER ============================
//
// The three nametable address PAIRS and the two data bytes below were derived
// by hand from `$B606`'s 24 bytes in rip/prg.asm:
//
//   $B606  25 78 26 18 | 25 98 25 F8 | 25 B8 25 D8 | FF 00 FF FF | C3 FF ...
//
// with `X = (step AND $FE) * 2` = 0/0/4/4/8/8, so steps 0+1 share the first
// pair, 2+3 the second, 4+5 the third. Written as literals here on purpose.

const PAIRS = [[0x2578, 0x2618], [0x2578, 0x2618],
               [0x2598, 0x25F8], [0x2598, 0x25F8],
               [0x25B8, 0x25D8], [0x25B8, 0x25D8]];

/** Drive one shutter from spawn to free, recording every frame's effect. */
function runShutter() {
  const s = one(0x1E, 0xB0);            // $AEDD decrements it to $AF on frame 0
  // THE MAP IS PRE-FILLED WITH A SENTINEL, and it has to be: `$B612` is
  // `FF 00 FF`, and against a zero-filled map the two `00` writes are invisible
  // to a before/after diff -- the first version of the check below counted 8
  // cells and called it 12 wrong. The sentinel is a FIXTURE choice, not a game
  // state; nothing but `$B569` writes `state.coll` in this suite.
  s.coll.fill(0x5A);
  const log = [];
  for (let f = 0; f < 200; f++) {
    const q0 = s.vram.cursor;
    const coll0 = Uint8Array.from(s.coll);
    frame(s);
    const changed = [];
    for (let k = 0; k < coll0.length; k++) if (coll0[k] !== s.coll[k]) changed.push(k);
    log.push({ f, phase: s.obj.s0460[I], zp5B: s.zp5B, freed: s.obj.type[I] === 0,
               queued: (s.vram.cursor - q0 + 256) % 256, coll: changed,
               bytes: [...s.vram.q.slice(q0, s.vram.cursor)] });
    if (s.obj.type[I] === 0) break;
  }
  return { s, log };
}

test('$B569: x >= $B0 does NOTHING -- no freeze, no queue, no map write', () => {
  // $B56C LDA $036C,X / CMP #$B0 / BCC $B574 / RTS. The shutter drifts in under
  // $AEDD first and only takes over below $B0.
  // RED WHEN: the bound moves, or the comparison is inverted.
  // AND `$B0` ITSELF IS ABOVE THE TRIGGER: `BCC` is strictly-less-than, so the
  // shutter starts at `$AF`. That is worth its own assertion because `$B569
  // JSR $AEDD` runs FIRST, so a shutter seeded at exactly `$B0` still triggers
  // on its first frame -- `$AEE1` has already decremented it. Two different
  // facts that look like one.
  const s = one(0x1E, 0xB2);
  frame(s);
  assert.strictEqual(s.zp5B, 0, 'no $B574 INC $5B above the trigger');
  assert.strictEqual(s.vram.cursor, 0, 'and nothing queued');
  assert.strictEqual(s.obj.s0460[I], 0, 'and no phase advance');
  // ...but it DID drift, which is what eventually brings it below $B0.
  // $AEE1 subtracts $80 from the FRACTION, so the integer moves every OTHER
  // frame: $B2 -> $B1 -> $B1 -> $B0 -> $B0 -> $AF.
  assert.strictEqual(s.obj.xf[I], 0x80, '$AEE1 still ran');
  assert.strictEqual(s.obj.x[I], 0xB1, 'and borrowed on the first frame');
  const xs = [];
  for (let f = 0; f < 5; f++) { frame(s); xs.push([s.obj.x[I], s.zp5B]); }
  assert.deepStrictEqual(xs,
    [[0xB1, 0], [0xB0, 0], [0xB0, 0], [0xAF, 1], [0xAF, 1]],
    'half-rate drift, and the freeze starts at $AF -- BCC is strictly less');
});

test('$B569: the phase-0 frame queues packet $1F as THREE packets ($85F3\'s $FD)', () => {
  // $B57B INC $046C,X / LDA #$1F / JMP $85E8. Packet $1F is
  // `27 D6 AF FD 27 DE AA FD 27 E6 FA FE`, and $862D's $FD arm emits $FF, resets
  // $9B and emits a fresh mode byte $01 -- so ONE index produces three complete
  // single-byte ATTRIBUTE writes at $27D6, $27DE and $27E6. src/hudpackets.js
  // recorded this arm as unexercised by any measured frame; it is exercised now.
  // The 15 bytes below are hand-expanded from the stream, not read back from it.
  // RED WHEN: the packet index changes, the $FD arm collapses to one packet, or
  // the phase-0 arm falls through into the step code.
  const { log } = runShutter();
  const f0 = log[0];
  assert.strictEqual(f0.phase, 1, '$B57B: phase 0 -> 1 on the first gate frame');
  assert.deepStrictEqual(f0.bytes,
    [0x01, 0x27, 0xD6, 0xAF, 0xFF,
     0x01, 0x27, 0xDE, 0xAA, 0xFF,
     0x01, 0x27, 0xE6, 0xFA, 0xFF]);
  assert.deepStrictEqual(f0.coll, [], 'and phase 0 writes no collision cell');
});

test('$B569: TWENTY frames per step, and $5B is INCd on EVERY one of them', () => {
  // $B58A INC $04AC,X / CMP #$14 / BCS $B595, and $B574 INC $5B sits ABOVE the
  // phase test -- so the 19 frames that only bump the counter still freeze the
  // camera and the terrain streamer. That is the difference between a shutter
  // that stops the level and one that opens while the screen scrolls past it.
  // RED WHEN: the dwell moves off $14, or $B574 is pushed below the phase test.
  const { log } = runShutter();
  const steps = log.filter((r) => r.queued === 16).map((r) => r.f);
  assert.deepStrictEqual(steps, [20, 40, 60, 80, 100, 120],
    'six steps, twenty frames apart, the first one step after phase 0');
  for (const r of log) {
    assert.strictEqual(r.zp5B, 1, `frame ${r.f}: $B574 INC $5B must run`);
  }
});

test('$B569: phase 7 frees the slot -- $B587 JMP $AEF8', () => {
  // $B583 CPY #$07 / BCC $B58A / JMP $AEF8. Six steps then gone: 1 setup frame
  // + 6 * 20 = 121 frames of frozen screen from the trigger.
  // RED WHEN: the bound moves off 7, or the free becomes an early return (which
  // would leave the shutter freezing the stage forever).
  const { s, log } = runShutter();
  const freed = log.find((r) => r.freed);
  assert.ok(freed, 'the shutter must free itself');
  assert.strictEqual(freed.f, 121, '1 + 6*20 frames from the trigger');
  assert.strictEqual(s.obj.type[I], 0, '$AEF8 clears $030C,X');
});

test('$B569 THE FALL-THROUGH: EVEN steps write the map AND queue; odd steps only queue', () => {
  // `$B5BA BPL $B5A9` FALLS INTO `$B5BC`. loc_B5BC's only listed xref is the
  // `$B5A2 BCS` that SKIPS the loop, so a reader who stops at the loop gets a
  // shutter that queues on three steps of six. There is no JMP and no RTS
  // between $B5BA and $B5BC.
  // RED WHEN: the collision loop `return`s instead of falling through, or the
  // parity test is inverted, or the packets are moved inside the even arm.
  const { log } = runShutter();
  const steps = log.filter((r) => r.queued === 16);
  assert.strictEqual(steps.length, 6, 'ALL SIX steps queue their two packets');
  const wrote = steps.map((r) => r.coll.length > 0);
  assert.deepStrictEqual(wrote, [true, false, true, false, true, false],
    'steps 0, 2 and 4 write the map; 1, 3 and 5 do not');
});

test('$B569: the map write is FOUR columns, stride 8, three bytes each, REVERSED', () => {
  // $B5AC/$B5AF/$B5B2/$B5B5 STA $06C2/$06CA/$06D2/$06DA,Y with Y counting DOWN
  // 2,1,0 while X counts UP -- so the three bytes of $B612 land back to front.
  // The STRUCTURE below (four groups of three, exactly 8 apart, and NOTHING
  // else in the 512-byte map touched) is asserted independently of the base, so
  // it still has teeth if the base and the check drift together.
  // RED WHEN: the stride changes, a column is dropped, the page moves to $05,
  // or the three bytes are written in ascending Y.
  const { log } = runShutter();
  const first = log.filter((r) => r.queued === 16 && r.coll.length)[0];
  assert.strictEqual(first.coll.length, 12, 'twelve cells, no more');
  const groups = [first.coll.slice(0, 3), first.coll.slice(3, 6),
                  first.coll.slice(6, 9), first.coll.slice(9, 12)];
  for (const g of groups) {
    assert.deepStrictEqual([g[1] - g[0], g[2] - g[1]], [1, 1], 'three consecutive');
  }
  for (let k = 1; k < 4; k++) {
    assert.strictEqual(groups[k][0] - groups[k - 1][0], 8, 'columns are 8 apart');
  }
  // and the base is $06C2 -- coll models $0500-$06FF, so index $1C2.
  assert.strictEqual(groups[0][0], 0x1C2, '$06C2 = coll[$1C2]');
  // ...and NOTHING outside those twelve cells is touched across the whole
  // 121-frame run: the shutter must not spill into the rest of $0500-$06FF.
  const touched = new Set();
  for (const r of log) for (const k of r.coll) touched.add(k);
  assert.strictEqual(touched.size, 12, 'twelve cells over the whole run');
});

test('$B569: step 0 writes $B612 = FF 00 FF back to front into every column', () => {
  // Isolated from the check above so the REVERSAL has a check of its own on the
  // one step where the three bytes are not all identical. $B612-$B614 is
  // `FF 00 FF` and $B615-$B617 is `FF C3 FF`, both hand-read off rip/prg.asm.
  // RED WHEN: `DEY` becomes `INY`, or Y starts at 0.
  const s = one(0x1E, 0xB0);
  s.coll.fill(0x5A);                               // see runShutter()
  for (let f = 0; f <= 20; f++) frame(s);          // through step 0 only
  for (const base of [0x1C2, 0x1CA, 0x1D2, 0x1DA]) {
    assert.deepStrictEqual([s.coll[base], s.coll[base + 1], s.coll[base + 2]],
      [0xFF, 0x00, 0xFF], `column at coll[$${base.toString(16)}]`);
  }
  for (let f = 0; f < 20; f++) frame(s);           // through step 1 (odd: no write)
  assert.deepStrictEqual([s.coll[0x1C2], s.coll[0x1C3], s.coll[0x1C4]],
    [0xFF, 0x00, 0xFF], 'the odd step must not touch the map');
  for (let f = 0; f < 20; f++) frame(s);           // through step 2
  assert.deepStrictEqual([s.coll[0x1C2], s.coll[0x1C3], s.coll[0x1C4]],
    [0xFF, 0xC3, 0xFF], '$B615-$B617');
});

test('$B569: the back-patch rewrites the two packets it has just appended', () => {
  // $B5DC-$B603, six absolute-indexed stores at $06F1,Y with Y = $0E: two
  // address bytes and four data bytes per packet, at cursor-15/-14/-13..-10 and
  // cursor-7/-6/-5..-2. The expected PPU addresses are the hand-derived
  // literals in PAIRS above, and the data bytes are $C3/$C5 on even steps and
  // $C2/$C4 on odd ones ($B5C8 LDY #$C2 / LSR / BCS keeps $C2 when the step is
  // ODD, and $B5FC ADC #$02 makes the FIRST packet's byte two higher).
  // RED WHEN: any offset moves, the address pair table is indexed with the
  // wrong X, the parity of the $C2/$C3 choice flips, or the +2 is dropped.
  const { log } = runShutter();
  const steps = log.filter((r) => r.queued === 16);
  assert.strictEqual(steps.length, 6);
  steps.forEach((r, step) => {
    const [aA, aB] = PAIRS[step];
    const tileB = (step & 1) ? 0xC2 : 0xC3;
    const tileA = u8(tileB + 2);
    assert.deepStrictEqual(r.bytes, [
      0x01, aA >> 8, aA & 0xFF, tileA, tileA, tileA, tileA, 0xFF,
      0x01, aB >> 8, aB & 0xFF, tileB, tileB, tileB, tileB, 0xFF,
    ], `step ${step}: two patched $20 packets`);
  });
  // The two packets START as `01 24 00 C2 C2 C2 C2 FF` (packet $20 = `24 00 C2
  // C2 C2 C2 FE`), so EVERY one of the six stores has to land: an untouched
  // packet would still read $2400.
  for (const r of steps) {
    assert.notStrictEqual(r.bytes[1], 0x24, 'packet A address must be patched');
    assert.notStrictEqual(r.bytes[9], 0x24, 'packet B address must be patched');
  }
});

test('$B569: a wrapped queue cursor is a LOUD throw, not a write into $06xx', () => {
  // `$06F1,Y` is absolute-indexed and does not wrap inside a page, so with
  // $0E < 16 the cartridge writes the COLLISION MAP. The two $85E8 calls above
  // have just appended sixteen bytes, so it needs $0E to have wrapped past 256
  // first. src/hud.js makes the same call at $88E5 for the same reason.
  // RED WHEN: the guard is removed and the port silently indexes q[-1].
  const s = one(0x1E, 0xB0);
  frame(s);                                   // phase 0, 15 bytes
  for (let f = 0; f < 19; f++) frame(s);      // 19 counting frames
  s.vram.cursor = 0xF9;                       // + 16 wraps to 9
  assert.throws(() => frame(s), /\$B5DC STA \$06F1,Y/);
});

// ================= 3. THE STAGE-7 CHUNK TABLE, STATICALLY ===================

test('stage 7 has SEVEN chunk pointers, and its camera cannot index an eighth', () => {
  // `$A7D0`'s per-stage subtables OVERLAP: each stage's 8th word IS the next
  // stage's 1st, which is why stage 3's chunk 7 is stage 4's chunk 0. Stage 7
  // has no successor, so the word at `$A836 + 14` = `$A844` is the first two
  // bytes of the wave-stream DATA and reads as `$8010`.
  //
  // It is unreachable: `loadChunk` is entered from `$A302 LDY $61 / INY / INY /
  // CPY $3F / BEQ $A2D1`, so chunk 7 needs `$3F` = 14, and `$992A CMP $98FD,Y /
  // BCC` caps `$3F` at `stage.endPage`. THE CROSS-CHECK IS THE POINT: exactly
  // the stages whose endPage reaches 14 are the stages whose chunk-7 word is a
  // real pointer. The ROM's table is as long as its camera can index.
  // RED WHEN: someone widens the export to make the sweep's chunk-7 run pass.
  const endPage = res.stages.map((s) => s.endPage);
  assert.deepStrictEqual(endPage, [14, 14, 14, 14, 13, 12, 13],
    '$98FD, hand-read off rip/prg.asm');
  // THE CLAIM, stated so it is falsifiable: every stage that can INDEX chunk 7
  // has a real chunk-7 pointer, and the one stage that has no real chunk-7
  // pointer cannot index it. (Stages 4 and 5 get real pointers they never use,
  // for free, out of the overlap -- so the converse is NOT claimed.)
  const noPointer = [];
  for (let st = 0; st < 7; st++) {
    const tbl = rom.word(0xA7D0 + 2 * st);
    const reaches7 = (endPage[st] & 0x0E) === 14;
    const w = rom.read(tbl + 14) | (rom.read(tbl + 15) << 8);
    // A chunk pointer addresses the wave streams at $A844-$ADAA; the 8th word
    // of stage 6's subtable IS $A844, so anything at or past it is data.
    const isPointer = w > 0xA844 && w <= 0xADAA;
    if (!isPointer) noPointer.push(st);
    if (reaches7) {
      assert.ok(isPointer,
        `stage ${st} reaches chunk 7 and must therefore have a real pointer`);
    }
  }
  assert.deepStrictEqual(noPointer, [6], 'stage 7 is the only one short a word');
  assert.notStrictEqual((endPage[6] & 0x0E), 14, 'and it cannot index one');
  // stage 6 specifically: the word is $8010 and the camera stops at chunk 6.
  const t6 = rom.word(0xA7D0 + 12);
  assert.strictEqual(t6, 0xA836);
  assert.strictEqual(rom.read(t6 + 14) | (rom.read(t6 + 15) << 8), 0x8010);
  assert.strictEqual(endPage[6] & 0x0E, 12, '$3F = 13 -> $61 = 12 -> chunk 6');
});

// ================= 4. THE STAGE RUNS ITS OWN WAVE STREAM ====================

test('stage 7 fires its own records, including both W36 handlers', () => {
  // The seven records this wave closed are all in the chunk-5 stream `$AD8A`:
  // $AD98 (type $1E) and $AD9E-$ADA8 (types $20-$25). Drive the engine over
  // that chunk and require every one of them to reach a real handler.
  // RED WHEN: either handler goes back to a throw, or the $A2F0 guard returns.
  const tbl = rom.word(0xA7D0 + 2 * STAGE7);
  const ptr = rom.read(tbl + 10) | (rom.read(tbl + 11) << 8);   // chunk 5
  assert.strictEqual(ptr, 0xAD8A, 'chunk 5 is the stream with all seven');
  const s = createState();
  s.zp19 = STAGE7; s.substate = 0x80; s.spawn.z60 = 2; s.spawn.z61 = 0x0A;
  s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
  s.cam.hi = 0x0A; s.cam.lo = 0;
  // 260 frames at 2 px/frame carries the camera from $0A00 to $0C08, which is
  // past the last of the seven ($ADA8, scroll $0BC0) and short of `endPage`
  // 13 -- so the fixture stays inside the scroll range the stage actually has.
  // A longer run would step `$3F` to 14 and make `loadChunk` read stage 7's
  // MISSING eighth pointer; the check above is why that is a fixture bug and
  // not a port bug.
  // AND THE FIXTURE HAS TO KILL SOMETHING, which is a measurement and not a
  // convenience. Driven passively over this stream the pool is FULL (all ten
  // slots) for 92 of 300 frames, and it is full at scroll $0AC0 -- so `$AD98`'s
  // type $1E allocates nothing and the shutter never appears. That is the ROM's
  // own behaviour ($A415's scan returns -1 and the member is dropped; see the
  // "AN ALLOCATION FAILURE IS GAMEPLAY" note at the top of src/enemies.js), not
  // a defect, and it is why a passive stage-7 run can reach the boss page
  // without the shutter ever freezing the screen.
  //
  // Freeing one slot every eight frames stands in for a player shooting, and it
  // is an INTERVENTION (docs/knowledge/09): evidence that the records reach
  // their handlers, never evidence about how the stage plays.
  const seen = new Set();
  for (let f = 0; f < 260; f++) {
    spawnEngine(s, res);
    for (let k = 12; k < 22; k++) if (s.obj.type[k]) seen.add(s.obj.type[k] & 0x7F);
    frame(s);
    if (f % 8 === 7) {                              // the "kill"
      for (let k = 21; k >= 12; k--) if (s.obj.type[k]) { freeSlot(s, k - ENEMY_BASE); break; }
    }
    s.cam.lo += 2; if (s.cam.lo > 0xFF) { s.cam.lo &= 0xFF; s.cam.hi += 1; }
  }
  assert.ok(s.cam.hi < res.stages[STAGE7].endPage, 'the fixture stayed in range');
  for (const t of [0x1E, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25]) {
    assert.ok(seen.has(t),
      `stage 7 must actually spawn type $${t.toString(16).toUpperCase()}`);
  }
});
