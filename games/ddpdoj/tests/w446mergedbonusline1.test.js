// WAVE 446 -- `$25FFA8` WAS TRANSCRIBED TWICE, AND THE LIVE COPY WAS THE BROKEN ONE.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG
// ---------------------------------------------------------------------------
// `$25FF52[1]` is `$25FFA8`, so request 1 of the `$25FF7A` dispatcher runs it. Request
// 1 is posted from two places -- `$24A210` on a player death, and the tally's own
// poster -- and the port read those as two routines:
//
//     W228  player.js  respawn25FFA8        $25FFA8..$260054   NO PRODUCTION CALLER
//     W289  tally.js   bonusLine125FFA8     $25FFA8..$260054   tallyDriver case 1
//
// Both readings are true. The cartridge has ONE routine. Two transcriptions of one
// routine is the defect, and it drifted: diffed against the IMAGE (not against each
// other) the LIVE one was missing two things and the caller-less one was missing none.
//
//     [M] $26002E  2d 40 00 18   move.l D0,($18,A6)     ABSENT from tally.js
//     [M] $260032..$260044       the four fills         guarded by `made.ok` in
//                                                       tally.js, unconditional in
//                                                       the cartridge
//
// THE FIRST ONE WAS LIVE AND VISIBLE. `liveSides25FD94` counts a side live iff
// `($18,A6) != 0`; bonus line 2 calls it at `$26005C`. With the store missing the
// count came out ZERO while a side was still playing, and `$25FDD4/$25FDE0` turned
// that into `bsr $25FD82` -- **the background PAUSE**. SECTION 3 traces it.
//
// ---------------------------------------------------------------------------
// HOW THESE TESTS FAIL IF THE MERGE IS FAKED -- read this before trusting them
// ---------------------------------------------------------------------------
//   * Storing any nonzero constant at `($18,A6)`: SECTION 3 asserts the stored
//     longword EQUALS `$80E882` and the staging slot's `($4C,A0)` -- objalloc.js's
//     own RAM, in neither changed file.
//   * Deleting one copy without merging its content: SECTION 2 requires exactly ONE
//     export to claim `$25FFA8`, and SECTIONS 3 and 5 require the behaviour that only
//     the deleted copy had.
//   * Making the witnesses insensitive: SECTION 4 is the CONTROL. It runs the same
//     two driver frames with `($18,A6)` cleared between them -- byte for byte the
//     state HEAD produced -- and requires all three witnesses to flip. If SECTION 3
//     could pass on a body that never stores, SECTION 4 goes red instead.
//   * Typing the numbers instead of reading them: SECTION 1 decodes `$26002E`'s
//     displacement, `$2411DA`'s `moveq` and every branch in the routine OUT OF
//     `maincpu.bin` (the W428 lesson), including the six WIDE branches this project
//     has misread for five waves running.
//
// THE WITNESSES ARE OUTSIDE THE CHANGED FILES: `$81308C`/`$81308E` are hud.js's word
// (read by laser.js, effects.js, handlers.js and damage.js), `$8130D2` is
// stageend.js's background pause flag, and `$80E882`/`$80D56C`/`$80D51C` are
// objalloc.js's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { TALLY, tallyDriver25FF7A } from '../src/tally.js';
import { ALLOC } from '../src/objalloc.js';
// W451 merged six `$242684` private screen tests, taking 92 to 91. W453 merged
// the exported/private `$242494` octagonal-distance pair, taking 91 to 90.
const W453_NOTE = 'W451 merged $242684 (92 - 1 = 91); W453 merged $242494 '
  + '(survivor bossscripts.js dist242494), so 91 - 1 = 90. ';

const here = (p) => join(dirname(fileURLToPath(import.meta.url)), p);
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const SKIP_IMG = existsSync(IMAGE) ? false : 'maincpu.bin absent; skip, not pass';
const IMG = SKIP_IMG ? null : readFileSync(IMAGE);

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

// The three witnesses, all outside tally.js and player.js.
const ATTRACT = 0x81308c;      // hud.js HUDRAM.attract -- laser.js gates the beam on it
const COUNTM1 = 0x81308e;      // $25FDC8 -- live sides MINUS ONE
const BGPAUSE = 0x8130d2;      // stageend.js SE.pauseFlag
const P1COUNT = 0x8130be;      // W445 measured these two on 644 board dumps
const P2COUNT = 0x8130c0;

// ======================================================= SECTION 1: THE CARTRIDGE
//
// Everything asserted here is DECODED, not typed. A brief that said "the live copy is
// simply missing a line" is not evidence; the image is.

test('SECTION 1: [M] $26002E IS `move.l D0,($18,A6)`, and $18 is read out of the image',
  { skip: SKIP_IMG }, () => {
    const op = IMG.readUInt16BE(0x26002e);
    // MOVE is `00 SS RRR MMM mmm rrr` and **THE DESTINATION HALF IS REVERSED**:
    // bits 11-9 are the destination REGISTER and bits 8-6 the destination MODE, the
    // opposite order from the source half. $2D40 = 0010 110 101 000 000, so long,
    // A6, (d16,An), D0. Getting that backwards reads this instruction as A5 -- and
    // the first draft of this test did exactly that and went red, which is why the
    // fields are pulled apart here instead of matched as one 16-bit constant.
    assert.equal(op, 0x2d40, '$26002E should be $2D40');
    assert.equal((op >> 12) & 0x3, 0x2, 'size bits %10 -- LONG, not word');
    assert.equal((op >> 3) & 0x7, 0, 'source EA mode 0 = a data register');
    assert.equal(op & 0x7, 0, '...and register 0 = D0');
    assert.equal((op >> 9) & 0x7, 6, 'destination REGISTER (bits 11-9) = 6 = A6');
    assert.equal((op >> 6) & 0x7, 5, 'destination MODE (bits 8-6) = %101 = (d16,An)');
    assert.equal(IMG.readInt16BE(0x260030), 0x18,
      'the displacement is $18 -- the SAME field liveSides25FD94 counts, and the same '
      + 'one $25FFAE clears on the way in');
  });

test('SECTION 1: the four fills at $260032..$260044 are UNCONDITIONAL -- nothing '
  + 'branches over them, so `if (made.ok)` was an invention', { skip: SKIP_IMG }, () => {
  // Walk the whole tail of the not-finished arm and collect every branch opcode in it.
  // If the cartridge skipped the fills on a failed allocation there would have to be
  // one, and there is not.
  const branches = [];
  for (let a = 0x26002e; a < 0x26004a; a += 2) {
    const w = IMG.readUInt16BE(a);
    if ((w & 0xf000) === 0x6000) branches.push(a.toString(16));       // Bcc / BRA / BSR
    if ((w & 0xf0f8) === 0x50c8) branches.push(a.toString(16));       // DBcc
  }
  assert.deepEqual(branches, [],
    '$26002E..$260048 must be straight-line: `move.l D0,($18,A6)` and four fills, then '
    + '$26004A. A branch here would be the guard tally.js used to have');
  // ...and the allocator's own failure arm says what to store: NOT "a convention".
  assert.equal(IMG.readUInt16BE(0x2411d4), 0x41f9, '$2411D4 lea ...');
  assert.equal(IMG.readUInt32BE(0x2411d6), 0x80d51c, '...$80D51C, the shared dummy');
  assert.equal(IMG.readUInt16BE(0x2411da), 0x7000,
    '$2411DA is `moveq #$0,D0` -- the cartridge STORES ZERO on a full queue. player.js '
    + 'called that "this port keeps stageend.js\'s convention of storing zero rather '
    + 'than inventing the register\'s contents"; it is not a convention, it is the '
    + 'instruction');
  assert.equal(IMG.readUInt16BE(0x2411c4), 0x2039, '$2411C4 move.l ...');
  assert.equal(IMG.readUInt32BE(0x2411c6), 0x80e882,
    '...$80E882,D0 -- so D0 at $26002E is the ID the allocator just minted');
});

test('SECTION 1: every branch in $25FFA8..$260054 is WIDE, and each one resolves where '
  + 'the port says', { skip: SKIP_IMG }, () => {
  // FIVE WAVES RUNNING this project has read `60 00` / `66 00` / `6a 00` as an 8-bit
  // displacement of zero and lost an arm onto the extension word. Every branch in this
  // routine is one of them, so require the low byte to be zero and resolve the target
  // through the extension word.
  const found = [];
  for (let a = 0x25ffa8; a < 0x260054; a += 2) {
    const w = IMG.readUInt16BE(a);
    if ((w & 0xf000) !== 0x6000) continue;
    assert.equal(w & 0xff, 0,
      `$${a.toString(16)} has a NON-ZERO 8-bit displacement -- decode it as short`);
    found.push(`${a.toString(16)}/${(w >> 8).toString(16)}->${(a + 2 + IMG.readInt16BE(a + 2)).toString(16)}`);
    a += 2;                                     // step over the extension word
  }
  assert.deepEqual(found,
    ['25ffcc/6a->26000c',      // bpl  -- borrow NOT taken: run one more frame
      '25ffd4/66->25fff0',     // bne  -- ($17,A6) picks the side
      '25ffec/60->260004',     // bra
      '260008/60->26004e',     // bra  -- the finished arm SKIPS the fills entirely
      '260010/66->26001e',     // bne  -- $28795C for side 1
      '26001a/60->260024'],    // bra
  'six wide branches; $25FFCC is `bpl` ($6A) so the FINISHED arm is the FALL-THROUGH, '
    + 'which is the old-zero borrow in its other form');
});

// ======================================================= SECTION 2: ONE TRANSCRIPTION
//
// The unit was not "add the missing line" -- it was "stop there being two bodies".
// This scans `src/` the way `w444deferrals.test.js` builds its PORTED index and
// requires `$25FFA8` to be claimed exactly once.

function portedIndex() {
  const SRC = here('../src');
  const files = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.js')) files.push([rel + e.name, readFileSync(join(dir, e.name), 'utf8')]);
    }
  })(SRC, '');
  const inRom = (a) => a >= 0x230000 && a < 0x2b0000;
  const ported = new Map();
  for (const [file, text] of files) {
    const lines = text.split(/\r?\n/);
    lines.forEach((L, i) => {
      const fn = L.match(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (!fn) return;
      const claim = (a) => {
        if (!inRom(a)) return;
        if (!ported.has(a)) ported.set(a, new Set());
        ported.get(a).add(`${file}:${i + 1} ${fn[1]}`);
      };
      const suffix = fn[1].match(/([0-9a-fA-F]{6})$/);
      if (suffix) claim(parseInt(suffix[1], 16));
      let j = i - 1;
      const doc = [];
      while (j >= 0 && /^\s*(\*|\/\*\*)/.test(lines[j])) {
        doc.unshift(lines[j]);
        if (/^\s*\/\*\*/.test(lines[j])) break;
        j -= 1;
      }
      const first = doc.join('\n').match(/`?\$([0-9A-Fa-f]{6})`/);
      if (first) claim(parseInt(first[1], 16));
    });
  }
  return ported;
}

test('SECTION 2: exactly ONE export in src/ claims $25FFA8, and it is the live one', () => {
  const claims = [...(portedIndex().get(0x25ffa8) ?? [])].sort();
  assert.equal(claims.length, 1,
    'W446 exists because there were TWO. If this is 2 again, the routine has been '
    + 'transcribed twice a second time -- merge, do not sync: ' + claims.join(' / '));
  assert.match(claims[0], /^tally\.js:\d+ bonusLine125FFA8$/,
    'the survivor is tally.js bonusLine125FFA8, because tallyDriver25FF7A -- the only '
    + 'production caller either copy ever had -- is in that file: ' + claims[0]);
});

// THE REGISTER OF EVERY OTHER DOUBLY-CLAIMED ADDRESS, ASSERTED EXACTLY.
//
// **W446 AUDITED EXACTLY ONE OF THESE, `$25FFA8`.** It left 24 unread.
//
// **W447 READ ALL 24 AND MERGED TWO**, so the register is 22 and the arithmetic is:
//
//     W446 left            24
//     $2428A6 merged       -1   two transcriptions in boss.js, and they DISAGREED:
//                               `bossDecide2428A6` tested `$8103E7` where `$2428B0
//                               btst #$0,$8103E6` tests the byte AT `$8103E6`. A
//                               player in hyper has the low byte's bit 0 set, so
//                               Hibachi form 2 refilled its HP pool instead of dying.
//                               Survivor: `livePlayers2428A6`. See w447merged2428a6.
//     $242B3C merged       -1   byte-identical clones in items.js and rng.js over the
//                               one shared `$803917` counter. Survivor: rng.js's.
//     ------------------------
//     W447 leaves          22
//
// Of the 22 that remain, W447's audit classified SEVENTEEN as legitimately distinct:
// either the doc-opening convention naming the caller or callee on the other side of
// a single body, or a wrapper/entry pair where one function CALLS the other -- one
// body, so drift is impossible. FIVE are real second transcriptions and each is its
// own wave: `$25D9E6`, `$25DA60`, `$25FF38`, and `$246520`/`$24652A`, the last two
// being the visible edge of THREE independent ports of one constructor. W457,
// W458 and W459 have now merged the first three; W448 merged the constructor pair
// (`animobjects.js`, `spawn.js`, `stageend.js`) contending for the same two pools.
//
// They stay written down so that a SEVENTEENTH turns this red the day it appears,
// which is the only thing that would have caught W446's defect at W289 instead of at
// W445. Removing a row because a wave merged it is progress; ADDING one is a wave.
const DOUBLY_CLAIMED_UNAUDITED = Object.freeze([
  // W448 REMOVED $246520 AND $24652A: `animobjects.js`, `spawn.js` and `stageend.js` each
  // carried an independent transcription of the ONE body at `$246532` (two heads --
  // `$246520` D6=1 and `$24652A` D6=0 -- joined by `$246528 bra.s $246532`). The survivor
  // is `animobjects.js buildChain246532`; `spawn.js buildParts246520` and `stageend.js`'s
  // `chainLoader24652A` + `chainLoaderBody` are deleted. w448merged246520.test.js pins it.
  //
  // W449 REMOVED $246800: the chain free was transcribed THREE times as well -- `animobjects.js`
  // reached its body through the private name `clearChain`, `spawn.js` had `freeChain246800`
  // (no production caller) and `stageend.js` had `chainFree246800` (eleven). The survivor is
  // `animobjects.js freeAnimObjects246800`, and the defect was an INVENTED `if (root !== 0)`
  // over a routine the ROM enters unconditionally. w449merged246800.test.js pins it.
  // W457 REMOVED $25D9E6: the tally posting and phase-0 load paths now call
  // one complete word-width cursor-map body. w457mergedtallycursor.test.js pins
  // the 122-byte cartridge span and both carry continuations.
  // W459 REMOVED $25FF38: the corrected player.js D0.W body now owns all production
  // calls, and tallyscreen.js preserves its historical name as a compatibility alias.
  0x2417de, 0x242ec2, 0x246710, 0x24676a, 0x249ee2,
  0x2564f0, 0x259962, 0x263386, 0x2633be, 0x2638a6,
  0x27f6e4, 0x2875b4, 0x28d520, 0x28f588, 0x29f9b4, 0x2a11d4,
]);

test('SECTION 2b: no NEW ROM address becomes claimed by two exports', () => {
  const hex = (a) => '$' + a.toString(16).toUpperCase();
  const dup = [...portedIndex()]
    .filter(([, v]) => v.size > 1)
    .map(([a]) => a)
    .sort((a, b) => a - b);
  assert.deepEqual(dup.map(hex), [...DOUBLY_CLAIMED_UNAUDITED].map(hex),
    'the set of ROM addresses claimed by more than one `export function` moved.\n'
    + 'A NEW one is W446\'s defect happening again: two bodies for one routine, free\n'
    + 'to drift, with only one of them live. Merge them -- do not add the address\n'
    + 'here. A row LEAVING is fine if a wave merged it; say so where you delete it.\n'
    + 'NOTE $25FFA8 is deliberately ABSENT: W446 merged it, and SECTION 2 pins that.\n'
    + 'NOTE $2428A6 and $242B3C are deliberately ABSENT TOO: W447 merged them, and\n'
    + 'tests/w447merged2428a6.test.js SECTIONS 2 and 2b pin that. 24 - 2 = 22.\n'
    + 'NOTE $246520 and $24652A are ABSENT TOO: W448 merged the THREE transcriptions\n'
    + 'of the one body at $246532. 22 - 2 = 20.\n'
    + 'NOTE $246800 is ABSENT TOO: W449 merged the THREE transcriptions of the chain\n'
    + 'free, and tests/w449merged246800.test.js SECTION 2 pins that. 20 - 1 = 19.\n'
    + 'NOTE $25D9E6 is ABSENT TOO: W457 merged its posting and load transcriptions. '
    + '19 - 1 = 18.\n'
    + 'NOTE $25DA60 is ABSENT TOO: W458 merged its live and compatibility transcriptions. '
    + '18 - 1 = 17.\n'
    + 'NOTE $25FF38 is ABSENT TOO: W459 corrected D0.W ownership and merged its bodies. '
    + '17 - 1 = 16.');
  assert.equal(dup.length, 16,
    'the register is 16 after W459: W458 left 17 and W459 merged $25FF38. '
    + 'Asserted as a NUMBER as '
    + 'well as a set, so that a scan which finds nothing cannot read as two more '
    + 'merges -- an empty dup list satisfies neither.');
});

// W450 CORRECTED WHAT THE THEN-19 MEANT. IT WAS A FLOOR, NOT A COUNT.
//
// `portedIndex()` above indexes `export function` and nothing else, so a
// module-private `function`, a `const` arrow, a method and any copy whose doc
// names no address are ALL invisible to it. W449 found `$246800` transcribed a
// FOURTH time behind the private name `animobjects.js clearChain`, and this
// scan could not have told anyone.
//
// **MEASURED, NOT ARGUED:** W450 planted a private `respawn25FFA8` in
// `src/unported.js` -- a second transcription of the very address THIS FILE
// merged -- and every test in this file, w447, w448 and w449 stayed GREEN.
// The widened guard went red on it.
//
// The old 19 remains in the arithmetic above as history; W457, W458 and W459's
// proved merges move the live narrow count to 16. W460 removed a private optional shim,
// W461 removed the private $242E24 rank-byte body, W462 removed both private
// $2414BE adapter heads, and W463 removed both private $28C0FC counted-note adapters.
// Narrow remains 16 while the widened figure moves to 81.
test('SECTION 2c [W450/W465]: the widened register is 81, so narrow 16 remains a floor', async () => {
  const { headRegister } = await import('./w450widenedscan.js');
  assert.equal(headRegister().length, 81,
    'the WIDENED register (private functions, arrows, methods and the whole doc opening '
    + 'span, not just `export function`) is not 81. ' + W453_NOTE
    + 'W457 merged $25D9E6; W458 merged $25DA60; W459 merged $25FF38; '
    + 'W460 removed the optional $24631C forwarding shim; W461 merged the private '
    + '$242E24 rank-byte body into rng.js drawByte242E24; W462 removed both private '
    + '$2414BE installTxBank heads while retaining canonical palette.js install2414BE; W463 '
    + 'removed both private $28C0FC counted-note adapter heads; '
    + 'tests/w450widenedregister.test.js SECTION 3 holds the exact set and is where a new '
    + 'duplicate must be resolved. This cross-check prevents narrow 16 being read as the total');
});

// ======================================================= SECTION 3: THE STATE TRACE
//
// The production entry, two frames, exactly as `$25FF7A` runs it.

/** Arm a record the way `$24A210` and the tally's poster do: request 1. */
function arm(ram, a6, ptr, lives, type, row) {
  ram.setU16(a6 + 0x00, 1);                    // $25FF52[1] = $25FFA8
  ram.setU16(a6 + 0x02, 0x1234);
  ram.setU32(a6 + TALLY.ptr, ptr);             // ($8,A6) POINTS at the count
  ram.setU16(a6 + 0x0c, 0x1000);
  ram.setU16(a6 + 0x0e, 0x0e00);
  ram.setU16(a6 + TALLY.type, type);
  ram.setU8(a6 + TALLY.row, row);
  ram.setU16(ptr, lives);
}

/** P1 still has lives, P2 has just spent its last -- two records, one driver. */
function twoSides() {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { ram, rom: ROM, unported: log, unportedLog: log };
  arm(ram, TALLY.side0, P1COUNT, 3, 2, 0);
  arm(ram, TALLY.side1, P2COUNT, 0, 3, 1);
  return { ram, ctx, log };
}

test('SECTION 3: the side count on the LIVE tally path, two driver frames',
  { skip: SKIP }, () => {
    const { ram, ctx } = twoSides();

    // ---- FRAME 1. Both records are on request 1, so the driver runs bonus line 1
    // twice: P1 borrows nothing (3 -> 2) and creates its object; P2 borrows (0 -> -1)
    // and hands itself to request 2.
    assert.deepEqual(tallyDriver25FF7A(ram, ROM, ctx, ALLOC.createDummy), [1, 1]);
    assert.equal(ram.u16(P1COUNT), 2, '$25FFC8 spent one of P1\'s three');
    assert.equal(ram.u16(P2COUNT), 0xffff, 'and P2\'s went NEGATIVE -- $FFFF, not clamped');
    assert.equal(ram.u16(TALLY.side0), 0, '$26004A re-posts P1 idle');
    assert.equal(ram.u16(TALLY.side1), 2,
      '$260004 arms request 2, and $25FF52[2] is $260056 -- the continue entry');

    // **THE STORE.** This is the whole wave, and it is checked against objalloc.js's
    // RAM so that a hard-coded nonzero cannot satisfy it.
    const minted = ram.u32(ALLOC.createStage + ALLOC.idOff);
    assert.notEqual(minted, 0, 'the allocator minted an id at $2411CA');
    assert.equal(ram.u32(TALLY.side0 + TALLY.result), minted,
      '$26002E move.l D0,($18,A6) -- the handle liveSides25FD94 counts. THIS IS THE '
      + 'LINE tally.js did not have');
    assert.equal(ram.u32(TALLY.side0 + TALLY.result), ram.u32(ALLOC.idCounter),
      '...and it is $80E882, the counter $2411BE bumped -- not a constant');
    assert.equal(ram.u32(TALLY.side1 + TALLY.result), 0,
      'P2 finished, so $25FFAE\'s clear stands: the finished arm creates nothing');

    // ---- FRAME 2. P2 is on request 2, whose SECOND instruction is `jsr $25FD94`.
    assert.deepEqual(tallyDriver25FF7A(ram, ROM, ctx, ALLOC.createDummy), [0, 2]);
    assert.equal(ram.u16(COUNTM1), 0,
      '$81308E = live sides MINUS ONE. ONE side is live (P1), so 0. Before the merge '
      + 'this was $FFFF -- "no side is live" -- with P1 still playing');
    assert.equal(ram.u16(ATTRACT), 1,
      '$81308C is the ONE-LIVE-SIDE flag after $25FDEE\'s inversion. laser.js gates the '
      + 'hyper beam impact on this word being non-zero');
    assert.equal(ram.u16(BGPAUSE), 0,
      '$8130D2 -- and this is the one that was VISIBLE. $25FDD4/$25FDE0 `bsr $25FD82` '
      + 'fires only when NO side is live, so the miscount PAUSED THE BACKGROUND with a '
      + 'player still alive');
  });

// ======================================================= SECTION 4: THE CONTROL
//
// SECTION 3 is only worth something if its three witnesses actually move. This runs
// the identical two frames and clears `($18,A6)` between them -- which is precisely
// the state the port produced before the merge, since `$25FFAE` had already zeroed it
// and nothing wrote it back.

test('SECTION 4: with the handle NOT stored, all three witnesses flip -- so SECTION 3 '
  + 'cannot pass on a body that never stores', { skip: SKIP }, () => {
  const { ram, ctx } = twoSides();
  tallyDriver25FF7A(ram, ROM, ctx, ALLOC.createDummy);
  ram.setU32(TALLY.side0 + TALLY.result, 0);            // the missing $26002E, exactly
  tallyDriver25FF7A(ram, ROM, ctx, ALLOC.createDummy);

  assert.equal(ram.u16(COUNTM1), 0xffff, 'ZERO live sides -- $25FDC2\'s subq with no floor');
  assert.equal(ram.u16(ATTRACT), 0, 'and the one-live-side flag is clear...');
  assert.equal(ram.u16(BGPAUSE), 1,
    '...and $25FD82 froze the background. Three separate words, all wrong, from one '
    + 'missing instruction -- this is what HEAD did on the live path');
});

// ======================================================= SECTION 5: THE FULL QUEUE
//
// The other half of the merge: `if (made.ok)` skipped four writes the cartridge makes.

test('SECTION 5: a FULL create queue still fills the dummy, and stores ZERO',
  { skip: SKIP }, () => {
    const { ram, ctx } = twoSides();
    ram.setU16(ALLOC.createSp, ALLOC.createCap);         // $24118C cmpi.w #$640 / bge
    ram.setU32(TALLY.side0 + TALLY.result, 0xdeadbeef);  // must be OVERWRITTEN, not kept
    tallyDriver25FF7A(ram, ROM, ctx, ALLOC.createDummy);

    assert.equal(ram.u32(TALLY.side0 + TALLY.result), 0,
      '$2411DA `moveq #$0,D0` then $26002E stores it. The store happens on BOTH arms, '
      + 'so a stale handle can never survive a failed allocation');
    assert.deepEqual([ram.u8(ALLOC.createDummy + 0x06), ram.u8(ALLOC.createDummy + 0x07),
      ram.u16(ALLOC.createDummy + 0x08), ram.u16(ALLOC.createDummy + 0x0a)],
    [0, 0, 0x1000, 0x0e00],
    '$260032..$260044 run into $80D51C because A0 is the dummy and nothing branches '
      + 'over them. tally.js used to skip these four; lines 7 and 8 of that same file '
      + 'already write the dummy through resolveHandle241298, so it was not even '
      + 'self-consistent');
    assert.equal(ram.u32(ALLOC.idCounter), 0,
      'and $2411BE never ran -- the failure arm returns before the id counter');
  });
