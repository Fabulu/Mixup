// The door/gate sequencer -- $C733/$C734/$C735 -- and the two pools it feeds.
//
// ROM: armed at loc_00_2046 (inside the PUNCH hit test, sub_00_201A), driven
// from the main loop at $05D2 -> sub_01_4BB0, debris pool $C60B (4 x 4 B),
// effect pool $C693 (10 x 6 B, allocator sub_00_0CC2, driver loc_00_1391).
//
// WHAT A DOOR IS. Not an object -- four MAP CELLS. Graphics $3E $3F $40 $41 in
// a 2x2 (TL TR / BL BR) with collision `owningSlot * 32 | $1F` in all four.
// They arrive two ways and behave identically:
//   * baked into the level by the collision LUT, always slot 0 -- 88 cells
//     (22 blocks) on level 13, 48 on level 3, 52 on level 9, 8 on level 12;
//   * stamped at runtime by a landed type-6 block (actors.js, $43D1), whose
//     own slot index goes into the top 3 bits.
//
// PUNCHING one arms the sequencer. It is the ONLY writer of $C733 ($204D) and
// the only way through level 13, whose floors are made of these.
//
// The whole thing is 39 frames and is NOT gated by the lag flag ($C757) --
// sub_01_4BB0 has no $C757 test, unlike the actor and enemy drivers:
//
//   frame 1..4   erase one cell each, in the order 1:$4D00 gives -- BL, TL,
//                BR, TR relative to $C734/$C735.  Each erase also calls
//                sub_01_4BE8, which reads the cell's OWN collision byte and
//                zeroes the 16-byte $C1E8 record named in its top 3 bits.
//   frame 5      spawn four debris pieces into $C60B and play sound $10 --
//                then FALL THROUGH ($4C3F -> $4C41) into the debris loop, so
//                the pieces already move on their spawn frame.
//   frame 6..39  fly the debris along the 35-entry arc at 1:$4D08, one entry
//                per frame, and stop when $C733 would reach $29 ($4CEB).
//
// MEASURED end to end on the cartridge -- scenario l13-door-punch-open, level
// 13 warped to col 4 row 30, punching right at the col 5/6 door in rows 29/30
// (tools/oracle/doortrace.py):
//
//   f14  $C733 2   (5,$1E) erased    eff[0] = 97 06 00 1E 00 02
//                                    bal[0] = 01 06 00 1E 00 00 20 00
//   f15  $C733 3   (5,$1D) erased
//   f16  $C733 4   (6,$1E) erased
//   f17  $C733 5   (6,$1D) erased    -- all four gone, the hole is open
//   f18  $C733 7   debris 05 70 1E 40 | 05 E0 1D 40 | 06 90 1E 40 | 06 20 1D 40
//   f51  $C733 $28 the last arc step
//   f52  $C733 0   debris frozen where it was; the pool is never cleared
//
// The f18 record is the whole spawn arithmetic in one line: piece 0 was
// written at X $0580 / Y $1E80 and had already taken arc entry 0 (x -$10,
// y -$40) before the frame ended.  A port that spawns and defers the first
// step to frame 2 is one entry behind for the rest of the flight.
//
// Note f14 as well: $C733 reads 2 at the END of the frame the punch landed on,
// because the arm at $2046 happens inside the player update ($05BD) and the
// sequencer runs later in the SAME frame ($05D2). Arming and the first erase
// are one frame, not two.
//
// One note on the `$C716` (pause) tests transcribed below, at $4C4E, $4CE2,
// $13AD and $13CC: they are UNREACHABLE on the cartridge. $05B0 tests the same
// byte and jumps past $05BD and $05D2 entirely, and neither sub_01_4BB0 nor
// sub_00_1336 has any other caller. They are kept because they are what the
// routine says, not because a pause can reach them.

import { u8, u16, cellIndex, setMapCell } from './state.js';
import { screenX, screenY, SLOTS as ACTOR_SLOTS, RECORD as ACTOR_RECORD }
  from './actors.js';
import { spawnDrop } from './drops.js';
import { drawMetasprite } from './render/metasprite.js';

/** $C60B, 4 x 4 B {Xhi, Xlo, Yhi, Ylo}. Never cleared, by anything, ever. */
export const DEBRIS_SLOTS = 4;
export const DEBRIS_RECORD = 4;

/** $C693, 10 x 6 B {sprite/counter, Xhi, Xlo, Yhi, Ylo, subtype}. */
export const EFFECT_SLOTS = 10;
export const EFFECT_RECORD = 6;

/** $C733 phases. 1-4 erase, 5 spawns, 6..$28 fly, $29 wraps to 0. */
const PHASE_ERASE_END = 5;      // $4BB3: CP $05 / JR NC
const PHASE_SPAWN_END = 6;      // $4BFB: CP $06 / JR NC
const PHASE_WRAP = 0x29;        // $4CEB: CP $29

/** $4C36 -> $FFD3/$FFD2: the gate-opening crash, id $10 mask $01. */
const SOUND_DOOR = 0x10;
/** $13E6: LD BC,$1701 -- the effect pool's own one-shot, on counter == $17. */
const SOUND_EFFECT_BREAK = 0x17;
const EFFECT_SOUND_AT = 0x17;

/** $13C3: the non-animated effect's fixed sprite, and $13C5/$141C the attr. */
const EFFECT_PLAIN_SPRITE = 0x0F;
const EFFECT_ATTR = 0x10;

/** $4CD1: levels $0C and $0D draw every debris piece with this one id. */
const DEBRIS_SPRITE_LATE = 0x42;

/**
 * ROM: $C733-$C735 plus the two pools. Held together because the sequencer is
 * the only thing that writes the debris pool and, today, the only thing that
 * writes the effect pool -- see UNPORTED_EFFECT_SPAWNS.
 */
export function createDoorState() {
  return {
    active: 0,            // $C733
    col: 0,               // $C734 -- the BOTTOM-LEFT cell of the 2x2
    row: 0,               // $C735
    debris: Array.from({ length: DEBRIS_SLOTS },
                       () => new Uint8Array(DEBRIS_RECORD)),
    effects: Array.from({ length: EFFECT_SLOTS },
                        () => new Uint8Array(EFFECT_RECORD)),
  };
}


/**
 * Was a shim for the days when state.js built `doors` as three loose bytes.
 * state.js calls createDoorState() now, so this is a plain accessor -- kept
 * only because tools/oracle/deathdiff.mjs imports it. Prefer `state.doors`.
 */
export function ensureDoorState(state) {
  return state.doors;
}

/**
 * The $C693 spawners this port does NOT wire yet. Every one of them is a
 * `LD D,id / LD E,sub / CALL sub_00_0CC2`, so adding one is a single line --
 * but each lives in a file this change does not own, and a pool that some
 * callers feed and others do not is worse than one nobody feeds, because a
 * scenario then passes or fails on which spawner it happened to trip.
 *
 *   $271B     a melee hit landing: $10/$01 normally, $97/$04 on a crit
 *
 * NINE entries have come off this list, and the reason is worth keeping: the
 * comment above used to justify the whole thing as "a pool some callers feed
 * and others do not is worse than one nobody feeds". That was true right up to
 * the point where nobody-feeds became measurably wrong -- the $97 spawners
 * carry the debris SPRITE and, because $97's counter is $17, the audible $17
 * cue as well, so an unfed pool is a silent kill and an empty level 12.
 *
 * $1388 (collision.js) and 1:$7922 (effects.js) were already ported and simply
 * never struck off. $14F9 (drops.js), $2D98 (water.js), $2FFA (conveyor.js),
 * 1:$4EA9, 1:$589C, 1:$58AB and 1:$5B81 (enemies.js) landed with this note --
 * the last three because the pool is only ten slots deep and SILENT tenants
 * ($D7 has bit 6 set) still decide who else gets in.
 *
 * $271B is the last one, and it is a different job: the crit arm draws a
 * different sprite ($97/$04 against $10/$01) and no scenario has ever reached
 * a crit, so porting it would be a transcription with no way to check it.
 *
 * Kept as data rather than prose so `grep UNPORTED_EFFECT_SPAWNS` finds it.
 */
export const UNPORTED_EFFECT_SPAWNS = Object.freeze(['00:271B']);

/** A manifest table is never optional. ROM data missing = a loud failure. */
function table(state, name) {
  const t = state.tables?.[name];
  if (!t) throw new Error(`doors.js: manifest table "${name}" is missing`);
  return t;
}

/** ROM: sub_00_0AE1 mailbox -- B is the id, C the mask. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

// ---------------------------------------------------------------------------
// Arming.  ROM: loc_00_2046-$20A4, the tail of the punch hit test.
// ---------------------------------------------------------------------------

/**
 * A punch resolved to a cell whose low 5 bits are $1F. Work out WHICH 2x2 the
 * probe landed in, latch it, and throw off a puff and a heart.
 *
 * The graphic id is what identifies the corner ($205B-$2072), and getting it
 * from the collision byte instead is impossible -- all four cells carry the
 * same collision. $3E is the top-left, so the block's bottom-left is one row
 * down; $3F is the top-right, so one row down and one column back; $40 IS the
 * bottom-left; anything else (i.e. $41, the bottom-right) is one column back.
 * The `else` arm is the ROM's own -- $2064 tests only $3E/$3F/$40 and $2068
 * decrements for everything that falls past.
 *
 * @param probeCol/probeRow  $FFC0/$FFC1, the cell sub_00_20BA actually read
 * @returns false if $C733 was already busy -- and note what that costs: $204A
 *          is a `RET NZ`, so a punch thrown during another door's sequence
 *          gets no recoil either ($20A7 is never reached).
 */
export function armDoor(state, probeCol, probeRow) {
  const d = state.doors;
  if (d.active !== 0) return false;                 // $2046-$204A: RET NZ
  d.active = 1;                                     // $204D

  let col = probeCol;                               // $2050: $FFC0 -> B -> D
  let row = probeRow;                               // $2053: $FFC1 -> C -> E

  const cells = state.level.cells;
  const graphic = cells ? cells[cellIndex(probeCol, probeRow) * 2] : 0;
  if (graphic === 0x3E) row += 1;                   // $205E -> $206B
  else if (graphic === 0x3F) { row += 1; col -= 1; }   // $2062 -> $206E
  else if (graphic !== 0x40) col -= 1;              // $2068 (the $41 corner)

  col = u8(col);                                    // D and E are 8-bit
  row = u8(row);
  d.col = col;                                      // $2074
  d.row = row;                                      // $207F

  // $2077/$2082: BOTH pools are staged at the block's bottom-RIGHT cell --
  // `INC A` on the column, the row untouched, and zero low bytes ($2088).
  // In world terms that is the middle of the 2x2, which is where the puff
  // appears and where the heart falls out.
  const x = u8(col + 1) << 8;
  const y = row << 8;
  spawnEffect(state, x, y, 0x97, 0x02);             // $2095-$2099
  // $209C: $C74D = $FF (no horizontal drift), then DE = $0000 -> a plain
  // pickup heart, the same record shape a dying enemy leaves.
  spawnDrop(state, x, y, 0xFF, 0x00, 0x00);         // $20A1-$20A4
  return true;
}

// ---------------------------------------------------------------------------
// The sequencer.  ROM: $05D2 -> sub_01_4BB0.
// ---------------------------------------------------------------------------

/**
 * ROM: $05D2 `LD A,[$C733] / AND A / CALL NZ,sub_01_4BB0`.
 *
 * Called from the main loop AFTER the enemy driver ($05CF) and before the
 * splash pass ($05EF). Three phases share one entry point, and the middle one
 * FALLS THROUGH into the last: $4C3F ends the spawn block and $4C41 is the
 * next instruction, so the frame that creates the debris also flies it.
 */
export function updateDoors(state, manifest) {
  const d = state.doors;
  if (d.active === 0) return;                       // $05D5

  if (d.active < PHASE_ERASE_END) {                 // $4BB3
    eraseDoorCell(state, d);
    return;                                         // $4BE7
  }
  if (d.active < PHASE_SPAWN_END) spawnDebris(state, d);   // $4BFD, then falls
  flyDebris(state, d, manifest);                    // $4C41 -> loc_01_4C42
}

/**
 * One of the four cells, per frame.  ROM: $4BB7-$4BE7.
 *
 * 1:$4D00 is read low byte FIRST ($4BC0: `LD A,[HL+] / LD B,(HL)`), and the
 * low byte is the ROW delta -- so the pairs are (row, col): (0,0) (-1,0)
 * (0,+1) (-1,+1) = bottom-left, top-left, bottom-right, top-right.
 */
function eraseDoorCell(state, d) {
  const steps = table(state, 'doorSteps');
  const i = (d.active - 1) * 2;                     // $4BB7: DEC A / ADD A,A
  const row = u8(d.row + steps[i]);                 // $4BC8
  const col = u8(d.col + steps[i + 1]);             // $4BC3

  freeOwningActor(state, col, row);                 // $4BD2: sub_01_4BE8
  setMapCell(state, col, row, 0, 0);                // $4BD5-$4BD7
  // $4BD9-$4BE0 additionally queues a 2x2 tilemap write through sub_00_11F1;
  // our renderer derives the background from level.cells, so the map write
  // above IS that update -- the same stance actors.js takes for types 6/9.
  d.active += 1;                                    // $4BE3: INC (HL)
}

/**
 * ROM: sub_01_4BE8. The cell's own collision byte names its owner.
 *
 * bits 7-5 are the $C1E8 slot; `AND $E0 / SRL A` turns slot*32 into slot*16,
 * which is the record's byte offset, and 16 bytes are zeroed. Note the
 * `RET Z`: slot 0 has no bits set, so a slot-0 door -- which is every door
 * baked into a level's collision LUT -- frees NOTHING. Only a runtime block
 * from a type-6 object in slots 1-7 takes its record with it.
 */
function freeOwningActor(state, col, row) {
  const cells = state.level.cells;
  if (!cells) return;
  const idx = cellIndex(col, row) * 2 + 1;
  const owner = (cells[idx] ?? 0) & 0xE0;           // $4BE9
  if (owner === 0) return;                          // $4BEB: RET Z
  const slot = owner >> 5;
  if (slot >= ACTOR_SLOTS) return;
  state.actors[slot].fill(0, 0, ACTOR_RECORD);      // $4BF2-$4BF8
}

/**
 * ROM: loc_01_4BFB-$4C3F. Four pieces, hand-written, no loop.
 *
 * Reading the store order off the listing is the only way to get the low
 * bytes right: the left pair sit at Xlo $80/$F0 and the right pair at $80/$10,
 * which is what makes the two halves fly apart symmetrically about the seam
 * between the block's columns. Y is $80 in all four; the top pair are one row
 * up ($4C1B / $4C30 `DEC A`).
 */
function spawnDebris(state, d) {
  const col = d.col;                                // $4C02: D
  const row = d.row;                                // $4C06: E
  const set = (i, xhi, xlo, yhi, ylo) => {
    const r = d.debris[i];
    r[0] = u8(xhi); r[1] = xlo; r[2] = u8(yhi); r[3] = ylo;
  };
  set(0, col, 0x80, row, 0x80);                     // $4C0C-$4C14
  set(1, col, 0xF0, row - 1, 0x80);                 // $4C15-$4C1E
  set(2, col + 1, 0x80, row, 0x80);                 // $4C1F-$4C28
  set(3, col + 1, 0x10, row - 1, 0x80);             // $4C29-$4C33

  d.active = PHASE_SPAWN_END;                       // $4C34: LD A,$06
  requestSound(state, SOUND_DOOR, 0x01);            // $4C39-$4C3F
}

/**
 * ROM: loc_01_4C42-$4CF3. Move and draw all four pieces, then step $C733.
 *
 * One arc entry per FRAME, not per piece: all four read 1:$4D08 at the same
 * index and move together, pieces 0/1 (the left column) negating the X step.
 * The Y byte is signed and ADDED, so the table's $C0...$00...$7F ramp is a
 * throw upward that turns over and accelerates down to about 8 px a frame.
 *
 * The pieces are never retired. When $C733 wraps to 0 the loop simply stops
 * being called and the four records keep their last position for the rest of
 * the level -- and across a level change, since nothing clears $C60B.
 */
function flyDebris(state, d, manifest) {
  const vel = table(state, 'doorDebrisVel');
  const vi = u8(d.active - 6) * 2;                  // $4C55-$4C61

  for (let i = 0; i < DEBRIS_SLOTS; i++) {
    const r = d.debris[i];

    // $4C4E: pause freezes the physics but NOT the draw.
    if (!state.flow.paused) {
      // $4C64: the first two pieces take the negated step. `CPL / INC A` with
      // the `JR Z` arm means a zero step stays zero rather than becoming -0.
      const dx = i < 2 ? u16(-vel[vi]) : vel[vi];   // $4C68 / $4C72
      const x = u16(((r[0] << 8) | r[1]) + dx);     // $4C77-$4C81
      r[0] = x >> 8; r[1] = x & 0xFF;

      const ys = vel[vi + 1];                       // $4C85: sign-extended
      const dy = (ys & 0x80) ? u16(0xFF00 | ys) : ys;
      const y = u16(((r[2] << 8) | r[3]) + dy);     // $4C91-$4C9B
      r[2] = y >> 8; r[3] = y & 0xFF;
    }

    drawDebris(state, d, r, i, manifest);           // loc_01_4CA0
  }

  if (state.flow.paused) return;                    // $4CE2: RET NZ
  const next = u8(d.active + 1);                    // $4CE7
  d.active = next >= PHASE_WRAP ? 0 : next;         // $4CEB-$4CF0
}

/** ROM: loc_01_4CA0-$4CDA. sub_00_1172 then sub_00_0BC6 with attr 0. */
function drawDebris(state, d, r, piece, manifest) {
  const table1 = manifest?.metasprites?.table1;
  if (!table1) return;

  const wx = (r[0] << 8) | r[1];
  // $1172: `LD A,D / AND $0F` masks the Y HIGH byte to 12 bits before the
  // camera subtraction. X is not masked.
  const wy = ((r[2] << 8) | r[3]) & 0x0FFF;
  const sx = screenX(state, wx);
  const sy = screenY(state, wy);

  const lvl = state.level.number;
  let id;
  if (lvl === 0x03) {                               // $4CB1 -> $4CCC
    id = table(state, 'doorSpritesL3')[piece];      // per PIECE, not animated
  } else if (lvl === 0x0C || lvl === 0x0D) {        // $4CB5/$4CB9 -> $4CD1
    id = DEBRIS_SPRITE_LATE;
  } else {                                          // $4CBD
    // $4CC0: the phase, shared by all four pieces -- two frames per step,
    // eight steps, cycling for as long as the flight lasts.
    id = table(state, 'doorSprites')[(u8(d.active - 6) & 0x0E) >> 1];
  }
  drawMetasprite(state, table1, id, sx - 8, sy - 16, 0);
}

// ---------------------------------------------------------------------------
// The $C693 effect pool.  ROM: allocator sub_00_0CC2, driver loc_00_1391.
//
// Ten 6-byte records {byte0, Xhi, Xlo, Yhi, Ylo, subtype}. byte0 is both the
// liveness flag and the countdown, and its TOP BIT picks which of two entirely
// different behaviours the record gets:
//
//   bit 7 clear ($13AD)  a plain counter drawn with the fixed sprite $0F. It
//                        is decremented without a zero test, so the slot frees
//                        itself on the frame after the counter reaches 0.
//   bit 7 set   ($13CC)  an ANIMATED effect: bits 0-5 count down, bits 6-7 are
//                        preserved across the decrement, the sprite comes from
//                        0:$2807 indexed by the subtype and by
//                        (counter & $18) >> 3, and reaching 0 frees the slot
//                        WITHOUT drawing that frame.
//
// Only byte 0 is ever cleared. MEASURED: after the door's $97 effect expires
// its record still reads `00 06 00 1E 00 02` -- position and subtype intact.
// A port that zeroes the whole record diverges on four bytes for the rest of
// the level with no visible symptom at all.
// ---------------------------------------------------------------------------

/**
 * ROM: sub_00_0CC2. First free slot wins; a full pool drops the request.
 *
 * The original reads the position out of the $C744-$C747 staging bytes and
 * takes the sprite in D and the subtype in E. Passing them as arguments is
 * the same thing without four globals; the staging bytes have no other reader.
 */
export function spawnEffect(state, x, y, sprite, sub) {
  const pool = state.doors.effects;
  for (let i = 0; i < EFFECT_SLOTS; i++) {          // $0CEC: CP $0A
    const r = pool[i];
    if (r[0] !== 0) continue;                       // $0CD1
    r[0] = u8(sprite);                              // $0CD3: D
    r[1] = (x >> 8) & 0xFF;                         // $0CD5: $C744
    r[2] = x & 0xFF;                                // $0CD9: $C745
    r[3] = (y >> 8) & 0xFF;                         // $0CDD: $C746
    r[4] = y & 0xFF;                                // $0CE1: $C747
    r[5] = u8(sub);                                 // $0CE5: E
    return i;
  }
  return -1;                                        // $0CF0: LD A,$01
}

/** ROM: $29A5, inside sub_00_2889 -- 60 bytes, every level load. */
export function clearEffects(state) {
  for (const r of state.doors.effects) r.fill(0);
}

/**
 * ROM: loc_00_1391-$1437, the middle third of sub_00_1336.
 *
 * Runs between the delayed tile restores ($1349) and the ballistic pool
 * ($1444), and -- unlike the ballistics -- it is AHEAD of the $1438 boss gate,
 * so it ticks even while $C750 holds the rest of the chain off.
 *
 * The iteration direction flips with $FFA7, exactly as the enemy loop does:
 * even frames walk slots 0..9, odd frames 9..0. That only matters when the
 * pool is full, since it decides which spawner wins the last free slot -- but
 * it is one instruction and there is no reason to guess.
 */
export function updateEffects(state, manifest) {
  const pool = state.doors.effects;
  // $1391-$1396: $FFA7. state.video.frameParity is the DRAW-side name for the
  // same byte (state.js aliases it onto state.parity); `?? 0` keeps this
  // working against a state object built before that alias existed.
  const descending = (state.video?.frameParity ?? state.parity ?? 0) !== 0;
  let i = descending ? 9 : 0;

  for (;;) {
    tickEffect(state, pool[i], manifest);
    // $1424-$1435
    if (descending) { i -= 1; if (i < 0) return; }
    else { i += 1; if (i >= EFFECT_SLOTS) return; }
  }
}

function tickEffect(state, r, manifest) {
  const b = r[0];
  if (b === 0) return;                              // $13A6: JR Z

  if ((b & 0x80) === 0) {                           // $13A9: BIT 7
    // $13AD: no zero test at all -- 1 decrements to 0 and still draws.
    if (!state.flow.paused) r[0] = u8(b - 1);       // $13B6
    drawEffect(state, r, EFFECT_PLAIN_SPRITE, manifest);   // $13B9-$13C7
    return;
  }

  // $13CC: the animated arm.
  let counter;
  if (state.flow.paused) {
    counter = b & 0x3F;                             // $13D3: frozen, still drawn
  } else {
    let a = b & 0x3F;                               // $13D9
    // $13DC: a one-shot at exactly $17, suppressed once bit 6 is set. The
    // door's $97 effect starts at $17 with bit 6 clear, so the crash plays on
    // its first tick and never again.
    if (a === EFFECT_SOUND_AT && (b & 0x40) === 0) {
      requestSound(state, SOUND_EFFECT_BREAK, 0x01);   // $13E6: BC = $1701
    }
    a = u8(a - 1);                                  // $13EE
    if (a === 0) { r[0] = 0; return; }              // $1423: freed, not drawn
    r[0] = u8((b & 0xC0) | a);                      // $13F1-$13F7
    counter = a;
  }

  // $1405-$141B: the sprite is a function of the subtype AND the counter.
  const sprites = table(state, 'effectSprites')[r[5]];
  if (!sprites) return;
  drawEffect(state, r, sprites[(counter & 0x18) >> 3], manifest);
}

/** ROM: sub_00_1172 + sub_00_0BC6 with A = $10 (the OBP1 attribute). */
function drawEffect(state, r, id, manifest) {
  const table1 = manifest?.metasprites?.table1;
  if (!table1 || id === undefined) return;
  const wx = (r[1] << 8) | r[2];
  const wy = ((r[3] << 8) | r[4]) & 0x0FFF;         // $1173: AND $0F on Y hi
  drawMetasprite(state, table1, id,
                 screenX(state, wx) - 8, screenY(state, wy) - 16, EFFECT_ATTR);
}
