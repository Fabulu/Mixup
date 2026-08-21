// ===============================================================================================
// W448 -- ONE CONSTRUCTOR, THREE INDEPENDENT TRANSCRIPTIONS, AND NO TWO OF THEM AGREED.
// ===============================================================================================
//
// `$246520` and `$24652A` are TWO HEADS ON ONE BODY. Off the image:
//
//   246520  48e7 7ff8   movem.l D1-D7/A0-A4,-(A7)
//   246524  3c3c 0001   move.w #$1,D6
//   246528  6008        bra.s $246532            <- FOUR BYTES PAST the other head's move.w
//   24652A  48e7 7ff8   movem.l D1-D7/A0-A4,-(A7)
//   24652E  3c3c 0000   move.w #$0,D6
//   246532  43f9 0081 0346   lea $810346,A1      <- ...and here they are the same instruction
//
// W447 audited twenty-four doubly-claimed ROM addresses and named this pair the worst drift risk
// of all of them: `animobjects.js loadAnimObjectsNoFill`, `spawn.js buildParts246520` and
// `stageend.js chainLoaderBody` were THREE independent transcriptions of `$246532`, all three
// allocating out of the SAME `$810346` (3 x $30) and `$80FA86` (20 x $70) pools under three
// different vocabularies. It merges. This file is the proof, and the measurement is worse than
// the brief predicted: **each of the three was wrong somewhere the other two were right, so no
// two of them were the same function.**
//
//   AXIS                                      animobjects   spawn        stageend
//   ------------------------------------------------------------------------------------
//   $246608 failure return                    0             0            $FFFFFFFF  <- correct
//   $24655E move.w #$8000,(A2) node claim     yes           **ABSENT**   yes
//   $246562 move.w #$0,($20,A2)               yes           **ABSENT**   yes
//   $246592 adda.w sign-extends the bias      yes           **NO**       yes
//   $2465D4 snapshot source                   RAM <- right  **ROM**      RAM
//   ($12,A2) written -- the ROM does not      **YES**       no           no
//   $2465E2 one forward pass of 20 visits     **no**        yes          **no**
//   $246558 the node loop is a DO-WHILE       yes           yes          **no**
//
// THE SURVIVOR IS `animobjects.js`. It is a leaf -- it imports only `ram.js` and `unported.js` --
// it already owns `ANIM_OBJECT`, `TARGETS`, `timing()`, the node offsets and both content-block
// shapes, and `stageend.js` ALREADY imported from it. Merging the other way would have inverted
// that edge, which W446 and W447 both forbid.
//
// THE COST, AND IT IS A CRASH, NOT A DRIFT. `spawn.js`'s copy is the LIVE one -- `handlers.js`
// calls it from type $4C's death arm (`$26F6D8 jsr $246520`) -- and it read the palette snapshot
// through `rom.u16`. `$2465C8 movea.l ($E,A2),A3` makes A3 `$24627A[family]` + the script's bias,
// and `$24627A`'s three bases are `$80E886`/`$80F086`/`$80F886`: PALETTE RAM. Type $4C's own
// script `$2701C8` is {count 1, family 0, bias $480}, so the read was `rom.u16($80ED06)` --
// outside every window `export-tables.py` declares AND outside the 6 MiB image. SECTION 3b runs
// the deleted body verbatim through the real windowed ROM face and catches the throw.
// **The live copy was the broken one for the third wave running.**
//
// SECTION 1   the bytes: one body, two heads, and every axis above, off the image
// SECTION 2   the merge: one claimant each, the deleted names gone, callers reaching the survivor
// SECTION 3   THE STATE TRACE, with witnesses outside every changed file (palette.js)
// SECTION 3b  the three DELETED bodies, verbatim, each required to DISAGREE
// SECTION 4   the failure return, settled from the image: $FFFFFFFF on both arms of both heads
// SECTION 4b  THE RED ARM -- the same call with palette RAM in the OPPOSITE state, requiring the
//             SAME cells to hold DIFFERENT values. A body blinded to `($E,A2)` passes SECTION 3.
// SECTION 5   the pools did not move
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  ANIM_OBJECT, CHAIN_SPECS, CHAIN_CONTENT, CHAIN_CONTENT_24652A,
  buildChain246532, loadAnimObjects246520, loadAnimObjects24652A,
  runAnimObjects24683E, seedChainNode24676A,
} from '../src/animobjects.js';
import { chainLoader246710, chainLoader246704, chainCheck24681A } from '../src/stageend.js';
import { PARTS } from '../src/spawn.js';
import { PaletteState, PALSTAGE, flush24133C } from '../src/palette.js';

// W451 merged six `$242684` private screen tests, taking 92 to 91. W453 merged
// the exported/private `$242494` octagonal-distance pair, taking 91 to 90.
const W453_NOTE = 'W451 merged $242684 (92 - 1 = 91); W453 merged $242494 '
  + '(survivor bossscripts.js dist242494), so 91 - 1 = 90. ';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const TABLES = here('../rip/port/player.tables.json');
const SKIP_T = existsSync(TABLES) ? SKIP : 'generated ROM tables absent; skip, not pass';
const tablesJson = existsSync(TABLES) ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

/** The raw image as a `rom` face, so these tests drive the real routines. */
const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a),
  i16: (a) => IMG.readInt16BE(a), u8: (a) => IMG[a],
  bytes: (a, n) => IMG.subarray(a, a + n),
});

const RESULT_SCRIPT = 0x28d862;      // 8 nodes, six words each -- the result screen's fly-away
const T4C_SCRIPT = 0x2701c8;         // 1 node -- type $4C's death effect, the LIVE `$246520` call
const SPR_BASE = 0x80e886;           // $24627A[0].current -- PALETTE RAM
const SPR_DIRTY = 0x80fa66;          // $24627A[0].writer

// ===============================================================================================
// SECTION 1 -- THE BYTES
// ===============================================================================================

test('SECTION 1: `$246520` and `$24652A` are two heads on ONE body at `$246532`',
  { skip: SKIP }, () => {
    assert.equal(l(0x246520), 0x48e77ff8, '$246520 movem.l D1-D7/A0-A4,-(A7)');
    assert.equal(l(0x246524), 0x3c3c0001, '$246524 move.w #$1,D6');
    // TRAP: `60 08` here IS an 8-bit `bra` -- the low byte is non-zero. Five waves running have
    // been bitten by `60 00`, which is the WIDE form and eats the next word. Both appear in this
    // family: `$246528` is `6008` (short) and `$24670C` is `6000 000a` (wide).
    assert.equal(w(0x246528), 0x6008, '$246528 bra.s -- SHORT: the displacement byte is $08');
    assert.equal(0x24652a + 0x08, 0x246532, '  ...$24652A + $8 = $246532');
    assert.equal(l(0x24652a), 0x48e77ff8, '$24652A the SAME prologue');
    assert.equal(l(0x24652e), 0x3c3c0000, '$24652E move.w #$0,D6 -- THE ONLY DIFFERENCE');
    assert.equal(l(0x246532), 0x43f90081, '$246532 lea $810346,A1 (first half)');
    assert.equal(w(0x246536), 0x0346, '  ...$810346, the root pool');
    assert.equal(w(0x246538), 0x7e02, '$246538 moveq #$2,D7 -- THREE roots');
    assert.equal(l(0x246552), 0x45f90080, '$246552 lea $80FA86,A2 (first half)');
    assert.equal(w(0x246556), 0xfa86, '  ...$80FA86, the node pool');
    assert.equal(l(0x24654e), 0x3c3c0013, '$24654E move.w #$13,D6 -- TWENTY, and D6 is REUSED');

    // The sibling pair at $246704/$246710 is the same shape again, and $24670C is the WIDE bra.
    assert.equal(l(0x246704), 0x48e77ff8, '$246704 movem.l');
    assert.equal(l(0x246708), 0x3c3c0001, '$246708 move.w #$1,D6');
    assert.equal(w(0x24670c), 0x6000, '$24670C bra -- WIDE, so the displacement is the NEXT word');
    assert.equal(w(0x24670e), 0x000a, '  ...$A');
    assert.equal(0x24670e + 0x000a, 0x246718, '  ...$24670E + $A = $246718, past $246714 move.w #$0,D6');
  });

test('SECTION 1: the six axes the three copies disagreed on, each off the image',
  { skip: SKIP }, () => {
    // -- the node claim and the progress clear, both ABSENT from `spawn.js`
    assert.equal(l(0x24655e), 0x34bc8000, '$24655E move.w #$8000,(A2) -- THE NODE CLAIM');
    assert.equal(l(0x246562), 0x357c0000, '$246562 move.w #$0,($20,A2) (first half)');
    assert.equal(w(0x246566), 0x0020, '  ...the displacement is $20, the progress word');

    // -- `adda.w` SIGN-EXTENDS its source, so the script's bias word is signed
    assert.equal(w(0x246592), 0xd6d8, '$246592 adda.w (A0)+,A3 -- a WORD add to an ADDRESS register');

    // -- the snapshot source is `($E,A2)`, and `($E,A2)` is `$24627A[family]` + the bias
    assert.equal(l(0x2465c8), 0x266a000e, '$2465C8 movea.l ($E,A2),A3 -- the snapshot SOURCE');
    assert.equal(w(0x2465d4), 0x38db, '$2465D4 move.w (A3)+,(A4)+');
    assert.equal(l(0x24627a), 0x0080e886, '$24627A[0].base = $80E886 -- RAM, not ROM');
    assert.equal(l(0x24627e), 0x0080fa66, '$24627A[0].writer = $80FA66 -- the sprite dirty word');
    assert.equal(l(0x246282), 0x0080f086, '$24627A[1].base = $80F086 -- RAM');
    assert.equal(l(0x24628a), 0x0080f886, '$24627A[2].base = $80F886 -- RAM');
    assert.equal(l(0x246292), 0x48e77f00, '$24627A[3] is movem.l -- CODE, which BOUNDS the table');
    assert.ok(SPR_BASE >= 0x800000, 'every one of the three bases is above $800000: RAM. A '
      + '`rom.u16` of any of them is not a near miss, it is a different address space');

    // -- ($12,A2) is NOT written by this body.  Only `$246410` writes it, from its fill word.
    const stores12 = [];
    for (let a = 0x246532; a < 0x246610; a += 2) {
      // `move.w #imm,(d16,A2)` is `357c iiii dddd`; `move.w (A0)+,(d16,A2)` is `3558 dddd`.
      if (w(a) === 0x357c && w(a + 4) === 0x0012) stores12.push(a);
      if (w(a) === 0x3558 && w(a + 2) === 0x0012) stores12.push(a);
    }
    assert.deepEqual(stores12, [], '$246532..$24660F contains NO store to ($12,A2). '
      + '`loadAnimObjectsNoFill` wrote a zero there anyway -- the W446 shape inverted: not an '
      + 'omitted store but an INVENTED one');
    // ...and the proof that the scan can find one: `$246466` in `$246410` IS such a store.
    assert.equal(w(0x246472), 0x3558, '$246472 move.w (A0)+,(d16,A2) -- the scan\'s positive control');
    assert.equal(w(0x246474), 0x0012, '  ...and its displacement IS $12. `$246410` DOES write the '
      + 'fill word there, so the scan above is capable of firing -- it found nothing in '
      + '$246532..$24660F because there is nothing there to find');

    // -- ONE forward pass of twenty visits, not a rescan per node
    assert.equal(l(0x2465de), 0x45ea0070, '$2465DE lea ($70,A2),A2 -- A2 only ever moves FORWARD');
    assert.equal(w(0x2465e2), 0x51ce, '$2465E2 dbra D6,...');
    assert.equal(w(0x2465e4), 0xff74, '  ...displacement -$8C');
    assert.equal(0x2465e4 + (0xff74 - 0x10000), 0x246558,
      '  ...= $246558, the pool TEST -- and D6 is the SINGLE #$13 counter loaded at $24654E, so '
      + 'twenty visits serve the WHOLE chain. Two of the three copies restarted at $80FA86 for '
      + 'every node');

    // -- and $246558 is entered by FALLING IN from $246552: no entry test, so a DO-WHILE
    assert.equal(l(0x246558), 0x4a526b00, '$246558 tst.w (A2) / $24655A bmi.w (first half)');
    assert.equal(w(0x24655c), 0x0082, '  ...bmi.w displacement $79');
    assert.equal(0x24655c + 0x0082, 0x2465de, '  ...= $2465DE, the SKIP, not the exit');
  });

// ===============================================================================================
// SECTION 2 -- THE MERGE
// ===============================================================================================

/** The `w446`/`w447` scan: which `export function` claims which ROM address. */
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

const srcText = () => {
  const SRC = here('../src');
  const out = new Map();
  for (const e of readdirSync(SRC, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.js')) out.set(e.name, readFileSync(join(SRC, e.name), 'utf8'));
  }
  return out;
};

test('SECTION 2: `$246520` and `$24652A` are each claimed EXACTLY ONCE, and by the same file', () => {
  const idx = portedIndex();
  for (const a of [0x246520, 0x24652a]) {
    const claims = [...(idx.get(a) ?? [])].sort();
    assert.equal(claims.length, 1,
      `$${a.toString(16).toUpperCase()} is claimed ${claims.length} times: ${claims.join(' / ')}. `
      + 'W447 measured TWO each and three bodies between them; the merge makes it one');
    assert.ok(claims[0].startsWith('animobjects.js'),
      `the survivor must be animobjects.js -- it is the leaf everyone already depends on, and `
      + `merging into spawn.js or stageend.js would invert the existing stageend -> animobjects `
      + `import edge. Got ${claims[0]}`);
  }
  // The register itself, held here as well as in w446/w447 so deleting one guard cannot hide it.
  // W450: THIS COUNTS `export function` CLAIMS ONLY, so it is a FLOOR. The scan that can also
  // see private functions, arrows and methods reports 68 after W475. SECTION 2d below and
  // tests/w450widenedregister.test.js SECTION 3 hold the set.
  const dup = [...idx].filter(([, v]) => v.size > 1).map(([a]) => a).sort((x, y) => x - y);
  assert.equal(dup.length, 15,
    'W459 left 16; W474 removed the retired ledger note claim, so the live narrow '
    + 'floor is 15. A new duplicate is a wave, '
    + 'not a row: ' + dup.map((a) => '$' + a.toString(16).toUpperCase()).join(', '));
});

test('SECTION 2d [W450/W475]: the widened register is 68, and this wave\'s three-copy constructor '
  + 'stays merged under it', async () => {
  const { headRegister } = await import('./w450widenedscan.js');
  const wide = headRegister();
  assert.equal(wide.length, 68,
    'the widened duplicate register is not 68. ' + W453_NOTE
    + 'W457 merged $25D9E6, W458 merged $25DA60, W459 merged $25FF38, W460 removed '
    + 'the optional $24631C forwarding shim, W461 merged the private $242E24 rank-byte '
    + 'body into rng.js drawByte242E24, W462 removed the private $2414BE adapter row, W463 '
    + 'removed the private $28C0FC counted-note adapter row, and W474 removed the retired '
    + 'ledger note claims at $240F62 and $28D520, and W475 removed the palette-reporting '
    + 'method claim at $24133C. '
    + 'The narrow count above sees only `export '
    + 'function`; W448 merged THREE transcriptions of one body, and the scan that found them '
    + 'would have missed a fourth written as a private function -- which is what happened to '
    + 'W449 one wave later, at $246800');
  for (const a of [0x246520, 0x24652a]) {
    assert.equal(wide.includes(a), false,
      `$${a.toString(16).toUpperCase()} is claimed twice again under the widened scan. This wave `
      + 'merged it because NO copy was correct: the live one read palette RAM out of ROM');
  }
});

test('SECTION 2: the two deleted bodies are GONE from src, by name', () => {
  const src = srcText();
  assert.ok(!/export function buildParts246520/.test(src.get('spawn.js')),
    'spawn.js buildParts246520 is deleted');
  assert.ok(!/function chainLoaderBody/.test(src.get('stageend.js')),
    'stageend.js chainLoaderBody is deleted');
  assert.ok(!/export function chainLoader24652A/.test(src.get('stageend.js')),
    'stageend.js chainLoader24652A is deleted');
  assert.ok(!/function loadAnimObjectsNoFill/.test(src.get('animobjects.js')),
    'animobjects.js loadAnimObjectsNoFill is folded into buildChain246532');
  // ...and exactly one body survives, in the survivor.
  assert.equal([...src.values()].join('\n').match(/lea \$80FA86,A2/gi)?.length ?? 0, 1,
    'exactly one file still cites `$246552 lea $80FA86,A2` as its own instruction');
});

test('SECTION 2b: EVERY caller of the deleted copies reaches the survivor -- shown, not asserted',
  () => {
    const src = srcText();
    // -- handlers.js, the ONLY production caller of `spawn.js buildParts246520`.
    const h = src.get('handlers.js');
    assert.ok(!/buildParts246520\(/.test(h), 'handlers.js no longer CALLS buildParts246520');
    assert.ok(/import \{[^}]*loadAnimObjects246520[^}]*\} from '\.\/animobjects\.js'/.test(h),
      'handlers.js imports the survivor from animobjects.js');
    assert.ok(/loadAnimObjects246520\(ram, rom, T4C\.deathEffectTable\)/.test(h),
      'and type $4C\'s death arm ($26F6D8 jsr $246520) calls it');

    // -- stageend.js, the ONLY production caller of its own `chainLoader24652A`.
    const se = src.get('stageend.js');
    assert.ok(!/chainLoader24652A\(/.test(se), 'stageend.js no longer CALLS chainLoader24652A');
    assert.ok(/loadAnimObjects24652A\(ram, rom, RESULT_ROM\.animScript\)/.test(se),
      'f8Exit28DE1E ($28DE66 jsr $24652A) calls the survivor');
    assert.ok(/import \{[^}]*buildChain246532[^}]*\} from '\.\/animobjects\.js'/.test(se),
      'and its two surviving heads take the survivor\'s body');

    // -- nothing in src still names the deleted symbols in CODE (comments are the record).
    for (const [file, text] of src) {
      const code = text.split('\n').filter((L) => !/^\s*(\/\/|\*|\/\*)/.test(L)).join('\n');
      assert.ok(!/\bbuildParts246520\b/.test(code), `${file} still calls buildParts246520`);
      assert.ok(!/\bchainLoaderBody\b/.test(code), `${file} still calls chainLoaderBody`);
      assert.ok(!/\bchainLoader24652A\b/.test(code), `${file} still calls chainLoader24652A`);
    }

    // -- the import direction was NOT inverted: animobjects.js is still a leaf.
    const ao = src.get('animobjects.js');
    const imports = [...ao.matchAll(/from '\.\/([\w.]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(imports, ['ram.js', 'unported.js'],
      'animobjects.js must stay a LEAF. If the merge had pulled spawn.js or stageend.js in, the '
      + 'existing stageend -> animobjects edge would be a cycle');
  });

test('SECTION 2: `$246710` and `$246704` take the SAME body, and keep their own constants',
  { skip: SKIP }, () => {
    // The merge must not lose a distinction the cartridge makes. `$246762` writes #$1 where
    // `$246576` writes #$0, and that is the whole difference in the pool lifecycle.
    assert.equal(l(0x246576), 0x357c0000, '$246576 move.w #$0,($1E,A2) (first half)');
    assert.equal(w(0x24657a), 0x001e, '  ...displacement $1E');
    assert.equal(l(0x246762), 0x357c0001, '$246762 move.w #$1,($1E,A2) -- ONE, not zero');
    assert.equal(w(0x246766), 0x001e, '  ...the same displacement');
    assert.equal(CHAIN_SPECS[0x24652a].field1e, 0, 'and CHAIN_SPECS carries it: $24652A -> 0');
    assert.equal(CHAIN_SPECS[0x246520].field1e, 0, '$246520 -> 0 (same body)');
    assert.equal(CHAIN_SPECS[0x246710].field1e, 1, '$246710 -> 1');
    assert.equal(CHAIN_SPECS[0x246704].field1e, 1, '$246704 -> 1');
    // D6 -> ($4,root) is the OTHER axis, and it is independent of the first.
    assert.equal(CHAIN_SPECS[0x246520].field4, 1, '$246520 D6 = 1');
    assert.equal(CHAIN_SPECS[0x24652a].field4, 0, '$24652A D6 = 0');
    assert.equal(CHAIN_SPECS[0x246704].field4, 1, '$246704 D6 = 1');
    assert.equal(CHAIN_SPECS[0x246710].field4, 0, '$246710 D6 = 0');
    // ...and the content shapes are NOT shared: six words vs four.
    assert.equal(CHAIN_CONTENT_24652A.wordsPerNode, 6, '$246598 move.l (A0)+,($A,A2): SIX words');
    assert.equal(CHAIN_CONTENT.wordsPerNode, 4, '$24677E move.l #$246BB8,($A,A2): FOUR words');
    assert.equal(w(0x246598), 0x2558, '$246598 move.l (A0)+,($A,A2) -- target FROM THE SCRIPT');
    assert.equal(w(0x24677e), 0x257c, '$24677E move.l #imm,($A,A2) -- target is a CONSTANT');
    assert.equal(l(0x246780), 0x00246bb8, '  ...and the constant is $246BB8, the black bank');
  });

// ===============================================================================================
// SECTION 3 -- THE STATE TRACE.  Witnesses OUTSIDE animobjects.js, spawn.js, stageend.js and
// handlers.js: `palette.js` owns `$80FA66`, `flush24133C` and `PaletteState`, and it is the file
// that turns a drained animation node into a visible palette. None of it was touched this wave.
// ===============================================================================================

/** Seed sprite palette RAM with a recognisable gradient, `bias` picking the family. */
function seedPalette(ram, bias = 0) {
  for (let i = 0; i < 0x400; i++) ram.setU16(SPR_BASE + i * 2, (0x1000 + i + bias) & 0x7fff);
}

/** Every cell the trace reports, read back in one go. */
function witness(ram, pal) {
  const root = ANIM_OBJECT.roots;
  const nodes = [];
  for (let p = 0; p < ANIM_OBJECT.nodeSlots; p++) {
    const n = ANIM_OBJECT.nodes + p * ANIM_OBJECT.nodeStride;
    if ((ram.u16(n) & 0x8000) !== 0) nodes.push(p);
  }
  return {
    rootStatus: ram.u16(root),
    rootMode: ram.u16(root + 0x04),
    chainHead: ram.u32(root + 0x2c),
    claimedNodes: nodes.length,
    node0Snapshot0: ram.u16(ANIM_OBJECT.nodes + 0x30),
    node0Progress: ram.u16(ANIM_OBJECT.nodes + 0x20),
    // ---- OUTSIDE THE CHANGED FILES, all three of these ----
    sprDirty: ram.u16(SPR_DIRTY),                  // palette.js PALSTAGE.spr.dirty
    palCopiesSpr: pal ? pal.copies.spr : null,     // palette.js PaletteState
    palWord0: pal ? pal.words[0] : null,           // palette.js's own $A00000
  };
}

test('SECTION 3: the result screen\'s eight-node chain, before and after, with palette.js '
  + 'as the witness', { skip: SKIP }, () => {
  const rom = rawRom();
  const ram = new Ram();
  const pal = new PaletteState();
  seedPalette(ram);

  // ---- BEFORE
  const before = witness(ram, pal);
  assert.deepEqual(before, {
    rootStatus: 0, rootMode: 0, chainHead: 0, claimedNodes: 0,
    node0Snapshot0: 0, node0Progress: 0,
    sprDirty: 0, palCopiesSpr: 0, palWord0: 0,
  }, 'nothing is claimed and palette.js has copied nothing');

  // ---- THE CALL.  `$28DE66 jsr $24652A` with `$28D862`: count 8, every node family 0,
  // target $246BF8, words-minus-one 31, timing index 3.
  const handle = loadAnimObjects24652A(ram, rom, RESULT_SCRIPT) >>> 0;
  assert.equal(handle, ANIM_OBJECT.roots, '$2465F8 move.l A1,D0 -- the ROOT, $810346');

  const afterLoad = witness(ram, pal);
  assert.equal(afterLoad.rootStatus, 0x8000, '$246540 move.w #$8000,(A1)');
  assert.equal(afterLoad.rootMode, 0, '$246544 move.w D6,($4,A1) -- D6 = 0 from the $24652A head');
  assert.equal(afterLoad.chainHead, ANIM_OBJECT.nodes, '$246570 move.l A2,($2C,A1)');
  assert.equal(afterLoad.claimedNodes, 8, '$24655E claimed EIGHT nodes -- the script\'s count word');
  assert.equal(afterLoad.node0Snapshot0, ram.u16(SPR_BASE + 1472),
    '$2465D4 snapshotted PALETTE RAM at $80E886 + $5C0, node 0\'s bias');
  assert.equal(afterLoad.node0Progress, 0, '$246562 move.w #$0,($20,A2)');
  assert.equal(afterLoad.sprDirty, 0, 'the LOADER does not raise the dirty word -- $24683E does');

  // ---- THE DRAIN.  Timing index 3 is {reload 0, step 1}, so `($20,node)` climbs one per frame
  // and `($18,node)` clears on the 32nd.  `runAnimObjects24683E` is main-loop call #3.
  let frames = 0;
  while (frames < 40 && chainCheck24681A(ram, handle) !== 0) {
    runAnimObjects24683E(ram, rom);
    frames += 1;
  }
  assert.equal(frames, 32, 'the chain drained in exactly 32 frames -- $246B38[3] is {0,1} and '
    + '`stepNode` walks ($20,node) 1..$20');

  // ---- THE WITNESS, OUTSIDE EVERY CHANGED FILE.
  assert.equal(ram.u16(SPR_DIRTY), 1,
    '$246B20 move.w #$1,(writer) -- and the writer is $24627A[0].writer = $80FA66, which is '
    + 'palette.js PALSTAGE.spr.dirty. Nothing in animobjects.js names that cell as a constant');
  assert.equal(PALSTAGE.spr.dirty, SPR_DIRTY, '...palette.js agrees on the address');

  const flushed = flush24133C(ram, pal);
  assert.equal(flushed.spr, true, 'palette.js flush24133C copied the sprite region');
  assert.equal(pal.copies.spr, 1, 'exactly once');
  assert.equal(ram.u16(SPR_DIRTY), 0, '$241378 cleared the dirty word');
  assert.equal(pal.words[0], ram.u16(SPR_BASE),
    'and palette.js\'s own $A00000 now holds what the fade left in palette RAM');

  // The fade actually MOVED the palette -- otherwise the copy above proves nothing.
  assert.notEqual(pal.words[1472 / 2], 0x1000 + 736,
    'the eight nodes faded $80E886 + $5C0.. toward $246BF8, so the seeded gradient is gone from '
    + 'the words the chain owned');
});

// ===============================================================================================
// SECTION 3b -- THE DELETED BODIES, VERBATIM, EACH REQUIRED TO DISAGREE.
// ===============================================================================================

/** `spawn.js buildParts246520` as it stood before W448, transcribed unchanged. */
function deletedSpawnBody(ram, rom, a0, mode) {
  const u16v = (x) => x & 0xffff;
  const u32v = (x) => x >>> 0;
  let a1 = PARTS.parentPool;
  let claimed = false;
  for (let slot = 0; slot < PARTS.parentSlots; slot++) {
    if ((ram.u16(a1) & 0x8000) === 0) { claimed = true; break; }
    a1 += PARTS.parentStride;
  }
  if (!claimed) return 0;
  const parent = a1;
  ram.setU16(a1, 0x8000);
  ram.setU16(a1 + 0x04, mode);
  let at = a0;
  let remaining = rom.u16(at); at += 2;
  let a2 = PARTS.nodePool;
  for (let walk = 0; walk < PARTS.nodeSlots; walk++) {
    if ((ram.u16(a2) & 0x8000) !== 0) { a2 += PARTS.nodeStride; continue; }
    ram.setU32(a2 + 0x2c, 0);
    ram.setU32(a1 + 0x2c, a2);
    a1 = a2;
    ram.setU16(a2 + 0x1e, 0); ram.setU16(a2 + 0x02, 0);
    const d2 = rom.u16(at); at += 2;
    if (d2 !== 0 && d2 !== 8 && d2 !== 0x10) throw new Error('dispatch');
    ram.setU32(a2 + 0x06, rom.u32(PARTS.dispatch8 + d2 + 4));
    const base = rom.u32(PARTS.dispatch8 + d2);
    const bias = rom.u16(at); at += 2;                 // <- UNSIGNED, the defect
    ram.setU32(a2 + 0x0e, u32v(base + bias));
    ram.setU32(a2 + 0x0a, rom.u32(at)); at += 4;
    ram.setU16(a2 + 0x04, rom.u16(at)); at += 2;
    const d3 = ((rom.u16(at) & 0x1f) * 4) & 0xffff; at += 2;
    const row = PARTS.dispatch4 + d3;
    ram.setU16(a2 + 0x16, rom.u16(row));
    ram.setU16(a2 + 0x14, ram.u16(a2 + 0x16));
    ram.setU16(a2 + 0x1c, rom.u16(row + 2));
    ram.setU32(a2 + 0x18, 0xffff0000);
    const words = u16v(ram.u16(a2 + 0x04)) + 1;
    const src = ram.u32(a2 + 0x0e);
    for (let k = 0; k < words; k++) {
      ram.setU16(a2 + 0x30 + k * 2, rom.u16(src + k * 2));   // <- ROM, the defect
    }
    remaining = u16v(remaining - 1);
    if (remaining === 0) return parent;
    a2 += PARTS.nodeStride;
  }
  return 0;                                                  // <- 0, the defect
}

test('SECTION 3b: the DELETED `spawn.js` body threw on the only script it was ever given',
  { skip: SKIP_T }, () => {
    // The real windowed ROM face -- the one `main.js` hands the handlers.
    const rom = new RomWindows(tablesJson.rom);
    assert.equal(rom.u16(T4C_SCRIPT), 1, '$2701C8 is a declared window: count 1');
    assert.equal(rom.u16(T4C_SCRIPT + 2), 0, '  ...family 0');
    assert.equal(rom.u16(T4C_SCRIPT + 4), 0x0480, '  ...bias $480');

    // THE DELETED BODY: `rom.u16($80E886 + $480)` = `rom.u16($80ED06)`.
    assert.throws(() => deletedSpawnBody(new Ram(), rom, T4C_SCRIPT, 1), Unreached,
      'the copy handlers.js was calling could not run at all: `$2465D4 move.w (A3)+,(A4)+` reads '
      + 'through ($E,A2) = $80ED06, which is outside every window export-tables.py declares. '
      + 'Type $4C\'s death effect was a crash, not a drift');

    // THE SURVIVOR: the same call, the same face, and it completes.
    const ram = new Ram();
    seedPalette(ram);
    const handle = loadAnimObjects246520(ram, rom, T4C_SCRIPT) >>> 0;
    assert.equal(handle, ANIM_OBJECT.roots, 'the survivor returns the root');
    assert.equal(ram.u16(ANIM_OBJECT.roots + 0x04), 1, 'with ($4,root) = 1: the $246520 head');
    assert.equal(ram.u16(ANIM_OBJECT.nodes + 0x30), ram.u16(SPR_BASE + 0x480),
      'and the snapshot came out of PALETTE RAM');
  });

test('SECTION 3b: the DELETED `spawn.js` body did not claim its nodes, and the survivor does',
  { skip: SKIP }, () => {
    // A synthetic script that keeps the deleted body inside the image, so the ONLY thing this
    // test can be measuring is the missing `$24655E`.
    const ROMW = new Map([[T4C_SCRIPT, 1], [T4C_SCRIPT + 2, 0], [T4C_SCRIPT + 4, 0],
      [T4C_SCRIPT + 10, 0], [T4C_SCRIPT + 12, 0]]);
    const rom = {
      u16: (a) => (ROMW.has(a) ? ROMW.get(a) : IMG.readUInt16BE(a)),
      u32: (a) => (ROMW.has(a) || ROMW.has(a + 2)
        ? (((ROMW.get(a) ?? 0) * 0x10000) + (ROMW.get(a + 2) ?? 0)) >>> 0
        : IMG.readUInt32BE(a)),
      i16: (a) => IMG.readInt16BE(a),
    };
    // The deleted body reads the snapshot from ROM, so point ($E) somewhere inside the image.
    const romRead = { ...rom, u32: (a) => (a === PARTS.dispatch8 ? 0x00246bb8 : rom.u32(a)) };

    const dead = new Ram();
    deletedSpawnBody(dead, romRead, T4C_SCRIPT, 1);
    assert.equal(dead.u16(ANIM_OBJECT.nodes) & 0x8000, 0,
      'THE DELETED BODY LEFT THE NODE READING FREE -- `$24655E move.w #$8000,(A2)` was absent. '
      + 'The pool is shared with $246410, $246710 and $246704, so the next allocation out of '
      + '$80FA86 handed the same slot to a second chain');
    assert.notEqual(dead.u32(ANIM_OBJECT.roots + 0x2c), 0, '...while still LINKING it');

    const live = new Ram();
    seedPalette(live);
    loadAnimObjects246520(live, rawRom(), T4C_SCRIPT);
    assert.equal(live.u16(ANIM_OBJECT.nodes) & 0x8000, 0x8000,
      'the survivor claims it -- $24655E');
    assert.equal(live.u32(live.u32(ANIM_OBJECT.roots + 0x2c) + 0x2c), 0,
      'and the one node\'s own link is null: $246568 move.l #$0,($2C,A2)');
  });

test('SECTION 3b: the DELETED `stageend.js`/`animobjects.js` pool walk allocated differently '
  + 'from the ROM once the pool had a hole', { skip: SKIP }, () => {
  // `$24654E move.w #$13,D6` + `$2465E2 dbra` is ONE forward pass. Both deleted copies restarted
  // the scan at `$80FA86` for every node. With slot 0 FREE and slot 1 TAKEN, the ROM allocates
  // 0 then 2; a rescan-from-base allocates 0 then 2 as well -- the shapes only separate when the
  // cursor has already passed a hole. Occupy 0 and 2, leave 1 and 3 free:
  const ram = new Ram();
  seedPalette(ram);
  ram.setU16(ANIM_OBJECT.nodes + 0 * ANIM_OBJECT.nodeStride, 0x8000);
  ram.setU16(ANIM_OBJECT.nodes + 2 * ANIM_OBJECT.nodeStride, 0x8000);
  const handle = loadAnimObjects24652A(ram, rawRom(), RESULT_SCRIPT) >>> 0;
  assert.equal(handle, ANIM_OBJECT.roots, 'the chain still builds');

  const chain = [];
  let n = ram.u32(handle + 0x2c);
  while (n !== 0 && chain.length < 32) {
    chain.push((n - ANIM_OBJECT.nodes) / ANIM_OBJECT.nodeStride);
    n = ram.u32(n + 0x2c);
  }
  assert.deepEqual(chain, [1, 3, 4, 5, 6, 7, 8, 9],
    'ONE forward pass: A2 starts at $80FA86, skips the two occupied slots as it meets them, and '
    + 'never goes back. Twenty visits served all eight nodes');

  // The whole pool budget is twenty VISITS, not twenty nodes: with the first twelve slots taken
  // and eight free behind them, the chain still fits, and one more occupied slot breaks it.
  const tight = new Ram();
  seedPalette(tight);
  for (let p = 0; p < 12; p++) tight.setU16(ANIM_OBJECT.nodes + p * ANIM_OBJECT.nodeStride, 0x8000);
  assert.equal(loadAnimObjects24652A(tight, rawRom(), RESULT_SCRIPT) >>> 0, ANIM_OBJECT.roots,
    '12 occupied + 8 free = exactly 20 visits');

  const overrun = new Ram();
  seedPalette(overrun);
  for (let p = 0; p < 13; p++) overrun.setU16(ANIM_OBJECT.nodes + p * ANIM_OBJECT.nodeStride, 0x8000);
  assert.equal(loadAnimObjects24652A(overrun, rawRom(), RESULT_SCRIPT) >>> 0, 0xffffffff,
    '13 occupied leaves only 7 reachable, so `$2465E2`\'s dbra falls through to `$2465E6 moveq '
    + '#-$1,D0`. A rescan-from-base loop cannot express this bound at all');
  assert.equal(overrun.u16(ANIM_OBJECT.roots), 0,
    'and `$2465F2 bsr $246800` gave the root back');
});

// ===============================================================================================
// SECTION 4 -- THE FAILURE RETURN, SETTLED FROM THE IMAGE.
// ===============================================================================================

test('SECTION 4: `$246608 moveq #-$1,D0` -- $FFFFFFFF on BOTH arms of BOTH heads',
  { skip: SKIP }, () => {
    // The bytes first. This is the axis W447 asked to settle: one copy said 0, one said $FFFFFFFF.
    assert.equal(w(0x246608), 0x70ff, '$246608 moveq #-$1,D0 -- the no-free-root exit');
    assert.equal(w(0x2465e6), 0x70ff, '$2465E6 moveq #-$1,D0 -- the pool-dry exit');
    assert.equal(w(0x2465ec), 0x4a40, '$2465EC tst.w D0');
    assert.equal(w(0x2465ee), 0x6a08, '$2465EE bpl.s -- NOT taken when D0.w is $FFFF');
    assert.equal(w(0x2465f0), 0x2009, '$2465F0 move.l A1,D0 -- the A1 $2465E8 just RESTORED');
    assert.equal(w(0x2465f2), 0x6100, '$2465F2 bsr.w ...');
    assert.equal(0x2465f4 + w(0x2465f4), 0x246800, '  ...= $246800, the chain free');
    assert.equal(w(0x2465f6), 0x6010, '$2465F6 bra.s ...');
    assert.equal(0x2465f8 + 0x10, 0x246608, '  ...= $246608 -- the SAME moveq #-$1,D0');
    // ...and the sibling body is byte-for-byte the same shape.
    assert.equal(w(0x2467d2), 0x70ff, '$2467D2 moveq #-$1,D0');
    assert.equal(w(0x2467f8), 0x70ff, '$2467F8 moveq #-$1,D0');

    // Then the port, on all four heads and both arms.
    const rom = rawRom();
    const heads = [
      ['$246520', (r) => loadAnimObjects246520(r, rom, RESULT_SCRIPT)],
      ['$24652A', (r) => loadAnimObjects24652A(r, rom, RESULT_SCRIPT)],
      ['$246710', (r) => chainLoader246710(r, rom, 0x25baaa, undefined)],
      ['$246704', (r) => chainLoader246704(r, rom, 0x25baaa, undefined)],
    ];
    for (const [name, fn] of heads) {
      const noRoot = new Ram();
      seedPalette(noRoot);
      for (let s = 0; s < ANIM_OBJECT.rootSlots; s++) {
        noRoot.setU16(ANIM_OBJECT.roots + s * ANIM_OBJECT.rootStride, 0x8000);
      }
      assert.equal(fn(noRoot) >>> 0, 0xffffffff, `${name} no free root -> $246608`);

      const noNode = new Ram();
      seedPalette(noNode);
      for (let p = 0; p < ANIM_OBJECT.nodeSlots; p++) {
        noNode.setU16(ANIM_OBJECT.nodes + p * ANIM_OBJECT.nodeStride, 0x8000);
      }
      assert.equal(fn(noNode) >>> 0, 0xffffffff, `${name} pool dry -> $2465E6 then $246608`);
      assert.equal(noNode.u16(ANIM_OBJECT.roots), 0, `${name} and the root was given back`);
    }
  });

// ===============================================================================================
// SECTION 4b -- THE RED ARM.
//
// W447's sharpest finding was that blinding the survivor to a constant left two sections GREEN,
// because a function that ignores its inputs still satisfies a state trace. SECTION 3 above has
// exactly that hole: every cell it checks except `node0Snapshot0` is a function of the SCRIPT
// alone, and `spawn.js`'s deleted body -- the one that read the snapshot out of ROM -- would
// satisfy all of them.
//
// SO: run the SAME call, on the SAME script, with the ONLY difference being the contents of
// PALETTE RAM, and require the same cells to hold DIFFERENT values. `($E,A2)` is the one input
// that lives in RAM rather than in the script, so this is the arm -- and only this arm -- that
// separates a loader reading `$80E886` from a loader reading `$24xxxx`. It is what a plain state
// trace cannot catch: a body blinded to `($E,A2)` produces byte-identical RAM under both seeds.
// ===============================================================================================

test('SECTION 4b: the same script with palette RAM in the OPPOSITE state must produce a '
  + 'DIFFERENT snapshot in the SAME cells', { skip: SKIP }, () => {
  const rom = rawRom();

  const run = (bias) => {
    const ram = new Ram();
    seedPalette(ram, bias);
    const handle = loadAnimObjects24652A(ram, rom, RESULT_SCRIPT) >>> 0;
    const cells = [];
    let n = ram.u32(handle + 0x2c);
    while (n !== 0) {
      for (let k = 0; k < 32; k++) cells.push(ram.u16(n + 0x30 + k * 2));
      n = ram.u32(n + 0x2c);
    }
    return { handle, cells, ram };
  };

  const a = run(0);
  const b = run(0x123);

  // The ALLOCATION is identical -- same handle, same chain, same script-derived fields. This is
  // the part SECTION 3 checks, and it is the part a blinded body would also pass.
  assert.equal(a.handle, b.handle, 'the same root, both times');
  assert.equal(a.cells.length, 8 * 32, 'eight nodes x 32 words');
  assert.equal(b.cells.length, 8 * 32, 'and the same the other way');
  for (const off of [0x04, 0x14, 0x16, 0x1c, 0x1e, 0x20]) {
    assert.equal(a.ram.u16(ANIM_OBJECT.nodes + off), b.ram.u16(ANIM_OBJECT.nodes + off),
      `($${off.toString(16).toUpperCase()},node) is script-derived and MUST match -- otherwise `
      + 'this arm would be measuring the wrong thing');
  }
  assert.equal(a.ram.u32(ANIM_OBJECT.nodes + 0x0e), b.ram.u32(ANIM_OBJECT.nodes + 0x0e),
    '($E,node) is the ADDRESS and is script-derived; only what lives THERE moved');

  // ...and THE SNAPSHOT MUST NOT MATCH. Every one of the 256 words differs by the seed's bias.
  let differing = 0;
  for (let k = 0; k < a.cells.length; k++) if (a.cells[k] !== b.cells[k]) differing += 1;
  assert.equal(differing, 8 * 32,
    'ALL 256 snapshot words moved with palette RAM. A body that read the snapshot out of ROM '
    + '-- which is what `spawn.js` did -- would report 0 here while passing SECTION 3 outright');
  assert.equal(a.cells[0], (0x1000 + 736) & 0x7fff, 'and the values are the seeded ones');
  assert.equal(b.cells[0], (0x1000 + 736 + 0x123) & 0x7fff, 'shifted by exactly the bias');
});

test('SECTION 4b: `adda.w` SIGN-EXTENDS, so a negative bias walks BACKWARD from the family base',
  { skip: SKIP }, () => {
    // The other input a blinded body would ignore. `$246592 adda.w (A0)+,A3` -- a WORD source
    // into an ADDRESS register is sign-extended, and `spawn.js` read it unsigned. A script with
    // bias $FFC0 must land at $80E886 - $40, not at $80E886 + $FFC0.
    const SCRIPT = 0x900000;                                  // a synthetic script, outside ROM
    const ROMW = new Map([
      [SCRIPT, 1], [SCRIPT + 2, 0x0000], [SCRIPT + 4, 0xffc0],
      [SCRIPT + 6, 0x0000], [SCRIPT + 8, 0x246b], [SCRIPT + 10, 0x0003], [SCRIPT + 12, 0x0000],
    ]);
    const rom = {
      u16: (a) => (ROMW.has(a) ? ROMW.get(a) : IMG.readUInt16BE(a)),
      u32: (a) => (ROMW.has(a) ? (((ROMW.get(a) ?? 0) * 0x10000) + (ROMW.get(a + 2) ?? 0)) >>> 0
        : IMG.readUInt32BE(a)),
      i16: (a) => (ROMW.has(a) ? ((ROMW.get(a) ^ 0x8000) - 0x8000) : IMG.readInt16BE(a)),
    };
    const ram = new Ram();
    seedPalette(ram);
    ram.setU16(SPR_BASE - 0x40, 0x2ace);                      // the word a SIGNED bias reaches

    loadAnimObjects24652A(ram, rom, SCRIPT);
    assert.equal(ram.u32(ANIM_OBJECT.nodes + 0x0e), SPR_BASE - 0x40,
      '$246592 adda.w sign-extends: $80E886 + (-$40)');
    assert.equal(ram.u16(ANIM_OBJECT.nodes + 0x30), 0x2ace,
      'and the snapshot came from THERE. Unsigned it would be $80E886 + $FFC0 = $81E846, a live '
      + 'part of RAM that has nothing to do with the sprite palette');
  });

// ===============================================================================================
// SECTION 5 -- THE POOLS DID NOT MOVE.
// ===============================================================================================

test('SECTION 5: the two pools are still one set of constants, and they still ABUT',
  { skip: SKIP }, () => {
    assert.equal(ANIM_OBJECT.nodes, 0x80fa86, '$246552 lea $80FA86,A2');
    assert.equal(ANIM_OBJECT.nodeStride, 0x70, '$2465DE lea ($70,A2),A2');
    assert.equal(ANIM_OBJECT.nodeSlots, 20, '$24654E move.w #$13,D6 -- dbra is N+1');
    assert.equal(ANIM_OBJECT.roots, 0x810346, '$246532 lea $810346,A1');
    assert.equal(ANIM_OBJECT.rootStride, 0x30, '$246600 lea ($30,A1),A1');
    assert.equal(ANIM_OBJECT.rootSlots, 3, '$246538 moveq #$2,D7 -- dbra is N+1');
    assert.equal(ANIM_OBJECT.nodes + ANIM_OBJECT.nodeSlots * ANIM_OBJECT.nodeStride,
      ANIM_OBJECT.roots, 'the node pool ends EXACTLY at the root base -- which is what proves '
      + 'both strides, neither of which is derivable from the dbra literals');
    // `spawn.js PARTS` is kept as the written-down abutment proof; it must not drift from it.
    assert.equal(PARTS.nodePool, ANIM_OBJECT.nodes, 'PARTS.nodePool');
    assert.equal(PARTS.nodeSlots, ANIM_OBJECT.nodeSlots, 'PARTS.nodeSlots');
    assert.equal(PARTS.nodeStride, ANIM_OBJECT.nodeStride, 'PARTS.nodeStride');
    assert.equal(PARTS.parentPool, ANIM_OBJECT.roots, 'PARTS.parentPool');
    assert.equal(PARTS.parentSlots, ANIM_OBJECT.rootSlots, 'PARTS.parentSlots');
    assert.equal(PARTS.parentStride, ANIM_OBJECT.rootStride, 'PARTS.parentStride');
  });

test('SECTION 5: `$246B38` is MODELLED, not read, so the model is held against the cartridge',
  { skip: SKIP }, () => {
    // `animobjects.js timing()` reproduces the 32-row table rather than reading it, which is why
    // `$246B38` needs no ROM window. That makes it a transcription of exactly the kind this wave
    // is about, so it gets pinned to the image row by row.
    const ram = new Ram();
    seedPalette(ram);
    const SCRIPT = 0x900000;
    for (let i = 0; i < 32; i++) {
      const ROMW = new Map([
        [SCRIPT, 1], [SCRIPT + 2, 0], [SCRIPT + 4, 0],
        [SCRIPT + 6, 0], [SCRIPT + 8, 0], [SCRIPT + 10, 0], [SCRIPT + 12, i],
      ]);
      const rom = {
        u16: (a) => (ROMW.has(a) ? ROMW.get(a) : IMG.readUInt16BE(a)),
        u32: () => 0,
      };
      const r = new Ram();
      seedPalette(r);
      loadAnimObjects24652A(r, rom, SCRIPT);
      const node = ANIM_OBJECT.nodes;
      assert.equal(r.u16(node + 0x16), w(0x246b38 + i * 4),
        `$246B38[${i}] reload -- the port's timing() against the image`);
      assert.equal(r.u16(node + 0x14), w(0x246b38 + i * 4),
        `$246B38[${i}] and $2465B6 copies the SAME word to ($14)`);
      assert.equal(r.u16(node + 0x1c), w(0x246b38 + i * 4 + 2), `$246B38[${i}] step`);
    }
    // ...and the mask, not a guard, is what bounds it.
    assert.equal(l(0x2465a2), 0x0243001f, '$2465A2 andi.w #$1F,D3');
  });

test('SECTION 5: `buildChain246532` is the only body, and every head goes through it', () => {
  const src = readFileSync(here('../src/animobjects.js'), 'utf8');
  const heads = [...src.matchAll(/buildChain246532\(ram, rom, table, CHAIN_SPECS\[(0x[0-9a-f]+)\]\)/g)]
    .map((m) => m[1]).sort();
  assert.deepEqual(heads, ['0x246520', '0x24652a'],
    'animobjects.js routes both of its heads through the one body');
  const se = readFileSync(here('../src/stageend.js'), 'utf8');
  const seHeads = [...se.matchAll(/buildChain246532\(ram, rom, scriptAddr, CHAIN_SPECS\[(0x[0-9a-f]+)\]\)/g)]
    .map((m) => m[1]).sort();
  assert.deepEqual(seHeads, ['0x246704', '0x246710'],
    'and stageend.js routes its two through the SAME one');
  assert.equal(typeof buildChain246532, 'function', 'which is exported');
  assert.equal(typeof seedChainNode24676A, 'function', 'as is the content block it calls');
});
