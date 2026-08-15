// ===============================================================================================
// W388 -- WHY SLOT [8] ARM 2 NEVER FINISHED, AND THE 90 BYTES THAT WERE MISSING.
// ===============================================================================================
//
// THE ANSWER IN ONE LINE: **`$246710`'s per-node CONTENT seeding was not ported, so every node of
// the high-score screen's palette chain had a ZERO executor pointer at `($6)`, and
// `runAnimObjects24683E` skips exactly those.** The nodes were allocated, linked and given the
// `$FFFF0000` lifetime; nothing ever decremented it; `chainCheck24681A` never summed to zero; and
// `$25B412` state 2 waited forever. NOT A GATE -- there is no branch in the cartridge that holds
// here, and W379 named the right routine two waves before anyone ran it.
//
// WHAT MAKES THE DIAGNOSIS EXACT rather than plausible: the SAME SCREEN loads TWO chains through
// TWO DIFFERENT LOADERS, and only one of them was hollow.
//
//   state 0's chain   `hiscoreInit25B3DC` -> `$24641A` -> `loadAnimObjects246410`  CONTENT PORTED
//   state 2's chain   `$25B454/$25B45A`   -> `$246710` -> `chainLoaderBody`        CONTENT ABSENT
//
// State 0 advanced on its first frame and state 2 never advanced at all. One screen, two loaders,
// one difference. SECTION 3 measures both halves on a real cold boot.
//
// THE THREE TABLES the seeding reads ALL HAVE DECLARED ROM WINDOWS ALREADY -- `$24627A` and
// `$246B38` from W341, `$246BB8` from W91 -- and the script `$25BAAA` from W303. **This wave adds
// no window and widens none**, and SECTION 2 asserts that against `tools/export-tables.py`.
//
// ALSO IN THIS WAVE, both proven here on the real path:
//   UNIT B  `objslot14.js` handed `queueKill` the TYPE WORD where `$241292` takes the ID, so the
//           type-$E object never died. SECTION 5.
//   UNIT C  slot [12]'s teardown COUNTED its two transcribed clears instead of calling them.
//           SECTION 6.
//
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { Ram } from '../src/ram.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { ALLOC, killById, queueKill, commitKills } from '../src/objalloc.js';
import { SLOT14 } from '../src/objslot14.js';
import { SCREEN_STATE } from '../src/hiscorescreen.js';
import { CHAIN_CONTENT, ANIM_OBJECT } from '../src/animobjects.js';
import { TALLY } from '../src/tally.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ROM = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(ROM) ? false : 'no rip';
const IMG = readFileSync(ROM);
const tablesJson = JSON.parse(readFileSync(here('../rip/port/player.tables.json'), 'utf8'));

const b = (a) => IMG[a];
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const NO_PLAYER = 0xffff;
const STATE = 0x812e56;               // SCREEN8.state
const SUB = 0x812e5c;                 // SCREEN_STATE.state
const coinWord = () => (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;

/** A plain cold boot -- no coin, no START. The attract sequencer's own idle path. */
function coldBoot(n) {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  for (let i = 0; i < n; i++) g.step(NO_PLAYER);
  return g;
}

/** `w387slot12.test.js`'s chain, unchanged: the only path that reaches slot [12]'s teardown. */
function bootToGameplay() {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  const run = (n, coin = COIN.idle, player = NO_PLAYER) => {
    g.coinPort = coin;
    for (let i = 0; i < n; i++) g.step(player);
  };
  run(20); run(380); run(20, coinWord()); run(10);
  run(20, COIN.idle, portWordFromBits([BIT.start]));
  assert.equal(g.ram.u16(STATE), 0x000e, 'the harness must reach gameplay before measuring');
  return g;
}

const liveTypes = (g) => {
  const s = new Set();
  for (let i = 0; i < ALLOC.slots; i++) {
    const t = g.ram.u16(ALLOC.table + i * ALLOC.stride);
    if (t !== 0) s.add(t & 0xff);
  }
  return s;
};

// ===============================================================================================
// SECTION 1 -- THE 90 BYTES, DECODED. EVERY OPERAND FROM THE IMAGE.
// ===============================================================================================

test('W388 SECTION 1: $24676A..$2467C3 is the content seeding, and its two `lea`s resolve to the '
  + 'two tables W341 already declared', { skip: SKIP }, () => {
  // TRAP 4 IS THE WHOLE OF THIS TEST. `lea (d16,PC)` takes the EXTENSION WORD's address plus the
  // displacement -- not the opcode's address. Both `lea`s here are backward/forward by amounts
  // that resolve to a wrong table if the opcode address is used instead.
  assert.equal(w(0x24676a), 0x47fa, '$24676A lea (d16,PC),A3');
  const d1 = w(0x24676c) - 0x10000;                    // $FB0E, negative
  assert.equal(d1, -0x4f2, '  ...displacement -$4F2');
  assert.equal(0x24676c + d1, CHAIN_CONTENT.dispatch,
    '  ...EXTENSION WORD address $24676C + (-$4F2) = $24627A, the 3-entry dispatch table');
  assert.notEqual(0x24676a + d1, CHAIN_CONTENT.dispatch,
    '  POSITIVE CONTROL: from the OPCODE address it would resolve to $246278, which is not it');

  assert.equal(w(0x246794), 0x47fa, '$246794 lea (d16,PC),A3');
  assert.equal(w(0x246796), 0x03a2, '  ...displacement +$3A2');
  assert.equal(0x246796 + 0x3a2, CHAIN_CONTENT.timingTable,
    '  ...$246796 + $3A2 = $246B38, the 32-entry timing table');

  // THE STORE THAT WAS MISSING. `move.l ($4,A3,D2.w),($6,A2)` -- the executor pointer.
  assert.equal(w(0x24676e), 0x2573, '$24676E move.l (d8,A3,Xn),(d16,A2)');
  assert.equal(w(0x246770), 0x2004, '  ...source ($4,A3,D2.w) -- D2 is the family word');
  assert.equal(w(0x246772), 0x0006, '  ...destination ($6,A2) -- THE FIELD $24683E TESTS');

  // THE TARGET IS A CONSTANT, not a script field, which is what makes this chain a fade to one
  // colour rather than to a block.
  assert.equal(w(0x24677e), 0x257c, '$24677E move.l #imm,(d16,A2)');
  assert.equal(l(0x246780), CHAIN_CONTENT.targetBank, '  ...#$246BB8');
  assert.equal(w(0x246784), 0x000a, '  ...into ($A,A2), the target cursor');

  // AND THE PARTNER OF THAT CONSTANT: ($1E,node) = 1, set by the ALLOCATOR at $246762, which is
  // what makes `stepNode`'s target stride ZERO -- one ROM colour re-read for the whole range.
  assert.equal(w(0x246762), 0x357c, '$246762 move.w #imm,(d16,A2)');
  assert.equal(w(0x246764), 0x0001, '  ...#$1');
  assert.equal(w(0x246766), 0x001e, '  ...into ($1E,A2), the `shared` word');

  // The snapshot loop, and its `dbra` -- trap 2. `move.w ($4,A2),D4` is words-MINUS-ONE, so the
  // loop body runs D4+1 times and the range is inclusive.
  assert.equal(w(0x2467b6), 0x382a, '$2467B6 move.w (d16,A2),D4');
  assert.equal(w(0x2467b8), 0x0004, '  ...($4,A2), the words-minus-one this routine just stored');
  assert.equal(w(0x2467ba), 0x49ea, '$2467BA lea (d16,A2),A4');
  assert.equal(w(0x2467bc), 0x0030, '  ...($30,A2), the snapshot area');
  assert.equal(w(0x2467be), 0x38db, '$2467BE move.w (A3)+,(A4)+ -- SNAPSHOT, no fill');
  assert.equal(w(0x2467c0), 0x51cc, '$2467C0 dbra D4');
  assert.equal(w(0x2467c2) - 0x10000, -4, '  ...back to $2467BE');

  // THE BOUND, FROM THE CODE. $2467C4 is `subq.w #1,D0` -- the ALLOCATION loop's counter, not
  // this block's -- so the content block ends at $2467C3. Never proven by an absence.
  assert.equal(w(0x2467c4), 0x5340, '$2467C4 subq.w #1,D0 -- the allocator resumes here');
  assert.equal(CHAIN_CONTENT.end, 0x2467c4, 'CHAIN_CONTENT.end is that address');
  assert.equal(CHAIN_CONTENT.end - CHAIN_CONTENT.site, 90, '...so the block is 90 bytes');
});

test('W388 SECTION 1: the node-loop `dbra` at $2467CE closes back over the seeding, which is what '
  + 'makes it per-node', { skip: SKIP }, () => {
  assert.equal(w(0x2467ca), 0x45ea, '$2467CA lea (d16,A2),A2');
  assert.equal(w(0x2467cc), 0x0070, '  ...($70,A2) -- the pool stride, so A2 walks to the next node');
  assert.equal(ANIM_OBJECT.nodeStride, 0x70, '  ...which is the stride animobjects.js already names');
  assert.equal(w(0x2467ce), 0x51ce, '$2467CE dbra D6');
  const back = w(0x2467d0) - 0x10000;
  assert.equal(0x2467d0 + back, 0x24673e,
    '  ...back to $24673E, the POOL SCAN -- so allocation and seeding are one loop');
});

// ===============================================================================================
// SECTION 2 -- THE SCRIPT AND THE THREE TABLES. NO WINDOW IS ADDED OR WIDENED.
// ===============================================================================================

test('W388 SECTION 2: $25BAAA is EIGHT nodes of FOUR words, and $42 is exactly W303\'s window',
  { skip: SKIP }, () => {
    assert.equal(w(SCREEN_STATE.script), 8, '$25BAAA\'s count word is 8');
    assert.equal(SCREEN_STATE.scriptNodes, 8, '...which is what hiscorescreen.js names');
    // THE BOUND IS THE CODE'S: 2 + count * (4 words) = $42, and W303's declared window is $42.
    assert.equal(2 + 8 * CHAIN_CONTENT.wordsPerNode * 2, 0x42,
      'a count word plus 8 x 4 words is $42 bytes, exactly the declared window length');

    // Every family word must be one of the three $24627A rows, or `stepNode` has no writer.
    const fams = [];
    for (let i = 0; i < 8; i++) fams.push(w(0x25baac + i * 8));
    assert.deepEqual(fams, [0, 0, 0, 0, 0, 0, 0, 8],
      'seven nodes on family $00 and one on family $08 -- both are real $24627A rows');
    for (let i = 0; i < 8; i++) {
      assert.equal(w(0x25baac + i * 8 + 4), 0x1f, `node ${i} covers $20 words (words-minus-one $1F)`);
      assert.equal(w(0x25baac + i * 8 + 6), 2, `node ${i} uses timing index 2`);
    }
    // ...and timing index 2 is `{reload 0, step 2}`, which is what makes the fade 16 frames.
    assert.equal(w(CHAIN_CONTENT.timingTable + 2 * 4), 0, '$246B38[2] reload word is 0');
    assert.equal(w(CHAIN_CONTENT.timingTable + 2 * 4 + 2), 2, '...and its step word is 2');
    assert.equal(0x20 / 2, 16, 'so ($20,node) climbs 0,2,..,$20 and terminates on the 16th frame');
  });

test('W388 SECTION 2: the $24627A table the seeding indexes is the one animobjects.js hardcodes',
  { skip: SKIP }, () => {
    // If these ever disagreed, the ported TARGETS map would be seeding the wrong dirty word and
    // the palette upload would go to the wrong bank. Read off the image, not off the port.
    const rows = [[0x80e886, 0x80fa66], [0x80f086, 0x80fa68], [0x80f886, 0x80fa6a]];
    for (let i = 0; i < 3; i++) {
      assert.equal(l(CHAIN_CONTENT.dispatch + i * 8), rows[i][0],
        `$24627A[${i}] +$0 is the palette base $${rows[i][0].toString(16).toUpperCase()}`);
      assert.equal(l(CHAIN_CONTENT.dispatch + i * 8 + 4), rows[i][1],
        `  ...and +$4 is the dirty word $${rows[i][1].toString(16).toUpperCase()}`);
    }
  });

test('W388 SECTION 2: $246BB8 is BLACK, so this chain is a FADE TO BLACK', { skip: SKIP }, () => {
  for (let i = 0; i < 32; i++) {
    assert.equal(w(CHAIN_CONTENT.targetBank + i * 2), 0,
      `$246BB8 word ${i} is $0000 -- W91 already classified this bank as the all-zero one`);
  }
});

test('W388 SECTION 2: this wave declares NO new ROM window and widens none', { skip: SKIP }, () => {
  // The four addresses the seeding touches, and the wave that declared each. Asserted against
  // `tools/export-tables.py` itself so a later edit that removes one is caught here.
  const src = readFileSync(here('../tools/export-tables.py'), 'utf8');
  for (const [addr, len] of [[0x24627a, 0x18], [0x246b38, 0x80],
    [0x246bb8, 0x80], [0x25baaa, 0x42]]) {
    const decl = `(0x${addr.toString(16).toUpperCase()}, 0x${len.toString(16).toUpperCase()
      .padStart(4, '0')}`;
    assert.ok(src.includes(decl),
      `${decl}...) is already declared -- W388 reuses it rather than widening anything`);
  }
  // And the port reads nothing outside them: a RomWindows face would throw otherwise, and
  // SECTION 3's cold boot runs on exactly that face without stopping.
});

// ===============================================================================================
// SECTION 3 -- THE REAL COLD BOOT. ARM 2 FINISHES.
// ===============================================================================================

const RUN = (() => {
  if (SKIP) return null;
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  const marks = [];
  let prevS = -1, prevSub = -1, seedFrame = 0, nodeSnapshot = null;
  for (let f = 1; f <= 5000; f++) {
    g.step(NO_PLAYER);
    const s = g.ram.u16(STATE), sub = g.ram.u16(SUB);
    if (s !== prevS || sub !== prevSub) { marks.push([f, s, sub]); prevS = s; prevSub = sub; }
    // The frame the state-2 chain is built: capture the head node before it starts fading.
    if (sub === 2 && !seedFrame) {
      seedFrame = f;
      const head = g.ram.u32(g.ram.u32(SCREEN_STATE.handle) + 0x2c);
      nodeSnapshot = {
        head,
        writer: g.ram.u32(head + 0x06),
        target: g.ram.u32(head + 0x0a),
        current: g.ram.u32(head + 0x0e),
        words: g.ram.u16(head + 0x04),
        reload: g.ram.u16(head + 0x16),
        step: g.ram.u16(head + 0x1c),
        shared: g.ram.u16(head + 0x1e),
        life: g.ram.u16(head + 0x18),
        nodes: g.animFrame.nodes,
      };
    }
  }
  return { g, marks, seedFrame, nodeSnapshot };
})();

test('W388 SECTION 3: the attract sequencer ADVANCES 13 -> 2 -> 12 on a plain cold boot',
  { skip: SKIP }, () => {
    assert.deepEqual(RUN.marks, [
      [1, 13, 0],      // the warning screen
      [302, 2, 0],     // its $12C timeout hands over to the high-score screen
      [319, 2, 1],     // state 0's chain (the $246410 one) finished -- it always did
      [558, 2, 2],     // the $F0 countdown fired and state 2's chain was built
      [574, 12, 2],    // ...and SIXTEEN FRAMES LATER it drained. This line is the wave.
    ], 'the full transition list, with no state visited twice');
  });

test('W388 SECTION 3: the head node is seeded with a REAL executor pointer, a constant target '
  + 'and a snapshot', { skip: SKIP }, () => {
  const n = RUN.nodeSnapshot;
  assert.equal(RUN.seedFrame, 558, 'state 2 is entered at +558');
  // THE FIELD THE WHOLE BUG WAS ABOUT. Zero here means `$24683E` skips the node.
  assert.equal(n.writer, 0x80fa66, '($6) is $80FA66 -- $24627A[0]+$4, the family-0 dirty word');
  assert.equal(n.target, CHAIN_CONTENT.targetBank, '($A) is the constant $246BB8');
  assert.equal(n.current, 0x80e886, '($E) is $80E886 + the script offset 0');
  assert.equal(n.words, 0x1f, '($4) is $1F -- $20 palette words');
  assert.equal(n.reload, 0, '($16) is 0, from $246B38[2]');
  assert.equal(n.step, 2, '($1C) is 2, from the same row');
  assert.equal(n.shared, 1, '($1E) is 1 -- the allocator\'s, and what zeroes the target stride');
  assert.equal(n.life, 0xffff, '($18) is $FFFF: the lifetime is armed, not yet drained');
  assert.equal(n.nodes, 8, 'and $24683E is walking all eight');
});

test('W388 SECTION 3: the chain really drains, and the palette really ends BLACK',
  { skip: SKIP }, () => {
    // At +574 the screen reported finished. Its palette is the thing that was fading.
    for (let i = 0; i < 32; i++) {
      assert.equal(RUN.g.ram.u16(0x80e886 + i * 2), 0,
        `$80E886 word ${i} faded to $0000, the $246BB8 target`);
    }
    assert.equal(RUN.g.ram.u16(0x80f086), 0, 'and node 7\'s family-$08 range faded too');
    // `$25B488 jsr $246800` freed the chain on the way out.
    assert.equal(RUN.g.animFrame.nodes, 0, 'no chain is walked any more -- $246800 freed it');
    assert.equal(RUN.g.ram.u16(RUN.nodeSnapshot.head), 0, '...and the head node\'s id word is clear');
    assert.equal(RUN.g.ram.u16(STATE), 0x000c, 'the sequencer rests on arm 12');
  });

// ===============================================================================================
// SECTION 4 -- THE ABLATION. THIS IS THE WAVE'S DELIVERABLE.
// ===============================================================================================

test('W388 SECTION 4 ABLATION: blank the ONE field the seeding adds and the machine parks at '
  + 'state 2 for 40,000 frames', { skip: SKIP }, () => {
  // THE ABLATION IS EXACTLY THE PORT'S OLD STATE, and nothing else: `chainLoaderBody` allocated
  // these nodes and left `($6)` zero. Here the identical cold boot runs, and on the frame the
  // chain is built the eight writers are zeroed again -- the pre-W388 machine, reconstructed on
  // the real path rather than described.
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  let blanked = 0;
  for (let f = 1; f <= 40000; f++) {
    g.step(NO_PLAYER);
    if (g.ram.u16(SUB) === 2 && !blanked) {
      let node = g.ram.u32(g.ram.u32(SCREEN_STATE.handle) + 0x2c);
      while (node !== 0) { g.ram.setU32(node + 0x06, 0); blanked++; node = g.ram.u32(node + 0x2c); }
    }
  }
  assert.equal(blanked, 8, 'POSITIVE CONTROL: there really were eight nodes to blank');
  assert.equal(g.ram.u16(SUB), 2, 'the screen is stuck in its own state 2...');
  assert.equal(g.ram.u16(STATE), 0x0002, '...and the sequencer never leaves arm 2, for 40,000 '
    + 'frames -- which is the defect W376 measured and W388 removed');
  assert.equal(g.animFrame.nodes, 8, 'all eight nodes are still walked every frame...');
  assert.equal(g.animFrame.freed, 0, '...and not one of them ever expires');
  assert.notEqual(g.ram.u16(0x80e886), 0, 'and the palette never faded: nothing ever stepped');

  // SIDE BY SIDE with the unablated run, so the delta is one field and not a memory.
  assert.equal(RUN.g.ram.u16(STATE), 0x000c, 'WITH the seeding: arm 12 by +574');
});

// ===============================================================================================
// SECTION 5 -- UNIT B. `$241292` TAKES THE ID, AND `objslot14.js` GAVE IT THE TYPE WORD.
// ===============================================================================================

test('W388 SECTION 5: $241292 is `lea ($4C,A5),A0` and the queue stores the LONG THROUGH A0',
  { skip: SKIP }, () => {
    assert.equal(l(0x288c62), 0x4ef90024, '$288C62 jmp abs.l...');
    assert.equal(w(0x288c66), 0x1292, '  ...$241292 -- a TAIL jump, so slot [14] never returns');
    assert.equal(l(0x241292), 0x41ed004c, '$241292 lea ($4C,A5),A0 -- the ID field');
    assert.equal(w(0x241296), 0x60a0, '$241296 bra.s...');
    assert.equal(0x241298 + (w(0x241296) & 0xff) - 0x100, 0x241238, '  ...to $241238');
    assert.equal(w(0x241252), 0x2290, '$241252 move.l (A0),(A1) -- a LONG read THROUGH A0');
    assert.equal(SLOT14.idAt, 0x4c, 'and objslot14.js names $4C rather than repeating a literal');
    assert.equal(ALLOC.idOff, 0x4c, '...the same offset objalloc.js already named');
    // The type word at ($0,A5) is a different field entirely, and that is what was passed.
    assert.equal(b(0x241292 + 3), 0x4c, 'the displacement byte really is $4C and not $00');
  });

test('W388 SECTION 5: on a real cold-boot-to-gameplay run the type-$E object DIES',
  { skip: SKIP }, () => {
    const g = bootToGameplay();
    let sawE = false;
    for (let f = 1; f <= 5000; f++) { g.step(NO_PLAYER); if (liveTypes(g).has(0x0e)) sawE = true; }
    assert.ok(sawE, 'POSITIVE CONTROL: dispatch type $E really was created during the run');
    assert.ok(!liveTypes(g).has(0x0e),
      'and it is GONE at +5,000 -- its queued kill matched and $2411E2 vacated the slot');
  });

test('W388 SECTION 5 ABLATION: the type word never matches, the id always does',
  { skip: SKIP }, () => {
    // The defect, isolated to the value. `killById` compares SIXTEEN BITS of the longword id
    // (`$2411FC cmp.w`), so the question is only ever "which 16 bits were queued".
    const mk = () => {
      const ram = new Ram(new Uint8Array(0x20000));
      ram.setU16(ALLOC.table, 0x800e);                  // the type word, as slot [14] stores it
      ram.setU32(ALLOC.table + ALLOC.idOff, 0x00000001); // the id, as $241182 assigned it
      return ram;
    };
    // WITH THE FIX: the id is queued, and the record dies.
    const good = mk();
    queueKill(good, good.u32(ALLOC.table + ALLOC.idOff));
    assert.equal(commitKills(good), 1, 'one kill drained');
    assert.equal(good.u16(ALLOC.table), 0, 'the record is GONE -- the id matched');

    // ABLATED: the type word is queued instead, exactly as objslot14.js:68 used to.
    const bad = mk();
    queueKill(bad, bad.u16(ALLOC.table));
    assert.equal(commitKills(bad), 1, 'one kill drained here too -- it is not silently dropped');
    assert.equal(bad.u16(ALLOC.table), 0x800e,
      'and the record SURVIVES: $800E never equals $0001, so killById walked all 20 slots and '
      + 'returned false. The kill was accepted and did nothing, which is why it went unnoticed');
    assert.equal(killById(mk(), 0x800e), false, 'stated directly: the type word matches nothing');
    assert.equal(killById(mk(), 0x0001), true, '...and the id matches');
  });

// ===============================================================================================
// SECTION 6 -- UNIT C. THE TWO TRANSCRIBED CLEARS ARE CALLED.
// ===============================================================================================

test('W388 SECTION 6: slot [12]\'s teardown wipes both spans on the REAL game-over path',
  { skip: SKIP }, () => {
    const g = bootToGameplay();
    // THE TEARDOWN FRAME, identified by the field only `$2603DA` clears: the tally block's
    // pointer word at ($8,$8130FA), which `$25FE70` installs during gameplay and nothing else
    // ever zeroes. `$8103E6` is NOT a usable marker -- it goes to zero on its own at +3,065 when
    // the player object dies, which is a different event entirely.
    const PTR = TALLY.side0 + TALLY.ptr;
    let ptrLive = 0, teardownFrame = 0, playerLive = false;
    for (let f = 1; f <= 14000; f++) {
      g.step(NO_PLAYER);
      if (g.ram.u32(PTR) !== 0) { ptrLive = f; playerLive = playerLive || g.ram.u16(0x8103e6) !== 0; }
      else if (ptrLive && !teardownFrame) teardownFrame = f;
    }
    assert.ok(playerLive, 'POSITIVE CONTROL: the player subsystem really was live in this run');
    assert.ok(ptrLive > 1000, `POSITIVE CONTROL: ($8,$8130FA) was installed and held to +${ptrLive}`);
    assert.ok(teardownFrame > 4000,
      `and the teardown landed at +${teardownFrame}, after the game over`);
    assert.equal(g.ram.u16(0x8103e6), 0, '$24A810 blanked the player span');
    assert.equal(g.ram.u16(0x812976), 0, '...to its last word $812976');
    assert.equal(g.ram.u16(0x81308c), 0, '$2603DA blanked the rank span');
    assert.equal(g.ram.u16(0x813156), 0, '...to its last word $813156');
    assert.equal(g.ram.u16(0x8130be), 0xffff, '...and re-armed $8130BE to $FFFF afterwards');
    assert.equal(g.ram.u16(0x8130c0), 0xffff, '...and $8130C0');
  });

test('W388 SECTION 6: both clears are straight-line, which is why these two and not the third',
  { skip: SKIP }, () => {
    // $24A810 -- six instructions, no branch, no call, `rts` at $24A822.
    assert.equal(w(0x24a810), 0x303c, '$24A810 move.w #imm,D0');
    assert.equal(w(0x24a812), 0x12c8, '  ...#$12C8, so the dbra runs $12C9 times (trap 2)');
    assert.equal(w(0x24a822), 0x4e75, '$24A822 rts -- and nothing between is a jsr or a bcc');
    // $2603DA -- seven instructions, `rts` at $2603FC.
    assert.equal(w(0x2603da), 0x41f9, '$2603DA lea abs.l,A0');
    assert.equal(l(0x2603dc), 0x0081308c, '  ...$81308C');
    assert.equal(w(0x2603e0), 0x303c, '$2603E0 move.w #imm,D0');
    assert.equal(w(0x2603e2), 0x0065, '  ...#$65, so $66 words = $81308C..$813157');
    assert.equal(w(0x2603fc), 0x4e75, '$2603FC rts');
    // $259C4A is the one that STAYS counted, and this is why: it contains a jsr.
    assert.equal(w(0x259ca0), 0x4eb9, '$259CA0 is a jsr -- $259C4A is NOT straight-line');
  });
