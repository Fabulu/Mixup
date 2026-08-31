// THE ENEMY SUB-DRIVER -- `$263502`, and the enemy allocator `$2636D6`.
//
// WHERE THIS CAME FROM, because wave 2 explicitly did not go here.  Wave 2
// located the TOP-LEVEL object driver ($2410BC: 20 slots x $50 at $80E240) and
// wrote, in its own "what I could not do": "each of the 20 handlers walks its
// own sub-tables ... and I did not disassemble those loops".  Wave 5 did.
// Measured first, then read:
//
//   * `objhunt.lua` over $810000-$81FDFF for the whole 2,600-frame stage-1
//     opening reported `W pc=268900 n=8153 off=813662..813D92 stride=80` and a
//     dozen siblings -- a per-record instruction walking an $50-byte table.
//   * `xref.py lea 81364C` found exactly two sites, one per build; the build-B
//     one is $263708, inside the ALLOCATOR.
//   * The only `lea ($50,A5),A5` in $200000-$300000 besides the top-level
//     driver's $2410E8 is **$263568**, and disassembling backwards from it
//     gives the driver below, verbatim.
//
//   263502: clr.w $815E9C / $815E9E / $815EA0     the three per-frame counters
//   263514: lea $81332C,A5                        THE ENEMY TABLE
//   26351A: move.w #$39,D6                        58 SLOTS  (57, then dbra)
//   26351E: tst.w (A5) / beq $263568              0 = empty
//   263524: movea.l ($6,A5),A6                    the record's SUB-RECORD
//   263528: move.w $813176,D0
//   26352E: sub.w D0,($4,A6)                      SCROLL COMPENSATION
//   263532: movea.l ($4C,A5),A1                   THE HANDLER, STORED PER RECORD
//   263536: move.l D6,-(A7) / jsr (A1) / move.l (A7)+,D6
//   26353C: move.w ($4,A5),D0 / addq.w #1,D0
//   263542: tst.w (A5) / bpl $263568              handler may have killed it
//   263546: addq.w #1,$815E9C                     live count
//   26354C: move.b ($D,A5),D2
//   263550: bmi $263562 ; btst #5,D2 / bne $263562
//   26355A: add.w D0,$815E9E   else  $263562: add.w D0,$815EA0
//   263568: lea ($50,A5),A5
//   26356C: dbra D6,$26351E
//   263570: clr.w $815EA2 / $815EA4 / $815EA6
//
// GEOMETRY, and it is not one table but three BANDS of one table.  The
// allocator $2636D6 picks the band and the bands are contiguous:
//
//   $81332C   2 slots  ($263702 moveq #$1)   -- taken when D1 < 0
//   $8133CC   8 slots  ($2636F0 moveq #$7)   -- taken when $20 <= D0 <= $23
//   $81364C  48 slots  ($26370E moveq #$2F)  -- everything else
//   ---------------------------------------------------------------
//   58 slots x $50 = $1220, $81332C..$81454B, and the byte AFTER the table,
//   $81454C, is the DUMMY the allocator returns when the band is full.  The
//   driver's `move.w #$39,D6` walks all 58 in one pass.
//
// ALLOCATION FAILURE (the brief: "that is gameplay, not an edge case"), and it
// is a THIRD shape, different from both of the top-level allocator's:
//
//   $263744: movem.l (A7)+,D0-D2 / lea $81454C,A0 / **ori #$1,SR** / rts
//
// -- a dummy record one past the end of the table, and CARRY SET.  Nothing is
// evicted; the caller is told, in the flag register.  (The top-level allocator
// signals with D0 = 0 and a dummy at $80D51C; the sprite queue signals with
// carry and a dummy of nothing.  Three subsystems, three conventions.)
//
// A quirk the port must not tidy: `moveq #$0,D3` at $263710 is ONLY on the
// 48-slot band's fall-through path.  The other two bands `bra $263712` past it,
// so the type word they store is `(the CALLER's D3 + band index) | $8000`.
// $2636D6's `movem.l D0-D2,-(A7)` does not save D3, so that is not a
// disassembly slip -- it is the ROM.
//
// WHAT IS **NOT** PORTED, and why this file throws instead of pretending:
// the per-enemy behaviour is a FUNCTION POINTER IN THE RECORD ($4C), so
// "port the enemies" means porting the SET of routines that pointer takes.
// MEASURED, `w5recon.lua` over the 2,600-frame stage-1 opening, counting every
// dispatch by hooking the driver's own `sub.w D0,($4,A6)` write at $26352E:
//
//   ENEMY handler pointers dispatched: 5 DISTINCT
//     $2688CC:8411  $268232:740  $26A2E2:662  $269CEA:429  $275914:133
//   ENEMY live per logic frame: max 24, and 0 on 1,962 of 2,600 frames
//
// Five routines is a bounded target and that number is the point of this file:
// it turns "port some enemies" from an impression into a work item.  None of
// the five is translated in wave 5 (see the worklog for what that costs), so
// every dispatch is a LOUD NAMED THROW carrying the handler's ROM address.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';
import { deriveProfileContext } from './profiles.js';

export const ENEMY = {
  table: 0x81332c,         // $263514 lea $81332C,A5
  slots: 58,               // $26351A move.w #$39,D6 then dbra
  stride: 0x50,            // $263568 lea ($50,A5),A5
  tableEnd: 0x81454c,      // $81332C + 58 * $50
  dummy: 0x81454c,         // $263748 lea $81454C,A0 -- one past the end
  bandSpecial: 0x81332c,   // 2 slots,  $2636FC
  bandBoss: 0x8133cc,      // 8 slots,  $2636EA
  bandCommon: 0x81364c,    // 48 slots, $263708
  scrollDelta: 0x813176,   // $263528 move.w $813176,D0
  liveCount: 0x815e9c,     // $263546 addq.w #1,$815E9C
  sumA: 0x815e9e,          // $26355A add.w D0,$815E9E
  sumB: 0x815ea0,          // $263562 add.w D0,$815EA0
  clrAfter: [0x815ea2, 0x815ea4, 0x815ea6],   // $263570..$26357C
  subRecOff: 0x06,         // $263524 movea.l ($6,A5),A6
  handlerOff: 0x4c,        // $263532 movea.l ($4C,A5),A1
  seqOff: 0x04,            // $26353C move.w ($4,A5),D0
  classOff: 0x0d,          // $26354C move.b ($D,A5),D2
};

/** The five handler addresses this corpus dispatches, with their measured
 *  dispatch counts over the 2,600-frame `stage1-open` scenario.  Kept as data
 *  so the throw can say how much of the scene the caller just lost. */
export const ENEMY_HANDLERS_SEEN = new Map([
  [0x2688cc, 8411], [0x268232, 740], [0x26a2e2, 662],
  [0x269cea, 429], [0x275914, 133],
]);

// The two cartridge dummy handlers are both `jmp $263762`. They are complete
// without belonging to the translated-handler registry.
export const ENEMY_NULL_HANDLERS = new Set([0x26781c, 0x27e40a]);
function runNullHandler(ram, a5) {
  const a6 = ram.u32(a5 + ENEMY.subRecOff);
  const run = ram.u16(a5 + ENEMY.seqOff);
  for (let i = 0; i <= run; i++) ram.setU8(a6 + i * 0x20, 1);
  ram.setU16(a5, 0);
}

/**
 * $263502 -- one pass of the enemy driver.
 *
 * The walk, the scroll compensation and the three counters ARE translated,
 * because they are the parts that are the same for every enemy and they are
 * what a later wave will hang the handlers off.  The dispatch is not.
 */
export function runEnemyDriver(ram, handlers, ctx) {
  ram.setU16(ENEMY.liveCount, 0);                       // $263502
  ram.setU16(ENEMY.sumA, 0);                            // $263508
  ram.setU16(ENEMY.sumB, 0);                            // $26350E
  const scroll = ram.u16(ENEMY.scrollDelta);            // $263528
  let processed = 0;
  for (let i = 0; i < ENEMY.slots; i++) {               // $26351A / $26356C
    const rec = ENEMY.table + i * ENEMY.stride;         // $263568
    if (ram.u16(rec) === 0) continue;                   // $26351E tst.w (A5)/beq
    const sub = ram.u32(rec + ENEMY.subRecOff);         // $263524
    // $26352E `sub.w D0,($4,A6)` -- the enemy's X (or Y) in its SUB-record is
    // pulled by the scroll every frame, before its handler runs.  This is the
    // instruction the wave-5 census hooks, because it executes exactly once per
    // live enemy and it is a WRITE.
    ram.setU16(sub + 4, u16(i16(ram.u16(sub + 4)) - i16(scroll)));
    const h = ram.u32(rec + ENEMY.handlerOff) & 0xffffff;   // $263532
    const fn = ENEMY_NULL_HANDLERS.has(h) ? runNullHandler : handlers?.get(h);
    if (!fn) {
      unreached(h, `enemy handler at $${h.toString(16).toUpperCase()}, `
        + `dispatched from $263538 for the record at `
        + `$${rec.toString(16).toUpperCase()} (slot ${i} of 58). Wave 5 measured `
        + `FIVE distinct handlers over the whole stage-1 opening `
        + `($2688CC x8411, $268232 x740, $26A2E2 x662, $269CEA x429, `
        + `$275914 x133) and translated NONE of them`);
    }
    // The first ten slots are the special and boss bands. A score event alone
    // is not fatal: the same handler must also retire its common-band record.
    const deathHook = rec >= ENEMY.bandCommon ? ctx?.enemyDeathHook : null;
    let fatal = null;
    const handlerCtx = deathHook ? deriveProfileContext(ctx, {
      killEvent: (d0, d1) => {
        fatal = {
          rec, sub, y: ram.u16(sub + 0x02), x: ram.u16(sub + 0x04), d0, d1,
        };
        ctx.killEvent?.(d0, d1);
      },
    }) : ctx;
    const receiptContext = ctx?.privateDamageReceiptHook ? {
      main: rec,
      sub,
      span: ram.u16(rec + ENEMY.seqOff) + 1,
    } : null;
    if (receiptContext) {
      ctx.privateDamageReceiptHook({ phase: 'enter-enemy', ram, ...receiptContext });
    }
    try {
      fn(ram, rec, i, handlerCtx);                       // $263538 jsr (A1)
    } finally {
      if (receiptContext) {
        ctx.privateDamageReceiptHook({ phase: 'exit-enemy', ram, ...receiptContext });
      }
    }
    processed++;
    if (fatal && (ram.u16(rec) & 0x8000) === 0) {
      deathHook(ram, fatal, handlerCtx);
    }
    // $26353C..$263566 -- the survivor bookkeeping.  `tst.w (A5) / bpl` means
    // "the handler cleared bit 15", i.e. it killed the enemy this frame; those
    // are not counted.
    const d0 = u16(ram.u16(rec + ENEMY.seqOff) + 1);
    if ((ram.u16(rec) & 0x8000) === 0) continue;        // $263542 bpl
    ram.setU16(ENEMY.liveCount, u16(ram.u16(ENEMY.liveCount) + 1));
    const cls = ram.u8(rec + ENEMY.classOff);           // $26354C
    const toB = (cls & 0x80) !== 0 || (cls & 0x20) !== 0;   // $263550/$263554
    const t = toB ? ENEMY.sumB : ENEMY.sumA;
    ram.setU16(t, u16(ram.u16(t) + d0));
  }
  for (const a of ENEMY.clrAfter) ram.setU16(a, 0);     // $263570..$26357C
  return processed;
}

/** Every outcome $2636D6 can produce. */
export const ENEMY_ALLOC = { OK: 'ok', BAND_FULL: 'enemy-band-full' };

/**
 * $2636D6 -- allocate an enemy record.  `d0` is the class word and `d1` the
 * flag word that together choose the band; `d3` is the caller's D3, which the
 * ROM does NOT clear on two of the three paths (see the header).
 * @returns {{addr:number, carry:boolean, result:string}} -- `carry` is the
 *   68000 C flag the ROM leaves, which is how the caller learns it failed.
 */
export function allocEnemy(ram, d0, d1, d3 = 0) {
  let base, count, idx;
  if (d0 >= 0x20 && d0 <= 0x23) {                        // $2636DA/$2636E2
    base = ENEMY.bandBoss; count = 8; idx = d3;          // $2636EA/$2636F0
  } else if (i16(d1) >= 0) {                             // $2636F6 tst.w D1/bpl
    base = ENEMY.bandCommon; count = 48; idx = 0;        // $263708/$26370E/$263710
  } else {
    base = ENEMY.bandSpecial; count = 2; idx = d3;       // $2636FC/$263702
  }
  for (let i = 0; i < count; i++) {                      // $263712 / $263740
    const a = base + i * ENEMY.stride;
    if (ram.u16(a) !== 0) { idx = u16(idx + 1); continue; }   // $26373A addq.w
    ram.setU16(a, u16(idx | 0x8000));                    // $263716/$26371A
    ram.setU16(a + 0x02, 0);                             // $26371C
    ram.setU16(a + 0x04, 0);                             // $263720
    ram.setU16(a + 0x0a, 0);                             // $263724
    ram.setU8(a + 0x0c, d0 & 0xff);                      // $263728 move.b D0
    ram.setU8(a + 0x0d, d1 & 0xff);                      // $26372C move.b D1
    return { addr: a, carry: false, result: ENEMY_ALLOC.OK };  // $263734 andi #$FFFE,SR
  }
  // $263748: the band is full.  A DUMMY record one byte past the table, and
  // CARRY SET.  Nothing is evicted and nothing else is signalled.
  return { addr: ENEMY.dummy, carry: true, result: ENEMY_ALLOC.BAND_FULL };
}
