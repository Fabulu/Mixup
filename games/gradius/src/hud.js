// THE HUD TICK. ROM: $8898, called from the mode-5 body at $9AC7 -- seven bytes
// above the terrain streamer's own JSR.
//
//   9AC4  20 45 9C  JSR $9C45     the power-up rank $17 (src/powerup.js)
//   9AC7  20 98 88  JSR $8898     <-- THIS FILE
//   9ACA  A5 5B     LDA $5B
//   9ACC  D0 03     BNE $9AD1
//   9ACE  20 83 9D  JSR $9D83     the terrain streamer
//
// ================== WHY THIS IS WORTH A FILE OF ITS OWN ======================
//
// It is not the status bar. It is the THROTTLE. $8898 and $9D83 share one gate
// -- `LDA $0E / CMP #$04 / BCC` -- and $8898 runs first, so on every frame it
// produces anything the streamer is refused. Measured on the cartridge with
// exec hooks on $8898 and $88A4:
//
//   $8898 entered = 390, past both gates = 195   (on $02 even 0, odd 195)
//   builds per played frame = {0: 196, 1: 195}   -- exactly every other frame
//
// and, as an intervention rather than a correlation, forcing the cartridge's
// own $0E to 0 at $9D83 turns that histogram into {0:1, 1:390} -- i.e. into the
// port as it was before this file existed -- while BOTH sides emit the same 140
// blocks in the same order (00-recon-terrain.md 1 and 5, re-run for wave 2:
// hudCalls 390, hudRan 195, even 0, odd 195).
//
// ============================ THE ROTATION ===================================
//
//   8898  A5 0E     LDA $0E
//   889A  C9 04     CMP #$04
//   889C  90 01     BCC $889F
//   889E  60        RTS            <- the queue gate, the streamer's own
//   889F  A5 02     LDA $02
//   88A1  4A        LSR A
//   88A2  90 FA     BCC $889E      <- ODD frames only, and nothing else
//   88A4  E6 48     INC $48
//   88A6  A5 48     LDA $48
//   88A8  29 03     AND #$03       <- a four-phase rotation
//   88AA  20 E4 83  JSR $83E4      -> jt_88AD
//
// jt_88AD has FIVE entries -- [0] $88B6 [1] $88F6 [2] $89E3 [3] $892C
// [4] $A960 -- and `AND #$03` can only select four, so `st_A960` is UNREACHABLE
// from here. Left unported and named rather than silently absent; nobody has
// looked for a second dispatcher that uses the same table with a wider mask.
//
// The table's last entry doubles as code: `$88B5 = 60 A9` is the word $A960 AND
// the `LDA #$1E` that st_88B6 starts with at $88B6. Do not "tidy" the entry
// count.
//
// ========================== WHAT THE PRODUCERS READ ==========================
//
// $18 (player), $20,X (lives), $07E0-$07EA (three BCD scores), $0100 (alive),
// $41/$44/$45/$46 (missile/weapon/options/shield) and $42 (the meter cursor).
// NONE OF THEM IS A SEEDED CONSTANT ANY MORE, and this paragraph has been
// corrected once per wave since wave 2 (rule 6, the note goes with the code):
//
//   $20,X   MOVES since wave 5. $979D DECs it at every death and $84F0 INCs it
//           at every extra life; seven scenarios take it 3 -> 2 in-window.
//   $07E4+  MOVES since wave 6. src/score.js adds $0010 per kill, so the digits
//           st_892C draws below are a value the PORT computed: `autofire-laser`
//           ends its window at $0164 after 18 kills and `autofire-normal` at
//           $0110 after 11, and both are compared byte for byte in $0700-$074F.
//   $41 $42 $44 $45 $46   MOVE since wave 7 (src/powerup.js $894B/$8974). The
//           owned-forms below and $8A30's cursor patch are wired to live state:
//           `capsule-sweep` drives all five inside one 300-frame window and
//           `capsule-pickup` puts a cursor on the bar at f626 and leaves it
//           there, so w_0700-w_074F compares the patched attribute byte.
//
// Every one of them still takes its INITIAL value from the cartridge's own RAM,
// through porttrace.mjs and src/main.js's bootState().

import { u8 } from './state.js';
import { QUEUE_GATE_BYTES, queueByte } from './vram.js';
import { cannedPacket, copyPacket, queueFF } from './hudpackets.js';

// THE FOUR PRODUCERS ARE EXPORTED, and that is the ROM's shape rather than a
// convenience: the stage intro calls three of them at $9C12 and the fourth at
// $9C1E, DIRECTLY, with none of $8898's three gates in front. So `hudTick` is
// one caller of four routines, not a wrapper around them (src/flow.js).

/** jt_88AD's four reachable entries, in order. $88B5's fifth is $A960. */
export const HUD_PHASES = ['$88B6 lives', '$88F6 top score',
                           '$89E3 power bar', '$892C score'];

/**
 * `$8898` -- one HUD tick. Call it at the $9AC7 position, BEFORE the streamer.
 *
 * @param {object} state
 * @param {Uint8Array[]} packets  assets/hud/packets.json streams, by index
 */
export function hudTick(state, packets) {
  if (state.vram.cursor >= QUEUE_GATE_BYTES) return;   // $8898-$889C, then RTS
  if ((state.frame & 1) === 0) return;                 // $889F LDA $02 / LSR / BCC

  state.zp48 = u8(state.zp48 + 1);                     // $88A4 INC $48
  switch (state.zp48 & 3) {                            // $88A8 AND #$03 -> $83E4
    case 0: stLives(state, packets); break;            // $88B6
    case 1: stTopScore(state, packets); break;         // $88F6
    case 2: stPowerBar(state, packets); break;         // $89E3, falling into $8A30
    case 3: stScore(state, packets); break;            // $892C
    // no default: AND #$03 has exactly four outcomes
  }
}

/**
 * `$18`, the current player index, with the range the producers assume made
 * explicit. `$88C1 LDA $20,X` would read `$22` at $18 = 2 -- and `$22,X` is the
 * SAVED lives count the respawn restores from (wave 5), a different byte with a
 * different meaning -- while `$892F ADC $18` would pick a different canned
 * packet altogether. Measured 0 on every frame of all 17 scenarios.
 */
function playerIndex(state) {
  const p = state.zp.player;                     // $18
  if (p !== 0 && p !== 1) {
    throw new Error(`$18 = ${p}: the HUD indexes $20,X, $07E4+4*$18 and the `
                  + `canned-packet table with it; only 0 and 1 are player indices`);
  }
  return p;
}

/**
 * `$88B6` -- the lives counter. Appends canned packet $11 and then PATCHES the
 * bytes it just wrote, in place, by absolute address.
 *
 *   88B6  A9 1E / 88B8  85 9A    STA $9A -- DEAD. $85E8's PLA and $85F3's own
 *                                STA $9A both overwrite it two instructions
 *                                later. Transcribed as a no-op rather than
 *                                dropped, because "why is there a store here"
 *                                is a question the next reader will ask too.
 *   88BA  A9 11 / 88BC  JSR $85E8      packet $11 = 23 A2 00 00 00 00 $FE
 *   88BF  A6 18 / 88C1  B5 20          A := $20,X, the lives for player $18
 *   88C3  10 02 / 88C5  A9 00          negative -> 0
 *   88C7  A2 00                        X := the tens digit
 *   88C9  85 98 / C9 0A / 90 0A / E9 0A / E8 / E0 0A / 90 F3
 *                                      repeated subtract-10, capped at ten
 *   88D6  A2 09 / 8A                   >= 100 lives -> "99"
 *   88D9  A4 0E                        Y := $0E, i.e. one PAST the packet
 *   88DB  09 30                        ORA #$30 -- '0' is tile $30
 *   88DD  E0 00 / D0 04                tens non-zero -> always draw the units
 *   88E1  C9 30 / F0 0B                ZERO LIVES DRAWS NOTHING: the units
 *                                      digit is skipped, leaving the packet's
 *                                      own $00 (a blank tile) on screen
 *   88E5  99 FE 06  STA $06FE,Y        units  -> $0E - 2
 *   88E8  8A / F0 05                   tens zero -> suppressed (no leading 0)
 *   88EB  09 30 / 99 FD 06             tens   -> $0E - 3
 *   88F0  A9 61 / 99 FC 06             the '#' glyph -> $0E - 4, ALWAYS
 *
 * MEASURED, three captures, three different lives values -- which is why this
 * routine's two suppression arms are not decoration:
 *   f400  $20 = 3 -> nametable row 29 = .. 61 00 33 ..   (tens blank, units 3)
 *   f1200 $20 = 1 -> .. 61 00 31 ..
 *   f3500 $20 = 0 -> .. 61 00 00 ..                      (units blank too)
 * and the emitted queue image at f572 was `01 23 A2 00 61 00 33 FF`, 8 bytes.
 */
export function stLives(state, packets) {
  cannedPacket(state, packets, 0x11);            // $88BA/$88BC
  let a = state.lives[playerIndex(state)];       // $88BF LDX $18 / $88C1 LDA $20,X
  if (a & 0x80) a = 0;                           // $88C3 BPL / $88C5 LDA #$00
  let x = 0;                                     // $88C7 LDX #$00
  while (a >= 0x0A) {                            // $88CB CMP #$0A / $88CD BCC
    a -= 0x0A;                                   // $88CF SBC #$0A (carry set by CMP)
    x += 1;                                      // $88D1 INX
    if (x >= 0x0A) { x = 9; a = 9; break; }      // $88D2 CPX #$0A / $88D6 LDX #$09 / TXA
  }
  const y = state.vram.cursor;                   // $88D9 LDY $0E
  const digit = a | 0x30;                        // $88DB ORA #$30
  // $06FC,Y is ABSOLUTE indexed: it does not wrap inside a page, so a cursor
  // below 4 would write into $06xx -- the collision map. Unreachable ($85E8
  // has just appended 8 bytes) and loud rather than silently wrapped.
  if (y < 4) throw new Error('$88E5 STA $06FE,Y with $0E < 4 would write $0600');
  if (x !== 0 || digit !== 0x30) {               // $88DD CPX #$00 / $88E1 CMP #$30
    state.vram.q[y - 2] = digit;                 // $88E5 STA $06FE,Y
    if (x !== 0) state.vram.q[y - 3] = x | 0x30; // $88E9 BEQ / $88EB ORA / $88ED STA
  }
  state.vram.q[y - 4] = 0x61;                    // $88F0 LDA #$61 / $88F2 STA $06FC,Y
}

/**
 * `$8915` -- one BCD byte as two tile bytes, appended at the cursor.
 *
 *   8915  85 98 / 4A x4 / 09 30 / 9D 00 07 / E8    high nibble | $30
 *   8921  A5 98 / 29 0F / 09 30 / 9D 00 07 / E8    low  nibble | $30
 *
 * The ROM keeps the cursor in X across the whole digit loop and stores it once
 * at $8912; queueByte() bumps $0E per byte instead. Equivalent because nothing
 * between $88FB and $8912 reads $0E -- checked, not assumed: the only $0E
 * reader in this file is $88D9 (a different producer) and $8A40 (after its own
 * $85E8 has already updated it).
 */
function bcdDigits(state, v) {
  queueByte(state, ((v >> 4) & 0x0F) | 0x30);    // $8917-$891D
  queueByte(state, (v & 0x0F) | 0x30);           // $8921-$8927
}

/**
 * `$8906` -- the shared tail of st_88F6 and st_892C: a trailing '0' and the
 * packet terminator. Both score displays show one more zero than they store,
 * which is why Gradius's score always ends in 0.
 *
 *   8906  A9 30 / 9D 00 07 / E8 / A9 FF / 9D 00 07 / E8 / 86 0E / 60
 */
function scoreTail(state) {
  queueByte(state, 0x30);                        // $8906 LDA #$30
  queueByte(state, 0xFF);                        // $890C LDA #$FF
}

/**
 * `$88F6` -- the TOP score, from the three BCD bytes at $07E0-$07E2.
 *
 * Packet $12 = `23 B4 64 65 00 $FF` leaves the run OPEN, and the six digits
 * plus $8906's tail close it. MEASURED at f574: 14 bytes,
 * `01 23 B4 64 65 00 30 30 35 30 30 30 30 FF` -- $07E0-$07E2 = 00 50 00, i.e.
 * the 50000 the attract mode leaves on screen.
 */
export function stTopScore(state, packets) {
  cannedPacket(state, packets, 0x12);            // $88F6/$88F8
  for (let y = 2; y >= 0; y--) {                 // $88FB LDY #$02 / $8904 BPL
    bcdDigits(state, state.score[0x00 + y]);     // $88FD LDA $07E0,Y / $8900 JSR $8915
  }
  scoreTail(state);                              // $8949 BMI $8906
}

/**
 * `$892C` -- the current player's score.
 *
 *   892C  A9 13 / 18 / 65 18   the packet index is $13 + $18, so player 2 gets
 *                              packet $14 (`23 A8 32 66 00`) -- a different
 *                              label at the same address
 *   8936  A5 18 / F0 06        and the bytes come from $07E8 for player 2,
 *                              $07E4 for player 1
 *
 * MEASURED at f578: 14 bytes, `01 23 A8 31 66 00 30 30 30 30 30 30 30 FF`.
 */
export function stScore(state, packets) {
  const p = playerIndex(state);                  // $8936 LDA $18
  cannedPacket(state, packets, 0x13 + p);        // $892E CLC / $892F ADC $18
  for (let y = 2; y >= 0; y--) {                 // $8934 LDY #$02 / $8947 BPL
    bcdDigits(state, state.score[(p ? 0x08 : 0x04) + y]);   // $893A / $8940
  }
  scoreTail(state);                              // $8949 BMI $8906
}

/**
 * `$89E3` -- the power-up meter, and then $8A30's cursor, BY FALL-THROUGH.
 *
 * `$8A2D JSR $863D` is the last instruction of $89E3 and `$8A30` is the next
 * byte. loc_8A30 has its own callers ($8971 and $89AC, both in the capsule
 * code) so it looks like a routine; from here it is a continuation. Wave 7
 * needs it as both, which is why meterCursor() is exported: src/powerup.js
 * calls it from $894B's tail and from the SPEED UP arm, and this producer falls
 * into it. MEASURED on the cartridge over a 770-frame window: $8A30 n = 97,
 * $89E3 n = 96 -- the one extra is the pickup's own JMP.
 *
 * ONE OPEN RUN, SIX COPIES. Packet $0F ends in $FF, which leaves the run open,
 * and the five cell packets ($15 $16 $17 $18 $1B) are appended through $85F3
 * DIRECTLY -- no prologue, no mode byte, no address -- so on the wire they are
 * 24 data bytes of a single packet at $2384, closed by $863D's bare $FF. Each
 * cell is swapped for packet $19 when the player already owns it:
 *
 *   $15 MISSILE   owned when $41 != 0            ($89F2-$89F6)
 *   $16 DOUBLE    owned when $44 == 2            ($89FB-$8A03)
 *   $17 LASER     owned when $44 == 1            ($8A08-$8A10)
 *   $18 OPTION    owned when $45 >= 2            ($8A15-$8A1D)
 *   $1B ?/SHIELD  owned when $46 != 0            ($8A22-$8A28)
 *
 * THE EARLY EXIT EMITS ZERO BYTES: `$89E3 LDA $0100 / CMP #$02 / BCS` returns
 * before the prologue, so while the player is dying this phase leaves $0E at 0
 * and the streamer gets the frame. That matters from wave 5 onward.
 *
 * MEASURED at f576: 39 bytes, the six cells then `FF`, then $8A30's own packet
 * $1A -- `01 23 84 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C
 * 1D 62 63 1F FF 01 23 F8 00 00 00 00 00 00 00 FF`.
 */
export function stPowerBar(state, packets) {
  if (state.obj.status[0] >= 2) return;          // $89E3-$89EA, zero bytes
  cannedPacket(state, packets, 0x0F);            // $89EB/$89ED -- opens the run
  copyPacket(state, packets, state.zp.missile !== 0 ? 0x19 : 0x15);   // $89F0-$89F8
  copyPacket(state, packets, state.zp.weapon === 2 ? 0x19 : 0x16);    // $89FB-$8A05
  copyPacket(state, packets, state.zp.weapon === 1 ? 0x19 : 0x17);    // $8A08-$8A12
  copyPacket(state, packets, state.zp.options >= 2 ? 0x19 : 0x18);    // $8A15-$8A1F
  copyPacket(state, packets, state.zp.shield !== 0 ? 0x19 : 0x1B);    // $8A22-$8A2A
  queueFF(state);                                // $8A2D JSR $863D -- closes it
  meterCursor(state, packets);                   // FALL-THROUGH into $8A30
}

/**
 * `$8A30` -- the meter's cursor, as an ATTRIBUTE byte.
 *
 *   8A30  A9 1A / JSR $85E8    packet $1A = `23 F8 00 x7 $FE`: seven attribute
 *                              bytes at $23F8, i.e. attribute row 7, which
 *                              covers tile rows 28-31 in columns 0..27
 *   8A35  A5 42 / F0 12        $42 == 0 -> no cursor at all, RTS
 *   8A39  A9 08 / 38 / E5 42   $98 := 8 - $42
 *   8A40  A5 0E / 38 / E5 98   X  := $0E - $98, counted back from the END of
 *                              the packet just appended -- so the patch lands
 *                              on data byte ($42 - 1) whatever else is queued
 *   8A46  A9 55 / 9D 00 07     $55 = %01010101: palette 1 in all four quadrants
 *
 * $42 is capped at 6 by $894B's wrap, so the cursor walks the six meter cells
 * at tile columns 4-7, 8-11, ... 24-27. IT IS LIVE IN THE ORACLE SINCE WAVE 7
 * and this comment used to say the opposite ("0 on every frame of this corpus
 * ... covered only by tests/hud.test.js"): `capsule-pickup` collects at f626
 * and holds $42 = 1 for the rest of its window, and `capsule-sweep`'s five
 * refusals hold $42 at 2, 3, 4, 5 and 6 for twenty frames each -- five of the
 * six cells, compared through w_0700-w_074F. MEASURED on the cartridge: $8A39
 * and $8A48 ran ONLY on the frames after $42 became non-zero, so the
 * `LDA $42 / BEQ $8A4B` guard is real and an empty meter writes no tile at all.
 */
export function meterCursor(state, packets) {
  cannedPacket(state, packets, 0x1A);            // $8A30/$8A32
  const meter = state.zp.meter;                  // $8A35 LDA $42
  if (meter === 0) return;                       // $8A37 BEQ $8A4B
  const back = u8(8 - meter);                    // $8A39-$8A3E  $98 := 8 - $42
  const x = u8(state.vram.cursor - back);        // $8A40-$8A45  X := $0E - $98
  state.vram.q[x] = 0x55;                        // $8A46 LDA #$55 / $8A48 STA $0700,X
}
