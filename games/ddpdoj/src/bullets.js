// THE ENEMY BULLET PATTERN GENERATORS -- `$2813F0`..`$2818B2`, and the three
// 39-entry kind tables behind them.
//
// ===================== WHAT A "PATTERN" IS IN THIS CARTRIDGE =================
//
// It is not a data record.  There is no "pattern table" with a count and a step
// in it, and looking for one is how this subsystem stays unported.  A pattern is
// a CALL:
//
//     D0 = (speed bias << 16) | KIND          the pattern word
//     D1 = the ANGLE                          1/64 turn (bank A) or 1/256 (bank B)
//     D2 = (axis A << 16) | axis B            where the bullet appears
//     D3 = a position DELTA, and for some kinds a pattern parameter
//     D4 / D5 = per-kind extra parameters
//     A5 = the firing enemy's record
//     jsr <one of 19 GENERATOR ENTRY POINTS>
//
// and the generator is a fixed, hand-unrolled sequence of calls into one of two
// SPAWN CORES with angle and speed offsets baked in as instruction operands.
// `$281764`, for instance, IS the two-way spread: `subq.b #8,D1 / jsr core /
// addi.b #$10,D1 / jsr core`.  Eleven degrees either side of the aim, written
// as two immediates, at one of 85 call sites.
//
// Fans WIDER than three are `dbra` loops at the CALL SITE with the count, the
// step and the base offset as immediates -- e.g. the stage-1 midboss at
// `$273B44`: `moveq #$4,D0 (kind 4) / subi.b #$1C,D1 (base = aim - 28/256) /
// moveq #$8,D6 (step 11.25 deg) / moveq #$7,D7 (count 8) / jsr $2817B8 /
// add.w D6,D1 / dbra`.  An eight-way ring, and every number in it is an operand.
//
// So the leverage, and it is why this file is worth its length: **19 entry
// points and two cores stand behind 912 fire call sites.**  Port the generator,
// never the instances.
//
// ===================== THE GATE THAT TURNS A SHOT INTO A FAN =================
//
// Sixteen of the nineteen entry points open `tst.w $813098 / beq <the core>`.
// **At `$813098 == 0` every one of them emits exactly ONE bullet** -- the
// rank!=0 body is skipped entirely and control falls into, or jumps to, the
// core.  `$813098` has read 0 on every frame this project has ever measured
// (over 16,000 of them, including a whole boss fight), so every spread in this
// file is code the cartridge has never been seen to run.  It is transcribed
// from the listing and validated under a POKE; see the worklog.
//
// ===================== THE 39 KINDS, AND WHAT A KIND IS ======================
//
// A KIND is an index 0..38 into three parallel 39-entry pointer tables:
//
//   `$281956[k]` -> a 20-byte TEMPLATE: the sprite, the graphic, the base speed
//                   and one flag.  This is the only per-kind DATA.
//   `$2815C6[k]` -> a SPAWN-INIT: 0..5 stores of the caller's D3/D4/D5 into the
//                   record's parameter area.  Nine distinct routines.
//   `$282030[k]` -> a BEHAVIOUR INITIALISER, run once by the mover, which
//                   installs a per-bullet CONTINUATION at record +$22 that the
//                   mover then `jmp`s every frame.  NOT ported by this wave.
//
// An ENTRY (a generator) chooses the SHAPE -- how many bullets, at what angle
// offsets, at what speed offsets.  A KIND chooses what each bullet IS -- its
// sprite, its base speed and its per-frame behaviour.  They are orthogonal:
// any of the 19 entries can fire any of the 39 kinds, and the call site picks
// both with two immediates.
//
// ===================== THE $40-BYTE RECORD ==================================
// See `REC` below.  Two fields decide everything downstream:
//   +$1A  SPEED INDEX  (0..255) -- an index into 256 velocity tables
//   +$1B  DIRECTION    (0..255) -- 1/256 turn
// and the mover RECOMPUTES the velocity from that pair EVERY FRAME
// (`$281EF6..$281F02`).  Nothing stores a heading vector.  See `bulletmath.js`.

import { unreached } from './unported.js';
import { i16, u16 } from './ram.js';

// --------------------------------------------------------------- addresses
export const BUL = {
  // the pool.  210 slots x $40 bytes, $817F8C..$81B40B.
  pool: 0x817f8c,
  slots: 210,
  stride: 0x40,
  poolClear: 0x28131e,          // the `move.w #$1A49,D0` dbra clear
  liveCount: 0x81b40c,          // $281E58 addq.w #1
  // the ACTIVE-WINDOW ladder.  MEASURED moving 70 -> 160 inside stage 1, so the
  // cap is a progression variable and compiling a constant here is wrong.
  window: [0x81b414, 0x81b416, 0x81b418, 0x81b41a],
  windowIters: [0x0d, 0x15, 0x1f, 0x25, 0x29],    // dbra counts: 70/110/160/190/210
  // the freeze gate, summed as WORDS at $2814BA..$2814C6
  freezeA: 0x8130d4,
  freezeB: 0x8130d2,
  freezeC: 0x811f72,
  rank: 0x813098,               // THE FAN GATE
  speedBias1: 0x813160,         // $28157A -- added to EVERY bullet's speed
  speedBias2: 0x812950,         // $281580 -- ditto ($252C8E writes it every frame)
  initX: 0x8130d8,              // $28190C reads these two into the record
  initY: 0x8130da,
  // the three kind tables
  templatePtrs: 0x281956,
  spawnInitPtrs: 0x2815c6,
  behaviourPtrs: 0x282030,
  kinds: 39,                    // extent proven from both ends, three tables
  coreA: 0x2814b6,
  coreB: 0x2817c2,
};

/**
 * THE 20-BYTE TEMPLATE, `$281956[kind]` -> here.  Every offset carries the
 * instruction that reads it, because the core reads the template STRICTLY
 * SEQUENTIALLY through `(A1)+` and the offsets are therefore implied by the
 * sizes of the six loads, not written down anywhere in the ROM.
 */
export const TPL = {
  typeWord: 0x00,      // $281568 move.w (A1)+,(A0)+     w
  renderOffs: 0x02,    // $28156C move.l (A1)+,(A0)+     l
  descriptor: 0x06,    // $28156E move.l (A1)+,(A0)+     l
  graphic: 0x0a,       // $281570 move.w (A1)+,(A0)+     w
  attribute: 0x0c,     // $281572 move.w (A1)+,($c,A0)   w
  baseSpeed: 0x0e,     // $281576 move.w (A1)+,D7        w   -- 20 in ALL 39
  runInit: 0x10,       // $2815AC tst.w (A1)             w
  // +$12 exists (stride is $14) and is NON-ZERO for 8 of the 39 kinds, and
  // NEITHER core reads it.  `w21patterns.py tables` prints the eight.  It is
  // NOT "padding" -- that is a claim nobody has evidence for; it is an unread
  // field.  Kind 38's +$12 is $4A79, the first opcode after the table.
  stride: 0x14,
};

/**
 * THE $40-BYTE BULLET RECORD.  Each offset names the instruction that writes it
 * so the layout can be checked line by line against the listing.
 *
 * WATCH THE SPAWN-INIT OFFSETS.  When a spawn-init runs, **A0 is record base +
 * $10** -- the six-load copy sequence left it there and nothing restores it --
 * so `$2818B4 move.l D3,($18,A0)` writes record +$28, not +$18.  Every one of
 * the nine inits is off by $10 from its instruction text, and getting that
 * wrong writes five parameter fields into the sprite fields.
 */
export const REC = {
  typeWord: 0x00,      // $281568 / $28187A -- $8100|kind, |$200 from core B
  posA: 0x02,          // $28156A move.l D2,(A0)+ -- HIGH word: axis A (vertical)
  posB: 0x04,          //                            LOW  word: axis B (horizontal)
  renderOffs: 0x06,    // $28156C
  descriptor: 0x0a,    // $28156E
  graphic: 0x0e,       // $281570
  speed: 0x1a,         // $28158A move.b D7,($a,A0)   A0 = base+$10
  dir: 0x1b,           // $28158E move.b D1,($b,A0)
  attribute: 0x1c,     // $281572 move.w (A1)+,($c,A0)  A0 = base+$10
  velA: 0x1e,          // $281F02 movem.w D2-D3,($1e,A6) -- RECOMPUTED every frame
  velB: 0x20,
  continuation: 0x22,  // installed by the behaviour, `jmp`ed at $281EBC
  param28: 0x28,       // the spawn-inits' ($18,A0)
  param2a: 0x2a,       //                   ($1a,A0)
  param2c: 0x2c,       //                   ($1c,A0)
  param34: 0x34,       //                   ($24,A0)
  param36: 0x36,       //                   ($26,A0)
  origSpeed: 0x3a,     // $281592 move.b D7,($2a,A0)
  origDir: 0x3b,       // $281596 move.b D1,($2b,A0)
  size: 0x40,
};

/** Type-word bits, from the mover `$281E6C move.w #$5180,D0 / and.w D2,D0`. */
export const TYPEBIT = {
  kindMask: 0x003f,
  path281F3E: 0x0080,  // bit 7 -- set in the templates of kinds 16,17,18,20,21,35
  dispatch: 0x0100,    // bit 8 -- "run the $282030 initialiser"; cleared by it
  coreB: 0x0200,       // bit 9 -- $281876 bset #$9,D7, i.e. "spawned by $2817C2"
  flipFlop: 0x0800,    // bit 11 -- a PRIVATE per-bullet toggle; see below
  kill: 0x1000,        // bit 12 -- $281ED6 btst #$C -> free the slot
  bit14: 0x4000,       // in the $5180 mask; unidentified
  alive: 0x8000,       // $281E54 move.w (A6),D2 / bpl -> skip the slot
  moverMask: 0x5180,   // bits 14,12,8,7 -- the "not a plain move" test
};

// ------------------------------------------------------------ the write log
/**
 * The port writes the bullet record through this so a gate can compare
 * WRITE LOGS with the board instead of final states.
 *
 * WHY.  A test that writes to `base + CONST` and asserts on something read back
 * through the same `CONST` agrees with itself whatever `CONST` holds.  Two of
 * the last three waves on this project shipped exactly that.  A write log is
 * immune: the board says "wrote the word $8104 at $817F8C+$00", the port must
 * say the same, and a wrong offset constant is a different address, visibly.
 */
export class WriteLog {
  constructor(ram) { this.ram = ram; this.writes = []; }
  w8(a, v) { this.writes.push([a, 1, v & 0xff]); this.ram.setU8(a, v); }
  w16(a, v) { this.writes.push([a, 2, v & 0xffff]); this.ram.setU16(a, v); }
  w32(a, v) { this.writes.push([a, 4, v >>> 0]); this.ram.setU32(a, v); }
  /** `add.w Dn,<ea>` -- a 16-bit read-modify-write. */
  add16(a, v) { this.w16(a, u16(this.ram.u16(a) + v)); }
  get key() {
    return this.writes.map(([a, s, v]) =>
      `${a.toString(16)}/${s}/${v.toString(16)}`).join(' ');
  }
}

// ------------------------------------------------------------------ the core

// Fire sites construct compact local contexts throughout the port, but every
// one shares the per-Game Ram. This weak registry carries only an explicitly
// installed host callback across that boundary. Vanilla Games never get an
// entry, and the cartridge core remains unaware of catalogue ids.
const BULLET_SPEED_TRANSFORMS = new WeakMap();
const BULLET_SPAWN_HOOKS = new WeakMap();

export function installBulletSpeedTransform(ram, transform) {
  if (typeof transform !== 'function') {
    throw new TypeError('bullet speed transform must be a function');
  }
  BULLET_SPEED_TRANSFORMS.set(ram, transform);
}

export function installBulletSpawnHook(ram, hook) {
  if (typeof hook !== 'function') {
    throw new TypeError('bullet spawn hook must be a function');
  }
  BULLET_SPAWN_HOOKS.set(ram, hook);
}

/**
 * `$2814B6` (bank A) and `$2817C2` (bank B) -- THE SPAWN CORES.
 *
 * The two are the same routine with three differences, and every one of them is
 * a trap a port can smooth over:
 *   1. bank B sets type-word bit 9 (`$281876 bset #$9,D7`);
 *   2. bank A multiplies the angle by four (`$281586 add.b D1,D1` twice)
 *      because its callers pass 1/64 turn, bank B does not;
 *   3. bank A then DIVIDES IT BACK (`$28159A lsr.b #2,D1`) so a generator can
 *      call the core twice with the same D1 -- and that round trip is LOSSY for
 *      an angle >= $40, which is why it is written as a shift and not undone
 *      arithmetically.  Bank B jumps straight past it (`$2818A8 bra $28159C`).
 *
 * @param ctx  {{ram, rom, log:WriteLog}}
 * @param regs {{d0,d1,d2,d3,d4,d5,a5}} MUTATED: d1 is written back (bank A's
 *             `lsr.b #2` round trip), which is what the ROM does.
 * @param bank 'A' | 'B'
 * @returns {{carry:boolean, slot:number|null, addr:number|null}}
 *          carry = the 68000's C flag on return.  CARRY SET means the pool was
 *          full and THE SHOT WAS SILENTLY DROPPED.  Carry CLEAR means either a
 *          bullet was spawned or the freeze gate declined -- see below.
 */
export function spawnCore(ctx, regs, bank) {
  const { ram } = ctx;
  const entry = bank === 'A' ? BUL.coreA : BUL.coreB;

  // $2814BA..$2814C6: D7 = $8130D4 + $8130D2 + $811F72, added as WORDS.
  const d7gate = u16(ram.u16(BUL.freezeA) + ram.u16(BUL.freezeB)
    + ram.u16(BUL.freezeC));
  if (d7gate !== 0) {                                  // $2814CC bne $28153C
    // $28153C tst.w $811F72 / bpl $28154E -- and note the exit at $28154E
    // returns with CARRY CLEAR (`tst.w` clears C and nothing sets it after),
    // i.e. the freeze path reports SUCCESS to the caller while spawning
    // nothing.  Transcribe it; do not "fix" it into a failure.
    if (i16(ram.u16(BUL.freezeC)) >= 0) {
      return { carry: false, slot: null, addr: null, declined: true };
    }
    // $281544 btst #$0,$811F73 -- bit 0 of the LOW byte of the $811F72 word.
    if ((ram.u8(BUL.freezeC + 1) & 1) === 0) {
      return { carry: false, slot: null, addr: null, declined: true };
    }
    // bne -> $2814CE: spawn anyway.
  }

  // $2814D4..$281502 -- the ACTIVE WINDOW ladder, a cascade of four tests.
  let iters = BUL.windowIters[0];                      // moveq #$D,D7
  for (let i = 0; i < 4; i++) {
    if (ram.u16(BUL.window[i]) === 0) break;
    iters = BUL.windowIters[i + 1];
  }
  // MUTATION `window-constant`: "the pool is 210 slots, so the cap is 210".
  // MEASURED moving 70 -> 160 inside stage 1; the ladder is a progression
  // variable and a constant here silently raises the bullet cap.
  if (ctx.mut === 'window-constant') iters = BUL.windowIters[4];

  // $281506..$28152E -- the free-slot search, FIVE SLOTS PER UNROLLED ITERATION
  // with `dbra D7`, so exactly 5*(D7+1) slots are examined: 70/110/160/190/210.
  // The search always starts at slot 0, so the slot a bullet lands in is a
  // function of the whole pool's history and is observable in draw order and in
  // the bomb's cancel loop.
  const limit = 5 * (iters + 1);
  let slot = -1;
  for (let s = 0; s < limit; s++) {
    if (ram.u16(BUL.pool + s * BUL.stride) === 0) { slot = s; break; }
  }
  if (slot < 0) {
    // $281536 ori #$1,SR -- CARRY SET, and the shot is silently dropped.
    return { carry: true, slot: null, addr: null, declined: false };
  }

  const addr = BUL.pool + slot * BUL.stride;
  const speedTransform = ctx.bulletSpeedTransform ?? BULLET_SPEED_TRANSFORMS.get(ram);
  emitRecord(ctx, regs, bank, addr, entry, speedTransform);
  const spawnHook = ctx.bulletSpawnHook ?? BULLET_SPAWN_HOOKS.get(ram);
  spawnHook?.(ram, { addr, slot, bank });
  return { carry: false, slot, addr, declined: false };
}

/** `$281554`/`$281860` onwards -- the template copy and everything after it. */
function emitRecord(ctx, regs, bank, base, entry, speedTransform = null) {
  const { ram, rom, log } = ctx;
  const mut = ctx.mut ?? null;
  // $281556 andi.w #$3F,D0 -- the LOW WORD only; the high word (the speed bias)
  // is untouched and is read back off the stack four instructions later.
  const kind = regs.d0 & 0x3f;
  const speedBias = (regs.d0 >>> 16) & 0xffff;        // $281578 add.w (A7),D7
  if (kind >= BUL.kinds) {
    // $28155E lea ($281956,PC),A1 / movea.l (A1,D0.w),A1 with no bound at all.
    // On the board this reads the longword AFTER the table ($018100 for kind
    // 39) and copies 20 bytes from wherever that points.  It is not a path the
    // port may guess at.
    unreached(BUL.templatePtrs + 4 * kind,
      `bullet KIND ${kind} was passed to $${entry.toString(16).toUpperCase()}, `
      + `but $281956 has exactly ${BUL.kinds} entries -- proven from both ends `
      + `(entry[39] is $018100, not a pointer, and the template block that the `
      + `39 entries point into ends where code begins at $281CD6). The board `
      + `would index past the table and copy 20 bytes of garbage as a template`);
  }
  const tpl = rom.u32(BUL.templatePtrs + 4 * kind);   // $281564

  // ---- the type word.  Bank B sets bit 9 FIRST, in the register.
  let typeWord = rom.u16(tpl + TPL.typeWord);
  // MUTATION `no-bit9`: forget $281876. Bit 9 is the only thing in the record
  // that says which core spawned the bullet.
  if (bank === 'B' && mut !== 'no-bit9') typeWord |= TYPEBIT.coreB;
  log.w16(base + REC.typeWord, typeWord);             // $281568 / $28187A

  // ---- position, then four template fields copied straight through.
  log.w32(base + REC.posA, regs.d2 >>> 0);            // $28156A move.l D2,(A0)+
  log.w32(base + REC.renderOffs, rom.u32(tpl + TPL.renderOffs));   // $28156C
  log.w32(base + REC.descriptor, rom.u32(tpl + TPL.descriptor));   // $28156E
  log.w16(base + REC.graphic, rom.u16(tpl + TPL.graphic));         // $281570
  // MUTATION `attribute-raw-displacement`: write the attribute at the
  // instruction's literal displacement ($0C) instead of $10+$0C. This is THE
  // mistake the "A0 is base+$10" note exists to prevent, and a gate that reads
  // the record back through its own REC.attribute cannot see it.
  log.w16(base + (mut === 'attribute-raw-displacement' ? 0x0c : REC.attribute),
    rom.u16(tpl + TPL.attribute));                                   // $281572

  // ---- THE SPEED.  base + the call site's bias + TWO GLOBALS.
  // $813160 and $812950 are added to EVERY bullet in the game.  Both MEASURED 0
  // through all of stage 1 -- and `$252C8E` writes $812950 on EVERY frame, so
  // it is a live variable that happens to hold 0, not a constant.  Compiling
  // the 0 in would be wrong the first time the game sets either.
  let d7 = u16(rom.u16(tpl + TPL.baseSpeed));         // $281576 move.w (A1)+,D7
  // MUTATION `bias-from-low-word`: take the bias from D0's LOW word. $281556
  // masked the low word to the kind, so this is the "surely D0 is just the
  // kind" reading -- and it agrees with the ROM at every site whose bias is 0.
  d7 = u16(d7 + (mut === 'bias-from-low-word' ? (regs.d0 & 0xffff) : speedBias));
  // MUTATION `no-global-bias`: both globals MEASURED 0 through all of stage 1,
  // so compiling the 0 in is invisible until the game writes one.
  if (mut !== 'no-global-bias') {
    d7 = u16(d7 + ram.u16(BUL.speedBias1));           // $28157A
    d7 = u16(d7 + ram.u16(BUL.speedBias2));           // $281580
  }
  // Optional policy-neutral host transform. It sees the authentic final byte,
  // cannot mutate caller registers, and affects both the live and original-speed
  // fields together. An absent callback leaves the write log byte-for-byte exact.
  let spawnedSpeed = d7 & 0xff;
  if (speedTransform) {
    const transformed = speedTransform(spawnedSpeed, ram);
    if (Number.isFinite(transformed)) {
      spawnedSpeed = Math.max(0, Math.min(0xff, Math.trunc(transformed)));
    }
  }

  // ---- THE ANGLE.  Bank A's callers pass 1/64 turn; the core scales it.
  // MUTATION `no-angle-scale` / `scale-both-banks`: the bank split, both ways.
  // Confusing the units puts every bank-A bullet at four times its angle.
  const scale = mut === 'no-angle-scale' ? false
    : mut === 'scale-both-banks' ? true : bank === 'A';
  if (scale) {
    regs.d1 = ((regs.d1 & ~0xff) | ((regs.d1 << 2) & 0xff)) >>> 0;  // $281586 x2, BYTE
  }

  log.w8(base + REC.speed, spawnedSpeed);                  // $28158A move.b D7,($a,A0)
  log.w8(base + REC.dir, regs.d1 & 0xff);             // $28158E move.b D1,($b,A0)
  log.w8(base + REC.origSpeed, spawnedSpeed);              // $281592 ($2a,A0)
  log.w8(base + REC.origDir, regs.d1 & 0xff);         // $281596 ($2b,A0)

  // $28159A lsr.b #2,D1 -- bank A only.  See the header: LOSSY above $40.
  if (scale) {
    regs.d1 = ((regs.d1 & ~0xff) | ((regs.d1 & 0xff) >>> 2)) >>> 0;
  }

  // ---- the D3 position DELTA.  `tst.l D3` tests the WHOLE longword, and the
  // two halves land on the two axes with the LOW word going to axis B first.
  if ((regs.d3 | 0) !== 0) {                          // $28159C tst.l D3
    // MUTATION `delta-axes-swapped`: the two halves of D3 on the wrong axes.
    const [lo, hi] = mut === 'delta-axes-swapped'
      ? [REC.posA, REC.posB] : [REC.posB, REC.posA];
    log.add16(base + lo, u16(regs.d3));               // $2815A0 add.w D3,(-$c,A0)
    log.add16(base + hi, u16(regs.d3 >>> 16));        // $2815A6 swap / add.w
  }

  // ---- the SPAWN-INIT, run only if the template's +$10 word is non-zero.
  if (rom.u16(tpl + TPL.runInit) === 0) return;       // $2815AC tst.w (A1) / beq
  const init = rom.u32(BUL.spawnInitPtrs + 4 * kind); // $2815B6 adda.w D0,A1
  // MUTATION `init-raw-displacement`: run the inits with A0 = the record base
  // rather than base+$10, i.e. take every instruction's displacement at face
  // value. Five parameter fields land in the sprite fields.
  runSpawnInit(ctx, regs,
    base - (ctx.mut === 'init-raw-displacement' ? 0x10 : 0), init, kind);
}

/**
 * The NINE spawn-inits, `$2818AC`..`$281954`.
 *
 * A0 IS RECORD BASE + $10 HERE.  Read that sentence twice: the offsets below
 * are the instruction's displacement PLUS $10, every time.
 *
 * `$2818AC` is not a routine at all -- it IS the shared epilogue, byte-identical
 * to the no-init exit `$2815BE`, and 20 of the 39 kinds point at it.
 * `$2818E0` is a byte-for-byte DUPLICATE of `$2818B4` (checked mechanically by
 * `w21patterns.py inits`), not a variant.
 */
function runSpawnInit(ctx, regs, base, init, kind) {
  const { ram, log } = ctx;
  switch (init) {
    case 0x2818ac:                                    // 20 kinds: nothing
      return;
    case 0x2818b4:                                    // kinds 3,4,5,6,35
    case 0x2818e0:                                    // kinds 19,22 (a duplicate)
      log.w32(base + REC.param28, regs.d3);           // move.l D3,($18,A0)
      log.w32(base + REC.param2c, regs.d4);           // move.l D4,($1c,A0)
      log.w8(base + REC.param34, 0);                  // clr.b  ($24,A0)
      return;
    case 0x2818c8:                                    // kind 17
      log.w8(base + REC.param34, regs.d4 & 0xff);     // move.b D4,($24,A0)
      return;
    case 0x2818d4:                                    // kind 18
      log.w16(base + REC.param34, regs.d4);           // move.w D4,($24,A0)
      return;
    case 0x2818f4:                                    // kinds 23,24
      log.w32(base + REC.param28, regs.d3);
      log.w32(base + REC.param2c, regs.d4);
      log.w8(base + REC.param34, 0);
      log.w16(base + REC.param36, regs.d5);           // move.w D5,($26,A0)
      return;
    case 0x28190c:                                    // kinds 27,32,36,37,38
      log.w16(base + REC.param28, ram.u16(BUL.initX));  // move.w $8130D8,($18,A0)
      log.w16(base + REC.param2a, ram.u16(BUL.initY));  // move.w $8130DA,($1a,A0)
      log.w32(base + REC.param2c, regs.d4);
      log.w8(base + REC.param34, 0);
      log.w32(base + REC.param36, regs.d5);           // move.l D5,($26,A0) -- LONG
      return;
    case 0x281930:                                    // kind 28, the tracker
      // move.b ($3,A5),($1a,A0) -- the TARGET-PLAYER INDEX, copied off the
      // firing enemy so the bullet can re-run $242748 for itself later.
      log.w8(base + REC.param2a, ram.u8(regs.a5 + 0x03));
      log.w32(base + REC.param2c, regs.d4);
      return;
    case 0x281942:                                    // kinds 30,31
      log.w32(base + REC.param28, regs.d3);
      log.w32(base + REC.param2c, regs.d4);
      log.w32(base + REC.param34, regs.d5);           // move.l D5,($24,A0) -- LONG
      return;
    default:
      unreached(init, `$2815C6[${kind}] points at $${init.toString(16)
        .toUpperCase()}, which is not one of the nine spawn-inits this wave read `
        + `($2818AC $2818B4 $2818C8 $2818D4 $2818E0 $2818F4 $28190C $281930 `
        + `$281942). Either the export is stale or a tenth exists`);
  }
}

// ------------------------------------------------------------- the generators
//
// Each of these is one entry point, transcribed instruction for instruction.
// The shared BODIES ($28134E, $281366, $2813A6, $2813D4 in bank A; $281668,
// $281680, $2816C0, $2816DE in bank B) are the `bra` targets several entries
// jump into, and they are factored out here exactly as the ROM factors them.

const S = (n) => n * 0x10000;      // a speed bias, as it sits in D0's high word

/** $28134E (bank A) / $281668 (bank B): two bullets, same angle, speed +0/+6. */
function pair06(ctx, regs, bank) {
  const r = [];
  r.push(spawnCore(ctx, regs, bank));
  regs.d0 = (regs.d0 + S(6)) >>> 0;                   // addi.l #$60000,D0
  r.push(spawnCore(ctx, regs, bank));
  return r;
}

/** $281366 / $281680: three bullets, same angle, speed +0/+5/+10. */
function triple05(ctx, regs, bank) {
  const r = [];
  r.push(spawnCore(ctx, regs, bank));
  regs.d0 = (regs.d0 + S(5)) >>> 0;
  r.push(spawnCore(ctx, regs, bank));
  regs.d0 = (regs.d0 + S(5)) >>> 0;
  r.push(spawnCore(ctx, regs, bank));
  return r;
}

/** `subq.b #8,D1` / `addi.b #$10,D1` -- the +-8/256 = +-11.25 degree spread. */
const angMinus8 = (regs) => {
  regs.d1 = ((regs.d1 & ~0xff) | ((regs.d1 - 8) & 0xff)) >>> 0;
};
const angPlus16 = (regs) => {
  regs.d1 = ((regs.d1 & ~0xff) | ((regs.d1 + 0x10) & 0xff)) >>> 0;
};
/** `add.b D1,D1` twice -- bank A's 1/64 -> 1/256 scale, done at the SITE when
 *  the site is about to call the bank-B core itself. */
const scaleAngle = (regs) => {
  regs.d1 = ((regs.d1 & ~0xff) | ((regs.d1 << 2) & 0xff)) >>> 0;
};

/** $2813A6 -- bank A's adaptive/spread3 body: centre at speed +2, then -8, +8.
 *  It scales the angle ITSELF and then calls the BANK B core three times. */
function spread3A(ctx, regs) {
  const r = [];
  scaleAngle(regs);                                   // $2813A6 add.b D1,D1 x2
  regs.d0 = (regs.d0 + S(2)) >>> 0;                   // $2813AA addi.l #$20000
  r.push(spawnCore(ctx, regs, 'B'));                  // $2813B0 jsr $2817C2
  regs.d0 = (regs.d0 - S(2)) >>> 0;                   // $2813B6 subi.l #$20000
  angMinus8(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  angPlus16(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  return r;
}

/** $2813D4 -- bank A's two-way spread: scale, then -8 and +8, bank B core. */
function spread2A(ctx, regs) {
  const r = [];
  scaleAngle(regs);
  angMinus8(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  angPlus16(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  return r;
}

/** $2816C0 -- bank B's spread3: centre, -8, +8, ALL AT THE SAME SPEED.
 *  Note the difference from bank A's $2813A6, which biases the centre by +2.
 *  The two look like the same generator and are not. */
function spread3B(ctx, regs) {
  const r = [];
  r.push(spawnCore(ctx, regs, 'B'));
  angMinus8(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  angPlus16(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  return r;
}

/** $2816DE -- bank B's two-way spread. */
function spread2B(ctx, regs) {
  const r = [];
  angMinus8(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  angPlus16(regs);
  r.push(spawnCore(ctx, regs, 'B'));
  return r;
}

/**
 * $28138A (bank A) / $2816A4 (bank B) -- THE FLAGS-ADAPTIVE GENERATOR, and the
 * single most-used entry in the game ($2817B8 alone has 271 call sites).
 *
 *   swap D1 / move.w #$81,D1 / and.b ($d,A5),D1 / bne  -> the TWO-way body
 *   swap D1 / movea.l ($6,A5),A0 / btst #$1,(A0) / beq -> the TWO-way body
 *                                                 else -> the THREE-way body
 *
 * So the enemy's own flags choose the fan: `($D,A5) & $81` (bits 0 and 7 of a
 * byte in the enemy record) or bit 1 of the first byte of its SUB-record.
 * The `swap D1` pair is there to borrow D1's low word as scratch while keeping
 * the angle safe in the high half -- and the `movea.l ($6,A5),A0` on the taken
 * arm is a DEAD LOAD (the core saves and restores A0 itself).
 */
function adaptive(ctx, regs, bank) {
  const { ram } = ctx;
  const flags = ram.u8(regs.a5 + 0x0d);               // $281394 and.b ($d,A5),D1
  if ((0x81 & flags) !== 0) {                         // $281398 bne
    return bank === 'A' ? pair06(ctx, regs, 'A') : pair06(ctx, regs, 'B');
  }
  const sub = ram.u32(regs.a5 + 0x06);                // $28139C movea.l ($6,A5),A0
  if ((ram.u8(sub) & 0x02) === 0) {                   // $2813A0 btst #$1,(A0)
    return bank === 'A' ? pair06(ctx, regs, 'A') : pair06(ctx, regs, 'B');
  }
  return bank === 'A' ? spread3A(ctx, regs) : spread3B(ctx, regs);
}

/** Is the fan gate open?  `tst.w $813098`. */
// MUTATION `fan-always` / `fan-never`: ignore $813098 in each direction.
const fan = (ctx) => (ctx.mut === 'fan-always' ? true
  : ctx.mut === 'fan-never' ? false
  : ctx.ram.u16(BUL.rank) !== 0);

/**
 * The twelve rank!=0 fan entries wrap their body in
 * `movem.l D0-D1/A0,-(A7)` on entry and `movem.l (A7)+,D0-D1/A0` before the
 * `rts`, so on return D0, D1 and A0 are the CALLER'S ORIGINALS.  The bodies
 * (pair06, spread2A, ...) and `spawnCore` model their own D0/D1 writes
 * faithfully; this restores them afterwards, ONE LEVEL UP, exactly as the
 * cartridge does.  It is invisible to a gate that reconstructs registers per
 * invocation, but it is load-bearing the moment a `dbra` fan that reuses D0/D1
 * is ported -- e.g. `$273B44`'s eight-way ring calling `$2817B8` eight times
 * under rank != 0: each iteration must start from the caller's D0/D1, not the
 * previous bullet's leftover.
 *
 * The twelve: bank A `$281420 $281432 $281442 $281450 $281484 $2814AC`, bank B
 * `$281744 $281754 $281764 $281776 $2817A8 $2817B8` (the pops sit at `$281360
 * $281384 $2813CE $2813EA $28147E $2817A2 ...`).  The four single / inline-bias
 * entries `$281402 $281708 $281726` do NOT wrap -- they restore D0 themselves
 * with an `addi.l`/`subi.l` pair and no `movem`.
 */
const restoreFan = (regs, body) => {
  const d0 = regs.d0, d1 = regs.d1, a0 = regs.a0;        // movem.l D0-D1/A0,-(A7)
  const out = body();
  regs.d0 = d0; regs.d1 = d1;                            // movem.l (A7)+,D0-D1/A0
  if (a0 !== undefined) regs.a0 = a0;                    // (A0 too, when tracked)
  return out;
};

/**
 * THE NINETEEN ENTRY POINTS.  The key is the ROM address a call site `jsr`s.
 *
 * `$281494` is deliberately ABSENT.  20-recon-pattern-tables lists it among
 * "twenty entry points"; it is not one.  It opens `jsr ($2814B6,PC)` and ends
 * `movem.l (A7)+,D0-D1/A0 / rts` -- it POPS THREE LONGWORDS IT NEVER PUSHED, so
 * a `jsr $281494` returns to garbage.  Nothing in the 6 MB image branches to it
 * or calls it.  It is an orphan BODY: the rank!=0 arm of a generator whose head
 * this build does not contain.  Calling it throws, by address.
 */
export const ENTRIES = new Map([
  // ---- bank A: the angle arrives in 1/64 turn -------------------------------
  // $2813F0: `beq $2814B6` and `jmp ($2814B6,PC)` -- BOTH arms are the core.
  // The rank test is dead code in this one.
  [0x2813f0, (ctx, r) => [spawnCore(ctx, r, 'A')]],
  [0x281402, (ctx, r) => {
    if (!fan(ctx)) return [spawnCore(ctx, r, 'A')];   // $281408 beq $2814B6
    r.d0 = (r.d0 + S(4)) >>> 0;                       // $28140C addi.l #$40000
    const out = [spawnCore(ctx, r, 'A')];
    r.d0 = (r.d0 - S(4)) >>> 0;                       // $281418 subi.l #$40000
    return out;
  }],
  [0x281420, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'A')]
    : restoreFan(r, () => pair06(ctx, r, 'A')))],    // $28142E bra $28134E
  [0x281432, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'A')]
    : restoreFan(r, () => triple05(ctx, r, 'A')))],  // $28143E bra $281366
  [0x281442, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'A')]
    : restoreFan(r, () => spread2A(ctx, r)))],       // $28144E bra $2813D4
  [0x281450, (ctx, r) => {
    if (!fan(ctx)) return [spawnCore(ctx, r, 'A')];
    return restoreFan(r, () => {                     // movem D0-D1/A0 .. (A7)+
      r.d0 = (r.d0 + S(4)) >>> 0;                     // $28145C addi.l #$40000
      const out = spread2A(ctx, r);                   // inlined, not a bra
      r.d0 = (r.d0 - S(4)) >>> 0;                     // $281478 subi.l #$40000
      return out;
    });
  }],
  [0x281484, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'A')]
    : restoreFan(r, () => spread3A(ctx, r)))],       // $281490 bra $2813A6
  // $2814AC: `bne $28138A`, so the rank-0 path FALLS THROUGH into the core.
  [0x2814ac, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'A')]
    : restoreFan(r, () => adaptive(ctx, r, 'A')))],
  [0x2814b6, (ctx, r) => [spawnCore(ctx, r, 'A')]],   // the core, called directly
  // ---- bank B: the angle arrives in 1/256 turn -----------------------------
  [0x2816f6, (ctx, r) => [spawnCore(ctx, r, 'B')]],
  [0x281708, (ctx, r) => {
    if (!fan(ctx)) return [spawnCore(ctx, r, 'B')];
    r.d0 = (r.d0 + S(4)) >>> 0;
    const out = [spawnCore(ctx, r, 'B')];
    r.d0 = (r.d0 - S(4)) >>> 0;
    return out;
  }],
  [0x281726, (ctx, r) => {
    if (!fan(ctx)) return [spawnCore(ctx, r, 'B')];
    r.d0 = (r.d0 + S(2)) >>> 0;                       // $281730 addi.l #$20000
    const out = [spawnCore(ctx, r, 'B')];
    r.d0 = (r.d0 - S(2)) >>> 0;
    return out;
  }],
  [0x281744, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'B')]
    : restoreFan(r, () => pair06(ctx, r, 'B')))],
  [0x281754, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'B')]
    : restoreFan(r, () => triple05(ctx, r, 'B')))],
  [0x281764, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'B')]
    : restoreFan(r, () => spread2B(ctx, r)))],
  [0x281776, (ctx, r) => {
    if (!fan(ctx)) return [spawnCore(ctx, r, 'B')];
    return restoreFan(r, () => {                     // movem D0-D1/A0 .. (A7)+
      r.d0 = (r.d0 + S(6)) >>> 0;                     // $281784 addi.l #$60000
      const out = spread2B(ctx, r);
      r.d0 = (r.d0 - S(6)) >>> 0;                     // $28179C subi.l #$60000
      return out;
    });
  }],
  [0x2817a8, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'B')]
    : restoreFan(r, () => spread3B(ctx, r)))],
  [0x2817b8, (ctx, r) => (!fan(ctx) ? [spawnCore(ctx, r, 'B')]
    : restoreFan(r, () => adaptive(ctx, r, 'B')))],
  [0x2817c2, (ctx, r) => [spawnCore(ctx, r, 'B')]],   // the core, 71 direct sites
]);

/**
 * Fire one pattern.  `entry` is the ROM address the call site `jsr`s.
 *
 * @returns {Array} one result per core call, in the ROM's own order -- which is
 *          also the order the bullets take slots, and slot order is observable
 *          (draw order, and the bomb's cancel loop at `$244074`).
 */
export function fire(ctx, entry, regs) {
  const g = ENTRIES.get(entry);
  if (!g) {
    if (entry === 0x281494) {
      unreached(0x281494, `$281494 is NOT a generator entry point. It opens `
        + `\`jsr ($2814B6,PC)\` and ends \`movem.l (A7)+,D0-D1/A0 / rts\`, so it `
        + `pops three longwords it never pushed and a jsr to it returns to `
        + `garbage; nothing in the 6 MB image references it. It is the orphan `
        + `rank!=0 body of a generator this build has no head for`);
    }
    unreached(entry, `no generator entry point at $${entry.toString(16)
      .toUpperCase()}. The nineteen are ${[...ENTRIES.keys()]
      .map((a) => `$${a.toString(16).toUpperCase()}`).join(' ')}`);
  }
  return g(ctx, regs);
}

/**
 * `$28131E` -- the pool clear.  `move.w #$1A49,D0` is 6,730 WORDS = 13,460
 * bytes, which is the 210 x $40 pool (13,440) PLUS TWENTY MORE -- so the clear
 * also zeroes `$81B40C` (the live count) and all four active-window words
 * `$81B414..$81B41A`.  That overshoot is not a mistake in the ROM and it is not
 * one here either: it is where the window ladder is reset to 70 slots.
 */
export function poolClear(ram, ctx = null) {
  ctx?.bulletRetireHook?.(ram, { all: true, reason: 'pool-clear' }, ctx);
  for (let a = BUL.pool; a < BUL.pool + 6730 * 2; a += 2) ram.setU16(a, 0);
}

/** `$281330` -- park every slot's +$02 word at $FFFF, all 210. */
export function poolPark(ram) {
  for (let s = 0; s < BUL.slots; s++) {
    ram.setU16(BUL.pool + s * BUL.stride + REC.posA, 0xffff);
  }
}

/**
 * `$282030[kind]` -- the behaviour INITIALISER's address.  The bodies are NOT
 * ported by this wave (39 routines, ~6.7 KB, `$282104..$283BAF`); this returns
 * the address so a caller can name it, and `runBehaviour` throws by address.
 *
 * THE DISPATCH INDEX IS THE LIVE TYPE WORD, NOT THE SPAWNED KIND
 * (`$281F08 moveq #$3F,D0 / and.w (A6),D0`).  That matters for exactly two
 * kinds: **14 and 15 carry template `$281ABC`, whose type word is `$810A`** --
 * so a bullet spawned as kind 14 IS kind 10 from the instant it exists, and the
 * mover dispatches `$282030[10]`.  Kinds 10, 14 and 15 are the same bullet in
 * every respect (same template, same spawn-init, same behaviour); 14 and 15 are
 * pure spawn-time aliases.  **There are 39 kind indices and 37 distinct
 * bullets.**
 */
export const BLACK_BULLET_BEHAVIOUR_RESOURCES = Object.freeze({
  table: BUL.behaviourPtrs,
  kinds: BUL.kinds,
  entry: BUL.behaviourPtrs,
  supportedKinds: null,
});

/** Edition-bound behaviour-pointer lookup. The pointer remains authentic here. */
export function behaviourForWithResources(rom, typeWord, resources) {
  if (!resources || !Number.isSafeInteger(resources.table)
      || !Number.isSafeInteger(resources.kinds) || resources.kinds <= 0) {
    throw new TypeError('bullet behaviour lookup needs a bounded pointer table');
  }
  const k = typeWord & TYPEBIT.kindMask;
  const supported = resources.supportedKinds;
  if (k >= resources.kinds || (supported != null && !supported.includes(k))) {
    unreached(resources.entry ?? (resources.table + 4 * k), `the mover dispatched type word `
      + `$${typeWord.toString(16).toUpperCase()} -> behaviour[${k}], outside this `
      + 'edition capability');
  }
  return rom.u32(resources.table + 4 * k);
}

export function behaviourFor(rom, typeWord) {
  return behaviourForWithResources(rom, typeWord, BLACK_BULLET_BEHAVIOUR_RESOURCES);
}

export function runBehaviour(rom, typeWord) {
  const a = behaviourFor(rom, typeWord);
  unreached(a, `the behaviour initialiser $282030[${typeWord & 0x3f}] = `
    + `$${a.toString(16).toUpperCase()} is NOT PORTED. Wave 21 ported the `
    + `generators, the two cores, the 39 templates, the nine spawn-inits and `
    + `$284190; the 39 behaviours and their per-bullet continuations `
    + `($282104..$283BAF, ~6.7 KB) are a separate wave. Every one of them `
    + `clears type-word bit 8 and installs a continuation at record +$22`);
}
