// ===============================================================================================
// W407 -- A1 GUN `$B` `$2A8C9A`, A4 SCRIPT `$11` `$2A6AB6` AND A4 SCRIPT `$10` `$2A6A76`.
// ===============================================================================================
//
// UNIT. The gun and the two scripts the frame-3317 PORT stop stood on. They are the SECOND and
// THIRD links of HIBACHI's phase-B gun loop.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "porting this unit CLOSES a second loop rather than advancing the chain." It does not.
//      A three-link loop needs THREE guns and the unit contains one: `$F` waits on gun 9
//      (W406), `$11` waits on gun `$B` (here) and `$10` waits on **A1 gun `$A` `$2A8B7C`,
//      which is still unported**. The real path now runs 699 frames further and stops in front
//      of it. Nothing about the loop's shape changed; what changed is that the last unported
//      member of it is now a GUN and not a script. SECTION 2 and SECTION 3.
//   2. "a gun's freeze arm branches BACKWARD into its own init" -- W404's rule, which W406
//      narrowed to "ten of the fourteen, guns 0..8 and $B". **Gun `$B` is not one of them.**
//      `$2A8CB8 6600 01CA` is a FORWARD `bne.w` to `$2A8E84`, gun `$B`'s OWN RETIRE TAIL, so a
//      frozen gun `$B` clears its A1 slot and A4 `$11` walks on. Every one of the fourteen
//      displacements is decoded in SECTION 1; nine go back to their init, gun `$B` goes
//      forward, four have no test at the entry at all.
//   3. Not in the brief: **gun `$B` computes an aim and throws it away.** `$2A8D0A jsr $2422A2`
//      is followed one instruction later by `$2A8D10 323C 0080`, `move.w #$80,D1`, and it is
//      that constant, not the aim, that `$2A8D14 move.b D1,($7,A4)` stores. The block runs on
//      volley ONE only (`$2A8CCA cmp.b ($5,A4)` against a field nothing writes), so gun `$B`
//      fires from the fixed heading `$80` for its whole run and keeps firing after both
//      players are dead. SECTION 4.
//   4. Not in the brief: `$2A6AD8 move.b #$4,($1A,A5)` sits between `jsr $259A18` and the
//      wait, i.e. on the frame gun `$B` STARTS. `src/hibachiguns.js`'s W406 header put A4
//      `$11`'s write on the hand-over path with A4 `$F`'s; it is A4 `$D`'s arrangement
//      instead. SECTION 6.
//
// SECTION 1  the three extents, each bounded three ways, and no bound an absence
// SECTION 2  phase B's loop is NOT closed, and gun $A is the piece that would close it
// SECTION 3  **THE DELIVERABLE**: how far the real path runs now, and which kind of stop
// SECTION 4  gun $B driven, with the bullet RECORDS read back
// SECTION 5  the ablation section -- the inputs that separate constants that agree by default
// SECTION 6  A4 $11 and A4 $10 driven
// SECTION 7  the window set: 595, and the three bounds on the one new window
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
  gunBInit2A8C9A, gunBStep2A8CB2, a4Eleven2A6AB6, a4Ten2A6A76,
} from '../src/hibachiguns.js';
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

const GUNB_CODE_END = 0x2a8e92;      // `4E75` AT that address
const GUNB_BLOB = 0x2a8c7a;          // the eight $002A8C9A self-pointers
const A4_11_END = 0x2a6afa;          // `4E75` AT that address
const A4_10_END = 0x2a6ab4;          // ditto

// ===============================================================================================
// SECTION 1 -- THE THREE EXTENTS.
// ===============================================================================================

test('W407 SECTION 1: gun $B is $236 bytes of which $1FA is CODE, bounded THREE ways',
  { skip: SKIP }, () => {
    assert.equal(l(HIBACHI_A1.main + 0x0b * 8), HIBACHI_A1.gunBInit, '$2A72C8[$B].init');
    assert.equal(l(HIBACHI_A1.main + 0x0b * 8 + 4), HIBACHI_A1.gunBStep, '  ...and .step');
    // (1) `4E75` sits AT $2A8E92 -- TRAP 5, the LAST address and not one past it -- and the
    //     retire path's own `bcc.w` lands exactly there.
    assert.equal(w(GUNB_CODE_END), 0x4e75, '(1) $2A8E92 `4E75`, gun $B\'s last instruction');
    assert.equal(w(0x2a8e80), 0x6400, '  ...$2A8E80 `6400` bcc.w');
    assert.equal(0x2a8e82 + disp16(0x2a8e82), GUNB_CODE_END, '  ...lands on that rts');
    // (2) what FOLLOWS the code is data a `lea` NAMES, one gun further on: gun $C's own init
    //     names $2A8E94, so $2A8E94.. is gun $C's block and not more of gun $B.
    assert.equal(w(0x2a8ed0), 0x41fa, '(2) $2A8ED0 `41FA` lea (d16,PC),A0 -- GUN $C\'s init');
    assert.equal(0x2a8ed2 + disp16(0x2a8ed2), 0x2a8e94, '  ...and it names $2A8E94');
    assert.equal(w(0x2a8ed8), 0x700d, '  ...with `moveq #$D` -- FOURTEEN words, $1C bytes');
    assert.equal(0x2a8e94 + 0x1c, 0x2a8eb0, '  ...ending at $2A8EB0');
    for (let i = 0; i < 8; i++) {
      assert.equal(l(0x2a8eb0 + i * 4), 0x2a8ed0,
        `  ...and $${(0x2a8eb0 + i * 4).toString(16).toUpperCase()} is $002A8ED0, gun $C's own`);
    }
    // (3) and the table's own next entry closes the extent.
    assert.equal(l(HIBACHI_A1.main + 0x0c * 8), 0x2a8ed0, '(3) $2A72C8[$C].init is $2A8ED0');
    assert.equal(0x2a8ed0 - HIBACHI_A1.gunBInit, 0x236, '  ...so gun $B is $236 bytes');
    assert.equal(GUNB_CODE_END + 2 - HIBACHI_A1.gunBInit, 0x1fa,
      '  ...of which $1FA is CODE and the remaining $3C is gun $C\'s template and blob');
    assert.equal(0x236 - 0x1fa, 0x1c + 0x20, '  ...$1C of template plus $20 of self-pointers');
  });

test('W407 SECTION 1: A4 $11 is $46 bytes and A4 $10 is $40, each bounded THREE ways',
  { skip: SKIP }, () => {
    for (const [id, init, step, end, endBranches, next, len] of [
      [0x11, 0x2a6ab6, 0x2a6abc, A4_11_END,
        [[0x2a6ac8, 0x30], [0x2a6ace, 0x2a], [0x2a6ae6, 0x12]], 0x2a6afc, 0x46],
      [0x10, 0x2a6a76, 0x2a6a7c, A4_10_END,
        [[0x2a6a88, 0x2a], [0x2a6a8e, 0x24], [0x2a6aa0, 0x12]], 0x2a6ab6, 0x40],
    ]) {
      const tag = `A4 $${id.toString(16)}`;
      assert.equal(l(HIBACHI_A4.table + id * 8), init, `$2A5886[$${id.toString(16)}].init`);
      assert.equal(l(HIBACHI_A4.table + id * 8 + 4), step, '  ...and .step');
      // (1) `4E75` AT the end, and THREE branches reach it.
      assert.equal(w(end), 0x4e75, `(1) ${tag}: $${end.toString(16).toUpperCase()} \`4E75\``);
      for (const [site, off] of endBranches) {
        assert.equal(w(site) & 0xff, off, `  ...$${site.toString(16)}'s displacement`);
        assert.equal(site + 2 + off, end, '  ...and it lands on that rts');
      }
      // (2) `4254` clr.w (A4) -- TRAP 6, clr.w (A4) and NOT clr.w D4 -- right before it.
      assert.equal(w(end - 2), 0x4254, `(2) ${tag}: \`4254\` clr.w (A4) at end - 2`);
      // (3) and the table's own next entry is the address after that rts.
      assert.equal(l(HIBACHI_A4.table + (id + 1) * 8), next, `(3) ${tag}: the next entry`);
      assert.equal(next - init, len, `  ...so ${tag} is $${len.toString(16)} bytes`);
      assert.equal(next, end + 2, '  ...which is the rts + 2, with no gap between them');
      // ...and the A4 convention, checked on THESE and not carried across from the A1 table.
      assert.notEqual(w(step - 2), 0x4e75, `  ...${tag}'s init does NOT end in an rts`);
      assert.equal(w(init), 0x397c, '  ...`397C move.w #imm,(d16,A4)` opens it');
      assert.equal(w(init + 2), 0x0060, '  ...with #$60, the same delay A4 $F loads');
      assert.equal(w(step - 2), 0x0002, '  ...and the word before the step is its ($2,A4)');
    }
  });

test('W407 SECTION 1: gun $B\'s FREEZE ARM RETIRES IT -- all fourteen displacements decoded',
  { skip: SKIP }, () => {
    // A1: `4E75` at step - 2, so the init runs ALONE on the first frame.
    assert.equal(w(HIBACHI_A1.gunBStep - 2), 0x4e75,
      '$2A8CB0 `4E75` -- gun $B\'s init does NOT fall through into its step');

    // ---- EVERY ONE OF THE FOURTEEN, as what STANDS at its step entry and where its arm goes.
    const back = [];
    const other = new Map();
    const none = [];
    for (let i = 0; i < HIBACHI_A1.pairs; i++) {
      const step = l(HIBACHI_A1.main + i * 8 + 4);
      if (w(step) !== 0x4a79 || l(step + 2) !== HIBACHI_A1.freeze) { none.push(i); continue; }
      assert.equal(w(step + 6), 0x6600, `gun $${i.toString(16)}'s test is followed by \`6600\``);
      const tgt = step + 8 + disp16(step + 8);
      if (tgt === l(HIBACHI_A1.main + i * 8)) back.push(i); else other.set(i, tgt);
    }
    assert.deepEqual(back, [0, 1, 2, 3, 4, 5, 6, 7, 8],
      'NINE of the fourteen branch BACK to their own init and re-seed the whole slot');
    assert.deepEqual([...other], [[0x0b, 0x2a8e84]],
      '  ...and gun $B is the ONE that does not: FORWARD, to $2A8E84');
    assert.deepEqual(none, [0x09, 0x0a, 0x0c, 0x0d],
      '  ...while four have no `4A79` at the entry (gun $C\'s is at $2A8F24, eight bytes in)');

    // ---- AND $2A8E84 IS THE RETIRE TAIL, not a second body and not an rts.
    assert.equal(w(0x2a8e84), 0x086d, '$2A8E84 `086D` bchg #imm,(d16,A5)');
    assert.equal(w(0x2a8e86), 0x0000, '  ...bit 0');
    assert.equal(w(0x2a8e88), 0x0003, '  ...($3,A5)');
    assert.equal(w(0x2a8e8a), 0x700b, '  ...$2A8E8A `700B` moveq #$B,D0');
    assert.equal(l(0x2a8e8e), 0x00259b08, '  ...$2A8E8C jsr $259B08 -- the A1 STOP');
    assert.equal(HIBACHI_A1.freezeToRetire[0x0b], 0x2a8e84, '  ...and the port says so too');
    // ...and the ordinary path falls into the SAME three instructions, which is why a frozen
    // gun $B and a spent gun $B are indistinguishable from outside the slot.
    assert.equal(0x2a8e82 + disp16(0x2a8e82), GUNB_CODE_END,
      '$2A8E80\'s bcc.w skips $2A8E84 when the volley counter has NOT borrowed');
  });

// ===============================================================================================
// SECTION 2 -- PHASE B'S LOOP IS NOT CLOSED BY THIS WAVE.
// ===============================================================================================

/** Every `moveq #n,D0 / jsr <target>` in the boss ROM, as {address: n}. */
function callSites(target) {
  const out = new Map();
  for (let a = 0x2a4000; a < 0x2ab000; a += 2) {
    if ((w(a) & 0xff00) !== 0x7000) continue;
    if (w(a + 2) !== 0x4eb9 || l(a + 4) !== target) continue;
    out.set(a + 2, w(a) & 0xff);
  }
  return out;
}

test('W407 SECTION 2: the loop is THREE guns and this wave ports ONE of them', { skip: SKIP },
  () => {
    const a1 = callSites(0x00259a18);
    const wait = callSites(0x00259a4a);
    const a4 = callSites(0x0025980c);
    // ---- the three links, unchanged from W406 and re-read here rather than cited.
    for (const [script, gun, next, startAt, waitAt, handAt] of [
      [0x0f, 0x09, 0x11, 0x2a6a4c, 0x2a6a54, 0x2a6a5e],
      [0x11, 0x0b, 0x10, 0x2a6ad2, 0x2a6ae0, 0x2a6aea],
      [0x10, 0x0a, 0x0f, 0x2a6a92, 0x2a6a9a, 0x2a6aa4],
    ]) {
      assert.equal(a1.get(startAt), gun,
        `A4 $${script.toString(16)} starts A1 gun $${gun.toString(16)}`);
      assert.equal(wait.get(waitAt), gun, '  ...and waits on the same id');
      assert.equal(a4.get(handAt), next, `  ...then hands to A4 $${next.toString(16)}`);
    }
    // ---- **AND THE THIRD GUN IS NOT PORTED.** Stated as the registration map, positively.
    const reg = new Set(scriptAddresses());
    for (const a of [0x2a6a30, 0x2a6a36, 0x2a89ba, 0x2a89f4,          // $F  + gun 9   W406
      0x2a6ab6, 0x2a6abc, 0x2a8c9a, 0x2a8cb2,                          // $11 + gun $B  W407
      0x2a6a76, 0x2a6a7c]) {                                           // $10           W407
      assert.ok(reg.has(a), `$${a.toString(16).toUpperCase()} is registered`);
    }
    // W408 CORRECTION: gun $A is ported, so the third gun is no longer the missing one and all
    // three links of the loop are registered code. The extent below is unchanged.
    for (const a of [0x2a8b7c, 0x2a8bc0]) {
      assert.ok(reg.has(a), `$${a.toString(16).toUpperCase()} -- A1 gun $A -- IS, since W408`);
    }
    assert.equal(HIBACHI_A1_COUNTED[0x0a], undefined, 'gun $A is no longer counted');
    // ...and gun $A's own extent, measured the same three ways, so the next wave has it.
    assert.equal(w(0x2a8b7c), 0x41fa, '$2A8B7C `41FA` lea -- ordinary code, not a park');
    assert.equal(w(0x2a8c6e), 0x4e75, '  ...`4E75` AT $2A8C6E is gun $A\'s last instruction');
    assert.equal(w(0x2a8c66), 0x700a, '  ...$2A8C66 moveq #$A / $2A8C68 jsr $259B08 before it');
    assert.equal(l(0x2a8c6a), 0x00259b08, '  ...and that jsr is the A1 STOP');
    assert.equal(0x2a8c70 - 0x2a8b7c, 0xf4, '  ...so $F4 of gun $A\'s $11E is CODE');
    assert.equal(0x2a8c70, HIBACHI_A1.gunBTemplate, '  ...and the rest is gun $B\'s own data');
    // W408 CORRECTION: this file's prose and `HIBACHI_A1_COUNTED` both called that rest $3C.
    // It is $2A. $3C is gun $B's OWN trailing figure, copied one gun too far.
    assert.equal(0x11e - 0xf4, 0x2a, '  ...and the rest is $2A, NOT the $3C W407 wrote');
    assert.equal(0x2a, 0x0a + 0x20, '  ...gun $B\'s $A of template plus $20 of self-pointers');
  });

test('W407 SECTION 2: A4 $12 is still the orphan, and the enumeration is positive',
  { skip: SKIP }, () => {
    const a4 = callSites(0x0025980c);
    const started = [...new Set(a4.values())].sort((x, y) => x - y);
    assert.deepEqual(started,
      [0x00, 0x02, 0x04, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10, 0x11, 0x13, 0x14],
      'the seventeen A4 ids a `jsr $25980C` in $2A4000..$2AB000 ever loads');
    for (const [site, id] of [[0x2a6e1e, 1], [0x2a7074, 3], [0x2a728a, 5]]) {
      assert.equal(w(site), 0x7000 | id, `$${site.toString(16)} moveq #$${id},D0 / \`4EF9\` jmp`);
      assert.equal(w(site + 2), 0x4ef9, '  ...a TAIL call, which is why it is not in the list');
    }
    // ...and it is not that D0 is loaded some other way: NOWHERE in the 6 MB image does a
    // `moveq #$12` stand immediately before a `jsr` or a `jmp` to $25980C.
    let n = 0;
    for (let a = 0; a < IMG.length - 8; a += 2) {
      if (w(a) === 0x7012 && (w(a + 2) === 0x4eb9 || w(a + 2) === 0x4ef9)
        && l(a + 4) === 0x0025980c) n += 1;
    }
    assert.equal(n, 0, 'zero sites in the WHOLE image, not just in the boss ROM');
    assert.equal(HIBACHI_END_COUNTED[0x12].bytes, 0x4c, '  ...so A4 $12 stays counted, at $4C');
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
  const out = { stopped: null, suspend: null, shots: 0, bySite: new Map(),
    a1: [], a4: [], timer: [] };
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
    if (out.suspend === null && b.ram.u16(SCHED.suspend) !== 0) out.suspend = f;
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

test('W407 SECTION 3: the real path reaches frame 4016 and stops at A1 gun $A', { skip: SKIP },
  () => {
    const r = runReal(realPath(), 9000);

    // ---- WHERE IT RAN. Two more links of phase B's loop, then the gun nobody had ported.
    // W408 CORRECTION: gun $A runs now, so each history has one more entry and the run does
    // not stop here -- `w408hibachiguna.test.js` SECTION 3 owns the stop.
    assert.deepEqual(r.a1.slice(-6),
      [[3023, '9'], [3316, ''], [3412, 'b'], [3919, ''], [4016, 'a'], [4447, '']],
      'gun 9 3023..3315, then gun $B 3412..3918, then gun $A 4016..4446');
    // W409 CORRECTION: A4 script 5 runs and retires itself, so the history gains a final
    // empty entry behind the 5.
    assert.deepEqual(r.a4.slice(-5, -1).map(([, v]) => v), ['f', '11', '10', '5'],
      'and the A4 history ends $F -> $11 -> $10 -> 5, phase B\'s own timeout');
    assert.equal(r.a4[r.a4.length - 1][1], '',
      '  ...and then nothing, because $2A646C clr.w (A4) frees the slot');

    // ---- THE ARITHMETIC OF THE 699 FRAMES, every number somebody's instruction.
    assert.equal(r.a4[r.a4.length - 4][0], 3317, 'A4 $11 is dispatched first on 3317');
    assert.equal(3412 - 3317, 0x5f,
      '  ...and gun $B starts $5F later: the init writes #$60 and FALLS THROUGH into the step, '
      + 'which spends one on the same frame (TRAP: the A4 convention)');
    assert.equal(3919 - 3412, (0x10 + 1) + 44 * 5 + 135 * 2,
      'gun $B runs 507 frames: the init ALONE on 3412 (the A1 convention), $10 + 1 STEP frames '
      + 'to the first borrow, then 179 gaps -- 44 of them $4 + 1 because ($C,A4) reached zero '
      + 'and 135 of them ($6,A4) + 1');
    assert.equal(r.a4[r.a4.length - 3][0], 3920, 'A4 $10 takes over on 3920');
    assert.equal(4016 - 3920, 0x60, '  ...and asks for gun $A $60 frames later');

    // ---- **WHICH KIND OF STOP.** W408 CORRECTION: not here any more. Gun $A runs, and the
    // path goes on to phase B's timeout and stops at A4 script 5 on 4447. What THIS wave
    // measured about $2A8B7C stands and is kept, as what the next link is made of.
    // W409 CORRECTION: there is no stop left. A4 script 5 is ported, it takes the slot on
    // 4447 and ends the stage 442 frames later.
    assert.equal(r.stopped, null, 'nothing throws anywhere in 8,000 frames');
    assert.equal(r.a4[r.a4.length - 2][0], 4447, 'A4 script 5 takes the slot on 4447');
    assert.equal(r.suspend, 4889, '  ...and $2595E8 suspends the stage on 4889');
    //   (a) a live table entry the cartridge dispatches through, with ordinary code at it;
    assert.equal(l(HIBACHI_A1.main + 0x0a * 8), 0x2a8b7c, '(a) $2A72C8[$A].init IS $2A8B7C');
    assert.equal(w(0x2a8b7c), 0x41fa, '  ...and `41FA lea` stands there, not an rts');
    //   (b) what routed us there is this wave's own code;
    assert.equal(w(0x2a6a90), 0x700a, '(b) $2A6A90 `700A` moveq #$A,D0');
    assert.equal(l(0x2a6a94), 0x00259a18, '  ...$2A6A92 jsr $259A18, in A4 $10\'s start arm');
    //   (c) and the arrow that WOULD close the loop is still there, unexecuted: phase B's
    //       timer kills it inside gun $A's run, every lap. See w408hibachiguna SECTION 2.
    assert.equal(w(0x2a6aa2), 0x700f, '(c) $2A6AA2 moveq #$F -- the arrow that would close it');
    assert.ok(new Set(scriptAddresses()).has(0x2a8b7c),
      '  ...and gun $A IS registered, since W408');

    // ---- **WHAT "COMPLETING" MEANS.** W409 CORRECTION: W407's note here said only A4 $14
    // reaches `$2595E8`. It is not the only one -- `$2A6466` is a second `jsr $2595E8`, inside
    // A4 script 5, and script 5 is exactly where this bench's arm goes. Both arms of script
    // 1's fork have an ending; they just have a different one each.
    assert.equal(w(0x2a5cb4), 0x7014, '$2A5CB4 moveq #$14 -- the FIRST-loop arm\'s link');
    assert.equal(w(0x2a728a), 0x7005, '$2A728A moveq #$5 / $2A728C jmp -- phase B\'s death tail');
    assert.equal(l(0x2a6468), 0x002595e8, '$2A6466 jsr $2595E8 -- A4 script 5\'s own suspend');
    assert.equal(HIBACHI_END_COUNTED[0x05], undefined, '  ...and A4 5 is ported, not counted');
  });

test('W407 SECTION 3: 8,105 spawn calls, and gun $B\'s 3,240 are 180 volleys of EIGHTEEN',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 9000);
    // W408 CORRECTION: 8,825 -- gun $A's 720 on top. This wave's 3,240 are unchanged.
    assert.equal(r.shots, 8825, 'the run fires 8,825 where W406\'s fired 4,865');
    assert.equal(8825 - 4865 - 720, 3240,
      '  ...and the 3,240 this wave added are all gun $B\'s');
    assert.equal(IMG[HIBACHI_A1.gunBTemplate + 2], 0xb3, 'gun $B\'s template ($4,A4) is $B3');
    assert.equal((0xb3 + 1) * 18, 3240,
      '  ...so 180 volleys of eighteen -- and $B3 is what the SLOT holds, because gun $B\'s '
      + 'init reads no A6 ramp at all');
    // ...eighteen sites, nine per arm, each fired once per volley.
    const A = [0x2a8d3c, 0x2a8d4c, 0x2a8d5c, 0x2a8d6c, 0x2a8d7c, 0x2a8d8c, 0x2a8d9c,
      0x2a8dac, 0x2a8dbc];
    const B = [0x2a8de4, 0x2a8df4, 0x2a8e04, 0x2a8e14, 0x2a8e24, 0x2a8e34, 0x2a8e44,
      0x2a8e54, 0x2a8e64];
    for (const site of [...A, ...B]) {
      assert.equal(r.bySite.get(site), 180, `$${site.toString(16)} fired once a volley`);
      assert.equal(w(site), 0x4eb9, '  ...and it really is a `jsr` site');
      assert.equal(l(site + 2), HIBACHI_A1.spawn, '  ...to $2817C2');
    }
    // ---- phase B's death timer is running and this loop keeps re-arming it. `($1A,A5)`
    // strictly falls except on the two frames the loop writes its HIGH byte.
    const jumps = [];
    for (let i = 3000; i < 4000; i++) {
      if (r.timer[i] !== r.timer[i - 1] - 1) jumps.push([i + 1, r.timer[i - 1], r.timer[i]]);
    }
    assert.equal(jumps.length, 2,
      'exactly TWO discontinuities in ($1A,A5) over frames 3001..4000, and both are re-arms');
    assert.deepEqual(jumps, [[3317, 0x606b, 0x0c6a], [3412, 0x0c0c, 0x040b]],
      'on 3317 A4 $F writes $C over the high byte and on 3412 A4 $11 writes $4 over it -- and '
      + 'in both the LOW byte still fell by one, because $2A7088 is a WORD subtract that ran '
      + 'on the same frame');
    for (const [site, imm] of [[0x2a6a6c, 0x000c], [0x2a6ad8, 0x0004]]) {
      assert.equal(w(site), 0x1d7c, `$${site.toString(16)} \`1D7C\` move.b #imm,(d16,A5)`);
      assert.equal(w(site + 2), imm, '  ...the immediate');
      assert.equal(w(site + 4), 0x001a, '  ...at ($1A,A5)');
    }
  });

// ===============================================================================================
// SECTION 4 -- GUN $B DRIVEN, WITH THE RECORDS READ BACK.
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
  ram.setU16(A4SLOT, 0x800b);
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
    p28: ram.u32(a + BREC.param28),      // $2818B4 move.l D3,($18,A0)
    p2c: ram.u32(a + BREC.param2c),      //         move.l D4,($1c,A0)
  };
};
const baseSpeed = (kind) => w(l(0x281956 + 4 * kind) + 0x0e);
/** Run one whole volley: $10 + 1 step frames from a fresh init. */
const volley1 = (b) => {
  for (let i = 0; i < 0x11; i++) gunBStep2A8CB2(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
};

test('W407 SECTION 4: the init is FIVE template words and ONE hand-written pair, no A6 ramp',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU8(SUB + 0x1da, 0x7f);          // every A6 ramp byte the OTHER five guns read
    for (const off of [0x1dc, 0x1de, 0x1e6, 0x1e7, 0x1e8, 0x1ec, 0x1ee, 0x1f6, 0x1f8]) {
      b.ram.setU16(SUB + off, 0x7f7f);
    }
    gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
    for (let i = 0; i < 5; i++) {
      assert.equal(b.ram.u16(A4SLOT + 2 + i * 2), w(HIBACHI_A1.gunBTemplate + i * 2),
        `template word ${i} lands UNMODIFIED -- no ramp touched it`);
    }
    // TRAP 3, twice: ONE word literal over TWO byte fields.
    assert.equal(b.ram.u16(A4SLOT + 0x04), 0xb3b3, '($4,A4)/($5,A4) are ONE word $B3B3');
    assert.equal(b.ram.u8(A4SLOT + 0x04), b.ram.u8(A4SLOT + 0x05),
      '  ...so the volley counter STARTS equal to its reload, which is $2A8CD2\'s whole point');
    assert.equal(b.ram.u16(A4SLOT + 0x0c), 0x0404,
      '($C,A4)/($D,A4) are $2A8CAA move.w #$404 -- NOT template words');
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0x0013, '($8,A4) is the speed bias $13');
    assert.equal(b.ram.u16(A4SLOT + 0x0a), 0x0003, '($A,A4) is the bullet kind 3');
    assert.equal(b.ram.u8(A4SLOT + 0x06), 0x01, '($6,A4) is the one-frame volley gap');
    assert.equal(b.ram.u8(A4SLOT + 0x07), 0x00, '($7,A4) is $00, and it is NEVER used: '
      + '$2A8D14 overwrites it before $2A8D18 reads it');
    // ...and no RNG draw at all, where guns 5, 8 and 9 all seed from one.
    assert.equal(w(HIBACHI_A1.gunBInit + 0x10), 0x397c,
      '$2A8CAA is the LAST instruction of the init -- `397C`, not a `4EB9 jsr $242E24`');
    assert.equal(w(HIBACHI_A1.gunBInit + 0x16), 0x4e75, '  ...and $2A8CB0 `4E75` ends it');
  });

test('W407 SECTION 4: eighteen shots, two mirrored arms, kinds 3,4,5,6,5,4,3,4,5 and biases '
  + '$13..$2B', { skip: SKIP }, () => {
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  volley1(b);
  const all = b.shots.map((e) => rec(b.ram, e));
  assert.equal(all.length, 18, 'eighteen spawn calls, one bullet each');
  assert.ok(b.shots.every((e) => e[1].length === 1), '  ...kinds 3..6 are single-bullet kinds');

  const KIND = [3, 4, 5, 6, 5, 4, 3, 4, 5];
  const spread = 0xb7 - 0xb3;                 // $2A8D1E move.b #$B7,D6 / sub.b ($4,A4),D6
  for (let k = 0; k < 9; k++) {
    const bias = 0x13 + 3 * k;                // eight `addi.l #$30000,D0`
    // ARM A -- $B7 - n ADDED to the heading, and the step is `sub.b #$16`.
    assert.equal(all[k].kind, KIND[k], `arm A shot ${k} kind`);
    assert.equal(all[k].dir, u8(0x80 + spread - 0x16 * k), `  ...arm A shot ${k} direction`);
    assert.equal(all[k].speed, u8(baseSpeed(KIND[k]) + bias), `  ...arm A shot ${k} speed`);
    // ARM B -- the SAME nine biases and kinds off a reloaded ($8,A4), mirrored heading.
    assert.equal(all[9 + k].kind, KIND[k], `arm B shot ${k} kind`);
    assert.equal(all[9 + k].dir, u8(0x80 - spread + 0x16 * k), `  ...arm B shot ${k} direction`);
    assert.equal(all[9 + k].speed, u8(baseSpeed(KIND[k]) + bias), `  ...arm B shot ${k} speed`);
  }
  // ---- the MUZZLE is $600 above the boss's own Y and dead level with it horizontally.
  for (const s of all) {
    assert.equal(s.posA, 0x3800 - 0x600, 'every bullet is spawned $600 above ($2,A6)');
    assert.equal(s.posB, 0x1c00, '  ...and at the boss\'s own X');
    // ...and D3 and D4 land in the record too, because kinds 3..6 take `$2818B4`.
    assert.equal(s.p28, 0xfa000000, '  ...D3 reaches ($18,A0) as the same longword');
    assert.equal(s.p2c, 0x00000000, '  ...and D4, which $2A8D3A moveq #$0 sets, reaches ($1C,A0)');
  }
  assert.equal(l(0x2a8d36), 0xfa000000, '$2A8D34 move.l #$FA000000,D3 -- the muzzle');
  assert.equal(l(0x2a8dde), 0xfa000000, '  ...and arm B loads the same literal at $2A8DDC');
});

test('W407 SECTION 4: the AIM IS THROWN AWAY -- two players in opposite corners fire the SAME '
  + 'eighteen bullets', { skip: SKIP }, () => {
  // The strongest statement of `$2A8D10 move.w #$80,D1` that a record can make: move the
  // target as far as the aim table can see and read the directions back.
  const shotsFor = (py, px) => {
    const b = gunBench({ py, px });
    gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
    volley1(b);
    return b.shots.map((e) => rec(b.ram, e)).map((s) => [s.site, s.dir, s.kind, s.speed]);
  };
  const near = shotsFor(0x2000, 0x2400);
  const far = shotsFor(0x6000, 0x0200);
  assert.deepEqual(far, near,
    'a target at ($6000,$0200) and one at ($2000,$2400) produce byte-identical volleys');
  assert.equal(near[0][1], 0x84, '  ...both at $80 + ($B7 - $B3), the CONSTANT heading');
  // ...and the instruction that makes it so, with the aim it discards named either side.
  assert.equal(w(0x2a8d0a), 0x4eb9, '$2A8D0A `4EB9` jsr');
  assert.equal(l(0x2a8d0c), 0x002422a2, '  ...$2422A2, the aim');
  assert.equal(w(0x2a8d10), 0x323c, '$2A8D10 `323C` move.w #imm,D1 -- over the answer');
  assert.equal(w(0x2a8d12), 0x0080, '  ...#$80');
  assert.equal(w(0x2a8d14), 0x1941, '$2A8D14 `1941` move.b D1,(d16,A4) -- and THAT is stored');
  assert.equal(w(0x2a8d16), 0x0007, '  ...at ($7,A4)');
});

test('W407 SECTION 4: the aim block runs on volley ONE only, so a dead screen does not stop it',
  { skip: SKIP }, () => {
    // ($5,A4) is never written by gun $B, so `cmp.b ($5,A4),D2` is false from volley 2 on.
    const b = gunBench();
    gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
    volley1(b);
    assert.equal(b.shots.length, 18, 'volley 1 fires with a player alive');
    assert.equal(b.ram.u8(A4SLOT + 0x07), 0x80, '  ...and leaves $80 in ($7,A4)');
    // Now KILL BOTH PLAYERS and keep stepping. The both-dead arm is not consulted again.
    b.ram.setU16(HIBACHI_A1.selP1, 0x0000);
    b.ram.setU16(HIBACHI_A1.selP2, 0x0000);
    b.shots.length = 0;
    for (let i = 0; i < 2; i++) gunBStep2A8CB2(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.shots.length, 18,
      'volley 2 fires all eighteen at an empty screen -- $2A8CD2 skipped the whole block');
    assert.equal(b.ram.u8(A4SLOT + 0x07), 0x80, '  ...($7,A4) still the volley-1 constant');

    // ---- and with both dead on volley ONE, `$2A8CF6 bpl.w $2A8E6A` skips all eighteen.
    const c = gunBench({ p1: 0x0000, p2: 0x0000 });
    gunBInit2A8C9A(c.ram, c.ROM, A4SLOT);
    volley1(c);
    assert.equal(c.shots.length, 0, 'a first volley with nobody alive fires nothing');
    assert.equal(c.ram.u8(A4SLOT + 0x04), 0xb2, '  ...but the volley counter still ticked');
    assert.equal(c.ram.u8(A4SLOT + 0x0c), 3, '  ...and so did the group counter: $2A8E6A is '
      + 'the JOIN, below the shots and above both counters');
    assert.equal(w(0x2a8cf4), 0x6a00, '$2A8CF4 `6A00` bpl.w');
    assert.equal(0x2a8cf6 + disp16(0x2a8cf6), 0x2a8e6a, '  ...to $2A8E6A, that join');
  });

test('W407 SECTION 4: every FOURTH volley waits $4 frames and the other three wait ($6,A4)',
  { skip: SKIP }, () => {
    const b = gunBench();
    gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
    const gaps = [];
    let since = 0;
    for (let f = 0; f < 60; f++) {
      const before = b.shots.length;
      gunBStep2A8CB2(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      since += 1;
      if (b.shots.length !== before) { gaps.push(since); since = 0; }
    }
    assert.equal(gaps[0], 0x11, 'the first volley is $10 + 1 step frames in');
    assert.deepEqual(gaps.slice(1, 13), [2, 2, 2, 5, 2, 2, 2, 5, 2, 2, 2, 5],
      'then 2, 2, 2, 5 for ever: ($6,A4) = 1 three times and $2A8E76\'s #$4 on the fourth');
    assert.equal(w(0x2a8e76), 0x197c, '$2A8E76 `197C` move.b #imm,(d16,A4)');
    assert.equal(w(0x2a8e78), 0x0004, '  ...#$4');
    assert.equal(w(0x2a8e7a), 0x0002, '  ...at ($2,A4), OVER the ($6,A4) $2A8CC4 just wrote');
    assert.equal(IMG[HIBACHI_A1.gunBTemplate + 4], 0x01, '  ...and ($6,A4) is $01');
  });

test('W407 SECTION 4: A FROZEN GUN $B RETIRES ITSELF', { skip: SKIP }, () => {
  const b = gunBench({ freeze: 1 });
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  const before = b.ram.u8(REC + 0x03);
  gunBStep2A8CB2(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  assert.equal(b.shots.length, 0, 'nothing is fired');
  assert.equal(b.ram.u16(A4SLOT), 0, 'and $259B08 CLEARED the A1 slot on the very first frame');
  assert.equal(b.ram.u8(REC + 0x03), before ^ 1, '  ...after $2A8E84 toggled ($3,A5)');
  assert.equal(b.ram.u8(A4SLOT + 0x02), 0x10,
    '  ...and the countdown was NOT spent: the freeze test is above $2A8CBC');
  // A frozen gun 5 does the opposite: it re-seeds and keeps its slot.
  assert.equal(w(HIBACHI_A1.gun5Step + 8), 0xffae,
    '$2A820C 6600 FFAE -- gun 5 goes BACKWARD, $52 bytes...');
  assert.equal(HIBACHI_A1.gun5Step + 8 + disp16(HIBACHI_A1.gun5Step + 8), HIBACHI_A1.gun5Init,
    '  ...into $2A81BC, its own init');
  assert.equal(w(0x2a8cba), 0x01ca, '$2A8CB8 6600 01CA -- gun $B goes FORWARD, $1CA bytes');
  assert.equal(0x2a8cba + 0x01ca, 0x2a8e84, '  ...to $2A8E84');
});

// ===============================================================================================
// SECTION 5 -- THE ABLATION SECTION.
//
// Each of these exists because a mutation of the constant it names came back GREEN against the
// tests above: the shipped input made the right answer and the wrong answer agree. The fix is
// always a different INPUT, never a weaker assertion.
// ===============================================================================================

test('W407 SECTION 5 (ablation): D0 LOW word is the KIND and its HIGH word the SPEED BIAS, '
  + 'and the two `move.w`s that build it are not interchangeable', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reading the kind out of ($8,A4) and the bias out of ($A,A4) -- the two
  // halves the other way round -- came back GREEN against a test that only counted shots. It
  // is also the confusion W405's gun-8 header had to unpick. Drive a slot whose two words are
  // both small and DIFFERENT, and read both record fields.
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  b.ram.setU16(A4SLOT + 0x08, 0x0007);        // the BIAS half
  b.ram.setU16(A4SLOT + 0x0a, 0x000b);        // the KIND half
  volley1(b);
  const first = rec(b.ram, b.shots[0]);
  assert.equal(first.kind, 0x0b, 'the kind comes out of ($A,A4), the LOW word of D0');
  assert.equal(first.speed, u8(baseSpeed(0x0b) + 0x07),
    '  ...and the speed is that kind base plus ($8,A4), the HIGH word of D0');
  assert.notEqual(first.kind, 0x07, '  ...the two readings really do differ on this input');
  assert.notEqual(first.speed, u8(baseSpeed(0x07) + 0x0b), '  ...in the speed field too');
  // ...and it is ONE `move.l`, so the halves are fixed by the slot layout, not by two loads.
  assert.equal(w(0x2a8d2c), 0x202c, '$2A8D2C `202C` move.l (d16,A4),D0');
  assert.equal(w(0x2a8d2e), 0x0008, '  ...($8,A4), covering ($8,A4) AND ($A,A4)');
  assert.equal(w(0x2a8dd4), 0x202c, '$2A8DD4 -- arm B RELOADS the same longword...');
  assert.equal(w(0x2a8dd6), 0x0008, '  ...so arm B reloads and its nine biases restart at $13');
});

test('W407 SECTION 5 (ablation): the kind walks UP THEN DOWN THEN UP, and the shipped bias '
  + 'ramp is what makes a flat kind visible', { skip: SKIP }, () => {
  // FIRST PASS RESULT: replacing the `subq.w` triple with `addq.w` came back GREEN against a
  // test that only summed the shots. Reading the RECORD's kind field separates them at once,
  // and the four kinds the run really uses are 3..6 -- all of them $2818B4 kinds.
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  volley1(b);
  const kinds = b.shots.slice(0, 9).map((e) => rec(b.ram, e).kind);
  assert.deepEqual(kinds, [3, 4, 5, 6, 5, 4, 3, 4, 5], 'the shipped kind walk');
  assert.notDeepEqual(kinds, [3, 4, 5, 6, 7, 8, 9, 10, 11], '  ...and NOT a monotone ramp');
  const speeds = b.shots.slice(0, 9).map((e) => rec(b.ram, e).speed);
  assert.deepEqual(speeds.map((s, k) => s - u8(baseSpeed(kinds[k]))),
    [0x13, 0x16, 0x19, 0x1c, 0x1f, 0x22, 0x25, 0x28, 0x2b],
    '  ...while the bias, which does NOT turn round, is a strict +3 ramp');
});

test('W407 SECTION 5 (ablation): the two arms have OPPOSITE spreads and opposite steps, and '
  + 'both only show once the counter has moved', { skip: SKIP }, () => {
  // FIRST PASS RESULT: dropping `$2A8DCC neg.b D6` came back GREEN on volley 1, because at
  // n = $B3 the spread is $4 and $80 + 4 - $16k vs $80 - 4 + $16k already differ -- but a test
  // that only compared arm A to itself never saw it. And a mutation that made arm B's step
  // `-$16` like arm A's is invisible at k = 0. Both are read out of the records here.
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  // BOTH bytes, so `$2A8CD2 cmp.b ($5,A4)` still lets the block that seeds ($7,A4) run --
  // setting only ($4,A4) leaves the heading at the template's $00 and hides the base.
  b.ram.setU8(A4SLOT + 0x04, 0x40);
  b.ram.setU8(A4SLOT + 0x05, 0x40);
  volley1(b);
  const all = b.shots.map((e) => rec(b.ram, e));
  const spread = 0xb7 - 0x40;
  assert.equal(all[0].dir, u8(0x80 + spread), 'arm A opens ABOVE the heading, by $B7 - n');
  assert.equal(all[9].dir, u8(0x80 - spread), '  ...and arm B BELOW it, by the same amount');
  assert.equal(all[1].dir, u8(all[0].dir - 0x16), 'arm A steps DOWN by $16');
  assert.equal(all[10].dir, u8(all[9].dir + 0x16), '  ...and arm B steps UP by $16');
  assert.notEqual(all[0].dir, all[9].dir, '  ...so the two arms are distinguishable at k = 0');
  // ...and the two step constants, which are the SAME instruction with different operands.
  assert.equal(w(0x2a8d28), 0x3c3c, '$2A8D28 `3C3C` move.w #imm,D6');
  assert.equal(w(0x2a8d2a), 0x0016, '  ...#$16 for arm A');
  assert.equal(w(0x2a8dd0), 0x3c3c, '$2A8DD0 the same instruction...');
  assert.equal(w(0x2a8dd2), 0xffea, '  ...#$FFEA for arm B, so `sub.b D6,D1` ADDS $16');
  assert.equal(w(0x2a8dcc), 0x4406, '$2A8DCC `4406` neg.b D6 -- and THAT flips the spread');
});

test('W407 SECTION 5 (ablation): the spread base is $B7 and it opens as the counter falls',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: $B7 -> $B8 came back GREEN, because the first volley's spread of $4
    // is the same distance from the heading whichever way it is measured once BOTH arms move
    // together. Two DIFFERENT counter values pin the constant and its direction at once.
    for (const [n, spread] of [[0xb3, 0x04], [0x80, 0x37], [0x00, 0xb7]]) {
      const b = gunBench();
      gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
      b.ram.setU8(A4SLOT + 0x04, n);
      volley1(b);
      const all = b.shots.map((e) => rec(b.ram, e));
      assert.equal(all.length, 18, `counter $${n.toString(16)} fired`);
      assert.equal(u8(all[0].dir - all[9].dir), u8(2 * spread),
        `  ...and the two arms are 2 * ($B7 - $${n.toString(16)}) apart`);
    }
    assert.equal(w(0x2a8d1e), 0x1c3c, '$2A8D1E `1C3C` move.b #imm,D6');
    assert.equal(w(0x2a8d20), 0x00b7, '  ...#$B7');
    assert.equal(w(0x2a8d22), 0x9c2c, '$2A8D22 `9C2C` sub.b (d16,A4),D6');
    assert.equal(w(0x2a8d24), 0x0004, '  ...($4,A4), the VOLLEY COUNTER and not ($2,A4)');
  });

test('W407 SECTION 5 (ablation): gun $B toggles ($3,A5) ONCE A RUN, on the retire tail',
  { skip: SKIP }, () => {
    // FIRST PASS RESULT: deleting the `bchg` came back GREEN, because gun 5 toggles it on its
    // aimed arm and gun 6 and 8 once a volley, and a test written to any of those shapes never
    // looks at the frame gun $B's counter borrows. Gun $B's is on the RETIRE tail, which it
    // shares with the freeze arm, so it fires once in a whole $B4-volley run.
    const b = gunBench({ p1: 0x0000, p2: 0x8000 });   // P1 dead, P2 alive
    b.ram.setU8(REC + 0x03, 0);
    gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
    volley1(b);
    assert.equal(b.shots.length, 18,
      'P1 dead and P2 alive still fires: $2A8CEE bmi falls through to the $810448 test');
    // the toggle is on the RETIRE tail, not per volley, so it has NOT happened yet...
    assert.equal(b.ram.u8(REC + 0x03), 0, '  ...and ($3,A5) is untouched after a volley');
    // ...and it happens exactly once, when the counter borrows.
    b.ram.setU8(A4SLOT + 0x04, 0x00);
    for (let i = 0; i < 6; i++) gunBStep2A8CB2(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.ram.u8(REC + 0x03), 1, 'the borrow ran $2A8E84 and toggled it');
    assert.equal(b.ram.u16(A4SLOT), 0, '  ...and cleared the slot in the same three lines');
    // ...and the byte the exg is decided by is on A5, not A6.
    assert.equal(w(0x2a8ce2), 0x4a2d, '$2A8CE2 `4A2D` tst.b (d16,A5)');
    assert.equal(w(0x2a8ce4), 0x0003, '  ...($3,A5), the same byte $2A8E84 toggles');
  });

test('W407 SECTION 5 (ablation): the eighteen jsr sites are reported in the ROM ORDER, and each '
  + 'is decoded from the image', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reversing the site list inside each arm came back GREEN, because every
  // per-site assertion in SECTION 3 counts 180 either way and SECTION 4 reads the records in
  // PUSH order. The site is what a trace attributes a bullet to, so it is checked here in the
  // order the ROM issues the calls -- and the list is derived from the image, not typed.
  const sites = [];
  for (let a = 0x2a8cb2; a < GUNB_CODE_END; a += 2) {
    if (w(a) === 0x4eb9 && l(a + 2) === HIBACHI_A1.spawn) sites.push(a);
  }
  assert.equal(sites.length, 18, 'eighteen `jsr $2817C2` in gun $B, found by scanning its code');
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  volley1(b);
  assert.deepEqual(b.shots.map((e) => e[0]), sites,
    'and the volley reports them in exactly that ascending order');
  // ...and the two arms really are two contiguous runs of nine, $10 bytes apart inside each.
  for (let k = 1; k < 9; k++) {
    assert.equal(sites[k] - sites[k - 1], 0x10, `arm A site ${k} is $10 past the one before`);
    assert.equal(sites[9 + k] - sites[8 + k], 0x10, `  ...and arm B site ${k}`);
  }
  assert.equal(sites[9] - sites[8], 0x28,
    'the two runs are $28 apart: $2A8DC2..$2A8DE2 is arm B\'s eleven-instruction preamble');
});

test('W407 SECTION 5 (equivalence): WHICH player $2A8CE2 picks is unobservable in gun $B, and '
  + 'here is the proof', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `pickTarget(ram, a5)` -> `pickTarget(ram, a6)` came back GREEN, and
  // unlike gun 9's version of the same mutation NO input separates them. The reason is
  // specific to this gun: `$24270A` returns carry only when BOTH records are dead, which the
  // `exg` cannot change, and the record it picks reaches only `$2422A2`, whose answer
  // `$2A8D10` discards. So the selector decides nothing here. Proved over all eight
  // (P1 alive, P2 alive, selector) combinations rather than asserted.
  const fire = (p1, p2, sel) => {
    const b = gunBench({ p1, p2 });
    b.ram.setU8(REC + 0x03, sel);
    gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
    volley1(b);
    return b.shots.map((e) => rec(b.ram, e)).map((s) => [s.site, s.dir, s.kind, s.speed]);
  };
  for (const p1 of [0x0000, 0x8000]) {
    for (const p2 of [0x0000, 0x8000]) {
      const a = fire(p1, p2, 0);
      const b = fire(p1, p2, 1);
      assert.deepEqual(b, a,
        `P1=${p1 ? 'alive' : 'dead'} P2=${p2 ? 'alive' : 'dead'}: the selector changes nothing`);
      assert.equal(a.length, (p1 || p2) ? 18 : 0,
        '  ...and what DOES decide is whether either record is alive');
    }
  }
  // ...and the byte the port reads is on A5, because that is the byte the ROM reads.
  assert.equal(w(0x2a8ce2), 0x4a2d, '$2A8CE2 `4A2D` tst.b (d16,A5) -- A5, not A6');
  assert.equal(w(0x2a8ce4), 0x0003, '  ...($3,A5)');
  assert.equal(w(0x2a8cea), 0xc149, '$2A8CEA `C149` exg A0,A1 -- and $2A8CF8 undoes it');
  assert.equal(w(0x2a8cf8), 0xc149, '  ...which is why the carry cannot depend on the swap');
});

test('W407 SECTION 5 (equivalence): `$2A8D06 addi.w #$FA00,D0` HAS NO CONSUMER, and the muzzle '
  + 'long that looks like it is a different constant', { skip: SKIP }, () => {
  // FIRST PASS RESULT: mutating the $FA00 aim bias came back GREEN and no input separates it,
  // because the only thing that reads D0 after it is `$2A8D0A jsr $2422A2` and `$2A8D10`
  // throws the answer away. This is a REAL equivalence and is labelled rather than papered
  // over. It is NOT the same number as the muzzle: that is a LONG, in D3, and it is live.
  assert.equal(w(0x2a8d06), 0x0640, '$2A8D06 `0640` addi.w #imm,D0');
  assert.equal(w(0x2a8d08), 0xfa00, '  ...#$FA00, into the aim\'s SELF-Y');
  assert.equal(w(0x2a8d0a), 0x4eb9, '  ...and $2A8D0A is the only instruction that reads it');
  assert.equal(w(0x2a8d10), 0x323c, '  ...whose result $2A8D10 discards');
  // the LIVE one, proved by a record: the bullet really is spawned $600 above the boss.
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  volley1(b);
  assert.equal(rec(b.ram, b.shots[0]).posA, 0x3200, 'the record sits at $3800 - $600');
  assert.equal(l(0x2a8d36), 0xfa000000, '  ...from $2A8D34 move.l #$FA000000,D3, a LONG in D3');
});

test('W407 SECTION 5 (equivalence): D5 reaches no field, because kinds 3..6 all take $2818B4',
  { skip: SKIP }, () => {
    // Gun $B never writes D5. The port passes zero, and that is only honest because every
    // kind it can fire uses a spawn-init that stores D3 and D4 and never D5. Asserted against
    // the cartridge's own dispatch table so the equivalence cannot rot.
    for (const kind of [3, 4, 5, 6]) {
      assert.equal(l(0x2815c6 + 4 * kind), 0x002818b4,
        `$2815C6[${kind}] -> $2818B4, the init that stores D3 and D4 and NOT D5`);
    }
    // ...and the kind really cannot leave 3..6: eight steps of +-1 from ($A,A4) = 3.
    assert.equal(w(HIBACHI_A1.gunBTemplate + 8), 0x0003, 'the shipped ($A,A4) is 3');
  });

test('W407 SECTION 5 (ablation): the countdown is the BORROW, not a zero test, and it reloads '
  + 'from ($6,A4)', { skip: SKIP }, () => {
  // FIRST PASS RESULT: `if (t !== 0) return` -> `if (t > 1) return` was GREEN on the volley
  // pattern, because both fire on the same frames when the reload is 1. Set ($6,A4) to 0 --
  // the value that makes an OFF-BY-ONE reading fire every frame instead of every other one.
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  b.ram.setU8(A4SLOT + 0x02, 0x00);
  b.ram.setU8(A4SLOT + 0x06, 0x00);
  b.ram.setU8(A4SLOT + 0x0c, 0x40);           // keep $2A8E76's #$4 out of these eight frames
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const before = b.shots.length;
    gunBStep2A8CB2(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    frames.push(b.shots.length !== before ? 1 : 0);
  }
  assert.deepEqual(frames, [1, 1, 1, 1, 1, 1, 1, 1],
    'a reload of ZERO fires every frame: `subq.b` borrows from 0 to $FF and `bcs` takes it');
  assert.equal(w(0x2a8cbc), 0x532c, '$2A8CBC `532C` subq.b #$1,(d16,A4)');
  assert.equal(w(0x2a8cc0), 0x6502, '  ...$2A8CC0 `6502` BCS -- the borrow, over the rts');
  assert.equal(w(0x2a8cc4), 0x196c, '$2A8CC4 `196C` move.b (d16,A4),(d16,A4)');
  assert.equal(w(0x2a8cc6), 0x0006, '  ...from ($6,A4)');
  assert.equal(w(0x2a8cc8), 0x0002, '  ...to ($2,A4)');
});

test('W407 SECTION 5 (ablation): the group counter is ($C,A4) with ($D,A4) as its reload, and '
  + 'they only differ once you make them differ', { skip: SKIP }, () => {
  // FIRST PASS RESULT: reading the reload from ($C,A4) instead of ($D,A4) came back GREEN,
  // because `move.w #$404` puts the SAME byte in both. Drive a slot where they differ.
  const b = gunBench();
  gunBInit2A8C9A(b.ram, b.ROM, A4SLOT);
  b.ram.setU8(A4SLOT + 0x0c, 1);
  b.ram.setU8(A4SLOT + 0x0d, 7);
  volley1(b);
  assert.equal(b.ram.u8(A4SLOT + 0x0c), 7, 'the reload came from ($D,A4), not from ($C,A4)');
  assert.equal(b.ram.u8(A4SLOT + 0x02), 4, '  ...and the same pass wrote the $4 gap');
  assert.equal(w(0x2a8e70), 0x196c, '$2A8E70 `196C` move.b (d16,A4),(d16,A4)');
  assert.equal(w(0x2a8e72), 0x000d, '  ...from ($D,A4)');
  assert.equal(w(0x2a8e74), 0x000c, '  ...to ($C,A4)');
  assert.equal(w(0x2a8cac), 0x0404, '  ...and $2A8CAA\'s literal is $0404, which hides it');
});

// ===============================================================================================
// SECTION 6 -- A4 $11 AND A4 $10.
// ===============================================================================================

const A4SLOT4 = SCHED.a4Base;

function a4Bench(id) {
  const ram = new Ram();
  // `$25980C` fills the FIRST EMPTY A4 slot, so the running script has to occupy slot 0 or
  // the hand-over would land on top of it. This is what `$2596C6`'s walk hands the routine.
  ram.setU16(SCHED.a4Base, 0x8000 | id);
  return ram;
}
/** Which A1 id, if any, the slot holds. `$259A18` writes `$8000 | id`. */
const a1Live = (ram) => (ram.u16(SCHED.a1Base) === 0 ? null : ram.u16(SCHED.a1Base) & 0xff);
const a4Live = (ram, slot) => (ram.u16(SCHED.a4Base + slot * SCHED.a4Stride) === 0
  ? null : ram.u16(SCHED.a4Base + slot * SCHED.a4Stride) & 0xff);

test('W407 SECTION 6: A4 $11 waits $60, starts gun $B, re-arms the timer ON THAT FRAME, and '
  + 'hands to $10', { skip: SKIP }, () => {
  const ram = a4Bench(0x11);
  ram.setU16(REC + 0x1a, 0x6270);
  a4Eleven2A6AB6(ram, A4SLOT4, REC, true);        // the init FALLS THROUGH into the step
  assert.equal(ram.u16(A4SLOT4 + 0x02), 0x5f, 'the init writes #$60 and the step spends one');
  for (let i = 0; i < 0x5e; i++) a4Eleven2A6AB6(ram, A4SLOT4, REC, false);
  assert.equal(ram.u16(A4SLOT4 + 0x02), 1, 'after $5E more frames one is left');
  assert.equal(a1Live(ram), null, '  ...and gun $B has NOT started');
  assert.equal(ram.u16(REC + 0x1a), 0x6270, '  ...and the timer is untouched');
  a4Eleven2A6AB6(ram, A4SLOT4, REC, false);
  assert.equal(a1Live(ram), 0x0b, 'the $5F-th step starts A1 gun $B');
  assert.equal(ram.u16(REC + 0x1a), 0x0470,
    '  ...and $2A6AD8 rewrites the HIGH byte of ($1A,A5) on the SAME frame -- $6270 -> $0470');
  // ...which is A4 $D's arrangement, not A4 $F's. Both writes, and where each stands.
  assert.ok(0x2a6ad2 < 0x2a6ad8 && 0x2a6ad8 < 0x2a6ae0,
    '$2A6AD8 is between `jsr $259A18` and `jsr $259A4A` -- the START arm');
  assert.ok(0x2a6a6c > 0x2a6a5e,
    '  ...where A4 $F\'s $2A6A6C is past its own hand-over -- the RETIRE arm');
  // the wait, then the hand-over.
  a4Eleven2A6AB6(ram, A4SLOT4, REC, false);
  assert.equal(a4Live(ram, 0), 0x11, 'while the gun runs the script keeps its own slot');
  ram.setU16(SCHED.a1Base, 0);                    // gun $B retires
  a4Eleven2A6AB6(ram, A4SLOT4, REC, false);
  assert.equal(a4Live(ram, 1), 0x10, 'and the next free A4 slot gets $10');
  assert.equal(a4Live(ram, 0), null, '  ...while $2A6AF8 clr.w (A4) retires this one');
  assert.equal(ram.u16(SCHED.seqPending), 8, '  ...and $2A6AF0 started main sequencer 8');
});

test('W407 SECTION 6: A4 $10 waits $60, starts gun $A, touches NOTHING on A5 and hands to $F',
  { skip: SKIP }, () => {
    const ram = a4Bench(0x10);
    ram.setU16(REC + 0x1a, 0x6270);
    a4Ten2A6A76(ram, A4SLOT4, true);
    for (let i = 0; i < 0x5f; i++) a4Ten2A6A76(ram, A4SLOT4, false);
    assert.equal(a1Live(ram), 0x0a, 'the $5F-th step starts A1 gun $A');
    assert.equal(ram.u16(REC + 0x1a), 0x6270,
      '  ...and phase B\'s death timer is NOT re-armed: $10 has no ($1A,A5) write at all');
    ram.setU16(SCHED.a1Base, 0);
    a4Ten2A6A76(ram, A4SLOT4, false);
    assert.equal(a4Live(ram, 1), 0x0f, 'and it hands BACK to $F, which is what closes the loop');
    assert.equal(ram.u16(SCHED.seqPending), 4,
      '  ...with main sequencer 4, where $11 starts 8');
    // ...stated as what stands in A4 $10's $40 bytes: no `1D7C` anywhere in them.
    let writes = 0;
    for (let a = 0x2a6a76; a < 0x2a6ab6; a += 2) if (w(a) === 0x1d7c) writes += 1;
    assert.equal(writes, 0, 'zero `1D7C move.b #imm,(d16,A5)` in $2A6A76..$2A6AB5');
    assert.equal(w(0x2a6ad8), 0x1d7c, '  ...where A4 $11 has exactly one, at $2A6AD8');
  });

test('W407 SECTION 6: both scripts FREEZE by returning, and the freeze does not eat the count',
  { skip: SKIP }, () => {
    for (const [fn, name] of [[a4Eleven2A6AB6, '$11'], [a4Ten2A6A76, '$10']]) {
      const ram = a4Bench(fn === a4Ten2A6A76 ? 0x10 : 0x11);
      const call = (init) => (fn === a4Ten2A6A76
        ? fn(ram, A4SLOT4, init) : fn(ram, A4SLOT4, REC, init));
      call(true);
      const left = ram.u16(A4SLOT4 + 0x02);
      ram.setU16(HIBACHI_A1.freeze, 1);
      for (let i = 0; i < 20; i++) call(false);
      assert.equal(ram.u16(A4SLOT4 + 0x02), left, `${name}: twenty frozen frames spend nothing`);
      assert.equal(a1Live(ram), null, `  ...${name}: and no gun starts`);
      ram.setU16(HIBACHI_A1.freeze, 0);
      call(false);
      assert.equal(ram.u16(A4SLOT4 + 0x02), left - 1, `  ...${name}: and it resumes, not restarts`);
    }
    // The A4 shape: the test branches FORWARD, to the shared rts, where the A1 guns' identical
    // test branches backward into their own init (and gun $B's forward into its RETIRE).
    for (const [site, target] of [[0x2a6ac8, A4_11_END], [0x2a6a88, A4_10_END]]) {
      assert.equal(w(site) & 0xff00, 0x6600, `$${site.toString(16)} \`66xx\` bne.s`);
      assert.equal(site + 2 + (w(site) & 0xff), target, '  ...FORWARD, to the rts');
    }
  });

// ===============================================================================================
// SECTION 7 -- THE WINDOW.
// ===============================================================================================

test('W407 SECTION 7: ONE new window, 595, bounded three ways and none of them an absence',
  { skip: SKIP }, () => {
    const set = new Map(tables.rom.windows.map(
      (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]));
    assert.equal(set.size, tables.rom.windows.length, 'no duplicate window bases');
    assert.equal(tables.rom.windows.length, 605,
      'W409 CORRECTION: 599 windows, 594 + this wave\'s one + W408\'s gun $A template '
      + 'and W409\'s three A4 script 5 blocks'
      + ' W411 declares $280F34, the collected-impact transform table, so 600. W418 declares the CONTINUE panel\'s two strings and three tables ($2886FC $28870C $28886A $2888B2 $2888DA), so 605.');

    // (1) the `lea` NAMES the base. TRAP 4: extension-word address plus displacement.
    assert.equal(w(HIBACHI_A1.gunBInit), 0x41fa, '$2A8C9A `41FA` lea (d16,PC),A0');
    assert.equal(0x2a8c9c + disp16(0x2a8c9c), HIBACHI_A1.gunBTemplate,
      '  ...(1) $2A8C9C - $2C = $2A8C70');
    // (2) the LENGTH is the `moveq` plus one -- TRAP 2, dbra runs N+1 times.
    assert.equal(w(0x2a8ca2), 0x7004, '$2A8CA2 `7004` moveq #$4,D0');
    assert.equal(w(0x2a8ca4), 0x32d8, '  ...$2A8CA4 `32D8` move.w (A0)+,(A1)+');
    assert.equal(w(0x2a8ca6), 0x51c8, '  ...$2A8CA6 `51C8` dbra');
    assert.equal(0x2a8ca8 + disp16(0x2a8ca8), 0x2a8ca4, '  ...back to the move');
    assert.equal(set.get(HIBACHI_A1.gunBTemplate), 0x0a, '  ...(2) so 5 words, $A bytes');
    // (3) and $2A8C7A -- base + $A -- is a POSITIVE witness: the eight self-pointers.
    assert.equal(HIBACHI_A1.gunBTemplate + 0x0a, GUNB_BLOB, '(3) base + $A is $2A8C7A');
    for (let i = 0; i < 8; i++) {
      assert.equal(l(GUNB_BLOB + i * 4), HIBACHI_A1.gunBInit,
        `  ...$${(GUNB_BLOB + i * 4).toString(16).toUpperCase()} is $002A8C9A`);
    }
    assert.equal(GUNB_BLOB + 0x20, HIBACHI_A1.gunBInit, '  ...and the eighth ends AT the code');
    // ...and the window is NOT widened to cover ($C,A4): that pair is an immediate.
    assert.equal(w(0x2a8caa), 0x397c, '$2A8CAA `397C move.w #$404,($C,A4)` -- an IMMEDIATE');

    // ---- NO OTHER WINDOW. Gun $B reads no muzzle table and no vector table: its D3 is a
    // literal, so the only ROM address the port touches for it is the template.
    assert.equal(
      [...Array((GUNB_CODE_END - HIBACHI_A1.gunBInit) / 2).keys()]
        .map((i) => w(HIBACHI_A1.gunBInit + i * 2))
        .filter((v) => (v & 0xf1ff) === 0x41fa).length, 1,
      'exactly ONE `lea (d16,PC),An` in gun $B\'s whole $1FA bytes, and it is the template one');
    // ...and the two A4 scripts read no ROM data at all.
    for (const [from, to] of [[0x2a6ab6, 0x2a6afc], [0x2a6a76, 0x2a6ab6]]) {
      for (let a = from; a < to; a += 2) {
        assert.notEqual(w(a) & 0xf1ff, 0x41fa,
          `$${a.toString(16)} is not a \`lea (d16,PC)\` -- neither A4 script indexes ROM`);
      }
    }
  });

test('W407 SECTION 7: gun $B, A4 $11 and A4 $10 are PORTED and out of the counted lists',
  { skip: SKIP }, () => {
    assert.deepEqual([...HIBACHI_A1_SCRIPTS], [5, 6, 7, 8, 9, 0x0a, 0x0b],
      'W408 CORRECTION: SEVEN A1 ids are ported now');
    assert.deepEqual([...HIBACHI_GUN_A4_SCRIPTS],
      [0x0a, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x11], '  ...and seven A4');
    assert.equal(HIBACHI_A1_COUNTED[0x0b], undefined, 'A1 $B is no longer counted');
    assert.equal(HIBACHI_END_COUNTED[0x10], undefined, '  ...nor A4 $10');
    assert.equal(HIBACHI_END_COUNTED[0x11], undefined, '  ...nor A4 $11');
    assert.equal(Object.keys(HIBACHI_A1_COUNTED).length + HIBACHI_A1_SCRIPTS.length,
      HIBACHI_A1.pairs, 'ported + counted = fourteen, the whole table');
    // ...and every extent still in the counted list is MEASURED from the table, not typed.
    const above = [];
    for (let i = 0; i < HIBACHI_A1.pairs * 2; i++) above.push(l(HIBACHI_A1.main + i * 4));
    above.push(0x2a92a8);
    for (const id of Object.keys(HIBACHI_A1_COUNTED).map(Number)) {
      const c = HIBACHI_A1_COUNTED[id];
      assert.equal(l(HIBACHI_A1.main + id * 8), c.init, `A1 $${id.toString(16)}.init`);
      const end = Math.min(...above.filter((v) => v > c.step));
      assert.equal(end - c.init, c.bytes, `  ...and its $${c.bytes.toString(16)} bytes`);
    }
  });
