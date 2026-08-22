// THE PLAYER'S SHOT: the spawn ($249BFC / $24A222) and the four handlers the
// stage-1 opening reaches ($253B1E, $253BDA, $253E34, $253EC6).
//
// Wave 5 stopped at `$249BE2`'s two-entry jump table and named everything below
// as the blocked chain.  This file is that chain, translated, with the parts
// that are NOT reachable in a corpus frame left as loud named throws rather
// than as unverified translations -- the wave-6 lesson: a rule no frame can see
// is not verified by a green gate, so it must not be made to look verified.
//
// ---------------------------------------------------------------- THE RECORD
// 36 slots x $30 at $810572 (P1).  $24A222 fills bytes $00..$2B from a 38-byte
// ROM TEMPLATE plus six player fields; $2C..$2F are the per-frame velocity the
// handlers write.  Offsets, with the instruction that writes each:
//
//   +$00 w  TYPE WORD.  Low nibble -> the $253ADE dispatch.  bit 15 = "slot in
//           use": the spawn's free-slot scan is `tst.w (A0) / bpl`, bit 15, and
//           a handler kills its record with `clr.w (A6)`.
//   +$01 b  ...its LOW BYTE, and three separate bits live there:
//             bit 6  set by every handler's first instruction ("I have run")
//             bit 3  set by `ori.w #$8,(A6)` ("I have a velocity")
//             bit 7  set by the COLLISION, $245044 `bset #$7,(-$3,A6)`
//           while +$00 as a BYTE holds bits 8 and 9 of the word, set by
//           `bset #$0,(A6)` / `bset #$1,(A6)` -- BYTE operations on a memory
//           operand, so they touch the HIGH byte, not the low one.  Reading
//           those three as one 16-bit state word is the easiest mistake here.
//   +$02 w  Y, 1/64 px          +$04 w  X, 1/64 px
//   +$06 l  the DRAW OFFSET pair the enqueue adds ($FC00,$FE00 = -16,-8 px)
//   +$0a l  display-list words 2-3, re-pointed each frame from ($1e,A6)
//   +$0e w  display-list word 4
//   +$14 w / +$16 w  the collision box half-extents, read at $245008/$245010
//   +$18 w  what $24504E subtracts the enemy's damage from
//   +$1a b  SPEED INDEX        +$1b b  ANGLE   (both into $241D34)
//   +$1c w  display-list word 5; its LOW byte is the player's ($56,A6)
//   +$1e l  pointer to the animation longs, indexed by ($24,A6)
//   +$24 w  ...that index, stepped -4 per frame and reloaded to 4 on borrow
//   +$26 w  index into $24DDD6 / $24DEB2 / $24FC8E / $25014C
//   +$28 w  the player's formation ($5a,A6)   +$2a w  the player's power ($20,A6)
//   +$2c w / +$2e w  THIS FRAME'S velocity, from $241D34
//
// ------------------------------------------------- WHAT IS *NOT* TRANSLATED
// THE HIT PATH.  `tst.b ($1,A6) / bmi` at $253B66 and $253E52, and the
// `bset #$1,(A6)` blocks at $253BDE / $253ECA, are reachable only after
// $245044 has set bit 7 of the record's low byte -- i.e. after a shot has hit
// an enemy, which needs the enemy port that is still blocked.  They are LOUD
// NAMED THROWS.  The gate installs an execution tap on $245044 and FAILS if it
// fires inside the compared window, so "no shot hit anything" is a measurement
// and not an assumption.

import { P } from './machine.js';
import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueShotSprite, enqueueZoomedRequest } from './spritequeue.js';
import { SHOT } from './weapons.js';
import { drawWord } from './rng.js';
import { spawnSpark } from './spark.js';

/** Record offsets, named once. */
export const S = {
  type: 0x00, lowByte: 0x01, posY: 0x02, posX: 0x04,
  drawOff: 0x06, dlWord23: 0x0a, dlWord4: 0x0e,
  boxY: 0x14, boxX: 0x16, hp: 0x18,
  speedIdx: 0x1a, angle: 0x1b, dlWord5: 0x1c,
  animPtr: 0x1e, anim2: 0x22, animIdx: 0x24, tableIdx: 0x26,
  formation: 0x28, power: 0x2a, velY: 0x2c, velX: 0x2e,
};

/** Player-record fields the spawn reads that wave 4 did not name. */
export const PS = {
  power: 0x20,       // $249C48 / $249CA8 / $24A25E -- 0,2,4,6,8 (an EVEN word)
  animPhase: 0x42,   // $24A238 move.w ($42,A6),D0 -- cycles 8,4,0
  animIdx: 0x44,     // $24A254 -> the shot's ($24,A6)
  powerByte: 0x56,   // $24A24A -> the LOW byte of the shot's ($1c,A6)
  formation: 0x5a,   // $24A25A -> the shot's ($28,A6)
  flags5b: 0x5b,     // $24A262 btst #$2 -> +2 on the stored power
  soundGate: 0x3a,   // $249D04 tst.b / $249D0C move.b #$2 (the player's $24954E
                     // countdown is what makes it a two-frame gate)
};

export const SPAWN = {
  jumpTable: 0x249be2, ship0: 0x249bfc, ship2: 0x249d2c,
  countPtrP1: 0x8127e4,            // $249C02 movea.l $8127E4,A2 -> (A2) = count
  countPtrP2: 0x8127ec,
  primaryOffset: 0x2a0,            // $249C5C lea ($2a0,A0),A0   -> slot 14
  secondaryOffset: 0x2a0 + 0x150,  // $249C60 lea ($150,A0),A4   -> slot 21
  ptrPrimary: 0x2554ea,            // $249C3E
  ptrSecondary: 0x255502,          // $249C88
  ptrTypeB: 0x25551a,              // $249D6C
  gate308c: 0x81308c,              // $249C64 tst.w $81308C  (a FROZEN global)
  fill: 0x24a222,
};

/**
 * THE TEN SLOTS THE PLAYER'S OWN SPAWN CAN REACH, and the measurement that
 * bounds them.  $249C5C starts the primary scan at offset $2A0 = slot 14 and
 * $249C60 the secondary at $2A0+$150 = slot 21.  The scan LENGTH is D7+1 where
 * D7 = the ROM word behind $8127E4, MEASURED = 4 -- and $249C6C would cap it at
 * 3 only if $81308C were zero, which it is NOT: the fly-around run prints
 * `$81308C = $0001`.  So five slots each: 14..18 and 21..25.
 *
 * Slots 19 and 20 sit between the two runs and no spawn site reaches them; the
 * OPTION pods use offset $150 ($24D4A0 `move.w #$150,D0`), i.e. slots 7..11,
 * through $24C096 -- one of the 22 unported subsystem calls in object type 5.
 * That is why the gate compares these ten records and not the whole table.
 */
export const PLAYER_SLOTS = { primary: [14, 18], secondary: [21, 25] };

const CONVERTED_SHOT_SPEED = 0x0400;

/**
 * Allocate one cancel-converted projectile in the cartridge P1 shot pool.
 * It uses a live primary-shot template and the existing shot driver/damage pass,
 * but begins in the already-moving entry so it is not carried by the player.
 */
export function spawnConvertedShot(ram, rom, ctx, y, x) {
  let rec = null;
  for (const [first, last] of [PLAYER_SLOTS.primary, PLAYER_SLOTS.secondary]) {
    for (let slot = first; slot <= last; slot++) {
      const candidate = SHOT.p1Table + slot * SHOT.stride;
      if ((ram.u16(candidate) & 0x8000) === 0) { rec = candidate; break; }
    }
    if (rec != null) break;
  }
  if (rec == null) return null;

  const prec = SHOT.p1Rec;
  const power = u16(ram.u16(prec + PS.power));
  const templateTable = rom.u32(SPAWN.ptrPrimary);
  const template = rom.u32(templateTable + power * 2);
  const phase = ram.u16(prec + PS.animPhase);
  const animIdx = ram.u16(prec + PS.animIdx);
  fillShotRecord(ram, rom, rec, template, prec);
  ram.setU16(prec + PS.animPhase, phase);
  ram.setU16(prec + PS.animIdx, animIdx);

  ram.setU16(rec, (ram.u16(rec) & 0xff00) | 0x0048);
  ram.setU16(rec + S.posY, y);
  ram.setU16(rec + S.posX, x);
  ram.setU16(rec + S.velY, CONVERTED_SHOT_SPEED);
  ram.setU16(rec + S.velX, 0);
  ram.setU16(SHOT.liveCount, u16(ram.u16(SHOT.liveCount) + 1));
  ctx?.shotSpawn?.('converted', rec);
  return rec;
}

/** `subq.w #n` on a word: the 68000 sets carry on an unsigned BORROW.  Written
 *  once because two places get it wrong by testing the sign bit instead. */
function subqBorrow(v, n) { return { v: u16(v - n), borrow: u16(v) < n }; }

/**
 * $24A222 -- the record filler.  A1 walks the ROM template, A0 the record.
 *
 * THE THREE COPIES ARE NOT ALL THE SAME, and that cost a run to find out.
 * $24A222 and $24A27C are byte-for-byte identical (90 bytes, verified against
 * the image).  $24A2D6 -- the one the SECONDARY spawn calls -- shares the first
 * 86 bytes and then, where the other two `rts`, carries four more instructions:
 *
 *   24a32e: subq.w #4,($44,A6)
 *   24a332: bcc $24a33a
 *   24a334: move.w #$4,($44,A6)
 *   24a33a: rts
 *
 * So ($44,A6) cycles 4,0,4,0 once per SECONDARY spawn, and it is the value the
 * NEXT spawn copies into the new record's ($24,A6).  A port that treats the
 * three fillers as one routine leaves ($44,A6) frozen and every shot after the
 * first draws with the wrong animation long.  MEASURED: `p44` was the first
 * column to diverge, at the first spawn, and an objhunt on $81042A named
 * $24A32E/$24A334 as its only per-frame writers.
 *
 * @param tail  `true` for $24A2D6 or $24A33C, the fillers that also cycle
 *              the player's animation index at +$44.
 */
function fillShotRecord(ram, rom, rec, tmpl, prec, tail = false) {
  let a = tmpl;
  const w = () => { const v = rom.u16(a); a += 2; return v; };
  const l = () => { const v = rom.u32(a); a += 4; return v; };

  ram.setU16(rec + 0x00, w());                                      // $24A222
  ram.setU16(rec + 0x02, u16(w() + ram.u16(prec + P.posY)));        // $24A224
  ram.setU16(rec + 0x04, u16(w() + ram.u16(prec + P.posX)));        // $24A22C
  ram.setU32(rec + 0x06, l());                                      // $24A234
  const a2 = l();                                                   // $24A236
  // $24A238 `move.w ($42,A6),D0 / move.l (A2,D0.w),(A0)+` -- the PLAYER's own
  // animation phase decides which of the pod's longs the new shot draws with.
  ram.setU32(rec + 0x0a, rom.u32(a2 + i16(ram.u16(prec + PS.animPhase))));
  ram.setU32(rec + 0x0e, l());                                      // $24A240
  ram.setU32(rec + 0x12, l());                                      // $24A242
  ram.setU32(rec + 0x16, l());                                      // $24A244
  ram.setU16(rec + 0x1a, w());                                      // $24A246
  ram.setU16(rec + 0x1c, w());                                      // $24A248
  ram.setU8(rec + 0x1d, ram.u8(prec + PS.powerByte));               // $24A24A
  ram.setU32(rec + 0x1e, l());                                      // $24A250
  ram.setU16(rec + 0x22, w());                                      // $24A252
  ram.setU16(rec + 0x24, ram.u16(prec + PS.animIdx));               // $24A254
  ram.setU16(rec + 0x26, w());                                      // $24A258
  ram.setU16(rec + 0x28, ram.u16(prec + PS.formation));             // $24A25A
  let pw = u16(ram.u16(prec + PS.power));                           // $24A25E
  if (ram.btst8(prec + PS.flags5b, 2)) pw = u16(pw + 2);            // $24A262
  ram.setU16(rec + 0x2a, pw);                                       // $24A26C

  // $24A26E `subq.w #4,($42,A6) / bcc / move.w #$8,($42,A6)`: 8,4,0,8,...
  const ph = subqBorrow(ram.u16(prec + PS.animPhase), 4);
  ram.setU16(prec + PS.animPhase, ph.borrow ? 8 : ph.v);
  if (tail) {
    // $24A32E, only in $24A2D6: ($44,A6) cycles 4,0,4,0.
    const ix = subqBorrow(ram.u16(prec + PS.animIdx), 4);
    ram.setU16(prec + PS.animIdx, ix.borrow ? 4 : ix.v);
  }
}

function failPlayerShotAllocation(ram, prec) {
  if (u16(ram.u16(prec + PS.power)) === 8) return;
  ram.setU8(prec + 0x2b, 0);
  ram.bclr8(prec + P.state, 3);
}

function postPlayerShotSound(ram, prec, ctx, normalRequest, hyper) {
  if (ram.u8(prec + PS.soundGate) !== 0) return;
  ram.setU8(prec + PS.soundGate, 2);
  ctx?.soundPost?.(hyper ? 0x28c3ee : normalRequest);
}

/**
 * $249BFC -- the ship-0 shot spawn, reached from `$249BE2`'s two-entry jump
 * table at the end of the player's cadence machine.
 */
export function spawnShot(ram, rom, prec, ctx, { player = 0 } = {}) {
  if (player !== 0) {
    unreached(0x249c0e, `the P2 shot spawn ($249C0E lea $810C32,A0 / `
      + `movea.l $8127EC,A2). P2 is ported but no scenario has a second player`);
  }
  const base = SHOT.p1Table;                                        // $249BFC
  const hyper = ram.btst8(prec + P.flags1, 0) === 1;                // $249C1C

  // $249C1A `move.w (A2),D7` -- the scan LENGTH, a ROM word behind a RAM
  // pointer.  $249C24 overrides it with 6 for hyper shots.
  const countPtr = ram.u32(SPAWN.countPtrP1);                       // $249C02
  let d7 = hyper ? 6 : rom.u16(countPtr);                           // $249C24

  const form = u16(ram.u16(prec + PS.formation));                   // $249C28
  if (form !== 2 && form !== 4 && form !== 6) {
    unreached(0x249c2c, `style selector ${form} is outside the cartridge set {2, 4, 6}`);
  }
  let d0 = u16((form - 2) << 2);                                    // $249C2C
  if (hyper) d0 = u16(d0 + 4);                                      // $249C3A
  const d5 = d0;                                                    // $249C3C
  const primary = rom.u32(rom.u32(SPAWN.ptrPrimary + d0)            // $249C3E
    + u16(ram.u16(prec + PS.power)) * 2);                           // $249C48

  // $249CC8: style 4 uses one scan beginning at slot 9 and the tail filler.
  if (form === 4) {
    let a0 = base + 0x1b0;
    d7 = u16(d7 + 2);
    if (ram.u16(SPAWN.gate308c) === 0 && d7 > 4) d7 = 4;
    let found = false;
    for (let i = 0; i <= d7; i++) {
      if ((ram.u16(a0) & 0x8000) === 0) { found = true; break; }
      a0 += SHOT.stride;
    }
    if (!found) {
      failPlayerShotAllocation(ram, prec);                          // $249CEA..$249CFC
      ctx?.shotSpawn?.('single-full', a0);
      return;
    }
    fillShotRecord(ram, rom, a0, primary, prec, true);              // $249D00
    ctx?.shotSpawn?.('single', a0);
    postPlayerShotSound(ram, prec, ctx, 0x28c3ba, hyper);
    return;
  }

  let a0 = base + SPAWN.primaryOffset;                              // $249C5C
  let a4 = base + SPAWN.secondaryOffset;                            // $249C60
  // $249C64 -- $81308C caps the scan at four slots.  A FROZEN global: the port
  // reads the seed's value and never writes it.
  if (ram.u16(SPAWN.gate308c) === 0 && d7 > 3) d7 = 3;              // $249C6C
  const d6 = d7;                                                    // $249C74

  let found = -1;                                                   // $249C76
  for (let i = 0; i <= d7; i++) {
    if ((ram.u16(a0) & 0x8000) === 0) { found = i; break; }
    a0 += SHOT.stride;                                              // $249C7A
  }
  if (found >= 0) {
    fillShotRecord(ram, rom, a0, primary, prec);                    // $249C84
    ctx?.shotSpawn?.('primary', a0);
  }

  // $249C88 -- the SECOND table runs whether or not the first found a slot.
  const secondary = rom.u32(rom.u32(SPAWN.ptrSecondary + d5)        // $249C88
    + u16(ram.u16(prec + PS.power)) * 2);                           // $249C92
  let found2 = -1;                                                  // $249C9C
  for (let i = 0; i <= d6; i++) {
    if ((ram.u16(a4) & 0x8000) === 0) { found2 = i; break; }
    a4 += SHOT.stride;                                              // $249CA0
  }
  if (found2 >= 0) {
    fillShotRecord(ram, rom, a4, secondary, prec, true);            // $249CC2
    ctx?.shotSpawn?.('secondary', a4);
  } else {
    // $249CA8 -- THE FEEDBACK wave 5 named: no free secondary slot clears the
    // cadence counter and bit 3, so the shot table's occupancy is an INPUT to
    // the player record and not merely an effect of it.
    failPlayerShotAllocation(ram, prec);                            // $249CA8..$249CB4
    ctx?.shotSpawn?.('secondary-full', a4);
    if (found < 0) return;                     // $249CB8 tst.w D7 / bmi $249E4E
  }

  postPlayerShotSound(ram, prec, ctx, 0x28c3ba, hyper);             // $249D04..$249D26
}

/** `$249D2C..$249E4C`: the ship-selector-2 player shot spawn. */
export function spawnShotTypeB(ram, rom, prec, ctx, { player = 0 } = {}) {
  if (player !== 0) {
    unreached(0x249d3e, `the Type-B P2 shot spawn ($249D3E lea $810C32,A0 / `
      + `movea.l $8127EC,A2). P2 is ported but no scenario has a second player`);
  }
  const base = SHOT.p1Table;
  const hyper = ram.btst8(prec + P.flags1, 0) === 1;                // $249D4C
  const countPtr = ram.u32(SPAWN.countPtrP1);
  let d7 = hyper ? 6 : rom.u16(countPtr);                           // $249D4A..$249D54
  const form = u16(ram.u16(prec + PS.formation));
  if (form !== 2 && form !== 4 && form !== 6) {
    unreached(0x249d5c, `style selector ${form} is outside the cartridge set {2, 4, 6}`);
  }
  let d0 = u16((form - 2) << 2);                                    // $249D58..$249D60
  if (hyper) d0 = u16(d0 + 4);                                      // $249D62..$249D6A
  const template = rom.u32(rom.u32(SPAWN.ptrTypeB + d0)
    + u16(ram.u16(prec + PS.power)) * 2);                           // $249D6C..$249D7C

  if (form === 4) {
    let rec = base + 0x1b0;                                         // $249DF4
    d7 = u16(d7 + 2);
    if (ram.u16(SPAWN.gate308c) === 0 && d7 > 4) d7 = 4;
    let found = false;
    for (let i = 0; i <= d7; i++) {
      if ((ram.u16(rec) & 0x8000) === 0) { found = true; break; }
      rec += SHOT.stride;
    }
    if (!found) {
      failPlayerShotAllocation(ram, prec);                          // $249E16..$249E26
      ctx?.shotSpawn?.('type-b-single-full', rec);
      return;
    }
    fillShotRecord(ram, rom, rec, template, prec, true);            // $249E28
    ctx?.shotSpawn?.('type-b-single', rec);
    postPlayerShotSound(ram, prec, ctx, 0x28c3d4, hyper);
    return;
  }

  let rec = base + SPAWN.primaryOffset;                             // $249D8A
  d7 = u16(d7 * 2 + 1);                                             // $249D8E/$249D90
  if (ram.u16(SPAWN.gate308c) === 0 && d7 > 7) d7 = 7;
  let first = null;
  for (;;) {
    if ((ram.u16(rec) & 0x8000) === 0) { first = rec; break; }
    if (d7 === 0) break;
    d7 = u16(d7 - 1);                                               // $249DAA dbra
    rec += SHOT.stride;
  }
  if (first === null) {
    failPlayerShotAllocation(ram, prec);                            // $249DAE..$249DC0
    ctx?.shotSpawn?.('type-b-pair-full', rec);
    return;
  }

  rec = first + SHOT.stride;                                        // $249DC4..$249DC6
  let second = null;
  for (;;) {
    if ((ram.u16(rec) & 0x8000) === 0) { second = rec; break; }
    if (d7 === 0) break;
    d7 = u16(d7 - 1);                                               // $249DCE dbra
    rec += SHOT.stride;
  }
  if (second === null) {
    failPlayerShotAllocation(ram, prec);                            // $249DD2..$249DE4
    ctx?.shotSpawn?.('type-b-pair-full', rec);
    return;
  }

  fillShotRecord(ram, rom, second, template, prec);                 // $249DE8
  fillShotRecord(ram, rom, first, template, prec, true);            // $249DEE
  ctx?.shotSpawn?.('type-b-pair', first, second);
  postPlayerShotSound(ram, prec, ctx, 0x28c3d4, hyper);             // $249E2C..$249E4C
}

// ---------------------------------------------------------------- handlers
//
// The four are ONE routine with four entry points: $253BDA and $253EC6 are
// literally instructions inside $253B1E's and $253E34's bodies.  They are
// written that way here too, with the ROM's own labels, so the control flow can
// be checked against `xref.py dasm 253B1E 200` line for line.

// ======================= WAVE 34: THE SHOT HIT PATH ========================
//
// `hitPathThrow` used to live here.  Its message was right about the mechanism
// and wrong, from this wave on, about the conclusion:
//
//     "bit 7 of the record's low byte is set, and the only thing that sets it
//      is $245044 ... The enemy port is still blocked, so this path is
//      deliberately NOT translated."
//
// `$245044` is now `src/damage.js poolDamage`, so the bit arrives and the path
// runs.  It is TWO paths -- `$253BDE` for entries [0]/[8] and `$253ECA` for
// [2]/[10] -- and they are NOT the same routine: the second has no `btst
// #0,(A6)` recoil block, adds its scatter to the POSITION rather than the
// velocity, uses `asr.w #2` where the first uses `asr.w #1`, and does not drift
// on later hits.
//
// THE TWO ARMS OF `bset #$1,(A6)` ARE THE WHOLE STRUCTURE.  The FIRST hit takes
// the long arm -- an effect, a random scatter, a new sprite block -- and every
// hit after it takes the short one, which steps the animation index down by 4
// and despawns the shot when it borrows.  `bset` returns the OLD bit, so `beq`
// is "this is the first hit".

/** `$253C10..$253C94` (entry [0]) and `$253EEE..$253F52` (entry [2]) -- the
 *  FIRST hit.  Everything that differs between the two is a parameter here and
 *  is named at the instruction it comes from. */
function firstHit(ram, rom, rec, ctx, v, prec) {
  // WAVE 53 (E5a) -- THE SHOT'S IMPACT SPARK, PORTED.  This was a counted note
  // from wave 8 to W52 and the note's REASON was right about $289004 and wrong
  // about this routine: `$289F54` is not in pool B at all.  It allocates from
  // POOL E ($81D394/$81D790, 60 slots), whose driver `$28A098` is type-5 call
  // #12 and IS NOW PORTED, in the same commit, in `src/spark.js`.  Allocator
  // and driver together is what stops this being W33's leak; the drain proof is
  // in that file's header and the census is in `53-impl-E5a-spark.md`.
  //
  // A4 is the PLAYER record ($253A86/$253AC6 `lea`), and `$289F82 cmpa.l
  // #$8103E6,A4` is the ONLY thing that picks P1's 30 slots over P2's -- which
  // is why `prec` had to be threaded down here.
  if (ram.u16(0x81308c) !== 0) {                                    // $253C10/$253EEE
    spawnSpark(ram, rom, ctx, rec, prec);           // $253C18 moveq #$14 / $253C1A
  }
  let d0 = ram.u16(rec + S.velY);                                   // $253C20/$253EFE
  let d2 = ram.u16(rec + S.velX);                                   // movem.w $2c(a6),d0/d2
  if (v.recoil) {
    // $253C26..$253C48 -- entry [0] ONLY.  A shot that has already been carried
    // by the ship ((A6) bit 0) is pushed BACK $200 in Y, unless its ($29,A6)
    // bit 2 is set AND its power word is not the $A that bit selects.
    if (ram.btst8(rec + S.type, 0)) {                               // $253C26 btst #0,(A6)
      let push = true;
      if (ram.btst8(rec + 0x29, 2)) {                               // $253C30 btst #2,$29(A6)
        if (0xa !== ram.u16(rec + S.power)) push = false;           // $253C3A/$253C3E
      }
      if (push) {
        ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) - 0x200)); // $253C44
      }
    }
  }
  // $253C4A..$253C5C / $253F04..$253F18 -- TWO draws off the shared $803917
  // counter, one per axis.  The shift is one of the differences between the two
  // paths: `asr.w #1` here, `asr.w #2` at $253F0A/$253F16.
  const j0 = drawWord(ram, rom) >> v.scatterShift;                  // $253C4A/$253C50
  const j2 = drawWord(ram, rom) >> v.scatterShift;                  // $253C54/$253C5A
  if (v.scatterIntoPos) {
    // $253F0C/$253F18: entry [2] adds the jitter STRAIGHT INTO the position and
    // then adds the velocity on top ($253F1C/$253F20).  Entry [0] adds the
    // jitter into the VELOCITY first ($253C52/$253C5C) and moves once.
    ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + j0));
    ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + j2));
  } else {
    d0 = u16(d0 + j0);                                              // $253C52
    d2 = u16(d2 + j2);                                              // $253C5C
  }
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + d0));        // $253C5E/$253F1C
  ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + d2));        // $253C62/$253F20
  // $253C66/$253F24 `asr.w #2` on BOTH halves -- an ARITHMETIC shift, so a
  // negative velocity rounds toward -infinity and not toward zero.
  ram.setU16(rec + S.velY, u16(i16(d0) >> 2));                      // $253C6A movem.w
  ram.setU16(rec + S.velX, u16(i16(d2) >> 2));
  // W53 CORRECTS THIS NOTE'S SUBJECT.  It said "the shot's impact BURST, one of
  // the $28Cxxx effect family" -- and `50-recon` §2.5 measured, and this wave
  // re-read, that `$28C714` is a SOUND REQUEST: `tst.b $81DEB8` (a debounce
  // byte), then `move.w #$24,D0 / #$62,D1 / #$3,D2 / jsr ($28C0AE,PC)`, whose
  // body shares `$28BFEC`'s `add.w $81DEB4,D1` volume clamp with `$28C3BA` --
  // the routine six lines up that this file ALREADY labels the fire SOUND.  The
  // visual impact burst is `$289F54`, which is ported now.  A note that names
  // the wrong subsystem sends the next implementer to the wrong wave, so it is
  // corrected rather than left.
  ctx.soundPost?.(0x28c714);  // WAVE A: SFX id=$24 (debounced), the shot impact SOUND CUE
    // ($253C70/$253F2E jsr $28C714 -> $28C0AE -> $28BFEC volume clamp). NOT a visual.
  // $253C76/$253F34: re-point the whole sprite block out of the table.
  const a0 = rom.u32(v.table + i16(ram.u16(rec + S.tableIdx)));     // $253C7A/$253F38
  ram.setU32(rec + S.drawOff, rom.u32(a0));                         // $253C84/$253F42
  ram.setU16(rec + S.dlWord4, rom.u16(a0 + 4));                     // $253C88/$253F46
  ram.setU32(rec + S.animPtr, rom.u32(a0 + 6));                     // $253C8C/$253F4A
  // $253C90/$253F4E `move.l (A0)+,$22(A6)` is a LONGWORD, so it writes
  // ($22,A6) AND ($24,A6) -- the animation index the very next instruction
  // decrements.  Reading it as a word leaves the index stale.
  ram.setU32(rec + S.anim2, rom.u32(a0 + 10));                      // $253C90/$253F4E
  return laterHit(ram, rom, rec, v);                                // $253C94 bra $253BE4
}

/** `$253BE4..$253C0E` / `$253ED0..$253EEC` -- EVERY hit after the first, and
 *  the tail the first one falls into. */
function laterHit(ram, rom, rec, v) {
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);                // $253BE4/$253ED0
  ram.setU16(rec + S.animIdx, n.v);
  if (n.borrow) { ram.setU16(rec, 0); return; }                     // $253BE8 bcs $253B90
  if (v.moves) {
    // $253BEC..$253BF8 -- entry [0] keeps drifting; entry [2] does NOT (its
    // $253ED8 goes straight to the sprite re-point).
    ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
    ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  }
  const p = ram.u32(rec + S.animPtr);                               // $253BFA/$253ED8
  ram.setU32(rec + S.dlWord23, rom.u32(p + i16(ram.u16(rec + S.animIdx))));
  enqueueShotSprite(ram, rec);                                      // $253C08/$253EE6
}

/** `$253BDE` (entries [0]/[8]) and `$253ECA` ([2]/[10]) -- the fork. */
function hitPath(ram, rom, rec, ctx, site, prec) {
  const v = site === 0x253bde
    ? { table: 0x24deb2, recoil: true, scatterShift: 1, scatterIntoPos: false,
        moves: true }
    : { table: 0x25014c, recoil: false, scatterShift: 2, scatterIntoPos: true,
        moves: false };
  if (ram.bset8(rec + S.type, 1) === 0) {                           // $253BDE/$253ECA
    return firstHit(ram, rom, rec, ctx, v, prec);                   // beq -> $253C10
  }
  return laterHit(ram, rom, rec, v);                                // bne -> $253BE4
}

/** $253B94..$253BD8 -- $253B1E's move / clamp / re-point / enqueue tail. */
function body253B94(ram, rom, rec) {
  ram.setU16(rec + S.posY,                                          // $253B9A
    u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  // $253B9E `cmpi.w #-$8000,($2,A6) / bcc $253B90` -- an UNSIGNED compare, so
  // the shot dies the instant Y's top bit sets.  $253B90 is `clr.w (A6)`.
  if (u16(ram.u16(rec + S.posY)) >= 0x8000) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posX,                                          // $253BA6
    u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  // $253BAA `addi.w #$400,D0 / addi.w #-$4000,D0 / bcs $253B90`: the SECOND
  // add's carry is the test, and it carries exactly when (X + $400) >= $4000.
  if (u16(ram.u16(rec + S.posX) + 0x400) >= 0x4000) {
    ram.setU16(rec, 0); return;
  }
  const p = ram.u32(rec + S.animPtr);                               // $253BB8
  ram.setU32(rec + S.dlWord23, rom.u32(p + i16(ram.u16(rec + S.animIdx))));
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);                // $253BC6
  ram.setU16(rec + S.animIdx, n.borrow ? 4 : n.v);                  // $253BCC
  enqueueShotSprite(ram, rec);                                      // $253BD2
}

/** $253B1E -- dispatch entry [0]. */
export function handler253B1E(ram, rom, rec, ctx, prec, d1) {
  if (ram.bset8(rec + S.lowByte, 6) === 0) {                        // $253B1E
    ram.setU8(rec + S.dlWord5, ram.u8(rec + S.dlWord5) ^ 0x40);     // $253B3A
    return enqueueShotSprite(ram, rec);                             // $253B40
  }
  if (ram.bset8(rec + 0x00, 0) === 0) {                             // $253B26
    // $253B2C `movem.w ($30,A4),D0-D1` -- A4 is the PLAYER record, so a
    // one-frame-old shot is still carried by the ship's own velocity.
    ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(prec + P.velY)));
    ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(prec + P.velX)));
    ram.setU8(rec + S.dlWord5, ram.u8(rec + S.dlWord5) ^ 0x40);     // $253B3A
    return enqueueShotSprite(ram, rec);
  }
  // $253B4A
  ram.setU16(rec, u16(ram.u16(rec) | 0x8));                         // ori.w #$8
  const v = ctx.tables.shotVector(ram.u8(rec + S.speedIdx),         // $253B5A
    ram.u8(rec + S.angle));
  ram.setU16(rec + S.velY, u16(v.dy));                              // $253B60
  ram.setU16(rec + S.velX, u16(v.dx));
  if (ram.u8(rec + S.lowByte) & 0x80) return hitPath(ram, rom, rec, ctx, 0x253bde, prec); // $253B66
  const a0 = rom.u32(0x24ddd6 + i16(ram.u16(rec + S.tableIdx)));    // $253B72
  ram.setU32(rec + S.drawOff, rom.u32(a0));                         // $253B7C
  ram.setU16(rec + S.dlWord4, rom.u16(a0 + 4));                     // $253B80
  ram.setU16(rec + S.posY,                                          // $253B84
    u16(ram.u16(rec + S.posY) + rom.u16(a0 + 6)));
  ram.bclr8(rec + 0x00, 0);                                         // $253B8A
  body253B94(ram, rom, rec);                                        // $253B8E
}

/** $253BDA -- dispatch entry [8]: `tst.b D1 / bpl $253B94`. */
export function handler253BDA(ram, rom, rec, ctx, prec, d1) {
  if ((d1 & 0x80) === 0) return body253B94(ram, rom, rec);
  return hitPath(ram, rom, rec, ctx, 0x253bde, prec);
}

/** $253E96..$253EC4 -- $253E34's OWN tail.  Not $253B94's: it clamps Y against
 *  $7800 rather than $8000 and it never re-points ($a,A6). */
function body253E96(ram, rec) {
  ram.bset8(rec + 0x00, 0);                                         // $253E96
  ram.setU16(rec + S.posY,                                          // $253EA0
    u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  if (u16(ram.u16(rec + S.posY)) >= 0x7800) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posX,                                          // $253EAC
    u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  if (u16(ram.u16(rec + S.posX) + 0x400) >= 0x4000) {               // $253EB0
    ram.setU16(rec, 0); return;
  }
  enqueueShotSprite(ram, rec);                                      // $253EBE
}

/** $253E34 -- dispatch entry [2]. */
export function handler253E34(ram, rom, rec, ctx, prec, d1) {
  if (ram.bset8(rec + S.lowByte, 6) === 0) {                        // $253E34
    return enqueueShotSprite(ram, rec);                             // $253E42
  }
  ram.bset8(rec + 0x00, 0);                                         // $253E3C
  ram.setU16(rec, u16(ram.u16(rec) | 0x8));                         // $253E4C
  if (d1 & 0x80) return hitPath(ram, rom, rec, ctx, 0x253eca, prec);      // $253E50
  const a0 = rom.u32(0x24fc8e + i16(ram.u16(rec + S.tableIdx)));    // $253E5A
  ram.setU32(rec + S.drawOff, rom.u32(a0));                         // $253E64
  ram.setU16(rec + S.dlWord4, rom.u16(a0 + 4));                     // $253E68
  const v = ctx.tables.shotVector(ram.u8(rec + S.speedIdx),         // $253E78
    ram.u8(rec + S.angle));
  ram.setU16(rec + S.velY, u16(v.dy));                              // $253E7E
  ram.setU16(rec + S.velX, u16(v.dx));
  ram.setU32(rec + S.dlWord23, rom.u32(ram.u32(rec + S.animPtr)));  // $253E84
  ram.bclr8(rec + 0x00, 0);                                         // $253E8C
  body253E96(ram, rec);                                             // $253E90
}

/** $253EC6 -- dispatch entry [10]: `tst.b D1 / bpl $253E96`. */
export function handler253EC6(ram, rom, rec, ctx, prec, d1) {
  if ((d1 & 0x80) === 0) return body253E96(ram, rec);
  return hitPath(ram, rom, rec, ctx, 0x253eca, prec);
}

/** `$253D0C..$253D50`, the moving tail shared by entries 1 and 9. */
function typeBPlayerNormal(ram, rom, rec) {
  ram.setU16(rec + S.posY,
    u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  if (ram.u16(rec + S.posY) >= 0x7800) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posX,
    u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  if (u16(ram.u16(rec + S.posX) + 0x0800) >= 0x4800) {
    ram.setU16(rec, 0);
    return;
  }
  const anim = ram.u32(rec + S.animPtr);
  ram.setU32(rec + S.dlWord23, rom.u32(anim + i16(ram.u16(rec + S.animIdx))));
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);
  ram.setU16(rec + S.animIdx, n.borrow ? 4 : n.v);
  enqueueShotSprite(ram, rec);
}

/** `$253D82..$253D90`: power words 0,2,...,10 index the six cartridge
 *  longwords exported through MoveTables from the bounded $253A58 window. */
function typeBHitFlags(rec, ram, tables) {
  return tables.typeBHitFlags(ram.u16(rec + S.power));
}

/** `$253D5C..$253D98`, including the shot-only `$23F42E` zoom enqueue. */
function typeBPlayerLaterHit(ram, rom, rec, ctx) {
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);
  ram.setU16(rec + S.animIdx, n.v);
  if (n.borrow) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posY,
    u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  ram.setU16(rec + S.posX,
    u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  const anim = ram.u32(rec + S.animPtr);
  ram.setU32(rec + S.dlWord23, rom.u32(anim + i16(ram.u16(rec + S.animIdx))));
  enqueueZoomedRequest(ram, rec, typeBHitFlags(rec, ram, ctx.tables), 14);
}

/** `$253DAC..$253E30`, the first hit for Type-B player shots. */
function typeBPlayerFirstHit(ram, rom, rec, ctx, prec) {
  if (ram.u16(SPAWN.gate308c) !== 0) spawnSpark(ram, rom, ctx, rec, prec);
  let vy = ram.u16(rec + S.velY);
  let vx = ram.u16(rec + S.velX);
  if (ram.btst8(rec + S.type, 0)
      && (!ram.btst8(rec + 0x29, 2) || ram.u16(rec + S.power) === 0x0a)) {
    ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + 0x0300));
  }
  vy = u16(vy + (drawWord(ram, rom) >> 1));
  vx = u16(vx + (drawWord(ram, rom) >> 1));
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + vy));
  ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + vx));
  ram.setU16(rec + S.velY, u16(i16(vy) >> 2));
  ram.setU16(rec + S.velX, u16(i16(vx) >> 2));
  ctx.soundPost?.(0x28c714);
  let a0 = rom.u32(0x24e5ee + i16(ram.u16(rec + S.tableIdx)));
  ram.setU32(rec + S.drawOff, rom.u32(a0)); a0 += 4;
  ram.setU16(rec + S.dlWord4, rom.u16(a0)); a0 += 2;
  ram.setU32(rec + S.animPtr, rom.u32(a0)); a0 += 4;
  ram.setU32(rec + S.anim2, rom.u32(a0));
  typeBPlayerLaterHit(ram, rom, rec, ctx);
}

function typeBPlayerHit(ram, rom, rec, ctx, prec) {
  if (ram.bset8(rec + S.type, 1) === 0) {
    typeBPlayerFirstHit(ram, rom, rec, ctx, prec);
    return;
  }
  typeBPlayerLaterHit(ram, rom, rec, ctx);
}

/** `$253C98`, dispatch entry 1 for normal Type-B player shots. */
export function handler253C98(ram, rom, rec, ctx, prec, d1) {
  if (ram.bset8(rec + S.lowByte, 6) === 0) {
    ram.setU8(rec + S.dlWord5, ram.u8(rec + S.dlWord5) ^ 0x40);
    enqueueShotSprite(ram, rec);
    return;
  }
  if (ram.bset8(rec + S.type, 0) === 0) {
    ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(prec + P.velY)));
    ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(prec + P.velX)));
    ram.setU8(rec + S.dlWord5, ram.u8(rec + S.dlWord5) ^ 0x40);
    enqueueShotSprite(ram, rec);
    return;
  }
  ram.setU16(rec, u16(ram.u16(rec) | 0x0008));
  if (d1 & 0x80) { typeBPlayerHit(ram, rom, rec, ctx, prec); return; }
  let a0 = rom.u32(0x24e512 + i16(ram.u16(rec + S.tableIdx)));
  ram.setU32(rec + S.drawOff, rom.u32(a0)); a0 += 4;
  ram.setU16(rec + S.dlWord4, rom.u16(a0)); a0 += 2;
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + rom.u16(a0)));
  const v = ctx.tables.shotVector(ram.u8(rec + S.speedIdx), ram.u8(rec + S.angle));
  ram.setU16(rec + S.velY, u16(v.dy));
  ram.setU16(rec + S.velX, u16(v.dx));
  ram.bclr8(rec + S.type, 0);
  typeBPlayerNormal(ram, rom, rec);
}

/** `$253D52`, dispatch entry 9 for moving Type-B player shots. */
export function handler253D52(ram, rom, rec, ctx, prec, d1) {
  if ((d1 & 0x80) === 0) typeBPlayerNormal(ram, rom, rec);
  else typeBPlayerHit(ram, rom, rec, ctx, prec);
}

/** `$253FB8..$253FE6`, the moving tail shared by entries 3 and 11. */
function typeBOptionNormal(ram, rec) {
  ram.bset8(rec + S.type, 0);
  ram.setU16(rec + S.posY,
    u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  if (ram.u16(rec + S.posY) >= 0x7400) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posX,
    u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  if (u16(ram.u16(rec + S.posX) + 0x0600) >= 0x4400) {
    ram.setU16(rec, 0);
    return;
  }
  enqueueShotSprite(ram, rec);
}

const TYPE_B_OPTION_HIT = Object.freeze({
  table: 0x250dea,
  recoil: false,
  scatterShift: 2,
  scatterIntoPos: true,
  moves: false,
});

function typeBOptionHit(ram, rom, rec, ctx, prec) {
  if (ram.bset8(rec + S.type, 1) === 0) {
    firstHit(ram, rom, rec, ctx, TYPE_B_OPTION_HIT, prec);
    return;
  }
  laterHit(ram, rom, rec, TYPE_B_OPTION_HIT);
}

/** `$253F56`, dispatch entry 3 for normal Type-B option shots. */
export function handler253F56(ram, rom, rec, ctx, prec, d1) {
  if (ram.bset8(rec + S.lowByte, 6) === 0) {
    enqueueShotSprite(ram, rec);
    return;
  }
  ram.bset8(rec + S.type, 0);
  ram.setU16(rec, u16(ram.u16(rec) | 0x0008));
  if (d1 & 0x80) { typeBOptionHit(ram, rom, rec, ctx, prec); return; }
  let a0 = rom.u32(0x25092c + i16(ram.u16(rec + S.tableIdx)));
  ram.setU32(rec + S.drawOff, rom.u32(a0)); a0 += 4;
  ram.setU16(rec + S.dlWord4, rom.u16(a0));
  const v = ctx.tables.shotVector(ram.u8(rec + S.speedIdx), ram.u8(rec + S.angle));
  ram.setU16(rec + S.velY, u16(v.dy));
  ram.setU16(rec + S.velX, u16(v.dx));
  const anim = ram.u32(rec + S.animPtr);
  ram.setU32(rec + S.dlWord23, rom.u32(anim));
  ram.bclr8(rec + S.type, 0);
  typeBOptionNormal(ram, rec);
}

/** `$253FE8`, dispatch entry 11 for moving Type-B option shots. */
export function handler253FE8(ram, rom, rec, ctx, prec, d1) {
  if ((d1 & 0x80) === 0) typeBOptionNormal(ram, rec);
  else typeBOptionHit(ram, rom, rec, ctx, prec);
}

const HYPER_SHOT = Object.freeze({
  p1: Object.freeze({ normal: 0x24ec72, hit: 0x24ed4e }),
  p2: Object.freeze({ normal: 0x24f3d2, hit: 0x24f4ae }),
  pod0: Object.freeze({ normal: 0x251526, hit: 0x2519e0 }),
  pod1: Object.freeze({ normal: 0x25211c, hit: 0x2525d6 }),
});

/** `$2540EC/$254230`, shared by hyper-shot entries 4/12 and 5/13. */
function hyperShotNormal(ram, rom, rec) {
  ram.bset8(rec + S.type, 0);
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  if (ram.u16(rec + S.posY) >= 0x8000) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  if (u16(ram.u16(rec + S.posX) + 0x0c00) >= 0x5000) {
    ram.setU16(rec, 0);
    return;
  }
  const anim = ram.u32(rec + S.animPtr);
  ram.setU32(rec + S.dlWord23, rom.u32(anim + i16(ram.u16(rec + S.animIdx))));
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);
  ram.setU16(rec + S.animIdx, n.borrow ? 4 : n.v);
  enqueueShotSprite(ram, rec);
}

function hyperShotLaterHit(ram, rom, rec) {
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);
  ram.setU16(rec + S.animIdx, n.v);
  if (n.borrow) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  const anim = ram.u32(rec + S.animPtr);
  ram.setU32(rec + S.dlWord23, rom.u32(anim + i16(ram.u16(rec + S.animIdx))));
  enqueueShotSprite(ram, rec);
}

/** `$25413A/$25427E`, including the first-hit spark and velocity quarter. */
function hyperShotHit(ram, rom, rec, ctx, prec, tables) {
  if (ram.bset8(rec + S.type, 1) !== 0) {
    hyperShotLaterHit(ram, rom, rec);
    return;
  }
  if (ram.u16(SPAWN.gate308c) !== 0) spawnSpark(ram, rom, ctx, rec, prec);
  const vy = ram.u16(rec + S.velY);
  const vx = ram.u16(rec + S.velX);
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + vy));
  ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + vx));
  ram.setU16(rec + S.velY, u16(i16(vy) >> 2));
  ram.setU16(rec + S.velX, u16(i16(vx) >> 2));
  ctx.soundPost?.(0x28c714);
  let a0 = rom.u32(tables.hit + i16(ram.u16(rec + S.tableIdx)));
  ram.setU32(rec + S.drawOff, rom.u32(a0)); a0 += 4;
  ram.setU16(rec + S.dlWord4, rom.u16(a0)); a0 += 2;
  ram.setU32(rec + S.animPtr, rom.u32(a0)); a0 += 4;
  ram.setU32(rec + S.anim2, rom.u32(a0));
  hyperShotLaterHit(ram, rom, rec);
}

function hyperShotBase(ram, rom, rec, ctx, prec, d1, tables) {
  if (ram.bset8(rec + S.lowByte, 6) === 0) {
    ram.setU8(rec + S.dlWord5, ram.u8(rec + S.dlWord5) ^ 0x40);
    enqueueShotSprite(ram, rec);
    return;
  }
  if (ram.bset8(rec + S.type, 0) === 0) {
    ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(prec + P.velY)));
    ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(prec + P.velX)));
    ram.setU8(rec + S.dlWord5, ram.u8(rec + S.dlWord5) ^ 0x40);
    enqueueShotSprite(ram, rec);
    return;
  }
  ram.setU16(rec, u16(ram.u16(rec) | 0x0008));
  if (d1 & 0x80) { hyperShotHit(ram, rom, rec, ctx, prec, tables); return; }
  let a0 = rom.u32(tables.normal + i16(ram.u16(rec + S.tableIdx)));
  ram.setU32(rec + S.drawOff, rom.u32(a0)); a0 += 4;
  ram.setU16(rec + S.dlWord4, rom.u16(a0)); a0 += 2;
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + rom.u16(a0)));
  const v = ctx.tables.shotVector(ram.u8(rec + S.speedIdx), ram.u8(rec + S.angle));
  ram.setU16(rec + S.velY, u16(v.dy));
  ram.setU16(rec + S.velX, u16(v.dx));
  ram.bclr8(rec + S.type, 0);
  hyperShotNormal(ram, rom, rec);
}

export function handler254078(ram, rom, rec, ctx, prec, d1) {
  hyperShotBase(ram, rom, rec, ctx, prec, d1, HYPER_SHOT.p1);
}
export function handler254136(ram, rom, rec, ctx, prec, d1) {
  if (d1 & 0x80) hyperShotHit(ram, rom, rec, ctx, prec, HYPER_SHOT.p1);
  else hyperShotNormal(ram, rom, rec);
}
export function handler2541BC(ram, rom, rec, ctx, prec, d1) {
  hyperShotBase(ram, rom, rec, ctx, prec, d1, HYPER_SHOT.p2);
}
export function handler25427A(ram, rom, rec, ctx, prec, d1) {
  if (d1 & 0x80) hyperShotHit(ram, rom, rec, ctx, prec, HYPER_SHOT.p2);
  else hyperShotNormal(ram, rom, rec);
}

function optionHyperNormal(ram, rom, rec) {
  ram.bset8(rec + S.type, 0);                                      // $25435A/$254484
  ram.setU16(rec + S.posY, u16(ram.u16(rec + S.posY) + ram.u16(rec + S.velY)));
  if (ram.u16(rec + S.posY) >= 0x7800) { ram.setU16(rec, 0); return; }
  ram.setU16(rec + S.posX, u16(ram.u16(rec + S.posX) + ram.u16(rec + S.velX)));
  if (u16(ram.u16(rec + S.posX) + 0x0a00) >= 0x4c00) {
    ram.setU16(rec, 0);
    return;
  }
  const anim = ram.u32(rec + S.animPtr);
  ram.setU32(rec + S.dlWord23, rom.u32(anim + i16(ram.u16(rec + S.animIdx))));
  const n = subqBorrow(ram.u16(rec + S.animIdx), 4);
  ram.setU16(rec + S.animIdx, n.borrow ? 8 : n.v);
  enqueueShotSprite(ram, rec);
}

function optionHyperBase(ram, rom, rec, ctx, prec, d1, tables) {
  if (ram.bset8(rec + S.lowByte, 6) === 0) {
    enqueueShotSprite(ram, rec);                                    // $25430E/$254438
    return;
  }
  ram.bset8(rec + S.type, 0);
  ram.setU16(rec, u16(ram.u16(rec) | 0x0008));
  if (d1 & 0x80) { hyperShotHit(ram, rom, rec, ctx, prec, tables); return; }
  let a0 = rom.u32(tables.normal + i16(ram.u16(rec + S.tableIdx)));
  ram.setU32(rec + S.drawOff, rom.u32(a0)); a0 += 4;
  ram.setU16(rec + S.dlWord4, rom.u16(a0));
  const v = ctx.tables.shotVector(ram.u8(rec + S.speedIdx), ram.u8(rec + S.angle));
  ram.setU16(rec + S.velY, u16(v.dy));
  ram.setU16(rec + S.velX, u16(v.dx));
  ram.bclr8(rec + S.type, 0);
  optionHyperNormal(ram, rom, rec);
}

export function handler254300(ram, rom, rec, ctx, prec, d1) {
  optionHyperBase(ram, rom, rec, ctx, prec, d1, HYPER_SHOT.pod0);
}
export function handler2543A4(ram, rom, rec, ctx, prec, d1) {
  if (d1 & 0x80) hyperShotHit(ram, rom, rec, ctx, prec, HYPER_SHOT.pod0);
  else optionHyperNormal(ram, rom, rec);
}
export function handler25442A(ram, rom, rec, ctx, prec, d1) {
  optionHyperBase(ram, rom, rec, ctx, prec, d1, HYPER_SHOT.pod1);
}
export function handler2544CE(ram, rom, rec, ctx, prec, d1) {
  if (d1 & 0x80) hyperShotHit(ram, rom, rec, ctx, prec, HYPER_SHOT.pod1);
  else optionHyperNormal(ram, rom, rec);
}

/** The dispatch map the shot driver is given, keyed by ROM address. */
export function shotHandlers() {
  return new Map([
    [0x253b1e, handler253B1E],
    [0x253bda, handler253BDA],
    [0x253c98, handler253C98],
    [0x253d52, handler253D52],
    [0x253e34, handler253E34],
    [0x253ec6, handler253EC6],
    [0x253f56, handler253F56],
    [0x253fe8, handler253FE8],
    [0x254078, handler254078],
    [0x254136, handler254136],
    [0x2541bc, handler2541BC],
    [0x25427a, handler25427A],
    [0x254300, handler254300],
    [0x2543a4, handler2543A4],
    [0x25442a, handler25442A],
    [0x2544ce, handler2544CE],
  ]);
}
