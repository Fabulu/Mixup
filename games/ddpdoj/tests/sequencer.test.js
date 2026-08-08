// W153 live BGM Layer 3 gate. ROM/listing defines behavior; oracle register
// episodes remain secondary test-only validation and never feed production.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IcsRegisterFile, VOICE_REG, unpack } from '../src/ics.js';
import { VoiceEngine, VoiceSlot } from '../src/voice.js';
import { driverParamsFromJson, driverParamsToJson } from '../src/driverparams.js';
import {
  SCORE_VERSION, SCORE, N_CUES, N_BGM_TRACKS, pointerTableAddress,
  parseScore, scoreToJson, scoreFromJson,
} from '../src/bgmscore.js';
import {
  BGM, TOFF, EV_FAMILY, C0_FAMILY, STATE_HANDLER_ADDRS,
  STATE14_HANDLER_ADDRS, BgmSequencer, parseEvent, eventFamily,
  applyStateHandler,
} from '../src/sequencer.js';
import { SoundChain } from '../src/dispatch.js';
import { Ram } from '../src/ram.js';
import { SOUND, SoundState, postWrapper, drainFrame } from '../src/sound.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const Z80 = new Uint8Array(readFileSync(join(ROOT, 'rip', 'sound', 'z80ram.bin')));
const SCORE_JSON = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'assets', 'snd',
  'bgm-score.json.gz'))));
const PARAM_JSON = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'assets', 'snd',
  'driver-params.json.gz'))));
const SCORE_RUNTIME = scoreFromJson(SCORE_JSON);
const PARAMS = driverParamsFromJson(PARAM_JSON);

const set8 = (track, offset, value) => { track.raw[offset] = value & 0xff; };
const get16 = (track, offset) => track.raw[offset] | (track.raw[offset + 1] << 8);
const set16 = (track, offset, value) => {
  track.raw[offset] = value & 0xff;
  track.raw[offset + 1] = (value >>> 8) & 0xff;
};

function sequence(cue = 8) {
  const engine = new VoiceEngine(new IcsRegisterFile());
  const seq = new BgmSequencer(engine, SCORE_RUNTIME.cues, PARAMS);
  assert.equal(seq.loadCue(cue, 0xeb, true), true);
  engine.rf.regLog.length = 0;
  return seq;
}

test('W153: score parser exports the exact aligned 8*df pointer topology', () => {
  const parsed = parseScore(Z80);
  assert.equal(parsed.version, SCORE_VERSION);
  assert.equal(parsed.cueCount, N_CUES);
  assert.equal(parsed.tableAddr, SCORE.cueTable);
  assert.deepEqual(parsed.cues.map((cue) => cue.blockAddr),
    [0xa600, 0xa696, 0xa6e2, 0xa778, 0xa80e, 0xa87a,
      0xa954, 0xa98c, 0xb6d0, 0xb7ec, 0xbe90]);
  for (const cue of parsed.cues) {
    assert.equal(cue.tracks, N_BGM_TRACKS);
    assert.equal(cue.df, cue.rowlen);
    assert.equal(cue.rowStream.length, cue.rowlen);
    assert.equal(cue.ptrTableAddr, pointerTableAddress(cue.blockAddr, cue.rowlen));
    assert.equal(cue.ptrTable.length, N_BGM_TRACKS * cue.df);
    assert.ok(cue.rowStream.every((selector) => selector < cue.df));
    assert.ok(Object.isFrozen(cue));
  }
  assert.equal(parsed.cues[0].ptrTableAddr, 0xa606,
    'even rowlen has no fictional extra byte');
  assert.equal(parsed.cues[8].ptrTableAddr, 0xb6d6,
    'odd rowlen consumes the real alignment byte');
  assert.equal(parsed.cues[7].ptrTable.length, 64);
  assert.equal(parsed.cues[10].ptrTable.length, 96);
  const { note: provenanceNote, ...artifactScore } = SCORE_JSON;
  assert.equal(typeof provenanceNote, 'string');
  assert.deepEqual(scoreToJson(parsed), artifactScore,
    'regenerated semantic score matches the deferred artifact');
});

test('W153: scoreFromJson rejects version, layout, topology, ranges, and bad hex', () => {
  const mutate = (fn) => { const value = structuredClone(SCORE_JSON); fn(value); return value; };
  assert.throws(() => scoreFromJson(mutate((v) => { v.version = 2; })), /version/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.nCues = 10; })), /count\/table/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues.pop(); })), /11/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[2].blockAddr++; })),
    /block layout/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[0].tracks = 7; })), /8 tracks/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[0].df = 1; })), /df=rowlen/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[0].rowStream[0] = 2; })), /0\.\.1/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[0].ptrTableAddr++; })), /address/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[7].ptrTable.pop(); })), /64/);
  assert.throws(() => scoreFromJson(mutate((v) => {
    v.cues[8].ptrTable[0] = v.cues[8].ptrTableAddr;
    v.cues[8].noteStreamAddrs[0] = v.cues[8].ptrTableAddr;
  })), /topology/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[8].noteStreamAddrs[0]++; })),
    /grid mismatch/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[8].noteStreams[0] += 'f'; })),
    /even-length/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[8].noteStreams[0] = 'zz'; })),
    /hexadecimal/);
  assert.throws(() => scoreFromJson(mutate((v) => { v.cues[8].noteStreams[0] += '00'; })),
    /extent/);
  assert.ok(Object.isFrozen(SCORE_RUNTIME));
  assert.ok(Object.isFrozen(SCORE_RUNTIME.cues[8].noteStreams[0]));
});

test('W153: the four primary families and every `$C0` subfamily have exact arity', () => {
  const bytes = [
    0x04,
    0x43, 0xaa,
    0xaa, 0x07,
    0xd3, 0x55, 0x2a,
    0xe4, 0x66, 0x08,
    0xcf, 0x78, 0x2a, 0x07,
    0xf2, 0x11, 0x03, 0x09,
  ];
  const events = [];
  for (let pos = 0; pos < bytes.length;) {
    const event = parseEvent(bytes, pos); events.push(event); pos = event.next;
  }
  assert.deepEqual(events.map((event) => event.raw.length), [1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(events.map((event) => event.kind), [
    'wait', 'state', 'noteDescriptor', 'controlNote', 'controlDescriptor',
    'controlCombined', 'controlCombined',
  ]);
  assert.equal(events[0].wait, 4);
  assert.deepEqual([events[1].state, events[1].parameter], [3, 0xaa]);
  assert.deepEqual([events[2].state, events[2].note, events[2].descriptor],
    [8, 0x2a, 7]);
  assert.deepEqual([events[3].state, events[3].parameter, events[3].note],
    [3, 0x55, 0x2a]);
  assert.deepEqual([events[4].state, events[4].parameter, events[4].descriptor],
    [4, 0x66, 8]);
  assert.deepEqual([events[5].secondary, events[5].state, events[5].parameter,
    events[5].note, events[5].descriptor], [C0_FAMILY.COMBINED, 15, 0x78, 0x2a, 7]);
  assert.equal(eventFamily(0x04), EV_FAMILY.WAIT);
  assert.equal(eventFamily(0x43), EV_FAMILY.STATE);
  assert.equal(eventFamily(0xaa), EV_FAMILY.NOTE_DESCRIPTOR);
  assert.equal(eventFamily(0xcf), EV_FAMILY.CONTROL);
  assert.throws(() => parseEvent([0xcf, 1, 2], 0), /truncated/);
});

test('W153: cue 8 begins with the corrected `$CF 78 2A 07` framing', () => {
  const stream = SCORE_RUNTIME.cues[8].noteStream(0, 0);
  const first = parseEvent(stream, 0);
  assert.deepEqual(first.raw, [0xcf, 0x78, 0x2a, 0x07]);
  assert.equal(first.next, 4);
  const wait = parseEvent(stream, first.next);
  assert.deepEqual(wait.raw, [0x04]);
  const note = parseEvent(stream, wait.next);
  assert.deepEqual(note.raw, [0xaa, 0x07]);
});

test('W153: all 16 `$4316` handlers and 16 state-14 arms are inventoried and live', () => {
  assert.deepEqual(STATE_HANDLER_ADDRS, [
    0x1d2e, 0x1df6, 0x1e3b, 0x1e7e, 0x1e9b, 0x1ee4, 0x1eeb, 0x1ef2,
    0x1f3b, 0x1f3c, 0x1f84, 0x1f88, 0x1fe5, 0x2037, 0x245a, 0x247a,
  ]);
  assert.equal(STATE14_HANDLER_ADDRS.length, 16);
  for (let state = 0; state < 16; state++) {
    const seq = sequence();
    const track = seq.tracks[0];
    set8(track, TOFF.descriptor, 6);
    set8(track, TOFF.note, 20);
    set16(track, TOFF.basePeriod, PARAMS.pitch(PARAMS.bgm(6).pitchBank, 20));
    set16(track, TOFF.targetPeriod, get16(track, TOFF.basePeriod));
    set16(track, TOFF.currentPeriod, get16(track, TOFF.basePeriod));
    set8(track, TOFF.baseLevel, 20);
    set8(track, TOFF.level, 20);
    set8(track, TOFF.evState, state);
    set8(track, TOFF.evState2, state === 14 ? 0xa2 : 0x12);
    seq.tempoCount = 6;
    applyStateHandler(state, track, seq);
    assert.ok(track.raw.some((value) => value !== 0), `handler ${state} returns with valid state`);
  }
});

test('W153: representative handler mutations match their exact track/global offsets', () => {
  const seq = sequence();
  const track = seq.tracks[0];
  set8(track, TOFF.descriptor, 6); set8(track, TOFF.note, 20);
  set16(track, TOFF.targetPeriod, 0x200); set16(track, TOFF.basePeriod, 0x180);
  set8(track, TOFF.baseLevel, 0x20); set8(track, TOFF.level, 0x20);
  set8(track, TOFF.evState2, 0x12); seq.tempoCount = 6;
  applyStateHandler(1, track, seq);
  assert.equal(get16(track, TOFF.targetPeriod), 0x1ee);
  set16(track, TOFF.targetPeriod, 0x200); applyStateHandler(2, track, seq);
  assert.equal(get16(track, TOFF.targetPeriod), 0x212);
  applyStateHandler(9, track, seq);
  assert.equal(track.raw[TOFF.modifier + 1], 0x12);
  set8(track, TOFF.evState2, 0x25); applyStateHandler(12, track, seq);
  assert.equal(track.raw[TOFF.baseLevel], 0x25);
  assert.equal(track.raw[TOFF.level], 0x25);
  assert.equal(track.raw[TOFF.volumeDirty], 1);
  set8(track, TOFF.evState2, 0x09); applyStateHandler(11, track, seq);
  assert.equal(seq.colIndex, 9);
  set8(track, TOFF.evState2, 0x0b); applyStateHandler(15, track, seq);
  assert.equal(seq.tempoDiv, 0x0b);
});

test('W153: the remaining `$4316` primary mutations are exact', () => {
  const fresh = () => {
    const seq = sequence(); const track = seq.tracks[0];
    set8(track, TOFF.descriptor, 6); set8(track, TOFF.note, 20);
    const period = PARAMS.pitch(PARAMS.bgm(6).pitchBank, 20);
    set16(track, TOFF.basePeriod, period); set16(track, TOFF.targetPeriod, period);
    set16(track, TOFF.currentPeriod, period); set8(track, TOFF.baseLevel, 20);
    set8(track, TOFF.level, 20); seq.tempoCount = 1;
    return { seq, track, period };
  };
  {
    const { seq, track } = fresh(); set8(track, TOFF.evState2, 0x12);
    applyStateHandler(0, track, seq);
    assert.equal(get16(track, TOFF.currentPeriod), seq.pitchFor(track, 21));
  }
  {
    const { seq, track } = fresh(); set8(track, TOFF.evState2, 7);
    applyStateHandler(3, track, seq); assert.equal(track.raw[TOFF.pitchRate], 7);
  }
  for (const state of [4, 7]) {
    const { seq, track } = fresh(); set8(track, TOFF.evState2, 0x23);
    applyStateHandler(state, track, seq);
    const depth = state === 4 ? TOFF.pitchDepth : TOFF.volumeDepth;
    const step = state === 4 ? TOFF.pitchStep : TOFF.volumeStep;
    assert.equal(track.raw[depth], 3); assert.equal(track.raw[step], 2);
    assert.equal(track.raw[TOFF.evState2], 0);
  }
  for (const state of [5, 6, 10]) {
    const { seq, track } = fresh(); set8(track, TOFF.evState2, 0x21);
    applyStateHandler(state, track, seq);
    assert.equal(track.raw[TOFF.baseLevel], 21);
    assert.equal(track.raw[TOFF.volumeDirty], 1);
  }
  {
    const { seq, track } = fresh(); const before = track.raw.slice();
    applyStateHandler(8, track, seq); assert.deepEqual(track.raw, before);
  }
  {
    const { seq, track } = fresh(); set8(track, TOFF.evState2, 0x21);
    applyStateHandler(13, track, seq);
    assert.equal(seq.colIndex, 1); assert.equal(seq.groupStep, 21);
    assert.equal(seq.stepCount, 0x40);
  }
  {
    const { seq, track } = fresh(); set8(track, TOFF.evState2, 0x31);
    applyStateHandler(14, track, seq); assert.equal(track.raw[TOFF.quantize], 1);
  }
});

test('W153: all 16 `$4336` state-14 arms mutate the proven targets', () => {
  for (let sub = 0; sub < 16; sub++) {
    const seq = sequence(); const track = seq.tracks[0];
    set8(track, TOFF.descriptor, 6); set8(track, TOFF.note, 20);
    set16(track, TOFF.targetPeriod, 0x200); set16(track, TOFF.currentPeriod, 0x200);
    set8(track, TOFF.baseLevel, 20); set8(track, TOFF.level, 20);
    set8(track, TOFF.evState, 14); set8(track, TOFF.evState2, (sub << 4) | 2);
    seq.tempoCount = 3;
    const before = track.raw.slice();
    applyStateHandler(14, track, seq);
    switch (sub) {
      case 0: case 8: case 15: assert.deepEqual(track.raw, before); break;
      case 1: assert.equal(get16(track, TOFF.targetPeriod), 0x1fe); break;
      case 2: assert.equal(get16(track, TOFF.targetPeriod), 0x202); break;
      case 3: assert.equal(track.raw[TOFF.quantize], 2); break;
      case 4: assert.equal(track.raw[TOFF.flags] & 0x0f, 2); break;
      case 5: assert.equal(get16(track, TOFF.targetPeriod), PARAMS.pitch(2, 20)); break;
      case 6: assert.equal(seq.repeatCount, 2); assert.equal(seq.deferredRow, 1); break;
      case 7: assert.equal(track.raw[TOFF.flags] >>> 4, 2); break;
      case 9: assert.equal(track.raw[TOFF.retrigger], 1); break;
      case 10: assert.equal(track.raw[TOFF.baseLevel], 22); break;
      case 11: assert.equal(track.raw[TOFF.baseLevel], 18); break;
      case 12: assert.equal(track.raw[TOFF.baseLevel], 0); break;
      case 13: assert.equal(track.raw[TOFF.keyonArm], 1); break;
      case 14: assert.equal(seq.wait, 2); break;
    }
  }
  const seq = sequence(); const track = seq.tracks[0];
  set8(track, TOFF.evState2, 0x90); set8(track, TOFF.retrigger, 0);
  applyStateHandler(14, track, seq);
  assert.equal(track.raw[TOFF.retrigger], 0, 'zero retrigger interval does not underflow');
});

test('W153: descriptor/note resolution is bounded and maps through `$14AB/$1569`', () => {
  const seq = sequence();
  const track = seq.tracks[0];
  seq.applyEvent(track, parseEvent([0xcf, 0x78, 0x2a, 0x07], 0));
  const descriptor = PARAMS.bgm(6);
  assert.equal(track.raw[TOFF.descriptor], 6);
  assert.equal(track.raw[TOFF.note], 41);
  assert.equal(get16(track, TOFF.basePeriod), PARAMS.pitch(descriptor.pitchBank, 41));
  set16(track, TOFF.currentPeriod, get16(track, TOFF.basePeriod));
  seq.updateFrequency(track);
  const clamped = Math.max(0x32, Math.min(0x716, get16(track, TOFF.currentPeriod)));
  assert.equal(get16(track, TOFF.fcReg), PARAMS.frequency(clamped));
  assert.throws(() => seq.applyEvent(track, parseEvent([0x80, 161], 0)), /0\.\.159/);
  assert.throws(() => seq.applyEvent(track, parseEvent([0xbd, 1], 0)), /0\.\.59/);
  assert.throws(() => PARAMS.frequency(0x31), /50\.\.1814/);
  assert.throws(() => PARAMS.pitch(0, 60), /0\.\.59/);
});

test('W153: the tempo gate skips events but still runs live state/register updates', () => {
  const seq = sequence();
  assert.equal(seq.tick(), 7, 'loader count six makes the first IRQ an event tick');
  const track = seq.tracks[0];
  const streamPos = track.streamPos;
  set8(track, TOFF.evState, 1);
  set8(track, TOFF.evState2, 2);
  set16(track, TOFF.targetPeriod, 0x200);
  seq.tempoCount = 0;
  seq.engine.rf.regLog.length = 0;
  assert.equal(seq.tick(), 0, 'count one is below divider six, so no new note arms');
  assert.equal(track.streamPos, streamPos, 'gated IRQ does not consume an event');
  assert.equal(get16(track, TOFF.targetPeriod), 0x1fe,
    'the `$4316` state handler still advances between event ticks');
  assert.ok(seq.engine.rf.regLog.length > 0, 'the `$15B3` update path still runs');
});

test('W153: frequency-map artifact metadata and entries reject drift loudly', () => {
  const mutate = (fn) => { const value = structuredClone(PARAM_JSON); fn(value); return value; };
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.fcMap.base += 2; })),
    /base\/stride/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.fcMap.min++; })),
    /range/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.fcMap.entries.pop(); })),
    /1765/);
  assert.throws(() => driverParamsFromJson(mutate((v) => { v.fcMap.entries[0] = 0x10000; })),
    /integer/);
});

test('W153: every one of 11 cues rehydrates, loads eight tracks, and executes live bytes', () => {
  for (let cue = 0; cue < N_CUES; cue++) {
    const seq = sequence(cue);
    assert.equal(seq.tracks.length, N_BGM_TRACKS);
    assert.ok(seq.tracks.every((track) => track.active));
    const before = seq.tracks.map((track) => track.streamPos);
    const armed = seq.tick();
    assert.ok(armed >= 1, `cue ${cue} arms at least one live keyon`);
    assert.ok(seq.tracks.some((track, i) => track.streamPos > before[i]));
  }
});

test('W153: arbitrary cue bytes resolve descriptor/pitch and write exact registers', () => {
  const seq = sequence(8);
  assert.equal(seq.tick(), 7);
  const track = seq.tracks[0];
  const descriptor = PARAMS.bgm(6);
  const voice = seq.engine.rf.voices[0];
  assert.equal(track.raw[TOFF.note], 41);
  assert.equal(get16(track, TOFF.basePeriod), PARAMS.pitch(descriptor.pitchBank, 41));
  assert.equal(voice.u8(VOICE_REG.saddr), descriptor.r11);
  assert.equal(voice.u16(0x0b), descriptor.r0B);
  assert.equal(voice.u16(0x0a), descriptor.r0A);
  assert.equal(voice.u16(VOICE_REG.oscEndLo), descriptor.r05);
  assert.equal(voice.u16(VOICE_REG.oscEnd), descriptor.r04);
  assert.equal(voice.u8(VOICE_REG.oscConf), descriptor.r00);
  const level = ((descriptor.baseLevel * 0xeb) >>> 7) || 1;
  assert.equal(voice.u16(0x09), PARAMS.volume(level));
  assert.equal(voice.u16(VOICE_REG.fc), PARAMS.frequency(get16(track, TOFF.currentPeriod)));
  for (let i = 0; i < 6; i++) seq.tick();
  const period = Math.max(0x32, Math.min(0x716, get16(track, TOFF.currentPeriod)));
  assert.equal(voice.u16(VOICE_REG.fc), PARAMS.frequency(period));
});

test('W153: state 9 reaches the exact split-address `$15B3` register arithmetic', () => {
  const seq = sequence(); const track = seq.tracks[0];
  seq.applyEvent(track, parseEvent([0xcf, 0x78, 0x2a, 0x07], 0));
  set8(track, TOFF.evState2, 0x12);
  applyStateHandler(9, track, seq);
  assert.equal(track.raw[TOFF.modifier + 1], 0x12);
  set16(track, TOFF.currentPeriod, get16(track, TOFF.targetPeriod));
  set8(track, TOFF.fcDirty, 1); set8(track, TOFF.keyonArm, 1);
  seq.engine.rf.regLog.length = 0; seq.emitTrack(track);
  const descriptor = PARAMS.bgm(6); const voice = seq.engine.rf.voices[0];
  assert.equal(voice.u16(0x0b), descriptor.r0B,
    '`$1200 << 12` contributes zero to the low split word');
  assert.equal(voice.u16(0x0a), (descriptor.r0A + 0x100) & 0xffff,
    '`($1200 & $FFFFF000) >>> 4` contributes `$0100` to the high word');
});

test('W153: real type `$11/$12` streaming doors select stop/loop cue modes', () => {
  const ram = new Ram();
  const sound = new SoundState();
  const chain = new SoundChain(PARAMS, SCORE_RUNTIME.cues);
  assert.equal(postWrapper(ram, sound, 0x28cb60), true);
  const stageClear = drainFrame(ram, sound, 100);
  assert.equal(stageClear.type, 0x11);
  assert.equal(stageClear.selector, 9);
  chain.enqueueDoor(stageClear); chain.runMainLoop();
  assert.equal(chain.sequencer.cueId, 9);
  assert.equal(chain.sequencer.activeMode, -1, 'cmd $11 plays once');
  assert.ok(chain.sequencer.tick() > 0, 'production stage-clear cue reaches keyon writes');

  const loopSound = new SoundState();
  assert.equal(postWrapper(ram, loopSound, 0x28cb38), true);
  chain.enqueueDoor(drainFrame(ram, loopSound, 101)); chain.runMainLoop();
  assert.equal(chain.sequencer.cueId, 7);
  assert.equal(chain.sequencer.activeMode, 1, 'cmd $12 loops');
  chain.enqueueDoor({ type: 0x15, pan: 0, id: 0, chan: 0 });
  chain.runMainLoop();
  assert.equal(chain.sequencer.cueActive, false, 'cmd $15 stops');
});

function parseOracleRows() {
  const lines = readFileSync(join(ROOT, 'rip', 'sound', 'ics.tsv'), 'utf8')
    .trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const c = line.split('\t');
    const half = c[5] === 'sel' ? 0 : c[5] === 'lo' ? 1 : 2;
    return (((Number(c[3]) & 0xff) << 24) | ((parseInt(c[4], 16) & 0xff) << 16)
      | (half << 8) | parseInt(c[6], 16)) >>> 0;
  });
}

function oracleEpisode(rows, row1) {
  let start = row1 - 1;
  while (start > 0) {
    start--;
    const event = unpack(rows[start]);
    if (event.reg === 0x4f && event.half === 1) break;
  }
  return rows.slice(start, row1);
}

function slotFromEpisode(episode) {
  const slot = new VoiceSlot();
  const regs = new Map();
  for (const packed of episode) {
    const event = unpack(packed);
    if (event.half === 0) continue;
    if (event.reg === 0x4f && event.half === 1) slot.icsVoice = event.data;
    const value = regs.get(event.reg) ?? {};
    value[event.half === 1 ? 'lo' : 'hi'] = event.data;
    regs.set(event.reg, value);
  }
  const word = (reg) => ((regs.get(reg)?.hi ?? 0) << 8) | (regs.get(reg)?.lo ?? 0);
  const high = (reg) => regs.get(reg)?.hi ?? regs.get(reg)?.lo ?? 0;
  slot.fc = word(1); slot.saddr = high(0x11); slot.r0B = word(0x0b); slot.r0A = word(0x0a);
  slot.oscStrtLo = word(3); slot.oscStrt = word(2); slot.oscEndLo = word(5);
  slot.oscEnd = word(4); slot.pan = high(0x0c); slot.r09 = word(9);
  slot.oscConf = high(0); slot.hasLoop = regs.has(2); slot.hasPan = regs.has(0x0c);
  slot.hasR09 = regs.has(9);
  return slot;
}

test('W153 secondary validation: historical 979 BGM keyon episodes remain exact', () => {
  const rows = parseOracleRows();
  const keyons = readFileSync(join(ROOT, 'rip', 'sound', 'keyon.tsv'), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((line) => line.split('\t'))
    .filter((c) => c[4] === '08' || c[4] === '00');
  assert.equal(keyons.length, 979);
  const engine = new VoiceEngine(new IcsRegisterFile());
  let matched = 0;
  let firstMismatch = null;
  for (const keyon of keyons) {
    const episode = oracleEpisode(rows, Number(keyon[15]));
    const slot = slotFromEpisode(episode);
    engine.rf.regLog.length = 0;
    engine.emitKeyon(slot);
    // `regLog[0]` is the local register-select write; capture rows begin at the
    // following `$4F` low-lane voice select.
    const emitted = engine.rf.regLog.slice(1).map((value) => value >>> 0);
    if (emitted.length === episode.length
      && emitted.every((value, i) => value === episode[i])) matched++;
    else if (!firstMismatch) {
      const index = emitted.findIndex((value, i) => value !== episode[i]);
      firstMismatch = { emittedLength: emitted.length, episodeLength: episode.length,
        index, emitted: unpack(emitted[index] ?? 0), expected: unpack(episode[index] ?? 0) };
    }
  }
  assert.equal(matched, 979, `test-only register emitter validation, not production parameters; ${JSON.stringify(firstMismatch)}`);
});

test('W153: production BGM has no parser/history/oracle parameter dependency', () => {
  const sequencer = readFileSync(join(ROOT, 'src', 'sequencer.js'), 'utf8');
  const dispatch = readFileSync(join(ROOT, 'src', 'dispatch.js'), 'utf8');
  assert.doesNotMatch(sequencer + dispatch,
    /parseScore\(|after_door|keyon\.tsv|ics\.tsv|slotFromEpisode/);
  assert.deepEqual(driverParamsToJson(Z80), PARAM_JSON);
  assert.ok(SCORE_RUNTIME.cues.every((cue) => Object.isFrozen(cue)));
});
