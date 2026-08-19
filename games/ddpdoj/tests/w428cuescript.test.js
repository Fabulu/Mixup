// W428 -- THE THRESHOLD-CUE SCRIPTS, AND WHY TWO STAGE-1 CHECKPOINTS DIED.
//
// The brief called `$27399E` a LIVE THROW that ENDS A RUN and asked for it to
// be PORTED. **It is not a routine and there was nothing to port.** `$27399E`
// is DATA: it is the `script` longword of record 1 of type $80's word-threshold
// cue script, read by `src/cues.js:84`
//
//     const cueScript = rom.u32(script + 10);       // $28ACA0
//
// with `script = $273994`. W23's window `$273920 + $80` ends at `$27399F`, and
// that longword lives at `$27399E..$2739A1`. So the read fell off the end of a
// declared ROM window and `RomWindows.#at` threw by address, exactly as it is
// designed to.
//
// ---------------------------------------------------------------------------
// IT IS REACHABLE BY ANY PLAYER WHO SHOOTS THE ENEMY. MEASURED, NOT ARGUED.
// ---------------------------------------------------------------------------
// The four records are thresholds `$0992 $0785 $0578 $036B` and `$28AC72` fires
// one each time the sub-record's HP `($18,A6)` falls below the next. Type $80
// leaves its shield with HP `$1400` (`$273A2E`). On rung `c003000` the enemy's
// HP was traced down through `$0950 -> $0824 -> $078E -> $06F8`; the frame the
// `$0785` record came due -- frame 156 -- is the frame the port died. Nothing
// exotic opened this: **it is what happens when you damage the enemy past about
// 46% of its health.** Rung `c003100` reached the same point at frame 56.
//
// ---------------------------------------------------------------------------
// THE FIX IS NOT AN ABUTTING WINDOW, AND THAT IS THE TRAP TO CARRY FORWARD
// ---------------------------------------------------------------------------
// The house rule is "declare NEW ROM windows, never widen -- abutting is
// correct". **Abutting does not work when a multi-byte read straddles the
// seam.** `RomWindows.#at` resolves a read inside ONE window:
//
//     if (a >= w.base && a + n <= w.base + w.len) return w;
//
// This wave declared `$2739A0 + $20`, regenerated, and re-ran: `$27399E` threw
// exactly as before, because the longword spans `$27399E..$2739A1` and no
// single window held all four bytes. The windows below are therefore declared
// as the STRUCTURE -- each cue script from its own first byte to the handler
// instruction that follows it -- and each OVERLAPS the prototype window that
// used to clip it. Overlap is a shape this exporter already carries.
//
// ---------------------------------------------------------------------------
// AND THE SAME DEFECT WAS AT THREE MORE ADDRESSES, PLUS A SILENT ONE
// ---------------------------------------------------------------------------
// Walking every `jsr $2637A2 / move.l A0,($44,A5)` site in the cartridge (19 of
// them) against the window list found FOUR clipped cue scripts: types $80, $82,
// $88 and $1A. `$268E3A` (type $1A) is the worst-clipped -- record ZERO's D3
// longword was already outside.
//
// **AND THE SILENT ONE.** Three init bodies hard-coded `table + 28` for the
// `move.l A0,($44,A5)` cursor. The init stubs write `move.w #$1,($4,A5)`, so
// `$2637A2`'s `dbra` runs TWICE and the cursor is `table + 56`. The three
// wrong values -- `$27396A`, `$27478C`, `$275EE8` -- are each the SECOND sub
// prototype's own flags word, and all three have bit 15 set, so `$28AC72` read
// one as a threshold, took the `bmi` and installed **zero cues, forever**. No
// throw, no test, nothing to see. That is asserted below by reading the words.
//
// ---------------------------------------------------------------------------
// WHAT WOULD HAVE CAUGHT IT: DRIVING THESE RUNGS AT ALL
// ---------------------------------------------------------------------------
// `c003000`/`c003100` had never been stepped by any test. The first arm here
// drives both past frame 200 and asserts a STATE TRACE, not just "no throw":
// the cursor must walk all four records to the `$FFFF`, live cues must actually
// appear, and the HP must actually fall. A green run that stalled would fail.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import { loadSubProto } from '../src/enemyproto.js';
import { runInitBodyAddr } from '../src/initbody.js';
import {
  OVERLAP_PAIRS_BEFORE_W428, ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT,
  W428_OVERLAP_PAIRS, overlappingPairs,
} from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const tablesPath = path.join(GAME, 'rip', 'port', 'player.tables.json');
const CKPT = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold', 'ckpt');
const RUNGS = ['c003000', 'c003100'].map((n) => [n, path.join(CKPT, `${n}.ram.bin`)]);
const HAVE = existsSync(tablesPath) && RUNGS.every(([, p]) => existsSync(p));
const SKIP = HAVE ? false : 'the generated tables or the W69 laser-hold rungs are absent';

const tables = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;

// the enemy pool, and the cue ring `$28AC72` installs into.
const E_BASE = 0x81332c, E_STRIDE = 0x50, E_SLOTS = 58;
const E_FLAGS = 0x00, E_SUB = 0x06, E_TYPE = 0x0c, E_CUE = 0x44;
const CUE_BASE = 0x81db90, CUE_STRIDE = 0x26, CUE_SLOTS = 10, CUE_COUNT = 0x81dd0c;
const CUE_SCRIPT = 0x1e;
const S_HP = 0x18;

/** The four cue scripts, each `[first record, first byte AFTER the $FFFF]`.
 *  The upper bound of every one is the handler's own `jsr $2638A6`. */
const SCRIPTS = Object.freeze({
  '$1A': { seed: 0x268e32, end: 0x268e6c, thresholds: [0x1bc6, 0x159a, 0x0c58, 0x07b7] },
  '$80': { seed: 0x273986, end: 0x2739c0, thresholds: [0x0992, 0x0785, 0x0578, 0x036b] },
  '$82': { seed: 0x2747a8, end: 0x2747c6, thresholds: [0x015e, 0x00fa] },
  '$88': { seed: 0x275f04, end: 0x275f30, thresholds: [0x0cda, 0x092e, 0x0582] },
});

/** The three init bodies that hard-coded `table + 28`, with the sub-prototype
 *  table, the run length their init stub writes, and the value the OLD code
 *  produced. Every `old` word has bit 15 set -- see the test below. */
const SEEDS = Object.freeze([
  { type: '$80', body: 0x273802, table: 0x27394e, runLen: 1, old: 0x27396a, want: 0x273986 },
  { type: '$82', body: 0x27462a, table: 0x274770, runLen: 1, old: 0x27478c, want: 0x2747a8 },
  { type: '$88', body: 0x275da0, table: 0x275ecc, runLen: 1, old: 0x275ee8, want: 0x275f04 },
]);

const hx = (v) => `$${(v >>> 0).toString(16).toUpperCase()}`;

async function boot(rung) {
  const { Game } = await import('../src/main.js');
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const g = new Game(new Uint8Array(readFileSync(rung)), tables, { palCatchUp: false });
  return { g, hold: portWordFromBits([BIT.b1]) };
}

// ---------------------------------------------------------------------------
// 1. THE LIVE RUN. This is the arm that would have caught the throw.
// ---------------------------------------------------------------------------
for (const [name, file] of RUNGS) {
  test(`W69 stage-1 laser-hold rung ${name} runs 400 frames and walks type $80's `
    + 'cue script to its $FFFF', { skip: SKIP }, async () => {
    const { g, hold } = await boot(file);
    const ram = g.ram;

    const cursors = new Set();
    const scriptPtrs = new Set();
    let frames = 0, peakCues = 0, hpMin = 0x10000, hpMax = -1, sawType80 = 0;

    for (let f = 0; f < 400; f++) {
      g.step(hold);                       // THROWS by address if a window clips
      frames++;
      for (let i = 0; i < E_SLOTS; i++) {
        const a5 = E_BASE + i * E_STRIDE;
        if ((ram.u16(a5 + E_FLAGS) & 0x8000) === 0) continue;
        if (ram.u8(a5 + E_TYPE) !== 0x80) continue;
        sawType80++;
        cursors.add(ram.u32(a5 + E_CUE));
        const a6 = ram.u32(a5 + E_SUB);
        if (a6 >= 0x800000 && a6 <= 0x81ffff) {
          const hp = ram.u16(a6 + S_HP);
          if (hp < hpMin) hpMin = hp;
          if (hp > hpMax) hpMax = hp;
        }
      }
      const live = ram.u16(CUE_COUNT);
      if (live > peakCues) peakCues = live;
      for (let i = 0; i < CUE_SLOTS; i++) {
        const slot = CUE_BASE + i * CUE_STRIDE;
        if (ram.u16(slot) !== 0) scriptPtrs.add(ram.u32(slot + CUE_SCRIPT));
      }
    }

    // A GREEN RUN CAN MEAN A STALL. Prove the run ran and the enemy was there.
    assert.equal(frames, 400, 'the run must actually step 400 frames');
    assert.ok(sawType80 > 100, 'a type $80 must be live for most of the window, '
      + `saw it on ${sawType80} slot-frames`);

    // THE STATE TRACE. Every one of the four records must have been consumed,
    // and the cursor must finish ON the $FFFF at $2739BE. Records 2 and 3 live
    // ENTIRELY inside the bytes W23's window did not cover, so reaching
    // $2739BE is proof the new window is being read and not merely declared.
    for (const want of [0x273986, 0x273994, 0x2739a2, 0x2739b0, 0x2739be]) {
      assert.ok(cursors.has(want), `($44,A5) never took the value ${hx(want)}; `
        + `saw ${[...cursors].sort((a, b) => a - b).map(hx).join(' ')}`);
    }

    // The HP has to have MOVED -- the cues are threshold-driven and a static
    // HP would walk no records at all.
    assert.ok(hpMax > 0x0785 && hpMin < 0x036b,
      `type $80's HP must cross every threshold; measured ${hx(hpMin)}..${hx(hpMax)}`);

    // AND THE CUES MUST EXIST. The bookkeeping `$28ACD6` writes is the advanced
    // script pointer at cue +$1E: $28AF8A+2 for records 0/1 and $28AF84+2 for
    // records 2 and 3. Seeing $28AF86 means a record whose OWN script longword
    // was outside the old window installed a cue.
    assert.ok(peakCues >= 4, `expected at least four live cues, peak ${peakCues}`);
    assert.ok(scriptPtrs.has(0x28af8c), 'no cue carried $28AF8A+2 (records 0/1)');
    assert.ok(scriptPtrs.has(0x28af86), 'no cue carried $28AF84+2 (records 2/3)');
  });
}

// ---------------------------------------------------------------------------
// 2. THE WINDOWS. Each cue script must be readable end to end, IN ONE WINDOW.
// ---------------------------------------------------------------------------
test('all four word-threshold cue scripts read end to end, and each ends where '
  + 'its handler begins', { skip: SKIP }, () => {
  const rom = new RomWindows(tables.rom);
  for (const [type, s] of Object.entries(SCRIPTS)) {
    let a = s.seed;
    const seen = [];
    for (let n = 0; n < 16; n++) {
      const threshold = rom.u16(a);
      if ((threshold & 0x8000) !== 0) { a += 2; break; }
      // the three longwords $28ACA0 reads -- the last one is what threw
      rom.u32(a + 2);
      rom.u32(a + 6);
      const script = rom.u32(a + 10);
      assert.ok(script === 0x28af84 || script === 0x28af8a,
        `type ${type} record at ${hx(a)} points at ${hx(script)}, which is not `
        + 'one of the two cue scripts $28AF84/$28AF8A');
      seen.push(threshold);
      a += 14;
    }
    assert.deepEqual(seen, s.thresholds,
      `type ${type}'s thresholds changed: ${seen.map(hx).join(' ')}`);
    // the byte AFTER the script is the handler's first instruction,
    // `4e b9 00 26 38 a6  jsr $2638A6` -- that is what bounds every window.
    assert.equal(a, s.end, `type ${type}'s cue script must end at ${hx(s.end)}, `
      + 'which is its handler\'s first instruction');
  }
});

test('the exact longwords that used to throw now read the cartridge value',
  { skip: SKIP }, () => {
  const rom = new RomWindows(tables.rom);
  // measured from rip/sound/maincpu.bin at raw file offset
  assert.equal(rom.u32(0x27399e), 0x0028af8a, '$27399E -- the brief\'s address');
  assert.equal(rom.u32(0x2739ac), 0x0028af84, '$2739AC -- record 2\'s script');
  assert.equal(rom.u32(0x2739ba), 0x0028af84, '$2739BA -- record 3\'s script');
  assert.equal(rom.u16(0x2739be), 0xffff, '$2739BE -- type $80\'s terminator');
  assert.equal(rom.u32(0x2747b2), 0x0028af8a, '$2747B2 -- type $82 record 0');
  assert.equal(rom.u16(0x2747c4), 0xffff, '$2747C4 -- type $82\'s terminator');
  assert.equal(rom.u32(0x275f2a), 0x0028af84, '$275F2A -- type $88 record 2');
  assert.equal(rom.u16(0x275f2e), 0xffff, '$275F2E -- type $88\'s terminator');
  assert.equal(rom.u32(0x268e38), 0x00040000, '$268E38 -- type $1A record 0\'s D3');
  assert.equal(rom.u16(0x268e6a), 0xffff, '$268E6A -- type $1A\'s terminator');
});

test('RED: a window list without W428\'s four entries throws by address again, '
  + 'and an ABUTTING window does not fix it', { skip: SKIP }, () => {
  const W428 = new Set([0x273986, 0x2747a8, 0x275f04, 0x268e32]);
  const baseOf = (w) => parseInt(String(w.base).replace('$', ''), 16);
  const without = { windows: tables.rom.windows.filter((w) => !W428.has(baseOf(w))) };
  assert.equal(without.windows.length, tables.rom.windows.length - 4,
    'the four W428 windows must be present to be removed');

  // The FIRST failing read of each of the four scripts, measured by walking
  // each one against this reduced list. Note $88's is a WORD, not a longword:
  // W23's $275EA0+$80 ends exactly on record 2's threshold.
  const old = new RomWindows(without);
  assert.throws(() => old.u32(0x268e38), Unreached, '$268E38 -- type $1A record 0 D3');
  assert.throws(() => old.u32(0x27399e), Unreached, '$27399E -- type $80 record 1 script');
  assert.throws(() => old.u32(0x2747ae), Unreached, '$2747AE -- type $82 record 0 D3');
  assert.throws(() => old.u16(0x275f20), Unreached, '$275F20 -- type $88 record 2 threshold');

  // THE POINT OF THIS ARM: adding an ABUTTING window at $2739A0 does NOT make
  // $27399E readable, because #at needs all four bytes in ONE window.
  const full = tables.rom.windows.find((w) => baseOf(w) === 0x273986);
  const at = (a) => full.hex.substr((a - 0x273986) * 2, 2);
  let hex = '';
  for (let i = 0; i < 0x20; i++) hex += at(0x2739a0 + i);
  const seamed = new RomWindows({
    windows: [...without.windows, { base: '$2739A0', len: 0x20, hex }],
  });
  assert.equal(seamed.u16(0x2739a2), 0x0578, 'the abutting window itself reads fine');
  assert.throws(() => seamed.u32(0x27399e), Unreached,
    '$27399E must STILL throw across an abutting seam -- if this ever stops '
    + 'throwing, RomWindows.#at learned to stitch and the overlapping windows '
    + 'W428 declared can be reconsidered');
});

// ---------------------------------------------------------------------------
// 3. THE SEEDS. `move.l A0,($44,A5)` stores the LOADER'S cursor.
// ---------------------------------------------------------------------------
test('$2637A2 with the stub\'s run length lands on the cue script, and the old '
  + 'hard-coded seeds landed on a sub prototype', { skip: SKIP }, () => {
  const rom = new RomWindows(tables.rom);
  for (const s of SEEDS) {
    // Walk the loader for real. runLen 1 => dbra runs TWICE.
    const ram = new Ram();
    const cursor = loadSubProto(ram, rom, 0x813400, 0x817000, s.table, s.runLen);
    assert.equal(cursor, s.want, `type ${s.type}: $2637A2 from ${hx(s.table)} `
      + `with ($4,A5)=${s.runLen} must end on ${hx(s.want)}, got ${hx(cursor)}`);
    assert.equal(cursor - s.table, 56,
      `type ${s.type}: two LONG-form sub prototypes are 56 TABLE bytes`);
    assert.equal(s.old, s.table + 28, 'the old seed was one sub-record short');

    // THE REASON, READ RATHER THAN ASSERTED. The old value is the second sub
    // prototype's flags word; bit 15 set means `$28AC94 bmi` broke the loop on
    // its first pass, so the old code installed ZERO cues and said nothing.
    assert.ok((rom.u16(s.old) & 0x8000) !== 0,
      `type ${s.type}: ${hx(s.old)} must have bit 15 set -- that is WHY the old `
      + 'seed was silent rather than loud');
    // and the corrected one is a real threshold: bit 15 clear, and non-zero.
    const first = rom.u16(cursor);
    assert.equal(first & 0x8000, 0, `type ${s.type}: ${hx(cursor)} must be a threshold`);
    assert.ok(first > 0, `type ${s.type}: threshold ${hx(first)} must be non-zero`);
  }
});

test('the three init bodies seed ($44,A5) with that cursor, over DIRTIED fields',
  { skip: SKIP }, () => {
  const rom = new RomWindows(tables.rom);
  const A5 = 0x813400, A6 = 0x817000;
  for (const s of SEEDS) {
    const ram = new Ram();
    // DIRTY EVERY FIELD -- a recycled slot carries the previous tenant's bytes.
    for (let i = 0; i < 0x50; i += 2) ram.setU16(A5 + i, 0xdead);
    for (let i = 0; i < 0x80; i += 2) ram.setU16(A6 + i, 0xbeef);
    ram.setU32(A5 + E_SUB, A6);
    ram.setU16(A5 + 0x04, s.runLen);      // what the init stub wrote
    ram.setU32(A5 + 0x12, 0);             // no movement script
    ram.setU32(A5 + E_CUE, 0x11111111);   // a value neither reading produces
    for (const g of [0x813092, 0x813094, 0x813098, 0x8130d8, 0x8130da]) ram.setU16(g, 0);

    runInitBodyAddr(s.body, ram, rom, A5, { note: () => {} }, tables, null, null);

    const seeded = ram.u32(A5 + E_CUE);
    assert.equal(seeded, s.want, `type ${s.type} body ${hx(s.body)} seeded `
      + `${hx(seeded)}, want ${hx(s.want)}`);
    assert.notEqual(seeded, s.old, `type ${s.type} must not seed the old `
      + `${hx(s.old)}`);
  }
});

// ---------------------------------------------------------------------------
// 4. THE TWO GLOBAL TRIPWIRES. `tests/romwindowset.js` is now the single source
//    for both, so it needs a guard of its own or it becomes a fourteenth copy
//    that can drift. Everything below is read from the LIVE exported tables.
// ---------------------------------------------------------------------------
test('tests/romwindowset.js states the window count and the overlap count the '
  + 'exported tables actually have', { skip: SKIP }, () => {
  const ws = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(ws.length, ROM_WINDOW_COUNT,
    'ROM_WINDOW_COUNT must be what tools/export-tables.py emits');
  assert.equal(overlappingPairs(ws), ROM_OVERLAP_PAIRS,
    'ROM_OVERLAP_PAIRS must be what tools/export-tables.py emits');
});

test('the overlap count moved by EXACTLY the four windows W428 declared, and by '
  + 'nothing else', { skip: SKIP }, () => {
  const ws = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  const mine = new Set(W428_OVERLAP_PAIRS.map(([script]) => script));
  assert.equal(mine.size, 4, 'four cue scripts');
  for (const base of mine) {
    assert.equal(ws.filter(([a]) => a === base).length, 1,
      `${hx(base)} is declared exactly once`);
  }

  // WITHOUT the four, the set is what the last twelve waves measured. This is
  // the assertion that makes the delta reconcile instead of merely agreeing:
  // 71 -> 75 is four, and four windows were added.
  const without = ws.filter(([a]) => !mine.has(a));
  assert.equal(without.length, ROM_WINDOW_COUNT - 4, 'four windows added');
  assert.equal(overlappingPairs(without), OVERLAP_PAIRS_BEFORE_W428,
    'drop W428\'s four and the overlap count is 71 again -- so the four new '
    + 'pairs are W428\'s and no pre-existing pair moved');
  assert.equal(ROM_OVERLAP_PAIRS - OVERLAP_PAIRS_BEFORE_W428, 4,
    'one new overlapping pair per new window, and no more');

  // ...and each new pair is the cue script against the PROTOTYPE window that
  // used to clip it, not against something unrelated.
  for (const [script, proto] of W428_OVERLAP_PAIRS) {
    const a = ws.find(([b]) => b === script);
    const b = ws.find(([c]) => c === proto);
    assert.ok(a && b, `${hx(script)} and ${hx(proto)} are both declared`);
    assert.ok(a[0] < b[0] + b[1] && b[0] < a[0] + a[1],
      `${hx(script)} must overlap ${hx(proto)} -- that is the whole reason it `
      + 'is declared from its own first byte instead of abutting');
    assert.ok(a[0] > b[0], `${hx(script)} starts INSIDE ${hx(proto)}`);
    assert.ok(a[0] + a[1] > b[0] + b[1], `...and runs past its end`);
  }
});
