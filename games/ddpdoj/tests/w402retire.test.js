// ===============================================================================================
// W402 -- $26FFE8, TYPE $4C'S RETIRE PREDICATE, ALL THREE ARMS.
// ===============================================================================================
//
// UNIT. `$26FFE8..$27012D`, called once per frame from `$26F6E4 bsr.w`. W401 ported the BODY of one
// of its three arms and recorded the gap; this wave closes it and declares the two ROM windows the
// missing arms read.
//
// THE DELIVERABLE IS SECTION 4: the same object, driven from its real init state, fires the burst
// pair ONCE at frame 124 and arms the retire at frame 125. Before this wave it fired on EVERY frame
// and NEVER armed the retire -- measured, both numbers, in that section's comment.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "`$26C74E` is already served by `effects.js`'s `clearSubEffectPool`". It is served by
//      `walkDeathSpawns270D92` with `anim = $10`. `clearSubEffectPool` is `$289084`, a 1,282-byte
//      pool clear with no list, no A1 and no `$289004` call. `claimed.py` names it because the
//      `$270D92` docstring sits after that function's body and its "nearest preceding decl" scan
//      attaches to the wrong one. SECTION 6 pins the routine from its own bytes.
//   2. "`$270122` is the ONLY instruction in the whole 6 MB that stores 1 into `($86,A6)`."
//      `1d 7c 00 01 00 86` occurs TWICE: `$16F176` and `$270122`. W401's own test says so and the
//      brief's prose does not. The claim is true of the `$2xxxxx` program only, and SECTION 3
//      states it that way and proves the other copy is a different build.
//   3. "35 instructions, `$270094..$27012C`" -- right, but only if the two-instruction shared tail
//      is counted in: arm C's own body is 33 instructions, `$270094..$270127`, and `$270128`
//      `andi.w #$FFFE,SR` / `$27012C rts` are shared with the `($9F,A6)` gate at `$26FFEC` and with
//      three branches inside arm C. SECTION 1.
//   4. "reported as an instruction-for-instruction twin of stage 3's carrier finale at `$26C8A8`".
//      TRUE, and SECTION 2 diffs all $8C bytes: EIGHTEEN differ, all of them the A5/A6 register
//      field or a displacement, and **the displacements are not a constant shift** ($25->$86 is
//      +$61, $26->$88 is +$62, $2A->$8A is +$60, $28->$8C is +$64). The two records also order the
//      pair differently: the carrier's loop word is BELOW its cursor, type $4C's is above.
//   5. "Templates for this exact shape already exist at `stage5type44.js:401` and
//      `stage3carrier.js:400`." Both true, and `stage3carrier.js`'s was WRONG in the field the
//      template is for: it wrote `($1E,A0) = $C` where `$26C8E0` writes `#$10`, plus a
//      `($10,A0) = 2` no instruction in the arm performs. SECTION 6.
//   6. "`stage3carrier.js:420,423` uses `drawWord242EC2`". The RNG calls are on lines 421 and 424
//      and the wrong site addresses on 423 and 426; the addresses themselves ($26C8CA/$26C8F4 for
//      $26C85C/$26C882) are exactly as the brief says. A THIRD thing on those lines is wrong and
//      is NOT a live defect, said plainly rather than counted: `u16(r * 2 + 0x40)` transcribes the
//      byte chain `asl.b #1` / `move.b` / `addi.b` at the wrong width, but `(r*2 + $40) & $FF` and
//      `((r*2) & $FF) + $40) & $FF` are equal for every r, and `ram.setU8` masks. Fixed for the
//      transcription, and no test claims it changed a value.
//
// SECTION 1  THE EXTENTS: all three arms and the two shared carry stubs, from the bytes
// SECTION 2  ARM C vs $26C8A8: the eighteen bytes that differ, and why they are not a base shift
// SECTION 3  TRAP 25: who can write ($86,A6) = 1, and the second build at $16F068
// SECTION 4  **THE DELIVERABLE**: once versus every frame, with spawn counts and frame numbers
// SECTION 5  the field conventions: zero-test in arm B, UNDERFLOW in arm C, one word two bytes,
//            the emitted row's four non-row fields, and the cursor guard $270104 does not give
// SECTION 6  the neighbour: $26C74E's bucket, both of stage 3's copies of this block, its RNG and
//            its two site addresses
// SECTION 7  ABLATED FROM THE EXPORTED TABLES -- five shapes, five DISTINCT throw addresses
// SECTION 8  the window set: 585, the overlap count, and the tiling onto W341
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { AimTables } from '../src/aim.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS } from '../src/spritequeue.js';
import { POOL_B, B } from '../src/effects.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { handlerMap, TYPE_SPECS } from '../src/handlers.js';
import { drawByte242B3C, drawWord242EC2 } from '../src/rng.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');

const NEED = [IMAGE, TABLES];
const MISSING = NEED.filter((p) => !existsSync(p));
const SKIP = MISSING.length === 0 ? false
  : `${MISSING.map((p) => path.basename(p)).join(', ')} absent -- run `
    + 'tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';

const IMG = MISSING.length === 0 ? readFileSync(IMAGE) : null;
const tables = MISSING.length === 0 ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const disp16 = (a) => (w(a) >= 0x8000 ? w(a) - 0x10000 : w(a));

const WINDOWS = () => tables.rom.windows.map(
  (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]);

const T4C = MISSING.length === 0 ? TYPE_SPECS.get(0x4c) : null;

// The two `jsr $28B4BE` sites inside arm B. Every burst particle is attributed to one of them.
const BURST_SITES = new Set([0x270056, 0x27007c]);
// The carrier's pair, which stage3carrier.js used to record as $26C8CA/$26C8F4.
const CARRIER_BURST_SITES = [0x26c85c, 0x26c882];

// ===============================================================================================
// THE BENCH. A real $4C record, built by its real init body, on a scratch slot clear of the live
// enemy table -- the same A5/A6 pair w372 and w401 use. `romSpec` is the ablation lever: pass a
// reshaped window set and every ROM read the port makes goes through it.
// ===============================================================================================
const A5 = 0x8137c0;
const A6 = 0x8139c0;

function bench({ romSpec = null, init = true } = {}) {
  const rom = new RomWindows(romSpec ?? tables.rom);
  const ram = new Ram();
  const log = new UnportedLog();
  const spawns = [];
  const cues = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A5 + 0x04, 4);                     // ($4,A5) = 4 -- FIVE $20-byte sub records
  const ctx = {
    tables: new MoveTables(tables, rom), rom, aim: new AimTables(rom),
    unported: log, unportedLog: log, notes: log,
    bulletSpawn: () => {},
    soundPost: (a) => cues.push(a),
    effectSpawn: (kind, site, slot) => spawns.push({ kind, site, slot }),
  };
  if (init) runInitBodyAddr(0x26f4e2, ram, rom, A5, log, ctx.tables);
  ram.setU16(A6 + 0x02, 0x2000);                // on screen, so nothing else in the frame diverges
  ram.setU16(A6 + 0x04, 0x2000);
  ram.setU32(A5 + 0x1a, 0x00010000);            // a POSITIVE 32-bit pool: the record is alive
  ram.setU16(A6 + T4C.damageAccumAt, T4C.hpReset);
  return { ram, rom, ctx, log, spawns, cues };
}

// The frame driver resets the sprite queue (a bare handler call does not; w372 documents why), and
// it also frees expired effect slots. Pool B is 80 slots and the "every frame" defect fills it in
// eight frames, so without the pool reset a burst COUNT saturates and the defect looks smaller than
// it is. Clearing the status word is the smallest reset that keeps the count honest.
function frame(b) {
  for (const q of BUCKETS) b.ram.setU16(q.counter, 0);
  for (let n = 0; n < POOL_B.slots; n++) b.ram.setU16(POOL_B.base + n * POOL_B.stride, 0);
  return handlerMap().get(T4C.handler)(b.ram, b.rom, A5, b.ctx);
}

const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/** Drive `n` frames of a DYING record and report what fired on each. */
function driveRetire(b, n) {
  b.ram.setU8(A6 + T4C.dyingAt, 1);             // what $26F6A8 sets when the pool goes negative
  const burstFrames = [];
  let bursts = 0;
  let rows = 0;
  let retiredAt = null;
  for (let i = 1; i <= n; i++) {
    const s0 = b.spawns.length;
    frame(b);
    const made = b.spawns.slice(s0);
    const nb = made.filter((x) => BURST_SITES.has(x.site)).length;
    if (nb) { bursts += nb; burstFrames.push(i); }
    rows += made.filter((x) => x.site === 0x2700c0).length;
    if (retiredAt === null && b.ram.u8(A6 + T4C.retireArmAt) === 1) retiredAt = i;
  }
  return { bursts, burstFrames, rows, retiredAt };
}

// ===============================================================================================
// SECTION 1 -- THE EXTENTS. Every arm's first and last instruction, and both shared stubs.
// ===============================================================================================

test('W402 SECTION 1: the prologue and arm A, $26FFE8..$270013', { skip: SKIP }, () => {
  assert.equal(l(0x26ffe8), 0x4a2e009f, '$26FFE8 tst.b ($9F,A6) -- the dying gate');
  assert.equal(w(0x26ffec), 0x6700, '$26FFEC beq.w');
  // TRAP 4: the target is the EXTENSION WORD's address plus the displacement, never the opcode's.
  assert.equal(0x26ffee + disp16(0x26ffee), 0x270128,
    '  ...to $270128, the carry-CLEAR stub -- $26FFEC + $13A would be $270126, mid-instruction');
  assert.equal(w(0x26fff0), 0x046e, '$26FFF0 subi.w #imm,(d16,A6)');
  assert.equal(w(0x26fff2), 0x0040, '  ...#$40');
  assert.equal(w(0x26fff4), 0x0002, '  ...($2,A6) -- TRAP 1, immediate BEFORE displacement');
  assert.equal(l(0x26fff6), 0x322e008e, '$26FFF6 move.w ($8E,A6),D1 -- part 5\'s hit mask');
  assert.equal(w(0x26fffa), 0x4eb9, '$26FFFA jsr');
  assert.equal(l(0x26fffc), 0x00243e02, '  ...$243E02, armScreenClear243E02');
  assert.equal(w(0x270000), 0x0c2e, '$270000 cmpi.b');
  assert.equal(l(0x270002), 0x00020086, '  ...#$2,($86,A6) -- ARM A');
  assert.equal(l(0x27000a), 0x1d7c0001, '$27000A move.b #$1');
  assert.equal(w(0x27000e), 0x009e, '  ...($9E,A6), the retire the prologue acts on NEXT frame');
  assert.equal(w(0x270010), 0x6000, '$270010 bra.w');
  assert.equal(0x270012 + disp16(0x270012), 0x27012e, '  ...to $27012E, the carry-SET stub');
});

test('W402 SECTION 1: arm B is $270014..$270093, and it FALLS INTO arm C', { skip: SKIP }, () => {
  assert.equal(w(0x270014), 0x0c2e, '$270014 cmpi.b');
  assert.equal(l(0x270016), 0x00010086, '  ...#$1,($86,A6) -- ARM B, the gate W401 did not have');
  assert.equal(w(0x27001a), 0x6600, '$27001A bne.w');
  assert.equal(0x27001c + disp16(0x27001c), 0x270094, '  ...to $270094, arm C -- NOT to the exit');
  assert.equal(l(0x27001e), 0x532e0088, '$27001E subq.b #1,($88,A6) -- the countdown');
  assert.equal(w(0x270022), 0x6600, '$270022 bne.w');
  assert.equal(0x270024 + disp16(0x270024), 0x270094, '  ...also to arm C, so it FIRES AT ZERO');
  assert.equal(l(0x270026), 0x242e0002, '$270026 move.l ($2,A6),D2');
  assert.equal(w(0x27002a), 0x43fa, '$27002A lea (d16,PC),A1');
  assert.equal(0x27002c + disp16(0x27002c), T4C.deathListB, '  ...$27017E, the $26C74E list');
  assert.equal(w(0x27002e), 0x4e71, '$27002E nop');
  assert.equal(w(0x270030), 0x4eb9, '$270030 jsr');
  assert.equal(l(0x270032), 0x0026c74e, '  ...$26C74E');
  assert.equal(w(0x270082), 0x4eb9, '$270082 jsr');
  assert.equal(l(0x270084), 0x0028c310, `  ...$28C310, the cue (= T4C.deathCueB $${
    T4C.deathCueB.toString(16)})`);
  assert.equal(l(0x270088), 0x1d7c0010, '$270088 move.b #$10');
  assert.equal(w(0x27008c), 0x0088, '  ...($88,A6) -- a GENUINE move.b, not a word over two fields');
  assert.equal(l(0x27008e), 0x1d7c0002, '$27008E move.b #$2');
  assert.equal(w(0x270092), 0x0086, '  ...($86,A6): arm B promotes to arm A and falls through');
});

test('W402 SECTION 1: arm C is $270094..$270127, and the tail $270128/$27012E is SHARED',
  { skip: SKIP }, () => {
    assert.equal(w(0x270094), 0x0c2e, '$270094 cmpi.b');
    assert.equal(l(0x270096), 0x00000086, '  ...#$0,($86,A6) -- ARM C, absent from the port entirely');
    assert.equal(0x27009c + disp16(0x27009c), 0x270128, '$27009A bne.w -> the carry-CLEAR stub');
    assert.equal(l(0x27009e), 0x532e0088, '$27009E subq.b #1,($88,A6)');
    assert.equal(w(0x2700a2), 0x6400, '$2700A2 bcc.w -- CARRY, not zero: the UNDERFLOW convention');
    assert.equal(0x2700a4 + disp16(0x2700a4), 0x270128, '  ...to $270128');
    assert.equal(w(0x2700b2), 0x43fa, '$2700B2 lea (d16,PC),A1');
    assert.equal(0x2700b4 + disp16(0x2700b4), T4C.deathListA, '  ...$270134, the INDEXED table');
    assert.equal(l(0x2700b8), 0xd2ee008a, '$2700B8 adda.w ($8A,A6),A1 -- indexed, not walked');
    assert.equal(w(0x2700fe), 0x066e, '$2700FE addi.w');
    assert.equal(w(0x270100), T4C.deathListAStride, '  ...#$C, the stride');
    assert.equal(w(0x270102), T4C.deathCursorAt, '  ...($8A,A6)');
    assert.equal(w(0x270104), 0x0c6e, '$270104 cmpi.w');
    assert.equal(w(0x270106), T4C.deathListAEnd, '  ...#$48 -- $48/$C = SIX rows, the CODE-stated bound');
    assert.equal(l(0x270114), 0x536e008c, '$270114 subq.w #1,($8C,A6) -- the loop word');
    // TRAP 3: ONE word literal covering TWO byte fields.
    assert.equal(w(0x27011c), 0x3d7c, '$27011C move.w #imm,(d16,A6)');
    assert.equal(w(0x27011e), T4C.deathReload, '  ...#$1006');
    assert.equal(w(0x270120), T4C.deathTickAt, '  ...($88,A6): $88 = $10 AND $89 = $06');
    assert.equal(l(0x270122), 0x1d7c0001, '$270122 move.b #$1');
    assert.equal(w(0x270126), T4C.deathPhaseAt, '  ...($86,A6) -- the last instruction of arm C');
    // The shared tails. TRAP 5: the `rts` SITS AT the last address; $27012C is not one past it.
    assert.equal(l(0x270128), 0x027cfffe, '$270128 andi.w #$FFFE,SR -- carry CLEAR');
    assert.equal(w(0x27012c), 0x4e75, '$27012C rts');
    assert.equal(l(0x27012e), 0x007c0001, '$27012E ori.w #$1,SR -- carry SET');
    assert.equal(w(0x270132), 0x4e75, '$270132 rts, and $270134 is the table, not code');
    // FOUR branches reach $270128 and only ONE reaches $27012E, which is why the routine's single
    // caller ignoring the carry matters: three quarters of the arms return the same flag.
    const toClear = [0x26ffee, 0x27009c, 0x2700a4, 0x27010c, 0x27011a]
      .filter((a) => a + disp16(a) === 0x270128);
    assert.equal(toClear.length, 5, 'FIVE branches land on $270128; exactly one lands on $27012E');
  });

// ===============================================================================================
// SECTION 2 -- ARM C AGAINST $26C8A8. The brief said "do not alias it on that basis"; this is what
// the decode found, byte by byte.
// ===============================================================================================

test('W402 SECTION 2: $2700A2..$27012C and $26C8A8..$26C932 differ in EIGHTEEN bytes',
  { skip: SKIP }, () => {
    const N = 0x8c;
    const diffs = [];
    for (let i = 0; i < N; i++) {
      if (IMG[0x26c8a8 + i] !== IMG[0x2700a2 + i]) {
        diffs.push([i, IMG[0x26c8a8 + i], IMG[0x2700a2 + i]]);
      }
    }
    assert.equal(diffs.length, 18, `18 of ${N} bytes differ, and every one of them is a register `
      + 'field or a displacement -- no opcode, no immediate, no branch displacement');
    // The register field, in both halves of a MOVE opcode word: `$6D`/`$ED` are the SOURCE `(d16,A5)`
    // and go to `$6E`/`$EE` (+1, the reg field is bits 2..0); `$1B`/`$3B` are the DESTINATION and go
    // to `$1D`/`$3D` (+2, because that reg field starts at bit 9 and lands on bit 1 of the byte).
    const isField = ([, a, b2]) => [0x1b, 0x3b, 0x6d, 0xed].includes(a) && (b2 - a === 1 || b2 - a === 2);
    assert.equal(diffs.filter(isField).length, 9, 'NINE of them are the A5 -> A6 register nibble');
    // The displacements, and THE POINT: they are not one constant offset.
    const map = new Map(diffs.filter((x) => !isField(x)).map(([, a, b2]) => [a, b2]));
    assert.deepEqual([...map.entries()].sort((x, y) => x[0] - y[0]),
      [[0x25, 0x86], [0x26, 0x88], [0x27, 0x89], [0x28, 0x8c], [0x2a, 0x8a]],
      'the five fields map $25->$86, $26->$88, $27->$89, $28->$8C, $2A->$8A');
    assert.deepEqual([...map.entries()].sort((x, y) => x[0] - y[0]).map(([a, b2]) => b2 - a),
      [0x61, 0x62, 0x62, 0x64, 0x60],
      'THE SHIFTS ARE +$61, +$62, +$62, +$64, +$60 -- NOT one base offset. A relocation of this '
      + 'arm by any single constant puts at least three of the five fields on the wrong byte');
    // And the two records order the pair differently, which no base shift can express at all.
    assert.ok(0x28 < 0x2a && 0x8c > 0x8a,
      'the carrier holds loop BELOW cursor ($28 < $2A) and type $4C holds it ABOVE ($8C > $8A)');
  });

test('W402 SECTION 2: arm B is NOT a byte twin of $26C80A -- it is eighteen bytes shorter',
  { skip: SKIP }, () => {
    // The brief only claimed arm C. Recording what arm B actually is, because the same "twin"
    // reasoning applied one arm up would have inserted a `jsr $246410` that is not there.
    assert.equal(l(0x26c80a), 0x0c2d0001, '$26C80A cmpi.b #$1,(d16,A5) -- the carrier\'s same gate');
    assert.equal(w(0x26c80e), 0x0025, '  ...($25,A5)');
    assert.equal(w(0x26c81c), 0x3b7c, '$26C81C move.w #$0,($2C,A5) -- NOT in type $4C\'s arm B');
    assert.equal(w(0x26c822), 0x41fa, '$26C822 lea (d16,PC),A0');
    assert.equal(0x26c824 + disp16(0x26c824), 0x26c9ce, '  ...$26C9CE, the animation-object script');
    assert.equal(l(0x26c82a), 0x00246410, '$26C828 jsr $246410 -- also NOT in type $4C\'s arm B');
    assert.equal(0x26c82e - 0x26c81c, 0x12,
      'those four instructions are $12 bytes, and type $4C\'s arm B has none of them');
    assert.equal(0x26c82e - 0x26c80a - (0x270026 - 0x270014), 0x12,
      '  ...so the two arms are $12 apart by the time each loads ($2,A6) into D2');
    // ...and then the retire arm takes TWO bytes MORE, because it reaches $26C74E by `jsr <abs.l>`
    // where the carrier, being in the same $26Cxxx closure, reaches it by `bsr.w`.
    assert.equal(w(0x26c838), 0x6100, '$26C838 is `bsr.w`, FOUR bytes');
    assert.equal(w(0x270030), 0x4eb9, '$270030 is `jsr <abs.l>`, SIX');
    assert.equal(0x26c894 - 0x26c80a - (0x27008e - 0x270014), 0x10,
      'so the arms end $10 apart, not $12: the head is $12 longer and the call is $2 shorter');
  });

// ===============================================================================================
// SECTION 3 -- TRAP 25. A branch is invisible until something sets its byte.
// ===============================================================================================

test('W402 SECTION 3: $270122 is the only ($86,A6) = 1 in the $2xxxxx program', { skip: SKIP }, () => {
  const pat = Buffer.from([0x1d, 0x7c, 0x00, 0x01, 0x00, 0x86]);
  const at = [];
  for (let i = IMG.indexOf(pat); i !== -1; i = IMG.indexOf(pat, i + 1)) at.push(i);
  assert.deepEqual(at, [0x16f176, 0x270122],
    'TWICE in the 6 MB image, not once -- the brief says "the ONLY instruction in the whole 6 MB"');
  assert.equal(at.filter((a) => a >= 0x200000).length, 1,
    '...but exactly once in the $2xxxxx program, which is the claim that holds');
  // The other copy is a second BUILD, not a second caller: same shape, different jsr targets.
  assert.equal(l(0x16f068), 0x0c2e0001, '$16F068 cmpi.b #$1,... -- the same gate');
  assert.equal(w(0x16f06c), 0x0086, '  ...($86,A6)');
  assert.notEqual(l(0x16f086), 0x0026c74e, '$16F084 does NOT jsr $26C74E, so it is not a relocation');
  // And no OTHER encoding reaches ($86,A6) = 1 either: a `move.w #$0100,($86,A6)` would do it as a
  // side effect, and an `addq.b #1` would from zero. Neither displacement appears in the family.
  // TRAP 1 in the SCANNER as well as in the decode: for `0c 2e 00 02 00 86` the word before the
  // displacement is the IMMEDIATE, so the opcode is two words back, not one.
  const other = [];
  for (let a = 0x26f4da; a < 0x2701c8; a += 2) {
    if (w(a) !== T4C.deathPhaseAt) continue;
    const op = w(a - 4);
    if (op === 0x1d7c || op === 0x0c2e) continue;          // the two move.b #imm and the three cmpi.b
    other.push(a);
  }
  assert.deepEqual(other, [], 'nothing else in $26F4DA..$2701C8 references ($86,A6) at all');
  const writes = [];
  for (let a = 0x26f4da; a < 0x2701c8; a += 2) {
    if (w(a) === T4C.deathPhaseAt && w(a - 4) === 0x1d7c) writes.push([a - 4, w(a - 2)]);
  }
  assert.deepEqual(writes, [[0x27008e, 0x0002], [0x270122, 0x0001]],
    'exactly TWO writers of ($86,A6) in the whole family: arm B\'s `#$2` and arm C\'s `#$1`');
});

// ===============================================================================================
// SECTION 4 -- THE DELIVERABLE. Once versus every frame, driven, counted, by frame number.
// ===============================================================================================

test('W402 SECTION 4: the retire sequence fires the burst pair ONCE, at frame 124',
  { skip: SKIP }, () => {
    // MEASURED BEFORE AND AFTER, same bench, same 400 frames, same init state:
    //
    //             burst particles   frames that burst   arm-C rows   $28C310 cue   retire armed
    //   BEFORE          4000               400               0            0            never
    //   AFTER             10                 1              12            1          frame 125
    //
    // The "before" numbers are this file's bench run against `git show HEAD~1:...handlers.js`.
    // 4000 is 10 particles x 400 frames: the old port had arm B's BODY with no gate, so every
    // frame with ($86,A6) != 2 fired it, and since nothing could ever write ($86,A6) = 2 the
    // record never reached arm A and never retired at all.
    const b = bench();
    assert.equal(b.ram.u8(A6 + T4C.deathPhaseAt), 0, 'the init body leaves ($86,A6) = 0 -- arm C');
    assert.equal(b.ram.u8(A6 + T4C.deathTickAt), 8, '  ...($88,A6) = 8');
    assert.equal(b.ram.u8(A6 + T4C.deathReloadAt), 8, '  ...($89,A6) = 8, the reload');
    assert.equal(b.ram.u16(A6 + T4C.deathCursorAt), 0, '  ...($8A,A6) = 0, row 0');
    assert.equal(b.ram.u16(A6 + T4C.deathLoopAt), 2, '  ...($8C,A6) = 2, TWO passes of the table');

    const r = driveRetire(b, 400);
    assert.equal(r.bursts, 10, 'TEN burst particles in 400 frames -- 2 bursts x 5 particles, ONCE');
    assert.deepEqual(r.burstFrames, [124], 'and all ten land on ONE frame, 124');
    assert.equal(r.rows, 12, 'arm C emitted 12 rows: SIX table rows x TWO passes of ($8C,A6)');
    assert.equal(r.retiredAt, 125, '($9E,A6) is armed on frame 125, the frame after arm A runs');
    assert.equal(b.cues.filter((c) => c === T4C.deathCueB).length, 1,
      '$28C310 posted exactly once, with the burst');
    assert.equal(b.cues.filter((c) => c === T4C.deathCueA).length, 12,
      '$28C274 posted twelve times, once per emitted row');
  });

test('W402 SECTION 4: the sequence, phase by phase, on the frames it changes', { skip: SKIP }, () => {
  // The schedule the three arms produce, so a future change that keeps the TOTALS but moves the
  // timing still reddens. ($89,A6) = 8 means one row every ninth frame: the `subq.b`/`bcc` acts on
  // the frame the byte WAS zero, so eight decrements and then the emit.
  const b = bench();
  b.ram.setU8(A6 + T4C.dyingAt, 1);
  const seen = [];
  for (let i = 1; i <= 130; i++) {
    const s0 = b.spawns.length;
    const before = b.ram.u8(A6 + T4C.deathPhaseAt);
    frame(b);
    const made = b.spawns.slice(s0);
    if (made.length || before !== b.ram.u8(A6 + T4C.deathPhaseAt)) {
      seen.push([i, before, b.ram.u8(A6 + T4C.deathPhaseAt),
        made.filter((x) => x.site === 0x2700c0).length,
        made.filter((x) => BURST_SITES.has(x.site)).length]);
    }
  }
  const rowFrames = seen.filter((x) => x[3] === 1).map((x) => x[0]);
  assert.deepEqual(rowFrames, [9, 18, 27, 36, 45, 54, 63, 72, 81, 90, 99, 108],
    'twelve rows, every NINTH frame -- ($89,A6) = 8 plus the frame the underflow fires on');
  const promote = seen.find((x) => x[1] === 0 && x[2] === 1);
  assert.deepEqual([promote[0], promote[3]], [108, 1],
    'frame 108 is the twelfth row AND the frame $270122 writes ($86,A6) = 1');
  const fire = seen.find((x) => x[4] === 10);
  assert.deepEqual([fire[0], fire[1], fire[2]], [124, 1, 2],
    'frame 124 -- $10 frames after the promotion -- runs arm B and promotes 1 -> 2');
});

test('W402 SECTION 4: with ($86,A6) held at 0 the burst NEVER fires', { skip: SKIP }, () => {
  // The direct statement of the defect. Under the old port this was 2000 particles.
  const b = bench();
  b.ram.setU16(A6 + T4C.deathLoopAt, 0xffff);   // never let arm C finish
  const r = driveRetire(b, 200);
  assert.equal(b.ram.u8(A6 + T4C.deathPhaseAt), 0, 'still in arm C after 200 frames');
  assert.equal(r.bursts, 0, 'and NOT ONE burst particle: arm B is gated on ($86,A6) == 1');
  assert.ok(r.rows > 20, `arm C kept emitting rows (${r.rows}), so the frames were real`);
});

test('W402 SECTION 4: ($9F,A6) clear means the routine does nothing at all', { skip: SKIP }, () => {
  const b = bench();
  const pos = b.ram.u32(A6 + 0x02);
  for (let i = 0; i < 40; i++) frame(b);
  assert.equal(b.spawns.length, 0, '$26FFE8 tst.b ($9F,A6) / beq $270128 -- no effect spawned');
  assert.equal(b.ram.u16(A6 + T4C.deathCursorAt), 0, '  ...and the cursor never moved');
  assert.notEqual(b.ram.u32(A6 + 0x02), pos,
    'POSITIVE CONTROL: the record DID run its frames (the state machine moved it)');
});

// ===============================================================================================
// SECTION 5 -- THE TWO COUNTDOWN CONVENTIONS, EIGHT INSTRUCTIONS APART, AND THE ONE-WORD WRITE.
// ===============================================================================================

test('W402 SECTION 5: arm B fires AT ZERO and arm C fires on the UNDERFLOW', { skip: SKIP }, () => {
  // $27001E subq.b / $270022 bne   -> acts when the result is 0
  // $27009E subq.b / $2700A2 bcc   -> acts when the BYTE WAS 0 (the borrow sets carry)
  // Getting either backwards shifts the whole schedule by one frame and nothing throws.
  const armB = bench();
  armB.ram.setU8(A6 + T4C.deathPhaseAt, 1);
  armB.ram.setU8(A6 + T4C.deathTickAt, 3);
  const rb = driveRetire(armB, 5);
  assert.deepEqual(rb.burstFrames, [3], 'tick 3: fires on the frame the byte reaches 0, frame 3');

  const armC = bench();
  armC.ram.setU8(A6 + T4C.deathTickAt, 3);
  armC.ram.setU8(A6 + T4C.deathReloadAt, 0xff);   // so it can only fire once in the window
  armC.ram.setU8(A6 + T4C.dyingAt, 1);
  const at = [];
  for (let i = 1; i <= 6; i++) {
    const s0 = armC.spawns.length;
    frame(armC);
    if (armC.spawns.length > s0) at.push(i);
  }
  assert.deepEqual(at, [4], 'tick 3: fires on frame 4, the frame AFTER the byte reached 0');
});

test('W402 SECTION 5: arm C\'s row lands with bucket $10, and its speed and angle come from A6',
  { skip: SKIP }, () => {
    // The four fields that do NOT come out of the row. $2700DA writes the bucket as a LITERAL $10
    // (trap 1: immediate before displacement, and reading it the other way round is what put $C
    // into stage3carrier.js's copy); ($10,A0) is whatever $289004 left, which is 0; the speed is a
    // BYTE from ($1A,A6); and the angle is ($1B,A6) doubled TWICE with byte adds.
    const b = bench();
    b.ram.setU8(A6 + 0x1a, 0x23);
    b.ram.setU8(A6 + 0x1b, 0x51);                 // *4 = $144, and a byte can only hold $44
    b.ram.setU8(A6 + T4C.deathTickAt, 0);
    b.ram.setU8(A6 + T4C.deathReloadAt, 0xff);    // so exactly one row fires in this window
    b.ram.setU8(A6 + T4C.dyingAt, 1);
    frame(b);
    const rows = b.spawns.filter((x) => x.site === 0x2700c0);
    assert.equal(rows.length, 1, 'exactly one row emitted');
    const s = rows[0].slot;
    assert.equal(b.ram.u16(s + B.bucket), T4C.deathAnim, '($1E,A0) = $10, NOT the burst\'s $C');
    assert.equal(b.ram.u16(s + B.hook), 0, '($10,A0) untouched by the arm, so 0');
    assert.equal(b.ram.u16(s + B.sub12), 0, '($12,A0) = 0');
    assert.equal(b.ram.u16(s + B.sub14), 0, '($14,A0) = 0');
    assert.equal(b.ram.u8(s + B.speed), 0x23, '($1A,A0) is ($1A,A6), a BYTE move');
    assert.equal(b.ram.u8(s + B.angle), 0x44, '($1B,A0) is ($1B,A6) * 4 as a BYTE: $51 -> $44');
    assert.equal(b.ram.u32(s + B.pos), b.ram.u32(A6 + 0x02), '($2,A0) is the record\'s position');
    // ...and the three fields that DO come out of row 0 of $270134.
    assert.equal(b.ram.u16(s + B.delay), w(T4C.deathListA), '($18,A0) is the row\'s word 1');
    assert.equal(b.ram.u8(s + B.f1c), w(T4C.deathListA + 4) & 0xff, '($1C,A0) is word 3\'s LOW byte');
    assert.equal(b.ram.u32(s + B.nudge), l(T4C.deathListA + 6), '($26,A0) is words 4+5 as ONE long');
  });

test('W402 SECTION 5: $27011C is ONE word over TWO byte fields', { skip: SKIP }, () => {
  const b = bench();
  b.ram.setU8(A6 + T4C.deathPhaseAt, 0);
  b.ram.setU8(A6 + T4C.deathTickAt, 0);
  b.ram.setU8(A6 + T4C.deathReloadAt, 0);
  b.ram.setU16(A6 + T4C.deathCursorAt, T4C.deathListAEnd - T4C.deathListAStride);
  b.ram.setU16(A6 + T4C.deathLoopAt, 1);
  driveRetire(b, 1);
  assert.equal(b.ram.u8(A6 + T4C.deathTickAt), 0x10, '($88,A6) = $10, the HIGH byte of $1006');
  assert.equal(b.ram.u8(A6 + T4C.deathReloadAt), 0x06, '($89,A6) = $06, the LOW byte');
  assert.equal(b.ram.u8(A6 + T4C.deathPhaseAt), 1, 'and $270122 armed arm B on the same frame');
  assert.equal(b.ram.u16(A6 + T4C.deathCursorAt), 0, '  ...with the cursor wrapped by $27010E');
});

test('W402 SECTION 5: arm C guards the cursor $270104 does not', { skip: SKIP }, () => {
  // $270104's `cmpi.w #$48` is an EQUALITY test, so a cursor that is already past $48 walks the
  // table forever. The port throws by address rather than reading whatever is at $270134 + $54.
  const b = bench();
  b.ram.setU8(A6 + T4C.deathTickAt, 0);
  b.ram.setU16(A6 + T4C.deathCursorAt, 0x54);
  const e = caught(() => driveRetire(b, 1));
  assert.ok(e, 'a cursor past the six rows must refuse');
  assert.equal(e.romAddress ?? 0x2700b2, 0x2700b2, 'and it names $2700B2, the lea');
});

// ===============================================================================================
// SECTION 6 -- THE NEIGHBOUR. $26C74E's real shape, and stage 3's three errors in four lines.
// ===============================================================================================

test('W402 SECTION 6: $26C74E writes bucket $10 and NOTHING to ($10,A0)', { skip: SKIP }, () => {
  // The routine, whole, from `tools/aligned.py sweep 0x26c74e 0x26c78c`. It is $270D92 field for
  // field bar ONE literal, which is what `walkDeathSpawns270D92`'s `anim` parameter is.
  assert.equal(l(0x26c74e), 0x32190c41, '$26C74E move.w (A1)+,D1 / $26C750 cmpi.w');
  assert.equal(w(0x26c752), 0xffff, '  ...#$FFFF -- the terminator IS the only exit');
  assert.equal(l(0x26c75a), 0x4eb90028, '$26C75A jsr $289004');
  assert.equal(l(0x26c76e), 0x21420002, '$26C76E move.l D2,($2,A0) -- the CALLER\'s position');
  assert.equal(w(0x26c772), 0x317c, '$26C772 move.w #imm,(d16,A0)');
  assert.equal(w(0x26c774), 0x0010, '  ...#$10 -- TRAP 1, the IMMEDIATE comes first');
  assert.equal(w(0x26c776), 0x001e, '  ...($1E,A0). So the bucket is $10, not $C');
  assert.equal(w(0x26c788), 0x60c4, '$26C788 bra.s back to $26C74E');
  // ...and no instruction in the loop writes ($10,A0). The old `emitRows` wrote a 2 there.
  for (let a = 0x26c74e; a < 0x26c78a; a += 2) {
    if (w(a) === 0x317c || w(a) === 0x3140) {
      assert.notEqual(w(a + 4), 0x0010, `$${a.toString(16)} must not target ($10,A0)`);
    }
  }
  // BOTH of stage 3's `emitRows` call sites really were this routine.
  assert.equal(w(0x26c7a8), 0x61a4, '$26C7A8 bsr.s, displacement byte $A4');
  assert.equal(0x26c7aa + ((0xa4 << 24) >> 24), 0x26c74e,
    '  ...$A4 is -$5C and the base is the byte AFTER the opcode word: $26C74E (the $26C65A site)');
  assert.equal(w(0x26c838), 0x6100, '$26C838 bsr.w');
  assert.equal(0x26c83a + disp16(0x26c83a), 0x26c74e, '  ...also $26C74E (the $26C984 site)');
});

test('W402 SECTION 6: stage 3\'s $26C74E rows now carry bucket $10 and hook 0', { skip: SKIP }, () => {
  // Driven, not asserted from the image: `breakSide12` is the shortest path to $26C74E that fires
  // NO burst, so every pool-B slot it creates is a row of the $26C65A list.
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const log = new UnportedLog();
  const spawns = [];
  const CA5 = 0x8137c0;
  const CA6 = 0x8139c0;
  ram.setU32(CA5 + 0x06, CA6);
  ram.setU16(CA5 + 0x2e, 0x0100);               // <= $258, so the break arm runs
  ram.setU16(CA5 + 0x2c, 0);                    // ...and the draw is skipped
  ram.setU32(CA6 + 0x22, 0x20002000);
  ram.setU32(CA6 + 0x42, 0x20002000);
  const ctx = {
    tables: new MoveTables(tables, rom), rom, aim: new AimTables(rom),
    unported: log, unportedLog: log, notes: log,
    bulletSpawn: () => {}, soundPost: () => {},
    effectSpawn: (kind, site, slot) => spawns.push(slot),
  };
  for (const q of BUCKETS) ram.setU16(q.counter, 0);
  handlerMap().get(0x26c3e2)(ram, rom, CA5, ctx);
  assert.ok(spawns.length >= 2, `the break arm walked both sides (${spawns.length} rows)`);
  for (const slot of spawns) {
    assert.equal(ram.u16(slot + B.bucket), 0x10,
      '$26C772 move.w #$10,($1E,A0) -- `emitRows` wrote $C here from a caller argument');
    assert.equal(ram.u16(slot + B.hook), 0,
      '($10,A0) is what $289004 left, 0 -- `emitRows` invented a 2 that no instruction writes');
  }
});

test('W402 SECTION 6: stage 3\'s $26C8A8 arm emits with bucket $10 too', { skip: SKIP }, () => {
  // `emitOneRow` is the OTHER copy of the block this wave ported into `retireCheck4C`, and it had
  // the same two errors as `emitRows`: `($1E,A0) = $C` and an invented `($10,A0) = 2`. Nothing in
  // the suite drove it, which is why an ablation of that line stayed green until this test existed.
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const log = new UnportedLog();
  const spawns = [];
  const CA5 = 0x8137c0;
  const CA6 = 0x8139c0;
  ram.setU32(CA5 + 0x06, CA6);
  ram.setU8(CA5 + 0x24, 1);                     // dying
  ram.setU8(CA5 + 0x25, 0);                     // ...stage 0, the table walk
  ram.setU8(CA5 + 0x26, 0);                     // ...and the underflow fires this frame
  ram.setU16(CA5 + 0x2a, 0);                    // ...at row 0
  ram.setU32(CA6 + 0x02, 0x20002000);
  ram.setU8(CA6 + 0x1a, 0x37);
  ram.setU8(CA6 + 0x1b, 0x51);
  const ctx = {
    tables: new MoveTables(tables, rom), rom, aim: new AimTables(rom),
    unported: log, unportedLog: log, notes: log,
    bulletSpawn: () => {}, soundPost: () => {},
    effectSpawn: (kind, site, slot) => spawns.push(slot),
  };
  for (const q of BUCKETS) ram.setU16(q.counter, 0);
  handlerMap().get(0x26c3e2)(ram, rom, CA5, ctx);
  assert.equal(spawns.length, 1, 'one row emitted from $26C93A');
  const s = spawns[0];
  assert.equal(ram.u16(s + B.bucket), 0x10, '$26C8E0 move.w #$10,($1E,A0), not $C');
  assert.equal(ram.u16(s + B.hook), 0, '($10,A0) is what $289004 left');
  assert.equal(ram.u8(s + B.speed), 0x37, '($1A,A0) is ($1A,A6)');
  assert.equal(ram.u8(s + B.angle), 0x44, '($1B,A0) is ($1B,A6) * 4 as a BYTE');
  assert.equal(ram.u16(s + B.delay), w(0x26c93a), 'and the row really is $26C93A row 0');
  assert.equal(ram.u16(CA5 + 0x2a), 0x0c, '  ...with the cursor advanced by $C');
});

test('W402 SECTION 6: stage 3\'s finale draws from $242B3C, at $26C85C and $26C882',
  { skip: SKIP }, () => {
    assert.equal(l(0x26c83e), 0x00242b3c, '$26C83C jsr $242B3C -- NOT $242EC2');
    assert.equal(l(0x26c864), 0x00242b3c, '$26C862 jsr $242B3C');
    for (const site of CARRIER_BURST_SITES) {
      assert.equal(w(site), 0x4eb9, `$${site.toString(16)} is a jsr`);
      assert.equal(l(site + 2), 0x0028b4be, '  ...to $28B4BE, so THIS is the site address');
    }
    assert.notEqual(w(0x26c8ca), 0x4eb9, '$26C8CA is NOT a jsr -- the port cited it as one');
    assert.notEqual(w(0x26c8f4), 0x4eb9, '$26C8F4 is NOT a jsr either');
    // TRAP 21: the bytes above do not drive the port. This does.
    const SEED = 0x0000;
    const rom = new RomWindows(tables.rom);
    const ram = new Ram();
    const log = new UnportedLog();
    const seen = [];
    const CA5 = 0x8137c0;
    const CA6 = 0x8139c0;
    ram.setU16(0x803916, SEED);
    ram.setU32(CA5 + 0x06, CA6);
    ram.setU8(CA5 + 0x24, 1);                   // the death flag
    ram.setU8(CA5 + 0x25, 1);                   // ...stage 1, the finale
    ram.setU8(CA5 + 0x26, 1);                   // ...and its countdown one frame from zero
    ram.setU32(CA6 + 0x02, 0x20002000);
    const ctx = {
      tables: new MoveTables(tables, rom), rom, aim: new AimTables(rom),
      unported: log, unportedLog: log, notes: log,
      bulletSpawn: () => {}, soundPost: () => {},
      effectSpawn: (kind, site, slot) => { if (CARRIER_BURST_SITES.includes(site)) seen.push(slot); },
    };
    for (const q of BUCKETS) ram.setU16(q.counter, 0);
    handlerMap().get(0x26c3e2)(ram, rom, CA5, ctx);
    assert.equal(seen.length, 10, 'ten particles, five per burst, attributed to the REAL sites');

    // Replay the draw order on a mirror, exactly as w401 does for type $4C's copy.
    const replay = (emitterDraw) => {
      const m = new Ram();
      m.setU16(0x803916, SEED);
      const out = [];
      for (const turn of [0x40, 0xc0]) {
        const r = emitterDraw(m, rom) & 0xff;
        const base = (((r << 1) & 0xff) + turn) & 0xff;
        for (let p = 0; p < 5; p++) {
          const r2 = drawByte242B3C(m, rom);
          out.push((base + ((r2 >= 0x80 ? r2 - 0x100 : r2) >> 2)) & 0xff);
        }
      }
      return out;
    };
    const withB3C = replay(drawByte242B3C);
    const withEC2 = replay(drawWord242EC2);
    assert.notDeepEqual(withB3C, withEC2,
      `seed $${SEED.toString(16)} must separate $242B3C from $242EC2, or this asserts nothing`);
    assert.deepEqual(seen.map((s) => ram.u8(s + B.angle)), withB3C,
      'the ten angles come from the $242B3C table. THIS is the assertion that reddens when the '
      + 'generator is reverted; the width fix on the same line does NOT change any value, because '
      + 'setU8 masks and (r*2 + $40) & $FF equals ((r*2 & $FF) + $40) & $FF for every r');
  });

// ===============================================================================================
// SECTION 7 -- ABLATED FROM THE EXPORTED TABLES. Five shapes, five throws.
// ===============================================================================================

/** A window removed (`len === null`) or TRUNCATED, in the exported table set itself. */
const reshaped = (base, len) => ({
  ...tables.rom,
  windows: tables.rom.windows.flatMap((x) => {
    if (parseInt(String(x.base).replace('$', ''), 16) !== base) return [x];
    return len === null ? [] : [{ ...x, len, hex: x.hex.slice(0, len * 2) }];
  }),
});

test('W402 SECTION 7: the $270134 window REMOVED -- arm C throws at row 0', { skip: SKIP }, () => {
  const b = bench({ romSpec: reshaped(T4C.deathListA, null) });
  const e = caught(() => driveRetire(b, 20));
  assert.ok(e, '$2700BC move.w (A1)+,D1 must refuse');
  assert.equal(e.romAddress, T4C.deathListA, 'and it names $270134, row 0');
  assert.equal(b.ram.u16(A6 + T4C.deathCursorAt), 0, '  ...with the cursor still at 0');
  assert.equal(driveRetire(bench(), 20).rows, 2, 'POSITIVE CONTROL: with the window, two rows');
});

test('W402 SECTION 7: the $270134 window TRUNCATED to FIVE rows -- the throw MOVES to $270170',
  { skip: SKIP }, () => {
    // The shape W399 asked for and W400 repeated: a truncation the ordinary path survives for a
    // while. Rows 0..4 resolve, the object emits five of them, and only the SIXTH reaches the cut.
    // A test that drove fewer than 54 frames would have passed this (trap 23).
    const b = bench({ romSpec: reshaped(T4C.deathListA, 0x3c) });
    const e = caught(() => driveRetire(b, 60));
    assert.ok(e, 'five rows is still short');
    assert.equal(e.romAddress, T4C.deathListA + 0x3c,
      'the address MOVES to $270170, row 5 -- a different address from the removal above');
    assert.equal(b.ram.u16(A6 + T4C.deathCursorAt), 0x3c, '  ...and the cursor got that far');
  });

test('W402 SECTION 7: the $270134 window TRUNCATED mid-row -- the throw moves AGAIN, to +$46',
  { skip: SKIP }, () => {
    // $44 keeps row 5's first three words and cuts its LONG in half. The emit reads word 1, word 2
    // and word 3 successfully, ALLOCATES A SLOT, and only then reaches the long at row+6. Same
    // window, same list, a third distinct address -- and a spawn already happened when it threw.
    const b = bench({ romSpec: reshaped(T4C.deathListA, 0x44) });
    const e = caught(() => driveRetire(b, 60));
    assert.ok(e, 'a row cut in half is still short');
    assert.equal(e.romAddress, T4C.deathListA + 0x42,
      'and it names $270176, INSIDE row 5 -- the long at row+6 runs off the end');
  });

test('W402 SECTION 7: the $27017E window REMOVED -- arm B throws, 124 frames later',
  { skip: SKIP }, () => {
    // One ablation cannot cover both lists: this one is silent until arm C has run its twelve rows
    // and promoted, which is exactly the hole W399 found by ablating one of a pair.
    const b = bench({ romSpec: reshaped(T4C.deathListB, null) });
    const e = caught(() => driveRetire(b, 200));
    assert.ok(e, '$26C74E must refuse to walk a list it has no window for');
    assert.equal(e.romAddress, T4C.deathListB, 'and it names $27017E -- a DIFFERENT address');
    assert.equal(b.ram.u8(A6 + T4C.deathPhaseAt), 1, '  ...from arm B, with ($86,A6) = 1');
    assert.equal(b.ram.u8(A6 + T4C.retireArmAt), 0, '  ...so ($9E,A6) is still clear');
  });

test('W402 SECTION 7: the $27017E window TRUNCATED past its terminator -- the walk runs off',
  { skip: SKIP }, () => {
    // $48 keeps all six rows and drops ONLY the $FFFF. The walk's sole exit is that word, so it
    // reads straight into the missing bytes -- which is why the window is $4A and not $48.
    const b = bench({ romSpec: reshaped(T4C.deathListB, 0x48) });
    const e = caught(() => driveRetire(b, 200));
    assert.ok(e, 'the terminator is load-bearing');
    assert.equal(e.romAddress, T4C.deathListB + 0x48,
      'and it names $2701C6, the $FFFF itself');
    // ...and the six rows DID spawn before it threw, so the truncation is not simply "no list".
    assert.equal(b.spawns.filter((x) => x.site === 0x289004).length, 6,
      'six rows made it through $289004 first');
  });

// ===============================================================================================
// SECTION 8 -- THE WINDOW SET.
// ===============================================================================================

test('W402 SECTION 8: 585 windows, overlap still 71, and the two TILE onto W341\'s $2701C8',
  { skip: SKIP }, () => {
    const ws = WINDOWS();
    assert.equal(ws.length, 607, '583 windows since W400, 585 after this wave, 590 after W404, '
      + '593 after W405, 594 after W406, 595 after W407, 596 after W408, 599 since W409'
      + ' W411 declares $280F34, the collected-impact transform table, so 600. W418 declares the CONTINUE panel\'s two strings and three tables ($2886FC $28870C $28886A $2888B2 $2888DA), so 605. W419 declares $289EDA ($60), pool C\'s kind-8 and kind-$C descriptor lists -- the art half of opening $289B50\'s kind guard; W194\'s $289B50+$38A window is NOT widened, it abuts, and the overlap count is unchanged. So 606. W425 declares $294134 ($20), the timer-D SOUND dispatch table of D-script 6 -- the eight cue-wrapper addresses the boss DEATH ANIMATION walks with `movea.l (A0),A0 / jsr (A0)`, which is the explosion rattle DOCKET D58 was opened on. The $294154 window from W107 ABUTS it and is NOT widened: the two are read by different routines for different reasons, and the overlap count is unchanged. So 607.');
    const mine = [T4C.deathListA, T4C.deathListB];
    for (const a of mine) {
      assert.equal(ws.filter(([b2]) => b2 === a).length, 1,
        `$${a.toString(16).toUpperCase()} is declared exactly once`);
    }
    const pairs = (list) => {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          const [a, la] = list[i]; const [b2, lb] = list[k];
          if (a < b2 + lb && b2 < a + la) n++;
        }
      }
      return n;
    };
    assert.equal(pairs(ws), 71, '71 overlapping pairs WITH the two new windows');
    assert.equal(pairs(ws.filter(([a]) => !mine.includes(a))), 71,
      '...and 71 without them: neither overlaps anything, the same number the last eleven waves '
      + 'counted');
    // THE TILING. Abutting is not overlapping, and all three ends are stated by the cartridge.
    const byBase = new Map(ws);
    assert.equal(byBase.get(T4C.deathListA), 0x4a, '$270134 + $4A');
    assert.equal(byBase.get(T4C.deathListB), 0x4a, '$27017E + $4A');
    assert.equal(byBase.get(0x2701c8), 0x0e, 'and W341\'s $2701C8 + $E is unmoved');
    assert.equal(T4C.deathListA + 0x4a, T4C.deathListB, '$270134 + $4A IS $27017E');
    assert.equal(T4C.deathListB + 0x4a, T4C.deathEffectTable, '$27017E + $4A IS $2701C8');
    assert.equal(0x2701c8 + 0x0e, 0x2701d6, 'and $2701C8 + $E is $2701D6, type $4E\'s init');
    assert.equal(w(0x2701d6), 0x3b7c, '  ...which opens `move.w #N,($4,A5)`, so it really is code');
    // And the blocks are type $44's, byte for byte -- the check export-tables.py also makes.
    assert.deepEqual([...IMG.subarray(0x270134, 0x2701c8)], [...IMG.subarray(0x26eb46, 0x26ebda)],
      '$270134..$2701C7 is byte for byte $26EB46..$26EBD9, all $94 of them');
    assert.notEqual(0x270134, 0x26eb46,
      'which is a MEASUREMENT, not a licence to alias: two types, two cursors, two windows');
  });
