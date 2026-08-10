// THE PORTED ENEMY INIT BODIES (at init+8) -- the routines that turn enemy stats
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
import { installScripts, a2Run2598E6, a2RunAll2598FE,
  a4Start25980C } from './scheduler.js';
import { loadRecordProto, loadSubProto } from './enemyproto.js';
import { readMovementInit } from './movement.js';
import { install24150A } from './palette.js';
import { AimTables, aim64AtTarget, aim64FromCaller, aim256, targetSelect } from './aim.js';
import { drawByte242B3C, drawByte242E24, drawWord242EC2,
  drawWord24328E, drawByte24311A, drawByte2431F4,
  drawLong243A9C } from './rng.js';
import { loadAnimObjects246410 } from './animobjects.js';
import { initType99_29E580 } from './boss3type99.js';

// ----------------------------------------------------------- the record layout
// A5 = enemy record, A6 = sub-record (= ($6,A5)).  The offsets the init bodies
// touch, named once here so every body reads as the listing does.
const R = {
  // record (A5)
  rec16: 0x16, rec17: 0x17, rec18: 0x18, rec19: 0x19, rec1A: 0x1a,
  rec1B: 0x1b, rec1C: 0x1c,
  rec1D: 0x1d, rec1E: 0x1e,
  rec20: 0x20, rec21: 0x21, rec22: 0x22, rec23: 0x23, rec24: 0x24, rec25: 0x25,
  rec26: 0x26, rec28: 0x28, rec29: 0x29, rec2A: 0x2a, rec2B: 0x2b,
  rec2C: 0x2c, rec2D: 0x2d,
  rec2E: 0x2e, rec2F: 0x2f, rec30: 0x30, rec31: 0x31, rec32: 0x32,
  rec33: 0x33, rec34: 0x34,
  rec35: 0x35, rec36: 0x36, rec38: 0x38, rec3A: 0x3a,
  rec44: 0x44, handler: 0x4c, runLen: 0x04,
  subRec: 0x06, movement: 0x12, typeByte: 0x0c, classByte: 0x0d,
};
// sub-record (A6)
const S = {
  flags: 0x00, posX: 0x02, posY: 0x04, f06: 0x06, sprite0a: 0x0a,
  hit10: 0x10, hp: 0x18,
  speed: 0x1a, heading: 0x1b, f1c: 0x1c, palette: 0x1d, anim: 0x1e,
  f1f: 0x1f, f08: 0x08,
  f31: 0x31, f2e: 0x2e, hit14: 0x14, hit16: 0x16, f38: 0x38,
};

// ------------------------------------------------------------- the globals read
// The bespoke adjustments branch on these.  The gate seeds them from the board
// at spawn; the live frame loop will own them once their writers are ported.
const G = {
  stage: 0x813092, stageX2: 0x813094, rank98: 0x813098, scrollClock: 0x8130ce,
  // the rank/power HP & palette bias words the init bodies subtract
  b2: 0x8130b2, b4: 0x8130b4, b6: 0x8130b6, b8: 0x8130b8, ba: 0x8130ba,
  bc: 0x8130bc, ae: 0x8130ae,
  // the per-stage "midboss/boss spawned" kill flags (set by $0D/$0E init)
  d8: 0x8130d8, da: 0x8130da, dc: 0x8130dc, de: 0x8130de, e0: 0x8130e0,
  e2: 0x8130e2, e4: 0x8130e4, e6: 0x8130e6, f6: 0x8130f6,
  f2: 0x8130f2, f4: 0x8130f4,
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

// ------------------------------------------------- $24150A, from an init body
//
// **WAVE 92, AND IT IS THE SEAM W91 §5.1 NAMED RATHER THAN THE ANALYSIS.**  Ten
// of the eleven `jsr $24150A` sites inside this file's four bodies had been
// counted notes since W23: the colour was in the cartridge the whole time and
// nothing carried a `PaletteState` down here.  `palette` is now threaded from
// `Game` through `runEnemyFrame` -> `runSpawnWalker` -> `dispatchScriptRecord`/
// `processDeferred` -> `initDispatch` -> `runInitBody` -> `runInitBodyAddr`,
// six signatures, all APPENDED so no existing caller changed.
//
// A caller WITHOUT one keeps the counted note it always had, naming the bank
// and the block, so "this bank is still the recording's" stays visible instead
// of becoming a silent hole.  `install24150A` throws by address on a bank
// outside 0..31 and on a short ROM read; neither is clamped here.
function installBank(ram, rom, palette, unported, bank, block, site, what) {
  if (!palette) {
    unported?.note(0x24150a, `$${site.toString(16).toUpperCase()} jsr $24150A `
      + `-- ${what}: bank $${bank.toString(16).toUpperCase()} <- $${block
        .toString(16).toUpperCase()}. No PaletteState on this call chain, so `
      + `that bank stays whatever it was`);
    return;
  }
  install24150A(ram, palette, bank, rom.bytes(block, 64), site, what);
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
  // the heading-indexed BODY and ARM-B tables $269E48 / $269EC8.  W84: the
  // second one is the family's second draw arm's DESCRIPTOR, not a bucket
  // long -- see FAM.armBArt in handlers.js and the harvest row in export-web.
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
  // $2687B0: D1 still holds +$1F from the bucket lookup. A nonzero +$1E
  // replaces it; either way the doubled value is stored back unconditionally.
  let layer = f;
  if (ram.u8(a6 + S.anim) !== 0) layer = ram.u8(a6 + S.anim);
  ram.setU8(a6 + S.anim, (layer * 2) & 0xff);           // $2687BC move.b D1,+$1E
  // $2687C0: re-read A6 (the loader's A6 == ($6,A5) still; the ROM re-fetches
  // after $263808, which may have walked the pointer.  Here it is unchanged.)
  // $2687C4: record +$33 := heading; then heading+1 quantised for the sprite.
  ram.setU8(a5 + R.rec33, ram.u8(a6 + S.heading));     // move.b D1,($33,A5)
  let d1 = (ram.u8(a6 + S.heading) + 1) & 0x3e;
  const sp = 0x268C9E + (d1 << 1);                     // add.w D1,D1 (x2 of the quantised)
  ram.setU32(a5 + R.rec22, rom.u32(sp));               // move.l (A0,D1.w),($22,A5)
  // $2687E0: palette byte from $2687FE indexed by $813094 (loop word).
  const lp = ram.u16(G.stageX2);
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
  // $26813A..$268146: as in type $11, the bucket index in D1 survives when
  // +$1E is zero, and the doubled value is always stored.
  let layer = f;
  if (ram.u8(a6 + S.anim) !== 0) layer = ram.u8(a6 + S.anim);
  ram.setU8(a6 + S.anim, (layer * 2) & 0xff);
  // $26814A: re-fetch A6 (unchanged), heading -> record +$33, sprite from $268694.
  ram.setU8(a5 + R.rec33, ram.u8(a6 + S.heading));
  const d1 = (ram.u8(a6 + S.heading) + 1) & 0x3e;
  ram.setU32(a5 + R.rec22, rom.u32(0x268694 + (d1 << 1)));
  // $26816A: palette from $268188 indexed by $813094.
  const lp = ram.u16(G.stageX2);
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

// --- type $20 / $21 / $23 ($272A4A, THE SCRIPTED CARRIER).
//
// **W33 REPLACED A NOTE HERE WITH CODE, AND THE NOTE'S REASONING WAS WRONG.**
// It said the +$16/+$18/+$1A params "are not loader-written, so the port leaves
// them at the pool default".  They ARE loader-written -- by these very
// instructions -- and `$272AAC` reads all three every frame: +$16 is THE TYPE
// THIS CARRIER SPAWNS, +$18/+$19 the salvo count, +$1A/+$1B the spawn cooldown
// and its reload.  With them at the pool default the handler would spawn type 0
// forever.  The position at ($2,A6) comes from the same stream and nothing else
// writes it (this init does NOT call `$263808`).
//
//   $272A56 movea.l ($12,A5),A0      the movement-script pointer (W24 resolved)
//   $272A5A move.l (A0)+,($2,A6)     the spawn position
//   $272A5E..$272A64 D0 = D1 = D2 = $00FF
//   $272A66 and.w (A0)+,D0           param 1 -- the low byte only
//   $272A68 cmpi.w #$2,D0 / bne      THE ESCAPE: a param-1 of 2 is not a type
//   $272A6E move.w #$1,($8,A6)         it sets the no-scroll-compensate flag
//   $272A74/$272A78                    and the REAL type is the NEXT word
//   $272A7A and.w (A0)+,D1           param 2
//   $272A7C and.w (A0)+,D2           param 3
//   $272A7E/$272A82/$272A86          -> ($16,A5) ($18,A5) ($1A,A5), as WORDS
//   $272A8A move.l A0,($12,A5)       the stream pointer is CONSUMED, so this
//                                    type's ($12,A5) is no longer a movement
//                                    script -- and its handler never steps one.
//
// Each store is a WORD of a byte-sized value, so the HIGH byte of each pair
// lands as 0: ($1A,A5) = 0 and ($1B,A5) = param 3.  That is why the handler's
// `subq.b #$1,($1A,A5)` borrows on its very first frame and immediately
// reloads from ($1B,A5) -- transcribe the word stores, not what they "meant".
BODY.set(0x272A4A, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x272A90);            // jsr $2637A2
  let p = ram.u32(a5 + R.movement);                    // $272A56 movea.l ($12,A5),A0
  ram.setU32(a6 + S.posX, rom.u32(p)); p += 4;         // $272A5A move.l (A0)+,($2,A6)
  let d0 = rom.u16(p) & 0xff; p += 2;                  // $272A66 and.w (A0)+,D0
  if (d0 === 2) {                                      // $272A68 cmpi.w #$2 / bne
    ram.setU16(a6 + 0x08, 1);                          // $272A6E move.w #$1,($8,A6)
    d0 = rom.u16(p) & 0xff; p += 2;                    // $272A74/$272A78
  }
  const d1 = rom.u16(p) & 0xff; p += 2;                // $272A7A and.w (A0)+,D1
  const d2 = rom.u16(p) & 0xff; p += 2;                // $272A7C and.w (A0)+,D2
  ram.setU16(a5 + 0x16, d0);                           // $272A7E move.w D0,($16,A5)
  ram.setU16(a5 + 0x18, d1);                           // $272A82 move.w D1,($18,A5)
  ram.setU16(a5 + 0x1a, d2);                           // $272A86 move.w D2,($1A,A5)
  ram.setU32(a5 + R.movement, p);                      // $272A8A move.l A0,($12,A5)
  void unported;
});

// --- type $3E ($2653EE): the Stage-3 opening two-hitbox fighter. The loader
// copies two consecutive long-form sub prototypes because the registry stub's
// run length is one. Its only bespoke branch suppresses records in the narrow
// clock window after the Stage-3 phase latch has been set.
BODY.set(0x2653EE, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x26544E);            // $2653F4 jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x26543A, 0x09);       // $265400..$265406
  readInitPosition(ram, rom, a5, unported);            // $265408 jsr $263808
  const clock = i16(ram.u16(G.scrollClock));
  if (clock > 0x10 && clock < 0x36 && ram.u16(G.f2) !== 0) {
    freeEnemy(ram, a5);                                // $265430 jmp $263762
    return FREED;
  }
});

// --- type $3F ($2657A0): the dense Stage-3 two-hitbox wave. Its two
// prototypes feed the type-$3E draw table. Stage 5 replaces the script position
// with a fixed X; every stage then uses one cartridge RNG draw for Y.
BODY.set(0x2657A0, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x265818);            // $2657A0..$2657AC
  loadRecordProto(ram, rom, a5, 0x265804, 0x09);       // $2657AC..$2657BA
  if (ram.u16(G.stage) === 4) {                        // $2657BA
    ram.setU8(a5 + R.rec18, 0x0f);                    // $2657C6
    ram.setU8(a5 + R.rec19, 0x10);                    // $2657CC
    ram.setU32(a6 + S.posX, 0x74001c00);              // $2657D2
    ram.setU16(a6 + S.posY,
      u16(ram.u16(a6 + S.posY) - ram.u16(G.scrollDelta))); // $2657DA
  } else {
    readInitPosition(ram, rom, a5, unported);          // $2657E8
  }
  ram.setU16(a6 + S.posY,
    u16(drawWord24328E(ram, rom) + 0x1c00));           // $2657EE..$2657F8
  ram.setU16(a6 + S.speed, 0x2820);                    // $2657FC
});

// `$263678/$263690`, kept local to avoid making initbody.js and spawn.js import
// each other. This is the same 40-entry deferred queue the spawn walker drains.
function enqueueType15Child(ram, type, flags) {
  const countAt = 0x815ea8, base = 0x815eaa, dummy = 0x816b2a;
  const count = ram.u16(countAt);
  if (count === 0x0c80) return dummy;
  const q = base + count;
  ram.setU16(q + 2, type);
  ram.setU16(q + 4, flags);
  ram.setU32(q + 0x12, 0);
  ram.setU16(countAt, count + 0x50);
  return q;
}

// --- type $15 ($265BF4): four-piece carrier that creates one live type-$17
// child per entry, except clock $0168 which selects the four-sub type-$18.
BODY.set(0x265BF4, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x265c84);            // $265BF4..$265C00
  loadRecordProto(ram, rom, a5, 0x265c62, 0x10);       // $265C00..$265C0E
  readInitPosition(ram, rom, a5, unported);            // $265C0E
  const child18 = ram.u16(G.scrollClock) === 0x0168;
  const q = enqueueType15Child(ram, child18 ? 0x18 : 0x17,
    child18 ? 0x80 : 0x20);                            // $265C20/$265C46
  ram.setU32(q + 0x16, (ram.u32(a6 + S.posX) + 0x10000400) >>> 0);
  ram.setU32(q + 0x1a, ram.u32(a6 + S.speed));         // $265C28..$265C5A
});

// --- type $17 ($265DF0): two-sub child spawned by type $15.
BODY.set(0x265DF0, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x265e4c);
  ram.setU32(a6 + S.posX, ram.u32(a5 + 0x16));
  ram.setU16(a6 + S.speed, ram.u16(a5 + 0x1a));
  loadRecordProto(ram, rom, a5, 0x265e28, 0x11);
  ram.setU16(0x81b414, 1);
  ram.setU16(0x803934, 1);
});

// --- type $18 ($266324): four-sub child selected by the clock-$0168 carrier.
BODY.set(0x266324, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x266370);
  ram.setU32(a6 + S.posX, ram.u32(a5 + 0x16));
  ram.setU16(a6 + S.speed, ram.u16(a5 + 0x1a));
  loadRecordProto(ram, rom, a5, 0x26634c, 0x11);
});

// --- type $19 ($2671E8): invisible Stage-3 pulse controller. The script's
// movement index is structural only; this body fixes the controller position.
BODY.set(0x2671E8, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x26720a);
  ram.setU32(a6 + S.posX, 0x38001c00);
  ram.setU16(a5 + R.rec16, 0x0004);
  ram.setU16(a5 + R.rec18, 0x0303);
});

// --- type $36 ($263A58): Stage-3's seven-part carrier. All seven long-form
// prototypes are contiguous, and A0 after the load is the long-threshold cue
// cursor consumed by $28AC86 in the handler.
BODY.set(0x263A58, (ram, rom, a5, a6, unported) => {
  const cues = loadSubProto(ram, rom, a5, a6, 0x263B2C); // $263A58..$263A64
  ram.setU32(a5 + R.rec44, cues);                       // $263A64
  loadRecordProto(ram, rom, a5, 0x263B24, 0x03);       // $263A68..$263A74
  readInitPosition(ram, rom, a5, unported);            // $263A76
  for (const off of [0x40, 0x60, 0x80, 0xa0]) {
    ram.setU8(a6 + off + 0x1c, 0x10);                 // $263A7C..$263AA0
    ram.setU8(a6 + off + 0x1e, 0x0f);
  }

  const clock = ram.u16(G.scrollClock);
  if (clock === 0x26) {
    if (ram.u16(G.f4) !== 0) { freeEnemy(ram, a5); return FREED; }
    ram.setU16(G.f2, 1);                               // $263B1A
    return;
  }
  if (clock === 0x1b) {
    if (ram.u16(G.f6) !== 0) { freeEnemy(ram, a5); return FREED; }
    ram.setU8(a6 + 0xd9, 1);                          // $263B02
    ram.setU16(G.f4, 1);
    ram.setU16(G.f2, 1);
    return;
  }
  ram.setU16(G.f6, 1);                                // $263AE8
  ram.setU16(G.f4, 1);
  ram.setU16(G.f2, 1);
});

// --- type $37 ($264740): Stage-3's rotating three-shot fighter. The stub's
// run length is zero, so the single long-form prototype ends exactly where the
// shared `$2647A6` handler begins. Its initial position is biased after the
// movement stream has supplied the spawn coordinates.
BODY.set(0x264740, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x26478a);            // $264740..$26474C
  loadRecordProto(ram, rom, a5, 0x26476e, 0x0d);      // $26474C..$26475A
  readInitPosition(ram, rom, a5, unported);            // $264760
  ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) - 0x0280)); // $264766
  ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) - 0x0080)); // $26476A
});

// --- types $38/$39/$3A ($264C1C/$264C84/$264CEC): three data variants of
// type $37's shared rotating-body handler. Each owns one fixed hull and one
// long-form hitbox prototype; only the post-movement position bias differs.
function init37Variant(ram, rom, a5, a6, unported,
  subProto, recordProto, xBias, yBias = 0) {
  loadSubProto(ram, rom, a5, a6, subProto);
  loadRecordProto(ram, rom, a5, recordProto, 0x0d);
  readInitPosition(ram, rom, a5, unported);
  if (yBias !== 0)
    ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) - yBias));
  ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) - xBias));
}

BODY.set(0x264c1c, (ram, rom, a5, a6, unported) =>
  init37Variant(ram, rom, a5, a6, unported,
    0x264c60, 0x264c44, 0x0180));
BODY.set(0x264c84, (ram, rom, a5, a6, unported) =>
  init37Variant(ram, rom, a5, a6, unported,
    0x264cc8, 0x264cac, 0x0400));
BODY.set(0x264cec, (ram, rom, a5, a6, unported) =>
  init37Variant(ram, rom, a5, a6, unported,
    0x264d36, 0x264d1a, 0x0600, 0x0400));

// --- type $3C ($266968): Stage-3's opening/closing six-muzzle formation.
// The zero run length selects one sub-record. Everything else is data-driven:
// one long prototype, 18 record words, then the shared movement initializer.
BODY.set(0x266968, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x2669ae);            // $266968..$266974
  loadRecordProto(ram, rom, a5, 0x26698a, 0x11);      // $266974..$266982
  readInitPosition(ram, rom, a5, unported);            // $266982
});

// --- type $3B ($264D5A): Stage-3's four-satellite orbit formation.
BODY.set(0x264d5a, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x264e30);            // $264D5A..$264D66
  loadRecordProto(ram, rom, a5, 0x264e06, 0x14);      // $264D66..$264D74
  readInitPosition(ram, rom, a5, unported);            // $264D74
  ram.setU16(0x81b414, 1);
  const clock = ram.u16(G.scrollClock);
  ram.setU16(a5 + R.rec3A, clock);
  if (clock === 0x0048) {
    ram.setU16(G.d8, 1); ram.setU16(G.da, 1); ram.setU16(G.dc, 1);
  } else if (clock === 0x008d) ram.setU16(G.da, 1);
  else if (clock === 0x00ac) ram.setU16(G.dc, 1);
  if (clock === 0x0048 || clock === 0x008d || clock === 0x00ac) {
    ram.setU16(a6 + S.posX, u16(ram.u16(a6 + S.posX) + 0x0900));
    ram.setU16(a6 + S.posY, u16(ram.u16(a6 + S.posY) - 0x0100));
  }
  ram.setU8(a5 + R.rec38, i16(drawWord242EC2(ram, rom)) < 0 ? 2 : 0xfe);
});

// --- type $83 ($274B74): Stage-3's linked-hitbox aimed-ring enemy. W202.
BODY.set(0x274b74, (ram, rom, a5, a6, unported) => {
  const cue = loadSubProto(ram, rom, a5, a6, 0x274c2c);
  ram.setU32(a5 + R.rec44, cue);                       // $274B80
  loadRecordProto(ram, rom, a5, 0x274c0e, 0x0e);
  readInitPosition(ram, rom, a5, unported);

  const pal = 0x274c04 + ram.u16(G.stageX2);
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));
  if (ram.u16(G.rank98) === 0 && ram.u16(G.stage) <= 3) {
    ram.setU8(a5 + R.rec30, 0x18);
    ram.setU8(a5 + R.rec31, 0x10);
  } else {
    ram.setU8(a5 + R.rec30, 0x10);
    ram.setU8(a5 + R.rec31, 0x10);
  }
  if (ram.u16(G.stage) === 4)
    ram.setU16(a6 + S.hp, ram.u16(G.scrollClock) > 0x02e0 ? 0x0e80 : 0x1000);
});

// --- type $16 ($266D36): Stage-3's wobbling paired-shot formation. W203.
const TYPE16_AIM_TABLES = new WeakMap();
BODY.set(0x266d36, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x266d98);
  loadRecordProto(ram, rom, a5, 0x266d82, 0x0a);
  readInitPosition(ram, rom, a5, unported);
  let tables = TYPE16_AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); TYPE16_AIM_TABLES.set(rom, tables); }
  const aimed = aim64AtTarget(tables, ram, a5, a6);
  ram.setU8(a5 + R.rec22, aimed.carry ? ram.u8(a6 + S.heading) : aimed.dir);
  if (ram.u16(G.stage) === 4) {
    ram.setU16(a6, 0xa200);
    ram.setU8(a5 + R.rec18, 0x0f);
    ram.setU8(a5 + R.rec19, 0x10);
  }
});

// --- type $12 ($26C26E): Stage 3's seven-part carrier. W198.
//
// Unlike ordinary script enemies, the carrier ignores its movement pointer and
// enters from a fixed position. Its two child families are deferred records,
// so their init bodies live beside it below.
BODY.set(0x26c26e, (ram, rom, a5, a6, unported, tables, palette) => {
  void unported; void tables;
  const tail = loadSubProto(ram, rom, a5, a6, 0x26c30e); // seven long records
  ram.setU32(a5 + R.rec44, tail);                         // $26C286
  loadRecordProto(ram, rom, a5, 0x26c2f0, 0x0e);        // fifteen words
  ram.setU32(a6 + S.posX, 0xf0001c00);                  // fixed entrance

  // `$81585C` is a ten-position history. The init clears the interleaved
  // scratch longs too, even though the handler later shifts only the first ten.
  for (let n = 0; n < 10; n++) {
    ram.setU32(0x81585c + n * 8, 0xf0001c00);
    ram.setU32(0x815860 + n * 8, 0);
  }
  ram.setU16(G.f4, 1);
  ram.setU16(G.e0, 1);
  installBank(ram, rom, palette, unported, 0x12, 0x2234b8, 0x26c2b0,
    'type $12 root palette');
  installBank(ram, rom, palette, unported, 0x13, 0x2234f8, 0x26c2c2,
    'type $12 side palette');
  installBank(ram, rom, palette, unported, 0x0a, 0x223538, 0x26c2d4,
    'type $12 child palette');
});

// --- type $13 ($26D446): hatch-spawned expanding satellite. W198.
BODY.set(0x26d446, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x26d49a);
  ram.setU32(a6 + S.posX, ram.u32(a5 + R.rec16));
  ram.setU16(a6 + S.speed, ram.u16(a5 + R.rec1A));
  ram.setU8(a6 + S.heading,
    ram.u8(a6 + S.heading) + ((drawByte242B3C(ram, rom) * 2) & 0xff));
  ram.setU16(a5 + R.rec18, 0x0408);
  ram.setU16(a5 + R.rec1A, 0x0002);
  ram.setU16(a5 + R.rec1E, 0);
  ram.setU16(a5 + R.rec20, 0);
  ram.setU16(a5 + R.rec22, 0x0101);
  ram.setU16(a5 + R.rec24, 0);
  ram.setU8(a5 + R.rec26, 6);
  ram.setU8(a5 + R.rec16, 0);
});

// --- type $14 ($265A5C): the two-slot entrance curtain. W198.
BODY.set(0x265a5c, (ram, rom, a5, a6) => {
  loadRecordProto(ram, rom, a5, 0x265a96, 0x06);
  loadSubProto(ram, rom, a5, a6, 0x265aa4);
  const pos = u16(-0x0800 - ram.u16(0x813170));
  ram.setU16(a6 + S.posX, 0x7000);
  ram.setU16(a6 + S.posY, pos);
  ram.setU32(a6 + 0x22, ram.u32(a6 + S.posX));
});

// --- type $24 ($296FB0): boss-approach prop.  Sub-proto, resource install,
// record clears, position.  The resource install ($24150A) is noted (data).
BODY.set(0x296FB0, (ram, rom, a5, a6, unported, tables, palette) => {
  loadSubProto(ram, rom, a5, a6, 0x296FF2);            // jsr $2637A2
  // W92: `$296FBC lea $222BF8.l,A0 / moveq #$13,D0 / $296FC6 jsr $24150A`.
  installBank(ram, rom, palette, unported, 0x13, 0x222BF8, 0x296FC6,
    'enemy type $24\'s init body $296FB0');
  ram.setU16(a5 + R.rec18, 0);                          // move.w #$0,($18,A5)
  ram.setU16(a5 + R.rec1A, 0);                          // move.w #$0,($1a,A5)
  ram.setU16(a5 + R.rec1C, 0x0120);                     // move.w #$120,($1c,A5)
  ram.setU16(a5 + R.rec1E, 0);                          // move.w #$0,($1e,A5)
  readInitPosition(ram, rom, a5, unported);                  // jsr $263808 (W24)
});

// --- type $31 ($269754): boss-approach prop.  Loaders, fixed position, a
// palette lookup from $2697B0/$2697BA indexed by $813094, two resource installs.
BODY.set(0x269754, (ram, rom, a5, a6, unported, tables, palette) => {
  loadSubProto(ram, rom, a5, a6, 0x2697DA);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x2697CE, 0x05);       // moveq #$5,D0; jsr $26377A
  ram.setU32(a6 + S.posX, 0x40001c00);                 // move.l #$40001c00,($2,A6)
  unported?.note(0x28ca60, `$28CA60 in type $31 init -- bespoke; not a stat`);
  const lp = ram.u16(G.stageX2);
  // $26978A: `move.w (A1,D6.w),D0 / move.b D0,($1d,A6)` -- reads a WORD at
  // $2697B0+lp and takes its LOW byte (not a direct byte read like $11/$80).
  // **AND D0 IS STILL THAT WORD AT `$269792 jsr $24150A`** (W92): the ONE
  // read feeds the sub-record's palette byte and the colour bank number both,
  // which is why this site's bank is `None` in the exporter's PALETTE_SITES --
  // it comes out of a table, not an immediate.
  const bank1 = rom.u16(0x2697B0 + lp);
  ram.setU8(a6 + S.palette, bank1 & 0xff);             // $26978E
  installBank(ram, rom, palette, unported, bank1, 0x2251B8, 0x269792,
    'type $31\'s first install, bank from $2697B0[$813094]');
  // $269798 lea $2250B8.l,A0 / $2697A4 move.w ($2697BA,D6.w),D0 -- the second
  // install takes its bank from a DIFFERENT table and writes no record field.
  installBank(ram, rom, palette, unported, rom.u16(0x2697BA + lp), 0x2250B8,
    0x2697A8, 'type $31\'s second install, bank from $2697BA[$813094]');
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
  const lp = ram.u16(G.stageX2);
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
  const lp = ram.u16(G.stageX2);
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

// Types $85/$86 share both prototypes, the threshold-cue script and the aimed
// heading-art table. Their only init-body difference is the five-pair palette
// table selected by the two entry points below.
const TYPE85_86_AIM_TABLES = new WeakMap();
function init85Or86(ram, rom, a5, a6, unported, paletteTable) {
  const cue = loadSubProto(ram, rom, a5, a6, 0x2758B0); // jsr $2637A2
  ram.setU32(a5 + R.rec44, cue);                        // $275826/$275BC0
  loadRecordProto(ram, rom, a5, 0x27589A, 0x0a);       // moveq #$a,D0; jsr $26377A
  readInitPosition(ram, rom, a5, unported);             // jsr $263808

  let tables = TYPE85_86_AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); TYPE85_86_AIM_TABLES.set(rom, tables); }
  const aimed = aim64FromCaller(tables, ram, a5,
    u16(ram.u16(a6 + S.posX) + 0xf900), ram.u16(a6 + S.posY)); // jsr $24200A
  let d1 = aimed.carry ? ram.u8(a6 + S.heading) : aimed.dir;
  ram.setU8(a5 + R.rec29, d1);                          // move.b D1,($29,A5)
  d1 = (d1 & 0x3e) << 1;
  ram.setU32(a5 + 0x24, rom.u32(0x272DFA + d1));        // move.l (A2,D1.w),($24,A5)
  let d0 = ram.u16(G.b6) & 0xff;
  ram.setU8(a5 + R.rec1E, (ram.u8(a5 + R.rec1E) - d0) & 0xff);  // $8130B6 -> +$1E
  const lp = ram.u16(G.stageX2);
  const pal = paletteTable + lp;
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));
}

// type $85 ($27581A): runLen 1, palette $275890.
BODY.set(0x27581A, (ram, rom, a5, a6, unported) => {
  init85Or86(ram, rom, a5, a6, unported, 0x275890);
});

// type $86 ($275BB6): stage 2 entry point, palette $275C28. W182.
BODY.set(0x275BB6, (ram, rom, a5, a6, unported) => {
  init85Or86(ram, rom, a5, a6, unported, 0x275C28);
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
  const lp = ram.u16(G.stageX2);
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
  const lp = ram.u16(G.stageX2);
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
BODY.set(0x26B484, (ram, rom, a5, a6, unported, tables, palette) => {
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
  // W92: the MIDBOSS's three colour banks.  $26B4CC/$26B4DC/$26B4EC each
  // `lea <block>,A0 / move.w #<bank>,D0` and fall into $24150A.
  installBank(ram, rom, palette, unported, 0x10, 0x223338, 0x26B4D2,
    'the MIDBOSS, install 1 of 3');
  installBank(ram, rom, palette, unported, 0x11, 0x223378, 0x26B4E2,
    'the MIDBOSS, install 2 of 3');
  installBank(ram, rom, palette, unported, 0x0F, 0x2233B8, 0x26B4F2,
    'the MIDBOSS, install 3 of 3');
});

// --- type $1C ($26C1CA): WHAT THE MIDBOSS'S DEATH SPAWNS (runLen 0).  W57.
//
// `$26B7E0 moveq #$1C,D0 / $26B7E2 jsr $263684` is the ONLY enqueuer of type
// $1C in build B, so this body runs on exactly one frame per midboss death and
// on no other frame in stage 1.  It had never run in this port: until W51 gave
// the beam the ability to kill, no run in the corpus killed the midboss, and
// the first one that did stopped the LIVE PAGE with `UNPORTED $26C1C4` (W56).
//
// FIVE INSTRUCTIONS AND NO MOVEMENT READER.  It does NOT call `$263808`: the
// object's position is the LITERAL `$38001C00` written straight over
// ($2,A6)/($4,A6), so it is pinned to one place on the screen and has no
// movement script.  Every other stage-1 body in this file reads the stream.
BODY.set(0x26C1CA, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x26C1F0);            // $26C1CA lea / $26C1D0 jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x26C1EE, 0x00);       // $26C1D6 lea / $26C1DC moveq #$0,D0
  // $26C1E4 `move.l #$38001C00,$2(A6)` -- ONE longword over BOTH position
  // words: ($2,A6) := $3800 and ($4,A6) := $1C00.  Written as a longword
  // because that is the instruction; splitting it into two `move.w`s would be
  // the same bytes today and a different routine to read.
  ram.setU32(a6 + S.posX, 0x38001c00);                 // $26C1E4
});                                                    // $26C1EC rts

// --- type $0E ($2926E2): THE BOSS (runLen 8).  Loaders, fixed entry position,
// the bespoke boss state-machine install ($259554, W30) and resource installs
// are noted (they build RAM tables / scroll lock / the HP bar accumulator --
// none are done-when SPAWN stats).  The boss's spawn hitbox/HP/speed/heading/
// palette/anim come entirely from its prototype, which the loaders copy.
BODY.set(0x2926E2, (ram, rom, a5, a6, unported, tables, palette) => {
  loadSubProto(ram, rom, a5, a6, 0x292806);            // jsr $2637A2
  loadRecordProto(ram, rom, a5, 0x2927F6, 0x07);       // moveq #$7,D0; jsr $26377A
  ram.setU32(a6 + S.posX, 0x97fffe00);                  // move.l #$97fffe00,($2,A6)
  ram.setU16(a6 + S.posY, u16(i16(ram.u16(a6 + S.posY)) - i16(ram.u16(G.scrollDelta))));
  // W62 (S1): $259554 IS NOW REAL, and it is the one of this body's five notes
  // that had to become a call.  It INSTALLS FIVE TABLE POINTERS and RUNS
  // NOTHING -- every walk in `$2596C6` is gated on `tst.l <pointer>`, and the
  // A2 pre-fill it performs leaves each slot's RUN bit (bit 0) CLEAR.  Without
  // `$812A70` the A3 walk is skipped and D-script 6 -- the boss's death
  // animation, which is what fires `$2595E8` and ends the stage -- could never
  // step.
  installScripts(ram, rom, { a0: 0x293104, a1: 0x295856, a2: 0x292932,
    a3: 0x29370a, a4: 0x294f68 });                     // $29272E jsr $259554
  // ============ THE TWO ACTIVATIONS -- REAL SINCE W96, AND HERE IS THE HISTORY
  //
  // `$292734 moveq #$6,D0 / jsr $2598E6` arms A2 slot 6 (OBJECT routine
  // `$292F4A`, the boss's own sprite) and `$29273C moveq #$0,D0 / jsr $25980C`
  // starts F script 0 (`$294FA0`).  W62 counted both; W94 §7 measured that the
  // page therefore flies THROUGH the boss with no boss and no throw.
  //
  // **W95 SHIPPED THEM, MEASURED WHAT THEY COST, AND REVERTED THEM.  THE
  // MEASUREMENT IS THE POINT AND IT IS WHY THEY ARE STILL NOTES.**
  //
  //   [M] they WORK: in a real browser the boss's tables install at lf7,860,
  //       `$8129D0[6]` reads $8001 (OBJECT 6 armed) and `$812D3C` reads $8100
  //       (F script 0 claimed slot 0 and the walk set its "init has run" bit).
  //   [M] and then the port stops, by address, on `$294FA0` -- F script 0's
  //       INIT, which is the ARRIVAL (W94 §3B) and not the steady state.
  //   [M] the cost, all four of it: `pgm.py check` 72/2/0 -> 70/4/0 (`STAGE 1
  //       ENDS` and `THE CHAIN EXPIRES`, both of which fly past lf7,860 and
  //       both of which compare against the BOARD); the live page stops at
  //       lf7,860 where it used to reach lf15,611; and `stage1-sweep`'s
  //       lf8,000..8,250 goes RED -> BLOCKED.
  //   [M] and the benefit is ZERO, because the ladder SEEDS the scheduler's
  //       slot tables out of the board's own RAM -- the twelve run there
  //       whether or not this body arms anything, and they did: 43 blocked
  //       rungs -> 33 with these two lines OFF.
  //
  // > **SO THEY BELONG WITH 3B AND NOT BEFORE IT.**  Every path they open is
  // > the arrival's -- F 0, then `MAIN.start 0`, then `$293204`'s whole arm-up
  // > and OBJECT 0/1/6 and D 0..3.  Turning them on is one line each and the
  // > next wave inherits a measurement rather than a question.
  //
  // **W96 SHIPPED 3B's FIRST HALF AND TURNED THEM ON.**  `src/bossarrival.js`
  // is every path W95 listed above, and it is imported by `src/boss.js` for
  // exactly that reason.  This is the ONE line in the port whose behaviour
  // depends on that file existing, so it is named here rather than only there.
  a2Run2598E6(ram, 6);                                 // $292734/$292738
  a4Start25980C(ram, 0);                               // $29273C/$292740
  // W92: the BOSS's five.  Install 4 is $246BF8, the WHITE constant bank the
  // $24xxxx code segment holds as data -- comment ten's other half.
  installBank(ram, rom, palette, unported, 0x15, 0x222B38, 0x29274E,
    'the BOSS, install 1 of 5');
  installBank(ram, rom, palette, unported, 0x16, 0x222B78, 0x29275E,
    'the BOSS, install 2 of 5');
  installBank(ram, rom, palette, unported, 0x17, 0x222BB8, 0x29276E,
    'the BOSS, install 3 of 5');
  installBank(ram, rom, palette, unported, 0x12, 0x246BF8, 0x29277E,
    'the BOSS, install 4 of 5 -- the WHITE constant bank');
  installBank(ram, rom, palette, unported, 0x11, 0x222C38, 0x29278E,
    'the BOSS, install 5 of 5');
  unported?.note(0x294ad6, `boss bespoke $294AD6/$294EEA/$294F0A -- W30`);
});

// --- type $30 ($297120): THE STAGE-2 BOSS (runLen 11). W183.
//
// This closes the spawn-time layer and installs the boss's five scheduler
// tables. `boss2.js` owns the damage controller, A4 bootstrap and arrival MAIN
// 0, the five initially armed A3 scripts, and all eleven A2 draw objects.
BODY.set(0x297120, (ram, rom, a5, a6, unported, tables, palette) => {
  void tables;
  loadSubProto(ram, rom, a5, a6, 0x297248);            // $297120..$29712C
  loadRecordProto(ram, rom, a5, 0x297242, 0x02);       // $29712C..$29713C
  ram.setU32(a6 + S.posX, 0x9c001c00);                 // $29713C
  ram.setU16(a6 + S.posY,
    u16(ram.u16(a6 + S.posY) - ram.u16(G.scrollDelta))); // $297144..$29714A
  ram.setU16(0x803934, 0);                             // $29714E

  installScripts(ram, rom, {
    a0: 0x297950, a1: 0x2998ac, a2: 0x297432,
    a3: 0x297ee0, a4: 0x298c66,
  });                                                  // $297156..$29717A
  a2RunAll2598FE(ram);                                 // $29717A
  a4Start25980C(ram, 0);                              // $297180..$297186

  installBank(ram, rom, palette, unported, 0x10, 0x222c78, 0x297192,
    'the STAGE-2 BOSS, install 1 of 6');
  installBank(ram, rom, palette, unported, 0x11, 0x222cb8, 0x2971a2,
    'the STAGE-2 BOSS, install 2 of 6');
  installBank(ram, rom, palette, unported, 0x12, 0x222cf8, 0x2971b2,
    'the STAGE-2 BOSS, install 3 of 6');
  installBank(ram, rom, palette, unported, 0x17, 0x222d38, 0x2971c2,
    'the STAGE-2 BOSS, install 4 of 6');
  installBank(ram, rom, palette, unported, 0x13, 0x222db8, 0x2971d2,
    'the STAGE-2 BOSS, install 5 of 6');
  installBank(ram, rom, palette, unported, 0x16, 0x246bf8, 0x2971e2,
    'the STAGE-2 BOSS, install 6 of 6');

  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x05);       // $2971E8/$2971F0
  ram.setU32(0x81b626, 0x00000322);                   // $2971F8
  ram.setU32(0x81b62a, a5 + R.rec16);                 // $297202..$297208
  // $29830E is an RTS-only hook. $298BD2 arms boss damage ownership and
  // $298BEC marks the seven detachable component records inactive.
  ram.setU16(a6 + 0x148, 1);                          // $297212 -> $298BD2
  for (const off of [0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0x100])
    ram.setU16(a6 + off, 0x8000);                     // $297218 -> $298BEC
  ram.setU16(0x81b414, 1);                            // $29721E
  ram.setU16(0x81b416, 1);                            // $297226
  if (ram.u16(G.rank98) !== 0) ram.setU16(0x81b418, 1); // $29722E..$29723E
});

// --- type $1E ($296D8A): THE BOSS'S CARRIER (runLen 0).  W103.
//
// E 8 (`$2963A2`) spawns type $1E via `$263684`, writing the part position
// plus a bias into +$16, a speed/facing word into +$1A, and two script
// parameters into +$1C/+`$1E` of the deferred queue entry.  This body loads
// the sub-record prototype (HP/hitbox from `$296DBC`), copies the position
// and speed/facing from the record into the sub-record, and sets up the
// lifetime/sprite-cursor fields the handler `$296DD6` reads.
BODY.set(0x296d8a, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x296dbc);             // $296D8A lea / $296D90 jsr $2637A2
  ram.setU32(a6 + S.posX, ram.u32(a5 + 0x16));          // $296D96 move.l $16(a5),$2(a6)
  ram.setU16(a6 + S.speed, ram.u16(a5 + 0x1a));         // $296D9C move.w $1a(a5),$1a(a6)
  ram.setU16(a5 + 0x24, ram.u16(a5 + 0x1e));            // $296DA2 move.w $1e(a5),$24(a5)
  ram.setU16(a5 + 0x26, 0);                             // $296DA8 move.w #$0,$26(a5)
  ram.setU16(a5 + 0x1e, 0x0101);                        // $296DAE move.w #$101,$1e(a5)
  ram.setU16(a5 + 0x20, 0);                             // $296DB4 move.w #$0,$20(a5)
});

// --- type $4D ($29BB26): stage-2 boss satellite, queued by A3/D13. W185.
// The 28-byte prototype at $29BB4A deliberately overlaps the handler's first
// opcode word at $29BB64; loadSubProto reads that final `$4EB9` word exactly.
BODY.set(0x29bb26, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x29bb4a);             // $29BB26..$29BB32
  ram.setU32(a6 + S.posX, ram.u32(a5 + 0x16));          // $29BB32
  ram.setU8(a5 + 0x16, 0);                             // $29BB38 clr.b only
  ram.setU16(a5 + 0x1e, 0x0202);                       // $29BB3C
  ram.setU16(a5 + 0x20, 0);                            // $29BB42
});

// --- type $A0 ($29BBFC): THE STAGE-3 BOSS (runLen 9). W204.
// Installs its five scheduler tables, arms only draw object 9 and F0, uploads
// the six boss palettes, and seeds the linked damage controller. `boss3.js`
// owns the per-frame wrapper and the first live arrival scripts.
BODY.set(0x29bbfc, (ram, rom, a5, a6, unported, tables, palette) => {
  void tables;
  loadSubProto(ram, rom, a5, a6, 0x29bd10);            // $29BBFC..$29BC08
  loadRecordProto(ram, rom, a5, 0x29bd0a, 0x02);       // $29BC08..$29BC18
  ram.setU32(a6 + S.posX, 0x38001c00);                 // $29BC18
  installScripts(ram, rom, {
    a0: 0x29c2e0, a1: 0x29d24a, a2: 0x29be46,
    a3: 0x29c4ee, a4: 0x29cbd0,
  });                                                  // $29BC20..$29BC44
  a2Run2598E6(ram, 9);                                 // $29BC44
  a4Start25980C(ram, 0);                               // $29BC4C

  for (const [bank, src, site] of [
    [0x10, 0x222df8, 0x29bc54], [0x11, 0x222e38, 0x29bc64],
    [0x12, 0x222e78, 0x29bc74], [0x13, 0x222eb8, 0x29bc84],
    [0x14, 0x222ef8, 0x29bc94], [0x0a, 0x246bf8, 0x29bca4],
  ]) installBank(ram, rom, palette, unported, bank, src, site,
    'the STAGE-3 BOSS palette install');

  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x05);       // $29BCB4..$29BCC4
  ram.setU8(0x8130f9, ram.u8(0x8130f9) | 0x01);       // $29BCC4
  ram.setU32(0x81b626, 0x000004a0);                   // $29BCCC
  ram.setU32(0x81b62a, a5 + R.rec16);                 // $29BCD6
  for (const off of [0x00, 0x20, 0x40, 0xc0, 0xe0])
    ram.setU16(a6 + off, 0x8000);                      // $29BCE0 -> $29CB62
  ram.setU16(0x81b414, 1);                            // $29BCE6
  ram.setU16(0x81b416, 1);                            // $29BCEE
  if (ram.u16(G.rank98) !== 0) ram.setU16(0x81b418, 1); // $29BCF6..$29BD08
});

// Type `$99` is the live mirrored child pair created by the Stage-3 boss's
// low-HP E0 script. Its body falls directly into the handler, so the shared
// child module performs the first movement/opening/draw call here as well.
BODY.set(0x29e580, (ram, rom, a5, a6, unported, tables, _palette, soundPost) => {
  initType99_29E580(ram, rom, a5, a6, { unported, tables, soundPost });
});

// Type `$9A` is requested by the Stage-3 boss E3 leaf, but this registry row's
// mandatory init+8 body is only `jmp $263762`. The adjacent handler belongs to
// a dead alternate entry and is not reachable through type `$9A` in build B.
BODY.set(0x29eae2, (ram, _rom, a5) => {
  freeEnemy(ram, a5);
  return FREED;
});

// --- type $95 ($277836): THE FIRST STAGE-2-ONLY BODY.  W170.
//
// The 8-byte table entry at $27782E says run length 1, so $2637A2 consumes the
// two long-form sub-record prototypes at $27797E..$2779B6.  The record loader
// copies 13 words from $277964..$27797E.  Those exact ends matter: $2779B6 is
// the handler's first instruction, not more prototype data.
BODY.set(0x277836, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27797e);            // $277836/$27783C
  loadRecordProto(ram, rom, a5, 0x277964, 0x0c);       // $277842..$27784A
  readInitPosition(ram, rom, a5, unported);            // $277850 jsr $263808

  // `$813092` is zero-based: the attack reload is five through human stages
  // 1/2 (indices 0/1) and two from stage 3 on.
  ram.setU8(a5 + 0x2f, ram.u16(G.stage) <= 1 ? 5 : 2); // $277856..$277868
  ram.setU8(a5 + 0x2b,
    (ram.u8(a5 + 0x2b) - (ram.u16(G.ba) & 0xff)) & 0xff); // $27786C/$277872

  if (ram.u16(G.stage) === 1) {                        // $277876: stage 2
    const clock = ram.u16(G.scrollClock);
    if (clock >= 0x100 && clock < 0x16c && ram.u16(G.d8) !== 0) {
      freeEnemy(ram, a5); return FREED;                // $277880..$27789C
    }
    if (clock >= 0x80) ram.setU16(a6 + S.hp, 0x0680); // $2778A4..$2778AE
  }

  // $813094 is a raw BYTE offset into five two-byte palette pairs.  Do not
  // convert it to an array index: stage 1 reads bytes 0/1 and stage 3 reads 4/5.
  const pal = 0x27795a + ram.u16(G.stageX2);           // $2778B4..$2778C0
  ram.setU8(a6 + S.palette, rom.u8(pal));              // $2778C2
  ram.setU8(a5 + R.rec1A, rom.u8(pal));                // $2778C6
  ram.setU8(a5 + R.rec1B, rom.u8(pal + 1));            // $2778CA

  if (ram.u16(G.stage) !== 4) return;                  // $2778CE/$2778D6
  ram.setU16(a6 + S.hp, 0x0880);                       // $2778DA
  const clock = ram.u16(G.scrollClock);
  const gate = clock < 0x230 ? G.e0
    : clock < 0x250 ? G.e2
      : clock < 0x290 ? G.e4 : G.e6;                  // $2778E0..$277940
  // The final arm really compares against $240 after already proving clock is
  // at least $290.  It is redundant in this build and remains explicit here.
  if (ram.u16(gate) !== 0 && (gate !== G.e6 || clock > 0x240)) {
    freeEnemy(ram, a5); return FREED;                  // $2778F6/$914/$932/$950
  }
});

// --- type $8D ($276946): stage 2's bobbing aimed-firing enemy. W171.
//
// The run-length stub says zero, so the one 28-byte sub prototype at
// `$2769E6..$276A02` is exact. The record loader copies twelve words from
// `$2769CE..$2769E6`; `$276A02` is the handler, not prototype data.
const TYPE8D_AIM_TABLES = new WeakMap();
BODY.set(0x276946, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x2769e6);            // $276946/$27694C
  loadRecordProto(ram, rom, a5, 0x2769ce, 0x0b);       // $276952..$27695A
  readInitPosition(ram, rom, a5, unported);            // $276960

  let aimTables = TYPE8D_AIM_TABLES.get(rom);
  if (!aimTables) { aimTables = new AimTables(rom); TYPE8D_AIM_TABLES.set(rom, aimTables); }
  const aimed = aim64AtTarget(aimTables, ram, a5, a6); // $276966/$27696A
  // `$24202C` returns with carry when both players are dead and leaves D1 as
  // the caller supplied heading. Preserve that register behavior here.
  const d1 = aimed.carry ? ram.u8(a6 + S.heading) : aimed.dir;
  ram.setU8(a5 + R.rec25, d1);                         // $276970
  ram.setU32(a6 + 0x0a, rom.u32(0x276d50 + ((d1 & 0x3e) << 1))); // $276974..$276980

  ram.setU8(a5 + R.rec2B, drawWord242EC2(ram, rom));  // $276986..$27698C
  const rankBias = ((ram.u8(G.b6 + 1) - 4) & 0xff);
  ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1A) - rankBias); // $276990..$276998
  const rankByte = rankByte242E24(ram, rom);
  const signedHalf = ((rankByte << 24) >> 24) >> 1;    // $27699C/$2769A2 asr.b
  ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1A) + signedHalf); // $2769A4

  // `$813094` is stage index times two, an exact raw byte offset into five
  // palette pairs. It is not the second-loop flag.
  const pal = 0x2769c4 + ram.u16(G.stageX2);           // $2769A8..$2769B4
  ram.setU8(a6 + S.palette, rom.u8(pal));              // $2769B6
  ram.setU8(a5 + R.rec18, rom.u8(pal));                // $2769BA
  ram.setU8(a5 + R.rec19, rom.u8(pal + 1));            // $2769BE
});

// --- type $8F ($27751C): stage 2's 32-heading aimed-firing enemy. W172.
//
// The run-length stub is zero. `$2637A2` therefore copies exactly the one
// 28-byte sub prototype at `$2775B0..$2775CC`; `$26377A` copies six words from
// `$2775A4..$2775B0`. The five palette pairs immediately before those records
// are indexed by the raw stage-times-two byte offset in `$813094`.
const TYPE8F_AIM_TABLES = new WeakMap();
BODY.set(0x27751c, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x2775b0);            // $27751C/$277522
  loadRecordProto(ram, rom, a5, 0x2775a4, 0x05);       // $277528..$277530
  readInitPosition(ram, rom, a5, unported);            // $277536

  let aimTables = TYPE8F_AIM_TABLES.get(rom);
  if (!aimTables) { aimTables = new AimTables(rom); TYPE8F_AIM_TABLES.set(rom, aimTables); }
  const aimed = aim64AtTarget(aimTables, ram, a5, a6); // $27753C/$277540
  // `$24202C` preserves the caller's D1 on carry (both players dead).
  const d1 = aimed.carry ? ram.u8(a6 + S.heading) : aimed.dir;
  ram.setU8(a5 + R.rec21, d1);                         // $27754C
  ram.setU32(a6 + 0x0a, rom.u32(0x272efa + ((d1 & 0x3e) << 1))); // $277546..$277556

  // The ROM contains a redundant stage comparison whose two arms both load
  // four. Keeping the resulting constant explicit avoids inventing a rank arm.
  ram.setU8(a5 + 0x17, 4);                            // $27755C..$27756E
  const rankBias = u16(ram.u16(G.b6) - 4) & 0xff;
  ram.setU8(a5 + R.rec1A, ram.u8(a5 + R.rec1A) - rankBias); // $277572..$27757A

  const pal = 0x27759a + ram.u16(G.stageX2);           // $27757E..$27758A
  ram.setU8(a6 + S.palette, rom.u8(pal));              // $27758C
  ram.setU8(a5 + R.rec18, rom.u8(pal));                // $277590
  ram.setU8(a5 + R.rec19, rom.u8(pal + 1));            // $277594
});

// --- type $84 ($275154): stage 2's two-sub-record phased gunship. W173.
//
// The run-length stub is one. Both prototypes at `$27523E..$275276` use the
// long form, so `$2637A2` consumes exactly 56 bytes and leaves A0 on the cue
// threshold script. The init preserves that returned cursor at record +$44.
BODY.set(0x275154, (ram, rom, a5, a6, unported) => {
  const cueScript = loadSubProto(ram, rom, a5, a6, 0x27523e); // $275154..$27515A
  ram.setU32(a5 + R.rec44, cueScript);                  // $275160
  loadRecordProto(ram, rom, a5, 0x275222, 0x0d);       // $275164..$27516C
  readInitPosition(ram, rom, a5, unported);            // $275172

  const early = ram.u16(G.stage) <= 1;                 // $275178..$275192
  ram.setU8(a5 + R.rec2A, early ? 6 : 2);
  ram.setU8(a5 + R.rec2B, 5);
  const artCursor = ram.u16(a6 + 0x28);
  ram.setU32(a6 + 0x2a, rom.u32(0x2757ca + artCursor)); // $27519A..$2751A4
  ram.setU8(a5 + R.rec2E,
    ram.u8(a5 + R.rec2E) - (ram.u16(0x8130a8) & 0xff)); // $2751AA..$2751B0
  ram.setU8(a5 + R.rec1E,
    ram.u8(a5 + R.rec1E) - (ram.u16(G.ae) & 0xff));    // $2751B4..$2751BA

  const pal = 0x275218 + ram.u16(G.stageX2);           // $2751BE..$2751D4
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));

  if ((ram.u8(a6) & 0x20) === 0) {                    // $2751D8
    ram.setU16(a6 + 0x30, 1);
    const part = u16(ram.u8(a6 + S.anim) - 1);
    ram.setU16(a6 + 0x32, part);
    ram.setU16(a6 + (part === 0 ? 0x12 : 0x10), 0xf000);
    ram.setU8(a6 + S.anim, 0);
  }
  if (ram.u16(G.stage) === 4) ram.setU16(a6 + S.hp, 0x1400); // $275204..$275216
});

// --- type $90 ($27980A): stage 2's one-part damage-threshold enemy. W174.
//
// The one-entry stub at `$279802` makes `$2637A2` consume exactly the single
// 28-byte long-form prototype at `$27986C..$279888`.  The six-word record
// prototype and five stage palette pairs immediately precede it; `$279888` is
// handler code, so both data extents have code-backed far ends.
BODY.set(0x27980a, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27986c);            // $27980A..$279810
  loadRecordProto(ram, rom, a5, 0x279860, 0x05);       // $279816..$27981E
  readInitPosition(ram, rom, a5, unported);            // $279824

  const pal = 0x279856 + ram.u16(G.stageX2);           // $27982A..$279836
  ram.setU8(a6 + S.palette, rom.u8(pal));              // $279838
  ram.setU8(a5 + R.rec1A, rom.u8(pal));                // `$27983C` reads (A0)+
  ram.setU8(a5 + R.rec1B, rom.u8(pal + 1));            // `$279840` next byte
  if (ram.u16(G.rank98) !== 0) ram.setU16(a5 + R.rec1E, 0); // $279844..$27984E
});

// --- type $96 ($27A454): stage 2's 16-frame opening fan carrier. W175.
BODY.set(0x27a454, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27a4d2);            // $27A454..$27A45A
  loadRecordProto(ram, rom, a5, 0x27a4ba, 0x0b);       // $27A460..$27A468
  readInitPosition(ram, rom, a5, unported);            // $27A46E

  ram.setU8(a5 + R.rec17, ram.u16(G.stage) <= 1 ? 6 : 2); // $27A474..$27A486
  ram.setU8(a5 + R.rec1D,
    ram.u8(a5 + R.rec1D) - (ram.u16(G.bc) & 0xff));    // $27A48A..$27A490

  const pal = 0x27a4b0 + ram.u16(G.stageX2);           // $27A494..$27A4A0
  ram.setU8(a6 + S.palette, rom.u8(pal));              // $27A4A2
  ram.setU8(a5 + R.rec1A, rom.u8(pal));                // same `(A0)+` byte
  ram.setU8(a5 + R.rec1B, rom.u8(pal + 1));            // adjacent byte
});

// --- type $8C ($2789F6): stage 2's three-part palette-fading carrier. W176.
//
// The run-length stub is two. All three long-form prototypes occupy
// `$278B1E..$278B72`; the returned cursor is therefore the long-threshold cue
// script. The 21-word record prototype is `$278AF4..$278B1E`.
const TYPE8C_AIM_TABLES = new WeakMap();
BODY.set(0x2789f6, (ram, rom, a5, a6, unported, tablesArg, palette, soundPost) => {
  void tablesArg; void palette;
  const cueScript = loadSubProto(ram, rom, a5, a6, 0x278b1e); // $2789F6
  ram.setU32(a5 + R.rec44, cueScript);                  // $278A02
  loadRecordProto(ram, rom, a5, 0x278af4, 0x14);       // $278A06..$278A12
  readInitPosition(ram, rom, a5, unported);            // $278A14

  // Merge the main and second-part collision flags exactly as the handler does
  // every frame. The destination is the second sub-record at A6+$20.
  const merged = (ram.u16(a6) & 0xe7ff) | (ram.u16(a6 + 0x20) & 0xdffe);
  ram.setU16(a6 + 0x20, merged);                       // $278A1A..$278A2A

  let tables = TYPE8C_AIM_TABLES.get(rom);
  if (!tables) { tables = new AimTables(rom); TYPE8C_AIM_TABLES.set(rom, tables); }
  const initialDirection = (dy, dx) => {
    const sel = targetSelect(ram, a5);
    if (sel.carry) return (ram.u8(a6 + S.heading) * 4) & 0xff;
    return aim256(tables,
      u16(ram.u16(a6 + S.posX) + dy), u16(ram.u16(a6 + S.posY) + dx),
      ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
  };
  let d1 = initialDirection(0x0ac0, 0x0780);           // $278A34..$278A52
  ram.setU8(a5 + R.rec2D, d1);
  ram.setU32(a5 + R.rec28, rom.u32(0x272d7a + ((d1 & 0xf8) >>> 1)));
  d1 = initialDirection(0x0ac0, 0xf880);               // $278A62..$278A80
  ram.setU8(a5 + R.rec33, d1);
  ram.setU32(a5 + R.rec2E, rom.u32(0x272d7a + ((d1 & 0xf8) >>> 1)));

  // Both stage arms in the cartridge load these same constants.
  ram.setU8(a5 + R.rec34, 0x10);
  ram.setU8(a5 + R.rec35, 0x02);
  ram.setU8(a5 + 0x3c, 0x18);                         // $278A90..$278ABA
  loadAnimObjects246410(ram, rom, 0x278bb4);           // $278ABE
  ram.setU16(G.d8, 1);                                // stage progression gate
  if (soundPost) soundPost(0x28c7a8);                  // $278AD2
  else unported?.note(0x28c7a8, '$278AD2 type $8C looping engine sound '
    + '(no soundPost callback on this init-body call)');
  ram.setU16(0x81b414, 1);
  if (ram.u16(G.rank98) !== 0) ram.setU16(0x81b416, 1);
});

// --- type $91 ($279AA2): stage 2's compact damage-threshold enemy. W177.
//
// The run-length stub is zero. `$2637A2` therefore consumes the one 28-byte
// long-form prototype at `$279AEC..$279B08`; the two-word record prototype and
// five stage palette pairs sit immediately before it.
BODY.set(0x279aa2, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x279aec);             // $279AA2..$279AA8
  loadRecordProto(ram, rom, a5, 0x279ae8, 0x01);       // $279AAE..$279AB6
  readInitPosition(ram, rom, a5, unported);            // $279ABC

  const pal = 0x279ade + ram.u16(G.stageX2);           // $279AC2..$279ACE
  ram.setU8(a6 + S.palette, rom.u8(pal));               // $279AD0
  ram.setU8(a5 + R.rec18, rom.u8(pal));                 // $279AD4 reads (A0)+
  ram.setU8(a5 + R.rec19, rom.u8(pal + 1));             // $279AD8 adjacent byte
});

// --- type $92 ($279CD0): stage 2's mirrored damage-threshold enemy. W178.
BODY.set(0x279cd0, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x279d2a);             // $279CD0..$279CD6
  loadRecordProto(ram, rom, a5, 0x279d26, 0x01);       // $279CDC..$279CE4
  readInitPosition(ram, rom, a5, unported);            // $279CEA

  const pal = 0x279d1c + ram.u16(G.stageX2);           // $279CF0..$279CFC
  ram.setU8(a6 + S.palette, rom.u8(pal));               // $279CFE
  ram.setU8(a5 + R.rec18, rom.u8(pal));                 // $279D02 reads (A0)+
  ram.setU8(a5 + R.rec19, rom.u8(pal + 1));             // $279D06 adjacent byte

  // Movement escape $88 can select the mirrored spawn variant. The ROM folds
  // that nonzero HIGH selector byte into attribute bit 6, then clears only
  // +$1E. Escape `$81 03` remains in LOW byte +$1F, so the selector WORD is 3.
  if (ram.u8(a6 + S.anim) !== 0) {                      // $279D0A..$279D18
    ram.setU8(a6 + S.anim, 0);
    ram.setU8(a6 + 0x1c, ram.u8(a6 + 0x1c) | 0x40);
  }
});

// --- type $93 ($279EC2): stage 2's heavy damage-threshold enemy. W181.
BODY.set(0x279ec2, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x279f0c);            // $279EC2..$279ECE
  loadRecordProto(ram, rom, a5, 0x279f08, 0x01);       // $279ECE..$279EDC
  readInitPosition(ram, rom, a5, unported);            // $279EDC

  const pal = 0x279efe + ram.u16(G.stageX2);           // $279EE2..$279EEE
  ram.setU8(a6 + S.palette, rom.u8(pal));               // $279EF0
  ram.setU8(a5 + R.rec18, rom.u8(pal));                 // $279EF4 reads (A0)+
  ram.setU8(a5 + R.rec19, rom.u8(pal + 1));             // $279EF8 adjacent byte
});

// --- type $97 ($277DE8): stage 2's animated aimed-firing carrier. W179.
const TYPE97_AIM_TABLES = new WeakMap();
BODY.set(0x277de8, (ram, rom, a5, a6, unported, tablesArg) => {
  void tablesArg;
  const cue = loadSubProto(ram, rom, a5, a6, 0x277ede); // $277DE8..$277DF4
  ram.setU32(a5 + R.rec44, cue);                        // $277DF4
  loadRecordProto(ram, rom, a5, 0x277ebc, 0x10);       // $277DF8..$277E00
  readInitPosition(ram, rom, a5, unported);             // $277E06

  if (ram.u8(a6 + S.anim) !== 0) {                     // $277E0C..$277E18
    ram.setU8(a6 + 0x1c, ram.u8(a6 + 0x1c) | 0x40);
    ram.setU16(a5 + R.rec2E, 0x0280);
  }

  let t = TYPE97_AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); TYPE97_AIM_TABLES.set(rom, t); }
  const aimed = aim64FromCaller(t, ram, a5,
    u16(ram.u16(a6 + S.posX) + 0x0440),
    u16(ram.u16(a6 + S.posY) + ram.u16(a5 + R.rec2E)));
  const heading = aimed.carry ? ram.u8(a6 + S.heading) : aimed.dir;
  ram.setU8(a5 + R.rec29, heading);                     // $277E3E
  ram.setU32(a5 + R.rec24,
    rom.u32(0x272c7a + ((heading & 0x3e) << 1)));       // $277E42..$277E48
  ram.setU8(a5 + R.rec2A, 3);                          // $277E4E..$277E60
  ram.setU8(a5 + R.rec1E,
    u16(ram.u8(a5 + R.rec1E) - ram.u16(G.ae)) & 0xff); // $277E64..$277E6A

  const pal = 0x277eb2 + ram.u16(G.stageX2);           // $277E6E..$277E7A
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1C, rom.u8(pal));
  ram.setU8(a5 + R.rec1D, rom.u8(pal + 1));

  if ((ram.u8(a6) & 0x20) === 0) {                    // $277E88..$277EA8
    ram.setU16(a5 + R.rec30, 1);
    const variant = ram.u8(a6 + S.anim);
    ram.setU8(a5 + R.rec33, variant);
    ram.setU16(a6 + (variant !== 0 ? S.hit14 : S.hit16), 0xf800);
  }
  ram.setU8(a6 + S.anim, 0);                           // $277EAC
});

// --- type $94 ($27A0E8): stage 2's mirrored extending aimed shooter. W180.
BODY.set(0x27a0e8, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27a198);            // $27A0E8..$27A0F4
  loadRecordProto(ram, rom, a5, 0x27a184, 0x09);       // $27A0F4..$27A102
  readInitPosition(ram, rom, a5, unported);             // $27A102
  ram.setU8(a5 + R.rec17, ram.u16(G.stage) <= 1 ? 6 : 2); // $27A108..$27A11A
  ram.setU8(a5 + R.rec1C,
    u16(ram.u8(a5 + R.rec1C) - ram.u16(G.b2)) & 0xff); // $27A11E..$27A124

  if (ram.u8(a6 + S.anim) !== 0) {                     // $27A128..$27A140
    ram.setU8(a6 + S.anim, 0);
    ram.setU8(a6 + 0x1c, ram.u8(a6 + 0x1c) | 0x40);
    ram.setU32(a5 + R.rec24, 0x14);
    ram.setU16(a5 + R.rec28, 0);
  }
  const collision = (a6 + ram.u32(a5 + R.rec24)) >>> 0; // $27A146..$27A14C
  ram.setU32(a5 + R.rec24, collision);
  const frame = ram.u16(a5 + 0x20);
  ram.setU16(collision, rom.u16(0x27a3cc + frame + 4)); // $27A14C..$27A15A

  const pal = 0x27a17a + ram.u16(G.stageX2);           // $27A15E..$27A16C
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1A, rom.u8(pal));
  ram.setU8(a5 + R.rec1B, rom.u8(pal + 1));
});

// --- type $A6 ($27896A): Stage 4's invisible alternating pulse controller.
// The movement pointer is installed by the generic spawn path but this body
// deliberately never consumes it. The one long-form prototype ends exactly at
// the handler entry $278994.
BODY.set(0x27896a, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x278978);             // $27896A..$278976
});

// --- type $9B ($27AC4A): Stage 4's linked upper/lower structure pair.
// Both parts share X, separate vertically after their movement animation starts,
// and install the palette bank selected by the first-vs-later spawn clock.
BODY.set(0x27ac4a, (ram, rom, a5, a6, unported, _tables, palette) => {
  loadSubProto(ram, rom, a5, a6, 0x27acac);             // $27AC4A..$27AC56
  loadRecordProto(ram, rom, a5, 0x27aca8, 0x01);       // $27AC56..$27AC64
  readInitPosition(ram, rom, a5, unported);            // $27AC64 jsr $263808
  ram.setU32(a6 + 0x22, ram.u32(a6 + S.posX));         // $27AC6A
  ram.setU16(a6 + S.posY, ram.u16(a6 + S.posY) + 0x1600); // $27AC70
  ram.setU16(a6 + 0x24, ram.u16(a6 + 0x24) - 0x0800); // $27AC76
  ram.setU16(a6 + 0x24, ram.u16(a6 + 0x24) - ram.u16(G.scrollDelta));
  const bank = ram.u16(G.scrollClock) === 0x0019 ? 0x14 : 0x16;
  installBank(ram, rom, palette, unported, bank, 0x224cb8, 0x27aca0,
    'Stage-4 type $9B linked-structure palette');
});

// `$27DBF4` / `$27E000`: initialize one paired satellite attached to the
// Stage-4 type $9C root. The ROM enters the prototype loader at `$2637A6`
// with D7=1, so the optional run-length argument deliberately ignores the
// root record's eleven-subrecord allocation count.
function init9CSatellite(ram, rom, a5, root, child, row, family11) {
  loadSubProto(ram, rom, a5, child,
    family11 ? 0x27dcc8 : 0x27e0d2, 1);
  ram.setU32(child + 0x3a, rom.u32(row));
  ram.setU16(child + S.speed, rom.u16(row + 4));

  if (family11) {
    const cadence = (ram.u16(G.stage) >>> 1) + 2;
    ram.setU8(child + 0x2a, cadence);
    ram.setU8(child + 0x2b, cadence);
    ram.setU8(child + 0x2e,
      u16(ram.u8(child + 0x2e) - ram.u16(G.b4)) & 0xff);
    ram.setU8(child + 0x27,
      u16(ram.u8(child + 0x27) - (ram.u16(G.bc) >>> 4)) & 0xff);
  } else {
    const rank = ram.u16(G.b2);
    ram.setU8(child + 0x2e, u16(ram.u8(child + 0x2e) - rank) & 0xff);
    ram.setU8(child + 0x28, u16(ram.u8(child + 0x28) - rank) & 0xff);
    ram.setU8(child + 0x2e,
      ram.u8(child + 0x2e) + (drawByte242E24(ram, rom) >>> 1));
    ram.setU8(child + 0x26,
      u16(ram.u8(child + 0x26) - (ram.u16(G.bc) >>> 4)) & 0xff);
  }

  ram.setU16(child + S.posX,
    ram.u16(root + S.posX) + ram.u16(child + 0x3a));
  ram.setU16(child + S.posY,
    ram.u16(root + S.posY) + ram.u16(child + 0x3c));

  const emitter = 0x267f70 + ram.u8(root + S.f1f) * 8;
  ram.setU32(child + 0x30, rom.u32(emitter));
  ram.setU32(child + 0x34, rom.u32(emitter + 4));
  const selector = ram.u8(child + S.anim) || ram.u8(root + S.f1f);
  ram.setU8(child + S.anim, selector * 2);

  const heading = ram.u8(child + S.heading);
  const h = heading & 0x3e;
  ram.setU32(child + S.sprite0a,
    rom.u32((family11 ? 0x268594 : 0x268b9e) + h * 4));
  ram.setU8(child + 0x3e, heading);
  ram.setU32(child + 0x22,
    rom.u32((family11 ? 0x268694 : 0x268c9e) + h * 2));

  const pal = (family11 ? 0x27dcbe : 0x27e0c8) + ram.u16(G.stageX2);
  ram.setU8(child + S.palette, rom.u8(pal));
  ram.setU8(child + 0x38, rom.u8(pal));
  ram.setU8(child + 0x39, rom.u8(pal + 1));
}

// --- type $9C ($27AD96): Stage 4's root ship and paired satellite array.
// Movement animation selects the five-pair normal layout or the mirrored
// two-pair layout. The remaining allocated subrecords are explicitly disabled
// in the mirrored form, matching the root handler's two-vs-five dispatch.
BODY.set(0x27ad96, (ram, rom, a5, a6, unported, _tables, palette) => {
  loadSubProto(ram, rom, a5, a6, 0x27aeae, 0);         // $27AD96..$27ADA4
  loadRecordProto(ram, rom, a5, 0x27ae96, 0x0b);      // $27ADA4..$27ADB2
  readInitPosition(ram, rom, a5, unported);            // $27ADB2
  ram.setU16(a6 + S.posX, ram.u16(a6 + S.posX) - 0x1440);
  ram.setU16(a6 + S.posY, ram.u16(a6 + S.posY) - 0x1d40);
  installBank(ram, rom, palette, unported, 0x17, 0x224b38, 0x27adce,
    'Stage-4 type $9C root palette');
  if (i16(drawWord242EC2(ram, rom)) < 0)
    ram.setU8(a6 + 1, ram.u8(a6 + 1) | 0x40);

  let count = 5, row = 0x27ae4e, family11 = false;
  if ((ram.u8(a6 + S.f1f) & 0x80) !== 0) {
    ram.setU8(a6 + S.f1f, (~ram.u8(a6 + S.f1f)) & 0xff);
    ram.setU8(a6 + S.f1c, 0x40);
    ram.setU16(a5 + R.rec1A, u16(-ram.u16(a5 + R.rec1A)));
    ram.setU16(a5 + R.rec2C, u16(-ram.u16(a5 + R.rec2C)));
    ram.setU8(a5 + R.rec2B, (-ram.u8(a5 + R.rec2B)) & 0xff);
    ram.setU16(a6 + S.posY, ram.u16(a6 + S.posY) + 0x3a80);
    ram.setU16(a5 + R.runLen, ram.u16(a5 + R.runLen) - 6);
    for (const off of [0xa0, 0xc0, 0xe0, 0x100, 0x120, 0x140])
      ram.setU16(a6 + off, 0);
    count = 2; row = 0x27ae6c; family11 = true;
  }
  let child = a6 + 0x20;
  for (let i = 0; i < count; i++, child += 0x40, row += 6)
    init9CSatellite(ram, rom, a5, a6, child, row, family11);
});

// --- type $9D ($27B2FE): Stage 4's three-part carrier.
// The root and its two attached hitboxes are one allocation. The post-loader
// cue pointer and all three palette uploads are live dependencies of the
// handler's threshold effects and death presentation.
BODY.set(0x27b2fe, (ram, rom, a5, a6, unported, _tables, palette) => {
  const cue = loadSubProto(ram, rom, a5, a6, 0x27b396); // $27B2FE..$27B30A
  ram.setU32(a5 + R.rec44, cue);                       // $27B30A
  loadRecordProto(ram, rom, a5, 0x27b376, 0x0f);      // $27B30E..$27B31C
  readInitPosition(ram, rom, a5, unported);            // $27B31C
  ram.setU8(a5 + R.rec1D,
    u16(ram.u8(a5 + R.rec1D) - ram.u16(G.b2)) & 0xff);// $27B322..$27B32C
  ram.setU16(G.d8, 1);
  ram.setU16(G.dc, 1);
  ram.setU16(0x81b414, 1);
  installBank(ram, rom, palette, unported, 0x0f, 0x224af8, 0x27b34e,
    'Stage-4 type $9D root palette');
  installBank(ram, rom, palette, unported, 0x10, 0x224bf8, 0x27b35e,
    'Stage-4 type $9D effect palette');
  installBank(ram, rom, palette, unported, 0x11, 0x224c38, 0x27b36e,
    'Stage-4 type $9D overlay palette');
});

// --- type $9E ($27C28E): the live child launched by type $9D.
// It has no movement script. Its position is the parent's deferred +$16 long,
// and the two shared RNG draws choose lateral drift and mirroring.
BODY.set(0x27c28e, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x27c2e0);           // $27C28E..$27C29A
  ram.setU32(a6 + S.posX, ram.u32(a5 + R.rec16));     // $27C29A
  loadRecordProto(ram, rom, a5, 0x27c2d0, 0x07);     // $27C2A0..$27C2AE
  const random = drawByte242B3C(ram, rom);
  const signed = (random << 24) >> 24;
  ram.setU16(a5 + R.rec1C,
    u16(ram.u16(a5 + R.rec1C) + signed * 8));         // $27C2AE..$27C2BC
  if (i16(drawWord242EC2(ram, rom)) < 0) {            // $27C2BC..$27C2CE
    ram.setU8(a6 + S.f1c, 0x40);
    ram.setU16(a5 + R.rec1C, u16(-ram.u16(a5 + R.rec1C)));
  }
});

// --- type $A1 ($27CEB4): Stage 4's large reverse-animated structure.
BODY.set(0x27ceb4, (ram, rom, a5, a6, unported, _tables, palette) => {
  const end = loadSubProto(ram, rom, a5, a6, 0x27cef0); // $27CEB4..$27CEC0
  ram.setU32(a5 + R.rec44, end);                        // $27CEC0
  loadRecordProto(ram, rom, a5, 0x27ceea, 0x02);       // $27CEC4..$27CED2
  readInitPosition(ram, rom, a5, unported);             // $27CED2
  installBank(ram, rom, palette, unported, 0x12, 0x224cf8, 0x27ced8,
    'Stage-4 type $A1 structure palette');
});

// --- type $9F ($27C5BE): Stage 4's final pre-boss structure sequence.
// Three linked subrecords share the opening animation, threshold cues, death
// presentation, and the live deferred type-$A4 debris emitted during state 2.
BODY.set(0x27c5be, (ram, rom, a5, a6, unported, _tables, palette) => {
  const end = loadSubProto(ram, rom, a5, a6, 0x27c63a); // $27C5BE..$27C5CA
  ram.setU32(a5 + R.rec44, end);                        // $27C5CA
  loadRecordProto(ram, rom, a5, 0x27c614, 0x12);       // $27C5CE..$27C5DA
  readInitPosition(ram, rom, a5, unported);             // $27C5DC
  installBank(ram, rom, palette, unported, 0x13, 0x224cf8, 0x27c5ec,
    'Stage-4 type $9F root palette');
  installBank(ram, rom, palette, unported, 0x14, 0x224d38, 0x27c5fc,
    'Stage-4 type $9F overlay palette');
  installBank(ram, rom, palette, unported, 0x15, 0x224c78, 0x27c60c,
    'Stage-4 type $9F linked-part palette');
});

// --- type $A4 ($27DA78): the live structure fragment spawned by type $9F.
// Its parent pointer and packed offsets arrive through the deferred record;
// all remaining motion and animation selection comes from the shared RNG.
BODY.set(0x27da78, (ram, rom, a5, a6) => {
  loadSubProto(ram, rom, a5, a6, 0x27db14);             // $27DA78..$27DA84
  loadRecordProto(ram, rom, a5, 0x27db06, 0x06);       // $27DA84..$27DA92
  ram.setU32(a6 + S.posX, 0x00001c00);                  // $27DA92
  ram.setU16(a5 + R.rec20, drawLong243A9C(ram, rom));  // $27DA9A
  ram.setU8(a6 + S.speed,
    ((drawByte242B3C(ram, rom) << 1) + 0x70) & 0xff);  // $27DAA4
  ram.setU8(a6 + S.heading,
    ((drawWord242EC2(ram, rom) & 0x7f) + 0x40) & 0xff);// $27DAB4
  const row = 0x27daee + drawByte24311A(ram, rom) * 8;
  ram.setU32(a6 + S.sprite0a, rom.u32(row));             // $27DAD6
  ram.setU32(a5 + R.rec16, rom.u32(row + 4));           // $27DADA
  ram.setU32(a6 + S.sprite0a,
    ram.u32(a6 + S.sprite0a) + drawByte2431F4(ram, rom) * 0x34);
});

// --- type $A2 ($27CFAC): Stage 4's opening/rotating gun pod.
// Its movement variant mirrors three packed muzzle offsets; the record's
// +$24 long is converted from the prototype-relative +$16 into a live pointer
// to the subrecord flag/HP area used by the handler.
BODY.set(0x27cfac, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27d046);             // $27CFAC..$27CFB8
  loadRecordProto(ram, rom, a5, 0x27d028, 0x0e);       // $27CFB8..$27CFC6
  readInitPosition(ram, rom, a5, unported);             // $27CFC6

  ram.setU8(a5 + R.rec1C,
    u16(ram.u8(a5 + R.rec1C) - ram.u16(G.b8)) & 0xff); // $27CFCC..$27CFD6
  ram.setU8(a5 + R.rec1D,
    u16(ram.u8(a5 + R.rec1D) - ram.u16(G.b6)) & 0xff); // $27CFD6..$27CFE0
  if (ram.u8(a6 + S.anim) !== 0) {                     // $27CFE0..$27CFFC
    ram.setU8(a6 + S.anim, 0);
    ram.setU8(a6 + S.f1c, ram.u8(a6 + S.f1c) | 0x40);
    ram.setU16(a5 + R.rec28, u16(-ram.u16(a5 + R.rec28)));
    ram.setU16(a5 + R.rec2A, u16(-ram.u16(a5 + R.rec2A)));
    ram.setU16(a5 + R.rec2C, u16(-ram.u16(a5 + R.rec2C)));
  }
  ram.setU32(a5 + R.rec24,
    (ram.u32(a5 + R.rec24) + a6) >>> 0);                // $27CFFC

  const pal = 0x27d01e + ram.u16(G.stageX2);           // $27D002..$27D01C
  ram.setU8(a6 + S.palette, rom.u8(pal));
  ram.setU8(a5 + R.rec1A, rom.u8(pal));
  ram.setU8(a5 + R.rec1B, rom.u8(pal + 1));
});

// --- type $A3 ($27D404): Stage 4's oscillating linked carrier.
// Movement owns the root X; the body replaces both Y positions, mirrors the
// initial oscillation direction from shared RNG, and rank-adjusts the two byte
// timers exactly once at construction.
BODY.set(0x27d404, (ram, rom, a5, a6, unported) => {
  loadSubProto(ram, rom, a5, a6, 0x27d498);             // $27D404..$27D410
  loadRecordProto(ram, rom, a5, 0x27d470, 0x13);       // $27D410..$27D41E
  readInitPosition(ram, rom, a5, unported);             // $27D41E

  ram.setU16(a6 + S.posY,
    u16(0x1c00 - ram.u16(G.scrollDelta)));              // $27D428..$27D432
  const linkedY = i16(drawWord24328E(ram, rom)) >> 1;
  ram.setU16(a5 + R.rec2C, linkedY);                    // $27D436..$27D43E
  ram.setU16(a6 + 0x24, u16(linkedY + 0x1c00));         // $27D442..$27D446
  if (i16(drawWord242EC2(ram, rom)) < 0)
    ram.setU16(a5 + R.rec2A, u16(-ram.u16(a5 + R.rec2A))); // $27D44A..$27D452
  const spread = (drawByte242B3C(ram, rom) + 7) * 2;
  ram.setU8(a5 + R.rec1C, ram.u8(a5 + R.rec1C) - spread); // $27D456..$27D460
  ram.setU8(a5 + R.rec1D,
    ram.u8(a5 + R.rec1D) - ram.u16(G.b6));              // $27D464..$27D46A
});

// ============================================================ the entry point
/** Run the init+8 body at `addr`.  Replaces spawn.js's throwing stub.  Returns
 *  FREED if the body freed the enemy (a stage-kill gate fired); otherwise
 *  undefined.  An unknown address is a LOUD NAMED THROW (never a silence). */
// W31: `tables` is APPENDED, not inserted, and every existing call site is
// unaffected.  Exactly one body needs it -- the MIDBOSS's `$26B4B4 bsr
// $26B304`, whose arm placement reads `$241D34`.  A caller that omits it
// reaches a LOUD NAMED THROW inside that body rather than a silent skip.
// W92: `palette` is APPENDED after `tables` for exactly the same reason and
// with exactly the same consequence -- every existing call site is unaffected.
// FOUR bodies need it (type $24, type $31, the MIDBOSS and the BOSS), each of
// which does `lea <64-byte block>,A0 / moveq #<bank>,D0 / jsr $24150A` and
// carried a counted note from W23 to W91.  A caller that omits it gets that
// note back rather than a silently missing colour install.
export function runInitBodyAddr(addr, ram, rom, a5, unported, tables, palette,
  soundPost) {
  const a6 = ram.u32(a5 + R.subRec);                  // A6 = ($6,A5)
  const fn = BODY.get(addr);
  if (!fn) {
    unreached(addr, `init+8 body at $${addr.toString(16).toUpperCase()} -- not in `
      + `the live init-body registry. Either an unported type was spawned, or `
      + `a body was missed; do NOT smooth`);
  }
  const r = fn(ram, rom, a5, a6, unported, tables, palette, soundPost);
  return r === FREED ? FREED : undefined;
}

export const INIT_BODY_FREED = FREED;
export const INIT_BODY_ADDRESSES = [...BODY.keys()];
