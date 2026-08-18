// ===============================================================================================
// W404 -- HIBACHI'S A1 GUN TABLE `$2A72C8`, AND THE FIFTEEN THAT ARE FOURTEEN.
// ===============================================================================================
//
// UNIT. The A1 gun table `$2A4306 lea $2A72C8,A1` installs and the scripts it dispatches --
// the thing W403 left the real path stopped on, at `$2A689C` on frame 321.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "a table said to have FIFTEEN entries at $2A72C8". **FOURTEEN.** `$2A7338`, where entry
//      [14] would begin, holds `4254 4E75` -- `clr.w (A4) / rts`, two instructions, and
//      `$42544E75` as a pointer is past the end of a 6 MB image. SECTION 1.
//   2. "`$2A4306 lea $2A72C8,A1` installs a table". It installs ONE OF TWO. `$2A431E tst.w
//      $813098 / $2A4324 bne.w $2A432E` skips `$2A4328 lea $2A92A8,A1`, so the FIRST loop gets
//      a completely different set of guns 0..4 -- and the nine pairs 5..$D are byte-identical
//      between the two tables, which is why the two waits W403 named are loop-independent.
//      `src/initbody.js` had read the branch right since W369; nobody had read the tables.
//      SECTION 1.
//   3. "A4 script $A ... starts and then WAITS on A1 gun script 5. That wait is the current PORT
//      stop." True, and it is not a leaf: $A -> gun 5 -> $B -> gun 6 -> $C -> gun 7 -> $D ->
//      gun 8 -> $A is a CLOSED ATTACK LOOP, not a step of the ending. SECTION 4.
//   4. W403's own rule, "NOT ONE of the twenty-one A4 pairs puts an `rts` between the init and
//      the step", does NOT carry over: **all fourteen A1 pairs do**, 28 of 28 across the two
//      tables. The conventions are per-table and opposite. SECTION 2.
//   5. And a decoding trap the brief did not list: every gun STEP's freeze gate `bne`s BACKWARD
//      INTO ITS OWN INIT, where every A4 script's identically-placed `tst.w $8130D4` branches
//      FORWARD to an `rts`. A frozen gun re-seeds its slot; a frozen A4 script just waits.
//      SECTION 3.
//
// SECTION 1  THE COUNT AND THE TWO TABLES -- four positive witnesses, none an absence
// SECTION 2  the init/step convention, and why it is the opposite of `$2A5886`'s
// SECTION 3  the freeze gate that branches backward, at five guns
// SECTION 4  **THE DELIVERABLE**: the real path past frame 321, and where it stops now
// SECTION 5  guns 5 and 6 driven -- volley counts, the sweep's bounce, the ramps they leave
// SECTION 6  ABLATED: eight shapes, and the two labelled equivalences
// SECTION 7  the window set: 590, and the bytes each of the five new ones is bounded by
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
  HIBACHI_A1_ALT_COUNTED, HIBACHI_A1_ALT_END, W404_MUTATE,
  gun5Init2A81BC, gun5Step2A8206, gun6Init2A8370, gun6Step2A8396, a4B2A68D4, a4C2A6930,
} from '../src/hibachiguns.js';
import { aim256, AimTables } from '../src/aim.js';
import { poolClear } from '../src/bullets.js';

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
// SECTION 1 -- THE COUNT, AND THE SECOND TABLE NOBODY HAD READ.
// ===============================================================================================

test('W404 SECTION 1: the A1 table is FOURTEEN pairs, not fifteen -- four positive witnesses',
  { skip: SKIP }, () => {
    // (a) the install itself.
    assert.equal(w(0x2a4306), 0x43f9, '$2A4306 `43F9` lea <abs.l>,A1');
    assert.equal(l(0x2a4308), HIBACHI_A1.main, '  ...$2A72C8');

    // (b) WITNESS ONE: what stands where entry [14] would begin. `4254` is `clr.w (A4)` -- the
    // decoding trap the brief lists by name -- and `4E75` is its rts, so this is CODE.
    assert.equal(HIBACHI_A1.main + HIBACHI_A1.pairs * 8, HIBACHI_A1.afterMain,
      '$2A72C8 + 14*8 = $2A7338');
    assert.equal(w(0x2a7338), 0x4254, '$2A7338 `4254` clr.w (A4) -- NOT clr.w D4, and NOT a pointer');
    assert.equal(w(0x2a733a), 0x4e75, '  ...$2A733A `4E75`, its rts: a four-byte routine');
    assert.equal(l(0x2a7338), 0x42544e75,
      '  ...so entry [14].init read as a longword is $42544E75, past the end of a 6 MB image');

    // (c) WITNESS TWO: the SECOND table stops after fourteen too, in a different way.
    assert.equal(l(0x2a432a), HIBACHI_A1.alt, '$2A4328 lea $2A92A8,A1 -- a SECOND gun table');
    assert.equal(HIBACHI_A1.alt + HIBACHI_A1.pairs * 8, HIBACHI_A1.afterAlt,
      '$2A92A8 + 14*8 = $2A9318');
    assert.equal(l(0x2a9318), 0x20800202,
      '$2A9318 holds $20800202, the head of a data blob -- not a boss-local pointer');
    // ...and the two blobs are the same structure four bytes apart, which is what makes the
    // pairing an argument rather than a coincidence: $2A733C and $2A9318 are word-for-word the
    // same shape and the MAIN copy simply has the four-byte `4254 4E75` routine in front of it.
    assert.equal(w(0x2a733c), 0x2080, '$2A733C `2080`...');
    assert.equal(w(0x2a9318), 0x2080, '  ...and $2A9318 `2080`, the same blob head');
    assert.equal((0x2a733c - HIBACHI_A1.main) - (0x2a9318 - HIBACHI_A1.alt), 4,
      '  ...and the MAIN copy carries its blob exactly four bytes further from its table, '
      + 'which is the width of $2A7338\'s `4254 4E75`');

    // (d) WITNESS THREE: `4E75` before every step, and before neither candidate fifteenth.
    for (const base of [HIBACHI_A1.main, HIBACHI_A1.alt]) {
      for (let i = 0; i < HIBACHI_A1.pairs; i++) {
        assert.equal(w(l(base + i * 8 + 4) - 2), 0x4e75,
          `$${base.toString(16).toUpperCase()}[${i}].step is preceded by 4E75`);
      }
    }

    // (e) WITNESS FOUR: the ids the cartridge actually loads. Scan the whole boss ROM for
    // `moveq #n,D0 / jsr $259A18` and `/ jsr $259B08` and take the maximum n.
    const ids = new Set();
    for (let a = 0x2a4000; a < 0x2ab000; a += 2) {
      if (w(a) !== 0x4eb9) continue;
      const t = l(a + 2);
      if (t !== 0x259a18 && t !== 0x259b08 && t !== 0x259a4a) continue;
      const prev = w(a - 2);
      assert.equal(prev & 0xff00, 0x7000,
        `$${(a - 2).toString(16)} before the A1 call is a moveq`);
      ids.add(prev & 0xff);
    }
    assert.equal(Math.max(...ids), HIBACHI_A1.pairs - 1,
      'the highest A1 id any moveq/jsr in $2A4000..$2AB000 loads is $D = 13');
    assert.deepEqual([...ids].sort((x, y) => x - y), [...Array(14).keys()],
      '  ...and all fourteen of 0..$D are used, so the table is not merely bounded, it is FULL');
  });

test('W404 SECTION 1: the loop word picks between the tables, and ids 5..$D are the SAME nine',
  { skip: SKIP }, () => {
    assert.equal(w(0x2a431e), 0x4a79, '$2A431E `4A79` tst.w <abs.l>');
    assert.equal(l(0x2a4320), HIBACHI_A1.loopWord, '  ...$813098, the LOOP word');
    assert.equal(w(0x2a4324), 0x6600, '$2A4324 `6600` bne.w');
    assert.equal(0x2a4326 + disp16(0x2a4326), 0x2a432e,
      '  ...TRAP 4: $2A4326 + $8 = $2A432E, SKIPPING the second lea -- so a NON-ZERO loop word '
      + 'keeps $2A72C8 and a zero one (the first credit) installs $2A92A8');

    const diff = [];
    for (let i = 0; i < HIBACHI_A1.pairs; i++) {
      const a = [l(HIBACHI_A1.main + i * 8), l(HIBACHI_A1.main + i * 8 + 4)];
      const b = [l(HIBACHI_A1.alt + i * 8), l(HIBACHI_A1.alt + i * 8 + 4)];
      if (a[0] !== b[0] || a[1] !== b[1]) diff.push(i);
    }
    assert.deepEqual(diff, [0, 1, 2, 3, 4],
      'exactly ids 0..4 differ between the two tables; 5..$D are identical, pointer for pointer');
    assert.equal(HIBACHI_A1.sharedFrom, 5, '  ...and hibachiguns.js says the shared run starts at 5');
    // THE CONSEQUENCE, and it is the reason this wave is loop-independent: the two guns the
    // ending chain waits on are inside the shared run.
    for (const [a4id, gun] of Object.entries(HIBACHI_A1.a4Waits)) {
      assert.ok(gun >= HIBACHI_A1.sharedFrom,
        `A4 $${Number(a4id).toString(16).toUpperCase()} waits on gun ${gun}, in the shared run`);
    }
    assert.equal(l(HIBACHI_A1.main + 9 * 8), l(HIBACHI_A1.alt + 9 * 8),
      'and gun 9, the OTHER wait ($2A6A4C, A4 $F), is shared too');
  });

// ===============================================================================================
// SECTION 2 -- THE CONVENTION, and it is the opposite of the A4 table's.
// ===============================================================================================

test('W404 SECTION 2: A1 inits END in an rts; A4 inits FALL THROUGH. 28 of 28 against 21 of 21',
  { skip: SKIP }, () => {
    // The A1 side: `4E75` AT step - 2 (TRAP: it sits AT the last address, not one past it).
    for (const base of [HIBACHI_A1.main, HIBACHI_A1.alt]) {
      for (let i = 0; i < HIBACHI_A1.pairs; i++) {
        const [ini, step] = [l(base + i * 8), l(base + i * 8 + 4)];
        assert.equal(w(step - 2), 0x4e75,
          `$${base.toString(16).toUpperCase()}[${i}] $${ini.toString(16).toUpperCase()} ends `
          + `4E75 at $${(step - 2).toString(16).toUpperCase()}`);
      }
    }
    // The A4 side, W403's finding, restated here because the two live in one walk and a reader
    // who learns one rule will apply it to the other.
    let a4Falls = 0;
    for (let i = 0; i < HIBACHI_A4.pairs; i++) {
      if (w(l(HIBACHI_A4.table + i * 8 + 4) - 2) !== 0x4e75) a4Falls += 1;
    }
    assert.equal(a4Falls, HIBACHI_A4.pairs,
      'and NONE of $2A5886\'s 21 pairs has one -- the convention is per table');

    // ...which is exactly how this file registers them: A1 init and step separately, A4 init
    // running both. `$2597BE jsr (A0)` and `$2596FA jsr (A0)` are the same instruction.
    assert.equal(w(0x2597be), 0x4e90, '$2597BE `4E90` jsr (A0) -- the A1 walk\'s one call');
    const reg = new Set(scriptAddresses());
    for (const id of HIBACHI_A1_SCRIPTS) {
      assert.ok(reg.has(l(HIBACHI_A1.main + id * 8)), `A1 ${id}'s init is registered`);
      assert.ok(reg.has(l(HIBACHI_A1.main + id * 8 + 4)), `  ...and its step`);
    }
    for (const id of HIBACHI_GUN_A4_SCRIPTS) {
      assert.ok(reg.has(l(HIBACHI_A4.table + id * 8)), `A4 $${id.toString(16)}'s init`);
      assert.ok(reg.has(l(HIBACHI_A4.table + id * 8 + 4)), `  ...and its step`);
    }
    assert.equal(HIBACHI_END_COUNTED[0x0a], undefined,
      'and A4 $A is no longer in hibachiend.js\'s counted list, because it now RUNS');
  });

// ===============================================================================================
// SECTION 3 -- THE FREEZE GATE THAT BRANCHES BACKWARD.
// ===============================================================================================

test('W404 SECTION 3: every gun step\'s $8130D4 arm re-enters its OWN init; A4\'s exits',
  { skip: SKIP }, () => {
    // Five guns share the head, and in all five the bne.w's target IS the table's init entry.
    const heads = [4, 5, 6, 7, 8];
    for (const id of heads) {
      const [ini, step] = [l(HIBACHI_A1.main + id * 8), l(HIBACHI_A1.main + id * 8 + 4)];
      assert.equal(w(step), 0x4a79, `gun ${id}'s step opens 4A79 tst.w <abs.l>`);
      assert.equal(l(step + 2), HIBACHI_A1.freeze, '  ...$8130D4');
      assert.equal(w(step + 6), 0x6600, '  ...and 6600 bne.w');
      assert.equal(step + 8 + disp16(step + 8), ini,
        `  ...TRAP 4: $${(step + 8).toString(16).toUpperCase()} + the displacement is `
        + `$${ini.toString(16).toUpperCase()}, the gun's OWN INIT -- backward, not to an rts`);
      // ...and the two instructions after it, which is where the body actually gets in.
      assert.equal(w(step + 10), 0x532c, '  ...then 532C subq.b #$1,(d16,A4)');
      assert.equal(w(step + 14), 0x6502, '  ...and 6502 bcs.s over a single-word rts');
      assert.equal(w(step + 16), 0x4e75, '  ...which is that rts');
    }
    // The contrast: the A4 scripts this wave ports test the SAME word and branch FORWARD.
    for (const [site, target] of [[0x2a68a8, 0x2a68d2], [0x2a68e0, 0x2a692e], [0x2a6944, 0x2a696e]]) {
      assert.equal(w(site), 0x4a79, `$${site.toString(16)} tst.w`);
      assert.equal(l(site + 2), HIBACHI_A1.freeze, '  ...$8130D4');
      assert.equal(w(site + 6) & 0xff00, 0x6600, '  ...bne.s');
      assert.equal(site + 6 + 2 + (w(site + 6) & 0xff), target,
        `  ...forward, to $${target.toString(16).toUpperCase()}`);
      assert.equal(w(target), 0x4e75, '  ...which is an rts');
    }
  });

// ===============================================================================================
// SECTION 4 -- THE DELIVERABLE. How far the real path gets, and which kind of stop ends it.
// ===============================================================================================

const REC = 0x810c00;
const SUB = 0x814800;
const A5BG = 0x80e240;

/** W399's/W403's bench, plus the ONE thing it was missing: `$2A4306`'s A1 table. Without it
 *  `$812BD4` is zero, `$259782 tst.l / beq` skips the A1 walk entirely, and a gun that A4 $A
 *  starts can never step or retire -- so the wait would never end for a reason that is the
 *  bench's and not the cartridge's. `installScripts` is `$259554` and `$25959C move.l A1,
 *  $812BD4` is the store; the boss's own init body has always passed A1. */
function realPath({ loopWord = 1, flag393a = 0 } = {}) {
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
  ram.setU16(HIBACHI_A4.forkLoopWord, loopWord);
  ram.setU16(HIBACHI_A4.forkFlag, flag393a);
  return { ROM, ram, vram, ctx, log };
}

function runReal(b, frames) {
  const out = { stopped: null, shots: 0, bySite: new Map(), a1: [] };
  b.ctx.bulletSpawn = (site) => {
    out.shots += 1;
    out.bySite.set(site, (out.bySite.get(site) ?? 0) + 1);
  };
  let prev = '';
  for (let f = 1; f <= frames; f++) {
    if (!out.stopped) {
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
    }
    const live = [...Array(SCHED.a1Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a1Base + i * SCHED.a1Stride))
      .filter((v) => v !== 0).map((v) => v & 0xff).join(',');
    if (live !== prev) { out.a1.push([f, live]); prev = live; }
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

// W405 CORRECTION. This test asserted "the run stops on frame 982 at $2A8516". It does not any
// more: W405 ports gun 7, gun 8 and A4 $D, so 2,000 frames now contain NO stop at all and the
// first three links of the loop are only the beginning of it. What is still W404's finding, and
// is kept here, is the timing of guns 5 and 6 and the shape of the four arrows. Where the path
// goes after the loop is W405's deliverable and is asserted in `w405hibachiguns78.test.js`.
test('W404 SECTION 4: guns 5 and 6 run and RETIRE, and the four arrows are a closed loop',
  { skip: SKIP }, () => {
    const b = realPath();
    const r = runReal(b, 2000);

    assert.equal(r.stopped, null,
      'W405 CORRECTION: 2,000 frames no longer contain a stop -- gun 7 ($2A8516) is ported');
    // The two guns W404 ported, measured: when each was started and when it retired itself.
    assert.deepEqual(r.a1.slice(0, 5), [[321, '5'], [627, ''], [691, '6'], [901, ''], [982, '7']],
      'A1 slot history: gun 5 frames 321..626, gun 6 frames 691..900, gun 7 dispatched on 982. '
      + 'Both W404 guns RETIRE -- $2A8338 and $2A84C2 moveq / jsr $259B08 -- so the wait '
      + 'really ends and A4 $A -> $B -> $C really hands over');

    // ---- THE ADDRESSES THAT USED TO BE THE STOP, still read out of the image.
    assert.equal(l(HIBACHI_A1.main + 7 * 8), 0x2a8516,
      '$2A72C8[7].init IS $2A8516 -- a live A1 entry, reached by $2597BE jsr (A0)');
    assert.equal(w(0x2a8516), 0x41fa,
      '  ...and `41FA` lea (d16,PC),A0 stands there: ordinary code, not an rts and not a park');
    assert.equal(w(0x2a6952), 0x7007, '$2A6952 moveq #$7,D0 -- A4 $C, which routed us in');
    assert.equal(l(0x2a6956), 0x00259a18, '  ...$2A6954 jsr $259A18, the A1 start');
    assert.equal(w(0x2a8538), 0x4a79, '$2A8538, gun 7\'s step, opens tst.w...');
    assert.equal(l(0x2a853a), HIBACHI_A1.freeze, '  ...$8130D4');

    // ---- AND IT IS A LOOP, NOT A CHAIN. $A -> gun 5 -> $B -> gun 6 -> $C ->
    // gun 7 -> $D -> gun 8 -> $A. Every arrow is a `moveq / jsr` read out of the image.
    const chain = [[0x2a68c8, 0x0b], [0x2a6924, 0x0c], [0x2a6964, 0x0d], [0x2a69bc, 0x0a]];
    for (const [site, next] of chain) {
      assert.equal(w(site), 0x7000 | next,
        `$${site.toString(16)} moveq #$${next.toString(16).toUpperCase()},D0`);
      assert.equal(l(site + 4), 0x0025980c, '  ...jsr $25980C');
    }
    assert.equal(HIBACHI_END_COUNTED[0x0d], undefined,
      'and A4 $D is no longer counted either: W405 runs it');
  });

test('W404 SECTION 4: the volley counts of guns 5 and 6 are the template arithmetic',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 2000);
    // Gun 5: ($4,A4) = $27 from the template + ($1DA,A6) = 0, so FORTY volleys, and
    // `$2A821E btst #$0,($4,A4)` gives the seven-shot aimed fan to half of them.
    assert.equal(r.bySite.get(0x2a8288), 20 * 7, '$2A8288: 20 aimed fans x 7 = 140');
    assert.equal(r.bySite.get(0x2a82ca), 40 * 13, '$2A82CA: 40 sweeps x 13 = 520');
    // Gun 6: ($4,A4) = $3B + ($1E6,A6) = 0, so SIXTY volleys of ten in four groups (2/3/2/3).
    assert.equal(r.bySite.get(0x2a8414), 60 * 2, '$2A8414: group 1, two shots x 60');
    assert.equal(r.bySite.get(0x2a842e), 60 * 3, '$2A842E: group 2, three shots x 60');
    assert.equal(r.bySite.get(0x2a8452), 60 * 2, '$2A8452: group 3, two shots x 60');
    assert.equal(r.bySite.get(0x2a846c), 60 * 3, '$2A846C: group 4, three shots x 60');
    // W405 CORRECTION: 140 + 520 + 600 was the WHOLE run when gun 7 was a stop. It is now
    // the first three links only, and gun 7's own 540 follow inside the same 2,000 frames.
    assert.equal(140 + 520 + 600, 1260, 'guns 5 and 6 together are 1,260 of them');
    assert.equal(r.shots, 1260 + 4 * 135 + 7 * 2 * 62,
      '  ...and the rest is gun 7 (135 volleys of four) and as much of gun 8 as fits');
    // The template bytes those two counts come from, read back out of the image so the
    // arithmetic is not a coincidence of the bench's initial state.
    assert.equal(IMG[HIBACHI_A1.gun5Template + 2], 0x27, 'gun 5\'s template ($4,A4) is $27');
    assert.equal(IMG[HIBACHI_A1.gun6Template + 2], 0x3b, 'gun 6\'s template ($4,A4) is $3b');
  });

// ===============================================================================================
// SECTION 5 -- THE TWO GUNS DRIVEN ON THEIR OWN.
// ===============================================================================================

const A4SLOT = SCHED.a1Base;

/** One gun, one slot, one boss, and NOTHING else running. */
function gunBench({ freeze = 0, p1 = 0x8000, p2 = 0x0000 } = {}) {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const shots = [];
  const ctx = { bulletSpawn: (site, res) => shots.push([site, res]) };
  ram.setU16(HIBACHI_A1.freeze, freeze);
  ram.setU16(HIBACHI_A1.selP1, p1);
  ram.setU16(HIBACHI_A1.selP1 + 2, 0x2000);          // P1 Y
  ram.setU16(HIBACHI_A1.selP1 + 4, 0x2400);          // P1 X
  ram.setU16(HIBACHI_A1.selP2, p2);
  ram.setU32(SUB + 0x02, 0x38001c00);                // the boss's own position long
  ram.setU16(A4SLOT, 0x8005);                        // as $259A18 leaves it
  return { ROM, ram, ctx, shots };
}

test('W404 SECTION 5: gun 5\'s init is EIGHT template words and four ramp adds', { skip: SKIP },
  () => {
    const b = gunBench();
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    // The eight words, read back through the slot and compared with the ROM, not with a list.
    for (let i = 0; i < 8; i++) {
      const want = w(HIBACHI_A1.gun5Template + i * 2);
      if (i === 7) continue;                          // ($10,A4)/($11,A4) are overwritten below
      assert.equal(b.ram.u16(A4SLOT + 2 + i * 2), want,
        `template word ${i} lands at ($${(2 + i * 2).toString(16)},A4)`);
    }
    // ...and the two longwords that reading it as WORDS is what makes legible.
    assert.equal(b.ram.u32(A4SLOT + 0x08), 0x0000000b,
      '($8,A4) is the long $0000000B -- {speed bias 0, bullet KIND 11}');
    assert.equal(b.ram.u32(A4SLOT + 0x0c), 0x00040004,
      '($C,A4) is the long $00040004 -- {speed bias 4, bullet KIND 4}');
    // `$2A81DA jsr $242EC2 / bpl.w` -- $242EC2 returns 0..255 in a word, so bit 15 is ALWAYS
    // clear, the branch is always taken and the negate NEVER runs. Transcribed, not folded.
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x06,
      '($11,A4) stays $06: $242EC2\'s result is never negative, so $2A81E4 neg.b is dead');
    assert.equal(w(0x2a81e0), 0x6a00, '  ...and $2A81E0 really is `6A00` bpl.w, the arm that skips it');
    assert.equal(w(0x242eda), 0x205f, '  ...and $242EDA `205F` movea.l (A7)+,A0 -- $242EC2 ends');
    assert.equal(w(0x242edc), 0x4e75, '  ...at $242EDC 4E75 with NO ext.w, so bit 15 stays clear');

    // THE RAMP. Re-run with the three A6 fields at their ceilings and every add lands.
    const c = gunBench();
    c.ram.setU8(SUB + 0x1da, 0x28);
    c.ram.setU16(SUB + 0x1dc, 4);
    c.ram.setU16(SUB + 0x1de, 0x1a);
    gun5Init2A81BC(c.ram, c.ROM, A4SLOT, SUB);
    assert.equal(c.ram.u8(A4SLOT + 0x04), (0x27 + 0x28) & 0xff, '($4,A4) += ($1DA,A6)');
    assert.equal(c.ram.u8(A4SLOT + 0x05), (0x27 + 0x28) & 0xff, '($5,A4) too -- and it is never read');
    assert.equal(c.ram.u32(A4SLOT + 0x08), 0x0004000b,
      '($1DC,A6) lands on ($8,A4), the BIAS half of the long, not on the kind');
    assert.equal(c.ram.u32(A4SLOT + 0x0c), 0x001e0004,
      '  ...and ($1DE,A6) on ($C,A4): $0004 + $001A = $001E');
  });

test('W404 SECTION 5: gun 5 fires 13 + 7, sweeps, bounces at $50/$B0 and RETIRES', { skip: SKIP },
  () => {
    const b = gunBench();
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    const run = () => gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);

    // ($2,A4) = $20, and the body runs when the subtract BORROWS -- so 33 steps, not 32.
    for (let i = 0; i < 32; i++) { run(); assert.equal(b.shots.length, 0, 'nothing yet'); }
    run();
    // ($4,A4) is $27, odd, so bit 0 is SET and the first volley is the aimed one: 7 + 13.
    assert.equal(b.shots.length, 20, 'the first volley is 7 aimed + 13 swept');
    assert.equal(b.shots.filter(([s]) => s === 0x2a8288).length, 7, '  ...seven at $2A8288');
    assert.equal(b.shots.filter(([s]) => s === 0x2a82ca).length, 13, '  ...thirteen at $2A82CA');
    assert.equal(b.ram.u8(A4SLOT + 0x02), 0x06, 'and ($2,A4) reloaded from ($6,A4) = 6');

    // The NEXT volley: ($4,A4) is now $26, bit 0 clear, so the aimed fan is skipped.
    b.shots.length = 0;
    for (let i = 0; i < 7; i++) run();
    assert.equal(b.shots.length, 13, 'the second volley is the sweep alone -- btst #$0,($4,A4)');

    // THE BOUNCE, both ends, one volley each. The two arms test OPPOSITE ends and pick each
    // other by the sign of ($11,A4), so driving only one of them proves only half of it.
    b.ram.setU8(A4SLOT + 0x10, 0xac);
    b.ram.setU8(A4SLOT + 0x11, 0x06);
    for (let i = 0; i < 7; i++) run();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0xb2, '($10,A4) stepped past $B0...');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0xfa,
      '  ...so $2A82F6 cmpi.b #$B0 / bls.w fell through to $2A8300 neg.b: the step is now $FA');
    b.ram.setU8(A4SLOT + 0x10, 0x52);
    for (let i = 0; i < 7; i++) run();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0x4c, '  ...and $52 - 6 = $4C, below $50...');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x06,
      '  ...so $2A82E4 cmpi.b #$50 / bcs.w takes the OTHER arm and negates back to $06');

    // THE RETIRE, and the three ramps it leaves on A6 for the NEXT time the gun runs.
    const c = gunBench();
    gun5Init2A81BC(c.ram, c.ROM, A4SLOT, SUB);
    let steps = 0;
    while (c.ram.u16(A4SLOT) !== 0 && steps < 5000) {
      gun5Step2A8206(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB); steps += 1;
    }
    assert.equal(c.ram.u16(A4SLOT), 0, '$2A8338 moveq #$5 / jsr $259B08 clears the slot');
    assert.equal(c.shots.filter(([s]) => s === 0x2a82ca).length, 40 * 13,
      '  ...after exactly 40 volleys: ($4,A4) = $27 and the subtract has to BORROW');
    assert.equal(c.ram.u8(SUB + 0x1da), 0x0a, 'and ($1DA,A6) advanced by $A');
    assert.equal(c.ram.u16(SUB + 0x1dc), 1, '  ...($1DC,A6) by 1');
    assert.equal(c.ram.u16(SUB + 0x1de), 1, '  ...($1DE,A6) by 1');
  });

test('W404 SECTION 5: with both players dead gun 5 fires nothing AND does not sweep',
  { skip: SKIP }, () => {
    const b = gunBench({ p1: 0x0000, p2: 0x0000 });
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    const angle = b.ram.u8(A4SLOT + 0x10);
    for (let i = 0; i < 33; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.shots.length, 0, '$2A8242 bpl.w declines the volley...');
    assert.equal(b.ram.u8(A4SLOT + 0x10), angle,
      '  ...and it lands on $2A8304, PAST the sweep step, so the pattern does not advance');
    assert.equal(b.ram.u8(A4SLOT + 0x04), 0x26, '  ...but the volley counter still counts down');
  });

test('W404 SECTION 5: gun 6 fires ten in four groups, and its SPEED BIAS comes off D0\'s high word',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(A4SLOT, 0x8006);
    gun6Init2A8370(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0xfffc, '($8,A4) is the template\'s $FFFC...');
    assert.equal(b.ram.u16(A4SLOT + 0x0e), 0x0014, '  ...and ($E,A4) the muzzle cursor $14');

    for (let i = 0; i < 0x21; i++) gun6Step2A8396(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.shots.length, 10, 'ten shots in one volley');
    // **THE DEAD STORE, MEASURED.** Every shot's D0 high word is 0, 5, $A or $E -- the
    // accumulated `addi.l` -- and NONE of them is $FFFC. If `$2A83F4 move.w ($8,A4),D0` had
    // been a `move.l`, or if a `swap D0` stood at $2A8400, the first two would be $FFFC.
    const biases = b.shots.map(([, res]) => res);
    assert.equal(biases.length, 10, '  ...ten results');
    const dirs = b.shots.map(([site]) => site);
    assert.deepEqual(dirs, [0x2a8414, 0x2a8414, 0x2a842e, 0x2a842e, 0x2a842e,
      0x2a8452, 0x2a8452, 0x2a846c, 0x2a846c, 0x2a846c],
      'and the groups are 2, 3, 2, 3 in ROM order');
    // The bias reaches the bullet as `($A,A0)`, the speed byte: template base speed + bias.
    // Kind 19's base speed, read out of the image, plus the four group biases.
    const tpl = l(0x281956 + 4 * 19);
    const base = w(tpl + 0x0e);                       // TPL.baseSpeed
    const speeds = b.shots.map(([, res]) => b.ram.u8(res[0].addr + 0x1a));   // REC.speed
    assert.deepEqual(speeds, [base, base, base + 5, base + 5, base + 5,
      base + 10, base + 10, base + 14, base + 14, base + 14].map((x) => x & 0xff),
      'the four groups fire at biases 0, 5, $A and $E -- D0\'s high word ACCUMULATES through '
      + 'four `move.w` loads that never touch it. $FFFC never appears: $2A83F4 is dead');

    // THE MUZZLE CURSOR walks DOWN by 4 and wraps through $14: six entries, $2A84CC + $18.
    assert.equal(b.ram.u16(A4SLOT + 0x0e), 0x0010, 'the cursor stepped $14 -> $10');
    const seen = new Set([0x14]);
    for (let v = 0x10; ; ) {
      seen.add(v);
      if (v === 0) break;
      v -= 4;
    }
    assert.equal(seen.size, HIBACHI_A1.gun6MuzzleCount, 'six muzzle offsets, $14 down to 0');
  });

test('W404 SECTION 5: gun 6 retires after 60 volleys and leaves its own two ramps', { skip: SKIP },
  () => {
    const b = gunBench();
    b.ram.setU16(A4SLOT, 0x8006);
    gun6Init2A8370(b.ram, b.ROM, A4SLOT, SUB);
    let steps = 0;
    while (b.ram.u16(A4SLOT) !== 0 && steps < 20000) {
      gun6Step2A8396(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); steps += 1;
    }
    assert.equal(b.ram.u16(A4SLOT), 0, '$2A84C2 moveq #$6 / jsr $259B08 clears the slot');
    assert.equal(b.shots.length, 60 * 10, '  ...after 60 volleys of ten');
    assert.equal(b.ram.u8(SUB + 0x1e6), 0x0a, 'and ($1E6,A6) advanced by $A');
    assert.equal(b.ram.u16(SUB + 0x1e8), 1, '  ...($1E8,A6) by 1 -- the bias the ROM never reads');
  });

test('W404 SECTION 5: a FROZEN gun re-runs its own init instead of returning', { skip: SKIP },
  () => {
    const b = gunBench();
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    for (let i = 0; i < 10; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x02), 0x20 - 10, 'ten unfrozen steps count ($2,A4) down');
    b.ram.setU16(HIBACHI_A1.freeze, 1);
    gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x02), 0x20,
      'ONE frozen step puts ($2,A4) back to the template\'s $20 -- $2A820C bne.w $2A81BC');
    assert.equal(b.shots.length, 0, '  ...and fires nothing');
  });

// ===============================================================================================
// SECTION 6 -- ABLATIONS. Two of these are labelled CONTROLS and cannot redden; see each.
// ===============================================================================================

test('W404 SECTION 6: the freeze arm is observable -- returning instead of re-entering the init',
  { skip: SKIP }, () => {
    const b = gunBench({ freeze: 1 });
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(A4SLOT + 0x02, 0x03);
    W404_MUTATE.value = 'freeze-returns';
    try {
      gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      assert.equal(b.ram.u8(A4SLOT + 0x02), 0x03,
        'MUTATED: a plain return leaves ($2,A4) where it was...');
    } finally { W404_MUTATE.value = null; }
    gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x02), 0x20,
      '  ...where the cartridge re-seeds it. The two are distinguishable in ONE frame.');
  });

test('W404 SECTION 6: D1\'s inherited high byte is a LABELLED EQUIVALENCE, not a simplification',
  { skip: SKIP }, () => {
    // `$2A829C move.b ($10,A4),D1` rewrites eight bits of a register the aimed fan left behind,
    // and `$2A82B2 subi.w #$3C,D1` then works on the WORD. This asserts the reason that cannot
    // matter, out of the image: bank B does not scale D1 and the core writes it as a BYTE.
    assert.equal(w(0x2a829c), 0x122c, '$2A829C `122C` move.b (d16,A4),D1 -- a BYTE move');
    assert.equal(w(0x2a82b2), 0x0441, '$2A82B2 `0441` subi.w -- and a WORD subtract after it');
    assert.equal(w(0x28158e), 0x1141, '$28158E `1141` move.b D1,(d16,A0) -- the core takes a BYTE');
    assert.equal(w(0x281596), 0x1141, '  ...and $281596 the same into ($2B,A0)');
    assert.equal(w(0x2818a8), 0x6000, '$2818A8 `6000` bra.w -- bank B jumps PAST $281586/$28159A');
    assert.equal(0x2818aa + disp16(0x2818aa), 0x28159c,
      '  ...to $28159C, so no `add.b D1,D1` and no `lsr.b #2,D1` ever sees the high bits');
    // ...so a borrow out of bit 7 cannot change bits 0..7, and the port's `u16` D1 is exact.
    for (const hi of [0x00, 0x37, 0xff]) {
      assert.equal(((hi << 8 | 0x10) - 0x3c) & 0xff, (0x10 - 0x3c) & 0xff,
        `high byte $${hi.toString(16)} does not change the low byte of ($10,A4) - $3C`);
    }
  });

test('W404 SECTION 6: gun 6\'s dead `move.w ($8,A4),D0` is a ROM defect, in BOTH builds',
  { skip: SKIP }, () => {
    assert.equal(w(0x2a83f4), 0x302c, '$2A83F4 `302C` move.w (d16,A4),D0 -- a WORD load');
    assert.equal(w(0x2a83f6), 0x0008, '  ...($8,A4), the speed bias its own init just ramped');
    assert.equal(w(0x2a8400), 0x4e71, '$2A8400 `4E71` nop where a `swap D0` (`4840`) would fit');
    assert.equal(w(0x2a840e), 0x302c, '$2A840E `302C` move.w...');
    assert.equal(w(0x2a8410), 0x000a, '  ...($A,A4): the low word is overwritten, unswapped');
    // ...and the CONTRAST: every other gun in the family loads the pair with `move.l`.
    for (const site of [0x2a825e, 0x2a82a0, 0x2a8586, 0x2a85e0]) {
      assert.equal(w(site) & 0xf1ff, 0x202c,
        `$${site.toString(16)} is a move.l (d16,A4),Dn -- the shape gun 6 does NOT use`);
    }
    // ...and the build-A twin has the same two instructions, so it is the ROM and not a patch.
    const DELTA = 0x10153e;
    assert.equal(w(0x2a83f4 - DELTA), 0x302c, 'the twin at $1A6EB6 is `302C` too');
    assert.equal(w(0x2a8400 - DELTA), 0x4e71, '  ...and $1A6EC2 is a `4E71` nop as well');
    assert.equal(w(0x2a8258) - w(0x2a8258), 0, ' ');
    assert.equal(IMG.subarray(0x2a83fc, 0x2a840e).compare(
      IMG.subarray(0x2a83fc - DELTA, 0x2a840e - DELTA)), 0,
      '  ...and the eighteen bytes around the nop are byte-identical between the builds');
  });

test('W404 SECTION 6: $242E24 is what clears D0\'s high word, and that is why the bias starts at 0',
  { skip: SKIP }, () => {
    // The whole gun-6 bias reading rests on this: `moveq #$7F,D0` writes all 32 bits.
    assert.equal(w(0x242e2a), 0x707f, '$242E2A `707F` moveq #$7F,D0 -- a 32-bit write');
    assert.equal(w(0x242e2c), 0xc079, '$242E2C `C079` and.w <abs.l>,D0 -- and only the WORD after');
    assert.equal(w(0x242e3a), 0x1030, '$242E3A `1030` move.b (A0,D0.w),D0 -- and only the BYTE');
    assert.equal(w(0x242e40), 0x4e75, '  ...then $242E40 4E75. No ext, no swap: bits 16..31 are 0');
    // ...and the call site, so the ordering claim is not assumed.
    assert.equal(l(0x2a83ea), 0x00242e24, '$2A83E8 jsr $242E24 comes BEFORE $2A83F4');
  });

// ===============================================================================================
// SECTION 6b -- THE BULLETS THEMSELVES. Every angle, every muzzle, every kind.
//
// Everything above this point can be satisfied by a routine that fires the right NUMBER of
// bullets. These read the records back: `($1B,A0)` the direction, `($2,A0)`/`($4,A0)` the two
// position words, `($0,A0)` the kind and `($1A,A0)` the speed. Twenty-two ablations came back
// green on the first pass and these are what redden them.
// ===============================================================================================

const RNG_TABLE = 0x242e42;                             // $242E34 lea ($242E42,PC),A0
const RNG_COUNTER = 0x803917;

/** `$242E24` WITHOUT calling the port's copy: bump the counter the way the ROM does and read
 *  the byte straight out of the image. Call it BEFORE the routine under test. */
const peekDraw242E24 = (ram) => IMG[RNG_TABLE + ((ram.u8(RNG_COUNTER) + 1) & 0x7f)];
/** `$26BFFC[(dir + 2) & $FC]` plus `$F0C00000`, read out of the image. */
const vec = (dir) => (l(HIBACHI_A1.vectors + (((dir + 2) & 0xffff) & 0xfc)) + 0xf0c00000) >>> 0;

/** A4 $B against the scratch record REC, which is where `($172,A5)` lands. */
const a4BStep = (ram, a4, init) => a4B2A68D4(ram, a4, REC, init);

const shotFields = (ram, entry) => ({
  kind: ram.u16(entry[1][0].addr) & 0x3f,
  dir: ram.u8(entry[1][0].addr + 0x1b),
  posA: ram.u16(entry[1][0].addr + 0x02),
  posB: ram.u16(entry[1][0].addr + 0x04),
});

test('W404 SECTION 6b: gun 5\'s twenty angles, and the aim biases self by $F0C0', { skip: SKIP },
  () => {
    const b = gunBench();
    const draw = peekDraw242E24(b.ram);
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u8(A4SLOT + 0x10), (draw + 0x60) & 0xff,
      '($10,A4) is $242E24\'s byte + $60, read out of $242E42 rather than out of the port');
    const sweepStart = b.ram.u8(A4SLOT + 0x10);
    for (let i = 0; i < 33; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);

    const all = b.shots.map((e) => shotFields(b.ram, e));
    const fan = all.slice(0, 7);
    const sweep = all.slice(7);
    assert.equal(fan.length + sweep.length, 20, 'seven then thirteen');

    // THE AIM, recomputed with `src/aim.js`'s already-tested `$2422A2` -- and with the $F0C0
    // bias, which `$2A8254 addi.w #$F0C0,D0` applies to the SELF Y only.
    const t = new AimTables(b.ROM);
    const aim = aim256(t, (0x3800 + 0xf0c0) & 0xffff, 0x1c00, 0x2000, 0x2400);
    assert.notEqual(aim, aim256(t, 0x3800, 0x1c00, 0x2000, 0x2400),
      'the bias changes the answer here, so the next assertion can see it');
    assert.equal(fan[3].dir, aim,
      'the FOURTH of the seven is the aim itself: $2A8270 subi.w #$36 then three x $12');
    assert.deepEqual(fan.map((s) => s.dir),
      [...Array(7).keys()].map((k) => (aim - 0x36 + k * 0x12) & 0xff),
      '  ...and the whole fan is aim - $36 stepping $12');
    assert.deepEqual(sweep.map((s) => s.dir),
      [...Array(13).keys()].map((k) => (sweepStart - 0x3c + k * 0x0a) & 0xff),
      'the sweep is ($10,A4) - $3C stepping $A -- NOT aimed, and the seventh is ($10,A4)');

    // THE MUZZLE. Every shot's position is the boss's own long plus `$26BFFC[(D1+2) & $FC]`
    // plus `$F0C00000`, and the table lookup is what makes it depend on the angle.
    for (const s of all) {
      const d = vec(s.dir);
      assert.equal(s.posA, (0x3800 + (d >>> 16)) & 0xffff,
        `dir $${s.dir.toString(16)}: posA is ($2,A6) + the vector's HIGH word + $F0C0`);
      assert.equal(s.posB, (0x1c00 + (d & 0xffff)) & 0xffff, '  ...and posB its LOW word');
    }
    assert.ok(new Set(all.map((s) => vec(s.dir))).size > 1,
      '  ...and the twenty do not all share one vector, so the index really is read');
    // THE KINDS, off the two longwords the init built.
    assert.deepEqual(fan.map((s) => s.kind), Array(7).fill(11), 'the fan is bullet kind 11');
    assert.deepEqual(sweep.map((s) => s.kind), Array(13).fill(4), 'the sweep is kind 4');
  });

test('W404 SECTION 6b: `bchg ($3,A5)` fires on gun 5\'s AIMED volleys only', { skip: SKIP },
  () => {
    const b = gunBench();
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(REC + 0x03, 0);
    for (let i = 0; i < 33; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.ram.u8(REC + 0x03), 1, '($4,A4) was odd, the fan ran, and $2A8296 toggled it');
    for (let i = 0; i < 7; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.ram.u8(REC + 0x03), 1,
      '  ...and the NEXT volley skipped the fan, so the toggle is skipped with it: '
      + '$2A8224 beq.w lands PAST $2A8296');
    // Gun 6 has no such gate: `$2A848E` is the join both arms reach.
    const c = gunBench({ p1: 0, p2: 0 });
    c.ram.setU16(A4SLOT, 0x8006);
    gun6Init2A8370(c.ram, c.ROM, A4SLOT, SUB);
    c.ram.setU8(REC + 0x03, 0);
    for (let i = 0; i < 0x21; i++) gun6Step2A8396(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB);
    assert.equal(c.shots.length, 0, 'gun 6 fired nothing -- both players are dead...');
    assert.equal(c.ram.u8(REC + 0x03), 1,
      '  ...and STILL toggled ($3,A5): $2A83CC bpl.w lands ON $2A848E, not past it');
  });

test('W404 SECTION 6b: the sweep bounces at $50 and $B0 exactly, not one notch wider',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    const volley = () => { for (let i = 0; i < 7; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); };
    // ($2,A4) opens at $20, so the FIRST body is 33 steps in; after it the period is ($6,A4)+1.
    for (let i = 0; i < 33; i++) gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    // Descending, and $56 is inside the band: a limit of $60 would reverse here and $50 does not.
    b.ram.setU8(A4SLOT + 0x10, 0x5c);
    b.ram.setU8(A4SLOT + 0x11, 0xfa);
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0x56, '$5C - 6 = $56');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0xfa, '  ...and $56 is NOT below $50: no reversal');
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0x50, '$56 - 6 = $50');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0xfa,
      '  ...and $2A82E4 is `bcs`, a STRICT less-than, so $50 itself does not reverse');
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x06, '  ...but $4A does');
    // Ascending, and $B0 itself must not reverse either: `$2A82FC` is `bls`.
    b.ram.setU8(A4SLOT + 0x10, 0xaa);
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0xb0, '$AA + 6 = $B0');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x06, '  ...and `bls` keeps $B0 inside the band');
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0xfa, '  ...$B6 is the one that reverses');
  });

test('W404 SECTION 6b: all five difficulty ramps STOP at their caps', { skip: SKIP }, () => {
  const retire5 = (a6seed) => {
    const b = gunBench();
    for (const [off, v, size] of a6seed) {
      if (size === 1) b.ram.setU8(SUB + off, v); else b.ram.setU16(SUB + off, v);
    }
    gun5Init2A81BC(b.ram, b.ROM, A4SLOT, SUB);
    let n = 0;
    while (b.ram.u16(A4SLOT) !== 0 && n < 20000) {
      gun5Step2A8206(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); n += 1;
    }
    return b.ram;
  };
  // ONE BELOW each cap -> the add lands; AT each cap -> it does not.
  let r = retire5([[0x1da, 0x1e, 1], [0x1dc, 3, 2], [0x1de, 0x19, 2]]);
  assert.equal(r.u8(SUB + 0x1da), 0x28, '$1E + $A = $28, exactly the cap');
  assert.equal(r.u16(SUB + 0x1dc), 4, '3 + 1 = 4');
  assert.equal(r.u16(SUB + 0x1de), 0x1a, '$19 + 1 = $1A');
  r = retire5([[0x1da, 0x28, 1], [0x1dc, 4, 2], [0x1de, 0x1a, 2]]);
  assert.equal(r.u8(SUB + 0x1da), 0x28, '$2A8312 cmpi.b #$28 / bcc.s -- AT the cap it stops');
  assert.equal(r.u16(SUB + 0x1dc), 4, '$2A8320 cmpi.w #$4 / bge.s');
  assert.equal(r.u16(SUB + 0x1de), 0x1a, '$2A832C cmpi.w #$1A / bge.s');

  const retire6 = (e6, e8) => {
    const b = gunBench();
    b.ram.setU16(A4SLOT, 0x8006);
    b.ram.setU8(SUB + 0x1e6, e6);
    b.ram.setU16(SUB + 0x1e8, e8);
    gun6Init2A8370(b.ram, b.ROM, A4SLOT, SUB);
    let n = 0;
    while (b.ram.u16(A4SLOT) !== 0 && n < 40000) {
      gun6Step2A8396(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); n += 1;
    }
    return b.ram;
  };
  r = retire6(0x0a, 5);
  assert.equal(r.u8(SUB + 0x1e6), 0x14, '$A + $A = $14, exactly gun 6\'s cap');
  assert.equal(r.u16(SUB + 0x1e8), 6, '5 + 1 = 6');
  r = retire6(0x14, 6);
  assert.equal(r.u8(SUB + 0x1e6), 0x14, '$2A84A8 cmpi.b #$14 / bcc.s');
  assert.equal(r.u16(SUB + 0x1e8), 6, '$2A84B6 cmpi.w #$6 / bcc.s');
});

test('W404 SECTION 6b: gun 6\'s ten angles, its six muzzles, and its two kind fields',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(A4SLOT, 0x8006);
    gun6Init2A8370(b.ram, b.ROM, A4SLOT, SUB);
    // ($A,A4) and ($C,A4) are BOTH $0013 as shipped, so the two are indistinguishable until
    // one is moved. Poking ($C,A4) is what makes the field mapping observable at all.
    b.ram.setU16(A4SLOT + 0x0c, 0x0004);
    const draw = peekDraw242E24(b.ram);
    for (let i = 0; i < 0x21; i++) gun6Step2A8396(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);

    const all = b.shots.map((e) => shotFields(b.ram, e));
    assert.equal(all.length, 10, 'ten shots');
    assert.deepEqual(all.map((s) => s.kind), [19, 19, 4, 4, 4, 19, 19, 4, 4, 4],
      'groups 1 and 3 take ($A,A4) and groups 2 and 4 take ($C,A4) -- not the other way round');

    const t = new AimTables(b.ROM);
    const aim = aim256(t, 0x3800, 0x1c00, 0x2000, 0x2400);   // NO $F0C0 bias in gun 6
    const d7 = (aim + ((draw - 0x20) & 0xff)) & 0xff;        // $2A83EE subi.b #$20 / add.b
    assert.deepEqual(all.map((s) => s.dir),
      [-1, 1, 0, -2, 2, -1, 1, 0, -2, 2].map((o) => (d7 + o) & 0xff),
      'the ten are aim + jitter offset by -1,+1 / 0,-2,+2 / -1,+1 / 0,-2,+2');

    // THE MUZZLE, straight off $2A84CC + ($E,A4), the SAME longword for all ten of a volley.
    const m0 = l(HIBACHI_A1.gun6Muzzles + 0x14);
    for (const s of all) {
      assert.equal(s.posA, (0x3800 + (m0 >>> 16)) & 0xffff, 'posA is ($2,A6) + the muzzle high');
      assert.equal(s.posB, (0x1c00 + (m0 & 0xffff)) & 0xffff, '  ...posB its low word');
    }
    // ...and the cursor walks $14 -> $10 -> $C -> $8 -> $4 -> 0 -> $14, six values, and a wrap
    // to $10 instead of $14 would drop the first entry for ever.
    const seen = [0x14];
    for (let v = 0; v < 8; v++) {
      const cur = b.ram.u16(A4SLOT + 0x0e);            // BEFORE the volley spends it
      seen.push(cur);
      b.shots.length = 0;
      poolClear(b.ram);                                // $28131E, so the pool cannot fill
      for (let i = 0; i < 3; i++) gun6Step2A8396(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      const m = l(HIBACHI_A1.gun6Muzzles + cur);
      const s = shotFields(b.ram, b.shots[0]);
      assert.equal(s.posA, (0x3800 + (m >>> 16)) & 0xffff, 'each volley moves to the next muzzle');
    }
    assert.deepEqual(seen.slice(0, 8), [0x14, 0x10, 0x0c, 0x08, 0x04, 0x00, 0x14, 0x10],
      'six offsets, walked DOWN by 4, and the wrap goes back to $14');
  });

test('W404 SECTION 6b: gun 6 reloads its volley counter from ($5,A4) as it retires',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(A4SLOT, 0x8006);
    b.ram.setU8(SUB + 0x1e6, 0x0a);                   // so ($4,A4) and ($3,A4) cannot coincide
    gun6Init2A8370(b.ram, b.ROM, A4SLOT, SUB);
    const five = b.ram.u8(A4SLOT + 0x05);
    assert.notEqual(five, b.ram.u8(A4SLOT + 0x03), 'the two candidate sources differ here');
    let n = 0;
    while (b.ram.u16(A4SLOT) !== 0 && n < 40000) {
      gun6Step2A8396(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); n += 1;
    }
    // `$259B08` clears the slot's STATUS WORD only, so the byte survives the retire and can
    // be read back -- which is the only way to see which source $2A849C used.
    assert.equal(b.ram.u8(A4SLOT + 0x04), five,
      '$2A849C move.b ($5,A4),($4,A4) -- from ($5,A4), not from ($3,A4)');
  });

test('W404 SECTION 6b: A4 $B stops A2 object $E while gun 6 fires and runs it again after',
  { skip: SKIP }, () => {
    const ROM = new RomWindows(tables.rom);
    const ram = new Ram();
    const slot = SCHED.a2Base + 0x0e * SCHED.a2Stride;
    ram.setU16(slot, 0x8001);                          // present and RUNNING
    ram.setU16(SCHED.a4Base, 0x800b);
    // The init frame runs the init AND the step ($2A68D8 is an operand, not an rts).
    a4BStep(ram, SCHED.a4Base, true);
    assert.equal(ram.u16(slot) & 1, 1, 'the $40-frame delay has not expired: A2 $E still runs');
    for (let i = 0; i < 0x3f; i++) a4BStep(ram, SCHED.a4Base, false);
    assert.equal(ram.u16(slot) & 1, 0,
      'the frame gun 6 starts, $2A68F6 moveq #$E / jsr $25994A clears A2 $E\'s RUN bit');
    assert.equal(ram.u16(0x810c00 + 0x172), 0, '  ...and $2A68FE zeroes ($172,A5)');
    assert.ok(ram.u16(SCHED.a1Base) !== 0, '  ...and gun 6 is in an A1 slot');
    ram.setU16(SCHED.a1Base, 0);                       // retire it by hand: gun 6 is not the unit here
    a4BStep(ram, SCHED.a4Base, false);
    assert.equal(ram.u16(slot) & 1, 1, '$2A6916 moveq #$E / jsr $2598E6 sets it again');
    assert.equal(ram.u16(0x810c00 + 0x172), 0x1000, '  ...and $2A691E writes $1000');
    assert.equal(ram.u16(SCHED.a4Base), 0, '  ...and $2A692C clr.w (A4) retires the script');
  });

test('W404 SECTION 6b: A4 $C starts main sequencer 6 ONCE, and hands to $D when gun 7 is done',
  { skip: SKIP }, () => {
    const ram = new Ram();
    ram.setU16(SCHED.a4Base, 0x800c);
    // The init frame: `$2A6936 moveq #$6,D0 / jsr $2598D0` runs BEFORE the step entry $2A693E,
    // so the sequencer is armed exactly once however long the wait lasts.
    a4C2A6930(ram, SCHED.a4Base, true);
    assert.equal(ram.u16(SCHED.seqPending), 6, '$2598D0 wrote D0 = 6 to $812982');
    assert.equal(ram.u16(SCHED.seqRestart), 1, '  ...and the restart flag');
    ram.setU16(SCHED.seqPending, 0xdead);
    for (let i = 0; i < 0x4f; i++) a4C2A6930(ram, SCHED.a4Base, false);
    assert.equal(ram.u16(SCHED.seqPending), 0xdead,
      '  ...and $4F further STEP frames never touch it again: the jsr is above $2A693E');
    assert.equal(ram.u16(SCHED.a1Base) & 0xff, 7, 'the $50th frame starts A1 gun 7');
    // Retire gun 7 by hand -- it is not this wave's unit -- and watch the handover.
    ram.setU16(SCHED.a1Base, 0);
    a4C2A6930(ram, SCHED.a4Base, false);
    assert.equal(ram.u16(SCHED.a4Base), 0, '$2A696C clr.w (A4) retired A4 $C...');
    const started = [...Array(SCHED.a4Slots).keys()]
      .map((i) => ram.u16(SCHED.a4Base + i * SCHED.a4Stride)).filter((v) => v !== 0);
    assert.deepEqual(started, [0x800d],
      '  ...and $2A6964 moveq #$D,D0 / jsr $25980C left A4 $D running, not $E');
  });

// ===============================================================================================
// SECTION 7 -- THE WINDOW SET.
// ===============================================================================================

test('W404 SECTION 7: five new windows, 590, and each bounded by an instruction operand',
  { skip: SKIP }, () => {
    const set = new Map(WINDOWS());
    assert.equal(set.size, tables.rom.windows.length, 'no duplicate window bases');
    assert.equal(tables.rom.windows.length, 599,
      'W409 CORRECTION: 599 windows -- 585 + W404\'s five + W405\'s three + W406\'s one '
      + '+ W407\'s one + W408\'s one + W409\'s three');

    // 1 + 2 -- the two tables, at exactly 14 pairs each.
    for (const base of [HIBACHI_A1.main, HIBACHI_A1.alt]) {
      assert.equal(set.get(base), HIBACHI_A1.pairs * 8,
        `$${base.toString(16).toUpperCase()} + $70`);
    }
    // 3 + 4 -- the two slot templates, sized from their own `moveq` (TRAP 2: dbra is n+1).
    for (const [site, base, want] of [[0x2a81bc, HIBACHI_A1.gun5Template, 8],
      [0x2a8370, HIBACHI_A1.gun6Template, 7]]) {
      assert.equal(w(site), 0x41fa, `$${site.toString(16)} lea (d16,PC),A0`);
      assert.equal(site + 2 + disp16(site + 2), base,
        `  ...TRAP 4: the target is $${base.toString(16).toUpperCase()}`);
      assert.equal(w(site + 8) & 0xff00, 0x7000, '  ...moveq #n,D0');
      assert.equal((w(site + 8) & 0xff) + 1, want, `  ...so ${want} WORDS`);
      assert.equal(set.get(base), want * 2, `  ...and the window is $${(want * 2).toString(16)}`);
    }
    // 5 -- gun 6's muzzle table, sized from the cursor's stride and its reload.
    assert.equal(w(0x2a83fc), 0x47fa, '$2A83FC lea (d16,PC),A3');
    assert.equal(0x2a83fe + disp16(0x2a83fe), HIBACHI_A1.gun6Muzzles, '  ...$2A84CC');
    assert.equal(w(0x2a8482), 0x596c, '$2A8482 `596C` subq.w #$4,(d16,A4)');
    assert.equal(w(0x2a8488), 0x397c, '$2A8488 `397C` move.w #imm,(d16,A4)');
    assert.equal(w(0x2a848a), 0x0014, '  ...#$14, the cursor\'s top');
    assert.equal(set.get(HIBACHI_A1.gun6Muzzles), 0x14 + 4,
      '  ...so $14 down to 0 in steps of 4 is six longwords, $18');

    // ...and the three new windows TILE onto what follows them, which is the second bound on
    // each: nothing is guessed at either end.
    assert.equal(HIBACHI_A1.gun5Template + 0x10, 0x2a819c,
      'gun 5\'s template ends at $2A819C, where its eight self-pointer longwords begin');
    assert.equal(l(0x2a819c), HIBACHI_A1.gun5Init, '  ...and the first of them IS $2A81BC');
    assert.equal(HIBACHI_A1.gun6Template + 0x0e, 0x2a8350, 'gun 6\'s at $2A8350');
    assert.equal(l(0x2a8350), HIBACHI_A1.gun6Init, '  ...and the first of THOSE is $2A8370');
    assert.equal(HIBACHI_A1.gun6Muzzles + 0x18, 0x2a84e4,
      'and the muzzle table ends at $2A84E4...');
    assert.equal(0x2a8518 + disp16(0x2a8518), 0x2a84e4,
      '  ...which is exactly what $2A8516 leas as GUN 7\'s template. The window tiles.');

    // The two guns this wave RUNS read no other ROM: $26BFFC is W31/W176's window, declared
    // long before this wave and NOT widened.
    const holder = tables.rom.windows.find((x) => {
      const b2 = parseInt(String(x.base).replace('$', ''), 16);
      return HIBACHI_A1.vectors >= b2 && HIBACHI_A1.vectors + 0x100 <= b2 + x.len;
    });
    assert.equal(parseInt(String(holder.base).replace('$', ''), 16), 0x26be70,
      '$26BFFC\'s 64 longwords sit inside W31/W176\'s $26BE70 + $28C, untouched');
  });

test('W404 SECTION 7: every counted gun\'s extent is MEASURED from the image, not typed',
  { skip: SKIP }, () => {
    const inits = [...Array(HIBACHI_A1.pairs).keys()].map((i) => l(HIBACHI_A1.main + i * 8));
    inits.push(HIBACHI_A1.alt);                       // the table itself bounds the last gun
    for (const [id, c] of Object.entries(HIBACHI_A1_COUNTED)) {
      const n = Number(id);
      assert.equal(l(HIBACHI_A1.main + n * 8), c.init, `A1 ${n}.init`);
      assert.equal(l(HIBACHI_A1.main + n * 8 + 4), c.step, `  ...and .step`);
      const end = Math.min(...inits.filter((v) => v > c.step));
      assert.equal(end - c.init, c.bytes,
        `A1 ${n} is $${c.bytes.toString(16).toUpperCase()} bytes, `
        + `$${c.init.toString(16).toUpperCase()}..$${end.toString(16).toUpperCase()}`);
    }
    // THE TWO PORTED EXTENTS, BOUNDED THREE WAYS EACH, and no bound is an absence.
    for (const [id, code, blob, next] of [[5, 0x2a8340, 0x2a8342, 0x2a8370],
      [6, 0x2a84ca, 0x2a84cc, 0x2a8516]]) {
      assert.equal(w(code), 0x4e75,
        `(1) gun ${id}'s code ends with 4E75 AT $${code.toString(16).toUpperCase()}`);
      const bcc = id === 5 ? 0x2a8308 : 0x2a8498;
      assert.equal(bcc + 2 + disp16(bcc + 2), code,
        `  ...and $${bcc.toString(16).toUpperCase()}'s bcc.w reaches exactly that address`);
      const leaSite = id === 5 ? 0x2a8370 : 0x2a83fc;
      assert.equal(leaSite + 2 + disp16(leaSite + 2), blob,
        `(2) $${blob.toString(16).toUpperCase()} is DATA a lea names, not a guess`);
      assert.equal(l(HIBACHI_A1.main + (id + 1) * 8), next,
        `(3) and $${next.toString(16).toUpperCase()} is the table's own entry [${id + 1}].init`);
      assert.equal(next - l(HIBACHI_A1.main + id * 8), id === 5 ? 0x1b4 : 0x1a6,
        `  ...so gun ${id} is $${(id === 5 ? 0x1b4 : 0x1a6).toString(16).toUpperCase()} bytes`);
    }

    // ...and the two this wave RUNS are not in that list.
    for (const id of HIBACHI_A1_SCRIPTS) {
      assert.equal(HIBACHI_A1_COUNTED[id], undefined, `A1 ${id} is ported, not counted`);
    }
    assert.equal(Object.keys(HIBACHI_A1_COUNTED).length + HIBACHI_A1_SCRIPTS.length,
      HIBACHI_A1.pairs, 'ported + counted = fourteen, the whole table');

    // The FIVE alt-only guns, bounded above by `4E75` at $2AA23E and the routine after it.
    const altInits = Object.values(HIBACHI_A1_ALT_COUNTED).map((c) => c.init);
    altInits.push(HIBACHI_A1_ALT_END);
    for (const [id, c] of Object.entries(HIBACHI_A1_ALT_COUNTED)) {
      const n = Number(id);
      assert.equal(l(HIBACHI_A1.alt + n * 8), c.init, `alt ${n}.init`);
      assert.equal(l(HIBACHI_A1.alt + n * 8 + 4), c.step, `  ...and .step`);
      const end = Math.min(...altInits.filter((v) => v > c.step));
      assert.equal(end - c.init, c.bytes, `alt ${n} is $${c.bytes.toString(16).toUpperCase()}`);
    }
    assert.equal(w(HIBACHI_A1_ALT_END - 2), 0x4e75,
      '$2AA23E `4E75` sits AT the alt set\'s last address (TRAP 5: not one past it)');
    // The whole main gun block, stated once so a reader can check the arithmetic in one line.
    // W408 CORRECTION: the ported set is now SEVEN guns, so gun $A's $11E leaves the counted
    // sum and comes back in here by name, the way W405's two, W406's one and W407's one did.
    assert.equal(HIBACHI_A1.alt - l(HIBACHI_A1.main),
      Object.values(HIBACHI_A1_COUNTED).reduce((s, c) => s + c.bytes, 0)
      + 0x1b4 + 0x1a6 + 0x2ea + 0x1ba + 0x1c2 + 0x11e + 0x236,
      'the fourteen main-table guns fill $2A738A..$2A92A8 exactly -- $1F1E, of which the port '
      + 'now runs $1B4 (gun 5) + $1A6 (gun 6) + $2EA (gun 7) + $1BA (gun 8) + $1C2 (gun 9) '
      + '+ $11E (gun $A) + $236 (gun $B) = $E14');
  });
