// THE PLAYER-TRACKING LIBRARY -- `$241F00`..`$242A70`, the part of it this
// cartridge actually calls.
//
// WHY THIS IS ONE FILE AND WHY IT IS NOT 43 FUNCTIONS.  `20-recon-aiming.md`
// counted the library: **43 entry points, and 23 of them have no reference
// anywhere in the 6 MB image** -- not a `jsr`, not a branch, not a longword in
// any pointer table.  It is shared IGS/Cave middleware and DaiOuJou uses a
// subset.  So this file ports the LIVE subset and leaves each dead entry as a
// LOUD NAMED THROW carrying its ROM address and its measured reference count,
// because "we did not port it" and "the cartridge cannot reach it" are
// different claims and a silent absence conflates them.
//
// THE LEVERAGE, and it is why this file is worth its length: `$24203E` and
// `$2422A2` stand behind **260 external call sites** (149 + 111).  Port the
// generator once and every tracking enemy in the game is a caller.
//
// ===================== THE THREE THINGS A NAIVE PORT GETS WRONG ==============
//
// 1. **THE AXIS SCALE.**  `$24205C move.w D1,D2 / asr.w #1,D2 / add.w D2,D1`
//    makes this `atan2(dY, 1.5*dX)`, not `atan2(dY, dX)`.  It is not a bug:
//    the direction->velocity table `$200920` carries the SAME 1.5 on all 120
//    speed rows (recon §2, measured: ratio 1.4865..1.5714 converging on 1.505)
//    and the two cancel, so the shot flies down the true line.  A textbook
//    atan2 plus a textbook unit-circle table is self-consistent AND WRONG.
//    They port as a pair or not at all.
//
// 2. **THE `$1800` BIAS.**  `$24203E move.w #$1800,D4 / add.w D4,D0..D3`.  It
//    cancels in every subtraction and it is still load-bearing: the `bcc`
//    after each `sub.w` is an UNSIGNED borrow used as a sign test, and the bias
//    is what makes that work for coordinates in `[-$1800, $E7FF]`.  Measured on
//    the recon's model: 0/300,000 disagreements inside that window, 160,325 of
//    300,000 outside it.  Drop the bias and the function stops being a function
//    of the deltas.
//
// 3. **THE LUT IS DATA, NOT A FORMULA.**  `$2420F6[129]` deviates from a true
//    arctan by **+1.65 units of 512 (1.16 degrees) at index 10** and by <= 0.55
//    for index >= 19 -- and small indices are the near-axis band a shooter's
//    shots spend most of their life in.  Generate it and you are one direction
//    step out where it matters most.  It is exported as bytes by
//    `tools/export-tables.py` and read here through `RomWindows`, which throws
//    by address if the export ever stops covering it.
//
// ===================== WHAT VALIDATES THIS =================================
// `20-recon-aiming.md` §4: the transcription this file was written from matched
// the cartridge on **6,139 live calls with zero mismatches**, over 8 octants,
// 128 of 129 ratio indices and 738 of the 1,032 reachable internal states,
// including the P2->P1 fallback.  `tests/aim.test.js` re-derives that agreement
// through THIS code (not through the Python), and `tools/w20turretgate.mjs`
// runs it against a live board corpus, per frame, on a rotating turret.
//
// RANK DOES NOT REACH THIS FILE.  `$24203E..$2420C4` and `$2422A2..$242318`
// touch only D0-D4, A0, A7 and three PC-relative ROM tables: no global, no RNG,
// no stage, no rank.  That is a LISTING fact (only a listing can prove an
// absence) and it is the one place in this port where "rank feeds aim", true in
// Gradius, is measurably false here.

import { unreached } from './unported.js';
import { i16, u16 } from './ram.js';

/** Every ROM address this file translates, so a reader can check any line. */
export const AIM = {
  core64: 0x24203e,          // aim64 CORE      self=D0/D1 target=D2/D3 -> D1
  core256: 0x2422a2,         // aim256 CORE
  lut64: 0x2420f6,           // 129 bytes  $242088 lea ($2420F6,PC),A0
  base64: 0x2420e6,          // 8 words    $242092
  ops64: 0x2420c6,           // 8 longs    $24209C -- $2420AE sub / $2420BA add
  lut256: 0x242362,          // 65 bytes   $2422EC
  base256: 0x242352,         // 8 words    $2422F6
  ops256: 0x242312,          // 8 x 8-byte stubs, $24230A jsr (A0,D4.w)
  opSub64: 0x2420ae,         // sub.w D0,D1 / addq #4 / lsr #3 / andi #$3F
  opAdd64: 0x2420ba,         // add.w D0,D1 / addq #4 / lsr #3 / andi #$3F
  selP1: 0x8103e6,           // $24270A lea $8103E6,A0   -- P1's record
  selP2: 0x810448,           // $242710 lea $810448,A1   -- P2's record
};

/** The reference counts `tools/recon20/aimref.py` measured over the whole 6 MB
 *  decrypted image (absolute-long AND PC-relative AND every longword in any
 *  pointer table).  A zero here is the strongest absence claim this project can
 *  make about a routine, and it is why the dead entries throw. */
export const AIM_REFS = new Map([
  [0x241fea, 0], [0x241ff4, 0], [0x241ffc, 0], [0x24200a, 61], [0x242018, 0],
  [0x242022, 0], [0x24202c, 37], [0x24203e, 48], [0x242178, 8], [0x242186, 0],
  [0x24218c, 2], [0x242190, 84], [0x2421ac, 2], [0x2421c6, 0], [0x242206, 0],
  [0x242242, 0], [0x242252, 0], [0x24225c, 0], [0x242266, 0], [0x24226e, 48],
  [0x24227c, 0], [0x242286, 0], [0x242290, 21], [0x2422a2, 46], [0x24270a, 6],
  [0x242730, 3], [0x242748, 1], [0x242760, 0],
]);

/** A library entry point with no reference anywhere in the image. */
function deadEntry(addr, what) {
  unreached(addr, `${what} -- entry point $${addr.toString(16).toUpperCase()} `
    + `of the player-tracking library has ZERO references in the whole 6 MB `
    + `decrypted image (20-recon-aiming.md §1: not a jsr, not a branch, and not `
    + `a longword in any pointer table). It is unported ON PURPOSE. If control `
    + `reached here, either the reference scan missed a dispatch form or the `
    + `port invented a call -- both are defects, and neither may be smoothed`);
}

/**
 * The five ROM tables the two cores read, lifted once out of `RomWindows`.
 *
 * The constructor CHECKS the two op tables against the instruction encodings
 * rather than trusting an index: `$2420C6`'s eight longwords must each be
 * `$2420AE` (sub) or `$2420BA` (add), and `$242312`'s eight 8-byte stubs must
 * each open `$9240` (`sub.w D0,D1`) or `$D240` (`add.w D0,D1`).  A table that
 * changed shape stops the port here, by address, instead of silently mirroring
 * every angle into the wrong quadrant.
 */
export class AimTables {
  constructor(rom) {
    this.lut64 = Uint8Array.from(rom.bytes(AIM.lut64, 129));
    this.base64 = [];
    this.sub64 = [];
    for (let i = 0; i < 8; i++) {
      this.base64.push(rom.u16(AIM.base64 + 2 * i));       // $242098
      const op = rom.u32(AIM.ops64 + 4 * i);               // $2420A4 movea.l
      if (op !== AIM.opSub64 && op !== AIM.opAdd64) {
        unreached(AIM.ops64 + 4 * i, `the octant-sign table $2420C6[${i}] holds `
          + `$${op.toString(16).toUpperCase()}, which is neither $2420AE (sub.w `
          + `D0,D1) nor $2420BA (add.w D0,D1) -- the only two routines $24209C `
          + `can dispatch. The export is stale or the address is wrong`);
      }
      this.sub64.push(op === AIM.opSub64);
    }
    this.lut256 = Uint8Array.from(rom.bytes(AIM.lut256, 65));
    this.base256 = [];
    this.sub256 = [];
    for (let i = 0; i < 8; i++) {
      this.base256.push(rom.u16(AIM.base256 + 2 * i));     // $2422FC
      const op = rom.u16(AIM.ops256 + 8 * i);              // $24230A jsr (A0,D4.w)
      if (op !== 0x9240 && op !== 0xd240) {
        unreached(AIM.ops256 + 8 * i, `the aim256 octant stub $242312[${i}] opens `
          + `$${op.toString(16).toUpperCase()}, not $9240 (sub.w D0,D1) or $D240 `
          + `(add.w D0,D1). Every one of the eight stubs is exactly `
          + `<add|sub>.w D0,D1 / andi.w #$FF,D1 / rts`);
      }
      this.sub256.push(op === 0x9240);
    }
  }
}

// ---------------------------------------------------------------- the cores

/** `asr.w #n` -- ARITHMETIC, on the 16-bit value.  `$24205E asr.w #1,D2` sees a
 *  magnitude in every reached case, but translate it as written: a |dX| above
 *  $7FFF (reachable only outside the bias window) shifts as negative. */
const asrw = (v, n) => u16(i16(v) >> n);

/**
 * `$24203E` -- THE 64-DIRECTION AIM. Pure: four coordinates in, 0..63 out.
 *
 * Front half ($24203E..$242084) reduces the pair to (octant, ratio 0..128);
 * back half ($242086..$2420C4) is three table reads and four instructions.
 * The internal state space is 8 x 129 = 1,032 and ALL 64 output directions are
 * reachable (recon §7, enumerated from the tables, not sampled).
 *
 * @returns {number} 0..63.  0 = the target is at +Y (below); 16 = +X; 32 = -Y.
 */
export function aim64(t, selfY, selfX, tgtY, tgtX, mut = null) {
  let d0 = u16(selfY + 0x1800);                      // $24203E move.w #$1800,D4
  let d1 = u16(selfX + 0x1800);                      // $242042..$242048 add.w D4,Dn
  const d2 = u16(tgtY + 0x1800);
  const d3 = u16(tgtX + 0x1800);
  let d4 = 8;                                        // $24204A moveq #8,D4
  // $24204C sub.w D3,D1 / bcc / neg.w D1 ; moveq #0,D4 -- an UNSIGNED borrow
  // standing in for a sign test.  This is what the $1800 bias buys.
  if (d1 < d3) { d1 = u16(-(d1 - d3)); d4 = 0; } else { d1 = u16(d1 - d3); }
  // $242054 sub.w D2,D0 / bcc / neg.w D0 ; addq.w #4,D4
  if (d0 < d2) { d0 = u16(-(d0 - d2)); d4 += 4; } else { d0 = u16(d0 - d2); }
  // $24205C -- THE AXIS SCALE.  |dX| * 3/2.  See the header.
  // MUTATION `plain-atan2`: drop the 1.5 and this becomes the textbook atan2 a
  // port would write by instinct.  It must be seen to go RED against the board.
  if (mut !== 'plain-atan2') d1 = u16(d1 + asrw(d1, 1));
  // $242062 cmp.w D0,D1 / bcc / addq.w #2,D4 ; exg D0,D1   -> D0 = min, D1 = max
  if (d1 < d0) { d4 += 2; const t2 = d0; d0 = d1; d1 = t2; }
  // $24206A swap/clr.w/swap -- zero-extend the min into the longword
  let l0 = d0 >>> 0;
  if (d1 === 0) return 0;                            // $242070 tst.w D1 / beq -> rts
  l0 = (l0 << 6) >>> 0;                              // $242074 asl.l #6,D0
  let q = Math.floor(l0 / d1);                       // $242076 divu.w D1,D0
  const rem = l0 % d1;
  q = u16(q + q);                                    // $24207C add.w D0,D0 (0..128)
  // $24207E add.w D2,D2 / cmp.w D2,D1 / bcc / addq.w #1,D0 -- ROUND TO NEAREST.
  // Toward-zero here is one LUT index, i.e. up to one whole direction step.
  // MUTATION `round-toward-zero`: skip it. One LUT index = up to one whole
  // direction step of 5.625 degrees.
  if (mut !== 'round-toward-zero' && d1 < u16(rem + rem)) q = u16(q + 1);
  // MUTATION `lut-generated`: reconstruct the arctan from a formula instead of
  // reading the cartridge's bytes. The recon measured the ROM table deviating
  // by +1.65/512 at index 10, so this is the "it is obviously just an arctan"
  // mistake, made deliberately.
  const lut = mut === 'lut-generated'
    ? Math.round(512 * Math.atan2(q, 128) / (2 * Math.PI))
    : t.lut64[q];                                    // $24208E move.b (A0,D0.w),D0
  let a = t.base64[d4 >> 1];                         // $242098 move.w (A0,D4.w),D1
  // $2420A4 movea.l (A0,D4*2),A0 / jsr (A0) -> $2420AE sub or $2420BA add,
  // then addq.w #4 / lsr.w #3 (round-to-nearest from 512 steps down to 64) /
  // andi.w #$3F.
  a = t.sub64[d4 >> 1] ? u16(a - lut) : u16(a + lut);
  return ((a + 4) >>> 3) & 0x3f;
}

/**
 * `$2422A2` -- THE 256-DIRECTION AIM.  Same octant decomposition, `asl.l #5`
 * instead of `#6`, a 65-byte LUT, and NO final `lsr #3`: the internal 512-step
 * precision is kept at 256 steps = 1.40625 degrees.
 *
 * The rounding is written DIFFERENTLY from aim64 and must stay different:
 * aim64 doubles the remainder and compares it with the divisor; aim256 HALVES
 * the divisor ($2422E2 `asr.w #1,D1`) and compares that with the remainder.
 *
 * COVERAGE WARNING, stated because a reader will otherwise assume parity: the
 * corpus that validated aim64 on 6,127 rows reached aim256 **12 times at 2
 * sites** (recon §11 item 1).  This code is listing-exact and thinly measured.
 *
 * @returns {number} 0..255.
 */
export function aim256(t, selfY, selfX, tgtY, tgtX) {
  let d0 = u16(selfY + 0x1800);                      // $2422A2
  let d1 = u16(selfX + 0x1800);
  const d2 = u16(tgtY + 0x1800);
  const d3 = u16(tgtX + 0x1800);
  let d4 = 8;
  if (d1 < d3) { d1 = u16(-(d1 - d3)); d4 = 0; } else { d1 = u16(d1 - d3); }
  if (d0 < d2) { d0 = u16(-(d0 - d2)); d4 += 4; } else { d0 = u16(d0 - d2); }
  d1 = u16(d1 + asrw(d1, 1));                        // $2422C0 the same 1.5
  if (d1 < d0) { d4 += 2; const t2 = d0; d0 = d1; d1 = t2; }
  let l0 = d0 >>> 0;
  if (d1 === 0) return 0;                            // $2422D4 tst.w D1 / beq
  l0 = (l0 << 5) >>> 0;                              // $2422D8 asl.l #5,D0
  let q = Math.floor(l0 / d1);
  const rem = l0 % d1;
  q = u16(q + q);                                    // $2422E0 add.w D0,D0 (0..64)
  if (asrw(d1, 1) < rem) q = u16(q + 1);             // $2422E2 asr.w #1,D1 / cmp
  const lut = t.lut256[q];                           // $2422F2
  let a = t.base256[d4 >> 1];                        // $2422FC
  a = t.sub256[d4 >> 1] ? u16(a - lut) : u16(a + lut);
  return a & 0xff;                                   // the stubs' andi.w #$FF
}

// ------------------------------------------------------------ target select

/**
 * `$24270A` -- pick the player to aim at, from the enemy record's own target
 * index, WITH THE ALIVE-BIT FALLBACK.
 *
 * `$24271E tst.w (A0) / bmi` -- bit 15 of the player record's first word is
 * "this player is alive".  If the nominated player is dead the OTHER one is
 * used; if both are dead the routine returns with CARRY SET and the caller
 * does not aim at all (`$268A36 bcs $268A68`).
 *
 * THIS IS NOT AN EDGE CASE IN A ONE-PLAYER GAME.  Measured over the recon's
 * 12,281-row capture: 5,916 of the aims (48 %) nominate P2, P2's alive word
 * `$810448` was `0000` on ALL 12,281 rows, and every one of those aims was
 * rescued onto P1 here.  A port that honours `($3,A5)` without the fallback
 * aims half the game's shots at a player who does not exist.
 *
 * @returns {{addr:number, carry:boolean}} `addr` is the chosen player record.
 */
export function targetSelect(ram, a5, mut = null) {
  return targetSelectBy(ram, ram.u8(a5 + 0x03) !== 0, mut);  // $242716 tst.b ($3,A5)
}

/** `$242730` -- the same routine keyed on `($2E,A6)`. 3 call sites. */
export function targetSelectByA6_2E(ram, a6) {
  return targetSelectBy(ram, ram.u8(a6 + 0x2e) !== 0);   // $24273C
}

/** `$242748` -- the same routine keyed on `($2A,A6)`. 1 call site. */
export function targetSelectByA6_2A(ram, a6) {
  return targetSelectBy(ram, ram.u8(a6 + 0x2a) !== 0);   // $242754
}

function targetSelectBy(ram, swap, mut = null) {
  let a0 = AIM.selP1, a1 = AIM.selP2;                // $24270A / $242710
  if (swap) { a0 = AIM.selP2; a1 = AIM.selP1; }      // $24271C exg A0,A1
  // MUTATION `no-p2-fallback`: honour ($3,A5) and stop. 48 % of measured aims
  // nominate a P2 who does not exist, so this one should be spectacular.
  if (mut === 'no-p2-fallback') return { addr: a0, carry: false };
  if (ram.u16(a0) & 0x8000) return { addr: a0, carry: false };  // $24271E bmi
  if (ram.u16(a1) & 0x8000) return { addr: a1, carry: false };  // $242722 bmi
  return { addr: a0, carry: true };                  // $242726 ori #$1,SR
}

/**
 * `$242760` -- the PSEUDO-RANDOM target chooser, stepped by `addq.b #1,$803917`
 * through a 256-byte table at `$242784` (exactly 128 ones and 128 zeros).
 * DEAD: no reference anywhere in the image.
 */
export function targetSelectRandom() {
  deadEntry(0x242760, 'the pseudo-random P1/P2 target chooser');
}

// ------------------------------------------------------------ the live entries

/**
 * `$24200A` -- aim64 at the record's selected target, SELF SUPPLIED BY THE
 * CALLER in D0/D1.  61 call sites, the most-used aim entry in the game, and the
 * one both turret handlers use.
 *
 * The caller supplying self is the whole reason MUZZLE OFFSETS exist: 11 of the
 * 16 call sites the recon reached bias the position first (`$268A2C addi.w
 * #$200,D0`), by -$700..+$2700, and two of them alternate +-$500 as a left and
 * a right turret.  Omitting the offsets cost the recon's model 5,051 of 6,139
 * rows -- so this entry takes the biased coordinates and never reads `(A6)`.
 *
 * @param t AimTables, or a lazy getter when the caller can branch before the core
 * @returns {{dir:number, carry:boolean}} carry = both players dead, no aim.
 */
export function aim64FromCaller(t, ram, a5, selfY, selfX, mut = null) {
  const sel = targetSelect(ram, a5, mut);            // $24200A bsr $24270A
  if (sel.carry) return { dir: 0, carry: true };     // $24200E bcs $241FF2 (rts)
  const ty = ram.u16(sel.addr + 2);                  // $242010 movem.w ($2,A0),D2-D3
  const tx = ram.u16(sel.addr + 4);
  const tables = typeof t === 'function' ? t() : t;
  return { dir: aim64(tables, selfY, selfX, ty, tx, mut), carry: false }; // $242016
}

/** `$24202C` -- aim64 at the record's target, SELF read from `($2,A6)`.
 *  37 call sites; the recon's 886 rows through it matched with NO offset. */
export function aim64AtTarget(t, ram, a5, a6) {
  const sel = targetSelect(ram, a5);                 // $24202C bsr $24270A
  if (sel.carry) return { dir: 0, carry: true };     // $242030 bcs
  const ty = ram.u16(sel.addr + 2);                  // $242032
  const tx = ram.u16(sel.addr + 4);
  const sy = ram.u16(a6 + 2);                        // $242038 movem.w ($2,A6),D0-D1
  const sx = ram.u16(a6 + 4);
  return { dir: aim64(t, sy, sx, ty, tx), carry: false };
}

/** `$242178` -- `$24202C` + one slew step, STORED into `($1B,A6)`. 8 sites. */
export function aim64TurnStore(t, ram, a5, a6) {
  const r = aim64AtTarget(t, ram, a5, a6);           // $242178 bsr $24202C
  if (r.carry) return { dir: 0, carry: true };       // $24217C bcs $242184 (rts)
  const d1 = slew64FromRecord(ram, a6, r.dir);       // $24217E bsr $24218C
  ram.setU8(a6 + 0x1b, d1 & 0xff);                   // $242180 move.b D1,($1B,A6)
  return { dir: d1, carry: false };
}

/** `$24226E` -- aim256 at the record's target, self from the CALLER. 48 sites. */
export function aim256FromCaller(t, ram, a5, selfY, selfX) {
  const sel = targetSelect(ram, a5);                 // $24226E bsr $24270A
  if (sel.carry) return { dir: 0, carry: true };
  const ty = ram.u16(sel.addr + 2);                  // $242274
  const tx = ram.u16(sel.addr + 4);
  return { dir: aim256(t, selfY, selfX, ty, tx), carry: false };
}

/** `$242290` -- aim256 at the record's target, self from `($2,A6)`. 21 sites. */
export function aim256AtTarget(t, ram, a5, a6) {
  const sel = targetSelect(ram, a5);                 // $242290 bsr $24270A
  if (sel.carry) return { dir: 0, carry: true };
  const ty = ram.u16(sel.addr + 2);                  // $242296
  const tx = ram.u16(sel.addr + 4);
  const sy = ram.u16(a6 + 2);                        // $24229C
  const sx = ram.u16(a6 + 4);
  return { dir: aim256(t, sy, sx, ty, tx), carry: false };
}

// ------------------------------------------------------------- the slew limiter

/**
 * `$242190` -- THE ONE-STEP SLEW.  84 call sites: the single most-called entry
 * in the library, and the reason a turret ROTATES instead of snapping.
 *
 *   242190: moveq #$3F,D2 / and.w D2,D0 / and.w D2,D1
 *   242196: sub.b D0,D1 / beq  (already there)
 *   24219A: addq.b #1,D0 / and.w D2,D1        assume ONE STEP UP
 *   24219E: cmpi.w #$20,D1 / bcs              is that the short way round?
 *   2421A4: subq.b #2,D0                      no -- ONE STEP DOWN
 *   2421A6: and.w D2,D0 / move.w D0,D1 / rts
 *
 * Note `sub.b` and `addq.b`/`subq.b`: the arithmetic is BYTE-wide inside a
 * routine whose mask is 6 bits, which is why the final `and.w D2,D0` is not
 * redundant -- `0 - 1` is `$FF` and `$FF & $3F` is `$3F`, the wrap.
 *
 * ONE step is 5.625 degrees. The cost of getting this wrong is not subtle:
 * without it every turret in the game points exactly at the ship every frame.
 *
 * @returns {number} the new facing, 0..63.
 */
export function slew64(cur, target) {
  let d0 = cur & 0x3f;                               // $242190 moveq #$3F,D2
  let d1 = target & 0x3f;                            // $242194 and.w D2,D1
  d1 = (d1 - d0) & 0xff;                             // $242196 sub.b D0,D1
  if (d1 === 0) return d0 & 0x3f;                    // $242198 beq -> move.w D0,D1
  d0 = (d0 + 1) & 0xff;                              // $24219A addq.b #1,D0
  d1 &= 0x3f;                                        // $24219C and.w D2,D1
  if (d1 >= 0x20) d0 = (d0 - 2) & 0xff;              // $24219E cmpi/bcs / subq.b #2
  return d0 & 0x3f;                                  // $2421A6 and.w D2,D0
}

/** `$24218C` -- `$242190` with the current facing taken from `($1B,A6)`. */
export function slew64FromRecord(ram, a6, target) {
  return slew64(ram.u8(a6 + 0x1b), target);          // $24218C move.b ($1B,A6),D0
}

/**
 * `$2421AC` -- the 256-step slew.  Same shape, `cmpi.b #$80` instead of
 * `#$20`, mask `$FF` instead of `$3F`, and the current facing ALWAYS from
 * `($1B,A6)` (there is no register-argument twin the way `$242190` is
 * `$24218C`'s).  2 call sites.
 */
export function slew256(ram, a6, target) {
  let d0 = ram.u8(a6 + 0x1b);                        // $2421AC move.b ($1B,A6),D0
  let d1 = (target - d0) & 0xff;                     // $2421B0 sub.b D0,D1
  if (d1 === 0) return d0 & 0xff;                    // $2421B2 beq
  d0 = (d0 + 1) & 0xff;                              // $2421B4 addq.b #1,D0
  if (d1 >= 0x80) d0 = (d0 - 2) & 0xff;              // $2421B6 cmpi.b #$80 / bcs
  return d0 & 0xff;                                  // $2421C0 andi.w #$FF,D1
}

/** `$2421C6` / `$242206` -- the MULTI-step slews (up to D5 steps). Both dead. */
export function slew64Multi() { deadEntry(0x2421c6, 'the multi-step 64 slew'); }
export function slew256Multi() { deadEntry(0x242206, 'the multi-step 256 slew'); }

/** `$242018` / `$242022` -- aim64 at a FIXED player. Both dead. */
export function aim64AtP2Fixed() { deadEntry(0x242018, 'aim64 at P2, fixed'); }
export function aim64AtP1Fixed() { deadEntry(0x242022, 'aim64 at P1, fixed'); }
/** `$24227C` / `$242286` -- the aim256 twins of the above. Both dead. */
export function aim256AtP2Fixed() { deadEntry(0x24227c, 'aim256 at P2, fixed'); }
export function aim256AtP1Fixed() { deadEntry(0x242286, 'aim256 at P1, fixed'); }
