// W429 -- THE CUE DISPATCH'S SECOND SCRIPT, AND THE `not.b D3` NOBODY PORTED.
//
// The brief called `UNPORTED $28AE24` a live throw and said `$28AFD4` holds
// FOURTEEN live descriptors while `src/cues.js` covered three. Both halves need
// correcting, and the corrections point in opposite directions.
//
// ---------------------------------------------------------------------------
// 1. FOURTEEN ENTRIES ARE NON-ZERO. SIX ARE REACHABLE. THE UNIT IS THREE.
// ---------------------------------------------------------------------------
// `$28AFD4` is indexed by words taken from a CUE SCRIPT, and the cartridge holds
// exactly five referenced cue scripts. Between them they name six dispatch
// indices and nothing else:
//
//     $28AF84  18 refs   $00 $04
//     $28AF8A  26 refs   $00 $04 $08
//     $28AF98   2 refs   $0C $10 $14      <- the whole of this wave
//     $28AFA0   2 refs   $00
//     $28AFA4   2 refs   $04
//
// `$28AF92` and the six scripts at `$28AFB0..$28AFD2` -- the ones that name
// `$18`, `$1C` and `$28`..`$3C` -- have ZERO references, so descriptors
// `$28B0F8`, `$28B106`, `$28B114`, `$28B122`, `$28B130` and `$28B13E` cannot be
// selected in this revision and are deliberately not declared as ROM windows.
// The honest unit is the three descriptors of `$28AF98`, not fourteen and not
// one. Arm 3 re-derives that scan from the image so the claim cannot go stale.
//
// ---------------------------------------------------------------------------
// 2. AND THE UNIT IS ALSO BIGGER THAN THE BRIEF, IN A DIRECTION IT DID NOT LOOK
// ---------------------------------------------------------------------------
// `$28ACFE..$28AD26` was missing from `installCue` entirely: `tst.b D3 / bpl`,
// then on a negative low byte `not.b D3` and two `eori.b` flips each gated on
// its own `jsr $242FDE` draw. **Six of the fifty cue records in the image have
// that bit set, and FOUR of them feed the already-shipped kinds $00 and $04**,
// so this was live and wrong before this wave existed. It is not cosmetic: the
// draws bump `$803917`, the cursor every other `$242FDE` consumer shares.
//
// The hardware settles it without an argument. Every one of those six records
// carries `D3 = $0010FFBF`, and all five oracle snapshots holding a live kind-$C
// cue read back `+$18 = $0010FF00` and `+$1C = $001E`. `$BF` is what the record
// says; `$40` is what `not.b` alone gives; `$00` is reachable ONLY through
// `not.b` followed by `eori.b #$40`. Arm 5 asserts that as a three-way.
//
// ---------------------------------------------------------------------------
// 3. THE STATE TRACE, NOT A GREEN RUN
// ---------------------------------------------------------------------------
// A run that stalls is green. Arm 1 steps `c003600` forward and compares ALL
// TWELVE fields of the cue record against the `c003625`, `c003650`, `c003675`
// and `c003700` snapshots at frames 25, 50, 75 and 100. That checks the art
// table, the phase walk, the countdown and the emitter against the board.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  CUE, CUE_KINDS, CUE_REACHABLE_INDICES, selectEmitter28ACFE, spawnCues28AC72,
} from '../src/cues.js';
import { RNG, RNG_242FDE } from '../src/rng.js';
import {
  OVERLAP_NOTE, ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, W429_ABUTTING_PAIR,
  overlappingPairs,
} from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const tablesPath = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');
const CKPT = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold', 'ckpt');

/** The five rungs of the 363 that arrive with a live kind-$C cue at frame 0.
 *  The brief named three; there are five. */
const KINDC_RUNGS = ['c003600', 'c003625', 'c003650', 'c003675', 'c003700'];
const rungPath = (n) => path.join(CKPT, `${n}.ram.bin`);

const HAVE = existsSync(tablesPath) && existsSync(IMAGE)
  && KINDC_RUNGS.every((n) => existsSync(rungPath(n)));
const SKIP = HAVE ? false : 'the generated tables, the cartridge image or the '
  + 'W69 laser-hold rungs are absent';

const tables = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const image = HAVE ? readFileSync(IMAGE) : null;

const hx = (v) => `$${(v >>> 0).toString(16).toUpperCase()}`;

// The whole cartridge, for the reference scans. These arms are deliberately NOT
// limited to declared ROM windows -- the question they answer is "what does the
// image contain", and a window list cannot answer that.
const img16 = (a) => image.readUInt16BE(a);
const img32 = (a) => image.readUInt32BE(a);

/** Every field `$28ACD4`'s install writes, so a comparison against the board is
 *  a whole-record comparison and not a one-field one. */
const FIELDS = Object.freeze([
  ['flags', 0x00, 2], ['pos', 0x02, 4], ['offset', 0x06, 4], ['sprite', 0x0a, 4],
  ['size', 0x0e, 2], ['parent', 0x10, 4], ['delta', 0x14, 4], ['emitter', 0x18, 4],
  ['descriptorWord', 0x1c, 2], ['script', 0x1e, 4], ['countdown', 0x22, 2],
  ['phase', 0x24, 2],
]);
const readField = (ram, at, [, off, size]) =>
  (size === 2 ? ram.u16(at + off) : ram.u32(at + off));

async function boot(rung) {
  const { Game } = await import('../src/main.js');
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const g = new Game(new Uint8Array(readFileSync(rungPath(rung))), tables,
    { palCatchUp: false });
  return { g, hold: portWordFromBits([BIT.b1]) };
}

// ---------------------------------------------------------------------------
// 1. THE LIVE RUN AND THE STATE TRACE.
// ---------------------------------------------------------------------------
test('stepping c003600 reproduces the kind-$C cue record of the next four '
  + 'snapshots, field for field', { skip: SKIP }, async () => {
  const { g, hold } = await boot('c003600');
  const want = new Map();
  for (const n of KINDC_RUNGS.slice(1)) {
    want.set(Number(n.slice(1)) - 3600,
      new Ram(new Uint8Array(readFileSync(rungPath(n)))));
  }
  assert.deepEqual([...want.keys()], [25, 50, 75, 100], 'the four later rungs '
    + 'are 25, 50, 75 and 100 frames after c003600');

  const sprites = new Set();
  let checked = 0, kindCFrames = 0;
  for (let f = 1; f <= 100; f++) {
    g.step(hold);                                   // THROWS on an unported kind
    if (g.ram.u16(CUE.base) === 0x800c) {
      kindCFrames++;
      sprites.add(g.ram.u32(CUE.base + 0x0a));
    }
    const ref = want.get(f);
    if (!ref) continue;
    checked++;
    for (const field of FIELDS) {
      assert.equal(readField(g.ram, CUE.base, field),
        readField(ref, CUE.base, field),
        `frame ${f}: cue slot 0 field ${field[0]} diverged from the board`);
    }
  }

  // A GREEN RUN CAN MEAN A STALL. Prove the cue was there and MOVED.
  assert.equal(checked, 4, 'all four snapshots must have been compared');
  assert.ok(kindCFrames > 90, 'the kind-$C cue must be live for essentially the '
    + `whole window, saw it on ${kindCFrames} of 100 frames`);
  const artC = [0, 4, 8, 0x0c].map((o) => img32(CUE.artC + o));
  assert.deepEqual([...sprites].sort((a, b) => a - b),
    [...artC].sort((a, b) => a - b),
    'the cue must walk ALL FOUR frames of $28B09C -- a stalled phase would '
    + `show one, saw ${[...sprites].map(hx).join(' ')}`);
});

test('all five kind-$C rungs step 400 frames without an unported throw',
  { skip: SKIP }, async () => {
  for (const n of KINDC_RUNGS) {
    const { g, hold } = await boot(n);
    // the cue really is there at frame 0 -- otherwise this measures the bench
    assert.equal(g.ram.u16(CUE.base) & 0x7c, 0x0c,
      `${n} must arrive with a kind-$C cue in slot 0`);
    for (let f = 0; f < 400; f++) g.step(hold);
    assert.equal(g.ram.u16(CUE.base + 0x1c), 0x001e,
      `${n}: the descriptor word must still be $001E after 400 frames`);
  }
});

// ---------------------------------------------------------------------------
// 2. `CUE_KINDS` IS BOOKKEEPING, SO SOMETHING HAS TO READ IT.
// ---------------------------------------------------------------------------
// Each of the six art bodies is 34 bytes and they differ in exactly two places:
// the PC-relative `lea` and the `move.w #imm,($24,A6)` reload. This arm decodes
// both out of the cartridge and rebuilds `CUE_KINDS` from scratch. If a future
// wave edits the table by hand, this fails.
const BODY_LEN = 0x22;
const BODY_TEMPLATE = Object.freeze([
  [0x00, '302e0024'],        // move.w ($24,A6),D0
  [0x04, '41fa'],            // lea (d16,PC),A0      -- disp at +6
  [0x08, '4e71'],            // nop
  [0x0a, '2d70000000 0a'.replace(' ', '')],  // move.l (0,A0,D0.w),($0A,A6)
  [0x10, '596e0024'],        // subq.w #4,($24,A6)
  [0x14, '6400'],            // bcc.w                -- disp at +$16
  [0x18, '3d7c'],            // move.w #imm,($24,A6) -- imm at +$1A
  [0x1c, '0024'],
  [0x1e, '6000'],            // bra.w                -- disp at +$20
]);
/** Both branches of every body land here: `$28AF34`'s `nop` is the jump-table
 *  entry for the no-art kinds, and `$28AF36` is the shared tail. */
const TAIL = 0x28af36;

test('CUE_KINDS is what $28AE18\'s jump table and its six bodies actually say',
  { skip: SKIP }, () => {
  const jump = [];
  for (let i = 0; i < CUE.artJumpEntries; i++) jump.push(img32(CUE.artJump + i * 4));

  // The table has a period of TEN: entries 10..19 repeat 0..9, so the $20 bit
  // of the kind is not looked at. Stated because it is the only reason kinds
  // $28..$3C exist at all.
  for (let i = 0; i < 10; i++) {
    assert.equal(jump[i + 10], jump[i],
      `$28AE18 entry ${i + 10} must repeat entry ${i}`);
  }
  assert.equal(new Set(jump).size, 7, 'ten distinct entries collapse to seven '
    + 'targets: six art bodies and the no-art $28AF34');
  for (const k of [0x18, 0x1c, 0x20, 0x24]) {
    assert.equal(jump[k / 4], 0x28af34,
      `kind ${hx(k)} must reach the no-art body $28AF34`);
  }
  assert.equal(image.readUInt16BE(0x28af34), 0x4e71,
    '$28AF34 is a bare nop that falls into the shared tail -- that is what '
    + '"no art" means here, and it is why those kinds need no art table');

  const rebuilt = {};
  for (let k = 0; k <= 0x14; k += 4) {
    const body = jump[k / 4];
    for (const [off, hex] of BODY_TEMPLATE) {
      assert.equal(image.subarray(body + off, body + off + hex.length / 2)
        .toString('hex'), hex,
      `the body for kind ${hx(k)} at ${hx(body)} is not the 34-byte shape at +${off}`);
    }
    // lea target = EXTENSION WORD address + displacement, not PC-after.
    const art = body + 0x06 + img16(body + 0x06);
    const reload = img16(body + 0x1a);
    assert.equal(body + 0x16 + img16(body + 0x16), TAIL,
      `kind ${hx(k)}'s bcc.w must reach the shared tail ${hx(TAIL)}`);
    assert.equal(body + 0x20 + img16(body + 0x20), TAIL,
      `kind ${hx(k)}'s bra.w must reach the shared tail ${hx(TAIL)}`);
    rebuilt[k] = { body, art, reload };
  }
  assert.equal(Object.keys(CUE_KINDS).length, 6, 'six art bodies');
  for (const [k, spec] of Object.entries(CUE_KINDS)) {
    const got = rebuilt[Number(k)];
    assert.ok(got, `CUE_KINDS names kind ${hx(Number(k))}, which has no body`);
    assert.equal(spec.body, got.body, `kind ${hx(Number(k))} body`);
    assert.equal(spec.art, got.art, `kind ${hx(Number(k))} art table`);
    assert.equal(spec.reload, got.reload, `kind ${hx(Number(k))} reload`);
    // the descriptor's kind bits must be the dispatch offset that selects it
    assert.equal(img16(spec.desc) & 0x7c, Number(k),
      `descriptor ${hx(spec.desc)}'s flags must carry kind ${hx(Number(k))}`);
    // ...and the six bodies are 34 bytes apart, back to back
    assert.equal(got.body, 0x28ae68 + Number(k) / 4 * BODY_LEN,
      'the six bodies are contiguous');
  }
});

test('art == descriptor + 14 for the six REACHABLE descriptors and NOT for the '
  + 'six unreachable ones -- which is why the port reads the instruction',
{ skip: SKIP }, () => {
  for (const spec of Object.values(CUE_KINDS)) {
    assert.equal(spec.art, spec.desc + 14,
      `${hx(spec.desc)} carries its own art table`);
    assert.equal(img16(spec.desc + 0x0c), spec.reload,
      `${hx(spec.desc)}'s +$0C word happens to equal the body's immediate`);
  }
  // THE TRAP THIS GUARDS. $28B0F8..$28B13E are 14 bytes each, back to back,
  // with NO art table: descriptor + 14 is the NEXT DESCRIPTOR. Deriving `art`
  // or `reload` from the descriptor would be right six times and wrong six
  // times, and the six it is wrong on are the ones nothing tests.
  for (const d of [0x28b0f8, 0x28b106, 0x28b114, 0x28b122, 0x28b130]) {
    assert.equal((img16(d + 14) & 0x8000) !== 0, true,
      `${hx(d + 14)} is the next descriptor's flags word, not an art longword`);
  }
  assert.equal(img16(0x28b13e + 14) & 0x8000, 0,
    '$28B14C is past the last descriptor -- it is code (`moveq #7,D0`)');
  assert.equal(img16(0x28b14c), 0x3c00, '$28B14C is `moveq #$00,D6`-shaped code');
});

// ---------------------------------------------------------------------------
// 3. THE REACHABILITY CLAIM, RE-DERIVED FROM THE IMAGE.
// ---------------------------------------------------------------------------
// `descriptor()` throws for eight non-zero dispatch entries and states a REASON.
// W428 found the repo's own stale-note guard green on a false reason, so this
// arm recomputes the reason rather than restating it.
const SCRIPT_LO = 0x28af84, SCRIPT_HI = 0x28afd4;

function scriptReferences() {
  const refs = new Map();
  for (let a = 0; a + 4 <= image.length; a += 2) {
    const v = img32(a);
    if (v >= SCRIPT_LO && v < SCRIPT_HI) {
      if (!refs.has(v)) refs.set(v, []);
      refs.get(v).push(a);
    }
  }
  return refs;
}

test('exactly five cue scripts are referenced, and between them they name only '
  + 'the six dispatch indices the port implements', { skip: SKIP }, () => {
  const refs = scriptReferences();
  const counts = [...refs].map(([s, at]) => [s, at.length])
    .sort((a, b) => a[0] - b[0]);
  assert.deepEqual(counts, [
    [0x28af84, 18], [0x28af8a, 26], [0x28af98, 2], [0x28afa0, 2], [0x28afa4, 2],
  ], `the referenced cue scripts changed: ${counts.map(([s, n]) => `${hx(s)}x${n}`).join(' ')}`);

  const named = new Set();
  for (const s of refs.keys()) {
    let a = s;
    for (let n = 0; n < 8; n++) {
      const w = img16(a);
      if ((w & 0x8000) !== 0) break;
      named.add(w);
      a += 2;
    }
    assert.ok(a < SCRIPT_HI, `${hx(s)} must terminate before the dispatch table`);
  }
  assert.deepEqual([...named].sort((a, b) => a - b), [...CUE_REACHABLE_INDICES],
    'CUE_REACHABLE_INDICES must be what the referenced scripts name');
});

test('the six cue scripts that name kinds $18..$3C have ZERO references -- that '
  + 'is the stated reason descriptor() throws for them', { skip: SKIP }, () => {
  const refs = scriptReferences();
  const dead = [0x28afb0, 0x28afb6, 0x28afbe, 0x28afc4, 0x28afcc, 0x28afd0];
  for (const s of dead) {
    assert.equal(refs.has(s), false, `${hx(s)} must have no reference`);
    assert.ok((img16(s) & 0x7c) >= 0x28,
      `${hx(s)} must be one of the scripts naming the $28..$3C family`);
  }
  assert.equal(refs.has(0x28af92), false,
    '$28AF92 (kinds $0C $10) is also unreferenced -- the LIVE kind-$C cues come '
    + 'from $28AF98, not from it');

  // and the descriptors those dead scripts select really are the six the port
  // refuses, so the two lists agree.
  const refused = new Set();
  for (let i = 0; i < CUE.dispatchEntries; i++) {
    if (!CUE_REACHABLE_INDICES.includes(i * 4)) refused.add(img32(CUE.dispatch + i * 4));
  }
  assert.deepEqual([...refused].sort((a, b) => a - b),
    [0x000000, 0x28b0f8, 0x28b106, 0x28b114, 0x28b122, 0x28b130, 0x28b13e],
    'the fourteen non-zero entries minus the six reachable ones are exactly '
    + 'the $28B0F8 family, plus the six zero entries');
});

test('RED: a cue whose flags carry an unreachable kind still throws, by address',
  { skip: SKIP }, async () => {
  // `$28ADA4 tst.w ($80390C) / beq` skips the emit on alternate frames, so this
  // has to step more than once to reach `$28ADBA`'s jmp at all.
  for (const [kind, why] of [[0x18, 'has no reachable descriptor'],
    [0x50, 'runs off the end of $28AE18\'s twenty entries']]) {
    const { g, hold } = await boot('c003600');
    assert.throws(() => {
      for (let f = 0; f < 4; f++) {
        g.ram.setU16(CUE.base, 0x8000 | kind);
        g.step(hold);
      }
    }, Unreached, `kind ${hx(kind)} ${why} and must stay loud`);
  }
});

// ---------------------------------------------------------------------------
// 4. THE ROM WINDOW. THIS ONE ABUTS, AND THAT IS MEASURED, NOT ASSUMED.
// ---------------------------------------------------------------------------
test('$28B08E + $6A abuts W173\'s window exactly and overlaps nothing',
  { skip: SKIP }, () => {
  const ws = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(ws.length, ROM_WINDOW_COUNT,
    'ROM_WINDOW_COUNT must be what tools/export-tables.py emits');
  assert.equal(overlappingPairs(ws), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);

  const [mine, w173] = W429_ABUTTING_PAIR;
  const a = ws.find(([b]) => b === mine);
  const b = ws.find(([c]) => c === w173);
  assert.ok(a && b, 'both windows are declared');
  assert.equal(b[0] + b[1], a[0],
    `W173's ${hx(w173)} must end exactly where ${hx(mine)} begins`);
  assert.equal(a[1], 0x6a, 'the window is the three descriptors and their art');
  assert.equal(a[0] + a[1], 0x28b0f8, 'and it stops before the unreachable six');

  // THE DELTA MUST RECONCILE: drop this window and the set is what W428 left.
  const without = ws.filter(([x]) => x !== mine);
  assert.equal(without.length, ROM_WINDOW_COUNT - 1, 'one window added');
  assert.equal(overlappingPairs(without), ROM_OVERLAP_PAIRS,
    'dropping W429\'s window leaves the overlap count unchanged -- an abutting '
    + 'window adds no pair, which is the whole claim');
});

test('RED: without W429\'s window the kind-$C art longword throws by address, '
  + 'and the cue record\'s reads do NOT straddle the seam', { skip: SKIP }, () => {
  const baseOf = (w) => parseInt(String(w.base).replace('$', ''), 16);
  const without = { windows: tables.rom.windows.filter((w) => baseOf(w) !== 0x28b08e) };
  assert.equal(without.windows.length, tables.rom.windows.length - 1,
    'the W429 window must be present to be removed');
  const old = new RomWindows(without);
  assert.throws(() => old.u16(0x28b08e), Unreached, 'descriptor $28B08E flags');
  assert.throws(() => old.u32(0x28b09c), Unreached, 'kind-$C art frame 0');
  assert.throws(() => old.u32(0x28b0d8), Unreached, 'kind-$14 art frame 0');
  // ...and W173's window still ends on a whole longword, which is WHY abutting
  // works here where it did not for W428.
  assert.equal(old.u32(0x28b08a), img32(0x28b08a),
    "W173's last kind-8 art longword $28B08A..$28B08D is entirely inside it, so "
    + 'no read crosses $28B08E and an abutting window is sufficient');

  const rom = new RomWindows(tables.rom);
  for (const spec of Object.values(CUE_KINDS)) {
    rom.u16(spec.desc); rom.u32(spec.desc + 2); rom.u16(spec.desc + 6);
    rom.u16(spec.desc + 8); rom.u32(spec.desc + 10);
    for (let p = 0; p <= spec.reload; p += 4) {
      assert.equal(rom.u32(spec.art + p), img32(spec.art + p),
        `kind's art frame at ${hx(spec.art + p)} must read the cartridge value`);
    }
  }
  assert.throws(() => rom.u32(0x28b0f8), Unreached,
    'the unreachable $28B0F8 family is deliberately NOT windowed');
});

// ---------------------------------------------------------------------------
// 5. `$28ACFE..$28AD26` -- THE BLOCK THAT WAS NEVER PORTED.
// ---------------------------------------------------------------------------
test('the cue-record census: six of fifty records take the D3 transform, and '
  + 'four of them feed the ALREADY-SHIPPED kinds $00/$04', { skip: SKIP }, () => {
  const refs = scriptReferences();
  const taking = [], skipping = [];
  for (const [script, sites] of refs) {
    for (const at of sites) {
      const d3 = img32(at - 4);                   // record: threshold.w D2.l D3.l script.l
      ((d3 & 0x80) !== 0 ? taking : skipping).push([at, script, d3]);
    }
  }
  assert.equal(taking.length + skipping.length, 50, 'fifty cue records in all');
  assert.equal(taking.length, 6, `six take the transform, got ${taking.length}`);
  for (const [, , d3] of taking) {
    assert.equal(d3, 0x0010ffbf, 'every one of the six carries D3 = $0010FFBF');
  }
  const viaShipped = taking.filter(([, s]) => s === 0x28afa0 || s === 0x28afa4);
  assert.equal(viaShipped.length, 4, 'four of the six reach kinds $00/$04 '
    + 'through $28AFA0/$28AFA4 -- so this defect predates W429');
  assert.deepEqual(viaShipped.map(([at]) => at).sort((a, b) => a - b),
    [0x263bfc, 0x263c0c, 0x263c1c, 0x263c2c]);
  assert.deepEqual(taking.filter(([, s]) => s === 0x28af98)
    .map(([at]) => at).sort((a, b) => a - b), [0x26b6f4, 0x26c3dc],
  'and two reach kind $C through $28AF98');
});

test('selectEmitter28ACFE: $BF -> not.b -> $40 -> eori.b #$40 -> $00, and only '
  + 'the full block can produce the $00 the board shows', { skip: SKIP }, () => {
  const rom = new RomWindows(tables.rom);
  // Pick RNG words that make the draw land on a KNOWN table byte. The counter
  // is the low byte of $803916, so `addq.b #1` moves the index by one.
  const pick = (wantZero) => {
    for (let lo = 0; lo < 0x100; lo++) {
      const idx = (lo + 1) & 0xff;
      if ((rom.u8(RNG_242FDE.table + idx) === 0) === wantZero) return lo;
    }
    throw new Error('the $24301A table has only one value');
  };

  for (const [wantZero, expect] of [[true, 0x0010ff00], [false, 0x0010ff40]]) {
    const ram = new Ram();
    ram.setU16(RNG.state, pick(wantZero));
    const got = selectEmitter28ACFE(ram, rom, 0x0010ffbf);
    assert.equal(got, expect, `draw ${wantZero ? 'zero' : 'non-zero'}`);
    assert.equal(ram.u8(RNG.counter), (pick(wantZero) + 1) & 0xff,
      'exactly ONE draw is taken: bit 5 is clear after not.b, bit 6 is set');
  }

  // A bit-7-clear D3 must pass through untouched AND consume no draw. That is
  // the arm that protects the 44 records this block must not touch.
  const ram = new Ram();
  ram.setU16(RNG.state, 0x0042);
  assert.equal(selectEmitter28ACFE(ram, rom, 0x00140000), 0x00140000);
  assert.equal(selectEmitter28ACFE(ram, rom, 0x0010ff00), 0x0010ff00,
    'and the value is idempotent, which is what the ADVANCE path re-feeds it');
  assert.equal(ram.u16(RNG.state), 0x0042, 'no draw was consumed');
});

test('the board itself rules out both shorter readings of $28ACFE',
  { skip: SKIP }, () => {
  for (const n of KINDC_RUNGS) {
    const ram = new Ram(new Uint8Array(readFileSync(rungPath(n))));
    const emitter = ram.u32(CUE.base + 0x18);
    assert.equal(emitter, 0x0010ff00, `${n}: the live cue's +$18`);
    assert.notEqual(emitter & 0xff, 0xbf,
      `${n}: $BF is what the record holds -- storing D3 unchanged is refuted`);
    assert.notEqual(emitter & 0xff, 0x40,
      `${n}: $40 is not.b alone -- skipping the eori is refuted too`);
    assert.equal(ram.u16(CUE.base + 0x1c), 0x001e,
      `${n}: and +$1C's HIGH byte is that same $00, via move.b D3,(-2,A0)`);
  }
});

test('a spawn through $28AC72 over DIRTIED fields installs the transformed D3',
  { skip: SKIP }, () => {
  const rom = new RomWindows(tables.rom);
  const A5 = 0x813400, A6 = 0x817000, PARENT = 0x817100;
  const RECORD = 0x26b6ea;        // threshold $2E60, D2 0, D3 $0010FFBF, $28AF98
  assert.equal(rom.u16(RECORD), 0x2e60, 'the record is where this test says');
  assert.equal(rom.u32(RECORD + 6), 0x0010ffbf);
  assert.equal(rom.u32(RECORD + 10), 0x0028af98);

  const ram = new Ram();
  // DIRTY EVERY FIELD -- a recycled cue slot carries the previous tenant's bytes.
  for (let i = 0; i < CUE.slots * CUE.stride; i += 2) {
    ram.setU16(CUE.base + i, 0xdead);
  }
  for (let i = 0; i < 0x50; i += 2) ram.setU16(A5 + i, 0xbeef);
  for (let i = 0; i < 0x40; i += 2) ram.setU16(A6 + i, 0xcafe);
  for (let i = 0; i < 0x40; i += 2) ram.setU16(PARENT + i, 0x1234);
  ram.setU16(CUE.base, 0);                 // one free slot, slot 0
  ram.setU16(CUE.count, 0);
  ram.setU16(CUE.stagger, 0);
  ram.setU32(A5 + 0x44, RECORD);
  ram.setU32(A5 + 0x06, PARENT);
  ram.setU16(A6 + 0x18, 0);                // HP below the threshold, so it fires
  ram.setU16(RNG.state, 0x0000);

  spawnCues28AC72(ram, rom, A5, A6);

  assert.equal(ram.u16(CUE.count), 1, 'one cue installed');
  assert.equal(ram.u16(CUE.base), 0x800c,
    'flags = descriptor $28B08E\'s own $800C. Bit 7 is NOT set: `$28ACE6 '
    + 'tst.w (A2)` peeks the NEXT script word, which is $28AF9A\'s $0010, not '
    + 'the $FFFF terminator -- $28AF98 has three indices, not one');
  const emitter = ram.u32(CUE.base + 0x18);
  assert.ok(emitter === 0x0010ff00 || emitter === 0x0010ff40,
    `+$18 must be a transformed D3, got ${hx(emitter)} (the raw record value `
    + '$0010FFBF would mean $28ACFE is still unported)');
  assert.equal(ram.u16(CUE.base + 0x1c), ((emitter & 0xff) << 8) | 0x1e,
    '+$1C\'s high byte is the SAME transformed low byte, via move.b D3,(-2,A0)');
  assert.equal(ram.u32(CUE.base + 0x1e), 0x28af9a, 'the script cursor advanced');
  assert.equal(ram.u32(A5 + 0x44), RECORD + 14, 'and the record cursor did too');
});
