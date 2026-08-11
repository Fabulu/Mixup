// W275: `$24A6B4`, the SHIP'S DYING ANIMATION, and the compare that reaches it.
//
// W274 found that `$24A448 bmi` goes to the draw while `$24A460 bmi` goes to the RTS
// -- the two ship entries read bit 15 with opposite senses -- and could not ship the
// fix, because flipping it without the walker turned the three real-death tests into
// throws. This wave ports the walker and flips the compare, so both land together.
//
// Wave 12's measurement was right and its conclusion was not: bit 8 is never set over
// all 2,233 drawn frames of `fly-around`, because `fly-around` contains no death.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { Unreached } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { P, RAM } from '../src/machine.js';
import { BUCKETS, NAMED_BUCKETS } from '../src/spritequeue.js';
import { drawShipAlt, scriptWalker24A6B4 } from '../src/shipsprite.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const PTR_TABLE = 0x255b7c;      // $24A120 move.l #$255B7C,($14,A6)
const REC = RAM.player1;
const B19 = BUCKETS[NAMED_BUCKETS.player];

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}
/** The state the DEATH path leaves: `$24A118 andi.w #$2000 / $24A11C bset #$0`. */
function dying(ram, ptr = PTR_TABLE, counter = 6) {
  ram.setU16(REC + P.state, 0x2100);
  ram.setU32(REC + P.hitXPlus, ptr);          // $24A120 the PROGRAM POINTER
  ram.setU16(REC + 0x18, counter);            // $24A128 move.w #$6,($18,A6)
  ram.setU16(REC + P.posY, 0x1179);
  ram.setU16(REC + P.posX, 0x1c00);
}
const records = (ram) => ram.u16(B19.counter) / 12;
const recordAt = (ram, i) => [0, 2, 4, 6, 8, 10].map((k) => ram.u16(B19.buffer + i * 12 + k));

// ============================================== 1. THE COMPARE, BOTH SENSES

test('W275 $24A458 returns on bit 15 SET and walks on bit 15 CLEAR', { skip: SKIP }, () => {
  // The inversion W274 found. `$24A460 bmi $24A46A` and `$24A46A` IS the rts, which
  // is the opposite of `$24A448 bmi $24A482`.
  const live = world();
  live.ram.setU16(REC + P.state, 0x8100);     // live AND bit 8
  drawShipAlt(live.ram, REC, live.ctx);
  assert.equal(records(live.ram), 0, 'bit 15 set -> rts, even with bit 8');

  const dead = world();
  dying(dead.ram);
  drawShipAlt(dead.ram, REC, dead.ctx);
  assert.ok(records(dead.ram) > 0, 'bit 15 clear and bit 8 set -> the walker ran');
});

test('W275 bit 15 clear with bit 8 CLEAR still returns', { skip: SKIP }, () => {
  const f = world();
  dying(f.ram);
  f.ram.setU16(REC + P.state, 0x2000);        // no bit 8
  drawShipAlt(f.ram, REC, f.ctx);
  assert.equal(records(f.ram), 0, '$24A462 btst #8 / bne not taken');
});

// ================================================= 2. THE WALKER'S OWN GATES

test('W275 state bit 2 stops the walker before anything', { skip: SKIP }, () => {
  // $24A6B4 btst #$2,(A6) / bne $24A6B2 -- bit 2 of BYTE 0, i.e. bit 10 of the word.
  const f = world();
  dying(f.ram);
  f.ram.setU16(REC + P.state, 0x2100 | 0x0400);
  scriptWalker24A6B4(f.ram, REC, f.ctx);
  assert.equal(records(f.ram), 0, 'nothing enqueued');
  assert.equal(f.ram.u16(REC + 0x18), 6, 'and the counter was not even decremented');
});

test('W275 the counter draws the ship\'s OWN record for exactly six frames',
  { skip: SKIP }, () => {
    // $24A6BA tst.w ($18,A6) / beq; $24A6C0 subq.w #1 THEN jsr $23F104. Decrement
    // before the enqueue, so a seed of 6 gives six frames -- and the frames after it
    // still walk the program, they just stop adding the ship.
    const f = world();
    dying(f.ram);
    const perFrame = [];
    for (let n = 0; n < 8; n++) {
      f.ram.setU16(B19.counter, 0);
      scriptWalker24A6B4(f.ram, REC, f.ctx);
      perFrame.push(records(f.ram));
    }
    assert.equal(f.ram.u16(REC + 0x18), 0, 'the counter reached zero');
    // Six frames with the extra ship record, then two without it.
    assert.deepEqual(perFrame.slice(0, 6), Array(6).fill(perFrame[0]));
    assert.equal(perFrame[6], perFrame[0] - 1, 'frame 7 drops the ship record');
    assert.equal(perFrame[7], perFrame[6], 'and stays dropped');
  });

// ================================================ 3. THE PROGRAM ITSELF

test('W275 the pointer is DOUBLY indirect, and $255B7C[0] is the first stream',
  { skip: SKIP }, () => {
    // $24A6CA movea.l ($14,A6),A2 / $24A6CE movea.l (A2),A2.
    assert.equal(ROM.u32(PTR_TABLE), 0x255c18, 'entry 0 -> $255C18');
    const f = world();
    dying(f.ram, PTR_TABLE, 0);          // counter 0, so only the program's records
    scriptWalker24A6B4(f.ram, REC, f.ctx);
    // $255C18's stream is: op 0 (setup), op $000642B4 (emit), $FFFFFFFF (end).
    assert.equal(records(f.ram), 1, 'exactly one record');
    const r = recordAt(f.ram, 0);
    assert.equal((r[2] << 16 | r[3]) >>> 0, 0x000642b4,
      'and D2 is the OPCODE ITSELF -- the long that was not 0, 1 or 2 IS the sprite');
    assert.equal(r[4], 0x0e50, 'D3 is ($2e,A6), the word op 0 stashed');
  });

test('W275 op 0 stashes a LONG and a WORD, and the emit adds the long in ONE 32-bit add',
  { skip: SKIP }, () => {
    // $24A6D6/$24A6DA then $24A6F0 move.l ($2,A6),D1 / add.l ($2a,A6),D1. The add is
    // 32-bit, so a carry out of the SHORT axis reaches the long one. $255C18's stashed
    // long is $ED00F600 and posY/posX are one longword.
    const f = world();
    dying(f.ram, PTR_TABLE, 0);
    scriptWalker24A6B4(f.ram, REC, f.ctx);
    assert.equal(f.ram.u32(REC + 0x2a), 0xed00f600, 'op 0 stashed the long');
    assert.equal(f.ram.u16(REC + 0x2e), 0x0e50, 'and the word');
    // Predict the record's position field the way $23F294 computes it.
    const pos = ((f.ram.u32(REC + P.posY) + 0xed00f600) >>> 0);
    const want = ((((pos >> 6) & 0x07ff03ff) | 0x80008000) >>> 0);
    const r = recordAt(f.ram, 0);
    assert.equal((r[0] << 16 | r[1]) >>> 0, want,
      'a 16-bit add per axis would differ here, because $F600 + $1C00 carries');
  });

test('W275 the six-frame animation walks SIX different descriptors', { skip: SKIP }, () => {
  // The pointer table's first six entries are one-emit streams at stride 8, and their
  // descriptors step by $234. That is the dying animation, one frame each.
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const f = world();
    dying(f.ram, PTR_TABLE + i * 4, 0);
    scriptWalker24A6B4(f.ram, REC, f.ctx);
    assert.equal(records(f.ram), 1, `entry ${i} emits one record`);
    const r = recordAt(f.ram, 0);
    seen.push((r[2] << 16 | r[3]) >>> 0);
  }
  assert.equal(new Set(seen).size, 6, 'six DIFFERENT sprites');
  for (let i = 1; i < 6; i++) {
    assert.equal(seen[i] - seen[i - 1], 0x234, `frame ${i} steps by $234`);
  }
});

test('W275 a NEGATIVE opcode ends the walk, and it is the whole-long sign', { skip: SKIP }, () => {
  // $24A6D2 bmi. The pointer table's own last entry is $FFFFFFFF, so the table
  // terminates itself the same way its streams do.
  const entries = [];
  for (let i = 0; i < 0x9c / 4; i++) entries.push(ROM.u32(PTR_TABLE + i * 4));
  assert.equal(entries[entries.length - 1], 0xffffffff,
    'the 39th pointer is the terminator');
  assert.equal(entries.filter((e) => e === 0xffffffff).length, 1, 'and the only one');
});

test('W275 every one of the 38 real streams terminates inside its window', { skip: SKIP }, () => {
  // The extent argument for the $255C18+$1C0 window, checked rather than trusted: if
  // any stream ran past $255DD7 this throws by address instead of reading code.
  let emitted = 0;
  for (let i = 0; i < 0x9c / 4; i++) {
    const ptr = ROM.u32(PTR_TABLE + i * 4);
    if (ptr === 0xffffffff) continue;
    const f = world();
    dying(f.ram, PTR_TABLE + i * 4, 0);
    assert.doesNotThrow(() => scriptWalker24A6B4(f.ram, REC, f.ctx),
      `stream ${i} at $${ptr.toString(16).toUpperCase()} walks to its terminator`);
    emitted += records(f.ram);
    assert.deepEqual(f.log.report(), [], `stream ${i} counted nothing`);
  }
  assert.equal(emitted > 0, true, `and the 38 streams emitted ${emitted} records in total`);
});

test('W275 the window stops before the CODE that pins it', { skip: SKIP }, () => {
  // $255DD8 is `lea $811F72,A6` -- $4DF9 $0081 $1F72. That instruction is what makes
  // $255C18 + $1C0 a measurement instead of a guess, so it must NOT be readable.
  assert.doesNotThrow(() => ROM.u16(0x255dd6), '$255DD6 is the last program word');
  assert.throws(() => ROM.u32(0x255dd6), Unreached,
    'a longword there already crosses into the instruction');
});

// ============================================= 4. THE RUNAWAY GUARD

test('W275 a pointer that is not a program is named, not spun on', { skip: SKIP }, () => {
  // The ROM has no bound on the opcode loop: a stream with no negative long walks the
  // cartridge until it faults. The port stops and says WHERE.
  const f = world();
  // $2600CE's DIP words are five non-negative words; read as longs they are
  // $00020003, $00040000, ... so nothing there terminates.
  f.ram.setU16(REC + P.state, 0x2100);
  f.ram.setU16(REC + 0x18, 0);
  f.ram.setU32(REC + P.hitXPlus, 0x255b7c);
  // Point the FIRST indirection at a table entry whose target has no terminator by
  // aiming at the middle of a stream, past its own end.
  f.ram.setU32(REC + P.hitXPlus, PTR_TABLE);
  assert.doesNotThrow(() => scriptWalker24A6B4(f.ram, REC, f.ctx), 'the real one is fine');
  // And the guard itself: it must be an Unreached naming $24A6D0, not a hang.
  const src = readFileSync(path.join(R, 'src', 'shipsprite.js'), 'utf8');
  const walker = src.slice(src.indexOf('export function scriptWalker24A6B4'));
  assert.match(walker.slice(0, walker.indexOf('const op =')), /unreached\(0x24a6d0/,
    'the loop carries a named bound');
});

// ================================ 5. THE ART, WHICH WAS THE OTHER HALF OF THE FIX

test('W275 every descriptor the dying animation can draw IS in the shipped sheet',
  { skip: SKIP }, () => {
    // Porting the walker without this would have been half a fix: all 49 descriptors
    // were missing from the bundle, so the animation would have computed correctly
    // and drawn nothing -- exactly what docket D3 and D4 were. `export-web.mjs` gains
    // five STRUCTURE_RANGES rows, read off the chain with the --extent probe.
    const manifest = JSON.parse(readFileSync(path.join(R, 'assets', 'manifest.json'), 'utf8'));
    const raw = gunzipSync(readFileSync(path.join(R, 'assets', 'spr', 'streams.u32.gz')));
    const flat = new Uint32Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const have = new Set();
    let acc = 0;
    for (let i = 0; i < manifest.spr.streamCount; i++) {
      acc = (acc + flat[i]) >>> 0;
      have.add(acc);
    }

    // Collect what the walker can emit, by running it rather than by re-deriving the
    // opcode rules: every stream, every record, straight out of bucket 19.
    const descs = new Set();
    for (let i = 0; i < 0x9c / 4; i++) {
      if (ROM.u32(PTR_TABLE + i * 4) === 0xffffffff) continue;
      const f = world();
      dying(f.ram, PTR_TABLE + i * 4, 0);
      scriptWalker24A6B4(f.ram, REC, f.ctx);
      for (let k = 0; k < records(f.ram); k++) {
        const r = recordAt(f.ram, k);
        descs.add(((r[2] << 16) | r[3]) >>> 0);
      }
    }
    assert.equal(descs.size, 49, 'the animation draws 49 distinct sprites');
    const missing = [...descs].filter((d) => !have.has(d))
      .map((d) => '$' + d.toString(16).toUpperCase());
    assert.deepEqual(missing, [], 'and none of them is missing from the sheet');
  });
