// W303: `$25B412`, the high-score screen as a state routine, plus the last two of
// `$25B492`'s eleven `bsr`s and `$246710`.
//
// The three things here that a reading can get wrong and a test can catch: the frame's blink
// gate, the two exits that differ only in the carry, and whether `$246710` is really
// `$24652A` plus one constant.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import { chainLoader24652A, chainLoader246710, chainCheck24681A } from '../src/stageend.js';
import {
  SCREEN, SCREEN_STATE, SCREEN_COLUMNS, LABEL_TABLE, FRAME_STUB_RTS,
  drawFrame25B4D6, drawRowLabels25B54C, hiscoreScreen25B412,
} from '../src/hiscorescreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const MAIN = HAVE ? resolveEmitStub(ROM, SCREEN.emit).bucket : 0;
const FRAME = HAVE ? resolveEmitStub(ROM, 0x23dece).bucket : 0;
const count = (ram, bucket) => ram.u16(BUCKETS[bucket].counter) / 12;
const arts = (ram, bucket) => Array.from({ length: count(ram, bucket) },
  (_, i) => ram.u32(BUCKETS[bucket].buffer + i * 12 + 4));

function factory() {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
}
const world = () => {
  const log = new UnportedLog();
  return { log, ctx: { rom: ROM, unported: log, unportedLog: log, notes: log } };
};

// ==================== 1. THE FRAME, AND ITS BLINK

test('W303 the frame uses a different STUB but the SAME bucket', { skip: SKIP }, () => {
  // `$23DECE`, not `$23DFB4`. The natural assumption is that two stub addresses mean two draw
  // layers, and MEASURED they do not -- both resolve to the same bucket. Which matters for a
  // reason: with all eleven `bsr`s feeding one bucket, the `bsr` ORDER is the draw order, and
  // that is why `$25B492` calls the frame and the labels before any data column.
  assert.notEqual(0x23dece, SCREEN.emit, 'two distinct stub addresses');
  assert.equal(FRAME, MAIN, 'and one bucket behind both of them');
  const ram = factory();
  drawFrame25B4D6(ram, ROM);
  assert.ok(count(ram, MAIN) > 0, 'so the frame lands in the shared bucket');
  assert.equal(SCREEN_COLUMNS[0].site, 0x25b4d6, 'and it is drawn first, under the data');
  assert.equal(SCREEN_COLUMNS[1].site, 0x25b54c);
});

test('W303 the third frame element BLINKS on `$80390C`', { skip: SKIP }, () => {
  // `$25B50A tst.w $80390C / beq $25B52C`. `$80390C` is the global phase word `bee.js` calls
  // `collisionPhase`; dropping the gate renders the element permanently lit.
  const off = factory();
  off.setU16(0x80390c, 0);
  drawFrame25B4D6(off, ROM);
  const on = factory();
  on.setU16(0x80390c, 1);
  drawFrame25B4D6(on, ROM);
  assert.equal(count(off, FRAME), 3, 'phase 0 draws three parts');
  assert.equal(count(on, FRAME), 4, 'phase 1 draws four');
  assert.ok(!arts(off, FRAME).includes(0x333e54), 'and $333E54 is the one that blinks');
  assert.ok(arts(on, FRAME).includes(0x333e54));
});

test('W303 the frame\'s four parts are the ROM\'s four immediates', { skip: SKIP }, () => {
  const ram = factory();
  ram.setU16(0x80390c, 1);
  drawFrame25B4D6(ram, ROM);
  assert.deepEqual(arts(ram, FRAME), [0x3216c0, 0x3326a8, 0x333e54, 0x3329ac]);
});

test('W303 `$25B4EC bsr $25B54A` calls an immediate `rts`', { skip: SKIP_IMG }, () => {
  // Three bare `rts` bytes in a row at $25B546, $25B548 and $25B54A: the first is the frame's
  // own exit and the other two are spares. So the call is LIVE and the callee does nothing --
  // a stubbed-out feature, not a missing routine, which is why it is not a counted gap.
  assert.equal(FRAME_STUB_RTS, 0x25b54a);
  for (const a of [0x25b546, 0x25b548, 0x25b54a]) {
    assert.equal(IMG.readUInt16BE(a), 0x4e75, `$${a.toString(16).toUpperCase()} is rts`);
  }
  assert.equal(IMG.readUInt16BE(0x25b4ec), 0x6100, '$25B4EC really is a bsr.w');
  assert.equal(0x25b4ee + IMG.readInt16BE(0x25b4ee), FRAME_STUB_RTS, 'and it lands on one');
});

// ==================== 2. THE ROW LABELS

test('W303 the row labels are FIVE longs indexed by the row itself', { skip: SKIP }, () => {
  // `move.l ($18,PC,D6.w),D2` with `addq.w #4,D6`, extension word at $25B560, so the base is
  // $25B578 -- and $25B58C being the next routine is what pins it at five.
  assert.equal(LABEL_TABLE, 0x25b578);
  const ram = factory();
  drawRowLabels25B54C(ram, ROM);
  assert.equal(count(ram, MAIN), 5);
  assert.deepEqual(arts(ram, MAIN),
    [0, 1, 2, 3, 4].map((i) => ROM.u32(LABEL_TABLE + i * 4)));
  // Five distinct markers, which is what makes them 1ST..5TH rather than one repeated glyph.
  assert.equal(new Set(arts(ram, MAIN)).size, 5);
});

test('W303 the label table stops before `$25B58C`', { skip: SKIP_IMG }, () => {
  // The window is $14 and the routine after it starts with `lea $803888.l,A6` -- `4DF9`.
  assert.equal(IMG.readUInt16BE(LABEL_TABLE + 0x14), 0x4df9, '$25B58C is the next routine');
});

// ==================== 3. `$246710` IS `$24652A` PLUS ONE CONSTANT

// W389 REWROTE THIS TEST, and the reason is a fact about the ROM this file had wrong.
//
// The old assertion was a whole-RAM byte compare between `$24652A` and `$246710` demanding that
// the ONLY differing bytes be the `($1E)` words. That was true of the port because NEITHER
// loader seeded content. It was never true of the cartridge. W389 disassembled `$24652A`'s own
// content block, `$246582..$2465D9`, and it exists and it is a DIFFERENT SHAPE:
//
//   246598  2558 000a   move.l (A0)+,($A,A2)          <- $24652A: the target comes FROM THE SCRIPT
//   24677E  257c 0024 6bb8 000a                       <- $246710: the target is the CONSTANT
//
// so `$24652A`'s script is SIX words per node and `$246710`'s is FOUR. Feeding one loader's
// script to the other is meaningless, and `SCREEN_STATE.script` is a FOUR-word script. Now that
// `$246710` really seeds, the byte compare could only pass by keeping `$246710` hollow.
//
// What survives, and is the claim the section heading was reaching for, is that the POOL
// LIFECYCLE halves are the same instruction sequence apart from `($1E,node)`. That is asserted
// field by field below, which is stronger than a byte compare that could not tell the two halves
// apart in the first place.
test('W303 the two loaders\' POOL LIFECYCLE halves differ only in `($1E,node)`', { skip: SKIP },
  () => {
    const a = new Ram();
    const b = new Ram();
    const w = world();
    const ha = chainLoader24652A(a, ROM, SCREEN_STATE.script);
    const hb = chainLoader246710(b, ROM, SCREEN_STATE.script, w.ctx);
    assert.equal(ha, hb, 'the same player slot');
    assert.notEqual(ha, 0xffffffff, 'and it succeeded');
    assert.equal(a.u16(ha + 0x04), b.u16(hb + 0x04), 'and the same ($4,slot), both D6 = 0');

    // The lifecycle fields, the ones both bodies write outside their content blocks:
    // ($0) the claim, ($2), ($20), ($2C) the link, ($18) the lifetime -- and ($1E), the one.
    let na = a.u32(ha + 0x2c), nb = b.u32(hb + 0x2c), n = 0;
    while (na !== 0 && nb !== 0) {
      assert.equal(na, nb, `node ${n} is the same pool slot in both`);
      assert.equal(a.u16(na + 0x00), b.u16(nb + 0x00), `node ${n} ($0) claim word`);
      assert.equal(a.u16(na + 0x02), b.u16(nb + 0x02), `node ${n} ($2)`);
      assert.equal(a.u16(na + 0x20), b.u16(nb + 0x20), `node ${n} ($20) progress`);
      assert.equal(a.u32(na + 0x2c), b.u32(nb + 0x2c), `node ${n} ($2C) link`);
      assert.equal(a.u32(na + 0x18), b.u32(nb + 0x18), `node ${n} ($18) lifetime $FFFF0000`);
      assert.equal(a.u32(na + 0x18), 0xffff0000, `  ...and it really is $FFFF0000`);
      // THE ONE. $246576 writes #$0 where $246762 writes #$1.
      assert.equal(a.u16(na + 0x1e), 0, `node ${n} ($1E) is 0 under $24652A`);
      assert.equal(b.u16(nb + 0x1e), 1, `node ${n} ($1E) is 1 under $246710`);
      na = a.u32(na + 0x2c); nb = b.u32(nb + 0x2c); n++;
    }
    assert.equal(n, SCREEN_STATE.scriptNodes, 'both built all eight nodes');
  });

test('W303 the two CONTENT blocks are different shapes, which is why the fold is per-head',
  { skip: SKIP_IMG }, () => {
    // The instruction that makes them different, read off the image. Trap 1: the immediate
    // operand comes BEFORE the displacement, so `$246780..$246783` is the long and `$246784` is
    // the `($A,A2)` displacement.
    assert.equal(IMG.readUInt16BE(0x246598), 0x2558, '$246598 move.l (A0)+,(d16,A2)');
    assert.equal(IMG.readUInt16BE(0x24659a), 0x000a, '  ...into ($A,A2) -- FROM THE SCRIPT');
    assert.equal(IMG.readUInt16BE(0x24677e), 0x257c, '$24677E move.l #imm,(d16,A2)');
    assert.equal(IMG.readUInt32BE(0x246780), 0x246bb8, '  ...the CONSTANT $246BB8');
    assert.equal(IMG.readUInt16BE(0x246784), 0x000a, '  ...into the same ($A,A2)');
    // Both content blocks index the SAME two tables, which is what makes them the same routine
    // in two shapes rather than two routines. Trap 4: extension-word address plus displacement.
    assert.equal(0x246586 + (IMG.readUInt16BE(0x246586) - 0x10000), 0x24627a,
      '$246584 lea (-$30C,PC),A3 -> $24627A, the same dispatch table $24676A reaches');
    assert.equal(0x2465ac + IMG.readUInt16BE(0x2465ac), 0x246b38,
      '$2465AA lea ($58C,PC),A3 -> $246B38, the same timing table');
    // So the script strides differ by exactly the four bytes of that long.
    assert.equal(6 * 2 - 4 * 2, 4, '$24652A reads six words per node where $246710 reads four');
  });

test('W303 `$246710` sets `($1E,node)` to ONE on every node it builds', { skip: SKIP }, () => {
  const ram = new Ram();
  const w = world();
  const slot = chainLoader246710(ram, ROM, SCREEN_STATE.script, w.ctx);
  let node = ram.u32(slot + 0x2c);
  let n = 0;
  while (node !== 0) {
    assert.equal(ram.u16(node + 0x1e), 1, `node ${n} carries the 1`);
    assert.equal(ram.u32(node + 0x18), 0xffff0000, 'and the shared lifetime');
    node = ram.u32(node + 0x2c);
    n++;
  }
  assert.equal(n, SCREEN_STATE.scriptNodes, 'eight nodes, as the script\'s count word says');
});

// W389 INVERTED THIS TEST. It asserted that `$246710`'s content seeding raised a counted note --
// which is precisely the behaviour this wave removes, so the assertion could not survive. The
// replacement asserts the stronger property the note was standing in for: the block is PORTED,
// the census is silent about it, and the field it was missing is really written.
test('W303 the content seeding is PORTED, and no note is left claiming otherwise', { skip: SKIP },
  () => {
    const ram = new Ram();
    const w = world();
    const slot = chainLoader246710(ram, ROM, SCREEN_STATE.script, w.ctx);
    for (const line of w.log.report()) {
      assert.ok(!line.includes('$24676A'), `no $24676A note may remain: ${line}`);
      assert.ok(!/246710.*CONTENT/i.test(line), `no $246710 content note may remain: ${line}`);
    }
    // AND THE FIELD ITSELF. `($6,node)` is the executor pointer `runAnimObjects24683E` tests;
    // zero there is exactly the hollow chain W388 found.
    let node = ram.u32(slot + 0x2c), n = 0;
    while (node !== 0) {
      assert.equal(ram.u32(node + 0x06), n === 7 ? 0x80fa68 : 0x80fa66,
        `node ${n} carries $24627A[family]+$4, the dirty word -- node 7 is the family-$08 one`);
      assert.equal(ram.u32(node + 0x0a), 0x246bb8, `node ${n} target is the constant $246BB8`);
      assert.equal(ram.u16(node + 0x04), 0x1f, `node ${n} covers $20 words`);
      node = ram.u32(node + 0x2c); n++;
    }
    assert.equal(n, SCREEN_STATE.scriptNodes, 'all eight seeded');
  });

test('W303 the chain script is EIGHT nodes of four words after the count', { skip: SKIP_IMG }, () => {
  // `$246710` reads one word for the count and four per node, so the run is 2 + 8*8 = $42.
  // That is what sizes the window, and the bytes after it are not part of it.
  assert.equal(IMG.readUInt16BE(SCREEN_STATE.script), SCREEN_STATE.scriptNodes);
  assert.equal(ROM.u16(SCREEN_STATE.script), 8, 'and the window can read it');
  // Node 7 starts at `script + 2 + 7*8` = `+$3A`, so its four words are at $3A, $3C, $3E and
  // $40 -- and `+$40` is the LAST word the window has to reach.
  assert.equal(ROM.u16(SCREEN_STATE.script + 0x3e), 0x001f, 'node 7\'s third word');
  assert.equal(ROM.u16(SCREEN_STATE.script + 0x40), 0x0002, 'and its fourth closes the run');
  // Seven nodes share code index 0 with a rising offset and the eighth uses index 8.
  const idx = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ROM.u16(SCREEN_STATE.script + 2 + i * 8));
  assert.deepEqual(idx, [0, 0, 0, 0, 0, 0, 0, 8]);
});

// ==================== 4. THE STATE MACHINE AND ITS TWO EXITS

test('W303 states 0 and 1 both draw, and the states fall THROUGH', { skip: SKIP }, () => {
  // Each `cmpi` falls into the next state's test rather than branching away, so one call can
  // advance twice: state 0 frees a finished chain and goes to 1, and state 1's timer runs in
  // the same call. A port that returned after each state would take an extra frame per step.
  const ram = factory();
  const w = world();
  ram.setU16(SCREEN_STATE.state, 0);
  ram.setU32(SCREEN_STATE.handle, 0x810346);   // a player slot with no chain -> check is 0
  ram.setU16(SCREEN_STATE.timer, 3);
  assert.equal(hiscoreScreen25B412(ram, ROM, w.ctx), true, 'still running');
  assert.equal(ram.u16(SCREEN_STATE.state), 1, 'state 0 advanced');
  assert.equal(ram.u16(SCREEN_STATE.timer), 2, 'and state 1 ran in the SAME call');
  assert.ok(count(ram, MAIN) > 0, 'and the screen drew');
});

test('W303 state 1 loads the chain when its timer reaches zero', { skip: SKIP }, () => {
  const ram = factory();
  const w = world();
  ram.setU16(SCREEN_STATE.state, 1);
  ram.setU16(SCREEN_STATE.timer, 1);
  hiscoreScreen25B412(ram, ROM, w.ctx);
  assert.equal(ram.u16(SCREEN_STATE.state), 2, 'and it moved to state 2');
  const handle = ram.u32(SCREEN_STATE.handle);
  assert.notEqual(handle, 0xffffffff, 'the load succeeded');
  assert.notEqual(chainCheck24681A(ram, handle), 0, 'and the new chain is alive');
});

test('W303 the finished exit returns carry CLEAR and does NOT draw', { skip: SKIP }, () => {
  // `$25B48E bra $25B4C8` is the only path that skips the eleven `bsr`s, and `$25B4D2
  // move.w D0,D0` is what clears the carry. `move.w D0,D0` reads as a no-op; a port that
  // treated it as dead code would leave the caller's carry unchanged and the screen would
  // never end.
  const ram = factory();
  const w = world();
  ram.setU16(SCREEN_STATE.state, 2);
  ram.setU32(SCREEN_STATE.handle, 0x810346);   // an empty slot -> the chain has finished
  assert.equal(hiscoreScreen25B412(ram, ROM, w.ctx), false, 'finished');
  assert.equal(count(ram, MAIN), 0, 'and nothing was drawn on that frame');
  assert.equal(count(ram, FRAME), 0);
});

test('W303 state 2 keeps drawing while its chain is alive', { skip: SKIP }, () => {
  const ram = factory();
  const w = world();
  ram.setU16(SCREEN_STATE.state, 1);
  ram.setU16(SCREEN_STATE.timer, 1);
  hiscoreScreen25B412(ram, ROM, w.ctx);        // loads the chain, state -> 2
  const fresh = new Ram(Uint8Array.from(ram.b));
  fresh.setU16(BUCKETS[MAIN].counter, 0);
  fresh.setU16(BUCKETS[FRAME].counter, 0);
  assert.equal(hiscoreScreen25B412(fresh, ROM, w.ctx), true, 'still running');
  assert.equal(fresh.u16(SCREEN_STATE.state), 2, 'and still in state 2');
  assert.ok(count(fresh, MAIN) > 0, 'and it drew');
});

test('W303 the end cue is counted, and it is one tally.js already names', { skip: SKIP }, () => {
  const ram = factory();
  const w = world();
  ram.setU16(SCREEN_STATE.state, 2);
  ram.setU32(SCREEN_STATE.handle, 0x810346);
  hiscoreScreen25B412(ram, ROM, w.ctx);
  const hit = w.log.report().find((r) => r.includes('$28C170'));
  assert.ok(hit, '$28C170 is counted');
  assert.match(hit, /cueA/, 'and pointed at where the port already knows it');
  assert.equal(SCREEN_STATE.endCue, 0x28c170);
});

test('W303 `$25B492` is now ELEVEN of eleven', { skip: SKIP }, () => {
  // The whole draw exists. What is left of the screen is what writes the name, not what
  // shows it.
  assert.equal(SCREEN_COLUMNS.length, 11);
  assert.equal(SCREEN_STATE.site, 0x25b412);
  assert.equal(SCREEN_STATE.caller, 0x25a938, 'and it has exactly one caller');
});
