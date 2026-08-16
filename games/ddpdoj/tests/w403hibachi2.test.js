// ===============================================================================================
// W403 -- HIBACHI'S SECOND FORM, `$2A6F12..$2A72C7`, AND THE THREE THINGS IT SHOWED WERE WRONG.
// ===============================================================================================
//
// UNIT. The `$3B6` bytes behind `$2A6BA0 bne.w $2A6F12`, which W399 left as a PORT stop on frame
// 195 because A4 script 2 had just become able to set the byte the branch tests.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "THE UNIT: HIBACHI's SECOND FORM, `$2A6F12..$2A72C8`". The extent is right and the
//      SINGULAR is not. `$2A6F12 0C2E 0001 010E` is `cmpi.b #$1,($10E,A6)`, an EQUALITY test,
//      and `$2A6F18 6600 019A` sends everything that is not 1 to `$2A70B4` -- a SECOND body over
//      a different part ($180, not $140/$160) with a different threshold ($15000, not $11800),
//      one animation byte instead of three, its own phase check and its own death. `($10E,A6)`
//      is a THREE-STATE SELECTOR, and `boss.js`'s note called it a flag. SECTION 1.
//   2. "`$2A6F12..$2A707C is $16A bytes and its death tail $2A707E..$2A72C6 is $248 more`"
//      (boss.js's note, quoted by the brief's "already there" list). Those two spans do add to
//      $3B2 of the $3B6, but they are not a body and a tail: $2A707E is phase A's EXIT, phase A's
//      death is $2A7008..$2A707B, and everything from $2A70B4 up is phase B. SECTION 1.
//   3. "`$2A6BA0 bne.w $2A6F12` ... a branch recorded in a table and never taken until something
//      sets its byte" -- true, and the setter W399 found is not the only one. `$2A637A 1D7C 0002
//      010E` in A4 script 4 is the second, and it is the ONLY writer of a 2. Scanned over the
//      whole 6 MB image, not the boss ROM: exactly two. SECTION 1.
//   4. **"Nine consecutive waves have found the brief wrong somewhere."** Ten. The three exits
//      `$2A6EDC`/`$2A707E`/`$2A7294` really are byte-identical twins -- 52 bytes differing in one
//      `bra.w` displacement -- and writing the shared helper showed `boss.js`'s hand-written
//      `$2A6EDC` had lost the `$8130D2` freeze gate AND the whole `$2A6F04 -> $2A6D8C` arm, which
//      is the timeout route into HIBACHI's death. SECTION 2.
//   5. And porting `$2A6F7A`'s quad flash showed the FIRST form's copy of it, `$2A6C38`, was
//      wrong in the port the same way: `$2A6C5E 0A00 000F` was dropped and the `$19` arm reloaded
//      one register instead of four. `$2A6C86 6F04` is `ble.s`, so the seven-way minimum is
//      SIGNED and the port compared unsigned. SECTION 2.
//   6. "the handler stops at `$2A6F12`, frame 195". Frame 195 was itself an artefact: NOT ONE of
//      the twenty-one A4 pairs in `$2A5886` puts an `rts` between its init and its step, so
//      `$2596FA jsr (A0)` on the init frame runs BOTH, and every countdown in the chain starts a
//      frame early. SECTION 3.
//
// SECTION 1  THE EXTENT AND THE SELECTOR -- 950 bytes, 214 instructions, three states
// SECTION 2  WHAT DOES NOT ALIAS ONTO FORM 1, and the three form-1 defects that proved it
// SECTION 3  the init fall-through: 21 of 21, and the two part scripts that are the other way
// SECTION 4  **THE DELIVERABLE**: how far the real path gets, and WHICH KIND OF STOP
// SECTION 5  the ending chain driven end to end -- both deaths, both phase checks, the timeout
// SECTION 6  ABLATED FROM THE EXPORTED TABLES -- four shapes, four throws, controls labelled
// SECTION 7  the window set: 585, unchanged, and the bytes that say no new one is needed
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
import { installScripts, SCHED, scriptAddresses } from '../src/scheduler.js';
import { handler2A4606 } from '../src/boss.js';
import { HIBACHI_A4, HIBACHI_END_SCRIPTS, HIBACHI_END_COUNTED } from '../src/hibachiend.js';
import { HIBACHI2, HIBACHI2_NOTED } from '../src/hibachi2.js';

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

// ===============================================================================================
// SECTION 1 -- THE EXTENT AND THE SELECTOR.
// ===============================================================================================

test('W403 SECTION 1: the gate is a `cmpi.b`, not a `tst.b`, and its `bne` names a SECOND body',
  { skip: SKIP }, () => {
    // The way in. TRAP 4: the target is the EXTENSION WORD's address plus the displacement.
    assert.equal(w(HIBACHI2.gateSite), 0x6600, '$2A6BA0 is `6600`, bne.w');
    assert.equal(HIBACHI2.gateSite + 2 + disp16(HIBACHI2.gateSite + 2), HIBACHI2.entry,
      '  ...$2A6BA2 + $370 = $2A6F12');
    // ...and $2A6B9C, the test it hangs off, really is a bare non-zero test.
    assert.equal(w(0x2a6b9c), 0x4a2e, '$2A6B9C `4A2E` tst.b (d16,A6)');
    assert.equal(w(0x2a6b9e), HIBACHI2.selector, '  ...($10E,A6)');

    // THE CORRECTION. The target's first instruction is not the second form: it is a THREE-WAY
    // split, and `0C2E` is `cmpi.b (d16,A6)` where `4A2E` would have been `tst.b`.
    assert.equal(w(HIBACHI2.entry), 0x0c2e, '$2A6F12 `0C2E` cmpi.b #imm,(d16,A6) -- NOT 4A2E');
    assert.equal(w(HIBACHI2.entry + 2), 0x0001, '  ...#$1');
    assert.equal(w(HIBACHI2.entry + 4), HIBACHI2.selector, '  ...($10E,A6)');
    assert.equal(w(0x2a6f18), 0x6600, '$2A6F18 `6600` bne.w');
    assert.equal(0x2a6f1a + disp16(0x2a6f1a), HIBACHI2.phaseB,
      '  ...TRAP 4: $2A6F1A + $19A = $2A70B4, the OTHER body');
    assert.equal(HIBACHI2.phaseA, 0x2a6f1c, 'and falling through is $2A6F1C, phase A');
  });

test('W403 SECTION 1: exactly TWO instructions in 6 MB write ($10E,A6), and they write 1 and 2',
  { skip: SKIP }, () => {
    // `move.b #imm,(d16,A6)` is `1D7C`; the displacement is the SECOND extension word, so the
    // scan is for the whole six-byte shape and not for the displacement alone.
    const writers = [];
    for (let a = 0; a + 6 <= IMG.length; a += 2) {
      if (w(a) === 0x1d7c && w(a + 4) === HIBACHI2.selector) writers.push([a, w(a + 2)]);
    }
    // Both builds are in this image (A at $1xxxxx, B at $2xxxxx); the unit is build B.
    const buildB = writers.filter(([a]) => a >= 0x200000);
    assert.deepEqual(buildB, [[0x2a5f40, 1], [0x2a637a, 2]],
      'build B has TWO writers: $2A5F40 writes 1 (A4 script 2) and $2A637A writes 2 (A4 script 4)');
    assert.deepEqual(writers.filter(([a]) => a < 0x200000), [[0x1a4a0e, 1], [0x1a4e16, 2]],
      '  ...and build A mirrors both, which is the cross-build check that there is no third');
    assert.deepEqual(HIBACHI2.selectorWriters, { 1: 0x2a5f40, 2: 0x2a637a },
      '  ...and src/hibachi2.js declares exactly that pair');

    // The second writer is inside A4 script 4, which W399 counted and W403 ports.
    assert.ok(HIBACHI_A4.s4Init <= 0x2a637a && 0x2a637a < 0x2a6418,
      '$2A637A is inside A4 script 4, $2A62FA..$2A6417');
    assert.deepEqual(HIBACHI_END_SCRIPTS.slice().sort(), [1, 2, 3, 4],
      '  ...and script 4 is registered now, so phase B is reachable and not dead code');
    for (const off of [0, 4]) {
      assert.ok(scriptAddresses().includes(l(HIBACHI_A4.table + 4 * 8 + off)),
        `$2A5886[4]${off ? '.step' : '.init'} is registered with the scheduler`);
    }
  });

test('W403 SECTION 1: $3B6 bytes, bounded three ways, and NONE of them an absence',
  { skip: SKIP }, () => {
    assert.equal(HIBACHI2.end + 1 - HIBACHI2.entry, HIBACHI2.bytes,
      '$2A6F12..$2A72C7 inclusive is $3B6 bytes');

    // BOUND 1 -- the `rts` sits AT the last address (TRAP 5), and it is REACHED, not assumed.
    assert.equal(w(HIBACHI2.end - 1), 0x4e75, '$2A72C6 is `4E75`, and $2A72C7 is its second byte');
    const reach = [
      [0x2a729a, 0x2a72c6], [0x2a72a2, 0x2a72c6], [0x2a72b8, 0x2a72c6],
    ];
    for (const [site, want] of reach) {
      assert.equal(w(site), site === 0x2a72b8 ? 0x6000 : 0x6600,
        `$${site.toString(16)} is a word branch`);
      assert.equal(site + 2 + disp16(site + 2), want, `  ...to $2A72C6, the rts`);
    }

    // BOUND 2 -- what is ON the far side. `$2A4306 lea $2A72C8,A1` installs an A1 table there,
    // and its first five longwords are HIBACHI-local code addresses, so it is DATA, not code.
    assert.equal(w(0x2a4306), 0x43f9, '$2A4306 `43F9` lea xxx.l,A1');
    assert.equal(l(0x2a4308), HIBACHI2.end + 1, '  ...naming $2A72C8');
    for (let i = 0; i < 5; i++) {
      const v = l(HIBACHI2.end + 1 + i * 4);
      assert.ok(v > HIBACHI2.end && v < 0x2a9000,
        `$2A72C8[${i}] = $${v.toString(16)} is a HIBACHI-local pointer, so this is a table`);
    }

    // BOUND 3 -- the LAST branch inside the body points BACKWARD, so nothing in it leaves.
    assert.equal(w(0x2a72c2), 0x6000, '$2A72C2 `6000` bra.w');
    assert.equal(0x2a72c4 + disp16(0x2a72c4), HIBACHI2.phaseBDeath,
      '  ...to $2A722E, phase B\'s death -- backward, $96 bytes');

    // And the two `jmp $25980C` tails, which are what makes each death a HANDOVER and not a
    // return. TRAP 5's other half: `4EF9` is six bytes, so $2A7076 ends at $2A707B.
    for (const [site, id, next] of [[0x2a7076, 3, HIBACHI2.phaseANext],
      [0x2a728c, 5, HIBACHI2.phaseBNext]]) {
      assert.equal(w(site), 0x4ef9, `$${site.toString(16)} is \`4EF9\`, a jmp`);
      assert.equal(l(site + 2), 0x25980c, '  ...to $25980C, a4Start');
      assert.equal(w(site - 2), 0x7000 | id, `  ...with moveq #$${id},D0 before it`);
      assert.equal(next, id, '  ...and src/hibachi2.js declares that id');
    }
  });

test('W403 SECTION 1: every `jsr`/`jmp` in both new spans lands somewhere, and TWO are counted',
  { skip: SKIP }, () => {
    // The completeness check the extent alone does not give. `4EB9` and `4EF9` are the only two
    // opcodes that leave these spans, and each one's longword is read back rather than listed.
    const targets = new Map();
    for (const [lo, hi] of [[HIBACHI2.entry, HIBACHI2.end + 1], [HIBACHI_A4.s4Init, 0x2a6418]]) {
      for (let a = lo; a + 6 <= hi; a += 2) {
        if (w(a) === 0x4eb9 || w(a) === 0x4ef9) {
          if (!targets.has(l(a + 2))) targets.set(l(a + 2), a);
        }
      }
    }
    assert.equal(targets.size, 23, 'twenty-three distinct callees across the second form and A4 4');

    // The two that are NOT run, and nothing else is deferred. Both are already counted elsewhere
    // in the port for reasons this file does not get to change (TRAP 15 is not this: neither is
    // in an `else`, and `tests/w382stalenotes.test.js` pins the $23C4D0 one).
    assert.deepEqual([...targets.keys()].filter((t) => t in HIBACHI2_NOTED
      || t === 0x23c4d0 || t === 0x28c170).sort(), [0x23c4d0, 0x28c170],
    'the counted pair is $23C4D0 and $28C170');
    assert.deepEqual(Object.keys(HIBACHI2_NOTED).map(Number).sort(), [0x23c4d0, 0x28c170],
      '  ...and src/hibachi2.js declares exactly those two');

    // Every OTHER target is either a scheduler/ledger routine the port already has, or one of
    // the five three-instruction setters inside HIBACHI's own ROM that this port inlines.
    for (const [a, first, second2, field] of [
      [0x2a6e28, 0x3d7c, 0x0001, 0x0108],     // move.w #$1,($108,A6)  -- INVULNERABLE
      [0x2a6e30, 0x3d7c, 0x0000, 0x0108],     // move.w #$0,($108,A6)  -- vulnerable
      [0x2a6ed4, 0x3d7c, 0x0001, 0x0106],     // move.w #$1,($106,A6)  -- body OFF
    ]) {
      assert.equal(w(a), first, `$${a.toString(16)} is \`3D7C\` move.w #imm,(d16,A6)`);
      assert.equal(w(a + 2), second2, `  ...#$${second2}`);
      assert.equal(w(a + 4), field, `  ...($${field.toString(16).toUpperCase()},A6)`);
      assert.equal(w(a + 6), 0x4e75, '  ...and an rts at once: ONE store, nothing else');
    }
    assert.equal(l(0x2a6ece), 0x426e0106,
      '$2A6ECE is `426E 0106` clr.w ($106,A6) -- a CLR, not a move.w #$0');
    assert.equal(w(0x2a6ed2), 0x4e75, '  ...and its rts');
    assert.equal(l(0x2a6e6a), 0x303ca001,
      '$2A6E6A `303C A001` move.w #$A001,D0 -- the setter that arms phase B\u0027s part $180');
    assert.equal(l(0x2a6e6e), 0x816e0180, '  ...$2A6E6E `816E 0180` or.w D0,($180,A6)');
    assert.equal(w(0x2a6e72), 0x4e75, '  ...and $2A6E72 4E75: three instructions, eight bytes');

    // ...and the ones the CHAIN then hands to that are not ported, counted with measured
    // extents. W405 CORRECTION: A4 $D was on this list and is now RUN, so it moved out of
    // `HIBACHI_END_COUNTED` -- its $60 is still measured here, from the table itself.
    for (const [id, want, ported] of [[0x0d, 0x60, true], [0x0f, 0x46, false],
      [0x05, 0x3aa, false], [0x13, 0x32, false]]) {
      const here2 = l(HIBACHI_A4.table + id * 8);
      const next = Math.min(...[...Array(HIBACHI_A4.pairs).keys()]
        .map((i) => l(HIBACHI_A4.table + i * 8))
        .filter((v) => v > here2));
      assert.equal(next - here2, want,
        `A4 $${id.toString(16).toUpperCase()} is $${want.toString(16)} bytes, table entry to `
        + 'table entry');
      if (ported) {
        assert.equal(HIBACHI_END_COUNTED[id], undefined,
          '  ...and W405 ports it, so hibachiend.js no longer counts it');
      } else {
        assert.equal(HIBACHI_END_COUNTED[id].bytes, want, '  ...and hibachiend.js says so');
      }
    }
  });

// ===============================================================================================
// SECTION 2 -- WHAT DOES NOT ALIAS, and the three defects in form 1 that writing it exposed.
// ===============================================================================================

test('W403 SECTION 2: the three exits are byte-identical but for the word that names their death',
  { skip: SKIP }, () => {
    const bytes = (a) => [...IMG.subarray(a, a + HIBACHI2.exitBytes)];
    const [f1, pa, pb] = [0x2a6edc, 0x2a707e, 0x2a7294].map(bytes);
    const diff = (x, y) => x.map((v, i) => [i, v, y[i]]).filter(([, v, u]) => v !== u);
    assert.equal(HIBACHI2.exitBytes, 0x34, 'each exit is 52 bytes');
    assert.deepEqual(diff(pa, pb).map(([i]) => i), [49],
      'phase A\'s and phase B\'s exits differ in ONE byte, index 49');
    assert.deepEqual(diff(f1, pa).map(([i]) => i), [48, 49],
      '  ...and form 1\'s differs from phase A\'s in two, 48 and 49 -- the same displacement');
    // ...and that displacement is each one's own death block. Recomputed, not written down.
    for (const [exit, want] of Object.entries(HIBACHI2.exits)) {
      const site = Number(exit) + 0x2e;
      assert.equal(w(site), 0x6000, `$${site.toString(16)} is \`6000\` bra.w`);
      assert.equal(site + 2 + disp16(site + 2), want,
        `  ...$${Number(exit).toString(16)}'s exit branches to $${want.toString(16)}`);
    }
  });

test('W403 SECTION 2: DEFECT 1 -- $2A6EDC\'s freeze gate and its ENDING arm were both missing',
  { skip: SKIP }, () => {
    // The two instructions the port did not have, read out of the image.
    assert.equal(w(0x2a6edc), 0x4a79, '$2A6EDC `4A79` tst.w xxx.l');
    assert.equal(l(0x2a6ede), HIBACHI2.freezeWord, '  ...$8130D2, the freeze word');
    assert.equal(w(0x2a6ef6), 0x6600, '$2A6EF6 `6600` bne.w -- the $2428A6 arm');
    assert.equal(0x2a6ef8 + disp16(0x2a6ef8), 0x2a6f04, '  ...to $2A6F04, not to an rts');
    assert.equal(w(0x2a6f04), 0x3d7c, '$2A6F04 `3D7C` move.w #imm,(d16,A6)');
    assert.equal(w(0x2a6f08), 0x010a, '  ...($10A,A6) := 0');
    assert.equal(0x2a6f0c + disp16(0x2a6f0c), 0x2a6d8c,
      '$2A6F0A bra.w -> $2A6F0C - $180 = $2A6D8C, THE ENDING BLOCK');

    // AND IT RUNS. The countdown expires, $2428A6 says P1 is out, and the ending block fires.
    const b = body({ timeout: 3 });
    for (let f = 1; f <= 3; f++) handler2A4606(b.ram, b.ROM, REC, b.ctx);
    assert.equal(b.ram.u8(SUB + 0x1f), 1,
      '$2A6DC2 move.b #$1,($1F,A6) -- the ending block ran, which it never had before');
    assert.equal(b.ram.u32(REC + 0x16), 0xffffffff, '  ...and $2A6DFE killed the pool');

    // ...and the FREEZE GATE holds it off. Same bench, one word set: no ending, ever.
    const frozen = body({ timeout: 3 });
    frozen.ram.setU16(HIBACHI2.freezeWord, 1);
    for (let f = 1; f <= 500; f++) handler2A4606(frozen.ram, frozen.ROM, REC, frozen.ctx);
    assert.equal(frozen.ram.u8(SUB + 0x1f), 0, 'with $8130D2 set, 500 frames and no ending');
    assert.equal(frozen.ram.u16(REC + 0x1a), 3,
      '  ...and ($1A,A5) was never decremented once: the gate is BEFORE the subq');
  });

test('W403 SECTION 2: DEFECT 2 -- form 1\'s quad flash dropped $2A6C5E and reloaded one of four',
  { skip: SKIP }, () => {
    // The instruction that was missing, and the arm that was short.
    assert.equal(l(0x2a6c5e), 0x0a00000f, '$2A6C5E `0A00 000F` eori.b #$F,D0 -- ($E6,A6) IS XORed');
    assert.deepEqual([0x2a6c4e, 0x2a6c52, 0x2a6c56, 0x2a6c5a].map((a) => l(a)),
      [0x103c0010, 0x143c0011, 0x163c0012, 0x183c0016],
      '  ...and $2A6C4C\'s `$19` arm reloads ALL FOUR registers, $10 $11 $12 $16');
    assert.equal(w(0x2a6c4c), 0x6610, '$2A6C4C `6610` bne.s +$10 -> $2A6C5E, over all four');

    // Driven. One hit with the quad already at $19/$19/$19/$19 -- which is what $2A6BF6 leaves
    // when the pool is below $EB33 -- must give $19^$0F, $19^$0E, $19^$0D, $19^$09 after the
    // reload, i.e. $10^$0F, $11^$0E, $12^$0D, $16^$09.
    const b = body({ hit: true });
    for (const o of [0xe6, 0xe7, 0xe8, 0xe9]) b.ram.setU8(SUB + o, 0x19);
    handler2A4606(b.ram, b.ROM, REC, b.ctx);
    assert.deepEqual([0xe6, 0xe7, 0xe8, 0xe9].map((o) => b.ram.u8(SUB + o)),
      [0x10 ^ 0x0f, 0x11 ^ 0x0e, 0x12 ^ 0x0d, 0x16 ^ 0x09],
      'all four reloaded and all four XORed -- $1F $1F $1F $1F');
    // The old code would have left $E6 = $10 (remapped, unXORed) and $E7..$E9 = $19 ^ const.
    assert.notDeepEqual([0xe6, 0xe7, 0xe8, 0xe9].map((o) => b.ram.u8(SUB + o)),
      [0x10, 0x19 ^ 0x0e, 0x19 ^ 0x0d, 0x19 ^ 0x09],
      '  ...and NOT what the port produced before, which differed in all four bytes');
  });

test('W403 SECTION 2: DEFECT 3 -- `6F04` is `ble.s`, so both minimums are SIGNED',
  { skip: SKIP }, () => {
    // Form 1's seven compares and phase A's one are the same two opcodes.
    for (const a of [0x2a6c86, 0x2a6c90, 0x2a6c9a, 0x2a6ca4, 0x2a6cae, 0x2a6cb8, 0x2a6cc2]) {
      assert.equal(w(a), 0x6f04, `$${a.toString(16)} is \`6F04\` ble.s -- signed, not bcs/bls`);
    }
    assert.equal(w(0x2a6fb8), 0x6f04, 'and $2A6FB8, phase A\'s only compare, is the same opcode');
    assert.equal(w(0x2a6fb4), 0xb86e, '$2A6FB4 `B86E` cmp.w (d16,A6),D4');
    assert.equal(w(0x2a6fb6), 0x0178, '  ...($178,A6) = part $160 + $18');
    assert.equal(w(0x2a6fb0 + 2), 0x0158, 'and $2A6FB0 seeds D4 from ($158,A6) = part $140 + $18');
    // Phase B has NO minimum at all: one part, one accumulator, straight into the subtract.
    assert.equal(w(0x2a7142), 0x382e, '$2A7142 `382E` move.w (d16,A6),D4');
    assert.equal(w(0x2a7144), 0x0198, '  ...($198,A6) = part $180 + $18, and no cmp follows it');
    assert.equal(w(0x2a7146), 0x2a3c, '$2A7146 is the `move.l #$7FFF,D5` straight after');

    // Driven, on phase A: one accumulator NEGATIVE. Signed picks it, unsigned picks the other,
    // and the damage the pool loses differs by $8000.
    const b = second({ sel: 1, hit: 0x140 });
    b.ram.setU16(SUB + 0x158, 0x8000);           // -32768 signed, 32768 unsigned
    b.ram.setU16(SUB + 0x178, 0x0001);
    b.ram.setU32(REC + 0x16, 0x00100000);
    handler2A4606(b.ram, b.ROM, REC, b.ctx);
    assert.equal(b.ram.u32(REC + 0x16), 0x00100000 - 0xffff,
      'the SIGNED minimum is $8000, so the damage is $7FFF - -$8000 = $FFFF');
  });

test('W403 SECTION 2: the four shapes phase A and phase B do NOT share with form 1',
  { skip: SKIP }, () => {
    // (a) how many animation bytes each writes. Counted from the stores, not from memory.
    const stores = (from, to, opw) => {
      const out = [];
      for (let a = from; a < to; a += 2) if (w(a) === opw) out.push(w(a + 4) ?? 0);
      return out;
    };
    assert.deepEqual(stores(0x2a6bc8, 0x2a6be0, 0x1d7c), [0x00e6, 0x00e7, 0x00e8, 0x00e9],
      'form 1\'s $2A6BC8 block writes FOUR bytes, $E6..$E9');
    assert.deepEqual([0x2a6f2a, 0x2a6f30, 0x2a6f36].map((a) => w(a + 4)), [0x00e6, 0x00e7, 0x00e8],
      'phase A\'s $2A6F2A block writes THREE, $E6..$E8');
    assert.equal(HIBACHI2.phaseAQuadLen, 3, '  ...and hibachi2.js says three');
    assert.equal(w(0x2a70be), 0x1d7c, 'phase B\'s $2A70BE is one `1D7C`...');
    assert.equal(w(0x2a70c2), HIBACHI2.phaseBQuad, '  ...to ($ED,A6), and it is the only one');
    assert.equal(w(0x2a70c0), 0x0017, '  ...with value $17, not form 1\'s $10');

    // (b) the two thresholds, both `cmpi.l` against ($16,A5), both unsigned `bcc`.
    for (const [site, want] of [[0x2a6f3c, HIBACHI2.phaseAHp], [0x2a70c4, HIBACHI2.phaseBHp],
      [0x2a6be0, 0xeb33]]) {
      assert.equal(w(site), 0x0cad, `$${site.toString(16)} \`0CAD\` cmpi.l #imm,(d16,A5)`);
      assert.equal(l(site + 2), want, `  ...#$${want.toString(16)}`);
      assert.equal(w(site + 6), 0x0016, '  ...($16,A5), the pool');
      assert.equal(w(site + 8) & 0xff00, 0x6400, '  ...and the branch is `64xx`, bcc: UNSIGNED');
    }

    // (c) the kill ledger. Three sites, three different shapes.
    assert.equal(l(0x2a6ff2), 0x203c0008, '$2A6FF2 `203C` move.l #$80000,D0 -- phase A');
    assert.equal(l(0x2a6ff8), 0x4eb90028, '  ...and $2A6FF8 jsr $28615E follows it');
    assert.equal(l(0x2a6ffa), 0x0028615e, '  ...$28615E, scoreKill');
    assert.equal(HIBACHI2.phaseAKill, 0x00080000, '  ...so phase A pays $80000');
    assert.equal(l(0x2a6ff4), 0x00080000, '  ...the immediate itself, at $2A6FF4');
    assert.equal(w(0x2a6d34), 0x203c, 'form 1\'s $2A6D34 is the same `203C` move.l #imm,D0...');
    assert.equal(l(0x2a6d36), 0x00070000, '  ...but the immediate is $70000 -- a DIFFERENT value');
    assert.equal(w(0x2a7172), 0x23fc, '$2A7172 `23FC` move.l #imm,xxx.l -- phase B');
    assert.equal(l(0x2a7174), HIBACHI2.phaseBBombFlash, '  ...#$100000');
    assert.equal(l(0x2a7178), 0x0081b61a, '  ...to $81B61A, and there is NO $28615E anywhere in '
      + 'phase B');
    for (let a = HIBACHI2.phaseB; a < HIBACHI2.end; a += 2) {
      assert.ok(!(w(a) === 0x4eb9 && l(a + 2) === 0x28615e),
        `  ...checked: $${a.toString(16)} is not a jsr $28615E`);
    }

    // (d) the phase checks. Same $23000, different latch, and phase B starts a SEQUENCER.
    assert.equal(w(0x2a6d42), 0x4a2e, 'form 1\'s $2A6D42 tst.b');
    assert.equal(w(0x2a6d44), 0x010c, '  ...($10C,A6)');
    assert.equal(w(0x2a71c6), 0x4a2e, 'phase B\'s $2A71C6 tst.b');
    assert.equal(w(0x2a71c8), HIBACHI2.phaseBPhaseLatch, '  ...($110,A6) -- a DIFFERENT byte');
    assert.equal(l(0x2a6d56), 0x04800002, 'form 1 $2A6D56 subi.l #$23000,D0');
    assert.equal(l(0x2a71d0), 0x04800002, 'phase B $2A71D0 the same subi.l...');
    assert.equal(l(0x2a71d2), 0x00023000, '  ...#$23000');
    assert.equal(w(0x2a6d48), 0x4a79, 'form 1 ALSO tests $813098 at $2A6D48...');
    assert.equal(l(0x2a6d4a), 0x813098, '  ...$813098');
    assert.equal(l(0x2a71e6), 0x4eb90025, 'phase B does NOT, and it starts a sequencer instead:');
    assert.equal(l(0x2a71e8), 0x002598d0, '  ...$2A71E6 jsr $2598D0');
    assert.equal(w(0x2a71e4), 0x700b, '  ...with moveq #$B,D0');
    assert.equal(HIBACHI2.phaseBPhaseSeq, 0x0b, '  ...which hibachi2.js declares');
  });

// ===============================================================================================
// SECTION 3 -- THE INIT FALL-THROUGH. 21 of 21, and it moved every frame number in the chain.
// ===============================================================================================

test('W403 SECTION 3: not one of the 21 A4 pairs puts an `rts` between its init and its step',
  { skip: SKIP }, () => {
    for (let i = 0; i < HIBACHI_A4.pairs; i++) {
      const init = l(HIBACHI_A4.table + i * 8);
      const step = l(HIBACHI_A4.table + i * 8 + 4);
      assert.ok(step > init, `A4 $${i.toString(16)}: the step is above the init`);
      assert.notEqual(w(step - 2), 0x4e75,
        `A4 $${i.toString(16)}: the word before $${step.toString(16)} is `
        + `$${w(step - 2).toString(16).toUpperCase()}, NOT 4E75 -- the init falls into the step`);
    }
    // THE CONTROL, and it is a deliberate one: the stage-1 boss's part scripts, the same
    // {init, step} protocol through the same `$2596FA jsr (A0)`, ARE terminated. The convention
    // is per-table, so "no rts" could not have been assumed for HIBACHI either.
    for (const [init, step] of [[0x29393a, 0x293966], [0x293b82, 0x293bae]]) {
      assert.equal(w(step - 2), 0x4e75,
        `CONTROL: $${init.toString(16)}'s init DOES end in 4E75 at $${(step - 2).toString(16)}`);
    }
    // And the walk really does enter at the init pointer, once, on the first frame only.
    assert.equal(l(0x2596e4), 0x08d40000, '$2596E4 `08D4 0000` bset #0,(A4)');
    assert.equal(w(0x2596e8), 0x6700, '$2596E8 beq.w -- taken when the bit WAS clear');
    assert.equal(w(0x2596ec), 0x5840, '  ...over $2596EC addq.w #$4,D0, the step offset');
    assert.equal(w(0x2596fa), 0x4e90, '$2596FA `4E90` jsr (A0) -- ONE call per slot per frame');
  });

// ===============================================================================================
// SECTION 4 -- THE DELIVERABLE. How far the real path gets, and WHICH KIND OF STOP.
// ===============================================================================================

const REC = 0x810c00;                 // the same scratch record W399's bench uses
const SUB = 0x814800;
const A5BG = 0x80e240;
const STAGE5_X4 = 16;
const STAGE5_COLS = 0x22d770;
const PARK_CLOCK = 0x0346;

/** W399's bench, unchanged, so SECTION 4 measures the same run this wave inherited. */
function realPath({ romSpec = null, loopWord = 1, flag393a = 0 } = {}) {
  const ROM = new RomWindows(romSpec ?? tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };
  ram.setU16(BGRAM.stageX4, STAGE5_X4);
  ram.setU16(A5BG + 0x06, 0x0344);
  backgroundInit(ram, ROM, vram, ctx, A5BG);
  // W404: A1 as well. `$2A4306 lea $2A72C8,A1` sits four instructions above the A4 lea and
  // `$25959C` stores it at $812BD4; without it `$259782 tst.l / beq` skips the whole A1 walk
  // and a gun A4 $A starts could never step or retire.
  installScripts(ram, ROM, { a4: HIBACHI_A4.table, a1: 0x2a72c8 });
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x16, 0x00000010);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU8(SUB + 0x00, 0x44);
  ram.setU16(SUB + 0x18, 0x0000);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(HIBACHI_A4.forkLoopWord, loopWord);
  ram.setU16(HIBACHI_A4.forkFlag, flag393a);
  return { ROM, ram, vram, ctx, log };
}

function runReal(b, frames) {
  const out = { stopped: null, secondFormFrames: 0, push: null };
  b.ctx.scrollEvent = (e) => { if (!out.push) out.push = { ...e, frame: out.f }; };
  for (let f = 1; f <= frames; f++) {
    out.f = f;
    if (!out.stopped) {
      const before = b.ram.u8(SUB + 0x10e);
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
      if (before !== 0 && !out.stopped) out.secondFormFrames += 1;
    }
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

test('W403 SECTION 4: THE REAL PATH reaches $2A689C on frame 321 -- W404 and W405 then ran it',
  { skip: SKIP }, () => {
    const b = realPath();
    const r = runReal(b, 1200);

    assert.equal(r.push?.speed, 0x0010, 'W399\'s chain still fires: $2A5D28 pushed $0010');
    assert.equal(r.push.frame, 192, '  ...on frame 192, not 193 -- SECTION 3\'s fall-through');
    // W404 PORTED A4 $A AND A1 GUN 5, so this run no longer stops on frame 321. W405 CORRECTION:
    // it no longer stops on 982 either -- guns 7 and 8 and A4 $D are ported, so these 1,200
    // frames contain no stop at all. What W403 measured is unchanged and is still asserted below
    // by its bytes: $2A689C IS $2A5886[$A]'s init, script 2 IS what starts it, and it DOES wait
    // on A1 gun 5. Only the consequence moved; `tests/w405hibachiguns78.test.js` owns the stop.
    assert.equal(r.stopped, null, 'the run no longer stops inside 1,200 frames at all');
    assert.equal(r.secondFormFrames, 1200 - 192,
      'and HIBACHI\'s SECOND FORM has owned every frame since 193. ($10E,A6) is set by the '
      + 'SCHEDULER half of frame 192, after the body half of that frame has already run, so '
      + 'frame 193 is the first one the second form owns -- and W399 stopped on it');

    // ---- **WHICH KIND OF STOP, AND THE BYTES THAT DECIDE IT.**
    //
    // A CARTRIDGE stop is the machine doing what the ROM says for ever (W398's `SPEED $0000`).
    // A PORT stop is this translation refusing an address. Three bytes separate them here:
    //
    //   (a) the address thrown at is a TABLE ENTRY the cartridge dispatches through, and the
    //       instruction standing there is ordinary code, not a terminator;
    //   (b) something the cartridge itself wrote is what routed us there;
    //   (c) the cartridge's own code at that address has somewhere to go next.
    assert.equal(l(HIBACHI_A4.table + 0x0a * 8), 0x2a689c,
      '(a) $2A5886[$A].init IS $2A689C -- a live table entry, reached by dispatch');
    assert.equal(w(0x2a689c), 0x397c,
      '  ...and `397C` move.w #imm,(d16,A4) stands there: code, not an rts and not a park');
    assert.equal(l(0x2a5f80), 0x700a4eb9,
      '(b) $2A5F80 moveq #$A,D0 / jsr -- A4 script 2, which this port RAN, is what started it');
    assert.equal(l(0x2a5f82 + 2), 0x0025980c, '  ...$25980C');
    assert.equal(l(0x2a68b8), 0x4eb90025, '(c) $2A68B8 jsr $259A18 -- it has a next step:');
    assert.equal(l(0x2a68ba), 0x00259a18, '  ...$259A18, START A1 GUN SCRIPT 5');
    assert.equal(w(0x2a68b6), 0x7005, '  ...with moveq #$5,D0');
    assert.equal(l(0x2a68c0), 0x4eb90025, '  ...and $2A68C0 jsr $259A4A waits on it');
    assert.equal(w(0x2a68c6), 0x650a,
      '  ...and $2A68C6 is `650A`, bcs (TRAP 6: not bsr.w) -- the wait\'s own branch');
    // So what is behind $A is the A1 gun table at $2A72C8. W403 counted it at $38 bytes,
    // table entry to table entry, and W404 ported exactly that span -- the number is kept here
    // because it is the measurement, not the deferral.
    assert.equal(l(HIBACHI_A4.table + 0x0b * 8) - l(HIBACHI_A4.table + 0x0a * 8), 0x38,
      'A4 $A is $38 bytes, $2A689C..$2A68D3');

    // THE CONTRAST, so "port stop" is not just an assertion. The first-loop arm ends in a
    // CARTRIDGE stop of a third kind: A4 $14 reaches `$2595E8` and SUSPENDS the stage on
    // purpose, and its own byte is a `jsr` to the global suspend, not a table entry.
    assert.equal(l(0x2a6b88), 0x4eb90025, '$2A6B88 jsr...');
    assert.equal(w(0x2a6b8c), 0x95e8, '  ...$2595E8, the SUSPEND -- A4 $14 stopping on purpose');
  });

// ===============================================================================================
// SECTION 5 -- THE ENDING CHAIN, DRIVEN. Both deaths, both phase checks, and the timeout.
// ===============================================================================================

/** The boss alone, with the four stores A4 script 2's one-shot leaves behind named by address.
 *  No background: SECTION 4 owns the scroll, this section owns the body. */
function second({ sel = 1, hit = 0, pool = null, timeout = 0x6270, install = true } = {}) {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };
  // `install: false` leaves $812D38 zero, so $2596C6's walk is skipped entirely and the
  // body is the only thing running. SECTION 7 needs that to read no ROM at all.
  if (install) installScripts(ram, ROM, { a4: HIBACHI_A4.table });
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU16(0x8103e6, 0x8000);                // P1 out -> $2428A6 returns $10
  ram.setU8(SUB + 0x10e, sel);                 // $2A5F40 / $2A637A
  ram.setU16(REC + 0x1a, timeout);             // $2A5EAC move.w #$6270,($1A,A5)
  if (sel === 1) {
    ram.setU32(REC + 0x16, pool ?? 0x0002bc00);      // $2A5F4C
    ram.setU16(SUB + 0x140, 0xa001);                 // $2A6E5C
    ram.setU16(SUB + 0x160, 0xa001);
  } else {
    ram.setU32(REC + 0x16, pool ?? 0x00046000);      // $2A6388/$2A638E
    ram.setU32(REC + 0x1c, pool ?? 0x00046000);      // $2A6392
    ram.setU16(SUB + 0x180, 0xa001);                 // $2A6E6A
  }
  if (hit) {
    ram.setU8(SUB + hit, 0xa4);                // bit $04, inside the $5C mask
    ram.setU16(SUB + hit + 0x18, 0);           // -> the full $7FFF of damage
    if (sel === 1) ram.setU16(SUB + (hit === 0x140 ? 0x178 : 0x158), 0x7fff);
  }
  return { ROM, ram, ctx, log };
}

/** The FIRST form on the same bench -- SECTION 2's two defects live here. */
function body({ hit = false, timeout = 0 } = {}) {
  const b = second({ sel: 0, pool: 0x00100000, timeout });
  b.ram.setU8(SUB + 0x10e, 0);
  if (hit) { b.ram.setU8(SUB + 0x00, 0x44); b.ram.setU16(SUB + 0x18, 0x7fff); }
  return b;
}

function drive(b, frames) {
  const out = { stopped: null, marks: {} };
  for (let f = 1; f <= frames; f++) {
    try { handler2A4606(b.ram, b.ROM, REC, b.ctx); }
    catch (e) { out.stopped = { frame: f, at: e.romAddress, name: e.name, msg: e.message }; }
    // The marks are read AFTER the catch, not inside the try: a death that hands to an
    // unported script throws in the SCHEDULER half of the same frame, and a `break` before
    // this line would report the death as never having happened.
    if (b.ram.u8(SUB + 0x15e) && !out.marks.deathA) out.marks.deathA = f;
    if (b.ram.u8(SUB + 0x15f) && !out.marks.deathB) out.marks.deathB = f;
    if (b.ram.u8(SUB + 0x10e) === 2 && !out.marks.phaseB) out.marks.phaseB = f;
    if (out.stopped) break;
  }
  return out;
}

test('W403 SECTION 5: phase A dies of DAMAGE and the whole ending chain runs to A4 $F',
  { skip: SKIP }, () => {
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    const r = drive(b, 500);

    // ---- phase A's death, frame 1. Its OWN flag byte, not form 1's.
    assert.equal(r.marks.deathA, 1, '$2A7040 move.b #$1,($15E,A6) on frame 1');
    assert.equal(b.ram.u8(SUB + 0x15f), 0, '  ...and NOT $15F, which is phase B\'s');
    assert.ok(b.log.report().some((s) => s.includes('$28C170')),
      '  ...and $2A7008 jsr $28C170 was counted, phase A\'s own BGM cue');

    // ---- $2A7076 handed to A4 3, which is W399's script 3, and it pushed $0200.
    assert.equal(b.ram.u16(SCHED.a4Base) & 0xff, 0x0f,
      'when the run stops, slot 0 carries A4 $F -- script 3 ran, script 4 ran, and script 4 '
      + 'handed on');
    assert.equal(r.marks.phaseB, 192,
      '$2A637A set ($10E,A6) = 2 on frame 192: script 3 spends $C0 from frame 1 (the '
      + 'fall-through), reaches $2A61E8 on frame 192, and script 4\'s init runs in the same pass '
      + 'and falls into its own step');

    // ---- script 4's handover, every store checked against its instruction.
    assert.equal(b.ram.u32(REC + 0x16), 0x00046000, '$2A638E ($16,A5) = $46000');
    assert.equal(b.ram.u32(REC + 0x1c), 0x00046000, '$2A6392 ($1C,A5) = the same');
    assert.equal(b.ram.u16(SUB + 0x180) & 0xa001, 0xa001, '$2A63C8 armed part $180');
    assert.equal(b.ram.u16(SUB + 0x106), 0, '$2A63CE turned the body back ON');
    assert.equal(b.ram.u16(0x81309c), 0xffff, '$2A6380 $81309C = $FFFF');
    assert.equal(b.ram.u32(0x81b62a), REC + 0x16, '$2A63A4 stored `lea ($16,A5),A0`');

    // ---- and phase B ran. $2A70BE is the only writer of ($ED,A6) on the no-hit path.
    assert.equal(b.ram.u8(SUB + 0xed), 0x17, 'phase B wrote ($ED,A6) = $17');
    assert.equal(b.ram.u8(SUB + 0xe9), 0, '  ...and nothing wrote form 1\'s fourth quad byte');

    // ---- WHERE IT STOPS. Another PORT stop, one link further on.
    assert.deepEqual([r.stopped.frame, r.stopped.at, r.stopped.name],
      [321, 0x2a6a30, 'Unreached'],
      'the chain stops on frame 321 at $2A6A30, A4 $F -- script 4\'s $80-frame handover '
      + '($2A640C moveq #$F), and $2A6A4C waits on A1 gun script 9 exactly as $A waits on 5');
    assert.equal(l(HIBACHI_A4.table + 0x0f * 8), 0x2a6a30, '  ...$2A5886[$F].init is $2A6A30');
    assert.equal(HIBACHI_END_COUNTED[0x0f].bytes, 0x46, '  ...and it is $46 bytes');
  });

test('W403 SECTION 5: phase A also dies of the TIMEOUT, on frame 25200 exactly -- a LONG run',
  { skip: SKIP }, () => {
    // TRAP 16 and TRAP 23 together: this arm is a 25,200-frame stall that a short run would
    // report as "phase A does nothing", and the number is only trustworthy because the run
    // reached it. $6270 = 25200, and the first decrement is frame 1.
    const b = second({ sel: 1 });
    const short = drive(second({ sel: 1 }), 500);
    assert.equal(short.marks.deathA, undefined,
      'A 500-FRAME RUN SEES NOTHING: phase A idles on the no-hit arm the whole way');
    const r = drive(b, 26000);
    assert.equal(r.marks.deathA, 0x6270,
      'and the death lands on frame 25200 = $6270, the value $2A5EAC loads into ($1A,A5)');
    assert.equal(r.marks.phaseB, 0x6270 + 191,
      '  ...with script 3\'s 192 frames after it, so phase B starts on frame 25391');
    assert.deepEqual([r.stopped.frame, r.stopped.at, r.stopped.name],
      [0x6270 + 320, 0x2a6a30, 'Unreached'],
      '  ...and the same A4 $F stop, 320 frames after the death');
  });

test('W403 SECTION 5: phase B dies of damage and hands to A4 5 -- the last link this wave reaches',
  { skip: SKIP }, () => {
    const b = second({ sel: 2, hit: 0x180, pool: 0x100 });
    const r = drive(b, 50);
    assert.equal(r.marks.deathB, 1, '$2A7270 move.b #$1,($15F,A6) -- phase B\'s OWN flag');
    assert.equal(b.ram.u8(SUB + 0x15e), 0, '  ...and NOT $15E, which is phase A\'s');
    assert.equal(b.ram.u32(0x81b61a), HIBACHI2.phaseBBombFlash,
      '$2A7172 stored $100000 to $81B61A -- and no $28615E was called');
    assert.equal(b.ram.u8(0x8130f8) & 0xc0, 0xc0,
      '$2A722E/$2A7236 bset #6 and #7 -- which phase A\'s death does NOT do');
    assert.equal(b.ram.u16(SUB + 0x180), 0x8000, '$2A7276 re-armed part $180');
    assert.equal(b.ram.u8(SUB + 0xed), 0x17, '$2A727C ($ED,A6) = $17');
    assert.deepEqual([r.stopped.frame, r.stopped.at, r.stopped.name],
      [1, 0x2a6418, 'Unreached'],
      '$2A728C jmp $25980C with D0 = 5 -- and A4 5 is unported, so this is a PORT stop at '
      + '$2A6418 on the same frame');
    assert.equal(l(HIBACHI_A4.table + 5 * 8), 0x2a6418, '  ...$2A5886[5].init is $2A6418');
    assert.equal(HIBACHI_END_COUNTED[0x05].bytes, 0x03aa, '  ...and it is $3AA bytes, counted');
  });

test('W403 SECTION 5: phase B\'s $23000 check fires ONCE and starts A4 $13 and sequencer $B',
  { skip: SKIP }, () => {
    // Pool just above $23000 so one $7FFF hit crosses it. `bpl` skips when the difference is
    // NOT negative, so the arm needs the pool strictly below the threshold.
    const b = second({ sel: 2, hit: 0x180, pool: 0x00023100 });
    const r = drive(b, 50);
    assert.deepEqual([r.stopped.frame, r.stopped.at, r.stopped.name],
      [1, 0x2a6b48, 'Unreached'],
      'A4 $13 = $2A6B48 on frame 1: $2A71EE started it and $2A5886[$13].init is unported');
    assert.equal(l(HIBACHI_A4.table + 0x13 * 8), 0x2a6b48, '  ...that table entry, read back');
    assert.equal(b.ram.u8(SUB + HIBACHI2.phaseBPhaseLatch), 1,
      '$2A71FA latched ($110,A6) -- so it cannot fire twice');
    assert.equal(b.ram.u16(SUB + 0x108), 1, '$2A71F4 jsr $2A6E28 -- INVULNERABLE');
    assert.deepEqual([0x81b414, 0x81b416, 0x81b418, 0x81b41a].map((a) => b.ram.u16(a)),
      [1, 1, 1, 1], '$2A7200..$2A7218 set all four');
    assert.equal(b.ram.u16(SCHED.seqPending), 0x0b, '$2A71E6 seqStart with D0 = $B');
    // The latch, driven: the same bench with ($110,A6) already set never reaches $2A71D8.
    const latched = second({ sel: 2, hit: 0x180, pool: 0x00023100 });
    latched.ram.setU8(SUB + HIBACHI2.phaseBPhaseLatch, 1);
    const r2 = drive(latched, 50);
    assert.equal(r2.stopped, null, 'with the latch already set, 50 frames and no dispatch at all');
    assert.equal(latched.ram.u16(SCHED.seqPending), 0, '  ...and no sequencer start');
  });

test('W403 SECTION 5: phase B\'s HOLD arm restores the pool from ($1C,A5) and cannot be killed',
  { skip: SKIP }, () => {
    // $2A70F0/$2A70F6: with $8130D4 set, the hit arm goes straight to $2A7106, which copies
    // ($1C,A5) BACK over ($16,A5). The same hit that kills phase B without it does nothing.
    const b = second({ sel: 2, hit: 0x180, pool: 0x100 });
    b.ram.setU32(REC + 0x1c, 0x00046000);         // the shadow $2A6392 leaves
    b.ram.setU16(0x8130d4, 1);
    const r = drive(b, 60);
    assert.equal(r.stopped, null, 'no death, no dispatch: 60 frames of the hold arm');
    assert.equal(b.ram.u32(REC + 0x16), 0x00046000,
      '$2A7116 move.l ($1C,A5),($16,A5) put the pool back every frame');
    assert.equal(b.ram.u16(SUB + 0x198), 0x7fff, '$2A7112 reset the accumulator too');
    assert.equal(b.ram.u16(SUB + 0x13a), 0,
      '  ...and ($13A,A6) was NOT written: $2A7100 is only on the $811F72 arm');

    // CONTROL, labelled: the same bench with $8130D4 clear and $811F72 set DOES write $13A.
    const other = second({ sel: 2, hit: 0x180, pool: 0x100 });
    other.ram.setU32(REC + 0x1c, 0x00046000);
    other.ram.setU16(0x811f72, 1);
    drive(other, 2);
    assert.equal(other.ram.u16(SUB + 0x13a), 0x0028 - 2,
      '$2A7100 wrote $28 and $2A7190 has spent two of it');
    assert.equal(other.ram.u16(SUB + 0x194), 0x0800,
      '  ...and a non-zero ($13A,A6) makes $2A7194 pick $800, not $2A7186\'s $500');
  });

test('W403 SECTION 5: phase A\u0027s quad flash -- ALL THREE reloaded, ALL THREE XORed',
  { skip: SKIP }, () => {
    // ADDED AFTER THE TRAP-21 AUDIT. Ablating `^ 0x0f` off ($E6,A6), and ablating the `$19` arm
    // down to one register, BOTH came back green against the first draft of this file: the ROM
    // bytes were asserted and the behaviour was not. These two runs pin it.
    //
    // `$2A6F86 cmpi.b #$19,D0` tests ($E6,A6) ALONE, and `$2A6F8C/90/94` then reload all three,
    // so a quad whose other two bytes are junk must still come out $1F/$1F/$1F.
    const hot = second({ sel: 1, hit: 0x140 });
    hot.ram.setU8(SUB + 0xe6, 0x19);
    hot.ram.setU8(SUB + 0xe7, 0x77);
    hot.ram.setU8(SUB + 0xe8, 0x88);
    handler2A4606(hot.ram, hot.ROM, REC, hot.ctx);
    assert.deepEqual([0xe6, 0xe7, 0xe8].map((o) => hot.ram.u8(SUB + o)),
      [0x10 ^ 0x0f, 0x11 ^ 0x0e, 0x12 ^ 0x0d],
      '$19 in ($E6,A6) reloads $10/$11/$12 into all three, THEN $0F/$0E/$0D XOR all three');

    // ...and the other arm, where the compare misses and the three original bytes are XORed.
    const cold = second({ sel: 1, hit: 0x140 });
    cold.ram.setU8(SUB + 0xe6, 0x77);
    cold.ram.setU8(SUB + 0xe7, 0x88);
    cold.ram.setU8(SUB + 0xe8, 0x99);
    handler2A4606(cold.ram, cold.ROM, REC, cold.ctx);
    assert.deepEqual([0xe6, 0xe7, 0xe8].map((o) => cold.ram.u8(SUB + o)),
      [0x77 ^ 0x0f, 0x88 ^ 0x0e, 0x99 ^ 0x0d],
      '  ...and ($E6,A6) is XORed on this arm too -- $2A6C62\u0027s three-constant reading was wrong '
      + 'about form 1 and would have been wrong about phase A');
  });

test('W403 SECTION 5: phase A\u0027s kill pays $80000 into the ledger, not form 1\u0027s $70000',
  { skip: SKIP }, () => {
    // ADDED AFTER THE TRAP-21 AUDIT: swapping the immediate to $70000 was GREEN.
    // `$28615E`\u0027s `$286174 btst #4,D1` is what credits P1, so the hit mask has to carry $10 --
    // and $10 is inside the $5C mask $2A6F24 applies, so this is a hit the cartridge can make.
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    b.ram.setU8(SUB + 0x140, 0xb4);              // $10 (P1 credit) + $04, both inside $5C
    drive(b, 1);
    assert.equal(b.ram.u16(SUB + 0x10a), 0x14, '$2A6F70 stored the mask $14 into ($10A,A6)...');
    assert.equal(b.ram.u16(0x81b4c0), 8,
      '  ...and $2A6FEE fed it to $28615E with D0 = $80000, whose top BCD digit lands at '
      + '$81B4C0. Form 1\u0027s $70000 would put a 7 there');
  });

test('W403 SECTION 5: A4 script 4\u0027s ($1C,A5) shadow is written BEFORE phase B\u0027s join runs',
  { skip: SKIP }, () => {
    // ADDED AFTER THE TRAP-21 AUDIT, and it turned an apparent hole into a labelled EQUIVALENCE:
    // deleting `$2A6392 move.l D0,($1C,A5)` was green because `$2A7180 move.l ($16,A5),($1C,A5)`
    // rewrites the same value on phase B\u0027s very first frame. The store is only observable in
    // the ONE frame between them, so the run has to stop in that frame to see it.
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    drive(b, 191);
    assert.equal(b.ram.u32(REC + 0x1c), 0, 'after frame 191 the shadow is still zero');
    assert.equal(b.ram.u8(SUB + 0x10e), 1, '  ...and ($10E,A6) is still 1, so script 4 has not run');
    drive(b, 1);
    assert.equal(b.ram.u8(SUB + 0x10e), 2, 'frame 192 runs script 4...');
    assert.equal(b.ram.u32(REC + 0x1c), 0x00046000, '  ...and $2A6392 put $46000 in the shadow');
    assert.equal(b.ram.u32(REC + 0x16), 0x00046000, '  ...matching $2A638E\u0027s pool');
    drive(b, 1);
    assert.equal(b.ram.u32(REC + 0x1c), 0x00046000,
      '  ...and frame 193, phase B\u0027s first, writes the same value again through $2A7180');
  });

test('W403 SECTION 5: form 1\u0027s seven-way minimum is SIGNED, driven',
  { skip: SKIP }, () => {
    // ADDED AFTER THE TRAP-21 AUDIT: making boss.js\u0027s loop unsigned again was GREEN, because
    // SECTION 2\u0027s test only drove phase A\u0027s two-way version. Same opcode, eight parts.
    const b = body({ hit: true });
    for (const part of [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0]) {
      b.ram.setU16(SUB + part + 0x18, 0x7fff);
    }
    b.ram.setU16(SUB + 0x38, 0x8000);            // part $20 + $18 -- NEGATIVE, and the smallest
    handler2A4606(b.ram, b.ROM, REC, b.ctx);
    assert.equal(b.ram.u32(REC + 0x16), 0x00100000 - 0xffff,
      'the signed minimum is -$8000, so $2A6CEE spends $7FFF - -$8000 = $FFFF. Unsigned would '
      + 'have picked $7FFF and spent nothing at all');
    assert.equal(b.ram.u16(SUB + 0x38), 0x7fff, '  ...and $2A6CD2 re-armed the accumulator');
  });

// ===============================================================================================
// SECTION 6 -- ABLATED FROM THE EXPORTED TABLES. Four shapes, four throws, controls labelled.
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

test('W403 SECTION 6: the A4 table TRUNCATED to four pairs -- script 4 is the first thing off it',
  { skip: SKIP }, () => {
    // SHAPE 1: a truncation that survives everything W399 ran and dies on what W403 added.
    // $20 bytes is ids 0..3, so script 3 dispatches and its handover to id 4 does not.
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    b.ROM = new RomWindows(reshaped(HIBACHI_A4.table, 0x20));
    const r = drive(b, 500);
    assert.ok(r.stopped, 'the walk must refuse, not dispatch nothing');
    assert.match(r.stopped.msg, /outside every ROM window/, 'a WINDOW refusal, named');
    assert.equal(r.stopped.at, HIBACHI_A4.table + 4 * 8,
      'it names $2A58A6, id 4\'s init pointer, the first longword past the cut');
    assert.equal(r.stopped.frame, 192, '  ...on frame 192, the handover frame');
    assert.equal(r.marks.deathA, 1, 'POSITIVE CONTROL: phase A still died on frame 1 -- the cut '
      + 'is above everything the second form itself needs');
  });

test('W403 SECTION 6: the A4 table TRUNCATED to five pairs -- the throw MOVES to A4 $F',
  { skip: SKIP }, () => {
    // SHAPE 2: the SAME window, one pair wider. A truncation that moves rather than vanishing is
    // what says the run reads the entry it claims to read, and not merely "some" entry.
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    b.ROM = new RomWindows(reshaped(HIBACHI_A4.table, 0x28));
    const r = drive(b, 500);
    assert.match(r.stopped.msg, /outside every ROM window/, 'still a WINDOW refusal');
    assert.equal(r.stopped.at, HIBACHI_A4.table + 0x0f * 8,
      'now it names $2A58FE, id $F\'s init pointer -- the throw MOVED, which is what says the '
      + 'run reads the entry it claims to and not merely "an" entry');
    assert.equal(r.stopped.frame, 321,
      '  ...on frame 321: $2A640C fires on frame 320 and $25980C fills slot 0, which the '
      + 'walk has already passed, so the dispatch is the next frame');
    assert.equal(r.marks.phaseB, 192, 'POSITIVE CONTROL: script 4 ran, so phase B was reached');
  });

test('W403 SECTION 6: script 3\'s animation chain REMOVED -- phase A\'s death has nowhere to go',
  { skip: SKIP }, () => {
    // SHAPE 3: a whole window deleted, on the far side of a death this section drives.
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    b.ROM = new RomWindows(reshaped(HIBACHI_A4.s3Anim, null));
    const r = drive(b, 500);
    assert.equal(r.stopped?.at, HIBACHI_A4.s3Anim, 'it names $2A627A, script 3\'s count word');
    assert.equal(r.stopped.frame, 192, '  ...on frame 192');
    assert.equal(r.marks.deathA, 1, 'POSITIVE CONTROL: the death itself is untouched');
    assert.equal(r.marks.phaseB, undefined,
      '  ...and phase B was never reached, which is how the ORDER of $2A61CC and $2A61E8 is '
      + 'fixed: the chain load is before the handover');
  });

test('W403 SECTION 6: the kind table REMOVED -- script 3\'s per-frame emitter, not the body',
  { skip: SKIP }, () => {
    // SHAPE 4: a window neither the second form nor script 4 reads. It must redden the chain
    // and NOT the two bodies -- an ablation that reddens everything proves nothing.
    const spec = reshaped(HIBACHI_A4.kindTable, null);
    const b = second({ sel: 1, hit: 0x140, pool: 0x100 });
    b.ROM = new RomWindows(spec);
    const r = drive(b, 500);
    assert.ok(r.stopped, 'script 3\'s $2A6214 reads the table every time its counter underflows');
    assert.ok(r.stopped.at >= HIBACHI_A4.kindTable
      && r.stopped.at < HIBACHI_A4.kindTable + 0x10, '  ...inside $2A5DC8..$2A5DD7');
    assert.equal(r.stopped.frame, 4, '  ...on frame 4, script 3\'s fourth step frame');

    // NEGATIVE CONTROL, labelled: phase B reads no ROM at all, so the same ablation is INVISIBLE
    // to it. This is a deliberate equivalence, not a hole.
    const bp = second({ sel: 2, hit: 0x180, pool: 0x00023100 });
    bp.ROM = new RomWindows(spec);
    const bpr = drive(bp, 50);
    assert.deepEqual([bpr.stopped.frame, bpr.stopped.at, bpr.stopped.name],
      [1, 0x2a6b48, 'Unreached'],
      'NEGATIVE CONTROL: phase B behaves identically without the kind table');
  });

// ===============================================================================================
// SECTION 7 -- THE SET. No new window, and the bytes that say none is needed.
// ===============================================================================================

test('W403 SECTION 7: 585 windows, overlap still 71, and NOTHING in the unit reads ROM',
  { skip: SKIP }, () => {
    const ws = WINDOWS();
    assert.equal(ws.length, 593, '585 windows through W403, which declared none; W404 added '
      + 'five for the two A1 gun tables and the gun data blocks');
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
    assert.equal(pairs(ws), 71, '71 overlapping pairs -- the same number for twelve waves');

    // WHY none is needed, and it is a RUN and not a scan. A byte-by-byte hunt for `lea` over
    // $2A6F12..$2A72C7 is exactly the misalignment tools/aligned.py exists to prevent -- it
    // reports `$2A7196` as a `lea` when $2A7196 is the middle of `$2A7194 303C 0800`. So the
    // claim is made the only way that cannot misalign: give the port NO WINDOWS AT ALL and
    // drive both bodies. A single ROM read of any kind would refuse.
    const blind = { ...tables.rom, windows: [] };

    const pa = second({ sel: 1, install: false });
    pa.ROM = new RomWindows(blind);
    for (let f = 1; f <= 200; f++) handler2A4606(pa.ram, pa.ROM, REC, pa.ctx);
    assert.equal(pa.ram.u16(REC + 0x1a), 0x6270 - 200,
      'phase A ran 200 frames with an EMPTY window set: its exit spent 200 of ($1A,A5)');

    const pb = second({ sel: 2, hit: 0x180, pool: 0x100, install: false });
    pb.ROM = new RomWindows(blind);
    handler2A4606(pb.ram, pb.ROM, REC, pb.ctx);
    assert.equal(pb.ram.u8(SUB + 0x15f), 1,
      'and phase B ran all the way to its DEATH with an empty window set');
    assert.equal(pb.ram.u32(0x81b61a), HIBACHI2.phaseBBombFlash, '  ...ledger store and all');

    // The ONE exception, named rather than hidden: phase A's kill arm calls `$28615E`, and
    // that routine reads `$287DF0`. It is the only ROM byte anything in the unit reaches,
    // and its window has been declared since long before this wave.
    const kill = second({ sel: 1, hit: 0x140, pool: 0x100, install: false });
    kill.ROM = new RomWindows(blind);
    const e = caught(() => handler2A4606(kill.ram, kill.ROM, REC, kill.ctx));
    assert.ok(e, 'the kill arm DOES read ROM, through scoreKill');
    assert.ok(e.romAddress >= 0x287df0 && e.romAddress < 0x287e00,
      `  ...and the address it needs is $${e.romAddress.toString(16).toUpperCase()}, inside `
      + '$287DF0, $28615E\'s meter-cap table');
    assert.ok(ws.some(([a, len]) => e.romAddress >= a && e.romAddress < a + len),
      '  ...which is already inside a declared window, so the total stays 585');
  });
