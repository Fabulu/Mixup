// WAVE 435 -- DEV-2 IS NOT A PRESENTATION GAP. THE DRIVER WAS PORTED IN W91.
//
// ---------------------------------------------------------------------------
// WHAT THE BRIEF ASKED FOR, AND WHAT IT ACTUALLY WAS
// ---------------------------------------------------------------------------
// W434 left two pool-B segments red on `out/w69/stage1-laser-hold` and called
// the second one "six slots the PORT KEEPS ALIVE that the BOARD HAS BLANKED --
// a lifetime defect". [M] MEASURED, IT IS NEITHER OF THOSE THINGS. At lf10400
// the board's pool B is not "blanked", it is EMPTY -- 0 of 80 slots carry a
// non-zero byte -- and the port's six records are not slots it failed to free.
// They are the stage-2 intro's own effects, spawned CORRECTLY but THIRTY-ONE
// FRAMES EARLY, because the port left the stage-1 -> stage-2 transition early.
//
//   [M] board: $8130D2 (the background freeze) goes 1 -> 0 at lf10334
//   [M] port, before this wave:                            lf10303
//
// So the segment is a TIMING divergence in the stage end, and pool B is only
// where it showed. lf10400 alone could never have said so: both sides are an
// empty array there. The rung that carries the evidence is lf10500, where the
// board has six records and the port must produce the same six.
//
// ---------------------------------------------------------------------------
// THE CAUSE, AND WHY TEN WAVES OF NOTES POINTED AT THE WRONG THING
// ---------------------------------------------------------------------------
// Type 6's state $B (`$28D6E4`) waits on the fly-away animation chain:
// `$28D6FC jsr $24681A` sums `($18,node)` and `$28D702 bne.s $28D736` skips
// the free, the two power resets, `$8130F8` and the state store while the sum
// is non-zero. The port COMPUTED that sum and threw it away -- declared as
// `PRESENTATION_DEVIATION` DEV-2 since W124, on the stated ground that the
// per-frame DRAIN was unported presentation tier.
//
// **THE DRAIN IS `animobjects.js runAnimObjects24683E`, MAIN-LOOP CALL #3, AND
// IT HAS RUN EVERY FRAME SINCE W91.** What was missing was its input.
// `stageend.js chainLoaderBody` built `$24652A`'s chains WITHOUT their per-node
// content, so `($6,node)` -- the executor pointer -- stayed zero, the walk
// skipped every node it built, `($18)` never drained, and the sum stayed
// non-zero forever. W389 decoded that content block (`$246582..$2465D9`,
// `animobjects.js CHAIN_CONTENT_24652A`) and deliberately left it switched OFF,
// writing that turning it on "changes the result screen's timing". It does.
// It changes it to the board's.
//
// TWO HALVES, ONE FIX, AND [M] NEITHER WORKS ALONE:
//   content on, `bne` ignored -> nothing moves at all (74/80, lf10303)
//   `bne` honoured, content off -> the stage end HANGS FOREVER (41/80)
//   both                        -> 80/80, and lf10334 to the frame
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE PROVES, AND IN WHICH ORDER
// ---------------------------------------------------------------------------
//  1. THE ROM. `$28D702` is `bne.s $28D736` -- the SAME target `$28D6EA` sends
//     every non-$B state to, which is why returning is the faithful shape. The
//     `$28D862` script is 8 nodes and closes at `$28D8C4` ONLY under the
//     six-word shape, and every node's timing index is 3, whose `$246B38` row
//     is reload 0 / step 1. THIRTY-TWO frames is read off the image.
//  2. THE DELIVERABLE. Seeded from the board's lf10200 rung -- the one that
//     makes the PORT build the chain rather than inherit the board's -- and
//     stepped on the board's own input words, `$8130D2` matches the trace on
//     every one of 300 frames and all EIGHTY pool-B slots are byte-identical to
//     the board at lf10400 AND at lf10500.
//  3. THE POSITIVE CONTROL, stated as its own claim because lf10400 has none:
//     the board's pool is EMPTY there. lf10500 is where six records exist on
//     both sides, and the port's pool has moved off its seed.
//  4. THE RED, on a DIRTY node pool: the loader seeds eight nodes with eight
//     DISTINCT palette cursors read out of the script, so no constant satisfies
//     it, and the chain drains on exactly the 32nd call of main-loop call #3.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, i16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import { POOL_B, B } from '../src/effects.js';
import {
  chainCheck24681A, PRESENTATION_DEVIATION,
} from '../src/stageend.js';
import {
  runAnimObjects24683E, ANIM_OBJECT, CHAIN_CONTENT_24652A,
  // W448: the `$24652A` head is here now -- `stageend.js chainLoader24652A` was the second
  // of THREE transcriptions of `$246532` and it is gone.
  loadAnimObjects24652A,
} from '../src/animobjects.js';
import { readTrace } from '../tools/portdiff.mjs';
import {
  ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS, W435_ABUTTING_PAIR, overlappingPairs,
  OVERLAP_NOTE,
} from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const LADDER = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TRACE = path.join(LADDER, 'trace.tsv');
const CK = path.join(LADDER, 'ckpt');
const TABLES = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');

const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && fs.existsSync(path.join(CK, 'c010200.ram.bin'))
  && fs.existsSync(path.join(CK, 'c010400.ram.bin'))
  && fs.existsSync(path.join(CK, 'c010500.ram.bin'));

const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf10200/lf10400/lf10500) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_TABLES = HAVE_TABLES ? false
  : 'rip/port/player.tables.json is absent -- `python tools/export-tables.py`. '
    + 'THIS IS A SKIP, NOT A PASS.';

const SEED_LF = 10200;                 // the rung this run starts from
const MID_LF = 10400;                  // ...the rung W434 measured at...
const CMP_LF = 10500;                  // ...and the rung that carries the proof
const UNFREEZE_LF = 10334;             // [M] the board's own, out of trace.tsv
const RAM_BASE = 0x800000;

const SCRIPT = 0x28d862;               // $28DE5C lea (-$5FC,PC),A0
const SCRIPT_END = 0x28d8c4;           // $28DE44 lea (-$582,PC),A0 -- stage 5's
const SCRIPT_NODES = 8;
const CHAIN_GATE = 0x28d702;           // bne.s $28D736 -- the wait
const NOT_B_GATE = 0x28d6ea;           // bne.w $28D736 -- every non-$B state
const LADDER_TARGET = 0x28d736;
const TIMING_TABLE = 0x246b38;         // $2465AA lea ($58C,PC),A3
const DRAIN_FRAMES = 0x20;             // progress stops at $20, one step a frame
const PAL0 = 0x80e886;                 // $24627A entry 0's `current` base
const DIRTY0 = 0x80fa66;               // ...and its dirty word, the node's writer
const WHITE = 0x246bf8;                // the script's own target, 32 x $7FFF
const FREEZE = 0x8130d2;               // the trace's `d0d2` column

const hx2 = (v) => `$${v.toString(16).toUpperCase().padStart(2, '0')}`;
const hx = (v) => `$${v.toString(16).toUpperCase()}`;

// ===========================================================================
// 1. THE ROM
// ===========================================================================
test('W435: $28D702 is bne.s $28D736 -- the SAME place $28D6EA sends every '
  + 'state that is not $B, so the wait is a fall-out of the ladder',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const u16 = (a) => (img[a] << 8) | img[a + 1];

  // $28D702 66 32 -- bne.s, displacement measured from the FOLLOWING word
  assert.deepEqual(at(CHAIN_GATE, 2), [0x66, 0x32],
    `${hx(CHAIN_GATE)} must be bne.s with an $32 displacement`);
  assert.equal(CHAIN_GATE + 2 + 0x32, LADDER_TARGET,
    'and it lands on $28D736');
  // $28D6EA 66 00 00 4a -- bne.w, off the state-$B compare, SAME target
  assert.deepEqual(at(NOT_B_GATE, 4), [0x66, 0x00, 0x00, 0x4a],
    `${hx(NOT_B_GATE)} must be bne.w with a $4A displacement`);
  assert.equal(NOT_B_GATE + 2 + 0x4a, LADDER_TARGET,
    'the state-$B compare misses to the SAME address the chain gate does -- '
    + 'so "return" and "fall through the rest of the ladder" are the same '
    + 'thing while the state is still $B, and returning is faithful');

  // The script F8 leas, and the one the stage-5 arm leas, both PC-relative.
  assert.deepEqual(at(0x28de5c, 4), [0x41, 0xfa, 0xfa, 0x04],
    '$28DE5C lea (d16,PC),A0');
  assert.equal(0x28de5e + i16(u16(0x28de5e)), SCRIPT,
    '...whose target is $28D862, THE SCRIPT (extension word + displacement)');
  assert.deepEqual(at(0x28de44, 4), [0x41, 0xfa, 0xfa, 0x7e],
    '$28DE44 lea (d16,PC),A0 -- the stage-5 arm');
  assert.equal(0x28de46 + i16(u16(0x28de46)), SCRIPT_END,
    '...whose target is $28D8C4, which is therefore where OUR script ENDS');

  // THE SHAPE. Six words per node closes on $28D8C4 exactly; four words -- the
  // OTHER content block in this family, $24676A's -- does not. That is what
  // makes "$246582's shape" a measurement rather than a preference.
  assert.equal(u16(SCRIPT), SCRIPT_NODES, 'the count word says 8 nodes');
  assert.equal(CHAIN_CONTENT_24652A.wordsPerNode, 6);
  assert.equal(SCRIPT + 2 + SCRIPT_NODES * 6 * 2, SCRIPT_END,
    'six words per node ends EXACTLY at the next script');
  assert.notEqual(SCRIPT + 2 + SCRIPT_NODES * 4 * 2, SCRIPT_END,
    "...and four words per node ($24676A's shape) does not, so the two are "
    + 'not interchangeable here');

  // THIRTY-TWO IS READ OFF THE IMAGE. Every node's timing index is 3, and
  // $246B38 row 3 is reload 0 / step 1, so ($20,node) gains 1 a frame.
  const timings = [];
  for (let n = 0; n < SCRIPT_NODES; n++) timings.push(u16(SCRIPT + 2 + n * 12 + 10));
  assert.deepEqual(timings, new Array(SCRIPT_NODES).fill(3),
    'all eight nodes carry timing index 3');
  assert.equal(u16(TIMING_TABLE + 3 * 4), 0, '$246B44 reload = 0');
  assert.equal(u16(TIMING_TABLE + 3 * 4 + 2), 1, '$246B46 step = 1');

  // ...and the gate the executor's walk actually uses, because animobjects.js
  // carries a SECOND clause the ROM does not have and now says so.
  assert.deepEqual(at(0x24687a, 2), [0x4a, 0x54], '$24687A tst.w (A4) -- STATUS');
  assert.deepEqual(at(0x24687c, 4), [0x67, 0x00, 0x02, 0xb0], '...and its beq');
  assert.deepEqual(at(0x246880, 4), [0x22, 0x6c, 0x00, 0x06],
    '$246880 movea.l ($6,A4),A1 is UNCONDITIONAL -- the ROM never tests the '
    + "writer, so the port's extra clause is a refusal to write to address 0 "
    + 'and not a branch');

  // And the deviation table this wave emptied.
  assert.deepEqual(Object.keys(PRESENTATION_DEVIATION), [],
    'DEV-2 is closed, so stageend.js declares no invented transition at all');
});

// ===========================================================================
// 2 + 3. THE DELIVERABLE AND ITS POSITIVE CONTROL
// ===========================================================================
test('W435: seeded from lf10200 -- the rung where the PORT builds the chain -- '
  + '$8130D2 matches the board on all 300 frames and pool B is 80/80 at both '
  + 'lf10400 and lf10500', { skip: SKIP_LADDER }, async () => {
  const { Game } = await import('../src/main.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === SEED_LF);
  assert.ok(rung, `lf${SEED_LF} must be a rung`);

  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const trace = readTrace(TRACE);
  // The ladder's own intervention, out of the manifest rather than reinvented:
  // $810424 (the player's invulnerability timer) held at $FF.
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));

  const game = new Game(seed, tables, {
    logicFrame: SEED_LF, videoFrame: rung.vf, bgSeed,
  });
  // THE STATE TRACE. `d0d2` is $8130D2 sampled by the board every logic frame,
  // so this is 300 frames of agreement and not one end-point comparison. It is
  // also the assertion that names this wave's defect: before the fix the port
  // cleared this word at lf10303 and the board at lf10334.
  const freezeMiss = [];
  let unfreezeLf = 0;
  let mid = null;
  for (let lf = SEED_LF + 1; lf <= CMP_LF; lf++) {
    const r = trace.byLf.get(lf);
    assert.ok(r, `the trace must carry lf${lf}`);
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(r.portin));       // THE BOARD'S OWN INPUT WORD, not a bench
    const want = Number(r.d0d2);
    const have = game.ram.u16(FREEZE);
    if (want !== have) freezeMiss.push(`lf${lf} board ${want} port ${have}`);
    if (!unfreezeLf && have === 0) unfreezeLf = lf;
    if (lf === MID_LF) mid = game.ram.b.slice();
  }
  assert.deepEqual(freezeMiss.slice(0, 8), [],
    '$8130D2 must match the board\'s own per-frame trace on every frame of '
    + `lf${SEED_LF + 1}..lf${CMP_LF}; ${freezeMiss.length} frames differ`);
  assert.equal(unfreezeLf, UNFREEZE_LF,
    "and the frame it clears on is the board's lf10334, not lf10303");

  const slotOff = (s) => POOL_B.base - RAM_BASE + s * POOL_B.stride;
  const nonBlank = (buf) => {
    let n = 0;
    for (let s = 0; s < POOL_B.slots; s++) {
      for (let k = 0; k < POOL_B.stride; k++) if (buf[slotOff(s) + k]) { n++; break; }
    }
    return n;
  };
  const compare = (board, port, lf) => {
    const differ = [];
    let identical = 0;
    for (let s = 0; s < POOL_B.slots; s++) {
      const o = slotOff(s);
      const bytes = [];
      for (let k = 0; k < POOL_B.stride; k++) {
        if (board[o + k] !== port[o + k]) {
          bytes.push(`+${hx2(k)} board ${hx2(board[o + k])} port ${hx2(port[o + k])}`);
        }
      }
      if (bytes.length === 0) identical++;
      else {
        differ.push(`slot ${s} @ ${hx(POOL_B.base + s * POOL_B.stride)}: `
          + bytes.join(', '));
      }
    }
    assert.deepEqual(differ, [],
      `every pool-B slot must be byte-identical to the board at lf${lf}`);
    assert.equal(identical, POOL_B.slots, `80 of 80 at lf${lf}, as a count too`);
  };

  const boardMid = new Uint8Array(fs.readFileSync(
    path.join(CK, man.rungs.find((r) => r.lf === MID_LF).ram)));
  const boardEnd = new Uint8Array(fs.readFileSync(
    path.join(CK, man.rungs.find((r) => r.lf === CMP_LF).ram)));
  const port = game.ram.b;

  // THE POSITIVE CONTROL, AND IT IS THE POINT OF THIS WAVE'S CORRECTION.
  // [M] lf10400 is EMPTY on the board -- `$288E0C` ran during the transition
  // and nothing has spawned since -- so 80/80 THERE is satisfied by any port
  // that merely clears the pool, and W434's "six slots the port keeps alive"
  // was reading a spawn the board had not reached yet. Say so, then measure
  // where it counts.
  assert.equal(nonBlank(boardMid), 0,
    `the board's pool B at lf${MID_LF} is entirely EMPTY -- this rung alone `
    + 'cannot distinguish a correct port from one that only wipes the pool');
  assert.equal(nonBlank(boardEnd), 6,
    `the board's pool B at lf${CMP_LF} carries the stage-2 intro's SIX records`);
  let liveEnd = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOff(s);
    if (((boardEnd[o + B.status] << 8) | boardEnd[o + B.status + 1]) !== 0) liveEnd++;
  }
  assert.equal(liveEnd, 0,
    '...all six FREED again, so this is a comparison of residue on both sides');
  assert.equal(nonBlank(port), 6,
    `and the PORT reaches lf${CMP_LF} with six of its own, not with zero`);
  let movedFromSeed = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    for (let k = 0; k < POOL_B.stride; k++) {
      if (seed[slotOff(s) + k] !== port[slotOff(s) + k]) { movedFromSeed++; break; }
    }
  }
  assert.ok(movedFromSeed >= 39,
    `the port's pool B must have MOVED away from the lf${SEED_LF} seed; only `
    + `${movedFromSeed} of ${POOL_B.slots} slots differ from it`);

  compare(boardMid, mid, MID_LF);
  compare(boardEnd, port, CMP_LF);
});

// ===========================================================================
// 4. THE RED -- THE LOADER AND THE DRAIN, OVER DIRT
// ===========================================================================
test('W435: $24652A seeds eight nodes with eight DISTINCT palette cursors off '
  + 'its own script, and main-loop call #3 drains them on exactly the 32nd '
  + 'frame -- measured over dirt, not over a fresh Ram',
{ skip: SKIP_TABLES || SKIP_IMAGE }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const img = fs.readFileSync(IMAGE);
  const u16img = (a) => (img[a] << 8) | img[a + 1];
  const ram = new Ram();

  // DIRTY EVERY FIELD the loader is supposed to write. A fresh `Ram` leaves
  // ($6,node) at zero, which is EXACTLY the state this wave's defect produced,
  // so a fresh-Ram fixture cannot tell "seeded" from "not seeded" by a zero.
  // $5A everywhere, statuses cleared so the two pools are allocatable.
  for (let p = 0; p < ANIM_OBJECT.nodeSlots; p++) {
    const a = ANIM_OBJECT.nodes + p * ANIM_OBJECT.nodeStride;
    for (let k = 0; k < ANIM_OBJECT.nodeStride; k++) ram.setU8(a + k, 0x5a);
    ram.setU16(a, 0);
  }
  for (let r = 0; r < ANIM_OBJECT.rootSlots; r++) {
    const a = ANIM_OBJECT.roots + r * ANIM_OBJECT.rootStride;
    for (let k = 0; k < ANIM_OBJECT.rootStride; k++) ram.setU8(a + k, 0x5a);
    ram.setU16(a, 0);
  }
  // ...and a palette bank whose every word is DIFFERENT, so the per-node
  // snapshot cannot agree by accident either.
  for (let a = PAL0; a < PAL0 + 0x800; a += 2) ram.setU16(a, (a >> 1) & 0x7fff);
  ram.setU16(DIRTY0, 0x5a5a);

  const handle = loadAnimObjects24652A(ram, rom, SCRIPT) >>> 0;
  assert.ok(handle !== 0 && handle !== 0xffffffff, 'the loader claimed a root');
  assert.equal(handle, ANIM_OBJECT.roots, '...the first one, over $5A5A dirt');

  // Walk the chain the ROM's way and read every node back.
  const nodes = [];
  for (let cur = ram.u32(handle + 0x2c); cur !== 0; cur = ram.u32(cur + 0x2c)) {
    nodes.push(cur >>> 0);
  }
  assert.equal(nodes.length, SCRIPT_NODES, 'eight nodes on the chain');

  // THE CLAIM NO CONSTANT SATISFIES: each node's ($E) is $80E886 plus its OWN
  // offset word out of the script, and the eight offsets are eight different
  // numbers. A port that wrote one address eight times fails here.
  const wantCurrent = [];
  for (let n = 0; n < SCRIPT_NODES; n++) {
    wantCurrent.push(PAL0 + i16(u16img(SCRIPT + 2 + n * 12 + 2)));
  }
  assert.equal(new Set(wantCurrent).size, SCRIPT_NODES,
    'the eight script offsets are eight DISTINCT cursors -- so this is not a '
    + 'constant the port could write eight times');
  assert.deepEqual(nodes.map((a) => ram.u32(a + 0x0e)), wantCurrent,
    '$246592 adda.w (A0)+,A3 / $246594 move.l A3,($E,A2)');
  // ...and the fields that make the node VISIBLE to the executor and give it
  // its rate. `($6)` is the whole defect: zero there and call #3 skips the node.
  for (const a of nodes) {
    assert.equal(ram.u32(a + 0x06), DIRTY0, '$246588 -- the writer, was $5A5A5A5A');
    assert.equal(ram.u32(a + 0x0a), WHITE, '$246598 -- the target, FROM the script');
    assert.equal(ram.u16(a + 0x04), 0x1f, '$24659C -- words-minus-one');
    assert.equal(ram.u16(a + 0x16), 0, '$246B44 reload');
    assert.equal(ram.u16(a + 0x1c), 1, '$246B46 step');
    assert.equal(ram.u16(a + 0x18), 0xffff, '$2465C0 lifetime hi word');
    assert.equal(ram.u16(a + 0x20), 0, '$246562 progress');
  }
  // the $30(node) snapshot really copied the palette, over the $5A dirt
  for (let n = 0; n < SCRIPT_NODES; n++) {
    const a = nodes[n];
    for (let k = 0; k <= 0x1f; k++) {
      assert.equal(ram.u16(a + 0x30 + k * 2),
        ((wantCurrent[n] + k * 2) >> 1) & 0x7fff,
        `node ${n} word ${k} of the $2465D4 snapshot`);
    }
  }

  // THE DRAIN, TO THE FRAME. `chainCheck24681A` is what state $B reads.
  assert.notEqual(chainCheck24681A(ram, handle), 0, 'the chain starts LIVE');
  let released = -1;
  for (let f = 1; f <= 64; f++) {
    runAnimObjects24683E(ram, rom);
    if (chainCheck24681A(ram, handle) === 0) { released = f; break; }
  }
  assert.equal(released, DRAIN_FRAMES,
    'the chain drains on exactly the 32nd call of main-loop call #3 -- one '
    + '($20,node) step a frame, from $246B38 row 3');
  assert.deepEqual(nodes.map((a) => ram.u16(a + 0x20)),
    new Array(SCRIPT_NODES).fill(DRAIN_FRAMES),
    'and every node walked its progress to $20; none was skipped');
  // The root is mode 0 ($24652A's D6), so $24683E must NOT auto-retire it --
  // state $B's own `$28D708 jsr $246800` owns that.
  assert.equal(ram.u16(handle) & 0x8000, 0x8000,
    'a mode-0 root survives its own drain; the owner frees it');
});

// ===========================================================================
// 5. THE WINDOW THIS WAVE DECLARED
// ===========================================================================
test("W435: the $28D864 content window ABUTS W124's $28D862 count word and "
  + 'overlaps nothing', { skip: SKIP_TABLES }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const list = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(list.length, ROM_WINDOW_COUNT,
    'the whole window set, counted once in tests/romwindowset.js');
  assert.equal(overlappingPairs(list), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);

  const [mine, abutted] = W435_ABUTTING_PAIR;
  const find = (a) => list.find(([b]) => b === a);
  const lo = find(abutted);
  const hi = find(mine);
  assert.ok(lo && hi, 'both windows must be declared');
  assert.equal(lo[0] + lo[1], hi[0],
    '$28D862 + 2 lands exactly on $28D864 -- abutting, not overlapping');
  assert.equal(hi[1], 0x60, 'eight nodes of six words');
  assert.equal(hi[0] + hi[1], SCRIPT_END,
    '...and $28D864 + $60 ends exactly at $28D8C4, the next script');

  // THE DELTA MUST RECONCILE: drop this window and the set is what W429 left,
  // with the overlap count untouched. That is the whole claim of an abutment.
  const without = list.filter(([x]) => x !== mine);
  assert.equal(without.length, ROM_WINDOW_COUNT - 1, 'one window added');
  assert.equal(overlappingPairs(without), ROM_OVERLAP_PAIRS,
    "dropping W435's window leaves the overlap count unchanged");
  // The seam is safe because no read crosses it: the loader's only read below
  // $28D864 is the node-count WORD at $28D862. (W428's straddle case is a
  // multi-byte read that spans a seam; here nothing does.)
  const rom = new RomWindows(tables.rom);
  assert.equal(rom.u16(SCRIPT), SCRIPT_NODES, 'the count word reads');
  assert.equal(rom.u32(SCRIPT + 2 + 4), WHITE,
    "and the first node's target longword reads out of the NEW window");
});

test('W435 RED: without the $28D864 window the loader throws BY ADDRESS, so the '
  + 'window is load-bearing and not decoration', { skip: SKIP_TABLES }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const baseOf = (w) => parseInt(String(w.base).replace('$', ''), 16);
  const without = { windows: tables.rom.windows.filter((w) => baseOf(w) !== 0x28d864) };
  assert.equal(without.windows.length, tables.rom.windows.length - 1,
    'the W435 window must be present to be removed');
  const old = new RomWindows(without);
  assert.equal(old.u16(SCRIPT), SCRIPT_NODES,
    "W124's two-byte window still serves the node count -- which is exactly why "
    + 'the gap could sit here unnoticed for eleven waves');
  assert.throws(() => old.u16(SCRIPT + 2), Unreached,
    "...but the first node's family word is outside it");
  assert.throws(() => loadAnimObjects24652A(new Ram(), old, SCRIPT), Unreached,
    'and the seeding loader cannot run at all');
});
