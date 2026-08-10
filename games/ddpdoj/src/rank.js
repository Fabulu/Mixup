// OBJECT TYPE 10 -- THE RANK OBJECT `$260794`.  W127 (Wave A, Tier 1, CORPUS-SAFE).
//
// ============================================================================
// WHAT THIS IS
// ============================================================================
// `$240F62[10] = $260794`, priority `$001F` (the HIGHEST of all twenty object
// types), so it runs FIRST every frame, before the player (`$1C`) and the
// ledger (`$09`).  It owns the dynamic-difficulty value `$81309E` (RANK) and the
// 24.8-fixed-point rank CLOCK `$8130C6` that feeds it.  Until this wave the
// object had NO handler in `main.js defaultHandlers`, so `$81309E`, `$8130C6`
// and the 15-byte fan-out `$8130A1..$8130BD` were all FROZEN at their seed
// values for the whole run (W120's verdict, reproduced `[M]` this wave: zero
// `setU` writes to any of them).
//
// The recompute `$2608D2` is:
//     rank = base[stage] + (clock >> 8) + (hyper ? 16*max(power1,power2) : 0)
// clamped to `$F0` (no hyper) / `$FF` (hyper), pinned to `$F8`/`$FF` on loop 2+,
// written to `$81309E`, then fanned to 15 bullet-system bytes.  See W120 and the
// W127 worklog for the instruction-by-instruction transcription; the formula and
// the fan-out are VALIDATED AGAINST THE SEED in the worklog (predicted $35,
// actual $35; all 15 fan-out bytes exact).
//
// ============================================================================
// WHY THIS IS CORPUS-SAFE (Tier 1, the brief's CORPUS-SAFE contract)
// ============================================================================
// The corpus is owner-decision-4: no hypers, no fire.  On a no-hyper run the
// hyper flag `$81B63E | $81B640` is 0 on BOTH the port and the board, so the
// `16*max(power)` term is 0 and rank reduces to `base[stage] + (clock>>8)`.  The
// power words `$81B646`/`$81B648` are 0 in the seed and have ZERO port writers
// (grep), so the term stays 0.  The recompute reads NO chain/score state (W120
// sec 5, re-verified `[M]`), so this wave CANNOT perturb the frame-exact chain
// decrement (`$284636`/`$2847D4`, object type 0) or any score machine.  The
// hyper subsystem that would make the power term nonzero is Wave B (3-4 waves,
// MAME-gated, separate).
//
// The two computed-call dispatchers `$25FF7A` and `$288610` (called from the
// state-1 body) walk 2-entry RAM tables and SKIP entries whose index word is 0.
// `[M]` ALL FOUR index words are 0 in the seed (`$8130FA`, `$81311E`, `$81B706`,
// `$81B71C`); their only writers are in the unported hyper-setup `$2885xx` and
// the build-A `$187xxx` ISR region.  So both are CORPUS NO-OPS: the board reads
// 0, skips, returns; the port does the same.  Nonzero indices (a future hyper
// wave) hit `unreached()` rather than calling an unported target.

import { RAM } from './machine.js';
import { unreached } from './unported.js';
import { queueKill, ALLOC } from './objalloc.js';
import { respawn25FFA8, setPanel2603B0 } from './player.js';

/** ROM and RAM addresses the rank object speaks in, each cited at the line that
 *  implements it. */
export const RANK = {
  dispatch: 0x240F62,       // object table; entry [10] = $260794, priority $001F
  handler: 0x260794,        // the state machine
  stateOff: 0x02,           // $260794 tst.b ($2,A5) -- the state byte
  initState: 0x2605C8,      // state 0 -> INIT (DEFERRED, cold-boot only)
  teardown2603DA: 0x2603DA, // state 2 -> jsr $2603DA then jmp $241292 (self-kill)
  selfKill: 0x241292,       // lea $4C(A5),A0 / bra $241238 -- deferred kill by ID
  // state-1 per-frame body $2607A8..$260808
  gate813082: 0x813082,     // $2607A8 tst.w -- per-frame gate (set -> skip body)
  freezeD2: 0x8130D2,       // $2607B2 tst.w -- freeze/pause; SHARED with
                            //   stageend.js SE.pauseFlag (bgPause25FD82 sets it)
  d4: 0x8130D4,             // $2607BC tst.w / $2607C6 subq.w #1 -- a countdown
  frameCopy: 0x8130CA,      // $2607D4 move.w D0 -- $80390A & $0E
  clock: 0x8130C6,          // $2607E4 addq.l #1 -- THE RANK CLOCK (24.8 fixed)
  recompute: 0x2608D2,      // $2607EA jsr -- the recompute + clamp + fan-out
  callee288610: 0x288610,   // $2607F0 jsr -- computed-call dispatcher (corpus no-op)
  loopWord: 0x813098,       // $2607F6 tst.w -- 0 = loop 1, !=0 = loop 2+
  loop2Hud: 0x81B414,       // $260800 move.w #$1 -- set on loop 2+
  // the recompute $2608D2
  basePtr: 0x81315C,        // $2608D2 movea.l -- per-stage base table POINTER
                            //   (seed -> ROM $260874, a 6-byte table; W127 window)
  stageIdx: 0x813092,       // $2608D8 move.w -- stage index (0 = stage 1)
  hyperP1: 0x81B63E,        // $2608F4 move.w -- hyper active P1
  hyperP2: 0x81B640,        // $2608FA or.w -- hyper active P2
  powerP1: 0x81B646,        // $260902 move.w -- power P1 (the 16*max term)
  powerP2: 0x81B648,        // $260908 cmp.w -- power P2
  rankOut: 0x81309E,        // $260944 move.w D1 -- THE RANK OUTPUT word
  // computed-call dispatcher $288610 (corpus no-op)
  disp288610Table: 0x81B706,// $288610 lea -- 2-entry table, stride $16
  disp288610Stride: 0x16,
  disp288610Jump: 0x288638, // $28861E lea (PC) -- the jump table
  // computed-call dispatcher $25FF7A (the state-1 FIRST callee; corpus no-op)
  disp25FF7A: 0x25FF7A,
  disp25FF7ATable: 0x8130FA,// $25FF7A lea -- 2-entry table, stride $24
  disp25FF7AStride: 0x24,
  disp25FF7AJump: 0x25FF52, // $25FF92 lea (PC) -- the jump table
};

/** The one declared deviation: state-0 INIT `$2605C8` is DEFERRED.  A seeded
 *  run starts in state 1 (slot 0 in the seed carries state byte 1), so INIT
 *  only runs on a cold boot / fresh RAM.  Its palette half is already replayed
 *  by `palette.js catchUpTextPalette` (W93); its non-palette tail (resource
 *  installs, the `$813082`/`$813098` seeds, ten `$2414BE` installs, creation of
 *  object type 0) is cold-boot-only and belongs to a boot-at-any-rung follow-up.
 *  If state 0 is ever hit, the deviation is noted and the object advances to
 *  state 1 (its per-frame body), so it cannot spin. */
export const RANK_DEVIATION = Object.freeze({
  [0x2605c8]: 'DEFERRED -- $2605C8, the state-0 INIT. Seeded runs start in state '
    + '1 (slot 0 carries state byte 1 in the seed), so this only runs on a cold '
    + 'boot. The palette half is replayed by palette.js catchUpTextPalette (W93); '
    + 'the non-palette tail (resource installs, $813082/$813098 seeds, object '
    + 'type-0 creation) is cold-boot-only and deferred to a boot-at-any-rung '
    + 'follow-up. The object advances to state 1 so it cannot spin.',
});

const note = (ctx, a, w) => ctx.unportedLog?.note(a, w);

// ---------------------------------------------------------- the recompute $2608D2

/**
 * `$2608D2..$260A1E` -- THE RANK RECOMPUTE.  Reads base[stage] + (clock>>8) +
 *  (hyper ? 16*max(power) : 0), pins loop 2+, clamps loop 1, writes `$81309E`,
 *  fans the low byte to 15 bullet-system bytes.  Reads NO chain/score state
 *  (W120 sec 5, re-verified).  `[M]` validated against the seed: predicted
 *  $35 = actual $35; all 15 fan-out bytes exact.
 *
 *  Exposed (not closed over) so the test can drive it from a fixture and so a
 *  future Wave B can re-use the formula once the power term has writers.
 */
export function recompute2608D2(ram, rom) {
  // $2608D2 movea.l $81315C.l,A0 ; $2608D8 move.w $813092.l,D2 ;
  // $2608DE moveq #$0,D1 ; $2608E0 move.b (A0,D2.w),D1 -- D1 = base[stage]
  const basePtr = ram.u32(RANK.basePtr);
  const stage = ram.u16(RANK.stageIdx);
  let d1 = rom.u8(basePtr + stage) & 0xff;             // base[stage], byte
  // $2608E4 move.l $8130C6.l,D2 ; $2608EA moveq #$8,D3 ; $2608EC lsr.l D3,D2
  // $2608EE add.w D2,D1 -- D1 += (clock>>8) low word
  const clk = (ram.u32(RANK.clock) >>> 8) & 0xffff;
  d1 = (d1 + clk) & 0xffff;
  // $2608F4 move.w $81B63E.l,D0 ; $2608FA or.w $81B640.l,D0 ; $260900 beq ->
  const hyper = ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2);
  if (hyper !== 0) {
    // $260902..$260918: D0 = max($81B646,$81B648) << 4 ; D1 += D0
    let d0 = ram.u16(RANK.powerP1);
    if (ram.u16(RANK.powerP2) > d0) d0 = ram.u16(RANK.powerP2); // bcc keeps D0 if >=
    d1 = (d1 + ((d0 << 4) & 0xffff)) & 0xffff;
  }
  // $26091A tst.w $813098.l ; $260920 beq $260944 (loop 1, computed + clamp)
  const loop = ram.u16(RANK.loopWord);
  let rank;
  if (loop !== 0) {
    // loop 2+: PIN, then bra $260984 (NO clamp). $260924 $FF (hyper) /
    // $26093A $F8 (no hyper), selected by a SECOND hyper read at $26092C.
    rank = (ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2)) !== 0 ? 0xFF : 0xF8;
  } else {
    // loop 1: $260944 move.w D1,$81309E, then clamp.  The clamp re-reads hyper
    // ($26094A): no hyper -> cap $F0 ($260958 bls / $260964); hyper -> $FF.
    rank = d1;
    const cap = (ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2)) !== 0 ? 0xFF : 0xF0;
    if (rank > cap) rank = cap;
  }
  ram.setU16(RANK.rankOut, rank);                       // $260944 / $260924 / $26093A
  fanOut260984(ram, rank & 0xff);                       // $260984..$260A18
}

/**
 * `$260984..$260A18` -- fan the rank low byte into 15 bullet-system bytes.
 *  A pure function of r: with s1=r>>1, s2=r>>2, s3=r>>3, d7=r>>4, the writes
 *  (transcribed in write-order from the listing) are each a small sum/difference
 *  of those four shifts.  `[M]` all 15 predicted values match the seed for
 *  r = $35.  Byte arithmetic throughout (`add.b`/`sub.b`), so mask with & 0xff.
 */
function fanOut260984(ram, r) {
  const d7 = (r >> 4) & 0xff;
  let s1 = (r >> 1) & 0xff;            // $260990 lsr.w #1,D0 (rank>>1)
  ram.setU8(0x8130AF, s1);             // $260996
  ram.setU8(0x8130AD, (s1 + d7) & 0xff); // $26099C/$26099E
  const s2 = (r >> 2) & 0xff;          // $2609A4 lsr.w #1,D0 (rank>>2)
  ram.setU8(0x8130B7, s2);             // $2609AA
  ram.setU8(0x8130B5, (s2 + d7) & 0xff); // $2609B0/$2609B2
  let d1 = (s1 + s2) & 0xff;           // $2609B8 add.b D0,D1 (D1 was s1, += s2)
  ram.setU8(0x8130A7, d1);             // $2609BC
  ram.setU8(0x8130A5, (d1 + d7) & 0xff); // $2609C2/$2609C4
  const s3 = (r >> 3) & 0xff;          // $2609CA lsr.w #1,D0 (rank>>3)
  // $2609CE add.b D0,D1 (D1 = s1+s2, += s3) ; D3 was D1 before this add (s1+s2)
  const d1BeforeS3 = d1;
  d1 = (d1 + s3) & 0xff;
  ram.setU8(0x8130A3, d1);             // $2609D2
  ram.setU8(0x8130A1, (d1 + d7) & 0xff); // $2609D8/$2609DA
  const d3 = (d1BeforeS3 - s3) & 0xff; // $2609E0 sub.b D0,D3 (D3=s1+s2, -= s3)
  ram.setU8(0x8130AB, d3);             // $2609E4
  ram.setU8(0x8130A9, (d3 + d7) & 0xff); // $2609EA/$2609EC
  // $2609F2 move.w D2,D3 (D3 = s2) ; $2609F4 add.b D0,D2 (D2 = s2+s3)
  const d2 = (s2 + s3) & 0xff;
  ram.setU8(0x8130B3, d2);             // $2609F8
  ram.setU8(0x8130B1, (d2 + d7) & 0xff); // $2609FE/$260A00
  const d3b = (s2 - s3) & 0xff;        // $260A06 sub.b D0,D3 (D3=s2, -= s3)
  ram.setU8(0x8130BB, d3b);            // $260A0A
  ram.setU8(0x8130B9, (d3b + d7) & 0xff); // $260A10/$260A12
  ram.setU8(0x8130BD, d7);             // $260A18
}

// --------------------------------------------- the computed-call dispatchers

/** `$25FF52`, the jump table `$25FF7A` indexes: `[0] $00000000`,
 *  `[1] $0025FFA8` (the respawn, W228), `[2] $260056`, `[3] $26010E`. Only the
 *  ported entries appear here; the others still throw by the jsr site. */
const DISP_25FF7A_TARGETS = Object.freeze({
  1: respawn25FFA8,        // $25FFA8, the respawn (W228)
  9: setPanel2603B0,       // $2603B0, the SET/bonus panel (W231)
});

/**
 * The shared body of `$25FF7A` and `$288610`: walk a 2-entry RAM table, read
 *  each entry's index word, SKIP on 0, otherwise index a ROM jump table (idx*4)
 *  and `jsr (target)`.  `[M]` ALL FOUR index words are 0 in the seed, so on the
 *  corpus both callers return without dispatching.  The targets are unported
 *  (per-player hyper/palette/sound servicers); a nonzero index is a state the
 *  corpus never produces, so it throws `unreached()` by the jsr site rather than
 *  calling an untranslated target.
 */
function computedDispatch(ram, ctx, tableAddr, stride, jumpTable, jsrSite,
  targets = null) {
  for (let e = 0; e < 2; e++) {             // $288616 moveq #$1,D7 ; dbra D7
    const entry = tableAddr + e * stride;   // $28862E/$288632 lea ($16,A4),A4
    const idx = ram.u16(entry);             // $288618 move.w (A4),D0
    if (idx === 0) continue;                // $28861A beq (skip this entry)
    // $288624 add.w D0,D0 ; $288626 add.w D0,D0 (idx*4) ; $288628 adda.w D0,A0
    // ; $28862A movea.l (A0),A0 ; $28862C jsr (A0).
    // W228: `$25FF7A`'s entry 1 IS ported now -- it is the respawn, and a death
    // arms it through `$24A210`, so this stopped being a corpus no-op the moment
    // the player could die.  The rest stay a throw by the jsr site.
    const target = targets?.[idx];
    if (target) { target(ram, ctx, entry); continue; }
    unreached(jsrSite, `$${jsrSite.toString(16).toUpperCase()} computed-call `
      + `dispatcher: entry $${entry.toString(16).toUpperCase()} index `
      + `$${idx.toString(16)} is nonzero, so it would jsr the jump-table `
      + `[$${idx}] target out of $${jumpTable.toString(16).toUpperCase()} `
      + `(a per-player hyper/palette/sound servicer). The corpus keeps every `
      + `index 0; a nonzero index belongs to the unported hyper subsystem `
      + `(Wave B). Port the target or narrow the scenario`);
  }
}

// ---------------------------------------------------------- the state-1 body $2607A8

/**
 * `$2607A8..$260808` -- the state-1 per-frame body.  The `$813082` gate, the
 *  `$8130D2` freeze gate (shared with the stage-end pause), the `$8130D4`
 *  countdown, the `$8130CA` frameCounter copy, the clock advance, the recompute,
 *  the `$288610` dispatcher, and the loop-2+ HUD flag.
 *
 *  NOTE on the `$813082`-gated alternate arm `$26080A`: when the gate is SET the
 *  board takes `bne $260808` straight to `rts` and runs NONE of the body below.
 *  `$26080A..$260844` (the `move.w #$1,D1 / jmp $25FF38` family) is reached from
 *  ELSEWHERE (it is a register-convention enqueue helper, A4 = `$813162`/`$813166`
 *  via the `$260A20` lea), NOT from the rank object's own per-frame path; it is
 *  out of scope this wave and not reached on the corpus.
 */
function perFrame2607A8(ram, rom, ctx) {
  if (ram.u16(RANK.gate813082) !== 0) return;     // $2607A8 tst.w / bne $260808
  // $2607B2 tst.w $8130D2 / bne $2607CC -- freeze SET skips the D4 countdown
  // (but NOT the clock advance or the recompute).  $8130D2 is the SAME word
  // stageend.js `bgPause25FD82` sets, so a stage-end pause stops the countdown.
  if (ram.u16(RANK.freezeD2) === 0
      && ram.u16(RANK.d4) !== 0) {                // $2607BC tst.w / beq $2607CC
    ram.setU16(RANK.d4, (ram.u16(RANK.d4) - 1) & 0xffff); // $2607C6 subq.w #1
  }
  // $2607CC moveq #$0E,D0 ; $2607CE and.w $80390A.l,D0 ; $2607D4 move.w D0,$8130CA
  ram.setU16(RANK.frameCopy, ram.u16(RAM.frameCounter) & 0x000E);
  // $2607DA tst.w $8130D2 / bne $2607EA -- freeze SET skips the CLOCK +1, BUT
  // the branch lands ON $2607EA, so the recompute STILL runs every frame.
  if (ram.u16(RANK.freezeD2) === 0) {
    ram.setU32(RANK.clock, (ram.u32(RANK.clock) + 1) >>> 0); // $2607E4 addq.l #1
  }
  recompute2608D2(ram, rom);                      // $2607EA jsr $2608D2
  // $2607F0 jsr $288610 -- the computed-call dispatcher (corpus no-op).  The
  // state-1 body's FIRST callee is `$2607A4 jsr ($25FF7A,PC)`, run from the
  // state-machine entry below; $288610 is the SECOND.
  computedDispatch(ram, ctx, RANK.disp288610Table, RANK.disp288610Stride,
    RANK.disp288610Jump, RANK.callee288610);
  // $2607F6 tst.w $813098 / beq $260808 -- loop 1 -> rts; loop 2+ sets $81B414.
  if (ram.u16(RANK.loopWord) !== 0) {
    ram.setU16(RANK.loop2Hud, 1);                 // $260800 move.w #$1,$81B414
  }
}

// ============================================================ OBJECT TYPE 10

/**
 * `$260794` -- THE RANK OBJECT.  `makeRankObject(rom)` returns the handler
 *  `(ram, slot, index, ctx) => {...}` wired into `main.js defaultHandlers[10]`.
 *  State byte at `($2,A5)`; state 0 INIT (DEFERRED), state 1 per-frame body,
 *  state 2 teardown (self-kill).
 */
export function makeRankObject(rom) {
  return function rankObject(ram, slot, index, ctx) {
    void index;
    const a5 = slot;
    const state = ram.u8(a5 + RANK.stateOff);     // $260794 tst.b ($2,A5)
    if (state === 0) {
      // $260798 beq $2605C8 -- state 0 INIT.  DEFERRED (cold-boot only; the
      // seed starts in state 1).  Note the deviation and advance to state 1 so
      // the object cannot spin; the full INIT is a boot-at-any-rung follow-up.
      note(ctx, RANK.initState, RANK_DEVIATION[RANK.initState]);
      ram.setU8(a5 + RANK.stateOff, 1);
      return;
    }
    if (state === 2) {
      // $2607A2 beq $260788 -- state 2 teardown: `$260788 jsr $2603DA` (noted,
      // unported presentation/teardown work) then `jmp $241292` (self-kill by
      // ID, the same deferred kill stageend.js `destroy28D5E6` uses).  Never
      // reached on the seeded corpus.
      note(ctx, RANK.teardown2603DA, '$2603DA -- the rank object state-2 '
        + 'teardown body (presentation/sound), counted, not run this wave');
      queueKill(ram, ram.u32(a5 + ALLOC.idOff));  // $26078C jmp $241292
      return;
    }
    // state 1: `$2607A4 jsr ($25FF7A,PC)` -- a computed-call dispatcher (corpus
    // no-op, same shape as $288610), THEN the per-frame body.
    computedDispatch(ram, ctx, RANK.disp25FF7ATable, RANK.disp25FF7AStride,
      RANK.disp25FF7AJump, RANK.disp25FF7A,       // $2607A4
      DISP_25FF7A_TARGETS);
    perFrame2607A8(ram, rom, ctx);                // $2607A8..$260808
  };
}
