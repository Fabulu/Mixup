// ===============================================================================================
// W389 -- THE FOLD, THE SECOND `queueKill`, AND WHAT ARM 12 ACTUALLY IS.
// ===============================================================================================
//
// UNIT A. W388 ported `$24676A..$2467C3` (the per-node CONTENT seeding) and wired it from ONE call
// site by hand, leaving three others building hollow chains. W389 folds it into `chainLoaderBody`,
// which is where the ROM has it -- `$2467CE`'s `dbra` closes back over the seeding to the pool scan
// at `$24673E`, so allocation and content are ONE loop. SECTIONS 2 and 3.
//
// **AND THE FOLD IS NOT UNCONDITIONAL, BECAUSE THE TWO LOADERS' CONTENT BLOCKS ARE DIFFERENT
// SHAPES.** The brief for this wave said `$24652A` has no content seeding. The image says it has
// one, at `$246582..$2465D9`, and it differs from `$246710`'s by exactly one instruction:
//
//   246598  2558 000a            move.l (A0)+,($A,A2)          <- the target, FROM THE SCRIPT
//   24677E  257c 0024 6bb8 000a  move.l #$246BB8,($A,A2)       <- the target, a CONSTANT
//
// so `$24652A`'s script is SIX words per node and `$246710`'s is FOUR. A single unconditional fold
// would have mis-parsed one of the two. SECTION 1 reads both blocks off the image.
//
// UNIT B. `objslot13.js`, `objslot15.js` and `objslot7pool.js` (twice) handed `queueKill` the TYPE
// WORD at `($0,A5)` where `$241292 lea ($4C,A5),A0` takes the ID LONG. Same defect W388 fixed in
// `objslot14.js`. SECTION 4. **TWO MORE SITES HAD IT AND WERE OUTSIDE THIS WAVE'S FILE LIST** --
// `objslot17.js:194` and `objslot9.js:512` -- and SECTION 4 asserted their bytes so the finding
// could not be lost. **W390 FIXED BOTH**, which closes the census at six.
//
// UNIT C. Arm 12's screen, `$25C2AE` / `$25C2EA`. SECTION 5.
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Game } from '../src/main.js';
import { ALLOC, killById, queueKill, commitKills } from '../src/objalloc.js';
import {
  chainLoader24652A, chainLoader246710, chainLoader246704,
  chainCheck24681A, chainFree246800,
} from '../src/stageend.js';
import {
  CHAIN_CONTENT, CHAIN_CONTENT_24652A, ANIM_OBJECT, runAnimObjects24683E,
  seedChainContent24676A,
} from '../src/animobjects.js';
import { objSlot13, SCREEN13 } from '../src/objslot13.js';
import { objSlot15, SLOT15 } from '../src/objslot15.js';
import { menu2911B0, MENU2911B0, SLOT7 } from '../src/objslot7pool.js';
import { nameCountdown28F4FC } from '../src/hiscorename.js';
import { SCREEN_STATE } from '../src/hiscorescreen.js';
import { SCREEN12 } from '../src/objslot8.js';
import { BUCKETS } from '../src/spritequeue.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const TABLES = here('../rip/port/player.tables.json');
const SKIP_T = existsSync(TABLES) ? SKIP : 'generated ROM tables absent; skip, not pass';
const tablesJson = existsSync(TABLES) ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

/** The raw image as a `rom` face -- the same one `w373slot15.test.js` and `w373menu.test.js` use,
 *  so these tests drive the real routines rather than a windowed subset of them. */
const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a),
  i16: (a) => IMG.readInt16BE(a), u8: (a) => IMG[a],
  bytes: (a, n) => IMG.subarray(a, a + n),
});

const noteCtx = () => {
  const notes = [];
  return { notes,
    ctx: {
      unported: { note: (a, t) => notes.push(`${a}:${t}`) },
      unportedLog: { note: (a, t) => notes.push(`${a}:${t}`) },
      soundPost: () => {},
    } };
};

/** The frame flush. The real main loop zeroes every sprite-bucket counter once a frame; a
 *  fixture that drives a screen for thousands of frames without it lets the queues run past
 *  their `capBytes` and scribble over `$812A00` and `$81E11C`, which is how the first draft of
 *  the slot [15] test managed to corrupt the object it was driving. */
function flushQueues(ram) {
  for (const b of BUCKETS) ram.setU16(b.counter, 0);
}

/** Walk a chain handle and collect each node's address. */
function chainNodes(ram, handle) {
  const out = [];
  let node = ram.u32((handle >>> 0) + 0x2c);
  while (node !== 0 && out.length < 64) { out.push(node); node = ram.u32(node + 0x2c); }
  return out;
}

// ===============================================================================================
// SECTION 1 -- THE TWO CONTENT BLOCKS, OFF THE IMAGE. THE BRIEF SAID THERE WAS ONE.
// ===============================================================================================

test('W389 SECTION 1: `$24652A` HAS a content block at $246582, and it is `$24676A` plus one '
  + 'instruction', { skip: SKIP }, () => {
  // Instruction for instruction against `$24676A`'s, which W388's SECTION 1 already decoded.
  assert.equal(w(0x246582), 0x3418, '$246582 move.w (A0)+,D2 -- the family word, as $246768');
  // TRAP 4: `lea (d16,PC)` resolves from the EXTENSION WORD's address, not the opcode's.
  assert.equal(w(0x246584), 0x47fa, '$246584 lea (d16,PC),A3');
  assert.equal(0x246586 + (w(0x246586) - 0x10000), CHAIN_CONTENT.dispatch,
    '  ...$246586 + (-$30C) = $24627A -- THE SAME dispatch table $24676A reaches');
  assert.notEqual(0x246584 + (w(0x246586) - 0x10000), CHAIN_CONTENT.dispatch,
    '  POSITIVE CONTROL: from the OPCODE address it would be $246278, which is not a table');
  // THE WRITER STORE. The one `chainLoaderBody` was missing for BOTH heads.
  assert.equal(w(0x246588), 0x2573, '$246588 move.l (d8,A3,Xn),(d16,A2)');
  assert.equal(w(0x24658a), 0x2004, '  ...source ($4,A3,D2.w)');
  assert.equal(w(0x24658c), 0x0006, '  ...destination ($6,A2) -- byte for byte $24676E');
  assert.equal(w(0x246592), 0xd6d8, '$246592 adda.w (A0)+,A3 -- the offset word, as $246778');

  // **THE ONE INSTRUCTION THAT DIFFERS**, and it is why the two script strides differ.
  assert.equal(w(0x246598), 0x2558, '$246598 move.l (A0)+,(d16,A2) -- POST-INCREMENT SOURCE');
  assert.equal(w(0x24659a), 0x000a, '  ...into ($A,A2), the target cursor');
  assert.equal(w(0x24677e), 0x257c, '$24677E move.l #imm,(d16,A2) -- an IMMEDIATE instead');
  assert.equal(l(0x246780), CHAIN_CONTENT.targetBank, '  ...#$246BB8');
  assert.equal(w(0x246784), 0x000a, '  ...into the SAME ($A,A2)');

  assert.equal(w(0x24659c), 0x3558, '$24659C move.w (A0)+,(d16,A2) -- words-minus-one');
  assert.equal(w(0x2465a0), 0x3618, '$2465A0 move.w (A0)+,D3 -- the timing index');
  assert.equal(w(0x2465aa), 0x47fa, '$2465AA lea (d16,PC),A3');
  assert.equal(0x2465ac + w(0x2465ac), CHAIN_CONTENT.timingTable,
    '  ...$2465AC + $58C = $246B38 -- THE SAME timing table');
  assert.equal(w(0x2465d4), 0x38db, '$2465D4 move.w (A3)+,(A4)+ -- the same palette snapshot');
  assert.equal(w(0x2465d6), 0x51cc, '$2465D6 dbra D4 -- and trap 2: it runs D4 PLUS ONE times');

  // THE BOUND, FROM THE CODE, never from an absence: $2465DA is `subq.w #1,D0`, the ALLOCATION
  // loop's counter resuming, exactly as $2467C4 is for the other block.
  assert.equal(w(0x2465da), 0x5340, '$2465DA subq.w #1,D0 -- the allocator resumes here');
  assert.equal(CHAIN_CONTENT_24652A.end, 0x2465da, 'CHAIN_CONTENT_24652A.end is that address');

  // AND THE STRIDES, which is the whole reason the fold is per-head.
  assert.equal(CHAIN_CONTENT_24652A.wordsPerNode, 6, '$24652A reads SIX words per node');
  assert.equal(CHAIN_CONTENT.wordsPerNode, 4, '...and $246710 reads FOUR');
  assert.equal(CHAIN_CONTENT_24652A.targetFromScript, true, 'because of $246598');
  assert.equal(CHAIN_CONTENT.targetFromScript, undefined, '...and $24677E has no script field');
});

test('W389 SECTION 1: the port keeps `$24652A` unseeded ON PURPOSE, and says so', { skip: SKIP },
  () => {
    // A DECLARED HOLD, asserted so it cannot rot into an oversight. `$24652A`'s only caller in
    // `stageend.js` is `f8Exit28DE1E`, whose wait is PRESENTATION_DEVIATION DEV-2, and
    // `animobjects.js` already carries a SECOND, fully-seeding port of the same routine
    // (`loadAnimObjects24652A`). Turning this one on gives the result screen a wait it has never
    // had, which is a behaviour change this wave was not asked to make.
    const ram = new Ram();
    const rom = rawRom();
    // Six-word script or not, the loader must not read past the count word while content is off.
    const h = chainLoader24652A(ram, rom, SCREEN_STATE.script);
    assert.notEqual(h, 0xffffffff, 'it still allocates');
    for (const node of chainNodes(ram, h)) {
      assert.equal(ram.u32(node + 0x06), 0, 'and every node is still content-free...');
      assert.equal(ram.u32(node + 0x18), 0xffff0000, '...with the lifecycle intact');
    }
    // Which is exactly what `runAnimObjects24683E`'s own guard is written for.
    assert.equal(runAnimObjects24683E(ram, rom).nodes, 8, 'the driver walks them and steps none');
  });

// ===============================================================================================
// SECTION 2 -- THE FOLD ITSELF. THE INLINE PASS AND W388'S SECOND PASS LAND THE SAME RAM.
// ===============================================================================================

test('W389 SECTION 2: seeding inline lands byte-for-byte what W388\'s second pass did',
  { skip: SKIP }, () => {
    // W388's comment argued the second pass was equivalent because the two passes overlap in one
    // field and write the same value there. That argument is now testable in both directions:
    // build the chain the new way, and build it the old way (allocate, then walk again), and
    // compare the WHOLE of RAM.
    const rom = rawRom();
    const inline = new Ram();
    const twoPass = new Ram();
    const a = chainLoader246710(inline, rom, SCREEN_STATE.script, undefined);
    // The old shape, reconstructed: the allocator with content OFF is `chainLoader24652A`'s
    // body, so drive the second pass over a chain built by the seeding loader and then blanked.
    const bh = chainLoader246710(twoPass, rom, SCREEN_STATE.script, undefined);
    for (const node of chainNodes(twoPass, bh)) {
      // Every field the CONTENT block writes, and nothing else -- ($2C) is the LINK and must
      // survive or the second pass has no chain left to walk.
      for (const o of [0x04, 0x14, 0x16, 0x1c]) twoPass.setU16(node + o, 0);
      twoPass.setU32(node + 0x06, 0);
      twoPass.setU32(node + 0x0a, 0);
      twoPass.setU32(node + 0x0e, 0);
      for (let k = 0; k < 0x20; k++) twoPass.setU16(node + 0x30 + k * 2, 0);
      twoPass.setU32(node + 0x18, 0xffff0000);
    }
    assert.equal(seedChainContent24676A(twoPass, rom, bh, SCREEN_STATE.script), 8,
      'the second pass seeded all eight');
    assert.equal(a, bh, 'the same handle');
    let diff = -1;
    for (let i = 0; i < inline.b.length; i++) if (inline.b[i] !== twoPass.b[i]) { diff = i; break; }
    assert.equal(diff, -1, `RAM is identical -- first difference would be at $${(diff + 0x800000)
      .toString(16)}`);
  });

test('W389 SECTION 2: the loader no longer raises the `$24676A` note, at any of its heads',
  { skip: SKIP }, () => {
    const rom = rawRom();
    for (const [name, fn] of [['$246710', chainLoader246710], ['$246704', chainLoader246704]]) {
      const { ctx, notes } = noteCtx();
      const h = fn(new Ram(), rom, SCREEN_STATE.script, ctx);
      assert.notEqual(h, 0xffffffff, `${name} allocated`);
      assert.deepEqual(notes, [], `${name} raises NO note now -- the block is ported`);
    }
  });

// ===============================================================================================
// SECTION 3 -- UNIT A. ALL FOUR CALL SITES BUILD LIVE CHAINS, AND THE CHAINS DRAIN.
// ===============================================================================================
//
// "Live" is asserted as the ROM defines it: `($6,node)` non-zero, because `runAnimObjects24683E`
// skips exactly the nodes whose `($6)` is zero. "Drains" is asserted by RUNNING the driver until
// `chainCheck24681A` returns zero and the owning state machine advances -- not by counting calls.

/** Run the anim driver until `handle`'s chain reports finished, with a hard bound. */
function drainChain(ram, rom, handle, bound = 4000) {
  for (let f = 1; f <= bound; f++) {
    runAnimObjects24683E(ram, rom);
    if (chainCheck24681A(ram, handle) === 0) return f;
  }
  return -1;
}

test('W389 SECTION 3: objslot15.js:173 -- slot [15] builds a LIVE chain and reaches state 2',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a5 = 0x812a00;
    // $291F4A -- a ZERO gate sends state 0 straight to state 2 and no chain is ever built. The
    // screen only runs at all when $813098 is set, which is what slot [7] does before staging it.
    ram.setU16(SLOT15.gate, 1);
    objSlot15(ram, rom, a5, ctx);                       // state 0 arms the sequence
    // $291F78's three conditions: phase 0, DRIFT ZERO, and the $80 timer running out. The drift
    // is the long one: `$291DEA` arms `$81E120` to $20 and the ONLY thing that clears it is a
    // `$FFFFFFFF` string payload in the `$291FE2` sequence table -- entry 46, whose delay words
    // sum to 7,232 frames. So the chain load is GATED on the whole text sequence finishing, and
    // a shorter run would have looked like a stall that is really a gate.
    let armed = -1;
    for (let f = 1; f <= 12000 && armed < 0; f++) {
      flushQueues(ram);
      objSlot15(ram, rom, a5, ctx);
      if (ram.u16(a5 + SLOT15.phase) === 1) armed = f;
    }
    assert.ok(armed > 0, `POSITIVE CONTROL: the load was armed on the driven path, at +${armed}`);
    assert.ok(armed > 7232,
      '...and only AFTER the sequence table\'s $FFFFFFFF entry, at +7,232');
    const handle = ram.u32(a5 + SLOT15.handle);
    assert.notEqual(handle, 0xffffffff, 'and $246710 found a free player slot');
    const nodes = chainNodes(ram, handle);
    assert.equal(nodes.length, 1, '$291FD8\'s count word is 1, so the chain is one node');
    // THE FIELD. Zero here is the hollow chain.
    assert.equal(ram.u32(nodes[0] + 0x06), 0x80fa66,
      '($6) is $24627A[0]+$4 = $80FA66, family $00\'s dirty word -- NOT ZERO');
    assert.equal(ram.u32(nodes[0] + 0x0e), 0x80e886 + 0x80, '($E) is the base plus $291FDC\'s $80');
    assert.equal(ram.u32(nodes[0] + 0x0a), CHAIN_CONTENT.targetBank, '($A) is the constant');
    assert.equal(ram.u16(nodes[0] + 0x04), 0x1f, '($4) covers $20 words');
    assert.equal(ram.u16(nodes[0] + 0x18), 0xffff, '($18) is armed');

    // AND IT DRAINS -- driven, with the object's own state machine watching.
    let done = -1;
    for (let f = 1; f <= 4000 && done < 0; f++) {
      flushQueues(ram);
      runAnimObjects24683E(ram, rom);
      objSlot15(ram, rom, a5, ctx);
      if (ram.u8(a5 + SLOT15.state) === 2) done = f;
    }
    assert.ok(done > 0, `slot [15] reached state 2 after ${done} frames of the driver`);
    assert.equal(ram.u16(nodes[0] + 0x18), 0, '($18) really drained to zero');
    assert.equal(ram.u16(nodes[0] + 0x00), 0, 'and $246800 freed the node');
  });

test('W389 SECTION 3 ABLATION: blank slot [15]\'s ($6) and it never leaves phase 1',
  { skip: SKIP }, () => {
    // The pre-W389 machine, reconstructed on the same driven path: allocate, then zero the one
    // field the fold adds. Nothing else changes.
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a5 = 0x812a00;
    ram.setU16(SLOT15.gate, 1);
    objSlot15(ram, rom, a5, ctx);
    let blanked = 0;
    for (let f = 1; f <= 16000; f++) {
      flushQueues(ram);
      runAnimObjects24683E(ram, rom);
      objSlot15(ram, rom, a5, ctx);
      if (ram.u16(a5 + SLOT15.phase) === 1 && !blanked) {
        for (const n of chainNodes(ram, ram.u32(a5 + SLOT15.handle))) {
          ram.setU32(n + 0x06, 0); blanked++;
        }
      }
    }
    assert.equal(blanked, 1, 'POSITIVE CONTROL: there really was a node to blank');
    assert.equal(ram.u8(a5 + SLOT15.state), 1, 'and slot [15] is STILL in state 1...');
    assert.equal(ram.u16(a5 + SLOT15.phase), 1, '...parked in phase 1 for 8,000 frames');
    assert.notEqual(chainCheck24681A(ram, ram.u32(a5 + SLOT15.handle)), 0, 'the chain never ends');
  });

test('W389 SECTION 3: objslot7pool.js:410 -- the $2911B0 menu\'s CONFIRM chain drains and hands '
  + 'the outer slot to state 2', { skip: SKIP }, () => {
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a5 = 0x812a00;
    const a6 = 0x812b00;
    // State 1 runs the intro script to its terminator; pump to the menu proper.
    let reached = -1;
    for (let f = 1; f <= 4000 && reached < 0; f++) {
      flushQueues(ram);
      menu2911B0(ram, rom, a5, a6, ctx);
      if (ram.u16(a6 + 0x06) === 2) reached = f;
    }
    assert.ok(reached > 0, 'POSITIVE CONTROL: the menu reached state 2');
    // Let the $2911B0 timeout confirm the default choice -- no input, the ROM's own path.
    let confirmed = -1;
    for (let f = 1; f <= MENU2911B0.timeout + 8 && confirmed < 0; f++) {
      flushQueues(ram);
      menu2911B0(ram, rom, a5, a6, ctx);
      if (ram.u16(a6 + 0x06) === 3) confirmed = f;
    }
    assert.ok(confirmed > 0, 'and its countdown confirmed');
    const handle = ram.u32(a6 + 0x14);
    const nodes = chainNodes(ram, handle);
    assert.equal(nodes.length, 2, '$291354\'s count word is 2');
    assert.deepEqual(nodes.map((n) => ram.u32(n + 0x06)), [0x80fa66, 0x80fa66],
      'both nodes carry family $00\'s dirty word -- NOT ZERO');
    assert.deepEqual(nodes.map((n) => ram.u32(n + 0x0e)), [0x80e886, 0x80e886 + 0xc0],
      'and the two script offsets $0000 / $00C0');

    let done = -1;
    for (let f = 1; f <= 4000 && done < 0; f++) {
      flushQueues(ram);
      runAnimObjects24683E(ram, rom);
      menu2911B0(ram, rom, a5, a6, ctx);
      if (ram.u8(a5 + 0x02) === 2) done = f;
    }
    assert.ok(done > 0, `$2912DE wrote state 2 into the OUTER slot after ${done} frames`);
    assert.equal(chainCheck24681A(ram, handle), 0, 'because the chain reported finished');
  });

test('W389 SECTION 3 ABLATION: blank the menu\'s ($6) and slot [7] never advances',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a5 = 0x812a00;
    const a6 = 0x812b00;
    let blanked = 0;
    for (let f = 1; f <= 6000; f++) {
      flushQueues(ram);
      runAnimObjects24683E(ram, rom);
      menu2911B0(ram, rom, a5, a6, ctx);
      if (ram.u16(a6 + 0x06) === 3 && !blanked) {
        for (const n of chainNodes(ram, ram.u32(a6 + 0x14))) { ram.setU32(n + 0x06, 0); blanked++; }
      }
    }
    assert.equal(blanked, 2, 'POSITIVE CONTROL: two nodes were blanked');
    assert.notEqual(ram.u8(a5 + 0x02), 2, 'and $2912DE never ran -- the outer slot is stuck');
    assert.equal(ram.u16(a6 + 0x06), 3, 'the menu itself is parked in state 3');
  });

test('W389 SECTION 3: hiscorename.js:338 -- `$246704`\'s reload chain drains AND FREES ITSELF',
  { skip: SKIP }, () => {
    // This site is the interesting one: `$28F520/$28F526` DISCARDS D0, so nobody ever calls
    // `$246800` on this chain. It has to retire on its own, and it does -- because `$246704`
    // writes D6 = 1 into `($4,slot)` and `$24683E` frees a mode-1 root once every node's `($18)`
    // has drained. Hollow nodes would have leaked the player slot forever.
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a4 = 0x812c00;
    const a5 = 0x812d00;
    ram.setU16(a4 + 0x1e, 0x30);      // TIMEOUT.counter at TIMEOUT.reload -- the $28F514 arm
    ram.setU16(a4 + 0x2e, 1);         // GRID_ROW.cursorField, so $28F50E does not bail
    assert.equal(nameCountdown28F4FC(ram, rom, a4, a5, ctx), 'reloaded', 'the reload arm ran');

    const slot = ANIM_OBJECT.roots;   // the first player slot; nothing else has claimed one
    assert.equal(ram.u16(slot) & 0x8000, 0x8000, 'and it claimed the first root');
    assert.equal(ram.u16(slot + 0x04), 1, '($4,slot) is 1 -- $246704\'s D6, the SELF-FREE mode');
    const nodes = chainNodes(ram, slot);
    assert.equal(nodes.length, 4, '$28FAD2\'s count word is 4');
    for (const [i, n] of nodes.entries()) {
      assert.equal(ram.u32(n + 0x06), 0x80fa66, `node ${i} ($6) is $80FA66 -- NOT ZERO`);
      assert.equal(ram.u32(n + 0x0e), 0x80e886 + 0x80 + i * 0x40,
        `node ${i} ($E) is the script's $80/$C0/$100/$140`);
    }
    let freed = 0;
    for (let f = 1; f <= 4000 && !freed; f++) freed = runAnimObjects24683E(ram, rom).freed;
    assert.equal(freed, 1, '$24683E retired the mode-1 root all by itself');
    assert.equal(ram.u16(slot), 0, 'and the player slot is released for the next chain');
  });

test('W389 SECTION 3 ABLATION: blank `$246704`\'s ($6) and the player slot LEAKS', { skip: SKIP },
  () => {
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a4 = 0x812c00;
    ram.setU16(a4 + 0x1e, 0x30);
    ram.setU16(a4 + 0x2e, 1);
    nameCountdown28F4FC(ram, rom, a4, 0x812d00, ctx);
    const slot = ANIM_OBJECT.roots;
    let blanked = 0;
    for (const n of chainNodes(ram, slot)) { ram.setU32(n + 0x06, 0); blanked++; }
    assert.equal(blanked, 4, 'POSITIVE CONTROL: four nodes blanked');
    let freed = 0;
    for (let f = 1; f <= 8000; f++) freed += runAnimObjects24683E(ram, rom).freed;
    assert.equal(freed, 0, 'nothing is ever retired...');
    assert.equal(ram.u16(slot) & 0x8000, 0x8000,
      '...and the root stays claimed for 8,000 frames. Three of these and every root is gone');
  });

test('W389 SECTION 3: hiscorescreen.js goes through the SAME path, and the cold boot still '
  + 'reaches arm 12', { skip: SKIP_T }, () => {
    // W388 seeded this site by hand and had to WITHHOLD `ctx` so the loader's note would not
    // record a lie about it. The fold removed the note, so `ctx` is passed here like anywhere
    // else. The measurement W388 pinned must be unchanged: state 2 built at +558, drained at
    // +574, sixteen frames later.
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot();
    g.ram.setU8(0x803957, 1);
    const marks = [];
    let prevS = -1, prevSub = -1;
    for (let f = 1; f <= 700; f++) {
      g.step(0xffff);
      const s = g.ram.u16(0x812e56), sub = g.ram.u16(SCREEN_STATE.state);
      if (s !== prevS || sub !== prevSub) { marks.push([f, s, sub]); prevS = s; prevSub = sub; }
    }
    assert.deepEqual(marks, [[1, 13, 0], [302, 2, 0], [319, 2, 1], [558, 2, 2], [574, 12, 2]],
      'unchanged from W388: the fold moved no frame');
  });

// ===============================================================================================
// SECTION 4 -- UNIT B. `$241292` TAKES THE ID LONG, AND SIX SITES HANDED IT THE TYPE WORD.
// ===============================================================================================

const KILL_SITES = Object.freeze([
  [0x288a34, 'objslot13.js:203', 'FIXED W389'],
  [0x291f1c, 'objslot15.js:153', 'FIXED W389'],
  [0x290774, 'objslot7pool.js:579', 'FIXED W389'],
  [0x290796, 'objslot7pool.js:592', 'FIXED W389'],
  // W390 CORRECTION (trap 14): these two said "STILL BROKEN -- outside W389's file list".
  // They are fixed. `w390arm9.test.js` SECTION 4 drives and ablates both.
  [0x25ceb0, 'objslot17.js:194', 'FIXED W390'],
  [0x25cac2, 'objslot9.js:512', 'FIXED W390'],
]);

test('W389 SECTION 4: all six sites are the SAME `jmp $241292`, so all six take the ID LONG',
  { skip: SKIP }, () => {
    for (const [addr, where, status] of KILL_SITES) {
      assert.equal(l(addr), 0x4ef90024, `$${addr.toString(16).toUpperCase()} (${where}) jmp abs.l`);
      assert.equal(w(addr + 4), 0x1292, `  ...$241292 -- ${status}`);
    }
    // And what $241292 does with A5, decoded once for all six.
    assert.equal(l(0x241292), 0x41ed004c, '$241292 lea ($4C,A5),A0 -- the ID field, NOT ($0,A5)');
    assert.equal(w(0x241296), 0x60a0, '$241296 bra.s...');
    assert.equal(0x241298 + (w(0x241296) & 0xff) - 0x100, 0x241238, '  ...to $241238');
    assert.equal(w(0x241252), 0x2290, '$241252 move.l (A0),(A1) -- a LONG read THROUGH A0');
    assert.equal(ALLOC.idOff, 0x4c, 'and $4C is what objalloc.js already names as the id offset');
    // The three constants this wave added, so nothing repeats the literal.
    assert.equal(SCREEN13.idAt, 0x4c, 'objslot13.js names it');
    assert.equal(SLOT15.idAt, 0x4c, 'objslot15.js names it');
    assert.equal(SLOT7.idAt, 0x4c, 'objslot7pool.js names it');
  });

test('W389 SECTION 4: slot [13] state 2 really kills its own record', { skip: SKIP }, () => {
    // DRIVEN, on a RAM where A5 IS a live allocator slot -- which is the only arrangement in
    // which the difference between ($0,A5) and ($4C,A5) can show.
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    const a5 = ALLOC.table;                             // slot 0 of the twenty
    ram.setU16(a5 + 0x00, 0x800d);                      // the type word, as $241182 wrote it
    ram.setU32(a5 + ALLOC.idOff, 0x00000007);           // and an id that is NOT $800D
    ram.setU8(a5 + SCREEN13.state, 2);                  // state 2: advance the selection and die
    objSlot13(ram, rom, a5, ctx);
    assert.equal(commitKills(ram), 1, '$241262 drained exactly one queued kill');
    assert.equal(ram.u16(ALLOC.table + 0x00), 0,
      'and the record is GONE -- $2411FC matched the queued id\'s low word against $0007');
  });

test('W389 SECTION 4 ABLATION: the type word is accepted and does nothing', { skip: SKIP }, () => {
  const mk = (type, id) => {
    const ram = new Ram();
    ram.setU16(ALLOC.table, type);
    ram.setU32(ALLOC.table + ALLOC.idOff, id);
    return ram;
  };
  for (const [type, id, name] of [[0x800d, 7, 'slot [13]'], [0x800f, 7, 'slot [15]'],
    [0x8007, 7, 'slot [7]']]) {
    const good = mk(type, id);
    queueKill(good, good.u32(ALLOC.table + ALLOC.idOff));    // WITH THE FIX
    assert.equal(commitKills(good), 1, `${name}: one kill drained`);
    assert.equal(good.u16(ALLOC.table), 0, `${name}: the record dies when the ID is queued`);

    const bad = mk(type, id);
    queueKill(bad, bad.u16(ALLOC.table));                     // ABLATED: the type word
    assert.equal(commitKills(bad), 1, `${name}: the bad kill drains too -- NOT dropped`);
    assert.equal(bad.u16(ALLOC.table), type,
      `${name}: and the record SURVIVES. killById walked all twenty slots and returned false, `
      + 'the queue reported OK, and nothing anywhere was told');
    assert.equal(killById(mk(type, id), type), false, `${name}: stated directly`);
    assert.equal(killById(mk(type, id), id), true, `${name}: ...and the id matches`);
  }
});

// ===============================================================================================
// SECTION 5 -- UNIT C. ARM 12'S SCREEN, AND WHAT THE BRIEF GOT WRONG ABOUT IT.
// ===============================================================================================
//
// The brief said arm 12's wait is on the `$24641A` chain its INIT builds, and that because
// `$24641A` already seeds content the arm "may drain the moment it is transcribed". **It does not.**
// The init's chain is what state 0 waits on; state 1 loads a SECOND chain, from a SECOND script, and
// it does so through `$246710` -- so state 2's wait is on a chain that only this wave's fold makes
// live. Arm 12 is arm 2's twin far more exactly than the brief claimed, defect included.

test('W389 SECTION 5: arm 12\'s init is $25C2AE..$25C2E9 with the `rts` AT $25C2E8', { skip: SKIP },
  () => {
    assert.equal(l(0x25c2ae), 0x48e7fffe, '$25C2AE movem.l D0-D7/A0-A6,-(A7)');
    assert.equal(w(0x25c2b2), 0x41f9, '$25C2B2 lea abs.l,A0');
    assert.equal(l(0x25c2b4), SCREEN12.state, `  ...$${SCREEN12.state.toString(16).toUpperCase()}`);
    assert.equal(w(0x25c2b8), 0x303c, '$25C2B8 move.w #imm,D0');
    assert.equal(w(0x25c2ba), 3, '  ...#$3 -- and TRAP 2: `dbra` runs FOUR times, four words');
    assert.equal(w(0x25c2c0), 0x51c8, '$25C2C0 dbra D0');
    assert.equal(w(0x25c2c4), 0x33fc, '$25C2C4 move.w #imm,abs.l');
    assert.equal(w(0x25c2c6), SCREEN12.timerInit, '  ...#$F0 -- the same $F0 arm 2 uses');
    assert.equal(l(0x25c2c8), SCREEN12.timer, `  ...into $${SCREEN12.timer.toString(16)
      .toUpperCase()}`);
    // TRAP 4 AGAIN. `lea (d16,PC)` from the EXTENSION WORD.
    assert.equal(w(0x25c2cc), 0x41fa, '$25C2CC lea (d16,PC),A0');
    assert.equal(0x25c2ce + w(0x25c2ce), SCREEN12.initScript,
      '  ...$25C2CE + $EA = $25C3B8, the INIT script');
    assert.equal(l(0x25c2d2), 0x4eb90024, '$25C2D2 jsr abs.l...');
    assert.equal(w(0x25c2d6), 0x641a, '  ...$24641A -- `loadAnimObjects246410` with mode 0');
    assert.equal(l(0x25c2da), SCREEN12.handle, '$25C2D8 move.l D0,$812E76');
    assert.equal(l(0x25c2de), 0x4eb90025, '$25C2DE jsr abs.l...');
    assert.equal(w(0x25c2e2), 0xbb6c, `  ...$25BB6C -- counted, it is a $900000 TX block`);
    // TRAP 5: the `rts` sits AT $25C2E8, so the routine is $25C2AE..$25C2E9 -- 60 bytes.
    assert.equal(l(0x25c2e4), 0x4cdf7fff, '$25C2E4 movem.l (A7)+,D0-D7/A0-A6');
    assert.equal(w(0x25c2e8), 0x4e75, '$25C2E8 rts -- AT the last address, not after it');
    assert.equal(0x25c2ea - 0x25c2ae, 60, 'so the init is 60 bytes, as the brief said');
  });

test('W389 SECTION 5: the brief is WRONG -- state 2 waits on a `$246710` chain, not `$24641A`\'s',
  { skip: SKIP }, () => {
    // STATE 0 is what waits on the init's chain.
    assert.equal(w(0x25c2ee), 0x0c79, '$25C2EE cmpi.w #imm,abs.l');
    assert.equal(w(0x25c2f0), 0, '  ...#$0');
    assert.equal(l(0x25c2f2), SCREEN12.state, '  ...against $812E72');
    assert.equal(w(0x25c300), 0x4eb9, '$25C300 jsr abs.l');
    assert.equal(l(0x25c302), 0x0024681a, '  ...$24681A -- the checker, on the INIT chain');
    assert.equal(l(0x25c30a), 0x4eb90024, '$25C30A jsr abs.l...');
    assert.equal(w(0x25c30e), 0x6800, '  ...$246800 -- and state 0 FREES it');

    // STATE 1 loads a SECOND chain, from a SECOND script, through the OTHER loader.
    assert.equal(w(0x25c334), 0x41fa, '$25C334 lea (d16,PC),A0');
    assert.equal(0x25c336 + w(0x25c336), SCREEN12.loadScript,
      '  ...$25C336 + $A0 = $25C3D6 -- NOT $25C3B8, a DIFFERENT script');
    assert.equal(l(0x25c33a), 0x4eb90024, '$25C33A jsr abs.l...');
    assert.equal(w(0x25c33e), 0x6710, '  ...**$246710**, the loader whose content THIS WAVE folded');

    // STATE 2 waits on THAT one.
    assert.equal(l(0x25c35c), SCREEN12.handle, '$25C35A move.l $812E76,D0 -- reloaded');
    assert.equal(l(0x25c360), 0x4eb90024, '$25C360 jsr abs.l...');
    assert.equal(w(0x25c364), 0x681a, '  ...$24681A');
    assert.equal(l(0x25c36a), 0x4eb90024, '$25C36A jsr abs.l...');
    assert.equal(w(0x25c36e), 0x6800, '  ...$246800');

    // The two script shapes prove the two loaders really are different here: $25C3B8 is the
    // FOURTEEN-byte-per-node table `$246410` reads, $25C3D6 the EIGHT-byte one `$246710` reads.
    assert.equal(w(SCREEN12.initScript), 2, '$25C3B8 count word is 2');
    assert.equal(SCREEN12.initScript + 2 + 2 * 14, SCREEN12.loadScript,
      '...and 2 + 2*14 = $1E lands EXACTLY on $25C3D6. The bound is in the data, not an absence');
    assert.equal(w(SCREEN12.loadScript), 2, '$25C3D6 count word is 2');
    assert.equal(SCREEN12.loadScript + 2 + 2 * 8, 0x25c3e8,
      '...and 2 + 2*8 = $12 lands EXACTLY on $25C3E8');
    assert.equal(w(0x25c3e8), 0x48e7, '  ...which is `movem.l` -- arm 9\'s init, the next routine');
  });

test('W389 SECTION 5: the two exits are arm 2\'s exactly -- carry SET runs, carry CLEAR finishes',
  { skip: SKIP }, () => {
    assert.equal(w(0x25c374), 0x6100, '$25C374 bsr.w -- the draw');
    assert.equal(0x25c376 + w(0x25c376), SCREEN12.draw, '  ...$25C376 + $26 = $25C39C');
    assert.equal(l(0x25c37c), 0x007c0001, '$25C37C ori.w #$1,SR -- CARRY SET, still running');
    assert.equal(w(0x25c380), 0x4e75, '$25C380 rts');
    assert.equal(w(0x25c386), 0x3000, '$25C386 move.w D0,D0 -- CARRY CLEAR, finished');
    assert.equal(w(0x25c388), 0x4e75, '$25C388 rts');
    // ...and the draw is ONE register-convention enqueue with four immediates and a tail jump.
    assert.equal(w(SCREEN12.draw), 0x223c, '$25C39C move.l #imm,D1');
    assert.equal(l(0x25c39e), SCREEN12.drawD1, '  ...#$20000E00');
    assert.equal(l(0x25c3a4), SCREEN12.drawD2, '$25C3A2 move.l #$00336164,D2');
    assert.equal(w(0x25c3aa), SCREEN12.drawD3, '$25C3A8 move.w #$1870,D3');
    assert.equal(w(0x25c3ae), 0, '$25C3AC move.w #$0,D4');
    assert.equal(l(0x25c3b0), 0x4ef90023, '$25C3B0 jmp abs.l...');
    assert.equal(w(0x25c3b4), 0xdece, '  ...$23DECE -- a TAIL jump, so the bsr returns from here');
    assert.equal(SCREEN12.emit, 0x23dece, 'which is the stub objslot8.js names');
  });

// **W390 AND THEN W391 RE-BASE THE TAIL OF THIS LIST, AND ONLY THE TAIL.** Arm 9's screen
// ($25C3E8/$25C424) is ported now too, so the machine does not stop at 9; and W391 ports arm 1's
// ($25BBB4/$25BD7C), so it does not stop at 1 either -- it drains arm 1's two chains and its $1E0
// timer and hands on to arm 5 at +1,918. Everything this test is NAMED for -- arm 12 running its
// screen and advancing to 9 at +878 -- is measured unchanged; the fifth and sixth entries are new
// and arm 12's own screen state is still checked at 2.
test('W389 SECTION 5: on a real cold boot arm 12 RUNS ITS SCREEN and advances to arm 9',
  { skip: SKIP_T }, () => {
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot();
    g.ram.setU8(0x803957, 1);
    const marks = [];
    let prev = -1;
    for (let f = 1; f <= 3000; f++) {
      g.step(0xffff);
      const s = g.ram.u16(0x812e56);
      if (s !== prev) { marks.push([f, s]); prev = s; }
    }
    assert.deepEqual(marks, [[1, 13], [302, 2], [574, 12], [878, 9], [1182, 1], [1918, 5]],
      'the sequencer now runs 13 -> 2 -> 12 -> 9 -> 1 -> 5 with no hand-holding. Arm 12 no '
      + 'longer parks (W389), arm 9 no longer parks (W390) and arm 1 no longer parks (W391)');
    assert.deepEqual(marks.slice(0, 4).map((m) => m[1]), [13, 2, 12, 9],
      '...and the four this test was written for are unchanged, frame numbers included');
    // The two chains, in order, and both really drained.
    assert.equal(g.ram.u16(SCREEN12.state), 2, 'arm 12 left its screen in state 2, the exit state');
  });
