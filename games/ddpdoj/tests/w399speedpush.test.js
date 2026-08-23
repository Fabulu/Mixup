// ===============================================================================================
// W399 -- THE TWO REMAINING `$261100` PUSHES, AND THE FIRST RUN THAT MOVED STAGE 5 PAST $0346.
// ===============================================================================================
//
// UNIT. `$2A5D28` and `$2A61E0`, the last two unported callers of `$261100` inside the boss ROM.
// W398 left internal stage 4's scroll parked on the script's own `SPEED $0000` record at clock
// $0346, column 224 of 252, and released it from a TEST calling `pushExternalSpeed` directly.
// This wave ports the cartridge code that makes that call, and the release is now a consequence
// of running HIBACHI's own death rather than of the test asking for it.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "`claimed.py` says UNCLAIMED for both ... expect to need one [window]." Both true. But
//      "`$2A5D28` and `$2A61E0`" is not the set: `$261100` has NINE callers and FOUR of them
//      were unclaimed, not two. `$26E04C` and `$26E152` are the other two, they push `$0020`
//      (not `$0010`), and they live in the handler of type `$44` -- which type `$43`, a stage-5
//      object, spawns at its own ramp step `$3C` (`handlers.js` T43.spawnType). SECTION 2.
//   2. "**These are enemies.** Porting them may pull in a handler, a movement table, or a spawn
//      script." They are not enemies and they pull in none of those. They are A4 SCRIPTS of
//      HIBACHI, dispatched by `$2596C6` off the table `$2A5886` that `initbody.js`'s `$2A42DC`
//      body already installs, and their handler `$2A4606` has been ported since W363. What was
//      missing was six `registerScript` calls -- and `boss.js` has ENDED IN `a4Start25980C(ram,
//      1)` since W372, so the entry to this chain was live and every link threw by address.
//   3. "`$0010` is exactly the speed the script's NEXT record (`t=$0347`) sets, so this is the
//      stage-5 counterpart of `$26B73A`." The value is right and the conclusion is right, but
//      **`$2A5D28` IS NOT ON THE FIRST-LOOP PATH.** `$2A5C7A tst.w $813098 / bne $2A5D14` and
//      `$2A5C84 tst.w $80393A / bne $2A5D14` are an OR into the same target; falling past BOTH
//      -- the ordinary first credit -- takes `$2A5C8E`, which starts A4 `$14`, which is
//      `$2595E8` and the STAGE ENDS. No push, and none needed. SECTION 3 runs both arms.
//   4. "`4254 / 4E75`". `$4254` is `clr.w (A4)` -- the SLOT, mode 010 reg 100 -- not `clr.w D4`.
//      It is how an A4 script retires itself, and reading it as a register write would leave the
//      finished script running for ever.
//   5. What the brief does not mention: `$2A6BA0 bne.w $2A6F12`, HIBACHI's SECOND FORM, which
//      `boss.js` recorded in TB0 and never branched on. A4 script 2 is what SETS the byte it
//      tests, so this wave is what made the omission reachable. SECTION 6.
//
// SECTION 1  THE BOUNDS: the A4 table, the two animation chains, the kind table, the dead block
// SECTION 2  $261100's NINE callers, and the FOUR that were unclaimed
// SECTION 3  **THE DELIVERABLE**: HIBACHI dies, `$2A5D28` fires, and the scroll reaches 252
// SECTION 4  `$2A61E0` and its `$0200`
// SECTION 5  ABLATED FROM THE EXPORTED TABLES -- five shapes, five throws, each named
// SECTION 6  what the run then reaches, with measured byte extents
// SECTION 7  the window set: 575, the overlap count, and the neighbours
//
// **W403 UPDATED EVERY FRAME NUMBER IN SECTIONS 3-5, AND THE STOP IN SECTIONS 3 AND 6.**
// Two findings of that wave, both bytes, moved them; nothing here was loosened:
//   * NOT ONE of the twenty-one A4 pairs in $2A5886 puts an `rts` between its init and its
//     step -- `table[id].step - table[id].init` is exactly the init's instruction bytes in
//     all 21 -- so `$2596FA jsr (A0)` on the init frame runs the STEP TOO. src/hibachiend.js
//     now transcribes that fall-through, and every countdown starts one frame earlier:
//     the push moves 193 -> 192, the park release 224 -> 223, the far end 526 -> 525.
//   * `$2A6F12` is PORTED (src/hibachi2.js), so the run no longer stops there. It runs on to
//     frame 321 and stops at `$2A689C`, A4 script $A -- still a PORT stop, and still not a
//     cartridge stop. See tests/w403hibachi2.test.js.
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import { BGRAM, BgVram, backgroundFrame, backgroundInit } from '../src/background.js';
import { POOL_B, B } from '../src/effects.js';
import { installScripts, SCHED, a4Start25980C, scriptAddresses } from '../src/scheduler.js';
import { handler2A4606 } from '../src/boss.js';
import { HIBACHI_A4, HIBACHI_END_SCRIPTS, HIBACHI_END_COUNTED } from '../src/hibachiend.js';
import { HIBACHI_A1 } from '../src/hibachiguns.js';
import {
  OVERLAP_NOTE, ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
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

/** `$80E240`, object slot 0 -- the A5 every background test uses. */
const A5BG = 0x80e240;
const BGO_ENTRYCLOCK = 0x06;
const BGO_COLPTR = 0x0a;
const BGO_SPEEDBG = 0x1c;
const STAGE5_X4 = 16;                 // internal stage index 4, human Stage 5
const STAGE5_COLS = 0x22d770;         // W398's window
const STAGE5_PAL = 0x22fae0;          // ...and the address the cursor may reach and not pass
const PARK_CLOCK = 0x0346;

// ===============================================================================================
// SECTION 1 -- THE BOUNDS. Every number in the five declarations comes out of an instruction.
// ===============================================================================================

test('W399 SECTION 1: the A4 table is 21 pairs, and its OWN entry [0] is where it ends',
  { skip: SKIP }, () => {
    // $2A4318 49F9 002A5886 -- an ABSOLUTE lea, so no TRAP 4 here; the trap is the next one.
    assert.equal(w(0x2a4318), 0x49f9, '$2A4318 is `49F9` `lea xxx.l,A4`');
    assert.equal(l(0x2a431a), HIBACHI_A4.table, '  ...and it names $2A5886, the A4 table');

    // The extent is the MINIMUM of the table's own entries. Nothing here asserts an absence.
    let lo = Infinity;
    for (let i = 0; i < HIBACHI_A4.pairs; i++) {
      for (const off of [0, 4]) {
        const v = l(HIBACHI_A4.table + i * 8 + off);
        assert.ok(v >= 0x2a5000 && v < 0x2a7000,
          `$2A5886[${i}]${off ? '.step' : '.init'} = $${v.toString(16)} is HIBACHI-local`);
        lo = Math.min(lo, v);
      }
    }
    assert.equal(lo, 0x2a592e, 'the lowest entry is $2A592E, A4 script 0\'s init');
    assert.equal(HIBACHI_A4.table + HIBACHI_A4.pairs * 8, lo,
      '  ...and $2A5886 + 21*8 IS that address: the pointers end where the first script begins');

    // The SECOND, independent statement of 21: the highest id anything loads into D0 before a
    // `jsr`/`jmp $25980C` anywhere in the boss's own code. Scanned, not asserted from memory.
    let maxId = -1;
    for (let a = 0x2a4000; a < 0x2a7400; a += 2) {
      if ((w(a) !== 0x4eb9 && w(a) !== 0x4ef9) || l(a + 2) !== 0x25980c) continue;
      const prev = w(a - 2);
      assert.equal(prev & 0xff00, 0x7000,
        `$${(a - 2).toString(16)} is a moveq -- every a4Start site in this boss loads D0 that way`);
      maxId = Math.max(maxId, prev & 0xff);
    }
    assert.equal(maxId, 0x14, 'the highest A4 id the boss ever starts is $14');
    assert.equal(maxId + 1, HIBACHI_A4.pairs, '  ...so ids 0..$14 is 21 pairs, the declared size');
  });

test('W399 SECTION 1: both animation chains are sized by their own count word and land on the '
  + 'A4 entry the script hands to', { skip: SKIP }, () => {
  for (const [base, lea, entry, next, count] of [
    [HIBACHI_A4.s1Anim, 0x2a5c6e, 4, HIBACHI_A4.s2Init, HIBACHI_A4.s1AnimCount],
    [HIBACHI_A4.s3Anim, 0x2a61cc, 8, 0x2a62fa, HIBACHI_A4.s3AnimCount],
  ]) {
    assert.equal(w(lea), 0x41fa, `$${lea.toString(16)} is \`41FA\` \`lea (d16,PC),A0\``);
    // TRAP 4: the target is the EXTENSION WORD's address plus the displacement.
    assert.equal(lea + 2 + disp16(lea + 2), base,
      `TRAP 4: $${(lea + 2).toString(16)} + disp = $${base.toString(16)}`);
    assert.equal(w(base), count, `$${base.toString(16)} counts ${count} entries`);
    const span = 2 + count * HIBACHI_A4.animStride;
    assert.equal(base + span, next,
      `  ...2 + ${count}*14 = $${span.toString(16)}, ending at $${next.toString(16)}`);
    assert.equal(l(HIBACHI_A4.table + entry * 4), next,
      `  ...which is $2A5886[${entry}], an A4 table entry -- the bound from the other direction`);
    const win = WINDOWS().find(([b]) => b === base);
    assert.deepEqual(win, [base, span], `  ...and the declared window is exactly that`);
  }
});

test('W399 SECTION 1: ONE kind table, read by TWO emitters that are not the same routine',
  { skip: SKIP }, () => {
    // Both `lea (d16,PC),A1`, both resolving to $2A5DC8, and the displacements have OPPOSITE
    // signs -- $2A5D68's is forward, $2A6220's is backward.
    for (const site of [0x2a5d68, 0x2a6220]) {
      assert.equal(w(site), 0x43fa, `$${site.toString(16)} is \`43FA\` \`lea (d16,PC),A1\``);
      assert.equal(site + 2 + disp16(site + 2), HIBACHI_A4.kindTable,
        `  ...resolving to $2A5DC8`);
    }
    assert.ok(disp16(0x2a5d6a) > 0 && disp16(0x2a6222) < 0, 'forward from one, backward from the other');
    // The bound is the MASK, and it is the only bound: `$2A5D6E move.w (A1,D0.w),D0` has no
    // compare of any kind. andi.w #$7 then add.w D0,D0 caps the BYTE index at $E.
    assert.equal(l(0x2a5d62), 0x02400007, '$2A5D62 andi.w #$7,D0');
    assert.equal(w(0x2a5d66), 0xd040, '$2A5D66 add.w D0,D0');
    assert.equal(HIBACHI_A4.kindEntries * 2, 0x10, '  ...so 8 words = $10 bytes');
    assert.deepEqual(WINDOWS().find(([b]) => b === HIBACHI_A4.kindTable),
      [HIBACHI_A4.kindTable, 0x10], 'and that is the window');

    // **THE DIFFERENCE.** $2A5DAE/$2A5DB0 exist in script 1's copy and NOT in script 3's, so
    // the two biases are x + (x >> 1) - $800 and x - $800. Two bytes apart in the listing and a
    // 1.5x error in the port if one helper served both.
    assert.equal(w(0x2a5dac), 0x3200, '$2A5DAC move.w D0,D1 -- in script 1');
    assert.equal(w(0x2a5dae), 0xe241, '$2A5DAE asr.w #1,D1   -- ONLY in script 1');
    assert.equal(w(0x2a5db0), 0xd041, '$2A5DB0 add.w D1,D0   -- ONLY in script 1');
    assert.equal(l(0x2a5db2), 0x0640f800, '$2A5DB2 addi.w #-$800,D0');
    assert.equal(w(0x2a6262), 0x3200, '$2A6262 move.w D0,D1 -- in script 3, and a DEAD STORE');
    assert.equal(l(0x2a6264), 0x0640f800,
      '$2A6264 is the addi DIRECTLY, so D1 is written and never read again (TRAP 22)');
  });

/** The newest live pool-B slot carrying the per-frame emitter's signature ($1E = $10 bucket,
 *  $14 = $0800). `$289004` fills the first free slot, so on a clean pool there is exactly one. */
function burstSlot(ram) {
  const hits = [];
  for (let n = 0; n < POOL_B.slots; n++) {
    const a = POOL_B.base + n * POOL_B.stride;
    if (ram.u16(a + B.status) === 0) continue;
    if (ram.u16(a + B.bucket) === 0x0010 && ram.u16(a + B.sub14) === 0x0800) hits.push(a);
  }
  assert.equal(hits.length, 1, 'exactly one per-frame explosion is live');
  return hits[0];
}

test('W399 SECTION 1: ...and the port keeps them apart -- SAME draws, DIFFERENT ($26,A0)',
  { skip: SKIP }, () => {
    // Both benches are built identically and neither script draws before its per-frame arm, so
    // `$242EC2`/`$2431F4`/`$24328E` hand out the SAME numbers to both. Any difference in the
    // slot is the arithmetic and nothing else. This is the assertion that reddens if one
    // helper is ever shared between the two emitters -- the byte checks above would not.
    // ($106,A6) non-zero is `$2A6B94`'s own early exit, so the boss body does not run and does
    // not clear the slot this test just filled. Both benches get it, so they stay symmetric.
    const one = bench(); one.ram.setU16(SUB + 0x106, 1); a4Start25980C(one.ram, 1);
    const three = bench(); three.ram.setU16(SUB + 0x106, 1); a4Start25980C(three.ram, 3);
    for (let f = 1; f <= 5; f++) {
      handler2A4606(one.ram, one.ROM, REC, one.ctx);
      handler2A4606(three.ram, three.ROM, REC, three.ctx);
    }
    const s1 = burstSlot(one.ram);
    const s3 = burstSlot(three.ram);
    for (const f of [B.speed, B.angle]) {
      assert.equal(one.ram.u8(s1 + f), three.ram.u8(s3 + f),
        'the two emitters drew the same speed and angle, so the benches are in step');
    }
    assert.equal(one.ram.u16(s1 + B.nudge + 2), three.ram.u16(s3 + B.nudge + 2),
      '($28,A0) is `asr.w #1` in BOTH, so it matches');
    const a = one.ram.u16(s1 + B.nudge);
    const c = three.ram.u16(s3 + B.nudge);
    assert.notEqual(a, c, '($26,A0) does NOT: script 1 adds x >> 1 and script 3 does not');
    const x = (c + 0x800) & 0xffff;                    // recover x from script 3's x - $800
    const signed = x >= 0x8000 ? x - 0x10000 : x;
    assert.equal(a, (c + (signed >> 1)) & 0xffff,
      `and the difference is exactly x >> 1: $${a.toString(16)} = $${c.toString(16)} + `
      + `$${((signed >> 1) & 0xffff).toString(16)}`);
  });

test('W399 SECTION 1: 504 bytes of A4 script 3 are jumped over and nothing branches in',
  { skip: SKIP }, () => {
    assert.equal(w(0x2a5fd0), 0x6000, '$2A5FD0 is `bra.w`');
    assert.equal(0x2a5fd2 + w(0x2a5fd2), HIBACHI_A4.deadBlockTo,
      'TRAP 4 on a branch too: $2A5FD2 + $1FA = $2A61CC');
    assert.equal(HIBACHI_A4.deadBlockTo - HIBACHI_A4.deadBlockFrom, 504,
      '$2A5FD4..$2A61CB is 504 bytes');
    // The block is nine `$289004` allocations. If anything reached it they would run.
    assert.equal(l(0x2a5fd8), 0x4eb90028, '$2A5FD8 is the first `jsr $289004` inside the shadow');

    // Nothing targets a byte of it: no `jsr`, no `jmp`, no Bcc, over a span far wider than a
    // 16-bit displacement can reach from.
    const hits = [];
    for (let a = 0x2a2000; a < 0x2a9000; a += 2) {
      const op = w(a);
      if (op === 0x4eb9 || op === 0x4ef9) {
        const t = l(a + 2);
        if (t >= HIBACHI_A4.deadBlockFrom && t < HIBACHI_A4.deadBlockTo) hits.push(['abs', a, t]);
        continue;
      }
      if ((op >> 8) < 0x60 || (op >> 8) > 0x6f) continue;
      const b = op & 0xff;
      if (b === 0xff) continue;
      const t = b === 0 ? a + 2 + disp16(a + 2) : a + 2 + (b >= 0x80 ? b - 256 : b);
      if (t >= HIBACHI_A4.deadBlockFrom && t < HIBACHI_A4.deadBlockTo) hits.push(['rel', a, t]);
    }
    assert.deepEqual(hits, [],
      'no jsr, jmp or Bcc in $2A2000..$2A9000 targets a byte of the shadow. A 16-bit '
      + 'displacement cannot reach it from outside that span, and an abs.l would have been '
      + 'found by the first sweep');
  });

// ===============================================================================================
// SECTION 2 -- `$261100`'S NINE CALLERS. The brief named two of the four that were unclaimed.
// ===============================================================================================

test('W399 SECTION 2: nine callers of $261100, FOUR of them unclaimed and two pushing $0020',
  { skip: SKIP }, () => {
    const callers = [];
    for (let a = 0; a + 6 <= IMG.length; a += 2) {
      if ((w(a) === 0x4eb9 || w(a) === 0x4ef9) && l(a + 2) === 0x261100) callers.push(a);
    }
    assert.deepEqual(callers.map((a) => a.toString(16).toUpperCase()),
      ['26B73A', '26D802', '26D864', '26E04C', '26E152', '26F614', '26F6C6', '2A5D28', '2A61E0'],
      'the nine, and W17\'s census of "nine callers" is still exactly right');

    // The D0 each one pushes, read from the `move.w #imm,D0` eight bytes back.
    const speeds = callers.map((a) => (w(a - 8) === 0x303c ? w(a - 6) : null));
    assert.deepEqual(speeds,
      [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x0010, 0x0200],
      'seven push $0020; only the two A4 scripts push anything else');
    assert.equal(speeds[7], HIBACHI_A4.push1Speed, '$2A5D28 pushes what the port pushes');
    assert.equal(speeds[8], HIBACHI_A4.push2Speed, '$2A61E0 likewise');

    // **THE OTHER TWO.** $26E04C and $26E152 are inside the handler of type $44 -- $267824 +
    // $44*8 + 4 -- and type $43 (`handlers.js` T43, ported since W341) is what spawns type $44.
    // They are the shape $26B73A is, they push the SAME $0020, and this wave does not port them.
    assert.equal(l(0x267824 + 0x44 * 8 + 4), 0x26e02a, 'type $44\'s handler is $26E02A');
    assert.ok(0x26e02a < 0x26e04c && 0x26e152 < 0x270000,
      '  ...and both unclaimed $26xxxx pushes are inside it');
    assert.equal(l(0x267824 + 0x43 * 8 + 4), 0x26de32,
      'type $43\'s handler is $26DE32, which handlers.js registers as handler43');
    assert.equal(w(0x26dec4), 0x7044, '$26DEC4 moveq #$44,D0 -- $43\'s ramp-$3C spawn of $44');

    // And the third statement the brief's "these are enemies" needed: $2A5D28's own owner.
    assert.equal(l(HIBACHI_A4.table + 3 * 4), HIBACHI_A4.s1Step,
      '$2A5886[3] is $2A5A28, A4 script 1\'s STEP');
    assert.ok(HIBACHI_A4.s1Step < 0x2a5d28 && 0x2a5d28 < HIBACHI_A4.s2Init,
      '  ...and $2A5D28 is inside it, between entry [3] and entry [4]');
    assert.deepEqual(HIBACHI_END_SCRIPTS.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 0x14],
      'A4 0 from W552, 1, 2 and 3 from this wave, 4 from W403, 5 from W409 and $14');
    for (const id of HIBACHI_END_SCRIPTS) {
      for (const off of [0, 4]) {
        assert.ok(scriptAddresses().includes(l(HIBACHI_A4.table + id * 8 + off)),
          `$2A5886[${id}]${off ? '.step' : '.init'} is registered with the scheduler`);
      }
    }
  });

// ===============================================================================================
// SECTION 3 -- THE DELIVERABLE. HIBACHI dies and the stage-5 scroll leaves clock $0346.
// ===============================================================================================

const REC = 0x810c00;                 // a scratch enemy record for HIBACHI
const SUB = 0x814800;                 // ...and its sub-record

/** The bench: internal stage 4's background at the ROM's own mid-stage entry clock, plus
 *  HIBACHI's A4 table installed through `$259554` exactly as `$2A4318`/`$2A432E` does.
 *
 *  ONLY A4 is installed. `$259554`'s own rule is "a zero register leaves its pointer alone"
 *  ($25956A/$2595A2 `cmpa.l #$0`), so `$2596C6`'s A0/A1/A3 walks and `$259682`'s A2 walk are
 *  skipped -- which is what this wave's scope is: the A4 ending chain, not the twenty A2
 *  object scripts at `$2A46B2` or the fifteen A1 gun scripts at `$2A72C8`. */
function bench({ romSpec = null, loopWord = 1, flag393a = 0, entryClock = 0x0344 } = {}) {
  const ROM = new RomWindows(romSpec ?? tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };

  ram.setU16(BGRAM.stageX4, STAGE5_X4);                 // $813096
  ram.setU16(A5BG + BGO_ENTRYCLOCK, entryClock);        // ($6,A5) -> $26114C
  backgroundInit(ram, ROM, vram, ctx, A5BG);

  // W404: A1 TOO. `$2A4306 lea $2A72C8,A1` is four instructions above `$2A4318`'s A4 lea and
  // `$25959C move.l A1,$812BD4` stores it, so a bench that installs only A4 leaves `$259782
  // tst.l / beq` skipping the whole A1 walk -- and A4 $A's wait on gun 5 could then never end
  // for a reason belonging to the bench and not to the cartridge.
  installScripts(ram, ROM, { a4: HIBACHI_A4.table, a1: HIBACHI_A1.main });   // $2A4306/$2A4318

  ram.setU32(REC + 0x06, SUB);                          // ($6,A5) -- the sub-record
  ram.setU32(REC + 0x16, 0x00000010);                   // an all-but-spent HP pool
  ram.setU32(SUB + 0x02, 0x38001c00);                   // $2A42F8's spawn position
  // Part $0 armed with hit bits inside the $5C mask but OUTSIDE $2428A6's $18: the boss dies on
  // frame 1 and `scoreKill`'s two `btst`s ($286174 #4, $28621C #3) both miss, so this bench
  // exercises the DEATH, not the score ledger.
  ram.setU8(SUB + 0x00, 0x44);
  ram.setU16(SUB + 0x18, 0x0000);                       // -> the $2A6CEE damage is $7FFF
  ram.setU16(0x8103e6, 0x8000);                         // P1 NEGATIVE, bit 0 clear -> $2428A6 = $10
  ram.setU16(HIBACHI_A4.forkLoopWord, loopWord);
  ram.setU16(HIBACHI_A4.forkFlag, flag393a);
  return { ROM, ram, vram, ctx, log };
}

/** Run the handler and the background together. The handler is dropped the frame it throws --
 *  and the address it threw at is reported, because that is this port's edge, not a limit of
 *  the cartridge. `backgroundFrame` reads nothing the scheduler writes. */
function run(b, frames) {
  const out = { push: null, stopped: null, leftPark: 0, maxPtr: 0, reached: 0,
    rewound: 0, rewoundFrom: 0, rewoundTo: 0, speedOnPushFrame: null };
  b.ctx.scrollEvent = (e) => {
    if (e.kind === 'hibachiPush' && !out.push) out.push = { ...e, frame: out.frame };
  };
  for (let f = 1; f <= frames; f++) {
    out.frame = f;
    if (!out.stopped) {
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
    }
    resetSpriteQueueCounters(b.ram);
    const before = b.ram.u32(A5BG + BGO_COLPTR);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
    const after = b.ram.u32(A5BG + BGO_COLPTR);
    if (after > out.maxPtr) { out.maxPtr = after; if (after === STAGE5_PAL) out.reached = f; }
    if (after < before && !out.rewound) {
      out.rewound = f; out.rewoundFrom = before; out.rewoundTo = after;
    }
    if (!out.leftPark && b.ram.u16(BGRAM.clock) > PARK_CLOCK) out.leftPark = f;
    // ($1C,A5) AS $2612BC LEFT IT, on the frame the push happened. Reading it at the end of the
    // run instead would report the SCRIPT's speed: once the clock moves again the ramp records
    // $261E90.. overwrite it, which is exactly what the push exists to let happen.
    if (out.push && out.push.frame === f && out.speedOnPushFrame === null) {
      out.speedOnPushFrame = b.ram.u16(A5BG + BGO_SPEEDBG);
    }
  }
  return out;
}

test('W399 SECTION 3: the boss dies, $2A5D28 fires on frame 192, and the scroll leaves $0346',
  { skip: SKIP }, () => {
    const b = bench();
    // The park is real BEFORE anything is pushed: the init's own pre-fill stops at column 224.
    assert.equal(b.ram.u16(BGRAM.clock), 0x0344, 'the init took the mid-stage entry clock');
    assert.equal(b.ram.u32(A5BG + BGO_COLPTR), STAGE5_COLS + 224 * 36,
      '  ...and left the cursor at column 224 of 252, where W398 measured it stopping for ever');

    const r = run(b, 1200);

    // ---- THE CHAIN, and every step of it is the cartridge's own.
    assert.deepEqual(r.push, { kind: 'hibachiPush', at: HIBACHI_A4.push1At, speed: 0x0010,
      next: 2, frame: 192 },
    '$2A5D28 pushed $0010 on frame 192: A4 script 1\'s init loads ($2,A4) = $C0 and FALLS '
    + 'THROUGH into its own step ($2A5A26 is not an rts), so the first decrement is on frame '
    + '1 and the 192nd is frame 192');
    assert.equal(b.ram.u16(BGRAM.extSpeedBg), 0x0010,
      'the push landed in $813182 -- and $2612BC consumed it into ($1C,A5)');
    // `$2A5D36` is `4254` = `clr.w (A4)`, the SLOT, not `clr.w D4`. Slot 0 is empty and slot 1
    // carries script 2 with its init already run ($8102, bit 0 set by `$2596E4 bset`). Reading
    // that opcode as a register write would leave the finished script stepping for ever.
    // W403: a SEPARATE 192-frame run, because the 1,200-frame one above carries on into A4 $A
    // and slot 0 holds $810A by the end of it. The claim is about the handover frame.
    const handover = bench();
    run(handover, 192);
    assert.deepEqual([0, 1, 2, 3, 4].map(
      (i) => handover.ram.u16(SCHED.a4Base + i * SCHED.a4Stride)),
    [0, 0x8102, 0, 0, 0], 'script 1 retired its own slot and script 2 took the next one');

    // ---- **THE THING NO RUN HAD EVER DONE.**
    assert.equal(r.leftPark, 223,
      'the clock passed $0346 on frame 223: the accumulator needs $200 of scroll per tick and '
      + 'the pushed speed is $0010, so 32 frames after the push (TRAP 2 is not this one -- '
      + '$26131A is a compare, and 192 + 31 = 223)');
    assert.equal(r.maxPtr, STAGE5_PAL,
      'the cursor reached $22FAE0 -- $261252[4], the stream\'s far end -- and stopped there');
    assert.equal((r.maxPtr - STAGE5_COLS) / 36, 252, '  = all 252 columns of the stream');
    assert.equal(r.reached, 525, '  ...on frame 525');
    assert.equal(r.rewound, 526, 'and frame 526 is the op-$04 REPEAT at $261EC8');
    assert.equal(r.rewoundFrom, STAGE5_PAL, '  ...rewinding FROM $22FAE0');
    assert.equal(r.rewoundTo, STAGE5_COLS + 224 * 36, '  ...back to column 224, -28 columns');
    assert.equal(b.ram.u16(BGRAM.clock), 0x03b4, 'and the clock is at $03B4, the REPEAT\'s time');
    assert.equal(b.ram.u16(A5BG + BGO_SPEEDBG), 0x0100,
      'at speed $0100 -- the top of the script\'s own ramp, $261EC0 t=$0350');

    // ---- WHERE THE RUN STOPS. W405 CORRECTION: nowhere inside 1,200 frames. W404 ported
    // A4 $A/$B/$C and guns 5 and 6 and moved the stop to $2A8516; W405 ports guns 7 and 8 and
    // A4 $D, which closes the attack loop, so the first stop is now A4 $F at $2A6A30 on frame
    // 2928 -- past the end of this run, and owned by `tests/w405hibachiguns78.test.js`.
    assert.equal(r.stopped, null,
      'the scroll chain this file is about now runs its whole 1,200 frames unbroken');
  });

test('W399 SECTION 3: the FIRST-LOOP arm takes the other branch and the scroll never moves',
  { skip: SKIP }, () => {
    // $813098 = 0 and $80393A = 0 -- the ordinary first credit. Same bench, one word different.
    const b = bench({ loopWord: 0, flag393a: 0 });
    const r = run(b, 1200);
    assert.equal(r.push, null, 'NO push happened at all');
    assert.equal(r.leftPark, 0, '  ...so the clock never passed $0346');
    assert.equal(b.ram.u16(BGRAM.clock), PARK_CLOCK, '  ...it is still parked there');
    assert.equal(b.ram.u32(A5BG + BGO_COLPTR), STAGE5_COLS + 224 * 36,
      '  ...at column 224, exactly where W398 left it, after 1,200 frames');
    // The arm that DID run: 21 pool-C rows counted, then A4 $14.
    assert.ok(b.log.report().some((s) => s.startsWith('     21 x $289B22')),
      'the first-loop arm counted $289B22 twenty-one times ($2A5C9A moveq #$14 + dbra)');
    // W420 CORRECTION. This used to assert a STOP here -- { frame: 192, at: $2A6B7A } --
    // because A4 $14 was unported. It is ported now, so the hand-over is no longer a throw,
    // and this bench is the FIRST in the repo that actually drives the first-loop ending.
    assert.equal(r.stopped, null, 'W420: A4 $14 is ported, so the hand-over no longer throws');
    // THE STATE TRACE: the hand-over is still on frame 192, and 192 + $80 = 320, so the
    // stage is over well inside the 1,200 frames this bench runs.
    assert.equal(b.ram.u16(SCHED.suspend), 1,
      'W420: the FIRST-loop ending COMPLETES -- $2595E8 stored 1 within the run');
    assert.equal(l(HIBACHI_A4.table + HIBACHI_A4.firstLoopExit * 8), 0x2a6b7a,
      '$2A5886[$14].init is $2A6B7A');
    assert.equal(l(0x2a6b88), 0x4eb90025, '$2A6B88 is `jsr $2595E8`, the global SUSPEND...');
    assert.equal(w(0x2a6b8c), 0x95e8, '  ...$2595E8, which is why the first loop needs no push');
  });

test('W399 SECTION 3: the $80393A flag alone takes the pushing arm -- the two tests are an OR',
  { skip: SKIP }, () => {
    const b = bench({ loopWord: 0, flag393a: 1 });
    const r = run(b, 400);
    assert.equal(r.push?.speed, 0x0010, 'loop word CLEAR, $80393A set, and $2A5D28 still fires');
    assert.equal(r.push.frame, 192, '  ...on the same frame');
    assert.equal(r.leftPark, 223, '  ...and the scroll still leaves the park on frame 223');
  });

// ===============================================================================================
// SECTION 4 -- `$2A61E0`. A4 script 3 is NOT in the chain script 1 starts.
// ===============================================================================================

test('W399 SECTION 4: $2A61E0 pushes $0200, and its only starter is the second form\'s death',
  { skip: SKIP }, () => {
    // WHO STARTS SCRIPT 3. Scanned, not assumed: exactly one site in the whole image.
    const starters = [];
    for (let a = 0x2a4000; a < 0x2a7400; a += 2) {
      if ((w(a) !== 0x4eb9 && w(a) !== 0x4ef9) || l(a + 2) !== 0x25980c) continue;
      if ((w(a - 2) & 0xff) === 3 && (w(a - 2) & 0xff00) === 0x7000) starters.push(a);
    }
    assert.deepEqual(starters.map((a) => a.toString(16).toUpperCase()), ['2A7076'],
      'A4 3 has ONE starter, $2A7076, and it is a `jmp` tail call');
    assert.equal(w(0x2a7076), 0x4ef9, '  ...`4EF9`, a jmp');
    assert.ok(0x2a6f12 < 0x2a7076 && 0x2a7076 < 0x2a72c8,
      '  ...inside $2A6F12, the SECOND FORM\'s body, between it and the A1 table at $2A72C8');

    // So this test starts it the way $2A7076 does, and says so. The push is the deliverable;
    // the body that reaches it is SECTION 6's count.
    const b = bench();
    b.ram.setU16(SUB + 0x106, 1);                       // the ending has switched the body off
    a4Start25980C(b.ram, 3);                            // $2A7076 jmp $25980C with D0 = 3
    const r = run(b, 1200);
    assert.deepEqual(r.push, { kind: 'hibachiPush', at: HIBACHI_A4.push2At, speed: 0x0200,
      next: 4, frame: 192 }, '$2A61E0 pushed $0200 on frame 192 -- the same $C0 countdown');
    assert.equal(r.speedOnPushFrame, 0x0200,
      '$2612BC put $0200 into ($1C,A5) on that frame: 512/64 = EIGHT pixels a frame, 32x the '
      + 'first push. It does not STAY $0200 -- the script\'s own ramp overwrites it as soon as '
      + 'the clock it unfroze starts moving, which is the whole point of the push');
    assert.equal(r.leftPark, 192,
      'and at that speed the clock leaves $0346 on the SAME frame as the push, not 31 later: '
      + '$26131A tests the accumulator against $200 and $0200 is exactly one frame of it');
    assert.equal(r.maxPtr, STAGE5_PAL, '  ...and the cursor still stops at $22FAE0');
    assert.ok(r.reached > 0 && r.reached < 525,
      `  ...reaching it on frame ${r.reached}, sooner than the $0010 push's 525`);
  });

// ===============================================================================================
// SECTION 5 -- ABLATED FROM THE EXPORTED TABLES. Five shapes of wrong window, five throws.
// ===============================================================================================

/** A window removed (`len === null`) or TRUNCATED, in the exported table set itself. */
const reshaped = (base, len) => ({
  ...tables.rom,
  windows: tables.rom.windows.flatMap((x) => {
    if (parseInt(String(x.base).replace('$', ''), 16) !== base) return [x];
    return len === null ? [] : [{ ...x, len, hex: x.hex.slice(0, len * 2) }];
  }),
});

const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

test('W399 SECTION 5: the A4 table window REMOVED -- $2596FA throws at $2A588E, frame 1',
  { skip: SKIP }, () => {
    const b = bench({ romSpec: reshaped(HIBACHI_A4.table, null) });
    const e = caught(() => handler2A4606(b.ram, b.ROM, REC, b.ctx));
    assert.ok(e, 'the walk must refuse, not dispatch nothing');
    assert.equal(e.romAddress, HIBACHI_A4.table + 8,
      'and it names $2A588E: `$2596DE lsl.w #$3` on id 1 is offset 8, the INIT pointer');
    assert.match(e.message, /outside every\s+ROM window/, 'a window throw, named');
    assert.doesNotThrow(() => handler2A4606(bench().ram, bench().ROM, REC, bench().ctx),
      'POSITIVE CONTROL: with the window, frame 1 runs');
  });

test('W399 SECTION 5: the A4 table TRUNCATED to two pairs -- A SHORT WINDOW SURVIVES A SHORT RUN',
  { skip: SKIP }, () => {
    // $10 bytes covers ids 0 and 1. Script 1 runs to completion -- init, 192 steps, the whole
    // one-shot block, the push -- and only the handover to id 2 falls off the end. A test that
    // stopped at the push would have passed this. TRAP 23 made into a run.
    const b = bench({ romSpec: reshaped(HIBACHI_A4.table, 0x10) });
    let pushed = null;
    b.ctx.scrollEvent = (e) => { pushed = e; };
    const e = caught(() => {
      for (let f = 1; f <= 300; f++) handler2A4606(b.ram, b.ROM, REC, b.ctx);
    });
    assert.equal(pushed?.speed, 0x0010, 'the push still happened -- 192 frames in');
    assert.ok(e, '...and the very next frame does not');
    assert.equal(e.romAddress, HIBACHI_A4.table + 2 * 8,
      'it throws at $2A5896, id 2\'s init pointer, the first longword past the cut');
  });

test('W399 SECTION 5: script 1\'s animation chain REMOVED -- $246410 throws at its count word',
  { skip: SKIP }, () => {
    const b = bench({ romSpec: reshaped(HIBACHI_A4.s1Anim, null) });
    const e = caught(() => {
      for (let f = 1; f <= 200; f++) handler2A4606(b.ram, b.ROM, REC, b.ctx);
    });
    assert.ok(e, '$2A5C74 jsr $246410 must refuse');
    assert.equal(e.romAddress, HIBACHI_A4.s1Anim,
      'and it names $2A5DDA, the count word `$24643C move.w (A0)+,D0` reads first');
  });

test('W399 SECTION 5: the same chain TRUNCATED to its count word -- the throw MOVES to $2A5DDC',
  { skip: SKIP }, () => {
    const b = bench({ romSpec: reshaped(HIBACHI_A4.s1Anim, 2) });
    const e = caught(() => {
      for (let f = 1; f <= 200; f++) handler2A4606(b.ram, b.ROM, REC, b.ctx);
    });
    assert.ok(e, 'a count with no entries behind it is still short');
    assert.equal(e.romAddress, HIBACHI_A4.s1Anim + 2,
      'and the address moves by exactly the count word: $2A5DDC, entry [0]\'s fill');
  });

test('W399 SECTION 5: script 3\'s animation chain REMOVED -- a DIFFERENT throw, at $2A627A',
  { skip: SKIP }, () => {
    // The fifth window has its own ablation because the fourth one's does not cover it: script 1
    // and script 3 read DIFFERENT chains, and a test that only exercised script 1 would leave
    // $2A627A declared and unproven. (Found by ablating the `$246410` call out of script 3 and
    // watching all nineteen tests stay green.)
    const b = bench({ romSpec: reshaped(HIBACHI_A4.s3Anim, null) });
    b.ram.setU16(SUB + 0x106, 1);                       // the ending has switched the body off
    a4Start25980C(b.ram, 3);                            // $2A7076
    let f = 0;
    const e = caught(() => {
      for (f = 1; f <= 300; f++) handler2A4606(b.ram, b.ROM, REC, b.ctx);
    });
    assert.ok(e, '$2A61D2 jsr $246410 must refuse');
    assert.equal(e.romAddress, HIBACHI_A4.s3Anim, 'and it names $2A627A, its own count word');
    assert.equal(f, 192, '  ...on frame 192, one instruction BEFORE the $0200 push at $2A61E0');
    assert.equal(b.ram.u16(BGRAM.extSpeedBg), 0,
      '  ...and nothing was pushed, which is how the order of $2A61CC and $2A61D8 is fixed');
  });

test('W399 SECTION 5: the kind table REMOVED -- the per-frame emitter throws on frame 4',
  { skip: SKIP }, () => {
    // ($4,A4) = 3 from the init's ONE `move.w #$0303` (TRAP 3), and `subq.b` + `bcc` fires on
    // UNDERFLOW, so the first explosion is the fourth step frame -- which is frame 4, not 5,
    // because W403's init fall-through makes frame 1 the first STEP frame and not the init.
    const b = bench({ romSpec: reshaped(HIBACHI_A4.kindTable, null) });
    let f = 0;
    const e = caught(() => {
      for (f = 1; f <= 50; f++) handler2A4606(b.ram, b.ROM, REC, b.ctx);
    });
    assert.ok(e, '$2A5D6E reads the table every time the counter underflows');
    assert.equal(f, 4, 'and the fourth step frame is frame 4');
    assert.ok(e.romAddress >= HIBACHI_A4.kindTable
      && e.romAddress < HIBACHI_A4.kindTable + 0x10,
    `it throws inside $2A5DC8..$2A5DD7 (at $${e.romAddress.toString(16).toUpperCase()}) -- the `
    + 'exact word depends on the draw, which is the point of a table read');
  });

test('W399 SECTION 5: the pool-C rows REMOVED -- only the FIRST-LOOP arm notices',
  { skip: SKIP }, () => {
    // The pushing arm never reads $2A5CC0, so this ablation must be invisible to SECTION 3 and
    // fatal to the other branch. Both halves are asserted, because an ablation that reddens
    // everything proves nothing about which code reads what.
    const spec = reshaped(HIBACHI_A4.poolCTable, null);
    const push = bench({ romSpec: spec });
    assert.equal(run(push, 200).push?.speed, 0x0010,
      'the pushing arm is untouched: $2A5CC0 is on the other side of the fork');
    const first = bench({ romSpec: spec, loopWord: 0 });
    let f = 0;
    const e = caught(() => {
      for (f = 1; f <= 200; f++) handler2A4606(first.ram, first.ROM, REC, first.ctx);
    });
    assert.ok(e, 'and the first-loop arm dies on the same frame it would have pushed');
    assert.equal(f, 192, '  ...frame 192');
    assert.equal(e.romAddress, HIBACHI_A4.poolCTable, '  ...at $2A5CC0, row 0');
  });

// ===============================================================================================
// SECTION 6 -- WHAT THE RUN THEN REACHES. Counted, with the extents measured.
// ===============================================================================================

test('W399 SECTION 6: every A4 id the chain hands to and does not run, by byte extent',
  { skip: SKIP }, () => {
    for (const [id, c] of Object.entries(HIBACHI_END_COUNTED)) {
      const n = Number(id);
      assert.equal(l(HIBACHI_A4.table + n * 8), c.init,
        `$2A5886[${n}].init is $${c.init.toString(16).toUpperCase()}`);
      assert.equal(l(HIBACHI_A4.table + n * 8 + 4), c.step,
        `  ...and .step is $${c.step.toString(16).toUpperCase()}`);
      // The extent is init -> the NEXT table entry above the step, which is what bounds every
      // one of the 21: the scripts are laid out in id order between $2A592E and $2A6B94.
      const above = [];
      for (let i = 0; i < HIBACHI_A4.pairs * 2; i++) above.push(l(HIBACHI_A4.table + i * 4));
      above.push(0x2a6b94);                      // bossBody2A6B94, the first thing past the last
      const end = Math.min(...above.filter((v) => v > c.step));
      assert.equal(end - c.init, c.bytes,
        `A4 ${n} is $${c.bytes.toString(16).toUpperCase()} bytes, `
        + `$${c.init.toString(16).toUpperCase()}..$${end.toString(16).toUpperCase()}`);
    }
    // The second form, the unit SECTION 3's run actually stops on. Its extent comes from the
    // two `jmp`s at its ends, not from a guess: $2A6F12 is the gate's target and $2A72C8 is the
    // A1 script table `$2A4306` leas, so the body plus its death tail fill the gap between.
    assert.equal(0x2a72c8 - 0x2a6f12, 0x3b6,
      '$2A6F12..$2A72C8 is $3B6 bytes: HIBACHI\'s second form and its death, ending exactly at '
      + 'the A1 script table $2A4306 installs');
    assert.equal(l(0x2a4308), 0x2a72c8, '  ...$2A4306 lea $2A72C8,A1');
  });

test('W399 SECTION 6: the second-form gate is a LIVE branch into src/hibachi2.js',
  { skip: SKIP }, () => {
    assert.equal(w(0x2a6b9c), 0x4a2e, '$2A6B9C tst.b');
    assert.equal(w(0x2a6b9e), 0x010e, '  ...($10E,A6)');
    assert.equal(w(0x2a6ba0), 0x6600, '$2A6BA0 bne.w');
    assert.equal(0x2a6ba2 + w(0x2a6ba2), 0x2a6f12, '  ...TRAP 4: $2A6BA2 + $370 = $2A6F12');
    // And the byte that arms it is written by A4 script 2, which is why nothing had reached it.
    assert.equal(l(0x2a5f40), 0x1d7c0001, '$2A5F40 move.b #$1,...');
    assert.equal(w(0x2a5f44), 0x010e, '  ...($10E,A6) -- inside A4 script 2\'s step');
    // W403: the branch now GOES somewhere. With the byte set the frame does not throw, and
    // phase A's own first three stores land -- $2A6F2A/$2A6F30/$2A6F36 write THREE animation
    // bytes where the first form's $2A6BC8 writes FOUR.
    const b = bench();
    b.ram.setU8(SUB + 0x10e, 1);
    assert.equal(caught(() => handler2A4606(b.ram, b.ROM, REC, b.ctx)), null,
      'bossBody2A6B94 branches into hibachi2.js instead of stopping by address');
    assert.deepEqual([0xe6, 0xe7, 0xe8].map((o) => b.ram.u8(SUB + o)), [0x19, 0x19, 0x19],
      '  ...and phase A wrote its three animation bytes -- $19 in ALL THREE, because this\n'
      + '     bench\'s pool is $10, below $2A6F3C\'s $11800, so $2A6F52\'s moveq #$19 reaches\n'
      + '     $2A6F54/$2A6F58/$2A6F5C. Form 1 writes that same $19 to FOUR bytes, $E6..$E9');
    assert.equal(b.ram.u8(SUB + 0xe9), 0,
      '  ...and NOT a fourth: $E9 is form 1\'s ($2A6C02 writes $19 there), phase A has none');
    // The OTHER arm of the same test, so the $11800 compare is proven and not assumed.
    const high = bench();
    high.ram.setU8(SUB + 0x10e, 1);
    high.ram.setU32(REC + 0x16, 0x11800);
    handler2A4606(high.ram, high.ROM, REC, high.ctx);
    assert.deepEqual([0xe6, 0xe7, 0xe8].map((o) => high.ram.u8(SUB + o)), [0x10, 0x11, 0x12],
      '  ...and a pool of exactly $11800 takes the bcc: $10/$11/$12 stand');
  });

// ===============================================================================================
// SECTION 7 -- THE SET.
// ===============================================================================================

test('W399 SECTION 7: the window set, an overlap count these five do not move, and all five '
  + 'sit in open ground',
  { skip: SKIP }, () => {
    const ws = WINDOWS();
    // W400 declared eight more (type $44's init stub, its prototype pair and five data tables),
    // so this file's total moves and its own five-window claims below do not.
    assert.equal(ws.length, ROM_WINDOW_COUNT, '570 windows before W399, 575 after it, 583 after W400, 585 '
      + 'after W402, 590 after W404 (two A1 gun tables and three gun data blocks), 593 '
      + 'after W405, 594 after W406, 595 after W407, 596 after W408 added A1 gun $A\'s '
      + 'template, and 599 since W409 declared A4 script 5\'s three blocks'
      + ' W411 declares $280F34, the collected-impact transform table, so 600. W418 declares the CONTINUE panel\'s two strings and three tables ($2886FC $28870C $28886A $2888B2 $2888DA), so 605. W419 declares $289EDA ($60), pool C\'s kind-8 and kind-$C descriptor lists -- the art half of opening $289B50\'s kind guard; W194\'s $289B50+$38A window is NOT widened, it abuts, and the overlap count is unchanged. So 606. W425 declares $294134 ($20), the timer-D SOUND dispatch table of D-script 6 -- the eight cue-wrapper addresses the boss DEATH ANIMATION walks with `movea.l (A0),A0 / jsr (A0)`, which is the explosion rattle DOCKET D58 was opened on. The $294154 window from W107 ABUTS it and is NOT widened: the two are read by different routines for different reasons, and the overlap count is unchanged. So 607. W428 declares the FOUR word-threshold cue scripts ($268E32 $273986 $2747A8 $275F04), so 611. Each of the four begins INSIDE its type\'s prototype window and runs on to the handler that follows it, because a cue record\'s longwords straddle that window\'s end and RomWindows.#at cannot stitch a read across a seam -- W428 declared an abutting window and MEASURED that $27399E threw anyway. So for the first time in twelve waves the overlap count moves too, 71 -> 75, four new pairs for four new windows. Both numbers now live in tests/romwindowset.js, which is where to change them and where to read why.');
    const mine = [HIBACHI_A4.table, HIBACHI_A4.poolCTable, HIBACHI_A4.kindTable,
      HIBACHI_A4.s1Anim, HIBACHI_A4.s3Anim];
    for (const a of mine) {
      assert.equal(ws.filter(([b]) => b === a).length, 1,
        `$${a.toString(16).toUpperCase()} is declared exactly once`);
    }
    assert.equal(overlappingPairs(ws), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);
    assert.equal(overlappingPairs(ws.filter(([a]) => !mine.includes(a))), ROM_OVERLAP_PAIRS,
      '...and the SAME count without them: none of the five overlaps anything. The '
      + 'pairs beyond W393\'s 71 are W428\'s four cue scripts, none of them here.');

    // The nearest declared neighbours, both sides. W551 later placed the A2
    // prefill window below this wave, ending at $2A4702.
    const others = ws.filter(([a]) => !mine.includes(a));
    const below = Math.max(...others.filter(([a, ln]) => a + ln <= HIBACHI_A4.table)
      .map(([a, ln]) => a + ln));
    assert.equal(below, 0x2a4702,
      'the nearest window below is W551\'s A2 prefill list ending at $2A4702');
    const above = Math.min(...others.filter(([a]) => a >= HIBACHI_A4.s3Anim + 0x80).map(([a]) => a));
    // W409 CORRECTION: the nearest neighbour above is no longer W404\'s A1 gun table. A4
    // script 5\'s own emitter rows $2A6688 are declared now, $388 bytes past the end of this
    // wave\'s last block -- and they still do not touch it.
    assert.equal(above, 0x2a6688,
      'the nearest window above $2A62FA is W409\'s A4 script 5 emitter rows $2A6688');
    assert.equal(0x2a6688 - (HIBACHI_A4.s3Anim + 0x80), 0x38e,
      '  ...$38E bytes clear of the end of this wave\'s last block, and the two do not touch');
    assert.ok(0x2a6688 < HIBACHI_A1.main,
      '  ...and W404\'s A1 gun table $2A72C8 is further up still');

    // And the five together are exactly what the port reads, not a byte more.
    assert.equal(mine.reduce((s, a) => s + ws.find(([b]) => b === a)[1], 0),
      0xa8 + 0x54 + 0x10 + 0xc6 + 0x80, 'the five are $2A8 bytes in total');
    assert.equal(SCHED.a4Slots, 5, 'and the walk that reads the first of them has five slots');
  });
