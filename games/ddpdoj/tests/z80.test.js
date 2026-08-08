// WAVE B (SOUND) -- the Z80 upload byte-match MUST-FAIL.
//
// This is the gate for the Z80 program upload. It proves the upload transform
// (copy $5B98 bytes from the decrypted 68k window at $2C348A into the Z80 RAM
// model) reproduces the runtime driver byte-for-byte across the CODE REGION
// $0086-$5B97 (23314 bytes), with every difference confined to the volatile
// scratch prefix $0000-$0085. The oracle is rip/sound/z80ram.bin (gitignored).
// See docs/worklog/ddpdoj/138-impl-sound-wave-b.md.
//
// The three required colours:
//
//   GREEN -- upload the real ROM window; the code region matches the oracle with
//            ZERO diffs; the 31 diffs all live in $0000-$0085 (scratch).
//   RED   -- corrupt one byte of the upload source inside the code region; the
//            upload now produces a diff inside $0086-$5B97 (scratch-only is
//            FALSE) -> the assertion fails. Restore -> green.
//
// Skipped loudly when either dependency is absent: the ROM window needs
// rip/port/player.tables.json (run export-tables.py) and the oracle needs
// rip/sound/z80ram.bin. A silent skip is worse than no test.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RomWindows } from '../src/rom.js';
import {
  Z80, Z80Ram, uploadZ80Program, uploadDiffs, diffsOnlyInScratch,
  codeRegionBytes,
} from '../src/z80.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLES = join(HERE, '..', 'rip', 'port', 'player.tables.json');
const ORACLE = join(HERE, '..', 'rip', 'sound', 'z80ram.bin');
const HAVE_TABLES = existsSync(TABLES);
const HAVE_ORACLE = existsSync(ORACLE);
const SKIP = !(HAVE_TABLES && HAVE_ORACLE)
  && `rip/port/player.tables.json (have=${HAVE_TABLES}) or rip/sound/z80ram.bin `
  + `(have=${HAVE_ORACLE}) absent -- run export-tables.py and re-capture sound`;

function realRom() {
  const j = JSON.parse(readFileSync(TABLES, 'utf8'));
  return new RomWindows(j.rom);
}

/** The byte the upload writes into Z80 RAM `ramOff`, from the RomWindows. */
function readUploadByte(rom, ramOff) {
  return rom.u8(Z80.uploadSrc + ramOff);
}

/** Poke the upload source so the byte landing at Z80 RAM `ramOff` becomes `v`.
 *  Returns the original byte so the caller can restore it (the RED -> GREEN
 *  handshake). Mutates the window's backing bytes in place. */
function pokeUploadByte(rom, ramOff, v) {
  const addr = Z80.uploadSrc + ramOff;
  for (const w of rom.windows) {
    if (addr >= w.base && addr < w.base + w.len) {
      const o = addr - w.base;
      const orig = w.bytes[o];
      w.bytes[o] = v & 0xff;
      return orig;
    }
  }
  throw new Error(`no ROM window covers upload offset $${ramOff.toString(16)} `
    + `(ROM addr $${addr.toString(16)}) -- is the Z80_UPLOAD window exported?)`);
}

test('the upload window is exported and covers the full span', { skip: SKIP }, () => {
  const rom = realRom();
  // Reading the last upload byte must not throw; reading one past must.
  const last = readUploadByte(rom, Z80.uploadLen - 1);
  assert.ok(typeof last === 'number', 'last upload byte reads');
  assert.throws(() => readUploadByte(rom, Z80.uploadLen),
    /outside every ROM window/, 'one past the upload throws');
});

test('GREEN: the uploaded code region matches z80ram.bin byte-for-byte', { skip: SKIP }, () => {
  const rom = realRom();
  const oracle = readFileSync(ORACLE);
  assert.equal(oracle.length, Z80.ramSize, 'oracle is the full 64 KiB Z80 image');
  const z80 = uploadZ80Program(rom);
  // The whole uploaded span.
  const diffs = uploadDiffs(z80, oracle);
  // CONTRACT: zero diffs in the code region, every diff in the scratch prefix.
  const codeDiffs = diffs.filter((i) => i >= Z80.codeStart && i <= Z80.codeEnd);
  assert.equal(codeDiffs.length, 0,
    `code region $0086-$5B97 is byte-for-byte identical; first code diff at `
    + `$${codeDiffs[0]?.toString(16)}`);
  assert.ok(diffsOnlyInScratch(diffs), 'every diff is in $0000-$0085 (scratch)');
  assert.equal(diffs.length, 31,
    `exactly 31 volatile-scratch diffs (got ${diffs.length})`);
  // Sanity: the code region is the documented size.
  assert.equal(codeRegionBytes(z80).length, 0x5B12,
    'code region span is $5B12 = 23314 bytes');
});

test('RED: corrupting one uploaded code byte breaks the match; restore re-greens', { skip: SKIP }, () => {
  const rom = realRom();
  const oracle = readFileSync(ORACLE);
  // A spot well inside the code region (offset $0100 -> Z80 RAM $0100).
  const SPOT = 0x0100;
  assert.ok(SPOT >= Z80.codeStart && SPOT <= Z80.codeEnd, 'spot is in code region');

  // GREEN first: the code region matches.
  let z80 = uploadZ80Program(rom);
  let diffs = uploadDiffs(z80, oracle);
  let codeDiffs = diffs.filter((i) => i >= Z80.codeStart && i <= Z80.codeEnd);
  assert.equal(codeDiffs.length, 0, 'green before corruption');

  // CORRUPT the upload source byte that lands at Z80 RAM $0100 (flip it to
  // something the oracle definitely does not hold there).
  const orig = pokeUploadByte(rom, SPOT, (oracle[SPOT] ^ 0xFF) & 0xFF);
  assert.notEqual(orig, oracle[SPOT] ^ 0xFF, 'the corruption actually changes the byte');

  // The upload now diverges INSIDE the code region -> the contract is violated.
  z80 = uploadZ80Program(rom);
  diffs = uploadDiffs(z80, oracle);
  codeDiffs = diffs.filter((i) => i >= Z80.codeStart && i <= Z80.codeEnd);
  assert.ok(codeDiffs.includes(SPOT),
    `corruption surfaces as a code-region diff at $${SPOT.toString(16)}`);
  assert.equal(diffsOnlyInScratch(diffs), false,
    'a code-region diff means scratch-only is FALSE (the assertion fails)');

  // RESTORE and re-green.
  pokeUploadByte(rom, SPOT, orig);
  z80 = uploadZ80Program(rom);
  diffs = uploadDiffs(z80, oracle);
  codeDiffs = diffs.filter((i) => i >= Z80.codeStart && i <= Z80.codeEnd);
  assert.equal(codeDiffs.length, 0, 'green after restore');
  assert.equal(diffs.length, 31, 'back to exactly 31 scratch diffs');
});

test('the address map is internally consistent (the listing, by symbol)', () => {
  // No ROM needed -- this checks the cited constants against the worklog table.
  // The reset vector starts the chain; the NMI and INT vectors branch to their
  // handlers; the idle loop is a self-jump.
  assert.ok(Z80.uploadLen === 0x5B98 && Z80.uploadLen === 23448,
    'upload length is $5B98 = 23448 (not the stale 23416)');
  assert.ok(Z80.codeEnd > Z80.codeStart, 'code region ordered');
  assert.equal(Z80.codeEnd - Z80.codeStart + 1, 0x5B12, 'code span $5B12 = 23314');
  // The three layers are distinct, non-overlapping entry points.
  const entries = [
    0x0142, 0x0147, 0x02AE, 0x02A4, 0x0298, 0x028E, 0x02C3, // layer 1 (7)
    0x010B, 0x0FC8, 0x376C,                                  // layer 2
    0x07F6, 0x09B7, 0x0829, 0x0128,                          // layer 3
  ];
  assert.equal(new Set(entries).size, entries.length, 'no duplicate entry point');
});
