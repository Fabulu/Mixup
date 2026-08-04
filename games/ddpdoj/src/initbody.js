// THE 21 STAGE-1 INIT BODIES (at init+8) -- the routines that turn enemy stats
// into DATA.  Each one calls the two prototype loaders `$2637A2`/`$26377A`
// (src/enemyproto.js, ported W20) to copy hitbox/HP/speed/heading/palette/
// animation/draw-bucket out of ROM, then runs a handful of bespoke per-type
// adjustments (rank/stage HP and palette biases, heading-indexed sprite/bucket
// tables, stage-kill gates that free the enemy).
//
// ===================== THE +8 RULE (absolute, W22) ==========================
// Every one of the 256 type-table entries is an 8-byte stub
// `move.w #N,($4,A5) / rts`; the real init is the SECOND ENTRY POINT at
// init+8, reached by `$26361A addq.w #8,A1 / $263650 jsr (A1)`.  spawn.js's
// `initDispatch` resolves init+8 and calls `runInitBody` -- which dispatches
// here.  A port that runs only the stub writes the run-length and NOTHING else.
//
// ======================= WHAT IS FAITHFULLY PORTED =========================
// The loader calls and the bespoke stats adjustments that touch the done-when
// fields (hitbox/HP/speed/heading/palette/bucket): every arithmetic op, every
// table lookup, every stage-kill gate (`jmp $263762` -> free the enemy), every
// rank/loop/stage branch.  Cited by ROM address on every non-obvious line.
//
// ===================== WHAT THROWS, AND WHY (named) ========================
// `$263808` -- the movement-script INITIAL-position reader -- is a deliberate
// no-op NOTE: it reads resource #$1F (resolved through the IGS027A protection
// at `$246CAC`, not portable without the resource base, W24).  Position
// (+$02/+$04) is NOT a done-when field.  For the five aim->bucket types
// ($80/$82/$85/$88/$89) the spawn-time BUCKET depends on the spawn position
// through the aim; that bucket field is a NAMED W24 gap, not a silence.
// `$259554` (the boss state machine, W30) and `$24150A` (a resource-data
// install) are noted, not thrown, because they do not touch the done-when
// fields at spawn.

import { unreached } from './unported.js';
import { initArms, stepArms } from './midboss.js';
import { u16, i16 } from './ram.js';
import { loadRecordProto, loadSubProto } from './enemyproto.js';
import { readMovementInit } from './movement.js';

// ----------------------------------------------------------- the record layout
// A5 = enemy record, A6 = sub-record (= ($6,A5)).  The offsets the init bodies
// touch, named once here so every body reads as the listing does.
const R = {
  // record (A5)
  rec16: 0x16, rec18: 0x18, rec1A: 0x1a, rec1C: 0x1c, rec1D: 0x1d, rec1E: 0x1e,
  rec20: 0x20, rec21: 0x21, rec22: 0x22, rec23: 0x23, rec24: 0x24, rec25: 0x25,
  rec26: 0x26, rec28: 0x28, rec29: 0x29, rec2A: 0x2a, rec2C: 0x2c, rec2D: 0x2d,
  rec2E: 0x2e, rec2F: 0x2f, rec31: 0x31, rec32: 0x32, rec33: 0x33, rec34: 0x34,
  rec35: 0x35, rec36: 0x36, rec44: 0x44, handler: 0x4c, runLen: 0x04,
  subRec: 0x06, movement: 0x12, typeByte: 0x0c, classByte: 0x0d,
};
// sub-record (A6)
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, f06: 0x06, hit10: 0x10, hp: 0x18,
  speed: 0x1a, heading: 0x1b, palette: 0x1d, anim: 0x1e, f1f: 0x1f, f08: 0x08,
  f31: 0x31, f2e: 0x2e, hit14: 0x14, hit16: 0x16, f38: 0x38,
};

// ------------------------------------------------------------- the globals read
// The bespoke adjustments branch on these.  The gate seeds them from the board
// at spawn; the live frame loop will own them once their writers are ported.
const G = {
  stage: 0x813092, loop: 0x813094, rank98: 0x813098, scrollClock: 0x8130ce,
  // the rank/power HP & palette bias words the init bodies subtract
  b2: 0x8130b2, b4: 0x8130b4, b6: 0x8130b6, b8: 0x8130b8, ba: 0x8130ba,
  bc: 0x8130bc, ae: 0x8130ae,
  // the per-stage "midboss/boss spawned" kill flags (set by $0D/$0E init)
  d8: 0x8130d8, da: 0x8130da, dc: 0x8130dc, de: 0x8130de, e0: 0x8130e0,
  e2: 0x8130e2, e4: 0x8130e4, e6: 0x8130e6, f6: 0x8130f6,
  // $242E24's rank byte source + its increment side-effect
  rankReg: 0x803916, rankCtr: 0x803917,
  scrollDelta: 0x813172,
};

// ----------------------------------------------------------- $263762: free me
// The "free this enemy" routine every stage-kill gate `jmp`s to.  It marks each
// sub-record dead (byte +0 := 1) and clears the type word (`clr.w (A5)`), so
// the driver's `tst.w (A5); beq` skips the slot.  A freed enemy does not appear
// at the pre-handler capture point on either side.
export function freeEnemy(ram, a5) {
  const a6 = ram.u32(a5 + R.subRec);                 // $263762 movea.l ($6,A5),A6
  const run = ram.u16(a5 + R.runLen);                // $263768 move.w ($4,A5),D1
  for (let i = 0; i <= run; i++) {                   // $263772 dbra D1
    ram.setU8(a6 + i * 0x20, 1);                     // $26376c move.b D0,(A6)
  }
  ram.setU16(a5, 0);                                 // $263776 clr.w (A5)
}

// -------------------------------------------------- $263808: initial position
// The movement-script INITIAL reader, run once at spawn from every init body.
// Reads the spawn X,Y from the 4-byte stream prefix, consumes any run of
// SPEED/ESCAPE opcodes, stops at the FIRST HEAD (storing it as the heading),
// applies the spawn Y-odometer adjust, zeroes the frame counter, and sets the
// velocity-dirty bit.  The stream pointer at ($12,A5) is resolved by the spawn
// walker (`resolveMovementPtr` = resource base + aux[idx], recon §2).  When the
// pointer is 0 (a script-less enemy) the reader is a no-op ($26380C beq).
// Ported in src/movement.js (W24); the speed/heading/anim/flags overrides W23
// deferred close through this call.
export function readInitPosition(ram, rom, a5, unported) {
  readMovementInit(ram, rom, a5, unported);
}

// --------------------------------------------------------- $242E24: rank adjust
// `addq.b #1,$803917 / moveq #$7f,D0 / and.w $803916,D0 / lea $242E42 /
//  move.b (A0,D0.w),D0` -- returns a rank byte from table $242E42 indexed by
// $803916 & $7F.  Type $11 halves it and adds it to the bucket word (+$28).
function rankByte242E24(ram, rom) {
  ram.setU8(G.rankCtr, (ram.u8(G.rankCtr) + 1) & 0xff);   // $242E24 addq.b #1
  const d0 = rom.u8(0x242E42 + (ram.u16(G.rankReg) & 0x7f)); // $242E3A move.b (A0,D0)
  return d0;
}

// ------------------------------------------- the heading-indexed table lookup
// `move.b ($1b,A6),D1 / andi.w #$3e,D1 / add.w D1,D1 / move.l (A0,D1.w),...`:
// 16 directions, a longword every 4 bytes.  Returns the ROM address offset by
// the quantised heading so the caller reads a 4-byte sprite/bucket pointer.
function headingLongAddr(rom, table, heading) {
  const d1 = (heading & 0x3e) << 1;                 // andi #$3e; add.w D1,D1
  return table + d1;
}

// ============================================================ THE 21 BODIES
// Each is `function(ram, rom, a5, a6, unported) -> undefined | FREED`.  `a6` is
// the sub-record base ($6,A5); it is re-read after $263808 in some bodies
// because the loader's A6 is the FIRST sub-record and a body may reset it.
const FREED = Symbol('freed');

// ---------------------------------------------- the damage-first family spine
// Types $05/$07/$08/$09/$0B/$27 share this shape.  The per-type data:
//   subTab, recTab, initBody, and the stage-kill ladder (which stage flags gate
//   which stage).  Translated once, parameterised.
function damageFirstFamily(ram, rom, a5, a6, unported, p) {
  const stage = ram.u16(G.stage);
  // the stage-kill prologue: per-stage, `cmpi #$S,$813092 / bne skip / tst.w
  // $gate / beq skip / jmp $263762` -- if the gate flag is set, free the enemy.
  for (const [s, gate] of p.killStages) {
    if (stage === s && ram.u16(gate) !== 0) { freeEnemy(ram, a5); return FREED; }
  }
  // $2637A2: load the sub-record prototype (hitbox/HP/speed/heading/palette).
  loadSubProto(ram, rom, a5, a6, p.subTab);            // lea sub; jsr $2637A2
  // $26377A: load D0+1 words of record prototype (HP reload, buckets).
  loadRecordProto(ram, rom, a5, p.recTab, p.recD0);    // lea rec; move.w #N,D0; jsr
  // $...: copy record byte +$2A into sub-record palette +$1D.  The record's
  // +$2A holds the bucket emitter low bits AND the default palette byte; this
  // makes the sub-record palette track the record's draw bucket.
  ram.setU8(a6 + S.palette, ram.u8(a5 + 0x2a));        // move.b ($2a,A5),($1d,A6)
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24 no-op)
  // the heading-indexed sprite + bucket tables $269E48 / $269EC8.
  const d1q = (ram.u8(a6 + S.heading) & 0x3e) << 1;
  const sp = headingLongAddr(rom, 0x269E48, ram.u8(a6 + S.heading));
  ram.setU32(a6 + 0x0a, rom.u32(sp));                  // move.l (A0,D1.w),($a,A6)
  const bp = headingLongAddr(rom, 0x269EC8, ram.u8(a6 + S.heading));
  ram.setU32(a5 + 0x2c, rom.u32(bp));                  // move.l (A0,D1.w),($2c,A5)
  // $269C32: btst.b #$5, $c(A5) -- if the enemy's TYPE byte (record +$0C) bit 5
  // is set, call $242A80 (an aim routine).  Not a done-when field; noted.
  // (W23 review F3: was +$0D `classByte` -- off-by-one; the ROM tests +$0C.)
  if ((ram.u8(a5 + R.typeByte) & 0x20) !== 0) {
    unported?.note(0x242a80, `$242A80 aim (type-bit-5) in damage-first init `
      + `$${p.initBody.toString(16).toUpperCase()} -- writes to record sprite `
      + `fields, not a done-when stat`);
  }
  // the bespoke per-type extras (facing/HP), then the stage-kill tail.
  return p.tail(ram, rom, a5, a6, unported, stage);
}

// --------------------------------------------------------- type $11 (104 records)
// $26871C.  The commonest stage-1 enemy: script-mover, aims, turns.
function init11(ram, rom, a5, a6, unported) {
  loadSubProto(ram, rom, a5, a6, 0x268828);            // $268722 jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x268808, 0x0f);       // $268730 jsr $26377A (D0=$F)
  // $268736: D0 = $8130B2; sub.b D0,($28,A5) and sub.b D0,($1a,A5).
  let d0 = ram.u16(G.b2) & 0xff;
  ram.setU8(a5 + R.rec28, (ram.u8(a5 + R.rec28) - d0) & 0xff);  // sub.b D0,($28,A5)
  ram.setU8(a5 + R.rec1A, (ram.u8(a5 + R.rec1A) - d0) & 0xff);  // sub.b D0,($1a,A5)
  // $268744: jsr $242E24 (rank byte); lsr.b #1,D0; add.b D0,($28,A5).
  d0 = rankByte242E24(ram, rom) >> 1;                  // $26874A lsr.b #1,D0
  ram.setU8(a5 + R.rec28, (ram.u8(a5 + R.rec28) + d0) & 0xff);  // add.b D0,($28,A5)
  // $268750: D0 = $8130BC >> 4; sub.b D0,($18,A5).
  d0 = (ram.u16(G.bc) & 0xff) >> 4;
  ram.setU8(a5 + R.rec18, (ram.u8(a5 + R.rec18) - d0) & 0xff);  // sub.b D0,($18,A5)
  // $26875C: stage-1 / clock >= $159 -> override the bucket word.
  if (ram.u16(G.stage) === 1 && i16(ram.u16(G.scrollClock)) >= 0x159) {
    let e = 0x30 - (ram.u16(G.ba) & 0xff) - 6;         // $268772 sub.w $8130BA; subq #6
    ram.setU8(a5 + R.rec28, e & 0xff);                 // $26877A move.b D0,($28,A5)
  }
  readInitPosition(ram, rom, a5, unported);                 // $26877E jsr $263808 (W24)
  // $268784: stage-2 sets sub +$1F := 2 (the bucket-table index).
  if (ram.u16(G.stage) === 2) ram.setU8(a6 + S.f1f, 2);  // move.b #$2,($1f,A6)
  // $268796: bucket emitter pair from $267F70 indexed by (sub +$1F)<<3.
  const f = ram.u8(a6 + S.f1f);
  const btab = 0x267F70 + (f << 3);
  ram.setU32(a5 + R.rec2A, rom.u32(btab));             // move.l (A0)+,($2a,A5)
  ram.setU32(a5 + R.rec2E, rom.u32(btab + 4));         // move.l (A0),($2e,A5)
  // $2687B0: anim double (if non-zero) -- tst.b ($1e,A6); beq; move.b; add.w D1,D1.
  if (ram.u8(a6 + S.anim) !== 0) {
    ram.setU8(a6 + S.anim, (ram.u8(a6 + S.anim) * 2) & 0xff);  // d241 add.w D1,D1
  }
  // $2687C0: re-read A6 (the loader's A6 == ($6,A5) still; the ROM re-fetches
  // after $263808, which may have walked the pointer.  Here it is unchanged.)
  // $2687C4: record +$33 := heading; then heading+1 quantised for the sprite.
  ram.setU8(a5 + R.rec33, ram.u8(a6 + S.heading));     // move.b D1,($33,A5)
  let d1 = (ram.u8(a6 + S.heading) + 1) & 0x3e;
  const sp = 0x268C9E + (d1 << 1);                     // add.w D1,D1 (x2 of the quantised)
  ram.setU32(a5 + R.rec22, rom.u32(sp));               // move.l (A0,D1.w),($22,A5)
  // $2687E0: palette byte from $2687FE indexed by $813094 (loop word).
  const lp = ram.u16(G.loop);
  const pal = 0x2687FE + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));              // move.b (A0),($1d,A6)
  ram.setU8(a5 + R.rec34, rom.u8(pal));                // move.b (A0)+,($34,A5)
  ram.setU8(a5 + R.rec35, rom.u8(pal + 1));            // move.b (A0)+,($35,A5)
}

// --------------------------------------------------------- type $10 (16 records)
// $2680B8.  Same shape as $11 with the per-type palette/HP globals.
function init10(ram, rom, a5, a6, unported) {
  loadSubProto(ram, rom, a5, a6, 0x2681B2);            // $2680BE jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x268192, 0x0f);       // $2680CC jsr $26377A (D0=$F)
  // $2680D2: D0 = $813092; lsr.w #1; addq #2 -> record +$1C and +$1D.
  const stageHalf = (ram.u16(G.stage) >> 1) + 2;
  ram.setU8(a5 + R.rec1C, stageHalf & 0xff);           // move.b D0,($1c,A5)
  ram.setU8(a5 + R.rec1D, stageHalf & 0xff);           // move.b D0,($1d,A5)
  // $2680E4: D0 = $8130B4; sub.b D0,($28,A5).
  let d0 = ram.u16(G.b4) & 0xff;
  ram.setU8(a5 + R.rec28, (ram.u8(a5 + R.rec28) - d0) & 0xff);
  // $2680EE: D0 = $8130BC >> 4; sub.b D0,($19,A5).
  d0 = (ram.u16(G.bc) & 0xff) >> 4;
  ram.setU8(a5 + 0x19, (ram.u8(a5 + 0x19) - d0) & 0xff);
  readInitPosition(ram, rom, a5, unported);                 // $2680FA jsr $263808 (W24)
  // $268100: position-X >= $7600 -> record +$32 := 1 (a draw flag, not stats).
  if (i16(ram.u16(a6 + S.posX)) >= 0x7600) ram.setU8(a5 + R.rec32, 1);
  // $26810E: stage-2 sets sub +$1F := 2.
  if (ram.u16(G.stage) === 2) ram.setU8(a6 + S.f1f, 2);
  // $268120: bucket pair from $267F70 indexed by (sub +$1F)<<3.
  const f = ram.u8(a6 + S.f1f);
  const btab = 0x267F70 + (f << 3);
  ram.setU32(a5 + R.rec2A, rom.u32(btab));
  ram.setU32(a5 + R.rec2E, rom.u32(btab + 4));
  // $26813A: anim double.
  if (ram.u8(a6 + S.anim) !== 0) ram.setU8(a6 + S.anim, (ram.u8(a6 + S.anim) * 2) & 0xff);
  // $26814A: re-fetch A6 (unchanged), heading -> record +$33, sprite from $268694.
  ram.setU8(a5 + R.rec33, ram.u8(a6 + S.heading));
  const d1 = (ram.u8(a6 + S.heading) + 1) & 0x3e;
  ram.setU32(a5 + R.rec22, rom.u32(0x268694 + (d1 << 1)));
  // $26816A: palette from $268188 indexed by $813094.
  const lp = ram.u16(G.loop);
  const pal = 0x268188 + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec34, rom.u8(pal));
  ram.setU8(a5 + R.rec35, rom.u8(pal + 1));
}

// ----------------------------------------------- the damage-first per-type tails
// After the shared spine, each type writes its facing fields then a HP adjust
// (`move.w $8130BA,D0 / subq #8 / sub.b D0,($18,A5)`) and a stage-kill tail.
function dmgTailFacing(ram, a5, a6) {
  // $07/$27/$08/$09/$0B: facing from heading+0x20 quantised, +$24202C result.
  const d0 = (ram.u8(a6 + S.heading) + 0x20) & 0x3c;  // addi.b #$20; andi.b #$3c
  ram.setU8(a5 + R.rec22, d0);                          // move.b D0,($22,A5)
  // $24202C sets D1 (carry clears it to the prior value); the body stores D1 to
  // +$23.  $24202C is the aim-at-target routine (W20); at spawn (W24 position)
  // we keep the prototype's +$23 -- noted, not a done-when field for HP/palette.
}
function hpAdjustBA(ram, a5) {
  // move.w $8130BA,D0 / subq.b #8,D0 / sub.b D0,($18,A5)
  const d0 = ((ram.u16(G.ba) & 0xff) - 8) & 0xff;
  ram.setU8(a5 + R.rec18, (ram.u8(a5 + R.rec18) - d0) & 0xff);
}

// =========================================================== the dispatch table
// init+8 address -> body function.  Built bottom-up; the damage-first family
// shares `damageFirstFamily` with per-type parameters.
const BODY = new Map();

// --- type $05 ($269BCE): killStages [(1,$8130D8),(4,...ladder)]; HP adjust.
BODY.set(0x269BCE, (ram, rom, a5, a6, unported) => damageFirstFamily(ram, rom, a5, a6, unported, {
  subTab: 0x269CCE, recTab: 0x269CB4, recD0: 0x0c, initBody: 0x269BCE,
  killStages: [[1, G.d8]],
  tail(ram, rom, a5, a6, unported, stage) {
    hpAdjustBA(ram, a5);
    // $269C4C: stage-4 kill ladder on $8130DA/$8130DC/$8130DE/$8130E0/$8130E2.
    if (stage === 4) {
      for (const g of [G.da, G.dc, G.de, G.e0, G.e2]) {
        if (ram.u16(g) !== 0) { freeEnemy(ram, a5); return FREED; }
      }
    }
  },
}));
// --- type $07 / $27 ($26A1EA, alias pair): killStages [(1,d8),(2,f6)]; tail.
BODY.set(0x26A1EA, (ram, rom, a5, a6, unported) => damageFirstFamily(ram, rom, a5, a6, unported, {
  subTab: 0x26A2C6, recTab: 0x26A2B0, recD0: 0x0a, initBody: 0x26A1EA,
  killStages: [[1, G.d8], [2, G.f6]],
  tail(ram, rom, a5, a6, unported, stage) {
    dmgTailFacing(ram, a5, a6);
    // $24202C stores D1 -> +$23 (aim; noted in the spine).  We mirror the ROM's
    // default-arm: D1 := $20 if the aim carried (bcc not taken).
    ram.setU8(a5 + R.rec23, 0x20);                      // $26A28A moveq #$20,D1 (the bcc-taken arm)
    hpAdjustBA(ram, a5);
    // $26A29C: stage-2 -> HP byte +$18 := $0A.
    if (stage === 2) ram.setU8(a5 + R.rec18, 0x0a);     // move.b #$a,($18,A5)
  },
}));
// --- type $08 ($26A4BC): killStages [(1,d8),(2,f6)]; stage-4 kill ladder.
BODY.set(0x26A4BC, (ram, rom, a5, a6, unported) => damageFirstFamily(ram, rom, a5, a6, unported, {
  subTab: 0x26A5C8, recTab: 0x26A5B2, recD0: 0x0a, initBody: 0x26A4BC,
  killStages: [[1, G.d8], [2, G.f6]],
  tail(ram, rom, a5, a6, unported, stage) {
    dmgTailFacing(ram, a5, a6);
    ram.setU8(a5 + R.rec23, 0x20);
    hpAdjustBA(ram, a5);
    if (stage === 4) {
      for (const g of [G.e0, G.e2, G.e4, G.e6]) {
        if (ram.u16(g) !== 0) { freeEnemy(ram, a5); return FREED; }
      }
    }
  },
}));
// --- type $09 ($26A794): killStages [(1,d8)].
BODY.set(0x26A794, (ram, rom, a5, a6, unported) => damageFirstFamily(ram, rom, a5, a6, unported, {
  subTab: 0x26A844, recTab: 0x26A82E, recD0: 0x0a, initBody: 0x26A794,
  killStages: [[1, G.d8]],
  tail(ram, rom, a5, a6, unported) {
    dmgTailFacing(ram, a5, a6);
    ram.setU8(a5 + R.rec23, 0x20);
    hpAdjustBA(ram, a5);
  },
}));
// --- type $0B ($26ABA0): killStages [(1,d8),(2,f6)]; a long stage-4 clock ladder.
BODY.set(0x26ABA0, (ram, rom, a5, a6, unported) => damageFirstFamily(ram, rom, a5, a6, unported, {
  subTab: 0x26AD0C, recTab: 0x26ACF6, recD0: 0x0a, initBody: 0x26ABA0,
  killStages: [[1, G.d8], [2, G.f6]],
  tail(ram, rom, a5, a6, unported, stage) {
    dmgTailFacing(ram, a5, a6);
    ram.setU8(a5 + R.rec23, 0x20);
    hpAdjustBA(ram, a5);
    if (stage === 4) {
      const clk = i16(ram.u16(G.scrollClock));
      // $26AC5E: clk >= $290 && $8130E6 -> free; the $1FC..$240 window ladder.
      if (clk >= 0x290 && ram.u16(G.e6) !== 0) { freeEnemy(ram, a5); return FREED; }
      if (clk > 0x1fc) {
        if (clk < 0x240 || clk > 0x274) {
          if (ram.u16(G.e0) !== 0) { freeEnemy(ram, a5); return FREED; }
        }
        if (ram.u16(G.e2) !== 0 && clk > 0x228) { freeEnemy(ram, a5); return FREED; }
        if (ram.u16(G.e4) !== 0) { freeEnemy(ram, a5); return FREED; }
        if (ram.u16(G.e6) !== 0) { freeEnemy(ram, a5); return FREED; }
      }
    }
  },
}));

// --- type $11 / $10 (defined above as named functions).
BODY.set(0x26871C, init11);
BODY.set(0x2680B8, init10);

// --- type $8A ($2766AE): scroll-locked ground gun.  Loaders, position, a small
// anim/record fixup.  No bucket table.
BODY.set(0x2766AE, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x2766E6);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x2766E0, 0x02);       // moveq #$2,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  // $2766CE: if sub anim (+$1E) != 0, clear it and set record +$1A := $40.
  if (ram.u8(a6 + S.anim) !== 0) {
    ram.setU8(a6 + S.anim, 0);                          // clr.b ($1e,A6)
    ram.setU16(a5 + R.rec1A, 0x40);                     // move.w #$40,($1a,A5)
  }
});

// --- type $8B ($276824): scroll-locked ground gun.  Stage/clock gate that may
// clear the sub-record flags word (a draw disable).
BODY.set(0x276824, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x276862);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x27685E, 0x01);       // moveq #$1,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  // $276844: stage-1 && clock < 4 -> sub flags := $8000 (mark hidden).
  if (ram.u16(G.stage) === 1 && i16(ram.u16(G.scrollClock)) < 4) {
    ram.setU16(a6, 0x8000);                             // move.w #$8000,(A6)
  }
});

// --- type $20 / $21 ($272A4A, scripted carriers).  Sub-proto only; the body
// reads up to three params from the movement script ($12,A5).  The movement
// pointer is W24, so the param reads are noted; the record fields they write
// (+$16/+$18/+$1A) are NOT loader-written, so the port leaves them at the
// pool default and the gate sees the prototype's sub-record stats unchanged.
BODY.set(0x272A4A, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x272A90);            // jsr $2637A2
  unported?.note(0x272A56, `scripted-carrier param read from movement script `
    + `($12,A5) at $272A56 -- W4 (resource #$1F); record +$16/+$18/+$1A params `
    + `are not loader-written and not in the done-when set`);
});

// --- type $24 ($296FB0): boss-approach prop.  Sub-proto, resource install,
// record clears, position.  The resource install ($24150A) is noted (data).
BODY.set(0x296FB0, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x296FF2);            // jsr $2637A2
  unported?.note(0x24150a, `resource install $24150A (#$13 <- $222BF8) in type `
    + `$24 init -- a data resource, not a done-when stat`);
  ram.setU16(a5 + R.rec18, 0);                          // move.w #$0,($18,A5)
  ram.setU16(a5 + R.rec1A, 0);                          // move.w #$0,($1a,A5)
  ram.setU16(a5 + R.rec1C, 0x0120);                     // move.w #$120,($1c,A5)
  ram.setU16(a5 + R.rec1E, 0);                          // move.w #$0,($1e,A5)
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
});

// --- type $31 ($269754): boss-approach prop.  Loaders, fixed position, a
// palette lookup from $2697B0/$2697BA indexed by $813094, two resource installs.
BODY.set(0x269754, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x2697DA);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x2697CE, 0x05);       // moveq #$5,D0; jsr $26377A
  ram.setU32(a6 + S.posX, 0x40001c00);                 // move.l #$40001c00,($2,A6)
  unported?.note(0x28ca60, `$28CA60 in type $31 init -- bespoke; not a stat`);
  unported?.note(0x24150a, `resource installs $24150A in type $31 init (data)`);
  const lp = ram.u16(G.loop);
  // $26978A: `move.w (A1,D6.w),D0 / move.b D0,($1d,A6)` -- reads a WORD at
  // $2697B0+lp and takes its LOW byte (not a direct byte read like $11/$80).
  ram.setU8(a6 + S.palette, rom.u16(0x2697B0 + lp) & 0xff);
});

// --- the aim->bucket types.  Each calls $24200A (or $24202C) with a per-site
// muzzle offset, stores the aim direction to a record sprite field, and reads
// the bucket emitter from a 16-long table indexed by the quantised direction.
// Because $263808 is a W24 no-op, the position (and thus the aim direction) is
// the pool default; the bucket field tracks a W24 position (NAMED gap).

// type $80 ($273802): runLen 1, sprite/bucket from $272F7A, palette $273922.
BODY.set(0x273802, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27394E);            // jsr $2637A2
  ram.setU32(a5 + R.rec44, 0x27394E + 28);             // move.l A0,($44,A5) (A0 past sub)
  loadRecordProto(ram, rom, a5, 0x27392C, 0x10);       // moveq #$10,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  if (ram.u16(G.rank98) !== 0) {                        // $273826 tst.w $813098
    ram.setU16(a6 + S.hp, 0x1200);                      // move.w #$1200,($18,A6)
    ram.setU16(a6 + S.f38, 0x1200);                     // move.w #$1200,($38,A6)
  }
  unported?.note(0x24200a, `$24200A aim in type $80 init -- bucket field tracks `
    + `the W24 spawn position through the aim`);
  // the aim sets D1 (or falls back to heading); store to +$2D, quantise, read
  // the bucket from $272F7A.  Position is W24 -> we use the heading fallback.
  let d1 = ram.u8(a6 + S.heading);                      // bcc not taken (aim W24)
  ram.setU8(a5 + R.rec2D, d1);                          // move.b D1,($2d,A5)
  d1 = (d1 & 0x3e) << 1;
  ram.setU32(a5 + R.rec28, rom.u32(0x272F7A + d1));     // move.l (A2,D1.w),($28,A5)
  // $273894: +$34 := $10, +$35 := $04 (stage>1 keeps the same here).
  ram.setU8(a5 + R.rec34, 0x10);
  ram.setU8(a5 + R.rec35, 0x04);
  // $2738B6: stage-4 bespoke block (a draw-state override) -- not done-when.
  // $2738F0: D0 = $8130BA; sub.b D0,($1e,A5); then $8130BA-8 -> +$22.
  let d0 = ram.u16(G.ba) & 0xff;
  ram.setU8(a5 + R.rec1E, (ram.u8(a5 + R.rec1E) - d0) & 0xff);
  ram.setU8(a5 + R.rec22, (ram.u8(a5 + R.rec22) - ((d0 - 8) & 0xff)) & 0xff);
  // $273906: palette from $273922 indexed by $813094.
  const lp = ram.u16(G.loop);
  const pal = 0x273922 + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));
});

// type $82 ($27462A): runLen 1, sprite/bucket from $272DFA, palette $27474A.
BODY.set(0x27462A, (ram, rom, a5, a6, unported) => {
  if (ram.u16(G.stage) === 0 && ram.u16(G.d8) !== 0) { freeEnemy(ram, a5); return FREED; }
  loadSubProto(ram, rom, a5, a6, 0x274770);            // jsr $2637A2
  ram.setU32(a5 + R.rec44, 0x274770 + 28);
  loadRecordProto(ram, rom, a5, 0x274754, 0x0d);       // moveq #$d,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  unported?.note(0x24200a, `$24200A aim in type $82 init -- bucket tracks W24 pos`);
  let d1 = ram.u8(a6 + S.heading);
  ram.setU8(a5 + R.rec2D, d1);
  d1 = (d1 & 0x3e) << 1;
  ram.setU32(a5 + R.rec28, rom.u32(0x272DFA + d1));
  ram.setU8(a5 + 0x2e, 0x04);                           // move.b #$4,($2e,A5)
  ram.setU8(a5 + 0x2f, 0x05);                           // move.b #$5,($2f,A5)
  let d0 = ram.u16(G.b8) & 0xff;
  ram.setU8(a5 + R.rec1E, (ram.u8(a5 + R.rec1E) - d0) & 0xff);  // $8130B8 -> +$1E
  d0 = ram.u16(G.b4) & 0xff;
  ram.setU8(a5 + 0x1f, (ram.u8(a5 + 0x1f) - d0) & 0xff);        // $8130B4 -> +$1F
  d0 = ram.u16(G.b8) & 0xff;
  ram.setU8(a5 + R.rec22, (ram.u8(a5 + R.rec22) - d0) & 0xff);  // $8130B8 -> +$22
  if (ram.u16(G.rank98) !== 0)                          // subi.b #$10,($22,A5)
    ram.setU8(a5 + R.rec22, (ram.u8(a5 + R.rec22) - 0x10) & 0xff);
  d0 = ram.u16(G.b2) & 0xff;
  ram.setU8(a5 + R.rec23, (ram.u8(a5 + R.rec23) - d0) & 0xff);  // $8130B2 -> +$23
  const lp = ram.u16(G.loop);
  const pal = 0x27474A + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));
  if (ram.u16(G.stage) === 4) {
    for (const g of [G.da, G.dc, G.de]) {
      if (ram.u16(g) !== 0) { freeEnemy(ram, a5); return FREED; }
    }
  }
});

// type $85 ($27581A): runLen 1, sprite/bucket from $272DFA, palette $275890.
BODY.set(0x27581A, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x2758B0);            // jsr $2637A2
  ram.setU32(a5 + R.rec44, 0x2758B0 + 28);
  loadRecordProto(ram, rom, a5, 0x27589A, 0x0a);       // moveq #$a,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  unported?.note(0x24200a, `$24200A aim in type $85 init -- bucket tracks W24 pos`);
  let d1 = ram.u8(a6 + S.heading);
  ram.setU8(a5 + R.rec29, d1);                          // move.b D1,($29,A5)
  d1 = (d1 & 0x3e) << 1;
  ram.setU32(a5 + 0x24, rom.u32(0x272DFA + d1));        // move.l (A2,D1.w),($24,A5)
  let d0 = ram.u16(G.b6) & 0xff;
  ram.setU8(a5 + R.rec1E, (ram.u8(a5 + R.rec1E) - d0) & 0xff);  // $8130B6 -> +$1E
  const lp = ram.u16(G.loop);
  const pal = 0x275890 + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));
});

// type $88 ($275DA0): runLen 1, sprite/bucket from $272D7A (x2), sub-rec
// sprite from $2763D8, palette $275EA2.
BODY.set(0x275DA0, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x275ECC);            // jsr $2637A2
  ram.setU32(a5 + R.rec44, 0x275ECC + 28);
  loadRecordProto(ram, rom, a5, 0x275EAC, 0x0f);       // moveq #$f,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  unported?.note(0x24200a, `$24200A aim in type $88 init -- bucket tracks W24 pos`);
  let d1 = ram.u8(a6 + S.heading);
  ram.setU8(a5 + R.rec29, d1);
  d1 = (d1 & 0x3e) << 1;
  ram.setU32(a5 + 0x24, rom.u32(0x272D7A + d1));        // first bucket pair
  // second aim (mirror); the ROM re-aims with -D1 offset; heading fallback.
  let d1b = ram.u8(a6 + S.heading);
  ram.setU8(a5 + R.rec2F, d1b);
  d1b = (d1b & 0x3e) << 1;
  ram.setU32(a5 + R.rec2A, rom.u32(0x272D7A + d1b));    // second bucket pair
  ram.setU8(a5 + R.rec31, 0x04);                        // move.b #$4,($31,A5) (stage>1 same)
  if (ram.u16(G.rank98) !== 0) {                         // $273834 tst.w $813098
    ram.setU8(a5 + R.rec20, (ram.u8(a5 + R.rec20) + 1) & 0xff);
    ram.setU8(a5 + R.rec21, (ram.u8(a5 + R.rec21) + 1) & 0xff);
  }
  // $275E46: sub-record sprite from $2763D8 indexed by (sub +$28) word.
  const sw = ram.u16(a6 + 0x28);
  ram.setU32(a6 + 0x2a, rom.u32(0x2763D8 + sw));        // move.l (A0,D0.w),($2a,A6)
  let d0 = ram.u16(G.ae) & 0xff;
  ram.setU8(a5 + R.rec1E, (ram.u8(a5 + R.rec1E) - d0) & 0xff);  // $8130AE -> +$1E
  const lp = ram.u16(G.loop);
  const pal = 0x275EA2 + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));
  // $275E7A: the tail -- if the sub-record flags byte bit 5 is clear, install
  // a hitbox override: +$2E := 1, copy anim to +$31, write $F400 to +$14 (if
  // anim != 0) or +$16 (if anim == 0), then clear anim.  (Which word gets the
  // $F400 tracks anim, a movement-script field (W24); the write itself is here.)
  if ((ram.u8(a6) & 0x20) === 0) {                     // $275E7A btst #$5,(A6)
    ram.setU16(a6 + S.f2e, 1);                         // $275E80 move.w #$1,($2e,A6)
    const an = ram.u8(a6 + S.anim);
    ram.setU8(a6 + S.f31, an);                         // $275E86 move.b ($1e,A6),($31,A6)
    ram.setU16(a6 + (an !== 0 ? S.hit14 : S.hit16), 0xf400); // $275E98 move.w #$f400,(A0)
    ram.setU8(a6 + S.anim, 0);                         // $275E9C clr.b ($1e,A6)
  }
});

// type $89 ($277278): sprite via $24202C + $272E7A, palette $27730C.
BODY.set(0x277278, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x277322);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x277316, 0x05);       // moveq #$5,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  // $277298: stage-0 (==0 here is stage 1, since $813092 stage-1 stores 1) and
  // clock >= $156 -> sub HP +$18 := $280.  (The ROM tests stage==0 which is the
  // attract/track; in stage 1 $813092==1 so this arm is not taken.)
  if (ram.u16(G.stage) === 0 && i16(ram.u16(G.scrollClock)) >= 0x156) {
    ram.setU16(a6 + S.hp, 0x0280);                      // move.w #$280,($18,A6)
  }
  unported?.note(0x24202c, `$24202C aim in type $89 init -- sprite tracks W24 pos`);
  let d1 = ram.u8(a6 + S.heading);                      // bcc-taken fallback
  ram.setU8(a5 + R.rec21, d1);                          // move.b D1,($21,A5)
  d1 = (d1 & 0x3e) << 1;
  ram.setU32(a6 + 0x0a, rom.u32(0x272E7A + d1));        // move.l (A0,D1.w),($a,A6)
  ram.setU8(a5 + 0x17, 0x04);                           // move.b #$4,($17,A5)
  let d0 = ram.u16(G.b4) & 0xff;
  ram.setU8(a5 + R.rec1A, (ram.u8(a5 + R.rec1A) - d0) & 0xff);  // $8130B4 -> +$1A
  const lp = ram.u16(G.loop);
  const pal = 0x27730C + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + 0x18, rom.u8(pal));
  ram.setU8(a5 + 0x19, rom.u8(pal + 1));
});

// --- type $0D ($26B484): THE MIDBOSS (runLen 16).  Loaders, position, the two
// bespoke midboss sub-routines are noted (they set up the midboss's multi-part
// body, not done-when stats), and it SETS $8130D8/$8130DA -- the stage-kill
// flags the regulars gate on.  Those writes ARE ported (semantically load-bearing
// for which spawns land after the midboss).
BODY.set(0x26B484, (ram, rom, a5, a6, unported, tables) => {
  loadSubProto(ram, rom, a5, a6, 0x26B50E);            // jsr $2637A2
  ram.setU32(a5 + R.rec44, 0x26B50E + 28 * 17);        // move.l A0,($44,A5)
  loadRecordProto(ram, rom, a5, 0x26B4FA, 0x09);       // move.w #$9,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
  ram.setU16(a6 + S.posX, u16(i16(ram.u16(a6 + S.posX)) + 0x0a40));  // addi.w #$a40,($2,A6)
  // W31: BOTH `bsr`s are now RUN, and neither was "not a stat".
  //   $26B4B0 bsr $26B286 -- writes ($1B,A4)/($29,A4) for all eight arms AND
  //     ends `bsr $26B2AC`, which takes FOUR draws off the shared $803917
  //     counter (3x $2431F4, 1x $242FDE).  Noting it left the port four draws
  //     behind the board from the midboss's spawn frame onwards -- the `rng`
  //     column, not a cosmetic.
  //   $26B4B4 bsr $26B304 -- one step of the swing machine and the initial
  //     PLACEMENT of all eight arms.  The board runs it TWICE on the spawn
  //     frame (once here, once from the handler, which the driver reaches on
  //     the same frame); running it once would leave ($1C,A5) a step behind
  //     for the whole life of the boss.
  initArms(ram, rom, a5, a6);                           // $26B4B0 bsr $26B286
  if (!tables) {
    unreached(0x26b4b4, `the MIDBOSS init body reached $26B4B4 bsr $26B304 `
      + `without a MoveTables. Its arm placement reads $241D34 (speed level `
      + `$70), so the caller must pass \`tables\` through runInitBodyAddr -- `
      + `see src/enemyframe.js. Refusing to place the arms silently`);
  }
  stepArms(ram, rom, a5, a6, tables);                   // $26B4B4 bsr $26B304
  ram.setU16(G.d8, 1);                                  // move.w #$1,$8130d8  (LOAD-BEARING)
  ram.setU16(G.da, 0);                                  // move.w #$0,$8130da
  unported?.note(0x24150a, `midboss resource installs $24150A (#$10/11/15) -- data`);
});

// --- type $0E ($2926E2): THE BOSS (runLen 8).  Loaders, fixed entry position,
// the bespoke boss state-machine install ($259554, W30) and resource installs
// are noted (they build RAM tables / scroll lock / the HP bar accumulator --
// none are done-when SPAWN stats).  The boss's spawn hitbox/HP/speed/heading/
// palette/anim come entirely from its prototype, which the loaders copy.
BODY.set(0x2926E2, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x292806);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x2927F6, 0x07);       // moveq #$7,D0; jsr $26377A
  ram.setU32(a6 + S.posX, 0x97fffe00);                  // move.l #$97fffe00,($2,A6)
  ram.setU16(a6 + S.posY, u16(i16(ram.u16(a6 + S.posY)) - i16(ram.u16(G.scrollDelta))));
  unported?.note(0x259554, `boss state-machine install $259554 (five tables) -- W30`);
  unported?.note(0x2598e6, `boss bespoke $2598E6 -- W30`);
  unported?.note(0x25980c, `boss bespoke $25980C -- W30`);
  unported?.note(0x24150a, `boss resource installs $24150A (#$11/12/15/16/17) -- data`);
  unported?.note(0x294ad6, `boss bespoke $294AD6/$294EEA/$294F0A -- W30`);
});

// ============================================================ the entry point
/** Run the init+8 body at `addr`.  Replaces spawn.js's throwing stub.  Returns
 *  FREED if the body freed the enemy (a stage-kill gate fired); otherwise
 *  undefined.  An unknown address is a LOUD NAMED THROW (never a silence). */
// W31: `tables` is APPENDED, not inserted, and every existing call site is
// unaffected.  Exactly one body needs it -- the MIDBOSS's `$26B4B4 bsr
// $26B304`, whose arm placement reads `$241D34`.  A caller that omits it
// reaches a LOUD NAMED THROW inside that body rather than a silent skip.
export function runInitBodyAddr(addr, ram, rom, a5, unported, tables) {
  const a6 = ram.u32(a5 + R.subRec);                  // A6 = ($6,A5)
  const fn = BODY.get(addr);
  if (!fn) {
    unreached(addr, `init+8 body at $${addr.toString(16).toUpperCase()} -- not in `
      + `the W23 stage-1 body table (21 bodies). Either a non-stage-1 type was `
      + `spawned, or a body was missed; do NOT smooth`);
  }
  const r = fn(ram, rom, a5, a6, unported, tables);
  return r === FREED ? FREED : undefined;
}

export const INIT_BODY_FREED = FREED;
export const INIT_BODY_ADDRESSES = [...BODY.keys()];
