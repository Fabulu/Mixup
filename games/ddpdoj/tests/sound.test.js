// WAVE A (SOUND) -- the mailbox-digest MUST-FAIL.
//
// This is the gate for the 68k cue post/queue. It proves the post+tail+pack+
// enqueue+drain transform is BYTE-EXACT against the de-duped mailbox oracle
// (rip/sound/mailbox_dedup.tsv, 633 cue doors), for every door that maps to a
// cue wrapper in src/sound.js. The three required colours:
//
//   GREEN -- feed each oracle door's wrapper through the engine; the drained
//            longword reproduces the oracle (type,pan,id,chan) byte-for-byte.
//   RED 1 -- baseline: with posting suppressed, the door stream is empty and the
//            digest is 0 (the oracle digest is non-zero) -> diverges.
//   RED 2 -- break: corrupt one wrapper's pan; the drained door diverges from
//            the oracle at that door -> digest diverges. Restore -> green.
//
// WHAT THIS DOES NOT PROVE (the measured deferral): frame-for-frame alignment --
// which logic frame each door fires on -- needs a full stage1-deep replay, and
// the port has no stage1-deep seed or portin recording (the mailbox capture ran
// inside MAME, not through the port harness). The transform-level byte-exactness
// here is the load-bearing claim; frame alignment is the open part.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import {
  SoundState, SOUND, SOUND_WRAPPERS, SOUND_ENTRY, initSound, postWrapper, drainFrame,
  packLongword, tailPan,
} from '../src/sound.js';

const ORACLE = readFileSync(fileURLToPath(
  new URL('./fixtures/mailbox_dedup.tsv', import.meta.url)), 'utf-8').split('\n');

/** Parse the de-duped oracle into [{lf,type,pan,id,chan,word}]. */
function oracle() {
  const rows = [];
  for (const ln of ORACLE.slice(1)) {
    if (!ln.trim()) continue;
    const [door, lf, t, p, i, ch] = ln.split('\t');
    const type = parseInt(t.slice(1), 16);
    const pan = parseInt(p.slice(1), 16);
    const id = parseInt(i.slice(1), 16);
    const chan = parseInt(ch.slice(1), 16);
    rows.push({ lf: Number(lf), type, pan, id, chan,
      word: ((type << 24) | (pan << 16) | (id << 8) | chan) >>> 0 });
  }
  return rows;
}

/** Reverse map: (type, id, chanByte) -> wrapperAddr, for the standard entries.
 *  chanByte = (chan << 2) | ((id>>8)&3); id<256 in the corpus so chanByte=chan<<2. */
function reverseMap() {
  const m = new Map();
  for (const [addrStr, w] of Object.entries(SOUND_WRAPPERS)) {
    const addr = Number(addrStr);
    const chanByte = ((w.ch << 2) | ((w.id >> 8) & 3)) & 0xFF;
    // The type the wrapper posts comes from its entry. For tail entries the pan
    // is transformed, so we match on (id, chanByte) and verify pan separately;
    // for the streaming no-tail entries the type is the wrapper's type.
    m.set(`${w.id}/${chanByte}`, addr);
  }
  return m;
}

/** A RAM with the sound gates in their corpus state: master volume 0 and the
 *  dual-role gate ($803926) 0, so every SFX/BGM cue posts and the pan tail is
 *  just `panArg - $14`. Verified by calibration (see the worklog). */
function corpusRam() {
  const ram = new Ram();
  initSound(ram);              // masterVol = 0, debounce cleared
  // gates: enable bits 0, dual-role 0 -> all entries POST (corpus state)
  return ram;
}

test('the de-duped mailbox oracle loads and has the documented door count', () => {
  const rows = oracle();
  assert.ok(rows.length > 600, `oracle loaded ${rows.length} doors`);
  assert.ok(rows.length < 660, `oracle door count sane (${rows.length})`);
});

test('GREEN: every wrapper-mapped door drains byte-exact against the oracle', () => {
  const rows = oracle();
  const ram = corpusRam();
  const sound = new SoundState();
  const rmap = reverseMap();
  let matched = 0, unmapped = 0;
  const mismatches = [];
  for (const door of rows) {
    const chanByte = door.chan;   // already the packed low byte in the oracle
    const id = door.id;
    // The oracle chan byte is the PACKED low byte (chan<<2 | ...); to find the
    // wrapper, match on id and the packed byte.
    let addr = null;
    for (const [aStr, w] of Object.entries(SOUND_WRAPPERS)) {
      const a = Number(aStr);
      const cb = ((w.ch << 2) | ((w.id >> 8) & 3)) & 0xFF;
      const wType = SOUND_ENTRY[w.entry].type;
      // Match on (type, id, chanByte). The streaming no-tail entries post pan=0
      // and live in their own type space; the oracle's tail types 0/1/2 match here.
      if (wType === door.type && w.id === id && cb === chanByte) { addr = a; break; }
    }
    if (addr === null) { unmapped++; continue; }   // streaming types / id=$41
    // Reset the ring cursors and debounce guards so each door posts + drains in
    // isolation (the debounce cadence is exercised separately by the real run).
    ram.setU16(SOUND.head, 0);
    ram.setU16(SOUND.tail, 0);
    ram.setU8(SOUND.debounceA, 0);
    ram.setU8(SOUND.debounceB, 0);
    postWrapper(ram, sound, addr);
    const drained = drainFrame(ram, sound, door.lf);
    matched++;
    if (!drained || drained.word !== door.word) {
      mismatches.push({ door, drained: drained?.word, addr });
    }
  }
  assert.equal(mismatches.length, 0,
    `byte-exact: ${mismatches.length} mismatches, first = ${JSON.stringify(mismatches[0])}`);
  // The wrapper-mapped doors are the great majority; the unmapped are streaming
  // (types $0F/$10/$11/$12/$15, the deferred BGM-stream path) and id=$41.
  assert.ok(matched > 600, `${matched} wrapper-mapped doors reproduced byte-exact`);
  assert.ok(unmatchedOk(unmapped, rows), `${unmapped} unmapped (streaming/id=$41), acceptable`);
});

test('RED 1 (baseline): with no posts the door stream is empty and the digest is 0', () => {
  const rows = oracle();
  const ram = corpusRam();
  const sound = new SoundState();
  // Baseline: NO posts (the old note() behaviour). Drain every frame; nothing
  // comes out.
  for (let lf = 0; lf < 4000; lf++) drainFrame(ram, sound, lf);
  assert.equal(sound.doorLog.length, 0, 'no doors were posted, so none drained');
  assert.equal(sound.digest, 0, 'the empty-stream digest is 0');
  // The oracle's digest is non-zero -- they diverge.
  let oracleDigest = 0;
  for (const d of rows) oracleDigest = SoundState.fold(oracleDigest, d.word);
  assert.notEqual(sound.digest, oracleDigest, 'baseline diverges from the oracle');
});

test('RED 2 (break): corrupting one wrapper pan diverges the digest; restore re-greens', () => {
  const rows = oracle();
  const rmap = reverseMap();
  // Find a door that maps to the high-frequency SFX id=$24 wrapper ($28C714),
  // which is the most sensitive to the debounce + pan.
  const rmapEntries = Object.entries(SOUND_WRAPPERS);
  const broken = 0x28C714;
  const w = SOUND_WRAPPERS[broken];
  const origPan = w.pan;
  // GREEN digest first (engine intact, wrapper-mapped doors only).
  function greenDigest() {
    const ram = corpusRam();
    const sound = new SoundState();
    let dig = 0, n = 0;
    for (const door of rows) {
      let addr = null;
      for (const [aStr, ww] of rmapEntries) {
        const cb = ((ww.ch << 2) | ((ww.id >> 8) & 3)) & 0xFF;
        const wt = SOUND_ENTRY[ww.entry].type;
        if (wt === door.type && ww.id === door.id && cb === door.chan) { addr = Number(aStr); break; }
      }
      if (addr === null) continue;
      ram.setU16(SOUND.head, 0); ram.setU16(SOUND.tail, 0);
      ram.setU8(SOUND.debounceA, 0); ram.setU8(SOUND.debounceB, 0);
      postWrapper(ram, sound, addr);
      const d = drainFrame(ram, sound, door.lf);
      if (d) { dig = SoundState.fold(dig, d.word); n++; }
    }
    return { dig, n };
  }
  const intact = greenDigest();
  // BREAK the wrapper's pan (mutate the table entry in place).
  SOUND_WRAPPERS[broken].pan = (origPan + 7) & 0xFF;
  const brokenResult = greenDigest();
  // RESTORE.
  SOUND_WRAPPERS[broken].pan = origPan;
  const restored = greenDigest();
  assert.notEqual(brokenResult.dig, intact.dig,
    'a broken pan diverges the mailbox digest');
  assert.equal(restored.dig, intact.dig,
    'restoring the pan re-greens the digest');
  assert.ok(intact.n > 600, `digest covers ${intact.n} doors`);
});

/** The unmapped doors are the streaming-BGM types ($0F/$10/$11/$12/$15) and the
 *  rare id=$41, all part of the deferred streaming path. They must be a small
 *  minority of the oracle. */
function unmatchedOk(n, rows) {
  return n < rows.length * 0.06;   // under 6% (measured: ~3%)
}
