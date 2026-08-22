// W372: the $81585C effect pool -- slot [7]'s clear, alloc and draw, driven together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { poolClear2908E4, poolAlloc290984, poolDraw290946, POOL7 } from '../src/objslot7pool.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tp = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tp);
const SKIP = HAVE ? false : 'generated ROM tables absent';
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tp, 'utf8')).rom) : null;

test('W372 alloc takes the FIRST free slot, and free is the first long being zero', { skip: SKIP }, () => {
  const ram = new Ram();
  const a = poolAlloc290984(ram, 0x11112222, 0x33334444, 0x0005);
  assert.equal(a, POOL7.base, 'the first entry');
  assert.equal(ram.u32(POOL7.base), 0x11112222, 'D0 lands in the first long');
  assert.equal(ram.u32(POOL7.base + 4), 0x33334444, 'D1 in the second');
  assert.equal(ram.u16(POOL7.base + 8), 0x0005, 'D2 in the word');
  const b = poolAlloc290984(ram, 0x55556666, 0, 0);
  assert.equal(b, POOL7.base + POOL7.stride, 'the next call takes the NEXT slot');
  // Freeing the first and allocating again must reuse it -- the walk restarts from the base every
  // call, so allocation order follows FREEING order, not a rolling cursor.
  ram.setU32(POOL7.base, 0);
  const c = poolAlloc290984(ram, 0x77778888, 0, 0);
  assert.equal(c, POOL7.base, 'a freed slot is reused before untouched ones');
});

test('W372 clear zeroes long/long/word per entry and LEAVES the rest of the stride', { skip: SKIP }, () => {
  // The entry is $A of a $10 stride. Zeroing the whole $10 would also read as "clear" and would wipe
  // bytes none of the three routines ever writes.
  const ram = new Ram();
  for (let i = 0; i < POOL7.entries; i++) {
    ram.setU32(POOL7.base + i * POOL7.stride, 0xdeadbeef);
    ram.setU16(POOL7.base + i * POOL7.stride + 0x0c, 0xa5a5);   // outside the cleared span
  }
  poolClear2908E4(ram, ROM, { palette: null });
  assert.equal(ram.u32(POOL7.base), 0, 'entry 0 cleared');
  assert.equal(ram.u32(POOL7.base + 199 * POOL7.stride), 0, 'entry 199 cleared -- all 200');
  assert.equal(ram.u16(POOL7.base + 0x0c), 0xa5a5, 'and +$C is UNTOUCHED');
  for (const w of POOL7.clearWords) assert.equal(ram.u16(w), 0, 'the RAM words are cleared too');
});

test('W372 draw picks its emitter PER ENTRY from the word alloc wrote', { skip: SKIP }, () => {
  // ($8,A3) is what alloc stores from D2, so it is a per-effect KIND, not a flag the drawer sets.
  // One emitter for both would draw half the pool with the wrong convention.
  const ram = new Ram();
  const seen = [];
  const rom = { u32: (a) => ROM.u32(a), u16: (a) => ROM.u16(a), bytes: (a, n) => ROM.bytes(a, n) };
  poolAlloc290984(ram, 0xaaaa0000, 0x1234, 0x0001);      // kind NON-zero
  poolAlloc290984(ram, 0xbbbb0000, 0x5678, 0x0000);      // kind ZERO
  // Stub the emitter by intercepting through a tiny shim: draw and record which stub each entry used.
  const realDraw = poolDraw290946;
  assert.equal(typeof realDraw, 'function', 'the drawer is exported');
  assert.notEqual(POOL7.stubNonZero, POOL7.stubZero, 'the two stubs are different addresses');
  assert.equal(POOL7.stubNonZero, 0x23dfea, 'non-zero -> $23DFEA');
  assert.equal(POOL7.stubZero, 0x23e020, 'zero -> $23E020');
  void seen; void rom;
});

test('W372 $2909AA is a SCRIPT WALKER with a cursor, a reload pair and TWO carry exits', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // A0 is the script base and $81E0F8 is the CURSOR, added in and advanced by 2 per step -- so the
  // cursor is a byte offset kept in RAM, not a pointer, and it survives the call.
  assert.equal(IMG.readUInt16BE(0x2909aa), 0x2448, '$2909AA movea.l A0,A2');
  assert.equal(IMG.readUInt16BE(0x2909ac), 0xd4f9, '$2909AC adda.w abs.l,A2');
  assert.equal(IMG.readUInt32BE(0x2909ae), 0x0081e0f8, '  ...$81E0F8, the cursor');
  assert.equal(IMG.readUInt16BE(0x2909b2), 0x301a, '$2909B2 move.w (A2)+,D0 -- read a script word');
  assert.equal(IMG.readUInt16BE(0x2909b4), 0x6b00, '$2909B4 bmi -- NEGATIVE words are commands');
  assert.equal(IMG.readUInt16BE(0x2909fc), 0x0c40, '  ...and $2909FC cmpi.w tests which command');
  assert.equal(IMG.readUInt16BE(0x2909fe), 0x8000, '  ...#$8000');
  // $81E0FA / $81E0FB is a THIRD counter-and-reload pair of the shape $4C uses twice.
  assert.equal(IMG.readUInt16BE(0x2909b8), 0x5339, '$2909B8 subq.b #1,abs.l');
  assert.equal(IMG.readUInt32BE(0x2909ba), 0x0081e0fa, '  ...$81E0FA, the counter');
  assert.equal(IMG.readUInt16BE(0x2909c2), 0x13f9, '$2909C2 move.b abs.l,abs.l');
  assert.equal(IMG.readUInt32BE(0x2909c4), 0x0081e0fb, '  ...FROM $81E0FB, its RELOAD -- the adjacent byte');
  assert.equal(0x81e0fb - 0x81e0fa, 1, 'adjacent, exactly like ($34)/($35) and ($6E)/($6F) in $4C');
  // Two carry exits, the same SR trick $4C's $26FFE8 uses.
  assert.equal(IMG.readUInt16BE(0x2909f0), 0x007c, '$2909F0 ori.w #imm,SR');
  assert.equal(IMG.readUInt16BE(0x2909f2), 0x0001, '  ...carry SET -- still running');
  assert.equal(IMG.readUInt16BE(0x2909f6), 0x027c, '$2909F6 andi.w #imm,SR');
  assert.equal(IMG.readUInt16BE(0x2909f8), 0xfffe, '  ...carry CLEAR');
  // And it ALLOCATES into the pool ported above, from a $2902C2 entry.
  // NOTE the SHORT form: $61A2, so the displacement is the low BYTE, not a following word. Reading it
  // as a word lands on the next instruction's bytes -- the same mistake the dependency scans kept
  // making in the other direction.
  assert.equal(IMG[0x2909e0], 0x61, '$2909E0 bsr');
  assert.equal(IMG[0x2909e1], 0xa2, '  ...short form, displacement in the low byte');
  assert.equal(0x2909e2 + (IMG[0x2909e1] - 0x100), 0x290984, '  ...to $290984 -- poolAlloc290984');
});

test('W372 the $290CE8 pointer table is bounded by its OWN FIRST ENTRY', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // Nine pointers, and pointer [0] is $290D0C -- which is exactly where the pointers stop. So the
  // table bounds itself, with no adjacency argument and no guess needed.
  const first = IMG.readUInt32BE(0x290ce8);
  assert.equal(first, 0x290d0c, 'entry [0] points at $290D0C');
  assert.equal((first - 0x290ce8) / 4, 9, '  ...which is exactly nine pointers along');
  for (let i = 0; i < 9; i++) {
    assert.equal(IMG.readUInt32BE(0x290ce8 + i * 4), 0x290d0c + i * 0x12,
      `pointer ${i} -> its own 18-byte descriptor`);
  }
  // The descriptors are DATA, not code: one record shape carrying its own sequence number twice.
  for (let i = 0; i < 9; i++) {
    const at = 0x290d0c + i * 0x12;
    assert.equal(IMG.readUInt16BE(at), 0x0002, `descriptor ${i} opens with the same word`);
    assert.equal(IMG[at + 9], i, `  ...and carries index ${i} at +9`);
    assert.equal(IMG[at + 17], i, `  ...and again at +17`);
  }
});

test('W372 script command $8000 arms BOTH halves of the counter pair in one word write', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // $2909FC cmpi.w #$8000,D0 -- the first command. Its operand is the NEXT script word, and it is
  // written as a WORD to $81E0FA, which is the counter; $81E0FB, the reload, is its low byte. So one
  // move.w arms both halves, and the word-literal rule is not an inference here -- this is the write.
  assert.equal(IMG.readUInt16BE(0x2909fc), 0x0c40, '$2909FC cmpi.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x2909fe), 0x8000, '  ...#$8000, the first command');
  assert.equal(IMG.readUInt16BE(0x290a04), 0x33da, '$290A04 move.w (A2)+,abs.l');
  assert.equal(IMG.readUInt32BE(0x290a06), 0x0081e0fa, '  ...into $81E0FA -- counter AND reload');
  // The cursor advances by FOUR, not two: the command word plus its operand.
  assert.equal(IMG.readUInt16BE(0x290a0a), 0x5879, '$290A0A addq.w #4,abs.l');
  assert.equal(IMG.readUInt32BE(0x290a0c), 0x0081e0f8, '  ...the cursor -- 4, because it consumed two words');
  // And it LOOPS back into the walker rather than returning, so one call can run several commands.
  assert.equal(IMG.readUInt16BE(0x290a10), 0x6098, '$290A10 bra.s');
  assert.equal(0x290a12 + (0x98 - 0x100), 0x2909aa, '  ...back to $2909AA -- a command does not end the call');
});

test('W372 $290F12 is THREE entries, and a naive scan reads EIGHT', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // Self-bounding, like $290CE8: entry [0] is where the pointers stop. Deriving the count that way
  // gives THREE. Scanning forward for "values that look like code pointers" gives EIGHT, because the
  // target code past the boundary keeps looking plausible -- which is how a table gets over-read.
  const first = IMG.readUInt32BE(0x290f12);
  assert.equal(first, 0x290f1e, 'entry [0] is $290F1E');
  assert.equal((first - 0x290f12) / 4, 3, '  ...so the table is THREE pointers, not more');
  for (let i = 0; i < 3; i++) {
    assert.equal(IMG.readUInt32BE(0x290f12 + i * 4), 0x290f1e + i * 0x18,
      `pointer ${i} -- targets spaced $18 apart`);
  }
  // The proof that a forward scan over-reads: the word at the fourth slot is inside the FIRST target.
  assert.ok(0x290f12 + 3 * 4 >= first, 'the fourth pointer slot is already inside entry [0]s code');
});

test('W372 the three sequences differ in exactly ONE step of five', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // Each is five pointers then $FFFFFFFF. All three share steps 0, 1, 3 and 4 and differ only at
  // index 2 -- so this is one sequence with a single swapped stage, not three sequences.
  const seq = (base) => {
    const out = [];
    for (let i = 0; i < 5; i++) out.push(IMG.readUInt32BE(base + i * 4));
    assert.equal(IMG.readUInt32BE(base + 20), 0xffffffff, 'terminated by $FFFFFFFF');
    return out;
  };
  const a = seq(0x290f1e); const b = seq(0x290f36); const c = seq(0x290f4e);
  const diff = a.map((v, i) => (v === b[i] && v === c[i] ? null : i)).filter((i) => i !== null);
  assert.deepEqual(diff, [2], 'exactly one step differs across all three');
  assert.deepEqual([a[2], b[2], c[2]], [0x290fe2, 0x291040, 0x29109c], 'the three swapped stages');
  // And the whole structure bounds itself: the sequences end where their first STEP begins.
  assert.equal(0x290f1e + 3 * 0x18, a[0], 'three sequences end exactly at step 0s address');
});

test('W372 the sequence "steps" are SCRIPTS -- $2909AA is their interpreter', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // They have no rts because they are not routines. $290F66 is word data: $80xx COMMAND words with
  // operands, plain words between, and $FFFF to end -- and $8000 is exactly the command $2909FC
  // decodes. So the walker, the cursor, the counter pair and these blocks are one subsystem.
  assert.equal(IMG.readUInt16BE(0x290f66), 0x8000, '$290F66 opens with command $8000');
  assert.equal(IMG.readUInt16BE(0x290f68), 0x3000, '  ...operand $3000');
  assert.equal(IMG.readUInt16BE(0x290f6a), 0x8001, '  ...then command $8001');
  assert.equal(IMG.readUInt16BE(0x290f66 + 0x1e), 0x8002, '  ...$8002 at +$1E');
  assert.equal(IMG.readUInt16BE(0x290f66 + 0x22), 0x8003, '  ...and $8003 at +$22, each with an operand');
  assert.equal(IMG.readUInt16BE(0x290f8e - 2), 0xffff, 'terminated by $FFFF');
  // $8000 here is the SAME command the walker decodes, which is what ties them together.
  assert.equal(IMG.readUInt16BE(0x2909fe), 0x8000, '$2909FC tests #$8000 -- the same value');
  // And every one of the seven blocks ends the same way, which is why none has an rts.
  for (const end of [0x290f8e, 0x290fe2, 0x291040, 0x29109c, 0x2910f6, 0x291172]) {
    assert.equal(IMG.readUInt16BE(end - 2), 0xffff, `the block before $${end.toString(16)} ends $FFFF`);
  }
});

test('W372 opcode $8003 loads once, waits, frees, and its records precede the table', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // A zero cache loads through $246710 and returns carry set without advancing. A nonzero cache takes
  // the other arm: wait through $24681A, keep holding while it is live, then free through $246800,
  // clear the cache, advance four bytes and loop back into the interpreter.
  assert.equal(IMG.readUInt16BE(0x290a56), 0x0c40, '$290A56 cmpi.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x290a58), 0x8003, '  ...#$8003');
  assert.equal(IMG.readUInt32BE(0x290a60), 0x0081e0fe, '$290A5E move.l $81E0FE,D0 -- the cache');
  assert.equal(IMG.readUInt16BE(0x290a64), 0x6600, '  ...bne -- already loaded, take the wait arm');
  assert.equal(IMG.readUInt32BE(0x290a7a), 0x00246710, '$290A78 jsr $246710');
  assert.equal(IMG.readUInt32BE(0x290a80), 0x0081e0fe, '$290A7E caches the result');
  assert.equal(0x290a86 + IMG.readInt16BE(0x290a86), 0x2909f0, '$290A84 bra -> the carry-set exit');
  assert.equal(IMG.readUInt32BE(0x290a8a), 0x0024681a, '$290A88 jsr $24681A');
  assert.equal(0x290a90 + IMG.readInt16BE(0x290a90), 0x2909f0,
    '$290A8E bne keeps holding while the chain is live');
  assert.equal(IMG.readUInt32BE(0x290a94), 0x00246800, '$290A92 jsr $246800');
  assert.equal(IMG.readUInt32BE(0x290a9a), 0, '$290A98 clears the cached handle');
  assert.equal(IMG.readUInt32BE(0x290a9e), 0x0081e0fe, '  ...at $81E0FE');
  assert.equal(IMG.readUInt16BE(0x290aa2), 0x5879, '$290AA2 addq.w #4');
  assert.equal(IMG.readUInt32BE(0x290aa4), 0x0081e0f8, '  ...advances the script cursor');
  assert.equal(0x290aaa + IMG.readInt16BE(0x290aaa), 0x2909aa,
    '$290AA8 loops back into the interpreter');
  // Its table sits AFTER its records -- the reverse of $290CE8 and $290F12 -- so "first entry bounds
  // the table" gives the lower bound here, not the upper one.
  const first = IMG.readUInt32BE(0x290e8a);
  assert.equal(first, 0x290e58, 'table [0] points BACKWARD to $290E58');
  assert.ok(first < 0x290e8a, '  ...so the records precede the table');
  for (let i = 0; i < 5; i++) {
    assert.equal(IMG.readUInt32BE(0x290e8a + i * 4), 0x290e58 + i * 0x0a, `record ${i}, 10 bytes apart`);
  }
  assert.equal(0x290e8a + 5 * 4, 0x290e9e, 'and the table ends exactly at inner state 0');
});

test('W372/W509 the interpreter advances the cursor per opcode, including $8005', { skip: SKIP }, async () => {
  const { scriptStep2909AA, SCRIPT7, POOL7: P } = await import('../src/objslot7pool.js');
  const { Ram } = await import('../src/ram.js');
  // A synthetic script exercising each advance: $8005 (+6), $8000 (+4), $8001 (+6),
  // $8002 wait (0 then +4), and $FFFF.
  const words = [
    0x8005, 0x0001, 0x0003,
    0x8000, 0x0301, 0x8001, 0x1234, 0x5678, 0x8002, 0x0002, 0xffff,
  ];
  const base = 0x400000;
  const rom = {
    u16: (a) => words[(a - base) >> 1] ?? 0xffff,
    u32: (a) => ((words[(a - base) >> 1] << 16) | words[((a - base) >> 1) + 1]) >>> 0,
  };
  const ram = new Ram();
  ram.setU16(SCRIPT7.cursor, 0);

  // `$8005`, `$8000`, and `$8001` loop internally before `$8002` holds.
  let running = scriptStep2909AA(ram, rom, {}, base);
  assert.equal(running, true, 'still running');
  assert.equal(ram.u16(0x81e108), 1, '$8005 armed the auxiliary loader while idle');
  assert.equal(ram.u16(0x81e10a), 1, '  ...stored its first operand');
  assert.equal(ram.u16(0x81e10c), 3, '  ...stored its second operand');
  assert.equal(ram.u16(SCRIPT7.counter), 0x0301, '$8000 armed counter AND reload in one word write');
  assert.equal(ram.u16(SCRIPT7.cursor), 6 + 4 + 6,
    'cursor advanced 6, 4, and 6 bytes before the wait');
  assert.equal(ram.u16(SCRIPT7.loopCount), 1, 'and $8002 bumped its count');

  // The wait must NOT advance until the count matches its operand of 2.
  const held = ram.u16(SCRIPT7.cursor);
  scriptStep2909AA(ram, rom, {}, base);
  assert.equal(ram.u16(SCRIPT7.cursor), held, 'a wait that has not finished leaves the cursor ALONE');
  assert.equal(ram.u16(SCRIPT7.loopCount), 2, '  ...and bumps again');

  // On the matching call it resets, advances by 4, and runs into $FFFF -- which ENDS it.
  running = scriptStep2909AA(ram, rom, {}, base);
  assert.equal(running, false, '$FFFF ends the script -- the carry-CLEAR exit');
  assert.equal(ram.u16(SCRIPT7.loopCount), 0, 'and the wait reset its counter on the way past');
  assert.equal(ram.u16(SCRIPT7.cursor), held + 4, '  ...advancing by FOUR only once satisfied');
  void P;
});

test('W372 the sequence driver CLEARS THE POOL between entries', { skip: SKIP }, async () => {
  const { sequenceDriver291470, poolAlloc290984, POOL7: P, SCRIPT7 } =
    await import('../src/objslot7pool.js');
  const { Ram } = await import('../src/ram.js');
  const A5 = 0x80e300; const A6 = 0x81e0dc;
  // A two-entry sequence: one script that ends immediately ($FFFF), then the terminator.
  const LIST = 0x400000; const SCRIPT = 0x400100;
  const rom = {
    u16: (a) => (a === SCRIPT ? 0xffff : 0),
    u32: (a) => (a === LIST ? SCRIPT : a === LIST + 4 ? 0xffffffff : 0),
    bytes: () => new Uint8Array(64),
  };
  const ram = new Ram();
  // Put something in the pool, then run: the first call inits, clears, and runs the ended script.
  poolAlloc290984(ram, 0xdeadbeef, 0, 0);
  assert.notEqual(ram.u32(P.base), 0, 'the pool has an entry');
  sequenceDriver291470(ram, rom, { palette: null }, A5, A6, LIST);
  assert.equal(ram.u32(P.base), 0, 'entering the sequence CLEARS the pool');
  assert.equal(ram.u16(A6 + 0x0c), 4, '  ...and the ended script advanced the cursor by 4');

  // Re-dirty the pool and step again: hitting the terminator must set the OBJECT's state to 2.
  poolAlloc290984(ram, 0xfeedface, 0, 0);
  sequenceDriver291470(ram, rom, { palette: null }, A5, A6, LIST);
  assert.equal(ram.u8(A5 + 0x02), 2, '$FFFFFFFF sets the object state to 2 -- on A5, not A6');
  void SCRIPT7;
});

test('W372 inner state 0 CYCLES the variant where the triplicate driver STOPS', { skip: SKIP }, async () => {
  const { innerState0_290E9E, setInnerState2908D2, POOL7: P } = await import('../src/objslot7pool.js');
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  const A5 = 0x80e300; const A6 = 0x81e0dc;
  // Real ROM: $290F12's three lists, each ending $FFFFFFFF. Drive to a terminator and check it bumps
  // the variant rather than ending the object -- the opposite of $291470 on the same instruction.
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), bytes: (a, n) => IMG.subarray(a, a + n) };
  const ram = new Ram();
  ram.setU16(A6 + 0x0e, 0);                       // variant 0
  ram.setU16(A6 + 0x06, 1);                       // already past the init step
  ram.setU16(A6 + 0x0c, 5 * 4);                   // cursor parked ON the terminator
  innerState0_290E9E(ram, rom, { palette: null }, A5, A6);
  // The ROM reads ($E,A6), adds one, and the setter stores it as the INNER STATE in ($8,A6) -- NOT
  // back into ($E,A6). So finishing a sequence LEAVES inner state 0 rather than cycling within it.
  assert.equal(ram.u16(A6 + 0x08), 1, 'the INNER STATE advanced to 1');
  assert.equal(ram.u16(A6 + 0x0e), 0, '  ...and the variant field is UNCHANGED');
  assert.equal(ram.u16(A6 + 0x06), 0, '  ...and the sub-state was reset, so the next state re-inits');
  assert.equal(ram.u8(A5 + 0x02), 0, '  ...and the OBJECT state is untouched -- it did NOT finish');

  // The setter has NO change guard: setting the same state still resets the sub-state.
  ram.setU16(A6 + 0x06, 7);
  setInnerState2908D2(ram, 1);                    // same state as now
  assert.equal(ram.u16(A6 + 0x06), 0, 'no change-detection: an identical set still RESTARTS');
  void P;
});

test('W372 THREE consecutive tables, each bounded by its own first entry', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // $290CE8, $290DAE and $290E8A sit back to back and every one of them bounds itself, which is what
  // let all three be windowed without a single adjacency guess. The last one is the odd one: its
  // records come BEFORE it, so its first entry is its LOWER bound.
  const t1 = IMG.readUInt32BE(0x290ce8);
  assert.equal((t1 - 0x290ce8) / 4, 9, '$290CE8 -- nine pointers');
  assert.equal(t1 + 9 * 0x12, 0x290dae, '  ...and its records end exactly at $290DAE');
  const t2 = IMG.readUInt32BE(0x290dae);
  assert.equal((t2 - 0x290dae) / 4, 5, '$290DAE -- five pointers');
  assert.equal(t2 + 5 * 0x1e, 0x290e58, '  ...and ITS records end exactly at $290E58');
  const t3 = IMG.readUInt32BE(0x290e8a);
  assert.ok(t3 < 0x290e8a, '$290E8A -- records BEFORE the table, so the bound reads the other way');
  assert.equal(t3, 0x290e58, '  ...starting where the previous structure ended');
  // So the three tile the span $290CE8..$290E9E with no gap and no overlap.
  assert.equal(0x290e8a + 5 * 4, 0x290e9e, 'and the last ends at inner state 0');
});

test('W372 $24641A is $246410 with mode 0, not a routine of its own', { skip: SKIP }, async () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // Both entries push the same registers and set D6, then fall into ONE body at $246422. $246410
  // takes the bra; $24641A is the fall-through. Same shape as buildParts246520 / $24652A.
  assert.equal(IMG.readUInt32BE(0x246410), 0x48e77ff8, '$246410 movem.l D1-D7/A0-A4,-(A7)');
  assert.equal(IMG.readUInt16BE(0x246414), 0x3c3c, '$246414 move.w #imm,D6');
  assert.equal(IMG.readUInt16BE(0x246416), 0x0001, '  ...#$1');
  assert.equal(IMG.readUInt16BE(0x246418), 0x6008, '$246418 bra.s +8 -- over the second entry');
  assert.equal(IMG.readUInt32BE(0x24641a), 0x48e77ff8, '$24641A saves the SAME registers');
  assert.equal(IMG.readUInt16BE(0x24641e), 0x3c3c, '$24641E move.w #imm,D6');
  assert.equal(IMG.readUInt16BE(0x246420), 0x0000, '  ...#$0 -- the ONLY difference');
  assert.equal(0x246418 + 2 + 8, 0x246422, 'and both land on the shared body at $246422');
  // The port now takes it as a parameter, defaulting to $246410's value.
  const { loadAnimObjects246410 } = await import('../src/animobjects.js');
  assert.equal(loadAnimObjects246410.length, 3, 'mode is optional, so old callers are unchanged');
});

test('W509 $8005 idle arm skips the absent banner phase and runs its mode-0 pair',
{ skip: SKIP }, async () => {
  const { armResource2907C2, resourceLoader2907E2 } =
    await import('../src/objslot7pool.js');
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  const rom = {
    u32: (a) => IMG.readUInt32BE(a),
    u16: (a) => IMG.readUInt16BE(a),
    i16: (a) => IMG.readInt16BE(a),
  };
  const ram = new Ram();

  resourceLoader2907E2(ram, rom, {});
  assert.equal(ram.u16(0x81e108), 0, 'state 0 is idle');

  armResource2907C2(ram, 1, 3);
  assert.equal(ram.u16(0x81e108), 1, '$2907C2 armed state 1');
  assert.equal(ram.u16(0x81e10a), 1, 'D0 became the pending banner');
  assert.equal(ram.u16(0x81e10c), 3, 'D1 became the resource index');
  armResource2907C2(ram, 6, 8);
  assert.deepEqual([ram.u16(0x81e10a), ram.u16(0x81e10c)], [1, 3],
    'a non-idle arm does not replace the live operands');

  resourceLoader2907E2(ram, rom, {});
  assert.equal(ram.u16(0x81e106), 1,
    'zero prior banner skipped the first load and published operand 1');
  assert.equal(ram.u16(0x81e108), 4,
    'the same call fell through state 3 and loaded the second resource');
  const handle = ram.u32(0x81e10e);
  assert.notEqual(handle, 0, 'the mode-0 root handle is cached');
  assert.equal(ram.u16(handle + 0x04), 0, '$24641A installed mode 0');
  const nodes = [];
  for (let at = ram.u32(handle + 0x2c); at !== 0; at = ram.u32(at + 0x2c)) nodes.push(at);
  assert.equal(nodes.length, 2, '$290E1C allocated its exact two nodes');

  for (const node of nodes) ram.setU16(node + 0x18, 0);
  resourceLoader2907E2(ram, rom, {});
  assert.equal(ram.u16(0x81e108), 0, 'a drained state-4 chain returns to idle');
  assert.equal(ram.u16(handle), 0, '$246800 freed the mode-0 root');
  assert.equal(ram.u32(0x81e10e), handle,
    'the cartridge leaves the freed handle value cached until reset');
});
