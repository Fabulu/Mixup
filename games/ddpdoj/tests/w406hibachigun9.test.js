// ===============================================================================================
// W406 -- A1 GUN 9 `$2A89BA` AND A4 SCRIPT `$F` `$2A6A30`.
// ===============================================================================================
//
// UNIT. The gun and the script the frame-2928 PORT stop stood on. They are the FIRST LINK of
// HIBACHI's ENDING loop -- phase B's -- and not part of the attack cycle W405 closed.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "the chain {$F,$10,$11,$12} x {gun 9,$A,$B,$C}". It is a CLOSED LOOP OF THREE, and its
//      order is not id order: `$2A6A5C moveq #$11` -> $11 -> `$2A6AE8 moveq #$10` -> $10 ->
//      `$2A6AA2 moveq #$F` -> $F. **A4 $12 is not in it**: `$2A6B34 moveq #$F` only feeds INTO
//      $F, and an enumeration of every `moveq #n / jsr $25980C` in $2A4000..$2AB000 finds no
//      n = $12 at all, so nothing in the boss ROM starts $12. SECTION 2.
//   2. "the A1 convention ... a gun's freeze arm branches BACKWARD into its own init". Nine of
//      the fourteen do. **Gun 9 has no freeze arm at all** -- `$2A89F4` is `subq.b #$1,($2,A4)
//      / bcs.s / rts`, and `4A79 008130D4` stands at neither $2A89F4, $2A8BC0 nor $2A90E0. The
//      consequence is measurable: a frozen gun 5 restarts its pattern, a frozen gun 9 burns its
//      whole magazine while the spawn core's own gate throws the shots away. SECTION 5.
//   3. "$2A6A4A moveq #$9 / $2A6A4C jsr $259A18 is what starts gun 9 and waits on it". The
//      START is $2A6A4C; the WAIT is a second pair, `$2A6A52 moveq #$9 / $2A6A54 jsr $259A4A`,
//      and its `bcs.s` is the arm that returns. Two calls, not one. SECTION 6.
//   4. Not in the brief and not in W405's either: **`$2A7226 4EFA 006C` is a `jmp $2A7294`,
//      phase B's exit, and W403 dropped it.** All three ways out of `$2A71C6`'s phase check go
//      there. Until this wave `bossExitShared` had no phase-B caller, `$2A7088 subq.w
//      #$1,($1A,A5)` never ran for phase B, and `$2A6A6C move.b #$C,($1A,A5)` -- the write this
//      unit ends on -- was a store nothing consumed. SECTION 6.
//
// SECTION 1  the two extents, each bounded three ways, and no bound an absence
// SECTION 2  phase B's gun loop: three links, and the orphan $12
// SECTION 3  **THE DELIVERABLE**: how far the real path runs now, and which kind of stop
// SECTION 4  gun 9 driven, with the bullet RECORDS read back
// SECTION 5  the ablation section -- the inputs that separate constants that agree by default
// SECTION 6  A4 $F, and the ($1A,A5) write that W403's missing `jmp` had made dead
// SECTION 7  the window set: 594, and the three bounds on the one new window
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
import { HIBACHI_A4, HIBACHI_END_COUNTED } from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_SCRIPTS, HIBACHI_GUN_A4_SCRIPTS, HIBACHI_A1_COUNTED,
  gun9Init2A89BA, gun9Step2A89F4, a4F2A6A30,
} from '../src/hibachiguns.js';
import { aim256, AimTables } from '../src/aim.js';
import { RNG } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';

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
const u8 = (v) => v & 0xff;
const u16 = (v) => v & 0xffff;
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);

const GUN9_CODE_END = 0x2a8b0e;      // `4E75` AT that address
const GUN9_BLOB = 0x2a899a;          // the eight $002A89BA self-pointers
const A4F_END = 0x2a6a74;            // `4E75` AT that address

// ===============================================================================================
// SECTION 1 -- THE TWO EXTENTS.
// ===============================================================================================

test('W406 SECTION 1: gun 9 is $1C2 bytes and A4 $F is $46, each bounded THREE ways',
  { skip: SKIP }, () => {
    // ---- GUN 9. $2A89BA init, $2A89F4 step, code through $2A8B0F, then gun $A's data.
    assert.equal(l(HIBACHI_A1.main + 9 * 8), HIBACHI_A1.gun9Init, '$2A72C8[9].init');
    assert.equal(l(HIBACHI_A1.main + 9 * 8 + 4), HIBACHI_A1.gun9Step, '  ...and .step');
    // (1) `4E75` sits AT $2A8B0E -- TRAP 5, the LAST address and not one past it -- and the
    //     retire path's own `bcc.w` lands exactly there.
    assert.equal(w(GUN9_CODE_END), 0x4e75, '(1) $2A8B0E `4E75`, gun 9\'s last instruction');
    assert.equal(w(0x2a8ae8), 0x6400, '  ...$2A8AE8 `6400` bcc.w');
    assert.equal(0x2a8aea + disp16(0x2a8aea), GUN9_CODE_END, '  ...lands on that rts');
    // (2) what FOLLOWS the code is data a `lea` NAMES, one gun further on: gun $A's own init
    //     names $2A8B4C, so $2A8B10.. is gun $A's block and not more of gun 9.
    assert.equal(w(0x2a8b7c), 0x41fa, '(2) $2A8B7C `41FA` lea (d16,PC),A0 -- GUN $A\'s init');
    assert.equal(0x2a8b7e + disp16(0x2a8b7e), 0x2a8b4c, '  ...and it names $2A8B4C');
    // (3) and the table's own next entry closes the extent.
    assert.equal(l(HIBACHI_A1.main + 10 * 8), 0x2a8b7c, '(3) $2A72C8[$A].init is $2A8B7C');
    assert.equal(0x2a8b7c - HIBACHI_A1.gun9Init, 0x1c2, '  ...so gun 9 is $1C2 bytes');
    assert.equal(GUN9_CODE_END + 2 - HIBACHI_A1.gun9Init, 0x156,
      '  ...of which $156 is CODE and the rest is gun $A\'s template and blob');

    // ---- A4 $F. $2A6A30 init, $2A6A36 step, $46 bytes.
    assert.equal(l(HIBACHI_A4.table + 0x0f * 8), 0x2a6a30, '$2A5886[$F].init');
    assert.equal(l(HIBACHI_A4.table + 0x0f * 8 + 4), 0x2a6a36, '  ...and .step');
    // (1) `4E75` AT $2A6A74, and THREE branches reach it.
    assert.equal(w(A4F_END), 0x4e75, '(1) $2A6A74 `4E75`');
    for (const [site, off] of [[0x2a6a42, 0x30], [0x2a6a48, 0x2a], [0x2a6a5a, 0x18]]) {
      assert.equal(w(site) & 0xff, off, `  ...$${site.toString(16)}'s displacement`);
      assert.equal(site + 2 + off, A4F_END, '  ...and it lands on that rts');
    }
    // (2) `4254` clr.w (A4) -- TRAP 6, clr.w (A4) and NOT clr.w D4 -- right before it.
    assert.equal(w(0x2a6a72), 0x4254, '(2) $2A6A72 `4254` clr.w (A4)');
    // (3) and $2A5886[$10].init is the next address, with the SAME init head.
    assert.equal(l(HIBACHI_A4.table + 0x10 * 8), 0x2a6a76, '(3) $2A5886[$10].init is $2A6A76');
    assert.equal(0x2a6a76 - 0x2a6a30, 0x46, '  ...so A4 $F is $46 bytes');
    assert.equal(w(0x2a6a76), 0x397c, '  ...and `397C move.w #imm,(d16,A4)` stands there');
    assert.equal(w(0x2a6a78), 0x0060, '  ...with the same #$60 A4 $F loads');
  });

test('W406 SECTION 1: the two conventions, checked on THESE two and not carried across',
  { skip: SKIP }, () => {
    // A1: `4E75` at step - 2, so the init runs ALONE on the first frame.
    assert.equal(w(HIBACHI_A1.gun9Step - 2), 0x4e75,
      '$2A89F2 `4E75` -- gun 9\'s init does NOT fall through into its step');
    // A4: the word before the step is an OPERAND, so the init falls through.
    assert.notEqual(w(0x2a6a34), 0x4e75,
      '$2A6A34 is `$0002`, the operand of $2A6A30 move.w #$60,($2,A4)');
    assert.equal(w(0x2a6a30), 0x397c, '  ...whose opcode is $2A6A30 `397C`');

    // **AND GUN 9 HAS NO FREEZE HEAD.** Stated as what DOES stand there, never as an absence.
    assert.equal(w(HIBACHI_A1.gun9Step), 0x532c, '$2A89F4 `532C` subq.b #$1,(d16,A4)');
    assert.equal(w(HIBACHI_A1.gun9Step + 2), 0x0002, '  ...at ($2,A4), on the FIRST instruction');
    assert.equal(w(HIBACHI_A1.gun9Step + 4), 0x6502, '  ...`6502` bcs.s over...');
    assert.equal(w(HIBACHI_A1.gun9Step + 6), 0x4e75, '  ...`4E75`, the rts');
    // ...where guns 5..8 open on the freeze test that branches BACKWARD into their own init.
    for (const [ini, step] of [[HIBACHI_A1.gun5Init, HIBACHI_A1.gun5Step],
      [HIBACHI_A1.gun8Init, HIBACHI_A1.gun8Step]]) {
      assert.equal(w(step), 0x4a79, `$${step.toString(16)} 4A79 tst.w <abs.l>`);
      assert.equal(l(step + 2), HIBACHI_A1.freeze, '  ...$8130D4');
      assert.equal(step + 8 + disp16(step + 8), ini, '  ...bne.w -> its OWN init, backward');
    }
    // ...and the whole table, stated as WHAT STANDS at each of the fourteen step entries. The
    // three that are not `4A79` open on something else, each named, so nothing here is an
    // absence: eleven freeze tests, two countdowns and one `clr.w $8130DC`.
    const heads = [...Array(HIBACHI_A1.pairs).keys()]
      .map((i) => w(l(HIBACHI_A1.main + i * 8 + 4)));
    assert.deepEqual(heads, [
      0x4a79, 0x4a79, 0x4a79, 0x4a79, 0x4a79, 0x4a79, 0x4a79, 0x4a79, 0x4a79,
      0x532c,                                        // 9  -- subq.b #$1,($2,A4)
      0x4279,                                        // $A -- clr.w <abs.l>
      0x4a79,
      0x700c,                                        // $C -- moveq #$C,D0; its freeze is LATER
      0x532c,                                        // $D -- subq.b #$1,($2,A4)
    ], 'ten of the fourteen open `4A79 tst.w`, and the four that do not are 9, $A, $C and $D');
    assert.deepEqual([...HIBACHI_A1.noFreezeSteps], [0x2a89f4, 0x2a8bc0, 0x2a90e0],
      '  ...of which THREE have no freeze test at all -- gun $C has one, at $2A8F24, eight '
      + 'bytes past its step entry, so it is not on this list');
    assert.equal(w(0x2a8f24), 0x4a79, '  ...$2A8F24 `4A79` tst.w');
    assert.equal(l(0x2a8f26), HIBACHI_A1.freeze, '  ...$8130D4, gun $C\'s, just not at the head');
    assert.equal(l(0x2a8bc2), 0x008130dc,
      '  ...and gun $A\'s `4279` is `clr.w $8130DC`, a DIFFERENT word from $8130D4');
    // A4 $F's identically-placed test branches FORWARD, to the rts. Same word, opposite arm.
    assert.equal(w(0x2a6a3c), 0x4a79, '$2A6A3C tst.w');
    assert.equal(l(0x2a6a3e), HIBACHI_A1.freeze, '  ...$8130D4');
    assert.equal(w(0x2a6a42) & 0xff00, 0x6600, '  ...`6630` bne.s');
    assert.equal(0x2a6a44 + (w(0x2a6a42) & 0xff), A4F_END, '  ...FORWARD, to the rts');
  });

// ===============================================================================================
// SECTION 2 -- PHASE B'S GUN LOOP. Three links, and the orphan.
// ===============================================================================================

/** Every `moveq #n,D0 / jsr <target>` in the boss ROM, as {address: n}. A positive
 *  enumeration: the claim "nothing starts $12" is a fact about this map, not an absence. */
function callSites(target) {
  const out = new Map();
  for (let a = 0x2a4000; a < 0x2ab000; a += 2) {
    if ((w(a) & 0xff00) !== 0x7000) continue;
    if (w(a + 2) !== 0x4eb9 || l(a + 4) !== target) continue;
    out.set(a + 2, w(a) & 0xff);
  }
  return out;
}

test('W406 SECTION 2: $F -> $11 -> $10 -> $F is a CLOSED LOOP of three, and $12 is an ORPHAN',
  { skip: SKIP }, () => {
    const a4 = callSites(0x0025980c);
    const a1 = callSites(0x00259a18);
    const wait = callSites(0x00259a4a);

    // ---- the three links, each read as {which gun it starts, which script it hands to}.
    for (const [script, gun, next, startAt, waitAt, handAt] of [
      [0x0f, 0x09, 0x11, 0x2a6a4c, 0x2a6a54, 0x2a6a5e],
      [0x11, 0x0b, 0x10, 0x2a6ad2, 0x2a6ae0, 0x2a6aea],
      [0x10, 0x0a, 0x0f, 0x2a6a92, 0x2a6a9a, 0x2a6aa4],
    ]) {
      assert.equal(a1.get(startAt), gun,
        `A4 $${script.toString(16)} starts A1 gun $${gun.toString(16)}`);
      assert.equal(wait.get(waitAt), gun, '  ...and waits on the same id');
      assert.equal(a4.get(handAt), next,
        `  ...then hands to A4 $${next.toString(16)}`);
      // ...and the hand-over really is inside that script's own $2A5886 extent.
      const from = l(HIBACHI_A4.table + script * 8);
      assert.ok(handAt > from && handAt < from + 0x50,
        `  ...$${handAt.toString(16)} is inside A4 $${script.toString(16)}'s own bytes`);
    }
    // ---- **A4 $12 IS NOT IN THE LOOP.** It has the same shape and it feeds INTO $F...
    assert.equal(a1.get(0x2a6b1e), 0x0c, 'A4 $12 starts A1 gun $C');
    assert.equal(a4.get(0x2a6b36), 0x0f, '  ...and hands to $F, one way');
    // ...and NOTHING starts it. Every n the boss ROM ever loads is listed here.
    const started = [...new Set(a4.values())].sort((x, y) => x - y);
    assert.deepEqual(started,
      [0x00, 0x02, 0x04, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10, 0x11, 0x13, 0x14],
      'the seventeen A4 ids a `jsr $25980C` in $2A4000..$2AB000 ever loads');
    assert.ok(!started.includes(0x12),
      'so A4 $12 is an ENTRY into phase B\'s loop that nothing in the boss ROM takes');
    // ...and the three ids that are missing from that list because their start is a `jmp`
    // rather than a `jsr` -- a TAIL call -- are named here, so "absent" never has to be read
    // as "dead". $12 is not one of them.
    for (const [site, id] of [[0x2a6e1e, 1], [0x2a7074, 3], [0x2a728a, 5]]) {
      assert.equal(w(site), 0x7000 | id, `$${site.toString(16)} moveq #$${id},D0`);
      assert.equal(w(site + 2), 0x4ef9, '  ...followed by `4EF9` JMP, not `4EB9` jsr');
      assert.equal(l(site + 4), 0x0025980c, '  ...to $25980C');
    }
  });

test('W406 SECTION 2: the loop re-arms phase B\'s death timer, and both writes are HIGH bytes',
  { skip: SKIP }, () => {
    // Exactly A4 $D's trap, one phase later: `move.b` into ($1A,A5), which is a WORD.
    assert.equal(w(0x2a6a6c), 0x1d7c, '$2A6A6C `1D7C` move.b #imm,(d16,A5)');
    assert.equal(w(0x2a6a6e), 0x000c, '  ...#$C');
    assert.equal(w(0x2a6a70), 0x001a, '  ...at ($1A,A5)');
    assert.equal(w(0x2a6ad8), 0x1d7c, '$2A6AD8 -- A4 $11\'s, and it is the SAME field');
    assert.equal(w(0x2a6ada), 0x0004, '  ...#$4');
    assert.equal(w(0x2a6adc), 0x001a, '  ...($1A,A5)');
    assert.equal(w(0x2a7088), 0x536d, '$2A7088 `536D` subq.w #$1,(d16,A5) -- a WORD subtract');
    assert.equal(w(0x2a708a), 0x001a, '  ...of ($1A,A5), whose HIGH byte those two write');
    // ...and the POSITION of the two writes differs, which is not a detail: $D's is in its
    // INIT and $F's is on the hand-over, after the gun has retired.
    assert.ok(0x2a6a6c > 0x2a6a5e, '$F writes it AFTER $2A6A5E hands to $11');
    assert.ok(0x2a6984 < 0x2a698a, '  ...where A4 $D writes it in the init, before its step');
  });

// ===============================================================================================
// SECTION 3 -- THE DELIVERABLE. How far the real path runs, and which kind of stop.
// ===============================================================================================

const REC = 0x810c00;
const SUB = 0x814800;
const A5BG = 0x80e240;

/** W404's bench, unchanged: the A4 table AND the A1 table, exactly as `$2A4306`/`$2A4318`
 *  install them. Without the A1 install `$812BD4` is zero and `$259782 tst.l / beq` skips the
 *  whole A1 walk, so every gun wait in the chain would hang for ever. */
function realPath() {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };
  ram.setU16(BGRAM.stageX4, 16);
  ram.setU16(A5BG + 0x06, 0x0344);
  backgroundInit(ram, ROM, vram, ctx, A5BG);
  installScripts(ram, ROM, { a4: HIBACHI_A4.table, a1: HIBACHI_A1.main });
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x16, 0x00000010);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU8(SUB + 0x00, 0x44);
  ram.setU16(SUB + 0x18, 0x0000);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(HIBACHI_A4.forkLoopWord, 1);
  ram.setU16(HIBACHI_A4.forkFlag, 0);
  return { ROM, ram, vram, ctx, log };
}

function runReal(b, frames) {
  const out = { stopped: null, shots: 0, bySite: new Map(), a1: [], a4: [], timer: [] };
  b.ctx.bulletSpawn = (site) => {
    out.shots += 1;
    out.bySite.set(site, (out.bySite.get(site) ?? 0) + 1);
  };
  let prev = '';
  let prev4 = '';
  for (let f = 1; f <= frames; f++) {
    if (!out.stopped) {
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
    }
    const live = [...Array(SCHED.a1Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a1Base + i * SCHED.a1Stride))
      .filter((v) => v !== 0).map((v) => (v & 0xff).toString(16)).join(',');
    if (live !== prev) { out.a1.push([f, live]); prev = live; }
    const live4 = [...Array(SCHED.a4Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a4Base + i * SCHED.a4Stride))
      .filter((v) => v !== 0).map((v) => (v & 0xff).toString(16)).join(',');
    if (live4 !== prev4) { out.a4.push([f, live4]); prev4 = live4; }
    if (!out.stopped) out.timer.push(b.ram.u16(REC + 0x1a));
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

test('W406 SECTION 3: the real path reaches frame 3317 and stops at A4 $11', { skip: SKIP },
  () => {
    const r = runReal(realPath(), 8000);

    // ---- WHERE IT RAN. Gun 9 is the twelfth thing in the A1 history and the first one that
    // is NOT part of the attack loop: it starts 415 frames after the loop's last gun retired.
    assert.deepEqual(r.a1.slice(-3), [[2549, ''], [3023, '9'], [3316, '']],
      'the A1 history ends with the attack loop\'s last gun retiring on 2549 and then gun 9, '
      + 'alone, from 3023 to 3315');
    assert.deepEqual(r.a4.slice(-3).map(([, v]) => v), ['4', 'f', '11'],
      'and the A4 history ends script 4 -> $F -> $11');

    // ---- THE ARITHMETIC OF THE 389 FRAMES, every number somebody's instruction.
    const [fStart] = r.a4[r.a4.length - 2];           // the frame A4 $F appears
    assert.equal(fStart, 2927, 'A4 $F is started on 2927 by $2A640E');
    assert.equal(r.a1[r.a1.length - 2][0], 3023, '  ...and gun 9 starts on 3023');
    assert.equal(3023 - 2928, 0x5f,
      '  ...$5F after $F\'s init frame: the init writes #$60 and FALLS THROUGH into the step, '
      + 'which spends one on the same frame (TRAP: the A4 convention)');
    assert.equal(r.a1[r.a1.length - 1][0], 3316, 'gun 9 retires on 3316');
    assert.equal(3316 - 3023, (0x10 + 1) + 69 * 4,
      '  ...293 frames: the init runs ALONE on 3023 (the A1 convention), $10 + 1 STEP frames '
      + 'take the template\'s ($2,A4) to its borrow, then 69 reloads of ($6,A4) = 3, four '
      + 'frames each');

    // ---- **WHICH KIND OF STOP.** Three tests, and none of them an absence.
    assert.deepEqual(r.stopped, { frame: 3317, at: 0x2a6ab6, name: 'Unreached' },
      'the run stops on frame 3317 at $2A6AB6 -- 389 frames past W405\'s 2928');
    //   (a) a live table entry the cartridge dispatches through, with ordinary code at it;
    assert.equal(l(HIBACHI_A4.table + 0x11 * 8), 0x2a6ab6, '(a) $2A5886[$11].init IS $2A6AB6');
    assert.equal(w(0x2a6ab6), 0x397c, '  ...and `397C` stands there, not an rts and not a park');
    //   (b) what routed us there is this wave's own code;
    assert.equal(w(0x2a6a5c), 0x7011, '(b) $2A6A5C `7011` moveq #$11,D0');
    assert.equal(l(0x2a6a60), 0x0025980c, '  ...$2A6A5E jsr $25980C, in A4 $F\'s hand-over');
    assert.equal(HIBACHI_END_COUNTED[0x11].bytes, 0x46, '  ...counted at $46 bytes');
    //   (c) and the code there has somewhere to go: it waits on A1 gun $B.
    assert.equal(w(0x2a6ad0), 0x700b, '(c) $2A6AD0 moveq #$B,D0 / $2A6AD2 jsr $259A18');
    assert.equal(HIBACHI_A1_COUNTED[0x0b].bytes, 0x236, '  ...gun $B, counted at $236 bytes');
    // ...and it is a PORT stop and not a data stop.
    const reg = new Set(scriptAddresses());
    assert.ok(!reg.has(0x2a6ab6) && !reg.has(0x2a8c9a), 'neither A4 $11 nor gun $B is registered');
    assert.ok(reg.has(0x2a6a30) && reg.has(0x2a6a36), '  ...while A4 $F\'s pair IS');
    assert.ok(reg.has(0x2a89ba) && reg.has(0x2a89f4), '  ...and gun 9\'s');

    // ---- **WHAT "COMPLETING" WOULD MEAN, in the cartridge's own terms.** It has NOT happened.
    // The ending is over when `$2595E8` suspends the stage, which only A4 $14 reaches, and A4
    // $14 is only started by script 1's FIRST-LOOP arm. This bench is loop 1 with $80393A set,
    // i.e. the other arm, so the route out is phase B's DEATH -> A4 5.
    assert.equal(w(0x2a5cb4), 0x7014, '$2A5CB4 moveq #$14 -- the only start of the suspend link');
    assert.equal(w(0x2a728a), 0x7005, '$2A728A moveq #$5 / $2A728C jmp -- phase B\'s death tail');
    assert.equal(HIBACHI_END_COUNTED[0x05].bytes, 0x03aa, '  ...and A4 5 is still counted');
  });

test('W406 SECTION 3: 4,865 bullets, and gun 9\'s 1,120 are 70 volleys of SIXTEEN in two arms',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 8000);
    assert.equal(r.shots, 4865, 'the run fires 4,865 where W405\'s fired 3,745');
    assert.equal(4865 - 3745, 1120, '  ...and the 1,120 this wave added are all gun 9\'s');
    // ($4,A4) is the template's $45 with the ($1F6,A6) ramp -- which is ZERO here, because gun
    // 9 is the ONLY writer of $1F6 in the image and it has not run before.
    assert.equal(IMG[HIBACHI_A1.gun9Template + 2], 0x45, 'gun 9\'s template ($4,A4) is $45');
    assert.equal((0x45 + 1) * 16, 1120, '  ...so 70 volleys of sixteen');
    // ...and the two arms alternate strictly, because `btst #$0,($4,A4)` tests the counter.
    assert.equal(r.bySite.get(0x2a8a6e), 560, '$2A8A6E: the 35 ODD volleys');
    assert.equal(r.bySite.get(0x2a8aa6), 560, '$2A8AA6: and the 35 EVEN ones');
    // ---- and the timer really ticks now: ($1A,A5) is strictly decreasing across phase B,
    // which it was not before `$2A7226 jmp $2A7294` was put back. SECTION 6 proves the jmp.
    const seen = r.timer.slice(2900, 3000);
    for (let i = 1; i < seen.length; i++) {
      assert.equal(seen[i], seen[i - 1] - 1,
        `($1A,A5) fell by one on frame ${2901 + i}: $2A7088 is running for phase B`);
    }
  });

// ===============================================================================================
// SECTION 4 -- GUN 9 DRIVEN, WITH THE RECORDS READ BACK.
// ===============================================================================================

const A4SLOT = SCHED.a1Base;

function gunBench({ freeze = 0, p1 = 0x8000, p2 = 0x0000, py = 0x2000, px = 0x2400,
  p2y = 0x1000, p2x = 0x0800 } = {}) {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const shots = [];
  const ctx = { bulletSpawn: (site, res) => shots.push([site, res]) };
  ram.setU16(HIBACHI_A1.freeze, freeze);
  ram.setU16(HIBACHI_A1.selP1, p1);
  ram.setU16(HIBACHI_A1.selP1 + 2, py);
  ram.setU16(HIBACHI_A1.selP1 + 4, px);
  ram.setU16(HIBACHI_A1.selP2, p2);
  ram.setU16(HIBACHI_A1.selP2 + 2, p2y);
  ram.setU16(HIBACHI_A1.selP2 + 4, p2x);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU16(A4SLOT, 0x8009);
  return { ROM, ram, ctx, shots };
}

/** The bullet RECORD, not the call. */
const rec = (ram, entry) => {
  const a = entry[1][0].addr;
  return {
    site: entry[0],
    kind: ram.u16(a + BREC.typeWord) & 0x3f,
    dir: ram.u8(a + BREC.dir),
    speed: ram.u8(a + BREC.speed),
    posA: ram.u16(a + BREC.posA),
    posB: ram.u16(a + BREC.posB),
  };
};
const baseSpeed = (kind) => w(l(0x281956 + 4 * kind) + 0x0e);
/** `$242EC2` without calling the port's copy: bump the counter, read the image's table. */
const peek242EC2 = (ram) => IMG[0x242e42 + ((ram.u8(RNG.counter) + 1) & 0xff)];

const AIM = () => new AimTables(new RomWindows(tables.rom));
const aimAt = (py, px) => aim256(AIM(), 0x3800, 0x1c00, py, px);

test('W406 SECTION 4: the init is SEVEN template words, ONE draw and a hard-coded $20',
  { skip: SKIP }, () => {
    const b = gunBench();
    const before = b.ram.u8(RNG.counter);
    const want = peek242EC2(b.ram);
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);

    for (let i = 0; i < 7; i++) {
      if (i === 6) continue;                          // ($E,A4) is overwritten below
      assert.equal(b.ram.u16(A4SLOT + 2 + i * 2), w(HIBACHI_A1.gun9Template + i * 2),
        `template word ${i}`);
    }
    // TRAP 3: ONE word literal covering TWO byte fields, twice over.
    assert.equal(b.ram.u16(A4SLOT + 0x04), 0x4545, '($4,A4)/($5,A4) are ONE word $4545');
    assert.equal(b.ram.u8(A4SLOT + 0x0e), 0x20,
      '($E,A4) is $20 -- $2A89CA move.b, over the HIGH half of the template word $0001');
    assert.equal(b.ram.u8(A4SLOT + 0x0f), 0x01, '  ...and $01, its LOW half, survives as the step');
    assert.equal(w(HIBACHI_A1.gun9Template + 12), 0x0001,
      '  ...the ROM word really is $0001, so both bytes come out of one literal');

    // THE TWO KINDS AND THE BIAS.
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0x0009, '($8,A4) is the speed bias $9');
    assert.equal(b.ram.u16(A4SLOT + 0x0a), 0x0007, '($A,A4) is the EVEN arm\'s kind, 7');
    assert.equal(b.ram.u16(A4SLOT + 0x0c), 0x0007, '($C,A4) is the ODD arm\'s kind, also 7');

    // ONE draw, not two: gun 9 has no `$242E24` seed at all, where guns 5 and 8 both do.
    assert.equal(b.ram.u8(RNG.counter), u8(before + 1), 'exactly ONE RNG draw');
    assert.ok(want >= 0, '  ...and it is $242EC2, whose byte is 0..255');
    assert.equal(w(0x2a89d0), 0x4eb9, '$2A89D0 `4EB9` jsr');
    assert.equal(l(0x2a89d2), 0x00242ec2, '  ...$242EC2');
    assert.equal(w(0x2a89d6), 0x6a00, '  ...$2A89D6 `6A00` bpl.w, and it is ALWAYS taken: '
      + '$242EC2 ends with no ext.w, so bit 15 is clear whatever the table holds');
    assert.equal(0x2a89d8 + disp16(0x2a89d8), 0x2a89de, '  ...over $2A89DA neg.b ($F,A4)');
  });

test('W406 SECTION 4: both A6 ramps, and they land in DIFFERENT halves of the slot',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU8(SUB + 0x1f6, 0x0a);
    b.ram.setU16(SUB + 0x1f8, 0x0002);
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x04), u8(0x45 + 0x0a), '($1F6,A6) adds to ($4,A4)...');
    assert.equal(b.ram.u8(A4SLOT + 0x05), u8(0x45 + 0x0a), '  ...and to ($5,A4)');
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0x0009 + 2,
      '($1F8,A6) adds to ($8,A4), the speed BIAS -- a WORD add, not a byte one');
    assert.equal(b.ram.u16(A4SLOT + 0x0a), 0x0007, '  ...and NOT to the kind two bytes above it');
  });

test('W406 SECTION 4: the ODD volley is sixteen shots at aim + ($E,A4) - $23, $5 apart',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x04) & 1, 1, 'the template counter $45 is ODD');
    const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    for (let i = 0; i < 0x10; i++) { run(); assert.equal(b.shots.length, 0, 'nothing yet'); }
    run();
    assert.equal(b.shots.length, 16, 'sixteen -- $2A8A6A moveq #$F and a dbra (TRAP 2, N+1)');

    const all = b.shots.map((e) => rec(b.ram, e));
    assert.ok(all.every((s) => s.site === 0x2a8a6e), 'all sixteen from the ODD site $2A8A6E');
    // ---- THE HEADINGS, recomputed from src/aim.js and the slot, not read back from the run.
    const aim = aimAt(0x2000, 0x2400);
    const first = u8(u16(u16((aim & 0xff00) | u8(aim + 0x20)) - 0x23));
    assert.deepEqual(all.map((s) => s.dir),
      Array.from({ length: 16 }, (_, k) => u8(first + 5 * k)),
      'aim + ($E,A4) then - $23, and $2A8A74 add.b D6,D1 with D6 = #$5 between shots');
    // ---- THE KIND, THE SPEED AND THE POSITION -- read out of the RECORDS.
    assert.ok(all.every((s) => s.kind === 7), 'kind 7, D0\'s low word from ($C,A4)');
    assert.ok(all.every((s) => s.speed === u8(baseSpeed(7) + 9)),
      'speed is kind 7\'s template base plus the $9 bias in D0\'s HIGH word');
    // D3 = $FA000000 -- a LITERAL, not a $26BFFC lookup -- so the high word lands on axis A
    // and the low word (zero) on axis B, and every one of the sixteen spawns at one point.
    assert.ok(all.every((s) => s.posA === u16(0x3800 + 0xfa00)), 'posA = bossY + $FA00');
    assert.ok(all.every((s) => s.posB === 0x1c00), '  ...and posB = bossX + $0000');
    assert.equal(w(0x2a8a5e), 0x263c, '$2A8A5E `263C` move.l #imm,D3');
    assert.equal(l(0x2a8a60), 0xfa000000, '  ...#$FA000000');
  });

test('W406 SECTION 4: the EVEN volley is the MIRROR -- sub.b, not add.b, off the SAME aim',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(A4SLOT + 0x04, 0x44);                 // an EVEN counter
    b.ram.setU8(A4SLOT + 0x0e, 0x18);                 // a sweep offset that is not $20
    const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    for (let i = 0; i < 0x10; i++) run();
    run();
    assert.equal(b.shots.length, 16, 'sixteen again');
    const all = b.shots.map((e) => rec(b.ram, e));
    assert.ok(all.every((s) => s.site === 0x2a8aa6), 'all from the EVEN site $2A8AA6');

    const aim = aimAt(0x2000, 0x2400);
    const first = u8(u16(u16((aim & 0xff00) | u8(aim - 0x18)) - 0x23));
    assert.deepEqual(all.map((s) => s.dir),
      Array.from({ length: 16 }, (_, k) => u8(first + 5 * k)),
      'aim MINUS ($E,A4), from D5 -- the aim $2A8A3C saved before the odd arm touched D1');
    // ...and the two arms really are a mirror pair about the aim, at the SAME |offset|.
    const c = gunBench();
    gun9Init2A89BA(c.ram, c.ROM, A4SLOT, SUB);
    c.ram.setU8(A4SLOT + 0x04, 0x45);
    c.ram.setU8(A4SLOT + 0x0e, 0x18);
    for (let i = 0; i < 0x11; i++) gun9Step2A89F4(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB);
    const odd = c.shots.map((e) => rec(c.ram, e))[0].dir;
    assert.equal(u8(odd - all[0].dir), 0x30,
      'the odd volley leads the even one by 2 * $18 -- one add.b and one sub.b of ($E,A4)');
  });

test('W406 SECTION 4: the sweep steps ONE per volley and bounces at +$20 and -$20, SIGNED',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    const seen = [];
    for (let v = 0; v < 140; v++) {
      seen.push([b.ram.u8(A4SLOT + 0x0e), i8(b.ram.u8(A4SLOT + 0x0f))]);
      const n = b.shots.length;
      while (b.shots.length === n) run();
    }
    // It starts AT the top of the band, so the first step reverses it at once.
    assert.deepEqual(seen.slice(0, 4), [[0x20, 1], [0x21, -1], [0x20, -1], [0x1f, -1]],
      '$20 -> $21 reverses ($21 > $20 SIGNED), then it walks down');
    // ...and the far end is -$20, which is $E0 read as a byte, so the band is 67 wide.
    const lows = seen.map(([e]) => i8(e));
    assert.equal(Math.min(...lows), -0x21, 'it reaches -$21 and reverses there');
    assert.equal(Math.max(...lows), 0x21, '  ...and +$21 at the other end');
    // THE TWO TESTS ARE SIGNED, and the bytes say so: $6E is BGT and $6C is BGE.
    assert.equal(w(0x2a8abe), 0x0c2c, '$2A8ABE `0C2C` cmpi.b #imm,(d16,A4)');
    assert.equal(w(0x2a8ac0), 0x0020, '  ...#$20');
    assert.equal(w(0x2a8ac4), 0x6e00, '  ...$2A8AC4 `6E00` bgt.w -- SIGNED, to the negate');
    assert.equal(w(0x2a8ad0), 0x0c2c, '$2A8AD0 cmpi.b');
    assert.equal(w(0x2a8ad2), 0x00e0, '  ...#$E0');
    assert.equal(w(0x2a8ad6), 0x6c00, '  ...$2A8AD6 `6C00` bge.w -- SIGNED, and it SKIPS it');
    assert.equal(0x2a8ad8 + disp16(0x2a8ad8), 0x2a8ade, '  ...landing PAST $2A8ADA neg.b');
  });

test('W406 SECTION 4: the retire path -- two ramps, one of them UNSIGNED, and no dead store',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU8(SUB + 0x1f6, 0x1d);                   // one below the $1E ceiling
    b.ram.setU16(SUB + 0x1f8, 0x0001);                // one below the $2 ceiling
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    const volleys = (0x45 + 0x1d) + 1;
    for (let v = 0; v < volleys; v++) {
      const n = b.shots.length;
      while (b.shots.length === n) run();
    }
    run();                                            // the frame the counter borrows
    assert.equal(b.ram.u16(A4SLOT), 0, '$2A8B08 jsr $259B08 cleared the slot');
    assert.equal(b.ram.u8(SUB + 0x1f6), 0x1d + 0x14, '($1F6,A6) rose by $14 -- BELOW the cap');
    assert.equal(b.ram.u16(SUB + 0x1f8), 2, '  ...and ($1F8,A6) by one, TO its cap');
    // ...and a second run finds both caps and stops.
    b.ram.setU16(A4SLOT, 0x8009);
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    const v2 = (0x45 + 0x31) + 1;
    for (let v = 0; v < v2; v++) {
      const n = b.shots.length;
      while (b.shots.length === n) run();
    }
    run();
    assert.equal(b.ram.u8(SUB + 0x1f6), 0x31, '($1F6,A6) sticks at $31: $31 >= $1E, so no add');
    assert.equal(b.ram.u16(SUB + 0x1f8), 2, '  ...and ($1F8,A6) at 2');

    // ---- ABLATION: at EXACTLY $1E, `bcc` (>=) and `bls` (<=) disagree, and nowhere else.
    // The first pass drove $1D and $31, where they agree, and a `bls` mutation came back GREEN.
    const c = gunBench();
    c.ram.setU8(SUB + 0x1f6, 0x1e);
    gun9Init2A89BA(c.ram, c.ROM, A4SLOT, SUB);
    const run2 = () => gun9Step2A89F4(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB);
    for (let v = 0; v < (0x45 + 0x1e) + 1; v++) {
      const n = c.shots.length;
      while (c.shots.length === n) run2();
    }
    run2();
    assert.equal(c.ram.u16(A4SLOT), 0, 'the gun retired');
    assert.equal(c.ram.u8(SUB + 0x1f6), 0x1e,
      'AT $1E the ramp does NOT fire: $2A8AF2 is `6406` BCC, i.e. skip when >= $1E');
    assert.equal(w(0x2a8aec), 0x0c2e, '$2A8AEC `0C2E` cmpi.b #imm,(d16,A6)');
    assert.equal(w(0x2a8aee), 0x001e, '  ...#$1E');
    assert.equal(w(0x2a8af2), 0x6406, '  ...$2A8AF2 `6406` BCC -- unsigned >=, not `bls`');
    // THE WORD RAMP IS UNSIGNED HERE, where gun 5's twin at $2A832C is SIGNED. `$64` is BCC.
    assert.equal(w(0x2a8afa), 0x0c6e, '$2A8AFA `0C6E` cmpi.w #imm,(d16,A6)');
    assert.equal(w(0x2a8afc), 0x0002, '  ...#$2');
    assert.equal(w(0x2a8b00) & 0xff00, 0x6400, '  ...$2A8B00 `6404` BCC -- unsigned');
    assert.equal(w(0x2a832c), 0x0c6e, '$2A832C is gun 5\'s SAME cmpi.w...');
    assert.equal(w(0x2a832e), 0x001a, '  ...against #$1A...');
    assert.equal(w(0x2a8332) & 0xff00, 0x6c00, '  ...but $2A8332 is `6C04` BGE -- SIGNED');
    // ...and gun 9 does NOT reload ($2,A4) from ($3,A4) on the way out, where 5, 6 and 8 do.
    assert.equal(w(0x2a8ae8), 0x6400, '$2A8AE8 bcc.w is followed straight by...');
    assert.equal(w(0x2a8aec), 0x0c2e, '  ...$2A8AEC `0C2E` cmpi.b, the first ramp -- no `196C`');
  });

test('W406 SECTION 4: with both players dead gun 9 fires nothing, does not step its sweep, '
  + 'and STILL toggles ($3,A5)', { skip: SKIP }, () => {
  const b = gunBench({ p1: 0x0000, p2: 0x0000 });
  gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
  const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  for (let i = 0; i < 0x11; i++) run();
  assert.equal(b.shots.length, 0, '$2A8A20 bpl.w declines the whole volley');
  assert.equal(b.ram.u8(A4SLOT + 0x0e), 0x20, '  ...and the sweep does not advance');
  assert.equal(b.ram.u8(A4SLOT + 0x0f), 0x01, '  ...nor does its step reverse');
  assert.equal(b.ram.u8(REC + 0x03), 1,
    '  ...but ($3,A5) IS toggled: $2A8A20 lands ON $2A8ADE, the bchg, the way gun 8 does');
  assert.equal(b.ram.u8(A4SLOT + 0x04), 0x44, '  ...and the volley counter still counts down');
  assert.equal(0x2a8a22 + disp16(0x2a8a22), 0x2a8ade, '$2A8A20\'s bpl.w really lands on $2A8ADE');
  assert.equal(w(0x2a8ade), 0x086d, '  ...which is `086D` bchg #$0,(d16,A5)');
});

// ===============================================================================================
// SECTION 5 -- THE ABLATION SECTION.
//
// Each of these exists because a mutation of the constant it names came back GREEN against the
// tests above: the shipped input made the right answer and the wrong answer agree. The fix is
// always a different INPUT, never a weaker assertion.
// ===============================================================================================

test('W406 SECTION 5 (ablation): the two arms read DIFFERENT kind fields, and the shipped '
  + 'template hides it', { skip: SKIP }, () => {
  // Both template kinds are $0007, so swapping ($A,A4) for ($C,A4) is invisible on the
  // cartridge's own data. Drive a slot where they DIFFER and read the kind out of the record.
  for (const [counter, field, kind, site] of [[0x45, 0x0c, 3, 0x2a8a6e],
    [0x44, 0x0a, 5, 0x2a8aa6]]) {
    const b = gunBench();
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(A4SLOT + 0x04, counter);
    b.ram.setU16(A4SLOT + 0x0a, 5);
    b.ram.setU16(A4SLOT + 0x0c, 3);
    for (let i = 0; i < 0x11; i++) gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    const all = b.shots.map((e) => rec(b.ram, e));
    assert.equal(all.length, 16, `counter $${counter.toString(16)} fired`);
    assert.ok(all.every((s) => s.kind === kind),
      `  ...with kind ${kind}, i.e. out of ($${field.toString(16).toUpperCase()},A4)`);
    assert.ok(all.every((s) => s.site === site), '  ...from the arm that reads it');
  }
  // ...and the ROM words that make the two agree by default, so the equivalence cannot rot.
  assert.equal(w(HIBACHI_A1.gun9Template + 8), w(HIBACHI_A1.gun9Template + 10),
    'the shipped template holds the same kind in both, which is WHY this test exists');
  assert.equal(w(0x2a8a56), 0x302c, '$2A8A56 `302C` move.w (d16,A4),D0');
  assert.equal(w(0x2a8a58), 0x000c, '  ...($C,A4), the ODD arm\'s');
  assert.equal(w(0x2a8a8e), 0x302c, '$2A8A8E the same instruction...');
  assert.equal(w(0x2a8a90), 0x000a, '  ...at ($A,A4), the EVEN arm\'s');
});

test('W406 SECTION 5 (ablation): ($3,A5) picks WHICH player, and it takes TWO alive to see it',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: `pickTarget(ram, a5)` -> `pickTarget(ram, a6)` came back GREEN. With
    // one player alive the exg is undone by `$2A8A1E tst.w (A1) / bmi` and BOTH readings pick
    // the same record, so the selector byte is invisible. Two alive separates them.
    const b = gunBench({ p1: 0x8000, p2: 0x8000, py: 0x2000, px: 0x2400,
      p2y: 0x1000, p2x: 0x0800 });
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u8(REC + 0x03), 0, '($3,A5) starts clear');
    const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    for (let i = 0; i < 0x11; i++) run();
    assert.equal(b.shots.length, 16, 'the first volley');
    assert.equal(b.ram.u8(REC + 0x03), 1, '  ...and $2A8ADE bchg set the selector');
    for (let i = 0; i < 4; i++) run();
    assert.equal(b.shots.length, 32, 'the second volley');

    const all = b.shots.map((e) => rec(b.ram, e));
    // Volley 1: ($3,A5) = 0, so no exg, so PLAYER ONE. Counter $45 -> the ODD arm, sweep $20.
    const dir = (aim, sweep, odd) =>
      u8(u16(u16((aim & 0xff00) | u8(odd ? aim + sweep : aim - sweep)) - 0x23));
    assert.equal(all[0].dir, dir(aimAt(0x2000, 0x2400), 0x20, true),
      'volley 1 is aimed at PLAYER ONE, at $8103E6');
    assert.equal(all[0].site, 0x2a8a6e, '  ...through the odd arm');
    // Volley 2: ($3,A5) = 1, so the exg stands, so PLAYER TWO. Counter $44 -> EVEN, sweep $21.
    assert.equal(all[16].dir, dir(aimAt(0x1000, 0x0800), 0x21, false),
      'volley 2 is aimed at PLAYER TWO, at $810448 -- a different heading entirely');
    assert.equal(all[16].site, 0x2a8aa6, '  ...through the even arm');
    assert.notEqual(all[16].dir, dir(aimAt(0x2000, 0x2400), 0x21, false),
      '  ...and the driven positions really do separate the two records');
    // ...and the byte the exg is decided by is on A5, not A6. `$2A8A0E 4A2D 0003`.
    assert.equal(w(0x2a8a0e), 0x4a2d, '$2A8A0E `4A2D` tst.b (d16,A5)');
    assert.equal(w(0x2a8a10), 0x0003, '  ...($3,A5), the same byte $2A8ADE toggles');
  });

test('W406 SECTION 5 (equivalence): add.b vs add.w on D1 is UNOBSERVABLE, and here is why',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: mutating `$2A8A48 add.b` to a word add came back GREEN, and the input
    // that "should" separate them -- an aim whose low byte overflows -- does not either. This
    // is a REAL equivalence, so it is labelled and proved rather than papered over with a
    // weaker test. The proof is that D1's bits 8..15 have no consumer.
    const b = gunBench();
    gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
    const aim = aimAt(0x2000, 0x2400);
    b.ram.setU8(A4SLOT + 0x0e, u8(0x100 - (aim & 0xff) + 3));   // forces the low byte to wrap
    const sweep = b.ram.u8(A4SLOT + 0x0e);           // read BEFORE the volley steps it
    for (let i = 0; i < 0x11; i++) gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    const all = b.shots.map((e) => rec(b.ram, e));
    assert.equal(all[0].dir, u8(u16(u16((aim & 0xff00) | u8(aim + sweep)) - 0x23)),
      'the port\'s byte add reaches the record...');
    assert.equal(all[0].dir, u8(u16(aim + sweep - 0x23)),
      '  ...and so would a WORD add: the two agree in bits 0..7 by construction');
    // THE CONSUMERS. `$281554`'s core takes D1 as `move.b D1,($B,A0)` twice, and gun 9 -- unlike
    // guns 5 and 8 -- has NO `andi.w #$FC` vector index, because its D3 is a literal. So the
    // only path out of D1 is eight bits wide and the high half cannot be seen.
    assert.equal(w(0x28158e), 0x1141, '$28158E `1141` move.b D1,($B,A0) -- the ONLY consumer...');
    assert.equal(w(0x281596), 0x1141, '  ...and $281596, its ($2B,A0) twin');
    assert.equal(
      [...Array((GUN9_CODE_END - HIBACHI_A1.gun9Init) / 2).keys()]
        .map((i) => w(HIBACHI_A1.gun9Init + i * 2))
        .filter((v) => v === 0x0241).length, 0,
      'and not one `0241 andi.w #imm,D1` anywhere in gun 9, so no wider index exists');
    // The opcodes are still transcribed as the ROM writes them, which is what keeps the label
    // honest: a build that gave D1 a wider consumer would make the difference live.
    assert.equal(w(0x2a8a48), 0xd22c, '$2A8A48 `D22C` add.b (d16,A4),D1');
    assert.equal(w(0x2a8a80), 0x922c, '$2A8A80 `922C` sub.b -- the mirror, also a BYTE');
    assert.equal(w(0x2a8a74), 0xd206, '$2A8A74 `D206` add.b D6,D1 -- the per-shot step, BYTE too');
  });

test('W406 SECTION 5 (ablation): the sweep bounds are SIGNED, seen where signed and unsigned '
  + 'disagree', { skip: SKIP }, () => {
  // AT $20 and AT $E0 signed and unsigned agree exactly, which is where the first pass drove
  // them. Start MID-BAND with a negative offset: unsigned, $F0 >= $E0 would keep going down
  // for ever; signed, -$10 is inside the band and the walk turns at -$21.
  const b = gunBench();
  gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
  b.ram.setU8(A4SLOT + 0x0e, 0xf0);                   // -$10
  b.ram.setU8(A4SLOT + 0x0f, 0xff);                   // stepping DOWN
  const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  const seen = [];
  for (let v = 0; v < 40; v++) {
    seen.push(b.ram.u8(A4SLOT + 0x0e));
    const n = b.shots.length;
    while (b.shots.length === n) run();
  }
  assert.deepEqual(seen.slice(0, 4), [0xf0, 0xef, 0xee, 0xed],
    'a SIGNED test keeps walking down through $F0 -- an UNSIGNED one would too, so far');
  assert.equal(seen[0x11], 0xdf, 'it reaches $DF = -$21...');
  assert.equal(seen[0x12], 0xe0, '  ...and turns THERE, one past the -$20 limit');
  // ...and a positive-going walk that would run away if the OTHER test were unsigned.
  const c = gunBench();
  gun9Init2A89BA(c.ram, c.ROM, A4SLOT, SUB);
  c.ram.setU8(A4SLOT + 0x0e, 0xfe);                   // -$2, well below $20 unsigned AND signed
  c.ram.setU8(A4SLOT + 0x0f, 0x01);
  const seen2 = [];
  for (let v = 0; v < 60; v++) {
    seen2.push(c.ram.u8(A4SLOT + 0x0e));
    const n = c.shots.length;
    while (c.shots.length === n) gun9Step2A89F4(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB);
  }
  assert.deepEqual(seen2.slice(0, 4), [0xfe, 0xff, 0x00, 0x01],
    'the sweep crosses ZERO going up without reversing -- `cmpi.b #$20 / bgt` is signed, so '
    + '$FF is -1 and not 255');
  assert.equal(seen2[0x23], 0x21, 'and turns at +$21');
});

test('W406 SECTION 5 (ablation): the volley reload is ($6,A4), not ($3,A4), and it is a BYTE',
  { skip: SKIP }, () => {
  // ($3,A4) is $80 and ($6,A4) is $03; a port that reloaded the wrong one would fire once
  // every $81 frames instead of every 4, which no shot COUNT over a short run separates.
  const b = gunBench();
  gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
  assert.equal(b.ram.u8(A4SLOT + 0x03), 0x80, '($3,A4) is $80 -- the OTHER half of $1080');
  assert.equal(b.ram.u8(A4SLOT + 0x06), 0x03, '  ...and ($6,A4) is $03');
  const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  for (let i = 0; i < 0x11; i++) run();
  assert.equal(b.shots.length, 16, 'the first volley is on step frame $11');
  const gaps = [];
  for (let v = 0; v < 5; v++) {
    let f = 0;
    const n = b.shots.length;
    while (b.shots.length === n) { run(); f += 1; }
    gaps.push(f);
  }
  assert.deepEqual(gaps, [4, 4, 4, 4, 4],
    'four frames a volley: ($6,A4) = 3 reloaded, and the BORROW is the trigger (TRAP: N+1)');
  assert.equal(w(0x2a89fc), 0x196c, '$2A89FC `196C` move.b (d16,A4),(d16,A4)');
  assert.equal(w(0x2a89fe), 0x0006, '  ...from ($6,A4)');
  assert.equal(w(0x2a8a00), 0x0002, '  ...to ($2,A4)');
});

test('W406 SECTION 5 (ablation): gun 9 does NOT freeze -- it keeps firing into the core\'s gate',
  { skip: SKIP }, () => {
  // A gun that re-seeded on $8130D4 would have a full magazine when the freeze lifted. This
  // one does not: the volleys are spent, and the SHOTS are dropped by `$2814BA`'s own gate.
  const b = gunBench({ freeze: 1 });
  gun9Init2A89BA(b.ram, b.ROM, A4SLOT, SUB);
  const run = () => gun9Step2A89F4(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  for (let i = 0; i < 0x11 + 4 * 3; i++) run();
  assert.equal(b.ram.u8(A4SLOT + 0x04), 0x45 - 4,
    'four volleys were spent WHILE frozen -- the counter is four lower');
  assert.equal(b.ram.u8(A4SLOT + 0x0e), 0x1e,
    '  ...and the sweep advanced four steps too, $20 -> $21 -> $20 -> $1F -> $1E');
  assert.equal(b.shots.filter((e) => e[1][0].addr !== null).length, 0,
    '  ...while every shot was DECLINED by $2814CC, the spawn core\'s own freeze gate');
  // ...where gun 5, on the same input, re-seeds its whole slot every frame instead.
  assert.equal(w(HIBACHI_A1.gun5Step), 0x4a79, 'gun 5\'s step opens `4A79` tst.w');
  assert.equal(w(HIBACHI_A1.gun9Step), 0x532c, '  ...and gun 9\'s opens `532C` subq.b');
});

// ===============================================================================================
// SECTION 6 -- A4 $F, AND THE `jmp` W403 DROPPED.
// ===============================================================================================

const A4S = SCHED.a4Base;

function a4Bench() {
  const ram = new Ram();
  ram.setU16(A4S, 0x800f);
  return ram;
}

test('W406 SECTION 6: A4 $F waits $60, starts gun 9, waits on it and hands to $11',
  { skip: SKIP }, () => {
    const ram = a4Bench();
    // The init falls THROUGH into the step, so frame 1 spends one of the $60.
    a4F2A6A30(ram, A4S, REC, true);
    assert.equal(ram.u16(A4S + 0x02), 0x5f, 'the init wrote $60 and the step spent one at once');
    for (let f = 2; f <= 0x60; f++) {
      a4F2A6A30(ram, A4S, REC, false);
      assert.equal(ram.u16(SCHED.a1Base) & 0xff, f === 0x60 ? 9 : 0,
        `frame ${f}: the gun starts on the $60th, not the $60th AFTER the init`);
    }
    // The gun is running: `$259A4A` returns carry, `$2A6A5A bcs.s` returns, nothing else moves.
    for (let f = 0; f < 20; f++) a4F2A6A30(ram, A4S, REC, false);
    assert.equal(ram.u16(A4S), 0x800f, 'the script is still live while gun 9 runs');
    assert.equal(ram.u8(REC + 0x1a), 0, '  ...and ($1A,A5) is untouched: the write is BELOW');
    assert.equal(ram.u16(SCHED.a4Base + SCHED.a4Stride), 0, '  ...and $11 has not started');

    // Retire the gun the way `$259B08` does, then one more frame.
    ram.setU16(SCHED.a1Base, 0);
    a4F2A6A30(ram, A4S, REC, false);
    assert.equal(ram.u16(SCHED.a4Base + SCHED.a4Stride) & 0xff, 0x11,
      '$2A6A5C moveq #$11 / $2A6A5E jsr $25980C -- A4 $11, and NOT $10');
    assert.equal(ram.u16(SCHED.seqRestart), 1, '$2A6A64 moveq #$9 / $2A6A66 jsr $2598D0');
    assert.equal(ram.u16(SCHED.seqPending), 9, '  ...with id 9');
    assert.equal(ram.u8(REC + 0x1a), 0x0c, '$2A6A6C move.b #$C,($1A,A5)');
    assert.equal(ram.u16(A4S), 0, '$2A6A72 clr.w (A4) -- the slot, not D4');
  });

test('W406 SECTION 6: A4 $F FREEZES by returning, and the freeze does not eat the countdown',
  { skip: SKIP }, () => {
    const ram = a4Bench();
    a4F2A6A30(ram, A4S, REC, true);
    ram.setU16(HIBACHI_A1.freeze, 1);
    for (let f = 0; f < 200; f++) a4F2A6A30(ram, A4S, REC, false);
    assert.equal(ram.u16(A4S + 0x02), 0x5f, 'not one of the $5F was spent while frozen');
    assert.equal(ram.u16(SCHED.a1Base), 0, '  ...and gun 9 never started');
    ram.setU16(HIBACHI_A1.freeze, 0);
    for (let f = 0; f < 0x5f; f++) a4F2A6A30(ram, A4S, REC, false);
    assert.equal(ram.u16(SCHED.a1Base) & 0xff, 9,
      '  ...and it RESUMES, where a frozen A1 gun re-seeds instead');
  });

test('W406 SECTION 6: $2A7226 is a `jmp $2A7294` -- phase B\'s exit, which W403 dropped',
  { skip: SKIP }, () => {
    // The instruction, decoded. TRAP 4: `4EFA` is jmp (d16,PC), and the target is the
    // EXTENSION WORD's address plus the displacement.
    assert.equal(w(0x2a7226), 0x4efa, '$2A7226 `4EFA` jmp (d16,PC)');
    assert.equal(0x2a7228 + disp16(0x2a7228), 0x2a7294,
      '  ...$2A7228 + $6C = $2A7294, phase B\'s copy of the 52-byte exit');
    // ...and ALL THREE ways out of the phase check land on it, so there is no `rts` arm.
    assert.equal(w(0x2a71ca) & 0xff00, 0x6600, '$2A71CA `665A` bne.s');
    assert.equal(0x2a71cc + (w(0x2a71ca) & 0xff), 0x2a7226, '  ...to $2A7226');
    assert.equal(w(0x2a71d6) & 0xff00, 0x6a00, '$2A71D6 `6A4E` bpl.s');
    assert.equal(0x2a71d8 + (w(0x2a71d6) & 0xff), 0x2a7226, '  ...to $2A7226 as well');
    assert.equal(w(0x2a7220), 0x4eb9, '$2A7220 `4EB9` jsr $243DD0 is the last instruction...');
    assert.equal(l(0x2a7222), 0x00243dd0, '  ...before it, so the third way is a FALL-THROUGH');

    // The consequence, driven: ($1A,A5) counts down under phase B now.
    const b = realPath();
    const r = runReal(b, 3000);
    const start = r.timer[2799];                      // the frame A4 script 4 armed phase B
    assert.ok(start > 0, 'phase B is armed by frame 2800');
    assert.equal(r.timer[2899], start - 100,
      '($1A,A5) fell by exactly one a frame for a hundred frames -- $2A7088, reached only '
      + 'through the `jmp` above');
    assert.equal(r.stopped, null, '  ...and the run has not stopped by frame 3000');
  });

/** Phase B on its own, so all THREE arms of `$2A71C6`'s check can be driven. `sel = 2` is what
 *  `$2A637A` writes, and `$2A6F12 cmpi.b #$1 / bne.w` is what turns it into `$2A70B4`. */
function phaseBBench({ latch = 0, pool = 0x00046000 } = {}) {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };
  installScripts(ram, ROM, { a4: HIBACHI_A4.table, a1: HIBACHI_A1.main });
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU8(SUB + 0x10e, 2);                          // PHASE B
  ram.setU16(REC + 0x1a, 0x6270);                     // the death timer, as $2A7014 leaves it
  ram.setU32(REC + 0x16, pool);
  ram.setU32(REC + 0x1c, pool);
  ram.setU16(SUB + 0x180, 0xa001);
  ram.setU8(SUB + 0x110, latch);
  return { ROM, ram, ctx, log };
}

test('W406 SECTION 6 (ablation): ALL THREE arms of the phase check reach $2A7294, not one',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: mutating the latch arm and the fall-through both came back GREEN,
    // because the real path only ever takes the MIDDLE arm -- `$2A71D6 bpl.s`, the pool above
    // $23000. An arm no test drives is an arm no test checks.

    // (1) the `bne` arm: the latch is already set, so the check is skipped entirely.
    const a = phaseBBench({ latch: 1 });
    for (let f = 0; f < 10; f++) handler2A4606(a.ram, a.ROM, REC, a.ctx);
    assert.equal(a.ram.u16(REC + 0x1a), 0x6270 - 10,
      '$2A71CA bne.s $2A7226: ten frames, ten decrements of ($1A,A5)');
    assert.equal(a.ram.u8(SUB + 0x110), 1, '  ...and the latch is untouched, so no arm below ran');

    // (2) the `bpl` arm: the pool is above the threshold, so the block is skipped.
    const b2 = phaseBBench({ pool: 0x00046000 });
    for (let f = 0; f < 10; f++) handler2A4606(b2.ram, b2.ROM, REC, b2.ctx);
    assert.equal(b2.ram.u16(REC + 0x1a), 0x6270 - 10, '$2A71D6 bpl.s $2A7226: ten decrements');
    assert.equal(b2.ram.u8(SUB + 0x110), 0, '  ...and the latch was NOT set');

    // (3) the FALL-THROUGH: the pool is below $23000, so the whole block runs and then drops
    // into the `jmp`. It starts A4 $13, which is unported, so the frame ends in a throw -- and
    // the decrement has to have happened BEFORE it, which is the point.
    const c = phaseBBench({ pool: 0x00022000 });
    let stopped = null;
    for (let f = 1; f <= 3 && !stopped; f++) {
      try { handler2A4606(c.ram, c.ROM, REC, c.ctx); } catch (e) { stopped = e.romAddress; }
    }
    assert.equal(c.ram.u8(SUB + 0x110), 1, '$2A71FA set the latch, so the block really ran');
    assert.equal(c.ram.u16(SCHED.a4Base) & 0xff, 0x13, '  ...and $2A71EE started A4 $13');
    assert.equal(stopped, 0x2a6b48, '  ...which is unported: $2A5886[$13].init');
    assert.equal(c.ram.u16(REC + 0x1a), 0x6270 - 1,
      '  ...and ($1A,A5) still fell, so the fall-through reached $2A7226 first');
  });

// ===============================================================================================
// SECTION 7 -- THE WINDOW.
// ===============================================================================================

test('W406 SECTION 7: ONE new window, 594, bounded three ways and none of them an absence',
  { skip: SKIP }, () => {
    const set = new Map(tables.rom.windows.map(
      (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]));
    assert.equal(set.size, tables.rom.windows.length, 'no duplicate window bases');
    assert.equal(tables.rom.windows.length, 594, '594 windows, 593 + this wave\'s one');

    // (1) the `lea` NAMES the base. TRAP 4: extension-word address plus displacement.
    assert.equal(w(HIBACHI_A1.gun9Init), 0x41fa, '$2A89BA `41FA` lea (d16,PC),A0');
    assert.equal(0x2a89bc + disp16(0x2a89bc), HIBACHI_A1.gun9Template,
      '  ...(1) $2A89BC - $30 = $2A898C');
    // (2) the LENGTH is the `moveq` plus one -- TRAP 2, dbra runs N+1 times.
    assert.equal(w(0x2a89c2), 0x7006, '$2A89C2 `7006` moveq #$6,D0');
    assert.equal(w(0x2a89c4), 0x32d8, '  ...$2A89C4 `32D8` move.w (A0)+,(A1)+');
    assert.equal(w(0x2a89c6), 0x51c8, '  ...$2A89C6 `51C8` dbra');
    assert.equal(0x2a89c8 + disp16(0x2a89c8), 0x2a89c4, '  ...back to the move');
    assert.equal(set.get(HIBACHI_A1.gun9Template), 0x0e, '  ...(2) so 7 words, $E bytes');
    // (3) and $2A899A -- base + $E -- is a POSITIVE witness: the eight self-pointers.
    assert.equal(HIBACHI_A1.gun9Template + 0x0e, GUN9_BLOB, '(3) base + $E is $2A899A');
    for (let i = 0; i < 8; i++) {
      assert.equal(l(GUN9_BLOB + i * 4), HIBACHI_A1.gun9Init,
        `  ...$${(GUN9_BLOB + i * 4).toString(16).toUpperCase()} is $002A89BA`);
    }
    assert.equal(GUN9_BLOB + 0x20, HIBACHI_A1.gun9Init, '  ...and the eighth ends AT the code');

    // ---- NO OTHER WINDOW. Gun 9 reads no muzzle table and no vector table: its D3 is a
    // literal, so the only ROM address the port touches for it is the template.
    for (const site of [0x2a8a5e, 0x2a8a96]) {
      assert.equal(w(site), 0x263c, `$${site.toString(16)} is move.l #imm,D3, not a lea`);
    }
    assert.equal(
      [...Array((GUN9_CODE_END - HIBACHI_A1.gun9Init) / 2).keys()]
        .map((i) => w(HIBACHI_A1.gun9Init + i * 2))
        .filter((v) => (v & 0xf1ff) === 0x41fa).length, 1,
      'exactly ONE `lea (d16,PC),An` in gun 9\'s whole $156 bytes, and it is the template one');
  });

test('W406 SECTION 7: gun 9 is PORTED and A4 $F is out of hibachiend.js\'s counted list',
  { skip: SKIP }, () => {
    assert.deepEqual([...HIBACHI_A1_SCRIPTS], [5, 6, 7, 8, 9], 'five A1 ids are ported now');
    assert.deepEqual([...HIBACHI_GUN_A4_SCRIPTS], [0x0a, 0x0b, 0x0c, 0x0d, 0x0f],
      '  ...and five A4');
    assert.equal(HIBACHI_A1_COUNTED[9], undefined, 'A1 9 is no longer counted');
    assert.equal(HIBACHI_END_COUNTED[0x0f], undefined, '  ...and neither is A4 $F');
    assert.equal(Object.keys(HIBACHI_A1_COUNTED).length + HIBACHI_A1_SCRIPTS.length,
      HIBACHI_A1.pairs, 'ported + counted = fourteen, the whole table');
    // ...and the three links of phase B's loop that are NOT ported are counted, with the
    // extents MEASURED from the table rather than typed.
    const above = [];
    for (let i = 0; i < HIBACHI_A4.pairs * 2; i++) above.push(l(HIBACHI_A4.table + i * 4));
    above.push(0x2a6b94);
    for (const id of [0x10, 0x11, 0x12]) {
      const c = HIBACHI_END_COUNTED[id];
      assert.equal(l(HIBACHI_A4.table + id * 8), c.init, `A4 $${id.toString(16)}.init`);
      const end = Math.min(...above.filter((v) => v > c.step));
      assert.equal(end - c.init, c.bytes, `  ...and its $${c.bytes.toString(16)} bytes`);
    }
    const reg = new Set(scriptAddresses());
    for (const a of [0x2a89ba, 0x2a89f4, 0x2a6a30, 0x2a6a36]) {
      assert.ok(reg.has(a), `$${a.toString(16).toUpperCase()} is registered`);
    }
  });
