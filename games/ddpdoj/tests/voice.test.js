// WAVE C2 (SOUND) -- the Z80 voice engine MUST-FAIL (oracle emission contract).
//
// This is the Layer 2 gate for the Z80 driver port. It proves the ported voice
// engine (`src/voice.js`) emits the same register-write SEQUENCE the real Z80
// produces, verified against the `ics.tsv` oracle at three levels:
//   (1) the per-keyon invariant ($0D=03 then $10=00) holds for ALL 1620 keyons;
//   (2) the ported keyon handler reproduces a REAL keyon episode row-for-row;
//   (3) the ported per-tick refresh reproduces a REAL sustain frame's writes.
//
// The oracle is rip/sound/ics.tsv (gitignored ROM-derived data). See worklog
// 141. Skips loudly when the oracle is absent.
//
// SCOPE NOTE (worklog 141 section 0): Layer 2 alone cannot reproduce all
// 191,367 rows because the `$62EC` voice-state array is POPULATED BY Layer 3
// (the cue dispatch). This gate proves the engine's EMISSION CONTRACT against
// oracle slices; full end-to-end reproduction lands when Layer 3 feeds the
// engine. The three colours below are the honest bar for this wave.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IcsRegisterFile, ICS_PORT, N_VOICES, unpack } from '../src/ics.js';
import { VoiceEngine, VoiceSlot, ENGINE, STATE_HANDLER, STRIDE } from '../src/voice.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE = join(HERE, '..', 'rip', 'sound', 'ics.tsv');
const HAVE_ORACLE = existsSync(ORACLE);
const SKIP = !HAVE_ORACLE && `rip/sound/ics.tsv absent (have=${HAVE_ORACLE}) -- re-run the sound capture`;

// --------------------------------------------------------------- oracle parsing
/** Parse ics.tsv into packed rows (voice<<24|reg<<16|half<<8|data) + vf array. */
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
  return { rows, vfs };
}

/** Index of the first keyon (reg=$10 hi data=$00) data-write in the oracle. */
function keyonDataWrites(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const e = unpack(rows[i]);
    if (e.reg === 0x10 && e.half === 2 && e.data === 0x00) out.push(i);
  }
  return out;
}

/** Indices of every keyoff (reg=$10 hi data=$0F) data-write in the oracle. */
function keyoffDataWrites(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const e = unpack(rows[i]);
    if (e.reg === 0x10 && e.half === 2 && e.data === 0x0F) out.push(i);
  }
  return out;
}

/**
 * The 15-row keyoff episode for the keyoff at index `k`: from the `lo $4F` that
 * opened it through the closing `$00=00`. Walks back past the sel rows to the
 * `lo $4F`, forward through the `$00 hi` tail. Returns the packed rows.
 */
function keyoffEpisode(rows, k) {
  let start = k;
  while (start > 0 && !(unpack(rows[start]).reg === 0x4F && unpack(rows[start]).half === 1)) {
    start--;
  }
  // lo $4F is `start`; walk forward to the $00 hi=00 tail (the 15th row).
  let end = k;
  let j = k + 1;
  const voice = unpack(rows[k]).voice;
  while (j < rows.length) {
    const e = unpack(rows[j]);
    if (e.reg === 0x4F && e.half === 1) break;   // next episode's voice-select
    if (e.voice !== voice) break;
    end = j;
    if (e.reg === 0x00 && e.half === 2) break;    // the $00=00 tail closes it
    j++;
  }
  return rows.slice(start, end + 1).map((r) => r >>> 0);
}

/**
 * Reconstruct a VoiceSlot from a keyon episode's packed rows (the values the cue
 * deposited into $62EC, read back out of the ICS writes the engine emitted). The
 * episode runs from $4F/lo through $10=00 in the invariant keyon order. Reads the
 * 16-bit regs ($01/$0B/$0A/$03/$02/$05/$04/$09) and 8-bit hi regs ($11/$0C/$00)
 * by scanning the packed rows for each register.
 */
function slotFromEpisode(episode) {
  const slot = new VoiceSlot();
  const byReg = new Map();   // reg -> {lo, hi} (last data write per lane)
  for (const p of episode) {
    const e = unpack(p);
    if (e.half === 0) continue;   // sel: no data
    const cur = byReg.get(e.reg) || { lo: undefined, hi: undefined };
    if (e.half === 1) cur.lo = e.data; else cur.hi = e.data;
    byReg.set(e.reg, cur);
    if (e.reg === 0x4F && e.half === 1) slot.icsVoice = e.data;
  }
  const u16 = (r) => { const c = byReg.get(r); return c ? ((c.hi ?? 0) << 8) | (c.lo ?? 0) : 0; };
  const u8 = (r) => { const c = byReg.get(r); return c ? (c.hi ?? c.lo ?? 0) : 0; };
  slot.fc = u16(0x01);
  slot.saddr = u8(0x11);
  slot.r0B = u16(0x0B);
  slot.r0A = u16(0x0A);
  slot.oscStrtLo = u16(0x03);
  slot.oscStrt = u16(0x02);
  slot.oscEndLo = u16(0x05);
  slot.oscEnd = u16(0x04);
  slot.pan = u8(0x0C);
  slot.r09 = u16(0x09);
  slot.oscConf = u8(0x00);
  slot.hasLoop = byReg.has(0x02);    // $02 present => loop-start span emitted
  slot.hasPan = byReg.has(0x0C);
  slot.hasR09 = byReg.has(0x09);
  return slot;
}

// =============================================================== the tests

test('the voice engine addresses and switch table are self-consistent', () => {
  // The 4-state switch arms decode to distinct handler addresses.
  assert.equal(Object.keys(STATE_HANDLER).length, 4, '4 switch states');
  const handlers = Object.values(STATE_HANDLER);
  assert.equal(new Set(handlers).size, 4, '4 distinct handler addresses');
  // The voice-state array math: 32 voices x 19 bytes, spanning $62EC..$654B.
  const span = N_VOICES * STRIDE;
  assert.equal(STRIDE, 0x13, 'voice struct stride is 19 ($13)');
  assert.equal(ENGINE.voiceArray, 0x62EC, 'voice array base is $62EC');
  assert.equal(ENGINE.voiceArray + span, 0x654C, `array ends at $${(ENGINE.voiceArray + span).toString(16)} ($62EC + 32x19)`);
  // The ICS shadow follows: 32 x 10 at $654E.
  assert.equal(ENGINE.icsShadow, 0x654E, 'ICS shadow base is $654E');
  assert.equal(ENGINE.icsShadowStride, 0x0A, 'shadow stride is 10');
  // The engine entry + helpers are the cited addresses (decoded in the worklog).
  assert.equal(ENGINE.voiceEngine, 0x376C);
  assert.equal(ENGINE.acquire, 0x3E8F);
  assert.equal(ENGINE.mul16, 0x4243);
});

test('GREEN: the per-keyon invariant ($0D=03 then $10=00) holds for every keyon',
  { skip: SKIP }, () => {
    const { rows } = parseOracle();
    const keyons = keyonDataWrites(rows);
    assert.equal(keyons.length, 1620, `1620 keyons in the oracle (got ${keyons.length})`);
    // For each keyon data-write, walk back past any sel rows to the previous
    // DATA write; it must be reg=$0D hi data=$03.
    let violations = 0;
    let firstBad = null;
    for (const k of keyons) {
      let j = k - 1;
      while (j >= 0 && unpack(rows[j]).half === 0) j--;   // skip sels
      const e = unpack(rows[j]);
      if (!(e.reg === 0x0D && e.half === 2 && e.data === 0x03)) {
        violations++;
        if (firstBad === null) firstBad = { k, e };
      }
    }
    assert.equal(violations, 0,
      `every keyon preceded by $0D=03 (violations=${violations}, first=${JSON.stringify(firstBad)})`);
  });

test('GREEN/RED: emitKeyon reproduces a real keyon episode row-for-row; corrupt diverges; restore re-greens',
  { skip: SKIP }, () => {
    const { rows } = parseOracle();
    const keyons = keyonDataWrites(rows);
    // Find voice 8's first keyon, then walk back to its $4F/lo episode start.
    const k8 = keyons.find((k) => unpack(rows[k]).voice === 8);
    assert.ok(k8 > 0, 'found voice 8 keyon');
    let start = k8;
    while (start > 0) {
      start--;
      const e = unpack(rows[start]);
      if (e.reg === 0x4F && e.half === 1) break;   // the $4F/lo that began the setup
    }
    // The episode is rows [start..k8]: $4F/lo then every register write through $10=00.
    // The engine's emitKeyon first does selectVoice -> [sel$4F, lo$4F]; the sel$4F
    // is logged under the PREVIOUS currentVoice, so we compare from the lo$4F onward
    // (all subsequent writes are voice-attributed to the keyon voice, matching the oracle).
    const oracleEpisode = Array.from(rows.slice(start, k8 + 1), (r) => r >>> 0);
    assert.ok(oracleEpisode.length > 10, `episode has many writes (${oracleEpisode.length})`);

    // Reconstruct the VoiceSlot from the episode's own values (the values the cue
    // deposited into $62EC -- we read them back out of the ICS writes the engine
    // emitted, which is exactly what ics.tsv captures).
    const slot = slotFromEpisode(oracleEpisode);
    assert.equal(slot.icsVoice, 8, 'episode is for ICS voice 8');

    // GREEN: a fresh register file; emit the keyon; compare from lo$4F onward.
    let rf = new IcsRegisterFile();
    let eng = new VoiceEngine(rf);
    eng.emitKeyon(slot);
    // regLog[0] is the sel$4F (previous voice); regLog[1..] is lo$4F onward.
    const emitted = rf.regLog.slice(1).map((r) => r >>> 0);
    assert.equal(emitted.length, oracleEpisode.length,
      `emitted one write per oracle row (${emitted.length} vs ${oracleEpisode.length})`);
    let mismatch = -1;
    for (let i = 0; i < emitted.length; i++) {
      if (emitted[i] !== oracleEpisode[i]) { mismatch = i; break; }
    }
    assert.equal(mismatch, -1,
      `keyon episode row-for-row match (first mismatch at ${mismatch}: `
      + `oracle=${JSON.stringify(unpack(oracleEpisode[mismatch]))}, `
      + `got=${JSON.stringify(unpack(emitted[mismatch]))})`);

    // RED: corrupt the fc; the $01 lo/hi writes diverge from the oracle.
    const savedFc = slot.fc;
    slot.fc = 0xFFFF;                      // a value the oracle never emitted
    rf = new IcsRegisterFile();
    eng = new VoiceEngine(rf);
    eng.emitKeyon(slot);
    const corrupted = rf.regLog.slice(1).map((r) => r >>> 0);
    let corrMismatch = -1;
    for (let i = 0; i < corrupted.length; i++) {
      if (corrupted[i] !== oracleEpisode[i]) { corrMismatch = i; break; }
    }
    assert.ok(corrMismatch >= 0, 'a corrupted fc diverges the emitted sequence');
    const bad = unpack(corrupted[corrMismatch]);
    assert.ok(bad.reg === 0x01, `the divergence is at the $01 fc write (reg=$${bad.reg.toString(16)})`);

    // RESTORE: re-green.
    slot.fc = savedFc;
    rf = new IcsRegisterFile();
    eng = new VoiceEngine(rf);
    eng.emitKeyon(slot);
    const restored = rf.regLog.slice(1).map((r) => r >>> 0);
    let restMismatch = -1;
    for (let i = 0; i < restored.length; i++) {
      if (restored[i] !== oracleEpisode[i]) { restMismatch = i; break; }
    }
    assert.equal(restMismatch, -1, 'restore re-greens the keyon episode');
  });

test('GREEN/RED: the per-tick refresh reproduces a real sustain frame; corrupt diverges',
  { skip: SKIP }, () => {
    const { rows, vfs } = parseOracle();
    // Locate a steady-state frame (vf 4120): voices refreshed in index order with
    // a constant fc. Extract the (voice, fc) refresh pairs the engine must emit.
    const VF = 4120;
    const idxs = [];
    for (let i = 0; i < rows.length; i++) if (vfs[i] === VF) idxs.push(i);
    assert.ok(idxs.length > 10, `frame ${VF} is a sustain frame (${idxs.length} rows)`);
    // Walk the frame's writes: a refresh is [lo$4F=N, sel$01, lo$01, hi$01].
    const pairs = [];
    for (let i = 0; i < idxs.length; i++) {
      const e = unpack(rows[idxs[i]]);
      if (e.reg === 0x4F && e.half === 1) {           // lo$4F = voice select
        const voice = e.data;
        // the next three writes are sel$01, lo$01, hi$01
        const lo = unpack(rows[idxs[i + 2]]);
        const hi = unpack(rows[idxs[i + 3]]);
        assert.equal(lo.reg, 0x01, `after selecting voice ${voice}, next is $01`);
        pairs.push({ voice, fc: (hi.data << 8) | lo.data });
      }
    }
    assert.ok(pairs.length >= 3, `frame ${VF} refreshes ${pairs.length} voices`);

    // GREEN: seed the engine with the frame's voices + fcs; run one tick; verify.
    function buildEngine() {
      const rf = new IcsRegisterFile();
      const eng = new VoiceEngine(rf);
      for (const p of pairs) {
        const s = eng.voices[p.voice];
        s.state = ENGINE.STATE_SUSTAIN;
        s.icsVoice = p.voice;
        s.fc = p.fc;
      }
      return eng;
    }
    let eng = buildEngine();
    eng.tick();
    // Decode the emitted refreshes: find each lo$4F and read the following $01.
    const emitted = [];
    for (let i = 0; i < eng.rf.regLog.length; i++) {
      const e = unpack(eng.rf.regLog[i]);
      if (e.reg === 0x4F && e.half === 1) {
        const lo = unpack(eng.rf.regLog[i + 2]);
        const hi = unpack(eng.rf.regLog[i + 3]);
        emitted.push({ voice: e.data, fc: (hi.data << 8) | lo.data });
      }
    }
    assert.equal(emitted.length, pairs.length, `tick refreshed all ${pairs.length} voices`);
    for (let i = 0; i < pairs.length; i++) {
      assert.equal(emitted[i].voice, pairs[i].voice, `voice order preserved (${i})`);
      assert.equal(emitted[i].fc, pairs[i].fc,
        `voice ${pairs[i].voice} fc=$${pairs[i].fc.toString(16)} matches oracle`);
    }

    // RED: corrupt one voice's fc; its emitted $01 diverges.
    const target = pairs[0];
    const saved = eng.voices[target.voice].fc;
    eng.voices[target.voice].fc = (target.fc === 0xFFFF ? 0x0000 : 0xFFFF);
    eng.rf = new IcsRegisterFile();
    // rebuild a fresh engine to re-run cleanly with the corrupt value
    const eng2 = buildEngine();
    eng2.voices[target.voice].fc = (target.fc === 0xFFFF ? 0x0000 : 0xFFFF);
    eng2.tick();
    const emitted2 = [];
    for (let i = 0; i < eng2.rf.regLog.length; i++) {
      const e = unpack(eng2.rf.regLog[i]);
      if (e.reg === 0x4F && e.half === 1) {
        const lo = unpack(eng2.rf.regLog[i + 2]);
        const hi = unpack(eng2.rf.regLog[i + 3]);
        emitted2.push({ voice: e.data, fc: (hi.data << 8) | lo.data });
      }
    }
    const got = emitted2.find((p) => p.voice === target.voice);
    assert.notEqual(got.fc, target.fc, `corrupting voice ${target.voice} fc diverges its $01 write`);

    // RESTORE: re-green.
    eng2.voices[target.voice].fc = saved;
    eng2.rf = new IcsRegisterFile();
    eng2.tick();
    const emitted3 = [];
    for (let i = 0; i < eng2.rf.regLog.length; i++) {
      const e = unpack(eng2.rf.regLog[i]);
      if (e.reg === 0x4F && e.half === 1) {
        const lo = unpack(eng2.rf.regLog[i + 2]);
        const hi = unpack(eng2.rf.regLog[i + 3]);
        emitted3.push({ voice: e.data, fc: (hi.data << 8) | lo.data });
      }
    }
    const got3 = emitted3.find((p) => p.voice === target.voice);
    assert.equal(got3.fc, target.fc, 'restore re-greens the refresh');
  });

test('the ICS-voice allocator is round-robin and marks the shadow', () => {
  const rf = new IcsRegisterFile();
  const eng = new VoiceEngine(rf);
  // Fresh: all 32 shadow slots free (shadow[v][0]==0). allocStart seeds to 8.
  assert.equal(eng.allocStart, 8, 'allocator round-robin start seeds to 8 ($654D init)');
  const first = eng.acquireIcsVoice(0x55);
  assert.equal(first, 8, 'first acquire is the seeded start (voice 8)');
  assert.equal(eng.icsShadow[8][0], 0x55, 'the shadow slot is marked non-free');
  assert.equal(eng.allocStart, 9, 'round-robin advances past the acquired voice');
  // Subsequent acquires walk forward.
  const second = eng.acquireIcsVoice(0x66);
  assert.equal(second, 9);
  // A freed slot (shadow[0]==0) below the cursor is reused when the scan reaches it.
  // Free voice 0 and advance until the wrap picks it up.
  eng.icsShadow[0][0] = 0;
  // Force the cursor to 31 so the next acquire wraps (Z80 reseeds to 8 at 32, but a
  // free slot at 0..7 would be found only if the scan passes it; here we verify the
  // free-skip behaviour: voices 10..30 allocate in order.
  eng.allocStart = 10;
  for (let v = 10; v < 31; v++) {
    const got = eng.acquireIcsVoice(0x01);
    assert.equal(got, v, `voice ${v} acquired in round-robin order`);
  }
});

// =============================================================== the keyoff path
// Wave C5 (Sound) -- the keyoff emission + the $3F11 free + the oscillator-end
// trigger. See worklog 146. The same oracle (rip/sound/ics.tsv) gates the
// keyoff half of the emission contract: the 1720 keyoff episodes reproduce
// through the full chain (trigger -> $0A0C emission -> the 15-row write
// sequence). Skips loudly when the oracle is absent (the keyon tests' SKIP).

test('the keyoff path addresses and the shadow-free math are self-consistent', () => {
  // The keyoff emission, shadow-free, composite, and the two IRQ entries.
  assert.equal(ENGINE.emitKeyoff, 0x0A0C, '$0A0C is the keyoff emission');
  assert.equal(ENGINE.freeShadow, 0x3F11, '$3F11 frees the shadow slot');
  assert.equal(ENGINE.releaseBusy, 0x3F22, '$3F22 is the release-if-busy composite');
  assert.equal(ENGINE.irqEntry, 0x0FEA, '$0FEA is the oscillator-end IRQ entry');
  assert.equal(ENGINE.irqvDispatch, 0x1000, '$1000 is the $0F IRQV dispatch loop');
  assert.equal(ENGINE.irqvReg, 0x000F, '$0F is the IRQV register');
  assert.equal(ENGINE.oscIrqBit, 0x02, 'status bit1 is the oscillator-end IRQ');
  assert.equal(ENGINE.timerIrqBit, 0x01, 'status bit0 is the timer-0 tick');
  // The $3F11 math: voice * 10 + $654E (the mul16 stride + the shadow base).
  assert.equal(ENGINE.icsShadow + 8 * ENGINE.icsShadowStride, 0x654E + 80,
    '$3F11 indexes voice*10 + $654E (voice 8 -> $659E)');
});

test('GREEN: every keyoff episode is the fixed 15-row $0A0C sequence',
  { skip: SKIP }, () => {
    const { rows } = parseOracle();
    const keyoffs = keyoffDataWrites(rows);
    assert.equal(keyoffs.length, 1720, `1720 keyoffs in the oracle (got ${keyoffs.length})`);
    // The fixed (reg,half,data) pattern of the $0A0C emission, voice-wildcarded
    // (the $4F/lo data is the voice). 15 rows from lo$4F through $00=00.
    const PATTERN = [
      [0x4F, 1, null],   // lo $4F = voice
      [0x0D, 0, 0x0D],   // sel $0D (the READ)
      [0x0D, 0, 0x0D],   // sel $0D (the WRITE)
      [0x0D, 2, 0x01],   // hi $0D = 01 (masked VCtl)
      [0x07, 0, 0x07],   // sel $07
      [0x07, 2, 0x01],   // hi $07 = 01
      [0x08, 0, 0x08],   // sel $08
      [0x08, 2, 0x01],   // hi $08 = 01
      [0x10, 0, 0x10],   // sel $10
      [0x10, 2, 0x0F],   // hi $10 = 0F (KEYOFF)
      [0x0D, 0, 0x0D],   // sel $0D (the re-READ)
      [0x0D, 0, 0x0D],   // sel $0D (the WRITE)
      [0x0D, 2, 0x03],   // hi $0D = 03 (re-arm)
      [0x00, 0, 0x00],   // sel $00
      [0x00, 2, 0x00],   // hi $00 = 00
    ];
    let violations = 0;
    let firstBad = null;
    for (const k of keyoffs) {
      const ep = keyoffEpisode(rows, k);
      if (ep.length !== PATTERN.length) {
        violations++;
        if (firstBad === null) firstBad = { k, len: ep.length };
        continue;
      }
      for (let i = 0; i < PATTERN.length; i++) {
        const e = unpack(ep[i]);
        const [reg, half, data] = PATTERN[i];
        if (e.reg !== reg || e.half !== half || (data !== null && e.data !== data)) {
          violations++;
          if (firstBad === null) firstBad = { k, at: i, e };
          break;
        }
      }
    }
    assert.equal(violations, 0,
      `all 1720 keyoffs match the fixed $0A0C sequence (violations=${violations}, first=${JSON.stringify(firstBad)})`);
  });

test('GREEN/RED: emitKeyoff reproduces a real keyoff episode row-for-row; corrupt diverges; restore re-greens',
  { skip: SKIP }, () => {
    const { rows } = parseOracle();
    const keyoffs = keyoffDataWrites(rows);
    // Voice 1's first keyoff (vf=5, the boot release-all). Walk to its episode.
    const k1 = keyoffs.find((k) => unpack(rows[k]).voice === 1);
    assert.ok(k1 > 0, 'found voice 1 keyoff');
    const oracleEpisode = keyoffEpisode(rows, k1);
    assert.equal(oracleEpisode.length, 15, `keyoff episode is 15 rows (${oracleEpisode.length})`);
    assert.equal(unpack(oracleEpisode[0]).voice, 1, 'episode is for voice 1');

    // GREEN: seed the shadow $0D = $01 (the oracle's pre-keyoff VCtl for every
    // keyoff) and emit. Compare from lo$4F onward (the sel$4F is the previous
    // episode's tail, same attribution rule as the keyon test).
    function emit() {
      const rf = new IcsRegisterFile();
      const eng = new VoiceEngine(rf);
      const slot = eng.voices[1];
      slot.icsVoice = 1;
      slot.state = ENGINE.STATE_SUSTAIN;
      rf.voices[1].hi[0x0D] = vctlSeed;       // the pre-keyoff VCtl (Layer 1 shadow)
      eng.emitKeyoff(slot);
      return rf.regLog.slice(1).map((r) => r >>> 0);   // drop the sel$4F (prev voice)
    }

    let vctlSeed = 0x01;   // the oracle truth (every keyoff reads VCtl=$01)
    const green = emit();
    assert.equal(green.length, oracleEpisode.length,
      `emitted one write per oracle row (${green.length} vs ${oracleEpisode.length})`);
    let mismatch = -1;
    for (let i = 0; i < green.length; i++) {
      if (green[i] !== oracleEpisode[i]) { mismatch = i; break; }
    }
    assert.equal(mismatch, -1,
      `keyoff episode row-for-row match (first mismatch at ${mismatch}: `
      + `oracle=${JSON.stringify(unpack(oracleEpisode[mismatch]))}, `
      + `got=${JSON.stringify(unpack(green[mismatch]))})`);

    // RED: corrupt the pre-keyoff VCtl to $03; the masked $0D write diverges
    // ($03 & $C3 = $03, bit1 set -> |$01 = $03, vs the oracle's $01).
    vctlSeed = 0x03;
    const red = emit();
    let redMismatch = -1;
    for (let i = 0; i < red.length; i++) {
      if (red[i] !== oracleEpisode[i]) { redMismatch = i; break; }
    }
    assert.ok(redMismatch >= 0, 'a corrupted VCtl diverges the emitted sequence');
    const bad = unpack(red[redMismatch]);
    assert.ok(bad.reg === 0x0D && bad.half === 2,
      `the divergence is at the $0D hi write (reg=$${bad.reg.toString(16)} half=${bad.half})`);

    // RESTORE: re-green.
    vctlSeed = 0x01;
    const restored = emit();
    let restMismatch = -1;
    for (let i = 0; i < restored.length; i++) {
      if (restored[i] !== oracleEpisode[i]) { restMismatch = i; break; }
    }
    assert.equal(restMismatch, -1, 'restore re-greens the keyoff episode');
  });

test('the $3F11 free closes the allocator cycle (a freed slot is reused)',
  () => {
    const rf = new IcsRegisterFile();
    const eng = new VoiceEngine(rf);
    // Acquire voice 8 (the seeded round-robin start), then free it.
    assert.equal(eng.acquireIcsVoice(0x55), 8, 'first acquire is voice 8');
    assert.equal(eng.icsShadow[8][0], 0x55, 'shadow slot marked');
    eng.releaseIcsVoice(8);
    assert.equal(eng.icsShadow[8][0], 0, 'releaseIcsVoice freed the shadow byte');
    // The freed slot is now reusable: position the cursor at 8 and re-acquire.
    eng.allocStart = 8;
    assert.equal(eng.acquireIcsVoice(0x66), 8, 'the freed slot is reused ($3E8F/$3F11 cycle)');
    assert.equal(eng.icsShadow[8][0], 0x66, 're-acquire re-marks the shadow');

    // releaseVoiceIfBusy ($3F22): keyoffs + frees a bound voice; no-op if free.
    rf.voices[5].hi[0x0D] = 0x01;       // seed VCtl for the keyoff read
    eng.voices[5].state = ENGINE.STATE_SUSTAIN;
    eng.icsShadow[5][0] = 0x77;         // voice 5 bound
    const did = eng.releaseVoiceIfBusy(5);
    assert.equal(did, true, 'releaseVoiceIfBusy ran on a bound voice');
    assert.equal(eng.icsShadow[5][0], 0, 'releaseVoiceIfBusy freed the shadow');
    const did2 = eng.releaseVoiceIfBusy(5);
    assert.equal(did2, false, 'releaseVoiceIfBusy is a no-op on an already-free voice');
  });
