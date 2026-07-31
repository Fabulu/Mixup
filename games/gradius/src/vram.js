// The VRAM queue at $0700, and the drainer $8A51 -- the ONLY nametable writer
// during gameplay.
//
// That is not an assumption. A census of every write to $2000/$2005/$2006/$2007
// over 600 frames of boot-plus-gameplay, tagged with the writing PC, found
// exactly one $2007 writer while the stage is running:
//
//   $2007 @ $8A88   9008   the queue drainer $8A51
//   $2007 @ $888B   5429   $8871, the RLE full-screen loader -- ONCE, at load
//   $2006 @ $8A69/$8A70   1290 each   the queue's own address writes
//
// $8A51 is called from the NMI at $8099, near the TOP, so a block queued during
// frame N reaches the PPU at the start of frame N+1. That lag is observable and
// this file keeps it: producers append, the NMI drains, and nothing else in the
// port touches `state.vram.nt`.
//
// Packet format, read out of $8A51-$8A9A:
//     [mode][addrHi][addrLo][data ...][$FF]   repeated, terminated by mode $00
// `mode` indexes $8A4B (`60 00 04 00 04 00`) and the byte is OR'd into PPUCTRL,
// so modes 1/3/5 mean increment 1 and modes 2/4 mean increment 32. A $FF ends a
// packet UNLESS the following byte is >= 3, in which case $8A86 emits a literal
// $FF and keeps going -- the escape.
//
// This port carries packets as {addr, inc, bytes} objects rather than as a
// 256-byte $0700 image. That is a representational liberty and it is the only
// one: the escape above exists precisely because the byte stream is ambiguous,
// and a structured queue cannot be ambiguous. If the escape ever needs to be
// modelled -- it would only matter for a producer that emits tile $FF -- this
// is the place it would go.

/** PPUCTRL increment bit per queue mode. ROM: $8A4B = 60 00 04 00 04 00. */
export const QUEUE_INC = [null, 1, 32, 1, 32, 1];

/**
 * `$9D87: LDA $0E / CMP #$04 / BCC` and `$889A: CMP #$04` -- the queue gate,
 * shared by the terrain streamer and the HUD tick.
 *
 * IT COUNTS BYTES, NOT PACKETS. `$0E` is the byte cursor into $0700, so "4"
 * means four BYTES -- less than one packet's three-byte header. The port used
 * to compare `queue.length` (a packet count) against it and got the same answer
 * only because both are 0 at the one instant the gate runs: the drainer at
 * $8099 zeroes $0E at the top of every frame and the streamer is, today, the
 * only producer. MEASURED at $9D83 over 700 frames: $0E = 0 on every frame that
 * built and 8 / 14 / 39 on the frames that did not (00-recon-terrain.md 1).
 */
export const QUEUE_GATE_BYTES = 4;

/**
 * Append one packet. ROM: $8645/$8647 (append) and $85E8/$85F3 (canned).
 *
 * `$0E` advances by the packet's WIRE length -- [mode][addrHi][addrLo] then the
 * data then the [$FF] terminator, i.e. 4 + n. Cross-checked against the
 * cartridge: one terrain block is 4 tile packets of 4 data bytes plus 1
 * attribute packet of 1, = 4*8 + 5 = 37, and the cartridge's $0E reads 38 at
 * $80B5 on a block frame -- 37 plus the one $00 that $8641 appends at $80B0.
 */
export function queuePacket(state, addr, inc, bytes) {
  state.vram.queue.push({ addr: addr & 0x3FFF, inc, bytes });
  state.vram.cursor += 4 + bytes.length;         // $864B STX $0E
}

/**
 * `$8641` -- the one-byte producer the NMI calls at $80B0, LAST of all.
 *
 *   8641  A9 00     LDA #$00
 *   8643  F0 00     BEQ $8645        (a nop branch: $8645 is the next byte)
 *   8645  A6 0E     LDX $0E
 *   8647  9D 00 07  STA $0700,X
 *   864A  E8        INX
 *   864B  86 0E     STX $0E
 *   864D  60        RTS
 *
 * That is the whole routine: it appends ONE $00 -- the drainer's mode-0 stop
 * byte -- and bumps $0E. It is NOT a HUD producer, which is what src/nmi.js
 * used to call it; the HUD is $8898 at $9AC7 and is wave 2's job.
 *
 * The byte cannot affect the streamer's gate, and that is worth stating because
 * it looks like it should: $80B0 runs AFTER $9ACE, and $8A76 zeroes $0E at
 * $8099 of the next frame, so the gate at $9D87 never sees it. What it does
 * affect is $0E as sampled at $80B5 -- which is why the port read exactly one
 * less than the cartridge on every compared frame (w_000E@401, the FIRST
 * compared frame, 00-recon-terrain.md 9).
 *
 * The port carries packets as objects, so there is no $0700 image to store the
 * $00 in; the cursor is bumped and the terminator is implicit in the queue's
 * end. Nothing reads the byte: $8A51 stops ON it.
 */
export function queueTerminator(state) {
  state.vram.cursor += 1;                        // $864A INX / $864B STX $0E
}

/**
 * `$8A51` -- drain the queue into VRAM. Called from the NMI at $8099.
 *
 * Nametable writes land in `state.vram.nt`, a flat image of PPU $2000-$2FFF.
 * MIRRORING IS VERTICAL, checked two ways that could have disagreed: the iNES
 * flags6 byte is $31 (bit 0 = 1 = vertical), and a live 4 KB PPU read says
 * $2000 == $2800 and $2400 == $2C00 while $2000 != $2400. So $2800/$2C00 are
 * aliases and are folded onto $2000/$2400 here.
 *
 * Palette writes ($3F00-$3F1F) land in `state.vram.pal`. $3F00 is the
 * UNIVERSAL BACKDROP -- every transparent pixel takes it, not the colour-0
 * entry of its own palette. On stage 1 that is invisible because all eight
 * entry-0 slots read $0F, which is exactly why it is written down here rather
 * than discovered later on a screen where it is not.
 */
export function drainQueue(state) {
  const nt = state.vram.nt;
  for (const p of state.vram.queue) {          // $8A5F .. $8A94, mode 0 ends
    let a = p.addr;
    for (const b of p.bytes) {                 // $8A88 STA $2007
      if (a >= 0x3F00) {
        state.vram.pal[a & 0x1F] = b;
        // $3F10/$14/$18/$1C mirror $3F00/$04/$08/$0C on real hardware.
        if ((a & 0x13) === 0x10) state.vram.pal[a & 0x0F] = b;
      } else if (a >= 0x2000) {
        nt[(a - 0x2000) & 0x7FF] = b;          // vertical mirroring: 2 KB
        nt[((a - 0x2000) & 0x7FF) + 0x800] = b;
      }
      a = (a + p.inc) & 0x3FFF;                // $8A5F set the increment
    }
  }
  state.vram.queue.length = 0;                 // $8A76 zeroes $0700 and $0E
  state.vram.cursor = 0;                       // $8A7B STA $0E
}
