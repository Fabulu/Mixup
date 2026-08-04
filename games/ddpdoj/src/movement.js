// THE MOVEMENT INTERPRETER -- `$263808` the spawn-time init reader, `$2638A6`
// the per-frame interpreter, the 13 opcodes (12 escapes + `>= $C0` set-speed),
// the loop-back termination, the velocity-cache discipline, and `$2417DE`'s
// direction+speed -> `$200920` apply.
//
// TWO consumers share the SAME opcode set and the SAME dispatch table
// (`$263948`, 12 longword function pointers): the init-reader `$263808` (runs
// once at spawn, out of every init body) and the per-frame `$2638A6` (runs each
// frame from the handler).  The decode below cites both arms.
//
// A stream byte `b` is classified by its high bits:
//   b  < $80   HEAD     `$2638C0` (frame) / `$263848` peek (init)
//              b & $7F  -> sub-record +$1B HEADING; the byte after b is a frame
//              count PARAM.  PARAM $00 holds the heading forever (the cursor is
//              NOT advanced -- the implicit loop).  PARAM n!=0 holds for n
//              frames (the byte counter at record+$10), then advances.
//              (b & $7F) >= $40 zeroes DX/DY (a "stop" heading, `$263910`).
//   $80<=b<$C0 ESCAPE   (b & $0F) indexes the 12-entry table at `$263948`.  The
//              high nibble (8/9/A/B) is IGNORED -- $80/$90/$A0/$B0 are the same
//              opcode.  See ESCAPES below.
//   b >= $C0  SPEED     `$26392C` (frame) / `$263854` (init): the byte after b
//              -> sub-record +$1A SPEED (the `$200920`/`$241812` index).
//
// ===================== THE VELOCITY CACHE (bit 5 of record+$02) ============
// record+$02 bit 5 == "velocity DIRTY" (set => recompute before re-use).
//   set by:    $263808 init tail ($263898) -- first frame must recompute
//              $26391E (after every SPEED / ESCAPE / counter-done HEAD) -- inputs changed
//   cleared:   $2638FA (the recompute path)
// per-frame HEAD apply (`$2638E0 btst #5,($2,A5)`):
//   dirty -> $2638FA: bclr #5; jsr $2417DE (recompute + apply); movem D2-D3,($40,A5)
//   clean -> $2638E8: movem ($40,A5),D2-D3 (reuse); add D2->+$02, D3->+$04
// The cursor (record+$12) is re-stored ONLY when an opcode ADVANCES it: on a
// counter-done HEAD (`$26391A`) or a SPEED/ESCAPE (`$26391A`).  A PARAM-$00 HEAD
// applies velocity and returns WITHOUT storing -- so the same heading re-runs
// every frame until the enemy dies.  (Stage 1 never emits a loop-back escape;
// 161/163 streams end on a PARAM-$00 HEAD, 2/163 on EXIT.)
//
// ============================== CONVENTIONS ================================
// `tables` is the MoveTables instance (src/vectors.js) whose `vector(speed,
// heading)` IS `$241812` (validated W20 for the ship and the shots).  The ROM
// applies D2 (the first longword the table yields, `asr.l #4`) to sub-record
// +$02 and D3 (the second) to +$04; `vector()` returns those as `.dy`/`.dx`
// respectively, so `+$02 += .dy` and `+$04 += .dx` mirrors `$2417F4/$2417F8`.

import { unreached } from './unported.js';
import { u16, i16 } from './ram.js';

// ----------------------------------------------------------- the record layout
// A5 = enemy record, A6 = sub-record (= record+$06).  The offsets the
// interpreter touches, named once so every line reads as the listing does.
export const MOVER = {
  // record (A5)
  flags: 0x02,          // bit 5 = velocity dirty; bit 6 = X,Y source (init)
  movement: 0x12,       // the stream cursor
  counter: 0x10,        // the HEAD frame-count counter (byte)
  param: 0x0a,          // the spawn param word (read by the init Y adjust)
  classByte: 0x0d,      // bit 0 = scroll-locked (the $24179e cross-axis comp)
  subRec: 0x06,
  velDX: 0x40,          // cached D2 (the +$02 delta), word
  velDY: 0x42,          // cached D3 (the +$04 delta), word
  ctrl48: 0x48,         // the controller X,Y source when flags bit 6 set (init)
};
// sub-record (A6)
const SUB = {
  flags: 0x00, posX: 0x02, posY: 0x04, speed: 0x1a, heading: 0x1b,
  anim: 0x1e, f1f: 0x1f,
};
// the globals the interpreter reads
const GL = {
  freeze: 0x8130d2,     // $2638A6 tst.w / $2417EA -- non-zero => zero vector
  scroll172: 0x813172,  // $263822 / $2639F6 -- the scroll accumulator (Y comp)
  scrollOdo: 0x8130d0,  // $26387C -- the init Y-odometer base (word past $8130CE)
  scrollB03C: 0x80b03c, // $2417A8 -- the cross-axis comp longword (swap, -> +$02)
};

// =========================================== $2417DE recompute + apply ==========
/**
 * `$2417DE` -- read (speed, heading) from the sub-record, call `$241812`
 *  (`tables.vector`), apply D2->+$02 / D3->+$04, and return the pair for the
 *  caller to cache.  When `$8130D2` (freeze) is set the vector is {0,0} and NO
 *  apply happens (the `$2638A6` entry already returned in that case, but
 *  `$2417DE` has 63 jsr sites and its own gate).  Returns `{dy, dx}` (D2, D3).
 */
export function applyVelocity(ram, tables, a5) {
  const a6 = ram.u32(a5 + MOVER.subRec);
  const speed = ram.u8(a6 + SUB.speed);                  // $2417E0 move.b ($1a,A6),D0
  const heading = ram.u8(a6 + SUB.heading) & 0x3f;       // $2417E4/#$3f / $2417E6 and.b
  if (ram.u16(GL.freeze) !== 0) return { dy: 0, dx: 0 }; // $2417EA / $2417F0 bne $2417fe
  const v = tables.vector(speed, heading);               // $2417F2 bsr $241812
  ram.setU16(a6 + SUB.posX,                              // $2417F4 add.w D2,($2,A6)
    u16(i16(ram.u16(a6 + SUB.posX)) + v.dy));
  ram.setU16(a6 + SUB.posY,                              // $2417F8 add.w D3,($4,A6)
    u16(i16(ram.u16(a6 + SUB.posY)) + v.dx));
  return v;                                              // D2,D3 for the cache
}

/**
 * `$24179E` -- the scroll-locked cross-axis compensation.  Reads the longword
 *  at `$80B03C` (writer `$240C7C`, W17), swaps the halves, adds the low word
 *  (the former high) to sub-record +$02.  Skipped when frozen.  Called from the
 *  per-frame interpreter when the class byte's bit 0 is set (`$2638AE`).
 */
export function scrollCompensate(ram, a5) {
  if (ram.u16(GL.freeze) !== 0) return;                  // $24179E / $2417A4 bne
  // `move.l $80b03c,D0 / swap D0 / add.w D0,($2,A6)`: swap exchanges the 16-bit
  // halves, then `add.w` takes the LOW half of the swapped register = the
  // ORIGINAL HIGH word at $80b03c.  (The draft read $80b03e -- the low word --
  // which inverts the swap.  Verified against the listing.)
  const hi = ram.u16(GL.scrollB03C);                     // $2417A8 move.l / $2417AE swap -> high word
  const a6 = ram.u32(a5 + MOVER.subRec);
  ram.setU16(a6 + SUB.posX, u16(i16(ram.u16(a6 + SUB.posX)) + i16(hi))); // $2417B0 add.w D0,($2,A6)
}

// =============================================== $2638A6 the per-frame step ===
/**
 * `$2638A6` -- one frame of the movement interpreter for the enemy at `a5`.
 * Reads the cursor at record+$12, classifies the opcode byte, and either applies
 * the current heading's velocity (HEAD) or consumes SPEED/ESCAPE opcodes and
 * loops until a HEAD is hit.  The cursor is stored back ONLY on the advancing
 * paths (counter-done / SPEED / ESCAPE), so a PARAM-$00 HEAD re-runs forever.
 *
 * @param tables  MoveTables (src/vectors.js); `.vector(speed,heading)` is $241812.
 * @param vec     W36, OPTIONAL: an object that receives D2/D3 as `{dy,dx}`.
 *   **`$2638A6` RETURNS D2/D3 ON EVERY PATH** and one caller reads them --
 *   `$275F30` (type `$88`) does `jsr $2638A6 / ... / neg.w D3 / add.w D3,(A0)`
 *   four instructions later.  The four returns are, out of the listing:
 *     `$2638A0 moveq #0,D2 / moveq #0,D3`   the FROZEN entry
 *     `$2638E8 movem.w ($40,A5),D2-D3`      the clean-cache HEAD
 *     `$263900 jsr $2417DE` -> its D2/D3    the dirty HEAD
 *     `$263910 moveq #0,D2 / move.w D2,D3`  a STOP heading (>= $40)
 *   so it is a defined return value, not a register that happens to survive.
 *   Omit it and nothing changes.
 * @returns `true` if the enemy EXITed this frame (escape #10 -> the record was
 *   freed by `$263762`); `false` otherwise.
 */
export function stepMovement(ram, rom, a5, tables, unported, vec = null) {
  if (vec) { vec.dy = 0; vec.dx = 0; }                   // $2638A0 / $263910
  if (ram.u16(GL.freeze) !== 0) return false;            // $2638A6 tst.w $8130d2 / bne $2638A0
  if ((ram.u8(a5 + MOVER.classByte) & 1) !== 0) {        // $2638AE btst #0,($d,A5)
    scrollCompensate(ram, a5);                           // $2638B6 jsr $24179e
  }
  let a0 = ram.u32(a5 + MOVER.movement);                 // $2638BC movea.l ($12,A5),A0
  if (a0 === 0) return false;                            // (no stream: nothing to do)
  const a6 = ram.u32(a5 + MOVER.subRec);
  for (;;) {
    const op = rom.u8(a0);                               // $2638C0 move.b (A0)+,D1
    a0 += 1;
    if (op < 0x80) {                                    // $2638C2 bmi $263926 -- HEAD arm
      // HEAD: the next byte is the frame-count param.
      const param = rom.u8(a0);                          // $2638C4 move.b (A0)+,D0
      a0 += 1;
      if (param === 0                                    // $2638C6 beq $2638D2 (hold forever)
          || u16(ram.u8(a5 + MOVER.counter) + 0) !== param) { // $2638C8 cmp.b ($10,A5),D0
        if (param !== 0)                                 // $2638CE addq.b #1,($10,A5)
          ram.setU8(a5 + MOVER.counter, (ram.u8(a5 + MOVER.counter) + 1) & 0xff);
        const heading = op & 0x7f;                       // $2638D2 andi.w #$7f,D1
        ram.setU8(a6 + SUB.heading, heading);            // $2638D6 move.b D1,($1b,A6)
        if (heading < 0x40) {                            // $2638DA cmpi.w #$40,D1 / bcc $263910
          applyOneHeading(ram, a5, a6, tables, vec);    // $2638E0..$26390E (dirty/clean + apply)
        }
        // PARAM==0 OR counter-not-done OR stop heading: return WITHOUT storing
        // the cursor (the implicit loop -- the same HEAD re-reads next frame).
        return false;
      }
      // counter == param: this heading is done.  Reset, store the cursor (now
      // past the param), mark dirty, and fall into the loop to read the next opcode.
      ram.setU8(a5 + MOVER.counter, 0);                  // $263916 clr.b ($10,A5)
      ram.setU32(a5 + MOVER.movement, a0);               // $26391A move.l A0,($12,A5)
      ram.bset8(a5 + MOVER.flags, 5);                    // $26391E bset #5,($2,A5)
      continue;                                          // $263924 bra $2638C0
    }
    // SPEED or ESCAPE -- both store the cursor + set dirty, then loop.
    if (op >= 0xc0) {                                   // $263926 cmpi.b #$c0 / $26392A bcs
      ram.setU8(a6 + SUB.speed, rom.u8(a0));             // $26392C move.b (A0)+,($1a,A6)
      a0 += 1;
    } else {
      a0 = runEscape(ram, rom, a5, a6, op, a0, unported); // $263932..$263944 dispatch
      // EXIT (escape #10) longjumps via `addq #8,A7; jmp $263762`: it frees the
      // record and aborts the interpreter.  runEscape already freed it and returns
      // the sentinel -- the cursor store / dirty set below MUST NOT run (the record
      // is dead; storing a Symbol into a u32 would throw anyway).
      if (a0 === MOVE_EXIT) return true;
    }
    ram.setU32(a5 + MOVER.movement, a0);                 // $26391A move.l A0,($12,A5)
    ram.bset8(a5 + MOVER.flags, 5);                      // $26391E bset #5,($2,A5)
    // $263924 bra $2638C0  -- loop back, read the next opcode.
  }
}

// the per-frame HEAD apply: dirty -> recompute+apply+cache; clean -> reuse cache.
// `$2638E0 btst #5,($2,A5)` / `$2638E6 bne $2638FA` / `$2638E8 movem ($40,A5),D2-D3`.
function applyOneHeading(ram, a5, a6, tables, vec = null) {
  if ((ram.u8(a5 + MOVER.flags) & 0x20) !== 0) {        // $2638E0 btst #5,($2,A5)
    ram.bclr8(a5 + MOVER.flags, 5);                     // $2638FA bclr #5,($2,A5)
    const v = applyVelocity(ram, tables, a5);            // $263900 jsr $2417de
    ram.setU16(a5 + MOVER.velDX, u16(v.dy));            // $263906 movem.w D2-D3,($40,A5)
    ram.setU16(a5 + MOVER.velDY, u16(v.dx));
    if (vec) { vec.dy = v.dy; vec.dx = v.dx; }          // D2/D3 out (W36)
  } else {
    const dx = i16(ram.u16(a5 + MOVER.velDX));           // $2638E8 movem.w ($40,A5),D2-D3
    const dy = i16(ram.u16(a5 + MOVER.velDY));
    if (vec) { vec.dy = dx; vec.dx = dy; }              // D2/D3 out (W36)
    ram.setU16(a6 + SUB.posX, u16(i16(ram.u16(a6 + SUB.posX)) + dx)); // $2638EE add.w D2,($2,A6)
    ram.setU16(a6 + SUB.posY, u16(i16(ram.u16(a6 + SUB.posY)) + dy)); // $2638F2 add.w D3,($4,A6)
  }
}

// the EXIT escape returns this to ask the caller to free the record ($263762).
export const MOVE_EXIT = Symbol('move-exit');

// ============================================ the 12 escapes (table $263948) ==
// Each returns the NEW cursor (A0) after consuming its operand bytes.  EXIT
// returns MOVE_EXIT (the ROM `addq #8,A7; jmp $263762` aborts the interpreter
// and frees the record).  Indexed by (opcode & $0F).
const ESCAPE_FNS = [
  // #0  LOOP-BACK `$263978`: A0 -= 2*read_byte.  UNUSED by any stage-1 stream
  //     (decoded for completeness; a later stage that emits one ports verbatim).
  //     `suba.w` sign-extends the WORD operand, but 2*off <= 510 < $8000 so the
  //     extension is a no-op; the result is the full 32-bit address (NOT wrapped
  //     to 16 bits -- the cursor is a ROM address like $231860).
  (ram, rom, a5, a6, a0) => {
    const off = rom.u8(a0); a0 += 1;                     // $26397A move.b (A0)+,D0
    return (a0 - 2 * off) >>> 0;                         // $26397C add.w D0,D0 / $26397E suba.w D0,A0
  },
  // #1  SET_SUBANIM `$263982`: next byte -> sub-record +$1F.
  (ram, rom, a5, a6, a0) => {
    ram.setU8(a6 + SUB.f1f, rom.u8(a0));                 // $263982 move.b (A0)+,($1f,A6)
    return a0 + 1;
  },
  // #2  TOG_FLAG_bit5 `$263988`: n==1 -> bclr #5,(A6); n>1 -> bset #5,(A6).
  (ram, rom, a5, a6, a0) => {
    const n = rom.u8(a0); a0 += 1;                       // $263988 move.b (A0)+,D0
    if ((n - 1) === 0) ram.bclr8(a6 + SUB.flags, 5);     // $26398C beq -> $26398E bclr
    else ram.bset8(a6 + SUB.flags, 5);                   // $263994 bset
    return a0;
  },
  // #3  TOG_FLAG_bits0_13 `$26399A`: n==1 -> andi #$DFFE,(A6); n>1 -> ori #$2001.
  //     (record flags WORD at sub+$00: bit 0 and bit 13 together.)
  (ram, rom, a5, a6, a0) => {
    const n = rom.u8(a0); a0 += 1;                       // $26399A move.b (A0)+,D0
    if ((n - 1) === 0) ram.setU16(a6 + SUB.flags, ram.u16(a6 + SUB.flags) & 0xdffe); // $2639A0
    else ram.setU16(a6 + SUB.flags, ram.u16(a6 + SUB.flags) | 0x2001);               // $2639A6
    return a0;
  },
  // #4  SET_A5+22 `$2639AC`: next byte -> controller +$22 (NOT the record).
  (ram, rom, a5, a6, a0) => {
    ram.setU8(a5 + 0x22, rom.u8(a0));                    // $2639AC move.b (A0)+,($22,A5)
    return a0 + 1;
  },
  // #5  SET_A5_word (packed) `$2639B2`: +1 off +2 words -> ((w1&$FF0)<<4)+((w2&$FF0)>>4)
  //     -> (A5,off.w).  A controller word at a variable offset.
  (ram, rom, a5, a6, a0) => {
    const off = rom.u8(a0); a0 += 1;                     // $2639B4 move.b (A0)+,D0
    const w1 = rom.u16(a0) & 0x0ff0; a0 += 2;            // $2639B6 / $2639B8 andi.w #$ff0,D1
    const w2 = rom.u16(a0) & 0x0ff0; a0 += 2;            // $2639BE / $2639C0
    ram.setU16(a5 + off, u16((w1 << 4) + (w2 >> 4)));    // $2639BC lsl #4 / $2639C4 lsr #4 / $2639C8
    return a0;
  },
  // #6  SET_REC_word (packed) `$2639CE`: as #5 but -> (A6,off.w) (RECORD word).
  (ram, rom, a5, a6, a0) => {
    const off = rom.u8(a0); a0 += 1;                     // $2639D0
    const w1 = rom.u16(a0) & 0x0ff0; a0 += 2;            // $2639D4
    const w2 = rom.u16(a0) & 0x0ff0; a0 += 2;            // $2639DC
    ram.setU16(a6 + off, u16((w1 << 4) + (w2 >> 4)));    // $2639E4 move.w D1,(A6,D0.w)
    return a0;
  },
  // #7  SET_A5+24 `$2639EA`: next byte -> controller +$24.
  (ram, rom, a5, a6, a0) => {
    ram.setU8(a5 + 0x24, rom.u8(a0));                    // $2639EA move.b (A0)+,($24,A5)
    return a0 + 1;
  },
  // #8  SET_ANIM `$2639F0`: next byte -> sub-record +$1E ANIM.
  (ram, rom, a5, a6, a0) => {
    ram.setU8(a6 + SUB.anim, rom.u8(a0));                // $2639F0 move.b (A0)+,($1e,A6)
    return a0 + 1;
  },
  // #9  Y_MINUS_SCROLL `$2639F6`: sub +$04 -= $813172, then skip 1 stream byte.
  (ram, rom, a5, a6, a0) => {
    const d = ram.u16(GL.scroll172);                     // $2639F6 move.w $813172,D0
    ram.setU16(a6 + SUB.posY, u16(i16(ram.u16(a6 + SUB.posY)) - i16(d))); // $2639FC sub.w D0,($4,A6)
    return a0 + 1;                                       // $263A00 addq.w #1,A0
  },
  // #10 EXIT `$263A04`: addq #8,A7; jmp $263762 -- abort + free the record.
  (ram, rom, a5, a6, a0) => MOVE_EXIT,
  // #11 NOP `$263A0C`: rts -- genuine no-op (padding/sync).
  (ram, rom, a5, a6, a0) => a0,
];

/** Dispatch one escape opcode.  `op` is the raw byte (>= $80, < $C0).
 *  Returns the new cursor, or MOVE_EXIT. */
function runEscape(ram, rom, a5, a6, op, a0, unported) {
  const kind = op & 0x0f;                               // $263932 andi.w #$f,D1
  const fn = ESCAPE_FNS[kind];
  if (!fn) unreached(0x263948, `escape kind ${kind} (op $${op.toString(16)}) `
    + `has no handler in the 12-entry table at $263948`);
  const r = fn(ram, rom, a5, a6, a0);
  if (r === MOVE_EXIT) {
    // `$263A04 addq #8,A7; jmp $263762` -- free every sub-record and clear the
    // type word (translated as initbody.freeEnemy does).  The caller sees the
    // freed record and stops stepping it.
    freeMovementEnemy(ram, a5);
  }
  return r;
}

// `$263762` (the EXIT target): mark each sub-record dead, clear the type word.
function freeMovementEnemy(ram, a5) {
  const a6 = ram.u32(a5 + MOVER.subRec);                 // $263762 movea.l ($6,A5),A6
  const run = ram.u16(a5 + 0x04);                        // $263768 move.w ($4,A5),D1
  for (let i = 0; i <= run; i++) ram.setU8(a6 + i * 0x20, 1); // $26376C / $263772 dbra
  ram.setU16(a5, 0);                                    // $263776 clr.w (A5)
}

// ============================================ $263808 the spawn-time init =====
/**
 * `$263808` -- the movement-script INITIAL reader, run once at spawn from each
 *  init body.  Reads the spawn X,Y from the stream (4-byte prefix) unless
 *  record+$02 bit 6 is set (then from controller+$48 + scroll), then consumes
 *  any run of SPEED/ESCAPE opcodes and stops at the FIRST HEAD, storing it as
 *  the heading and leaving the cursor pointing at it.  Applies the spawn Y
 *  odometer adjust (`(param-$8130D0)<<9 - $800`), zeroes the frame counter, and
 *  sets the velocity-dirty bit.  No velocity is applied here (that is per-frame).
 *
 *  When the cursor at record+$12 is 0 there is no movement script and the
 *  reader does nothing (the `$26380C beq $263754` path -- position is whatever
 *  the pool held, which for a script-less enemy is correct).
 */
export function readMovementInit(ram, rom, a5, unported) {
  let a0 = ram.u32(a5 + MOVER.movement);                 // $263808 move.l ($12,A5),D0
  if (a0 === 0) return;                                  // $26380C beq $263754
  const a6 = ram.u32(a5 + MOVER.subRec);
  if ((ram.u8(a5 + MOVER.flags) & 0x40) !== 0) {        // $263812 btst #6,($2,A5)
    // X,Y from the controller (+$48), Y += scroll.  `move.l ($48,A5),($2,A6)`
    // is a LONG copy: high word -> +$02 (X), low word -> +$04 (Y), THEN Y+=scroll.
    const xy = ram.u32(a5 + MOVER.ctrl48);               // $26381C move.l ($48,A5),($2,A6)
    ram.setU16(a6 + SUB.posX, xy >>> 16);                //   high word -> X
    ram.setU16(a6 + SUB.posY, xy & 0xffff);              //   low word  -> Y (was missing)
    ram.setU16(a6 + SUB.posY, u16(i16(ram.u16(a6 + SUB.posY)) + i16(ram.u16(GL.scroll172)))); // $263822/$263828
  } else {
    ram.setU16(a6 + SUB.posX, rom.u16(a0));              // $263830/$263832 move.w (A0)+,($2,A6)
    ram.setU16(a6 + SUB.posY, rom.u16(a0 + 2));          // $263836 move.w (A0)+,($4,A6)
    a0 += 4;
  }
  // `$26383A cmpi.b #$80,($4,A6) / bcs / bset #7`: `cmpi.b` on the byte at
  // ($4,A6) -- the HIGH byte of the Y word (big-endian).  If it is >= $80, set
  // bit 7 of that same (high) byte.  (For every stage-1 spawn the Y high byte is
  // $04/$18/$24, so this is a skip -- ported verbatim, not smoothed.)
  if (ram.u8(a6 + SUB.posY) >= 0x80) ram.bset8(a6 + SUB.posY, 7); // $26383A..$263842
  // The opcode loop: consume SPEED/ESCAPE until the first HEAD.  `op` is hoisted
  // out of the loop because the HEAD terminator (after `break`) stores it as the
  // heading ($263874 move.b D1,($1b,A6)) -- a block-scoped `const` would be gone.
  let op;
  for (;;) {
    op = rom.u8(a0);                                  // $263848 move.b (A0),D1  (PEEK)
    if (op < 0x80) break;                            // $26384A bpl $263870 -- HEAD terminator
    a0 += 1;                                         // $26384C addq.w #1,A0
    if (op >= 0xc0) {                                // $26384E cmpi.b #$c0 / $263852 bcs
      ram.setU8(a6 + SUB.speed, rom.u8(a0));         // $263854 move.b (A0)+,($1a,A6)
      a0 += 1;
    } else {
      a0 = runEscape(ram, rom, a5, a6, op, a0, unported); // $26385A..$26386C dispatch
      if (a0 === MOVE_EXIT) return;                   // EXIT aborts the init too
    }
    // $26386E bra $263848 -- loop back, peek the next opcode.
  }
  // HEAD terminator.  Cursor stored AT the HEAD byte (we peeked, no advance).
  ram.setU32(a5 + MOVER.movement, a0);                   // $263870 move.l A0,($12,A5)
  ram.setU8(a6 + SUB.heading, op);                       // $263874 move.b D1,($1b,A6)  (op<$80)
  // The spawn Y-odometer adjust: `((param - $8130D0) & $7F) ror.w #7` -> +$04, -$800.
  let d0 = u16(i16(ram.u16(a5 + MOVER.param)) - i16(ram.u16(GL.scrollOdo))); // $263878/$26387C
  d0 = (d0 & 0x7f);                                     // $263882 andi.w #$7f,D0
  d0 = ((d0 >>> 7) | (d0 << 9)) & 0xffff;               // $263886 ror.w #7,D0
  ram.setU16(a6 + SUB.posY, u16(i16(ram.u16(a6 + SUB.posY)) + i16(d0))); // $263888 add.w D0,($4,A6)
  ram.setU16(a6 + SUB.posY, u16(i16(ram.u16(a6 + SUB.posY)) - 0x800));    // $26388C subi.w #$800
  ram.setU16(a5 + MOVER.counter, 0);                     // $263892 moveq #0,D1 / $263894 move.w D1,($10,A5)
  ram.bset8(a5 + MOVER.flags, 5);                       // $263898 bset #5,($2,A5)
}

// the table of escape handlers, exported for tests that want to exercise one.
export const ESCAPES = ESCAPE_FNS;
