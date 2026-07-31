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
// ================ $0700 IS A BYTE IMAGE HERE, AND HAS TO BE ==================
//
// Until wave 2 this port carried the queue as a list of {addr, inc, bytes}
// objects and maintained $0E alongside it. That was called "the only
// representational liberty in the port" and it stopped being tenable the moment
// the HUD arrived, because $8898's producers do three things a structured queue
// cannot express:
//
//   * st_88B6 ($88E5/$88ED/$88F2) writes its digits into a packet it has
//     ALREADY appended, by absolute address `$06FE,Y` with Y = $0E;
//   * st_89E3 appends ONE open run out of six separate $85F3 calls plus a bare
//     $FF from $863D -- six "packets" that are one packet on the wire;
//   * $8A30 patches a single attribute byte at `$0700,X`, X = $0E - (8 - $42).
//
// So the page is a real Uint8Array(256) and $0E is a real 8-bit cursor into it.
// The escape above is modelled too, because a byte stream is ambiguous and that
// is precisely why the ROM has an escape at all.

/** PPUCTRL increment bit per queue mode. ROM: $8A4B = 60 00 04 00 04 00. */
export const QUEUE_INC = [null, 1, 32, 1, 32, 1];

/**
 * `$9D87: LDA $0E / CMP #$04 / BCC` and `$889A: CMP #$04` -- the queue gate,
 * shared by the terrain streamer and the HUD tick.
 *
 * IT COUNTS BYTES, NOT PACKETS. `$0E` is the byte cursor into $0700, so "4"
 * means four BYTES -- less than one packet's three-byte header. The port used
 * to compare `queue.length` (a packet count) against it and got the same answer
 * only because both are 0 at the one instant the gate runs. MEASURED at $9D83
 * over 700 frames: $0E = 0 on every frame that built and 8 / 14 / 39 on the
 * frames that did not (00-recon-terrain.md 1) -- and those three numbers are
 * exactly what the four $8898 producers in src/hud.js leave behind.
 */
export const QUEUE_GATE_BYTES = 4;

/**
 * `$8647` -- append ONE byte at $0E and bump it.
 *
 *   8645  A6 0E     LDX $0E        <- the entry that reloads X
 *   8647  9D 00 07  STA $0700,X    <- the entry that keeps the caller's X
 *   864A  E8        INX
 *   864B  86 0E     STX $0E
 *   864D  60        RTS
 *
 * The port has no X register, so $8645 and $8647 collapse into this one
 * function: every port caller that would have held X across a JSR reads $0E
 * back instead, which is the same number. Where that equivalence is NOT free
 * -- $8915's digit pair and $8906's tail keep the cursor in X and store it once
 * at $8912 -- src/hud.js says so at the call site.
 *
 * X IS AN 8-BIT REGISTER AND $0700 IS ONE PAGE, so the cursor wraps at 256.
 * That was a knownFail in tests/frame-gates.test.js until this file stopped
 * keeping $0E as an unmasked JS number.
 */
export function queueByte(state, v) {
  const q = state.vram;
  q.q[q.cursor] = v & 0xFF;                      // $8647 STA $0700,X
  q.cursor = (q.cursor + 1) & 0xFF;              // $864A INX / $864B STX $0E
}

/**
 * Append one whole packet: [mode][addrHi][addrLo][data ...][$FF].
 *
 * This is the shape $9E94 (the attribute packet) and $9EC2 (each tile packet)
 * write by hand, byte by byte, through X. `mode` is the ROM's own literal --
 * both of those routines write `#$01` -- and it is a parameter rather than a
 * derived value because the mode byte is what is on the wire; the increment is
 * the drainer's interpretation of it.
 *
 * `$0E` therefore advances by 4 + n. Cross-checked against the cartridge: one
 * terrain block is 4 tile packets of 4 data bytes plus 1 attribute packet of 1,
 * = 4*8 + 5 = 37, and the cartridge's $0E reads 38 at $80B5 on a block frame --
 * 37 plus the one $00 that $8641 appends at $80B0.
 */
export function queuePacket(state, mode, addr, bytes) {
  if (!QUEUE_INC[mode]) {
    throw new Error(`queue mode ${mode} has no entry in $8A4B (60 00 04 00 04 00)`);
  }
  queueByte(state, mode);                        // $9EC6/$9E94  LDA #$01
  queueByte(state, (addr >> 8) & 0xFF);          // $9ECC/$9E9C  the high byte
  queueByte(state, addr & 0xFF);                 // $9ED2/$9EA2  the low byte
  for (const b of bytes) queueByte(state, b);    // $9F37/$9EAC
  queueByte(state, 0xFF);                        // $9F40/$9EB0  LDA #$FF
}

/**
 * `$8641` -- the one-byte producer the NMI calls at $80B0, LAST of all.
 *
 *   8641  A9 00     LDA #$00
 *   8643  F0 00     BEQ $8645        (a nop branch: $8645 is the next byte)
 *   8645  A6 0E     LDX $0E ...      (and on into the append primitive above)
 *
 * That is the whole routine: it appends ONE $00 -- the drainer's mode-0 stop
 * byte -- and bumps $0E. It is NOT a HUD producer, which is what src/nmi.js
 * used to call it; the HUD is $8898 at $9AC7 and it is in src/hud.js.
 *
 * The byte cannot affect the streamer's gate, and that is worth stating because
 * it looks like it should: $80B0 runs AFTER $9ACE, and $8A76 zeroes $0E at
 * $8099 of the next frame, so the gate at $9D87 never sees it. What it does
 * affect is $0E as sampled at $80B5 -- which is why the port read exactly one
 * less than the cartridge on every compared frame (w_000E@401, the FIRST
 * compared frame, 00-recon-terrain.md 9).
 */
export function queueTerminator(state) {
  queueByte(state, 0x00);                        // $8641 LDA #$00 -> $8645
}

/**
 * `$8A51`'s walk over $0700, transcribed. Returns the packets it finds.
 *
 * Split out from the writing side so tests and diagnostics can read the queue
 * without a PPU, and so the walk itself is written down ONCE:
 *
 *   8A53  LDX $0700,Y / BEQ $8A76       mode 0 -> done
 *   8A58  LDA $10 / AND #$18 / ORA $8A4B,X / STA $2000
 *   8A62  INY / LDA $2002 / LDA $0700,Y / STA $2006   (address high)
 *   8A6C  INY / LDA $0700,Y / STA $2006               (address low)
 *   8A8B  LDA $0700,Y / INY / CMP #$FF / BNE $8A88    (data -> $2007)
 *   8A93  LDA $0700,Y / CMP #$03 / BCS $8A86          THE ESCAPE: the byte
 *         AFTER the $FF is peeked, not consumed. >= 3 means the $FF was DATA,
 *         so $8A86 stores a literal $FF and the same packet continues; < 3
 *         means it is the next packet's mode byte.
 *
 * The escape is why mode bytes must be 1 or 2 in practice: a mode of 3 or more
 * would be read as "that $FF was data" and the queue would never restart.
 */
export function scanQueue(q) {
  const out = [];
  let y = 0;
  // The ROM would spin forever on a malformed page; 256 bytes cannot hold more
  // than 51 four-byte packets, so anything past that is a corrupt image and
  // saying so beats hanging the gate.
  for (let guard = 0; ; guard++) {
    if (guard > 64) throw new Error('$8A51: $0700 has no mode-0 terminator');
    const mode = q[y & 0xFF];                    // $8A53 LDX $0700,Y
    if (mode === 0) break;                       // $8A56 BEQ $8A76
    const inc = QUEUE_INC[mode];
    if (!inc) throw new Error(`$8A5C ORA $8A4B,X: queue mode ${mode} at $0700+${y}`);
    const hi = q[(y + 1) & 0xFF];                // $8A66
    const lo = q[(y + 2) & 0xFF];                // $8A6D
    y += 3;
    const bytes = [];
    for (;;) {
      const b = q[y & 0xFF];                     // $8A8B LDA $0700,Y
      y += 1;                                    // $8A8E INY
      if (b !== 0xFF) { bytes.push(b); continue; }
      if (q[y & 0xFF] >= 3) { bytes.push(0xFF); continue; }   // $8A96 CMP #$03
      break;
    }
    out.push({ mode, inc, addr: ((hi & 0x3F) << 8) | lo, bytes });
  }
  return out;
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
 *
 * THE PAGE IS NOT CLEARED. $8A76 writes $00 to $0700 and to $0E and nothing
 * else, so every byte past index 0 survives into the next frame as garbage --
 * harmless only because $80B0's $8641 puts a fresh mode-0 stop byte at the new
 * $0E at the end of every non-lag frame. Clearing the whole page here would
 * work today and would quietly hide the day it stops being true.
 */
export function drainQueue(state) {
  const nt = state.vram.nt;
  for (const p of scanQueue(state.vram.q)) {
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
      a = (a + p.inc) & 0x3FFF;                // $8A5C set the increment
    }
  }
  state.vram.q[0] = 0;                         // $8A78 STA $0700
  state.vram.cursor = 0;                       // $8A7B STA $0E
}
