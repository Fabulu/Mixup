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
import { u16, i16, u32 } from './ram.js';
import { allocEnemy, ENEMY } from './enemies.js';
import { runInitBodyAddr, INIT_BODY_FREED } from './initbody.js';

// --------------------------------------------------------------- the addresses
export const SPAWN = {
  RESET_BASE: 0x81332c,       // $26331E lea $81332C,A0
  RESET_WORDS: 0x1c27,        // $263324 #$1C26 / DBRA => $1C27 words
  RESET_END: 0x816b7a,        // exclusive; exactly $27E98A's item-pool base
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
export function installStage(ram, rom, stage, unported, prot) {
  const e = stageTableEntry(rom, stage);
  ram.setU32(SPAWN.LIVE_CURSOR, e.script);          // $26339c move.l (A0)+,(A4)
  ram.setU32(SPAWN.AUX_BASE, e.aux);                // $26339e move.l (A0)+,($4,A4)
  ram.setU16(SPAWN.DEFQ_COUNT, 0);                  // $2633b6 clr.w $815ea8
  // $2633A2: `move.l res,-(A7); move.l #$1F,-(A7); jsr $246D04` installs the
  // resource base into protection slot #$1F.  resolveMovementPtr reads res from
  // the stage table directly (the latch is a transparent indirection for THIS
  // resource -- the bytes are plain ROM, recon §2); `prot?.setSlot` keeps the
  // simulated $500000 latch faithful to the board for any other reader.
  prot?.setSlot(0x1f, e.res);                       // $246D04($1F, res)
}

/**
 * `$26331E..$263334` -- clear the complete enemy subsystem and then install
 * the current stage's spawn/aux/resource triple.  The order is indivisible:
 * `$263330 bsr.w $263386` is inside the reset routine, after the DBRA clear.
 * The half-open clear ends exactly where `$27E98A` starts the item pool.
 */
export function resetAndInstallStage26331E(ram, rom, unported, prot) {
  for (let i = 0; i < SPAWN.RESET_WORDS; i++) {
    ram.setU16(SPAWN.RESET_BASE + i * 2, 0);         // $263328 move.w #0,(A0)+
  }
  const stage = stageIndex(ram);                     // $26338C $813096 / 4
  installStage(ram, rom, stage, unported, prot);     // $263330 bsr.w $263386
  return stageTableEntry(rom, stage);
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
 * `$263408 readSlot($1F)` is the resource base (installed by $2633A2) and
 * `$26341E adda.w D7,A1` adds the offset.  The IGS027A latch is a transparent
 * indirection for THIS resource (the bytes are plain ROM, recon §2), so the
 * port reads res from the stage table the way installStage does -- the VALUE is
 * identical to `readSlot($1F)` and no new protection work is needed.
 * @returns {number} the movement-script pointer (resource base + aux[idx])
 */
export function resolveMovementPtr(ram, rom, recCursor, unported) {
  const auxBase = ram.u32(SPAWN.AUX_BASE);          // $2633fa movea.l ($4,A3),A1
  const idx = rom.u16(recCursor + REC.idx) & 0x0fff;// $2633f6 andi.w #$fff,D7
  const off = rom.u16(auxBase + idx * 2);           // $2633fe add.w D7,D7 / $263400 (A1,D7.w)
  const res = stageTableEntry(rom, stageIndex(ram)).res; // $263408 readSlot($1F)
  return (res + off) >>> 0;                         // $26341e adda.w D7,A1
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
export function initDispatch(ram, rom, rec, unported, bodyFn, tables, palette,
  soundPost) {
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
  const freed = (bodyFn ?? runInitBody)(initBody, ram, rom, rec, unported,
    tables, palette, soundPost);
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
export function runInitBody(addr, ram, rom, rec, unported, tables, palette,
  soundPost) {
  if (addr === SPAWN.NULL_INIT + 8 || addr === SPAWN.NULL_INIT2 + 8) return;
  return runInitBodyAddr(addr, ram, rom, rec, unported, tables, palette, soundPost);
}

// ------------------------------------------- $28AD54: THE SUB-RECORD REAPER
//
// **WAVE 33.  THE PORT LEAKED SUB-RECORDS FOR FOUR WAVES AND NOTHING SAID SO.**
//
// The three states of a sub-record's byte 0, out of the listing and not from a
// name anyone invented:
//
//   NEGATIVE  ALIVE.   `$2635EC move.w #$8000,(A6)` on allocation, then
//                      overwritten by the prototype's own first word, which is
//                      negative for every live type.
//   1         DYING.   `$263762` (free the enemy) writes ONE:
//                      `moveq #$1,D0 / move.b D0,(A6) / lea $20(A6),A6 / dbra`.
//   0         FREE.    `$2635D8 tst.b (A6) / beq` -- the allocator's ONLY test.
//
// So `$263762` does NOT free the slot; it marks it dying. **The 1 -> 0
// transition is this loop, and this loop is TYPE-5 CALL #3**, which the port
// counted as a note labelled "the sub-record spawn engine driver". It is TWO
// routines by fall-through: the reaper below, and then `$28AD70` onwards, the
// driver over the $81DB90 cue pool. W173 closes the type-$84 descriptor subset
// of that second subsystem in `src/cues.js`.
//
//   $28AD54 move.w #$95,D0        150 slots -- the 100-slot COMMON pool
//   $28AD58 moveq #$0,D1          $81459C and the 50-slot SPECIAL pool $81521C
//   $28AD5A lea $81459C,A0        are CONTIGUOUS and walked as ONE array
//   $28AD60 tst.b (A0) / beq      already 0: leave it
//   $28AD64 bmi                   negative: ALIVE, leave it
//   $28AD66 move.w D1,(A0)        1 (or any positive non-zero): ZERO IT
//   $28AD68 lea $20(A0),A0 / dbra
//
// Note the write is a WORD (`move.w D1,(A0)`), not a byte: it clears byte 1 as
// well. Transcribed as-written.
//
// MEASURED before this landed, on the fly-around replay: 7 of 100 common slots
// occupied at the lf2000 seed, 100 of 100 from lf2906, and from that frame on
// EVERY spawn failed its sub-record allocation and was silently cleared.
export const SUB_REAPER = {
  entry: 0x28ad54,
  slots: 0x96,               // $28AD54 move.w #$95,D0 then dbra == 150
  base: 0x81459c,            // $28AD5A lea
  tail: 0x28ad70,            // where the OTHER routine begins
};

/** `$28AD54..$28AD6C` -- turn every DYING sub-record slot into a FREE one.
 *  @returns {number} how many slots this frame reaped (diagnostic only) */
export function reapSubRecords(ram) {
  let n = 0;
  for (let i = 0; i < SUB_REAPER.slots; i++) {          // $28AD6C dbra
    const a = SUB_REAPER.base + i * SPAWN.SUB_STRIDE;   // $28AD68 lea $20(A0),A0
    const b = ram.u8(a);                                // $28AD60 tst.b (A0)
    if (b === 0) continue;                              // $28AD62 beq
    if ((b & 0x80) !== 0) continue;                     // $28AD64 bmi -- alive
    ram.setU16(a, 0);                                   // $28AD66 move.w D1,(A0)
    n++;
  }
  return n;
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
 * **WAVE 33: THE TWO FAILURE ARMS ARE NOW COUNTED.**  Both are faithful ROM
 * behaviour -- the board really does drop a spawn when a band is full
 * (`$263748`) or when the sub-record pool cannot fit the run (`$263622 bcs
 * $263674`) -- but the port had no way to SEE either, and that is how the
 * sub-record leak (W33 §4: 100 of 100 slots from lf2906, every spawn after it
 * discarded) survived four waves.  `spawnEvent` is optional and appended, so
 * no existing call site changed; `Game` folds it into `allocEvents`, beside the
 * object allocator's own failures, for exactly the reason stated there.
 *
 * @param spawnEvent optional `(kind, type) => void`
 * @returns {{ok:boolean, slot:number, type:number, initBody:number}}
 */
export function dispatchScriptRecord(ram, rom, recCursor, unported, tables,
  spawnEvent, palette, soundPost) {
  const type = rom.u8(recCursor + REC.type);       // $2633e0
  const flags = rom.u8(recCursor + REC.flags);     // (the high byte of the +4 longword)
  const param = rom.u16(recCursor + REC.param);    // $263428
  const mov = resolveMovementPtr(ram, rom, recCursor, unported); // $2633fa..$26341e
  const r = allocEnemy(ram, type, flags);          // $263420 bsr $2636d6
  if (r.carry) {                                   // $263424 bcs $263440
    spawnEvent?.('band-full', type);               // $263748 -- the DUMMY record
    return { ok: false, slot: r.addr, type, initBody: 0 };
  }
  ram.setU16(r.addr + E.param, param);             // $263428 move.w ($2,A2),($a,A0)
  ram.setU32(r.addr + E.movement, mov);            // $26342e move.l A1,($12,A0)
  const init = initDispatch(ram, rom, r.addr, unported, undefined, tables,
    palette, soundPost);                           // $263438
  // `$263622 bcs $263674` -- the sub-record run did not fit and the record was
  // cleared.  The init BODY never ran, so this spawn produced nothing at all.
  if (init.failed) spawnEvent?.('sub-record-pool-full', type);
  else spawnEvent?.('script', type);
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
export function processDeferred(ram, rom, unported, tables, spawnEvent, palette,
  soundPost) {
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
    if (r.addr === ENEMY.dummy) {                  // $2634d8 cmpa.l #$81454c / beq
      spawnEvent?.('deferred-band-full', type);
      continue;
    }
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
    const init = initDispatch(ram, rom, r.addr, unported, undefined, tables,
      palette, soundPost);                         // $2634e4
    spawnEvent?.(init.failed ? 'deferred-sub-record-pool-full' : 'deferred', type);
    n++;
    // re-read count: the loop tests $815ea8 at $2634e8
  }
  return n;
}

/**
 * `$2633BE` -- the per-frame spawn driver: walk the script, then drain the
 * deferred queue.
 *
 * **THE ADDRESS IN THIS DOCSTRING WAS WRONG UNTIL W29.**  It said `$2634F4`,
 * which is the CALLER (`$2634F6 bsr.w $2633BE / $2634FA bsr.w $263502`) and
 * includes the 58-slot enemy driver this function does not run.  Nothing had
 * noticed because until W29 the caller did not exist in the port at all: the
 * gate drove `walkScriptLoop` directly and never had to name the routine.
 * `$2634F4` is now `src/enemyframe.js`.
 *
 * The two halves below are ONE routine in the ROM by fall-through: `$263444
 * move.l A2,(A3)` writes the cursor back and drops straight into `$263446
 * move.w $815EA8,D6`, the deferred drain, which is what reaches `$2634F2 rts`.
 */
export function runSpawnWalker(ram, rom, unported, tables, spawnEvent, palette,
  soundPost) {
  const script = walkScriptLoop(ram, rom, (cur, rec) =>
    dispatchScriptRecord(ram, rom, cur, unported, tables, spawnEvent, palette,
      soundPost));
  const deferred = processDeferred(ram, rom, unported, tables, spawnEvent,
    palette, soundPost);
  return { script, deferred };
}

// ===========================================================================
// $246800 -- THE MULTI-PART CHAIN FREE.  W341.
// ===========================================================================
//
// Six instructions, **TWENTY-ONE callers**, and it is the teardown half of the
// multi-part object constructor at `$246520` (not yet ported):
//
//     246800  move.l D0,-(A7)          <-- TWO separate pushes, not a `movem.l`
//     246802  move.l A0,-(A7)
//     246804  movea.l D0,A0
//     246806  clr.w (A0)               release the node
//     246808  move.w #$0,($4,A0)       and its second field
//     24680e  move.l ($2C,A0),D0
//     246812  bne $246804              follow the ($2C) LINK and loop
//     246814  movea.l (A7)+,A0 / move.l (A7)+,D0 / rts
//
// The two writes are **exactly the inverse of `$246520`'s claim**, which sets
// `move.w #$8000,(A1)` and `move.w D6,($4,A1)`.  So the pool convention is
// confirmed from both ends: `tst.w / bmi` means occupied when NEGATIVE, and
// `clr.w` is what frees a slot.
//
// `+$2C = next` and `+$18 = a per-node quantity` are a convention shared by at
// least three routines -- `$24681A`, immediately after this one, walks the same
// chain summing `($18,A0)`.
//
// **IT IS A DO-WHILE, NOT A WHILE.**  There is no null test before `$246804`, so
// the ROM frees the head unconditionally and relies on every one of its
// twenty-one callers passing a real pointer.  A null head would `clr.w` address
// 0.  The port refuses by address rather than silently returning, because a null
// reaching here means the caller's chain bookkeeping is already wrong and
// swallowing it would hide that.
//
// @param head the chain head (the ROM's D0 on entry)
// @returns {number} how many nodes were released
export function freeChain246800(ram, head) {
  if (head === 0) {
    unreached(0x246800, '$246800 was called with a NULL chain head. It is a do-while with no entry '
      + 'test, so the ROM would clear address 0 -- all twenty-one of its callers are expected to pass '
      + 'a live pointer, and a null here means the caller\'s ($2C) chain bookkeeping is already wrong');
  }
  let at = head;
  let n = 0;
  for (;;) {
    ram.setU16(at, 0);                                   // $246806 clr.w (A0)
    ram.setU16(at + 0x04, 0);                            // $246808 move.w #$0,($4,A0)
    n += 1;
    const next = ram.u32(at + 0x2c);                     // $24680E move.l ($2C,A0),D0
    if (next === 0) return n;                            // $246812 bne $246804
    if (n > CHAIN_CAP) {
      unreached(0x246812, `$246800 followed more than ${CHAIN_CAP} ($2C) links. The node pool at `
        + '$80FA86 holds only twenty $70-byte nodes, so a longer chain means a cycle -- which the ROM '
        + 'would loop on forever, and a hanging suite is a worse way to learn that than a failing one');
    }
    at = next;
  }
}

/** The node pool at `$80FA86` holds TWENTY `$70`-byte nodes (`$80FA86 + 20 * $70 == $810346`, the
 *  parent pool's own base -- the two pools abut, which is what proves both strides). So no legitimate
 *  chain exceeds twenty, and this bound turns a ROM infinite loop into a located throw. */
const CHAIN_CAP = 20;

// ===========================================================================
// $246520 / $24652A -- THE MULTI-PART OBJECT CONSTRUCTOR.  W341.
// ===========================================================================
//
// **TWO ENTRY POINTS DIFFERING ONLY IN D6.**  `$246520` is `movem.l D1-D7/A0-A4,-(A7) /
// move.w #$1,D6 / bra $246532`; `$24652A` is the same prologue with `move.w #$0,D6`
// and falls through.  D6 lands in the parent's `($4,A1)` at `$246544`, so the two
// entries set a mode word -- and then D6 is REUSED as the node-pool walk counter
// at `$24654E move.w #$13,D6`.  One register, two roles, eight bytes apart.
//
// TWO CONTIGUOUS RAM POOLS, AND THE ABUTMENT PROVES BOTH STRIDES:
//
//     $80FA86 + 20 * $70 == $810346      the node pool ends EXACTLY at the parent base
//     $810346 +  3 * $30 == $8103D6
//
// Neither stride is derivable from the `dbra` literals (`#$13` and `#$2` are the
// counts); they are separate `lea` displacements at `$2465DE` and `$246600`.
//
// TWO DISPATCH TABLES, WITH DIFFERENT BOUNDING DISCIPLINES:
//
//     $24627A   3 entries x 8 bytes, indexed by a caller word used as a BYTE offset.
//               **Index 3 is `48E77F00` -- an INSTRUCTION.**  So 0/8/$10 only, and the
//               port THROWS rather than clamping: the guard IS the semantics (W326).
//     $246B38   32 entries x 4 bytes, indexed by `(caller word & $1F) * 4`.  The ROM's
//               own `andi.w #$1F` bounds it, so no guard is needed or wanted.
//
// The caller's table is a COUNT WORD followed by count * 12-byte nodes.  `$4C` passes
// `$2701C8`, whose count is 1 -- **the twenty-slot walk is the POOL's capacity, not any
// caller's demand.  Do not size anything from `#$13`.**
//
// @param a0 the caller's table address (the ROM's A0)
// @param mode D6 on entry: 1 from `$246520`, 0 from `$24652A`
// @returns {number} the parent pointer (the ROM's D0), or 0 if the pools ran dry
export function buildParts246520(ram, rom, a0, mode, site = 0x246520) {
  // $246532 -- claim one of THREE parent slots.  `tst.w / bmi` means occupied when NEGATIVE.
  let a1 = PARTS.parentPool;
  let claimed = false;
  for (let slot = 0; slot < PARTS.parentSlots; slot++) {       // moveq #$2,D7 + dbra = THREE
    if ((ram.u16(a1) & 0x8000) === 0) { claimed = true; break; }   // $24653A tst.w (A1) / bmi
    a1 += PARTS.parentStride;                                  // $246600 lea ($30,A1),A1
  }
  if (!claimed) return 0;                                      // $246608 moveq #-$1,D0
  const parent = a1;
  ram.setU16(a1, 0x8000);                                      // $246540 move.w #$8000,(A1)
  ram.setU16(a1 + 0x04, mode);                                 // $246544 move.w D6,($4,A1) -- the MODE

  let at = a0;
  let remaining = rom.u16(at); at += 2;                        // $24654C move.w (A0)+,D0 -- the COUNT
  let a2 = PARTS.nodePool;
  let built = 0;
  for (let walk = 0; walk < PARTS.nodeSlots; walk++) {         // move.w #$13,D6 + dbra = TWENTY
    if ((ram.u16(a2) & 0x8000) !== 0) {                        // $246558 tst.w (A2) / bmi $2465DE
      a2 += PARTS.nodeStride; continue;                        // $2465DE lea ($70,A2),A2
    }
    ram.setU32(a2 + 0x2c, 0);                                  // $246568 move.l #$0,($2C,A2)
    ram.setU32(a1 + 0x2c, a2);                                 // $246570 move.l A2,($2C,A1) -- the LINK
    a1 = a2;                                                   // $246574 movea.l A2,A1
    ram.setU16(a2 + 0x1e, 0); ram.setU16(a2 + 0x02, 0);        // $246576 / $24657C

    const d2 = rom.u16(at); at += 2;                           // $246582 move.w (A0)+,D2
    if (d2 !== 0 && d2 !== 8 && d2 !== 0x10) {                 // $246584 lea ($24627A,PC),A3
      unreached(0x246588, `$246588 indexed $24627A with D2 = $${d2.toString(16)}. That table holds `
        + 'THREE 8-byte entries and index 3 is $48E77F00 -- an INSTRUCTION -- so only 0, 8 and $10 are '
        + 'reachable. Clamping would read the ROM\'s own code as a pointer pair, which is why this '
        + 'throws instead (the $27460A treatment, W326)');
    }
    ram.setU32(a2 + 0x06, rom.u32(PARTS.dispatch8 + d2 + 4));  // $246588 move.l ($4,A3,D2.w),($6,A2)
    const base = rom.u32(PARTS.dispatch8 + d2);                // $24658E movea.l (A3,D2.w),A3
    const bias = rom.u16(at); at += 2;                         // $246592 adda.w (A0)+,A3
    ram.setU32(a2 + 0x0e, u32(base + bias));                   // $246594 move.l A3,($E,A2)
    ram.setU32(a2 + 0x0a, rom.u32(at)); at += 4;               // $246598 move.l (A0)+,($A,A2)
    ram.setU16(a2 + 0x04, rom.u16(at)); at += 2;               // $24659C move.w (A0)+,($4,A2)

    // $2465A0 -- the SECOND table.  `andi.w #$1F` IS the bound, so no guard here.
    const d3 = ((rom.u16(at) & 0x1f) * 4) & 0xffff; at += 2;   // $2465A0/$2465A6 two add.w D3,D3
    const row = PARTS.dispatch4 + d3;                          // $2465AA lea ($246B38,PC),A3
    ram.setU16(a2 + 0x16, rom.u16(row));                       // $2465B2 move.w (A3)+,($16,A2)
    ram.setU16(a2 + 0x14, ram.u16(a2 + 0x16));                 // $2465B6 -- the SAME word, TWICE
    ram.setU16(a2 + 0x1c, rom.u16(row + 2));                   // $2465BC move.w (A3),($1C,A2)
    ram.setU32(a2 + 0x18, 0xffff0000);                         // $2465C0 -- what $24681A SUMS

    // $2465C8 -- the payload: ($4,A2)+1 WORDS from the sprite base into the node at +$30.
    const words = u16(ram.u16(a2 + 0x04)) + 1;                 // $2465CC move.w ($4,A2),D4 / dbra
    const src = ram.u32(a2 + 0x0e);
    for (let w = 0; w < words; w++) {                          // $2465D4 move.w (A3)+,(A4)+
      ram.setU16(a2 + 0x30 + w * 2, rom.u16(src + w * 2));
    }
    built += 1;
    remaining = u16(remaining - 1);                            // $2465DA subq.w #1,D0 / beq
    if (remaining === 0) return parent;                        // $2465F8 -- success, A1 in D0
    a2 += PARTS.nodeStride;
  }
  // $2465E6 moveq #-$1,D0 -- the node pool ran dry mid-chain, so UNWIND.  Without this the parent
  // slot leaks permanently out of THREE.
  freeChain246800(ram, parent);                                // $2465F2 bsr $246800
  void built; void site;
  return 0;
}

/** `$246520`'s two RAM pools and two dispatch tables.  The pools ABUT, which is what proves both
 *  strides: `$80FA86 + 20 * $70 == $810346` and `$810346 + 3 * $30 == $8103D6`. */
export const PARTS = Object.freeze({
  nodePool: 0x80fa86, nodeSlots: 20, nodeStride: 0x70,
  parentPool: 0x810346, parentSlots: 3, parentStride: 0x30,
  dispatch8: 0x24627a,      // THREE 8-byte entries; index 3 is CODE
  dispatch4: 0x246b38,      // THIRTY-TWO 4-byte entries; bounded by `andi.w #$1F`
});
