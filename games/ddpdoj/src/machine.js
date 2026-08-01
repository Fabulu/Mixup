// The machine, and the addresses the port speaks in.
//
// EVERY NUMBER HERE IS MEASURED, and the worklog that measured it is named.
// Nothing in this file was derived by arithmetic on another platform's number.
//
// Build B = 2002.10.07 BLACK VER, the `$23xxxx/$24xxxx/$25-28xxxx` half of the
// ddpdojblk cartridge.  Build A = 2002.04.05 MASTER, the `$13xxxx` half.
// THE TWO SHARE THE RAM LAYOUT AND NOT ONE CODE ADDRESS.
//
// AND THE THING THAT WILL CATCH THE NEXT READER: on a VERSION-B run the
// INTERRUPT HANDLERS ARE BUILD A's.  `$801478` holds `$13BDBA` while the main
// loop is unambiguously build B.  Measured three ways in
// `docs/worklog/ddpdoj/02-review.md` (RAM vector at the sample point; write
// taps on each build's P1 mirror store -- A 2615 hits, B 0; a read census of
// `$803940` -- build B's `$23C44C/$23D10C/$23C46C` never read once), and
// re-measured for this wave.  So `ISR6` below is build A's chain and the
// main-loop addresses are build B's.  That is not a mistake in the table.

export const MACHINE = {
  set: 'ddpdojblk',
  build: 'B',
  // 15625/264 Hz exactly -- a set_raw derivation from pixclock 10 MHz /
  // (640 x 264), confirmed from -listxml and from the running machine to the
  // attosecond.  NOT 59.19, NOT the "~54 fps" of the first conversation.
  refreshHz: 15625 / 264,
  frameNs: 16896000,
  // 20 MHz 68000 / (15625/264 Hz).  The work budget's unit of account.
  cyclesPerFrame: 337920,
  ramBase: 0x800000,
  ramSize: 0x20000,
};

// ---------------------------------------------------------------- RAM
// Shared by both builds; derive.py re-confirms each one appears once in each
// build's address range.
export const RAM = {
  spriteList: 0x800000,      // ..$8009FF, 10 bytes/entry, DMA'd at vblank
  frameCounter: 0x80390a,    // ++ per MAIN LOOP ITERATION, not per vblank
  frameCounterCopy: 0x803910,// $23BEB2 move.w $80390A,$803910
  altPhase: 0x80390d,        // bchg #0
  mod3Phase: 0x80390e,       // ++ mod 3; READ BACK by the frame sync
  divCount1: 0x80392e,       // frame-sync divider countdowns
  divCount2: 0x803930,
  divGate3: 0x803936,
  semaphore: 0x803940,       // the vblank semaphore. THE SAMPLE POINT is the arm
  sem2: 0x803942,
  p1raw: 0x803970, p1edge: 0x803972, p1prev: 0x803974,
  p2raw: 0x803976, p2edge: 0x803978, p2prev: 0x80397a,
  rank: 0x80380c,            // operator rank, 0..3 (wave 2 item 7)
  objTable: 0x80e240,        // 20 slots x $50, $80E240..$80E87F
  objTableEnd: 0x80e880,
  player1: 0x8103e6,         // the player OBJECT RECORD base ($62 bytes)
  player2: 0x810448,
  p1Options: 0x8104aa,       // two $20-byte option records
  p2Options: 0x81050e,
};

// The player record's fields, all measured by disassembling $2491C0/$2494FA
// and cross-checked against the write map in `02-impl-object-driver...` §5.
// Offsets are from RAM.player1.
export const P = {
  state: 0x00,     // word. bit 5 = "horizontal input last frame" ($2495EA)
  flags1: 0x01,    // byte = low half of the state word. bit 7 gates $2496A2
  posY: 0x02,      // word, 1/64 px. THE long axis. clamp [$800, $6500]
  posX: 0x04,      // word, 1/64 px. THE short axis. clamp [$300, $3500]
  knock: 0x06,     // word, moved by the $2552EC ramp -- UNPORTED path
  animA: 0x0a,     // long, from $25533A[ship][tilt]  ($249E62)
  animB: 0x14,     // long, from $2553CA[0][tilt]     ($249E78)
  dirByte: 0x18,   // byte = low byte of $803970 (RAW held)
  btnByte: 0x19,   // byte = low byte of $803972 (EDGE)
  speedIdx: 0x1a,  // byte, index into the $200920 speed tables
  angle: 0x1b,     // byte, from the $2552DC direction table; $FF = no move
  dirLatch: 0x1d,
  laserFloor: 0x38,// byte, the index the laser ramp counts DOWN to
  baseSpeed: 0x39, // byte, the index $24951E restores
  hitTimer: 0x3a,
  invuln: 0x3e,    // byte; $FF = "hold"
  dead: 0x3f,
  velY: 0x30,      // word, THIS FRAME'S applied dY (clamps subtract from it)
  velX: 0x32,      // word, THIS FRAME'S applied dX
  tiltDelay: 0x4c, // word, counts 2 frames per tilt step
  tilt: 0x4e,      // word, [-$20,+$20] in steps of 4 -- the bank animation
  knockTimer: 0x46,
  lastVelX: 0x5c,
  shipSel: 0x58,   // word. MEASURED 0 for TYPE-A over the whole corpus
  playerIdx: 0x57,
  stride: 0x62,    // player2 - player1
};

// ---------------------------------------------------------------- code addresses
// Cited on the lines that implement them.  Kept in one place so a reviewer can
// check the port against `xref.py dasm <addr>` without hunting.
export const ROM = {
  // --- build B: the main loop (landmarks.json, derive.py, re-derived per run)
  loopHead: 0x23bfdc, loopTail: 0x23c006,
  counters: 0x23be8c,
  call1: 0x256d5a, objDriver: 0x2410bc, call3: 0x24683e, spriteBuild: 0x23d2ae,
  frameSync: 0x23c212, postVblank: 0x23d12a,
  syncSpin: 0x23c390, syncDiv2: 0x23c248, syncDiv3: 0x23c25c, syncTail: 0x23c272,
  // --- build A: THE INTERRUPT HANDLERS THAT ACTUALLY RUN ON A VERSION-B RUN
  isr6Vector: 0x13bdba,      // value of $801478, measured at the sample point
  isr6Body: 0x13c7d4,
  isr6Coin: 0x13cfba,        // jsr #1  -- UNPORTED
  isr6InputRead: 0x13d464,   // jsr #2  -- ported
  isr6InputGate: 0x13d478,   // tst.b $803940 / beq $13D488 -- the INNER (A) gate
  isr6InputGated: 0x15b980,  // ...what it skips -- UNPORTED
  isr6Third: 0x18acc0,       // jsr #3  -- UNPORTED
  isr6Gate: 0x13c7e6,        // THE (A) GATE, beq $13C80C
  isr6Gated: [0x141676, 0x140ffe, 0x141258, 0x185dc4],   // UNPORTED
  isr6Release: 0x13c806,     // subq.b #1,$803940
  isr6Tail: 0x13c4fc,        // UNPORTED
  // --- build B: the object driver
  objTableInit: 0x24107c, objAlloc: 0x241182, objAllocFail: 0x2411d4,
  objCommit: 0x24111e, objKill: 0x2411e2, objDispatch: 0x240f62,
  // --- build B: the player
  playerHandlerP1: 0x2491c0, playerHandlerP2: 0x249246,
  playerUpdate: 0x2494fa,
  playerDead: 0x24a130, playerFrozen: 0x24a3a2, playerBit4: 0x249f8a,
  playerMove: 0x2417de, moveVector: 0x241812,
  tiltDecay: 0x24a42a, wallHit: 0x261126,
  playerStore: 0x2496e8, playerTail: 0x249e4e,
  playerBomb: 0x2497aa, playerShot: 0x249b2c,
  laserRampDown: 0x24c8be, laserRampUp: 0x24c8e4,
};

// The clamps, read straight off the listing at $2495E2..$249698.  Written as
// the ROM writes them, in 1/64 px, with the pixel value in the comment -- the
// pixel value is a CONSEQUENCE, not the constant.
export const CLAMP = {
  yMax: 0x6500,   // $249670 cmpi.w #$6500,D2 / bls   -> 404.0 px
  yMin: 0x0800,   // $24968A cmpi.w #$800,D2  / bcc   ->  32.0 px
  xMin: 0x0300,   // $249608 cmpi.w #$300,D3  / bhi   ->  12.0 px
  xMax: 0x3500,   // $249648 cmpi.w #$3500,D3 / bcs   -> 212.0 px
};

// Direction bits inside the P1 MIRROR word $803970, measured (not assumed from
// MAME's port order -- the mirror is `not(ror.w #1, $C08000)`, so every bit
// moves).  Confirmed by driving each one and watching which clamp answered:
//   bit0 -> angle $00 -> +Y, answered by the $6500 clamp   (scenario lf2050)
//   bit1 -> angle $20 -> -Y, answered by the $800 clamp
//   bit2 -> angle $30 -> -X, answered by the $300 clamp
//   bit3 -> angle $10 -> +X, answered by the $3500 clamp
// and bit4/5/6 = buttons 1/2/3, bit15 = start (measured: 1P Start alone gives
// portin $FFFE and p1raw $8000).
export const BIT = { up: 0, down: 1, left: 2, right: 3, b1: 4, b2: 5, b3: 6, start: 15 };
