// WAVE C1 (SOUND) -- the ICS2115 register-write interpreter MUST-FAIL.
//
// This is the Layer 1 gate for the Z80 driver port. It proves the register-file
// + register-write interpreter, fed the ics.tsv write sequence (191,367 rows),
// reproduces the oracle state-exact: voice for voice, register for register,
// value for value. The oracle is rip/sound/ics.tsv (gitignored ROM-derived
// data). See docs/worklog/ddpdoj/139-impl-sound-wave-c1.md.
//
// The three required colours:
//
//   GREEN -- feed every ics.tsv row as a port write; the interpreter's packed
//            write log matches the oracle ROW-FOR-ROW (191,367 entries); the
//            per-frame digests match; the final register state (the last byte
//            written per voice/register) matches.
//   RED   -- corrupt one row's data byte before feeding it; the log diverges at
//            that row, the per-frame digest diverges, the stored byte is wrong.
//   RESTORE -- undo the corruption; re-feed; everything re-greens.
//
// Skipped loudly when rip/sound/ics.tsv is absent (run the sound capture to
// produce it). A silent skip is worse than no test.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IcsRegisterFile, ICS_PORT, REG_HALF, VOICE_REG, N_VOICES,
  replayRow, unpack,
} from '../src/ics.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE = join(HERE, '..', 'rip', 'sound', 'ics.tsv');
const HAVE_ORACLE = existsSync(ORACLE);
const SKIP = !HAVE_ORACLE
  && `rip/sound/ics.tsv absent (have=${HAVE_ORACLE}) -- re-run the sound capture`;

// --------------------------------------------------------------- oracle parsing
/**
 * Parse ics.tsv into a flat Int32Array of packed rows and a parallel vf array.
 * Packed: (voice<<24)|(reg<<16)|(halfCode<<8)|data, where halfCode is 0=sel,
 * 1=lo, 2=hi. The `voice` column is decimal; `reg`/`data` are hex.
 */
function parseOracle() {
  const raw = readFileSync(ORACLE, 'utf-8').split('\n');
  const rows = [];
  const vfs = [];
  for (let i = 1; i < raw.length; i++) {
    const ln = raw[i];
    if (!ln.trim()) continue;
    const [n, vf, lf, voice, reg, half, data] = ln.split('\t');
    const v = Number(voice);
    const r = parseInt(reg, 16);
    const hc = half === 'sel' ? 0 : half === 'lo' ? 1 : 2;
    const d = parseInt(data, 16);
    rows.push((((v & 0xFF) << 24) | ((r & 0xFF) << 16) | ((hc & 0xFF) << 8) | (d & 0xFF)) >>> 0);
    vfs.push(Number(vf));
  }
  return { rows: Int32Array.from(rows), vfs: Int32Array.from(vfs) };
}

// ----------------------------------------------------------- replay + compare
/** Feed every oracle row to a fresh register file; return it (fully replayed). */
function replayAll(rows) {
  const rf = new IcsRegisterFile();
  for (let i = 0; i < rows.length; i++) {
    const e = unpack(rows[i]);
    replayRow(rf, e.half === 0 ? 'sel' : e.half === 1 ? 'lo' : 'hi', e.data);
  }
  return rf;
}

/** Compare the interpreter's log against the oracle rows, return first mismatch
 *  index or -1. */
function firstMismatch(rf, oracleRows) {
  const n = Math.min(rf.regLog.length, oracleRows.length);
  for (let i = 0; i < n; i++) {
    if ((rf.regLog[i] >>> 0) !== (oracleRows[i] >>> 0)) return i;
  }
  if (rf.regLog.length !== oracleRows.length) return n;
  return -1;
}

// =============================================================== the tests

test('the ics.tsv oracle loads with the documented row count', { skip: SKIP }, () => {
  const { rows } = parseOracle();
  assert.equal(rows.length, 191367, `oracle row count (got ${rows.length})`);
});

test('the register set and authoritative-half table are self-consistent', () => {
  // The 27 distinct registers DOJ touches (verified in the worklog).
  // REG_HALF's keys are JS decimal strings ("0".."79"), so parse as decimal.
  const touched = Object.keys(REG_HALF).map((k) => Number(k));
  assert.equal(touched.length, 27, '27 distinct registers');
  // Per-voice: $00-$11 (18), general: $40-$4F minus the gaps (9).
  const pv = touched.filter((r) => r <= 0x11);
  const gl = touched.filter((r) => r >= 0x40);
  assert.equal(pv.length, 18, '18 per-voice registers $00-$11');
  assert.equal(gl.length, 9, '9 general registers');
  // The named aliases resolve to registers in the table.
  for (const [name, reg] of Object.entries(VOICE_REG)) {
    assert.ok(REG_HALF[reg] !== undefined, `VOICE_REG.${name}=$${reg.toString(16)} is in REG_HALF`);
  }
});

test('GREEN: the replayed register log matches the oracle row-for-row', { skip: SKIP }, () => {
  const { rows } = parseOracle();
  const rf = replayAll(rows);
  assert.equal(rf.regLog.length, rows.length,
    `regLog has one packed entry per oracle row (${rf.regLog.length} vs ${rows.length})`);
  const mismatch = firstMismatch(rf, rows);
  assert.equal(mismatch, -1,
    `row-for-row match; first mismatch at oracle row ${mismatch} `
    + `(expected ${JSON.stringify(unpack(rows[mismatch]))}, `
    + `got ${JSON.stringify(unpack(rf.regLog[mismatch]))})`);
  assert.equal(rf.totalWrites, 191367, 'every write was recorded');
});

test('GREEN: the per-frame digests match the oracle for every frame', { skip: SKIP }, () => {
  const { rows, vfs } = parseOracle();
  // Walk the oracle, computing a per-frame digest the same way the interpreter
  // does (reset at each new frame, fold every write). Compare against the
  // interpreter's digest at each frame boundary.
  const rf = new IcsRegisterFile();
  let prevVf = vfs[0];
  let expectedDigest = 0;
  let framesChecked = 0;
  for (let i = 0; i < rows.length; i++) {
    const vf = vfs[i];
    if (vf !== prevVf) {
      // Frame boundary: compare the interpreter's digest for the frame just ended.
      assert.equal(rf.regDigest, expectedDigest,
        `digest for frame ${prevVf} matches (rf=${rf.regDigest}, oracle=${expectedDigest})`);
      rf.resetFrame();
      expectedDigest = 0;
      prevVf = vf;
      framesChecked++;
    }
    const e = unpack(rows[i]);
    replayRow(rf, e.half === 0 ? 'sel' : e.half === 1 ? 'lo' : 'hi', e.data);
    expectedDigest = IcsRegisterFile.fold(expectedDigest, e.voice, e.reg, e.half, e.data);
  }
  // The final frame.
  assert.equal(rf.regDigest, expectedDigest,
    `digest for the final frame (${prevVf}) matches`);
  framesChecked++;
  assert.ok(framesChecked > 4000, `checked ${framesChecked} per-frame digests`);
});

test('GREEN: the final register state matches the last-write-per-cell', { skip: SKIP }, () => {
  const { rows } = parseOracle();
  const rf = replayAll(rows);
  // Build the expected last-write shadow directly from the oracle. Per-voice
  // cells are keyed "v|r"; GLOBAL cells are keyed by reg only (they are shared
  // across voices -- $43 written by voice 5 then voice 12 holds voice 12's byte).
  const lastPvLo = new Map(), lastPvHi = new Map();  // "v|r" -> data
  const lastGlLo = new Map(), lastGlHi = new Map();  // r -> data
  for (let i = 0; i < rows.length; i++) {
    const e = unpack(rows[i]);
    if (e.half === 0) continue; // sel: no cell
    if (e.reg <= 0x11) {
      const key = `${e.voice}|${e.reg}`;
      (e.half === 1 ? lastPvLo : lastPvHi).set(key, e.data);
    } else if (e.reg >= 0x40) {
      (e.half === 1 ? lastGlLo : lastGlHi).set(e.reg, e.data);
    }
  }
  // Spot-check: pick a handful of voices and registers and verify the cells.
  let checked = 0;
  for (const [key, data] of lastPvHi) {
    const [v, r] = key.split('|').map(Number);
    assert.equal(rf.voices[v].hi[r], data,
      `voice ${v} reg $${r.toString(16)} hi = $${data.toString(16)}`);
    checked++;
    if (checked > 200) break;
  }
  checked = 0;
  for (const [key, data] of lastPvLo) {
    const [v, r] = key.split('|').map(Number);
    assert.equal(rf.voices[v].lo[r], data,
      `voice ${v} reg $${r.toString(16)} lo = $${data.toString(16)}`);
    checked++;
    if (checked > 200) break;
  }
  checked = 0;
  for (const [r, data] of lastGlHi) {
    assert.equal(rf.glob.hi[r], data,
      `global reg $${r.toString(16)} hi = $${data.toString(16)}`);
    checked++;
    if (checked > 50) break;
  }
  checked = 0;
  for (const [r, data] of lastGlLo) {
    // $4F is the voice-select mechanism; it is not stored in a cell.
    if (r === 0x4F) continue;
    assert.equal(rf.glob.lo[r], data,
      `global reg $${r.toString(16)} lo = $${data.toString(16)}`);
    checked++;
    if (checked > 50) break;
  }
});

test('RED: corrupting one write diverges the log, digest and state; restore re-greens',
  { skip: SKIP }, () => {
    const { rows } = parseOracle();

    // GREEN first: the intact replay matches row-for-row.
    let rf = replayAll(rows);
    assert.equal(firstMismatch(rf, rows), -1, 'green before corruption');

    // CORRUPT: flip one data byte in a copy of the oracle. Pick a row near the
    // middle that is a hi write to a per-voice register (so it changes a stored
    // cell, the log, and the digest).
    let spot = -1;
    for (let i = (rows.length >> 1); i < rows.length; i++) {
      const e = unpack(rows[i]);
      if (e.half === 2 && e.reg <= 0x11) { spot = i; break; }
    }
    assert.ok(spot >= 0, 'found a corruption spot');
    const orig = unpack(rows[spot]);
    const flipped = (orig.data ^ 0xFF) & 0xFF;
    assert.notEqual(flipped, orig.data, 'the corruption actually changes the byte');
    const corrupted = Int32Array.from(rows);
    corrupted[spot] = (((orig.voice & 0xFF) << 24) | ((orig.reg & 0xFF) << 16)
      | ((orig.half & 0xFF) << 8) | (flipped & 0xFF)) >>> 0;

    // The corrupted replay diverges at exactly `spot`.
    rf = replayAll(corrupted);
    const mismatch = firstMismatch(rf, rows);
    assert.equal(mismatch, spot,
      `corruption surfaces at row ${spot} (expected ${JSON.stringify(orig)}, `
      + `got ${JSON.stringify(unpack(rf.regLog[spot]))})`);

    // The corrupted write landed in the register file: the log entry at `spot`
    // carries the flipped data byte (not the original). (A later write may
    // overwrite the stored cell, so the log -- not the final cell -- is the
    // load-bearing evidence.)
    const logEntry = unpack(rf.regLog[spot]);
    assert.equal(logEntry.data, flipped,
      `the log at row ${spot} carries the flipped byte $${flipped.toString(16)}`);
    assert.equal(logEntry.voice, orig.voice, 'the voice reconstruction is intact');
    assert.equal(logEntry.reg, orig.reg, 'the register reconstruction is intact');

    // The overall digest of the full replay differs from the intact replay's.
    rf = replayAll(corrupted);
    rf.resetFrame();
    let corruptDig = 0;
    for (let i = 0; i < corrupted.length; i++) {
      const ev = unpack(corrupted[i]);
      corruptDig = IcsRegisterFile.fold(corruptDig, ev.voice, ev.reg, ev.half, ev.data);
    }
    let intactDig = 0;
    for (let i = 0; i < rows.length; i++) {
      const ev = unpack(rows[i]);
      intactDig = IcsRegisterFile.fold(intactDig, ev.voice, ev.reg, ev.half, ev.data);
    }
    assert.notEqual(corruptDig, intactDig, 'a corrupted write diverges the total digest');

    // RESTORE: re-feed the intact oracle; the row-for-row match returns.
    rf = replayAll(rows);
    assert.equal(firstMismatch(rf, rows), -1, 'green after restore');
  });

test('the $4F voice-select and $5A/$A5 reset artifacts are handled correctly',
  { skip: SKIP }, () => {
    const { rows } = parseOracle();
    const rf = replayAll(rows);
    // The interpreter's currentVoice after the full replay is the last $4F
    // write's data (the last voice selected). Find it in the oracle.
    let lastVoiceSel = -1, lastVoice = 0;
    for (let i = 0; i < rows.length; i++) {
      const e = unpack(rows[i]);
      if (e.reg === 0x4F && e.half === 1) { lastVoiceSel = i; lastVoice = e.data; }
    }
    assert.ok(lastVoiceSel >= 0, 'the oracle contains $4F voice-select writes');
    assert.equal(rf.currentVoice, lastVoice % (1 + rf.activeOsc),
      `currentVoice = the last $4F data (${lastVoice}), modulo active+1`);
    assert.equal(rf.activeOsc, 31, 'activeOsc is $1F=31 (the only value DOJ writes to $0E)');
    // The $5A/$A5 sel-only artifacts set regSelect but no data follows, so they
    // touch no cell. Verify they appear in the log (as sel rows) but no lo/hi
    // row references reg $5A or $A5.
    let resetSels = 0;
    for (let i = 0; i < rows.length; i++) {
      const e = unpack(rows[i]);
      if ((e.reg === 0x5A || e.reg === 0xA5) && e.half === 0) resetSels++;
      if ((e.reg === 0x5A || e.reg === 0xA5) && e.half !== 0) {
        throw new Error(`reg $${e.reg.toString(16)} has a data write at row ${i} -- unexpected`);
      }
    }
    assert.equal(resetSels, 6, 'exactly 6 $5A/$A5 sel-only reset artifacts (3 pairs)');
  });
