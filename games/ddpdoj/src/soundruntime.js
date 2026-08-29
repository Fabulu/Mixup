// POLICY-NEUTRAL LIVE SOUND RUNTIME -- W156.
//
// Game supplies zero or four command bytes when its 68000 logic drains the
// mailbox. The browser supplies independent ticks at the unmodified PGM display
// clock while cartridge slowdown changes only the logic deadline. This object is
// the sole owner of Layer 3 scheduling, Layer 2 register emission, native 33,075
// Hz advancement, oscillator IRQ feedback, and stereo buffering. It implements
// shared/audio.js's chip contract directly. The browser constructs exactly one
// object when deferred assets arrive, advances it silently before a gesture, and
// later attaches that same object to AudioOut.

import { SoundChain } from './dispatch.js';
import { driverParamsFromJson } from './driverparams.js';
import { scoreFromJson } from './bgmscore.js';
import { ICS_CLOCK, Ics2115Core, IcsSampleMap,
  LOGIC_RATE_DEN, LOGIC_RATE_NUM } from './ics2115.js';

export const STAGE1_SEED_SOUND = Object.freeze({
  startFrame: 1562,
  startVideoFrame: 1597,
  startLeaf: 0x28cb9c,
  startDoor: Object.freeze([0x12, 0xeb, 0x00, 0x00]),
  maxPreRollTicks: 8192,
});

export const IRQ_TIMING_POLICY = Object.freeze({
  AFTER_NATIVE_FRAME: 'after-native-frame',
});

function object(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`sound runtime: ${name} must be an object`);
  }
  return value;
}

function jsonValue(name, value) {
  if (typeof value === 'string') return JSON.parse(value);
  return object(name, value);
}

function timerThreshold(chain) {
  const requestedRate = chain.sequencer?.raw616c ?? 0x7d;
  const preset = chain.driverParams.timer0Preset(requestedRate);
  const scale = 0x94;
  const period = ((scale & 0x1f) + 1) * (preset + 1)
    * (2 ** (4 + (scale >>> 5)));
  return { requestedRate, threshold: period * LOGIC_RATE_NUM };
}

function compactDoor(input, lf) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('sound runtime command input must be a Uint8Array');
  }
  if (input.length !== 4) {
    throw new RangeError(`sound runtime command input must contain 4 bytes, got ${input.length}`);
  }
  return {
    lf,
    type: input[0], pan: input[1], id: input[2],
    chan: input[3], packedChannel: input[3],
  };
}

function snapshotPrimitives(value) {
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' || typeof entry === 'boolean') result[key] = entry;
  }
  return result;
}

function restorePrimitives(name, target, source) {
  object(name, source);
  for (const [key, current] of Object.entries(target)) {
    if (typeof current !== 'number' && typeof current !== 'boolean') continue;
    const value = source[key];
    if (typeof current === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new TypeError(`sound runtime: ${name}.${key} must be boolean`);
      }
    } else if (!Number.isSafeInteger(value)) {
      throw new TypeError(`sound runtime: ${name}.${key} must be a safe integer`);
    }
    target[key] = value;
  }
}

function byteArray(name, value, length) {
  if (!Array.isArray(value) || value.length !== length
      || value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new TypeError(`sound runtime: ${name} must contain ${length} bytes`);
  }
  return Uint8Array.from(value);
}

function messageSnapshot(message) {
  const result = {};
  for (const key of [
    'cmd', 'door', 'lf', 'pan', 'id', 'chan', 'packedChannel', 'selector', 'channel',
  ]) {
    if (message[key] !== undefined) result[key] = message[key];
  }
  return result;
}

function restoreMessages(name, value, max) {
  if (!Array.isArray(value) || value.length > max) {
    throw new TypeError(`sound runtime: ${name} must contain at most ${max} messages`);
  }
  return value.map((message, index) => {
    object(`${name}[${index}]`, message);
    const result = {};
    for (const key of [
      'cmd', 'door', 'lf', 'pan', 'id', 'chan', 'packedChannel', 'selector', 'channel',
    ]) {
      if (message[key] === undefined) continue;
      if (!Number.isSafeInteger(message[key])) {
        throw new TypeError(`sound runtime: ${name}[${index}].${key} must be a safe integer`);
      }
      result[key] = message[key];
    }
    for (const key of ['cmd', 'lf', 'pan', 'id', 'chan', 'packedChannel', 'selector', 'channel']) {
      if (result[key] === undefined) {
        throw new TypeError(`sound runtime: ${name}[${index}].${key} is missing`);
      }
    }
    return result;
  });
}

function registerFileSnapshot(rf) {
  return {
    currentVoice: rf.currentVoice,
    regSelect: rf.regSelect,
    activeOsc: rf.activeOsc,
    regLog: rf.regLog.slice(),
    regDigest: rf.regDigest,
    frameWrites: rf.frameWrites,
    totalWrites: rf.totalWrites,
    glob: { lo: Array.from(rf.glob.lo), hi: Array.from(rf.glob.hi) },
    voices: rf.voices.map((voice) => ({
      lo: Array.from(voice.lo), hi: Array.from(voice.hi),
    })),
  };
}

function restoreRegisterFile(rf, source) {
  object('state.chain.rf', source);
  restorePrimitives('state.chain.rf', rf, source);
  if (!Array.isArray(source.regLog) || source.regLog.length > 65536
      || source.regLog.some((row) => !Number.isInteger(row) || row < 0 || row > 0xffffffff)) {
    throw new TypeError('sound runtime: state.chain.rf.regLog must contain at most 65536 uint32 rows');
  }
  if (!Array.isArray(source.voices) || source.voices.length !== rf.voices.length) {
    throw new TypeError(`sound runtime: state.chain.rf must contain ${rf.voices.length} voices`);
  }
  rf.regLog = source.regLog.slice();
  rf.glob.lo.set(byteArray('state.chain.rf.glob.lo', source.glob?.lo, rf.glob.lo.length));
  rf.glob.hi.set(byteArray('state.chain.rf.glob.hi', source.glob?.hi, rf.glob.hi.length));
  for (let i = 0; i < rf.voices.length; i++) {
    rf.voices[i].lo.set(byteArray(
      `state.chain.rf.voices[${i}].lo`, source.voices[i]?.lo, rf.voices[i].lo.length,
    ));
    rf.voices[i].hi.set(byteArray(
      `state.chain.rf.voices[${i}].hi`, source.voices[i]?.hi, rf.voices[i].hi.length,
    ));
  }
}

function engineSnapshot(engine) {
  return {
    allocStart: engine.allocStart,
    voices: engine.voices.map((voice) => snapshotPrimitives(voice)),
    icsShadow: engine.icsShadow.map((row) => Array.from(row)),
  };
}

function restoreEngine(engine, source) {
  object('state.chain.engine', source);
  if (!Number.isSafeInteger(source.allocStart)) {
    throw new TypeError('sound runtime: state.chain.engine.allocStart must be a safe integer');
  }
  if (!Array.isArray(source.voices) || source.voices.length !== engine.voices.length
      || !Array.isArray(source.icsShadow)
      || source.icsShadow.length !== engine.icsShadow.length) {
    throw new TypeError('sound runtime: state.chain.engine has the wrong voice count');
  }
  engine.allocStart = source.allocStart;
  for (let i = 0; i < engine.voices.length; i++) {
    restorePrimitives(`state.chain.engine.voices[${i}]`, engine.voices[i], source.voices[i]);
    engine.icsShadow[i].set(byteArray(
      `state.chain.engine.icsShadow[${i}]`, source.icsShadow[i], engine.icsShadow[i].length,
    ));
  }
}

function sequencerSnapshot(sequencer) {
  if (!sequencer) return null;
  return {
    state: snapshotPrimitives(sequencer),
    tracks: sequencer.tracks.map((track) => ({
      state: snapshotPrimitives(track),
      raw: Array.from(track.raw),
      slot: snapshotPrimitives(track.slot),
    })),
  };
}

function restoreSequencer(sequencer, source) {
  if (!sequencer || !source) {
    if (sequencer !== null || source !== null) {
      throw new TypeError('sound runtime: state.chain.sequencer shape mismatch');
    }
    return;
  }
  object('state.chain.sequencer', source);
  restorePrimitives('state.chain.sequencer.state', sequencer, source.state);
  if (!Array.isArray(source.tracks) || source.tracks.length !== sequencer.tracks.length) {
    throw new TypeError('sound runtime: state.chain.sequencer has the wrong track count');
  }
  if (sequencer.cueId >= 0) {
    if (sequencer.cueId >= sequencer.cues.length) {
      throw new RangeError('sound runtime: state.chain.sequencer cue is outside its score group');
    }
    sequencer.cue = sequencer.cues[sequencer.cueId];
  } else {
    sequencer.cue = null;
  }
  for (let i = 0; i < sequencer.tracks.length; i++) {
    const track = sequencer.tracks[i];
    const saved = source.tracks[i];
    object(`state.chain.sequencer.tracks[${i}]`, saved);
    restorePrimitives(`state.chain.sequencer.tracks[${i}].state`, track, saved.state);
    track.raw.set(byteArray(
      `state.chain.sequencer.tracks[${i}].raw`, saved.raw, track.raw.length,
    ));
    restorePrimitives(`state.chain.sequencer.tracks[${i}].slot`, track.slot, saved.slot);
    if (!sequencer.cue || track.streamStart === 0) {
      track.stream = Object.freeze([]);
    } else {
      const streamIndex = sequencer.cue.noteStreamAddrs.indexOf(track.streamStart);
      if (streamIndex < 0) {
        throw new Error(`sound runtime: state track ${i} stream is outside cue ${sequencer.cueId}`);
      }
      track.stream = sequencer.cue.noteStreams[streamIndex];
    }
    if (track.streamPos < 0 || track.streamPos > track.stream.length) {
      throw new RangeError(`sound runtime: state track ${i} stream position is out of range`);
    }
  }
}

/**
 * Explicit timing boundary: completed oscillator frames are serviced before
 * the next native frame. The listing proves the IRQV/keyoff sequence but not
 * its exact Z80-cycle latency, so callers must opt into this named mechanic.
 */
export class SoundRuntime {
  constructor(driverParams, score, sampleMap,
      { endpointPolicy, panPolicy, irqTimingPolicy } = {}) {
    if (!driverParams || typeof driverParams.sfx !== 'function') {
      throw new Error('sound runtime requires validated driver parameters');
    }
    if (!score || !Array.isArray(score.groups) || score.groups.length !== 7) {
      throw new Error('sound runtime requires the validated seven-group BGM score');
    }
    if (irqTimingPolicy !== IRQ_TIMING_POLICY.AFTER_NATIVE_FRAME) {
      throw new Error('sound runtime requires explicit irqTimingPolicy "after-native-frame"');
    }
    this.irqTimingPolicy = irqTimingPolicy;
    this.score = score;
    this.scoreGroup = 0;
    this.chain = new SoundChain(driverParams, score.groups[0].cues);
    this.core = new Ics2115Core(sampleMap, { endpointPolicy, panPolicy });
    this.frameCount = 0;
    this.irqCount = 0;
    // `$13D4` maps `$616C` through the preset table at `$4376`; timer scale is
    // `$94`. The ICS period is `((scale&31)+1)*(preset+1) << (4+scale>>>5)`.
    // Stage `$87 -> $74` is 628,992 chip clocks (53.846153... Hz). Keep that
    // clock rational and independent of the 15625/264 Hz logic frame.
    this.timerClockAcc = 0;
    this.timerIrqCount = 0;
    this.timerHoldFrames = 0;
    this.pendingDoors = [];
    this.lastFrame = Object.freeze({ frame: -1, door: null,
      doors: Object.freeze([]), nativeFrames: 0,
      registerLog: Object.freeze([]), irqs: Object.freeze([]) });
  }

  get outLen() { return this.core.outLen; }
  get sourceRate() { return this.core.sourceRate; }
  get channels() { return this.core.channels; }

  selectScoreGroup(group) {
    if (!Number.isInteger(group) || group < 0 || group >= this.score.groups.length) {
      throw new RangeError(`sound runtime: score group ${group} is outside 0..6`);
    }
    this.scoreGroup = group;
    this.chain.selectScoreGroup(this.score.groups[group].cues);
  }

  command(input) {
    const door = compactDoor(input, this.frameCount);
    const chain = this.chain;
    const message = chain.enqueueDoor(door);
    this.pendingDoors.push(message);

    // `$0592` consumes a second complete queue record. Preserve command $0E at
    // the FIFO head until its payload arrives rather than manufacturing bytes.
    const head = chain.queue.peek();
    if (!(head?.cmd === 0x0e && chain.queue.length === 1)) chain.runMainLoop();
    return message;
  }

  tick(emit = true) {
    const chain = this.chain;
    let timerTicks = 0;
    if (this.timerHoldFrames > 0) this.timerHoldFrames--;
    else {
      const timer = timerThreshold(chain);
      this.timerClockAcc += ICS_CLOCK * LOGIC_RATE_DEN;
      while (this.timerClockAcc >= timer.threshold) {
        this.timerClockAcc -= timer.threshold;
        const beforeRate = chain.sequencer?.raw616c ?? timer.requestedRate;
        chain.tick(false);
        timerTicks++;
        this.timerIrqCount++;
        // `$13C1->$13D4->$0EE7` reprograms timer 0 when handler 15 changes
        // `$616C`. The new preset restarts the timer period; carrying the old
        // fractional remainder makes every later score event one frame early.
        if ((chain.sequencer?.raw616c ?? beforeRate) !== beforeRate) {
          this.timerClockAcc = 0;
        }
      }
    }

    const initialRows = chain.rf.regLog.slice();
    const irqs = [];
    const nativeFrames = this.core.frame(initialRows, emit, (nativeFrame) => {
      let guard = 0;
      while (this.core.status() & 0x02) {
        if (++guard > 32) throw new Error('sound runtime: oscillator IRQ did not clear');
        const irqv = this.core.readIrqv();
        if (irqv === null) throw new Error('sound runtime: status asserted without IRQV');
        const voice = irqv & 0x1f;
        const rowStart = chain.rf.regLog.length;
        if (!chain.engine.releaseVoiceIfBusy(voice)) {
          throw new Error(`sound runtime: IRQV voice ${voice} has no live allocator binding`);
        }
        const rows = chain.rf.regLog.slice(rowStart);
        this.core.applyLog(rows);
        irqs.push(Object.freeze({ nativeFrame, irqv, voice,
          registerLog: Object.freeze(rows.slice()) }));
        this.irqCount++;
      }
    });

    const doors = Object.freeze(this.pendingDoors.slice());
    const registerLog = Object.freeze(chain.rf.regLog.slice());
    chain.rf.regLog.length = 0;
    chain.rf.resetFrame();
    this.pendingDoors.length = 0;
    this.lastFrame = Object.freeze({ frame: this.frameCount,
      door: doors.at(-1) ?? null, doors, nativeFrames, timerTicks,
      registerLog, irqs: Object.freeze(irqs) });
    this.frameCount++;
    return nativeFrames;
  }

  frame(input, emit = true) {
    if (!(input instanceof Uint8Array)) {
      throw new TypeError('sound runtime frame input must be a Uint8Array');
    }
    if (input.length !== 0 && input.length !== 4) {
      throw new RangeError(`sound runtime frame input must contain 0 or 4 bytes, got ${input.length}`);
    }
    if (input.length !== 0) this.command(input);
    return this.tick(emit);
  }

  stateSnapshot() {
    return {
      format: 'ddpdoj.sound/v1',
      scoreGroup: this.scoreGroup,
      frameCount: this.frameCount,
      irqCount: this.irqCount,
      timerClockAcc: this.timerClockAcc,
      timerIrqCount: this.timerIrqCount,
      timerHoldFrames: this.timerHoldFrames,
      pendingDoors: this.pendingDoors.map(messageSnapshot),
      chain: {
        state: snapshotPrimitives(this.chain.state),
        doorCount: this.chain.doorCount,
        keyonCount: this.chain.keyonCount,
        queue: this.chain.queue.msgs.map(messageSnapshot),
        rf: registerFileSnapshot(this.chain.rf),
        engine: engineSnapshot(this.chain.engine),
        sequencer: sequencerSnapshot(this.chain.sequencer),
      },
      core: this.core.stateSnapshot(),
    };
  }

  restoreState(snapshot) {
    object('state snapshot', snapshot);
    if (snapshot.format !== 'ddpdoj.sound/v1') {
      throw new Error(`sound runtime: unsupported state format ${String(snapshot.format)}`);
    }
    if (!Number.isInteger(snapshot.scoreGroup)
        || snapshot.scoreGroup < 0 || snapshot.scoreGroup >= this.score.groups.length) {
      throw new RangeError('sound runtime: state score group is outside 0..6');
    }
    for (const key of [
      'frameCount', 'irqCount', 'timerClockAcc', 'timerIrqCount',
    ]) {
      if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) {
        throw new TypeError(`sound runtime: state ${key} must be a non-negative safe integer`);
      }
    }
    if (!Number.isInteger(snapshot.timerHoldFrames)
        || snapshot.timerHoldFrames < 0 || snapshot.timerHoldFrames > 1) {
      throw new RangeError('sound runtime: state timerHoldFrames must be zero or one');
    }
    const chain = object('state.chain', snapshot.chain);
    this.selectScoreGroup(snapshot.scoreGroup);
    restorePrimitives('state.chain.state', this.chain.state, chain.state);
    for (const key of ['doorCount', 'keyonCount']) {
      if (!Number.isSafeInteger(chain[key]) || chain[key] < 0) {
        throw new TypeError(`sound runtime: state.chain.${key} must be non-negative`);
      }
      this.chain[key] = chain[key];
    }
    this.chain.queue.msgs = restoreMessages('state.chain.queue', chain.queue, 80);
    restoreRegisterFile(this.chain.rf, chain.rf);
    restoreEngine(this.chain.engine, chain.engine);
    restoreSequencer(this.chain.sequencer, chain.sequencer);
    const { threshold } = timerThreshold(this.chain);
    if (snapshot.timerClockAcc >= threshold) {
      throw new RangeError(
        `sound runtime: state timerClockAcc must be below its ${threshold} clock threshold`,
      );
    }
    this.core.restoreState(snapshot.core);
    this.scoreGroup = snapshot.scoreGroup;
    this.frameCount = snapshot.frameCount;
    this.irqCount = snapshot.irqCount;
    this.timerClockAcc = snapshot.timerClockAcc;
    this.timerIrqCount = snapshot.timerIrqCount;
    this.timerHoldFrames = snapshot.timerHoldFrames;
    this.pendingDoors = restoreMessages('state.pendingDoors', snapshot.pendingDoors, 80);
    this.lastFrame = Object.freeze({ frame: this.frameCount - 1, door: null,
      doors: Object.freeze([]), nativeFrames: 0, timerTicks: 0,
      registerLog: Object.freeze([]), irqs: Object.freeze([]) });
    return this;
  }

  drain(n, dests) { return this.core.drain(n, dests); }
}

/** Strictly rehydrate every deferred asset before constructing the runtime. */
export function soundRuntimeFromAssets(assets, policies) {
  object('assets', assets);
  for (const key of ['driverParams', 'bgmScore', 'sampleIndex', 'sampleShard']) {
    if (!(key in assets)) throw new Error(`sound runtime: missing asset ${key}`);
  }
  if (!(assets.sampleShard instanceof Uint8Array)) {
    throw new TypeError('sound runtime: sampleShard must be a Uint8Array');
  }
  const params = driverParamsFromJson(assets.driverParams);
  const score = scoreFromJson(assets.bgmScore);
  const index = jsonValue('sampleIndex', assets.sampleIndex);
  if (index.coverage !== 'all-live-descriptors'
      || index.descriptorIntervals !== 228 || index.fragmentCount !== 6
      || index.shardBytes !== 3_612_873) {
    throw new Error('sound runtime: sample index is not the W158 complete static '
      + 'command coverage (228 descriptor intervals, 6 fragments, 3612873 bytes)');
  }
  const sampleMap = new IcsSampleMap(index, assets.sampleShard);
  return new SoundRuntime(params, score, sampleMap, policies);
}

export function soundRuntimeFromSnapshot(assets, policies, snapshot) {
  return soundRuntimeFromAssets(assets, policies).restoreState(snapshot);
}

/**
 * Reconstruct the live sound state omitted by the measured Stage 1 launch seed.
 * `$25D5C2` posts `$28CB9C`; the captured door is type $12/id 0 at lf 1562,
 * vf 1597. Sound advances once per video frame, including cartridge slowdown.
 * Calls through the video frame before `seedVideoFrame` use emit=false, leaving
 * no stale PCM for a later browser gesture. Arbitrary replay files use their
 * serialized sound snapshot instead of this Stage 1-only reconstruction.
 */
export function soundRuntimeFromStage1Seed(assets, policies, seedFrame, seedVideoFrame) {
  if (!Number.isInteger(seedFrame) || seedFrame < 0) {
    throw new TypeError('stage-1 sound seed logic frame must be a non-negative integer');
  }
  if (!Number.isInteger(seedVideoFrame) || seedVideoFrame < 0) {
    throw new TypeError('stage-1 sound seed video frame must be a non-negative integer');
  }
  const runtime = soundRuntimeFromAssets(assets, policies);
  const S = STAGE1_SEED_SOUND;
  if (seedFrame <= S.startFrame) return runtime;
  const ticks = seedVideoFrame - S.startVideoFrame;
  if (ticks < 1) {
    throw new RangeError('stage-1 sound seed video frame precedes its logic-frame cue');
  }
  if (ticks > S.maxPreRollTicks) {
    throw new RangeError('stage-1 sound seed is outside the bounded Stage 1 pre-roll window');
  }
  runtime.selectScoreGroup(1);
  // The captured NMI lands after timer service at lf1562; `$28B884` finishes
  // during the next sound tick and the first group-1 event batch follows it.
  runtime.timerHoldFrames = 1;
  runtime.command(Uint8Array.from(S.startDoor));
  for (let tick = 0; tick < ticks; tick++) runtime.tick(false);
  return runtime;
}
