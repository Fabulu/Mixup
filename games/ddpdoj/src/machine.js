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
  // THE THREE DERIVED PHASE COUNTERS.  $23BEB2..$23BEE0 copies $80390A into
  // each of them and MASKS it -- mod 4, mod 8, mod 16.  Wave 4 stopped after
  // the first copy and never applied any mask (04-review.md 4, measured:
  // $803910 held 3501 where the board holds 1, and $803912/$803914 were never
  // written at all).  They are not decoration: `xref.py abs` finds 13 / 20 / 4
  // absolute-long readers of them in build B -- a LOWER BOUND, since
  // register-relative reads are invisible to that search -- at sites like
  // $252A7C, $25E54C, $26A3DE, $27EE68, $28000C, $26FAC2, which is the shape of
  // stage and enemy scripts keyed on a frame phase.  Wave 5 needs them right.
  frameCounterMod4: 0x803910, // $23BEB2 move.w $80390A,_ / $23BEBC andi.w #$3
  frameCounterMod8: 0x803912, // $23BEC4 move.w $80390A,_ / $23BECE andi.w #$7
  frameCounterMod16: 0x803914,// $23BED6 move.w $80390A,_ / $23BEE0 andi.w #$f
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
  animA: 0x0a,     // long, from $25533A[ship][tilt]  ($249E62). It is hardware
                   // words 2 and 3 of the ship's sprite record -- the IMAGE.
                   // MEASURED: $25533A[0] = $255362 and the 17 tilt entries are
                   // $1200,$1264,...,$1840 in steps of $64. THIS is what makes
                   // the ship BANK.
  size: 0x0e,      // word, hardware word 4 (width bits 14..9, height bits 8..0).
                   // MEASURED $0620 = 3x32 on the P1 ship over fly-around
  flipColour: 0x1c,// word; its TWO BYTES ARE OR-ED at emit into word 2's high
                   // byte (spritequeue.js §the seven-field spec). MEASURED 0
  offLong: 0x06,   // word added to posY before the shift ($23F118 lea ($2,A6),A1
  offShort: 0x08,  // then three `add.w (A1)+`). MEASURED $FA00 / $FC00 on the
                   // P1 ship, constant over all 2,233 drawn frames of fly-around

  // THE HITBOX, and it is NOT ANIMATION.  10-recon-combat §3 corrected three
  // waves of reading: `$2459D0` builds the player's box from ($10,A4)/($12,A4)
  // on the long axis and ($14,A4)/($16,A4) on the short axis, so the LONG at
  // +$14 that $249E78 writes from `$2553CA[0][tilt]` = `$2553F2` is the ship's
  // X HALF-EXTENTS, tilt-indexed.  Wave 4 called it `animB` and the port has
  // been writing the hitbox under an animation's name ever since.
  //
  // MEASURED, from the ROM, all 17 tilt entries of $2553F2 (+X / -X):
  //   -32 0000/0080  -16 0040/0080  0 0080/0080  +16 0080/0040  +32 0080/0000
  // and build A's $1549AE holds $00C0 where build B holds $0080 -- Black
  // Label's horizontal hitbox is exactly 2/3 of the original's, 4 px vs 6 px.
  hitYPlus: 0x10,  // $2459D6 add.w ($10,A4),D0   MEASURED $0080, constant
  hitYMinus: 0x12, // $2459DA sub.w ($12,A4),D1   MEASURED $0100, constant
  hitXPlus: 0x14,  // $2459E4 add.w ($14,A4),D2 } the LONG $249E78 writes,
  hitXMinus: 0x16, // $2459E8 sub.w ($16,A4),D3 } indexed by the tilt ($4e,A6)
  dirByte: 0x18,   // byte = low byte of $803970 (RAW held)
  btnByte: 0x19,   // byte = low byte of $803972 (EDGE)
  speedIdx: 0x1a,  // byte, index into the $200920 speed tables
  angle: 0x1b,     // byte, from the $2552DC direction table; $FF = no move
  dirLatch: 0x1d,
  laserFloor: 0x38,// byte, the index the laser ramp counts DOWN to ($24C8C2)
  baseSpeed: 0x39, // byte, the index $24951E restores, and the ceiling the
                   // option object's ramp-up stops at ($24C8FA cmp.b ($39,A4))
  auraPhase: 0x28, // word, $24A4B6/$24A4D4: the index into $25567A, stepping
                   // -4 per DRAWN frame and reloading at $3C
  glowPhase: 0x48, // word, $24A58A/$24A626: the index into $2556E2's per-tilt
                   // table, stepping -4 and reloading at 4
  shadowBias: 0x5e,// word, $24A616 `sub.w ($5e,A6),D1`. MEASURED 0
  optFormation: 0x5a, // word, the option FORMATION. MEASURED 2 for the whole
                   // corpus; $24C34C and $24C0D6 both index tables with
                   // (($5a,A4)-2)*2, so only EVEN formations land on an entry
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

// THE OPTION RECORD -- `$8104AA` for P1, `$81050E` for P2, and it is $64 BYTES,
// not $20.  MEASURED from `$24C0B0 lea $81050E,A6` minus `$24C096 lea $8104AA,A6`
// = 100 bytes, and confirmed by the copy at `$24C0E8..$24C116`, which fills
// +$06..+$21 (7 longs), SKIPS +$22..+$25 (`$24C0F6 addq.w #4,A1`), fills
// +$26..+$61 (15 longs) and +$62..+$63 (1 word) -- exactly $64 bytes.
//
// The first $20 bytes are POD 0's sprite record and the next $20 are POD 1's:
// `$24C3CC bsr $24D12E / $24C3D0 lea ($20,A6),A6 / $24C3D4 bsr $24D12E`.  Both
// are the seven-field object-record shape `spritequeue.js` pins.  The control
// block starts at +$40.
export const OPT = {
  stride: 0x64,
  pod: 0x20,          // pod 1's sub-record base
  state: 0x00,        // word; bit 15 = live ($24C0AA tst.w (A6) / bmi)
  flags1: 0x01,       // byte = the state word's low half; bit 0 = "initialised"
                      // ($24C0C8 bset #0,($1,A6)), bit 2 = THE LASER LATCH
                      // ($24C1A8), bit 3/4 = the fire handshake ($24C498/$24C4A0)
  posY: 0x02, posX: 0x04,
  offLong: 0x06, offShort: 0x08,   // MEASURED $FC00 / $FE00 on both pods
  anim: 0x0a,         // long -> hardware words 2,3. MEASURED $00003B08
  size: 0x0e,         // MEASURED $0410 = 2x16, both pods
  speedIdx: 0x1a,     // byte, read by $24D132 -- MEASURED $E0 = 224
  angle: 0x1b,        // byte, `and.b ($1b,A6),D1` with D1 = $3F ($24D136).
                      // MEASURED $10 (pod 0, +X) and $30 (pod 1, -X)
  flipColour: 0x1c,   // word; pod 0 MEASURED $0000, pod 1 $4000 (the X flip)
  posY2: 0x22,        // $24C342 `move.l D0,($22,A6)` -- pod 1's position, written
                      // by the SAME instruction pair as pod 0's
  raw: 0x40,          // byte, `$24C134 move.b ($18,A4),($40,A6)` -- THE PLAYER'S
                      // RAW HELD INPUT, copied into the option record
  edge: 0x41,         // byte, `$24C13A move.b ($19,A4),($41,A6)` -- the EDGE
  animDelay: 0x42,    // byte, `$24C390 subq.b #1,($42,A6)`
  animReload: 0x43,   // byte, `$24C396 move.b ($43,A6),($42,A6)`
  animIdx: 0x44,      // word, `$24C39C`, stepping -4 and reloading from ($4c,A6)
  animTable: 0x46,    // long, the pointer $24C3A0 reads
  animIdxReload: 0x4c,// word, `$24C3C6 move.b/move.w ($4c,A6),($44,A6)`
  reloadCount: 0x4b,  // byte, the laser ramp's own counter ($24C8C8)
  shadowTable: 0x58,  // long, the pointer $24C3B0 reads
  shadow0: 0x5c,      // long -> the shadow's hardware words 2,3 for pod 0
  shadow1: 0x60,      // long -> ...and for pod 1
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
  // --- build B: WAVE 12, the ship's own sprite block and the option object
  shipDrawP1: 0x24a440, shipDrawP2: 0x24a44c,   // type-5 calls #16 and #17
  shipDrawAltP1: 0x24a458, shipDrawAltP2: 0x24a46c, // ...calls #14 and #15
  shipDraw: 0x24a482,          // the body both entries branch into
  shipKnocked: 0x24a4e2,       // ($1,A6) bit 7 -- the OTHER aura block
  shipBit8: 0x24a6b4,          // ($0,A6) bit 8 -- the script-driven draw
  shipClear60: 0x25370a,       // clr.w ($60,A4)
  shipShadow: 0x249ea0,        // the ground-plane shadow, into bucket 5
  optionObject: 0x24c096,
  optionTemplates: 0x24bbaa,
  optionLaser: 0x24c180,       // THE LASER -- W24
  optionNoLaser: 0x24c29e,
  optionFormation2: 0x24c390,
  // WAVE 12.5 -- the tail EVERY exit of formation 2 falls into (12-review F2).
  optionFireHandshake: 0x24c476,
  optionSpawn: 0x24d480,       // THE PODS' SHOT SPAWN -- W20
  optionPodMove: 0x24d12e,
  optionPodShadow: 0x24c406,
  protSet: 0x246d04, protSum: 0x246ea4, protRead: 0x246cac,
  // The four register-convention enqueues wave 12 needs, by bucket.
  enqB5: 0x23efc0, enqB5Saved: 0x23efee,
  enqB19rec: 0x23f104, enqB19reg: 0x23f1fa,
  enqB15rec: 0x23f2ca,
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
