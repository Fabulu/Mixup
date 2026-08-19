// WAVE 439 -- THE ONE BULLET THE PORT NEVER SPAWNED IS TYPE $82's SECOND FIRE,
// `$274A9C..$274AEE`, AND IT WAS A COUNTED NOTE SINCE W81.
//
// ---------------------------------------------------------------------------
// THE UNIT, AS W438 PINNED IT
// ---------------------------------------------------------------------------
// On `out/w69/stage1-laser-hold` lf4025->4050 the port matched 209 of 210 bullet
// slots and made the board's number of RNG draws on all 25 frames.  The single
// differing slot was **slot 3**: the board puts a live kind-7 bank-A bullet
// there and the port's slot 3 stayed byte-identical to the lf4025 SEED for the
// whole window -- never written, not spawned-and-killed.
//
// [M] Instrumenting every write to a bullet slot's type word over those 25
// frames: the port makes NINE kills and **ZERO spawns**, and `unportedLog`
// carries exactly ONE call of `$274A9C` -- `$82 second fire` on enemy record
// `$81373C`.  One note, one missing bullet, and nothing else in the window even
// tried to allocate.  That is the whole defect.
//
// ---------------------------------------------------------------------------
// WHY IT COSTS NO RNG DRAW, WHICH IS WHAT MADE IT INVISIBLE
// ---------------------------------------------------------------------------
// `$274ACC jsr $281484` is a bank-A generator entry that opens
// `tst.w $813098 / beq $2814B6` and reaches its rank!=0 arm through a WIDE
// `bra $2813A6`.  `$813098` is 0 on this rung, so the `beq` is TAKEN and the
// entry runs the core `$2814B6`, which allocates a slot and copies a template.
// There is no `$803916` read anywhere on that path.  A missing spawn
// therefore leaves the RNG cursor in step, so every draw-count gate in the
// project -- the one this ladder is built around included -- stayed green while
// a bullet was missing.
//
// ---------------------------------------------------------------------------
// HOW THIS TEST FAILS IF THE FIX IS FAKED
// ---------------------------------------------------------------------------
// The deliverable is a 64-byte record, so the obvious fake is "write the board's
// slot 3".  Four independent arms make that impossible:
//
//  1. **THE FRAME.**  The port must write slot 3 on lf4028 and on NO other
//     frame.  lf4028 is not chosen: `($22,A5)` is 2 at lf4025 and `$274A94
//     subq.b #1` reaches its borrow on the third decrement.  And the frame is
//     load-bearing in the pool as well -- slot 0 is freed at lf4040, so a spawn
//     even one frame after that lands in slot 0 instead and TWO slots go wrong.
//  2. **THE ENEMY'S OWN RECORD.**  The block writes `($22,A5)` and `($24,A5)`,
//     which live in the enemy table and not in the bullet pool.  [M] Before this
//     wave the port held `($22,A5) = $E9` and `($24,A5) = $00` at lf4050 where
//     the board holds `$3C` and `$03`; it now holds the board's.  A fake that
//     poked the bullet pool could not move those, and the whole-RAM divergence
//     at lf4050 falls from **717 bytes to 292** -- more than the 64 bytes of the
//     record it "fixed".
//  3. **A RED RUN, PERFORMED AND NOT ASSERTED.**  Raising `($22,A5)` at lf4025
//     so the cadence cannot reach its borrow inside the window puts the port
//     back at 209/210 with slot 3 untouched, and puts `($22,A5)`/`($24,A5)`
//     back to disagreeing.
//  4. **THE MUZZLE OFFSET IS READ FROM THE CARTRIDGE.**  Corrupting the ONE
//     longword `$274AB4 move.l (A4,D0.w),D3` indexes -- entry 17 at `$2732BE` --
//     turns slot 3 red at exactly `+$02`, while corrupting entry 0 at `$27327A`
//     changes NOTHING.  A hardcoded D3 would survive both.  That pair is also
//     the positive control on the index `(facing & $3E) * 2`: it says the block
//     reads entry 17 and not entry 0.
//
// ---------------------------------------------------------------------------
// WHAT THIS WAVE DID **NOT** FIX -- AND WHAT W440 THEN DID
// ---------------------------------------------------------------------------
// W439 measured lf9500->9600 at **149/210 bullets and 2/70 pool A before and
// after**, and said so: one missing spawn was not the same defect as the 61
// slots that differ there.  That was right.  W440 found the real one -- four
// `.W` branches in the stage-1 boss's three rotation guns, read as 8-bit --
// and lf9200->9300, lf9300->9400, lf9400->9500 and lf9500->9600 all went to
// 210/210 with pool A at 70/70.
//
// The two tests at the foot of this file asserted W439's numbers and went RED
// when W440 moved them.  They are REWRITTEN, not deleted, and they still say
// the thing W439 wrote them to say: these segments are NOT what $274A9C fixed.
// Each now asserts the post-W440 number and records W439's next to it, so the
// history stays readable and the guard stays live.
//
// NO ROM WINDOW IS DECLARED OR WIDENED.  `$27327A..$2732F9` already lies inside
// the exported window `$273270 + $90`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POOL_A } from '../src/bee.js';
import { POOL_B } from '../src/effects.js';
import { BUL, REC, TPL, TYPEBIT, ENTRIES } from '../src/bullets.js';
import { readTrace } from '../tools/portdiff.mjs';
import {
  ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS, overlappingPairs, OVERLAP_NOTE,
} from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const LADDER = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TRACE = path.join(LADDER, 'trace.tsv');
const CK = path.join(LADDER, 'ckpt');
const TABLES = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');

// The 25-frame unit, and the 100-frame rungs W434..W438 stand on.
const FINE = [4025, 4050];
const COARSE = [9300, 9400, 9500, 9600, 9700, 9800];
const ckOf = (lf) => path.join(CK, `c0${String(lf).padStart(5, '0')}.ram.bin`);
const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && [...FINE, ...COARSE].every((lf) => fs.existsSync(ckOf(lf)));
const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf4025/lf4050 and lf9300..lf9800) '
    + 'or rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';

const RAM_BASE = 0x800000;
const RNG_STATE = 0x803916;

// The ROM this file stands on.
const BLOCK = 0x274a84;          // the second cooldown's first instruction
const FIRE = 0x274a9c;           // ...and the block the `bcs` reaches
const BLOCK_END = 0x274af0;      // one past the `rts`, where the DEATH ARM begins
const RTS_EARLY = 0x274a9a;      // the two "do not fire" branches' target
const RTS_LATE = 0x274aee;       // the `bcc`'s target
const GENERATOR = 0x281484;      // `$274ACC jsr`
const MUZZLE = 0x27327a;         // `$274AA2 lea $27327A,A4`
const MUZZLE_ENTRIES = 32;       // (facing & $3E) * 2 steps by 4 over 32 longs
const MUZZLE_WINDOW = [0x273270, 0x90];   // the window that already covers it
const RANK = 0x813098;
const RANK_RELOAD = 0x8130b4;    // `$274AE2 sub.w $8130B4,D0`

// The firing enemy, and every byte of its state this block reads.  [M] out of
// the lf4025 ckpt dump.
const A5 = 0x81373c;
const A5_HANDLER = 0x2747c6;     // ($4C,A5) -- it IS a type $82
const A5_CADENCE = 0x02;         // ($22,A5) at lf4025 -> borrows on lf4028
const A5_SALVO = 0x00;           // ($24,A5)
const A5_SALVO_RELOAD = 0x03;    // ($25,A5)
const A5_FIRE2_RELOAD = 0x05;    // ($2F,A5)
const A5_FACING = 0x0023;        // ($2C,A5), 1/64 turn
const SPAWN_LF = 4028;
const SPAWN_SLOT = 3;

// [M] the board's own lf4050 values for the two bytes the block writes.
const BOARD_CADENCE_4050 = 0x3c;   // $60 - $8130B4($12) + 4 = $52, minus 22 frames
const BOARD_SALVO_4050 = 0x03;     // reloaded from ($25,A5)

const hx = (v) => `$${v.toString(16).toUpperCase()}`;
const slotOffBul = (s) => BUL.pool - RAM_BASE + s * BUL.stride;

// ===========================================================================
// 1. THE ROM -- THE BLOCK, INSTRUCTION BY INSTRUCTION AND COUNTED
// ===========================================================================
test('W439: $274A84..$274AEE decodes to TWENTY-NINE instructions that consume '
  + 'the span exactly, ending one byte before type $82\'s death arm -- and all '
  + 'four branches are the 8-BIT form, asserted rather than assumed',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);
  const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);

  // W434/W436's trap: the instructions are COUNTED and the decode must consume
  // the byte span with no gap and no overrun, so an arm cannot be lost the way
  // W437 lost five paths to a mis-read branch.
  const INSNS = [
    [0x274a84, [0x4a, 0xb9, 0x00, 0x81, 0x30, 0xd2], 'tst.l $8130D2 -- a LONG test'],
    [0x274a8a, [0x66, 0x0e], 'bne $274A9A (the rts) -- FROZEN means no fire'],
    [0x274a8c, [0x0c, 0x6e, 0x10, 0x00, 0x00, 0x02], 'cmpi.w #$1000,($2,A6)'],
    [0x274a92, [0x6d, 0x06], 'blt $274A9A -- SIGNED, and above the line it is'],
    [0x274a94, [0x53, 0x2d, 0x00, 0x22], 'subq.b #1,($22,A5) -- A BYTE COUNTER'],
    [0x274a98, [0x65, 0x02], 'bcs $274A9C -- fire only on the BORROW'],
    [0x274a9a, [0x4e, 0x75], 'rts'],
    [0x274a9c, [0x1b, 0x6d, 0x00, 0x2f, 0x00, 0x22], 'move.b ($2F,A5),($22,A5)'],
    [0x274aa2, [0x49, 0xf9, 0x00, 0x27, 0x32, 0x7a], 'lea $27327A,A4 -- THE MUZZLE TABLE'],
    [0x274aa8, [0x32, 0x2d, 0x00, 0x2c], 'move.w ($2C,A5),D1 -- the 1/64 facing'],
    [0x274aac, [0x30, 0x01], 'move.w D1,D0'],
    [0x274aae, [0x02, 0x40, 0x00, 0x3e], 'andi.w #$3E,D0'],
    [0x274ab2, [0xd0, 0x40], 'add.w D0,D0 -- (facing & $3E) * 2, a BYTE offset'],
    [0x274ab4, [0x26, 0x34, 0x00, 0x00], 'move.l (A4,D0.w),D3 -- the muzzle offset'],
    [0x274ab8, [0x48, 0x43], 'swap D3'],
    [0x274aba, [0x06, 0x43, 0x02, 0x40], 'addi.w #$240,D3 -- the LONG axis only'],
    [0x274abe, [0x48, 0x43], 'swap D3'],
    [0x274ac0, [0x20, 0x3c, 0x00, 0x04, 0x00, 0x07], 'move.l #$40007,D0 -- kind 7, bias 4'],
    [0x274ac6, [0x24, 0x2e, 0x00, 0x02], 'move.l ($2,A6),D2 -- the enemy position'],
    [0x274aca, [0x28, 0x0e], 'move.l A6,D4'],
    [0x274acc, [0x4e, 0xb9, 0x00, 0x28, 0x14, 0x84], 'jsr $281484 -- BANK A'],
    [0x274ad2, [0x53, 0x2d, 0x00, 0x24], 'subq.b #1,($24,A5) -- the SALVO counter'],
    [0x274ad6, [0x64, 0x16], 'bcc $274AEE -- salvo not exhausted: rts'],
    [0x274ad8, [0x1b, 0x6d, 0x00, 0x25, 0x00, 0x24], 'move.b ($25,A5),($24,A5)'],
    [0x274ade, [0x30, 0x3c, 0x00, 0x60], 'move.w #$60,D0'],
    [0x274ae2, [0x90, 0x79, 0x00, 0x81, 0x30, 0xb4], 'sub.w $8130B4,D0 -- RANK'],
    [0x274ae8, [0x58, 0x40], 'addq.w #4,D0'],
    [0x274aea, [0x1b, 0x40, 0x00, 0x22], 'move.b D0,($22,A5) -- the SECOND write'],
    [0x274aee, [0x4e, 0x75], 'rts'],
  ];
  let a = BLOCK;
  for (const [addr, bytes, what] of INSNS) {
    assert.equal(a, addr, `the decode must reach ${hx(addr)} (${what}); the `
      + `instruction before it ended at ${hx(a)}`);
    assert.deepEqual(at(addr, bytes.length), bytes, `${hx(addr)} ${what}`);
    a += bytes.length;
  }
  assert.equal(INSNS.length, 29,
    'twenty-nine instructions, stated as a COUNT -- W434 lost one instruction to '
    + 'a uniform-looking block and W438 found a `nop` no note listed, so the '
    + 'number is asserted and not eyeballed');
  assert.equal(a, BLOCK_END, 'and the decode consumes the block exactly');
  // Pinned from the FAR side too: `$274AF0` is type $82's death arm, which
  // src/handlers.js has transcribed since W34 as `moveq #$42,D0 / jsr $28615E`.
  assert.deepEqual(at(BLOCK_END, 2), [0x70, 0x42],
    `${hx(BLOCK_END)} moveq #$42,D0 -- the death arm, so the block cannot be `
    + 'one instruction longer than this decode says');

  // The four branch targets, each computed from its OWN displacement byte.
  assert.equal(0x274a8c + s8(0x0e), RTS_EARLY, '$274A8A bne -> $274A9A');
  assert.equal(0x274a94 + s8(0x06), RTS_EARLY, '$274A92 blt -> $274A9A');
  assert.equal(0x274a9a + s8(0x02), FIRE, '$274A98 bcs -> $274A9C, the fire');
  assert.equal(0x274ad8 + s8(0x16), RTS_LATE, '$274AD6 bcc -> $274AEE, the rts');
  assert.deepEqual(at(RTS_EARLY, 2), [0x4e, 0x75], '...and $274A9A IS an rts');
  assert.deepEqual(at(RTS_LATE, 2), [0x4e, 0x75], '...and so is $274AEE');

  // W437/W438's trap, met from the other side: those two waves lost an arm to a
  // `.W` branch read as 8-bit.  Here the risk is the MIRROR -- reading a short
  // branch as wide -- so the displacement byte of all four is asserted NON-ZERO
  // (the 8-bit form) and the wide reading is shown to land elsewhere.
  for (const [addr, disp] of [[0x274a8a, 0x0e], [0x274a92, 0x06],
    [0x274a98, 0x02], [0x274ad6, 0x16]]) {
    assert.equal(img[addr + 1], disp,
      `${hx(addr)} carries a NON-ZERO displacement byte, so it is the 8-bit `
      + 'form and not a `.W` whose displacement lives in the next word');
    assert.notEqual(img[addr + 1], 0x00,
      '...which is exactly the byte a `.W` form would have to hold');
    const wide = (addr + 2 + s16((img[addr + 2] << 8) | img[addr + 3])) >>> 0;
    assert.notEqual(wide, addr + 2 + s8(disp),
      `...and reading ${hx(addr)} as a wide branch lands at ${hx(wide)}, `
      + 'somewhere else entirely -- which is why the width is asserted');
  }

  // The generator this block calls must BE one of the nineteen, and a bank-A
  // one: the board's slot 3 has type-word bit 9 CLEAR.
  assert.ok(ENTRIES.has(GENERATOR),
    `${hx(GENERATOR)} must be one of the nineteen generator entry points`);
  // AND THE ENTRY ITSELF, because the whole "no RNG draw" argument rests on
  // which arm a rank-0 run takes.  W438's trap is HERE, one call deeper:
  // `$281490` is a WIDE `bra`.
  assert.deepEqual(at(GENERATOR, 12), [
    0x4a, 0x79, 0x00, 0x81, 0x30, 0x98,  // tst.w $813098
    0x67, 0x2a,                          // beq $2814B6 -- THE CORE
    0x48, 0xe7, 0xc0, 0x80,              // movem.l D0-D1/A0,-(A7)
  ], '$281484..$28148F verbatim');
  assert.equal(0x28148c + s8(0x2a), BUL.coreA,
    '$28148A beq -> $2814B6, the bank-A core, computed from its displacement -- '
    + 'so at $813098 = 0 this entry spawns ONE bullet and reads no RNG');
  assert.deepEqual(at(0x281490, 4), [0x60, 0x00, 0xff, 0x14],
    '$281490 is `60 00 ff 14`');
  assert.equal(0x281492 + s16(0xff14), 0x2813a6,
    '...a WIDE bra to $2813A6, the three-way spread, computed from the '
    + 'EXTENSION WORD. W438\'s trap in the very entry this block calls: read '
    + '`60 00` as an 8-bit branch and it becomes a jump to $281492 -- the next '
    + 'instruction -- and the rank!=0 arm silently vanishes');
  assert.notEqual(0x281492 + s8(0x00), 0x2813a6,
    '...and the 8-bit reading lands on $281492 itself, which is the whole '
    + 'reason the width is asserted');
});

test('W439: kind 7 is $281A80 -- type word $8107, base speed $14 and a '
  + 'spawn-init that stores NOTHING -- so the record\'s +$1A can only be '
  + '$14 + the 4 in $274AC0\'s own immediate',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const u16 = (a) => (img[a] << 8) | img[a + 1];
  const u32 = (a) => (((img[a] << 24) | (img[a + 1] << 16) | (img[a + 2] << 8)
    | img[a + 3]) >>> 0);

  const tpl = u32(BUL.templatePtrs + 4 * 7);
  assert.equal(tpl, 0x281a80, '$281956[7] -> $281A80');
  assert.equal(u16(tpl + TPL.typeWord), 0x8107,
    'whose type word is $8107 -- alive, kind 7, bit 9 CLEAR');
  assert.equal(u16(tpl + TPL.baseSpeed), 0x0014, '...and base speed $14');
  assert.equal(u16(tpl + TPL.runInit), 0x0001,
    '...with a NON-ZERO +$10, so $2815AC does NOT skip the spawn-init');
  assert.equal(u32(BUL.spawnInitPtrs + 4 * 7), 0x2818ac,
    '...but $2815C6[7] is $2818AC, the shared epilogue that stores nothing. '
    + 'That is why D4 (`$274ACA move.l A6,D4`) is transcribed and dead, and it '
    + 'is asserted rather than assumed: five of the nine inits DO store D4');
  assert.equal(u32(BUL.behaviourPtrs + 4 * 7), 0x2826dc,
    '...and $282030[7] is $2826DC, the behaviour that then rewrites the '
    + 'descriptor and graphic every frame -- which is why matching all 64 bytes '
    + '22 frames after the spawn is a statement about the whole subsystem and '
    + 'not about a template copy');

  // The two-sided check the immediate gives: $40007 carries the KIND in its low
  // word and the SPEED BIAS in its high word, and both are visible in the
  // record.  Neither $281484 nor either global bias can supply the 4 on a
  // rank-0 run, so a transcription that dropped it puts $14 in +$1A.
  assert.equal(0x00040007 & 0x3f, 7, '$274AC0\'s low word is kind 7');
  assert.equal((0x00040007 >>> 16) & 0xffff, 4, '...and its high word is bias 4');
  assert.equal(u16(tpl + TPL.baseSpeed) + 4, 0x18,
    '...so the record must carry +$1A = $18, which is what the board holds');
});

test('W439: the muzzle table $27327A is 32 longwords indexed by (facing & $3E) '
  + '* 2, entirely inside the EXISTING window $273270+$90 -- this wave declares '
  + 'no ROM window',
{ skip: SKIP_IMAGE || SKIP_LADDER }, () => {
  const img = fs.readFileSync(IMAGE);
  const u32 = (a) => (((img[a] << 24) | (img[a + 1] << 16) | (img[a + 2] << 8)
    | img[a + 3]) >>> 0);

  const last = MUZZLE + (MUZZLE_ENTRIES - 1) * 4;
  assert.equal(last, 0x2732f6, 'the last entry starts at $2732F6');
  assert.equal(last + 3, 0x2732f9, '...and the table ends at $2732F9');
  const [wb, wl] = MUZZLE_WINDOW;
  assert.ok(MUZZLE >= wb && last + 4 <= wb + wl,
    `$27327A..$2732F9 lies inside the exported window ${hx(wb)}+${hx(wl)}`);

  // The entry THIS rung indexes, so the arithmetic is stated as a number and
  // not as a formula a reader could re-derive wrongly.
  const idx = (A5_FACING & 0x3e) * 2;
  assert.equal(idx, 0x44, 'facing $23 -> (($23 & $3E) * 2) = $44');
  assert.equal(MUZZLE + idx, 0x2732be, '...i.e. entry 17 at $2732BE');
  const m = u32(0x2732be);
  assert.equal(m, 0xfbc0ff40, '...whose longword is $FBC0FF40');
  const d3 = (((((m >>> 16) + 0x240) & 0xffff) << 16 | (m & 0xffff)) >>> 0);
  assert.equal(d3, 0xfe00ff40,
    '...and after `swap / addi.w #$240 / swap` D3 is $FE00FF40. `addi.w` cannot '
    + 'carry into the other half, which is the entire reason the ROM swaps '
    + 'twice instead of writing one `addi.l`');

  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const list = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(list.length, ROM_WINDOW_COUNT,
    'the whole window set, counted once in tests/romwindowset.js -- this wave '
    + 'declares no window and the count must RECONCILE unchanged');
  assert.equal(overlappingPairs(list), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);
  assert.ok(list.some(([b, l]) => b === wb && l === wl),
    `${hx(wb)}+${hx(wl)} is in the exported list, so the read is legal`);
});

// ===========================================================================
// A shared runner.  Every arm reads from this cache, so a segment is stepped
// ONCE however many assertions stand on it.
// ===========================================================================
const CACHE = new Map();

function boardRam(lf) {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === lf);
  assert.ok(rung, `lf${lf} must be a rung`);
  return new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
}

async function makeGame(seedLf) {
  const { Game } = await import('../src/main.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === seedLf);
  assert.ok(rung, `lf${seedLf} must be a rung`);
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));
  return {
    game: new Game(seed, tables, {
      logicFrame: seedLf, videoFrame: rung.vf, bgSeed,
    }),
    pokes,
    seed,
  };
}

function stepFrames(game, pokes, trace, from, to, drawGap) {
  let portPrev = game.ram.u16(RNG_STATE);
  let boardPrev = Number(trace.byLf.get(from).rng);
  for (let lf = from + 1; lf <= to; lf++) {
    const r = trace.byLf.get(lf);
    assert.ok(r, `the trace must carry lf${lf}`);
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(r.portin));
    const p = game.ram.u16(RNG_STATE);
    const b = Number(r.rng);
    if (drawGap && ((p - portPrev) & 0xff) !== ((b - boardPrev) & 0xff)) {
      drawGap.push([lf, (p - portPrev) & 0xff, (b - boardPrev) & 0xff]);
    }
    portPrev = p; boardPrev = b;
  }
}

const sameSlots = (board, port, base, slots, stride) => {
  let n = 0;
  const bad = [];
  for (let s = 0; s < slots; s++) {
    const o = base - RAM_BASE + s * stride;
    let ok = true;
    for (let k = 0; k < stride; k++) {
      if (board[o + k] !== port[o + k]) { ok = false; break; }
    }
    if (ok) n++; else bad.push(s);
  }
  return { n, bad };
};

async function segment(seedLf, cmpLf) {
  const key = `${seedLf}->${cmpLf}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(seedLf);
  const drawGap = [];
  stepFrames(game, pokes, trace, seedLf, cmpLf, drawGap);
  const board = boardRam(cmpLf);
  const port = game.ram.b;
  const out = {
    drawGap,
    bul: sameSlots(board, port, BUL.pool, BUL.slots, BUL.stride),
    a: sameSlots(board, port, POOL_A.base, POOL_A.generalSlots, POOL_A.stride),
    b: sameSlots(board, port, POOL_B.base, POOL_B.slots, POOL_B.stride),
  };
  CACHE.set(key, out);
  return out;
}

/** The 25-frame unit, with `mutate(game)` applied to the seeded game before the
 *  first step.  Returns the bullet diff, the firing enemy's diff, the whole-RAM
 *  byte count, and every write the port makes to slot 3's TYPE WORD. */
async function unit(mutate) {
  const trace = readTrace(TRACE);
  const { game, pokes, seed } = await makeGame(4025);
  const writes = [];
  const slot3 = BUL.pool + SPAWN_SLOT * BUL.stride;
  const orig = game.ram.setU16.bind(game.ram);
  let cur = 4025;
  game.ram.setU16 = (a, v) => {
    if (a === slot3 && (v & 0xffff) !== game.ram.u16(a)) {
      writes.push([cur, v & 0xffff]);
    }
    orig(a, v);
  };
  mutate?.(game);
  for (let lf = 4026; lf <= 4050; lf++) {
    cur = lf;
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(trace.byLf.get(lf).portin));
  }
  const board = boardRam(4050);
  const port = game.ram.b;
  const recBad = [];
  for (let k = 0; k < 0x50; k++) {
    if (board[A5 - RAM_BASE + k] !== port[A5 - RAM_BASE + k]) recBad.push(k);
  }
  let ramBytes = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== port[i]) ramBytes++;
  return {
    board, port, seed, writes, recBad, ramBytes,
    bul: sameSlots(board, port, BUL.pool, BUL.slots, BUL.stride),
    a: sameSlots(board, port, POOL_A.base, POOL_A.generalSlots, POOL_A.stride),
    b: sameSlots(board, port, POOL_B.base, POOL_B.slots, POOL_B.stride),
  };
}

const romByte = (game, a) => {
  for (const w of game.rom.windows) {
    if (a >= w.base && a < w.base + w.len) return w.bytes[a - w.base];
  }
  return null;
};
const bumpRom = (game, a) => {
  for (const w of game.rom.windows) {
    if (a >= w.base && a < w.base + w.len) {
      w.bytes[a - w.base] = (w.bytes[a - w.base] + 1) & 0xff;
      return;
    }
  }
  assert.fail(`${hx(a)} is in no ROM window, so this control cannot run`);
};

// ===========================================================================
// 2. THE RUNG IS LOAD-BEARING ON BOTH SIDES  (W435's trap)
// ===========================================================================
test('W439: at lf4025 $81373C IS a live type $82 with the cadence at 2, the '
  + 'facing at $23 and rank 0 -- and slot 3 is FREE with $281EC4\'s $FFFF '
  + 'residue, while the board\'s lf4050 slot 3 is ALIVE',
{ skip: SKIP_LADDER }, () => {
  const seed = boardRam(4025);
  const b4050 = boardRam(4050);
  const u8 = (buf, a) => buf[a - RAM_BASE];
  const u16 = (buf, a) => (buf[a - RAM_BASE] << 8) | buf[a - RAM_BASE + 1];
  const u32 = (buf, a) => (((buf[a - RAM_BASE] << 24)
    | (buf[a - RAM_BASE + 1] << 16) | (buf[a - RAM_BASE + 2] << 8)
    | buf[a - RAM_BASE + 3]) >>> 0);

  assert.equal(u32(seed, A5 + 0x4c), A5_HANDLER,
    'the record\'s ($4C,A5) handler pointer is $2747C6, so it IS a type $82 -- '
    + 'W435 shipped a wave standing on a rung that did not hold what it claimed');
  assert.equal(u8(seed, A5 + 0x22), A5_CADENCE,
    '($22,A5) = 2, so `subq.b #1` borrows on the THIRD decrement: lf4026, '
    + 'lf4027, and the fire on lf4028');
  assert.equal(u8(seed, A5 + 0x24), A5_SALVO,
    '($24,A5) = 0, so the salvo ALSO borrows on this shot and the reload arm '
    + '$274AD8..$274AEA runs -- both writes of ($22,A5) are exercised');
  assert.equal(u8(seed, A5 + 0x25), A5_SALVO_RELOAD, '($25,A5) = 3');
  assert.equal(u8(seed, A5 + 0x2f), A5_FIRE2_RELOAD, '($2F,A5) = 5');
  assert.equal(u16(seed, A5 + 0x2c), A5_FACING, '($2C,A5) = $23');
  assert.equal(u16(seed, RANK), 0,
    'and $813098 is 0, so $281484 takes its fall-through and spawns ONE bullet');
  assert.equal(u16(seed, RANK_RELOAD), 0x12, '...with $8130B4 = $12');
  // $60 - $12 + 4 = $52, then 22 further frames of `subq.b #1` -> $3C.
  assert.equal((0x60 - 0x12 + 4) - (4050 - SPAWN_LF), BOARD_CADENCE_4050,
    'so ($22,A5) is $52 at lf4028 and $3C at lf4050, arithmetic stated');
  assert.equal(u8(b4050, A5 + 0x22), BOARD_CADENCE_4050,
    '...which is exactly what the BOARD holds -- the reload block is not a '
    + 'guess, its result is in the checkpoint');
  assert.equal(u8(b4050, A5 + 0x24), BOARD_SALVO_4050,
    '...and ($24,A5) = 3, the reloaded salvo');

  const o = slotOffBul(SPAWN_SLOT);
  assert.equal((seed[o] << 8) | seed[o + 1], 0,
    'slot 3 is FREE at lf4025, so the free-slot scan can reach it');
  assert.equal((seed[o + 2] << 8) | seed[o + 3], 0xffff,
    '...carrying $281EC4\'s $FFFF residue from its previous tenant');
  const bw = (b4050[o] << 8) | b4050[o + 1];
  assert.equal(bw & 0x8000, 0x8000,
    'and the BOARD\'s slot 3 is ALIVE at lf4050');
  assert.equal(bw & TYPEBIT.kindMask, 7, '...carrying kind 7');
  assert.equal(bw & TYPEBIT.coreB, 0,
    '...with bit 9 CLEAR, so bank A spawned it');
  assert.equal(b4050[o + REC.speed], 0x18, '...at speed $18 = $14 + 4');
  assert.equal(b4050[o + REC.dir], (A5_FACING * 4) & 0xff,
    '...and direction $8C, which is the stored facing $23 SCALED BY FOUR by '
    + '$281586 -- bank A\'s 1/64-to-1/256 conversion, and the only reading of '
    + '($2C,A5) that produces the board\'s byte');
});

// ===========================================================================
// 3. THE DELIVERABLE
// ===========================================================================
test('W439: lf4025->4050 is TWO HUNDRED AND TEN of 210 bullet slots '
  + 'byte-identical, the port writes slot 3 exactly once and on lf4028, and '
  + 'pool A and pool B are untouched at 70/70 and 80/80',
{ skip: SKIP_LADDER }, async () => {
  const r = await unit(null);

  assert.deepEqual(r.bul.bad, [],
    'not one of the 210 bullet slots differs -- W438 measured 209/210 with slot '
    + '3 the single holdout');
  assert.equal(r.bul.n, BUL.slots, '210 of 210, stated as a count');
  assert.equal(r.a.n, POOL_A.generalSlots, 'pool A stays 70/70 here');
  assert.equal(r.b.n, POOL_B.slots, '...and pool B 80/80');

  // THE FRAME.  Not "a bullet appeared": the port writes this slot's type word
  // ONCE, on lf4028, with the template's own $8107.
  assert.deepEqual(r.writes, [[SPAWN_LF, 0x8107]],
    'the port writes slot 3\'s type word exactly ONCE over the 25 frames, on '
    + `lf${SPAWN_LF}, with the value $8107. The frame is load-bearing in the `
    + 'pool as well as in the cadence: the port frees slot 0 at lf4040, so a '
    + 'spawn on any later frame takes slot 0 instead and TWO slots go wrong');

  // Every byte, then the three fields that come from three different places.
  const o = slotOffBul(SPAWN_SLOT);
  const bad = [];
  for (let k = 0; k < BUL.stride; k++) {
    if (r.board[o + k] !== r.port[o + k]) bad.push(hx(k));
  }
  assert.deepEqual(bad, [],
    'and all 64 bytes of slot 3 agree with the board at lf4050');
  assert.notDeepEqual(
    [...r.port.subarray(o, o + BUL.stride)],
    [...r.seed.subarray(o, o + BUL.stride)],
    '...and the slot is NOT still the lf4025 seed, which is the state W438 '
    + 'measured and the thing this wave had to change');
  assert.equal(r.port[o + REC.speed], 0x18,
    'the record\'s +$1A is $18: kind 7\'s template base $14 plus the 4 that '
    + 'exists only in $274AC0\'s immediate');
  assert.equal(r.port[o + REC.dir], 0x8c,
    '...its +$1B is $8C, the enemy\'s stored facing $23 scaled by bank A');
  assert.equal(r.port[o + REC.origSpeed], 0x18, '...+$3A matches +$1A');
  assert.equal(r.port[o + REC.origDir], 0x8c, '...and +$3B matches +$1B');
});

test('W439: the port makes the board\'s number of RNG draws on all 25 frames -- '
  + 'the missing spawn never cost one, which is why every draw-count gate in '
  + 'the project stayed green while a bullet was absent',
{ skip: SKIP_LADDER }, async () => {
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(4025);
  const drawGap = [];
  stepFrames(game, pokes, trace, 4025, 4050, drawGap);
  assert.deepEqual(drawGap, [],
    'zero draw-gap frames, with the spawn now made -- so adding the spawn did '
    + 'not add a draw either, which is the ROM\'s own claim about $281484 at '
    + 'rank 0 turned into a measurement');
});

test('W439: the FIRING ENEMY\'s own record now matches the board at ($22,A5) '
  + 'and ($24,A5) -- two bytes outside the bullet pool that no bullet-pool fix '
  + 'could reach -- and the whole-RAM divergence at lf4050 falls to 292 bytes',
{ skip: SKIP_LADDER }, async () => {
  const r = await unit(null);
  assert.equal(r.port[A5 - RAM_BASE + 0x22], BOARD_CADENCE_4050,
    '($22,A5) = $3C, the board\'s. Before this wave the port held $E9, because '
    + 'nothing ever reloaded the counter and it wrapped through zero');
  assert.equal(r.port[A5 - RAM_BASE + 0x24], BOARD_SALVO_4050,
    '...and ($24,A5) = 3, the reloaded salvo, where the port held $00');
  assert.deepEqual(r.recBad, [0x26],
    'the ONLY byte of the 80-byte enemy record that still differs is ($26,A5), '
    + 'the HEADING cadence $2749B4 drives -- a pre-existing divergence this '
    + 'wave neither causes nor fixes, and it is present in the RED arm below '
    + 'too, which is how it is known to be independent');
  assert.equal(r.ramBytes, 292,
    'and 292 of the work RAM\'s bytes differ at lf4050, down from 717 before '
    + 'this wave. A fake that wrote the board\'s 64-byte slot 3 could at best '
    + 'have reached 717 - 64 = 653');
});

// ===========================================================================
// 4. THE RED RUNS AND THE CONTROLS -- PERFORMED, NOT ASSERTED
// ===========================================================================
test('W439: RED -- raising ($22,A5) at lf4025 so the cadence cannot borrow '
  + 'inside the window puts the port back to 209/210 with slot 3 UNTOUCHED, '
  + 'and puts ($22,A5)/($24,A5) back to disagreeing',
{ skip: SKIP_LADDER }, async () => {
  const red = await unit((g) => g.ram.setU8(A5 + 0x22, 0x40));
  assert.deepEqual(red.bul.bad, [SPAWN_SLOT],
    'exactly one slot differs again, and it is slot 3 -- so the block gated by '
    + 'that byte is the ONLY producer of this bullet in the whole 25 frames');
  assert.deepEqual(red.writes, [],
    '...and the port writes slot 3\'s type word ZERO times, which is W438\'s '
    + 'measurement reproduced on demand');
  const o = slotOffBul(SPAWN_SLOT);
  for (let k = 0; k < BUL.stride; k++) {
    assert.equal(red.port[o + k], red.seed[o + k],
      `...with slot 3 byte-identical to the lf4025 SEED at ${hx(k)}`);
  }
  assert.deepEqual(red.recBad, [0x22, 0x24, 0x26],
    'and the enemy record differs at ($22,A5) and ($24,A5) as well as the '
    + 'pre-existing ($26,A5) -- the two bytes the block writes');
  assert.equal(red.ramBytes, 717,
    '...and the whole-RAM divergence is back at 717 bytes. 717 - 292 = 425 '
    + 'bytes turn on this one call, which is far more than the 64 the record '
    + 'holds: the bullet is drawn, counted and stepped');
  assert.equal(red.a.n, POOL_A.generalSlots,
    'pool A is 70/70 in the RED arm too, so the arm changes the bullet and '
    + 'nothing else structural');
  assert.equal(red.b.n, POOL_B.slots, '...and pool B 80/80');
});

test('W439: RED -- corrupting the ONE muzzle-table longword $274AB4 indexes '
  + '(entry 17, $2732BE) turns slot 3 red at exactly +$02, while corrupting '
  + 'entry 0 ($27327A) changes NOTHING. A hardcoded D3 survives both',
{ skip: SKIP_LADDER }, async () => {
  const red = await unit((g) => {
    assert.equal(romByte(g, 0x2732be), 0xfb,
      'the byte about to be corrupted is $FB, the top byte of entry 17\'s long '
      + 'axis -- so +1 moves the spawn by $100 on that axis alone');
    bumpRom(g, 0x2732be);
  });
  assert.deepEqual(red.bul.bad, [SPAWN_SLOT],
    'slot 3 differs -- so the port READ that longword out of the cartridge. A '
    + 'transcription that had baked D3 in as a constant would be unaffected, '
    + 'and this arm would stay 210/210');
  const o = slotOffBul(SPAWN_SLOT);
  const bad = [];
  for (let k = 0; k < BUL.stride; k++) {
    if (red.board[o + k] !== red.port[o + k]) bad.push(k);
  }
  assert.deepEqual(bad, [REC.posA],
    '...and it differs at +$02 ALONE, the high byte of the long axis -- the '
    + 'single byte a $100 shift of that axis can move. Not the speed, not the '
    + 'direction, not the slot: the corruption lands exactly where the decode '
    + 'says it must');
  assert.deepEqual(red.writes, [[SPAWN_LF, 0x8107]],
    '...on the same frame and with the same type word, because the muzzle '
    + 'offset decides WHERE and nothing else');

  // The positive control on the INDEX.  W433's rule: a scan that finds nothing
  // proves nothing until something it should find is fed to it.
  const ctl = await unit((g) => bumpRom(g, MUZZLE));
  assert.deepEqual(ctl.bul.bad, [],
    'corrupting entry 0 leaves the port at 210/210 -- `(facing & $3E) * 2` with '
    + 'facing $23 selects entry 17 and not entry 0, and the two arms together '
    + 'say the index is right rather than merely that a table is read');
  assert.equal(ctl.ramBytes, 292,
    '...and the whole-RAM divergence is unchanged at 292, so entry 0 is read by '
    + 'nothing else on this rung either');
});

// ===========================================================================
// 5. THE NEIGHBOURS -- W434..W438 NOT REGRESSED, AND WHAT DID **NOT** IMPROVE
// ===========================================================================
test('W439 (rewritten by W440): lf9600->9700 and lf9700->9800 are where W438 '
  + 'left them at 210/210 and 70/70, and lf9500->9600 -- which W439 measured '
  + 'at 149/210 and 2/70 and explicitly did NOT fix -- is now 210/210 and '
  + '70/70, fixed by W440 and not by $274A9C',
{ skip: SKIP_LADDER }, async () => {
  const a = await segment(9500, 9600);
  const b = await segment(9600, 9700);
  const c = await segment(9700, 9800);

  assert.equal(b.bul.n, BUL.slots, 'lf9600->9700 bullets 210/210');
  assert.equal(b.a.n, POOL_A.generalSlots, '...and pool A 70/70');
  assert.deepEqual(b.drawGap, [], '...with no draw-gap frame');
  assert.equal(c.bul.n, BUL.slots, 'lf9700->9800 bullets 210/210');
  assert.equal(c.a.n, POOL_A.generalSlots, '...and pool A 70/70');
  assert.deepEqual(c.drawGap, [], '...with no draw-gap frame');

  assert.equal(a.bul.n, BUL.slots,
    'lf9500->9600 is 210 of 210 bullet slots. [M] W438 and W439 both measured '
    + '149 here and W439 asserted it so it could not be quietly claimed later. '
    + 'It was NOT quietly claimed: it moved when W440 decoded four wide '
    + 'branches in src/bossf23.js, which is a different file from the one this '
    + 'wave touched. ONE MISSING SPAWN WAS NOT THE SAME DEFECT AS THE 61 SLOTS '
    + 'THAT DIFFERED HERE, and that is now proved rather than merely stated');
  assert.equal(a.a.n, POOL_A.generalSlots,
    '...and pool A is 70/70 on that same run, where it was 2/70');
  assert.deepEqual(a.drawGap, [], '...with W437\'s draw agreement intact');

  for (const [name, r] of [['lf9500->9600', a], ['lf9600->9700', b],
    ['lf9700->9800', c]]) {
    assert.equal(r.b.n, POOL_B.slots, `pool B is 80/80 on ${name}`);
  }
});

test('W439 (rewritten by W440): the two rungs BELOW the pool-A window are '
  + 'unregressed and then some -- lf9300->9400 and lf9400->9500, which W439 '
  + 'measured at 111/210 and 113/210, are both 210/210 since W440',
{ skip: SKIP_LADDER }, async () => {
  const a = await segment(9300, 9400);
  const b = await segment(9400, 9500);
  assert.equal(a.bul.n, BUL.slots,
    'lf9300->9400 bullets 210/210, where W439 measured 111 and recorded it as '
    + 'a rung it had not touched');
  assert.equal(b.bul.n, BUL.slots,
    'lf9400->9500 bullets 210/210, where W439 measured 113');
  for (const [name, r] of [['lf9300->9400', a], ['lf9400->9500', b]]) {
    assert.equal(r.a.n, POOL_A.generalSlots, `pool A is 70/70 on ${name}`);
    assert.equal(r.b.n, POOL_B.slots, `...and pool B 80/80 on ${name}`);
    assert.deepEqual(r.drawGap, [], `...with no draw-gap frame on ${name}`);
  }
});

test('W439: $274A9C is no longer a counted note -- the port runs the block '
  + 'instead of logging it', { skip: SKIP_LADDER }, async () => {
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(4025);
  stepFrames(game, pokes, trace, 4025, 4050, null);
  const notes = game.unportedLog.report().filter((l) => l.includes('$274A9C'));
  assert.deepEqual(notes, [],
    'no `$274A9C` line in unportedLog. [M] Before this wave there was exactly '
    + 'ONE over these 25 frames, on record $81373C, and it was the only spawn '
    + 'the port declined to make in the whole window');
});
