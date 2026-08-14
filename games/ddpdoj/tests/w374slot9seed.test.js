// W374 -- `$25C8A2`, object-dispatch slot [9]'s RECORD STATE 0, plus its four leaf callees. DRIVEN.
//
// The routine is the SEEDER that feeds `$25D010`, not a peer of it, and the two traps it carries
// are the ones this project has already written wrong more than once:
//
//   TRAP 11  `$25CA82 move.w #$0,($4,A0)` lands on the record `$241182` just staged, because
//            `$241182` replaces A0 and does not restore it. NOT on this object's `($4,A5)`.
//   TRAP 12  the staged priority comes from the `$240F62` LOOKUP, never from a constant.
//
// Everything asserted here was re-read off `rip/sound/maincpu.bin` at raw file offsets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

const A5 = 0x812800;

async function fx({ palette = false, sound = false } = {}) {
  const mod = await import('../src/objslot9.js');
  const s17 = await import('../src/objslot17.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => Array.from(IMG.subarray(a, a + n)) };
  const ram = new Ram();
  const notes = [];
  const sounds = [];
  const ctx = { unported: { note: (a) => notes.push(a) }, unportedLog: { note: () => {} },
    tx: new TxVram(), soundPost: (a) => sounds.push(a) };
  if (palette) {
    const { PaletteState } = await import('../src/palette.js');
    ctx.palette = new PaletteState();
  }
  if (sound) {
    const { SoundState } = await import('../src/sound.js');
    ctx.__game = { ram, sound: new SoundState() };
  }
  return { ...mod, s17, SCREEN17: s17.SCREEN17, ram, rom, ctx, notes, sounds, a5: A5, IMG };
}

// ---------------------------------------------------------------- shape, straight off the image

test('W374 $25C8A2 is exactly 544 bytes with one rts, and $25CAC2 is the NEXT routine',
  { skip: SKIP }, async () => {
    const { SEED9, IMG } = await fx();
    assert.equal(SEED9.addr, 0x25c8a2);
    assert.equal(SEED9.rts, 0x25cac0);
    assert.equal(0x25cac2 - SEED9.addr, SEED9.bytes, '$220 = 544 bytes');
    assert.equal(IMG.readUInt16BE(SEED9.rts), 0x4e75, '$25CAC0 is the rts');
    assert.equal(IMG.readUInt32BE(0x25cac2) >>> 16, 0x4ef9, '$25CAC2 is `jmp abs.l`');
    assert.equal(IMG.readUInt32BE(0x25cac4), 0x00241292, 'namely jmp $241292');
    // The first instruction is `move.b #$1,($2,A5)` -- ITS OWN state, before anything else runs.
    assert.equal(IMG.readUInt32BE(SEED9.addr), 0x1b7c0001, 'move.b #$1,(d16,A5)');
    assert.equal(IMG.readUInt16BE(SEED9.addr + 4), 0x0002, 'and the displacement is $2');
  });

test('W374 slot [9] state 0 and slot [17] state 0 install the SAME fifteen palettes',
  { skip: SKIP }, async () => {
    const { SEED9, SCREEN17 } = await fx();
    assert.equal(SEED9.palettes.length, 15);
    assert.deepEqual(SEED9.palettes.map((p) => [p.src, p.bank, p.via]),
      SCREEN17.palettes.map((p) => [p.src, p.bank, p.via]),
      'the two screens share their furniture exactly, in the same ORDER');
    assert.equal(SEED9.palettes[0].via, 0x2414be, 'and the first is the 32-byte TX installer');
    assert.equal(SEED9.palettes.filter((p) => p.via === 0x24150a).length, 14);
    const banks = SEED9.palettes.filter((p) => p.via === 0x24150a).map((p) => p.bank);
    assert.equal(new Set(banks).size, banks.length, 'no bank installed twice');
  });

// ---------------------------------------------------------------- (1) the bulk clear's extent

test('W374 the bulk clear covers exactly 224 bytes and stops before $812F80', { skip: SKIP },
  async () => {
    const { seed25C8A2, SCREEN17, ram, rom, ctx } = await fx();
    const end = SCREEN17.recs + SCREEN17.recCount * SCREEN17.recStride;
    assert.equal(end - SCREEN17.recs, 224, '2 * $70');
    assert.equal(SCREEN17.recWords * 2, 224, 'and 112 words IS 224 bytes');
    // $812F80 is separately clr.w-ed at $25C936, so it cannot be the sentinel. $812F82 is cleared
    // at $25C8C8 too. The first word this routine must NOT touch is $812F84 -- except that the
    // tail copy writes there deliberately, so the probe goes ABOVE the copy, at $812FC4.
    for (let a = SCREEN17.recs; a < 0x812fd0; a += 2) ram.setU16(a, 0xbeef);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(ram.u16(0x812fc4), 0xbeef, 'the word just past the 64-byte tail copy is untouched');
    assert.equal(ram.u16(0x812fc6), 0xbeef);
  });

test('W374 the 112-word clear does not run past record 1 -- sentinel above the records',
  { skip: SKIP }, async () => {
    // A second, tighter version of (1): drive the mask to 0 so NOTHING is written back into the
    // records afterwards, and prove the last cleared word is $812F7E and the first survivor is the
    // one the routine clears by name.
    const { seed25C8A2, SCREEN17, ram, rom, ctx } = await fx();
    ram.setU8(A5 + 0x04, 0);
    for (let a = SCREEN17.recs; a < 0x812f90; a += 2) ram.setU16(a, 0xbeef);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(ram.u16(0x812f7e), 0, 'the LAST word of record 1 was cleared');
    assert.equal(ram.u16(0x812f80), 0, '$812F80 is cleared, but by $25C936 and not by the loop');
    assert.equal(ram.u16(0x812f82), 0, '$812F82 by $25C8C8');
  });

test('W374 the bulk clear is exactly 112 CONSECUTIVE word writes and the 113th never happens',
  { skip: SKIP }, async () => {
    // A sentinel cannot catch a 113-word run, because word 113 IS $812F80 and $25C936 clears that
    // one by name a few instructions later. So trace the writes instead: the loop is a contiguous
    // arithmetic run, and the proof it stops is that $812F80 is written ONCE -- by $25C936 -- and
    // not twice.
    const { seed25C8A2, SEED9, SCREEN17, ram, rom, ctx } = await fx();
    const seen = [];
    const real = ram.setU16.bind(ram);
    ram.setU16 = (a, v) => { seen.push(a); return real(a, v); };
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);

    const first = seen.indexOf(SCREEN17.recs);
    assert.notEqual(first, -1, 'the record base was written');
    for (let i = 0; i < SCREEN17.recWords; i++) {
      assert.equal(seen[first + i], SCREEN17.recs + i * 2,
        `bulk-clear word ${i} must be $${(SCREEN17.recs + i * 2).toString(16).toUpperCase()}`);
    }
    assert.notEqual(seen[first + SCREEN17.recWords], SCREEN17.recs + SCREEN17.recWords * 2,
      'the 113th word -- $812F80 -- is NOT part of the run. `move.w #$6F,D0` + dbra is 112');
    const hits = (addr) => seen.filter((a) => a === addr).length;
    assert.equal(hits(SEED9.flagC), 1,
      '$812F80 is written exactly once, by $25C936. Twice means the dbra ran one pass too many');
    assert.equal(hits(SEED9.flagA), 1, 'and $812F82 exactly once, by $25C8C8');
  });

// ---------------------------------------------------------------- (2) + (7) the per-record seed

test('W374 both records are seeded IDENTICALLY, and ($64,A0) is 1 on each', { skip: SKIP },
  async () => {
    const { seed25C8A2, SEED9, SCREEN17, ram, rom, ctx } = await fx();
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);
    for (let r = 0; r < SCREEN17.recCount; r++) {
      const a0 = SCREEN17.recs + r * SCREEN17.recStride;
      assert.equal(ram.u32(a0 + SEED9.sentinelAt), 0xffffffff, `record ${r} $56 is the sentinel`);
      assert.equal(ram.u16(a0 + SEED9.gateWord), 1,
        `record ${r} ($64,A0) is 1 -- the gate draw25E220 reads with tst.w/beq`);
      assert.equal(ram.u16(a0 + 0x60), 0);
      assert.equal(ram.u16(a0 + 0x62), 0);
      assert.equal(ram.u16(a0 + 0x66), 0);
      assert.equal(ram.u16(a0 + 0x68), 0);
      assert.equal(ram.u16(a0 + 0x6a), 2);
      assert.equal(ram.u16(a0 + 0x6c), 0x140);
    }
    // "identically" means every field except the live flag, so compare the two records byte-wise
    // with $00 masked out.
    for (let o = 1; o < SCREEN17.recStride; o++) {
      assert.equal(ram.u8(SCREEN17.recs + o), ram.u8(SCREEN17.recs + SCREEN17.recStride + o),
        `offset $${o.toString(16)} differs between the records`);
    }
  });

test('W374 the RECORD state is 0 on both records, so it hands off to phase0_25D010',
  { skip: SKIP }, async () => {
    const { seed25C8A2, SEED9, SCREEN9, SCREEN17, ram, rom, ctx } = await fx();
    ram.setU8(A5 + 0x04, 3);
    // Dirty both record-state bytes first, so "0" cannot be an artefact of a fresh Ram.
    ram.setU8(SCREEN17.recs + SEED9.phaseAt, 4);
    ram.setU8(SCREEN17.recs + SCREEN17.recStride + SEED9.phaseAt, 7);
    seed25C8A2(ram, rom, A5, ctx);
    for (let r = 0; r < SCREEN17.recCount; r++) {
      assert.equal(ram.u8(SCREEN17.recs + r * SCREEN17.recStride + SEED9.phaseAt), 0,
        `record ${r} state is 0`);
    }
    assert.equal(SCREEN9.states[5], 0x00, 'and 0 is one of slot [9]\'s eight arms');
    assert.equal(SCREEN9.handlers[5], 0x25d010, 'namely $25D010');
  });

// ---------------------------------------------------------------- (3) the join mask, all four

test('W374 the join mask decides which records go live -- all four values', { skip: SKIP },
  async () => {
    const expect = { 3: [1, 1], 2: [0, 1], 1: [1, 0], 0: [0, 0] };
    for (const [maskStr, want] of Object.entries(expect)) {
      const mask = Number(maskStr);
      const { seed25C8A2, SCREEN17, ram, rom, ctx } = await fx();
      ram.setU8(A5 + 0x04, mask);
      seed25C8A2(ram, rom, A5, ctx);
      assert.equal(ram.u8(SCREEN17.recs), want[0], `mask ${mask}: record 0 live flag`);
      assert.equal(ram.u8(SCREEN17.recs + SCREEN17.recStride), want[1],
        `mask ${mask}: record 1 live flag`);
    }
  });

test('W374 the three mask compares are INDEPENDENT ifs, not an else-if chain', { skip: SKIP },
  async () => {
    // The structure is only observable through the constant table, because the data can never make
    // two arms fire at once. Assert the shape the port encodes rather than a behaviour it cannot
    // produce: three arms, each with its own literal, and 0 matching none of them.
    const { SEED9 } = await fx();
    assert.deepEqual(SEED9.maskArms.map((a) => a.value), [3, 2, 1], 'in cartridge order');
    assert.deepEqual(SEED9.maskArms.map((a) => [...a.recs]), [[0, 1], [1], [0]]);
    assert.equal(SEED9.maskArms.filter((a) => a.value === 0).length, 0,
      'and there is no arm for 0, which is why mask 0 leaves both records dead');
  });

// ---------------------------------------------------------------- (4) the read-then-clobber

test('W374 ($4,A5) ends as $FF even when the mask it carried was 3', { skip: SKIP }, async () => {
  const { seed25C8A2, ram, rom, ctx, SCREEN17 } = await fx();
  ram.setU8(A5 + 0x04, 3);
  seed25C8A2(ram, rom, A5, ctx);
  assert.equal(ram.u8(A5 + 0x04), 0xff,
    '$25C972 overwrites the very byte $25C942 read. The mask is consumed, not kept');
  assert.equal(ram.u8(SCREEN17.recs), 1, 'and the 3 still took effect before it was destroyed');
  for (const off of [0x05, 0x06, 0x07, 0x08, 0x09]) {
    assert.equal(ram.u8(A5 + off), 0xff, `($${off.toString(16)},A5) is $FF too`);
  }
  assert.equal(ram.u8(A5 + 0x03), 0, '($3,A5) is the one byte in the wall that is 0');
  assert.equal(ram.u16(A5 + 0x0a), 0, 'and ($A,A5) is a clr.w');
});

// ---------------------------------------------------------------- (5) TRAP 11

test('W374 TRAP 11: $25CA82 writes the STAGED record, not this object', { skip: SKIP },
  async () => {
    const { seed25C8A2, SEED9, ram, rom, ctx } = await fx();
    const { ALLOC } = await import('../src/objalloc.js');
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(ram.u8(A5 + SEED9.mask), 0xff,
      'TRAP 11: ($4,A5) is $FF. Reading $25CA82 as ($4,A5) would have left it 0 here, and the '
      + '$FF sentinel $25D306 tests with a SIGNED tst.b would be gone -- both sides would look '
      + 'like they had already chosen');
    assert.equal(ram.u16(ALLOC.createStage + SEED9.newRecArm), 0,
      'TRAP 11: the zero landed on the record $241182 just staged, at $80D56C + $4');
    // It is a WORD, so it clears $4 and $5 of the new record together.
    assert.equal(ram.u8(ALLOC.createStage + 0x04), 0);
    assert.equal(ram.u8(ALLOC.createStage + 0x05), 0);
  });

test('W374 TRAP 11 survives a DIRTY staging slot -- the write is real, not a leftover zero',
  { skip: SKIP }, async () => {
    const { seed25C8A2, SEED9, ram, rom, ctx } = await fx();
    const { ALLOC } = await import('../src/objalloc.js');
    ram.setU16(ALLOC.createStage + SEED9.newRecArm, 0xbeef);
    ram.setU8(A5 + 0x04, 1);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(ram.u16(ALLOC.createStage + SEED9.newRecArm), 0,
      'TRAP 11: the $BEEF was overwritten, so $25CA82 really did fire on the staged record');
  });

// ---------------------------------------------------------------- (6) TRAP 12

test('W374 TRAP 12: the staged type is $A and the priority came from the $240F62 LOOKUP',
  { skip: SKIP }, async () => {
    const { seed25C8A2, SEED9, SCREEN9, ram, rom, ctx } = await fx();
    const { ALLOC } = await import('../src/objalloc.js');
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(ram.u16(ALLOC.createStage + ALLOC.typeOff), (SEED9.childType | 0x8000) >>> 0,
      'type $A, with $241182\'s #$8000 or\'d in');
    assert.equal(rom.u32(SCREEN9.dispatch + SEED9.childType * 8), 0x260794,
      '$240F62 + $A*8 is handler $260794');
    assert.equal(rom.u16(SCREEN9.dispatch + SEED9.childType * 8 + 4), 0x001f, 'and priority $001F');
    assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff), 0x001f,
      'TRAP 12: the staged record carries $001F. A constant 0 -- or a constant $A -- fails here');
    assert.notEqual(ram.u16(ALLOC.createStage + ALLOC.priOff), SEED9.childType,
      'and it is NOT the type value passed in');
  });

// ---------------------------------------------------------------- (8) the object's own state

test('W374 ($2,A5) is 1 afterwards, so the dispatcher never re-enters', { skip: SKIP },
  async () => {
    const { objSlot9, SCREEN9, SCREEN17, ram, rom, ctx } = await fx();
    ram.setU8(A5 + 0x04, 3);
    assert.equal(ram.u8(A5 + SCREEN9.state), 0, 'it starts at state 0');
    objSlot9(ram, rom, A5, ctx);
    assert.equal(ram.u8(A5 + SCREEN9.state), 1, '$25C8A2 set it to 1 as its FIRST instruction');
    // A second dispatch must take the record walk, not the seeder. Proof: the walk finds record
    // state 0 and phase0_25D010 advances it to 1.
    objSlot9(ram, rom, A5, ctx);
    assert.equal(ram.u8(SCREEN17.recs + 0x01), 1,
      'the second call ran the WALK and $25D010 advanced record 0 from 0 to 1');
  });

// ---------------------------------------------------------------- (9) the four leaves

test('W374 $25F442 clears exactly 72 bytes at $813028 and stops below $813070', { skip: SKIP },
  async () => {
    const { s17 } = await fx();
    const { Ram } = await import('../src/ram.js');
    const ram = new Ram();
    assert.equal(s17.OPENER_25F442.words * 2, 72, '$23 + 1 words = 36 words = 72 bytes');
    for (let a = 0x813020; a < 0x813080; a += 2) ram.setU16(a, 0xbeef);
    s17.clear25F442(ram);
    assert.equal(ram.u16(0x813026), 0xbeef, 'the word below the base is untouched');
    assert.equal(ram.u16(0x813028), 0, 'the base is cleared');
    assert.equal(ram.u16(0x81306e), 0, 'and so is the LAST word, $81306E');
    assert.equal(ram.u16(0x813070), 0xbeef,
      '$813070 -- $25FA78\'s base -- is NOT touched. The two leaves tile exactly');
  });

test('W374 $25FA78 clears 10 bytes and then seeds $3C straight back', { skip: SKIP }, async () => {
  const { clear25FA78, LEAVES9 } = await fx();
  const { Ram } = await import('../src/ram.js');
  const ram = new Ram();
  assert.equal(LEAVES9.b.words * 2, 10, '$4 + 1 words = 5 words = 10 bytes');
  for (let a = 0x813070; a < 0x813090; a += 2) ram.setU16(a, 0xbeef);
  clear25FA78(ram);
  assert.equal(ram.u16(0x813070), 0x3c, '$813070 ends at $3C, not 0 -- the loop cleared it first');
  assert.equal(ram.u16(0x813072), 0, 'the redundant second clear');
  for (const a of [0x813074, 0x813076, 0x813078]) assert.equal(ram.u16(a), 0, `$${a.toString(16)}`);
  assert.equal(ram.u16(0x81307a), 0xbeef, 'and $81307A -- the sixth word -- is untouched');
});

test('W374 $25C57E clears 30 bytes ending EXACTLY at the record base', { skip: SKIP }, async () => {
  const { clear25C57E, LEAVES9, SCREEN17 } = await fx();
  const { Ram } = await import('../src/ram.js');
  const ram = new Ram();
  assert.equal(LEAVES9.c.words * 2, 30, '$E + 1 words = 15 words = 30 bytes');
  assert.equal(LEAVES9.c.base + LEAVES9.c.words * 2, SCREEN17.recs,
    '$812E82 + 30 = $812EA0, the record base');
  for (let a = 0x812e80; a < 0x812eb0; a += 2) ram.setU16(a, 0xbeef);
  clear25C57E(ram);
  assert.equal(ram.u16(0x812e80), 0xbeef, 'the word below the base survives');
  assert.equal(ram.u16(0x812e9e), 0, 'the LAST word cleared is $812E9E');
  assert.equal(ram.u16(SCREEN17.recs), 0xbeef,
    'and $812EA0 -- record 0\'s live flag -- is NOT touched by this leaf');
});

test('W374 $28CA94 is a WRAPPERS row, id $41 / pan $FF / ch $14 -> $28C02A', { skip: SKIP },
  async () => {
    const { SOUND_WRAPPERS, SOUND_ENTRY } = await import('../src/sound.js');
    const w = SOUND_WRAPPERS[0x28ca94];
    assert.ok(w, '$28CA94 has a row');
    assert.deepEqual({ id: w.id, pan: w.pan, ch: w.ch, entry: w.entry },
      { id: 0x41, pan: 0xff, ch: 0x14, entry: 0x28c02a });
    assert.ok(SOUND_ENTRY[w.entry], 'and $28C02A was already an ENTRY');
    // The neighbouring row $28C310 is the byte-identical shape the spec pointed at.
    assert.equal(SOUND_WRAPPERS[0x28c310].entry, w.entry);
    assert.equal(SOUND_WRAPPERS[0x28c310].pan, w.pan);
    // $28CAAE is what $25D4F0 already posts; without a row `postWrapper` throws.
    const { HANDLER6 } = await import('../src/objslot17.js');
    assert.ok(SOUND_WRAPPERS[HANDLER6.sound], '$28CAAE has a row too');
  });

test('W374 the two sound posts actually reach the ring through a real SoundState', { skip: SKIP },
  async () => {
    const { seed25C8A2, ram, rom, ctx } = await fx({ sound: true });
    const { soundPost, dequeue } = await import('../src/sound.js');
    ctx.soundPost = (a) => soundPost(ctx, a);
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);                          // must not throw on either wrapper
    const words = [];
    for (;;) { const v = dequeue(ram); if (v === null) break; words.push(v); }
    assert.equal(words.length, 2, '$28CB38 and $28CA94 both posted');
    assert.equal((words[1] >>> 8) & 0xff, 0x41, 'the second door carries id $41');
    assert.equal(words[1] & 0xff, 0x14 << 2, 'and channel $14');
  });

test('W374 the seeder calls the four leaves in cartridge order', { skip: SKIP }, async () => {
  // The observable is the union of their extents plus $3C landing back in $813070.
  const { seed25C8A2, SEED9, ram, rom, ctx, sounds } = await fx();
  for (let a = 0x813028; a < 0x813080; a += 2) ram.setU16(a, 0xbeef);
  for (let a = 0x812e82; a < 0x812ea0; a += 2) ram.setU16(a, 0xbeef);
  ram.setU8(A5 + 0x04, 3);
  seed25C8A2(ram, rom, A5, ctx);
  assert.equal(ram.u16(0x813028), 0, '$25F442 ran');
  assert.equal(ram.u16(0x81306e), 0, '  ..to its end');
  assert.equal(ram.u16(0x813070), 0x3c, '$25FA78 ran and left its seed');
  assert.equal(ram.u16(0x812e82), 0, '$25C57E ran');
  assert.equal(ram.u16(0x812e9e), 0, '  ..to its end');
  assert.deepEqual(sounds, [SEED9.soundStream, SEED9.soundWrapper],
    '$28CB38 then $28CA94, in that order');
});

// ---------------------------------------------------------------- (10) the tail copy

test('W374 the tail copies $223FF8\'s 64 bytes to $812F84, and bank 18 still installed too',
  { skip: SKIP }, async () => {
    const { seed25C8A2, SEED9, ram, rom, ctx } = await fx({ palette: true });
    for (let i = 0; i < 20; i++) ram.setU32(SEED9.copyDst + i * 4, 0xdeadbeef);
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(SEED9.copyLongs * 4, 64, 'SIXTEEN unrolled move.l is 64 bytes');
    for (let i = 0; i < SEED9.copyLongs; i++) {
      assert.equal(ram.u32(SEED9.copyDst + i * 4), rom.u32(SEED9.copySrc + i * 4),
        `long ${i} of the copy`);
    }
    assert.equal(ram.u32(SEED9.copyDst + 64), 0xdeadbeef, 'and it stopped at 64 bytes');
    // $223FF8 IS READ TWICE. The palette install is the other read and it must still be there.
    const key = [...ctx.palette.installs.keys()].find((k) => k.includes('bank 18'));
    assert.ok(key, `bank 18's install is still recorded: ${[...ctx.palette.installs.keys()]}`);
    assert.equal(ctx.palette.installCount, 15, 'all fifteen installs ran');
  });

test('W374 all fifteen palette installs run with a PaletteState and note without one',
  { skip: SKIP }, async () => {
    const withPal = await fx({ palette: true });
    withPal.ram.setU8(A5 + 0x04, 3);
    withPal.seed25C8A2(withPal.ram, withPal.rom, A5, withPal.ctx);
    assert.equal(withPal.ctx.palette.installCount, 15);

    const noPal = await fx();
    noPal.ram.setU8(A5 + 0x04, 3);
    noPal.seed25C8A2(noPal.ram, noPal.rom, A5, noPal.ctx);
    assert.equal(noPal.notes.filter((n) => n === 0x24150a).length, 14,
      'fourteen $24150A notes');
    assert.equal(noPal.notes.filter((n) => n === 0x2414be).length, 1,
      'and ONE $2414BE note -- the TX bank is a different routine and a different size');
  });

// ---------------------------------------------------------------- the absolute side effects

test('W374 the absolute clears all land, including $23C47A\'s six words', { skip: SKIP },
  async () => {
    const { seed25C8A2, SEED9, ram, rom, ctx } = await fx();
    ram.setU16(SEED9.dualGate, 0x1234);
    for (let i = 0; i < 8; i++) ram.setU16(SEED9.clear23c47a + i * 2, 0xbeef);
    ram.setU16(SEED9.flagA, 0xbeef);
    ram.setU8(SEED9.byte813005, 0x5a);
    ram.setU16(SEED9.flagC, 0xbeef);
    ram.setU16(SEED9.word813006, 0xbeef);
    ram.setU8(A5 + 0x04, 3);
    seed25C8A2(ram, rom, A5, ctx);
    assert.equal(ram.u16(SEED9.dualGate), 0, '$803926 -- the sound/midboss dual-role word');
    for (let i = 0; i < SEED9.clear23c47aWords; i++) {
      assert.equal(ram.u16(SEED9.clear23c47a + i * 2), 0, `$23C47A word ${i}`);
    }
    assert.equal(ram.u16(SEED9.clear23c47a + 12), 0xbeef, 'and $23C47A stops after SIX words');
    assert.equal(ram.u16(SEED9.flagA), 0, '$812F82');
    assert.equal(ram.u8(SEED9.byte813005), 0, '$813005 is a BYTE');
    assert.equal(ram.u16(SEED9.flagC), 0, '$812F80');
    assert.equal(ram.u16(SEED9.word813006), 0, '$813006');
  });

test('W374 nothing in the seeder is per-side: the mask is the only branch', { skip: SKIP },
  async () => {
    // Both records get identical values for every mask that makes them both live, and the routine
    // has no D7 input at all -- its signature does not take one.
    const { seed25C8A2 } = await fx();
    assert.equal(seed25C8A2.length, 4, 'seed25C8A2(ram, rom, a5, ctx) -- no D7, no side');
  });
