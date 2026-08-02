// THE ENEMY SPAWN SIDE -- `$2633BE` the stage-1 spawn walker, `$2633DE` the
// dispatch, `$2635F6` the init+8 second entry point, `$2635B2` the sub-record
// allocator, and `$815EAA` the deferred queue.
//
// ============================ WHAT THIS WAVE IS =============================
//
// Plan W21 (this is worklog wave 22): the enemy spawn walker that makes stage
// 1's 339 spawns arrive live instead of from the capture.  The distance clock
// `$8130CE` is ALREADY REAL from W14 (`src/background.js`, compared column
// `d0ce`) and is NOT re-ported here: the walker READS it the way `$2633D0
// cmp.w $8130ce,D0` does.  A wrong clock cadence is the wave's RED switch.
//
// The 8-byte spawn record, as `census.py script_records` decodes it and
// `$2633BE` walks it:
//
//   +$0  W  trigger   matched against $8130CE ($8130CE is an odometer, W14)
//   +$2  W  param     stored at enemy+$0A by $263428
//   +$4  B  type      -> D0 (the allocator's band selector and +$0C byte)
//   +$5  B  flags     -> D1 (the allocator's band selector and +$0D byte)
//   +$6  W  data idx  & $FFF -> the aux table -> a movement-script offset
//
// ===================== THE +8 RULE, AND WHY IT IS ABSOLUTE ==================
//
// Every one of the 256 type-table entries has an INIT routine that is EXACTLY
// eight bytes -- `move.w #N,($4,A5) / rts` -- and NOTHING ELSE (`20-recon-
// enemy-census`, verified mechanically over all 256).  The real initialisation
// is at init+8, reached by `$26361A addq.w #8,A1 / ... / $263650 jsr (A1)`.
// Recon 10 wrote the mechanism down and warned a port that translates only the
// first entry point loses half of every enemy's init; the census measured it is
// worse: the first entry point is 8 bytes of run-length and NOTHING ELSE, so
// 115 real init bodies are 100 % at +8.  This port calls BOTH.
//
// ===================== WHAT IS NOT PORTED, AND THROWS =======================
//
// The init BODIES at init+8 (the 115 real routines that load prototypes through
// `$26377A`/`$2637A2` and run bespoke code) are W23.  `initDispatch` resolves
// init+8 and `runInitBody()` throws carrying the address.  The resource lookup
// `$246CAC` (resource #$1F = the movement scripts) is W24; the walker computes
// the movement-script pointer and the resolver `note()`s it, returning a
// sentinel so the spawn still counts.  The enemy handlers (the `($4C,A5)`
// dispatch the init stores) are W25/W29.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';
import { allocEnemy, ENEMY } from './enemies.js';
import { runInitBodyAddr, INIT_BODY_FREED } from './initbody.js';

// --------------------------------------------------------------- the addresses
export const SPAWN = {
  STAGE_TAB: 0x263336,         // $263396 lea ($263336,PC),A0  (the install reads it)
  LIVE_CURSOR: 0x8132cc,       // $2633be lea $8132cc,A3 ; the live script ptr
  AUX_BASE: 0x8132d0,          // $81339e move.l (A0)+,($4,A4)  (= LIVE_CURSOR+4)
  DISTANCE_CLOCK: 0x8130ce,    // $2633d0 cmp.w $8130ce,D0  (real from W14)
  // the deferred queue $815EAA (LIFO, $C80 cap).  $26369a cmpi.w #$c80,D2.
  // entry stride is $50 (one enemy-record-width): $2634ba addi.w #$50,D2 and
  // the drain copies +$2/+$12..+$46/+$4A in place (16 fields, $263472..$2634CC),
  // which only makes sense if source and destination share the enemy record
  // layout.
  DEFQ_BASE: 0x815eaa,
  DEFQ_COUNT: 0x815ea8,        // $263446 move.w $815ea8,D6  (byte offset)
  DEFQ_CAP: 0x0c80,            // $26369a cmpi.w #$c80,D2  -> $C80/$50 = 40 entries
  DEFQ_STRIDE: 0x50,
  DEFQ_DUMMY: 0x816b2a,        // $2636ca lea $816b2a,A0  (queue-full: silent drop)
  // the sub-record pools ($2635B2).  stride $20; "free" is byte+0 == 0.
  SUB_COMMON: 0x81459c,        // $2635cc lea $81459c,A6  (100 slots, $64)
  SUB_SPECIAL: 0x81521c,       // $2635bc lea $81521c,A6  (50 slots, $32)
  SUB_STRIDE: 0x20,
  SUB_COMMON_COUNT: 0x64,
  SUB_SPECIAL_COUNT: 0x32,
  // the type tables ($2635F6).  LO for types <$80, HI for >=$80.  8 bytes per
  // type: a longword init pointer then a longword handler pointer.
  TYPE_LO: 0x267824,           // $2635fc lea $267824,A0
  TYPE_HI: 0x27e412,           // $263608 lea $27e412,A0
  TYPE_STRIDE: 8,
  NULL_INIT: 0x267814,         // the do-nothing init  ($267814 move.w #$0,($4,A5))
  NULL_HANDLER: 0x26781c,      // the do-nothing handler ($26781c jmp $263762 = free)
  NULL_INIT2: 0x27e402,        // byte-identical stub for the $80+ half
  NULL_HANDLER2: 0x27e40a,
};

// the 8-byte spawn record layout
export const REC = { trig: 0x00, param: 0x02, type: 0x04, flags: 0x05, idx: 0x06 };

// the 16-byte stage-table entry layout ($263386 reads longwords from it)
export const STAGE = { script: 0x00, aux: 0x04, res: 0x08, stride: 0x10 };

// the enemy record offsets the dispatch writes (kept here, beside the writer)
const E = { param: 0x0a, subRec: 0x06, handler: 0x4c, runLen: 0x04, classByte: 0x0d,
            player: 0x03, p1Sel: 0x01, movement: 0x12, clear3E: 0x3e, typeByte: 0x0c };

/** $813096 is stage*4 (W17 measured it going 0->4 at the stage-1->2 boundary;
 *  `census.py` and `$263392 add.w D0,D0 / add.w D0,D0` make it a x16 byte
 *  index).  Stage 1 = index 0. */
export function stageIndex(ram) { return ram.u16(0x813096) >> 2; }

/** The (script, aux, res) triple for a stage, read the way `$263386` does. */
export function stageTableEntry(rom, stage) {
  const a = SPAWN.STAGE_TAB + stage * STAGE.stride;
  return { script: rom.u32(a + STAGE.script), aux: rom.u32(a + STAGE.aux),
           res: rom.u32(a + STAGE.res) };
}

/**
 * `$263386` -- install the stage's script/aux pointers and clear the deferred
 * queue.  The resource #$1F install (`$246CAC`) is noted, not ported (W24).
 * The port sets LIVE_CURSOR = script and AUX_BASE = aux, mirroring $26339C/$26339E.
 */
export function installStage(ram, rom, stage, unported) {
  const e = stageTableEntry(rom, stage);
  ram.setU32(SPAWN.LIVE_CURSOR, e.script);          // $26339c move.l (A0)+,(A4)
  ram.setU32(SPAWN.AUX_BASE, e.aux);                // $26339e move.l (A0)+,($4,A4)
  ram.setU16(SPAWN.DEFQ_COUNT, 0);                  // $2633b6 clr.w $815ea8
  unported?.note(0x246d04, `resource #$1F install (res $${e.res.toString(16).toUpperCase()}) -- the movement-script data is W24`);
}

// ----------------------------------------------------------------- the walker
/**
 * `$2633BE` -- one frame of the spawn walker.  Reads $8130CE, walks the script
 * from the cursor in $8132CC, and for every record whose trigger == the clock
 * calls `onDispatch(cursor, rec)`; records past their trigger are skipped
 * (`blt`, the fast-forward path) and a future trigger ends the pass (`bne`).
 * The cursor is written back only at exit (`$263444 move.l A2,(A3)`), exactly
 * as the cartridge does -- so reading $8132CC after this returns is the live
 * "next record" pointer.
 *
 * `onDispatch` is the SPAWN EFFECT (allocate + init in the live port; a counter
 * in the gate).  It is deliberately a callback so the cursor/trigger logic has
 * ONE implementation and the gate validates the SAME code the port runs --
 * which is the defect two of the last three waves shipped (a gate that agreed
 * with itself whatever it held).
 *
 * @returns {number} the count of dispatched records this frame
 */
export function walkScriptLoop(ram, rom, onDispatch) {
  const clock = ram.u16(SPAWN.DISTANCE_CLOCK);      // $2633d0 cmp.w $8130ce,D0
  let cursor = ram.u32(SPAWN.LIVE_CURSOR);          // $2633c4 movea.l (A3),A2
  let count = 0;
  for (;;) {
    const trig = rom.u16(cursor);                   // $2633c6 move.w (A2),D0
    if (trig === 0xffff) break;                     // $2633c8 cmpi / $2633cc beq -> exit
    // `cmp.w clock,D0` then `blt $263440` (signed): trigger already past -> skip
    if (i16(trig) < i16(clock)) { cursor += 8; continue; }  // $2633d6 blt / $263440 addq #8
    if (trig !== clock) break;                      // $2633da bne -> exit (future)
    onDispatch(cursor, {                            // $2633de.. the dispatch body
      type: rom.u8(cursor + REC.type),              // $2633e0 move.b ($4,A2),D0
      flags: rom.u8(cursor + REC.flags),            // (the >>16 of the +4 longword)
      param: rom.u16(cursor + REC.param),           // $263428 move.w ($2,A2),($a,A0)
      idx: rom.u16(cursor + REC.idx) & 0x0fff,      // $2633f6 andi.w #$fff,D7
    });
    count++;
    cursor += 8;                                    // $263440 addq.w #8,A2
  }
  ram.setU32(SPAWN.LIVE_CURSOR, cursor);            // $263444 move.l A2,(A3)
  return count;
}

/**
 * `$2633FA..$26341E` -- resolve the movement-script pointer for a record.  The
 * 12-bit data idx indexes the aux table (a word offset into resource #$1F);
 * `$246CAC` looks up the resource base (W24, noted) and `$26341E adda.w D7,A1`
 * adds the offset.  The pointer is stored at enemy+$12 regardless; its value
 * is a sentinel until W24, which is fine because nothing reads +$12 this wave.
 * @returns {number} a movement-script pointer (sentinel if the resource is
 *   unported; the real address once W24 resolves resource #$1F)
 */
export function resolveMovementPtr(ram, rom, recCursor, unported) {
  const auxBase = ram.u32(SPAWN.AUX_BASE);          // $2633fa movea.l ($4,A3),A1
  const idx = rom.u16(recCursor + REC.idx) & 0x0fff;// $2633f6 andi.w #$fff,D7
  const off = rom.u16(auxBase + idx * 2);           // $2633fe add.w D7,D7 / $263400 (A1,D7.w)
  unported?.note(0x246cac, `resource #$1F lookup for movement-script offset `
    + `$${off.toString(16).toUpperCase()} (idx ${idx}) -- W24`);
  // resource base unknown until W24; return the offset as a placeholder pointer.
  // The spawn still COUNTS; nothing in this wave reads enemy+$12.
  return off;
}

/**
 * `$2635F6` -- the init dispatch, INCLUDING the init+8 second entry point.
 * Reads the type the allocator stored at +$0C, looks up init in the type table
 * (LO `$267824` / HI `$27E412`), calls the 8-byte stub that writes the
 * sub-record run-length to +$04, then computes init+8 and runs the sub-record
 * allocator and the REAL init body.  This is where the +8 rule lives.
 *
 * Returns `{init, initBody, runLen}` so a caller (or test) can name the body.
 */
export function initDispatch(ram, rom, rec, unported, bodyFn) {
  const type = ram.u8(rec + E.typeByte);            // $2635f8 move.b ($c,A5),D7
  const lo = type < 0x80;                           // $263602 cmpi.w #$80,D7 / blt
  const tab = lo ? SPAWN.TYPE_LO : SPAWN.TYPE_HI;   // $2635fc / $263608 lea
  const t = (type & 0x7f) * SPAWN.TYPE_STRIDE;      // $263612 lsl.w #3,D7 (after sub $80)
  const init = rom.u32(tab + t);                    // $263614 movea.l (A0,D7.w),A1
  const handler = rom.u32(tab + t + 4);             // $263628 movea.l ($4,A0,D7.w),A0
  // $263618 jsr (A1): the 8-byte stub `move.w #N,($4,A5) / rts`.  N is the
  // immediate at init+2 (census.py verified all 256 are this shape).
  const runLen = rom.u16(init + 2);                 // the #N of `3b7c 000N 0004`
  ram.setU16(rec + E.runLen, runLen);               // the stub's one store
  const initBody = init + 8;                        // $26361a addq.w #8,A1  <-- +8
  // $263620 bsr $2635b2: the sub-record allocator (run-length consecutive slots)
  const sub = allocSubRecord(ram, ram.u8(rec + E.classByte), runLen);
  // $263624 move.l A6,($6,A5): the sub-record pointer is the allocator's return.
  // allocSubRecord returns it; if it failed (pool exhausted) the record is cleared.
  if (sub === null) {                               // $263622 bcs $263674
    ram.setU16(rec, 0);                             // $263674 clr.w (A5)
    return { init, initBody, runLen, failed: true };
  }
  ram.setU32(rec + E.subRec, sub);                  // $263624
  ram.setU32(rec + E.handler, handler);             // $26362c move.l A0,($4c,A5)
  // $263630..$263648: the player-record select.  bit 0 of +$01 picks P2.
  const p2 = (ram.u8(rec + E.p1Sel) & 1) !== 0;     // $263638 btst #$0,($1,A5)
  ram.setU8(rec + E.player, p2 ? 1 : 0);            // $263648 move.b D0,($3,A5)
  ram.setU16(rec + E.clear3E, 0);                   // $26364c clr.w ($3e,A5)
  // $263650 jsr (A1) -- THE INIT+8 BODY (W23: the 21 stage-1 bodies, src/
  // initbody.js).  `bodyFn` (defaulting to runInitBody) is the one seam: the
  // live port runs the translated body; a test can pass a no-op to inspect the
  // state the mechanism wrote BEFORE the body runs (which is everything the +8
  // rule is).  The body takes `rom` because the prototype loaders + the
  // sprite/bucket/palette table lookups read ROM the way the 68000 does.
  const freed = (bodyFn ?? runInitBody)(initBody, ram, rom, rec, unported);
  // If a stage-kill gate inside the body freed the enemy (`jmp $263762`), the
  // type word is already clear and the slot will be skipped by the driver; the
  // scroll-locked fixup below is a position op on a dead record, so skip it.
  if (freed === INIT_BODY_FREED) return { init, initBody, runLen, failed: false, freed: true };
  // $263652..$26366a: scroll-locked spawn fixup.  If the class byte's bit 0 is
  // set, subtract the cross-axis scroll delta ($813172) from the sub-record's
  // along-axis position (+$04), once, so a scroll-locked enemy does not jump.
  if ((ram.u8(rec + E.classByte) & 1) !== 0) {      // $263656 btst #$0,D0
    const d = ram.u16(0x813172);                    // $263660 move.w $813172,D0
    ram.setU16(sub + 4, u16(i16(ram.u16(sub + 4)) - i16(d)));  // $263666 sub.w D0,($4,A6)
  }
  return { init, initBody, runLen, failed: false };
}

/**
 * The init+8 body dispatcher (W23).  Runs the translated body in src/initbody.js
 * for the 21 stage-1 types; returns INIT_BODY_FREED if a stage-kill gate freed
 * the enemy.  The NULL init ($267814 / $27E402) is honoured as-written: its
 * stub already wrote the run-length and init+8 is a harmless fall-through, so
 * it returns undefined (not freed).  Any non-stage-1 address is a LOUD NAMED
 * THROW (never a silence).
 */
export function runInitBody(addr, ram, rom, rec, unported) {
  if (addr === SPAWN.NULL_INIT + 8 || addr === SPAWN.NULL_INIT2 + 8) return;
  return runInitBodyAddr(addr, ram, rom, rec, unported);
}

// --------------------------------------------- the sub-record allocator $2635B2
//
// `runLen` is the value the init stub wrote to ($4,A5) = run-1 (census:
// ($4,A5) = run-1).  The allocator finds runLen+1 CONSECUTIVE free $20-byte
// slots and marks each occupied with $8000.  Band: class byte bit 7 OR bit 5
// -> the 50-slot special pool; else the 100-slot common pool.
//
// The ROM search is intricate (it resets the consecutive counter on an
// occupied slot and backs up to mark the run).  Translated as-written:
//   D0 = runLen, D1 = runLen (the consecutive-free counter)
//   scan slots; on FREE: dbra D1 (count one of the run); on OCCUPIED: reset D1
//   when D1 exhausts: back up, mark runLen+1 slots, return the first
// The result is returned (the slot address, or null if the pool could not fit
// the run), mirroring how A6 carries the result out in the ROM.
export function allocSubRecord(ram, classByte, runLen) {
  const special = (classByte & 0x80) !== 0 || (classByte & 0x20) !== 0; // $2635b8/$2635c6
  const base = special ? SPAWN.SUB_SPECIAL : SPAWN.SUB_COMMON;          // $2635bc/$2635cc
  const slots = special ? SPAWN.SUB_SPECIAL_COUNT : SPAWN.SUB_COMMON_COUNT;
  const stride = SPAWN.SUB_STRIDE;
  // find runLen+1 consecutive free slots
  let need = runLen + 1;                          // D1 = runLen, counts down runLen+1
  let runStart = -1;
  let scanning = false;
  for (let i = 0; i < slots; i++) {
    const a = base + i * stride;
    if (ram.u8(a) === 0) {                        // $2635d8 tst.b (A6) -- free
      if (!scanning) { runStart = i; scanning = true; }
      need--;                                      // $2635e4 dbra D1
      if (need === 0) break;                       // run found
    } else {                                      // occupied: reset the run
      need = runLen + 1;                           // $2635e0 move.w D0,D1
      scanning = false;
    }
  }
  if (need !== 0) return null;                     // $2635d6 bcs $2635f4
  // mark runLen+1 slots occupied ($8000) and return the first ($2635e8..$2635f0)
  const first = base + runStart * stride;
  for (let k = 0; k <= runLen; k++) {
    ram.setU16(first + k * stride, 0x8000);       // $2635ec move.w #$8000,(A6)
  }
  return first;
}

// ----------------------------------------------------- the script dispatch $2633DE
/**
 * `$2633DE` -- the full per-record dispatch: resolve the movement-script
 * pointer, allocate an enemy record (`$2636D6`), and on success store the
 * param and movement ptr and run the init dispatch.  On alloc failure the
 * walker still advances (carry -> $263440), so the CURSOR is unaffected; only
 * the spawn's EFFECT is skipped.
 * @returns {{ok:boolean, slot:number, type:number, initBody:number}}
 */
export function dispatchScriptRecord(ram, rom, recCursor, unported) {
  const type = rom.u8(recCursor + REC.type);       // $2633e0
  const flags = rom.u8(recCursor + REC.flags);     // (the high byte of the +4 longword)
  const param = rom.u16(recCursor + REC.param);    // $263428
  const mov = resolveMovementPtr(ram, rom, recCursor, unported); // $2633fa..$26341e
  const r = allocEnemy(ram, type, flags);          // $263420 bsr $2636d6
  if (r.carry) return { ok: false, slot: r.addr, type, initBody: 0 };  // $263424 bcs
  ram.setU16(r.addr + E.param, param);             // $263428 move.w ($2,A2),($a,A0)
  ram.setU32(r.addr + E.movement, mov);            // $26342e move.l A1,($12,A0)
  const init = initDispatch(ram, rom, r.addr, unported);  // $263438 bsr $2635f6
  return { ok: true, slot: r.addr, type, initBody: init.initBody,
           allocFailed: init.failed };
}

// ------------------------------------------------- the deferred queue `$815EAA`
//
// The ONLY door for the 47 script-less types (plan W21): an enemy handler
// enqueues a record ($263678/$263684/$263690) and the walker drains the queue
// LIFO at the end of every script pass ($263446).  Entry stride is $50; cap is
// $C80 / $50 = 40 entries.  Three entry points differ only in the flags word D1:
//   $263678  D1 = $80     $263684  D1 = $00     $263690  D1 = caller's
export const DEFQ_D1 = { FIXED80: 0x80, FIXED00: 0x00, CALLER: -1 };

/**
 * Enqueue a deferred spawn.  `$263678/$263684/$263690`.  If the queue is full
 * ($C80) the ROM silently drops the spawn and hands back the dummy $816B2A.
 * @param {number} type  D0 (type byte)
 * @param {number} d1mode one of DEFQ_D1
 * @param {number} callerD1  the caller's D1, used only when d1mode == CALLER
 * @returns {{addr:number, dropped:boolean}}
 */
export function enqueueDeferred(ram, type, d1mode, callerD1 = 0) {
  let count = ram.u16(SPAWN.DEFQ_COUNT);           // $263694 move.w $815ea8,D2
  if (count === SPAWN.DEFQ_CAP) {                  // $26369a cmpi.w #$c80,D2 / beq
    return { addr: SPAWN.DEFQ_DUMMY, dropped: true };  // $2636ca lea $816b2a,A0
  }
  const a = SPAWN.DEFQ_BASE + count;               // $2636a2 lea $815eaa,A0 / adda D2
  const flags = d1mode === DEFQ_D1.FIXED80 ? 0x80
    : d1mode === DEFQ_D1.FIXED00 ? 0x00 : callerD1;
  ram.setU16(a + 0x02, type);                      // $2636aa move.w D0,($2,A0)
  ram.setU16(a + 0x04, flags);                     // $2636ae move.w D1,($4,A0)
  ram.setU32(a + 0x12, 0);                         // $2636b2 move.l #$0,($12,A0)
  count += SPAWN.DEFQ_STRIDE;                      // $2636ba addi.w #$50,D2
  ram.setU16(SPAWN.DEFQ_COUNT, count);             // $2636be move.w D2,$815ea8
  return { addr: a, dropped: false };
}

/**
 * `$263446` -- drain the deferred queue LIFO.  Each iteration pops the TOP
 * entry (count -= $50), allocates an enemy, copies the queued fields, and runs
 * the init dispatch.  The queue empties every frame: handlers enqueue, the
 * walker drains, so the count is 0 at the sample point unless a handler ran
 * AFTER the walker this frame.
 * @returns {number} the number of deferred spawns processed
 */
export function processDeferred(ram, rom, unported) {
  let n = 0;
  for (;;) {
    let count = ram.u16(SPAWN.DEFQ_COUNT);         // $263446 move.w $815ea8,D6
    if (count === 0) break;                        // $26344c beq -> done
    count -= SPAWN.DEFQ_STRIDE;                    // $263450 subi.w #$50,D6
    const a = SPAWN.DEFQ_BASE + count;             // $263454 lea $815eaa / adda D6
    const type = ram.u16(a + 0x02) & 0x00ff;       // $26345c/$263460 move.w ($2,A4),D0
    const flags = ram.u16(a + 0x04);               // $263464 move.w ($4,A4),D1
    ram.setU16(SPAWN.DEFQ_COUNT, count);           // (pop happens at $2634d2 in ROM)
    const r = allocEnemy(ram, type, flags);        // $263468 jsr $2636d6
    if (r.addr === ENEMY.dummy) continue;          // $2634d8 cmpa.l #$81454c / beq
    // $263472..$2634CC: copy the queued fields into the enemy record.  The ROM
    // drain copies +$2 (byte) at $263472, FOURTEEN longwords at +$12..+$46
    // (every 4 bytes, $263478..$2634C6), then +$4A (word) at $2634CC -- sixteen
    // fields in all.  Truncating this list (the W22 review's F1: the loop once
    // stopped at +$26) loses any state a handler writes into the tail
    // (+$2A..+$4A: sub-record position, etc.) and the drained record diverges.
    ram.setU8(r.addr + 0x02, ram.u8(a + 0x02));    // $263472 move.b ($2,A4),($2,A0)
    for (const off of [0x12, 0x16, 0x1a, 0x1e, 0x22, 0x26,  // $263478..$263496
                       0x2a, 0x2e, 0x32, 0x36, 0x3a, 0x3e, 0x42, 0x46])  // $26349c..$2634c6
      ram.setU32(r.addr + off, ram.u32(a + off));
    ram.setU16(r.addr + 0x4a, ram.u16(a + 0x4a));  // $2634cc move.w ($4a,A4),($4a,A0)
    initDispatch(ram, rom, r.addr, unported);      // $2634e4 bsr $2635f6
    n++;
    // re-read count: the loop tests $815ea8 at $2634e8
  }
  return n;
}

/**
 * `$2634F4` -- the per-frame spawn driver: walk the script, then drain the
 * queue.  This is what the live frame loop will call once the init bodies
 * (W23) and handlers (W25) are ported; until then the gate drives
 * `walkScriptLoop` with a counting callback and validates the SAME cursor
 * logic against the board.
 */
export function runSpawnWalker(ram, rom, unported) {
  const script = walkScriptLoop(ram, rom, (cur, rec) =>
    dispatchScriptRecord(ram, rom, cur, unported));
  const deferred = processDeferred(ram, rom, unported);
  return { script, deferred };
}
