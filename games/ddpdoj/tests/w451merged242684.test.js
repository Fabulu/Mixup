// W451: `$242684`, six private screen tests consolidated into movement.js.
//
// The cartridge is the authority. Section 1 decodes the routine and its branch
// sense directly from maincpu.bin. Section 2 replays all six deleted private
// bodies in one axis table. Five were equivalent after normalising their return
// sense. stage4type42.js was not: it omitted scroll, swapped the words, invented
// both bands, and used the wrong arm at its caller.
//
// Section 3 pins the merge and the widened duplicate registers. Section 4 is
// the RED arm: opposite RAM states must produce opposite answers. The focused
// mutation run replaces the scroll input in movement.js with zero and must fail
// this section. Section 5 drives the repaired type $42 call site through the
// enemy driver and uses enemies.js live-count and allocator results as witnesses
// outside every source file changed by W451.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram, i16, u16 } from '../src/ram.js';
import { offScreen242684 } from '../src/movement.js';
import { handler42 } from '../src/stage4type42.js';
import { ENEMY, allocEnemy, runEnemyDriver } from '../src/enemies.js';
import {
  bodyPairs, headIndex, headRegister, scanFile, sources,
} from './w450widenedscan.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const SKIP_ROM = existsSync(IMAGE) ? false : 'maincpu.bin absent; skip, not pass';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const A6 = 0x814600;
const SCROLL_172 = 0x813172;

function decode242684() {
  return Object.freeze({
    posDisp: w(0x242686),
    shortBias: w(0x24268a),
    scrollAddr: l(0x24268e),
    shortCarryAdd: w(0x242694),
    branchWord: w(0x242696),
    longBias: w(0x24269c),
    longCarryAdd: w(0x2426a0),
  });
}

function addWord(a, b) {
  const sum = (a & 0xffff) + (b & 0xffff);
  return { value: sum & 0xffff, carry: sum > 0xffff };
}

/** Local 68000 model built only from decode242684(), never from movement.js. */
function romOffScreen(ram, a6, truth) {
  const pos = ram.u32(a6 + truth.posDisp);
  let d0 = addWord(pos & 0xffff, truth.shortBias).value;
  d0 = addWord(d0, ram.u16(truth.scrollAddr)).value;
  const short = addWord(d0, truth.shortCarryAdd);
  if (short.carry) return true;
  d0 = addWord(pos >>> 16, truth.longBias).value;
  return addWord(d0, truth.longCarryAdd).carry;
}

function seedAxes(xAt02, yAt04, scroll) {
  const ram = new Ram();
  ram.setU16(A6 + 0x02, xAt02);
  ram.setU16(A6 + 0x04, yAt04);
  ram.setU16(SCROLL_172, scroll);
  return ram;
}

function axisCases(truth) {
  const shortFirstOff = u16(0x10000 - truth.shortCarryAdd);
  const longFirstOff = u16(0x10000 - truth.longCarryAdd);
  return Object.freeze([
    { name: 'centre', x: 0x0000, y: 0x0000, scroll: 0x0000 },
    { name: '+$02 last on', x: u16(longFirstOff - truth.longBias - 1), y: 0, scroll: 0 },
    { name: '+$02 first off', x: u16(longFirstOff - truth.longBias), y: 0, scroll: 0 },
    { name: '+$04 last on', x: 0, y: u16(shortFirstOff - truth.shortBias - 1), scroll: 0 },
    { name: '+$04 first off', x: 0, y: u16(shortFirstOff - truth.shortBias), scroll: 0 },
    { name: 'scroll alone moves centre off', x: 0, y: 0,
      scroll: u16(shortFirstOff - truth.shortBias) },
    { name: '+$04 wraps back on', x: 0, y: u16(-truth.shortBias), scroll: 0 },
    { name: '+$02 wrapped negative remains on', x: 0xfb00, y: 0, scroll: 0 },
    { name: '+$04 ROM-wide on band', x: 0, y: 0x5000, scroll: 0 },
  ]);
}

// The six deleted bodies are preserved here as executable evidence. They are
// intentionally local test fixtures, not another production transcription.
function deletedHandlersOnScreen(ram, a6) {
  const pos = ram.u32(a6 + 0x02);
  let y = u16((pos & 0xffff) + 0x1c00);
  y = u16(y + ram.u16(0x813172));
  if (u16(y) + 0x9000 > 0xffff) return true;
  const x = u16((pos >>> 16) + 0x800);
  return u16(x) + 0x8000 > 0xffff;
}

function deletedItemsOffScreen(ram, a6) {
  const p = ram.u32(a6 + 0x02);
  let d0 = u16((p & 0xffff) + 0x1c00);
  d0 = u16(d0 + ram.u16(0x813172));
  if (d0 + 0x9000 > 0xffff) return true;
  const hi = u16((p >>> 16) + 0x800);
  return hi + 0x8000 > 0xffff;
}

function deletedCarrierOffScreen(ram, a6) {
  const pos = ram.u32(a6 + 2);
  const y = u16((pos & 0xffff) + 0x1c00 + ram.u16(0x813172));
  if (y + 0x9000 > 0xffff) return true;
  const x = u16((pos >>> 16) + 0x0800);
  return x + 0x8000 > 0xffff;
}

function deletedType16OnScreen(ram, a6) {
  const pos = ram.u32(a6 + 2);
  let low = u16((pos & 0xffff) + 0x1c00);
  low = u16(low + ram.u16(0x813172));
  if (low + 0x9000 > 0xffff) return false;
  return u16((pos >>> 16) + 0x0800) + 0x8000 <= 0xffff;
}

function deletedType41OffScreen(ram, root) {
  let y = u16(ram.u16(root + 0x04) + 0x1c00);
  y = u16(y + ram.u16(0x813172));
  if (y + 0x9000 > 0xffff) return true;
  return u16(ram.u16(root + 0x02) + 0x0800) + 0x8000 > 0xffff;
}

function deletedType42OnScreen(ram, a6) {
  const y = i16(ram.u16(a6 + 0x02));
  const x = i16(ram.u16(a6 + 0x04));
  return y >= -0x400 && y <= 0x6400 && x >= -0x400 && x <= 0x4000;
}

// SIX-COPY AXIS TABLE. preSwap and postSwap name the word each deleted body
// treated as the ROM's D0.w before and after `swap`. rawSense records whether
// the old helper returned carry/off or its negation.
const SIX_COPY_AXIS = Object.freeze([
  { copy: 'handlers.js onScreen242684', load: 'long +$02', preSwap: '+$04',
    postSwap: '+$02', scroll: '+$04', rawSense: 'off', body: deletedHandlersOnScreen },
  { copy: 'items.js offScreen242684', load: 'long +$02', preSwap: '+$04',
    postSwap: '+$02', scroll: '+$04', rawSense: 'off', body: deletedItemsOffScreen },
  { copy: 'stage3carrier.js offScreen242684', load: 'long +$02', preSwap: '+$04',
    postSwap: '+$02', scroll: '+$04', rawSense: 'off', body: deletedCarrierOffScreen },
  { copy: 'stage3type16.js onScreen242684', load: 'long +$02', preSwap: '+$04',
    postSwap: '+$02', scroll: '+$04', rawSense: 'on', body: deletedType16OnScreen },
  { copy: 'stage4type41.js offScreen242684', load: 'two words', preSwap: '+$04',
    postSwap: '+$02', scroll: '+$04', rawSense: 'off', body: deletedType41OffScreen },
  { copy: 'stage4type42.js onScreen', load: 'two words', preSwap: '+$02 WRONG',
    postSwap: '+$04 WRONG', scroll: 'ABSENT', rawSense: 'on', body: deletedType42OnScreen },
]);

const normalisedOff = (copy, ram) => {
  const raw = copy.body(ram, A6);
  return copy.rawSense === 'off' ? raw : !raw;
};

// ==============================================================================================
// SECTION 1: ROM truth
// ==============================================================================================

test('SECTION 1: decode `$242684` from 32 ROM bytes, including early BCS and final carry',
  { skip: SKIP_ROM }, () => {
    assert.deepEqual([...IMG.subarray(0x242684, 0x2426a4)], [
      0x20, 0x2e, 0x00, 0x02, 0x06, 0x40, 0x1c, 0x00,
      0xd0, 0x79, 0x00, 0x81, 0x31, 0x72, 0x06, 0x40,
      0x90, 0x00, 0x65, 0x0a, 0x48, 0x40, 0x06, 0x40,
      0x08, 0x00, 0x06, 0x40, 0x80, 0x00, 0x4e, 0x75,
    ], 'the proof starts from the cartridge bytes, not any JavaScript body');

    assert.equal(w(0x242684), 0x202e, 'move.l (d16,A6),D0');
    assert.equal(w(0x242688), 0x0640, 'addi.w #$1C00,D0');
    assert.equal(w(0x24268c), 0xd079, 'add.w abs.l,D0');
    assert.equal(w(0x242692), 0x0640, 'addi.w #$9000,D0');
    assert.equal(w(0x242696), 0x650a, 'bcs.s $2426A2: carry SET exits as off-screen');
    assert.equal(0x242698 + i16(w(0x242696) & 0xff), 0x2426a2,
      'the signed 8-bit branch displacement lands on rts');
    assert.equal(w(0x242698), 0x4840, 'swap D0');
    assert.equal(w(0x24269a), 0x0640, 'addi.w #$0800,D0');
    assert.equal(w(0x24269e), 0x0640, 'addi.w #$8000,D0');
    assert.equal(w(0x2426a2), 0x4e75, 'rts returns the last add carry');

    assert.deepEqual(decode242684(), {
      posDisp: 0x0002, shortBias: 0x1c00, scrollAddr: 0x00813172,
      shortCarryAdd: 0x9000, branchWord: 0x650a,
      longBias: 0x0800, longCarryAdd: 0x8000,
    });
  });

test('SECTION 1: the image has 30 direct callers, 26 consume BCC and 4 consume BCS',
  { skip: SKIP_ROM }, () => {
    const call = Buffer.from([0x4e, 0xb9, 0x00, 0x24, 0x26, 0x84]);
    const hits = [];
    for (let a = 0x200000; a < 0x2b0000; a += 2) {
      if (IMG.subarray(a, a + 6).equals(call)) hits.push(a);
    }
    assert.equal(hits.length, 30, 'all direct jsr $242684 sites, scanned from the image');
    const bcc = hits.filter((a) => (w(a + 6) & 0xff00) === 0x6400);
    const bcs = hits.filter((a) => (w(a + 6) & 0xff00) === 0x6500);
    assert.equal(bcc.length, 26, '26 callers branch when carry is clear, meaning on-screen');
    assert.deepEqual(bcs.map((a) => a.toString(16)),
      ['27ebc0', '27ed70', '27ef04', '27f248'], 'the four item callers branch on carry set');

    assert.equal(l(0x2a3c0e), 0x4eb90024, '$2A3C0E jsr first longword');
    assert.equal(w(0x2a3c12), 0x2684, '...target low word is $2684');
    assert.equal(w(0x2a3c14), 0x640e, '$2A3C14 bcc.s $2A3C24');
    assert.equal(0x2a3c16 + 0x0e, 0x2a3c24, 'carry clear reaches the seen-flag store');
    assert.equal(l(0x2a3c16), 0x4a2d0016, 'carry set falls into tst.b ($16,A5)');
    assert.equal(l(0x2a3c1c), 0x4ef90026, 'seen plus carry set falls into jmp first longword');
    assert.equal(w(0x2a3c20), 0x3762, '...the free target is $263762');
    assert.deepEqual([...IMG.subarray(0x2a3c24, 0x2a3c2a)],
      [0x1b, 0x7c, 0x00, 0x01, 0x00, 0x16], 'on-screen writes #1 to ($16,A5)');
  });

// ==============================================================================================
// SECTION 2: six deleted copies on the ROM-derived axes
// ==============================================================================================

test('SECTION 2: the six-copy axis table has five equivalent bodies and one invented body',
  { skip: SKIP_ROM }, () => {
    const truth = decode242684();
    const cases = axisCases(truth);
    assert.equal(SIX_COPY_AXIS.length, 6, 'all six deleted private transcriptions are present');
    assert.equal(new Set(SIX_COPY_AXIS.map((c) => c.copy)).size, 6, 'six distinct source/name rows');

    for (const copy of SIX_COPY_AXIS.slice(0, 5)) {
      for (const arm of cases) {
        const ram = seedAxes(arm.x, arm.y, arm.scroll);
        assert.equal(normalisedOff(copy, ram), romOffScreen(ram, A6, truth),
          `${copy.copy}, ${arm.name}: normalised return must equal the decoded ROM carry`);
      }
    }

    const invented = SIX_COPY_AXIS[5];
    const wrong = [];
    for (const arm of cases) {
      const ram = seedAxes(arm.x, arm.y, arm.scroll);
      if (normalisedOff(invented, ram) !== romOffScreen(ram, A6, truth)) wrong.push(arm.name);
    }
    assert.deepEqual(wrong, [
      '+$02 last on', '+$04 last on', 'scroll alone moves centre off',
      '+$04 wraps back on', '+$02 wrapped negative remains on', '+$04 ROM-wide on band',
    ], 'stage4type42 disagrees independently on polarity/bands, scroll, wrap, and both axes');
  });

test('SECTION 2: the survivor matches the ROM model on every boundary and wrap arm',
  { skip: SKIP_ROM }, () => {
    const truth = decode242684();
    for (const arm of axisCases(truth)) {
      const ram = seedAxes(arm.x, arm.y, arm.scroll);
      assert.equal(offScreen242684(ram, A6), romOffScreen(ram, A6, truth), arm.name);
    }
  });

// ==============================================================================================
// SECTION 3: merge and register fixtures
// ==============================================================================================

test('SECTION 3: one `$242684` claimant survives, and all six old private heads are gone', () => {
  const { idx } = headIndex();
  const claims = [...(idx.get(0x242684) ?? new Map()).keys()];
  assert.equal(claims.length, 1, 'the widened head index must have exactly one $242684 claimant');
  assert.match(claims[0], /^movement\.js:\d+ offScreen242684$/,
    'movement.js offScreen242684 is the sole survivor');
  assert.equal(headRegister().includes(0x242684), false, '$242684 left the widened register');

  const files = new Map(sources());
  const oldHeads = [];
  for (const file of ['handlers.js', 'items.js', 'stage3carrier.js', 'stage3type16.js',
    'stage4type41.js', 'stage4type42.js']) {
    const { heads } = scanFile(files.get(file));
    for (const h of heads) {
      if (h.name === 'onScreen242684' || h.name === 'offScreen242684' || h.name === 'onScreen') {
        oldHeads.push(`${file} ${h.name}`);
      }
    }
  }
  assert.deepEqual(oldHeads, [], 'none of the six changed callers retains a private screen helper');

  const pairs = bodyPairs().map(([p]) => p);
  assert.equal(pairs.includes('handlers.js onScreen242684 <> items.js offScreen242684'), false,
    'the deleted body pair left the body register too');
  assert.equal(headRegister().length, 72,
    'W475 left 68; W497 adds $2491C0 and $253D82/$253D90; W554 adds $2A54E2');
  assert.equal(pairs.length, 28,
    'W461 left 27; W497 adds the authentic-selection/player-object body pair');
});

// ==============================================================================================
// SECTION 4 RED: opposite RAM state, sensitive to both inputs
// ==============================================================================================

test('SECTION 4 RED: opposite scroll RAM states with identical coordinates give opposite carries',
  { skip: SKIP_ROM }, () => {
    const truth = decode242684();
    const on = seedAxes(0, 0, 0);
    const off = on.clone();
    off.setU16(truth.scrollAddr, u16(0x10000 - truth.shortCarryAdd - truth.shortBias));

    assert.equal(on.u32(A6 + truth.posDisp), off.u32(A6 + truth.posDisp),
      'the coordinate longword is identical; only scroll RAM changes');
    assert.notEqual(on.u16(truth.scrollAddr), off.u16(truth.scrollAddr),
      'the two arms carry opposite scroll RAM');
    assert.equal(offScreen242684(on, A6), false, 'zero scroll leaves the centre on-screen');
    assert.equal(offScreen242684(off, A6), true, 'the decoded threshold scroll moves it off-screen');
    assert.equal(romOffScreen(on, A6, truth), false, 'independent ROM model agrees on arm A');
    assert.equal(romOffScreen(off, A6, truth), true, 'independent ROM model agrees on arm B');
  });

test('SECTION 4 RED: opposite position RAM states at the exact +$02 boundary give opposite carries',
  { skip: SKIP_ROM }, () => {
    const truth = decode242684();
    const firstOff = u16(0x10000 - truth.longCarryAdd - truth.longBias);
    const on = seedAxes(u16(firstOff - 1), 0, 0);
    const off = on.clone();
    off.setU16(A6 + truth.posDisp, firstOff);

    assert.equal(on.u16(truth.scrollAddr), off.u16(truth.scrollAddr), 'scroll is identical');
    assert.equal(on.u16(A6 + truth.posDisp + 2), off.u16(A6 + truth.posDisp + 2),
      'the +$04 word is identical; only +$02 changes');
    assert.equal(offScreen242684(on, A6), false, '$77FF is the last on-screen +$02 word');
    assert.equal(offScreen242684(off, A6), true, '$7800 is the first off-screen +$02 word');
  });

// ==============================================================================================
// SECTION 5: live state trace, with enemies.js as the outside witness
// ==============================================================================================

test('SECTION 5: type $42 traces off -> on -> off, then enemies.js sees and reuses the free slot',
  () => {
    const ram = new Ram();
    const first = allocEnemy(ram, 0x42, 0);
    assert.equal(first.carry, false);
    assert.equal(first.addr, ENEMY.bandCommon, 'enemies.js allocated common slot 0');
    const a5 = first.addr;
    const a6 = A6;
    const handlerAddress = 0x2a3af6;

    ram.setU32(a5 + ENEMY.subRecOff, a6);
    ram.setU32(a5 + ENEMY.handlerOff, handlerAddress);
    ram.setU16(a5 + ENEMY.seqOff, 0);       // freeEnemy run length: one sub-record
    ram.setU8(a5 + 0x3a, 1);                // mode 1 runs the $242684 call site
    ram.setU16(0x8130d2, 1);                // freeze after the lifetime test
    ram.setU16(ENEMY.scrollDelta, 0);
    ram.setU16(SCROLL_172, 0);
    ram.setU16(a6 + 0x04, 0);                // inside the surrounding $2A3BFA band
    ram.setU8(a6 + 0x1f, 0);                 // draw returns before reading ROM

    const handlers = new Map([[handlerAddress,
      (r, rec, _slot, ctx) => handler42(r, {}, rec, ctx)]]);
    const frame = (x) => {
      ram.setU16(a6 + 0x02, x);
      const processed = runEnemyDriver(ram, handlers, {});
      return {
        processed,
        seen: ram.u8(a5 + 0x16),
        recordStatus: ram.u16(a5),
        subStatus: ram.u8(a6),
        liveCount: ram.u16(ENEMY.liveCount),
      };
    };

    const trace = [frame(0x7800), frame(0x0000), frame(0x7800)];
    assert.deepEqual(trace, [
      { processed: 1, seen: 0, recordStatus: 0x8000, subStatus: 0, liveCount: 1 },
      { processed: 1, seen: 1, recordStatus: 0x8000, subStatus: 0, liveCount: 1 },
      { processed: 1, seen: 1, recordStatus: 0x0000, subStatus: 1, liveCount: 0 },
    ], 'never-seen off-screen survives, on-screen sets the one-shot, then off-screen frees');

    const reused = allocEnemy(ram, 0x42, 0);
    assert.equal(reused.addr, a5,
      'enemies.js allocator reuses the exact slot that initbody.js freeEnemy cleared');
    assert.equal(reused.carry, false, 'the outside allocator sees a real free, not a return value');
  });
