// The canned VRAM packets: the 39-entry table at $864E and the copier that
// pushes one of them into the $0700 queue.
//
// ============================ THE FALL-THROUGH ===============================
//
// docs/knowledge/02 trap 1, in its mildest and most misleading form. What looks
// like two routines is ONE producer with two entry points, and the address
// everybody quoted for it is not an instruction boundary at all:
//
//   85E8  48        PHA
//   85E9  A9 02     LDA #$02
//   85EB  85 9B     STA $9B
//   85ED  A9 01     LDA #$01
//   85EF  20 45 86  JSR $8645     <- $85EF $85F0 $85F1 are ONE instruction
//   85F2  68        PLA
//   85F3  85 9A     STA $9A       <- FALL-THROUGH, not a call
//
// `$85F1` is the third byte of that JSR, and it is also the return address the
// JSR pushes (PC-1 = $85EF+2), so anything that attributes a call to "$85F1" is
// reading a stack frame. The real shape is: $85E8 is a five-instruction
// PROLOGUE that appends the queue mode byte $01 and falls through into $85F3,
// the copier. Callers that want a fresh packet enter at $85E8; callers that
// want to CONTINUE an open run (st_89E3's five cells) enter at $85F3.
//
// ============================== THE FORMAT ===================================
//
// $85F3: STA $9A / ASL A / TAX, pointer from the word table at $864E, then copy
// bytes into $0700,X until a control code:
//
//   $FF   end, append nothing  ($860A -> $864B)   the run stays OPEN
//   $FE   append $FF and end   ($8629 -> $8647)   the run is CLOSED
//   $FD   append $FF, $9B := 2, append $01        one index, TWO packets
//   else  copied verbatim
//
// and, when bit 7 of the INDEX is set ($8617 LDA $9A / BPL), everything after
// the first two copied bytes is replaced by $00 -- the "erase this text"
// variant of the same packet. Note $85F5 ASL A is 8-bit, so bit 7 is LOST from
// the table lookup and survives only in $9A: index $80|n and index n share a
// pointer.
//
// The stream bytes come from assets/hud/packets.json (ROM-derived, gitignored,
// written by tools/export_assets.py and re-decoded by tools/verify_assets.py
// against the cartridge's own $0700 images). They are stored RAW, control codes
// included, because this file is the transcription of $85F3 and has to be the
// thing that interprets them.
//
// NOT EXERCISED BY ANY MEASURED FRAME, and said so rather than left to be
// assumed: the $FD arm (packets 5 and 31 use it; nothing stage 1 plays does)
// and the bit-7 blanker (no stage-1 caller sets it). Both are transcribed from
// the listing. 00-recon-terrain.md's "Not resolved" list says the same.

import { queueByte } from './vram.js';

/**
 * `$85E8` -- the prologue. Appends the mode byte and falls through.
 *
 * @param {object} state
 * @param {Uint8Array[]} packets  assets/hud/packets.json, indexed by packet id
 * @param {number} idx  the index in A; bit 7 selects the blanked variant
 */
export function cannedPacket(state, packets, idx) {
  queueByte(state, 0x01);          // $85ED LDA #$01 / $85EF JSR $8645
  copyPacket(state, packets, idx); // $85F2 PLA / $85F3 -- FALL-THROUGH
}

/**
 * `$85F3` -- the copier, entered directly to continue an open run.
 *
 * `$9A` (the index, bit 7 intact) and `$9B` (the blank countdown, preloaded
 * with 2 by the prologue) are ROM scratch and are kept as locals here. That is
 * safe and not a modelling liberty: $9B is also the player's tilt code, but the
 * HUD runs at $9AC7, long after the player at $9A6A, and $A043 rewrites $9B
 * before the next frame's player reads it -- the same reason porttrace.mjs
 * refuses to seed $9B. The terrain streamer clobbers both a few instructions
 * later ($9EBA STA $9A, $9EEE STY $9B) for the same reason.
 *
 * The prologue's `$9B = 2` is re-established here when entering directly,
 * because $85F3's own callers never reload it -- and on the ROM they do not
 * have to: st_89E3's five direct calls all use indices with bit 7 CLEAR, so
 * $9B is dead on that path. Written out with that reasoning attached instead of
 * silently inheriting whatever the previous call left behind.
 */
export function copyPacket(state, packets, idx) {
  // $85F5 ASL A / $85F6 TAX -- the 8-bit doubling drops bit 7, so the LOOKUP
  // uses idx & $7F while the BLANKER below reads the un-masked byte out of $9A.
  const s = packets[idx & 0x7F];
  if (!s) {
    throw new Error(`$85F7 LDA $864E,X: no canned packet `
                  + `$${(idx & 0x7F).toString(16).toUpperCase()} in assets/hud/packets.json`);
  }
  const zp9A = idx & 0xFF;                       // $85F3 STA $9A
  let zp9B = 2;                                  // $85EB STA $9B
  let p = 0;
  for (;;) {
    if (p >= s.length) {
      // The exporter refuses to emit a stream without a terminator, so this is
      // unreachable unless the asset was hand-edited. Loud, not silent.
      throw new Error('$8605: canned packet ran off the end of its stream');
    }
    const b = s[p++];                            // $8605 LDA ($98),Y / $8607 INY
    if (b === 0xFF) return;                      // $860A BEQ $864B -- run left OPEN
    if (b === 0xFE) { queueByte(state, 0xFF); return; }   // $8629 -> $8647
    if (b === 0xFD) {                            // $862D: two packets, one index
      queueByte(state, 0xFF);                    // $862D LDA #$FF / $862F JSR $8647
      zp9B = 2;                                  // $8632 LDA #$02 / $8634 STA $9B
      queueByte(state, 0x01);                    // $8636 LDA #$01 / $8638 JSR $8647
      continue;                                  // $863B BNE $8605
    }
    // $8614 STA $0700,X -- the byte is stored FIRST, and only then overwritten
    // by $0 on the blanked variant. Same effect, but transcribed in the ROM's
    // order so the $9B countdown reads the way the listing does.
    if (zp9A & 0x80) {                           // $8617 LDA $9A / $8619 BPL $8626
      if (zp9B !== 0) { zp9B -= 1; queueByte(state, b); }  // $861D BNE / $8624 DEC $9B
      else queueByte(state, 0x00);               // $861F STA $0700,X with A = $9B = 0
    } else {
      queueByte(state, b);
    }
  }
}

/**
 * `$863D` -- append a bare `$FF`.
 *
 *   863D  A9 FF     LDA #$FF
 *   863F  D0 04     BNE $8645     (always taken: $FF is non-zero)
 *
 * The mirror image of $8641's `$00`, and the same three instructions after the
 * branch. st_89E3 uses it at $8A2D to CLOSE the one long run it built out of
 * six separate copies.
 */
export function queueFF(state) {
  queueByte(state, 0xFF);
}
