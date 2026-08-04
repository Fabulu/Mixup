// THE DAMAGE DELIVERY -- object type 5's tail `$28B670` and the shot half of
// the collision pass `$244D62`.  WAVE 34.
//
// This is the routine that makes an enemy's HP go down.  Until this wave the
// port could not reduce any enemy's HP at all: `$286096` was a counted note in
// every handler, so the HP word every handler tests with `tst.w ($18,A6)` never
// moved, nothing ever died, the stage-1 midboss never released the scroll, and
// the distance clock `$8130CE` stopped at 239 with eight of the nineteen
// stage-1 handlers' first trigger beyond it (W33 §3).
//
// ============================ WHAT THE ENUMERATION SAID ======================
//
// `tools/oracle/w34damage.py` scanned EVERY EVEN OFFSET of `$244D62..$245312`
// for `jsr`/`jmp`/`bsr` and found **exactly one external target in 1,456
// bytes**: `$2453AC`, the laser's own pass, reached by `$24530C bsr.w`.  The
// collision routine calls no allocator, no score routine and no effect
// spawner.  So porting damage DELIVERY drags in nothing -- which is why this
// file has two imports and neither is a subsystem.
//
// `$244D62` has FOUR absolute callers and all four are this tail:
// `$28B6B8`, `$28B6FE`, `$28B766`, `$28B79C`.  Nothing else in build B reaches
// it, so the tail and the pass are one machine and are ported together.
//
// ========================= THE POST-INCREMENT, WHICH IS THE WHOLE TRAP =======
//
// A5 and A6 are POST-INCREMENTED by the live tests (`move.w (A5)+,D0`), so
// inside the loop bodies the displacements are shifted:
//
//     A5 = enemy record + 2       ->  `$16(A5)` is record `+$18`  == THE HP
//                                     `-$2(A5)` is record `+$0`   == the type word
//                                     ` (A5)`   is record `+$2`   == X
//     A6 = shot record  + 4       ->  `$14(A6)` is record `+$18`  == the POWER
//                                     `-$3(A6)` is record `+$1`   == the hit byte
//
// Read `$16(A5)` as record `+$16` and the routine appears to damage a field no
// handler reads.  The A2 loop settles it from the other side: `$245248
// cmpi.w #$6F00,$2(A5)` with A5 UN-incremented is the identical test that
// `$245058 cmpi.w #$6F00,(A5)` writes against the incremented pointer --
// and `10-recon-combat.md` §4 read that one as "the target's TYPE WORD",
// which it is not.  It is X.
//
// ============================== WHAT IS PORTED ==============================
//
// `$244D62` is six blocks.  This file runs the three that are "a player shot"
// and COUNTS the rest, each under its own ROM address:
//
//   | # | span                | walks                        | ported |
//   |---|---------------------|------------------------------|--------|
//   | 1 | $244D62..$244D92    | $2459D0, the PLAYER's box    | NOTE (L16) |
//   | 2 | $244D94..$244DFE    | $816B7C x $8171BA            | NOTE   |
//   | 3 | $244DFE..$244E5C    | $8171BE x $817F7E            | NOTE   |
//   | 4 | $244E5C..$244EE0    | the enemy pool, RAM damage   | NOTE   |
//   | 5 | $244EE0..$244F66    | the 36 shots -> a bounding box | **YES** |
//   |6a | $244F68..$245076    | $81459C (100) x the 36 shots | **YES** |
//   |6b | $245078..$245188    | $81521C (50)  x the 36 shots | **YES** |
//   | 7 | $24518A..$24525C    | $811802 (the A2 weapon)      | NOTE (L13) |
//   | 8 | $24525C..$245310    | $811892 + bsr $2453AC laser  | NOTE (L13) |
//
// Blocks 2, 3 and 4 all consume the box that block 1's `$2459D0` computes, so
// they are noted as ONE deferral naming all four addresses: running them on an
// uncomputed box would be worse than not running them.  Block 4 is the only
// one of the four that damages an enemy (`$244ED2 subq.w #1,$16(A6)` -- ramming
// costs the enemy exactly 1 HP) and it is named separately inside that note so
// the gap is legible.
//
// NOTHING HERE IS SILENT.  Every deferral is an `UnportedLog` note filed under
// the ROM address of the instruction it replaces.

import { u16, i16 } from './ram.js';

export const DMG = {
  tail: 0x28b670,            // object type 5's tail
  pass: 0x244d62,            // THE COLLISION/DAMAGE PASS
  passNoPlayer: 0x244d40,    // its player-box-only entry
  playerBox: 0x2459d0,       // $244D84 jsr $2459D0(pc)
  loopBullets1: 0x244db4,    // $816B7C, stride $3E
  loopBullets2: 0x244e12,    // $8171BE, stride $2A
  loopRam: 0x244e5c,         // the PLAYER's body vs the enemy pool: -1 HP
  weaponA2: 0x24518a,        // $811802 vs 150 enemy slots
  weaponA3: 0x24525c,        // $811892 vs 150 enemy slots
  laserPass: 0x2453ac,       // $24530C bsr.w
  // the two writes the pass makes that a gate can see
  shotHitBit: 0x245044,      // bset #$7,(-$3,A6)   -- state.js taps this
  // the globals
  fa72: 0x80fa72,            // $244D62 move.w D0,$80FA72   (the hit mask)
  b6e6: 0x81b6e6,            // $244D68 move.w D1,$81B6E6
  b6e8: 0x81b6e8,            // $244D6E move.w D2,$81B6E8
  box: 0x80fa74,             // the 36 shots' bounding box: maxX minX maxY minY
  gate308c: 0x81308c,        // $28B670 tst.w / $245036 tst.w
  mirror2: 0x80390c,         // $28B6B0 tst.w
  loop98: 0x813098,          // $28B706 tst.w
  g393a: 0x80393a,           // $28B710 tst.w
  g309c: 0x81309c,           // $28B71A cmpi.w #$1
  hyper1: 0x81b63e, hyper2: 0x81b640,
  hyperLvl1: 0x81b654, hyperLvl2: 0x81b656,
  p1rec: 0x8103e6, p2rec: 0x810448,
  p1shots: 0x810572, p2shots: 0x810c32,
  poolA: 0x81459c, poolACount: 0x815e9e,   // $244F68 / $244F6E
  poolB: 0x81521c, poolBCount: 0x815ea0,   // $24507A / $245080
  shotSlots: 36,             // $244EE2 moveq #$23,D6
  shotStride: 0x30,
  enemyStride: 0x20,
  /** `$28B6A0 move.w #$1000,D0` (P1) / `$28B6E6 move.w #$800,D0` (P2).  These
   *  are the bits the handlers' `moveq #$5C,D1 / and.b (A6),D1` tests: `$1000`
   *  is bit 4 of the HIGH byte and `$800` is bit 3, and `$286096` credits P1 on
   *  `btst #4,D1` and P2 on `btst #3,D1`.  So the mask is not decoration -- it
   *  is which player's score the hit lands in. */
  maskP1: 0x1000, maskP2: 0x0800,
};

/** The box, four RAM words at `$80FA74`, and THE FIRST PAIR IS Y.
 *
 * `$244F14 movem.w (A6),D0/D2` loads D0 from record `+$2` and D2 from `+$4`,
 * and the shot record's `+$2` is Y (`$253B9A add.w D0,($2,A6)` is the vertical
 * step).  So `$80FA74`/`$80FA76` bound Y and `$80FA78`/`$80FA7A` bound X.
 * Naming them the other way round costs nothing until somebody reads the file.
 *
 * THE TWO AXES ARE NOT COMPUTED SYMMETRICALLY, and it is in the listing:
 *   `$244F1E add.w (A1)+,D0 / $244F20 move.w D0,D1 / $244F22 sub.w (A1)+,D1`
 *      -- Y's minimum is derived from the ALREADY-BIASED maximum;
 *   `$244F18 move.w D2,D3` (BEFORE the add) `/ $244F24 / $244F26`
 *      -- X's minimum is derived from the RAW coordinate.
 * With equal half-extents the Y minimum is exactly Y and the X minimum is not.
 */
const BOX = { maxY: 0x80fa74, minY: 0x80fa76, maxX: 0x80fa78, minX: 0x80fa7a };

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

// ---------------------------------------------------------------------------
// BLOCK 5 -- `$244EE0..$244F66`: the 36 shot records' BOUNDING BOX.
//
// Returns false when NO shot record is live, which is `$244EF0 bra.w $24518A`
// -- both enemy pools are skipped entirely, and that is a real early-out the
// port must reproduce or it would walk 150 enemies against an empty box.
//
// The four seeds are `0 / $7000 / 0 / $3800` and the comparisons are SIGNED
// (`ble`/`bge`), while every comparison in blocks 6a/6b against the same four
// words is UNSIGNED (`bhi`/`bcs`).  That mixture is in the listing and is the
// kind of thing a "tidy" port silently makes consistent.
// ---------------------------------------------------------------------------
export function shotBoundingBox(ram, table, d7) {
  let any = false;
  for (let i = 0; i < DMG.shotSlots; i++) {           // $244EE2 moveq #$23,D6
    if ((ram.u16(table + i * DMG.shotStride) & 0x8000) !== 0) { any = true; break; }
  }
  if (!any) return false;                             // $244EF0 bra.w $24518A
  ram.setU16(BOX.maxY, 0);                            // $244EFE
  ram.setU16(BOX.minY, 0x7000);                       // $244F00
  ram.setU16(BOX.maxX, 0);                            // $244F04
  ram.setU16(BOX.minX, 0x3800);                       // $244F06
  for (let i = 0; i < DMG.shotSlots; i++) {           // $244F0A move.w #$23,D5
    const r = table + i * DMG.shotStride;
    if ((ram.u16(r) & 0x8000) === 0) continue;        // $244F10 tst.w (A6)+ / bpl
    // A6 is now r+2; `movem.w (A6),D0/D2` takes r+2 and r+4.
    let d0 = ram.u16(r + 0x02);                       // $244F14
    let d2 = ram.u16(r + 0x04);
    let d3 = d2;                                      // $244F18
    // $244F1A `lea $E(A6),A1` -- A6 is r+2, so A1 = r+$10.
    d0 = u16(d0 + ram.u16(r + 0x10));                 // $244F1E add.w (A1)+,D0
    let d1 = u16(d0 - ram.u16(r + 0x12));             // $244F20/$244F22
    d2 = u16(d2 + ram.u16(r + 0x14));                 // $244F24
    d3 = u16(d3 - ram.u16(r + 0x16));                 // $244F26
    // $244F2E..$244F4A: four SIGNED min/max updates through `(A1)+`.
    if (i16(d0) > i16(ram.u16(BOX.maxY))) ram.setU16(BOX.maxY, d0);  // $244F2E ble
    if (i16(d1) < i16(ram.u16(BOX.minY))) ram.setU16(BOX.minY, d1);  // $244F36 bge
    if (i16(d2) > i16(ram.u16(BOX.maxX))) ram.setU16(BOX.maxX, d2);  // $244F3E ble
    if (i16(d3) < i16(ram.u16(BOX.minX))) ram.setU16(BOX.minX, d3);  // $244F46 bge
  }
  // $244F56..$244F62: all four biased by D7 ($2800 at this point).
  for (const a of [BOX.maxY, BOX.minY, BOX.maxX, BOX.minX]) {
    ram.setU16(a, u16(ram.u16(a) + d7));
  }
  return true;
}

/**
 * BLOCKS 6a and 6b -- one enemy pool against the 36 shot records.
 *
 * `variant` is `'A'` for `$244F68` (`$81459C`, 100 slots, count `$815E9E`) and
 * `'B'` for `$24507A` (`$81521C`, 50, count `$815EA0`).  THE TWO ARE NOT THE
 * SAME LOOP and this port does not pretend they are.  Four differences, all
 * from the listing:
 *
 *   1. the off-screen constant: `$244FC4 cmpi.w #$9700,D1` vs
 *      `$2450EC cmpi.w #$8800,D1`;
 *   2. B tests the shot's own byte 0 first -- `$245138 moveq #$30,D4 /
 *      and.b -$4(A6),D4 / bne` -- and A has no such test;
 *   3. A applies the `$81308C` three-quarter reduction BEFORE the shot's power
 *      is debited (`$24503E`, then `$24504E`), B applies it AFTER
 *      (`$24515E`, then `$245162`);
 *   4. A has the `$245058 cmpi.w #$6F00,(A5)` X gate and the
 *      `$245022/$245052/$245054` HP save-and-restore around it; B has neither.
 *
 * Difference 4's save-and-restore is a NO-OP in effect -- D4's high half is
 * loaded with the HP at `$245026` and its low half is reloaded with the same HP
 * at `$24504A`, so the `swap` + `move.w D4,$16(A5)` writes the value back
 * unchanged.  It is transcribed because it is an instruction the board
 * executes, and because a reader who "optimised it away" would then have no
 * place to hang the `$6F00` gate that immediately follows it.
 *
 * The outer walk is NOT a plain `for`.  `$244F8E bpl $244F88` scans forward
 * over DEAD records WITHOUT consuming the `dbra` counter, and the counter is
 * the pool's LIVE COUNT, not its capacity -- so a pool with 100 slots and 7
 * live records runs the body 7 times.  A port that walked all 100 would be
 * right on every frame until the counters disagreed with the slots.
 */
export function poolDamage(ram, pool, count, table, d7, mask, gate308c, variant) {
  if (count === 0) return 0;                          // $244F74 / $245086 beq.w
  const offLimit = variant === 'A' ? 0x9700 : 0x8800; // $244FC4 / $2450EC
  let hits = 0;
  let idx = 0;                                        // the pool cursor, in slots
  const cap = variant === 'A' ? 100 : 50;
  for (let n = 0; n < count; n++) {                   // $244F78 subq.w #1,D6 / dbra
    // ---- $244F8C/$2450B4: scan forward to the next LIVE record.
    let rec = -1;
    for (; idx < cap; idx++) {
      if ((ram.u16(pool + idx * DMG.enemyStride) & 0x8000) !== 0) { rec = pool + idx * DMG.enemyStride; break; }
    }
    if (rec < 0) break;   // the counters over-report; the board would run off
    idx++;                // $24506E/$245180 `lea $1e(A5),A5` (A5 was already +2)
    const tw = ram.u16(rec);
    if ((tw & 0x2000) === 0) continue;                // $244F90/$2450B8 andi #$2000
    // ---- the box test.  A5 is rec+2 from here on.
    let d0 = u16(ram.u16(rec + 0x02) + d7);           // $244F96/$244F9A
    let d1 = d0;                                      // $244F9C
    // $244F9E `lea $E(A5),A1` -- A5 is rec+2, so A1 = rec+$10.
    d0 = u16(d0 + ram.u16(rec + 0x10));               // $244FA2 add.w (A1)+,D0
    d1 = u16(d1 - ram.u16(rec + 0x12));               // $244FA4 sub.w (A1)+,D1
    if (d1 > ram.u16(BOX.maxY)) continue;             // $244FAC cmp/bhi  UNSIGNED
    if (d0 < ram.u16(BOX.minY)) continue;             // $244FB0 cmp/bcs
    let d2 = u16(ram.u16(rec + 0x04) + d7);           // $244FB4
    let d3 = d2;                                      // $244FB6
    d2 = u16(d2 + ram.u16(rec + 0x14));               // $244FB8
    d3 = u16(d3 - ram.u16(rec + 0x16));               // $244FBA
    if (d3 > ram.u16(BOX.maxX)) continue;             // $244FBC bhi
    if (d2 < ram.u16(BOX.minX)) continue;             // $244FC0 bcs
    if (d1 >= offLimit) continue;                     // $244FC4/$2450EC bcc
    // ---- the inner walk over all 36 shot records.
    for (let s = 0; s < DMG.shotSlots; s++) {         // $244FCE move.w #$23,D6
      const sh = table + s * DMG.shotStride;
      if ((ram.u16(sh) & 0x8000) === 0) continue;     // $244FEC move.w (A6)+,D5 / bpl
      // A6 is sh+4 from here on.
      let d4 = u16(u16(ram.u16(sh + 0x02) + d7) + ram.u16(sh + 0x10)); // $244FF0..$244FF4
      if (d4 < d1) continue;                          // $244FF8 cmp.w D1,D4 / bcs
      d4 = u16(d4 - ram.u16(sh + 0x12));              // $244FFC sub.w $E(A6),D4
      if (d0 < d4) continue;                          // $245000 cmp.w D4,D0 / bcs
      d4 = u16(u16(ram.u16(sh + 0x04) + d7) + ram.u16(sh + 0x14)); // $245004..$245008
      if (d4 < d3) continue;                          // $24500C bcs
      d4 = u16(d4 - ram.u16(sh + 0x16));              // $245010
      d4 = u16(d4 - ram.u16(sh + 0x16));              // $245014 -- the SAME word, TWICE
      if (d2 < d4) continue;                          // $245018 bcs
      if (variant === 'B') {
        // $245138 `moveq #$30,D4 / and.b -$4(A6),D4 / bne` -- pool B ONLY.
        if ((ram.u8(sh) & 0x30) !== 0) continue;
      }
      if ((ram.u16(sh + 0x18) & 0x8000) !== 0) {      // $24501C/$245140 tst.w $14(A6)
        // bmi -> $245064/$245176: the shot has no power left.  Pool A jumps
        // PAST the damage and keeps walking; pool B does the same.
        continue;
      }
      // =================== THE DAMAGE ===================
      hits++;
      if (variant === 'A') {
        const hp0 = ram.u16(rec + 0x18);              // $245022 move.w $16(A5),D4
        ram.setU16(rec, u16(ram.u16(rec) | mask));    // $24502E or.w D4,-$2(A5)
        let d5 = ram.u16(sh + 0x18);                  // $245032 move.w $14(A6),D5
        if (gate308c === 0) {                         // $245036 tst.w / bne
          d5 = u16(d5 - (u16(d5) >>> 2));             // $24503E/$245040/$245042
        }
        ram.setU8(sh + 0x01, ram.u8(sh + 0x01) | 0x80);  // $245044 bset #$7,-$3(A6)
        const hp = ram.u16(rec + 0x18);               // $24504A move.w $16(A5),D4
        ram.setU16(sh + 0x18, u16(ram.u16(sh + 0x18) - hp));  // $24504E sub.w D4,$14(A6)
        // $245052 swap D4 / $245054 move.w D4,$16(A5).  D4's high half has held
        // the HP since $245026 and its low half was reloaded with the same HP
        // at $24504A, so this writes the HP back UNCHANGED.  Transcribed, not
        // elided -- see this function's header.
        ram.setU16(rec + 0x18, hp0);
        if (ram.u16(rec + 0x02) >= 0x6f00) continue;  // $245058 cmpi.w #$6F00,(A5)
        const nhp = u16(ram.u16(rec + 0x18) - d5);    // $24505E sub.w D5,$16(A5)
        ram.setU16(rec + 0x18, nhp);
        if ((nhp & 0x8000) !== 0) break;              // $245062 bmi $24506C
      } else {
        ram.setU16(rec, u16(ram.u16(rec) | mask));    // $24514C or.w D4,-$2(A5)
        ram.setU8(sh + 0x01, ram.u8(sh + 0x01) | 0x80);  // $245150 bset #$7,-$3(A6)
        let d5 = ram.u16(sh + 0x18);                  // $245156 move.w $14(A6),D5
        const hp = ram.u16(rec + 0x18);               // $24515A move.w $16(A5),D4
        ram.setU16(sh + 0x18, u16(ram.u16(sh + 0x18) - hp));  // $24515E sub.w D4,$14(A6)
        if (gate308c === 0) {                         // $245162 tst.w / bne -- AFTER
          d5 = u16(d5 - (u16(d5) >>> 2));             // $24516A/$24516C/$24516E
        }
        const nhp = u16(ram.u16(rec + 0x18) - d5);    // $245170 sub.w D5,$16(A5)
        ram.setU16(rec + 0x18, nhp);
        if ((nhp & 0x8000) !== 0) break;              // $245174 bmi $24517E
      }
    }
  }
  return hits;
}

/**
 * `$244D62` -- the pass, entered with the tail's five registers.
 *
 * `table` is A0 (the player's 36-slot shot table), `mask` is D0, `d1`/`d2` are
 * the hyper words the tail loads.  D7 is `$2800` at entry (`$244D74`).
 */
export function collisionPass(ram, ctx, { table, mask, d1, d2, player }) {
  ram.setU16(DMG.fa72, mask);                         // $244D62 move.w D0,$80FA72
  ram.setU16(DMG.b6e6, d1);                           // $244D68 move.w D1,$81B6E6
  ram.setU16(DMG.b6e8, d2);                           // $244D6E move.w D2,$81B6E8
  let d7 = 0x2800;                                    // $244D74 move.w #$2800,D7
  // $244D78 `tst.w (A4) / bpl.w $244EE0` -- A4 is the PLAYER record.  A live
  // player runs blocks 1..4 first; a dead one goes straight to the shot loops.
  if ((ram.u16(player) & 0x8000) !== 0) {
    note(ctx, DMG.playerBox, `$244D84 jsr $2459D0(pc) -- the PLAYER's own box `
      + `vs the 70-slot pool $817F8E, and with it the three loops that consume `
      + `it: $244DB4 ($816B7C x $8171BA), $244E12 ($8171BE x $817F7E) and `
      + `$244E5C, whose $244ED2 subq.w #1,$16(A6) is the ONE HP an enemy loses `
      + `to being RAMMED. Ledger row L16, W28's wave 9. The port cannot run `
      + `blocks 2-4 without block 1's box, so all four defer together`);
    // $244D8A `tst.w $80FA7E / bne.w $244EE0` -- $2459D0 sets $80FA7E when the
    // player was hit, and that skips blocks 2..4.  Not simulated: the block
    // that writes it is the block above.
  }
  // ---- $244EE0: the shot bounding box.
  if (!shotBoundingBox(ram, table, d7)) {             // $244EF0 bra.w $24518A
    noteWeapons(ctx);
    return { hitsA: 0, hitsB: 0, anyShot: false };
  }
  const gate = ram.u16(DMG.gate308c);
  // ---- $244F68: pool A, $81459C, 100 slots.
  const hitsA = poolDamage(ram, DMG.poolA, ram.u16(DMG.poolACount), table, d7,
    ram.u16(DMG.fa72), gate, 'A');
  // ---- $245078: pool B, $81521C, 50 slots.  $24508C rebiases the box by
  // $F000 (= -$1000) and D7 becomes $1800; $2800 + $F000 = $1800, so the box
  // and the coordinates stay in step.  The rebias happens ONLY when
  // `$815EA0` is non-zero -- `$245086 beq.w $245188` jumps past it.
  let hitsB = 0;
  const cntB = ram.u16(DMG.poolBCount);
  if (cntB !== 0) {
    for (const a of [BOX.maxY, BOX.minY, BOX.maxX, BOX.minX]) {
      ram.setU16(a, u16(ram.u16(a) + 0xf000));        // $245096 add.w D7,(A1)+ x4
    }
    d7 = 0x1800;                                      // $24509E move.w #$1800,D7
    hitsB = poolDamage(ram, DMG.poolB, cntB, table, d7, ram.u16(DMG.fa72),
      gate, 'B');
  }
  noteWeapons(ctx);
  return { hitsA, hitsB, anyShot: true };
}

function noteWeapons(ctx) {
  note(ctx, DMG.weaponA2, `$24518A onwards -- the A2 weapon object ($811802 `
    + `for P1) against all 150 enemy slots, its own damage at $245250, and `
    + `then $24525C's A3 object ($811892) plus $24530C bsr $2453AC, THE LASER. `
    + `Ledger row L13; $24536E has one caller, $24CE46 inside the option `
    + `object, and $2453C2 executed ZERO times in 580 live-beam frames `
    + `(10-recon-combat §8.7)`);
}

/**
 * `$28B670` -- object type 5's TAIL, and the only thing in build B that reaches
 * `$244D62`.
 *
 * The four arms are transcribed whole because which one runs is the board's
 * state, not a choice: `$81308C` picks the pair, `$80390C` picks the player
 * inside each pair, and the `$28B706` arm ends at `$244D40`, which sets the
 * same three globals and then runs the PLAYER's box ONLY -- no shot loop at
 * all.  A port that assumed the P1 arm would silently damage nothing the day
 * `$80390C` went non-zero.
 */
export function runType5Tail(ram, ctx) {
  const g308c = ram.u16(DMG.gate308c);                // $28B670 tst.w $81308C
  const mirror = ram.u16(DMG.mirror2);
  if (g308c !== 0) {
    const p1 = ram.u16(DMG.p1rec);                    // $28B67A move.w $8103E6,D4
    if (p1 !== 0) {                                   // $28B680 beq $28B6C0
      if (mirror === 0) {                             // $28B6B0 tst.w / bne $28B706
        return collisionPass(ram, ctx, {              // $28B6B8 jmp $244D62
          table: DMG.p1shots, mask: DMG.maskP1,
          d1: ram.u16(DMG.hyper1), d2: ram.u16(DMG.hyperLvl1), player: DMG.p1rec });
      }
    } else {
      const p2 = ram.u16(DMG.p2rec);                  // $28B6C0 move.w $810448,D4
      if (p2 === 0) return tailNoPlayer(ram, ctx);    // $28B6C6 beq.b $28B728
      // $28B6FC `beq.b $28B706` -- and the sense is the OPPOSITE of P1's
      // `$28B6B6 bne.b $28B706` twenty-six bytes earlier.  P1 runs the pass
      // when $80390C is ZERO; P2 runs it when $80390C is NON-zero.  Reading
      // the second as a copy of the first inverts which table gets damaged.
      if (mirror !== 0) {
        return collisionPass(ram, ctx, {              // $28B6FE jmp $244D62
          table: DMG.p2shots, mask: DMG.maskP2,
          d1: ram.u16(DMG.hyper2), d2: ram.u16(DMG.hyperLvl2), player: DMG.p2rec });
      }
    }
    // $28B706: the two-player interaction arm.
    if (ram.u16(DMG.loop98) !== 0) {                  // $28B706 tst.w $813098
      if (ram.u16(DMG.g393a) === 0) return null;      // $28B710 beq $28B726 rts
      if (ram.u16(DMG.g309c) === 1) return null;      // $28B71A cmpi.w #$1 / bne
    }
    return tailNoPlayer(ram, ctx);                    // $28B728 jmp $244D40
  }
  // ---- $28B730: the `$81308C == 0` pair.  NO player-liveness test at all.
  if (mirror === 0) {                                 // $28B730 tst.w / bne $28B76E
    return collisionPass(ram, ctx, {                  // $28B766 jmp $244D62
      table: DMG.p1shots, mask: DMG.maskP1,
      d1: ram.u16(DMG.hyper1), d2: ram.u16(DMG.hyperLvl1), player: DMG.p1rec });
  }
  return collisionPass(ram, ctx, {                    // $28B79C jmp $244D62
    table: DMG.p2shots, mask: DMG.maskP2,
    d1: ram.u16(DMG.hyper2), d2: ram.u16(DMG.hyperLvl2), player: DMG.p2rec });
}

/** `$244D40` -- the same three global writes, then the PLAYER's box and
 *  nothing else.  It damages no enemy, so the port counts it whole. */
function tailNoPlayer(ram, ctx) {
  note(ctx, DMG.passNoPlayer, `$28B728 jmp $244D40 -- the no-shot entry: it `
    + `writes $80FA72/$81B6E6/$81B6E8 and then jmp $2459D0(pc), the PLAYER's `
    + `own box. It contains no shot loop and damages no enemy; ledger row L16`);
  return null;
}
