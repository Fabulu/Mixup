// Gradius (NES) -- the machine's RAM, as a plain JS object tree.
//
// Gradius has NO MAIN LOOP. RESET ends at $8067 with `JMP $8067`, an empty
// spin; everything runs inside the NMI handler at $806A. So there is no
// "update" and no "draw" -- there is one frame function, src/nmi.js, and this
// file is the state it reads and writes.
//
// Naming rule for this port: every field carries the RAM address it stands for
// in a comment, and the address is the primary name. Where the ROM keeps a
// 16-bit quantity in two bytes we keep the two bytes, because the ROM's
// arithmetic is 8-bit and WRAPS -- see player.js's `ADC #$02` at $A009, which
// is the reason a speed level of 255 makes the ship SLOWER, not faster.
//
// Evidence for every address below: NOTES-player.md 2, NOTES-terrain.md 1-5,
// NOTES-render.md 0-5, tools/oracle/PROBE.md 4.

/** unsigned 8-bit wrap */
export const u8 = (v) => v & 0xFF;
/** unsigned 16-bit wrap */
export const u16 = (v) => v & 0xFFFF;
/** signed 8-bit reinterpretation */
export const i8 = (v) => (v << 24) >> 24;

/**
 * Buttons, as the ROM's joypad reader leaves them in $0007 (held) and $0005
 * (pressed). MEASURED by A/B RAM diff, not by citing the NES standard order:
 * RIGHT $01, LEFT $02, DOWN $04, UP $08, START $10 (PROBE.md 4). Bit 7 is the
 * A button -- read at $A0FC (`AND #$80` on $05) and $A102 (on $07).
 *
 * Note the low nibble is *direction*, which is what makes `AND #$0F` at $A082
 * a single test for "is any direction held".
 */
export const BTN = {
  RIGHT: 0x01, LEFT: 0x02, DOWN: 0x04, UP: 0x08,
  START: 0x10, SELECT: 0x20, B: 0x40, A: 0x80,
};

/** Object slots on page $0300. Slot 0 = player, 1-2 = the Options. */
export const SLOTS = 32;

/** Ring length, from `CMP #$18` at $A08C. */
export const RING_LEN = 0x18;

/**
 * The mode-5 (stage play) constants the state machine needs. $00 is the game
 * mode; the dispatch is the Konami inline jump table at $80D1/$80D4.
 */
export const MODE_STAGE = 5;

export function createState() {
  return {
    // ---- the frame heartbeat ------------------------------------------
    // $04 is the FRAME LOCK. The NMI reads it at $8073 and bails outright if
    // it is non-zero, raises it at $809F and clears it at $80B5. A lag frame
    // on this machine therefore skips OAM DMA and the PPU register writes too
    // -- it is VISIBLE, unlike the Game Boy case (NOTES-lag.md).
    lock: 0,                 // $04
    frame: 0,                // $02   INC at $80BE, free-running
    lagFrames: 0,            // census, not a ROM byte

    mode: MODE_STAGE,        // $00   game mode; 5 = stage play
    substate: 0x80,          // $1B   mode-5 sub-state; see nmi.js on the gate
    // Three gates that were 0 on every frame ever measured here. They are
    // fields, not constants, because each one selects a path this port has
    // never seen run.
    //
    //   $5C >= 2  halves the player's update rate ($9A5E/$969A). Stage-5 only:
    //             $9650 only computes it when $19 == 4 (00-recon-flow.md 3).
    //   $15       PAUSE. $9ADA toggles it on a START edge; $9650's first branch
    //             then jumps the whole update to $9A8C.
    //   $5B       uncharacterised: eleven INC sites, three readers ($9A9C,
    //             $9ACA, $AEDD), 0 on every frame of every measured run.
    //
    // WHAT $15 AND $5B ACTUALLY DO, because this file said the wrong thing for
    // the port's whole life: they skip `JSR $98EE`, the CAMERA ADVANCE, and
    // nothing else. The ROM is
    //     9A98  A5 15     LDA $15
    //     9A9A  D0 07     BNE $9AA3    -- lands PAST the JSR, ON the split
    //     9A9C  A5 5B     LDA $5B
    //     9A9E  D0 03     BNE $9AA3
    //     9AA0  20 EE 98  JSR $98EE
    //     9AA3  AD 02 20  LDA $2002    -- the split, reached either way
    // so a paused frame still splits; it just does not scroll. That matches the
    // measurement from the other side: START at f450 froze $3E at 68 for 50
    // frames while the picture kept its two bands (00-recon-flow.md 8). What
    // suppresses the SPLIT is $9A88/$9A8C/$9A90/$9A94 -- see nmi.js.
    zp5C: 0,                 // $5C
    zp15: 0,                 // $15
    zp5B: 0,                 // $5B

    // ---- input --------------------------------------------------------
    // $81BF at $80A4 writes both. INPUT LEAD IS ZERO: the read happens at
    // $80A4 and the state machine at $80AA, in the SAME NMI, so a button
    // pressed on frame N moves the ship on frame N (NOTES-player.md 10).
    input: {
      held: 0,               // $0007  (P1; $0008 is P2, $18 selects)
      pressed: 0,            // $0005  (edge)
      prev: 0,               // the shift register the edge is computed from
    },

    // ---- zero page the player reads -----------------------------------
    zp: {
      speed: 0,              // $40  SPEED level; INC $40 at $89A1
      missile: 0,            // $41  missile flag
      // $44: 0 normal / 1 LASER / 2 DOUBLE. NOT "1 double / 2 laser", which is
      // what this said and what NOTES-player.md 9 said: $89BB (the meter's
      // DOUBLE arm) stores 2 and $89CF (LASER) stores 1, and forcing $44 on the
      // cartridge gives type $06 sub 0 at 0, type $07 sub 1 at 1, and TWO
      // simultaneous shots ($06 sub 0 + $24 sub 2) at 2 (00-recon-weapons.md 0).
      weapon: 0,             // $44
      options: 0,            // $45  Option count, capped at 2 by $89D3
      autofire: 20,          // $35  autofire reload, MEASURED 20
      player: 0,             // $18  current player index; 0 or 1. Measured 0
      step: 0,               // $99:$98  the 16-bit sub-pixel step, scratch
      tilt: 1,               // $9B  tilt code for THIS frame, latched by $A0BE
    },

    // ---- page $0300: four parallel arrays, $20 apart -------------------
    // Proven by $A285/$A297: ONE add/subtract subroutine services both axes,
    // selected by the 6502 Y register -- Y=0 is the vertical axis, Y=$40 the
    // horizontal one, and $40 is exactly the distance between the arrays.
    obj: {
      y: new Uint8Array(SLOTS),      // $0320+i  integer pixels
      yf: new Uint8Array(SLOTS),     // $0340+i  1/256 px
      x: new Uint8Array(SLOTS),      // $0360+i  integer pixels
      xf: new Uint8Array(SLOTS),     // $0380+i  1/256 px
      status: new Uint8Array(SLOTS), // $0100+i  1 = alive, >= 2 = dying/dead
      anim: new Uint8Array(SLOTS),   // $0120+i  metasprite id; 0 = not drawn
      timer: new Uint8Array(SLOTS),  // $0140+i  animation timer
      // $0180+i, OR'd into every OAM attribute byte at $8AE0. Read 0 for the
      // player on the captured frames, which is why its records' own $20/$21
      // reach OAM unchanged.
      attrMask: new Uint8Array(SLOTS),
    },

    // ---- the 24-entry position ring the Options trail through ---------
    ring: {
      cursor: 0,                     // $0160
      x: new Uint8Array(RING_LEN),   // $07A0-$07B7
      y: new Uint8Array(RING_LEN),   // $07C0-$07D7
    },

    // ---- the camera ----------------------------------------------------
    // $98EE adds #$80 to $3D per frame and carries into $3E/$3F through the
    // house 16-bit adder $8402. Base scroll is EXACTLY 1/2 px per frame:
    // measured, cam24 advanced by exactly $80 on all 3207 frames $98EE ran
    // (NOTES-terrain.md 1).
    cam: { sub: 0, lo: 0, hi: 0 },   // $3D / $3E / $3F

    // ---- the PPU shadows -----------------------------------------------
    // These are what $8281 pushes at the TOP of the NEXT NMI, which is why
    // the hardware scroll is always one frame behind $3E. $9A79 loads $12
    // from $3E during frame N; $8281 stores it during frame N+1. Measured
    // 3206/3206 for $12[N] == $3E[N-1], and only 1603/3206 for $3E[N].
    ppu: {
      ctrl: 0xA8,            // $10 -> $2000. $A8 = NT $2000, bg pat $0000,
                             //      spr pat $1000, sprites 8x16, NMI on
      mask: 0x1E,            // $11 -> $2001. bg+spr on, leftmost 8 px shown
      scrollX: 0,            // $12 -> $2005 (first write)
      scrollY: 0x0C,         // $13 -> $2005 (second). 12 during stage 1, $9650
      chrSel: 0,             // $2D  index into the CNROM table $8AA8
      blank: 0,              // $0D  blank-screen countdown, gates PPUMASK
      // Non-zero puts the live sprite-0 record at $0200 ($8B2F takes
      // $8B08+4 = CE 6D 23 F8); zero parks it off-screen at $F4. The split at
      // $9AA3 spins on that sprite's hit, so it is structural, not decoration.
      // DERIVED from $1E/$1F by $8B1A-$8B2B (src/oam.js), not stored by the ROM.
      spriteZeroOn: true,
    },

    // $1E and $1F, the sprite-0 pair. Both are REAL BYTES now (they used to be
    // the single boolean above, which could not express $9A8C/$9A90 and left
    // w_001E/w_001F permanently SKIPPED in the comparison). $8B1A-$8B2B writes
    // them both every frame from $1F alone:
    //   $1F == 0        -> $1E = 0, sprite 0 parked off-screen
    //   $1F == 1        -> $1F := 2, $1E = 0, LIVE record copied. One frame of
    //                      live sprite 0 with the split still suppressed --
    //                      the handover, and the only reason $1E is a separate
    //                      byte at all.
    //   $1F >= 2        -> $1E = 1, live record
    // MEASURED: $1E = 1 and $1F = 2 on all 3341 compared frames of all 16
    // scenarios; $1F steps 0 -> 1 -> 2 during the boot intro, which is outside
    // this corpus and is wave 4's business.
    zp1E: 1,                 // $1E
    zp1F: 2,                 // $1F

    // The registers as they were LATCHED for the frame just drawn. $8281's
    // write is what drew it; reading $12/$13/$10 at the $80B5 sample point
    // gives you the NEXT frame's scroll and a renderer one frame early
    // (NOTES-render.md 1). The renderer reads THIS, never `ppu`.
    bandA: { ctrl: 0xA8, mask: 0x1E, scrollX: 0, scrollY: 0x0C, chrBank: 0 },
    bandB: { ctrl: 0xA8, chrBank: 1, ran: false },

    // ---- VRAM ------------------------------------------------------------
    // The queue at $0700 with cursor $0E, drained by $8A51 from the NMI at
    // $8099. Exactly ONE routine writes the nametable during gameplay --
    // proven by a census of every $2007 write over 600 frames.
    vram: {
      queue: [],                     // [{addr, inc, bytes}] packets at $0700
      // $0E, the byte cursor into $0700. A real byte, not a derived one: the
      // gate at $9D87 (and $889A) compares it against 4, the producers advance
      // it by the WIRE length of what they append, and $8A7B zeroes it. The
      // port's queue is a list of packet objects, so the cursor is maintained
      // alongside it in src/vram.js rather than falling out of a $0700 image.
      cursor: 0,                     // $0E
      nt: new Uint8Array(0x1000),    // PPU $2000-$2FFF (vertical mirroring)
      pal: new Uint8Array(32),       // PPU $3F00-$3F1F
    },

    // ---- the terrain streamer -------------------------------------------
    build: {
      lo: 0,                 // $54  world X of the 128 px half-page being built
      hi: 0,                 // $55
      prog: 0,               // $58  = blockCol*32 + blockRow inside it
      // $3A: the STAGE-ADVANCE LATCH, not an uncharacterised flag. Written in
      // exactly three places -- $96D7 and $97E1 (STA $3A, A = 0, both stage
      // init) and $993D (INC $3A, in the stage-end block that also does INC $19
      // and $3F = 0). While it is up the streamer, the enemy spawner ($A2C0)
      // and $C42D/$C68A/$C6B1 all stand down. MEASURED 0 on 700 of 700 frames
      // of a boot-and-play run: it never rises during stage 1.
      gate: 0,               // $3A
      // $57: a RESULT flag, written by the streamer itself -- 0 at $9D90 on
      // every frame that passes the queue gate, INC'd at $9DAF when the 384 px
      // lead throttles the build. It used to be seeded and then frozen here,
      // which is why w_0057 is in the knownFail list.
      ahead: 0,              // $57
    },

    // The terrain collision map, $0500-$06FF. NOT a second table and NOT
    // precomputed: it is derived at $9F55 from the tile indices the streamer
    // has just queued, by thresholding. The ordering is observable -- the map
    // for a column exists only once that column has been queued.
    coll: new Uint8Array(0x200),     // $0500-$06FF

    // ---- sprites ----------------------------------------------------------
    // Shadow OAM at $0200-$02FF, DMA'd at $8087 at the TOP of the NMI, so the
    // list built during frame N reaches the PPU on frame N+1.
    shadowOam: new Uint8Array(256),  // $0200
    hwOam: new Uint8Array(256),      // what the PPU is actually showing
    oamCursor: 0,                    // $36  the -15-slot write cursor
    oamBase: 0,                      // $2F  rotated +$44 a frame -- the flicker

    // ---- work counters, not RAM -------------------------------------------
    // NOT a diagnostic side channel: NOTES-lag.md names "object slots processed
    // per frame" as the detector for lag model (C), partial completion of the
    // object loop, and says it must be carried as a COMPARED field. The four
    // numbers below are counted in the port's real loops (src/oam.js) and are
    // held against the cartridge's own execution counts, taken with exec hooks
    // on $8B4D / $8AAC / $8ACF / $8AF9 by tools/oracle/objloop.lua. They are
    // reset at the top of every display-list build.
    work: {
      slotsVisited: 0,     // $8B4D executions -- iterations of the 32-slot loop
      msExpanded: 0,       // $8AAC entries    -- metasprites expanded
      spriteRecords: 0,    // $8ACF executions -- 4-byte records considered
      spritesStored: 0,    // $8AF9 executions -- records that reached OAM
    },
  };
}
