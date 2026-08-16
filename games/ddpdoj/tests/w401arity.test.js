// W401 -- TWO LIVE DEFECTS IN SHIPPED CODE, AND THE TESTS THAT WOULD HAVE CAUGHT THEM.
//
// Both defects survived because nothing DROVE the code. Every static check in this suite passed:
// the files parse, the handlers are registered, the ROM bytes match. So every test here RUNS the
// handler, and the ROM-byte tests exist only to say WHY the runtime shape is the right one.
//
//   DEFECT 1  `handlers.js retireCheck4C` called `packedAdd`, a NON-EXPORTED local in
//             `stage3carrier.js` that was never imported -- `ReferenceError` on every frame that
//             reached type $4C's retire emitter.
//   DEFECT 2  `movement.js` exports `scrollCompensate(ram, a5)`. EIGHT sites in `handlers.js`
//             called it with FOUR arguments (`ram, rom, a5, ctx.unported`), so `rom` arrived as
//             `a5` and `ram.u32(a5 + 6)` threw `RangeError: [object Object]6 is outside main RAM`
//             on frame 0 of eight stage-5 types. The brief said SIX sites; there are EIGHT.
//
// The arity question is settled by the cartridge, not by the majority: $24179E reads TWO RAM
// globals, writes ONE RAM word, and touches no ROM and no context. See the first test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { AimTables } from '../src/aim.js';
import { MoveTables } from '../src/vectors.js';
import { handlerMap, TYPE_SPECS } from '../src/handlers.js';
import { scrollCompensate } from '../src/movement.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS } from '../src/spritequeue.js';
import { POOL_B, B } from '../src/effects.js';
import { drawByte242B3C, drawWord242EC2 } from '../src/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false : 'the ROM image is absent; skip, not pass';

const TBL = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(TBL);
const json = HAVE ? JSON.parse(readFileSync(TBL, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const TABLES = HAVE ? new MoveTables(json, ROM) : null;
const SKIP_RUN = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const T4C = TYPE_SPECS.get(0x4c);

// ============================================================ the frame driver ===
// Copied in shape from `w372type4crun.test.js`: a scratch record clear of the live table, and the
// sprite-queue counters reset the way the real frame driver resets them (a bare handler call does
// not, and the write address then walks forward into the scratch record).
const A5 = 0x8137c0;
const A6 = 0x8139c0;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);                     // ($6,A5) -> the sub-record
  ram.setU16(A6 + 0x02, 0x2000);                 // position, on screen
  ram.setU16(A6 + 0x04, 0x2000);
  // A POSITIVE hp pool at ($1A,A5), so the record is alive. The VALUE matters: this is a LONG and
  // its low half IS ($1C,A5), which type $49 reads as a sweep index ($27170A bounds it at 30
  // entries). $7FFF here makes $49 throw Unreached for a reason that has nothing to do with the
  // defect under test, so the pool is set with a zero low half.
  ram.setU32(A5 + 0x1a, 0x00010000);
  // W402: the burst pair is no longer the only thing arm B spawns -- $270030 walks $27017E through
  // $26C74E FIRST, and those six rows land in the same pool. Attribution by SITE is what keeps the
  // angle assertion below about the bursts and not about the list.
  const bursts = [];
  const ctx = {
    tables: TABLES, rom: ROM, aim: HAVE ? new AimTables(ROM) : null,
    unported: log, unportedLog: log, notes: log,
    bulletSpawn: () => {}, soundPost: () => {},
    effectSpawn: (kind, site, slot) => {
      if (site === 0x270056 || site === 0x27007c) bursts.push(slot);
    },
  };
  for (const b of BUCKETS) ram.setU16(b.counter, 0);
  return { ram, ctx, log, bursts };
}

const run = (f, addr) => handlerMap().get(addr)(f.ram, ROM, A5, f.ctx);

// The eight sites that passed FOUR arguments, by the type whose handler contains them.
const FOUR_ARG_SITES = [
  [0x271640, '$49', '$2716D2'], [0x271a64, '$4A', '$271B10'],
  [0x271d48, '$4B', '$271DE4'], [0x27133a, '$48', '$2713D4'],
  [0x26d7d0, '$47', '$26D8D2'], [0x26de32, '$43', '$26DE46'],
  [0x272424, '$55', '$2724B6'], [0x2710e2, '$46', '$271110'],
];
// The eight sites in the same file that already passed TWO, so the fix is driven from both sides.
const TWO_ARG_SITES = [
  [0x27687e, '$8B'], [0x270e36, '$45'], [0x276702, '$8A'], [0x272aac, '$20'],
  [0x29700c, '$24'], [0x2647a6, '$37'], [0x264e82, '$3B'], [0x29bb64, '$4D'],
];

// ======================================================== DEFECT 2, from the ROM ===

test('W401 $24179E reads TWO RAM globals and touches NO ROM -- so the arity is (ram, a5)',
  { skip: SKIP_IMG }, () => {
    // THE WHOLE ROUTINE, six instructions, from `tools/aligned.py sweep 0x24179E 0x2417BC`.
    // Not one of them has a ROM operand, and there is no `jsr` to anything that could need a
    // context or an unported log. A four-argument call was never describing this code.
    assert.equal(IMG.readUInt16BE(0x24179e), 0x4a79, '$24179E tst.w <abs.l>');
    assert.equal(IMG.readUInt32BE(0x2417a0), 0x008130d2, '... of $8130D2, the freeze word (RAM)');
    assert.equal(IMG.readUInt16BE(0x2417a4), 0x6600, '$2417A4 bne.w');
    // TRAP 4: the target is the EXTENSION WORD's address + the displacement.
    assert.equal(IMG.readUInt16BE(0x2417a6), 0x000e, '... disp $E');
    assert.equal(0x2417a6 + 0x0e, 0x2417b4, '... so it lands on the rts, not past it');
    assert.equal(IMG.readUInt16BE(0x2417a8), 0x2039, '$2417A8 move.l <abs.l>,D0');
    assert.equal(IMG.readUInt32BE(0x2417aa), 0x0080b03c, '... of $80B03C, the scroll accumulator (RAM)');
    assert.equal(IMG.readUInt16BE(0x2417ae), 0x4840, '$2417AE swap D0');
    assert.equal(IMG.readUInt32BE(0x2417b0), 0xd16e0002, '$2417B0 add.w D0,($2,A6)');
    assert.equal(IMG.readUInt16BE(0x2417b4), 0x4e75, '$2417B4 rts -- and TRAP 5, it sits AT the end');
    // Which is exactly two inputs: the RAM image and the record. The port agrees.
    assert.equal(scrollCompensate.length, 2,
      'scrollCompensate must declare exactly (ram, a5); a third parameter would be inventing one');
  });

test('W401 all EIGHT four-argument sites run a frame without throwing', { skip: SKIP_RUN }, () => {
  // BEFORE THE FIX every one of these threw on frame 0:
  //   RangeError: [object Object]6 is outside main RAM
  // because `rom` arrived where `a5` was expected and `ram.u32(a5 + MOVER.subRec)` stringified it.
  for (const [addr, name, site] of FOUR_ARG_SITES) {
    const f = world();
    assert.doesNotThrow(() => run(f, addr),
      `type ${name} handler $${addr.toString(16)} (scrollCompensate at ${site})`);
  }
});

test('W401 the eight already-two-argument sites still run, so the fix did not shift the others',
  { skip: SKIP_RUN }, () => {
    for (const [addr, name] of TWO_ARG_SITES) {
      const f = world();
      assert.doesNotThrow(() => run(f, addr), `type ${name} handler $${addr.toString(16)}`);
    }
  });

test('W401 the compensation ACTUALLY LANDS: +$02 moves by the HIGH word of $80B03C',
  { skip: SKIP_RUN }, () => {
    // A handler that no longer throws could still be calling a no-op. This drives the value
    // through a real handler and reads the record back. Type $43 ($26DE46) is the shortest path.
    // `move.l $80b03c,D0 / swap D0 / add.w D0,($2,A6)`: the added word is the ORIGINAL HIGH half.
    const f = world();
    f.ram.setU32(0x80b03c, 0x01230000);            // high word $0123, low word $0000
    const before = f.ram.u16(A6 + 0x02);
    run(f, 0x26de32);
    assert.equal(f.ram.u16(A6 + 0x02), (before + 0x0123) & 0xffff,
      'the HIGH word was added; reading $80B03E instead would have added $0000 and moved nothing');
  });

test('W401 the freeze word still gates it, through the same handler', { skip: SKIP_RUN }, () => {
  // The first instruction of $24179E. If a future "fix" reintroduces an argument by widening the
  // function, this is the behaviour that must survive.
  const f = world();
  f.ram.setU32(0x80b03c, 0x01230000);
  f.ram.setU16(0x8130d2, 1);                       // frozen
  const before = f.ram.u16(A6 + 0x02);
  run(f, 0x26de32);
  assert.equal(f.ram.u16(A6 + 0x02), before, 'frozen: $2417A4 bne took the rts and nothing moved');
});

// ======================================================== DEFECT 1, from the ROM ===

test('W401 $270048/$27006E are addi.l -- a FULL 32-bit add, so no packed half-word helper',
  { skip: SKIP_IMG }, () => {
    // This is what `packedAdd` was standing in for. `stage3carrier.js` has three DIFFERENT packed
    // helpers (packedAdd / packedLowAdd / packedHighAdd) and picking the wrong one is a real risk,
    // so the width is pinned here: `06 82` is `addi.l #<data32>,D2`.
    assert.equal(IMG.readUInt16BE(0x270048), 0x0682, '$270048 addi.l #imm,D2');
    assert.equal(IMG.readUInt32BE(0x27004a), 0xf8000800, '... #$F8000800');
    assert.equal(IMG.readUInt16BE(0x27006e), 0x0682, '$27006E addi.l #imm,D2');
    assert.equal(IMG.readUInt32BE(0x270070), 0x01fff800, '... #$01FFF800');
    // and the operand it adds to is the WHOLE longword at ($2,A6), loaded as a long.
    assert.equal(IMG.readUInt32BE(0x270044), 0x242e0002, '$270044 move.l ($2,A6),D2');
    assert.equal(IMG.readUInt32BE(0x27006a), 0x242e0002, '$27006A move.l ($2,A6),D2');
  });

test('W401 both bursts draw from $242B3C, not $242EC2', { skip: SKIP_IMG }, () => {
  // The port called `drawWord242EC2`. `stage5type44.js:406` records the same claim in words --
  // "$242B3C here, $242EC2 there" -- and the cartridge contradicts it at both addresses.
  assert.equal(IMG.readUInt16BE(0x270036), 0x4eb9, '$270036 jsr <abs.l>');
  assert.equal(IMG.readUInt32BE(0x270038), 0x00242b3c, '... $242B3C');
  assert.equal(IMG.readUInt16BE(0x27005c), 0x4eb9, '$27005C jsr <abs.l>');
  assert.equal(IMG.readUInt32BE(0x27005e), 0x00242b3c, '... $242B3C');
  // and the angle is built with BYTE operations, which is why the port masks to a byte.
  assert.equal(IMG.readUInt16BE(0x27003c), 0xe300, '$27003C asl.b #1,D0');
  assert.equal(IMG.readUInt16BE(0x27003e), 0x1200, '$27003E move.b D0,D1');
  assert.equal(IMG.readUInt32BE(0x270040), 0x06010040, '$270040 addi.b #$40,D1');
  assert.equal(IMG.readUInt32BE(0x270066), 0x060100c0, '$270066 addi.b #$C0,D1');
});

test('W401 type $4C\'s retire emitter RUNS -- the branch that threw ReferenceError',
  { skip: SKIP_RUN }, () => {
    // ($9F,A6) non-zero enters $26FFE8's body. Nothing in the whole suite had ever set it, which
    // is the entire reason a call to an undeclared function shipped.
    // W402: ($86,A6) = 1 with the countdown one frame from zero is what reaches the emitter now.
    // When this was written the port had no gate, so ($86,A6) = 0 reached it as well; $270014 says
    // otherwise and $270094 -- arm C -- is what ($86,A6) = 0 really runs.
    const f = world();
    f.ram.setU16(A6 + T4C.damageAccumAt, 0x7fff);
    f.ram.setU8(A6 + 0x9f, 1);
    f.ram.setU8(A6 + 0x86, 1);
    f.ram.setU8(A6 + 0x88, 1);
    assert.doesNotThrow(() => run(f, T4C.handler), 'the retire emitter frame');
  });

test('W401 the two bursts land at the EXACT 32-bit biased positions', { skip: SKIP_RUN }, () => {
  // Not just "it did not throw": the value `packedAdd` was supposed to produce is asserted. A
  // half-word helper would wrap at $0000FFFF and never produce these.
  const f = world();
  f.ram.setU16(A6 + T4C.damageAccumAt, 0x7fff);
  f.ram.setU16(A6 + 0x02, 0x2000);
  f.ram.setU16(A6 + 0x04, 0x2000);
  f.ram.setU8(A6 + 0x9f, 1);
  f.ram.setU8(A6 + 0x86, 1);          // W402: arm B, gated at $270014 -- this read 0 before the gate
  f.ram.setU8(A6 + 0x88, 1);          // ...with $27001E's countdown one frame from zero
  const pos = f.ram.u32(A6 + 0x02);
  run(f, T4C.handler);
  // $26FFF0 subi.w #$40,($2,A6) runs BEFORE the emitter, so the base is the DECREMENTED position.
  const base = (((pos >>> 16) - 0x40) & 0xffff) * 0x10000 + (pos & 0xffff);
  const want = [(base + 0xf8000800) >>> 0, (base + 0x01fff800) >>> 0];
  const seen = new Set();
  for (let n = 0; n < POOL_B.slots; n++) {
    const a0 = POOL_B.base + n * POOL_B.stride;
    if (f.ram.u16(a0 + B.status) !== 0) seen.add(f.ram.u32(a0 + B.pos));
  }
  for (const w of want) {
    assert.ok(seen.has(w >>> 0),
      `an effect at $${(w >>> 0).toString(16)} (base $${base.toString(16)}); saw `
      + `${[...seen].map((v) => '$' + v.toString(16)).join(' ')}`);
  }
});

test('W401 the burst ANGLES prove the emitter draws from $242B3C', { skip: SKIP_RUN }, () => {
  // TRAP 21. The ROM-byte test above asserts the cartridge; it does NOT drive the port, so
  // reverting `drawByte242B3C` to `drawWord242EC2` leaves it green. This one reddens, because the
  // two generators bump the SAME counter ($803917) and read the SAME state word ($803916) and
  // differ ONLY in the table they index -- so the emitter's choice is visible in nothing but the
  // angle it hands to `bigBurst28B4BE`.
  const SEED = 0x0000;
  const f = world();
  f.ram.setU16(0x803916, SEED);
  f.ram.setU16(A6 + T4C.damageAccumAt, 0x7fff);
  f.ram.setU8(A6 + 0x9f, 1);
  f.ram.setU8(A6 + 0x86, 1);          // W402: arm B's gate, and its countdown
  f.ram.setU8(A6 + 0x88, 1);
  run(f, T4C.handler);

  assert.equal(f.bursts.length, 10, 'ten particles, from the two $28B4BE sites in arm B');
  const actual = f.bursts.map((a0) => f.ram.u8(a0 + B.angle));

  // Replay the draw sequence on a mirror: one emitter draw per burst, then $28B4BE's five
  // per-particle draws ($28B4DC jsr $242B3C / $28B4E2 asr.b #2 / $28B4E4 add.b).
  const replay = (emitterDraw) => {
    const m = new Ram();
    m.setU16(0x803916, SEED);
    const out = [];
    for (const turn of [0x40, 0xc0]) {
      const r = emitterDraw(m, ROM) & 0xff;
      const base = (((r << 1) & 0xff) + turn) & 0xff;
      for (let p = 0; p < 5; p++) {
        const r2 = drawByte242B3C(m, ROM);
        out.push((base + ((r2 >= 0x80 ? r2 - 0x100 : r2) >> 2)) & 0xff);
      }
    }
    return out;
  };
  const withB3C = replay(drawByte242B3C);
  const withEC2 = replay(drawWord242EC2);

  // The test is only worth running if the seed actually separates the two generators.
  assert.notDeepEqual(withB3C, withEC2,
    `seed $${SEED.toString(16)} must separate $242B3C from $242EC2, or this asserts nothing`);
  assert.deepEqual(actual, withB3C, 'the ten particle angles come from the $242B3C table');
});

// ============================== THE GAP THIS UNIT DID NOT CLOSE, PINNED TO BYTES ===
//
// W401: `retireCheck4C` transcribed the BODY of one of $26FFE8's three arms, and these assertions
// existed so the gap could not quietly drift. W402 CLOSED IT -- all three arms are ported and
// `tests/w402retire.test.js` drives them. The assertions below are unchanged and still true of the
// cartridge; only the prose that called the other two arms MISSING has been corrected, because a
// stale note's text is exactly what trap 14 is about.

test('W401 $26FFE8 has THREE arms on ($86,A6) -- W402 ported the two that were missing',
  { skip: SKIP_IMG }, () => {
    assert.equal(IMG.readUInt32BE(0x26ffe8), 0x4a2e009f, '$26FFE8 tst.b ($9F,A6)');
    // arm A: == 2, ported.
    assert.equal(IMG.readUInt16BE(0x270000), 0x0c2e, '$270000 cmpi.b');
    assert.equal(IMG.readUInt32BE(0x270002), 0x00020086, '... #$2,($86,A6)');
    // arm B: == 1. THE GATE AND THE COUNTDOWN ARE NOT IN THE PORT.
    assert.equal(IMG.readUInt16BE(0x270014), 0x0c2e, '$270014 cmpi.b');
    assert.equal(IMG.readUInt32BE(0x270016), 0x00010086, '... #$1,($86,A6) -- the gate; W402');
    assert.equal(IMG.readUInt32BE(0x27001e), 0x532e0088, '$27001E subq.b #1,($88,A6) -- W402');
    assert.equal(IMG.readUInt16BE(0x270082), 0x4eb9, '$270082 jsr');
    assert.equal(IMG.readUInt32BE(0x270084), 0x0028c310, '... $28C310, the cue -- W402');
    assert.equal(IMG.readUInt32BE(0x270088), 0x1d7c0010, '$270088 move.b #$10,($88,A6) -- W402');
    assert.equal(IMG.readUInt32BE(0x27008e), 0x1d7c0002, '$27008E move.b #$2,($86,A6) -- W402');
    // arm C: == 0. ABSENT ENTIRELY.
    assert.equal(IMG.readUInt16BE(0x270094), 0x0c2e, '$270094 cmpi.b');
    assert.equal(IMG.readUInt32BE(0x270096), 0x00000086, '... #$0,($86,A6) -- the arm W402 ported');
    // TRAP 3: ONE WORD LITERAL COVERS TWO BYTE FIELDS -- $88 = $10 and $89 = $06.
    assert.equal(IMG.readUInt16BE(0x27011c), 0x3d7c, '$27011C move.w #imm,(d16,A6)');
    assert.equal(IMG.readUInt32BE(0x27011e), 0x10060088, '... #$1006,($88,A6) -- $88=$10, $89=$06');
    // and the shared carry stubs the docstring names.
    assert.equal(IMG.readUInt32BE(0x270128), 0x027cfffe, '$270128 andi.w #$FFFE,SR -- carry CLEAR');
    assert.equal(IMG.readUInt16BE(0x27012c), 0x4e75, '$27012C rts');
  });

test('W401 $270122 is the ONLY writer of ($86,A6) = 1 that can reach a type-$4C record',
  { skip: SKIP_IMG }, () => {
    // TRAP 25: a branch is invisible until something sets its byte. Arm B is gated on ($86,A6)==1
    // and the sole instruction in the $2xxxxx program that stores 1 there sits at $270122 -- which
    // was inside the arm the port did not have, so arm B was unreachable in play. W402 ported arm C
    // and measured the consequence: the burst now fires on frame 124 of the retire and not before.
    const pat = Buffer.from([0x1d, 0x7c, 0x00, 0x01, 0x00, 0x86]);
    const at = [];
    for (let i = IMG.indexOf(pat); i !== -1; i = IMG.indexOf(pat, i + 1)) at.push(i);
    assert.deepEqual(at, [0x16f176, 0x270122],
      'move.b #$1,($86,A6) occurs exactly twice in the 6 MB image');
    // The other one is not a coincidence and it is not a second caller: $16F068 is an
    // instruction-for-instruction twin of $270014 with DIFFERENT jsr targets, so it is a second
    // build of this code rather than a relocation of it. `claimed.py $16F068` says UNCLAIMED.
    assert.equal(IMG.readUInt32BE(0x16f068), 0x0c2e0001, '$16F068 cmpi.b #$1,...');
    assert.equal(IMG.readUInt16BE(0x16f06c), 0x0086, '... ($86,A6) -- the same gate');
    assert.equal(IMG.readUInt32BE(0x16f072), 0x532e0088, '$16F072 subq.b #1,($88,A6)');
    assert.equal(IMG.readUInt32BE(0x16f09c), 0x0682f800, '$16F09C addi.l #$F800.. -- the same bias');
    assert.notEqual(IMG.readUInt32BE(0x16f086), 0x0026c74e,
      '$16F084 jsr targets $16B7B0, NOT $26C74E, so the two copies are not the same code relocated');
  });
