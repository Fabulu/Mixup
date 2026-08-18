// HIBACHI'S SECOND FORM -- `$2A6F12..$2A72C7`, THE $3B6 BYTES BEHIND `$2A6BA0 bne.w`.  W403.
//
// ============================================================================
// `($10E,A6)` IS A THREE-WAY PHASE SELECTOR, NOT A FLAG
// ============================================================================
// `boss.js` and W399's note both read `$2A6BA0 bne.w $2A6F12` as "the second form", one body.
// The FIRST instruction at the target says otherwise:
//
//   2a6f12  0c2e 0001 010e   cmpi.b #$1,($10E,A6)
//   2a6f18  6600 019a        bne.w  $2A6F1A + $19A = $2A70B4
//
// It is an EQUALITY test.  `$2A6BA0` only asks "non-zero"; `$2A6F12` then splits that
// non-zero into TWO DIFFERENT BODIES, and the port that treated the target as one routine
// would have run phase A's parts and threshold for a record the cartridge routes elsewhere.
//
//   ($10E,A6) = 0   $2A6BA2   FIRST form   parts $00 $20 $40 $60 $80 $A0 $C0 $1A0
//   ($10E,A6) = 1   $2A6F1C   phase A      parts $140 and $160, threshold $11800
//   ($10E,A6) = 2   $2A70B4   phase B      part  $180,          threshold $15000
//
// and BOTH of the writers are A4 scripts, one ported and one not until this wave:
//
//   $2A5F40  1d7c 0001 010e   move.b #$1,($10E,A6)   A4 script 2  (W399, src/hibachiend.js)
//   $2A637A  1d7c 0002 010e   move.b #$2,($10E,A6)   A4 script 4  (W403, src/hibachiend.js)
//
// The scan that found the second writer is over the whole 6 MB image, not the boss ROM:
// exactly two `1d 7c 00 vv 01 0e` in build B, at $2A5F40 and $2A637A, mirrored in build A at
// $1A4A0E and $1A4E16.  So there is no third phase hiding anywhere.
//
// ============================================================================
// THE EXTENT, AND THE THREE PLACES IT IS BOUNDED
// ============================================================================
// A forward sweep from `$2A6F12` following every branch decodes 214 instructions and covers
// all 950 = $3B6 bytes of $2A6F12..$2A72C7 with NO GAP and nothing outside.  The end is
// bounded three ways, none of them an absence:
//
//   * `$2A72C6 4E75` is an `rts` AT the last address (TRAP 5), reached by three branches.
//   * `$2A72C8` is a longword TABLE -- $2A738A, $2A7400, $2A7850, $2A78D0, $2A7AB2 -- which
//     `tests/w399speedpush.test.js` already names as HIBACHI's fifteen A1 gun scripts.
//   * `$2A72C2 6000 FF6A` is the LAST branch in the body and it points BACKWARD, to $2A722E.
//
// Nothing in this file reads a byte of ROM.  Over those 214 REAL instruction boundaries -- not
// a 2-byte walk, which reports `$2A7196` as a `lea` when $2A7196 is the middle of `$2A7194
// 303C 0800` -- there is no `lea` of any mode, and every absolute-long operand is RAM:
// $8130CA, $8130D2, $8130D4, $811F72, $8130F8, $81B414..$81B41A and $81B61A.  **So this port
// declares NO NEW ROM WINDOW** and the total is unchanged at 585.  `tests/w403hibachi2.test.js`
// SECTION 7 makes that a RUN rather than a scan: both bodies are driven against an EMPTY window
// set and neither refuses.  The one exception is named there -- phase A's kill arm reaches
// `$28615E`, whose `$287DF0` meter-cap table has been windowed since long before this wave.
//
// ============================================================================
// THREE BYTE-IDENTICAL EXIT ROUTINES, AND THE PORT HAD THE FIRST ONE WRONG
// ============================================================================
// `$2A6EDC` (form 1), `$2A707E` (phase A) and `$2A7294` (phase B) are 52 bytes each and
// differ in ONE WORD, the final `bra.w` displacement, which points each at its own death:
//
//   $2A6EDC..$2A6F0F  vs  $2A707E..$2A70B1   differ at byte 48,49:  FE80  vs  FF5A
//   $2A707E..$2A70B1  vs  $2A7294..$2A72C7   differ at byte     49:    5A  vs    6A
//
// so they ARE genuine twins and one helper is correct here.  Writing it exposed TWO defects
// in `boss.js`'s hand-written `bossExit2A6EDC`, both shipped since W372:
//
//   1. `$2A6EDC 4a79 008130d2 / 6600 002a` -- the FREEZE GATE was missing entirely.  The
//      cartridge does not count `($1A,A5)` down at all while `$8130D2` is set.
//   2. `$2A6EF6 6600 000c` goes to `$2A6F04 move.w #$0,($10A,A6) / $2A6F0A 6000 FE80`, and
//      $2A6F0C - $180 = $2A6D8C -- THE ENDING BLOCK.  The port `return`ed instead.  That is
//      the whole timeout route into HIBACHI's death, and no run had ever taken it.
//
// ============================================================================
// WHAT PHASE A AND PHASE B DO **NOT** SHARE WITH FORM 1
// ============================================================================
// Aliasing any of these onto form 1's body would have been silent:
//
//   * form 1 writes FOUR animation bytes $E6..$E9 with $10/$11/$12/$16; phase A writes THREE
//     ($E6/$E7/$E8) and phase B writes ONE ($ED, value $17).
//   * form 1's flash keeps ($E6) unXORed -- `$2A6C62` stores the remapped value straight --
//     while phase A XORs all three ($0F/$0E/$0D) and phase B XORs its one byte with $08.
//   * form 1's `$19` substitution replaces only ($E6); phase A's `$2A6F8C` replaces ALL THREE.
//   * form 1's damage MIN walks eight parts; phase A's is a two-way `cmp.w`/`ble` -- SIGNED,
//     where `boss.js` wrote form 1's as an unsigned `<`.  Phase B has no min at all.
//   * form 1's kill scores `$70000` and only when `$813098`/`$80393A` are both clear, else it
//     stores to `$81B61A`.  Phase A scores `$80000` UNCONDITIONALLY with no such test.  Phase
//     B calls no ledger routine at all: `$2A7172` stores `$100000` to `$81B61A` and jumps.
//   * form 1's phase check latches on ($10C,A6) and tests `$813098`; phase B's latches on
//     ($110,A6), does NOT test `$813098`, and starts A4 `$13` **and** main sequencer `$B`
//     where form 1 starts A4 `$E` and no sequencer.
//
// ============================================================================
// WHAT IS COUNTED RATHER THAN RUN
// ============================================================================
// ONE call now, not two. **W425 (D58) TOOK `$28C170` OFF THIS LIST**: phase A's death BGM cue is
// a real `ctx.soundPost?.(0x28c170)` since `sound.js` grew the `$28BBAC`-tier posting path, the
// same conversion `bossEnding2A6D8C` took at `$2A6D8C`. What remains counted is `$23C4D0` (the
// `$8039xx` pause block, counted in `boss.js` since W357 and pinned by `w382stalenotes`).

import { u16, u32, i16 } from './ram.js';
import { scoreHit, scoreKill } from './score.js';
import {
  a4Start25980C, a4Clear2598A2, a1Clear259B34, a2Stop25994A, a2Run2598E6, seqStart2598D0,
} from './scheduler.js';
import { armScreenClearMode } from './midboss.js';
import { bossDecide2428A6, clamp253564, bossClear242922 } from './boss.js';

/** Every address and field this file stands on, so a test can assert the map. */
export const HIBACHI2 = Object.freeze({
  gateSite: 0x2a6ba0,                  // $2A6BA0 bne.w -- form 1's exit to here
  entry: 0x2a6f12,                     // $2A6F12 cmpi.b #$1,($10E,A6)
  end: 0x2a72c7,                       // $2A72C6 4E75 is the LAST instruction (TRAP 5)
  bytes: 0x03b6,                       // $2A72C8 - $2A6F12
  instructions: 214,                   // the aligned sweep's own count over the whole graph
  selector: 0x10e,                     // ($10E,A6)
  selectorWriters: Object.freeze({ 1: 0x2a5f40, 2: 0x2a637a }),

  phaseA: 0x2a6f1c, phaseAParts: Object.freeze([0x140, 0x160]),
  phaseAHp: 0x11800,                   // $2A6F3C cmpi.l #$11800,($16,A5)
  phaseADeath: 0x2a7008, phaseAExit: 0x2a707e, phaseANext: 3,        // $2A7076 jmp, D0 = 3
  phaseAQuad: 0xe6, phaseAQuadLen: 3,  // $E6 $E7 $E8 -- THREE, not form 1's four
  phaseAKill: 0x00080000,              // $2A6FF2 move.l #$80000,D0

  phaseB: 0x2a70b4, phaseBPart: 0x180,
  phaseBHp: 0x15000,                   // $2A70C4 cmpi.l #$15000,($16,A5)
  phaseBDeath: 0x2a722e, phaseBExit: 0x2a7294, phaseBNext: 5,        // $2A728C jmp, D0 = 5
  phaseBQuad: 0xed,                    // ONE byte
  phaseBBombFlash: 0x00100000,         // $2A7172 move.l #$100000,$81B61A
  phaseBPhaseHp: 0x23000,              // $2A71D0 subi.l #$23000,D0 -- form 1's threshold too
  phaseBPhaseLatch: 0x110,             // ($110,A6), NOT form 1's ($10C,A6)
  phaseBPhaseA4: 0x13, phaseBPhaseSeq: 0x0b,

  // the three twins, and the death each one's `bra.w` names
  exits: Object.freeze({ 0x2a6edc: 0x2a6d8c, 0x2a707e: 0x2a7008, 0x2a7294: 0x2a722e }),
  exitBytes: 0x34,                     // 52, byte-identical but for that displacement
  freezeWord: 0x8130d2,                // the gate `bossExit2A6EDC` was missing
});

/** Counted, not run.  Address -> the instruction that stands there.
 *
 *  **W425 (D58) REMOVED `$28C170` FROM THIS TABLE.** It is no longer counted because it is no
 *  longer deferred: `phaseADeath2A7008` posts it. Leaving the key here would have kept the census
 *  reporting a gap that is closed, which is the exact failure `w382stalenotes` exists to catch. */
export const HIBACHI2_NOTED = Object.freeze({
  0x23c4d0: '$2A700E / $2A723E jsr $23C4D0 -- the $8039xx pause/flag block, counted in '
    + 'boss.js since W357 and asserted by tests/w382stalenotes.test.js',
});

const note = (ctx, a) => (ctx.unported ?? ctx.unportedLog)?.note(a, HIBACHI2_NOTED[a]
  ?? 'W403 HIBACHI second form');

// ============================================================ THE EXIT, ALL THREE OF THEM
/**
 * `$2A6EDC` / `$2A707E` / `$2A7294` -- 52 bytes, byte-identical except the `bra.w` that names
 * the death block, so this is ONE routine with three call sites and not a family.
 *
 * `death` is a thunk rather than an address because the `bra.w` is a TAIL branch: the death
 * block never comes back here, it ends in a `jmp $25980C`.
 */
export function bossExitShared(ram, ctx, a5, a6, death) {
  if (ram.u16(HIBACHI2.freezeWord) !== 0) return;      // $2A707E tst.w $8130D2 / bne -> rts
  const left = u16(ram.u16(a5 + 0x1a) - 1);            // $2A7088 subq.w #1,($1A,A5)
  ram.setU16(a5 + 0x1a, left);
  if (left !== 0) return;                              // $2A708C bne -> rts
  if (bossDecide2428A6(ram) !== 0) {                   // $2A7090 jsr $2428A6 / tst.w / bne
    ram.setU16(a6 + 0x10a, 0);                         // $2A70A6 move.w #$0,($10A,A6)
    death();                                           // $2A70AC bra.w -- the death block
    return;
  }
  ram.setU16(a5 + 0x1a, 0x78);                         // $2A709C move.w #$78,($1A,A5)
}

// ====================================================================== PHASE A -- $2A6F1C
/** `$2A7008..$2A707B`. Ends in `$2A7076 4EF9 0025980C` -- a `jmp`, so A4 3 is a tail call and
 *  the block never returns to the exit that branched here. */
function phaseADeath2A7008(ram, ctx, a5, a6) {
  // $2A7008 jsr $28C170 -- phase A's death BGM cue, the $28BBAC-tier command ($15000000).
  // Posted, not counted, since W425/D58; there is no gate on that path.
  ctx.soundPost?.(0x28c170);                           // $2A7008 jsr $28C170
  note(ctx, 0x23c4d0);                                 // $2A700E jsr $23C4D0
  ram.setU16(a5 + 0x1a, 0x6270);                       // $2A7014 move.w #$6270,($1A,A5)
  clamp253564(ram);                                    // $2A701A jsr $253564
  armScreenClearMode(ram, ctx, 0, 'HIBACHI form 2 phase A death', 0xffff, 0x243dd0);  // $2A7020
  ram.setU16(a6 + 0x106, 1);                           // $2A7026 jsr $2A6ED4 -- body OFF
  a1Clear259B34(ram);                                  // $2A702C
  a4Clear2598A2(ram);                                  // $2A7032
  ram.setU32(a5 + 0x16, 0xffffffff);                   // $2A7038
  ram.setU8(a6 + 0x15e, 1);                            // $2A7040 -- phase A's OWN dead flag
  ram.setU16(a6 + 0x140, 0x8000);                      // $2A7046 -- both parts re-armed
  ram.setU16(a6 + 0x160, 0x8000);                      // $2A704C
  ram.setU8(a6 + 0xe6, 0x10);                          // $2A7052 -- THREE bytes, not four
  ram.setU8(a6 + 0xe7, 0x11);                          // $2A7058
  ram.setU8(a6 + 0xe8, 0x12);                          // $2A705E
  a2Stop25994A(ram, 0x0e);                             // $2A7064/$2A7066
  a2Stop25994A(ram, 0x0a);                             // $2A706C/$2A706E
  a4Start25980C(ram, HIBACHI2.phaseANext);             // $2A7074/$2A7076 jmp $25980C, D0 = 3
}

/** `$2A6F1C..$2A6FFF`. `($140,A6)` and `($160,A6)`, threshold `$11800`. */
function phaseA2A6F1C(ram, rom, ctx, a5, a6) {
  const death = () => phaseADeath2A7008(ram, ctx, a5, a6);
  const exit = () => bossExitShared(ram, ctx, a5, a6, death);          // $2A7000 jmp $2A707E

  // $2A6F1C move.b ($140,A6),D1 / $2A6F20 or.b ($160,A6),D1 / $2A6F24 andi.w #$5C,D1.  BYTE
  // reads of a WORD field: ($140,A6) is $A001 after $2A6E5C arms it and the byte is $A0.
  const hit = (ram.u8(a6 + 0x140) | ram.u8(a6 + 0x160)) & 0x5c;
  if (hit === 0) {                                     // $2A6F28 bne $2A6F64
    ram.setU8(a6 + 0xe6, 0x10);                        // $2A6F2A
    ram.setU8(a6 + 0xe7, 0x11);                        // $2A6F30
    ram.setU8(a6 + 0xe8, 0x12);                        // $2A6F36
    // $2A6F3C cmpi.l #$11800,($16,A5) / bcc -- UNSIGNED, so only a pool BELOW $11800 falls in.
    if (ram.u32(a5 + 0x16) < HIBACHI2.phaseAHp                    // $2A6F44 bcc $2A7000
        && ram.u16(0x8130ca) === 0) {                             // $2A6F4E bne $2A7000
      ram.setU8(a6 + 0xe6, 0x19);                      // $2A6F52 moveq #$19 / $2A6F54
      ram.setU8(a6 + 0xe7, 0x19);                      // $2A6F58 -- the SAME D0 to all three
      ram.setU8(a6 + 0xe8, 0x19);                      // $2A6F5C
    }
    exit();                                            // $2A6F60 bra.w $2A7000
    return;
  }

  ram.setU8(a6 + 0x140, ram.u8(a6 + 0x140) & 0xa3);    // $2A6F64 move.b #$A3,D0 / $2A6F68
  ram.setU8(a6 + 0x160, ram.u8(a6 + 0x160) & 0xa3);    // $2A6F6C
  ram.setU16(a6 + 0x10a, hit);                         // $2A6F70 move.w D1,($10A,A6)
  scoreHit(ram, ctx, a6, hit);                         // $2A6F74 jsr $286096

  // $2A6F7A..$2A6FAC.  The `$19` test is on ($E6,A6) ALONE and its arm rewrites ALL THREE
  // registers, then every one of the three is XORed -- including ($E6), which form 1's
  // $2A6C62 stores unXORed.  Three constants, one per byte.
  let d0 = ram.u8(a6 + 0xe6);                          // $2A6F7A
  let d2 = ram.u8(a6 + 0xe7);                          // $2A6F7E
  let d3 = ram.u8(a6 + 0xe8);                          // $2A6F82
  if (d0 === 0x19) {                                   // $2A6F86 cmpi.b #$19,D0 / $2A6F8A bne
    d0 = 0x10; d2 = 0x11; d3 = 0x12;                   // $2A6F8C/$2A6F90/$2A6F94
  }
  ram.setU8(a6 + 0xe6, d0 ^ 0x0f);                     // $2A6F98/$2A6F9C
  ram.setU8(a6 + 0xe7, d2 ^ 0x0e);                     // $2A6FA0/$2A6FA4
  ram.setU8(a6 + 0xe8, d3 ^ 0x0d);                     // $2A6FA8/$2A6FAC

  // $2A6FB0..$2A6FCC.  `cmp.w ($178,A6),D4 / ble` is a SIGNED minimum of the two $18
  // accumulators ($140+$18 and $160+$18).  `move.l #$7FFF,D5` then `sub.w D4,D5` leaves the
  // upper word zero, so the `sub.l` below spends exactly the word this computes.
  let d4 = i16(ram.u16(a6 + 0x158));                   // $2A6FB0
  if (d4 > i16(ram.u16(a6 + 0x178))) d4 = i16(ram.u16(a6 + 0x178));   // $2A6FB4/$2A6FB8/$2A6FBA
  ram.setU16(a6 + 0x158, 0x7fff);                      // $2A6FBE/$2A6FC4
  ram.setU16(a6 + 0x178, 0x7fff);                      // $2A6FC8
  const dmg = u16(0x7fff - d4);                        // $2A6FCC sub.w D4,D5

  if (ram.u16(a6 + 0x108) === 0) {                     // $2A6FCE tst.w / $2A6FD2 bne $2A7000
    ram.setU32(a5 + 0x16, u32(ram.u32(a5 + 0x16) - dmg));           // $2A6FD4 sub.l D5,($16,A5)
    if ((ram.u32(a5 + 0x16) & 0x80000000) !== 0) {                  // $2A6FD8 bpl $2A7000
      if (bossDecide2428A6(ram) !== 0) {               // $2A6FDA/$2A6FE0/$2A6FE2 bne $2A6FEE
        // $2A6FEE..$2A6FF8 -- NO $813098/$80393A test and NO $81B61A store: phase A always
        // pays the ledger, and it pays $80000 where form 1 pays $70000.
        scoreKill(ram, rom, ctx, HIBACHI2.phaseAKill, ram.u16(a6 + 0x10a));
        death();                                       // $2A6FFE bra.s $2A7008
        return;
      }
      ram.setU32(a5 + 0x16, 0x200);                    // $2A6FE4 -- REFILL, the fight goes on
    }
  }
  exit();                                              // $2A6FEC bra.s $2A7000
}

// ====================================================================== PHASE B -- $2A70B4
/** `$2A722E..$2A7291`.  NOT phase A's death with different constants: it has the two `$8130F8`
 *  bsets and `$242922` that phase A lacks, and lacks phase A's `$28C170` and `($1A,A5)`.
 *
 *  **W425 (D58): IT STILL REACHES `$28C170` ANYWAY, THROUGH `$242922`.** The sentence above
 *  is about the INSTRUCTION and is right; it was read for years as "phase B does not cue",
 *  which is wrong. `bossClear242922`'s first instruction is `jsr $28C170`, so BOTH deaths
 *  post the command -- phase A directly at `$2A7008`, phase B one call deeper at `$2A724A`.
 *  `tests/w425bossexplosion.test.js` and `w403hibachi2.test.js` both count it now, which is
 *  only possible because it stopped being a note. */
function phaseBDeath2A722E(ram, ctx, a5, a6) {
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x40);        // $2A722E bset #6
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x80);        // $2A7236 bset #7
  note(ctx, 0x23c4d0);                                 // $2A723E
  clamp253564(ram);                                    // $2A7244
  bossClear242922(ram, ctx);                           // $2A724A
  armScreenClearMode(ram, ctx, 0, 'HIBACHI form 2 phase B death', 0xffff, 0x243dd0); // $2A7250
  ram.setU16(a6 + 0x106, 1);                           // $2A7256 jsr $2A6ED4
  a1Clear259B34(ram);                                  // $2A725C
  a4Clear2598A2(ram);                                  // $2A7262
  ram.setU32(a5 + 0x16, 0xffffffff);                   // $2A7268
  ram.setU8(a6 + 0x15f, 1);                            // $2A7270 -- $15F, phase A's was $15E
  ram.setU16(a6 + 0x180, 0x8000);                      // $2A7276
  ram.setU8(a6 + 0xed, 0x17);                          // $2A727C
  a2Stop25994A(ram, 0x12);                             // $2A7282/$2A7284
  a4Start25980C(ram, HIBACHI2.phaseBNext);             // $2A728A/$2A728C jmp $25980C, D0 = 5
}

/**
 * `$2A7180..$2A7229` -- phase B's JOIN, and its own phase check.  Reached from the no-hit
 * tail, from the invulnerable arm, from the refill arm and from `$2A7106`'s rejoin.
 *
 * **W406: IT ENDS IN `$2A7226 4EFA 006C`, A `jmp $2A7294` -- THE EXIT -- AND W403 DROPPED IT.**
 * TRAP 4 on the displacement ($2A7228 + $6C) and TRAP 20 on the arms: `$2A71CA 66 5A` and
 * `$2A71D6 6A 4E` both land on $2A7226 as well, so ALL THREE ways out of the phase check go
 * to the exit and NOT to an `rts`.  W403 wrote the first two as `return` and left the third
 * falling off the end of the function, so `bossExitShared` -- and with it `$2A7088 subq.w
 * #$1,($1A,A5)` -- never ran for phase B at all.  Measured on the real path before the fix:
 * `($1A,A5)` sat at `$6270` for all 390 frames between A4 script 4 and A4 $F, which is what
 * exposed it, because A4 $F's `move.b #$C,($1A,A5)` is only a timer if something counts it.
 * Phase B could not die of its timeout, and `HIBACHI2.exits`'s third entry named a routine
 * with no caller.
 */
function phaseBJoin2A7180(ram, ctx, a5, a6) {
  const exit = () => bossExitShared(ram, ctx, a5, a6,
    () => phaseBDeath2A722E(ram, ctx, a5, a6));        // $2A7226 jmp $2A7294
  ram.setU32(a5 + 0x1c, ram.u32(a5 + 0x16));           // $2A7180 move.l ($16,A5),($1C,A5)
  let d0 = 0x0500;                                     // $2A7186 move.w #$500,D0
  if (ram.u16(a6 + 0x13a) !== 0) {                     // $2A718A tst.w / $2A718E beq $2A7198
    ram.setU16(a6 + 0x13a, u16(ram.u16(a6 + 0x13a) - 1));   // $2A7190 subq.w #1,($13A,A6)
    d0 = 0x0800;                                       // $2A7194
  }
  ram.setU16(a6 + 0x194, d0);                          // $2A7198
  ram.setU16(a6 + 0x196, d0);                          // $2A719C

  // $2A71A0..$2A71C4 -- A2 slot $12 runs while ANY of the three holds, and is stopped only
  // when all three are clear.  `$2A71BE bra.s $2A71C6` is what keeps the stop arm from
  // falling into the run arm two bytes below it.
  if (ram.u16(0x8130d4) !== 0                          // $2A71A2 tst.w / $2A71A8 bne $2A71C0
      || ram.u16(0x811f72) !== 0                       // $2A71AA tst.w / $2A71B0 bne $2A71C0
      || ram.u16(a6 + 0x13a) !== 0) {                  // $2A71B2 tst.w / $2A71B6 bne $2A71C0
    a2Run2598E6(ram, 0x12);                            // $2A71C0 jsr $2598E6
  } else {
    a2Stop25994A(ram, 0x12);                           // $2A71B8 jsr $25994A
  }

  // $2A71C6.. -- phase B's OWN phase check.  Same $23000 threshold as form 1's $2A6D42 and
  // nothing else in common: a different latch byte, no $813098 test, and it starts the main
  // sequencer as well as an A4 script.
  if (ram.u8(a6 + HIBACHI2.phaseBPhaseLatch) !== 0) { exit(); return; }  // $2A71C6 / $2A71CA bne
  if ((u32(ram.u32(a5 + 0x16) - HIBACHI2.phaseBPhaseHp) & 0x80000000) === 0) {
    exit(); return;                                    // $2A71D6 bpl.s $2A7226
  }
  a1Clear259B34(ram);                                  // $2A71D8
  a4Clear2598A2(ram);                                  // $2A71DE
  seqStart2598D0(ram, HIBACHI2.phaseBPhaseSeq);        // $2A71E4/$2A71E6 -- form 1 has NO seq
  a4Start25980C(ram, HIBACHI2.phaseBPhaseA4);          // $2A71EC/$2A71EE
  ram.setU16(a6 + 0x108, 1);                           // $2A71F4 jsr $2A6E28 -- INVULNERABLE
  ram.setU8(a6 + HIBACHI2.phaseBPhaseLatch, 1);        // $2A71FA -- the latch
  ram.setU16(0x81b414, 1);                             // $2A7200
  ram.setU16(0x81b416, 1);                             // $2A7208
  ram.setU16(0x81b418, 1);                             // $2A7210
  ram.setU16(0x81b41a, 1);                             // $2A7218
  armScreenClearMode(ram, ctx, 0, 'HIBACHI phase B $23000', 0xffff, 0x243dd0);   // $2A7220
  exit();                                              // $2A7226 jmp $2A7294 -- the FALL-THROUGH
}

/** `$2A70BE..$2A70E3` -- the tail BOTH the no-hit arm and `$2A711C`'s rejoin run. */
function phaseBTail2A70BE(ram, ctx, a5, a6) {
  ram.setU8(a6 + 0xed, 0x17);                          // $2A70BE move.b #$17,($ED,A6)
  if (ram.u32(a5 + 0x16) < HIBACHI2.phaseBHp           // $2A70C4 cmpi.l / $2A70CC bcc $2A7180
      && ram.u16(0x8130ca) === 0) {                    // $2A70D0 tst.w / $2A70D6 bne $2A7180
    ram.setU8(a6 + 0xed, 0x19);                        // $2A70DA moveq #$19 / $2A70DC
  }
  phaseBJoin2A7180(ram, ctx, a5, a6);                  // $2A70E0 bra.w $2A7180
}

/** `$2A7106..$2A711B` -- rearm A2 $12, reset the accumulator, and RESTORE the pool from its
 *  shadow `($1C,A5)`, then rejoin the no-hit tail.  This is the arm that makes phase B
 *  unkillable while `$8130D4`, `$811F72` or `($13A,A6)` holds. */
function phaseBHold2A7106(ram, ctx, a5, a6) {
  a2Run2598E6(ram, 0x12);                              // $2A7106/$2A7108
  ram.setU16(a6 + 0x198, 0x7fff);                      // $2A710E/$2A7112
  ram.setU32(a5 + 0x16, ram.u32(a5 + 0x1c));           // $2A7116 move.l ($1C,A5),($16,A5)
  phaseBTail2A70BE(ram, ctx, a5, a6);                  // $2A711C bra.w $2A70BE
}

/** `$2A70B4..$2A717F`. `($180,A6)` alone, threshold `$15000`, ONE animation byte. */
function phaseB2A70B4(ram, ctx, a5, a6) {
  const hit = ram.u8(a6 + 0x180) & 0x5c;               // $2A70B4/$2A70B8 andi.w #$5C,D1
  if (hit === 0) {                                     // $2A70BC bne $2A70E4
    phaseBTail2A70BE(ram, ctx, a5, a6);
    return;
  }

  ram.setU8(a6 + 0x180, ram.u8(a6 + 0x180) & 0xa3);    // $2A70E4 move.b #$A3,D0 / $2A70E8
  ram.setU16(a6 + 0x10a, hit);                         // $2A70EC move.w D1,($10A,A6)

  // $2A70F0..$2A70FE -- THREE ways out of two tests, and the middle one WRITES before it
  // rejoins.  `$8130D4` set skips the write; `$811F72` clear skips both.
  if (ram.u16(0x8130d4) !== 0) {                       // $2A70F0/$2A70F6 bne $2A7106
    phaseBHold2A7106(ram, ctx, a5, a6);
    return;
  }
  if (ram.u16(0x811f72) !== 0) {                       // $2A70F8/$2A70FE beq $2A7120
    ram.setU16(a6 + 0x13a, 0x0028);                    // $2A7100 move.w #$28,($13A,A6)
    phaseBHold2A7106(ram, ctx, a5, a6);                // falls into $2A7106
    return;
  }
  // $2A7120 tst.w ($13A,A6) / bne -$20 -> $2A7106.  TRAP 6-adjacent: `66 e0` is a BACKWARD
  // short branch, and reading it forward would land in the middle of $2A7126's jsr.
  if (ram.u16(a6 + 0x13a) !== 0) {                     // $2A7120/$2A7124
    phaseBHold2A7106(ram, ctx, a5, a6);
    return;
  }

  scoreHit(ram, ctx, a6, hit);                         // $2A7126 jsr $286096
  let d0 = ram.u8(a6 + 0xed);                          // $2A712C
  if (d0 === 0x19) d0 = 0x17;                          // $2A7130/$2A7134/$2A7136
  ram.setU8(a6 + 0xed, d0 ^ 0x08);                     // $2A713A/$2A713E -- ONE byte, ONE XOR

  const d4 = i16(ram.u16(a6 + 0x198));                 // $2A7142 -- no minimum: one part
  ram.setU16(a6 + 0x198, 0x7fff);                      // $2A7146/$2A714C
  const dmg = u16(0x7fff - d4);                        // $2A7150 sub.w D4,D5

  if (ram.u16(a6 + 0x108) === 0) {                     // $2A7152/$2A7156 bne $2A7180
    ram.setU32(a5 + 0x16, u32(ram.u32(a5 + 0x16) - dmg));           // $2A7158 sub.l D5,($16,A5)
    if ((ram.u32(a5 + 0x16) & 0x80000000) !== 0) {                  // $2A715C bpl $2A7180
      if (bossDecide2428A6(ram) !== 0) {               // $2A715E/$2A7164/$2A7166 bne $2A7172
        // $2A7172 -- NO $28615E at all.  The whole ledger for phase B's kill is this store.
        ram.setU32(0x81b61a, HIBACHI2.phaseBBombFlash);
        phaseBDeath2A722E(ram, ctx, a5, a6);           // $2A717C bra.w $2A722E
        return;
      }
      ram.setU32(a5 + 0x16, 0x200);                    // $2A7168
    }
  }
  phaseBJoin2A7180(ram, ctx, a5, a6);                  // $2A7170 bra.s $2A7180
}

// ================================================================================ THE ENTRY
/**
 * `$2A6F12`.  Reached only from `$2A6BA0 bne.w`, which fires when `($10E,A6)` is non-zero --
 * and this instruction then splits that non-zero in two.  `cmpi.b`, not `tst.b`.
 */
export function hibachiSecondForm2A6F12(ram, rom, ctx, a5, a6) {
  if (ram.u8(a6 + HIBACHI2.selector) !== 1) {          // $2A6F12 cmpi.b #$1 / $2A6F18 bne.w
    phaseB2A70B4(ram, ctx, a5, a6);                    // $2A70B4
    return;
  }
  phaseA2A6F1C(ram, rom, ctx, a5, a6);                 // $2A6F1C
}
