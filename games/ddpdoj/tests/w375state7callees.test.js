// W375 -- THE THREE CALLEES OF `$25D560`, the state-7 handler slots [17] and [9] share.
//
//   $260A9A   28 B   $260A9A..$260AB5   the ANNOUNCE, through rank.js's announcePost
//   $25F456  218 B   $25F456..$25F52F   the two player-record writers
//   $26070C  124 B   $26070C..$260786   the one-shot handoff into $25D990
//
// The five front-end slots are registered in main.js's defaultHandlers as of this wave, so every
// one of these runs for real. Everything below is DRIVEN against a real `Ram`; the ROM-byte
// assertions are there to pin the DECISIONS (which operand is the immediate, where a `beq` lands,
// what a table's far end is) and never to stand in for running the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

const A5 = 0x812800;

async function fx() {
  const mod = await import('../src/objslot17.js');
  const rank = await import('../src/rank.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const notes = [];
  const sounds = [];
  const ctx = { unported: { note: (addr, what) => notes.push({ addr, what }) },
    unportedLog: { note: () => {} }, tx: new TxVram(), soundPost: (a) => sounds.push(a) };
  return { ...mod, rank, ram: new Ram(), rom, ctx, notes, sounds, a5: A5 };
}

/** The seven tail draws, stubbed. `phase7_25D560` files a note per MISSING one, so they are
 *  supplied even where the test does not care about them. */
function spy() {
  const calls = [];
  const draws = {};
  for (const name of ['draw25E220', 'draw25E29E', 'draw25E4D0', 'draw25E6CE', 'draw25E824',
    'draw25EF30', 'draw25F074']) {
    draws[name] = (ram, rom, ctx, a6, d7) => calls.push({ name, d7 });
  }
  return { calls, draws };
}

const frameStart = (ram) => ram.setU8(A5 + 0x03, 0);        // $25CEC8, once a frame
const notesAt = (notes, addr) => notes.filter((n) => n.addr === addr);

// =================================================================================================
// 1. `$260A9A` -- THE ANNOUNCE, AND IT FIRES ON THE OPPOSITE SIDE
// =================================================================================================

test('W375 $260A9A: every byte of the call site matches rank.js announcePost { state: 4, guard }',
  { skip: SKIP }, async () => {
    const { rom, rank } = await fx();

    // $260A9A move.l A4,-(SP) / $260A9C bsr.s $260A20.  `$61` is BSR; `$60` would be BRA and
    // `$62..$6F` conditionals, and misreading the size field is what makes a `bsr` look like a
    // gate. $260A9E + (-$7E) == $260A20.
    assert.equal(rom.u16(0x260a9a), 0x2f0c, '$260A9A move.l A4,-(SP)');
    assert.equal(rom.u16(0x260a9c), 0x6182, '$260A9C bsr.s -- $61, not a conditional');
    assert.equal(0x260a9e - 0x7e, 0x260a20, '  ...and it reaches $260A20');

    // $260A20: lea $813162,A4 / tst.b D0 / beq $260A32 / lea $813166,A4.  D0 ZERO keeps the FIRST.
    assert.equal(rom.u32(0x260a22), 0x00813162, '$260A20 lea $813162,A4');
    assert.equal(rom.u32(0x260a2e), 0x00813166, '$260A2C lea $813166,A4 when D0 is non-zero');
    assert.equal(rank.announceBox260A20(0), 0x813162, 'rank.js: side 0 is $813162');
    assert.equal(rank.announceBox260A20(1), 0x813166, '  ...and side 1 is $813166');

    // $260A9E cmpi.w #$4,($2,A4). THE IMMEDIATE COMES BEFORE THE DISPLACEMENT: `0C6C 0004 0002`.
    // Read the other way round it is `cmpi.w #$2,($4,A4)` and the guard tests the wrong field.
    assert.equal(rom.u16(0x260a9e), 0x0c6c, '$260A9E cmpi.w #imm,(d16,A4)');
    assert.equal(rom.u16(0x260aa0), 0x0004, '  ...immediate $0004 FIRST');
    assert.equal(rom.u16(0x260aa2), 0x0002, '  ...displacement $0002 SECOND');

    // $260AA4 beq.w. EA is the EXTENSION WORD's address plus the displacement: $260AA6 + $C.
    // $260AA8 + $C would be $260AB4, the `rts`, and THAT is the arithmetic behind the withdrawn
    // "leaked A4" claim. It lands on $260AB2, which IS the `movea.l (SP)+,A4`.
    assert.equal(rom.u16(0x260aa4), 0x6700, '$260AA4 beq.w');
    assert.equal(0x260aa6 + rom.u16(0x260aa6), 0x260ab2, '  ...lands on $260AB2');
    assert.equal(rom.u16(0x260ab2), 0x285f, '$260AB2 movea.l (SP)+,A4 -- the pop, so BALANCED');
    assert.equal(rom.u16(0x260ab4), 0x4e75, '$260AB4 rts -- $260A9A..$260AB5 is 28 bytes');

    // The two writes are WORDS, both of them.
    assert.equal(rom.u16(0x260aa8), 0x38bc, '$260AA8 move.w #imm,(A4)');
    assert.equal(rom.u16(0x260aaa), 0x0001, '  ...(A4) = 1');
    assert.equal(rom.u16(0x260aac), 0x397c, '$260AAC move.w #imm,(d16,A4)');
    assert.equal(rom.u16(0x260aae), 0x0004, '  ...($2,A4) = 4, immediate first');
    assert.equal(rom.u16(0x260ab0), 0x0002, '  ...displacement second');
  });

test('W375 $260A9A: guard: (A4)=1 and ($2,A4)=4 only when ($2,A4) is not already 4',
  { skip: SKIP }, async () => {
    const { rank, ram } = await fx();

    // Not yet at state 4 -> BOTH words written, and the return is the `bne` arm.
    ram.setU16(0x813162, 0x1234);
    ram.setU16(0x813164, 0x0003);
    assert.equal(rank.announcePost(ram, 0x260a9a, 0), true, '$260A9E bne -> the writes happen');
    assert.equal(ram.u16(0x813162), 1, '$260AA8 move.w #$1,(A4)');
    assert.equal(ram.u16(0x813164), 4, '$260AAC move.w #$4,($2,A4)');

    // ALREADY at state 4 -> $260AA4 beq skips straight to the pop. Neither word moves.
    ram.setU16(0x813162, 0x1234);
    assert.equal(rank.announcePost(ram, 0x260a9a, 0), false, '$260AA4 beq -> nothing written');
    assert.equal(ram.u16(0x813162), 0x1234, '  ...(A4) untouched, which is the whole point of the '
      + 'guard: re-posting restarts the consumer from its first cell');
    assert.equal(ram.u16(0x813164), 4, '  ...and ($2,A4) still 4');

    // Word writes, not byte: $260AA8 sets BOTH $813162 and $813163.
    ram.setU16(0x813162, 0xffff);
    ram.setU16(0x813164, 0);
    rank.announcePost(ram, 0x260a9a, 0);
    assert.equal(ram.u8(0x813162), 0x00, 'a word literal is TWO byte fields -- high byte $00');
    assert.equal(ram.u8(0x813163), 0x01, '  ...and low byte $01');
  });

test('W375 $260A9A fires on the side OPPOSITE the record that reached the rendezvous',
  { skip: SKIP }, async () => {
    // $25D5A0 bsr $25D4E4 -> this record's side, then $25D5A4 addq.w #1 / $25D5A6 andi.w #$1
    // INVERTS it. Record 0 walks with D7 = 1 (the `dbra` counts DOWN) and is side 0, so its
    // announcement goes to side 1's mailbox at $813166 and NOT to $813162.
    for (const [rec, d7, side, fired, quiet] of [[0, 1, 0, 0x813166, 0x813162],
      [1, 0, 1, 0x813162, 0x813166]]) {
      const { phase7_25D560, sideFromD7_25D4E4, HANDLER7: H, SCREEN17, ram, rom, ctx,
        a5 } = await fx();
      assert.equal(sideFromD7_25D4E4(d7), side, `record ${rec} is side ${side}`);

      const a6 = SCREEN17.recs + rec * SCREEN17.recStride;
      const a0 = SCREEN17.recs + (1 - rec) * SCREEN17.recStride;
      ram.setU8(a0 + H.liveAt, 1);                           // $25D584 tst.b (A0)
      ram.setU8(a0 + H.rendezvousAt, H.rendezvous);          // $25D588 -- the other side IS at 7
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, d7, spy().draws);

      assert.equal(ram.u16(fired), 1, `record ${rec}: $${fired.toString(16).toUpperCase()} posted`);
      assert.equal(ram.u16(fired + 2), 4, '  ...with state $4');
      assert.equal(ram.u16(quiet), 0,
        `  ...and $${quiet.toString(16).toUpperCase()}, its OWN side, was NOT touched`);
      assert.equal(ram.u16(a6 + H.announceLatch), 1, '$25D59A latched ($5E,A6) so it is once-only');
    }
  });

test('W375 $260A9A goes through rank.js rather than a second copy, and is never noted',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, notes, a5 } = await fx();
    const a6 = SCREEN17.recs;
    ram.setU8(a6 + H.otherRec + H.liveAt, 1);
    ram.setU8(a6 + H.otherRec + H.rendezvousAt, H.rendezvous);
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, spy().draws);
    assert.deepEqual(notesAt(notes, 0x260a9a), [], '$260A9A is a call, not a note');
    assert.deepEqual(notesAt(notes, 0x260a20), [], '  ...and so is $260A20');
  });

// =================================================================================================
// 2. `$25F456` -- THE TWO PLAYER RECORDS
// =================================================================================================

test('W375 $25F456: the ROM pins a stride of FOUR and a table of exactly three entries',
  { skip: SKIP }, async () => {
    const { rom, PLAYERREC_25F456: P } = await fx();

    assert.equal(rom.u32(0x25f456), 0x48e7fffe, '$25F456 movem.l d0-d7/a0-a6,-(SP)');
    assert.equal(rom.u32(0x25f52a), 0x4cdf7fff, '$25F52A movem.l (SP)+,d0-d7/a0-a6 -- so NOTHING '
      + 'the caller held is clobbered');
    assert.equal(rom.u16(0x25f52e), 0x4e75, '$25F52E rts -- $25F456..$25F52F is 218 bytes');
    assert.equal(P.bytes, 218, '  ...and the port carries that extent');

    // $25F45A moveq #0,D0 / $25F45C move.b ($4,A5),D0 / $25F460 bmi.b -- a BYTE test of bit 7.
    assert.equal(rom.u16(0x25f45c), 0x102d, '$25F45C move.b (d16,A5),D0');
    assert.equal(rom.u16(0x25f45e), 0x0004, '  ...($4,A5)');
    assert.equal(rom.u16(0x25f4c4), 0x102d, '$25F4C4 move.b (d16,A5),D0');
    assert.equal(rom.u16(0x25f4c6), 0x0005, '  ...($5,A5) -- the mirrored block');
    assert.equal(rom.u8(0x25f460), 0x6b, '$25F460 bmi.b -- the only bound the routine states');

    // subq.w #2 then add.w D0,D0 TWICE. `$5540` is subq.w #$2,D0; `$532E` would be a subq.b on
    // (d16,A5) and `$536E` a subq.w -- different opcodes entirely.
    assert.equal(rom.u16(0x25f462), 0x5540, '$25F462 subq.w #$2,D0');
    assert.equal(rom.u16(0x25f464), 0xd040, '$25F464 add.w D0,D0');
    assert.equal(rom.u16(0x25f466), 0xd040, '$25F466 add.w D0,D0 -- so the stride is FOUR');
    assert.equal(P.ptrStride, 4, '  ...and the port uses four, not eight');

    // `lea (d16,PC),A0`: EA is the EXTENSION WORD's address plus the displacement. Using the
    // INSTRUCTION address puts both of these 4 bytes early, at $25F864.
    assert.equal(rom.u16(0x25f468), 0x41fa, '$25F468 lea (d16,PC),A0');
    assert.equal(0x25f46a + rom.u16(0x25f46a), P.ptrTable, '  ...$25F46A + $3FE == $25F868');
    assert.equal(0x25f4d2 + rom.u16(0x25f4d2), P.ptrTable, '$25F4D0 reaches the SAME table');
    assert.equal(0x25f4a4 + rom.u16(0x25f4a4), P.wordTable, '$25F4A2 + $31E == $25F7C2');
    assert.equal(0x25f50c + rom.u16(0x25f50c), P.wordTable, '$25F50A reaches the SAME words');

    // THE DOMAIN, from object [11]'s y table -- three words, $25D98A..$25D98F, and $25D990 is the
    // `move.b #$FF,$813008` that pins that window. It is {2,4,6}, so (sel-2)*4 is {0,8,$10} and
    // the $25F868 table is three EIGHT-byte entries reached by a FOUR-byte stride.
    assert.deepEqual([0, 2, 4].map((i) => rom.u16(0x25d98a + i)), [2, 4, 6],
      '$25D98A holds $0002 $0004 $0006 -- the three ship selections');
    assert.equal(rom.u32(0x25d990), 0x13fc00ff, '$25D990 is CODE, which is what bounds that table');

    // ...and the pointer table's far end is its OWN first payload, the same argument $260B6A's
    // four longwords are bounded by.
    assert.equal(rom.u32(P.ptrTable), 0x0025f880, 'entry 0 points at $25F880');
    assert.equal(P.ptrTable + P.ptrBytes, 0x25f880, '  ...which is $25F868 + $18, the far end');
    assert.deepEqual([0, 8, 0x10].map((o) => rom.u32(P.ptrTable + o)),
      [0x0025f880, 0x0025f8a8, 0x0025f8d0], 'three payload pointers at a $28 stride');
    assert.deepEqual([4, 0x0c, 0x14].map((o) => rom.u32(P.ptrTable + o)),
      [0x00224278, 0x00224238, 0x002241f8], '  ...each paired with a $22xxxx one');

    // $25F7C2 is read exactly three times, by three `move.w (A0)+`, and nothing else reads it.
    assert.equal(rom.u16(0x25f4a8), 0x3358, '$25F4A8 move.w (A0)+,(d16,A1)');
    assert.equal(rom.u16(0x25f4ac), 0x3358, '$25F4AC move.w (A0)+,(d16,A1)');
    assert.equal(rom.u16(0x25f4b0), 0x3018, '$25F4B0 move.w (A0)+,D0 -- the third and last');
    assert.equal(P.wordBytes, 6, '  ...so the window is SIX bytes');
  });

test('W375 $25F456 writes both player records, mirrored at a $24 stride', { skip: SKIP },
  async () => {
    const { playerRecords25F456, PLAYERREC_25F456: P, ram, rom, a5 } = await fx();
    ram.setU8(a5 + 0x04, 2);                                 // P1 picked selection 2
    ram.setU8(a5 + 0x05, 6);                                 // P2 picked selection 6
    playerRecords25F456(ram, rom, a5);

    assert.equal(P.sides[1].base - P.sides[0].base, 0x24,
      'the two records are $24 apart -- $25FF7A\'s `lea ($24,A6),A6` walks that same stride');

    // P1, from entry 0 at offset (2-2)*4 == 0.
    assert.equal(ram.u32(0x813040), 0x0025f880, '$25F470 move.l (A0)+,$813040');
    assert.equal(ram.u32(0x813036), 0x00224278, '$25F476 move.l (A0)+,$813036');
    assert.equal(ram.u8(0x813028) & 1, 1, '$25F47C bset.b #$0,$813028');
    assert.equal(ram.u16(0x81303a), 0x0017, '$25F484 move.w #$17,$81303A');
    assert.equal(ram.u16(0x81302c), 0x5e00, '$25F48C move.w #$5E00,$81302C');
    assert.equal(ram.u16(0x81302e), 0x1c00, '$25F494 move.w #$1C00,$81302E');
    assert.equal(ram.u16(0x81302a), rom.u16(0x25f7c2), '$25F4A8 -> ($2,A1)');
    assert.equal(ram.u16(0x81303c), rom.u16(0x25f7c4), '$25F4AC -> ($14,A1)');
    for (const off of P.fW2) {
      assert.equal(ram.u16(0x813028 + off), rom.u16(0x25f7c6),
        `$25F7C6's word went to ($${off.toString(16).toUpperCase()},A1)`);
    }

    // P2, from entry 2 at offset (6-2)*4 == $10 -- and its TWO different constants.
    assert.equal(ram.u32(0x813064), 0x0025f8d0, '$25F4D8 move.l (A0)+,$813064');
    assert.equal(ram.u32(0x81305a), 0x002241f8, '$25F4DE move.l (A0)+,$81305A');
    assert.equal(ram.u8(0x81304c) & 1, 1, '$25F4E4 bset.b #$0,$81304C');
    assert.equal(ram.u16(0x81305e), 0x0018, '$25F4EC move.w #$18 -- NOT $17; the mirrors differ');
    assert.equal(ram.u16(0x813050), 0x1200, '$25F4F4 move.w #$1200 -- NOT $5E00');
    assert.equal(ram.u16(0x813052), 0x1c00, '$25F4FC move.w #$1C00 -- this one IS the same');
    assert.equal(ram.u16(0x81304e), rom.u16(0x25f7c2), '$25F510 -> ($2,A1)');
    assert.equal(ram.u16(0x813060), rom.u16(0x25f7c4), '$25F514 -> ($14,A1)');

    // A stride of EIGHT -- the reading the table's shape invites -- would send P2 off the end.
    assert.notEqual(rom.u32(P.ptrTable + (6 - 2) * 8), ram.u32(0x813064),
      'a stride of eight reads $25F888, which is payload and not a pointer');
  });

test('W375 $25F456 reads ($4,A5)/($5,A5) and NOTHING else: D0..D4, A0 and A6 are ignored',
  { skip: SKIP }, async () => {
    const { playerRecords25F456, ram, rom, a5 } = await fx();
    assert.equal(playerRecords25F456.length, 3,
      'the port takes (ram, rom, a5) -- there is no register argument to get wrong');

    const run = (poison) => {
      const { Ram } = ram.constructor === Object ? {} : { Ram: ram.constructor };
      const r = new Ram();
      r.setU8(a5 + 0x04, 2);
      r.setU8(a5 + 0x05, 4);
      // Garbage into every byte the caller's D0..D4 come from ($8/$9/$6/$7,A5) and into the two
      // records themselves, so a port that carried a register in would show it.
      for (const off of [0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]) r.setU8(a5 + off, poison);
      playerRecords25F456(r, rom, a5);
      const out = [];
      for (let a = 0x813028; a < 0x813070; a += 2) out.push(r.u16(a));
      return out;
    };
    assert.deepEqual(run(0x00), run(0xa5), 'both records are byte-for-byte identical whatever '
      + '($6,A5)..($B,A5) hold -- the four moveq/move.b at $25D648 are $26070C\'s, not this one\'s');
    assert.notDeepEqual(run(0x00), new Array(0x24).fill(0), '  ...and it did write something');
  });

test('W375 $25F456: a negative selection byte skips that side entirely', { skip: SKIP },
  async () => {
    const { playerRecords25F456, ram, rom, a5 } = await fx();
    ram.setU8(a5 + 0x04, 0xff);                              // state 0's $25CCCC seed
    ram.setU8(a5 + 0x05, 4);
    playerRecords25F456(ram, rom, a5);
    assert.equal(ram.u32(0x813040), 0, '$25F460 bmi -> P1\'s whole block skipped');
    assert.equal(ram.u8(0x813028) & 1, 0, '  ...including the bset');
    assert.equal(ram.u32(0x813064), 0x0025f8a8, 'and P2, selection 4, still ran at offset $8');
    assert.equal(ram.u8(0x81304c) & 1, 1, '  ...including its bset');
  });

test('W375 $25F456 runs from $25D668, inside the once-only $25D630 bset', { skip: SKIP },
  async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, notes, a5 } = await fx();
    const a6 = SCREEN17.recs;
    ram.setU8(a6 + H.otherRec + H.liveAt, 1);
    ram.setU8(a6 + H.otherRec + H.rendezvousAt, H.rendezvous);
    ram.setU16(a6 + H.rampE.openAt, 0x0300);                 // open $25D61A so $25D630 is reached
    ram.setU8(a5 + 0x04, 2);
    ram.setU8(a5 + 0x05, 6);
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, spy().draws);

    assert.equal(ram.u32(0x813040), 0x0025f880, '$25D668 jsr $25F456 really ran');
    assert.equal(ram.u32(0x813064), 0x0025f8d0, '  ...both sides of it');
    assert.deepEqual(notesAt(notes, 0x25f456), [], '$25F456 is a call now, not a note');
    assert.deepEqual(notesAt(notes, 0x26070c), [], '  ...and so is $26070C');
  });

// =================================================================================================
// 3. `$26070C` -- THE ONE-SHOT HANDOFF
// =================================================================================================

/** Runs `$26070C` with the request flag armed and a spy in place of `$25D990`. */
async function armed(f) {
  const g = await fx();
  g.ram.setU16(g.HANDOFF_26070C.once, 1);                    // $260710 tst.w -> non-zero
  const seen = [];
  g.save = (ram, rom, ...regs) => seen.push(regs);
  g.seen = seen;
  if (f) f(g);
  return g;
}

test('W375 $26070C: D1 and D2 arrive at $25D990 SWAPPED', { skip: SKIP }, async () => {
  const { handoff26070C, HANDOFF_26070C: K, ram, rom, ctx, save, seen } = await armed();

  // The caller's four bytes: ($8,A5), ($4,A5), ($9,A5), ($5,A5) -- P1's (style, ship) then P2's.
  const [d0, d1, d2, d3, d4] = [0x11, 0x22, 0x33, 0x44, 0x55];
  handoff26070C(ram, rom, ctx, d0, d1, d2, d3, d4, save);

  assert.equal(seen.length, 1, '$260756 jsr $25D990 fired once');
  assert.deepEqual(seen[0], [d0, d2, d1, d3],
    '$26073E..$260750 read $813084/$813086/$813088/$81308A -- D1 and D2 come back CROSSED');
  assert.notDeepEqual(seen[0], [d0, d1, d2, d3],
    'a port that passes them straight through must FAIL here');

  // ...and the storage order really is the crossed one.
  assert.equal(ram.u16(K.slotD0), d0, '$260720 D0 -> $813084');
  assert.equal(ram.u16(K.slotD1), d1, '$260726 D1 -> $813088  (not $813086)');
  assert.equal(ram.u16(K.slotD2), d2, '$26072C D2 -> $813086  (not $813088)');
  assert.equal(ram.u16(K.slotD3), d3, '$260732 D3 -> $81308A');
  // W379: `$813080` IS NO LONGER READABLE AFTER THE CALL, and that is the cartridge, not a
  // regression. `$260738` still writes D4 there -- the two ROM assertions below and the D6
  // re-read test prove it -- but `$26077E bsr.w $260580` now RUNS, and `$26055C move.w #$0,
  // $813080` inside `$26051A` clears the word whenever `$260542 tst.w` finds it non-zero. So the
  // observable end state for a non-zero D4 is 0. This assertion used to read the value because
  // nothing downstream consumed it; something does now.
  assert.equal(ram.u16(K.slotD4), 0,
    '$260738 D4 -> $813080, and then $26055C clears it: $260542 tst.w saw the $55');
  assert.equal(rom.u32(0x260726 + 2), 0x00813088, '$260726 move.w D1,$813088');
  assert.equal(rom.u32(0x26072c + 2), 0x00813086, '$26072C move.w D2,$813086');
  assert.equal(rom.u32(0x260744 + 2), 0x00813086, '$260744 move.w $813086,D1');
  assert.equal(rom.u32(0x26074a + 2), 0x00813088, '$26074A move.w $813088,D2');
});

test('W375 the swap is what makes $25D990 pair per-player', { skip: SKIP }, async () => {
  // $25D990 takes (D0,D2) for side 0 and (D1,D3) for side 1 -- STRIDED, not adjacent. Feed it the
  // caller's registers unswapped and side 0 gets P1's style against P2's style.
  const { handoff26070C, savedSelections25D990, ram, rom, ctx, save, seen } = await armed();
  assert.equal(savedSelections25D990.length, 6, '$25D990 takes (ram, rom, D0, D1, D2, D3)');
  const p1style = 0, p1ship = 2, p2style = 2, p2ship = 6;
  handoff26070C(ram, rom, ctx, p1style, p1ship, p2style, p2ship, 0, save);
  const [r0, r1, r2, r3] = seen[0];
  assert.deepEqual([r0, r2], [p1style, p1ship], '$25D990 side 0 == (D0,D2) == P1\'s own pair');
  assert.deepEqual([r1, r3], [p2style, p2ship], '$25D990 side 1 == (D1,D3) == P2\'s own pair');
});

test('W375 $25D990 stores both saved-selection records, sentinel first', { skip: SKIP },
  async () => {
    const { savedSelections25D990, SAVEDSEL_25D990: S, ram, rom } = await fx();
    // $25D986 holds [$0000,$0002] and $25D98A holds [$0002,$0004,$0006]; $25D9E6 maps a posted
    // value back to its index, and returns CARRY only for the $FF "nothing saved" default.
    savedSelections25D990(ram, rom, 2, 0, 6, 2);
    assert.equal(ram.u8(S.recs[0]), 1, '$813008 <- index of $0002 in $25D986');
    assert.equal(ram.u8(S.recs[0] + 1), 2, '$813009 <- index of $0006 in $25D98A');
    assert.equal(ram.u8(S.recs[1]), 0, '$813018 <- index of $0000');
    assert.equal(ram.u8(S.recs[1] + 1), 0, '$813019 <- index of $0002');

    // $FF is the "nothing saved" path: $25D9E6 returns CARRY SET and the sentinel stands.
    const g = await fx();
    g.ram.setU16(0x81308c, 1);                               // so the defaults are the side's own
    savedSelections25D990(g.ram, rom, 0xff, 0xff, 0, 0);
    assert.equal(g.ram.u8(S.recs[0]), 0xff, '$25D9AA bcs -> $813008 keeps the $FF sentinel');
    assert.equal(g.ram.u8(S.recs[1]), 0xff, '$25D9D4 bcs -> $813018 keeps it too');
  });

test('W375 $26070C is a ONE-SHOT on $813082', { skip: SKIP }, async () => {
  const { handoff26070C, HANDOFF_26070C: K, ram, rom, ctx, save, seen } = await armed();
  assert.equal(ram.u16(K.once), 1, 'armed');

  assert.equal(handoff26070C(ram, rom, ctx, 1, 2, 3, 4, 5, save), true, 'first call runs');
  assert.equal(ram.u16(K.once), 0, '$26071A clr.w $813082 -- the request is CONSUMED');
  assert.equal(seen.length, 1, '$25D990 called once');

  for (let i = 0; i < 3; i++) {
    assert.equal(handoff26070C(ram, rom, ctx, 9, 9, 9, 9, 9, save), false,
      '$260710 beq.w $260782 -- every later call falls through to the movem restore');
  }
  assert.equal(seen.length, 1, '$25D990 still called exactly once');
  assert.equal(ram.u16(K.slotD0), 1, '  ...and the second call wrote no slot');
  // W379: same as above -- the FIRST call's $260580 tail cleared $813080 through $26055C, and the
  // later calls do not touch it because $260710 sends them straight to the movem restore. Zero
  // here therefore still proves "no second write": a second call would have put $9 in it.
  assert.equal(ram.u16(K.slotD4), 0, '  ...nor $813080, which $26055C left at 0 on the first pass');

  // The flag is a WORD, and it is a REQUEST: zero means "already done", not "do it".
  const g = await fx();
  assert.equal(g.handoff26070C(g.ram, g.rom, g.ctx, 1, 2, 3, 4, 5, save), false,
    'a zero $813082 runs nothing at all');
  assert.equal(g.ram.u16(g.HANDOFF_26070C.slotD0), 0, '  ...no slot written');
  assert.equal(rom.u16(0x260710), 0x4a79, '$260710 tst.w abs.l -- a WORD, not a byte');
  assert.equal(rom.u16(0x26071a), 0x4279, '$26071A clr.w abs.l');
  assert.equal(g.ram.u16(0x813082), 0, '  ...and $813082 stayed zero');
});

test('W375 $26070C D7 = $38 only when $803926 != 0 AND $813092 == 0 -- all four', { skip: SKIP },
  async () => {
    const cases = [
      [0, 0, 0x00, 'gate clear, block clear -> $260764 beq skips'],
      [0, 1, 0x00, 'gate clear, block set   -> same beq'],
      [1, 1, 0x00, 'gate set,   block set   -> $260770 bne skips'],
      [1, 0, 0x38, 'gate set,   block clear -> $260774 move.w #$38,D7'],
    ];
    // W379: D6 AND D7 ARE READ OFF THE CARTRIDGE'S OWN WRITES NOW, NOT OUT OF A NOTE'S TEXT.
    // `$26077E bsr.w $260580` used to be a counted note whose message carried the two registers,
    // so this loop pattern-matched that message. `$260580` runs, and its first three instructions
    // are `clr.w $81296E / move.w D7,$81307E / move.w D6,$813080` -- so D7 lands in `$81307E`
    // where it can simply be read. That is a strictly better check: it observes the value
    // ARRIVING somewhere rather than a string this port composed about it.
    //
    // D6 is checked at `($6,A0)` and not at `$813080`, because `$26055C` clears `$813080` again
    // on the way past whenever it was non-zero (see the ONE-SHOT test). `$26053A move.w $81307E,
    // ($6,A0)` is D7's own destination on the staged type-1 record, so the two travel together.
    const { STAGESTART } = await import('../src/rank.js');
    for (const [gate, block, want, why] of cases) {
      const { handoff26070C, HANDOFF_26070C: K, ram, rom, ctx, notes, save } = await armed();
      ram.setU16(K.d7Gate, gate);                            // $803926
      ram.setU16(K.d7Block, block);                          // $813092
      ram.setU16(K.slotD4, 0);
      handoff26070C(ram, rom, ctx, 0, 0, 0, 0, 0x077, save);

      assert.deepEqual(notesAt(notes, K.tail), [], `${why}: $260580 is a CALL, so it is not noted`);
      assert.equal(ram.u16(STAGESTART.wordD7), want, `${why}: $260586 move.w D7,$81307E`);
      // $260778 move.w $813080,D6 RE-READS the word after $25D990, so D6 is the $77 the caller
      // put there as D4 and not something $25D990 might have changed. $26055C then clears it,
      // which is exactly the branch a zero D6 would not have taken.
      assert.equal(ram.u16(STAGESTART.wordD6), 0,
        '$26058C wrote D6 = $77 and $260542 tst.w / $26055C clr saw it non-zero');
    }

    // Both gates are read as WORDS, and $813092 is compared to zero with a `cmpi.w`, not tested.
    const { rom } = await fx();
    assert.equal(rom.u16(0x26075e), 0x4a79, '$26075E tst.w $803926');
    assert.equal(rom.u16(0x260768), 0x0c79, '$260768 cmpi.w #imm,abs.l');
    assert.equal(rom.u16(0x26076a), 0x0000, '  ...immediate $0000 FIRST');
    assert.equal(rom.u32(0x26076c), 0x00813092, '  ...then the address');
    assert.equal(0x260766 + rom.u16(0x260766), 0x260778, '$260764 beq.w -> $260778');
    assert.equal(0x260772 + rom.u16(0x260772), 0x260778, '$260770 bne.w -> the SAME $260778');
    assert.equal(rom.u16(0x260774), 0x3e3c, '$260774 move.w #imm,D7');
    assert.equal(rom.u16(0x260776), 0x0038, '  ...$38');
  });

test('W375 $26070C touches neither A0, A5 nor A6, and restores every register', { skip: SKIP },
  async () => {
    const { rom, handoff26070C, HANDOFF_26070C: K } = await fx();
    assert.equal(rom.u32(0x26070c), 0x48e7fffe, '$26070C movem.l d0-d7/a0-a6,-(SP)');
    assert.equal(rom.u32(0x260782), 0x4cdf7fff, '$260782 movem.l (SP)+,d0-d7/a0-a6');
    assert.equal(rom.u16(0x260786), 0x4e75, '$260786 rts -- $26070C..$260786 is 124 bytes');
    assert.equal(K.bytes, 124, '  ...and the port carries that extent');
    // (ram, rom, ctx, D0, D1, D2, D3, D4, save) -- and `.length` stops at the first defaulted
    // parameter, so eight. Five registers, and no A-register among them.
    assert.equal(handoff26070C.length, 8, 'eight required parameters, D0..D4 and no A-register');
  });

// =================================================================================================
// 4. `$260580` -- W375 LEFT IT A NOTE, W378 PORTED IT INTO `rank.js`, W379 CONNECTED THE TWO
//
// THE TEST THAT STOOD HERE ASSERTED THE NOTE, and it was correct on the day it was written. W378
// then ported the whole of `$260580..$2605A3` as `rank.js`'s `stageStart260580` -- all four of the
// `bsr`s this test used to enumerate by size -- and nobody removed the note, so the port owned the
// routine and refused to call it from the only site the cartridge gives it. That gap is what made
// `$81315C` reachable as a null: `$26071A clr.w $813082` switched the rank body ON and `$26089E`,
// four `bsr`s below `$26077E`, never ran to give it a pointer.
//
// The extent assertions off the cartridge are KEPT, unchanged, below -- they are measurements and
// they did not stop being true. What is replaced is the claim that the port declines to run it.
// =================================================================================================

test('W379 $260580 is CALLED from $26077E, and it is what installs the rank base $81315C',
  { skip: SKIP }, async () => {
    const { handoff26070C, ram, rom, ctx, notes, save } = await armed();
    const { RANK, STAGESTART } = await import('../src/rank.js');

    ram.setU32(RANK.basePtr, 0);                             // $81315C -- W378's null
    ram.setU16(STAGESTART.zeroWord, 0x1234);                 // $81296E, so the clr is visible
    assert.equal(ram.u16(0x813082), 1, 'armed: $260710 tst.w sees the request');

    handoff26070C(ram, rom, ctx, 0, 0, 0, 0, 0, save);

    assert.deepEqual(notesAt(notes, STAGESTART.start), [],
      '$260580 is not noted any more -- it is a call');
    assert.equal(ram.u16(STAGESTART.zeroWord), 0,
      '$260580 clr.w $81296E -- its FIRST instruction ran');
    assert.notEqual(ram.u32(RANK.basePtr), 0,
      '$26059A bsr $26051A -> $260578 jsr $26089E -> $2608CA move.l (A0),$81315C. This is the '
      + 'only writer of that longword in the 6 MiB image, and reaching it is the whole point of '
      + 'the chain: $26071A lowered $813082 on the way in, so $2607A8 will let $2608D2 read '
      + 'through this pointer on the very next frame');
    assert.equal(ram.u16(0x813082), 0, '  ...and the request was consumed, as before');

    // The four `bsr`s and the cycle, straight off the cartridge. `$61` is BSR.
    assert.equal(rom.u16(0x260580), 0x4279, '$260580 clr.w $81296E -- the first of its own writes');
    for (const [at, to] of [[0x260592, 0x2604f4], [0x260596, 0x25fd24], [0x26059a, 0x26051a],
      [0x26059e, 0x25ff7a]]) {
      assert.equal(rom.u16(at), 0x6100, `$${at.toString(16).toUpperCase()} bsr.w`);
      assert.equal((at + 2 + ((rom.u16(at + 2) << 16) >> 16)) >>> 0, to,
        `  ...-> $${to.toString(16).toUpperCase()}`);
    }
    assert.equal(rom.u16(0x2605a2), 0x4e75, '$2605A2 rts -- 36 bytes, $260580..$2605A3');
    assert.equal(0x26055a + ((rom.u16(0x26055a) << 16) >> 16), 0x2603fe,
      '$260558 bsr.w $2603FE -- $26051A calls BACK into HANDLER7.pairSite, so the graph cycles');
    assert.equal(rom.u16(0x25ff9a), 0x4e90, '$25FF9A jsr (A0) -- an INDIRECT call, unknowable');
    assert.equal(0x260780 + ((rom.u16(0x260780) << 16) >> 16), 0x260580,
      '$26077E bsr.w $260580 -- the site itself');
  });

// =================================================================================================
// 5. MUTATION CHECKS -- each of these is a port this suite must reject
// =================================================================================================

test('W375 mutation: the assertions above reject the five ways this went wrong before',
  { skip: SKIP }, async () => {
    const { PLAYERREC_25F456: P, HANDOFF_26070C: K, rom, ram, a5,
      playerRecords25F456 } = await fx();

    // (a) $260A9A's beq computed off the INSTRUCTION address instead of the extension word.
    assert.notEqual(0x260aa8 + rom.u16(0x260aa6), 0x260ab2,
      'the wrong base lands on $260AB4, the rts, which is what looked like a leaked A4');

    // (b) `cmpi.w` read displacement-first.
    assert.notEqual(rom.u16(0x260aa0), 0x0002, 'immediate-first vs displacement-first differ here');

    // (c) $25F456 with a stride of EIGHT.
    ram.setU8(a5 + 0x04, 6);
    ram.setU8(a5 + 0x05, 0xff);
    playerRecords25F456(ram, rom, a5);
    assert.equal(ram.u32(0x813040), rom.u32(P.ptrTable + (6 - 2) * 4), 'stride 4 is what runs');
    assert.notEqual(rom.u32(P.ptrTable + (6 - 2) * 4), rom.u32(P.ptrTable + (6 - 2) * 8),
      '  ...and stride 8 would read a different longword, so the test discriminates');

    // (d) $26070C's slots assigned in register order.
    assert.notEqual(K.slotD1, K.slotD2, 'D1 and D2 do not share a slot');
    assert.ok(K.slotD1 > K.slotD2, 'D1 goes to the HIGHER address, which is the crossing');

    // (e) the word literal treated as one byte.
    const g = await fx();
    g.rank.announcePost(g.ram, 0x260a9a, 1);
    assert.equal(g.ram.u16(0x813166), 1, '$260AA8 is a WORD write to $813166..$813167');
    assert.equal(g.ram.u16(0x813168), 4, '  ...and $260AAC a word write to $813168..$813169');
  });
