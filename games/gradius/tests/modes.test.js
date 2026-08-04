// WAVE 39 -- the six $80D4 game modes the port used to boot past.
//
// Every assertion is written to be SEEN TO FAIL: each names the ROM address it
// pins and the mutation that turns it red (the RED WHEN line). The full mutation
// table -- every fix broken, watched red, restored, SHA-verified both ways -- is
// in docs/worklog/gradius/39-impl-modes.md.
//
// The four defective-check shapes (docs/knowledge/03 lessons 37-41) are avoided:
//   * nothing here "asserts on no exception" -- every test asserts SPECIFIC
//     state, and the ones that do assert a throw also assert what it says;
//   * no state is set up that the app never has: every seed below is either
//     `resetState()` (what $8067 leaves) or a state a real boot walks THROUGH,
//     and the two end-to-end tests drive the whole chain from RESET;
//   * no sampled steady state -- each test drives the TRANSITION frame;
//   * NOTHING TAKES THE ANSWER AS AN ARGUMENT. Every ROM constant below is read
//     out of assets/prg.bin in this file, by its own address, and compared
//     against what the port computed. `MODE_TARGETS` in src/nmi.js is checked
//     against prg.bin rather than trusted, and the table reads in src/modes.js
//     go through res.flowTables -- a different path from the `rom()` helper here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createState, u8 } from '../src/state.js';
import { nmi, MODE_TARGETS } from '../src/nmi.js';
import { resetState } from '../src/main.js';
import { st80E2, st8116, st8137, st8165, st816C, sub821A, newGame, demoInput }
  from '../src/modes.js';
import { bindSoundRom } from '../src/sound.js';
import { headlessResources, assetOrThrow } from './helpers.js';

const res = headlessResources(0);
bindSoundRom(res.soundTables);

// ---- the cartridge, read here and nowhere else in this file ---------------
const PRG = readFileSync(assetOrThrow('prg.bin'));
/** One PRG byte at its CPU address. $8000-$FFFF maps to offset - $8000. */
const rom = (a) => PRG[a - 0x8000];
const romw = (a) => rom(a) | (rom(a + 1) << 8);

/** A fresh boot state. `resetState` is $8067; nothing else here seeds RAM. */
const boot = () => resetState(res.manifest);

/** Run n frames with an optional per-frame button word. */
function run(s, n, buttons = () => 0) {
  for (let i = 0; i < n; i++) nmi(s, buttons(i), res);
  return s;
}

/**
 * A state ON THE TITLE MENU, reached the way the cartridge reaches it.
 *
 * NOT `s.mode = 1` by hand: the menu's whole behaviour hangs off `$4C:$4D`,
 * which only `$8256`'s fall-through seeds, so a hand-set mode 1 has a countdown
 * of 0 and leaves for the attract demo on its first frame. Driving mode 0 is
 * what makes these tests about the menu instead of about the seed.
 */
function atMenu() {
  const s = boot();
  while (s.mode === 0) nmi(s, 0, res);
  assert.strictEqual(s.mode, 1, 'mode 0 handed over to the menu');
  return s;
}

/** 1 setup frame + $FE/2 scroll frames + the frame that reads $12 == 0. */
const TITLE_FRAMES = 1 + 0xFE / 2 + 1;

// ===========================================================================
//  1. The table itself, and the enumeration behind mode 6
// ===========================================================================

test('jt_80D4: MODE_TARGETS is the cartridge`s seven words, in order', () => {
  // 80D4 .word $80E2 $8116 $8121 $8137 $8165 $9650 $816C
  // RED WHEN: an entry is edited, reordered, or the list grows/shrinks. The
  // expected values come from prg.bin, NOT from the constant under test.
  assert.strictEqual(MODE_TARGETS.length, 7, 'seven entries');
  for (let i = 0; i < 7; i++) {
    assert.strictEqual(MODE_TARGETS[i], romw(0x80D4 + i * 2),
      `jt_80D4[${i}] = $${romw(0x80D4 + i * 2).toString(16)}`);
  }
  // And $80D1 really is `JSR $83E4`, so the table really is inline data.
  assert.deepStrictEqual([...PRG.subarray(0x80D1 - 0x8000, 0x80D4 - 0x8000)],
    [0x20, 0xE4, 0x83], '$80D1 JSR $83E4 -- the inline-table dispatcher');
});

test('nothing in the 32 KB writes 6 to $00 -- the mode-6 enumeration', () => {
  // src/modes.js says so in its header and this is the scan that backs it.
  // The claim is narrow and checkable: `INC $00` appears exactly once, and no
  // `LDA #$06` anywhere in the PRG is followed by `STA $00`.
  //
  // RED WHEN: a future revision of the ROM (or of this claim) adds a writer --
  // in which case the header comment in src/modes.js is wrong and must change.
  let incs = [];
  let sixes = [];
  for (let a = 0x8000; a <= 0xFFFD; a++) {
    if (rom(a) === 0xE6 && rom(a + 1) === 0x00) incs.push(a);          // INC $00
    if (rom(a) === 0xA9 && rom(a + 1) === 0x06                          // LDA #$06
        && rom(a + 2) === 0x85 && rom(a + 3) === 0x00) sixes.push(a);   // STA $00
  }
  // $8186 is the one INC; the others are `E6 00` bytes inside operands, so
  // pin the exact address rather than the count alone.
  assert.ok(incs.includes(0x8186), '$8186 INC $00 is present');
  assert.deepStrictEqual(sixes, [], 'no `LDA #$06 / STA $00` anywhere');
  // The four $8186 callers, read as branch/jump targets, all arrive with $00
  // in {0,1,3,4}: $810B BEQ, $811E JMP, $8162 JMP, $8169 JMP.
  assert.strictEqual(rom(0x811E), 0x4C, '$811E JMP');
  assert.strictEqual(romw(0x811F), 0x8186, '...to $8186');
  assert.strictEqual(rom(0x8162), 0x4C, '$8162 JMP');
  assert.strictEqual(romw(0x8163), 0x8186, '...to $8186');
  assert.strictEqual(rom(0x8169), 0x4C, '$8169 JMP');
  assert.strictEqual(romw(0x816A), 0x8186, '...to $8186');
});

test('$8256 FALLS THROUGH into $8279 -- there is no RTS between them', () => {
  // The structural half of fall-through eighteen: the last instruction of
  // $8256 is `20 B6 82` at $8276 and the next byte, $8279, is `A2 00`.
  //
  // RED WHEN: the port stops seeding $4C:$4D from $8256 (see the behavioural
  // half two tests below) -- this one guards the READING of the listing.
  assert.deepStrictEqual([...PRG.subarray(0x8276 - 0x8000, 0x8281 - 0x8000)],
    [0x20, 0xB6, 0x82,          // 8276 JSR $82B6
     0xA2, 0x00,                // 8279 LDX #$00
     0x86, 0x4C,                // 827B STX $4C
     0xE8,                      // 827D INX
     0x86, 0x4D,                // 827E STX $4D
     0x60],                     // 8280 RTS
    'no $60 at $8276+3: $8256 runs straight on into sub_8279');
});

test('an eighth mode is a loud throw naming jt_80D4, not a table overrun', () => {
  // $83E4 does not bound its index. RED WHEN: the default arm is dropped or
  // made silent -- mode 7 would read $80E2's opcodes as a pointer.
  const s = boot();
  s.mode = 7;
  assert.throws(() => nmi(s, 0, res), /\$80D1 JSR \$83E4.*seven entries/s);
});

// ===========================================================================
//  2. Mode 0 -- $80E2
// ===========================================================================

test('$80E2 phase 0: the two loads, then $12 = $FE and $1F = 1', () => {
  // 80E6 JSR $882C / 80E9 JSR $8256 / 80EC $2D:=3 / 80F0 $13:=0 $03:=0 /
  // 80F6 INC $1F / 80F8 $12:=$FE / 80FC INC $01.
  //
  // THE ORDER IS THE CHECK. $882C zeroes $12 and $1F ($8843/$883F) and $8256's
  // $8424 zeroes $2D; $80EC-$80FA is what puts them back. A port that ran the
  // stores before the loads would read $12 = 0 and $1F = 0 here.
  //
  // RED WHEN: any of the six stores is dropped or moved above the JSRs, or
  // $8256 is not called (then $10/$11 stay at RESET's 0).
  const s = boot();
  s.zp1F = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.ppu.scrollX, 0xFE, '$80FA STA $12');
  assert.strictEqual(s.zp1F, 1, '$80F6 INC $1F -- from the 0 $883F wrote');
  assert.strictEqual(s.ppu.chrSel, 3, '$80EE STA $2D -- after $8424 wiped it');
  assert.strictEqual(s.ppu.scrollY, 0, '$80F2 STA $13');
  assert.strictEqual(s.zp03, 0, '$80F4 STA $03');
  assert.strictEqual(s.zp01, 1, '$80FC INC $01');
  assert.strictEqual(s.ppu.ctrl, 0xA8, '$8271 STA $10 -- over $81B5`s $88');
  assert.strictEqual(s.ppu.mask, 0x1E, '$826D STA $11');
  assert.strictEqual(s.ppu.blank, 0x10, '$81BC -> $83B0 STA $0D');
  assert.strictEqual(s.frameDrops, 0,
    'MEASURED rom 0 at gameover f4365: two loads and no dropped NMI');
});

test('$8256 falls through: the title frame leaves $4C:$4D = 256', () => {
  // The behavioural half of fall-through eighteen. RED WHEN: seedMenuTimer() is
  // not called from buildTitleScreen() -- $4C:$4D would keep RESET's 0:0 and
  // $819B would hand mode 1 straight to the attract demo on its first frame.
  const s = boot();
  s.zp4C = 0x99; s.zp4D = 0x99;
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x00, '$827B STX $4C');
  assert.strictEqual(s.zp4D, 0x01, '$827E STX $4D -- the pair is $0100 = 256');
});

test('$80FF: the title scrolls TWO pixels a frame and leaves on the 0 read', () => {
  // 8109 LDA $12 / F0 79 -> $8186; 810D C6 12 / C6 12.
  //
  // The BEQ is tested BEFORE the decrements, so 254 -> 0 takes 127 frames and
  // the 128th frame is the one that changes mode. That number is derived here
  // ($FE / 2) rather than pasted.
  //
  // RED WHEN: one DEC is dropped (254 frames), the test moves below them
  // (the mode changes a frame late and $12 wraps to $FE), or $0120 is not
  // cleared (the cursor ship would ride the scroll).
  const s = boot();
  nmi(s, 0, res);                                  // phase 0
  assert.strictEqual(s.mode, 0);
  const want = 0xFE / 2;
  for (let i = 0; i < want - 1; i++) {
    nmi(s, 0, res);
    assert.strictEqual(s.mode, 0, `still mode 0 after scroll frame ${i + 1}`);
  }
  assert.strictEqual(s.ppu.scrollX, 2, 'two pixels a frame, 126 frames');
  assert.strictEqual(s.obj.anim[0], 0, '$8106 STA $0120 -- no ship while it scrolls');
  nmi(s, 0, res);
  assert.strictEqual(s.ppu.scrollX, 0, 'the 127th frame reaches 0');
  assert.strictEqual(s.mode, 0, '...and does NOT leave: the BEQ is tested first');
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 1, '$810B BEQ $8186 -> INC $00');
  assert.strictEqual(s.zp01, 0, '$818C STA $01');
  assert.strictEqual(s.zp0B, 0, '$818A STA $0B');
});

// ===========================================================================
//  3. Mode 1 -- $8116, and $821A
// ===========================================================================

test('$8116/$819B: the menu counts 256 frames, then hands over to mode 2', () => {
  // 819B LDX #$4C / B5 00 / 15 01 / F0 07 / A9 01 / JSR $840C.
  //
  // The pair is 16-bit and the borrow crosses: 256 -> 255 must take $4D from 1
  // to 0, not leave it at 1. RED WHEN: the borrow is dropped (the menu runs
  // forever), the zero test is inverted, or the count is 8-bit.
  const s = boot();
  s.mode = 1; s.zp01 = 0; s.zp4C = 0; s.zp4D = 1;
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0xFF, '$840F ADC $4C with A = $FE, carry set');
  assert.strictEqual(s.zp4D, 0, '$8415 DEC $4D -- the borrow');
  assert.strictEqual(s.mode, 1, 'still counting');
  run(s, 254);
  assert.strictEqual(s.zp4C, 1, '255 counts spent');
  assert.strictEqual(s.mode, 1);
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0, 'the 256th count');
  assert.strictEqual(s.mode, 1, '$819B returned non-zero on the count that hit 0');
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 2, '$811E JMP $8186 -- the attract demo');
});

test('$82A1: the cursor ship sits at $82B4[$0F], and $0F only holds 0 or 1', () => {
  // 82A1 $0360:=$50 / 82A6 $0120:=1 / 82AB LDX $0F / LDA $82B4,X -> $0320.
  // The two Y values come out of prg.bin here.
  //
  // RED WHEN: the X/Y stores are swapped, the table index is wrong, or the
  // out-of-range guard is replaced by a clamp (a clamp would silently draw the
  // cursor on the wrong line instead of saying the index is impossible).
  const s = atMenu();
  s.zp0F = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.obj.x[0], 0x50, '$82A3 STA $0360');
  assert.strictEqual(s.obj.anim[0], 1, '$82A8 STA $0120');
  assert.strictEqual(s.obj.y[0], rom(0x82B4), '$82B0 STA $0320 with $0F = 0');
  s.zp0F = 1;
  nmi(s, 0, res);
  assert.strictEqual(s.obj.y[0], rom(0x82B5), '...and $82B5 with $0F = 1');
  assert.notStrictEqual(rom(0x82B4), rom(0x82B5), 'the two lines really differ');
  s.zp0F = 2;
  assert.throws(() => nmi(s, 0, res), /\$82AD.*two-entry table at \$82B4/s);
});

test('$8239: SELECT walks $0F 0 -> 1 -> 0 and re-seeds the countdown', () => {
  // 8239 INC $0F / A9 02 / 38 / E5 0F / D0 02 / 85 0F. The store happens only
  // when 2 - $0F is ZERO, i.e. only when the INC produced 2.
  //
  // RED WHEN: the reset is `if ($0F > 1)` written before the INC, the subtraction
  // is the other way round, or $8220's re-seed is dropped (the demo would start
  // mid-menu even while the player is pressing SELECT).
  //
  // $4C:$4D READS $FF:$00, NOT $00:$01, and that ordering is the point: $821A
  // runs at $80CC, BEFORE the dispatch, so $8279 re-seeds the pair to $0100 and
  // then $8116's own $819B spends one count off it in the SAME frame.
  const s = atMenu();
  s.zp4C = 5; s.zp4D = 0;                          // nearly expired
  nmi(s, 0x20, res);                               // SELECT edge
  assert.strictEqual(s.zp0F, 1, '$8239 INC $0F');
  assert.strictEqual(s.zp4C, 0xFF, '$8220 re-seeded $4C:$4D, then $819B spent one');
  assert.strictEqual(s.zp4D, 0, '...and the borrow crossed');
  assert.strictEqual(s.obj.y[0], rom(0x82B5), '$8244 JSR $82A1 moved the ship');
  nmi(s, 0, res);                                  // release
  nmi(s, 0x20, res);                               // SELECT again
  assert.strictEqual(s.zp0F, 0, '$8242 STA $0F -- 2 wraps to 0');
  assert.strictEqual(s.obj.y[0], rom(0x82B4));
});

test('$822D: START on the menu writes $03 from $8254[$0F] and goes to mode 3', () => {
  // 822D LDX $0F / BD 54 82 / 85 03 / A9 03 / JMP $818F.
  // $8254 = 40 70, read from prg.bin here.
  //
  // RED WHEN: the two config bytes are swapped, $03 is not written (the game
  // would keep running $821A during play, so START would open the menu instead
  // of pausing), or $80CF's RE-READ of $00 is dropped -- mode 3's phase 0 runs
  // on this same frame, which is what turns $818F's $4C := $20 into $817D's
  // $4C := $50 and requests the jingle. Asserting $20 here would be asserting a
  // value the cartridge holds for four instructions.
  for (const cur of [0, 1]) {
    const s = atMenu();
    s.zp0F = cur;
    s.sfx.length = 0;
    nmi(s, 0x10, res);                             // START edge
    assert.strictEqual(s.zp03, rom(0x8254 + cur), `$8232 STA $03 for $0F = ${cur}`);
    assert.strictEqual(s.mode, 3, '$8236 JMP $818F with A = 3');
    assert.strictEqual(s.zp01, 1, '...and $80CF re-read $00, so $817F INC $01 ran');
    assert.strictEqual(s.zp4C, 0x50, '$8193`s $20 overwritten by $817D`s $50');
    assert.deepStrictEqual(s.sfx, [0x90], '$813D JSR $EC1E on the same frame');
  }
  assert.strictEqual(rom(0x8254), 0x40, '1 PLAYER: bit 6 only');
  assert.strictEqual(rom(0x8255), 0x70, '2 PLAYERS: bits 6, 5 and 4');
});

test('$80C6: once $03 bit 6 is set, START no longer reaches $821A', () => {
  // 80C6 LDA $03 / 29 40 / D0 03 -> skip the JSR. This is what turns START from
  // "start the game" into "pause" for the rest of the session.
  //
  // RED WHEN: the gate is dropped or inverted -- pressing START during play
  // would rebuild the title screen underneath the game.
  const s = atMenu();
  s.zp03 = 0x40;
  s.zp4C = 0x40; s.zp4D = 0x00;
  nmi(s, 0x10, res);
  assert.strictEqual(s.mode, 1, '$821A did not run: still the menu');
  assert.strictEqual(s.zp4C, 0x3F,
    '$8279 did not re-seed the countdown; only $819B ticked it');
  assert.strictEqual(s.zp4D, 0x00);
});

test('$8248: START during the attract demo rebuilds the title on THAT frame', () => {
  // 8248 $0E := 0 / 824C JSR $8256 / 824F mode := 1. And $80CF RE-READS $00, so
  // the title menu runs on THIS frame -- $8121 never sees it.
  //
  // RED WHEN: the mode is read before $821A runs (the demo would get one more
  // frame and its $9C88 would overwrite $05, so the START edge would be eaten),
  // or $8256 is not called (mode 1 would draw a cursor onto the demo's screen).
  //
  // `$824A STA $0E` IS PROVABLY INERT AND IS PORTED ANYWAY, which is worth
  // saying because it looks like the load-bearing line of the routine. $80CC is
  // reached from $80AA, and $8099 -- twelve instructions earlier in the same NMI
  // -- ran the drainer, whose $8A7B already stored 0 in $0E. So $0E is 0 here on
  // every frame the cartridge can produce and no check can distinguish the store
  // from its absence. Reported rather than dressed up as a passing test.
  const s = boot();
  s.mode = 2; s.zp01 = 1; s.substate = 0x80;
  s.zp0F = 0;
  s.obj.y[0] = 0x11;
  nmi(s, 0x10, res);
  assert.strictEqual(s.mode, 1, '$8251 STX $00, and $80CF re-read it');
  // $8248 does NOT clear $01 -- it stays at the demo's 1. Harmless, and the ROM
  // relies on it being so: mode 1 never reads $01, and every way out of mode 1
  // ($811E JMP $8186 and $8236 JMP $818F) passes through $8188, which does.
  assert.strictEqual(s.zp01, 1, '$01 keeps the demo`s value across $8248');
  assert.strictEqual(s.obj.y[0], rom(0x82B4), '$8273 JSR $82A1 rebuilt the cursor');
  assert.strictEqual(s.ppu.ctrl, 0xA8, '$8271 STA $10');
  assert.strictEqual(s.ppu.mask, 0x1E, '$826D STA $11');
  // $8279 runs TWICE on this frame -- once from $8220 and once as $8256's
  // fall-through -- and then $80CF's re-read sends the frame into $8116, whose
  // $819B spends one count. So the pair reads $FF:$00, not $00:$01.
  assert.strictEqual(s.zp4C, 0xFF, 'seeded to $0100 and ticked once');
  assert.strictEqual(s.zp4D, 0x00, '...with the borrow');
  assert.strictEqual(s.vram.q[0], 0x01, '$8266`s packet 6 starts the fresh queue');
});

// ===========================================================================
//  4. Mode 3 -- $8137
// ===========================================================================

test('$8137 phase 0: sfx $90 and $4C := $50, exactly once', () => {
  // 813B LDA #$90 / JSR $EC1E; 8140 LDA #$50 / -> $817D STA $4C / $817F INC $01.
  // RED WHEN: the request is dropped or repeated every frame, or $4C is seeded
  // with the wrong count.
  const s = boot();
  s.mode = 3; s.zp01 = 0; s.sfx.length = 0;
  nmi(s, 0, res);
  assert.deepStrictEqual(s.sfx, [0x90], '$813D JSR $EC1E once');
  assert.strictEqual(s.zp4C, 0x50, '$817D STA $4C -- 80 frames');
  assert.strictEqual(s.zp01, 1, '$817F INC $01');
  s.sfx.length = 0;
  nmi(s, 0, res);
  assert.deepStrictEqual(s.sfx, [], 'phase 1 does not re-request it');
});

test('$8152: the chosen menu line BLINKS on bit 3 of $4C', () => {
  // 814B A9 01 / 65 0F / 85 98      packet index := 1 + $0F
  // 8152 A9 08 / 25 4C / 0A x4 / 05 98   ...OR $80 when bit 3 of $4C is set
  //
  // Bit 7 of a canned-packet index selects src/hudpackets.js's BLANKER, whose
  // signature is: the first TWO stream bytes survive and everything after them
  // is replaced by $00. This test reads that signature out of the QUEUE, so it
  // cannot pass by agreeing with the constant the code shifted.
  //
  // RED WHEN: the four ASLs become three or five (bit 7 never set, or set on the
  // wrong parity), the mask is not $08, or `1 + $0F` becomes `$0F`.
  const s = boot();
  s.mode = 3; s.zp01 = 1; s.zp0F = 0;
  const packet = res.hudPackets[1];
  const emit = (c4) => {
    s.zp4C = c4 + 1;                               // $8147 DECs it first
    s.vram.cursor = 0;
    nmi(s, 0, res);
    return [...s.vram.q.subarray(0, s.vram.cursor)];
  };
  const plain = emit(0x04);                        // bit 3 clear
  const blank = emit(0x0C);                        // bit 3 set
  // Byte 0 is $85E8's mode byte; bytes 1.. are the packet's stream.
  assert.strictEqual(plain[1], packet[0], 'the plain packet copies its stream');
  assert.strictEqual(plain[3], packet[2], '...including its third byte');
  assert.strictEqual(blank[1], packet[0], 'the blanked one keeps byte 1');
  assert.strictEqual(blank[2], packet[1], '...and byte 2 ($9B counts 2 down)');
  assert.strictEqual(blank[3], 0x00, '...and blanks everything after them');
  assert.notStrictEqual(packet[2], 0x00, 'so the two really differ');
});

test('$8137 phase 2: $82D5 gives three lives, then mode 4 hands over to play', () => {
  // 815F JSR $82D5 / 8162 JMP $8186; then $8165 $1B := 0 / $8169 JMP $8186.
  // RED WHEN: $82D5 is skipped (the game starts with 0 lives and dies at once),
  // mode 4 does not clear $1B (mode 5 would enter at $80 with no ship), or
  // either INC $00 is dropped.
  const s = boot();
  s.mode = 3; s.zp01 = 2; s.zp03 = 0x40; s.substate = 0x80;
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 4, '$8162 JMP $8186');
  assert.strictEqual(s.lives[0], 3, '$82FC STA $20');
  assert.strictEqual(s.lives[1], 3, '$82FE STA $21');
  assert.strictEqual(s.extraLife[0], 1, '$8302 STA $2A');
  assert.strictEqual(s.zp0A, 1, '$82F8 STY $0A -- one player');
  assert.strictEqual(s.zp09, 0, '$82E2 STA $09 -- not a demo');
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 5, '$8169 JMP $8186');
  assert.strictEqual(s.substate, 0, '$8167 STA $1B -- intro state 0');
});

test('$82F0: two players ($03 bit 5) makes $0A = 7, one player makes it 1', () => {
  // 82EE LDY #$07 / A5 03 / 29 20 / D0 02 / A0 01 / 84 0A.
  // RED WHEN: the branch is inverted, or the 2P value is written as 3 (only
  // bits 0 and 1 have readers, so 3 would look right and is not the byte).
  const a = createState(); a.zp03 = 0x70; newGame(a);
  const b = createState(); b.zp03 = 0x40; newGame(b);
  assert.strictEqual(a.zp0A, 0x07, '$82F0 BNE $82F8 with Y still 7');
  assert.strictEqual(b.zp0A, 0x01, '$82F6 LDY #$01');
});

// ===========================================================================
//  5. Mode 6 -- $816C
// ===========================================================================

test('$816C: the two clears run, $03 keeps its low nibble, and mode := 0', () => {
  // 816C JSR $8418 ($0100-$017F) / 816F JSR $8424 ($0020-$0097) /
  // 8172 $03 &= $0F / 8178 JMP $8131 -> $01 := 0, $818F with A = 0.
  //
  // RED WHEN: either clear is dropped, the mask is $F0, or the tail sets the
  // wrong mode. $8424 covers $003D-$0097, which is $9B3E's own wipe -- the
  // speed byte below is inside it and the ring cursor is inside $8418's.
  const s = boot();
  s.mode = 6;
  s.zp03 = 0xB7;
  s.obj.status[3] = 9; s.obj.anim[5] = 9; s.obj.timer[7] = 9;
  s.lives[0] = 3; s.zp.speed = 4; s.cam.hi = 9; s.zp31 = 40;
  s.obj.x[0] = 200;                                // $0360 -- NOT in either range
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 0, '$8135 -> $818F with A = 0');
  assert.strictEqual(s.zp4C, 0x20, '$8193 STA $4C');
  assert.strictEqual(s.zp01, 0, '$818C STA $01');
  assert.strictEqual(s.obj.status[3], 0, '$8418: $0100');
  assert.strictEqual(s.obj.anim[5], 0, '$8418: $0120');
  assert.strictEqual(s.obj.timer[7], 0, '$8418: $0140');
  assert.strictEqual(s.lives[0], 0, '$8424: $20');
  assert.strictEqual(s.zp31, 0, '$8424: $31, the demo script cursor');
  assert.strictEqual(s.zp.speed, 0, '$8424 covers $3D-$97 too');
  assert.strictEqual(s.cam.hi, 0, '$8424: $3F');
  assert.strictEqual(s.obj.x[0], 200, '$0360 is in NEITHER range');
  assert.strictEqual(s.zp03, 0x07, '$8174 AND #$0F');
});

// ===========================================================================
//  6. The attract demo -- $8121 and $9C6D
// ===========================================================================

test('$82C7: the demo gets ONE life and $09, and $0A survives the wipe', () => {
  // 82C7 LDA $0A / PHA / JSR $8307 / PLA / STA $0A / INC $20 / INC $09.
  // RED WHEN: the save/restore of $0A is dropped, the life is set to 3 instead
  // of INCremented from the wipe's 0, or $09 is not raised (the demo would
  // score, change the BGM and be pausable).
  const s = boot();
  s.mode = 2; s.zp01 = 0; s.zp0A = 0x03; s.lives[0] = 3; s.zp19 = 4;
  nmi(s, 0, res);
  assert.strictEqual(s.zp0A, 0x03, '$82CE STA $0A -- restored across $8307');
  assert.strictEqual(s.lives[0], 1, '$82D0 INC $20 from the wiped 0');
  assert.strictEqual(s.zp09, 1, '$82D2 INC $09');
  assert.strictEqual(s.zp19, 0, '$8307 cleared $0012-$00EF, which covers $19');
  assert.strictEqual(s.zp01, 1, '$8125 INC $01 -- and $01 is BELOW $12');
});

test('$8307 starts at $12: $00, $01, $03, $0B, $0E, $0F, $10 and $11 survive', () => {
  // 8307 LDX #$12 ... E0 F0. The port has fields for $00 $01 $03 $0B $0E $0F
  // $10 $11 and this pins that none of them is cleared -- which is the only
  // reason $832D can restore PPUCTRL from $10 and $82C7 has to save $0A itself.
  //
  // RED WHEN: the wipe is widened to $00 (the mode itself would be cleared
  // mid-frame and the dispatch would restart at mode 0 next frame).
  assert.strictEqual(rom(0x8307), 0xA2, '$8307 LDX #imm');
  assert.strictEqual(rom(0x8308), 0x12, '...#$12, not #$00');
  const s = boot();
  s.mode = 2; s.zp01 = 0;
  s.zp03 = 0x40; s.zp0B = 0; s.zp0F = 1; s.ppu.ctrl = 0xA8; s.ppu.mask = 0x1E;
  s.zp15 = 1; s.zp17 = 3;                          // ...and these are INSIDE it
  nmi(s, 0, res);
  assert.strictEqual(s.zp03, 0x40, '$03 survives');
  assert.strictEqual(s.zp0F, 1, '$0F survives');
  assert.strictEqual(s.ppu.ctrl, 0xA8, '$10 survives -- $832D reloads PPUCTRL from it');
  assert.strictEqual(s.ppu.mask, 0x1E, '$11 survives');
  assert.strictEqual(s.zp15, 0, '$15 is inside $12-$EF');
  assert.strictEqual(s.zp17, 0, '$17 is inside $12-$EF');
});

test('$9C6D: the first demo tick grants $9C5E`s power-ups', () => {
  // 9C72 LDY $31 / D0 03 / JSR $9C5E -> $46=5 $41=1 $40=1 $45=2.
  // RED WHEN: the $31 test is inverted (the grant would repeat every frame and
  // undo anything the demo collects) or a field is dropped.
  const s = createState();
  s.substate = 0x80; s.zp31 = 0; s.frame = 0;
  demoInput(s, res);
  assert.strictEqual(s.zp.shield, 5, '$9C60 STA $46');
  assert.strictEqual(s.zp.missile, 1, '$9C64 STA $41');
  assert.strictEqual(s.zp.speed, 1, '$9C66 STA $40');
  assert.strictEqual(s.zp.options, 2, '$9C6A STA $45');
  s.zp31 = 2; s.zp.shield = 0;
  demoInput(s, res);
  assert.strictEqual(s.zp.shield, 0, 'not granted again once $31 has moved');
});

test('$9C6D: ODD frames spend the duration, EVEN frames only re-apply', () => {
  // 9C7F LDA $02 / 4A / B0 12. The frame counter's bit 0 is the whole fork, so
  // a duration of N lasts 2N frames.
  //
  // The button expected below comes from the ROM script at $9CB7, read here.
  // RED WHEN: the parity is inverted, or the even arm decrements $30.
  const s = createState();
  s.substate = 0x80; s.zp31 = 0; s.zp30 = 0;
  s.frame = 1;                                     // ODD: loads record 0
  demoInput(s, res);
  assert.strictEqual(s.zp31, 2, '$9CA9 STY $31 -- 2n+2 for record 0');
  assert.strictEqual(s.input.held, rom(0x9CB7), '$9C88 LDA $9CB5,Y with Y = 2');
  assert.strictEqual(s.zp30, u8(rom(0x9CB8) - 1), '$9CA1 then $9CAE DEC $30');
  const spent = s.zp30;
  s.frame = 2;                                     // EVEN: apply only
  demoInput(s, res);
  assert.strictEqual(s.zp30, spent, 'the even frame did NOT decrement');
  assert.strictEqual(s.input.held, rom(0x9CB7), '...but did re-apply the button');
  s.frame = 3;                                     // ODD again
  demoInput(s, res);
  assert.strictEqual(s.zp30, u8(spent - 1), 'the next odd frame did');
});

test('$9CA1 stores $30 BEFORE the $FF test, so a duration of 0 wraps to $FF', () => {
  // 9C9E LDA $9CB8,Y / 85 30 / C9 FF. Record 2 of the script has duration $00;
  // the store happens first, so $9CAE takes it to $FF and that record runs for
  // 256 ticks. RED WHEN: the store is moved below the compare, or the port
  // "fixes" the zero -- either way the demo's timing shifts by 512 frames.
  assert.strictEqual(rom(0x9CB8 + 4), 0x00, 'record 2 really has duration $00');
  const s = createState();
  s.substate = 0x80; s.zp31 = 4; s.zp30 = 0; s.frame = 1;
  demoInput(s, res);
  assert.strictEqual(s.zp31, 6, '$31 advanced');
  assert.strictEqual(s.zp30, 0xFF, '$9CA1 stored 0, $9CAE DECd it to $FF');
});

test('$9CA5: the script`s FF FF terminator ends the demo through $0B', () => {
  // 9CA3 CMP #$FF / F0 0A -> $9CB1 INC $0B / JSR $83AB.
  // The terminator's offset is derived here by walking the pairs the way $9C9E
  // does, not pasted.
  // RED WHEN: the terminator test is dropped (the demo would read $9D4F's word
  // table as buttons), or $0B is not raised (mode 2 would never end).
  let off = 0;
  while (rom(0x9CB8 + off) !== 0xFF) off += 2;
  assert.strictEqual(off, 150, '75 (button, duration) records');
  const s = createState();
  s.substate = 0x80; s.zp31 = off; s.zp30 = 0; s.zp0B = 0; s.frame = 1;
  demoInput(s, res);
  assert.strictEqual(s.zp0B, 1, '$9CB1 INC $0B');
  assert.strictEqual(s.zp31, off, '$31 did NOT advance past the terminator');
});

test('$9C7D: a real START or SELECT during the demo raises $0B too', () => {
  // 9C79 LDA $05 / 29 30 / D0 32. This is read BEFORE $9C88 overwrites $05.
  // RED WHEN: the test runs after the script write (it would then test the
  // script's own byte, and $80 or $C4 would look like neither bit).
  const s = createState();
  s.substate = 0x80; s.zp31 = 2; s.zp30 = 5; s.frame = 2;
  s.input.pressed = 0x10;
  demoInput(s, res);
  assert.strictEqual(s.zp0B, 1, '$9CB1 INC $0B');
  assert.strictEqual(s.zp30, 5, '...and the script did not tick');
});

test('$9C6D returns at once during the stage intro ($1B bit 7 clear)', () => {
  // 9C6D LDA $1B / 30 01 / 60. RED WHEN: the BMI is dropped -- the demo would
  // inject buttons into the 27 intro frames and $31 would advance early.
  const s = createState();
  s.substate = 0x04; s.zp31 = 0; s.frame = 1;
  demoInput(s, res);
  assert.strictEqual(s.zp31, 0, 'no record loaded');
  assert.strictEqual(s.zp.shield, 0, '$9C5E did not run either');
});

// ===========================================================================
//  7. End to end, from RESET
// ===========================================================================

test('END TO END: RESET -> title -> menu -> attract, at the cartridge`s counts', () => {
  // Every number below is derived, not sampled: 1 setup frame + $FE/2 scroll
  // frames for mode 0, and $4C:$4D = $0100 + 1 for the menu.
  //
  // RED WHEN: any of the three mode handlers advances on the wrong frame. This
  // is the check that would catch an off-by-one nobody could see in a single
  // handler's own test.
  const s = boot();
  assert.strictEqual(s.mode, 0, '$8059 STA $00');
  run(s, TITLE_FRAMES - 1);
  assert.strictEqual(s.mode, 0, `still mode 0 after ${TITLE_FRAMES - 1} frames`);
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 1, `mode 1 on frame ${TITLE_FRAMES}`);
  run(s, 0x0100);
  assert.strictEqual(s.mode, 1, 'still the menu on the 256th count');
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 2, 'the attract demo');
  assert.strictEqual(s.zp09, 0, '$09 is raised by $82D5`s sibling, not yet');
  nmi(s, 0, res);
  assert.strictEqual(s.zp09, 1, '$82D2 INC $09');
  assert.strictEqual(s.lives[0], 1, '$82D0 INC $20 -- one life');
});

test('END TO END: RESET -> START -> the intro -> PLAY, in 27 intro frames', () => {
  // The intro length is W4's measurement (mode-5 frames 283-309 on the
  // cartridge) and this drives the port to it from RESET rather than seeding it.
  //
  // RED WHEN: mode 3's countdown is the wrong length, mode 4 does not clear
  // $1B, or the handover writes the wrong mode.
  const s = boot();
  run(s, 130);                                     // into the menu
  assert.strictEqual(s.mode, 1);
  nmi(s, 0x10, res);                               // START
  assert.strictEqual(s.mode, 3, '$8236 -> $818F');
  assert.strictEqual(s.zp03, 0x40, 'one player');
  let f = 0;
  while (s.mode === 3) { nmi(s, 0, res); f++; }
  assert.strictEqual(f, 0x50 + 1, '$4C = $50 blink frames, plus the phase-0 frame');
  assert.strictEqual(s.mode, 4, '$8162 JMP $8186');
  nmi(s, 0, res);
  assert.strictEqual(s.mode, 5, 'PLAY');
  assert.strictEqual(s.substate, 0, '$8165 STA $1B');
  let intro = 0;
  while (s.substate !== 0x80) { nmi(s, 0, res); intro++; }
  assert.strictEqual(intro, 27, 'the cartridge`s own 27 intro frames (W4)');
  assert.strictEqual(s.obj.status[0], 1, '$9BC0 -- the ship is alive');
  assert.strictEqual(s.lives[0], 3, '...with $82D5`s three lives');
});

test('END TO END: the attract demo ends and the whole cycle repeats', () => {
  // The demo runs until the script's terminator or the demo ship's death, then
  // $812D reads $0B and $818F puts the machine back in mode 0. RED WHEN: $0B is
  // never read, the tail writes the wrong mode, or $01 is not cleared (mode 0
  // would take the SHORT arm and never rebuild the title screen).
  const s = boot();
  const seen = [];
  let last = -1;
  for (let i = 0; i < 8000 && seen.length < 5; i++) {
    nmi(s, 0, res);
    if (s.mode !== last) { seen.push(s.mode); last = s.mode; }
  }
  assert.deepStrictEqual(seen, [0, 1, 2, 0, 1],
    'title -> menu -> attract -> title -> menu, unattended');
  assert.strictEqual(s.zp09, 1,
    '$09 is NOT cleared between attract laps: $8307 starts at $12 and $8424 at $20');
});
