// The terrain streamer. ROM: `$9D83`/`$9D8E`, called once per frame from
// $9ACE, one 32x32 pixel block per call.
//
// PROVEN against the running cartridge: a re-implementation built straight out
// of the PRG tables predicted, over 448 block emissions of a 4000-frame attract
// run, every nametable address, attribute address, block id, tile byte and
// attribute byte the ROM pushed through $2006/$2007, and every collision byte
// it stored -- 0 disagreements. Seven negative controls, each watched go red
// (NOTES-terrain.md 8).
//
// The block/screen/page tables themselves are NOT in this file. They come out
// of the cartridge into assets/terrain/stages.json, which is ROM-derived and
// gitignored. What is here is the CODE: the gate, the $58 walk, the address
// arithmetic, and the collision derivation.

import { u8 } from './state.js';
import { queuePacket, QUEUE_GATE_BYTES } from './vram.js';

/** $9D6D,X = 05 06 20 24 -- collision page then nametable page, by $55 bit 0. */
const COLL_PAGE = [0x05, 0x06];
const NT_PAGE = [0x20, 0x24];

/**
 * `$9D83` -- the gate, then `$9D8E` -- one block. Byte for byte:
 *
 *   9D83  A5 3A     LDA $3A
 *   9D85  D0 06     BNE $9D8D           not while the stage-advance latch is up
 *   9D87  A5 0E     LDA $0E
 *   9D89  C9 04     CMP #$04            only if the queue holds < 4 BYTES
 *   9D8B  90 01     BCC $9D8E
 *   9D8D  60        RTS
 *   9D8E  A9 00     LDA #$00
 *   9D90  85 57     STA $57             cleared on EVERY gate pass
 *   9D92  A5 58     LDA $58
 *   9D94  D0 1C     BNE $9DB2           mid half-page -> always build
 *   9D96  A5 54 38 E5 3E 85 98    $98 := $54 - $3E          (SEC, SBC)
 *   9D9D  A5 55 E5 3F             A   := $55 - $3F - borrow
 *   9DA1  30 0F     BMI $9DB2           lead is NEGATIVE -> BUILD
 *   9DA3  C9 01     CMP #$01
 *   9DA5  90 0B     BCC $9DB2           lead < $0100 -> build
 *   9DA7  D0 06     BNE $9DAF           lead >= $0200 -> throttle
 *   9DA9  A5 98 C9 80 90 03             lead low < $80 -> build
 *   9DAF  E6 57     INC $57
 *   9DB1  60        RTS
 *
 * TWO THINGS THIS USED TO GET WRONG, both fixed here, both citing
 * 00-recon-terrain.md 6:
 *
 *  1. The gate counted PACKETS (`queue.length >= 4`). `$0E` is a BYTE cursor;
 *     four bytes is not even one packet header. Same answer today only because
 *     the drainer zeroes $0E at $8099 and the streamer is the only producer, so
 *     the gate always reads 0 -- which is exactly how a wrong constant survives.
 *  2. `$9DA1 BMI` builds when the 16-bit lead is NEGATIVE, i.e. the camera has
 *     overtaken the build cursor. The port compared an unsigned lead against
 *     $0180, so a negative lead read as >= $8000 and was REFUSED -- the ROM's
 *     "you are behind, catch up" arm became "you are miles ahead, stop". Not
 *     reachable while the cursor stays in front, so it had never fired.
 *
 * The throttle is why the streamer does NOT run every frame -- on one boot
 * script it ran on frames 287-369 and then not again until 571. A negative
 * control aimed at a window with no block in it comes back green; that is a
 * trap this project has already stepped in once (NOTES-terrain.md 8).
 *
 * @param {object} stage  one entry of assets/terrain/stages.json
 * @returns {boolean} whether a block was emitted
 */
export function streamBlock(state, stage) {
  if (state.build.gate !== 0) return false;                 // $9D83/$9D85
  if (state.vram.cursor >= QUEUE_GATE_BYTES) return false;  // $9D87 CMP #$04

  const b = state.build;
  b.ahead = 0;                                              // $9D90 STA $57

  if (b.prog === 0) {                                       // $9D92/$9D94
    // $9D96-$9DA0: a 16-bit SBC of the camera from the build cursor. $98 keeps
    // the low byte; the accumulator holds the high byte, and the flags that
    // follow are read off THAT byte.
    const diff = (((b.hi << 8) | b.lo)
                - ((state.cam.hi << 8) | state.cam.lo)) & 0xFFFF;
    const hi = diff >> 8;                                   // A after $9D9F
    const lo = diff & 0xFF;                                 // $98
    let build;
    if (hi & 0x80) build = true;                            // $9DA1 BMI $9DB2
    else if (hi < 0x01) build = true;                       // $9DA3/$9DA5 BCC
    else if (hi !== 0x01) build = false;                    // $9DA7 BNE $9DAF
    else build = lo < 0x80;                                 // $9DA9-$9DAD
    if (!build) { b.ahead = u8(b.ahead + 1); return false; } // $9DAF INC $57
  }
  emitBlock(state, stage);
  advanceProgress(state);
  return true;
}

/**
 * `$9D8E-$9F92` -- the addresses, the tiles and the collision for one block.
 *
 * $58 = blockCol*32 + blockRow, blockRow 0..6 and blockCol 0..3, so a half-page
 * is 4 block columns x 7 block rows = 28 blocks = 128 x 224 px. Proven by the
 * advance at $9F94 and observed as exactly 28 distinct values of $58.
 */
function emitBlock(state, stage) {
  const b = state.build;
  const half = (b.lo & 0x80) ? 1 : 0;          // $9DCE LDY $54 / BPL
  const page = b.hi & 1;                       // $9DB2 LDA $55 / AND #$01
  const row = b.prog & 7;                      // $9DDC
  const col = (b.prog & 0xF0) >> 5;            // $9E1B

  // $9DBC/$9DE9/$9DFC and $9DC1/$9DD6/$9E0E/$9E17
  const ntAddr = (NT_PAGE[page] << 8) + (half ? 0x10 : 0)
               + row * 128 + ((b.prog & 0xF8) >> 3);
  const atAddr = ((NT_PAGE[page] | 3) << 8) + (half ? 0xC4 : 0xC0)
               + row * 8 + col;

  // $9E1B-$9E36 / $9E4A / $9E5C / $9E6F -- page -> screen -> layout -> block id
  const layoutIdx = row * 8 + col + (half ? 4 : 0);
  const screen = stage.pageOrder[b.hi] ?? 0;   // $9E4A LDA (screenOrder),Y
  const screenKey = `${stage.stage}:${screen}`;
  const layout = stage.screens[screenKey];
  if (!layout) throw new Error(`terrain: no screen ${screenKey} in stages.json`);
  const blockId = layout.blockIds[layoutIdx];

  const block = stage.blocks[`${stage.stage}:${blockId}`];
  if (!block) throw new Error(`terrain: no block ${blockId} in stages.json`);

  // The four tile packets. Each is a COLUMN of four tiles written with PPU
  // increment 32 -- which is not a guess about the queue's shape but the
  // reading forced by the collision derivation below, whose `$A8 += 8` at
  // $9F81 walks to the "next tile column" over packets 8 bytes apart.
  for (let c = 0; c < 4; c++) {
    queuePacket(state, ntAddr + c, 32, [
      block.tiles[c], block.tiles[4 + c], block.tiles[8 + c], block.tiles[12 + c],
    ]);
  }
  // One attribute byte per 32x32 block -- which is exactly one attribute quad,
  // so the block and the attribute grid line up and no read-modify-write is
  // needed. $9EAA reads it from attrTbl[blockId].
  queuePacket(state, atAddr, 1, [block.attr]);

  // ---- collision. $9F55-$9F92 -----------------------------------------
  // SAME DATA AS THE VISUALS. This is the answer to the question that cost
  // real work on Batman, and here it is unambiguous: the map is derived from
  // the tile indices just queued, by thresholding, in the same routine.
  //
  // $9F4F: LDY $19 / CPY #$04 / BEQ $9F94 -- stage index 4 (stage 5) skips the
  // write entirely and uses page $0600 for something else. Corroborated three
  // ways in NOTES-terrain.md 5; carried here so a later stage cannot silently
  // get a bogus map.
  if (stage.collisionWritten) {
    const base = ((COLL_PAGE[page] - 5) << 8) | u8(b.lo + b.prog);   // $9F7F
    for (let c = 0; c < 4; c++) {
      state.coll[(base + c * 8) & 0x1FF] = block.collision[c];       // $9F81
    }
  }
}

/**
 * `$9F94` -- advance $58, and $54/$55 when the half-page is done.
 *
 *   9F94  LDA $58 / AND #$07 / CMP #$06
 *   9F9A  BCC $9FB1          row < 6 -> INC $58
 *   9F9C  LDA #$19 / ADC $58 / STA $58    row 6 -> += $1A (carry is set)
 *   9FA2  CMP #$80 / BCC rts
 *   9FA6  LDA #$00 / STA $58              wrapped
 *   9FAA  LDX #$54 / LDA #$80 / JMP $8402 $54/$55 += 128
 */
function advanceProgress(state) {
  const b = state.build;
  if ((b.prog & 7) < 6) { b.prog = u8(b.prog + 1); return; }
  b.prog = u8(b.prog + 0x1A);                 // $9F9C: #$19 + the CMP's carry
  if (b.prog < 0x80) return;                  // $9FA2
  b.prog = 0;                                 // $9FA6
  const lo = b.lo + 0x80;                     // $9FAA -> $8402
  b.lo = u8(lo);
  if (lo > 0xFF) b.hi = u8(b.hi + 1);
}

/**
 * Read the terrain collision map back, the way `$C3D3` does.
 *
 *   C3D3  LDA $A4 / CLC / ADC #$08 / ADC $3E / AND #$F8 / STA $A0
 *   C3DE  LDA $3F / ADC #$00 / AND #$01 / CLC / ADC #$05 / STA $A1
 *   C3E9  LDA $A5 / CLC / ADC #$14 / LSR/LSR/LSR / STA $A3
 *   C3F3  LSR / LSR / CLC / ADC $A0 / STA $A0
 *   C3FC  LDA ($A0),Y / STA $A2 / BEQ rts
 *   C402  LDA $A3 / AND #$03 / TAY
 *   C409  LDA $A2 / AND $C40F,Y            $C40F = 03 0C 30 C0
 *
 * Exactly the inverse of the write, verified two ways: a census of $A1 at
 * $C3FC found only pages $05/$06 over 35,531 reads, and filling the map with
 * $FF killed the ship on the first poked frame on a stretch of stage 1 with no
 * terrain at all -- so the map, not the scenery, is what kills you.
 *
 * Returns the 2-bit field: 0 = empty, 1 = solid on stage 1.
 */
export function probeCollision(state, screenX, screenY) {
  const worldLo = u8(u8(screenX + 8) + state.cam.lo);      // $C3D3-$C3DB
  const carry = (u8(screenX + 8) + state.cam.lo) > 0xFF ? 1 : 0;
  const a0 = worldLo & 0xF8;
  const page = u8(state.cam.hi + carry) & 1;               // $C3DE-$C3E6
  const tileRow = u8(screenY + 0x14) >> 3;                 // $C3E9
  const idx = ((page - 0) << 8) + u8(a0 + (tileRow >> 2)); // $C3F3
  const byte = state.coll[idx & 0x1FF];
  if (byte === 0) return 0;                                // $C400 BEQ
  const shift = (tileRow & 3) * 2;                         // $C402/$C409
  return (byte >> shift) & 3;
}

/**
 * The port's stand-in for the stage load. $9C24 calls the streamer four times
 * back to back and $8871 pushes a full-screen RLE image before that; NEITHER
 * has been measured, so this is NOT a translation of them -- it is the same
 * gate run to exhaustion, which fills the nametable ahead of the camera the
 * way the throttle in `streamBlock` would over the next ~84 frames.
 *
 * Labelled loudly because a reader has every right to ask which lines here are
 * the cartridge and which are the port, and this one is the port.
 */
export function preloadTerrain(state, stage, drain) {
  for (let i = 0; i < 4000 && streamBlock(state, stage); i++) drain(state);
}
