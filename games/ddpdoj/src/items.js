// THE ITEM -- POOL FAMILY SIX, `$27E812` + `$27E99E`.  WAVE 61 (I2).
//
// THE OWNER, PLAYING THE LIVE BUILD: "There's some bigger ships that show up
// now and they're supposed drop powerups, which they don't. And I'm sure the
// powerups don't work yet."
//
// W60 (I1) shipped `$2459D0` and `$244D62`'s block 2 -- the collision that
// FLAGS an item -- and measured that nothing in this port could make one.  This
// file is the item itself: dropping it, moving it, drawing it, collecting it.
//
// ======================= A SIXTH POOL FAMILY, AND ITS GEOMETRY ===============
//
// `50-recon-effects` enumerated five contiguous effect pools and W54 reproduced
// them.  There is a SIXTH, and it sits immediately BELOW impact pool A:
//
//   D0    base      stride  dbra D2  slots  body      what
//   $00   $816B7A    $40      7        8    $27EA2A   THE POWER-UP
//   $04   $816D7A    $40      1        2    $27EBDC   FULL POWER
//   $08   $816DFA    $40      1        2    $27ED8C   the $81040A set item
//   $0C   $816E7A    $40      5        6    $27EF50   P1 HYPER STOCK  ** REFUSED
//   $14   $816FFA    $40      5        6    $27F254   P2 HYPER STOCK  ** REFUSED
//   else  $81717A    $40      0        1    $27F1A6   the $8130BE counter, cap 20
//
// [M] read out of `$27E812`'s six `lea`s this session, and the arithmetic
// closes on a landmark that is not one of its own numbers:
//
//   $816B7A + 8*$40 == $816D7A + 2*$40 == $816DFA + 2*$40 == $816E7A
//   $816E7A + 6*$40 == $816FFA + 6*$40 == $81717A + 1*$40 == $8171BA  EXACT
//   $8171BA - $816B7A == $640 == 25 x $40                             EXACT
//   $27E98A clears #$321+1 words = 1,604 B = 25 slots + $8171BA + $8171BC EXACT
//   $8171BE is IMPACT POOL A's base -- so the item family and the five effect
//   pools are ONE contiguous 25 + 240 slot region.
//   $816B2A + $50 == $816B7A  -- and the family's LOWER neighbour closes on it
//   too: `src/spawn.js`'s `DEFQ_DUMMY` ($2636CA lea $816B2A,A0, the record the
//   deferred spawn queue drops into when it is full) is one $50-byte entry and
//   it ends EXACTLY where item slot 0 begins.  Nothing in this repo had noticed;
//   `tests/w61items.test.js` pins it, because a wave that widened either would
//   silently corrupt the other.
//
// **THE SIX POOLS ARE WALKED AS ONE 25-SLOT ARRAY** by the driver (`$27E9A8 lea
// $816B7A,A6`, stride `$40`) and by `$244D62`'s block 2 (`src/damage.js`), so
// the per-kind bases matter ONLY to the allocator.  `$81717A`'s single slot is
// a REAL pool, not pool B's bit bucket: a record written there is driven and
// collected normally, and the ONLY caller that reaches it (`$27B4A0`, D0 =
// `$10`) gets there through the *else* arm -- so a wrong D0 silently changes
// both the pool AND the kind.  That is why `spawnItem` range-checks D0.
//
// ============ THE REFUSAL: KINDS $0C AND $14 ARE NOT ALLOCATED FROM ==========
//
// Recon 59 §5.2 is the sharpest rank finding this project has:
//
//     item kind $C -> $2530CA addq.w #1,$81B65C   (the HYPER STOCK, uncapped)
//     ...later, at the player's NEXT SUPER:
//        $285A62 add.w $81B65C,$81B646            <- **IT ACCUMULATES**
//     ...later still: $2608D2 rank += 16 * max($81B646, $81B648)
//
// **ONE EXTRA HYPER ITEM IS +16 RANK, PERMANENTLY, PAID AT THE NEXT SUPER AND
// NOT AT PICKUP.**  Cause and symptom in different objects and different
// frames, which is exactly the failure `20-OWNER-scoring-must-be-exact` exists
// to prevent.  Recon 59 §10 puts the hyper item in wave I3 WITH the hyper
// machine for that reason, and W52/W54's precedent is to refuse rather than
// half-port.  So:
//
//   * `spawnItem` REFUSES D0 = `$C` and D0 = `$14`.  No record of either kind
//     can exist, so `$2530BE`/`$2530E6` are unreachable BY CONSTRUCTION and not
//     merely unreached.  The refusal is COUNTED with the player and the stock
//     the grant would have made, because recon 59 §11.8 is right that an
//     ungranted stock and a wrongly-granted one are both permanent rank errors
//     and only the counted one is diagnosable.
//   * the DISPATCH entries for both kinds are still present and still
//     range-checked; reaching one is a LOUD NAMED THROW, because it would mean
//     a record exists that the allocator says cannot.
//
// [M] the only `$27E812` sites this port can reach are `$275B06` and `$275B1A`
// (`handler85`'s death arm, types `$85`/`$86`), and they pass D0 = `$0` or `$8`.
// The other seven sites are the player's own death (`$24A10E`, behind the
// unported `$249F8A`), the stage-1 boss (`$294C5E`/`$294C7E`/`$294D42`/
// `$294D62`, 0 of 111 boss entry points ported) and two unattributed bodies
// (`$267CAC`, `$27B4A0` -- recon 59 §9.1).
//
// ================================ THE RECORD ================================
//
//  +$00 w  STATUS.  bit15 allocated; **low bits 2..5 = THE KIND** (`moveq #$3C`);
//          bit13 (`bset #5,(A6)`, a BYTE op on the HIGH byte) = the body has
//          initialised; **bit 12 = P1 IS TOUCHING IT, bit 11 = P2**
//          (`$244DF2 or.w $80FA72,(A6)`); bit 7 = collected AT MAX; bit 0 =
//          collected NORMALLY.  `move.l D0,(A6)` with D0 = 0 is FREE, and it
//          clears +$00 AND +$02 -- which is what lets block 2 test `+$02` for
//          emptiness while the driver tests `+$00`.
//  +$02 l  POSITION, long axis then short, copied from the DYING object's ($2,A6)
//  +$06 l  from the template; **re-used as the collected-animation LIST POINTER**
//  +$0A w  the collected-animation cursor
//  +$0C b  animation frame countdown; +$0D b its reload (`#$202` = 2/2)
//  +$0E w  animation cursor, `addq.w #4` masked `$F`.  Its HIGH byte doubles as
//          the collected animation's "drift instead of move" flag.
//  +$10 w /+$12 w  **THE COLLISION HALF-EXTENTS**, $0600 x $0600 for every kind
//  +$14 w /+$16 w  from the template; block 2 does NOT read them
//  +$18 w  lifetime/drift timer;  +$1A b SPEED index;  +$1B b ANGLE byte
//  +$1E b /+$1F b  a sub-tick and its reload (kind `$08`'s spiral)
//
// ============================== WHAT IS NOT HERE ============================
//
//  * **`$27E88A`**, the third allocator (allocate D1+1 in a loop).  [M] recon 59
//    found NO CALLER, absolute-long or PC-relative, in $230000..$2B0000, and
//    re-checked here.  Not transcribed; named.
//  * **`$27E912` and `$27F6E4`** (fill B, and the `$8171BC` spawn-variant
//    counter that wraps `$9C`->0 and `$A2`->6).  All four of `$27E912`'s callers
//    are inside the hyper-stock machine `$2875B4..$287720`, which is I3's.
//  * **`$27F8EE`** -- the impact-pool spawn the REFUSED hyper item makes when it
//    is refused by the game's own rules.  Pool A has no driver in this port
//    (`$27F95A` is type-5 call #4, unported), so W52's refusal stands.
//  * **the `$28Cxxx` sound cues** (`$28C5CA`, `$28C9F8`, `$28CA12`, `$28C65E`,
//    `$28C678`, `$28C43C`, `$28C49C`, `$28C4FC`) -- W53 §0 established that
//    family is SOUND and it is deferred with the rest of the sound wave.
//  * **the HUD draws** `$25349A`/`$2534AC` (the set-item icons), `$2533C8`/
//    `$2533D4` (its progress cue) and `$2878CC`/`$28795C` (the `$8130BE` icon
//    row).  All five reach `$240DC2`, a text/sprite subsystem no wave has
//    touched.  Counted by address.

import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { drawByte242E24, RNG } from './rng.js';
import { aim64, AimTables } from './aim.js';
import { scoreByMask, abcd } from './score.js';

// ============================== THE GEOMETRY ================================

export const ITEM = {
  alloc: 0x27e812,           // THE ALLOCATOR -- nine call sites
  allocLoop: 0x27e88a,       // ...NO CALLER, either scan.  Not transcribed
  allocHyper: 0x27e912,      // ...the hyper path.  I3's
  clear: 0x27e98a,           // the whole-family clear, #$321 words
  driver: 0x27e99e,          // THE DRIVER -- type-5 call #18
  dispatch: 0x27e9f8,        // the 8-entry kind table
  fill: 0x27f6ae,            // the 32-byte fill (26 B of template)
  fillB: 0x27f6e4,           // ...and the OTHER fill.  I3's
  templateTable: 0x27f746,   // 8 pointers, 6 templates, entries [6]/[7] = CODE
  free: 0x27f2f0,            // moveq #0 / move.l D0,(A6) / subq.w #1 / ori #1,SR
  collectTail: 0x27f54c,     // scores $10
  collectMaxTail: 0x27f582,  // scores $1000
  stepper: 0x27f5f4,         // the collected animation, 30 frames
  stepperMax: 0x27f656,      // ...and the at-max one, 17
  base: 0x816b7a,            // $27E818 / $27E9A8 / $244DA8 lea
  stride: 0x40,              // $27E87C / $27E9B0 lea ($40,A0/A6)
  slots: 25,                 // 8 + 2 + 2 + 6 + 6 + 1, and $640 / $40 == 25
  count: 0x8171ba,           // $27F6DC addq.w #1 / $27F2F4 subq.w #1
  variant: 0x8171bc,         // fill B's own counter -- NOT written by this wave
  clearWords: 0x322,         // $27E990 move.w #$321,D0 + the dbra's own pass
  scroll: 0x813176,          // $27E9B8 move.w $813176 -- subtracted from +$04
  freeze: 0x8130d2,          // $2417EA / $27EAFC tst.w
  pause30f8: 0x8130f8,       // $27EAE8 btst #$6 -- the motion's own gate
  g803912: 0x803912,         // $27EE66 tst.w -- kind $8's re-aim gate
  emitStub: 0x23eb06,        // the REGISTER-convention enqueue, bucket 17
  kindMask: 0x3c,            // $27E9DE moveq #$3C,D0 / and.w D1,D0
  dispatchEntries: 8,        // ...against SIXTEEN reachable indices
};

/** Record offsets, from the slot base.  Every one is cited on its use. */
export const I = {
  status: 0x00, pos: 0x02, posX: 0x04, list: 0x06, cursor: 0x0a,
  frame: 0x0c, reload: 0x0d, anim: 0x0e, hitLong: 0x10, hitShort: 0x12,
  h14: 0x14, h16: 0x16, life: 0x18, speed: 0x1a, angle: 0x1b,
  tick: 0x1e, tickReload: 0x1f,
};

/** The six pools the allocator picks between, in `$27E812`'s own order.
 *  `d2` is the `move.w #n,D2` a `dbra` then runs n+1 times. */
export const POOLS = Object.freeze([
  { d0: 0x00, base: 0x816b7a, d2: 7, slots: 8 },   // $27E818/$27E81E
  { d0: 0x04, base: 0x816d7a, d2: 1, slots: 2 },   // $27E82A/$27E830
  { d0: 0x08, base: 0x816dfa, d2: 1, slots: 2 },   // $27E83C/$27E842
  { d0: 0x0c, base: 0x816e7a, d2: 5, slots: 6 },   // $27E84E/$27E854
  { d0: 0x14, base: 0x816ffa, d2: 5, slots: 6 },   // $27E860/$27E866
  { d0: 0x10, base: 0x81717a, d2: 0, slots: 1 },   // $27E86C/$27E872 -- the ELSE
]);

/** The kinds this wave REFUSES TO ALLOCATE.  See §THE REFUSAL in the header. */
export const REFUSED_KINDS = Object.freeze([0x0c, 0x14]);

/** `$27E9F8`, the 8-entry kind dispatch, as the ROM's own addresses.  [M]
 *  entry [6] is THE FREE and the longword at entry [7] is `4E75 001B` --
 *  `$27EA18` IS the `rts`, so [7] is a deliberate NO-OP.  The mask is `$3C`,
 *  four bits, SIXTEEN indices against eight entries; 8..15 would `jsr` into the
 *  sprite table at `$27EA1A`. */
export const DISPATCH = Object.freeze([
  0x27ea2a, 0x27ebdc, 0x27ed8c, 0x27ef50,
  0x27f1a6, 0x27f254, 0x27f2f0, 0x27ea18,
]);

/** `$27F746`, the 8-entry template pointer table.  [M] [5] ALIASES [3], and
 *  [6]/[7] both point at `$27F7E8`, which disassembles `rts / movea.l A6,A0 /
 *  tst.w (A0) / bpl` -- CODE.  D0 = `$18` or `$1C` copies 26 bytes of
 *  instructions into a record. */
export const TEMPLATES = Object.freeze([
  0x27f766, 0x27f780, 0x27f79a, 0x27f7b4,
  0x27f7ce, 0x27f7b4, 0x27f7e8, 0x27f7e8,
]);

/** The four-frame sprite tables the bodies index with `($e,A6)` masked `$F`. */
export const ANIM4 = Object.freeze({
  0x00: 0x27ea1a, 0x04: 0x27ebcc, 0x08: 0x27ed7c, 0x10: 0x27f196,
});

/** The collected-animation lists.  Each carries an 8-byte header
 *  (`$FC00F600 $0450 $0000`, or `$FC00FA00 $0430 $0000` for the at-max one)
 *  that `$27F5F4` consumes as `d.l = pos + (A0)+ ; D3 = (A0)+ ; A0 += 2`
 *  BEFORE indexing, so entry n lives at `list + 8 + n*4`. */
export const ANIM_LISTS = Object.freeze({
  a27F300: 0x27f300, b27F380: 0x27f380, c27F400: 0x27f400,
  d27F480: 0x27f480, max27F500: 0x27f500,
});
/** `$27F64A cmpi.w #$78,($a,A6) / bge` -> 30 entries; `$27F6A2 cmpi.w #$44`
 *  -> 17.  BOTH ENDS ARE PINNED BY THE STEPPER'S OWN INSTRUCTION, and
 *  `$27F500 + 8 + 17*4 == $27F54C` is the collect tail itself. */
export const ANIM_END = { normal: 0x78, atMax: 0x44 };

/** `$242B3C`'s table.  There is **NO MASK** (`move.w $803916,D0` then
 *  `move.b (A0,D0.w),D0`), so the index is the whole word -- the same shape as
 *  `$242FDE`, and 256 bytes for the same reason.  `$242BAC..$242CAB`, and
 *  `$242CAC` is the family's NEXT `addq.b #1,$803917` site (`src/rng.js`'s own
 *  32-site scan), which pins the far end. */
export const RNG_242B3C = { routine: 0x242b3c, table: 0x242bac, entries: 256 };

/** `$242B3C` -- bump the shared counter, return `$242BAC[state]` as a BYTE.
 *  D0's high byte survives from `move.w $803916,D0` and is 0 for the same
 *  reason `$242FDE`'s is: `$23BE36 clr.w $803916` and `addq.b` never carries. */
export function drawByte242B3C(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242B3C
  const i = u16(ram.u16(RNG.state));                          // $242B42, WHOLE word
  const idx = i >= 0x8000 ? i - 0x10000 : i;                  // (A0,D0.w) is signed
  return rom.u8(RNG_242B3C.table + idx);                      // $242B50
}

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

/** `AimTables` reads and CHECKS five ROM tables in its constructor, so it must
 *  not be built once per item per frame.  Keyed on the ROM object, exactly as
 *  `src/handlers.js aimTables` is, because that makes it a pure derivation of
 *  immutable input rather than per-Game mutable state (`NOTES-replay.md` §2). */
const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

// ============================ $27E98A, THE CLEAR ============================

/** `$27E98A` -- clear the WHOLE item family: 25 slots, `$8171BA` and
 *  `$8171BC`, 1,604 bytes.  [M] two absolute-long callers, `$25FD5E` (the
 *  round init, unported) and `$28B5A8` (object type 5's "not started" branch,
 *  which `src/type5.js` throws for), so it is transcribed and unexercised --
 *  and it is ported anyway, because a pool that survives a reset it should not
 *  is `50-recon` §4.3 item 6 and it is twenty bytes. */
export function clearItemPool(ram) {
  for (let i = 0; i < ITEM.clearWords; i++) {          // $27E998 dbra
    ram.setU16(ITEM.base + i * 2, 0);                  // $27E994 move.w #0,(A0)+
  }
}

// ========================= $27E812 + $27F6AE, THE DROP ======================
//
//   27e812: cmpi.w #$0,D0 / bne ... -- a five-way ladder over $0 $4 $8 $C $14
//           and an ELSE arm, each `lea <base>,A0 / move.w #n,D2`
//   27e876: tst.w (A0) / beq.w $27F6AE      <- a FREE slot falls into THE FILL
//   27e87c: lea ($40,A0),A0 / dbra D2,$27E876
//   27e884: moveq #0,D2 / subq.w #1,D2 / rts  <- FULL: D2 = $FFFF and CARRY SET,
//                                                and NEITHER call site tests it
//
// **THE FAILURE IS SILENT AT BOTH REACHABLE CALL SITES.**  `$275B0C tst.w
// $81308C` is the next instruction after `$275B06 jsr $27E812` and it overwrites
// the flags.  So a full pool loses the drop with no signal at all -- which is
// exactly W33 §4's shape, and why this port COUNTS it.

/**
 * `$27E812` -- allocate one item record of kind `d0` at the dying object's
 * position, and fill it from `$27F746[d0]`.
 *
 * @param a6 the DYING object's record; `$27F6C4 move.l ($2,A6),(A0)+` takes its
 *   position longword and nothing else.
 * @returns {number|null} the slot address, or `null` when the pool was full or
 *   the kind was refused -- which is what the ROM's `rts` with carry set means
 *   to a caller that does not look.
 */
export function spawnItem(ram, rom, ctx, d0, a6, siteAddr = ITEM.alloc) {
  // --------------------------------------------------- §THE REFUSAL (header)
  if (REFUSED_KINDS.includes(d0)) {
    const who = d0 === 0x0c ? 'P1' : 'P2';
    const stock = d0 === 0x0c ? 0x81b65c : 0x81b65e;
    note(ctx, d0 === 0x0c ? 0x2530be : 0x2530e6, `$27E812 D0=$${
      d0.toString(16).toUpperCase()} -- a ${who} HYPER STOCK item, REFUSED (not `
      + `allocated) at site $${siteAddr.toString(16).toUpperCase()}. Collecting `
      + `one runs $${(d0 === 0x0c ? 0x2530be : 0x2530e6).toString(16)
        .toUpperCase()}, whose \`addq.w #1,$${stock.toString(16).toUpperCase()}\` `
      + `is UNCAPPED at the increment; $285A62 later does `
      + `\`add.w $${stock.toString(16).toUpperCase()},$81B646\` -- it ACCUMULATES `
      + `-- and $2608D2 turns that into +16 RANK PER STOCK LEVEL, PERMANENTLY, `
      + `paid at the player's NEXT SUPER and not at pickup. Recon 59 5.2. The `
      + `hyper machine ($2875B4..$287720, $285A12) is unported, so granting the `
      + `stock here would plant a rank error nothing in this port could spend. `
      + `WAVE I3 ships this WITH the machine. The stock this would have made: `
      + `$${stock.toString(16).toUpperCase()} + 1`);
    return null;
  }
  const pool = POOLS.find((p) => p.d0 === d0) ?? POOLS[POOLS.length - 1];
  if (pool.d0 !== d0 && d0 !== 0x10) {
    // The ELSE arm is `$27E86C`, and `$27B4A0`'s `$10` is the only D0 any caller
    // passes into it.  Anything else lands in the SAME one-slot pool and is
    // then dispatched as kind `d0 & $3C`, i.e. a different item entirely.
    unreached(0x27e86c, `$27E812's ELSE arm -- D0 = $${d0.toString(16)
      .toUpperCase()} is not one of the six kinds {0,4,8,$C,$10,$14}, so it `
      + `would allocate from $81717A's ONE slot and then be dispatched through `
      + `$27E9F8 as index ${(d0 & ITEM.kindMask) >> 2}. A wrong D0 silently `
      + `changes the item's pool AND its kind. Site $${siteAddr.toString(16)
        .toUpperCase()}`);
  }
  for (let n = 0; n <= pool.d2; n++) {                 // $27E880 dbra D2
    const a0 = pool.base + n * ITEM.stride;            // $27E87C lea ($40,A0),A0
    if (ram.u16(a0 + I.status) !== 0) continue;        // $27E876 tst.w (A0) / beq
    fill27F6AE(ram, rom, ctx, a0, d0, a6);             // $27E878 beq.w $27F6AE
    ctx?.itemSpawn?.(d0, siteAddr, a0);
    return a0;
  }
  note(ctx, 0x27e884, `$27E812 found NO FREE SLOT in kind $${d0.toString(16)
    .toUpperCase()}'s ${pool.slots}-slot pool $${pool.base.toString(16)
    .toUpperCase()} and returned D2 = $FFFF with CARRY SET -- and NEITHER `
    + `reachable call site tests it ($275B0C tst.w $81308C is the very next `
    + `instruction and overwrites the flags). The drop is LOST, silently, on `
    + `the board too. Site $${siteAddr.toString(16).toUpperCase()}`);
  return null;
}

/**
 * `$27F6AE` -- THE FILL.  Thirty-two bytes: the status word, the dying object's
 * position longword, and **26 bytes copied verbatim from the ROM template**.
 *
 *   27f6b2: move.w D0,D1 / ori.w #$8000,D1        <- status = kind | allocated
 *   27f6b8: lea ($27F746,PC),A2 / movea.l (A2,D0.w),A2   <- D0 as a BYTE offset
 *   27f6c2: move.w D1,(A0)+                       +$00
 *   27f6c4: move.l ($2,A6),(A0)+                  +$02 from the DYING object
 *   27f6c8: (A2)+ x6 longs then a word            +$06..+$1F
 *   27f6dc: addq.w #1,$8171BA                     <- THE LIVE COUNT
 *
 * **`+$20..+$3F` ARE NOT WRITTEN.**  The fill is 32 of the record's 64 bytes and
 * nothing zeroes the rest, so a re-used slot keeps the previous item's tail.
 * No field above `+$1F` is read by anything in this file; it is stated because
 * a port that "helpfully" cleared the record would differ from the board on any
 * future reader of `+$20`.
 */
export function fill27F6AE(ram, rom, ctx, a0, d0, a6) {
  const idx = d0 >> 2;
  if (d0 < 0 || d0 > 0x14 || (d0 & 3) !== 0 || idx > 5) {
    unreached(ITEM.templateTable, `$27F6B8 movea.l ($27F746,A2,D0.w) -- D0 = `
      + `$${d0.toString(16).toUpperCase()} indexes the 8-entry template table `
      + `outside its SIX templates. Entries [6] and [7] both point at $27F7E8, `
      + `which is \`4E75 204E 4A50 6AF8\` -- \`rts / movea.l A6,A0 / tst.w (A0) `
      + `/ bpl\`, i.e. CODE -- so D0 = $18 or $1C copies 26 bytes of `
      + `INSTRUCTIONS into the record's +$06..+$1F, which includes the collision `
      + `half-extents and the lifetime`);
  }
  const tmpl = TEMPLATES[idx];
  ram.setU16(a0 + I.status, u16(d0 | 0x8000));         // $27F6B4/$27F6C2
  ram.setU32(a0 + I.pos, ram.u32(a6 + 0x02));          // $27F6C4 move.l ($2,A6)
  for (let i = 0; i < 6; i++) {                        // $27F6C8..$27F6D2, 6 longs
    ram.setU32(a0 + 0x06 + i * 4, rom.u32(tmpl + i * 4));
  }
  ram.setU16(a0 + 0x1e, rom.u16(tmpl + 24));           // $27F6D4 move.w (A2)+
  ram.setU16(ITEM.count, u16(ram.u16(ITEM.count) + 1));  // $27F6DC addq.w #1
  return a0;
}

// =============================== $27F2F0, THE FREE ==========================

/** `$27F2F0` -- 14 bytes, and **it clears a LONGWORD**: `+$00` AND `+$02`.
 *  That is what lets `$244D62`'s block 2 test `+$02` for emptiness while this
 *  file's driver tests `+$00`; two different emptiness tests on one record,
 *  consistent only because of this clear.  `ori #$1,SR` sets CARRY, which is
 *  how the eleven `bcs`/`bcc` sites that reach it tell their callers to stop. */
export function freeItem(ram, a6) {
  ram.setU32(a6 + I.status, 0);                        // $27F2F2 move.l D0,(A6)
  ram.setU16(ITEM.count, u16(ram.u16(ITEM.count) - 1));  // $27F2F4 subq.w #1
  return true;                                         // $27F2FA ori #$1,SR
}

// =========================== $27E99E, THE DRIVER ============================
//
//   27e99e: move.w $8171BA,D7 / beq rts     <- LIVE-COUNT driven, not a full walk
//   27e9a6: subq.w #1,D7 / lea $816B7A,A6 / bra $27E9B4
//   27e9b0: lea ($40,A6),A6                 <- the EMPTY-SLOT SKIP, which does
//   27e9b4: move.w (A6),D1 / beq $27E9B0       NOT consume the dbra
//   27e9b8: sub.w $813176,($4,A6)           <- THE SCROLL, on the SHORT axis
//   27e9c2: btst #7,($1,A6) / bne $27E9D6   <- collected AT MAX
//   27e9cc: btst #0,($1,A6) / beq $27E9DE   <- collected NORMALLY
//   27e9d6: bsr $27F5F4                     <- either one -> the ANIMATION
//   27e9de: moveq #$3C,D0 / and.w D1,D0
//           lea ($27E9F8,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
//   27e9ee: lea ($40,A6),A6 / dbra D7,$27E9B4
//
// **THE WALK IS BOUNDED BY THE COUNT AND BY NOTHING ELSE.**  If `$8171BA` ever
// over-reported, the empty-slot skip would walk off the end of the 25 slots into
// `$8171BA` itself, then into `$8171BE` -- impact pool A -- and drive whatever it
// found there as an item.  This port makes that a LOUD NAMED THROW rather than a
// silent overrun, because the count and the slots agreeing is exactly the
// invariant the pool census exists to prove.

/**
 * `$27E99E` -- step, animate, collect and emit the whole item family, once per
 * frame.  Type-5 call #18 (`$28B64C`), listed in `src/type5.js calls[17]`.
 * @returns telemetry; the ROM returns none.
 */
export function runItemDriver(ram, rom, ctx) {
  let d7 = ram.u16(ITEM.count);                        // $27E99E move.w $8171BA,D7
  const t = { live: 0, emitted: 0, freed: 0, collected: 0, walked: 0 };
  if (d7 === 0) return t;                              // $27E9A4 beq
  let slot = 0;
  for (let n = 0; n < d7; n++) {                       // $27E9F2 dbra D7
    // $27E9B4 move.w (A6),D1 / beq $27E9B0 -- scan forward over FREE slots
    // WITHOUT consuming the counter.
    let a6 = -1;
    for (; slot < ITEM.slots; slot++) {
      const r = ITEM.base + slot * ITEM.stride;
      if (ram.u16(r + I.status) !== 0) { a6 = r; break; }
    }
    if (a6 < 0) {
      unreached(0x27e9b0, `$27E99E's walk ran out of slots with `
        + `$8171BA = ${d7} and only ${t.live} live record(s) found in the `
        + `${ITEM.slots}-slot family. On the board `
        + `\`$27E9B0 lea ($40,A6),A6 / move.w (A6),D1 / beq\` would keep `
        + `walking past $8171BA into $8171BE -- IMPACT POOL A -- and drive `
        + `whatever it found there as an item. The live count and the slots `
        + `have disagreed, which is the one thing $27F6AE's addq and $27F2F0's `
        + `subq exist to keep true`);
    }
    slot++;
    t.live++; t.walked++;
    const d1 = ram.u16(a6 + I.status);                 // $27E9B4 move.w (A6),D1
    ram.setU16(a6 + I.posX,                            // $27E9BE sub.w D0,($4,A6)
      u16(ram.u16(a6 + I.posX) - ram.u16(ITEM.scroll)));

    const hi = ram.u8(a6 + 0x01);                      // $27E9C2/$27E9CC btst
    if ((hi & 0x80) !== 0 || (hi & 0x01) !== 0) {
      t.collected++;
      if (collectedStep27F5F4(ram, rom, ctx, a6)) t.freed++;   // $27E9D6 bsr
      continue;                                        // $27E9DA bra $27E9EE
    }
    // $27E9DE: THE KIND DISPATCH.  `moveq #$3C` is FOUR BITS -- sixteen indices
    // against eight entries -- so 8..15 would `jsr` into $27EA1A, the kind-$0
    // sprite table.  Range-checked and thrown, exactly as `50-recon` §1.3
    // requires for `$288FF0` and `src/effects.js` does for its emitter.
    const d0 = d1 & ITEM.kindMask;                     // $27E9DE/$27E9E0
    // **D0 IS A BYTE OFFSET, NOT AN INDEX**, and that is why the mask is `$3C`
    // and not `$3F`: `$27E9E8 adda.w D0,A0 / $27E9EA movea.l (A0),A0` reads a
    // LONGWORD at `$27E9F8 + D0`, so a D0 that is not a multiple of 4 reads a
    // longword straddling two entries -- and on a real 68000 an odd one is an
    // ADDRESS ERROR.  A port that divides by 4 first cannot tell `$3C` from
    // `$3F`; this checks the offset the ROM actually forms.
    if ((d0 & 3) !== 0) {
      unreached(ITEM.dispatch, `$27E9E8 adda.w D0,A0 -- the kind mask produced `
        + `byte offset $${d0.toString(16).toUpperCase()}, which is not a `
        + `longword boundary in the 8-entry table $27E9F8. \`moveq #$3C\` is `
        + `four bits ALIGNED; a mask that let bits 0 or 1 through would read a `
        + `pointer straddling two entries. Record at `
        + `$${a6.toString(16).toUpperCase()}, status `
        + `$${d1.toString(16).toUpperCase()}`);
    }
    const idx = d0 >> 2;
    if (idx >= ITEM.dispatchEntries) {
      unreached(ITEM.dispatch, `$27E9E2 lea ($27E9F8,PC),A0 / adda.w D0,A0 / `
        + `movea.l (A0),A0 / jsr (A0) -- a LIVE item record carries status `
        + `$${d1.toString(16).toUpperCase()}, whose masked kind $${d0.toString(16)
          .toUpperCase()} is index ${idx} of a ${ITEM.dispatchEntries}-entry `
        + `table. The mask is $3C, so indices 8..15 are REACHABLE and land in `
        + `the sprite-address table at $27EA1A -- the board would jsr into `
        + `sprite data. Record at $${a6.toString(16).toUpperCase()}`);
    }
    const r = runBody(ram, rom, ctx, a6, d1, idx);
    if (r?.freed) t.freed++;
    if (r?.emitted) t.emitted++;
  }
  return t;
}

/** `$27E9F8`'s eight entries, by index.  [6] is THE FREE and [7] is a
 *  deliberate `rts` -- the longword at `$27EA18` is `4E75 001B`, i.e. the `rts`
 *  itself, so entry [7] is a NO-OP and not a bug. */
function runBody(ram, rom, ctx, a6, d1, idx) {
  switch (idx) {
    case 0: return body27EA2A(ram, rom, ctx, a6, d1);       // kind $00 POWER-UP
    case 1: return body27EBDC(ram, rom, ctx, a6, d1);       // kind $04 FULL POWER
    case 2: return body27ED8C(ram, rom, ctx, a6, d1);       // kind $08 SET ITEM
    case 3: case 5:                                         // kinds $0C / $14
      unreached(DISPATCH[idx], `$27E9F8[${idx}] -- a LIVE item record of kind `
        + `$${(idx * 4).toString(16).toUpperCase()} reached the dispatch. This `
        + `wave REFUSES to allocate the hyper-stock kinds (see src/items.js `
        + `§THE REFUSAL), so no such record can exist: something wrote a status `
        + `word behind $27E812. Its collect arm $${(idx === 3 ? 0x2530be
          : 0x2530e6).toString(16).toUpperCase()} raises $${(idx === 3
            ? 0x81b65c : 0x81b65e).toString(16).toUpperCase()}, which $285A62 `
        + `ACCUMULATES into the rank power at the player's next super`);
      return null;
    case 4: return body27F1A6(ram, rom, ctx, a6, d1);       // kind $10 COUNTER
    case 6: return { freed: freeItem(ram, a6) };            // $27F2F0 THE FREE
    case 7: return null;                                    // $27EA18 rts
    default: return null;
  }
}

// ============================ THE SHARED PIECES =============================

/** `$2417DE`, on the ITEM RECORD ITSELF.  `src/movement.js applyVelocity` is
 *  the same six instructions wrapped for an enemy's `A5 -> sub-record`; the
 *  item pool calls the raw form with A6 already on the record, so it is written
 *  out here rather than bent to fit.  D0 is the SPEED INDEX and D1 the ANGLE. */
function applyItemVelocity(ram, ctx, a6) {
  const speed = ram.u8(a6 + I.speed);                  // $2417E0 move.b ($1a,A6)
  const angle = ram.u8(a6 + I.angle) & 0x3f;           // $2417E4/$2417E6
  if (ram.u16(ITEM.freeze) !== 0) return;              // $2417EA tst.w $8130D2
  const v = ctx.tables.vector(speed, angle);           // $2417F2 bsr $241812
  ram.setU16(a6 + I.pos, u16(i16(ram.u16(a6 + I.pos)) + v.dy));    // $2417F4
  ram.setU16(a6 + I.posX, u16(i16(ram.u16(a6 + I.posX)) + v.dx));  // $2417F8
}

/** `$2417B6` -- the scroll pair, returned rather than applied.  Kind `$10`'s
 *  motion adds only D2, which is why this is not `$24179E`. */
function scrollPair2417B6(ram) {
  if (ram.u16(ITEM.freeze) !== 0) return { d2: 0, d3: 0 };  // $2417B6 tst.w / bne
  return { d2: ram.u16(0x80b03c), d3: ram.u16(0x80b03e) };  // $2417C0/$2417C6
}

/** `$242684` -- the off-screen test, returning CARRY.  `move.l ($2,A6),D0`,
 *  then `+$1C00 + $813172 - $7000` on the SHORT axis (the low word) with the
 *  branch on the SECOND `addi`, and `swap` + `+$800 - $8000` on the LONG.
 *  Only the two `addi`s that are branched on decide anything. */
function offScreen242684(ram, a6) {
  const p = ram.u32(a6 + I.pos);
  let d0 = u16((p & 0xffff) + 0x1c00);                 // $242688 addi.w #$1C00
  d0 = u16(d0 + ram.u16(0x813172));                    // $24268C add.w $813172
  if (d0 + 0x9000 > 0xffff) return true;               // $242692/$242696 bcs
  const hi = u16((p >>> 16) + 0x800);                  // $242698 swap / $24269A
  return hi + 0x8000 > 0xffff;                         // $24269E addi.w #-$8000
}

/** `$242494` -- an OCTAGONAL distance from `($2,A6)` to (D2, D3).
 *  `|dy| - |dy|>>2` against `|dx|`, then `max + min/2`.  Not a norm anybody
 *  would write down; transcribed because kind `$8`'s latch threshold `$200` is
 *  measured against exactly this arithmetic. */
function dist242494(ram, a6, d2, d3) {
  let d0 = u16(ram.u16(a6 + I.pos) - d2);              // $242494/$24249A sub.w
  if (d0 & 0x8000) d0 = u16(-d0);                      // $24249C bpl / neg.w
  const d4 = d0 >>> 2;                                 // $2424A2 lsr.w #2
  d0 = u16(d0 - d4);                                   // $2424A4 sub.w D4,D0
  let d1 = u16(ram.u16(a6 + I.posX) - d3);             // $2424A6 sub.w D3,D1
  if (d1 & 0x8000) d1 = u16(-d1);                      // $2424A8 bpl / neg.w
  if (d0 < d1) { const t = d0; d0 = d1; d1 = t; }      // $2424AC cmp/bcc/exg
  return u16(d0 + (d1 >>> 1));                         // $2424B2 lsr.w #1 / add.w
}

/** The `$23EB06` emit every body and both steppers end with.  D1 is packed
 *  LONG:SHORT and `$23EB1C asr.l #6` runs on the whole 32 bits, which is why it
 *  is built as one value here and not as two. */
function emit23EB06(ram, rom, longAxis, shortAxis, d2, d3, d4) {
  const d1 = (((longAxis & 0xffff) << 16) | (shortAxis & 0xffff)) >>> 0;
  enqueueRegistersThroughStub(ram, rom, ITEM.emitStub, d1, d2, d3, d4);
}

/** The four-frame sprite table read, RANGE-CHECKED.  `($e,A6)` is masked `$F`
 *  by `$27EA9A andi.w #$F`, so it can hold 0..15 -- but only 0/4/8/$C are
 *  multiples of 4, and a table of FOUR longwords is 16 bytes.  An odd cursor
 *  would read a longword straddling two entries. */
function anim4Stream(rom, table, cursor, site) {
  if ((cursor & 3) !== 0 || cursor >= 16) {
    unreached(site, `$${site.toString(16).toUpperCase()} adda.w ($e,A6),A0 -- `
      + `the animation cursor is $${cursor.toString(16).toUpperCase()}, which `
      + `is not a longword index inside the FOUR-entry sprite table `
      + `$${table.toString(16).toUpperCase()}. \`addq.w #4\` masked \`$F\` can `
      + `only produce 0/4/8/$C, so the record's +$0E was written by something `
      + `other than this body`);
  }
  return rom.u32(table + cursor);
}

// ================================ KIND $00 ==================================
// **THE POWER-UP** -- `$27EA2A`, collect `$252C96` (P1) / `$252D24` (P2).
//
// Five parts, and every one of the four ported bodies has the same five:
//   1. an init behind `btst #$D,D1` (bit 13 = "the body has run once")
//   2. the `andi.w #$1800,D1` COLLECTION test and its P1/P2 fork
//   3. a motion `bsr` that returns CARRY when the record freed itself
//   4. the animation advance, `subq.b #1,($c,A6)` on the BORROW
//   5. the emit, as a `jmp` -- the body's last instruction IS the enqueue

function body27EA2A(ram, rom, ctx, a6, d1) {
  if ((d1 & 0x2000) === 0) {                           // $27EA2A btst #$D / bne
    ram.setU8(a6, ram.u8(a6) | 0x20);                  // $27EA32 bset #5,(A6) BYTE
    init27EACE(ram, rom, a6);                          // $27EA36 bsr $27EACE
    ram.setU16(a6 + I.frame, 0x0202);                  // $27EA3A move.w #$202
    ram.setU16(a6 + I.anim, 0x0000);                   // $27EA40 move.w #$0
  }
  const touch = d1 & 0x1800;                           // $27EA46 andi.w #$1800
  if (touch !== 0) {                                   // $27EA4A beq $27EA82
    if ((touch & 0x1000) !== 0) {                      // $27EA4E btst #$C / beq
      if (collect252C96(ram, rom, ctx)) {              // $27EA56 jsr / $27EA5C bcs
        return { collected: true, ...collectMax27F582(ram, rom, ctx, a6) };
      }
    } else {
      if (collect252D24(ram, rom, ctx)) {              // $27EA76 jsr / $27EA7C bcc
        return { collected: true, ...collectMax27F582(ram, rom, ctx, a6) };
      }
    }
    note(ctx, 0x28c5ca, '$27EA60 jsr $28C5CA -- the item PICKUP sound');
    note(ctx, 0x28c9f8, '$27EA66 jsr $28C9F8 -- the POWER-UP\'s own cue');
    collect27F54C(ram, rom, ctx, a6, ANIM_LISTS.d27F480);   // $27EA6C/$27EA72
    return { collected: true };
  }
  if (motion27EAE8(ram, rom, ctx, a6)) return { freed: true };  // $27EA82/$27EA86
  advanceAnim4(ram, a6);                               // $27EA8A..$27EA9A
  // $27EAA0: D1 = (($2,A6) - $600) : (($4,A6) - $300), then the sprite.
  emit23EB06(ram, rom,
    u16(ram.u16(a6 + I.pos) - 0x600),                  // $27EAA4 addi.w #-$600
    u16(ram.u16(a6 + I.posX) - 0x300),                 // $27EAAE addi.w #-$300
    anim4Stream(rom, ANIM4[0x00], ram.u16(a6 + I.anim), 0x27eab6),
    0x0618,                                            // $27EABC move.w #$618,D3
    0x001b);                                           // $27EAC0 move.w #$1B,D4
  return { emitted: true };
}

/** `$27EACE` -- kind `$0`'s init.  **IT DRAWS FROM THE RNG**: the launch angle
 *  is `($242E24 >> 1) + $10`, so an item's trajectory is random and the shared
 *  `$803916`/`$803917` counters move on the frame it first runs.  Recon 59
 *  says the DROP has no RNG in it, which is true and is about `$275AF2..
 *  $275B20`; the ITEM does. */
function init27EACE(ram, rom, a6) {
  ram.setU32(a6 + I.life, 0x0700_0b00);                // $27EACE move.l #$7000B00
  let d0 = drawByte242E24(ram, rom);                   // $27EAD6 jsr $242E24
  d0 = (d0 >>> 1) & 0x7f;                              // $27EADC lsr.b #1,D0
  ram.setU8(a6 + I.angle, (d0 + 0x10) & 0xff);         // $27EADE/$27EAE2
}

/**
 * `$27EAE8` -- kind `$0`'s motion, 210 bytes, and the biggest single thing in
 * this file.  It is a BOUNCING drift with two independent walls:
 *
 *   * `$8130F8` bit 6 or a zero lifetime skips the whole bounce block;
 *   * the SHORT axis bounces off `$B00` (low) and `$3D00` (high) -- and on each
 *     bounce the angle is REFLECTED (`neg.b`), then jittered by `$242B3C`;
 *   * the LONG axis has a THREE-way test (`$6D00` high, `$700` low, otherwise
 *     nothing) whose two arms accept opposite angle windows.
 *
 * Kind `$4`'s `$27EC98` is the same 210 bytes with ONE constant different
 * (`$27ECFA cmpi.w #$3500` where this has `$27EB4A cmpi.w #$2B00`), so the two
 * are written out separately rather than parameterised -- a shared helper with
 * a magic argument is how a transcription stops being checkable.
 *
 * @returns {boolean} CARRY -- the record freed itself.
 */
function motion27EAE8(ram, rom, ctx, a6) {
  if ((ram.u8(ITEM.pause30f8) & 0x40) !== 0) return tail27EBBA(ram, ctx, a6);
  if (ram.u16(a6 + I.life) === 0) return tail27EBBA(ram, ctx, a6);  // $27EAF4
  if (ram.u16(ITEM.freeze) === 0) {                    // $27EAFC tst.w $8130D2
    ram.setU16(a6 + I.life, u16(ram.u16(a6 + I.life) - 1));   // $27EB04 subq.w #1
  }
  const d0 = u16(ram.u16(a6 + I.posX) + 0x800);        // $27EB08/$27EB0C
  if (d0 <= 0x0b00) {                                  // $27EB10 cmpi.w #$B00/bls
    ram.setU16(a6 + I.posX, 0x0300);                   // $27EB3C move.w #$300
    if (ram.u8(a6 + I.angle) >= 0x20) {                // $27EB42 cmpi.b #$20/bcs
      if (ram.u16(a6 + I.pos) >= 0x2b00) {             // $27EB4A cmpi.w #$2B00/bcs
        ram.setU8(a6 + I.angle, 0x28);                 // $27EB52 move.b #$28
      }
      reflect27EB58(ram, rom, a6);
    }
  } else if (d0 >= 0x3d00) {                           // $27EB16 cmpi.w #$3D00/bcc
    ram.setU16(a6 + I.posX, 0x3500);                   // $27EB1E move.w #$3500
    if (ram.u8(a6 + I.angle) <= 0x20) {                // $27EB24 cmpi.b #$20/bhi
      if (ram.u16(a6 + I.pos) < 0x2b00) {              // $27EB2C cmpi.w #$2B00/bcs
        // $27EB32 bra $27EB58 -- the LOW arm reflects WITHOUT the #$18 write.
      } else {
        ram.setU8(a6 + I.angle, 0x18);                 // $27EB34 move.b #$18
      }
      reflect27EB58(ram, rom, a6);
    }
  }
  // $27EB6C: THE LONG AXIS, three ways.  `$27EB1C bra $27EB6C` is the middle
  // arm -- neither wall -- so all three fall through to here.
  const y = ram.u16(a6 + I.pos);
  const ang = ram.u8(a6 + I.angle);
  if (y >= 0x6d00) {                                   // $27EB6C cmpi.w #$6D00/bcc
    if (ang < 0x10 || ang > 0x30) {                    // $27EB7E/$27EB86
      bounceLong27EBA0(ram, rom, a6);                  // $27EB84/$27EB8C bra $27EBA0
    }
  } else if (y <= 0x0700) {                            // $27EB74 cmpi.w #$700/bls
    if (ang > 0x10 && ang <= 0x30) {                   // $27EB90/$27EB98
      bounceLong27EBA0(ram, rom, a6);
    }
  }
  return tail27EBBA(ram, ctx, a6);
}

/** `$27EB58` / `$27ED08` -- reflect the angle and jitter it.  `neg.b` then
 *  `+ $242B3C` masked `$3F`.  **A SECOND RNG DRAW PER BOUNCE.** */
function reflect27EB58(ram, rom, a6) {
  ram.setU8(a6 + I.angle, (-ram.u8(a6 + I.angle)) & 0xff);   // $27EB58 neg.b
  const d0 = drawByte242B3C(ram, rom);                       // $27EB5C jsr $242B3C
  ram.setU8(a6 + I.angle, (ram.u8(a6 + I.angle) + d0) & 0xff);  // $27EB62 add.b
  ram.setU8(a6 + I.angle, ram.u8(a6 + I.angle) & 0x3f);      // $27EB66 andi.b #$3F
}

/** `$27EBA0` / `$27ED50` -- the LONG axis's bounce: `+$20` THEN the reflect. */
function bounceLong27EBA0(ram, rom, a6) {
  ram.setU8(a6 + I.angle, (ram.u8(a6 + I.angle) + 0x20) & 0xff);  // $27EBA0 addi.b
  reflect27EB58(ram, rom, a6);                                    // $27EBA6..
}

/** `$27EBBA` -- every motion routine's tail: move, then the off-screen free. */
function tail27EBBA(ram, ctx, a6) {
  applyItemVelocity(ram, ctx, a6);                     // $27EBBA jsr $2417DE
  if (offScreen242684(ram, a6)) {                      // $27EBC0 jsr / $27EBC6 bcs
    freeItem(ram, a6);                                 // $27F2F0
    return true;
  }
  return false;                                        // $27EBCA rts
}

/** `$27EA8A..$27EA9A` -- the four-frame animation, shared by all four bodies
 *  instruction for instruction.  `subq.b #1,($c,A6) / bcc` advances on the
 *  BORROW, i.e. one frame AFTER the counter reaches zero. */
function advanceAnim4(ram, a6) {
  const c = ram.u8(a6 + I.frame);                      // $27EA8A subq.b #1
  ram.setU8(a6 + I.frame, (c - 1) & 0xff);
  if (c !== 0) return;                                 // $27EA8E bcc
  ram.setU8(a6 + I.frame, ram.u8(a6 + I.reload));      // $27EA90 move.b ($d,A6)
  ram.setU16(a6 + I.anim, u16(ram.u16(a6 + I.anim) + 4));   // $27EA96 addq.w #4
  ram.setU16(a6 + I.anim, ram.u16(a6 + I.anim) & 0x0f);     // $27EA9A andi.w #$F
}

// ================================ KIND $04 ==================================
// **FULL POWER** -- `$27EBDC`, collect `$252DAC` / `$252E26`.

function body27EBDC(ram, rom, ctx, a6, d1) {
  if ((d1 & 0x2000) === 0) {                           // $27EBDC btst #$D
    ram.setU8(a6, ram.u8(a6) | 0x20);                  // $27EBE4 bset #5,(A6)
    init27EC7E(ram, rom, a6);                          // $27EBE8 bsr $27EC7E
    ram.setU16(a6 + I.frame, 0x0202);                  // $27EBEC
    ram.setU16(a6 + I.anim, 0x0000);                   // $27EBF2
  }
  const touch = d1 & 0x1800;                           // $27EBF8
  if (touch !== 0) {
    if ((touch & 0x1000) !== 0) {                      // $27EC00 btst #$C
      if (collect252DAC(ram, rom, ctx)) {              // $27EC08/$27EC0E bcs
        return { collected: true, ...collectMax27F582(ram, rom, ctx, a6) };
      }
    } else if (collect252E26(ram, rom, ctx)) {         // $27EC28/$27EC2E bcc
      return { collected: true, ...collectMax27F582(ram, rom, ctx, a6) };
    }
    note(ctx, 0x28c5ca, '$27EC12 jsr $28C5CA -- the item PICKUP sound');
    note(ctx, 0x28c9f8, '$27EC18 jsr $28C9F8 -- FULL POWER\'s own cue');
    collect27F54C(ram, rom, ctx, a6, ANIM_LISTS.d27F480);   // $27EC1E/$27EC24
    return { collected: true };
  }
  if (motion27EC98(ram, rom, ctx, a6)) return { freed: true };
  advanceAnim4(ram, a6);                               // $27EC3C..$27EC4C
  emit23EB06(ram, rom,
    u16(ram.u16(a6 + I.pos) - 0x400),                  // $27EC56 addi.w #-$400
    u16(ram.u16(a6 + I.posX) - 0x400),                 // $27EC60 addi.w #-$400
    anim4Stream(rom, ANIM4[0x04], ram.u16(a6 + I.anim), 0x27ec68),
    0x0420,                                            // $27EC6E move.w #$420,D3
    0x001b);                                           // $27EC72 move.w #$1B,D4
  return { emitted: true };
}

/** `$27EC7E` -- kind `$4`'s init.  The SAME lifetime/speed longword as kind
 *  `$0`'s, and the same RNG draw, but the angle is `$242E24 | $8` rather than
 *  `($242E24 >> 1) + $10`. */
function init27EC7E(ram, rom, a6) {
  ram.setU32(a6 + I.life, 0x0700_0b00);                // $27EC7E move.l #$7000B00
  const d0 = drawByte242E24(ram, rom);                 // $27EC86 jsr $242E24
  ram.setU8(a6 + I.angle, d0 & 0xff);                  // $27EC8C move.b D0
  ram.setU8(a6 + I.angle, ram.u8(a6 + I.angle) | 0x08);  // $27EC90 ori.b #$8
}

/** `$27EC98` -- kind `$4`'s motion.  Kind `$0`'s `$27EAE8` with ONE constant
 *  changed: `$27ECFA cmpi.w #$3500,($2,A6)` where `$27EB4A` has `#$2B00`.
 *  Written out rather than shared, for the reason `motion27EAE8` gives. */
function motion27EC98(ram, rom, ctx, a6) {
  if ((ram.u8(ITEM.pause30f8) & 0x40) !== 0) return tail27EBBA(ram, ctx, a6);
  if (ram.u16(a6 + I.life) === 0) return tail27EBBA(ram, ctx, a6);  // $27ECA4
  if (ram.u16(ITEM.freeze) === 0) {                    // $27ECAC
    ram.setU16(a6 + I.life, u16(ram.u16(a6 + I.life) - 1));   // $27ECB4
  }
  const d0 = u16(ram.u16(a6 + I.posX) + 0x800);        // $27ECB8/$27ECBC
  if (d0 <= 0x0b00) {                                  // $27ECC0 bls $27ECEC
    ram.setU16(a6 + I.posX, 0x0300);                   // $27ECEC move.w #$300
    if (ram.u8(a6 + I.angle) >= 0x20) {                // $27ECF2 cmpi.b #$20/bcs
      if (ram.u16(a6 + I.pos) >= 0x3500) {             // $27ECFA cmpi.w #$3500/bcs
        ram.setU8(a6 + I.angle, 0x28);                 // $27ED02 move.b #$28
      }
      reflect27EB58(ram, rom, a6);                     // $27ED08
    }
  } else if (d0 >= 0x3d00) {                           // $27ECC6 bcc $27ECCE
    ram.setU16(a6 + I.posX, 0x3500);                   // $27ECCE move.w #$3500
    if (ram.u8(a6 + I.angle) <= 0x20) {                // $27ECD4 cmpi.b #$20/bhi
      if (ram.u16(a6 + I.pos) >= 0x2b00) {             // $27ECDC cmpi.w #$2B00/bcs
        ram.setU8(a6 + I.angle, 0x18);                 // $27ECE4 move.b #$18
      }
      reflect27EB58(ram, rom, a6);
    }
  }
  const y = ram.u16(a6 + I.pos);                       // $27ED1C
  const ang = ram.u8(a6 + I.angle);
  if (y >= 0x6d00) {                                   // $27ED22 bcc $27ED2E
    if (ang < 0x10 || ang > 0x30) bounceLong27EBA0(ram, rom, a6);  // $27ED2E/$27ED36
  } else if (y <= 0x0700) {                            // $27ED2A bls $27ED40
    if (ang > 0x10 && ang <= 0x30) bounceLong27EBA0(ram, rom, a6); // $27ED40/$27ED48
  }
  return tail27EBBA(ram, ctx, a6);
}

// ================================ KIND $08 ==================================
// The `$81040A`/`$81040B` SET ITEM -- `$27ED8C`, collect `$252E9A` / `$252FAC`.
//
// **IT HOMES ON A FIXED POINT AND NOBODY HAS WRITTEN THAT DOWN.**  `$242038` is
// `src/aim.js aim64`, and the target is the LITERAL (D2 = `$4600`, D3 = `$1C00`)
// -- not a player.  `$242494` is an octagonal distance; at `<= $200` the record
// latches (`bset #0,(A6)`, bit 8 of the status word, which the `$3C` kind mask
// does NOT see), takes speed `$A`, and then spirals: `+$10` of angle every time
// the `($1e,A6)` sub-tick borrows, with `($1f,A6)` growing by 8 each time.

function body27ED8C(ram, rom, ctx, a6, d1) {
  if ((d1 & 0x2000) === 0) {                           // $27ED8C btst #$D
    ram.setU8(a6, ram.u8(a6) | 0x20);                  // $27ED94 bset #5,(A6)
    init27EE2E(ram, rom, a6);                     // $27ED98 bsr $27EE2E
    ram.setU16(a6 + I.frame, 0x0202);                  // $27ED9C
    ram.setU16(a6 + I.anim, 0x0000);                   // $27EDA2
  }
  const touch = d1 & 0x1800;                           // $27EDA8
  if (touch !== 0) {
    if ((touch & 0x1000) !== 0) {                      // $27EDB0 btst #$C
      if (collect252E9A(ram, rom, ctx)) {              // $27EDB8/$27EDBE bcs
        return { collected: true, ...collectMax27F582(ram, rom, ctx, a6) };
      }
    } else if (collect252FAC(ram, rom, ctx)) {         // $27EDD8/$27EDDE bcc
      return { collected: true, ...collectMax27F582(ram, rom, ctx, a6) };
    }
    note(ctx, 0x28c5ca, '$27EDC2 jsr $28C5CA -- the item PICKUP sound');
    note(ctx, 0x28ca12, '$27EDC8 jsr $28CA12 -- the SET ITEM\'s own cue');
    collect27F54C(ram, rom, ctx, a6, ANIM_LISTS.b27F380);   // $27EDCE/$27EDD4
    return { collected: true };
  }
  if (motion27EE54(ram, rom, ctx, a6)) return { freed: true };
  advanceAnim4(ram, a6);                               // $27EDEC..$27EDFC
  emit23EB06(ram, rom,
    u16(ram.u16(a6 + I.pos) - 0x600),                  // $27EE06 addi.w #-$600
    u16(ram.u16(a6 + I.posX) - 0x300),                 // $27EE10 addi.w #-$300
    anim4Stream(rom, ANIM4[0x08], ram.u16(a6 + I.anim), 0x27ee18),
    0x0618,                                            // $27EE1E
    0x001b);                                           // $27EE22
  return { emitted: true };
}

/** kind `$8`'s homing target -- a LITERAL, not a player.  `$27EE36 move.w
 *  #$4600,D2 / $27EE3A move.w #$1C00,D3`, and the same pair again at
 *  `$27EE6E`/`$27EE80`. */
const HOME_08 = { d2: 0x4600, d3: 0x1c00 };

function init27EE2E(ram, rom, a6) {
  ram.setU32(a6 + I.life, 0x0700_0b20);                // $27EE2E move.l #$7000B20
  // $27EE40 jsr $242038 -- aim64 from ($2,A6)/($4,A6) at (D2,D3), into D1.
  const d1 = aim64(aimTables(rom), ram.u16(a6 + I.pos), ram.u16(a6 + I.posX),
    HOME_08.d2, HOME_08.d3);
  ram.setU8(a6 + I.angle, d1 & 0xff);                  // $27EE46 move.b D1
  ram.setU16(a6 + I.tick, 0x0714);                     // $27EE4C move.w #$714
}

/** `$27EE54` -- kind `$8`'s motion: HOME, then LATCH, then SPIRAL. */
function motion27EE54(ram, rom, ctx, a6) {
  if ((ram.u8(ITEM.pause30f8) & 0x40) !== 0) return tail27EBBA(ram, ctx, a6);  // $27EE54
  if ((ram.u8(a6) & 0x01) !== 0) {                     // $27EE60 btst #$0,(A6)
    // ---- $27EECC: LATCHED.  The spiral.
    if (ram.u16(ITEM.freeze) !== 0) return tail27EBBA(ram, ctx, a6);   // $27EECC
    const life = u16(ram.u16(a6 + I.life) - 1);        // $27EED4 subq.w #1
    ram.setU16(a6 + I.life, life);
    if (life & 0x8000) return tail27EBBA(ram, ctx, a6);  // $27EED8 bmi
    const tk = (ram.u8(a6 + I.tick) - 1) & 0xff;       // $27EEDA subq.b #1
    ram.setU8(a6 + I.tick, tk);
    if (tk !== 0) return tail27EBBA(ram, ctx, a6);     // $27EEDE bne
    ram.setU8(a6 + I.angle, (ram.u8(a6 + I.angle) + 0x10) & 0xff);  // $27EEE0
    ram.setU8(a6 + I.angle, ram.u8(a6 + I.angle) & 0x3f);           // $27EEE6
    if (ram.u16(ITEM.freeze) === 0) {                  // $27EEEC tst.w $8130D2
      ram.setU8(a6 + I.tickReload, (ram.u8(a6 + I.tickReload) + 8) & 0xff); // $27EEF4
    }
    ram.setU8(a6 + I.tick, ram.u8(a6 + I.tickReload)); // $27EEF8 move.b ($1f,A6)
    return tail27EBBA(ram, ctx, a6);
  }
  // ---- $27EE66: NOT LATCHED.  Re-aim, then measure.
  if (ram.u16(ITEM.g803912) === 0) {                   // $27EE66 tst.w $803912
    const d1 = aim64(aimTables(rom), ram.u16(a6 + I.pos), ram.u16(a6 + I.posX),
      HOME_08.d2, HOME_08.d3);                         // $27EE76 jsr $242038
    ram.setU8(a6 + I.angle, d1 & 0xff);                // $27EE7C move.b D1
  }
  const d0 = dist242494(ram, a6, HOME_08.d2, HOME_08.d3);   // $27EE88 jsr $242494
  if (d0 > 0x0200) return tail27EBBA(ram, ctx, a6);    // $27EE8E cmpi.w #$200/bhi
  ram.setU8(a6, ram.u8(a6) | 0x01);                    // $27EE96 bset #$0,(A6)
  ram.setU8(a6 + I.speed, 0x0a);                       // $27EE9A move.b #$A
  const q = (ram.u8(a6 + I.angle) - 8) & 0xff;         // $27EEA0/$27EEA4 subq.b #8
  ram.setU8(a6 + I.angle, 0x40);                       // $27EEA6 move.b #$40
  if ((q & 0x10) !== 0) {                              // $27EEAC btst #$4,D0
    ram.setU8(a6 + I.angle, (ram.u8(a6 + I.angle) - 0x10) & 0xff);  // $27EEB2
  }
  if ((q & 0x20) !== 0) {                              // $27EEB8 btst #$5,D0
    ram.setU8(a6 + I.angle, (ram.u8(a6 + I.angle) - 0x20) & 0xff);  // $27EEBE
  } else {
    ram.setU8(a6 + I.angle, 0);                        // $27EEC6 clr.b ($1b,A6)
  }
  return tail27EBBA(ram, ctx, a6);
}

// ================================ KIND $10 ==================================
// The `$8130BE` counter, cap 20 -- `$27F1A6`, collect `$25310E` / `$253126`.
//
// **THE ASYMMETRY AN IMPLEMENTER GETS WRONG, and it is transcribed here.**
// Kinds `$0`, `$4` and `$8` return CARRY on refusal and their bodies route to
// `$27F582` (score `$1000`).  `$25310E` returns with carry CLEAR at the cap and
// **this body never tests carry at all** -- `$27F1E8 lea ($27F300,PC),A0 /
// bra $27F54C`, unconditionally.  So a 21st `$10` item is collected NORMALLY,
// scores `$10`, and grants nothing.  It is also the only body that sounds
// BEFORE the fork, and the only one whose motion is the scroll pair.

function body27F1A6(ram, rom, ctx, a6, d1) {
  if ((d1 & 0x2000) === 0) {                           // $27F1A6 btst #$D
    ram.setU8(a6, ram.u8(a6) | 0x20);                  // $27F1AE bset #5,(A6)
    // $27F1B2 bsr $27F23C -- and `$27F23C` IS an `rts`.  Kind $10 has no init;
    // its speed, angle and lifetime stay at the template's zeroes.
    ram.setU16(a6 + I.frame, 0x0202);                  // $27F1B6
    ram.setU16(a6 + I.anim, 0x0000);                   // $27F1BC
  }
  const touch = d1 & 0x1800;                           // $27F1C2
  if (touch !== 0) {
    note(ctx, 0x28c678, '$27F1CA jsr $28C678 -- the $8130BE item\'s own cue, '
      + 'and it is the ONLY body that sounds BEFORE the P1/P2 fork');
    if ((touch & 0x1000) !== 0) collect25310E(ram, ctx);   // $27F1D8 jsr
    else collect253126(ram, ctx);                          // $27F1E2 jsr
    collect27F54C(ram, rom, ctx, a6, ANIM_LISTS.a27F300);  // $27F1E8/$27F1EE
    return { collected: true };
  }
  if (motion27F23E(ram, ctx, a6)) return { freed: true };  // $27F1F2/$27F1F6
  advanceAnim4(ram, a6);                               // $27F1FA..$27F20A
  emit23EB06(ram, rom,
    u16(ram.u16(a6 + I.pos) - 0x400),                  // $27F214 addi.w #-$400
    u16(ram.u16(a6 + I.posX) - 0x400),                 // $27F21E addi.w #-$400
    anim4Stream(rom, ANIM4[0x10], ram.u16(a6 + I.anim), 0x27f226),
    0x0420,                                            // $27F22C
    0x001c);                                           // $27F230 -- $1C, NOT $1B
  return { emitted: true };
}

/** `$27F23E` -- kind `$10`'s motion, ten bytes: the scroll pair's D2 added to
 *  the LONG axis, then the off-screen free.  No `$2417DE`, so this item never
 *  moves under its own speed while it is uncollected. */
function motion27F23E(ram, ctx, a6) {
  const { d2 } = scrollPair2417B6(ram);                // $27F23E jsr $2417B6
  ram.setU16(a6 + I.pos, u16(i16(ram.u16(a6 + I.pos)) + i16(d2)));  // $27F244
  if (offScreen242684(ram, a6)) {                      // $27F248/$27F24E bcs
    freeItem(ram, a6);
    return true;
  }
  void ctx;
  return false;
}

// ========================== $27F54C / $27F582, THE TAILS =====================
//
// **`move.b (A6),D1` READS THE STATUS WORD'S HIGH BYTE**, where bit 4 is P1's
// touch flag ($1000) and bit 3 is P2's ($800) -- which is exactly the mask
// `$286128` wants (`btst #4` credits P1, `btst #3` credits P2).  The collision
// wrote it there with `or.w $80FA72,(A6)` and nothing in between re-packs it.
//
// **THE `$1000`-vs-`$10` FORK IS THE WHOLE POINT OF THE REFUSAL PATH**: an item
// collected when the thing it grants is already at MAXIMUM scores `$1000`
// through the same adder, with its own sound and its own SHORTER animation
// (17 frames off `$27F508` against 30 off `$27F300`/`$380`/`$400`/`$480`).

/** `$27F54C` -- collected NORMALLY.  Scores `$10`. */
export function collect27F54C(ram, rom, ctx, a6, list) {
  const d1 = ram.u8(a6);                               // $27F550 move.b (A6),D1
  scoreByMask(ram, 0x10, d1);                          // $27F552/$27F554 jsr $286128
  ram.setU8(a6, 0x80);                                 // $27F55E move.b #$80,(A6)
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) | 0x01);      // $27F562 bset #$0,($1,A6)
  ram.setU16(a6 + I.frame, 0x0202);                    // $27F568
  ram.setU32(a6 + I.list, list);                       // $27F56E move.l A0,($6,A6)
  ram.setU16(a6 + I.cursor, 0);                        // $27F572
  ram.setU8(a6 + I.anim, 0);                           // $27F578 move.b #$0 -- BYTE
  tail27F5C2(ram, rom, a6);                            // $27F57E bra $27F5C2
  ctx?.itemCollect?.(d1, 0x10, a6);
}

/** `$27F582` -- collected AT MAXIMUM.  Scores `$1000`, through the same
 *  `$286128`, and the immediate is a `move.l` where the other is a `moveq`. */
export function collectMax27F582(ram, rom, ctx, a6) {
  note(ctx, 0x28c5ca, '$27F582 jsr $28C5CA -- the AT-MAXIMUM pickup sound');
  const d1 = ram.u8(a6);                               // $27F58C move.b (A6),D1
  scoreByMask(ram, 0x1000, d1);                        // $27F58E/$27F594
  ram.setU8(a6, 0x80);                                 // $27F59E
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) | 0x80);      // $27F5A2 bset #$7,($1,A6)
  ram.setU32(a6 + I.list, ANIM_LISTS.max27F500);       // $27F5A8/$27F5AC
  ram.setU16(a6 + I.cursor, 0);                        // $27F5B0
  ram.setU16(a6 + I.frame, 0x0202);                    // $27F5B6
  ram.setU8(a6 + I.anim, 0);                           // $27F5BC
  tail27F5C2(ram, rom, a6);
  ctx?.itemCollect?.(d1, 0x1000, a6);
  return { atMax: true };
}

/** `$27F5C2` -- both tails' shared eight instructions: pick the flight angle
 *  from where the item is on the SHORT axis, then the speed from **A THIRD RNG
 *  DRAW**.  `andi.w #$6` + `addq.w #7` gives 7, 9, 11 or 13 -- odd speeds only. */
function tail27F5C2(ram, rom, a6) {
  const d1 = u16(ram.u16(ITEM.scroll) + ram.u16(a6 + I.posX));  // $27F5C2/$27F5C8
  ram.setU8(a6 + I.angle, 0x30);                       // $27F5CC move.b #$30
  if (d1 < 0x1c00) ram.setU8(a6 + I.angle, 0x10);      // $27F5D2 cmpi.w/bcc/$27F5D8
  let d0 = drawByte242B3C(ram, rom);                   // $27F5DE jsr $242B3C
  if ((d0 & 0x80) !== 0) d0 = (-d0) & 0xff;            // $27F5E4 bpl / neg.b D0
  ram.setU8(a6 + I.speed, (d0 & 0x06) + 7);            // $27F5E8 andi.w #$6/addq #7
}

// ====================== $27F5F4 / $27F656, THE STEPPERS ======================
//
// Two copies of the same 96 bytes with ONE constant different -- `cmpi.w #$78`
// against `cmpi.w #$44` -- and both ends are pinned by those instructions
// rather than by anybody's reading of the data:
//
//   $27F300 + 8 + 30*4 == $27F380  (the NEXT list's header)          EXACT
//   $27F380 + 8 + 30*4 == $27F400   $27F408 + 30*4 == $27F480        EXACT
//   $27F500 + 8 + 17*4 == $27F54C == $27F54C, THE COLLECT TAIL       EXACT
//
// **`tst.b ($e,A6)` IS ALWAYS ZERO ON THIS TREE, and the arm behind it is
// transcribed anyway.**  Both tails write `move.b #$0,($e,A6)` -- a BYTE, so
// the HIGH byte of the animation word -- and `$27F642 clr.b ($e,A6)` keeps it
// there, while the only writers of that word (`$27EA96 addq.w #4` masked `$F`)
// touch the LOW byte.  So `addi.w #$20,($2,A6)` cannot run unless something
// outside this file writes +$0E's high byte.  Named, not removed.

/** `$27F5F4` -- the collected animation.  @returns {boolean} the record freed. */
export function collectedStep27F5F4(ram, rom, ctx, a6) {
  const atMax = (ram.u8(a6 + 0x01) & 0x80) !== 0;      // $27F5F4 btst #$7 / bne
  const end = atMax ? ANIM_END.atMax : ANIM_END.normal;
  const site = atMax ? ITEM.stepperMax : ITEM.stepper;
  const list = ram.u32(a6 + I.list);                   // $27F5FE movea.l ($6,A6)
  const cursor = ram.u16(a6 + I.cursor);
  if ((cursor & 3) !== 0 || cursor >= end) {
    unreached(site, `$${site.toString(16).toUpperCase()} adda.w ($a,A6),A0 -- `
      + `the collected-animation cursor is $${cursor.toString(16).toUpperCase()} `
      + `against this stepper's own \`cmpi.w #$${end.toString(16).toUpperCase()}\` `
      + `bound, so the record would read past the end of the list at `
      + `$${list.toString(16).toUpperCase()}. The cursor only ever moves by `
      + `\`addq.w #4\` from 0`);
  }
  // The 8-byte header: a POSITION LONG added to +$02 as one 32-bit add, then
  // the size word, then two bytes skipped.
  const d1 = ((ram.u32(a6 + I.pos) + rom.u32(list)) >>> 0);   // $27F606 add.l (A0)+
  const d3 = rom.u16(list + 4);                        // $27F608 move.w (A0)+,D3
  const d2 = rom.u32(list + 8 + cursor);               // $27F60C/$27F610
  enqueueRegistersThroughStub(ram, rom, ITEM.emitStub, d1, d2, d3, 0x001d);
  if (ram.u8(a6 + I.anim) !== 0) {                     // $27F61C tst.b ($e,A6)
    ram.setU16(a6 + I.pos, u16(ram.u16(a6 + I.pos) + 0x20));  // $27F624 addi.w #$20
  } else {
    applyItemVelocity(ram, ctx, a6);                   // $27F62E jsr $2417DE
  }
  const c = (ram.u8(a6 + I.frame) - 1) & 0xff;         // $27F634 subq.b #1
  ram.setU8(a6 + I.frame, c);
  if (c !== 0) return false;                           // $27F638 bne
  ram.setU8(a6 + I.frame, ram.u8(a6 + I.reload));      // $27F63C move.b ($d,A6)
  ram.setU8(a6 + I.anim, 0);                           // $27F642 clr.b ($e,A6)
  const nc = u16(cursor + 4);                          // $27F646 addq.w #4
  ram.setU16(a6 + I.cursor, nc);
  if (i16(nc) >= end) {                                // $27F64A cmpi.w / bge
    freeItem(ram, a6);                                 // $27F650 -> $27F2F0
    return true;
  }
  return false;
}

// ###########################################################################
// #                    $252C96..$25313D -- THE TEN COLLECT ROUTINES          #
// ###########################################################################
//
// Eight are ported and TWO ARE REFUSED (`$2530BE`/`$2530E6`, the hyper grants;
// they are unreachable by construction because `spawnItem` will not allocate
// their kinds).  Every one returns CARRY on refusal, except `$25310E`/`$253126`
// -- see kind `$10`'s body.
//
// `$252D1E moveq #0,D0 / subq.w #1,D0 / rts` is the shared REFUSAL return:
// `subq` on a zero borrows, so it is D0 = $FFFF **with CARRY SET**.  The
// success return is `$252D1A move.w D0,D0 / rts`, whose only job is to CLEAR
// the carry the `addq.l #2` above it may have left.

/** The RAM the eight ported collect routines touch, all of it named. */
export const POWER = {
  p1Shot: 0x810406, p1Laser: 0x810408,      // $252C96/$252C9C -- refuse at 8
  p2Shot: 0x810468, p2Laser: 0x81046a,      // $252D24/$252D2A
  p1Cursor: 0x8127e4, p1PodCursor: 0x8127e8,   // the SHOT / LASER power cursors
  p2Cursor: 0x8127ec, p2PodCursor: 0x8127f0,
  p1Clear: 0x8104fa, p2Clear: 0x81055e,     // $252CBC/$252D4A clr.w
  p1Ship: 0x810440, p1Weapon: 0x81043e,     // $252CD2/$252CDC -- the row index
  p2Ship: 0x8104a2, p2Weapon: 0x8104a0,     // $252D60/$252D6A
  lists: 0x25520c,                          // TWELVE longwords -> twelve 5-word lists
  listCount: 12,
  listWords: 5,                             // $25523C + 12*10 == $2552B4  EXACT
  setP1: 0x81040a, setTargetP1: 0x81040b,   // $252E9A/$252EA0
  setP2: 0x81046c, setTargetP2: 0x81046d,
  counterP1: 0x8130be, counterP2: 0x8130c0, // $25310E/$253126 -- cap $14 = 20
  counterCap: 0x14,
  beamResetP1: 0x25270c, beamResetP2: 0x252754,
};

/** The `$25520C` row index, both players, and **its DOMAIN**.
 *  `n = (($810440 - 2) * 2 + $81043E)`, used as `n*4` into a TWELVE-longword
 *  array from which TWO entries 4 bytes apart are read -- so `n` must be EVEN
 *  and `n+1 <= 11`, or the SHOT row and the LASER row overlap.  Recon 59 §9.6
 *  could not measure the domain because `$810440` and `$81043E` were absent
 *  from `src/`; this is the check that turns that into a loud throw. */
function powerRow(ram, ship, weapon, site) {
  const d0 = u16(u16(u16(ram.u16(ship) - 2) * 2) + ram.u16(weapon));
  if ((d0 & 1) !== 0 || d0 + 1 >= POWER.listCount) {
    unreached(site, `$${site.toString(16).toUpperCase()} -- the power-list row `
      + `index ((${ram.u16(ship)} - 2) * 2 + ${ram.u16(weapon)}) = ${d0} is `
      + `either ODD or past the ${POWER.listCount}-longword array at $25520C. `
      + `The code reads TWO entries 4 bytes apart (the SHOT list and the LASER `
      + `list), so an odd index makes them overlap and a large one runs off the `
      + `end into $25523C, the first five-word list itself`);
  }
  return d0 * 4;                                       // $252CE2/$252CE4 add.w x2
}

/**
 * `$252C96` -- **THE POWER-UP, P1.**  Six words move and one of them is the
 * whole difference between the port's shot spread and the board's:
 *
 *   $810408 += 2 (refuse at 8), then `bsr $25270C` and `clr.w $8104FA`
 *   $810406 += 2 (refuse at 8), then THE CURSOR ADVANCE:
 *      A1 = $25520C[row+1]  D1 = word[4] of the LASER list
 *      A0 = $25520C[row]    D0 = word[4] of the SHOT  list
 *      if (word at $8127E4) != D0 : $8127E4 += 2
 *      if (word at $8127E8) != D1 : $8127E8 += 2
 *
 * `src/shots.js` reads `$8127E4` as `SPAWN.countPtrP1` and `src/options.js`
 * reads `$8127E8`, both at their level-0 value.  **The `+= 2` IS the power-up**:
 * the word the cursor points at is a `dbra` COUNT in all four of its readers, so
 * a power-up widens the slot-search window (more simultaneous shots) and
 * changes NO sprite.  Recon 59 §4.4, and W58 §2.1b from the art side.
 *
 * @returns {boolean} CARRY -- refused because BOTH are already at maximum.
 */
export function collect252C96(ram, rom, ctx) {
  const d0 = u16(ram.u16(POWER.p1Shot) + ram.u16(POWER.p1Laser));  // $252C96/$252C9C
  if (d0 === 0x10) return true;                        // $252CA2 cmpi.w #$10 -> $252D1E
  if (ram.u16(POWER.p1Laser) !== 8) {                  // $252CA8 cmpi.w #$8
    ram.setU16(POWER.p1Laser, u16(ram.u16(POWER.p1Laser) + 2));   // $252CB2 addq.w #2
    beamReset25270C(ram, ctx, 0);                      // $252CB8 bsr $25270C
    ram.setU16(POWER.p1Clear, 0);                      // $252CBC clr.w $8104FA
  }
  if (ram.u16(POWER.p1Shot) === 8) return false;       // $252CC2 -> $252D1A
  ram.setU16(POWER.p1Shot, u16(ram.u16(POWER.p1Shot) + 2));       // $252CCC addq.w #2
  advanceCursors(ram, rom, ctx, 0);
  return false;
}

/** `$252D24` -- the P2 mirror, address for address. */
export function collect252D24(ram, rom, ctx) {
  const d0 = u16(ram.u16(POWER.p2Shot) + ram.u16(POWER.p2Laser));  // $252D24/$252D2A
  if (d0 === 0x10) return true;                        // $252D30 -> $252D1E
  if (ram.u16(POWER.p2Laser) !== 8) {                  // $252D36
    ram.setU16(POWER.p2Laser, u16(ram.u16(POWER.p2Laser) + 2));   // $252D40
    beamReset25270C(ram, ctx, 1);                      // $252D46 bsr $252754
    ram.setU16(POWER.p2Clear, 0);                      // $252D4A
  }
  if (ram.u16(POWER.p2Shot) === 8) return false;       // $252D50 -> $252DA8
  ram.setU16(POWER.p2Shot, u16(ram.u16(POWER.p2Shot) + 2));       // $252D5A
  advanceCursors(ram, rom, ctx, 1);
  return false;
}

/** `$252CD2..$252D18` / `$252D60..$252DA6` -- the cursor advance, both players.
 *  The comparison is against **word[4]** of each five-word list, i.e. the
 *  cursor stops at the LAST word rather than being counted. */
function advanceCursors(ram, rom, ctx, who) {
  const P = who === 0
    ? { ship: POWER.p1Ship, weapon: POWER.p1Weapon, shot: POWER.p1Cursor,
      pod: POWER.p1PodCursor, site: 0x252ce6 }
    : { ship: POWER.p2Ship, weapon: POWER.p2Weapon, shot: POWER.p2Cursor,
      pod: POWER.p2PodCursor, site: 0x252d74 };
  const off = powerRow(ram, P.ship, P.weapon, P.site);
  const laserList = rom.u32(POWER.lists + off + 4);    // $252CEC movea.l ($4,A0,D0.w)
  const d1 = rom.u16(laserList + 8);                   // $252CF0 move.w ($8,A1),D1
  const shotList = rom.u32(POWER.lists + off);         // $252CF4 movea.l (A0,D0.w)
  const d0 = rom.u16(shotList + 8);                    // $252CF8 move.w ($8,A0),D0
  if (rom.u16(ram.u32(P.shot)) !== d0) {               // $252D02/$252D04 cmp.w (A0),D0
    ram.setU32(P.shot, (ram.u32(P.shot) + 2) >>> 0);   // $252D08 addq.l #2,(A1)
  }
  if (rom.u16(ram.u32(P.pod)) !== d1) {                // $252D10/$252D12
    ram.setU32(P.pod, (ram.u32(P.pod) + 2) >>> 0);     // $252D16 addq.l #2,($4,A1)
  }
  void ctx;
}

/**
 * `$252DAC` -- **FULL POWER, P1.**  The same refusal test, then ASSIGNMENT
 * rather than increment: `$810408 := 8`, `$810406 := 8`, and both cursors are
 * written outright from the row and then `addq.l #8` -- i.e. straight to
 * word[4] of a five-word list.  Note `$252E16`/`$252E18` are `addq.l #8` on
 * BOTH, not `#2`.
 */
export function collect252DAC(ram, rom, ctx) {
  const d0 = u16(ram.u16(POWER.p1Shot) + ram.u16(POWER.p1Laser));  // $252DAC/$252DB2
  if (d0 === 0x10) return true;                        // $252DB8 -> $252E20
  if (ram.u16(POWER.p1Laser) !== 8) {                  // $252DBE
    ram.setU16(POWER.p1Laser, 8);                      // $252DC8 move.w #$8
    beamReset25270C(ram, ctx, 0);                      // $252DD0 bsr $25270C
    ram.setU16(POWER.p1Clear, 0);                      // $252DD4
    if (ram.u16(POWER.p1Shot) === 8) return false;     // $252DDA -> $252E1C
  }
  ram.setU16(POWER.p1Shot, 8);                         // $252DE4 move.w #$8
  writeCursors(ram, rom, 0);
  return false;
}

/** `$252E26` -- the P2 mirror. */
export function collect252E26(ram, rom, ctx) {
  const d0 = u16(ram.u16(POWER.p2Shot) + ram.u16(POWER.p2Laser));  // $252E26/$252E2C
  if (d0 === 0x10) return true;                        // $252E32
  if (ram.u16(POWER.p2Laser) !== 8) {                  // $252E38
    ram.setU16(POWER.p2Laser, 8);                      // $252E42
    beamReset25270C(ram, ctx, 1);                      // $252E4A
    ram.setU16(POWER.p2Clear, 0);                      // $252E4E
    if (ram.u16(POWER.p2Shot) === 8) return false;     // $252E54
  }
  ram.setU16(POWER.p2Shot, 8);                         // $252E5E
  writeCursors(ram, rom, 1);
  return false;
}

/** `$252DEC..$252E1A` / `$252E66..$252E94` -- FULL POWER's cursor write. */
function writeCursors(ram, rom, who) {
  const P = who === 0
    ? { ship: POWER.p1Ship, weapon: POWER.p1Weapon, shot: POWER.p1Cursor,
      pod: POWER.p1PodCursor, site: 0x252e00 }
    : { ship: POWER.p2Ship, weapon: POWER.p2Weapon, shot: POWER.p2Cursor,
      pod: POWER.p2PodCursor, site: 0x252e7a };
  const off = powerRow(ram, P.ship, P.weapon, P.site);
  ram.setU32(P.shot, rom.u32(POWER.lists + off));      // $252E0C move.l (A0,D0.w),(A1)
  ram.setU32(P.pod, rom.u32(POWER.lists + off + 4));   // $252E10 move.l ($4,A0,D0.w)
  ram.setU32(P.shot, (ram.u32(P.shot) + 8) >>> 0);     // $252E16 addq.l #8,(A1)
  ram.setU32(P.pod, (ram.u32(P.pod) + 8) >>> 0);       // $252E18 addq.l #8,($4,A1)
}

/**
 * `$25270C` (P1) / `$252754` (P2) -- **AND IT IS A BEAM RESET.**
 *
 *   andi.w #$DFFB,$8104AA                     the option block's state word
 *   A0 = $2527BE[$81043E * 2]  (or $28C4FC when $81B63E, the HYPER, is up)
 *   jsr (A0)                                  <- a SOUND cue.  COUNTED
 *   bclr #7,($1,A2)                           $8104AB bit 7
 *   $811EF2 = 0   $811F32 = 0   $811F48 = 0   the beam record and its column
 *   32 x `move.w #0,(A6) / lea ($30,A6),A6`   ALL of $8112F2 -- src/laser.js SEG
 *
 * Recon 59 §4.3 lists this as "whatever `$25270C` rebuilds"; it does not
 * rebuild, it TEARS DOWN. **Picking up a power-up destroys the beam you are
 * firing**, and W45's segment pool is what it wipes.
 */
export function beamReset25270C(ram, ctx, who) {
  const B = who === 0
    ? { opt: 0x8104aa, pool: 0x8112f2, rec: 0x811ef2, blk: 0x811f32,
      weapon: POWER.p1Weapon, hyper: 0x81b63e, at: 0x25270c, tbl: 0x2527be }
    : { opt: 0x81050e, pool: 0x8118f2, rec: 0x811f12, blk: 0x811f52,
      weapon: POWER.p2Weapon, hyper: 0x81b640, at: 0x252754, tbl: 0x2527c6 };
  ram.setU16(B.opt, ram.u16(B.opt) & 0xdffb);          // $25270C andi.w #$DFFB
  note(ctx, B.tbl, `$${B.at.toString(16).toUpperCase()} jsr (A0) -- the beam-`
    + `reset SOUND cue, off the two-entry table $${B.tbl.toString(16)
      .toUpperCase()} indexed by $${B.weapon.toString(16).toUpperCase()}*2 `
    + `($28C43C / $28C49C), or $28C4FC when the HYPER $${B.hyper.toString(16)
      .toUpperCase()} is up. The $28Cxxx sound family is deferred whole (W53)`);
  ram.setU8(B.opt + 1, ram.u8(B.opt + 1) & ~0x80 & 0xff);   // $25279A bclr #$7
  ram.setU16(B.rec, 0);                                // $2527A2 move.w D0,(A0)
  ram.setU16(B.blk, 0);                                // $2527A4 move.w D0,(A1)
  ram.setU16(B.blk + 0x16, 0);                         // $2527A6 move.w D0,($16,A1)
  for (let n = 0; n < 32; n++) {                       // $2527AA move.w #$1F,D7
    ram.setU16(B.pool + n * 0x30, 0);                  // $2527AE/$2527B0
  }
}

/**
 * `$252E9A` -- **THE SET ITEM, P1.**  `$81040A` counts toward `$81040B`, and
 * recon 59 §9.2 could find no writer of the TARGET anywhere in build B; that
 * remains true here ([M] its only absolute sites are the two reads below and
 * `$2534A6`, a HUD read).  So this routine is transcribed with BOTH arms and
 * the port cannot say which one a real game takes.
 *
 * `$252F34`, the already-complete arm, awards `$4D` again -- and a SECOND `$4D`
 * if `$8103E6` bit 6 was ALREADY clear AND `$8103E7` bit 1 was ALREADY clear,
 * which is two `bne`s reading the OLD bits out of `bclr`/`bset`.
 *
 * @returns {boolean} CARRY -- never; both arms end `move.w D0,D0 / rts`.
 */
export function collect252E9A(ram, rom, ctx) {
  return setItem(ram, rom, ctx, 0);
}
/** `$252FAC` -- the P2 mirror, on `$81046C`/`$81046D`/`$810448`/`$812902`. */
export function collect252FAC(ram, rom, ctx) {
  return setItem(ram, rom, ctx, 1);
}

function setItem(ram, rom, ctx, who) {
  const S = who === 0
    ? { cur: POWER.setP1, tgt: POWER.setTargetP1, rec: 0x8103e6, rec1: 0x8103e7,
      bonus: 0x8128f4, count: 0x8128fe, b1: 0x8128f6, b2: 0x8128fa, b3: 0x812900,
      hud: 0x25349a, cue: 0x2533c8, stock: 0x81b65c, at: 0x252e9a }
    : { cur: POWER.setP2, tgt: POWER.setTargetP2, rec: 0x810448, rec1: 0x810449,
      bonus: 0x812902, count: 0x81290c, b1: 0x812904, b2: 0x812908, b3: 0x81290e,
      hud: 0x2534ac, cue: 0x2533d4, stock: 0x81b65e, at: 0x252fac };
  const d6 = ram.u8(S.cur);                            // $252E9A move.b $81040A,D6
  if (d6 === ram.u8(S.tgt)) {                          // $252EA0 cmp.b / beq $252F34
    // ---- $252F34: ALREADY AT TARGET.
    if (ram.u16(S.count) === 0x63) return false;       // $252F34 cmpi.w #$63
    ram.setU16(S.bonus, u16(ram.u16(S.bonus) + 0x4d)); // $252F3E addi.w #$4D
    ram.setU16(S.count, u16(ram.u16(S.count) + 1));    // $252F46 addq.w #1
    const hadBit6 = ram.bclr8(S.rec, 6);               // $252F4C bclr #$6 / bne
    if (hadBit6 === 0) {
      const hadBit1 = ram.bset8(S.rec1, 1);            // $252F56 bset #$1 / bne
      if (hadBit1 === 0) {
        ram.setU16(S.bonus, u16(ram.u16(S.bonus) + 0x4d));  // $252F60 -- A SECOND $4D
        ram.setU16(S.count, u16(ram.u16(S.count) + 1));     // $252F68
      }
    }
    bcdTriple(ram, rom, S);                            // $252F6E..$252FA2
    note(ctx, S.hud, `$${S.at.toString(16).toUpperCase()}'s HUD draw `
      + `$${S.hud.toString(16).toUpperCase()} -- the set-item icon row, through `
      + `$240DC2. That text/sprite subsystem is unported`);
    return false;
  }
  const d5 = (d6 + 1) & 0xff;                          // $252EAC addq.b #1,D5
  ram.setU8(S.cur, d5);                                // $252EAE move.b D5
  if (d5 !== ram.u8(S.tgt)) {                          // $252EB4 cmp.b / bne $252F22
    if (ram.u16(S.stock) === 0) {                      // $252F22 tst.w $81B65C
      note(ctx, S.cue, `$252F2A jsr ($2533C8,PC) -- the set-item PROGRESS cue, `
        + `through $240DC2. Unported`);
    }
    return false;                                      // $252F30 move.w D0,D0
  }
  // ---- $252EBC: THE SET COMPLETES.
  ram.bclr8(S.rec, 6);                                 // $252EBC bclr #$6
  ram.bset8(S.rec1, 1);                                // $252EC4 bset #$1
  if (ram.u16(S.count) === 0x63) return false;         // $252ECC cmpi.w #$63
  ram.setU16(S.bonus, u16(ram.u16(S.bonus) + 0x4d));   // $252ED6 addi.w #$4D
  ram.setU16(S.count, u16(ram.u16(S.count) + 1));      // $252EDE addq.w #1
  bcdTriple(ram, rom, S);                              // $252EE4..$252F18
  note(ctx, S.hud, `$${S.at.toString(16).toUpperCase()}'s completion HUD draw `
    + `$${S.hud.toString(16).toUpperCase()}, through $240DC2. Unported`);
  return false;
}

/** `$252EE4..$252F18` -- three `$242AC6` conversions: the bonus, the bonus
 *  halved (`lsr.w #1`), and the count. */
function bcdTriple(ram, rom, S) {
  const v = ram.u16(S.bonus);                          // $252EE4 move.w $8128F4,D0
  ram.setU32(S.b1, bcd242AC6(v));                      // $252EEC/$252EF2
  ram.setU32(S.b2, bcd242AC6(v >>> 1));                // $252EF8 lsr.w #1 / $252F02
  ram.setU16(S.b3, bcd242AC6(ram.u16(S.count)) & 0xffff);  // $252F08/$252F14 move.w
  void rom;
}

/**
 * `$242AC6` -- binary word -> packed BCD longword, by DOUBLE DABBLE.  Sixteen
 * rounds of `add.w D0,D0` (the shift, whose carry-out is X) followed by three
 * `abcd Dn,Dn` (each `Dn + Dn + X`), so D1 is the low BCD byte, D2 the middle
 * and D3 the high.  The result is assembled on the STACK as `00 D3 D2 D1` and
 * read back as one longword.
 */
export function bcd242AC6(d0) {
  let v = d0 & 0xffff, b1 = 0, b2 = 0, b3 = 0;
  for (let i = 0; i < 16; i++) {                       // $242AD0 moveq #$F,D4
    const carry = (v & 0x8000) ? 1 : 0;                // $242AD2 add.w D0,D0
    v = u16(v << 1);
    let r = abcd(b1, b1, carry); b1 = r.v;             // $242AD4 abcd D1,D1
    r = abcd(b2, b2, r.x); b2 = r.v;                   // $242AD6 abcd D2,D2
    r = abcd(b3, b3, r.x); b3 = r.v;                   // $242AD8 abcd D3,D3
  }
  return (((b3 << 16) | (b2 << 8) | b1) >>> 0);        // $242AE4..$242AEC
}

/** `$25310E` -- the `$8130BE` counter, P1.  **Capped at 20, and the refusal
 *  returns with CARRY CLEAR** (`beq $253124 / rts`), which is why kind `$10`'s
 *  body never tests it and a 21st item still scores `$10`. */
export function collect25310E(ram, ctx) {
  if (ram.u16(POWER.counterP1) === POWER.counterCap) return false;  // $25310E
  ram.setU16(POWER.counterP1, u16(ram.u16(POWER.counterP1) + 1));   // $253118
  note(ctx, 0x2878cc, '$25311E jsr $2878CC -- the $8130BE icon row (up to five '
    + 'a row), through $240DC2. That HUD subsystem is unported');
  return false;
}
/** `$253126` -- the P2 mirror on `$8130C0`, HUD `$28795C`. */
export function collect253126(ram, ctx) {
  if (ram.u16(POWER.counterP2) === POWER.counterCap) return false;  // $253126
  ram.setU16(POWER.counterP2, u16(ram.u16(POWER.counterP2) + 1));   // $253130
  note(ctx, 0x28795c, '$253136 jsr $28795C -- the P2 $8130C0 icon row, through '
    + '$240DC2. Unported');
  return false;
}

// ============================== THE POOL CENSUS =============================

/** Every live slot, and the count word, scanned INDEPENDENTLY of the driver.
 *  E5b's standard: the census must be a second instrument, not a restatement
 *  of the first, so this walks all 25 slots rather than trusting `$8171BA`. */
export function itemCensus(ram) {
  let live = 0;
  const kinds = new Map();
  for (let n = 0; n < ITEM.slots; n++) {
    const s = ram.u16(ITEM.base + n * ITEM.stride);
    if (s === 0) continue;
    live++;
    const k = s & ITEM.kindMask;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  return { live, count: ram.u16(ITEM.count), variant: ram.u16(ITEM.variant),
    slots: ITEM.slots, kinds };
}
