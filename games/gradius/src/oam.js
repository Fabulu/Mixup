// The shadow-OAM display list. ROM: `sub_8B10` ($8B10-$8BAA), called from the
// NMI at **$80A7**, plus the metasprite expander `sub_8AAC` ($8AAC-$8B07) and
// the blank pass `sub_8BAB` at $80AD.
//
// WHERE THIS SITS IN THE FRAME MATTERS, and it is not where NOTES-render.md 10
// assumed. $8B10's only xref is $80A7, which runs BEFORE the state machine at
// $80AA -- so the display list for a frame is built from the positions as they
// stood at the END OF THE PREVIOUS frame, and it is then DMA'd at $8087 of the
// frame after that. The picture is therefore TWO frames behind the update, not
// one. Both halves of that are in the measured execution-order table of
// NOTES-player.md 10: `$8B10` at +3327 cycles, `$80AA` at +5502, `$8087` at
// +1170 of the next frame. This port keeps the two-frame chain rather than
// quietly collapsing it, because collapsing it is exactly the kind of "almost
// right" a renderer never shows you.
//
// The whole thing was CHECKED AGAINST A CAPTURED FRAME before being written:
// expanding metasprite id 1 out of the ROM table gives
//     dx +8 tile $0D attr $20 / dx 0 tile $0B attr $20 /
//     dx -8 tile $09 attr $21 / dy -8 dx -12 tile $DF attr $23
// and hardware OAM at frame 1200 holds exactly those four records, at slots
// 47, 32, 17 and 2 -- the -15-slot walk below, from a base of 188. See
// tests/oam.test.js, which reproduces all four slots and all sixteen bytes.

import { u8, i8 } from './state.js';

/** $8B08+4 = CE 6D 23 F8. Sprite 0: y=206 tile=$6D attr=$23 x=248. */
export const SPRITE0 = [0xCE, 0x6D, 0x23, 0xF8];
/** $8B08+0 = F4 F4 F4 F4 -- sprite 0 parked off-screen when $1F is 0. */
export const SPRITE0_OFF = [0xF4, 0xF4, 0xF4, 0xF4];

/**
 * `$8AF3` -- the OAM write cursor step, and the reason slot 0 is never
 * allocated to an actor.
 *
 *   8AF2: 8A        TXA
 *   8AF3: 18 69 C4  CLC / ADC #$C4     +196 bytes = -15 slots
 *   8AF6: F0 FB     BEQ $8AF3          landed on slot 0 -> step again
 *   8AF8: AA        TAX
 *
 * $C4 was independently derived twice: the static recon read it off $8AF2, and
 * the RAM probe measured the player's three body sprites 15 slots apart in
 * hardware OAM (PROBE.md 4). The `BEQ` back-branch is what reserves slot 0 for
 * the sprite-0 split, which must stay put or $9AA3 never exits its spin.
 */
export function nextSlot(byteCursor) {
  let c = u8(byteCursor + 0xC4);
  if (c === 0) c = u8(c + 0xC4);
  return c;
}

/**
 * `$8B39` -- the per-frame rotation of the display list's base.
 *
 *   8B39: A5 2F / 18 / 69 44   LDA $2F / CLC / ADC #$44    +68 bytes = +17 slots
 *   8B3E: D0 03               BNE $8B43
 *   8B40: 18 69 04            CLC / ADC #$04               skip slot 0
 *
 * THIS IS THE FLICKER. The 8-sprites-per-scanline limit drops the 9th and 10th
 * sprites outright -- the PPU does not flicker them, the GAME does, by moving
 * everybody's OAM index 17 slots every frame so a different eight survive.
 * Confirmed by arithmetic on a captured frame: $2F reads 4 at frame 1200 and
 * the list DMA'd into that frame started at byte 188, and 188 + 68 = 256 -> the
 * `BNE` fails -> +4 -> 4. The quirk is load-bearing, not decoration.
 */
export function rotateBase(base) {
  let b = u8(base + 0x44);
  if (b === 0) b = u8(b + 0x04);
  return b;
}

/**
 * `sub_8AAC` -- expand one metasprite into shadow OAM.
 *
 *   8AAC: 0A        ASL A            id*2; carry picks the table
 *   8AAD: B0 0A     BCS $8AB9        id >= $80 -> $8E9E, else $8D9E
 *   8AC6: B1 A0     LDA ($A0),Y      byte 0 = record count, 0 = nothing to draw
 *   then per record, four bytes: [dy][tile][attr][dx]
 *   8AD3: 65 99     ADC $99          OAM Y = dy + $0320,X      (8-bit, wraps)
 *   8ADB:           STA $0201,X      tile, verbatim
 *   8AE0: 05 9E     ORA $9E          attr | $0180,X            (the OR mask)
 *   8AE7: B1 A0     LDA ($A0),Y      dx
 *   8AE9: 30 18     BMI $8B03        negative dx: store, no cull
 *   8AEB: 65 9A     ADC $9A          OAM X = dx + $0360,X
 *   8AED: B0 0C     BCS $8AFB        positive dx that carried: DROP this
 *                                    sprite -- the X byte is never stored and
 *                                    the cursor never advances, so the next
 *                                    record overwrites it. That is the
 *                                    right-edge cull, and it is asymmetric:
 *                                    a negative dx is never culled.
 */
export function drawMetasprite(oam, table, id, baseX, baseY, orMask, cursor,
                               work = null) {
  const rec = table[id];
  if (work) work.msExpanded++;                    // $8AAC entry
  if (!rec || rec.length === 0) return cursor;    // $8AC8 BEQ $8B02
  let x = cursor;
  for (const [dy, tile, attr, dx] of rec) {
    if (work) work.spriteRecords++;               // $8ACF, the per-record head
    oam[x] = u8(baseY + dy);                      // $8AD5 STA $0200,X
    oam[u8(x + 1)] = tile;                        // $8ADB STA $0201,X
    oam[u8(x + 2)] = attr | orMask;               // $8AE3 STA $0202,X
    const sum = u8(dx) + baseX;                   // $8AEB / $8B03 ADC $9A
    if (i8(dx) >= 0 && sum > 0xFF) continue;      // $8AED BCS -- culled
    oam[u8(x + 3)] = u8(sum);                     // $8AEF STA $0203,X
    x = nextSlot(x);                              // $8AF3
    if (work) work.spritesStored++;               // $8AF9 DEC $9F
  }
  return x;
}

/**
 * `sub_8B10` -- build the whole display list. NMI $80A7.
 *
 * The loop is `$9D` from 0 to $1F: for every object slot whose `$0120,X` is
 * non-zero it takes the position from `$0320,X`/`$0360,X` and the attribute OR
 * mask from `$0180,X`. That is the ONLY thing that makes an object visible, and
 * it is why the two Option slots track the player from stage start but stay
 * invisible until one is collected: `$45` is 0, so $A0C8's loop never writes
 * `$0121`/`$0122` and they read 0 here.
 *
 * NOT PORTED from $8B10: the sprite budget `$9F` (seeded #$3E = 62 at $8B12,
 * decremented per sprite) and the blank pass `$8BAB` that hides the slots past
 * the cursor. `state.shadowOam` is cleared to $F4 each pass instead, which is
 * what $8BAB would have left behind IN OAM.
 *
 * WHAT IT DOES NOT LEAVE BEHIND IS `$36`, and wave 3 measured that rather than
 * assuming it. $8BAB walks from $36, writes $F4 into `$37 + 1` slots at the
 * usual -15-slot stride, and stores the WALKED cursor back ($8BC0 STX $36);
 * `$37` comes from $9F at $8B97-$8BA8. So the cartridge's $36 at the $80B5
 * sample point is not the display list's end cursor. Measured on `idle`:
 * 240, 52, 120, 188, 4, 72, 140, 208 -- $2F's own +$44 rotation. That is the
 * whole of the remaining `w_0036` divergence, and it is the LAST INFO field in
 * the comparison; it stops being one when $9F is modelled.
 *
 * The budget itself is never close to biting in this corpus: measured `$9F` at
 * the end of the busiest frame of the 1900-frame enemy run is 48 of 62.
 */
export function buildDisplayList(state, table) {
  const oam = state.shadowOam;
  // The work census for this frame (state.js `work`). Counted here, in the real
  // loop, and compared against the cartridge's own execution counts -- see
  // tools/oracle/objloop.lua and NOTES-lag.md's model (C).
  const work = state.work;
  if (work) { work.slotsVisited = 0; work.msExpanded = 0;
              work.spriteRecords = 0; work.spritesStored = 0; }
  oam.fill(0xF4);                                 // what $8BAB leaves behind

  // $8B1A-$8B37 -- sprite 0, and the two bytes the split gate reads.
  //
  //   8B14  A9 00     LDA #$00        A = the value that will land in $1E
  //   8B16  A2 03     LDX #$03        X = 3 -> copy $8B08+0..3 (parked)
  //   8B1A  A4 1F     LDY $1F
  //   8B1C  F0 0D     BEQ $8B2B       $1F == 0: $1E = 0, sprite 0 parked
  //   8B1E  A2 07     LDX #$07        X = 7 -> copy $8B08+4..7 (live)
  //   8B20  88        DEY
  //   8B21  D0 06     BNE $8B29       $1F >= 2 -> A = 1
  //   8B23  A0 02     LDY #$02
  //   8B25  84 1F     STY $1F         $1F == 1 -> $1F := 2 and A STAYS 0
  //   8B27  D0 02     BNE $8B2B
  //   8B29  A9 01     LDA #$01
  //   8B2B  85 1E     STA $1E
  //   8B2D  A0 03     LDY #$03
  //   8B2F  BD 08 8B  LDA $8B08,X / STA $0200,Y / DEX / DEY / BPL $8B2F
  //
  // The $1F == 1 arm is the whole reason $1E exists: for exactly one frame the
  // LIVE sprite-0 record is written while $1E stays 0, so $9A8C refuses the
  // split on the frame the sprite first appears. Not reachable inside this
  // corpus ($1F = 2 on every compared frame) -- it is the intro's handover, and
  // it is ported now because the split gate below reads both bytes.
  let a = 0;                                      // $8B14 LDA #$00
  let x = 3;                                      // $8B16 LDX #$03
  if (state.zp1F !== 0) {                         // $8B1A / $8B1C
    x = 7;                                        // $8B1E
    if (state.zp1F - 1 !== 0) a = 1;              // $8B20 DEY / $8B21 BNE
    else state.zp1F = 2;                          // $8B23/$8B25 STY $1F
  }
  state.zp1E = a;                                 // $8B2B STA $1E
  // $8B2F: sprite 0 is copied straight from $8B08, not allocated.
  state.ppu.spriteZeroOn = x === 7;               // which of the two records
  oam.set(x === 7 ? SPRITE0 : SPRITE0_OFF, 0);

  state.oamBase = rotateBase(state.oamBase | 0);  // $8B39
  let cursor = state.oamBase;                     // $8B45 STA $9C

  for (let slot = 0; slot < 0x20; slot++) {       // $8B47 CPX #$20
    if (work) work.slotsVisited++;                // $8B4D, one per iteration
    const id = state.obj.anim[slot];              // $8B4D LDA $0120,X
    if (id === 0) continue;                       // $8B50 BEQ $8B89
    // $8B52 LDA $0180,X / STA $9E -- the OR mask, and it is a ZERO-PAGE BYTE
    // that survives the JSR below, which is what lets $8B79 change it for the
    // second expansion only.
    const orMask = state.obj.attrMask ? state.obj.attrMask[slot] : 0;
    cursor = drawMetasprite(
      oam, table, id,
      state.obj.x[slot],                          // $8B5C LDA $0360,X -> $9A
      state.obj.y[slot],                          // $8B57 LDA $0320,X -> $99
      orMask,                                     // $8B52 $0180,X -> $9E
      cursor, work);
    cursor = forceField(state, oam, table, slot, orMask, cursor, work);
  }
  state.oamCursor = cursor;                       // $8B95 STX $36
}

/**
 * `$8B67-$8B86` -- the SHIELD's force field, drawn on top of slot 0.
 *
 *   8B67  A5 9D     LDA $9D / D0 1E BNE $8B89     slot 0 ONLY
 *   8B6B  A4 46     LDY $46 / F0 1A BEQ $8B89     no shield -> nothing
 *   8B6F  A5 1B     LDA $1B / 29 70 AND #$70 / D0 14 BNE $8B89
 *   8B75  C0 01     CPY #$01 / D0 04 BNE $8B7D
 *   8B79  A9 03     LDA #$03 / 85 9E STA $9E      THE LAST-HIT FLASH
 *   8B7D  A5 02     LDA $02 / 4A / 4A / 29 03 AND #$03 / 18 / 69 5A ADC #$5A
 *   8B86  20 AC 8A  JSR $8AAC                     a SECOND expansion, same $99/$9A
 *
 * THREE THINGS THAT MAKE THIS COMPARED STATE RATHER THAN DECORATION:
 *
 *  1. it is a SECOND `$8AAC` on a slot that already expanded one, so it moves
 *     `msExpanded`, `spriteRecords` and `spritesStored` -- all three are fields
 *     the oracle compares -- and it advances the OAM cursor, which re-orders
 *     every sprite after it. MEASURED on `capsule-shield`'s script: `$8B86`
 *     n = 247 over the frames the shield was up.
 *  2. `$9E` is the OR mask `$8B52` loaded from `$0180,X`, still live across the
 *     first JSR; `$8B79` overwrites it with 3 when `$46 == 1`, so the LAST hit
 *     flashes the force field in a different palette and the ship itself is
 *     unaffected (its own expansion already happened). MEASURED n = 105, which
 *     is exactly the 105 frames that run spent at `$46 == 1` (f542-f646).
 *  3. `$9E` IS NOT DURABLE STATE. `$8B55` rewrites it for every slot and the
 *     expander consumes it inside the frame, so it reads 0 at the `$80B5` sample
 *     point even on the 645 frames the recon saw it set. Do not put it in the
 *     state vector; it is a parameter, and it is one here.
 *
 * `$1B AND #$70` suppresses the whole thing while the ship is dying ($A0) or in
 * any of the $1B bit-4/5/6 phases -- so the wreck is never shielded.
 */
function forceField(state, oam, table, slot, orMask, cursor, work) {
  if (slot !== 0) return cursor;                  // $8B67/$8B69 BNE $8B89
  const y = state.zp.shield;                      // $8B6B LDY $46
  if (y === 0) return cursor;                     // $8B6D BEQ $8B89
  if ((state.substate & 0x70) !== 0) return cursor;   // $8B6F-$8B73 BNE $8B89
  const mask = y === 1 ? 3 : orMask;              // $8B75/$8B77 CPY #$01, $8B79
  const id = u8(((state.frame >> 2) & 3) + 0x5A); // $8B7D-$8B84 ADC #$5A
  return drawMetasprite(oam, table, id,
                        state.obj.x[0],           // $9A, unchanged since $8B5F
                        state.obj.y[0],           // $99, unchanged since $8B5A
                        mask, cursor, work);      // $8B86 JSR $8AAC
}

/**
 * `$8087: LDY #$02 / STY $4014`. The DMA, at the TOP of the NMI.
 *
 * BITS 2-4 OF EVERY ATTRIBUTE BYTE DO NOT EXIST IN HARDWARE OAM and read back
 * as 0. That is not a detail the port could have invented a reason for -- it
 * was MEASURED, by the intro comparison: the cartridge's `nesSpriteRam[2]` read
 * $E0 on all 28 blanked intro frames of `intro-boot` and the port's read $F4.
 * $F4 is the byte $8B08[0..3] stores to park sprite 0 ($8B2F LDA $8B08,X with
 * X = 3), and $F4 AND $E3 = $E0.
 *
 * It had never cost a frame because the corpus's sprite 0 is always the LIVE
 * record, whose attribute byte is $23 -- and $23 AND $E3 = $23. A parked
 * sprite 0 only happens while $1F is 0, which before wave 4 was outside every
 * compared window. docs/knowledge/03's third shape again.
 *
 * The mask is applied to the whole page, not just sprite 0: it is a property of
 * the hardware's OAM, and hwOam is what `s0y/s0t/s0a/s0x` are read from. It
 * cannot change the picture -- the renderer uses bits 0-1 (palette), 5
 * (priority), 6 and 7 (flips) and none of 2-4.
 */
export function oamDma(state) {
  for (let i = 0; i < 256; i += 4) {
    state.hwOam[i] = state.shadowOam[i];
    state.hwOam[i + 1] = state.shadowOam[i + 1];
    state.hwOam[i + 2] = state.shadowOam[i + 2] & 0xE3;
    state.hwOam[i + 3] = state.shadowOam[i + 3];
  }
}
