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

test('W303 both loaders build the same chain, differing only in `($1E,node)`', { skip: SKIP }, () => {
  // The whole difference in the pool lifecycle. `$246762` writes #$1 where `$246576` writes
  // #$0, and everything else -- the three-slot scan, the twenty-slot pool, the `($2C)` link,
  // the `$FFFF0000` lifetime -- is the same instruction sequence.
  const a = new Ram();
  const b = new Ram();
  const w = world();
  const ha = chainLoader24652A(a, ROM, SCREEN_STATE.script);
  const hb = chainLoader246710(b, ROM, SCREEN_STATE.script, w.ctx);
  assert.equal(ha, hb, 'the same player slot');
  assert.notEqual(ha, 0xffffffff, 'and it succeeded');
  // Byte-compare the whole of RAM: the ONLY differences may be the `($1E)` words.
  const diffs = [];
  for (let i = 0; i < a.b.length; i++) if (a.b[i] !== b.b[i]) diffs.push(i + 0x800000);
  assert.ok(diffs.length > 0, 'they do differ');
  // Every differing byte must be inside the `($1E)` word of some pool node: the pool base is
  // `$80FA86` with stride `$70`, so the offset within a node has to be $1E or $1F.
  for (const addr of diffs) {
    const within = (addr - 0x80fa86) % 0x70;
    assert.ok(within === 0x1e || within === 0x1f,
      `$${addr.toString(16)} is offset $${within.toString(16)} in its node, not ($1E)`);
  }
  assert.equal(diffs.length, SCREEN_STATE.scriptNodes,
    'one differing byte per node -- the low half of each ($1E) word');
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

test('W303 the content seeding is COUNTED, not invented', { skip: SKIP }, () => {
  // `$24652A`'s own comment declares the per-node content tier out of scope for the anim
  // driver's sake. `$246710`'s is larger -- four script words per node through the `$24627A`
  // and `$246B38` tables -- and it is counted for the same reason rather than guessed at.
  const ram = new Ram();
  const w = world();
  chainLoader246710(ram, ROM, SCREEN_STATE.script, w.ctx);
  const hit = w.log.report().find((r) => r.includes('$246710'));
  assert.ok(hit, 'the note exists');
  assert.match(hit, /\$24627A/, 'and it names the code-pointer table');
  assert.match(hit, /out of scope/);
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
