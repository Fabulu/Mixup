// $8A51 -- the queue walk, the $FF escape, the increment table, and where the
// bytes land. The DECODER, tested on pages the stage-1 producers never build.
//
// ========================= WHY THIS FILE EXISTS ==============================
//
// Wave 2 rewrote src/vram.js so $0700 is a real 256-byte image, and the review
// of that commit measured what the rest of the suite could see of it. Five
// parameters of the new decoder could be changed with all 80 tests still green:
//
//   the $8A96 CMP #$03 escape threshold, the $8A4B increment-32 entries, the
//   $2800 nametable fold, the $3F10 palette mirror, and the 14-bit address wrap
//
// Every one of them is unreachable from a stage-1 packet -- no packet the port
// emits contains a data byte $FF, every producer writes mode $01, and no
// producer addresses $2800 or $3F00. So they were transcription with no check
// under it, which is the same thing as a comment. Each test below is named for
// the ROM bytes it pins and says which mutation reddens it.
//
// THESE PAGES ARE HAND-BUILT AND THAT IS DELIBERATE. docs/knowledge/02 trap 4-2
// says a harness may only set up state the application sets up -- so read this
// file as testing $8A51 as a DECODER of the format $8A4B/$8A96 define, not as a
// claim that stage 1 produces such a page. What stage 1 does produce is pinned,
// against the cartridge's own $0700 dumps, in tests/hud.test.js and
// tests/terrain.test.js.

import test from 'node:test';
import assert from 'node:assert';

import { bootState } from '../src/main.js';
import { QUEUE_INC, scanQueue, drainQueue, queueByte, queuePacket } from '../src/vram.js';
import { knownFail, headlessResources } from './helpers.js';
import { copyPacket } from '../src/hudpackets.js';

const res = headlessResources(0);

/** A state whose queue page is exactly the bytes given, with nothing else in it. */
function withPage(bytes) {
  const s = bootState(res.manifest);
  s.vram.q.fill(0);
  s.vram.q.set(bytes, 0);
  s.vram.cursor = bytes.length;
  s.vram.nt.fill(0);
  s.vram.pal.fill(0);
  return s;
}

// ===================== $8A4B, the increment table ===========================

test('$8A4B `60 00 04 00 04 00`: modes 2 and 4 are increment 32, and entry 0 is an RTS', () => {
  // INDEPENDENTLY DERIVED (docs/knowledge/03): the six bytes are spelled out
  // here as they read at $8A4B and the increments are computed from bit 2 --
  // PPUCTRL's own VRAM-increment bit -- instead of being copied from
  // QUEUE_INC. A bug in the constant therefore cannot hide itself.
  //
  //   8A48  9D 00 07  STA $0700,X
  //   8A4B  60        RTS            <- $8A30's return AND table entry 0
  //   8A4C  00 04 00 04 00           <- entries 1..5
  //   8A5C  1D 4B 8A  ORA $8A4B,X    <- OR'd straight into PPUCTRL
  //
  // Entry 0 is the RTS opcode: it would OR $60 (NMI enable + 8x16 sprites) into
  // $2000, which is why it can only ever be read if $8A56 BEQ is removed. Same
  // shape as jt_88AD's fifth entry doubling as `LDA #$1E` -- do not "tidy" it.
  // RED WHEN: QUEUE_INC's 32s become 1s, or an entry is dropped/added.
  const TABLE_8A4B = [0x60, 0x00, 0x04, 0x00, 0x04, 0x00];
  const derived = TABLE_8A4B.map((b, i) => (i === 0 ? null : ((b & 0x04) ? 32 : 1)));
  assert.deepStrictEqual([...QUEUE_INC], derived,
    'QUEUE_INC is not what $8A4B says, bit 2 = PPUCTRL increment 32');
  assert.strictEqual(QUEUE_INC.length, 6, '$8A4B is six bytes: $8A4B-$8A50');
  assert.strictEqual(TABLE_8A4B[0], 0x60, '$8A4B is the RTS at the end of $8A30');
});

test('mode 2 strides the nametable by 32: one COLUMN, not one row', () => {
  // The consequence of the table above, on the wire. Four bytes at $2000 in
  // mode 2 land 32 apart -- $2000 $2020 $2040 $2060 -- and in mode 1 they land
  // adjacent. That difference is invisible to every other check in the suite
  // because a 4x4 block of either shape fills the same square (the review's
  // "break that PASSED"), so it is asserted here on the raw nametable offsets.
  // RED WHEN: QUEUE_INC[2] is 1, or the drain ignores p.inc.
  const col = withPage([]);
  queuePacket(col, 2, 0x2000, [0x11, 0x22, 0x33, 0x44]);
  drainQueue(col);
  assert.deepStrictEqual([col.vram.nt[0], col.vram.nt[32], col.vram.nt[64], col.vram.nt[96]],
    [0x11, 0x22, 0x33, 0x44], 'mode 2 did not stride by 32');
  assert.strictEqual(col.vram.nt[1], 0, 'mode 2 wrote the byte NEXT DOOR');

  const row = withPage([]);
  queuePacket(row, 1, 0x2000, [0x11, 0x22, 0x33, 0x44]);
  drainQueue(row);
  assert.deepStrictEqual([...row.vram.nt.subarray(0, 4)], [0x11, 0x22, 0x33, 0x44],
    'mode 1 did not stride by 1');
});

// ======================= $8A93-$8A9A, the escape ============================
//
// The page below is walked once and asserted three ways. It is the only place
// in the suite where a data byte is $FF at all.
//
//   idx  0: 01 20 00        packet A, mode 1 (inc 1), $2000
//        3: 41              one data byte
//        4: FF              -> the byte AFTER it is $02, and 2 < 3, so this $FF
//        5:                    ENDS the packet and $02 is the next MODE byte
//        5: 02 24 00        packet B, mode 2 (inc 32), $2400
//        8: 55
//        9: FF              -> next is $01, ends
//       10: 01 22 00        packet C, mode 1, $2200
//       13: FF              -> the byte AFTER it is $03, and 3 >= 3, so the $FF
//                              is DATA and the packet keeps going
//       14: 03              data
//       15: FF              -> next is $00, ends
//       16: 00              mode 0, stop
//       17: FF 00           belt and braces: any walk that runs on terminates
//                           here instead of spinning through 240 zero bytes
const ESCAPE_PAGE = [0x01, 0x20, 0x00, 0x41, 0xFF,
                     0x02, 0x24, 0x00, 0x55, 0xFF,
                     0x01, 0x22, 0x00, 0xFF, 0x03, 0xFF,
                     0x00, 0xFF, 0x00];

test('$8A96 CMP #$03: a following byte of 2 ENDS the packet', () => {
  // The low side of the threshold. A mode byte is 1 or 2 in practice, so this
  // is the arm that makes an $FF a terminator at all.
  // RED WHEN: the comparison becomes `>= 2` -- packets A and B fuse into one
  // 6-byte packet at $2000 and the mode-2 header is eaten as data.
  const q = scanQueue(Uint8Array.from(ESCAPE_PAGE));
  assert.strictEqual(q.length, 3, `$8A51 found ${q.length} packets, not 3`);
  assert.deepStrictEqual({ mode: q[0].mode, inc: q[0].inc, addr: q[0].addr, bytes: [...q[0].bytes] },
    { mode: 1, inc: 1, addr: 0x2000, bytes: [0x41] }, 'packet A');
  assert.deepStrictEqual({ mode: q[1].mode, inc: q[1].inc, addr: q[1].addr, bytes: [...q[1].bytes] },
    { mode: 2, inc: 32, addr: 0x2400, bytes: [0x55] }, 'packet B -- the $FF at idx 4 did not end A');
});

test('$8A98 BCS $8A86: a following byte of 3 makes the $FF DATA and the packet runs on', () => {
  // The high side, and the reason the ROM has an escape at all: a data byte of
  // $FF is indistinguishable from a terminator without it. $8A86 stores a
  // LITERAL $FF to $2007 and jumps back into the same packet's data loop.
  // RED WHEN: the comparison becomes `>= 4` -- packet C ends empty at $2200 and
  // the walk mistakes the data byte $03 for a mode-3 header at $3F00.
  const q = scanQueue(Uint8Array.from(ESCAPE_PAGE));
  assert.deepStrictEqual({ addr: q[2].addr, bytes: [...q[2].bytes] },
    { addr: 0x2200, bytes: [0xFF, 0x03] },
    'the $FF at idx 13 was not escaped by the $03 behind it');
  // ...and it reaches VRAM as a literal $FF, which is what $8A86 stores.
  const s = withPage(ESCAPE_PAGE);
  drainQueue(s);
  assert.strictEqual(s.vram.nt[0x200], 0xFF, '$8A86 STA $2007 did not store the escaped $FF');
  assert.strictEqual(s.vram.nt[0x201], 0x03, 'the byte after the escape is data too');
});

test('$8A51 refuses a page with no mode-0 stop byte instead of spinning', () => {
  // 64 four-byte packets fill the page exactly, and then Y wraps to 0 and the
  // walk starts again -- forever. The ROM does not hang here because $8A74
  // BNE stops the drain on the Y wrap; the port does not model that (see the
  // knownFail below) and throws instead. Either way the gate must not hang.
  // RED WHEN: the guard returns/breaks rather than throwing.
  const page = [];
  for (let i = 0; i < 64; i++) page.push(0x01, 0x20, 0x00, 0xFF);
  assert.strictEqual(page.length, 256, 'the page must be exactly full');
  assert.throws(() => scanQueue(Uint8Array.from(page)), /\$8A51/);
});

// =================== where the bytes land: the mirrors =======================

test('$2800/$2C00 are ALIASES: vertical mirroring folds them, and the fold is visible', () => {
  // iNES flags6 bit 0 = 1 and a live 4 KB PPU read says $2000 == $2800. The
  // port keeps a flat 4 KB image and writes BOTH copies, because
  // src/render/ppu.js:156 computes `base = (((nty << 1) | ntxE) & 3) * 0x400`
  // and reads $2800-$2FFF whenever nty = 1 -- which the port's own $13 = $0C
  // makes routine for screen scanlines 228-239.
  //
  // NOTHING ELSE IN THE SUITE SEES THIS. tests/ppu.test.js's pixel-exact check
  // feeds the renderer the CARTRIDGE's nametable through frameFromCapture(), so
  // the queue -> nametable -> renderer chain is never joined; and
  // tests/terrain.test.js compared only the lower 2 KB until this wave.
  // Deleting the `+ 0x800` store left all 80 tests green.
  // RED WHEN: the mirror store is dropped, or the & $7FF becomes & $FFF.
  const s = withPage([]);
  queuePacket(s, 1, 0x2000, [0x11, 0x22, 0x33]);
  queuePacket(s, 1, 0x2400, [0x44]);
  queuePacket(s, 1, 0x2800, [0x99]);          // an ALIAS of $2000, not a fifth page
  drainQueue(s);

  assert.strictEqual(s.vram.nt[0x000], 0x99, '$2800 must fold onto $2000');
  assert.deepStrictEqual([...s.vram.nt.subarray(0, 3)], [0x99, 0x22, 0x33]);
  assert.strictEqual(s.vram.nt[0x400], 0x44, '$2400 is its own page');
  assert.deepStrictEqual([...s.vram.nt.subarray(0x800, 0x803)], [0x99, 0x22, 0x33],
    'the $2800 image does not mirror the $2000 image');
  assert.strictEqual(s.vram.nt[0xC00], 0x44, '$2C00 does not mirror $2400');
  // The invariant the renderer depends on, stated whole: the two halves of the
  // 4 KB image are the same 2 KB.
  assert.deepStrictEqual([...s.vram.nt.subarray(0, 0x800)],
                         [...s.vram.nt.subarray(0x800, 0x1000)],
    'the upper 2 KB is not a byte-identical mirror of the lower 2 KB');
});

test('$3F10/$3F14/$3F18/$3F1C mirror $3F00/$04/$08/$0C, and $3F11 does not', () => {
  // $3F00 is the UNIVERSAL BACKDROP: every transparent pixel takes it, whatever
  // palette the tile is in. On hardware the four sprite-palette entry-0 slots
  // are the SAME cell as the four background ones, so a write to $3F10 changes
  // the backdrop. Invisible on stage 1 -- all eight entry-0 slots hold $0F --
  // and that is precisely why it needs a check rather than a comment.
  // RED WHEN: the `(a & 0x13) === 0x10` mirror is dropped, or it is widened to
  // every $3F1x (which would alias $3F11 onto $3F01 and recolour the ship).
  const s = withPage([]);
  queuePacket(s, 1, 0x3F10, [0x21, 0x22, 0x23, 0x24, 0x25]);   // $3F10..$3F14
  queuePacket(s, 1, 0x3F18, [0x28]);
  queuePacket(s, 1, 0x3F1C, [0x2C]);
  drainQueue(s);

  assert.strictEqual(s.vram.pal[0x10], 0x21, '$3F10 itself');
  assert.strictEqual(s.vram.pal[0x00], 0x21, '$3F10 must write the backdrop $3F00');
  assert.strictEqual(s.vram.pal[0x14], 0x25, '$3F14 itself');
  assert.strictEqual(s.vram.pal[0x04], 0x25, '$3F14 must mirror $3F04');
  assert.strictEqual(s.vram.pal[0x08], 0x28, '$3F18 must mirror $3F08');
  assert.strictEqual(s.vram.pal[0x0C], 0x2C, '$3F1C must mirror $3F0C');
  assert.deepStrictEqual([...s.vram.pal.subarray(0x01, 0x04)], [0, 0, 0],
    '$3F11-$3F13 are NOT mirrored; only the entry-0 slots are');
});

test('the PPU address bus is 14 bits: $3FE0 + 32 wraps to $0000, not to $4000', () => {
  // $8A69/$8A70 write a 14-bit address into $2006 and $2007 auto-increments
  // inside it. Unreachable from a stage-1 packet (nothing addresses $3Fxx with
  // increment 32) and transcribed from hardware rather than from a measurement,
  // which is why it is said here instead of assumed.
  // RED WHEN: the increment masks with $FFFF -- the third byte then lands back
  // in palette RAM at $4000 & $1F = 0 and repaints the backdrop.
  const s = withPage([]);
  queuePacket(s, 2, 0x3FC0, [0x11, 0x22, 0x33]);   // $3FC0, $3FE0, then wrap
  drainQueue(s);
  assert.strictEqual(s.vram.pal[0x00], 0x22,
    'the third byte was written after the wrap; $4000 is $0000 and is not palette RAM');

  // The same 14 bits on the way IN. $8A69's first $2006 write latches six bits,
  // so a header high byte of $63 addresses $2340 -- the top two bits are simply
  // not on the bus. Every canned packet in the table has a high byte below $40,
  // which is why `hi & $3F` -> `hi & $FF` was a break the suite could not see
  // (measured: 95 pass, 0 fail) before this assertion.
  const hdr = Uint8Array.from([0x01, 0x63, 0x40, 0x77, 0xFF, 0x00]);
  assert.strictEqual(scanQueue(hdr)[0].addr, 0x2340, '$2006 latched more than six bits');
  const h = withPage([...hdr]);
  drainQueue(h);
  assert.strictEqual(h.vram.nt[0x340], 0x77, 'the byte did not land at $2340');
});

// ===================== the two 8-bit wraps the port does not model ===========

knownFail('$8627 BNE $8605: the copier STOPS when the queue cursor wraps',
  `THE PORT'S copyPacket() loops until a control code and never looks at the
   cursor. The ROM's loop counter IS the cursor -- X -- and it is 8 bits:

     8614  9D 00 07  STA $0700,X
     8626  E8        INX
     8627  D0 DC     BNE $8605      <- not taken when X wraps to 0
     8629  A9 FF     LDA #$FF
     862B  D0 1A     BNE $8647      -> STA $0700,X (X = 0) / INX / STX $0E

   so a packet that reaches the end of the page is TRUNCATED and closed with an
   $FF at $0700[0], leaving $0E = 1. The port copies straight on through the
   wrap and overwrites the head of the page with the packet's tail.

   NOT REACHED BY THE RECORDED CORPUS: max $0E over 1000 frames of long-idle is
   149 (21 frames, all game mode 5, the $9C2C path that calls $9D8E four times
   with no gate), so this needs a queue about 70% deeper than anything measured.
   It is annotated rather than fixed because src/ is not this agent's to write,
   and it is annotated rather than ignored because it is one INX from live.
   Fix: in src/hudpackets.js, stop the loop when queueByte() takes the cursor
   through 0 and append $FF instead.`,
  () => {
    const s = bootState(res.manifest);
    s.vram.q.fill(0);
    s.vram.cursor = 0xFE;                 // two bytes of room left in the page
    copyPacket(s, res.hudPackets, 0x15);  // packet $15 = 0D 0E 0F 10 FF
    assert.strictEqual(s.vram.q[0xFE], 0x0D, 'the first byte still lands normally');
    assert.strictEqual(s.vram.q[0xFF], 0x0E, 'the second fills the page');
    assert.strictEqual(s.vram.q[0x00], 0xFF, '$8629 closes the truncated packet');
    assert.strictEqual(s.vram.cursor, 1, '$864B STX $0E after the $8629 append');
    assert.strictEqual(s.vram.q[0x01], 0x00, '$0F and $10 are never copied');
  });

knownFail('$8A74 BNE $8A8B: the drain STOPS when a packet header straddles $07FF',
  `THE PORT'S scanQueue() masks its index with & $FF and walks on into the head
   of the page. The ROM checks the wrap once, between the address bytes and the
   data:

     8A6C  C8        INY
     8A6D  B9 00 07  LDA $0700,Y
     8A70  8D 06 20  STA $2006
     8A73  C8        INY
     8A74  D0 15     BNE $8A8B      <- not taken when Y wraps
     8A76  A9 00     LDA #$00       -> STA $0700 / STA $0E: the drain is OVER

   so a packet whose three header bytes end at $07FF is set up on $2006 and then
   ABANDONED with no data written, and the frame's queue ends there. The port
   instead reads its data from $0700[0] onward -- the first packet's own header
   -- and writes it to the PPU.

   The page below is the smallest witness: one 253-byte packet, then a header at
   $07FD-$07FF. The port emits a second packet of [$01 $23] at $2100 that the
   cartridge never writes.

   NOT REACHED BY THE RECORDED CORPUS (max $0E = 149 of 256). Same fix owner as
   the $8627 knownFail above. Note that src/vram.js's own \`guard > 64\` throw is
   standing in for exactly this instruction: the ROM cannot spin on a page with
   no stop byte because Y wrapping ends the drain.`,
  () => {
    const page = new Uint8Array(256);
    page[0] = 0x01; page[1] = 0x23; page[2] = 0xFF;   // packet A: mode 1, $23FF
    page.fill(0x00, 3, 252);                          // 249 data bytes
    page[252] = 0xFF;                                 // ends A ($01 follows, < 3)
    page[253] = 0x01; page[254] = 0x21; page[255] = 0x00;   // a header at the very end
    assert.strictEqual(scanQueue(page).length, 1,
      '$8A74 must abandon the straddling packet, leaving ONE');

    const s = withPage([...page]);
    drainQueue(s);
    assert.strictEqual(s.vram.nt[0x100], 0x00,
      'nothing may be written at $2100: the ROM stopped before the data loop');
  });

// ============================ the guard rails ===============================

test('$8647 STA $0700,X: the cursor is one page and wraps at 256', () => {
  // X is an 8-bit register. This was a knownFail in tests/frame-gates.test.js
  // until wave 2 made $0E a real byte, and it is kept here because the wrap is
  // what the two knownFails above are ABOUT.
  // RED WHEN: queueByte() lets the cursor grow past 255.
  const s = bootState(res.manifest);
  s.vram.cursor = 0xFF;
  queueByte(s, 0xAA);
  assert.strictEqual(s.vram.cursor, 0, '$864A INX wrapped past the page');
  assert.strictEqual(s.vram.q[0xFF], 0xAA);
  queueByte(s, 0xBB);
  assert.strictEqual(s.vram.q[0x00], 0xBB, 'the next byte overwrites $0700[0]');
});

test('$8A5C ORA $8A4B,X: a mode with no table entry is loud, not silent', () => {
  // Mode 6 would index one byte PAST the table -- $8A51 LDY #$00, i.e. it would
  // OR $A0 into PPUCTRL. A queue that silently drops such a packet is
  // docs/knowledge/02 trap 2: byte-exact state, nothing drawn.
  assert.throws(() => scanQueue(Uint8Array.from([0x06, 0x20, 0x00, 0xFF, 0x00])),
    /\$8A5C/);
  const s = bootState(res.manifest);
  assert.throws(() => queuePacket(s, 6, 0x2000, [1]), /\$8A4B/);
});
