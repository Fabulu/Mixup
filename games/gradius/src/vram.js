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

/** $8A51 stops when the mode byte is 0, so the queue holds at most 4 packets
 *  before the streamer's own gate ($9D87: LDA $0E / CMP #$04) refuses to add
 *  more. Kept as a named number so the gate and the queue agree. */
export const QUEUE_LIMIT = 4;

/** Append one packet. ROM: $8645/$8647 (append) and $85E8/$85F3 (canned). */
export function queuePacket(state, addr, inc, bytes) {
  state.vram.queue.push({ addr: addr & 0x3FFF, inc, bytes });
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
}
