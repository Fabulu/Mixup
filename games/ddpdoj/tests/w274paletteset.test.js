// W274: `$241688`, the stage-clear tally's palette set -- `$2600D8`'s last counted
// gap -- and the CLAIM AUDIT that found it.
//
// `src/palette.js` said "[M] bank 9 ($2226F8) has NO installer anywhere in the image
// at all." It has one: `$2416C0 lea $2226F8,A0 / moveq #$9,D0 / jsr ($2414BE,PC)`,
// arm 0 of this routine. The claim rested on `tools/hard/absxref.py`, which
// histograms operands landing in MAIN RAM and therefore cannot see a reference to a
// ROM block at all. `rosetta.py codexref` finds it in one line and always could have.
//
// The last test here is the generalisation: every no-caller claim left in `src/` is
// re-checked against the image, so none of them can rot silently.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import {
  PaletteState, PALSTAGE, SPR_BANKS, TX_BANKS, paletteSet241688,
} from '../src/palette.js';
import { TALLY, tally2600D8 } from '../src/tally.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const HAVE_IMG = existsSync(IMAGE);
const IMG = HAVE_IMG ? readFileSync(IMAGE) : null;
// The image is OFFSET-ADDRESSED: file offset == 68000 address, which is what
// `tools/rosetta.py`'s RANGES = {A: (0x100000, 0x1C8000), B: (0x200000, 0x2B0000)}
// means. W272 scanned it with a base of $200000 and read the wrong bytes.
const BUILD_B = Object.freeze({ lo: 0x200000, hi: 0x2b0000 });

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  const palette = new PaletteState();
  return { ram, log, palette,
    ctx: { ram, rom: ROM, palette, unported: log, unportedLog: log, notes: log } };
}

// The four arms, restated here from the listing rather than imported, so the table in
// `palette.js` is checked against an independent transcription and not against itself.
const ARMS = [
  { d0: 0, d1: 0, site: 0x241696, spr: [[0, 0x222878], [2, 0x222978], [4, 0x2229f8]],
    tx: [9, 0x2226f8] },
  { d0: 0, d1: 1, site: 0x2416d0, spr: [[0, 0x2228b8], [2, 0x2229b8], [4, 0x222a38]],
    tx: [9, 0x222738] },
  { d0: 1, d1: 0, site: 0x241710, spr: [[1, 0x2228f8], [3, 0x222978], [4, 0x2229f8]],
    tx: [0x0a, 0x222718] },
  { d0: 1, d1: 1, site: 0x24174a, spr: [[1, 0x222938], [3, 0x2229b8], [4, 0x222a38]],
    tx: [0x0a, 0x222758] },
];

// ======================================================== 1. THE FOUR ARMS

test('W274 each arm installs its THREE sprite banks from the block the listing names',
  { skip: SKIP }, () => {
    for (const [i, a] of ARMS.entries()) {
      const f = world();
      const arm = paletteSet241688(f.ram, f.palette, ROM, a.d0, a.d1);
      assert.equal(arm, i, `(D0,D1) = (${a.d0},${a.d1}) is arm ${i}`);
      for (const [bank, src] of a.spr) {
        const at = PALSTAGE.spr.stage + bank * 64;
        const want = ROM.bytes(src, 64);
        for (let w = 0; w < 32; w++) {
          assert.equal(f.ram.u16(at + w * 2), (want[w * 2] << 8) | want[w * 2 + 1],
            `arm ${i} bank ${bank} word ${w}`);
        }
      }
      assert.equal(f.ram.u16(PALSTAGE.spr.dirty), 1, '$241520 set the sprite flag');
    }
  });

test('W274 each arm installs its ONE text bank, and arm 0 is BANK 9 from $2226F8',
  { skip: SKIP }, () => {
    for (const [i, a] of ARMS.entries()) {
      const f = world();
      paletteSet241688(f.ram, f.palette, ROM, a.d0, a.d1);
      const at = PALSTAGE.tx.stage + a.tx[0] * 32;
      const want = ROM.bytes(a.tx[1], 32);
      for (let w = 0; w < 16; w++) {
        assert.equal(f.ram.u16(at + w * 2), (want[w * 2] << 8) | want[w * 2 + 1],
          `arm ${i} TX bank ${a.tx[0]} word ${w}`);
      }
      assert.equal(f.ram.u16(PALSTAGE.tx.dirty), 1, '$2414D4 set the text flag');
    }
    // The correction itself, stated as an assertion.
    assert.equal(ARMS[0].tx[0], 9);
    assert.equal(ARMS[0].tx[1], 0x2226f8);
  });

test('W274 D1 picks the SOURCE and D0 picks the DESTINATION BANK', { skip: SKIP }, () => {
  // Read down the table's columns: the two D1=0 arms share $222978/$2229F8 and the
  // two D1!=0 arms share $2229B8/$222A38, while D0 shifts the sprite banks from
  // (0,2) to (1,3) and the text bank from 9 to $A.
  assert.deepEqual(ARMS[0].spr.slice(1).map((p) => p[1]),
    ARMS[2].spr.slice(1).map((p) => p[1]),
    'D1=0: arms 0 and 2 share their second and third SOURCES (banks differ)');
  assert.deepEqual(ARMS[1].spr.slice(1).map((p) => p[1]),
    ARMS[3].spr.slice(1).map((p) => p[1]), 'D1!=0: arms 1 and 3 share theirs');
  assert.deepEqual(ARMS[0].spr.map((p) => p[0]), [0, 2, 4]);
  assert.deepEqual(ARMS[2].spr.map((p) => p[0]), [1, 3, 4], 'D0 shifts 0,2 -> 1,3');
  assert.equal(ARMS[0].tx[0], 9);
  assert.equal(ARMS[2].tx[0], 0x0a, 'and 9 -> $A');
  // Bank 4 is installed by all four arms and never shifts.
  for (const a of ARMS) assert.equal(a.spr[2][0], 4, 'bank 4 is the shared one');
});

test('W274 both arm tests are on WORDS, so a high half never selects an arm',
  { skip: SKIP }, () => {
    // $241688 tst.w D0 and $24168E cmpi.w #$0,D1.
    const f = world();
    assert.equal(paletteSet241688(f.ram, f.palette, ROM, 0x10000, 0x20000), 0,
      'both high halves set, both low halves zero -> arm 0');
    const g = world();
    assert.equal(paletteSet241688(g.ram, g.palette, ROM, 0x10001, 0x20001), 3);
  });

test('W274 every bank the four arms name is inside the installers\' own bounds',
  { skip: SKIP }, () => {
    // The two installers throw by address rather than clamping, so an arm naming a
    // bank past the staging area would be a loud failure at run time. Pin it here.
    for (const a of ARMS) {
      for (const [bank] of a.spr) {
        assert.ok(bank >= 0 && bank < SPR_BANKS, `sprite bank ${bank} < ${SPR_BANKS}`);
      }
      assert.ok(a.tx[0] >= 0 && a.tx[0] < TX_BANKS,
        `TX bank ${a.tx[0]} < ${TX_BANKS} -- bank ${TX_BANKS} would land ON $80FA66`);
    }
  });

test('W274 the twelve source blocks all resolve, and the windows abut their neighbours',
  { skip: SKIP }, () => {
    const seen = new Set();
    for (const a of ARMS) {
      for (const [, src] of a.spr) { assert.doesNotThrow(() => ROM.bytes(src, 64)); seen.add(src); }
      assert.doesNotThrow(() => ROM.bytes(a.tx[1], 32));
      seen.add(a.tx[1]);
    }
    assert.equal(seen.size, 12, 'twelve distinct blocks across the four arms');
    // The extents are not guesses: both windows end exactly where an existing one
    // begins, which is what pins them.
    assert.equal(0x222878 + 0x200, 0x222a78, 'the sprite window abuts W91\'s');
    assert.equal(0x222758 + 0x20, 0x222778, 'the text window abuts its neighbour');
    assert.equal(0x222638 + 0xc0, 0x2226f8, 'and starts where $222638\'s ends');
  });

// ============================================ 2. `$2600D8` NOW HAS ONE GAP LEFT

test('W274 $2600D8 installs the palette set and counts only $23C668', { skip: SKIP }, () => {
  const f = world();
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81fa00);
  f.ram.setU8(TALLY.side0 + TALLY.row, 0);
  tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
  assert.equal(f.ram.u16(PALSTAGE.spr.dirty), 1, 'the sprite banks went in');
  assert.equal(f.ram.u16(PALSTAGE.tx.dirty), 1, 'and the text bank');
  const addrs = f.log.report().map((r) => r.replace(/^\s*\d+ x (\$[0-9A-F]+) .*$/s, '$1'));
  assert.deepEqual(addrs, ['$23C668'], '$241688 is no longer counted');
});

test('W274 $2600D8 picks the arm from the RECORD\'s row byte, not from D2',
  { skip: SKIP }, () => {
    // $260154 moveq #0,D0 / move.b ($17,A6),D0 then $241688 tst.w D0. Side 1 with a
    // row byte of 0 must install banks 0/2/4 and TEXT 9, i.e. arm 0 or 1.
    const f = world();
    f.ram.setU32(TALLY.side1 + TALLY.ptr, 0x81fb00);
    f.ram.setU8(TALLY.side1 + TALLY.row, 0);
    tally2600D8(f.ram, ROM, f.ctx, 0, 0, 1);
    const b9 = PALSTAGE.tx.stage + 9 * 32;
    const bA = PALSTAGE.tx.stage + 0x0a * 32;
    let nine = false; let ten = false;
    for (let w = 0; w < 16; w++) {
      if (f.ram.u16(b9 + w * 2) !== 0) nine = true;
      if (f.ram.u16(bA + w * 2) !== 0) ten = true;
    }
    assert.ok(nine, 'TEXT bank 9 was written -- a D0-from-the-record arm');
    assert.ok(!ten, 'and bank $A was not');
  });

test('W274 a NON-ZERO row byte takes the other pair of banks', { skip: SKIP }, () => {
  const f = world();
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81fc00);
  f.ram.setU8(TALLY.side0 + TALLY.row, 1);
  tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
  const bA = PALSTAGE.tx.stage + 0x0a * 32;
  let ten = false;
  for (let w = 0; w < 16; w++) if (f.ram.u16(bA + w * 2) !== 0) ten = true;
  assert.ok(ten, 'row byte 1 -> TEXT bank $A');
});

test('W274 no palette in ctx skips the install rather than counting it', { skip: SKIP }, () => {
  // The convention every other palette caller in the port uses.
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  ram.setU32(TALLY.side0 + TALLY.ptr, 0x81fd00);
  tally2600D8(ram, ROM, { ram, rom: ROM, unportedLog: log, notes: log }, 0, 0, 0);
  assert.equal(ram.u16(PALSTAGE.spr.dirty), 0, 'nothing installed');
  const addrs = log.report().map((r) => r.replace(/^\s*\d+ x (\$[0-9A-F]+) .*$/s, '$1'));
  assert.deepEqual(addrs, ['$23C668'], 'and $241688 is not counted either');
});

// ===================================================== 3. THE CLAIM AUDIT
//
// The generalisation. `codexref`'s six encodings, reimplemented here so the check
// runs in the suite and not only when someone remembers to invoke a python tool.

function codeRefs(target) {
  const hits = [];
  const u16 = (o) => (IMG[o] << 8) | IMG[o + 1];
  const s16 = (o) => (u16(o) << 16) >> 16;
  const s8 = (o) => (IMG[o] << 24) >> 24;
  const u32 = (o) => ((u16(o) << 16) | u16(o + 2)) >>> 0;
  for (let o = BUILD_B.lo; o + 6 <= Math.min(BUILD_B.hi, IMG.length); o += 2) {
    const w = u16(o);
    const pc = o;                       // offset IS the address
    if (w === 0x4eb9 || w === 0x4ef9 || (w & 0xf1ff) === 0x41f9) {
      if (u32(o + 2) === target) hits.push({ at: pc, how: 'abs.l' });
    } else if (w === 0x6100 || w === 0x6000 || w === 0x4eba || w === 0x4efa
      || (w & 0xf1ff) === 0x41fa) {
      if (pc + 2 + s16(o + 2) === target) hits.push({ at: pc, how: '(d16,PC)' });
    } else if ((w & 0xff00) === 0x6100 || (w & 0xff00) === 0x6000) {
      const d = w & 0xff;
      if (d !== 0 && d !== 0xff && pc + 2 + s8(o + 1) === target) {
        hits.push({ at: pc, how: 'bsr.s/bra.s' });
      }
    }
  }
  return hits;
}

test('W274 the bank-9 installer EXISTS, which is the claim palette.js got wrong',
  { skip: HAVE_IMG ? false : 'decrypted image absent' }, () => {
    const hits = codeRefs(0x2226f8);
    assert.equal(hits.length, 1, 'exactly one reference to $2226F8 in the whole image');
    assert.equal(hits[0].at, 0x2416c0, '$2416C0 lea $2226F8,A0 -- arm 0 of $241688');
    assert.equal(hits[0].how, 'abs.l',
      'and it is ABSOLUTE LONG: absxref.py missed it because it scans for MAIN RAM '
      + 'targets only, not because the reference is PC-relative');
  });

test('W274 every OTHER no-caller claim left in src/ still holds',
  { skip: HAVE_IMG ? false : 'decrypted image absent' }, () => {
    // Re-checked against the image so none of these can rot. Each entry is a claim
    // some file makes in its own words; the number is how many code references the
    // image really has.
    const CLAIMS = [
      { addr: 0x261138, want: 0, why: 'background.js: "$261138 (freeze ON) has no caller at all"' },
      { addr: 0x28e7b6, want: 0, why: 'stageend.js: "$28E7B6 has no caller in the image"' },
      { addr: 0x294370, want: 0, why: 'boss.js: nothing transfers to $294370' },
    ];
    for (const c of CLAIMS) {
      assert.equal(codeRefs(c.addr).length, c.want, c.why);
    }
    // boss.js's OTHER half: $294377 has exactly one reference and it is inside the
    // ASCII credits, which is why the file calls it not a caller. Both halves matter.
    const credits = codeRefs(0x294377);
    assert.equal(credits.length, 1, 'boss.js: exactly ONE transfer lands in $294377');
    assert.equal(credits[0].at, 0x292322, 'and it is $292322, inside "Toshiaki Tomizawa"');
  });

test('W274 type5.js\'s claim about $24C8BE is true AS WORDED, and would mislead if '
  + 'reworded', { skip: HAVE_IMG ? false : 'decrypted image absent' }, () => {
  // "has no absolute-long caller (checked: it is reached PC-relative from inside
  // $24C096)". Three callers, all bsr.w, all inside $24C096 -- so the sentence is
  // right and the routine is reached every frame. This is the shape of claim that
  // the missing scan makes dangerous: precise, true, and easy to read as "uncalled".
  const hits = codeRefs(0x24c8be);
  assert.equal(hits.length, 3, 'three callers');
  for (const h of hits) {
    assert.equal(h.how, '(d16,PC)', `$${h.at.toString(16).toUpperCase()} is bsr.w`);
    assert.ok(h.at >= 0x24c096 && h.at < 0x24d000, 'and inside $24C096');
  }
});
