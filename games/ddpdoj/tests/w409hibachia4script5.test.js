// ===============================================================================================
// W409 -- A4 SCRIPT 5 `$2A6418`, HIBACHI'S SECOND ENDING, AND THE STAGE ACTUALLY ENDS.
// ===============================================================================================
//
// UNIT. The script the frame-4447 PORT stop stood on: phase B's death tail hands to it
// (`$2A728A moveq #$5 / $2A728C jmp $25980C`) and it is on the ENDING CHAIN, not in a gun loop.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "The ending completes only when `$2595E8` suspends the stage. **Only A4 `$14` reaches
//      it**." There are TWO `jsr $2595E8` in `$2A4000..$2AB000` and this unit holds the other:
//      `$2A6466 4EB9 002595E8`, in state 4, with `$2A646C 4254 clr.w (A4)` right behind it so
//      it fires exactly once. SECTION 2.
//   2. "The ending is no nearer." With this script ported the real path does not stop at all:
//      `$812E06` goes to 1 on **frame 4889** and `$25962E` returns the suspend carry from then
//      on. The second-loop ending is COMPLETE, in the cartridge's own terms. SECTION 3.
//   3. "A4 5 is counted at `$3AA` entry-to-entry -- an upper bound on code length." Correct,
//      and the split is THREE numbers, not two: `$270` of code, `$100` of A4 5's own data, and
//      `$3A` that belong to **A4 SCRIPT 0** -- `$2A5A04 lea` names `$2A6788`. SECTION 1.
//   4. Not in the brief: `$2A6760..$2A676D` is a seventh `$246410` record the count word of
//      `$0006` never reaches. Fourteen dead bytes inside the unit. SECTION 1 and SECTION 7.
//   5. Not in the brief, and it is a defect in the PORT and not in the brief: `bpl` after
//      `jsr $242EC2` reads **bit 7** of the drawn byte, because `$242ED6 move.b (A0,D0.w),D0`
//      is the last instruction that touches the CCR. Ten other sites in five files read bit 15
//      of the returned word instead, which is always clear. SECTION 5.
//
// SECTION 1  the extent -- three numbers, and three bounds on each, no bound an absence
// SECTION 2  the SECOND $2595E8, enumerated out of the image
// SECTION 3  **THE DELIVERABLE**: the real path, and what kind of end it now reaches
// SECTION 4  the five states driven, with the effect RECORDS read back
// SECTION 5  the row table, the two emitters, and the bit-7 cue fork
// SECTION 6  the ablation section -- the inputs that separate constants that agree by default
// SECTION 7  the window set: 599, and three bounds on each of the three new windows
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
import { installScripts, SCHED, scriptAddresses, fadeStep259BB4 } from '../src/scheduler.js';
import { handler2A4606 } from '../src/boss.js';
import {
  HIBACHI_A4, HIBACHI_END_SCRIPTS, HIBACHI_END_COUNTED,
  s5Init2A6418, s5Step2A6458,
} from '../src/hibachiend.js';
import { HIBACHI_A1 } from '../src/hibachiguns.js';
import { B, POOL_B } from '../src/effects.js';
import { PaletteState, PALSTAGE } from '../src/palette.js';
import { drawWord242EC2, drawWord24328E, drawByte242B3C } from '../src/rng.js';
import { i16 } from '../src/ram.js';
import {
  ROM_WINDOW_COUNT,
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

const A4_5_INIT = 0x2a6418;
const A4_5_CODE_END = 0x2a6686;      // `4E75` AT that address
const A4_6_INIT = 0x2a67c2;          // the next table entry, and the end of the $3AA
const S0_ANIM = 0x2a6788;            // A4 SCRIPT 0's chain -- $2A5A04's lea, not A4 5's
const DEAD_ROW = 0x2a6760;           // the seventh $246410 record nothing reads

// ===============================================================================================
// SECTION 1 -- THE EXTENT. THREE numbers out of one $3AA, and three bounds on each.
// ===============================================================================================

test('W409 SECTION 1: the $3AA is $270 of CODE, $100 of A4 5\'s data and $3A that belong to A4 '
  + 'SCRIPT 0, and every bound is a positive witness', { skip: SKIP }, () => {
  // ---- the table entry, and the $3AA the brief quotes.
  assert.equal(l(HIBACHI_A4.table + 5 * 8), A4_5_INIT, '$2A5886[5].init IS $2A6418');
  assert.equal(l(HIBACHI_A4.table + 5 * 8 + 4), HIBACHI_A4.s5Step, '  ...and .step is $2A6458');
  assert.equal(l(HIBACHI_A4.table + 6 * 8), A4_6_INIT, '$2A5886[6].init is $2A67C2');
  assert.equal(A4_6_INIT - A4_5_INIT, 0x03aa, '  ...so entry-to-entry is $3AA, as W408 counted');

  // ---- (1) POSITIVE: `4E75` sits AT $2A6686, the LAST address and not one past it.
  assert.equal(w(A4_5_CODE_END), 0x4e75, '(1) $2A6686 `4E75`, A4 script 5\'s last instruction');
  assert.equal(A4_5_CODE_END + 2 - A4_5_INIT, 0x0270, '  ...so $270 bytes are code');
  // ---- (2) POSITIVE: the four WIDEST forward branches all resolve to that same rts.
  for (const [site, kind] of [[0x2a65f8, 'bne.w'], [0x2a6600, 'bcc.w']]) {
    assert.equal(w(site), site === 0x2a65f8 ? 0x6600 : 0x6400, `$${site.toString(16)} ${kind}`);
    assert.equal(site + 2 + disp16(site + 2), A4_5_CODE_END, '  ...lands ON the rts');
  }
  assert.equal(w(0x2a6668), 0x651c, '$2A6668 `651C` bcs.s');
  assert.equal(0x2a666a + 0x1c, A4_5_CODE_END, '  ...also the rts');
  assert.equal(w(0x2a6672), 0x6612, '$2A6672 `6612` bne.s');
  assert.equal(0x2a6674 + 0x12, A4_5_CODE_END, '  ...also the rts');
  // ---- (3) POSITIVE: $2A6688 is a table BASE, named TWICE by this routine's own leas.
  for (const site of [0x2a657e, 0x2a6628]) {
    assert.equal(w(site), 0x43fa, `$${site.toString(16)} \`43FA\` lea (d16,PC),A1`);
    assert.equal(site + 2 + disp16(site + 2), HIBACHI_A4.s5Emit,
      '  ...(TRAP 4) and it resolves to $2A6688, the SAME base for both emitters');
  }
  assert.equal(HIBACHI_A4.s5Emit, A4_5_CODE_END + 2, '  ...which begins right after the rts');

  // ---- THE THIRD NUMBER, and it is what makes $3AA an upper bound this wave too.
  // $2A5A04 is inside A4 SCRIPT 0 ($2A592E..$2A5A1B, ported by W552) and names $2A6788.
  assert.equal(w(0x2a5a04), 0x41fa, '$2A5A04 `41FA` lea (d16,PC),A0');
  assert.equal(0x2a5a06 + disp16(0x2a5a06), S0_ANIM, '  ...and it names $2A6788');
  assert.ok(0x2a5a04 >= HIBACHI_A4.s0Init && 0x2a5a04 < HIBACHI_A4.s1Init,
    '  ...from inside translated A4 SCRIPT 0');
  assert.equal(HIBACHI_END_COUNTED[0x00], undefined,
    '  ...which W552 removed from the counted inventory');
  assert.equal(w(0x2a5a0a), 0x4eb9, '  ...$2A5A08 nop, $2A5A0A `4EB9` jsr');
  assert.equal(l(0x2a5a0c), 0x00246410, '  ...$246410, so $2A6788 is an ANIMATION CHAIN');
  assert.equal(w(S0_ANIM), 0x0004, '$2A6788\'s count word is 4');
  assert.equal(2 + 4 * 14, 0x3a, '  ...so script 0\'s chain is $3A bytes');
  assert.equal(S0_ANIM + 0x3a, A4_6_INIT, '  ...ending exactly at $2A67C2, A4 6\'s init');

  // ---- AND THE THREE ADD UP, which is the only claim worth making about $3AA.
  assert.equal(0x270 + 0x100 + 0x3a, 0x3aa, '$270 code + $100 own data + $3A script 0\'s = $3AA');
  assert.equal(S0_ANIM - HIBACHI_A4.s5Emit, 0x100, '  ...and A4 5\'s own data really is $100');

  // ---- WHAT THE $100 IS, byte for byte, so nothing in it is unaccounted for.
  assert.equal(HIBACHI_A4.s5EmitRows * HIBACHI_A4.s5EmitStride, 0x80, '$80 of emitter rows');
  assert.equal(w(0x2a6708), 0xffff, '  ...then $2A6708 `FFFF`, two bytes no lea names');
  assert.equal(2 + HIBACHI_A4.s5Anim410Count * 14, 0x56, '  ...then $56 of $246410 chain');
  assert.equal(HIBACHI_A4.s5Anim410 + 0x56, DEAD_ROW, '  ...ending at $2A6760');
  assert.equal(2 + HIBACHI_A4.s5Anim520Count * HIBACHI_A4.animNoFillStride, 0x1a,
    '  ...and $1A of $246520 chain');
  assert.equal(HIBACHI_A4.s5Anim520 + 0x1a, S0_ANIM, '  ...ending at $2A6788');
  assert.equal(0x80 + 2 + 0x56 + 0x0e + 0x1a, 0x100,
    '  ...and the $E between $2A6760 and $2A676E is the only thing left');
});

test('W409 SECTION 1: $2A6760 is a SEVENTH $246410 record the count of six never reads',
  { skip: SKIP }, () => {
    assert.equal(w(HIBACHI_A4.s5Anim410), 0x0006, '$2A670A\'s count word is 6');
    // ...and $246410 runs its body exactly `count` times: one `move.w (A0)+,D0` and a
    // `subq.w #1,D0 / beq` at the bottom. NOT a dbra, so 6 means 6 (the OPPOSITE of TRAP 2).
    assert.equal(w(0x24643c), 0x3018, '$24643C `3018` move.w (A0)+,D0 -- the count');
    assert.equal(w(0x2464e8), 0x5340, '$2464E8 `5340` subq.w #1,D0');
    assert.equal(w(0x2464ea), 0x6700, '  ...$2464EA `6700` beq.w -- the exit');
    // ---- the six it DOES read, as their target longwords, ascending.
    const targets = [];
    for (let i = 0; i < 6; i++) targets.push(l(HIBACHI_A4.s5Anim410 + 2 + i * 14 + 6));
    assert.deepEqual(targets,
      [0x224438, 0x22fce0, 0x22fd60, 0x22fda0, 0x230060, 0x2300a0],
      'the six records the count admits');
    // ---- and the seventh, which is structurally perfect and continues the series.
    assert.equal(w(DEAD_ROW), 0x7fff, '$2A6760 fill word $7FFF, like all six');
    assert.equal(w(DEAD_ROW + 2), 0x0008, '  ...family $8, like five of six');
    assert.equal(l(DEAD_ROW + 6), 0x230220, '  ...target $230220, the NEXT of the series');
    assert.equal(w(DEAD_ROW + 10), 0x001f, '  ...$1F words');
    assert.equal(w(DEAD_ROW + 12), 0x0006, '  ...timing 6');
    assert.equal(DEAD_ROW + 14, HIBACHI_A4.s5Anim520, '  ...and it ends AT $2A676E');
    // ---- so it is dead by ARITHMETIC, not by absence: the count is one short of it.
    assert.equal(HIBACHI_A4.s5Anim410 + 2 + 7 * 14, HIBACHI_A4.s5Anim520,
      'a count of SEVEN would land on $2A676E exactly -- the cartridge says six');
  });

// ===============================================================================================
// SECTION 2 -- THE SECOND `$2595E8`. The brief said there was one; the image holds two.
// ===============================================================================================

test('W409 SECTION 2: the boss ROM has TWO jsr $2595E8 and this unit is the other one',
  { skip: SKIP }, () => {
    const sites = [];
    for (let a = 0x2a4000; a < 0x2ab000; a += 2) {
      if (w(a) === 0x4eb9 && l(a + 2) === 0x2595e8) sites.push(a);
    }
    assert.deepEqual(sites.map((a) => a.toString(16)), ['2a6466', '2a6b88'],
      'exactly two, and $2A6466 is A4 script 5\'s -- not only A4 $14\'s $2A6B88');
    assert.equal(HIBACHI_A4.s5Suspend, 0x2a6466, '  ...and hibachiend.js names it');
    // ---- and it retires its own slot, so it cannot fire twice.
    assert.equal(w(0x2a646c), 0x4254, '$2A646C `4254` clr.w (A4) -- TRAP 5, the SLOT not ($4)');
    assert.equal(w(0x2a646e), 0x4e75, '  ...then $2A646E `4E75`');
    // ---- the two routes in, each read out of the image.
    assert.equal(w(0x2a5cb4), 0x7014, '$2A5CB4 `7014` moveq #$14 -- script 1\'s FIRST-loop arm');
    assert.equal(w(0x2a728a), 0x7005, '$2A728A `7005` moveq #$5 -- phase B\'s death tail');
    assert.equal(w(0x2a728c), 0x4ef9, '  ...$2A728C `4EF9` JMP, a tail call');
    assert.equal(l(0x2a728e), 0x0025980c, '  ...to $25980C');
    // ---- so the two arms of script 1's fork have ONE ending each, not one between them.
    assert.equal(HIBACHI_A4.firstLoopExit, 0x14, 'arm A -> A4 $14 -> $2A6B88');
    assert.equal(HIBACHI_A4.push1At, 0x2a5d28, 'arm B -> the push -> A4 2 -> ... -> A4 5');
  });

// ===============================================================================================
// SECTION 3 -- THE DELIVERABLE. How far the real path runs, and what kind of end it reaches.
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
  const out = { stopped: null, shots: 0, a4: [], states: [], suspend: null };
  b.ctx.bulletSpawn = () => { out.shots += 1; };
  let prev = '';
  let prevState = null;
  for (let f = 1; f <= frames; f++) {
    if (!out.stopped) {
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
    }
    const live = [...Array(SCHED.a4Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a4Base + i * SCHED.a4Stride))
      .filter((v) => v !== 0).map((v) => (v & 0xff).toString(16)).join(',');
    if (live !== prev) { out.a4.push([f, live]); prev = live; }
    for (let i = 0; i < SCHED.a4Slots; i++) {
      const a = SCHED.a4Base + i * SCHED.a4Stride;
      if (b.ram.u16(a) !== 0 && (b.ram.u16(a) & 0xff) === 5) {
        const st = b.ram.u16(a + 0x02);
        if (st !== prevState) { out.states.push([f, st]); prevState = st; }
      }
    }
    if (out.suspend === null && b.ram.u16(SCHED.suspend) !== 0) out.suspend = f;
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

test('W409 SECTION 3: THE RUN NO LONGER STOPS -- $2595E8 fires on frame 4889 and the stage '
  + 'suspends', { skip: SKIP }, () => {
  const r = runReal(realPath(), 12000);

  // ---- **THERE IS NO PORT STOP.** Not "it ran further": nothing threw in 12,000 frames.
  assert.equal(r.stopped, null,
    'no unreached() anywhere in 12,000 frames -- W408 stopped on 4447 at $2A6418');
  // ---- and the end it reaches is the CARTRIDGE's, named by its own word.
  assert.equal(r.suspend, 4889, '$812E06 goes to 1 on frame 4889');
  assert.equal(SCHED.suspend, 0x812e06, '  ...and that word IS $2595E8\'s one store');
  // ---- the A4 history: script 5 is dispatched on 4447 and clears its own slot on 4889.
  assert.deepEqual(r.a4.slice(-3), [[3920, '10'], [4447, '5'], [4889, '']],
    'A4 $10 -> A4 5 on 4447, and 5\'s slot is cleared on 4889 by its OWN clr.w (A4)');
  assert.equal(4889 - 4447, 442, '  ...so A4 script 5 runs for 442 frames');

  // ---- THE FIVE STATES, on the real path, with the two counted waits arithmetically pinned.
  assert.deepEqual(r.states, [[4447, 0], [4478, 1], [4744, 2], [4753, 3], [4761, 4]],
    'state 0 -> 1 -> 2 -> 3 -> 4, in that order and once each');
  assert.equal(4478 - 4447, 31,
    'state 0 is 31 frames and not 32: $2596FA runs the INIT AND THE STEP on the first frame');
  assert.equal(4753 - 4744, 9, 'state 2 waits out the fade -- $259BB4 takes 8 steps plus a hold');
  assert.equal(4761 - 4753, 8, 'state 3 is the ($4,A4) = 8 $2A64D8 wrote');
  assert.equal(4889 - 4761, 0x80, 'and state 4 is the $80 $2A6496 wrote');

  // ---- WHICH KIND OF END. Every one of these is a positive witness, none an absence.
  //   (a) the store the cartridge calls "the stage is over";
  assert.equal(w(0x2a6466), 0x4eb9, '(a) $2A6466 `4EB9` jsr');
  assert.equal(l(0x2a6468), 0x002595e8, '  ...$2595E8');
  //   (b) the scheduler's own gate on it, which is what stops every later frame;
  assert.equal(w(0x25962e), 0x4a79, '(b) $25962E `4A79` tst.w');
  assert.equal(l(0x259630), SCHED.suspend, '  ...$812E06, the word A4 5 has just set');
  //   (c) and the script is REGISTERED, so the run went through code and not around it.
  assert.ok(new Set(scriptAddresses()).has(A4_5_INIT), '(c) $2A6418 is registered');
  assert.ok(new Set(scriptAddresses()).has(HIBACHI_A4.s5Step), '  ...and $2A6458');
  assert.equal(HIBACHI_END_COUNTED[0x05], undefined, '  ...and it is out of the counted list');
  assert.deepEqual([...HIBACHI_END_SCRIPTS], [0, 1, 2, 3, 4, 5, 6, 7, 8, 0x14],
    '  ...and in the ported one, including W563 script 8 and W420 script $14');

  // ---- WHAT IS STILL NOT REACHED, stated so the next reader is not misled: this bench is
  // script 1's SECOND-loop arm. A4 $14 -- the FIRST-loop arm's ending -- is PORTED as of W420,
  // but nothing on THIS arm runs it, and that is the point of the assertion below.
  assert.equal(HIBACHI_END_COUNTED[0x14], undefined,
    'W420: A4 $14 is no longer counted -- hibachiend.js runs it');
  assert.ok(new Set(scriptAddresses()).has(0x2a6b7a),
    '  ...and $2A6B7A IS registered now');
  assert.equal(r.a4.filter(([, v]) => v.split(',').includes('14')).length, 0,
    '  ...and this run never dispatches it');

  // ---- and the bullet count is UNCHANGED, because A4 5 spawns EFFECTS ($289004) and not
  // bullets ($2817C2). A run that "got further" by firing more would be a different claim.
  assert.equal(r.shots, 8825, '8,825 bullet spawns, exactly W408\'s number');
});

// ===============================================================================================
// SECTION 4 -- THE FIVE STATES DRIVEN, WITH THE EFFECT RECORDS READ BACK.
// ===============================================================================================

const A4SLOT = SCHED.a4Base;

function bench() {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const sounds = [];
  const ctx = { bossSubRec: SUB, soundPost: (a) => sounds.push(a) };
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU16(A4SLOT, 0x8005);
  return { ROM, ram, ctx, sounds };
}

/** Every live pool-B record, in slot order, as the fields this script writes. */
function livePool(ram) {
  const out = [];
  for (let n = 0; n < POOL_B.slots; n++) {
    const a = POOL_B.base + n * POOL_B.stride;
    if (ram.u16(a + B.status) === 0) continue;
    out.push({
      kind: ram.u16(a + B.status) & 0x7fff,
      f1c: ram.u8(a + B.f1c),
      nudge: ram.u32(a + B.nudge) >>> 0,
      pos: ram.u32(a + B.pos) >>> 0,
      bucket: ram.u16(a + B.bucket),
      speed: ram.u8(a + B.speed),
      angle: ram.u8(a + B.angle),
      s12: ram.u16(a + B.sub12),
      s14: ram.u16(a + B.sub14),
    });
  }
  return out;
}

test('W409 SECTION 4: the init writes seven fields and NOT ($4,A4) or ($13,A4)',
  { skip: SKIP }, () => {
    const b = bench();
    for (const off of [0x04, 0x13]) b.ram.setU8(A4SLOT + off, 0x5a);   // a value it cannot make
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    assert.equal(b.ram.u16(A4SLOT + 0x02), 0, '($2,A4) := 0 -- state 0');
    assert.equal(b.ram.u16(A4SLOT + 0x06), 0x0101, '($6,A4) := $0101, ONE word, TWO byte fields');
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0, '($8,A4) := 0');
    assert.equal(b.ram.u16(A4SLOT + 0x0a), 1, '($A,A4) := 1');
    assert.equal(b.ram.u8(A4SLOT + 0x0c), 0, '($C,A4) := 0');
    assert.equal(b.ram.u16(A4SLOT + 0x10), 0x2020, '($10,A4) := $2020, again two byte fields');
    assert.equal(b.ram.u16(A4SLOT + 0x12), 0, '($12,A4) := 0');
    // ---- ($13,A4) LOOKS untouched and is not: `clr.w ($12,A4)` is a WORD (TRAP 3), so the
    // seventh store zeroes TWO byte fields and $2A656C's counter starts from 0, not from $5A.
    assert.equal(b.ram.u8(A4SLOT + 0x13), 0,
      '($13,A4) is cleared BY $2A6454 clr.w ($12,A4) -- one word, two byte fields');
    assert.equal(w(0x2a6454), 0x426c, '  ...$2A6454 `426C` clr.W, not `422C` clr.b');
    assert.equal(w(0x2a644a), 0x422c, '  ...where $2A644A on ($C,A4) IS `422C` clr.b');
    // ---- and ($4,A4) really is untouched: states 2 and 3 write it before either reader runs.
    assert.equal(b.ram.u8(A4SLOT + 0x04), 0x5a, '($4,A4) is UNTOUCHED by the init');
    // ...read out of the image as the absence of a store, positively: the init's stores are
    // exactly the seven above and the last of them is $2A6454.
    const stores = [];
    for (let a = A4_5_INIT; a < HIBACHI_A4.s5Step; a += 2) {
      if (w(a) === 0x397c) stores.push(w(a + 4));         // move.w #imm,(d16,A4)
      if (w(a) === 0x426c || w(a) === 0x422c) stores.push(w(a + 2));   // clr.w / clr.b
    }
    assert.deepEqual(stores, [0x02, 0x06, 0x08, 0x0a, 0x0c, 0x10, 0x12],
      'the init\'s seven A4 stores, scanned out of $2A6418..$2A6457');
  });

test('W409 SECTION 4: state 0 is SIXTEEN spawns two frames apart off $2A6688, then state 1',
  { skip: SKIP }, () => {
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    const frames = [];
    let seen = 0;
    for (let f = 1; f <= 32; f++) {
      s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
      const now = livePool(b.ram).length;
      if (now !== seen) { frames.push(f); seen = now; }
    }
    assert.deepEqual(frames, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
      'sixteen spawns, every SECOND frame -- ($6,A4) reloads from ($7,A4) = 1');
    // ---- and each one carries its own row, in table order.
    const rows = livePool(b.ram);
    assert.equal(rows.length, 16, 'sixteen live records');
    assert.deepEqual(rows.map((r) => r.kind),
      [9, 0x85, 0x0c, 0x85, 9, 0x0c, 9, 0x85, 9, 0x85, 0x0c, 0x85, 9, 0x0c, 9, 0x85],
      'the KIND column of $2A6688, in order');
    assert.deepEqual(rows.map((r) => r.nudge),
      [0x00000000, 0xe8000a00, 0xf000fa00, 0xdc00fe00, 0xfc000800, 0x0800f600,
        0xf800f400, 0xe4000c00, 0x00000000, 0xe800f600, 0xf0000600, 0xdc000200,
        0xfc00f800, 0x08000a00, 0xf8000c00, 0xe400f400],
      '  ...and the ($26,A0) nudge LONGWORD of each row');
    assert.deepEqual([...new Set(rows.map((r) => r.bucket))], [8],
      'every one lands in bucket 8, not script 1\'s $10');
    assert.deepEqual([...new Set(rows.map((r) => r.s12))], [0],
      'and state 0 alone clears ($12,A0)');
    assert.deepEqual([...new Set(rows.map((r) => r.s14))], [0], '  ...and ($14,A0)');
    assert.deepEqual([...new Set(rows.map((r) => r.speed))], [0],
      'state 0 writes NO speed -- $2A65A6\'s $242B3C block is state 1\'s only');
    // ---- and the pass counter takes it to state 1 with the two reload words rewritten.
    assert.equal(b.ram.u16(A4SLOT + 0x02), 1, 'state 1 after one pass of sixteen');
    assert.equal(b.ram.u16(A4SLOT + 0x06), 0x2010, '($6,A4) := $2010 -- $20 counter, $10 reload');
    assert.equal(b.ram.u16(A4SLOT + 0x0e), 0x1111, '($E,A4) := $1111');
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0, '  ...and the row index is back to 0');
  });

test('W409 SECTION 4: state 1 ramps ($7,A4) from $10 to 2, and it is ($7,A4) = 2 that ends it',
  { skip: SKIP }, () => {
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    for (let f = 0; f < 32; f++) s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    assert.equal(b.ram.u16(A4SLOT + 0x02), 1, 'in state 1');
    const ramp = [];
    let prev = -1;
    for (let f = 0; f < 400 && b.ram.u16(A4SLOT + 0x02) === 1; f++) {
      s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
      const v = b.ram.u8(A4SLOT + 0x07);
      if (v !== prev) { ramp.push(v); prev = v; }
    }
    assert.deepEqual(ramp, [0x10, 0x0f, 0x0e, 0x0d, 0x0c, 0x0b, 0x0a, 9, 8, 7, 6, 5, 4, 3, 2],
      '($7,A4) walks $10 down to 2 and STOPS there -- the guard is cmpi.b #$2, not a zero test');
    assert.equal(b.ram.u8(A4SLOT + 0x0c), 0x0e,
      '  ...and ($C,A4) counted the same fourteen steps UP');
    assert.equal(b.ram.u16(A4SLOT + 0x02), 2, 'and the state moved on to 2');
    assert.equal(b.ram.u16(SCHED.fadeState), 1, '  ...with $2A65E4\'s fade ARMED');
    assert.equal(b.ram.u16(SCHED.fadeParam), 0x0e, '  ...on parameter $E');
    // ...the two instructions that make it 2 and not 0.
    assert.equal(w(0x2a6546), 0x0c2c, '$2A6546 `0C2C` cmpi.b #imm,(d16,A4)');
    assert.equal(w(0x2a6548), 0x0002, '  ...#$2');
    assert.equal(w(0x2a654a), 0x0007, '  ...on ($7,A4)');
    assert.equal(w(0x2a65d8), 0x0c2c, '$2A65D8 the same test, and it is the ONLY door to state 2');
    assert.equal(w(0x2a65da), 0x0002, '  ...also #$2');
  });

test('W409 SECTION 4: the whole script is 443 frames and ends in the SUSPEND',
  { skip: SKIP }, () => {
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    const trace = [[0, 0]];
    const spent = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let prev = 0;
    let f = 0;
    while (b.ram.u16(A4SLOT) !== 0 && f < 4000) {
      spent[b.ram.u16(A4SLOT + 0x02)] += 1;
      s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
      f += 1;
      const st = b.ram.u16(A4SLOT + 0x02);
      if (st !== prev) { trace.push([f, st]); prev = st; }
      fadeStep259BB4(b.ram, null);                     // $2596BC, once per frame
    }
    assert.deepEqual(trace, [[0, 0], [32, 1], [298, 2], [307, 3], [315, 4]],
      'the five states, in order');
    assert.deepEqual(spent, { 0: 32, 1: 266, 2: 9, 3: 8, 4: 128 },
      '  ...and the frames each one holds');
    assert.equal(f, 443, '443 frames from the init to the suspend');
    assert.equal(b.ram.u16(SCHED.suspend), 1, 'and $812E06 IS set');
    assert.equal(b.ram.u16(A4SLOT), 0, '  ...with the slot cleared on the same frame');
    // ---- STATE 3's PUSH IS A WORD. Y moves $1400 for the blast and comes back; X never moves.
    assert.equal(w(0x2a6482), 0x3f2e, '$2A6482 `3F2E` move.w (d16,A6),-(A7) -- a WORD push');
    assert.equal(w(0x2a6492), 0x3d5f, '  ...$2A6492 `3D5F` move.w (A7)+,(d16,A6)');
    assert.equal(w(0x2a6486), 0x066e, '  ...and $2A6486 `066E` addi.w on ($2,A6), the Y half');
    assert.equal(w(0x2a6488), 0x1400, '  ...#$1400');
    assert.equal(b.ram.u32(SUB + 0x02) >>> 0, 0x38001c00, 'so ($2,A6) is back where it started');
  });

test('W409 SECTION 4: state 3 pushes the blast $1400 DOWN, and the records prove it',
  { skip: SKIP }, () => {
    // Drive straight to state 3 by writing the state word, which is what state 2 does.
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    b.ram.setU16(A4SLOT + 0x02, 3);
    b.ram.setU16(A4SLOT + 0x04, 1);
    const before = livePool(b.ram).length;
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    const rows = livePool(b.ram).slice(before);
    assert.equal(rows.length, 39, '$2440E0 seeds its shared 39-row blast');
    assert.deepEqual([...new Set(rows.map((r) => r.pos >>> 16))], [0x4c00],
      'every row sits at Y = $3800 + $1400 = $4C00');
    assert.deepEqual([...new Set(rows.map((r) => r.pos & 0xffff))], [0x1c00],
      '  ...and at the UNCHANGED X, because the push is a word');
    assert.equal(b.ram.u16(A4SLOT + 0x02), 4, 'and the state is 4');
    assert.equal(b.ram.u16(A4SLOT + 0x04), 0x80, '  ...with $80 frames on the clock');
    assert.deepEqual(b.sounds.slice(-1), [0x28c392], '  ...and $2A64A2 posted $28C392');
  });

// ===============================================================================================
// SECTION 5 -- THE ROW TABLE, THE TWO EMITTERS, AND THE BIT-7 CUE FORK.
// ===============================================================================================

test('W409 SECTION 5: both emitters read ONE table and they differ in exactly four stores',
  { skip: SKIP }, () => {
    // ---- the rows, straight out of the declared window.
    const ROM = new RomWindows(tables.rom);
    const kinds = [];
    for (let i = 0; i < 16; i++) {
      kinds.push(ROM.u16(HIBACHI_A4.s5Emit + i * 8));
      assert.equal(ROM.u16(HIBACHI_A4.s5Emit + i * 8 + 2), 0,
        `row ${i}'s second word is 0, so ($1C,A0) is 0 on every row`);
    }
    assert.deepEqual([...new Set(kinds)].sort((a, b2) => a - b2), [9, 0x0c, 0x85],
      'three effect kinds across the sixteen rows');
    // ---- STATE 0 writes ($12,A0) and ($14,A0); STATE 1 writes speed and angle. Neither
    // writes the other's pair, and that is the whole difference between the two blocks.
    assert.equal(w(0x2a6650), 0x317c, '$2A6650 `317C` move.w #imm,(d16,A0) -- state 0 only');
    assert.equal(w(0x2a6654), 0x0012, '  ...($12,A0)');
    assert.equal(w(0x2a6656), 0x317c, '$2A6656 the same');
    assert.equal(w(0x2a665a), 0x0014, '  ...($14,A0)');
    assert.equal(w(0x2a65a6), 0x4eb9, '$2A65A6 `4EB9` jsr -- state 1 only');
    assert.equal(l(0x2a65a8), 0x00242b3c, '  ...$242B3C, the speed jitter');
    assert.equal(w(0x2a65b8), 0x1140, '  ...$2A65B8 `1140` move.b D0,($1A,A0)');
    assert.equal(w(0x2a65c2), 0x1140, '  ...and $2A65C2 the angle into ($1B,A0)');
    // ---- and the bucket is 8 in BOTH, which is not script 1's $10.
    for (const site of [0x2a65a0, 0x2a664a]) {
      assert.equal(w(site + 2), 0x0008, `$${site.toString(16)} writes bucket 8`);
      assert.equal(w(site + 4), 0x001e, '  ...into ($1E,A0)');
    }
  });

test('W409 SECTION 5: the state-0 cue fork reads BIT 7 of the drawn byte, and both arms fire',
  { skip: SKIP }, () => {
    // **THE PORT-WIDE DEFECT THIS UNIT FOUND.** `$242EC2` ends
    //   $242ED6  1030 0000   move.b (A0,D0.w),D0
    //   $242EDA  205f        movea.l (A7)+,A0     <- MOVEA does not touch the CCR
    //   $242EDC  4e75        rts                  <- nor does RTS
    // so N at a `bpl` that follows the `jsr` is the MSB of the TABLE BYTE. Reading the
    // returned word's sign instead tests a bit of $803916's high half that is always clear,
    // which would make $28C28E unreachable. Ten OTHER sites in five files still do that; this
    // one does not, and the split below is the measurement that separates the two readings.
    assert.equal(w(0x242ed6), 0x1030, '$242ED6 `1030` move.b (A0,D0.w),D0 -- a BYTE move');
    assert.equal(w(0x242eda), 0x205f, '  ...$242EDA `205F` movea.l (A7)+,A0, CCR untouched');
    assert.equal(w(0x242edc), 0x4e75, '  ...$242EDC `4E75`');
    assert.equal(w(0x2a6612), 0x41f9, '$2A6612 `41F9` lea <abs.l>,A0');
    assert.equal(l(0x2a6614), 0x0028c274, '  ...$28C274 -- the DEFAULT arm');
    assert.equal(w(0x2a661e), 0x6a06, '  ...$2A661E `6A06` bpl.s, six bytes over the second lea');
    assert.equal(l(0x2a6622), 0x0028c28e, '  ...$2A6620 lea $28C28E,A0 -- the NEGATIVE arm');
    assert.equal(w(0x2a6626), 0x4e90, '  ...$2A6626 `4E90` jsr (A0)');

    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    for (let f = 0; f < 32; f++) s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    assert.deepEqual(b.sounds.map((x) => x.toString(16)),
      ['28c274', '28c274', '28c28e', '28c274', '28c28e', '28c28e', '28c274', '28c274'],
      'eight cues over state 0 -- FIVE $28C274 and THREE $28C28E');
    assert.equal(b.sounds.filter((x) => x === 0x28c28e).length, 3,
      '  ...and a bit-15 reading would make that three ZERO, which is the whole difference');
    // ---- and it is every OTHER spawn, because of the bchg.
    assert.equal(b.sounds.length, 8, 'eight cues across sixteen spawns');
    assert.equal(w(0x2a660a), 0x086c, '$2A660A `086C` bchg #imm,(d16,A4)');
    assert.equal(w(0x2a660c), 0x0000, '  ...bit 0');
    assert.equal(w(0x2a660e), 0x0012, '  ...of ($12,A4)');
    assert.equal(w(0x2a6610), 0x6616, '  ...$2A6610 `6616` bne.s, so the bit being SET skips it');
  });

// ===============================================================================================
// SECTION 6 -- THE ABLATION SECTION.
//
// Each test below exists because a mutation of the constant it names came back GREEN against
// the sections above: the shipped input made the right answer and the wrong answer agree. The
// fix is always a different INPUT, never a weaker assertion.
// ===============================================================================================

test('W409 SECTION 6 (ablation): ($7,A4) is the RELOAD of ($6,A4) and the two only differ once '
  + 'you make them differ', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reloading ($6,A4) from ($6,A4) came back GREEN in state 0, because the
  // init's $0101 puts the SAME byte in both. Drive a slot where they differ.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  b.ram.setU16(A4SLOT + 0x06, 0x0003);              // counter 0, reload 3
  const fired = [];
  for (let f = 1; f <= 12; f++) {
    const before = livePool(b.ram).length;
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    if (livePool(b.ram).length !== before) fired.push(f);
  }
  assert.deepEqual(fired, [1, 5, 9], 'a reload of 3 fires every FOURTH frame, from frame 1');
  assert.equal(b.ram.u8(A4SLOT + 0x06), 0,
    '  ...and after the third reload the counter is three frames down, at 0');
  assert.equal(w(0x2a6604), 0x196c, '$2A6604 `196C` move.b (d16,A4),(d16,A4)');
  assert.equal(w(0x2a6606), 0x0007, '  ...FROM ($7,A4)');
  assert.equal(w(0x2a6608), 0x0006, '  ...TO ($6,A4)');
});

test('W409 SECTION 6 (ablation): the countdowns are the BORROW, so a reload of ZERO fires every '
  + 'frame', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `old === 0` -> `old <= 1` was invisible on every reload the script
  // ships with. Zero is the input that separates them: `subq.b` borrows from 0 to $FF.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  b.ram.setU16(A4SLOT + 0x06, 0x0000);
  const fired = [];
  for (let f = 1; f <= 6; f++) {
    const before = livePool(b.ram).length;
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    if (livePool(b.ram).length !== before) fired.push(f);
  }
  assert.deepEqual(fired, [1, 2, 3, 4, 5, 6], 'a reload of ZERO fires on every frame');
  assert.equal(w(0x2a65fc), 0x532c, '$2A65FC `532C` subq.b #1,(d16,A4)');
  assert.equal(w(0x2a6600), 0x6400, '  ...$2A6600 `6400` BCC -- the borrow, not a zero test');
});

test('W409 SECTION 6 (ablation): the row index steps by EIGHT and wraps AT $80, and only a full '
  + 'pass separates that from its neighbours', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `+= 8` -> `+= 4` and `!== $80` -> `!== $78` both came back GREEN
  // against a test that read only the first few rows. The whole pass is what pins them.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  const index = [];
  for (let f = 1; f <= 34; f++) {
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    index.push(b.ram.u16(A4SLOT + 0x08));
  }
  assert.deepEqual(index.filter((_, i) => i % 2 === 1),
    [8, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50, 0x58, 0x60, 0x68, 0x70, 0x78,
      0, 0],
    'the index walks 8..$78 and wraps to 0 exactly ONCE in sixteen spawns');
  assert.equal(livePool(b.ram).length, 16, '  ...and sixteen records exist, not thirty-two');
  // ...and the two `cmpi` are read as their own operands.
  for (const site of [0x2a65cc, 0x2a6662]) {
    assert.equal(w(site), 0x0c6c, `$${site.toString(16)} 0C6C cmpi.w #imm,(d16,A4)`);
    assert.equal(w(site + 2), 0x0080, '  ...#$80');
    assert.equal(w(site + 4), 0x0008, '  ...($8,A4)');
  }
  assert.equal(w(0x2a65c6), 0x066c, '$2A65C6 `066C` addi.w #imm,(d16,A4)');
  assert.equal(w(0x2a65c8), 0x0008, '  ...#$8');
});

test('W409 SECTION 6 (ablation): the state-1 speed is TWO arithmetic shifts and a +2, and the '
  + 'ramp is what separates them', { skip: SKIP }, () => {
  // FIRST PASS RESULT: dropping `+ (ramp >> 1)` came back GREEN, because ($C,A4) is ZERO for
  // the whole of state 0 and for the first spawns of state 1. Drive ($C,A4) directly, at a
  // value whose >>1 and >>2 differ, and at a NEGATIVE value, which only `asr` reproduces.
  const speedFor = (ramp) => {
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    b.ram.setU16(A4SLOT + 0x02, 1);                 // state 1
    b.ram.setU16(A4SLOT + 0x06, 0x0303);
    b.ram.setU8(A4SLOT + 0x0c, ramp);
    b.ram.setU8(A4SLOT + 0x10, 0xff);               // keep the $28B34A blast out of the way
    b.ram.setU8(A4SLOT + 0x0e, 0xff);
    let guard = 0;
    while (livePool(b.ram).length === 0 && guard++ < 20) {
      s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    }
    return livePool(b.ram)[0].speed;
  };
  const base = speedFor(0x00);
  assert.equal(speedFor(0x10), (base + 8) & 0xff, 'a ramp of $10 adds EIGHT -- `asr.b #1`');
  assert.notEqual(speedFor(0x10), (base + 4) & 0xff, '  ...which `asr.b #2` would not');
  assert.equal(speedFor(0xf0), (base - 8) & 0xff, 'and $F0 SUBTRACTS eight: the shift is SIGNED');
  assert.notEqual(speedFor(0xf0), (base + 0x78) & 0xff, '  ...which `lsr.b` would not');
  assert.equal(w(0x2a65b4), 0xe201, '$2A65B4 `E201` asr.b #1,D1 -- ARITHMETIC');
  assert.equal(w(0x2a65ac), 0xe400, '  ...and $2A65AC `E400` asr.b #2,D0 on the draw');
  assert.equal(w(0x2a65ae), 0x5400, '  ...$2A65AE `5400` addq.b #2,D0');
  assert.equal(w(0x2a65b6), 0xd001, '  ...$2A65B6 `D001` add.b D1,D0 -- a BYTE add');
});

test('W409 SECTION 6 (ablation): state 3\'s $1400 goes on ($2,A6) and the save is a WORD',
  { skip: SKIP }, () => {
  // FIRST PASS RESULT: restoring the LONGWORD instead of the word came back GREEN, because
  // the bench's ($4,A6) is never touched by anything in between. Assert the X half is
  // untouched AND that a dirty ($4,A6) written by $2440E0's own frame survives -- the only
  // way a word push and a long push differ is the half they do not carry.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  b.ram.setU32(SUB + 0x02, 0x38001c00);
  b.ram.setU16(A4SLOT + 0x02, 3);
  b.ram.setU16(A4SLOT + 0x04, 1);
  s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
  assert.equal(b.ram.u16(SUB + 0x02), 0x3800, 'Y comes back');
  assert.equal(b.ram.u16(SUB + 0x04), 0x1c00, '  ...and X never moved');
  // ...and the direction: $1400 DOWN, which the seeded records carry.
  assert.deepEqual([...new Set(livePool(b.ram).map((r) => r.pos >>> 16))], [0x4c00],
    'the blast is seeded at $4C00, i.e. $3800 PLUS $1400');
  assert.notEqual(0x4c00, (0x3800 - 0x1400) & 0xffff, '  ...and a subtraction would give $2400');
});

test('W409 SECTION 6 (ablation): state 2 waits for the fade to FINISH, not to start',
  { skip: SKIP }, () => {
  // FIRST PASS RESULT: inverting the `bcs` came back GREEN against a run that stepped the
  // fade every frame, because state 1 arms it on the same frame it enters state 2 and the
  // fade is done eight frames later either way. Drive the fade word directly, both values,
  // and read whether the chain loaded.
  const tryFade = (fadeState) => {
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    b.ram.setU16(A4SLOT + 0x02, 2);
    b.ram.setU16(SCHED.fadeState, fadeState);
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    return b.ram.u16(A4SLOT + 0x02);
  };
  assert.equal(tryFade(1), 2, 'fade state 1 -- still running -- HOLDS state 2');
  assert.equal(tryFade(2), 2, '  ...and so does state 2, the hold frame');
  assert.equal(tryFade(0), 3, 'and only ZERO advances to state 3');
  assert.equal(w(0x2a64b2), 0x4eb9, '$2A64B2 `4EB9` jsr');
  assert.equal(l(0x2a64b4), 0x00259b9e, '  ...$259B9E');
  assert.equal(w(0x2a64b8), 0x6526, '  ...$2A64B8 `6526` BCS, and C=1 means NOT done');
  assert.equal(0x2a64ba + 0x26, 0x2a64e0, '  ...jumping to $2A64E0, the state-1 test');
});

test('W409 SECTION 6 (ablation): the suspend needs the FULL $80 and the slot is cleared with it',
  { skip: SKIP }, () => {
  // FIRST PASS RESULT: `left !== 0` -> `left > 1` and dropping `clr.w (A4)` both came back
  // GREEN, because the driving loop stops as soon as the slot clears and never asks for the
  // frame BEFORE. Count the frames and then step once more.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  b.ram.setU16(A4SLOT + 0x02, 4);
  b.ram.setU16(A4SLOT + 0x04, 0x80);
  for (let f = 1; f < 0x80; f++) {
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    assert.equal(b.ram.u16(SCHED.suspend), 0, `frame ${f} of $80 must NOT suspend`);
    assert.equal(b.ram.u16(A4SLOT), 0x8005, '  ...and the slot must stay live');
  }
  s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
  assert.equal(b.ram.u16(SCHED.suspend), 1, 'and the $80th frame does suspend');
  assert.equal(b.ram.u16(A4SLOT), 0, '  ...and clears the slot on the SAME frame');
  assert.equal(b.ram.u16(A4SLOT + 0x04), 0, '  ...with the counter at zero');
});

test('W409 SECTION 6 (ablation): the init falls straight into the step, so state 0 is 31 frames '
  + 'on the real path and 32 off it', { skip: SKIP }, () => {
  // FIRST PASS RESULT: registering the init WITHOUT `initThenStep` came back GREEN against
  // every direct-drive test, because those call the init and the step separately anyway. The
  // real-path frame numbers are the only witness, so they are asserted against the ROM's own
  // layout here rather than against the run alone.
  assert.notEqual(w(HIBACHI_A4.s5Step - 2), 0x4e75,
    '$2A6456 is NOT `4E75` -- there is no rts between A4 5\'s init and its step');
  assert.equal(w(0x2a6454), 0x426c, '  ...$2A6454 `426C` clr.w (d16,A4) is the init\'s last');
  assert.equal(w(0x2a6456), 0x0012, '  ...and $2A6456 is its DISPLACEMENT operand, $12');
  assert.equal(0x2a6454 + 4, HIBACHI_A4.s5Step, '  ...four bytes, landing exactly on the step');
  // ...and the same is true of all 21 pairs, which is the convention W403 established.
  let fallthrough = 0;
  for (let i = 0; i < HIBACHI_A4.pairs; i++) {
    if (w(l(HIBACHI_A4.table + i * 8 + 4) - 2) !== 0x4e75) fallthrough += 1;
  }
  assert.equal(fallthrough, HIBACHI_A4.pairs, 'all 21 A4 pairs fall through, A4 5 included');
});

test('W409 SECTION 6 (equivalence): $2A6668 is BCS where its twin $2A65D2 is BNE, and on this '
  + 'walk they cannot disagree', { skip: SKIP }, () => {
  // This is a proved equivalence, not a weakened test. The index only ever moves by +8 from a
  // value that is a multiple of 8 and less than $80, so it reaches $80 exactly and `< $80`
  // and `!= $80` agree on every value it can hold. Both are transcribed as the ROM has them.
  assert.equal(w(0x2a65d2), 0x661e, '$2A65D2 `661E` bne.s -- state 1');
  assert.equal(w(0x2a6668), 0x651c, '$2A6668 `651C` bcs.s -- state 0, a DIFFERENT instruction');
  assert.equal(0x2a65d4 + 0x1e, 0x2a65f2, '  ...and they land on different addresses too');
  assert.equal(0x2a666a + 0x1c, A4_5_CODE_END, '  ...$2A65F2 against the rts');
  const reachable = new Set();
  for (let v = 0; v < 0x80; v += 8) reachable.add((v + 8) & 0xffff);
  assert.deepEqual([...reachable].filter((v) => (v < 0x80) !== (v !== 0x80)), [],
    'no value the index can hold separates `< $80` from `!= $80`');
});

// ===============================================================================================
// SECTION 7 -- THE WINDOWS.
// ===============================================================================================

test('W409 SECTION 7: THREE new windows, and three bounds on each', { skip: SKIP }, () => {
  const set = new Map(tables.rom.windows.map(
    (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]));
  assert.equal(set.size, tables.rom.windows.length, 'no duplicate window bases');
  assert.equal(tables.rom.windows.length, ROM_WINDOW_COUNT, '599 windows, 596 + this wave\'s three'
      + ' W411 declares $280F34, the collected-impact transform table, so 600. W418 declares the CONTINUE panel\'s two strings and three tables ($2886FC $28870C $28886A $2888B2 $2888DA), so 605. W419 declares $289EDA ($60), pool C\'s kind-8 and kind-$C descriptor lists -- the art half of opening $289B50\'s kind guard; W194\'s $289B50+$38A window is NOT widened, it abuts, and the overlap count is unchanged. So 606. W425 declares $294134 ($20), the timer-D SOUND dispatch table of D-script 6 -- the eight cue-wrapper addresses the boss DEATH ANIMATION walks with `movea.l (A0),A0 / jsr (A0)`, which is the explosion rattle DOCKET D58 was opened on. The $294154 window from W107 ABUTS it and is NOT widened: the two are read by different routines for different reasons, and the overlap count is unchanged. So 607. W428 declares the FOUR word-threshold cue scripts ($268E32 $273986 $2747A8 $275F04), so 611. Each of the four begins INSIDE its type\'s prototype window and runs on to the handler that follows it, because a cue record\'s longwords straddle that window\'s end and RomWindows.#at cannot stitch a read across a seam -- W428 declared an abutting window and MEASURED that $27399E threw anyway. So for the first time in twelve waves the overlap count moves too, 71 -> 75, four new pairs for four new windows. Both numbers now live in tests/romwindowset.js, which is where to change them and where to read why.');

  // ---- $2A6688 + $80.
  assert.equal(set.get(HIBACHI_A4.s5Emit), 0x80, '$2A6688 + $80');
  //   (1) named by TWO leas in the same routine (asserted in SECTION 1);
  //   (2) the stride is `move.w (A1)+` twice plus `move.l (A1)+`;
  assert.equal(w(0x2a6588), 0x3019, '(2) $2A6588 `3019` move.w (A1)+,D0');
  assert.equal(w(0x2a6590), 0x3019, '  ...$2A6590 the same, the SECOND word');
  assert.equal(w(0x2a6596), 0x2159, '  ...$2A6596 `2159` move.l (A1)+,(d16,A0) -- 8 bytes a row');
  //   (3) and the length is the WRAP, not a guess at how many rows look plausible.
  assert.equal(16 * 8, 0x80, '(3) 16 rows of 8 = $80, the cmpi.w #$80 the index wraps at');

  // ---- $2A670A + $56.
  assert.equal(set.get(HIBACHI_A4.s5Anim410), 0x56, '$2A670A + $56');
  assert.equal(w(0x2a64ba), 0x41fa, '(1) $2A64BA `41FA` lea (d16,PC),A0');
  assert.equal(0x2a64bc + disp16(0x2a64bc), HIBACHI_A4.s5Anim410, '  ...(TRAP 4) -> $2A670A');
  assert.equal(l(0x2a64c2), 0x00246410, '  ...$2A64C0 jsr $246410, the WITH-FILL loader');
  assert.equal(2 + w(HIBACHI_A4.s5Anim410) * 14, 0x56, '(2) count 6 x 14 + 2 = $56');
  assert.equal(HIBACHI_A4.s5Anim410 + 0x56, DEAD_ROW,
    '(3) and it ends AT $2A6760, the seventh record the count does not reach');

  // ---- $2A676E + $1A.
  assert.equal(set.get(HIBACHI_A4.s5Anim520), 0x1a, '$2A676E + $1A');
  assert.equal(w(0x2a6428), 0x41fa, '(1) $2A6428 `41FA` lea (d16,PC),A0');
  assert.equal(0x2a642a + disp16(0x2a642a), HIBACHI_A4.s5Anim520, '  ...(TRAP 4) -> $2A676E');
  assert.equal(l(0x2a6430), 0x00246520, '  ...$2A642E jsr $246520, the NO-FILL loader');
  assert.equal(2 + w(HIBACHI_A4.s5Anim520) * 12, 0x1a,
    '(2) count 2 x TWELVE + 2 = $1A -- $246520\'s entry has no fill word');
  assert.equal(HIBACHI_A4.s5Anim520 + 0x1a, S0_ANIM,
    '(3) and it ends AT $2A6788, the base A4 SCRIPT 0\'s own lea names');

  // ---- NOTHING ELSE IS DECLARED AND NOTHING IS WIDENED. The palette TARGETS the two chains
  // name, and the WHITE bank the init installs, are all inside windows that already exist.
  const covers = (a, n) => [...set].some(([base, len]) => base <= a && a + n <= base + len);
  for (const t of [0x224438, 0x22fce0, 0x22fd60, 0x22fda0, 0x230060, 0x2300a0, 0x225238]) {
    assert.ok(covers(t, 0x40), `$${t.toString(16)} + $40 is already covered`);
  }
  assert.ok(covers(0x246bf8, 0x40), '$246BF8 + $40 is inside W91\'s $246BB8 + $80');
  assert.equal(set.get(0x246bb8), 0x80, '  ...which is NOT widened');
  // ---- and the FOURTEEN dead bytes get no window at all, deliberately.
  assert.equal(set.get(DEAD_ROW), undefined, '$2A6760 has no window: nothing reads it');
  assert.equal(set.get(S0_ANIM), 0x3a,
    '$2A6788 has the exact four-record window W552 now consumes');
});

// ===============================================================================================
// SECTION 6 (continued) -- THE SECOND PASS. Twenty-one of the first pass's seventy-nine
// mutations came back GREEN and every one of them was in a block the sections above only
// counted rather than read. Each test below drives a DIFFERENT input and reads a RECORD.
// ===============================================================================================

/** A scratch Ram carrying the bench's RNG word, so a test can replay the exact draw sequence
 *  the script is about to make instead of hard-coding the answers. `$803916` is the whole
 *  state and `$803917` its low byte, so copying the word copies the generator. */
function rngMirror(ram) {
  const m = new Ram();
  m.setU16(0x803916, ram.u16(0x803916));
  return m;
}

/** State 1 with every counter but the named one parked, so exactly one block runs per frame. */
function state1(opts = {}) {
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  b.ram.setU16(A4SLOT + 0x02, 1);
  b.ram.setU8(A4SLOT + 0x10, opts.blast ?? 0xff);
  b.ram.setU8(A4SLOT + 0x11, opts.blastReload ?? 0xff);
  b.ram.setU8(A4SLOT + 0x0e, opts.ramp ?? 0xff);
  b.ram.setU8(A4SLOT + 0x0f, opts.rampReload ?? 0xff);
  b.ram.setU8(A4SLOT + 0x06, opts.spawn ?? 0xff);
  b.ram.setU8(A4SLOT + 0x07, opts.spawnReload ?? 0xff);
  b.ram.setU8(A4SLOT + 0x0c, opts.rampByte ?? 0);
  b.ram.setU8(A4SLOT + 0x13, opts.cue ?? 0xff);
  if (opts.rng !== undefined) b.ram.setU16(0x803916, opts.rng);
  return b;
}

test('W409 SECTION 6 (ablation): the $28B34A blast POSITION is three draws in a fixed order '
  + 'with two different shifts', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `dx >> 2` -> `>> 1`, `dy >> 1` -> `>> 2`, `- $1000` -> `+ $1000`,
  // swapping dx and dy, and taking the angle from $24328E instead of $242EC2 ALL came back
  // GREEN, because no test above read a single field of the eight records the blast seeds.
  // `rng: 7` because the DEFAULT state draws a dx of ZERO, where `asr #2` and `asr #1` agree.
  const b = state1({ blast: 0, rng: 7 });
  const m = rngMirror(b.ram);
  const angle = drawWord242EC2(m, b.ROM) & 0xff;          // $2A64F6, FIRST
  const rawDx = i16(drawWord24328E(m, b.ROM));            // $2A6502, the LOW word
  const rawDy = i16(drawWord24328E(m, b.ROM));            // $2A650E, the HIGH word
  const dx = rawDx >> 2;                                  // $2A6508 asr.w #2
  const dy = (rawDy >> 1) - 0x1000;                       // $2A6514 asr.w #1 / $2A6518 subi
  assert.notEqual(rawDx >> 2, rawDx >> 1, 'the driven dx separates asr #2 from asr #1');
  assert.notEqual(rawDy >> 1, rawDy >> 2, '  ...and the driven dy separates #1 from #2');
  const jitters = [];
  for (let k = 0; k < 8; k++) jitters.push((drawByte242B3C(m, b.ROM) << 24) >> 24);
  s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
  const rows = livePool(b.ram);
  assert.equal(rows.length, 8, '$28B34A seeds eight particles');
  const want = (((0x3800 + dy) & 0xffff) * 0x10000 + ((0x1c00 + dx) & 0xffff)) >>> 0;
  assert.deepEqual([...new Set(rows.map((r) => r.pos))], [want],
    'all eight sit at ($3800 + dy, $1C00 + dx)');
  assert.notEqual(dx, dy, '  ...and dx and dy really differ here, so a swap would be visible');
  assert.equal(w(0x2a6508), 0xe440, '$2A6508 `E440` asr.w #2,D0 -- the dx shift');
  assert.equal(w(0x2a6514), 0xe240, '$2A6514 `E240` asr.w #1,D0 -- the dy shift, a DIFFERENT one');
  assert.equal(w(0x2a6518), 0x0442, '$2A6518 `0442` subi.w #imm,D2');
  assert.equal(w(0x2a651a), 0x1000, '  ...#$1000, SUBTRACTED');
  assert.deepEqual(rows.map((r) => r.angle), jitters.map((j) => (angle + (j >> 2)) & 0xff),
    'and each angle is $242EC2\'s byte plus that particle\'s own $242B3C jitter');
  assert.deepEqual([...new Set(rows.map((r) => r.bucket))], [8], 'bucket 8, from D3');
  assert.deepEqual(rows.map((r) => r.speed), [5, 7, 0x0a, 0x0e, 0x12, 0x16, 0x1c, 0x22],
    'and the eight speeds are the table\'s own, because D0 -- $28B34A\'s `lsr.w D6` -- is 0');
  assert.equal(w(0x2a6522), 0x303c, '$2A6522 `303C` move.w #imm,D0');
  assert.equal(w(0x2a6524), 0x0000, '  ...#$0, the shift');
  assert.equal(w(0x2a651e), 0x363c, '$2A651E `363C` move.w #imm,D3');
  assert.equal(w(0x2a6520), 0x0008, '  ...#$8, the bucket');
});

test('W409 SECTION 6 (ablation): the blast reloads from ($11,A4), and the two only differ once '
  + 'you make them differ', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reloading ($10,A4) from ($10,A4) came back GREEN, because the init's
  // $2020 puts the same byte in both. Drive a slot where they differ and count the frames.
  const b = state1({ blast: 0, blastReload: 0x09 });
  const fired = [];
  let seen = 0;
  for (let f = 1; f <= 22; f++) {
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    const now = livePool(b.ram).length;
    if (now !== seen) { fired.push(f); seen = now; }
  }
  assert.deepEqual(fired, [1, 11, 21], 'a reload of 9 blasts every TENTH frame');
  assert.equal(w(0x2a64f0), 0x196c, '$2A64F0 `196C` move.b (d16,A4),(d16,A4)');
  assert.equal(w(0x2a64f2), 0x0011, '  ...FROM ($11,A4)');
  assert.equal(w(0x2a64f4), 0x0010, '  ...TO ($10,A4)');
});

test('W409 SECTION 6 (ablation): the state-1 spawn RECORD -- f1c, the nudge LONGWORD, bucket 8, '
  + 'the +2 speed and a SIGNED jitter', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reading ($1C,A0) from the row word HIGH byte, storing the nudge as a
  // WORD, bucket 8 -> $10, the speed`s `+ 2` -> `+ 1`, an UNSIGNED jitter shift and taking the
  // angle from $242B3C instead of $242EC2 all came back GREEN. Six holes, one shape: nothing
  // above ever read a state-1 record. `rng: 4` is chosen so the jitter byte is NEGATIVE.
  const b = state1({ spawn: 0, spawnReload: 0x20, rng: 4 });
  b.ram.setU16(A4SLOT + 0x08, 8);                       // row 1, whose nudge is non-zero
  const m = rngMirror(b.ram);
  const jitter = drawByte242B3C(m, b.ROM);
  const angle = drawWord242EC2(m, b.ROM) & 0xff;
  assert.ok(jitter >= 0x80, `the driven jitter $${jitter.toString(16)} is NEGATIVE as a byte`);
  s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
  const rows = livePool(b.ram);
  assert.equal(rows.length, 1, 'one spawn');
  const r = rows[0];
  assert.equal(r.kind, 0x85, 'row 1 kind $85');
  // ($1C,A0): reading the row word's HIGH byte instead of its LOW one is an **INVALID
  // MUTATION** and not a hole -- all sixteen second words are $0000 (SECTION 5 asserts each
  // one), so no input the cartridge can present separates the two. It was REPLACED by moving
  // the read one byte ON, which lands in the nudge longword and this row does redden.
  assert.equal(r.f1c, 0, '($1C,A0) is the row second word LOW byte');
  assert.equal(new RomWindows(tables.rom).u16(HIBACHI_A4.s5Emit + 8 + 3) & 0xff, 0xe8,
    '  ...and a read one byte on would give $E8 here, which is the replacement mutation');
  assert.equal(r.nudge, 0xe8000a00, '  ...and ($26,A0) is the whole LONGWORD $E8000A00');
  assert.notEqual(r.nudge, 0xe8000000, '  ...not the high word with the low half left at 0');
  assert.equal(r.bucket, 8, '  ...bucket 8');
  assert.equal(r.pos, 0x38001c00, '  ...and the boss own position');
  const signed = (jitter << 24) >> 24;
  assert.equal(r.speed, ((signed >> 2) + 2) & 0xff,
    'the speed is an ARITHMETIC shift of the jitter plus TWO');
  assert.notEqual(r.speed, ((jitter >> 2) + 2) & 0xff, '  ...which an unsigned shift would miss');
  assert.notEqual(r.speed, ((signed >> 2) + 1) & 0xff, '  ...and `+ 1` would miss too');
  assert.equal(r.angle, angle, 'and ($1B,A0) is $242EC2 byte, drawn AFTER the $242B3C one');
  assert.notEqual(r.angle, jitter, '  ...the two draws differ on this input');
});

test('W409 SECTION 6 (ablation): ($7,A4) = 2 silences BOTH guards, and 1 does not',
  { skip: SKIP }, () => {
  // FIRST PASS RESULT: `!== 2` -> `!== 0` on the $28C2C2 cue and `!== 2` -> `!== 1` on the ramp
  // both came back GREEN, because no test drove ($7,A4) at 0 or at 1. Drive all three.
  const cueFor = (v) => {
    const b = state1({ blast: 0 });
    b.ram.setU8(A4SLOT + 0x07, v);
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    return b.sounds.filter((x) => x === 0x28c2c2).length;
  };
  assert.equal(cueFor(0), 1, '($7,A4) = 0 DOES post $28C2C2');
  assert.equal(cueFor(1), 1, '  ...and so does 1');
  assert.equal(cueFor(2), 0, '  ...and only 2 does not');
  const rampFor = (v) => {
    const b = state1({ ramp: 0 });
    b.ram.setU8(A4SLOT + 0x07, v);
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    return [b.ram.u8(A4SLOT + 0x07), b.ram.u8(A4SLOT + 0x0c)];
  };
  assert.deepEqual(rampFor(1), [0, 1], '($7,A4) = 1 still ramps DOWN, to 0');
  assert.deepEqual(rampFor(3), [2, 1], '  ...and 3 ramps to 2');
  assert.deepEqual(rampFor(2), [2, 0], '  ...and 2 alone does nothing at all');
});

test('W409 SECTION 6 (ablation): the state-1 $28C28E cue reloads ($13,A4) to FOUR, so it fires '
  + 'every fifth spawn', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `4` -> `5` came back GREEN, because ($13,A4) is cleared by the init
  // `clr.w ($12,A4)` and the tests above only ever saw its FIRST borrow. Count the spawns.
  const b = state1({ spawn: 0, spawnReload: 0, cue: 0 });
  const at = [];
  for (let f = 1; f <= 16; f++) {
    const before = b.sounds.length;
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    if (b.sounds.length !== before) at.push(f);
  }
  assert.deepEqual(at, [1, 6, 11, 16],
    'the cue fires on spawns 1, 6, 11 and 16 -- a reload of FOUR, i.e. every fifth');
  assert.deepEqual([...new Set(b.sounds)], [0x28c28e], '  ...and it is $28C28E');
  assert.equal(w(0x2a6572), 0x197c, '$2A6572 `197C` move.b #imm,(d16,A4)');
  assert.equal(w(0x2a6574), 0x0004, '  ...#$4 -- an IMMEDIATE, not a reload field');
  assert.equal(w(0x2a6576), 0x0013, '  ...into ($13,A4)');
});

test('W409 SECTION 6 (ablation): the init installs bank $E from $246BF8, and both halves of '
  + 'that matter', { skip: SKIP }, () => {
  // FIRST PASS RESULT: bank $E -> $D and source $246BF8 -> $246BB8 both came back GREEN,
  // because every test above runs with NO ctx.palette and the call is a counted note. Give it
  // a PaletteState and read the staging area.
  const b = bench();
  const pal = new PaletteState();
  b.ctx.palette = pal;
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  const base = PALSTAGE.spr.stage + 0x0e * 64;
  const bank = [...Array(32).keys()].map((i) => b.ram.u16(base + i * 2));
  assert.deepEqual([...new Set(bank)], [0x7fff], 'bank $E is 32 x $7FFF -- $246BF8, WHITE');
  const other = PALSTAGE.spr.stage + 0x0d * 64;
  assert.deepEqual([...new Set([...Array(32).keys()].map((i) => b.ram.u16(other + i * 2)))], [0],
    '  ...and bank $D is untouched');
  assert.equal(pal.installCount, 1, 'exactly one $24150A install');
  assert.deepEqual([...pal.installs.values()].map((e) => e.bank), [0x0e], '  ...of bank $E');
  // ...and the source really is the WHITE bank and not W91 BLACK twin $40 bytes below.
  const ROM = new RomWindows(tables.rom);
  assert.equal(ROM.u16(0x246bf8), 0x7fff, '$246BF8 is $7FFF -- WHITE');
  assert.equal(ROM.u16(0x246bb8), 0x0000, '  ...and $246BB8 is $0000 -- BLACK');
  assert.equal(w(0x2a6418), 0x303c, '$2A6418 `303C` move.w #imm,D0');
  assert.equal(w(0x2a641a), 0x000e, '  ...#$E');
  assert.equal(l(0x2a641e), 0x00246bf8, '  ...$2A641C lea $246BF8,A0');
});

test('W409 SECTION 6 (ablation): state 2 stops every RUNNING A2 object', { skip: SKIP }, () => {
  // FIRST PASS RESULT: dropping `$2A64C6 jsr $259924` came back GREEN, because no test above
  // put anything in the A2 table. Arm four slots and read their run bits back.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  for (const i of [0, 3, 7, 0x11]) b.ram.setU16(SCHED.a2Base + i * SCHED.a2Stride, 0x8001);
  b.ram.setU16(SCHED.a2Base + 5 * SCHED.a2Stride, 0x0001);   // NOT present: bit 15 clear
  b.ram.setU16(A4SLOT + 0x02, 2);
  b.ram.setU16(SCHED.fadeState, 0);
  s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
  for (const i of [0, 3, 7, 0x11]) {
    assert.equal(b.ram.u16(SCHED.a2Base + i * SCHED.a2Stride), 0x8000,
      `A2 slot ${i} keeps bit 15 and loses bit 0`);
  }
  assert.equal(b.ram.u16(SCHED.a2Base + 5 * SCHED.a2Stride), 0x0001,
    'and a slot without bit 15 is left exactly as it was');
  assert.equal(w(0x2a64c6), 0x4eb9, '$2A64C6 `4EB9` jsr');
  assert.equal(l(0x2a64c8), 0x00259924, '  ...$259924, the stop-ALL and not $25994A');
});

test('W409 SECTION 6 (ablation): the state-0 cue fires on the ODD spawns, and the frames say so',
  { skip: SKIP }, () => {
  // FIRST PASS RESULT: flipping the bchg polarity came back GREEN, because nothing else in
  // state 0 draws from the RNG -- so the eight cues consume the SAME eight bytes either way
  // and only the FRAME each lands on differs. Record the frames.
  const b = bench();
  s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
  const at = [];
  for (let f = 1; f <= 32; f++) {
    const before = b.sounds.length;
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    if (b.sounds.length !== before) at.push(f);
  }
  assert.deepEqual(at, [2, 6, 10, 14, 18, 22, 26, 30],
    'the cue lands on the FIRST spawn and every other one after it');
  assert.notDeepEqual(at, [4, 8, 12, 16, 20, 24, 28, 32],
    '  ...and not on the second, which is what the other polarity would give');
  assert.equal(b.ram.u8(A4SLOT + 0x12), 0,
    'and after sixteen toggles the bit is back where the init left it');
});

test('W409 SECTION 6 (ablation): a state word outside 0..4 does NOTHING', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `if (state !== 0) return` -> `if (state > 4) return` is an INVALID
  // mutation -- every earlier arm returns, so state is provably 0 by the time control reaches
  // it and the two agree on every value it can hold. It was REPLACED by dropping the guard
  // altogether, which this test reddens: the ROM `$2A65F8 bne.w` really does rts on a state
  // word it does not recognise, and nothing in the script clamps one.
  for (const bad of [5, 9, 0xffff]) {
    const b = bench();
    s5Init2A6418(b.ram, b.ROM, b.ctx, A4SLOT);
    const before = livePool(b.ram).length;
    b.ram.setU16(A4SLOT + 0x02, bad);
    b.ram.setU8(A4SLOT + 0x06, 0);            // due, so a missing guard WOULD spawn
    s5Step2A6458(b.ram, b.ROM, b.ctx, A4SLOT);
    assert.equal(livePool(b.ram).length, before, `state $${bad.toString(16)} spawns nothing`);
    assert.equal(b.sounds.length, 0, '  ...and posts nothing');
    assert.equal(b.ram.u16(A4SLOT + 0x02), bad, '  ...and does not change the state either');
    assert.equal(b.ram.u8(A4SLOT + 0x06), 0, '  ...nor touch the counter');
  }
  assert.equal(w(0x2a65f2), 0x0c6c, '$2A65F2 `0C6C` cmpi.w #imm,(d16,A4)');
  assert.equal(w(0x2a65f4), 0x0000, '  ...#$0');
  assert.equal(w(0x2a65f8), 0x6600, '  ...$2A65F8 `6600` bne.w');
  assert.equal(0x2a65fa + disp16(0x2a65fa), A4_5_CODE_END, '  ...to the rts');
});
