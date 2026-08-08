// POLICY-NEUTRAL LIVE SOUND RUNTIME -- W156.
//
// Game supplies exactly zero or four bytes per logic frame. This object is the
// sole owner of Layer 3 scheduling, Layer 2 register emission, native 33,075 Hz
// advancement, oscillator IRQ feedback, and stereo buffering. It implements
// shared/audio.js's chip contract directly. The browser constructs exactly one
// object when deferred assets arrive, advances it silently before gesture, and
// later attaches that same object to AudioOut. Game supplies only frame inputs.

import { SoundChain } from './dispatch.js';
import { driverParamsFromJson } from './driverparams.js';
import { scoreFromJson } from './bgmscore.js';
import { ICS_CLOCK, Ics2115Core, IcsSampleMap,
  LOGIC_RATE_DEN, LOGIC_RATE_NUM } from './ics2115.js';

export const STAGE1_SEED_SOUND = Object.freeze({
  startFrame: 1562,
  startLeaf: 0x28cb9c,
  startDoor: Object.freeze([0x12, 0xeb, 0x00, 0x00]),
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

function compactDoor(input, lf) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('sound runtime frame input must be a Uint8Array');
  }
  if (input.length === 0) return null;
  if (input.length !== 4) {
    throw new RangeError(`sound runtime frame input must contain 0 or 4 bytes, got ${input.length}`);
  }
  return {
    lf,
    type: input[0], pan: input[1], id: input[2],
    chan: input[3], packedChannel: input[3],
  };
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
    this.lastFrame = Object.freeze({ frame: -1, door: null,
      nativeFrames: 0, registerLog: Object.freeze([]), irqs: Object.freeze([]) });
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

  frame(input, emit = true) {
    const door = compactDoor(input, this.frameCount);
    const chain = this.chain;
    chain.rf.resetFrame();
    const message = door ? chain.enqueueDoor(door) : null;

    // `$0592` consumes a second complete queue record. Game can deliver only
    // one door per logic frame, so preserve the command at the FIFO head until
    // its payload arrives rather than manufacturing two payload bytes.
    const head = chain.queue.peek();
    if (!(head?.cmd === 0x0e && chain.queue.length === 1)) chain.runMainLoop();
    let timerTicks = 0;
    if (this.timerHoldFrames > 0) this.timerHoldFrames--;
    else {
      const requestedRate = chain.sequencer?.raw616c ?? 0x7d;
      const preset = chain.driverParams.timer0Preset(requestedRate);
      const scale = 0x94;
      const period = ((scale & 0x1f) + 1) * (preset + 1)
        * (2 ** (4 + (scale >>> 5)));
      this.timerClockAcc += ICS_CLOCK * LOGIC_RATE_DEN;
      const threshold = period * LOGIC_RATE_NUM;
      while (this.timerClockAcc >= threshold) {
        this.timerClockAcc -= threshold;
        const beforeRate = chain.sequencer?.raw616c ?? requestedRate;
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

    const registerLog = Object.freeze(chain.rf.regLog.slice());
    chain.rf.regLog.length = 0;
    this.lastFrame = Object.freeze({ frame: this.frameCount, door: message,
      nativeFrames, timerTicks, registerLog, irqs: Object.freeze(irqs) });
    this.frameCount++;
    return nativeFrames;
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

/**
 * Reconstruct the live sound state omitted by the mid-stage main-RAM seed.
 * `$25D5C2` posts `$28CB9C`; the captured door is type $12/id 0 at lf 1562.
 * Calls through the frame before `seedFrame` advance with emit=false, leaving
 * no stale PCM for a later browser gesture.
 */
export function soundRuntimeFromStage1Seed(assets, policies, seedFrame) {
  if (!Number.isInteger(seedFrame) || seedFrame < 0) {
    throw new TypeError('stage-1 sound seed frame must be a non-negative integer');
  }
  const runtime = soundRuntimeFromAssets(assets, policies);
  const S = STAGE1_SEED_SOUND;
  if (seedFrame <= S.startFrame) return runtime;
  runtime.selectScoreGroup(1);
  // The captured NMI lands after timer service at lf1562; `$28B884` finishes
  // during lf1563 and the first group-1 event batch fires at lf1564.
  runtime.timerHoldFrames = 1;
  runtime.frame(Uint8Array.from(S.startDoor), false);
  for (let lf = S.startFrame + 1; lf < seedFrame; lf++) {
    runtime.frame(new Uint8Array(0), false);
  }
  return runtime;
}
